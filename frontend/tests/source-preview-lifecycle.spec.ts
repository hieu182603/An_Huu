import { expect, test, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import type { SaveSourceReforecastInput, SourceReforecastPreviewInput } from "../src/services/plans";

const previewResult = (inputHash = "a".repeat(64)) => ({
  status: "READY", issues: [], inputHash, candidate: { calculation: { summary: { atRetirement: { projectedFund: "1500000000", coveragePercent: "80" } } } },
  loanRevisionOptions: [], assetRevisionOptions: [],
  plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] }, saved: false, applied: false,
});
const savedResult = { planId: "pl-mock-1", revision: 3, currentVersionId: null, baselineVersionId: "ver-mock-1",
  saved: { id: "ver-saved", version: 3, createdAt: "2026-10-08T00:00:00.000Z", snapshotHash: "b".repeat(64), preview: {} } };
const previewButton = (page: Page) => page.getByRole("button", { name: "Xem trước nguồn V4", exact: true });
const saveButton = (page: Page) => page.getByRole("button", { name: "Lưu phiên bản V4", exact: true });
async function addFlow(page: Page, document = "Chứng từ thử nghiệm", amount = "10000000") {
  await page.getByPlaceholder("VD: 10000000", { exact: true }).fill(amount);
  await page.getByPlaceholder("VD: Hợp đồng lao động hoặc phụ lục nguồn thu", { exact: true }).fill(document);
  await page.getByRole("button", { name: "Thêm lệnh", exact: true }).click();
}
async function capturePreview(page: Page): Promise<SourceReforecastPreviewInput> {
  const request = page.waitForRequest("**/source-reforecasts/preview");
  await previewButton(page).click();
  await expect(saveButton(page)).toBeVisible();
  return (await request).postDataJSON();
}
test.beforeEach(async ({ page }) => {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page);
  await page.route("**/source-reforecasts/preview", route => route.fulfill({ json: { data: previewResult() } }));
  await page.route("**/source-reforecasts", route => route.fulfill({ json: { data: savedResult } }));
  await page.goto("/user/simulation?tab=actuals");
  await page.getByRole("button", { name: /Lệnh nguồn \(V4\)/ }).click();
});

test("add/remove invalidates preview and saved apply; save reuses the exact preview payload", async ({ page }) => {
  await capturePreview(page);
  await addFlow(page);
  await expect(saveButton(page)).not.toBeVisible();
  await expect(page.getByText("Cần xem trước lại danh sách lệnh trước khi lưu.", { exact: true })).toBeVisible();
  const preview = await capturePreview(page);
  const save = page.waitForRequest("**/source-reforecasts");
  await saveButton(page).click();
  expect((await save).postDataJSON()).toEqual({ preview, expectedInputHash: "a".repeat(64), confirm: true });
  await expect(page.getByRole("button", { name: "Áp dụng bản v3", exact: true })).toBeVisible();
  await page.getByRole("row").filter({ hasText: "Chứng từ thử nghiệm" }).getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(saveButton(page)).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Áp dụng bản v3", exact: true })).not.toBeVisible();
});

test("network retry keeps body/key; a changed command requires a new preview and key", async ({ page }) => {
  const saves: { body: SaveSourceReforecastInput; key: string }[] = [];
  await page.route("**/source-reforecasts", route => {
    saves.push({ body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"] });
    return saves.length === 1 ? route.abort("failed") : route.fulfill({ json: { data: savedResult } });
  });
  await addFlow(page);
  const preview = await capturePreview(page);
  await saveButton(page).click();
  await expect.poll(() => saves.length).toBe(1);
  await expect(saveButton(page)).toBeEnabled();
  await saveButton(page).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toEqual(saves[0]);
  expect(saves[1].body.preview).toEqual(preview);
  await addFlow(page, "Chứng từ thứ hai", "20000000");
  await expect(saveButton(page)).not.toBeVisible();
  const changedPreview = await capturePreview(page);
  await saveButton(page).click();
  await expect.poll(() => saves.length).toBe(3);
  expect(saves[2].key).not.toBe(saves[1].key);
  expect(saves[2].body.preview).toEqual(changedPreview);
  expect(changedPreview.sourceCommands).toHaveLength(2);
});

test("a late preview cannot replace the newer preview after command edits", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/source-reforecasts/preview", async route => {
    const call = ++calls;
    if (call === 1) await held;
    await route.fulfill({ json: { data: previewResult((call === 1 ? "b" : "c").repeat(64)) } });
  });
  await previewButton(page).click();
  await expect.poll(() => calls).toBe(1);
  await addFlow(page);
  const input = await capturePreview(page);
  const lateResponse = page.waitForResponse(async response => response.url().endsWith("/source-reforecasts/preview")
    && (await response.json()).data.inputHash === "b".repeat(64));
  release();
  await lateResponse;
  const save = page.waitForRequest("**/source-reforecasts");
  await saveButton(page).click();
  expect((await save).postDataJSON()).toEqual({ preview: input, expectedInputHash: "c".repeat(64), confirm: true });
});

test("changing cutoff invalidates the preview even if the cutoff is changed back", async ({ page }) => {
  const preview = await capturePreview(page);
  const cutoff = page.locator('input[type="month"]').first();
  await cutoff.fill("2026-08");
  await expect(saveButton(page)).not.toBeVisible();
  await cutoff.fill(preview.throughMonth);
  await expect(saveButton(page)).not.toBeVisible();
  await capturePreview(page);
});

test("409 keeps commands but requires another preview", async ({ page }) => {
  await page.route("**/source-reforecasts", route => route.fulfill({ status: 409,
    json: { error: { code: "ACTUAL_SOURCE_CHANGED", message: "Dữ liệu nguồn đã đổi, hãy xem trước lại." } } }));
  await addFlow(page);
  await capturePreview(page);
  await saveButton(page).click();
  await expect(saveButton(page)).not.toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Chứng từ thử nghiệm" })).toBeVisible();
  await expect(page.getByText("Dữ liệu nguồn đã đổi, hãy xem trước lại.").first()).toBeVisible();
});

test("saving locks edits until the saved batch is available", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/source-reforecasts", async route => { await held; await route.fulfill({ json: { data: savedResult } }); });
  await addFlow(page);
  await capturePreview(page);
  const request = page.waitForRequest("**/source-reforecasts");
  await saveButton(page).click();
  await request;
  await expect(page.getByPlaceholder("VD: 10000000", { exact: true })).toBeDisabled();
  await expect(page.locator("#actual-period")).toBeDisabled();
  const response = page.waitForResponse("**/source-reforecasts");
  release();
  await response;
  await expect(saveButton(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Áp dụng bản v3", exact: true })).toBeVisible();
});
