const run=require('./rollback-fixture.cjs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {retirementProfile,retirementCommand,retirementConfiguration}=require('../src/tests/retirement-fixtures');
const withRefinance=process.argv.includes('--refinance'),withLoan=process.argv.includes('--loan')||withRefinance;
run(withRefinance?'SOURCE_V4_REFINANCE':withLoan?'SOURCE_V4_LOAN':'SOURCE_V4',async({api,owner,tokens,check,stage})=>{
 const [token,other,admin]=tokens;
 const ok=async(method,path,body,access=token,key=randomUUID(),status=200)=>{const r=await api(method,path,body,access,key);assert.equal(r.status,status,`${method} ${path}: ${r.body.error?.code}`);return r.body.data;};
 stage('profile');const profile=retirementProfile();profile.valuationDate='2026-08-01';
 if(withLoan){
  const {debtFixture,loanFixture}=require('../src/tests/debt-fixtures'),{addMonths}=require('../src/common/calendar');
  const contract=loanFixture();contract.balanceAsOf='2026-08-01';contract.confirmedOn='2026-07-31';contract.maturityDate='2027-05-28';
  contract.periods.forEach((p,i)=>p.dueDate=addMonths('2026-08',i)+'-28');
  profile.debts={status:'KNOWN',entries:[debtFixture({balanceAsOf:{status:'KNOWN',value:'2026-08-01'}},contract)]};
  profile.income.entries[0].amount={status:'KNOWN',value:'10000'};
 }
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
 if(withLoan){actual.closingBalance='880';actual.entries=[{eventId:randomUUID(),date:'2026-08-28',kind:'DEBT_PAYMENT',amount:withRefinance?'1020':'120'},
  {eventId:randomUUID(),date:'2026-08-28',kind:'WITHDRAWAL',amount:'120'}];}
 await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:0,data:actual});
 const command={versionId:original.saved.id,expectedSnapshotHash:original.saved.snapshotHash,expectedRevision:1,expectedProfileRevision:1,throughMonth:'2026-08',pensionSelections:[],
  sourceCommands:[{operation:'CREATE',commandId:randomUUID(),sourceId:'plan:rent',expectedSourceRevision:0,effectiveFromMonth:'2026-09',effectiveToMonth:'2027-03',
   metric:'income',frequency:'MONTHLY',amount:'500',currency:'VND',confirmation:'HYPOTHETICAL',document:'Fixture source contract',confirm:true}]};
 if(withLoan){
  const initial=await ok('post',root+'/source-reforecasts/preview',command),option=initial.loanRevisionOptions.find(s=>s.sourceId==='profile:debt:loan-a');assert.ok(option);check();
  const {addMonths}=require('../src/common/calendar'),knownOn=new Date(Date.now()+7*3600000).toISOString().slice(0,10),evidence=[{reference:'Rollback-only loan confirmation',contentHash:'a'.repeat(64),confirmedOn:knownOn}];
  let accrualFrom='2026-08-31';const periods=Array.from({length:9},(_,i)=>{
   const dueDate=new Date(Date.parse(addMonths('2026-09',i+1)+'-01T00:00:00Z')-86400000).toISOString().slice(0,10);
   const row={accrualFrom,dueDate,rate:{kind:'SIMPLE_ANNUAL_DAILY',percent:'0',days:(Date.parse(dueDate)-Date.parse(accrualFrom))/86400000,yearDays:365},fee:'0',carriedInterest:'0',gracePrincipal:false,bankPayment:null};accrualFrom=dueDate;return row;
  });
  const components={principal:'100',interest:'10',prepaymentFee:'10',otherFee:'0'};
  command.loanRevisions=[{commandId:randomUUID(),sourceId:option.sourceId,operation:'REVISE',expectedSourceRevision:option.sourceRevision,expectedSourceHash:option.sourceHash,expectedContractHash:option.contractHash,confirm:true,
   legacyOpening:{signedOn:'2026-01-01',amendedOn:null,effectiveOn:'2026-01-01',knownOn,previouslyPaid:'0',evidence},principalAdvances:[],
   allocations:[{allocationId:randomUUID(),eventId:actual.entries[0].eventId,actualRevision:1,bookedOn:'2026-08-28',scope:'FULL_CONTRACT',components,contractComponents:components,paymentStatus:'CURRENT',allocationBasis:'BANK_STATEMENT',evidence}],
   contract:{contractVersion:2,currency:'VND',signedOn:'2026-01-01',amendedOn:'2026-08-31',effectiveOn:'2026-08-31',knownOn,confirmation:'BANK_CONFIRMED',evidence,balanceAsOf:'2026-08-31',principalBalance:'900',balanceScope:'FULL_CONTRACT',paymentShare:'1',responsibility:{kind:'ALLOCATED_SHARE'},interestBasis:'REDUCING_BALANCE',rounding:'CENT_HALF_UP',mode:'REDUCE_PAYMENT_KEEP_TERM',fixedPayment:null,finalPayment:'ADJUST_FINAL_PAYMENT',maturityDate:periods.at(-1).dueDate,periods}}];
  if(withRefinance){
   const refinanceId=randomUUID(),closing=command.loanRevisions[0],contract=JSON.parse(JSON.stringify(closing.contract));
   closing.operation='END';closing.refinanceCommandId=refinanceId;closing.contract={...closing.contract,principalBalance:'0',mode:'BANK_SCHEDULE',periods:[],maturityDate:'2026-08-31',finalPayment:'NO_BALLOON'};
   closing.allocations[0].components.principal='1000';closing.allocations[0].contractComponents.principal='1000';
   const replacement={commandId:randomUUID(),sourceId:'plan:'+randomUUID(),operation:'CREATE',expectedSourceRevision:0,confirm:true,refinanceCommandId:refinanceId,agreementReference:'Rollback refinancing replacement',
    contract:{...contract,signedOn:'2026-08-01',amendedOn:null,effectiveOn:'2026-08-28'},funding:{kind:'EXISTING_BALANCE',notAlreadyInSources:true,evidence}};
   command.loanCreations=[replacement];command.refinances=[{commandId:refinanceId,closingCommandId:closing.commandId,newLoanCommandId:replacement.commandId,settledOn:'2026-08-28',fundingScope:'FULL_CONTRACT',grossDisbursement:'900',withheldFees:'0',externalTopUp:'120',unusedProceeds:'0',confirm:true,evidence}];
  }
 }
 stage('source-preview');const preview=await ok('post',root+'/source-reforecasts/preview',command);assert.equal(preview.candidate.modelVersion,'retirement-monthly-v4');check();
 assert.equal(preview.candidate.calculation.rows[0].openingBalance,actual.closingBalance);assert.equal(preview.candidate.calculation.rows[0].contribution,'100');check();
 if(withLoan){assert.equal(preview.candidate.loanSources.length,1);assert.ok(preview.candidate.calculation.attribution.filter(a=>a.sourceId==='profile:debt:loan-a').every(a=>a.amount==='100'));check();}
 if(withRefinance){assert.equal(preview.candidate.refinances[0].settlementAmount,'1020');assert.equal(preview.candidate.calculation.attribution.filter(a=>a.sourceId==='profile:debt:loan-a').length,0);
  assert.ok(preview.candidate.calculation.attribution.filter(a=>a.sourceId===command.loanCreations[0].sourceId).every(a=>a.amount==='100'));check();}
 stage('source-save');const body={preview:command,expectedInputHash:preview.inputHash,confirm:true},key=randomUUID();
 const saved=await ok('post',root+'/source-reforecasts',body,token,key,201);assert.equal(saved.currentVersionId,null);check();
 assert.deepEqual(await ok('post',root+'/source-reforecasts',body,token,key,201),saved);check();
 assert.equal((await ok('post',root+'/versions/'+saved.saved.id+'/replay',{})).replay.matched,true);check();
 assert.deepEqual(await ok('get',root+'/versions/'+original.saved.id),original.saved);check();
 assert.equal((await api('post',root+'/source-reforecasts/preview',command,other)).status,404);check();
 assert.equal((await api('post',root+'/source-reforecasts/preview',command,admin)).status,403);check();
 assert.equal((await api('post',root+'/source-reforecasts',body)).status,409);check();
 stage('source-revise');const revision={...command,versionId:saved.saved.id,expectedSnapshotHash:saved.saved.snapshotHash,expectedRevision:2,
  loanRevisions:[],loanCreations:[],refinances:[],
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
