import type { z } from "zod";
import { digest } from "../../common/digest";
import { AppError } from "../../common/errors";
import type { futureChangeSchema, sourceChangeSchema } from "../actuals/schema";
import type { MonthlyInput } from "./engine";
import { assertSourceTotals, sealSourceRegistry, sealSourceRevision, type SourceRegistry, type SourceCell } from "./sources";

/** A legacy snapshot has no source revision chain. Materialize its already pinned
 * history into the FIRST registry, preserving the original snapshot hash and each
 * change in the evidence hash. Never rewrite the legacy snapshot itself. */
export function importLegacySourceChanges(base: SourceRegistry, remaining: MonthlyInput[], retirementMonth: string,
  changes: z.infer<typeof sourceChangeSchema>[], totals: z.infer<typeof futureChangeSchema>[], originHash: string, knownOn: string) {
  if (!remaining.length) throw new AppError(422, "SOURCE_COMPOSITION_EMPTY", "Không còn tháng dự báo.");
  const first = remaining[0].month, last = remaining.at(-1)!.month;
  const revisions = base.revisions.map(source => {
    const related = changes.filter(c => c.kind === "PENSION_REPLACE" ? source.sourceId === "profile:pension"
      : c.kind === "FLOW_REPLACE" ? source.sourceId === `profile:${c.sourceType === "INCOME" ? "income" : "expense"}:${c.sourceId}`
      : source.sourceId === `profile:${c.kind === "DEBT_SETTLED" ? "debt" : "asset"}:${c.sourceId}`);
    let schedule = source.schedule.filter(c => first <= c.month && c.month <= last);
    for (const change of related) {
      if (change.kind === "DEBT_SETTLED" || change.kind === "ASSET_REALIZED") { schedule = []; continue; }
      const metricAt = (month: string) => change.kind === "PENSION_REPLACE" ? "pension" as const
        : change.sourceType === "INCOME" ? "income" as const : month < retirementMonth ? "livingExpense" as const : "additionalExpense" as const;
      schedule = schedule.filter(c => c.month < change.startMonth || c.month > change.endMonth);
      schedule.push(...remaining.filter(r => r.month >= change.startMonth && r.month <= change.endMonth)
        .map(r => ({ month: r.month, metric: metricAt(r.month), amount: change.monthlyAmount })));
    }
    const { sourceHash: _, ...draft } = source;
    return sealSourceRevision({ ...draft, effectiveFromMonth: first, effectiveToMonth: last, knownOn,
      evidenceHash: digest({ originalEvidenceHash: source.evidenceHash, legacyChanges: related, originHash }), schedule: schedule.sort((a, b) => a.month.localeCompare(b.month)) });
  });
  // Old aggregate replacements can overlap across versions; last recorded wins,
  // exactly as the legacy updater did. Keep their attribution, not a fake flow.
  const winning = new Map<string, { change: typeof totals[number]; cell: SourceCell }>();
  for (const change of totals) {
    if (change.field === "plannedContribution") continue; // Explicit deposit policy remains pinned in the replay rows.
    for (const row of remaining) if (change.startMonth <= row.month && row.month <= change.endMonth)
      winning.set(`${row.month}:${change.field}`, { change, cell: { month: row.month, metric: change.field, amount: change.amount } });
  }
  for (const change of totals) {
    const schedule = [...winning.values()].filter(v => v.change.id === change.id).map(v => v.cell);
    if (!schedule.length) continue;
    revisions.push(sealSourceRevision({ sourceId: `legacy:aggregate:${change.id}`, revision: 1, previousHash: null,
      scope: "PLAN_VERSION", origin: "LEGACY_AGGREGATE", kind: "AGGREGATE", effectiveFromMonth: first, effectiveToMonth: last,
      knownOn, evidenceHash: digest({ change, originHash }), commandId: `legacy:${change.id}`, confirmation: "HYPOTHETICAL", operation: "CREATE", schedule }));
  }
  const registry = sealSourceRegistry({ schemaVersion: 1, startMonth: first, endMonth: last, knowledgeAsOf: knownOn, originHash, revisions });
  assertSourceTotals(registry, remaining);
  return registry;
}
