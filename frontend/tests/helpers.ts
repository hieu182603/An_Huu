import type { Page } from "@playwright/test";

export async function installRouteAuth(page: Page) {
  await page.addInitScript(() => {
    const key = "an_huu_auth_user";
    const admin = { id: "ADM-001", initials: "LA", name: "Lê Lan Anh", email: "admin@demo.com", detail: "Quản trị viên", role: "admin" };
    const user = { id: "USR-001", initials: "NA", name: "Nguyễn Minh An", email: "user@demo.com", detail: "Gói Chuẩn bị Tương lai", role: "user" };
    if (location.pathname.startsWith("/admin")) sessionStorage.setItem(key, JSON.stringify(admin));
    else if (location.pathname.startsWith("/user") || location.pathname === "/onboarding") sessionStorage.setItem(key, JSON.stringify(user));
  });
}
