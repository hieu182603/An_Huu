require('ts-node/register');
const fs = require('node:fs');
const { stringify, parseDocument } = require('yaml');
const { schema } = require('./generate-assumptions-openapi.cjs');
const { actualWriteSchema, actualPayloadSchema, actualForecastSchema, reforecastPreviewSchema } = require('../src/modules/actuals/schema');
const str = { type: 'string' }, uuid = { type: 'string', format: 'uuid' }, integer = { type: 'integer' }, bool = { type: 'boolean' };
const obj = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = items => ({ type: 'array', items }), ref = name => ({ $ref: '#/' + name });
const s = { WriteInput: schema(actualWriteSchema), Payload: schema(actualPayloadSchema), ForecastInput: schema(actualForecastSchema), UpdatePreviewInput: schema(reforecastPreviewSchema) };
s.Month = obj({ id: uuid, period: str, revision: integer, updatedAt: { type: 'string', format: 'date-time' }, valueKind: { type: 'string', enum: ['ACTUAL'] }, data: ref('Payload'),
  totals: { type: 'object', additionalProperties: str }, householdSurplus: str, cashflowState: { type: 'string', enum: ['SURPLUS','BALANCED','DEFICIT'] }, actualContribution: str,
  calculatedClosingBalance: str, discrepancy: str, reconciliation: { type: 'string', enum: ['MATCHED','UNRECONCILED'] }, hasAdjustments: bool, conventions: str });
s.Detail = obj({ ...s.Month.properties, history: arr(obj({ revision: integer, createdAt: { type: 'string', format: 'date-time' }, data: ref('Payload') })) });
s.List = obj({ valueKind: str, items: arr(ref('Month')) });
const nullable = value => ({ anyOf: [value, { type: 'object', nullable: true, enum: [null] }] });
s.Forecast = obj({ status: { type: 'string', enum: ['READY','BLOCKED','HORIZON_COMPLETE'] }, valueKind: { type: 'string', enum: ['REFORECAST'] },
  planId: uuid, versionId: uuid, snapshotHash: str, baselineVersionId: { ...uuid, nullable: true }, throughMonth: str, originalRetirementMonth: str,
  actuals: arr(ref('Month')), issues: arr(obj({ month: str, code: str })), calculation: nullable(obj({ modelVersion: str,
    conventions: { $ref: './retirement.openapi.yaml#/Conventions' }, summary: { $ref: './retirement.openapi.yaml#/Summary' }, rows: arr({ $ref: './retirement.openapi.yaml#/Row' }) })),
  anchor: nullable(obj({ period: str, revision: integer, closingBalance: str })), comparison: arr(obj({ month: str, actualRevision: integer,
    actualClosingBalance: str, forecastClosingBalance: str, closingBalanceDelta: str, actualContribution: str, forecastContribution: str })), limitations: arr(str) });
s.UpdatePreview = obj({ status: s.Forecast.properties.status, issues: s.Forecast.properties.issues, inputHash: { ...str, nullable: true }, candidate: nullable({ $ref: './retirement.openapi.yaml#/Preview' }), beforeChanges: s.Forecast.properties.calculation, saved: { ...bool, enum: [false] }, applied: { ...bool, enum: [false] } });
const v4Calculation=JSON.parse(JSON.stringify(s.Forecast.properties.calculation.anyOf[0]));
v4Calculation.properties.modelVersion={type:'string',enum:['retirement-monthly-v4']};
v4Calculation.properties.sourceRegistryHash=str;v4Calculation.properties.attribution=arr({$ref:'./source-snapshot.openapi.yaml#/Attribution'});
v4Calculation.required.push('sourceRegistryHash','attribution');
s.Forecast.properties.calculation.anyOf.push(v4Calculation);
for (const name of ['Month','Detail','List','Forecast','UpdatePreview']) s[name + 'Envelope'] = obj({ data: ref(name), meta: obj({ requestId: uuid }) });
fs.writeFileSync('docs/actuals.openapi.yaml', stringify(s));
const doc = parseDocument(fs.readFileSync('docs/openapi.yaml', 'utf8'));
const json = name => ({ content: { 'application/json': { schema: { $ref: './actuals.openapi.yaml#/' + name } } } });
for (const [suffix, method, output, input] of [['','get','List'], ['/{period}','get','Detail'], ['/{period}','put','Month','WriteInput'], ['/reforecast','post','Forecast','ForecastInput'], ['/reforecast/preview','post','UpdatePreview','UpdatePreviewInput']]) {
  const parameters = [];
  if (suffix.includes('{period}')) parameters.push({ name: 'period', in: 'path', required: true, schema: str });
  if (method === 'put') parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: uuid });
  if (output === 'List') for (const name of ['from','to']) parameters.push({ name, in: 'query', required: true, schema: str });
  doc.setIn(['paths', '/api/v1/me/retirement/actuals' + suffix, method], { operationId: 'actual' + output, security: [{ bearerAuth: [] }], parameters,
    description: 'USER only. One consolidated retirement fund per user, VND. Full-month replacement with revision/history. See MONTHLY_ACTUALS.md.',
    ...(input ? { requestBody: { required: true, ...json(input) } } : {}), responses: { 200: { description: 'Actual ledger or derived forecast', ...json(output + 'Envelope') },
      ...Object.fromEntries([400,401,403,404,409,422,429].map(code => [code, { description: 'Request rejected', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } }])) } });
}
for (const name of ['Month','Detail','List','Forecast','UpdatePreview']) doc.setIn(['components','schemas','Actual' + name + 'Envelope'], { $ref: './actuals.openapi.yaml#/' + name + 'Envelope' });
fs.writeFileSync('docs/openapi.yaml', String(doc));
