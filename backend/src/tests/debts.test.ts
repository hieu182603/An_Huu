import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { debtPressure, previewDebts } from "../modules/debts/engine";
import { periodRate, comparableAnnualRate, buildContractSchedule, DebtDecimal as D } from "../modules/debts/loan";
import { debtPreviewSchema, loanContractSchema } from "../modules/debts/schema";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { profileV2Schema } from "../modules/profiles/schema-v2";
import { DebtService } from "../modules/debts/service";
import { ProfileService } from "../modules/profiles/service";
import { AuthService } from "../modules/auth/service";
import { createApp } from "../app";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
import { known, unknown, fixtureProfile } from "./profile-v2-fixtures";
import { loanFixture, debtFixture, debtProfile, debtCommand } from "./debt-fixtures";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("T02 contractual debt schedule", () => {
  it("distinguishes nominal, effective annual/monthly and explicit daily interest", () => {
    expect(periodRate({ kind: "NOMINAL_ANNUAL_MONTHLY", percent: "12" }).toFixed()).toBe("0.01");
    expect(periodRate({ kind: "EFFECTIVE_MONTHLY", percent: "1" }).toFixed()).toBe("0.01");
    expect(periodRate({ kind: "EFFECTIVE_ANNUAL", percent: "12" }).toNumber()).toBeCloseTo(0.009488792934583046, 14);
    expect(periodRate({ kind: "SIMPLE_ANNUAL_DAILY", percent: "12", days: 15, yearDays: 360 }).toFixed()).toBe("0.005");
    expect(comparableAnnualRate({ kind: "NOMINAL_ANNUAL_MONTHLY", percent: "12" }).gt(comparableAnnualRate({ kind: "EFFECTIVE_ANNUAL", percent: "12" }))).toBe(true);
  });
  it("matches independent reducing-balance totals and maturity", () => {
    const schedule = buildContractSchedule(debtFixture(), "2026-10-04");
    expect(schedule.status).toBe("READY");
    expect(schedule.rows[0]).toMatchObject({ opening: "1000", principal: "100", interest: "10", closing: "900", userPayment: "110" });
    expect(schedule.rows[9]).toMatchObject({ principal: "100", interest: "1", closing: "0", dueDate: "2027-07-28" });
    expect(schedule.rows.reduce((sum, row) => sum.plus(row.interest), new D(0)).toFixed()).toBe("55");
    expect(profileV2Summary(debtProfile()).values.monthlyDebtService).toBe("110"); // legacy payment=999 cannot override contract
  });
  it("uses rate changes only in their own periods and explicit final balloon", () => {
    const contract = loanFixture();
    contract.periods.forEach((period, i) => { period.rate = { kind: "EFFECTIVE_MONTHLY", percent: i < 2 ? "0" : "2" }; period.repayment = { kind: "INTEREST_ONLY" }; });
    const result = buildContractSchedule(debtFixture({}, contract), "2026-10-04");
    expect(result.rows[0].interest).toBe("0");
    expect(result.rows[1].interest).toBe("0");
    expect(result.rows[2].interest).toBe("20");
    expect(result.rows[9]).toMatchObject({ principal: "1000", interest: "20", closing: "0" });
    contract.settleRemainingAtMaturity = false;
    expect(buildContractSchedule(debtFixture({}, contract), "2026-10-04").issues[0].code).toBe("UNSETTLED_BALANCE_AT_MATURITY");
  });
  it("honors contractual minimum payment and total-payment schedules", () => {
    const contract = loanFixture();
    contract.periods[0].repayment = { kind: "TOTAL_PAYMENT", amount: "50" };
    contract.periods[0].minimumPayment = "60";
    expect(buildContractSchedule(debtFixture({}, contract), "2026-10-04").rows[0]).toMatchObject({ principal: "50", interest: "10" });
    contract.periods[0].minimumPayment = "0"; contract.periods[0].repayment.amount = "1";
    expect(buildContractSchedule(debtFixture({}, contract), "2026-10-04").issues[0].code).toBe("NEGATIVE_AMORTIZATION_UNSUPPORTED");
  });
  it("rejects gaps, duplicates, invalid dates and unsupported rate guesses", () => {
    expect(loanContractSchema.safeParse({ ...loanFixture(), periods: [] }).success).toBe(false);
    const contract = loanFixture();
    contract.periods[1].dueDate = contract.periods[0].dueDate;
    expect(loanContractSchema.safeParse(contract).success).toBe(false);
    expect(loanContractSchema.safeParse({ ...loanFixture(), maturityDate: "2027-02-30" }).success).toBe(false);
    expect(loanContractSchema.safeParse({ ...loanFixture(), periods: [{ ...loanFixture().periods[0], rate: { kind: "APR", percent: "12" } }] }).success).toBe(false);
  });
  it("reports missing or mismatched contract data without substituting a payment", () => {
    const debt = debtFixture(); debt.contract = unknown;
    expect(previewDebts(debtProfile([debt]), debtCommand)).toMatchObject({ status: "INCOMPLETE", baseline: null, issues: [{ loanId: debt.id, code: "LOAN_CONTRACT_REQUIRED" }] });
    const wrongDate = debtFixture({ balanceAsOf: known("2026-09-30") });
    expect(previewDebts(debtProfile([wrongDate]), debtCommand).issues).toContainEqual({ loanId: wrongDate.id, code: "VALUATION_DATE_MISMATCH" });
    expect(previewDebts(debtProfile([debtFixture({ currency: "USD" })]), debtCommand).status).toBe("INCOMPLETE");
  });
  it("does not round large principal or fractional daily interest", () => {
    const contract = loanFixture();
    contract.periods[0].rate = { kind: "SIMPLE_ANNUAL_DAILY", percent: "12", days: 15, yearDays: 360 };
    const result = buildContractSchedule(debtFixture({ outstandingBalance: known("9007199254740993.25") }, contract), "2026-10-04");
    // Exact integer check: 900719925474099325 cents / 200 = 45035996273704.96625 VND.
    expect(result.rows[0].interest).toBe("45035996273704.96625");
    expect(result.rows[0].closing).toBe("9007199254740893.25");
  });
});

