// Preparation only: --capture reads the configured DB in a READ ONLY transaction.
// --build works offline. This script has no path that writes to the source DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tmp', 'data-review-20261008');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const identifier = v => '"' + v.replace(/"/g, '""') + '"';
const literal = v => v === null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
const encode = v => JSON.stringify(v, null, 2) + '\n';
const snapshotPath = path.join(output, 'source-snapshot.private.json');
const stableId = key => {const h=sha('anhuu-reviewed-20261008:'+key); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const clone = v => JSON.parse(JSON.stringify(v));
const fail = code => {throw Error(code);};
async function capture() {
  require('dotenv').config({ path: path.join(root, '.env') });
  const { PrismaClient, Prisma } = require('@prisma/client');
  const db = new PrismaClient({ log: [] });
  try {
    const snapshot = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
      await tx.$executeRawUnsafe("SET LOCAL timezone='UTC'");
      const columns = await tx.$queryRawUnsafe(`SELECT table_name,column_name,data_type,udt_name,is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name,ordinal_position`);
      const expected = Prisma.dmmf.datamodel.models.map(m=>m.dbName||m.name).sort();
      const names = [...new Set(columns.map(c=>c.table_name))].sort();
      if (JSON.stringify(expected)!==JSON.stringify(names)) throw Error('SCHEMA_TABLE_SET_CHANGED');
      const tables = {};
      for (const name of names) {
        const fields = columns.filter(c=>c.table_name===name);
        // Every scalar is exported as PostgreSQL text. Decimal precision, NULL,
        // arrays, JSONB and timestamps never pass through a JS numeric conversion.
        const pairs = fields.map(c=>`${literal(c.column_name)},${identifier(c.column_name)}::text`).join(',');
        const rows = await tx.$queryRawUnsafe(`SELECT jsonb_build_object(${pairs}) AS value FROM public.${identifier(name)} ORDER BY to_jsonb(${identifier(name)})::text`);
        tables[name] = { columns:fields.map(({table_name,...c})=>c), rows:rows.map(r=>r.value) };
      }
      const migrations = await tx.$queryRawUnsafe('SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY migration_name');
      for (const m of migrations) if (!m.finished || m.rolled_back || sha(fs.readFileSync(path.join(root,'prisma/migrations',m.migration_name,'migration.sql')))!==m.checksum) throw Error('MIGRATION_HISTORY_MISMATCH');
      const constraints = await tx.$queryRawUnsafe(`SELECT c.conname AS name, child.relname AS child, parent.relname AS parent,
        array_agg(ca.attname ORDER BY u.ord) AS child_columns,array_agg(pa.attname ORDER BY u.ord) AS parent_columns
        FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace
        JOIN pg_class parent ON parent.oid=c.confrelid CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY AS u(ck,pk,ord)
        JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=u.ck JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=u.pk
        WHERE c.contype='f' AND ns.nspname='public' GROUP BY c.oid,child.relname,parent.relname`);
      return { format:1, capturedAt:new Date().toISOString(), mode:'READ_ONLY', migrations,constraints,tables };
    },{ timeout:120000,isolationLevel:'RepeatableRead' });
    fs.mkdirSync(output,{recursive:true});
    if(fs.existsSync(snapshotPath)) throw Error('SNAPSHOT_ALREADY_EXISTS_KEEP_REVIEWED_INPUT');
    fs.writeFileSync(snapshotPath,encode(snapshot),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({status:'CAPTURED_READ_ONLY',tables:Object.keys(snapshot.tables).length,rows:Object.values(snapshot.tables).reduce((n,t)=>n+t.rows.length,0)}));
  } finally { await db.$disconnect(); }
}

