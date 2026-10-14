import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { plansFixture } from "./plans-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { sourceReforecastSchema, type FlowSourceCommand } from "../modules/plans/source-schema";
import { applyFlowSourceCommand } from "../modules/retirement/source-commands";
import { composeSourceMonths, sealSourceRegistry, sealSourceRevision } from "../modules/retirement/sources";
import { AuthService } from "../modules/auth/service";
import { config, token } from "./helpers";
import { createApp } from "../app";
import { digest } from "../common/digest";
import { ProfileService } from "../modules/profiles/service";
import { AiService } from "../modules/ai/service";
import { AI_POLICY_VERSION } from "../modules/ai/schema";
import { InsuranceHistoryService } from "../modules/pensions/history-service";
import { LegalRulesService } from "../modules/pensions/legal-service";
import { PensionEstimateService } from "../modules/pensions/estimate-service";
import { validatedBenefitFixture } from "./benefit-fixtures";
import { readSourceSnapshot } from "../modules/plans/source-snapshot";
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-05T00:00:00Z")); vi.spyOn(console,"info").mockImplementation(() => {}); vi.spyOn(console,"error").mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
const flow = (overrides = {}): FlowSourceCommand => ({ operation: "CREATE", commandId: randomUUID(), sourceId: "plan:rent", expectedSourceRevision: 0,
  effectiveFromMonth: "2026-11", effectiveToMonth: "2027-03", metric: "income", frequency: "MONTHLY", amount: "500", currency: "VND",
  confirmation: "HYPOTHETICAL", document: "Expected rental contract", confirm: true, ...overrides });
