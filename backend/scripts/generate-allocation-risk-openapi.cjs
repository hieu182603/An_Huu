// Offline schema generation only. Never loads env, services or a DB client.
require("ts-node/register");
const fs = require("node:fs");
const { parseDocument, stringify } = require("yaml");
const { schema } = require("./generate-assumptions-openapi.cjs");
const market = require("../src/modules/allocation-risk/market-schema");
const { riskRequestSchema } = require("../src/modules/allocation-risk/schema");
const { riskPolicySchema } = require("../src/modules/allocation-risk/policy");
const { rebalanceInputSchema } = require("../src/modules/allocation-risk/rebalance");
const { rebalanceDecisionUpdateSchema, rebalanceHistoryQuerySchema } = require("../src/modules/allocation-risk/rebalance-decisions");
const { holdingsDriftQuery, holdingsRebalanceOrdersInput } = require("../src/modules/holdings/repository");
const ref = name => ({ $ref: "#/" + name });
const str = { type: "string" }, number = { type: "number" }, integer = { type: "integer" }, boolean = { type: "boolean" };
const uuid = { type: "string", format: "uuid" }, nullable = { type: "string", nullable: true };
const en = (...values) => ({ type: "string", enum: values });
const arr = items => ({ type: "array", items });
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const optional = properties => obj(properties, []);
const s = {};
for (const [name, input] of Object.entries({ MarketDocument: market.marketDocumentSchema, MarketWrite: market.writeMarketSchema,
  StoredMarketDocument: market.storedMarketDocumentSchema, MarketApprove: market.approveMarketSchema, MarketPublish: market.publishMarketSchema, RiskInput: riskRequestSchema,
  RiskPolicy: riskPolicySchema, RebalanceInput: rebalanceInputSchema, RebalanceDecisionUpdate: rebalanceDecisionUpdateSchema, RebalanceHistoryQuery: rebalanceHistoryQuerySchema, HoldingsDriftQuery: holdingsDriftQuery, HoldingsOrdersInput: holdingsRebalanceOrdersInput })) s[name] = schema(input);
s.MarketDocument.description = "ADMIN-owned real monthly total returns, VND nominal decimal fractions including dividends/distributions and CPI month-on-month. No missing, duplicate or discontinuous months; exact asset columns; no imputation. GROSS subtracts the explicitly approved monthlyDrag in decimal points once; NET is not deducted again. Each source must have licensed simulation/derived-output rights. Approval requires historical closed months and nonfuture retrieval dates. No synthetic production fallback.";
s.StoredMarketDocument.description = "Historical stored market documents may omit return basis, license status or gold quote side. Reading preserves the original document hash; simulation discloses the missing verification. New publication requires total returns, verified licenses and BUY-side gold, or an explicit reasoned override stored in reviewNote.";
s.RiskInput.description = "Read-only POST. No client return/CPI arrays, random seed or benchmark overrides. Saved versions are owner-checked and integrity-checked. Omitted marketVersionId selects latest effective PUBLISHED dataset; response pins its ID/hash for repeat runs. Old plan snapshots and inputHash are unchanged.";
s.MarketVersion = obj({ id: uuid, version: integer, revision: integer, status: en("DRAFT", "APPROVED", "PUBLISHED"), data: ref("StoredMarketDocument"), documentHash: str,
  approval: { anyOf: [obj({ actor: str, approvedAt: str, documentHash: str, reviewNote: str }), { type: "object", nullable: true, enum: [null] }] }, effectiveAt: nullable });
