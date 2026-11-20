// Narrow B7-1 verification on owned disposable Docker PostgreSQL only.
// Never reads .env and never uses the application's DATABASE_URL.
const { spawnSync } = require('node:child_process');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');

const marker = randomUUID();
const container = 'anhuu-rebalance-migration-' + marker;
const label = 'anhuu.rebalance-migration-audit';
const secret = randomBytes(32).toString('hex');
const image = 'pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a';
const migrationName = '202611200001_rebalance_decisions';
const artifact = path.resolve('.cache/rebalance-migration-' + marker);
const reportFile = artifact + '.json';
const migrationsPath = path.resolve('prisma/migrations');
const schemaPath = path.resolve('prisma/schema.prisma');
const migrationNames = fs.readdirSync(migrationsPath, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => x.name).sort();
assert.equal(migrationNames.at(-1), migrationName, 'This verifier expects the rebalance migration to be newest.');
const migrationSql = fs.readFileSync(path.join(migrationsPath, migrationName, 'migration.sql'), 'utf8');
const hashes = Object.fromEntries(migrationNames.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(migrationsPath, name, 'migration.sql'))).digest('hex')]));
const cleanDatabase = 'anhuu_rebalance_clean_test';
const upgradeDatabase = 'anhuu_rebalance_upgrade_test';
const databases = new Set([cleanDatabase, upgradeDatabase]);
const model = Prisma.dmmf.datamodel.models.find(x => x.name === 'RebalanceDecision');
assert.ok(model, 'Generate the local Prisma client before running this verifier.');
assert.equal(model.dbName, 'rebalance_decisions');
fs.mkdirSync(artifact, { recursive: true });
let stage = 'container', ownedContainerRemoved = false;
const report = { scope: 'REBALANCE_DECISIONS_ONLY', startedAt: new Date().toISOString(), image,
  applicationDatabaseUsed: false, globalSchemaDriftChecked: false, migrationName, migrationChecksum: hashes[migrationName], checks: {} };

