import { expect, type Page, type APIRequestContext } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
export const discoveryApi = process.env.USER_DISCOVERY_API ?? "http://127.0.0.1:55442";
export async function setupDiscovery(page: Page, request: APIRequestContext, path: string, changes: object = {}, initialAllocationSurvey = false) {
  const response = await request.post(`${discoveryApi}/__fixture/reset`, { data: changes }); expect(response.ok()).toBeTruthy(); const fixture = await response.json();
  await page.route("**/api/v1/**", route => route.fulfill({ status:503,json:{error:{code:"UNMOCKED_API",message:"No discovery fixture"}} }));
  await installRouteAuth(page,"USR-001",fixture.accessToken); await installFinancialProfileRoutes(page,{profile:fixture.profile});
  await page.route("**/api/v1/me/retirement/plans**",route=>route.fulfill({json:{data:{items:[],page:1,limit:50,total:0}}}));
  await page.route("**/socket.io/**",route=>route.abort());await page.routeWebSocket(/socket\.io/,ws=>ws.close());
  const writes:Array<{path:string;method:string;body:any;status:number}>=[],errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  if((changes as {remaining?:boolean}).remaining)await page.route(/\/api\/v1\/me(?:$|[/?])/,async route=>{
    const outgoing=route.request(),url=new URL(outgoing.url());const result=await route.fetch({url:discoveryApi+url.pathname+url.search,headers:{...outgoing.headers(),Authorization:`Bearer ${fixture.accessToken}`}});
    if(outgoing.method()!=="GET")writes.push({path:url.pathname,method:outgoing.method(),body:outgoing.postDataJSON(),status:result.status()});await route.fulfill({response:result});
  });
  await page.route(/\/api\/v1\/(products|content|content-facets|me\/(saved-products|saved-articles|saved-content|products|product-tools|support|portfolio-policies|assumptions|financial-profile)|investments\/recommendations)([/?]|$)/,async route=>{
    const outgoing=route.request(),url=new URL(outgoing.url());const result=await route.fetch({url:discoveryApi+url.pathname+url.search,headers:{...outgoing.headers(),Authorization:`Bearer ${fixture.accessToken}`}});
    if(outgoing.method()!=="GET")writes.push({path:url.pathname,method:outgoing.method(),body:outgoing.postDataJSON(),status:result.status()});await route.fulfill({response:result});
  });
  if(initialAllocationSurvey) await page.addInitScript(command=>{
    sessionStorage.setItem("anhuu:plan-draft:USR-001",JSON.stringify({policyVersionId:command.policyVersionId,answers:command.answers,endMonth:command.endMonth,liquidityNeedMonths:command.liquidityNeedMonths}));
  },fixture.allocationCommand);
  await page.goto(path);await expect(page.locator(path.includes("risk-portfolio")?".risk-portfolio-page":".discovery-page")).toBeVisible();
  const get=async(path:string)=>(await(await request.get(`${discoveryApi}/api/v1/${path}`,{headers:{Authorization:`Bearer ${fixture.accessToken}`}})).json()).data;
  return{fixture,writes,errors,get};
}
