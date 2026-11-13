import { test, expect, type Page } from "@playwright/test";
import { setupRemaining } from "./remaining-helpers";
import { discoveryApi } from "./discovery-helpers";
import { formatMoneyDecimal } from "../src/utils/moneyDisplay";
import { financeMoney } from "../src/utils/financeHubSummary";

const financeNames = ["Giải thích Thu nhập + lương hưu", "Giải thích Chi tiêu sinh hoạt", "Giải thích Trả nợ trong tháng", "Giải thích Phần dư thu chi"];
const locations = [
  { key: "overview", path: "/user/dashboard", names: ["Giải thích Quỹ dự kiến khi nghỉ hưu", "Giải thích Quỹ cần cho mục tiêu", "Giải thích Có thể góp tháng đầu"] },
  { key: "plan", path: "/user/plan", names: ["Giải thích: Quỹ cần khi nghỉ hưu", "Giải thích: Quỹ dự kiến có", "Giải thích: Phần còn thiếu", "Giải thích: Chi tiêu lúc nghỉ hưu", "Giải thích: Khả năng ngân sách"] },
  { key: "finance", path: "/user/profile", names: [...financeNames, "Giải thích tài sản ròng"] },
  { key: "cashflow", path: "/user/profile?section=cashflow", names: financeNames },
  { key: "assets", path: "/user/profile?section=assets", names: ["Giải thích tài sản ròng"] },
];

async function open(page: Page, name: string) {
  const trigger = page.getByRole("button", { name, exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Con số này là gì?", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Lắp số của bạn vào phép tính", exact: true })).toBeVisible();
  return { trigger, dialog };
}

for (const width of [1440, 768, 390, 320]) test(`demo money explanations cover every mapped user location at ${width}px`, async ({ page, request }, info) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width, height: 1000 });
  const s = await setupRemaining(page, request);
  for (const location of locations) {
    await page.goto(location.path);
    for (const [i, name] of location.names.entries()) {
      const { trigger, dialog } = await open(page, name);
      await expect(dialog.locator(".money-explanation-calculation li").first()).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1); expect(box.y + box.height).toBeLessThanOrEqual(1001);
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await dialog.locator(".modal-body").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      if (width >= 768) expect(await dialog.locator(".money-explanation-layout").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);
      await page.screenshot({ path: info.outputPath(`${location.key}-${i}.png`), animations: "disabled" });
      for (let tab = 0; tab < 4; tab++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    }
  }
  expect(s.writes.filter(w => !w.path.endsWith("/preview"))).toEqual([]);
  expect(s.errors).toEqual([]);
});

test("overview and plan explain the same pinned projection; actions navigate without applying", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/dashboard");
  const plan = await s.get(`me/retirement/plans/${s.fixture.planId}`);
  const summary = plan.current.preview.calculation.summary;
  const first = plan.current.preview.calculation.rows[0];
  for (const [name, value] of [["Giải thích Quỹ dự kiến khi nghỉ hưu", summary.atRetirement.projectedFund], ["Giải thích Quỹ cần cho mục tiêu", summary.atRetirement.requiredFund], ["Giải thích Có thể góp tháng đầu", first.contributionCapacity]]) {
    const { dialog } = await open(page, name);
    await expect(dialog.locator(".money-explanation-kpi")).toContainText(formatMoneyDecimal(value));
    await dialog.getByRole("button", { name: "Đã hiểu", exact: true }).click();
  }
  await open(page, "Giải thích Quỹ dự kiến khi nghỉ hưu"); await page.getByRole("dialog").getByRole("link", { name: "Chọn mức góp", exact: true }).click();
  await expect(page.getByRole("dialog",{name:"Chọn mức góp vừa với bạn",exact:true})).toBeVisible(); await page.keyboard.press("Escape");
  await page.goto("/user/plan"); const { dialog } = await open(page, "Giải thích: Quỹ cần khi nghỉ hưu");
  await expect(dialog.locator(".money-explanation-kpi")).toContainText(formatMoneyDecimal(summary.atRetirement.requiredFund));
  await dialog.getByRole("button", { name: "Chỉnh sửa phương án", exact: true }).click(); await expect(page.getByRole("dialog",{name:"Chỉnh sửa phương án",exact:true})).toBeVisible();
  expect(s.writes.filter(w => !w.path.endsWith("/preview"))).toEqual([]);
});

test("profile explanations use profile totals rather than a plan's selected reserve or contribution", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/profile");
  const record = await s.get("me/financial-profile");
  const values = record.summary.values;
  const { dialog } = await open(page, "Giải thích Phần dư thu chi");
  await expect(dialog.locator(".money-explanation-kpi > strong")).toHaveText(financeMoney(values.availableMonthlySurplus));
  await expect(dialog.locator(".money-explanation-result")).toContainText(`${financeMoney(values.monthlyIncome)} − ${financeMoney(values.monthlyExpense)} − ${financeMoney(values.monthlyDebtService)} ≈ ${financeMoney(values.availableMonthlySurplus)}`);
  await dialog.getByRole("button", { name: "Đã hiểu", exact: true }).click();
  await open(page, "Giải thích tài sản ròng"); await expect(page.getByRole("dialog").locator(".money-explanation-kpi > strong")).toHaveText(financeMoney(values.netWorth));
  expect(s.writes.filter(w => !w.path.endsWith("/preview"))).toEqual([]);
});

