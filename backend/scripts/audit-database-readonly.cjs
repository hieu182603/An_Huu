// Read-only schema/configuration inventory. Never prints connection strings or records.
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { PrismaClient, Prisma } = require("@prisma/client");
const db = new PrismaClient({ log: [] });
const migrationRoot = path.resolve(__dirname, "../prisma/migrations");
const sha = buffer => createHash("sha256").update(buffer).digest("hex");
const identifier = value => '"' + value.replace(/"/g, '""') + '"';
let stage = "read-only-inventory";
(async () => {
  const inventory = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
    const tables = await tx.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
    const names = new Set(tables.map(t => t.table_name));
    const columns = await tx.$queryRawUnsafe("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'");
    const models = Prisma.dmmf.datamodel.models;
    const missingTables = [], missingColumns = [], counts = {};
    for (const model of models) {
      const table = model.dbName || model.name;
      if (!names.has(table)) { missingTables.push(table); continue; }
      for (const field of model.fields.filter(f => f.kind !== "object")) {
        const column = field.dbName || field.name;
        if (!columns.some(c => c.table_name === table && c.column_name === column)) missingColumns.push({ table, column });
      }
      const [row] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM public.${identifier(table)}`);
      counts[table] = row.count;
    }
    const extensions = await tx.$queryRawUnsafe("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'");
    const applied = names.has("_prisma_migrations") ? await tx.$queryRawUnsafe("SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY started_at") : [];
    const local = fs.readdirSync(migrationRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
    const migrations = applied.map(m => ({ name: m.migration_name, finished: m.finished, rolledBack: m.rolled_back,
      checksumMatches: local.includes(m.migration_name) && sha(fs.readFileSync(path.join(migrationRoot, m.migration_name, "migration.sql"))) === m.checksum }));
    const profiles = names.has("financial_profiles") ? await tx.$queryRawUnsafe(`SELECT "schemaVersion", COUNT(*)::int AS count FROM financial_profiles GROUP BY "schemaVersion" ORDER BY "schemaVersion"`) : [];
    const configurations = names.has("assumption_set_versions") ? await tx.$queryRawUnsafe(`SELECT "modelCode", status, COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE status = 'PUBLISHED' AND "effectiveAt" <= NOW())::int AS effective_published
      FROM assumption_set_versions GROUP BY "modelCode", status ORDER BY "modelCode", status`) : [];
    const knowledge = names.has("knowledge_sources") ? await tx.$queryRawUnsafe(`SELECT status, "isApproved", COUNT(*)::int AS count FROM knowledge_sources GROUP BY status, "isApproved" ORDER BY status, "isApproved"`) : [];
    const embedding = names.has("knowledge_chunks") ? await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS total, COUNT(embedding)::int AS with_embedding FROM knowledge_chunks`) : [];
    const roles = names.has("users") ? await tx.$queryRawUnsafe(`SELECT role, status, COUNT(*)::int AS count FROM users GROUP BY role, status ORDER BY role, status`) : [];
    return { mode: "READ_ONLY", checkedAt: new Date().toISOString(), modelTablesExpected: models.length, actualPublicTables: names.size,
      missingTables, missingColumns, extensions, migrations,
      pendingMigrations: local.filter(n => !applied.some(m => m.migration_name === n && m.finished && !m.rolled_back)),
      counts, profiles, configurations, knowledge, embedding, roles };
  }, { timeout: 60000, isolationLevel: "RepeatableRead" });
  stage = "schema-diff";
  // migrate diff only introspects and prints SQL; no deploy, db push or shadow DB.
  const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "diff",
    "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 60000 });
  const sql = result.stdout || "";
  const directory = path.resolve(__dirname, "../.tmp"); fs.mkdirSync(directory, { recursive: true });
  const diffPassed = result.status === 0;
  const report = { ...inventory, schemaDiff: { succeeded: diffPassed,
    empty: diffPassed ? !sql.replace(/--[^\n]*/g, "").trim() : null, exitCode: result.status,
    ...(diffPassed ? { outputFile: "backend/.tmp/database-schema-diff.sql" } : {}) } };
  if (diffPassed) fs.writeFileSync(path.join(directory, "database-schema-diff.sql"), sql);
  fs.writeFileSync(path.join(directory, "database-audit.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(error => {
  console.error(JSON.stringify({ stage, type: error.name, code: error.code ?? error.errorCode ?? "DATABASE_AUDIT_FAILED" }));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
