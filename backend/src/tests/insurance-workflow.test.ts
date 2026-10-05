import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { digest } from "../common/digest";
import { memoryDb } from "./memory-db";
import { InsuranceHistoryService } from "../modules/pensions/history-service";
import { LegalRulesService } from "../modules/pensions/legal-service";
import { previewInsuranceHistory } from "../modules/pensions/history";
import { historyPreviewSchema, legalRuleDraftSchema, type InsuranceHistory } from "../modules/pensions/insurance-schema";
import { validateLegalDocument, type LegalStrategy } from "../modules/pensions/legal-validation";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";

const evidence = { reference: "Synthetic fixture only", contentHash: digest("fixture"), confirmedOn: "2026-10-01" };
function history(): InsuranceHistory {
  return { schemaVersion: 1, birth: { precision: "MONTH", declaredValue: "1965-01" }, legalSex: "MALE", coverageFrom: "2026-01", coverageThrough: "2026-03",
    confirmedThroughMonth: "2026-03", months: ["2026-01", "2026-02", "2026-03"].map(month => ({ month, scheme: "COMPULSORY", salaryRegime: "EMPLOYER",
      status: "PAID", contributionBase: "10000000", evidence: [evidence] })), specialPeriods: [] };
}
const draft = () => legalRuleDraftSchema.parse({ code: "TEST_ONLY", effectiveFrom: "2026-01-01", effectiveTo: null, document: {
  schemaVersion: 1, engineCode: "test-only", coverage: [{ branch: "TEST_ONLY", strategyCode: "fixture", citationIds: ["law"], requiredTableKeys: [] }],
  citations: [{ id: "law", instrument: "Fixture law", locator: "Fixture only", url: "https://example.org/fixture", contentHash: digest("fixture"), effectiveFrom: "2026-01-01", effectiveTo: null }], tables: [],
} });
// Dependency injection tests workflow mechanics, not statutory correctness. This
// strategy is never registered by the production constructor/router.
const testStrategy: LegalStrategy = { engineCode: "test-only", branch: "TEST_ONLY", strategyCode: "fixture", fixtureSuiteHash: digest("test-only"),
  validate: () => ({ issues: [], cases: [{ id: "workflow-only", passed: true, expectedHash: digest("test"), actualHash: digest("test") }] }) };
