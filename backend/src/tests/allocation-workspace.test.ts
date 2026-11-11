import {beforeEach,expect,it,vi} from "vitest";
import request from "supertest";
import {createApp} from "../app";
import {config,token} from "./helpers";
import {allocationFixture} from "./allocation-workspace-fixtures";
import {allocationWorkspace,saveAllocationRisk} from "../modules/portfolios/workspace";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import {Prisma} from "@prisma/client";
beforeEach(()=>{vi.spyOn(console,"info").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});});
it("uses canonical capital once, actual current glide weights and exact allocated amounts",async()=>{
 const f=await allocationFixture(),r=await allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",f.command);
 expect(r.capital).toMatchObject({investableLiquidAssets:"1000000000",retirementLiquidAssets:"600000000",requiredEmergencyReserve:"96000000",growthCapital:"904000000"});
 expect(r.portfolio?.status).toBe("READY");expect(r.allocations.find(a=>a.assetClass==="STOCK")?.weightPercent).toBe("0");
 expect(r.allocations.reduce((s,a)=>s.plus(a.amountVnd??0),new Prisma.Decimal(0)).eq(r.capital.growthCapital!)).toBe(true);
 expect(r.loss.status).toBe("WITHIN_LIMIT");
});
it("retains unknown, zero and negative capital without sample fallback",async()=>{
 for(const options of [{unknownCapital:true},{zero:true},{negative:true}]){
  const f=await allocationFixture(options),r=await allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",f.command);
  if(options.unknownCapital)expect(r.capital.growthCapital).toBeNull();else expect(new Prisma.Decimal(r.capital.growthCapital!).lt(0)).toBe(true);
  expect(r.allocations.every(a=>a.amountVnd===null)).toBe(true);expect(r.loss.status).toBe("REVIEW_REQUIRED");
 }
});
it("reads capital without a horizon, reports incomplete answers and disallows invalid periods",async()=>{
 const f=await allocationFixture();const {endMonth,...command}=f.command;
 expect((await allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",command)).issues).toContainEqual({path:"endMonth",code:"PLAN_END_MONTH_REQUIRED"});
 expect((await allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,answers:[]})).portfolio?.status).toBe("INCOMPLETE");
 await expect(allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,endMonth:"2026-01"})).rejects.toMatchObject({status:400});
});
it("rejects stale revisions, other accounts, unpublished policies and benchmark overrides",async()=>{
 const f=await allocationFixture();
 await expect(allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,expectedProfileRevision:1})).rejects.toMatchObject({status:409});
 await expect(allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"other-user",f.command)).rejects.toMatchObject({status:404});
 await expect(allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,annualReturn:"50"})).rejects.toBeTruthy();
 const hidden=await allocationFixture({emptyPolicy:true});await expect(allocationWorkspace(hidden.profiles,hidden.portfolios,hidden.assumptions,"test-user",hidden.command)).rejects.toMatchObject({status:404});
});
it("saves explicit zero/percent and amount tolerance through profile CAS and keeps other data intact",async()=>{
 const f=await allocationFixture(),before=await f.profiles.getProfile("test-user");
 await saveAllocationRisk(f.profiles,f.portfolios,f.assumptions,"test-user",{expectedRevision:2,policyVersionId:f.policy.id,reaction:"SELL",limit:{kind:"PERCENT",value:"0"}});
 let saved=await f.profiles.getProfile("test-user");expect(saved?.revision).toBe(3);expect((saved?.data as any).lossTolerance.amountVnd.value).toBe("0");
 expect((saved?.data as any).assets).toEqual((before?.data as any).assets);
 await expect(saveAllocationRisk(f.profiles,f.portfolios,f.assumptions,"test-user",{expectedRevision:2,policyVersionId:f.policy.id,reaction:"HOLD",limit:{kind:"PERCENT",value:"10"}})).rejects.toMatchObject({status:409});
 await saveAllocationRisk(f.profiles,f.portfolios,f.assumptions,"test-user",{expectedRevision:3,policyVersionId:f.policy.id,reaction:"BUY_MORE",limit:{kind:"AMOUNT",value:"90400000"}});
 saved=await f.profiles.getProfile("test-user");expect((saved?.data as any).lossTolerance.percent.value).toBe("10");
});
it("rejects excessive/malformed loss limits and rolls back all writes when audit fails",async()=>{
 const f=await allocationFixture(),input={expectedRevision:2,policyVersionId:f.policy.id,reaction:"HOLD",limit:{kind:"AMOUNT",value:"904000001"}};
 await expect(saveAllocationRisk(f.profiles,f.portfolios,f.assumptions,"test-user",input)).rejects.toMatchObject({status:422});
 f.failWrites("auditLog");await expect(saveAllocationRisk(f.profiles,f.portfolios,f.assumptions,"test-user",{...input,limit:{kind:"PERCENT",value:"5"}})).rejects.toBeTruthy();
 expect((await f.profiles.getProfile("test-user"))?.revision).toBe(2);
});
it("requires USER/session on both endpoints and preview does not write any profile/plan/audit",async()=>{
 const f=await allocationFixture();vi.spyOn(f.auth,"validateSession").mockResolvedValue(f.owner);const app=createApp({config,services:f.services});
 const path="/api/v1/me/portfolio-policies/workspace/preview",before=JSON.stringify([f.rows("financialProfile"),f.rows("retirementPlan"),f.rows("auditLog")]);
 expect((await request(app).post(path).send(f.command)).status).toBe(401);
 expect((await request(app).post(path).set("Authorization","Bearer "+token("ADMIN")).send(f.command)).status).toBe(403);
 const response=await request(app).post(path).set("Authorization","Bearer "+token()).send(f.command);expect(response.status).toBe(200);expect(response.headers["cache-control"]).toBe("no-store");
 expect(JSON.stringify([f.rows("financialProfile"),f.rows("retirementPlan"),f.rows("auditLog")])).toBe(before);
 expect((await request(app).patch("/api/v1/me/financial-profile/loss-tolerance").set("Authorization","Bearer "+token("ADMIN")).send({})).status).toBe(403);
});

