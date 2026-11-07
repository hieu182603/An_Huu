import { recommendationContentHash } from "../modules/recommendation/engine";
import { describe, expect, it } from "vitest";
import { VIETNAMESE_PRODUCT_CATALOG } from "../modules/recommendation/fixtures";
import { filterEligibleProducts } from "../modules/recommendation/eligibility";
import { scoreProduct } from "../modules/recommendation/scoring";
import {
  generatePortfolioRecommendation,
  RecommendationApprovalManager,
  MANDATORY_LEGAL_DISCLAIMERS,
} from "../modules/recommendation/engine";
import type { RecommendationRequest } from "../modules/recommendation/types";

describe("Milestone 3 — Investment Product Recommendation Advisory Engine", () => {
  describe("Feature F12: Product Eligibility Filter", () => {
    it("excludes products that exceed client risk tolerance", () => {
      const { eligible, excluded } = filterEligibleProducts(VIETNAMESE_PRODUCT_CATALOG, {
        clientRiskTolerance: "LOW", // Conservative client
        availableCapitalVnd: "500000000",
        horizonYears: 10,
      });

      // LOW risk tolerance should NOT receive HIGH risk products (e.g. Equity ETFs)
      const highRiskEligible = eligible.filter(p => p.riskLevel === "HIGH");
      expect(highRiskEligible.length).toBe(0);

      // Verify that E1VFVN30 is in excluded list with clear explanation
      const vn30Excluded = excluded.find(e => e.product.code === "E1VFVN30_ETF");
      expect(vn30Excluded).toBeDefined();
      expect(vn30Excluded?.reason).toContain("vượt quá khẩu vị rủi ro");
    });

    it("excludes products when minimum investment exceeds available capital", () => {
      const { eligible, excluded } = filterEligibleProducts(VIETNAMESE_PRODUCT_CATALOG, {
        clientRiskTolerance: "HIGH",
        availableCapitalVnd: "10000000", // 10 Million VND available
        horizonYears: 10,
      });

      // SJC 1L gold requires 88.5M VND minimum -> must be excluded!
      const sjc1L = eligible.find(p => p.code === "SJC_GOLD_1L");
      expect(sjc1L).toBeUndefined();

      const sjcExcluded = excluded.find(e => e.product.code === "SJC_GOLD_1L");
      expect(sjcExcluded).toBeDefined();
      expect(sjcExcluded?.reason).toContain("vượt quá ngân sách khả dụng");

      // But PNJ 1 chi gold (8.85M) is <= 10M -> must be eligible!
      const pnj1C = eligible.find(p => p.code === "PNJ_GOLD_1C");
      expect(pnj1C).toBeDefined();
    });

    it("excludes inactive or non-permitted products", () => {
      const modifiedCatalog = [
        ...VIETNAMESE_PRODUCT_CATALOG,
        {
          ...VIETNAMESE_PRODUCT_CATALOG[0],
          id: "PROD-LOCKED-01",
          code: "LOCKED_DEPOSIT",
          status: "INACTIVE" as const,
        },
        {
          ...VIETNAMESE_PRODUCT_CATALOG[1],
          id: "PROD-UNPERMITTED-02",
          code: "UNPERMITTED_FUND",
          isDistributionPermitted: false,
        },
      ];

      const { eligible, excluded } = filterEligibleProducts(modifiedCatalog, {
        clientRiskTolerance: "HIGH",
        availableCapitalVnd: "500000000",
        horizonYears: 10,
      });

      expect(eligible.some(p => p.code === "LOCKED_DEPOSIT")).toBe(false);
      expect(eligible.some(p => p.code === "UNPERMITTED_FUND")).toBe(false);
      expect(excluded.some(e => e.product.code === "LOCKED_DEPOSIT")).toBe(true);
      expect(excluded.some(e => e.product.code === "UNPERMITTED_FUND")).toBe(true);
    });
  });

  describe("Feature F13: Multi-Asset Product Scoring", () => {
    it("scores Equity ETFs favoring lowest TER and tracking error (REQ-02 compliance)", () => {
      const vn30 = VIETNAMESE_PRODUCT_CATALOG.find(p => p.code === "E1VFVN30_ETF")!;
      const veof = VIETNAMESE_PRODUCT_CATALOG.find(p => p.code === "VEOF_EQUITY_FUND")!;

      const scoreVN30 = scoreProduct(vn30, 15);
      const scoreVEOF = scoreProduct(veof, 15);

      // Low TER ETF (0.65%) should have higher costScore and totalScore than active fund (1.75%)
      expect(scoreVN30.costScore).toBeGreaterThan(scoreVEOF.costScore);
      expect(scoreVN30.totalScore).toBeGreaterThan(scoreVEOF.totalScore);
      expect(scoreVN30.rationale.length).toBeGreaterThan(0);
    });

    it("scores Bond Funds rewarding government bonds with highest credit score", () => {
      const vgb = VIETNAMESE_PRODUCT_CATALOG.find(p => p.code === "VGB_10Y_BOND")!;
      const tcbf = VIETNAMESE_PRODUCT_CATALOG.find(p => p.code === "TCBF_BOND_FUND")!;

      const scoreVGB = scoreProduct(vgb, 10);
      const scoreTCBF = scoreProduct(tcbf, 10);

      expect(scoreVGB.totalScore).toBeGreaterThan(0);
      expect(scoreTCBF.totalScore).toBeGreaterThan(0);
      expect(scoreVGB.rationale.some(r => r.includes("Chính phủ"))).toBe(true);
    });
  });

  describe("Feature F14, F15 & F23: Portfolio-to-Product Mapping & Recommendation Delivery", () => {
    it("maps 1.479 Billion VND growth capital across target weights with HoSE lot sizes", () => {
      const request: RecommendationRequest = {
        userId: "USER-GOLDEN-01",
        planId: "PLAN-RETIREMENT-2026",
        growthCapitalVnd: "1479285649", // Golden customer growth capital (1,479,285,649 VND)
        targetAssetWeights: {
          CASH: 0.10, // 10% Cash = 147.928M
          BOND: 0.20, // 20% Bond = 295.857M
          EQUITY: 0.60, // 60% Equity = 887.571M
          GOLD: 0.10, // 10% Gold = 147.928M
        },
        clientRiskTolerance: "HIGH",
        horizonYears: 15,
        existingHoldings: [
          {
            productId: "PROD-E1VFVN30",
            assetClass: "EQUITY",
            quantity: 5000, // User already owns 5,000 units
            costBasisVnd: "22000",
            currentNav: "24500",
          },
        ],
      };

      const response = generatePortfolioRecommendation(request, VIETNAMESE_PRODUCT_CATALOG);

      expect(response.lifecycleStatus).toBe("DRAFT");
      expect(response.userId).toBe(request.userId);
      expect(response.items.length).toBeGreaterThanOrEqual(4);

      // Verify HoSE lot sizes (multiples of 100) for Equity ETFs
      for (const item of response.items) {
        if (item.assetClass === "EQUITY" && item.category === "EQUITY_ETF") {
          expect(item.recommendedUnits % 100).toBe(0); // Must be multiple of 100!
          expect(item.recommendedUnits).toBeGreaterThan(0);
        }
        expect(Number(item.recommendedAmountVnd)).toBeGreaterThan(0);
        expect(Number(item.estimatedAnnualFeeVnd)).toBeGreaterThanOrEqual(0);
        expect(item.rationale.length).toBeGreaterThan(0);
      }

      // Verify incremental action for existing holding (PROD-E1VFVN30)
      const vn30Item = response.items.find(i => i.productId === "PROD-E1VFVN30");
      expect(vn30Item).toBeDefined();
      expect(vn30Item?.currentAmountVnd).toBe((5000 * 24500).toString());
      expect(vn30Item?.action).toBe("BUY"); // Target is larger than 5,000 units

      // Verify disclosures without claiming legal authorization. No. 102/VBHN-VPQH
      expect(response.explanation.regulatoryDisclosures).toEqual(MANDATORY_LEGAL_DISCLAIMERS);
      expect(response.explanation.regulatoryDisclosures[0]).toContain("không cấu thành cam kết lợi nhuận");
      expect(response.explanation.regulatoryDisclosures[1]).toContain("không nhận lưu ký tiền");

      // Verify executive summary
      expect(response.explanation.executiveSummary).toContain("triệu VNĐ");
    });
  });

  describe("Feature F16 & F21: Recommendation Approval Lifecycle & Governance", () => {
    it("executes the complete approval state machine: DRAFT -> SUITABILITY_CHECKED -> PENDING_APPROVAL -> APPROVED -> PUBLISHED", () => {
      const request: RecommendationRequest = {
        userId: "USER-APPROVAL-TEST",
        planId: "PLAN-001",
        growthCapitalVnd: "500000000",
        targetAssetWeights: { CASH: 0.25, BOND: 0.25, EQUITY: 0.25, GOLD: 0.25 },
        clientRiskTolerance: "MEDIUM",
        horizonYears: 10,
      };

      // 1. Initial creation -> DRAFT
      let rec = generatePortfolioRecommendation(request, VIETNAMESE_PRODUCT_CATALOG);
      expect(rec.lifecycleStatus).toBe("DRAFT");

      // 2. Suitability check -> SUITABILITY_CHECKED
      rec = RecommendationApprovalManager.markDataValidated(rec);
      rec = RecommendationApprovalManager.markSuitabilityChecked(rec);
      expect(rec.lifecycleStatus).toBe("SUITABILITY_CHECKED");

      // 3. Submit for approval -> PENDING_APPROVAL
      rec = RecommendationApprovalManager.submitForApproval(rec);
      expect(rec.lifecycleStatus).toBe("PENDING_APPROVAL");

      // 4. Unauthorized role attempt to approve -> throws error
      expect(() => {
        RecommendationApprovalManager.approve(rec, "HACKER_USER", "USER");
      }).toThrow(/Access Denied/);

      // 5. Authorized Approver approval -> APPROVED
      rec = RecommendationApprovalManager.approve(rec, "ADVISOR_SENIOR_01", "APPROVER");
      expect(rec.lifecycleStatus).toBe("APPROVED");
      expect(rec.approvedBy).toBe("ADVISOR_SENIOR_01");
      expect(rec.approvedAt).toBeDefined();

      // 6. Publication -> PUBLISHED
      rec = RecommendationApprovalManager.publish(rec, { legalGateEnabled: true, referencesCurrent: true, approverQualified: true, approval: { actorId: rec.approvedBy!, revision: rec.revision, contentHash: recommendationContentHash(rec) } });
      expect(rec.lifecycleStatus).toBe("PUBLISHED");
    });

    it("prevents publishing unapproved recommendations", () => {
      const request: RecommendationRequest = {
        userId: "USER-APPROVAL-TEST-2",
        planId: "PLAN-002",
        growthCapitalVnd: "500000000",
        targetAssetWeights: { CASH: 0.5, BOND: 0.5, EQUITY: 0, GOLD: 0 },
        clientRiskTolerance: "LOW",
        horizonYears: 5,
      };

      const draftRec = generatePortfolioRecommendation(request, VIETNAMESE_PRODUCT_CATALOG);
      expect(draftRec.lifecycleStatus).toBe("DRAFT");

      // Trying to publish a DRAFT recommendation directly must fail!
      expect(() => {
        RecommendationApprovalManager.publish(draftRec);
      }).toThrow(/Cannot publish recommendation with status DRAFT/);
    });
  });
});

