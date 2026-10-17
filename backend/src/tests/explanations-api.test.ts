import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { digest } from "../common/digest";
import { AuthService } from "../modules/auth/service";
import { ActualsService } from "../modules/actuals/service";
import { ExplanationsService } from "../modules/explanations/service";
import { sourceReforecastSchema } from "../modules/plans/source-schema";
import { RetirementService } from "../modules/retirement/service";
import { projectRetirement as legacyProjection } from "../modules/retirement/engine-v2";
import { plansFixture } from "./plans-fixtures";
import { retirementProfile } from "./retirement-fixtures";
import { config, token } from "./helpers";

const root = "/api/v1/me/explanations";
const metricKey = "summary.atRetirement.projectedFund";
const bearer = "Bearer " + token();
beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

async function fixture() {
  const f = await plansFixture(), explanations = new ExplanationsService(f.db), auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
  const app = createApp({ config, services: { auth, profiles: f.profiles, explanations } });
  const body = { metricKey, source: { kind: "PREVIEW" as const, input: f.command.preview } };
  const post = (data: object = body) => request(app).post(root + "/metric").set("Authorization", bearer).send(data);
  return { ...f, explanations, app, body, post };
}

describe("deterministic explanations trust boundaries", () => {
  it("recomputes PREVIEW with one server capture, pinned assumptions and no writes", async () => {
    const f = await fixture(), input = { ...f.command.preview, monthlyContribution: "20" };
    const expected = await f.retirement.preview(f.owner, input), previous = await f.retirement.preview(f.owner, f.command.preview);
    const before = JSON.stringify([f.rows("financialProfile"), f.rows("retirementPlan"), f.rows("planVersion"), f.rows("auditLog")]);
    const capture = vi.spyOn(RetirementService.prototype, "capture");
    const evaluate = vi.spyOn(RetirementService.prototype, "evaluate");
    const result = await f.explanations.metric(f.owner, { metricKey, source: { kind: "PREVIEW", input } });
    expect(result.value).toBe(expected.calculation!.summary.atRetirement.projectedFund);
    expect(result.value).not.toBe(previous.calculation!.summary.atRetirement.projectedFund);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result.assumptions.version).toBe(expected.references.assumptionVersion);
    expect(result.assumptions.sources).toEqual(expected.sources);
    expect(JSON.stringify([f.rows("financialProfile"), f.rows("retirementPlan"), f.rows("planVersion"), f.rows("auditLog")])).toBe(before);
  });

  it("defaults to SUMMARY, accepts MONTHLY and never runs the full preview adjustment search", async () => {
    const f = await fixture();
    const full = vi.spyOn(RetirementService.prototype, "previewCaptured");
    const light = vi.spyOn(RetirementService.prototype, "previewForExplanation");
    const summary = await f.explanations.metric(f.owner, f.body);
    const monthly = await f.explanations.metric(f.owner, { ...f.body, detail: "MONTHLY" });
    expect(summary.detail).toBe("SUMMARY"); expect(monthly.detail).toBe("MONTHLY");
    expect(summary.value).toBe(monthly.value);
    expect(monthly.steps.length).toBeGreaterThan(summary.steps.length);
    expect(full).not.toHaveBeenCalled();
    expect(light).toHaveBeenCalledTimes(2);
    expect((await f.post({ ...f.body, detail: "ALL" })).status).toBe(400);
    expect((await f.post()).body.data.detail).toBe("SUMMARY");
  });

  it("reads the owned immutable saved result even after the current profile and published documents change", async () => {
    const f = await fixture(), saved = await f.create();
    const source = { kind: "PLAN_VERSION" as const, planId: saved.planId, versionId: saved.saved.id };
    const original = await f.explanations.metric(f.owner, { metricKey, source });
    f.rows("financialProfile")[0].revision = 2;
    f.rows("financialProfile")[0].profileData = retirementProfile();
    f.rows("financialProfile")[0].profileData.personal.desiredRetirementMonth.value = "2027-03";
    await f.publish();
    const before = JSON.stringify(f.rows("planVersion"));
    const capture = vi.spyOn(RetirementService.prototype, "capture");
    expect(await f.explanations.metric(f.owner, { metricKey, source })).toEqual(original);
    expect(original.value).toBe(saved.saved.preview.calculation!.summary.atRetirement.projectedFund);
    expect(original.assumptions.version).toBe(saved.saved.preview.references.assumptionVersion);
    expect(capture).not.toHaveBeenCalled();
    expect(await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).toHaveProperty("replay.matched", true);
    expect(JSON.stringify(f.rows("planVersion"))).toBe(before);
  });

  it("rejects another owner's plan, cross-plan versions and missing versions before exposing values", async () => {
    const f = await fixture(), saved = await f.create(), second = await f.create();
    const body = { metricKey, source: { kind: "PLAN_VERSION" as const, planId: saved.planId, versionId: saved.saved.id } };
    await expect(f.explanations.metric("other-user", body)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(f.explanations.metric(f.owner, { ...body, source: { ...body.source, planId: second.planId } })).rejects.toMatchObject({ status: 404 });
    await expect(f.explanations.metric(f.owner, { ...body, source: { ...body.source, versionId: randomUUID() } })).rejects.toMatchObject({ status: 404 });
  });

  it("uses PlansService integrity validation for saved explanations", async () => {
    const f = await fixture(), saved = await f.create();
    f.rows("planVersion")[0].result.summary.atRetirement.projectedFund = "999999";
    await expect(f.explanations.metric(f.owner, { metricKey,
      source: { kind: "PLAN_VERSION", planId: saved.planId, versionId: saved.saved.id } }))
      .rejects.toMatchObject({ status: 409, code: "SNAPSHOT_INTEGRITY_FAILED" });
  });

  it("does not reconstruct absent saved preview supplements from the current profile", async () => {
    const f = await fixture(), saved = await f.create();
    const capture = vi.spyOn(RetirementService.prototype, "capture");
    const before = JSON.stringify(f.rows("planVersion"));
    for (const key of ["capitalSeparation.growthCapital", "lossConstraint.lossAmount", "essentialCoverage.essentialShortfall"])
      await expect(f.explanations.metric(f.owner, { metricKey: key,
        source: { kind: "PLAN_VERSION", planId: saved.planId, versionId: saved.saved.id } }))
        .rejects.toMatchObject({ status: 422, code: "METRIC_NOT_AVAILABLE" });
    expect(capture).not.toHaveBeenCalled();
    expect(JSON.stringify(f.rows("planVersion"))).toBe(before);
  });

  it("reads legacy v2 snapshots without adding defaults, changing hashes or changing replay", async () => {
    const f = await fixture(), saved = await f.create(), row = f.rows("planVersion")[0];
    const snapshot = structuredClone(row.inputSnapshot);
    delete snapshot.preview.replayInput.modelVersion;
    delete snapshot.preview.replayInput.contributionStartMonth;
    delete snapshot.preview.selection.contributionTiming;
    delete snapshot.preview.selection.surplusPolicy;
    const calculation = legacyProjection(snapshot.preview.replayInput);
    snapshot.preview.modelVersion = "retirement-monthly-v2";
    snapshot.preview.calculation = { ...snapshot.preview.calculation, ...calculation };
    const { integrityHash: _old, ...payload } = snapshot;
    snapshot.integrityHash = digest(payload);
    row.inputSnapshot = snapshot; row.result = snapshot.preview.calculation; row.chartSeries = calculation.rows;
    const before = JSON.stringify(row);
    const explanation = await f.explanations.metric(f.owner, { metricKey,
      source: { kind: "PLAN_VERSION", planId: saved.planId, versionId: saved.saved.id } });
    expect(explanation.value).toBe(calculation.summary.atRetirement.projectedFund);
    expect(await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).toHaveProperty("replay.matched", true);
    expect(JSON.stringify(row)).toBe(before);
  });

  it("reads source-based v4 values from their saved actual anchor rather than today's profile", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-05T00:00:00Z"));
    const f = await fixture(), first = await f.create(), actuals = new ActualsService(f.db);
    await actuals.write(f.owner, "2026-10", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1000",
      closingBalance: "1000", entries: [], correctionReason: "Verified statement" } }, randomUUID());
    const input = sourceReforecastSchema.parse({ versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash,
      expectedRevision: 1, expectedProfileRevision: 1, throughMonth: "2026-10", pensionSelections: [], sourceCommands: [{
        operation: "CREATE", commandId: randomUUID(), sourceId: "plan:rent", expectedSourceRevision: 0, effectiveFromMonth: "2026-11",
        effectiveToMonth: "2027-03", metric: "income", frequency: "MONTHLY", amount: "500", currency: "VND",
        confirmation: "HYPOTHETICAL", document: "Expected rental contract", confirm: true,
      }] });
    const preview = await f.plans.previewSources(f.owner, first.planId, input);
    const saved = await f.plans.saveSources(f.owner, first.planId, { preview: input, expectedInputHash: preview.inputHash!, confirm: true }, randomUUID());
    const before = JSON.stringify(f.rows("planVersion"));
    const explanation = await f.explanations.metric(f.owner, { metricKey,
      source: { kind: "PLAN_VERSION", planId: saved.planId, versionId: saved.saved.id } });
    expect(saved.saved.preview.modelVersion).toBe("retirement-monthly-v4");
    expect(explanation.value).toBe(saved.saved.preview.calculation!.summary.atRetirement.projectedFund);
    expect(await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).toHaveProperty("replay.matched", true);
    expect(JSON.stringify(f.rows("planVersion"))).toBe(before);
  });
});

