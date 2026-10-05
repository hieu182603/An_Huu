import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { addMonths } from "../common/calendar";
import { RetirementDecimal as D, projectRetirement, type ProjectionInput, type MonthlyInput } from "../modules/retirement/engine";
import { prepareRetirement } from "../modules/retirement/prepare";
import { retirementPreviewSchema } from "../modules/retirement/schema";
import { retirementCommand, retirementConfiguration, retirementProfile } from "./retirement-fixtures";
import { known, fixtureAsset, unknown } from "./profile-v2-fixtures";
import { debtFixture, loanFixture } from "./debt-fixtures";
import { declaredPension } from "./pension-fixtures";
import { RetirementService } from "../modules/retirement/service";
import { ProfileService } from "../modules/profiles/service";
import { AuthService } from "../modules/auth/service";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService } from "../modules/portfolios/service";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
import { createApp } from "../app";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";

function core(acc = 2, retired = 2): ProjectionInput {
  return { valuationDate: "2026-01-01", retirementMonth: addMonths("2026-01", acc), initialCapital: "0", terminalBalance: "0",
    monthlyContribution: "100", contributionTiming: "END_OF_MONTH", rows: Array.from({ length: acc + retired }, (_, i): MonthlyInput => ({
      month: addMonths("2026-01", i), growthFactor: "1", inflationFactor: "1", income: i < acc ? "100" : "0", pension: "0",
      livingExpense: i < acc ? "0" : "100", additionalExpense: "0", debtPayment: "0", plannedContribution: i < acc ? "100" : "0",
      contribution: i < acc ? "100" : "0", contributionCapacity: i < acc ? "100" : "0", withdrawal: i < acc ? "0" : "100",
      uninvestedSurplus: "0", capitalInjection: "0",
    })) };
}
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("T06 independent monthly golden cases", () => {
  it("zero interest is P + c*n and PV is sum of withdrawals plus terminal L", () => {
    const p = core(3, 2); p.initialCapital = "25"; p.terminalBalance = "75";
    const r = projectRetirement(p);
    expect(r.summary.atRetirement).toMatchObject({ projectedFund: "325", requiredFund: "275", fundingGap: "-50" });
    expect(r.summary.additionalMonthlyContribution).toBe("0");
    expect(r.summary.terminalBalance).toBe("125");
    expect(r.rows.map(r => r.closingBalance)).toEqual(["125", "225", "325", "225", "125"]);
  });
  it("matches annuity FV independently for Q12 and Q13 without extra growth on initial capital", () => {
    const p = core(12, 1); p.initialCapital = "1000000"; p.monthlyContribution = "1000000";
    p.rows.forEach((r, i) => { r.growthFactor = "1.01"; if (i < 12) r.contribution = "1000000"; });
    const factor = Math.pow(1.01, 12), fv = 1000000 * factor + 1000000 * (factor - 1) / 0.01;
    expect(Number(projectRetirement(p).summary.atRetirement.projectedFund)).toBeCloseTo(fv, 5);
    p.contributionTiming = "START_OF_MONTH_RESEARCH";
    expect(Number(projectRetirement(p).summary.atRetirement.projectedFund)).toBeCloseTo(1000000 * factor + (fv - 1000000 * factor) * 1.01, 5);
  });
  it("PV withdraws at month END and includes nominal terminal balance", () => {
    const p = core(0, 2); p.rows.forEach(r => r.growthFactor = "1.1"); p.terminalBalance = "50";
    const r = projectRetirement(p);
    expect(Number(r.summary.atRetirement.requiredFund)).toBeCloseTo(100 / 1.1 + 150 / 1.1 ** 2, 12);
    expect(r.summary.savingsStatus).toBe("NO_ACCUMULATION_PERIOD");
    expect(r.summary.requiredConstantMonthlyContribution).toBeNull();
  });
  it("retains losses, signed balances and counts NEW unfunded demand only", () => {
    const p = core(0, 3); p.initialCapital = "50"; p.rows.forEach(r => r.growthFactor = "0.9");
    const r = projectRetirement(p);
    expect(r.rows.map(r => r.closingBalance)).toEqual(["-55", "-149.5", "-234.55"]);
    expect(r.summary.firstShortfallMonth).toBe("2026-01");
    expect(r.summary.unfundedWithdrawals).toBe("255");
    expect(r.rows.map(r => r.unfundedWithdrawal)).toEqual(["55", "100", "100"]);
  });
  it("does not let a later capital release conceal an earlier liquidity shortfall", () => {
    const p = core(0, 2); p.rows[1].capitalInjection = "200";
    const r = projectRetirement(p);
    expect(r.summary.algebraicRequiredFund).toBe("0");
    expect(r.summary.atRetirement.requiredFund).toBe("100");
    expect(r.summary.liquidityReserveAboveAlgebraicPV).toBe("100");
    expect(r.summary.firstShortfallMonth).toBe("2026-01");
    expect(r.summary.terminalBalance).toBe("0");
    expect(r.summary.unfundedWithdrawals).toBe("100");
  });
  it("K=0 is undefined coverage, while A>K retains percentage above 100", () => {
    const p = core(0, 1); p.initialCapital = "250";
    expect(projectRetirement(p).summary.atRetirement.coveragePercent).toBe("250");
    p.rows[0].withdrawal = "0";
    expect(projectRetirement(p).summary.atRetirement.coveragePercent).toBeNull();
  });
  it("solves constant and incremental deposits separately for variable periods and early deficits", () => {
    const p = core(2, 1); p.rows[0].contribution = "0"; p.rows[0].withdrawal = "50";
    p.rows[1].contribution = "100"; p.rows[1].capitalInjection = "100";
    const r = projectRetirement(p);
    // Terminal-only solver would say 25/month; first-month liquidity needs 50.
    expect(r.summary.requiredConstantMonthlyContribution).toBe("50");
    expect(r.summary.additionalMonthlyContribution).toBe("50");
    expect(r.summary.atRetirement.projectedFund).toBe("150");
  });
  it("does not round large inputs or chart/summary intermediate amounts", () => {
    const p = core(1, 1); p.initialCapital = "9007199254740993.25"; p.rows[0].growthFactor = "1.0001";
    const r = projectRetirement(p), expected = new D("9007199254740993.25").mul("1.0001").plus(100).toFixed();
    expect(r.summary.atRetirement.projectedFund).toBe(expected); expect(r.rows[0].closingBalance).toBe(expected);
  });
  it("solves a variable-return annuity without using a fixed-rate shortcut", () => {
    const p = core(2, 1); p.rows[0].growthFactor = "1.1"; p.rows[1].growthFactor = "0.9";
    p.rows[2].growthFactor = "1.2"; p.initialCapital = "10";
    const r = projectRetirement(p);
    // End deposits: 10*1.1*0.9 + c*0.9 + c; required retirement = 100/1.2.
    expect(Number(r.summary.requiredConstantMonthlyContribution)).toBeCloseTo((100 / 1.2 - 9.9) / 1.9, 12);
    expect(Number(r.summary.atValuation.requiredFund)).toBeCloseTo(100 / 1.2 / 0.99, 12);
    expect(r.summary.atRetirement.projectedFund).toBe("199.9");
  });
  it("checks required balances against independently simulated remaining liabilities", () => {
    const p = core(2, 3); p.rows[0].growthFactor = "0.99"; p.rows[2].growthFactor = "1.02"; p.terminalBalance = "30";
    const result = projectRetirement(p);
    // Inject the solver's constant monthly amount. Compare at high precision,
    // allowing only Decimal division's residual, never an output money rounding.
    const required = result.summary.requiredConstantMonthlyContribution!;
    p.rows.slice(0, 2).forEach(r => r.contribution = required);
    expect(new D(projectRetirement(p).summary.terminalBalance).minus(30).abs().lt("1e-35")).toBe(true);
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const expected = new D(row.openingBalance).mul(row.growthFactor).plus(row.contribution).plus(row.capitalInjection).minus(row.withdrawal);
      expect(expected.toFixed()).toBe(row.closingBalance);
    }
  });
});
describe("T06 profile / debt / assumptions / pension adapter", () => {
  const run = (p = retirementProfile(), c = retirementCommand(), cfg = retirementConfiguration()) => prepareRetirement(p, c, cfg.policy, cfg.assumptions);
  it("zero-rate golden integrates three contributions followed by three withdrawals", () => {
    const r = run(); expect(r.status).toBe("READY");
    expect(r.calculation?.summary.atRetirement).toMatchObject({ projectedFund: "300", requiredFund: "300", fundingGap: "0", coveragePercent: "100" });
    expect(r.calculation?.rows.map(r => r.closingBalance)).toEqual(["100", "200", "300", "200", "100", "0"]);
    expect(projectRetirement(r.replayInput!).rows).toEqual(r.calculation?.rows);
  });
  it("uses annual inflation across January, independently of investment returns", () => {
    const cfg = retirementConfiguration(); cfg.assumptions.inflation.find(r => r.year === 2027)!.percent = "12";
    const r = run(undefined, undefined, cfg).calculation!;
    expect(r.rows[3].livingExpense).toBe("100");
    expect(Number(r.rows[4].livingExpense)).toBeCloseTo(100 * 1.12 ** (1 / 12), 10);
    expect(r.rows[4].growthFactor).toBe("1");
  });
  it("does not deduct debt principal from initial capital; debt caps affordable deposits", () => {
    const p = retirementProfile(); p.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("1000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] };
    p.debts = { status: "KNOWN", entries: [debtFixture()] };
    const r = run(p).calculation!;
    expect(r.summary.initialRetirementCapital).toBe("1000"); expect(r.netWorth).toBe("0");
    expect(r.rows[0]).toMatchObject({ debtPayment: "110", contribution: "0", withdrawal: "10", closingBalance: "990" });
  });
  it("shared stress replaces base share, never adds the whole payment twice", () => {
    const p = retirementProfile(); p.debts = { status: "KNOWN", entries: [debtFixture({ paymentShare: known("0.5"), balanceShare: known("0.5") })] };
    const c = retirementCommand(); c.debtStress = [{ loanId: "loan-a", startMonth: "2026-10", endMonth: "2026-10", totalPaymentShare: "1" }];
    expect(run(p).calculation?.rows[0].debtPayment).toBe("55");
    expect(run(p, c).calculation?.rows[0].debtPayment).toBe("110");
    p.debts.entries[0].responsibility = unknown;
    expect(run(p, c).issues.some(i => i.code === "FULL_LIABILITY_CONFIRMATION_REQUIRED")).toBe(true);
  });
  it("pension arrives late, unknown is explicit, and retirement surplus is not auto-invested", () => {
    const p = retirementProfile(); p.pension = { ...declaredPension(), monthlyAmount: "150", basisMonth: "2027-02" };
    p.personal.pensionStartMonth = known("2027-02");
    const r = run(p).calculation!;
    expect(r.rows[3]).toMatchObject({ pension: "0", withdrawal: "100" });
    expect(r.rows[4]).toMatchObject({ pension: "150", withdrawal: "0", contribution: "0", uninvestedSurplus: "50" });
    const c = retirementCommand(); c.retirementContributionSchedule = [{ month: "2027-02", amount: "25" }];
    expect(run(p, c).calculation?.rows[4]).toMatchObject({ contribution: "25", uninvestedSurplus: "25" });
    p.pension = unknown;
    expect(run(p).warnings.some(w => w.code === "PENSION_NOT_INCLUDED")).toBe(true);
  });
  it("requires complete debts/selected cashflows and preserves the difference between unknown and zero", () => {
    const p = retirementProfile(); p.debts = unknown;
    expect(run(p).status).toBe("INCOMPLETE");
    p.debts = { status: "KNOWN", entries: [] }; p.income = unknown;
    expect(run(p).status).toBe("INCOMPLETE");
    const c = retirementCommand(); c.retirementIncomeIds = ["missing"];
    expect(run(undefined, c).status).toBe("INCOMPLETE");
    c.retirementIncomeIds = []; c.monthlyExpenseToday = "0"; c.monthlyContribution = "0";
    expect(run(undefined, c).calculation?.summary.atRetirement.coveragePercent).toBeNull();
  });
  it("one-off income and explicit variable deposits never leak to the next month", () => {
    const p = retirementProfile();
    if (p.income.status !== "KNOWN") throw new Error("fixture");
    p.income.entries.push({ ...p.income.entries[0], id: "bonus", amount: known("1000"), startMonth: "2026-11", endMonth: "2026-11", frequency: "ONCE" });
    const c = retirementCommand(); c.contributionSchedule = [{ month: "2026-11", amount: "500" }];
    expect(run(p, c).calculation?.rows.slice(0, 3).map(r => [r.income, r.contribution])).toEqual([["100", "100"], ["1100", "500"], ["100", "100"]]);
  });
  it("takes fees only once from the T04 net factor and uses the selected scenario", () => {
    const cfg = retirementConfiguration(), c = retirementCommand();
    c.scenario = "ADVERSE";
    const r = run(undefined, c, cfg).calculation!;
    expect(r.marketRows[0].returnMonthlyFactor).toBe(r.rows[0].growthFactor);
    expect(Number(r.rows[0].growthFactor)).toBeCloseTo(0.98 ** (1 / 12), 14);
    expect(Number(r.rows[0].inflationFactor)).toBeCloseTo(1.01 ** (1 / 12), 14);
  });
  it("charges actual turnover cost once when a drifting allocation is rebalanced", () => {
    const cfg = retirementConfiguration(), c = retirementCommand();
    cfg.assumptions.returns.filter(r => r.assetClass === "STOCK").forEach(r => r.rate = { type: "EFFECTIVE_ANNUAL", percent: "12" });
    cfg.policy.templates.find(t => t.id === "GROWTH")!.rebalance.turnoverCostPercent = "1";
    c.answers.forEach(a => a.choiceId = "HIGH"); c.liquidityNeedMonths = 24;
    const result = run(undefined, c, cfg).calculation!;
    const stock = 1.12 ** (1 / 12), stockWeight = stock ** 3 / (1 + stock ** 3);
    const expectedFactor = (1 - (stockWeight - 0.5) * 0.01) * (0.5 + 0.5 * stock);
    expect(Number(result.marketRows[3].rebalanceCostFraction)).toBeGreaterThan(0);
    expect(Number(result.rows[3].growthFactor)).toBeCloseTo(expectedFactor, 14);
    expect(Number(result.rows[3].closingBalance)).toBeCloseTo(Number(result.rows[3].openingBalance) * expectedFactor - 100, 10);
  });
  it("immediate retirement has no deposit division and does not carry salary without explicit selection", () => {
    const p = retirementProfile(), c = retirementCommand(); p.personal.desiredRetirementMonth = known("2026-10"); c.endMonth = "2026-10";
    const r = run(p, c).calculation!;
    expect(r.rows[0]).toMatchObject({ income: "0", closingBalance: "-100", unfundedWithdrawal: "100" });
    expect(r.summary).toMatchObject({ accumulationMonths: 0, additionalMonthlyContribution: null, firstShortfallMonth: "2026-10" });
    expect(() => run(p, { ...c, endMonth: "2026-09" })).toThrow();
    expect(() => run(p, { ...c, endMonth: "2126-10" })).toThrow();
  });
  it("converts a declared TODAY pension with scenario CPI once, then keeps it nominal", () => {
    const p = retirementProfile(), c = retirementCommand(), cfg = retirementConfiguration();
    p.personal.pensionStartMonth = known("2027-01");
    p.pension = { ...declaredPension(), monthlyAmount: "100", priceBasis: "TODAY", basisMonth: "2026-10" };
    c.scenario = "ADVERSE";
    const r = run(p, c, cfg).calculation!;
    expect(Number(r.rows[3].pension)).toBeCloseTo(100 * 1.01 ** (3 / 12), 12);
    expect(r.rows[4].pension).toBe(r.rows[3].pension);
    cfg.assumptions.inflation = cfg.assumptions.inflation.filter(r => r.year !== 2027);
    expect(run(p, c, cfg).status).toBe("INCOMPLETE");
  });
  it("linked rent is included once and cash reserves reduce affordable deposits", () => {
    const p = retirementProfile(), c = retirementCommand();
    if (p.income.status !== "KNOWN") throw new Error("fixture");
    p.income.entries.push({ ...p.income.entries[0], id: "rent", source: "OTHER", endMonth: null, amount: known("200") });
    p.assets = { status: "KNOWN", entries: [fixtureAsset({ type: "REAL_ESTATE", retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0"),
      housingPlan: { status: "CONFIRMED", kind: "RENT", startMonth: "2026-10", netAmount: known("200") } })] };
    c.housing = [{ assetId: "deposit-1", amountScope: "OWNERS_SHARE", linkedIncomeId: "rent" }]; c.retirementIncomeIds = ["rent"]; c.monthlyReserve = "250";
    const r = run(p, c).calculation!;
    expect(r.rows[0]).toMatchObject({ income: "300", contribution: "50", budgetShortfall: "50" });
    expect(r.rows[3]).toMatchObject({ income: "200", contribution: "0", uninvestedSurplus: "100" });
  });
  it("includes only the owned retirement share and defers unavailable cash until its declared month", () => {
    const p = retirementProfile(); p.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("1000"), ownershipShare: known("0.5"),
      retirementShare: known("0.6"), availableFromMonth: known("2026-12") })] };
    const r = run(p).calculation!;
    expect(r.summary.initialRetirementCapital).toBe("0");
    expect(r.rows[2].capitalInjection).toBe("300");
    expect(r.netWorth).toBe("500");
  });
  it("releases confirmed property proceeds only once and requires amount-scope confirmation", () => {
    const p = retirementProfile(); p.assets = { status: "KNOWN", entries: [fixtureAsset({ type: "PRIMARY_HOME", retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0"),
      ownershipShare: known("0.5"), housingPlan: { status: "CONFIRMED", kind: "SALE", startMonth: "2027-02", netAmount: known("400") } })] };
    expect(run(p).status).toBe("INCOMPLETE");
    const c = retirementCommand(); c.housing = [{ assetId: "deposit-1", amountScope: "WHOLE_ASSET" }];
    const r = run(p, c).calculation!;
    expect(r.summary.initialRetirementCapital).toBe("0");
    expect(r.rows.map(r => r.capitalInjection)).toEqual(["0", "0", "0", "0", "200", "0"]);
  });
  it("public input rejects rate/timing/result overrides and overlapping stress", () => {
    for (const injected of [{ annualReturnRate: "9" }, { initialCapital: "500" }, { userId: "other" }, { contributionTiming: "START_OF_MONTH_RESEARCH" }])
      expect(retirementPreviewSchema.safeParse({ ...retirementCommand(), ...injected }).success).toBe(false);
    const stress = { loanId: "x", startMonth: "2026-10", endMonth: "2026-11", totalPaymentShare: "1" };
    expect(retirementPreviewSchema.safeParse({ ...retirementCommand(), debtStress: [stress, stress] }).success).toBe(false);
  });
});

