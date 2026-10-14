import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth } from "./helpers";
import type { AssumptionDetail } from "../src/services/assumptions";
import type { AdminLegalRuleItem } from "../src/services/legalRules";

test.setTimeout(30000);

async function fixtures(page: Page) {
  await installRouteAuth(page, "ADM-001");
  const mutations: { path: string; body: any }[] = [];
  const assumptions: AssumptionDetail[] = ["DRAFT", "APPROVED"].map((status, index) => ({
    id: `asm-${index + 1}`, version: index + 1, revision: 3, status: status as AssumptionDetail["status"],
    createdBy: "admin", createdAt: "2026-10-01T00:00:00Z", publishedBy: null, effectiveAt: null,
    approval: null, documentHash: `hash-${index}`,
    data: { schemaVersion: 2, title: `Giả định tài chính ${2026 + index}`, currency: "VND", effectiveFrom: "2026-01-01",
      projectionStartYear: 2026 + index, projectionEndYear: 2050, reason: `Căn cứ phiên bản ${index + 1}`,
      sources: [{ id: "source-1", title: "Nguồn tham chiếu kinh tế", publisher: "Cơ quan thống kê", kind: "HISTORICAL_OFFICIAL",
        url: "https://example.com", release: "2026", publishedOn: "2026-01-01", retrievedOn: "2026-01-02", fromYear: 2020, toYear: 2026, note: "" }],
      historicalCpi: [], inflation: [], assetClasses: [], returns: [] },
  }));
  await page.route("**/api/v1/admin/assumptions**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const item = assumptions.find((entry) => path.includes(`/${entry.id}`));
    if (route.request().method() !== "GET") {
      const body = route.request().postDataJSON();
      mutations.push({ path, body });
      if (path.endsWith("/validate")) return route.fulfill({ json: { data: { status: "VALID", issues: [] } } });
      if (path.endsWith("/impact")) return route.fulfill({ json: { data: { status: "VALID", issues: [], impactToken: "impact-1", baselineId: null, currentPlansChanged: 0 } } });
      if (item && path.endsWith("/publish")) {
        item.status = "PUBLISHED"; item.revision++;
        return route.fulfill({ json: { data: item } });
      }
      return route.fulfill({ status: 400, json: { error: { code: "TEST", message: "Unexpected mutation" } } });
    }
    return route.fulfill({ json: { data: item ?? { status: "AVAILABLE", items: assumptions.map((entry) => ({ ...entry, ...entry.data })), total: 2, page: 1, limit: 100 } } });
  });
  const rules: AdminLegalRuleItem[] = ["PUBLISHED", "DRAFT", "VALIDATED", "REVIEWED"].map((status, index) => ({
    id: `rule-${index + 1}`, status: status as AdminLegalRuleItem["status"], revision: 4, version: index + 1,
    documentHash: `document-hash-${index + 1}`, knowledgeAsOf: "2026-10-01", publishedAt: null,
    draft: { code: `BHXH_${index + 1}`, effectiveFrom: "2026-01-01", effectiveTo: null, supersedesId: null,
      document: { schemaVersion: 1, engineCode: "vn-pension-compulsory-2025",
        coverage: [{ branch: "BH1_COMPULSORY_NORMAL", strategyCode: "STANDARD_RETIREMENT_2025", citationIds: ["cite-1"], requiredTableKeys: ["AGE"] }],
        citations: [{ id: "cite-1", instrument: "Luật Bảo hiểm xã hội", locator: "Điều 98", url: "https://example.com/legal",
          contentHash: "hash", effectiveFrom: "2025-07-01", effectiveTo: null }],
        tables: [{ kind: "AGE_MONTHS", key: "AGE", value: "744", effectiveFrom: "2026-01-01", effectiveTo: null, citationId: "cite-1" }] } },
    validation: status === "DRAFT" ? null : { valid: true, validationHash: "validation-hash", checkedAt: "2026-10-01" },
    review: status === "REVIEWED" ? { actor: "reviewer", reviewedAt: "2026-10-01", reviewNote: "Đã rà soát", validationHash: "validation-hash", draftHash: "draft-hash", reviewHash: "review-hash" } : null,
  }));
  await page.route("**/api/v1/admin/legal-rules**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      mutations.push({ path, body });
      const item = rules.find((entry) => path.endsWith(entry.id))!;
      item.draft = body.draft; item.revision++;
      return route.fulfill({ json: { data: item } });
    }
    return route.fulfill({ json: { data: { items: rules } } });
  });
  await page.route("**/api/v1/admin/settings/logs/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const common = { id: "log-1", createdAt: "2026-10-01T12:00:00Z", ipAddress: "127.0.0.1", userAgent: "Chrome / Windows" };
    const item = path.endsWith("/audit") ? { ...common, action: "UPDATE_SYSTEM_SETTINGS", targetType: "SYSTEM_SETTINGS", targetId: "sys-1",
      performerName: "Quản trị viên", performerId: "admin", details: { before: { name: "Cũ" }, after: { name: "Mới" } } }
      : path.endsWith("/login") ? { ...common, identifier: "member@example.com", status: "FAILED", failureReason: "Sai mật khẩu", userId: null }
      : { ...common, level: "ERROR", source: "API", message: "Không thể xử lý yêu cầu", path: "/api/example", statusCode: 500, traceId: "trace-123", details: { code: "EXAMPLE" } };
    return route.fulfill({ json: { data: { items: [item], total: 1, page: 1, limit: 20 } } });
  });
  return mutations;
}