function redacted(value) {
  return String(value).split(secret).join('[REDACTED]').replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[ISOLATED_DB]');
}
function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, POSTGRES_PASSWORD: secret } });
  if (result.status !== 0 && !allowFailure) {
    fs.writeFileSync(path.join(artifact, stage + '-docker-error.log'), redacted((result.stdout ?? '') + (result.stderr ?? '')).slice(0, 20000));
    throw new Error('DOCKER_COMMAND_FAILED_' + stage);
  }
  return result;
}
function sql(database, statement, allowFailure = false) {
  assert.ok(databases.has(database), 'Only this run\'s disposable databases may be queried.');
  return docker(['exec', '-i', container, 'psql', '--no-psqlrc', '-U', 'postgres', '-d', database,
    '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=verbose', '--tuples-only', '--no-align', '-c', statement], allowFailure);
}
function query(database, statement) { return JSON.parse(sql(database, statement).stdout.trim()); }
function deploy(database, schema, name) {
  assert.ok(databases.has(database));
  assert.ok(localBase && /^postgresql:\/\/postgres:[a-f0-9]+@127\.0\.0\.1:\d+\/$/.test(localBase));
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, DATABASE_URL: localBase + database },
  });
  fs.writeFileSync(path.join(artifact, name + '.log'), redacted((result.stdout ?? '') + (result.stderr ?? '')));
  assert.equal(result.status, 0, 'Isolated migration deploy failed; see redacted ' + name + '.log');
}
function migrationHistory(database, names) {
  const rows = query(database, `SELECT COALESCE(json_agg(r ORDER BY r.migration_name),'[]'::json) FROM
    (SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations) r`);
  assert.deepEqual(rows.map(r => r.migration_name), names);
  for (const row of rows) { assert.ok(row.finished && !row.rolled_back); assert.equal(row.checksum, hashes[row.migration_name]); }
  return rows.length;
}
function inspectRebalance(database) {
  const columns = query(database, `SELECT json_agg(r ORDER BY r.ordinal_position) FROM
    (SELECT column_name,data_type,is_nullable,column_default,datetime_precision,ordinal_position FROM information_schema.columns
     WHERE table_schema='public' AND table_name='rebalance_decisions') r`);
  const scalarFields = model.fields.filter(x => x.kind !== 'object');
  assert.equal(columns.length, scalarFields.length);
  const types = { String: 'text', Json: 'jsonb', Float: 'double precision', DateTime: 'timestamp without time zone' };
  for (const field of scalarFields) {
    const column = columns.find(x => x.column_name === (field.dbName ?? field.name));
    assert.ok(column, 'Missing Prisma field ' + field.name);
    assert.equal(column.data_type, types[field.type], 'Wrong type for ' + field.name);
    assert.equal(column.is_nullable, field.isRequired ? 'NO' : 'YES', 'Wrong nullability for ' + field.name);
    if (field.type === 'DateTime') assert.equal(column.datetime_precision, 3);
  }
  assert.match(columns.find(x => x.column_name === 'createdAt').column_default, /CURRENT_TIMESTAMP/i);
  assert.match(columns.find(x => x.column_name === 'decision').column_default, /'PROPOSED'/);
  assert.equal(columns.find(x => x.column_name === 'id').column_default, null, 'UUIDs are generated by the Prisma client.');
  const indexes = query(database, `SELECT json_agg(r ORDER BY r.indexname) FROM
    (SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='rebalance_decisions') r`);
  assert.equal(indexes.length, 2);
  assert.match(indexes.find(x => x.indexname === 'rebalance_decisions_pkey').indexdef, /UNIQUE INDEX.*\(id\)/);
  assert.match(indexes.find(x => x.indexname === 'rebalance_decisions_userId_createdAt_idx').indexdef, /\("userId", "createdAt"\)/);
  const constraints = query(database, `SELECT json_agg(r ORDER BY r.conname) FROM
    (SELECT conname,contype,confdeltype,confupdtype,pg_get_constraintdef(oid) AS definition FROM pg_constraint
     WHERE conrelid='public.rebalance_decisions'::regclass) r`);
  const fk = constraints.find(x => x.conname === 'rebalance_decisions_userId_fkey');
  assert.equal(fk.confdeltype, 'c'); assert.equal(fk.confupdtype, 'c');
  assert.match(fk.definition, /FOREIGN KEY \("userId"\) REFERENCES users\(id\)/);
  const sources = constraints.find(x => x.conname === 'rebalance_decisions_source_check');
  const decisions = constraints.find(x => x.conname === 'rebalance_decisions_decision_check');
  for (const value of ['PROPOSAL', 'MONITOR']) assert.ok(sources.definition.includes("'" + value + "'"));
  for (const value of ['PROPOSED', 'ACCEPTED', 'DISMISSED']) assert.ok(decisions.definition.includes("'" + value + "'"));
  return { scalarColumns: scalarFields.length, indexes: indexes.length, ownerForeignKey: true, checkConstraints: 2 };
}
function fingerprints(database) {
  const tables = query(database, `SELECT COALESCE(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables
    WHERE schemaname='public' AND tablename NOT IN ('rebalance_decisions','_prisma_migrations')`);
  return Object.fromEntries(tables.map(table => {
    assert.match(table, /^[a-z_]+$/);
    return [table, query(database, `SELECT row_to_json(r) FROM
      (SELECT count(*)::integer AS count,md5(COALESCE(string_agg(t::text,'|' ORDER BY t::text),'')) AS digest FROM "${table}" t) r`)];
  }));
}
function schemaFingerprint(database) {
  return query(database, `SELECT to_json(md5(COALESCE(string_agg(r::text,'|' ORDER BY r.table_name,r.ordinal_position),''))) FROM
    (SELECT table_name,column_name,data_type,is_nullable,column_default,ordinal_position FROM information_schema.columns
     WHERE table_schema='public' AND table_name NOT IN ('rebalance_decisions','_prisma_migrations')) r`);
}
function insertUser(database, id) {
  sql(database, `INSERT INTO users(id,email,"passwordHash","fullName",status,"updatedAt")
    VALUES('${id}','rebalance-${id}@example.invalid','not-a-login','Synthetic migration sentinel','SUSPENDED',NOW())`);
}
function insertDecision(id, userId, source = 'PROPOSAL', decision = 'PROPOSED') {
  for (const value of [id, userId]) assert.match(value, /^[a-f0-9-]{36}$/);
  for (const value of [source, decision]) assert.match(value, /^[A-Z_]+$/);
  return `INSERT INTO rebalance_decisions(id,"userId",source,"oldWeights","targetWeights","newWeights",trigger,"bandPoints","costEstimate",trades,decision)
    VALUES('${id}','${userId}','${source}','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'AT_OR_ABOVE_BAND','5','0','[]'::jsonb,'${decision}')`;
}
function reject(database, statement, sqlState, constraint) {
  const result = sql(database, statement, true);
  assert.notEqual(result.status, 0, 'An invalid row was accepted.');
  assert.ok(result.stderr.includes(sqlState) && result.stderr.includes(constraint), 'Unexpected constraint failure.');
}

