import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plansFixture } from "./plans-fixtures";
import { debtFixture } from "./debt-fixtures";
import { retirementProfile } from "./retirement-fixtures";
import { known } from "./profile-v2-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { sourceReforecastSchema, type SourceReforecastCommand } from "../modules/plans/source-schema";
import { loanContractV2Schema } from "../modules/debts/revision-schema";
import { loanSourceRevisionSchema } from "../modules/debts/source-candidate";
import { plannedPairCommandSchema } from "../modules/debts/planned-refinance-source";
import { readSourceSnapshot } from "../modules/plans/source-snapshot";
import { addMonths } from "../common/calendar";
import { digest } from "../common/digest";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-05T00:00:00Z"));
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
const evidence = [{ reference: "Synthetic loan statement and refinance quote", contentHash: "a".repeat(64), confirmedOn: "2026-12-05" }];
const OLD = "profile:debt:loan-a";
const monthEnd = (month: string) => new Date(Date.parse(addMonths(month, 1) + "-01T00:00:00Z") - 86400000).toISOString().slice(0, 10);
function periods(from: string, dates: string[]) {
  return dates.map(dueDate => { const accrualFrom = from; from = dueDate;
    return { accrualFrom, dueDate, rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: (Date.parse(dueDate) - Date.parse(accrualFrom)) / 86400000, yearDays: 365 },
      fee: "0", carriedInterest: "0", gracePrincipal: false, bankPayment: null }; });
}
/** 100/month at each month end after balanceAsOf, through 2027-07. */
function contract(balanceAsOf: string, principal: string, knownOn = "2026-12-05") {
  const months: string[] = [];
  for (let m = addMonths(balanceAsOf.slice(0, 7), 1); m <= "2027-07"; m = addMonths(m, 1)) months.push(monthEnd(m));
  return loanContractV2Schema.parse({ contractVersion: 2, currency: "VND", signedOn: "2026-01-01", amendedOn: balanceAsOf, effectiveOn: balanceAsOf, knownOn,
    confirmation: "BANK_CONFIRMED", evidence, balanceAsOf, principalBalance: principal, balanceScope: "FULL_CONTRACT", paymentShare: "1",
    responsibility: { kind: "ALLOCATED_SHARE" }, interestBasis: "REDUCING_BALANCE", rounding: "CENT_HALF_UP", mode: "REDUCE_PAYMENT_KEEP_TERM",
    fixedPayment: null, finalPayment: "ADJUST_FINAL_PAYMENT", maturityDate: "2027-07-31", periods: periods(balanceAsOf, months) });
}
const sum = (preview: { candidate: { calculation: { attribution: Array<{ sourceId: string; amount: string }> } } | null }, sourceId: string) =>
  preview.candidate!.calculation.attribution.filter(a => a.sourceId === sourceId).reduce((n, a) => n + Number(a.amount), 0);

