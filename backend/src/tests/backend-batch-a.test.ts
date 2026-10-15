import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { addMonths } from "../common/calendar";
import { logPreviewCoverage } from "../common/logger";
import { separateCapital } from "../modules/capital/separation";
import { assessLossConstraint, lossConstraintSchema } from "../modules/capital/loss-constraint";
import { portfolioDocumentSchema } from "../modules/portfolios/schema";
import { validatePortfolioPolicy } from "../modules/portfolios/engine";
import { profileV2Schema, partialProfileV2Schema } from "../modules/profiles/schema-v2";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { prepareRetirement } from "../modules/retirement/prepare";
import { projectRetirement, RetirementDecimal as D } from "../modules/retirement/engine";
import { applyAdvisoryFee } from "../modules/retirement/advisory-fee";
import { essentialCoverage, adjustmentOptions, decisionExplanations, isFunded } from "../modules/retirement/preview-insights";
import { retirementPreviewSchema } from "../modules/retirement/schema";
import { profileSourceRegistry } from "../modules/retirement/source-profile";
import { updateSourceRows } from "../modules/actuals/source-changes";
import { planHorizonWarnings } from "../modules/plans/read-warnings";
import { ActualsService } from "../modules/actuals/service";
import { fixtureAsset, fixtureProfile, known, empty, unknown } from "./profile-v2-fixtures";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { glidePortfolioFixture, portfolioFixture } from "./portfolio-fixtures";
import { assumptionFixture } from "./assumptions-fixtures";
import { plansFixture } from "./plans-fixtures";

