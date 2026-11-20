import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { digest } from "../common/digest";
import { discoveryFixture } from "./discovery-fixtures";
import { fixtureProfile, known, empty } from "./profile-v2-fixtures";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService, publishedPolicies } from "../modules/portfolios/service";
import { MarketDataService } from "../modules/allocation-risk/market-service";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { checkPortfolioFeasibility } from "../modules/allocation-risk/optimizer";
import { continuousCandidate } from "../modules/allocation-risk/optimizer-candidate";
import { allocationWorkspace } from "../modules/portfolios/workspace";
import { marketDocumentSchema } from "../modules/allocation-risk/market-schema";

const root = join(__dirname, "..", "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

const SURVEY_MID = {
  Q_OBJECTIVE: "OBJ_BALANCED",
  Q_HORIZON: "HOR_LONG",
  Q_LIQUIDITY: "LIQ_MODERATE",
  Q_LOSS_TOLERANCE: "LOSS_HOLD",
  Q_EXPERIENCE: "EXP_MODERATE",
  Q_FINANCIAL_CAPACITY: "CAP_STABLE",
} as const;

async function setupC17(options: { withProducts?: boolean } = {}) {
  const f = await discoveryFixture({ products: options.withProducts ? 2 : 0, articles: 0 });
  const assumptions = new AssumptionsService(f.db);
  const portfolios = new PortfoliosService(f.db);
  const markets = new MarketDataService(f.db);
  const a = await assumptions.create("test-admin", read("seed-data/allocation-2026-10/draft-assumptions-v3.json"));
  const impact = await assumptions.previewImpact("test-admin", a.id, { expectedRevision: 1 });
  await assumptions.approve("test-admin", a.id, { expectedRevision: 1, impactToken: impact.impactToken, reviewNote: "C17 memory-db" });
  await assumptions.publish("test-admin", a.id, { expectedRevision: 2, confirm: true });

  const v4 = read("seed-data/allocation-2026-10/draft-policy-v4.json");
  const draft = read("data/drafts/policy-params-draft.json");
  const p = await portfolios.create("test-admin", {
    ...v4,
    assumptionVersionId: a.id,
    allocationRisk: draft.allocationRisk,
    customization: draft.customization,
  });
  await portfolios.approve("test-admin", p.id, { expectedRevision: 1, confirm: true, reviewNote: "C17 draft optimizer" });
  await portfolios.publish("test-admin", p.id, { expectedRevision: 2, confirm: true });

  const marketDoc = read("data/drafts/market-data-draft.json");
  const m = await markets.create("test-admin", marketDoc);
  await markets.approve("test-admin", m.id, { expectedRevision: 1, confirm: true, reviewNote: "C17 market" });
  await markets.publish("test-admin", m.id, { expectedRevision: 2, confirm: true, override: { reason: "C17 memory-db copy of unverified draft market data" } });
  publishedPolicies.clear();

  // C17 profile: 36yo, 1B liquid, 30M income, 15M essential expense, 25% loss limit (mirrors C01).
  await f.profiles.patchProfile("test-user", 1, fixtureProfile({
    personal: { birthMonth: known("1990-04"), desiredRetirementMonth: known("2050-05"), pensionStartMonth: { status: "NOT_APPLICABLE", reason: "C17: no pension" } } as never,
    pension: { status: "NOT_APPLICABLE", reason: "C17: no pension" } as never,
    income: { status: "KNOWN", entries: [{ id: "salary", label: "Lương", kind: "FIXED", basis: "DISPOSABLE", amount: known("30000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: "2050-04" }] } as never,
    expenses: { status: "KNOWN", entries: [{ id: "living", label: "Sinh hoạt", category: "ESSENTIAL", amount: known("15000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] } as never,
    assets: { status: "KNOWN", entries: [{ id: "liquid", label: "Tiền gửi", type: "DEPOSIT", value: known("1000000000"), currency: "VND", valuedOn: known("2026-10-04"), ownershipShare: known("1"),
      retirementShare: known("0.8"), emergencyShare: known("0.2"), otherGoalsShare: known("0"), liquidity: known("LIQUID"), availableFromMonth: known("2026-10") }] } as never,
    debts: empty() as never,
    goals: empty() as never,
    lossTolerance: { inputMode: "PERCENT", percent: known("25"), reaction: known("HOLD") },
  } as never) as never);

  const answers = Object.entries(SURVEY_MID).map(([questionId, choiceId]) => ({ questionId, choiceId }));
  const endMonth = "2075-03";
  const ws = await allocationWorkspace(f.profiles, portfolios, assumptions, "test-user", { expectedProfileRevision: 2, policyVersionId: p.id, answers, liquidityNeedMonths: 0, endMonth });
  const templateId = ws.portfolio!.assessment.selectedTemplateId!;
  const preview = {
    expectedProfileRevision: 2, policyVersionId: p.id, scenario: "BASE", answers, liquidityNeedMonths: 0, endMonth, templateId,
    monthlyExpenseToday: "15000000", monthlyContribution: "15000000", monthlyReserve: "0", retirementIncomeIds: [], allocationFunding: "PROTECTED_CAPITAL_V1",
  };
  return { f, preview, draft, marketDoc: marketDocumentSchema.parse(marketDoc) };
}

describe("B5-5 (C17) continuous optimizer with draft policy & B5-2 locked holdings", () => {
  it("C17: runs continuous optimizer (fallback=false and fallback=true), passes feasibility + loss limit, and compares against disabled", async () => {
    const { f, preview, draft, marketDoc } = await setupC17();
    const cmd = { plan: { kind: "PREVIEW", preview }, paths: 20, detail: "ALLOCATION_V2" } as never;

    const strictSvc = new AllocationRiskService(f.db, { continuous: true, fallback: false }, { maxRuntimeMs: 30_000 });
    const strictRes: any = await strictSvc.run("test-user", cmd, "selection");
    expect(strictRes.status).toBe("READY");
    expect(strictRes.optimization.feasible).toBe(true);
    expect(strictRes.optimization.method).toBe("PROJECTED_PROXIMAL_GRADIENT");
    const contStrict = strictRes.candidates.find((c: any) => c.id === "CONTINUOUS");
    expect(contStrict).toBeTruthy();
    expect(contStrict.withinLossLimit).toBe(true);
    expect(contStrict.loss.status).toBe("WITHIN_LIMIT");
    expect(typeof contStrict.pEssential).toBe("number");
    expect(contStrict.cvarEssentialShortfallToday).toBeTruthy();

    // Independent feasibility check across every simulated month.
    const solved = continuousCandidate(contStrict.targets, marketDoc, draft.allocationRisk.continuousOptimizer);
    expect(solved.input).toBeTruthy();
    for (const month of contStrict.targets) {
      const weights = solved.input!.currentWeights!.map((_, i) => Number(month[i].weightPercent) / 100);
      expect(checkPortfolioFeasibility(solved.input!, weights).feasible).toBe(true);
    }

    // With fallback=true, CONTINUOUS is simulated alongside the approved grid candidates.
    const gridPlusOptSvc = new AllocationRiskService(f.db, { continuous: true, fallback: true }, { maxRuntimeMs: 30_000 });
    const withGrid: any = await gridPlusOptSvc.run("test-user", cmd, "selection");
    expect(withGrid.status).toBe("READY");
    const idsWithOpt = withGrid.candidates.map((c: any) => c.id);
    expect(idsWithOpt).toContain("CONTINUOUS");
    expect(idsWithOpt).toContain("BASE");
    expect(idsWithOpt).toContain("LOWER_EQUITY");

    // Disabled (production default) keeps approved finite grid only and no notes.
    const disabledSvc = new AllocationRiskService(f.db, { continuous: false, fallback: false }, { maxRuntimeMs: 30_000 });
    const disabledRes: any = await disabledSvc.run("test-user", cmd, "selection");
    expect(disabledRes.optimization).toEqual({ status: "DISABLED", method: "APPROVED_FINITE_CANDIDATES" });
    expect(disabledRes.candidates.map((c: any) => c.id)).not.toContain("CONTINUOUS");
    expect(disabledRes.notes).toBeUndefined();
  }, 60_000);

  it("B5-2: passes locked holdings into continuous optimizer and records LOCKED_HOLDINGS_EXCLUDED in fixed-grid selection", async () => {
    const { f, preview } = await setupC17({ withProducts: true });
    // Register two active products (CASH locked 20%, EQUITY unlocked 80%) using real HoldingsRepository.read().
    const depDoc = {
      code: "DEP_LOCK", assetClass: "CASH", category: "TERM_DEPOSIT", nav: "1000000", annualExpenseRatioPercent: "0",
      liquidityDays: 365, lotSize: 1, minimumInvestmentVnd: "1000000", riskScore: 1, isDistributionPermitted: true, status: "ACTIVE",
      sourceKind: "TEST_FIXTURE", sourceReference: "B5-2 unit fixture", currency: "VND", priceAsOf: "2026-10-04", validUntil: "2099-10-04",
      distributionEvidence: "B5-2 synthetic deposit product",
    };
    const eqDoc = {
      code: "ETF_EQ", assetClass: "EQUITY", category: "EQUITY_ETF", nav: "1000000", annualExpenseRatioPercent: "0.82",
      liquidityDays: 2, lotSize: 100, minimumInvestmentVnd: "1000000", riskScore: 8, isDistributionPermitted: true, status: "ACTIVE",
      sourceKind: "TEST_FIXTURE", sourceReference: "B5-2 unit fixture", currency: "VND", priceAsOf: "2026-10-04", validUntil: "2099-10-04",
      distributionEvidence: "B5-2 synthetic equity ETF",
    };
    await f.db.investmentProductData.create({ data: { productId: f.products[0].id, revision: 1, document: depDoc, documentHash: digest(depDoc) } });
    await f.db.investmentProductData.create({ data: { productId: f.products[1].id, revision: 1, document: eqDoc, documentHash: digest(eqDoc) } });
    (f.db as any).investmentHolding = {
      findMany: async ({ where }: { where: { userId: string } }) => where.userId === "test-user" ? [
        { id: "h1", revision: 1, userId: "test-user", productId: f.products[0].id, quantity: new Prisma.Decimal("200"), unitCost: new Prisma.Decimal("1000000"), lockedUntil: new Date("2027-10-04T00:00:00Z") },
        { id: "h2", revision: 1, userId: "test-user", productId: f.products[1].id, quantity: new Prisma.Decimal("800"), unitCost: new Prisma.Decimal("1000000"), lockedUntil: null },
      ] : [],
    };

    const cmd = { plan: { kind: "PREVIEW", preview }, paths: 20, detail: "ALLOCATION_V2" } as never;
    const gridRes: any = await new AllocationRiskService(f.db, undefined, { maxRuntimeMs: 30_000 }).run("test-user", cmd, "selection");
    expect(gridRes.notes).toEqual(["LOCKED_HOLDINGS_EXCLUDED"]);

    const optRes: any = await new AllocationRiskService(f.db, { continuous: true, fallback: false }, { maxRuntimeMs: 30_000 }).run("test-user", cmd, "selection");
    expect(optRes.optimization.feasible).toBe(true);
    expect(optRes.notes).toBeUndefined();
    const cont = optRes.candidates.find((c: any) => c.id === "CONTINUOUS");
    expect(cont).toBeTruthy();
    const cashPct = Number(cont.targets[0].find((a: any) => a.assetClass === "CASH").weightPercent);
    expect(cashPct).toBeCloseTo(20, 4);
  }, 60_000);
});
