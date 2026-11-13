import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { projectMonthly } from "../../sites/an-huu-trai-nghiem/dist/projection.js";
import { scheduledPayment as demoPayment, DebtDecimal as DemoDebtDecimal } from "../../sites/an-huu-trai-nghiem/dist/vendor/production-engine.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const esbuild = require("esbuild");
const schema = await readFile(path.join(root, "backend/src/modules/retirement/schema.ts"), "utf8");
const v4 = await readFile(path.join(root, "backend/src/modules/retirement/engine-v4.ts"), "utf8");
const output = path.join(root, ".tmp/user-logic-parity/current-engine.cjs");
await mkdir(path.dirname(output), { recursive: true });
await esbuild.build({
  stdin: { contents: `export {projectRetirement} from './backend/src/modules/retirement/engine';
    export {scheduledPayment,DebtDecimal} from './backend/src/modules/debts/loan';
    import {RetirementDecimal as D} from './backend/src/modules/retirement/engine';
    ${v4.slice(v4.indexOf("export function rebuildSourceBudget("))}`, resolveDir: root, loader: "ts" },
  outfile: output, bundle: true, format: "cjs", platform: "node",
  plugins: [{ name: "numeric-model-only", setup(build) {
    build.onResolve({ filter: /^@prisma\/client$/ }, () => ({ path: path.join(root, "backend/node_modules/@prisma/client/index.js"), external: true }));
    build.onLoad({ filter: /retirement[\\/]schema\.ts$/ }, () => ({ contents: schema.match(/export const RETIREMENT_MODEL = [^;]+;/)[0], loader: "ts" }));
  } }],
});
const current = require(output);
const base = { birthMonth: "1990-01", valuationMonth: "2026-01", retirementMonth: "2040-01", endMonth: "2070-01",
  risk: "balanced", savings: 400000000, contribution: 5000000, income: 30000000, expenses: 15000000, spending: 12000000, pension: 0 };
const cases = [
  ["standard monthly plan", base],
  ["budget caps contributions", { ...base, income: 16000000 }],
  ["capital exhaustion and unfunded withdrawals", { ...base, income: 1000000, savings: 0 }],
  ["already retired", { ...base, retirementMonth: "2026-01", endMonth: "2030-01" }],
  ["zero retirement spending", { ...base, spending: 0 }],
  ["separate pension start and today-price basis", { ...base, pensionReviewed: true, pensionStatus: "known", pension: 8000000, pensionStart: "2042-06", pensionBasis: "today" }],
  ["nominal pension and start after retirement", { ...base, pensionReviewed: true, pensionStatus: "known", pension: 8000000, pensionStart: "2042-06", pensionBasis: "nominal" }],
  ["owned retirement share and delayed capital", { ...base, holdings: [{ amount: 1000000000, ownership: 50, retirementPercent: 80, available: "2041-05" }] }],
  ["fixed-rate debt and separate monthly reserve", { ...base, loanItems: [{ amount: 100000000, payment: 5000000, rate: 9.6 }], reservedMonthly: 3000000 }],
  ["dated contribution and spending changes", { ...base, futureChanges: [{ from: "2028-02", to: "2029-03", contribution: 20000000, spending: 10000000 }] }],
];
for (const [label, input] of cases) test(`demo/current engine exact rows and summary: ${label}`, () => {
  const demo = projectMonthly(input);
  assert.deepEqual(current.rebuildSourceBudget(demo.input, demo.input.rows), demo.input.rows);
  assert.deepEqual(current.projectRetirement(demo.input), demo.engine);
});
for (const [label, balance, rate, payment] of [
  ["normal amortization", "100000000", "9.6", "5000000"],
  ["final payment capped to remaining principal", "51005", "12", "5050000"],
  ["zero interest", "1000000", "0", "250000"],
  ["insufficient interest payment", "10000000", "12", "50000"],
]) test(`demo/current fixed-rate loan payment: ${label}`, () => {
  const period = { rate: { kind: "NOMINAL_ANNUAL_MONTHLY", percent: rate }, repayment: { kind: "TOTAL_PAYMENT", amount: payment }, minimumPayment: "0", fee: "0" };
  const live = current.scheduledPayment(new current.DebtDecimal(balance), period, false);
  const demo = demoPayment(new DemoDebtDecimal(balance), period, false);
  // The two bundles use distinct Decimal constructors; compare their serialized values.
  assert.deepEqual(JSON.parse(JSON.stringify(live)), JSON.parse(JSON.stringify(demo)));
});
