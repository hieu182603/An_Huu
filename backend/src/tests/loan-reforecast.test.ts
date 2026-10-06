import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { plansFixture } from "./plans-fixtures";
import { debtFixture } from "./debt-fixtures";
import { retirementProfile } from "./retirement-fixtures";
import { known } from "./profile-v2-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { sourceReforecastSchema } from "../modules/plans/source-schema";
import { loanContractV2Schema, type LoanAllocation } from "../modules/debts/revision-schema";
import { loanSourceRevisionSchema } from "../modules/debts/source-candidate";
import { loanCreationSchema } from "../modules/debts/source-create";
import { addMonths } from "../common/calendar";
import { digest } from "../common/digest";
import { readSourceSnapshot } from "../modules/plans/source-snapshot";
import { AuthService } from "../modules/auth/service";
import { config, token } from "./helpers";
import { createApp } from "../app";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-05T00:00:00Z"));
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
const evidence = [{ reference: "Synthetic amended loan and bank statement", contentHash: "a".repeat(64), confirmedOn: "2026-12-05" }];
function nextContract() {
  let previous = "2026-10-31";
  const periods = Array.from({ length: 9 }, (_, i) => {
    const dueDate = new Date(Date.parse(addMonths("2026-11", i + 1) + "-01T00:00:00Z") - 86400000).toISOString().slice(0, 10);
    const period = { accrualFrom: previous, dueDate, rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: (Date.parse(dueDate) - Date.parse(previous)) / 86400000, yearDays: 365 },
      fee: "0", carriedInterest: "0", gracePrincipal: false, bankPayment: null };
    previous = dueDate; return period;
  });
  return loanContractV2Schema.parse({ contractVersion: 2, currency: "VND", signedOn: "2026-01-01", amendedOn: "2026-10-31", effectiveOn: "2026-10-31", knownOn: "2026-12-05",
    confirmation: "BANK_CONFIRMED", evidence, balanceAsOf: "2026-10-31", principalBalance: "900", balanceScope: "FULL_CONTRACT", paymentShare: "1",
    responsibility: { kind: "ALLOCATED_SHARE" }, interestBasis: "REDUCING_BALANCE", rounding: "CENT_HALF_UP", mode: "REDUCE_PAYMENT_KEEP_TERM",
    fixedPayment: null, finalPayment: "ADJUST_FINAL_PAYMENT", maturityDate: periods.at(-1)!.dueDate, periods });
}
async function fixture(twoLoans = false, capped = false) {
  const profile = retirementProfile(), debt = debtFixture(capped ? { responsibility: { status: "KNOWN", scope: "CAPPED", confirmedDocument: "Synthetic cap", limit: known("500") } } : {});
  profile.debts = { status: "KNOWN", entries: [debt] };
  if (twoLoans) profile.debts.entries.push(debtFixture({ id: "loan-b", label: "Vay B" }));
  if (profile.income.status === "KNOWN") profile.income.entries[0].amount = known("10000");
  const f = await plansFixture(profile), saved = await f.create(), actuals = new ActualsService(f.db);
  const eventId = randomUUID();
  const actual = { currency: "VND" as const, openingBalance: "1000", closingBalance: "880", correctionReason: "Synthetic verified statement", entries: [
    { eventId, date: "2026-10-28", kind: "DEBT_PAYMENT" as const, amount: "120" },
    { eventId: randomUUID(), date: "2026-10-28", kind: "WITHDRAWAL" as const, amount: "120" },
  ] };
  await actuals.write(f.owner, "2026-10", { expectedRevision: 0, data: actual }, randomUUID());
  const command = sourceReforecastSchema.parse({ versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 1,
    expectedProfileRevision: 1, throughMonth: "2026-10", sourceCommands: [] });
  const baseline = await f.plans.previewSources(f.owner, saved.planId, command);
  const source = baseline.candidate!.replayInput.sourceRegistry.revisions.find(r => r.sourceId === "profile:debt:loan-a")!;
  expect(baseline.loanRevisionOptions).toContainEqual({ sourceId: source.sourceId, sourceRevision: 1, sourceHash: source.sourceHash,
    contractHash: digest(debt), legacyOpeningRequired: true });
  const allocation: LoanAllocation = { allocationId: randomUUID(), eventId, actualRevision: 1, bookedOn: "2026-10-28", scope: "FULL_CONTRACT",
    components: { principal: "100", interest: "10", prepaymentFee: "10", otherFee: "0" }, contractComponents: { principal: "100", interest: "10", prepaymentFee: "10", otherFee: "0" },
    paymentStatus: "CURRENT", allocationBasis: "BANK_STATEMENT", evidence };
  command.loanRevisions = [loanSourceRevisionSchema.parse({ commandId: randomUUID(), sourceId: source.sourceId, operation: "REVISE", expectedSourceRevision: 1,
    expectedSourceHash: source.sourceHash, expectedContractHash: digest(debt), confirm: true, contract: nextContract(), allocations: [allocation], principalAdvances: [],
    legacyOpening: { signedOn: "2026-01-01", amendedOn: null, effectiveOn: "2026-01-01", knownOn: "2026-12-05", previouslyPaid: "0", evidence } })];
  if (capped) {
    command.loanRevisions[0].legacyOpening!.previouslyPaid = "30";
    command.loanRevisions[0].legacyOpening!.capBasis = "TOTAL_USER_PAYMENTS";
    command.loanRevisions[0].contract.responsibility = { kind: "CAPPED", capBasis: "TOTAL_USER_PAYMENTS", limit: "500", previouslyPaid: "150", evidence };
  }
  return { ...f, saved, command, actuals, actual, allocation, baseline };
}

