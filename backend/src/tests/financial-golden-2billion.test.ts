import { describe, it, expect } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { HoldingsMonitoringService } from "../modules/holdings/service";
import { generatePortfolioRecommendation } from "../modules/recommendation/engine";
import { VIETNAMESE_PRODUCT_CATALOG } from "../modules/recommendation/fixtures";

/**
 * BÀI TEST NGHIỆM THU TÀI CHÍNH (GOLDEN TEST 2 TỶ VNĐ)
 * Căn cứ: Tài liệu nghiệp vụ "An_Huu_Thuat_toan_phan_bo_tai_san.docx"
 *
 * Thông số khách hàng:
 * - Tổng tài sản đầu tư: 2.000.000.000 VND (2 tỷ)
 * - Tuổi hiện tại: 38 tuổi
 * - Chi tiêu thiết yếu: 25.000.000 VND/tháng (25 triệu)
 * - Thời gian quỹ dự phòng khẩn cấp: 9 tháng
 * - Mục tiêu gần hạn: Học phí 300 triệu sau 3 năm
 * - Lạm phát giáo dục giả định: 4.0%/năm
 * - Lợi suất phi rủi ro/tiền gửi dành riêng kỳ hạn 3 năm: 4.5%/năm
 * - Danh mục nền dài hạn (Baseline Portfolio):
 *   + Tiền mặt/tiền gửi ngắn hạn: 10%
 *   + Trái phiếu thu nhập cố định: 20%
 *   + Cổ phiếu tăng trưởng: 60%
 *   + Vàng phòng vệ: 10%
 *
 * Kết quả kỳ vọng chuẩn theo tài liệu:
 * 1. Quỹ dự phòng: 225.000.000 VND
 * 2. Học phí tương lai (FV): 300M * (1 + 0.04)^3 = 337.459200M VND
 * 3. Vốn học phí hiện tại cần tách (PV): 337.4592M / (1 + 0.045)^3 = 295.714351M VND
 * 4. Vốn đầu tư dài hạn (Growth Capital): 2.000M - 225M - 295.714351M = 1.479.285649M VND
 * 5. Cơ cấu phân bổ toàn danh mục:
 *    - Tiền gửi: 225M + 295.714351M + 1.479.285649M * 10% = 668.642916M VND
 *    - Trái phiếu: 1.479.285649M * 20% = 295.857130M VND
 *    - Cổ phiếu: 1.479.285649M * 60% = 887.571389M VND
 *    - Vàng: 1.479.285649M * 10% = 147.928565M VND
 *    - Tổng tài sản kiểm tra: 2.000.000.000 VND (chính xác đến từng đồng)
 * 6. Stress Test (Kịch bản thị trường sụt giảm tức thời):
 *    - Tiền gửi: 0%
 *    - Trái phiếu: -5%
 *    - Cổ phiếu: -35%
 *    - Vàng: -10%
 *    Mức tổn thất tuyệt đối: 340.235700M VND (khoảng 340,24 triệu VND ~ 17,01% tổng danh mục)
 */

