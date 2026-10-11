// Runs the EXACT reviewed SQL only on a fresh, locally bound, owned Docker DB.
// Never reads .env or falls back to DATABASE_URL. No production import mode.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {randomUUID,randomBytes}=require('node:crypto');
const {root,output,sha,identifier,literal}=require('./prepare-reviewed-dataset.cjs');
require('ts-node').register({transpileOnly:true,project:path.join(root,'tsconfig.json')});
const marker=randomUUID(),container='anhuu-data-review-'+marker,secret=randomBytes(32).toString('hex');
const image='pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a';
const sqlPath=path.join(root,'seed-data','seed-datafull.sql');
const sql=fs.readFileSync(sqlPath,'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(output,'review-manifest.json'),'utf8'));
const expected=JSON.parse(fs.readFileSync(path.join(output,'reviewed-dataset.private.json'),'utf8'));
const original=JSON.parse(fs.readFileSync(path.join(output,'source-snapshot.private.json'),'utf8'));
let stage='integrity',started=false,db,checks=[];
const pass=(name,details={})=>{checks.push({name,...details});console.log(JSON.stringify({check:name,status:'PASS',...details}));};
function docker(args,options={}){return spawnSync('docker',args,{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,env:{...process.env,POSTGRES_PASSWORD:secret},...options});}
function runSql(body){return docker(['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','anhuu_reviewed_data_test'],{input:body});}
function normalized(c,v){if(v===null)return null;if(c.data_type==='jsonb')return require('../src/common/digest').digest(JSON.parse(v));
 if(c.data_type.startsWith('timestamp'))return new Date(c.data_type==='timestamp without time zone'&&!/[zZ]$/.test(v)?v+'Z':v).toISOString();if(c.data_type==='numeric')return new (require('@prisma/client').Prisma.Decimal)(v).toFixed();return v;}
async function assertEmpty(){for(const name of Object.keys(expected.tables)){const [r]=await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM ${identifier(name)}`);assert.equal(r.n,0);}}
async function fingerprints(){const answer={};for(const name of Object.keys(expected.tables)){answer[name]=await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${identifier(name)} t`);}return answer;}
async function verifyRows(){
 for(const [name,t]of Object.entries(expected.tables)){
  const pairs=t.columns.map(c=>`${literal(c.column_name)},${identifier(c.column_name)}::text`).join(',');
  const actual=(await db.$queryRawUnsafe(`SELECT jsonb_build_object(${pairs}) AS value FROM ${identifier(name)}`)).map(r=>r.value);
  const norm=rows=>rows.map(row=>JSON.stringify(t.columns.map(c=>normalized(c,row[c.column_name])))).sort();
  // Avoid printing row contents on assertion failure (password hashes/PII).
  if(JSON.stringify(norm(actual))!==JSON.stringify(norm(t.rows)))throw Error('ROUNDTRIP_MISMATCH_'+name.toUpperCase());
 }
}
(async()=>{
 assert.equal(sha(sql),manifest.sqlSha256);assert.equal(sha(JSON.stringify(expected,null,2)+'\n'),manifest.datasetHash);
 assert.ok(!/\b(TRUNCATE|DELETE\s+FROM|DISABLE\s+TRIGGER|DROP\s+TABLE)\b/i.test(sql));
 pass('artifact_hash_and_no_reset_statements');
 stage='docker';const launched=docker(['run','-d','--name',container,'--label','anhuu.data-review='+marker,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=anhuu_reviewed_data_test','-p','127.0.0.1::5432',image]);
 if(launched.status!==0)throw Error('DOCKER_START_FAILED');started=true;
 const inspected=JSON.parse(docker(['inspect',container]).stdout)[0];assert.equal(inspected.Config.Labels['anhuu.data-review'],marker);
 const binding=inspected.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
 const localUrl=`postgresql://postgres:${secret}@127.0.0.1:${binding.HostPort}/anhuu_reviewed_data_test`;
 for(let i=0;i<50;i++){if(docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0)break;await new Promise(r=>setTimeout(r,300));}
 const {PrismaClient}=require('@prisma/client');db=new PrismaClient({datasources:{db:{url:localUrl}},log:[]});
 stage='migrations';const migrate=spawnSync(process.execPath,['scripts/prepare-test-db.cjs'],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,DATABASE_URL:localUrl,TEST_DATABASE_URL:localUrl}});
 if(migrate.status!==0){fs.writeFileSync(path.join(output,'migration-test.log'),(migrate.stdout+migrate.stderr).split(localUrl).join('[TEST_DB]').split(secret).join('[REDACTED]'));throw Error('ISOLATED_MIGRATION_FAILED');}pass('fresh_database_13_migrations');
 stage='approval-guard';const denied=runSql(sql);assert.notEqual(denied.status,0);assert.ok(denied.stderr.includes('DATASET_REVIEW_APPROVAL_REQUIRED'));await assertEmpty();pass('no_approval_rejected_without_writes');
 const wrong=runSql("SET anhuu.data_approval='wrong';\n"+sql);assert.notEqual(wrong.status,0);await assertEmpty();pass('wrong_approval_rejected_without_writes');
 const approve=`SET anhuu.data_approval=${literal(manifest.datasetHash)};\n`;
 stage='migration-guard';const migration=manifest&&expected.migrations[0];
 await db.$executeRawUnsafe(`UPDATE _prisma_migrations SET checksum='mismatch' WHERE migration_name=${literal(migration.migration_name)}`);
 const badSchema=runSql(approve+sql);assert.notEqual(badSchema.status,0);assert.ok(badSchema.stderr.includes('MIGRATION_CHECKSUM_MISMATCH'));await assertEmpty();
 await db.$executeRawUnsafe(`UPDATE _prisma_migrations SET checksum=${literal(migration.checksum)} WHERE migration_name=${literal(migration.migration_name)}`);pass('schema_mismatch_rejected_without_writes');
 stage='atomic-rollback';const failLate=runSql(approve+sql.replace('\nCOMMIT;','\nSELECT 1/0;\nCOMMIT;'));
 assert.notEqual(failLate.status,0);assert.ok(failLate.stderr.includes('division by zero'));await assertEmpty();pass('late_failure_rolls_back_all_tables');
 stage='import';const loaded=runSql(approve+sql);
 if(loaded.status!==0){fs.writeFileSync(path.join(output,'import-error.private.log'),loaded.stderr,{mode:0o600});throw Error('SQL_IMPORT_FAILED_PRIVATE_LOG');}
 await verifyRows();pass('exact_sql_import_and_all_row_roundtrip',{tables:40,rows:manifest.targetRows});
 stage='existing-data-guard';const before=await fingerprints();const repeated=runSql(approve+sql);assert.notEqual(repeated.status,0);assert.ok(repeated.stderr.includes('TARGET_MUST_BE_EMPTY'));assert.deepEqual(await fingerprints(),before);pass('repeat_nonempty_import_rejected_data_unchanged');
 stage='preservation';
 for(const table of ['users','refresh_tokens','verification_tokens','outbox_events','processed_events','login_logs','system_logs','notifications','support_messages','consultations','system_settings','ai_privacy','onboarding_drafts'])assert.equal(JSON.stringify(expected.tables[table].rows),JSON.stringify(original.tables[table].rows));
 for(const row of original.tables.financial_profiles.rows){const next=expected.tables.financial_profiles.rows.find(r=>r.id===row.id);assert.equal(next.profileData,row.profileData);assert.equal(next.legacyProfileData,row.legacyProfileData);for(const f of ['netWorth','targetFund','projectedFund','monthlySavings','fundingGap'])assert.equal(next[f],row[f]);}
 pass('account_credentials_history_and_financial_inputs_preserved');
 require('ts-node').register({transpileOnly:true,project:path.join(root,'tsconfig.json')});
 const {ProfileService}=require('../src/modules/profiles/service'),{FinancialService}=require('../src/modules/financial/service');
 const profile=new ProfileService(db),financial=new FinancialService(db);
 for(const p of await db.financialProfile.findMany()){const read=await profile.getProfile(p.userId);assert.equal(read.asOfDate.toISOString().slice(0,10),read.data.valuationDate);assert.ok(await financial.getGoal(p.userId));}
 pass('50_profiles_and_goals_read_through_current_services');
 const {AssumptionsService}=require('../src/modules/assumptions/service'),{PortfoliosService}=require('../src/modules/portfolios/service');
 const {validateConfiguration}=require('../src/modules/assumptions/series'),{validatePortfolioPolicy}=require('../src/modules/portfolios/engine');
 const a=new AssumptionsService(db),p=new PortfoliosService(db);
 const ar=await db.assumptionSetVersion.findFirst({where:{modelCode:'assumption-series-v2'}}),pr=await db.assumptionSetVersion.findFirst({where:{modelCode:'portfolio-policy-v1'}});
 const av=await a.get(ar.id),pv=await p.get(pr.id);assert.equal(validateConfiguration(av.data).status,'VALID');assert.equal(validatePortfolioPolicy(pv.data,av.data).status,'VALID');
 assert.equal(av.status,'DRAFT');assert.equal(pv.status,'DRAFT');assert.equal((await a.list({page:1,limit:20},true)).total,0);pass('assumption_shapes_valid_unverified_publication_withheld');
 const {LegalRulesService}=require('../src/modules/pensions/legal-service'),{validateLegalDocument}=require('../src/modules/pensions/legal-validation');
 const admin=await db.user.findFirst({where:{role:'ADMIN'}});const legal=new LegalRulesService(db);let golden=0;
 for(const row of (await legal.list(admin.id)).items){assert.equal(row.status,'DRAFT');const v=validateLegalDocument(row.draft.document);assert.ok(v.valid);golden+=v.coverage.reduce((n,c)=>n+c.cases.length,0);assert.equal(row.review,null);assert.equal(row.publishedAt,null);}
 pass('8_legal_drafts_integrity_and_golden_cases',{cases:golden});
 const {KnowledgeService}=require('../src/modules/ai/knowledge');const k=new KnowledgeService(db);
 for(const row of await db.knowledgeSource.findMany()){const v=await k.get(row.id);assert.equal(v.indexedHash,v.contentHash);assert.equal(v.isApproved,false);
  const chunks=await db.knowledgeChunk.findMany({where:{sourceId:row.id},orderBy:{chunkIndex:'asc'}});assert.equal(chunks.map(c=>c.content).join(''),row.rawContent);
  for(const c of chunks){assert.equal(c.metadata.sourceHash,v.contentHash);assert.equal(c.metadata.method,'LEXICAL_V1');}}
 assert.deepEqual(await k.retrieve(db,'bảo hiểm xã hội'),[]);pass('7_knowledge_sources_index_hashes_and_unapproved_retrieval_guard');
 const {ContentService,normalized}=require('../src/modules/content/service');const content=new ContentService(db);
 for(const article of await db.article.findMany()){assert.equal(article.searchText,normalized([article.title,article.excerpt,article.content,article.category].join(' ')));assert.equal(article.status,'DRAFT');assert.equal(article.publishedAt,null);}
 assert.ok((await content.list({page:1,limit:20,sortBy:'updatedAt',order:'desc',kind:'ARTICLE',search:'phan bo'},true)).total>0);pass('draft_article_search_accents_and_publication_state');
 const {CatalogService}=require('../src/modules/catalog/service');const cat=new CatalogService(db);assert.equal((await cat.products({page:1,limit:20,sortBy:'name',order:'asc',search:''},false)).total,0);pass('catalog_unreviewed_products_stay_hidden');
 // A quoted string + a large decimal must round-trip in PostgreSQL, independent
 // of the current snapshot values. Test writes remain in this disposable DB.
 const tricky="Dữ liệu thử 'quote' \\ newline\n$tag$;",sample=await db.$queryRawUnsafe(`SELECT ${literal(tricky)}::text AS t,${literal('9999999999999999.99')}::numeric(18,2)::text AS n`);
 assert.equal(sample[0].t,tricky);assert.equal(sample[0].n,'9999999999999999.99');pass('unicode_quotes_backslashes_and_decimal_precision');
 const report={checkedAt:new Date().toISOString(),status:'PASS',sqlSha256:manifest.sqlSha256,datasetHash:manifest.datasetHash,
  sourceDatabaseWrites:0,environment:'OWNED_DISPOSABLE_POSTGRESQL_PGVECTOR',checks,legalGoldenCases:golden};
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
})().catch(error=>{console.error(JSON.stringify({stage,code:/^[A-Z0-9_]+$/.test(error.message)?error.message:error.code||error.name||'VERIFY_FAILED'}));process.exitCode=1;})
.finally(async()=>{if(db)await db.$disconnect();if(started){const inspected=docker(['inspect',container]);if(inspected.status===0&&JSON.parse(inspected.stdout)[0].Config.Labels['anhuu.data-review']===marker){const removed=docker(['rm','-f',container]);if(removed.status!==0){console.error('OWNED_CONTAINER_CLEANUP_FAILED');process.exitCode=1;}else console.log('OWNED_TEST_CONTAINER_REMOVED');}}});
