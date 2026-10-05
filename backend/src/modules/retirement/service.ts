import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors";
import { transaction } from "../../common/transaction";
import { profileV2Schema } from "../profiles/schema-v2";
import { AssumptionsService } from "../assumptions/service";
import { PortfoliosService } from "../portfolios/service";
import { retirementPreviewSchema, RETIREMENT_MODEL, type RetirementPreview } from "./schema";
import { prepareRetirement } from "./prepare";
import type { ReforecastLineage } from "../actuals/lineage";
import type { z } from "zod";
import type { futureChangeSchema, sourceChangeSchema } from "../actuals/schema";

export type RetirementResult = Awaited<ReturnType<RetirementService["preview"]>> & {
  reforecast?: ReforecastLineage;
  futureChanges?: z.infer<typeof futureChangeSchema>[];
  sourceChanges?: z.infer<typeof sourceChangeSchema>[];
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class RetirementService {
  constructor(private db: PrismaClient) {}
  async preview(userId: string, command: RetirementPreview) {
    const input = retirementPreviewSchema.parse(command);
    const snapshot = await transaction(this.db, tx => this.capture(tx, userId, input));
    return this.evaluate(snapshot, input);
  }
  async capture(tx: Prisma.TransactionClient, userId: string, input: RetirementPreview) {
      const stored = await tx.financialProfile.findUnique({ where: { userId } });
      if (!stored) throw new AppError(404, "PROFILE_REQUIRED", "Chưa có hồ sơ tài chính.");
      if (stored.revision !== input.expectedProfileRevision) throw new AppError(409, "REVISION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trước khi tính.");
      if (stored.schemaVersion !== 2) throw new AppError(409, "PROFILE_V2_REQUIRED", "Cần rà soát và xác nhận hồ sơ v2.");
      const parsed = profileV2Schema.safeParse(stored.profileData);
      if (!parsed.success) throw new AppError(409, "PROFILE_DATA_REVIEW_REQUIRED", "Hồ sơ đã lưu cần được rà soát.");
      // Read-only calls use the same transaction snapshot, not a newer version
      // fetched after reading the user's profile.
      const policy = await new PortfoliosService(tx as PrismaClient).get(input.policyVersionId, true);
      const assumptions = await new AssumptionsService(tx as PrismaClient).get(policy.data.assumptionVersionId, true);
      if (policy.approval?.assumptionHash !== assumptions.documentHash)
        throw new AppError(409, "POLICY_REVIEW_REQUIRED", "Bộ giả định không khớp bản chính sách đã duyệt.");
      return { profile: parsed.data, revision: stored.revision, policy, assumptions };
  }
  evaluate(snapshot: Awaited<ReturnType<RetirementService["capture"]>>, input: RetirementPreview) {
    const prepared = prepareRetirement(snapshot.profile, input, snapshot.policy.data, snapshot.assumptions.data);
    return { ...prepared, modelVersion: RETIREMENT_MODEL as typeof RETIREMENT_MODEL | "retirement-monthly-v2", profileRevision: snapshot.revision,
      valuationDate: snapshot.profile.valuationDate, currency: "VND",
      references: { profileHash: hash(snapshot.profile), policyVersionId: snapshot.policy.id, policyVersion: snapshot.policy.version,
        policyHash: snapshot.policy.documentHash, assumptionVersionId: snapshot.assumptions.id,
        assumptionVersion: snapshot.assumptions.version, assumptionHash: snapshot.assumptions.documentHash },
      inputHash: hash({ profile: snapshot.profile, input, policyHash: snapshot.policy.documentHash, assumptionHash: snapshot.assumptions.documentHash }),
      sources: snapshot.assumptions.data.sources, selection: input,
    };
  }
}
