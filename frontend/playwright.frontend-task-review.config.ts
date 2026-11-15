import { defineConfig } from "@playwright/test";
import base from "./playwright.plan-review.config";
export default defineConfig({ ...base,
  testMatch: ["frontend-task-review.spec.ts", "user-plan-sync.spec.ts", "user-plan-review.spec.ts", "user-goal-sync.spec.ts",
    "user-remaining-sync.spec.ts", "user-allocation-sync.spec.ts", "portfolio-policy-v2.spec.ts", "user-allocation-result-demo.spec.ts",
    "quick-onboarding.spec.ts", "guided-planning.spec.ts"],
  outputDir: "../.tmp/frontend-task-review",
  webServer: Array.isArray(base.webServer) ? base.webServer.map((server, i) => i === 0
    ? { ...server, env: { ...server.env, USER_PLAN_PREVIEW_BUNDLE: "frontend-task-review-dist" } } : server) : base.webServer,
});
