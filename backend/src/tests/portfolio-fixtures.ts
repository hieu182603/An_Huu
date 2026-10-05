import { dimensions, portfolioDocumentSchema, type PortfolioPreview } from "../modules/portfolios/schema";
import { assumptionFixture } from "./assumptions-fixtures";
export function portfolioAssumptionsFixture() {
  const data = assumptionFixture();
  data.assetClasses.push({ code: "STOCK", label: "Fixture stock", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] });
  data.returns.push(...data.returns.map(row => ({ ...row, assetClass: "STOCK", rate: { type: "EFFECTIVE_ANNUAL" as const, percent: "12.6825030131" } })));
  // 12.6825030131% is a fixture approximating 1%/month, never a production rate.
  return data;
}
export function portfolioFixture(assumptionVersionId = "00000000-0000-4000-8000-000000000001") {
  return portfolioDocumentSchema.parse({ schemaVersion: 1, title: "Fixture portfolio policy", reason: "Testing only; do not publish to production", effectiveFrom: "2026-10-04", assumptionVersionId,
    source: { title: "Fixture review source", url: "https://example.invalid/policy", release: "fixture-v1", reviewedOn: "2026-10-01" },
    questions: dimensions.map(d => ({ id: d, dimension: d, prompt: "Fixture question " + d,
      choices: [{ id: "LOW", label: "Fixture low choice", score: 0 }, { id: "HIGH", label: "Fixture high choice", score: 10 }] })),
    riskBands: [{ id: "ALL", label: "Fixture aggregate range", minScore: 0, maxScore: 60 }],
    templates: ["CAUTIOUS", "GROWTH"].map(id => ({ id, label: "Fixture " + id, coverageMonths: 120,
      rebalance: { everyMonths: 3, timing: "START_OF_MONTH", turnoverCostPercent: "0", costConvention: "HALF_L1_TURNOVER_TIMES_COST", evidence: "Fixture explicitly zero incremental turnover cost; not real advice" },
      schedule: [{ fromIndex: 1, toIndex: 120, allocations: [{ assetClass: "BOND", weightPercent: id === "CAUTIOUS" ? "100" : "50" }, { assetClass: "STOCK", weightPercent: id === "CAUTIOUS" ? "0" : "50" }] }],
    })),
    rules: ["CAUTIOUS", "GROWTH"].map(id => ({ id, templateId: id, riskBandIds: ["ALL"], explanation: "Fixture policy requires confirmed loss tolerance and liquidity", horizon: { min: 1, max: 120 },
      liquidityNeed: { min: id === "GROWTH" ? 12 : 0, max: 1200 },
      dimensions: Object.fromEntries(dimensions.map(d => [d, { min: d === "LOSS_TOLERANCE" && id === "GROWTH" ? 10 : 0, max: d === "LOSS_TOLERANCE" && id === "CAUTIOUS" ? 0 : 10 }])),
    })),
    scenarios: ["BASE", "ADVERSE", "FAVORABLE"].map(kind => ({ kind, label: "Fixture " + kind, evidence: "Fixture approved delta values, not economic predictions", convention: "DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES",
      years: [2026, 2027, 2028].map(year => ({ year, inflationDeltaPoints: kind === "BASE" ? "0" : kind === "ADVERSE" ? "1" : "-1",
        returns: ["BOND", "STOCK"].map(assetClass => ({ assetClass, deltaPoints: kind === "BASE" ? "0" : kind === "ADVERSE" ? "-2" : "2" })) })),
    })),
  });
}
export function portfolioCommand(policyVersionId = "00000000-0000-4000-8000-000000000002", high = true): PortfolioPreview {
  return { policyVersionId, startMonth: "2026-10", horizonMonths: 12, liquidityNeedMonths: 24,
    answers: dimensions.map(d => ({ questionId: d, choiceId: high ? "HIGH" : "LOW" })) };
}
