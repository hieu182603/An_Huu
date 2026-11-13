import { describe,it,expect,vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import {createApp} from "../app";
import {config,token} from "./helpers";
import {ActualsService} from "../modules/actuals/service";
import { customAllocationSchema,customTargets } from "../modules/portfolios/custom";
import { allocationWorkspace } from "../modules/portfolios/workspace";
import { RetirementService } from "../modules/retirement/service";
import { PlansService } from "../modules/plans/service";
import { retirementCommand } from "./retirement-fixtures";
import { customFixture } from "./allocation-custom-fixtures";
import { riskContext,marketFixture } from "./allocation-risk-fixtures";
import { simulate } from "../modules/allocation-risk/simulation";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import { protectCashflows,type Protection } from "../modules/retirement/protected-capital";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { buildAllocationPackages } from "../modules/recommendation/packages";
import type { ProductMasterData } from "../modules/recommendation/types";
import {profileV2Schema} from "../modules/profiles/schema-v2";
import {protectedGoals} from "../modules/retirement/protected-goals";
import {separateCapital} from "../modules/capital/separation";
import {portfolioAssumptionsFixture} from "./portfolio-fixtures";
import {fixtureProfile,known,empty} from "./profile-v2-fixtures";
const custom=customAllocationSchema.parse({model:"custom-glide-v1",weights:[{assetClass:"STOCK",weightPercent:"30"},{assetClass:"BOND",weightPercent:"70"}]});
describe("custom allocation contracts and persistence",()=>{
 it("rejects wrong totals, duplicate codes, negative weights and supplied assumptions",()=>{
  for(const weights of [[{assetClass:"STOCK",weightPercent:"99.99999999"}],[{assetClass:"STOCK",weightPercent:"50"},{assetClass:"STOCK",weightPercent:"50"}],[{assetClass:"STOCK",weightPercent:"-1"}]])
   expect(customAllocationSchema.safeParse({model:"custom-glide-v1",weights}).success).toBe(false);
  expect(customAllocationSchema.safeParse({...custom,annualReturn:"9"}).success).toBe(false);
 });
 it("keeps a nonnegative, exact total through published shifts",()=>{
  const before=new Map([["BOND",new Prisma.Decimal("0.5")],["STOCK",new Prisma.Decimal("0.5")]]),after=new Map([["BOND",new Prisma.Decimal("1")],["STOCK",new Prisma.Decimal("0")]]);
  const weights=customTargets(custom,before,after);
  expect([...weights.values()].reduce((s,w)=>s.plus(w),new Prisma.Decimal(0)).eq(1)).toBe(true);
  expect(weights.get("STOCK")!.eq(0)).toBe(true);
 });
 it("uses actual custom weights, rejects a breached policy bound and unknown asset",async()=>{
  const f=await customFixture();
  const result=await allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,customAllocation:custom});
  expect(result.allocations.find(r=>r.assetClass==="STOCK")?.amountVnd).toBe("271200000");
  expect(result.returnBreakdown?.rows.find(r=>r.assetClass==="STOCK")?.weightPercent).toBe("30");
  for(const weights of [[{assetClass:"STOCK",weightPercent:"90"},{assetClass:"BOND",weightPercent:"10"}],[{assetClass:"UNKNOWN",weightPercent:"100"}]]){
   const bad=await allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,customAllocation:{model:custom.model,weights}});
   expect(bad.portfolio?.status).toBe("INCOMPLETE");expect(bad.allocations).toEqual([]);
  }
 });
 it("persists the chosen weights and input hash through saving and reading a plan",async()=>{
  const f=await customFixture(),service=new RetirementService(f.db),plans=new PlansService(f.db);
  const input={...retirementCommand(f.policy.id),...f.command,customAllocation:custom,allocationFunding:"PROTECTED_CAPITAL_V1" as const};
  const preview=await service.preview("test-user",input,{adjustments:false});
  expect(preview.status,JSON.stringify(preview.issues)).toBe("READY");
  expect(preview.replayInput?.initialCapital).toBe("904000000");
  expect(preview.calculation?.marketRows[0].holdings.find(r=>r.assetClass==="STOCK")?.startWeightPercent).toBe("30");
  const saved=await plans.createVersion("test-user",null,{expectedRevision:0,expectedInputHash:preview.inputHash,preview:input},randomUUID());
  const read=await plans.readVersion(f.db,"test-user",saved.planId,saved.saved.id);
  expect(read.version.preview.selection.customAllocation).toEqual(custom);
  expect(read.version.preview.inputHash).toBe(preview.inputHash);
  const replayed=await plans.version("test-user",saved.planId,saved.saved.id,true);
  expect("replay" in replayed&&replayed.replay?.matched).toBe(true);
  await plans.apply("test-user",saved.planId,{versionId:saved.saved.id,expectedRevision:saved.revision,expectedProfileRevision:2,confirm:true},randomUUID());
  const report=await plans.report("test-user",saved.planId,{});
  expect(report.version?.preview.selection.customAllocation).toEqual(custom);
  expect(report.version?.preview.replayInput?.initialCapital).toBe("904000000");
  const csv=await plans.exportCsv("test-user",saved.planId,saved.saved.id);
  expect(csv.content).toContain("904000000");
  await expect(new ActualsService(f.db).forecast("test-user",{planId:saved.planId,versionId:saved.saved.id,throughMonth:"2026-10"})).rejects.toMatchObject({status:422,code:"PROTECTED_ACTUAL_BALANCES_REQUIRED"});
  const changed=await service.preview("test-user",{...input,customAllocation:{...custom,weights:[{assetClass:"BOND",weightPercent:"80"},{assetClass:"STOCK",weightPercent:"20"}]}},{adjustments:false});
  expect(changed.inputHash).not.toBe(preview.inputHash);
 });
 it("rejects custom plans when the pinned published policy has no custom authorization",async()=>{
  const f=await customFixture();
  const original=await f.portfolios.get(f.command.policyVersionId,true);
  const data={...original.data};if(data.schemaVersion===2)delete data.customization;
  // Exercise the pure engine against a separate document, without changing a published row.
  const {prepareRetirement}=await import("../modules/retirement/prepare");
  const profile=(await f.profiles.getProfile("test-user"))!;
  const assumptions=await f.assumptions.get(data.assumptionVersionId,true);
  const result=prepareRetirement(profileV2Schema.parse(profile.data),{...retirementCommand(f.policy.id),...f.command,customAllocation:custom,allocationFunding:"PROTECTED_CAPITAL_V1"},data,assumptions.data);
  expect(result.issues.some(r=>r.code==="CUSTOM_POLICY_REQUIRED")).toBe(true);
 });
 it("returns replayable reference and custom choices on the same protected cash flows",async()=>{
  const f=await customFixture(),retirement=new RetirementService(f.db);
  const preview={...retirementCommand(f.policy.id),...f.command,allocationFunding:"PROTECTED_CAPITAL_V1" as const};
  const result=await new AllocationRiskService(f.db).run("test-user",{plan:{kind:"PREVIEW",preview},paths:8,detail:"ALLOCATION_V2",trialAllocation:custom},"selection");
  expect(["READY","INSUFFICIENT"]).toContain(result.status);
  if(!("candidates" in result)||!result.candidates)return;
  expect(result.referenceId).toBeTruthy();expect(result.candidates.find(c=>c.id===result.referenceId)?.selection).toBeTruthy();
  const candidate=result.candidates.find(c=>c.id==="CUSTOM");expect(candidate?.selection).toBeTruthy();expect(candidate?.pAll).not.toBeNull();
  const savedChoice=await retirement.preview("test-user",{...preview,...candidate!.selection},{adjustments:false});
  expect(savedChoice.status).toBe("READY");
  expect(savedChoice.calculation?.marketRows[0].holdings.map(h=>({assetClass:h.assetClass,weightPercent:h.startWeightPercent}))).toEqual(candidate!.targets[0]);
 });
 it("serves packages from reviewed catalog records without leaking private partner details",async()=>{
  const f=await customFixture({ui:true});
  const result=await f.services.recommendations.allocationPackages("test-user",f.command);
  expect(result.status).toBe("AVAILABLE");expect(result.lines[0].a?.name).toBe("Sản phẩm kiểm thử 01");
  expect(JSON.stringify(result)).not.toContain("private@example.test");
 });
 it("validates protected preview, detailed selection and packages against HTTP OpenAPI contracts",async()=>{
  const f=await customFixture({ui:true});vi.spyOn(f.auth,"validateSession").mockResolvedValue(f.owner);
  const app=createApp({config,services:{...f.services,allocationRisk:new AllocationRiskService(f.db)}});
  const api=await SwaggerParser.dereference("docs/openapi.yaml") as unknown as {paths:Record<string,{post:{responses:Record<string,{content:Record<string,{schema:object}>}>}}>};
  const ajv=new Ajv({strict:false,validateFormats:false});
  const preview={...retirementCommand(f.policy.id),...f.command,customAllocation:custom,allocationFunding:"PROTECTED_CAPITAL_V1"};
  for(const [path,body] of [["/api/v1/me/retirement/preview?adjustments=skip",preview],["/api/v1/me/retirement/risk/selection",{plan:{kind:"PREVIEW",preview},paths:8,detail:"ALLOCATION_V2",trialAllocation:custom}],["/api/v1/me/portfolio-policies/workspace/packages",f.command]] as const){
   const response=await request(app).post(path).set("Authorization","Bearer "+token()).send(body);
   expect(response.status,JSON.stringify(response.body)).toBe(200);
   const validate=ajv.compile(api.paths[path.split("?")[0]].post.responses["200"].content["application/json"].schema);
   expect(validate(response.body),JSON.stringify(validate.errors)).toBe(true);
  }
  const packages="/api/v1/me/portfolio-policies/workspace/packages";
  expect((await request(app).post(packages).send(f.command)).status).toBe(401);
  expect((await request(app).post(packages).set("Authorization","Bearer "+token("ADMIN")).send(f.command)).status).toBe(403);
 });
});
describe("protected funds and two success statistics",()=>{
 it("matches canonical CASH reserve accrual and retains far goals as unreserved obligations",()=>{
  const assumptions=portfolioAssumptionsFixture();
  assumptions.assetClasses.push({code:"CASH",label:"Test deposits",horizons:[{id:"ALL",minMonths:1,maxMonths:1200}]});
  assumptions.returns.push(...assumptions.returns.filter(r=>r.assetClass==="BOND").map(r=>({...r,assetClass:"CASH"})));
  const profile=fixtureProfile({debts:empty(),incomeStability:known("STABLE"),goals:{status:"KNOWN",entries:[{id:"near",label:"Near",amountToday:known("1000000"),dueMonth:known("2028-01"),inflation:known("2"),priority:known("ESSENTIAL"),deferrable:{status:"KNOWN",value:false}}]}});
  const capital=separateCapital(profile,assumptions),result=protectedGoals(profile,capital,assumptions,"2028-12");
  expect(result.issues).toEqual([]);expect(result.goals[0].openingReserve).toBe(capital.goals[0].presentValue);
  const value=result.goals[0].depositFactors!.reduce((s,f)=>s.mul(f),new Prisma.Decimal(result.goals[0].openingReserve));
  expect(value.minus(result.goals[0].amount).abs().lt("0.000001")).toBe(true);
  const farProfile=structuredClone(profile);if(farProfile.goals?.status!=="KNOWN")throw new Error("goals");farProfile.goals.entries[0].dueMonth=known("2032-01");
  const farCapital=separateCapital(farProfile,assumptions);
  for(const year of [2029,2030,2031])assumptions.inflation.push({...assumptions.inflation.at(-1)!,year});
  const far=protectedGoals(farProfile,farCapital,assumptions,"2032-12");
  expect(far.issues).toEqual([]);expect(far.goals[0].openingReserve).toBe("0");expect(new Prisma.Decimal(far.goals[0].amount).gt("1000000")).toBe(true);
 });
 it("spends goal reserves once, protects future obligations and exhausts emergency funds before growth",()=>{
  const row=riskContext(3).projection.rows[0];
  const rows=[0,1,2].map(i=>({...row,month:`2026-0${i+1}`,withdrawal:"50"}));
  const protection:Protection={model:"protected-capital-v1",emergencyReserve:"60",depositAssetClass:"CASH",depositFactors:["1","1","1"],rawRows:rows,
   goals:[{id:"goal",month:"2026-02",amount:"100",openingReserve:"100",essential:false}]};
  const result=protectCashflows(rows,protection);
  expect(result.map(r=>r.withdrawal)).toEqual(["0","40","50"]);
  expect(result.map(r=>r.protectedGoalPaid)).toEqual(["0","100","0"]);
  expect(result.map(r=>r.protectedClosingBalance)).toEqual(["110","0","0"]);
 });
 it("does not turn optional shortfalls or a later recovery into all-goals success",async()=>{
  const ctx=riskContext(3);ctx.allGoalsCovered=true;ctx.projection.initialCapital="0";
  ctx.projection.rows.forEach(row=>{row.livingExpense="0";row.additionalExpense="100";});
  ctx.essentialExpenses=ctx.essentialExpenses.map(()=>"0");ctx.projection.rows[2].capitalInjection="100000";
  const result=await simulate(ctx,marketFixture(),riskPolicySchema.parse({evidence:"Test-only risk",blockMonths:12,cvarAlpha:"0.95"}),8,performance.now()+10000,"ALLOCATION_V2");
  expect(result.status).toBe("READY");if(result.status!=="READY")return;
  expect(result.pEssential).toBe(1);expect(result.pAll).toBe(0);
 });
 it("returns unavailable all-goals probability for unclassified goal flows",async()=>{
  const result=await simulate(riskContext(3),marketFixture(),riskPolicySchema.parse({evidence:"Test-only risk",blockMonths:12,cvarAlpha:"0.95"}),4,performance.now()+10000,"ALLOCATION_V2");
  expect(result.status).toBe("READY");if(result.status!=="READY")return;
  expect(result.pAll).toBeNull();expect(result.allGoalsStatus).toBe("REVIEW_REQUIRED");
 });
 it("reports missing protected deposit history before running paths",async()=>{
  const context=riskContext(3);context.projection.protection={model:"protected-capital-v1",emergencyReserve:"10",goals:[],depositAssetClass:"UNLISTED",depositFactors:["1","1","1"],rawRows:context.projection.rows};
  const result=await simulate(context,marketFixture(),riskPolicySchema.parse({evidence:"Test-only risk",blockMonths:12,cvarAlpha:"0.95"}),4);
  expect(result.status).toBe("DATA_REQUIRED");
 });
 it("accrues goal reserves only before their due month and releases only the excess",()=>{
  const original=riskContext(3).projection.rows[0],rows=["2026-01","2026-02","2026-03"].map(month=>({...original,month,withdrawal:"0"}));
  const result=protectCashflows(rows,{model:"protected-capital-v1",emergencyReserve:"0",goals:[{id:"g",month:"2026-02",amount:"100",openingReserve:"100",essential:true}],depositAssetClass:"CASH",depositFactors:["1.1","1.1","1.1"],rawRows:rows});
  expect(result[1].protectedGoalPaid).toBe("100");expect(result[1].protectedEssentialGoalPaid).toBe("100");expect(result[1].protectedClosingBalance).toBe("11");expect(result[2].goalExpense).toBe("0");
 });
});

