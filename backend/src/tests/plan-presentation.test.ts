import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { plansFixture } from "./plans-fixtures";
import { retirementCommand, retirementConfiguration, retirementProfile } from "./retirement-fixtures";
import { fixtureAsset, known } from "./profile-v2-fixtures";
import { prepareRetirement } from "../modules/retirement/prepare";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { retirementPreviewSchema } from "../modules/retirement/schema";
import { comparePreviews, csvCell, monthlyCsvFields } from "../modules/plans/presentation";
import { AuthService } from "../modules/auth/service";
import { config, token } from "./helpers";
import { createApp } from "../app";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("T08 personal alternatives", () => {
  it("changes the target month without mutating profile, salary dates or pension start", () => {
    const profile = retirementProfile(), original = structuredClone(profile), cfg = retirementConfiguration();
    const input = { ...retirementCommand(), whatIf: { retirementMonth: "2026-12" } };
    const result = prepareRetirement(profile, input, cfg.policy, cfg.assumptions);
    expect(result.calculation?.summary).toMatchObject({ retirementMonth: "2026-12", accumulationMonths: 2, retirementMonths: 4 });
    expect(result.calculation?.summary.atRetirement).toMatchObject({ projectedFund: "200", requiredFund: "400" });
    expect(result.calculation?.rows[2].income).toBe("0");
    expect(profile).toEqual(original);
    expect(result.warnings).toContainEqual({ path: "whatIf", code: "HYPOTHETICAL_VALUES_PROFILE_UNCHANGED" });
  });
  it("alternative values keep ownership, retirement allocation and non-liquid exclusions", () => {
    const profile = retirementProfile(), cfg = retirementConfiguration();
    profile.assets = { status: "KNOWN", entries: [fixtureAsset({ ownershipShare: known("0.5") }), fixtureAsset({ id: "home", type: "PRIMARY_HOME" })] };
    const input = { ...retirementCommand(), whatIf: { assetValues: [{ assetId: "deposit-1", value: "1000" }, { assetId: "home", value: "999999999" }] } };
    const result = prepareRetirement(profile, input, cfg.policy, cfg.assumptions);
    expect(result.calculation?.summary.initialRetirementCapital).toBe("300");
    expect(profile.assets.entries[0].value).toEqual(known("100000000"));
    input.whatIf.assetValues[0].assetId = "unknown";
    expect(prepareRetirement(profile, input, cfg.policy, cfg.assumptions).issues).toContainEqual({ path: "whatIf.assetValues", code: "UNKNOWN_ASSET" });
  });
  it("rejects macro/ownership/date overrides, duplicate assets and invalid target; an empty alternative means none", () => {
    const command = retirementCommand();
    const empty = retirementPreviewSchema.parse({ ...command, whatIf: {} });
    expect(Object.hasOwn(empty, "whatIf") && empty.whatIf !== undefined).toBe(false);
    expect(JSON.stringify(empty)).toBe(JSON.stringify(retirementPreviewSchema.parse(command)));
    for (const whatIf of [{ annualReturnRate: "12" }, { assetValues: [{ assetId: "x", value: "1", ownershipShare: "1" }] },
      { assetValues: [{ assetId: "x", value: "1" }, { assetId: "x", value: "2" }] }, { retirementMonth: "2026-13" }])
      expect(retirementPreviewSchema.safeParse({ ...command, whatIf }).success).toBe(false);
    const cfg = retirementConfiguration();
    expect(() => prepareRetirement(retirementProfile(), { ...command, whatIf: { retirementMonth: "2026-09" } }, cfg.policy, cfg.assumptions)).toThrow();
  });
});
describe("T08 report, comparison, simulation and CSV", () => {
  it("report does not invent an applied version and can explicitly open an unapplied saved version", async () => {
    const f = await plansFixture(), saved = await f.create();
    expect(await f.plans.report(f.owner, saved.planId, {})).toMatchObject({ status: "NO_APPLIED_VERSION", version: null, goal: null });
    const report = await f.plans.report(f.owner, saved.planId, { versionId: saved.saved.id });
    expect(report.status).toBe("AVAILABLE"); expect(report.version).toEqual(saved.saved);
    expect(report.goal).toMatchObject({ retirementMonth: "2027-01", monthlyExpenseToday: "100" });
    expect(report.currentVersionId).toBeNull();
  });
  it("simulation, saving and applying keep the same result and never alter the source profile", async () => {
    const f = await plansFixture(), first = await f.create();
    const before = structuredClone(f.rows("financialProfile"));
    const preview = { ...f.command.preview, whatIf: { retirementMonth: "2026-12" } };
    const simulation = await f.plans.simulate(f.owner, first.planId, first.saved.id, { preview });
    expect(simulation).toMatchObject({ saved: false, applied: false, comparison: { status: "COMPARABLE", delta: { fundingGapAtValuation: "200" } } });
    expect(f.rows("planVersion")).toHaveLength(1);
    const saved = await f.plans.createVersion(f.owner, first.planId, { expectedRevision: 1, expectedInputHash: simulation.candidate.inputHash, preview }, randomUUID());
    await f.plans.apply(f.owner, first.planId, { expectedRevision: 2, expectedProfileRevision: 1, versionId: saved.saved.id, confirm: true }, randomUUID());
    const report = await f.plans.report(f.owner, first.planId, {});
    expect(report.version?.preview).toEqual(simulation.candidate); expect(report.hypothetical).toBe(true);
    expect(f.rows("financialProfile")).toEqual(before);
    const replay = await f.plans.version(f.owner, first.planId, saved.saved.id, true);
    expect("replay" in replay && replay.replay.matched).toBe(true);
  });
  it("comparison retains null percentages and refuses unrelated valuation dates or horizons", async () => {
    const f = await plansFixture(), a = await f.retirement.preview(f.owner, { ...f.command.preview, monthlyExpenseToday: "0" });
    const b = await f.retirement.preview(f.owner, f.command.preview);
    expect(comparePreviews(a, b).delta?.coveragePercentagePoints).toBeNull();
    expect(comparePreviews(a, b).atRetirement.delta?.coveragePercentagePoints).toBeNull();
    expect(comparePreviews(a, { ...b, valuationDate: "2026-11-04" })).toMatchObject({ status: "NOT_COMPARABLE", reasons: ["VALUATION_DATE_DIFFERS"], delta: null });
    expect(comparePreviews(a, { ...b, selection: { ...b.selection, endMonth: "2028-01" } }).delta).toBeNull();
    const missing = await f.retirement.preview(f.owner, { ...f.command.preview, answers: [] });
    expect(comparePreviews(a, missing)).toMatchObject({ status: "NOT_COMPARABLE", reasons: ["INCOMPLETE_CALCULATION"] });
  });
  it("compares retirement amounts at the same month, separately from discounted valuation amounts", async () => {
    const f = await plansFixture();
    const input = { ...f.command.preview, scenario: "FAVORABLE" as const };
    const a = await f.retirement.preview(f.owner, input);
    const b = await f.retirement.preview(f.owner, { ...input, monthlyExpenseToday: "80" });
    const before = JSON.stringify([a, b]);
    const comparison = comparePreviews(a, b);
    expect(comparison.atRetirement).toMatchObject({ status: "COMPARABLE", basis: "SAME_RETIREMENT_MONTH_NOMINAL", baselineMonth: "2027-01", candidateMonth: "2027-01" });
    expect(comparison.atRetirement.delta?.requiredFund).toBe(new D(b.calculation!.summary.atRetirement.requiredFund).minus(a.calculation!.summary.atRetirement.requiredFund).toFixed());
    expect(comparison.atRetirement.delta?.requiredFund).not.toBe(comparison.delta?.requiredFundAtValuation);
    const moved = await f.retirement.preview(f.owner, { ...input, whatIf: { retirementMonth: "2026-12" } });
    expect(comparePreviews(a, moved)).toMatchObject({ status: "COMPARABLE", atRetirement: { status: "NOT_COMPARABLE", reasons: ["RETIREMENT_MONTH_DIFFERS"], delta: null } });
    expect(comparePreviews(a, { ...b, currency: "USD" }).atRetirement).toMatchObject({ status: "NOT_COMPARABLE", delta: null });
    expect(JSON.stringify([a, b])).toBe(before);
  });
  it("exports a Vietnamese monthly report with rounded signed money without changing exact snapshots", async () => {
    const f = await plansFixture(), input = { ...f.command.preview, monthlyContribution: "0", monthlyExpenseToday: "100.75" };
    const preview = await f.retirement.preview(f.owner, input);
    const saved = await f.plans.createVersion(f.owner, null, { expectedRevision: 0, expectedInputHash: preview.inputHash, preview: input }, randomUUID());
    const exact = await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id);
    const report = await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id, "readable-vi");
    expect(report.content.startsWith("\uFEFF")).toBe(true);
    const lines = report.content.slice(1).trim().split("\r\n").map(line => line.slice(1, -1).split('\",\"'));
    const headers = lines[0];
    expect(headers).toHaveLength(20);
    expect(headers).not.toContain("snapshotHash");
    expect(lines).toHaveLength(7);
    expect(lines[4][headers.indexOf("Chi sinh hoạt (đồng)")]).toBe("101");
    expect(lines[4][headers.indexOf("Số dư dự báo, có thể âm (đồng)")]).toBe("-101");
    expect(lines[4][headers.indexOf("Giai đoạn")]).toBe("Nghỉ hưu");
    expect(await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id)).toEqual(exact);
    expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true))).toMatchObject({ replay: { matched: true } });
    await expect(f.plans.exportCsv("other", saved.planId, saved.saved.id, "readable-vi")).rejects.toMatchObject({ status: 404 });
  });
  it("pins report/export and comparison to old snapshots after publish, profile edits and a new current", async () => {
    const f = await plansFixture(), first = await f.create();
    await f.plans.apply(f.owner, first.planId, { versionId: first.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID());
    const csvBefore = await f.plans.exportCsv(f.owner, first.planId, first.saved.id);
    const preview = { ...f.command.preview, monthlyContribution: "50" }, candidate = await f.retirement.preview(f.owner, preview);
    const second = await f.plans.createVersion(f.owner, first.planId, { expectedRevision: 2, expectedInputHash: candidate.inputHash, preview }, randomUUID());
    await f.plans.apply(f.owner, first.planId, { versionId: second.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID());
    await f.publish(); f.rows("financialProfile")[0].revision = 2;
    const report = await f.plans.report(f.owner, first.planId, { versionId: first.saved.id });
    expect(report.version).toEqual(first.saved); expect(report.currentVersionId).toBe(second.saved.id); expect(report.profileChanged).toBe(true);
    expect(await f.plans.exportCsv(f.owner, first.planId, first.saved.id)).toEqual(csvBefore);
    const comparison = await f.plans.compare(f.owner, first.planId, { baselineVersionId: first.saved.id, candidateVersionId: second.saved.id });
    expect(comparison.comparison.delta).toMatchObject({ projectedFundAtValuation: "-150", fundingGapAtValuation: "150" });
  });
  it("CSV uses exact signed monthly values and source IDs with safe textual cells", async () => {
    const f = await plansFixture(), preview = { ...f.command.preview, scenario: "ADVERSE" as const, monthlyContribution: "0", monthlyExpenseToday: "100.12" };
    const result = await f.retirement.preview(f.owner, preview);
    const saved = await f.plans.createVersion(f.owner, null, { expectedRevision: 0, expectedInputHash: result.inputHash, preview }, randomUUID());
    const csv = await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id);
    const rows = csv.content.replace(/^\uFEFF/, "").trim().split("\r\n").map(line => line.slice(1, -1).split('\",\"'));
    expect(rows.length).toBe(7); const headers = rows[0];
    result.calculation!.rows.forEach((row, i) => {
      for (const field of monthlyCsvFields) expect(rows[i + 1][headers.indexOf(field)]).toBe(row[field]);
      expect(rows[i + 1][headers.indexOf("versionId")]).toBe(saved.saved.id);
      expect(rows[i + 1][headers.indexOf("assumptionHash")]).toBe(result.references.assumptionHash);
    });
    expect(result.calculation!.rows.some(row => row.closingBalance.startsWith("-") && (row.closingBalance.split(".")[1]?.length ?? 0) > 2)).toBe(true);
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("-100.12345")).toBe('"-100.12345"'); expect(csvCell("a,b\nline")).toBe('"a,b\nline"');
  });
  it("protects report, export, comparison and simulation against other owners/cross-plan IDs", async () => {
    const f = await plansFixture(), a = await f.create(), b = await f.create();
    for (const call of [() => f.plans.report("other", a.planId, {}), () => f.plans.exportCsv("other", a.planId, a.saved.id),
      () => f.plans.compare("other", a.planId, { baselineVersionId: a.saved.id, candidateVersionId: a.saved.id }),
      () => f.plans.simulate("other", a.planId, a.saved.id, { preview: f.command.preview }),
      () => f.plans.report(f.owner, a.planId, { versionId: b.saved.id }),
      () => f.plans.compare(f.owner, a.planId, { baselineVersionId: a.saved.id, candidateVersionId: b.saved.id })])
      await expect(call()).rejects.toMatchObject({ status: 404 });
    await expect(f.plans.simulate(f.owner, a.planId, a.saved.id, { preview: { ...f.command.preview, expectedProfileRevision: 2 } })).rejects.toMatchObject({ status: 409 });
  });
  it("HTTP contracts, headers and read-only behavior are consistent across all T08 endpoints", async () => {
    const f = await plansFixture(), saved = await f.create(), auth = new AuthService(f.db, config);
    vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
    const app = createApp({ config, services: { auth, profiles: f.profiles, retirement: f.retirement, plans: f.plans } });
    const path = `/api/v1/me/retirement/plans/${saved.planId}`;
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, uri: true, date: true, "date-time": true } });
    const check = (name: string, body: unknown) => { const validate = ajv.compile(spec.components.schemas["Plan" + name + "Envelope"]); expect(validate(body), JSON.stringify(validate.errors)).toBe(true); };
    const before = JSON.stringify([f.rows("financialProfile"), f.rows("retirementPlan"), f.rows("planVersion"), f.rows("outboxEvent"), f.rows("auditLog")]);
    const report = await request(app).get(path + "/report?versionId=" + saved.saved.id).set("Authorization", "Bearer " + token());
    expect(report.status).toBe(200); check("Report", report.body);
    check("Report", (await request(app).get(path + "/report").set("Authorization", "Bearer " + token())).body);
    const compare = await request(app).post(path + "/compare").set("Authorization", "Bearer " + token()).send({ baselineVersionId: saved.saved.id, candidateVersionId: saved.saved.id });
    expect(compare.status).toBe(200); check("Comparison", compare.body);
    for (const preview of [f.command.preview, { ...f.command.preview, answers: [] }, { ...f.command.preview, whatIf: { retirementMonth: "2026-12" } }]) {
      const simulation = await request(app).post(path + "/versions/" + saved.saved.id + "/simulate").set("Authorization", "Bearer " + token()).send({ preview });
      expect(simulation.status).toBe(200); check("Simulation", simulation.body);
    }
    const csvPath = path + "/versions/" + saved.saved.id + "/export.csv";
    const csv = await request(app).get(csvPath).set("Authorization", "Bearer " + token());
    expect(csv.status).toBe(200); expect(csv.headers["content-type"]).toContain("text/csv"); expect(csv.headers["cache-control"]).toBe("no-store");
    expect(csv.headers["content-disposition"]).toContain(saved.saved.id);
    expect(csv.headers["access-control-expose-headers"]).toContain("Content-Disposition");
    expect(csv.text.replace(/^\uFEFF/, "")).toBe((await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id)).content.replace(/^\uFEFF/, ""));
    const readable = await request(app).get(csvPath + "?format=readable-vi").set("Authorization", "Bearer " + token());
    expect(readable.status).toBe(200);
    expect(readable.headers["content-disposition"]).toContain("tieng-viet.csv");
    expect(readable.headers["cache-control"]).toBe("no-store");
    expect(readable.text).toContain("Tiền đầu tháng (đồng)");
    expect((await request(app).get(csvPath + "?format=unknown").set("Authorization", "Bearer " + token())).status).toBe(400);
    expect((await request(app).get(csvPath)).status).toBe(401);
    expect((await request(app).get(csvPath).set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
    expect(JSON.stringify([f.rows("financialProfile"), f.rows("retirementPlan"), f.rows("planVersion"), f.rows("outboxEvent"), f.rows("auditLog")])).toBe(before);
  });
});
