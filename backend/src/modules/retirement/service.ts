import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors";
import { profileV2Schema } from "../profiles/schema-v2";
import { AssumptionsService } from "../assumptions/service";
import { PortfoliosService } from "../portfolios/service";
import { previewGuidance } from "../portfolios/guidance";
import { retirementPreviewSchema, RETIREMENT_MODEL, type RetirementPreview } from "./schema";
import { prepareRetirement } from "./prepare";
import { separateCapital, type CapitalSeparation } from "../capital/separation";
import { assessLossConstraint } from "../capital/loss-constraint";
import { essentialCoverage, adjustmentOptions, decisionExplanations } from "./preview-insights";
import { logPreviewCoverage } from "../../common/logger";
import type { ReforecastLineage } from "../actuals/lineage";
import type { z } from "zod";
import type { futureChangeSchema, sourceChangeSchema } from "../actuals/schema";

export type RetirementResult = ReturnType<RetirementService["evaluate"]> & {
  capitalSeparation?: CapitalSeparation;
  reforecast?: ReforecastLineage;
  futureChanges?: z.infer<typeof futureChangeSchema>[];
  sourceChanges?: z.infer<typeof sourceChangeSchema>[];
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class RetirementService {
  constructor(private db: PrismaClient) {}
  async preview(userId: string, command: RetirementPreview) {
    const input = retirementPreviewSchema.parse(command);
    // Read-only: one profile row plus immutable PUBLISHED documents, so a
    // SERIALIZABLE transaction adds round trips without adding consistency.
    // Saving re-captures inside the write transaction and checks inputHash.
    const snapshot = await this.capture(this.db, userId, input);
    const result = this.evaluate(snapshot, input);
    logPreviewCoverage(result.issues, "/api/v1/me/retirement/preview");
    // HTTP preview only: evaluate is also used for persistence and replay. Keep
    // its shape and hash unchanged, including old v2/v3/v4 snapshots.
    const profile = input.whatIf?.assetValues ? { ...snapshot.profile, assets: snapshot.profile.assets.status === "KNOWN"
      ? { ...snapshot.profile.assets, entries: snapshot.profile.assets.entries.map(asset => {
        const override = input.whatIf?.assetValues?.find(v => v.assetId === asset.id);
        return override ? { ...asset, value: { status: "KNOWN" as const, value: override.value } } : asset;
      }) } : snapshot.profile.assets } : snapshot.profile;
    const capitalSeparation = separateCapital(profile, snapshot.assumptions.data);
    const lossConstraint = assessLossConstraint(capitalSeparation, profile, snapshot.policy.data, result.calculation?.marketRows[0]?.holdings);
    const essential = essentialCoverage(profile, input, result);
    const adjustments = adjustmentOptions(profile, input, snapshot.policy.data, snapshot.assumptions.data, result);
    const supplements = { capitalSeparation, lossConstraint, essentialCoverage: essential, adjustmentOptions: adjustments,
      decisionExplanations: decisionExplanations(profile, capitalSeparation, lossConstraint, result) };
    if (result.status === "INCOMPLETE") return { ...result, ...supplements };
    // Enrich only this read response; numerical replay payloads remain untouched.
    const calculation = { ...result.calculation,
      summary: { ...result.calculation.summary, essentialShortfall: essential.essentialShortfall, firstEssentialShortfallMonth: essential.firstEssentialShortfallMonth },
      rows: result.calculation.rows.map((row, i) => ({ ...row, essentialShortfall: essential.rows[i].essentialShortfall, otherShortfall: essential.rows[i].otherShortfall })) };
    return { ...result, calculation, ...supplements };
  }
  async capture(tx: Prisma.TransactionClient, userId: string, input: RetirementPreview) {
      // Policy/assumption versions are immutable once PUBLISHED (and cached), so
      // reading them alongside the profile cannot mix in a newer version.
      const loadDocuments = async () => {
        const policy = await new PortfoliosService(tx as PrismaClient).get(input.policyVersionId, true);
        return { policy, assumptions: await new AssumptionsService(tx as PrismaClient).get(policy.data.assumptionVersionId, true) };
      };
      const [stored, documents] = await Promise.all([tx.financialProfile.findUnique({ where: { userId } }), loadDocuments().then(value => ({ value }), error => ({ error }))]);
      if (!stored) throw new AppError(404, "PROFILE_REQUIRED", "Chưa có hồ sơ tài chính.");
      if (stored.revision !== input.expectedProfileRevision) throw new AppError(409, "REVISION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trước khi tính.");
      if (stored.schemaVersion !== 2) throw new AppError(409, "PROFILE_V2_REQUIRED", "Cần rà soát và xác nhận hồ sơ v2.");
      const parsed = profileV2Schema.safeParse(stored.profileData);
      if (!parsed.success) throw new AppError(409, "PROFILE_DATA_REVIEW_REQUIRED", "Hồ sơ đã lưu cần được rà soát.");
      // Profile errors keep precedence over policy errors, as before.
      if ("error" in documents) throw documents.error;
      const { policy, assumptions } = documents.value;
      if (policy.approval?.assumptionHash !== assumptions.documentHash)
        throw new AppError(409, "POLICY_REVIEW_REQUIRED", "Bộ giả định không khớp bản chính sách đã duyệt.");
      return { profile: parsed.data, revision: stored.revision, policy, assumptions };
  }
  evaluate(snapshot: Awaited<ReturnType<RetirementService["capture"]>>, input: RetirementPreview) {
    const prepared = prepareRetirement(snapshot.profile, input, snapshot.policy.data, snapshot.assumptions.data);
    const startMonth = snapshot.profile.valuationDate.slice(0, 7);
    const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
    // Only incomplete responses need help. READY previews are persisted and must
    // retain their existing snapshot/hash shape, including legacy reforecasts.
    const guidance = prepared.status === "INCOMPLETE" ? previewGuidance(snapshot.policy.data, snapshot.assumptions.data,
      { policyVersionId: input.policyVersionId, templateId: input.templateId, answers: input.answers,
        liquidityNeedMonths: input.liquidityNeedMonths, startMonth,
        horizonMonths: monthIndex(input.endMonth) - monthIndex(startMonth) + 1 }, prepared.issues) : undefined;
    return { ...prepared, modelVersion: RETIREMENT_MODEL as typeof RETIREMENT_MODEL | "retirement-monthly-v2", profileRevision: snapshot.revision,
      ...(guidance ? { guidance } : {}),
      valuationDate: snapshot.profile.valuationDate, currency: "VND",
      references: { profileHash: hash(snapshot.profile), policyVersionId: snapshot.policy.id, policyVersion: snapshot.policy.version,
        policyHash: snapshot.policy.documentHash, assumptionVersionId: snapshot.assumptions.id,
        assumptionVersion: snapshot.assumptions.version, assumptionHash: snapshot.assumptions.documentHash },
      inputHash: hash({ profile: snapshot.profile, input, policyHash: snapshot.policy.documentHash, assumptionHash: snapshot.assumptions.documentHash }),
      sources: snapshot.assumptions.data.sources, selection: input,
    };
  }
}
