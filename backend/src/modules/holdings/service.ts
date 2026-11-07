import { RetirementDecimal as D } from "../retirement/engine";
import { proposeRebalance, type Allocation } from "../allocation-risk/rebalance";
import type {
  UserHoldingItem,
  HoldingValuation,
  AssetClassValuation,
  PortfolioHoldingsSummary,
  TargetAllocationItem,
  DriftItem,
  DriftMonitoringResult,
  AssetClassType,
} from "./types";

export const REGULATORY_MONITORING_DISCLAIMER =
  "An Hưu là nền tảng công nghệ cung cấp công cụ theo dõi danh mục và tư vấn phân bổ tài sản độc lập " +
  "theo Điều 72, 73 Luật Chứng khoán số 102/VBHN-VPQH. Hệ thống không nhận ủy thác, không nắm giữ tài sản của khách hàng, " +
  "không tự động đặt lệnh giao dịch và không cam kết kết quả đầu tư. Nhà đầu tư tự chịu trách nhiệm thực hiện giao dịch " +
  "tại các tổ chức phát hành, ngân hàng giám sát hoặc công ty chứng khoán được cấp phép.";

export class HoldingsMonitoringService {
  /**
   * Tính toán định giá chi tiết danh mục tài sản nắm giữ
   */
  calculateHoldingsValuation(
    holdings: UserHoldingItem[],
    asOfDate: string = new Date().toISOString().slice(0, 10),
  ): PortfolioHoldingsSummary {
    const userId = holdings[0]?.userId ?? "00000000-0000-0000-0000-000000000000";

    if (holdings.length === 0) {
      return {
        userId,
        asOfDate,
        totalValue: "0",
        totalCost: "0",
        totalUnrealizedGainLoss: "0",
        totalUnrealizedGainLossPercent: "0",
        holdings: [],
        assetClasses: [],
      };
    }

    let totalVal = new D(0);
    let totalCostVal = new D(0);

    // Tính toán từng holding
    const rawValuations = holdings.map((h) => {
      const qty = new D(h.quantity);
      const cost = new D(h.costBasis);
      const price = new D(h.currentPrice);

      const costTotal = qty.mul(cost);
      const curValue = qty.mul(price);
      const gainLoss = curValue.minus(costTotal);
      const gainLossPct = costTotal.gt(0)
        ? gainLoss.div(costTotal).mul(100).toFixed(2)
        : "0.00";

      totalVal = totalVal.plus(curValue);
      totalCostVal = totalCostVal.plus(costTotal);

      return {
        item: h,
        costTotal,
        curValue,
        gainLoss,
        gainLossPct,
      };
    });

    const holdingsValuations: HoldingValuation[] = rawValuations.map((rv) => {
      const weightPct = totalVal.gt(0)
        ? rv.curValue.div(totalVal).mul(100).toFixed(2)
        : "0.00";

      return {
        productId: rv.item.productId,
        productCode: rv.item.productCode,
        productName: rv.item.productName,
        assetClass: rv.item.assetClass,
        quantity: rv.item.quantity,
        costBasis: rv.item.costBasis,
        currentPrice: rv.item.currentPrice,
        currentValue: rv.curValue.toFixed(0),
        costTotal: rv.costTotal.toFixed(0),
        unrealizedGainLoss: rv.gainLoss.toFixed(0),
        unrealizedGainLossPercent: rv.gainLossPct,
        weightPercent: weightPct,
      };
    });

    // Gom nhóm theo Asset Class
    const assetClassMap: Record<
      AssetClassType,
      { value: InstanceType<typeof D>; matured: InstanceType<typeof D> }
    > = {
      CASH: { value: new D(0), matured: new D(0) },
      BOND: { value: new D(0), matured: new D(0) },
      EQUITY: { value: new D(0), matured: new D(0) },
      GOLD: { value: new D(0), matured: new D(0) },
    };

    for (const h of holdings) {
      const qty = new D(h.quantity);
      const price = new D(h.currentPrice);
      const curValue = qty.mul(price);
      const matured = new D(h.maturedAmount || "0");

      if (assetClassMap[h.assetClass]) {
        assetClassMap[h.assetClass].value =
          assetClassMap[h.assetClass].value.plus(curValue);
        assetClassMap[h.assetClass].matured =
          assetClassMap[h.assetClass].matured.plus(matured);
      }
    }

    const assetClasses: AssetClassValuation[] = (
      Object.keys(assetClassMap) as AssetClassType[]
    )
      .filter((ac) => assetClassMap[ac].value.gt(0) || assetClassMap[ac].matured.gt(0))
      .map((ac) => {
        const val = assetClassMap[ac].value;
        const weightPct = totalVal.gt(0)
          ? val.div(totalVal).mul(100).toFixed(2)
          : "0.00";
        return {
          assetClass: ac,
          value: val.toFixed(0),
          weightPercent: weightPct,
          maturedAmount: assetClassMap[ac].matured.toFixed(0),
        };
      });

    const totalGainLoss = totalVal.minus(totalCostVal);
    const totalGainLossPct = totalCostVal.gt(0)
      ? totalGainLoss.div(totalCostVal).mul(100).toFixed(2)
      : "0.00";

    return {
      userId,
      asOfDate,
      totalValue: totalVal.toFixed(0),
      totalCost: totalCostVal.toFixed(0),
      totalUnrealizedGainLoss: totalGainLoss.toFixed(0),
      totalUnrealizedGainLossPercent: totalGainLossPct,
      holdings: holdingsValuations,
      assetClasses,
    };
  }