const file = (name: string) => JSON.parse(readFileSync(`seed-data/allocation-2026-10/${name}`, "utf8"));
const draftPolicy = () => portfolioDocumentSchema.parse(file("draft-policy-v4.json"));
function golden() {
  const p = fixtureProfile({ debts: empty(), incomeStability: known("VARIABLE"),
    lossTolerance: { amountVnd: known("2000000000"), percent: known("23"), reaction: known("HOLD") },
    goals: { status: "KNOWN", entries: [{ id: "tuition", label: "Học phí", amountToday: known("300000000"), dueMonth: known("2029-10"),
      priority: known("ESSENTIAL"), deferrable: { status: "KNOWN", value: false } }] },
    assets: { status: "KNOWN", entries: [fixtureAsset({ value: known("2000000000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] } });
  if (p.expenses.status === "KNOWN") p.expenses.entries[0].amount = known("25000000");
  const a = assumptionFixture(); a.projectionEndYear = 2029;
  a.assetClasses = [{ code: "CASH", label: "Tiền gửi", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] }];
  a.inflation = [2026, 2027, 2028, 2029].map(year => ({ ...a.inflation[0], year, percent: "4" }));
  a.returns = a.inflation.map(r => ({ ...a.returns[0], year: r.year, assetClass: "CASH", rate: { type: "EFFECTIVE_ANNUAL", percent: "4.5" } }));
  const holdings = [{ assetClass: "CASH", startWeightPercent: "10" }, { assetClass: "GOV_BOND", startWeightPercent: "20" },
    { assetClass: "EQUITY", startWeightPercent: "60" }, { assetClass: "GOLD", startWeightPercent: "10" }];
  return { p, a, capital: separateCapital(p, a), policy: draftPolicy(), holdings };
}
const prepared = (p = retirementProfile(), c = retirementCommand()) => {
  const cfg = retirementConfiguration(); return prepareRetirement(p, c, cfg.policy, cfg.assumptions);
};

describe("P1-6 approved stress policy and loss constraint", () => {
  it("reproduces the 2 billion golden: 340.24 million, 17.01% total and 23% growth, equality is allowed", () => {
    const f = golden(), before = JSON.stringify(f), r = assessLossConstraint(f.capital, f.p, f.policy, f.holdings);
    expect(new D(r.lossAmount!).div(1000000).toFixed(2)).toBe("340.24");
    expect(new D(r.lossPercentOfInvestableAssets!).toFixed(2)).toBe("17.01");
    expect(r).toMatchObject({ lossPercentOfGrowth: "23", status: "WITHIN_LIMIT", exceedsTolerance: false, maxEquityWeightPercent: "60" });
    expect(lossConstraintSchema.safeParse(r).success).toBe(true); expect(JSON.stringify(f)).toBe(before);
  });
  it("uses the smaller constraint, reduces only equity into deposits and reports infeasible residual risk", () => {
    const f = golden(); f.p.lossTolerance!.percent = known("20"); f.p.lossTolerance!.amountVnd = known("200000000");
    const r = assessLossConstraint(f.capital, f.p, f.policy, f.holdings);
    expect(r).toMatchObject({ status: "REDUCE_RISK", allowedLossAmount: "200000000", exceedsTolerance: true });
    expect(new D(r.maxEquityWeightPercent!).lt(60)).toBe(true);
    expect(new D(r.proposedLossAmount!).lte(r.allowedLossAmount!)).toBe(true);
    expect(r.proposedAllocations.find(a => a.assetClass === "GOV_BOND")!.weightPercent).toBe("20");
    expect(r.proposedAllocations.reduce((s, a) => s.plus(a.weightPercent), new D(0)).toFixed()).toBe("100");
    f.p.lossTolerance!.amountVnd = known("0");
    expect(assessLossConstraint(f.capital, f.p, f.policy, f.holdings)).toMatchObject({ status: "NOT_FEASIBLE", maxEquityWeightPercent: null });
  });
  it("has no hard-coded fallback; zero/missing/negative capital and unknown tolerance are explicit", () => {
    const f = golden();
    expect(assessLossConstraint(f.capital, f.p, portfolioFixture(), f.holdings).issues).toContain("APPROVED_LOSS_STRESS_REQUIRED");
    expect(assessLossConstraint({ ...f.capital, growthCapital: "-1" }, f.p, f.policy, f.holdings).status).toBe("REVIEW_REQUIRED");
    expect(assessLossConstraint({ ...f.capital, growthCapital: null }, f.p, f.policy, f.holdings).lossAmount).toBeNull();
    expect(assessLossConstraint({ ...f.capital, growthCapital: "0" }, f.p, f.policy, f.holdings)).toMatchObject({ status: "WITHIN_LIMIT", lossAmount: "0" });
    f.p.lossTolerance!.amountVnd = unknown;
    expect(assessLossConstraint(f.capital, f.p, f.policy, f.holdings)).toMatchObject({ status: "REVIEW_REQUIRED", exceedsTolerance: null, lossPercentOfGrowth: "23" });
  });
  it("validates policy coverage before approval and takes every shock from the document", () => {
    const f = golden(); if (f.policy.schemaVersion !== 2) throw Error("fixture");
    f.policy.lossStress!.shocks.find(s => s.assetClass === "EQUITY")!.percent = "-70";
    expect(assessLossConstraint(f.capital, f.p, f.policy, f.holdings).lossPercentOfGrowth).toBe("44");
    f.policy.lossStress!.shocks.pop();
    expect(assessLossConstraint(f.capital, f.p, f.policy, f.holdings).issues).toContain("STRESS_ASSET_NOT_COVERED");
    expect(validatePortfolioPolicy(f.policy, file("draft-assumptions-v3.json")).issues.some(i => i.code === "STRESS_ASSET_NOT_COVERED")).toBe(true);
    expect(validatePortfolioPolicy(draftPolicy(), file("draft-assumptions-v3.json")).status).toBe("VALID");
    const complete = draftPolicy(); if (complete.schemaVersion !== 2) throw Error("fixture");
    complete.lossStress!.shocks[2].percent = "-100";
    expect(portfolioDocumentSchema.safeParse(complete).success).toBe(true);
    complete.lossStress!.shocks[2].percent = "1";
    expect(portfolioDocumentSchema.safeParse(complete).success).toBe(false);
    complete.lossStress!.shocks[2].percent = "-35";
    complete.lossStress!.shocks.push(complete.lossStress!.shocks[0]);
    expect(validatePortfolioPolicy(complete, file("draft-assumptions-v3.json")).issues.some(i => i.code === "DUPLICATE_ENTRY")).toBe(true);
  });
  it("keeps published v1 parse/hash shape and draft assumptions bytes pinned", () => {
    const p = portfolioFixture(); expect(JSON.stringify(portfolioDocumentSchema.parse(p))).toBe(JSON.stringify(p));
    const published = file("published-policy-v2.json").values;
    const parsed = portfolioDocumentSchema.parse(published); expect(parsed).toEqual(published);
    expect("lossStress" in parsed).toBe(false);
    expect(createHash("sha256").update(readFileSync("seed-data/allocation-2026-10/draft-assumptions-v3.json")).digest("hex"))
      .toBe("d54c4369f356f01427565abf612ecc1cff09eae0f2d9acc5c5cff76ca11bf69b");
    expect(draftPolicy().assumptionVersionId).toBe("d9b30f3b-8a8a-443c-9294-c4e88a26adb6");
  });
});

describe("P1-4 GOLD/BOND use the existing liquid-asset rules", () => {
  it.each(["GOLD", "BOND"] as const)("supports %s, cost basis, locked/future assets and source realization without double credit", type => {
    const p = retirementProfile(), c = retirementCommand();
    const asset = fixtureAsset({ type, value: known("1000"), costBasis: known("800"), ownershipShare: known("0.5"),
      retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") });
    p.assets = { status: "KNOWN", entries: [asset] };
    expect(profileV2Schema.parse(p).assets).toEqual(p.assets);
    expect(partialProfileV2Schema.safeParse({ schemaVersion: 2, assets: { status: "KNOWN", entries: [{ id: asset.id, type, costBasis: unknown }] } }).success).toBe(true);
    expect(profileV2Summary(p).values.retirementLiquidAssets).toBe("500");
    expect(prepared(p, c).calculation!.summary.initialRetirementCapital).toBe("500");
    asset.liquidity = known("LOCKED"); expect(profileV2Summary(p).values.retirementLiquidAssets).toBe("0");
    asset.liquidity = known("LIQUID"); asset.availableFromMonth = known("2027-02");
    const r = prepared(p, c); expect(r.replayInput!.initialCapital).toBe("0");
    expect(r.replayInput!.rows.find(r => r.month === "2027-02")!.capitalInjection).toBe("500");
    const registry = profileSourceRegistry(p, c, r.replayInput!.rows, "a".repeat(64));
    expect(JSON.stringify(registry)).toContain("profile:asset:deposit-1");
    const eventId = randomUUID();
    const changed = updateSourceRows(r.replayInput!.rows, [{ id: randomUUID(), confirmed: true, document: "Confirmed receipt", kind: "ASSET_REALIZED",
      sourceId: asset.id, actual: { period: "2026-10", eventId } }], [], p, c,
      [{ period: "2026-10", data: { currency: "VND", openingBalance: "0", closingBalance: "500", correctionReason: "Receipt", entries: [{ eventId, kind: "CONTRIBUTION", date: "2026-10-20", amount: "500" }] } }], []);
    expect(changed.find(r => r.month === "2027-02")!.capitalInjection).toBe("0");
    expect(profileV2Schema.safeParse({ ...p, assets: { status: "KNOWN", entries: [{ ...asset, costBasis: known("-1") }] } }).success).toBe(false);
  });
});

describe("P1-7 essential measurement", () => {
  it("classifies essential first, including retirement spending and selected extra essential expenses, without changing the projection", () => {
    const p = retirementProfile(), c = retirementCommand(); c.monthlyContribution = "0";
    p.expenses = { status: "KNOWN", entries: [
      { id: "essential", label: "Food", category: "ESSENTIAL", amount: known("80"), currency: "VND", startMonth: "2026-10", endMonth: null, frequency: "MONTHLY" },
      { id: "optional", label: "Trips", category: "OPTIONAL", amount: known("60"), currency: "VND", startMonth: "2026-10", endMonth: null, frequency: "MONTHLY" },
    ] };
    c.retirementAdditionalExpenseIds = ["essential", "optional"];
    const r = prepared(p, c), before = JSON.stringify(r), e = essentialCoverage(p, c, r);
    expect(e.rows[0]).toMatchObject({ essentialExpense: "80", essentialShortfall: "0", otherShortfall: "40" });
    expect(e.rows[3]).toMatchObject({ essentialExpense: "180", essentialShortfall: "180", otherShortfall: "60" });
    expect(e).toMatchObject({ essentialShortfall: "540", firstEssentialShortfallMonth: "2027-01" });
    expect(JSON.stringify(r)).toBe(before);
    e.rows.forEach((row, i) => expect(new D(row.essentialShortfall!).plus(row.otherShortfall!).toFixed()).toBe(r.calculation!.rows[i].unfundedWithdrawal));
  });
  it("uses funded balances without carrying old deficits into new essential shortfalls", () => {
    const p = retirementProfile(), c = retirementCommand(); c.monthlyContribution = "0";
    p.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("150"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] };
    const e = essentialCoverage(p, c, prepared(p, c));
    expect(e.rows.slice(3).map(r => r.essentialShortfall)).toEqual(["0", "50", "100"]);
    expect(e.firstEssentialShortfallMonth).toBe("2027-02");
  });
});

describe("P1-8 bounded adjustments on the same engine", () => {
  it("finds earliest retirement and maximum expense and checks the neighbouring infeasible choices", () => {
    const p = retirementProfile(), c = retirementCommand(), cfg = retirementConfiguration(); c.monthlyExpenseToday = "150";
    if (p.income.status === "KNOWN") p.income.entries[0].endMonth = null;
    const r = prepared(p, c), result = adjustmentOptions(p, c, cfg.policy, cfg.assumptions, r);
    expect(result).toMatchObject({ status: "READY", earliestFeasibleRetirementMonth: "2027-02", maximumFeasibleMonthlyExpenseToday: "100", requiredMonthlyContribution: "150" });
    expect(isFunded(prepared(p, { ...c, whatIf: { retirementMonth: "2027-02" } }))).toBe(true);
    expect(isFunded(prepared(p, { ...c, monthlyExpenseToday: "100.01" }))).toBe(false);
    expect(result.evaluations).toBeLessThanOrEqual(130);
  });
  it("does not extend endMonth or invent income/returns when no option can succeed", () => {
    const p = retirementProfile(), c = retirementCommand(), cfg = retirementConfiguration(); c.monthlyContribution = "0"; c.terminalBalance = "1";
    const before = JSON.stringify({ p, c, cfg }), r = adjustmentOptions(p, c, cfg.policy, cfg.assumptions, prepared(p, c));
    expect(r).toMatchObject({ status: "NOT_FEASIBLE", earliestFeasibleRetirementMonth: null, maximumFeasibleMonthlyExpenseToday: null, endMonth: c.endMonth });
    expect(JSON.stringify({ p, c, cfg })).toBe(before);
  });
  it("does not claim an earliest date when a dated contribution prevents evaluating earlier months", () => {
    const p = retirementProfile(), c = retirementCommand(), cfg = retirementConfiguration(); c.monthlyExpenseToday = "1000";
    c.retirementContributionSchedule = [{ month: "2027-01", amount: "0" }];
    expect(adjustmentOptions(p, c, cfg.policy, cfg.assumptions, prepared(p, c)).retirementSearchStatus).toBe("REVIEW_REQUIRED");
  });
  it("checks disconnected feasible dates instead of assuming later retirement always improves the result", () => {
    const p = retirementProfile(), c = retirementCommand(), cfg = retirementConfiguration(); c.monthlyContribution = "0"; c.endMonth = "2027-07";
    p.income = empty();
    p.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("500"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] };
    p.expenses = { status: "KNOWN", entries: [{ id: "dated", label: "Dated expense", category: "OPTIONAL", amount: known("1000"), currency: "VND",
      frequency: "ONCE", startMonth: "2027-03", endMonth: "2027-03" }] };
    const r = adjustmentOptions(p, c, cfg.policy, cfg.assumptions, prepared(p, c));
    expect(r.earliestFeasibleRetirementMonth).toBe("2027-03");
    expect(isFunded(prepared(p, { ...c, whatIf: { retirementMonth: "2027-04" } }))).toBe(false);
  });
  it("bounds work and never labels an uncertified retirement month as earliest", () => {
    const p = retirementProfile(), c = retirementCommand(), cfg = retirementConfiguration();
    c.monthlyContribution = "0"; c.terminalBalance = "1"; c.endMonth = "2034-03";
    const years = Array.from({ length: 9 }, (_, i) => 2026 + i);
    cfg.assumptions.projectionEndYear = 2034;
    cfg.assumptions.sources.filter(s => s.id === "FORECAST" || s.id === "RETURNS").forEach(s => { s.toYear = 2034; });
    cfg.assumptions.inflation = years.map(year => ({ ...cfg.assumptions.inflation[0], year }));
    cfg.assumptions.returns = years.flatMap(year => cfg.assumptions.returns.filter(r => r.year === 2026).map(r => ({ ...r, year })));
    cfg.policy.scenarios.forEach(s => { s.years = years.map(year => ({ ...s.years[0], year })); });
    const original = prepareRetirement(p, c, cfg.policy, cfg.assumptions);
    expect(original.status, JSON.stringify(original.issues)).toBe("READY");
    const r = adjustmentOptions(p, c, cfg.policy, cfg.assumptions, original);
    expect(r).toMatchObject({ status: "REVIEW_REQUIRED", earliestFeasibleRetirementMonth: null, evaluations: 65 });
    expect(r.issues).toContain("RETIREMENT_SEARCH_LIMIT_REVIEW_REQUIRED");
  });
});

describe("P1-9 optional advisory fees", () => {
  it.each(["FUND", "EXTERNAL"] as const)("charges %s from funded average AUM, 1/12 year; affects the correct cashflow and replays exactly", paidFrom => {
    const p = retirementProfile(), c = retirementCommand();
    p.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("1200"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] };
    c.monthlyContribution = "0";
    const old = prepared(p, c), input = { ...c, advisoryFee: { annualPercent: "12", paidFrom } }, r = prepared(p, input);
    const feeRows = applyAdvisoryFee(old.replayInput!.rows, "1200", "2027-01", input);
    expect(feeRows[0]).toMatchObject({ advisoryFeeAverageFund: "1200", advisoryFeeAmount: "12", advisoryFeePaidFrom: paidFrom });
    expect(r.calculation!.rows[0]).toMatchObject(paidFrom === "FUND" ? { withdrawal: "12", closingBalance: "1188", additionalExpense: "0" }
      : { withdrawal: "0", closingBalance: "1200", additionalExpense: "12", uninvestedSurplus: "88" });
    expect(projectRetirement(r.replayInput!).rows).toEqual(r.calculation!.rows);
    expect(projectRetirement(r.replayInput!).summary).toEqual(r.calculation!.summary);
  });
  it("has no absent fee defaults, zero fee preserves numbers and external fees reduce deposits", () => {
    const p = retirementProfile(), c = retirementCommand(), old = prepared(p, c);
    expect("advisoryFee" in retirementPreviewSchema.parse(c)).toBe(false);
    expect(applyAdvisoryFee(old.replayInput!.rows, "0", "2027-01", c)).toBe(old.replayInput!.rows);
    const zero = prepared(p, { ...c, advisoryFee: { annualPercent: "0", paidFrom: "FUND" } });
    expect(zero.calculation!.summary).toEqual(old.calculation!.summary);
    const ext = prepared(p, { ...c, advisoryFee: { annualPercent: "12", paidFrom: "EXTERNAL" } });
    expect(ext.calculation!.rows[0]).toMatchObject({ contribution: "99.5", additionalExpense: "0.5" });
    expect(retirementPreviewSchema.safeParse({ ...c, advisoryFee: { annualPercent: "-1", paidFrom: "FUND" } }).success).toBe(false);
    expect(retirementPreviewSchema.safeParse({ ...c, advisoryFee: { annualPercent: "1", paidFrom: "OTHER" } }).success).toBe(false);
  });
  it("does not charge fictitious negative fund assets; respects start deposit timing and capital releases", () => {
    const p = retirementProfile(), c = retirementCommand(); c.monthlyContribution = "0";
    const r = prepared(p, c), fees = applyAdvisoryFee(r.replayInput!.rows, "0", "2027-01", { ...c, advisoryFee: { annualPercent: "12", paidFrom: "FUND" } });
    expect(fees.every(r => r.advisoryFeeAmount === "0")).toBe(true);
    const row = { ...r.replayInput!.rows[0], contribution: "100", plannedContribution: "100", contributionCapacity: "100", growthFactor: "2", capitalInjection: "200" };
    const fee = applyAdvisoryFee([row], "1000", "2027-01", { ...c, contributionTiming: "START_OF_MONTH", advisoryFee: { annualPercent: "12", paidFrom: "FUND" } })[0];
    expect(fee).toMatchObject({ advisoryFeeAverageFund: "1700", advisoryFeeAmount: "17" });
  });
});

describe("P1-10 / P0 preview and read-only contracts", () => {
  it("generates structured Vietnamese explanations with actual figures and unresolved policy review", () => {
    const f = golden(); f.p.employerConcentration = known("HIGH");
    const r = prepared(), loss = assessLossConstraint(f.capital, f.p, f.policy, f.holdings), explanations = decisionExplanations(f.p, f.capital, loss, r);
    expect(explanations.map(e => e.code)).toEqual(expect.arrayContaining(["GOAL_CAPITAL_RESERVED", "GROWTH_CAPITAL", "PORTFOLIO_HORIZON", "LOSS_CONSTRAINT", "PLAN_FUNDED", "REVIEW_REQUIRED"]));
    expect(explanations.find(e => e.code === "GOAL_CAPITAL_RESERVED")).toMatchObject({ parameters: { presentValue: f.capital.goals[0].presentValue, dueMonth: "2029-10" } });
    expect(explanations[0].text).toContain("Học phí");
  });
  it("logs only allowlisted coverage codes, once per response, with no profile/request data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logPreviewCoverage([{ code: "POLICY_NOT_COVERED" }, { code: "POLICY_NOT_COVERED" }, { code: "PROJECTION_NOT_COVERED" }, { code: "ASSET_HORIZON_NOT_COVERED" }, { code: "PRIVATE_VALUE" }], "/api/v1/me/retirement/preview");
    expect(warn).toHaveBeenCalledTimes(3);
    for (const call of warn.mock.calls) expect(Object.keys(JSON.parse(call[0]))).toEqual(["time", "level", "event", "route", "code"]);
    const f = await plansFixture(); warn.mockClear();
    const r = await f.retirement.preview(f.owner, { ...f.command.preview, endMonth: "2040-12" });
    expect(r.status).toBe("INCOMPLETE"); expect(warn.mock.calls.some(c => JSON.parse(c[0]).code === "POLICY_NOT_COVERED")).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(f.owner);
  });
  it("adds truncation warnings on detail/version/report without changing stored snapshots or replay", async () => {
    const f = await plansFixture(), saved = await f.create();
    await f.db.retirementGoal.create({ data: { userId: f.owner, targetRetirementAge: 60, lifeExpectancy: 82, lifestyle: "test", monthlyExpense: "100", monthlyContribution: "100" } });
    await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID());
    const before = JSON.stringify(f.rows("planVersion"));
    const read = await f.plans.version(f.owner, saved.planId, saved.saved.id, true);
    expect(read.readWarnings![0]).toMatchObject({ code: "PLAN_HORIZON_TRUNCATED", endMonth: "2027-03", expectedEndMonth: "2072-04" });
    expect((await f.plans.get(f.owner, saved.planId)).readWarnings).toEqual(read.readWarnings);
    expect((await f.plans.report(f.owner, saved.planId, {})).readWarnings).toEqual(read.readWarnings);
    expect("replay" in read && read.replay.matched).toBe(true); expect(JSON.stringify(f.rows("planVersion"))).toBe(before);
    const p = retirementProfile();
    expect(planHorizonWarnings(p, "2072-04", { lifeExpectancy: 82, revision: 1 })).toEqual([]);
    expect(planHorizonWarnings(p, "2072-05", { lifeExpectancy: 82, revision: 1 })).toEqual([]);
    expect(planHorizonWarnings(p, "2027-03", null)).toEqual([]);
    p.personal.birthMonth = unknown; expect(planHorizonWarnings(p, "2027-03", { lifeExpectancy: 82, revision: 1 })).toEqual([]);
  });
  it("preserves absent-fee hash and pinned replay while fee input changes hash; generated API accepts enriched response", async () => {
    const f = await plansFixture(), input = { ...f.command.preview, advisoryFee: { annualPercent: "1", paidFrom: "FUND" as const } };
    const capture = await f.retirement.capture(f.db, f.owner, f.command.preview), baseline = f.retirement.evaluate(capture, f.command.preview);
    const oldPreview = await f.retirement.preview(f.owner, f.command.preview), feePreview = await f.retirement.preview(f.owner, input);
    expect(oldPreview.inputHash).toBe(baseline.inputHash); expect(oldPreview.replayInput).toEqual(baseline.replayInput);
    expect(feePreview.inputHash).not.toBe(baseline.inputHash);
    const saved = await f.plans.createVersion(f.owner, null, { expectedRevision: 0, expectedInputHash: feePreview.inputHash, preview: input }, randomUUID());
    const replay = await f.plans.version(f.owner, saved.planId, saved.saved.id, true);
    expect("replay" in replay && replay.replay.matched).toBe(true);
    await expect(new ActualsService(f.db).forecast(f.owner, { planId: saved.planId, versionId: saved.saved.id, throughMonth: "2026-10" }))
      .rejects.toMatchObject({ code: "ADVISORY_FEE_REFORECAST_REVIEW_REQUIRED" });
    const doc = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, date: true, uri: true } });
    const validate = ajv.compile(doc.components.schemas.RetirementPreviewEnvelope);
    expect(validate({ data: feePreview, meta: { requestId: randomUUID() } }), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ data: baseline, meta: { requestId: randomUUID() } }), JSON.stringify(validate.errors)).toBe(true);
  });
});
