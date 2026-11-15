import {expect,test,type Page,type APIRequestContext} from "@playwright/test";
import {installFinancialProfileRoutes} from "./helpers";
import {setupDiscovery,discoveryApi} from "./discovery-helpers";
async function openPublished(page:Page){const details=page.locator(".allocation-template-details");await expect(details).toBeVisible();if(await details.getAttribute("open")===null)await details.locator(":scope > summary").click();}
const panel=(page:Page)=>page.locator(".allocation-template-details .allocation-lab-real"),dialog=(page:Page)=>page.getByRole("dialog");
async function setup(page:Page,request:APIRequestContext,options:object={},answer=true,calculate=true){
 const state=await setupDiscovery(page,request,"/user/risk-portfolio",{allocation:true,...options},answer);
 await expect(page.getByRole("heading",{name:"Phân bổ tài sản",exact:true})).toBeVisible();
 if((options as any).emptyPolicy)return state;
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();
 await page.getByText("Giả định đang dùng",{exact:true}).click();
 await page.getByLabel("Tháng kết thúc kế hoạch",{exact:true}).fill("12/2027");await page.getByLabel("Thời gian cần giữ thanh khoản",{exact:true}).fill("12");
 if(answer&&calculate){await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();await openPublished(page);if((options as any).multiple)await expect(panel(page)).toContainText("Có nhiều phương án phù hợp");else await expect(panel(page).getByRole("heading",{name:"Fixture CAUTIOUS",exact:true})).toBeVisible();}
 return state;
}

