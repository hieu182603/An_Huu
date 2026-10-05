import { RetirementDecimal as D } from "../retirement/engine";
import { actualKind, type ActualPayload } from "./schema";
export function reconcile(data: ActualPayload) {
  const totals = Object.fromEntries(actualKind.options.map(k => [k, new D(0)])) as Record<typeof actualKind.options[number], InstanceType<typeof D>>;
  for (const e of data.entries) totals[e.kind] = totals[e.kind].plus(e.amount);
  const surplus = totals.INCOME.minus(totals.EXPENSE).minus(totals.DEBT_PAYMENT);
  const calculatedClosing = new D(data.openingBalance).plus(totals.CONTRIBUTION).minus(totals.WITHDRAWAL)
    .plus(totals.INVESTMENT_INCOME).plus(totals.MARKET_CHANGE).minus(totals.FEE).plus(totals.BALANCE_ADJUSTMENT);
  const discrepancy = new D(data.closingBalance).minus(calculatedClosing);
  return { totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed()])),
    householdSurplus: surplus.toFixed(), cashflowState: surplus.gt(0) ? "SURPLUS" : surplus.lt(0) ? "DEFICIT" : "BALANCED",
    actualContribution: totals.CONTRIBUTION.toFixed(), calculatedClosingBalance: calculatedClosing.toFixed(), discrepancy: discrepancy.toFixed(),
    reconciliation: discrepancy.isZero() ? "MATCHED" : "UNRECONCILED", hasAdjustments: data.entries.some(e => e.kind === "BALANCE_ADJUSTMENT"),
    conventions: "ONE_CONSOLIDATED_RETIREMENT_FUND_EXTERNAL_FLOWS_ONLY" };
}
