import { expect, test } from "@playwright/test";
import { setupDiscovery } from "./discovery-helpers";
const dialog = (page: import("@playwright/test").Page) => page.getByRole("dialog");

test("deposit tool shows annual equivalent rate and interest forgone by early exit", async ({ page, request }) => {
  await setupDiscovery(page, request, "/user/explore");
  await page.getByRole("button", { name: "Tính thử tiền gửi", exact: true }).click();
  await dialog(page).getByLabel("Số tiền gửi", { exact: true }).fill("100.000.000");
  await dialog(page).getByLabel("Lãi suất danh nghĩa (%/năm)", { exact: true }).fill("6");
  await dialog(page).getByLabel("Kỳ hạn (tháng)", { exact: true }).fill("12");
  await dialog(page).getByLabel("Hình thức nhận lãi", { exact: true }).selectOption("COMPOUND");
  await dialog(page).locator("details>summary").click();
  await dialog(page).getByLabel("Tháng rút sớm", { exact: true }).fill("6");
  await dialog(page).getByLabel("Lãi suất rút sớm (%/năm)", { exact: true }).fill("0.1");
  await dialog(page).getByRole("button", { name: "Tính kết quả", exact: true }).click();
  const result = dialog(page).getByRole("region", { name: "Kết quả minh họa" });
  await expect(result).toContainText("Lãi suất thực nhận quy năm");
  await expect(result).toContainText("6,17%");
  await expect(result).toContainText("Lãi bị mất do rút trước hạn");
});

test("protection gap tool computes the D.I.M.E. need from the server and rejects invalid years", async ({ page, request }) => {
  await setupDiscovery(page, request, "/user/explore");
  await page.getByRole("button", { name: "Khoảng trống bảo hiểm", exact: true }).click();
  const d = dialog(page);
  await d.getByLabel("Tổng dư nợ hiện tại", { exact: true }).fill("500.000.000");
  await d.getByLabel("Thu nhập/tháng cần bù đắp cho gia đình", { exact: true }).fill("20.000.000");
  await d.getByLabel("Quỹ học vấn cho con", { exact: true }).fill("300.000.000");
  await d.getByLabel("Tài sản thanh khoản sẵn có", { exact: true }).fill("200.000.000");
  await d.getByLabel("Số tiền bảo hiểm đang có", { exact: true }).fill("1.000.000.000");
  await d.getByLabel("Số năm bù đắp", { exact: true }).fill("0");
  await d.getByRole("button", { name: "Tính khoảng trống", exact: true }).click();
  // The native min=1 constraint blocks submission before any request.
  expect(await d.getByLabel("Số năm bù đắp", { exact: true }).evaluate(el => (el as HTMLInputElement).validity.valid)).toBe(false);
  await expect(d.getByRole("region", { name: "Kết quả minh họa" })).toHaveCount(0);
  await d.getByLabel("Số năm bù đắp", { exact: true }).fill("5");
  await d.getByRole("button", { name: "Tính khoảng trống", exact: true }).click();
  const result = d.getByRole("region", { name: "Kết quả minh họa" });
  await expect(result).toContainText("Mệnh giá bảo vệ cần có");
  await expect(result).toContainText("1.800.000.000");
  await expect(result).toContainText("800.000.000");
});

test("product sorting offers reference yield and minimum amount", async ({ page, request }) => {
  await setupDiscovery(page, request, "/user/explore");
  const sort = page.getByLabel("Sắp xếp sản phẩm", { exact: true });
  await sort.selectOption("referenceYieldPercent");
  await expect(page).toHaveURL(/sort=referenceYieldPercent/);
  await sort.selectOption("minimumAmount");
  await expect(page).toHaveURL(/sort=minimumAmount/);
  await expect(page.locator(".products-grid>.product-card").first()).toBeVisible();
});