test("declared total replaces profile capital once and persists without rewriting asset records",async({page,request})=>{
 const s=await setup(page,request,{},true,false);
 const assets=(await s.get("me/financial-profile")).data.assets;
 await page.locator(".allocation-steps button").first().click();
 await page.getByLabel("Số vốn dùng để phân bổ",{exact:true}).selectOption("TOTAL");
 await page.getByLabel("Tổng tiền có thể đầu tư hôm nay",{exact:true}).fill("1000000000");
 await page.getByRole("button",{name:"Lưu vốn và tính lại",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.allocationCapital).toEqual({basis:"TOTAL",totalAmount:"1000000000"});
 expect((await s.get("me/financial-profile")).data.assets).toEqual(assets);
 await expect(page.locator(".allocation-capital > dl > div").first()).toContainText("1.000.000.000 ₫");
 await page.reload();await expect(page.getByLabel("Số vốn dùng để phân bổ",{exact:true})).toHaveValue("TOTAL");
 await page.getByLabel("Số vốn dùng để phân bổ",{exact:true}).selectOption("PROFILE");
 await page.getByRole("button",{name:"Lưu vốn và tính lại",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.allocationCapital.basis).toBe("PROFILE");
});

test("editable essential spending saves real sources and keeps the rest of the profile",async({page,request})=>{
 const s=await setup(page,request,{},true,false),before=(await s.get("me/financial-profile")).data;
 await page.locator(".allocation-steps button").nth(1).click();
 await page.getByLabel("Chi phí cần thiết mỗi tháng hiện nay",{exact:true}).fill("12000000");
 await page.getByLabel("Chi phí cần thiết mỗi tháng khi nghỉ hưu",{exact:true}).fill("15000000");
 await page.getByRole("button",{name:"Lưu chi tiêu và tính lại",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.retirementGoal?.monthlyExpenseToday).toBe("15000000");
 const after=(await s.get("me/financial-profile")).data;
 expect(after.assets).toEqual(before.assets);expect(after.debts).toEqual(before.debts);expect(after.income).toEqual(before.income);
 expect(after.expenses.entries.filter((e:any)=>e.category!=="ESSENTIAL")).toEqual(before.expenses.entries.filter((e:any)=>e.category!=="ESSENTIAL"));
 await page.reload();await page.locator(".allocation-steps button").nth(1).click();
 await expect(page.getByLabel("Chi phí cần thiết mỗi tháng hiện nay",{exact:true})).toHaveValue("12.000.000");
 await expect(page.getByLabel("Chi phí cần thiết mỗi tháng khi nghỉ hưu",{exact:true})).toHaveValue("15.000.000");
});

test("assumptions action opens its contents and money inputs use the dong symbol",async({page,request})=>{
 await setup(page,request,{},true,false);
 const details=page.locator("#allocation-system-assumptions");
 await details.locator(":scope > summary").click();await expect(details).not.toHaveAttribute("open","");
 await page.locator(".allocation-data-note").getByRole("button",{name:"Chỉnh",exact:true}).click();
 await expect(details).toHaveAttribute("open","");await expect(page.getByLabel("Tháng kết thúc kế hoạch",{exact:true})).toBeVisible();
 await page.locator(".allocation-steps button").nth(1).click();
 const units=await page.locator(".allocation-personal-inputs .input-suffix").allTextContents();expect(units).toEqual(["₫","₫"]);
});

test("personal legacy and retirement income persist, and clearing saved income never silently keeps a different amount",async({page,request})=>{
 const s=await setup(page,request,{},true,false);
 await page.locator(".allocation-steps button").nth(1).click();
 await page.getByLabel("Chi phí cần thiết mỗi tháng khi nghỉ hưu",{exact:true}).fill("15000000");
 await page.getByRole("button",{name:"Lưu chi tiêu và tính lại",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.retirementGoal?.monthlyExpenseToday).toBe("15000000");
 await page.locator(".allocation-steps button").nth(2).click();
 await page.getByText("Tiền để lại và nguồn thu sau nghỉ hưu",{exact:true}).click();
 await page.getByLabel("Tiền muốn để lại cuối kế hoạch",{exact:true}).fill("100000000");
 await page.getByLabel("Thu nhập khác sau nghỉ hưu mỗi tháng",{exact:true}).fill("4000000");
 await page.getByRole("button",{name:"Lưu thông tin và tính lại",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.income.entries.find((e:any)=>e.id==="allocation-retirement-income")?.amount.value).toBe("4000000");
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem("anhuu:plan-draft:USR-001")??"{}").terminalBalance)).toBe("100000000");
 await page.waitForLoadState("networkidle");await page.reload();
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();
 await page.getByText("Tiền để lại và nguồn thu sau nghỉ hưu",{exact:true}).click();
 await expect(page.getByLabel("Tiền muốn để lại cuối kế hoạch",{exact:true})).toHaveValue("100.000.000");
 const other=page.getByLabel("Thu nhập khác sau nghỉ hưu mỗi tháng",{exact:true});await expect(other).toHaveValue("4.000.000");
 const before=await s.get("me/financial-profile");await other.fill("");
 await page.getByRole("button",{name:"Lưu thông tin và tính lại",exact:true}).click();
 await expect(page.getByRole("alert").filter({hasText:"Khoản thu đã được lưu"})).toBeVisible();expect(await s.get("me/financial-profile")).toEqual(before);
 await other.fill("0");await page.getByRole("button",{name:"Lưu thông tin và tính lại",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.income.entries.find((e:any)=>e.id==="allocation-retirement-income")?.amount.value).toBe("0");
});

test("capital uses canonical profile purposes and current glide weights without sample returns",async({page,request})=>{
 const s=await setup(page,request);await expect(page.locator(".allocation-total-capital")).toContainText("1.000.000.000");await expect(page.locator(".allocation-result-summary > div")).toHaveCount(3);await expect(page.locator(".allocation-capital-total")).toContainText("904.000.000");
 await expect(panel(page).locator(".allocation-breakdown")).toContainText("100%");await expect(panel(page)).not.toContainText("7,5%");await expect(page.locator(".allocation-life")).toContainText("0 năm tròn");
 expect(s.writes.every(w=>w.path.endsWith("/preview"))).toBe(true);expect(s.errors).toEqual([]);
});
test("three steps reuse the initial survey without repeating questions and show results only after confirmation",async({page,request})=>{
 const state=await setup(page,request,{},true,false);await expect(panel(page)).toHaveCount(0);await expect(page.getByRole("radiogroup")).toHaveCount(0);await expect(page.locator("#risk-survey")).toHaveCount(0);
 await expect(page.getByRole("status").filter({hasText:"Đang sử dụng kết quả khảo sát rủi ro ban đầu."})).toBeVisible();
 await page.locator(".allocation-steps button").nth(1).click();await expect(page.locator(".allocation-protection").first()).toContainText("16.000.000");
 await page.locator(".allocation-steps button").nth(0).click();await expect(page.getByLabel("Số tháng dự phòng",{exact:true})).toHaveValue("6");
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();await expect(page.getByLabel("Tháng kết thúc kế hoạch",{exact:true})).toHaveValue("12/2027");
 await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();await openPublished(page);await expect(panel(page).getByRole("heading",{name:"Fixture CAUTIOUS",exact:true})).toBeVisible();
 expect(state.writes.filter(w=>w.path.endsWith("workspace/preview")).at(-1)?.body.answers).toEqual(state.fixture.allocationCommand.answers);
 await page.reload();await expect(page.getByRole("radiogroup")).toHaveCount(0);await expect(panel(page)).toHaveCount(0);expect(state.errors).toEqual([]);
});

test("missing horizon and answers never show an allocation or enable apply",async({page,request})=>{
 await setupDiscovery(page,request,"/user/risk-portfolio",{allocation:true});await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();await expect(page.getByText("Chọn tháng kết thúc kế hoạch trong Giả định đang dùng trước khi tính.")).toBeVisible();await expect(page.locator(".allocation-breakdown")).toHaveCount(0);await expect(page.getByRole("button",{name:"Xem phương án của tôi →",exact:true})).toBeDisabled();
});
test("unknown and negative capital stay explicit and cannot be applied",async({page,request})=>{
 await setup(page,request,{unknownCapital:true});await expect(page.locator(".allocation-capital-total")).toContainText("Chưa xác định");await expect(page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true})).toBeDisabled();
 await setup(page,request,{negative:true});await expect(page.locator(".allocation-capital-total")).toContainText("Còn thiếu");await expect(page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true})).toBeDisabled();
});
test("unpublished policy is unconfigured without fabricated portfolios",async({page,request})=>{
 await setup(page,request,{emptyPolicy:true});await expect(page.getByText("Chưa có chính sách danh mục đã công bố.",{exact:false})).toBeVisible();await expect(page.locator(".allocation-template-details .allocation-lab-real")).toHaveCount(0);
});
test("failed workspace hides prior capital/results and retry uses the server",async({page,request})=>{
 await setup(page,request);let fail=true;await page.route("**/api/v1/me/portfolio-policies/workspace/preview",route=>fail?route.fulfill({status:503,json:{error:{message:"Chưa tính được phân bổ"}}}):route.fallback());
 // Previews are cached per input: change the horizon so the failing request really goes out.
 await page.locator(".allocation-editor-disclosure > summary").click();await page.getByText("Giả định đang dùng",{exact:true}).click();await page.getByLabel("Tháng kết thúc kế hoạch",{exact:true}).fill("11/2027");await expect(page.getByRole("alert")).toContainText("Chưa tính được phân bổ");await expect(page.locator(".allocation-result-summary")).toHaveCount(0);await expect(page.locator(".allocation-breakdown")).toHaveCount(0);
 fail=false;await page.getByRole("button",{name:"Thử lại",exact:true}).click();await expect(page.locator(".allocation-capital-total")).toContainText("904.000.000");await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();await openPublished(page);await expect(panel(page).getByRole("heading",{name:"Fixture CAUTIOUS",exact:true})).toBeVisible();
});
test("preview confirmation changes only the plan draft with real policy/answers",async({page,request})=>{
 const s=await setup(page,request);await page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true}).click();await expect(dialog(page)).toContainText("bản nháp kế hoạch");await dialog(page).getByRole("button",{name:"Xác nhận dùng trong bản nháp",exact:true}).click();await expect(page).toHaveURL(/\/user\/plan/);
 const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("anhuu:plan-draft:USR-001")??"null"));expect(draft.policyVersionId).toBe(s.fixture.policyId);expect(draft.templateId).toBe("CAUTIOUS");expect(draft.answers).toHaveLength(6);expect(draft.endMonth).toBe("2027-12");expect(s.writes.some(w=>w.path.includes("/versions")||w.path.endsWith("/apply"))).toBe(false);await page.waitForLoadState("networkidle");
});
test("risk form keeps its UI, saves zero to backend and survives reload",async({page,request})=>{
 const s=await setup(page,request);await page.getByRole("button",{name:"Khả năng chịu rủi ro →",exact:true}).click();await page.getByLabel("Mức giảm tối đa có thể chấp nhận (%)",{exact:true}).fill("0");await page.getByRole("button",{name:"Cập nhật và tính lại",exact:true}).click();await expect(page).not.toHaveURL(/section=risk/);
 expect((await s.get("me/financial-profile")).data.lossTolerance.amountVnd.value).toBe("0");await page.reload();await page.getByRole("button",{name:"Khả năng chịu rủi ro →",exact:true}).click();await expect(page.getByLabel("Mức giảm tối đa có thể chấp nhận (%)",{exact:true})).toHaveValue("0");
});
test("failed risk save keeps inputs and stays in the form",async({page,request})=>{
 await setup(page,request);await page.getByRole("button",{name:"Khả năng chịu rủi ro →",exact:true}).click();await page.getByLabel("Mức giảm tối đa có thể chấp nhận (%)",{exact:true}).fill("7");await page.route("**/api/v1/me/financial-profile/loss-tolerance",r=>r.fulfill({status:409,json:{error:{message:"Hồ sơ đã thay đổi"}}}));await page.getByRole("button",{name:"Cập nhật và tính lại",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Hồ sơ đã thay đổi");await expect(page.getByLabel("Mức giảm tối đa có thể chấp nhận (%)",{exact:true})).toHaveValue("7");await expect(page).toHaveURL(/section=risk/);
});
test("capital popups trap focus, restore it and rebalance opens without write",async({page,request})=>{
 const s=await setup(page,request);const trigger=page.getByRole("button",{name:"Giải thích: Tổng vốn",exact:true});await trigger.click();await expect(dialog(page)).toContainText("tài sản thanh khoản");await page.keyboard.press("Shift+Tab");expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBe(true);await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
 await page.getByRole("button",{name:"Đề xuất tái cân bằng",exact:true}).click();await expect(dialog(page).getByRole("button",{name:"Xem đề xuất tái cân bằng",exact:true})).toBeVisible();await page.keyboard.press("Escape");expect(s.writes.every(w=>w.path.endsWith("/preview"))).toBe(true);
});
for(const[name,width,height]of[["desktop",1440,1000],["tablet",768,1024],["mobile",390,844],["small-mobile",320,740],["landscape",844,390]]as const)test(`allocation and popups fit ${name}`,async({page,request},info)=>{
 await page.setViewportSize({width,height});const s=await setup(page,request,{},true,false);await page.locator(".allocation-steps button").nth(0).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath("allocation.png"),fullPage:true});const fit=await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=innerWidth+1,overflow:[...document.querySelectorAll("*")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width}))}));expect(fit.fits,JSON.stringify(fit.overflow)).toBe(true);
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();await page.screenshot({path:info.outputPath("allocation-review.png"),fullPage:true});await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();await openPublished(page);await expect(panel(page).getByRole("heading",{name:"Fixture CAUTIOUS",exact:true})).toBeVisible();await page.screenshot({path:info.outputPath("allocation-results.png"),fullPage:true});await page.getByRole("button",{name:"Giải thích: Mục tiêu gần hạn",exact:true}).click();await page.screenshot({path:info.outputPath("capital-popup.png")});await page.keyboard.press("Escape");await page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true}).click();await page.screenshot({path:info.outputPath("apply-popup.png")});await page.keyboard.press("Escape");expect(s.errors).toEqual([]);
});

