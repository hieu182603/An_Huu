import {expect,test,type Page,type APIRequestContext} from "@playwright/test";
import {setupDiscovery,discoveryApi} from "./discovery-helpers";
const panel=(page:Page)=>page.locator(".allocation-lab-real"),dialog=(page:Page)=>page.getByRole("dialog");
async function setup(page:Page,request:APIRequestContext,options:object={},answer=true){
 const state=await setupDiscovery(page,request,"/user/risk-portfolio",{allocation:true,...options});
 await expect(page.getByRole("heading",{name:"Phân bổ tài sản",exact:true})).toBeVisible();
 if((options as any).emptyPolicy)return state;
 await page.getByLabel("Tháng kết thúc kế hoạch",{exact:true}).fill("12/2027");await page.getByLabel("Thời gian cần giữ thanh khoản",{exact:true}).fill("12");
 if(answer){await page.locator(".allocation-steps button").nth(2).click();for(const group of await page.getByRole("radiogroup").all())await group.getByRole("radio").first().click();await expect(panel(page).getByRole("heading",{name:"Fixture CAUTIOUS",exact:true})).toBeVisible();}
 return state;
}
test("capital uses canonical profile purposes and current glide weights without sample returns",async({page,request})=>{
 const s=await setup(page,request);await expect(page.locator(".allocation-capital")).toContainText("1.000.000.000");await expect(page.locator(".allocation-capital-total")).toContainText("904.000.000");
 await expect(panel(page).locator(".allocation-breakdown")).toContainText("100%");await expect(panel(page)).not.toContainText("7,5%");await expect(page.locator(".allocation-life")).toContainText("0 năm tròn");
 expect(s.writes.every(w=>w.path.endsWith("/preview"))).toBe(true);expect(s.errors).toEqual([]);
});
test("three steps retain input and existing policy questionnaire radio UI",async({page,request})=>{
 await setup(page,request,{},false);await page.locator(".allocation-steps button").nth(1).click();await expect(page.locator(".allocation-protection")).toContainText("16.000.000");await page.locator(".allocation-steps button").nth(0).click();await expect(page.getByLabel("Tháng kết thúc kế hoạch",{exact:true})).toHaveValue("12/2027");
 await page.locator(".allocation-steps button").nth(2).click();await expect(page.locator(".risk-question-card")).toHaveCount(6);expect(await page.locator("#risk-survey").evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual((await page.locator(".allocation-workbench").evaluate(el=>el.getBoundingClientRect().width))-1);await expect(page.locator(".risk-choice__dot")).toHaveCount(12);await expect(page.getByRole("radiogroup")).toHaveCount(6);
 await page.getByRole("radiogroup").first().getByRole("radio").first().click();await expect(page.getByRole("radiogroup").first().getByRole("radio").first()).toHaveAttribute("aria-checked","true");
});
test("missing horizon and answers never show an allocation or enable apply",async({page,request})=>{
 await setupDiscovery(page,request,"/user/risk-portfolio",{allocation:true});await expect(page.getByText("Chọn tháng kết thúc kế hoạch ở bước 1.")).toBeVisible();await expect(page.locator(".allocation-breakdown")).toHaveCount(0);await expect(page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true})).toBeDisabled();
});
test("unknown and negative capital stay explicit and cannot be applied",async({page,request})=>{
 await setup(page,request,{unknownCapital:true});await expect(page.locator(".allocation-capital-total")).toContainText("Chưa xác định");await expect(page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true})).toBeDisabled();
 await setup(page,request,{negative:true});await expect(page.locator(".allocation-capital-total")).toContainText("Còn thiếu");await expect(page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true})).toBeDisabled();
});
test("unpublished policy is unconfigured without fabricated portfolios",async({page,request})=>{
 await setup(page,request,{emptyPolicy:true});await expect(page.getByText("Chưa có chính sách danh mục đã công bố.",{exact:false})).toBeVisible();await expect(page.locator(".allocation-lab-real")).toHaveCount(0);
});
test("failed workspace hides prior capital/results and retry uses the server",async({page,request})=>{
 await setup(page,request);let fail=true;await page.route("**/api/v1/me/portfolio-policies/workspace/preview",route=>fail?route.fulfill({status:503,json:{error:{message:"Chưa tính được phân bổ"}}}):route.fallback());
 await page.getByRole("button",{name:"Tính lại phân bổ",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Chưa tính được phân bổ");await expect(page.locator(".allocation-capital-total")).toContainText("Chưa xác định");await expect(page.locator(".allocation-breakdown")).toHaveCount(0);
 fail=false;await page.getByRole("button",{name:"Thử lại",exact:true}).click();await expect(page.locator(".allocation-capital-total")).toContainText("904.000.000");
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
 await page.setViewportSize({width,height});const s=await setup(page,request);await page.locator(".allocation-steps button").nth(0).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath("allocation.png"),fullPage:true});const fit=await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=innerWidth+1,overflow:[...document.querySelectorAll("*")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width}))}));expect(fit.fits,JSON.stringify(fit.overflow)).toBe(true);
 await page.getByRole("button",{name:"Giải thích: Mục tiêu gần hạn",exact:true}).click();await page.screenshot({path:info.outputPath("capital-popup.png")});await page.keyboard.press("Escape");await page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true}).click();await page.screenshot({path:info.outputPath("apply-popup.png")});await page.keyboard.press("Escape");expect(s.errors).toEqual([]);
});

