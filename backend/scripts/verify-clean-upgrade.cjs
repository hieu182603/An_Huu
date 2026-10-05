// Disposable, locally bound Docker PostgreSQL only. No .env or application DB fallback.
const {spawnSync}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
const marker=randomUUID(),name='anhuu-migration-'+marker,secret=randomBytes(32).toString('hex'),artifact=path.resolve('.cache/migration-'+marker);
const image='pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a';
fs.mkdirSync(artifact,{recursive:true});let stage='container',started=false,clients=[],report={};
function docker(args,allowFail=false){const r=spawnSync('docker',args,{encoding:'utf8',timeout:60000,env:{...process.env,POSTGRES_PASSWORD:secret}});if(r.status!==0&&!allowFail)throw new Error('DOCKER_COMMAND_FAILED');return r;}
function cli(args,url,label,allowFail=false){const r=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),...args],{encoding:'utf8',timeout:90000,env:{...process.env,DATABASE_URL:url}});fs.writeFileSync(path.join(artifact,label+'.log'),(r.stdout+r.stderr).split(url).join('[ISOLATED_DB]').split(secret).join('[REDACTED]'));if(r.status!==0&&!allowFail)throw new Error('PRISMA_'+label+'_FAILED');return r;}
const client=url=>{const db=new PrismaClient({datasources:{db:{url}},log:[]});clients.push(db);return db;};
async function inspect(db,url){const rows=await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
 const dirs=fs.readdirSync('prisma/migrations',{withFileTypes:true}).filter(v=>v.isDirectory()).map(v=>v.name).sort();assert.equal(rows.length,dirs.length);
 for(const r of rows){assert.ok(r.finished_at&&!r.rolled_back_at);assert.equal(r.checksum,createHash('sha256').update(fs.readFileSync(path.join('prisma/migrations',r.migration_name,'migration.sql'))).digest('hex'));}
 const diff=cli(['migrate','diff','--from-schema-datasource','prisma/schema.prisma','--to-schema-datamodel','prisma/schema.prisma','--script'],url,'diff-'+stage);assert.equal(diff.stdout.replace(/--[^\n]*/g,'').trim(),'');return rows.length;}
