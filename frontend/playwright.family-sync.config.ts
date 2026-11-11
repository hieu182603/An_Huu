import { defineConfig } from "@playwright/test";
import insurance from "./playwright.insurance-sync.config";
export default defineConfig({ ...insurance,
  testMatch: [...(insurance.testMatch as string[]), "user-family-sync.spec.ts"],
  outputDir: "../.tmp/user-family-sync",
});
