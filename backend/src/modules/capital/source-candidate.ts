import { z } from "zod";
import { AppError } from "../../common/errors";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
import { digest } from "../../common/digest";
import { actualPayloadSchema } from "../actuals/schema";
import { reconcile } from "../actuals/reconcile";
import type { sourceChangeSchema } from "../actuals/schema";
import type { AssetEntry } from "../profiles/schema-v2";
import { RetirementDecimal as D } from "../retirement/engine";
import { assertSourceRegistry, composeSourceMonths, sealSourceRegistry, sealSourceRevision, type SourceRegistry, type SourceCell } from "../retirement/sources";
import { capitalAllocationSchema as allocation, stagedFundingSchema, stagedContributions } from "./staged-contributions";
import { assertAvailabilityHistory } from "./availability";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const share = z.string().regex(/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/);
const evidence = z.array(z.object({ reference: z.string().trim().min(1).max(1000), contentHash: hash, confirmedOn: dateSchema }).strict()).min(1).max(20);
const base = { commandId: z.string().uuid(), sourceId: z.string().min(1).max(200), expectedSourceRevision: z.number().int().nonnegative(),
  expectedSourceHash: hash.nullable(), confirm: z.literal(true), evidence };
const capital = z.object({ reference: z.string().trim().min(1).max(200), kind: z.enum(["ASSET_SALE", "LIQUID_CAPITAL"]),
  currency: z.literal("VND"), priceBasis: z.literal("NOMINAL_AT_AVAILABILITY"), amountScope: z.enum(["WHOLE_ASSET", "USER_SHARE"]),
  ownershipShare: share, retirementShare: share, grossAmount: moneySchema, fees: moneySchema, taxes: moneySchema, securedDebtSettlement: moneySchema,
  netAmount: moneySchema, availableOn: dateSchema, confirmedContributionAmount: moneySchema,
  funding: z.discriminatedUnion("status", [
    z.object({ status: z.literal("PLANNED"), liquidity: z.enum(["AVAILABLE", "PLANNED_RELEASE"]), notIncludedInFund: z.literal(true),
      contributionMonth: monthSchema, contributionTiming: z.literal("END_OF_MONTH") }).strict(),
    z.object({ status: z.literal("REALIZED"), allocations: z.array(allocation).max(100) }).strict(),
    stagedFundingSchema,
  ]) }).strict();
export const assetSourceCommandSchema = z.discriminatedUnion("operation", [
  z.object({ ...base, operation: z.literal("CREATE"), notAlreadyInSources: z.literal(true), capital }).strict(),
  z.object({ ...base, operation: z.literal("REVISE"), capital,
    rentalExit: z.object({ rentEndsOn: dateSchema, finalMonthIncome: moneySchema,
      amountScope: z.literal("SOURCE_SHARE"), confirm: z.literal(true) }).strict().optional(),
    missedContribution: z.object({ scheduledMonth: monthSchema, actualRevision: z.number().int().positive(),
      amountNotContributed: moneySchema, confirmedOn: dateSchema, reason: z.string().trim().min(1).max(1000),
      confirmNotContributed: z.literal(true) }).strict().optional() }).strict(),
  z.object({ ...base, operation: z.literal("END"), reason: z.string().trim().min(1).max(1000) }).strict(),
]);
export type AssetSourceCommand = z.infer<typeof assetSourceCommandSchema>;
export const capitalActualEvidenceSchema = z.object({ period: monthSchema, revision: z.number().int().positive(), data: actualPayloadSchema }).strict();
export type CapitalActualEvidence = z.infer<typeof capitalActualEvidenceSchema>;
export const assetSourceEvidenceSchema = z.object({ command: assetSourceCommandSchema, cutoff: monthSchema, knownOn: dateSchema,
  actuals: z.array(capitalActualEvidenceSchema).max(1200), consumed: z.array(allocation).max(10000),
  priorRealized: z.array(allocation).max(10000).optional() }).strict();
