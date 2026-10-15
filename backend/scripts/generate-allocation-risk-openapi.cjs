// Offline schema generation only. Never loads env, services or a DB client.
require("ts-node/register");
const fs = require("node:fs");
const { parseDocument, stringify } = require("yaml");
const { schema } = require("./generate-assumptions-openapi.cjs");
const market = require("../src/modules/allocation-risk/market-schema");
const { riskRequestSchema } = require("../src/modules/allocation-risk/schema");
const { riskPolicySchema } = require("../src/modules/allocation-risk/policy");
const { rebalanceInputSchema } = require("../src/modules/allocation-risk/rebalance");
const { publishAssumptionsSchema } = require("../src/modules/assumptions/schema");
const ref = name => ({ $ref: "#/" + name });
const str = { type: "string" }, number = { type: "number" }, integer = { type: "integer" }, boolean = { type: "boolean" };
const uuid = { type: "string", format: "uuid" }, nullable = { type: "string", nullable: true };
const en = (...values) => ({ type: "string", enum: values });
const arr = items => ({ type: "array", items });
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const optional = properties => obj(properties, []);
const s = {};
for (const [name, input] of Object.entries({ MarketDocument: market.marketDocumentSchema, MarketWrite: market.writeMarketSchema,
  MarketApprove: market.approveMarketSchema, MarketPublish: publishAssumptionsSchema, RiskInput: riskRequestSchema,
  RiskPolicy: riskPolicySchema, RebalanceInput: rebalanceInputSchema })) s[name] = schema(input);
s.MarketDocument.description = "ADMIN-owned real monthly total returns, VND nominal decimal fractions including dividends/distributions and CPI month-on-month. No missing, duplicate or discontinuous months; exact asset columns; no imputation. GROSS subtracts the explicitly approved monthlyDrag in decimal points once; NET is not deducted again. Each source must have licensed simulation/derived-output rights. Approval requires historical closed months and nonfuture retrieval dates. No synthetic production fallback.";
s.RiskInput.description = "Read-only POST. No client return/CPI arrays, random seed or benchmark overrides. Saved versions are owner-checked and integrity-checked. Omitted marketVersionId selects latest effective PUBLISHED dataset; response pins its ID/hash for repeat runs. Old plan snapshots and inputHash are unchanged.";
s.MarketVersion = obj({ id: uuid, version: integer, revision: integer, status: en("DRAFT", "APPROVED", "PUBLISHED"), data: ref("MarketDocument"), documentHash: str,
  approval: { anyOf: [obj({ actor: str, approvedAt: str, documentHash: str, reviewNote: str }), { type: "object", nullable: true, enum: [null] }] }, effectiveAt: nullable });
s.MarketList = obj({ page: integer, limit: integer, total: integer, items: arr(obj({ id: uuid, version: integer, revision: integer, status: str, title: str, period: s.MarketDocument.properties.period })) });
s.Validation = obj({ status: en("VALID", "INVALID"), issues: arr(obj({ path: str, message: str })) });
s.Empty = obj({});
s.Limits = obj({ maxPaths: integer, maxPathMonths: integer, maxRuntimeMs: integer });
s.Allocation = obj({ assetClass: str, weightPercent: str });
s.PathResult = obj({ essentialLossToday: str, funded: boolean, balances: arr(str), unfundedWithdrawals: str, fundedTerminalBalance: str });
const simulation = {
  modelCode: en("allocation-risk-v1"), seed: integer, paths: integer, blockMonths: integer, pEssential: number,
  wilson: obj({ confidence: number, lower: number, upper: number }), cvarAlpha: str, cvarEssentialShortfallToday: str,
  display: obj({ pEssentialPercent: integer, wilsonLowerPercent: integer, wilsonUpperPercent: integer, cvarVnd: str }),
  bands: arr(obj({ month: str, p10: str, p50: str, p90: str })),
  disclosure: obj({ period: s.MarketDocument.properties.period, sources: s.MarketDocument.properties.sources, currency: str, bandBasis: str,
    moneyRounding: str, probabilityRounding: str, historyMonths: integer, limitations: arr(str) }),
};
s.Candidate = obj({ status: en("READY"), ...simulation, id: str, changePoints: str, targets: arr(arr(ref("Allocation"))) });
const scenarioParameters = Object.values(s.RiskPolicy.properties.stresses.properties);
s.Scenario = obj({ kind: str, status: en("READY", "REVIEW_REQUIRED", "NOT_APPLICABLE"), issues: arr(str), parameters: { anyOf: scenarioParameters },
  result: ref("PathResult"), assumptions: arr(str) }, ["kind", "status"]);
