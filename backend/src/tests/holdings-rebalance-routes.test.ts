import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import { digest } from "../common/digest";
import { AuthService } from "../modules/auth/service";
import { HoldingsRepository } from "../modules/holdings/repository";
import { RecommendationService } from "../modules/recommendation/service";
import { plansFixture } from "./plans-fixtures";
import { portfolioCommand } from "./portfolio-fixtures";
import { config } from "./helpers";

const root = "/api/v1/investments";
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);
const sign = (userId: string, role: "USER" | "ADMIN") =>
  "Bearer " + jwt.sign({ userId, email: `${role.toLowerCase()}@example.test`, role }, config.JWT_SECRET, {
    algorithm: "HS256", issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, expiresIn: 60,
  });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function setup() {
  const f = await plansFixture();
  // Create a second user for cross-user ownership tests.
  const otherUserId = randomUUID();
  await f.db.user.create({ data: { id: otherUserId, email: "other@example.test", passwordHash: "hash", fullName: "Other", role: "USER", status: "ACTIVE" } });
  const adminUserId = randomUUID();
  await f.db.user.create({ data: { id: adminUserId, email: "admin@example.test", passwordHash: "hash", fullName: "Admin", role: "ADMIN", status: "ACTIVE" } });

  // Save a current plan version for f.owner (GROWTH template: 50% BOND, 50% STOCK -> mapped to 50% BOND, 50% EQUITY).
  const growthCommand = {
    ...f.command.preview,
    answers: portfolioCommand(f.command.preview.policyVersionId, true).answers,
    liquidityNeedMonths: 12,
  };
  const preview = await f.retirement.preview(f.owner, growthCommand);
  expect(preview.status, JSON.stringify(preview.issues)).toBe("READY");
  const saved = await f.plans.createVersion(f.owner, null, {
    expectedRevision: 0,
    expectedInputHash: preview.inputHash,
    preview: growthCommand,
  }, randomUUID());
  await f.plans.apply(f.owner, saved.planId, { expectedRevision: saved.revision, expectedProfileRevision: 1, versionId: saved.saved.id, confirm: true }, randomUUID());

  // Seed partner + 3 active products: HoSE Equity ETF (lot 100), Open-end Bond Fund (lot 1), Term Deposit (CASH, lot 1).
  const partnerId = randomUUID();
  await f.db.partner.create({ data: { id: partnerId, name: "An Huu Partner", type: "OPEN_FUND", isVisible: true, revision: 1 } });

  const seedProduct = async (code: string, name: string, assetClass: "EQUITY" | "BOND" | "CASH", category: "EQUITY_ETF" | "OPEN_BOND_FUND" | "TERM_DEPOSIT", nav: string, lotSize: number) => {
    const productId = randomUUID();
    await f.db.partnerProduct.create({ data: { id: productId, partnerId, name, category, riskLevel: "MEDIUM", expectedReturn: "8%", isVisible: true, revision: 1 } });
    const doc = {
      code, assetClass, category, nav,
      annualExpenseRatioPercent: "0.5", liquidityDays: 2, lotSize,
      minimumInvestmentVnd: "100000", riskScore: 5, isDistributionPermitted: true, status: "ACTIVE" as const,
      sourceKind: "TEST_FIXTURE" as const, sourceReference: "Unit test fixture catalog", currency: "VND" as const,
      priceAsOf: "2020-01-01", validUntil: "2099-12-31",
      distributionEvidence: "Unit test distribution evidence",
    };
    await f.db.investmentProductData.create({ data: { productId, revision: 1, document: doc, documentHash: digest(doc) } });
    return productId;
  };

  const etfId = await seedProduct("E1VFVN30", "Quỹ ETF VFMVN30", "EQUITY", "EQUITY_ETF", "25000", 100);
  const bondId = await seedProduct("TCBF", "Quỹ Trái phiếu mở TCBF", "BOND", "OPEN_BOND_FUND", "15000", 1);
  const depId = await seedProduct("VCB_12M", "Tiền gửi kỳ hạn 12T", "CASH", "TERM_DEPOSIT", "1", 1);

  const auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockImplementation(async payload => ({
    id: payload.userId,
    role: payload.role,
    status: "ACTIVE",
  }) as never);
  const recommendations = new RecommendationService(f.db);
  const holdings = new HoldingsRepository(f.db);
  const app = createApp({ config, services: { auth, profiles: f.profiles, recommendations, holdings } });

  const ownerAuth = sign(f.owner, "USER");
  const otherAuth = sign(otherUserId, "USER");
  const adminAuth = sign(adminUserId, "ADMIN");

  // Owner holds 80% EQUITY (800M) and 20% BOND (200M) -> 30pp drift vs 50/50 target.
  await holdings.write(f.owner, { productId: etfId, quantity: "32000", unitCost: "20000", expectedRevision: 0 });
  await holdings.write(f.owner, { productId: bondId, quantity: "13333", unitCost: "14000", expectedRevision: 0 });

  return { ...f, app, holdings, planId: saved.planId, versionId: saved.saved.id, etfId, bondId, depId, ownerAuth, otherAuth, adminAuth };
}

