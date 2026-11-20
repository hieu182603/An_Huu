// E1: the adjustment search respects the per-request runtime limit and continues from the cache.
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
import * as simulation from "../modules/allocation-risk/simulation";
import { clearSimulationCache } from "../modules/allocation-risk/simulation-cache";

const root = join(__dirname, "..", "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const SURVEY_MID = [
  { questionId: "Q_OBJECTIVE", choiceId: "OBJ_BALANCED" }, { questionId: "Q_HORIZON", choiceId: "HOR_LONG" },
  { questionId: "Q_LIQUIDITY", choiceId: "LIQ_MODERATE" }, { questionId: "Q_LOSS_TOLERANCE", choiceId: "LOSS_HOLD" },
  { questionId: "Q_EXPERIENCE", choiceId: "EXP_MODERATE" }, { questionId: "Q_FINANCIAL_CAPACITY", choiceId: "CAP_STABLE" },
];

async function setup() {
  vi.spyOn(console, "info").mockImplementation(() => {});
  const f = await discoveryFixture({ products: 0, articles: 0 });
  const assumptions = new AssumptionsService(f.db), portfolios = new PortfoliosService(f.db), markets = new MarketDataService(f.db);
  const a = await assumptions.create("test-admin", read("seed-data/allocation-2026-10/draft-assumptions-v3.json"));
  const impact = await assumptions.previewImpact("test-admin", a.id, { expectedRevision: 1 });
  await assumptions.approve("test-admin", a.id, { expectedRevision: 1, impactToken: impact.impactToken, reviewNote: "E1 test review" });
  await assumptions.publish("test-admin", a.id, { expectedRevision: 2, confirm: true });
  const v4 = read("seed-data/allocation-2026-10/draft-policy-v4.json"), draft = read("data/drafts/policy-params-draft.json");
  const p = await portfolios.create("test-admin", { ...v4, assumptionVersionId: a.id, customization: draft.customization });
  await portfolios.approve("test-admin", p.id, { expectedRevision: 1, confirm: true, reviewNote: "E1 test review" });
  await portfolios.publish("test-admin", p.id, { expectedRevision: 2, confirm: true });
  const m = await markets.create("test-admin", read("data/drafts/market-data-draft.json"));
  await markets.approve("test-admin", m.id, { expectedRevision: 1, confirm: true, reviewNote: "E1 test review" });
  await markets.publish("test-admin", m.id, { expectedRevision: 2, confirm: true, override: { reason: "E1 memory-db copy of draft market data" } });
  publishedPolicies.clear();
  // Same INSUFFICIENT profile as audit case C16: every lever is searched.
  await f.profiles.patchProfile("test-user", 1, fixtureProfile({
    personal: { birthMonth: known("1986-04"), desiredRetirementMonth: known("2040-05"), pensionStartMonth: { status: "NOT_APPLICABLE", reason: "E1" } } as never,
    pension: { status: "NOT_APPLICABLE", reason: "E1" } as never,
    income: { status: "KNOWN", entries: [{ id: "salary", label: "Lương", kind: "FIXED", basis: "DISPOSABLE", amount: known("22000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: "2040-04" }] } as never,
    expenses: { status: "KNOWN", entries: [
      { id: "living", label: "Sinh hoạt", category: "ESSENTIAL", amount: known("12000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null },
      { id: "travel", label: "Du lịch", category: "OPTIONAL", amount: known("3000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] } as never,
    assets: { status: "KNOWN", entries: [{ id: "liquid", label: "Tiền gửi", type: "DEPOSIT", value: known("1050000000"), currency: "VND", valuedOn: known("2026-10-04"), ownershipShare: known("1"),
      retirementShare: known("0.8"), emergencyShare: known("0.2"), otherGoalsShare: known("0"), liquidity: known("LIQUID"), availableFromMonth: known("2026-10") }] } as never,
    debts: empty() as never,
    goals: { status: "KNOWN", entries: [{ id: "g-flex", label: "Mục tiêu linh hoạt", amountToday: known("300000000"), dueMonth: known("2029-10"), priority: known("FLEXIBLE"), deferrable: { status: "KNOWN", value: true } }] } as never,
    lossTolerance: { inputMode: "PERCENT", percent: known("25"), reaction: known("HOLD") },
  } as never) as never);
  const endMonth = "2071-03";
  const ws = await allocationWorkspace(f.profiles, portfolios, assumptions, "test-user", { expectedProfileRevision: 2, policyVersionId: p.id, answers: SURVEY_MID, liquidityNeedMonths: 0, endMonth });
  const preview = { expectedProfileRevision: 2, policyVersionId: p.id, scenario: "BASE", answers: SURVEY_MID, liquidityNeedMonths: 0, endMonth,
    templateId: ws.portfolio!.assessment.selectedTemplateId!, monthlyExpenseToday: "12000000", monthlyContribution: "9000000", monthlyReserve: "0",
    retirementIncomeIds: [], allocationFunding: "PROTECTED_CAPITAL_V1" };
  return { db: f.db, service: new AllocationRiskService(f.db), preview };
}
const maxRequests = 30;
const requestLimitMs = 11_000;
const comparisonBudgetMs = maxRequests * requestLimitMs;

describe("E1: adjustment search runtime limit", () => {
  it("counts completed baseline paths when the first adjustment probe is interrupted", async () => {
    const { service, preview } = await setup();
    const paths = 20;
    const command = { plan: { kind: "PREVIEW", preview }, paths, detail: "ALLOCATION_V2" } as const;
    const partial = (done: number) => ({
      status: "LIMIT_EXCEEDED" as const, issues: ["RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED"], limits: simulation.LIMITS,
      progress: { pathsCompleted: done, pathsRequested: paths },
    });
    clearSimulationCache();
    const simulate = simulation.simulate;
    vi.spyOn(simulation, "simulate")
      .mockResolvedValueOnce(partial(19))
      .mockImplementationOnce(simulate)
      .mockResolvedValueOnce(partial(1));
    const first = await service.run("test-user", command as never, "adjustments");
    const next = await service.run("test-user", { ...command, continuation: true } as never, "adjustments");
    expect(first).toMatchObject({ status: "LIMIT_EXCEEDED", progress: { pathsCompleted: 19 } });
    expect(next).toMatchObject({ status: "LIMIT_EXCEEDED", progress: { pathsCompleted: paths + 1 } });
  });

  it("stops each request near the limit and the continued result equals the uninterrupted one", async () => {
    const { db, service, preview } = await setup();
    const command = (continuation?: boolean) => ({ plan: { kind: "PREVIEW", preview }, paths: 100, detail: "ALLOCATION_V2", ...(continuation ? { continuation } : {}) }) as never;
    clearSimulationCache();
    const times: number[] = [];
    let r: any, requests = 0, last = -1;
    do {
      const t0 = performance.now();
      r = await service.run("test-user", command(requests > 0), "adjustments");
      times.push(performance.now() - t0); requests++;
      if (r.status === "LIMIT_EXCEEDED") {
        expect(r.issues).toContain("RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED");
        expect(r.progress.pathsCompleted).toBeGreaterThan(last); last = r.progress.pathsCompleted;
      }
    } while (r.status === "LIMIT_EXCEEDED" && requests < maxRequests);
    console.log("E1 request ms", times.map(Math.round), "status", r.status);
    expect(["READY", "NOT_FEASIBLE"]).toContain(r.status);
    expect(requests).toBeGreaterThan(1);
    for (const ms of times) expect(ms).toBeLessThan(requestLimitMs);

    // One uninterrupted run (time limit lifted) must give the same answer.
    clearSimulationCache();
    const uninterrupted = new AllocationRiskService(db, undefined, { maxRuntimeMs: comparisonBudgetMs });
    const once = await uninterrupted.run("test-user", command(), "adjustments");
    expect(once).toEqual(r);
  }, 2 * comparisonBudgetMs + 30_000);
});
