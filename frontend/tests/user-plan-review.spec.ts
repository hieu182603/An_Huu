import {test,expect,type Page} from "@playwright/test";
import {discoveryApi} from "./discovery-helpers";
import {setupRemaining} from "./remaining-helpers";

async function restoreDraft(page:Page,input:object){await page.evaluate(draft=>sessionStorage.setItem("anhuu:plan-draft:USR-001",JSON.stringify(draft)),input);}
test.afterEach(async({page})=>{await page.waitForLoadState("networkidle");});

test("missing goal horizon explains the actual blocker and never asks to save an unknown plan",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan",{savedPlan:false});const record=await s.get("me/financial-profile");const{retirementGoal,...data}=record.data;
 await page.route("**/api/v1/me/financial-profile",route=>route.fulfill({json:{data:{...record,data}}}));
 const{endMonth,...partial}=s.fixture.planInput;await restoreDraft(page,{...partial,monthlyExpenseToday:"0"});await page.reload();
 await expect(page.locator(".plan-next")).toHaveCount(0);await expect(page.getByRole("link",{name:"Bổ sung thời gian chuẩn bị quỹ",exact:true})).toHaveAttribute("href","/user/goal");await expect(page.getByRole("button",{name:"Lưu làm kế hoạch chính",exact:true})).toHaveCount(0);
 await page.getByRole("link",{name:"Bổ sung thời gian chuẩn bị quỹ",exact:true}).click();await expect(page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true})).toHaveValue("0");await page.getByLabel("Chuẩn bị quỹ đến tháng",{exact:true}).fill("12/2028");await page.getByRole("button",{name:"Lưu và xem kết quả mới",exact:true}).click();
 await expect(page.locator("#plan-overview")).toBeVisible();expect((await s.get("me/financial-profile")).data.retirementGoal.monthlyExpenseToday).toBe("0");expect(s.writes.some(w=>w.path.endsWith("/apply"))).toBe(false);
});

test("failed first preview retries the same draft without needing an applied plan",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan",{savedPlan:false});await restoreDraft(page,s.fixture.planInput);let fail=true,calls=0;
 await page.route("**/api/v1/me/retirement/preview**",route=>{calls++;return fail?route.fulfill({status:503,json:{error:{code:"PREVIEW_UNAVAILABLE",message:"Dịch vụ tính toán đang bảo trì"}}}):route.fallback();});await page.reload();
 await expect(page.locator(".plan-next")).toHaveCount(0);await expect(page.getByRole("alert")).toContainText("Dịch vụ tính toán");fail=false;await page.getByRole("button",{name:"Thử lại",exact:true}).click();await expect(page.locator("#plan-overview")).toBeVisible();expect(calls).toBeGreaterThan(1);expect(s.writes.some(w=>w.path.endsWith("/apply"))).toBe(false);
});

test("an applied plan shows its current status instead of asking the user to save it again",async({page,request})=>{
 await setupRemaining(page,request,"/user/plan");await expect(page.locator("#plan-overview")).toBeVisible();await expect(page.locator(".plan-next")).toContainText("Kế hoạch chính đang dùng");await expect(page.getByRole("button",{name:"Lưu làm kế hoạch chính",exact:true})).toHaveCount(0);await expect(page.locator(".chart-phase-key")).toContainText("Tích lũy đến 36 tuổi");
});


test("plan list outages retry the list instead of retrying a nonexistent preview",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan");let fail=true,calls=0;
 await page.route("**/api/v1/me/retirement/plans?**",route=>{calls++;return fail?route.fulfill({status:503,json:{error:{message:"Danh sách kế hoạch đang gián đoạn"}}}):route.fallback();});await page.reload();
 await expect(page.getByRole("alert")).toContainText("Không thể tải danh sách kế hoạch hưu trí");await expect(page.locator(".plan-next")).toHaveCount(0);fail=false;await page.getByRole("button",{name:"Thử lại",exact:true}).click();await expect(page.locator("#plan-overview")).toBeVisible();expect(calls).toBeGreaterThan(1);expect(s.errors).toEqual([]);
});

test("policy outages hide results and the retry reloads the policy",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan");let fail=true;
 await page.route("**/api/v1/me/portfolio-policies/**",route=>fail?route.fulfill({status:503,json:{error:{message:"Chính sách đang gián đoạn"}}}):route.fallback());await page.reload();
 await expect(page.getByRole("alert")).toContainText("Chính sách đang gián đoạn");await expect(page.locator("#plan-overview")).toHaveCount(0);fail=false;await page.getByRole("button",{name:"Thử lại",exact:true}).click();await expect(page.locator("#plan-overview")).toBeVisible();expect(s.errors).toEqual([]);
});

