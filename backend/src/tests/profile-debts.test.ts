import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { Prisma } from "@prisma/client";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { debtChanges, debtPatchSchema } from "../modules/profiles/debt-commands";
import { profileDebtSummary, debtReportSchema } from "../modules/profiles/debt-summary";
import { illustrateDebt } from "../modules/debts/illustration";
import { declaredDebtPayment } from "../modules/debts/loan";
import { prepareRetirement } from "../modules/retirement/prepare";
import { profileV2Schema, type DebtEntry, type ProfileV2 } from "../modules/profiles/schema-v2";
import { fixtureProfile, known, unknown, empty, legacyProfileFixture } from "./profile-v2-fixtures";
import { debtFixture, debtProfile } from "./debt-fixtures";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
const D = Prisma.Decimal.clone({ precision: 48 });
const raw = (changes: Partial<DebtEntry> = {}) => debtFixture({ contract: unknown, payment: known("100"), endMonth: null, illustration: { annualRatePercent: known("0") }, ...changes });
const profile = (loan = raw()) => debtProfile([loan]);
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
function linked(loan = raw({ illustration: undefined })): ProfileV2 {
  return fixtureProfile({ debts: { status: "KNOWN", entries: [loan] }, expenses: { status: "KNOWN", entries: [{ id: "payment", label: "Linked debt payment", category: "DEBT_PAYMENT", loanId: loan.id, amount: loan.contract?.status === "KNOWN" ? unknown : known(new D(loan.payment.status === "KNOWN" ? loan.payment.value : "0").mul(loan.paymentShare.status === "KNOWN" ? loan.paymentShare.value : "0").toFixed()), currency: loan.currency, frequency: loan.frequency, startMonth: loan.startMonth, endMonth: loan.endMonth }] } });
}
async function setup(data = linked()) {
  const f = memoryDb(), profiles = new ProfileService(f.db), auth = new AuthService(f.db, config);
  await profiles.saveDraft("test-user", 0, "summary", data);
  await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  const user = await f.db.user.create({ data: { id: "test-user", role: "USER", status: "ACTIVE", email: "debts@example.test", fullName: "Fixture", passwordHash: "unused" } });
  vi.spyOn(auth, "validateSession").mockResolvedValue(user);
  return { ...f, profiles, app: createApp({ config, services: { profiles, auth } }) };
}
describe("debt workspace schedules and totals", () => {
  it("does not invent a rate, payoff, or interest for legacy declarations", () => {
    const loan = raw({ illustration: undefined });
    const report = profileDebtSummary(profile(loan), 7);
    expect(debtReportSchema.safeParse(report).success).toBe(true);
    expect(report.profileRevision).toBe(7);
    expect(report.loans[0]).toMatchObject({ status: "DECLARED", rate: null, payoffDate: null, rows: [], monthlyPayment: "100", firstMonthInterest: null });
    expect(report.totals.firstMonthInterest).toBeNull();
  });
  it("separates balance share, payment share and confirmed liability", () => {
    const loan = raw({ balanceShare: known("0.5"), paymentShare: known("0.25"), illustration: { annualRatePercent: known("12") } });
    const report = profileDebtSummary(profile(loan), 1);
    expect(report.totals).toMatchObject({ outstandingBalance: "500", monthlyPayment: "25", firstMonthInterest: "2.5", monthlyIncome: "20000000", monthlyExpense: "0", availableMonthlySurplus: "19999975" });
    expect(report.loans[0].rows[0]).toMatchObject({ opening: "1000", principal: "90", interest: "10", userPrincipal: "22.5", userInterest: "2.5", userPayment: "25" });
    expect(loan.responsibility.status).toBe("KNOWN");
  });
  it.each([[unknown, null], [empty(), "0"], [{ status: "NOT_APPLICABLE", reason: "none" }, "0"]] as const)("keeps group completeness %j distinct", (debts, expected) => {
    const report = profileDebtSummary(fixtureProfile({ debts }), 1);
    expect(report.totals.outstandingBalance).toBe(expected); expect(report.totals.monthlyPayment).toBe(expected); expect(report.totals.firstMonthInterest).toBe(expected);
  });
  it("keeps unknown allocation, income and zero-income ratios undetermined", () => {
    const loan = raw({ balanceShare: unknown, paymentShare: unknown });
    const result = profileDebtSummary(fixtureProfile({ debts: { status: "KNOWN", entries: [loan] }, income: unknown }), 1);
    expect(result.totals).toMatchObject({ outstandingBalance: null, monthlyPayment: null, monthlyIncome: null, debtToIncomePercent: null, firstMonthInterest: null });
    expect(profileDebtSummary(fixtureProfile({ income: empty() }), 1).totals.debtToIncomePercent).toBeNull();
  });
  it("caps the final illustrated payment and preserves large decimal precision", () => {
    const schedule = illustrateDebt(raw({ outstandingBalance: known("250.01"), payment: known("100"), paymentShare: known("0.25") }), "2026-10-04");
    expect(schedule.status).toBe("READY"); expect(schedule.rows).toHaveLength(3);
    expect(schedule.rows[2]).toMatchObject({ principal: "50.01", userPayment: "12.5025", closing: "0" });
    expect(schedule.payoffDate).toBe("2026-12-01");
    const big = illustrateDebt(raw({ outstandingBalance: known("9999999999999999.99"), payment: known("9999999999999999.99") }), "2026-10-04");
    expect(big.rows[0].principal).toBe("9999999999999999.99"); expect(big.rows[0].closing).toBe("0");
  });
  it.each([
    [{ currency: "USD" }, "FX_RULE_REQUIRED"], [{ balanceAsOf: unknown }, "VALUATION_DATE_MISMATCH"],
    [{ outstandingBalance: unknown }, "BALANCE_REQUIRED"], [{ payment: unknown }, "PAYMENT_REQUIRED"],
    [{ paymentShare: unknown }, "PAYMENT_SHARE_REQUIRED"], [{ illustration: undefined }, "DECLARED_RATE_REQUIRED"],
    [{ frequency: "ONCE", endMonth: "2026-01" }, "MONTHLY_ILLUSTRATION_REQUIRED"],
  ] as const)("requires the declared illustration basis %j", (changes, code) => {
    const schedule = illustrateDebt(raw(changes), "2026-10-04");
    expect(schedule.status).toBe("INCOMPLETE"); expect(schedule.rows).toEqual([]); expect(schedule.payoffDate).toBeNull(); expect(schedule.issues.some(i => i.code === code)).toBe(true);
  });
  it("rejects non-amortizing payments and leaves unfinished schedules without a payoff date", () => {
    const negative = illustrateDebt(raw({ payment: known("10"), illustration: { annualRatePercent: known("12") } }), "2026-10-04");
    expect(negative).toMatchObject({ status: "INCOMPLETE", rows: [], payoffDate: null });
    expect(negative.issues[0].code).toBe("PAYMENT_NOT_REDUCING_PRINCIPAL");
    const ended = illustrateDebt(raw({ endMonth: "2026-11" }), "2026-10-04");
    expect(ended).toMatchObject({ status: "HORIZON_LIMIT", payoffDate: null }); expect(ended.rows).toHaveLength(2);
    const horizon = illustrateDebt(raw({ outstandingBalance: known("1000"), payment: known("1") }), "2026-10-04");
    expect(horizon.status).toBe("HORIZON_LIMIT"); expect(horizon.rows).toHaveLength(600);
  });
  it("respects future start, inactive months and explicit zero balances", () => {
    const future = raw({ startMonth: "2026-12" });
    expect(declaredDebtPayment(future, "2026-10-04").value?.toFixed()).toBe("0");
    expect(illustrateDebt(future, "2026-10-04").rows[0].dueDate).toBe("2026-12-01");
    expect(profileDebtSummary(profile(future), 1).totals.firstMonthInterest).toBe("0");
    expect(illustrateDebt(raw({ outstandingBalance: known("0"), payment: known("0") }), "2026-10-04")).toMatchObject({ status: "READY", rows: [], payoffDate: null });
  });
  it("requires deferred-interest terms instead of assuming an interest-free gap before future payments", () => {
    const schedule = illustrateDebt(raw({ startMonth: "2026-12", illustration: { annualRatePercent: known("12") } }), "2026-10-04");
    expect(schedule).toMatchObject({ status: "INCOMPLETE", rows: [], payoffDate: null }); expect(schedule.issues.some(issue => issue.code === "DEFERRED_INTEREST_TERMS_REQUIRED")).toBe(true);
  });
  it("keeps contract amounts authoritative over raw payment and illustration fields", () => {
    const loan = debtFixture({ paymentShare: known("0.5"), balanceShare: known("0.25"), illustration: { annualRatePercent: known("0") } });
    const report = profileDebtSummary(profile(loan), 1);
    expect(report.loans[0]).toMatchObject({ status: "CONTRACT", outstandingBalance: "250", monthlyPayment: "55", firstMonthInterest: "5", payoffDate: "2027-07-28" });
    expect(report.loans[0].rows[0]).toMatchObject({ principal: "100", userPrincipal: "50", userInterest: "5", userPayment: "55" });
  });
  it("uses the same illustrated payments in retirement previews and leaves legacy inputs unchanged", () => {
    const p = retirementProfile(), loan = raw({ outstandingBalance: known("250"), payment: known("100"), illustration: { annualRatePercent: known("12") } });
    p.debts = { status: "KNOWN", entries: [loan] };
    const { policy, assumptions } = retirementConfiguration();
    const prepared = prepareRetirement(p, retirementCommand(), policy, assumptions);
    expect(prepared.status).toBe("READY");
    if (prepared.status !== "READY") throw new Error(JSON.stringify(prepared.issues));
    expect(prepared.replayInput.rows.slice(0, 3).map(row => row.debtPayment)).toEqual(illustrateDebt(loan, p.valuationDate).rows.map(row => row.userPayment));
    expect(prepared.warnings.some(issue => issue.code === "LOAN_SCHEDULE_ILLUSTRATIVE")).toBe(true);
    const legacyLoan = raw({ illustration: undefined }); p.debts = { status: "KNOWN", entries: [legacyLoan] };
    const legacy = prepareRetirement(p, retirementCommand(), policy, assumptions);
    expect(legacy.warnings.some(issue => issue.code === "LOAN_CONTRACT_ESTIMATED")).toBe(true);
  });
  it("keeps new unknown-rate declarations out of a fabricated retirement payoff schedule", () => {
    const p = retirementProfile(); p.debts = { status: "KNOWN", entries: [raw({ illustration: { annualRatePercent: unknown } })] };
    const { policy, assumptions } = retirementConfiguration();
    const prepared = prepareRetirement(p, retirementCommand(), policy, assumptions);
    expect(prepared.status).toBe("INCOMPLETE"); expect(prepared.issues.some(issue => issue.code === "DEBT_SCHEDULE_REQUIRED")).toBe(true);
    expect(profileDebtSummary(p, 1).totals.monthlyPayment).toBe("100");
  });
});
describe("atomic debt commands", () => {
  it("updates linked expense basis and deletes its reference without double counting", () => {
    const p = linked(), next = raw({ illustration: undefined, payment: known("200"), paymentShare: known("0.5"), startMonth: "2026-09" });
    const changes = debtChanges(p, { kind: "UPDATE", entry: next });
    expect(changes.expenses).toMatchObject({ status: "KNOWN", entries: [{ amount: known("100"), startMonth: "2026-09" }] });
    expect(profileDebtSummary({ ...p, ...changes }, 1).totals).toMatchObject({ monthlyExpense: "0", monthlyPayment: "100" });
    const removed = debtChanges({ ...p, ...changes }, { kind: "DELETE", id: next.id });
    expect(removed).toEqual({ debts: empty(), expenses: empty() });
  });
  it("preserves unknown linked amounts for variable contract periods", () => {
    const p = linked(), changes = debtChanges(p, { kind: "UPDATE", entry: debtFixture() });
    expect(changes.expenses).toMatchObject({ status: "KNOWN", entries: [{ amount: unknown, endMonth: "2027-07" }] });
    expect(profileV2Schema.safeParse({ ...p, ...changes }).success).toBe(true);
  });
  it("keeps an illustrative linked amount unknown when its final payment can vary", () => {
    const p = linked(), changes = debtChanges(p, { kind: "UPDATE", entry: raw({ outstandingBalance: known("50"), payment: known("100") }) });
    expect(changes.expenses).toMatchObject({ entries: [{ amount: unknown }] });
    expect(profileDebtSummary({ ...p, ...changes }, 1).totals.monthlyPayment).toBe("50");
  });
  it("splits balances and payments exactly, and relinks a full split", () => {
    const p = linked(), entry = raw({ illustration: undefined, id: "new", outstandingBalance: known("400"), payment: known("40") });
    const result = debtChanges(p, { kind: "SPLIT", sourceId: "loan-a", entry });
    expect(result.debts).toMatchObject({ entries: [{ outstandingBalance: known("600"), payment: known("60") }, { outstandingBalance: known("400"), payment: known("40") }] });
    expect(result.expenses).toMatchObject({ entries: [{ loanId: "loan-a", amount: known("60") }] });
    expect(profileDebtSummary({ ...p, ...result }, 1).totals.monthlyPayment).toBe("100");
    const full = debtChanges(p, { kind: "SPLIT", sourceId: "loan-a", entry: raw({ illustration: undefined, id: "new" }) });
    expect(full.debts).toMatchObject({ entries: [{ id: "new" }] }); expect(full.expenses).toMatchObject({ entries: [{ loanId: "new", amount: known("100") }] });
  });
  it.each([
    [raw({ id: "new", balanceShare: known("0.5") }), "DEBT_SPLIT_BASIS_MISMATCH"],
    [raw({ id: "new", outstandingBalance: known("2000") }), "DEBT_SPLIT_EXCEEDS_SOURCE"],
    [raw({ id: "new", payment: known("50") }), "DEBT_SPLIT_EXCEEDS_SOURCE"],
  ])("rejects invalid split without mutating input", (entry, code) => {
    const p = linked(), before = structuredClone(p);
    expect(() => debtChanges(p, { kind: "SPLIT", sourceId: "loan-a", entry })).toThrowError(expect.objectContaining({ code })); expect(p).toEqual(before);
  });
  it("blocks splitting shared or contracted debt and requires group completeness", () => {
    for (const source of [raw({ sharedLoanId: "joint" }), debtFixture()]) expect(() => debtChanges(profile(source), { kind: "SPLIT", sourceId: source.id, entry: raw({ id: "new" }) })).toThrowError(expect.objectContaining({ code: "DEBT_SPLIT_CONTRACT_OR_SHARED" }));
    const p = fixtureProfile({ debts: unknown });
    expect(() => debtChanges(p, { kind: "ADD", entry: raw() })).toThrowError(expect.objectContaining({ code: "DEBT_COMPLETENESS_REQUIRED" }));
    expect(debtChanges(p, { kind: "ADD", entry: raw(), confirmUnknownGroup: true }).debts.status).toBe("KNOWN");
    expect(() => debtChanges(profile(), { kind: "CONFIRM_NONE", reason: "none" })).toThrowError(expect.objectContaining({ code: "DEBTS_NOT_EMPTY" }));
    expect(debtChanges(p, { kind: "CONFIRM_NONE", reason: "none" }).debts.status).toBe("NOT_APPLICABLE");
  });
  it("validates strict commands, duplicates and missing rows", () => {
    expect(debtPatchSchema.safeParse({ expectedRevision: 1, command: { kind: "ADD", entry: raw(), surprise: true } }).success).toBe(false);
    expect(() => debtChanges(profile(), { kind: "ADD", entry: raw() })).toThrowError(expect.objectContaining({ code: "DEBT_DUPLICATE_ID" }));
    expect(() => debtChanges(profile(), { kind: "DELETE", id: "missing" })).toThrowError(expect.objectContaining({ code: "DEBT_NOT_FOUND" }));
  });
});
describe("debt workspace HTTP with memory database", () => {
  it("persists CRUD with CAS, validates the report contract, and marks plans stale without applying", async () => {
    const f = await setup(), headers = { Authorization: "Bearer " + token() };
    const doc = await SwaggerParser.dereference("docs/openapi.yaml") as any;
    const validate = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, date: true } }).compile(doc.components.schemas.DebtReportEnvelope);
    const write = (expectedRevision: number, command: unknown) => request(f.app).patch("/api/v1/me/financial-profile/debts").set(headers).send({ expectedRevision, command });
    await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", currentVersionId: "frozen", stale: false } });
    expect((await write(1, { kind: "ADD", entry: raw({ id: "new" }) })).status).toBe(200);
    expect((await write(1, { kind: "DELETE", id: "new" })).status).toBe(409);
    expect((await write(2, { kind: "UPDATE", entry: raw({ payment: known("200") }) })).status).toBe(200);
    expect((await write(3, { kind: "DELETE", id: "new" })).status).toBe(200);
    const response = await request(f.app).get("/api/v1/me/financial-profile/debts").set(headers);
    expect(response.status).toBe(200); expect(validate(response.body), JSON.stringify(validate.errors)).toBe(true);
    expect(response.body.data).toMatchObject({ profileRevision: 4, totals: { outstandingBalance: "1000", monthlyPayment: "200" } });
    expect(f.rows("retirementPlan")[0]).toMatchObject({ stale: true, currentVersionId: "frozen" });
    expect((await request(f.app).get("/api/v1/me/financial-profile/debts").set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
    expect((await request(f.app).get("/api/v1/me/financial-profile/debts")).status).toBe(401);
    await expect(f.profiles.getDebts("another-user")).rejects.toMatchObject({ status: 404 });
    await expect(f.profiles.patchDebts("another-user", { expectedRevision: 1, command: { kind: "DELETE", id: "loan-a" } })).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back debt and linked-expense changes on event failures", async () => {
    const f = await setup(), before = await f.profiles.getProfile("test-user");
    f.failWrites("outboxEvent");
    await expect(f.profiles.patchDebts("test-user", { expectedRevision: 1, command: { kind: "DELETE", id: "loan-a" } })).rejects.toThrow();
    expect(await f.profiles.getProfile("test-user")).toEqual(before);
    f.failWrites(""); await f.profiles.patchDebts("test-user", { expectedRevision: 1, command: { kind: "DELETE", id: "loan-a" } });
    expect(await f.profiles.getDebts("test-user")).toMatchObject({ debtState: "KNOWN", loans: [], totals: { outstandingBalance: "0", monthlyPayment: "0" } });
  });
  it("requires explicit legacy upgrade", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db);
    await profiles.saveDraft("test-user", 0, "summary", legacyProfileFixture);
    await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    await expect(profiles.getDebts("test-user")).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" });
    await expect(profiles.patchDebts("test-user", { expectedRevision: 1, command: { kind: "ADD", entry: raw() } })).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" });
  });
});
