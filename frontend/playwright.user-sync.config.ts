import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "user-dashboard-sync.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: "../.tmp/user-dashboard-sync",
  use: { baseURL: "http://127.0.0.1:55441", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 55441 --strictPort", url: "http://127.0.0.1:55441", reuseExistingServer: !process.env.CI, timeout: 60000 },
});
