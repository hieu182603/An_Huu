import { z } from "zod";
import { RetirementDecimal as D } from "../retirement/engine";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { PortfolioDocument } from "../portfolios/schema";
import type { CapitalSeparation } from "./separation";

const amount = z.string().nullable();
export const lossConstraintSchema = z.object({
  informationalOnly: z.literal(true), status: z.enum(["WITHIN_LIMIT", "REDUCE_RISK", "NOT_FEASIBLE", "REVIEW_REQUIRED"]),
  message: z.string(), issues: z.array(z.string()), growthCapital: amount, lossAmount: amount,
  lossPercentOfGrowth: amount, lossPercentOfInvestableAssets: amount, allowedLossAmount: amount,
  exceedsTolerance: z.boolean().nullable(), maxEquityWeightPercent: amount,
  proposedLossAmount: amount, proposedAllocations: z.array(z.object({ assetClass: z.string(), weightPercent: z.string() })),
}).strict();
export type LossConstraint = z.infer<typeof lossConstraintSchema>;
export function assessLossConstraint(capital: CapitalSeparation, profile: ProfileV2, policy: PortfolioDocument,
  holdings: Array<{ assetClass: string; startWeightPercent: string }> = []): LossConstraint {
  const result: LossConstraint = { informationalOnly: true, status: "REVIEW_REQUIRED", message: "Cần rà soát dữ liệu ràng buộc lỗ.", issues: [],
    growthCapital: capital.growthCapital, lossAmount: null, lossPercentOfGrowth: null, lossPercentOfInvestableAssets: null,
    allowedLossAmount: null, exceedsTolerance: null, maxEquityWeightPercent: null, proposedLossAmount: null, proposedAllocations: [] };
  const stress = policy.schemaVersion === 2 ? policy.lossStress : undefined;
  if (!stress) result.issues.push("APPROVED_LOSS_STRESS_REQUIRED");
  if (capital.growthCapital === null || new D(capital.growthCapital).lt(0)) result.issues.push("NONNEGATIVE_GROWTH_CAPITAL_REQUIRED");
  if (!holdings.length) result.issues.push("APPLIED_ALLOCATION_REQUIRED");
  if (result.issues.length || !stress) return result;
  if (new Set(stress.shocks.map(s => s.assetClass)).size !== stress.shocks.length ||
    holdings.some(h => !stress.shocks.some(s => s.assetClass === h.assetClass))) {
    result.issues.push("STRESS_ASSET_NOT_COVERED"); return result;
  }
  const growth = new D(capital.growthCapital!);
  const lossRate = (code: string) => new D(stress.shocks.find(s => s.assetClass === code)!.percent).neg().div(100);
  const lossPercent = holdings.reduce((sum, h) => sum.plus(new D(h.startWeightPercent).mul(lossRate(h.assetClass))), new D(0));
  const loss = growth.mul(lossPercent).div(100);
  result.lossAmount = loss.toFixed(); result.lossPercentOfGrowth = lossPercent.toFixed();
  result.lossPercentOfInvestableAssets = capital.investableLiquidAssets !== null && new D(capital.investableLiquidAssets).gt(0)
    ? loss.div(capital.investableLiquidAssets).mul(100).toFixed() : null;
  const tolerance = profile.lossTolerance;
  if (tolerance?.percent?.status !== "KNOWN" || tolerance.amountVnd?.status !== "KNOWN") {
    result.issues.push("LOSS_TOLERANCE_REQUIRED"); return result;
  }
  const allowed = D.min(growth.mul(tolerance.percent.value).div(100), tolerance.amountVnd.value);
  result.allowedLossAmount = allowed.toFixed(); result.exceedsTolerance = loss.gt(allowed);
  const equity = new D(holdings.find(h => h.assetClass === stress.equityAssetClass)?.startWeightPercent ?? "0");
  if (!stress.shocks.some(s => s.assetClass === stress.equityAssetClass) || !stress.shocks.some(s => s.assetClass === stress.depositAssetClass)) {
    result.issues.push("STRESS_ASSET_NOT_COVERED"); return result;
  }
  const reductionPerPoint = growth.mul(lossRate(stress.equityAssetClass).minus(lossRate(stress.depositAssetClass))).div(100);
  if (result.exceedsTolerance && reductionPerPoint.lte(0)) { result.issues.push("STRESS_REDUCTION_NOT_POSSIBLE"); return result; }
  const reduce = result.exceedsTolerance ? D.min(equity, loss.minus(allowed).div(reductionPerPoint)) : new D(0);
  const proposedLoss = loss.minus(reduce.mul(reductionPerPoint));
  const possible = proposedLoss.lte(allowed);
  result.maxEquityWeightPercent = possible ? equity.minus(reduce).toFixed() : null;
  result.proposedLossAmount = proposedLoss.toFixed();
  const weights = new Map(holdings.map(h => [h.assetClass, new D(h.startWeightPercent)]));
  weights.set(stress.equityAssetClass, equity.minus(reduce));
  weights.set(stress.depositAssetClass, (weights.get(stress.depositAssetClass) ?? new D(0)).plus(reduce));
  result.proposedAllocations = [...weights].map(([assetClass, weight]) => ({ assetClass, weightPercent: weight.toFixed() }));
  result.status = !result.exceedsTolerance ? "WITHIN_LIMIT" : possible ? "REDUCE_RISK" : "NOT_FEASIBLE";
  result.message = result.status === "WITHIN_LIMIT" ? "Mức lỗ trong giới hạn đã khai." : possible
    ? "Cần giảm rủi ro: giảm cổ phiếu và chuyển sang tiền gửi; danh mục chưa được thay đổi."
    : "Chưa khả thi: chuyển hết cổ phiếu sang tiền gửi vẫn vượt mức lỗ cho phép.";
  return result;
}
