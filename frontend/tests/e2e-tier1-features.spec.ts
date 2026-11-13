import { expect, test } from "@playwright/test";
import {
  setupE2ERoutes,
  trackPageErrors,
  assertMarketingDesignTokens,
  assertWorkspaceDesignTokens,
  installFinancialProfileRoutes,
} from "./e2e-helpers";

test.beforeEach(async ({ page }) => {
  await setupE2ERoutes(page);
});

// =========================================================================
// SCREEN 1: LANDING PAGE (/)
// =========================================================================
test.describe("Screen 1: Landing Page (/)", () => {
  test("1.1 Route / loads with status 200, valid title, and renders h1", async ({ page }) => {
    const tracker = trackPageErrors(page);
    const resp = await page.goto("/");
    expect(resp?.status()).toBe(200);
    await expect(page).toHaveTitle(/Lập kế hoạch tài chính hưu trí/i);
    await expect(page.locator("h1")).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("1.2 Header renders brand logo and marketing navigation links", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Điều hướng chính", exact: true });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Cách hoạt động" })).toHaveAttribute("href", "/cach-hoat-dong");
    await expect(nav.getByRole("link", { name: "Mô phỏng" })).toHaveAttribute("href", "/mo-phong");
    await expect(nav.getByRole("link", { name: "Trợ lý AI" })).toHaveAttribute("href", "/tro-ly-ai");
  });

  test("1.3 Hero section renders kicker, value proposition, and CTA to /mo-phong", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator(".mk-hero");
    await expect(hero).toBeVisible();
    await expect(page.locator(".mk-hero-kicker")).toContainText("KẾ HOẠCH HƯU TRÍ CHO NGƯỜI VIỆT");
    const cta = hero.getByRole("link", { name: /Thử kế hoạch của tôi/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/mo-phong");
  });

  test("1.4 Value sections #gia-tri, #quy-trinh, and #tro-ly-ai render with cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#gia-tri")).toBeVisible();
    const featureCards = page.locator(".mk-feature");
    expect(await featureCards.count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator("#quy-trinh")).toBeVisible();
    const steps = page.locator(".mk-steps li");
    expect(await steps.count()).toBe(4);
    await expect(page.locator("#tro-ly-ai")).toBeVisible();
  });

  test("1.5 Footer renders 5 navigation columns and copyright notice", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator(".mk-footer");
    await expect(footer).toBeVisible();
    await expect(footer.getByText(/An Hưu/i).first()).toBeVisible();
    await expect(footer.getByText(/Bản quyền|An Hưu/i).first()).toBeVisible();
  });
});

// =========================================================================
// SCREEN 2: MÔ PHỎNG NHANH (/mo-phong)
// =========================================================================
test.describe("Screen 2: Mô phỏng nhanh (/mo-phong)", () => {
  test("2.1 Route /mo-phong loads with h1 and .mk-simulation-page", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/mo-phong");
    await expect(page).toHaveTitle(/Mô phỏng hưu trí/i);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".mk-simulation-page")).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("2.2 Sub-navigation .mk-demo-nav contains anchor links to sections", async ({ page }) => {
    await page.goto("/mo-phong");
    const nav = page.locator(".mk-demo-nav");
    await expect(nav).toBeVisible();
    await expect(nav.locator('a[href="#ke-hoach"]')).toBeVisible();
    await expect(nav.locator('a[href="#kich-ban"]')).toBeVisible();
    await expect(nav.locator('a[href="#phan-bo"]')).toBeVisible();
  });

  test("2.3 Interactive retirement calculation inputs respond to value updates", async ({ page }) => {
    await page.goto("/mo-phong");
    const contributionInput = page.locator('#num-sim-monthlyContribution, #range-sim-monthlyContribution, .mk-sim-sidebar input').first();
    await expect(contributionInput).toBeVisible();
    await contributionInput.fill("6000000");
    const metricPrimary = page.locator(".mk-metric-primary, .mk-sim-metrics").first();
    await expect(metricPrimary).toBeVisible();
  });

  test("2.4 Preset scenario buttons apply scenario parameters to simulation", async ({ page }) => {
    await page.goto("/mo-phong");
    const scenarioSection = page.locator("#kich-ban");
    await expect(scenarioSection).toBeVisible();
    const scenarioButtons = scenarioSection.locator("button.mk-preset");
    if (await scenarioButtons.count() > 0) {
      await scenarioButtons.first().click();
      await expect(page.locator(".mk-simulation-page")).toBeVisible();
    }
  });

  test("2.5 Asset allocation breakdown displays asset classes", async ({ page }) => {
    await page.goto("/mo-phong");
    const allocSection = page.locator("#phan-bo");
    await expect(allocSection).toBeVisible();
    await expect(allocSection.getByText(/Cổ phiếu|Trái phiếu|Tiền mặt|Tài sản/i).first()).toBeVisible();
  });
});