it("upgrades only the confirmed opening basis of v1, then saves/applies/replays revised debt via public plan service", async () => {
  const f = await fixture(), before = JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")]);
  const preview = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  expect(preview.candidate!.loanSources).toHaveLength(1);
  expect(preview.candidate!.calculation.rows[0].openingBalance).toBe("880");
  expect(preview.candidate!.calculation.attribution.filter(a => a.sourceId === "profile:debt:loan-a").map(a => a.amount)).toEqual(Array(5).fill("100"));
  const body = { preview: f.command, expectedInputHash: preview.inputHash!, confirm: true as const }, key = randomUUID();
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, body, key);
  expect(await f.plans.saveSources(f.owner, f.saved.planId, body, key)).toEqual(saved);
  expect(saved.currentVersionId).toBeNull();
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(preview.candidate);
  expect((await f.plans.version(f.owner, saved.planId, f.saved.saved.id, true)).preview).toEqual(f.saved.saved.preview);
  await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID());
  expect(JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")])).toBe(before);
  const report = await f.plans.report(f.owner, saved.planId, { versionId: saved.saved.id });
  expect(JSON.stringify(report)).toContain("profile:debt:loan-a");
});

it("requires the owner, original source hash and explicit legacy opening metadata", async () => {
  const f = await fixture();
  await expect(f.plans.previewSources("other", f.saved.planId, f.command)).rejects.toMatchObject({ status: 404 });
  const missing = structuredClone(f.command); delete missing.loanRevisions![0].legacyOpening;
  await expect(f.plans.previewSources(f.owner, f.saved.planId, missing)).rejects.toMatchObject({ code: "LOAN_OPENING_CONFIRMATION_REQUIRED" });
  const changed = structuredClone(f.command); changed.loanRevisions![0].expectedContractHash = "b".repeat(64);
  await expect(f.plans.previewSources(f.owner, f.saved.planId, changed)).rejects.toMatchObject({ code: "LOAN_SOURCE_REVISION_CONFLICT" });
  changed.loanRevisions![0] = { ...f.command.loanRevisions![0], legacyOpening: { ...f.command.loanRevisions![0].legacyOpening!, signedOn: "2026-11-01" } };
  await expect(f.plans.previewSources(f.owner, f.saved.planId, changed)).rejects.toMatchObject({ code: "LOAN_LEGACY_BASIS_MISMATCH" });
  expect(sourceReforecastSchema.safeParse({ ...f.command, loanRevisions: [{ ...f.command.loanRevisions![0], actuals: [] }] }).success).toBe(false);
});

