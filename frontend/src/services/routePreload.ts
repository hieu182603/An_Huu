// Fetch code only on navigation intent; this never requests account data.
const routes: Record<string, () => Promise<unknown>> = {
  "/user/dashboard": () => import("../pages/UserDashboard"),
  "/user/goal": () => import("../pages/RetirementGoalPage"),
  "/user/plan": () => import("../pages/RetirementPlanPage"),
  "/user/simulation": () => import("../pages/SimulationTrackingPage"),
  "/user/assistant": () => import("../pages/AIAssistantPage"),
  "/user/explore": () => import("../pages/ExplorePage"),
  "/user/account": () => import("../pages/AccountPage"),
  "/user/support": () => import("../pages/SupportPage"),
  "/user/notifications": () => import("../pages/NotificationsPage"),
  "/admin/dashboard": () => import("../pages/admin/AdminOverviewApi"),
  "/admin/reports": () => import("../pages/admin/AdminOverviewApi"),
  "/admin/users": () => import("../pages/admin/AdminUsersApi"),
  "/admin/content": () => import("../pages/admin/AdminContentApi"),
  "/admin/support": () => import("../pages/SupportPage"),
  "/admin/operations": () => import("../pages/admin/AdminOperationsPage"),
};
const requested = new Set<string>();
export function preloadRoute(path: string) {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType || "")) return;
  const load = routes[path];
  if (!load || requested.has(path)) return;
  requested.add(path);
  void load().catch(() => { requested.delete(path); });
}

export function routeIntent(path: string) {
  return { onPointerEnter: () => preloadRoute(path), onFocus: () => preloadRoute(path), onTouchStart: () => preloadRoute(path) };
}
