import { expect, test } from "@playwright/test";
import { installRouteAuth } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installRouteAuth(page);
  await page.goto("/user/explore");
});

test("search combines Vietnamese normalization, topic and saved filters", async ({ page }) => {
  const library = page.getByRole("region", { name: "Thư viện bài viết" });
  await library.getByLabel("Tìm bài viết").fill("  DAU tu   dinh ky ");
  await expect(library.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(library.getByRole("heading", { name: /Đầu tư định kỳ DCA/ })).toBeVisible();
  await page.getByRole("button", { name: "Bảo hiểm Xã hội (BHXH)", exact: true }).click();
  await expect(library.getByText("Không tìm thấy bài viết phù hợp")).toBeVisible();
  await library.getByRole("button", { name: "Xem tất cả bài viết" }).click();
  await expect(library.getByRole("status")).toContainText("4 bài viết phù hợp");
  await library.getByLabel(/Chỉ xem bài đã lưu/).check();
  await expect(library.getByText("Bạn chưa lưu bài viết nào")).toBeVisible();
});

test("saved articles persist and stay separate per account", async ({ page, browser }) => {
  const library = page.getByRole("region", { name: "Thư viện bài viết" });
  await library.getByRole("button", { name: /^Lưu bài: Đầu tư định kỳ/ }).click();
  await page.reload();
  await library.getByLabel(/Chỉ xem bài đã lưu \(1\)/).check();
  await expect(library.getByRole("heading", { level: 3 })).toHaveCount(1);
  const otherContext = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const otherPage = await otherContext.newPage();
    await installRouteAuth(otherPage, "USR-SECOND");
    await otherPage.goto(new URL("/user/explore", page.url()).toString());
    const otherLibrary = otherPage.getByRole("region", { name: "Thư viện bài viết" });
    await expect(otherLibrary.getByLabel(/Chỉ xem bài đã lưu \(0\)/)).toBeVisible();
    await otherLibrary.getByLabel(/Chỉ xem bài đã lưu/).check();
    await expect(otherLibrary.getByText("Bạn chưa lưu bài viết nào")).toBeVisible();
  } finally {
    await otherContext.close();
  }
});

test("reading dialog supports saving, removing, Escape and returning focus", async ({ page }) => {
  const library = page.getByRole("region", { name: "Thư viện bài viết" });
  await library.getByLabel("Tìm bài viết").fill("DCA");
  const readButton = library.getByRole("button", { name: "Đọc bài viết", exact: true });
  await readButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Đầu tư định kỳ giúp duy trì kỷ luật");
  await dialog.getByRole("button", { name: /^Lưu bài:/ }).click();
  await expect(dialog.getByRole("button", { name: /^Bỏ lưu:/ })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(readButton).toBeFocused();
  await library.getByLabel(/Chỉ xem bài đã lưu/).check();
  await library.getByRole("button", { name: /^Bỏ lưu:/ }).click();
  await expect(library.getByText("Bạn chưa lưu bài viết nào")).toBeVisible();
  await page.reload();
  await expect(library.getByLabel(/Chỉ xem bài đã lưu \(0\)/)).toBeVisible();
});

test("only published valid content is searchable and draft bookmarks stay hidden", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("anhuu_demo_contents", JSON.stringify([
      { id: "published", title: "Bài kế hoạch mới", summary: "Mô tả", content: "Dòng một\nDòng hai", category: "Kế hoạch hưu trí", status: "Đã xuất bản" },
      { id: "draft", title: "Bản nháp không được hiển thị", summary: "Mô tả", category: "Bảo hiểm xã hội", status: "Bản nháp" },
      null, { id: "invalid", status: "Đã xuất bản" },
    ]));
    localStorage.setItem("anhuu_saved_articles:USR-001", JSON.stringify(["published:draft"]));
  });
  await page.reload();
  const library = page.getByRole("region", { name: "Thư viện bài viết" });
  await expect(library.getByRole("status")).toContainText("5 bài viết phù hợp");
  await expect(library.getByText("Bản nháp không được hiển thị")).toHaveCount(0);
  await expect(library.getByLabel(/Chỉ xem bài đã lưu \(0\)/)).toBeVisible();
  await page.getByRole("button", { name: "Lối sống hưu trí viên mãn", exact: true }).click();
  await library.getByLabel("Tìm bài viết").fill("ke hoach moi");
  await library.getByRole("button", { name: "Đọc bài viết", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Dòng một\nDòng hai");
});

test("storage failures do not report a successful save or crash the page", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("anhuu_demo_contents", "broken json");
    localStorage.setItem("anhuu_saved_articles:USR-001", "{}");
  });
  await page.reload();
  const library = page.getByRole("region", { name: "Thư viện bài viết" });
  await expect(library.getByRole("alert")).toContainText("Không đọc được nội dung từ quản trị");
  await expect(library.getByRole("status")).toContainText("Không đọc được danh sách đã lưu");
  await page.evaluate(() => localStorage.removeItem("anhuu_saved_articles:USR-001"));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("anhuu_saved_articles:")) throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  const save = library.getByRole("button", { name: /^Lưu bài: Đầu tư định kỳ/ });
  await save.click();
  await expect(library.getByRole("status")).toContainText("Không thể cập nhật bài đã lưu");
  await expect(save).toHaveAttribute("aria-pressed", "false");
});

test("glossary searches accents and aliases, handles no results and closes by keyboard", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Mở từ điển tra cứu" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Từ điển thuật ngữ An Hưu" });
  await dialog.getByLabel("Tìm thuật ngữ").fill("lai kep");
  await expect(dialog.locator("dt")).toHaveText(["Lãi kép"]);
  await dialog.getByLabel("Tìm thuật ngữ").fill("CPI");
  await expect(dialog.locator("dt")).toHaveText(["Chỉ số giá tiêu dùng (CPI)"]);
  await dialog.getByLabel("Tìm thuật ngữ").fill("xyz-nothing");
  await expect(dialog.getByText(/Chưa tìm thấy thuật ngữ/)).toBeVisible();
  await dialog.getByRole("button", { name: "Xem tất cả thuật ngữ" }).click();
  await expect(dialog.locator("dt")).toHaveCount(12);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

for (const width of [1440, 1024, 768, 390]) {
  test(`knowledge controls and glossary fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.getByLabel("Tìm bài viết")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Mở từ điển tra cứu" }).click();
    await expect(page.getByLabel("Tìm thuật ngữ")).toBeVisible();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  });
}
