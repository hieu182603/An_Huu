// FE-ADMIN-GAPS (08/11/2026): investment role grants + persistent broadcast. Writes docs only.
require('ts-node/register');
const fs=require('node:fs'),{parseDocument,stringify}=require('yaml');
const {schema}=require('./generate-assumptions-openapi.cjs');
const {investmentRoleChange}=require('../src/modules/users/investment-roles');
const {broadcastInput}=require('../src/modules/community/broadcast');
const str={type:'string'},uuid={type:'string',format:'uuid'},date={type:'string',format:'date-time'};
const obj=p=>({type:'object',additionalProperties:false,required:Object.keys(p),properties:p}),ref=n=>({$ref:'#/'+n});
const roles=['OPERATIONS','DATA_ADMIN','MODEL_ADMIN','ADVISOR','APPROVER','SYSTEM_ADMIN'];
const s={InvestmentRoleChange:schema(investmentRoleChange),BroadcastInput:schema(broadcastInput)};
s.InvestmentRoleGrant=obj({role:{type:'string',enum:roles},grantedBy:str,createdAt:date});
s.InvestmentRoleAccount=obj({userId:uuid,fullName:str,email:str,status:{type:'string',enum:['ACTIVE','PENDING_VERIFICATION','SUSPENDED']},roles:{type:'array',items:ref('InvestmentRoleGrant')}});
s.InvestmentRoleChangeResult=obj({...s.InvestmentRoleAccount.properties,changed:{type:'boolean'}});
s.InvestmentRoleList=obj({items:{type:'array',maxItems:200,items:ref('InvestmentRoleAccount')},assignableRoles:{type:'array',items:{type:'string',enum:roles}}});
s.BroadcastResult=obj({broadcasted:{type:'boolean',enum:[true]},broadcastId:uuid,title:str,message:str,recipients:{type:'integer',minimum:0},replayed:{type:'boolean'}});
for(const n of ['InvestmentRoleAccount','InvestmentRoleChangeResult','InvestmentRoleList','BroadcastResult'])s[n+'Envelope']=obj({data:ref(n),meta:obj({requestId:uuid})});
fs.writeFileSync('docs/admin-gaps.openapi.yaml',stringify(s));
const doc=parseDocument(fs.readFileSync('docs/openapi.yaml','utf8'));
const json=n=>({content:{'application/json':{schema:{$ref:'./admin-gaps.openapi.yaml#/'+n}}}});
const errors=(codes,text)=>Object.fromEntries(codes.map(code=>[code,{description:text[code]||'Request rejected',content:{'application/json':{schema:{$ref:'#/components/schemas/ErrorEnvelope'}}}}]));
const userId={name:'userId',in:'path',required:true,schema:uuid};
const who='Caller: ADMIN login role AND an ACTIVE investment role SYSTEM_ADMIN (checked inside the transaction). Others get 403 FORBIDDEN. Bootstrap the first SYSTEM_ADMIN with `npm run admin:grant-system-admin` (BOOTSTRAP_ADMIN_EMAIL; refuses when an ACTIVE SYSTEM_ADMIN already exists).';
const common={401:'UNAUTHENTICATED',403:'FORBIDDEN: not ADMIN or no SYSTEM_ADMIN investment role'};
const op=(operationId,summary,description,extra)=>({operationId,summary,tags:['Admin investment roles'],security:[{bearerAuth:[]}],'x-required-role':'ADMIN','x-required-investment-role':'SYSTEM_ADMIN',description,...extra});
doc.setIn(['paths','/api/v1/admin/investment-roles'],{get:op('listInvestmentRoles','List ADMIN accounts with their investment roles',who+' Returns at most 200 ADMIN accounts (USER accounts never hold investment roles). Cache-Control: no-store.',
 {responses:{200:{description:'ADMIN accounts and roles',...json('InvestmentRoleListEnvelope')},...errors([401,403,503],common)}})});
