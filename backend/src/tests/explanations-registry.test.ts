import { describe, expect, it } from "vitest";
import { RetirementDecimal as D, projectRetirement } from "../modules/retirement/engine";
import { projectRetirement as projectV2 } from "../modules/retirement/engine-v2";
import { projectSources } from "../modules/retirement/engine-v4";
import { upgradeSourcePreview } from "../modules/retirement/upgrade";
import { explainMetric, METRIC_KEYS, METRIC_KEY_PATTERN, type MetricExplanation, type ExplanationPreview } from "../modules/explanations/registry";
import { plansFixture } from "./plans-fixtures";
import { fixtureAsset, known } from "./profile-v2-fixtures";
import { retirementConfiguration, retirementProfile } from "./retirement-fixtures";
import { glidePortfolioFixture } from "./portfolio-fixtures";

async function fixture(fee = true) {
  const f = await plansFixture(), base = await f.retirement.capture(f.db, f.owner, f.command.preview);
  const profile = retirementProfile();
  profile.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("200"), ownershipShare: known("0.5"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") }),
    fixtureAsset({ id: "future", value: known("100"), availableFromMonth: known("2027-02") }),
    fixtureAsset({ id: "locked", value: known("900"), liquidity: known("LOCKED") }),
    fixtureAsset({ id: "home", type: "PRIMARY_HOME", value: known("2000") })] };
  profile.expenses = { status: "KNOWN", entries: [{ id: "essential", label: "Chi thiết yếu", category: "ESSENTIAL", amount: known("5"), currency: "VND", startMonth: "2026-01", endMonth: null, frequency: "MONTHLY" }] };
  profile.incomeStability = known("STABLE");
  profile.lossTolerance = { amountVnd: known("100"), percent: known("40") };
  profile.goals = { status: "KNOWN", entries: [
    { id: "near", label: "Mục tiêu gần", amountToday: known("10"), dueMonth: known("2027-01"), priority: known("ESSENTIAL"), deferrable: { status: "KNOWN", value: false } },
    { id: "now", label: "Mục tiêu hiện tại", amountToday: known("1"), dueMonth: known("2026-10"), priority: known("FLEXIBLE"), deferrable: { status: "KNOWN", value: true } },
    { id: "later", label: "Mục tiêu dài hạn", amountToday: known("1000"), dueMonth: known("2032-01"), priority: known("FLEXIBLE"), deferrable: { status: "KNOWN", value: true } },
  ] };
  const cfg = retirementConfiguration(), policy = glidePortfolioFixture(base.policy.data.assumptionVersionId);
  policy.lossStress = { equityAssetClass: "STOCK", depositAssetClass: "BOND", shocks: [{ assetClass: "STOCK", percent: "-40" }, { assetClass: "BOND", percent: "-10" }], evidence: "Fixture stress only, not a market prediction" };
  cfg.assumptions.inflation = cfg.assumptions.inflation.map(row => ({ ...row, percent: row.year === 2026 ? "4" : "6" }));
  cfg.assumptions.returns = cfg.assumptions.returns.map(row => ({ ...row, rate: { type: "EFFECTIVE_ANNUAL", percent: row.assetClass === "BOND" ? "5" : "9" } }));
  cfg.assumptions.assetClasses.push({ code: "CASH", label: "Tiền gửi", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] });
  cfg.assumptions.returns.push(...cfg.assumptions.returns.filter(row => row.assetClass === "BOND").map(row => ({ ...row, assetClass: "CASH" })));
  policy.scenarios.forEach(scenario => scenario.years.forEach(year => year.returns.push({ assetClass: "CASH", deltaPoints: "0" })));
  const capture = { ...base, profile, policy: { ...base.policy, data: policy }, assumptions: { ...base.assumptions, data: cfg.assumptions } };
  const input = { ...f.command.preview, monthlyContribution: "40", monthlyExpenseToday: "1000", terminalBalance: "12.3", whatIf: { assetValues: [{ assetId: "deposit-1", value: "300" }] },
    ...(fee ? { advisoryFee: { annualPercent: "1.2", paidFrom: "FUND" as const } } : {}) };
  const preview = f.retirement.previewCaptured(capture, input);
  expect(preview.issues).toEqual([]);
  expect(preview.status).toBe("READY");
  if (preview.status !== "READY") throw new Error("Fixture projection must be READY");
  return { ...f, capture, preview, input };
}

