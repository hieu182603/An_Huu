import { expect, test, type Page, type Locator } from "@playwright/test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import { installRouteAuth, installFinancialProfileRoutes, fillEvidence } from "./helpers";

const requireBackend = createRequire(new URL("../../backend/package.json", import.meta.url));
const runtime = requireBackend("ts-node").register({ project: fileURLToPath(new URL("../../backend/tsconfig.json", import.meta.url)), transpileOnly: true });
const { stateV2Career } = requireBackend("./src/tests/benefit-fixtures.ts");
const { voluntaryPrepaidValidationCase } = requireBackend("./src/modules/pensions/voluntary-prepaid-validation.ts");
const { assessBenefit } = requireBackend("./src/modules/pensions/benefit-engine.ts");
const { pensionEstimateInputSchema, historyPreviewSchema } = requireBackend("./src/modules/pensions/insurance-schema.ts");
runtime.enabled(false);
const field = (root: Locator, label: RegExp) => root.locator("label").filter({ hasText: label }).locator("..").locator("input,select").first();
const hash = "f".repeat(64);

async function setup(page: Page, kind: "state" | "prepaid", stateOptions = {}) {
  await installRouteAuth(page); await installFinancialProfileRoutes(page);
  const f = kind === "state" ? stateV2Career(stateOptions) : voluntaryPrepaidValidationCase();
  const file = kind === "state" ? "bh2-state-mixed-v2.draft.json" : "bh2-voluntary-prepaid.draft.json";
  const rules = JSON.parse(readFileSync(new URL(`../../backend/seed-data/legal-2026/${file}`, import.meta.url), "utf8")).document;
  await page.route("**/me/pension/history", route => route.fulfill({ json: { data: { id: f.input.historyVersionId, revision: f.input.expectedHistoryRevision, documentHash: hash, document: f.history } } }));
  await page.route("**/me/pension/legal-rules**", route => route.fulfill({ json: { data: { items: [{ id: f.input.legalRuleSetVersionId, code: "TEST_ONLY", version: 1, engineCode: rules.engineCode }] } } }));
  await page.route("**/me/pension/estimates", route => route.fulfill({ json: { data: { items: [] } } }));
  await page.goto("/user/plan");
  await page.getByRole("button", { name: "Thẩm định & Ước tính BHXH", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await field(dialog, /^Chế độ tham gia/).selectOption(kind);
  await field(dialog, /^Ngày dự kiến hưởng/).fill(f.input.intendedBenefitDate);
  await dialog.getByLabel("Ngày chấm dứt việc làm", { exact: true }).fill(f.input.employmentEndDate || "");
  await dialog.getByLabel("Tháng ngừng đóng", { exact: true }).fill(f.input.contributionStopMonth);
  return { f, rules, dialog };
}

for (const branch of ["state", "prepaid", "hazardous"] as const) {
  test(`${branch}: browser input passes the backend engine, missing evidence is blocked and edits invalidate preview`, async ({ page }) => {
    const kind = branch === "hazardous" ? "state" : branch;
    const { f, rules, dialog } = await setup(page, kind, branch === "hazardous" ? {
      from: "1995-01", early: "5", late: "3", transfer: "2013-01", treatment: "HAZARDOUS_TRANSFER", hazard: [["1995-01", "2012-12"]], windowFrom: "2007-01",
    } : {});
    let body: any, assessment: any;
    await page.route("**/me/pension/estimates/preview", route => {
      body = pensionEstimateInputSchema.parse(route.request().postDataJSON());
      assessment = assessBenefit(f.history, body, rules, "2026-10-08");
      return route.fulfill({ json: { data: { inputHash: hash, assessment, engineCode: rules.engineCode } } });
    });
    const calculate = dialog.getByRole("button", { name: "Tính toán ước tính lương hưu", exact: true });
    await calculate.click();
    await expect(dialog.getByRole("alert").filter({ hasText: "Cần bổ sung thông tin" })).toBeVisible();
    expect(body).toBeUndefined();
    if (kind === "state") {
      await field(dialog, /^Tháng bắt đầu tham gia Nhà nước/).fill(f.input.stateSalaryCase.firstParticipationMonth);
      await field(dialog, /^Căn cứ thời điểm hưởng$/).selectOption(f.input.caseDetails.benefitStart.kind);
      await fillEvidence(page, "Căn cứ thời điểm hưởng", "TEST-START", "2026-07-01");
      await fillEvidence(page, "Căn cứ tháng tham gia đầu tiên", "TEST-FIRST", "2026-07-01");
      await fillEvidence(page, "Căn cứ chế độ lương / chuyển ngành", "TEST-STATE", "2026-07-01");
      if (branch === "hazardous") {
        await field(dialog, /^Chế độ phân loại lương/).selectOption("HAZARDOUS_TRANSFER");
        await field(dialog, /^Tháng chuyển ngành/).fill("2013-01");
        await dialog.getByRole("button", { name: "Thêm giai đoạn nghề", exact: true }).click();
        await dialog.getByLabel("Từ tháng", { exact: true }).fill("1995-01");
        await dialog.getByLabel("Đến tháng", { exact: true }).fill("2012-12");
        await dialog.getByLabel("Tháng bắt đầu cửa sổ lương được xác nhận", { exact: true }).fill("2007-01");
        await fillEvidence(page, "Căn cứ các giai đoạn nghề", "TEST-HAZARD", "2026-07-01");
      }
    } else {
      const prepaid = f.input.voluntaryPrepaid;
      await dialog.getByLabel("Ngày đề nghị hưởng", { exact: true }).fill(f.input.benefitRequestDate);
      await dialog.getByLabel("Ngày nộp tiền", { exact: true }).fill(prepaid.paymentOn);
      await dialog.getByLabel("Ngày đăng ký kỳ đóng", { exact: true }).fill(prepaid.registeredOn);
      await dialog.getByLabel("Tháng đầu kỳ đã đóng", { exact: true }).fill(prepaid.periodStartMonth);
      await field(dialog, /^Kỳ đóng trước$/).selectOption(String(prepaid.periodMonths));
      await field(dialog, /^Thu nhập căn cứ đóng trước/).fill(prepaid.monthlyIncome);
      await field(dialog, /^Trạng thái nộp tiền/).selectOption("DOCUMENTED_FULLY_PAID");
      await dialog.getByLabel("Căn cứ đề nghị hưởng", { exact: true }).selectOption("DOCUMENTED");
      await fillEvidence(page, "Căn cứ đóng trước", "TEST-PAYMENT", "2026-07-01");
      await fillEvidence(page, "Căn cứ đề nghị hưởng", "TEST-REQUEST", "2026-07-01");
    }
    await calculate.click();
    await expect.poll(() => assessment?.assessmentStatus).toBe("ELIGIBLE");
    expect(assessment.monthlyPension).not.toBeNull();
    if (branch === "hazardous") expect(Number(assessment.monthlyPension)).toBe(8602000);
    if (kind === "state") expect(body.caseDetails).toBeTruthy();
    else expect(body.voluntaryPrepaid.periodStartMonth).not.toBe(body.intendedBenefitDate.slice(0, 7));
    await expect(dialog.getByRole("button", { name: "Lưu kết quả này", exact: true })).toBeVisible();
    await dialog.getByLabel("Ngày đề nghị hưởng", { exact: true }).fill("2026-07-02");
    await expect(dialog.getByRole("button", { name: "Lưu kết quả này", exact: true })).toHaveCount(0);
    let release!: () => void, started = false, finished = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/me/pension/estimates/preview", async route => {
      started = true; await gate;
      await route.fulfill({ json: { data: { inputHash: hash, assessment, engineCode: rules.engineCode } } });
      finished = true;
    });
    await calculate.click(); await expect.poll(() => started).toBe(true);
    await dialog.getByLabel("Ngày đề nghị hưởng", { exact: true }).fill("2026-07-03");
    release(); await expect.poll(() => finished).toBe(true);
    await expect(dialog.getByRole("button", { name: "Lưu kết quả này", exact: true })).toHaveCount(0);
  });
}

