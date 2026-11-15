import { defineConfig } from "@playwright/test";
export default defineConfig({
 testDir: "./tests", testMatch: ["quick-onboarding.spec.ts", "guided-planning.spec.ts", "demo-main-pages.spec.ts"],
 outputDir: "../artifacts/demo-parity/tests", workers: 1, timeout: 30000,
 use: { baseURL: "http://127.0.0.1:18443", viewport: {width:1440,height:1000}, trace: "retain-on-failure" },
 webServer: {command:"node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 18443",url:"http://127.0.0.1:18443",timeout:60000,reuseExistingServer:false},
});
