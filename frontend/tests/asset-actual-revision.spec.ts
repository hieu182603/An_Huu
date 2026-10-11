import { expect, test } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes, fillEvidence } from "./helpers";
import { calculateLocalReconciliation } from "../src/services/actuals";

test("missed asset contribution uses saved revision, rejects failed loads and invalidates preview on reload", async ({ page }) => {
  await installRouteAuth(page); await installFinancialProfileRoutes(page);
  let revision = 7, fail = false;
  await page.route("**/me/retirement/actuals/*", route => {
    if (fail) return route.abort("failed");
    const data = { currency: "VND" as const, openingBalance: "0", closingBalance: "0", correctionReason: "TEST", entries: [] };
    return route.fulfill({ json: { data: { ...calculateLocalReconciliation(data), data,
      period: route.request().url().split("/").at(-1), revision, id: "test-actual", valueKind: "ACTUAL", history: [] } } });
  });
  const sourceId = "plan:11111111-1111-4111-8111-111111111111";
  await page.route("**/source-reforecasts/preview", route => route.fulfill({ json: { data: {
    status: "READY", inputHash: "a".repeat(64), issues: [], loanRevisionOptions: [],
    plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] },
    assetRevisionOptions: [{ sourceId, sourceRevision: 3, sourceHash: "b".repeat(64) }],
  } } }));
  await page.goto("/user/simulation?tab=actuals");
  await page.getByRole("button", { name: /Lệnh nguồn \(V4\)/ }).click();
  const preview = page.getByRole("button", { name: "Xem trước nguồn V4", exact: true });
  await preview.click();
  await fillEvidence(page, "Căn cứ cho lệnh vay / tài sản tiếp theo");
  await page.getByRole("button", { name: "Sửa nguồn tài sản", exact: true }).click();
  await page.getByLabel("Chọn tài sản từ danh mục *", { exact: true }).selectOption(sourceId);
  await page.getByRole("checkbox", { name: /Khai báo hoãn khoản góp/ }).check();
  await expect(page.getByRole("status").filter({ hasText: "phiên bản 7" })).toBeVisible();
  await page.getByLabel("Số tiền chưa góp *", { exact: true }).fill("100000000");
  const add = page.getByRole("button", { name: "Thêm lệnh sửa tài sản", exact: true });
  await add.click();
  let request = page.waitForRequest("**/source-reforecasts/preview"); await preview.click();
  let input = (await request).postDataJSON();
  expect(input.assetCommands[0].missedContribution.actualRevision).toBe(7);
  expect(input.assetCommands[0].evidence[0].contentHash).not.toBe("a".repeat(64));
  fail = true;
  await page.getByRole("button", { name: "Tải lại sổ tháng", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lưu phiên bản V4", exact: true })).toHaveCount(0);
  await add.click();
  await expect(page.getByText("Cần đối soát tháng", { exact: true })).toBeVisible();
  fail = false; revision = 9;
  await page.getByRole("button", { name: "Tải lại sổ tháng", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "phiên bản 9" })).toBeVisible();
  await add.click();
  request = page.waitForRequest("**/source-reforecasts/preview"); await preview.click(); input = (await request).postDataJSON();
  expect(input.assetCommands).toHaveLength(1);
  expect(input.assetCommands[0].missedContribution.actualRevision).toBe(9);
});
