import { defineConfig } from "@playwright/test";
import assets from "./playwright.assets-sync.config";
const origin = "http://127.0.0.1:61271";
process.env.USER_CASHFLOW_API = "http://127.0.0.1:61272";

// Asset/cashflow specs need their own fixture protocol, not discovery reset.
export default defineConfig({
  ...assets,
  use: { ...assets.use, baseURL: origin },
  outputDir: "../.tmp/user-money-assets",
  webServer: [
    { command: "node scripts/plan-review-preview.mjs", url: origin, reuseExistingServer: false, timeout: 120000,
      env: { USER_PLAN_PREVIEW_PORT: "61271", USER_PLAN_PREVIEW_BUNDLE: "money-assets-dist" } },
    { command: "node scripts/cashflow-ui-test-server.cjs", cwd: "../backend", url: `${process.env.USER_CASHFLOW_API}/__fixture/ready`, reuseExistingServer: false, timeout: 60000,
      env: { USER_UI_API_PORT: "61272", USER_UI_PREVIEW_ORIGIN: origin } },
  ],
});
