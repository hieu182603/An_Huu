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

test("independent percent and amount loss caps survive saves and the risk editor",async({page,request})=>{
 const s=await setupDiscovery(page,request,"/user/risk-portfolio",{customAllocation:true},true);
 await page.locator(".allocation-steps button").nth(1).click();
 await page.getByRole("checkbox",{name:"Đặt thêm giới hạn số tiền riêng",exact:true}).check();
 const fields=page.locator(".allocation-loss-fields"),percent=fields.getByLabel(/Theo phần trăm/),amount=fields.getByLabel(/Giới hạn số tiền riêng/);
 await percent.fill("20");await amount.fill("1000000");await percent.fill("15");
 await expect(amount).toHaveValue("1.000.000");
 await page.getByRole("button",{name:"Lưu mức giảm",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.lossTolerance).toMatchObject({inputMode:"BOTH",percent:{value:"15"},amountVnd:{value:"1000000"}});
 await expect(page.locator(".allocation-loss-saved")).toContainText("Áp dụng mức thấp hơn");
 await page.getByRole("button",{name:"Khả năng chịu rủi ro",exact:true}).click();
 await expect(page.getByLabel("Hình thức chọn",{exact:true})).toHaveValue("both");
 await expect(page.getByLabel("Giới hạn số tiền riêng (VND)",{exact:true})).toHaveValue("1000000");
 await page.getByRole("button",{name:"Cập nhật và tính lại",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.lossTolerance).toMatchObject({inputMode:"BOTH",percent:{value:"15"},amountVnd:{value:"1000000"}});
 expect(s.errors).toEqual([]);
});

test("obligation schedule and liquidity matching require an explicit customer confirmation",async({page,request})=>{
 const s=await setupDiscovery(page,request,"/user/risk-portfolio",{customAllocation:true},true),record=await s.get("me/financial-profile");
 const valuation=record.data.valuationDate.slice(0,7),due=`${Number(valuation.slice(0,4))+3}${valuation.slice(4)}`;
 const result=await request.patch(`${discoveryApi}/api/v1/me/financial-profile`,{headers:{Authorization:`Bearer ${s.fixture.accessToken}`},data:{expectedRevision:record.revision,changes:{schemaVersion:2,
  goals:{status:"KNOWN",entries:[{id:"same-cash-need",label:"Học phí đã khai",amountToday:{status:"KNOWN",value:"300000000"},dueMonth:{status:"KNOWN",value:due},priority:{status:"KNOWN",value:"ESSENTIAL"},deferrable:{status:"KNOWN",value:false}}]},
  liquidityNeeds:{y1:{status:"KNOWN",value:"0"},y3:{status:"KNOWN",value:"300000000"},y5:{status:"KNOWN",value:"300000000"}}}}});
 expect(result.ok(),await result.text()).toBe(true);
 await page.reload();
 const schedule=page.locator(".allocation-obligations");await schedule.locator("summary").click();
 await expect(schedule).toContainText("Học phí đã khai");
 const match=page.getByRole("button",{name:"Xác nhận cùng khoản: Học phí đã khai",exact:true});await expect(match).toBeVisible();
 expect((await s.get("me/financial-profile")).data.liquidityNeeds.y3.matchedGoalId).toBeUndefined();
 await match.click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.liquidityNeeds.y3.matchedGoalId).toBe("same-cash-need");
 expect((await s.get("me/financial-profile")).data.liquidityNeeds.y1).toEqual({status:"KNOWN",value:"0"});
 await page.reload();await expect(page.locator(".allocation-liquidity-review")).toContainText("Đã xác nhận cùng khoản với");
 await page.getByRole("button",{name:"Bỏ xác nhận trùng",exact:true}).click();
 await expect.poll(async()=>(await s.get("me/financial-profile")).data.liquidityNeeds.y3.matchedGoalId).toBeUndefined();
 expect(s.errors).toEqual([]);
});

test("stress dialog shows every crash timing, sequence balances and severe gold spread",async({page,request})=>{
 const s=await setup(page,request),lab=page.locator(".allocation-experiment");
 const outcome={funded:false,essentialLossToday:"1000000",unfundedWithdrawals:"1000000",fundedTerminalBalance:"0",firstShortfallMonth:"2027-04"};
 await page.route("**/api/v1/me/retirement/risk/scenarios",route=>route.fulfill({json:{meta:{requestId:"stress-detail"},data:{status:"READY",scenarios:[
  {kind:"EQUITY_CRASH",level:"SEVERE",status:"READY",result:outcome,offsets:[-12,0,12,24].map(offsetMonths=>({offsetMonths,status:"READY",result:outcome}))},
  {kind:"SEQUENCE_OF_RETURNS",status:"READY",result:{...outcome,lossFirstTerminalBalance:"775000000",gainFirstTerminalBalance:"820000000",balanceDifference:"45000000"}},
  {kind:"GOLD",level:"SEVERE",status:"READY",parameters:{spreadPoints:"10"},result:outcome},
  {kind:"CREDIT",status:"REVIEW_REQUIRED",issues:["APPROVED_SCENARIO_PARAMETERS_REQUIRED"]}]}}}));
 await lab.getByRole("button",{name:"Thử các biến cố với phương án này",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByText("Xem 4 thời điểm sốc",{exact:true}).click();
 await expect(dialog.getByRole("rowheader",{name:"12 tháng trước nghỉ hưu",exact:true})).toBeVisible();
 await expect(dialog.getByRole("rowheader",{name:"24 tháng sau nghỉ hưu",exact:true})).toBeVisible();
 await expect(dialog).toContainText("775.000.000");await expect(dialog).toContainText("820.000.000");await expect(dialog).toContainText("45.000.000");
 await expect(dialog.getByRole("row").filter({hasText:"chênh giá mua/bán 10%"})).toContainText("mức nặng");
 await expect(dialog).toContainText("04/2027");
 // A scenario without approved parameters is not a table row the customer cannot act on; it is listed once below the table.
 await expect(dialog.getByRole("rowheader",{name:"Rủi ro tín dụng",exact:true})).toHaveCount(0);
 await expect(dialog.getByTestId("scenarios-awaiting-parameters")).toHaveText("Chưa chạy vì chưa có tham số được duyệt: Rủi ro tín dụng.");
 expect(s.errors).toEqual([]);
});
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
 // The test server's policy has no approved stress parameters: the dialog then lists them as awaiting parameters
 // instead of rows. Either way the run finished; what matters here is that it used the custom weights.
 await lab.getByRole("button",{name:"Thử biến cố với tỷ trọng tự chọn",exact:true}).click();await expect(page.getByRole("dialog").locator("tbody tr, [data-testid=scenarios-awaiting-parameters]").first()).toBeVisible();
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
// Spec §7.4 step 4 (group A fix 19/11/2026): an infeasible plan shows behavioural adjustments from a separate run
// on the reference allocation and the same paths; essential spending is never offered as a cut.
test("an infeasible plan asks the server for adjustments on the reference allocation and shows each lever",async({page,request})=>{
 const state=await setup(page,request),lab=page.locator(".allocation-experiment");await expect(lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true})).toBeEnabled();
 let reference:{selection:{templateId:string};paths:number}|undefined,asked:{plan:{preview:{templateId:string}};paths:number;detail:string}|undefined;
 await page.route("**/api/v1/me/retirement/risk/selection",async route=>{
  const response=await route.fetch({url:discoveryApi+"/api/v1/me/retirement/risk/selection",headers:{...route.request().headers(),Authorization:`Bearer ${state.fixture.accessToken}`}});
  const body=await response.json();Object.assign(body.data,{status:"INSUFFICIENT",selectedId:null,referenceKind:"BEST_WITHIN_LOSS_LIMIT",adjustmentsOmitted:true});
  body.data.rejected=[...(body.data.rejected??[]),{id:"WIDE",issues:["WEIGHT_BOUND_EXCEEDED"]}];
  reference=body.data.candidates.find((r:{id:string})=>r.id===body.data.referenceId);await route.fulfill({response,json:body});
 });
 await page.route("**/api/v1/me/retirement/risk/adjustments",async route=>{asked=route.request().postDataJSON();await route.fulfill({json:{meta:{requestId:"mock"},data:{status:"READY",threshold:"0.90",paths:17,baselinePEssential:0.82,evaluations:9,
  contribution:{status:"FOUND",issues:[],evaluations:4,pEssential:0.94,requiredMonthlyContribution:"6500000",additionalMonthlyContribution:"3500000",withinCapacityEveryMonth:true},
  retirement:{status:"NOT_FEASIBLE",issues:["THRESHOLD_NOT_REACHED_WITHIN_DELAY_LIMIT"],evaluations:1,pEssential:null,retirementMonth:null,delayMonths:null},
  optionalSpending:{status:"NOT_APPLICABLE",issues:["NO_OPTIONAL_SPENDING_DECLARED"],evaluations:0,pEssential:null,cutPercent:null,keepPercent:null,monthlyOptionalToday:null,monthlyCutToday:null}}}});});
 await lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true}).click();
 const card=page.locator(".allocation-adjustments");await expect(card).toBeVisible();
 await expect(card.locator("li.is-found")).toContainText("6.500.000");await expect(card.locator("li.is-found")).toContainText("94%");
 await expect(card).toContainText("Lùi nghỉ hưu tới 10 năm vẫn chưa đạt ngưỡng.");
 await expect(card).toContainText("An Hưu không đề xuất cắt chi tiêu thiết yếu.");
 expect(asked?.detail).toBe("ALLOCATION_V2");expect(asked?.paths).toBe(reference?.paths);expect(asked?.plan.preview.templateId).toBe(reference?.selection.templateId);
 await expect(page.locator(".allocation-why-table")).toContainText("Vượt giới hạn tỷ trọng của chính sách");
 expect(state.errors).toEqual([]);
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

// Loss-limit and missing-data states (algorithm §10.4; customer decision 18/11/2026): always a reference, never a fake probability.
const lossRow={informationalOnly:true,status:"WITHIN_LIMIT",message:"",issues:[],growthCapital:"666000000",lossAmount:"50000000",lossPercentOfGrowth:"7.5",lossPercentOfInvestableAssets:null,allowedLossAmount:"99900000",exceedsTolerance:false,maxEquityWeightPercent:"20",proposedLossAmount:"50000000",proposedAllocations:[]};
async function mockSelection(page:Page,request:APIRequestContext,data:Record<string,unknown>){const state=await setupDiscovery(page,request,"/user/risk-portfolio",{customAllocation:true},true);await page.route("**/api/v1/me/retirement/risk/selection",route=>route.fulfill({json:{data,meta:{requestId:"mock"}}}));await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();await expect(page.locator(".allocation-results-heading h2")).toBeVisible();return state;}
test("without published market data the page shows the policy allocation checked against the loss limit and no probability",async({page,request})=>{

 const s=await mockSelection(page,request,{status:"DATA_REQUIRED",issues:["PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED"],marketVersionId:null,marketVersion:null,marketHash:null,deterministic:{basis:"PINNED_DETERMINISTIC_ASSUMPTIONS",referenceId:"BASE",referenceKind:"TEMPLATE_UNSIMULATED",
  candidates:[{id:"BASE",changePoints:"0",targets:[[{assetClass:"STOCK",weightPercent:"20"},{assetClass:"BOND",weightPercent:"80"}]],loss:lossRow,withinLossLimit:true,essentialLossToday:"0",funded:true,fundedTerminalBalance:"0"}],
  rejected:[],lossFeasibility:null,applicable:false,applyIssues:["PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED"],limitations:["NO_PROBABILITY_WITHOUT_PUBLISHED_MARKET_DATA"]}});
 await expect(page.locator(".allocation-results-heading h2")).toHaveText("Phương án theo chính sách, chưa mô phỏng");
 const card=page.locator(".allocation-experiment .allocation-reference");
 await expect(card.locator(".allocation-loss-badge")).toHaveText("Trong giới hạn chịu lỗ");
 await expect(card.locator(".allocation-breakdown dd strong").first()).toHaveText("20%");
 await expect(card.locator(".allocation-success")).toHaveCount(0);await expect(card.locator(".allocation-data-missing")).toBeVisible();
 await expect(card.locator(".allocation-reference-actions .overview-button.primary")).toBeDisabled();
 expect(s.errors).toEqual([]);
});
test("when nothing fits the loss limit the least-loss allocation is a reference only with the minimum limit to accept",async({page,request})=>{

 const s=await mockSelection(page,request,{status:"INSUFFICIENT",issues:["NO_CANDIDATE_WITHIN_LOSS_LIMIT"],selectedId:null,threshold:"0.9",referenceId:"LEAST_LOSS",referenceKind:"LEAST_LOSS_OVER_LIMIT",allThreshold:null,
  lossFeasibility:{minimumLossAmount:"121545000",allowedLossAmount:"99900000",requiredToleranceAmountVnd:"121545000",requiredTolerancePercentOfGrowth:"18.3"},
  candidates:[{status:"READY",id:"LEAST_LOSS",changePoints:"45",targets:[[{assetClass:"STOCK",weightPercent:"0"},{assetClass:"BOND",weightPercent:"100"}]],pEssential:0.4,pAll:0.3,paths:120,cvarEssentialShortfallToday:"0",selection:null,withinLossLimit:false,applicable:false,applyIssues:["LOSS_CONSTRAINT_EXCEEDED"],loss:{...lossRow,status:"NOT_FEASIBLE",exceedsTolerance:true,lossAmount:"121545000"}}],
  rejected:[{id:"BASE",issues:["LOSS_CONSTRAINT_EXCEEDED"]}],rule:"P_ESSENTIAL_THRESHOLD_THEN_MIN_CVAR_THEN_MIN_ALLOCATION_CHANGE"});
 await expect(page.locator(".allocation-results-heading h2")).toHaveText("Chưa có phương án trong giới hạn chịu lỗ");
 const card=page.locator(".allocation-experiment .allocation-reference");
 await expect(card.locator(".allocation-loss-badge")).toHaveText("Vượt giới hạn chịu lỗ");
 await expect(card.getByRole("heading",{level:2})).toHaveText("Danh mục tham khảo, vượt giới hạn");
 await expect(card.locator(".allocation-result-callout.is-over")).toContainText("cần chấp nhận giảm tối thiểu 18,3% vốn dài hạn");
 await expect(card.locator(".allocation-reference-actions .overview-button.primary")).toBeDisabled();
 expect(s.errors).toEqual([]);
});

// Task C1: runs start at 20 paths; a runtime limit with saved progress is continued with continuation:true and the
// customer can raise the paths in steps (cached paths are reused server-side). Selection answers are mocked here
// so the tests do not depend on the backend change.
async function openWithSelection(page:Page,request:APIRequestContext,answer:(body:{paths:number;continuation?:boolean},index:number,real:()=>Promise<{data:Record<string,unknown>}>)=>Promise<Record<string,unknown>>){
 const state=await setupDiscovery(page,request,"/user/risk-portfolio",{customAllocation:true},true),bodies:Array<{paths:number;continuation?:boolean}>=[];
 await page.route("**/api/v1/me/retirement/risk/selection",async route=>{
  const body=route.request().postDataJSON();bodies.push(body);
  const real=async()=>{const response=await route.fetch({url:discoveryApi+"/api/v1/me/retirement/risk/selection",headers:{...route.request().headers(),Authorization:`Bearer ${state.fixture.accessToken}`}});return await response.json();};
  const data=await answer(body,bodies.length-1,real);await route.fulfill({json:{data,meta:{requestId:"mock"}}});
 });
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();
 await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();await expect(page.locator(".allocation-experiment")).toBeVisible();
 return {state,bodies};
}
const withPaths=(data:Record<string,unknown>,paths:number)=>({...data,pathMilestones:[20,50,100,200,500,1000],preliminary:paths<1000,candidates:(data.candidates as Array<Record<string,unknown>>).map(c=>({...c,paths,thresholdUndecided:false}))});
test("a runtime limit with saved progress is continued with continuation:true and shows progress and milestones",async({page,request})=>{
 const {state,bodies}=await openWithSelection(page,request,async(body,index,real)=>{
  if(index===0)return {status:"LIMIT_EXCEEDED",issues:["RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED"],progress:{pathsCompleted:8,pathsRequested:body.paths}};
  await new Promise(r=>setTimeout(r,1200));return withPaths((await real()).data,body.paths);
 });
 const lab=page.locator(".allocation-experiment");
 await expect(lab.locator(".allocation-paths")).toContainText("Đã chạy 8/20 kịch bản");
 await expect(lab.locator(".allocation-paths")).toContainText("Đang dùng 20 kịch bản (ước tính sơ bộ, chuẩn của phương pháp là ≥ 1.000)");
 await expect(lab.locator(".allocation-paths").getByRole("button",{name:"Tăng lên 50 kịch bản",exact:true})).toBeEnabled();
 await expect(lab.locator(".allocation-paths")).toContainText("Các kịch bản đã chạy được giữ lại, chỉ chạy phần mới.");
 expect(bodies.length).toBe(2);expect(bodies[0].paths).toBe(20);expect(bodies[0].continuation).toBeUndefined();
 expect(bodies[1].paths).toBe(20);expect(bodies[1].continuation).toBe(true);expect(state.errors).toEqual([]);
});
test("raising the scenarios to the next milestone re-runs the selection with that paths value",async({page,request})=>{
 const {state,bodies}=await openWithSelection(page,request,async(body,_i,real)=>withPaths((await real()).data,body.paths));
 const lab=page.locator(".allocation-experiment"),box=lab.locator(".allocation-paths");
 await expect(box).toContainText("Đang dùng 20 kịch bản");
 await box.getByRole("button",{name:"Tăng lên 50 kịch bản",exact:true}).click();
 await expect(box).toContainText("Đang dùng 50 kịch bản");await expect(box.getByRole("button",{name:"Tăng lên 50 kịch bản"})).toHaveCount(0);
 expect(bodies.at(-1)?.paths).toBe(50);expect(bodies.at(-1)?.continuation).toBeUndefined();expect(bodies[0].paths).toBe(20);expect(state.errors).toEqual([]);
});

for(const rejected of [false,true])test(`customer essential threshold ${rejected?"keeps the old result after 422":"uses the policy range and reaches the risk request"}`,async({page,request},info)=>{
 const state=await setupDiscovery(page,request,"/user/risk-portfolio",{customAllocation:true},true);
 await page.route(`**/api/v1/me/portfolio-policies/${state.fixture.policyId}`,async route=>{const response=await route.fetch({url:discoveryApi+new URL(route.request().url()).pathname,headers:{...route.request().headers(),Authorization:`Bearer ${state.fixture.accessToken}`}});const answer=await response.json();answer.data.data.allocationRisk.essentialThresholdRange={min:"0.80",max:"0.95"};await route.fulfill({json:answer});});
 let result:Record<string,unknown>|undefined,chosen:Record<string,unknown>|undefined;
 await page.route("**/api/v1/me/retirement/risk/selection",async route=>{const body=route.request().postDataJSON();if(body.essentialThreshold){chosen=body;if(rejected)return route.fulfill({status:422,json:{error:{message:"Ngưỡng đủ chi nằm ngoài khoảng được duyệt."}}});}if(!result){const response=await route.fetch({url:discoveryApi+"/api/v1/me/retirement/risk/selection",headers:{...route.request().headers(),Authorization:`Bearer ${state.fixture.accessToken}`},postData:JSON.stringify({...body,essentialThreshold:undefined})});result=(await response.json()).data;}const candidates=result!.candidates as Array<Record<string,unknown>>;
 // This mock checks threshold wiring, not a new backend simulation; omit base-90 explanations after an override.
 await route.fulfill({json:{data:{...result,threshold:body.essentialThreshold??"0.9",...(body.essentialThreshold?{explanation:[]}:{}),...(body.trialAllocation?{candidates:[...candidates,{...candidates[0],id:"CUSTOM",thresholdUndecided:true}]}:{})}}});});
 await page.reload();await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();await page.getByRole("button",{name:"Xem phương án của tôi →",exact:true}).click();
 const lab=page.locator(".allocation-experiment"),select=lab.getByLabel("Ngưỡng đủ chi thiết yếu",{exact:true});
 await expect(select).toBeEnabled();await expect(select).toHaveValue("0.9000");await expect(select.locator("option")).toHaveText(["80%","85%","90%","95%"]);await expect(lab.locator(".allocation-threshold-used")).toHaveText("Đang dùng ngưỡng 90%");
 const before=await lab.locator(".allocation-reference").innerText();await select.selectOption("0.9500");await expect.poll(()=>chosen?.essentialThreshold).toBe("0.9500");
 if(rejected){await expect(lab.getByRole("alert")).toContainText("ngoài khoảng được duyệt");await expect(select).toHaveValue("0.9000");await expect(lab.locator(".allocation-threshold-used")).toHaveText("Đang dùng ngưỡng 90%");await expect.poll(()=>lab.locator(".allocation-reference").innerText()).toBe(before);}
 else{await expect(lab.locator(".allocation-threshold-used")).toHaveText("Đang dùng ngưỡng 95%");await expect(select).toHaveValue("0.9500");await lab.getByRole("button",{name:"Kiểm tra phương án tự chọn",exact:true}).click();await expect(lab.locator(".allocation-tested")).toContainText("Khoảng tin cậy còn vắt qua ngưỡng 95%");await expect(lab.locator(".allocation-tested")).not.toContainText("ngưỡng 90%");for(const width of [1440,375]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(width===375)expect(await lab.locator(".allocation-why-table").evaluate(table=>{const issues:string[]=[],container=table.parentElement!.getBoundingClientRect();for(const [index,row] of Array.from(table.querySelectorAll("tbody tr")).entries()){const bounds=row.getBoundingClientRect(),mix=row.querySelector("th small"),first=row.querySelector("td");if(bounds.left<container.left-1||bounds.right>container.right+1)issues.push(`card ${index} exceeds comparison`);if(mix&&first&&mix.getBoundingClientRect().bottom>first.getBoundingClientRect().top+1)issues.push(`card ${index} allocation overlaps first metric`);for(const cell of Array.from(row.children)){const rect=cell.getBoundingClientRect();if(rect.left<bounds.left-1||rect.right>bounds.right+1)issues.push(`card ${index} cell exceeds bounds`);for(const node of Array.from(cell.childNodes))if(node.nodeType===Node.TEXT_NODE&&node.textContent?.trim()){const range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();if(text.left<bounds.left-1||text.right>bounds.right+1)issues.push(`card ${index} value exceeds bounds`);}}}return issues;})).toEqual([]);
 await lab.screenshot({path:info.outputPath(`threshold-${width}.png`)});}}
 expect(state.errors).toEqual([]);
});

async function setupT9SavedPlan(page:Page,request:APIRequestContext,savedTemplateId?:string){
 const state=await setupDiscovery(page,request,"/user/risk-portfolio",{customAllocation:true},true);
 const planId="ca531001-0000-4000-8000-000000000001",versionId="ca531001-0000-4000-8000-000000000002",revision=state.fixture.profile.revision;
 const version={id:versionId,planId,version:1,profileRevision:revision,snapshotHash:"synthetic-t9",preview:{status:"READY",profileRevision:revision,inputHash:"synthetic-t9",selection:{...state.fixture.allocationCommand,...(savedTemplateId?{templateId:savedTemplateId}:{}),expectedProfileRevision:revision,monthlyExpenseToday:"10000000",monthlyContribution:"0",scenario:"BASE",terminalBalance:"0"},calculation:{summary:{retirementMonth:"2027-01"},rows:[]},issues:[],warnings:[]}};
 const plan={id:planId,userId:"USR-001",revision:1,currentVersionId:versionId,baselineVersionId:versionId,current:version,stale:false,profileChanged:false,actualSourceChanged:false,updates:{assumptions:null,policy:null}};
 await page.route("**/api/v1/me/retirement/plans**",route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:{data:path.endsWith("/plans")?{items:[plan],page:1,limit:50,total:1}:path.endsWith("/versions")?{items:[],page:1,limit:50,total:0}:plan}});});
 const product=state.fixture.products[0];
 await page.route("**/api/v1/investments/holdings",route=>route.fulfill({json:{data:{status:"READY",products:[product],holdings:[{id:"synthetic-holding",revision:1,productId:product.id,productName:product.name,quantity:"600",costBasis:"10000",currentPrice:"10000",assetClass:"BOND",priceAsOf:"2026-11-20",sourceKind:"TEST_FIXTURE",sourceReference:"Synthetic T9 fixture",stale:false,lockedUntil:null}],summary:{totalValue:"6000000",totalCost:"6000000",totalUnrealizedGainLoss:"0",holdings:[{productId:product.id,currentValue:"6000000",unrealizedGainLoss:"0",weightPercent:"100"}]}}}}));
 await page.route("**/api/v1/investments/recommendations",route=>route.fulfill({json:{data:[]}}));
 await page.reload();await expect(page.locator(".risk-portfolio-page")).toBeVisible();
 return {...state,planId,versionId};
}

