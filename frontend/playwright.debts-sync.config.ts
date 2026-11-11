import { defineConfig } from "@playwright/test";
import cashflow from "./playwright.cashflow-sync.config";
export default defineConfig({ ...cashflow,
  testMatch: ["user-debts-sync.spec.ts", "user-assets-sync.spec.ts", "user-cashflow-sync.spec.ts", "user-dashboard-sync.spec.ts", "user-finance-hub-sync.spec.ts"],
  outputDir: "../.tmp/user-debts-sync",
  // Exercise the production bundle and avoid thousands of dev-module requests
  // exhausting Chromium's network buffers during the full regression suite.
  webServer: [
    { command: "npm run build && npm run preview -- --host 127.0.0.1 --port 55441 --strictPort", url: "http://127.0.0.1:55441", reuseExistingServer: false, timeout: 120000 },
    { command: "node scripts/cashflow-ui-test-server.cjs", cwd: "../backend", url: "http://127.0.0.1:55442/__fixture/ready", reuseExistingServer: false, timeout: 60000 },
  ],
});
