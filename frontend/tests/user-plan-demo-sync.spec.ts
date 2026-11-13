import {test,expect,type Page} from "@playwright/test";
import {setupRemaining} from "./remaining-helpers";
import {formatMoneyDecimal} from "../src/utils/moneyDisplay";
import {discoveryApi} from "./discovery-helpers";

async function ready(page:Page){await expect(page.locator("#plan-overview")).toBeVisible();await page.waitForLoadState("networkidle");}
test.afterEach(async({page})=>{await page.waitForLoadState("networkidle");});

test("main result follows demo order and opens options and contribution as local dialogs",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan");await ready(page);
 await expect(page.locator(".plan-chart-card")).toContainText("Từ 10/2026");await expect(page.locator(".plan-view-tabs")).toHaveCount(0);await expect(page.locator(".plan-more")).not.toHaveAttribute("open","");
 const order=await page.locator(".retirement-plan-page").evaluate(el=>[".plan-next",".plan-result-hero",".plan-metrics",".plan-chart-card",".plan-health",".allocation-compact-card",".plan-tools-grid",".plan-more"].map(selector=>{const node=el.querySelector(selector);return node?Array.from(el.querySelectorAll("*")).indexOf(node):-1;}));
 expect(order.every(n=>n>=0)).toBe(true);expect(order).toEqual([...order].sort((a,b)=>a-b));
 const trigger=page.locator(".plan-hero-actions").getByRole("button",{name:"Chỉnh sửa phương án",exact:true});await trigger.click();
 const dialog=page.getByRole("dialog",{name:"Chỉnh sửa phương án",exact:true});await expect(dialog.locator(".plan-options-grid > *")).toHaveCount(4);
 await expect(dialog.getByRole("link",{name:/Mục tiêu & tuổi nghỉ hưu/})).toHaveAttribute("href","/user/goal");
 await dialog.getByRole("button",{name:/Mức trích góp hàng tháng/}).click();await expect(page.getByRole("dialog",{name:"Chọn mức góp vừa với bạn",exact:true})).toBeVisible();await expect(page).not.toHaveURL(/tab=adjust/);
 await page.keyboard.press("Escape");expect(s.writes.filter(w=>!w.path.endsWith("/preview"))).toEqual([]);expect(s.errors).toEqual([]);
});

test("contribution editing cancels without writes and saving changes only the draft",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan");await ready(page);const before=await s.get(`me/retirement/plans/${s.fixture.planId}`);
 const open=async()=>{await page.locator(".plan-hero-actions").getByRole("button",{name:"Chọn mức góp",exact:true}).click();return page.getByRole("dialog");};
 let dialog=await open();const original=await dialog.getByLabel("Góp vào quỹ nghỉ hưu mỗi tháng",{exact:true}).inputValue();
 await dialog.getByLabel("Góp vào quỹ nghỉ hưu mỗi tháng",{exact:true}).fill("1.234.567,89");await dialog.getByRole("button",{name:"Hủy",exact:true}).click();
 dialog=await open();await expect(dialog.getByLabel("Góp vào quỹ nghỉ hưu mỗi tháng",{exact:true})).toHaveValue(original);
 await dialog.getByLabel("Góp vào quỹ nghỉ hưu mỗi tháng",{exact:true}).fill("1.234.567,89");await dialog.getByRole("button",{name:"Lưu mức góp",exact:true}).click();await ready(page);
 expect(s.writes.some(w=>w.path.endsWith("/preview")&&w.body.monthlyContribution==="1234567.89")).toBe(true);
 const after=await s.get(`me/retirement/plans/${s.fixture.planId}`);expect(after.currentVersionId).toBe(before.currentVersionId);expect(s.writes.filter(w=>!w.path.endsWith("/preview"))).toEqual([]);
 await page.reload();await ready(page);dialog=await open();await expect(dialog.getByLabel("Góp vào quỹ nghỉ hưu mỗi tháng",{exact:true})).toHaveValue("1.234.567,89");
});

test("persisted survey restores without browser drafts and the goal reuses its zero spending",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan",{savedPlan:false});await page.waitForLoadState("networkidle");const record=await s.get("me/financial-profile");
 const retirementSurvey={policyVersionId:s.fixture.planInput.policyVersionId,answers:s.fixture.planInput.answers,monthlyExpenseToday:"0"};
 const result=await request.patch(`${discoveryApi}/api/v1/me/financial-profile`,{headers:{Authorization:`Bearer ${s.fixture.accessToken}`},data:{expectedRevision:record.revision,changes:{schemaVersion:2,retirementSurvey}}});expect(result.ok()).toBe(true);
 const latest=await s.get("me/financial-profile");const {retirementGoal,...withoutGoal}=latest.data;
 await page.route("**/api/v1/me/financial-profile",route=>route.fulfill({json:{data:{...latest,data:withoutGoal}}}));
 await page.evaluate(()=>{sessionStorage.removeItem("anhuu:plan-draft:USR-001");localStorage.clear();});await page.reload();
 await expect(page.locator(".plan-state-card")).toContainText("Bổ sung thời gian chuẩn bị quỹ");await expect(page.locator(".plan-state-card")).not.toContainText("Bổ sung chi tiêu nghỉ hưu");await expect(page.locator(".plan-state-card")).not.toContainText("Kiểm tra kết quả khảo sát rủi ro đã lưu");
 await page.locator(".plan-state-card").getByRole("button",{name:"Thiết lập phương án",exact:true}).click();await page.getByRole("dialog").getByRole("link",{name:/Mục tiêu & tuổi nghỉ hưu/}).click();await expect(page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true})).toHaveValue("0");
 await page.waitForLoadState("networkidle");await page.unroute("**/api/v1/me/financial-profile");await page.goto("/user/plan");await ready(page);await page.reload();await ready(page);expect(s.errors).toEqual([]);
});