test("holdings monitor separates cash-closes-drift from rounded reference BUY orders",async({page,request},info)=>{
 const state=await setupT9SavedPlan(page,request),product=state.fixture.products[0];
 let query:URLSearchParams|undefined,orderBody:Record<string,unknown>|undefined;
 await page.route("**/api/v1/me/investments/holdings/drift?*",route=>{query=new URL(route.request().url()).searchParams;return route.fulfill({json:{data:{persisted:false,isDrifted:true,maxDriftPercent:"20",driftThresholdPercent:"5",rebalanceRequired:false,rebalanceRecommendation:{status:"WITHIN_BAND",costEstimated:"0",cashUsedBeforeTrades:"1000000",unallocatedCash:"0"}}}});});
 await page.route("**/api/v1/me/investments/holdings/rebalance-orders",route=>{orderBody=route.request().postDataJSON();return route.fulfill({json:{data:{persisted:false,drift:{isDrifted:true,maxDriftPercent:"20",driftThresholdPercent:"5",rebalanceRequired:true,rebalanceStatus:"PROPOSED",costEstimated:"1000",cashUsedBeforeTrades:"1000000"},orders:[{productId:product.id,productName:product.name,action:"BUY",units:100,lotSize:100,estimatedPrice:"10000",estimatedAmount:"1000000"}]}}});});
 await page.goto("/user/investments");await expect(page.locator(".investment-page")).toBeVisible();
 await page.getByLabel("Tiền dự định góp thêm",{exact:true}).fill("1000000");
 await page.getByRole("button",{name:"Kiểm tra độ lệch",exact:true}).click();
 const monitor=page.getByTestId("holdings-monitor");await expect(monitor).toContainText("Có lệch vượt dải mục tiêu");await expect(monitor).toContainText("Chưa cần tái cân bằng");
 await expect(monitor).toContainText("Tiền mặt được dùng trước giao dịch: 1.000.000 ₫");
 expect(Object.fromEntries(query!)).toEqual({planId:state.planId,versionId:state.versionId,newContribution:"1000000"});
 await page.getByRole("button",{name:"Xem lệnh tham khảo",exact:true}).click();
 await expect(monitor).toContainText("Vẫn cần tái cân bằng");
 const row=monitor.getByRole("row",{name:new RegExp(product.name)});await expect(row.getByRole("cell")).toHaveText(["Mua","100","100","10.000 ₫","1.000.000 ₫"]);
 await expect(monitor).toContainText("Thành tiền mua đã bao gồm phần tiền mặt phân bổ");
 for(const width of [1440,375]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await monitor.screenshot({path:info.outputPath(`holdings-orders-${width}.png`)});}
 expect(orderBody).toEqual({planId:state.planId,versionId:state.versionId,newContribution:"1000000"});expect(state.errors).toEqual([]);
});

