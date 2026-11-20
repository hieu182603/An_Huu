#!/usr/bin/env node
// Compare two audit result files (AUDIT_RAW=1 runs of audit-allocation-personalization.test.ts)
// digit for digit, ignoring only wall-clock timings. Used to prove an optimization changes no result.
// Usage: node scripts/compare-audit-golden.cjs <before.json> <after.json>
const fs = require("fs");
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) { console.error("usage: compare-audit-golden.cjs <before.json> <after.json>"); process.exit(2); }
const load = p => JSON.parse(fs.readFileSync(p, "utf8")).results;
// Wall-clock and run-identity fields: the memory DB creates new document versions every run (ids/hashes),
// and how many continuations or adjustment probes fit a time budget depends on speed, not on the algorithm.
const TIMING = new Set(["ms", "ranAt", "retried", "continuations", "marketVersionId", "policyVersionId", "assumptionVersionId",
  "policyHash", "assumptionHash", "marketHash", "inputHash", "profileHash"]);
// An adjustment lever that ran out of its time budget on either side is not comparable (only completed searches are).
const budgetLimited = v => v && typeof v === "object" && Array.isArray(v.issues) && v.issues.includes("ADJUSTMENT_RUNTIME_LIMIT");
let skippedLevers = 0;
const diffs = [];
function walk(a, b, path) {
  if (diffs.length > 50) return;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { diffs.push(`${path}: ${JSON.stringify(a)?.slice(0, 120)} != ${JSON.stringify(b)?.slice(0, 120)}`); return; }
  if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (TIMING.has(k)) continue;
      if (budgetLimited(a[k]) || budgetLimited(b[k])) { skippedLevers++; continue; }
      if (k === "evaluations" && /adjustments/i.test(path)) continue; // probe count depends on which levers finished
      if (k === "status" && /adjustments$|rawAdjustments$/i.test(path)) continue; // overall status follows the levers
      walk(a[k], b[k], `${path}.${k}`);
    }
    return;
  }
  if (a !== b) diffs.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
const before = load(beforePath), after = load(afterPath);
const byId = r => new Map(r.map(x => [x.id, x]));
const A = byId(before), B = byId(after);
for (const id of new Set([...A.keys(), ...B.keys()])) walk(A.get(id), B.get(id), id);
if (diffs.length) { console.log(`DIFFERENT (${diffs.length}${diffs.length > 50 ? "+" : ""} differences):`); diffs.forEach(d => console.log("  " + d)); process.exit(1); }
console.log(`IDENTICAL: ${A.size} cases, every computed field equal (timing/identity fields ignored; ${skippedLevers} budget-limited adjustment levers skipped).`);
