import type {Page,APIRequestContext} from "@playwright/test";
import {setupDiscovery} from "./discovery-helpers";
export async function setupRemaining(page:Page,request:APIRequestContext,path="/user/plan",options:object={}){const s=await setupDiscovery(page,request,"/user/risk-portfolio",{remaining:true,savedPlan:true,notifications:35,...options});await page.goto(path);return s;}