test("holdings monitor keeps a safety-floor review unresolved and hides reference orders",async({page,request})=>{
 const state=await setupT9SavedPlan(page,request);
 await page.route("**/api/v1/me/investments/holdings/rebalance-orders",route=>route.fulfill({json:{data:{persisted:false,drift:{isDrifted:false,maxDriftPercent:"2",driftThresholdPercent:"5",rebalanceRequired:false,rebalanceStatus:"REVIEW_REQUIRED",costEstimated:"0",cashUsedBeforeTrades:"0"},orders:[]}}}));
 await page.goto("/user/investments");await page.getByRole("button",{name:"Xem lệnh tham khảo",exact:true}).click();
 const monitor=page.getByTestId("holdings-monitor");await expect(monitor).toContainText("Trong dải mục tiêu");await expect(monitor).toContainText("Cần rà soát dữ liệu trước khi kết luận");
 await expect(monitor).toContainText("sàn bảo vệ chi tiêu");await expect(monitor).not.toContainText("Chưa cần tái cân bằng");await expect(monitor).not.toContainText("Chi phí dự tính");
 await expect(monitor.getByRole("heading",{name:"Lệnh tham khảo đã làm tròn theo lô"})).toHaveCount(0);expect(state.errors).toEqual([]);
});

for(const ready of [true,false])test(`rebalance records ${ready?"an accepted decision with null comparison":"a dismissed decision while probability comparison needs review"}`,async({page,request},info)=>{
 const state=await setupT9SavedPlan(page,request),decisionId="ca531001-0000-4000-8000-000000000003";
 let proposalBody:Record<string,unknown>|undefined,decisionBody:Record<string,unknown>|undefined;
 let row={id:decisionId,createdAt:"2026-11-20T03:00:00.000Z",decision:"PROPOSED",note:null as string|null,costEstimate:"1000",trigger:"SPENDING_FLOOR_BREACHED",probabilityBefore:null,probabilityAfter:ready?0.95:null};
 await page.route("**/api/v1/me/retirement/risk/rebalance",route=>{proposalBody=route.request().postDataJSON();return route.fulfill({json:{data:{status:"PROPOSED",persisted:true,decisionId,decision:"PROPOSED",oldWeights:[{assetClass:"BOND",weightPercent:"80"},{assetClass:"STOCK",weightPercent:"20"}],targetWeights:[{assetClass:"BOND",weightPercent:"82"},{assetClass:"STOCK",weightPercent:"18"}],newWeights:[{assetClass:"BOND",weightPercent:"82"},{assetClass:"STOCK",weightPercent:"18"}],cost:"1000",netValue:"9999000",bandPoints:"5",trigger:"SPENDING_FLOOR_BREACHED",probabilityComparison:{status:ready?"READY":"REVIEW_REQUIRED",paths:20,before:ready?null:0.25,after:ready?0.95:0.99},trades:[]}}});});
 await page.route(`**/api/v1/me/retirement/risk/rebalance/${decisionId}/decision`,route=>{decisionBody=route.request().postDataJSON();row={...row,decision:String(decisionBody!.decision),note:String(decisionBody!.note)};return route.fulfill({json:{data:row}});});
 await page.route("**/api/v1/me/retirement/risk/rebalance/history",route=>route.fulfill({json:{data:{items:[row]}}}));
 await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();await page.locator(".allocation-disclosure").filter({has:page.locator("summary",{hasText:/^Tài sản đang nắm giữ$/})}).locator(":scope > summary").click();
 const panel=page.getByTestId("rebalance");await panel.getByRole("button",{name:"Thêm nhóm nắm giữ",exact:true}).click();await panel.getByLabel("Nhóm tài sản đang nắm giữ",{exact:true}).selectOption({index:1});await panel.getByLabel("Giá trị đang nắm giữ (đồng)",{exact:true}).fill("10000000");await panel.getByLabel("Phần đáo hạn trong giá trị trên (đồng)",{exact:true}).fill("0");await panel.getByLabel("Tiền góp mới (đồng)",{exact:true}).fill("0");
 await panel.getByRole("checkbox",{name:"Lưu đề xuất vào lịch sử quyết định",exact:true}).check();await panel.getByRole("checkbox",{name:"So sánh xác suất trước và sau (20 kịch bản sơ bộ)",exact:true}).check();await panel.getByRole("checkbox",{name:"Tôi đã khai đủ nhóm nắm giữ; nhóm không khai nghĩa là không nắm giữ.",exact:true}).check();await panel.getByRole("button",{name:"Xem đề xuất tái cân bằng",exact:true}).click();
 await expect(panel).toContainText("Đã lưu đề xuất");await expect(panel).toContainText("ngay cả khi độ lệch tỷ trọng dưới dải");expect(proposalBody).toMatchObject({record:true,compareProbabilities:true,planId:state.planId,planVersionId:state.versionId});
 if(ready){await expect(panel).toContainText("trước — · sau 95%");await expect(panel).toContainText("Kết quả sơ bộ (20 kịch bản)");}else{await expect(panel).toContainText("Chưa đủ dữ liệu để so sánh xác suất");await expect(panel).not.toContainText("Xác suất đủ chi thiết yếu:");}
 await expect(panel).toContainText("Đồng ý chỉ ghi lại quyết định, An Hưu không đặt lệnh.");await panel.getByLabel("Ghi chú (tùy chọn)",{exact:true}).fill("Tôi sẽ tự xem xét giao dịch");await panel.getByRole("button",{name:ready?"Đồng ý":"Bỏ qua",exact:true}).click();await expect.poll(()=>decisionBody?.decision).toBe(ready?"ACCEPTED":"DISMISSED");expect(decisionBody?.note).toBe("Tôi sẽ tự xem xét giao dịch");
 if(ready)for(const width of [1440,375]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await panel.screenshot({path:info.outputPath(`rebalance-decision-${width}.png`)});}
 await panel.getByRole("button",{name:"Xem lịch sử quyết định",exact:true}).click();const history=panel.getByRole("region",{name:"Lịch sử quyết định tái cân bằng",exact:true});await expect(history).toContainText("Tôi sẽ tự xem xét giao dịch");await expect(history).toContainText(ready?"Đồng ý":"Bỏ qua");await expect(history).toContainText(ready?"— / 95%":"— / —");
 if(ready)for(const width of [1440,375]){await page.setViewportSize({width,height:1000});await history.screenshot({path:info.outputPath(`rebalance-history-${width}.png`)});}
 if(ready){await panel.getByLabel("Ghi chú (tùy chọn)",{exact:true}).fill("");await panel.getByRole("button",{name:"Bỏ qua",exact:true}).click();await expect.poll(()=>decisionBody).toEqual({decision:"DISMISSED",note:""});await expect(history).toContainText("Bỏ qua");await expect(history.getByRole("row").last().getByRole("cell").last()).toHaveText("");}
 expect(state.errors).toEqual([]);
});