test("blocked draft storage keeps the confirmation open without claiming application",async({page,request})=>{
 const s=await setup(page,request);await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith("anhuu:plan-draft:"))throw new DOMException("Storage blocked","SecurityError");return original.call(this,key,value);};});
 await page.getByRole("button",{name:"Áp dụng vào bản xem trước",exact:true}).click();await dialog(page).getByRole("button",{name:"Xác nhận dùng trong bản nháp",exact:true}).click();await expect(dialog(page).getByRole("alert")).toContainText("Chưa giữ được bản nháp");await expect(page).toHaveURL(/risk-portfolio/);expect(s.errors).toEqual([]);
});
test("blocked survey draft storage leaves current answers usable and shows an explicit error",async({page,request})=>{
 await setup(page,request,{},false);await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith("anhuu:risk:"))throw new DOMException("Storage blocked","SecurityError");return original.call(this,key,value);};});
 await page.locator(".allocation-steps button").nth(2).click();for(const group of await page.getByRole("radiogroup").all())await group.getByRole("radio").first().click();await expect(panel(page).getByRole("heading",{name:"Fixture CAUTIOUS",exact:true})).toBeVisible();await expect(page.getByRole("alert")).toContainText("Chưa giữ được câu trả lời");
});
test("English allocation labels and unconfigured guidance remain translated",async({page,request})=>{
 await page.addInitScript(()=>localStorage.setItem("anhuu_language","en"));await setupDiscovery(page,request,"/user/risk-portfolio",{allocation:true,emptyPolicy:true});await expect(page.getByRole("heading",{name:"Asset allocation",exact:true})).toBeVisible();await expect(page.getByText("No published portfolio policy is available.",{exact:false})).toBeVisible();
});

test("amount-mode risk tolerance displays and saves the entered amount without using the old percent",async({page,request})=>{
 const s=await setup(page,request);await page.getByRole("button",{name:"Khả năng chịu rủi ro →",exact:true}).click();await page.getByRole("combobox").selectOption("amount");await page.getByLabel("Mức giảm tối đa có thể chấp nhận (VND)",{exact:true}).fill("90400000");await expect(page.getByText("Tương đương trên phần vốn dài hạn đang xét:",{exact:false})).toContainText("90.400.000");await page.getByRole("button",{name:"Cập nhật và tính lại",exact:true}).click();await expect(page).not.toHaveURL(/section=risk/);expect((await s.get("me/financial-profile")).data.lossTolerance.percent.value).toBe("10");
});
test("multiple eligible portfolios require an explicit choice and switching/reset uses actual weights",async({page,request})=>{
 await setup(page,request,{multiple:true},false);await page.locator(".allocation-steps button").nth(2).click();for(const group of await page.getByRole("radiogroup").all())await group.getByRole("radio").first().click();await expect(panel(page)).toContainText("Có nhiều phương án phù hợp");await expect(panel(page).getByRole("button",{name:"Fixture GROWTH",exact:true})).toBeEnabled();await panel(page).getByRole("button",{name:"Fixture GROWTH",exact:true}).click();await expect(panel(page).getByRole("heading",{name:"Fixture GROWTH",exact:true})).toBeVisible();await expect(panel(page).locator(".allocation-breakdown")).toContainText("30%");await expect(panel(page).locator(".allocation-breakdown")).toContainText("271.200.000");await panel(page).getByRole("button",{name:"Đặt lại theo câu trả lời",exact:true}).click();await expect(panel(page)).toContainText("Có nhiều phương án phù hợp");await expect(panel(page).locator(".allocation-breakdown")).toHaveCount(0);
});
