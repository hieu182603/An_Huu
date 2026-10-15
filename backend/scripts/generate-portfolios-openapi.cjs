require("ts-node/register");
const fs = require("node:fs");
const { parseDocument, stringify } = require("yaml");
const { schema } = require("./generate-assumptions-openapi.cjs");
const input = require("../src/modules/portfolios/schema");
const { publishAssumptionsSchema } = require("../src/modules/assumptions/schema");
const ref = name => ({ $ref: "#/" + name });
const str = (extra = {}) => ({ type: "string", ...extra });
const en = (...values) => str({ enum: values });
const obj = properties => ({ type: "object", additionalProperties: false, properties, ...(Object.keys(properties).length ? { required: Object.keys(properties) } : {}) });
const arr = items => ({ type: "array", items });
const nullableRef = name => ({ anyOf: [ref(name), { type: "object", nullable: true, enum: [null] }] });
const integer = { type: "integer" }, uuid = str({ format: "uuid" }), timestamp = str({ format: "date-time" });
const decimal = str({ pattern: "^-?(0|[1-9]\\d*)(\\.\\d+)?$" }), boolean = { type: "boolean" };
const s = {};
for (const [name, value] of Object.entries({ Document: input.portfolioDocumentSchema, Write: input.writePortfolioSchema, Approve: input.approvePortfolioSchema, Publish: publishAssumptionsSchema, Input: input.portfolioPreviewSchema })) s[name] = schema(value);
s.Document.description = "schemaVersion 1 uses month-indexed schedules with coverageMonths; schemaVersion 2 uses glide paths anchored on the plan retirement month (linear by whole years remaining, zero-year point held after retirement) and requires Input.retirementMonth. Draft policy requiring a published/effective T03 assumption version. Approval validates six dimensions, complete score bands, unique IDs, 100% nonnegative weights, continuous indexed schedules, covered asset horizons and all three approved annual scenarios. No policy defaults. Thresholds, allocations and scenario changes require ADMIN review.";
s.Approval = obj({ actor: uuid, approvedAt: timestamp, reviewNote: str(), documentHash: str(), assumptionHash: str() });
s.Version = obj({ id: uuid, version: integer, revision: integer, status: en("DRAFT", "APPROVED", "PUBLISHED"), data: ref("Document"), documentHash: str(), approval: nullableRef("Approval"),
  createdBy: uuid, publishedBy: { ...uuid, nullable: true }, createdAt: timestamp, effectiveAt: { ...timestamp, nullable: true } });
s.List = obj({ status: en("AVAILABLE", "UNCONFIGURED"), total: integer, page: integer, limit: integer,
  items: arr(obj({ id: uuid, version: integer, revision: integer, status: en("DRAFT", "APPROVED", "PUBLISHED"), title: str(), effectiveAt: { ...timestamp, nullable: true } })) });
s.Issue = obj({ path: str(), code: str() });
s.Validation = obj({ status: en("VALID", "INCOMPLETE"), issues: arr(ref("Issue")) });
s.Assessment = obj({ status: en("INCOMPLETE", "MATCHED"), issues: arr(ref("Issue")), totalScore: { ...integer, nullable: true },
  dimensionScores: obj(Object.fromEntries(input.dimensions.map(d => [d, { ...integer, nullable: true }]))), riskBandId: { ...str(), nullable: true },
  selectedTemplateId: { ...str(), nullable: true }, eligibleTemplateIds: arr(str()),
  answers: arr(obj({ questionId: str(), dimension: str(), choiceId: str(), label: str(), score: integer })),
  checks: arr(obj({ ruleId: str(), templateId: str(), matched: boolean, failed: arr(str()), explanation: str() })) });
s.Row = obj({ month: str(), rebalanced: boolean, turnoverFraction: decimal, rebalanceCostFraction: decimal, returnMonthlyFactor: decimal,
  inflationMonthlyFactor: decimal, inflationAnnualPercent: decimal, inflationDeltaPoints: decimal, unitValue: decimal,
  holdings: arr(obj({ assetClass: str(), startWeightPercent: decimal, annualNetNominalReturnPercent: decimal, returnDeltaPoints: decimal })) });
s.Scenario = obj({ kind: en("BASE", "ADVERSE", "FAVORABLE"), label: str(), evidence: str(), changes: s.Document.oneOf[0].properties.scenarios.items.properties.years,
  rows: arr(ref("Row")), endingUnitValue: decimal });