s.MarketList = obj({ page: integer, limit: integer, total: integer, items: arr(obj({ id: uuid, version: integer, revision: integer, status: str, title: str, period: s.MarketDocument.properties.period })) });
s.Validation = obj({ status: en("VALID", "INVALID"), issues: arr(obj({ path: str, message: str })), warnings: arr(obj({ code: str, path: str, message: str })) });
s.Empty = obj({});
s.Limits = obj({ maxPaths: integer, maxPathMonths: integer, maxRuntimeMs: integer });
s.Allocation = obj({ assetClass: str, weightPercent: str });
s.PathResult = obj({ essentialLossToday: str, funded: boolean, balances: arr(str), unfundedWithdrawals: str, fundedTerminalBalance: str, firstShortfallMonth: nullable });
Object.assign(s.PathResult.properties, { lossFirstTerminalBalance: str, gainFirstTerminalBalance: str, balanceDifference: str });
const simulation = {
  modelCode: en("allocation-risk-v1", "allocation-risk-v2"), seed: integer, paths: integer, blockMonths: integer, pEssential: number,
  wilson: obj({ confidence: number, lower: number, upper: number }), cvarAlpha: str, cvarEssentialShortfallToday: str,
  display: obj({ pEssentialPercent: integer, wilsonLowerPercent: integer, wilsonUpperPercent: integer, cvarVnd: str }),
  bands: arr(obj({ month: str, p10: str, p50: str, p90: str })),
  disclosure: obj({ period: s.MarketDocument.properties.period, sources: s.MarketDocument.properties.sources, currency: str, bandBasis: str,
    moneyRounding: str, probabilityRounding: str, historyMonths: integer, limitations: arr(str) }),
};
s.Candidate = obj({ status: en("READY"), ...simulation, id: str, changePoints: str, targets: arr(arr(ref("Allocation"))) });
const extended={pAll:{type:"number",nullable:true},allGoalsStatus:str,allGoalsIssue:nullable};
Object.assign(s.Candidate.properties,extended,{
 selection:{anyOf:[obj({templateId:str,customAllocation:s.RiskInput.properties.trialAllocation},["templateId"]),{type:"object",nullable:true,enum:[null]}]},
 loss:{$ref:"./retirement.openapi.yaml#/LossConstraint"},
 withinLossLimit:boolean, applicable:boolean, applyIssues:arr(str)
});
// Loss-limit feasibility: what the customer would have to accept (algorithm §10.4). Informational only.
s.LossFeasibility = { ...obj({ minimumLossAmount: str, allowedLossAmount: str, requiredToleranceAmountVnd: str, requiredTolerancePercentOfGrowth: str }), nullable: true };
const referenceKind = { type: "string", nullable: true, enum: ["QUALIFIED", "BEST_WITHIN_LOSS_LIMIT", "LOSS_REDUCED_WITHIN_LIMIT", "LEAST_LOSS_OVER_LIMIT", "TEMPLATE_UNSIMULATED", null] };
// Selection without published market data: loss checks and the pinned deterministic path only, never a probability.
s.PinnedCandidate = obj({ id: str, changePoints: str, targets: arr(arr(ref("Allocation"))), loss: { $ref: "./retirement.openapi.yaml#/LossConstraint" },
  withinLossLimit: boolean, essentialLossToday: str, funded: boolean, fundedTerminalBalance: str });
s.DeterministicSelection = obj({ basis: en("PINNED_DETERMINISTIC_ASSUMPTIONS"), referenceId: nullable, referenceKind, candidates: arr(ref("PinnedCandidate")),
  rejected: arr(obj({ id: str, issues: arr(str) })), lossFeasibility: ref("LossFeasibility"), applicable: { type: "boolean", enum: [false] }, applyIssues: arr(str), limitations: arr(str) });
const scenarioParameters = Object.values(s.RiskPolicy.properties.stresses.properties);
s.Scenario = obj({ kind: str, status: en("READY", "REVIEW_REQUIRED", "NOT_APPLICABLE"), issues: arr(str), parameters: { anyOf: scenarioParameters },
  result: ref("PathResult"), assumptions: arr(str), firstShortfallMonth: nullable, windowAdjusted: boolean, level: en("SEVERE"), severity: en("SEVERE"),
  offsetMonths: integer, offsets: arr(obj({ offsetMonths: integer, kind: str, status: str, parameters: { anyOf: scenarioParameters }, assumptions: arr(str), issues: arr(str), level: en("SEVERE"), windowAdjusted: boolean, window: obj({ from: str, to: str }), firstShortfallMonth: nullable, result: ref("PathResult") }, ["offsetMonths", "status"])),
  lossFirstTerminalBalance: str, gainFirstTerminalBalance: str, balanceDifference: str, worstOffsetMonths: integer,
  window: obj({ from: str, to: str }), orders: arr(obj({ order: en("LOSS_FIRST", "GAIN_FIRST"), annualReturns: arr(str), result: ref("PathResult") })),
}, ["kind", "status"]);
s.Longevity = obj({ kind: en("LONGEVITY"), status: en("READY", "REVIEW_REQUIRED"), results: arr(obj({ extraYears: integer, status: en("READY", "REVIEW_REQUIRED"),
  issues: arr(str), endMonth: str, firstShortfallMonth: nullable, result: ref("PathResult") }, ["extraYears", "status"])) });
