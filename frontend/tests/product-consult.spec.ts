import { expect, test } from "@playwright/test";
import { installRouteAuth } from "./helpers";

const IMG = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#334DAF"/></svg>');
const partner = { id: "11111111-1111-4111-8111-111111111111", name: "Quỹ VCBF", type: "OPEN_FUND", logoUrl: null, website: null, isHighlight: false, isVisible: true, revision: 1 };
const product = { id: "22222222-2222-4222-8222-222222222222", partnerId: partner.id, name: "Gói tích lũy hưu trí An Tâm", category: "Quỹ mở trái phiếu", expectedReturn: "6–7%/năm",
  riskLevel: "LOW", description: "Tích lũy đều hằng tháng cho mục tiêu nghỉ hưu.", annualFee: "0,8%/năm", conditions: "Từ 18 tuổi", disclosure: "Không cam kết lợi nhuận.",
  imageUrl: IMG, isVisible: true, revision: 2, partner };

test("user requests a consultation for a product package", async ({ page }) => {
  await installRouteAuth(page);
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await page.route("**/api/v1/products?**", r => r.fulfill({ json: { data: { items: [product], total: 1, page: 1, limit: 50 } } }));
  let body: any = null;
  await page.route(`**/api/v1/me/products/${product.id}/consult`, async r => { body = r.request().postDataJSON(); await r.fulfill({ status: 201, json: { data: { id: "t1" } } }); });
  await page.goto("/user/explore");
  const card = page.locator(".solution-card", { hasText: product.name });
  await expect(card.locator("img.solution-image")).toBeVisible();
  await card.getByRole("button", { name: /Xem chi tiết/ }).click();
  const dialog = page.getByRole("dialog", { name: product.name });
  await dialog.getByRole("button", { name: "Yêu cầu tư vấn gói này" }).click();
  await dialog.getByLabel("Bạn muốn được tư vấn điều gì?").fill("Tôi 45 tuổi, muốn tích lũy 3 triệu/tháng");
  await dialog.getByLabel(/Số điện thoại/).fill("0901234567");
  await page.screenshot({ path: "tests/tmp-shots/user-consult.png" });
  await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(dialog).toHaveCount(0);
  expect(body).toEqual({ message: "Tôi 45 tuổi, muốn tích lũy 3 triệu/tháng", phone: "0901234567" });
});

test("admin creates a product package with an uploaded image", async ({ page }) => {
  await installRouteAuth(page, "ADM-001");
  await page.route("**/api/v1/admin/partners?**", r => r.fulfill({ json: { data: { items: [partner], total: 1, page: 1, limit: 100 } } }));
  await page.route("**/api/v1/admin/products?**", r => r.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 10 } } }));
  await page.route("**/api/v1/admin/media", r => r.fulfill({ status: 201, json: { data: { url: IMG } } }));
  let created: any = null;
  await page.route("**/api/v1/admin/products", async r => { created = r.request().postDataJSON(); await r.fulfill({ status: 201, json: { data: { ...product, ...created } } }); });
  await page.goto("/admin/partners");
  await page.getByRole("button", { name: "Thêm gói sản phẩm" }).click();
  const dialog = page.getByRole("dialog", { name: "Thêm gói sản phẩm" });
  await dialog.getByLabel("Đối tác phát hành").selectOption(partner.id);
  await dialog.getByLabel("Tên gói sản phẩm").fill(product.name);
  await dialog.getByLabel("Loại hình").fill(product.category);
  await dialog.locator('input[type="file"]').setInputFiles({ name: "goi.png", mimeType: "image/png", buffer: Buffer.from("89504e47", "hex") });
  await expect(dialog.getByRole("img", { name: "Ảnh gói sản phẩm" })).toBeVisible();
  await dialog.getByLabel("Phí hằng năm").fill(product.annualFee);
  await page.screenshot({ path: "tests/tmp-shots/admin-editor.png" });
  await dialog.getByRole("button", { name: "Lưu gói sản phẩm" }).click();
  await expect(dialog).toHaveCount(0);
  expect(created).toMatchObject({ partnerId: partner.id, name: product.name, category: product.category, imageUrl: IMG, annualFee: "0,8%/năm", isVisible: false });
});