export type AssetSourceEvidence = z.infer<typeof assetSourceEvidenceSchema>;
export const assetAllocations = (c: AssetSourceCommand) => c.operation !== "END" && c.capital.funding.status !== "PLANNED" ? c.capital.funding.allocations : [];
const fail = (code: string, status = 422): never => { throw new AppError(status, code, "Cần rà soát nguồn vốn, phần sở hữu và chứng từ góp vào quỹ."); };

export function assertAssetCommandHistory(command: AssetSourceCommand, history: AssetSourceEvidence[], legacyChanges: z.infer<typeof sourceChangeSchema>[], profileAssets: AssetEntry[], cutoff: string) {
  const prior = history.filter(h => h.command.sourceId === command.sourceId).at(-1)?.command;
  const legacyRealized = legacyChanges.some(c => c.kind === "ASSET_REALIZED" && command.sourceId === `profile:asset:${c.sourceId}`);
  if (legacyRealized && !(command.operation === "REVISE" && command.capital.funding.status === "STAGED") &&
    !(command.operation === "END" && prior?.operation !== "END" && prior?.capital.funding.status === "STAGED")) fail("ASSET_ALREADY_REALIZED");
  if (prior && (prior.operation === "END" || (prior.capital.funding.status === "REALIZED" &&
    !(command.operation === "REVISE" && command.capital.funding.status === "STAGED")))) fail("ASSET_ALREADY_REALIZED");
  if (prior?.operation !== "END" && prior?.capital.funding.status === "STAGED" && command.operation !== "END" && command.capital.funding.status !== "STAGED")
    fail("ASSET_STAGED_HISTORY_REQUIRED");
  if (command.operation === "END") return;
  if (prior?.operation !== "END" && prior?.capital.funding.status === "STAGED")
    assertAvailabilityHistory(prior.capital.funding.availability, command.capital.funding.status === "STAGED" ? command.capital.funding.availability : undefined);
  const reference = command.capital.reference.toUpperCase();
  if (profileAssets.some(a => a.id.toUpperCase() === reference && command.sourceId !== `profile:asset:${a.id}`) ||
    history.some(h => h.command.sourceId !== command.sourceId && h.command.operation !== "END" && h.command.capital.reference.toUpperCase() === reference)) fail("ASSET_REFERENCE_ALREADY_EXISTS", 409);
  if (command.sourceId.startsWith("profile:asset:") && reference !== command.sourceId.slice("profile:asset:".length).toUpperCase()) fail("ASSET_IDENTITY_CHANGED");
  const profileAsset = profileAssets.find(a => command.sourceId === `profile:asset:${a.id}`);
  const rental = profileAsset?.housingPlan?.status === "CONFIRMED" && profileAsset.housingPlan.kind === "RENT";
  // A v3 ASSET_REALIZED already stopped this source's rent. Carry its receipt,
  // never reconstruct rental income or invent a historical termination date.
  if (rental && !legacyRealized && !(command.operation === "REVISE" && command.rentalExit)) fail("ASSET_RENTAL_REVIEW_REQUIRED");
  if (rental && legacyRealized && command.capital.kind !== "ASSET_SALE") fail("ASSET_RENTAL_EXIT_MISMATCH");
  if (command.operation === "REVISE" && command.rentalExit && prior?.operation === "REVISE" && prior.rentalExit &&
    prior.rentalExit.rentEndsOn.slice(0, 7) <= cutoff && digest(command.rentalExit) !== digest(prior.rentalExit)) fail("ASSET_RENTAL_HISTORY_IMMUTABLE");
  const originalMonth = profileAsset?.housingPlan?.status === "CONFIRMED" ? profileAsset.housingPlan.startMonth
    : profileAsset?.availableFromMonth.status === "KNOWN" ? profileAsset.availableFromMonth.value : null;
  if (!prior && !rental && originalMonth && originalMonth <= cutoff && command.capital.funding.status === "PLANNED" &&
    !(command.operation === "REVISE" && command.missedContribution)) fail("ASSET_PAST_CONTRIBUTION_REVIEW_REQUIRED");
  if (prior && prior.operation !== "END" && (reference !== prior.capital.reference.toUpperCase() || command.capital.kind !== prior.capital.kind)) fail("ASSET_IDENTITY_CHANGED");
}

