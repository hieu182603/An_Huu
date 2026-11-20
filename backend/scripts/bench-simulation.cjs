#!/usr/bin/env node
// B6-1 benchmark: runs C01, C05, C15 across path counts (default 20,100,500,1000) and
// SIM_WORKERS (default 0,1) using the read-only audit harness, printing elapsed ms and
// continuation counts. Never touches a real database or leaves files inside the repo.
// Usage (from backend/):
//   node scripts/bench-simulation.cjs
//   node scripts/bench-simulation.cjs --paths=20 --cases=C01 --workers=0,1
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function parseList(flag, fallback) {
  const arg = process.argv.find(a => a.startsWith(flag + "="));
  return arg ? arg.slice(flag.length + 1).split(",").filter(Boolean) : fallback;
}

const cases = parseList("--cases", ["C01", "C05", "C15"]);
const pathCounts = parseList("--paths", ["20", "100", "500", "1000"]).map(Number);
const workersList = parseList("--workers", ["0", "1"]);
const backendDir = path.resolve(__dirname, "..");

const rows = [];
for (const workers of workersList) {
  for (const paths of pathCounts) {
    const outFile = path.join(os.tmpdir(), `anhuu-bench-w${workers}-p${paths}-${process.pid}.json`);
    try {
      const env = {
        ...process.env,
        AUDIT_RUN: "1",
        AUDIT_ONLY: cases.join(","),
        AUDIT_PATHS: String(paths),
        AUDIT_SKIP_ADJUSTMENTS: "1",
        AUDIT_OUT: outFile,
        SIM_WORKERS: workers,
      };
      const proc = spawnSync(
        process.execPath,
        ["node_modules/vitest/vitest.mjs", "run", "src/tests/audit-allocation-personalization.test.ts", "-t", "AUDIT"],
        { cwd: backendDir, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
      );
      if (!fs.existsSync(outFile)) {
        rows.push({ id: cases.join(","), paths, workers, status: `EXIT_${proc.status}`, ms: -1, continuations: -1 });
        if (proc.stderr) console.error(proc.stderr.slice(-500));
        continue;
      }
      const data = JSON.parse(fs.readFileSync(outFile, "utf8"));
      for (const r of data.results) {
        rows.push({
          id: r.id,
          paths: r.selection?.paths ?? paths,
          workers,
          status: r.selection?.status ?? r.state,
          ms: r.selection?.ms ?? -1,
          continuations: r.selection?.continuations ?? 0,
        });
      }
    } finally {
      try { fs.unlinkSync(outFile); } catch {}
    }
  }
}

console.log("case | paths | SIM_WORKERS | status       | ms     | continuations");
console.log("-----+-------+-------------+--------------+--------+--------------");
for (const r of rows) {
  console.log(
    `${String(r.id).padEnd(4)} | ${String(r.paths).padStart(5)} | ${String(r.workers).padStart(11)} | ${String(r.status).padEnd(12)} | ${String(r.ms).padStart(6)} | ${String(r.continuations).padStart(13)}`
  );
}
if (rows.length !== cases.length * pathCounts.length * workersList.length || rows.some(r => r.ms < 0 || !["READY", "INSUFFICIENT"].includes(r.status))) process.exit(1);
