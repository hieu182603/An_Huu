// Rehearsal only: a new disposable database inside the named local test container.
const { execFileSync } = require("node:child_process");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { createHash } = require("node:crypto");
const container = "anhuu-remediation-test-1030";
const database = `anhuu_upgrade_${Date.now()}_test`;
if (!/^anhuu_upgrade_\d+_test$/.test(database)) throw new Error("Invalid disposable database name");
function sql(db, text) { return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-At"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
const directory = path.resolve(__dirname, "../prisma/migrations");
const names = readdirSync(directory).filter(n => /^\d/.test(n)).sort();
const added = ["202610300001_investment_workflow", "202610300002_investment_audit_guards"];
if (names.length !== 16 || !added.every(n => names.includes(n))) throw new Error("Review migration set before running rehearsal");
const digest = text => createHash("sha256").update(text).digest("hex");
sql("postgres", `CREATE DATABASE "${database}";`);
const db = new PrismaClient({ datasources: { db: { url: `postgresql://postgres:isolated-remediation-only@127.0.0.1:55439/${database}` } } });
(async () => {
  try {
    sql(database, "CREATE EXTENSION IF NOT EXISTS vector;");
    for (const name of names.filter(n => !added.includes(n))) sql(database, readFileSync(path.join(directory, name, "migration.sql"), "utf8"));
    const oldTables = await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    const user = await db.user.create({ data: { email: `${database}@example.test`, fullName: "Synthetic upgrade preservation", passwordHash: "synthetic-disabled-login", status: "ACTIVE", role: "USER" } });
    async function fingerprint() {
      const rows = [];
      for (const { tablename } of oldTables) {
        if (!/^[a-z_]+$/.test(tablename)) throw new Error("Unexpected legacy table name");
        rows.push([tablename, await db.$queryRawUnsafe(`SELECT to_jsonb(t)::text AS row FROM "${tablename}" t ORDER BY to_jsonb(t)::text`)]);
      }
      return digest(JSON.stringify(rows));
    }
    const before = await fingerprint();
    for (const name of added) sql(database, readFileSync(path.join(directory, name, "migration.sql"), "utf8"));
    if (await fingerprint() !== before) throw new Error("Legacy row fingerprint changed during upgrade");
    if ((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role !== "USER") throw new Error("Legacy role changed");
    await db.investmentRoleGrant.create({ data: { userId: user.id, role: "DATA_ADMIN", grantedBy: "synthetic-rehearsal" } });
    console.log(JSON.stringify({ check: "UPGRADE_14_TO_16", status: "PASS", database, legacyTables: oldTables.length, fingerprint: before }));
    // Rehearse rollback on this disposable DB only. Never run this against app data.
    sql(database, `DROP TABLE investment_approvals, investment_recommendation_items, investment_recommendations, investment_holdings, investment_product_data, investment_role_grants;
      DROP FUNCTION investment_approval_immutable(), investment_recommendation_owner_guard(), investment_independent_approval_guard(); DROP TYPE "InvestmentRole";`);
    if (await fingerprint() !== before) throw new Error("Legacy data changed during rollback");
    console.log(JSON.stringify({ check: "ROLLBACK_ADDITIVE_SCHEMA", status: "PASS", fingerprint: before }));
  } finally {
    await db.$disconnect();
    sql("postgres", `DROP DATABASE "${database}" WITH (FORCE);`);
    console.log(JSON.stringify({ check: "DISPOSABLE_DATABASE_CLEANUP", status: "PASS", database }));
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
