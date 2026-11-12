import { defineConfig } from "@playwright/test";
import base from "./playwright.plan-review.config";

const origin = "http://127.0.0.1:61071";
process.env.USER_DISCOVERY_API = "http://127.0.0.1:61072";
export default defineConfig({
  ...base,
  testMatch: ["user-money-explanations.spec.ts", "user-finance-hub-sync.spec.ts"],
  outputDir: "../.tmp/user-money-explanations",
  use: { ...base.use, baseURL: origin },
  webServer: [
    { command: "node scripts/plan-review-preview.mjs", url: origin, reuseExistingServer: false, timeout: 120000,
      env: { USER_PLAN_PREVIEW_PORT: "61071", USER_PLAN_PREVIEW_BUNDLE: "money-explanations-dist" } },
    { command: "node scripts/discovery-ui-test-server.cjs", cwd: "../backend", url: `${process.env.USER_DISCOVERY_API}/__fixture/ready`, reuseExistingServer: false, timeout: 60000,
      env: { USER_UI_API_PORT: "61072", USER_UI_PREVIEW_ORIGIN: origin } },
  ],
});