describe("allocation product packages",()=>{
 const product=(id:string,fee:string,days:number,patch:Partial<ProductMasterData>={}):ProductMasterData=>({id,code:id,name:id,partnerId:id,partnerName:id,assetClass:"BOND",category:"OPEN_BOND_FUND",nav:"1000",annualExpenseRatioPercent:fee,liquidityDays:days,lotSize:1,minimumInvestmentVnd:"1000",riskLevel:"LOW",riskScore:1,isDistributionPermitted:true,status:"ACTIVE",...patch});
 const context={clientRiskTolerance:"LOW" as const,horizonYears:1};
 it("ranks fee and liquidity alternatives using eligible published metadata",()=>{
  const result=buildAllocationPackages([{assetClass:"GOV_BOND",weightPercent:"100",amountVnd:"1000000"}],[product("low-fee","0.5",5),product("liquid","1",1),product("hidden","0",0,{isDistributionPermitted:false}),product("too-large","0",1,{minimumInvestmentVnd:"2000000"})],context);
  expect(result.lines[0].a?.id).toBe("low-fee");expect(result.lines[0].b?.id).toBe("liquid");expect(result.A.annualFeeVnd).toBe("5000");expect(result.B.annualFeeVnd).toBe("10000");expect(result.same).toBe(false);
 });
 it("does not invent missing products or duplicate a false alternative",()=>{
  const allocations=[{assetClass:"BOND",weightPercent:"70",amountVnd:"700000"},{assetClass:"REAL_ESTATE",weightPercent:"30",amountVnd:"300000"}];
  const result=buildAllocationPackages(allocations,[product("only","1",1)],context);
  expect(result.same).toBe(true);expect(result.A.coveredPercent).toBe("70");expect(result.lines[1].status).toBe("NO_PRODUCT");
  expect(buildAllocationPackages(allocations,[],context).status).toBe("UNCONFIGURED");
 });
});
