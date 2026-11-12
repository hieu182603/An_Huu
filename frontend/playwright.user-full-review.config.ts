import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";
import base from "./playwright.user-sync.config";

const origin = "http://127.0.0.1:62111";
const apiMode = process.env.USER_FULL_REVIEW_API_MODE;
const phase = apiMode === "cashflow" ? "user-logic-money-final" : process.env.USER_FULL_REVIEW_PHASE === "logic-final" ? "user-logic-review-final" : process.env.USER_FULL_REVIEW_PHASE === "logic" ? "user-logic-review" : process.env.USER_FULL_REVIEW_PHASE === "final" ? "user-full-review-final" : "user-full-review";
process.env.USER_DISCOVERY_API = "http://127.0.0.1:62112";
process.env.USER_CASHFLOW_API = "http://127.0.0.1:62114";
const reviewServers: NonNullable<PlaywrightTestConfig["webServer"]> = [
  // Reuse only a review bundle already built and fingerprint-checked in the same review.
  { command: process.env.USER_FULL_REVIEW_EXISTING_BUNDLE === "1" ? "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 62111 --strictPort --outDir ../.tmp/user-full-review-dist" : "node scripts/plan-review-preview.mjs", url: origin, reuseExistingServer: false, timeout: 120000,
    env: { USER_PLAN_PREVIEW_PORT: "62111", USER_PLAN_PREVIEW_BUNDLE: "user-full-review-dist" } },
  { command: "node scripts/discovery-ui-test-server.cjs", cwd: "../backend", url: `${process.env.USER_DISCOVERY_API}/__fixture/ready`, reuseExistingServer: false, timeout: 60000,
    env: { USER_UI_API_PORT: "62112", USER_UI_PREVIEW_ORIGIN: origin } },
  { command: "node scripts/cashflow-ui-test-server.cjs", cwd: "../backend", url: `${process.env.USER_CASHFLOW_API}/__fixture/ready`, reuseExistingServer: false, timeout: 60000,
    env: { USER_UI_API_PORT: "62114", USER_UI_PREVIEW_ORIGIN: origin } },
];

export default defineConfig({
  ...base,
  testMatch: [
    "user-logic-crossflow.spec.ts",
    "user-dashboard-sync.spec.ts", "user-finance-hub-sync.spec.ts",
    "user-cashflow-sync.spec.ts", "user-assets-sync.spec.ts", "user-debts-sync.spec.ts",
    "user-insurance-sync.spec.ts", "user-family-sync.spec.ts", "user-planning-sync.spec.ts",
    "user-goal-sync.spec.ts", "user-plan-sync.spec.ts", "user-plan-review.spec.ts",
    "user-plan-demo-sync.spec.ts", "user-money-explanations.spec.ts",
    "user-allocation-sync.spec.ts", "portfolio-policy-v2.spec.ts",
    "user-products-sync.spec.ts", "user-products-tools-extra.spec.ts", "user-knowledge-sync.spec.ts",
    "user-remaining-sync.spec.ts", "assistant-detail-fixes.spec.ts", "account-api.spec.ts",
    "future-cashflows-detail.spec.ts", "user-post-login-audit.spec.ts",
  ],
  outputDir: `../.tmp/${phase}`,
  reporter: [["list"], ["json", { outputFile: `../.tmp/${phase}-results.json` }]],
  use: { ...base.use, baseURL: origin },
  webServer: reviewServers.filter((_, index) => index === 0 || !["discovery", "cashflow"].includes(apiMode ?? "") || index === (apiMode === "discovery" ? 1 : 2)),
});
