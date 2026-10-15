// Synthetic unit-test fixtures ONLY. Never imported by production modules.
import { addMonths } from "../common/calendar";
import { marketDocumentSchema } from "../modules/allocation-risk/market-schema";
import type { RiskContext } from "../modules/allocation-risk/simulation";
import { retirementCommand } from "./retirement-fixtures";
export function marketFixture() {
  return marketDocumentSchema.parse({ schemaVersion: 1, title: "Synthetic unit-test fixture", reason: "Fixture only, not market history", effectiveFrom: "2020-01-01",
    currency: "VND", unit: "DECIMAL_MONTHLY_TOTAL_RETURN", priceBasis: "NOMINAL", cpiMeasure: "MONTH_ON_MONTH_CHANGE",
    period: { from: "2010-01", to: "2013-12" },
    sources: [{ id: "FIXTURE", title: "Synthetic fixture ONLY", url: "https://example.test/fixture", retrievedOn: "2020-01-01",
      license: "Test fixture, no market data rights asserted", usage: "SIMULATION_AND_DERIVED_OUTPUTS_PERMITTED", evidence: "Test-only data" }],
    assets: ["CASH", "EQUITY", "GOV_BOND", "GOLD"].map(assetClass => ({ assetClass, sourceId: "FIXTURE", totalReturnEvidence: "Synthetic fixture total returns",
      fees: { treatment: "NET", evidence: "Fixture net" }, taxTreatment: "Fixture taxes included" })), cpiSourceId: "FIXTURE",
    quality: { missingValues: "REJECT", imputation: "NONE", reviewNote: "Synthetic test fixture" },
    rows: Array.from({ length: 48 }, (_, i) => ({ month: addMonths("2010-01", i), returns: { CASH: "0", EQUITY: i % 2 ? "0.05" : "-0.04", GOV_BOND: "0.01", GOLD: "0.02" }, cpi: i % 2 ? "0.01" : "0.002" })) });
}
export function riskContext(months = 24): RiskContext {
  const selection = retirementCommand();
  const rows = Array.from({ length: months }, (_, i) => ({ month: addMonths("2026-01", i), growthFactor: "1", inflationFactor: "1",
    income: "0", pension: "0", livingExpense: "100", additionalExpense: "0", debtPayment: "0", plannedContribution: "0",
    contribution: "0", contributionCapacity: "0", withdrawal: "100", uninvestedSurplus: "0", capitalInjection: "0" }));
  return { selection, projection: { valuationDate: "2026-01-01", retirementMonth: "2026-01", initialCapital: "1000", terminalBalance: "0",
    monthlyContribution: "0", contributionTiming: "END_OF_MONTH", modelVersion: "retirement-monthly-v3", rows },
    essentialExpenses: rows.map(() => "100"), targets: rows.map(() => [{ assetClass: "CASH", weightPercent: "50" }, { assetClass: "EQUITY", weightPercent: "50" }]),
    rebalance: rows.map((_, i) => i % 12 === 0), turnoverCostPercent: "0" };
}
