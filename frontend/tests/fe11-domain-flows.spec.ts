import { expect, test, type Locator, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes, fillEvidence } from "./helpers";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { InsuranceHistoryRecord, InsuranceHistoryDocument } from "../src/services/insurance";

const historyId = "10000000-0000-4000-8000-000000000001";
// Backend uses CommonJS; load its source schemas with its existing TypeScript runtime.
const requireBackend = createRequire(new URL("../../backend/package.json", import.meta.url));
const backendRuntime = requireBackend("ts-node").register({ project: fileURLToPath(new URL("../../backend/tsconfig.json", import.meta.url)), transpileOnly: true });
const { historyPreviewSchema, historySaveSchema, pensionEstimateInputSchema, pensionEstimateSaveSchema } = requireBackend("./src/modules/pensions/insurance-schema.ts");
const { loanCreationSchema } = requireBackend("./src/modules/debts/source-create.ts");
const { assetSourceCommandSchema } = requireBackend("./src/modules/capital/source-candidate.ts");
backendRuntime.enabled(false);
const ruleId = "20000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const field = (root: Page | Locator, label: RegExp) => root.locator("label").filter({ hasText: label }).locator("..").locator("input,select").first();
const previewV4 = (page: Page) => page.getByRole("button", { name: "Xem trước nguồn V4", exact: true });
const saveV4 = (page: Page) => page.getByRole("button", { name: "Lưu phiên bản V4", exact: true });
const previewResponse = { status: "READY", issues: [], inputHash: hash, candidate: { calculation: { summary: { atRetirement: { projectedFund: "1500000000", coveragePercent: "80" } } } }, loanRevisionOptions: [],
  plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] }, assetRevisionOptions: [], saved: false, applied: false };
const document: InsuranceHistoryDocument = { schemaVersion: 1, birth: { precision: "YEAR", declaredValue: "1965" }, legalSex: "FEMALE",
  coverageFrom: "2026-08", coverageThrough: "2026-08", confirmedThroughMonth: "2026-08",
  months: [{ month: "2026-08", scheme: "COMPULSORY", salaryRegime: "EMPLOYER", status: "PAID", contributionBase: "8000000", participantCategory: "ARTICLE_2_1_A", evidence: [] }], specialPeriods: [] };
const history = (doc = document): InsuranceHistoryRecord => ({ id: historyId, userId: "USR-001", revision: 4, documentHash: hash, document: doc, createdAt: "2026-09-01T00:00:00.000Z" });

test.beforeEach(async ({ page }) => {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page);
  await page.route("**/me/pension/history", route => route.fulfill({ json: { data: null } }));
  await page.route("**/me/pension/estimates", route => route.fulfill({ json: { data: { items: [] } } }));
  await page.route("**/me/pension/legal-rules**", route => route.fulfill({ json: { data: { items: [] } } }));
});

async function openInsurance(page: Page) {
  await page.goto("/user/plan");
  await page.getByRole("button", { name: "Thẩm định & Ước tính BHXH", exact: true }).click();
  return page.getByRole("dialog");
}
async function enterHistory(page: Page) {
  const dialog = await openInsurance(page);
  await dialog.getByRole("button", { name: /Quá trình đóng BHXH/ }).click();
  await expect(field(dialog, /^Độ chính xác ngày sinh/)).toHaveValue("UNKNOWN");
  await field(dialog, /^Độ chính xác ngày sinh/).selectOption("YEAR");
  await dialog.getByPlaceholder("VD: 1985").fill("1965");
  await field(dialog, /^Giới tính/).selectOption("FEMALE");
  await field(dialog, /^Tháng đóng/).fill("2026-08");
  await field(dialog, /^Nhóm/).selectOption("ARTICLE_2_1_A");
  await dialog.getByPlaceholder("VD: 8000000").fill("8000000");
  await fillEvidence(page, "Căn cứ tháng đóng", "TEST-SO-BHXH-01");
  await dialog.getByRole("button", { name: "Thêm tháng này", exact: true }).click();
  return dialog;
}

test("BHXH: enter history, preview, retry after server saved but response lost, then reload", async ({ page }) => {
  let stored: InsuranceHistoryRecord | null = null;
  const writes: { body: unknown; key: string }[] = [];
  let preview: unknown;
  await page.route("**/me/pension/history/import-preview", async route => {
    preview = route.request().postDataJSON();
    historyPreviewSchema.parse(preview);
    await route.fulfill({ json: { data: { status: "READY", issues: [], inputHash: hash } } });
  });
  await page.route("**/me/pension/history", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: stored } });
    const body = route.request().postDataJSON();
    historySaveSchema.parse(body);
    writes.push({ body, key: route.request().headers()["idempotency-key"] });
    stored ??= history(body.preview.document);
    if (writes.length === 1) return route.abort("failed");
    return route.fulfill({ json: { data: stored } });
  });
  const dialog = await enterHistory(page);
  await dialog.getByRole("button", { name: /1\. Kiểm tra/ }).click();
  const save = dialog.getByRole("button", { name: /2\. Lưu sổ/ });
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toEqual(writes[0]);
  expect((writes[1].body as { preview: unknown }).preview).toEqual(preview);
  await page.reload();
  await page.getByRole("button", { name: "Thẩm định & Ước tính BHXH", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Quá trình đóng BHXH/ }).click();
  expect(stored?.document.months[0].evidence[0].reference).toBe("TEST-SO-BHXH-01");
  const reloadedRow = page.getByRole("dialog").getByRole("row").filter({ hasText: "2026-08" });
  await expect(reloadedRow).toContainText("1 chứng từ");
  await expect(reloadedRow).toContainText("8.000.000");
});