test("a spending-floor shortfall still requires rebalancing below the drift band",async({page,request},info)=>{
 const state=await setupT9SavedPlan(page,request);await page.route("**/api/v1/me/investments/holdings/drift?*",route=>route.fulfill({json:{data:{persisted:false,isDrifted:false,maxDriftPercent:"2",driftThresholdPercent:"5",rebalanceRequired:true,rebalanceRecommendation:{status:"PROPOSED",costEstimated:"1000",cashUsedBeforeTrades:"0",unallocatedCash:"0"}}}}));await page.goto("/user/investments");await page.getByRole("button",{name:"Kiểm tra độ lệch",exact:true}).click();const panel=page.getByTestId("holdings-monitor");await expect(panel).toContainText("Trong dải mục tiêu");await expect(panel).toContainText("Vẫn cần tái cân bằng");for(const width of [1440,375]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await panel.screenshot({path:info.outputPath(`spending-floor-${width}.png`)});}expect(state.errors).toEqual([]);
});

test("missing drift recommendations and order status require review without zero costs",async({page,request})=>{
 const state=await setupT9SavedPlan(page,request);const drift={isDrifted:false,maxDriftPercent:"2",driftThresholdPercent:"5",rebalanceRequired:false};
 await page.route("**/api/v1/me/investments/holdings/drift?*",route=>route.fulfill({json:{data:{...drift,persisted:false,rebalanceRecommendation:null}}}));await page.route("**/api/v1/me/investments/holdings/rebalance-orders",route=>route.fulfill({json:{data:{persisted:false,drift:{...drift,rebalanceStatus:null,costEstimated:"0",cashUsedBeforeTrades:"0"},orders:[]}}}));await page.goto("/user/investments");
 for(const name of ["Kiểm tra độ lệch","Xem lệnh tham khảo"]){await page.getByRole("button",{name,exact:true}).click();const panel=page.getByTestId("holdings-monitor");await expect(panel).toContainText("Cần rà soát dữ liệu trước khi kết luận");await expect(panel).not.toContainText("Chưa cần tái cân bằng");await expect(panel).not.toContainText("Chi phí dự tính");await expect(panel.getByRole("heading",{name:"Lệnh tham khảo đã làm tròn theo lô"})).toHaveCount(0);}expect(state.errors).toEqual([]);
});

