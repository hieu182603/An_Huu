import{test,expect,type Page,type APIRequestContext}from"@playwright/test";
import{setupDiscovery}from"./discovery-helpers";
test.afterEach(async({page})=>{await page.waitForLoadState("networkidle");});
async function setup(page:Page,request:APIRequestContext){const state=await setupDiscovery(page,request,"/user/risk-portfolio",{allocation:true});await page.goto("/user/goal");await expect(page.getByRole("heading",{name:"Mục tiêu nghỉ hưu",exact:true})).toBeVisible();return state;}

test("goal keeps the demo form then other goals then timeline without duplicate lifestyle controls",async({page,request})=>{
 await setup(page,request);
 const order=await page.locator(".goal-sync-page").evaluate(root=>Array.from(root.children).filter(el=>el.matches("form,.goal-other-goals,.goal-sync-timeline")).map(el=>el.tagName));
 expect(order).toEqual(["FORM","SECTION","OL"]);
 await expect(page.getByRole("radio")).toHaveCount(0);
 await expect(page.getByLabel("Mức sống mong muốn",{exact:true})).toBeVisible();
 await page.getByText("Chỉnh chính xác tháng nghỉ hưu",{exact:true}).click();
 await page.getByLabel("Tháng nghỉ hưu mong muốn",{exact:true}).fill("08/2027");
 await expect(page.getByRole("spinbutton",{name:"Bạn muốn nghỉ hưu năm bao nhiêu tuổi?",exact:true})).toHaveValue("37");
 await expect(page.locator(".goal-sync-timeline")).toContainText("08/2027");
});

test("clearing retirement age keeps it blank and cannot save an invented date",async({page,request})=>{
 const s=await setup(page,request);
 await page.getByRole("spinbutton",{name:"Bạn muốn nghỉ hưu năm bao nhiêu tuổi?",exact:true}).fill("");
 await page.getByLabel("Chuẩn bị quỹ đến tháng",{exact:true}).fill("12/2028");
 await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true}).fill("0");
 await page.getByRole("button",{name:"Lưu và xem kết quả mới",exact:true}).click();
 await expect(page.getByRole("alert")).toBeVisible();
 await expect(page.getByRole("spinbutton",{name:"Bạn muốn nghỉ hưu năm bao nhiêu tuổi?",exact:true})).toHaveValue("");
 expect(s.writes.some(w=>w.path.endsWith("/retirement-goal"))).toBe(false);
});
test("goal uses declared month precision and no sample spending/end date",async({page,request})=>{await setup(page,request);await expect(page.getByLabel("Tháng năm sinh",{exact:true})).toHaveValue("04/1990");await expect(page.getByLabel("Chuẩn bị quỹ đến tháng",{exact:true})).toHaveValue("");await expect(page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true})).toHaveValue("");});
test("goal saves exact money and date/preferences through backend and reload",async({page,request})=>{const s=await setup(page,request);await page.getByLabel("Chuẩn bị quỹ đến tháng",{exact:true}).fill("12/2028");await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true}).fill("9.007.199.254.740.993,25");await page.getByLabel("Mức sống mong muốn",{exact:true}).selectOption("HEALTH");await page.getByRole("button",{name:"Lưu và xem kết quả mới",exact:true}).click();await expect(page).toHaveURL(/\/user\/plan/);expect((await s.get("me/financial-profile")).data.retirementGoal).toEqual({endMonth:"2028-12",monthlyExpenseToday:"9007199254740993.25",lifestylePriority:"HEALTH"});await page.goto("/user/goal");await expect(page.getByLabel("Chuẩn bị quỹ đến tháng",{exact:true})).toHaveValue("12/2028");});
test("invalid dates and failed saves keep input without navigation or fake success",async({page,request})=>{await setup(page,request);await page.getByRole("button",{name:"Lưu và xem kết quả mới",exact:true}).click();await expect(page.getByRole("alert")).toBeVisible();await page.getByLabel("Chuẩn bị quỹ đến tháng",{exact:true}).fill("12/2028");await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true}).fill("0");await page.route("**/api/v1/me/financial-profile/retirement-goal",r=>r.fulfill({status:409,json:{error:{message:"Hồ sơ đã thay đổi"}}}));await page.getByRole("button",{name:"Lưu và xem kết quả mới",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Hồ sơ đã thay đổi");await expect(page).toHaveURL(/\/user\/goal/);await expect(page.getByLabel("Chuẩn bị quỹ đến tháng",{exact:true})).toHaveValue("12/2028");});
test("goal explains month conventions and confirms discarding changes",async({page,request})=>{await setup(page,request);await page.getByRole("button",{name:"Cách xác định mốc nghỉ hưu",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("không tự tạo ngày sinh");await page.keyboard.press("Escape");await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true}).fill("100");await page.getByRole("button",{name:"Hủy",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("chưa lưu");await page.getByRole("button",{name:"Tiếp tục sửa",exact:true}).click();await expect(page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng",{exact:true})).toHaveValue("100");});
for(const[name,width,height]of[["desktop",1440,1000],["tablet",768,1024],["mobile",390,844],["small-mobile",320,740],["landscape",844,390]]as const)test(`goal fits ${name}`,async({page,request},info)=>{await page.setViewportSize({width,height});await setup(page,request);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath("goal.png"),fullPage:true});await page.getByRole("button",{name:"Cách xác định mốc nghỉ hưu",exact:true}).click();await page.screenshot({path:info.outputPath("goal-popup.png")});await page.keyboard.press("Escape");});