export function legacyCapitalAllocations(changes: z.infer<typeof sourceChangeSchema>[], actuals: CapitalActualEvidence[]): ReturnType<typeof assetAllocations> {
  return changes.filter(c => c.kind === "ASSET_REALIZED").map(c => {
    const actual = actuals.find(a => a.period === c.actual.period), entry = actual?.data.entries.find(e => e.eventId === c.actual.eventId);
    if (!actual || !entry || entry.kind !== "CONTRIBUTION") fail("ASSET_ACTUAL_STALE_OR_MISSING", 409);
    return { allocationId: c.id, eventId: entry!.eventId, actualRevision: actual!.revision, bookedOn: entry!.date, amount: entry!.amount };
  });
}

export function priorCapitalAllocations(sourceId: string, history: AssetSourceEvidence[], changes: z.infer<typeof sourceChangeSchema>[], actuals: CapitalActualEvidence[]) {
  return [...legacyCapitalAllocations(changes.filter(c => c.kind === "ASSET_REALIZED" && sourceId === `profile:asset:${c.sourceId}`), actuals),
    ...history.filter(h => h.command.sourceId === sourceId).flatMap(h => assetAllocations(h.command))];
}

/** Explicit contributions only. Net proceeds and debt settlement do not become
 * income, close a debt, or edit the actual anchor. All deductions use one scope. */
