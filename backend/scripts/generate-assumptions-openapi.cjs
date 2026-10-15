// Run from backend. Generates structural DTO contracts; cross-field validation
// remains documented and enforced by the service's configuration gate.
require("ts-node/register");
const fs = require("node:fs");
const { parseDocument, stringify } = require("yaml");
const input = require("../src/modules/assumptions/schema");
function schema(z) {
  const d = z._def;
  switch (d.typeName) {
    case "ZodEffects": return schema(d.schema);
    case "ZodOptional": return schema(d.innerType);
    case "ZodNullable": return { anyOf: [schema(d.innerType), { type: "object", nullable: true, enum: [null] }] };
    case "ZodDefault": return { ...schema(d.innerType), default: d.defaultValue() };
    case "ZodLiteral": return { type: typeof d.value === "number" ? "integer" : typeof d.value, enum: [d.value] };
    case "ZodEnum": return { type: "string", enum: d.values };
    case "ZodBoolean": return { type: "boolean" };
    case "ZodString": {
      const s = { type: "string" };
      for (const c of d.checks) {
        if (c.kind === "min") s.minLength = c.value;
        if (c.kind === "max") s.maxLength = c.value;
        if (c.kind === "regex") s.pattern = c.regex.source;
        if (c.kind === "uuid") s.format = "uuid";
        if (c.kind === "url") s.format = "uri";
        if (c.kind === "datetime") s.format = "date-time";
      }
      return s;
    }
    case "ZodNumber": {
      const s = { type: d.checks.some(c => c.kind === "int") ? "integer" : "number" };
      for (const c of d.checks) { if (c.kind === "min") s.minimum = c.value; if (c.kind === "max") s.maximum = c.value; }
      return s;
    }
    case "ZodArray": return { type: "array", items: schema(d.type), ...(d.minLength ? { minItems: d.minLength.value } : {}), ...(d.maxLength ? { maxItems: d.maxLength.value } : {}) };
    case "ZodRecord": return { type: "object", additionalProperties: schema(d.valueType) };
    case "ZodObject": {
      const properties = {}, required = [];
      for (const [key, value] of Object.entries(d.shape())) { properties[key] = schema(value); if (!value.isOptional()) required.push(key); }
      return { type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) };
    }
    case "ZodUnion": return { anyOf: d.options.map(schema) };
    case "ZodDiscriminatedUnion": return { oneOf: d.options.map(schema) };
    case "ZodNull": return { type: "object", nullable: true, enum: [null] };
    default: throw new Error("Unsupported schema " + d.typeName);
  }
}
if (require.main !== module) {
  module.exports = { schema };
} else {
const ref = name => ({ $ref: "#/" + name });
const str = (extra = {}) => ({ type: "string", ...extra });
const en = (...values) => str({ enum: values });
const obj = properties => ({ type: "object", additionalProperties: false, properties, ...(Object.keys(properties).length ? { required: Object.keys(properties) } : {}) });
const array = items => ({ type: "array", items });
const nullableRef = name => ({ anyOf: [ref(name), { type: "object", nullable: true, enum: [null] }] });
const integer = { type: "integer" }, uuid = str({ format: "uuid" }), timestamp = str({ format: "date-time" });
const decimal = str({ pattern: "^-?(0|[1-9]\\d*)(\\.\\d+)?$" });
const s = {};
for (const [name, z] of Object.entries({ Document: input.assumptionDocumentSchema, Write: input.writeAssumptionsSchema,
  Revision: input.revisionSchema, Approve: input.approveAssumptionsSchema, Publish: input.publishAssumptionsSchema,
  ResolveInput: input.seriesRequestSchema, Source: input.assumptionSourceSchema })) s[name] = schema(z);
s.Document.description = "Drafts may be incomplete. Approval requires exactly one inflation entry and each declared asset/horizon return entry for every projection year, unique IDs, non-overlapping horizons, source coverage/kind and known fee/tax treatment. Rates must be greater than -100% and at most 100%. Historical CPI is reference only. effectiveFrom uses midnight UTC. No fallback or source extrapolation.";
s.Approval = obj({ actor: uuid, approvedAt: timestamp, reviewNote: str(), documentHash: str(), baselineId: { ...uuid, nullable: true } });
s.Version = obj({ id: uuid, version: integer, revision: integer, status: en("DRAFT", "APPROVED", "PUBLISHED"), data: ref("Document"), createdBy: uuid,
  createdAt: timestamp, publishedBy: { ...uuid, nullable: true }, effectiveAt: { ...timestamp, nullable: true }, approval: nullableRef("Approval"), documentHash: str() });
s.Issue = obj({ path: str(), code: str() });
s.Validation = obj({ status: en("VALID", "INCOMPLETE"), issues: array(ref("Issue")) });
s.Impact = obj({ ...s.Validation.properties, draftRevision: integer, impactToken: str(), baselineId: { ...uuid, nullable: true },
  scope: en("CONFIGURATION_DIFF_ONLY"), planProjectionStatus: en("AWAITING_T06"), currentPlansChanged: { type: "integer", enum: [0] }, changes: obj({ before: nullableRef("Document"), after: ref("Document") }) });
s.List = obj({ status: en("AVAILABLE", "UNCONFIGURED"), total: integer, items: array(obj({ id: uuid, version: integer, revision: integer, status: en("DRAFT", "APPROVED", "PUBLISHED"), title: str(), effectiveAt: { ...timestamp, nullable: true }, projectionStartYear: integer, projectionEndYear: integer })), page: integer, limit: integer });
s.Month = obj({ month: str({ pattern: "^(19|20|21)\\d{2}-(0[1-9]|1[0-2])$" }), inflationAnnualPercent: decimal, returnAnnualNetNominalPercent: decimal,
  inflationMonthlyFactor: decimal, returnMonthlyFactor: decimal, inflationKind: en("FORECAST", "LONG_TERM"), inflationSourceId: str(), returnSourceId: str(), assetClass: str(), horizonId: str() });
s.Resolution = obj({ versionId: uuid, version: integer, documentHash: str(), currency: en("VND"), priceBasis: en("NOMINAL"), costs: en("ALREADY_APPLIED"), sources: array(ref("Source")), status: en("READY", "INCOMPLETE"), issues: array(ref("Issue")), months: array(ref("Month")) });
for (const name of ["Version", "List", "Validation", "Impact", "Resolution"]) s[name + "Envelope"] = obj({ data: ref(name), meta: obj({ requestId: uuid }) });
fs.writeFileSync("docs/assumptions.openapi.yaml", stringify(s));
const doc = parseDocument(fs.readFileSync("docs/openapi.yaml", "utf8"));
const json = name => ({ content: { "application/json": { schema: { $ref: "./assumptions.openapi.yaml#/" + name } } } });
const errors = Object.fromEntries(Object.entries({ 400: "Invalid request", 401: "Authentication required", 403: "Role not permitted", 404: "Not found or unpublished", 409: "Revision, review or approval conflict", 422: "Incomplete configuration", 429: "Rate limited", 503: "Service/database unavailable" }).map(([status, description]) => [status, { description, content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } }]));
function route(path, method, name, output, body, admin, list = false, created = false) {
  const parameters = [];
  if (path.includes("{id}")) parameters.push({ in: "path", name: "id", required: true, schema: uuid });
  if (list) for (const [name, limit, fallback] of [["page", 100000, 1], ["limit", 100, 20]]) parameters.push({ in: "query", name, schema: { type: "integer", minimum: 1, maximum: limit, default: fallback } });
  doc.setIn(["paths", "/api/v1/" + path, method], { operationId: name, summary: name, security: [{ bearerAuth: [] }],
    description: (admin ? "ADMIN only. " : "USER only. ") + "Versioned annual assumption data. Publishing never recalculates or changes current plans. Impact is configuration difference only pending T06. Resolve returns nominal net monthly factors for the explicitly selected published/effective version; no client rate overrides. See ASSUMPTIONS.md.",
    ...(parameters.length ? { parameters } : {}), ...(body ? { requestBody: { required: true, ...json(body) } } : {}),
    responses: { [created ? "201" : "200"]: { description: "Success", ...json(output + "Envelope") }, ...errors } });
}
route("admin/assumptions", "get", "listAssumptionDrafts", "List", null, true, true);
route("admin/assumptions", "post", "createAssumptionDraft", "Version", "Document", true, false, true);
route("admin/assumptions/{id}", "get", "getAssumptionVersionAdmin", "Version", null, true);
route("admin/assumptions/{id}", "patch", "editAssumptionDraft", "Version", "Write", true);
s.Empty = obj({});
route("admin/assumptions/{id}/validate", "post", "validateAssumptionCoverage", "Validation", "Empty", true);
route("admin/assumptions/{id}/impact", "post", "reviewAssumptionImpact", "Impact", "Revision", true);
route("admin/assumptions/{id}/approve", "post", "approveAssumptions", "Version", "Approve", true);
route("admin/assumptions/{id}/publish", "post", "publishAssumptions", "Version", "Publish", true);
route("me/assumptions", "get", "listPublishedAssumptions", "List", null, false, true);
route("me/assumptions/{id}", "get", "getPublishedAssumptions", "Version", null, false);
route("me/assumptions/resolve", "post", "resolveAssumptionSeries", "Resolution", "ResolveInput", false);
for (const name of ["Version", "List", "Validation", "Impact", "Resolution"]) doc.setIn(["components", "schemas", "Assumption" + name + "Envelope"], { $ref: "./assumptions.openapi.yaml#/" + name + "Envelope" });
fs.writeFileSync("docs/assumptions.openapi.yaml", stringify(s));
fs.writeFileSync("docs/openapi.yaml", doc.toString({ lineWidth: 120 }));
}
