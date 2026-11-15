import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setupRemaining } from "./remaining-helpers";

const output = fileURLToPath(new URL("../../artifacts/frontend-task-review-2026-11-15/", import.meta.url));
test.afterEach(async ({ page }) => { await page.waitForLoadState("networkidle"); });

for (const width of [1440, 390]) test(`T2–T8 visual and navigation contract at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setupRemaining(page, request, "/user/dashboard");
  mkdirSync(output, { recursive: true });
  const observations: unknown[] = [], failures: string[] = [];
  for (const [name, path] of [
    ["dashboard", "/user/dashboard"], ["profile", "/user/profile"], ["goal", "/user/goal"], ["plan", "/user/plan"],
    ["allocation", "/user/risk-portfolio"], ["compare", "/user/plan?view=compare"], ["history", "/user/plan?view=history"],
    ["report", "/user/plan?view=report"], ["cashflow", "/user/profile?section=cashflow"], ["assets", "/user/profile?section=assets"],
    ["debts", "/user/debts"], ["insurance", "/user/profile?section=insurance"], ["family", "/user/profile?section=family"],
    ["tracking", "/user/simulation"],
  ]) {
    await page.goto(path); await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle"); await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    const metrics = await page.evaluate(() => {
      const title = document.querySelector("main h1")!, shell = document.querySelector(".user-dashboard-shell")!;
      const heading = getComputedStyle(title), styles = getComputedStyle(shell);
      const sidebar = document.querySelector(".user-sidebar")!, active = sidebar.querySelector("a.is-active");
      return { title: document.title, font: styles.fontFamily, background: styles.backgroundColor, heading: { color: heading.color, size: heading.fontSize },
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        sidebar: { width: sidebar.getBoundingClientRect().width, background: getComputedStyle(sidebar).backgroundColor,
          active: active ? { radius: getComputedStyle(active).borderRadius, fontSize: getComputedStyle(active).fontSize, weight: getComputedStyle(active).fontWeight,
            rightGap: sidebar.getBoundingClientRect().right - active.getBoundingClientRect().right } : null,
          solidIcons: [...sidebar.querySelectorAll(".admin-nav a")].filter(a => a.querySelector("svg")?.getAttribute("stroke-width") !== "1.7").map(a => a.textContent?.trim()) },
      };
    });
    const text = await page.locator("main").innerText(); observations.push({ name, ...metrics });
    if (metrics.overflow) failures.push(`${name}: horizontal overflow`);
    if (!metrics.font.includes("Be Vietnam Pro")) failures.push(`${name}: body font ${metrics.font}`);
    if (metrics.background !== "rgb(246, 247, 249)") failures.push(`${name}: background ${metrics.background}`);
    if (metrics.heading.color !== "rgb(19, 43, 69)") failures.push(`${name}: H1 color ${metrics.heading.color}`);
    if (width === 390 && metrics.heading.size !== "25px") failures.push(`${name}: H1 size ${metrics.heading.size}`);
    if (/\b\d{4}-\d{2}\b/.test(text)) failures.push(`${name}: ISO month visible`);
    if (/,\d{2} ₫/.test(text)) failures.push(`${name}: fractional VND visible`);
    if (name === "dashboard" && width === 1440) {
      if (metrics.sidebar.width !== 252) failures.push(`sidebar width ${metrics.sidebar.width}`);
      if (metrics.sidebar.background !== "rgb(7, 30, 64)") failures.push(`sidebar background ${metrics.sidebar.background}`);
      if (metrics.sidebar.active?.radius !== "10px") failures.push(`sidebar active radius ${metrics.sidebar.active?.radius}`);
      if ((metrics.sidebar.active?.rightGap ?? 0) < 10) failures.push(`sidebar active flush against edge`);
      if (metrics.sidebar.solidIcons.length) failures.push(`sidebar solid icons: ${metrics.sidebar.solidIcons.join(", ")}`);
    }
    if (name === "allocation" && metrics.title !== "Phân bổ tài sản | An Hưu") failures.push(`allocation tab title: ${metrics.title}`);
    if (name === "plan") {
      if (!await page.locator(".plan-gap-explanation").isVisible()) failures.push("plan: no visible explanation of projected fund, gap and preparation time");
      await expect(page.locator(".plan-gap-explanation")).not.toContainText(/còn thiếu\s*-/);
      if (text.includes("đến 85 tuổi")) failures.push("plan: custom fixture horizon is incorrectly labeled age 85");
      await page.getByText("Chi tiết dòng tiền và giả định", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Kế hoạch qua từng giai đoạn", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Dòng tiền tổng hợp theo năm", exact: true })).toBeVisible();
      await expect(page.locator(".plan-narrative")).not.toContainText(/còn thiếu\s*-/);
    }
    if (name === "compare") {
      const delay = page.getByLabel("Số năm nghỉ muộn hơn", { exact: true }), cut = page.getByLabel("Mức giảm chi tiêu (%)", { exact: true });
      await delay.fill(""); await expect(delay).toHaveValue("");
      await expect(page.getByRole("status").filter({ hasText: "Nhập số năm từ 1 đến 20" })).toBeVisible();
      await delay.fill("2"); await cut.fill(""); await expect(cut).toHaveValue("");
      await cut.fill("51"); await expect(page.getByRole("status").filter({ hasText: "Nhập số năm từ 1 đến 20" })).toBeVisible();
      await cut.fill("20"); await expect(page.locator(".guided-scenario")).toHaveCount(3);
    }
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
  }
  if (width === 390) {
    await expect(page.locator(".user-mobile-nav")).toHaveText(/Tổng quan\s*Tài chính\s*Kế hoạch\s*Thêm/);
    await page.locator(".user-mobile-nav").getByRole("button", { name: "Thêm", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("link", { name: "Điều chỉnh tương lai", exact: true }).click();
    await expect(page).toHaveURL(/tab=what-if/); await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  writeFileSync(`${output}/observations-${width}.json`, JSON.stringify({ observations, failures }, null, 2));
  expect(failures).toEqual([]);
});
