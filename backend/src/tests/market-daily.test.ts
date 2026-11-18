import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { MarketDataService } from "../modules/allocation-risk/market-service";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { convertDailyMarketData, dailyConvertSchema, formatRate } from "../modules/allocation-risk/market-daily";
import { marketDocumentSchema } from "../modules/allocation-risk/market-schema";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { marketFixture } from "./allocation-risk-fixtures";
import { config, token } from "./helpers";
import { plansFixture } from "./plans-fixtures";

// Synthetic test data only: weekday prices that grow by a fixed step per trading day.
function weekdays(from: string, to: string) {
  const out: string[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1))
    if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10));
  return out;
}
function csv(dates: string[], drop: (date: string, asset: string) => boolean = () => false) {
  return ["date,EQUITY,CASH", ...dates.map((date, i) => [date,
    drop(date, "EQUITY") ? "" : (1000 + i).toString(), drop(date, "CASH") ? "" : (100 + i / 100).toFixed(2)].join(","))].join("\n");
}
const cpiMom = (from: string, months: number) => ["month,cpi", ...Array.from({ length: months }, (_, i) => {
  const [y, m] = from.split("-").map(Number), t = y * 12 + m - 1 + i;
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")},0.3`;
})].join("\n");
const input = (pricesCsv: string, cpiCsv = cpiMom("2023-12", 14)) => dailyConvertSchema.parse({ pricesCsv, cpi: { kind: "MOM_PERCENT", csv: cpiCsv } });
const dates = weekdays("2023-11-01", "2024-12-31");

describe("daily market data → monthly total return rows", () => {
  it("builds month-end returns that fit the market document schema exactly", () => {
    const result = convertDailyMarketData(input(csv(dates)));
    expect(result.issues).toEqual([]);
    expect(result.status).toBe("VALID");
    expect(result.period).toEqual({ from: "2023-12", to: "2024-12" });
    // Base month is 2023-11 (last weekday 2023-11-30); first return month is 2023-12.
    const nov = dates.filter(d => d.startsWith("2023-11")).length, dec = dates.filter(d => d.startsWith("2023-12")).length;
    const expected = formatRate(new D(1000 + nov + dec - 1).div(1000 + nov - 1).minus(1));
    expect(result.rows[0]).toEqual({ month: "2023-12", returns: { EQUITY: expected, CASH: expect.any(String) }, cpi: "0.003" });
    expect(result.preview[0].monthEndDates).toEqual({ EQUITY: "2023-12-29", CASH: "2023-12-29" });
    const doc = { ...marketFixture(), period: result.period!, rows: result.rows,
      assets: marketFixture().assets.filter(a => ["EQUITY", "CASH"].includes(a.assetClass)) };
    expect(marketDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it("accepts a CPI index and Vietnamese date formats", () => {
    const vnCsv = csv(dates).replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1");
    const cpi = ["2023-11,100", ...Array.from({ length: 13 }, (_, i) => `${i ? `${String(i).padStart(2, "0")}/2024` : "12/2023"},${(100 + (i + 1) * 0.5).toFixed(1)}`)].join("\n");
    const result = convertDailyMarketData(dailyConvertSchema.parse({ pricesCsv: vnCsv, cpi: { kind: "INDEX", csv: cpi } }));
    expect(result.status).toBe("VALID");
    expect(result.rows[0].cpi).toBe("0.005");
  });
  it("rejects a missing interior month instead of filling zero", () => {
    const result = convertDailyMarketData(input(csv(dates, (d, a) => a === "EQUITY" && d.startsWith("2024-05"))));
    expect(result.status).toBe("INVALID");
    expect(result.rows).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "MONTH_MISSING", assetClass: "EQUITY", month: "2024-05" }));
    expect(result.preview.find(r => r.month === "2024-05")!.returns.EQUITY).toBeNull();
    expect(result.preview.find(r => r.month === "2024-06")!.returns.EQUITY).toBeNull();
  });
  it("rejects a month whose last observation is too far from month end", () => {
    const result = convertDailyMarketData(input(csv(dates, (d, a) => a === "CASH" && d >= "2024-03-15" && d <= "2024-03-31")));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "MONTH_END_MISSING", assetClass: "CASH", month: "2024-03" }));
  });
  it("leaves out the current, unfinished month with a warning", () => {
    const result = convertDailyMarketData(input(csv(weekdays("2023-11-01", "2025-01-10")), cpiMom("2023-12", 14)));
    expect(result.status).toBe("VALID");
    expect(result.period?.to).toBe("2024-12");
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "LAST_MONTH_INCOMPLETE", month: "2025-01" }));
  });
  it("reports missing CPI, bad prices and duplicate dates", () => {
    const bad = csv(dates).replace("2024-02-01,", "2024-02-01,abc").concat("\n2024-02-02,1,1");
    const result = convertDailyMarketData(input(bad, cpiMom("2023-12", 14).replace(/\n2024-04,0.3/, "")));
    const codes = result.issues.map(i => i.code);
    expect(codes).toEqual(expect.arrayContaining(["INVALID_PRICE", "DUPLICATE_DATE", "CPI_MISSING"]));
  });
  it("requires at least 12 months", () => {
    const result = convertDailyMarketData(input(csv(weekdays("2024-01-01", "2024-06-30")), cpiMom("2024-01", 6)));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "TOO_FEW_MONTHS" }));
  });
  it("is ADMIN only over HTTP, writes nothing and matches OpenAPI", async () => {
    const f = await plansFixture(), auth = new AuthService(f.db, config);
    vi.spyOn(auth, "validateSession").mockResolvedValue({ id: "test-user", role: "USER" } as never);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const market = new MarketDataService(f.db), create = vi.spyOn(market, "create");
    const app = createApp({ config, services: { auth, profiles: new ProfileService(f.db), marketData: market, allocationRisk: new AllocationRiskService(f.db) } });
    const url = "/api/v1/admin/market-data/convert-daily", body = { pricesCsv: csv(dates), cpi: { kind: "MOM_PERCENT", csv: cpiMom("2023-12", 14) } };
    expect((await request(app).post(url).set("Authorization", "Bearer " + token()).send(body)).status).toBe(403);
    expect((await request(app).post(url).set("Authorization", "Bearer " + token("ADMIN")).send({ ...body, extra: 1 })).status).toBe(400);
    const response = await request(app).post(url).set("Authorization", "Bearer " + token("ADMIN")).send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("VALID");
    expect(create).not.toHaveBeenCalled();
    const api = await SwaggerParser.dereference("docs/openapi.yaml") as any;
    const validate = new Ajv({ strict: false, validateFormats: false }).compile(api.paths[url].post.responses["200"].content["application/json"].schema);
    expect(validate({ data: response.body.data, meta: { requestId: randomUUID() } }), JSON.stringify(validate.errors)).toBe(true);
  });
});
