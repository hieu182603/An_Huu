import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests", testMatch: "investment-runtime.spec.ts", workers: 1, fullyParallel: false, timeout: 90000,
  outputDir: "../.tmp/remediation/browser-results", reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:55441", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" } });