test("blocked draft storage keeps the confirmation open without claiming application",async({page,request})=>{
 const s=await setup(page,request);await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith("anhuu:plan-draft:"))throw new DOMException("Storage blocked","SecurityError");return original.call(this,key,value);};});
 await page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true}).click();await dialog(page).getByRole("button",{name:"Xác nhận dùng trong bản nháp",exact:true}).click();await expect(dialog(page).getByRole("alert")).toContainText("Chưa giữ được bản nháp");await expect(page).toHaveURL(/risk-portfolio/);expect(s.errors).toEqual([]);
});
test("missing survey stays unassessed and opens the separate questionnaire",async({page,request})=>{
 const state=await setup(page,request,{},false);await expect(page.getByRole("status").filter({hasText:"Chưa có kết quả khảo sát rủi ro hợp lệ"})).toBeVisible();
 await expect(page.getByRole("radiogroup")).toHaveCount(0);await expect(page.getByRole("button",{name:"Xem phương án của tôi →",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"Trả lời câu hỏi đánh giá",exact:true})).toBeVisible();
 expect(state.writes.filter(w=>w.path.endsWith("workspace/preview")).every(w=>w.body.answers.length===0)).toBe(true);
});

test("English allocation labels and unconfigured guidance remain translated",async({page,request})=>{
 await page.addInitScript(()=>localStorage.setItem("anhuu_language","en"));await setupDiscovery(page,request,"/user/risk-portfolio",{allocation:true,emptyPolicy:true});await expect(page.getByRole("heading",{name:"Asset allocation",exact:true})).toBeVisible();await expect(page.getByText("No published portfolio policy is available.",{exact:false})).toBeVisible();
});

