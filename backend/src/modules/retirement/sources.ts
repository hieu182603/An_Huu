import { z } from "zod";
import { addMonths, monthSchema, dateSchema } from "../../common/calendar";
import { digest } from "../../common/digest";
import { AppError } from "../../common/errors";
import { RetirementDecimal as D, type MonthlyInput } from "./engine";

export const sourceMetrics = ["income", "pension", "livingExpense", "additionalExpense", "debtPayment", "capitalInjection"] as const;
export type SourceMetric = typeof sourceMetrics[number];
const decimal = z.string().max(160).regex(/^(0|[1-9]\d*)(\.\d+)?$/)
  .refine(v => new D(v).lte("1e100"), "Số tiền vượt phạm vi.");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceCellSchema = z.object({ month: monthSchema, metric: z.enum(sourceMetrics), amount: decimal }).strict();
export const sourceRevisionSchema = z.object({
  sourceId: z.string().min(1).max(200), revision: z.number().int().min(1),
  previousHash: hash.nullable(), sourceHash: hash,
  scope: z.literal("PLAN_VERSION"), origin: z.enum(["PINNED_PROFILE", "PLAN_CREATED", "LEGACY_AGGREGATE", "PLAN_ASSUMPTION"]),
  kind: z.enum(["INCOME", "EXPENSE", "PENSION", "ASSET_CAPITAL", "DEBT", "AGGREGATE"]),
  effectiveFromMonth: monthSchema, effectiveToMonth: monthSchema,
  knownOn: dateSchema, evidenceHash: hash, commandId: z.string().min(1).max(200),
  confirmation: z.enum(["USER_CONFIRMED", "HYPOTHETICAL", "BANK_CONFIRMED"]),
  operation: z.enum(["CREATE", "REVISE", "END"]),
  schedule: z.array(sourceCellSchema).max(7200),
}).strict();
export const sourceRegistrySchema = z.object({
  schemaVersion: z.literal(1), startMonth: monthSchema, endMonth: monthSchema,
  knowledgeAsOf: dateSchema, originHash: hash, registryHash: hash,
  revisions: z.array(sourceRevisionSchema).max(5000),
}).strict();
export type SourceRevision = z.infer<typeof sourceRevisionSchema>;
export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;
export type SourceCell = z.infer<typeof sourceCellSchema>;
type RevisionDraft = Omit<SourceRevision, "sourceHash">;
const fail = (code: string): never => { throw new AppError(422, code, "Cần rà soát lịch nguồn và phiên bản trước khi tính dự báo."); };
const revisionHash = ({ sourceHash: _, ...revision }: SourceRevision) => digest(revision);
const registryHash = ({ registryHash: _, ...registry }: SourceRegistry) => digest(registry);

export function sealSourceRevision(draft: RevisionDraft): SourceRevision {
  const { sourceHash: _, ...payload } = draft as RevisionDraft & { sourceHash?: string };
  return sourceRevisionSchema.parse({ ...payload, sourceHash: digest(payload) });
}
export function sealSourceRegistry(draft: Omit<SourceRegistry, "registryHash">): SourceRegistry {
  const { registryHash: _, ...payload } = draft as typeof draft & { registryHash?: string };
  const registry = sourceRegistrySchema.parse({ ...payload, registryHash: digest(payload) });
  assertSourceRegistry(registry);
  return registry;
}

/** Structural integrity is not authorization. Services must independently pin
 * ownership and preview/actual revisions before these immutable inputs are used. */
export function assertSourceRegistry(input: SourceRegistry): void {
  const parsed = sourceRegistrySchema.safeParse(input);
  if (!parsed.success) fail("SOURCE_REGISTRY_INVALID");
  if (registryHash(input) !== input.registryHash) fail("SOURCE_REGISTRY_HASH_MISMATCH");
  if (input.startMonth > input.endMonth || addMonths(input.startMonth, 1199) < input.endMonth) fail("SOURCE_REGISTRY_HORIZON_INVALID");
  if (input.revisions.reduce((count, revision) => count + revision.schedule.length, 0) > 300000) fail("SOURCE_REGISTRY_TOO_LARGE");
  const latest = new Map<string, SourceRevision>(), commandIds = new Set<string>();
  for (const revision of input.revisions) {
    if (revisionHash(revision) !== revision.sourceHash) fail("SOURCE_REVISION_HASH_MISMATCH");
    if (commandIds.has(revision.commandId)) fail("SOURCE_COMMAND_REUSED");
    commandIds.add(revision.commandId);
    const previous = latest.get(revision.sourceId);
    if (!previous) {
      if (revision.revision !== 1 || revision.previousHash !== null || revision.operation !== "CREATE") fail("SOURCE_REVISION_CHAIN_INVALID");
    } else if (previous.operation === "END" || revision.operation === "CREATE" || revision.revision !== previous.revision + 1 ||
      revision.previousHash !== previous.sourceHash || revision.kind !== previous.kind || revision.origin !== previous.origin ||
      revision.effectiveFromMonth < previous.effectiveFromMonth || revision.knownOn < previous.knownOn) fail("SOURCE_REVISION_CHAIN_INVALID");
    if (revision.knownOn > input.knowledgeAsOf || revision.effectiveFromMonth < input.startMonth ||
      revision.effectiveToMonth > input.endMonth || revision.effectiveFromMonth > revision.effectiveToMonth) fail("SOURCE_REVISION_PERIOD_INVALID");
    if (revision.operation === "END" && revision.schedule.length) fail("ENDED_SOURCE_HAS_CASHFLOWS");
    const seen = new Set<string>();
    for (const cell of revision.schedule) {
      const key = `${cell.month}:${cell.metric}`;
      if (seen.has(key)) fail("SOURCE_SCHEDULE_DUPLICATE");
      seen.add(key);
      if (cell.month < revision.effectiveFromMonth || cell.month > revision.effectiveToMonth) fail("SOURCE_SCHEDULE_OUTSIDE_REVISION");
      const permitted = revision.kind === "AGGREGATE" ? revision.origin === "LEGACY_AGGREGATE"
        : revision.kind === "INCOME" ? cell.metric === "income"
        : revision.kind === "EXPENSE" ? ["livingExpense", "additionalExpense"].includes(cell.metric)
        : revision.kind === "PENSION" ? cell.metric === "pension"
        : revision.kind === "DEBT" ? cell.metric === "debtPayment"
        : ["income", "capitalInjection"].includes(cell.metric);
      if (!permitted) fail("SOURCE_METRIC_MISMATCH");
    }
    latest.set(revision.sourceId, revision);
  }
}

