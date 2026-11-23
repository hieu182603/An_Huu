import { describe, expect, it } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { applyAdvisoryFee, daysInMonth } from "../modules/retirement/advisory-fee";
import { prepareRetirement } from "../modules/retirement/prepare";
import { RETIREMENT_MODEL_V3, RETIREMENT_MODEL_V5, retirementPreviewSchema } from "../modules/retirement/schema";
import { runPath, type PathMarket, type RiskContext } from "../modules/allocation-risk/simulation";
import { fixtureAsset, known } from "./profile-v2-fixtures";
import { portfolioCommand } from "./portfolio-fixtures";
import { retirementConfiguration, retirementProfile } from "./retirement-fixtures";
import { riskContext } from "./allocation-risk-fixtures";

const close = (a: string, b: string) => expect(new D(a).minus(b).abs().lt("1e-25")).toBe(true);

function v5PlanWithFee(paidFrom: "FUND" | "EXTERNAL") {
  const profile = retirementProfile();
  profile.assets = {
    status: "KNOWN",
    entries: [fixtureAsset({ value: known("10000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })],
  };
  const { policy, assumptions } = retirementConfiguration();
  assumptions.inflation = assumptions.inflation.map(r => ({ ...r, percent: "3" }));
  assumptions.retirementPlanningAnnualPercent = "3";
  assumptions.returns = assumptions.returns.map(r => ({
    ...r,
    rate: { type: "EFFECTIVE_ANNUAL" as const, percent: r.assetClass === "STOCK" ? "18" : "6" },
  }));
  policy.templates = policy.templates.map(t => ({ ...t, rebalance: { ...t.rebalance, turnoverCostPercent: "1" } }));
  const portfolio = portfolioCommand(undefined, true);
  const command = retirementPreviewSchema.parse({
    expectedProfileRevision: 1,
    policyVersionId: portfolio.policyVersionId,
    scenario: "BASE",
    answers: portfolio.answers,
    liquidityNeedMonths: 12,
    endMonth: "2027-06",
    monthlyExpenseToday: "500",
    monthlyContribution: "100",
    monthlyReserve: "0",
    retirementIncomeIds: [],
    advisoryFee: { annualPercent: "2.4", paidFrom },
  });
  const prepared = prepareRetirement(profile, command, policy, assumptions, undefined, RETIREMENT_MODEL_V5);
  expect(prepared.status).toBe("READY");
  const replay = prepared.replayInput!, calc = prepared.calculation!;
  const rows = replay.rows.map(r => {
    const feeRow = r as typeof r & { advisoryFeeAmount?: string; advisoryFeePaidFrom?: string };
    return {
      ...r,
      additionalExpense: feeRow.advisoryFeePaidFrom === "EXTERNAL" && feeRow.advisoryFeeAmount
        ? new D(r.additionalExpense).minus(feeRow.advisoryFeeAmount).toFixed()
        : r.additionalExpense,
    };
  });
  const template = policy.templates.find(t => t.id === calc.assessment.selectedTemplateId)!;
  const targets = rows.map((_, i) => template.schedule.find(s => s.fromIndex <= i + 1 && s.toIndex >= i + 1)!.allocations);
  const context: RiskContext = {
    projection: { ...replay, rows, modelVersion: RETIREMENT_MODEL_V5 },
    selection: command,
    essentialExpenses: rows.map(r => r.livingExpense),
    targets,
    rebalance: calc.marketRows.map(r => r.rebalanced),
    turnoverCostPercent: template.rebalance.turnoverCostPercent,
    rebalanceBandPoints: null,
  };
  const market: PathMarket[] = calc.marketRows.map(r => ({
    cpi: new D(r.inflationMonthlyFactor).minus(1).toFixed(),
    returns: Object.fromEntries(r.holdings.map(h => [h.assetClass, new D(h.annualNetNominalReturnPercent).div(1200).toFixed()])),
  }));
  return { prepared, context, market };
}

function v3ContextWithFee(paidFrom: "FUND" | "EXTERNAL") {
  const context = riskContext(6);
  context.projection.initialCapital = "10000";
  context.projection.retirementMonth = "2026-04";
  context.projection.rows = context.projection.rows.map((r, i) =>
    i < 3 ? { ...r, income: "200", plannedContribution: "50", contribution: "50", contributionCapacity: "100", uninvestedSurplus: "50", withdrawal: "0" } : r
  );
  context.selection = { ...context.selection, advisoryFee: { annualPercent: "2.4", paidFrom } };
  const market: PathMarket[] = context.projection.rows.map(() => ({ cpi: "0.002", returns: { CASH: "0.005", EQUITY: "0.02" } }));
  return { context, market };
}

describe("A1: advisory fee in simulation follows v5/v3 model convention", () => {
  it.each(["FUND", "EXTERNAL"] as const)("v5 runPath with %s advisoryFee matches prepareRetirement (v5) fundedClosingBalance every month", paidFrom => {
    const { prepared, context, market } = v5PlanWithFee(paidFrom);
    const result = runPath(context, market);
    const calc = prepared.calculation!;
    let price = new D(1);
    calc.rows.forEach((row, i) => {
      close(result.balances[i], new D(row.fundedClosingBalance).div(price).toFixed());
      price = price.mul(calc.marketRows[i].inflationMonthlyFactor);
    });
    close(result.fundedTerminalBalance, calc.summary.fundedTerminalBalance);
    expect(result.unfundedWithdrawals).toBe(calc.summary.unfundedWithdrawals);
  });

  it("v3 context with advisoryFee (FUND and EXTERNAL) keeps exact pre-fix values", () => {
    const fundCase = v3ContextWithFee("FUND"), extCase = v3ContextWithFee("EXTERNAL");
    const fund = runPath(fundCase.context, fundCase.market);
    const ext = runPath(extCase.context, extCase.market);
    expect(fund).toEqual({
      essentialLossToday: "0",
      firstShortfallMonth: null,
      funded: true,
      balances: [
        "10154.825",
        "10291.2548103542914171656686626746506986027944113",
        "10429.3182746379446873720148392838257882529321543",
        "10419.4931911150133394529671694990755858235686453",
        "10410.1599990461838324675271875666645476577879111",
        "10401.3216606993436649271089420043019060418658968",
      ],
      unfundedWithdrawals: "0",
      fundedTerminalBalance: "10505.7517631109365064195601821421868403691670039",
    });
    expect(ext).toEqual({
      essentialLossToday: "0",
      firstShortfallMonth: null,
      funded: true,
      balances: [
        "10175",
        "10332.0886005766245287203371035706365047682412952",
        "10491.3052440535502847585866322923033730279634654",
        "10482.0155235280600245444608301583765522419283517",
        "10473.2257790115442633716446847401486321941326519",
        "10464.9391012268495825808130694909506082790207858",
      ],
      unfundedWithdrawals: "0",
      fundedTerminalBalance: "10570.0079278358252566872782649667929432396905759",
    });
  });
});

describe("B7-5: v5 advisory fee uses actual calendar days / 365 (spec §8.1)", () => {
  it("computes calendar days per month including leap years", () => {
    expect(daysInMonth("2027-01")).toBe(31);
    expect(daysInMonth("2027-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2027-04")).toBe(30);
  });

  it("hand-verified 31-day vs 28-day vs leap 29-day fees on v5, while v3 stays annualPercent/12", () => {
    const row = (month: string) => ({
      month, growthFactor: "1", inflationFactor: "1", income: "100000", pension: "0", livingExpense: "0",
      additionalExpense: "0", debtPayment: "0", plannedContribution: "0", contribution: "0",
      contributionCapacity: "100000", withdrawal: "0", uninvestedSurplus: "100000", capitalInjection: "0",
    });
    const baseInput = { ...riskContext(1).selection, advisoryFee: { annualPercent: "10", paidFrom: "EXTERNAL" as const } };
    const rows = [row("2027-01"), row("2027-02"), row("2028-02")];

    // v5 EXTERNAL: A_bq = 3,650,000 every month -> fee = 3,650,000 * 10% * days / 365 = 1,000 * days.
    const v5Ext = applyAdvisoryFee(rows, "3650000", "2027-01", baseInput, true);
    expect(v5Ext.map(r => r.advisoryFeeAmount)).toEqual(["31000", "28000", "29000"]);

    // v5 FUND: Jan fee = 31,000 -> Feb opening = 3,619,000 -> Feb (28d) fee = 3,619,000 * 10% * 28 / 365.
    const v5Fund = applyAdvisoryFee([row("2027-01"), row("2027-02")], "3650000", "2027-01",
      { ...baseInput, advisoryFee: { annualPercent: "10", paidFrom: "FUND" } }, true);
    expect(v5Fund[0].advisoryFeeAmount).toBe("31000");
    expect(v5Fund[1].advisoryFeeAmount).toBe(new D("3619000").mul("10").div(100).mul(28).div(365).toFixed());

    // v3 keeps annualPercent / 12 regardless of month length.
    const v3Ext = applyAdvisoryFee(rows, "3650000", "2027-01", baseInput, false);
    const flatMonth = new D("3650000").mul(new D("10").div(100).div(12)).toFixed();
    expect(v3Ext.map(r => r.advisoryFeeAmount)).toEqual([flatMonth, flatMonth, flatMonth]);
  });

  it("reports conventions.advisoryFeeBasis and matches prepareRetirement vs runPath across Jan (31d) and Feb (28d)", () => {
    const profile = retirementProfile();
    profile.assets = {
      status: "KNOWN",
      entries: [fixtureAsset({ value: known("3650000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })],
    };
    const { policy, assumptions } = retirementConfiguration();
    const portfolio = portfolioCommand(undefined, true);
    const command = retirementPreviewSchema.parse({
      expectedProfileRevision: 1,
      policyVersionId: portfolio.policyVersionId,
      scenario: "BASE",
      answers: portfolio.answers,
      liquidityNeedMonths: 12,
      endMonth: "2027-03",
      monthlyExpenseToday: "0",
      monthlyContribution: "0",
      monthlyReserve: "0",
      retirementIncomeIds: [],
      advisoryFee: { annualPercent: "10", paidFrom: "FUND" },
    });
    const p5 = prepareRetirement(profile, command, policy, assumptions, undefined, RETIREMENT_MODEL_V5);
    const p3 = prepareRetirement(profile, command, policy, assumptions, undefined, RETIREMENT_MODEL_V3);
    expect(p5.status).toBe("READY");
    expect(p3.status).toBe("READY");
    expect(p5.calculation!.conventions.advisoryFeeBasis).toBe("ACTUAL_DAYS_365");
    expect(p3.calculation!.conventions.advisoryFeeBasis).toBe("FULL_MONTH_NO_DAILY_PRORATION");

    // 2027-01 (index 3, 31d) vs 2027-02 (index 4, 28d): verify exact ratio and runPath parity.
    const janRow = p5.replayInput!.rows[3] as { month: string; advisoryFeeAmount?: string; advisoryFeeAverageFund?: string };
    const febRow = p5.replayInput!.rows[4] as { month: string; advisoryFeeAmount?: string; advisoryFeeAverageFund?: string };
    expect(janRow.month).toBe("2027-01");
    expect(febRow.month).toBe("2027-02");
    expect(janRow.advisoryFeeAmount).toBe(new D(janRow.advisoryFeeAverageFund!).mul("10").div(100).mul(31).div(365).toFixed());
    expect(febRow.advisoryFeeAmount).toBe(new D(febRow.advisoryFeeAverageFund!).mul("10").div(100).mul(28).div(365).toFixed());

    const calc = p5.calculation!;
    const template = policy.templates.find(t => t.id === calc.assessment.selectedTemplateId)!;
    const context: RiskContext = {
      projection: { ...p5.replayInput!, modelVersion: RETIREMENT_MODEL_V5 },
      selection: command,
      essentialExpenses: p5.replayInput!.rows.map(r => r.livingExpense),
      targets: p5.replayInput!.rows.map((_, i) => template.schedule.find(s => s.fromIndex <= i + 1 && s.toIndex >= i + 1)!.allocations),
      rebalance: calc.marketRows.map(r => r.rebalanced),
      turnoverCostPercent: template.rebalance.turnoverCostPercent,
      rebalanceBandPoints: null,
    };
    const market: PathMarket[] = calc.marketRows.map(r => ({
      cpi: new D(r.inflationMonthlyFactor).minus(1).toFixed(),
      returns: Object.fromEntries(r.holdings.map(h => [h.assetClass, new D(h.annualNetNominalReturnPercent).div(1200).toFixed()])),
    }));
    const sim = runPath(context, market);
    calc.rows.forEach((r, i) => expect(sim.balances[i]).toBe(r.fundedClosingBalance));
    expect(sim.fundedTerminalBalance).toBe(calc.summary.fundedTerminalBalance);
  });
});