test("history keeps decimal precision and selects maternity code by month", async ({ page }) => {
  const { dialog } = await setup(page, "state");
  await dialog.getByRole("button", { name: /Quá trình đóng BHXH/ }).click();
  await field(dialog, /^Tháng đóng/).fill("2015-12");
  await field(dialog, /^Trạng thái \*/).selectOption("CREDITED");
  await field(dialog, /^Loại thời gian tính đóng/).selectOption("MATERNITY");
  await dialog.getByPlaceholder("VD: 8000000").fill("90071992547409.91");
  await fillEvidence(page, "Căn cứ tháng đóng", "TEST-MATERNITY", "2026-07-01");
  await dialog.getByRole("button", { name: "Thêm tháng này", exact: true }).click();
  await dialog.getByRole("button", { name: /Cập nhật tháng|Ghi đè|Xác nhận cập nhật/ }).click();
  let document: any;
  await page.route("**/me/pension/history/import-preview", route => {
    document = historyPreviewSchema.parse(route.request().postDataJSON()).document;
    return route.fulfill({ json: { data: { status: "READY", inputHash: hash, issues: [] } } });
  });
  await dialog.getByRole("button", { name: /1\. Kiểm tra/ }).click();
  await expect.poll(() => document).toBeTruthy();
  expect(document.months.find((row: any) => row.month === "2015-12")).toMatchObject({ contributionBase: "90071992547409.91", creditKind: "MATERNITY_LAW2006_ART35_2" });
  await field(dialog, /^Tháng đóng/).fill("2000-01");
  await field(dialog, /^Chế độ lương/).selectOption("STATE");
  await field(dialog, /^Trạng thái \*/).selectOption("PAID");
  await dialog.getByPlaceholder("VD: 3.33").fill("3.33");
  await dialog.getByLabel(/^Thang lương đã chuyển đổi/).selectOption("ND204_PUBLIC");
  await dialog.getByLabel(/^Hệ số có phụ cấp thâm niên nghề/).selectOption("YES");
  await fillEvidence(page, "Căn cứ tháng đóng", "TEST-CONVERSION", "2026-07-01");
  await dialog.getByRole("button", { name: "Thêm tháng này", exact: true }).click();
  await dialog.getByRole("button", { name: "Cập nhật tháng này", exact: true }).click();
  await dialog.getByRole("button", { name: /1\. Kiểm tra/ }).click();
  await expect.poll(() => document.months.find((row: any) => row.month === "2000-01").stateSalary?.includesSeniorityAllowance).toBe(true);
  expect(document.months.find((row: any) => row.month === "2000-01").stateSalary).toMatchObject({ totalContributionCoefficient: "3.33", pre2004Conversion: { scale: "ND204_PUBLIC" } });
});

for (const width of [390, 768, 1440]) {
  test(`new insurance evidence and dates remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { dialog } = await setup(page, "prepaid");
    await fillEvidence(page, "Căn cứ đóng trước", "TEST-VIEWPORT");
    const evidence = page.getByRole("group", { name: "Căn cứ đóng trước", exact: true });
    await evidence.getByLabel("Hoặc chọn tài liệu gốc (chỉ xử lý trên máy)", { exact: true }).setInputFiles({ name: "test-only.txt", mimeType: "text/plain", buffer: Buffer.from("abc") });
    await expect(evidence.getByRole("status")).toHaveText("Đã đọc tài liệu.");
    await expect(evidence.locator("textarea")).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    expect(await dialog.evaluate(el => el.getBoundingClientRect().right <= innerWidth + 2)).toBe(true);
    mkdirSync(".cache", { recursive: true });
    await page.screenshot({ path: `.cache/insurance-fixes-${width}.png` });
  });
}
