// Local synthetic test harness; refuses application/remote databases.
const fs = require("node:fs");
const path = require("node:path");
const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname) || !/^\/anhuu_[a-z0-9_]+_test$/.test(new URL(url).pathname)) throw new Error("Isolated test database required");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = url;
require("ts-node/register");
const { PrismaClient } = require("@prisma/client");
const { createApp } = require("../src/app");
const { createServices } = require("../src/modules/services");
const { config: defaults } = require("../src/tests/helpers");
const { seedInvestmentFixture } = require("../src/tests/investment-fixture");
const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
(async () => {
  const fixture = await seedInvestmentFixture(db);
  const artifact = path.resolve(__dirname, "../../.tmp/remediation/browser-fixture.json");
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, JSON.stringify(fixture));
  const config = { ...defaults, DATABASE_URL: url, CLIENT_URL: "http://127.0.0.1:55441", origins: ["http://127.0.0.1:55441"], ENABLE_CONTINUOUS_OPTIMIZER: "true", ENABLE_OPTIMIZER_FALLBACK: "true", ENABLE_RECOMMENDATION_PUBLICATION: "true", RECOMMENDATION_LEGAL_AUTHORIZATION_REFERENCE: "ISOLATED SYNTHETIC TEST ONLY", PREVIEW_WORKERS: 0 };
  const app = createApp({ config, services: createServices(db, config), databaseProbe: () => db.$queryRaw`SELECT 1` });
  const server = app.listen(55440, "127.0.0.1", () => console.log("Isolated remediation browser backend ready on 55440"));
  const stop = () => server.close(async () => { await db.$disconnect(); process.exit(0); });
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
})().catch(error => { console.error(error.code ?? error.message); process.exitCode = 1; });
