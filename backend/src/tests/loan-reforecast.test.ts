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

it("amends a cap, preserves paid history through uncapped terms and prevents resetting it on re-entry", async () => {
  const f = await fixture(false, true), c = f.command.loanRevisions![0];
  c.responsibilityAmendment = { effectiveOn: c.contract.effectiveOn, openingUserPaid: "30", confirm: true, evidence };
  c.contract.userPaidToDate = "150";
  if (c.contract.responsibility.kind !== "CAPPED") throw new Error("fixture");
  c.contract.responsibility.limit = "250";
  const p = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  expect(p.candidate!.calculation.rows[0].openingBalance).toBe("880");
  expect(p.candidate!.calculation.attribution.filter(a => a.sourceId === c.sourceId).reduce((sum, a) => sum + Number(a.amount), 0)).toBe(100);
  const first = await f.plans.saveSources(f.owner, f.saved.planId, { preview: f.command, expectedInputHash: p.inputHash!, confirm: true }, randomUUID());
  async function revise(parent: typeof first, revision: number, capped: boolean) {
    const input = sourceReforecastSchema.parse({ versionId: parent.saved.id, expectedSnapshotHash: parent.saved.snapshotHash,
      expectedRevision: revision, expectedProfileRevision: 1, throughMonth: "2026-10", sourceCommands: [] });
    const ready = await f.plans.previewSources(f.owner, first.planId, input), option = ready.loanRevisionOptions.find(s => s.sourceId === c.sourceId)!;
    const next = structuredClone(c); delete next.legacyOpening;
    Object.assign(next, { commandId: randomUUID(), expectedSourceRevision: option.sourceRevision, expectedSourceHash: option.sourceHash, expectedContractHash: option.contractHash, allocations: [] });
    next.responsibilityAmendment!.openingUserPaid = "150";
    next.contract.responsibility = capped ? { kind: "CAPPED", capBasis: "TOTAL_USER_PAYMENTS", limit: "200", previouslyPaid: "150", evidence } : { kind: "ALLOCATED_SHARE" };
    input.loanRevisions = [next];
    return input;
  }
  const uncapped = await revise(first, 2, false), up = await f.plans.previewSources(f.owner, first.planId, uncapped);
  const second = await f.plans.saveSources(f.owner, first.planId, { preview: uncapped, expectedInputHash: up.inputHash!, confirm: true }, randomUUID());
  const recapped = await revise(second, 3, true);
  const drop = structuredClone(recapped); delete drop.loanRevisions![0].responsibilityAmendment; delete drop.loanRevisions![0].contract.userPaidToDate;
  await expect(f.plans.previewSources(f.owner, first.planId, drop)).rejects.toMatchObject({ code: "LOAN_RESPONSIBILITY_REVIEW_REQUIRED" });
  const reset = structuredClone(recapped);
  reset.loanRevisions![0].responsibilityAmendment!.openingUserPaid = "0";
  reset.loanRevisions![0].contract.userPaidToDate = "0";
  const responsibility = reset.loanRevisions![0].contract.responsibility;
  if (responsibility.kind === "CAPPED") responsibility.previouslyPaid = "0";
  await expect(f.plans.previewSources(f.owner, first.planId, reset)).rejects.toMatchObject({ code: "LOAN_CAP_CARRY_MISMATCH" });
  const rp = await f.plans.previewSources(f.owner, first.planId, recapped);
  expect(rp.candidate!.calculation.attribution.filter(a => a.sourceId === c.sourceId).reduce((sum, a) => sum + Number(a.amount), 0)).toBe(50);
  const third = await f.plans.saveSources(f.owner, first.planId, { preview: recapped, expectedInputHash: rp.inputHash!, confirm: true }, randomUUID());
  await f.plans.apply(f.owner, first.planId, { versionId: third.saved.id, expectedRevision: 4, expectedProfileRevision: 1, confirm: true }, randomUUID());
  for (const saved of [f.saved, first, second, third]) {
    const read = await f.plans.version(f.owner, first.planId, saved.saved.id, true);
    expect("replay" in read && read.replay.matched).toBe(true);
  }
  const proof = structuredClone(rp.candidate!); delete proof.loanSources!.at(-1)!.evidence.command.responsibilityAmendment;
  expect(() => readSourceSnapshot(proof)).toThrow();
});