test("a surplus clamps only the displayed missing amount; no invalid subtraction is claimed", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/plan", { savedPlan: false });
  const res = await request.post(`${discoveryApi}/api/v1/me/retirement/preview`, { headers: { Authorization: `Bearer ${s.fixture.accessToken}` }, data: s.fixture.planInput });
  const { data } = await res.json();
  const summary = { ...data.calculation.summary, atRetirement: { ...data.calculation.summary.atRetirement, requiredFund: "100000000", projectedFund: "300000000", fundingGap: "-200000000" } };
  await page.route("**/api/v1/me/retirement/preview**", route => route.fulfill({ json: { data: { ...data, calculation: { ...data.calculation, summary } } } }));
  await page.evaluate(input => sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify(input)), s.fixture.planInput); await page.reload();
  const { dialog } = await open(page, "Giải thích: Phần còn thiếu");
  await expect(dialog.locator(".money-explanation-kpi > strong")).toHaveText("0 ₫");
  await expect(dialog.locator(".money-explanation-result")).toContainText("max(0;");
  await expect(dialog).toContainText("Vượt quỹ cần: 200.000.000 ₫");
  await dialog.getByRole("button", { name: "Xem các phương án", exact: true }).click(); await expect(page).toHaveURL(/view=history/);
  expect(s.writes.filter(w => !w.path.endsWith("/preview"))).toEqual([]);
});

for (const [name, income, expense, surplus] of [
  ["known negative", "9007199254740993.01", "9007199259740993.01", "-5000000"],
  ["unknown", null, "0", null],
] as const) test(`profile explanations retain ${name} totals and distinguish zero from unknown`, async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/profile"); const record = await s.get("me/financial-profile");
  const summary = { ...record.summary, values: { ...record.summary.values, monthlyIncome: income, monthlyExpense: expense, monthlyDebtService: "0", availableMonthlySurplus: surplus } };
  await page.route("**/api/v1/me/financial-profile", route => route.fulfill({ json: { data: { ...record, summary } } })); await page.reload();
  const label = surplus === null ? "Giải thích Phần dư thu chi" : "Giải thích Ngân sách đang thiếu";
  const { dialog } = await open(page, label);
  await expect(dialog.locator(".money-explanation-kpi > strong")).toHaveText(formatMoneyDecimal(surplus));
  await expect(dialog.locator(".money-explanation-calculation li").first()).toContainText(formatMoneyDecimal(income));
  await expect(dialog.locator(".money-explanation-calculation li").last()).toContainText("0 ₫");
  if (income === null) await expect(dialog).toContainText("không coi khoản chưa rõ là 0");
  expect(s.writes.filter(w => !w.path.endsWith("/preview"))).toEqual([]);
});

test("constrained start contributions and external fees use the actual monthly engine rows", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/plan", { savedPlan: false });
  const input = { ...s.fixture.planInput, contributionTiming: "START_OF_MONTH", monthlyContribution: "5000000", monthlyReserve: "2000000", startOfMonthFunding: { confirmed: true, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START", monthlyAvailable: "1000000" }, advisoryFee: { annualPercent: "0.12", paidFrom: "EXTERNAL" } };
  const res = await request.post(`${discoveryApi}/api/v1/me/retirement/preview`, { headers: { Authorization: `Bearer ${s.fixture.accessToken}` }, data: input }); expect(res.ok()).toBe(true);
  const { data } = await res.json(); const first = data.calculation.rows[0];
  expect(first.contributionCapacity).toBe("0"); expect(data.calculation.rows[1].contributionCapacity).toBe("1000000"); expect(first.additionalExpense).not.toBe("2000000");
  await page.evaluate(value => sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify(value)), input); await page.reload();
  const { dialog } = await open(page, "Giải thích: Khả năng ngân sách");
  await expect(dialog.locator(".money-explanation-kpi")).toContainText("0 ₫/tháng");
  await expect(dialog.locator("li").filter({ hasText: "Trừ khoản chi khác và tiền dành riêng" })).toContainText(formatMoneyDecimal(first.additionalExpense));
  await expect(dialog).toContainText("Tháng bắt đầu được góp: 11/2026");
  await expect(dialog).toContainText("không trừ lại"); await page.keyboard.press("Escape");
  await open(page, "Giải thích: Quỹ dự kiến có");
  await expect(page.getByRole("dialog").locator(".money-explanation-formula")).toContainText("(Bₜ₋₁ + Cₜ) × Gₜ");
  await expect(page.getByRole("dialog").locator(".money-explanation-kpi")).toContainText(formatMoneyDecimal(data.calculation.summary.atRetirement.projectedFund));
  expect(s.writes.filter(w => !w.path.endsWith("/preview"))).toEqual([]);
});