let localBase;
(async () => {
  docker(['run', '-d', '--name', container, '--label', label + '=' + marker, '-e', 'POSTGRES_PASSWORD',
    '-e', 'POSTGRES_DB=' + cleanDatabase, '-p', '127.0.0.1::5432', image]);
  const inspection = JSON.parse(docker(['inspect', container]).stdout)[0];
  assert.equal(inspection.Config.Labels[label], marker);
  const binding = inspection.NetworkSettings.Ports['5432/tcp'][0];
  assert.equal(binding.HostIp, '127.0.0.1'); assert.match(binding.HostPort, /^\d+$/);
  localBase = `postgresql://postgres:${secret}@127.0.0.1:${binding.HostPort}/`;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], true).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Disposable PostgreSQL did not become ready.');
  sql(cleanDatabase, 'CREATE EXTENSION vector');
  sql(cleanDatabase, 'CREATE DATABASE ' + upgradeDatabase);
  sql(upgradeDatabase, 'CREATE EXTENSION vector');

  stage = 'clean';
  deploy(cleanDatabase, schemaPath, 'clean-all-migrations');
  report.checks.cleanMigrations = migrationHistory(cleanDatabase, migrationNames);
  report.checks.cleanTable = inspectRebalance(cleanDatabase);
  console.log(JSON.stringify({ stage, status: 'PASS', migrations: report.checks.cleanMigrations }));

  stage = 'additive-upgrade';
  const prior = path.join(artifact, 'prior'); fs.mkdirSync(path.join(prior, 'migrations'), { recursive: true });
  fs.copyFileSync(schemaPath, path.join(prior, 'schema.prisma'));
  fs.copyFileSync(path.join(migrationsPath, 'migration_lock.toml'), path.join(prior, 'migrations/migration_lock.toml'));
  const previous = migrationNames.slice(0, -1);
  for (const name of previous) {
    fs.mkdirSync(path.join(prior, 'migrations', name));
    fs.copyFileSync(path.join(migrationsPath, name, 'migration.sql'), path.join(prior, 'migrations', name, 'migration.sql'));
  }
  deploy(upgradeDatabase, path.join(prior, 'schema.prisma'), 'upgrade-prior-migrations');
  assert.equal(migrationHistory(upgradeDatabase, previous), previous.length);
  const owner = randomUUID(); insertUser(upgradeDatabase, owner);
  const before = fingerprints(upgradeDatabase), beforeSchema = schemaFingerprint(upgradeDatabase);
  deploy(upgradeDatabase, schemaPath, 'upgrade-new-migration');
  report.checks.upgradeMigrations = migrationHistory(upgradeDatabase, migrationNames);
  assert.deepEqual(fingerprints(upgradeDatabase), before);
  assert.equal(schemaFingerprint(upgradeDatabase), beforeSchema);
  report.checks.legacyTablesPreserved = Object.keys(before).length;
  report.checks.upgradeTable = inspectRebalance(upgradeDatabase);
  console.log(JSON.stringify({ stage, status: 'PASS', legacyTablesPreserved: report.checks.legacyTablesPreserved }));

  stage = 'constraints-and-idempotence';
  const decision = randomUUID(); sql(upgradeDatabase, insertDecision(decision, owner));
  const row = query(upgradeDatabase, `SELECT row_to_json(r) FROM (SELECT * FROM rebalance_decisions WHERE id='${decision}') r`);
  assert.equal(row.decision, 'PROPOSED'); assert.ok(row.createdAt);
  for (const key of ['planVersionId', 'probabilityBefore', 'probabilityAfter', 'note']) assert.equal(row[key], null);
  sql(upgradeDatabase, `UPDATE rebalance_decisions SET source='MONITOR',decision='ACCEPTED',"probabilityBefore"=0.9,"probabilityAfter"=0.95 WHERE id='${decision}'`);
  sql(upgradeDatabase, `UPDATE rebalance_decisions SET decision='DISMISSED' WHERE id='${decision}'`);
  reject(upgradeDatabase, insertDecision(randomUUID(), randomUUID()), '23503', 'rebalance_decisions_userId_fkey');
  reject(upgradeDatabase, insertDecision(randomUUID(), owner, 'INVALID_SOURCE'), '23514', 'rebalance_decisions_source_check');
  reject(upgradeDatabase, insertDecision(randomUUID(), owner, 'PROPOSAL', 'INVALID_DECISION'), '23514', 'rebalance_decisions_decision_check');
  const priorDecision = query(upgradeDatabase, `SELECT row_to_json(r) FROM (SELECT * FROM rebalance_decisions WHERE id='${decision}') r`);
  sql(upgradeDatabase, migrationSql);
  assert.deepEqual(query(upgradeDatabase, `SELECT row_to_json(r) FROM (SELECT * FROM rebalance_decisions WHERE id='${decision}') r`), priorDecision);
  assert.deepEqual(inspectRebalance(upgradeDatabase), report.checks.upgradeTable);
  assert.deepEqual(fingerprints(upgradeDatabase), before);
  const cascadeOwner = randomUUID(), cascadeDecision = randomUUID(); insertUser(upgradeDatabase, cascadeOwner);
  sql(upgradeDatabase, insertDecision(cascadeDecision, cascadeOwner));
  sql(upgradeDatabase, `DELETE FROM users WHERE id='${cascadeOwner}'`);
  assert.equal(query(upgradeDatabase, `SELECT count(*)::integer FROM rebalance_decisions WHERE id='${cascadeDecision}'`), 0);
  assert.deepEqual(fingerprints(upgradeDatabase), before);
  Object.assign(report.checks, { insertAndNullableFields: true, validSourceAndDecisions: true, invalidOwnerRejected: true,
    invalidSourceRejected: true, invalidDecisionRejected: true, repeatMigrationPreservesRows: true, ownerCascade: true });
  console.log(JSON.stringify({ stage, status: 'PASS' }));
  report.status = 'PASS';
})().catch(error => {
  report.status = 'FAIL'; report.failedStage = stage;
  report.error = redacted(error.message).slice(0, 1500);
  console.error(JSON.stringify({ stage, status: 'FAIL', error: report.error }));
  process.exitCode = 1;
}).finally(() => {
  const inspection = docker(['inspect', container], true);
  if (inspection.status === 0) {
    const current = JSON.parse(inspection.stdout)[0];
    if (current.Config.Labels[label] === marker) ownedContainerRemoved = docker(['rm', '-f', '-v', container], true).status === 0;
  } else ownedContainerRemoved = true;
  report.ownedContainerAndVolumesRemoved = ownedContainerRemoved;
  if (!ownedContainerRemoved) { report.status = 'FAIL'; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, ownedContainerAndVolumesRemoved: ownedContainerRemoved, report: path.relative(process.cwd(), reportFile) }));
});