s.RiskResult = obj({ status: en("READY", "DATA_REQUIRED", "REVIEW_REQUIRED", "INSUFFICIENT", "LIMIT_EXCEEDED"), issues: arr(str), limits: ref("Limits"),
  marketVersionId: { ...uuid, nullable: true }, marketVersion: { ...integer, nullable: true }, marketHash: nullable, inputHash: str, profileHash: str, policyVersionId: uuid, policyVersion: integer, policyHash: str,
  assumptionVersionId: uuid, assumptionVersion: integer, assumptionHash: str, informationalOnly: boolean, persisted: boolean,
  ...simulation, basis: str, sources: { type: "array", items: { $ref: "./assumptions.openapi.yaml#/Source" } }, scenarios: arr(ref("Scenario")), longevity: ref("Longevity"), limitations: arr(str),
  optimization: obj({ status: str, method: str, issues: arr(str), feasible: boolean }, ["status"]),
  selectedId: nullable, threshold: str, candidates: arr(ref("Candidate")), rejected: arr(obj({ id: str, issues: arr(str) })),
  adjustmentOptions: { anyOf: [{ $ref: "./retirement.openapi.yaml#/AdjustmentOptions" }, obj({ status: en("REVIEW_REQUIRED"), issues: arr(str) })] }, adjustmentKinds: arr(str), rule: { ...str, description: "Chuỗi phân tách bằng `; `. Phần đầu là quy tắc chọn; các phần sau là phạm vi áp dụng và có thể được bổ sung. Client chỉ nên so phần trước dấu `;` đầu tiên." },
}, ["status"]);
// Turnover tie-break (spec 7.4 step 3): distance from the customer's current holdings when known, else from the template. Optional for compatibility.
const turnoverBasis = { type: "string", enum: ["CURRENT_HOLDINGS", "TEMPLATE_FALLBACK"], description: "CURRENT_HOLDINGS: ties after CVaR are broken by turnoverFromCurrentPoints (half-L1 percentage points from current holdings to the month-0 target). TEMPLATE_FALLBACK: current weights unavailable; changePoints (distance to the published template) is used." };
const turnoverFromCurrentPoints = { ...nullable, description: "Half-L1 distance in percentage points between current holdings and this candidate's month-0 targets; absent or null when current weights are unavailable." };
Object.assign(s.Candidate.properties, { turnoverFromCurrentPoints,
  thresholdUndecided: { type: "boolean", description: "Selection only: the Wilson interval still straddles the essential threshold (wilson.lower < threshold <= wilson.upper), so more paths could change whether the candidate qualifies." } });
// Progressive Monte Carlo (spec 7.1): partial progress is kept server-side and is never an estimate.
s.RiskProgress = obj({ pathsCompleted: integer, pathsRequested: integer });
s.RiskProgress.description = "Present with LIMIT_EXCEEDED and issue RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED. simulation/adjustments baseline: paths done and requested for the run. selection: sum of finished path-candidates (finished candidates count in full) over paths x valid candidates (an upper bound: candidates rejected later are still counted). Repeat the identical request to continue.";
Object.assign(s.RiskResult.properties, { progress: ref("RiskProgress"),
  pathMilestones: { type: "array", items: { type: "integer" }, description: "Selection path milestones: 20/50/100/200/500/1000, bounded by LIMITS.maxPaths." },
  preliminary: { type: "boolean", description: "Selection only: true while paths < 1000 (the spec §7.1 standard)." } });
