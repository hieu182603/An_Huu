import { defineConfig } from "@playwright/test";
import base from "./playwright.money-explanations.config";
const origin="http://127.0.0.1:62011";
process.env.USER_DISCOVERY_API="http://127.0.0.1:62012";
export default defineConfig({
  ...base,
  testMatch:["user-plan-demo-sync.spec.ts","user-plan-review.spec.ts","user-plan-sync.spec.ts","user-goal-sync.spec.ts","user-money-explanations.spec.ts"],
  outputDir:"../.tmp/user-plan-demo-sync",
  use:{...base.use,baseURL:origin},
  webServer:[
    {command:"node scripts/plan-review-preview.mjs",url:origin,reuseExistingServer:false,timeout:120000,env:{USER_PLAN_PREVIEW_PORT:"62011",USER_PLAN_PREVIEW_BUNDLE:"plan-demo-sync-dist"}},
    {command:"node scripts/discovery-ui-test-server.cjs",cwd:"../backend",url:`${process.env.USER_DISCOVERY_API}/__fixture/ready`,reuseExistingServer:false,timeout:60000,env:{USER_UI_API_PORT:"62012",USER_UI_PREVIEW_ORIGIN:origin}},
  ],
});