it("requires an explicit paid opening when adding a cap to a legacy allocated-share loan", async () => {
  const f = await fixture(), c = f.command.loanRevisions![0];
  c.contract.responsibility = { kind: "CAPPED", capBasis: "TOTAL_USER_PAYMENTS", limit: "300", previouslyPaid: "170", evidence };
  c.contract.userPaidToDate = "170";
  await expect(f.plans.previewSources(f.owner, f.saved.planId, f.command)).rejects.toMatchObject({ code: "LOAN_RESPONSIBILITY_REVIEW_REQUIRED" });
  c.responsibilityAmendment = { effectiveOn: c.contract.effectiveOn, openingUserPaid: "50", confirm: true, evidence };
  const p = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  expect(p.candidate!.calculation.attribution.filter(a => a.sourceId === c.sourceId).reduce((sum, a) => sum + Number(a.amount), 0)).toBe(130);
  for (const field of ["userPaidToDate", "openingUserPaid", "effectiveOn", "evidence"] as const) {
    const bad = structuredClone(f.command), revision = bad.loanRevisions![0];
    if (field === "userPaidToDate") delete revision.contract.userPaidToDate;
    else if (field === "openingUserPaid") revision.responsibilityAmendment!.openingUserPaid = "40";
    else if (field === "effectiveOn") revision.responsibilityAmendment!.effectiveOn = "2026-10-01";
    else revision.responsibilityAmendment!.evidence[0].confirmedOn = "2026-10-01";
    await expect(f.plans.previewSources(f.owner, f.saved.planId, bad)).rejects.toMatchObject({ status: 409 });
  }
});

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

it.each([false, true])("serves loan revision/repaid replacement through HTTP with the production response schema (%s)", async repaid => {
  const f = repaid ? await repaidReplacementFixture() : await fixture(), auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
  const app = createApp({ config, services: { auth, profiles: f.profiles, plans: f.plans, actuals: f.actuals } });
  const root = "/api/v1/me/retirement/plans/" + f.saved.planId;
  const preview = await request(app).post(root + "/source-reforecasts/preview").set("Authorization", "Bearer " + token()).send(f.command);
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any, ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const checkInput = ajv.compile(spec.paths["/api/v1/me/retirement/plans/{planId}/source-reforecasts/preview"].post.requestBody.content["application/json"].schema);
  expect(checkInput(f.command), JSON.stringify(checkInput.errors)).toBe(true);
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
  expect(JSON.stringify(report.body)).toContain(repaid ? f.command.loanCreations![0].sourceId : "profile:debt:loan-a");
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

async function repaidReplacementFixture(capped = false) {
  const f = await refinanceFixture(), actual = structuredClone(f.actual), eventId = randomUUID();
  actual.entries[0].amount = "1020";
  actual.entries.push({ eventId, date: "2026-10-30", kind: "DEBT_PAYMENT", amount: "110" },
    { eventId: randomUUID(), date: "2026-10-30", kind: "WITHDRAWAL", amount: "110" });
  actual.closingBalance = "770";
  await f.actuals.write(f.owner, "2026-10", { expectedRevision: 2, data: actual }, randomUUID());
  f.command.loanRevisions![0].allocations[0].actualRevision = 3;
  const components = { principal: "100", interest: "10", prepaymentFee: "0", otherFee: "0" };
  f.replacement.funding = { kind: "DISBURSED_BALANCE", notAlreadyInSources: true, disbursedOn: "2026-10-28", grossPrincipal: "1000", openingUserPaid: capped ? "20" : "0", evidence,
    allocations: [{ allocationId: randomUUID(), eventId, actualRevision: 3, bookedOn: "2026-10-30", scope: "FULL_CONTRACT", components, contractComponents: components,
      paymentStatus: "CURRENT", allocationBasis: "BANK_STATEMENT", evidence }], principalAdvances: [] };
  if (capped) f.replacement.contract.responsibility = { kind: "CAPPED", capBasis: "TOTAL_USER_PAYMENTS", limit: "1000", previouslyPaid: "130", evidence };
  f.command.refinances![0].grossDisbursement = "1000"; f.command.refinances![0].unusedProceeds = "100";
  return { ...f, actual };
}

it.each([false, true])("uses remaining disbursement cash on a later settlement date, interim loan payment before settlement=%s", async interimPayment => {
  const f = await repaidReplacementFixture(), funding = f.replacement.funding;
  if (funding.kind !== "DISBURSED_BALANCE") throw Error("fixture");
  funding.disbursedOn = "2026-10-20"; f.replacement.contract.effectiveOn = "2026-10-20";
  let actualRevision = 3;
  if (interimPayment) {
    f.actual.entries.filter(e => e.date === "2026-10-30").forEach(e => { e.date = "2026-10-25"; });
    await f.actuals.write(f.owner, "2026-10", { expectedRevision: 3, data: f.actual }, randomUUID());
    actualRevision = 4; funding.allocations[0].bookedOn = "2026-10-25"; funding.allocations[0].actualRevision = 4;
    f.command.loanRevisions![0].allocations[0].actualRevision = 4;
  }
  const refinance = f.command.refinances![0];
  refinance.proceedsAtSettlement = { availableAmount: "900", confirm: true, evidence,
    usesBeforeSettlement: [{ useId: randomUUID(), bookedOn: "2026-10-25", amount: "100", description: "Confirmed use from external proceeds account", evidence }] };
  refinance.unusedProceeds = "0";
  const preview = await f.plans.previewSources(f.owner, f.saved.planId, f.command), candidate = preview.candidate!;
  expect(candidate.refinances![0].settlementAmount).toBe("1020"); // 900 remaining + 120 top-up
  expect(candidate.calculation.rows[0].openingBalance).toBe("770");
  expect(candidate.calculation.rows.every(r => r.capitalInjection === "0")).toBe(true);
  const body = { preview: f.command, expectedInputHash: preview.inputHash!, confirm: true as const }, key = randomUUID();
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, body, key);
  expect(await f.plans.saveSources(f.owner, f.saved.planId, body, key)).toEqual(saved);
  await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID());
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(candidate);
  const csv = await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id);
  expect(csv.content).toContain(f.replacement.sourceId);
  const tampered = structuredClone(candidate); delete tampered.refinances![0].command.proceedsAtSettlement;
  expect(() => readSourceSnapshot(tampered)).toThrow();
  await f.actuals.write(f.owner, "2026-10", { expectedRevision: actualRevision, data: { ...f.actual, correctionReason: "Amended bank reference" } }, randomUUID());
  await expect(f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(candidate);
});

