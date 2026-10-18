// Run from backend. Structural contracts only: no env loading, DB or provider.
require("ts-node/register");
const fs = require("node:fs");
const { parseDocument, stringify } = require("yaml");
const { schema } = require("./generate-assumptions-openapi.cjs");
const { metricExplanationSchema } = require("../src/modules/explanations/schema");
const ref = name => ({ $ref: "#/" + name });
const str = { type: "string" }, decimal = { type: "string", pattern: "^-?(0|[1-9]\\d*)(\\.\\d+)?$" };
const arr = items => ({ type: "array", items });
const obj = properties => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const bilingual = obj({ vi: str, en: str });
const s = {
  Input: schema(metricExplanationSchema),
  MetricExplanation: obj({ metricKey: str, detail: { type: "string", enum: ["SUMMARY", "MONTHLY"] }, label: bilingual, value: decimal, unit: { type: "string", enum: ["VND", "PERCENT"] },
    formula: obj({ vi: str, en: str, symbolic: str }),
    steps: arr(obj({ label: bilingual, value: str, unit: str, source: str })),
    assumptions: obj({ version: { type: "integer" }, sources: arr({ $ref: "./assumptions.openapi.yaml#/Source" }) }),
    notes: arr(str), limitations: arr(str) }),
  Glossary: obj({ version: str, terms: arr(obj({ key: str, label: bilingual, definition: bilingual })) }),
};
s.Input.description = "USER only. Strict request at every nested boundary. PREVIEW accepts only the existing RetirementPreview input, never computed results, rates, profile data or assumptions. Server captures the owned profile revision and pinned policy/assumptions once and reruns the preview. PLAN_VERSION uses PlansService ownership and snapshot integrity checks; it never substitutes current profile/configuration. Unknown, null, missing or unsupported metrics return 422 METRIC_NOT_AVAILABLE.";
s.MetricExplanation.description = "Authoritative raw decimal strings from the selected calculation; labels/formulas in Vietnamese and English. Static keys: summary.atRetirement.requiredFund, summary.atRetirement.projectedFund, summary.atRetirement.fundingGap, summary.atRetirement.coveragePercent, summary.requiredConstantMonthlyContribution, summary.additionalMonthlyContribution, summary.futureMonthlyExpense, summary.initialRetirementCapital, capitalSeparation.requiredEmergencyReserve, capitalSeparation.nearTermGoalsPresentValue, capitalSeparation.growthCapital, lossConstraint.lossAmount, essentialCoverage.essentialShortfall. Monthly fee key: rows.YYYY-MM.advisoryFeeAmount selects that exact month. No total advisory fee field is invented. Missing saved preview supplements are unavailable. Step sources are server object paths. Compare raw value with the displayed result before opening a popup; do not recompute on the client. detail SUMMARY (default) folds month-by-month inputs into a period (unit PERIOD), month count (MONTHS), totals (Σ ...) and cumulative factors (Π ...); request MONTHLY only for an explicit per-month breakdown.";
s.Glossary.description = "Curated, versioned backend glossary; no AI consent or provider is needed. Unknown phrases may use the existing /me/ai/explain endpoint with its consent and rate limits. Numeric metric failures must never fall back to AI numbers.";
for (const name of ["MetricExplanation", "Glossary"]) s[name + "Envelope"] = obj({ data: ref(name), meta: obj({ requestId: { type: "string", format: "uuid" } }) });
fs.writeFileSync("docs/explanations.openapi.yaml", stringify(s));
const json = name => ({ content: { "application/json": { schema: { $ref: "./explanations.openapi.yaml#/" + name } } } });
const errors = Object.fromEntries([400, 401, 403, 404, 409, 422, 429, 503].map(code => [code, {
  description: code === 422 ? "METRIC_NOT_AVAILABLE (missing/null/unsupported), or preview validation error" : "Validation, authentication, ownership, integrity, rate or service error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
}]));
const entries = {};
for (const [suffix, method, output] of [["metric", "post", "MetricExplanation"], ["glossary", "get", "Glossary"]]) {
  entries["/api/v1/me/explanations/" + suffix] = { [method]: {
    operationId: suffix === "metric" ? "explainMetric" : "getExplanationGlossary", summary: output,
    security: [{ bearerAuth: [] }], description: "USER only; ADMIN rejected. Read-only; Cache-Control: no-store. " +
      (suffix === "metric" ? "30 requests per minute per authenticated user per process, including invalid requests. No LLM/provider call or consent needed." : "Versioned curated glossary; no special endpoint rate limit."),
    ...(suffix === "metric" ? { requestBody: { required: true, ...json("Input") } } : {}),
    responses: { 200: { description: "Success", ...json(output + "Envelope") }, ...errors },
  } };
}
// Patch only these path blocks; leave every unrelated byte of the root spec intact.
const file = "docs/openapi.yaml", original = fs.readFileSync(file, "utf8"), doc = parseDocument(original);
const paths = doc.get("paths", true), resolvedPaths = doc.toJSON().paths, patches = [], additions = {};
for (const [path, entry] of Object.entries(entries)) {
  const index = paths.items.findIndex(pair => pair.key.value === path);
  if (index < 0) { additions[path] = entry; continue; }
  if (JSON.stringify(resolvedPaths[path]) === JSON.stringify(entry)) continue;
  const start = original.lastIndexOf("\n", paths.items[index].key.range[0]) + 1;
  const next = paths.items[index + 1];
  patches.push({ start, end: next ? original.lastIndexOf("\n", next.key.range[0]) + 1 : paths.range[2],
    text: stringify({ paths: { [path]: entry } }).slice("paths:\n".length) });
}
if (Object.keys(additions).length) patches.push({ start: paths.range[2], end: paths.range[2], text: stringify({ paths: additions }).slice("paths:\n".length) });
let updated = original;
for (const patch of patches.sort((a, b) => b.start - a.start)) updated = updated.slice(0, patch.start) + patch.text + updated.slice(patch.end);
if (updated !== original) fs.writeFileSync(file, updated);
