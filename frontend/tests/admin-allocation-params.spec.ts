import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { installRouteAuth } from "./helpers";
import { source } from "./planning-contract-fixtures";

// Every API call is mocked: nothing is published and no database is touched.
const policies = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));
const POLICY_ID = "22222222-2222-4222-8222-222222222222";

async function base(page: Page) {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/**", r => r.fulfill({ status: 503, json: { error: { message: "Unmocked test API" } } }));
  await installRouteAuth(page, "ADM-001");
  await page.route("**/socket.io/**", r => r.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  return errors;
}

test("admin fills allocation parameters with a form and saves only a draft", async ({ page }) => {
  const errors = await base(page);
  const data = { ...policies.v2, title: "Chính sách kiểm thử", reason: "Chỉ dùng cho kiểm thử giao diện" };
  let stored = { id: POLICY_ID, version: 3, revision: 1, status: "DRAFT", data, documentHash: "fixture-hash", effectiveAt: null };
  const writes: Array<{ method: string; path: string; body: any }> = [];
  await page.route("**/api/v1/admin/portfolio-policies**", async r => {
    const req = r.request(), path = new URL(req.url()).pathname;
    if (req.method() === "GET") return r.fulfill({ json: { data: path.endsWith("/portfolio-policies") ? { items: [{ id: POLICY_ID, version: 3, title: data.title, status: "DRAFT" }], total: 1 } : stored } });
    const body = req.postDataJSON(); writes.push({ method: req.method(), path, body });
    if (req.method() === "PATCH") stored = { ...stored, data: body.data, revision: stored.revision + 1 };
    return r.fulfill({ json: { data: stored } });
  });
  await page.goto("/admin/portfolio-policies");
  await page.getByRole("button", { name: /v3 · Chính sách kiểm thử/ }).click();
  await expect(page.getByTestId("policy-templates-form")).toBeVisible();

  // Thresholds and shift step live in allocationRisk.
  await page.getByLabel(/Bước dịch cổ phiếu/).fill("10");
  await page.getByLabel(/Ngưỡng p thiết yếu/).fill("0.9");
  await page.getByLabel(/Ngưỡng p mọi mục tiêu/).fill("0.75");

  // Template weights must sum to 100%.
  const firstWeight = page.getByLabel("TPL_BASE_GLIDE 15 EQUITY %");
  await firstWeight.fill("59");
  await expect(page.getByTestId("policy-form-issues")).toContainText("tổng tỷ trọng là 99%");
  await expect(page.getByRole("button", { name: "Lưu bản nháp", exact: true })).toBeDisabled();
  await firstWeight.fill("60");

  // Customization: rows for every template asset class, min <= max, sums feasible.
  const custom = page.getByTestId("policy-customization-form");
  await custom.getByText("Bật tự điều chỉnh (customization)").click();
  await expect(page.getByTestId("policy-form-issues")).toContainText("Cho phép tự điều chỉnh cần cấu hình cú sốc thua lỗ");
  await custom.getByRole("textbox").first().fill("Biên độ do hội đồng đầu tư duyệt cho kiểm thử");
  const bounds: Record<string, [string, string]> = { CASH: ["5", "40"], GOV_BOND: ["10", "50"], EQUITY: ["30", "20"], GOLD: ["0", "15"] };
  for (const [code, [min, max]] of Object.entries(bounds)) { await page.getByLabel(`${code} min %`).fill(min); await page.getByLabel(`${code} max %`).fill(max); }
  await expect(page.getByTestId("policy-form-issues")).toContainText("EQUITY: min phải ≤ max.");
  await page.getByLabel("EQUITY min %").fill("10"); await page.getByLabel("EQUITY max %").fill("70");

  // Loss stress covering every class used by the templates.
  const stress = page.getByTestId("policy-loss-stress-form");
  await stress.getByText("Cấu hình cú sốc thua lỗ").click();
  await stress.getByRole("textbox").first().fill("Cú sốc lịch sử do admin duyệt cho kiểm thử");
  for (const [code, value] of Object.entries({ CASH: "0", GOV_BOND: "-5", EQUITY: "-40", GOLD: "-15" })) await page.getByLabel(`Cú sốc ${code} %`).fill(value);
  await expect(page.getByTestId("policy-form-issues")).toHaveCount(0);

  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await expect(page.getByText("Đã lưu bản nháp trên máy chủ.")).toBeVisible();
  expect(writes).toHaveLength(1);
  const saved = writes[0];
  expect(saved.method).toBe("PATCH");
  expect(saved.body.data.allocationRisk).toMatchObject({ equityShiftPoints: "10", essentialThreshold: "0.9", allGoalsThreshold: "0.75" });
  expect(saved.body.data.customization).toEqual({ evidence: "Biên độ do hội đồng đầu tư duyệt cho kiểm thử", path: "FOLLOW_TEMPLATE_SHIFTS", capitalBasis: "PROTECTED_CAPITAL_V1",
    bounds: [{ assetClass: "CASH", minPercent: "5", maxPercent: "40" }, { assetClass: "EQUITY", minPercent: "10", maxPercent: "70" }, { assetClass: "GOLD", minPercent: "0", maxPercent: "15" }, { assetClass: "GOV_BOND", minPercent: "10", maxPercent: "50" }] });
  expect(saved.body.data.lossStress).toMatchObject({ equityAssetClass: "EQUITY", depositAssetClass: "CASH" });
  expect(writes.some(w => /approve|publish/.test(w.path))).toBe(false);
  await page.screenshot({ path: "../.tmp/admin-params-review/policy-form.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("admin converts daily prices to monthly rows, previews errors and saves a draft", async ({ page }) => {
  const errors = await base(page);
  const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`);
  const preview = months.map((month, i) => ({ month, returns: { EQUITY: i === 4 ? null : "0.0125", CASH: "0.004" }, cpi: "0.003", monthEndDates: { EQUITY: i === 4 ? null : `${month}-28`, CASH: `${month}-28` } }));
  let invalid = true; const writes: Array<{ path: string; body: any }> = [];
  await page.route("**/api/v1/admin/market-data**", async r => {
    const req = r.request(), path = new URL(req.url()).pathname;
    if (req.method() === "GET") return r.fulfill({ json: { data: { items: [], total: 0 } } });
    const body = req.postDataJSON(); writes.push({ path, body });
    if (path.endsWith("/convert-daily")) return r.fulfill({ json: { data: invalid
      ? { status: "INVALID", assets: ["EQUITY", "CASH"], observationCount: 500, period: { from: "2025-01", to: "2025-12" }, rows: [], preview,
          issues: [{ code: "MONTH_MISSING", assetClass: "EQUITY", month: "2025-05", message: "EQUITY: không có dữ liệu trong tháng 2025-05." }], warnings: [] }
      : { status: "VALID", assets: ["EQUITY", "CASH"], observationCount: 520, period: { from: "2025-01", to: "2025-12" },
          preview: preview.map(p => ({ ...p, returns: { EQUITY: "0.0125", CASH: "0.004" } })), rows: months.map(month => ({ month, returns: { EQUITY: "0.0125", CASH: "0.004" }, cpi: "0.003" })),
          issues: [], warnings: [{ code: "LAST_MONTH_INCOMPLETE", month: "2026-01", message: "Tháng 2026-01 chưa có giá cuối tháng cho mọi lớp tài sản nên chưa được đưa vào." }] } } });
    return r.fulfill({ status: 201, json: { data: { id: "33333333-3333-4333-8333-333333333333", version: 1, revision: 1, status: "DRAFT", data: body, documentHash: "h", approval: null, effectiveAt: null } } });
  });
  await page.goto("/admin/market-data");
  await page.getByRole("button", { name: "Nhập tài liệu mới" }).click();
  const daily = page.getByTestId("market-daily-import");
  await daily.getByLabel("CSV giá theo ngày").fill("date,EQUITY,CASH\n2025-01-02,1000,100\n2025-01-31,1012.5,100.4");
  await daily.getByLabel("CSV CPI theo tháng").fill("month,cpi\n2025-01,0.3");
  await daily.getByRole("button", { name: "Quy đổi & xem trước" }).click();
  await expect(daily.getByText("Chưa thể dùng: còn lỗi dữ liệu")).toBeVisible();
  await expect(daily.getByText("EQUITY: không có dữ liệu trong tháng 2025-05.")).toBeVisible();
  await expect(daily.locator("td.is-missing")).toHaveCount(1);
  await expect(daily.getByRole("button", { name: "Đưa vào bản nháp" })).toHaveCount(0);

  invalid = false;
  await daily.getByRole("button", { name: "Quy đổi & xem trước" }).click();
  await expect(daily.getByText("Quy đổi hợp lệ")).toBeVisible();
  await expect(daily.getByText(/Tháng 2026-01 chưa có giá cuối tháng/)).toBeVisible();
  await expect(daily.getByText("Các lớp không có trong CSV sẽ bị bỏ khỏi tài liệu: GOV_BOND, GOLD.")).toBeVisible();
  await daily.getByRole("button", { name: "Đưa vào bản nháp" }).click();
  await expect(page.getByLabel("EQUITY 2025-03")).toHaveValue("1.25");
  await expect(page.getByLabel("CPI 2025-12")).toHaveValue("0.3");

  // Remaining document fields typed by the admin, then save the DRAFT only.
  const doc = JSON.parse(await page.getByLabel("Nội dung JSON của dữ liệu thị trường", { exact: true }).inputValue());
  const filled = { ...doc, title: "Dữ liệu kiểm thử", reason: "Kiểm thử quy đổi giá ngày", sources: [{ ...source, id: "SRC_1" }],
    assets: doc.assets.map((a: any) => ({ ...a, totalReturnEvidence: "Fixture tổng lợi nhuận", fees: { treatment: "NET", evidence: "Fixture" }, taxTreatment: "Fixture thuế" })),
    quality: { ...doc.quality, reviewNote: "Fixture đã kiểm tra" } };
  await page.getByText("Xem / dán JSON (nâng cao)").click();
  await page.getByLabel("Nội dung JSON của dữ liệu thị trường", { exact: true }).fill(JSON.stringify(filled, null, 2));
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await expect(page.getByText("Đã lưu bản nháp trên máy chủ.")).toBeVisible();
  const save = writes.find(w => w.path.endsWith("/admin/market-data"))!;
  expect(save.body.period).toEqual({ from: "2025-01", to: "2025-12" });
  expect(save.body.rows).toHaveLength(12);
  expect(save.body.rows[0]).toEqual({ month: "2025-01", returns: { EQUITY: "0.0125", CASH: "0.004" }, cpi: "0.003" });
  expect(save.body.assets.map((a: any) => a.assetClass)).toEqual(["EQUITY", "CASH"]);
  expect(writes.some(w => /approve|publish/.test(w.path))).toBe(false);
  await page.screenshot({ path: "../.tmp/admin-params-review/market-daily.png", fullPage: true });
  expect(errors).toEqual([]);
});
