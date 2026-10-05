// Exactly one additive migration; defaults to a rolled-back DDL rehearsal.
// --apply additionally requires current clean/upgrade/integration evidence.
require('dotenv').config();
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process'),{PrismaClient}=require('@prisma/client');
const db=new PrismaClient({log:[]}),target='202610050011_pension_rules_history',root=path.resolve('prisma/migrations');
const sha=v=>createHash('sha256').update(v).digest('hex'),fail=code=>{throw Object.assign(new Error(code),{code});};
const fingerprint=async tx=>{const tables=await tx.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','legal_rule_set_versions','social_insurance_history_versions','pension_estimates') ORDER BY tablename`,result={};
 for(const {tablename} of tables){if(!/^[a-z_]+$/.test(tablename))fail('UNEXPECTED_TABLE_NAME');result[tablename]=await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(t::text,'|' ORDER BY t::text),'')) AS digest FROM "${tablename}" t`);}return result;};
(async()=>{
 const local=fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
 const hashes=Object.fromEntries(local.map(n=>[n,sha(fs.readFileSync(path.join(root,n,'migration.sql')))]));
 const applied=await db.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at');
 for(const row of applied)if(!row.finished_at||row.rolled_back_at||hashes[row.migration_name]!==row.checksum)fail('MIGRATION_HISTORY_REVIEW_REQUIRED');
 const pending=local.filter(n=>!applied.some(r=>r.migration_name===n));
 if(!pending.length&&applied.some(r=>r.migration_name===target)){console.log(JSON.stringify({migration:target,status:'ALREADY_APPLIED_CHECKSUM_VERIFIED'}));return;}
 if(pending.length!==1||pending[0]!==target)fail('EXPECTED_ONLY_PENSION_MIGRATION');
 const sql=fs.readFileSync(path.join(root,target,'migration.sql'),'utf8');
 if(/\b(DROP|TRUNCATE|INSERT\s+INTO|DELETE\s+FROM)\b/i.test(sql))fail('NON_ADDITIVE_MIGRATION_REVIEW_REQUIRED');
 const rollback=new Error('EXPECTED_ROLLBACK');let tableCount=0;
 try{await db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");const before=await fingerprint(tx);tableCount=Object.keys(before).length;
  for(const statement of sql.split('-- statement-break').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  if(JSON.stringify(await fingerprint(tx))!==JSON.stringify(before))fail('EXISTING_DATA_CHANGED');throw rollback;
 },{timeout:60000,isolationLevel:'RepeatableRead'});}catch(e){if(e!==rollback)throw e;}
 console.log(JSON.stringify({migration:target,preview:'PASS_ROLLED_BACK',existingTablesPreserved:tableCount}));
 if(!process.argv.includes('--apply'))return;
 const proofPath=path.resolve('.cache/latest-clean-upgrade.json');if(!fs.existsSync(proofPath))fail('CLEAN_UPGRADE_EVIDENCE_REQUIRED');
 const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
 if(proof.schemaHash!==sha(fs.readFileSync('prisma/schema.prisma'))||JSON.stringify(proof.migrations)!==JSON.stringify(hashes)||
 !proof.report.integrationPassed||!proof.report.legacyPreserved||proof.report.cleanMigrations!==local.length||proof.report.upgradeMigrations!==local.length)fail('CLEAN_UPGRADE_EVIDENCE_STALE');
 const before=await db.$transaction(fingerprint,{timeout:60000,isolationLevel:'RepeatableRead'});await db.$disconnect();
 const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{encoding:'utf8',timeout:90000,env:process.env});
 if(result.status!==0){const output=(result.stdout||'')+(result.stderr||'');console.log(JSON.stringify({stage:'deploy',exitCode:result.status,signal:result.signal,errorCode:result.error?.code,
  diagnosticCodes:[...new Set(output.match(/\bP\d{4}\b|EPERM|EACCES|ENOENT|ETIMEDOUT|ECONNREFUSED/g)||[])]}));fail('PENSION_MIGRATION_DEPLOY_FAILED');}
 const completed=await db.$queryRaw`SELECT checksum FROM _prisma_migrations WHERE migration_name=${target} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
 if(completed.length!==1||completed[0].checksum!==hashes[target])fail('MIGRATION_COMPLETION_MISSING');
 const after=await db.$transaction(fingerprint,{timeout:60000,isolationLevel:'RepeatableRead'});
 if(JSON.stringify(before)!==JSON.stringify(after))fail('CONCURRENT_DATA_CHANGE_REVIEW_REQUIRED');
 console.log(JSON.stringify({migration:target,applied:true,existingDataPreserved:true}));
})().catch(e=>{console.error(JSON.stringify({code:e.code??e.errorCode??'PENSION_MIGRATION_FAILED'}));process.exitCode=1;}).finally(()=>db.$disconnect());