it("actual corrections invalidate saving/applying but cannot change replayed historical proof", async () => {
  const f = await fixture(), preview = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, { preview: f.command, expectedInputHash: preview.inputHash!, confirm: true }, randomUUID());
  await f.actuals.write(f.owner, "2026-10", { expectedRevision: 1, data: { ...f.actual, correctionReason: "Corrected document reference" } }, randomUUID());
  await expect(f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID()))
    .rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(preview.candidate);
  await expect(f.plans.previewSources(f.owner, saved.planId, { ...f.command, expectedRevision: 2 })).rejects.toMatchObject({ code: "LOAN_ACTUAL_STALE_OR_MISSING" });
});

it("shares event consumption across multiple loan commands in one request", async () => {
  const f = await fixture(true), second = f.baseline.loanRevisionOptions.find(s => s.sourceId === "profile:debt:loan-b")!;
  const other = structuredClone(f.command.loanRevisions![0]);
  other.commandId = randomUUID(); other.sourceId = second.sourceId; other.expectedSourceHash = second.sourceHash; other.expectedContractHash = second.contractHash;
  other.allocations[0].allocationId = randomUUID();
  f.command.loanRevisions!.push(other);
  await expect(f.plans.previewSources(f.owner, f.saved.planId, f.command)).rejects.toMatchObject({ code: "LOAN_EVENT_OVERALLOCATED" });
  expect(f.rows("planVersion")).toHaveLength(1);
});

it("requires a confirmed cap basis and carries pre-existing and newly paid obligations", async () => {
  const f = await fixture(false, true), p = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  expect(p.candidate!.calculation.attribution.filter(a => a.sourceId === "profile:debt:loan-a").map(a => a.amount)).toEqual(["100", "100", "100", "50", "0"]);
  const bad = structuredClone(f.command); delete bad.loanRevisions![0].legacyOpening!.capBasis;
  await expect(f.plans.previewSources(f.owner, f.saved.planId, bad)).rejects.toMatchObject({ code: "LOAN_LEGACY_BASIS_MISMATCH" });
  const reset = structuredClone(f.command);
  if (reset.loanRevisions![0].contract.responsibility.kind === "CAPPED") reset.loanRevisions![0].contract.responsibility.previouslyPaid = "120";
  await expect(f.plans.previewSources(f.owner, f.saved.planId, reset)).rejects.toMatchObject({ code: "LOAN_CAP_CARRY_MISMATCH" });
  await f.plans.saveSources(f.owner, f.saved.planId, { preview: f.command, expectedInputHash: p.inputHash!, confirm: true }, randomUUID());
});

it("a later revision carries allocations forward and never debits actual withdrawals twice", async () => {
  const f = await fixture(), preview = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, { preview: f.command, expectedInputHash: preview.inputHash!, confirm: true }, randomUUID());
  const prior = preview.candidate!.loanSources![0], updated = { ...f.command.loanRevisions![0], commandId: randomUUID(), expectedSourceRevision: 2,
    expectedSourceHash: prior.sourceHash, expectedContractHash: digest(prior.evidence.command.contract), allocations: [], legacyOpening: undefined };
  updated.contract = { ...updated.contract, mode: "REDUCE_TERM_KEEP_PAYMENT", fixedPayment: "300", finalPayment: "NO_BALLOON" };
  const command = { ...f.command, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 2, loanRevisions: [updated] };
  const next = await f.plans.previewSources(f.owner, saved.planId, command);
  expect(next.candidate!.loanSources).toHaveLength(2);
  expect(next.candidate!.calculation.rows[0].openingBalance).toBe("880");
  expect(next.candidate!.calculation.attribution.filter(a => a.sourceId === updated.sourceId).map(a => a.amount)).toEqual(["300", "300", "300"]);
  await f.plans.saveSources(f.owner, saved.planId, { preview: command, expectedInputHash: next.inputHash!, confirm: true }, randomUUID());
  const staleReplay = structuredClone(f.rows("planVersion").at(-1)!.inputSnapshot);
  const payload = staleReplay as any; payload.preview.loanSources.shift(); const { integrityHash: _, ...rest } = payload; payload.integrityHash = digest(rest);
  expect(() => readSourceSnapshot(payload)).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_MISMATCH" }));
});