test("financial versions open matching details and preserve approval / publication confirmations", async ({ page }, testInfo) => {
  const mutations = await fixtures(page);
  await page.goto("/admin/financial-config");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const first = page.getByRole("button", { name: "Xem chi tiết: Giả định tài chính 2026" });
  await first.click();
  let dialog = page.getByRole("dialog", { name: "Chi tiết cấu hình tài chính" });
  await expect(dialog.getByRole("heading", { name: "Giả định tài chính 2026", exact: true })).toBeVisible();
  await expect(dialog.getByText("Nguồn tham chiếu kinh tế")).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(1000);
  await page.screenshot({ path: testInfo.outputPath("financial-detail.png") });
  await dialog.getByRole("button", { name: "Xem tác động và phê duyệt" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const approval = page.getByRole("dialog", { name: "Phê duyệt bộ giả định tài chính", exact: true });
  await expect(approval.getByRole("button", { name: "Xác nhận phê duyệt" })).toBeDisabled();
  await approval.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(first).toBeFocused();
  await page.getByRole("button", { name: "Xem chi tiết: Giả định tài chính 2027" }).click();
  await expect(dialog.getByRole("heading", { name: "Giả định tài chính 2027", exact: true })).toBeVisible();
  await expect(dialog.getByText("Căn cứ phiên bản 1", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Công bố phiên bản" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(mutations.filter((entry) => entry.path.endsWith("/publish"))).toHaveLength(0);
  await page.getByRole("button", { name: "Công bố ngay", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Công bố phiên bản" })).toHaveCount(0);
  expect(mutations.at(-1)).toEqual({ path: "/api/v1/admin/assumptions/asm-2/publish", body: { expectedRevision: 3, confirm: true } });
  await expect(page).toHaveURL(/\/admin\/financial-config$/);
});

test("legal actions target the chosen row and published rules remain read-only", async ({ page }, testInfo) => {
  const mutations = await fixtures(page);
  await page.goto("/admin/legal-rules");
  await expect(page.getByRole("button", { name: "Sửa dự thảo: BHXH_1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Phê duyệt độc lập: BHXH_3", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Công bố luật vận hành: BHXH_4", exact: true })).toBeVisible();
  const view = page.getByRole("button", { name: "Xem chi tiết: BHXH_2", exact: true });
  await view.click();
  const dialog = page.getByRole("dialog", { name: "Chi tiết bộ luật BHXH" });
  await expect(dialog.getByRole("heading", { name: "BHXH_2 (v2)" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("legal-detail.png") });
  await dialog.getByRole("button", { name: "Sửa dự thảo: BHXH_2" }).click();
  const edit = page.getByRole("dialog", { name: "Chỉnh sửa dự thảo: BHXH_2" });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(edit.locator('input[type="date"]').first()).toHaveValue("2026-01-01");
  await edit.getByRole("button", { name: /Lưu/ }).click();
  await expect(dialog).toBeVisible();
  expect(mutations[0].path).toBe("/api/v1/admin/legal-rules/rule-2");
  expect(mutations[0].body.expectedRevision).toBe(4);
  expect(mutations[0].body.draft.code).toBe("BHXH_2");
  await page.keyboard.press("Escape");
  await expect(view).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("legal-list.png") });
  await expect(page).toHaveURL(/\/admin\/legal-rules$/);
});

test("financial detail errors can retry without showing the previous version", async ({ page }) => {
  await fixtures(page);
  let fail = true;
  await page.route("**/api/v1/admin/assumptions/asm-2", async (route) => {
    if (fail) {
      fail = false;
      return route.fulfill({ status: 500, json: { error: { code: "TEST_ERROR", message: "Không thể tải phiên bản 2027" } } });
    }
    return route.fallback();
  });
  await page.goto("/admin/financial-config");
  await page.getByRole("button", { name: "Xem chi tiết: Giả định tài chính 2026" }).click();
  await expect(page.getByRole("dialog").getByText("Căn cứ phiên bản 1", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Xem chi tiết: Giả định tài chính 2027" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Không thể tải phiên bản 2027", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Căn cứ phiên bản 1", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(dialog.getByText("Căn cứ phiên bản 2", { exact: true })).toBeVisible();
});

test("all log tabs use detail popups and retain the audit search", async ({ page }, testInfo) => {
  await fixtures(page);
  await page.goto("/admin/settings/logs");
  const search = page.getByLabel("Tìm kiếm thao tác, người thực hiện");
  await search.fill("Quản trị");
  await page.getByRole("button", { name: "Lọc nhật ký", exact: true }).click();
  const view = page.getByRole("button", { name: "Xem chi tiết: Quản trị viên" });
  await view.click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Chi tiết nhật ký hoạt động");
  await expect(page.locator(".drawer")).toHaveCount(0);
  await expect(dialog.getByText("So sánh thay đổi (Trước và Sau)")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("audit-detail.png") });
  await page.keyboard.press("Escape");
  await expect(view).toBeFocused();
  await expect(search).toHaveValue("Quản trị");
  await page.getByRole("tab", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Xem chi tiết: member@example.com" }).click();
  await expect(dialog).toHaveAccessibleName("Chi tiết lượt đăng nhập");
  await expect(dialog.getByText("Chrome / Windows", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Lỗi hệ thống", exact: true }).click();
  await page.getByRole("button", { name: "Xem chi tiết: API" }).click();
  await expect(dialog).toHaveAccessibleName("Chi tiết lỗi hệ thống");
  await expect(dialog.getByText("trace-123", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/settings\/logs$/);
});

for (const [route, action] of [
  ["financial-config", "Xem chi tiết: Giả định tài chính 2026"],
  ["legal-rules", "Xem chi tiết: BHXH_2"],
  ["settings/logs", "Xem chi tiết: Quản trị viên"],
]) {
  test(`mobile popup fits viewport: ${route}`, async ({ page }, testInfo) => {
    await fixtures(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/${route}`);
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    if (route === "financial-config") await expect(dialog.getByText("Căn cứ phiên bản 1", { exact: true })).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("mobile-detail.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}
