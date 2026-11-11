// Additive contracts only; no environment, database or provider calls.
require('ts-node/register');
const fs = require('node:fs'), { stringify } = require('yaml');
const { schema } = require('./generate-assumptions-openapi.cjs');
const { planningPatchObject, planningReportSchema } = require('../src/modules/profiles/planning');
fs.writeFileSync('docs/planning.openapi.yaml', stringify({ PlanningPatch: schema(planningPatchObject), PlanningReport: schema(planningReportSchema), PlanningReportEnvelope: { type: 'object', additionalProperties: false, required: ['data', 'meta'], properties: { data: { $ref: '#/PlanningReport' }, meta: { type: 'object', required: ['requestId'], properties: { requestId: { type: 'string' } } } } } }));
const json = ref => ({ content: { 'application/json': { schema: { $ref: ref } } } });
const security = [{ bearerAuth: [] }], errors = Object.fromEntries([400,401,403,404,409,429,500].map(code => [code, { description: 'Rejected; no partial write', ...json('#/components/schemas/ErrorEnvelope') }]));
const routes = { '/api/v1/me/financial-profile/planning': {
  get: { operationId: 'getProfilePlanning', security, description: 'USER/v2. Revision/date-bound care responsibilities, cumulative 1/3/5-year liquidity needs and complete goal collection. Missing data is UNKNOWN, never zero. No three-horizon sum, expense inference or automatic plan application.', responses: { ...errors, 200: { description: 'Saved planning declarations', ...json('./planning.openapi.yaml#/PlanningReportEnvelope') } } },
  patch: { operationId: 'patchProfilePlanning', security, description: 'USER/v2. Expected revision plus careResponsibility (KNOWN SELF/CHILDREN/PARENTS/BOTH/OTHER or UNKNOWN), all liquidityNeeds horizons (KNOWN decimal strings or UNKNOWN) and full goals collection (KNOWN/UNKNOWN/NOT_APPLICABLE). Known cumulative needs must not decrease; goal IDs unique, dates not before valuation month. Preserve all goal metadata and other profile data. Transaction/CAS/audit/outbox marks plans stale; no expense, fund withdrawal or version save/apply. Legacy v1 needs explicit upgrade.', requestBody: { required: true, ...json('./planning.openapi.yaml#/PlanningPatch') }, responses: { ...errors, 200: { description: 'Updated profile and authoritative summary', ...json('#/components/schemas/ProfilePatchResultEnvelope') } } },
} };
const indent = (text, count) => text.trimEnd().split('\n').map(line => ' '.repeat(count) + line).join('\n');
let source = fs.readFileSync('docs/openapi.yaml', 'utf8');
source = source.replace(/^  \/api\/v1\/me\/financial-profile\/planning:\r?\n[\s\S]*?(?=^components:|^  \/)/m, '');
source = source.replace(/^    PlanningReportEnvelope:\r?\n      \$ref: .*\r?\n/m, '');
source = source.replace(/^components:/m, indent(stringify(routes), 2) + '\ncomponents:');
source = source.replace(/^  securitySchemes:/m, indent(stringify({ PlanningReportEnvelope: { $ref: './planning.openapi.yaml#/PlanningReportEnvelope' } }), 4) + '\n  securitySchemes:');
fs.writeFileSync('docs/openapi.yaml', source);
