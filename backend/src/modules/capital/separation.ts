import { z } from "zod";
import { addMonths } from "../../common/calendar";
import type { AssumptionDocument } from "../assumptions/schema";
import { AssumptionDecimal as D, normalizedAnnualReturn } from "../assumptions/series";
import { profileV2Schema, type ProfileV2 } from "../profiles/schema-v2";
import { profileV2Summary } from "../profiles/summary-v2";
import { profileMonthlyCashflow } from "../profiles/cashflow";

const decimal = z.string().regex(/^-?(0|[1-9]\d*)(\.\d+)?$/);
const issueSchema = z.object({ path: z.string(), code: z.string() }).strict();
export const capitalSeparationSchema = z.object({
  status: z.enum(["READY", "INCOMPLETE"]), informationalOnly: z.literal(true),
  currency: z.literal("VND"), valuationMonth: z.string(), assumptionBasis: z.literal("PINNED_BASE"),
  essentialMonthlyExpense: decimal.nullable(), reserveMonths: z.number().int().nullable(),
  requiredEmergencyReserve: decimal.nullable(), declaredEmergencyReserve: decimal.nullable(), emergencyShortfall: decimal.nullable(),
  retirementLiquidAssets: decimal.nullable(), nearTermGoalsPresentValue: decimal.nullable(), growthCapital: decimal.nullable(),
  investableLiquidAssets: decimal.nullable(), declaredOtherGoalsCapital: decimal.nullable(),
  goals: z.array(z.object({ id: z.string(), dueMonth: z.string(), monthsUntilDue: z.number().int(),
    treatment: z.enum(["RESERVED", "LONG_TERM"]), futureAmount: decimal.nullable(), presentValue: decimal.nullable(),
    inflationBasis: z.enum(["GOAL_SPECIFIC", "PINNED_ASSUMPTIONS"]),
    inflationSourceIds: z.array(z.string()), depositSourceIds: z.array(z.string()),
  }).strict()), issues: z.array(issueSchema), warnings: z.array(issueSchema),
}).strict();
export type CapitalSeparation = z.infer<typeof capitalSeparationSchema>;
const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));

/** Supplementary allocation only. Never changes fund capital, projection inputs,
 * cashflows or stored snapshots. No database, current clock or financial defaults. */