const amount = (explanation: MetricExplanation, source: string) => {
  const step = explanation.steps.find(row => row.source === source);
  expect(step, source).toBeDefined();
  return new D(step!.value);
};
const rowAmount = (explanation: MetricExplanation, i: number, field: string) => amount(explanation, `replayInput.rows[${i}].${field}`);
function recompose(explanation: MetricExplanation, preview: ExplanationPreview) {
  const metric = explanation.metricKey, replay = preview.replayInput!, n = preview.calculation!.summary.accumulationMonths;
  if (metric === "summary.atRetirement.requiredFund") {
    let required = amount(explanation, "replayInput.terminalBalance");
    for (let i = replay.rows.length - 1; i >= n; i--)
      required = D.max(0, required.plus(rowAmount(explanation, i, "withdrawal").minus(rowAmount(explanation, i, "contribution")).minus(rowAmount(explanation, i, "capitalInjection"))).div(rowAmount(explanation, i, "growthFactor")));
    return required;
  }
  if (["summary.atRetirement.projectedFund", "summary.requiredConstantMonthlyContribution", "summary.additionalMonthlyContribution"].includes(metric)) {
    const timing = explanation.steps.find(row => row.source === "replayInput.contributionTiming")!.value;
    const first = explanation.steps.find(row => row.unit === "MONTH")!.value;
    let balance = amount(explanation, "replayInput.initialCapital"), without = balance, coefficient = new D(0), required = new D(0), additional = new D(0);
    for (let i = 0; i < n; i++) {
      const growth = rowAmount(explanation, i, "growthFactor"), contribution = rowAmount(explanation, i, "contribution");
      const injection = rowAmount(explanation, i, "capitalInjection"), withdrawal = rowAmount(explanation, i, "withdrawal");
      const eligible = replay.rows[i].month >= first;
      const begin = eligible && ["START_OF_MONTH", "START_OF_MONTH_RESEARCH"].includes(timing);
      balance = balance.plus(begin ? contribution : 0).mul(growth).plus(begin ? 0 : contribution).plus(injection).minus(withdrawal);
      without = without.mul(growth).plus(injection).minus(withdrawal);
      coefficient = coefficient.mul(growth).plus(!eligible ? 0 : begin ? growth : 1);
      if (coefficient.gt(0)) {
        required = D.max(required, without.neg().div(coefficient));
        additional = D.max(additional, balance.neg().div(coefficient));
      }
    }
    if (metric === "summary.atRetirement.projectedFund") return balance;
    const target = amount(explanation, "calculation.summary.atRetirement.requiredFund");
    return metric === "summary.requiredConstantMonthlyContribution" ? D.max(0, required, target.minus(without).div(coefficient))
      : D.max(0, additional, target.minus(balance).div(coefficient));
  }
  if (metric === "summary.atRetirement.fundingGap" || metric === "summary.atRetirement.coveragePercent") {
    const required = amount(explanation, "calculation.summary.atRetirement.requiredFund"), projected = amount(explanation, "calculation.summary.atRetirement.projectedFund");
    return metric.endsWith("fundingGap") ? required.minus(projected) : projected.div(required).mul(100);
  }
  if (metric === "summary.futureMonthlyExpense") {
    if (preview.modelVersion === "retirement-monthly-v4" || preview.reforecast) return explanation.steps.reduce((sum, row) => sum.plus(row.value), new D(0));
    let inflation = new D(1);
    explanation.steps.filter(row => row.unit === "FACTOR").forEach(row => { inflation = inflation.mul(row.value); });
    return amount(explanation, "selection.monthlyExpenseToday").mul(inflation);
  }
  if (metric === "summary.initialRetirementCapital") {
    if (preview.reforecast) return new D(explanation.steps[0].value);
    let total = new D(0);
    for (let i = 0; i < explanation.steps.length; i += 3)
      total = total.plus(new D(explanation.steps[i].value).mul(explanation.steps[i + 1].value).mul(explanation.steps[i + 2].value));
    return total;
  }
  if (metric === "capitalSeparation.requiredEmergencyReserve") return new D(explanation.steps[0].value).mul(explanation.steps[1].value);
  if (metric === "capitalSeparation.nearTermGoalsPresentValue") {
    let total = new D(0), future = new D(0), discount = new D(1);
    for (let i = 0; i < explanation.steps.length; i++) {
      const step = explanation.steps[i];
      if (step.unit === "VND") { total = total.plus(future.div(discount)); future = new D(step.value); discount = new D(1); }
      else if (step.unit === "PERCENT") discount = discount.mul(new D(step.value).div(100).plus(1).pow(new D(explanation.steps[++i].value).div(12)));
    }
    return total.plus(future.div(discount));
  }
  if (metric === "capitalSeparation.growthCapital") return new D(explanation.steps[0].value).minus(explanation.steps[1].value).minus(explanation.steps[2].value);
  if (metric === "lossConstraint.lossAmount") {
    let lossPercent = new D(0);
    for (let i = 1; i < explanation.steps.length; i += 2)
      lossPercent = lossPercent.plus(new D(explanation.steps[i].value).mul(new D(explanation.steps[i + 1].value).neg().div(100)));
    return new D(explanation.steps[0].value).mul(lossPercent).div(100);
  }
  if (metric === "essentialCoverage.essentialShortfall") {
    let total = new D(0);
    for (let i = 0; i < explanation.steps.length; i += 6) {
      const [expense, income, pension, closing, withdrawal, unfunded] = explanation.steps.slice(i, i + 6).map(row => new D(row.value));
      const available = closing.plus(withdrawal).minus(unfunded);
      total = total.plus(D.min(unfunded, D.max(0, expense.minus(income).minus(pension).minus(available))));
    }
    return total;
  }
  return new D(explanation.steps[0].value).mul(new D(explanation.steps[1].value).div(100).div(12));
}
function originalValue(metric: string, preview: Awaited<ReturnType<typeof fixture>>["preview"]) {
  if (metric === "rows.2026-10.advisoryFeeAmount") return (preview.replayInput!.rows[0] as { advisoryFeeAmount?: string }).advisoryFeeAmount;
  let value: unknown = preview;
  const path = metric.startsWith("summary.") ? `calculation.${metric}` : metric;
  for (const key of path.split(".")) value = (value as Record<string, unknown>)[key];
  return value;
}

