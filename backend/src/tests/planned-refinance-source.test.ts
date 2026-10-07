import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { digest } from "../common/digest";
import { loanContractV2Schema } from "../modules/debts/revision-schema";
import { loanSourceSchedule } from "../modules/debts/source-candidate";
import { composeSourceMonths, sealSourceRegistry, sealSourceRevision } from "../modules/retirement/sources";
import { plannedPairCandidate, plannedPairCommandSchema, replayPlannedPairs, type PlannedPairCommand } from "../modules/debts/planned-refinance-source";

const evidence = [{ reference: "Synthetic refinance draft", contentHash: "a".repeat(64), confirmedOn: "2026-11-05" }];
function periods(from: string, dates: string[]) {
  return dates.map(dueDate => { const accrualFrom = from; from = dueDate;
    return { accrualFrom, dueDate, rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: (Date.parse(dueDate) - Date.parse(accrualFrom)) / 86400000, yearDays: 365 },
      fee: "0", carriedInterest: "0", gracePrincipal: false, bankPayment: null }; });
}
function fixture() {
  const contract = loanContractV2Schema.parse({ contractVersion: 2, currency: "VND", signedOn: "2026-01-01", amendedOn: null,
    effectiveOn: "2026-01-01", knownOn: "2026-11-05", confirmation: "BANK_CONFIRMED", evidence, balanceAsOf: "2026-10-31", principalBalance: "900",
    balanceScope: "FULL_CONTRACT", paymentShare: "1", responsibility: { kind: "ALLOCATED_SHARE" }, interestBasis: "REDUCING_BALANCE", rounding: "CENT_HALF_UP",
    mode: "REDUCE_PAYMENT_KEEP_TERM", fixedPayment: null, finalPayment: "ADJUST_FINAL_PAYMENT", maturityDate: "2027-01-31",
    periods: periods("2026-10-31", ["2026-11-30", "2026-12-31", "2027-01-31"]) });
  const source = sealSourceRevision({ sourceId: "profile:debt:old", revision: 1, previousHash: null, scope: "PLAN_VERSION", origin: "PINNED_PROFILE", kind: "DEBT",
    commandId: "test:opening", operation: "CREATE", confirmation: "BANK_CONFIRMED", knownOn: "2026-11-05", evidenceHash: digest(contract),
    effectiveFromMonth: "2026-11", effectiveToMonth: "2027-02", schedule: loanSourceSchedule(contract, "2026-11", "2027-02") });
  const registry = sealSourceRegistry({ schemaVersion: 1, startMonth: "2026-11", endMonth: "2027-02", knowledgeAsOf: "2026-11-05", originHash: "b".repeat(64), revisions: [source] });
  const replacementCommandId = randomUUID(), sourceId = "plan:" + randomUUID();
  const command = plannedPairCommandSchema.parse({ commandId: randomUUID(), replacementCommandId, pairId: randomUUID(), operation: "CREATE", expectedPairHash: null,
    oldSource: { sourceId: source.sourceId, revision: 1, sourceHash: source.sourceHash }, newSource: { sourceId, revision: 0, sourceHash: null }, expectedContractHash: digest(contract), confirm: true,
    terms: { settledOn: "2026-12-15", sameDayOrder: "BEFORE_SCHEDULED_PAYMENT",
      payoffQuote: { principal: "600", interest: "10", carriedInterest: "0", prepaymentFee: "20", otherFee: "0", allRemainingChargesIncluded: true, valueKind: "HYPOTHETICAL_QUOTE", evidence },
      funding: { scope: "FULL_CONTRACT", externalTopUp: "40", userTopUp: "40", userFinancedAmount: "590", unusedProceeds: "0", unusedProceedsNotContributed: true, evidence },
      replacement: { commandId: replacementCommandId, sourceId, operation: "CREATE", expectedSourceRevision: 0, confirm: true, agreementReference: "Scenario replacement",
        contract: { ...contract, confirmation: "HYPOTHETICAL", balanceNature: "PROJECTED_DISBURSEMENT", balanceAsOf: "2026-12-15", principalBalance: "600", maturityDate: "2027-02-28", periods: periods("2026-12-15", ["2027-01-31", "2027-02-28"]) },
        funding: { kind: "PLANNED_DISBURSEMENT", grossPrincipal: "600", withheldFees: "10", netDisbursement: "590", destination: "EXTERNAL_ACCOUNT", evidence } } } });
  if (command.operation !== "CREATE") throw new Error("fixture");
  const basis = { source, contract };
  return { registry, command, basis };
}
function revision(first: ReturnType<typeof plannedPairCandidate>, initial: PlannedPairCommand): PlannedPairCommand {
  if (initial.operation === "CANCEL") throw new Error("fixture");
  const commandId = randomUUID(), replacementCommandId = randomUUID();
  return { ...structuredClone(initial), commandId, replacementCommandId, operation: "REVISE", expectedPairHash: first.proof.pairHash,
    oldSource: { ...initial.oldSource, revision: first.registry.revisions.at(-2)!.revision, sourceHash: first.proof.oldSourceHash },
    newSource: { ...initial.newSource, revision: first.registry.revisions.at(-1)!.revision, sourceHash: first.proof.newSourceHash },
    terms: { ...structuredClone(initial.terms), replacement: { ...structuredClone(initial.terms.replacement), commandId: replacementCommandId } } };
}

