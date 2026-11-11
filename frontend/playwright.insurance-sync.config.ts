import { defineConfig } from "@playwright/test";
import debts from "./playwright.debts-sync.config";
export default defineConfig({ ...debts,
  testMatch: [...(debts.testMatch as string[]), "user-insurance-sync.spec.ts"],
  outputDir: "../.tmp/user-insurance-sync",
});
