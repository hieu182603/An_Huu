// Contract-only generation; no environment, database or provider calls.
require('ts-node/register');
const fs = require('node:fs');
const { stringify } = require('yaml');
const { schema } = require('./generate-assumptions-openapi.cjs');
const { cashflowPatchSchema } = require('../src/modules/profiles/cashflow-commands');
fs.writeFileSync('docs/cashflow.openapi.yaml', stringify({ CashflowPatch: schema(cashflowPatchSchema) }));
const json = schema => ({ content: { 'application/json': { schema } } });
const endpoint = {
  operationId: 'patchProfileCashflow', security: [{ bearerAuth: [] }],
  description: 'USER only, profile v2. ADD/UPDATE/DELETE a cashflow item or SPLIT an existing known amount without double counting. SPLIT requires sourceId and identical currency, frequency and start/end months; amount must not exceed the remaining source. Other operations reject sourceId. ADD to UNKNOWN requires confirmUnknownGroup=true. Pension and debt references are read-only here. CONFIRM_NONE requires an empty/unknown group. Each successful command increments profile revision, emits profile.changed and marks plans stale without changing applied versions. Stale revisions reject with 409; retry by reloading, never automatically repeat with a new revision.',
  requestBody: { required: true, ...json({ $ref: './cashflow.openapi.yaml#/CashflowPatch' }) },
  responses: {
    200: { description: 'Updated profile and authoritative summary', ...json({ $ref: '#/components/schemas/ProfilePatchResultEnvelope' }) },
    ...Object.fromEntries([400,401,403,404,409,429,500].map(code => [code, { description: 'Request rejected; no partial mutation', ...json({ $ref: '#/components/schemas/ErrorEnvelope' }) }])),
  },
};
// Insert only these two blocks; leave handwritten contracts and formatting intact.
const indent = (text, spaces) => text.trimEnd().split('\n').map(line => ' '.repeat(spaces) + line).join('\n');
let source = fs.readFileSync('docs/openapi.yaml', 'utf8');
source = source.replace(/^  \/api\/v1\/me\/financial-profile\/cashflow:\r?\n[\s\S]*?(?=^components:|^  \/)/m, '');
source = source.replace(/^    CashflowPatch:\r?\n      \$ref: .*\r?\n/m, '');
source = source.replace(/^components:/m, indent(stringify({ '/api/v1/me/financial-profile/cashflow': { patch: endpoint } }), 2) + '\ncomponents:');
source = source.replace(/^  securitySchemes:/m, indent(stringify({ CashflowPatch: { $ref: './cashflow.openapi.yaml#/CashflowPatch' } }), 4) + '\n  securitySchemes:');
fs.writeFileSync('docs/openapi.yaml', source);
