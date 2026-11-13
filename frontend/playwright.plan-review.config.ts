import {defineConfig} from "@playwright/test";
import base from "./playwright.remaining-sync.config";
export default defineConfig({...base,testMatch:["user-plan-review.spec.ts","user-plan-sync.spec.ts","user-goal-sync.spec.ts","user-remaining-sync.spec.ts"],outputDir:"../.tmp/user-plan-review",webServer:Array.isArray(base.webServer)?base.webServer.map((server,i)=>i===0?{...server,command:"node scripts/plan-review-preview.mjs"}:server):base.webServer});