async function fixture() {
  const profile = retirementProfile(), debt = debtFixture();
  profile.debts = { status: "KNOWN", entries: [debt] };
  if (profile.income.status === "KNOWN") profile.income.entries[0].amount = known("10000");
  const f = await plansFixture(profile), saved = await f.create(), actuals = new ActualsService(f.db);
  const payments: Record<string, string> = {};
  const writeActual = async (period: string, opening: string, closing: string) => {
    const eventId = randomUUID(); payments[period] = eventId;
    await actuals.write(f.owner, period, { expectedRevision: 0, data: { currency: "VND", openingBalance: opening, closingBalance: closing,
      correctionReason: "Synthetic verified statement", entries: [{ eventId, date: period + "-28", kind: "DEBT_PAYMENT", amount: "100" },
        { eventId: randomUUID(), date: period + "-28", kind: "WITHDRAWAL", amount: "100" }] } }, randomUUID());
  };
  await writeActual("2026-10", "1000", "900");
  const input = (parent: { id: string; snapshotHash: string }, revision: number, throughMonth: string, extra: Partial<SourceReforecastCommand> = {}) =>
    sourceReforecastSchema.parse({ versionId: parent.id, expectedSnapshotHash: parent.snapshotHash, expectedRevision: revision,
      expectedProfileRevision: 1, throughMonth, sourceCommands: [], ...extra });
  const allocation = (period: string) => ({ allocationId: randomUUID(), eventId: payments[period], actualRevision: 1, bookedOn: period + "-28", scope: "FULL_CONTRACT",
    components: { principal: "100", interest: "0", prepaymentFee: "0", otherFee: "0" }, contractComponents: { principal: "100", interest: "0", prepaymentFee: "0", otherFee: "0" },
    paymentStatus: "CURRENT", allocationBasis: "BANK_STATEMENT", evidence });
  // v1 profile debt → v2 contract pinned at the 2026-10 cutoff.
  const base = input(saved.saved, 1, "2026-10");
  const ready = await f.plans.previewSources(f.owner, saved.planId, base), option = ready.loanRevisionOptions.find(o => o.sourceId === OLD)!;
  expect(ready.plannedRefinanceOptions.eligibleLoans).toEqual([]);
  base.loanRevisions = [loanSourceRevisionSchema.parse({ commandId: randomUUID(), sourceId: OLD, operation: "REVISE", expectedSourceRevision: option.sourceRevision,
    expectedSourceHash: option.sourceHash, expectedContractHash: option.contractHash, confirm: true, contract: contract("2026-10-31", "900"),
    allocations: [allocation("2026-10")], principalAdvances: [],
    legacyOpening: { signedOn: "2026-01-01", amendedOn: null, effectiveOn: "2026-01-01", knownOn: "2026-12-05", previouslyPaid: "0", evidence } })];
  const bp = await f.plans.previewSources(f.owner, saved.planId, base);
  const v2 = await f.plans.saveSources(f.owner, saved.planId, { preview: base, expectedInputHash: bp.inputHash!, confirm: true }, randomUUID());
  return { ...f, saved, v2, input, writeActual, allocation };
}
function createPair(option: { sourceId: string; sourceRevision: number; sourceHash: string; contractHash: string }) {
  const replacementCommandId = randomUUID(), sourceId = "plan:" + randomUUID();
  return plannedPairCommandSchema.parse({ commandId: randomUUID(), replacementCommandId, pairId: randomUUID(), operation: "CREATE", expectedPairHash: null,
    oldSource: { sourceId: option.sourceId, revision: option.sourceRevision, sourceHash: option.sourceHash }, newSource: { sourceId, revision: 0, sourceHash: null },
    expectedContractHash: option.contractHash, confirm: true,
    terms: { settledOn: "2026-12-15", sameDayOrder: "BEFORE_SCHEDULED_PAYMENT",
      // Nov instalment retained → 800 principal; quote 800+20 fee; new loan 800 gross, 10 withheld.
      payoffQuote: { principal: "800", interest: "0", carriedInterest: "0", prepaymentFee: "20", otherFee: "0", allRemainingChargesIncluded: true, valueKind: "HYPOTHETICAL_QUOTE", evidence },
      funding: { scope: "FULL_CONTRACT", externalTopUp: "30", userTopUp: "30", userFinancedAmount: "790", unusedProceeds: "0", unusedProceedsNotContributed: true, evidence },
      replacement: { commandId: replacementCommandId, sourceId, operation: "CREATE", expectedSourceRevision: 0, confirm: true, agreementReference: "Scenario refinance",
        contract: { ...contract("2026-10-31", "900"), confirmation: "HYPOTHETICAL", balanceNature: "PROJECTED_DISBURSEMENT", balanceAsOf: "2026-12-15", principalBalance: "800",
          maturityDate: "2027-07-31", periods: periods("2026-12-15", ["2027-01-31", "2027-03-31", "2027-05-31", "2027-07-31"]) },
        funding: { kind: "PLANNED_DISBURSEMENT", grossPrincipal: "800", withheldFees: "10", netDisbursement: "790", destination: "EXTERNAL_ACCOUNT", evidence } } } });
}

