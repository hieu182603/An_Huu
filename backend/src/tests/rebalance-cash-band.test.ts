import { describe, expect, it } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { proposeRebalance, rebalanceInputSchema, validWeights } from "../modules/allocation-risk/rebalance";

const input = (cash = "400", equity = "600", contribution = "0", matured = "0") => rebalanceInputSchema.parse({
  policyVersionId: "00000000-0000-4000-8000-000000000001", templateId: "TEST",
  month: "2026-01", retirementMonth: "2030-01",
  holdings: [
    { assetClass: "CASH", value: cash, maturedAmount: "0" },
    { assetClass: "EQUITY", value: equity, maturedAmount: matured },
  ],
  newContribution: contribution,
});
const targets = [
  { assetClass: "CASH", weightPercent: "50" },
  { assetClass: "EQUITY", weightPercent: "50" },
];

describe("B7: apply the drift band after allocating free cash", () => {
  it("uses a partial contribution to restore the band without selling or charging fees", () => {
    const result = proposeRebalance(input("400", "600", "100"), targets, "5", "0.2", {
      evidence: "Test policy", saleTaxPercent: "0.1", transactionFeePercent: "0.15",
    });
    expect(result.status).toBe("PROPOSED");
    if (result.status !== "PROPOSED") return;
    expect(result.trigger).toBe("BELOW_BAND");
    expect(result.netValue).toBe("1100");
    expect(result.cashUsedBeforeTrades).toBe("100");
    expect(result.cost).toBe("0");
    expect(result.taxAmount).toBe("0");
    expect(result.transactionFeeAmount).toBe("0");
    expect(result.trades).toEqual([
      { assetClass: "CASH", oldValue: "400", maturedAmount: "0", cashAllocated: "100", buy: "0", sell: "0", newValue: "500" },
      { assetClass: "EQUITY", oldValue: "600", maturedAmount: "0", cashAllocated: "0", buy: "0", sell: "0", newValue: "600" },
    ]);
    expect(validWeights(result.newWeights)).toBe(true);
    const equityWeight = result.newWeights.find(w => w.assetClass === "EQUITY")!;
    expect(new D(equityWeight.weightPercent).minus(new D(600).div(1100).mul(100)).abs().lt("1e-30")).toBe(true);
    expect(result.assumptions).toContain("ABSOLUTE_DRIFT_CHECKED_AFTER_FREE_CASH_ALLOCATION");
    expect(result.assumptions).toContain("CASH_ALLOCATION_WITHIN_BAND_NO_TRADES");
  });

  it("allocates a new contribution even when the original holdings were already within band", () => {
    const result = proposeRebalance(input("480", "520", "20"), targets, "5", "0.2");
    expect(result.status).toBe("PROPOSED");
    if (result.status !== "PROPOSED") return;
    expect(result.trigger).toBe("BELOW_BAND");
    expect(result.cashUsedBeforeTrades).toBe("20");
    expect(result.cost).toBe("0");
    expect(result.trades.map(t => [t.newValue, t.buy, t.sell])).toEqual([["500", "0", "0"], ["520", "0", "0"]]);
    expect(validWeights(result.newWeights)).toBe(true);
  });

  it("allocates maturities already included in wealth before considering sales", () => {
    const result = proposeRebalance(input("400", "600", "0", "100"), targets, "5", "0.2");
    expect(result.status).toBe("PROPOSED");
    if (result.status !== "PROPOSED") return;
    expect(result.netValue).toBe("1000");
    expect(result.cashUsedBeforeTrades).toBe("100");
    expect(result.cost).toBe("0");
    expect(result.trades.map(t => [t.newValue, t.buy, t.sell])).toEqual([["500", "0", "0"], ["500", "0", "0"]]);
  });

  it("still trades when the residual drift is exactly the configured band", () => {
    const result = proposeRebalance(input("340", "660", "200"), targets, "5", "0.2");
    expect(result.status).toBe("PROPOSED");
    if (result.status !== "PROPOSED") return;
    expect(result.trigger).toBe("AT_OR_ABOVE_BAND");
    expect(new D(result.trades.find(t => t.assetClass === "EQUITY")!.sell).gt(0)).toBe(true);
    expect(new D(result.cost).gt(0)).toBe(true);
    expect(new D(result.netValue).plus(result.cost).minus(1200).abs().lt("1e-30")).toBe(true);
  });

  it("preserves the no-action response when holdings are within band and no cash is available", () => {
    const result = proposeRebalance(input("480", "520"), targets, "5", "0.2");
    expect(result.status).toBe("WITHIN_BAND");
    if (result.status !== "WITHIN_BAND") return;
    expect(result.trigger).toBe("BELOW_BAND");
    expect(result.bandPoints).toBe("5");
    expect(result.costPercent).toBe("0.2");
    expect(result.trades).toEqual([]);
    expect(result.unallocatedNewContribution).toBe("0");
  });

  it("conserves all free cash and reports normalized actual weights across several deficits", () => {
    const result = proposeRebalance(rebalanceInputSchema.parse({
      ...input(), newContribution: "100",
      holdings: [
        { assetClass: "CASH", value: "200", maturedAmount: "0" },
        { assetClass: "BOND", value: "200", maturedAmount: "0" },
        { assetClass: "EQUITY", value: "600", maturedAmount: "0" },
      ],
    }), [
      { assetClass: "CASH", weightPercent: "25" },
      { assetClass: "BOND", weightPercent: "25" },
      { assetClass: "EQUITY", weightPercent: "50" },
    ], "5", "0.2");
    expect(result.status).toBe("PROPOSED");
    if (result.status !== "PROPOSED") return;
    expect(result.cost).toBe("0");
    expect(validWeights(result.newWeights)).toBe(true);
    expect(result.trades.reduce((sum, t) => sum.plus(t.cashAllocated), new D(0)).toFixed()).toBe("100");
    expect(result.trades.reduce((sum, t) => sum.plus(t.newValue), new D(0)).toFixed()).toBe("1100");
  });
});
