import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { memoryDb } from "./memory-db";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService } from "../modules/portfolios/service";
import { ProfileService } from "../modules/profiles/service";
import { RetirementService } from "../modules/retirement/service";
import { PlansService } from "../modules/plans/service";
import { AuthService } from "../modules/auth/service";
import { createEventHandler } from "../jobs/handlers";
import { FinancialService } from "../modules/financial/service";
import { createApp } from "../app";
import { config, token } from "./helpers";
import { createPlanVersionSchema, applyPlanVersionSchema } from "../modules/plans/schema";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import type { Prisma } from "@prisma/client";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
import { plansFixture as fixture } from "./plans-fixtures";

describe("T07 immutable plan versions", () => {
  it("saving leaves current/baseline empty; apply sets both; duplicate requests are stable", async () => {
    const f = await fixture(), key = randomUUID();
    const saved = await f.plans.createVersion(f.owner, null, f.command, key);
    expect(saved).toMatchObject({ revision: 1, currentVersionId: null, baselineVersionId: null });
    expect(await f.plans.createVersion(f.owner, null, f.command, key)).toEqual(saved);
    expect(f.rows("planVersion")).toHaveLength(1);
    const cmd = { expectedRevision: 1, expectedProfileRevision: 1, versionId: saved.saved.id, confirm: true as const }, applyKey = randomUUID();
    const applied = await f.plans.apply(f.owner, saved.planId, cmd, applyKey);
    expect(applied).toMatchObject({ revision: 2, currentVersionId: saved.saved.id, baselineVersionId: saved.saved.id, alreadyCurrent: false });
    expect(await f.plans.apply(f.owner, saved.planId, cmd, applyKey)).toEqual(applied);
    expect(f.rows("auditLog").filter(r => r.action === "PLAN_VERSION_APPLIED")).toHaveLength(1);
    expect(await f.plans.apply(f.owner, saved.planId, { ...cmd, expectedRevision: 2 }, randomUUID())).toMatchObject({ revision: 2, alreadyCurrent: true });
  });
  it("new configuration and preview leave current, baseline and saved results intact", async () => {
    const f = await fixture(), saved = await f.create();
    await f.plans.apply(f.owner, saved.planId, { expectedRevision: 1, expectedProfileRevision: 1, versionId: saved.saved.id, confirm: true }, randomUUID());
    const original = await f.plans.version(f.owner, saved.planId, saved.saved.id), before = structuredClone(f.rows("planVersion"));
    const latest = await f.publish();
    await f.retirement.preview(f.owner, retirementCommand(latest.id));
    const plan = await f.plans.get(f.owner, saved.planId);
    expect(plan.currentVersionId).toBe(saved.saved.id); expect(plan.updates.policy?.id).toBe(latest.id);
    expect(plan.updates.assumptions).not.toBeNull(); expect(f.rows("planVersion")).toEqual(before);
    expect(await f.plans.version(f.owner, saved.planId, saved.saved.id)).toEqual(original);
    const replay = await f.plans.version(f.owner, saved.planId, saved.saved.id, true);
    expect("replay" in replay && replay.replay.matched).toBe(true);
  });
  it("new versions preserve the first applied baseline, including after switching back", async () => {
    const f = await fixture(), first = await f.create();
    await f.plans.apply(f.owner, first.planId, { versionId: first.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID());
    const second = await f.plans.createVersion(f.owner, first.planId, { ...f.command, expectedRevision: 2 }, randomUUID());
    expect(second.revision).toBe(3); expect(second.currentVersionId).toBe(first.saved.id);
    await f.plans.apply(f.owner, first.planId, { versionId: second.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID());
    const back = await f.plans.apply(f.owner, first.planId, { versionId: first.saved.id, expectedRevision: 4, expectedProfileRevision: 1, confirm: true }, randomUUID());
    expect(back).toMatchObject({ revision: 5, baselineVersionId: first.saved.id, currentVersionId: first.saved.id });
    expect((await f.plans.versions(f.owner, first.planId, { page: 1, limit: 20 })).items.map(v => v.version)).toEqual([2, 1]);
  });
  it("rejects stale revisions, a changed preview and idempotency key reuse", async () => {
    const f = await fixture(), key = randomUUID(), saved = await f.plans.createVersion(f.owner, null, f.command, key);
    await expect(f.plans.createVersion(f.owner, null, { ...f.command, expectedInputHash: "0".repeat(64) }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(f.plans.createVersion(f.owner, saved.planId, f.command, randomUUID())).rejects.toMatchObject({ status: 409 });
    await expect(f.plans.createVersion(f.owner, null, { ...f.command, expectedInputHash: "0".repeat(64) }, randomUUID())).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
    expect(f.rows("planVersion")).toHaveLength(1);
  });
  it("requires recreation after profile edits but still replays the old snapshot", async () => {
    const f = await fixture(), saved = await f.create();
    f.rows("financialProfile")[0].revision = 2;
    await expect(f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 1, expectedProfileRevision: 2, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "PROFILE_CHANGED_RECREATE_VERSION" });
    expect("replay" in await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).toBe(true);
  });
  it("rejects missing inputs and rolls back every write if audit fails", async () => {
    const f = await fixture(), preview = { ...f.command.preview, answers: [] }, result = await f.retirement.preview(f.owner, preview);
    await expect(f.plans.createVersion(f.owner, null, { ...f.command, preview, expectedInputHash: result.inputHash }, randomUUID())).rejects.toMatchObject({ status: 422 });
    f.failWrites("auditLog");
    await expect(f.create()).rejects.toThrow("Injected write failure");
    expect(f.rows("retirementPlan")).toHaveLength(0); expect(f.rows("planVersion")).toHaveLength(0); expect(f.rows("financialModelVersion")).toHaveLength(0);
  });
  it("ownership covers detail, history, replay, create and apply; cross-plan versions are rejected", async () => {
    const f = await fixture(), saved = await f.create(), second = await f.create();
    for (const call of [() => f.plans.get("other", saved.planId), () => f.plans.versions("other", saved.planId, { page: 1, limit: 1 }),
      () => f.plans.version("other", saved.planId, saved.saved.id, true), () => f.plans.createVersion("other", saved.planId, { ...f.command, expectedRevision: 1 }, randomUUID()),
      () => f.plans.apply("other", saved.planId, { versionId: saved.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID()),
      () => f.plans.apply(f.owner, second.planId, { versionId: saved.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID())])
      await expect(call()).rejects.toMatchObject({ status: 404 });
    expect((await f.plans.list("other", { page: 1, limit: 20 })).items).toEqual([]);
  });
  it("an apply audit failure rolls back current, baseline, revision and idempotency together", async () => {
    const f = await fixture(), saved = await f.create(), key = randomUUID();
    const cmd = { versionId: saved.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true as const };
    f.failWrites("auditLog");
    await expect(f.plans.apply(f.owner, saved.planId, cmd, key)).rejects.toThrow("Injected write failure");
    expect(f.rows("retirementPlan")[0]).toMatchObject({ currentVersionId: null, baselineVersionId: null, revision: 1 });
    expect(f.rows("idempotencyRecord").some(r => r.key === key)).toBe(false);
    f.failWrites(); expect((await f.plans.apply(f.owner, saved.planId, cmd, key)).revision).toBe(2);
  });
  it("batch worker pages once, preserves all snapshots and does not change current revisions", async () => {
    const f = await fixture(), first = await f.create(), original = f.rows("planVersion")[0] as Prisma.PlanVersionUncheckedCreateInput;
    await f.plans.apply(f.owner, first.planId, { versionId: first.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID());
    for (let i = 0; i < 20; i++) {
      const plan = await f.db.retirementPlan.create({ data: { userId: f.owner } });
      const version = await f.db.planVersion.create({ data: { ...original, id: randomUUID(), planId: plan.id } });
      await f.db.retirementPlan.update({ where: { id: plan.id }, data: { currentVersionId: version.id } });
    }
    const before = structuredClone(f.rows("planVersion")), revisions = f.rows("retirementPlan").map(p => p.revision);
    const event = await f.db.outboxEvent.create({ data: { type: "financial.recalculate_batch", entityId: f.policy.id,
      payload: { assumptionId: first.saved.preview.references.assumptionVersionId, cursor: null } } });
    const handler = createEventHandler(f.db, config, vi.fn());
    await handler(event); await handler(event);
    const children = f.rows("outboxEvent").filter(e => e.type === event.type && e.id !== event.id);
    expect(children).toHaveLength(1);
    await handler(children[0] as never);
    expect(f.rows("retirementPlan").every(p => p.stale)).toBe(true);
    expect(f.rows("retirementPlan").map(p => p.revision)).toEqual(revisions);
    expect(f.rows("planVersion")).toEqual(before);
  });
  it("JSONB key order does not break integrity; mutated stored results do", async () => {
    const f = await fixture(), saved = await f.create(), row = f.rows("planVersion")[0];
    const reorder = (v: any): any => Array.isArray(v) ? v.map(reorder) : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reorder(v[k])])) : v;
    row.inputSnapshot = reorder(row.inputSnapshot); row.result = reorder(row.result);
    expect((await f.plans.version(f.owner, saved.planId, saved.saved.id)).snapshotHash).toBe(saved.saved.snapshotHash);
    row.result.summary.terminalBalance = "999";
    await expect(f.plans.version(f.owner, saved.planId, saved.saved.id)).rejects.toMatchObject({ code: "SNAPSHOT_INTEGRITY_FAILED" });
  });
  it("legacy workers only flag updates, deduplicate retry and respect a changed current version", async () => {
    const f = await fixture(), saved = await f.create();
    await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID());
    const event = await f.db.outboxEvent.create({ data: { type: "financial.recalculate_plan", entityId: saved.planId,
      payload: { assumptionId: saved.saved.preview.references.assumptionVersionId, userId: f.owner, expectedCurrentVersionId: saved.saved.id } } });
    // Legacy payload requires UUID owner; the test fixture auth owner is a string.
    event.payload = { ...(event.payload as object), userId: randomUUID() }; f.rows("retirementPlan")[0].userId = (event.payload as any).userId;
    const send = vi.fn(), handler = createEventHandler(f.db, config, send);
    const before = structuredClone(f.rows("planVersion"));
    await handler(event); await new FinancialService(f.db).handleEvent(event);
    expect(f.rows("retirementPlan")[0]).toMatchObject({ stale: true, currentVersionId: saved.saved.id, revision: 2 });
    expect(f.rows("planVersion")).toEqual(before); expect(f.rows("processedEvent")).toHaveLength(1); expect(send).not.toHaveBeenCalled();
    f.rows("retirementPlan")[0].stale = false; event.id = randomUUID();
    event.payload = { ...(event.payload as object), expectedCurrentVersionId: randomUUID() };
    await handler(event); expect(f.rows("retirementPlan")[0].stale).toBe(false);
  });
  it("HTTP enforces USER, session, DTO, idempotency header and returns stored plan data", async () => {
    const f = await fixture(), auth = new AuthService(f.db, config);
    vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
    const app = createApp({ config, services: { auth, profiles: f.profiles, retirement: f.retirement, plans: f.plans } });
    const path = "/api/v1/me/retirement/plans";
    expect((await request(app).post(path).send(f.command)).status).toBe(401);
    expect((await request(app).post(path).set("Authorization", "Bearer " + token("ADMIN")).send(f.command)).status).toBe(403);
    expect((await request(app).post(path).set("Authorization", "Bearer " + token()).send(f.command)).status).toBe(400);
    const res = await request(app).post(path).set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID()).send(f.command);
    expect(res.status).toBe(201); expect(res.body.data.currentVersionId).toBeNull();
    const detail = await request(app).get(path + "/" + res.body.data.planId).set("Authorization", "Bearer " + token());
    expect(detail.status).toBe(200); expect(detail.body.data.revision).toBe(1);
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, uri: true, date: true, "date-time": true } });
    const check = (name: string, body: unknown) => { const validate = ajv.compile(spec.components.schemas["Plan" + name + "Envelope"]); expect(validate(body), JSON.stringify(validate.errors)).toBe(true); };
    check("Created", res.body); check("Detail", detail.body);
    for (const [url, schema] of [[path, "List"], [path + "/" + res.body.data.planId + "/versions", "History"],
      [path + "/" + res.body.data.planId + "/versions/" + res.body.data.saved.id, "Version"]]) {
      const response = await request(app).get(url).set("Authorization", "Bearer " + token()); expect(response.status).toBe(200); check(schema, response.body);
    }
    const applied = await request(app).post(path + "/" + res.body.data.planId + "/apply").set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID())
      .send({ versionId: res.body.data.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true });
    expect(applied.status).toBe(200); check("Applied", applied.body);
    check("Detail", (await request(app).get(path + "/" + res.body.data.planId).set("Authorization", "Bearer " + token())).body);
    const replay = await request(app).post(path + "/" + res.body.data.planId + "/versions/" + res.body.data.saved.id + "/replay").set("Authorization", "Bearer " + token()).send({});
    expect(replay.status).toBe(200); check("Replay", replay.body);
    expect(createPlanVersionSchema.safeParse({ ...f.command, currentVersionId: randomUUID() }).success).toBe(false);
    expect(applyPlanVersionSchema.safeParse({ versionId: res.body.data.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: false }).success).toBe(false);
  });
});
