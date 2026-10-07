const run=require('./rollback-fixture.cjs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {retirementProfile,retirementCommand,retirementConfiguration}=require('../src/tests/retirement-fixtures');
const withPlanned=process.argv.includes('--planned-refinance');
const withAmend=process.argv.includes('--loan-amendment');
const withEarlyDisbursement=process.argv.includes('--refinance-early-disbursement');
const withDisbursedAmended=process.argv.includes('--disbursed-amended');
const withRepaid=withDisbursedAmended||withEarlyDisbursement||process.argv.includes('--refinance-repaid'),withRefinance=withRepaid||process.argv.includes('--refinance'),withLoan=withPlanned||withAmend||process.argv.includes('--loan')||withRefinance;
const withMissed=process.argv.includes('--assets-missed'),withAssets=withMissed||process.argv.includes('--assets');
const withRental=process.argv.includes('--rental-sale');
const withLegacy=process.argv.includes('--assets-legacy'),withReleases=process.argv.includes('--assets-releases'),withStaged=withLegacy||withReleases||process.argv.includes('--assets-staged');
run(withPlanned?'SOURCE_V4_PLANNED_REFINANCE':withDisbursedAmended?'SOURCE_V4_DISBURSED_AMENDED':withEarlyDisbursement?'SOURCE_V4_REFINANCE_EARLY_DISBURSEMENT':withAmend?'SOURCE_V4_LOAN_AMENDMENT':withLegacy?'SOURCE_V4_LEGACY_CAPITAL':withReleases?'SOURCE_V4_ASSETS_RELEASES':withStaged?'SOURCE_V4_ASSETS_STAGED':withRental?'SOURCE_V4_RENTAL_SALE':withMissed?'SOURCE_V4_ASSETS_MISSED':withRepaid?'SOURCE_V4_REFINANCE_REPAID':withAssets?'SOURCE_V4_ASSETS':withRefinance?'SOURCE_V4_REFINANCE':withLoan?'SOURCE_V4_LOAN':'SOURCE_V4',async({api,owner,tokens,check,stage})=>{
 const [token,other,admin]=tokens;
 const ok=async(method,path,body,access=token,key=randomUUID(),status=200)=>{const r=await api(method,path,body,access,key);assert.equal(r.status,status,`${method} ${path}: ${r.body.error?.code}`);return r.body.data;};
 stage('profile');const profile=retirementProfile();profile.valuationDate='2026-08-01';
 if(withLegacy){const {fixtureAsset,known}=require('../src/tests/profile-v2-fixtures');profile.assets={status:'KNOWN',entries:[fixtureAsset({id:'legacy-asset',value:known('800'),valuedOn:known('2026-08-01'),availableFromMonth:known('2026-09'),
  ownershipShare:known('0.5'),retirementShare:known('0.5'),emergencyShare:known('0.3'),otherGoalsShare:known('0.2')})]};}
 if(withRental){
  const {fixtureAsset,known}=require('../src/tests/profile-v2-fixtures');
  profile.assets={status:'KNOWN',entries:[fixtureAsset({id:'rental',type:'REAL_ESTATE',value:known('1000'),valuedOn:known('2026-08-01'),availableFromMonth:known('2026-08'),ownershipShare:known('0.5'),retirementShare:known('0.5'),emergencyShare:known('0.3'),otherGoalsShare:known('0.2'),
   housingPlan:{status:'CONFIRMED',kind:'RENT',startMonth:'2026-08',netAmount:known('80')}})]};
 }
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
 const input=retirementCommand(p.id);if(withRental)input.housing=[{assetId:'rental',amountScope:'WHOLE_ASSET'}];
 const evaluated=await ok('post','/me/retirement/preview',input);assert.equal(evaluated.status,'READY');check();
 const original=await ok('post','/me/retirement/plans',{expectedRevision:0,expectedInputHash:evaluated.inputHash,preview:input},token,randomUUID(),201),root='/me/retirement/plans/'+original.planId;
 const actual={currency:'VND',openingBalance:'1000',closingBalance:'1000',entries:[],correctionReason:'Fixture statement'};
 if(withLoan){actual.closingBalance='880';actual.entries=[{eventId:randomUUID(),date:'2026-08-28',kind:'DEBT_PAYMENT',amount:withRefinance?'1020':'120'},
  {eventId:randomUUID(),date:'2026-08-28',kind:'WITHDRAWAL',amount:'120'}];}
 if(withRepaid){actual.closingBalance='770';actual.entries.push({eventId:randomUUID(),date:'2026-08-30',kind:'DEBT_PAYMENT',amount:'110'},{eventId:randomUUID(),date:'2026-08-30',kind:'WITHDRAWAL',amount:'110'});}
 if(withAssets){actual.closingBalance='1300';actual.entries=[{eventId:randomUUID(),date:'2026-08-28',kind:'CONTRIBUTION',amount:'300'}];}
 if(withStaged){actual.closingBalance='1060';actual.entries=[{eventId:randomUUID(),date:'2026-08-28',kind:'CONTRIBUTION',amount:'60'}];}
 await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:0,data:actual});
 if(withLegacy){
  stage('legacy-capital');const changeId=randomUUID(),sourceId='profile:asset:legacy-asset';
  const legacyInput={planId:original.planId,versionId:original.saved.id,expectedProfileRevision:1,throughMonth:'2026-08',sourceChanges:[{id:changeId,kind:'ASSET_REALIZED',sourceId:'legacy-asset',actual:{period:'2026-08',eventId:actual.entries[0].eventId},confirmed:true,document:'Legacy source contribution'}]};
  const lp=await ok('post','/me/retirement/actuals/reforecast/preview',legacyInput);
  const legacy=await ok('post',root+'/reforecasts',{expectedRevision:1,expectedInputHash:lp.inputHash,preview:legacyInput},token,randomUUID(),201);check();
  assert.equal((await ok('post',root+'/versions/'+legacy.saved.id+'/replay',{})).replay.matched,true);check();
  const command={versionId:legacy.saved.id,expectedSnapshotHash:legacy.saved.snapshotHash,expectedRevision:2,expectedProfileRevision:1,throughMonth:'2026-08',sourceCommands:[]};
  const base=await ok('post',root+'/source-reforecasts/preview',command),option=base.assetRevisionOptions.find(s=>s.sourceId===sourceId);assert.ok(option);check();
  command.assetCommands=[{commandId:randomUUID(),sourceId,operation:'REVISE',expectedSourceRevision:option.sourceRevision,expectedSourceHash:option.sourceHash,confirm:true,
   evidence:[{reference:'Legacy remaining capital confirmed',contentHash:'e'.repeat(64),confirmedOn:'2026-10-01'}],
   capital:{reference:'legacy-asset',kind:'LIQUID_CAPITAL',currency:'VND',priceBasis:'NOMINAL_AT_AVAILABILITY',amountScope:'WHOLE_ASSET',ownershipShare:'0.5',retirementShare:'0.5',grossAmount:'1000',fees:'50',taxes:'50',securedDebtSettlement:'100',netAmount:'800',availableOn:'2026-08-20',confirmedContributionAmount:'200',
    funding:{status:'STAGED',liquidity:'AVAILABLE',plannedNotIncludedInFund:true,allocations:[],plannedContributions:[{installmentId:randomUUID(),month:'2026-09',amount:'140',timing:'END_OF_MONTH'}],reconciliations:[]}}}];
  const wrong=JSON.parse(JSON.stringify(command));wrong.assetCommands[0].capital.confirmedContributionAmount='140';
  const invalid=await api('post',root+'/source-reforecasts/preview',wrong);assert.equal(invalid.status,422);assert.equal(invalid.body.error.code,'ASSET_INSTALLMENT_TOTAL_MISMATCH');check();
  const preview=await ok('post',root+'/source-reforecasts/preview',command);assert.equal(preview.candidate.calculation.rows[0].openingBalance,'1060');assert.equal(preview.candidate.calculation.rows[0].capitalInjection,'140');
  assert.equal(preview.candidate.assetSources[0].evidence.priorRealized[0].allocationId,changeId);assert.equal(preview.candidate.assetSources[0].evidence.priorRealized[0].amount,'60');check();
  const body={preview:command,expectedInputHash:preview.inputHash,confirm:true},key=randomUUID(),saved=await ok('post',root+'/source-reforecasts',body,token,key,201);check();
  assert.deepEqual(await ok('post',root+'/source-reforecasts',body,token,key,201),saved);check();
  assert.equal((await api('post',root+'/source-reforecasts/preview',command,other)).status,404);check();
  assert.equal((await api('post',root+'/source-reforecasts/preview',command,admin)).status,403);check();
  for(const v of [original,legacy,saved]){assert.equal((await ok('post',root+'/versions/'+v.saved.id+'/replay',{})).replay.matched,true);check();}
  await ok('post',root+'/apply',{versionId:saved.saved.id,expectedRevision:3,expectedProfileRevision:1,confirm:true});check();
  assert.deepEqual(await ok('get','/me/financial-profile'),profileBefore);check();
  const csv=await api('get',root+'/versions/'+saved.saved.id+'/export.csv');assert.equal(csv.status,200);assert.ok(csv.text.includes(sourceId));check();
  await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:1,data:{...actual,correctionReason:'Corrected legacy reference'}});
  const stale=await api('post',root+'/apply',{versionId:saved.saved.id,expectedRevision:4,expectedProfileRevision:1,confirm:true});assert.equal(stale.status,409);assert.equal(stale.body.error.code,'ACTUAL_SOURCE_CHANGED');check();
  for(const v of [legacy,saved]){assert.equal((await ok('post',root+'/versions/'+v.saved.id+'/replay',{})).replay.matched,true);check();}
  return;
 }
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
  if(withAmend){
   const c=command.loanRevisions[0];c.contract.userPaidToDate='170';
   c.contract.responsibility={kind:'CAPPED',capBasis:'TOTAL_USER_PAYMENTS',limit:'300',previouslyPaid:'170',evidence};
   c.responsibilityAmendment={effectiveOn:c.contract.effectiveOn,openingUserPaid:'50',confirm:true,evidence};
   const invalid=JSON.parse(JSON.stringify(command));delete invalid.loanRevisions[0].responsibilityAmendment;
   const rejected=await api('post',root+'/source-reforecasts/preview',invalid);assert.equal(rejected.status,409);assert.equal(rejected.body.error.code,'LOAN_RESPONSIBILITY_REVIEW_REQUIRED');check();
   const amended=await ok('post',root+'/source-reforecasts/preview',command);
   assert.equal(amended.candidate.calculation.rows[0].openingBalance,'880');
   assert.equal(amended.candidate.calculation.attribution.filter(a=>a.sourceId===c.sourceId).reduce((n,a)=>n+Number(a.amount),0),130);check();
  }
  if(withRefinance){
   const refinanceId=randomUUID(),closing=command.loanRevisions[0],contract=JSON.parse(JSON.stringify(closing.contract));
   closing.operation='END';closing.refinanceCommandId=refinanceId;closing.contract={...closing.contract,principalBalance:'0',mode:'BANK_SCHEDULE',periods:[],maturityDate:'2026-08-31',finalPayment:'NO_BALLOON'};
   closing.allocations[0].components.principal='1000';closing.allocations[0].contractComponents.principal='1000';
   const replacement={commandId:randomUUID(),sourceId:'plan:'+randomUUID(),operation:'CREATE',expectedSourceRevision:0,confirm:true,refinanceCommandId:refinanceId,agreementReference:'Rollback refinancing replacement',
    contract:{...contract,signedOn:'2026-08-01',amendedOn:null,effectiveOn:'2026-08-28'},funding:{kind:'EXISTING_BALANCE',notAlreadyInSources:true,evidence}};
   if(withRepaid){
    const parts={principal:'100',interest:'10',prepaymentFee:'0',otherFee:'0'};
    replacement.funding={kind:'DISBURSED_BALANCE',notAlreadyInSources:true,disbursedOn:'2026-08-28',grossPrincipal:'1000',openingUserPaid:'0',evidence,
     allocations:[{allocationId:randomUUID(),eventId:actual.entries[2].eventId,actualRevision:1,bookedOn:'2026-08-30',scope:'FULL_CONTRACT',components:parts,contractComponents:parts,paymentStatus:'CURRENT',allocationBasis:'BANK_STATEMENT',evidence}],principalAdvances:[]};
   }
   command.loanCreations=[replacement];command.refinances=[{commandId:refinanceId,closingCommandId:closing.commandId,newLoanCommandId:replacement.commandId,settledOn:'2026-08-28',fundingScope:'FULL_CONTRACT',grossDisbursement:withRepaid?'1000':'900',withheldFees:'0',externalTopUp:'120',unusedProceeds:withRepaid?'100':'0',confirm:true,evidence}];
   if(withDisbursedAmended){
    // Bank amends the replacement the day after disbursement: FULL_CONTRACT → USER_SHARE.
    const f=replacement.funding;f.originalTerms={signedOn:replacement.contract.signedOn,amendedOn:null,effectiveOn:'2026-08-28',balanceScope:'FULL_CONTRACT',paymentShare:'1',responsibility:{kind:'ALLOCATED_SHARE'},evidence,confirm:true};
    replacement.contract={...replacement.contract,amendedOn:'2026-08-29',effectiveOn:'2026-08-29',balanceScope:'USER_SHARE',paymentShare:'1',principalBalance:'400'};
    f.allocations[0].scope='USER_SHARE';f.scopeChange={openingPrincipal:'500',evidence,confirm:true};
    const missing=JSON.parse(JSON.stringify(command));delete missing.loanCreations[0].funding.originalTerms;
    const r1=await api('post',root+'/source-reforecasts/preview',missing);assert.equal(r1.status,422);assert.equal(r1.body.error.code,'LOAN_ORIGINAL_TERMS_REQUIRED');check();
    const noScope=JSON.parse(JSON.stringify(command));delete noScope.loanCreations[0].funding.scopeChange;
    const r2=await api('post',root+'/source-reforecasts/preview',noScope);assert.equal(r2.status,422);assert.equal(r2.body.error.code,'LOAN_SCOPE_CHANGE_REQUIRED');check();
    const tooHigh=JSON.parse(JSON.stringify(command));tooHigh.loanCreations[0].funding.scopeChange.openingPrincipal='1001';
    const r3=await api('post',root+'/source-reforecasts/preview',tooHigh);assert.equal(r3.status,422);assert.equal(r3.body.error.code,'LOAN_SCOPE_CHANGE_INVALID');check();
   }
   if(withEarlyDisbursement){
    replacement.contract.effectiveOn='2026-08-20';replacement.funding.disbursedOn='2026-08-20';
    const r=command.refinances[0];r.unusedProceeds='0';r.proceedsAtSettlement={availableAmount:'900',confirm:true,evidence,
     usesBeforeSettlement:[{useId:randomUUID(),bookedOn:'2026-08-25',amount:'100',description:'Confirmed prior use of disbursement proceeds',evidence}]};
    const missing=JSON.parse(JSON.stringify(command));delete missing.refinances[0].proceedsAtSettlement;
    const blocked=await api('post',root+'/source-reforecasts/preview',missing);assert.equal(blocked.status,422);assert.equal(blocked.body.error.code,'REFINANCE_FUNDING_MISMATCH');check();
    const wrong=JSON.parse(JSON.stringify(command));wrong.refinances[0].proceedsAtSettlement.availableAmount='1000';
    const mismatch=await api('post',root+'/source-reforecasts/preview',wrong);assert.equal(mismatch.status,422);assert.equal(mismatch.body.error.code,'REFINANCE_FUNDING_MISMATCH');check();
   }
  }
  if(withPlanned){
   stage('planned-basis');command.sourceCommands=[];
   const loan='profile:debt:loan-a',sum=(p,id)=>p.candidate.calculation.attribution.filter(a=>a.sourceId===id).reduce((n,a)=>n+Number(a.amount),0);
   const bp=await ok('post',root+'/source-reforecasts/preview',command);
   let v=await ok('post',root+'/source-reforecasts',{preview:command,expectedInputHash:bp.inputHash,confirm:true},token,randomUUID(),201);check();
   const at=(throughMonth,extra={})=>({versionId:v.saved.id,expectedSnapshotHash:v.saved.snapshotHash,expectedRevision:v.revision,expectedProfileRevision:1,throughMonth,sourceCommands:[],pensionSelections:[],...extra});
   const save=async(input,preview)=>{const body={preview:input,expectedInputHash:preview.inputHash,confirm:true},key=randomUUID(),s=await ok('post',root+'/source-reforecasts',body,token,key,201);
    assert.deepEqual(await ok('post',root+'/source-reforecasts',body,token,key,201),s);assert.equal((await ok('post',root+'/versions/'+s.saved.id+'/replay',{})).replay.matched,true);return s;};
   stage('planned-create');const base=await ok('post',root+'/source-reforecasts/preview',at('2026-08')),eligible=base.plannedRefinanceOptions.eligibleLoans.find(o=>o.sourceId===loan);assert.ok(eligible);check();
   // Retain Sep/Oct instalments → 700 principal; quote 700+20 fee; new loan 700 gross, 10 withheld; household top-up 30 in Nov.
   const replacementCommandId=randomUUID(),newId='plan:'+randomUUID(),newPeriods=[];let from='2026-11-15';
   for(const dueDate of ['2026-12-31','2027-02-28','2027-04-30','2027-06-30']){newPeriods.push({accrualFrom:from,dueDate,rate:{kind:'SIMPLE_ANNUAL_DAILY',percent:'0',days:(Date.parse(dueDate)-Date.parse(from))/86400000,yearDays:365},fee:'0',carriedInterest:'0',gracePrincipal:false,bankPayment:null});from=dueDate;}
   const pair={commandId:randomUUID(),replacementCommandId,pairId:randomUUID(),operation:'CREATE',expectedPairHash:null,confirm:true,expectedContractHash:eligible.contractHash,
    oldSource:{sourceId:loan,revision:eligible.sourceRevision,sourceHash:eligible.sourceHash},newSource:{sourceId:newId,revision:0,sourceHash:null},
    terms:{settledOn:'2026-11-15',sameDayOrder:'BEFORE_SCHEDULED_PAYMENT',
     payoffQuote:{principal:'700',interest:'0',carriedInterest:'0',prepaymentFee:'20',otherFee:'0',allRemainingChargesIncluded:true,valueKind:'HYPOTHETICAL_QUOTE',evidence},
     funding:{scope:'FULL_CONTRACT',externalTopUp:'30',userTopUp:'30',userFinancedAmount:'690',unusedProceeds:'0',unusedProceedsNotContributed:true,evidence},
     replacement:{commandId:replacementCommandId,sourceId:newId,operation:'CREATE',expectedSourceRevision:0,confirm:true,agreementReference:'Rollback planned refinance',
      contract:{...command.loanRevisions[0].contract,confirmation:'HYPOTHETICAL',balanceNature:'PROJECTED_DISBURSEMENT',balanceAsOf:'2026-11-15',principalBalance:'700',maturityDate:'2027-06-30',periods:newPeriods},
      funding:{kind:'PLANNED_DISBURSEMENT',grossPrincipal:'700',withheldFees:'10',netDisbursement:'690',destination:'EXTERNAL_ACCOUNT',evidence}}}};
   const wrongPair=JSON.parse(JSON.stringify(pair));wrongPair.terms.funding.userTopUp='29';
   const bad=await api('post',root+'/source-reforecasts/preview',at('2026-08',{plannedRefinances:[wrongPair]}));assert.equal(bad.status,422);assert.equal(bad.body.error.code,'PLANNED_REFINANCE_FUNDING_MISMATCH');check();
   const createInput=at('2026-08',{plannedRefinances:[pair]}),created=await ok('post',root+'/source-reforecasts/preview',createInput);
   assert.equal(created.candidate.calculation.rows[0].openingBalance,'880');assert.ok(created.candidate.calculation.rows.every(r=>r.capitalInjection==='0'));
   assert.deepEqual(created.candidate.calculation.attribution.filter(a=>a.sourceId===loan).map(a=>[a.month,a.amount]),[['2026-09','100'],['2026-10','100'],['2026-11','30']]);
   const newCells=created.candidate.calculation.attribution.filter(a=>a.sourceId===newId);assert.ok(newCells.length>0&&newCells.every(a=>a.amount==='175'&&a.confirmation==='HYPOTHETICAL'));
   assert.ok(!created.loanRevisionOptions.some(o=>o.sourceId===loan));assert.equal(created.plannedRefinanceOptions.activePairs[0].reviseAllowed,true);check();
   assert.equal((await api('post',root+'/source-reforecasts/preview',createInput,other)).status,404);check();
   assert.equal((await api('post',root+'/source-reforecasts/preview',createInput,admin)).status,403);check();
   v=await save(createInput,created);check();
   const applied=await ok('post',root+'/apply',{versionId:v.saved.id,expectedRevision:v.revision,expectedProfileRevision:1,confirm:true});v={...v,revision:applied.revision};check();
   assert.equal((await ok('get',root+'/report')).hypothetical,true);
   const csv=await api('get',root+'/versions/'+v.saved.id+'/export.csv');assert.equal(csv.status,200);assert.ok(csv.text.includes(newId));check();
   assert.deepEqual(await ok('get','/me/financial-profile'),profileBefore);check();
   stage('planned-lock');const opened=await ok('post',root+'/source-reforecasts/preview',at('2026-08')),active=opened.plannedRefinanceOptions.activePairs[0];
   const lock=JSON.parse(JSON.stringify(command.loanRevisions[0]));Object.assign(lock,{commandId:randomUUID(),expectedSourceRevision:active.oldSource.revision,expectedSourceHash:active.oldSource.sourceHash,expectedContractHash:active.contractHash,allocations:[]});delete lock.legacyOpening;
   const locked=await api('post',root+'/source-reforecasts/preview',at('2026-08',{loanRevisions:[lock]}));assert.equal(locked.status,409);assert.equal(locked.body.error.code,'PLANNED_PAIR_SOURCE_LOCKED');check();
   stage('planned-revise');const rid=randomUUID(),revise={...JSON.parse(JSON.stringify(pair)),commandId:randomUUID(),replacementCommandId:rid,operation:'REVISE',expectedPairHash:active.pairHash,oldSource:active.oldSource,newSource:active.newSource};
   revise.terms.replacement.commandId=rid;revise.terms.payoffQuote.prepaymentFee='30';revise.terms.funding.externalTopUp=revise.terms.funding.userTopUp='40';
   const reviseInput=at('2026-08',{plannedRefinances:[revise]}),revised=await ok('post',root+'/source-reforecasts/preview',reviseInput);
   assert.equal(revised.candidate.calculation.attribution.find(a=>a.sourceId===loan&&a.month==='2026-11').amount,'40');check();
   v=await save(reviseInput,revised);check();
   stage('planned-cutoff-advance');
   const sep={currency:'VND',openingBalance:'880',closingBalance:'780',correctionReason:'Fixture September statement',entries:[{eventId:randomUUID(),date:'2026-09-28',kind:'DEBT_PAYMENT',amount:'100'},{eventId:randomUUID(),date:'2026-09-28',kind:'WITHDRAWAL',amount:'100'}]};
   await ok('put','/me/retirement/actuals/2026-09',{expectedRevision:0,data:sep});
   const kept=await ok('post',root+'/source-reforecasts/preview',at('2026-09')),still=kept.plannedRefinanceOptions.activePairs[0];
   assert.equal(still.reviseAllowed,false);assert.ok(kept.candidate.calculation.attribution.some(a=>a.sourceId===newId));check();
   const late={...JSON.parse(JSON.stringify(revise)),commandId:randomUUID(),replacementCommandId:randomUUID(),expectedPairHash:still.pairHash,oldSource:still.oldSource,newSource:still.newSource};late.terms.replacement.commandId=late.replacementCommandId;
   const blocked=await api('post',root+'/source-reforecasts/preview',at('2026-09',{plannedRefinances:[late]}));assert.equal(blocked.status,409);assert.equal(blocked.body.error.code,'PLANNED_PAIR_RECONCILIATION_REQUIRED');check();
   stage('planned-cancel');
   const cancel={commandId:randomUUID(),replacementCommandId:randomUUID(),pairId:pair.pairId,operation:'CANCEL',expectedPairHash:still.pairHash,oldSource:still.oldSource,newSource:still.newSource,expectedContractHash:still.contractHash,confirm:true,reason:'Rollback fixture cancellation'};
   const cancelInput=at('2026-09',{plannedRefinances:[cancel]}),cancelled=await ok('post',root+'/source-reforecasts/preview',cancelInput);
   assert.ok(!cancelled.candidate.calculation.attribution.some(a=>a.sourceId===newId));
   assert.ok(cancelled.candidate.calculation.attribution.filter(a=>a.sourceId===loan).every(a=>a.amount==='100'));
   assert.equal(cancelled.loanRevisionOptions.find(o=>o.sourceId===loan).contractHash,eligible.contractHash);assert.deepEqual(cancelled.plannedRefinanceOptions.activePairs,[]);check();
   const final=await save(cancelInput,cancelled);check();
   await ok('post',root+'/apply',{versionId:final.saved.id,expectedRevision:final.revision,expectedProfileRevision:1,confirm:true});check();
   assert.deepEqual(await ok('get','/me/financial-profile'),profileBefore);check();
   stage('planned-stale');await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:1,data:{...actual,correctionReason:'Corrected August statement'}});
   const stale=await api('post',root+'/apply',{versionId:v.saved.id,expectedRevision:final.revision+1,expectedProfileRevision:1,confirm:true});
   assert.equal(stale.status,409);assert.equal(stale.body.error.code,'ACTUAL_SOURCE_CHANGED');check();
   for(const s of [v,final]){assert.equal((await ok('post',root+'/versions/'+s.saved.id+'/replay',{})).replay.matched,true);check();}
   return;
  }
 }
 if(withAssets){
  const evidence=[{reference:'Rollback-only asset net proceeds',contentHash:'b'.repeat(64),confirmedOn:'2026-08-28'}];
  const capital={reference:'Rollback future asset',kind:'ASSET_SALE',currency:'VND',priceBasis:'NOMINAL_AT_AVAILABILITY',amountScope:'WHOLE_ASSET',ownershipShare:'0.5',retirementShare:'0.5',
   grossAmount:'1000',fees:'50',taxes:'50',securedDebtSettlement:'100',netAmount:'800',availableOn:'2026-09-30',confirmedContributionAmount:'200',
   funding:{status:'PLANNED',liquidity:'PLANNED_RELEASE',notIncludedInFund:true,contributionMonth:'2026-09',contributionTiming:'END_OF_MONTH'}};
  const planned={commandId:randomUUID(),sourceId:'plan:'+randomUUID(),operation:'CREATE',expectedSourceRevision:0,expectedSourceHash:null,confirm:true,evidence,notAlreadyInSources:true,capital};
  const realized={...planned,commandId:randomUUID(),sourceId:'plan:'+randomUUID(),capital:{...capital,reference:'Rollback realized asset',availableOn:'2026-08-28',funding:{status:'REALIZED',
   allocations:[{allocationId:randomUUID(),eventId:actual.entries[0].eventId,actualRevision:1,bookedOn:'2026-08-28',amount:'200'}]}}};
  command.assetCommands=[planned,realized];
 }
 if(withRental){
  const base=await ok('post',root+'/source-reforecasts/preview',{...command,sourceCommands:[]}),option=base.assetRevisionOptions.find(s=>s.sourceId==='profile:asset:rental');assert.ok(option);check();
  command.assetCommands=[{commandId:randomUUID(),sourceId:option.sourceId,operation:'REVISE',expectedSourceRevision:option.sourceRevision,expectedSourceHash:option.sourceHash,confirm:true,
   evidence:[{reference:'Rollback rental termination and sale',contentHash:'c'.repeat(64),confirmedOn:'2026-10-01'}],
   rentalExit:{rentEndsOn:'2026-09-15',finalMonthIncome:'7',amountScope:'SOURCE_SHARE',confirm:true},
   capital:{reference:'rental',kind:'ASSET_SALE',currency:'VND',priceBasis:'NOMINAL_AT_AVAILABILITY',amountScope:'WHOLE_ASSET',ownershipShare:'0.5',retirementShare:'0.5',
    grossAmount:'1000',fees:'50',taxes:'50',securedDebtSettlement:'100',netAmount:'800',availableOn:'2026-09-20',confirmedContributionAmount:'150',
    funding:{status:'PLANNED',liquidity:'AVAILABLE',notIncludedInFund:true,contributionMonth:'2026-10',contributionTiming:'END_OF_MONTH'}}}];
 }
 if(withStaged){
  command.assetCommands=[{commandId:randomUUID(),sourceId:'plan:'+randomUUID(),operation:'CREATE',expectedSourceRevision:0,expectedSourceHash:null,confirm:true,notAlreadyInSources:true,
   evidence:[{reference:'Rollback staged source',contentHash:'d'.repeat(64),confirmedOn:'2026-10-01'}],
   capital:{reference:'Staged rollback asset',kind:'ASSET_SALE',currency:'VND',priceBasis:'NOMINAL_AT_AVAILABILITY',amountScope:'WHOLE_ASSET',ownershipShare:'0.5',retirementShare:'0.5',
    grossAmount:'1000',fees:'50',taxes:'50',securedDebtSettlement:'100',netAmount:'800',availableOn:'2026-08-20',confirmedContributionAmount:'200',
    funding:{status:'STAGED',liquidity:'AVAILABLE',plannedNotIncludedInFund:true,
     allocations:[{allocationId:randomUUID(),eventId:actual.entries[0].eventId,actualRevision:1,bookedOn:'2026-08-28',amount:'60'}],
     plannedContributions:[{installmentId:randomUUID(),month:'2026-09',amount:'100',timing:'END_OF_MONTH'},{installmentId:randomUUID(),month:'2026-10',amount:'40',timing:'END_OF_MONTH'}],reconciliations:[]}}}];
 }
 if(withReleases){
  const funding=command.assetCommands[0].capital.funding;funding.liquidity='PLANNED_RELEASE';
  funding.availability={amountScope:'NET_SOURCE_SHARE',releases:[
   {releaseId:randomUUID(),availableOn:'2026-08-20',amount:'80',status:'CONFIRMED',evidence:command.assetCommands[0].evidence},
   {releaseId:randomUUID(),availableOn:'2026-09-30',amount:'80',status:'EXPECTED',evidence:command.assetCommands[0].evidence},
   {releaseId:randomUUID(),availableOn:'2026-10-20',amount:'40',status:'EXPECTED',evidence:command.assetCommands[0].evidence}]};
  const late=JSON.parse(JSON.stringify(command));late.assetCommands[0].capital.funding.availability.releases[1].availableOn='2026-10-01';
  const rejected=await api('post',root+'/source-reforecasts/preview',late);assert.equal(rejected.status,422);assert.equal(rejected.body.error.code,'ASSET_PLANNED_CONTRIBUTION_BEFORE_RELEASE');check();
 }
 stage('source-preview');const preview=await ok('post',root+'/source-reforecasts/preview',command);assert.equal(preview.candidate.modelVersion,'retirement-monthly-v4');check();
 if(withStaged){assert.deepEqual(preview.candidate.calculation.rows.slice(0,2).map(r=>r.capitalInjection),['100','40']);assert.deepEqual(preview.candidate.assetSources[0].evidence.priorRealized,[]);check();}
 if(withRental){
  assert.deepEqual(preview.candidate.calculation.attribution.filter(a=>a.sourceId==='profile:asset:rental').map(a=>[a.month,a.metric,a.amount]),[['2026-09','income','7'],['2026-10','capitalInjection','150']]);check();
 }
 assert.equal(preview.candidate.calculation.rows[0].openingBalance,actual.closingBalance);assert.equal(preview.candidate.calculation.rows[0].contribution,'100');check();
 if(withLoan){assert.equal(preview.candidate.loanSources.length,1);const payments=preview.candidate.calculation.attribution.filter(a=>a.sourceId==='profile:debt:loan-a');
  if(withAmend)assert.equal(payments.reduce((n,a)=>n+Number(a.amount),0),130);else assert.ok(payments.every(a=>a.amount==='100'));check();}
 if(withRefinance){assert.equal(preview.candidate.refinances[0].settlementAmount,'1020');assert.equal(preview.candidate.calculation.attribution.filter(a=>a.sourceId==='profile:debt:loan-a').length,0);
  const replacementCells=preview.candidate.calculation.attribution.filter(a=>a.sourceId===command.loanCreations[0].sourceId);assert.ok(replacementCells.length>0);
  if(withDisbursedAmended)assert.ok(replacementCells.reduce((n,a)=>n+Number(a.amount),0)<=400);else assert.ok(replacementCells.every(a=>a.amount==='100'));check();}
 if(withAssets){assert.equal(preview.candidate.assetSources.length,2);assert.equal(preview.candidate.calculation.rows[0].capitalInjection,'200');
  assert.ok(preview.candidate.calculation.rows.slice(1).every(r=>r.capitalInjection==='0'));assert.equal(preview.assetRevisionOptions.length,2);check();}
 if(withRepaid){
  assert.equal(preview.candidate.newLoanSources[0].evidence.command.funding.grossPrincipal,'1000');assert.equal(preview.candidate.newLoanSources[0].evidence.command.contract.principalBalance,withDisbursedAmended?'400':'900');
  assert.equal(preview.candidate.loanSources[0].evidence.consumed.length,1);assert.ok(preview.candidate.calculation.rows.every(r=>r.capitalInjection==='0'));check();
  const invalid=JSON.parse(JSON.stringify(command));invalid.loanCreations[0].funding.allocations[0].actualRevision=2;
  const rejected=await api('post',root+'/source-reforecasts/preview',invalid);assert.equal(rejected.status,409);assert.equal(rejected.body.error.code,'LOAN_ACTUAL_STALE_OR_MISSING');check();
 }
 stage('source-save');const body={preview:command,expectedInputHash:preview.inputHash,confirm:true},key=randomUUID();
 const saved=await ok('post',root+'/source-reforecasts',body,token,key,201);assert.equal(saved.currentVersionId,null);check();
 assert.deepEqual(await ok('post',root+'/source-reforecasts',body,token,key,201),saved);check();
 assert.equal((await ok('post',root+'/versions/'+saved.saved.id+'/replay',{})).replay.matched,true);check();
 assert.deepEqual(await ok('get',root+'/versions/'+original.saved.id),original.saved);check();
 assert.equal((await api('post',root+'/source-reforecasts/preview',command,other)).status,404);check();
 assert.equal((await api('post',root+'/source-reforecasts/preview',command,admin)).status,403);check();
 assert.equal((await api('post',root+'/source-reforecasts',body)).status,409);check();
 stage('source-revise');const revision={...command,versionId:saved.saved.id,expectedSnapshotHash:saved.saved.snapshotHash,expectedRevision:2,
  loanRevisions:[],loanCreations:[],refinances:[],assetCommands:[],
  sourceCommands:[{...command.sourceCommands[0],commandId:randomUUID(),operation:'REVISE',expectedSourceRevision:1,amount:'250'}]};
 const revised=await ok('post',root+'/source-reforecasts/preview',revision);assert.ok(revised.candidate.calculation.attribution.filter(r=>r.sourceId==='plan:rent').every(r=>r.amount==='250'));check();
 if(withAssets){
  const duplicate=JSON.parse(JSON.stringify(command.assetCommands[1]));duplicate.commandId=randomUUID();duplicate.sourceId='plan:'+randomUUID();duplicate.capital.reference='Another asset';duplicate.capital.funding.allocations[0].allocationId=randomUUID();
  const overflow=await api('post',root+'/source-reforecasts/preview',{...revision,sourceCommands:[],assetCommands:[duplicate]});assert.equal(overflow.status,409);assert.equal(overflow.body.error.code,'ASSET_EVENT_OVERALLOCATED');check();
  const option=preview.assetRevisionOptions[0],ended={commandId:randomUUID(),sourceId:option.sourceId,expectedSourceRevision:option.sourceRevision,expectedSourceHash:option.sourceHash,operation:'END',confirm:true,evidence:command.assetCommands[0].evidence,reason:'Cancel planned sale'};
  const cancelled=await ok('post',root+'/source-reforecasts/preview',{...revision,sourceCommands:[],assetCommands:[ended]});assert.ok(cancelled.candidate.calculation.rows.every(r=>r.capitalInjection==='0'));check();
 }
 await ok('post',root+'/apply',{versionId:saved.saved.id,expectedRevision:2,expectedProfileRevision:1,confirm:true});check();
 assert.equal((await ok('get',root+'/report')).hypothetical,true);check();
 const csv=await api('get',root+'/versions/'+saved.saved.id+'/export.csv');assert.equal(csv.status,200);assert.ok(csv.text.includes('sourceAttributionJson'));check();
 assert.deepEqual(await ok('get','/me/financial-profile'),profileBefore);check();
 if(withMissed){
  stage('missed-contribution');
  const september={currency:'VND',openingBalance:'1300',closingBalance:'1300',entries:[],correctionReason:'Planned contribution not received'};
  await ok('put','/me/retirement/actuals/2026-09',{expectedRevision:0,data:september});
  const planned=command.assetCommands[0],option=preview.assetRevisionOptions[0],capital=JSON.parse(JSON.stringify(planned.capital));
  capital.funding.contributionMonth='2026-10';
  const revisedAsset={commandId:randomUUID(),sourceId:option.sourceId,operation:'REVISE',expectedSourceRevision:option.sourceRevision,expectedSourceHash:option.sourceHash,
   confirm:true,evidence:[{...planned.evidence[0],confirmedOn:'2026-10-01'}],capital,
   missedContribution:{scheduledMonth:'2026-09',actualRevision:1,amountNotContributed:'200',confirmedOn:'2026-10-01',reason:'Sale postponed',confirmNotContributed:true}};
  const delayed={...revision,expectedRevision:3,throughMonth:'2026-09',sourceCommands:[],assetCommands:[revisedAsset]};
  const staleCommand=JSON.parse(JSON.stringify(delayed));staleCommand.assetCommands[0].missedContribution.actualRevision=2;
  const reject=await api('post',root+'/source-reforecasts/preview',staleCommand);assert.equal(reject.status,409);assert.equal(reject.body.error.code,'ASSET_ACTUAL_STALE_OR_MISSING');check();
  const result=await ok('post',root+'/source-reforecasts/preview',delayed);
  assert.equal(result.candidate.calculation.rows[0].openingBalance,'1300');assert.equal(result.candidate.calculation.rows[0].capitalInjection,'200');check();
  const delayedBody={preview:delayed,expectedInputHash:result.inputHash,confirm:true},delayedKey=randomUUID();
  const delayedSaved=await ok('post',root+'/source-reforecasts',delayedBody,token,delayedKey,201);
  assert.deepEqual(await ok('post',root+'/source-reforecasts',delayedBody,token,delayedKey,201),delayedSaved);check();
  assert.equal((await ok('post',root+'/versions/'+delayedSaved.saved.id+'/replay',{})).replay.matched,true);check();
  await ok('post',root+'/apply',{versionId:delayedSaved.saved.id,expectedRevision:4,expectedProfileRevision:1,confirm:true});check();
  assert.deepEqual(await ok('get','/me/financial-profile'),profileBefore);check();
  await ok('put','/me/retirement/actuals/2026-09',{expectedRevision:1,data:{...september,correctionReason:'Corrected missed contribution statement'}});
  const staleDelayed=await api('post',root+'/apply',{versionId:delayedSaved.saved.id,expectedRevision:5,expectedProfileRevision:1,confirm:true});
  assert.equal(staleDelayed.status,409);assert.equal(staleDelayed.body.error.code,'ACTUAL_SOURCE_CHANGED');check();
  assert.equal((await ok('post',root+'/versions/'+delayedSaved.saved.id+'/replay',{})).replay.matched,true);check();
 }
 if(withRental){
  stage('realized-rental-sale');
  const eventId=randomUUID(),september={currency:'VND',openingBalance:'1000',closingBalance:'1150',correctionReason:'Sale contribution received',entries:[{eventId,date:'2026-09-28',kind:'CONTRIBUTION',amount:'150'}]};
  await ok('put','/me/retirement/actuals/2026-09',{expectedRevision:0,data:september});
  const sale=JSON.parse(JSON.stringify(command.assetCommands[0])),option=preview.assetRevisionOptions[0];sale.commandId=randomUUID();sale.expectedSourceRevision=option.sourceRevision;sale.expectedSourceHash=option.sourceHash;
  sale.capital.funding={status:'REALIZED',allocations:[{allocationId:randomUUID(),eventId,actualRevision:1,bookedOn:'2026-09-28',amount:'150'}]};
  const next={...revision,expectedRevision:3,throughMonth:'2026-09',sourceCommands:[],assetCommands:[sale]};
  const changed=JSON.parse(JSON.stringify(next));changed.assetCommands[0].rentalExit.finalMonthIncome='8';
  const rejected=await api('post',root+'/source-reforecasts/preview',changed);assert.equal(rejected.status,422);assert.equal(rejected.body.error.code,'ASSET_RENTAL_HISTORY_IMMUTABLE');check();
  const realized=await ok('post',root+'/source-reforecasts/preview',next);assert.equal(realized.candidate.calculation.rows[0].openingBalance,'1150');
  assert.ok(realized.candidate.calculation.rows.every(r=>r.capitalInjection==='0'));assert.ok(!realized.candidate.calculation.attribution.some(a=>a.sourceId===sale.sourceId));check();
  const realizedBody={preview:next,expectedInputHash:realized.inputHash,confirm:true},realizedKey=randomUUID(),realizedSaved=await ok('post',root+'/source-reforecasts',realizedBody,token,realizedKey,201);
  assert.deepEqual(await ok('post',root+'/source-reforecasts',realizedBody,token,realizedKey,201),realizedSaved);check();
  assert.equal((await ok('post',root+'/versions/'+realizedSaved.saved.id+'/replay',{})).replay.matched,true);check();
  await ok('post',root+'/apply',{versionId:realizedSaved.saved.id,expectedRevision:4,expectedProfileRevision:1,confirm:true});check();
  assert.deepEqual(await ok('get','/me/financial-profile'),profileBefore);check();
  await ok('put','/me/retirement/actuals/2026-09',{expectedRevision:1,data:{...september,correctionReason:'Corrected sale reference'}});
  const staleSale=await api('post',root+'/apply',{versionId:realizedSaved.saved.id,expectedRevision:5,expectedProfileRevision:1,confirm:true});assert.equal(staleSale.status,409);assert.equal(staleSale.body.error.code,'ACTUAL_SOURCE_CHANGED');check();
  assert.equal((await ok('post',root+'/versions/'+realizedSaved.saved.id+'/replay',{})).replay.matched,true);check();
 }
 if(withStaged){
  stage('staged-partial-contribution');
  const bookedOn=withReleases?'2026-09-30':'2026-09-28';
  const eventId=randomUUID(),september={currency:'VND',openingBalance:'1060',closingBalance:'1090',correctionReason:'Partial next installment',entries:[{eventId,date:bookedOn,kind:'CONTRIBUTION',amount:'30'}]};
  await ok('put','/me/retirement/actuals/2026-09',{expectedRevision:0,data:september});
  const capital=JSON.parse(JSON.stringify(command.assetCommands[0].capital)),allocationId=randomUUID(),option=preview.assetRevisionOptions[0];
  capital.funding.allocations=[{allocationId,eventId,actualRevision:1,bookedOn,amount:'30'}];
  capital.funding.plannedContributions=[{installmentId:randomUUID(),month:'2026-10',amount:'110',timing:'END_OF_MONTH'}];
  capital.funding.reconciliations=[{scheduledMonth:'2026-09',actualRevision:1,receivedAllocationIds:[allocationId],amountNotContributed:'70',confirmedOn:'2026-10-01',reason:'Remaining amount postponed',confirm:true}];
  const next={...revision,expectedRevision:3,throughMonth:'2026-09',sourceCommands:[],assetCommands:[{commandId:randomUUID(),sourceId:option.sourceId,operation:'REVISE',expectedSourceRevision:option.sourceRevision,
   expectedSourceHash:option.sourceHash,confirm:true,evidence:command.assetCommands[0].evidence,capital}]};
  if(withReleases){
   const notReceived=await api('post',root+'/source-reforecasts/preview',next);assert.equal(notReceived.status,422);assert.equal(notReceived.body.error.code,'ASSET_RECEIPT_BEFORE_RELEASE');check();
   capital.funding.availability.releases[1].status='CONFIRMED';
   const altered=JSON.parse(JSON.stringify(next));altered.assetCommands[0].capital.funding.availability.releases[0].amount='79';
   const immutable=await api('post',root+'/source-reforecasts/preview',altered);assert.equal(immutable.status,422);assert.equal(immutable.body.error.code,'ASSET_CONFIRMED_RELEASE_IMMUTABLE');check();
  }
  const wrong=JSON.parse(JSON.stringify(next));wrong.assetCommands[0].capital.confirmedContributionAmount='140';
  const rejected=await api('post',root+'/source-reforecasts/preview',wrong);assert.equal(rejected.status,422);assert.equal(rejected.body.error.code,'ASSET_INSTALLMENT_TOTAL_MISMATCH');check();
  const partial=await ok('post',root+'/source-reforecasts/preview',next);assert.equal(partial.candidate.calculation.rows[0].openingBalance,'1090');assert.equal(partial.candidate.calculation.rows[0].capitalInjection,'110');
  assert.equal(partial.candidate.assetSources.at(-1).evidence.priorRealized.length,1);check();
  const partialBody={preview:next,expectedInputHash:partial.inputHash,confirm:true},partialKey=randomUUID(),partialSaved=await ok('post',root+'/source-reforecasts',partialBody,token,partialKey,201);
  assert.deepEqual(await ok('post',root+'/source-reforecasts',partialBody,token,partialKey,201),partialSaved);check();
  assert.equal((await ok('post',root+'/versions/'+partialSaved.saved.id+'/replay',{})).replay.matched,true);check();
  await ok('post',root+'/apply',{versionId:partialSaved.saved.id,expectedRevision:4,expectedProfileRevision:1,confirm:true});check();
  assert.deepEqual(await ok('get','/me/financial-profile'),profileBefore);check();
  await ok('put','/me/retirement/actuals/2026-09',{expectedRevision:1,data:{...september,correctionReason:'Corrected staged statement'}});
  const stalePartial=await api('post',root+'/apply',{versionId:partialSaved.saved.id,expectedRevision:5,expectedProfileRevision:1,confirm:true});assert.equal(stalePartial.status,409);assert.equal(stalePartial.body.error.code,'ACTUAL_SOURCE_CHANGED');check();
  assert.equal((await ok('post',root+'/versions/'+partialSaved.saved.id+'/replay',{})).replay.matched,true);check();
 }
 stage('changed-actual');await ok('put','/me/retirement/actuals/2026-08',{expectedRevision:1,data:{...actual,correctionReason:'Corrected reference'}});
 const stale=await api('post',root+'/apply',{versionId:saved.saved.id,expectedRevision:withMissed||withRental||withStaged?5:3,expectedProfileRevision:1,confirm:true});assert.equal(stale.status,409);assert.equal(stale.body.error.code,'ACTUAL_SOURCE_CHANGED');check();
 assert.equal((await ok('post',root+'/versions/'+saved.saved.id+'/replay',{})).replay.matched,true);check();
});