it("creates, revises and cancels both sources, restoring the pinned original schedule and retaining every replay", () => {
  const f = fixture(), before = digest(f.registry);
  const first = plannedPairCandidate(f.registry, f.command, f.basis, [], "2026-10", "2026-11-05");
  expect(digest(f.registry)).toBe(before);
  expect(composeSourceMonths(first.registry).rows.map(r => r.debtPayment)).toEqual(["300", "40", "300", "300"]);
  expect(first.registry.revisions.slice(-2).map(r => r.confirmation)).toEqual(["HYPOTHETICAL", "HYPOTHETICAL"]);
  const revise = revision(first, f.command); if (revise.operation !== "REVISE") throw new Error("fixture");
  revise.terms.payoffQuote.prepaymentFee = "30"; revise.terms.funding.externalTopUp = revise.terms.funding.userTopUp = "50";
  const second = plannedPairCandidate(first.registry, revise, f.basis, [first.proof], "2026-10", "2026-11-06");
  expect(composeSourceMonths(second.registry).rows.map(r => r.debtPayment)).toEqual(["300", "50", "300", "300"]);
  const { terms: _, ...cancel } = revision(second, revise) as Extract<PlannedPairCommand, { operation: "REVISE" }>;
  const last = plannedPairCandidate(second.registry, { ...cancel, operation: "CANCEL", reason: "Keep existing loan" }, f.basis, [first.proof, second.proof], "2026-10", "2026-11-07");
  expect(composeSourceMonths(last.registry).rows).toEqual(composeSourceMonths(f.registry).rows);
  expect(last.registry.revisions.at(-2)?.confirmation).toBe("BANK_CONFIRMED");
  expect(last.registry.revisions.at(-1)?.operation).toBe("END");
  expect(replayPlannedPairs(last.registry, [first.proof, second.proof, last.proof])).toEqual({ matched: true, pairsReplayed: 3 });
  expect(replayPlannedPairs(first.registry, [first.proof]).matched).toBe(true);
  expect(composeSourceMonths(last.registry).rows.every(r => r.income === "0" && r.capitalInjection === "0")).toBe(true);
  expect(() => plannedPairCandidate(last.registry, revision(last, revise), f.basis, [first.proof, second.proof, last.proof], "2026-10", "2026-11-08"))
    .toThrowError(expect.objectContaining({ code: "PLANNED_PAIR_REVISION_CONFLICT" }));
});

