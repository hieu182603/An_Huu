import { describe, expect, it } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { HoldingsMonitoringService } from "../modules/holdings/service";
import type { UserHoldingItem } from "../modules/holdings/types";

const service = new HoldingsMonitoringService();
const userId = "00000000-0000-4000-8000-000000000001";
const equityProduct = {
  productId: "EQUITY_ETF", productCode: "ETF", productName: "Test ETF",
  assetClass: "EQUITY" as const, currentPrice: "1", lotSize: 100,
};
const holdings = (equity = "400", cash = "600", matured = "0"): UserHoldingItem[] => [
  { ...equityProduct, userId, quantity: equity, costBasis: "1", maturedAmount: "0", currency: "VND" },
  { userId, productId: "DEPOSIT", productCode: "DEP", productName: "Deposit", assetClass: "CASH",
    quantity: cash, costBasis: "1", currentPrice: "1", maturedAmount: matured, currency: "VND" },
];
const monitor = (items: UserHoldingItem[], newContribution: string) => service.monitorPortfolioDrift({
  userId, holdings: items, newContribution, month: "2026-01", retirementMonth: "2030-01",
  targets: [{ assetClass: "EQUITY", weightPercent: "50" }, { assetClass: "CASH", weightPercent: "50" }],
  driftThresholdPercent: "5", costPercent: "0.2",
  rebalancePolicy: { evidence: "Test policy", saleTaxPercent: "0.1", transactionFeePercent: "0.15" },
});

describe("holdings product orders include cash-first purchases", () => {
  it.each([
    { name: "new contributions", contribution: "100", matured: "0" },
    { name: "maturities already included in holdings", contribution: "0", matured: "100" },
  ])("creates a BUY order from $name when no remaining class trades are needed", ({ contribution, matured }) => {
    const items = holdings("400", "600", matured);
    const monitoring = monitor(items, contribution);
    expect(monitoring.isDrifted).toBe(true);
    expect(monitoring.rebalanceRequired).toBe(false);
    const recommendation = monitoring.rebalanceRecommendation;
    expect(recommendation?.status).toBe("PROPOSED");
    expect(recommendation?.costEstimated).toBe("0");
    expect(recommendation?.trades.find(t => t.assetClass === "EQUITY")).toMatchObject({
      cashAllocated: "100", buy: "0", sell: "0",
    });
    const result = service.generateProductLevelRebalanceOrders({
      trades: recommendation!.trades, holdings: items, targetProducts: [equityProduct],
    });
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      productId: equityProduct.productId, action: "BUY", units: 100, estimatedAmount: "100", lotSize: 100,
    });
  });

  it("combines cash and the remaining buy once before rounding down to a full lot", () => {
    const result = service.generateProductLevelRebalanceOrders({
      trades: [{ assetClass: "EQUITY", cashAllocated: "60", buy: "60", sell: "0" }],
      holdings: [], targetProducts: [equityProduct],
    });
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({ action: "BUY", units: 100, estimatedAmount: "100" });
  });

  it("does not add or deduct fees again when translating a proposal with both free cash and trading", () => {
    const items = holdings("100", "900");
    const recommendation = monitor(items, "100").rebalanceRecommendation!;
    expect(new D(recommendation.costEstimated).gt(0)).toBe(true);
    const purchase = recommendation.trades.find(t => t.assetClass === "EQUITY")!;
    expect(new D(purchase.cashAllocated).gt(0)).toBe(true);
    expect(new D(purchase.buy).gt(0)).toBe(true);
    const result = service.generateProductLevelRebalanceOrders({
      trades: recommendation.trades, holdings: items, targetProducts: [{ ...equityProduct, lotSize: 1 }],
    });
    const order = result.orders.find(o => o.action === "BUY")!;
    const principal = new D(purchase.newValue).minus("100");
    expect(order.units).toBe(principal.floor().toNumber());
    expect(new D(order.estimatedAmount).lte(principal)).toBe(true);
    expect(principal.minus(order.estimatedAmount).lt(1)).toBe(true);
  });

  it("never rounds a budget just below one lot up to an unaffordable order", () => {
    const result = service.generateProductLevelRebalanceOrders({
      trades: [{ assetClass: "EQUITY", cashAllocated: "99.999999999999999999", buy: "0", sell: "0" }],
      holdings: [], targetProducts: [equityProduct],
    });
    expect(result.orders).toEqual([]);
  });

  it("preserves legacy trades that omit cashAllocated", () => {
    const result = service.generateProductLevelRebalanceOrders({
      trades: [{ assetClass: "EQUITY", buy: "250", sell: "0" }],
      holdings: [], targetProducts: [equityProduct],
    });
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({ action: "BUY", units: 200, estimatedAmount: "200" });
  });

  it("requires rebalancing for a breached spending floor even when class drift is below the band", () => {
    const result = service.monitorPortfolioDrift({
      userId, holdings: holdings("520", "480"), month: "2030-01", retirementMonth: "2030-01",
      targets: [{ assetClass: "EQUITY", weightPercent: "50" }, { assetClass: "CASH", weightPercent: "50" }],
      driftThresholdPercent: "5", newContribution: "0", costPercent: "0.2",
      spendingFloor: { safeAssets: ["CASH"], minSafeFraction: "0.49" },
    });
    expect(result.isDrifted).toBe(false);
    expect(result.rebalanceRequired).toBe(true);
    expect(result.rebalanceRecommendation?.status).toBe("PROPOSED");
    expect(new D(result.rebalanceRecommendation!.trades.find(t => t.assetClass === "CASH")!.buy).gt(0)).toBe(true);
    expect(new D(result.rebalanceRecommendation!.trades.find(t => t.assetClass === "EQUITY")!.sell).gt(0)).toBe(true);
  });
});