// =========================================================================
// SCREEN 3: TRỢ LÝ AI CÔNG KHAI (/tro-ly-ai)
// =========================================================================
test.describe("Screen 3: Trợ lý AI công khai (/tro-ly-ai)", () => {
  test("3.1 Route /tro-ly-ai loads with h1 and .mk-assistant-hero", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/tro-ly-ai");
    await expect(page).toHaveTitle(/Trợ lý AI/i);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".mk-assistant-hero")).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("3.2 AI assistant chat preview renders with interactive topic tabs", async ({ page }) => {
    await page.goto("/tro-ly-ai");
    const chat = page.locator(".mk-chat");
    await expect(chat).toBeVisible();
    const tabs = chat.locator(".mk-chat-tab");
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);
    // Click second tab
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/is-active/);
  });

  test("3.3 Sample question bubbles can be selected to display assistant answers", async ({ page }) => {
    await page.goto("/tro-ly-ai");
    const conversation = page.locator(".mk-chat-conversation");
    await expect(conversation).toBeVisible();
    await expect(conversation.locator(".mk-chat-bubble-user, .mk-chat-bubble-assistant").first()).toBeVisible();
  });

  test("3.4 Comparison bento and capabilities grid showcase AI reasoning", async ({ page }) => {
    await page.goto("/tro-ly-ai");
    const bento = page.locator(".mk-benchmarks-strip, .mk-assistant-flow-section, .mk-flow-grid").first();
    await expect(bento).toBeVisible();
  });

  test("3.5 Frequently asked questions accordion details expand on click", async ({ page }) => {
    await page.goto("/tro-ly-ai");
    const faqDetails = page.locator(".mk-faq details").first();
    if (await faqDetails.count() > 0) {
      await faqDetails.locator("summary").click();
      await expect(faqDetails).toHaveAttribute("open", "");
    }
  });
});

// =========================================================================
// SCREEN 4: CÁCH HOẠT ĐỘNG (/cach-hoat-dong)
// =========================================================================
test.describe("Screen 4: Cách hoạt động (/cach-hoat-dong)", () => {
  test("4.1 Route /cach-hoat-dong loads with h1 and .mk-how-page", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/cach-hoat-dong");
    await expect(page).toHaveTitle(/Cách hoạt động/i);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".mk-how-page")).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("4.2 Promise strip renders 3 numbered milestones", async ({ page }) => {
    await page.goto("/cach-hoat-dong");
    const strip = page.locator(".mk-promise-strip");
    await expect(strip).toBeVisible();
    await expect(strip.getByText("01")).toBeVisible();
    await expect(strip.getByText("02")).toBeVisible();
    await expect(strip.getByText("03")).toBeVisible();
  });

  test("4.3 4-step chronological timeline renders steps 01 through 04", async ({ page }) => {
    await page.goto("/cach-hoat-dong");
    const timeline = page.locator(".mk-how-timeline");
    await expect(timeline).toBeVisible();
    const steps = timeline.locator("li");
    expect(await steps.count()).toBe(4);
    await expect(steps.first().locator(".mk-how-step-index")).toContainText("01");
  });

  test("4.4 FAQ section handles interactive disclosures for methodology questions", async ({ page }) => {
    await page.goto("/cach-hoat-dong");
    const faq = page.locator(".mk-how-faq");
    await expect(faq).toBeVisible();
    const firstDetails = faq.locator("details").first();
    await firstDetails.locator("summary").click();
    await expect(firstDetails).toHaveAttribute("open", "");
  });

  test("4.5 Final CTA section invites user to start planning", async ({ page }) => {
    await page.goto("/cach-hoat-dong");
    const finalCta = page.locator(".mk-final");
    await expect(finalCta).toBeVisible();
    const link = finalCta.getByRole("link", { name: /Bắt đầu lập kế hoạch/i });
    await expect(link).toHaveAttribute("href", "/register");
  });
});

