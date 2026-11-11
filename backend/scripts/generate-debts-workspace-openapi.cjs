// Contract generation only; no environment or database calls.
require('ts-node/register');
const fs = require('node:fs');
const { stringify } = require('yaml');
const { schema } = require('./generate-assumptions-openapi.cjs');
const { debtPatchSchema } = require('../src/modules/profiles/debt-commands');
const { debtReportSchema } = require('../src/modules/profiles/debt-summary');
fs.writeFileSync('docs/profile-debts.openapi.yaml', stringify({ DebtPatch: schema(debtPatchSchema), DebtReport: schema(debtReportSchema), DebtReportEnvelope: { type: 'object', additionalProperties: false, required: ['data', 'meta'], properties: { data: { $ref: '#/DebtReport' }, meta: { type: 'object', required: ['requestId'], properties: { requestId: { type: 'string' } } } } } }));
const json = ref => ({ content: { 'application/json': { schema: { $ref: ref } } } });
const errors = Object.fromEntries([400,401,403,404,409,429,500].map(code => [code, { description: 'Rejected; no partial mutation', ...json('#/components/schemas/ErrorEnvelope') }]));
const security = [{ bearerAuth: [] }];
const path = { '/api/v1/me/financial-profile/debts': {
  get: { operationId: 'getProfileDebts', security, description: 'USER/v2. Revision-bound authoritative debt totals and schedules. Unknown values stay null. Illustrative schedules use explicitly declared nominal annual rates / 12, reducing balance, fixed total payments and no fees; day 01 marks a month. Confirmed contract terms remain authoritative. Future interest-bearing repayments need deferred-interest terms. No default rate or payoff date. No snapshot mutation.', responses: { ...errors, 200: { description: 'Debt workspace report', ...json('./profile-debts.openapi.yaml#/DebtReportEnvelope') } } },
  patch: { operationId: 'patchProfileDebts', security, description: 'USER/v2. Revision-checked ADD/UPDATE/DELETE/SPLIT/CONFIRM_NONE. Linked DEBT_PAYMENT expenses are synchronized atomically; contract and illustrative references keep unknown amounts to avoid false constant payments. SPLIT requires known balance/payment and identical allocation, currency, dates and schedule; contracted/shared source loans cannot split. ADD to UNKNOWN needs explicit group confirmation. Writes mark plans stale without applying versions.', requestBody: { required: true, ...json('./profile-debts.openapi.yaml#/DebtPatch') }, responses: { ...errors, 200: { description: 'Updated profile and summary', ...json('#/components/schemas/ProfilePatchResultEnvelope') } } },
} };
const indent = (text, spaces) => text.trimEnd().split('\n').map(line => ' '.repeat(spaces) + line).join('\n');
let source = fs.readFileSync('docs/openapi.yaml', 'utf8');
source = source.replace(/^  \/api\/v1\/me\/financial-profile\/debts:\r?\n[\s\S]*?(?=^components:|^  \/)/m, '');
for (const name of ['DebtPatch', 'DebtReportEnvelope']) source = source.replace(new RegExp('^    ' + name + ':\\r?\\n      \\$ref: .*\\r?\\n', 'm'), '');
source = source.replace(/^components:/m, indent(stringify(path), 2) + '\ncomponents:');
source = source.replace(/^  securitySchemes:/m, indent(stringify({ DebtPatch: { $ref: './profile-debts.openapi.yaml#/DebtPatch' }, DebtReportEnvelope: { $ref: './profile-debts.openapi.yaml#/DebtReportEnvelope' } }), 4) + '\n  securitySchemes:');
fs.writeFileSync('docs/openapi.yaml', source);
