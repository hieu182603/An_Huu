import { z } from "zod";
import { addMonths } from "../../common/calendar";
import { profileMonthlyCashflow } from "../profiles/cashflow";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { AssumptionDocument } from "../assumptions/schema";
import type { PortfolioDocument } from "../portfolios/schema";
import type { CapitalSeparation } from "../capital/separation";
import type { LossConstraint } from "../capital/loss-constraint";
import { RetirementDecimal as D } from "./engine";
import { prepareRetirement } from "./prepare";
import { portfolioPreviewCache } from "../portfolios/engine";
import type { RetirementPreview } from "./schema";

type Prepared = ReturnType<typeof prepareRetirement>;
const nullable = z.string().nullable();
export const essentialCoverageSchema = z.object({
  basis: z.literal("ESSENTIAL_FIRST_CLASSIFICATION_ONLY"), essentialShortfall: nullable, firstEssentialShortfallMonth: nullable,
  rows: z.array(z.object({ month: z.string(), essentialExpense: nullable, essentialShortfall: nullable, otherShortfall: nullable })),
}).strict();
export function essentialCoverage(profile: ProfileV2, input: RetirementPreview, prepared: Prepared): z.infer<typeof essentialCoverageSchema> {
  const result: z.infer<typeof essentialCoverageSchema> = { basis: "ESSENTIAL_FIRST_CLASSIFICATION_ONLY", essentialShortfall: null, firstEssentialShortfallMonth: null, rows: [] };
  if (!prepared.calculation) return result;
  let total = new D(0), complete = true;
  for (const row of prepared.calculation.rows) {
    const retired = row.phase === "RETIREMENT";
    const expenses = profile.expenses.status === "KNOWN" ? { ...profile.expenses, entries: profile.expenses.entries.filter(e =>
      e.category === "ESSENTIAL" && (!retired || input.retirementAdditionalExpenseIds.includes(e.id))) } : profile.expenses;
    const essential = profileMonthlyCashflow({ income: { status: "KNOWN", entries: [] }, expenses }, row.month).expenses;
    if (essential === null) { complete = false; result.rows.push({ month: row.month, essentialExpense: null, essentialShortfall: null, otherShortfall: null }); continue; }
    const expense = essential.plus(retired ? row.livingExpense : 0);
    const availableFund = new D(row.fundedClosingBalance).plus(row.withdrawal).minus(row.unfundedWithdrawal);
    const deficit = D.min(row.unfundedWithdrawal, D.max(0, expense.minus(row.income).minus(row.pension).minus(availableFund)));
    total = total.plus(deficit);
    if (deficit.gt(0)) result.firstEssentialShortfallMonth ??= row.month;
    result.rows.push({ month: row.month, essentialExpense: expense.toFixed(), essentialShortfall: deficit.toFixed(),
      otherShortfall: new D(row.unfundedWithdrawal).minus(deficit).toFixed() });
  }
  result.essentialShortfall = complete ? total.toFixed() : null;
  return result;
}

export const adjustmentOptionsSchema = z.object({
  status: z.enum(["NOT_NEEDED", "READY", "NOT_FEASIBLE", "REVIEW_REQUIRED"]),
  requiredMonthlyContribution: nullable, contributionWithinCapacity: z.boolean().nullable(),
  earliestFeasibleRetirementMonth: nullable, feasibleRetirementCandidate: nullable,
  retirementSearchStatus: z.enum(["NOT_NEEDED", "FOUND", "NOT_FEASIBLE", "REVIEW_REQUIRED"]),
  maximumFeasibleMonthlyExpenseToday: nullable,
  expenseSearchStatus: z.enum(["NOT_NEEDED", "FOUND", "NOT_FEASIBLE", "REVIEW_REQUIRED"]),
  endMonth: z.string(), evaluations: z.number().int(), issues: z.array(z.string()),
}).strict();
export const isFunded = (p: Prepared) => p.calculation !== null &&
  new D(p.calculation.summary.unfundedWithdrawals).isZero() && new D(p.calculation.summary.terminalTargetShortfall).isZero() &&
  p.calculation.summary.firstBudgetShortfallMonth === null;

/** Search limits are computational limits, not financial thresholds. Dates and
 * rates remain pinned. Bisection locates a candidate, then earlier months are
 * checked: dated cashflows/glide paths need not have a monotone success curve. */
/** Retirement-date evaluations per search (binary search plus month-by-month
 * certification). Certifying an earliest date that is N months later costs about N
 * projections; at ~0.4 s each (2026-10 measurement) 180 covers 15 years and keeps a
 * whole search inside the 120 s preview worker limit. It was 64 (~5 years), which
 * young users' plans always exceeded. */