export function separateCapital(profile: ProfileV2, assumptions: AssumptionDocument): CapitalSeparation {
  const data = profileV2Schema.parse(profile), month = data.valuationDate.slice(0, 7);
  const issues: CapitalSeparation["issues"] = [], warnings: CapitalSeparation["warnings"] = [];
  const issue = (path: string, code: string) => { issues.push({ path, code }); };
  const liquid = (purpose: "retirementShare" | "emergencyShare" | "otherGoalsShare") => {
    const summary = profileV2Summary({ ...data, assets: data.assets.status === "KNOWN"
      ? { ...data.assets, entries: data.assets.entries.map(a => ({ ...a, retirementShare: a[purpose] })) } : data.assets });
    if (summary.values.retirementLiquidAssets === null) {
      summary.issues.filter(i => i.path.startsWith("assets")).forEach(i => issue(`${purpose}.${i.path}`, i.code));
    }
    return summary.values.retirementLiquidAssets;
  };
  const retirementLiquidAssets = liquid("retirementShare"), declaredEmergencyReserve = liquid("emergencyShare");
  const declaredOtherGoalsCapital = liquid("otherGoalsShare");
  // The three declared purposes partition the same owned liquid assets. Reserve
  // against their combined pool, not the retirement portion already net of the
  // other two purposes. Unknown allocations must not become an assumed zero.
  const investableLiquidAssets = retirementLiquidAssets !== null && declaredEmergencyReserve !== null && declaredOtherGoalsCapital !== null
    ? new D(retirementLiquidAssets).plus(declaredEmergencyReserve).plus(declaredOtherGoalsCapital).toFixed() : null;
  const essentialIndexes = data.expenses.status === "KNOWN"
    ? data.expenses.entries.flatMap((entry, index) => entry.category === "ESSENTIAL" ? [index] : []) : [];
  const cash = profileMonthlyCashflow({ income: { status: "KNOWN", entries: [] }, expenses: data.expenses.status === "KNOWN"
    ? { ...data.expenses, entries: data.expenses.entries.filter(e => e.category === "ESSENTIAL") } : data.expenses }, month);
  cash.issues.forEach(i => issue(i.path.replace(/^expenses\.entries\.(\d+)/, (_, index) => `expenses.entries.${essentialIndexes[Number(index)]}`), i.code));
  const essentialMonthlyExpense = cash.expenses?.toFixed() ?? null;
  const reserveMonths = data.incomeStability?.status === "KNOWN" ? { STABLE: 6, VARIABLE: 9, UNCERTAIN: 12 }[data.incomeStability.value] : null;
  if (reserveMonths === null) issue("incomeStability", "INCOME_STABILITY_REQUIRED");
  const requiredEmergencyReserve = reserveMonths !== null && essentialMonthlyExpense !== null ? new D(essentialMonthlyExpense).mul(reserveMonths).toFixed() : null;
  const emergencyShortfall = requiredEmergencyReserve !== null && declaredEmergencyReserve !== null
    ? D.max(0, new D(requiredEmergencyReserve).minus(declaredEmergencyReserve)).toFixed() : null;
  if (emergencyShortfall !== null && new D(emergencyShortfall).gt(0)) warnings.push({ path: "assets.emergencyShare", code: "EMERGENCY_RESERVE_SHORTFALL" });
  // These cumulative declarations may refer to the same goals. Never add twice.
  if (Object.values(data.liquidityNeeds ?? {}).some(v => v.status === "KNOWN" && new D(v.value).gt(0)))
    warnings.push({ path: "liquidityNeeds", code: "LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION" });

  const goals: CapitalSeparation["goals"] = [];
  let total = new D(0), goalsComplete = true;
  const goalIssue = (path: string, code: string) => { goalsComplete = false; issue(path, code); };
  if (!data.goals || data.goals.status === "UNKNOWN") goalIssue("goals", "GOALS_REQUIRED");
  if (data.goals?.status === "KNOWN") for (const goal of data.goals.entries) {
    const path = `goals.${goal.id}`;
    if (goal.dueMonth.status !== "KNOWN") { goalIssue(`${path}.dueMonth`, "GOAL_DUE_MONTH_REQUIRED"); continue; }
    const months = monthIndex(goal.dueMonth.value) - monthIndex(month);
    const row: CapitalSeparation["goals"][number] = { id: goal.id, dueMonth: goal.dueMonth.value, monthsUntilDue: months,
      treatment: months <= 60 ? "RESERVED" : "LONG_TERM", futureAmount: null, presentValue: null,
      inflationBasis: goal.inflation ? "GOAL_SPECIFIC" : "PINNED_ASSUMPTIONS", inflationSourceIds: [], depositSourceIds: [] };
    goals.push(row);
    // Long-term targets are retained for presentation but do not consume this reserve.
    if (months > 60) continue;
    if (goal.amountToday.status !== "KNOWN") { goalIssue(`${path}.amountToday`, "GOAL_AMOUNT_REQUIRED"); continue; }
    if (months === 0 || new D(goal.amountToday.value).isZero()) {
      row.futureAmount = row.presentValue = goal.amountToday.value; total = total.plus(row.presentValue); continue;
    }
    if (goal.inflation?.status === "UNKNOWN") { goalIssue(`${path}.inflation`, "GOAL_INFLATION_REQUIRED"); continue; }
    const horizons = assumptions.assetClasses.filter(a => a.code === "CASH").flatMap(a => a.horizons)
      .filter(h => h.minMonths <= months && months <= h.maxMonths);
    if (horizons.length !== 1) { goalIssue(path, "DEPOSIT_HORIZON_NOT_COVERED"); continue; }
    let inflationFactor = new D(1), depositFactor = new D(1), valid = true;
    // [valuation month, due month): exactly n monthly accruals. Goal inflation
    // changes only this goal's price, never the conversion of REAL market returns.
    for (let i = 0; i < months;) {
      const accrualMonth = addMonths(month, i), year = Number(accrualMonth.slice(0, 4));
      const monthsInYear = Math.min(months - i, 13 - Number(accrualMonth.slice(5, 7)));
      const cpis = assumptions.inflation.filter(r => r.year === year);
      const returns = assumptions.returns.filter(r => r.year === year && r.assetClass === "CASH" && r.horizonId === horizons[0].id);
      const market = returns[0];
      if (year < assumptions.projectionStartYear || year > assumptions.projectionEndYear || returns.length !== 1 || cpis.length !== 1) {
        goalIssue(`${path}.${year}`, "GOAL_ASSUMPTIONS_NOT_COVERED"); valid = false; break;
      }
      const net = normalizedAnnualReturn(market, cpis[0].percent);
      if (net === null || net.lte(-1)) { goalIssue(`${path}.${year}`, "DEPOSIT_NET_RETURN_REQUIRED"); valid = false; break; }
      const inflation = goal.inflation?.status === "KNOWN" ? goal.inflation.value : cpis[0].percent;
      // Compound equal monthly rates as one year segment; do not round to years.
      const years = new D(monthsInYear).div(12);
      inflationFactor = inflationFactor.mul(new D(inflation).div(100).plus(1).pow(years));
      depositFactor = depositFactor.mul(net.plus(1).pow(years));
      if (!goal.inflation && !row.inflationSourceIds.includes(cpis[0].sourceId)) row.inflationSourceIds.push(cpis[0].sourceId);
      if (!row.depositSourceIds.includes(market.sourceId)) row.depositSourceIds.push(market.sourceId);
      i += monthsInYear;
    }
    if (!valid) continue;
    const future = new D(goal.amountToday.value).mul(inflationFactor), pv = future.div(depositFactor);
    row.futureAmount = future.toFixed(); row.presentValue = pv.toFixed(); total = total.plus(pv);
  }
  const nearTermGoalsPresentValue = goalsComplete ? total.toFixed() : null;
  if (declaredOtherGoalsCapital !== null && nearTermGoalsPresentValue !== null && new D(declaredOtherGoalsCapital).lt(nearTermGoalsPresentValue))
    warnings.push({ path: "assets.otherGoalsShare", code: "OTHER_GOALS_CAPITAL_SHORTFALL" });
  const growthCapital = investableLiquidAssets !== null && requiredEmergencyReserve !== null && nearTermGoalsPresentValue !== null
    ? new D(investableLiquidAssets).minus(requiredEmergencyReserve).minus(nearTermGoalsPresentValue).toFixed() : null;
  if (growthCapital !== null && new D(growthCapital).lt(0)) warnings.push({ path: "growthCapital", code: "PROTECTED_CAPITAL_EXCEEDS_RETIREMENT_ASSETS" });
  return { status: issues.length ? "INCOMPLETE" : "READY", informationalOnly: true, currency: "VND", valuationMonth: month,
    assumptionBasis: "PINNED_BASE", essentialMonthlyExpense, reserveMonths, requiredEmergencyReserve, declaredEmergencyReserve,
    emergencyShortfall, retirementLiquidAssets, investableLiquidAssets, declaredOtherGoalsCapital,
    nearTermGoalsPresentValue, growthCapital, goals, issues, warnings };
}
