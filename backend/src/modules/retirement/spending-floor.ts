import { addMonths } from "../../common/calendar";
import type { AssumptionDocument } from "../assumptions/schema";
import { normalizedAnnualReturn } from "../assumptions/series";
import { separateCapital } from "../capital/separation";
import { profileMonthlyCashflow } from "../profiles/cashflow";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { PortfolioDocument } from "../portfolios/schema";
import type { SpendingFloorInput } from "../portfolios/engine";
import { RetirementDecimal as D, type ProjectionInput } from "./engine";
import type { RetirementPreview } from "./schema";

type Issue = { path: string; code: string };
type FloorProjection = Pick<ProjectionInput, "modelVersion" | "valuationDate" | "retirementMonth" | "rows" | "initialCapital">;
type SpendingFloorResult = { status: "DISABLED"; issues: Issue[] }
  | { status: "INCOMPLETE"; issues: Issue[] }
  | { status: "READY"; issues: Issue[]; input: SpendingFloorInput };
const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

/** A start-of-month spending reserve valued in the same month's money as growthCapital.
 * No rates or occupation/product classifications are inferred: the policy identifies the
 * deposit asset, and its pinned net nominal annual returns supply each maturity's discount. */
export function buildSpendingFloor(profile: ProfileV2, selection: RetirementPreview, policy: PortfolioDocument,
  assumptions: AssumptionDocument, projection: FloorProjection, templateId?: string | null): SpendingFloorResult {
  if (projection.modelVersion !== "retirement-monthly-v5" || policy.schemaVersion !== 2)
    return { status: "DISABLED", issues: [] };
  const template = policy.templates.find(t => t.id === (templateId ?? selection.templateId));
  if (!template?.glidePath.spendingFloorYears) return { status: "DISABLED", issues: [] };
  const fail = (code: string): SpendingFloorResult => ({ status: "INCOMPLETE", issues: [{ path: "glidePath.spendingFloorYears", code }] });
  const months = template.glidePath.spendingFloorYears * 12, retirementMonth = projection.retirementMonth;
  const firstMonth = projection.valuationDate.slice(0, 7), lastMonth = addMonths(retirementMonth, months - 1);
  const rows = projection.rows.filter(r => r.month >= retirementMonth && r.month <= lastMonth);
  if (rows.length !== months || rows.some((r, i) => r.month !== addMonths(retirementMonth, i)))
    return fail("SPENDING_FLOOR_CASHFLOW_COVERAGE_REQUIRED");
  const capital = separateCapital(profile, assumptions);
  if (capital.status !== "READY" || capital.growthCapital === null || new D(capital.growthCapital).lte(0))
    return fail("SPENDING_FLOOR_GROWTH_CAPITAL_REQUIRED");
  const depositCode = policy.lossStress?.depositAssetClass ?? "CASH";
  const deposit = assumptions.assetClasses.find(a => a.code === depositCode);
  if (!deposit) return fail("SPENDING_FLOOR_DEPOSIT_ASSUMPTIONS_REQUIRED");
  const templateAssets = new Set(template.glidePath.points.flatMap(p => p.allocations.map(a => a.assetClass)));
  const safeAssets = [...new Set([depositCode, "CASH", "GOV_BOND"])].filter(code => templateAssets.has(code));
  if (!safeAssets.length) return fail("SPENDING_FLOOR_SAFE_ASSET_REQUIRED");
  const entries = profile.expenses.status === "KNOWN"
    ? profile.expenses.entries.filter(e => e.category === "ESSENTIAL" && selection.retirementAdditionalExpenseIds.includes(e.id)) : [];
  let pv = new D(0);
  for (const row of rows) {
    const extras = profileMonthlyCashflow({ income: { status: "KNOWN", entries: [] }, expenses: { status: "KNOWN", entries } }, row.month);
    if (extras.expenses === null || extras.issues.length) return fail("SPENDING_FLOOR_ESSENTIAL_EXPENSES_REQUIRED");
    const expense = new D(row.livingExpense).plus(extras.expenses);
    if (expense.isZero()) continue;
    const distance = monthIndex(row.month) - monthIndex(firstMonth);
    const horizons = deposit.horizons.filter(h => h.minMonths <= Math.max(1, distance) && Math.max(1, distance) <= h.maxMonths);
    if (horizons.length !== 1) return fail("SPENDING_FLOOR_DEPOSIT_HORIZON_NOT_COVERED");
    let discount = new D(1);
    for (let i = 0; i < distance;) {
      const month = addMonths(firstMonth, i), year = Number(month.slice(0, 4));
      const length = Math.min(distance - i, 13 - Number(month.slice(5, 7)));
      const returns = assumptions.returns.filter(r => r.year === year && r.assetClass === depositCode && r.horizonId === horizons[0].id);
      const inflation = assumptions.inflation.filter(r => r.year === year);
      if (returns.length !== 1 || inflation.length !== 1) return fail("SPENDING_FLOOR_DEPOSIT_ASSUMPTIONS_REQUIRED");
      const net = normalizedAnnualReturn(returns[0], inflation[0].percent);
      if (net === null || net.lte(-1)) return fail("SPENDING_FLOOR_DEPOSIT_NET_RETURN_REQUIRED");
      discount = discount.mul(net.plus(1).pow(new D(length).div(12)));
      i += length;
    }
    pv = pv.plus(expense.div(discount));
  }
  return { status: "READY", issues: [], input: { essentialSpendingPV: pv.toFixed(), growthCapital: capital.growthCapital,
    bounds: policy.customization?.bounds, safeAssets } };
}
