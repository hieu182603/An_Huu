import { assumptionDocumentSchema, type AssumptionDocument } from "../modules/assumptions/schema";

export function assumptionFixture(): AssumptionDocument {
  return assumptionDocumentSchema.parse({ schemaVersion: 2, title: "Fixture annual assumptions", currency: "VND",
    effectiveFrom: "2026-10-04", projectionStartYear: 2026, projectionEndYear: 2028,
    sources: [
      { id: "HISTORY", kind: "HISTORICAL_OFFICIAL", title: "Fixture official CPI", publisher: "Fixture statistics", url: "https://example.invalid/history", release: "fixture-2025", publishedOn: "2026-01-01", retrievedOn: "2026-10-01", fromYear: 2025, toYear: 2025, note: "Test data only, not official figures" },
      { id: "FORECAST", kind: "FORECAST", title: "Fixture forecast", publisher: "Fixture forecaster", url: "https://example.invalid/forecast", release: "fixture-2026", publishedOn: "2026-09-01", retrievedOn: "2026-10-01", fromYear: 2026, toYear: 2027, note: "Test data only, not a real forecast" },
      { id: "LONG", kind: "AN_HUU_LONG_TERM", title: "Fixture long term policy", publisher: "An Huu fixture", url: "https://example.invalid/policy", release: "fixture-policy", publishedOn: "2026-09-01", retrievedOn: "2026-10-01", fromYear: 2028, toYear: 2028, note: "Internal assumption; never attributed to IMF" },
      { id: "RETURNS", kind: "ASSET_RESEARCH", title: "Fixture asset research", publisher: "Fixture researcher", url: "https://example.invalid/returns", release: "fixture-assets", publishedOn: "2026-09-01", retrievedOn: "2026-10-01", fromYear: 2026, toYear: 2028, note: "Test data only, not investment advice" },
    ], historicalCpi: [{ year: 2025, percent: "90", sourceId: "HISTORY", measure: "ANNUAL_AVERAGE_CHANGE" }],
    inflation: [2026, 2027, 2028].map((year, i) => ({ year, percent: ["0", "4", "3"][i], sourceId: year < 2028 ? "FORECAST" : "LONG",
      kind: year < 2028 ? "FORECAST" : "LONG_TERM", rateType: "EFFECTIVE_ANNUAL", priceBasis: "NOMINAL", conversionNote: "Approved fixture conversion to planning effective annual rate" })),
    assetClasses: [{ code: "BOND", label: "Fixture bond", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] }],
    returns: [2026, 2027, 2028].map((year, i) => ({ year, assetClass: "BOND", horizonId: "ALL", sourceId: "RETURNS", rate: { type: "EFFECTIVE_ANNUAL", percent: ["0", "10", "6"][i] },
      priceBasis: "NOMINAL", fees: { treatment: "INCLUDED", evidence: "Fixture explicitly net of fees" }, taxes: { treatment: "INCLUDED", evidence: "Fixture explicitly net of taxes" } })),
    reason: "Fixture verification only; never publish these figures outside rollback" });
}
export const seriesFixture = { versionId: "00000000-0000-4000-8000-000000000001", startMonth: "2026-12", endMonth: "2028-01", assetClass: "BOND", horizonMonths: 120 };
