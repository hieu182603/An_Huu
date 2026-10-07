import { z } from "zod";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
import { AppError } from "../../common/errors";
import { RetirementDecimal as D } from "../retirement/engine";
import type { SourceCell } from "../retirement/sources";
import { capitalAvailabilitySchema, assertCapitalAvailability } from "./availability";

export const capitalAllocationSchema = z.object({ allocationId: z.string().uuid(), eventId: z.string().uuid(), actualRevision: z.number().int().positive(),
  bookedOn: dateSchema, amount: moneySchema }).strict();
export const stagedFundingSchema = z.object({ status: z.literal("STAGED"), liquidity: z.enum(["AVAILABLE", "PLANNED_RELEASE"]),
  availability: capitalAvailabilitySchema.optional(),
  plannedNotIncludedInFund: z.literal(true), allocations: z.array(capitalAllocationSchema).max(100),
  plannedContributions: z.array(z.object({ installmentId: z.string().uuid(), month: monthSchema, amount: moneySchema,
    timing: z.literal("END_OF_MONTH") }).strict()).max(100),
  reconciliations: z.array(z.object({ scheduledMonth: monthSchema, actualRevision: z.number().int().positive(), receivedAllocationIds: z.array(z.string().uuid()).max(100),
    amountNotContributed: moneySchema, confirmedOn: dateSchema, reason: z.string().trim().min(1).max(1000), confirm: z.literal(true) }).strict()).max(100),
}).strict();
type Allocation = z.infer<typeof capitalAllocationSchema>;
const fail = (code: string, status = 422): never => { throw new AppError(status, code, "Cần đối chiếu các đợt góp đã nhận và dự kiến của cùng nguồn vốn."); };

/** Actual event ownership/limits are checked by the caller against the full
 * lineage. This function only reconciles this source's cumulative budget. */
export function stagedContributions(input: {
  funding: z.infer<typeof stagedFundingSchema>; priorRealized: Allocation[]; availableOn: string; confirmedTotal: string; limit: InstanceType<typeof D>;
  cutoff: string; knownOn: string; endMonth: string; elapsed: SourceCell[];
  actuals: Array<{ period: string; revision: number }>; evidence: Array<{ confirmedOn: string }>;
}) {
  const { funding: f, priorRealized, availableOn, confirmedTotal, cutoff, knownOn, endMonth, elapsed, actuals, evidence } = input;
  if (f.liquidity === "AVAILABLE" && availableOn > knownOn) fail("ASSET_CONTRIBUTION_NOT_AVAILABLE");
  const receipts = [...priorRealized, ...f.allocations];
  if (receipts.some(a => a.bookedOn < availableOn)) fail("ASSET_REALIZATION_MISMATCH");
  if (f.availability) assertCapitalAvailability({ availability: f.availability, availableOn, limit: input.limit, knownOn, cutoff,
    liquidity: f.liquidity, receipts, planned: f.plannedContributions });
  const ids = new Set<string>(), months = new Map<string, InstanceType<typeof D>>();
  for (const p of f.plannedContributions) {
    if (ids.has(p.installmentId) || new D(p.amount).lte(0)) fail("ASSET_INSTALLMENT_INVALID");
    ids.add(p.installmentId);
    if (p.month <= cutoff || p.month > endMonth || p.month < availableOn.slice(0, 7)) fail("ASSET_CONTRIBUTION_NOT_AVAILABLE");
    months.set(p.month, (months.get(p.month) ?? new D(0)).plus(p.amount));
  }
  const total = receipts.reduce((sum, a) => sum.plus(a.amount), new D(0)).plus([...months.values()].reduce((sum, a) => sum.plus(a), new D(0)));
  if (!total.eq(confirmedTotal)) fail("ASSET_INSTALLMENT_TOTAL_MISMATCH");
  if (elapsed.length !== f.reconciliations.length) fail("ASSET_INSTALLMENT_RECONCILIATION_REQUIRED");
  const reconciled = new Set<string>(), received = new Set<string>();
  for (const r of f.reconciliations) {
    const prior = elapsed.find(p => p.month === r.scheduledMonth), actual = actuals.find(a => a.period === r.scheduledMonth);
    const monthEnd = new Date(new Date(addMonths(r.scheduledMonth, 1) + "-01T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    if (!prior || reconciled.has(r.scheduledMonth) || r.confirmedOn < monthEnd || r.confirmedOn > knownOn ||
      !evidence.some(e => e.confirmedOn >= r.confirmedOn)) fail("ASSET_INSTALLMENT_RECONCILIATION_MISMATCH");
    reconciled.add(r.scheduledMonth);
    if (!actual || actual.revision !== r.actualRevision) fail("ASSET_ACTUAL_STALE_OR_MISSING", 409);
    let paid = new D(0);
    for (const id of r.receivedAllocationIds) {
      const a = f.allocations.find(a => a.allocationId === id);
      if (!a || received.has(id) || a.bookedOn > r.confirmedOn) fail("ASSET_INSTALLMENT_RECONCILIATION_MISMATCH");
      received.add(id); paid = paid.plus(a!.amount);
    }
    // Receipts can exceed an earlier forecast, but the cumulative net limit
    // and the newly confirmed total must still cover every received amount.
    if (!D.max(new D(prior!.amount).minus(paid), 0).eq(r.amountNotContributed)) fail("ASSET_INSTALLMENT_RECONCILIATION_MISMATCH");
  }
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, metric: "capitalInjection" as const, amount: amount.toFixed() }));
}
