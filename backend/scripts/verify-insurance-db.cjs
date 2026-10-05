const run=require('./rollback-fixture.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {digest}=require('../src/common/digest');
run('INSURANCE',async({tx,db,s,api,owner,other,admin,tokens,check,stage})=>{
 if(process.argv.includes('--rehearse-migration')){
  stage('transactional-ddl');
  const exists=await tx.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('legal_rule_set_versions','social_insurance_history_versions','pension_estimates')`;
  assert.equal(exists.length,0);
  for(const statement of fs.readFileSync('prisma/migrations/202610050011_pension_rules_history/migration.sql','utf8').split('-- statement-break').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
 }
 stage('history-http');
 const evidence={reference:'Synthetic rollback fixture',contentHash:digest('fixture'),confirmedOn:'2026-10-01'};
 const document={schemaVersion:1,birth:{precision:'MONTH',declaredValue:'1965-01'},legalSex:'MALE',coverageFrom:'2026-01',coverageThrough:'2026-03',confirmedThroughMonth:'2026-03',specialPeriods:[],
  months:['2026-01','2026-03'].map(month=>({month,scheme:'COMPULSORY',salaryRegime:'EMPLOYER',status:'PAID',contributionBase:'10000000',evidence:[evidence]}))};
 const preview={expectedHistoryRevision:0,document};
 assert.equal((await api('get','/me/pension/history')).body.data,null);check();
 const p=await api('post','/me/pension/history/import-preview',preview);assert.equal(p.status,200);assert.equal(p.body.data.status,'INCOMPLETE');assert.equal(p.body.data.normalized.months[1].status,'UNKNOWN');check();
 const command={preview,expectedInputHash:p.body.data.inputHash,confirm:true},key=randomUUID();
 const saved=await api('post','/me/pension/history',command,tokens[0],key);assert.equal(saved.status,201);const first=saved.body.data;check();
 assert.deepEqual((await api('post','/me/pension/history',command,tokens[0],key)).body.data,first);assert.equal(await tx.socialInsuranceHistoryVersion.count({where:{userId:owner}}),1);check();
 assert.equal((await api('post','/me/pension/history',command)).status,409);check();
 assert.equal((await api('get','/me/pension/history/'+first.id,undefined,tokens[1])).status,404);check();
 assert.equal((await api('get','/me/pension/history',undefined,tokens[2])).status,403);check();
 assert.equal((await api('post','/me/pension/history/import-preview',{...preview,userId:other})).status,400);check();
 preview.expectedHistoryRevision=1;preview.document.months.push({...preview.document.months[0],month:'2026-02'});
 const p2=(await api('post','/me/pension/history/import-preview',preview)).body.data;
 const second=(await api('post','/me/pension/history',{preview,expectedInputHash:p2.inputHash,confirm:true})).body.data;
 assert.equal(second.revision,2);assert.equal(second.parentVersionId,first.id);assert.equal(second.parentHash,first.documentHash);check();
 assert.deepEqual((await api('get','/me/pension/history/'+first.id)).body.data,first);check();
 const mustReject=async work=>{let rejected=false;try{await db.$transaction(work);}catch{rejected=true;}assert.ok(rejected);check();};
 await mustReject(t=>t.socialInsuranceHistoryVersion.update({where:{id:first.id},data:{documentHash:digest('tamper')}}));
 await mustReject(t=>t.socialInsuranceHistoryVersion.create({data:{userId:other,revision:2,parentVersionId:first.id,parentHash:first.documentHash,document,documentHash:digest(document)}}));
 await mustReject(t=>t.socialInsuranceHistoryVersion.create({data:{userId:owner,revision:2,parentVersionId:first.id,parentHash:first.documentHash,document,documentHash:digest(document)}}));
 stage('rules-http');
 const ruleDraft={code:'FIXTURE_'+randomUUID().replaceAll('-','').toUpperCase(),effectiveFrom:'2026-01-01',effectiveTo:null,document:{schemaVersion:1,engineCode:'NOT_IMPLEMENTED_FIXTURE',
  coverage:[{branch:'TEST_ONLY',strategyCode:'TEST_ONLY',citationIds:['fixture'],requiredTableKeys:[]}],tables:[],
  citations:[{id:'fixture',instrument:'Fixture only',locator:'Fixture',url:'https://example.org/fixture',contentHash:digest('fixture'),effectiveFrom:'2026-01-01',effectiveTo:null}]}};
 assert.equal((await api('post','/admin/legal-rules',ruleDraft)).status,403);check();
 const created=await api('post','/admin/legal-rules',ruleDraft,tokens[2]);assert.equal(created.status,201);const rule=created.body.data;check();
 const validated=await api('post','/admin/legal-rules/'+rule.id+'/transitions',{action:'VALIDATE',expectedRevision:1,expectedDocumentHash:rule.documentHash,confirm:true},tokens[2]);
 assert.equal(validated.status,200);assert.equal(validated.body.data.status,'DRAFT');assert.equal(validated.body.data.validation.valid,false);check();
 assert.equal((await api('post','/admin/legal-rules/'+rule.id+'/transitions',{action:'REVIEW',expectedRevision:2,expectedDocumentHash:rule.documentHash,
  validationHash:validated.body.data.validation.validationHash,reviewNote:'Cannot approve missing engine',confirm:true},tokens[2])).status,422);check();
 stage('estimates-http');
 const {validatedBenefitFixture}=require('../src/tests/benefit-fixtures'),benefit=validatedBenefitFixture();
 const hp={expectedHistoryRevision:2,document:benefit.history},hpResult=(await api('post','/me/pension/history/import-preview',hp)).body.data;
 const benefitHistory=(await api('post','/me/pension/history',{preview:hp,expectedInputHash:hpResult.inputHash,confirm:true})).body.data;
 const reviewer=randomUUID();await tx.user.create({data:{id:reviewer,email:reviewer+'@example.invalid',passwordHash:'synthetic-not-login',fullName:'Synthetic reviewer',role:'ADMIN',status:'ACTIVE'}});
 let br=await s.legalRules.create(admin,{code:'BENEFIT_'+randomUUID().replaceAll('-','').toUpperCase(),effectiveFrom:'2026-01-01',effectiveTo:'2027-01-01',supersedesId:null,document:benefit.rules},randomUUID());
 br=await s.legalRules.transition(admin,br.id,{action:'VALIDATE',expectedRevision:br.revision,expectedDocumentHash:br.documentHash,confirm:true},randomUUID());assert.equal(br.status,'VALIDATED');check();
 const validationHash=br.validation.validationHash;
 br=await s.legalRules.transition(reviewer,br.id,{action:'REVIEW',expectedRevision:br.revision,expectedDocumentHash:br.documentHash,validationHash,reviewNote:'Synthetic rollback fixture only',confirm:true},randomUUID());
 br=await s.legalRules.transition(admin,br.id,{action:'PUBLISH',expectedRevision:br.revision,expectedDocumentHash:br.documentHash,validationHash,reviewHash:br.review.reviewHash,confirm:true},randomUUID());assert.equal(br.status,'PUBLISHED');check();
 const bi={...benefit.input,historyVersionId:benefitHistory.id,expectedHistoryRevision:3,legalRuleSetVersionId:br.id};
 const bp=await api('post','/me/pension/estimates/preview',bi);assert.equal(bp.status,200);assert.equal(bp.body.data.assessment.assessmentStatus,'ELIGIBLE');check();
 const ec={preview:bi,expectedInputHash:bp.body.data.inputHash},ek=randomUUID();
 const es=await api('post','/me/pension/estimates',ec,tokens[0],ek);assert.equal(es.status,201);check();
 assert.deepEqual((await api('post','/me/pension/estimates',ec,tokens[0],ek)).body.data,es.body.data);check();
 assert.deepEqual((await api('get','/me/pension/estimates/'+es.body.data.id)).body.data,es.body.data);check();
 assert.equal((await api('get','/me/pension/estimates/'+es.body.data.id,undefined,tokens[1])).status,404);check();
 assert.equal((await api('post','/me/pension/estimates/preview',bi,tokens[1])).status,404);check();
 assert.equal((await api('post','/me/pension/estimates',{...ec,preview:{...bi,employmentEndDate:'2026-06-29'}})).status,409);check();
 assert.ok((await api('get','/me/pension/legal-rules?benefitDate=2026-07-01')).body.data.items.some(r=>r.id===br.id));check();
 await mustReject(t=>t.pensionEstimate.update({where:{id:es.body.data.id},data:{inputHash:digest('tamper')}}));
 const {BENEFIT_ENGINE_V2,ORDINARY_STRATEGY_V2,ORDINARY_CITATIONS_V2}=require('../src/modules/pensions/benefit-assessment-v2');
 const nextDocument=structuredClone(benefit.rules);nextDocument.engineCode=BENEFIT_ENGINE_V2;nextDocument.coverage[0].strategyCode=ORDINARY_STRATEGY_V2;
 nextDocument.coverage[0].citationIds=ORDINARY_CITATIONS_V2;nextDocument.citations.push(...['LAW_ART68','TT12_ART14'].map(id=>({...nextDocument.citations[0],id})));
 let nr=await s.legalRules.create(admin,{...br.draft,supersedesId:br.id,document:nextDocument},randomUUID());
 nr=await s.legalRules.transition(admin,nr.id,{action:'VALIDATE',expectedRevision:nr.revision,expectedDocumentHash:nr.documentHash,confirm:true},randomUUID());assert.equal(nr.status,'VALIDATED');
 const nextValidationHash=nr.validation.validationHash;
 nr=await s.legalRules.transition(reviewer,nr.id,{action:'REVIEW',expectedRevision:nr.revision,expectedDocumentHash:nr.documentHash,validationHash:nextValidationHash,reviewNote:'Synthetic V2 rollback only',confirm:true},randomUUID());
 nr=await s.legalRules.transition(admin,nr.id,{action:'PUBLISH',expectedRevision:nr.revision,expectedDocumentHash:nr.documentHash,validationHash:nextValidationHash,reviewHash:nr.review.reviewHash,confirm:true},randomUUID());check();
 const ni={...bi,legalRuleSetVersionId:nr.id},np=(await api('post','/me/pension/estimates/preview',ni)).body.data;
 assert.equal(np.engineCode,BENEFIT_ENGINE_V2);assert.equal(np.assessment.lumpSum,'0');check();
 const ns=await api('post','/me/pension/estimates',{preview:ni,expectedInputHash:np.inputHash});assert.equal(ns.status,201);check();
 assert.deepEqual((await api('get','/me/pension/estimates/'+ns.body.data.id)).body.data,ns.body.data);check();
 assert.deepEqual((await api('get','/me/pension/estimates/'+es.body.data.id)).body.data,es.body.data);check();
 // Trigger/FK checks use synthetic rows directly, never publish via a bypass API.
 const published=await tx.legalRuleSetVersion.create({data:{code:ruleDraft.code,version:2,revision:4,status:'PUBLISHED',effectiveFrom:new Date('2026-01-01'),document:ruleDraft.document,
  documentHash:digest(ruleDraft.document),createdBy:admin,authorIds:[admin],reviewedBy:other,publishedBy:admin,publishedAt:new Date(),validation:{fixture:true},review:{fixture:true}}});
 await mustReject(t=>t.legalRuleSetVersion.update({where:{id:published.id},data:{documentHash:digest('tamper')}}));
 await mustReject(t=>t.legalRuleSetVersion.delete({where:{id:published.id}}));
 const estimate=await tx.pensionEstimate.create({data:{userId:owner,historyVersionId:first.id,legalRuleSetVersionId:published.id,engineCode:'fixture',inputHash:digest('input'),inputSnapshot:{fixture:true},result:{fixture:true},integrityHash:digest('snapshot')}});
 await mustReject(t=>t.pensionEstimate.update({where:{id:estimate.id},data:{result:{changed:true}}}));
 await mustReject(t=>t.pensionEstimate.create({data:{userId:other,historyVersionId:first.id,legalRuleSetVersionId:published.id,engineCode:'fixture',inputHash:digest('input'),inputSnapshot:{},result:{},integrityHash:digest('snapshot')}}));
 stage('account-cascade');const cascadeId=randomUUID();
 await tx.user.create({data:{id:cascadeId,email:'cascade-'+cascadeId+'@example.invalid',passwordHash:'fixture-not-login',fullName:'Synthetic cascade',status:'SUSPENDED'}});
 const h1=await tx.socialInsuranceHistoryVersion.create({data:{userId:cascadeId,revision:1,document,documentHash:digest(document)}});
 const h2=await tx.socialInsuranceHistoryVersion.create({data:{userId:cascadeId,revision:2,parentVersionId:h1.id,parentHash:h1.documentHash,document,documentHash:digest(document)}});
 await tx.pensionEstimate.create({data:{userId:cascadeId,historyVersionId:h2.id,legalRuleSetVersionId:published.id,engineCode:'fixture',inputHash:digest('input'),inputSnapshot:{},result:{},integrityHash:digest('snapshot')}});
 await tx.user.delete({where:{id:cascadeId}});assert.equal(await tx.socialInsuranceHistoryVersion.count({where:{userId:cascadeId}}),0);assert.equal(await tx.pensionEstimate.count({where:{userId:cascadeId}}),0);check();
 assert.equal(await tx.financialProfile.count({where:{userId:owner}}),0);check();
});