async function fixture() {
  const f = await plansFixture(), saved = await f.create(), actuals = new ActualsService(f.db);
  await actuals.write(f.owner,"2026-10",{ expectedRevision:0, data:{currency:"VND",openingBalance:"1000",closingBalance:"1000",entries:[],correctionReason:"Verified statement"} },randomUUID());
  const command = sourceReforecastSchema.parse({versionId:saved.saved.id,expectedSnapshotHash:saved.saved.snapshotHash,expectedRevision:1,
    expectedProfileRevision:1,throughMonth:"2026-10",sourceCommands:[flow()],pensionSelections:[]});
  return {...f,saved,actuals,command};
}
it("creates, saves and separately applies v4 sources while preserving v3 replay/profile/actuals",async()=>{
  const f=await fixture(),before=JSON.stringify([f.rows("financialProfile"),f.rows("actualMonth")]);
  const preview=await f.plans.previewSources(f.owner,f.saved.planId,f.command);
  expect(preview.candidate?.modelVersion).toBe("retirement-monthly-v4");
  const rows=preview.candidate!.calculation.rows;
  expect(rows[0].openingBalance).toBe("1000");
  expect(rows[0].contribution).toBe("100"); // Extra income is not an automatic deposit.
  expect(preview.candidate!.calculation.attribution).toContainEqual(expect.objectContaining({sourceId:"plan:rent",month:"2026-11",amount:"500"}));
  const body={preview:f.command,expectedInputHash:preview.inputHash!,confirm:true as const},key=randomUUID();
  const saved=await f.plans.saveSources(f.owner,f.saved.planId,body,key);
  expect(saved.currentVersionId).toBeNull();expect(saved.revision).toBe(2);
  expect(await f.plans.saveSources(f.owner,f.saved.planId,body,key)).toEqual(saved);
  expect(f.rows("planVersion")).toHaveLength(2);
  expect((await f.plans.version(f.owner,f.saved.planId,saved.saved.id,true)).preview).toEqual(preview.candidate);
  expect((await f.plans.version(f.owner,f.saved.planId,f.saved.saved.id,true)).preview.modelVersion).toBe("retirement-monthly-v3");
  const applied=await f.plans.apply(f.owner,f.saved.planId,{versionId:saved.saved.id,expectedRevision:2,expectedProfileRevision:1,confirm:true},randomUUID());
  expect(applied.currentVersionId).toBe(saved.saved.id);
  expect((await f.plans.report(f.owner,f.saved.planId,{})).hypothetical).toBe(true);
  const csv=await f.plans.exportCsv(f.owner,f.saved.planId,saved.saved.id);
  expect(csv.content).toContain("sourceAttributionJson");expect(csv.content).toContain("plan:rent");
  expect(JSON.stringify([f.rows("financialProfile"),f.rows("actualMonth")])).toBe(before);
});
it("revises a created source at the same actual cutoff and same start month, then ends it without resurrection",async()=>{
  const f=await fixture(),p=await f.plans.previewSources(f.owner,f.saved.planId,f.command);
  const first=await f.plans.saveSources(f.owner,f.saved.planId,{preview:f.command,expectedInputHash:p.inputHash!,confirm:true},randomUUID());
  const command={...f.command,versionId:first.saved.id,expectedSnapshotHash:first.saved.snapshotHash,expectedRevision:2,
    sourceCommands:[flow({operation:"REVISE",expectedSourceRevision:1,amount:"250"})]};
  const revised=await f.plans.previewSources(f.owner,f.saved.planId,command);
  const sourceRows=revised.candidate!.calculation.attribution.filter(r=>r.sourceId==="plan:rent");
  expect(sourceRows.every(r=>r.amount==="250"&&r.sourceRevision===2)).toBe(true);
  expect(revised.candidate!.reforecast!.actualRevisions).toHaveLength(1);
  const second=await f.plans.saveSources(f.owner,f.saved.planId,{preview:command,expectedInputHash:revised.inputHash!,confirm:true},randomUUID());
  const ended=await f.plans.previewSources(f.owner,f.saved.planId,{...command,versionId:second.saved.id,expectedSnapshotHash:second.saved.snapshotHash,expectedRevision:3,
    sourceCommands:[{operation:"END",sourceId:"plan:rent",expectedSourceRevision:2,commandId:randomUUID(),effectiveFromMonth:"2026-12",effectiveToMonth:"2027-03",document:"Contract ends",confirm:true}]});
  expect(ended.candidate!.calculation.attribution.filter(r=>r.sourceId==="plan:rent").map(r=>r.month)).toEqual(["2026-11"]);
});
it("advances the actual anchor on v4 without replaying past source money",async()=>{
  const f=await fixture(),p=await f.plans.previewSources(f.owner,f.saved.planId,f.command);
  const saved=await f.plans.saveSources(f.owner,f.saved.planId,{preview:f.command,expectedInputHash:p.inputHash!,confirm:true},randomUUID());
  await f.actuals.write(f.owner,"2026-11",{expectedRevision:0,data:{currency:"VND",openingBalance:"1000",closingBalance:"1000",entries:[],correctionReason:"Verified statement"}},randomUUID());
  const forecast=await f.actuals.forecast(f.owner,{planId:saved.planId,versionId:saved.saved.id,throughMonth:"2026-11"});
  expect(forecast.calculation!.rows[0]).toMatchObject({month:"2026-12",openingBalance:"1000"});
  const next=await f.plans.previewSources(f.owner,saved.planId,{...f.command,versionId:saved.saved.id,expectedSnapshotHash:saved.saved.snapshotHash,
    expectedRevision:2,throughMonth:"2026-11",sourceCommands:[]});
  expect(next.candidate!.reforecast!.actualRevisions.map(r=>r.period)).toEqual(["2026-10","2026-11"]);
  expect(next.candidate!.calculation.rows).toEqual(forecast.calculation!.rows);
});
it("rejects stale previews, profiles, actuals, snapshot references, source revisions and other owners",async()=>{
  const f=await fixture(),p=await f.plans.previewSources(f.owner,f.saved.planId,f.command);
  await expect(f.plans.previewSources("other",f.saved.planId,f.command)).rejects.toMatchObject({status:404});
  await expect(f.plans.previewSources(f.owner,f.saved.planId,{...f.command,expectedSnapshotHash:digest("changed")})).rejects.toMatchObject({status:409});
  await expect(f.plans.previewSources(f.owner,f.saved.planId,{...f.command,sourceCommands:[flow({effectiveFromMonth:"2026-10"})]})).rejects.toMatchObject({code:"SOURCE_COMMAND_PERIOD_INVALID"});
  await expect(f.plans.previewSources(f.owner,f.saved.planId,{...f.command,sourceCommands:[flow({operation:"REVISE",expectedSourceRevision:1})]})).rejects.toMatchObject({code:"SOURCE_REVISION_CONFLICT"});
  await f.actuals.write(f.owner,"2026-10",{expectedRevision:1,data:{currency:"VND",openingBalance:"2000",closingBalance:"2000",entries:[],correctionReason:"Verified statement"}},randomUUID());
  await expect(f.plans.saveSources(f.owner,f.saved.planId,{preview:f.command,expectedInputHash:p.inputHash!,confirm:true},randomUUID())).rejects.toMatchObject({code:"PREVIEW_CHANGED"});
  const fresh=await f.plans.previewSources(f.owner,f.saved.planId,f.command),saved=await f.plans.saveSources(f.owner,f.saved.planId,{preview:f.command,expectedInputHash:fresh.inputHash!,confirm:true},randomUUID());
  await f.actuals.write(f.owner,"2026-10",{expectedRevision:2,data:{currency:"VND",openingBalance:"3000",closingBalance:"3000",entries:[],correctionReason:"Verified statement"}},randomUUID());
  await expect(f.plans.apply(f.owner,f.saved.planId,{versionId:saved.saved.id,expectedRevision:2,expectedProfileRevision:1,confirm:true},randomUUID())).rejects.toMatchObject({code:"ACTUAL_SOURCE_CHANGED"});
  expect((await f.plans.version(f.owner,saved.planId,saved.saved.id,true)).preview.calculation!.rows[0].openingBalance).toBe("2000");
});
it("keeps one-off sources to one month, forbids implicit FX and arbitrary result fields",async()=>{
  const f=await fixture();
  const p=await f.plans.previewSources(f.owner,f.saved.planId,{...f.command,sourceCommands:[flow({frequency:"ONCE",effectiveToMonth:"2026-11"})]});
  expect(p.candidate!.calculation.attribution.filter(r=>r.sourceId==="plan:rent")).toHaveLength(1);
  await expect(f.plans.previewSources(f.owner,f.saved.planId,{...f.command,sourceCommands:[flow({frequency:"ONCE"})]})).rejects.toMatchObject({code:"ONE_OFF_SOURCE_REQUIRES_SINGLE_MONTH"});
  expect(sourceReforecastSchema.safeParse({...f.command,sourceCommands:[{...flow(),currency:"USD"}]}).success).toBe(false);
  expect(sourceReforecastSchema.safeParse({...f.command,initialCapital:"999"}).success).toBe(false);
  expect(sourceReforecastSchema.safeParse({...f.command,sourceCommands:[flow(),flow()]}).success).toBe(false);
  const registry=p.candidate!.replayInput.sourceRegistry;
  expect(()=>applyFlowSourceCommand(registry,flow({sourceId:"plan:other",metric:"pension"}),"2026-10","2026-12-05")).not.toThrow();
  expect(composeSourceMonths(registry).rows.length).toBeGreaterThan(0);
});
it("serves v4 HTTP preview/save/read/report/replay and actual/AI contracts without outbound profile data",async()=>{
  const f=await fixture(),auth=new AuthService(f.db,config);
  vi.spyOn(auth,"validateSession").mockResolvedValue({id:f.owner,role:"USER"} as never);
  const app=createApp({config,services:{auth,profiles:new ProfileService(f.db),plans:f.plans,actuals:f.actuals}});
  const root="/api/v1/me/retirement/plans/"+f.saved.planId;
  const api=(method:"post"|"get",path:string,body?:object)=>{const r=request(app)[method](path).set("Authorization","Bearer "+token()).set("Idempotency-Key",randomUUID());return body===undefined?r:r.send(body);};
  const spec=await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv=new Ajv({strict:false,formats:{uuid:true,date:true,"date-time":true,uri:true}});
  const check=(name:string,response:request.Response,status=200)=>{expect(response.status,JSON.stringify(response.body)).toBe(status);const validate=ajv.compile(spec.components.schemas[name]);expect(validate(response.body),JSON.stringify(validate.errors)).toBe(true);};
  const preview=await api("post",root+"/source-reforecasts/preview",f.command);check("PlanSourcePreviewEnvelope",preview);
  const saved=await api("post",root+"/source-reforecasts",{preview:f.command,expectedInputHash:preview.body.data.inputHash,confirm:true});check("PlanCreatedEnvelope",saved,201);
  const id=saved.body.data.saved.id;
  check("PlanVersionEnvelope",await api("get",root+"/versions/"+id));
  check("PlanReplayEnvelope",await api("post",root+"/versions/"+id+"/replay",{}));
  check("PlanReportEnvelope",await api("get",root+"/report?versionId="+id));
  check("PlanComparisonEnvelope",await api("post",root+"/compare",{baselineVersionId:f.saved.saved.id,candidateVersionId:id}));
  expect((await api("get",root+"/versions/"+id+"/export.csv")).text).toContain("sourceAttributionJson");
  await f.actuals.write(f.owner,"2026-11",{expectedRevision:0,data:{currency:"VND",openingBalance:"1000",closingBalance:"1000",entries:[],correctionReason:"Verified"}},randomUUID());
  check("ActualForecastEnvelope",await api("post","/api/v1/me/retirement/actuals/reforecast",{planId:f.saved.planId,versionId:id,throughMonth:"2026-11"}));
  const ai=new AiService(f.db);await ai.setPrivacy(f.owner,{expectedRevision:0,policyVersion:AI_POLICY_VERSION,processing:true,saveHistory:false});
  const answer=await ai.explain(f.owner,{question:"Nguồn dự báo",planId:f.saved.planId,versionId:id},randomUUID()) as any;
  expect(answer.provenance.sourceRegistry.attribution.some((r:any)=>r.sourceId==="plan:rent")).toBe(true);
  const validateAi=ajv.compile(spec.components.schemas.AiExplanationEnvelope);
  expect(validateAi({data:answer,meta:{requestId:randomUUID()}}),JSON.stringify(validateAi.errors)).toBe(true);
  expect((await request(app).post(root+"/source-reforecasts/preview").send(f.command)).status).toBe(401);
  expect((await api("post",root+"/source-reforecasts/preview",{...f.command,initialCapital:"999"})).status).toBe(400);
},60000);
it("pins a saved BHXH estimate in the plan and blocks new save/apply on changed history while replay remains immutable",async()=>{
  const f=await fixture(),data=validatedBenefitFixture();
  await f.db.user.create({data:{id:f.owner,role:"USER",status:"ACTIVE",email:"owner@example.invalid",passwordHash:"test",fullName:"Fixture"}});
  for(const id of ["author","reviewer"])await f.db.user.create({data:{id,role:"ADMIN",status:"ACTIVE",email:id+"@example.invalid",passwordHash:"test",fullName:"Fixture"}});
  const histories=new InsuranceHistoryService(f.db),rules=new LegalRulesService(f.db),estimates=new PensionEstimateService(f.db);
  const hinput={expectedHistoryRevision:0,document:data.history},hp=await histories.preview(f.owner,hinput);
  const history=await histories.save(f.owner,{preview:hinput,expectedInputHash:hp.inputHash,confirm:true},randomUUID());
  let rule=await rules.create("author",{code:"TEST_SOURCE",effectiveFrom:"2026-01-01",effectiveTo:"2027-01-01",supersedesId:null,document:data.rules},randomUUID());
  rule=await rules.transition("author",rule.id,{action:"VALIDATE",expectedRevision:rule.revision,expectedDocumentHash:rule.documentHash,confirm:true},randomUUID());
  const validationHash=(rule.validation as any).validationHash;
  rule=await rules.transition("reviewer",rule.id,{action:"REVIEW",expectedRevision:rule.revision,expectedDocumentHash:rule.documentHash,validationHash,reviewNote:"Synthetic fixture",confirm:true},randomUUID());
  rule=await rules.transition("author",rule.id,{action:"PUBLISH",expectedRevision:rule.revision,expectedDocumentHash:rule.documentHash,validationHash,reviewHash:(rule.review as any).reviewHash,confirm:true},randomUUID());
  const input={...data.input,historyVersionId:history.id,legalRuleSetVersionId:rule.id},ep=await estimates.preview(f.owner,input);
  const estimate=await estimates.save(f.owner,{preview:input,expectedInputHash:ep.inputHash},randomUUID());
  const baseline=await f.plans.previewSources(f.owner,f.saved.planId,{...f.command,sourceCommands:[]});
  const command={...f.command,sourceCommands:[],pensionSelections:[{estimateId:estimate.id,expectedEstimateIntegrityHash:estimate.integrityHash,
    expectedRegistryHash:baseline.candidate!.replayInput.sourceRegistry.registryHash,commandId:randomUUID(),sourceId:"plan:bhxh",operation:"CREATE" as const,
    expectedSourceRevision:0,effectiveFromMonth:"2026-11",effectiveToMonth:"2027-03",amountPolicy:"FIXED_NOMINAL" as const,confirm:true as const}]};
  const preview=await f.plans.previewSources(f.owner,f.saved.planId,command),saved=await f.plans.saveSources(f.owner,f.saved.planId,{preview:command,expectedInputHash:preview.inputHash!,confirm:true},randomUUID());
  expect(saved.saved.preview.calculation!.rows[0].pension).toBe(estimate.assessment.monthlyPension);
  const change={expectedHistoryRevision:1,document:data.history},cp=await histories.preview(f.owner,change);
  await histories.save(f.owner,{preview:change,expectedInputHash:cp.inputHash,confirm:true},randomUUID());
  await expect(f.plans.apply(f.owner,saved.planId,{versionId:saved.saved.id,expectedRevision:2,expectedProfileRevision:1,confirm:true},randomUUID())).rejects.toMatchObject({code:"HISTORY_REVISION_CONFLICT"});
  expect((await f.plans.version(f.owner,saved.planId,saved.saved.id,true)).preview).toEqual(saved.saved.preview);
  // An ended stale estimate is historical evidence, not a dependency of new cashflows.
  const endCommand={...f.command,versionId:saved.saved.id,expectedSnapshotHash:saved.saved.snapshotHash,expectedRevision:2,
    sourceCommands:[{operation:"END" as const,sourceId:"plan:bhxh",commandId:randomUUID(),expectedSourceRevision:1,
      effectiveFromMonth:"2026-11",effectiveToMonth:"2027-03",document:"Replace stale calculation separately",confirm:true as const}],pensionSelections:[]};
  const ended=await f.plans.previewSources(f.owner,saved.planId,endCommand);
  expect(ended.candidate!.calculation.rows.every(r=>r.pension==="0")).toBe(true);
  const endSaved=await f.plans.saveSources(f.owner,saved.planId,{preview:endCommand,expectedInputHash:ended.inputHash!,confirm:true},randomUUID());
  expect((await f.plans.apply(f.owner,saved.planId,{versionId:endSaved.saved.id,expectedRevision:3,expectedProfileRevision:1,confirm:true},randomUUID())).currentVersionId).toBe(endSaved.saved.id);
});
it("rejects removed or mismatched source evidence even if the outer snapshot hash is recomputed",async()=>{
  const f=await fixture(),p=await f.plans.previewSources(f.owner,f.saved.planId,f.command);
  const saved=await f.plans.saveSources(f.owner,f.saved.planId,{preview:f.command,expectedInputHash:p.inputHash!,confirm:true},randomUUID());
  const snapshot=structuredClone(f.rows("planVersion").find(r=>r.id===saved.saved.id)!.inputSnapshot) as any;
  snapshot.preview.sourceCommands=[];
  const {integrityHash:_,...payload}=snapshot;snapshot.integrityHash=digest(payload);
  expect(()=>readSourceSnapshot(snapshot)).toThrowError(expect.objectContaining({code:"SOURCE_EVIDENCE_MISMATCH"}));
});
it("blocks edits masked by aggregate overrides, including the old schedule removed after a finite revision",async()=>{
  const f=await fixture(),p=await f.plans.previewSources(f.owner,f.saved.planId,f.command);
  const base=p.candidate!.replayInput.sourceRegistry;
  const aggregate=sealSourceRevision({sourceId:"legacy:aggregate:fixture",revision:1,previousHash:null,scope:"PLAN_VERSION",origin:"LEGACY_AGGREGATE",kind:"AGGREGATE",
    effectiveFromMonth:"2026-10",effectiveToMonth:"2027-03",knownOn:"2026-12-05",evidenceHash:digest("total override"),commandId:"legacy:fixture",confirmation:"HYPOTHETICAL",operation:"CREATE",
    schedule:[{month:"2027-01",metric:"income",amount:"700"}]});
  const registry=sealSourceRegistry({...base,revisions:[...base.revisions,aggregate]});
  expect(()=>applyFlowSourceCommand(registry,flow({operation:"REVISE",expectedSourceRevision:1,effectiveToMonth:"2026-12"}),"2026-10","2026-12-05"))
    .toThrowError(expect.objectContaining({code:"SOURCE_AGGREGATE_OVERLAP"}));
  expect(()=>applyFlowSourceCommand(registry,flow({sourceId:"plan:another"}),"2026-10","2026-12-05"))
    .toThrowError(expect.objectContaining({code:"SOURCE_AGGREGATE_OVERLAP"}));
});
