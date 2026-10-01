import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:8444",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    navigationTimeout: 60000,
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 8444 --strictPort",
    url: "http://127.0.0.1:8444",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
