import { expect, test } from "@playwright/test";

test("admin routes navigate correctly and load appropriate screens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const adminCases = [
    ["/admin/dashboard", "Bảng điều khiển Quản trị An Hưu"],
    ["/admin/users", "Danh sách người dùng An Hưu"],
    ["/admin/consultations", "Quản lý yêu cầu tư vấn (AD04)"],
    ["/admin/content", "Quản lý nội dung & Cẩm nang (AD05)"],
    ["/admin/partners", "Đối tác & Sản phẩm tài chính (AD06)"],
    ["/admin/ai", "Quản lý Trợ lý AI & Cơ sở tri thức (AD07)"],
    ["/admin/financial-config", "Cấu hình tham số tài chính & Công thức hưu trí (AD08)"],
    ["/admin/support", "Hỗ trợ & thông báo"],
    ["/admin/reports", "Báo cáo hệ thống"],
    ["/admin/settings/general", "Cài đặt chung"],
  ];

  for (const [path, headingText] of adminCases) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: headingText })).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test("user routes load successfully and display headings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const userCases = [
    ["/", "An tâm hôm nay"],
    ["/login", "Đăng nhập An Hưu"],
    ["/register", "Đăng ký tài khoản"],
    ["/onboarding", "Thiết lập hồ sơ tài chính"],
    ["/user/dashboard", "Chào buổi sáng"],
    ["/user/goal", "Xác định mục tiêu"],
    ["/user/plan", "Kế hoạch hưu trí"],
    ["/user/simulation", "Mô phỏng kịch bản"],
    ["/user/assistant", "Trợ lý tài chính"],
    ["/user/explore", "Khám phá kiến thức"],
    ["/user/account", "Hồ sơ tài chính"],
  ];

  for (const [path, headingPart] of userCases) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: new RegExp(headingPart, "i") })).toBeVisible();
  }

  expect(errors).toEqual([]);
});

for (const width of [1440, 1024, 768, 390]) {
  test(`palette and responsive layout without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const pathsToTest = [
      "/",
      "/user/dashboard",
      "/admin/dashboard",
      "/admin/users",
      "/admin/consultations",
    ];

    for (const path of pathsToTest) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const result = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const winW = window.innerWidth;
        const overflowElements: string[] = [];
        document.querySelectorAll("*").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > winW + 1) {
            overflowElements.push(`${el.tagName}.${el.className} (right: ${r.right})`);
          }
        });
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          primaryColor: root.getPropertyValue("--color-primary-700").trim(),
          overflowElements: overflowElements.slice(0, 5),
        };
      });
      expect(result.primaryColor).toBe("#10385b");
      expect(result.overflow, `${path} has horizontal overflow at ${width}px. Offending: ${JSON.stringify(result.overflowElements)}`).toBe(false);
    }
  });
}