it("advances the actual cutoff with a second repayment while retaining all prior allocations", async () => {
  const f = await fixture(), first = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, { preview: f.command, expectedInputHash: first.inputHash!, confirm: true }, randomUUID());
  const eventId = randomUUID();
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: { currency: "VND", openingBalance: "880", closingBalance: "780", correctionReason: "November statement",
    entries: [{ eventId, date: "2026-11-29", kind: "DEBT_PAYMENT", amount: "100" }, { eventId: randomUUID(), date: "2026-11-29", kind: "WITHDRAWAL", amount: "100" }] } }, randomUUID());
  const previous = first.candidate!.loanSources![0], contract = structuredClone(previous.evidence.command.contract);
  contract.balanceAsOf = "2026-11-30"; contract.principalBalance = "800"; contract.periods.shift();
  const components = { principal: "100", interest: "0", prepaymentFee: "0", otherFee: "0" };
  const command = { ...f.command, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 2, throughMonth: "2026-11",
    loanRevisions: [{ ...f.command.loanRevisions![0], commandId: randomUUID(), expectedSourceRevision: 2, expectedSourceHash: previous.sourceHash,
      expectedContractHash: digest(previous.evidence.command.contract), contract, legacyOpening: undefined,
      allocations: [{ ...f.allocation, allocationId: randomUUID(), eventId, bookedOn: "2026-11-29", components, contractComponents: components }] }] };
  const next = await f.plans.previewSources(f.owner, saved.planId, command);
  expect(next.candidate!.calculation.rows[0]).toMatchObject({ month: "2026-12", openingBalance: "780", debtPayment: "100" });
  expect(next.candidate!.loanSources![1].evidence.consumed).toHaveLength(1);
  const updated = await f.plans.saveSources(f.owner, saved.planId, { preview: command, expectedInputHash: next.inputHash!, confirm: true }, randomUUID());
  expect((await f.plans.version(f.owner, saved.planId, updated.saved.id, true)).preview).toEqual(next.candidate);
});

it("serves loan revision preview/save/replay through HTTP with the production response schema", async () => {
  const f = await fixture(), auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
  const app = createApp({ config, services: { auth, profiles: f.profiles, plans: f.plans, actuals: f.actuals } });
  const root = "/api/v1/me/retirement/plans/" + f.saved.planId;
  const preview = await request(app).post(root + "/source-reforecasts/preview").set("Authorization", "Bearer " + token()).send(f.command);
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any, ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const check = ajv.compile(spec.components.schemas.PlanSourcePreviewEnvelope);
  expect(check(preview.body), JSON.stringify(check.errors)).toBe(true);
  const saved = await request(app).post(root + "/source-reforecasts").set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID())
    .send({ preview: f.command, expectedInputHash: preview.body.data.inputHash, confirm: true });
  expect(saved.status, JSON.stringify(saved.body)).toBe(201);
  const replay = await request(app).post(root + "/versions/" + saved.body.data.saved.id + "/replay").set("Authorization", "Bearer " + token());
  expect(replay.status).toBe(200);
  const apply = await request(app).post(root + "/apply").set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID())
    .send({ versionId: saved.body.data.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true });
  expect(apply.status, JSON.stringify(apply.body)).toBe(200);
  const report = await request(app).get(root + "/report").set("Authorization", "Bearer " + token());
  expect(report.status).toBe(200);
  expect(JSON.stringify(report.body)).toContain("profile:debt:loan-a");
});

