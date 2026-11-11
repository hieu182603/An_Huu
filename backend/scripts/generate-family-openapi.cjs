// Additive contracts only; no environment, database or provider calls.
require('ts-node/register');
const fs = require('node:fs'), { stringify } = require('yaml');
const { schema } = require('./generate-assumptions-openapi.cjs');
const { familyPatchSchema, familyReportSchema } = require('../src/modules/profiles/family');
fs.writeFileSync('docs/family.openapi.yaml', stringify({ FamilyPatch: schema(familyPatchSchema), FamilyReport: schema(familyReportSchema), FamilyReportEnvelope: { type: 'object', additionalProperties: false, required: ['data', 'meta'], properties: { data: { $ref: '#/FamilyReport' }, meta: { type: 'object', required: ['requestId'], properties: { requestId: { type: 'string' } } } } } }));
const json = ref => ({ content: { 'application/json': { schema: { $ref: ref } } } });
const security = [{ bearerAuth: [] }], errors = Object.fromEntries([400,401,403,404,409,429,500].map(code => [code, { description: 'Rejected; no partial write', ...json('#/components/schemas/ErrorEnvelope') }]));
const routes = { '/api/v1/me/financial-profile/family': {
  get: { operationId: 'getProfileFamily', security, description: 'USER/v2. Revision/date-bound marital/dependent declarations and DEPENDENT expenses only, using canonical valuation-month cashflow. Missing marital information is null; missing dependents are UNKNOWN, not zero. No income, expenses, goals or entitlement are inferred from marital status or headcount.', responses: { ...errors, 200: { description: 'Family declarations and support expenses', ...json('./family.openapi.yaml#/FamilyReportEnvelope') } } },
  patch: { operationId: 'patchProfileFamily', security, description: 'USER/v2. Expected revision plus explicit maritalStatus (SINGLE, MARRIED, DIVORCED, OTHER or null to withhold) and dependents (KNOWN integer 0..30 or UNKNOWN). Preserves every other personal/profile field and all expense/goal data. Transaction/CAS/audit/profile.changed marks plans stale without saving or applying a new plan. Legacy v1 requires explicit upgrade.', requestBody: { required: true, ...json('./family.openapi.yaml#/FamilyPatch') }, responses: { ...errors, 200: { description: 'Updated profile and authoritative summary', ...json('#/components/schemas/ProfilePatchResultEnvelope') } } },
} };
const indent = (text, count) => text.trimEnd().split('\n').map(line => ' '.repeat(count) + line).join('\n');
let source = fs.readFileSync('docs/openapi.yaml', 'utf8');
source = source.replace(/^  \/api\/v1\/me\/financial-profile\/family:\r?\n[\s\S]*?(?=^components:|^  \/)/m, '');
source = source.replace(/^    FamilyReportEnvelope:\r?\n      \$ref: .*\r?\n/m, '');
source = source.replace(/^components:/m, indent(stringify(routes), 2) + '\ncomponents:');
source = source.replace(/^  securitySchemes:/m, indent(stringify({ FamilyReportEnvelope: { $ref: './family.openapi.yaml#/FamilyReportEnvelope' } }), 4) + '\n  securitySchemes:');
fs.writeFileSync('docs/openapi.yaml', source);