for(const floorEnabled of [false,true])test(`rebalance ${floorEnabled?"retains saved context for a spending-floor review":"keeps ordinary live proposals independent from another saved template"}`,async({page,request})=>{
 const state=await setupT9SavedPlan(page,request,"GROWTH"),bodies:Array<Record<string,unknown>>=[];
 await page.route(`**/api/v1/me/portfolio-policies/${state.fixture.policyId}`,async route=>{const response=await route.fetch({url:discoveryApi+new URL(route.request().url()).pathname,headers:{...route.request().headers(),Authorization:`Bearer ${state.fixture.accessToken}`}});const answer=await response.json();for(const template of answer.data.data.templates)if(template.glidePath){if(floorEnabled)template.glidePath.spendingFloorYears=2;else delete template.glidePath.spendingFloorYears;}await route.fulfill({json:answer});});
 await page.evaluate(()=>{const key="anhuu:plan-draft:USR-001";sessionStorage.setItem(key,JSON.stringify({...JSON.parse(sessionStorage.getItem(key)??"{}"),templateId:"CAUTIOUS"}));});
 await page.route("**/api/v1/me/retirement/risk/rebalance",route=>{const body=route.request().postDataJSON();bodies.push(body);const review=floorEnabled||(body.planId&&!body.record&&!body.compareProbabilities);return route.fulfill({json:{data:review?{status:"REVIEW_REQUIRED",issues:["REBALANCE_PLAN_CONTEXT_MISMATCH"]}:{status:"PROPOSED",persisted:false,cost:"0",netValue:"10000000",trades:[]}}});});
 await page.reload();await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();await page.locator(".allocation-disclosure").filter({has:page.locator("summary",{hasText:/^Tài sản đang nắm giữ$/})}).locator(":scope > summary").click();
 const panel=page.getByTestId("rebalance"),confirm=panel.getByRole("checkbox",{name:"Tôi đã khai đủ nhóm nắm giữ; nhóm không khai nghĩa là không nắm giữ.",exact:true});await panel.getByRole("button",{name:"Thêm nhóm nắm giữ",exact:true}).click();await panel.getByLabel("Nhóm tài sản đang nắm giữ",{exact:true}).selectOption({index:1});await panel.getByLabel("Giá trị đang nắm giữ (đồng)",{exact:true}).fill("10000000");await panel.getByLabel("Phần đáo hạn trong giá trị trên (đồng)",{exact:true}).fill("0");await panel.getByLabel("Tiền góp mới (đồng)",{exact:true}).fill("0");await confirm.check();await panel.getByRole("button",{name:"Xem đề xuất tái cân bằng",exact:true}).click();await expect.poll(()=>bodies.length).toBe(1);expect(bodies[0].templateId).toBe("CAUTIOUS");
 if(floorEnabled){expect(bodies[0]).toMatchObject({planId:state.planId,planVersionId:state.versionId,record:false,compareProbabilities:false});await expect(panel).toContainText("Cần rà soát dữ liệu hoặc cấu hình trước khi kết luận");await expect(panel.getByRole("heading",{name:"Tỷ trọng mục tiêu",exact:true})).toHaveCount(0);}
 else{expect(bodies[0]).not.toHaveProperty("planId");expect(bodies[0]).not.toHaveProperty("planVersionId");await expect(panel).toContainText("Đề xuất, chưa giao dịch, chưa lưu nhật ký.");const record=panel.getByRole("checkbox",{name:"Lưu đề xuất vào lịch sử quyết định",exact:true}),compare=panel.getByRole("checkbox",{name:"So sánh xác suất trước và sau (20 kịch bản sơ bộ)",exact:true});for(const mode of ["record","compare"]){await record.setChecked(mode==="record");await compare.setChecked(mode==="compare");await confirm.check();await panel.getByRole("button",{name:"Xem đề xuất tái cân bằng",exact:true}).click();await expect.poll(()=>bodies.length).toBe(mode==="record"?2:3);expect(bodies.at(-1)).toMatchObject({templateId:"CAUTIOUS",planId:state.planId,planVersionId:state.versionId,record:mode==="record",compareProbabilities:mode==="compare"});await expect(panel).toContainText("Đề xuất, chưa giao dịch, chưa lưu nhật ký.");}}
 expect(state.errors).toEqual([]);
});