describe("T02 disposable-income pressure and joint debt", () => {
  it.each([["2999", "29.99", "LOW_PRESSURE"], ["3000", "30", "REVIEW_DEBT_REDUCTION"], ["5000", "50", "REVIEW_DEBT_REDUCTION"], ["5001", "50.01", "HIGH_PRESSURE"]])("classifies boundary payment %s", (payment, ratio, status) => {
    expect(debtPressure("10000", payment, "0")).toMatchObject({ ratioPercent: ratio, status });
  });
  it("keeps a low ratio and a negative residual visible together", () => {
    expect(debtPressure("20000000", "5000000", "16000000")).toMatchObject({ ratioPercent: "25", status: "LOW_PRESSURE", remainingCash: "-1000000", cashflowStatus: "DEFICIT" });
    for (const income of ["0", "-1"]) expect(debtPressure(income, "5", "0")).toMatchObject({ ratioPercent: null, status: "NO_REPAYMENT_SOURCE" });
    expect(debtPressure(null, "5", "0").status).toBe("INSUFFICIENT_DATA");
    expect(debtPressure("0", "0", "0")).toMatchObject({ ratioPercent: null, status: "UNDEFINED_RATIO" });
  });
  it("replaces 5 million by 10 million only during confirmed stress months", () => {
    const contract = loanFixture();
    contract.periods.forEach(period => { period.rate.percent = "0"; period.repayment = { kind: "PRINCIPAL_PLUS_INTEREST", amount: "10000000" }; });
    const loan = debtFixture({ outstandingBalance: known("100000000"), paymentShare: known("0.5"), balanceShare: known("0.5"), sharedLoanId: "joint-1" }, contract);
    const profile = fixtureProfile({ debts: { status: "KNOWN", entries: [loan] } });
    const result = previewDebts(profile, { ...debtCommand, stress: [{ loanId: loan.id, startMonth: "2026-11", endMonth: "2026-12", totalPaymentShare: "1" }] });
    expect(result.baseline?.rows[0]).toMatchObject({ debtPayment: "5000000", availableForRetirement: "-1000000" });
    expect(result.stress?.result?.rows[0].debtPayment).toBe("5000000");
    expect(result.stress?.result?.rows[1]).toMatchObject({ debtPayment: "10000000", stressIncrease: "5000000", availableForRetirement: "-6000000" });
    expect(result.stress?.result?.rows[3].debtPayment).toBe("5000000");
    expect(result.stress?.result?.rows[1].pressure.ratioPercent).toBe("50");
    expect(result.alternatives[0].issues).toContainEqual({ loanId: loan.id, code: "SHARED_PREPAYMENT_AGREEMENT_REQUIRED" });
    const separateContract = loanFixture();
    separateContract.periods.forEach(period => { period.rate.percent = "0"; period.repayment = { kind: "PRINCIPAL_PLUS_INTEREST", amount: "5000000" }; });
    const separate = debtFixture({ id: "separate", outstandingBalance: known("50000000") }, separateContract);
    const combined = previewDebts(fixtureProfile({ debts: { status: "KNOWN", entries: [loan, separate] } }), {
      ...debtCommand, stress: [{ loanId: loan.id, startMonth: "2026-11", endMonth: "2026-12", totalPaymentShare: "1" }],
    });
    expect(combined.baseline?.rows[1].debtPayment).toBe("10000000");
    expect(combined.stress?.result?.rows[1]).toMatchObject({ debtPayment: "15000000", stressIncrease: "5000000", pressure: { ratioPercent: "75", status: "HIGH_PRESSURE" } });
  });
  it("does not infer full liability from names or allocation, rejects overlap", () => {
    const loan = debtFixture({ paymentShare: known("0.5"), responsibility: unknown });
    const stress = [{ loanId: loan.id, startMonth: "2026-10", endMonth: "2026-11", totalPaymentShare: "1" }];
    expect(previewDebts(debtProfile([loan]), { ...debtCommand, stress }).stress).toMatchObject({ status: "INCOMPLETE", result: null });
    expect(debtPreviewSchema.safeParse({ ...debtCommand, stress: [...stress, ...stress] }).success).toBe(false);
    expect(() => previewDebts(debtProfile([loan]), { ...debtCommand, stress: [{ ...stress[0], totalPaymentShare: "0.2" }] })).toThrow();
  });
  it("counts linked debt once and does not reduce retirement capital by debt", () => {
    const profile = debtProfile();
    profile.expenses = { status: "KNOWN", entries: [{ id: "linked", label: "Debt reference", category: "DEBT_PAYMENT", amount: unknown, loanId: "loan-a", currency: "VND", startMonth: "2026-10", endMonth: "2027-07", frequency: "MONTHLY" }] };
    const summary = profileV2Summary(profileV2Schema.parse(profile));
    expect(summary.values).toMatchObject({ monthlyExpense: "0", monthlyDebtService: "110", retirementLiquidAssets: "60000000", netWorth: "99999000" });
    expect(previewDebts(profile, debtCommand).baseline?.rows[0].debtPayment).toBe(summary.values.monthlyDebtService);
    profile.expenses.entries[0].amount = known("999");
    expect(profileV2Schema.safeParse(profile).success).toBe(false);
  });
});