it("requires dated and balanced proceeds confirmation for earlier disbursement", async () => {
  const f = await repaidReplacementFixture(), funding = f.replacement.funding;
  if (funding.kind !== "DISBURSED_BALANCE") throw Error("fixture");
  funding.disbursedOn = "2026-10-20"; f.replacement.contract.effectiveOn = "2026-10-20";
  await expect(f.plans.previewSources(f.owner, f.saved.planId, f.command)).rejects.toMatchObject({ code: "REFINANCE_FUNDING_MISMATCH" });
  f.command.refinances![0].proceedsAtSettlement = { availableAmount: "1000", confirm: true, usesBeforeSettlement: [], evidence };
  expect((await f.plans.previewSources(f.owner, f.saved.planId, f.command)).status).toBe("READY");
  for (const kind of ["amount", "duplicate", "early", "sameDay", "evidence", "afterSettlement"] as const) {
    const bad = structuredClone(f.command), r = bad.refinances![0], p = r.proceedsAtSettlement!;
    if (kind === "amount") p.availableAmount = "999";
    else if (kind === "evidence") p.evidence[0].confirmedOn = "2026-10-27";
    else if (kind === "afterSettlement") {
      const loan = bad.loanCreations![0]; if (loan.funding.kind === "DISBURSED_BALANCE") loan.funding.disbursedOn = "2026-10-29";
    } else {
      p.availableAmount = "900"; r.unusedProceeds = "0";
      const use = { useId: randomUUID(), bookedOn: kind === "early" ? "2026-10-19" : kind === "sameDay" ? "2026-10-28" : "2026-10-25", amount: "100", description: "Prior cash use", evidence };
      p.usesBeforeSettlement = kind === "duplicate" ? [{ ...use, amount: "50" }, { ...use, amount: "50" }] : [use];
    }
    await expect(f.plans.previewSources(f.owner, f.saved.planId, bad)).rejects.toMatchObject({ code: "REFINANCE_FUNDING_MISMATCH" });
  }
  expect(f.rows("planVersion")).toHaveLength(1);
});

