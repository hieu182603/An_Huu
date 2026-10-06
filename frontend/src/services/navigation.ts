// Only resume known private screens for the authenticated role.
export function resumeDestination(from: unknown, role: "user" | "admin", fallback?: string): string {
  const home = fallback || (role === "admin" ? "/admin/dashboard" : "/user/dashboard");
  if (typeof from !== "string" || /[\\\s]/.test(from) || !from.startsWith("/") || from.startsWith("//")) return home;
  const path = from.split(/[?#]/)[0];
  const allowed = role === "user"
    ? /^\/(?:onboarding|user(?:\/(?:dashboard|goal|plan|simulation|debts|risk-portfolio|assistant|explore|account|support|notifications))?)$/
    : /^\/admin(?:\/(?:dashboard|users(?:\/[^/]+)?|content|partners|ai|financial-config|support|operations|reports|settings(?:\/(?:general|integrations|notifications|privacy|audit-log))?))?$/;
  return allowed.test(path) ? from : home;
}