test("an incomplete adjustment preserves entries and never claims that the goal is met",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan?tab=adjust",{savedPlan:false});const record=await s.get("me/financial-profile");const{retirementGoal,...data}=record.data;
 await page.route("**/api/v1/me/financial-profile",route=>route.fulfill({json:{data:{...record,data}}}));const{endMonth,...partial}=s.fixture.planInput;await restoreDraft(page,{...partial,monthlyExpenseToday:"0",monthlyContribution:"1234567.89"});await page.reload();
 await expect(page.getByLabel("Chi tiêu nghỉ hưu / tháng",{exact:true})).toHaveValue("0");await expect(page.locator(".comparison-box")).not.toContainText("Đạt mục tiêu");await expect(page.locator(".comparison-box")).toContainText("Chưa xác định");await expect(page.locator(".plan-next")).toHaveCount(0);
});

test("saving a new ready plan requires confirmation and an apply retry reuses the saved version",async({page,request})=>{
 const s=await setupRemaining(page,request,"/user/plan",{savedPlan:false});await restoreDraft(page,s.fixture.planInput);await page.reload();await expect(page.locator("#plan-overview")).toBeVisible();await page.waitForLoadState("networkidle");const previewCount=s.writes.filter(w=>w.path.includes("retirement/preview")).length;
 let fail=true;await page.route("**/api/v1/me/retirement/plans/*/apply",route=>fail?route.fulfill({status:503,json:{error:{message:"Chưa áp dụng được kế hoạch"}}}):route.fallback());
 await page.getByRole("button",{name:"Lưu làm kế hoạch chính",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();expect(s.writes.some(w=>w.path.endsWith("/versions"))).toBe(false);await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
 await page.getByRole("button",{name:"Lưu làm kế hoạch chính",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Dùng làm kế hoạch hiện tại",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"Chưa áp dụng được kế hoạch"})).toBeVisible();
 expect(s.writes.filter(w=>w.path.includes("retirement/preview"))).toHaveLength(previewCount);await expect(page.getByRole("dialog")).toBeVisible();
 const saves=()=>s.writes.filter(w=>w.method==="POST"&&(/\/versions$|\/plans$/.test(w.path))&&w.status===201);expect(saves()).toHaveLength(1);
 fail=false;await page.getByRole("dialog").getByRole("button",{name:"Dùng làm kế hoạch hiện tại",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.locator(".plan-next")).toContainText("Kế hoạch chính đang dùng");expect(saves()).toHaveLength(1);expect((await s.get("me/retirement/plans")).items).toHaveLength(1);
});

for(const[name,width,height]of[["desktop",1440,1000],["mobile",390,844],["small-mobile",320,740]]as const)test(`plan empty and applied states fit ${name}`,async({page,request},info)=>{
 await page.setViewportSize({width,height});await setupRemaining(page,request,"/user/plan",{savedPlan:false});await expect(page.locator(".plan-state-card")).toContainText("Hoàn thiện thông tin");await expect(page.locator(".plan-next")).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath("plan-empty.png"),fullPage:true});
 await setupRemaining(page,request,"/user/plan");await expect(page.locator("#plan-overview")).toBeVisible();await expect(page.locator(".plan-next")).toContainText("Kế hoạch chính đang dùng");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath("plan-current.png"),fullPage:true});
});


test("a projection with no eligible contribution period never displays a fake zero monthly solution",async({page,request},info)=>{
 const s=await setupRemaining(page,request,"/user/plan",{savedPlan:false});const response=await request.post(discoveryApi+"/api/v1/me/retirement/preview",{headers:{Authorization:`Bearer ${s.fixture.accessToken}`},data:s.fixture.planInput});expect(response.ok()).toBe(true);const{data}=await response.json();
 await page.route("**/api/v1/me/retirement/preview**",route=>route.fulfill({json:{data:{...data,calculation:{...data.calculation,summary:{...data.calculation.summary,retirementFundingShortfall:"100000000",additionalMonthlyContribution:null,requiredConstantMonthlyContribution:null,savingsStatus:"NO_ELIGIBLE_CONTRIBUTION_PERIOD"}}}}}));
 await restoreDraft(page,s.fixture.planInput);await page.reload();await expect(page.locator(".plan-summary-hero__title")).toHaveText("Cần bổ sung vốn trước khi góp");await expect(page.locator(".plan-summary-hero__number")).toHaveText("Cần rà soát");await expect(page.locator(".plan-summary-hero__number")).not.toContainText("tháng");await page.screenshot({path:info.outputPath("plan-upfront-funding.png"),fullPage:true});await page.locator(".plan-hero-actions").getByRole("button",{name:"Chọn mức góp",exact:true}).click();await expect(page.getByRole("dialog").getByRole("button",{name:"Theo mức cần",exact:true})).toBeDisabled();
});