export const RETIREMENT_SEARCH_RUNS = 180;
export function adjustmentOptions(profile: ProfileV2, input: RetirementPreview, policy: PortfolioDocument,
  assumptions: AssumptionDocument, original: Prepared): z.infer<typeof adjustmentOptionsSchema> {
  const summary = original.calculation?.summary;
  const result: z.infer<typeof adjustmentOptionsSchema> = { status: "REVIEW_REQUIRED",
    requiredMonthlyContribution: summary?.requiredConstantMonthlyContribution ?? null,
    contributionWithinCapacity: summary?.requiredContributionWithinCapacity ?? null,
    earliestFeasibleRetirementMonth: null, feasibleRetirementCandidate: null, retirementSearchStatus: "REVIEW_REQUIRED",
    maximumFeasibleMonthlyExpenseToday: null, expenseSearchStatus: "REVIEW_REQUIRED", endMonth: input.endMonth, evaluations: 0, issues: [] };
  if (!summary) { result.issues.push("PROJECTION_REQUIRED"); return result; }
  if (isFunded(original)) { result.status = "NOT_NEEDED"; result.retirementSearchStatus = result.expenseSearchStatus = "NOT_NEEDED"; return result; }
  // Every run shares the pinned documents, so validation and base series are reused.
  const portfolioCache = portfolioPreviewCache();
  const run = (command: RetirementPreview) => {
    result.evaluations++;
    return prepareRetirement(profile, command, policy, assumptions, portfolioCache);
  };
  // Spending search is bounded by the failing requested amount; only downward
  // changes are offered. Keep the feasible lower endpoint and report cents.
  let low = new D(0), high = new D(input.monthlyExpenseToday);
  const zero = run({ ...input, monthlyExpenseToday: "0" });
  if (zero.status !== "READY") result.issues.push("EXPENSE_SEARCH_INPUTS_INCOMPLETE");
  else if (!isFunded(zero)) result.expenseSearchStatus = "NOT_FEASIBLE";
  else {
    for (let i = 0; i < 64 && high.minus(low).gt("0.01"); i++) {
      const mid = low.plus(high).div(2).toDecimalPlaces(2, D.ROUND_DOWN);
      if (mid.eq(low)) break;
      const p = run({ ...input, monthlyExpenseToday: mid.toFixed() });
      if (p.status !== "READY") { result.issues.push("EXPENSE_SEARCH_INPUTS_INCOMPLETE"); break; }
      if (isFunded(p)) low = mid; else high = mid;
    }
    result.maximumFeasibleMonthlyExpenseToday = low.toFixed();
    result.expenseSearchStatus = high.minus(low).lte("0.01") ? "FOUND" : "REVIEW_REQUIRED";
  }
  const monthIndex = (m: string) => +m.slice(0, 4) * 12 + +m.slice(5, 7);
  const start = summary.retirementMonth, last = monthIndex(input.endMonth) - monthIndex(start);
  const cache = new Map<number, boolean | null>([[0, false]]);
  let retirementRuns = 0, incomplete = false;
  const evaluateMonth = (index: number): boolean | null => {
    if (cache.has(index)) return cache.get(index)!;
    if (retirementRuns >= RETIREMENT_SEARCH_RUNS) return null;
    retirementRuns++;
    const p = run({ ...input, whatIf: { ...input.whatIf, retirementMonth: addMonths(start, index) } });
    const funded = p.status === "READY" ? isFunded(p) : null;
    incomplete ||= funded === null; cache.set(index, funded);
    return funded;
  };
  let left = 1, right = last, candidate: number | null = null;
  while (left <= right && retirementRuns < RETIREMENT_SEARCH_RUNS) {
    const mid = Math.floor((left + right) / 2), funded = evaluateMonth(mid);
    if (funded) { candidate = mid; right = mid - 1; } else left = mid + 1;
  }
  // Certify earliest (or absence), including any disconnected feasible island.
  let certified = true;
  for (let i = 1; i <= (candidate ?? last); i++) {
    const funded = evaluateMonth(i);
    if (funded === null) { certified = false; break; }
    if (funded) { candidate = i; break; }
  }
  result.feasibleRetirementCandidate = candidate === null ? null : addMonths(start, candidate);
  if (certified) {
    result.earliestFeasibleRetirementMonth = result.feasibleRetirementCandidate;
    result.retirementSearchStatus = candidate === null ? "NOT_FEASIBLE" : "FOUND";
  } else result.issues.push(incomplete ? "RETIREMENT_SEARCH_INPUTS_REVIEW_REQUIRED" : "RETIREMENT_SEARCH_LIMIT_REVIEW_REQUIRED");
  result.status = result.retirementSearchStatus === "REVIEW_REQUIRED" || result.expenseSearchStatus === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED"
    : result.retirementSearchStatus === "NOT_FEASIBLE" && result.expenseSearchStatus === "NOT_FEASIBLE" ? "NOT_FEASIBLE" : "READY";
  if (input.advisoryFee) result.issues.push("CONTRIBUTION_ESTIMATE_USES_CURRENT_FEE_SCHEDULE_REPREVIEW_REQUIRED");
  return result;
}

