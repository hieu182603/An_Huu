import { defineConfig } from "@playwright/test";

process.env.USER_DISCOVERY_API = "http://127.0.0.1:62412";
const origin = "http://127.0.0.1:62411";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["user-allocation-sync.spec.ts", "portfolio-policy-v2.spec.ts", "user-allocation-result-demo.spec.ts"],
  fullyParallel: false, workers: 1, timeout: 45000, expect: { timeout: 10000 },
  outputDir: "../.tmp/allocation-result-review",
  reporter: [["list"], ["json", { outputFile: "../.tmp/allocation-result-review-results.json" }]],
  use: { baseURL: origin, viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: [
    { command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 62411 --strictPort --outDir ../.tmp/allocation-result-review-dist", url: origin, reuseExistingServer: false },
    { command: "node scripts/discovery-ui-test-server.cjs", cwd: "../backend", url: `${process.env.USER_DISCOVERY_API}/__fixture/ready`, reuseExistingServer: false, timeout: 60000,
      env: { USER_UI_API_PORT: "62412", USER_UI_PREVIEW_ORIGIN: origin } },
  ],
});