describe("B7-3: maturities & recorded dividends into free cash", () => {
  it("keeps maturedAmount=0 and emits MATURITIES_NOT_RECORDED when no matured holdings or dividends exist", async () => {
    const f = await setup();
    const read = await f.holdings.read(f.owner);
    expect(read.status).toBe("READY");
    expect(read.holdings.every(h => h.maturedAmount === "0")).toBe(true);
    expect(read.recordedDividends).toBe("0");
    expect(read.notes).toContain("MATURITIES_NOT_RECORDED");
  });

  it("extracts maturedAmount from past-maturity TERM_DEPOSIT and dividends from actualMonth INVESTMENT_INCOME", async () => {
    const f = await setup();
    // Add a 100M term deposit whose lock/maturity date has already passed.
    await f.holdings.write(f.owner, { productId: f.depId, quantity: "100000000", unitCost: "1", lockedUntil: `${currentMonth()}-01`, expectedRevision: 0 });
    // Record 15M INVESTMENT_INCOME (dividends/distributions) in current month actuals.
    await f.db.actualMonth.create({
      data: {
        userId: f.owner,
        period: currentMonth(),
        revision: 1,
        payload: {
          currency: "VND",
          openingBalance: "0",
          closingBalance: "15000000",
          correctionReason: "Ghi nhận cổ tức",
          entries: [
            { eventId: randomUUID(), date: `${currentMonth()}-01`, kind: "INVESTMENT_INCOME", amount: "15000000", note: "Cổ tức ETF" },
          ],
        },
      },
    });

    const read = await f.holdings.read(f.owner);
    const dep = read.holdings.find(h => h.productId === f.depId);
    expect(dep?.maturedAmount).toBe("100000000");
    expect(read.recordedDividends).toBe("15000000");
    expect(read.notes).not.toContain("MATURITIES_NOT_RECORDED");

    const drift = await f.holdings.drift(f.owner, { planId: f.planId, versionId: f.versionId, newContribution: "0" });
    expect(drift.recordedDividends).toBe("15000000");
    expect(drift.notes).not.toContain("MATURITIES_NOT_RECORDED");
    // Free cash (15M dividends + 100M matured deposit if CASH is in target, or 15M dividends alone) is used before selling.
    expect(Number(drift.rebalanceRecommendation?.cashUsedBeforeTrades)).toBeGreaterThanOrEqual(15000000);
  });
});

