// Synthetic loopback-only harness. No database, email, external provider or legal publication.
require('ts-node/register');
const express = require('express');
const apiPort = Number(process.env.USER_UI_API_PORT ?? 55442);
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new Error('Invalid UI fixture port');
const previewOrigin = process.env.USER_UI_PREVIEW_ORIGIN ?? 'http://127.0.0.1:55441';

const { createApp } = require('../src/app');
const { remainingFixture } = require('../src/tests/remaining-user-fixtures');
const { allocationFixture } = require('../src/tests/allocation-workspace-fixtures');
const { discoveryFixture } = require('../src/tests/discovery-fixtures');
const { config, token } = require('../src/tests/helpers');
const {consultationLimiter,aiLimiter}=require('../src/middlewares/rateLimiter');
const harness = express(); harness.use(express.json()); let application;
harness.get('/__fixture/ready', (_req,res) => res.json({ ready:true }));
harness.post('/__fixture/reset', async (req,res,next) => {
  try {
    const f = await (req.body.remaining ? remainingFixture(req.body) : req.body.allocation ? allocationFixture(req.body) : discoveryFixture(req.body)); f.auth.validateSession = async () => f.owner;
    // A reset starts an independent synthetic account fixture; production limits remain unchanged.
    await consultationLimiter.resetKey('user:test-user');await aiLimiter.resetKey('user:test-user');
    application = createApp({ config: { ...config, CLIENT_URL:previewOrigin, origins:[previewOrigin] }, services:f.services });
    res.json({ planInput:f.input,planId:f.planId,versionId:f.versionId, allocationCommand:f.command, policyId:f.policy?.id, accessToken:token('USER',3600), profile:await f.profiles.getProfile('test-user'), products:f.products.map(row=>({id:row.id,name:row.name})), articles:f.articles.map(row=>({id:row.id,slug:row.slug,title:row.title})), hiddenProduct:f.hiddenProduct.id, draft:f.draft.slug });
  } catch(error) { next(error); }
});
harness.use((req,res,next) => application ? application(req,res,next) : res.status(503).json({ error:'Fixture not initialized' }));
harness.use((_error,_req,res,_next) => res.status(400).json({ error:'Invalid discovery fixture' }));
const server = harness.listen(apiPort,'127.0.0.1',()=>process.stdout.write(`Discovery memory API ready on loopback:${apiPort}\n`));
const stop = () => server.close(()=>process.exit(0)); process.on('SIGTERM',stop);process.on('SIGINT',stop);
