const run=require('./rollback-fixture.cjs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {retirementProfile,retirementCommand,retirementConfiguration}=require('../src/tests/retirement-fixtures');
const {known,fixtureAsset}=require('../src/tests/profile-v2-fixtures');
const {debtFixture,loanFixture}=require('../src/tests/debt-fixtures');
run('SOURCE-CHANGES',async({tx,api,owner,tokens,check,stage})=>{
 const [token,other,admin]=tokens;
 const ok=async(method,path,body,access=token,key=randomUUID(),status=200)=>{const r=await api(method,path,body,access,key);assert.equal(r.status,status,`${method} ${path}: ${r.body.error?.code}`);return r.body.data;};
 stage('onboarding-goal');const profile=retirementProfile();profile.valuationDate='2026-08-01';
 profile.income.entries[0].amount=known('1000');
 const loan=loanFixture({balanceAsOf:'2026-08-01',confirmedOn:'2026-08-01'});
 loan.periods=loan.periods.map((p,i)=>({...p,dueDate:require('../src/common/calendar').addMonths('2026-08',i)+'-28'}));loan.maturityDate=loan.periods.at(-1).dueDate;
 profile.debts={status:'KNOWN',entries:[debtFixture({balanceAsOf:known('2026-08-01')},loan),debtFixture({id:'loan-b',balanceAsOf:known('2026-08-01')},loan)]};
 profile.assets={status:'KNOWN',entries:[fixtureAsset({value:known('600'),valuedOn:known('2026-08-01'),availableFromMonth:known('2027-02'),retirementShare:known('1'),emergencyShare:known('0'),otherGoalsShare:known('0')})]};
 profile.personal.pensionStartMonth=known('2027-01');
 profile.pension={status:'KNOWN',monthlyAmount:'50',currency:'VND',priceBasis:'NOMINAL_AT_START',basisMonth:'2027-01',estimatedOn:'2026-08-01',source:'Fixture pension notice',adjustment:{kind:'NONE'}};
 await ok('put','/me/onboarding-draft',{expectedRevision:0,step:'summary',data:profile});
 const completeKey=randomUUID(),complete={expectedDraftRevision:1,expectedProfileRevision:0};
 const completed=await ok('post','/me/onboarding/complete',complete,token,completeKey);
 assert.deepEqual(await ok('post','/me/onboarding/complete',complete,token,completeKey),completed);check();
 const savedProfile=await ok('get','/me/financial-profile');assert.equal(savedProfile.revision,1);check();
 async function configVersion(changed=false){const cfg=retirementConfiguration();
  if(changed)cfg.assumptions.inflation=cfg.assumptions.inflation.map(v=>({...v,percent:'1'}));
  const a=await ok('post','/admin/assumptions',cfg.assumptions,admin,randomUUID(),201),base='/admin/assumptions/'+a.id;
  const impact=await ok('post',base+'/impact',{expectedRevision:1},admin);
  await ok('post',base+'/approve',{expectedRevision:1,impactToken:impact.impactToken,reviewNote:'Rollback fixture approval'},admin);
  await ok('post',base+'/publish',{expectedRevision:2,confirm:true},admin);
  const p=await ok('post','/admin/portfolio-policies',{...cfg.policy,assumptionVersionId:a.id},admin,randomUUID(),201),path='/admin/portfolio-policies/'+p.id;
  await ok('post',path+'/approve',{expectedRevision:1,reviewNote:'Rollback fixture approval',confirm:true},admin);
  await ok('post',path+'/publish',{expectedRevision:2,confirm:true},admin);return {a,p};
 }
 stage('baseline');const cfg=await configVersion(),preview=retirementCommand(cfg.p.id);
 const evaluated=await ok('post','/me/retirement/preview',preview);assert.equal(evaluated.status,'READY');check();
 const plan=await ok('post','/me/retirement/plans',{expectedRevision:0,expectedInputHash:evaluated.inputHash,preview},token,randomUUID(),201),root='/me/retirement/plans/'+plan.planId;
 await ok('post',root+'/apply',{versionId:plan.saved.id,expectedRevision:1,expectedProfileRevision:1,confirm:true});
 stage('linked-actuals');const debtEvent=randomUUID(),assetEvent=randomUUID();
 const data={currency:'VND',openingBalance:'100',closingBalance:'700',correctionReason:'Confirmed fixture statement',entries:[
  {eventId:debtEvent,date:'2026-08-28',kind:'DEBT_PAYMENT',amount:'1000'},
  {eventId:assetEvent,date:'2026-08-28',kind:'CONTRIBUTION',amount:'600'}]};
 await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:0,data});
 const review={confirmed:true,document:'Reviewed fixture source'},changes=[
  {...review,id:randomUUID(),kind:'DEBT_SETTLED',sourceId:'loan-a',actual:{period:'2026-08',eventId:debtEvent},remainingObligation:'0'},
  {...review,id:randomUUID(),kind:'ASSET_REALIZED',sourceId:'deposit-1',actual:{period:'2026-08',eventId:assetEvent}},
  {...review,id:randomUUID(),kind:'PENSION_REPLACE',sourceId:'pension',startMonth:'2027-01',endMonth:'2027-03',monthlyAmount:'70',priceBasis:'NOMINAL_MONTHLY'},
  {...review,id:randomUUID(),kind:'FLOW_REPLACE',sourceType:'INCOME',sourceId:'salary',startMonth:'2026-09',endMonth:'2026-09',monthlyAmount:'800'}];
 const input={planId:plan.planId,versionId:plan.saved.id,throughMonth:'2026-08',expectedProfileRevision:1,sourceChanges:changes};
 const candidate=await ok('post','/me/retirement/actuals/reforecast/preview',input),rows=candidate.candidate.calculation.rows;
 assert.equal(rows[0].openingBalance,'700');assert.equal(rows[0].income,'800');assert.equal(rows[0].closingBalance,'800');check();
 assert.equal(rows.find(r=>r.month==='2026-10').debtPayment,'108');assert.equal(candidate.beforeChanges.rows.find(r=>r.month==='2026-10').debtPayment,'216');check();
 assert.equal(rows.find(r=>r.month==='2027-02').capitalInjection,'0');assert.equal(rows.find(r=>r.month==='2027-01').pension,'70');check();
 stage('persist-source-history');const cmd={expectedRevision:2,expectedInputHash:candidate.inputHash,preview:input},key=randomUUID();
 const saved=await ok('post',root+'/reforecasts',cmd,token,key,201);
 assert.deepEqual(await ok('post',root+'/reforecasts',cmd,token,key,201),saved);assert.equal(saved.currentVersionId,plan.saved.id);assert.deepEqual(saved.saved.preview.sourceChanges,changes);check();
 const replay=await ok('post',root+'/versions/'+saved.saved.id+'/replay',{});assert.equal(replay.replay.matched,true);check();
 await ok('post',root+'/apply',{versionId:saved.saved.id,expectedRevision:3,expectedProfileRevision:1,confirm:true});
 const report=await ok('get',root+'/report');assert.equal(report.currentVersionId,saved.saved.id);assert.equal(report.baselineVersionId,plan.saved.id);assert.equal(report.hypothetical,true);check();
 const csv=await api('get',root+'/versions/'+saved.saved.id+'/export.csv');assert.equal(csv.status,200);assert.ok(csv.text.includes(changes[0].id));check();
 const schema=await require('@apidevtools/swagger-parser').dereference('docs/openapi.yaml'),Ajv=require('ajv');
 const ajv=new Ajv({strict:false,formats:{uuid:true,date:true,'date-time':true}});
 const checkEnvelope=ajv.compile(schema.components.schemas.ActualUpdatePreviewEnvelope);
 assert.equal(checkEnvelope({data:candidate,meta:{requestId:randomUUID()}}),true,JSON.stringify(checkEnvelope.errors));check();
 stage('reject-bad-source');
 for(const access of [other,admin])assert.equal((await api('post','/me/retirement/actuals/reforecast/preview',input,access)).status,access===other?404:403);check();
 const invalid=await api('post','/me/retirement/actuals/reforecast/preview',{...input,sourceChanges:[{...changes[0],actual:{period:'2026-08',eventId:assetEvent}}]});assert.equal(invalid.status,422);check();
 const duplicate=await api('post','/me/retirement/actuals/reforecast/preview',{...input,sourceChanges:[changes[0],{...changes[0],id:randomUUID(),sourceId:'loan-b'}]});assert.equal(duplicate.status,422);check();
 stage('evidence-correction');await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:1,data:{...data,correctionReason:'Evidence changed'}});
 assert.equal((await ok('get',root+'/report')).actualSourceChanged,true);check();
 const stale=await api('post',root+'/apply',{versionId:saved.saved.id,expectedRevision:4,expectedProfileRevision:1,confirm:true});assert.equal(stale.status,409);assert.equal(stale.body.error.code,'ACTUAL_SOURCE_CHANGED');check();
 assert.equal((await ok('post',root+'/versions/'+saved.saved.id+'/replay',{})).replay.matched,true);
 assert.deepEqual(await ok('get',root+'/versions/'+plan.saved.id),plan.saved);check();
});
