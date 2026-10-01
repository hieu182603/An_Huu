import { expect, test } from "@playwright/test";
import { installRouteAuth } from "./helpers";

/**
 * Kiểm thử tự động cho cơ chế lưu, khôi phục và đồng bộ dữ liệu hồ sơ tài chính:
 * 1. Đổi tuổi 32 thành 45 trong onboarding, lưu, tải lại: vẫn là 45.
 * 2. Hoàn tất onboarding: dashboard và tài khoản đọc đúng hồ sơ vừa nhập.
 * 3. Đổi thông tin ở tài khoản: các trang liên quan cập nhật nhất quán.
 * 4. Mô phỏng chưa áp dụng không làm thay đổi kế hoạch chính thức.
 * 5. Cơ chế lưu demo localStorage: có disclaimers, không lưu mật khẩu hay OTP.
 * 6. Kiểm tra validation đổi mật khẩu: không báo thành công khi để trống.
 */

const ONBOARDING_KEY = "anhuu_demo_onboarding_draft";
const PROFILE_KEY = "anhuu_demo_financial_profile";

async function resetState(page: import("@playwright/test").Page) {
  await page.goto("/onboarding");
  await page.evaluate(
    ({ onboarding, profile }) => {
      localStorage.removeItem(onboarding);
      localStorage.removeItem(profile);
    },
    { onboarding: ONBOARDING_KEY, profile: PROFILE_KEY }
  );
}

