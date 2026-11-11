import { defineConfig } from "@playwright/test";
import cashflow from "./playwright.cashflow-sync.config";
export default defineConfig({ ...cashflow,
  testMatch: ["user-assets-sync.spec.ts", "user-cashflow-sync.spec.ts", "user-dashboard-sync.spec.ts", "user-finance-hub-sync.spec.ts"],
  outputDir: "../.tmp/user-assets-sync",
});