test("amount-mode risk tolerance displays and saves the entered amount without using the old percent",async({page,request})=>{
 const s=await setup(page,request);await page.getByRole("button",{name:"Khả năng chịu rủi ro →",exact:true}).click();await page.locator("select:not([data-policy-question])").selectOption("amount");await page.getByLabel("Mức giảm tối đa có thể chấp nhận (VND)",{exact:true}).fill("90400000");await expect(page.getByText("Tương đương trên phần vốn dài hạn đang xét:",{exact:false})).toContainText("90.400.000");await page.getByRole("button",{name:"Cập nhật và tính lại",exact:true}).click();await expect(page).not.toHaveURL(/section=risk/);expect((await s.get("me/financial-profile")).data.lossTolerance.percent.value).toBe("10");
});
test("multiple eligible portfolios require an explicit choice and switching/reset uses actual weights",async({page,request})=>{
 await setup(page,request,{multiple:true});await expect(panel(page)).toContainText("Có nhiều phương án phù hợp");await expect(panel(page).getByRole("button",{name:"Fixture GROWTH",exact:true})).toBeEnabled();await panel(page).getByRole("button",{name:"Fixture GROWTH",exact:true}).click();await expect(panel(page).getByRole("heading",{name:"Fixture GROWTH",exact:true})).toBeVisible();await expect(panel(page).locator(".allocation-breakdown")).toContainText("30%");await expect(panel(page).locator(".allocation-breakdown")).toContainText("271.200.000");await panel(page).getByRole("button",{name:"Đặt lại theo câu trả lời",exact:true}).click();await expect(panel(page)).toContainText("Có nhiều phương án phù hợp");await expect(panel(page).locator(".allocation-breakdown")).toHaveCount(0);
});