describe("T02 debt reduction comparisons", () => {
  it("never interprets missing income, expenses or reserve as no shortfall", () => {
    for (const [profile, command, issue] of [
      [{ ...debtProfile(), income: unknown }, debtCommand, "CASHFLOW_REQUIRED"],
      [{ ...debtProfile(), expenses: unknown }, debtCommand, "CASHFLOW_REQUIRED"],
      [debtProfile(), { ...debtCommand, reserveMonthly: null }, "RESERVE_REQUIRED"],
    ] as const) {
      const result = previewDebts(profile, command);
      expect(result.status).toBe("READY"); // contractual schedule remains usable
      expect(result.baseline).toMatchObject({ totals: { firstShortfallMonth: null }, cashflowAssessment: {
        status: "UNAVAILABLE", evaluatedMonths: 0, totalMonths: 12, firstUnknownMonth: "2026-10", shortfallStatus: "UNKNOWN", issues: [issue],
      } });
    }
  });
  it("distinguishes confirmed zero, partial coverage and a known deficit before an unknown month", () => {
    const p = debtProfile();
    p.debts = { status: "KNOWN", entries: [] }; p.income = { status: "KNOWN", entries: [] };
    expect(previewDebts(p, debtCommand).baseline?.cashflowAssessment).toMatchObject({
      status: "COMPLETE", evaluatedMonths: 12, shortfallStatus: "NOT_DETECTED_IN_HORIZON", firstUnknownMonth: null, issues: [],
    });
    const profile = debtProfile();
    if (profile.income.status !== "KNOWN") throw new Error("fixture");
    profile.income.entries.push({ ...profile.income.entries[0], id: "future", amount: unknown, startMonth: "2026-11" });
    expect(previewDebts(profile, debtCommand).baseline?.cashflowAssessment).toMatchObject({
      status: "PARTIAL", evaluatedMonths: 1, firstUnknownMonth: "2026-11", shortfallStatus: "UNKNOWN",
    });
    profile.income.entries[0].amount = known("50");
    expect(previewDebts(profile, debtCommand).baseline).toMatchObject({
      cashflowAssessment: { status: "PARTIAL", shortfallStatus: "DETECTED" }, totals: { firstShortfallMonth: "2026-10" },
    });
  });
  it("matches independent payoff/interest totals and preserves the source", () => {
    const profile = debtProfile(), before = JSON.stringify(profile);
    const result = previewDebts(profile, debtCommand);
    expect(result.baseline?.totals).toMatchObject({ interest: "55", totalPaid: "1055", debtFreeDate: "2027-07-28" });
    const avalanche = result.alternatives[0];
    expect(avalanche.result?.totals).toMatchObject({ interest: "30", totalPaid: "1030", extraPrincipal: "500", debtFreeDate: "2027-02-28" });
    expect(avalanche.interestAndFeesSaved).toBe("25");
    expect(avalanche.retirementCashflowDelta[0].value).toBe("-100");
    expect(JSON.stringify(profile)).toBe(before);
  });
  it("orders avalanche by rate and snowball by balance", () => {
    const high = loanFixture(), low = loanFixture();
    high.periods.forEach(period => { period.rate = { kind: "EFFECTIVE_MONTHLY", percent: "2" }; });
    const loans = [debtFixture({ id: "high" }, high), debtFixture({ id: "small", outstandingBalance: known("500") }, low)];
    const result = previewDebts(debtProfile(loans), debtCommand);
    expect(result.alternatives[0].result?.rows[0].loans.find(row => row.loanId === "high")?.extraPrincipal).toBe("100");
    expect(result.alternatives[1].result?.rows[0].loans.find(row => row.loanId === "small")?.extraPrincipal).toBe("100");
  });
  it("includes prepayment fees even when they make selected payoff worse", () => {
    const contract = loanFixture();
    contract.periods.forEach(period => { if (period.prepayment.status === "ALLOWED") period.prepayment.fixedFee = "100"; });
    const result = previewDebts(debtProfile([debtFixture({}, contract)]), { ...debtCommand, extraMonthlyBudget: "1000", payoffLoanId: "loan-a" });
    const selected = result.alternatives.find(item => item.strategy === "SELECTED_PAYOFF");
    expect(selected?.result?.totals).toMatchObject({ interest: "10", fees: "100", debtFreeDate: "2026-10-28" });
    expect(selected?.interestAndFeesSaved).toBe("-55");
  });
  it("protects expenses/reserve and never takes emergency assets to repay", () => {
    const profile = debtProfile();
    profile.income = { status: "KNOWN", entries: [{ id: "salary", label: "Salary", kind: "FIXED", basis: "DISPOSABLE", currency: "VND", amount: known("150"), startMonth: "2026-10", endMonth: null, frequency: "MONTHLY" }] };
    const result = previewDebts(profile, { ...debtCommand, reserveMonthly: "30", extraMonthlyBudget: "5000" });
    expect(result.alternatives[0].result?.rows[0]).toMatchObject({ extraPrincipal: "10", debtPayment: "120", availableForRetirement: "0" });
    profile.income.entries[0].amount = known("50");
    const short = previewDebts(profile, { ...debtCommand, reserveMonthly: "30" });
    expect(short.alternatives[0].result?.rows[0]).toMatchObject({ extraPrincipal: "0", availableForRetirement: "-90" });
    expect(short.baseline?.totals.firstShortfallMonth).toBe("2026-10");
  });
  it("keeps baseline usable if optimization data is missing", () => {
    const loan = debtFixture();
    if (loan.contract?.status !== "KNOWN") throw new Error("fixture");
    loan.contract.value.periods[0].prepayment = unknown;
    const result = previewDebts(debtProfile([loan]), debtCommand);
    expect(result.baseline?.totals.interest).toBe("55");
    expect(result.alternatives[0]).toMatchObject({ status: "INCOMPLETE", result: null });
    expect(previewDebts(debtProfile(), { ...debtCommand, reserveMonthly: null }).alternatives[0].issues).toContainEqual({ loanId: null, code: "CONFIRMED_BUDGET_REQUIRED" });
    expect(previewDebts({ ...debtProfile(), income: unknown }, debtCommand).alternatives[0].issues).toContainEqual({ loanId: null, code: "CASHFLOW_REQUIRED" });
  });
  it("honors lockout, minimum and full-only constraints", () => {
    const contract = loanFixture();
    contract.periods[0].prepayment = { status: "PROHIBITED", reason: "Locked period" };
    contract.periods[1].prepayment = { ...loanFixture().periods[1].prepayment, status: "ALLOWED", mode: "FULL_ONLY", minimumPrincipal: "0", maximumPrincipal: null, fixedFee: "0", feePercent: "0", effect: "REDUCE_TERM_KEEP_SCHEDULE", funding: "SOLE_BORROWER", evidence: "Fixture" };
    const result = previewDebts(debtProfile([debtFixture({}, contract)]), debtCommand);
    expect(result.alternatives[0].result?.rows[0].extraPrincipal).toBe("0");
    expect(result.alternatives[0].result?.rows[1].extraPrincipal).toBe("0");
  });
  it("reports a short horizon without pretending the debt is paid off", () => {
    expect(() => previewDebts({ ...debtProfile(), valuationDate: "2199-12-01" }, debtCommand)).toThrow("1900–2199");
    const result = previewDebts(debtProfile(), { ...debtCommand, horizonMonths: 1 });
    expect(result.baseline).toMatchObject({ status: "HORIZON_LIMIT", totals: { closingLoanBalance: "900", debtFreeDate: null } });
    expect(result.alternatives[0].result?.totals.closingLoanBalance).toBe("800");
    expect(result.alternatives[0].comparisonScope).toBe("SAME_HORIZON_ONLY");
  });
  it("requires confirmation for pro-rata co-borrower prepayment", () => {
    const contract = loanFixture();
    contract.periods.forEach(period => { if (period.prepayment.status === "ALLOWED") period.prepayment.funding = "PRO_RATA_CONFIRMED"; });
    const result = previewDebts(debtProfile([debtFixture({ paymentShare: known("0.5"), balanceShare: known("0.5"), sharedLoanId: "joint" }, contract)]), debtCommand);
    expect(result.alternatives[0].result?.rows[0].loans[0]).toMatchObject({ principal: "50", interest: "5", extraPrincipal: "100", totalLoanClosingBalance: "700" });
    expect(result.alternatives[0].result?.rows[0].debtPayment).toBe("155");
  });
  it("fits principal plus fixed and percentage fees inside the confirmed budget", () => {
    const contract = loanFixture();
    const policy = contract.periods[0].prepayment;
    if (policy.status !== "ALLOWED") throw new Error("fixture");
    policy.fixedFee = "10"; policy.feePercent = "10"; policy.maximumPrincipal = "50";
    const first = previewDebts(debtProfile([debtFixture({}, contract)]), debtCommand).alternatives[0].result?.rows[0];
    expect(first).toMatchObject({ extraPrincipal: "50", prepaymentFees: "15", debtPayment: "175" });
    policy.minimumPrincipal = "60";
    expect(loanContractSchema.safeParse(contract).success).toBe(false);
  });
  it("does not carry a one-off cash inflow into later repayment budgets", () => {
    const profile = debtProfile();
    profile.income = { status: "KNOWN", entries: [{ id: "once", label: "Once", kind: "BONUS", basis: "DISPOSABLE", currency: "VND", amount: known("300"), startMonth: "2026-10", endMonth: "2026-10", frequency: "ONCE" }] };
    const rows = previewDebts(profile, debtCommand).alternatives[0].result?.rows;
    expect(rows?.[0].extraPrincipal).toBe("100");
    expect(rows?.[1]).toMatchObject({ income: "0", extraPrincipal: "0" });
  });
});

