import { describe, expect, it } from "vitest";
import { marketDocumentSchema, storedMarketDocumentSchema } from "../modules/allocation-risk/market-schema";
import { documentHash, MarketDataService, marketDataDisclosureLimitations } from "../modules/allocation-risk/market-service";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import { simulate } from "../modules/allocation-risk/simulation";
import { marketFixture, riskContext } from "./allocation-risk-fixtures";
import { memoryDb } from "./memory-db";

async function approved(data = marketFixture()) {
  const f = memoryDb(), service = new MarketDataService(f.db);
  const draft = await service.create("test-admin", data);
  const version = await service.approve("test-admin", draft.id, { expectedRevision: draft.revision, confirm: true, reviewNote: "Synthetic reviewed fixture" });
  return { ...f, service, version };
}

describe("market publication governance and legacy reads (B4-1)", () => {
  it.each(["PRICE_ONLY", "INCOME_ONLY"] as const)("blocks %s data without altering the approved version, and records explicit override", async returnBasis => {
    const data = marketFixture();
    data.assets.find(a => a.assetClass === "EQUITY")!.returnBasis = returnBasis;
    data.assets.find(a => a.assetClass === "EQUITY")!.licenseStatus = "UNVERIFIED";
    const f = await approved(data);
    await expect(f.service.publish("test-admin", f.version.id, { expectedRevision: f.version.revision, confirm: true })).rejects.toMatchObject({ code: "MARKET_DATA_PUBLISH_BLOCKED" });
    expect(await f.service.get(f.version.id)).toMatchObject({ status: "APPROVED", revision: f.version.revision });
    const result = await f.service.publish("test-admin", f.version.id, { expectedRevision: f.version.revision, confirm: true, override: { reason: "Explicit synthetic test exception" } });
    expect(result.status).toBe("PUBLISHED");
    expect(result.approval?.reviewNote).toContain("OVERRIDE: Explicit synthetic test exception");
    expect(marketDataDisclosureLimitations(result.data)).toEqual(["MARKET_DATA_NOT_TOTAL_RETURN", "LICENSE_UNVERIFIED"]);
    expect(result.documentHash).toBe(f.version.documentHash);
  });

  it("publishes verified total-return data with BUY-side gold without an override", async () => {
    const f = await approved();
    const result = await f.service.publish("test-admin", f.version.id, { expectedRevision: f.version.revision, confirm: true });
    expect(result.status).toBe("PUBLISHED");
    expect(marketDataDisclosureLimitations(result.data)).toEqual([]);
  });

  it("blocks isolated basis or license gaps and carries each limitation into an overridden simulation", async () => {
    const policy = riskPolicySchema.parse({ evidence: "Test-only policy", blockMonths: 12, cvarAlpha: "0.95", essentialThreshold: "0.90" });
    for (const { returnBasis, licenseStatus, limitation } of [
      { returnBasis: "TOTAL_RETURN", licenseStatus: "UNVERIFIED", limitation: "LICENSE_UNVERIFIED" },
      { returnBasis: "PRICE_ONLY", licenseStatus: "VERIFIED", limitation: "MARKET_DATA_NOT_TOTAL_RETURN" },
    ] as const) {
      const data = marketFixture();
      Object.assign(data.assets.find(a => a.assetClass === "EQUITY")!, { returnBasis, licenseStatus });
      const f = await approved(data);
      expect(marketDataDisclosureLimitations(f.version.data)).toEqual([limitation]);
      await expect(f.service.publish("test-admin", f.version.id, { expectedRevision: f.version.revision, confirm: true })).rejects.toMatchObject({ code: "MARKET_DATA_PUBLISH_BLOCKED" });
      const result = await f.service.publish("test-admin", f.version.id, { expectedRevision: f.version.revision, confirm: true, override: { reason: "Synthetic governance exception" } });
      expect(await simulate(riskContext(), result.data, policy, 20)).toMatchObject({
        status: "READY", disclosure: { limitations: expect.arrayContaining([limitation]) },
      });
    }
  });

  it.each([undefined, "SELL", "MID"] as const)("allows an honest gold draft with priceSide=%s, but requires a publication override", async priceSide => {
    const data = marketFixture(), gold = data.assets.find(a => a.assetClass === "GOLD")!;
    if (priceSide === undefined) delete gold.priceSide;
    else gold.priceSide = priceSide;
    expect(marketDocumentSchema.safeParse(data).success).toBe(true);
    const f = await approved(data);
    await expect(f.service.publish("test-admin", f.version.id, { expectedRevision: f.version.revision, confirm: true })).rejects.toMatchObject({ code: "MARKET_DATA_PUBLISH_BLOCKED" });
    const result = await f.service.publish("test-admin", f.version.id, { expectedRevision: f.version.revision, confirm: true, override: { reason: "Synthetic gold quote-side exception" } });
    expect(marketDataDisclosureLimitations(result.data)).toEqual(["GOLD_LIQUIDATION_PRICE_SIDE_UNVERIFIED"]);
  });

  it("reads historical documents without inventing metadata or changing their approved hash", async () => {
    const f = await approved();
    const legacy = JSON.parse(JSON.stringify(f.version.data));
    for (const asset of legacy.assets) { delete asset.returnBasis; delete asset.licenseStatus; delete asset.priceSide; }
    expect(marketDocumentSchema.safeParse(legacy).success).toBe(false);
    expect(storedMarketDocumentSchema.parse(legacy)).toEqual(legacy);
    const hash = documentHash(legacy);
    await f.db.assumptionSetVersion.update({ where: { id: f.version.id }, data: {
      status: "PUBLISHED", effectiveAt: new Date("2020-01-01T00:00:00Z"), values: legacy,
      policy: { approval: { ...f.version.approval!, documentHash: hash } },
    } });
    const result = await f.service.published(f.version.id);
    expect(result?.data).toEqual(legacy);
    expect(result?.documentHash).toBe(hash);
    expect(marketDataDisclosureLimitations(result!.data)).toEqual(["MARKET_DATA_NOT_TOTAL_RETURN", "LICENSE_UNVERIFIED", "GOLD_LIQUIDATION_PRICE_SIDE_UNVERIFIED"]);
  });
});