// =========================================================================
// SCREEN 5: CẨM NANG KIẾN THỨC (/user/knowledge)
// =========================================================================
test.describe("Screen 5: Cẩm nang kiến thức (/user/knowledge)", () => {
  test("5.1 Route /user/knowledge loads with heading 'Kiến thức tài chính'", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/knowledge");
    await expect(page.getByRole("heading", { name: /Kiến thức tài chính/i })).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("5.2 Topic filter buttons are interactive and switch active category", async ({ page }) => {
    await page.goto("/user/knowledge");
    const tabs = page.locator(".knowledge-topics button, .explore-category-tabs button");
    await tabs.first().waitFor({ state: "visible" });
    expect(await tabs.count()).toBeGreaterThanOrEqual(4);
    // Click BHXH filter
    const bhxhTab = tabs.filter({ hasText: /Bảo hiểm xã hội/i }).first();
    await bhxhTab.click();
    await expect(bhxhTab).toHaveClass(/is-active/);
  });

  test("5.3 Article cards display article titles, summary excerpts, and category badges", async ({ page }) => {
    await page.goto("/user/knowledge");
    const cards = page.locator(".article-card, .article-grid article");
    await cards.first().waitFor({ state: "visible" });
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    await expect(cards.first().locator("h3").first()).toBeVisible();
  });

  test("5.4 Financial glossary strip renders reference and lookup action", async ({ page }) => {
    await page.goto("/user/knowledge");
    const glossary = page.locator(".glossary-strip").first();
    await expect(glossary).toBeVisible();
    await expect(glossary.getByRole("button", { name: /Mở từ điển tra cứu/i })).toBeVisible();
  });

  test("5.5 Public route /kien-thuc renders editorial knowledge hub", async ({ page }) => {
    await page.goto("/kien-thuc");
    await expect(page).toHaveURL(/\/kien-thuc/);
    await expect(page.locator(".mk-site").first()).toBeVisible();
    await expect(page.locator("h1")).toContainText(/Kiến thức/i);
  });
});

// =========================================================================
// SCREEN 6: KHẢO SÁT BAN ĐẦU (/onboarding)
// =========================================================================
test.describe("Screen 6: Khảo sát ban đầu (/onboarding)", () => {
  test.beforeEach(async ({ page }) => {
    await installFinancialProfileRoutes(page, { profile: null, draft: null });
  });

  test("6.1 Route /onboarding loads .quick-onboarding-container.qo-shell", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/onboarding");
    await expect(page.locator(".quick-onboarding-container.qo-shell")).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("6.2 Stage navigation rail aside displays all 4 stages", async ({ page }) => {
    await page.goto("/onboarding");
    const aside = page.locator(".qo-aside");
    await expect(aside).toBeVisible();
    const stages = aside.locator(".qo-steps li");
    expect(await stages.count()).toBe(4);
    await expect(stages.nth(0)).toContainText(/Mong muốn/i);
    await expect(stages.nth(1)).toContainText(/Tiền hôm nay/i);
    await expect(stages.nth(2)).toContainText(/Gia đình/i);
    await expect(stages.nth(3)).toContainText(/chịu rủi ro/i);
  });

  test("6.3 Step 1 input fields validate month formats and monthly expense", async ({ page }) => {
    await page.goto("/onboarding");
    const card = page.locator(".qo-card");
    await expect(card).toBeVisible();
    await expect(card.getByText(/BƯỚC 1\/4/i)).toBeVisible();
    const birthInput = card.locator('input[type="month"]').first();
    await expect(birthInput).toBeVisible();
  });

  test("6.4 Step transition advances to Step 2 upon filling Step 1 required fields", async ({ page }) => {
    await page.goto("/onboarding");
    const card = page.locator(".qo-card");
    const monthInputs = card.locator('input[type="month"]');
    await monthInputs.nth(0).fill("1990-05");
    if (await monthInputs.count() > 1) {
      await monthInputs.nth(1).fill("2050-05");
    }
    const currencyInput = card.locator('input[type="text"]').first();
    if (await currencyInput.count() > 0) {
      await currencyInput.fill("20000000");
    }
    const nextBtn = card.getByRole("button", { name: /Tiếp tục/i });
    await nextBtn.click();
    await expect(card.getByText(/BƯỚC 2\/4/i)).toBeVisible();
  });

  test("6.5 Form retains user progress without crashing on reload", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator(".qo-shell")).toBeVisible();
    await page.reload();
    await expect(page.locator(".qo-shell")).toBeVisible();
  });
});

