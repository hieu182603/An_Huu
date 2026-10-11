import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";

// Read-only route audit. All API traffic uses fixtures or the runner's 503 guard.
const routes = ["/", "/cach-hoat-dong", "/mo-phong", "/tro-ly-ai", "/kien-thuc", "/kien-thuc/missing", "/login", "/register", "/forgot-password", "/reset-password", "/verify", "/onboarding", "/user/dashboard", "/user/goal", "/user/plan", "/user/simulation", "/user/debts", "/user/risk-portfolio", "/user/assistant", "/user/explore", "/user/account", "/user/support", "/user/notifications", "/admin/dashboard", "/admin/users", "/admin/users/USR-1082", "/admin/content", "/admin/partners", "/admin/ai", "/admin/financial-config", "/admin/support", "/admin/reports", "/admin/settings/general", "/admin/settings/security", "/admin/settings/notifications", "/admin/settings/logs", "/missing-page"];
routes.splice(5, 0, "/kien-thuc/ui-audit-article");

for (const width of [390, 768, 1024, 1440]) {
  test(`page audit ${width}px`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installRouteAuth(page);
    await installFinancialProfileRoutes(page);
    await page.route("**/api/v1/content/missing", route => route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Bài viết không còn khả dụng" } } }));
    await page.route("**/api/v1/content/ui-audit-article", route => route.fulfill({ json: { data: { id: "audit-article", slug: "ui-audit-article", title: "Bài viết kiểm thử giao diện", excerpt: "Dữ liệu mẫu chỉ dùng kiểm tra bố cục trang chi tiết.", content: "Nội dung kiểm thử có nhiều đoạn.\n\nKhông phải tư vấn tài chính hoặc bài viết được xuất bản.", category: "Kiến thức", authorName: "Kiểm thử UI", publishedAt: "2026-10-07T00:00:00Z", thumbnail: null, kind: "ARTICLE", status: "PUBLISHED" } } }));
    const output = path.resolve("../.cache/ui-route-audit", process.env.UI_AUDIT_PHASE || "initial", String(width));
    await mkdir(output, { recursive: true });
    const results: unknown[] = [];
    let errors: string[] = [];
    let failedApis: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      if (response.status() >= 400 && response.url().includes("/api/")) failedApis.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    for (const route of routes) {
      errors = []; failedApis = [];
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      const findings = await page.evaluate(() => {
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect(), s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
        };
        const label = (el: Element) => el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") || "").split(" ").map(id => document.getElementById(id)?.textContent || "").join(" ").trim() || Array.from((el as HTMLInputElement).labels || []).map(l => l.textContent).join(" ").trim() || el.getAttribute("title") || "";
        const controls = Array.from(document.querySelectorAll("input:not([type=hidden]),select,textarea")).filter(visible);
        const unnamedControls = controls.filter(el => !label(el)).map(el => `${el.tagName} ${el.getAttribute("placeholder") || el.getAttribute("type") || ""}`);
        const unnamedButtons = Array.from(document.querySelectorAll("button")).filter(visible).filter(el => !label(el) && !el.textContent?.trim()).map(el => el.outerHTML.slice(0, 200));
        const overflow = Array.from(document.querySelectorAll<HTMLElement>("main *,#main-content *")).filter(el => {
          if (!visible(el) || el.closest("svg,.sr-only,.label-hidden")) return false;
          const r = el.getBoundingClientRect();
          if (r.left >= -2 && r.right <= innerWidth + 2) return false;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (["auto", "scroll"].includes(getComputedStyle(p).overflowX)) return false;
          }
          return true;
        }).slice(0, 10).map(el => `${el.tagName}.${el.className}`);
        return { title: document.title, headings: Array.from(document.querySelectorAll("h1")).map(el => el.textContent), mainCount: document.querySelectorAll("#main-content").length, unnamedControls, unnamedButtons, overflow, brokenImages: Array.from(document.images).filter(el => visible(el) && el.complete && !el.naturalWidth).map(el => el.getAttribute("src")), alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(el => el.textContent?.slice(0, 300)) };
      });
      const file = (route === "/" ? "home" : route.slice(1).replaceAll("/", "-")) + ".png";
      await page.screenshot({ path: path.join(output, file), fullPage: true, animations: "disabled" });
      results.push({ route, actualPath: new URL(page.url()).pathname, screenshot: file, errors: [...errors], failedApis: [...new Set(failedApis)], ...findings });
      await writeFile(path.join(output, "audit.json"), JSON.stringify(results, null, 2));
      expect.soft(errors, route).toEqual([]);
      expect.soft(findings.unnamedControls, route).toEqual([]);
      expect.soft(findings.unnamedButtons, route).toEqual([]);
      expect.soft(findings.overflow, route).toEqual([]);
      expect.soft(findings.brokenImages, route).toEqual([]);
      expect.soft(findings.mainCount, route).toBe(1);
      expect.soft(new URL(page.url()).pathname, route).toBe(route === "/verify" ? "/register" : route);
    }
    expect(results).toHaveLength(routes.length);
  });
}
