import { describe, expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { marketDocumentSchema, storedMarketDocumentSchema, type StrictMarketDocument } from "../modules/allocation-risk/market-schema";
import { MarketDataService, documentHash, marketDataDisclosureLimitations, marketDataWarnings } from "../modules/allocation-risk/market-service";
import { memoryDb } from "./memory-db";

function cleanMarketDoc(months = 120): StrictMarketDocument {
  const from = "2015-01";
  const to = addMonths(from, months - 1);
  return marketDocumentSchema.parse({
    schemaVersion: 1,
    title: "Clean synthetic series",
    reason: "Unit test fixture for B4-2 warnings",
    effectiveFrom: "2026-01-01",
    currency: "VND",
    unit: "DECIMAL_MONTHLY_TOTAL_RETURN",
    priceBasis: "NOMINAL",
    cpiMeasure: "MONTH_ON_MONTH_CHANGE",
    period: { from, to },
    sources: [
      { id: "SRC_A", title: "Asset source", url: "https://example.test/a", retrievedOn: "2026-06-01", license: "Test", usage: "SIMULATION_AND_DERIVED_OUTPUTS_PERMITTED", evidence: "Test" },
      { id: "SRC_CPI", title: "CPI source", url: "https://example.test/cpi", retrievedOn: "2026-06-01", license: "Test", usage: "SIMULATION_AND_DERIVED_OUTPUTS_PERMITTED", evidence: "Test" },
    ],
    assets: [
      { assetClass: "EQUITY", sourceId: "SRC_A", totalReturnEvidence: "Test total return", returnBasis: "TOTAL_RETURN", licenseStatus: "VERIFIED", fees: { treatment: "NET", evidence: "Test" }, taxTreatment: "Test" },
    ],
    cpiSourceId: "SRC_CPI",
    quality: { missingValues: "REJECT", imputation: "NONE", reviewNote: "Test fixture" },
    rows: Array.from({ length: months }, (_, i) => ({
      month: addMonths(from, i),
      returns: { EQUITY: i % 2 === 0 ? "0.01" : "-0.005" },
      cpi: "0.002",
    })),
  });
}

describe("MarketDataService.validate data-quality warnings (B4-2)", () => {
  it("returns no warnings on a clean 120-month dataset", async () => {
    const f = memoryDb(), svc = new MarketDataService(f.db);
    const created = await svc.create("admin", cleanMarketDoc(120));
    const res = await svc.validate(created.id);
    expect(res).toEqual({ status: "VALID", issues: [], warnings: [] });
  });

  it("emits SHORT_HISTORY when fewer than 120 rows without blocking VALID status", async () => {
    const f = memoryDb(), svc = new MarketDataService(f.db);
    const created = await svc.create("admin", cleanMarketDoc(119));
    const res = await svc.validate(created.id);
    expect(res.status).toBe("VALID");
    expect(res.issues).toEqual([]);
    expect(res.warnings.map(w => w.code)).toEqual(["SHORT_HISTORY"]);
  });

  it("emits STALE_PRICE_SUSPECTED on 3 consecutive zeros or identical returns (not on 2)", () => {
    const doc = cleanMarketDoc(120);
    doc.rows[0].returns.EQUITY = "0.02";
    doc.rows[1].returns.EQUITY = "0.02";
    expect(marketDataWarnings(doc)).toEqual([]);

    doc.rows[10].returns.EQUITY = "0";
    doc.rows[11].returns.EQUITY = "0.0";
    doc.rows[12].returns.EQUITY = "0.00";
    doc.rows[13].returns.EQUITY = "0"; // same run -> emitted once
    doc.rows[30].returns.EQUITY = "0.03";
    doc.rows[31].returns.EQUITY = "0.03";
    doc.rows[32].returns.EQUITY = "0.03";
    const stale = marketDataWarnings(doc).filter(w => w.code === "STALE_PRICE_SUSPECTED");
    expect(stale.map(w => w.path)).toEqual(["rows.12.returns.EQUITY", "rows.32.returns.EQUITY"]);
  });

  it("emits LOOK_AHEAD_SUSPECTED when a row month is after a referenced source's retrievedOn month", () => {
    const doc = cleanMarketDoc(120); // 2015-01 .. 2024-12
    doc.sources[0].retrievedOn = "2024-12-01"; // same month as last row -> OK
    expect(marketDataWarnings(doc)).toEqual([]);

    doc.sources[0].retrievedOn = "2024-11-30"; // 2024-12 > 2024-11
    doc.sources[1].retrievedOn = "2024-10-15"; // CPI 2024-11 > 2024-10
    const lookAhead = marketDataWarnings(doc).filter(w => w.code === "LOOK_AHEAD_SUSPECTED");
    expect(lookAhead.map(w => w.path)).toEqual(["rows.119.returns.EQUITY", "rows.118.cpi"]);
  });

  it("emits OUTLIER_RETURN strictly for |r| > 0.50", () => {
    const doc = cleanMarketDoc(120);
    doc.rows[5].returns.EQUITY = "0.5";
    doc.rows[6].returns.EQUITY = "-0.5";
    expect(marketDataWarnings(doc)).toEqual([]);

    doc.rows[7].returns.EQUITY = "0.5001";
    doc.rows[8].returns.EQUITY = "-0.55";
    const outliers = marketDataWarnings(doc).filter(w => w.code === "OUTLIER_RETURN");
    expect(outliers.map(w => w.path)).toEqual(["rows.7.returns.EQUITY", "rows.8.returns.EQUITY"]);
  });
});
