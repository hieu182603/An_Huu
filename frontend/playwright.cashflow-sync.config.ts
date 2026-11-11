import { defineConfig } from "@playwright/test";
import userSync from "./playwright.user-sync.config";

export default defineConfig({
  ...userSync,
  testMatch: "user-cashflow-sync.spec.ts",
  outputDir: "../.tmp/user-cashflow-sync",
  webServer: [
    userSync.webServer as NonNullable<typeof userSync.webServer> & { command: string },
    { command: "node scripts/cashflow-ui-test-server.cjs", cwd: "../backend", url: "http://127.0.0.1:55442/__fixture/ready", reuseExistingServer: false, timeout: 60000 },
  ],
});
