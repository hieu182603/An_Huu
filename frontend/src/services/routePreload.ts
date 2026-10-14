import { authenticatedRequest } from "./api";

// Fetch code on navigation intent. Admin routes also warm their first data
// request so it runs in parallel with the chunk instead of after mount; user
// routes never request account data here.
const routes: Record<string, () => Promise<unknown>> = {
  "/user/dashboard": () => import("../pages/UserDashboard"),
  "/user/goal": () => import("../pages/RetirementGoalPage"),
  "/user/plan": () => import("../pages/RetirementPlanPage"),
  "/user/simulation": () => import("../pages/SimulationTrackingPage"),
  "/user/debts": () => import("../pages/DebtAnalysisPage"),
  "/user/risk-portfolio": () => import("../pages/RiskPortfolioPage"),
  "/user/assistant": () => import("../pages/AIAssistantPage"),
  "/user/explore": () => import("../pages/ExplorePage"),
  "/user/account": () => import("../pages/AccountPage"),
  "/user/support": () => import("../pages/SupportPage"),
  "/user/notifications": () => import("../pages/NotificationsPage"),
  "/admin/dashboard": () => import("../pages/admin/AdminDashboardPage"),
  "/admin/reports": () => import("../pages/admin/AdminReportsPage"),
  "/admin/users": () => import("../pages/admin/AdminUsersApi"),
  "/admin/content": () => import("../pages/admin/AdminContentApi"),
  "/admin/support": () => import("../pages/SupportPage"),
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
export function preloadRoute(path: string) {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType || "")) return;
  // Cached for 45s and de-duplicated in api.ts, so repeated hovers cost nothing.
  for (const dataPath of adminData[path] || []) void authenticatedRequest(dataPath).catch(() => {});
  const load = routes[path];
  if (!load || requested.has(path)) return;
  requested.add(path);
  void load().catch(() => { requested.delete(path); });
}

export function routeIntent(path: string) {
  return { onPointerEnter: () => preloadRoute(path), onFocus: () => preloadRoute(path), onTouchStart: () => preloadRoute(path) };
}