s.Preview = obj({ policyVersionId: uuid, policyVersion: integer, policyHash: str(), assumptionVersionId: uuid, assumptionHash: str(),
  answerBasis: en("USER_DECLARED_NOT_INDEPENDENTLY_VERIFIED"), assessment: ref("Assessment"), limitations: arr(str()), priceBasis: en("NOMINAL"), timing: en("REBALANCE_START_GROWTH_END"), status: en("READY", "INCOMPLETE"), issues: arr(ref("Issue")), scenarios: arr(ref("Scenario")) });
// Optional guidance (see preview-guidance.openapi.yaml), listed first as in the published spec.
s.Preview.properties = { guidance: { $ref: "./preview-guidance.openapi.yaml#/Guidance" }, ...s.Preview.properties };
s.Preview.description = "Read-only unit-portfolio scenarios, no personal contributions/withdrawals, plan application or trades. Initial allocation cost is not modeled. Rebalancing trades use declared half-L1 turnover cost; allocation drifts between scheduled events. Scenario deltas apply after T03 net nominal conversion. Missing answers do not become zero scores.";
s.Empty = obj({});
for (const name of ["Version", "List", "Validation", "Preview"]) s[name + "Envelope"] = obj({ data: ref(name), meta: obj({ requestId: uuid }) });
fs.writeFileSync("docs/portfolios.openapi.yaml", stringify(s));
const doc = parseDocument(fs.readFileSync("docs/openapi.yaml", "utf8"));
const json = name => ({ content: { "application/json": { schema: { $ref: "./portfolios.openapi.yaml#/" + name } } } });
const errors = Object.fromEntries(Object.entries({ 400: "Invalid request", 401: "Authentication required", 403: "Role not permitted", 404: "Version/dependency unavailable or unpublished", 409: "Revision or approval mismatch", 422: "Incomplete policy", 429: "Rate limited", 503: "Service unavailable" }).map(([status, description]) => [status, { description, content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } }]));
function route(path, method, operationId, output, body, admin, list = false, created = false) {
  const parameters = [];
  if (path.includes("{id}")) parameters.push({ in: "path", name: "id", required: true, schema: uuid });
  if (list) for (const [name, max, fallback] of [["page", 100000, 1], ["limit", 100, 20]]) parameters.push({ in: "query", name, schema: { type: "integer", minimum: 1, maximum: max, default: fallback } });
  doc.setIn(["paths", "/api/v1/" + path, method], { operationId, summary: operationId, security: [{ bearerAuth: [] }],
    description: (admin ? "ADMIN only. " : "USER only. ") + "Versioned portfolio policy. Preview and publication do not modify current plans. See PORTFOLIOS.md for questionnaire, matching, schedules, fees and scenario limits.",
    ...(parameters.length ? { parameters } : {}), ...(body ? { requestBody: { required: true, ...json(body) } } : {}),
    responses: { [created ? "201" : "200"]: { description: "Success", ...json(output + "Envelope") }, ...errors } });
}
route("admin/portfolio-policies", "get", "listPortfolioPoliciesAdmin", "List", null, true, true);
route("admin/portfolio-policies", "post", "createPortfolioPolicy", "Version", "Document", true, false, true);
route("admin/portfolio-policies/{id}", "get", "getPortfolioPolicyAdmin", "Version", null, true);
route("admin/portfolio-policies/{id}", "patch", "editPortfolioPolicy", "Version", "Write", true);
route("admin/portfolio-policies/{id}/validate", "post", "validatePortfolioPolicy", "Validation", "Empty", true);
route("admin/portfolio-policies/{id}/approve", "post", "approvePortfolioPolicy", "Version", "Approve", true);
route("admin/portfolio-policies/{id}/publish", "post", "publishPortfolioPolicy", "Version", "Publish", true);
route("me/portfolio-policies", "get", "listPublishedPortfolioPolicies", "List", null, false, true);
route("me/portfolio-policies/{id}", "get", "getPublishedPortfolioPolicy", "Version", null, false);
route("me/portfolio-policies/preview", "post", "previewPortfolioScenarios", "Preview", "Input", false);
for (const name of ["Version", "List", "Validation", "Preview"]) doc.setIn(["components", "schemas", "Portfolio" + name + "Envelope"], { $ref: "./portfolios.openapi.yaml#/" + name + "Envelope" });
const original = fs.readFileSync("docs/openapi.yaml", "utf8");
if (JSON.stringify(parseDocument(original).toJSON()) !== JSON.stringify(doc.toJSON())) fs.writeFileSync("docs/openapi.yaml", doc.toString({ lineWidth: 120 }));
