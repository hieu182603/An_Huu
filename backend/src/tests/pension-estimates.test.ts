import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { validatedVoluntaryPrepaidFixture, validatedVoluntaryTopUpFixture, validatedBenefitFixture, stateBenefitFixture, validatedVoluntaryFixture, validatedVoluntaryStateFixture } from "./benefit-fixtures";
import { memoryDb } from "./memory-db";
import { validateLegalDocument } from "../modules/pensions/legal-validation";
import { InsuranceHistoryService } from "../modules/pensions/history-service";
import { LegalRulesService } from "../modules/pensions/legal-service";
import { PensionEstimateService } from "../modules/pensions/estimate-service";
import { legalRuleDraftSchema } from "../modules/pensions/insurance-schema";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { BENEFIT_ENGINE_V2, ORDINARY_CITATIONS_V2, ORDINARY_STRATEGY_V2 } from "../modules/pensions/benefit-assessment-v2";
import { wageFactors2026 } from "../modules/pensions/benefit-validation";
import { digest } from "../common/digest";
import { pensionSourceCandidate, type PensionSourceSelection } from "../modules/pensions/source-candidate";
import { sealSourceRegistry, sealSourceRevision, composeSourceMonths } from "../modules/retirement/sources";

it("validates the registered statutory branch and rejects altered factors, cohorts and sources", () => {
  const f = validatedBenefitFixture(), valid = validateLegalDocument(f.rules);
  expect(valid.issues).toEqual([]); expect(valid.valid).toBe(true);
  expect(valid.coverage[0].cases).toHaveLength(9);
  for (const mutation of [
    (r: typeof f.rules) => { r.tables.find(t => t.kind === "WAGE_FACTOR")!.value = "9"; },
    (r: typeof f.rules) => { r.tables.find(t => t.kind === "AGE_MONTHS")!.value = "600"; },
    (r: typeof f.rules) => { r.citations[0].url = "https://chinhphu.vn.example.org/"; },
    (r: typeof f.rules) => { r.tables.find(t => t.kind === "REFERENCE_AMOUNT")!.effectiveTo = "2028-01-01"; },
  ]) { const rules = structuredClone(f.rules); mutation(rules); expect(validateLegalDocument(rules).valid).toBe(false); }
});
async function fixture(months = 180, data = validatedBenefitFixture(months)) {
  const f = memoryDb();
  for (const [id, role] of [["owner", "USER"], ["author", "ADMIN"], ["reviewer", "ADMIN"]] as const)
    await f.db.user.create({ data: { id, role, status: "ACTIVE", email: id + "@example.invalid", passwordHash: "test", fullName: "Synthetic" } });
  const histories = new InsuranceHistoryService(f.db), rules = new LegalRulesService(f.db), estimates = new PensionEstimateService(f.db);
  const command = { expectedHistoryRevision: 0, document: data.history }, preview = await histories.preview("owner", command);
  const history = await histories.save("owner", { preview: command, expectedInputHash: preview.inputHash, confirm: true }, randomUUID());
  const draft = legalRuleDraftSchema.parse({ code: "TEST_BH1", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01", document: data.rules });
  async function publish(supersedesId: string | null = null, document = data.rules) {
    let r = await rules.create("author", { ...draft, supersedesId, document }, randomUUID());
    r = await rules.transition("author", r.id, { action: "VALIDATE", expectedRevision: r.revision, expectedDocumentHash: r.documentHash, confirm: true }, randomUUID());
    const validationHash = (r.validation as any).validationHash;
    r = await rules.transition("reviewer", r.id, { action: "REVIEW", expectedRevision: r.revision, expectedDocumentHash: r.documentHash, validationHash, reviewNote: "Synthetic workflow fixture", confirm: true }, randomUUID());
    return rules.transition("author", r.id, { action: "PUBLISH", expectedRevision: r.revision, expectedDocumentHash: r.documentHash, validationHash, reviewHash: (r.review as any).reviewHash, confirm: true }, randomUUID());
  }
  const rule = await publish(), input = { ...data.input, historyVersionId: history.id, legalRuleSetVersionId: rule.id };
  return { ...f, data, histories, rules, estimates, history, rule, input, publish };
}
it("saves and replays a state salary assessment through the owned production service", async () => {
  const data = stateBenefitFixture(); data.rules.citations.forEach(c => { c.url = "https://vanban.chinhphu.vn/"; });
  data.rules.tables.filter(t => t.kind === "WAGE_FACTOR").forEach(t => { t.value = wageFactors2026[t.key.split(":")[1]]; });
  const f = await fixture(180, data), p = await f.estimates.preview("owner", f.input);
  expect(p).toMatchObject({ engineCode: "vn-pension-state-v1", assessment: { monthlyPension: "4048000", assessmentStatus: "ELIGIBLE" } });
  expect((await f.estimates.publishedRules("2026-07-01")).items.map(r => r.id)).toEqual([f.rule.id]);
  const saved = await f.estimates.save("owner", { preview: f.input, expectedInputHash: p.inputHash }, randomUUID());
  expect(await f.estimates.get("owner", saved.id)).toEqual(saved);
  const preview = { expectedHistoryRevision: 1, document: structuredClone(data.history) };
  preview.document.months[0].stateSalary!.evidence = [{ ...preview.document.months[0].evidence[0], confirmedOn: "2199-01-01" }];
  await expect(f.histories.preview("owner", preview)).rejects.toMatchObject({ code: "FUTURE_HISTORY_CONFIRMATION" });
});
it.each(["compulsory", "voluntary", "mixed", "state-voluntary", "top-up", "prepaid"])("saves an owned idempotent immutable %s estimate and replays after history and rules change", async (kind) => {
  const f = await fixture(180, kind === "prepaid" ? validatedVoluntaryPrepaidFixture() : kind === "top-up" ? validatedVoluntaryTopUpFixture() : kind === "state-voluntary" ? validatedVoluntaryStateFixture() : kind === "compulsory" ? validatedBenefitFixture() : validatedVoluntaryFixture(kind === "mixed" ? 120 : 0)), p = await f.estimates.preview("owner", f.input);
  expect(p.assessment.assessmentStatus).toBe("ELIGIBLE");
  expect(Number(p.assessment.monthlyPension)).toBeCloseTo(kind === "prepaid" ? 4857333.33 : kind === "top-up" ? 4062666.67 : kind === "state-voluntary" ? 3261866.67 : 4937333.33, 2);
  const cmd = { preview: f.input, expectedInputHash: p.inputHash }, key = randomUUID();
  const saved = await f.estimates.save("owner", cmd, key);
  expect(await f.estimates.save("owner", cmd, key)).toEqual(saved);
  expect(f.rows("pensionEstimate")).toHaveLength(1);
  await expect(f.estimates.get("stranger", saved.id)).rejects.toMatchObject({ status: 404 });
  await expect(f.estimates.preview("stranger", f.input)).rejects.toMatchObject({ status: 404 });
  const replacement = await f.publish(f.rule.id);
  expect((await f.estimates.publishedRules("2026-07-01")).items.map(r => r.id)).toEqual([replacement.id]);
  await expect(f.estimates.preview("owner", f.input)).rejects.toMatchObject({ code: "RULE_VERSION_SUPERSEDED" });
  const next = { expectedHistoryRevision: 1, document: f.data.history }, np = await f.histories.preview("owner", next);
  await f.histories.save("owner", { preview: next, expectedInputHash: np.inputHash, confirm: true }, randomUUID());
  await expect(f.estimates.preview("owner", { ...f.input, legalRuleSetVersionId: replacement.id })).rejects.toMatchObject({ code: "HISTORY_REVISION_CONFLICT" });
  expect(await f.estimates.get("owner", saved.id)).toEqual(saved);
  expect(f.rows("financialProfile")).toHaveLength(0);
});
it.each(["compulsory", "voluntary", "state-voluntary", "top-up", "prepaid"])("captures an owned %s estimate into an immutable source candidate, with explicit future-only nominal pension and no capital", async (kind) => {
  const f = await fixture(180, kind === "prepaid" ? validatedVoluntaryPrepaidFixture() : kind === "top-up" ? validatedVoluntaryTopUpFixture() : kind === "state-voluntary" ? validatedVoluntaryStateFixture() : kind === "compulsory" ? validatedBenefitFixture() : validatedVoluntaryFixture()), preview = await f.estimates.preview("owner", f.input);
  const saved = await f.estimates.save("owner", { preview: f.input, expectedInputHash: preview.inputHash }, randomUUID());
  const evidence = await f.estimates.captureForSource("owner", saved.id, saved.integrityHash);
  const registry = sealSourceRegistry({ schemaVersion: 1, startMonth: "2026-07", endMonth: "2027-12", knowledgeAsOf: evidence.capture.assessedOn,
    originHash: digest("parent plan"), revisions: [] });
  const selection: PensionSourceSelection = { estimateId: saved.id, expectedEstimateIntegrityHash: saved.integrityHash,
    expectedRegistryHash: registry.registryHash, commandId: randomUUID(), sourceId: "pension:selected", operation: "CREATE", expectedSourceRevision: 0,
    effectiveFromMonth: "2026-11", effectiveToMonth: "2027-12", amountPolicy: "FIXED_NOMINAL", confirm: true };
  const build = (input = selection, proof = evidence, source = registry) => pensionSourceCandidate(source, input, proof, "owner", "2026-10", proof.capture.assessedOn);
  const candidate = build(), rows = composeSourceMonths(candidate.registry).rows;
  expect(rows.filter(r => r.month <= "2026-10").every(r => r.pension === "0")).toBe(true);
  expect(rows.filter(r => r.month > "2026-10").every(r => r.pension === saved.assessment.monthlyPension)).toBe(true);
  expect(rows.every(r => r.capitalInjection === "0" && r.income === "0")).toBe(true);
  expect(candidate.registry.revisions[0].confirmation).toBe("HYPOTHETICAL");
  expect(registry.revisions).toEqual([]); expect(f.rows("financialProfile")).toHaveLength(0);
  expect(() => build({ ...selection, effectiveFromMonth: "2026-10" })).toThrowError(expect.objectContaining({ code: "PENSION_SOURCE_PERIOD_INVALID" }));
  expect(() => build({ ...selection, expectedRegistryHash: digest("changed") })).toThrowError(expect.objectContaining({ code: "SOURCE_REGISTRY_CHANGED" }));
  await expect(f.estimates.captureForSource("other", saved.id, saved.integrityHash)).rejects.toMatchObject({ status: 404 });
  await expect(f.estimates.captureForSource("owner", saved.id, digest("stale"))).rejects.toMatchObject({ code: "PENSION_ESTIMATE_CHANGED" });
  const altered = structuredClone(evidence); altered.capture.history.document.months[0].contributionBase = "1";
  const { evidenceHash: _, ...alteredPayload } = altered; altered.evidenceHash = digest(alteredPayload);
  expect(() => build(selection, altered)).toThrow();
  // New selection is blocked by stale history; the already pinned candidate still replays.
  const next = { expectedHistoryRevision: 1, document: f.data.history }, p = await f.histories.preview("owner", next);
  await f.histories.save("owner", { preview: next, expectedInputHash: p.inputHash, confirm: true }, randomUUID());
  await expect(f.estimates.captureForSource("owner", saved.id, saved.integrityHash)).rejects.toMatchObject({ code: "HISTORY_REVISION_CONFLICT" });
  expect(build()).toEqual(candidate);
});
it("requires replacement of an existing pension and keeps prior months; does not inject retirement grants", async () => {
  const data = validatedBenefitFixture(421); data.rules.engineCode = BENEFIT_ENGINE_V2;
  data.rules.coverage[0].strategyCode = ORDINARY_STRATEGY_V2; data.rules.coverage[0].citationIds = ORDINARY_CITATIONS_V2;
  data.rules.citations.push(...["LAW_ART68", "TT12_ART14"].map(id => ({ ...data.rules.citations[0], id })));
  const f = await fixture(421, data), preview = await f.estimates.preview("owner", f.input);
  const saved = await f.estimates.save("owner", { preview: f.input, expectedInputHash: preview.inputHash }, randomUUID());
  const evidence = await f.estimates.captureForSource("owner", saved.id, saved.integrityHash);
  const previous = sealSourceRevision({ sourceId: "profile:pension", revision: 1, previousHash: null, scope: "PLAN_VERSION", origin: "PINNED_PROFILE",
    kind: "PENSION", effectiveFromMonth: "2026-07", effectiveToMonth: "2027-12", knownOn: evidence.capture.assessedOn, evidenceHash: digest("profile"),
    commandId: "profile-command", confirmation: "USER_CONFIRMED", operation: "CREATE",
    schedule: [{ month: "2026-10", metric: "pension", amount: "3000000" }, { month: "2026-11", metric: "pension", amount: "3000000" }] });
  const registry = sealSourceRegistry({ schemaVersion: 1, startMonth: "2026-07", endMonth: "2027-12", knowledgeAsOf: evidence.capture.assessedOn, originHash: digest("plan"), revisions: [previous] });
  const selection: PensionSourceSelection = { estimateId: saved.id, expectedEstimateIntegrityHash: saved.integrityHash, expectedRegistryHash: registry.registryHash,
    commandId: randomUUID(), sourceId: previous.sourceId, operation: "REVISE", expectedSourceRevision: 1, effectiveFromMonth: "2026-11", effectiveToMonth: "2027-12", amountPolicy: "FIXED_NOMINAL", confirm: true };
  const candidate = pensionSourceCandidate(registry, selection, evidence, "owner", "2026-10", evidence.capture.assessedOn);
  const rows = composeSourceMonths(candidate.registry).rows;
  expect(rows.find(r => r.month === "2026-10")!.pension).toBe("3000000");
  expect(rows.find(r => r.month === "2026-11")!.pension).toBe(saved.assessment.monthlyPension);
  expect(Number(candidate.excludedLumpSum)).toBeGreaterThan(0);
  expect(rows.every(r => r.capitalInjection === "0")).toBe(true);
  expect(() => pensionSourceCandidate(registry, { ...selection, sourceId: "duplicate", operation: "CREATE", expectedSourceRevision: 0 }, evidence, "owner", "2026-10", evidence.capture.assessedOn))
    .toThrowError(expect.objectContaining({ code: "PENSION_SOURCE_OVERLAP" }));
  const ended = sealSourceRevision({ ...previous, revision: 2, previousHash: previous.sourceHash, operation: "END", commandId: "end-future",
    effectiveFromMonth: "2027-01", schedule: [] });
  const futureEndRegistry = sealSourceRegistry({ ...registry, revisions: [previous, ended] });
  expect(() => pensionSourceCandidate(futureEndRegistry, { ...selection, expectedRegistryHash: futureEndRegistry.registryHash,
    sourceId: "duplicate", operation: "CREATE", expectedSourceRevision: 0 }, evidence, "owner", "2026-10", evidence.capture.assessedOn))
    .toThrowError(expect.objectContaining({ code: "PENSION_SOURCE_OVERLAP" }));
  await f.publish(f.rule.id);
  await expect(f.estimates.captureForSource("owner", saved.id, saved.integrityHash)).rejects.toMatchObject({ code: "RULE_VERSION_SUPERSEDED" });
});
it("does not select an ineligible assessment into a pension source", async () => {
  const f = await fixture(179), p = await f.estimates.preview("owner", f.input);
  const saved = await f.estimates.save("owner", { preview: f.input, expectedInputHash: p.inputHash }, randomUUID());
  await expect(f.estimates.captureForSource("owner", saved.id, saved.integrityHash)).rejects.toMatchObject({ code: "PENSION_ESTIMATE_NOT_ELIGIBLE" });
});
it("pins the benefit engine and preserves V1 replay when V2 adds the retirement grant", async () => {
  const f = await fixture(421), p = await f.estimates.preview("owner", f.input);
  const old = await f.estimates.save("owner", { preview: f.input, expectedInputHash: p.inputHash }, randomUUID());
  expect(old.assessment.lumpSum).toBeNull(); expect(old.engineCode).toBe("vn-pension-benefit-v1");
  const document = structuredClone(f.data.rules); document.engineCode = BENEFIT_ENGINE_V2;
  document.coverage[0].strategyCode = ORDINARY_STRATEGY_V2; document.coverage[0].citationIds = ORDINARY_CITATIONS_V2;
  document.citations.push(...["LAW_ART68", "TT12_ART14"].map(id => ({ ...document.citations[0], id })));
  expect(validateLegalDocument(document).valid).toBe(true);
  const rule = await f.publish(f.rule.id, document), input = { ...f.input, legalRuleSetVersionId: rule.id };
  const preview = await f.estimates.preview("owner", input);
  expect(preview.assessment.assessmentStatus).toBe("ELIGIBLE"); expect(Number(preview.assessment.lumpSum)).toBeGreaterThan(0);
  const saved = await f.estimates.save("owner", { preview: input, expectedInputHash: preview.inputHash }, randomUUID());
  expect(saved.engineCode).toBe(BENEFIT_ENGINE_V2); expect(await f.estimates.get("owner", saved.id)).toEqual(saved);
  expect(await f.estimates.get("owner", old.id)).toEqual(old);
});
it("rejects changed previews, unpublished/out-of-period rules and tampered stored results", async () => {
  const f = await fixture(), p = await f.estimates.preview("owner", f.input);
  await expect(f.estimates.save("owner", { preview: { ...f.input, employmentEndDate: "2026-06-29" }, expectedInputHash: p.inputHash }, randomUUID())).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
  await expect(f.estimates.preview("owner", { ...f.input, intendedBenefitDate: "2027-01-01" })).rejects.toMatchObject({ code: "RULE_OUTSIDE_EFFECTIVE_PERIOD" });
  const draft = await f.rules.create("author", { ...f.rule.draft, code: "DRAFT_ONLY" }, randomUUID());
  await expect(f.estimates.preview("owner", { ...f.input, legalRuleSetVersionId: draft.id })).rejects.toMatchObject({ status: 404 });
  const saved = await f.estimates.save("owner", { preview: f.input, expectedInputHash: p.inputHash }, randomUUID());
  await f.db.pensionEstimate.update({ where: { id: saved.id }, data: { result: {} } });
  await expect(f.estimates.get("owner", saved.id)).rejects.toMatchObject({ code: "ESTIMATE_INTEGRITY_FAILED" });
});
it.each(["compulsory", "voluntary", "state-voluntary", "top-up", "prepaid"])("matches published OpenAPI %s requests and responses for rule discovery, preview, save and read", async (kind) => {
  const f = await fixture(180, kind === "prepaid" ? validatedVoluntaryPrepaidFixture() : kind === "top-up" ? validatedVoluntaryTopUpFixture() : kind === "state-voluntary" ? validatedVoluntaryStateFixture() : kind === "voluntary" ? validatedVoluntaryFixture() : validatedBenefitFixture()), spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const check = (path: string, method: string, status: string, data: unknown) => {
    const validate = ajv.compile(spec.paths["/api/v1/me/pension" + path][method].responses[status].content["application/json"].schema);
    expect(validate({ data, meta: { requestId: randomUUID() } }), JSON.stringify(validate.errors)).toBe(true);
  };
  const request = ajv.compile(spec.paths["/api/v1/me/pension/estimates/preview"].post.requestBody.content["application/json"].schema);
  expect(request(f.input), JSON.stringify(request.errors)).toBe(true);
  check("/legal-rules", "get", "200", await f.estimates.publishedRules("2026-07-01"));
  const p = await f.estimates.preview("owner", f.input); check("/estimates/preview", "post", "200", p);
  const saved = await f.estimates.save("owner", { preview: f.input, expectedInputHash: p.inputHash }, randomUUID());
  check("/estimates", "post", "201", saved); check("/estimates/{id}", "get", "200", await f.estimates.get("owner", saved.id));
  check("/estimates", "get", "200", await f.estimates.list("owner"));
});
