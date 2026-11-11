import { defineConfig } from "@playwright/test";
import base from "./playwright.remaining-sync.config";

export default defineConfig({
  ...base,
  testMatch: [
    ...(base.testMatch as string[]),
    "user-allocation-sync.spec.ts", "portfolio-policy-v2.spec.ts",
    "user-products-sync.spec.ts", "user-knowledge-sync.spec.ts",
    "user-post-login-audit.spec.ts",
    "user-dashboard-sync.spec.ts",
  ],
  outputDir: "../.tmp/user-post-login-audit",
});