test("money suggestions remain keyboard reachable and choosing one restores input focus",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan");await ready(page);
 await page.locator(".plan-hero-actions").getByRole("button",{name:"Chọn mức góp",exact:true}).click();
 const dialog=page.getByRole("dialog"),input=dialog.getByLabel("Góp vào quỹ nghỉ hưu mỗi tháng",{exact:true});await input.focus();await page.keyboard.press("Tab");
 const suggestion=dialog.getByRole("group",{name:"Gợi ý số tiền",exact:true}).getByRole("button").first();await expect(suggestion).toBeFocused();await page.keyboard.press("Enter");await expect(input).toBeFocused();await expect(input).toHaveValue("100.000");
 await dialog.getByRole("button",{name:"Hủy",exact:true}).click();expect(s.writes.filter(w=>!w.path.endsWith("/preview"))).toEqual([]);
});

test("reference chart uses a real preview and reports budget-capped contributions truthfully",async({page,request},info)=>{
 const s=await setupRemaining(page,request,"/user/plan",{savedPlan:false});const record=await s.get("me/financial-profile");
 const result=await request.patch(`${discoveryApi}/api/v1/me/financial-profile`,{headers:{Authorization:`Bearer ${s.fixture.accessToken}`},data:{expectedRevision:record.revision,changes:{schemaVersion:2,retirementGoal:{...record.data.retirementGoal,monthlyExpenseToday:"50000000"}}}});expect(result.ok()).toBe(true);
 await page.evaluate(input=>sessionStorage.setItem("anhuu:plan-draft:USR-001",JSON.stringify(input)),{...s.fixture.planInput,monthlyExpenseToday:"50000000"});await page.reload();await ready(page);
 await expect(page.getByTestId("plan-comparison-line")).toBeVisible();await expect(page.locator(".plan-comparison-note")).toContainText("Giới hạn ngân sách vẫn để lại khoảng thiếu");
 const originalPreview=await request.post(`${discoveryApi}/api/v1/me/retirement/preview`,{headers:{Authorization:`Bearer ${s.fixture.accessToken}`},data:{...s.fixture.planInput,expectedProfileRevision:(await s.get("me/financial-profile")).revision,monthlyExpenseToday:"50000000"}});const {data}=await originalPreview.json();
 await expect(page.locator(".plan-health .health-kpi").last().locator("strong")).toHaveText(formatMoneyDecimal(data.calculation.summary.unfundedWithdrawals));await page.locator(".plan-chart-card").screenshot({path:info.outputPath("reference-chart.png"),animations:"disabled"});
 const requests=s.writes.filter(w=>w.path.endsWith("/preview")&&w.status===200);expect(new Set(requests.map(w=>w.body.monthlyContribution)).size).toBeGreaterThan(1);expect(s.writes.filter(w=>!w.path.endsWith("/preview"))).toEqual([]);
});

for(const width of [1440,768,390,320])test(`demo plan and both dialogs fit ${width}px`,async({page,request},info)=>{
 await page.setViewportSize({width,height:900});const s=await setupRemaining(page,request,"/user/plan");await ready(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath("plan.png"),fullPage:true,animations:"disabled"});
 for(const [key,name]of [["options","Chỉnh sửa phương án"],["contribution","Chọn mức góp"]]){
  const trigger=page.locator(".plan-hero-actions").getByRole("button",{name,exact:true});await trigger.click();const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);expect(await dialog.locator(".modal-body").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(key+".png"),animations:"disabled"});for(let n=0;n<5;n++){await page.keyboard.press("Tab");expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);}await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
 }
 expect(s.errors).toEqual([]);
});

for(const width of [1440,768,390,320])test(`incomplete plan keeps the new layout with honest unknown amounts at ${width}px`,async({page,request},info)=>{
 await page.setViewportSize({width,height:900});const s=await setupRemaining(page,request,"/user/plan",{savedPlan:false});const record=await s.get("me/financial-profile");const {retirementGoal,retirementSurvey,...data}=record.data;
 await page.route("**/api/v1/me/financial-profile",route=>route.fulfill({json:{data:{...record,data}}}));await page.reload();await expect(page.locator(".plan-empty-result")).toBeVisible();
 await expect(page.locator(".plan-empty-metrics > article > strong")).toHaveText(Array(4).fill("Chưa xác định"));await expect(page.locator(".plan-next")).toHaveCount(0);await expect(page.locator("#plan-overview")).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath("plan-incomplete.png"),fullPage:true,animations:"disabled"});await page.locator(".plan-empty-hero").getByRole("button",{name:"Thiết lập phương án",exact:true}).click();await expect(page.getByRole("dialog",{name:"Chỉnh sửa phương án",exact:true})).toBeVisible();await page.keyboard.press("Escape");expect(s.writes.filter(w=>!w.path.endsWith("/preview"))).toEqual([]);
});
