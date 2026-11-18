import { defineConfig } from "@playwright/test";

// Admin allocation parameter forms. All API traffic is mocked in the spec with
// page.route; the dev server is only used to serve the SPA (no build needed).
const origin = "http://127.0.0.1:62471";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["admin-allocation-params.spec.ts"],
  fullyParallel: false, workers: 1, timeout: 90000, expect: { timeout: 15000 },
  outputDir: "../.tmp/admin-params-review",
  reporter: [["list"]],
  use: { baseURL: origin, viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 62471 --strictPort", url: origin, reuseExistingServer: false, timeout: 120000 },
});
