import {expect,test,type Page,type APIRequestContext} from "@playwright/test";
import {setupDiscovery,discoveryApi} from "./discovery-helpers";
test.afterEach(async({page})=>{await page.goto("about:blank");await page.unrouteAll({behavior:"wait"});});

async function setup(page:Page,request:APIRequestContext,noMarket=false){
 const state=await setupDiscovery(page,request,"/user/risk-portfolio",{customAllocation:true,noMarket},true);
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();
 await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();
 await expect(page.locator(".allocation-experiment")).toBeVisible();
 // Like the demo, the adjust-the-weights card starts collapsed on narrow screens.
 const custom=page.locator(".allocation-custom");if(await custom.getAttribute("open")===null)await custom.locator(":scope > summary").click();return state;
}
test("custom edit is validated, simulated, invalidated and carried unchanged into a plan draft",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");
 const stocks=lab.getByRole("spinbutton").last();await stocks.fill("30");
 await lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true}).click();
 await expect(lab.locator(".allocation-tested thead th").filter({hasText:"Tự chọn"})).toHaveCount(1);
 const run=state.writes.find(w=>w.path.endsWith("risk/selection")&&w.body.trialAllocation?.weights.some((r:{assetClass:string;weightPercent:string})=>r.assetClass==="STOCK"&&r.weightPercent==="30"));expect(run?.status).toBe(200);expect(run?.body.detail).toBe("ALLOCATION_V2");
 expect(run?.body.trialAllocation.weights.find((r:{assetClass:string})=>r.assetClass==="STOCK").weightPercent).toBe("30");
 await expect(lab.getByRole("button",{name:"Xem kế hoạch với tỷ trọng này",exact:true})).toBeEnabled();
 await stocks.fill("20");await expect(lab.locator(".allocation-tested")).toHaveCount(0);
 await lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true}).click();await expect(lab.getByRole("button",{name:"Xem kế hoạch với tỷ trọng này",exact:true})).toBeEnabled();
 await lab.getByRole("button",{name:"Gợi ý gói đầu tư cho tỷ trọng tự chọn",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("Gói chi phí thấp");
 const packageRun=state.writes.filter(w=>w.path.endsWith("workspace/packages")).at(-1);expect(packageRun?.body.customAllocation.weights.find((r:{assetClass:string})=>r.assetClass==="STOCK").weightPercent).toBe("20");
 await page.keyboard.press("Escape");
 await lab.getByRole("button",{name:"Thử biến cố với tỷ trọng tự chọn",exact:true}).click();await expect(page.getByRole("dialog").locator("tbody tr")).not.toHaveCount(0);
 const stressRun=state.writes.filter(w=>w.path.endsWith("risk/scenarios")).at(-1);expect(stressRun?.body.plan.preview.customAllocation.weights.find((r:{assetClass:string})=>r.assetClass==="STOCK").weightPercent).toBe("20");
 await page.keyboard.press("Escape");
 await lab.getByRole("button",{name:"Xem kế hoạch với tỷ trọng này",exact:true}).click();
 // Like the demo, choosing applies to the plan draft and stays on the page.
 await expect(page.locator(".allocation-applied")).toContainText("bản xem trước");await expect(page).toHaveURL(/\/user\/risk-portfolio/);
 const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("anhuu:plan-draft:USR-001")??"null"));
 expect(draft.customAllocation.weights.find((r:{assetClass:string})=>r.assetClass==="STOCK").weightPercent).toBe("20");expect(draft.allocationFunding).toBe("PROTECTED_CAPITAL_V1");expect(state.errors).toEqual([]);
});
test("missing market history stays unavailable and cannot apply untested custom weights",async({page,request})=>{
 const state=await setup(page,request,true),lab=page.locator(".allocation-experiment");
 await lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true}).click();await expect(lab.getByRole("status").filter({hasText:"Chưa có bộ dữ liệu thị trường tháng"})).toBeVisible();
 await expect(lab.locator(".allocation-tested")).toHaveCount(0);await expect(lab.locator(".allocation-success-track")).toHaveCount(0);expect(state.errors).toEqual([]);
});

