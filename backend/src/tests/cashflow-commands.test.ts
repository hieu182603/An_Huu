import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { cashflowChanges, cashflowPatchSchema } from "../modules/profiles/cashflow-commands";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import type { IncomeEntry, ExpenseEntry } from "../modules/profiles/schema-v2";
import { profileMonthlyCashflow } from "../modules/profiles/cashflow";
import { prepareRetirement } from "../modules/retirement/prepare";
import { fixtureProfile, known, unknown, empty, legacyProfileFixture } from "./profile-v2-fixtures";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
const profile = () => fixtureProfile({ debts: empty() });
function income(changes: Partial<IncomeEntry> = {}): IncomeEntry {
  const data = profile(); if (data.income.status !== "KNOWN") throw Error("fixture");
  return { ...data.income.entries[0], id: "split", label: "Lương riêng", amount: known("4000000"), ...changes };
}
// Keep fixture rows typed without converting money through Number.
function expense(changes: Partial<ExpenseEntry> = {}): ExpenseEntry {
  const data = profile(); if (data.expenses.status !== "KNOWN") throw Error("fixture");
  return { ...data.expenses.entries[0], id: "food", label: "Ăn uống", amount: known("3000000"), ...changes };
}
async function setup(data = profile()) {
  const f = memoryDb(), profiles = new ProfileService(f.db), auth = new AuthService(f.db, config);
  await profiles.saveDraft("test-user", 0, "summary", data);
  await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  const user = await f.db.user.create({ data: { id: "test-user", email: "cashflow@example.test", fullName: "Fixture", role: "USER", status: "ACTIVE", passwordHash: "unused" } });
  vi.spyOn(auth, "validateSession").mockResolvedValue(user);
  return { ...f, profiles, app: createApp({ config, services: { auth, profiles } }) };
}
describe("cashflow commands", () => {
  it.each(["income", "expenses"] as const)("splits %s without changing any month total or overwriting other groups", group => {
    const p = profile(), entry = group === "income" ? income() : expense(), sourceId = group === "income" ? "salary" : "living";
    const changes = cashflowChanges(p, group === "income" ? { kind: "SPLIT", group, sourceId, entry: income() } : { kind: "SPLIT", group, sourceId, entry: expense() });
    expect(Object.keys(changes)).toEqual([group]);
    const changed = { ...p, ...changes };
    expect(changed[group].status).toBe("KNOWN");
    for (const month of ["2025-12", "2026-01", "2026-10", "2030-12"]) {
      const before = profileMonthlyCashflow(p, month), after = profileMonthlyCashflow(changed, month);
      expect(after.income?.toFixed()).toBe(before.income?.toFixed());
      expect(after.expenses?.toFixed()).toBe(before.expenses?.toFixed());
    }
    if (changed[group].status !== "KNOWN") throw Error("fixture");
    expect(changed[group].entries.at(-1)?.amount).toEqual(entry.amount);
    expect(p[group].status === "KNOWN" && p[group].entries).toHaveLength(1);
  });
  it("keeps large cents exact and removes the remainder only when fully split", () => {
    const p = profile(); if (p.income.status !== "KNOWN") throw Error("fixture");
    p.income.entries[0].amount = known("9007199254740993.25");
    const first = { ...p, ...cashflowChanges(p, { kind: "SPLIT", group: "income", sourceId: "salary", entry: income({ amount: known("0.12") }) }) };
    if (first.income.status !== "KNOWN") throw Error("fixture");
    expect(first.income.entries[0].amount).toEqual(known("9007199254740993.13"));
    expect(profileV2Summary(first).values.monthlyIncome).toBe("9007199254740993.25");
    const full = cashflowChanges(profile(), { kind: "SPLIT", group: "income", sourceId: "salary", entry: income({ amount: known("20000000") }) });
    expect(full.income?.status === "KNOWN" && full.income.entries).toHaveLength(1);
  });
  it.each([
    ["too much", income({ amount: known("20000000.01") }), "salary", "CASHFLOW_SPLIT_EXCEEDS_SOURCE"],
    ["different month", income({ startMonth: "2026-10" }), "salary", "CASHFLOW_SPLIT_SCHEDULE_MISMATCH"],
    ["different end", income({ endMonth: "2026-12" }), "salary", "CASHFLOW_SPLIT_SCHEDULE_MISMATCH"],
    ["different currency", income({ currency: "USD" }), "salary", "CASHFLOW_SPLIT_SCHEDULE_MISMATCH"],
    ["different frequency", income({ frequency: "ONCE" as const, endMonth: "2026-01" }), "salary", "CASHFLOW_SPLIT_SCHEDULE_MISMATCH"],
    ["missing source", income(), "missing", "CASHFLOW_SPLIT_SOURCE_REQUIRED"],
    ["unknown amount", income({ amount: unknown }), "salary", "CASHFLOW_SPLIT_SOURCE_REQUIRED"],
    ["duplicate id", income({ id: "salary" }), "salary", "CASHFLOW_DUPLICATE_ID"],
  ] as const)("rejects %s", (_label, entry, sourceId, code) => {
    expect(() => cashflowChanges(profile(), { kind: "SPLIT", group: "income", sourceId, entry })).toThrowError(expect.objectContaining({ code }));
  });
  it("requires explicit confirmation before replacing an unknown group and never clears a populated group", () => {
    const p = profile(); p.income = unknown;
    expect(() => cashflowChanges(p, { kind: "ADD", group: "income", entry: income() })).toThrowError(expect.objectContaining({ code: "CASHFLOW_COMPLETENESS_REQUIRED" }));
    expect(cashflowChanges(p, { kind: "ADD", group: "income", entry: income(), confirmUnknownGroup: true }).income?.status).toBe("KNOWN");
    expect(cashflowChanges(p, { kind: "CONFIRM_NONE", group: "income", reason: "Confirmed none" }).income?.status).toBe("NOT_APPLICABLE");
    expect(() => cashflowChanges(profile(), { kind: "CONFIRM_NONE", group: "income", reason: "Confirmed none" })).toThrowError(expect.objectContaining({ code: "CASHFLOW_NOT_EMPTY" }));
  });
  it("keeps linked pensions and debt payments read only", () => {
    const p = profile(); if (p.income.status !== "KNOWN") throw Error("fixture");
    p.income.entries[0].source = "PENSION";
    for (const command of [{ kind: "DELETE", group: "income", id: "salary" }, { kind: "UPDATE", group: "income", entry: income({ id: "salary" }) }] as const)
      expect(() => cashflowChanges(p, command)).toThrowError(expect.objectContaining({ code: "CASHFLOW_REFERENCE_READ_ONLY" }));
    expect(() => cashflowChanges(profile(), { kind: "ADD", group: "income", entry: income({ source: "PENSION" as const }) })).toThrowError(expect.objectContaining({ code: "CASHFLOW_REFERENCE_READ_ONLY" }));
    expect(() => cashflowChanges(profile(), { kind: "ADD", group: "expenses", entry: expense({ category: "DEBT_PAYMENT" as const, loanId: "loan" }) })).toThrowError(expect.objectContaining({ code: "CASHFLOW_REFERENCE_READ_ONLY" }));
  });
  it("rejects malformed amounts and split commands at the HTTP boundary", () => {
    for (const amount of [known(""), known("-1"), known("1e8"), known("2.001"), known(100)])
      expect(cashflowPatchSchema.safeParse({ expectedRevision: 1, command: { kind: "ADD", group: "income", entry: { ...income(), amount } } }).success).toBe(false);
    expect(cashflowPatchSchema.safeParse({ expectedRevision: 1, command: { kind: "SPLIT", group: "income", entry: income() } }).success).toBe(false);
    expect(cashflowPatchSchema.safeParse({ expectedRevision: 1, command: { kind: "ADD", group: "income", sourceId: "salary", entry: income() } }).success).toBe(false);
  });
  it("uses reservation in the actual backend projection without changing profile totals", () => {
    const p = retirementProfile(), { policy, assumptions } = retirementConfiguration(), command = retirementCommand();
    const before = profileV2Summary(p).values;
    const prepared = prepareRetirement(p, { ...command, monthlyReserve: "30" }, policy, assumptions);
    expect(prepared.status).toBe("READY");
    if (prepared.status !== "READY") throw Error("fixture");
    expect(prepared.calculation.rows[0]).toMatchObject({ additionalExpense: "30", contributionCapacity: "70", contribution: "70" });
    expect(profileV2Summary(p).values).toEqual(before);
  });
});