export function composeSourceMonths(registry: SourceRegistry, from = registry.startMonth, through = registry.endMonth) {
  assertSourceRegistry(registry);
  monthSchema.parse(from); monthSchema.parse(through);
  if (from < registry.startMonth || through > registry.endMonth || from > through) fail("SOURCE_COMPOSITION_OUTSIDE_HORIZON");
  const bySource = new Map<string, SourceRevision[]>();
  for (const revision of registry.revisions) bySource.set(revision.sourceId, [...(bySource.get(revision.sourceId) ?? []), revision]);
  const attribution: Array<SourceCell & { sourceId: string; sourceRevision: number; sourceHash: string; confirmation: SourceRevision["confirmation"] }> = [];
  const rows: Array<Pick<MonthlyInput, "month" | SourceMetric>> = [];
  // Resolve each revision's cells once: avoid a quadratic scan of long histories.
  const cells = new Map(registry.revisions.map(r => [r.sourceHash, new Map<string, SourceCell[]>()]));
  for (const revision of registry.revisions) for (const cell of revision.schedule) {
    const index = cells.get(revision.sourceHash)!;
    index.set(cell.month, [...(index.get(cell.month) ?? []), cell]);
  }
  for (let month = from; month <= through; month = addMonths(month, 1)) {
    const totals = Object.fromEntries(sourceMetrics.map(metric => [metric, new D(0)])) as Record<SourceMetric, InstanceType<typeof D>>;
    const active: SourceRevision[] = [];
    for (const revisions of bySource.values()) {
      // A replacement remains the latest revision after its own end; an older
      // schedule never silently resumes when a revision has a finite interval.
      const revision = revisions.filter(r => r.effectiveFromMonth <= month).at(-1);
      if (revision && revision.operation !== "END" && month <= revision.effectiveToMonth) active.push(revision);
    }
    const aggregateMetrics = new Set<SourceMetric>();
    for (const revision of active.filter(r => r.origin === "LEGACY_AGGREGATE")) for (const cell of cells.get(revision.sourceHash)!.get(month) ?? []) {
      if (aggregateMetrics.has(cell.metric)) fail("AGGREGATE_SOURCE_OVERLAP");
      aggregateMetrics.add(cell.metric);
    }
    for (const revision of active) for (const cell of cells.get(revision.sourceHash)!.get(month) ?? []) {
      if (aggregateMetrics.has(cell.metric) && revision.origin !== "LEGACY_AGGREGATE") continue;
      totals[cell.metric] = totals[cell.metric].plus(cell.amount);
      attribution.push({ ...cell, sourceId: revision.sourceId, sourceRevision: revision.revision, sourceHash: revision.sourceHash, confirmation: revision.confirmation });
    }
    rows.push({ month, ...Object.fromEntries(sourceMetrics.map(metric => [metric, totals[metric].toFixed()])) } as Pick<MonthlyInput, "month" | SourceMetric>);
  }
  return { rows, attribution };
}

export function assertSourceTotals(registry: SourceRegistry, expected: MonthlyInput[]) {
  if (!expected.length) fail("SOURCE_COMPOSITION_EMPTY");
  const composed = composeSourceMonths(registry, expected[0].month, expected.at(-1)!.month);
  if (composed.rows.length !== expected.length) fail("SOURCE_TOTALS_MISMATCH");
  composed.rows.forEach((row, i) => {
    if (row.month !== expected[i].month || sourceMetrics.some(metric => !new D(row[metric]).eq(expected[i][metric]))) fail("SOURCE_TOTALS_MISMATCH");
  });
  return composed;
}
