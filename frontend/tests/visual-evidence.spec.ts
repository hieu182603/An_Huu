import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";

test("capture key responsive screens for review", async ({ page }) => {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page);

  // Mocks for user retirement & AI pages
  await page.route("**/api/v1/me/retirement/plans**", async (route) => {
    await route.fulfill({
      json: {
        data: {
          page: 1,
          limit: 20,
          total: 1,
          items: [
            {
              id: "plan-mock-1",
              userId: "USR-001",
              currentVersionId: "ver-1",
              baselineVersionId: "ver-1",
              revision: 1,
              stale: false,
              createdAt: "2026-10-04T00:00:00.000Z",
            },
          ],
        },
      },
    });
  });

  await page.route("**/api/v1/me/retirement/plans/plan-mock-1", async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: "plan-mock-1",
          userId: "USR-001",
          currentVersionId: "ver-1",
          baselineVersionId: "ver-1",
          revision: 1,
          stale: false,
          createdAt: "2026-10-04T00:00:00.000Z",
          profileChanged: false,
          updates: { assumptions: null, policy: null },
          updatePolicy: "MANUAL",
          current: {
            id: "ver-1",
            planId: "plan-mock-1",
            version: 1,
            createdAt: "2026-10-04T00:00:00.000Z",
            profileRevision: 1,
            snapshotHash: "hash-001",
            preview: {
              status: "READY",
              selection: {
                retirementMonth: "2044-01",
                endMonth: "2069-01",
                monthlyExpenseToday: "20000000.00",
                monthlyContribution: "5000000.00",
                monthlyReserve: "2000000.00",
                terminalBalance: "0.00",
                inflationRate: "0.04",
                returnRate: "0.08",
              },
              inputHash: "hash-001",
              calculation: {
                summary: {
                  status: "FEASIBLE",
                  readinessScore: 82,
                  valuationDate: "2026-10-04T00:00:00.000Z",
                  retirementMonth: "01/2044",
                  endMonth: "01/2069",
                  accumulationMonths: 216,
                  retirementMonths: 300,
                  initialRetirementCapital: "1000000000.00",
                  futureMonthlyExpense: "25000000.00",
                  plannedMonthlyContribution: "5000000.00",
                  atRetirement: {
                    projectedFund: "4500000000.00",
                    requiredFund: "4200000000.00",
                    fundingGap: "0.00",
                    coveragePercent: "107.14",
                  },
                  atValuation: {
                    projectedFund: "4500000000.00",
                    requiredFund: "4200000000.00",
                    fundingGap: "0.00",
                    coveragePercent: "107.14",
                  },
                  algebraicRequiredFund: "4200000000.00",
                  liquidityReserveAboveAlgebraicPV: "300000000.00",
                  requiredConstantMonthlyContribution: "4500000.00",
                  additionalMonthlyContribution: "0.00",
                  savingsStatus: "NO_ADDITIONAL_CONTRIBUTION",
                  requiredContributionWithinCapacity: true,
                  retirementFundingShortfall: "0.00",
                  excessAtRetirement: "300000000.00",
                  firstShortfallMonth: null,
                  firstBudgetShortfallMonth: null,
                  unfundedWithdrawals: "0.00",
                  terminalBalance: "500000000.00",
                  fundedTerminalBalance: "500000000.00",
                  terminalTarget: "500000000.00",
                  terminalTargetShortfall: "0.00",
                  projectedFundAtValuation: "4500000000.00",
                  requiredFundAtValuation: "4200000000.00",
                  fundingGapAtValuation: "0.00",
                  coveragePercentagePoints: "107.14",
                },
                rows: [],
              },
              modelVersion: "1.0",
              profileRevision: 1,
              valuationDate: "2026-10-04T00:00:00.000Z",
              currency: "VND",
              references: {
                profileHash: "hash-001",
                policyVersionId: "pol-1",
                policyVersion: 1,
                policyHash: "polh-1",
                assumptionVersionId: "asm-1",
                assumptionVersion: 1,
                assumptionHash: "asmh-1",
              },
              sources: [],
              issues: [],
              warnings: [],
            },
          },
        },
      },
    });
  });

  await page.route("**/api/v1/me/retirement/plans/plan-mock-1/versions**", async (route) => {
    await route.fulfill({
      json: {
        data: {
          page: 1,
          limit: 50,
          total: 1,
          items: [
            {
              id: "ver-1",
              version: 1,
              createdAt: "2026-10-04T00:00:00.000Z",
              profileRevision: 1,
              snapshotHash: "hash-001",
              references: {
                profileHash: "ph-1",
                policyVersionId: "pol-1",
                policyVersion: 1,
                policyHash: "polh-1",
                assumptionVersionId: "asm-1",
                assumptionVersion: 1,
                assumptionHash: "asmh-1",
              },
              summary: {
                status: "FEASIBLE",
                readinessScore: 82,
                valuationDate: "2026-10-04T00:00:00.000Z",
                retirementMonth: "01/2044",
                endMonth: "01/2069",
                accumulationMonths: 216,
                retirementMonths: 300,
                initialRetirementCapital: "1000000000.00",
                futureMonthlyExpense: "25000000.00",
                plannedMonthlyContribution: "5000000.00",
                atRetirement: {
                  projectedFund: "4500000000.00",
                  requiredFund: "4200000000.00",
                  fundingGap: "0.00",
                  coveragePercent: "107.14",
                },
                atValuation: {
                  projectedFund: "4500000000.00",
                  requiredFund: "4200000000.00",
                  fundingGap: "0.00",
                  coveragePercent: "107.14",
                },
                algebraicRequiredFund: "4200000000.00",
                liquidityReserveAboveAlgebraicPV: "300000000.00",
                requiredConstantMonthlyContribution: "4500000.00",
                additionalMonthlyContribution: "0.00",
                savingsStatus: "NO_ADDITIONAL_CONTRIBUTION",
                requiredContributionWithinCapacity: true,
                retirementFundingShortfall: "0.00",
                excessAtRetirement: "300000000.00",
                firstShortfallMonth: null,
                firstBudgetShortfallMonth: null,
                unfundedWithdrawals: "0.00",
                terminalBalance: "500000000.00",
                fundedTerminalBalance: "500000000.00",
                terminalTarget: "500000000.00",
                terminalTargetShortfall: "0.00",
                projectedFundAtValuation: "4500000000.00",
                requiredFundAtValuation: "4200000000.00",
                fundingGapAtValuation: "0.00",
                coveragePercentagePoints: "107.14",
              },
            },
          ],
        },
      },
    });
  });

  await page.route("**/api/v1/me/portfolio-policies**", async (route) => {
    await route.fulfill({
      json: {
        data: {
          page: 1,
          limit: 10,
          total: 0,
          items: [],
        },
      },
    });
  });

  await page.route("**/api/v1/me/ai/privacy**", async (route) => {
    await route.fulfill({
      json: {
        data: {
          revision: 1,
          processing: true,
          saveHistory: true,
          policyVersion: "ai-explanation-2026-10-v1",
          acceptedPolicyVersion: "ai-explanation-2026-10-v1",
          retentionDays: 30,
          purpose: "Tư vấn kế hoạch hưu trí",
          providerData: [],
          excludedData: [],
          historyPolicy: "Lưu trữ mã hóa theo quy chuẩn bảo mật.",
          providerConfigured: true,
        },
      },
    });
  });

  await page.route("**/api/v1/me/notifications**", async (route) => {
    await route.fulfill({
      json: {
        data: {
          items: [],
          total: 0,
          unreadCount: 0,
        },
      },
    });
  });

  await page.route("**/api/v1/me/ai/conversations**", async (route) => {
    await route.fulfill({
      json: {
        data: {
          page: 1,
          limit: 20,
          total: 0,
          items: [],
        },
      },
    });
  });

  await mkdir("artifacts/qa", { recursive: true });

  async function safeGoto(url: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return;
      } catch (err: any) {
        if (attempt === 2 || !err?.message?.includes("ERR_CONNECTION_REFUSED")) throw err;
        await page.waitForTimeout(1000);
      }
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await safeGoto("/");
  await expect(page.getByRole("heading", { name: /An tâm hôm nay/i })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/landing-desktop-after.png", fullPage: true });

  await page.waitForTimeout(500);
  await safeGoto("/user/dashboard");
  await expect(page.getByRole("heading", { name: /Xin chào/i })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/dashboard-desktop-redesign.png", fullPage: true });

  await page.waitForTimeout(500);
  await safeGoto("/user/plan");
  await expect(page.getByRole("heading", { name: /Kế hoạch hưu trí/i })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/plan-desktop-after.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await safeGoto("/user/dashboard");
  await expect(page.getByRole("heading", { name: /Xin chào/i })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/dashboard-mobile-redesign.png", fullPage: true });
  await page.waitForTimeout(500);
  await safeGoto("/user/assistant");
  await expect(page.getByRole("textbox", { name: "Câu hỏi dành cho trợ lý AI" })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/assistant-mobile-after.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(500);
  await safeGoto("/admin/financial-config");
  await expect(page.getByRole("heading", { name: /Cấu hình tham số tài chính/i })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/admin-config-after.png", fullPage: true });
});

test("capture reload loader screen", async ({ page }) => {
  await page.route("**/api/v1/auth/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.fulfill({ json: { data: { accessToken: "ui-test-token", user: null } } });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/user/dashboard", { waitUntil: "commit" });
  await page.waitForSelector(".anhuu-loading", { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "artifacts/qa/reload-screen-reverted.png" });
});

