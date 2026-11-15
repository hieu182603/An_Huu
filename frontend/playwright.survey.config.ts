import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["survey-demo-parity.spec.ts", "customer-retirement-feedback.spec.ts"],
  outputDir: "../artifacts/survey-parity-2026-11-14/fix-tests",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:18451", viewport: { width: 1440, height: 1000 }, actionTimeout: 10000, trace: "retain-on-failure" },
  webServer: [
    { command: "node scripts/survey-ui-test-server.cjs", cwd: "../backend", env: { SURVEY_UI_API_PORT: "18452", SURVEY_UI_ORIGIN: "http://127.0.0.1:18451" }, url: "http://127.0.0.1:18452/__fixture/ready", timeout: 90000, reuseExistingServer: false },
    { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 18451", url: "http://127.0.0.1:18451", timeout: 60000, reuseExistingServer: false },
  ],
});