s.Longevity = obj({ kind: en("LONGEVITY"), status: en("READY", "REVIEW_REQUIRED"), results: arr(obj({ extraYears: integer, status: en("READY", "REVIEW_REQUIRED"),
  issues: arr(str), endMonth: str, result: ref("PathResult") }, ["extraYears", "status"])) });
s.RiskResult = obj({ status: en("READY", "DATA_REQUIRED", "REVIEW_REQUIRED", "INSUFFICIENT", "LIMIT_EXCEEDED"), issues: arr(str), limits: ref("Limits"),
  marketVersionId: uuid, marketVersion: integer, marketHash: str, inputHash: str, profileHash: str, policyVersionId: uuid, policyVersion: integer, policyHash: str,
  assumptionVersionId: uuid, assumptionVersion: integer, assumptionHash: str, informationalOnly: boolean, persisted: boolean,
  ...simulation, basis: str, sources: { type: "array", items: { $ref: "./assumptions.openapi.yaml#/Source" } }, scenarios: arr(ref("Scenario")), longevity: ref("Longevity"), limitations: arr(str),
  selectedId: nullable, threshold: str, candidates: arr(ref("Candidate")), rejected: arr(obj({ id: str, issues: arr(str) })),
  adjustmentOptions: { anyOf: [{ $ref: "./retirement.openapi.yaml#/AdjustmentOptions" }, obj({ status: en("REVIEW_REQUIRED"), issues: arr(str) })] }, adjustmentKinds: arr(str), rule: str,
}, ["status"]);
s.RiskResult.description = "pEssential is the fraction of COMPLETE paths funding every essential expense, not terminal solvency. CVaR = min eta [eta + mean((loss-eta)+)/(1-alpha)], loss is the sum of essential deficits at opening-month CPI prices. Wilson confidence=95% measures Monte Carlo sampling error only. Bands are funded balances in today's VND, rounded to millions; display probabilities to whole percentage points. Candidate comparison uses raw values, common seed, probability threshold then minimum CVaR then minimum equity shift. No Sharpe criterion. Missing data => DATA_REQUIRED; missing approved parameters/classification => REVIEW_REQUIRED; timeout/operation caps => LIMIT_EXCEEDED without partial statistics. Deterministic scenarios have individual statuses; longevity is the eighth kind. No writes or trades.";
s.RebalanceResult = obj({ status: en("REVIEW_REQUIRED", "WITHIN_BAND", "PROPOSED"), issues: arr(str), policyVersionId: uuid, policyHash: str, month: str, persisted: boolean, informationalOnly: boolean,
  oldWeights: arr(ref("Allocation")), targetWeights: arr(ref("Allocation")), newWeights: arr(ref("Allocation")), reason: str, bandPoints: str, costPercent: str, cost: str, netValue: str,
  cashUsedBeforeTrades: str, unallocatedNewContribution: str, assumptions: arr(str),
  trades: arr(obj({ assetClass: str, oldValue: str, maturedAmount: str, cashAllocated: str, buy: str, sell: str, newValue: str })),
}, ["status", "issues"]);
s.RebalanceResult.description = "Decision data only; no persistence. Drift must be strictly greater than policy band. New contributions and maturities allocated before trades; maturedAmount is already included in holding value. Cost is half remaining gross buys+sells times approved turnover cost. Net targets solve the cost budget. WITHIN_BAND does not invest the new contribution. Existing actuals are not modified.";
for (const name of ["MarketVersion", "MarketList", "Validation", "RiskResult", "RebalanceResult"]) s[name + "Envelope"] = obj({ data: ref(name), meta: obj({ requestId: uuid }) });
fs.writeFileSync("docs/allocation-risk.openapi.yaml", stringify(s));
const original = fs.readFileSync("docs/openapi.yaml", "utf8"), doc = parseDocument(original);
const json = name => ({ content: { "application/json": { schema: { $ref: "./allocation-risk.openapi.yaml#/" + name } } } });
function route(path, method, operationId, output, body, admin, list = false) {
  const parameters = [];
  if (path.includes("{id}")) parameters.push({ in: "path", name: "id", required: true, schema: uuid });
  if (list) for (const [name, max, fallback] of [["page", 100000, 1], ["limit", 100, 20]]) parameters.push({ in: "query", name, schema: { type: "integer", minimum: 1, maximum: max, default: fallback } });
  const created = operationId === "createMarketDataset";
  doc.setIn(["paths", "/api/v1/" + path, method], { operationId, summary: operationId, security: [{ bearerAuth: [] }],
    description: admin ? "ADMIN only. Versioned market dataset workflow in assumption_set_versions. Immutable after approval; publication does not change plans." : "USER only. Read-only computation; no market overrides, save/apply or trade execution. Up to 500 paths, 200000 candidate-path-months, 10 seconds; six requests/minute/IP, one run/user and two runs/process concurrently.",
    ...(parameters.length ? { parameters } : {}), ...(body ? { requestBody: { required: true, ...json(body) } } : {}),
    responses: { [created ? 201 : 200]: { description: "Success", ...json(output + "Envelope") },
      ...Object.fromEntries([400, 401, 403, 404, 409, 422, 429, 503].map(code => [code, { description: "Validation, authorization, version or service error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } }])) } });
}
route("admin/market-data", "get", "listMarketDatasets", "MarketList", null, true, true);
route("admin/market-data", "post", "createMarketDataset", "MarketVersion", "MarketDocument", true);
route("admin/market-data/{id}", "get", "getMarketDataset", "MarketVersion", null, true);
route("admin/market-data/{id}", "patch", "editMarketDataset", "MarketVersion", "MarketWrite", true);
route("admin/market-data/{id}/validate", "post", "validateMarketDataset", "Validation", "Empty", true);
route("admin/market-data/{id}/approve", "post", "approveMarketDataset", "MarketVersion", "MarketApprove", true);
route("admin/market-data/{id}/publish", "post", "publishMarketDataset", "MarketVersion", "MarketPublish", true);
for (const mode of ["simulation", "scenarios", "selection"]) route("me/retirement/risk/" + mode, "post", "allocationRisk_" + mode, "RiskResult", "RiskInput", false);
route("me/retirement/risk/rebalance", "post", "allocationRisk_rebalance", "RebalanceResult", "RebalanceInput", false);
// Keep existing path blocks byte-for-byte; adding a route must not rewrap every
// unrelated description in the root specification.
function preserveBlocks(before, after) {
  const oldDoc = parseDocument(before), newDoc = parseDocument(after);
  const blockMap = (text, map, end) => new Map(map.items.map((pair, i) => {
    const start = text.lastIndexOf("\n", pair.key.range[0]) + 1;
    const next = map.items[i + 1];
    const stop = next ? text.lastIndexOf("\n", next.key.range[0]) + 1 : end;
    return [String(pair.key.value), { text: text.slice(start, stop), value: pair.value.toJSON(), node: pair.value, start, stop }];
  }));
  const oldTop = blockMap(before, oldDoc.contents, before.length), newTop = blockMap(after, newDoc.contents, after.length);
  return [...newTop].map(([key, b]) => {
    const a = oldTop.get(key);
    if (a && JSON.stringify(a.value) === JSON.stringify(b.value)) return a.text;
    if (key !== "paths" || !a) return b.text;
    const oldPaths = blockMap(before, a.node, a.stop), newPaths = blockMap(after, b.node, b.stop);
    return "paths:\n" + [...newPaths].map(([path, next]) => {
      const previous = oldPaths.get(path);
      return previous && JSON.stringify(previous.value) === JSON.stringify(next.value) ? previous.text : next.text;
    }).join("");
  }).join("");
}
if (JSON.stringify(parseDocument(original).toJSON()) !== JSON.stringify(doc.toJSON()))
  fs.writeFileSync("docs/openapi.yaml", preserveBlocks(original, doc.toString({ lineWidth: 120 })));
module.exports = { preserveBlocks };
