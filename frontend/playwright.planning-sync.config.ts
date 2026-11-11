import { defineConfig } from "@playwright/test";
import family from "./playwright.family-sync.config";
export default defineConfig({ ...family,
  testMatch: [...(family.testMatch as string[]), "user-planning-sync.spec.ts"],
  outputDir: "../.tmp/user-planning-sync",
});
