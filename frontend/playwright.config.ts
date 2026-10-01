import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:8444",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 8444 --strictPort",
    url: "http://127.0.0.1:8444",
    reuseExistingServer: !process.env.CI,
  },
});
