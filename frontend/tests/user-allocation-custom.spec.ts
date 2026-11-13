import {expect,test,type Page,type APIRequestContext} from "@playwright/test";
import {setupDiscovery,discoveryApi} from "./discovery-helpers";
test.afterEach(async({page})=>{await page.goto("about:blank");await page.unrouteAll({behavior:"wait"});});

async function setup(page:Page,request:APIRequestContext,noMarket=false){
 const state=await setupDiscovery(page,request,"/user/risk-portfolio",{customAllocation:true,noMarket},true);
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();
 await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();
 await expect(page.locator(".allocation-experiment")).toBeVisible();return state;
}
test("custom edit is validated, simulated, invalidated and carried unchanged into a plan draft",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");
 const stocks=lab.getByRole("spinbutton").last();await stocks.fill("30");
 await lab.getByRole("button",{name:"Kiểm tra và so sánh",exact:true}).click();
 await expect(lab.locator("tbody tr").filter({hasText:"Tự chọn"})).toHaveCount(1);
 const run=state.writes.find(w=>w.path.endsWith("risk/selection")&&w.body.trialAllocation?.weights.some((r:{assetClass:string;weightPercent:string})=>r.assetClass==="STOCK"&&r.weightPercent==="30"));expect(run?.status).toBe(200);expect(run?.body.detail).toBe("ALLOCATION_V2");
 expect(run?.body.trialAllocation.weights.find((r:{assetClass:string})=>r.assetClass==="STOCK").weightPercent).toBe("30");
 await expect(lab.getByRole("button",{name:"Chọn tỷ trọng tự chọn",exact:true})).toBeEnabled();
 await stocks.fill("20");await expect(lab.locator("tbody tr")).toHaveCount(0);await expect(lab.getByRole("button",{name:"Chọn tỷ trọng tự chọn",exact:true})).toBeDisabled();
 await lab.getByRole("button",{name:"Kiểm tra và so sánh",exact:true}).click();await expect(lab.getByRole("button",{name:"Chọn tỷ trọng tự chọn",exact:true})).toBeEnabled();
 await lab.getByRole("button",{name:"Gợi ý gói cho tỷ trọng tự chọn",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("Gói A");
 const packageRun=state.writes.filter(w=>w.path.endsWith("workspace/packages")).at(-1);expect(packageRun?.body.customAllocation.weights.find((r:{assetClass:string})=>r.assetClass==="STOCK").weightPercent).toBe("20");
 await page.keyboard.press("Escape");
 await lab.getByRole("button",{name:"Thử biến cố với tỷ trọng tự chọn",exact:true}).click();await expect(page.getByRole("dialog").locator("tbody tr")).not.toHaveCount(0);
 const stressRun=state.writes.filter(w=>w.path.endsWith("risk/scenarios")).at(-1);expect(stressRun?.body.plan.preview.customAllocation.weights.find((r:{assetClass:string})=>r.assetClass==="STOCK").weightPercent).toBe("20");
 await page.keyboard.press("Escape");
 await lab.getByRole("button",{name:"Chọn tỷ trọng tự chọn",exact:true}).click();
 await expect(page.getByRole("dialog")).toContainText("904.000.000");
 await page.getByRole("button",{name:"Xác nhận dùng trong bản nháp",exact:true}).click();await expect(page).toHaveURL(/\/user\/plan/);
 const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("anhuu:plan-draft:USR-001")??"null"));
 expect(draft.customAllocation.weights.find((r:{assetClass:string})=>r.assetClass==="STOCK").weightPercent).toBe("20");expect(draft.allocationFunding).toBe("PROTECTED_CAPITAL_V1");expect(state.errors).toEqual([]);
});
test("missing market history stays unavailable and cannot apply untested custom weights",async({page,request})=>{
 const state=await setup(page,request,true),lab=page.locator(".allocation-experiment");
 await lab.getByRole("button",{name:"Kiểm tra và so sánh",exact:true}).click();await expect(lab.getByRole("status")).toContainText("Chưa có bộ dữ liệu thị trường tháng");
 await expect(lab.getByRole("button",{name:"Chọn tỷ trọng tự chọn",exact:true})).toBeDisabled();await expect(lab.locator("meter")).toHaveCount(0);expect(state.errors).toEqual([]);
});
test("reference rationale follows the reference returned by selection rather than the original template",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");await expect(lab.getByRole("button",{name:"Kiểm tra và so sánh",exact:true})).toBeEnabled();
 await page.route("**/api/v1/me/retirement/risk/selection",async route=>{
  const response=await route.fetch({url:discoveryApi+"/api/v1/me/retirement/risk/selection",headers:{...route.request().headers(),Authorization:`Bearer ${state.fixture.accessToken}`}});
  const body=await response.json();expect(body.data.candidates.find((r:{id:string})=>r.id==="HIGHER_EQUITY")?.selection).toBeTruthy();body.data.referenceId="HIGHER_EQUITY";await route.fulfill({response,json:body});
 });
 await lab.getByRole("button",{name:"Kiểm tra và so sánh",exact:true}).click();await expect(lab.getByRole("button",{name:"Chọn phương án tham chiếu",exact:true})).toBeEnabled();
 await expect(page.locator(".allocation-result-why")).toContainText("34.352.000");await expect(page.locator(".allocation-result-why")).not.toContainText("18.080.000");expect(state.errors).toEqual([]);
});
test("package favorites and product detail open the actual catalog records",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");
 await expect(lab.getByRole("button",{name:"Kiểm tra và so sánh",exact:true})).toBeEnabled();
 await lab.getByRole("button",{name:"Gợi ý gói đầu tư phù hợp",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"Lưu quan tâm",exact:true}).first().click();
 await expect(dialog.getByRole("status")).toContainText("Đã lưu quan tâm");
 const saved=await state.get("me/saved-products");expect(saved.some((row:{id:string})=>row.id===state.fixture.products[0].id)).toBe(true);
 await dialog.getByRole("link",{name:"Sản phẩm kiểm thử 01",exact:true}).first().click();await expect(page).toHaveURL(/\/user\/explore\?product=/);
 await expect(page.getByRole("dialog")).toContainText("Sản phẩm kiểm thử 01");expect(state.errors).toEqual([]);
});
for(const [name,width,height] of [["desktop",1440,1000],["tablet",768,1024],["mobile",390,844],["small",320,740],["landscape",844,390]] as const){
 test(`custom controls and package dialog fit ${name}`,async({page,request},info)=>{
  await page.setViewportSize({width,height});const state=await setup(page,request),lab=page.locator(".allocation-experiment");
  await expect(lab.getByRole("button",{name:"Kiểm tra và so sánh",exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath("allocation-custom.png"),fullPage:true});
  await lab.getByRole("button",{name:"Sinh lời quy đổi / năm ⓘ",exact:false}).first().click();await expect(page.getByRole("dialog")).toContainText("Danh nghĩa năm");await expect(page.getByRole("dialog")).toContainText("Hiệu dụng năm");await page.keyboard.press("Escape");
  const trigger=lab.getByRole("button",{name:"Gợi ý gói đầu tư phù hợp",exact:true});await trigger.click();await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toContainText("Sản phẩm kiểm thử 01");await expect(page.getByRole("dialog")).toContainText("Gói A");
  expect(await page.getByRole("dialog").evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})).toBe(true);
  await page.screenshot({path:info.outputPath("allocation-packages.png")});await page.keyboard.press("Escape");await expect(trigger).toBeFocused();expect(state.errors).toEqual([]);
 });
}
