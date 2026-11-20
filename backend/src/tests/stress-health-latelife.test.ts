import { describe, expect, it } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import { applyLateLifeCare, deterministicStress } from "../modules/allocation-risk/stresses";
import { riskContext } from "./allocation-risk-fixtures";

describe("B6-6 stress parameters: HIGH_INFLATION.healthDeltaPoints & LONGEVITY.lateLifeCareMonthly", () => {
  it("validates optional healthDeltaPoints and lateLifeCareMonthly in riskPolicySchema", () => {
    expect(riskPolicySchema.safeParse({
      evidence: "B6-6 policy test",
      stresses: {
        HIGH_INFLATION: { offsetMonths: 0, durationMonths: 12, annualDeltaPoints: "6", healthDeltaPoints: "12" },
        LONGEVITY: { extraYears: [5], lateLifeCareMonthly: "5000000" },
      },
    }).success).toBe(true);
    expect(riskPolicySchema.safeParse({
      evidence: "B6-6 reject zero healthDeltaPoints",
      stresses: { HIGH_INFLATION: { offsetMonths: 0, durationMonths: 12, annualDeltaPoints: "6", healthDeltaPoints: "0" } },
    }).success).toBe(false);
    expect(riskPolicySchema.safeParse({
      evidence: "B6-6 reject zero lateLifeCareMonthly",
      stresses: { LONGEVITY: { extraYears: [5], lateLifeCareMonthly: "0" } },
    }).success).toBe(false);
  });

  it("HIGH_INFLATION.healthDeltaPoints is off when absent and compounds extra HEALTH inflation when configured", () => {
    const c = riskContext(12); // 2026-01 .. 2026-12, initialCapital 1000 -> bump to 10000 so it stays funded
    c.projection.initialCapital = "10000";
    const market = c.projection.rows.map(() => ({ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }));
    const healthExpenses = c.projection.rows.map((_, i) => (i < 6 ? "100" : "0"));

    const offPolicy = riskPolicySchema.parse({
      evidence: "Health delta off",
      stresses: { HIGH_INFLATION: { offsetMonths: 0, durationMonths: 3, annualDeltaPoints: "6" } },
    });
    const offWithoutExtra = deterministicStress("HIGH_INFLATION", c, market, offPolicy);
    const offWithExtra = deterministicStress("HIGH_INFLATION", c, market, offPolicy, undefined, undefined, undefined, undefined, { healthExpenses });
    expect(offWithExtra).toEqual(offWithoutExtra);

    // Turn healthDeltaPoints ON: 120%/yr = 10%/month for 3 months (months 0,1,2)
    // healthFactor at i=0: 1.1 (+10), i=1: 1.21 (+21), i=2: 1.331 (+33.1), i=3..5: 1.331 (+33.1 each), i=6..11: health=0 (+0)
    // Total extra spending = 10 + 21 + 33.1 * 4 = 163.4
    const onPolicy = riskPolicySchema.parse({
      evidence: "Health delta on",
      stresses: { HIGH_INFLATION: { offsetMonths: 0, durationMonths: 3, annualDeltaPoints: "6", healthDeltaPoints: "120" } },
    });
    const onRes = deterministicStress("HIGH_INFLATION", c, market, onPolicy, undefined, undefined, undefined, undefined, { healthExpenses });
    expect(offWithExtra.status).toBe("READY");
    expect(onRes.status).toBe("READY");
    if (offWithExtra.status === "READY" && onRes.status === "READY") {
      const diff = new D(offWithExtra.result.fundedTerminalBalance).minus(onRes.result.fundedTerminalBalance);
      expect(diff.toFixed(6)).toBe("163.400000");
    }
  });

  it("LONGEVITY.lateLifeCareMonthly is off when absent and adds care cost starting from age 75 when configured", () => {
    const c = riskContext(12); // 2026-01 .. 2026-12; +5y extends through 2031-12 (72 months total)
    c.projection.initialCapital = "100000";
    const market = c.projection.rows.map(() => ({ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }));
    // birthMonth = "1955-01" => age 75 starts at "2030-01" (24 months: 2030-01 .. 2031-12)
    const birthMonth = "1955-01";

    const offPolicy = riskPolicySchema.parse({
      evidence: "Late-life care off",
      stresses: { LONGEVITY: { extraYears: [5] } },
    });
    const offNoBirth = deterministicStress("LONGEVITY", c, market, offPolicy, undefined, 5);
    const offWithBirth = deterministicStress("LONGEVITY", c, market, offPolicy, undefined, 5, undefined, undefined, { birthMonth });
    expect(offWithBirth).toEqual(offNoBirth);

    const onPolicy = riskPolicySchema.parse({
      evidence: "Late-life care on",
      stresses: { LONGEVITY: { extraYears: [5], lateLifeCareMonthly: "50" } },
    });
    const onRes = deterministicStress("LONGEVITY", c, market, onPolicy, undefined, 5, undefined, undefined, { birthMonth });
    expect(offWithBirth.status).toBe("READY");
    expect(onRes.status).toBe("READY");
    if (offWithBirth.status === "READY" && onRes.status === "READY") {
      // 24 months (2030-01..2031-12) * 50 = 1200 exact reduction on 0% return market
      const diff = new D(offWithBirth.result.fundedTerminalBalance).minus(onRes.result.fundedTerminalBalance);
      expect(diff.toFixed()).toBe("1200");
    }

    // Verify row-level boundary in applyLateLifeCare: 2026-06 untouched, 2026-07+ gets +50 when birthMonth=1951-07
    const shifted = applyLateLifeCare(c, "1951-07", "50");
    expect(shifted.projection.rows.find(r => r.month === "2026-06")!.additionalExpense).toBe("0");
    expect(shifted.projection.rows.find(r => r.month === "2026-07")!.additionalExpense).toBe("50");
  });
});
