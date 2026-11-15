require('ts-node/register');
const fs=require('node:fs'),{parseDocument,stringify}=require('yaml');
const {schema}=require('./generate-assumptions-openapi.cjs');
const {retirementGoalPatch}=require('../src/modules/profiles/retirement-goal');
const {notificationQuery,listQuery}=require('../src/modules/community/service');
fs.writeFileSync('docs/remaining-user.openapi.yaml',stringify({RetirementGoalPatch:schema(retirementGoalPatch),NotificationListQuery:schema(notificationQuery),SupportListQuery:schema(listQuery)}));
const doc=parseDocument(fs.readFileSync('docs/openapi.yaml','utf8'));
const ref=key=>({content:{'application/json':{schema:{$ref:key}}}});
doc.setIn(['paths','/api/v1/me/financial-profile/retirement-goal'],{patch:{operationId:'saveRetirementGoal',security:[{bearerAuth:[]}],description:'USER/v2. Exact birth/retirement/end months, optional full birthDate and monthlyContribution, positive monthly retirement expense decimal string, optional lifestyle priority. Full birthDate must match birthMonth; preserve previously declared contribution when omitted. expectedRevision CAS, transaction/audit/outbox, preserve financial declarations and immutable versions; mark plans stale. No valuation date or benchmark changes, no automatic application. Retirement age 18–100 years; end month not before retirement or valuation.',requestBody:{required:true,...ref('./remaining-user.openapi.yaml#/RetirementGoalPatch')},responses:{200:{description:'Saved profile and authoritative summary',...ref('#/components/schemas/ProfilePatchResultEnvelope')},...Object.fromEntries([400,401,403,404,409,422,429,500].map(status=>[status,{description:'Rejected without partial write',...ref('#/components/schemas/ErrorEnvelope')}]))}}});
for(const[path,key]of[['/api/v1/me/notifications','NotificationListQuery'],['/api/v1/me/support','SupportListQuery']]){
 const properties=schema(key==='NotificationListQuery'?notificationQuery:listQuery).properties;
 const parameters=Object.entries(properties).map(([name,value])=>({name,in:'query',required:false,schema:value}));
 doc.setIn(['paths',path,'get','parameters'],parameters);
}
fs.writeFileSync('docs/openapi.yaml',String(doc));
