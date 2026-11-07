import { describe, it, expect } from "vitest";
import { HoldingsMonitoringService, REGULATORY_MONITORING_DISCLAIMER } from "../modules/holdings/service";
import type { UserHoldingItem, TargetAllocationItem } from "../modules/holdings/types";

describe("HoldingsMonitoringService", () => {
  const service = new HoldingsMonitoringService();
  const testUserId = "b1111111-2222-3333-4444-555555555555";

  const sampleHoldings: UserHoldingItem[] = [
    {
      userId: testUserId,
      productId: "ETF_E1VFVN30",
      productCode: "E1VFVN30",
      productName: "Quỹ ETF VFMVN30",
      assetClass: "EQUITY",
      quantity: "20000",
      costBasis: "22000", // Total cost = 440,000,000
      currentPrice: "26000", // Current value = 520,000,000 (+80,000,000)
      maturedAmount: "0",
      currency: "VND",
    },
    {
      userId: testUserId,
      productId: "BOND_TCBF",
      productCode: "TCBF",
      productName: "Quỹ Đầu tư Trái phiếu Techcom",
      assetClass: "BOND",
      quantity: "25000",
      costBasis: "14000", // Total cost = 350,000,000
      currentPrice: "15200", // Current value = 380,000,000 (+30,000,000)
      maturedAmount: "50000000", // 50M maturing
      currency: "VND",
    },
    {
      userId: testUserId,
      productId: "DEP_VCB_12M",
      productCode: "VCB_DEP_12M",
      productName: "Tiền gửi Vietcombank 12 tháng",
      assetClass: "CASH",
      quantity: "100000000",
      costBasis: "1",
      currentPrice: "1", // Current value = 100,000,000
      maturedAmount: "0",
      currency: "VND",
    },
  ];

  it("calculates accurate holdings valuation and asset class weights", () => {
    const valuation = service.calculateHoldingsValuation(sampleHoldings, "2026-10-29");

    expect(valuation.userId).toBe(testUserId);
    expect(valuation.asOfDate).toBe("2026-10-29");

    // Total value = 520M + 380M + 100M = 1,000,000,000 VND
    expect(valuation.totalValue).toBe("1000000000");

    // Total cost = 440M + 350M + 100M = 890,000,000 VND
    expect(valuation.totalCost).toBe("890000000");

    // Gain = 110,000,000 VND (+12.36%)
    expect(valuation.totalUnrealizedGainLoss).toBe("110000000");
    expect(valuation.totalUnrealizedGainLossPercent).toBe("12.36");

    // Weights: Equity = 52.00%, Bond = 38.00%, Cash = 10.00%
    const equityAc = valuation.assetClasses.find((a) => a.assetClass === "EQUITY");
    const bondAc = valuation.assetClasses.find((a) => a.assetClass === "BOND");
    const cashAc = valuation.assetClasses.find((a) => a.assetClass === "CASH");

    expect(equityAc?.weightPercent).toBe("52.00");
    expect(bondAc?.weightPercent).toBe("38.00");
    expect(cashAc?.weightPercent).toBe("10.00");
    expect(bondAc?.maturedAmount).toBe("50000000");
  });

  it("detects no drift when current weights match targets within band", () => {
    // Current weights: Equity 52%, Bond 38%, Cash 10%
    // Target weights: Equity 50%, Bond 40%, Cash 10% (max drift = 2% <= 5%)
    const targets: TargetAllocationItem[] = [
      { assetClass: "EQUITY", weightPercent: "50" },
      { assetClass: "BOND", weightPercent: "40" },
      { assetClass: "CASH", weightPercent: "10" },
    ];

    const result = service.monitorPortfolioDrift({
      userId: testUserId,
      holdings: sampleHoldings,
      targets,
      driftThresholdPercent: "5.0",
      newContribution: "20000000",
    });

    expect(result.isDrifted).toBe(false);
    expect(result.rebalanceRequired).toBe(false);
    expect(Number(result.maxDriftPercent)).toBeLessThanOrEqual(5.0);
    expect(result.rebalanceRecommendation?.status).toBe("NO_ACTION");
    expect(result.rebalanceRecommendation?.unallocatedCash).toBe("20000000");
    expect(result.regulatoryDisclaimer).toContain("Điều 72, 73 Luật Chứng khoán");
  });

  it("triggers drift alert and generates cash-first rebalancing when weights deviate > band", () => {
    // Current weights: Equity 52%, Bond 38%, Cash 10%
    // Target weights: Equity 30%, Bond 50%, Cash 20% (Equity drift = +22% > 5%)
    const targets: TargetAllocationItem[] = [
      { assetClass: "EQUITY", weightPercent: "30" },
      { assetClass: "BOND", weightPercent: "50" },
      { assetClass: "CASH", weightPercent: "20" },
    ];

    const result = service.monitorPortfolioDrift({
      userId: testUserId,
      holdings: sampleHoldings,
      targets,
      driftThresholdPercent: "5.0",
      newContribution: "50000000", // 50M new cash
    });

    expect(result.isDrifted).toBe(true);
    expect(result.rebalanceRequired).toBe(true);
    expect(result.maxDriftPercent).toBe("22.00");

    const equityDrift = result.drifts.find((d) => d.assetClass === "EQUITY");
    expect(equityDrift?.status).toBe("OVERWEIGHT");
    expect(equityDrift?.driftPercent).toBe("22.00");

    const bondDrift = result.drifts.find((d) => d.assetClass === "BOND");
    expect(bondDrift?.status).toBe("UNDERWEIGHT");

    // Rebalance proposal generated
    expect(result.rebalanceRecommendation).not.toBeNull();
    expect(result.rebalanceRecommendation?.status).toBe("PROPOSED");
    expect(Number(result.rebalanceRecommendation?.costEstimated)).toBeGreaterThan(0);

    // Free cash (50M contribution + 50M bond maturities = 100M) used before selling
    expect(Number(result.rebalanceRecommendation?.cashUsedBeforeTrades)).toBeGreaterThan(0);

    const trades = result.rebalanceRecommendation?.trades || [];
    const equityTrade = trades.find((t) => t.assetClass === "EQUITY");
    expect(Number(equityTrade?.sell)).toBeGreaterThan(0);
  });

  it("handles empty holdings gracefully with zero balances and no crashes", () => {
    const result = service.monitorPortfolioDrift({
      userId: testUserId,
      holdings: [],
      targets: [
        { assetClass: "EQUITY", weightPercent: "40" },
        { assetClass: "BOND", weightPercent: "60" },
      ],
    });

    expect(result.totalPortfolioValue).toBe("0");
    expect(result.isDrifted).toBe(true); // 0% vs 40% drift = 40%
    expect(result.rebalanceRecommendation).toBeNull();
  });

  it("generates product-level orders respecting HoSE 100-share lot sizes and open fund fractional units", () => {
    const targets: TargetAllocationItem[] = [
      { assetClass: "EQUITY", weightPercent: "30" },
      { assetClass: "BOND", weightPercent: "50" },
      { assetClass: "CASH", weightPercent: "20" },
    ];

    const driftResult = service.monitorPortfolioDrift({
      userId: testUserId,
      holdings: sampleHoldings,
      targets,
      driftThresholdPercent: "5.0",
      newContribution: "50000000",
    });

    expect(driftResult.rebalanceRecommendation?.trades.length).toBeGreaterThan(0);

    const targetCatalog = [
      {
        productId: "ETF_E1VFVN30",
        productCode: "E1VFVN30",
        productName: "Quỹ ETF VFMVN30",
        assetClass: "EQUITY" as const,
        currentPrice: "26000",
        lotSize: 100, // HoSE ETF round lot of 100
      },
      {
        productId: "BOND_TCBF",
        productCode: "TCBF",
        productName: "Quỹ Đầu tư Trái phiếu Techcom",
        assetClass: "BOND" as const,
        currentPrice: "15200",
        lotSize: 1, // Open fund unit lot of 1
      },
    ];

    const ordersResult = service.generateProductLevelRebalanceOrders({
      trades: driftResult.rebalanceRecommendation!.trades,
      holdings: sampleHoldings,
      targetProducts: targetCatalog,
    });

    expect(ordersResult.orders.length).toBeGreaterThan(0);

    const equityOrder = ordersResult.orders.find((o) => o.assetClass === "EQUITY");
    expect(equityOrder).toBeDefined();
    expect(equityOrder?.action).toBe("SELL");
    // Equity lot size must be exact multiple of 100
    expect(equityOrder!.units % 100).toBe(0);
    expect(equityOrder?.lotSize).toBe(100);

    const bondOrder = ordersResult.orders.find((o) => o.assetClass === "BOND");
    if (bondOrder) {
      expect(bondOrder.lotSize).toBe(1);
    }

    expect(ordersResult.regulatoryDisclaimer).toContain("Điều 72, 73 Luật Chứng khoán");
  });
});
