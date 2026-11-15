import { defineConfig } from "@playwright/test";
import base from "./playwright.family-sync.config";
const origin = "http://127.0.0.1:18553";
process.env.USER_CASHFLOW_API = "http://127.0.0.1:18554";
export default defineConfig({ ...base,
  outputDir: "../.tmp/frontend-finance-review",
  use: { ...base.use, baseURL: origin },
  webServer: [
    { command: "node scripts/plan-review-preview.mjs", url: origin, reuseExistingServer: false, timeout: 120000,
      env: { USER_PLAN_PREVIEW_PORT: "18553", USER_PLAN_PREVIEW_BUNDLE: "frontend-finance-review-dist" } },
    { command: "node scripts/cashflow-ui-test-server.cjs", cwd: "../backend", url: "http://127.0.0.1:18554/__fixture/ready", reuseExistingServer: false, timeout: 60000,
      env: { USER_UI_API_PORT: "18554", USER_UI_PREVIEW_ORIGIN: origin } },
  ],
});
