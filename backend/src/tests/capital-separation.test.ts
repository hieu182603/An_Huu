import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { separateCapital, capitalSeparationSchema } from "../modules/capital/separation";
import { partialProfileV2Schema, profileV2Schema, type ProfileV2 } from "../modules/profiles/schema-v2";
import { prepareRetirement } from "../modules/retirement/prepare";
import { fixtureProfile, fixtureAsset, known, unknown, empty } from "./profile-v2-fixtures";
import { assumptionFixture } from "./assumptions-fixtures";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { plansFixture } from "./plans-fixtures";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";

const D = Prisma.Decimal.clone({ precision: 48 });
const goal = (dueMonth = "2029-10", amount = "300000000") => ({ id: "tuition", label: "Học phí", amountToday: known(amount),
  dueMonth: known(dueMonth), priority: known("ESSENTIAL" as const), deferrable: { status: "KNOWN" as const, value: false } });
function assumptions(inflation = "4", deposit = "4.5") {
  const a = assumptionFixture();
  a.projectionEndYear = 2032;
  a.assetClasses = [{ code: "CASH", label: "Tiền gửi", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] }];
  a.inflation = Array.from({ length: 7 }, (_, i) => ({ ...a.inflation[0], year: 2026 + i, percent: inflation }));
  a.returns = a.inflation.map(r => ({ ...a.returns[0], year: r.year, assetClass: "CASH", rate: { type: "EFFECTIVE_ANNUAL", percent: deposit } }));
  return a;
}
function profile(): ProfileV2 {
  const p = fixtureProfile({ debts: empty(), incomeStability: known("VARIABLE"), goals: { status: "KNOWN", entries: [goal()] },
    assets: { status: "KNOWN", entries: [fixtureAsset({ value: known("2000000000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] } });
  if (p.expenses.status === "KNOWN") p.expenses.entries[0].amount = known("25000000");
  return p;
}

describe("P1 profile constraint and goal declarations", () => {
  it("round-trips legacy profiles without adding keys and keeps old calculation/replay inputs identical", () => {
    const p = retirementProfile(), config = retirementConfiguration(), command = retirementCommand();
    expect(JSON.stringify(profileV2Schema.parse(p))).toBe(JSON.stringify(p));
    const enriched = { ...p, incomeStability: known("VARIABLE" as const), goals: { status: "KNOWN" as const, entries: [goal()] },
      lossTolerance: { amountVnd: known("50000000"), percent: known("20"), reaction: known("HOLD" as const) },
      employerConcentration: known("HIGH" as const), liquidityNeeds: { y1: known("0"), y3: known("300000000"), y5: known("300000000") } };
    expect(profileV2Schema.parse(enriched)).toEqual(enriched);
    expect(prepareRetirement(enriched, command, config.policy, config.assumptions)).toEqual(prepareRetirement(p, command, config.policy, config.assumptions));
    expect(partialProfileV2Schema.parse({ schemaVersion: 2, goals: { status: "KNOWN", entries: [{ id: "new" }] } }).goals).toEqual({ status: "KNOWN", entries: [{ id: "new" }] });
  });
  it("validates amounts, percentages, dates, enums, cumulative liquidity and unique goal IDs", () => {
    const p = profile();
    for (const change of [
      { lossTolerance: { percent: known("100.01") } }, { lossTolerance: { percent: known("-1") } },
      { lossTolerance: { amountVnd: known(-1) } }, { incomeStability: known("RANDOM") },
      { lossTolerance: { reaction: known("MAYBE") } }, { employerConcentration: known("RANDOM") },
      { liquidityNeeds: { y1: known("2"), y5: known("1") } },
      { goals: { status: "KNOWN", entries: [goal(), goal()] } },
      { goals: { status: "KNOWN", entries: [goal("2026-09")] } },
      { goals: { status: "KNOWN", entries: [goal("2026-13")] } },
      { goals: { status: "KNOWN", entries: [{ ...goal(), inflation: known("-100") }] } },
      { goals: { status: "KNOWN", entries: [{ ...goal(), deferrable: known("false") }] } },
      { goals: { status: "UNKNOWN", entries: [] } }, { inflationRate: "4" },
    ]) expect(profileV2Schema.safeParse({ ...p, ...change }).success, JSON.stringify(change)).toBe(false);
    expect(profileV2Schema.safeParse({ ...p, lossTolerance: { percent: known("100"), amountVnd: known("0"), reaction: unknown },
      goals: { status: "KNOWN", entries: [{ ...goal(), amountToday: unknown, dueMonth: unknown, inflation: unknown, priority: unknown, deferrable: unknown }] } }).success).toBe(true);
  });
});

describe("P1 pure capital separation", () => {
  it("reproduces the two-billion example from supplied profile and assumption parameters", () => {
    const p = profile(), a = assumptions(), before = JSON.stringify({ p, a });
    const result = separateCapital(p, a);
    expect(result.status).toBe("READY");
    expect(result.requiredEmergencyReserve).toBe("225000000");
    expect(new D(result.goals[0].futureAmount!).div(1000000).toFixed(2)).toBe("337.46");
    expect(new D(result.nearTermGoalsPresentValue!).div(1000000).toFixed(2)).toBe("295.71");
    expect(new D(result.growthCapital!).div(1000000).toFixed(2)).toBe("1479.29");
    expect(result.emergencyShortfall).toBe("225000000");
    expect(result.investableLiquidAssets).toBe("2000000000");
    expect(result.declaredOtherGoalsCapital).toBe("0");
    expect(result.warnings).toContainEqual({ path: "assets.emergencyShare", code: "EMERGENCY_RESERVE_SHORTFALL" });
    expect(capitalSeparationSchema.safeParse(result).success).toBe(true);
    expect(JSON.stringify({ p, a })).toBe(before);
    expect(separateCapital(p, assumptions("3", "2")).nearTermGoalsPresentValue).not.toBe(result.nearTermGoalsPresentValue);
  });
  it.each(["0", "295710000"])("does not deduct declared reserve/goals twice in the two-billion golden (other goals %s VND)", otherGoals => {
    const p = profile(), a = assumptions(), baseline = separateCapital(p, a);
    const retirement = new D("2000000000").minus("225000000").minus(otherGoals).toFixed();
    p.assets = { status: "KNOWN", entries: [
      fixtureAsset({ id: "retirement", value: known(retirement), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") }),
      fixtureAsset({ id: "emergency", value: known("225000000"), retirementShare: known("0"), emergencyShare: known("1"), otherGoalsShare: known("0") }),
      fixtureAsset({ id: "goals", value: known(otherGoals), retirementShare: known("0"), emergencyShare: known("0"), otherGoalsShare: known("1") }),
    ] };
    const result = separateCapital(p, a);
    expect(result).toMatchObject({ status: "READY", investableLiquidAssets: "2000000000", declaredEmergencyReserve: "225000000",
      declaredOtherGoalsCapital: otherGoals, retirementLiquidAssets: retirement, emergencyShortfall: "0", requiredEmergencyReserve: "225000000" });
    expect(result.growthCapital).toBe(baseline.growthCapital);
    expect(result.nearTermGoalsPresentValue).toBe(baseline.nearTermGoalsPresentValue);
    expect(new D(result.growthCapital!).div(1000000).toFixed(2)).toBe("1479.29");
    expect(result.warnings.some(i => i.code === "EMERGENCY_RESERVE_SHORTFALL")).toBe(false);
    // 295.71 million is a rounded declaration, slightly below the exact PV.
    expect(result.warnings).toContainEqual({ path: "assets.otherGoalsShare", code: "OTHER_GOALS_CAPITAL_SHORTFALL" });
  });
  it.each([["0.0999", true], ["0.1", false], ["0.1001", false]] as const)("compares other-goal capital %s to PV without rounding", (share, shortfall) => {
    const p = profile(); p.goals = { status: "KNOWN", entries: [goal("2026-10", "100")] };
    p.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("1000"), otherGoalsShare: known(share),
      emergencyShare: known("0"), retirementShare: known(new D(1).minus(share).toFixed()) })] };
    const result = separateCapital(p, assumptions());
    expect(result.investableLiquidAssets).toBe("1000");
    expect(result.growthCapital).toBe("-224999100");
    expect(result.warnings.some(i => i.code === "OTHER_GOALS_CAPITAL_SHORTFALL")).toBe(shortfall);
  });
  it.each(["retirementShare", "emergencyShare", "otherGoalsShare"] as const)("requires missing %s for investable capital without inferring it", purpose => {
    const p = profile();
    p.assets = { status: "KNOWN", entries: [fixtureAsset({ [purpose]: unknown })] };
    const result = separateCapital(p, assumptions());
    expect(result).toMatchObject({ status: "INCOMPLETE", investableLiquidAssets: null, growthCapital: null });
    expect(result.issues).toContainEqual({ path: `${purpose}.assets.entries.0.retirementShare`, code: "UNKNOWN_VALUE" });
    if (purpose === "otherGoalsShare") {
      expect(result.declaredOtherGoalsCapital).toBeNull();
      expect(result.warnings.some(i => i.code === "OTHER_GOALS_CAPITAL_SHORTFALL")).toBe(false);
    }
  });
  it.each([["STABLE", 6], ["VARIABLE", 9], ["UNCERTAIN", 12]] as const)("uses %s stability and only active essential expenses", (stability, months) => {
    const p = profile(); p.incomeStability = known(stability); p.goals = empty();
    if (p.expenses.status !== "KNOWN") throw new Error("fixture");
    const e = p.expenses.entries[0];
    p.expenses.entries.push({ ...e, id: "optional", category: "OPTIONAL", amount: unknown },
      { ...e, id: "future", startMonth: "2026-11", amount: unknown }, { ...e, id: "past", endMonth: "2026-09", amount: unknown });
    expect(separateCapital(p, assumptions())).toMatchObject({ status: "READY", reserveMonths: months, essentialMonthlyExpense: "25000000", requiredEmergencyReserve: String(months * 25000000) });
  });
  it("reserves this month and exactly 60 months, excludes 61 months even after retirement, with no double count of liquidity declarations", () => {
    const p = profile(); p.personal.desiredRetirementMonth = known("2027-01");
    p.goals = { status: "KNOWN", entries: [goal("2026-10", "10"), { ...goal("2031-10", "20"), id: "five" }, { ...goal("2031-11", "30"), id: "later" }] };
    const baseline = separateCapital(p, assumptions("0", "0"));
    p.liquidityNeeds = { y1: known("10"), y3: known("10"), y5: known("30") };
    const result = separateCapital(p, assumptions("0", "0"));
    expect(result.nearTermGoalsPresentValue).toBe("30");
    expect(result.growthCapital).toBe(baseline.growthCapital);
    expect(result.goals.map(g => [g.monthsUntilDue, g.treatment])).toEqual([[0, "RESERVED"], [60, "RESERVED"], [61, "LONG_TERM"]]);
    expect(result.warnings.some(i => i.code === "LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION")).toBe(true);
  });
  it("uses the pinned year sequence over fractional years, goal inflation only for prices and net REAL returns for deposits", () => {
    const p = profile(), a = assumptions("10", "10");
    p.goals = { status: "KNOWN", entries: [{ ...goal("2027-04", "100"), inflation: known("0") }] };
    a.inflation[1].percent = "20";
    a.returns.forEach(r => { r.priceBasis = "REAL"; r.fees = { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "1", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Fixture explicit cost" }; });
    const result = separateCapital(p, a);
    // Q4: (1.1 * 1.1 - .01)^.25; Q1: (1.1 * 1.2 - .01)^.25.
    const expected = 100 / (Math.pow(1.20, .25) * Math.pow(1.31, .25));
    expect(Number(result.nearTermGoalsPresentValue)).toBeCloseTo(expected, 8);
    expect(Number(result.goals[0].futureAmount)).toBe(100);
    expect(result.goals[0].inflationSourceIds).toEqual([]);
    delete p.goals.entries[0].inflation;
    expect(Number(separateCapital(p, a).goals[0].futureAmount)).toBeCloseTo(100 * Math.pow(1.1, .25) * Math.pow(1.2, .25), 8);
  });
  it("reports missing stability, expenses, goals, amount, month, inflation, years and costs without guessing", () => {
    const p = profile(); delete p.incomeStability; delete p.goals; p.expenses = unknown;
    expect(separateCapital(p, assumptions())).toMatchObject({ status: "INCOMPLETE", growthCapital: null, requiredEmergencyReserve: null, nearTermGoalsPresentValue: null });
    const indexed = profile();
    if (indexed.expenses.status !== "KNOWN") throw new Error("fixture");
    indexed.expenses.entries.unshift({ ...indexed.expenses.entries[0], id: "optional-first", category: "OPTIONAL" });
    indexed.expenses.entries[1].amount = unknown;
    expect(separateCapital(indexed, assumptions()).issues).toContainEqual({ path: "expenses.entries.1.amount", code: "UNKNOWN_VALUE" });
    for (const change of [{ amountToday: unknown }, { dueMonth: unknown }, { inflation: unknown }]) {
      const q = profile(); q.goals = { status: "KNOWN", entries: [{ ...goal(), ...change }] };
      expect(separateCapital(q, assumptions())).toMatchObject({ status: "INCOMPLETE", growthCapital: null, nearTermGoalsPresentValue: null });
    }
    for (const kind of ["year", "cost", "horizon", "class", "cpi"] as const) {
      const a = assumptions();
      if (kind === "year") a.returns = a.returns.filter(r => r.year !== 2027);
      if (kind === "cost") a.returns[1].taxes = { treatment: "UNKNOWN" };
      if (kind === "horizon") a.assetClasses[0].horizons[0].maxMonths = 12;
      if (kind === "class") a.assetClasses = [];
      if (kind === "cpi") a.inflation = [];
      expect(separateCapital(profile(), a), kind).toMatchObject({ status: "INCOMPLETE", growthCapital: null, nearTermGoalsPresentValue: null });
    }
  });
  it("accepts explicit empty goals, preserves negative growth capital and excludes unavailable/non-owned/property money", () => {
    const p = profile(); p.goals = { status: "NOT_APPLICABLE", reason: "Không có mục tiêu khác" };
    const asset = fixtureAsset({ value: known("200000000"), ownershipShare: known("0.5"), retirementShare: known("0.2"), emergencyShare: known("0.6"), otherGoalsShare: known("0.2") });
    p.assets = { status: "KNOWN", entries: [asset, { ...asset, id: "locked", liquidity: known("LOCKED") },
      { ...asset, id: "home", type: "PRIMARY_HOME" }, { ...asset, id: "future", availableFromMonth: known("2026-11") }] };
    expect(separateCapital(p, assumptions())).toMatchObject({ status: "READY", retirementLiquidAssets: "20000000", declaredEmergencyReserve: "60000000",
      declaredOtherGoalsCapital: "20000000", investableLiquidAssets: "100000000",
      emergencyShortfall: "165000000", growthCapital: "-125000000", nearTermGoalsPresentValue: "0" });
    expect(separateCapital(p, assumptions()).warnings.some(i => i.code === "PROTECTED_CAPITAL_EXCEEDS_RETIREMENT_ASSETS")).toBe(true);
    p.assets.entries[0].emergencyShare = unknown;
    expect(separateCapital(p, assumptions())).toMatchObject({ status: "INCOMPLETE", declaredEmergencyReserve: null, emergencyShortfall: null, investableLiquidAssets: null, growthCapital: null });
    p.assets.entries[0].currency = "USD";
    expect(separateCapital(p, assumptions()).growthCapital).toBeNull();
  });
});

describe("preview-only supplement and persistence compatibility (memory database)", () => {
  it("round-trips new draft/profile fields, returns preview metadata but leaves input hashes and saved/replayed snapshots untouched", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const p = retirementProfile(); p.incomeStability = known("STABLE");
    p.goals = { status: "KNOWN", entries: [goal("2026-10", "0")] };
    p.lossTolerance = { percent: known("20"), reaction: known("HOLD"), amountVnd: known("100") };
    p.employerConcentration = known("HIGH"); p.liquidityNeeds = { y1: known("0"), y3: unknown, y5: known("100") };
    const f = await plansFixture(p), snapshot = await f.retirement.capture(f.db, f.owner, f.command.preview);
    const before = JSON.stringify(f.rows("financialProfile"));
    const evaluated = f.retirement.evaluate(snapshot, f.command.preview);
    const { capitalSeparation, ...preview } = await f.retirement.preview(f.owner, f.command.preview);
    expect(capitalSeparation.status).toBe("READY");
    // Batch A adds preview-only diagnostics; every pre-existing value stays equal.
    expect(preview).toMatchObject(evaluated);
    expect(snapshot.profile.incomeStability).toEqual(known("STABLE"));
    expect(snapshot.profile).toEqual(p);
    const contract = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, date: true } });
    const validate = ajv.compile(contract.components.schemas.ProfileEnvelope);
    const response = JSON.parse(JSON.stringify({ data: await f.profiles.getProfile(f.owner), meta: { requestId: "00000000-0000-4000-8000-000000000001" } }));
    expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
    const saved = await f.create();
    expect(JSON.stringify(f.rows("planVersion"))).not.toContain('"capitalSeparation"');
    const replay = await f.plans.version(f.owner, saved.planId, saved.saved.id, true);
    expect("replay" in replay && replay.replay.matched).toBe(true);
    expect(JSON.stringify(f.rows("financialProfile"))).toBe(before);
    const patched = await f.profiles.patchProfile(f.owner, 1, { schemaVersion: 2, incomeStability: unknown, goals: empty() });
    expect(patched.data).toMatchObject({ incomeStability: unknown, goals: empty(), lossTolerance: p.lossTolerance });
    expect((await f.profiles.getProfile(f.owner))?.data).toEqual(patched.data);
    const oldReplay = await f.plans.version(f.owner, saved.planId, saved.saved.id, true);
    expect("replay" in oldReplay && oldReplay.replay.matched).toBe(true);
  });
  it("old profiles still preview READY with incomplete supplemental data, and hypothetical assets do not change saved profiles", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const p = retirementProfile();
    p.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("1000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] };
    const f = await plansFixture(p), baseline = await f.retirement.preview(f.owner, f.command.preview);
    expect(baseline).toMatchObject({ status: "READY", capitalSeparation: { status: "INCOMPLETE", growthCapital: null } });
    expect(baseline.capitalSeparation.issues.map(i => i.code)).toEqual(expect.arrayContaining(["GOALS_REQUIRED", "INCOME_STABILITY_REQUIRED"]));
    const result = await f.retirement.preview(f.owner, { ...f.command.preview, whatIf: { assetValues: [{ assetId: "deposit-1", value: "2000" }] } });
    expect(result.capitalSeparation.retirementLiquidAssets).toBe("2000");
    expect(result.calculation?.summary.initialRetirementCapital).toBe("2000");
    const adverse = await f.retirement.preview(f.owner, { ...f.command.preview, scenario: "ADVERSE" });
    expect(adverse.capitalSeparation).toEqual(baseline.capitalSeparation);
    expect(await f.retirement.preview(f.owner, f.command.preview)).toEqual(baseline);
  });
});
