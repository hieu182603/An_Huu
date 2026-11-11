import { defineConfig } from "@playwright/test";
import userSync from "./playwright.user-sync.config";

export default defineConfig({
  ...userSync,
  testMatch: ["user-finance-hub-sync.spec.ts", "user-dashboard-sync.spec.ts"],
  outputDir: "../.tmp/user-finance-hub-sync",
});
