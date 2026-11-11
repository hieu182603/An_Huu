import{defineConfig}from"@playwright/test";
import base from"./playwright.discovery-sync.config";
export default defineConfig({...base,testMatch:["user-goal-sync.spec.ts","user-plan-sync.spec.ts","user-remaining-sync.spec.ts","assistant-detail-fixes.spec.ts","account-api.spec.ts","future-cashflows-detail.spec.ts"],outputDir:"../.tmp/user-remaining-sync",webServer:Array.isArray(base.webServer)?base.webServer.map((server,i)=>i===0&&process.env.USER_SYNC_USE_BUILD?{...server,command:"npm run preview -- --host 127.0.0.1 --port 55441 --strictPort"}:server):base.webServer});