for (const status of ["INVALID", "INCOMPLETE"] as const) {
  test(`BHXH: ${status} cannot save without satisfying its gate`, async ({ page }) => {
    await page.route("**/me/pension/history/import-preview", route => route.fulfill({ json: { data: {
      status, inputHash: hash, issues: [{ path: "months", code: "TEST_HISTORY_ISSUE", message: "Dữ liệu thử nghiệm cần kiểm tra" }],
    } } }));
    const dialog = await enterHistory(page);
    await dialog.getByRole("button", { name: /1\. Kiểm tra/ }).click();
    await expect(dialog.getByText("TEST_HISTORY_ISSUE", { exact: true })).toBeVisible();
    const save = dialog.getByRole("button", { name: /2\. Lưu sổ/ });
    await expect(save).toBeDisabled();
    if (status === "INCOMPLETE") {
      await dialog.getByRole("checkbox", { name: /Tôi xác nhận muốn lưu/ }).check();
      await expect(save).toBeEnabled();
    }
  });
}

test("BHXH: enter ordinary estimate, save exact preview body and read saved assessment", async ({ page }) => {
  await page.route("**/me/pension/history", route => route.fulfill({ json: { data: history() } }));
  await page.route("**/me/pension/legal-rules**", route => route.fulfill({ json: { data: { items: [
    { id: ruleId, code: "TEST_ONLY_BH1", version: 1, engineCode: "vn-pension-benefit-v2", effectiveFrom: "2026-01-01", effectiveTo: null, documentHash: hash },
  ] } } }));
  const result = { inputHash: hash, engineCode: "vn-pension-benefit-v2", assessedOn: "2026-10-08", historyVersionId: historyId, historyRevision: 4,
    legalRuleSetVersionId: ruleId, legalRuleVersion: 1, assessment: { assessmentStatus: "NOT_YET_ELIGIBLE", estimateKind: "CURRENT_RULE_ESTIMATE",
      inputHash: hash, historyHash: hash, ruleHash: hash, countedMonths: 1, monthlyPension: null, startMonth: null, lumpSum: null,
      missingFields: [], breakdown: [], citations: [] } };
  let preview: unknown;
  let save: unknown;
  await page.route("**/me/pension/estimates/preview", route => {
    preview = route.request().postDataJSON(); pensionEstimateInputSchema.parse(preview);
    return route.fulfill({ json: { data: result } });
  });
  await page.route("**/me/pension/estimates", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: { items: [] } } });
    save = route.request().postDataJSON(); pensionEstimateSaveSchema.parse(save);
    return route.fulfill({ json: { data: { ...result, id: "30000000-0000-4000-8000-000000000001", createdAt: "2026-10-08T00:00:00.000Z", integrityHash: hash } } });
  });
  const dialog = await openInsurance(page);
  await field(dialog, /^Ngày dự kiến hưởng/).fill("2026-10-01");
  await fillEvidence(page, "Căn cứ thời điểm hưởng");
  await dialog.getByRole("button", { name: "Tính toán ước tính lương hưu", exact: true }).click();
  await dialog.getByRole("button", { name: "Lưu kết quả này", exact: true }).click();
  await expect.poll(() => save).toBeTruthy();
  expect((save as { preview: unknown }).preview).toEqual(preview);
  await dialog.getByRole("button", { name: /Bản lưu/ }).click();
  await expect(dialog.getByText("vn-pension-benefit-v2", { exact: false }).first()).toBeVisible();
});

for (const kind of ["loan", "asset"] as const) {
  test(`V4: enter ${kind}, validate backend command schema, preview/save/apply with matching version`, async ({ page }) => {
    await page.route("**/source-reforecasts/preview", route => route.fulfill({ json: { data: previewResponse } }));
    await page.route("**/source-reforecasts", route => route.fulfill({ json: { data: {
      planId: "plan-mock-1", revision: 8, currentVersionId: "ver-mock-1", baselineVersionId: "ver-mock-1",
      saved: { id: "ver-fe11-new", version: 3, createdAt: "2026-10-08T00:00:00.000Z", snapshotHash: hash, preview: {} },
    } } }));
    await page.goto("/user/simulation?tab=actuals");
    await page.getByRole("button", { name: /Lệnh nguồn \(V4\)/ }).click();
    await fillEvidence(page, "Căn cứ cho lệnh vay / tài sản tiếp theo");
    if (kind === "loan") {
      await page.getByRole("button", { name: "Tạo khoản vay", exact: true }).click();
      await page.getByPlaceholder("VD: HDBANK-2026-09").fill("TEST-LOAN-01");
      await page.getByPlaceholder("VD: 200000000").fill("200000000");
      await page.getByRole("button", { name: "Tạo khoản vay mới", exact: true }).last().click();
    } else {
      await page.getByPlaceholder("Vd: Bds-Nha-Pho-01").fill("TEST-ASSET-01");
      await page.getByRole("button", { name: "Thêm lệnh tạo tài sản", exact: true }).click();
    }
    const request = page.waitForRequest("**/source-reforecasts/preview");
    await previewV4(page).click();
    const input = (await request).postDataJSON();
    const command = kind === "loan" ? input.loanCreations[0] : input.assetCommands[0];
    expect(command).toBeTruthy();
    const parsed = (kind === "loan" ? loanCreationSchema : assetSourceCommandSchema).safeParse(command);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    const save = page.waitForRequest("**/source-reforecasts");
    await saveV4(page).click();
    expect((await save).postDataJSON().preview).toEqual(input);
    const apply = page.waitForRequest("**/apply");
    await page.getByRole("button", { name: "Áp dụng bản v3", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xác nhận áp dụng nguồn", exact: true }).click();
    expect((await apply).postDataJSON()).toMatchObject({ versionId: "ver-fe11-new", expectedRevision: 8 });
  });
}
