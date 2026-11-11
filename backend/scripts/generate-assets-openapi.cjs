// Contract-only generation; no environment, database or provider calls.
require('ts-node/register');
const fs = require('node:fs');
const { stringify } = require('yaml');
const { schema } = require('./generate-assumptions-openapi.cjs');
const { assetPatchSchema } = require('../src/modules/profiles/asset-commands');
const { assetReportSchema } = require('../src/modules/profiles/asset-summary');
fs.writeFileSync('docs/assets.openapi.yaml', stringify({ AssetPatch: schema(assetPatchSchema), AssetReport: schema(assetReportSchema), AssetReportEnvelope: { type: 'object', additionalProperties: false, required: ['data', 'meta'], properties: { data: { $ref: '#/AssetReport' }, meta: { type: 'object', required: ['requestId'], properties: { requestId: { type: 'string' } } } } } }));
const json = schema => ({ content: { 'application/json': { schema } } });
const endpoint = {
  operationId: 'patchProfileAssets', security: [{ bearerAuth: [] }],
  description: 'USER/v2. Revision-checked ADD/UPDATE/DELETE/SPLIT/CONFIRM_NONE. Splits preserve ownership, currency, valuation, liquidity and availability; the new purpose/type may be reclassified. Known cost basis is allocated proportionally in cents while preserving its total. Confirmed housing plans must be reviewed before splitting. ADD to UNKNOWN requires confirmUnknownGroup=true. CONFIRM_NONE requires an empty group. Writes mark plans stale without applying versions.',
  requestBody: { required: true, ...json({ $ref: './assets.openapi.yaml#/AssetPatch' }) },
  responses: {
    200: { description: 'Updated profile and authoritative summary', ...json({ $ref: '#/components/schemas/ProfilePatchResultEnvelope' }) },
    ...Object.fromEntries([400,401,403,404,409,429,500].map(code => [code, { description: 'Request rejected; no partial mutation', ...json({ $ref: '#/components/schemas/ErrorEnvelope' }) }])),
  },
};
// Insert only these two blocks; leave handwritten contracts and formatting intact.
const indent = (text, spaces) => text.trimEnd().split('\n').map(line => ' '.repeat(spaces) + line).join('\n');
let source = fs.readFileSync('docs/openapi.yaml', 'utf8');
source = source.replace(/^  \/api\/v1\/me\/financial-profile\/assets:\r?\n[\s\S]*?(?=^components:|^  \/)/m, '');
source = source.replace(/^    AssetPatch:\r?\n      \$ref: .*\r?\n/m, '');
source = source.replace(/^components:/m, indent(stringify({ '/api/v1/me/financial-profile/assets': { get: { operationId: 'getProfileAssets', security: [{ bearerAuth: [] }], description: 'USER/v2. Authoritative values in VND at the profile valuation date. Unknown dependent values remain null; zero expenses have coverageBasis NO_EXPENSE and no month ratio. Percentages are rounded to one decimal place for display. The report does not change projection inputs or applied snapshots.', responses: { ...endpoint.responses, 200: { description: 'Current owned assets and purpose breakdown', ...json({ $ref: './assets.openapi.yaml#/AssetReportEnvelope' }) } } }, patch: endpoint } }), 2) + '\ncomponents:');
source = source.replace(/^    AssetReportEnvelope:\r?\n      \$ref: .*\r?\n/m, '');
source = source.replace(/^  securitySchemes:/m, indent(stringify({ AssetPatch: { $ref: './assets.openapi.yaml#/AssetPatch' }, AssetReportEnvelope: { $ref: './assets.openapi.yaml#/AssetReportEnvelope' } }), 4) + '\n  securitySchemes:');
fs.writeFileSync('docs/openapi.yaml', source);