it("requires both source hashes and pair hash and refuses an independent edit to one member", () => {
  const f = fixture(), first = plannedPairCandidate(f.registry, f.command, f.basis, [], "2026-10", "2026-11-05");
  const command = revision(first, f.command);
  for (const field of ["oldSource", "newSource", "expectedPairHash"] as const) {
    const bad = structuredClone(command);
    if (field === "expectedPairHash") bad.expectedPairHash = "a".repeat(64); else bad[field].sourceHash = "a".repeat(64);
    expect(() => plannedPairCandidate(first.registry, bad, f.basis, [first.proof], "2026-10", "2026-11-06"))
      .toThrowError(expect.objectContaining({ code: "PLANNED_PAIR_REVISION_CONFLICT" }));
  }
  const old = first.registry.revisions.at(-2)!;
  const stray = sealSourceRevision({ ...old, revision: old.revision + 1, previousHash: old.sourceHash, commandId: randomUUID(), schedule: [] });
  const changed = sealSourceRegistry({ ...first.registry, revisions: [...first.registry.revisions, stray] });
  expect(() => plannedPairCandidate(changed, command, f.basis, [first.proof], "2026-10", "2026-11-06"))
    .toThrowError(expect.objectContaining({ code: "PLANNED_PAIR_REVISION_CONFLICT" }));
});

it("requires actual reconciliation when cutoff advances or the planned date arrives", () => {
  const f = fixture(), first = plannedPairCandidate(f.registry, f.command, f.basis, [], "2026-10", "2026-11-05");
  for (const [cutoff, knownOn] of [["2026-11", "2026-12-01"], ["2026-10", "2026-12-15"]]) {
    expect(() => plannedPairCandidate(first.registry, revision(first, f.command), f.basis, [first.proof], cutoff, knownOn))
      .toThrowError(expect.objectContaining({ code: "PLANNED_PAIR_RECONCILIATION_REQUIRED" }));
  }
});

it("rejects substitute basis, overlapping aggregate debt and another active pair on the same source", () => {
  const f = fixture(), badBasis = structuredClone(f.basis); badBasis.contract.periods[0].fee = "1";
  expect(() => plannedPairCandidate(f.registry, { ...f.command, expectedContractHash: digest(badBasis.contract) }, badBasis, [], "2026-10", "2026-11-05"))
    .toThrowError(expect.objectContaining({ code: "PLANNED_PAIR_BASIS_MISMATCH" }));
  const aggregate = sealSourceRevision({ ...f.basis.source, sourceId: "legacy:debt", commandId: "legacy:override", origin: "LEGACY_AGGREGATE", kind: "AGGREGATE" });
  const blocked = sealSourceRegistry({ ...f.registry, revisions: [...f.registry.revisions, aggregate] });
  expect(() => plannedPairCandidate(blocked, f.command, f.basis, [], "2026-10", "2026-11-05"))
    .toThrowError(expect.objectContaining({ code: "SOURCE_AGGREGATE_OVERLAP" }));
  const first = plannedPairCandidate(f.registry, f.command, f.basis, [], "2026-10", "2026-11-05");
  const other = structuredClone(f.command); other.pairId = randomUUID(); other.oldSource.revision = 2; other.oldSource.sourceHash = first.proof.oldSourceHash;
  other.newSource.sourceId = "plan:" + randomUUID(); other.terms.replacement.sourceId = other.newSource.sourceId;
  expect(() => plannedPairCandidate(first.registry, other, f.basis, [first.proof], "2026-10", "2026-11-06"))
    .toThrowError(expect.objectContaining({ code: "PLANNED_PAIR_SOURCE_IN_USE" }));
});

it("cannot replay a half-pair, a reordered history or altered proof even with a recalculated proof hash", () => {
  const f = fixture(), first = plannedPairCandidate(f.registry, f.command, f.basis, [], "2026-10", "2026-11-05");
  const second = plannedPairCandidate(first.registry, revision(first, f.command), f.basis, [first.proof], "2026-10", "2026-11-06");
  expect(() => replayPlannedPairs(second.registry, [second.proof, first.proof])).toThrow();
  const half = sealSourceRegistry({ ...first.registry, revisions: first.registry.revisions.slice(0, -1) });
  expect(() => replayPlannedPairs(half, [first.proof])).toThrowError(expect.objectContaining({ code: "PLANNED_PAIR_EVIDENCE_MISMATCH" }));
  const tampered = structuredClone(first.proof); tampered.evidence.basis.contract.paymentShare = "0.5";
  const { pairHash: _, ...payload } = tampered; tampered.pairHash = digest(payload);
  expect(() => replayPlannedPairs(first.registry, [tampered])).toThrow();
});