  /**
   * Giám sát độ lệch tỷ trọng (Drift Monitoring) và đề xuất tái cân bằng (Rebalancing)
   */
  monitorPortfolioDrift(params: {
    userId: string;
    holdings: UserHoldingItem[];
    targets: TargetAllocationItem[];
    driftThresholdPercent?: string;
    newContribution?: string;
    month?: string;
    retirementMonth?: string;
    policyVersionId?: string;
    templateId?: string;
    costPercent?: string;
  }): DriftMonitoringResult {
    const {
      userId,
      holdings,
      targets,
      driftThresholdPercent = "5.0",
      newContribution = "0",
      month = new Date().toISOString().slice(0, 7),
      retirementMonth = "2045-01",
      policyVersionId = "00000000-0000-0000-0000-000000000000",
      templateId = "BALANCED",
      costPercent = "0.15",
    } = params;

    const summary = this.calculateHoldingsValuation(holdings);
    const totalPortfolioValue = summary.totalValue;

    const targetMap = new Map<string, InstanceType<typeof D>>();
    for (const t of targets) {
      targetMap.set(t.assetClass, new D(t.weightPercent));
    }

    const currentMap = new Map<string, InstanceType<typeof D>>();
    for (const ac of summary.assetClasses) {
      currentMap.set(ac.assetClass, new D(ac.weightPercent));
    }

    // Tập hợp tất cả các Asset Class từ cả targets và current holdings
    const allAssetClasses = Array.from(
      new Set([...Array.from(targetMap.keys()), ...Array.from(currentMap.keys())]),
    );

    const threshold = new D(driftThresholdPercent);
    let maxDrift = new D(0);
    const drifts: DriftItem[] = [];

    for (const ac of allAssetClasses) {
      const curWeight = currentMap.get(ac) ?? new D(0);
      const tgtWeight = targetMap.get(ac) ?? new D(0);
      const diff = curWeight.minus(tgtWeight);
      const absDiff = diff.abs();

      if (absDiff.gt(maxDrift)) {
        maxDrift = absDiff;
      }

      let status: DriftItem["status"] = "IN_TOLERANCE";
      if (diff.gt(threshold)) {
        status = "OVERWEIGHT";
      } else if (diff.lt(threshold.neg())) {
        status = "UNDERWEIGHT";
      }

      drifts.push({
        assetClass: ac,
        currentWeightPercent: curWeight.toFixed(2),
        targetWeightPercent: tgtWeight.toFixed(2),
        driftPercent: diff.toFixed(2),
        status,
      });
    }

    const isDrifted = maxDrift.gt(threshold);

    // Chuẩn bị đầu vào tái cân bằng cash-first nếu bị lệch hoặc có dòng tiền mới
    let rebalanceRecommendation: DriftMonitoringResult["rebalanceRecommendation"] = null;

    if (new D(totalPortfolioValue).gt(0)) {
      try {
        const rebalanceInputHoldings = targets.map((t) => {
          const matched = summary.assetClasses.find((ac) => ac.assetClass === t.assetClass);
          return {
            assetClass: t.assetClass,
            value: matched ? matched.value : "0",
            maturedAmount: matched ? matched.maturedAmount : "0",
          };
        });

        const targetAllocations: Allocation[] = targets.map((t) => ({
          assetClass: t.assetClass,
          weightPercent: t.weightPercent,
        }));

        const rebalanceOutput = proposeRebalance(
          {
            policyVersionId,
            templateId,
            month,
            retirementMonth,
            holdings: rebalanceInputHoldings,
            newContribution,
          },
          targetAllocations,
          driftThresholdPercent,
          costPercent,
        );

        if (rebalanceOutput.status === "PROPOSED") {
          rebalanceRecommendation = {
            status: "PROPOSED",
            costEstimated: rebalanceOutput.cost,
            trades: rebalanceOutput.trades,
            cashUsedBeforeTrades: rebalanceOutput.cashUsedBeforeTrades,
            unallocatedCash: "0",
          };
        } else if (rebalanceOutput.status === "WITHIN_BAND") {
          rebalanceRecommendation = {
            status: "NO_ACTION",
            costEstimated: "0",
            trades: [],
            cashUsedBeforeTrades: "0",
            unallocatedCash: rebalanceOutput.unallocatedNewContribution,
          };
        } else {
          rebalanceRecommendation = {
            status: "REVIEW_REQUIRED",
            costEstimated: "0",
            trades: [],
            cashUsedBeforeTrades: "0",
            unallocatedCash: newContribution,
          };
        }
      } catch {
        rebalanceRecommendation = null;
      }
    }

    return {
      userId,
      asOfDate: summary.asOfDate,
      totalPortfolioValue,
      isDrifted,
      maxDriftPercent: maxDrift.toFixed(2),
      driftThresholdPercent,
      drifts,
      rebalanceRequired: isDrifted,
      rebalanceRecommendation,
      regulatoryDisclaimer: REGULATORY_MONITORING_DISCLAIMER,
    };
  }