export function assetSourceCandidate(registry: SourceRegistry, value: AssetSourceCommand, actualValues: CapitalActualEvidence[],
  consumed: ReturnType<typeof assetAllocations>, cutoff: string, knownOn: string, priorRealized: ReturnType<typeof assetAllocations> = []) {
  const command = assetSourceCommandSchema.parse(value);
  assertSourceRegistry(registry); monthSchema.parse(cutoff); dateSchema.parse(knownOn);
  const from = addMonths(cutoff, 1), previous = registry.revisions.filter(s => s.sourceId === command.sourceId).at(-1);
  if (from < registry.startMonth || from > registry.endMonth || knownOn < registry.knowledgeAsOf || command.evidence.some(e => e.confirmedOn > knownOn)) fail("ASSET_SOURCE_PERIOD_INVALID");
  if (command.operation === "CREATE" ? previous || command.expectedSourceRevision !== 0 || command.expectedSourceHash !== null ||
    !/^plan:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(command.sourceId)
    : !previous || previous.operation === "END" || previous.kind !== "ASSET_CAPITAL" || previous.revision !== command.expectedSourceRevision || previous.sourceHash !== command.expectedSourceHash)
    fail("ASSET_SOURCE_REVISION_CONFLICT", 409);
  const rentalBasis = registry.revisions.find(s => s.sourceId === command.sourceId && s.schedule.some(c => c.metric === "income"));
  const rentalExit = command.operation === "REVISE" ? command.rentalExit : undefined;
  if (rentalBasis && command.operation !== "END" && !rentalExit) fail("ASSET_RENTAL_REVIEW_REQUIRED");
  if (rentalExit && !rentalBasis) fail("ASSET_RENTAL_EXIT_MISMATCH");
  if (composeSourceMonths(registry, from, registry.endMonth).attribution.some(a => (a.metric === "capitalInjection" || (rentalBasis && a.metric === "income")) && registry.revisions.some(s => s.sourceHash === a.sourceHash && s.kind === "AGGREGATE"))) fail("SOURCE_AGGREGATE_OVERLAP");
  const actuals = actualValues.map(a => capitalActualEvidenceSchema.parse(a));
  const events = new Map<string, { actual: CapitalActualEvidence; entry: CapitalActualEvidence["data"]["entries"][number] }>();
  const periods = new Set<string>();
  for (const actual of actuals) {
    if (actual.period > cutoff || periods.has(actual.period) || reconcile(actual.data).reconciliation !== "MATCHED") fail("ASSET_ACTUAL_UNRECONCILED", 409);
    periods.add(actual.period);
    for (const entry of actual.data.entries) {
      if (events.has(entry.eventId) || entry.date.slice(0, 7) !== actual.period) fail("ASSET_ACTUAL_EVENT_INVALID", 409);
      events.set(entry.eventId, { actual, entry });
    }
  }
  const used = new Set<string>(), totals = new Map<string, InstanceType<typeof D>>();
  for (const a of [...consumed, ...assetAllocations(command)]) {
    allocation.parse(a);
    const event = events.get(a.eventId);
    if (used.has(a.allocationId)) fail("ASSET_ALLOCATION_REUSED", 409);
    used.add(a.allocationId);
    if (!event || event.actual.revision !== a.actualRevision || event.entry.date !== a.bookedOn || event.entry.kind !== "CONTRIBUTION" || a.bookedOn > knownOn) fail("ASSET_ACTUAL_STALE_OR_MISSING", 409);
    const amount = (totals.get(a.eventId) ?? new D(0)).plus(a.amount);
    if (new D(a.amount).lte(0) || amount.gt(event!.entry.amount)) fail("ASSET_EVENT_OVERALLOCATED", 409);
    totals.set(a.eventId, amount);
  }
  const schedule: SourceCell[] = [];
  if (rentalExit && command.operation === "REVISE") {
    const endMonth = rentalExit.rentEndsOn.slice(0, 7);
    const final = rentalBasis!.schedule.find(c => c.metric === "income" && c.month === endMonth);
    if (command.capital.kind !== "ASSET_SALE" || !final || rentalExit.rentEndsOn > command.capital.availableOn ||
      (rentalExit.rentEndsOn <= knownOn && !command.evidence.some(e => e.confirmedOn >= rentalExit.rentEndsOn))) fail("ASSET_RENTAL_EXIT_MISMATCH");
    if (endMonth <= cutoff && !actuals.some(a => a.period === endMonth)) fail("ASSET_ACTUAL_STALE_OR_MISSING", 409);
    // Final rent is an explicit net amount for this source, not an inferred
    // daily proration or a second ownership/retirement-share multiplication.
    for (const cell of rentalBasis!.schedule.filter(c => c.metric === "income" && c.month >= from && c.month <= endMonth))
      schedule.push({ ...cell, amount: cell.month === endMonth ? rentalExit.finalMonthIncome : cell.amount });
  }
  const missed = command.operation === "REVISE" ? command.missedContribution : undefined;
  // Only the latest source revision can be postponed. Earlier missed schedules
  // remain in historical snapshots and must not be counted as new obligations.
  const elapsed = previous?.schedule.filter(c => c.metric === "capitalInjection" && c.month >= previous.effectiveFromMonth &&
    c.month <= cutoff && new D(c.amount).gt(0)) ?? [];
  if (missed) {
    const actual = actuals.find(a => a.period === missed.scheduledMonth);
    const monthEnd = new Date(new Date(addMonths(missed.scheduledMonth, 1) + "-01T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    if (command.operation !== "REVISE" || command.capital.funding.status !== "PLANNED" || elapsed.length !== 1 ||
      elapsed[0].month !== missed.scheduledMonth || !new D(elapsed[0].amount).eq(missed.amountNotContributed) ||
      missed.confirmedOn < monthEnd || missed.confirmedOn > knownOn || !command.evidence.some(e => e.confirmedOn >= missed.confirmedOn))
      fail("ASSET_MISSED_CONTRIBUTION_MISMATCH");
    if (!actual || actual.revision !== missed.actualRevision) fail("ASSET_ACTUAL_STALE_OR_MISSING", 409);
  }
  if (command.operation !== "END") {
    const c = command.capital;
    const net = new D(c.grossAmount).minus(c.fees).minus(c.taxes).minus(c.securedDebtSettlement);
    const limit = net.mul(c.amountScope === "WHOLE_ASSET" ? c.ownershipShare : "1").mul(c.retirementShare);
    if (new D(c.ownershipShare).lte(0) || net.lt(0) || !net.eq(c.netAmount) || new D(c.confirmedContributionAmount).gt(limit)) fail("ASSET_NET_CONTRIBUTION_MISMATCH");
    if (c.funding.status === "PLANNED") {
      const f = c.funding;
      if (f.contributionMonth < from || f.contributionMonth > registry.endMonth || f.contributionMonth < c.availableOn.slice(0, 7) ||
        (f.liquidity === "AVAILABLE" && c.availableOn > knownOn)) fail("ASSET_CONTRIBUTION_NOT_AVAILABLE");
      // Moving an already elapsed one-off injection needs actual reconciliation;
      // simply re-dating it would make the same asset available twice.
      if (elapsed.length && !missed) fail("ASSET_PAST_CONTRIBUTION_REVIEW_REQUIRED");
      schedule.push({ month: f.contributionMonth, metric: "capitalInjection" as const, amount: c.confirmedContributionAmount });
    } else if (c.funding.status === "STAGED") {
      if (priorRealized.some(a => !consumed.some(c => digest(c) === digest(a)))) fail("ASSET_SOURCE_EVIDENCE_MISMATCH", 409);
      schedule.push(...stagedContributions({ funding: c.funding, priorRealized, availableOn: c.availableOn, confirmedTotal: c.confirmedContributionAmount, limit,
        cutoff, knownOn, endMonth: registry.endMonth, elapsed, actuals, evidence: command.evidence }));
    } else {
      if (c.availableOn > knownOn || c.availableOn.slice(0, 7) > cutoff || c.funding.allocations.some(a => a.bookedOn < c.availableOn) ||
        !c.funding.allocations.reduce((sum, a) => sum.plus(a.amount), new D(0)).eq(c.confirmedContributionAmount)) fail("ASSET_REALIZATION_MISMATCH");
    }
  }
  const staged = command.operation !== "END" && command.capital.funding.status === "STAGED";
  const proof = assetSourceEvidenceSchema.parse(JSON.parse(JSON.stringify({ command, cutoff, knownOn, actuals, consumed, ...(staged ? { priorRealized } : {}) })));
  const revision = sealSourceRevision({ sourceId: command.sourceId, revision: (previous?.revision ?? 0) + 1, previousHash: previous?.sourceHash ?? null,
    scope: "PLAN_VERSION", origin: previous?.origin ?? "PLAN_CREATED", kind: "ASSET_CAPITAL", operation: command.operation,
    commandId: command.commandId, knownOn, effectiveFromMonth: from, effectiveToMonth: registry.endMonth,
    confirmation: command.operation === "END" || command.capital.funding.status === "REALIZED" ||
      (command.capital.funding.status === "STAGED" && !schedule.length) ? "USER_CONFIRMED" : "HYPOTHETICAL",
    evidenceHash: digest(proof), schedule });
  return { registry: sealSourceRegistry({ ...registry, knowledgeAsOf: knownOn, revisions: [...registry.revisions, revision] }), sourceHash: revision.sourceHash, evidence: proof };
}

export function replayAssetSource(registry: SourceRegistry, sourceHash: string, value: AssetSourceEvidence) {
  const proof = assetSourceEvidenceSchema.parse(value), index = registry.revisions.findIndex(s => s.sourceHash === sourceHash);
  if (index < 0 || registry.revisions[index].evidenceHash !== digest(proof)) fail("ASSET_SOURCE_EVIDENCE_MISMATCH", 409);
  const prefix = sealSourceRegistry({ ...registry, knowledgeAsOf: proof.knownOn, revisions: registry.revisions.slice(0, index) });
  if (proof.command.operation !== "END" && proof.command.capital.funding.status === "STAGED" && !proof.priorRealized) fail("ASSET_SOURCE_EVIDENCE_MISMATCH", 409);
  if (assetSourceCandidate(prefix, proof.command, proof.actuals, proof.consumed, proof.cutoff, proof.knownOn, proof.priorRealized).sourceHash !== sourceHash) fail("ASSET_SOURCE_EVIDENCE_MISMATCH", 409);
}
