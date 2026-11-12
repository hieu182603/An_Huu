import { defineConfig } from "@playwright/test";
import base from "./playwright.user-sync.config";
export default defineConfig({ ...base,
  testMatch: ["user-products-sync.spec.ts", "user-products-tools-extra.spec.ts", "user-knowledge-sync.spec.ts"],
  outputDir: "../.tmp/user-discovery-sync",
  webServer: [
    { command: "npm run build && npm run preview -- --host 127.0.0.1 --port 55441 --strictPort", url: "http://127.0.0.1:55441", reuseExistingServer: false, timeout: 120000 },
    { command: "node scripts/discovery-ui-test-server.cjs", cwd: "../backend", url: "http://127.0.0.1:55442/__fixture/ready", reuseExistingServer: false, timeout: 60000 },
  ],
});