describe("cashflow HTTP persistence (memory database)", () => {
  it("saves split/add/edit/delete/stability and reloads authoritative totals with revision checks", async () => {
    const f = await setup(), headers = { Authorization: "Bearer " + token() };
    const document = await SwaggerParser.dereference("docs/openapi.yaml") as any;
    const validator = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, date: true } }).compile(document.components.schemas.ProfilePatchResultEnvelope);
    const save = (expectedRevision: number, command: unknown) => request(f.app).patch("/api/v1/me/financial-profile/cashflow").set(headers).send({ expectedRevision, command });
    await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", currentVersionId: "frozen", stale: false } });
    let result = await save(1, { kind: "SPLIT", group: "income", sourceId: "salary", entry: income() });
    expect(result.status).toBe(200); expect(validator(result.body), JSON.stringify(validator.errors)).toBe(true);
    expect(result.body.data.summary.values.monthlyIncome).toBe("20000000");
    expect((await save(1, { kind: "ADD", group: "income", entry: income({ id: "stale" }) })).status).toBe(409);
    result = await save(2, { kind: "ADD", group: "expenses", entry: expense() });
    expect(result.status).toBe(200); expect(result.body.data.summary.values.availableMonthlySurplus).toBe("1000000");
    result = await save(3, { kind: "UPDATE", group: "income", entry: income({ amount: known("5000000") }) });
    expect(result.body.data.summary.values.monthlyIncome).toBe("21000000");
    result = await save(4, { kind: "DELETE", group: "expenses", id: "food" });
    expect(result.body.data.summary.values.availableMonthlySurplus).toBe("5000000");
    result = await request(f.app).patch("/api/v1/me/financial-profile").set(headers).send({ expectedRevision: 5, changes: { schemaVersion: 2, incomeStability: known("UNCERTAIN") } });
    expect(result.status).toBe(200);
    result = await request(f.app).get("/api/v1/me/financial-profile").set(headers);
    expect(result.body.data).toMatchObject({ revision: 6, data: { incomeStability: known("UNCERTAIN") }, summary: { values: { monthlyIncome: "21000000", monthlyExpense: "16000000", availableMonthlySurplus: "5000000" } } });
    expect(f.rows("retirementPlan")[0]).toMatchObject({ currentVersionId: "frozen", stale: true });
    expect((await request(f.app).patch("/api/v1/me/financial-profile/cashflow").set("Authorization", "Bearer " + token("ADMIN")).send({ expectedRevision: 6, command: { kind: "DELETE", group: "income", id: "salary" } })).status).toBe(403);
    await expect(f.profiles.patchCashflow("other-user", { expectedRevision: 6, command: { kind: "DELETE", group: "income", id: "salary" } })).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back profile changes and plan invalidation when emitting the event fails", async () => {
    const f = await setup();
    await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", stale: false } });
    const before = await f.profiles.getProfile("test-user");
    f.failWrites("outboxEvent");
    await expect(f.profiles.patchCashflow("test-user", { expectedRevision: 1, command: { kind: "DELETE", group: "income", id: "salary" } })).rejects.toThrow();
    expect(await f.profiles.getProfile("test-user")).toEqual(before);
    expect(f.rows("retirementPlan")[0].stale).toBe(false);
  });
  it("deleting the last item persists a confirmed zero instead of unknown", async () => {
    const f = await setup();
    await f.profiles.patchCashflow("test-user", { expectedRevision: 1, command: { kind: "DELETE", group: "income", id: "salary" } });
    expect(await f.profiles.getProfile("test-user")).toMatchObject({ data: { income: empty() }, summary: { values: { monthlyIncome: "0", availableMonthlySurplus: "-16000000" } } });
  });
  it("requires explicit v2 upgrade before itemizing legacy data", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db);
    await profiles.saveDraft("test-user", 0, "summary", legacyProfileFixture);
    await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    await expect(profiles.patchCashflow("test-user", { expectedRevision: 1, command: { kind: "ADD", group: "income", entry: income() } })).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" });
  });
});