Object.assign(s.PinnedCandidate.properties, { turnoverFromCurrentPoints });
Object.assign(s.DeterministicSelection.properties, { turnoverBasis });
Object.assign(s.RiskResult.properties,extended,{turnoverBasis},{referenceId:nullable,referenceKind,lossFeasibility:ref("LossFeasibility"),deterministic:ref("DeterministicSelection"),allThreshold:nullable,shortfallAmount:nullable,adjustmentsOmitted:boolean});
s.RiskResult.description = "pEssential is the fraction of COMPLETE paths funding every essential expense, not terminal solvency. CVaR = min eta [eta + mean((loss-eta)+)/(1-alpha)], loss is the sum of essential deficits at opening-month CPI prices. Wilson confidence=95% measures Monte Carlo sampling error only. Bands are funded balances in today's VND, rounded to millions; display probabilities to whole percentage points. Candidate comparison uses raw values, common seed, probability threshold then minimum CVaR then minimum equity shift. No Sharpe criterion. Simulation rebalances back to target when drift reaches or exceeds the approved policy band (allocationRisk.rebalanceBandPoints) when it is set. Selection puts a candidate outside the policy customization bounds in any month in rejected with issue WEIGHT_BOUND_EXCEEDED. Missing data => DATA_REQUIRED; missing approved parameters/classification => REVIEW_REQUIRED; timeout/operation caps => LIMIT_EXCEEDED without partial statistics. Deterministic scenarios have individual statuses; optional sequence stress uses configured annual returns. No writes or trades.";
s.RebalanceResult = obj({ status: en("REVIEW_REQUIRED", "WITHIN_BAND", "PROPOSED"), issues: arr(str), policyVersionId: uuid, policyHash: str, month: str, persisted: boolean, informationalOnly: boolean,
  oldWeights: arr(ref("Allocation")), targetWeights: arr(ref("Allocation")), newWeights: arr(ref("Allocation")), reason: str, bandPoints: str, costPercent: str, cost: str, netValue: str,
  cashUsedBeforeTrades: str, unallocatedNewContribution: str, assumptions: arr(str), trigger: en("AT_OR_ABOVE_BAND", "BELOW_BAND", "SPENDING_FLOOR_BREACHED"),
  taxAmount: str, transactionFeeAmount: str, taxEvidence: str, decisionId: uuid, decision: en("PROPOSED", "ACCEPTED", "DISMISSED"),
  probabilityComparison: obj({ status: en("READY", "REVIEW_REQUIRED", "DATA_REQUIRED"), paths: { type: "integer", enum: [20] }, before: number, after: number,
    basis: en("SAME_CASHFLOWS_SEED_FIXED_WEIGHTS_AFTER_RECORDED_FREE_CASH_AND_COST"), issues: arr(str) }, ["status"]),
  trades: arr(obj({ assetClass: str, oldValue: str, maturedAmount: str, cashAllocated: str, buy: str, sell: str, newValue: str })),
}, ["status", "issues"]);
s.RebalanceResult.description = "Informational decision data; record=true explicitly saves an owner-scoped proposal without executing trades. Drift is checked at or above the policy band after allocating new contributions and maturities. From retirement, a shortfall against the approved minimum safe spending-floor fraction overrides this band (SPENDING_FLOOR_BREACHED). Cash-only allocations can be PROPOSED with BELOW_BAND and zero trading costs; maturedAmount is already included in holding value. Cost is half remaining gross buys+sells times approved turnover cost. Net targets solve the cost budget. WITHIN_BAND means no free cash and no remaining trigger. Product purchase orders combine cashAllocated and residual buy exactly once. Existing actuals are not modified.";
// Adjustments mode (spec 7.4 step 4): smallest single-lever change that lifts the selected allocation to the approved pEssential threshold.
const lever = extra => obj({ status: en("FOUND", "NOT_FEASIBLE", "NOT_APPLICABLE", "REVIEW_REQUIRED"), issues: arr(str), evaluations: integer, pEssential: { type: "number", nullable: true }, ...extra });
const nstr = nullable, nint = { type: "integer", nullable: true }, nbool = { type: "boolean", nullable: true };
s.AdjustmentsResult = obj({ status: en("NOT_NEEDED", "READY", "NOT_FEASIBLE", "REVIEW_REQUIRED", "DATA_REQUIRED", "LIMIT_EXCEEDED"), issues: arr(str), limits: ref("Limits"),
  marketVersionId: { ...uuid, nullable: true }, marketVersion: { ...integer, nullable: true }, marketHash: nullable, inputHash: str, profileHash: str, policyVersionId: uuid, policyVersion: integer, policyHash: str,
  assumptionVersionId: uuid, assumptionVersion: integer, assumptionHash: str, informationalOnly: boolean, persisted: boolean,
  threshold: str, paths: integer, basis: en("SIMULATED_P_ESSENTIAL_SAME_SEED_AND_ALLOCATION"), baselinePEssential: number,
  contribution: lever({ requiredMonthlyContribution: nstr, additionalMonthlyContribution: nstr, withinCapacityEveryMonth: nbool }),
  retirement: lever({ retirementMonth: nstr, delayMonths: nint }),
  optionalSpending: lever({ cutPercent: nint, keepPercent: nint, monthlyOptionalToday: nstr, monthlyCutToday: nstr }),
  deferFlexibleGoals: lever({ deferMonths: nint, deferredGoalIds: arr(str), shiftedGoals: arr(obj({ id: str, fromMonth: str, toMonth: str })) }),
  evaluations: integer, steps: obj({ contributionVnd: str, retirementMonths: integer, optionalCutPercent: integer, goalDeferMonths: integer }), limitations: arr(str),
}, ["status"]);
s.AdjustmentsResult.description = "Run mode of POST /me/retirement/risk/adjustments, same RiskInput. Runs only the selected allocation on the same seed and paths as selection, one lever at a time (extra monthly contribution within capacity, later retirement up to 120 months, cutting OPTIONAL spending, or delaying explicitly deferrable FLEXIBLE goals by up to 60 months; ESSENTIAL is never cut and returns are never raised), and returns the smallest tested step whose simulated pEssential reaches the approved threshold. NOT_NEEDED: baseline already passes (only threshold/paths/basis/baselinePEssential returned). READY: at least one lever FOUND. NOT_FEASIBLE: no lever reaches the threshold. REVIEW_REQUIRED: a lever could not be evaluated (see its issues, e.g. ADJUSTMENT_RUNTIME_LIMIT). Search steps in steps. Server budget 60 seconds. DATA_REQUIRED, REVIEW_REQUIRED and LIMIT_EXCEEDED have the same shape as the other modes. Informational only; nothing is saved or applied.";
Object.assign(s.AdjustmentsResult.properties, { progress: ref("RiskProgress") });
Object.assign(s.RiskResult.properties, { notes: arr(str), explanation: arr(obj({ code: str, parameters: { type: "object", additionalProperties: { anyOf: [nullable, number, boolean] } }, text: str })) });
s.RebalanceDecision = obj({ id: uuid, userId: uuid, planVersionId: { ...uuid, nullable: true }, createdAt: str, source: en("PROPOSAL", "MONITOR"),
  oldWeights: arr(ref("Allocation")), targetWeights: arr(ref("Allocation")), newWeights: arr(ref("Allocation")), trigger: str,
  bandPoints: str, costEstimate: str, trades: s.RebalanceResult.properties.trades, probabilityBefore: { ...number, nullable: true }, probabilityAfter: { ...number, nullable: true },
  decision: en("PROPOSED", "ACCEPTED", "DISMISSED"), note: nullable });