it.each([false, true])("reconciles a replacement paid down between refinancing and cutoff, including opening cap carry (%s)", async capped => {
  const f = await repaidReplacementFixture(capped), before = digest(f.rows("actualMonth"));
  const preview = await f.plans.previewSources(f.owner, f.saved.planId, f.command), candidate = preview.candidate!;
  expect(candidate.calculation.rows[0].openingBalance).toBe("770");
  expect(candidate.calculation.rows.every(r => r.capitalInjection === "0")).toBe(true);
  expect(candidate.newLoanSources![0].evidence.command.contract.principalBalance).toBe("900");
  expect(candidate.loanSources![0].evidence.consumed).toHaveLength(1);
  expect(candidate.refinances![0].settlementAmount).toBe("1020");
  const cmd = { preview: f.command, expectedInputHash: preview.inputHash!, confirm: true as const }, key = randomUUID();
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, cmd, key);
  expect(await f.plans.saveSources(f.owner, f.saved.planId, cmd, key)).toEqual(saved);
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(candidate);
  const missingProof = structuredClone(f.rows("planVersion").at(-1)!.inputSnapshot) as any;
  delete missingProof.preview.newLoanSources[0].evidence.reconciliation;
  const { integrityHash: ignored, ...payload } = missingProof; missingProof.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(missingProof)).toThrow();
  await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID());
  expect(digest(f.rows("actualMonth"))).toBe(before);
  const changed = { ...f.actual, correctionReason: "Corrected bank reference" };
  await f.actuals.write(f.owner, "2026-10", { expectedRevision: 3, data: changed }, randomUUID());
  await expect(f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(candidate);
});

it("carries new-loan allocations through later creation/revision and rejects reusing payments", async () => {
  const f = await repaidReplacementFixture(), preview = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, { preview: f.command, expectedInputHash: preview.inputHash!, confirm: true }, randomUUID());
  const command = sourceReforecastSchema.parse({ ...f.command, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 2,
    loanRevisions: [], loanCreations: [], refinances: [] });
  const option = preview.loanRevisionOptions.find(o => o.sourceId === f.replacement.sourceId)!;
  command.loanRevisions = [loanSourceRevisionSchema.parse({ commandId: randomUUID(), sourceId: option.sourceId, operation: "REVISE", confirm: true,
    expectedSourceRevision: option.sourceRevision, expectedSourceHash: option.sourceHash, expectedContractHash: option.contractHash,
    contract: f.replacement.contract, allocations: [], principalAdvances: [] })];
  const next = await f.plans.previewSources(f.owner, saved.planId, command);
  expect(next.candidate!.loanSources!.at(-1)!.evidence.consumed).toHaveLength(2);
  const savedNext = await f.plans.saveSources(f.owner, saved.planId, { preview: command, expectedInputHash: next.inputHash!, confirm: true }, randomUUID());
  expect((await f.plans.version(f.owner, saved.planId, savedNext.saved.id, true)).preview).toEqual(next.candidate);
  const funding = f.replacement.funding; if (funding.kind !== "DISBURSED_BALANCE") throw Error("fixture");
  command.expectedRevision = 3; command.loanRevisions![0].allocations = funding.allocations;
  await expect(f.plans.previewSources(f.owner, saved.planId, command)).rejects.toMatchObject({ code: "LOAN_ALLOCATION_REUSED" });
  command.loanRevisions = [];
  const duplicate = structuredClone(f.replacement); duplicate.commandId = randomUUID(); duplicate.sourceId = "plan:" + randomUUID();
  duplicate.agreementReference = "Different new debt"; delete duplicate.refinanceCommandId;
  if (duplicate.funding.kind !== "DISBURSED_BALANCE") throw Error("fixture");
  duplicate.funding.allocations[0].allocationId = randomUUID(); command.loanCreations = [duplicate];
  await expect(f.plans.previewSources(f.owner, saved.planId, command)).rejects.toMatchObject({ code: "LOAN_EVENT_OVERALLOCATED" });
});

it("rejects wrong opening principal, stale allocation and mismatched disbursement date without partial writes", async () => {
  for (const kind of ["balance", "revision", "date", "cap"] as const) {
    const f = await repaidReplacementFixture(kind === "cap"), funding = f.replacement.funding;
    if (funding.kind !== "DISBURSED_BALANCE") throw Error("fixture");
    if (kind === "balance") funding.grossPrincipal = "999";
    if (kind === "revision") funding.allocations[0].actualRevision = 2;
    if (kind === "date") funding.disbursedOn = "2026-10-29";
    if (kind === "cap") funding.openingUserPaid = "0";
    await expect(f.plans.previewSources(f.owner, f.saved.planId, f.command)).rejects.toMatchObject({ code: {
      balance: "DEBT_BALANCE_MISMATCH", revision: "LOAN_ACTUAL_STALE_OR_MISSING", date: "REFINANCE_FUNDING_MISMATCH", cap: "LOAN_CAP_CARRY_MISMATCH",
    }[kind] });
    expect(f.rows("planVersion")).toHaveLength(1);
  }
});

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
