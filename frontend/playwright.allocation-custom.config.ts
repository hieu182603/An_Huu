import config from "./playwright.allocation-result-review.config";
import {defineConfig} from "@playwright/test";
export default defineConfig({...config,testMatch:["user-allocation-custom.spec.ts"],outputDir:"../.tmp/allocation-custom-review",reporter:[["list"],["json",{outputFile:"../.tmp/allocation-custom-results.json"}]],webServer:Array.isArray(config.webServer)?config.webServer.map(server=>({...server,env:{...server.env,NODE_ENV:"test"}})):config.webServer});