function plannedLoan() {
  const c = nextContract();
  Object.assign(c, { signedOn: "2026-12-01", amendedOn: null, effectiveOn: "2027-01-01", balanceAsOf: "2027-01-01", balanceNature: "PROJECTED_DISBURSEMENT",
    confirmation: "HYPOTHETICAL", principalBalance: "1000", maturityDate: "2027-02-28" });
  c.periods = [
    { ...c.periods[0], accrualFrom: "2027-01-01", dueDate: "2027-01-31", rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: 30, yearDays: 365 } },
    { ...c.periods[1], accrualFrom: "2027-01-31", dueDate: "2027-02-28", rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: 28, yearDays: 365 } },
  ];
  return loanCreationSchema.parse({ commandId: randomUUID(), sourceId: "plan:" + randomUUID(), operation: "CREATE", expectedSourceRevision: 0, confirm: true,
    agreementReference: "Synthetic new agreement B", contract: c, funding: { kind: "PLANNED_DISBURSEMENT", grossPrincipal: "1000", withheldFees: "100",
      netDisbursement: "900", destination: "EXTERNAL_ACCOUNT", evidence } });
}

it("creates a planned loan without treating borrowed proceeds as income or retirement capital", async () => {
  const f = await fixture(), creation = plannedLoan(), command = { ...f.command, loanRevisions: [], loanCreations: [creation] };
  const baseline = f.baseline.candidate!, preview = await f.plans.previewSources(f.owner, f.saved.planId, command);
  const cashflows = preview.candidate!.calculation.attribution.filter(a => a.sourceId === creation.sourceId);
  expect(cashflows.map(a => [a.month, a.metric, a.amount, a.confirmation])).toEqual([
    ["2027-01", "debtPayment", "500", "HYPOTHETICAL"], ["2027-02", "debtPayment", "500", "HYPOTHETICAL"],
  ]);
  expect(preview.candidate!.calculation.rows.map(r => [r.income, r.capitalInjection])).toEqual(baseline.calculation.rows.map(r => [r.income, r.capitalInjection]));
  expect(preview.candidate!.calculation.rows[0].openingBalance).toBe("880");
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, { preview: command, expectedInputHash: preview.inputHash!, confirm: true }, randomUUID());
  expect((await f.plans.version(f.owner, f.saved.planId, saved.saved.id, true)).preview).toEqual(preview.candidate);
  const snapshot = structuredClone(f.rows("planVersion").at(-1)!.inputSnapshot) as any;
  delete snapshot.preview.newLoanSources; const { integrityHash: _, ...payload } = snapshot; snapshot.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(snapshot)).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_MISMATCH" }));
});

it("requires truthful funding arithmetic, unique agreement identity and a projected-balance label", async () => {
  const f = await fixture(), creation = plannedLoan(), command = { ...f.command, loanRevisions: [], loanCreations: [creation] };
  const bad = structuredClone(creation);
  if (bad.funding.kind === "PLANNED_DISBURSEMENT") bad.funding.netDisbursement = "901";
  await expect(f.plans.previewSources(f.owner, f.saved.planId, { ...command, loanCreations: [bad] })).rejects.toMatchObject({ code: "LOAN_DISBURSEMENT_MISMATCH" });
  expect(loanCreationSchema.safeParse({ ...creation, contract: { ...creation.contract, confirmation: "BANK_CONFIRMED" } }).success).toBe(false);
  expect(loanCreationSchema.safeParse({ ...creation, contract: { ...creation.contract, balanceNature: "CONFIRMED_BALANCE" } }).success).toBe(false);
  const duplicate = { ...creation, commandId: randomUUID(), sourceId: "plan:" + randomUUID(), agreementReference: creation.agreementReference.toLowerCase() };
  await expect(f.plans.previewSources(f.owner, f.saved.planId, { ...command, loanCreations: [creation, duplicate] })).rejects.toMatchObject({ code: "LOAN_AGREEMENT_ALREADY_EXISTS" });
  expect(f.rows("planVersion")).toHaveLength(1);
});