export const decisionExplanationSchema = z.object({ code: z.string(), parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])), text: z.string() }).strict();
export function decisionExplanations(profile: ProfileV2, capital: CapitalSeparation, loss: LossConstraint, prepared: Prepared) {
  const rows: z.infer<typeof decisionExplanationSchema>[] = [];
  const vnd = (value: string | null) => value === null ? "chưa xác định" : new Intl.NumberFormat("vi-VN").format(BigInt(new D(value).toFixed(0)));
  for (const goal of capital.goals.filter(g => g.treatment === "RESERVED")) {
    const label = profile.goals?.status === "KNOWN" ? profile.goals.entries.find(g => g.id === goal.id)?.label ?? "mục tiêu" : "mục tiêu";
    rows.push({ code: "GOAL_CAPITAL_RESERVED", parameters: { goalId: goal.id, dueMonth: goal.dueMonth, presentValue: goal.presentValue, futureAmount: goal.futureAmount },
      text: goal.presentValue === null ? `Chưa đủ dữ liệu để dành riêng vốn cho ${label} tháng ${goal.dueMonth}.`
        : `Bạn cần ${vnd(goal.futureAmount)} VND cho ${label} tháng ${goal.dueMonth}, nên ${vnd(goal.presentValue)} VND hôm nay được dành riêng.` });
  }
  rows.push({ code: "GROWTH_CAPITAL", parameters: { reserveMonths: capital.reserveMonths, reserve: capital.requiredEmergencyReserve, growthCapital: capital.growthCapital },
    text: capital.growthCapital === null ? "Chưa đủ dữ liệu để xác định phần vốn tăng trưởng."
      : `Sau dự phòng ${vnd(capital.requiredEmergencyReserve)} VND và mục tiêu gần hạn, phần vốn tăng trưởng còn ${vnd(capital.growthCapital)} VND.` });
  const calculation = prepared.calculation;
  if (calculation) {
    rows.push({ code: "PORTFOLIO_HORIZON", parameters: { retirementMonth: calculation.summary.retirementMonth, years: calculation.summary.accumulationMonths / 12,
      templateId: calculation.assessment.selectedTemplateId,
      startAllocations: JSON.stringify(calculation.marketRows[0].holdings.map(h => ({ assetClass: h.assetClass, weightPercent: h.startWeightPercent }))),
      endAllocations: JSON.stringify(calculation.marketRows.at(-1)!.holdings.map(h => ({ assetClass: h.assetClass, weightPercent: h.startWeightPercent }))) },
      text: `Phần vốn dài hạn có thời hạn ${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(calculation.summary.accumulationMonths / 12)} năm tới tháng nghỉ hưu ${calculation.summary.retirementMonth}; tỷ trọng theo lộ trình của chính sách đã ghim.` });
    rows.push({ code: isFunded(prepared) ? "PLAN_FUNDED" : "PLAN_NOT_FUNDED", parameters: { shortfall: calculation.summary.unfundedWithdrawals,
      requiredMonthlyContribution: calculation.summary.requiredConstantMonthlyContribution }, text: isFunded(prepared)
      ? "Kế hoạch đáp ứng dòng tiền trong mô phỏng xác định đến tháng kết thúc; đây không phải xác suất thành công."
      : "Kế hoạch chưa đáp ứng đầy đủ; hãy xem khoản góp cần, tháng nghỉ khả thi và mức chi hưu khả thi. Không nâng lợi suất để làm kế hoạch đạt." });
  }
  rows.push({ code: "LOSS_CONSTRAINT", parameters: { status: loss.status, lossAmount: loss.lossAmount, allowedLossAmount: loss.allowedLossAmount,
    maxEquityWeightPercent: loss.maxEquityWeightPercent }, text: loss.message });
  if (profile.employerConcentration || capital.warnings.some(w => w.code === "LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION"))
    rows.push({ code: "REVIEW_REQUIRED", parameters: { employerConcentration: !!profile.employerConcentration, liquidityNeeds: !!profile.liquidityNeeds },
      text: "Cần rà soát mức tập trung nơi làm việc và đối chiếu nhu cầu thanh khoản với mục tiêu; chưa có quy tắc được duyệt để tự điều chỉnh." });
  return rows;
}
