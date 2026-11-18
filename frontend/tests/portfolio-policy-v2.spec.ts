import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { readFileSync } from "node:fs";
import type { PortfolioPolicyDocument } from "../src/services/portfolios";

const policies: Record<"v1" | "v2", PortfolioPolicyDocument> = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));

// Same shape as backend/src/modules/portfolios/engine.ts preview scenarios.
function scenarioRows(startMonth: string, months: number, annualReturn: number, annualInflation: number) {
  const g = Math.pow(1 + annualReturn / 100, 1 / 12), inf = Math.pow(1 + annualInflation / 100, 1 / 12);
  let value = 1;
  return Array.from({ length: months }, (_, i) => {
    const m = Number(startMonth.slice(0, 4)) * 12 + Number(startMonth.slice(5, 7)) - 1 + i;
    value *= g;
    return { month: `${Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, "0")}`, rebalanced: i === 0, turnoverFraction: "0", rebalanceCostFraction: "0",
      returnMonthlyFactor: String(g), inflationMonthlyFactor: String(inf), inflationAnnualPercent: String(annualInflation), inflationDeltaPoints: "0", unitValue: String(value), holdings: [] };
  });
}
function scenarios(startMonth: string, months: number) {
  return ([["ADVERSE", "Kịch bản bất lợi", 2, 6], ["BASE", "Kịch bản cơ sở", 6, 3.5], ["FAVORABLE", "Kịch bản thuận lợi", 9, 3]] as const).map(([kind, label, r, i]) => {
    const rows = scenarioRows(startMonth, months, r, i);
    return { kind, label, evidence: "", changes: [], rows, endingUnitValue: rows.at(-1)!.unitValue };
  });
}

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
  await page.route("**/api/v1/me/portfolio-policies/workspace/preview", route => {
    const input = route.request().postDataJSON(); calls.push(input);
    const startMonth="2026-10", endMonth=input.endMonth??"2060-01", months=(Number(endMonth.slice(0,4))-2026)*12+Number(endMonth.slice(5,7))-10+1;
    const allocations=("schedule" in template?template.schedule[0].allocations:template.glidePath.points[0].allocations).map(a=>({...a,amountVnd:null}));
    return route.fulfill({ json: { data: {
      profileRevision:1,valuationDate:"2026-10-15",policyVersionId:policy.id,assumptionVersionId:"assumption-test",informationalOnly:true,
      capital:{status:"INCOMPLETE",reserveMonths:6,growthCapital:null,goals:[],issues:[],warnings:[]},loss:{status:"REVIEW_REQUIRED",message:"",lossAmount:null,allowedLossAmount:null},allocations,assetLabels:{CASH:"Tiền gửi & thanh khoản"},issues:[],
      portfolio:{status: options.missingIssue ? "INCOMPLETE" : "READY",
      assessment: { totalScore: 30, riskBandId: data.riskBands[0].id, selectedTemplateId: template.id, eligibleTemplateIds: [template.id], checks: [] }, scenarios: options.missingIssue ? [] : scenarios(startMonth, months),
      issues: options.missingIssue ? [{ path: "retirementMonth", code: "RETIREMENT_MONTH_REQUIRED" }] : [],
    } } } });
  });
  await page.addInitScript(({ answers, templateId, whatIf, en }) => {
    localStorage.setItem("anhuu_language", en ? "en" : "vi");
    sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify({ policyVersionId: "policy-test", templateId, endMonth: "2060-01", answers, ...(whatIf ? { whatIf: { retirementMonth: whatIf } } : {}) }));
  }, { answers: data.questions.map(q => ({ questionId: q.id, choiceId: q.choices[0].id })), templateId: template.id, whatIf: options.whatIf, en: options.en });
  await page.goto("/user/risk-portfolio");
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  await page.locator(".allocation-steps button").nth(1).click();await page.locator(".allocation-steps button").nth(2).click();
  await page.getByRole("button",{name:options.en?"View my allocation →":"Xem phương án của tôi →",exact:true}).click();
  return { calls, errors, template };
}

test("missing retirement month produces Vietnamese guidance without marking year zero", async ({ page }) => {
  const { calls, errors } = await setup(page, { missingIssue: true });
  await expect(page.getByText("Vui lòng chọn tháng bắt đầu nghỉ hưu mong muốn trong hồ sơ tài chính.")).toBeVisible();
  expect(calls.at(-1)).not.toHaveProperty("retirementMonth");
  expect(errors).toEqual([]);
});

test("published v1 renders its allocation breakdown and has no glide table", async ({ page }) => {
  const { errors, template } = await setup(page, { version: "v1" });
  await expect(page.locator(".allocation-experiment .allocation-reference")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  if ("schedule" in template) await expect(page.locator(".allocation-experiment .allocation-breakdown dt").first()).toBeVisible();
  expect(errors).toEqual([]);
});