function build() {
  require('ts-node').register({transpileOnly:true,project:path.join(root,'tsconfig.json')});
  const {digest}=require('../src/common/digest');
  const {normalized,contentInput}=require('../src/modules/content/service');
  const {profileV2Schema}=require('../src/modules/profiles/schema-v2');
  const {goalDataSchema}=require('../src/modules/financial/schema');
  const {sourceInputSchema}=require('../src/modules/ai/schema');
  const {partnerInput,productInput}=require('../src/modules/catalog/schema');
  const {legalRuleDraftSchema}=require('../src/modules/pensions/insurance-schema');
  const {validateLegalDocument}=require('../src/modules/pensions/legal-validation');
  const {verifySources}=require('./generate-legal-corpus.cjs');
  const source=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
  const refs=JSON.parse(fs.readFileSync(path.join(root,'seed-data/reviewed-references-20261008.json'),'utf8'));
  const corpus=verifySources(), tables=clone(source.tables), changes=[], archived=[], legalValidation=[];
  const preparedAt=source.capturedAt;
  const rows=name=>tables[name].rows;
  // The captured dataset has no saved plans/actuals/pension records. Stop if this
  // changes: this review must never mutate a configuration used by old snapshots.
  for (const name of ['retirement_plans','plan_versions','legal_rule_set_versions','actual_months','social_insurance_history_versions','pension_estimates'])
    if(rows(name).length) fail('NEW_DOMAIN_DATA_REQUIRES_NEW_REVIEW');
  const admins=rows('users').filter(r=>r.role==='ADMIN'&&r.status==='ACTIVE');
  if(admins.length!==1) fail('DRAFT_OWNERSHIP_REVIEW_REQUIRED');
  const owner=admins[0].id;
  function alter(table,row,data,reason) {
    const changed=Object.keys(data).filter(k=>row[k]!==data[k]);
    if(!changed.length)return;
    if(changed.some(k=>!(k in row)))fail('UNKNOWN_COLUMN');
    const before=Object.fromEntries(changed.map(k=>[k,row[k]]));
    const after=Object.fromEntries(changed.map(k=>[k,data[k]]));
    if('revision'in row){before.revision=row.revision;after.revision=String(Number(row.revision)+1);}
    if('updatedAt'in row){before.updatedAt=row.updatedAt;after.updatedAt=preparedAt;}
    changes.push({table,id:row.id||row.key,fields:changed,reason});
    archived.push({table,id:row.id||row.key,before,afterHash:digest(after),reason});
    Object.assign(row,data);
    if('revision'in row)row.revision=String(Number(row.revision)+1);
    if('updatedAt'in row)row.updatedAt=preparedAt;
  }
  function add(table,key,data){
    const value=Object.fromEntries(tables[table].columns.map(c=>[c.column_name,null]));
    const id=stableId(table+':'+key);
    Object.assign(value,{id},data);
    for(const c of tables[table].columns)if(value[c.column_name]!==null)value[c.column_name]=String(value[c.column_name]);
    if(rows(table).some(r=>r.id===id))fail('DUPLICATE_GENERATED_ID');
    rows(table).push(value);return value;
  }
  for(const p of rows('financial_profiles')){
    if(p.schemaVersion!=='2')fail('PROFILE_VERSION_REVIEW_REQUIRED');
    const doc=profileV2Schema.parse(JSON.parse(p.profileData));
    if(new Date(p.asOfDate).toISOString().slice(0,10)!==doc.valuationDate)
      alter('financial_profiles',p,{asOfDate:doc.valuationDate+'T00:00:00.000Z'},'Align metadata with unchanged profile valuationDate');
  }
  for(const g of rows('retirement_goals')){
    const mapped={comfortable:'COMFORTABLE',essential:'ESSENTIAL',flexible:'FLEXIBLE'}[g.lifestyle];
    if(mapped)alter('retirement_goals',g,{lifestyle:mapped},'Normalize existing enum; money and target unchanged');
    goalDataSchema.parse({targetRetirementAge:Number(g.targetRetirementAge),lifeExpectancy:Number(g.lifeExpectancy),
      lifestyle:g.lifestyle,riskLevel:g.riskLevel,monthlyExpense:g.monthlyExpense,monthlyContribution:g.monthlyContribution});
  }
  for(const t of rows('support_tickets')){
    const mapped={TECHNICAL:'Sử dụng website',FEATURE_REQUEST:'Khác',FINANCIAL:'Nội dung'}[t.category];
    if(t.category==='FINANCIAL'&&t.subject!=='Câu hỏi về cách tính lương hưu BHXH')fail('SUPPORT_MAPPING_REVIEW_REQUIRED');
    if(mapped)alter('support_tickets',t,{category:mapped},'Map reviewed existing ticket topic to current category enum');
  }
  for(const a of rows('articles')){
    const replacement=refs.editorialReplacement.find(v=>v.slug===a.slug);
    if(!replacement)fail('ARTICLE_NOT_REVIEWED');
    const content=replacement.body+'\n\nNguồn: '+replacement.source+'\nNgày đối chiếu: 08/10/2026.';
    alter('articles',a,{title:replacement.title,excerpt:replacement.excerpt,content,category:replacement.category,
      authorName:'An Hưu — tổng hợp nguồn',status:'DRAFT',publishedAt:null,
      searchText:normalized([replacement.title,replacement.excerpt,content,replacement.category].join(' '))},
      'Replace unsupported seed claims with sourced draft; preserve slug/id and archive original; publication requires review');
    contentInput.parse(Object.fromEntries(Object.keys(contentInput.shape).map(k=>[k,a[k]])));
  }
  for(const p of rows('partners'))alter('partners',p,{isVisible:'false',isHighlight:'false'},'No verified partnership agreement; keep catalog private for review');
  for(const p of rows('partner_products')){
    const ref=refs.products.find(v=>p.name.startsWith(v.prefix));
    const pending=refs.unverifiedProducts.find(v=>p.name.startsWith(v.prefix));
    if(!ref&&!pending)fail('PRODUCT_NOT_REVIEWED');
    const url=(ref||pending).url;
    alter('partner_products',p,{
      name:ref?.name||p.name,expectedReturn:'Không công bố mức lợi nhuận cố định trong bộ dữ liệu này.',
      annualFee:ref?.fee||null,
      description:ref?.description||pending.reason,
      conditions:'Cần đọc điều kiện và tài liệu đúng phiên bản tại nguồn chính thức: '+url,
      disclosure:(ref?'Thông tin nhận diện đã đối chiếu.':'CHƯA XÁC MINH ĐÚNG SẢN PHẨM. ')+
        ' Không xác nhận quan hệ hợp tác với An Hưu, không cam kết lợi suất. Kiểm tra nguồn ngày 08/10/2026: '+url,
      isVisible:'false'
    },ref?'Correct identity/fees from official source; remove unsupported return range':'Quarantine unsupported product; do not silently replace its identity');
    const data=Object.fromEntries(Object.keys(productInput.innerType().shape).map(k=>[k,k==='isVisible'?p[k]==='true':p[k]]));
    productInput.parse(data);
  }
  // Preserve old analytical values in their rows, explicitly label their origin.
  // Neither these legacy values nor the two unverified seed configurations are
  // promoted to independently verified production assumptions.
  for(const a of rows('financial_assumptions'))alter('financial_assumptions',a,{description:
    'CHƯA XÁC MINH: giá trị kế thừa từ seed, giữ để đối chiếu; không dùng làm căn cứ tính hoặc tư vấn chính thức. '+(a.description||'')},'Retain numeric legacy value with explicit provenance limitation');
  for(const a of rows('assumption_set_versions')){
    const policy=a.modelCode==='assumption-series-v2'?{preview:null,approval:null}:{approval:null};
    alter('assumption_set_versions',a,{status:'DRAFT',publishedBy:null,effectiveAt:null,policy:JSON.stringify(policy),
      reason:'Bản kế thừa từ seed; số liệu dự báo/lợi suất và nguồn trích dẫn chưa được xác minh độc lập. Giữ nguyên values để rà soát, không coi là dữ liệu thị trường đã duyệt.'},
      'Withdraw seed-only publication in proposed dataset; original values and workflow archived; no saved plans exist');
  }
  // Rebuild only the derived lexical index. Old chunks are archived in full.
  archived.push({table:'knowledge_chunks',reason:'Derived legacy chunks replaced by indexes over reviewed source summaries',rows:clone(rows('knowledge_chunks'))});
  tables.knowledge_chunks.rows=[];
  const tokenized=v=>[...new Set(v.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').match(/[a-z0-9]{2,}/g)||[])];
  for(const ref of refs.knowledge){
    let k=ref.match?rows('knowledge_sources').find(r=>r.referenceCode===ref.match):null;
    if(ref.match&&!k)fail('KNOWLEDGE_MATCH_NOT_FOUND');
    const rawContent=ref.text+'\nNguồn chính thức: '+ref.url+'\nĐối chiếu: 08/10/2026.';
    sourceInputSchema.parse({title:ref.title,referenceCode:ref.referenceCode,category:ref.category,version:'review-2026-10-08',rawContent,fileUrl:ref.url,effectiveDate:ref.effectiveDate,validUntil:null});
    const fields={title:ref.title,referenceCode:ref.referenceCode,category:ref.category,description:'Tóm tắt nhận diện nguồn thật; không phải bản sao toàn văn. Chờ duyệt nội dung trước khi truy xuất.',
      rawContent,fileUrl:ref.url,fileSize:null,mimeType:null,version:'review-2026-10-08',effectiveDate:ref.effectiveDate,
      validUntil:null,status:'INDEXED',isApproved:'false',errorMessage:null,indexedHash:null};
    fields.indexedHash=sha(JSON.stringify([fields.title,fields.referenceCode,fields.category,fields.version,fields.rawContent,fields.fileUrl,new Date(fields.effectiveDate),null]));
    if(k)alter('knowledge_sources',k,fields,'Replace unverified composite/legal statements with cited source-identification summary');
    else k=add('knowledge_sources',ref.referenceCode,{...fields,revision:'1',createdAt:preparedAt,updatedAt:preparedAt});
    for(const [index,content]of rawContent.match(/[\s\S]{1,1500}/g).entries())add('knowledge_chunks',ref.referenceCode+':'+index,
      {sourceId:k.id,chunkIndex:String(index),content,metadata:JSON.stringify({method:'LEXICAL_V1',sourceHash:k.indexedHash,tokens:tokenized(content)}),embedding:null,createdAt:preparedAt});
  }
  // These are source-backed draft documents from the existing, byte-checked
  // corpus. No fake history, benefit record, reviewer or publication is created.
  for(const file of fs.readdirSync(path.join(root,'seed-data/legal-2026')).filter(f=>f.endsWith('.draft.json')).sort()){
    const draft=legalRuleDraftSchema.parse(JSON.parse(fs.readFileSync(path.join(root,'seed-data/legal-2026',file),'utf8')));
    const validation=validateLegalDocument(draft.document);
    if(!validation.valid)fail('LEGAL_VALIDATION_FAILED');
    legalValidation.push({file,engineCode:draft.document.engineCode,valid:validation.valid,
      cases:validation.coverage.reduce((n,c)=>n+c.cases.length,0),documentHash:digest(draft.document),
      note:file.includes('transition-2025')?'Independent review of 2025 transitional basis still required':'Independent legal review and publication still required'});
    add('legal_rule_set_versions',file,{code:draft.code,version:'1',revision:'1',status:'DRAFT',effectiveFrom:draft.effectiveFrom,effectiveTo:draft.effectiveTo,
      knowledgeAsOf:preparedAt,supersedesId:null,document:JSON.stringify(draft.document),documentHash:digest(draft.document),validation:null,review:null,
      createdBy:owner,authorIds:'{'+owner+'}',reviewedBy:null,publishedBy:null,publishedAt:null,createdAt:preparedAt});
  }
  add('audit_logs','preparation',{action:'DATASET_PREPARED_FOR_REVIEW',targetType:'DATASET',targetId:'anhuu-full-20261008',performerId:null,
    performerName:'Công cụ chuẩn bị dữ liệu — chưa phê duyệt',ipAddress:null,userAgent:null,
    details:JSON.stringify({sourceCapturedAt:source.capturedAt,sourceSnapshotHash:sha(encode(source)),status:'NOT_PRODUCTION_APPROVED',
      notes:['Existing identities and personal financial inputs reused; not independently verified as real persons or transactions.',
        'No new plans, actual transactions, insurance histories, consent, login events or notifications were fabricated.',
        '8 legal drafts assigned to existing administrator for review; no independent reviewer or published state fabricated.',
        'All old notifications/support replies are preserved historical records, not new assertions of completed work.'],
      referencesFileHash:sha(encode(refs)),referenceUrls:[...new Set([...refs.knowledge,...refs.products,...refs.unverifiedProducts].map(r=>r.url))],
      corpusSources:corpus,changes,archived}),createdAt:preparedAt});
  // Offline relational, uniqueness and shape checks before emitting any SQL.
  const {Prisma}=require('@prisma/client');
  for(const [name,table]of Object.entries(tables)){
    for(const row of table.rows)for(const c of table.columns){
      if(!(c.column_name in row)||(c.is_nullable==='NO'&&row[c.column_name]===null))fail('REQUIRED_COLUMN_MISSING');
      if(c.data_type==='jsonb'&&row[c.column_name]!==null)JSON.parse(row[c.column_name]);
    }
    const model=Prisma.dmmf.datamodel.models.find(m=>(m.dbName||m.name)===name);
    const groups=[...model.uniqueFields,...model.fields.filter(f=>f.isUnique||f.isId).map(f=>[f.name]),...(model.primaryKey?[model.primaryKey.fields]:[])];
    for(const fields of groups){const seen=new Set();for(const row of table.rows){const v=fields.map(f=>row[model.fields.find(x=>x.name===f).dbName||f]);if(v.some(x=>x===null))continue;const key=JSON.stringify(v);if(seen.has(key))fail('UNIQUE_KEY_COLLISION');seen.add(key);}}
  }
  for(const fk of source.constraints)for(const row of rows(fk.child)){
    const values=fk.child_columns.map(c=>row[c]);if(values.some(v=>v===null))continue;
    if(!rows(fk.parent).some(p=>fk.parent_columns.every((c,i)=>p[c]===values[i])))fail('FOREIGN_KEY_BROKEN');
  }
  const result={format:1,sourceCapturedAt:source.capturedAt,preparedAt,sourceHash:sha(encode(source)),migrations:source.migrations,constraints:source.constraints,tables};
  const datasetHash=sha(encode(result));
  const manifest={datasetHash,sourceCapturedAt:source.capturedAt,sourceRows:Object.values(source.tables).reduce((n,t)=>n+t.rows.length,0),
    targetRows:Object.values(tables).reduce((n,t)=>n+t.rows.length,0),counts:Object.fromEntries(Object.entries(tables).map(([name,t])=>[name,t.rows.length])),
    modifications:changes.reduce((m,c)=>(m[c.table]=(m[c.table]||0)+1,m),{}),legalValidation,
    sourcesFile:'backend/seed-data/reviewed-references-20261008.json',status:'AWAITING_USER_APPROVAL',
    important:['Target must be empty and already migrated. No TRUNCATE, DELETE or source-DB update.',
      'Restores confidential account, financial and authentication records. Do not publish this SQL file.',
      'Forecast assumptions, editorial content, catalog and legal rules require review before production availability.',
      'Empty actual/plan/history tables stay empty: no authentic source data was supplied.']};
  const sql=renderSql(result,datasetHash);
  fs.writeFileSync(path.join(output,'reviewed-dataset.private.json'),encode(result),{mode:0o600});
  fs.writeFileSync(path.join(root,'seed-data','seed-datafull.sql'),sql,{mode:0o600});
  manifest.sqlSha256=sha(sql);manifest.sqlBytes=Buffer.byteLength(sql);
  fs.writeFileSync(path.join(output,'review-manifest.json'),encode(manifest));
  console.log(JSON.stringify(manifest,null,2));return manifest;
}

function renderSql(dataset,datasetHash){
  const tables=dataset.tables,names=Object.keys(tables).sort(),pointerFields=['currentVersionId','baselineVersionId'];
  const pending=new Set(names),order=[];
  while(pending.size){const ready=[...pending].filter(n=>dataset.constraints.filter(f=>f.child===n&&f.parent!==n&&!(n==='retirement_plans'&&f.parent==='plan_versions')).every(f=>!pending.has(f.parent)));
    if(!ready.length)fail('CYCLIC_SCHEMA_REQUIRES_REVIEW');for(const n of ready){order.push(n);pending.delete(n);}}
  const statements=[
    '-- AN HUU: FULL DATASET FOR REVIEW. Contains private account/financial records; do not commit/share publicly.',
    '-- NOT APPROVED FOR THE REAL DATABASE. Prepared from a READ ONLY snapshot: '+dataset.sourceCapturedAt,
    '-- Restore only to an EMPTY replacement database with the exact migration history below. No reset/delete statements.',
    '-- Every existing application table is covered, including intentionally empty business tables.',
    '-- Approval code (must be supplied externally only after user review): '+datasetHash,
    '-- Example after approval: set session anhuu.data_approval to the code, then execute this complete file with stop-on-error.',
    '-- Existing data changed since capture is NOT included: recapture/review before any real cutover.',
    '-- Draft configuration/content/catalog intentionally stays unpublished; the file is data, not an approval of legal or investment rules.',
    'BEGIN;',"SET LOCAL standard_conforming_strings=on;","SET LOCAL timezone='UTC';","SET LOCAL lock_timeout='5s';","SET LOCAL statement_timeout='120s';",
    `DO $approval$ BEGIN IF current_setting('anhuu.data_approval',true) IS DISTINCT FROM ${literal(datasetHash)} THEN RAISE EXCEPTION 'DATASET_REVIEW_APPROVAL_REQUIRED'; END IF; END $approval$;`,
    `LOCK TABLE ${names.map(n=>'public.'+identifier(n)).join(',')} IN ACCESS EXCLUSIVE MODE;`,
    `DO $empty$ BEGIN ${names.map(n=>`IF EXISTS(SELECT 1 FROM public.${identifier(n)}) THEN RAISE EXCEPTION 'TARGET_MUST_BE_EMPTY: ${n}'; END IF;`).join('\n')} END $empty$;`,
    `DO $migrations$ BEGIN IF (SELECT count(*) FROM public._prisma_migrations) <> ${dataset.migrations.length} THEN RAISE EXCEPTION 'MIGRATION_COUNT_MISMATCH'; END IF;\n`+
      dataset.migrations.map(m=>`IF NOT EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name=${literal(m.migration_name)} AND checksum=${literal(m.checksum)} AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'MIGRATION_CHECKSUM_MISMATCH'; END IF;`).join('\n')+' END $migrations$;'
  ];
  for(const name of order){
    const table=tables[name];statements.push(`-- TABLE ${name}: ${table.rows.length} rows`);
    // Self-referential history chains must be inserted parent first.
    const remaining=[...table.rows],inserted=[];
    while(remaining.length){const index=remaining.findIndex(row=>dataset.constraints.filter(f=>f.child===name&&f.parent===name).every(f=>f.child_columns.some(c=>row[c]===null)||inserted.some(p=>f.child_columns.every((c,i)=>row[c]===p[f.parent_columns[i]]))));
      if(index<0)fail('SELF_REFERENCE_CYCLE');const row=remaining.splice(index,1)[0];inserted.push(row);
      const values=table.columns.map(c=>literal(name==='retirement_plans'&&pointerFields.includes(c.column_name)?null:row[c.column_name]));
      statements.push(`INSERT INTO public.${identifier(name)} (${table.columns.map(c=>identifier(c.column_name)).join(',')}) VALUES (${values.join(',')});`);
    }
  }
  for(const row of tables.retirement_plans.rows)statements.push(`UPDATE public.retirement_plans SET ${pointerFields.map(k=>identifier(k)+'='+literal(row[k])).join(',')} WHERE id=${literal(row.id)};`);
  statements.push(`DO $counts$ BEGIN ${names.map(n=>`IF (SELECT count(*) FROM public.${identifier(n)}) <> ${tables[n].rows.length} THEN RAISE EXCEPTION 'RESTORE_COUNT_MISMATCH: ${n}'; END IF;`).join('\n')} END $counts$;`);
  statements.push('COMMIT;','-- End. All inserts are atomic; a failed statement must be treated as a failed import.');
  return statements.join('\n')+'\n';
}
if (require.main===module) {
  const flag=process.argv[2];
  if(process.argv.length!==3 || !['--capture','--build'].includes(flag)) { console.error('Usage: node scripts/prepare-reviewed-dataset.cjs --capture|--build'); process.exitCode=1; }
  else Promise.resolve().then(()=>flag==='--capture'?capture():build()).catch(error=>{console.error(JSON.stringify({code:error.code||error.message?.match(/^[A-Z_]+$/)?.[0]||'PREPARATION_FAILED',
    issues:error.issues?.map(i=>({path:i.path,code:i.code}))}));process.exitCode=1;});
}
module.exports={root,output,sha,identifier,literal,encode,snapshotPath,build,renderSql};