s.RebalanceHistory = obj({ items: arr(ref("RebalanceDecision")) });
const trade = s.RebalanceResult.properties.trades;
const recommendation = obj({ status: en("NO_ACTION", "PROPOSED", "REVIEW_REQUIRED"), costEstimated: str, trades: trade, cashUsedBeforeTrades: str, unallocatedCash: str });
const holdingResult = { persisted: boolean, informationalOnly: boolean, planId: uuid, versionId: uuid, policyVersionId: uuid, templateId: str, month: str, recordedDividends: str, notes: arr(str) };
s.HoldingsDriftResult = obj({ ...holdingResult, userId: uuid, asOfDate: str, totalPortfolioValue: str, isDrifted: boolean, maxDriftPercent: str, driftThresholdPercent: str,
  drifts: arr(obj({ assetClass: str, currentWeightPercent: str, targetWeightPercent: str, driftPercent: str, status: en("OVERWEIGHT", "UNDERWEIGHT", "IN_TOLERANCE") })),
  rebalanceRequired: boolean, rebalanceRecommendation: { anyOf: [recommendation, { type: "object", nullable: true, enum: [null] }] }, regulatoryDisclaimer: str });
s.HoldingsOrdersResult = obj({ ...holdingResult,
  drift: obj({ isDrifted: boolean, maxDriftPercent: str, driftThresholdPercent: str, rebalanceRequired: boolean, rebalanceStatus: nullable, costEstimated: str, cashUsedBeforeTrades: str }),
  orders: arr(obj({ productId: str, productCode: str, productName: str, assetClass: str, action: en("BUY", "SELL"), units: number, estimatedPrice: str, estimatedAmount: str, lotSize: integer, rationale: str })), regulatoryDisclaimer: str });
