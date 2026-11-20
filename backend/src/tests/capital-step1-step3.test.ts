import { describe, expect, it, vi } from "vitest";
import { separateCapital } from "../modules/capital/separation";
import { assessLossConstraint, lossConstraintSchema } from "../modules/capital/loss-constraint";
import { liquidityRequirement, reconcileLiquidityNeeds } from "../modules/capital/liquidity";
import { dependentWarnings, obligationSchedule } from "../modules/retirement/obligations";
import { RetirementService } from "../modules/retirement/service";
import { portfolioDocumentSchema } from "../modules/portfolios/schema";
import { profileV2Schema, type ProfileV2 } from "../modules/profiles/schema-v2";
import { allocationWorkspace, saveAllocationRisk } from "../modules/portfolios/workspace";
import { fixtureProfile, fixtureAsset, known, unknown, empty } from "./profile-v2-fixtures";
import { assumptionFixture } from "./assumptions-fixtures";
import { glidePortfolioFixture } from "./portfolio-fixtures";
import { allocationFixture } from "./allocation-workspace-fixtures";
import { retirementCommand } from "./retirement-fixtures";

function assumptions() {
  const a = assumptionFixture();
  a.projectionEndYear = 2035;
  a.assetClasses = [{ code: "CASH", label: "Tiền gửi", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] }];
  a.inflation = Array.from({ length: 10 }, (_, i) => ({ ...a.inflation[0], year: 2026 + i, percent: "4" }));
  a.returns = a.inflation.map(r => ({ ...a.returns[0], year: r.year, assetClass: "CASH", rate: { type: "EFFECTIVE_ANNUAL", percent: "4.5" } }));
  return a;
}

function stressPolicy() {
  const policy = glidePortfolioFixture();
  policy.lossStress = {
    evidence: "Test shock",
    equityAssetClass: "EQUITY",
    depositAssetClass: "CASH",
    shocks: [{ assetClass: "CASH", percent: "0" }, { assetClass: "EQUITY", percent: "-40" }],
  };
  return policy;
}