test("a one-sided initial loss limit is converted by the backend without another survey",async({page,request})=>{
 const state=await setup(page,request,{},true,false),record=await state.get("me/financial-profile");
 const response=await request.patch(discoveryApi+"/api/v1/me/financial-profile",{headers:{Authorization:`Bearer ${state.fixture.accessToken}`},data:{expectedRevision:record.revision,changes:{schemaVersion:2,lossTolerance:{reaction:{status:"KNOWN",value:"HOLD"},percent:{status:"KNOWN",value:"0"},amountVnd:{status:"UNKNOWN"}}}}});expect(response.status()).toBe(200);
 await page.reload();await page.locator(".allocation-steps button").nth(1).click();await expect(page.getByRole("radio")).toHaveCount(0);await page.getByRole("button",{name:"Quy đổi giới hạn đã khai",exact:true}).click();
 await expect.poll(async()=>(await state.get("me/financial-profile")).data.lossTolerance.amountVnd).toEqual({status:"KNOWN",value:"0"});
 expect((await state.get("me/financial-profile")).data.lossTolerance.percent).toEqual({status:"KNOWN",value:"0"});
});

test("converting a limit never declares an unknown reaction as HOLD",async({page,request})=>{
 const state=await setup(page,request,{},true,false),record=await state.get("me/financial-profile");
 const response=await request.patch(discoveryApi+"/api/v1/me/financial-profile",{headers:{Authorization:`Bearer ${state.fixture.accessToken}`},data:{expectedRevision:record.revision,changes:{schemaVersion:2,lossTolerance:{reaction:{status:"UNKNOWN"},percent:{status:"KNOWN",value:"0"},amountVnd:{status:"UNKNOWN"}}}}});expect(response.ok()).toBe(true);
 await page.reload();await page.locator(".allocation-steps button").nth(1).click();await page.getByRole("button",{name:"Quy đổi giới hạn đã khai",exact:true}).click();
 await expect(page).toHaveURL(/section=risk/);await expect(page.getByRole("alert")).toContainText("xác nhận phản ứng");
 expect((await state.get("me/financial-profile")).data.lossTolerance.reaction).toEqual({status:"UNKNOWN"});
 expect(state.writes.some(w=>w.path.endsWith("/loss-tolerance"))).toBe(false);
});

