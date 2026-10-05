import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { ActualsService } from "../modules/actuals/service";
import { actualWriteSchema, type ActualPayload } from "../modules/actuals/schema";
import { reconcile } from "../modules/actuals/reconcile";
import { plansFixture } from "./plans-fixtures";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { createApp } from "../app";
const entry = (kind: ActualPayload["entries"][number]["kind"], amount: string, month = "2026-10", note?: string) => ({ eventId: randomUUID(), date: month + "-01", kind, amount, ...(note ? { note } : {}) });
const payload = (entries: ActualPayload["entries"] = [], openingBalance = "0", closingBalance = "0"): ActualPayload => ({ currency: "VND", openingBalance, closingBalance, entries, correctionReason: "Statement reviewed" });
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2027-05-01T00:00:00Z")); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
describe("T09 monthly actual ledger", () => {
  it.each([["100", "40", "10", "50", "SURPLUS"], ["50", "40", "10", "0", "BALANCED"], ["20", "40", "10", "-30", "DEFICIT"]])("separates household %s from actual deposits", (income, expense, debt, surplus, state) => {
    expect(reconcile(payload([entry("INCOME", income), entry("EXPENSE", expense), entry("DEBT_PAYMENT", debt)])))
      .toMatchObject({ householdSurplus: surplus, cashflowState: state, actualContribution: "0", calculatedClosingBalance: "0", reconciliation: "MATCHED" });
  });
  it("reconciles interest once, negative market returns, fees, withdrawals and internal transfers", () => {
    const result = reconcile(payload([entry("CONTRIBUTION", "30"), entry("WITHDRAWAL", "10"), entry("INVESTMENT_INCOME", "5"), entry("MARKET_CHANGE", "-20"), entry("FEE", "2"), entry("INTERNAL_TRANSFER", "900")], "100", "103"));
    expect(result).toMatchObject({ reconciliation: "MATCHED", actualContribution: "30", calculatedClosingBalance: "103" });
    expect(reconcile(payload([entry("BALANCE_ADJUSTMENT", "-1.25", undefined, "Correction")], "10", "8.75"))).toMatchObject({ reconciliation: "MATCHED", hasAdjustments: true });
  });
  it("preserves decimal precision, requires reasons, rejects macro fields and duplicate entry IDs", () => {
    expect(reconcile(payload([entry("CONTRIBUTION", "0.01")], "9007199254740993.25", "9007199254740993.26")).discrepancy).toBe("0");
    const e = entry("CONTRIBUTION", "2");
    for (const data of [payload([e, e]), payload([entry("INCOME", "-1")]), payload([entry("BALANCE_ADJUSTMENT", "1")]), { ...payload(), annualReturnRate: "9" }])
      expect(actualWriteSchema.safeParse({ expectedRevision: 0, data }).success).toBe(false);
  });
  it("retries exact writes, rejects stale edits and preserves every correction with reserved identities", async () => {
    const f = memoryDb(), s = new ActualsService(f.db), key = randomUUID(), e = entry("CONTRIBUTION", "10");
    const body = { expectedRevision: 0, data: payload([e], "0", "10") };
    const first = await s.write("u", "2026-10", body, key);
    expect(await s.write("u", "2026-10", body, key)).toEqual(first);
    await expect(s.write("u", "2026-10", { ...body, expectedRevision: 1 }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(s.write("u", "2026-10", body, randomUUID())).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await s.write("u", "2026-10", { expectedRevision: 1, data: payload() }, randomUUID());
    const result = await s.get("u", "2026-10"); expect(result.history.map(h => h.revision)).toEqual([2, 1]); expect(result.history[1].data).toEqual(body.data);
    await expect(s.write("u", "2026-11", { ...body, data: payload([{ ...e, date: "2026-11-01" }]) }, randomUUID())).rejects.toMatchObject({ code: "EVENT_ALREADY_RECORDED" });
    expect(f.rows("actualMonth")).toHaveLength(1); expect(f.rows("actualMonthRevision")).toHaveLength(2);
    await expect(s.get("other", "2026-10")).rejects.toMatchObject({ status: 404 }); expect((await s.list("other", { from: "2026-01", to: "2027-01" })).items).toEqual([]);
  });
  it("rolls the month/history/identities back when audit fails", async () => {
    const f = memoryDb(), s = new ActualsService(f.db); f.failWrites("auditLog");
    await expect(s.write("u", "2026-10", { expectedRevision: 0, data: payload([entry("CONTRIBUTION", "1")]) }, randomUUID())).rejects.toThrow();
    for (const table of ["actualMonth", "actualMonthRevision", "actualEventIdentity", "idempotencyRecord"]) expect(f.rows(table)).toEqual([]);
  });
  it("blocks missing/unreconciled months and broken chains after editing past actuals", async () => {
    const f = await plansFixture(), p = await f.create(), s = new ActualsService(f.db), q = { planId: p.planId, versionId: p.saved.id, throughMonth: "2026-11" };
    expect((await s.forecast(f.owner, q)).issues).toHaveLength(2);
    await s.write(f.owner, "2026-10", { expectedRevision: 0, data: payload([], "0", "10") }, randomUUID());
    await s.write(f.owner, "2026-11", { expectedRevision: 0, data: payload([], "10", "10") }, randomUUID());
    expect((await s.forecast(f.owner, q)).issues).toEqual([{ month: "2026-10", code: "UNRECONCILED_MONTH" }]);
    await s.write(f.owner, "2026-10", { expectedRevision: 1, data: payload([entry("CONTRIBUTION", "20")], "0", "20") }, randomUUID());
    const blocked = await s.forecast(f.owner, q); expect(blocked.calculation).toBeNull(); expect(blocked.issues).toEqual([{ month: "2026-11", code: "OPENING_BALANCE_MISMATCH" }]);
  });
  it("anchors future months on actual close, never repeats one-offs or overwrites baseline", async () => {
    const f = await plansFixture(), p = await f.create(), s = new ActualsService(f.db);
    await f.plans.apply(f.owner, p.planId, { versionId: p.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID());
    const before = JSON.stringify([f.rows("planVersion"), f.rows("retirementPlan"), f.rows("financialProfile")]);
    await s.write(f.owner, "2026-10", { expectedRevision: 0, data: payload([entry("CONTRIBUTION", "1000"), entry("INCOME", "2000")], "0", "1000") }, randomUUID());
    const forecast = await s.forecast(f.owner, { planId: p.planId, versionId: p.saved.id, throughMonth: "2026-10" });
    expect(forecast.status).toBe("READY"); expect(forecast.calculation!.rows[0]).toMatchObject({ month: "2026-11", openingBalance: "1000", contribution: "100", closingBalance: "1100" });
    expect(forecast.calculation!.summary.terminalBalance).toBe("900"); expect(forecast.comparison[0].closingBalanceDelta).toBe("900");
    expect(JSON.stringify([f.rows("planVersion"), f.rows("retirementPlan"), f.rows("financialProfile")])).toBe(before);
    await expect(s.forecast("other", { planId: p.planId, versionId: p.saved.id, throughMonth: "2026-10" })).rejects.toMatchObject({ status: 404 });
    const actualBefore = await s.get(f.owner, "2026-10");
    const next = await f.plans.createVersion(f.owner, p.planId, { ...f.command, expectedRevision: 2 }, randomUUID());
    await f.plans.apply(f.owner, p.planId, { versionId: next.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID());
    expect(await s.get(f.owner, "2026-10")).toEqual(actualBefore);
    expect((await f.plans.get(f.owner, p.planId)).baselineVersionId).toBe(p.saved.id);
  });
  it("handles retired anchors, completed horizons and unfinished/future months explicitly", async () => {
    const f = await plansFixture(), p = await f.create(), s = new ActualsService(f.db);
    for (const month of ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"])
      await s.write(f.owner, month, { expectedRevision: 0, data: payload([], "50", "50") }, randomUUID());
    const q = { planId: p.planId, versionId: p.saved.id, throughMonth: "2027-01" };
    const retired = await s.forecast(f.owner, q); expect(retired.calculation!.summary.accumulationMonths).toBe(0); expect(retired.originalRetirementMonth).toBe("2027-01");
    expect((await s.forecast(f.owner, { ...q, throughMonth: "2027-03" })).status).toBe("HORIZON_COMPLETE");
    vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    expect((await s.forecast(f.owner, { ...q, throughMonth: "2026-10" })).issues).toContainEqual({ month: "2026-10", code: "MONTH_NOT_CLOSED" });
    await expect(s.write(f.owner, "2026-11", { expectedRevision: 1, data: payload() }, randomUUID())).rejects.toMatchObject({ code: "FUTURE_ACTUAL_MONTH" });
    await expect(s.write(f.owner, "2026-09", { expectedRevision: 0, data: payload([entry("FEE", "1")]) }, randomUUID())).rejects.toMatchObject({ code: "ENTRY_MONTH_MISMATCH" });
  });
  it("HTTP ownership/roles, strict inputs and documented response contracts", async () => {
    const f = await plansFixture(), p = await f.create(), s = new ActualsService(f.db), auth = new AuthService(f.db, config);
    vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
    const app = createApp({ config, services: { auth, profiles: new ProfileService(f.db), actuals: s } }), root = "/api/v1/me/retirement/actuals";
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true } });
    const check = (name: string, res: request.Response) => { expect(res.status).toBe(200); const v = ajv.compile(spec.components.schemas["Actual" + name + "Envelope"]); expect(v(res.body), JSON.stringify(v.errors)).toBe(true); };
    const body = { expectedRevision: 0, data: payload() };
    check("Month", await request(app).put(root + "/2026-10").set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID()).send(body));
    check("Detail", await request(app).get(root + "/2026-10").set("Authorization", "Bearer " + token()));
    check("List", await request(app).get(root + "?from=2026-10&to=2026-11").set("Authorization", "Bearer " + token()));
    for (const throughMonth of ["2026-10", "2026-11"]) check("Forecast", await request(app).post(root + "/reforecast").set("Authorization", "Bearer " + token()).send({ planId: p.planId, versionId: p.saved.id, throughMonth }));
    expect((await request(app).get(root + "/2026-10")).status).toBe(401);
    expect((await request(app).get(root + "/2026-10").set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
    expect((await request(app).put(root + "/2026-10").set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID()).send({ ...body, userId: "other" })).status).toBe(400);
  });
});