describe("T06 stored, version-pinned preview", () => {
  it("uses owner/revision and approved versions, replays without writing plans or jobs", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db), auth = new AuthService(f.db, config);
    const assumptions = new AssumptionsService(f.db), policies = new PortfoliosService(f.db), retirement = new RetirementService(f.db);
    const cfg = retirementConfiguration();
    const a = await assumptions.create("admin", cfg.assumptions);
    const impact = await assumptions.previewImpact("admin", a.id, { expectedRevision: 1 });
    await assumptions.approve("admin", a.id, { expectedRevision: 1, impactToken: impact.impactToken, reviewNote: "Fixture reviewed" });
    await assumptions.publish("admin", a.id, { expectedRevision: 2, confirm: true });
    const policy = await policies.create("admin", { ...cfg.policy, assumptionVersionId: a.id });
    await policies.approve("admin", policy.id, { expectedRevision: 1, reviewNote: "Fixture review", confirm: true });
    await policies.publish("admin", policy.id, { expectedRevision: 2, confirm: true });
    await profiles.saveDraft("test-user", 0, "summary", retirementProfile());
    await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    vi.spyOn(auth, "validateSession").mockResolvedValue({ id: "test-user", role: "USER" } as never);
    const app = createApp({ config, services: { auth, profiles, retirement } });
    const call = (body: object, role: "USER" | "ADMIN" = "USER") => request(app).post("/api/v1/me/retirement/preview").set("Authorization", "Bearer " + token(role)).send(body);
    const command = retirementCommand(policy.id);
    const before = JSON.stringify([f.rows("financialProfile"), f.rows("retirementPlan"), f.rows("planVersion"), f.rows("outboxEvent"), f.rows("auditLog")]);
    const r = await call(command);
    expect(r.status).toBe(200); expect(r.body.data.status).toBe("READY");
    expect(r.body.data.references.assumptionVersionId).toBe(a.id);
    expect(r.body.data.calculation.summary.atRetirement.requiredFund).toBe("300");
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const validate = new Ajv({ strict: false, formats: { uuid: true, uri: true, date: true, "date-time": true } }).compile(spec.components.schemas.RetirementPreviewEnvelope);
    expect(validate(r.body), JSON.stringify(validate.errors)).toBe(true);
    expect((await call(command)).body.data).toEqual(r.body.data);
    expect(JSON.stringify([f.rows("financialProfile"), f.rows("retirementPlan"), f.rows("planVersion"), f.rows("outboxEvent"), f.rows("auditLog")])).toBe(before);
    expect((await call(command, "ADMIN")).status).toBe(403);
    expect((await request(app).post("/api/v1/me/retirement/preview").send(command)).status).toBe(401);
    expect((await call({ ...command, expectedProfileRevision: 2 })).status).toBe(409);
    expect((await call({ ...command, inflationRate: "4" })).status).toBe(400);
    const missing = await call({ ...command, answers: [] });
    expect(missing.body.data.status).toBe("INCOMPLETE");
    expect(validate(missing.body), JSON.stringify(validate.errors)).toBe(true);
    await expect(retirement.preview("other", command)).rejects.toMatchObject({ status: 404 });
    const newer = await assumptions.create("admin", cfg.assumptions);
    const review = await assumptions.previewImpact("admin", newer.id, { expectedRevision: 1 });
    await assumptions.approve("admin", newer.id, { expectedRevision: 1, impactToken: review.impactToken, reviewNote: "Newer fixture review" });
    await assumptions.publish("admin", newer.id, { expectedRevision: 2, confirm: true });
    expect((await call(command)).body.data).toEqual(r.body.data);
  });
});