it("adds a confirmed existing balance only at cutoff without rewriting the actual fund", async () => {
  const f = await fixture(), creation = plannedLoan(); creation.contract = nextContract();
  creation.funding = { kind: "EXISTING_BALANCE", notAlreadyInSources: true, evidence };
  const command = { ...f.command, loanRevisions: [], loanCreations: [creation] };
  const p = await f.plans.previewSources(f.owner, f.saved.planId, command);
  expect(p.candidate!.calculation.attribution.filter(a => a.sourceId === creation.sourceId).map(a => a.amount)).toEqual(Array(5).fill("100"));
  expect(p.candidate!.calculation.rows[0].openingBalance).toBe("880");
  creation.contract.confirmation = "HYPOTHETICAL";
  await expect(f.plans.previewSources(f.owner, f.saved.planId, command)).rejects.toMatchObject({ code: "LOAN_OPENING_BALANCE_REQUIRED" });
});

it("revises a previously planned loan after its disbursement and actual repayment", async () => {
  const f = await fixture(), creation = plannedLoan(), command = { ...f.command, loanRevisions: [], loanCreations: [creation] };
  const p = await f.plans.previewSources(f.owner, f.saved.planId, command);
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, { preview: command, expectedInputHash: p.inputHash!, confirm: true }, randomUUID());
  vi.setSystemTime(new Date("2027-02-05T00:00:00Z"));
  for (const month of ["2026-11", "2026-12"]) await f.actuals.write(f.owner, month, { expectedRevision: 0, data: { currency: "VND", openingBalance: "880", closingBalance: "880", entries: [], correctionReason: "Synthetic close" } }, randomUUID());
  const eventId = randomUUID();
  await f.actuals.write(f.owner, "2027-01", { expectedRevision: 0, data: { currency: "VND", openingBalance: "880", closingBalance: "380", correctionReason: "First repayment",
    entries: [{ eventId, date: "2027-01-31", kind: "DEBT_PAYMENT", amount: "500" }, { eventId: randomUUID(), date: "2027-01-31", kind: "WITHDRAWAL", amount: "500" }] } }, randomUUID());
  const contract = { ...creation.contract, balanceNature: "CONFIRMED_BALANCE" as const, confirmation: "BANK_CONFIRMED" as const, knownOn: "2027-02-05", principalBalance: "500",
    balanceAsOf: "2027-01-31", periods: creation.contract.periods.slice(1) };
  const option = p.loanRevisionOptions.find(s => s.sourceId === creation.sourceId)!, components = { principal: "500", interest: "0", prepaymentFee: "0", otherFee: "0" };
  const update = sourceReforecastSchema.parse({ ...command, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 2, throughMonth: "2027-01", loanCreations: [],
    loanRevisions: [{ commandId: randomUUID(), sourceId: option.sourceId, operation: "REVISE", expectedSourceRevision: 1, expectedSourceHash: option.sourceHash, expectedContractHash: option.contractHash,
      confirm: true, contract, principalAdvances: [], allocations: [{ ...f.allocation, allocationId: randomUUID(), eventId, bookedOn: "2027-01-31", components, contractComponents: components }] }] });
  const next = await f.plans.previewSources(f.owner, saved.planId, update);
  expect(next.candidate!.calculation.rows[0]).toMatchObject({ month: "2027-02", openingBalance: "380" });
  const result = await f.plans.saveSources(f.owner, saved.planId, { preview: update, expectedInputHash: next.inputHash!, confirm: true }, randomUUID());
  expect((await f.plans.version(f.owner, saved.planId, result.saved.id, true)).preview).toEqual(next.candidate);
});