doc.setIn(['paths','/api/v1/admin/investment-roles/{userId}'],{get:op('getInvestmentRoles','Investment roles of one ADMIN account',who,
 {parameters:[userId],responses:{200:{description:'Account and roles',...json('InvestmentRoleAccountEnvelope')},...errors([400,401,403,404,422],{...common,404:'NOT_FOUND account',422:'INVESTMENT_ROLE_ADMIN_ONLY: target is a USER account'})}})});
doc.setIn(['paths','/api/v1/admin/investment-roles/{userId}/grant'],{post:op('grantInvestmentRole','Grant an investment role (idempotent)',who+' Granting a role the account already holds returns 200 with changed=false and writes no audit row. Otherwise inserts the grant (grantedBy = caller) and audit INVESTMENT_ROLE_GRANTED {role, reason} in one serializable transaction.',
 {parameters:[userId],requestBody:{required:true,...json('InvestmentRoleChange')},responses:{200:{description:'Roles after the change',...json('InvestmentRoleChangeResultEnvelope')},...errors([400,401,403,404,409,422],{...common,400:'VALIDATION_ERROR (strict body)',404:'NOT_FOUND account',409:'CONCURRENT_UPDATE: retry',422:'INVESTMENT_ROLE_ADMIN_ONLY: target is a USER account'})}})});
doc.setIn(['paths','/api/v1/admin/investment-roles/{userId}/revoke'],{post:op('revokeInvestmentRole','Revoke an investment role',who+' Deletes the grant and writes audit INVESTMENT_ROLE_REVOKED {role, reason} in one serializable transaction. Revoking SYSTEM_ADMIN is refused when no other ACTIVE ADMIN would keep SYSTEM_ADMIN (409 LAST_ROLE_MANAGER), which covers revoking your own last grant.',
 {parameters:[userId],requestBody:{required:true,...json('InvestmentRoleChange')},responses:{200:{description:'Roles after the change',...json('InvestmentRoleChangeResultEnvelope')},...errors([400,401,403,404,409,422],{...common,400:'VALIDATION_ERROR (strict body)',404:'NOT_FOUND account or ROLE_NOT_GRANTED (role not held)',409:'LAST_ROLE_MANAGER or CONCURRENT_UPDATE',422:'INVESTMENT_ROLE_ADMIN_ONLY: target is a USER account'})}})});
doc.setIn(['paths','/api/v1/admin/notifications/broadcast'],{post:{operationId:'broadcastNotification',summary:'Persist and push a system-wide notification',tags:['Admin notifications'],security:[{bearerAuth:[]}],'x-required-role':'ADMIN',
 description:'Any ADMIN. Requires header Idempotency-Key (UUID). Stores one notification (path /user/notifications) for every ACTIVE USER created up to the first request, in batches of 1000 rows per short transaction; progress is kept in idempotency_records so a retry with the same key resumes without duplicates, and a finished broadcast is replayed (replayed=true, no new rows, no socket push). Audit ADMIN_NOTIFICATION_BROADCAST at start and ADMIN_NOTIFICATION_BROADCAST_COMPLETED {recipients} at the end. After completion emits socket event notification:broadcast {broadcastId,title,message,recipients,persisted:true,timestamp} to connected clients.',
 parameters:[{name:'Idempotency-Key',in:'header',required:true,schema:uuid}],requestBody:{required:true,...json('BroadcastInput')},
 responses:{200:{description:'Recipients count',...json('BroadcastResultEnvelope')},...errors([400,401,403,409,503],{400:'VALIDATION_ERROR or IDEMPOTENCY_KEY_REQUIRED',401:'UNAUTHENTICATED',403:'FORBIDDEN: not ADMIN',409:'IDEMPOTENCY_CONFLICT (same key, different body) or CONCURRENT_UPDATE'})}}});
fs.writeFileSync('docs/openapi.yaml',String(doc));