test("editing the projection horizon hides the prior result until explicitly recalculated",async({page,request})=>{
 const state=await setup(page,request);await page.locator(".allocation-editor-disclosure > summary").click();await page.getByText("Giả định đang dùng",{exact:true}).click();
 await page.getByLabel("Tháng kết thúc kế hoạch",{exact:true}).fill("11/2027");await expect(panel(page)).toHaveCount(0);
 await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();await openPublished(page);await expect(panel(page).getByRole("heading",{name:"Fixture CAUTIOUS",exact:true})).toBeVisible();
 expect(state.writes.filter(w=>w.path.endsWith("workspace/preview")).at(-1)?.body.endMonth).toBe("2027-11");expect(state.writes.some(w=>w.path.endsWith("/apply"))).toBe(false);
});

test("finishing the survey preserves declared risk and uses a planning reaction without suitability answers",async({page,request})=>{
 const fixture=await setupDiscovery(page,request,"/user/risk-portfolio",{allocation:true});
 const state=await installFinancialProfileRoutes(page,{profile:null,draft:null});
 await page.route("**/api/v1/auth/**",route=>route.fulfill({json:{data:{accessToken:fixture.fixture.accessToken,user:{id:"USR-001",fullName:"Synthetic reader",email:"synthetic@example.test",role:"USER",status:"ACTIVE",revision:1,phone:null,city:null,avatarUrl:null}}}}));
 await page.goto("/onboarding");
 await page.getByLabel("Ngày tháng năm sinh",{exact:true}).fill("01/01/1990");await page.getByLabel("Bạn muốn nghỉ hưu năm bao nhiêu tuổi?",{exact:true}).fill("60");await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true}).fill("10000000");await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true}).press("Tab");await page.getByRole("button",{name:"Tiếp tục →",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Tiền của bạn hôm nay",exact:true})).toBeVisible();
 await page.getByLabel("Thu nhập bình quân thực nhận mỗi tháng của bạn bao nhiêu?",{exact:true}).fill("20000000");await page.getByLabel("Bạn đang chi bao nhiêu mỗi tháng?",{exact:true}).fill("10000000");await page.getByLabel("Bạn đã tích lũy được bao nhiêu cho tuổi nghỉ hưu?",{exact:true}).fill("500000000");await page.getByLabel("Bạn đã tích lũy được bao nhiêu cho tuổi nghỉ hưu?",{exact:true}).press("Tab");await page.getByRole("button",{name:"Tiếp tục →",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Bạn còn những khoản nào cần chăm lo?",exact:true})).toBeVisible();await page.getByRole("button",{name:"Tiếp tục →",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Khả năng chịu rủi ro phù hợp với bạn",exact:true})).toBeVisible();await page.getByRole("radio",{name:/Tôi muốn ưu tiên giữ vốn/}).check();await page.getByLabel("Thu nhập của bạn thường thế nào?",{exact:true}).selectOption("variable");
 await page.getByText("Mức lỗ tối đa bạn có thể chấp nhận",{exact:true}).click();await page.getByLabel("Bạn đã có mức giới hạn lỗ cụ thể chưa?",{exact:true}).selectOption("percent");await page.getByRole("spinbutton",{name:"Tỷ lệ lỗ tối đa trên vốn đầu tư dài hạn (%)",exact:true}).fill("0");
 // The four-step onboarding never supplies suitability answers.
 await expect(page.locator("[data-policy-question]")).toHaveCount(0);
 await page.getByRole("button",{name:"Xem kế hoạch đầu tiên →",exact:true}).click();
 await expect(page).toHaveURL(/\/user\/plan/);
 // The client now sends the raw survey; the server derives lossTolerance and incomeStability from it (profiles/quick-start.ts).
 expect(state.getProfile().data.quickStartSurvey).toMatchObject({reaction:"SELL",stability:"VARIABLE",lossStatus:"percent",lossPercent:"0"});
 const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("anhuu:plan-draft:USR-001")??"null"));expect(draft.policyVersionId).toBe(fixture.fixture.policyId);expect(draft.answers).toEqual([]);expect(draft.planningReaction).toBe("SELL");
});
// Requests still in flight when a test ends are otherwise reported against it.
test.afterEach(async({page})=>{await page.goto("about:blank");await page.unrouteAll({behavior:"wait"});});
test("reserve months and goals are edited in place and saved to the profile",async({page,request})=>{
 const s=await setup(page,request,{},true,false);
 await page.locator(".allocation-steps button").nth(0).click();
 const previousStability=(await s.get("me/financial-profile")).data.incomeStability;
 await page.getByLabel("Số tháng dự phòng",{exact:true}).fill("8");
 await page.getByLabel("Số tháng dự phòng",{exact:true}).blur();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.reserveMonths).toBe(8);
 expect((await s.get("me/financial-profile")).data.incomeStability).toEqual(previousStability);
 await expect(page.getByLabel("Số tháng dự phòng",{exact:true})).toHaveValue("8");
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();
 await page.getByText("Khoản lớn cần dùng trong tương lai",{exact:true}).click();
 await page.getByRole("button",{name:"＋ Thêm mục tiêu",exact:true}).click();
 await page.getByLabel("Tên mục tiêu",{exact:true}).fill("Học phí");
 await page.getByLabel("Số tiền theo giá hôm nay",{exact:true}).fill("300000000");
 await page.getByLabel("Tháng cần tiền",{exact:true}).fill("06/2029");
 await page.getByRole("button",{name:"Lưu mục tiêu và tính lại",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.goals?.entries?.[0]?.label).toBe("Học phí");
 await expect(page.locator(".allocation-protection").filter({hasText:"Học phí"})).toBeVisible();
 expect(s.errors).toEqual([]);
});
