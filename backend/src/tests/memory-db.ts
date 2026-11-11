import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// A deterministic service-test double. It proves workflow behavior/rollback only,
// NOT PostgreSQL isolation, migrations, unique constraints or multi-worker locking.
type Row = Record<string, any>;
export function memoryDb() {
  const tables: Record<string, Row[]> = {};
  let failModel: string | undefined;
  const db: Record<string, any> = {};
  const names = ["user", "verificationToken", "refreshToken", "auditLog", "outboxEvent", "processedEvent",
    "financialProfile", "onboardingDraft", "retirementPlan", "planVersion", "financialModelVersion", "idempotencyRecord", "notification", "assumptionSetVersion", "actualMonth", "actualMonthRevision", "actualEventIdentity", "aiPrivacy", "aiConversation", "aiMessage", "knowledgeSource", "knowledgeChunk", "partner", "partnerProduct", "notificationPreference", "consultation"];
  names.push("legalRuleSetVersion", "socialInsuranceHistoryVersion", "pensionEstimate");
  names.push("systemSetting", "loginLog", "systemLog", "retirementGoal");
  names.push("article", "savedArticle", "savedProduct", "supportTicket", "supportMessage");
  function relation(row: Row, key: string): any {
    if (key in row) return row[key];
    const links: Record<string, [string, string]> = { partner: ["partner", "partnerId"], product: ["partnerProduct", "productId"], article: ["article", "articleId"], author: ["user", "authorId"], user: ["user", "userId"] };
    if (links[key]) { const [table, foreignKey] = links[key]; return tables[table]?.find(item => item.id === row[foreignKey]) ?? null; }
    if (key === "savedBy") return tables.savedArticle?.filter(item => item.articleId === row.id) ?? [];
    return undefined;
  }
  function match(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((v: Row) => match(row, v));
      if (key === "AND") return (Array.isArray(value) ? value : [value]).every((v: Row) => match(row, v));
      if (key === "NOT") return !(Array.isArray(value) ? value : [value]).some((v: Row) => match(row, v));
      if (["userId_scope_key", "userId_productId", "userId_articleId"].includes(key)) return match(row, value);
      const field = relation(row, key);
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("some" in value) return Array.isArray(field) && field.some(item => match(item, value.some));
        const operators = ["mode", "startsWith", "contains", "gt", "lt", "lte", "gte", "in", "notIn", "not", "equals"];
        if (Object.keys(value).some(k => !operators.includes(k))) return field !== null && field !== undefined && match(field, value);
        return Object.entries(value).every(([op, v]) => op === "mode" ? true : op === "startsWith" ? String(field ?? "").startsWith(String(v)) : op === "contains" ? String(field ?? "").toLowerCase().includes(String(v).toLowerCase()) : op === "gt" ? field > (v as any) :
          op === "lt" ? field < (v as any) : op === "lte" ? field <= (v as any) : op === "gte" ? field >= (v as any) : op === "in" ? (v as any[]).includes(field) : op === "notIn" ? !(v as any[]).includes(field) : op === "not" ? field !== v : op === "equals" ? field === v : false);
      }
      return field === value;
    });
  }
  function decorate(row: Row | undefined, options: Row): any {
    if (!row) return null;
    const value = structuredClone(row);
    if (options.include?.user) value.user = structuredClone(tables.user.find(u => u.id === row.userId));
    if (options.select) return Object.fromEntries(Object.entries(options.select).filter(([, selected]) => selected).map(([key, selected]) => [key, selected === true ? relation(value, key) : decorate(relation(value, key), selected as Row)]));
    return value;
  }
  function mutate(row: Row, data: Row) {
    for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value
      ? row[key] + value.increment : structuredClone(value);
    row.updatedAt = new Date();
  }
  for (const name of names) {
    tables[name] = [];
    db[name] = {
      findUnique: async (options: Row) => decorate(tables[name].find(r => match(r, options.where)), options),
      findUniqueOrThrow: async (options: Row) => {
        const result = await db[name].findUnique(options);
        if (!result) throw new Error("Missing fixture");
        return result;
      },
      findFirst: async (options: Row) => (await db[name].findMany(options))[0] ?? null,
      findMany: async (options: Row = {}) => {
        let rows = tables[name].filter(r => match(r, options.where));
        if (options.orderBy) {
          const [key, direction] = Object.entries(Array.isArray(options.orderBy) ? options.orderBy[0] : options.orderBy)[0];
          rows = [...rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === "desc" ? -1 : 1));
        }
        return rows.slice(options.skip || 0, options.take === undefined ? undefined : (options.skip || 0) + options.take).map(r => decorate(r, options));
      },
      groupBy: async (options: Row) => {
        const result = new Map<string, Row>();
        for (const row of tables[name].filter(item => match(item, options.where))) {
          const fields = Object.fromEntries(options.by.map((key: string) => [key, row[key]])), key = JSON.stringify(fields);
          const group = result.get(key) ?? { ...fields, _count: { _all: 0 } }; group._count._all++; result.set(key, group);
        }
        return [...result.values()];
      },
      count: async (options: Row = {}) => tables[name].filter(r => match(r, options.where)).length,
      create: async (options: Row) => {
        const { data } = options;
        if (name === failModel) throw new Error("Injected write failure");
        const now = new Date();
        const defaults = { id: randomUUID(), createdAt: now, updatedAt: now };
        const modelDefaults: Record<string, Row> = {
          legalRuleSetVersion: { revision: 1, status: "DRAFT", knowledgeAsOf: now, publishedAt: null, publishedBy: null, reviewedBy: null, validation: null, review: null },
          socialInsuranceHistoryVersion: { recordedAt: now, schemaVersion: 1, parentVersionId: null, parentHash: null },
          notificationPreference: { revision: 1, emailDigest: false, goalAlerts: false, partnerUpdates: false },
          partner: { revision: 0, isVisible: false }, partnerProduct: { revision: 0, isVisible: false, annualFee: null, conditions: null, disclosure: null, description: null, imageUrl: null },
          article: { revision: 0, status: "DRAFT", kind: "ARTICLE", publishedAt: null, thumbnail: null, searchText: "" },
          supportTicket: { revision: 0, status: "OPEN", productId: null },
          user: { securityVersion: 0, revision: 0, status: "ACTIVE", role: "USER", phone: null, city: null, avatarUrl: null },
          verificationToken: { attempts: 0, consumedAt: null },
          refreshToken: { usedAt: null, revokedAt: null, persistent: false },
          onboardingDraft: { revision: 1 }, financialProfile: { revision: 1 },
          retirementPlan: { revision: 0, currentVersionId: null, baselineVersionId: null, stale: false },
          knowledgeSource: { revision: 0, indexedHash: null, validUntil: null, isApproved: false, status: "PENDING", referenceCode: null, fileUrl: null },
          aiMessage: { context: null, citedSources: null, tokensUsed: null, requestKey: null },
          assumptionSetVersion: { status: "DRAFT", revision: 1, effectiveAt: null, publishedBy: null },
          outboxEvent: { status: "PENDING", attempts: 0, availableAt: now, lockedUntil: null, leaseId: null, completedAt: null },
        };
        const row = { ...defaults, ...modelDefaults[name], ...structuredClone(data) };
        tables[name].push(row);
        return decorate(row, options);
      },
      update: async (options: Row) => {
        const row = tables[name].find(r => match(r, options.where));
        if (!row) throw new Error("Missing fixture");
        mutate(row, options.data); return structuredClone(row);
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = tables[name].filter(r => match(r, where));
        rows.forEach(r => mutate(r, data)); return { count: rows.length };
      },
      delete: async ({ where }: Row) => {
        const index = tables[name].findIndex(r => match(r, where));
        if (index < 0) throw new Error("Missing fixture");
        return tables[name].splice(index, 1)[0];
      },
      deleteMany: async ({ where }: Row = {}) => { const previous=tables[name].length; tables[name]=tables[name].filter(r=>!match(r,where)); return {count:previous-tables[name].length}; },
      upsert: async (options: Row) => await db[name].findUnique(options)
        ? db[name].update({ where: options.where, data: options.update })
        : db[name].create({ data: options.create }),
    };
  }
  db.$queryRaw = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    // Emulates PlansService.versions() summary projection (verified against PostgreSQL separately).
    if (/^SELECT id, version, "createdAt", "profileRevision",\s+"inputSnapshot"->>'integrityHash' AS "snapshotHash", "inputSnapshot"->'preview'->'references' AS "references", "result"->'summary' AS "summary"\s+FROM plan_versions WHERE "planId" = \? ORDER BY version DESC OFFSET \? LIMIT \?$/.test(parts.join("?"))) {
      const [planId, offset, limit] = values as [string, number, number];
      return tables.planVersion.filter(r => r.planId === planId).sort((a, b) => b.version - a.version).slice(offset, offset + limit)
        .map(r => structuredClone({ id: r.id, version: r.version, createdAt: r.createdAt, profileRevision: r.profileRevision,
          snapshotHash: r.inputSnapshot?.integrityHash ?? null, references: r.inputSnapshot?.preview?.references ?? null, summary: r.result?.summary ?? null }));
    }
    if (parts.join("?") !== "SELECT id FROM users WHERE id = ? FOR UPDATE") throw new Error("Unsupported memory DB SQL");
    return tables.user.filter(u => u.id === values[0]).map(u => ({ id: u.id }));
  };
  db.$transaction = async (work: (tx: any) => Promise<unknown>) => {
    const snapshot = structuredClone(tables);
    try { return await work(db); } catch (error) {
      for (const name of names) tables[name] = snapshot[name];
      throw error;
    }
  };
  return { db: db as PrismaClient, rows: (name: string) => tables[name], failWrites: (name?: string) => { failModel = name; } };
}