describe("deterministic metric registry", () => {
  it.each([...METRIC_KEYS, "rows.2026-10.advisoryFeeAmount"])("matches the authoritative %s and its independent formula", async metric => {
    const f = await fixture(), before = JSON.stringify({ preview: f.preview, capture: f.capture });
    const explanation = explainMetric(metric, f.preview, f.capture, "MONTHLY")!;
    expect(explanation).not.toBeNull();
    expect(explanation.value).toBe(originalValue(metric, f.preview));
    expect(recompose(explanation, f.preview).toFixed()).toBe(explanation.value);
    expect(explanation.label.vi).not.toBe(explanation.label.en);
    expect(explanation.formula.vi).not.toBe(explanation.formula.en);
    expect(explanation.formula.symbolic.length).toBeGreaterThan(5);
    expect(explanation.assumptions).toEqual({ version: f.preview.references.assumptionVersion, sources: f.preview.sources });
    expect(JSON.stringify({ preview: f.preview, capture: f.capture })).toBe(before);
  });

  it("reconstructs both contribution timings, including the skipped partial first month", async () => {
    const f = await fixture(false);
    const preview = f.retirement.previewCaptured(f.capture, { ...f.input, contributionTiming: "START_OF_MONTH", startOfMonthFunding: { source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START", confirmed: true, monthlyAvailable: "100", schedule: [] } });
    expect(preview.replayInput!.contributionStartMonth).toBe("2026-11");
    for (const key of ["summary.atRetirement.projectedFund", "summary.requiredConstantMonthlyContribution", "summary.additionalMonthlyContribution"]) {
      const explanation = explainMetric(key, preview, f.capture, "MONTHLY")!;
      expect(recompose(explanation, preview).toFixed()).toBe(explanation.value);
    }
  });

  it("keeps the frozen v2 start-of-month research convention", async () => {
    const f = await fixture(false), replay = { ...f.preview.replayInput!, modelVersion: undefined, contributionTiming: "START_OF_MONTH_RESEARCH" as const };
    const preview: ExplanationPreview = { ...f.preview, modelVersion: "retirement-monthly-v2", replayInput: replay,
      calculation: { ...f.preview.calculation!, ...projectV2(replay) } };
    for (const key of ["summary.atRetirement.requiredFund", "summary.atRetirement.projectedFund", "summary.requiredConstantMonthlyContribution", "summary.additionalMonthlyContribution"]) {
      const explanation = explainMetric(key, preview, f.capture, "MONTHLY")!;
      expect(recompose(explanation, preview).toFixed()).toBe(explanation.value);
    }
  });

  it("uses source attribution for v4 expenses and pinned actual closing capital for a reforecast", async () => {
    const f = await fixture(false), original = f.retirement.evaluate(f.capture, f.input);
    const upgraded = upgradeSourcePreview(f.capture, original, "a".repeat(64), "2026-10-04");
    const v4 = explainMetric("summary.futureMonthlyExpense", upgraded, f.capture, "MONTHLY")!;
    expect(recompose(v4, upgraded).toFixed()).toBe(upgraded.calculation.summary.futureMonthlyExpense);
    expect(v4.steps[0].source).toContain("calculation.attribution[");
    const replay = { ...f.preview.replayInput!, valuationDate: "2026-11-01", initialCapital: "48.25", rows: f.preview.replayInput!.rows.slice(1) };
    const preview: ExplanationPreview = { ...f.preview, replayInput: replay, calculation: { ...f.preview.calculation!, ...projectRetirement(replay) },
      reforecast: { kind: "ACTUAL_REFORECAST", sourceVersionId: "pinned-version", sourceSnapshotHash: "a".repeat(64), originalValuationDate: "2026-10-04",
        originalRetirementMonth: "2027-01", throughMonth: "2026-10", actualRevisions: [{ period: "2026-10", revision: 3, closingBalance: "48.25" }] } };
    for (const key of ["summary.initialRetirementCapital", "summary.futureMonthlyExpense"]) {
      const explanation = explainMetric(key, preview, f.capture, "MONTHLY")!;
      expect(recompose(explanation, preview).toFixed()).toBe(explanation.value);
    }
    expect(explainMetric("summary.initialRetirementCapital", preview, f.capture, "MONTHLY")!.steps[0].source).toBe("reforecast.actualRevisions[0].closingBalance");
    const sourceReplay = { ...upgraded.replayInput, valuationDate: replay.valuationDate, initialCapital: replay.initialCapital, rows: replay.rows };
    const sourcePreview: ExplanationPreview = { ...upgraded, replayInput: sourceReplay, reforecast: preview.reforecast,
      calculation: { ...upgraded.calculation, ...projectSources(sourceReplay) } };
    for (const key of ["summary.initialRetirementCapital", "summary.futureMonthlyExpense", "summary.requiredConstantMonthlyContribution", "summary.additionalMonthlyContribution", "summary.atRetirement.projectedFund"]) {
      const explanation = explainMetric(key, sourcePreview, f.capture, "MONTHLY")!;
      expect(recompose(explanation, sourcePreview).toFixed()).toBe(explanation.value);
    }
  });

  it("does not invent missing metrics, supplements, fees or undefined coverage/contributions", async () => {
    const f = await fixture(false);
    for (const key of ["advisoryFee.total", "cashflowSafety.totalEssentialShortfall", "lossConstraint.shockLossVnd", "unknown", "rows.2026-10.advisoryFeeAmount", "rows.2026-13.advisoryFeeAmount", "rows.2030-01.advisoryFeeAmount"])
      expect(explainMetric(key, f.preview, f.capture, "MONTHLY"), key).toBeNull();
    const { capitalSeparation, lossConstraint, essentialCoverage, ...saved } = f.preview;
    for (const key of ["capitalSeparation.requiredEmergencyReserve", "capitalSeparation.nearTermGoalsPresentValue", "capitalSeparation.growthCapital", "lossConstraint.lossAmount", "essentialCoverage.essentialShortfall"])
      expect(explainMetric(key, saved, f.capture, "MONTHLY"), key).toBeNull();
    expect(explainMetric("capitalSeparation.growthCapital", { ...f.preview, capitalSeparation: { ...capitalSeparation, growthCapital: null } }, f.capture, "MONTHLY")).toBeNull();
    const noNeed = f.retirement.previewCaptured({ ...f.capture, profile: { ...f.capture.profile, personal: { ...f.capture.profile.personal, desiredRetirementMonth: known("2026-10") } } },
      { ...f.input, monthlyExpenseToday: "0", terminalBalance: "0" });
    expect(explainMetric("summary.atRetirement.coveragePercent", noNeed, f.capture, "MONTHLY")).toBeNull();
    expect(explainMetric("summary.requiredConstantMonthlyContribution", noNeed, f.capture, "MONTHLY")).toBeNull();
    expect(explainMetric("summary.additionalMonthlyContribution", noNeed, f.capture, "MONTHLY")).toBeNull();
    expect(METRIC_KEY_PATTERN.test("rows.2026-10.advisoryFeeAmount")).toBe(true);
  });
});

describe("SUMMARY detail for the popup", () => {
  it.each([...METRIC_KEYS, "rows.2026-10.advisoryFeeAmount"])("%s keeps the MONTHLY value and folds per-month rows", async metric => {
    const f = await fixture();
    const monthly = explainMetric(metric, f.preview, f.capture, "MONTHLY")!, summary = explainMetric(metric, f.preview, f.capture, "SUMMARY")!;
    expect(summary).toMatchObject({ detail: "SUMMARY", value: monthly.value, unit: monthly.unit, formula: monthly.formula, label: monthly.label });
    expect(monthly.detail).toBe("MONTHLY");
    expect(summary.steps.length).toBeLessThanOrEqual(Math.max(monthly.steps.length, 12));
    expect(summary.steps.length).toBeLessThanOrEqual(16);
    // A single-month metric (the monthly fee) legitimately cites its own row.
    if (!metric.startsWith("rows.")) expect(summary.steps.some(step => /^(replayInput|calculation|essentialCoverage)\.rows\[\d+\]\./.test(step.source))).toBe(false);
  });

  it("totals and cumulative factors equal the monthly rows they replace", async () => {
    const f = await fixture(), replay = f.preview.replayInput!, n = f.preview.calculation!.summary.accumulationMonths, rows = replay.rows.slice(0, n);
    const summary = explainMetric("summary.atRetirement.projectedFund", f.preview, f.capture, "SUMMARY")!;
    const step = (source: string) => summary.steps.find(row => row.source === source)?.value;
    const range = `replayInput.rows[0..${n - 1}]`;
    for (const key of ["contribution", "capitalInjection", "withdrawal"] as const)
      expect(step(`Σ ${range}.${key}`), key).toBe(rows.reduce((sum, row) => sum.plus(row[key]), new D(0)).toFixed());
    expect(new D(step(`Π ${range}.growthFactor`)!).toSignificantDigits(12).toFixed())
      .toBe(rows.reduce((product, row) => product.mul(row.growthFactor), new D(1)).toSignificantDigits(12).toFixed());
    expect(summary.steps.filter(row => row.source === range).map(row => row.unit)).toEqual(["PERIOD", "MONTHS"]);
    expect(summary.steps.find(row => row.unit === "PERIOD")!.value).toBe(`${rows[0].month} → ${rows.at(-1)!.month}`);
    const future = explainMetric("summary.futureMonthlyExpense", f.preview, f.capture, "SUMMARY")!;
    expect(future.steps.filter(row => row.unit === "FACTOR")).toHaveLength(1);
    expect(recompose(future, f.preview).toFixed()).toBe(future.value);
    const essential = explainMetric("essentialCoverage.essentialShortfall", f.preview, f.capture, "SUMMARY")!;
    const coverage = f.preview.essentialCoverage!;
    expect(essential.steps.find(row => row.unit === "MONTHS" && row.source.endsWith("essentialShortfall > 0"))!.value)
      .toBe(String(coverage.rows.filter(row => new D(row.essentialShortfall!).gt(0)).length));
  });
});

