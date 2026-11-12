// Synthetic browser harness, bound to loopback. No application database or provider.
require('ts-node/register');
const express = require('express');
const apiPort = Number(process.env.USER_UI_API_PORT ?? 55442);
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new Error('Invalid UI fixture port');
const previewOrigin = process.env.USER_UI_PREVIEW_ORIGIN ?? 'http://127.0.0.1:55441';

const { randomUUID } = require('node:crypto');
const { createApp } = require('../src/app');
const { ProfileService } = require('../src/modules/profiles/service');
const { AuthService } = require('../src/modules/auth/service');
const { DebtService } = require('../src/modules/debts/service');
const { InsuranceHistoryService } = require('../src/modules/pensions/history-service');
const { PensionsService } = require('../src/modules/pensions/service');
const { PensionEstimateService } = require('../src/modules/pensions/estimate-service');
const { AssumptionsService } = require('../src/modules/assumptions/service');
const { memoryDb } = require('../src/tests/memory-db');
const { fixtureProfile, empty } = require('../src/tests/profile-v2-fixtures');
const { plansFixture } = require('../src/tests/plans-fixtures');
const { retirementProfile } = require('../src/tests/retirement-fixtures');
const { config, token } = require('../src/tests/helpers');
const harness = express(); harness.use(express.json());
let application;
harness.get('/__fixture/ready', (_req, res) => res.json({ ready: true }));
harness.post('/__fixture/reset', async (req, res, next) => {
  try {
    let f, profiles, extraServices = {}, plan = null;
    if (req.body.withPlan) {
      const data = retirementProfile(), source = fixtureProfile({ debts: empty() });
      data.income = source.income; data.expenses = source.expenses;
      if (data.income.status === 'KNOWN') data.income.entries[0].endMonth = '2026-12';
      Object.assign(data, req.body.changes ?? {});
      f = await plansFixture(data); profiles = f.profiles;
      const previewInput = { ...f.command.preview, monthlyContribution: '5000000', monthlyReserve: '1000000' };
      const preview = await f.retirement.preview(f.owner, previewInput, { adjustments: false });
      const saved = await f.plans.createVersion(f.owner, null, { expectedRevision: 0, expectedInputHash: preview.inputHash, preview: previewInput }, randomUUID());
      await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: saved.revision, expectedProfileRevision: 1, confirm: true }, randomUUID());
      extraServices = { plans: f.plans, retirement: f.retirement };
      plan = { id: saved.planId, versionId: saved.saved.id };
    } else {
      f = memoryDb(); profiles = new ProfileService(f.db);
      const data = fixtureProfile({ debts: empty(), ...req.body.changes });
      await profiles.saveDraft('test-user', 0, 'summary', data);
      await profiles.complete('test-user', { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    }
    const auth = new AuthService(f.db, config);
    const user = await f.db.user.create({ data: { id: 'test-user', role: 'USER', status: 'ACTIVE', email: 'cashflow-ui@example.test', fullName: 'Synthetic fixture', passwordHash: 'unused' } });
    auth.validateSession = async () => user;
    const insuranceHistory = new InsuranceHistoryService(f.db);
    if (req.body.historyDocument) {
      const preview = { expectedHistoryRevision: 0, document: req.body.historyDocument };
      const result = await insuranceHistory.preview(user.id, preview);
      await insuranceHistory.save(user.id, { preview, expectedInputHash: result.inputHash, confirm: true }, randomUUID());
    }
    const browserConfig = { ...config, CLIENT_URL: previewOrigin, origins: [previewOrigin] };
    application = createApp({ config: browserConfig, services: { profiles, auth, debts: new DebtService(f.db), insuranceHistory, pensions: new PensionsService(f.db), pensionEstimates: new PensionEstimateService(f.db), assumptions: new AssumptionsService(f.db), ...extraServices } });
    res.json({ accessToken: token('USER', 3600), profile: await profiles.getProfile('test-user'), plan });
  } catch (error) { next(error); }
});
harness.use((req, res, next) => application ? application(req, res, next) : res.status(503).json({ error: 'Fixture not initialized' }));
harness.use((_error, _req, res, _next) => res.status(400).json({ error: 'Invalid synthetic fixture' }));
const server = harness.listen(apiPort, '127.0.0.1', () => process.stdout.write(`Cashflow memory API ready on loopback:${apiPort}\n`));
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop); process.on('SIGINT', stop);