async function refinanceFixture() {
  const f = await fixture(), command = structuredClone(f.command), refinanceId = randomUUID();
  const actual = structuredClone(f.actual); actual.entries[0].amount = "1020";
  await f.actuals.write(f.owner, "2026-10", { expectedRevision: 1, data: actual }, randomUUID());
  const closing = command.loanRevisions![0]; closing.operation = "END"; closing.refinanceCommandId = refinanceId;
  closing.contract = { ...closing.contract, amendedOn: "2026-10-28", effectiveOn: "2026-10-28", principalBalance: "0", mode: "BANK_SCHEDULE", periods: [],
    maturityDate: "2026-10-31", finalPayment: "NO_BALLOON" };
  closing.allocations[0].actualRevision = 2;
  closing.allocations[0].components.principal = closing.allocations[0].contractComponents.principal = "1000";
  const replacement = plannedLoan(); replacement.refinanceCommandId = refinanceId;
  replacement.contract = { ...nextContract(), signedOn: "2026-10-01", amendedOn: null, effectiveOn: "2026-10-28" };
  replacement.funding = { kind: "EXISTING_BALANCE", notAlreadyInSources: true, evidence };
  command.loanCreations = [replacement];
  command.refinances = [{ commandId: refinanceId, closingCommandId: closing.commandId, newLoanCommandId: replacement.commandId, settledOn: "2026-10-28",
    fundingScope: "FULL_CONTRACT", grossDisbursement: "900", withheldFees: "0", externalTopUp: "120", unusedProceeds: "0", confirm: true, evidence }];
  return { ...f, command, replacement };
}

it("atomically closes an actual settled loan and creates its refinancing replacement with balanced funding", async () => {
  const f = await refinanceFixture(), preview = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  expect(preview.candidate!.refinances![0]).toMatchObject({ settlementAmount: "1020" });
  expect(preview.candidate!.calculation.rows[0].openingBalance).toBe("880");
  expect(preview.candidate!.calculation.attribution.some(a => a.sourceId === "profile:debt:loan-a")).toBe(false);
  expect(preview.candidate!.calculation.attribution.filter(a => a.sourceId === f.replacement.sourceId).map(a => a.amount)).toEqual(Array(5).fill("100"));
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, { preview: f.command, expectedInputHash: preview.inputHash!, confirm: true }, randomUUID());
  expect(f.rows("planVersion")).toHaveLength(2);
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(preview.candidate);
  await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID());
  const snapshot = structuredClone(f.rows("planVersion").at(-1)!.inputSnapshot) as any;
  delete snapshot.preview.refinances; const { integrityHash: _, ...payload } = snapshot; snapshot.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(snapshot)).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_MISMATCH" }));
});

it("rejects unbalanced refinance without persisting either side and requires both commands together", async () => {
  const f = await refinanceFixture();
  const preview = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  f.command.refinances![0].unusedProceeds = "1";
  await expect(f.plans.saveSources(f.owner, f.saved.planId, { preview: f.command, expectedInputHash: preview.inputHash!, confirm: true }, randomUUID()))
    .rejects.toMatchObject({ code: "REFINANCE_FUNDING_MISMATCH" });
  expect(f.rows("planVersion")).toHaveLength(1); expect(f.rows("retirementPlan")[0].revision).toBe(1);
  expect(sourceReforecastSchema.safeParse({ ...f.command, loanCreations: [] }).success).toBe(false);
  expect(sourceReforecastSchema.safeParse({ ...f.command, refinances: [] }).success).toBe(false);
});

it("will not terminate a loan that still has principal or unpaid future charges", async () => {
  const f = await fixture(); f.command.loanRevisions![0].operation = "END";
  await expect(f.plans.previewSources(f.owner, f.saved.planId, f.command)).rejects.toMatchObject({ code: "LOAN_NOT_FULLY_SETTLED" });
  const r = await refinanceFixture();
  r.command.refinances = []; delete r.command.loanRevisions![0].refinanceCommandId; r.command.loanCreations = [];
  r.command.loanRevisions![0].contract.periods = [{ ...nextContract().periods[0], fee: "10", bankPayment: { principal: "0", interest: "0" } }];
  r.command.loanRevisions![0].contract.maturityDate = "2026-11-30";
  await expect(r.plans.previewSources(r.owner, r.saved.planId, r.command)).rejects.toMatchObject({ code: "LOAN_NOT_FULLY_SETTLED" });
});
