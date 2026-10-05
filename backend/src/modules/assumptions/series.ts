import { Prisma } from "@prisma/client";
import { addMonths } from "../../common/calendar";
import { assumptionDocumentSchema, seriesRequestSchema, type AssumptionDocument, type ReturnYear, type SeriesRequest } from "./schema";

export const AssumptionDecimal = Prisma.Decimal.clone({ precision: 48 });
const D = AssumptionDecimal;
export type ConfigurationIssue = { path: string; code: string };
export function normalizedAnnualReturn(row: ReturnYear, inflationPercent: string) {
  const raw = new D(row.rate.percent).div(100);
  let value = row.rate.type === "EFFECTIVE_ANNUAL" ? raw : raw.div(row.rate.compoundsPerYear).plus(1).pow(row.rate.compoundsPerYear).minus(1);
  if (row.priceBasis === "REAL") value = value.plus(1).mul(new D(inflationPercent).div(100).plus(1)).minus(1);
  for (const cost of [row.fees, row.taxes]) {
    if (cost.treatment === "UNKNOWN") return null;
    if (cost.treatment === "EXPLICIT_ANNUAL_DRAG") value = value.minus(new D(cost.percent).div(100));
  }
  return value;
}

// Incomplete documents can be saved as drafts. This gate is mandatory for review,
// approval, publish and resolution; missing entries are never extended implicitly.
export function validateConfiguration(document: AssumptionDocument) {
  const data = assumptionDocumentSchema.parse(document), issues: ConfigurationIssue[] = [];
  const issue = (path: string, code: string) => issues.push({ path, code });
  const unique = (ids: string[], path: string) => { if (new Set(ids).size !== ids.length) issue(path, "DUPLICATE_ENTRY"); };
  unique(data.sources.map(s => s.id), "sources"); unique(data.assetClasses.map(a => a.code), "assetClasses");
  unique(data.inflation.map(r => String(r.year)), "inflation");
  unique(data.historicalCpi.map(r => `${r.year}:${r.measure}`), "historicalCpi");
  unique(data.returns.map(r => `${r.year}:${r.assetClass}:${r.horizonId}`), "returns");
  if (!data.assetClasses.length) issue("assetClasses", "ASSET_CLASSES_REQUIRED");
  const sources = new Map(data.sources.map(s => [s.id, s]));
  const sourceCheck = (id: string, year: number, path: string, kind?: string) => {
    const source = sources.get(id);
    if (!source) issue(path, "SOURCE_REQUIRED");
    else {
      if (year < source.fromYear || year > source.toYear) issue(path, "OUTSIDE_SOURCE_COVERAGE");
      if (kind && source.kind !== kind) issue(path, "SOURCE_KIND_MISMATCH");
      if (source.retrievedOn > data.effectiveFrom) issue(path, "SOURCE_AFTER_EFFECTIVE_DATE");
    }
  };
  data.historicalCpi.forEach((row, i) => {
    sourceCheck(row.sourceId, row.year, `historicalCpi.${i}`, "HISTORICAL_OFFICIAL");
    if (row.year >= data.projectionStartYear) issue(`historicalCpi.${i}`, "HISTORICAL_CPI_NOT_PROJECTION");
  });
  data.assetClasses.forEach((asset, i) => {
    unique(asset.horizons.map(h => h.id), `assetClasses.${i}.horizons`);
    asset.horizons.forEach((h, j) => {
      if (asset.horizons.slice(0, j).some(o => o.minMonths <= h.maxMonths && h.minMonths <= o.maxMonths))
        issue(`assetClasses.${i}.horizons.${j}`, "OVERLAPPING_HORIZONS");
    });
  });
  let longTermStart = Infinity, forecastEnd = -Infinity;
  data.inflation.forEach((row, i) => {
    if (row.year < data.projectionStartYear || row.year > data.projectionEndYear) issue(`inflation.${i}`, "OUTSIDE_PROJECTION");
    sourceCheck(row.sourceId, row.year, `inflation.${i}`, row.kind === "FORECAST" ? "FORECAST" : "AN_HUU_LONG_TERM");
    if (row.kind === "LONG_TERM") longTermStart = Math.min(longTermStart, row.year);
    else forecastEnd = Math.max(forecastEnd, row.year);
  });
  if (forecastEnd >= longTermStart) issue("inflation", "FORECAST_AFTER_LONG_TERM");
  const inflation = new Map(data.inflation.map(row => [row.year, row]));
  const returns = new Map(data.returns.map(row => [`${row.year}:${row.assetClass}:${row.horizonId}`, row]));
  data.returns.forEach((row, i) => {
    sourceCheck(row.sourceId, row.year, `returns.${i}`);
    const source = sources.get(row.sourceId);
    if (source && !["ASSET_RESEARCH", "AN_HUU_LONG_TERM"].includes(source.kind)) issue(`returns.${i}`, "SOURCE_KIND_MISMATCH");
    if (row.year < data.projectionStartYear || row.year > data.projectionEndYear) issue(`returns.${i}`, "OUTSIDE_PROJECTION");
    if (!data.assetClasses.some(a => a.code === row.assetClass && a.horizons.some(h => h.id === row.horizonId))) issue(`returns.${i}`, "UNKNOWN_ASSET_HORIZON");
    if (row.fees.treatment === "UNKNOWN" || row.taxes.treatment === "UNKNOWN") issue(`returns.${i}`, "COST_TREATMENT_REQUIRED");
    const cpi = inflation.get(row.year);
    const net = cpi ? normalizedAnnualReturn(row, cpi.percent) : null;
    if (net?.lte(-1)) issue(`returns.${i}`, "NET_RETURN_OUT_OF_RANGE");
  });
  for (let year = data.projectionStartYear; year <= data.projectionEndYear; year++) {
    if (!inflation.has(year)) issue(`inflation.${year}`, "YEAR_REQUIRED");
    for (const asset of data.assetClasses) for (const horizon of asset.horizons)
      if (!returns.has(`${year}:${asset.code}:${horizon.id}`)) issue(`returns.${year}.${asset.code}.${horizon.id}`, "YEAR_REQUIRED");
  }
  return { status: issues.length ? "INCOMPLETE" as const : "VALID" as const, issues };
}