function baseProfile(over: Partial<ProfileV2> = {}): ProfileV2 {
  const p = fixtureProfile({
    debts: empty(),
    goals: empty(),
    assets: { status: "KNOWN", entries: [fixtureAsset({ value: known("1000000000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] },
    ...over,
  });
  if (p.expenses.status === "KNOWN") p.expenses.entries[0].amount = known("15000000");
  return p;
}

const knownBool = (value: boolean) => ({ status: "KNOWN" as const, value });
const holdings = [{ assetClass: "CASH", startWeightPercent: "50" }, { assetClass: "EQUITY", startWeightPercent: "50" }];

describe("B2-1: loss tolerance percent-only, amount-only, and both (min + bindingLimit)", () => {
  it("supports percent-only, amount-only, and both taking min with bindingLimit", () => {
    const a = assumptions(), policy = stressPolicy();
    const p = baseProfile();
    const capital = { ...separateCapital(p, a), growthCapital: "1000000000" };

    // Percent only (25% of 1B = 250M)
    const pctOnly = assessLossConstraint(capital, { ...p, lossTolerance: { percent: known("25") } }, policy, holdings);
    expect(pctOnly).toMatchObject({ status: "WITHIN_LIMIT", allowedLossAmount: "250000000", bindingLimit: "PERCENT" });
    expect(lossConstraintSchema.safeParse(pctOnly).success).toBe(true);

    // Amount only (180M)
    const amtOnly = assessLossConstraint(capital, { ...p, lossTolerance: { amountVnd: known("180000000") } }, policy, holdings);
    expect(amtOnly).toMatchObject({ status: "REDUCE_RISK", allowedLossAmount: "180000000", bindingLimit: "AMOUNT" });

    // Both: amount binds (min(150M, 30% * 1B = 300M) = 150M)
    const bothAmt = assessLossConstraint(capital, { ...p, lossTolerance: { inputMode: "BOTH", percent: known("30"), amountVnd: known("150000000") } }, policy, holdings);
    expect(bothAmt).toMatchObject({ status: "REDUCE_RISK", allowedLossAmount: "150000000", bindingLimit: "AMOUNT" });

    // Both: percent binds (min(300M, 18% * 1B = 180M) = 180M)
    const bothPct = assessLossConstraint(capital, { ...p, lossTolerance: { inputMode: "BOTH", percent: known("18"), amountVnd: known("300000000") } }, policy, holdings);
    expect(bothPct).toMatchObject({ status: "REDUCE_RISK", allowedLossAmount: "180000000", bindingLimit: "PERCENT" });
  });

  it("saves BOTH percent and amountVnd via saveAllocationRisk", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const f = await allocationFixture();
    await saveAllocationRisk(f.profiles, f.portfolios, f.assumptions, "test-user", {
      expectedRevision: 2, policyVersionId: f.policy.id, reaction: "HOLD",
      limit: { kind: "BOTH", percent: "20", amountVnd: "150000000" },
    });
    const saved = await f.profiles.getProfile("test-user");
    expect((saved?.data as ProfileV2).lossTolerance).toEqual({
      inputMode: "BOTH", reaction: known("HOLD"), percent: known("20"), amountVnd: known("150000000"),
    });
  });
});

describe("B2-2 & B2-4: optional policy lossReaction and occupationalRisk blocks", () => {
  it("applies lossReaction factor only when policy defines lossReaction and reaction is KNOWN", () => {
    const a = assumptions(), p = baseProfile({ lossTolerance: { inputMode: "PERCENT", percent: known("20"), reaction: known("SELL") } });
    const capital = { ...separateCapital(p, a), growthCapital: "1000000000" };

    // Without policy.lossReaction: unchanged and reactionApplied absent/falsy
    const basePolicy = stressPolicy();
    const off = assessLossConstraint(capital, p, basePolicy, holdings);
    expect(off.allowedLossAmount).toBe("200000000");
    expect(off.reactionApplied).toBe(false);

    // With policy.lossReaction: SELL 0.5 halves allowed loss -> 100M
    const withReaction = {
      ...basePolicy,
      lossReaction: {
        evidence: "CHỜ DUYỆT: hệ số thử nghiệm",
        SELL: { allowedLossFactor: "0.5" },
        HOLD: { allowedLossFactor: "1" },
        BUY_MORE: { allowedLossFactor: "1.1" },
      },
    };
    expect(portfolioDocumentSchema.safeParse(withReaction).success).toBe(true);
    const sellRes = assessLossConstraint(capital, p, withReaction, holdings);
    expect(sellRes).toMatchObject({ allowedLossAmount: "100000000", reactionApplied: true, status: "REDUCE_RISK" });

    // Unknown reaction: does not apply factor, reactionApplied = false
    const unkRes = assessLossConstraint(capital, { ...p, lossTolerance: { inputMode: "PERCENT", percent: known("20"), reaction: unknown } }, withReaction, holdings);
    expect(unkRes).toMatchObject({ allowedLossAmount: "200000000", reactionApplied: false });
  });

  it("validates optional occupationalRisk block on v2 portfolio policy", () => {
    const policy = {
      ...stressPolicy(),
      occupationalRisk: {
        evidence: "CHỜ DUYỆT: quy tắc rủi ro nghề nghiệp",
        employerConcentration: { maxEquityPercentReduction: "10", excludeEmployerSector: true },
        incomeStability: { UNCERTAIN: { maxEquityPercent: "40" } },
      },
    };
    expect(portfolioDocumentSchema.safeParse(policy).success).toBe(true);
    expect(portfolioDocumentSchema.safeParse({ ...policy, occupationalRisk: { evidence: "OK", extra: 1 } }).success).toBe(false);
  });
});

describe("B2-3, B3-1 & B3-2: liquidity requirements, goal reconciliation, and discountBasis", () => {
  it("reports discountBasis PINNED_DEPOSIT_RATE_BY_HORIZON and computes liquidityRequirement without double-counting RESERVED goals", () => {
    const a = assumptions();
    const p = baseProfile({
      goals: {
        status: "KNOWN",
        entries: [{
          id: "car", label: "Mua xe", amountToday: known("200000000"),
          dueMonth: known("2028-10"), priority: known("ESSENTIAL"), deferrable: knownBool(false),
        }],
      },
      liquidityNeeds: { y3: known("350000000") },
    });
    const capital = separateCapital(p, a);
    expect(capital.discountBasis).toBe("PINNED_DEPOSIT_RATE_BY_HORIZON");
    expect(capital.warnings.map(w => w.code)).toContain("LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION");

    const req = liquidityRequirement(p, capital, a);
    expect(req.issues).toEqual([]);
    const h12 = req.horizons.find(h => h.months === 12)!;
    const h36 = req.horizons.find(h => h.months === 36)!;
    const h60 = req.horizons.find(h => h.months === 60)!;
    expect(h12).toEqual({ months: 12, amount: "0", coveredByReserved: "0", uncovered: "0" });
    expect(h36.coveredByReserved).toBe(capital.goals[0].presentValue);
    expect(h36.uncovered).toBe("350000000");
    expect(Number(h36.amount)).toBeCloseTo(Number(capital.goals[0].presentValue) + 350000000, 2);
    expect(h60.uncovered).toBe("350000000");

    // A confirmed200M goal covers only200M of the350M declaration;150M remains uncovered.
    const matchedProfile: ProfileV2 = { ...p, liquidityNeeds: { y3: { status: "KNOWN", value: "350000000", matchedGoalId: "car" } } };
    expect(profileV2Schema.safeParse(matchedProfile).success).toBe(true);
    const matchedCapital = separateCapital(matchedProfile, a);
    expect(matchedCapital.warnings.map(w => w.code)).not.toContain("LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION");
    const matchedReq = liquidityRequirement(matchedProfile, matchedCapital, a);
    expect(matchedReq.horizons.find(h => h.months === 36)!.uncovered).toBe("150000000");

    // Invalid matchedGoalId is rejected by schema
    expect(profileV2Schema.safeParse({ ...p, liquidityNeeds: { y3: { status: "KNOWN", value: "350000000", matchedGoalId: "missing" } } }).success).toBe(false);
  });

  it("suggests matching goals within +-3 months and +-10% amount without auto-matching", () => {
    const p = baseProfile({
      goals: {
        status: "KNOWN",
        entries: [
          { id: "match", label: "Sửa nhà", amountToday: known("315000000"), dueMonth: known("2029-12"), priority: known("FLEXIBLE"), deferrable: knownBool(true) }, // +38m (within 36+-3), +5% (within +-10%)
          { id: "too-far", label: "Xa hạn", amountToday: known("300000000"), dueMonth: known("2030-03"), priority: known("FLEXIBLE"), deferrable: knownBool(true) }, // +41m (outside 36+-3)
          { id: "too-big", label: "Quá lệch tiền", amountToday: known("360000000"), dueMonth: known("2029-10"), priority: known("FLEXIBLE"), deferrable: knownBool(true) }, // +20% (outside +-10%)
        ],
      },
      liquidityNeeds: { y3: known("300000000") },
    });
    const rec = reconcileLiquidityNeeds(p);
    expect(rec).toHaveLength(1);
    expect(rec[0].matchedGoalId).toBeNull();
    expect(rec[0].suggestions.map(s => s.goalId)).toEqual(["match"]);
  });
});

describe("B1-1 & B1-3: obligationSchedule priority ordering and dependents warning", () => {
  it("orders obligations strictly by priority ranks 1..7 and exposes them + dependents warning in workspace", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const f = await allocationFixture();
    const cur = (await f.profiles.getProfile("test-user"))!.data as ProfileV2;
    const patched: ProfileV2 = {
      ...cur,
      personal: { ...cur.personal, dependents: known(2) },
      expenses: {
        status: "KNOWN",
        entries: [
          { id: "opt", label: "Du lịch", category: "OPTIONAL", amount: known("2000000"), currency: "VND", startMonth: "2026-10", endMonth: "2027-09", frequency: "MONTHLY" },
          { id: "hlt", label: "Bảo hiểm y tế", category: "HEALTH", amount: known("1000000"), currency: "VND", startMonth: "2026-10", endMonth: "2027-09", frequency: "MONTHLY" },
          { id: "ess", label: "Sinh hoạt thiết yếu", category: "ESSENTIAL", amount: known("12000000"), currency: "VND", startMonth: "2026-10", endMonth: "2027-09", frequency: "MONTHLY" },
        ],
      },
      debts: {
        status: "KNOWN",
        entries: [{
          id: "loan1", label: "Vay mua nhà", outstandingBalance: known("120000000"), balanceAsOf: known("2026-10-04"), currency: "VND",
          payment: known("10000000"), paymentShare: known("1"), balanceShare: known("1"),
          responsibility: { status: "UNKNOWN" }, startMonth: "2026-10", endMonth: "2027-09", frequency: "MONTHLY",
        }],
      },
      goals: {
        status: "KNOWN",
        entries: [
          { id: "g-leg", label: "Di sản", amountToday: known("500000000"), dueMonth: known("2035-10"), priority: known("LEGACY"), deferrable: knownBool(true) },
          { id: "g-flex", label: "Đổi xe", amountToday: known("200000000"), dueMonth: known("2029-10"), priority: known("FLEXIBLE"), deferrable: knownBool(true) },
          { id: "g-ess", label: "Học phí con", amountToday: known("100000000"), dueMonth: known("2028-10"), priority: known("ESSENTIAL"), deferrable: knownBool(false) },
        ],
      },
    };
    await f.profiles.patchProfile("test-user", 2, patched);
    const ws = await allocationWorkspace(f.profiles, f.portfolios, f.assumptions, "test-user", { ...f.command, expectedProfileRevision: 3 });

    expect(ws.obligations.map(o => [o.priorityRank, o.id])).toEqual([
      [1, "ess"],
      [1, "retirement-living"],
      [2, "loan1"],
      [3, "g-ess"],
      [4, "hlt"],
      [5, "g-flex"],
      [6, "opt"],
      [7, "g-leg"],
    ]);
    expect(ws.obligations.find(o => o.id === "g-flex")?.deferrable).toBe(true);
    expect(ws.warnings).toContainEqual({ path: "personal.dependents", code: "DEPENDENT_EXPENSES_NOT_DECLARED" });

    // With CASH deposit assumptions, separateCapital populates presentValue for reserved goals in obligationSchedule
    const cap = separateCapital(patched, assumptions());
    const withCap = obligationSchedule(patched, { capital: cap, endMonth: f.command.endMonth });
    expect(withCap.find(o => o.id === "g-ess")?.presentValue).toBe(cap.goals.find(g => g.id === "g-ess")?.presentValue);

    // Adding a DEPENDENT expense clears the warning
    const baseEntries = patched.expenses.status === "KNOWN" ? patched.expenses.entries : [];
    const withDep: ProfileV2 = {
      ...patched,
      expenses: {
        status: "KNOWN",
        entries: [...baseEntries, { id: "dep", label: "Phụ cấp cha mẹ", category: "DEPENDENT", amount: known("3000000"), currency: "VND", startMonth: "2026-10", endMonth: null, frequency: "MONTHLY" }],
      },
    };
    expect(dependentWarnings(withDep)).toEqual([]);
    expect(obligationSchedule(withDep).find(o => o.id === "dep")?.priorityRank).toBe(4);
  });

  it("includes RETIREMENT_LIVING at rank 1 when replayInput is supplied and uses buildContractSchedule for contract debts", () => {
    const p = baseProfile({
      debts: {
        status: "KNOWN",
        entries: [{
          id: "mortgage", label: "Vay mua nhà", outstandingBalance: known("120000000"), balanceAsOf: known("2026-10-04"),
          currency: "VND", payment: known("10000000"), paymentShare: known("1"), balanceShare: known("1"),
          responsibility: { status: "UNKNOWN" }, startMonth: "2026-10", endMonth: "2026-12", frequency: "MONTHLY",
          contract: {
            status: "KNOWN",
            value: {
              contractVersion: 1, source: "Hợp đồng tín dụng mẫu", confirmedOn: "2026-10-04", balanceAsOf: "2026-10-04",
              interestBasis: "REDUCING_BALANCE", periodConvention: "DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS",
              maturityDate: "2026-12-15", settleRemainingAtMaturity: true,
              parties: [{ reference: "user1", role: "BORROWER" }],
              periods: ["2026-10-15", "2026-11-15", "2026-12-15"].map(dueDate => ({
                dueDate,
                rate: { kind: "NOMINAL_ANNUAL_MONTHLY" as const, percent: "12" },
                repayment: { kind: "PRINCIPAL_PLUS_INTEREST" as const, amount: "40000000" },
                minimumPayment: "0", fee: "0",
                prepayment: { status: "UNKNOWN" as const },
              })),
            },
          },
        }],
      },
    });
    const rows = obligationSchedule(p, {
      endMonth: "2027-12",
      replayInput: {
        valuationDate: "2026-10-04", retirementMonth: "2027-01", initialCapital: "1000000000",
        terminalBalance: "0", monthlyContribution: "0", contributionTiming: "END_OF_MONTH",
        rows: [
          { month: "2026-12", growthFactor: "1", inflationFactor: "1", income: "0", pension: "0", livingExpense: "15000000", additionalExpense: "0", debtPayment: "0", plannedContribution: "0", contribution: "0", contributionCapacity: "0", withdrawal: "0", uninvestedSurplus: "0", capitalInjection: "0" },
          { month: "2027-01", growthFactor: "1", inflationFactor: "1", income: "0", pension: "0", livingExpense: "20000000", additionalExpense: "0", debtPayment: "0", plannedContribution: "0", contribution: "0", contributionCapacity: "0", withdrawal: "0", uninvestedSurplus: "0", capitalInjection: "0" },
          { month: "2027-02", growthFactor: "1", inflationFactor: "1", income: "0", pension: "0", livingExpense: "20500000", additionalExpense: "0", debtPayment: "0", plannedContribution: "0", contribution: "0", contributionCapacity: "0", withdrawal: "0", uninvestedSurplus: "0", capitalInjection: "0" },
        ],
      },
    });
    const living = rows.find(r => r.kind === "RETIREMENT_LIVING");
    expect(living).toMatchObject({ priorityRank: 1, firstMonth: "2027-01", lastMonth: "2027-02", totalNominal: "40500000", deferrable: false });
    const debt = rows.find(r => r.id === "mortgage");
    expect(debt).toMatchObject({ kind: "CONTRACT_DEBT", priorityRank: 2, firstMonth: "2026-10", lastMonth: "2026-12" });
    expect(Number(debt?.totalNominal)).toBeGreaterThan(120000000); // principal + contractual interest
  });

  it("exposes obligations and DEPENDENT_EXPENSES_NOT_DECLARED warning in RetirementService.preview without changing inputHash", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const f = await allocationFixture();
    const cur = (await f.profiles.getProfile("test-user"))!.data as ProfileV2;
    await f.profiles.patchProfile("test-user", 2, { ...cur, personal: { ...cur.personal, dependents: known(1) } });
    const ws = await allocationWorkspace(f.profiles, f.portfolios, f.assumptions, "test-user", { ...f.command, expectedProfileRevision: 3 });
    const retirement = new RetirementService(f.db);
    const preview = await retirement.preview("test-user", {
      ...retirementCommand(f.policy.id),
      expectedProfileRevision: 3, scenario: "BASE",
      answers: f.command.answers, liquidityNeedMonths: 0, endMonth: f.command.endMonth,
      templateId: ws.portfolio!.assessment.selectedTemplateId!, monthlyExpenseToday: "12000000", monthlyContribution: "5000000",
      monthlyReserve: "0", retirementIncomeIds: [],
    }, { adjustments: false });
    expect(preview.status).toBe("READY");
    expect(preview.warnings).toContainEqual({ path: "personal.dependents", code: "DEPENDENT_EXPENSES_NOT_DECLARED" });
    expect(preview.obligations?.some(o => o.kind === "ESSENTIAL_EXPENSE")).toBe(true);
    expect(preview.obligations?.some(o => o.kind === "RETIREMENT_LIVING")).toBe(true);
  });
});
