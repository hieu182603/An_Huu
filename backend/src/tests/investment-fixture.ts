import { marketFixture } from "./allocation-risk-fixtures";
import { digest } from "../common/digest";
// Synthetic data for isolated PostgreSQL only. Never imported by runtime code.
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { retirementCommand, retirementConfiguration, retirementProfile } from "./retirement-fixtures";
import { fixtureAsset, known, empty } from "./profile-v2-fixtures";
import { glidePortfolioFixture } from "./portfolio-fixtures";
import { profileV2Schema } from "../modules/profiles/schema-v2";
import { assumptionDocumentSchema, ASSUMPTION_SERIES_CODE } from "../modules/assumptions/schema";
import { portfolioDocumentV2Schema, PORTFOLIO_POLICY_CODE } from "../modules/portfolios/schema";
import { PlansService } from "../modules/plans/service";
import { RetirementService } from "../modules/retirement/service";
import { RecommendationService, json } from "../modules/recommendation/service";
export async function seedInvestmentFixture(db: PrismaClient) {
  const database = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (!/^anhuu_[a-z0-9_]+_test$/.test(database[0].name)) throw new Error("Isolated test database required");
  const password = "Remediation-test-only-2026!", prefix = randomUUID().slice(0, 8);
  const actors = {} as Record<"userA" | "userB" | "advisor" | "approver" | "operations" | "dataAdmin", { id: string; email: string }>;
  const passwordHash = await bcrypt.hash(password, 10);
  for (const key of Object.keys({ userA: 1, userB: 1, advisor: 1, approver: 1, operations: 1, dataAdmin: 1 }) as Array<keyof typeof actors>) {
    actors[key] = await db.user.create({ data: { email: `${prefix}-${key.toLowerCase()}@example.test`, fullName: `Test ${key}`, passwordHash, status: "ACTIVE", emailVerifiedAt: new Date(), role: ["userA", "userB"].includes(key) ? "USER" : "ADMIN" }, select: { id: true, email: true } });
  }
  for (const [key, role] of [["advisor", "ADVISOR"], ["advisor", "APPROVER"], ["approver", "APPROVER"], ["operations", "OPERATIONS"], ["dataAdmin", "DATA_ADMIN"]] as const)
    await db.investmentRoleGrant.create({ data: { userId: actors[key].id, role, grantedBy: "isolated-test-fixture" } });
  const rename = (v: unknown) => JSON.parse(JSON.stringify(v).replaceAll('"BOND"', '"CASH"').replaceAll('"STOCK"', '"EQUITY"'));
  const assumptions = assumptionDocumentSchema.parse(rename(retirementConfiguration().assumptions));
  const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const last = await db.assumptionSetVersion.findFirst({ orderBy: { version: "desc" } });
  const assumption = await db.assumptionSetVersion.create({ data: { version: (last?.version ?? 0) + 1, modelCode: ASSUMPTION_SERIES_CODE, status: "PUBLISHED", values: json(assumptions), policy: { preview: null, approval: { actor: actors.approver.id, approvedAt: new Date().toISOString(), reviewNote: "ISOLATED SYNTHETIC FIXTURE", documentHash: hash(assumptions), baselineId: null } }, source: {}, reason: "ISOLATED SYNTHETIC TEST", createdBy: actors.dataAdmin.id, effectiveAt: new Date("2026-10-04") } });
  const policy = portfolioDocumentV2Schema.parse({ ...rename(glidePortfolioFixture(assumption.id)), lossStress: { evidence: "Synthetic policy only", equityAssetClass: "EQUITY", depositAssetClass: "CASH", shocks: [{ assetClass: "CASH", percent: "0" }, { assetClass: "EQUITY", percent: "-35" }] }, allocationRisk: { evidence: "Synthetic test only", continuousOptimizer: { riskAversionGamma: 3, uncertaintyKappa: 0, turnoverPenaltyEta: 0, estimation: { evidence: "Synthetic monthly baselines only", historicalWeight: 0.5, monthlyBaselines: [{ assetClass: "CASH", returnRate: 0.002 }, { assetClass: "EQUITY", returnRate: 0.005 }] }, bounds: [{ assetClass: "CASH", min: 0, max: 1 }, { assetClass: "EQUITY", min: 0, max: 0.6 }] }, rebalanceBandPoints: "5", blockMonths: 12, essentialThreshold: "0.9", cvarAlpha: "0.95", equityShiftPoints: "5", stresses: { LONGEVITY: { extraYears: [5, 10], terminalContinuation: "LIVING_CPI_LIFELONG_PENSION_ONLY" } } } });
  const policyRow = await db.assumptionSetVersion.create({ data: { version: assumption.version + 1, modelCode: PORTFOLIO_POLICY_CODE, status: "PUBLISHED", values: json(policy), policy: { approval: { actor: actors.approver.id, approvedAt: new Date().toISOString(), reviewNote: "ISOLATED SYNTHETIC FIXTURE", documentHash: hash(policy), assumptionHash: hash(assumptions) } }, source: {}, reason: "ISOLATED SYNTHETIC TEST", createdBy: actors.dataAdmin.id, effectiveAt: new Date("2026-10-04") } });
  const market = marketFixture();
  const marketRow = await db.assumptionSetVersion.create({ data: { version: policyRow.version + 1, modelCode: "monthly-total-return-data-v1", status: "PUBLISHED", values: json(market), policy: { approval: { actor: actors.approver.id, approvedAt: new Date().toISOString(), reviewNote: "SYNTHETIC TEST ONLY", documentHash: digest(market) } }, source: {}, reason: "SYNTHETIC TEST ONLY", createdBy: actors.dataAdmin.id, effectiveAt: new Date("2020-01-01") } });
  const profile = retirementProfile();
  profile.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("2000000000"), retirementShare: known("0.8"), emergencyShare: known("0.2"), otherGoalsShare: known("0") })] };
  profile.incomeStability = known("STABLE"); profile.lossTolerance = { percent: known("50"), amountVnd: known("1000000000") }; profile.goals = empty();
  profile.expenses = { status: "KNOWN", entries: [{ id: "living", label: "Chi thiết yếu", category: "ESSENTIAL", amount: known("1000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] };
  await db.financialProfile.create({ data: { userId: actors.userA.id, schemaVersion: 2, revision: 1, profileData: json(profileV2Schema.parse(profile)), completedAt: new Date(), asOfDate: new Date("2026-10-04") } });
  await db.retirementGoal.create({ data: { userId: actors.userA.id, targetRetirementAge: 37, lifeExpectancy: 85, riskLevel: "HIGH", lifestyle: "Test only", monthlyExpense: "1000000", monthlyContribution: "100", revision: 1 } });
  const command = retirementCommand(policyRow.id);
  const retirement = new RetirementService(db), capture = await retirement.capture(db, actors.userA.id, command);
  const preview = retirement.evaluate(capture, command);
  if (preview.status !== "READY") throw new Error("Fixture preview incomplete: " + JSON.stringify(preview.issues));
  const plans = new PlansService(db);
  const saved = await plans.createVersion(actors.userA.id, null, { expectedRevision: 0, expectedInputHash: preview.inputHash, preview: command }, randomUUID());
  await plans.apply(actors.userA.id, saved.planId, { versionId: saved.saved.id, expectedRevision: saved.revision, expectedProfileRevision: 1, confirm: true }, randomUUID());
  const partner = await db.partner.create({ data: { name: "Synthetic test issuer", type: "BANK", isVisible: true } });
  const service = new RecommendationService(db);
  const productIds = [];
  for (let i = 0; i < 2; i++) {
    const product = await db.partnerProduct.create({ data: { partnerId: partner.id, name: `Synthetic cash ${i}`, category: "TERM_DEPOSIT", expectedReturn: "TEST ONLY", riskLevel: "LOW", isVisible: true } });
    await service.writeProduct(actors.dataAdmin.id, product.id, { expectedRevision: 0, data: { code: `TEST_CASH_${i}`, assetClass: "CASH", category: "TERM_DEPOSIT", nav: "10000", annualExpenseRatioPercent: "0", liquidityDays: 0, lotSize: 1, minimumInvestmentVnd: "10000", riskScore: 1, isDistributionPermitted: true, status: "ACTIVE", sourceKind: "TEST_FIXTURE", sourceReference: "Synthetic fixture for isolated verification", currency: "VND", priceAsOf: new Date().toISOString().slice(0, 10), validUntil: "2030-01-01", distributionEvidence: "TEST ONLY, no real authorization claimed" } });
    productIds.push(product.id);
  }
  return { actors, password, planId: saved.planId, versionId: saved.saved.id, productIds, command, marketVersionId: marketRow.id };
}