export function resolveYearSeries(document: AssumptionDocument, command: SeriesRequest) {
  const data = assumptionDocumentSchema.parse(document), input = seriesRequestSchema.parse(command);
  const validation = validateConfiguration(data);
  const issues = [...validation.issues];
  const asset = data.assetClasses.find(a => a.code === input.assetClass);
  const horizon = asset?.horizons.find(h => h.minMonths <= input.horizonMonths && input.horizonMonths <= h.maxMonths);
  if (!horizon) issues.push({ path: "horizonMonths", code: "ASSET_HORIZON_NOT_COVERED" });
  if (+input.startMonth.slice(0, 4) < data.projectionStartYear || +input.endMonth.slice(0, 4) > data.projectionEndYear)
    issues.push({ path: "startMonth", code: "PROJECTION_NOT_COVERED" });
  if (issues.length || !horizon) return { status: "INCOMPLETE" as const, issues, months: [] };
  const inflation = new Map(data.inflation.map(r => [r.year, r]));
  const returns = new Map(data.returns.filter(r => r.assetClass === input.assetClass && r.horizonId === horizon.id).map(r => [r.year, r]));
  const months = [];
  const annualFactors = new Map<number, { net: string; inflation: string; growth: string }>();
  for (let month = input.startMonth; month <= input.endMonth; month = addMonths(month, 1)) {
    const year = +month.slice(0, 4), cpi = inflation.get(year)!, row = returns.get(year)!;
    if (!annualFactors.has(year)) {
      const net = normalizedAnnualReturn(row, cpi.percent)!;
      annualFactors.set(year, { net: net.mul(100).toFixed(),
        inflation: new D(cpi.percent).div(100).plus(1).pow(new D(1).div(12)).toFixed(), growth: net.plus(1).pow(new D(1).div(12)).toFixed() });
    }
    const factors = annualFactors.get(year)!;
    months.push({ month, inflationAnnualPercent: cpi.percent, returnAnnualNetNominalPercent: factors.net,
      inflationMonthlyFactor: factors.inflation, returnMonthlyFactor: factors.growth,
      inflationKind: cpi.kind, inflationSourceId: cpi.sourceId, returnSourceId: row.sourceId, assetClass: row.assetClass, horizonId: row.horizonId });
  }
  return { status: "READY" as const, issues: [], months };
}
