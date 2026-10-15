import { test, expect } from "@playwright/test";
import { installRouteAuth } from "./helpers";

test.setTimeout(30000);

for (const width of [1440, 390]) {
  test(`knowledge directory uses shared pagination and filters all sources at ${width}px`, async ({ page }, testInfo) => {
    await installRouteAuth(page, "ADM-001");
    await page.setViewportSize({ width, height: 950 });
    const items = Array.from({ length: 65 }, (_, index) => ({
      id: `source-${index + 1}`, title: `Tài liệu ${String(index + 1).padStart(2, "0")}`,
      referenceCode: `REF-${index + 1}`, category: index < 50 ? "LEGAL_SOCIAL_INSURANCE" : "LEGAL_RETIREMENT_AGE",
      version: "1.0", revision: 0, status: "INDEXED", isApproved: true, indexMethod: "LEXICAL_V1",
      fileUrl: null, effectiveDate: "2026-01-01", validUntil: null, indexedHash: "hash", contentHash: "hash",
    }));
    const requestedPages: number[] = [];
    await page.route("**/api/v1/admin/knowledge?**", async (route) => {
      const query = new URL(route.request().url()).searchParams;
      const current = Number(query.get("page"));
      const limit = Number(query.get("limit"));
      requestedPages.push(current);
      await route.fulfill({ json: { data: { page: current, limit, total: items.length,
        items: items.slice((current - 1) * limit, current * limit) } } });
    });
    await page.goto("/admin/ai");
    const pagination = page.getByRole("navigation", { name: "Phân trang", exact: true });
    const rows = width === 1440 ? page.locator(".ai-source-table tbody tr") : page.locator(".ai-source-mobile-list > .card");
    await expect(pagination).toContainText("Trang 1 / 7 (65 mục)");
    await expect(rows).toHaveCount(10);
    expect(requestedPages).toEqual([1, 2]);
    await pagination.getByRole("button", { name: "Trang tiếp", exact: true }).click();
    await expect(rows.first()).toContainText("Tài liệu 11");
    await pagination.getByRole("button", { name: "Trang cuối", exact: true }).click();
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText("Tài liệu 61");
    await expect(pagination.getByRole("button", { name: "Trang tiếp", exact: true })).toBeDisabled();
    await pagination.getByLabel("Số dòng mỗi trang").selectOption("20");
    await expect(pagination).toContainText("Trang 1 / 4 (65 mục)");
    await expect(rows).toHaveCount(20);
    await pagination.getByRole("button", { name: "Trang cuối", exact: true }).click();
    await page.getByLabel("Tìm kiếm nguồn dữ liệu").fill("REF-65");
    await expect(pagination).toContainText("Trang 1 / 1 (1 mục)");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Tài liệu 65");
    await page.getByLabel("Tìm kiếm nguồn dữ liệu").fill("");
    await page.getByLabel("Phân loại nguồn").selectOption({ label: "Tuổi nghỉ hưu" });
    await expect(pagination).toContainText("Trang 1 / 1 (15 mục)");
    await expect(rows).toHaveCount(15);
    await page.getByLabel("Tìm kiếm nguồn dữ liệu").fill("không tồn tại");
    await expect(pagination).toContainText("Trang 1 / 1 (0 mục)");
    await expect(pagination.getByRole("button", { name: "Trang đầu", exact: true })).toBeDisabled();
    await page.getByLabel("Tìm kiếm nguồn dữ liệu").fill("");
    await pagination.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("knowledge-pagination.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: /Xem thêm tài liệu/ })).toHaveCount(0);
  });
}

test("approving a knowledge source uses an in-app dialog with a required note", async ({ page }) => {
  await installRouteAuth(page, "ADM-001");
  page.on("dialog", (dialog) => { throw new Error(`Native dialog opened: ${dialog.message()}`); });
  const source = { id: "source-1", title: "Luật Bảo hiểm xã hội 2024", referenceCode: "41/2024/QH15", category: "LEGAL_SOCIAL_INSURANCE",
    version: "1.0", revision: 2, status: "INDEXED", isApproved: false, indexMethod: "LEXICAL_V1",
    fileUrl: null, effectiveDate: "2025-07-01", validUntil: null, indexedHash: "hash", contentHash: "hash" };
  let approvalBody: any = null;
  await page.route("**/api/v1/admin/knowledge?**", (route) => route.fulfill({ json: { data: { page: 1, limit: 50, total: 1, items: [source] } } }));
  await page.route("**/api/v1/admin/knowledge/source-1/approval", async (route) => {
    approvalBody = route.request().postDataJSON();
    await route.fulfill({ json: { data: { ...source, isApproved: true, revision: 3 } } });
  });
  await page.goto("/admin/ai");
  await page.locator(".ai-source-table").getByTitle("Phê duyệt nguồn").click();
  const dialog = page.getByRole("dialog", { name: "Phê duyệt nguồn tri thức" });
  const confirm = dialog.getByRole("button", { name: "Phê duyệt", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Ghi chú kiểm duyệt (bắt buộc)").fill("  Đã đối chiếu Công báo  ");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  expect(approvalBody).toEqual({ expectedRevision: 2, approved: true, reviewNote: "Đã đối chiếu Công báo", confirm: true });
  await expect(page.locator(".ai-source-table").getByTitle("Đã duyệt (Bấm để thu hồi)")).toBeVisible();
});
