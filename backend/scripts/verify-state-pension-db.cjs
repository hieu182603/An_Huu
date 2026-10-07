const run=require('./rollback-fixture.cjs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {validatedVoluntaryPrepaidFixture,validatedVoluntaryTopUpFixture,stateBenefitFixture,validatedVoluntaryFixture,validatedVoluntaryStateFixture}=require('../src/tests/benefit-fixtures'),{wageFactors2026}=require('../src/modules/pensions/benefit-validation');
const corpus=process.argv.includes('--corpus'),topUp=process.argv.includes('--top-up'),prepaid=process.argv.includes('--prepaid');
const voluntaryState=process.argv.includes('--voluntary-state'),voluntary=voluntaryState||process.argv.includes('--voluntary');
if(process.argv.slice(2).some(a=>!['--corpus','--voluntary','--voluntary-state','--top-up','--prepaid'].includes(a)))throw Error('Usage: verify-state-pension-db.cjs [--corpus] [--voluntary | --voluntary-state | --top-up | --prepaid]');
const archived=corpus?require('./generate-legal-corpus.cjs').buildDrafts().find(d=>d.file===(prepaid?'bh2-voluntary-prepaid.draft.json':topUp?'bh2-voluntary-top-up.draft.json':voluntaryState?'bh2-voluntary-state.draft.json':voluntary?'bh2-voluntary-employer.draft.json':'bh2-state-mixed.draft.json')).draft:null;
run(prepaid?'VOLUNTARY_PREPAID'+(corpus?'_CORPUS':''):topUp?'VOLUNTARY_TOP_UP'+(corpus?'_CORPUS':''):voluntaryState?'VOLUNTARY_STATE'+(corpus?'_CORPUS':''):voluntary?(corpus?'VOLUNTARY_CORPUS':'VOLUNTARY_PENSION'):corpus?'STATE_CORPUS':'STATE_PENSION',async({tx,s,api,owner,admin,tokens,check,stage})=>{
 stage('state-history');
 const f=prepaid?validatedVoluntaryPrepaidFixture():topUp?validatedVoluntaryTopUpFixture():voluntaryState?validatedVoluntaryStateFixture():voluntary?validatedVoluntaryFixture(120):stateBenefitFixture(),p={expectedHistoryRevision:0,document:f.history};
 const hp=await api('post','/me/pension/history/import-preview',p);
 if(hp.status!==200)console.log(JSON.stringify({stage:'history-preview-response',status:hp.status,code:hp.body?.error?.code}));
 assert.equal(hp.status,200);check();
 const hs=await api('post','/me/pension/history',{preview:p,expectedInputHash:hp.body.data.inputHash,confirm:true});assert.equal(hs.status,201);check();
 const reviewer=randomUUID();await tx.user.create({data:{id:reviewer,email:reviewer+'@example.invalid',fullName:'Synthetic state reviewer',passwordHash:'not-login',role:'ADMIN',status:'ACTIVE'}});
 f.rules.citations.forEach(c=>{c.url='https://vanban.chinhphu.vn/';});
 f.rules.tables.filter(t=>t.kind==='WAGE_FACTOR').forEach(t=>{t.value=wageFactors2026[t.key.split(':')[1]];});
 if(archived)f.rules=archived.document;
 stage('state-rules');
 const created=await api('post','/admin/legal-rules',{code:'STATE_'+randomUUID().replaceAll('-','').toUpperCase(),effectiveFrom:'2026-01-01',effectiveTo:'2027-01-01',supersedesId:null,document:f.rules},tokens[2]);
 assert.equal(created.status,201);let r=created.body.data;check();
 r=await s.legalRules.transition(admin,r.id,{action:'VALIDATE',expectedRevision:r.revision,expectedDocumentHash:r.documentHash,confirm:true},randomUUID());assert.equal(r.status,'VALIDATED');check();
 const validationHash=r.validation.validationHash;
 r=await s.legalRules.transition(reviewer,r.id,{action:'REVIEW',expectedRevision:r.revision,expectedDocumentHash:r.documentHash,validationHash,reviewNote:'Synthetic rollback fixture',confirm:true},randomUUID());
 r=await s.legalRules.transition(admin,r.id,{action:'PUBLISH',expectedRevision:r.revision,expectedDocumentHash:r.documentHash,validationHash,reviewHash:r.review.reviewHash,confirm:true},randomUUID());assert.equal(r.status,'PUBLISHED');check();
 stage('state-estimates');
 if(prepaid){
  const wrong={...f.input,historyVersionId:hs.body.data.id,legalRuleSetVersionId:r.id,voluntaryPrepaid:{...f.input.voluntaryPrepaid,refundSupport:null}};
  const partial=await api('post','/me/pension/estimates/preview',wrong);assert.equal(partial.status,200);assert.equal(partial.body.data.assessment.assessmentStatus,'ELIGIBLE');
  assert.equal(partial.body.data.assessment.breakdown.find(b=>b.code==='PREPAID_REFUND_ESTIMATE').value,null);check();
 }

 if(topUp){
  const wrong={...f.input,historyVersionId:hs.body.data.id,legalRuleSetVersionId:r.id,voluntaryTopUp:{...f.input.voluntaryTopUp,monthlyIncome:'48000000'}};
  const rejected=await api('post','/me/pension/estimates/preview',wrong);assert.equal(rejected.status,200);assert.equal(rejected.body.data.assessment.monthlyPension,null);check();
 }

 const input={...f.input,historyVersionId:hs.body.data.id,legalRuleSetVersionId:r.id};
 const preview=await api('post','/me/pension/estimates/preview',input);assert.equal(preview.status,200);assert.equal(Number(preview.body.data.assessment.monthlyPension).toFixed(2),prepaid?'4857333.33':topUp?'4062666.67':voluntaryState?'3261866.67':voluntary?'4937333.33':'4048000.00');check();
 if(archived){assert.deepEqual(preview.body.data.assessment.citations,archived.document.citations);check();}
 const cmd={preview:input,expectedInputHash:preview.body.data.inputHash},key=randomUUID();
 const saved=await api('post','/me/pension/estimates',cmd,tokens[0],key);assert.equal(saved.status,201);assert.equal(saved.body.data.engineCode,prepaid?'vn-pension-voluntary-prepaid-v1':topUp?'vn-pension-voluntary-top-up-v1':voluntaryState?'vn-pension-voluntary-state-v1':voluntary?'vn-pension-voluntary-v1':'vn-pension-state-v1');check();
 assert.deepEqual((await api('post','/me/pension/estimates',cmd,tokens[0],key)).body.data,saved.body.data);check();
 assert.deepEqual((await api('get','/me/pension/estimates/'+saved.body.data.id)).body.data,saved.body.data);check();
 assert.equal((await api('get','/me/pension/estimates/'+saved.body.data.id,undefined,tokens[1])).status,404);check();
 const proof=await s.pensionEstimates.captureForSource(owner,saved.body.data.id,saved.body.data.integrityHash);
 assert.equal(proof.capture.history.id,hs.body.data.id);assert.equal(proof.ownerId,owner);check();
 const changed={...cmd,preview:prepaid?{...input,voluntaryPrepaid:{...input.voluntaryPrepaid,confirmation:'HYPOTHETICAL'}}:topUp?{...input,voluntaryTopUp:{...input.voluntaryTopUp,confirmation:'HYPOTHETICAL'}}:voluntary?{...input,voluntaryCase:{...input.voluntaryCase,benefitStart:{...input.voluntaryCase.benefitStart,confirmation:'HYPOTHETICAL'}}}:{...input,stateSalaryCase:{...input.stateSalaryCase,salaryTreatment:'UNKNOWN'}}};
 assert.equal((await api('post','/me/pension/estimates',changed)).status,409);check();
 const next={expectedHistoryRevision:1,document:structuredClone(f.history)};next.document.months.forEach(m=>{if(voluntary||topUp||prepaid)m.contributionBase='12000000';else m.stateSalary.totalContributionCoefficient='5';});
 const np=await s.insuranceHistory.preview(owner,next);await s.insuranceHistory.save(owner,{preview:next,expectedInputHash:np.inputHash,confirm:true},randomUUID());
 assert.equal((await api('post','/me/pension/estimates/preview',input)).status,409);check();
 await assert.rejects(()=>s.pensionEstimates.captureForSource(owner,saved.body.data.id,saved.body.data.integrityHash),e=>e.code==='HISTORY_REVISION_CONFLICT');check();
 assert.deepEqual((await api('get','/me/pension/estimates/'+saved.body.data.id)).body.data,saved.body.data);check();
 assert.equal(await tx.financialProfile.count({where:{userId:owner}}),0);check();
});