describe("B7-4: GET /investments/holdings/drift & POST /investments/holdings/rebalance-orders", () => {
  it("enforces authentication, USER role, ownership, and strict Zod validation", async () => {
    const f = await setup();
    // Unauthenticated -> 401
    expect((await request(f.app).get(`${root}/holdings/drift`)).status).toBe(401);
    expect((await request(f.app).post(`${root}/holdings/rebalance-orders`).send({ planId: f.planId, versionId: f.versionId })).status).toBe(401);
    // ADMIN -> 403
    expect((await request(f.app).get(`${root}/holdings/drift`).set("Authorization", f.adminAuth)).status).toBe(403);
    expect((await request(f.app).post(`${root}/holdings/rebalance-orders`).set("Authorization", f.adminAuth).send({ planId: f.planId, versionId: f.versionId })).status).toBe(403);
    // Cross-user plan access -> 404
    expect((await request(f.app).get(`${root}/holdings/drift`).set("Authorization", f.otherAuth).query({ planId: f.planId, versionId: f.versionId })).status).toBe(404);
    expect((await request(f.app).post(`${root}/holdings/rebalance-orders`).set("Authorization", f.otherAuth).send({ planId: f.planId, versionId: f.versionId })).status).toBe(404);
    // Invalid query / body -> 400
    expect((await request(f.app).get(`${root}/holdings/drift`).set("Authorization", f.ownerAuth).query({ planId: f.planId })).status).toBe(400);
    expect((await request(f.app).post(`${root}/holdings/rebalance-orders`).set("Authorization", f.ownerAuth).send({ planId: f.planId, versionId: f.versionId, unknownField: true })).status).toBe(400);
  });

  it("serves read-only drift monitoring (with and without explicit planId/versionId) without DB writes", async () => {
    const f = await setup();
    const beforeAudit = f.rows("auditLog").length;
    const beforeHoldings = JSON.stringify(f.rows("investmentHolding"));

    const resExplicit = await request(f.app).get(`${root}/holdings/drift`)
      .set("Authorization", f.ownerAuth)
      .query({ planId: f.planId, versionId: f.versionId, newContribution: "20000000" });
    expect(resExplicit.status, JSON.stringify(resExplicit.body)).toBe(200);
    expect(resExplicit.body.data).toMatchObject({
      persisted: false,
      informationalOnly: true,
      planId: f.planId,
      versionId: f.versionId,
      isDrifted: true,
      rebalanceRequired: true,
      recordedDividends: "0",
    });
    expect(resExplicit.body.data.notes).toContain("MATURITIES_NOT_RECORDED");
    expect(resExplicit.body.data.rebalanceRecommendation.status).toBe("PROPOSED");

    // Default active plan resolution when planId/versionId omitted
    const resDefault = await request(f.app).get(`${root}/holdings/drift`).set("Authorization", f.ownerAuth);
    expect(resDefault.status, JSON.stringify(resDefault.body)).toBe(200);
    expect(resDefault.body.data.planId).toBe(f.planId);
    expect(resDefault.body.data.versionId).toBe(f.versionId);

    // Strictly read-only: zero DB mutations
    expect(f.rows("auditLog").length).toBe(beforeAudit);
    expect(JSON.stringify(f.rows("investmentHolding"))).toBe(beforeHoldings);
  });

  it("generates read-only product-level rebalance orders respecting HoSE 100-lot and open-end fund lot 1", async () => {
    const f = await setup();
    const beforeAudit = f.rows("auditLog").length;

    const res = await request(f.app).post(`${root}/holdings/rebalance-orders`)
      .set("Authorization", f.ownerAuth)
      .send({ planId: f.planId, versionId: f.versionId, newContribution: "10000000" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({
      persisted: false,
      informationalOnly: true,
      planId: f.planId,
      versionId: f.versionId,
    });
    const orders = res.body.data.orders as Array<{ assetClass: string; action: string; units: number; lotSize: number; productCode: string }>;
    expect(orders.length).toBeGreaterThanOrEqual(2);

    const etfOrder = orders.find(o => o.productCode === "E1VFVN30");
    expect(etfOrder).toBeDefined();
    expect(etfOrder!.action).toBe("SELL");
    expect(etfOrder!.lotSize).toBe(100);
    expect(etfOrder!.units % 100).toBe(0);

    const bondOrder = orders.find(o => o.productCode === "TCBF");
    expect(bondOrder).toBeDefined();
    expect(bondOrder!.action).toBe("BUY");
    expect(bondOrder!.lotSize).toBe(1);
    expect(bondOrder!.units).toBeGreaterThan(0);

    // Strictly read-only
    expect(f.rows("auditLog").length).toBe(beforeAudit);
  });

  it("flags locked holdings in drift (read-only) and blocks rebalance-orders with 422", async () => {
    const f = await setup();
    await f.holdings.write(f.owner, { productId: f.depId, quantity: "50000000", unitCost: "1", lockedUntil: "2099-12-31", expectedRevision: 0 });

    const drift = await request(f.app).get(`${root}/holdings/drift`).set("Authorization", f.ownerAuth);
    expect(drift.status).toBe(200);
    expect(drift.body.data.notes).toContain("LOCKED_HOLDINGS_PRESENT");

    const orders = await request(f.app).post(`${root}/holdings/rebalance-orders`)
      .set("Authorization", f.ownerAuth)
      .send({ planId: f.planId, versionId: f.versionId, newContribution: "0" });
    expect(orders.status).toBe(422);
    expect(orders.body.error.code).toBe("LOCKED_HOLDINGS_REQUIRE_REVIEW");
  });
});
