import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { RetirementPreview } from "../retirement/schema";
import type { PortfolioDocument } from "../portfolios/schema";
import type { AssumptionDocument } from "../assumptions/schema";
import { prepareRetirement } from "../retirement/prepare";
const D = Prisma.Decimal.clone({ precision: 48 });
const amount = z.string().nullable();
export const pensionImpactSchema = z.object({ status: z.enum(["READY", "INCOMPLETE"]), profileRevision: z.number().int(), valuationDate: z.string(), endMonth: z.string(), currency: z.literal("VND"), basis: z.literal("SAME_PROFILE_SELECTION_AND_PUBLISHED_DOCUMENTS"), requiredFundWithPension: amount, requiredFundWithoutPension: amount, fundReduction: amount, issues: z.array(z.object({ path: z.string(), code: z.string() })), policyVersionId: z.string(), policyHash: z.string(), assumptionVersionId: z.string(), assumptionHash: z.string() }).strict();
/** Both targets use the canonical monthly engine with the same dates, assets,
 * expenses, contribution selection and published documents. No saved plan or
 * actual-transaction anchor is changed or treated as this profile preview. */
export function pensionImpact(profile: ProfileV2, input: RetirementPreview, policy: PortfolioDocument, assumptions: AssumptionDocument) {
  const empty = { requiredFundWithPension: null, requiredFundWithoutPension: null, fundReduction: null };
  if (!profile.pension || profile.pension.status === "UNKNOWN") return { status: "INCOMPLETE" as const, ...empty, issues: [{ path: "pension", code: "PENSION_NOT_INCLUDED" }] };
  if (input.whatIf) return { status: "INCOMPLETE" as const, ...empty, issues: [{ path: "whatIf", code: "PROFILE_SELECTION_REQUIRED" }] };
  const link = profile.pension.status === "KNOWN" ? profile.pension.linkedIncomeId : undefined;
  const selection = { ...input, retirementIncomeIds: input.retirementIncomeIds.filter(id => id !== link) };
  const withPension = prepareRetirement(profile, selection, policy, assumptions);
  const withoutProfile: ProfileV2 = { ...profile, pension: { status: "NOT_APPLICABLE", reason: "Read-only comparison without pension" }, personal: { ...profile.personal, pensionStartMonth: { status: "NOT_APPLICABLE", reason: "Read-only comparison without pension" } }, income: profile.income.status === "KNOWN" ? { ...profile.income, entries: profile.income.entries.filter(row => row.id !== link) } : profile.income };
  const withoutPension = prepareRetirement(withoutProfile, selection, policy, assumptions);
  if (withPension.status !== "READY" || withoutPension.status !== "READY") {
    const issues = [...withPension.issues, ...withoutPension.issues].filter((issue, index, rows) => rows.findIndex(row => row.path === issue.path && row.code === issue.code) === index);
    return { status: "INCOMPLETE" as const, ...empty, issues };
  }
  const withAmount = withPension.calculation.summary.atRetirement.requiredFund, withoutAmount = withoutPension.calculation.summary.atRetirement.requiredFund;
  return { status: "READY" as const, requiredFundWithPension: withAmount, requiredFundWithoutPension: withoutAmount, fundReduction: new D(withoutAmount).minus(withAmount).toFixed(), issues: [] };
}
