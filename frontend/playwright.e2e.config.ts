import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /e2e-tier[1-4].*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  globalSetup: "./tests/setup-preview.ts",
  use: {
    baseURL: "http://127.0.0.1:8444",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
    navigationTimeout: 60000,
  },
});
