import { authenticatedRequest } from "./api";
import * as userRoutes from "../userRoutes";

// Fetch code on navigation intent. Admin routes also warm their first data
// request so it runs in parallel with the chunk instead of after mount; user
// routes never request account data here.
const routes: Record<string, () => Promise<unknown>> = {
  "/onboarding": userRoutes.OnboardingPage.preload,
  "/user/profile": userRoutes.FinancialProfilePage.preload,
  "/user/simulation": userRoutes.SimulationTrackingPage.preload,
  "/user/dashboard": userRoutes.UserDashboard.preload,
  "/user/goal": userRoutes.RetirementGoalPage.preload,
  "/user/plan": userRoutes.RetirementPlanPage.preload,
  "/user/knowledge": userRoutes.KnowledgePage.preload,
  "/user/debts": userRoutes.DebtAnalysisPage.preload,
  "/user/risk-portfolio": userRoutes.RiskPortfolioPage.preload,
  "/user/assistant": userRoutes.AIAssistantPage.preload,
  "/user/explore": userRoutes.ExplorePage.preload,
  "/user/account": userRoutes.AccountPage.preload,
  "/user/support": userRoutes.SupportPage.preload,
  "/user/notifications": userRoutes.NotificationsPage.preload,
  "/admin/dashboard": () => import("../pages/admin/AdminDashboardPage"),
  "/admin/reports": () => import("../pages/admin/AdminReportsPage"),
  "/admin/investment-roles": () => import("../pages/admin/AdminInvestmentRolesPage"),
  "/admin/broadcast": () => import("../pages/admin/AdminBroadcastPage"),
  "/admin/operations": () => import("../pages/admin/AdminSystemHealthPage"),
  "/admin/users": () => import("../pages/admin/AdminUsersApi"),
  "/admin/content": () => import("../pages/admin/AdminContentApi"),
  "/admin/support": userRoutes.SupportPage.preload,
  "/admin/partners": () => import("../pages/admin/AdminBusinessPages"),
  "/admin/ai": () => import("../pages/admin/AdminAIConfigPages"),
  "/admin/financial-config": () => import("../pages/admin/AdminFinancialConfigPage"),
  "/admin/legal-rules": () => import("../pages/admin/AdminLegalRulesPage"),
  "/admin/settings/general": () => import("../pages/admin/settings/GeneralSettingsPage"),
  "/admin/settings/security": () => import("../pages/admin/settings/SecuritySettingsPage"),
  "/admin/settings/notifications": () => import("../pages/admin/settings/NotificationSettingsPage"),
  "/admin/settings/logs": () => import("../pages/admin/settings/SystemLogsPage"),
};
// Keys must match each page's initial request exactly (same path + query order)
// so the page reuses the in-flight/cached response from api.ts.
const adminData: Record<string, string[]> = {
  "/admin/dashboard": ["/admin/overview"],
  "/admin/reports": ["/admin/reports?days=30"],
  "/admin/users": ["/admin/users?page=1&limit=10&search="],
  "/admin/content": ["/admin/content?page=1&limit=10&kind=ARTICLE&search="],
  "/admin/support": ["/admin/support?page=1&limit=20"],
  "/admin/partners": ["/admin/products?page=1&limit=10", "/admin/partners?page=1&limit=1", "/admin/products?page=1&limit=1"],
  "/admin/ai": ["/admin/knowledge?page=1&limit=50"],
  "/admin/financial-config": ["/admin/assumptions?page=1&limit=100"],
  "/admin/legal-rules": ["/admin/legal-rules"],
};
const requested = new Set<string>();
// The user shell is needed by every /user page; without this it would only
// start downloading after the session restore has finished.
const preloadUserShell = () => { void userRoutes.UserLayout.preload(); };
// Profile and plan providers wrap /onboarding and every /user page.
const preloadAccount = () => { void userRoutes.AccountProviders.preload(); };
export function preloadRoute(target: string) {
  const path = target.split(/[?#]/)[0];
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType || "")) return;
  // Cached for 45s and de-duplicated in api.ts, so repeated hovers cost nothing.
  for (const dataPath of adminData[path] || []) void authenticatedRequest(dataPath).catch(() => {});
  if (path === "/user" || path.startsWith("/user/")) { preloadAccount(); preloadUserShell(); }
  if (path === "/onboarding") { preloadAccount(); void userRoutes.FinancialProfileGate.preload(); }
  // The default tab is its own (large) lazy chunk inside the page.
  if (path === "/user/simulation" && !/[?&]tab=what-if\b/.test(target) && !requested.has("actuals-tab")) {
    requested.add("actuals-tab");
    void import("../pages/simulation/ActualsTab").catch(() => { requested.delete("actuals-tab"); });
  }
  const load = routes[path];
  if (!load || requested.has(path)) return;
  requested.add(path);
  void load().catch(() => { requested.delete(path); });
}

export function routeIntent(path: string) {
  return { onPointerEnter: () => preloadRoute(path), onFocus: () => preloadRoute(path), onTouchStart: () => preloadRoute(path) };
}
