import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e-tier5-challenger-m2.spec.ts"],
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:8455",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 8455 --strictPort",
    url: "http://127.0.0.1:8455",
    reuseExistingServer: true,
  },
});
