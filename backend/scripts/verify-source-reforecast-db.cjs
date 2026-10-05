const run=require('./rollback-fixture.cjs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {retirementProfile,retirementCommand,retirementConfiguration}=require('../src/tests/retirement-fixtures');
run('SOURCE_V4',async({api,owner,tokens,check,stage})=>{
 const [token,other,admin]=tokens;
 const ok=async(method,path,body,access=token,key=randomUUID(),status=200)=>{const r=await api(method,path,body,access,key);assert.equal(r.status,status,`${method} ${path}: ${r.body.error?.code}`);return r.body.data;};
 stage('profile');const profile=retirementProfile();profile.valuationDate='2026-08-01';
 await ok('put','/me/onboarding-draft',{expectedRevision:0,step:'summary',data:profile});
 await ok('post','/me/onboarding/complete',{expectedDraftRevision:1,expectedProfileRevision:0});
 const profileBefore=await ok('get','/me/financial-profile');
 const cfg=retirementConfiguration(),a=await ok('post','/admin/assumptions',cfg.assumptions,admin,randomUUID(),201),ap='/admin/assumptions/'+a.id;
 const impact=await ok('post',ap+'/impact',{expectedRevision:1},admin);
 await ok('post',ap+'/approve',{expectedRevision:1,impactToken:impact.impactToken,reviewNote:'Rollback fixture approval'},admin);
 await ok('post',ap+'/publish',{expectedRevision:2,confirm:true},admin);
 const p=await ok('post','/admin/portfolio-policies',{...cfg.policy,assumptionVersionId:a.id},admin,randomUUID(),201),pp='/admin/portfolio-policies/'+p.id;
 await ok('post',pp+'/approve',{expectedRevision:1,reviewNote:'Rollback fixture approval',confirm:true},admin);
 await ok('post',pp+'/publish',{expectedRevision:2,confirm:true},admin);
 const input=retirementCommand(p.id),evaluated=await ok('post','/me/retirement/preview',input);assert.equal(evaluated.status,'READY');check();
 const original=await ok('post','/me/retirement/plans',{expectedRevision:0,expectedInputHash:evaluated.inputHash,preview:input},token,randomUUID(),201),root='/me/retirement/plans/'+original.planId;
 const actual={currency:'VND',openingBalance:'1000',closingBalance:'1000',entries:[],correctionReason:'Fixture statement'};
 await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:0,data:actual});
 const command={versionId:original.saved.id,expectedSnapshotHash:original.saved.snapshotHash,expectedRevision:1,expectedProfileRevision:1,throughMonth:'2026-08',pensionSelections:[],
  sourceCommands:[{operation:'CREATE',commandId:randomUUID(),sourceId:'plan:rent',expectedSourceRevision:0,effectiveFromMonth:'2026-09',effectiveToMonth:'2027-03',
   metric:'income',frequency:'MONTHLY',amount:'500',currency:'VND',confirmation:'HYPOTHETICAL',document:'Fixture source contract',confirm:true}]};
 stage('source-preview');const preview=await ok('post',root+'/source-reforecasts/preview',command);assert.equal(preview.candidate.modelVersion,'retirement-monthly-v4');check();
 assert.equal(preview.candidate.calculation.rows[0].openingBalance,'1000');assert.equal(preview.candidate.calculation.rows[0].contribution,'100');check();
 stage('source-save');const body={preview:command,expectedInputHash:preview.inputHash,confirm:true},key=randomUUID();
 const saved=await ok('post',root+'/source-reforecasts',body,token,key,201);assert.equal(saved.currentVersionId,null);check();
 assert.deepEqual(await ok('post',root+'/source-reforecasts',body,token,key,201),saved);check();
 assert.equal((await ok('post',root+'/versions/'+saved.saved.id+'/replay',{})).replay.matched,true);check();
 assert.deepEqual(await ok('get',root+'/versions/'+original.saved.id),original.saved);check();
 assert.equal((await api('post',root+'/source-reforecasts/preview',command,other)).status,404);check();
 assert.equal((await api('post',root+'/source-reforecasts/preview',command,admin)).status,403);check();
 assert.equal((await api('post',root+'/source-reforecasts',body)).status,409);check();
 stage('source-revise');const revision={...command,versionId:saved.saved.id,expectedSnapshotHash:saved.saved.snapshotHash,expectedRevision:2,
  sourceCommands:[{...command.sourceCommands[0],commandId:randomUUID(),operation:'REVISE',expectedSourceRevision:1,amount:'250'}]};
 const revised=await ok('post',root+'/source-reforecasts/preview',revision);assert.ok(revised.candidate.calculation.attribution.filter(r=>r.sourceId==='plan:rent').every(r=>r.amount==='250'));check();
 await ok('post',root+'/apply',{versionId:saved.saved.id,expectedRevision:2,expectedProfileRevision:1,confirm:true});check();
 assert.equal((await ok('get',root+'/report')).hypothetical,true);check();
 const csv=await api('get',root+'/versions/'+saved.saved.id+'/export.csv');assert.equal(csv.status,200);assert.ok(csv.text.includes('sourceAttributionJson'));check();
 assert.deepEqual(await ok('get','/me/financial-profile'),profileBefore);check();
 stage('changed-actual');await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:1,data:{...actual,correctionReason:'Corrected reference'}});
 const stale=await api('post',root+'/apply',{versionId:saved.saved.id,expectedRevision:3,expectedProfileRevision:1,confirm:true});assert.equal(stale.status,409);assert.equal(stale.body.error.code,'ACTUAL_SOURCE_CHANGED');check();
 assert.equal((await ok('post',root+'/versions/'+saved.saved.id+'/replay',{})).replay.matched,true);check();
});
