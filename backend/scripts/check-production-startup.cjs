const { spawnSync } = require("node:child_process");
const env = { ...process.env, NODE_ENV: "production", JWT_SECRET: "", JWT_REFRESH_SECRET: "",
  DATABASE_URL: "postgresql://do-not-print:do-not-print@127.0.0.1:1/unused", CLIENT_URL: "https://app.example.test" };
const result = spawnSync(process.execPath, ["dist/server.js"], { env, encoding: "utf8", timeout: 5000 });
if (result.status !== 1 || result.error || (result.stdout + result.stderr).includes("do-not-print")) {
  throw new Error("Production must reject missing secrets before connecting without leaking config.");
}
console.log("Production startup without secrets: rejected safely (no database connection).");