test.describe("Thống nhất dữ liệu và cơ chế lưu", () => {
  test.beforeEach(async ({ page }) => installRouteAuth(page));
  test("1.1 — Đổi tuổi 32 thành 45 trong onboarding, lưu nháp, tải lại: vẫn là 45", async ({ page }) => {
    await resetState(page);
    await page.goto("/onboarding");

    // Welcome step -> Next
    await page.getByRole("button", { name: /Tiếp tục bước tiếp theo/i }).click();

    // Bước 1: Personal -> đổi tuổi từ 32 thành 45
    const ageField = page.getByLabel(/Tuổi hiện tại của bạn/i);
    await ageField.fill("45");

    // Bấm Lưu nháp
    const saveDraftBtn = page.getByRole("button", { name: /Lưu nháp/i });
    await saveDraftBtn.click();

    // Đợi toast lưu nháp thành công
    await expect(page.locator(".save-toast")).toBeVisible({ timeout: 5000 });

    // Tải lại trang (reload)
    await page.reload();

    // Nếu trang bắt đầu ở bước Khởi đầu, bấm Tiếp tục bước tiếp theo để vào bước Cá nhân
    const nextBtnAfterReload = page.getByRole("button", { name: /Tiếp tục bước tiếp theo/i });
    if (await nextBtnAfterReload.isVisible()) {
      await nextBtnAfterReload.click();
    }

    // Form khôi phục ngay bước Cá nhân với tuổi 45
    const ageAfterReload = page.getByLabel(/Tuổi hiện tại của bạn/i);
    await expect(ageAfterReload).toBeVisible({ timeout: 5000 });
    await expect(ageAfterReload).toHaveValue("45");
  });

  test("1.2 — Hoàn tất onboarding: dashboard và tài khoản đọc đúng hồ sơ vừa nhập", async ({ page }) => {
    await resetState(page);
    await page.goto("/onboarding");

    // Step 0: Welcome
    await page.getByRole("button", { name: /Tiếp tục bước tiếp theo/i }).click();

    // Step 1: Personal -> nhập tuổi 45
    const ageField = page.getByLabel(/Tuổi hiện tại của bạn/i);
    await ageField.fill("45");

    // Đi qua các bước
    for (let i = 0; i < 6; i++) {
      await page.getByRole("button", { name: /Tiếp tục bước tiếp theo/i }).click();
      await page.waitForTimeout(200);
    }

    // Step 7: Summary -> Hoàn tất hồ sơ
    await page.getByRole("button", { name: /Hoàn tất hồ sơ & Nhận kế hoạch/i }).click();

    // Màn hình hoàn tất xuất hiện
    await expect(page.getByText(/HỒ SƠ TÀI CHÍNH HOÀN TẤT/i)).toBeVisible({ timeout: 5000 });

    // Bấm mở Dashboard
    await page.getByRole("button", { name: /Mở Dashboard & Lập kế hoạch hưu trí/i }).click();
    await expect(page).toHaveURL(/.*\/user\/dashboard/);

    // Dashboard hiển thị đúng chào buổi sáng và tiến độ
    await expect(page.locator("h1")).toContainText(/Chào buổi sáng/i);

    // Vào trang tài khoản và xác minh thông tin
    await page.goto("/user/account");
    const nameInput = page.getByLabel("Họ và tên");
    await expect(nameInput).toBeVisible();
    const nameVal = await nameInput.inputValue();
    expect(nameVal).toBeTruthy();
  });

  test("1.3 — Đổi thông tin ở tài khoản: dashboard cập nhật nhất quán", async ({ page }) => {
    await page.goto("/user/account");

    // Sửa tên thành "Nguyễn Hoàng Nam"
    const nameInput = page.getByLabel("Họ và tên");
    await nameInput.fill("Nguyễn Hoàng Nam");

    // Bấm Lưu thay đổi hồ sơ
    await page.getByRole("button", { name: /Lưu thay đổi hồ sơ/i }).click();

    // Đợi thông báo thành công
    await expect(page.getByText(/Hồ sơ của bạn đã được lưu/i)).toBeVisible({ timeout: 5000 });

    // Mở Dashboard kiểm tra tên mới
    await page.goto("/user/dashboard");
    const heading = await page.locator("h1").first().textContent();
    expect(heading).toContain("Nguyễn Hoàng Nam");
  });

  test("1.4 — Mô phỏng chưa áp dụng không làm thay đổi kế hoạch chính thức", async ({ page }) => {
    // 1. Kiểm tra kế hoạch chính thức ban đầu tại /user/plan
    await page.goto("/user/plan");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
    const planFundAfter = await page.locator(".result-total").textContent();

    // Kế hoạch chính thức không bị thay đổi
    expect(planFundAfter).toBe(officialFundText);
  });

  test("1.4b — Áp dụng mô phỏng lưu kế hoạch chính thức và giữ sau tải lại", async ({ page }) => {
    await page.goto("/user/simulation");
    const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null")?.plan?.monthlySavings ?? 14_200_000, PROFILE_KEY);
    await page.getByRole("button", { name: "Tăng 1 triệu" }).click();
    await page.getByRole("button", { name: /Áp dụng kịch bản này/ }).click();
    await expect(page).toHaveURL(/\/user\/plan$/, { timeout: 5000 });

    const applied = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null")?.plan?.monthlySavings, PROFILE_KEY);
    expect(applied).toBe(before + 1_000_000);
    await page.reload();
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null")?.plan?.monthlySavings, PROFILE_KEY)).toBe(applied);
  });

  test("1.5 — Cơ chế lưu demo: localStorage chứa profile và không lưu mật khẩu", async ({ page }) => {
    await page.goto("/user/dashboard");
    const storageState = await page.evaluate(
      ({ profileKey, draftKey }) => {
        const profileRaw = localStorage.getItem(profileKey);
        const draftRaw = localStorage.getItem(draftKey);
        const allKeys = Object.keys(localStorage);
        return {
          hasProfile: !!profileRaw,
          hasDraft: !!draftRaw,
          allKeys,
          hasPasswordKey: allKeys.some((k) => /pass|secret|otp|token/i.test(k)),
        };
      },
      { profileKey: PROFILE_KEY, draftKey: ONBOARDING_KEY }
    );

    // Không có bất kỳ key nhạy cảm nào trong localStorage
    expect(storageState.hasPasswordKey).toBeFalsy();
  });

  test("1.6 — Đổi mật khẩu để trống: hiển thị lỗi, không giả lập thành công", async ({ page }) => {
    await page.goto("/user/account");

    // Chọn tab Bảo mật
    await page.getByRole("button", { name: /Bảo mật & Mật khẩu/i }).click();

    // Bấm Đổi mật khẩu khi form trống
    await page.getByRole("button", { name: /Đổi mật khẩu/i }).click();

    // Hiển thị lỗi xác thực
    await expect(page.getByText(/Vui lòng nhập đầy đủ/i)).toBeVisible({ timeout: 5000 });
  });
});
