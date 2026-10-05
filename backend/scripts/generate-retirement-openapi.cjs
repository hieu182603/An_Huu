require("ts-node/register");
const fs = require("node:fs");
const { stringify, parseDocument } = require("yaml");
const { schema } = require("./generate-assumptions-openapi.cjs");
const { retirementPreviewSchema } = require("../src/modules/retirement/schema");
const str = { type: "string" }, num = { type: "integer" }, bool = { type: "boolean" };
const decimal = { type: "string", pattern: "^-?(0|[1-9]\\d*)(\\.\\d+)?$" };
const nullableDecimal = { ...decimal, nullable: true }, nullableStr = { ...str, nullable: true };
const en = (...values) => ({ type: "string", enum: values });
const obj = properties => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const arr = items => ({ type: "array", items });
const ref = name => ({ $ref: "#/" + name });
const nullableRef = name => ({ anyOf: [ref(name), { type: "object", nullable: true, enum: [null] }] });
const s = { Input: schema(retirementPreviewSchema) };
s.Issue = obj({ path: str, code: str });
const row = { month: str };
for (const name of ["growthFactor", "inflationFactor", "income", "pension", "livingExpense", "additionalExpense", "debtPayment", "plannedContribution", "contribution", "contributionCapacity", "withdrawal", "uninvestedSurplus", "capitalInjection"]) row[name] = decimal;
s.MonthlyInput = obj(row);
s.ReplayInput = obj({ valuationDate: str, retirementMonth: str, initialCapital: decimal, terminalBalance: decimal,
  monthlyContribution: decimal, contributionTiming: en("END_OF_MONTH", "START_OF_MONTH_RESEARCH", "START_OF_MONTH"), rows: arr(ref("MonthlyInput")) });
s.ReplayInput.properties.modelVersion = en("retirement-monthly-v3");
s.ReplayInput.properties.contributionStartMonth = str;
s.Row = obj({ ...row, phase: en("ACCUMULATION", "RETIREMENT"), ...Object.fromEntries([
  "openingBalance", "investmentChange", "closingBalance", "fundedClosingBalance", "unfundedWithdrawal", "budgetShortfall", "requiredOpeningBalance", "requiredClosingBalance", "netWithdrawal",
].map(k => [k, decimal])) });
s.Comparison = obj({ projectedFund: decimal, requiredFund: decimal, fundingGap: decimal, coveragePercent: nullableDecimal });
s.Summary = obj({ valuationDate: str, retirementMonth: str, endMonth: str, accumulationMonths: num, retirementMonths: num,
  initialRetirementCapital: decimal, atRetirement: ref("Comparison"), atValuation: ref("Comparison"), algebraicRequiredFund: decimal,
  liquidityReserveAboveAlgebraicPV: decimal, futureMonthlyExpense: decimal, plannedMonthlyContribution: decimal,
  requiredConstantMonthlyContribution: nullableDecimal, additionalMonthlyContribution: nullableDecimal,
  savingsStatus: en("NO_ACCUMULATION_PERIOD", "NO_ELIGIBLE_CONTRIBUTION_PERIOD", "EARLY_FUNDING_REQUIRED", "NO_ADDITIONAL_CONTRIBUTION", "ADDITIONAL_CONTRIBUTION_REQUIRED"),
  requiredContributionWithinCapacity: { ...bool, nullable: true }, retirementFundingShortfall: decimal, excessAtRetirement: decimal,
  firstShortfallMonth: nullableStr, firstBudgetShortfallMonth: nullableStr, unfundedWithdrawals: decimal,
  terminalBalance: decimal, fundedTerminalBalance: decimal, terminalTarget: decimal, terminalTargetShortfall: decimal });
s.Conventions = obj({ contributionTiming: en("END_OF_MONTH", "START_OF_MONTH_RESEARCH", "START_OF_MONTH"), withdrawalTiming: en("END_OF_MONTH"),
  capitalReleaseTiming: en("END_OF_MONTH"), surplusPolicy: str, allocationCashflows: str, arithmeticPrecision: num,
  firstPeriod: str, rounding: str, negativeBalance: str, terminalBalanceBasis: str });
s.Calculation = obj({ modelVersion: str, conventions: ref("Conventions"), summary: ref("Summary"), rows: arr(ref("Row")), netWorth: nullableDecimal,
  assessment: { $ref: "./portfolios.openapi.yaml#/Assessment" }, marketRows: arr({ $ref: "./portfolios.openapi.yaml#/Row" }),
  scenario: obj({ kind: en("BASE", "ADVERSE", "FAVORABLE"), label: str, evidence: str, changes: { $ref: "./portfolios.openapi.yaml#/Scenario/properties/changes" } }),
  legalRetirementAge: { $ref: "./pensions.openapi.yaml#/LegacyAgeReference" }, limitations: arr(str) });
s.Preview = obj({ status: en("READY", "INCOMPLETE"), issues: arr(ref("Issue")), warnings: arr(ref("Issue")), calculation: nullableRef("Calculation"),
  replayInput: nullableRef("ReplayInput"), modelVersion: str, profileRevision: num, valuationDate: str, currency: en("VND"),
  references: obj({ profileHash: str, policyVersionId: str, policyVersion: num, policyHash: str, assumptionVersionId: str, assumptionVersion: num, assumptionHash: str }),
  inputHash: str, sources: arr({ $ref: "./assumptions.openapi.yaml#/Source" }), selection: ref("Input") });
s.Preview.properties.reforecast = obj({ kind: en("ACTUAL_REFORECAST"), sourceVersionId: {type:"string",format:"uuid"}, sourceSnapshotHash: str,
  originalValuationDate: str, originalRetirementMonth: str, throughMonth: str,
  actualRevisions: arr(obj({period:str,revision:num,closingBalance:decimal})) });
s.Preview.properties.futureChanges = arr(schema(require('../src/modules/actuals/schema').futureChangeSchema));
s.Preview.properties.sourceChanges = arr(schema(require('../src/modules/actuals/schema').sourceChangeSchema));
s.Envelope = obj({ data: ref("Preview"), meta: obj({ requestId: { type: "string", format: "uuid" } }) });
fs.writeFileSync("docs/retirement.openapi.yaml", stringify(s));
const doc = parseDocument(fs.readFileSync("docs/openapi.yaml", "utf8"));
doc.setIn(["components", "schemas", "RetirementPreviewEnvelope"], { $ref: "./retirement.openapi.yaml#/Envelope" });
const json = name => ({ content: { "application/json": { schema: { $ref: "./retirement.openapi.yaml#/" + name } } } });
doc.setIn(["paths", "/api/v1/me/retirement/preview", "post"], { operationId: "previewMonthlyRetirement", summary: "Preview monthly personal retirement cashflows",
  security: [{ bearerAuth: [] }], description: "USER only. Read-only profile v2 revision and immutable published portfolio/assumption versions. Decimal strings, no intermediate display rounding. No macro overrides, save, apply or worker events. INCOMPLETE is distinct from zero. See RETIREMENT_MONTHLY.md for timing, surplus, capital release and solver conventions.",
  requestBody: { required: true, ...json("Input") }, responses: { 200: { description: "Monthly calculation or explicit missing inputs", ...json("Envelope") },
    ...Object.fromEntries([400, 401, 403, 404, 409, 422, 429, 503].map(status => [status, { description: "Request rejected", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } }])) } });
fs.writeFileSync("docs/openapi.yaml", String(doc));
