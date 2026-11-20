import { availableParallelism } from "node:os";
import { RecommendationService } from "./recommendation/service";
import { HoldingsRepository } from "./holdings/repository";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config/env";
import { setTransactionTimeout } from "../common/transaction";
import { AuthService } from "./auth/service";
import { ProfileService } from "./profiles/service";
import { getIO } from "../config/socket";
import { UsersService } from "./users/service";
import { ContentService } from "./content/service";
import { CommunityService } from "./community/service";
import { NotificationBroadcastService } from "./community/broadcast";
import { InvestmentRolesService } from "./users/investment-roles";
import { OperationsService } from "./operations/service";
import { DebtService } from "./debts/service";
import { AssumptionsService } from "./assumptions/service";
import { PortfoliosService } from "./portfolios/service";
import { PensionsService } from "./pensions/service";
import { RetirementService } from "./retirement/service";
import { createPreviewPool } from "./retirement/preview-pool";
import { PreviewCache } from "./retirement/preview-cache";
import { PlansService } from "./plans/service";
import { ActualsService } from "./actuals/service";
import { AiService } from "./ai/service";
import { createExplanationProvider } from "./ai/gemini";
import { KnowledgeService } from "./ai/knowledge";
import { CatalogService } from "./catalog/service";
import { InsuranceHistoryService } from "./pensions/history-service";
import { LegalRulesService } from "./pensions/legal-service";
import { PensionEstimateService } from "./pensions/estimate-service";
import { SystemSettingsService } from "./settings/service";
import { MarketDataService } from "./allocation-risk/market-service";
import { AllocationRiskService } from "./allocation-risk/service";
import { RebalanceDecisionService } from "./allocation-risk/rebalance-decisions";
import { ExplanationsService } from "./explanations/service";
import { BillingService } from "./billing/service";
import { BillingAdminService } from "./billing/admin-service";
import { PayosClient } from "./billing/payos";
export function createServices(db: PrismaClient, config: AppConfig) {
  setTransactionTimeout(config.DB_TRANSACTION_TIMEOUT_MS);
  const payosGateway = config.PAYOS_CLIENT_ID && config.PAYOS_API_KEY && config.PAYOS_CHECKSUM_KEY
    ? new PayosClient({ clientId: config.PAYOS_CLIENT_ID, apiKey: config.PAYOS_API_KEY, checksumKey: config.PAYOS_CHECKSUM_KEY, baseUrl: config.PAYOS_API_BASE_URL, timeoutMs: config.PAYOS_TIMEOUT_MS })
    : null;
  const settings = new SystemSettingsService(db);
  // Leave one core to the request thread: on a single vCPU (Azure B1) two busy workers
  // starved the event loop (eventloop.blocked 2-3.7 s). Searches use at most this many
  // workers; plain previews may start one more on demand so they never wait for a
  // 30-90 s search (preview-pool.ts). Override with PREVIEW_WORKERS.
  const previewWorkers = config.PREVIEW_WORKERS ?? (config.NODE_ENV === "test" ? 0 : Math.max(1, Math.min(2, availableParallelism() - 1)));
  const previewPool = previewWorkers > 0 ? createPreviewPool({ size: previewWorkers, timeoutMs: config.PREVIEW_TIMEOUT_MS }) : undefined;
  return {
    previewPool,
    recommendations: new RecommendationService(db, config.ENABLE_RECOMMENDATION_PUBLICATION === "true", config.RECOMMENDATION_LEGAL_AUTHORIZATION_REFERENCE),
    holdings: new HoldingsRepository(db),
    explanations: new ExplanationsService(db),
    marketData: new MarketDataService(db),
    allocationRisk: new AllocationRiskService(db, { continuous: config.ENABLE_CONTINUOUS_OPTIMIZER === "true", fallback: config.ENABLE_OPTIMIZER_FALLBACK === "true" }),
    rebalanceDecisions: new RebalanceDecisionService(db),
    catalog: new CatalogService(db),
    settings,
    auth: new AuthService(db, config, id => {
      try { getIO().in("user:" + id).disconnectSockets(true); } catch { /* No socket server in HTTP-only jobs/tests. */ }
    }, settings),
    profiles: new ProfileService(db),
    debts: new DebtService(db),
    assumptions: new AssumptionsService(db),
    portfolios: new PortfoliosService(db),
    pensions: new PensionsService(db),
    insuranceHistory: new InsuranceHistoryService(db),
    legalRules: new LegalRulesService(db),
    pensionEstimates: new PensionEstimateService(db),
    retirement: new RetirementService(db, previewPool?.run, config.NODE_ENV === "test" ? undefined : new PreviewCache()),
    plans: new PlansService(db),
    actuals: new ActualsService(db),
    ai: new AiService(db, createExplanationProvider(config), config.GEMINI_TIMEOUT_MS),
    knowledge: new KnowledgeService(db),
    content: new ContentService(db),
    community: new CommunityService(db),
    broadcasts: new NotificationBroadcastService(db),
    investmentRoles: new InvestmentRolesService(db),
    operations: new OperationsService(db),
    billing: new BillingService(db, payosGateway,
      { enabled: config.BILLING_ENABLED === "true", termsVersion: config.BILLING_TERMS_VERSION, checksumKey: config.PAYOS_CHECKSUM_KEY,
        returnUrl: config.BILLING_RETURN_URL ?? `${config.CLIENT_URL}/user/billing/result`,
        launchAt: config.BILLING_LAUNCH_AT ? new Date(config.BILLING_LAUNCH_AT) : null }),
    billingAdmin: new BillingAdminService(db, payosGateway, { enabled: config.BILLING_ENABLED === "true" }),
    users: new UsersService(db, id => { try { getIO().in("user:" + id).disconnectSockets(true); } catch { /* HTTP-only tests. */ } }),
  };
}
