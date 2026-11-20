import { describe, expect, it } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { proposeRebalance, rebalanceInputSchema } from "../modules/allocation-risk/rebalance";

const baseInput = () =>
  rebalanceInputSchema.parse({
    policyVersionId: "00000000-0000-4000-8000-000000000001",
    templateId: "TEST",
    month: "2026-01",
    retirementMonth: "2030-01",
    holdings: [
      { assetClass: "CASH", value: "400", maturedAmount: "0" },
      { assetClass: "EQUITY", value: "600", maturedAmount: "0" },
    ],
    newContribution: "0",
  });

const targets = [
  { assetClass: "CASH", weightPercent: "50" },
  { assetClass: "EQUITY", weightPercent: "50" },
];

describe("B7-2: optional sale tax and transaction fee in proposeRebalance", () => {
  it("leaves cost/netValue unchanged and records TAX_NOT_MODELED when rebalancePolicy is absent", () => {
    const r = proposeRebalance(baseInput(), targets, "5", "0.2");
    expect(r.status).toBe("PROPOSED");
    if (r.status !== "PROPOSED") return;
    expect(r.assumptions).toContain("TAX_NOT_MODELED");
    expect(r.assumptions).toContain("HALF_L1_REMAINING_TRADES_TIMES_COST");
    expect("taxAmount" in r).toBe(false);
    // Exact value conservation: netValue + cost = 1000, and half-L1 turnover * 0.2% = cost.
    const buyTotal = r.trades.reduce((s, t) => s.plus(t.buy), new D(0));
    const sellTotal = r.trades.reduce((s, t) => s.plus(t.sell), new D(0));
    const expectedCost = buyTotal.plus(sellTotal).div(2).mul("0.002");
    expect(new D(r.cost).minus(expectedCost).abs().lt("1e-30")).toBe(true);
    expect(new D(r.netValue).plus(r.cost).minus(1000).abs().lt("1e-30")).toBe(true);
  });

  it("adds sale tax on sell value on top of half-L1 turnover cost when only saleTaxPercent is set", () => {
    const baseline = proposeRebalance(baseInput(), targets, "5", "0.2");
    const taxed = proposeRebalance(baseInput(), targets, "5", "0.2", {
      evidence: "Test policy citation only (CHỜ CHỐT)",
      saleTaxPercent: "0.1",
    });
    expect(taxed.status).toBe("PROPOSED");
    if (baseline.status !== "PROPOSED" || taxed.status !== "PROPOSED") return;

    expect(taxed.assumptions).toContain("SALE_TAX_ON_SELL_VALUE");
    expect(taxed.assumptions).not.toContain("TAX_NOT_MODELED");
    expect(new D(taxed.cost).gt(baseline.cost)).toBe(true);

    const buyTotal = taxed.trades.reduce((s, t) => s.plus(t.buy), new D(0));
    const sellTotal = taxed.trades.reduce((s, t) => s.plus(t.sell), new D(0));
    const expectedTax = sellTotal.mul("0.001");
    const expectedFee = buyTotal.plus(sellTotal).div(2).mul("0.002");
    expect(new D(taxed.taxAmount!).minus(expectedTax).abs().lt("1e-30")).toBe(true);
    expect(new D(taxed.transactionFeeAmount!).minus(expectedFee).abs().lt("1e-30")).toBe(true);
    expect(new D(taxed.cost).minus(expectedFee.plus(expectedTax)).abs().lt("1e-30")).toBe(true);
    expect(new D(taxed.netValue).plus(taxed.cost).minus(1000).abs().lt("1e-30")).toBe(true);
  });

  it("charges explicit transactionFeePercent on buy+sell (no double-count with costPercent) plus saleTaxPercent on sell", () => {
    const r = proposeRebalance(baseInput(), targets, "5", "9.9", {
      evidence: "Test policy citation only (CHỜ CHỐT)",
      saleTaxPercent: "0.1",
      transactionFeePercent: "0.15",
    });
    expect(r.status).toBe("PROPOSED");
    if (r.status !== "PROPOSED") return;

    expect(r.assumptions).toContain("EXPLICIT_TRANSACTION_FEE_ON_BUY_AND_SELL");
    expect(r.assumptions).toContain("SALE_TAX_ON_SELL_VALUE");
    expect(r.assumptions).not.toContain("HALF_L1_REMAINING_TRADES_TIMES_COST");

    const buyTotal = r.trades.reduce((s, t) => s.plus(t.buy), new D(0));
    const sellTotal = r.trades.reduce((s, t) => s.plus(t.sell), new D(0));
    const expectedFee = buyTotal.plus(sellTotal).mul("0.0015");
    const expectedTax = sellTotal.mul("0.001");
    expect(new D(r.transactionFeeAmount!).minus(expectedFee).abs().lt("1e-30")).toBe(true);
    expect(new D(r.taxAmount!).minus(expectedTax).abs().lt("1e-30")).toBe(true);
    expect(new D(r.cost).minus(expectedFee.plus(expectedTax)).abs().lt("1e-30")).toBe(true);
    expect(new D(r.netValue).plus(r.cost).minus(1000).abs().lt("1e-30")).toBe(true);
  });

  it("charges zero tax and zero fee when cash-first contributions cover all deficits without selling", () => {
    const input = baseInput();
    input.newContribution = "200";
    const r = proposeRebalance(input, targets, "5", "0.2", {
      evidence: "Test policy citation only (CHỜ CHỐT)",
      saleTaxPercent: "0.1",
      transactionFeePercent: "0.15",
    });
    expect(r.status).toBe("PROPOSED");
    if (r.status !== "PROPOSED") return;
    expect(r.cost).toBe("0");
    expect(r.taxAmount).toBe("0");
    expect(r.transactionFeeAmount).toBe("0");
  });
});
