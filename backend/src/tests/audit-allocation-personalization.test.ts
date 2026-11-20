// AUDIT HARNESS (read-only w.r.t. real data): runs the real allocation services on an in-memory DB
// seeded with the same documents that are published in production on 19/11/2026:
// assumptions v3 (seed-data), policy v4 + customization (= v6), market data draft (= v5 source).
// Writes a JSON result file outside the repo. Never touches PostgreSQL. Not part of the product.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { discoveryFixture } from "./discovery-fixtures";
import { fixtureProfile, known, empty } from "./profile-v2-fixtures";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService, publishedPolicies } from "../modules/portfolios/service";
import { MarketDataService } from "../modules/allocation-risk/market-service";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { allocationWorkspace } from "../modules/portfolios/workspace";

const root = join(__dirname, "..", "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const OUT = process.env.AUDIT_OUT ?? join(root, "..", "docs/audit-2026-11-19/audit-cases-20261119.json");

const SURVEY = {
  LOW: { Q_OBJECTIVE: "OBJ_PRESERVE", Q_HORIZON: "HOR_SHORT", Q_LIQUIDITY: "LIQ_HIGH", Q_LOSS_TOLERANCE: "LOSS_SELL_ALL", Q_EXPERIENCE: "EXP_NONE", Q_FINANCIAL_CAPACITY: "CAP_TIGHT" }, // 0 -> CONSERVATIVE
  MID: { Q_OBJECTIVE: "OBJ_BALANCED", Q_HORIZON: "HOR_LONG", Q_LIQUIDITY: "LIQ_MODERATE", Q_LOSS_TOLERANCE: "LOSS_HOLD", Q_EXPERIENCE: "EXP_MODERATE", Q_FINANCIAL_CAPACITY: "CAP_STABLE" }, // 110 -> BALANCED
  HIGH: { Q_OBJECTIVE: "OBJ_GROWTH", Q_HORIZON: "HOR_VERY_LONG", Q_LIQUIDITY: "LIQ_LOW", Q_LOSS_TOLERANCE: "LOSS_BUY_MORE", Q_EXPERIENCE: "EXP_ADVANCED", Q_FINANCIAL_CAPACITY: "CAP_STRONG" }, // 180 -> AGGRESSIVE
} as const;
type Case = { id: string; title: string; birth: string; retire: string; income: string; essential: string; liquid: string; illiquid?: string;
  debt?: { balance: string; payment: string }; goals?: "UNKNOWN" | Array<{ amount: string; due: string; priority?: "ESSENTIAL" | "FLEXIBLE" | "LEGACY"; deferrable?: boolean }>; lossPercent?: string; survey: keyof typeof SURVEY; retirementExpense?: string;
  /** Monthly contribution below the capacity, an OPTIONAL expense, salary that does not stop at the declared retirement. */
  contribution?: string; optional?: string; salaryOpenEnded?: boolean };
const base: Omit<Case, "id" | "title"> = { birth: "1990-04", retire: "2050-05", income: "30000000", essential: "15000000", liquid: "1000000000", survey: "MID", lossPercent: "25", goals: [] };
export const cases: Case[] = [
  { id: "C01", title: "Chuẩn: 36 tuổi, 1 tỷ, thu 30tr, chi 15tr, khảo sát trung bình, chịu lỗ 25%", ...base },
  { id: "C02", title: "Như C01 nhưng thu nhập 60tr", ...base, income: "60000000" },
  { id: "C03", title: "Như C01 nhưng chịu lỗ 10%", ...base, lossPercent: "10" },
  { id: "C04", title: "Như C01 nhưng khảo sát rủi ro thấp", ...base, survey: "LOW" },
  { id: "C05", title: "Như C01 nhưng nghỉ hưu 2035-05 (còn ~8,5 năm)", ...base, retire: "2035-05" },
  { id: "C06", title: "Nhiều tài sản (5 tỷ) nhưng nợ 3 tỷ, trả 40tr/tháng, thu 70tr", ...base, liquid: "5000000000", income: "70000000", debt: { balance: "3000000000", payment: "40000000" } },
  { id: "C07", title: "Tài sản thấp (100tr), chi cao 25tr, thu 26tr", ...base, liquid: "100000000", income: "26000000", essential: "25000000" },
  { id: "C08", title: "Như C01 + mục tiêu gần hạn 500tr vào 2028-09", ...base, goals: [{ amount: "500000000", due: "2028-09" }] },
  { id: "C09", title: "Gần hưu (sinh 1966, hưu 2028-05), khảo sát rủi ro cao, 2 tỷ", ...base, birth: "1966-04", retire: "2028-05", liquid: "2000000000", survey: "HIGH" },
  { id: "C10", title: "BĐS khó bán 10 tỷ + chỉ 200tr thanh khoản", ...base, liquid: "200000000", illiquid: "10000000000" },
  { id: "C11", title: "Đầu vào thiếu: chưa trả lời câu khoản lớn sắp tới (giống 49/69 hồ sơ thật)", ...base, goals: "UNKNOWN" },
  { id: "C12", title: "Không khả thi: sinh 1971, hưu 2028-05, 300tr, chi hưu 40tr, thu 45tr", ...base, birth: "1971-04", retire: "2028-05", liquid: "300000000", income: "45000000", essential: "40000000", retirementExpense: "40000000" },
  { id: "C13", title: "Vốn dài hạn âm: 100tr, chi 20tr (dự phòng 6 tháng = 120tr)", ...base, liquid: "100000000", essential: "20000000", income: "25000000" },
  { id: "C14", title: "Như C01 nhưng khảo sát rủi ro cao (so với C01)", ...base, survey: "HIGH" },
  { id: "C16", title: "Mục tiêu FLEXIBLE 300tr sau 3 năm có thể lùi", ...base, birth:"1986-04",retire:"2040-05",income:"22000000",essential:"12000000",liquid:"1050000000",contribution:"9000000",goals:[{amount:"300000000",due:"2029-10",priority:"FLEXIBLE",deferrable:true}] },
  { id: "C17", title: "Bộ tối ưu liên tục trên policy nháp trong memory-db", ...base },
  { id: "C15", title: "Không khả thi nhưng có đòn bẩy: hưu 2044-05, góp 3tr/10tr khả năng, chi tùy chọn 5tr cả sau hưu, lương không dừng ở mốc hưu", ...base,
    retire: "2044-05", contribution: "3000000", optional: "5000000", salaryOpenEnded: true },
];
const addMonths = (m: string, n: number) => { const i = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n; return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`; };
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1;

async function setup(optimizer = false) {
  const f = await discoveryFixture({ products: 0, articles: 0 });
  const assumptions = new AssumptionsService(f.db), portfolios = new PortfoliosService(f.db), markets = new MarketDataService(f.db);
  const a = await assumptions.create("test-admin", read("seed-data/allocation-2026-10/draft-assumptions-v3.json"));
  const impact = await assumptions.previewImpact("test-admin", a.id, { expectedRevision: 1 });
  await assumptions.approve("test-admin", a.id, { expectedRevision: 1, impactToken: impact.impactToken, reviewNote: "Audit memory-db copy" });
  await assumptions.publish("test-admin", a.id, { expectedRevision: 2, confirm: true });
  const v4 = read("seed-data/allocation-2026-10/draft-policy-v4.json"), draft = read("data/drafts/policy-params-draft.json");
  const p = await portfolios.create("test-admin", { ...v4, assumptionVersionId: a.id, customization: draft.customization, ...(optimizer ? {allocationRisk: draft.allocationRisk} : {}) });
  await portfolios.approve("test-admin", p.id, { expectedRevision: 1, confirm: true, reviewNote: "Audit memory-db copy" });
  await portfolios.publish("test-admin", p.id, { expectedRevision: 2, confirm: true });
  const m = await markets.create("test-admin", read("data/drafts/market-data-draft.json"));
  await markets.approve("test-admin", m.id, { expectedRevision: 1, confirm: true, reviewNote: "Audit memory-db copy" });
  await markets.publish("test-admin", m.id, { expectedRevision: 2, confirm: true, override: { reason: "Audit memory-db copy of unverified draft market data" } });
  publishedPolicies.clear();
  return { f, assumptions, portfolios, policy: p };
}

function profileOf(c: Case) {
  const assets: any[] = [{ id: "liquid", label: "Tiền gửi", type: "DEPOSIT", value: known(c.liquid), currency: "VND", valuedOn: known("2026-10-04"), ownershipShare: known("1"),
    retirementShare: known("0.8"), emergencyShare: known("0.2"), otherGoalsShare: known("0"), liquidity: known("LIQUID"), availableFromMonth: known("2026-10") }];
  if (c.illiquid) assets.push({ id: "land", label: "Đất", type: "REAL_ESTATE", value: known(c.illiquid), currency: "VND", valuedOn: known("2026-10-04"), ownershipShare: known("1"),
    retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0"), liquidity: known("ILLIQUID"), availableFromMonth: known("2026-10") });
  return fixtureProfile({
    personal: { birthMonth: known(c.birth), desiredRetirementMonth: known(c.retire), pensionStartMonth: { status: "NOT_APPLICABLE", reason: "Audit: no pension" } } as never,
    pension: { status: "NOT_APPLICABLE", reason: "Audit: no pension" } as never,
    income: { status: "KNOWN", entries: [{ id: "salary", label: "Lương", kind: "FIXED", basis: "DISPOSABLE", amount: known(c.income), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: c.salaryOpenEnded ? null : addMonths(c.retire, -1) }] } as never,
    expenses: { status: "KNOWN", entries: [{ id: "living", label: "Sinh hoạt", category: "ESSENTIAL", amount: known(c.essential), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null },
      ...(c.optional ? [{ id: "leisure", label: "Du lịch, giải trí", category: "OPTIONAL", amount: known(c.optional), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] : [])] } as never,
    assets: { status: "KNOWN", entries: assets } as never,
    debts: (c.debt ? { status: "KNOWN", entries: [{ id: "loan", label: "Vay", outstandingBalance: known(c.debt.balance), balanceAsOf: known("2026-10-04"), currency: "VND", payment: known(c.debt.payment),
      paymentShare: known("1"), balanceShare: known("1"), responsibility: { status: "UNKNOWN" }, frequency: "MONTHLY", startMonth: "2026-01", endMonth: "2035-12" }] } : empty()) as never,
    goals: (c.goals === "UNKNOWN" ? { status: "UNKNOWN" } : { status: "KNOWN", entries: (c.goals ?? []).map((g, i) => ({ id: `g${i}`, label: "Mục tiêu", amountToday: known(g.amount),
      dueMonth: known(g.due), priority: known(g.priority ?? "ESSENTIAL"), deferrable: { status: "KNOWN", value: g.deferrable ?? false } })) }) as never,
    ...(c.lossPercent ? { lossTolerance: { inputMode: "PERCENT", percent: known(c.lossPercent), reaction: known("HOLD") } } : {}),
  } as never);
}

export async function runCase(c: Case, pathsOverride?: number) {
  const rec: Record<string, unknown> = { id: c.id, title: c.title, input: c };
  const optimizer = c.id === "C17" || process.env.AUDIT_OPTIMIZER === "1";
  const { f, assumptions, portfolios, policy } = await setup(optimizer);
  try { await f.profiles.patchProfile("test-user", 1, profileOf(c) as never); }
  catch (e) { rec.state = "ERROR_PROFILE_SAVE"; rec.error = (e as Error).message; return rec; }
  const answers = Object.entries(SURVEY[c.survey]).map(([questionId, choiceId]) => ({ questionId, choiceId }));
  const endMonth = addMonths(c.birth, 85 * 12 - 1);
  const ws = await allocationWorkspace(f.profiles, portfolios, assumptions, "test-user", { expectedProfileRevision: 2, policyVersionId: policy.id, answers, liquidityNeedMonths: 0, endMonth });
  const a = ws.portfolio?.assessment;
  rec.capital = { status: ws.capital.status, issues: ws.capital.issues?.map(i => i.code), investable: ws.capital.investableLiquidAssets, reserve: ws.capital.requiredEmergencyReserve,
    nearTermGoals: ws.capital.nearTermGoalsPresentValue, growth: ws.capital.growthCapital };
  rec.portfolio = { status: ws.portfolio?.status, issues: ws.portfolio?.issues?.map(i => i.code), totalScore: a?.totalScore, band: a?.riskBandId, template: a?.selectedTemplateId };
  rec.weights = ws.allocations.map(r => `${r.assetClass}:${Number(r.weightPercent).toFixed(2)}`).join(" ");
  rec.loss = { status: ws.loss.status, issues: ws.loss.issues, lossAmount: ws.loss.lossAmount, allowed: ws.loss.allowedLossAmount, maxEquity: ws.loss.maxEquityWeightPercent };
  const templateId = a?.selectedTemplateId;
  if (!templateId) { rec.state = "BLOCKED_NO_TEMPLATE"; return rec; }
  const contribution = c.contribution ? Number(c.contribution) : Math.max(0, Number(c.income) - Number(c.essential) - Number(c.optional ?? 0) - Number(c.debt?.payment ?? 0));
  const preview = { expectedProfileRevision: 2, policyVersionId: policy.id, scenario: "BASE", answers, liquidityNeedMonths: 0, endMonth, templateId,
    monthlyExpenseToday: c.retirementExpense ?? c.essential, monthlyContribution: String(contribution), monthlyReserve: "0", retirementIncomeIds: [], ...(c.optional ? { retirementAdditionalExpenseIds: ["leisure"] } : {}), allocationFunding: "PROTECTED_CAPITAL_V1" };
  // Same as AllocationExperiment.run (frontend, C1): 20 paths by default; while the server saves partial
  // progress at its 10 s limit, repeat the request with continuation:true (cached paths are reused).
  const months = Math.max(1, monthsBetween(ws.valuationDate.slice(0, 7), endMonth));
  const firstPaths = pathsOverride ?? (process.env.AUDIT_PATHS ? Number(process.env.AUDIT_PATHS) : undefined) ?? 20;
  const service = new AllocationRiskService(f.db, {continuous: optimizer, fallback: optimizer});
  const t0 = performance.now();
  let res: any, paths = firstPaths, retried = false, continuations = 0;
  try {
    res = await service.run("test-user", { plan: { kind: "PREVIEW", preview }, paths, detail: "ALLOCATION_V2" } as never, "selection");
    while (res.status === "LIMIT_EXCEEDED" && res.issues?.includes("RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED") && continuations < 50) {
      retried = true; continuations++;
      res = await service.run("test-user", { plan: { kind: "PREVIEW", preview }, paths, detail: "ALLOCATION_V2", continuation: true } as never, "selection");
    }
  } catch (e) { rec.state = "ERROR_SELECTION_THROW"; rec.error = `${(e as any).status ?? ""} ${(e as any).code ?? ""} ${(e as Error).message}`.trim(); return rec; }
  const ms = Math.round(performance.now() - t0);
  rec.selection = { status: res.status, issues: res.issues, months, firstPaths, paths, retried, continuations, ms, referenceId: res.referenceId ?? res.deterministic?.referenceId ?? null,
    referenceKind: res.referenceKind ?? res.deterministic?.referenceKind ?? null, threshold: res.threshold,
    candidates: (res.candidates ?? []).map((x: any) => ({ id: x.id, pEssential: x.pEssential, pAll: x.pAll, cvar: x.cvarEssentialShortfallToday ? Math.round(Number(x.cvarEssentialShortfallToday)) : null,
      changePoints: x.changePoints, w0: x.targets?.[0]?.map((r: any) => `${r.assetClass}:${Number(r.weightPercent).toFixed(2)}`).join(" "), applicable: x.applicable })),
    rejected: res.rejected, adjustmentKinds: res.adjustmentKinds ?? null, shortfallAmount: res.shortfallAmount ?? null, adjustmentsOmitted: res.adjustmentsOmitted ?? null };
  const picked = (res.candidates ?? []).find((x: any) => x.id === res.referenceId);
  // Classification mirrors what AllocationResults/AllocationExperiment render (see audit report).
  rec.state = res.status === "READY" && picked ? "SUCCESS" : res.status === "INSUFFICIENT" && picked ? "INFEASIBLE_WITH_REFERENCE"
    : res.status === "INSUFFICIENT" ? "INFEASIBLE_NO_REFERENCE" : res.status === "REVIEW_REQUIRED" ? "BLOCKED_REVIEW_REQUIRED" : res.status === "LIMIT_EXCEEDED" ? "ERROR_LIMIT" : `OTHER_${res.status}`;
  rec.tablesShown = { candidatesTable: !!picked, referenceCard: !!picked };
  Object.defineProperty(rec, "raw", { value: res, enumerable: false });
  // Spec §7.4 step 4: an infeasible plan gets its behavioural adjustments from a separate run, on the
  // reference allocation when it is replayable (as the frontend does).
  if (res.status === "INSUFFICIENT" && picked && !process.env.AUDIT_SKIP_ADJUSTMENTS) {
    const chosen = picked.selection ?? { templateId };
    const t1 = performance.now();
    const adj: any = await service.run("test-user", { plan: { kind: "PREVIEW", preview: { ...preview, templateId: chosen.templateId,
      ...(chosen.customAllocation ? { customAllocation: chosen.customAllocation } : {}) } }, paths, detail: "ALLOCATION_V2" } as never, "adjustments");
    rec.adjustments = { status: adj.status, issues: adj.issues, ms: Math.round(performance.now() - t1), baseline: adj.baselinePEssential, evaluations: adj.evaluations,
      optional: adj.optionalSpending && { status: adj.optionalSpending.status, cut: adj.optionalSpending.cutPercent, issues: adj.optionalSpending.issues },
      contribution: adj.contribution && { status: adj.contribution.status, required: adj.contribution.requiredMonthlyContribution, extra: adj.contribution.additionalMonthlyContribution, p: adj.contribution.pEssential, issues: adj.contribution.issues },
      deferFlexibleGoals: adj.deferFlexibleGoals,
      retirement: adj.retirement && { status: adj.retirement.status, month: adj.retirement.retirementMonth, delay: adj.retirement.delayMonths, p: adj.retirement.pEssential, issues: adj.retirement.issues } };
  }
  // AUDIT_RAW=1: keep the full responses (selection, plus a Monte Carlo run and the deterministic
  // scenarios) so two code versions can be compared digit for digit.
  if (process.env.AUDIT_RAW && templateId) {
    const plan = { kind: "PREVIEW", preview };
    rec.rawSelection = res;
    rec.rawSimulation = await service.run("test-user", { plan, paths, detail: "ALLOCATION_V2" } as never, "simulation");
    rec.rawScenarios = await service.run("test-user", { plan, paths } as never, "scenarios");
  }
  return rec;
}

// Expected outcome of every audit case after the P0 fixes (docs/plan-sua-loi-phan-bo-2026-11-19.md).
// SUCCESS = recommendation; INFEASIBLE_* = calculated but no allocation meets the goal/limits;
// BLOCKED_REVIEW_REQUIRED = missing input; ERROR_* = technical failure (never expected here).
const BASE_WEIGHTS = "CASH:10.00 GOV_BOND:20.00 EQUITY:60.00 GOLD:10.00";
const EXPECTED: Record<string, { state: string; check?: (r: any) => void }> = {
  C01: { state: "SUCCESS", check: r => {
    // B3 (spec 7.4 step 3, owner 19/11/2026): BASE and LOWER_EQUITY both reach the threshold with CVaR 0;
    // the tie goes to the smaller change from what the customer holds now (100% deposits) -> LOWER_EQUITY.
    expect(r.raw.turnoverBasis).toBe("CURRENT_HOLDINGS");
    expect(r.selection.referenceId).toBe("LOWER_EQUITY");
    // A4: 60% + 10 points of equity is above the approved 60% equity bound, so it is not simulated.
    expect(r.selection.rejected).toContainEqual({ id: "HIGHER_EQUITY", issues: ["WEIGHT_BOUND_EXCEEDED"] });
  } },
  C02: { state: "SUCCESS", check: r => expect(r.weights).toBe(BASE_WEIGHTS) },
  C03: { state: "SUCCESS", check: r => {
    expect(r.selection.referenceId).toBe("LOSS_REDUCED");
    const pick = r.raw.candidates.find((x: any) => x.id === "LOSS_REDUCED");
    expect(pick.applicable).toBe(true);
    expect(pick.selection?.customAllocation).toBeTruthy();
    // No risk check is skipped: the stress loss of every simulated month is within the limit.
    expect(pick.loss.status).toBe("WITHIN_LIMIT");
  } },
  C04: { state: "SUCCESS", check: r => expect(r.portfolio.template).toBe("TPL_CAUTIOUS_GLIDE") },
  C05: { state: "INFEASIBLE_WITH_REFERENCE", check: r => {
    expect(r.selection.adjustmentsOmitted).toBe(true);
    // A1: the separate adjustment run answers; these profiles already contribute their whole surplus,
    // declare no optional spending and a salary that stops at retirement, so no lever reaches the threshold.
    expect(r.adjustments.status).toBe("NOT_FEASIBLE");
    expect(r.adjustments.contribution.issues).toEqual(["CONTRIBUTION_CAPACITY_REACHED"]);
    expect(r.adjustments.optional.issues).toEqual(["NO_OPTIONAL_SPENDING_DECLARED"]);
  } },
  C06: { state: "SUCCESS" },
  C07: { state: "INFEASIBLE_NO_REFERENCE", check: r => {
    expect(r.selection.issues).toEqual(["PROTECTED_CAPITAL_EXCEEDS_ASSETS"]);
    expect(r.selection.shortfallAmount).toBe("50000000");
  } },
  C08: { state: "SUCCESS", check: r => expect(Number(r.capital.nearTermGoals)).toBeGreaterThan(0) },
  C09: { state: "INFEASIBLE_WITH_REFERENCE", check: r => {
    expect(r.selection.adjustmentsOmitted).toBe(true);
    // A1: the separate adjustment run answers; these profiles already contribute their whole surplus,
    // declare no optional spending and a salary that stops at retirement, so no lever reaches the threshold.
    expect(r.adjustments.status).toBe("NOT_FEASIBLE");
    expect(r.adjustments.contribution.issues).toEqual(["CONTRIBUTION_CAPACITY_REACHED"]);
    expect(r.adjustments.optional.issues).toEqual(["NO_OPTIONAL_SPENDING_DECLARED"]);
  } },
  C10: { state: "SUCCESS", check: r => expect(r.capital.investable).toBe("200000000") },
  C11: { state: "BLOCKED_REVIEW_REQUIRED", check: r => expect(r.selection.issues).toContain("GOALS_REQUIRED") },
  C12: { state: "INFEASIBLE_WITH_REFERENCE", check: r => {
    expect(r.selection.adjustmentsOmitted).toBe(true);
    // A1: the separate adjustment run answers; these profiles already contribute their whole surplus,
    // declare no optional spending and a salary that stops at retirement, so no lever reaches the threshold.
    expect(r.adjustments.status).toBe("NOT_FEASIBLE");
    expect(r.adjustments.contribution.issues).toEqual(["CONTRIBUTION_CAPACITY_REACHED"]);
    expect(r.adjustments.optional.issues).toEqual(["NO_OPTIONAL_SPENDING_DECLARED"]);
  } },
  C13: { state: "INFEASIBLE_NO_REFERENCE", check: r => {
    expect(r.selection.issues).toEqual(["PROTECTED_CAPITAL_EXCEEDS_ASSETS"]);
    expect(r.selection.shortfallAmount).toBe("20000000");
  } },
  C14: { state: "SUCCESS", check: r => expect(r.weights).toBe(BASE_WEIGHTS) },
  C16: { state:"INFEASIBLE_WITH_REFERENCE", check:r=>{if(!process.env.AUDIT_SKIP_ADJUSTMENTS){expect(r.adjustments.deferFlexibleGoals.status).toBe("FOUND");expect(r.adjustments.deferFlexibleGoals.pEssential).toBeGreaterThanOrEqual(.9);}} },
  C17: { state:"SUCCESS",check:r=>{expect(r.raw.optimization.feasible).toBe(true);expect(r.raw.candidates.some((c:any)=>c.id==="CONTINUOUS"&&c.loss.status==="WITHIN_LIMIT")).toBe(true);} },
  C15: { state: "INFEASIBLE_WITH_REFERENCE", check: r => {
    // A1: simulated adjustments that reach p_essential >= 90% on the same paths.
    expect(r.adjustments.status).toBe("READY");
    expect(r.adjustments.contribution.status).toBe("FOUND");
    expect(Number(r.adjustments.contribution.required)).toBeGreaterThan(3000000);
    expect(r.adjustments.contribution.p).toBeGreaterThanOrEqual(0.9);
    expect(r.adjustments.retirement.status).toBe("FOUND");
    expect(r.adjustments.retirement.p).toBeGreaterThanOrEqual(0.9);
    // A2: only the optional expense is cut; here even removing all of it is not enough.
    expect(r.adjustments.optional.status).toBe("NOT_FEASIBLE");
  } },
};
function assertCase(r: any, maxMs?: number) {
  if(process.env.AUDIT_OPTIMIZER === "1"){
    expect(r.state.startsWith("ERROR"),r.id+JSON.stringify(r.selection?.issues)).toBe(false);
    for(const c of r.raw?.candidates??[])expect(c.loss?.status).toBe("WITHIN_LIMIT");
    return;
  }
  const e = EXPECTED[r.id];
  expect(r.state, `${r.id}: ${JSON.stringify(r.selection?.issues ?? r.error)}`).toBe(e.state);
  e.check?.(r);
  // The browser now waits 45 s; every case must answer well within it on a local machine.
  if (maxMs && r.selection) expect(r.selection.ms, r.id).toBeLessThan(maxMs);
}

async function overlapping() {
  const { f, assumptions, portfolios, policy } = await setup();
  const c = cases[0];
  await f.profiles.patchProfile("test-user", 1, profileOf(c) as never);
  const answers = Object.entries(SURVEY[c.survey]).map(([questionId, choiceId]) => ({ questionId, choiceId }));
  const endMonth = addMonths(c.birth, 85 * 12 - 1);
  const ws = await allocationWorkspace(f.profiles, portfolios, assumptions, "test-user", { expectedProfileRevision: 2, policyVersionId: policy.id, answers, liquidityNeedMonths: 0, endMonth });
  const preview = { expectedProfileRevision: 2, policyVersionId: policy.id, scenario: "BASE", answers, liquidityNeedMonths: 0, endMonth,
    templateId: ws.portfolio!.assessment.selectedTemplateId, monthlyExpenseToday: c.essential, monthlyContribution: "15000000",
    monthlyReserve: "0", retirementIncomeIds: [], allocationFunding: "PROTECTED_CAPITAL_V1" };
  return { service: new AllocationRiskService(f.db), cmd: { plan: { kind: "PREVIEW", preview }, paths: 12, detail: "ALLOCATION_V2" } as never };
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("P0 regression (fast, production documents)", () => {
  for (const id of ["C03", "C07", "C11", "C12"]) {
    it(id + " reaches its expected state", async () => {
      const r: any = await runCase(cases.find(c => c.id === id)!, 4);
      assertCase(r, 20_000);
    }, 120_000);
  }
  it("a newer run of the same kind supersedes the older one and frees its slot", async () => {
    const { service, cmd } = await overlapping();
    const first = service.run("test-user", cmd, "selection");
    await pause(300);
    const second: any = await service.run("test-user", cmd, "selection");
    const firstDone: any = await first;
    expect(firstDone).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["SIMULATION_ABORTED"] });
    expect(["READY", "INSUFFICIENT"]).toContain(second.status);
    expect(AllocationRiskService.activeRunCount()).toBe(0);
  }, 120_000);
  it("a different kind while a run is active is refused, not cancelled (one run per account)", async () => {
    const { service, cmd } = await overlapping();
    const first = service.run("test-user", cmd, "selection");
    await pause(300);
    const second: any = await service.run("test-user", cmd, "scenarios");
    expect(second).toEqual({ status: "LIMIT_EXCEEDED", issues: ["CONCURRENT_RUN_LIMIT", "ACCOUNT_RUN_IN_PROGRESS"] });
    expect(["READY", "INSUFFICIENT"]).toContain(((await first) as any).status);
    expect(AllocationRiskService.activeRunCount()).toBe(0);
  }, 120_000);
  it("an aborted request stops the run and releases the slot", async () => {
    const { service, cmd } = await overlapping();
    const controller = new AbortController();
    const run = service.run("test-user", cmd, "selection", controller.signal);
    await pause(300);
    controller.abort();
    expect(await run).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["SIMULATION_ABORTED"] });
    expect(AllocationRiskService.activeRunCount()).toBe(0);
  }, 120_000);
});

describe("AUDIT allocation personalization (memory-db, production documents)", () => {
  it("runs all 17 cases through workspace + selection and checks every expected state", async () => {
    // Opt-in only (slow; rewrites docs/audit-2026-11-19/audit-cases-20261119.json): AUDIT_RUN=1 npx vitest run <this file>
    if (!process.env.AUDIT_RUN) return;
    const results = [];
    for (const c of cases.filter(x => !process.env.AUDIT_ONLY || process.env.AUDIT_ONLY.split(",").includes(x.id))) {
      try { results.push(await runCase(c)); } catch (e) { results.push({ id: c.id, title: c.title, state: "ERROR_HARNESS", error: (e as Error).stack?.slice(0, 600) }); }
    }
    writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 1));
    for (const r of results) assertCase(r, process.env.AUDIT_PATHS ? undefined : 20_000);
  }, 1_800_000);
});
