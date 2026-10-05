const {defineConfig}=require('../../frontend/node_modules/@playwright/test');
module.exports=defineConfig({testDir:'../../frontend/tests',testMatch:process.env.T12_SPEC?[process.env.T12_SPEC.trim()]:(process.env.T12_BROWSER_EXTENDED==='1'?['auth-api.spec.ts','account-api.spec.ts','financial-profile.spec.ts','knowledge.spec.ts','admin-ui.spec.ts','responsive.spec.ts']:['auth-api.spec.ts','account-api.spec.ts']),fullyParallel:false,workers:1,timeout:30000,globalTimeout:900000,
 outputDir:'../.cache/t12-browser-artifacts',reporter:[['list'],['json',{outputFile:'../.cache/t12-browser-results.json'}]],
 use:{baseURL:process.env.T12_BROWSER_URL,viewport:{width:1440,height:1000},trace:'retain-on-failure',navigationTimeout:15000}});
