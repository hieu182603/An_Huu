import { expect, test, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes, fillEvidence } from "./helpers";
import { calculateLocalReconciliation, type ActualKind, type ActualMonthDetail, type ActualPayload } from "../src/services/actuals";

const eventId = "10000000-0000-4000-8000-000000000007";
const loanId = "profile:debt:loan-1";
const paymentDate = "2026-09-18";

function actualMonth(revision = 7, kind: ActualKind = "DEBT_PAYMENT", reconciliation: ActualMonthDetail["reconciliation"] = "MATCHED", amount = "495000000"): ActualMonthDetail {
  const data: ActualPayload = { currency: "VND", openingBalance: "0", closingBalance: "0", correctionReason: "Đã đối soát",
    entries: [{ eventId, date: paymentDate, kind, amount, note: "Tất toán khoản vay" },
      { eventId: "10000000-0000-4000-8000-000000000008", date: paymentDate, kind: "INCOME", amount: "900000000" }] };
  return {
    ...calculateLocalReconciliation(data),
    id: "20000000-0000-4000-8000-000000000001", period: "2026-09", revision,
    updatedAt: "2026-10-01T00:00:00.000Z", valueKind: "ACTUAL", reconciliation,
    data,
    history: [],
  };
}

async function openRefinance(page: Page) {
  await page.goto("/user/simulation?tab=actuals");
  await page.getByRole("button", { name: /Lệnh nguồn \(V4\)/ }).click();
  await page.getByRole("button", { name: "Xem trước nguồn V4" }).click();
  await page.getByRole("button", { name: "Tái cấp vốn thực tế", exact: true }).click();
  await page.getByLabel("Tháng ghi nhận trả nợ").fill("2026-09");
  await page.getByLabel("Khoản vay cần tất toán", { exact: true }).selectOption(loanId);
  await page.getByLabel("Mã hợp đồng vay mới", { exact: true }).fill("REFI-TEST-01");
  await fillEvidence(page, "Căn cứ cho lệnh vay / tài sản tiếp theo");
}

test.beforeEach(async ({ page }) => {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page);
  await page.route("**/api/v1/me/retirement/actuals/*", route => route.fulfill({ json: { data: actualMonth() } }));
  await page.route("**/source-reforecasts/preview", route => route.fulfill({ json: { data: {
    status: "READY", issues: [], inputHash: "a".repeat(64),
    loanRevisionOptions: [{ sourceId: loanId, sourceRevision: 2, sourceHash: "b".repeat(64), contractHash: "c".repeat(64), legacyOpeningRequired: false }],
    plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] }, assetRevisionOptions: [],
  } } }));
});

test("refinance sends the selected saved payment ID, revision and date; invalidates the old preview", async ({ page }) => {
  await openRefinance(page);
  const add = page.getByRole("button", { name: "Thêm lệnh tái cấp vốn", exact: true });
  await expect(add).toBeDisabled();
  await expect(page.getByLabel("Giao dịch trả nợ đã ghi nhận *").locator("option")).toHaveCount(2);
  await page.getByLabel("Giao dịch trả nợ đã ghi nhận *").selectOption(eventId);
  await expect(page.getByLabel("Ngày tất toán theo giao dịch")).toHaveValue(paymentDate);
  await expect(page.getByLabel("Ngày tất toán theo giao dịch")).toHaveAttribute("readonly", "");
  await add.click();
  await expect(page.getByRole("button", { name: "Lưu phiên bản V4", exact: true })).not.toBeVisible();
  const request = page.waitForRequest("**/source-reforecasts/preview");
  await page.getByRole("button", { name: "Xem trước nguồn V4" }).click();
  const body = (await request).postDataJSON();
  expect(body.loanRevisions[0].allocations[0]).toMatchObject({ eventId, actualRevision: 7, bookedOn: paymentDate });
  expect(body.refinances[0].settledOn).toBe(paymentDate);
  expect(body.refinances[0].closingCommandId).toBe(body.loanRevisions[0].commandId);
  expect(body.refinances[0].newLoanCommandId).toBe(body.loanCreations[0].commandId);
});

for (const [label, kind, reconciliation] of [
  ["a non-debt payment", "INCOME", "MATCHED"],
  ["an unreconciled month", "DEBT_PAYMENT", "UNRECONCILED"],
] as const) {
  test(`refinance cannot use ${label}`, async ({ page }) => {
    await page.route("**/api/v1/me/retirement/actuals/2026-09", route => route.fulfill({ json: { data: actualMonth(7, kind, reconciliation) } }));
    await openRefinance(page);
    await expect(page.getByText("Chưa có giao dịch trả nợ phù hợp.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm lệnh tái cấp vốn", exact: true })).toBeDisabled();
  });
}

test("payment load failure has retry; reload clears selection and uses the new revision", async ({ page }) => {
  let failed = true;
  await page.route("**/api/v1/me/retirement/actuals/2026-09", route => failed
    ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Không tải được giao dịch thử nghiệm" } } })
    : route.fulfill({ json: { data: actualMonth(9) } }));
  await openRefinance(page);
  await expect(page.getByRole("alert").filter({ hasText: "Không tải được giao dịch thử nghiệm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm lệnh tái cấp vốn", exact: true })).toBeDisabled();
  failed = false;
  await page.getByRole("button", { name: "Tải lại giao dịch trả nợ", exact: true }).click();
  await page.getByLabel("Giao dịch trả nợ đã ghi nhận *").selectOption(eventId);
  await page.getByRole("button", { name: "Tải lại giao dịch trả nợ", exact: true }).click();
  await expect(page.getByLabel("Giao dịch trả nợ đã ghi nhận *")).toHaveValue("");
  await page.getByLabel("Giao dịch trả nợ đã ghi nhận *").selectOption(eventId);
  await page.getByRole("button", { name: "Thêm lệnh tái cấp vốn", exact: true }).click();
  const request = page.waitForRequest("**/source-reforecasts/preview");
  await page.getByRole("button", { name: "Xem trước nguồn V4" }).click();
  expect((await request).postDataJSON().loanRevisions[0].allocations[0].actualRevision).toBe(9);
});

test("settlement cannot exceed the saved transaction amount", async ({ page }) => {
  await page.route("**/api/v1/me/retirement/actuals/2026-09", route => route.fulfill({ json: { data: actualMonth(7, "DEBT_PAYMENT", "MATCHED", "100") } }));
  await openRefinance(page);
  await page.getByLabel("Giao dịch trả nợ đã ghi nhận *").selectOption(eventId);
  await page.getByRole("button", { name: "Thêm lệnh tái cấp vốn", exact: true }).click();
  await expect(page.getByText("Số tiền phân bổ không hợp lệ", { exact: true })).toBeVisible();
  const request = page.waitForRequest("**/source-reforecasts/preview");
  await page.getByRole("button", { name: "Xem trước nguồn V4" }).click();
  expect((await request).postDataJSON().refinances).toEqual([]);
});
