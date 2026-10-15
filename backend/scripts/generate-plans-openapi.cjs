require("ts-node/register");
const fs = require("node:fs");
const { stringify, parseDocument } = require("yaml");
const { schema } = require("./generate-assumptions-openapi.cjs");
const { createPlanVersionSchema, applyPlanVersionSchema, planCompareSchema, planSimulationSchema } = require("../src/modules/plans/schema");
const { saveReforecastSchema } = require("../src/modules/actuals/schema");
const { sourceReforecastSchema, saveSourceReforecastSchema } = require("../src/modules/plans/source-schema");
const uuid = { type: "string", format: "uuid" }, str = { type: "string" }, integer = { type: "integer" }, bool = { type: "boolean" };
const nullableUuid = { ...uuid, nullable: true }, date = { type: "string", format: "date-time" };
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const arr = items => ({ type: "array", items }), ref = name => ({ $ref: "#/" + name });
const nullable = name => ({ anyOf: [ref(name), { type: "object", nullable: true, enum: [null] }] });
const retirement = name => ({ $ref: "./retirement.openapi.yaml#/" + name });
const s = { ReforecastInput: schema(saveReforecastSchema), CreateInput: schema(createPlanVersionSchema), ApplyInput: schema(applyPlanVersionSchema), CompareInput: schema(planCompareSchema), SimulationInput: schema(planSimulationSchema) };
s.Version = obj({ id: uuid, planId: uuid, version: integer, createdAt: date, profileRevision: integer, snapshotHash: str, preview: retirement("Preview") });
s.Version.properties.preview={oneOf:[retirement('Preview'),{$ref:'./source-snapshot.openapi.yaml#/Preview'}]};
s.SourcePreviewInput=schema(sourceReforecastSchema);s.SourceSaveInput=schema(saveSourceReforecastSchema);
s.SourcePreview=obj({status:{type:'string',enum:['READY','BLOCKED','HORIZON_COMPLETE']},issues:arr(obj({month:str,code:str})),inputHash:{...str,nullable:true},
  loanRevisionOptions:arr(obj({sourceId:str,sourceRevision:integer,sourceHash:str,contractHash:str,legacyOpeningRequired:bool})),
  plannedRefinanceOptions:obj({eligibleLoans:arr(obj({sourceId:str,sourceRevision:integer,sourceHash:str,contractHash:str})),
    activePairs:arr(obj({pairId:uuid,pairHash:str,settledOn:str,contractHash:str,reviseAllowed:bool,
      oldSource:obj({sourceId:str,revision:integer,sourceHash:str}),newSource:obj({sourceId:str,revision:integer,sourceHash:str})}))}),
  assetRevisionOptions:arr(obj({sourceId:str,sourceRevision:integer,sourceHash:str})),
  candidate:{anyOf:[{$ref:'./source-snapshot.openapi.yaml#/Preview'},{type:'object',nullable:true,enum:[null]}]},saved:{...bool,enum:[false]},applied:{...bool,enum:[false]}});
s.Created = obj({ planId: uuid, revision: integer, currentVersionId: nullableUuid, baselineVersionId: nullableUuid, saved: ref("Version") });
s.Applied = obj({ planId: uuid, revision: integer, currentVersionId: uuid, baselineVersionId: uuid, alreadyCurrent: bool });
const plan = { id: uuid, userId: uuid, currentVersionId: nullableUuid, baselineVersionId: nullableUuid, revision: integer, stale: bool, createdAt: date };
s.Plan = obj(plan);
s.Update = obj({ id: uuid, version: integer });
s.Detail = obj({ ...plan, current: nullable("Version"), profileChanged: bool,
  actualSourceChanged: bool, updates: obj({ assumptions: nullable("Update"), policy: nullable("Update") }), updatePolicy: { type: "string", enum: ["USER_EXPLICIT_CREATE_AND_APPLY"] } });
s.List = obj({ page: integer, limit: integer, total: integer, items: arr(ref("Plan")) });
s.History = obj({ page: integer, limit: integer, total: integer, items: arr(obj({ id: uuid, version: integer, createdAt: date,
  profileRevision: integer, snapshotHash: str, references: { $ref: "./retirement.openapi.yaml#/Preview/properties/references" }, summary: retirement("Summary") })) });