test("failed live checks stop loading and allow retry without losing the reference",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");
 await expect(lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true})).toBeEnabled();
 let fail=true;
 await page.route("**/api/v1/me/portfolio-policies/workspace/preview",route=>route.request().postDataJSON().customAllocation&&fail?route.fulfill({status:503,json:{error:{message:"Không kiểm tra được tỷ trọng trong lượt thử"}}}):route.fallback());
 await lab.getByRole("spinbutton").last().fill("30");
 const check=lab.locator(".allocation-check");
 await expect(check).toContainText("Chưa kiểm tra được tỷ trọng");
 await expect(check).not.toContainText("Đang kiểm tra");
 await expect(lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true})).toBeDisabled();
 fail=false;await check.getByRole("button",{name:"Thử kiểm tra lại",exact:true}).click();
 await expect(check).toContainText("Đạt kiểm tra ràng buộc ban đầu");
 await expect(lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true})).toBeEnabled();
 expect(state.errors).toEqual([]);
});

test("initial recommendation avoids custom previews and an unnecessary custom simulation",async({page,request})=>{
 const calls:Array<{kind:string;ms:number;trial:boolean}>=[],started=new Map<object,number>();
 page.on("request",r=>{if(/workspace\/preview|risk\/selection/.test(r.url()))started.set(r,Date.now());});
 page.on("response",r=>{const start=started.get(r.request());if(start!==undefined){const body=r.request().postDataJSON();calls.push({kind:r.url().includes("risk/selection")?"selection":body.customAllocation?"custom-preview":"workspace-preview",ms:Date.now()-start,trial:Boolean(body.trialAllocation)});}});
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");
 await expect(lab.locator(".allocation-reference").getByRole("button",{name:"Dùng phương án này để xem trước",exact:true})).toBeEnabled();
 await expect(lab.locator(".allocation-check")).toContainText("Đạt kiểm tra ràng buộc ban đầu");
 expect(calls.filter(c=>c.kind==="custom-preview")).toHaveLength(0);
 expect(calls.filter(c=>c.kind==="selection")).toHaveLength(1);
 expect(calls.find(c=>c.kind==="selection")?.trial).toBe(false);
 await expect(lab.locator(".allocation-tested")).toHaveCount(0);
 await lab.getByRole("button",{name:"Về tỷ trọng đề xuất ↺",exact:true}).click();
 await expect(lab.locator(".allocation-check")).toContainText("Đạt kiểm tra ràng buộc ban đầu");
 await lab.getByRole("button",{name:"Về tỷ trọng đề xuất ↺",exact:true}).click();
 await expect(lab.locator(".allocation-check")).not.toContainText("Đang kiểm tra");
 console.log("Allocation fixture timings (ms):",JSON.stringify(calls));
 expect(state.errors).toEqual([]);
});

