import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { readFileSync } from "node:fs";
import type { PortfolioPolicyDocument } from "../src/services/portfolios";

const policies: Record<"v1" | "v2", PortfolioPolicyDocument> = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));

// Policy structures copied from the supplied v1/v2 seed documents. All API traffic
// is intercepted; this suite cannot publish policies or write to the database.
async function setup(page: Page, options: { version?: "v1" | "v2"; retirement?: string; whatIf?: string; en?: boolean; missingIssue?: boolean } = {}) {
  const data = policies[options.version ?? "v2"];
  const template = data.templates[0];
  const calls: any[] = [];
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { message: "Unmocked test API" } } }));
  await installRouteAuth(page);
  await page.route("**/socket.io/**", route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await installFinancialProfileRoutes(page, { profile: { revision: 1, schemaVersion: 2, data: {
    schemaVersion: 2, valuationDate: "2026-10-15", currency: "VND", periodUnit: "MONTH",
    personal: { birthMonth: { status: "KNOWN", value: "1980-01" }, desiredRetirementMonth: options.missingIssue ? { status: "UNKNOWN" } : { status: "KNOWN", value: options.retirement ?? "2033-11" }, pensionStartMonth: { status: "UNKNOWN" } },
    income: { status: "KNOWN", entries: [] }, expenses: { status: "KNOWN", entries: [] }, assets: { status: "KNOWN", entries: [] },
    debts: { status: "NOT_APPLICABLE", reason: "Không có nợ" }, pension: { status: "UNKNOWN" },
  } } });
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0 } } }));
  await page.route("**/api/v1/me/assumptions/assumption-test", route => route.fulfill({ json: { data: { data: { assetClasses: [{ code: "CASH", label: "Tiền gửi & thanh khoản" }] } } } }));
  const policy = { id: "policy-test", version: 4, data: { ...data, assumptionVersionId: "assumption-test" } };
  await page.route("**/api/v1/me/portfolio-policies**", route => route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith("/policy-test") ? policy : { status: "AVAILABLE", items: [policy] } } }));
  await page.route("**/api/v1/me/portfolio-policies/preview", route => {
    const input = route.request().postDataJSON(); calls.push(input);
    return route.fulfill({ json: { data: {
      status: options.missingIssue ? "INCOMPLETE" : "READY",
      assessment: { totalScore: 30, riskBandId: data.riskBands[0].id, selectedTemplateId: template.id, eligibleTemplateIds: [template.id] }, scenarios: [],
      issues: options.missingIssue ? [{ path: "retirementMonth", code: "RETIREMENT_MONTH_REQUIRED" }] : [],
    } } });
  });
  await page.addInitScript(({ answers, templateId, whatIf, en }) => {
    localStorage.setItem("anhuu_language", en ? "en" : "vi");
    sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify({ policyVersionId: "policy-test", templateId, endMonth: "2060-01", answers, ...(whatIf ? { whatIf: { retirementMonth: whatIf } } : {}) }));
  }, { answers: data.questions.map(q => ({ questionId: q.id, choiceId: q.choices[0].id })), templateId: template.id, whatIf: options.whatIf, en: options.en });
  await page.goto("/user/risk-portfolio");
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  return { calls, errors, template };
}

test("v2 renders real glide points, current interpolation and localized asset labels", async ({ page }) => {
  const { calls, errors } = await setup(page);
  const table = page.getByRole("table", { name: "Lộ trình phân bổ tới nghỉ hưu" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("rowheader").first()).toHaveText("15");
  await expect(table.getByRole("rowheader").last()).toHaveText("0");
  await expect(table.locator('[aria-current="true"]')).toContainText("7 · Vị trí hiện tại (nội suy ≈)");
  await expect(table.getByRole("columnheader", { name: "Tiền gửi & thanh khoản" })).toBeVisible();
  expect(calls.at(-1).retirementMonth).toBe("2033-11");
  await table.screenshot({ path: "test-results/portfolio-v2-table.png" });
  expect(errors).toEqual([]);
});

test("what-if overrides profile month and English labels are shown", async ({ page }) => {
  const { calls, errors } = await setup(page, { whatIf: "2027-09", en: true });
  await expect(page.getByRole("table").locator('[aria-current="true"]')).toContainText("0 · Current position");
  await expect(page.getByRole("columnheader", { name: "Government bonds" })).toBeVisible();
  expect(calls.at(-1).retirementMonth).toBe("2027-09");
  expect(errors).toEqual([]);
});

test("missing retirement month produces Vietnamese guidance without marking year zero", async ({ page }) => {
  const { calls, errors } = await setup(page, { missingIssue: true });
  await expect(page.getByText("Vui lòng chọn tháng bắt đầu nghỉ hưu mong muốn trong hồ sơ tài chính.")).toBeVisible();
  await expect(page.getByRole("table").locator('[aria-current="true"]')).toHaveCount(0);
  expect(calls.at(-1)).not.toHaveProperty("retirementMonth");
  expect(errors).toEqual([]);
});

test("published v1 keeps the existing allocation cards and has no glide table", async ({ page }) => {
  const { errors, template } = await setup(page, { version: "v1" });
  await expect(page.getByRole("heading", { name: `Tỷ lệ tiền dành cho từng nhóm tài sản (${template.label})`, exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  if ("schedule" in template) for (const allocation of template.schedule[0].allocations) {
    await expect(page.getByText(`Nhóm tài sản: ${allocation.assetClass}`, { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