(async()=>{docker(['run','-d','--name',name,'--label','anhuu.migration-audit='+marker,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=anhuu_clean_test','-p','127.0.0.1::5432',image]);started=true;
 const inspection=JSON.parse(docker(['inspect',name]).stdout)[0];assert.equal(inspection.Config.Labels['anhuu.migration-audit'],marker);
 const binding=inspection.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');const base=`postgresql://postgres:${secret}@127.0.0.1:${binding.HostPort}/`;
 const cleanUrl=base+'anhuu_clean_test',db=client(cleanUrl);
 for(let i=0;i<40;i++){if(docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],true).status===0)break;await new Promise(r=>setTimeout(r,500));}
 await db.$queryRaw`SELECT 1`;await db.$executeRawUnsafe('CREATE DATABASE anhuu_bare_test');await db.$executeRawUnsafe('CREATE DATABASE anhuu_upgrade_test');
 stage='bare';const bare=cli(['migrate','deploy'],base+'anhuu_bare_test','without-vector',true);assert.notEqual(bare.status,0);assert.ok((bare.stdout+bare.stderr).includes('vector'));report.vectorPrerequisiteConfirmed=true;
 stage='clean';const prepared=spawnSync(process.execPath,['scripts/prepare-test-db.cjs'],{encoding:'utf8',timeout:90000,env:{...process.env,TEST_DATABASE_URL:cleanUrl}});
 fs.writeFileSync(path.join(artifact,'clean.log'),(prepared.stdout+prepared.stderr).split(cleanUrl).join('[ISOLATED_DB]').split(secret).join('[REDACTED]'));assert.equal(prepared.status,0);report.testPreparationPassed=true;
 report.cleanMigrations=await inspect(db,cleanUrl);console.log(JSON.stringify({stage,status:'PASS',migrations:report.cleanMigrations}));
 stage='upgrade';const upgradeUrl=base+'anhuu_upgrade_test',up=client(upgradeUrl);await up.$executeRawUnsafe('CREATE EXTENSION vector');
 const prior=path.join(artifact,'prior');fs.mkdirSync(path.join(prior,'migrations'),{recursive:true});fs.copyFileSync('prisma/schema.prisma',path.join(prior,'schema.prisma'));fs.copyFileSync('prisma/migrations/migration_lock.toml',path.join(prior,'migrations/migration_lock.toml'));
 for(const d of fs.readdirSync('prisma/migrations',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort().slice(0,4)){fs.mkdirSync(path.join(prior,'migrations',d));fs.copyFileSync(path.join('prisma/migrations',d,'migration.sql'),path.join(prior,'migrations',d,'migration.sql'));}
 cli(['migrate','deploy','--schema',path.join(prior,'schema.prisma')],upgradeUrl,'prior-four');
 const uid=randomUUID(),pid=randomUUID(),cid=randomUUID(),mid=randomUUID(),partner=randomUUID();
 await up.$executeRaw`INSERT INTO users(id,email,"passwordHash","fullName",status,"updatedAt") VALUES(${uid},'upgrade@example.invalid','fixture-not-login','Legacy fixture','SUSPENDED',NOW())`;
 await up.$executeRaw`INSERT INTO financial_profiles(id,"userId","profileData","updatedAt") VALUES(${pid},${uid},'{"legacy":"preserve-exactly","unknown":null}'::jsonb,NOW())`;
 await up.$executeRaw`INSERT INTO ai_conversations(id,"userId",title,"createdAt","updatedAt") VALUES(${cid},${uid},'Legacy conversation','2026-01-01',NOW())`;
 await up.$executeRaw`INSERT INTO ai_messages(id,"conversationId",role,content) VALUES(${mid},${cid},'user','Legacy message preserved')`;
 await up.$executeRaw`INSERT INTO partners(id,name,type,"updatedAt") VALUES(${partner},'Legacy partner','BANK',NOW())`;
 const before=await up.$queryRaw`SELECT "profileData", "schemaVersion", revision FROM financial_profiles WHERE id=${pid}`;
 cli(['migrate','deploy'],upgradeUrl,'upgrade-to-current');report.upgradeMigrations=await inspect(up,upgradeUrl);
 assert.deepEqual(await up.$queryRaw`SELECT "profileData", "schemaVersion", revision FROM financial_profiles WHERE id=${pid}`,before);
 assert.equal((await up.aiConversation.findUniqueOrThrow({where:{id:cid}})).expiresAt.toISOString(),'2026-01-31T00:00:00.000Z');assert.equal(await up.aiMessage.count({where:{id:mid,content:'Legacy message preserved'}}),1);
 assert.equal((await up.partner.findUniqueOrThrow({where:{id:partner}})).isVisible,false);assert.equal(await up.aiPrivacy.count(),0);assert.equal(await up.notificationPreference.count(),0);report.legacyPreserved=true;console.log(JSON.stringify({stage,status:'PASS',migrations:report.upgradeMigrations,legacyPreserved:true}));
 stage='integration';const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.integration.config.mts'],{encoding:'utf8',timeout:120000,env:{...process.env,TEST_DATABASE_URL:cleanUrl,DATABASE_URL:cleanUrl}});
 fs.writeFileSync(path.join(artifact,'integration.log'),(result.stdout+result.stderr).split(secret).join('[REDACTED]'));report.integrationPassed=result.status===0;console.log(JSON.stringify({stage,status:result.status===0?'PASS':'FAIL'}));if(result.status!==0)process.exitCode=1;
 stage='backup-restore';
 const fingerprints=async c=>{const tables=await c.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,out={};
  for(const {tablename} of tables){assert.match(tablename,/^[a-z_]+$/);out[tablename]=await c.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(t::text,'|' ORDER BY t::text),'')) AS digest FROM "${tablename}" t`);}return out;};
 const backupBefore=await fingerprints(up);
 docker(['exec',name,'pg_dump','-U','postgres','-d','anhuu_upgrade_test','--format=custom','--no-owner','--no-acl','--file=/tmp/anhuu-restore.dump']);
 await db.$executeRawUnsafe('CREATE DATABASE anhuu_restore_test');
 docker(['exec',name,'pg_restore','-U','postgres','-d','anhuu_restore_test','--exit-on-error','--no-owner','--no-acl','/tmp/anhuu-restore.dump']);
 const restored=client(base+'anhuu_restore_test');assert.deepEqual(await fingerprints(restored),backupBefore);
 report.backupRestoreTables=Object.keys(backupBefore).length;report.backupRestoreExact=true;
 // The real executable starts with only DB config, never the email/outbox worker.
 const retentionEnv={...process.env,DATABASE_URL:base+'anhuu_restore_test',SMTP_HOST:'',SMTP_USER:'',SMTP_PASSWORD:'',
  JWT_SECRET:'',JWT_REFRESH_SECRET:'',OUTBOX_ENCRYPTION_KEY:'',GEMINI_API_KEY:'',AI_PROVIDER:'none'};
 for(const execute of [false,true]){const p=spawnSync(process.execPath,['dist/retention.js',...(execute?['--execute']:[])],{encoding:'utf8',timeout:30000,env:retentionEnv});
  assert.equal(p.status,0);const result=JSON.parse(p.stdout.trim());assert.equal(result.event,'retention.completed');
  assert.equal(result.code,execute?'COMPLETE':'DRY_RUN');assert.equal(result.deleted,execute?1:0);
  assert.equal(await restored.aiConversation.count({where:{id:cid}}),execute?0:1);assert.equal(await restored.aiMessage.count({where:{conversationId:cid}}),execute?0:1);
 }
 report.restoredExpiryRemovedByStandaloneJob=true;
 assert.equal(await restored.financialProfile.count({where:{id:pid}}),1);assert.equal(await restored.partner.count({where:{id:partner}}),1);
 console.log(JSON.stringify({stage,status:'PASS',tables:report.backupRestoreTables,restoredExpiryRemoved:true,standaloneWithoutMailOrAi:true}));
 stage='retention';require('ts-node/register');const {purgeExpiredAi}=require('../src/modules/ai/service');assert.equal(await purgeExpiredAi(up),1);assert.equal(await up.aiMessage.count({where:{conversationId:cid}}),0);assert.equal(await up.aiConversation.count({where:{id:cid}}),0);report.expiredHistoryAndContextRemoved=true;
 const live=await up.aiConversation.create({data:{userId:uid,expiresAt:new Date(Date.now()+86400000)}});assert.equal(await purgeExpiredAi(up),0);assert.equal(await up.aiConversation.count({where:{id:live.id}}),1);report.unexpiredHistoryPreserved=true;
 fs.writeFileSync(path.join(artifact,'result.json'),JSON.stringify(report,null,2));
 if(report.integrationPassed){const migrations=Object.fromEntries(fs.readdirSync('prisma/migrations',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>[d.name,createHash('sha256').update(fs.readFileSync(path.join('prisma/migrations',d.name,'migration.sql'))).digest('hex')]));
  fs.writeFileSync(path.resolve('.cache/latest-clean-upgrade.json'),JSON.stringify({verifiedAt:new Date().toISOString(),schemaHash:createHash('sha256').update(fs.readFileSync('prisma/schema.prisma')).digest('hex'),migrations,report},null,2));}
 console.log(JSON.stringify({stage,status:'PASS',report,artifact:path.relative(process.cwd(),artifact)}));
})().catch(e=>{console.error(JSON.stringify({stage,code:e.code??e.errorCode??(e.name==='Error'?e.message:'MIGRATION_AUDIT_FAILED'),type:e.name}));process.exitCode=1;}).finally(async()=>{
 for(const db of clients)await db.$disconnect().catch(()=>{});
 if(started){const current=JSON.parse(docker(['inspect',name]).stdout)[0];assert.equal(current.Config.Labels['anhuu.migration-audit'],marker);docker(['rm','-f','-v',name]);console.log(JSON.stringify({temporaryContainerRemoved:true}));}
});
