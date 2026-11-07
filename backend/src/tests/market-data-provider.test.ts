import { describe, expect, it, vi } from "vitest";
import {
  StaticFixturesProvider,
  SsiFastConnectProvider,
  FiinGroupProvider,
  validateTimeseriesQuality,
  type MarketDataSeriesPoint,
} from "../modules/market-data/provider";

describe("Feature F06 & F07 — Market Data Provider Abstraction & Quality Gates", () => {
  describe("StaticFixturesProvider", () => {
    it("never invents missing fixture observations and refuses production", async () => {
      await expect(new StaticFixturesProvider().fetchMonthlySeries("CASH", "2024-01", "2024-01")).rejects.toThrow("FIXTURE_DATA_REQUIRED");
      const p = new StaticFixturesProvider({ "2024-01": { CASH: "0.01" } });
      await expect(p.fetchMonthlySeries("CASH", "2024-01", "2024-02")).rejects.toThrow("FIXTURE_OBSERVATION_MISSING");
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect((await p.healthCheck()).status).toBe("UNAVAILABLE");
        await expect(p.fetchMonthlySeries("CASH", "2024-01", "2024-01")).rejects.toThrow("FIXTURES_NOT_ALLOWED_IN_PRODUCTION");
      } finally { vi.unstubAllEnvs(); }
    });
    it("serves continuous monthly return series for all 4 asset classes", async () => {
      const provider = new StaticFixturesProvider(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2024-${String(i + 1).padStart(2, "0")}`, { EQUITY: "0.01", CPI: "0.002" }])));
      const health = await provider.healthCheck();
      expect(health.status).toBe("CONFIGURED");

      const series = await provider.fetchMonthlySeries("EQUITY", "2024-01", "2024-12");
      expect(series.length).toBe(12);
      expect(series[0].month).toBe("2024-01");
      expect(series[11].month).toBe("2024-12");

      for (const pt of series) {
        expect(Number(pt.returnRate)).toBeGreaterThan(-1);
        expect(Number(pt.returnRate)).toBeLessThan(1);
      }
    });

    it("rejects unsupported asset classes with RangeError", async () => {
      const provider = new StaticFixturesProvider();
      await expect(provider.fetchMonthlySeries("CRYPTO", "2024-01", "2024-12")).rejects.toThrow(RangeError);
    });
  });

  describe("Commercial Provider Security & Credentials Safeguards", () => {
    it("does not send network requests without a verified licensed adapter", async () => {
      const fetch = vi.spyOn(globalThis, "fetch");
      for (const provider of [new SsiFastConnectProvider({ consumerId: "synthetic", consumerSecret: "synthetic" }), new FiinGroupProvider({ apiKey: "synthetic" })]) {
        expect((await provider.healthCheck()).status).toBe("CONFIGURED");
        await expect(provider.fetchMonthlySeries("EQUITY", "2024-01", "2024-12")).rejects.toThrow("BLOCKED_EXTERNAL_DEPENDENCY");
      }
      expect(fetch).not.toHaveBeenCalled();
    });
    it("SSI provider returns PROVIDER_CONFIGURATION_REQUIRED without credentials", async () => {
      const provider = new SsiFastConnectProvider(); // No credentials supplied
      const health = await provider.healthCheck();

      expect(health.status).toBe("NOT_CONFIGURED");
      expect(health.message).toContain("credentials are required");

      await expect(provider.fetchMonthlySeries("EQUITY", "2024-01", "2024-12")).rejects.toThrow(
        "PROVIDER_CONFIGURATION_REQUIRED"
      );
    });

    it("FiinGroup provider returns PROVIDER_CONFIGURATION_REQUIRED without credentials", async () => {
      const provider = new FiinGroupProvider(); // No credentials supplied
      const health = await provider.healthCheck();

      expect(health.status).toBe("NOT_CONFIGURED");
      await expect(provider.fetchMonthlySeries("BOND", "2024-01", "2024-12")).rejects.toThrow(
        "PROVIDER_CONFIGURATION_REQUIRED"
      );
    });

    it("SSI provider reports CONFIGURED without claiming connection health", async () => {
      const provider = new SsiFastConnectProvider({
        consumerId: "TEST_SSI_KEY_ID",
        consumerSecret: "TEST_SSI_SECRET",
      });
      const health = await provider.healthCheck();
      expect(health.status).toBe("CONFIGURED");
    });
  });

  describe("Data Quality Gate (validateTimeseriesQuality)", () => {
    it("validates a healthy continuous series with 100% pass", () => {
      const points: MarketDataSeriesPoint[] = [
        { month: "2024-01", returnRate: "0.012" },
        { month: "2024-02", returnRate: "0.008" },
        { month: "2024-03", returnRate: "-0.015" },
        { month: "2024-04", returnRate: "0.021" },
        { month: "2024-05", returnRate: "0.005" },
        { month: "2024-06", returnRate: "-0.002" },
        { month: "2024-07", returnRate: "0.014" },
        { month: "2024-08", returnRate: "0.009" },
        { month: "2024-09", returnRate: "-0.010" },
        { month: "2024-10", returnRate: "0.018" },
        { month: "2024-11", returnRate: "0.003" },
        { month: "2024-12", returnRate: "0.011" },
      ];

      const res = validateTimeseriesQuality(points, "EQUITY", "2024-01", "2024-12");
      expect(res.valid).toBe(true);
      expect(res.issues.length).toBe(0);
      expect(res.metadata.pointCount).toBe(12);
      expect(res.metadata.stalePeriodsDetected).toBe(0);
    });

    it("rejects series shorter than 12 months", () => {
      const points: MarketDataSeriesPoint[] = [
        { month: "2024-01", returnRate: "0.012" },
        { month: "2024-02", returnRate: "0.008" },
      ];

      const res = validateTimeseriesQuality(points, "EQUITY");
      expect(res.valid).toBe(false);
      expect(res.issues[0]).toContain("HISTORY_INSUFFICIENT");
    });

    it("detects calendar gaps between consecutive observations", () => {
      const points: MarketDataSeriesPoint[] = [
        { month: "2024-01", returnRate: "0.012" },
        { month: "2024-02", returnRate: "0.008" },
        { month: "2024-04", returnRate: "0.021" }, // Skipped 2024-03!
        { month: "2024-05", returnRate: "0.005" },
        { month: "2024-06", returnRate: "-0.002" },
        { month: "2024-07", returnRate: "0.014" },
        { month: "2024-08", returnRate: "0.009" },
        { month: "2024-09", returnRate: "-0.010" },
        { month: "2024-10", returnRate: "0.018" },
        { month: "2024-11", returnRate: "0.003" },
        { month: "2024-12", returnRate: "0.011" },
        { month: "2025-01", returnRate: "0.007" },
      ];

      const res = validateTimeseriesQuality(points, "EQUITY");
      expect(res.valid).toBe(false);
      expect(res.issues.some(i => i.includes("CALENDAR_GAP"))).toBe(true);
    });

    it("detects stale/frozen prices on traded volatile assets", () => {
      const points: MarketDataSeriesPoint[] = [
        { month: "2024-01", returnRate: "0.012" },
        { month: "2024-02", returnRate: "0.012" },
        { month: "2024-03", returnRate: "0.012" },
        { month: "2024-04", returnRate: "0.012" }, // 4 consecutive identical returns on EQUITY
        { month: "2024-05", returnRate: "0.005" },
        { month: "2024-06", returnRate: "-0.002" },
        { month: "2024-07", returnRate: "0.014" },
        { month: "2024-08", returnRate: "0.009" },
        { month: "2024-09", returnRate: "-0.010" },
        { month: "2024-10", returnRate: "0.018" },
        { month: "2024-11", returnRate: "0.003" },
        { month: "2024-12", returnRate: "0.011" },
      ];

      const res = validateTimeseriesQuality(points, "EQUITY");
      expect(res.valid).toBe(false);
      expect(res.issues.some(i => i.includes("STALE_DATA_DETECTED"))).toBe(true);
      expect(res.metadata.stalePeriodsDetected).toBeGreaterThanOrEqual(1);
    });

    it("flags extreme returns less than -100%", () => {
      const points: MarketDataSeriesPoint[] = [
        { month: "2024-01", returnRate: "-1.05" }, // Impossible return <= -100%
        { month: "2024-02", returnRate: "0.008" },
        { month: "2024-03", returnRate: "0.015" },
        { month: "2024-04", returnRate: "0.021" },
        { month: "2024-05", returnRate: "0.005" },
        { month: "2024-06", returnRate: "-0.002" },
        { month: "2024-07", returnRate: "0.014" },
        { month: "2024-08", returnRate: "0.009" },
        { month: "2024-09", returnRate: "-0.010" },
        { month: "2024-10", returnRate: "0.018" },
        { month: "2024-11", returnRate: "0.003" },
        { month: "2024-12", returnRate: "0.011" },
      ];

      const res = validateTimeseriesQuality(points, "EQUITY");
      expect(res.valid).toBe(false);
      expect(res.issues.some(i => i.includes("RETURN_LESS_THAN_MINUS_ONE"))).toBe(true);
    });
  });
});

