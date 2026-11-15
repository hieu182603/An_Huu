// Synthetic loopback harness: all state is memoryDb, never PostgreSQL or providers.
require('ts-node/register');
const express = require('express');
const { createApp } = require('../src/app');
const { allocationFixture } = require('../src/tests/allocation-workspace-fixtures');
const { RetirementService } = require('../src/modules/retirement/service');
const { PlansService } = require('../src/modules/plans/service');
const { config, token } = require('../src/tests/helpers');
const port = Number(process.env.SURVEY_UI_API_PORT ?? 62512);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid fixture port');
const harness = express();
harness.use(express.json());
let application;
let evidence = { writes: [], previews: [] };
harness.get('/__fixture/ready', (_req, res) => res.json({ ready: true }));
harness.get('/__fixture/evidence', (_req, res) => res.json(evidence));
harness.post('/__fixture/reset', async (req, res, next) => {
  try {
    const f = await allocationFixture({ endYear: req.body.endYear });
    // allocationFixture always constructs memoryDb; remove only its synthetic
    // financial profile so onboarding exercises the actual initial-create path.
    await f.db.financialProfile.deleteMany({ where: { userId: 'test-user' } });
    if (req.body.draft) await f.profiles.saveDraft('test-user', 0, req.body.step ?? 'personal', req.body.draft);
    if (req.body.profile) {
      await f.profiles.saveDraft('test-user', 0, 'summary', req.body.profile);
      await f.profiles.complete('test-user', { expectedDraftRevision: 1, expectedProfileRevision: 0 }, require('node:crypto').randomUUID());
    }
    f.auth.validateSession = async () => f.owner;
    evidence = { writes: [], previews: [] };
    const origin = process.env.SURVEY_UI_ORIGIN ?? 'http://127.0.0.1:62511';
    application = createApp({ config: { ...config, CLIENT_URL: origin, origins: [origin] }, services: { ...f.services, retirement: new RetirementService(f.db), plans: new PlansService(f.db) } });
    res.json({ accessToken: token('USER', 3600), policy: f.policy });
  } catch (error) { next(error); }
});
harness.use((req, res, next) => {
  if (!application) return res.status(503).json({ error: 'Fixture not initialized' });
  const path = req.path, recorded = evidence, send = res.json;
  if (/^\/api\/v1\/me\/(financial-profile|onboarding-draft|onboarding\/complete|portfolio-policies|assumptions|retirement)([/?]|$)/.test(path)) {
    res.json = function (body) {
      if (req.method !== 'GET') recorded.writes.push({ path, body: req.body, status: res.statusCode });
      if (path.endsWith('/retirement/preview')) recorded.previews.push(body);
      return send.call(this, body);
    };
  }
  return application(req, res, next);
});
harness.use((error, _req, res, _next) => res.status(400).json({ error: String(error.message) }));
const server = harness.listen(port, '127.0.0.1', () => process.stdout.write(`Survey memory API ready on loopback:${port}\n`));
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