  /**
   * Chuyển đổi đề xuất tái cân bằng theo Asset Class thành lệnh giao dịch sản phẩm cụ thể
   * Tự động làm tròn theo quy định lô giao dịch (lô 100 HoSE cho ETF/cổ phiếu, lô 1 cho quỹ mở).
   */
  generateProductLevelRebalanceOrders(params: {
    trades: Array<{
      assetClass: string;
      buy: string;
      sell: string;
    }>;
    holdings: UserHoldingItem[];
    targetProducts: Array<{
      productId: string;
      productCode: string;
      productName: string;
      assetClass: AssetClassType;
      currentPrice: string;
      lotSize: number;
    }>;
  }) {
    const orders: Array<{
      productId: string;
      productCode: string;
      productName: string;
      assetClass: AssetClassType;
      action: "BUY" | "SELL";
      units: number;
      estimatedPrice: string;
      estimatedAmount: string;
      lotSize: number;
      rationale: string;
    }> = [];

    for (const trade of params.trades) {
      const buyVnd = new D(trade.buy);
      const sellVnd = new D(trade.sell);

      if (buyVnd.gt(0)) {
        // Tìm sản phẩm mục tiêu trong nhóm tài sản cần MUA
        const candidate = params.targetProducts.find(
          (p) => p.assetClass === trade.assetClass,
        );
        if (candidate) {
          const price = new D(candidate.currentPrice);
          if (price.gt(0)) {
            const rawUnits = buyVnd.div(price).toNumber();
            const lot = candidate.lotSize || 1;
            const roundUnits =
              lot > 1 ? Math.floor(rawUnits / lot) * lot : Math.floor(rawUnits);

            if (roundUnits > 0) {
              const amount = new D(roundUnits).mul(price).toFixed(0);
              orders.push({
                productId: candidate.productId,
                productCode: candidate.productCode,
                productName: candidate.productName,
                assetClass: candidate.assetClass,
                action: "BUY",
                units: roundUnits,
                estimatedPrice: candidate.currentPrice,
                estimatedAmount: amount,
                lotSize: lot,
                rationale: `Tái cân bằng nhóm ${trade.assetClass}: Mua bổ sung đưa tỷ trọng về mức phân bổ tối ưu.`,
              });
            }
          }
        }
      }

      if (sellVnd.gt(0)) {
        // Tìm sản phẩm hiện có trong nhóm tài sản cần BÁN
        const existingHoldings = params.holdings.filter(
          (h) => h.assetClass === trade.assetClass,
        );
        let remainingSellVnd = sellVnd;

        for (const h of existingHoldings) {
          if (remainingSellVnd.lte(0)) break;
          const price = new D(h.currentPrice);
          if (price.gt(0)) {
            const hVal = new D(h.quantity).mul(price);
            const sellAmount = D.min(remainingSellVnd, hVal);
            const rawUnits = sellAmount.div(price).toNumber();
            const candidate = params.targetProducts.find((p) => p.productId === h.productId);
            const lot = candidate?.lotSize ?? 1;
            const roundUnits =
              lot > 1 ? Math.floor(rawUnits / lot) * lot : Math.floor(rawUnits);

            if (roundUnits > 0) {
              const amount = new D(roundUnits).mul(price).toFixed(0);
              remainingSellVnd = remainingSellVnd.minus(amount);
              orders.push({
                productId: h.productId,
                productCode: h.productCode,
                productName: h.productName,
                assetClass: h.assetClass,
                action: "SELL",
                units: roundUnits,
                estimatedPrice: h.currentPrice,
                estimatedAmount: amount,
                lotSize: lot,
                rationale: `Tái cân bằng nhóm ${trade.assetClass}: Bán bớt lượng nắm giữ vượt tỷ trọng mục tiêu để hiện thực hóa phân bổ.`,
              });
            }
          }
        }
      }
    }

    return {
      orders,
      regulatoryDisclaimer: REGULATORY_MONITORING_DISCLAIMER,
    };
  }
}