it("plans a refinance pair, locks both loans, keeps it across a cutoff advance and requires reconciliation once the date passes", async () => {
  const f = await fixture();
  const start = f.input(f.v2.saved, 2, "2026-10"), ready = await f.plans.previewSources(f.owner, f.saved.planId, start);
  expect(ready.plannedRefinanceOptions.eligibleLoans.map(o => o.sourceId)).toEqual([OLD]);
  const pair = createPair(ready.plannedRefinanceOptions.eligibleLoans[0]);
  start.plannedRefinances = [pair];
  const p = await f.plans.previewSources(f.owner, f.saved.planId, start);
  // Old loan: Nov instalment 100 + Dec top-up 30. New loan: 800 over four instalments. Fund is untouched.
  expect(sum(p, OLD)).toBe(130);
  expect(sum(p, pair.newSource.sourceId)).toBe(400); // plan horizon ends 2027-03
  expect(p.candidate!.calculation.rows[0].openingBalance).toBe("900");
  expect(p.loanRevisionOptions.map(o => o.sourceId)).not.toContain(OLD);
  expect(p.plannedRefinanceOptions.activePairs).toMatchObject([{ pairId: pair.pairId, settledOn: "2026-12-15", reviseAllowed: true }]);
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, { preview: start, expectedInputHash: p.inputHash!, confirm: true }, randomUUID());
  const read = await f.plans.version(f.owner, f.saved.planId, saved.saved.id, true);
  expect("replay" in read && read.replay.matched).toBe(true);

  // Half-edit of a paired loan is refused.
  const half = f.input(saved.saved, 3, "2026-10");
  half.loanRevisions = [loanSourceRevisionSchema.parse({ commandId: randomUUID(), sourceId: OLD, operation: "REVISE", expectedSourceRevision: 3,
    expectedSourceHash: "b".repeat(64), expectedContractHash: "c".repeat(64), confirm: true, contract: contract("2026-10-31", "900"), allocations: [], principalAdvances: [] })];
  await expect(f.plans.previewSources(f.owner, f.saved.planId, half)).rejects.toMatchObject({ code: "PLANNED_PAIR_SOURCE_LOCKED" });

  // Option A: an actual month before the planned date keeps the pair untouched; REVISE then needs re-anchoring.
  await f.writeActual("2026-11", "900", "800");
  const kept = await f.plans.previewSources(f.owner, f.saved.planId, f.input(saved.saved, 3, "2026-11"));
  expect(kept.status).toBe("READY");
  expect(sum(kept, pair.newSource.sourceId)).toBe(400);
  expect(kept.plannedRefinanceOptions.activePairs[0].reviseAllowed).toBe(false);

  vi.setSystemTime(new Date("2027-01-05T00:00:00Z"));
  await f.writeActual("2026-12", "800", "700");
  const due = f.input(saved.saved, 3, "2026-12");
  await expect(f.plans.previewSources(f.owner, f.saved.planId, due)).rejects.toMatchObject({ code: "PLANNED_PAIR_RECONCILIATION_REQUIRED" });

  // Refinance did not happen: cancel the pair and reconcile the old loan with Nov/Dec actuals in one batch.
  const active = kept.plannedRefinanceOptions.activePairs[0];
  const cancel = plannedPairCommandSchema.parse({ commandId: randomUUID(), replacementCommandId: randomUUID(), pairId: pair.pairId, operation: "CANCEL",
    expectedPairHash: active.pairHash, oldSource: active.oldSource, newSource: active.newSource, expectedContractHash: active.contractHash, confirm: true, reason: "Bank offer withdrawn" });
  const pinned = contract("2026-10-31", "900");
  due.plannedRefinances = [cancel];
  due.loanRevisions = [loanSourceRevisionSchema.parse({ commandId: randomUUID(), sourceId: OLD, operation: "REVISE", expectedSourceRevision: active.oldSource.revision + 1,
    expectedSourceHash: "0".repeat(64), expectedContractHash: digest(pinned), confirm: true, contract: contract("2026-12-31", "700", "2027-01-05"),
    allocations: [f.allocation("2026-11"), f.allocation("2026-12")], principalAdvances: [] })];
  // The cancel revision hash is server-derived; read it from a cancel-only preview first.
  const cancelOnly = structuredClone(due); delete cancelOnly.loanRevisions;
  const cp = await f.plans.previewSources(f.owner, f.saved.planId, cancelOnly);
  const restored = cp.loanRevisionOptions.find(o => o.sourceId === OLD)!;
  expect(restored).toMatchObject({ sourceRevision: active.oldSource.revision + 1, contractHash: digest(pinned), legacyOpeningRequired: false });
  expect(sum(cp, pair.newSource.sourceId)).toBe(0);
  expect(sum(cp, OLD)).toBe(300);
  due.loanRevisions[0].expectedSourceHash = restored.sourceHash;
  const dp = await f.plans.previewSources(f.owner, f.saved.planId, due);
  expect(sum(dp, OLD)).toBe(300);
  expect(dp.plannedRefinanceOptions.activePairs).toEqual([]);
  const final = await f.plans.saveSources(f.owner, f.saved.planId, { preview: due, expectedInputHash: dp.inputHash!, confirm: true }, randomUUID());
  for (const v of [saved, final]) {
    const r = await f.plans.version(f.owner, f.saved.planId, v.saved.id, true);
    expect("replay" in r && r.replay.matched).toBe(true);
  }
  // Dropping the CANCEL proof (even with a recomputed integrity hash) breaks the evidence chain.
  const snapshot = structuredClone(f.rows("planVersion").at(-1)!.inputSnapshot) as any;
  expect(snapshot.preview.plannedRefinances).toHaveLength(2);
  snapshot.preview.plannedRefinances.pop(); const { integrityHash: _, ...payload } = snapshot; snapshot.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(snapshot)).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_MISMATCH" }));
});
