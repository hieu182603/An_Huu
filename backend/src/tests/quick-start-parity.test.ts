import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { normalizeQuickStart, validateQuickStart } from "../modules/profiles/quick-start";
import type { QuickStartSurvey } from "../modules/profiles/quick-start-schema";
import { quickStartSurveySchema } from "../modules/profiles/quick-start-schema";
import { ProfileService } from "../modules/profiles/service";
import { memoryDb } from "./memory-db";
import { prepareRetirement } from "../modules/retirement/prepare";
import { retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { profileSourceRegistry } from "../modules/retirement/source-profile";
import { surveyGoalExpenses } from "../modules/retirement/survey-goals";
import { essentialCoverage } from "../modules/retirement/preview-insights";
const survey = (): QuickStartSurvey => ({ version: 1, birthDate: "1967-01-24", retirementAge: 60,
  monthlyExpenseToday: "200", monthlyIncome: "400", monthlyExpense: "250", retirementSavings: "3000", monthlyContribution: "50", emergencyAmount: "1000",
  maritalStatus: "DIVORCED", dependents: 2, childEnabled: true, childAmount: "30", childDuration: "1", childIncluded: true,
  parentEnabled: true, parentAmount: "20", parentDuration: "3", parentIncluded: false,
  debtEnabled: true, debtBalance: "60", debtMonthlyPayment: "20", debtAnnualRatePercent: "0",
  goalEnabled: true, goalName: "Học phí", goalAmount: "120", goalMonth: "2027-02", goalDeferrable: true,
  pensionStatus: "known", pension: "40", pensionStart: "2027-01", reaction: "HOLD", stability: "VARIABLE", priority: "HEALTH", lossStatus: "percent", lossPercent: "12.5" });
const input = (s = survey()) => ({ schemaVersion: 2 as const, valuationDate: "2026-10-01", quickStartSurvey: s });
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("quick survey: demo data semantics on the server", () => {
  it("preserves distinct spending, full birth date, contribution and the 85th-birthday horizon", () => {
    const p = normalizeQuickStart(input(), true);
    expect(p.personal).toMatchObject({ birthDate: "1967-01-24", birthMonth: { value: "1967-01" }, desiredRetirementMonth: { value: "2027-01" }, maritalStatus: "DIVORCED" });
    expect(p.retirementGoal).toEqual({ endMonth: "2051-12", monthlyExpenseToday: "200", monthlyContribution: "50", lifestylePriority: "HEALTH" });
    expect(p.quickStartSurvey?.monthlyExpense).toBe("250");
    expect(profileV2Summary(p).values).toMatchObject({ monthlyExpense: "270", emergencyReserve: "1000", retirementLiquidAssets: "3000", totalAssets: "4000" });
    expect(p.pension).toMatchObject({ status: "KNOWN", monthlyAmount: "40", priceBasis: "TODAY" });
    expect(p.goals).toMatchObject({ status: "KNOWN", entries: [{ amountToday: { value: "120" }, dueMonth: { value: "2027-02" }, deferrable: { value: true } }] });
  });
  it("saves, reloads and completes through ProfileService without losing or doubling entries", async () => {
    const f = memoryDb(), service = new ProfileService(f.db);
    await service.saveDraft("owner", 0, "investment", input());
    const draft = await service.getDraft("owner");
    expect(draft?.data).toMatchObject({ quickStartSurvey: survey() });
    await service.saveDraft("owner", 1, "investment", input());
    const result = await service.complete("owner", { expectedDraftRevision: 2, expectedProfileRevision: 0 }, randomUUID());
    expect(result).toMatchObject({ completed: true, revision: 1 });
    const saved = await service.getProfile("owner");
    expect(saved?.data).toMatchObject({ retirementGoal: { monthlyContribution: "50" }, quickStartSurvey: { monthlyExpenseToday: "200", monthlyExpense: "250" } });
    expect(f.rows("onboardingDraft")).toHaveLength(0);
  });
  it("retains explicit none, unknown and zero without inventing survey answers", () => {
    const p = normalizeQuickStart(input({ ...survey(), pensionStatus: "none", childEnabled: false, parentEnabled: false, goalEnabled: false, dependents: null, monthlyContribution: "0", lossStatus: "amount", lossAmount: "0" }), true);
    expect(p.personal.dependents).toEqual({ status: "UNKNOWN" });
    expect(p.pension?.status).toBe("NOT_APPLICABLE");
    expect(p.goals?.status).toBe("NOT_APPLICABLE");
    expect(p.lossTolerance?.amountVnd).toEqual({ status: "KNOWN", value: "0" });
    expect(p.lossTolerance?.percent).toEqual({ status: "UNKNOWN" });
    expect(p.retirementSurvey).toBeUndefined();
    expect(p.retirementGoal?.monthlyContribution).toBe("0");
  });
  it("rejects invalid dates, rate/payment mismatch, unsupported money and missing consented reaction", () => {
    expect(quickStartSurveySchema.safeParse({ ...survey(), birthDate: "1967-02-30" }).success).toBe(false);
    expect(quickStartSurveySchema.safeParse({ ...survey(), retirementAge: 60.5 }).success).toBe(false);
    expect(quickStartSurveySchema.safeParse({ ...survey(), monthlyIncome: "1000000000000001" }).success).toBe(false);
    for (const s of [{ ...survey(), debtAnnualRatePercent: "12", debtMonthlyPayment: "0.01" }, { ...survey(), monthlyExpense: "10" }, { ...survey(), reaction: null }, { ...survey(), lossPercent: null }])
      expect(() => validateQuickStart(s, "2026-10-01", true)).toThrow();
  });
  it("lets unfinished drafts retain unknown money instead of fabricating totals", () => {
    const p = normalizeQuickStart({ schemaVersion: 2, valuationDate: "2026-10-01", quickStartSurvey: { version: 1, birthDate: "1967-01-24", retirementAge: 60, monthlyExpenseToday: "200" } });
    expect(p.income.status).toBe("UNKNOWN"); expect(p.assets.status).toBe("UNKNOWN");
    expect(() => normalizeQuickStart({ ...input(), quickStartSurvey: { version: 1 } }, true)).toThrow();
  });
  it("charges a surveyed goal exactly once while excluding the separate emergency asset from fund capital", () => {
    const s = { ...survey(), endMonth: "2027-03" }, p = normalizeQuickStart(input(s), true), c = retirementCommand();
    c.monthlyExpenseToday = "200"; c.monthlyContribution = "50"; c.retirementAdditionalExpenseIds = ["exp_quick_child", "exp_quick_parent"];
    const cfg = retirementConfiguration(), result = prepareRetirement(p, c, cfg.policy, cfg.assumptions);
    expect(result.status).toBe("READY"); if (result.status !== "READY") return;
    expect(result.replayInput.initialCapital).toBe("3000");
    const due = result.calculation.rows.find(r => r.month === "2027-02")!;
    expect(due.additionalExpense).toBe("170"); // support 30+20 and one-off goal 120
    expect(result.calculation.rows.filter(r => Number(r.additionalExpense) > 50)).toHaveLength(1);
    expect(result.calculation.rows[3].pension).toBe("40");
    expect(result.calculation.summary.plannedMonthlyContribution).toBe("50");
    const registry = profileSourceRegistry(p, c, result.replayInput.rows, "a".repeat(64), result.surveyGoalCashflows);
    expect(registry.revisions.some(r => r.sourceId === "profile:goal:goal_quick")).toBe(true);
  });
  it("indexes retirement support and pension to receipt, and reconciles dated goal inflation with the source ledger", () => {
    const p = normalizeQuickStart(input({ ...survey(), endMonth: "2027-03" }), true), c = retirementCommand();
    c.monthlyExpenseToday = "200"; c.retirementAdditionalExpenseIds = ["exp_quick_child", "exp_quick_parent"];
    const cfg = retirementConfiguration();
    cfg.assumptions.inflation.forEach(row => { row.percent = "12"; });
    cfg.assumptions.retirementPlanningAnnualPercent = "12";
    const result = prepareRetirement(p, c, cfg.policy, cfg.assumptions);
    expect(result.status).toBe("READY"); if (result.status !== "READY") return;
    const january = result.replayInput.rows.find(row => row.month === "2027-01")!;
    // October -> January: three monthly CPI factors, at the beginning of each month.
    expect(Number(january.livingExpense)).toBeCloseTo(200 * 1.01 ** 3, 9);
    expect(Number(january.additionalExpense)).toBeCloseTo(50 * 1.01 ** 3, 9);
    expect(Number(january.pension)).toBeCloseTo(40 * 1.01 ** 3, 9);
    const goal = result.surveyGoalCashflows![0];
    // Goal valuation uses the existing canonical goal/capital-separation convention.
    expect(Number(goal.amount)).toBeCloseTo(120 * 1.12 ** (4 / 12), 9);
    expect(() => profileSourceRegistry(p, c, result.replayInput.rows, "b".repeat(64), result.surveyGoalCashflows)).not.toThrow();
  });
  it("leaves legacy composition unchanged and lets protected funding own its goal charge", () => {
    const p = normalizeQuickStart(input(), true), cfg = retirementConfiguration();
    expect(surveyGoalExpenses(p, cfg.assumptions, "2027-03", true).entries).toEqual([]);
    delete p.quickStartSurvey;
    expect(surveyGoalExpenses(p, cfg.assumptions, "2027-03").entries).toEqual([]);
  });
  it.each([false, true])("classifies an unfunded survey goal using its actual deferrable choice: %s", goalDeferrable => {
    const p = normalizeQuickStart(input({ ...survey(), endMonth: "2027-03", childEnabled: false, parentEnabled: false,
      monthlyIncome: "0", monthlyExpense: "0", retirementSavings: "0", emergencyAmount: "0", monthlyContribution: "0",
      debtEnabled: false, pensionStatus: "none", goalMonth: "2026-11", goalDeferrable }), true);
    const c = retirementCommand(); c.monthlyContribution = "0";
    const cfg = retirementConfiguration(), result = prepareRetirement(p, c, cfg.policy, cfg.assumptions);
    expect(result.status).toBe("READY");
    expect(result.calculation?.rows.find(row => row.month === "2026-11")?.unfundedWithdrawal).toBe("120");
    const due = essentialCoverage(p, c, result).rows.find(row => row.month === "2026-11")!;
    expect(due).toMatchObject({ essentialExpense: goalDeferrable ? "0" : "120", essentialShortfall: goalDeferrable ? "0" : "120", otherShortfall: goalDeferrable ? "120" : "0" });
    if (p.goals?.status !== "KNOWN") throw new Error("fixture");
    p.goals.entries[0].priority = { status: "UNKNOWN" };
    const unknownPriority = essentialCoverage(p, c, result);
    expect(unknownPriority.essentialShortfall).toBeNull();
    expect(unknownPriority.rows.find(row => row.month === "2026-11")).toMatchObject({ essentialExpense: null, essentialShortfall: null, otherShortfall: null });
  });
});
