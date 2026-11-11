import {defineConfig} from "@playwright/test";
import base from "./playwright.discovery-sync.config";
export default defineConfig({...base,testMatch:["user-allocation-sync.spec.ts","portfolio-policy-v2.spec.ts","user-products-sync.spec.ts","user-knowledge-sync.spec.ts"],outputDir:"../.tmp/user-allocation-sync"});
