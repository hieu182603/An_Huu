// Additive contracts only. No environment, database or provider access.
require('ts-node/register');
const fs=require('node:fs'), {parse,parseDocument,stringify}=require('yaml');
const {schema}=require('./generate-assumptions-openapi.cjs');
const {depositInput,bondInput}=require('../src/modules/catalog/tools');
const {consultInput}=require('../src/modules/community/service');
const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)}), str={type:'string'}, money={type:'string',pattern:'^-?[0-9]+(\\.[0-9]+)?$'}, date={type:'string',format:'date'}, integer={type:'integer'}, nullable=s=>({anyOf:[s,{type:'object',nullable:true,enum:[null]}]}), array=items=>({type:'array',items});
const secondaryFile='docs/secondary.openapi.yaml',secondaryDoc=parseDocument(fs.readFileSync(secondaryFile,'utf8'));
secondaryDoc.setIn(['Product','properties','imageUrl'],{type:'string',nullable:true,maxLength:2000});fs.writeFileSync(secondaryFile,String(secondaryDoc));
const secondary=parse(fs.readFileSync(secondaryFile,'utf8')), savedProduct=structuredClone(secondary.Product);
savedProduct.properties.partner={$ref:'./secondary.openapi.yaml#/Partner'};savedProduct.properties.savedAt={type:'string',format:'date-time'};savedProduct.required.push('savedAt');
const common={informationalOnly:{type:'boolean',enum:[true]},currency:{type:'string',enum:['VND']}};
const schemas={
  ProductFacet:object({category:str,riskLevel:{type:'string',enum:['LOW','MEDIUM','HIGH']},_count:object({_all:integer})}),
  ContentFacet:object({category:str,_count:object({_all:integer})}),
  SavedProduct:savedProduct,ProductConsultInput:schema(consultInput),
  DepositInput:schema(depositInput),BondInput:schema(bondInput),
  DepositResult:object({...common,assumptions:schema(depositInput),maturityDate:date,interest:money,monthlyPayout:money,maturityPayment:money,totalReceived:money,early:nullable(object({date,interest:money,alreadyPaid:money,settlementPayment:money,totalReceived:money}))}),
  BondResult:object({...common,assumptions:schema(bondInput),cost:money,faceValueTotal:money,totalCoupons:money,totalReceived:money,gain:money,currentYieldPercent:money,nominalYtmPercent:nullable(money),schedule:array(object({month:integer,date,coupon:money,principal:money,total:money})),sale:nullable(object({date,collectedCoupons:money,proceeds:money,gain:money}))}),
  SavedResult:object({saved:{type:'boolean'}}),CancelledResult:object({cancelled:{type:'boolean'}}),
  ConsultTicket:object({id:{type:'string',format:'uuid'},userId:{type:'string'},subject:str,category:str,status:{type:'string',enum:['OPEN','IN_PROGRESS','RESOLVED','CLOSED']},revision:integer,createdAt:{type:'string',format:'date-time'},updatedAt:{type:'string',format:'date-time'}}),
};
for(const [name,body]of Object.entries({ProductFacets:array({$ref:'#/ProductFacet'}),ContentFacets:array({$ref:'#/ContentFacet'}),SavedProducts:array({$ref:'#/SavedProduct'}),Deposit:{$ref:'#/DepositResult'},Bond:{$ref:'#/BondResult'},Saved:{$ref:'#/SavedResult'},Cancelled:{$ref:'#/CancelledResult'},Consult:{$ref:'#/ConsultTicket'}}))schemas[name+'Envelope']=object({data:body,meta:object({requestId:str})});
fs.writeFileSync('docs/discovery.openapi.yaml',stringify(schemas));
const json=ref=>({content:{'application/json':{schema:{$ref:ref}}}}),sec=[{bearerAuth:[]}],errors=Object.fromEntries([400,401,403,404,409,422,429,500].map(code=>[code,{description:'Request rejected; no partial mutation',...json('#/components/schemas/ErrorEnvelope')}]));
const operation=(operationId,response,description,input,status=200)=>({operationId,security:sec,description,...(input?{requestBody:{required:true,...json('./discovery.openapi.yaml#/'+input)}}:{}),responses:{...errors,[status]:{description:'Successful result',...json('./discovery.openapi.yaml#/'+response)}}});
const routes={
 '/api/v1/products/facets':{get:{...operation('getProductFacets','ProductFacetsEnvelope','Public counts: visible product AND visible parent AND complete fee/conditions/disclosure. No hidden categories or contact data.'),security:[]}},
 '/api/v1/content-facets':{get:{...operation('getContentFacets','ContentFacetsEnvelope','Counts of PUBLISHED ARTICLE categories only, excluding draft/FAQ/glossary.'),security:[]}},
 '/api/v1/me/saved-products':{get:operation('getSavedProducts','SavedProductsEnvelope','USER-owned saved products, up to 200; current published visibility and terms applied on every read. Product/parent hidden or incomplete => excluded.')},
 '/api/v1/me/saved-products/{id}':{parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],put:operation('saveProduct','SavedEnvelope','USER-only idempotent save, owner row lock serializes the 200 limit. Current published product required. No financial-plan mutation.'),delete:operation('unsaveProduct','SavedEnvelope','USER-only idempotent removal, including hidden products. Owner scope only.')},
 '/api/v1/me/products/{id}/consult':{parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],post:operation('requestProductConsultation','ConsultEnvelope','USER. Creates a Support ticket/message and audit atomically. Owner lock prevents duplicate active requests. Published terms required. Optional expectedProductRevision rejects changed terms; immutable product snapshot in audit/message. No provider, purchase or transfer. UI explicitly collects consent/contact channel.','ProductConsultInput',201)},
 '/api/v1/me/support/{id}/cancel':{parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],post:operation('withdrawSupportRequest','CancelledEnvelope','Close only an owned OPEN/IN_PROGRESS ticket; preserve messages, reject resolved/closed/another owner.')},
 '/api/v1/me/product-tools/deposit/preview':{post:operation('previewProductDeposit','DepositEnvelope','USER read-only illustration. Explicit principal/rate/start/term/payout, no product-string parsing or inferred terms. Simple end or monthly-paid interest vs monthly compounding. Month-end clamping. Optional early rate/month before maturity: previously paid interest is deducted from settlement, not paid twice. Payment cents HALF_UP; compounding rounds only at final result. Excludes taxes/fees and does not write financial data.','DepositInput')},
 '/api/v1/me/product-tools/bond/preview':{post:operation('previewProductBond','BondEnvelope','USER read-only illustration. Coupon on face value, cost on purchase price. Coupon payments rounded to cents and totals reconcile to schedule. Interval divides term; max600months. Optional sale keeps only coupons due by sale. Bounded periodic IRR yields nominal annual YTM or null, never substituted by coupon/price. No plan writes, guarantee or trade.','BondInput')},
};
const indent=(v,n)=>stringify(v).trimEnd().split('\n').map(line=>' '.repeat(n)+line).join('\n');
let source=fs.readFileSync('docs/openapi.yaml','utf8');
for(const path of Object.keys(routes)){const escaped=path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');source=source.replace(new RegExp('^  '+escaped+':\\r?\\n[\\s\\S]*?(?=^components:|^  /)','m'),'');}
source=source.replace(/^components:/m,indent(routes,2)+'\ncomponents:');
const root=parseDocument(source),parameters=root.getIn(['paths','/api/v1/products','get','parameters']).toJSON();
for(const [name,entry]of [['category',{type:'string',minLength:1,maxLength:120}],['riskLevel',{type:'string',enum:['LOW','MEDIUM','HIGH']}],['sortBy',{type:'string',enum:['name','updatedAt','riskLevel'],default:'name'}]]){const index=parameters.findIndex(p=>p.name===name);const value={name,in:'query',schema:entry};if(index<0)parameters.push(value);else parameters[index]=value;}
root.setIn(['paths','/api/v1/products','get','parameters'],parameters);root.setIn(['paths','/api/v1/products','get','description'],'Visible catalog with published fee, conditions and disclosure; filters/search/pagination/counts use the same query. Search name, category and provider; risk sorting supports LOW/MEDIUM/HIGH. No fabricated rates, minimum amount or term metadata.');
fs.writeFileSync('docs/openapi.yaml',String(root));
