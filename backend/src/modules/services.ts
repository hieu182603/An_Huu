import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config/env";
import { AuthService } from "./auth/service";
import { ProfileService } from "./profiles/service";
import { getIO } from "../config/socket";
import { UsersService } from "./users/service";
import { ContentService } from "./content/service";
import { CommunityService } from "./community/service";
import { OperationsService } from "./operations/service";
import { DebtService } from "./debts/service";
import { AssumptionsService } from "./assumptions/service";
import { PortfoliosService } from "./portfolios/service";
import { PensionsService } from "./pensions/service";
import { RetirementService } from "./retirement/service";
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
export function createServices(db: PrismaClient, config: AppConfig) {
  const settings = new SystemSettingsService(db);
  return {
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
    retirement: new RetirementService(db),
    plans: new PlansService(db),
    actuals: new ActualsService(db),
    ai: new AiService(db, createExplanationProvider(config), config.GEMINI_TIMEOUT_MS),
    knowledge: new KnowledgeService(db),
    content: new ContentService(db),
    community: new CommunityService(db),
    operations: new OperationsService(db),
    users: new UsersService(db, id => { try { getIO().in("user:" + id).disconnectSockets(true); } catch { /* HTTP-only tests. */ } }),
  };
}
