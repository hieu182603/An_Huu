// Audit case C16 (spec B1-2): a 300M VND FLEXIBLE deferrable goal in 3 years makes the plan
// infeasible upfront (reserved out of growth capital in Step 3), and deferring it past 60 months
// via the 4th adjustment lever makes p_essential reach the approved threshold on the same paths.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discoveryFixture } from "./discovery-fixtures";
import { fixtureProfile, known, empty } from "./profile-v2-fixtures";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService, publishedPolicies } from "../modules/portfolios/service";
import { MarketDataService } from "../modules/allocation-risk/market-service";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { allocationWorkspace } from "../modules/portfolios/workspace";

const root = join(__dirname, "..", "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

const SURVEY_MID = [
  { questionId: "Q_OBJECTIVE", choiceId: "OBJ_BALANCED" },
  { questionId: "Q_HORIZON", choiceId: "HOR_LONG" },
  { questionId: "Q_LIQUIDITY", choiceId: "LIQ_MODERATE" },
  { questionId: "Q_LOSS_TOLERANCE", choiceId: "LOSS_HOLD" },
  { questionId: "Q_EXPERIENCE", choiceId: "EXP_MODERATE" },
  { questionId: "Q_FINANCIAL_CAPACITY", choiceId: "CAP_STABLE" },
];

describe("C16 (B1-2): deferring a FLEXIBLE deferrable 300M 3-year goal rescues an infeasible plan", () => {
  it("runs C16 end-to-end on production seed documents and finds a passing deferral via deferFlexibleGoals", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const f = await discoveryFixture({ products: 0, articles: 0 });
    const assumptions = new AssumptionsService(f.db), portfolios = new PortfoliosService(f.db), markets = new MarketDataService(f.db);
    const a = await assumptions.create("test-admin", read("seed-data/allocation-2026-10/draft-assumptions-v3.json"));
    const impact = await assumptions.previewImpact("test-admin", a.id, { expectedRevision: 1 });
    await assumptions.approve("test-admin", a.id, { expectedRevision: 1, impactToken: impact.impactToken, reviewNote: "C16 audit copy" });
    await assumptions.publish("test-admin", a.id, { expectedRevision: 2, confirm: true });
    const v4 = read("seed-data/allocation-2026-10/draft-policy-v4.json"), draft = read("data/drafts/policy-params-draft.json");
    const p = await portfolios.create("test-admin", { ...v4, assumptionVersionId: a.id, customization: draft.customization });
    await portfolios.approve("test-admin", p.id, { expectedRevision: 1, confirm: true, reviewNote: "C16 audit copy" });
    await portfolios.publish("test-admin", p.id, { expectedRevision: 2, confirm: true });
    const m = await markets.create("test-admin", read("data/drafts/market-data-draft.json"));
    await markets.approve("test-admin", m.id, { expectedRevision: 1, confirm: true, reviewNote: "C16 audit copy" });
    await markets.publish("test-admin", m.id, { expectedRevision: 2, confirm: true, override: { reason: "C16 memory-db copy of unverified draft market data" } });
    publishedPolicies.clear();

    // 300M VND FLEXIBLE deferrable goal in 3 years (2029-10).
    // Liquid 1.05B, essential 12M/m (6m reserve = 72M), near-term goal PV ~296M => growthCapital ~682M -> infeasible at retire 2040-05.
    // Deferring the goal > 60 months moves ~296M back into growthCapital => growthCapital ~978M -> feasible!
    const profile = fixtureProfile({
      personal: { birthMonth: known("1986-04"), desiredRetirementMonth: known("2040-05"), pensionStartMonth: { status: "NOT_APPLICABLE", reason: "C16: no pension" } } as never,
      pension: { status: "NOT_APPLICABLE", reason: "C16: no pension" } as never,
      income: { status: "KNOWN", entries: [{ id: "salary", label: "Lương", kind: "FIXED", basis: "DISPOSABLE", amount: known("22000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: "2040-04" }] } as never,
      expenses: { status: "KNOWN", entries: [{ id: "living", label: "Sinh hoạt", category: "ESSENTIAL", amount: known("12000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] } as never,
      assets: { status: "KNOWN", entries: [{ id: "liquid", label: "Tiền gửi", type: "DEPOSIT", value: known("1050000000"), currency: "VND", valuedOn: known("2026-10-04"), ownershipShare: known("1"),
        retirementShare: known("0.8"), emergencyShare: known("0.2"), otherGoalsShare: known("0"), liquidity: known("LIQUID"), availableFromMonth: known("2026-10") }] } as never,
      debts: empty() as never,
      goals: { status: "KNOWN", entries: [{ id: "g-flex", label: "Mục tiêu linh hoạt 300tr", amountToday: known("300000000"),
        dueMonth: known("2029-10"), priority: known("FLEXIBLE"), deferrable: { status: "KNOWN", value: true } }] } as never,
      lossTolerance: { inputMode: "PERCENT", percent: known("25"), reaction: known("HOLD") },
    } as never);
    await f.profiles.patchProfile("test-user", 1, profile as never);

    const endMonth = "2071-03";
    const ws = await allocationWorkspace(f.profiles, portfolios, assumptions, "test-user", {
      expectedProfileRevision: 2, policyVersionId: p.id, answers: SURVEY_MID, liquidityNeedMonths: 0, endMonth,
    });
    const templateId = ws.portfolio!.assessment.selectedTemplateId!;
    const preview = {
      expectedProfileRevision: 2, policyVersionId: p.id, scenario: "BASE", answers: SURVEY_MID,
      liquidityNeedMonths: 0, endMonth, templateId, monthlyExpenseToday: "12000000",
      monthlyContribution: "9000000", monthlyReserve: "0", retirementIncomeIds: [],
      allocationFunding: "PROTECTED_CAPITAL_V1",
    };

    const service = new AllocationRiskService(f.db);
    const sel: any = await service.run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20, detail: "ALLOCATION_V2" } as never, "selection");
    expect(sel.status).toBe("INSUFFICIENT");
    const picked = (sel.candidates ?? []).find((x: any) => x.id === sel.referenceId);
    expect(picked).toBeTruthy();

    const chosen = picked.selection ?? { templateId };
    const adj: any = await service.run("test-user", {
      plan: { kind: "PREVIEW", preview: { ...preview, templateId: chosen.templateId, ...(chosen.customAllocation ? { customAllocation: chosen.customAllocation } : {}) } },
      paths: 20, detail: "ALLOCATION_V2",
    } as never, "adjustments");
    expect(adj.status).toBe("READY");
    expect(adj.deferFlexibleGoals.status).toBe("FOUND");
    expect(adj.deferFlexibleGoals.deferMonths).toBeGreaterThanOrEqual(24);
    expect(adj.deferFlexibleGoals.deferMonths).toBeLessThanOrEqual(60);
    expect(adj.deferFlexibleGoals.pEssential).toBeGreaterThanOrEqual(0.9);
    expect(adj.deferFlexibleGoals.deferredGoalIds).toEqual(["g-flex"]);
  }, 60_000);
});