async function fixture() {
  const f = memoryDb();
  for (const [id, role] of [["owner", "USER"], ["author", "ADMIN"], ["reviewer", "ADMIN"], ["editor", "ADMIN"]] as const)
    await f.db.user.create({ data: { id, role, status: "ACTIVE", email: `${id}@example.invalid`, passwordHash: "fixture", fullName: "Fixture" } });
  return { ...f, histories: new InsuranceHistoryService(f.db), rules: new LegalRulesService(f.db, [testStrategy]) };
}
it("normalizes holes as unknown, never credits duplicate or unconfirmed future months", () => {
  const document = history(); document.months.splice(1, 1);
  const p = previewInsuranceHistory({ expectedHistoryRevision: 0, document });
  expect(p.status).toBe("INCOMPLETE"); expect(p.normalized.months[1]).toMatchObject({ month: "2026-02", status: "UNKNOWN", contributionBase: null });
  const duplicate = history(); duplicate.months.push(duplicate.months[0]);
  expect(previewInsuranceHistory({ expectedHistoryRevision: 0, document: duplicate }).status).toBe("INVALID");
  duplicate.months.pop(); duplicate.confirmedThroughMonth = "2026-02";
  expect(previewInsuranceHistory({ expectedHistoryRevision: 0, document: duplicate }).issues).toContainEqual({ path: "months.2.status", code: "FUTURE_HISTORY_MUST_BE_SEPARATE_SCENARIO" });
});
it("documents the complete rule/history response shapes, including nullable initial history", async () => {
  const f = await fixture(), spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const check = (path: string, method: string, status: string, data: unknown) => {
    const validate = ajv.compile(spec.paths[path][method].responses[status].content["application/json"].schema);
    expect(validate({ data, meta: { requestId: randomUUID() } }), JSON.stringify(validate.errors)).toBe(true);
  };
  check("/api/v1/me/pension/history", "get", "200", await f.histories.get("owner"));
  const preview = { expectedHistoryRevision: 0, document: history() }, p = await f.histories.preview("owner", preview);
  check("/api/v1/me/pension/history/import-preview", "post", "200", p);
  check("/api/v1/me/pension/history", "post", "201", await f.histories.save("owner", { preview, expectedInputHash: p.inputHash, confirm: true }, randomUUID()));
  const r = await reviewed(f); check("/api/v1/admin/legal-rules/{id}/transitions", "post", "200", r.row);
  check("/api/v1/admin/legal-rules/{id}/transitions", "post", "200", await f.rules.transition("author", r.row.id, r.publish, randomUUID()));
});
it("validates birth precision, scheme/credit evidence and bounds without guessing", () => {
  const doc = history(); doc.birth = { precision: "DAY", declaredValue: "1965-02-30" };
  expect(historyPreviewSchema.safeParse({ expectedHistoryRevision: 0, document: doc }).success).toBe(false);
  doc.birth = { precision: "YEAR", declaredValue: "1965" }; doc.months[0].status = "CREDITED";
  expect(historyPreviewSchema.safeParse({ expectedHistoryRevision: 0, document: doc }).success).toBe(false);
  doc.months[0].creditKind = "MATERNITY";
  expect(previewInsuranceHistory({ expectedHistoryRevision: 0, document: doc }).status).toBe("READY");
  doc.months[0].salaryRegime = "VOLUNTARY_INCOME";
  expect(historyPreviewSchema.safeParse({ expectedHistoryRevision: 0, document: doc }).success).toBe(false);
});
it("appends immutable owned history, is idempotent, rejects stale preview and preserves the parent", async () => {
  const f = await fixture(), preview = { expectedHistoryRevision: 0, document: history() };
  const p = await f.histories.preview("owner", preview), key = randomUUID(), command = { preview, expectedInputHash: p.inputHash, confirm: true as const };
  const saved = await f.histories.save("owner", command, key);
  expect(await f.histories.save("owner", command, key)).toEqual(saved);
  expect(f.rows("socialInsuranceHistoryVersion")).toHaveLength(1);
  await expect(f.histories.get("another", saved.id)).rejects.toMatchObject({ status: 404 });
  await expect(f.histories.save("owner", command, randomUUID())).rejects.toMatchObject({ code: "HISTORY_REVISION_CONFLICT" });
  const second = { expectedHistoryRevision: 1, document: history() }; second.document.months[0].contributionBase = "11000000";
  const p2 = await f.histories.preview("owner", second);
  await expect(f.histories.save("owner", { preview: second, expectedInputHash: p.inputHash, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
  const next = await f.histories.save("owner", { preview: second, expectedInputHash: p2.inputHash, confirm: true }, randomUUID());
  expect(next).toMatchObject({ revision: 2, parentVersionId: saved.id, parentHash: saved.documentHash });
  expect(await f.histories.get("owner", saved.id)).toEqual(saved);
  expect(f.rows("user").find(u => u.id === "owner")!.securityVersion).toBe(0);
});
it("permits an explicitly incomplete history but rejects structurally invalid import", async () => {
  const f = await fixture(), preview = { expectedHistoryRevision: 0, document: history() }; preview.document.months.splice(1, 1);
  const p = await f.histories.preview("owner", preview);
  expect((await f.histories.save("owner", { preview, expectedInputHash: p.inputHash, confirm: true }, randomUUID())).document.months[1].status).toBe("UNKNOWN");
  preview.expectedHistoryRevision = 1; preview.document.months.push(preview.document.months[0]);
  const invalid = await f.histories.preview("owner", preview);
  await expect(f.histories.save("owner", { preview, expectedInputHash: invalid.inputHash, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "HISTORY_INVALID" });
});
it("production validation never publishes an unimplemented strategy or missing tables", async () => {
  const f = await fixture(), rules = new LegalRulesService(f.db), d = draft();
  expect(validateLegalDocument(d.document).valid).toBe(false);
  const row = await rules.create("author", d, randomUUID());
  const validation = await rules.transition("author", row.id, { action: "VALIDATE", expectedRevision: 1, expectedDocumentHash: row.documentHash, confirm: true }, randomUUID());
  expect(validation.status).toBe("DRAFT");
  await expect(rules.transition("reviewer", row.id, { action: "REVIEW", expectedRevision: 2, expectedDocumentHash: row.documentHash, confirm: true,
    validationHash: (validation.validation as any).validationHash, reviewNote: "Checked" }, randomUUID())).rejects.toMatchObject({ code: "RULE_VALIDATION_REQUIRED" });
  d.document.coverage[0].requiredTableKeys = ["WAGE_FACTOR:2025"];
  expect(validateLegalDocument(d.document, [testStrategy]).issues).toContainEqual({ path: "coverage.0", code: "REQUIRED_TABLE_MISSING" });
});
async function reviewed(f: Awaited<ReturnType<typeof fixture>>, d = draft()) {
  const row = await f.rules.create("author", d, randomUUID());
  const validated = await f.rules.transition("author", row.id, { action: "VALIDATE", expectedRevision: 1, expectedDocumentHash: row.documentHash, confirm: true }, randomUUID());
  const validationHash = (validated.validation as any).validationHash as string;
  const review = { action: "REVIEW" as const, expectedRevision: 2, expectedDocumentHash: row.documentHash, validationHash, reviewNote: "Independent fixture review", confirm: true as const };
  await expect(f.rules.transition("author", row.id, review, randomUUID())).rejects.toMatchObject({ code: "INDEPENDENT_RULE_REVIEW_REQUIRED" });
  const result = await f.rules.transition("reviewer", row.id, review, randomUUID());
  return { row: result, publish: { action: "PUBLISH" as const, expectedRevision: 3, expectedDocumentHash: row.documentHash,
    validationHash, reviewHash: (result.review as any).reviewHash as string, confirm: true as const } };
}
it("requires independent review, immutable publish and explicit valid supersession", async () => {
  const f = await fixture(), r = await reviewed(f), key = randomUUID();
  const published = await f.rules.transition("author", r.row.id, r.publish, key);
  expect(published.status).toBe("PUBLISHED"); expect(await f.rules.transition("author", r.row.id, r.publish, key)).toEqual(published);
  await expect(f.rules.patch("author", r.row.id, { expectedRevision: 4, draft: draft() }, randomUUID())).rejects.toMatchObject({ code: "RULE_REVISION_CONFLICT" });
  const overlap = await reviewed(f);
  await expect(f.rules.transition("author", overlap.row.id, overlap.publish, randomUUID())).rejects.toMatchObject({ code: "RULE_EFFECTIVE_OVERLAP" });
  const replacement = await reviewed(f, { ...draft(), supersedesId: published.id });
  expect((await f.rules.transition("author", replacement.row.id, replacement.publish, randomUUID())).status).toBe("PUBLISHED");
  await expect(f.rules.get("owner", published.id)).rejects.toMatchObject({ status: 403 });
});
it("editing after review invalidates approvals and excludes every prior author from re-review", async () => {
  const f = await fixture(), r = await reviewed(f), modified = draft(); modified.effectiveFrom = "2026-02-01";
  const changed = await f.rules.patch("reviewer", r.row.id, { expectedRevision: 3, draft: modified }, randomUUID());
  expect(changed.status).toBe("DRAFT");
  await expect(f.rules.transition("author", r.row.id, r.publish, randomUUID())).rejects.toMatchObject({ code: "RULE_REVISION_CONFLICT" });
  const validated = await f.rules.transition("author", r.row.id, { action: "VALIDATE", expectedRevision: 4, expectedDocumentHash: changed.documentHash, confirm: true }, randomUUID());
  const review = { action: "REVIEW" as const, expectedRevision: 5, expectedDocumentHash: changed.documentHash, validationHash: (validated.validation as any).validationHash,
    reviewNote: "Re-review", confirm: true as const };
  await expect(f.rules.transition("reviewer", r.row.id, review, randomUUID())).rejects.toMatchObject({ code: "INDEPENDENT_RULE_REVIEW_REQUIRED" });
  expect((await f.rules.transition("editor", r.row.id, review, randomUUID())).status).toBe("REVIEWED");
});