for (const name of ["MarketVersion", "MarketList", "Validation", "RiskResult", "AdjustmentsResult", "RebalanceResult", "RebalanceDecision", "RebalanceHistory", "HoldingsDriftResult", "HoldingsOrdersResult"]) s[name + "Envelope"] = obj({ data: ref(name), meta: obj({ requestId: uuid }) });
s.MarketDailyConvert = obj({ pricesCsv: { type: "string", minLength: 1, maxLength: 1500000 }, cpi: obj({ kind: en("MOM_PERCENT", "INDEX"), csv: { type: "string", minLength: 1, maxLength: 200000 } }, ["kind", "csv"]), maxMonthEndGapDays: { type: "integer", minimum: 0, maximum: 15, default: 7 } }, ["pricesCsv", "cpi"]);
s.MarketDailyConvert.description = 'Admin-entered daily price or total-return index levels (CSV, header "date,ASSET_A,ASSET_B", dates YYYY-MM-DD or DD/MM/YYYY, dot decimals, empty cell = no observation) plus monthly CPI. Nothing is stored.';
s.MarketDailyIssue = obj({ code: str, message: str, line: integer, assetClass: str, month: str }, ["code", "message"]);
s.MarketDailyResultEnvelope = obj({ data: obj({ status: en("VALID", "INVALID"), assets: arr(str), observationCount: integer, period: { type: "object", nullable: true, additionalProperties: false, properties: { from: str, to: str }, required: ["from", "to"] }, rows: arr(obj({ month: str, returns: { type: "object", additionalProperties: str }, cpi: str }, ["month", "returns", "cpi"])), preview: arr(obj({ month: str, returns: { type: "object", additionalProperties: { type: "string", nullable: true } }, cpi: { type: "string", nullable: true }, monthEndDates: { type: "object", additionalProperties: { type: "string", nullable: true } } }, ["month", "returns", "cpi", "monthEndDates"])), issues: arr(ref("MarketDailyIssue")), warnings: arr(ref("MarketDailyIssue")) }, ["status", "assets", "observationCount", "period", "rows", "preview", "issues", "warnings"]), meta: obj({ requestId: str }) });
s.MarketDailyResultEnvelope.description = 'Monthly total return = month-end(m) / month-end(m-1) - 1, where month-end is the last observation within maxMonthEndGapDays of the calendar month end. Missing months are issues, never 0 or interpolation. `rows` is only filled when status is VALID and equals MarketDocument.rows. A trailing unfinished month, or up to 3 trailing months without published CPI, are left out with warnings.';
fs.writeFileSync("docs/allocation-risk.openapi.yaml", stringify(s));
const original = fs.readFileSync("docs/openapi.yaml", "utf8"), doc = parseDocument(original);
const json = name => ({ content: { "application/json": { schema: { $ref: "./allocation-risk.openapi.yaml#/" + name } } } });
function route(path, method, operationId, output, body, admin, list = false, description = undefined, querySchema = null) {
  const parameters = [];
  if (path.includes("{id}")) parameters.push({ in: "path", name: "id", required: true, schema: uuid });
  if (list) for (const [name, max, fallback] of [["page", 100000, 1], ["limit", 100, 20]]) parameters.push({ in: "query", name, schema: { type: "integer", minimum: 1, maximum: max, default: fallback } });
  if (querySchema) for (const [name, field] of Object.entries(querySchema)) parameters.push({ in: "query", name, schema: field });
  const created = operationId === "createMarketDataset";
  doc.setIn(["paths", "/api/v1/" + path, method], { operationId, summary: operationId, security: [{ bearerAuth: [] }],
    description: description ?? (admin ? "ADMIN only. Versioned market dataset workflow in assumption_set_versions. Immutable after approval; publication does not change plans." : "USER only. Read-only computation; no market overrides, save/apply or trade execution. Up to 1000 paths (milestones 20/50/100/200/500/1000), at most 60000 path-months per candidate, 10 seconds per request. Progressive: paths already simulated for identical inputs are reused exactly, so repeating or raising paths only computes the missing ones; on the 10 second limit status is LIMIT_EXCEEDED with issue RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED and progress (no partial estimate), and repeating the identical request continues. Three heavy runs/minute/account (RISK_RUNS_PER_MINUTE); requests with continuation=true use a separate limit of 20/minute/account (RISK_CONTINUATIONS_PER_MINUTE); one run/user and two runs/process concurrently."),
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
route("me/retirement/risk/adjustments", "post", "allocationRisk_adjustments", "AdjustmentsResult", "RiskInput", false, false, "USER only. Read-only computation: smallest contribution, retirement-delay, optional-spending or deferrable-goal delay change that reaches the approved essential threshold for the selected allocation. Many full simulations per request: server budget 60 seconds (other modes 10 seconds); same three heavy runs/minute/account limit (RISK_RUNS_PER_MINUTE), one run/user and two runs/process concurrently.");
route("me/retirement/risk/rebalance", "post", "allocationRisk_rebalance", "RebalanceResult", "RebalanceInput", false, false, "USER only. Computes an informational proposal. record=true explicitly saves an owner-scoped PROPOSED decision; no orders execute and no holdings change. Optional compareProbabilities requires an owned planId/planVersionId and matching saved inputs, and runs 20 common-seed paths before/after costs and free cash; unavailable comparisons return an explicit review/data status.");
route("me/retirement/risk/rebalance/{id}/decision", "post", "allocationRisk_decideRebalance", "RebalanceDecision", "RebalanceDecisionUpdate", false, false, "USER owner only. Records ACCEPTED or DISMISSED and an optional note; this records a decision and never executes trades.");
route("me/retirement/risk/rebalance/history", "get", "allocationRisk_rebalanceHistory", "RebalanceHistory", null, false, false, "USER owner only. Newest-first decision history; limit defaults to 50, maximum 200.", { limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } });
route("investments/holdings/drift", "get", "monitorHoldingsDrift", "HoldingsDriftResult", null, false, false, "USER only. Reads current owned plan and holdings; allocates recorded dividends/maturities before informational drift analysis. persisted=false; no trades or writes.", s.HoldingsDriftQuery.properties);
route("investments/holdings/rebalance-orders", "post", "previewHoldingsRebalanceOrders", "HoldingsOrdersResult", "HoldingsOrdersInput", false, false, "USER only. Owner-scoped current-plan product order preview with fresh reviewed prices, cash-first allocation and configured product lots. Locked holdings require review. persisted=false; no order submission or holdings change.");
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
  const hasAlias = text => /\*[A-Za-z_][\w-]*/.test(text);
  const merged = [...newTop].map(([key, b]) => {
    const a = oldTop.get(key);
    if (a && !hasAlias(a.text) && JSON.stringify(a.value) === JSON.stringify(b.value)) return a.text;
    if (key !== "paths" || !a) return b.text;
    const oldPaths = blockMap(before, a.node, a.stop), newPaths = blockMap(after, b.node, b.stop);
    return "paths:\n" + [...newPaths].map(([path, next]) => {
      const previous = oldPaths.get(path);
      return previous && !hasAlias(previous.text) && JSON.stringify(previous.value) === JSON.stringify(next.value) ? previous.text : next.text;
    }).join("");
  }).join("");
  // Reusing raw blocks is only safe while YAML anchor bindings stay unchanged.
  // Never preserve bytes at the cost of silently changing an unrelated path.
  try {
    if (JSON.stringify(parseDocument(merged).toJSON()) === JSON.stringify(newDoc.toJSON())) return merged;
  } catch { /* Removed/rebound anchors require a semantically exact serialization. */ }
  return stringify(newDoc.toJSON(), { aliasDuplicateObjects: false, lineWidth: 120 });
}
if (JSON.stringify(parseDocument(original).toJSON()) !== JSON.stringify(doc.toJSON()))
  fs.writeFileSync("docs/openapi.yaml", preserveBlocks(original, doc.toString({ lineWidth: 120 })));
module.exports = { preserveBlocks };