describe("T02 API persistence and contract", () => {
  it("uses the stored owner/revision, refuses injection, stays read-only and conforms to OpenAPI", async () => {
    const f = memoryDb(), auth = new AuthService(f.db, config), profiles = new ProfileService(f.db), debts = new DebtService(f.db);
    const user = await f.db.user.create({ data: { id: "test-user", email: "debt@example.test", fullName: "Fixture", passwordHash: "unused", role: "USER", status: "ACTIVE" } });
    vi.spyOn(auth, "validateSession").mockResolvedValue(user);
    await profiles.saveDraft(user.id, 0, "summary", debtProfile());
    await profiles.complete(user.id, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    const app = createApp({ config, services: { auth, profiles, debts } });
    const before = JSON.stringify([f.rows("financialProfile"), f.rows("retirementPlan"), f.rows("outboxEvent"), f.rows("auditLog")]);
    const res = await request(app).post("/api/v1/me/debts/preview").set("Authorization", "Bearer " + token()).send(debtCommand);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ profileRevision: 1, capital: { retirementLiquidAssets: "60000000" }, baseline: { totals: { interest: "55" } } });
    const document = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const validate = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true } }).compile(document.components.schemas.DebtPreviewEnvelope);
    expect(validate(res.body), JSON.stringify(validate.errors)).toBe(true);
    expect(JSON.stringify([f.rows("financialProfile"), f.rows("retirementPlan"), f.rows("outboxEvent"), f.rows("auditLog")])).toBe(before);
    await expect(debts.preview("other", debtCommand)).rejects.toMatchObject({ status: 404 });
    await expect(debts.preview(user.id, { ...debtCommand, expectedProfileRevision: 2 })).rejects.toMatchObject({ status: 409 });
    for (const injected of [{ userId: "other" }, { annualReturn: "8" }, { extraMonthlyBudget: -1 }]) {
      expect((await request(app).post("/api/v1/me/debts/preview").set("Authorization", "Bearer " + token()).send({ ...debtCommand, ...injected })).status).toBe(400);
    }
    expect((await request(app).post("/api/v1/me/debts/preview").send(debtCommand)).status).toBe(401);
    expect((await request(app).post("/api/v1/me/debts/preview").set("Authorization", "Bearer " + token("ADMIN")).send(debtCommand)).status).toBe(403);
    const profileResult = (await request(app).get("/api/v1/me/financial-profile").set("Authorization", "Bearer " + token())).body;
    const validateProfile = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true } }).compile(document.components.schemas.ProfileEnvelope);
    expect(validateProfile(profileResult), JSON.stringify(validateProfile.errors)).toBe(true);
    const incompleteProfile = debtProfile([debtFixture({ contract: unknown })]);
    await profiles.patchProfile(user.id, 1, incompleteProfile);
    const incomplete = await request(app).post("/api/v1/me/debts/preview").set("Authorization", "Bearer " + token()).send({ ...debtCommand, expectedProfileRevision: 2 });
    expect(incomplete.body.data.status).toBe("INCOMPLETE");
    expect(validate(incomplete.body), JSON.stringify(validate.errors)).toBe(true);
  });
});
