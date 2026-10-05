import { RetirementDecimal as D } from "../retirement/engine";
import type { PlanPreview } from "../retirement/upgrade";
import { isDeepStrictEqual } from "node:util";

type Preview = PlanPreview;
export const hasFutureAssumptions = (p: Preview) => !!p.selection.whatIf || !!p.futureChanges?.length ||
  !!p.sourceChanges?.some(c => c.kind === "PENSION_REPLACE" || c.kind === "FLOW_REPLACE") ||
  (p.modelVersion === "retirement-monthly-v4" && p.calculation.attribution.some(r => r.confirmation === "HYPOTHETICAL"));
export function comparePreviews(baseline: Preview, candidate: Preview) {
  const reasons: string[] = [];
  if (!baseline.calculation || !candidate.calculation) reasons.push("INCOMPLETE_CALCULATION");
  if (baseline.valuationDate !== candidate.valuationDate) reasons.push("VALUATION_DATE_DIFFERS");
  if (baseline.currency !== candidate.currency) reasons.push("CURRENCY_DIFFERS");
  if (baseline.selection.endMonth !== candidate.selection.endMonth) reasons.push("END_MONTH_DIFFERS");
  const a = baseline.calculation?.summary, b = candidate.calculation?.summary;
  const subtract = (x: string | null, y: string | null) => x === null || y === null ? null : new D(y).minus(x).toFixed();
  const delta = !reasons.length && a && b ? {
    projectedFundAtValuation: subtract(a.atValuation.projectedFund, b.atValuation.projectedFund),
    requiredFundAtValuation: subtract(a.atValuation.requiredFund, b.atValuation.requiredFund),
    fundingGapAtValuation: subtract(a.atValuation.fundingGap, b.atValuation.fundingGap),
    coveragePercentagePoints: subtract(a.atValuation.coveragePercent, b.atValuation.coveragePercent),
    requiredConstantMonthlyContribution: subtract(a.requiredConstantMonthlyContribution, b.requiredConstantMonthlyContribution),
    additionalMonthlyContribution: subtract(a.additionalMonthlyContribution, b.additionalMonthlyContribution),
    unfundedWithdrawals: subtract(a.unfundedWithdrawals, b.unfundedWithdrawals),
    terminalBalance: subtract(a.terminalBalance, b.terminalBalance),
  } : null;
  return { status: reasons.length ? "NOT_COMPARABLE" : "COMPARABLE", reasons, direction: "CANDIDATE_MINUS_BASELINE",
    basis: "VALUATION_DATE_EACH_VERSION_DISCOUNT_FACTORS", delta,
    differences: { profile: baseline.references.profileHash !== candidate.references.profileHash,
      policy: baseline.references.policyHash !== candidate.references.policyHash,
      assumptions: baseline.references.assumptionHash !== candidate.references.assumptionHash,
      retirementMonth: a?.retirementMonth !== b?.retirementMonth,
      selectionFields: [...new Set([...Object.keys(baseline.selection), ...Object.keys(candidate.selection)])].sort()
        .filter(key => !isDeepStrictEqual(baseline.selection[key as keyof Preview["selection"]], candidate.selection[key as keyof Preview["selection"]]))
        .concat(isDeepStrictEqual(baseline.futureChanges, candidate.futureChanges) ? [] : ["futureChanges"])
        .concat(isDeepStrictEqual(baseline.sourceChanges, candidate.sourceChanges) ? [] : ["sourceChanges"])
        .concat(isDeepStrictEqual(baseline.modelVersion === "retirement-monthly-v4" ? baseline.replayInput.sourceRegistry.registryHash : null,
          candidate.modelVersion === "retirement-monthly-v4" ? candidate.replayInput.sourceRegistry.registryHash : null) ? [] : ["sourceRegistry"])
        .concat(isDeepStrictEqual(baseline.reforecast?.actualRevisions, candidate.reforecast?.actualRevisions) ? [] : ["actualRevisions"]) },
    limitations: ["DETERMINISTIC_NOT_SUCCESS_PROBABILITY", "DIFFERENT_INPUTS_MAY_CHANGE_MULTIPLE_FACTORS", "CHECK_FIRST_SHORTFALL_SEPARATELY"] };
}

export const monthlyCsvFields = ["month", "phase", "growthFactor", "inflationFactor", "income", "pension", "livingExpense", "additionalExpense",
  "debtPayment", "plannedContribution", "contribution", "contributionCapacity", "withdrawal", "uninvestedSurplus", "capitalInjection",
  "openingBalance", "investmentChange", "closingBalance", "fundedClosingBalance", "unfundedWithdrawal", "budgetShortfall",
  "requiredOpeningBalance", "requiredClosingBalance", "netWithdrawal"] as const;
// Headers/text are server-controlled IDs/enums, not user labels. Keep legitimate
// signed decimal values numeric; untrusted textual cells are formula-neutralized.
export function csvCell(value: string) {
  const numeric = /^-?(0|[1-9]\d*)(\.\d+)?$/.test(value);
  const safe = !numeric && /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function versionCsv(version: { id: string; planId: string; version: number; snapshotHash: string; preview: Preview }) {
  const p = version.preview, calculation = p.calculation!;
  const metadata = { planId: version.planId, versionId: version.id, version: String(version.version), snapshotHash: version.snapshotHash,
    modelVersion: p.modelVersion, profileRevision: String(p.profileRevision), valuationDate: p.valuationDate, currency: p.currency,
    policyVersionId: p.references.policyVersionId, policyHash: p.references.policyHash, assumptionVersionId: p.references.assumptionVersionId,
    assumptionHash: p.references.assumptionHash, inputHash: p.inputHash, scenario: p.selection.scenario,
    contributionTiming: calculation.conventions.contributionTiming, withdrawalTiming: calculation.conventions.withdrawalTiming,
    surplusPolicy: calculation.conventions.surplusPolicy,
    contributionStartMonth: p.replayInput?.contributionStartMonth ?? p.valuationDate.slice(0, 7),
    sourceVersionId: p.reforecast?.sourceVersionId ?? "", throughMonth: p.reforecast?.throughMonth ?? "",
    originalRetirementMonth: p.reforecast?.originalRetirementMonth ?? calculation.summary.retirementMonth,
    sourceChangeIds: (p.sourceChanges ?? []).map(c => c.id).join("|"),
    valueKind: p.reforecast ? "REFORECAST" : "FORECAST", hypothetical: hasFutureAssumptions(p) ? "true" : "false" };
  const sourceFields = p.modelVersion === "retirement-monthly-v4" ? ["sourceRegistryHash", "sourceAttributionJson"] : [];
  const headers = [...Object.keys(metadata), ...monthlyCsvFields, ...sourceFields];
  return "\uFEFF" + [headers, ...calculation.rows.map(row => [...Object.values(metadata), ...monthlyCsvFields.map(key => row[key]),
    ...(p.modelVersion === "retirement-monthly-v4" ? [p.calculation.sourceRegistryHash, JSON.stringify(p.calculation.attribution.filter(c => c.month === row.month))] : [])])]
    .map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