test("demo reference stays visible while custom weights change and failed calculations can be retried",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment"),reference=lab.locator(".allocation-reference");
 const useReference=reference.getByRole("button",{name:"Dùng phương án này để xem trước",exact:true});
 await expect(useReference).toBeEnabled();
 const before=(await reference.locator(".allocation-success-grid").textContent())!;
 const heading=await reference.getByRole("heading").innerText();
 await lab.getByRole("spinbutton").last().fill("30");
 await expect(reference.getByRole("heading")).toHaveText(heading);
 await expect(reference.locator(".allocation-success-grid")).toHaveText(before);
 await expect(useReference).toBeEnabled();
 let fail=true;
 await page.route("**/api/v1/me/retirement/risk/selection",route=>fail?route.fulfill({status:503,json:{error:{message:"Phép thử tạm thời không khả dụng"}}}):route.fallback());
 await lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true}).click();
 const error=lab.getByRole("alert");await expect(error).toContainText("Phép thử tạm thời không khả dụng");
 await expect(reference.locator(".allocation-success-grid")).toHaveText(before);
 expect((await error.boundingBox())!.y).toBeLessThan((await reference.boundingBox())!.y);
 fail=false;await error.getByRole("button",{name:"Thử tính lại",exact:true}).click();
 await expect(error).toHaveCount(0);await expect(lab.locator(".allocation-tested")).toBeVisible();
 expect(state.errors).toEqual([]);
});
test("reference rationale follows the reference returned by selection rather than the original template",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");await expect(lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true})).toBeEnabled();
 await page.route("**/api/v1/me/retirement/risk/selection",async route=>{
  const response=await route.fetch({url:discoveryApi+"/api/v1/me/retirement/risk/selection",headers:{...route.request().headers(),Authorization:`Bearer ${state.fixture.accessToken}`}});
  const body=await response.json();expect(body.data.candidates.find((r:{id:string})=>r.id==="HIGHER_EQUITY")?.selection).toBeTruthy();body.data.referenceId="HIGHER_EQUITY";await route.fulfill({response,json:body});
 });
 await lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true}).click();await expect(lab.getByRole("button",{name:"Dùng phương án này để xem trước",exact:true})).toBeEnabled();
 await expect(page.locator(".allocation-result-why")).toContainText("34.352.000");await expect(page.locator(".allocation-result-why > ol")).not.toContainText("18.080.000");await expect(page.locator(".allocation-why-table tr.is-current")).toContainText("34.352.000");expect(state.errors).toEqual([]);
});
test("package favorites and product detail open the actual catalog records",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");
 await expect(lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true})).toBeEnabled();
 await lab.getByRole("button",{name:"Gợi ý gói đầu tư phù hợp",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"Lưu gói chi phí thấp",exact:true}).first().click();
 await expect(dialog.getByRole("status")).toContainText("Đã lưu quan tâm");
 const saved=await state.get("me/saved-products");expect(saved.some((row:{id:string})=>row.id===state.fixture.products[0].id)).toBe(true);
 await dialog.getByRole("link",{name:"Xem chi tiết: Sản phẩm kiểm thử 01",exact:true}).first().click();await expect(page).toHaveURL(/\/user\/explore\?product=/);
 await expect(page.getByRole("heading",{name:"Sản phẩm kiểm thử 01",level:1})).toBeVisible();expect(state.errors).toEqual([]);
});
for(const [name,width,height] of [["desktop",1440,1000],["tablet",768,1024],["mobile",390,844],["small",320,740],["landscape",844,390]] as const){
 test(`custom controls and package dialog fit ${name}`,async({page,request},info)=>{
  await page.setViewportSize({width,height});const state=await setup(page,request),lab=page.locator(".allocation-experiment");
  await expect(lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath("allocation-custom.png"),fullPage:true});
  await lab.getByRole("button",{name:/Lợi suất đường cơ sở/}).first().click();await expect(page.getByRole("dialog")).toContainText("Danh nghĩa năm");await expect(page.getByRole("dialog")).toContainText("Hiệu dụng năm");await page.keyboard.press("Escape");
  const trigger=lab.getByRole("button",{name:"Gợi ý gói đầu tư phù hợp",exact:true});await trigger.click();await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(1);await expect(page.getByRole("dialog")).toContainText("Tối thiểu");
  await expect(page.getByRole("dialog")).toContainText("Sản phẩm kiểm thử 01");await expect(page.getByRole("dialog")).toContainText("Gói chi phí thấp");
  expect(await page.getByRole("dialog").evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})).toBe(true);
  await page.screenshot({path:info.outputPath("allocation-packages.png")});await page.keyboard.press("Escape");await expect(trigger).toBeFocused();expect(state.errors).toEqual([]);
 });
}