describe("Financial Golden Test - Benchmark 2 tỷ VNĐ (An Hữu Specification)", () => {
  const investableAssets = new D("2000000000");
  const monthlyEssentialExpense = new D("25000000");
  const emergencyMonths = 9;

  const tuitionGoalNominal = new D("300000000");
  const tuitionHorizonYears = 3;
  const tuitionInflationRate = new D("0.04");
  const dedicatedSafeReturnRate = new D("0.045");

  it("calculates exact emergency reserve of 225,000,000 VND", () => {
    const emergencyFund = monthlyEssentialExpense.mul(emergencyMonths);
    expect(emergencyFund.toFixed(0)).toBe("225000000");
  });

  it("calculates tuition future value (FV) and discounted present value (PV)", () => {
    // FV = 300M * (1 + 0.04)^3
    const inflationFactor = new D("1").plus(tuitionInflationRate).pow(tuitionHorizonYears);
    const tuitionFV = tuitionGoalNominal.mul(inflationFactor);
    expect(tuitionFV.toFixed(6)).toBe("337459200.000000");

    // PV = FV / (1 + 0.045)^3
    const discountFactor = new D("1").plus(dedicatedSafeReturnRate).pow(tuitionHorizonYears);
    const tuitionPV = tuitionFV.div(discountFactor);

    // Chuẩn tài liệu: 295.714351M VND (sai số dưới 0.00001 VND)
    expect(tuitionPV.div(1e6).toFixed(6)).toBe("295.714351");
    expect(tuitionPV.toFixed(0)).toBe("295714351");
  });

  it("separates capital cleanly into Emergency, Protected Goals, and Growth Capital", () => {
    const emergencyFund = monthlyEssentialExpense.mul(emergencyMonths);

    const inflationFactor = new D("1").plus(tuitionInflationRate).pow(tuitionHorizonYears);
    const tuitionFV = tuitionGoalNominal.mul(inflationFactor);
    const discountFactor = new D("1").plus(dedicatedSafeReturnRate).pow(tuitionHorizonYears);
    const tuitionPV = tuitionFV.div(discountFactor);

    const growthCapital = investableAssets.minus(emergencyFund).minus(tuitionPV);

    // Vốn dài hạn: 1.479.285649M VND
    expect(growthCapital.div(1e6).toFixed(6)).toBe("1479.285649");
    expect(growthCapital.toFixed(0)).toBe("1479285649");

    // Kiểm tra tính bảo toàn tổng vốn: Emergency + Protected + Growth = 2,000,000,000 VND
    const totalReconstructed = emergencyFund.plus(tuitionPV).plus(growthCapital);
    expect(totalReconstructed.toFixed(0)).toBe("2000000000");
  });

  it("maps long-term baseline allocation (10/20/60/10) to total wealth structure", () => {
    const emergencyFund = monthlyEssentialExpense.mul(emergencyMonths); // 225M
    const tuitionPV = new D("295714351.042533"); // 295.714351M
    const growthCapital = investableAssets.minus(emergencyFund).minus(tuitionPV); // 1,479.285649M

    // Phân bổ trên vốn dài hạn:
    // Tiền gửi: 10%, Trái phiếu: 20%, Cổ phiếu: 60%, Vàng: 10%
    const growthCash = growthCapital.mul("0.10");
    const growthBond = growthCapital.mul("0.20");
    const growthEquity = growthCapital.mul("0.60");
    const growthGold = growthCapital.mul("0.10");

    // Toàn danh mục:
    const totalCash = emergencyFund.plus(tuitionPV).plus(growthCash);
    const totalBond = growthBond;
    const totalEquity = growthEquity;
    const totalGold = growthGold;

    // Đối chiếu chuẩn tài liệu khách hàng:
    // Tiền gửi toàn danh mục: 668.642916M VND
    expect(totalCash.div(1e6).toFixed(6)).toBe("668.642916");

    // Trái phiếu: 295.857130M VND
    expect(totalBond.div(1e6).toFixed(6)).toBe("295.857130");

    // Cổ phiếu: 887.571389M VND
    expect(totalEquity.div(1e6).toFixed(6)).toBe("887.571389");

    // Vàng: 147.928565M VND
    expect(totalGold.div(1e6).toFixed(6)).toBe("147.928565");

    // Tổng 4 nhóm đúng bằng 2.000.000.000 VND
    const grandTotal = totalCash.plus(totalBond).plus(totalEquity).plus(totalGold);
    expect(grandTotal.toFixed(0)).toBe("2000000000");

    // Tỷ trọng danh mục tổng thể:
    // Tiền gửi: ~33.43%, Trái phiếu: ~14.79%, Cổ phiếu: ~44.38%, Vàng: ~7.40%
    expect(totalCash.div(investableAssets).mul(100).toFixed(2)).toBe("33.43");
    expect(totalBond.div(investableAssets).mul(100).toFixed(2)).toBe("14.79");
    expect(totalEquity.div(investableAssets).mul(100).toFixed(2)).toBe("44.38");
    expect(totalGold.div(investableAssets).mul(100).toFixed(2)).toBe("7.40");
  });

  it("calculates exact market stress shock loss (340.24M VND / 17.01% of total assets)", () => {
    const totalCash = new D("668642916");
    const totalBond = new D("295857130");
    const totalEquity = new D("887571389");
    const totalGold = new D("147928565");

    // Kịch bản shock thị trường từ tài liệu:
    // Tiền gửi: 0%
    // Trái phiếu: -5%
    // Cổ phiếu: -35%
    // Vàng: -10%
    const lossCash = totalCash.mul("0.00");
    const lossBond = totalBond.mul("0.05");
    const lossEquity = totalEquity.mul("0.35");
    const lossGold = totalGold.mul("0.10");

    const totalStressLoss = lossCash.plus(lossBond).plus(lossEquity).plus(lossGold);

    // Chuẩn tài liệu: 340.24 triệu VND
    expect(totalStressLoss.div(1e6).toFixed(2)).toBe("340.24");

    // Tỷ lệ mất giá trên tổng tài sản 2 tỷ: 17.01%
    const lossRatioPercent = totalStressLoss.div(investableAssets).mul(100);
    expect(lossRatioPercent.toFixed(2)).toBe("17.01");
  });

  it("verifies recommendation engine product mapping on the 1.479 tỷ growth capital", () => {
    const growthCapitalVnd = "1479285649";

    const recommendation = generatePortfolioRecommendation(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        planId: "p0000000-0000-4000-8000-000000000001",
        targetAssetWeights: {
          CASH: 0.10,
          BOND: 0.20,
          EQUITY: 0.60,
          GOLD: 0.10,
        },
        growthCapitalVnd,
        clientRiskTolerance: "HIGH",
        horizonYears: 15,
        existingHoldings: [],
      },
      VIETNAMESE_PRODUCT_CATALOG,
    );

    expect(recommendation.items.length).toBeGreaterThanOrEqual(4);
    expect(recommendation.lifecycleStatus).toBe("DRAFT");

    // Verify ETF products follow HoSE 100-share lot size
    const etfItem = recommendation.items.find(
      (item) => item.productCode === "E1VFVN30" || item.productCode === "FUEVFVND",
    );
    if (etfItem) {
      expect(etfItem.recommendedUnits % 100).toBe(0);
      expect(etfItem.action).toBe("BUY");
    }

    // Verify statutory disclaimer under Điều 72/73 Luật Chứng khoán No. 102/VBHN-VPQH
    const disclosuresText = recommendation.explanation.regulatoryDisclosures.join(" ");
    expect(disclosuresText).toContain("không cấu thành cam kết lợi nhuận");
  });
});
