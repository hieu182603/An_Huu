const { spawnSync } = require("node:child_process");
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required; DATABASE_URL is never used as fallback.");
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^\/anhuu_[a-z0-9_]+_test$/.test(parsed.pathname)) {
  throw new Error("Only an isolated local anhuu_*_test database is allowed.");
}
async function main() {
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");
  } finally {
    await db.$disconnect();
  }
  const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
    stdio: "inherit", env: { ...process.env, DATABASE_URL: url },
  });
  process.exitCode = result.status ?? 1;
}
main().catch(() => {
  console.error("Isolated test DB preparation failed. PostgreSQL must have pgvector installed and allow CREATE EXTENSION.");
  process.exitCode = 1;
});