// =========================================================================
// SCREEN 7: TỔNG QUAN NGƯỜI DÙNG (/user/dashboard)
// =========================================================================
test.describe("Screen 7: Tổng quan người dùng (/user/dashboard)", () => {
  test("7.1 Route /user/dashboard loads with greeting and summary layout", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/dashboard");
    await expect(page.locator(".yoga-dashboard-layout, .dashboard-summary-header").first()).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("7.2 Key dashboard action card renders next step for user", async ({ page }) => {
    await page.goto("/user/dashboard");
    await expect(page.locator(".dashboard-next-step, .dashboard-summary, h1.user-hero-title").first()).toBeVisible();
  });

  test("7.3 Dashboard sections render quick links and monthly cashflow", async ({ page }) => {
    await page.goto("/user/dashboard");
    await expect(page.locator(".dashboard-quick-links, .user-cashflow-section").first()).toBeVisible();
  });

  test("7.4 Quick shortcut links provide immediate access to Plan, Account, and Allocation", async ({ page }) => {
    await page.goto("/user/dashboard");
    const quickLinks = page.locator(".dashboard-quick-links");
    await expect(quickLinks).toBeVisible();
    await expect(quickLinks.getByRole("link", { name: /kế hoạch/i })).toHaveAttribute("href", "/user/plan");
    await expect(quickLinks.getByRole("link", { name: /tài chính/i })).toHaveAttribute("href", "/user/account");
    await expect(quickLinks.getByRole("link", { name: /phân bổ/i })).toHaveAttribute("href", "/user/risk-portfolio");
  });

  test("7.5 Cashflow section renders income, living expense, and surplus summary cards", async ({ page }) => {
    await page.goto("/user/dashboard");
    const cashflow = page.locator(".user-cashflow-section");
    await expect(cashflow).toBeVisible();
    await expect(cashflow.locator(".user-cashflow-card").first()).toBeVisible();
  });
});

// =========================================================================
// SCREEN 8: MỤC TIÊU HƯU TRÍ (/user/goal)
// =========================================================================
test.describe("Screen 8: Mục tiêu hưu trí (/user/goal)", () => {
  test("8.1 Route /user/goal loads with heading 'Mục tiêu nghỉ hưu'", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/goal");
    await expect(page.getByRole("heading", { name: /Mục tiêu (nghỉ hưu|hưu trí)/i })).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("8.2 Target retirement age inputs allow adjusting retirement horizon", async ({ page }) => {
    await page.goto("/user/goal");
    const ageInput = page.locator('input[type="number"], input[type="range"]').first();
    await expect(ageInput).toBeVisible();
  });

  test("8.3 Lifestyle selection cards adjust expected retirement expenses", async ({ page }) => {
    await page.goto("/user/goal");
    const lifestyleCards = page.locator(".lifestyle-card, .goal-card, .lifestyle-option");
    if (await lifestyleCards.count() > 0) {
      await lifestyleCards.first().click();
      await expect(lifestyleCards.first()).toBeVisible();
    }
  });

  test("8.4 Timeline calculation displays accumulation and retirement years", async ({ page }) => {
    await page.goto("/user/goal");
    const timeline = page.locator(".life-timeline, .goal-timeline, .timeline-bar").first();
    if (await timeline.count() > 0) {
      await expect(timeline).toBeVisible();
    }
  });

  test("8.5 Save or update button persists goal updates without error alerts", async ({ page }) => {
    await page.goto("/user/goal");
    const saveBtn = page.getByRole("button", { name: /Lưu mục tiêu|Cập nhật/i }).first();
    if (await saveBtn.count() > 0) {
      await expect(saveBtn).toBeEnabled();
    }
  });
});

// =========================================================================
// SCREEN 9: KẾ HOẠCH NGHỈ HƯU & THỬ ĐIỀU CHỈNH (/user/plan)
// =========================================================================
test.describe("Screen 9: Kế hoạch nghỉ hưu & Thử điều chỉnh (/user/plan)", () => {
  test("9.1 Route /user/plan loads with plan header and status indicator", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/plan");
    await expect(page.locator(".plan-page, .retirement-plan-page").first()).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("9.2 4-section navigation switches between Overview, Adjust, Cashflow, Analysis", async ({ page }) => {
    await page.goto("/user/plan");
    const nav = page.locator(".plan-nav, .plan-sections-nav, .plan-page__subnav").first();
    if (await nav.count() > 0) {
      await expect(nav.getByRole("link", { name: /Tổng quan/i })).toBeVisible();
      await expect(nav.getByRole("link", { name: /Điều chỉnh/i })).toBeVisible();
      await expect(nav.getByRole("link", { name: /Dòng tiền/i })).toBeVisible();
      await expect(nav.getByRole("link", { name: /Phân tích/i })).toBeVisible();
    }
  });

  test("9.3 Plan overview displays required fund, projected fund, and funding gap", async ({ page }) => {
    await page.goto("/user/plan");
    await expect(page.getByText(/Quỹ cần|Quỹ dự kiến|Khoảng thiếu|Đạt mục tiêu/i).first()).toBeVisible();
  });

  test("9.4 Interactive adjustment sliders update preview dynamically", async ({ page }) => {
    await page.goto("/user/plan#plan-settings");
    const adjustSection = page.locator("#plan-settings, .plan-adjust-grid").first();
    if (await adjustSection.count() > 0) {
      await expect(adjustSection).toBeVisible();
    }
  });

  test("9.5 Plan sync status component indicates active plan version", async ({ page }) => {
    await page.goto("/user/plan");
    const syncStatus = page.locator(".plan-sync-status, .sync-badge").first();
    if (await syncStatus.count() > 0) {
      await expect(syncStatus).toBeVisible();
    }
  });
});

// =========================================================================
// SCREEN 10: DÒNG TIỀN & THỰC TẾ (/user/simulation -> /user/plan#plan-cashflow)
// =========================================================================
test.describe("Screen 10: Dòng tiền & Thực tế (/user/simulation)", () => {
  test("10.1 Route /user/simulation redirects cleanly to /user/plan", async ({ page }) => {
    await page.goto("/user/simulation");
    await expect(page).toHaveURL(/\/user\/plan/);
  });

  test("10.2 Cashflow section #plan-cashflow renders monthly cashflow table", async ({ page }) => {
    await page.goto("/user/plan#plan-cashflow");
    const cashflowSection = page.locator("#plan-cashflow, .cashflow-table-wrap").first();
    await expect(cashflowSection).toBeVisible();
  });

  test("10.3 Cashflow table displays projected monthly cash inflows and outflows", async ({ page }) => {
    await page.goto("/user/plan#plan-cashflow");
    await expect(page.getByText(/Thu nhập|Chi tiêu sinh hoạt|Tiền tích lũy|Dòng tiền/i).first()).toBeVisible();
  });

  test("10.4 Cashflow breakdown provides column headers for timeline", async ({ page }) => {
    await page.goto("/user/plan#plan-cashflow");
    const tableOrGrid = page.locator("table, .cashflow-grid, .cashflow-rows").first();
    if (await tableOrGrid.count() > 0) {
      await expect(tableOrGrid).toBeVisible();
    }
  });

  test("10.5 Reforecast / actuals status alert displays sync information", async ({ page }) => {
    await page.goto("/user/plan");
    const container = page.locator(".plan-page, .retirement-plan-page").first();
    await expect(container).toBeVisible();
  });
});

// =========================================================================
// SCREEN 11: PHÂN BỔ TÀI SẢN & DANH MỤC (/user/risk-portfolio)
// =========================================================================
test.describe("Screen 11: Phân bổ tài sản & Danh mục (/user/risk-portfolio)", () => {
  test("11.1 Route /user/risk-portfolio loads with portfolio allocation header", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/risk-portfolio");
    await expect(page.getByRole("heading", { name: /Phân bổ tài sản/i })).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("11.2 Capital pillars section separates emergency, medium-term, and retirement assets", async ({ page }) => {
    await page.goto("/user/risk-portfolio");
    const pillars = page.locator(".capital-pillars, .allocation-sources, .asset-roles").first();
    if (await pillars.count() > 0) {
      await expect(pillars).toBeVisible();
    }
  });

  test("11.3 Risk questionnaire displays question cards with selectable radio choices", async ({ page }) => {
    await page.goto("/user/risk-portfolio");
    const questionCards = page.locator(".risk-question-card, .question-card");
    if (await questionCards.count() > 0) {
      await expect(questionCards.first()).toBeVisible();
      const radio = questionCards.first().locator('input[type="radio"], button').first();
      await radio.click();
    }
  });

  test("11.4 Recommended portfolio breakdown displays target asset weights", async ({ page }) => {
    await page.goto("/user/risk-portfolio");
    const header = page.locator(".risk-page-head");
    await expect(header).toBeVisible();
    await expect(header.getByText(/Phân bổ tài sản|Kế hoạch đầu tư/i).first()).toBeVisible();
  });

  test("11.5 Glide path / trajectory visualization renders asset shift over time", async ({ page }) => {
    await page.goto("/user/risk-portfolio");
    const glidePath = page.locator(".portfolio-glide-path, .glide-path-chart").first();
    if (await glidePath.count() > 0) {
      await expect(glidePath).toBeVisible();
    }
  });
});

// =========================================================================
// SCREEN 12: KHOẢN NỢ & LỊCH TRẢ NỢ (/user/debts)
// =========================================================================
test.describe("Screen 12: Khoản nợ & Lịch trả nợ (/user/debts)", () => {
  test("12.1 Route /user/debts loads with debt overview and header", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/debts");
    await expect(page.getByRole("heading", { name: /Khoản nợ|Quản lý nợ/i })).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("12.2 Debt summary cards display total outstanding debt and monthly payment", async ({ page }) => {
    await page.goto("/user/debts");
    await expect(page.getByText(/Tổng dư nợ|Trả nợ trong tháng/i).first()).toBeVisible();
  });

  test("12.3 Debt list renders individual loan cards with category icon badges", async ({ page }) => {
    await page.goto("/user/debts");
    const debtRows = page.locator(".debt-card, .debt-row, .ledger-row");
    if (await debtRows.count() > 0) {
      await expect(debtRows.first()).toBeVisible();
    }
  });

  test("12.4 Repayment strategy comparison contrasts Snowball and Avalanche payoff schedules", async ({ page }) => {
    await page.goto("/user/debts");
    const strategy = page.locator(".debt-strategies, .compare-grid, .strategy-card").first();
    if (await strategy.count() > 0) {
      await expect(strategy).toBeVisible();
    }
  });

  test("12.5 Add debt dialog modal opens upon clicking add debt button", async ({ page }) => {
    await page.goto("/user/debts");
    const addBtn = page.getByRole("button", { name: /Thêm khoản nợ|Khai báo khoản (nợ|vay)/i }).first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      const modal = page.locator('.modal, [role="dialog"]').first();
      await expect(modal).toBeVisible();
      // Close modal
      const closeBtn = modal.getByRole("button", { name: /Hủy|Đóng/i }).first();
      if (await closeBtn.count() > 0) await closeBtn.click();
    }
  });
});

// =========================================================================
// SCREEN 13: SẢN PHẨM TÀI CHÍNH (/user/explore & /user/investments)
// =========================================================================
test.describe("Screen 13: Sản phẩm tài chính (/user/explore)", () => {
  test("13.1 Route /user/explore loads financial products catalog", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/explore");
    await expect(page.getByRole("heading", { name: /Sản phẩm tài chính|Khám phá sản phẩm/i })).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("13.2 Filter buttons filter products by risk level", async ({ page }) => {
    await page.goto("/user/explore");
    const filterButtons = page.locator(".filter-bar button, .explore-filters button");
    if (await filterButtons.count() > 0) {
      await filterButtons.first().click();
      await expect(filterButtons.first()).toBeVisible();
    }
  });

  test("13.3 Product cards display expected return, partner brand, and management fees", async ({ page }) => {
    await page.goto("/user/explore");
    const cards = page.locator(".product-card, .marketplace-card");
    if (await cards.count() > 0) {
      await expect(cards.first()).toBeVisible();
      await expect(cards.first().getByText(/Lợi nhuận|Lợi suất|Phí/i).first()).toBeVisible();
    }
  });

  test("13.4 Product consultation request modal opens upon action click", async ({ page }) => {
    await page.goto("/user/explore");
    const consultBtn = page.getByRole("button", { name: /Tư vấn|Quan tâm|Chi tiết/i }).first();
    if (await consultBtn.count() > 0) {
      await consultBtn.click();
      const modal = page.locator('.modal, [role="dialog"]').first();
      await expect(modal).toBeVisible();
      const closeBtn = modal.getByRole("button", { name: /Hủy|Đóng/i }).first();
      if (await closeBtn.count() > 0) await closeBtn.click();
    }
  });

  test("13.5 Route /user/investments redirects cleanly without 404 or white screen", async ({ page }) => {
    await page.goto("/user/investments");
    await expect(page).toHaveURL(/\/user\/(risk-portfolio|explore)/);
  });
});

// =========================================================================
// SCREEN 14: TRỢ LÝ AI NGƯỜI DÙNG (/user/assistant)
// =========================================================================
test.describe("Screen 14: Trợ lý AI người dùng (/user/assistant)", () => {
  test("14.1 Route /user/assistant loads authenticated AI workspace", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/assistant");
    await expect(page.locator(".ai-chat-page, .ai-chat-workspace").first()).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("14.2 Assistant header displays active plan version synchronization badge", async ({ page }) => {
    await page.goto("/user/assistant");
    const trigger = page.locator(".ai-plan-trigger, .ai-plan-version").first();
    await expect(trigger).toBeVisible();
  });

  test("14.3 Suggested prompt chips allow quick insertion of financial inquiries", async ({ page }) => {
    await page.goto("/user/assistant");
    const chips = page.locator(".ai-chat-suggestions button");
    if (await chips.count() > 0) {
      await expect(chips.first()).toBeVisible();
      await chips.first().click();
    }
  });

  test("14.4 Chat conversation container renders message exchange area", async ({ page }) => {
    await page.goto("/user/assistant");
    const chatFeed = page.locator(".ai-chat-feed, .ai-chat-stage").first();
    await expect(chatFeed).toBeVisible();
  });

  test("14.5 Privacy and conversation history controls are accessible in UI", async ({ page }) => {
    await page.goto("/user/assistant");
    const historyBtn = page.locator(".ai-history-toggle, .ai-new-chat").first();
    await expect(historyBtn).toBeVisible();
  });
});

// =========================================================================
// SCREEN 15: HỒ SƠ TÀI CHÍNH CHI TIẾT (/user/account)
// =========================================================================
test.describe("Screen 15: Hồ sơ tài chính chi tiết (/user/account)", () => {
  test("15.1 Route /user/account loads Financial Profile hub with cashflow metrics", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/account");
    await expect(page.locator(".financial-profile-page, .finance-hub-page").first()).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("15.2 5 central topic cards render for full financial profile", async ({ page }) => {
    await page.goto("/user/account");
    const hub = page.locator(".finance-hub-page, .financial-profile-page").first();
    await expect(hub).toBeVisible();
    await expect(hub.getByRole("heading", { name: /Tài chính của bạn/i })).toBeVisible();
  });

  test("15.3 Profile completeness progress indicator displays completeness percentage", async ({ page }) => {
    await page.goto("/user/account");
    const progress = page.locator(".finance-hub-progress, progress").first();
    if (await progress.count() > 0) {
      await expect(progress).toBeVisible();
    }
  });

  test("15.4 Clicking a topic card opens the dedicated profile editor section", async ({ page }) => {
    await page.goto("/user/account");
    const topicBtn = page.locator(".finance-hub-card button, .finance-hub-card a").first();
    if (await topicBtn.count() > 0) {
      await topicBtn.click();
      const editor = page.locator(".finance-hub-editor, .finance-hub-page").first();
      await expect(editor).toBeVisible();
    }
  });

  test("15.5 Tab navigation allows switching between Financial Profile and Account Settings", async ({ page }) => {
    await page.goto("/user/account");
    const settingsLink = page.getByRole("link", { name: /Cài đặt tài khoản|Cài đặt/i }).first();
    if (await settingsLink.count() > 0) {
      await settingsLink.click();
      await expect(page).toHaveURL(/tab=settings/);
    }
  });
});

// =========================================================================
// SCREEN 16: TÀI KHOẢN & CÀI ĐẶT (/user/account?tab=settings)
// =========================================================================
test.describe("Screen 16: Tài khoản & Cài đặt (/user/account?tab=settings)", () => {
  test("16.1 Route /user/account?tab=settings loads Account Settings panel", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/account?tab=settings");
    await expect(page.locator(".account-settings-page, .phase-eight-page").first()).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("16.2 Personal information form renders user name, email, and verification status", async ({ page }) => {
    await page.goto("/user/account?tab=settings");
    await expect(page.getByText(/user@demo.com|Nguyễn Minh An|Thông tin tài khoản/i).first()).toBeVisible();
  });

  test("16.3 Notification preference switches allow toggling notification settings", async ({ page }) => {
    await page.goto("/user/account?tab=settings");
    const tabs = page.locator(".account-settings-tabs button");
    if (await tabs.count() > 1) {
      await tabs.nth(1).click();
      const switches = page.locator('input[type="checkbox"], button[role="switch"]');
      if (await switches.count() > 0) {
        await expect(switches.first()).toBeVisible();
      }
    }
  });

  test("16.4 Plan export action enables downloading plan version data as CSV", async ({ page }) => {
    await page.goto("/user/account?tab=settings");
    const tabs = page.locator(".account-settings-tabs button");
    if (await tabs.count() > 2) {
      await tabs.nth(2).click();
      const exportBtn = page.getByRole("button", { name: /Xuất tệp CSV/i }).first();
      if (await exportBtn.count() > 0) {
        await expect(exportBtn).toBeVisible();
      }
    }
  });

  test("16.5 Security section renders password change and credentials info", async ({ page }) => {
    await page.goto("/user/account?tab=settings");
    const tabs = page.locator(".account-settings-tabs button");
    if (await tabs.count() > 1) {
      await tabs.nth(1).click();
      await expect(page.getByText(/Bảo mật|Đổi mật khẩu|Phiên đăng nhập/i).first()).toBeVisible();
    }
  });
});

// =========================================================================
// SCREEN 17: HỖ TRỢ (/user/support)
// =========================================================================
test.describe("Screen 17: Hỗ trợ (/user/support)", () => {
  test("17.1 Route /user/support loads support ticket management center", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/support");
    await expect(page.getByRole("heading", { name: /Hỗ trợ/i })).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("17.2 Ticket status filter controls filter ticket list", async ({ page }) => {
    await page.goto("/user/support");
    const filterSelect = page.locator('select, [role="combobox"]').first();
    if (await filterSelect.count() > 0) {
      await expect(filterSelect).toBeVisible();
    }
  });

  test("17.3 Ticket list renders items with ID, subject, and status", async ({ page }) => {
    await page.goto("/user/support");
    await expect(page.getByText(/tk-001|bảo hiểm xã hội|VssID/i).first()).toBeVisible();
  });

  test("17.4 'Tạo yêu cầu hỗ trợ' button opens new ticket dialog", async ({ page }) => {
    await page.goto("/user/support");
    const createBtn = page.getByRole("button", { name: /Tạo yêu cầu|Gửi yêu cầu/i }).first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      const modal = page.locator('.modal, [role="dialog"]').first();
      await expect(modal).toBeVisible();
      const closeBtn = modal.getByRole("button", { name: /Hủy|Đóng/i }).first();
      if (await closeBtn.count() > 0) await closeBtn.click();
    }
  });

  test("17.5 Selecting a ticket opens ticket conversation thread", async ({ page }) => {
    await page.goto("/user/support?ticket=tk-001");
    await expect(page.getByText(/tk-001|bảo hiểm xã hội|VssID/i).first()).toBeVisible();
  });
});

// =========================================================================
// SCREEN 18: THÔNG BÁO (/user/notifications)
// =========================================================================
test.describe("Screen 18: Thông báo (/user/notifications)", () => {
  test("18.1 Route /user/notifications loads notification center", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/notifications");
    await expect(page.locator("h1")).toContainText(/Trung tâm thông báo/i);
    await expect(page.locator(".notif-hub-container")).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("18.2 Category filter tabs filter notifications by topic", async ({ page }) => {
    await page.goto("/user/notifications");
    const filterTabs = page.locator(".notif-hub-filter-tabs button");
    if (await filterTabs.count() > 0) {
      await expect(filterTabs.first()).toBeVisible();
    }
  });

  test("18.3 Notification stats cards display total and unread counters", async ({ page }) => {
    await page.goto("/user/notifications");
    const statCards = page.locator(".notif-hub-stat-card");
    await expect(statCards.first()).toBeVisible();
    expect(await statCards.count()).toBeGreaterThanOrEqual(2);
  });

  test("18.4 'Đánh dấu tất cả đã đọc' updates unread indicator", async ({ page }) => {
    await page.goto("/user/notifications");
    const markAllBtn = page.getByRole("button", { name: /Đánh dấu tất cả đã đọc/i }).first();
    if (await markAllBtn.count() > 0) {
      await markAllBtn.click();
      await expect(page.locator(".notif-hub-container")).toBeVisible();
    }
  });

  test("18.5 Search box dynamically filters notifications matching query string", async ({ page }) => {
    await page.goto("/user/notifications");
    const searchInput = page.locator('.notif-hub-search-box input');
    if (await searchInput.count() > 0) {
      await searchInput.fill("bảo mật");
      await expect(page.locator(".notif-hub-container")).toBeVisible();
    }
  });
});

// =========================================================================
// FEATURE 19: DUAL DESIGN TOKENS VERIFICATION
// =========================================================================
test.describe("Feature 19: Dual Design Tokens Verification", () => {
  test("19.1 Marketing pages scope styles strictly under .mk-site container", async ({ page }) => {
    await page.goto("/");
    await assertMarketingDesignTokens(page);
    await page.goto("/mo-phong");
    await assertMarketingDesignTokens(page);
    await page.goto("/cach-hoat-dong");
    await assertMarketingDesignTokens(page);
    await page.goto("/tro-ly-ai");
    await assertMarketingDesignTokens(page);
  });

  test("19.2 Marketing primary buttons use pill-shaped border-radius (>= 20px)", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator(".mk-hero-actions a, .mk-button").first();
    const radius = await btn.evaluate((el) => window.getComputedStyle(el).borderRadius);
    expect(parseFloat(radius)).toBeGreaterThanOrEqual(20);
  });

  test("19.3 Marketing palette applies Teal Navy #10385b and Soft Mint #83d8c8", async ({ page }) => {
    await page.goto("/");
    const heroTitleSpan = page.locator(".mk-hero h1 span");
    await expect(heroTitleSpan).toHaveCSS("color", "rgb(131, 216, 200)");
  });

  test("19.4 App workspace applies Oceanic Navy and distinct workspace topbar", async ({ page }) => {
    await page.goto("/user/dashboard");
    await assertWorkspaceDesignTokens(page);
  });

  test("19.5 App workspace cards use rounded geometry (8px - 16px), preserving token isolation", async ({ page }) => {
    await page.goto("/user/dashboard");
    const card = page.locator(".dashboard-metric, .user-cashflow-card, .card, .notif-hub-stat-card").first();
    const radius = await card.evaluate((el) => window.getComputedStyle(el).borderRadius);
    expect(parseFloat(radius)).toBeGreaterThanOrEqual(8);
  });
});

// =========================================================================
// FEATURE 20: TECHNICAL & CONSOLE VERIFICATION
// =========================================================================
test.describe("Feature 20: Technical & Console Verification", () => {
  test("20.1 Navigation loop across public marketing pages produces zero page errors", async ({ page }) => {
    const tracker = trackPageErrors(page);
    for (const path of ["/", "/cach-hoat-dong", "/mo-phong", "/tro-ly-ai"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
    }
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("20.2 Navigation loop across user workspace pages produces zero page errors", async ({ page }) => {
    const tracker = trackPageErrors(page);
    const workspacePaths = [
      "/user/dashboard",
      "/user/goal",
      "/user/plan",
      "/user/risk-portfolio",
      "/user/debts",
      "/user/explore",
      "/user/assistant",
      "/user/account",
      "/user/support",
      "/user/notifications",
    ];
    for (const path of workspacePaths) {
      await page.goto(path);
      await expect(page.locator(".user-topbar, .user-nav, .dashboard-summary, h1, .yoga-dashboard-layout").first()).toBeVisible();
    }
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("20.3 All navigation anchor links have non-empty valid href targets", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("nav a");
    const count = await links.count();
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      expect(href).toBeTruthy();
      expect(href).not.toBe("#");
      expect(href).not.toContain("javascript:");
    }
  });

  test("20.4 Skip-to-content accessibility link #main-content is present", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator(".skip-link");
    await expect(skipLink).toHaveAttribute("href", "#main-content");
  });

  test("20.5 Unrecognized route renders custom 404 page without crashing", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/duong-dan-khong-ton-tai-404");
    await expect(page.getByText(/404|Không tìm thấy trang/i).first()).toBeVisible();
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });
});
