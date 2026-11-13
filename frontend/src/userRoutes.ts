import { lazyRoute } from "./services/lazyRoute";

// Code-split pieces of the signed-in user area. App.tsx renders them and
// services/routePreload.ts fetches them ahead of navigation; sharing one
// lazyRoute per chunk lets a preloaded page render without a loader.
export const AccountProviders = lazyRoute(() => import("./context/AccountProviders"));
export const FinancialProfileGate = lazyRoute(() => import("./components/FinancialProfileGate"));
export const UserLayout = lazyRoute(() => import("./pages/UserLayout"));
export const OnboardingPage = lazyRoute(() => import("./pages/OnboardingPage"));
export const UserDashboard = lazyRoute(() => import("./pages/UserDashboard"));
export const RetirementGoalPage = lazyRoute(() => import("./pages/RetirementGoalPage"));
export const RetirementPlanPage = lazyRoute(() => import("./pages/RetirementPlanPage"));
export const SimulationTrackingPage = lazyRoute(() => import("./pages/SimulationTrackingPage"));
export const FinancialProfilePage = lazyRoute(() => import("./pages/FinancialProfilePage"));
export const AIAssistantPage = lazyRoute(() => import("./pages/AIAssistantPage"));
export const DebtAnalysisPage = lazyRoute(() => import("./pages/DebtAnalysisPage"));
export const RiskPortfolioPage = lazyRoute(() => import("./pages/RiskPortfolioPage"));
export const ExplorePage = lazyRoute(() => import("./pages/ExplorePage"));
export const KnowledgePage = lazyRoute(() => import("./pages/KnowledgePage"));
export const AccountPage = lazyRoute(() => import("./pages/AccountPage"));
export const SupportPage = lazyRoute(() => import("./pages/SupportPage"));
export const NotificationsPage = lazyRoute(() => import("./pages/NotificationsPage"));
