// Aggregate-only audit. PostgreSQL enforces READ ONLY for every database query.
require('dotenv').config();
require('ts-node').register({ transpileOnly: true });
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { z } = require('zod');
const { profileV2Schema } = require('../src/modules/profiles/schema-v2');
const { profileSchema, draftSchema } = require('../src/modules/profiles/schema');
const { profileV2Summary } = require('../src/modules/profiles/summary-v2');
const { goalDataSchema } = require('../src/modules/financial/schema');
const { partnerInput, productInput } = require('../src/modules/catalog/schema');
const settings = require('../src/modules/settings/schema');
const { AssumptionsService } = require('../src/modules/assumptions/service');
const { PortfoliosService } = require('../src/modules/portfolios/service');
const { validateConfiguration } = require('../src/modules/assumptions/series');
const { validatePortfolioPolicy } = require('../src/modules/portfolios/engine');
const { FinancialService } = require('../src/modules/financial/service');
const { contentInput, normalized } = require('../src/modules/content/service');
const { sourceInputSchema, AI_POLICY_VERSION } = require('../src/modules/ai/schema');
const db = new PrismaClient({ log: [] });
const q = value => '"' + value.replace(/"/g, '""') + '"';
const tally = (target, key) => { target[key] = (target[key] || 0) + 1; };
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key]]));
let stage = 'initialization';
(async () => {
  const report = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
    const query = sql => tx.$queryRawUnsafe(sql);
    const result = { checkedAt: new Date().toISOString(), mode: 'READ_ONLY', tables: {}, foreignKeys: [], checks: {}, domains: {} };
    result.transaction = await query("SELECT current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation");
    stage = 'all-table-invariants';
    for (const model of Prisma.dmmf.datamodel.models) {
      const fields = model.fields.filter(f => f.kind !== 'object');
      const expressions = ['COUNT(*)::int AS rows'];
      const nullableChecks = fields.filter(f => f.isRequired && !f.isList).map(f => `${q(f.dbName || f.name)} IS NULL`);
      if (nullableChecks.length) expressions.push(`COUNT(*) FILTER (WHERE ${nullableChecks.join(' OR ')})::int AS required_null_rows`);
      const revisions = fields.filter(f => ['revision', 'securityVersion', 'attempts', 'viewCount'].includes(f.name));
      if (revisions.length) expressions.push(`COUNT(*) FILTER (WHERE ${revisions.map(f => `${q(f.dbName || f.name)} < 0`).join(' OR ')})::int AS negative_counter_rows`);
      if (fields.some(f => f.name === 'createdAt')) expressions.push('MIN("createdAt") AS oldest_created, MAX("createdAt") AS newest_created, COUNT(*) FILTER (WHERE "createdAt" > NOW() + interval \'5 minutes\')::int AS future_created_rows');
      if (fields.some(f => f.name === 'createdAt') && fields.some(f => f.name === 'updatedAt')) expressions.push('COUNT(*) FILTER (WHERE "updatedAt" < "createdAt")::int AS updated_before_created_rows');
      result.tables[model.dbName || model.name] = (await query(`SELECT ${expressions.join(', ')} FROM ${q(model.dbName || model.name)}`))[0];
    }
    stage = 'foreign-keys';
    const fks = await query(`SELECT c.conname AS name, c.convalidated AS validated, child.relname AS child, parent.relname AS parent,
      array_agg(ca.attname ORDER BY u.ord) AS child_columns, array_agg(pa.attname ORDER BY u.ord) AS parent_columns
      FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace
      JOIN pg_class parent ON parent.oid=c.confrelid CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY AS u(ck,pk,ord)
      JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=u.ck JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=u.pk
      WHERE c.contype='f' AND ns.nspname='public' GROUP BY c.oid,child.relname,parent.relname`);
    for (const fk of fks) {
      const present = fk.child_columns.map(c => `c.${q(c)} IS NOT NULL`).join(' AND ');
      const join = fk.child_columns.map((c, i) => `p.${q(fk.parent_columns[i])}=c.${q(c)}`).join(' AND ');
      const [count] = await query(`SELECT COUNT(*)::int AS orphan_rows FROM ${q(fk.child)} c WHERE ${present} AND NOT EXISTS (SELECT 1 FROM ${q(fk.parent)} p WHERE ${join})`);
      result.foreignKeys.push({ name: fk.name, table: fk.child, validated: fk.validated, ...count });
    }
    result.invalidIndexes = await query("SELECT t.relname AS table_name, i.relname AS index_name FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND (NOT x.indisvalid OR NOT x.indisready)");
    stage = 'cross-table-and-operations';
    const checks = {
      plan_pointer_wrong_owner: `SELECT COUNT(*)::int AS count FROM retirement_plans p JOIN plan_versions v ON v.id=p."currentVersionId" OR v.id=p."baselineVersionId" WHERE v."planId"<>p.id`,
      support_author_wrong_owner: `SELECT COUNT(*)::int AS count FROM support_messages m JOIN support_tickets t ON t.id=m."ticketId" JOIN users u ON u.id=m."authorId" WHERE m."authorId"<>t."userId" AND u.role<>'ADMIN'`,
      consultation_assignee_not_admin: `SELECT COUNT(*)::int AS count FROM consultations c JOIN users u ON u.id=c."assignedAdminId" WHERE u.role<>'ADMIN'`,
      actual_identity_wrong_owner: `SELECT COUNT(*)::int AS count FROM actual_event_identities e JOIN actual_months m ON m.id=e."monthId" WHERE m."userId"<>e."userId"`,
      actual_latest_history_mismatch: `SELECT COUNT(*)::int AS count FROM actual_months m WHERE NOT EXISTS (SELECT 1 FROM actual_month_revisions r WHERE r."monthId"=m.id AND r.revision=m.revision AND r.payload=m.payload)`,
      idempotency_missing_user: `SELECT COUNT(*)::int AS count FROM idempotency_records r WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r."userId")`,
      users: `SELECT COUNT(*) FILTER (WHERE "emailVerifiedAt" IS NULL AND status='ACTIVE')::int AS active_without_verification, COUNT(*) FILTER (WHERE email<>lower(trim(email)))::int AS noncanonical_email, COUNT(*) FILTER (WHERE "passwordHash" !~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$')::int AS unexpected_password_hash_format FROM users`,
      duplicate_normalized_emails: `SELECT COUNT(*)::int AS groups FROM (SELECT lower(trim(email)) FROM users GROUP BY lower(trim(email)) HAVING COUNT(*)>1) x`,
      profile_goal_coverage: `SELECT COUNT(*) FILTER (WHERE p.id IS NULL AND u.role='USER')::int AS users_without_profile, COUNT(*) FILTER (WHERE g.id IS NULL AND p.id IS NOT NULL)::int AS profiles_without_goal, COUNT(*) FILTER (WHERE p.id IS NULL AND g.id IS NOT NULL)::int AS goals_without_profile FROM users u LEFT JOIN financial_profiles p ON p."userId"=u.id LEFT JOIN retirement_goals g ON g."userId"=u.id`,
      refresh_tokens: `SELECT COUNT(*) FILTER (WHERE t."expiresAt"<=NOW())::int AS expired, COUNT(*) FILTER (WHERE "revokedAt" IS NOT NULL)::int AS revoked, COUNT(*) FILTER (WHERE "expiresAt">NOW() AND "revokedAt" IS NULL AND "usedAt" IS NULL)::int AS active_unused, COUNT(*) FILTER (WHERE "expiresAt">NOW() AND "revokedAt" IS NULL AND "usedAt" IS NULL AND t."securityVersion"<>u."securityVersion")::int AS active_security_version_mismatch, COUNT(*) FILTER (WHERE token !~ '^[a-f0-9]{64}$')::int AS unexpected_hash_format FROM refresh_tokens t JOIN users u ON u.id=t."userId"`,
      verification_tokens: `SELECT type, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "expiresAt"<=NOW())::int AS expired, COUNT(*) FILTER (WHERE "consumedAt" IS NOT NULL)::int AS consumed, COUNT(*) FILTER (WHERE token !~ '^[a-f0-9]{64}$')::int AS unexpected_hash_format FROM verification_tokens GROUP BY type`,
      outbox: `SELECT status, COUNT(*)::int AS total, MAX(attempts) AS max_attempts, COUNT(*) FILTER (WHERE status='PROCESSING' AND ("lockedUntil" IS NULL OR "lockedUntil"<NOW()))::int AS expired_leases, COUNT(*) FILTER (WHERE status='PENDING' AND "availableAt"<NOW()-interval '1 hour')::int AS overdue FROM outbox_events GROUP BY status`,
      processed_without_outbox: `SELECT COUNT(*)::int AS count FROM processed_events p WHERE NOT EXISTS (SELECT 1 FROM outbox_events o WHERE o.id=p."eventId")`,
      completed_outbox_without_receipt: `SELECT COUNT(*)::int AS count FROM outbox_events o WHERE o.status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM processed_events p WHERE p."eventId"=o.id)`,
      outbox_completion_inconsistent: `SELECT COUNT(*)::int AS count FROM outbox_events WHERE status='COMPLETED' AND ("completedAt" IS NULL OR payload<>'{}'::jsonb OR "lockedUntil" IS NOT NULL OR "leaseId" IS NOT NULL)`,
      knowledge: `SELECT COUNT(*) FILTER (WHERE "isApproved" AND status='INDEXED' AND "effectiveDate"<=NOW() AND ("validUntil" IS NULL OR "validUntil">NOW()))::int AS eligible_sources, COUNT(*) FILTER (WHERE "isApproved" AND (status<>'INDEXED' OR "indexedHash" IS NULL))::int AS invalid_approved_sources FROM knowledge_sources`,
      knowledge_chunks: `SELECT COUNT(*) FILTER (WHERE btrim(content)='')::int AS blank_content, COUNT(*) FILTER (WHERE "chunkIndex"<0)::int AS negative_index, COUNT(*) FILTER (WHERE metadata->>'method'='LEXICAL_V1')::int AS lexical_metadata FROM knowledge_chunks`,
      duplicate_chunk_index: `SELECT COUNT(*)::int AS groups FROM (SELECT "sourceId","chunkIndex" FROM knowledge_chunks GROUP BY "sourceId","chunkIndex" HAVING COUNT(*)>1) x`,
      articles: `SELECT status, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='PUBLISHED' AND "publishedAt" IS NULL)::int AS published_without_date, COUNT(*) FILTER (WHERE btrim(content)='' OR btrim(title)='' OR btrim(slug)='')::int AS missing_content FROM articles GROUP BY status`,
      support: `SELECT status, COUNT(*)::int AS count FROM support_tickets GROUP BY status`,
      consultations: `SELECT status, COUNT(*)::int AS count FROM consultations GROUP BY status`,
      partners: `SELECT "isVisible", COUNT(*)::int AS count FROM partners GROUP BY "isVisible"`,
      products: `SELECT "isVisible", COUNT(*)::int AS count FROM partner_products GROUP BY "isVisible"`,
      login_logs: `SELECT status, COUNT(*)::int AS count FROM login_logs GROUP BY status`,
      system_logs: `SELECT level, COUNT(*)::int AS count, MAX("createdAt") AS latest FROM system_logs GROUP BY level`,
      notification_paths: `SELECT COUNT(*) FILTER (WHERE path !~ '^/[^/]' OR path ~ '[[:cntrl:]]')::int AS nonlocal_paths FROM notifications`,
      goal_lifestyle_encoding: `SELECT CASE WHEN lifestyle IN ('comfortable','essential','flexible','COMFORTABLE','ESSENTIAL','FLEXIBLE') THEN lifestyle ELSE 'OTHER' END AS value, COUNT(*)::int AS count FROM retirement_goals GROUP BY 1`,
      profile_dates: `SELECT "asOfDate"::date AS column_date, "profileData"->>'valuationDate' AS json_date, COUNT(*)::int AS count FROM financial_profiles GROUP BY 1,2`,
      system_error_categories: `SELECT level, "statusCode", CASE WHEN details->>'code' ~ '^[A-Z][A-Z0-9_]{1,60}$' THEN details->>'code' ELSE 'UNCLASSIFIED' END AS error_code, COUNT(*)::int AS count FROM system_logs GROUP BY 1,2,3`,
      ai_consent: `SELECT COUNT(*) FILTER (WHERE "saveHistory" AND NOT processing)::int AS history_without_processing, COUNT(*) FILTER (WHERE "policyVersion" IS NULL)::int AS missing_policy FROM ai_privacy`,
    };
    for (const [name, sql] of Object.entries(checks)) result.checks[name] = await query(sql);
    stage = 'stored-domain-validation';
    function validateRows(name, rows, schema, project) {
      const stats = { total: rows.length, valid: 0, invalid: 0, issues: {} };
      for (const row of rows) {
        const parsed = schema.safeParse(project(row));
        if (parsed.success) stats.valid++;
        else { stats.invalid++; for (const issue of parsed.error.issues) tally(stats.issues, issue.path.join('.') + ':' + issue.code); }
      }
      result.domains[name] = stats;
    }
    const profiles = await tx.financialProfile.findMany();
    const profileStats = { total: profiles.length, valid: 0, invalid: 0, unsupported: 0, issues: {}, summaryIssueCodes: {}, withUnknownSummaryValues: 0, asOfDateMismatch: 0, legacyBackups: 0 };
    for (const row of profiles) {
      if (row.legacyProfileData) profileStats.legacyBackups++;
      const schema = row.schemaVersion === 2 ? profileV2Schema : row.schemaVersion === 1 ? profileSchema : null;
      if (!schema) { profileStats.unsupported++; continue; }
      const parsed = schema.safeParse(row.profileData);
      if (!parsed.success) { profileStats.invalid++; for (const issue of parsed.error.issues) tally(profileStats.issues, issue.path.join('.') + ':' + issue.code); continue; }
      profileStats.valid++;
      if (row.schemaVersion === 2) {
        if (row.asOfDate.toISOString().slice(0,10) !== parsed.data.valuationDate) profileStats.asOfDateMismatch++;
        const summary = profileV2Summary(parsed.data);
        if (Object.values(summary.values).some(v => v === null)) profileStats.withUnknownSummaryValues++;
        for (const code of new Set(summary.issues.map(i => i.code))) tally(profileStats.summaryIssueCodes, code);
      }
    }
    result.domains.profiles = profileStats;
    validateRows('goals', await tx.retirementGoal.findMany(), goalDataSchema, row => ({ ...pick(row, ['targetRetirementAge','lifeExpectancy','lifestyle','riskLevel']), monthlyExpense:row.monthlyExpense.toString(), monthlyContribution:row.monthlyContribution.toString() }));
    validateRows('drafts', await tx.onboardingDraft.findMany(), draftSchema, row => ({ expectedRevision: row.revision, step:row.step, data:row.data }));
    validateRows('partners', await tx.partner.findMany(), partnerInput, row => pick(row, Object.keys(partnerInput.shape)));
    validateRows('products', await tx.partnerProduct.findMany(), productInput, row => pick(row, Object.keys(productInput.innerType().shape)));
    validateRows('user_email_and_name', await tx.user.findMany({ select: { email:true, fullName:true } }), z.object({ email:z.string().email(),fullName:z.string().trim().min(1).max(120) }), row => row);
    const articles = await tx.article.findMany();
    validateRows('articles', articles, contentInput, row=>pick(row,Object.keys(contentInput.shape)));
    result.domains.article_search = { total:articles.length, empty:articles.filter(r=>!r.searchText.trim()).length,
      mismatched:articles.filter(r=>r.searchText!==normalized([r.title,r.excerpt,r.content,r.category].join(' '))).length };
    validateRows('support_tickets',await tx.supportTicket.findMany(),z.object({subject:z.string().trim().min(3).max(200),category:z.enum(['Tài khoản','Sử dụng website','Nội dung','Khác']),status:z.enum(['OPEN','IN_PROGRESS','RESOLVED','CLOSED'])}),r=>r);
    validateRows('support_messages',await tx.supportMessage.findMany(),z.object({body:z.string().trim().min(1).max(5000)}),r=>r);
    validateRows('knowledge_sources',await tx.knowledgeSource.findMany(),sourceInputSchema,r=>({ ...pick(r,['title','category','version','rawContent']),referenceCode:r.referenceCode??undefined,fileUrl:r.fileUrl??undefined,effectiveDate:r.effectiveDate?.toISOString(),validUntil:r.validUntil?.toISOString()??null }));
    result.domains.ai_policy = { outdatedConsent:await tx.aiPrivacy.count({where:{policyVersion:{not:AI_POLICY_VERSION}}}) };
    const seedSource = fs.readFileSync(path.resolve(__dirname,'seed-azure.cjs'),'utf8');
    const seedEmails = new Set(seedSource.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []);
    result.domains.seed_provenance = { usersMatchingEmailLiteralsInSeedScript:(await tx.user.findMany({select:{email:true}})).filter(u=>seedEmails.has(u.email)).length,
      note:'Exact email literal match only; does not prove every record was seeded or identify real people.' };
    const financial = new FinancialService(tx);
    const reads = { goalSuccess:0,goalErrors:{},benchmarks:null };
    for (const goal of await tx.retirementGoal.findMany({select:{userId:true}})) {
      try { await financial.getGoal(goal.userId); reads.goalSuccess++; }
      catch(error) { tally(reads.goalErrors,error.code||error.name); }
    }
    try { await financial.benchmarks(); reads.benchmarks='READABLE'; } catch(error) { reads.benchmarks=error.code||error.name; }
    result.domains.read_services=reads;
    for (const row of await tx.systemSetting.findMany()) {
      const schema = { general:settings.generalSettingsSchema, security:settings.securitySettingsSchema, notifications:settings.notificationSettingsSchema }[row.key];
      if (schema) validateRows('settings_'+row.key,[row],schema,row=>row.value);
      else result.domains['settings_unrecognized'] = { count: (result.domains.settings_unrecognized?.count || 0) + 1 };
    }
    const assumptions = new AssumptionsService(tx), policies = new PortfoliosService(tx);
    result.domains.configurations = [];
    for (const row of await tx.assumptionSetVersion.findMany()) {
      const item = { modelCode:row.modelCode, status:row.status, readable:false };
      try {
        if (row.modelCode === 'assumption-series-v2') {
          const view = await assumptions.get(row.id, row.status === 'PUBLISHED');
          const validation = validateConfiguration(view.data);
          Object.assign(item, { readable:true, validationStatus:validation.status, issueCodes:validation.issues.map(i=>i.code), startYear:view.data.projectionStartYear,endYear:view.data.projectionEndYear });
        } else if (row.modelCode === 'portfolio-policy-v1') {
          const view = await policies.get(row.id,row.status === 'PUBLISHED');
          const source = await assumptions.get(view.data.assumptionVersionId,true);
          const validation = validatePortfolioPolicy(view.data,source.data);
          Object.assign(item,{ readable:true, assumptionHashMatches:view.approval?.assumptionHash === source.documentHash, validationStatus:validation.status, issueCodes:validation.issues.map(i=>i.code) });
        } else item.unassessed = true;
      } catch (error) { item.errorCode = error.code || error.name; }
      result.domains.configurations.push(item);
    }
    result.emptyTables = Object.entries(result.tables).filter(([,v])=>v.rows===0).map(([k])=>k);
    result.totalApplicationRows = Object.values(result.tables).reduce((n,t)=>n+t.rows,0);
    return result;
  }, { timeout:180000, maxWait:15000, isolationLevel:'RepeatableRead' });
  const output = path.resolve(__dirname,'../.tmp/database-content-audit.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({ output:'backend/.tmp/database-content-audit.json', checkedAt:report.checkedAt, mode:report.mode,
    totalRows:report.totalApplicationRows, tables:Object.keys(report.tables).length, foreignKeys:report.foreignKeys.length,
    foreignKeyProblems:report.foreignKeys.filter(v=>!v.validated||v.orphan_rows), domains:report.domains },null,2));
})().catch(error => {
  console.error(JSON.stringify({ stage, name:error.name, code:error.code || error.errorCode || 'AUDIT_FAILED' }));
  process.exitCode=1;
}).finally(()=>db.$disconnect());