describe("explanations HTTP contract and access", () => {
  it("requires an authenticated USER for metric and glossary routes", async () => {
    const f = await fixture();
    for (const role of [undefined, "ADMIN", "USER"] as const) {
      const metric = request(f.app).post(root + "/metric").send(f.body);
      const glossary = request(f.app).get(root + "/glossary");
      if (role) { metric.set("Authorization", "Bearer " + token(role)); glossary.set("Authorization", "Bearer " + token(role)); }
      expect((await metric).status).toBe(role === "USER" ? 200 : role === "ADMIN" ? 403 : 401);
      expect((await glossary).status).toBe(role === "USER" ? 200 : role === "ADMIN" ? 403 : 401);
    }
  });

  it("rejects arbitrary client result fields at every request nesting boundary", async () => {
    const f = await fixture(), { input } = f.body.source;
    const invalid = [
      { ...f.body, value: "999999" },
      { ...f.body, source: { ...f.body.source, calculation: { summary: { projectedFund: "999999" } } } },
      { ...f.body, source: { ...f.body.source, input: { ...input, summary: { projectedFund: "999999" } } } },
      { ...f.body, source: { ...f.body.source, input: { ...input, annualReturnRate: "100" } } },
      { ...f.body, source: { ...f.body.source, input: { ...input, monthlyContribution: 100 } } },
      { ...f.body, source: { ...f.body.source, input: { ...input, answers: [{ ...input.answers[0], value: "999999" }] } } },
      { ...f.body, source: { ...f.body.source, input: { ...input, advisoryFee: { annualPercent: "1", paidFrom: "FUND", advisoryFeeAmount: "999999" } } } },
      { ...f.body, source: { ...f.body.source, input: { ...input, whatIf: { assetValues: [{ assetId: "deposit-1", value: "100", projectedFund: "999999" }] } } } },
      { ...f.body, source: { ...f.body.source, input: { ...input, contributionSchedule: [{ month: "2026-10", amount: "10", closingBalance: "999999" }] } } },
      { metricKey, source: { kind: "PLAN_VERSION", planId: randomUUID(), versionId: randomUUID(), result: { projectedFund: "999999" } } },
      { metricKey, source: { kind: "PLAN_VERSION", planId: "not-an-id", versionId: randomUUID() } },
      { metricKey, source: { kind: "OTHER", input } },
    ];
    const capture = vi.spyOn(RetirementService.prototype, "capture");
    for (const body of invalid) {
      const response = await f.post(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(capture).not.toHaveBeenCalled();
  });

  it("returns METRIC_NOT_AVAILABLE for unknown metrics, uncharged fees and unavailable projection data", async () => {
    const f = await fixture();
    for (const key of ["summary.inventedMetric", "rows.2026-10.advisoryFeeAmount", "rows.2030-01.advisoryFeeAmount"]) {
      const response = await f.post({ ...f.body, metricKey: key });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("METRIC_NOT_AVAILABLE");
    }
    const response = await f.post({ ...f.body, source: { ...f.body.source, input: { ...f.body.source.input, answers: [] } } });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("METRIC_NOT_AVAILABLE");
  });

  it("limits metric calculations to 30 per minute per authenticated account", async () => {
    const f = await fixture();
    for (let i = 0; i < 30; i++) expect((await f.post()).status).toBe(200);
    const response = await f.post();
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
    // A separate router instance does not reuse a global limiter store.
    expect((await (await fixture()).post()).status).toBe(200);
  });

  it("serves a versioned bilingual glossary and OpenAPI schemas matching actual responses", async () => {
    const f = await fixture(), metric = await f.post(), glossary = await request(f.app).get(root + "/glossary").set("Authorization", bearer);
    expect(metric.status).toBe(200); expect(glossary.status).toBe(200);
    expect(glossary.body.data.version).toBeTruthy();
    expect(glossary.body.data.terms.length).toBeGreaterThanOrEqual(25);
    expect(glossary.body.data.terms.length).toBeLessThanOrEqual(40);
    expect(new Set(glossary.body.data.terms.map((t: { key: string }) => t.key)).size).toBe(glossary.body.data.terms.length);
    for (const term of glossary.body.data.terms) {
      expect(term.label.vi).toBeTruthy(); expect(term.label.en).toBeTruthy();
      expect(term.definition.vi).toBeTruthy(); expect(term.definition.en).toBeTruthy();
    }
    const spec = await SwaggerParser.validate("docs/openapi.yaml") as any;
    const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
    for (const [path, verb, response] of [[root + "/metric", "post", metric], [root + "/glossary", "get", glossary]] as const) {
      const operation = spec.paths[path][verb], schema = operation.responses["200"].content["application/json"].schema;
      const validate = ajv.compile(schema);
      expect(validate(response.body), JSON.stringify(validate.errors)).toBe(true);
    }
    const validateBody = ajv.compile(spec.paths[root + "/metric"].post.requestBody.content["application/json"].schema);
    expect(validateBody(f.body), JSON.stringify(validateBody.errors)).toBe(true);
    expect(validateBody({ ...f.body, value: "999999" })).toBe(false);
    expect(validateBody({ ...f.body, source: { ...f.body.source, input: { ...f.body.source.input, summary: { projectedFund: "999999" } } } })).toBe(false);
  });
});
