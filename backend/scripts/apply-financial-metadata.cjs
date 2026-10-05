require('dotenv').config();const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process'),{PrismaClient}=require('@prisma/client');
const db=new PrismaClient({log:[]}),target='202610050010_complete_financial_metadata',root=path.resolve(__dirname,'../prisma/migrations');
const fail=code=>{throw Object.assign(new Error(code),{code});},sha=s=>createHash('sha256').update(s).digest('hex');
const fingerprint=async client=>{const out={};for(const table of ['financial_profiles','retirement_goals','retirement_plans','plan_versions','assumption_set_versions','knowledge_sources','knowledge_chunks','ai_conversations','ai_messages','partners','partner_products','consultations'])
  out[table]=await client.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) AS digest FROM ${table} t`);return out;};
(async()=>{const local=fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
  const applied=await db.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at');
  for(const row of applied){if(!row.finished_at||row.rolled_back_at||!local.includes(row.migration_name))fail('MIGRATION_HISTORY_REVIEW_REQUIRED');if(sha(fs.readFileSync(path.join(root,row.migration_name,'migration.sql')))!==row.checksum)fail('MIGRATION_CHECKSUM_MISMATCH');}
  const pending=local.filter(n=>!applied.some(r=>r.migration_name===n));
  if(!pending.length&&applied.some(r=>r.migration_name===target)){console.log(JSON.stringify({migration:target,status:'ALREADY_APPLIED_CHECKSUM_VERIFIED'}));return;}
  if(pending.length!==1||pending[0]!==target)fail('EXPECTED_ONLY_FINANCIAL_METADATA_MIGRATION');
  const before=await fingerprint(db),sql=fs.readFileSync(path.join(root,target,'migration.sql'),'utf8'),rollback=new Error('EXPECTED_ROLLBACK');
  try{await db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");for(const statement of sql.split('-- statement-break').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
    if(JSON.stringify(await fingerprint(tx))!==JSON.stringify(before))fail('EXISTING_DATA_CHANGED');throw rollback;},{timeout:30000});}catch(e){if(e!==rollback)throw e;}
  console.log(JSON.stringify({preview:'PASS_ROLLED_BACK',pending,existingConversationCount:before.ai_conversations[0].count,profilesPreserved:before.financial_profiles[0].count}));
  if(!process.argv.includes('--apply'))return;await db.$disconnect();
  const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env:process.env,encoding:'utf8',timeout:60000});if(result.status!==0)fail('MIGRATION_DEPLOY_FAILED');
  if(JSON.stringify(await fingerprint(db))!==JSON.stringify(before))fail('EXISTING_DATA_CHANGED');
  const rows=await db.$queryRaw`SELECT checksum FROM _prisma_migrations WHERE migration_name=${target} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  if(rows.length!==1||rows[0].checksum!==sha(sql))fail('MIGRATION_COMPLETION_MISSING');console.log(JSON.stringify({applied:true,migration:target,existingDataPreserved:true}));
})().catch(e=>{console.error(JSON.stringify({code:e.code??e.errorCode??'FINANCIAL_METADATA_MIGRATION_FAILED'}));process.exitCode=1;}).finally(()=>db.$disconnect());