it("serializes workspace HTTP output against OpenAPI, including nullable incomplete results",async()=>{
 const f=await allocationFixture();vi.spyOn(f.auth,"validateSession").mockResolvedValue(f.owner);const app=createApp({config,services:f.services});
 const doc=await SwaggerParser.dereference("docs/openapi.yaml") as any,ajv=new Ajv({strict:false,formats:{uuid:true,uri:true,"date-time":true,date:true}});
 const schema=doc.paths["/api/v1/me/portfolio-policies/workspace/preview"].post.responses[200].content["application/json"].schema,validate=ajv.compile(schema);
 for(const command of [f.command,{...f.command,endMonth:undefined},{...f.command,answers:[]}]){
  const r=await request(app).post("/api/v1/me/portfolio-policies/workspace/preview").set("Authorization","Bearer "+token()).send(command);
  expect(r.status).toBe(200);expect(validate(r.body),JSON.stringify(validate.errors)).toBe(true);
 }
});
it("preserves zero and huge decimal capital, and rejects fake user ownership in input",async()=>{
 const f=await allocationFixture();let profile=await f.profiles.getProfile("test-user");
 const data=profile!.data as any;data.assets.entries[0].value.value="9007199254740993.25";data.assets.entries[0].retirementShare.value="1";data.assets.entries[0].emergencyShare.value="0";data.assets.entries[0].otherGoalsShare.value="0";
 data.expenses={status:"KNOWN",entries:[]};await f.profiles.patchProfile("test-user",2,{schemaVersion:2,...data});
 let r=await allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,expectedProfileRevision:3});
 expect(r.capital.growthCapital).toBe("9007199254740993.25");expect(r.allocations.reduce((sum,a)=>sum.plus(a.amountVnd!),new Prisma.Decimal(0)).toFixed()).toBe("9007199254740993.25");
 data.assets={status:"KNOWN",entries:[]};await f.profiles.patchProfile("test-user",3,{schemaVersion:2,...data});
 r=await allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,expectedProfileRevision:4});expect(r.capital.growthCapital).toBe("0");
 await expect(allocationWorkspace(f.profiles,f.portfolios,f.assumptions,"test-user",{...f.command,expectedProfileRevision:4,userId:"other-user"})).rejects.toBeTruthy();
});
