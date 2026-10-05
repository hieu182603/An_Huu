require('ts-node/register');
const fs=require('node:fs'),{stringify,parseDocument}=require('yaml'),{schema}=require('./generate-assumptions-openapi.cjs');
const input=require('../src/modules/pensions/insurance-schema');
const str={type:'string'},uuid={type:'string',format:'uuid'},integer={type:'integer'},bool={type:'boolean'},hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const obj=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties}),arr=items=>({type:'array',items}),ref=n=>({$ref:'#/'+n});
const nullable=v=>({anyOf:[v,{type:'object',nullable:true,enum:[null]}]});
const s={HistoryDocument:schema(input.insuranceHistorySchema),HistoryPreviewInput:schema(input.historyPreviewSchema),HistorySaveInput:schema(input.historySaveSchema),
 RuleDraft:schema(input.legalRuleDraftSchema),RulePatch:schema(input.legalRulePatchSchema),RuleTransition:schema(input.legalRuleTransitionSchema),
 EstimateInput:schema(input.pensionEstimateInputSchema),EstimateSaveInput:schema(input.pensionEstimateSaveSchema)};
s.Issue=obj({path:str,code:str});
s.HistoryPreview=obj({status:{type:'string',enum:['READY','INCOMPLETE','INVALID']},inputHash:hash,issues:arr(ref('Issue')),normalized:ref('HistoryDocument')});
s.History=obj({id:uuid,revision:integer,parentVersionId:{...uuid,nullable:true},parentHash:{...hash,nullable:true},documentHash:hash,recordedAt:{type:'string',format:'date-time'},document:ref('HistoryDocument')});
s.Validation=obj({valid:bool,documentHash:hash,engineCode:str,issues:arr(ref('Issue')),validationHash:hash,coverage:arr(obj({branch:str,supported:bool,fixtureSuiteHash:{...hash,nullable:true},
 cases:arr(obj({id:str,passed:bool,expectedHash:hash,actualHash:hash}))}))});
s.Review=obj({actor:str,reviewedAt:{type:'string',format:'date-time'},reviewNote:str,validationHash:hash,draftHash:hash,reviewHash:hash});
s.Rule=obj({id:uuid,revision:integer,version:integer,status:{type:'string',enum:['DRAFT','VALIDATED','REVIEWED','PUBLISHED']},documentHash:hash,
 knowledgeAsOf:{type:'string',format:'date-time'},publishedAt:{type:'string',format:'date-time',nullable:true},draft:ref('RuleDraft'),validation:nullable(ref('Validation')),review:nullable(ref('Review'))});
s.RuleList=obj({items:arr(ref('Rule'))});
const ruleDocument=schema(input.legalRuleDocumentSchema);
s.BenefitAssessment=obj({assessmentStatus:{type:'string',enum:['ELIGIBLE','NOT_YET_ELIGIBLE','INSUFFICIENT_DATA','REVIEW_REQUIRED']},
 estimateKind:{type:'string',enum:['CURRENT_RULE_ESTIMATE','PROJECTED_SCENARIO']},inputHash:hash,historyHash:hash,ruleHash:hash,
 countedMonths:{...integer,nullable:true},monthlyPension:{...str,nullable:true},startMonth:{...str,nullable:true},lumpSum:{...str,nullable:true},
 missingFields:arr(ref('Issue')),breakdown:arr(obj({code:str,value:{...str,nullable:true},unit:{type:'string',enum:['VND','MONTHS','YEARS','PERCENT','DATE','CODE']},citationIds:arr(str)})),
 citations:ruleDocument.properties.citations});
s.EstimatePreview=obj({inputHash:hash,engineCode:str,assessedOn:{type:'string',format:'date'},historyVersionId:uuid,historyRevision:integer,legalRuleSetVersionId:uuid,legalRuleVersion:integer,assessment:ref('BenefitAssessment')});
s.Estimate=obj({id:uuid,createdAt:{type:'string',format:'date-time'},integrityHash:hash,...s.EstimatePreview.properties});
s.EstimateList=obj({items:arr(ref('Estimate'))});
s.PublishedRuleList=obj({items:arr(obj({id:uuid,code:str,version:integer,effectiveFrom:{type:'string',format:'date'},effectiveTo:{type:'string',format:'date',nullable:true},
 documentHash:hash,knowledgeAsOf:{type:'string',format:'date-time'},coverage:ruleDocument.properties.coverage,citations:ruleDocument.properties.citations}))});
for(const n of ['HistoryPreview','History','Rule','RuleList','EstimatePreview','Estimate','EstimateList','PublishedRuleList'])s[n+'Envelope']=obj({data:ref(n),meta:obj({requestId:uuid})});
s.LatestHistoryEnvelope=obj({data:nullable(ref('History')),meta:obj({requestId:uuid})});
fs.writeFileSync('docs/insurance.openapi.yaml',stringify(s));
const doc=parseDocument(fs.readFileSync('docs/openapi.yaml','utf8'));
const routes=[['/me/pension/history','get','LatestHistory'],['/me/pension/history','post','History','HistorySaveInput'],
 ['/me/pension/history/import-preview','post','HistoryPreview','HistoryPreviewInput'],['/me/pension/history/{id}','get','History'],
 ['/admin/legal-rules','get','RuleList'],['/admin/legal-rules','post','Rule','RuleDraft'],['/admin/legal-rules/{id}','get','Rule'],
 ['/admin/legal-rules/{id}','patch','Rule','RulePatch'],['/admin/legal-rules/{id}/transitions','post','Rule','RuleTransition'],
 ['/me/pension/legal-rules','get','PublishedRuleList'],['/me/pension/estimates','get','EstimateList'],['/me/pension/estimates/{id}','get','Estimate'],
 ['/me/pension/estimates/preview','post','EstimatePreview','EstimateInput'],['/me/pension/estimates','post','Estimate','EstimateSaveInput']];
for(const [path,method,output,body] of routes){const parameters=[];
 if(path.includes('{id}'))parameters.push({name:'id',in:'path',required:true,schema:uuid});
 if(path==='/me/pension/legal-rules')parameters.push({name:'benefitDate',in:'query',required:true,schema:{type:'string',format:'date'}});
 if(body&&!path.endsWith('preview'))parameters.push({name:'Idempotency-Key',in:'header',required:true,schema:uuid});
 const code=method==='post'&&!path.endsWith('preview')&&!path.endsWith('transitions')?'201':'200';
 const operation={tags:['Pension insurance'],summary:path.startsWith('/admin')?'ADMIN — manage versioned legal rules':'USER — contribution history and versioned pension estimates',security:[{bearerAuth:[]}],
  ...(parameters.length?{parameters}:{}),...(body?{requestBody:{required:true,content:{'application/json':{schema:{$ref:'./insurance.openapi.yaml#/'+body}}}}}:{}),
  responses:{[code]:{description:'Success',content:{'application/json':{schema:{$ref:'./insurance.openapi.yaml#/'+output+'Envelope'}}}},
   default:{description:'400 invalid; 401/403 authorization; 404 unknown owner/resource; 409 stale/hash/idempotency; 422 invalid workflow',content:{'application/json':{schema:{$ref:'#/components/schemas/ErrorEnvelope'}}}}}};
 doc.setIn(['paths','/api/v1'+path,method],operation);
}
fs.writeFileSync('docs/openapi.yaml',String(doc));
