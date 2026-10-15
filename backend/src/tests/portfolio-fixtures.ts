import { dimensions, portfolioDocumentV1Schema, portfolioDocumentV2Schema, type PortfolioPreview } from "../modules/portfolios/schema";
import { assumptionFixture } from "./assumptions-fixtures";
export function portfolioAssumptionsFixture() {
  const data = assumptionFixture();
  data.assetClasses.push({ code: "STOCK", label: "Fixture stock", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] });
  data.returns.push(...data.returns.map(row => ({ ...row, assetClass: "STOCK", rate: { type: "EFFECTIVE_ANNUAL" as const, percent: "12.6825030131" } })));
  // 12.6825030131% is a fixture approximating 1%/month, never a production rate.
  return data;
}
export function portfolioFixture(assumptionVersionId = "00000000-0000-4000-8000-000000000001") {
  return portfolioDocumentV1Schema.parse({ schemaVersion: 1, title: "Fixture portfolio policy", reason: "Testing only; do not publish to production", effectiveFrom: "2026-10-04", assumptionVersionId,
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
/** Same questions/bands/scenarios, but retirement-anchored glide paths (schema v2). */
export function glidePortfolioFixture(assumptionVersionId?: string) {
  const { templates, rules, ...rest } = portfolioFixture(assumptionVersionId);
  return portfolioDocumentV2Schema.parse({ ...rest, schemaVersion: 2,
    templates: templates.map(t => ({ id: t.id, label: t.label, rebalance: t.rebalance, glidePath: { anchor: "RETIREMENT_MONTH",
      interpolation: "LINEAR_BY_WHOLE_YEARS_TO_ANCHOR", afterAnchor: "HOLD_ZERO_YEAR_POINT",
      points: [[10, "80"], [5, "50"], [0, "0"]].map(([yearsToAnchor, stock]) => ({ yearsToAnchor,
        allocations: [{ assetClass: "BOND", weightPercent: String(100 - Number(stock)) }, { assetClass: "STOCK", weightPercent: stock }] })) } })),
    rules: rules.map(r => ({ ...r, horizon: { min: 1, max: 1200 } })),
  });
}
export function portfolioCommand(policyVersionId = "00000000-0000-4000-8000-000000000002", high = true): PortfolioPreview {
  return { policyVersionId, startMonth: "2026-10", horizonMonths: 12, liquidityNeedMonths: 24,
    answers: dimensions.map(d => ({ questionId: d, choiceId: high ? "HIGH" : "LOW" })) };
}
