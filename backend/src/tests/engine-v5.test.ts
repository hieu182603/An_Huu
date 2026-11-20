import { describe, expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { RetirementDecimal as D, projectRetirement, type MonthlyInput, type ProjectionInput } from "../modules/retirement/engine";
import { projectRetirementV3 } from "../modules/retirement/engine-v3";
import { projectRetirementV5 } from "../modules/retirement/engine-v5";
import { replayProjection } from "../modules/retirement/replay";
import { RETIREMENT_MODEL, RETIREMENT_MODEL_V3, RETIREMENT_MODEL_V5 } from "../modules/retirement/schema";

type Over = Partial<MonthlyInput> | ((i: number) => Partial<MonthlyInput>);
/** n accumulation months followed by `retired` months; every row carries the same defaults unless overridden. */
function build(model: "retirement-monthly-v3" | "retirement-monthly-v5", opts: {
  acc?: number; retired?: number; initial?: string; terminal?: string; growth?: string; withdrawal?: string | ((i: number) => string);
  contribution?: string | ((i: number) => string); timing?: "END_OF_MONTH" | "START_OF_MONTH"; row?: Over; start?: string;
}): ProjectionInput {
  const acc = opts.acc ?? 0, retired = opts.retired ?? 1;
  const pick = <T,>(v: T | ((i: number) => T) | undefined, i: number, d: T) => v === undefined ? d : typeof v === "function" ? (v as (i: number) => T)(i) : v;
  return { valuationDate: "2026-01-01", retirementMonth: addMonths("2026-01", acc), initialCapital: opts.initial ?? "0", terminalBalance: opts.terminal ?? "0",
    monthlyContribution: "0", contributionTiming: opts.timing ?? "END_OF_MONTH", modelVersion: model, contributionStartMonth: opts.start,
    rows: Array.from({ length: acc + retired }, (_, i): MonthlyInput => {
      const contribution = pick(opts.contribution, i, "0");
      return { month: addMonths("2026-01", i), growthFactor: opts.growth ?? "1", inflationFactor: "1", income: "0", pension: "0",
        livingExpense: "0", additionalExpense: "0", debtPayment: "0", plannedContribution: contribution, contribution,
        contributionCapacity: contribution, withdrawal: pick(opts.withdrawal, i, "0"), uninvestedSurplus: "0", capitalInjection: "0",
        ...(typeof opts.row === "function" ? opts.row(i) : opts.row ?? {}) };
    }) };
}
const money = (v: string) => new D(v).toDecimalPlaces(0, D.ROUND_HALF_UP).toFixed();

/** Independent reference of A' = (A - C)(1 + R) for v5 and A' = A(1 + R) - C for v3, with the funded zero-floor ledger. */
function reference(initial: string, withdrawal: string, growth: string, months: number, start: boolean) {
  let funded = new D(initial), unmetTotal = new D(0), firstShortfall: number | null = null, firstUnmet = new D(0);
  for (let i = 0; i < months; i++) {
    const w = new D(withdrawal), g = new D(growth);
    const available = start ? funded : funded.mul(g);
    const unmet = D.max(0, w.minus(available));
    funded = start ? D.max(0, funded.minus(w)).mul(g) : D.max(0, available.minus(w));
    if (unmet.gt(0)) { if (firstShortfall === null) { firstShortfall = i + 1; firstUnmet = unmet; } unmetTotal = unmetTotal.plus(unmet); }
  }
  return { funded, unmetTotal, firstShortfall, firstUnmet };
}

describe("engine dispatcher and constants", () => {
  it("routes v3, v5 and unmarked payloads; rejects anything else", () => {
    const base = { withdrawal: "10", initial: "100", growth: "1.01" } as const;
    const v3 = projectRetirement(build("retirement-monthly-v3", base)), v5 = projectRetirement(build("retirement-monthly-v5", base));
    expect(v3.modelVersion).toBe("retirement-monthly-v3");
    expect(v5.modelVersion).toBe("retirement-monthly-v5");
    expect(projectRetirement({ ...build("retirement-monthly-v3", base), modelVersion: undefined, contributionTiming: "END_OF_MONTH" }).modelVersion).toBe("retirement-monthly-v2");
    expect(() => projectRetirement({ ...build("retirement-monthly-v3", base), modelVersion: "retirement-monthly-v9" as never })).toThrow(/Mô hình không được hỗ trợ/);
    expect(JSON.stringify(projectRetirement(build("retirement-monthly-v3", base)))).toBe(JSON.stringify(projectRetirementV3(build("retirement-monthly-v3", base))));
    expect(JSON.stringify(projectRetirement(build("retirement-monthly-v5", base)))).toBe(JSON.stringify(projectRetirementV5(build("retirement-monthly-v5", base))));
  });
  it("new previews use v5 (B1 step 2 flip); v3 stays available for saved plans", () => {
    expect(RETIREMENT_MODEL).toBe("retirement-monthly-v5");
    expect(RETIREMENT_MODEL_V3).toBe("retirement-monthly-v3");
    expect(RETIREMENT_MODEL_V5).toBe("retirement-monthly-v5");
  });
  it("v3 ignores tradingCostRate and emits no v5-only row fields", () => {
    const plain = projectRetirementV3(build("retirement-monthly-v3", { initial: "100", withdrawal: "10", growth: "1.01" }));
    const withRate = projectRetirementV3(build("retirement-monthly-v3", { initial: "100", withdrawal: "10", growth: "1.01", row: { tradingCostRate: "0.1" } }));
    expect(withRate.summary).toEqual(plain.summary);
    expect(withRate.rows[0].closingBalance).toBe(plain.rows[0].closingBalance);
    expect(Object.keys(plain.rows[0])).not.toContain("tradingCost");
  });
  it("replay accepts v5 snapshots alongside v3", () => {
    const v5 = build("retirement-monthly-v5", { initial: "100", withdrawal: "10", growth: "1.01" });
    expect(replayProjection("retirement-plan-snapshot-v1", "retirement-monthly-v5", v5).modelVersion).toBe("retirement-monthly-v5");
    expect(replayProjection("retirement-plan-snapshot-v1", "retirement-monthly-v3", build("retirement-monthly-v3", {})).modelVersion).toBe("retirement-monthly-v3");
    expect(() => replayProjection("retirement-plan-snapshot-v1", "retirement-monthly-v3", v5)).toThrow();
    expect(() => replayProjection("retirement-plan-snapshot-v1", "retirement-monthly-v5", build("retirement-monthly-v3", {}))).toThrow();
  });
});

describe("v5 withdrawal at start of month", () => {
  it("hand-checked first month: (A - C)(1 + R) versus v3 A(1 + R) - C", () => {
    const o = { initial: "1000000000", withdrawal: "4000000", growth: "1.005", retired: 300 } as const;
    const v5 = projectRetirementV5(build("retirement-monthly-v5", o)), v3 = projectRetirementV3(build("retirement-monthly-v3", o));
    expect(v5.rows[0].closingBalance).toBe("1000980000");   // (1,000,000,000 - 4,000,000) * 1.005
    expect(v3.rows[0].closingBalance).toBe("1001000000");   // 1,000,000,000 * 1.005 - 4,000,000
    expect(v5.rows[0]).toMatchObject({ fundedAvailableAtStart: "1000000000", tradingCost: "0", cumulativeUnfunded: "0", investmentChange: "4980000", unfundedWithdrawal: "0" });
    expect(v5.conventions).toMatchObject({ withdrawalTiming: "START_OF_MONTH", negativeBalance: "ZERO_FLOOR_NO_NEGATIVE_RETURNS", capitalReleaseTiming: "END_OF_MONTH" });
  });
  it("300 months: terminal is lower than v3 and equals the independent recurrence", () => {
    const o = { initial: "1000000000", withdrawal: "4000000", growth: "1.005", retired: 300 } as const;
    const v5 = projectRetirementV5(build("retirement-monthly-v5", o)), v3 = projectRetirementV3(build("retirement-monthly-v3", o));
    const ref5 = reference("1000000000", "4000000", "1.005", 300, true), ref3 = reference("1000000000", "4000000", "1.005", 300, false);
    expect(new D(v5.summary.terminalBalance).lt(v3.summary.terminalBalance)).toBe(true);
    expect(new D(v5.summary.terminalBalance).sub(ref5.funded).abs().lt("1e-20")).toBe(true);
    expect(new D(v3.summary.terminalBalance).sub(ref3.funded).abs().lt("1e-20")).toBe(true);
    expect(v5.summary.unfundedWithdrawals).toBe("0");
  });
  it("depletion with 40,000,000/month: first shortfall in month 27, v5 unmet differs from v3 and matches the recurrence", () => {
    const o = { initial: "1000000000", withdrawal: "40000000", growth: "1.005", retired: 300 } as const;
    const v5 = projectRetirementV5(build("retirement-monthly-v5", o)), v3 = projectRetirementV3(build("retirement-monthly-v3", o));
    const ref5 = reference("1000000000", "40000000", "1.005", 300, true), ref3 = reference("1000000000", "40000000", "1.005", 300, false);
    expect(ref5.firstShortfall).toBe(27);
    expect(v5.summary.firstShortfallMonth).toBe(addMonths("2026-01", 26));
    expect(v5.rows[26].unfundedWithdrawal).toBe(ref5.firstUnmet.toFixed());
    expect(money(v5.rows[26].unfundedWithdrawal)).toBe("14755253");
    expect(ref3.firstShortfall).toBe(27);
    expect(money(v3.rows[26].unfundedWithdrawal)).toBe("9062955");
    expect(new D(v5.rows[26].unfundedWithdrawal).gt(v3.rows[26].unfundedWithdrawal)).toBe(true);
    expect(new D(v5.summary.unfundedWithdrawals).sub(ref5.unmetTotal).abs().lt("1e-20")).toBe(true);
  });
  it("zero floor: balance is never negative, a later surplus does not erase a shortfall, no negative returns", () => {
    // month0 withdraw 150 of 100 (shortfall 50); month1 receives a 1000 capital release at its end; month2 withdraw 10.
    const input = build("retirement-monthly-v5", { initial: "100", growth: "1.1", retired: 3, withdrawal: i => ["150", "0", "10"][i],
      row: i => i === 1 ? { capitalInjection: "1000" } : {} });
    const r = projectRetirementV5(input);
    expect(r.rows[0]).toMatchObject({ closingBalance: "0", unfundedWithdrawal: "50", investmentChange: "0", cumulativeUnfunded: "50" });
    expect(r.rows[1].closingBalance).toBe("1000");
    expect(r.rows[1].investmentChange).toBe("0");          // empty balance earns nothing
    expect(r.rows[2]).toMatchObject({ unfundedWithdrawal: "0", closingBalance: "1089", cumulativeUnfunded: "50" }); // (1000 - 10) * 1.1
    expect(r.summary.unfundedWithdrawals).toBe("50");       // later positive months keep the shortfall
    expect(r.summary.firstShortfallMonth).toBe("2026-01");
    for (const row of r.rows) expect(new D(row.closingBalance).gte(0)).toBe(true);
  });
  it("START_OF_MONTH contribution offsets the same month's withdrawal; END_OF_MONTH does not", () => {
    const common = { acc: 1, retired: 1, initial: "0", growth: "1.1", withdrawal: (i: number) => i === 0 ? "100" : "0", contribution: (i: number) => i === 0 ? "100" : "0" };
    const start = projectRetirementV5(build("retirement-monthly-v5", { ...common, timing: "START_OF_MONTH" }));
    const end = projectRetirementV5(build("retirement-monthly-v5", { ...common, timing: "END_OF_MONTH" }));
    expect(start.rows[0]).toMatchObject({ fundedAvailableAtStart: "100", unfundedWithdrawal: "0", closingBalance: "0" });
    expect(end.rows[0]).toMatchObject({ fundedAvailableAtStart: "0", unfundedWithdrawal: "100", closingBalance: "100" });
    expect(start.summary.unfundedWithdrawals).toBe("0");
    expect(end.summary.unfundedWithdrawals).toBe("100");
  });
  it("tradingCostRate applies to the post-withdrawal balance before growth", () => {
    const r = projectRetirementV5(build("retirement-monthly-v5", { initial: "1000", withdrawal: "200", growth: "1.1", row: { tradingCostRate: "0.01" } }));
    // x = 800, K = 8, funded = (800 - 8) * 1.1 = 871.2
    expect(r.rows[0]).toMatchObject({ tradingCost: "8", closingBalance: "871.2", investmentChange: "79.2", fundedAvailableAtStart: "1000" });
    expect(() => projectRetirementV5(build("retirement-monthly-v5", { initial: "1", row: { tradingCostRate: "1" } }))).toThrow();
    expect(() => projectRetirementV5(build("retirement-monthly-v5", { initial: "1", row: { tradingCostRate: "-0.1" } }))).toThrow();
  });
});

describe("v5 solver (exact algebra, no tolerance)", () => {
  const scenario = (c: string | null, timing: "END_OF_MONTH" | "START_OF_MONTH", t = "0") => build("retirement-monthly-v5", {
    acc: 24, retired: 12, initial: "50000", terminal: "1000", growth: "1.004", timing, contribution: (i: number) => i < 24 ? (c ?? "0") : "0",
    withdrawal: i => i < 24 ? (i === 5 ? "30000" : "0") : "9000", row: { tradingCostRate: t } });
  for (const timing of ["END_OF_MONTH", "START_OF_MONTH"] as const) for (const t of ["0", "0.003"]) {
    it(`${timing}, trading cost ${t}: required constant contribution is the smallest feasible one`, () => {
      const base = projectRetirementV5(scenario(null, timing, t));
      expect(base.summary.requiredConstantMonthlyContribution).not.toBeNull();
      const c = new D(base.summary.requiredConstantMonthlyContribution!);
      expect(c.gt(0)).toBe(true);
      const run = (v: string) => projectRetirementV5(scenario(v, timing, t));
      const ok = run(c.toDecimalPlaces(2, D.ROUND_UP).toFixed());     // within the 0.01 VND display tolerance
      expect(ok.summary.unfundedWithdrawals).toBe("0");
      expect(new D(ok.summary.atRetirement.fundingGap).lte(0)).toBe(true);
      const bad = run(c.minus(1).toFixed());                           // 1 VND less
      const short = new D(bad.summary.unfundedWithdrawals).gt(0) || new D(bad.summary.atRetirement.fundingGap).gt(0);
      expect(short).toBe(true);
      // additional contribution on top of the declared one reproduces the same total
      const declared = run("100"), extra = new D(declared.summary.additionalMonthlyContribution!);
      expect(extra.plus(100).sub(c).abs().lt("1e-20")).toBe(true);
    });
  }
  it("reports EARLY_FUNDING_REQUIRED when no deposit can cover a shortfall before any eligible month", () => {
    const input = build("retirement-monthly-v5", { acc: 3, retired: 2, initial: "0", withdrawal: i => i === 0 ? "10" : "0", contribution: i => i === 0 ? "0" : "5", start: "2026-02" });
    expect(projectRetirementV5(input).summary.savingsStatus).toBe("EARLY_FUNDING_REQUIRED");
  });
  it("keeps v3 summary field names and savingsStatus values", () => {
    const v3 = projectRetirementV3({ ...scenario("100", "END_OF_MONTH"), modelVersion: "retirement-monthly-v3" });
    const v5 = projectRetirementV5(scenario("100", "END_OF_MONTH"));
    expect(Object.keys(v5.summary)).toEqual(Object.keys(v3.summary));
    expect(Object.keys(v5.conventions).slice(0, Object.keys(v3.conventions).length)).toEqual(Object.keys(v3.conventions));
    expect(Object.keys(v5.rows[0]).slice(0, Object.keys(v3.rows[0]).length)).toEqual(Object.keys(v3.rows[0]));
  });
});
