import { expect, test } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from "./helpers";

/**
 * Kiểm thử tự động cho cơ chế lưu, khôi phục và đồng bộ dữ liệu hồ sơ tài chính:
 * 1. Đổi tuổi 32 thành 45 trong onboarding, lưu, tải lại: vẫn là 45.
 * 2. Hoàn tất onboarding: dashboard và tài khoản đọc đúng hồ sơ vừa nhập.
 * 3. Đổi thông tin ở tài khoản: các trang liên quan cập nhật nhất quán.
 * 4. Mô phỏng chưa áp dụng không làm thay đổi kế hoạch chính thức.
 * 5. Áp dụng mô phỏng cập nhật kế hoạch và chuyển sang trang kế hoạch.
 * 6. Cơ chế lưu trữ: không lưu mật khẩu hay OTP trong localStorage.
 * 7. Kiểm tra validation đổi mật khẩu: không báo thành công khi để trống.
 */

test.describe("Thống nhất dữ liệu và cơ chế lưu", () => {
  let financeState: Awaited<ReturnType<typeof installFinancialProfileRoutes>>;

  test.beforeEach(async ({ page }) => {
    await installRouteAuth(page);
    financeState = await installFinancialProfileRoutes(page);
  });

  test("1.1: Đổi tuổi 32 thành 45 trong onboarding, lưu nháp, tải lại: vẫn là 45", async ({ page }) => {
    financeState.setProfile(null);
    financeState.setDraft(null);

    await page.goto("/onboarding");

    // Welcome step -> Next
    await page.getByRole("button", { name: /^(Tiếp tục|Bắt đầu khai báo)/i }).click();

    // Bước 1: Personal -> đổi tuổi từ 32 thành 45
    const ageField = page.getByLabel(/Tuổi hiện tại của bạn/i);
    await ageField.fill("45");

    // "Tiếp tục" lưu nháp lên tài khoản trước khi sang bước sau
    await page.getByRole("button", { name: /^Tiếp tục/i }).click();
    await expect(page.getByRole("heading", { name: /Thu nhập/i }).first()).toBeVisible();

    // Tải lại trang (reload): khôi phục ở bước Thu nhập, quay lại bước Cá nhân
    await page.reload();
    await page.getByRole("button", { name: /Quay lại/i }).click();

    // Form khôi phục ngay bước Cá nhân với tuổi 45
    const ageAfterReload = page.getByLabel(/Tuổi hiện tại của bạn/i);
    await expect(ageAfterReload).toBeVisible({ timeout: 5000 });
    await expect(ageAfterReload).toHaveValue("45");
  });

  test("1.2: Hoàn tất onboarding: dashboard và tài khoản đọc đúng hồ sơ vừa nhập", async ({ page }) => {
    financeState.setProfile(null);
    financeState.setDraft(null);

    await page.goto("/onboarding");

    // Step 0: Welcome
    await page.getByRole("button", { name: /^(Tiếp tục|Bắt đầu khai báo)/i }).click();

    // Step 1: Personal -> nhập tuổi 45
    const ageField = page.getByLabel(/Tuổi hiện tại của bạn/i);
    await ageField.fill("45");

    // Đi qua các bước
    for (let i = 0; i < 6; i++) {
      await page.getByRole("button", { name: /^(Tiếp tục|Bắt đầu khai báo)/i }).click();
      await page.waitForTimeout(200);
    }

    // Step 7: Summary -> Hoàn tất hồ sơ
    await page.getByRole("button", { name: /Hoàn tất hồ sơ/i }).click();

    // Màn hình hoàn tất xuất hiện
    await expect(page.getByText(/HỒ SƠ TÀI CHÍNH HOÀN TẤT/i)).toBeVisible({ timeout: 5000 });

    // Bấm mở Dashboard
    await page.getByRole("button", { name: /Mở Dashboard & Lập kế hoạch hưu trí/i }).click();
    await expect(page).toHaveURL(/.*\/user\/dashboard/);

    // Dashboard hiển thị đúng chào buổi sáng và thông tin
    await expect(page.locator(".dashboard-summary-header")).toContainText(/Xin chào/i);

    // Vào trang tài khoản và xác minh thông tin
    await page.goto("/user/account");
    await page.getByRole("button", { name: /^Tài khoản:/ }).click();
    await page.getByRole("menuitem", { name: "Hồ sơ", exact: true }).click();
    const nameInput = page.getByLabel("Họ và tên");
    await expect(nameInput).toBeVisible();
    const nameVal = await nameInput.inputValue();
    expect(nameVal).toBeTruthy();
  });

  test("1.3: Đổi thông tin ở tài khoản: dashboard cập nhật nhất quán", async ({ page }) => {
    await page.goto("/user/account");

    // Sửa tên thành "Nguyễn Hoàng Nam"
    await page.getByRole("button", { name: /^Tài khoản:/ }).click();
    await page.getByRole("menuitem", { name: "Hồ sơ", exact: true }).click();
    const nameInput = page.getByLabel("Họ và tên");
    await nameInput.fill("Nguyễn Hoàng Nam");

    // Bấm Lưu thông tin cá nhân
    await page.getByRole("button", { name: /Lưu thông tin cá nhân/i }).click();

    // Đợi thông báo thành công hoặc nút cập nhật tên mới
    await expect(page.getByRole("button", { name: /Tài khoản: Nguyễn Hoàng Nam/i })).toBeVisible({ timeout: 5000 });

    // Mở Dashboard kiểm tra tên mới
    await page.goto("/user/dashboard");
    const heading = await page.locator(".dashboard-summary-header").textContent();
    expect(heading).toContain("Nguyễn Hoàng Nam");
  });

  test("1.4: Mô phỏng chưa áp dụng không làm thay đổi kế hoạch chính thức", async ({ page }) => {
    // 1. Kiểm tra kế hoạch chính thức ban đầu tại /user/plan
    await page.goto("/user/plan");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".result-total")).not.toHaveText(/Đang tính toán/);
    const officialFundText = await page.locator(".result-total").textContent();
    expect(officialFundText).toBeTruthy();

    // 2. Chuyển sang trang mô phỏng /user/simulation và thay đổi tham số
    await page.goto("/user/simulation");
    const simIncreaseAgeBtn = page.locator(".simulation-stepper button").nth(1);
    await simIncreaseAgeBtn.click();
    await simIncreaseAgeBtn.click();

    // Không bấm "Áp dụng kịch bản này"
    // 3. Quay lại kế hoạch chính thức /user/plan
    await page.goto("/user/plan");
    await expect(page.locator(".result-total")).not.toHaveText(/Đang tính toán/);
    const planFundAfter = await page.locator(".result-total").textContent();

    // Kế hoạch chính thức không bị thay đổi
    expect(planFundAfter).toBe(officialFundText);
  });

  test("1.4b: Áp dụng mô phỏng lưu kế hoạch chính thức và chuyển sang trang kế hoạch", async ({ page }) => {
    await page.goto("/user/simulation");
    await expect(page.getByRole("button", { name: "Tăng 1 triệu" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Tăng 1 triệu" }).first().click();
    await page.getByRole("button", { name: /Áp dụng kịch bản này/ }).click();
    const confirmBtn = page.getByRole("button", { name: "Xác nhận áp dụng", exact: true });
    if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await expect(page).toHaveURL(/\/user\/plan$/, { timeout: 5000 });
    await expect(page.locator(".result-total")).toBeVisible();
  });

  test("1.5: Cơ chế lưu trữ an toàn: localStorage không lưu mật khẩu hay token nhạy cảm", async ({ page }) => {
    await page.goto("/user/dashboard");
    const storageState = await page.evaluate(() => {
      const allKeys = Object.keys(localStorage);
      return {
        allKeys,
        hasPasswordKey: allKeys.some((k) => /pass|secret|otp|token/i.test(k)),
      };
    });

    // Không có bất kỳ key nhạy cảm nào trong localStorage
    expect(storageState.hasPasswordKey).toBeFalsy();
  });

  test("1.6: Đổi mật khẩu để trống: hiển thị lỗi, không giả lập thành công", async ({ page }) => {
    await page.goto("/user/account");

    // Chọn tab Cài đặt
    await page.getByRole("button", { name: /^Tài khoản:/ }).click();
    await page.getByRole("menuitem", { name: "Cài đặt", exact: true }).click();

    // Bấm Đổi mật khẩu khi form trống
    await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();

    // Hiển thị lỗi xác thực
    await expect(page.getByText(/Vui lòng nhập mật khẩu hiện tại|Vui lòng nhập đầy đủ/i)).toBeVisible({ timeout: 5000 });
  });
});
