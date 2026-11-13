import { Prisma } from "@prisma/client";
const D = Prisma.Decimal.clone({ precision: 48 });
type Scenario = { endingUnitValue: string; rows: Array<{ holdings: Array<{ assetClass: string; startWeightPercent: string; annualNetNominalReturnPercent: string }> }> };
/** Explicitly separates published monthly inputs from the realized unit path. */
export function portfolioReturnBreakdown(scenario: Scenario | undefined) {
  if (!scenario?.rows.length) return null;
  const rows = scenario.rows[0].holdings.map(row => {
    const monthlyRate = new D(row.annualNetNominalReturnPercent).div(1200);
    return { assetClass: row.assetClass, weightPercent: row.startWeightPercent, monthlyRate: monthlyRate.toFixed(),
      monthlyContribution: monthlyRate.mul(row.startWeightPercent).div(100).toFixed() };
  });
  const monthly = rows.reduce((sum, row) => sum.plus(row.monthlyContribution), new D(0));
  return { basis: "PUBLISHED_NET_NOMINAL_INPUTS" as const, rows, monthly: monthly.toFixed(), nominalAnnualPercent: monthly.mul(1200).toFixed(),
    effectiveAnnualPercent: monthly.plus(1).pow(12).minus(1).mul(100).toFixed(),
    pathAnnualPercent: new D(scenario.endingUnitValue).pow(new D(12).div(scenario.rows.length)).minus(1).mul(100).toFixed(),
    months: scenario.rows.length, includesModeledTurnoverCosts: true };
}