s.Replay = obj({ ...s.Version.properties, replay: obj({ matched: { type: "boolean", enum: [true] }, modelVersion: str, summary: retirement("Summary"), rows: arr(retirement("Row")) }) });
const decimal = { type: "string", pattern: "^-?(0|[1-9]\\d*)(\\.\\d+)?$" };
s.Goal = obj({ retirementMonth: str, endMonth: str, monthlyExpenseToday: decimal, monthlyContribution: decimal, monthlyReserve: decimal, terminalBalance: decimal });
s.Report = obj({ planId: uuid, planRevision: integer, currentVersionId: nullableUuid, baselineVersionId: nullableUuid,
  status: { type: "string", enum: ["AVAILABLE", "NO_APPLIED_VERSION"] }, valueKind: { type: "string", enum: ["FORECAST", "REFORECAST"] },
  version: nullable("Version"), actualSourceChanged: bool, profileChanged: bool, hypothetical: bool, goal: nullable("Goal") });
s.Delta = obj(Object.fromEntries(["projectedFundAtValuation", "requiredFundAtValuation", "fundingGapAtValuation", "coveragePercentagePoints",
  "requiredConstantMonthlyContribution", "additionalMonthlyContribution", "unfundedWithdrawals", "terminalBalance"].map(k => [k, { ...decimal, nullable: true }])));
s.ComparisonResult = obj({ status: { type: "string", enum: ["COMPARABLE", "NOT_COMPARABLE"] }, reasons: arr(str), direction: { type: "string", enum: ["CANDIDATE_MINUS_BASELINE"] },
  basis: { type: "string", enum: ["VALUATION_DATE_EACH_VERSION_DISCOUNT_FACTORS"] }, delta: nullable("Delta"),
  differences: obj({ profile: bool, policy: bool, assumptions: bool, retirementMonth: bool, selectionFields: arr(str) }), limitations: arr(str) });
s.RetirementComparison = obj({ status: { type: "string", enum: ["COMPARABLE", "NOT_COMPARABLE"] }, reasons: arr(str),
  basis: { type: "string", enum: ["SAME_RETIREMENT_MONTH_NOMINAL"] }, baselineMonth: { ...str, nullable: true }, candidateMonth: { ...str, nullable: true },
  delta: { anyOf: [obj(Object.fromEntries(["projectedFund", "requiredFund", "fundingGap", "coveragePercentagePoints"].map(k => [k, { ...str, nullable: true }]))), { type: "object", nullable: true, enum: [null] }] } });
s.ComparisonResult.properties.atRetirement = ref("RetirementComparison");
s.Comparison = obj({ baseline: ref("Version"), candidate: ref("Version"), comparison: ref("ComparisonResult") });
s.Simulation = obj({ baseline: ref("Version"), candidate: retirement("Preview"), comparison: ref("ComparisonResult"), saved: { type: "boolean", enum: [false] }, applied: { type: "boolean", enum: [false] } });
const responsesToExpose = ["Created", "Applied", "Detail", "List", "History", "Version", "Replay", "Report", "Comparison", "Simulation", "SourcePreview"];
const readWarnings = arr(schema(require("../src/modules/plans/read-warnings").planReadWarningSchema));
for (const name of ["Version", "Replay", "Detail", "Report"]) s[name].properties.readWarnings = readWarnings;
for (const name of responsesToExpose) s[name + "Envelope"] = obj({ data: ref(name), meta: obj({ requestId: uuid }) });
// Preserve anchors/formatting for unchanged contracts, including manually
// documented fields now represented in this generator.
const artifactPath = "docs/plans.openapi.yaml";
if (!fs.existsSync(artifactPath)) fs.writeFileSync(artifactPath, stringify(s));
else {
  const artifact = parseDocument(fs.readFileSync(artifactPath, "utf8"));
  const equal = require("node:util").isDeepStrictEqual;
  function sync(before, after, path = []) {
    if (equal(before, after)) return;
    if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === "object" && typeof after === "object") {
      for (const key of Object.keys(before)) if (!(key in after)) artifact.deleteIn([...path, key]);
      for (const key of Object.keys(after)) sync(before[key], after[key], [...path, key]);
    } else artifact.setIn(path, JSON.parse(JSON.stringify(after)));
  }
  sync(artifact.toJSON(), s);
  fs.writeFileSync(artifactPath, String(artifact));
}
const doc = parseDocument(fs.readFileSync("docs/openapi.yaml", "utf8"));
const json = name => ({ content: { "application/json": { schema: { $ref: "./plans.openapi.yaml#/" + name } } } });
const root = "/api/v1/me/retirement/plans";
for (const [suffix, method, operationId, output, input] of [
  ["", "get", "listRetirementPlans", "List"], ["", "post", "createRetirementPlanVersion", "Created", "CreateInput"],
  ["/{planId}", "get", "getRetirementPlan", "Detail"], ["/{planId}/versions", "get", "listRetirementPlanVersions", "History"],
  ["/{planId}/versions", "post", "saveRetirementPlanVersion", "Created", "CreateInput"],
  ["/{planId}/reforecasts", "post", "saveActualReforecast", "Created", "ReforecastInput"],
  ["/{planId}/source-reforecasts/preview", "post", "previewSourceReforecast", "SourcePreview", "SourcePreviewInput"],
  ["/{planId}/source-reforecasts", "post", "saveSourceReforecast", "Created", "SourceSaveInput"],
  ["/{planId}/apply", "post", "applyRetirementPlanVersion", "Applied", "ApplyInput"],
  ["/{planId}/versions/{versionId}", "get", "getRetirementPlanVersion", "Version"],
  ["/{planId}/versions/{versionId}/replay", "post", "replayRetirementPlanVersion", "Replay"],
  ["/{planId}/report", "get", "reportRetirementPlan", "Report"],
  ["/{planId}/compare", "post", "compareRetirementPlanVersions", "Comparison", "CompareInput"],
  ["/{planId}/versions/{versionId}/simulate", "post", "simulateRetirementPlanVersion", "Simulation", "SimulationInput"],
]) {
  const parameters = [];
  for (const name of ["planId", "versionId"]) if (suffix.includes("{" + name + "}")) parameters.push({ name, in: "path", required: true, schema: uuid });
  if (["CreateInput", "ApplyInput", "ReforecastInput", "SourceSaveInput"].includes(input)) parameters.push({ name: "Idempotency-Key", in: "header", required: true, schema: uuid });
  if (output === "Report") parameters.push({ name: "versionId", in: "query", required: false, schema: uuid, description: "Pin a saved version; omitted resolves current in one read transaction. Never selects latest saved implicitly." });
  if (["List", "History"].includes(output)) for (const name of ["page", "limit"]) parameters.push({ name, in: "query", schema: { type: "integer", minimum: 1, ...(name === "limit" ? { maximum: 50, default: 20 } : { default: 1 }) } });
  const responses = { [output === "Created" ? 201 : 200]: { description: "Owned persisted plan result", ...json(output + "Envelope") },
    ...Object.fromEntries([400, 401, 403, 404, 409, 422, 429].map(code => [code, { description: "Request rejected", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } }])) };
  doc.setIn(["paths", root + suffix, method], { operationId, security: [{ bearerAuth: [] }], parameters,
    description: "USER only. See PLANS.md. Saving never applies. Apply requires current plan/profile revisions and explicit confirmation. Immutable snapshot reads/replay do not use newer configuration.",
    ...(input ? { requestBody: { required: true, ...json(input) } } : output === "Replay" ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false } } } } } : {}), responses });
}
doc.setIn(["paths", root + "/{planId}/versions/{versionId}/export.csv", "get"], {
  operationId: "exportRetirementPlanVersionCsv", security: [{ bearerAuth: [] }],
  description: "USER only. UTF-8 BOM CSV from the pinned snapshot. Default technical format retains exact decimals and source identifiers. Optional readable-vi format has Vietnamese monthly headings and rounds money to whole VND for display only. Not a JSON envelope. See PLAN_PRESENTATION.md.",
  parameters: [...["planId", "versionId"].map(name => ({ name, in: "path", required: true, schema: uuid })),
    { name: "format", in: "query", schema: { type: "string", enum: ["technical", "readable-vi"], default: "technical" } }],
  responses: { 200: { description: "Monthly forecast CSV", headers: { "Content-Disposition": { schema: str }, "Cache-Control": { schema: str } }, content: { "text/csv": { schema: str } } },
    ...Object.fromEntries([400, 401, 403, 404, 409, 429].map(code => [code, { description: "Request rejected", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } }])) }
});
for (const name of responsesToExpose)
  doc.setIn(["components", "schemas", "Plan" + name + "Envelope"], { $ref: "./plans.openapi.yaml#/" + name + "Envelope" });
const original = fs.readFileSync("docs/openapi.yaml", "utf8");
if (JSON.stringify(parseDocument(original).toJSON()) !== JSON.stringify(doc.toJSON())) fs.writeFileSync("docs/openapi.yaml", String(doc));
