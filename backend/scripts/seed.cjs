require("dotenv").config();
require("ts-node/register");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const path = require("path");
const { AssumptionsService } = require("../src/modules/assumptions/service");
const { PortfoliosService } = require("../src/modules/portfolios/service");
const refs = require("../seed-data/references.json");

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production.");
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Seed is allowed only on a local development database.");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12 || Buffer.byteLength(password) > 72) throw new Error("Set SEED_PASSWORD (12 characters, at most 72 UTF-8 bytes).");

  const db = new PrismaClient();
  try {
    // ── 1. Test users ────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);
    for (const role of ["USER", "ADMIN"]) {
      await db.user.upsert({
        where: { email: role.toLowerCase() + "@anhuu.test" }, update: {},
        create: { email: role.toLowerCase() + "@anhuu.test", fullName: "Local " + role, initials: role.slice(0, 2), role, status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash },
      });
    }
    console.log("✓ Test users ready (existing accounts unchanged).");

    // ── 2. Partners & Products ───────────────────────────────────────────────
    const partnerIdMap = {};
    for (const p of refs.partners) {
      let partner = await db.partner.findFirst({ where: { name: p.name } });
      if (!partner) {
        partner = await db.partner.create({
          data: { name: p.name, type: p.type, website: p.website, isVisible: true, isHighlight: false },
        });
        console.log(`✓ Partner created: ${p.name}`);
      }
      partnerIdMap[p.key] = partner.id;
    }

    for (const prod of refs.products) {
      const partnerId = partnerIdMap[prod.partnerKey];
      if (!partnerId) continue;
      const exists = await db.partnerProduct.findFirst({ where: { partnerId, name: prod.name } });
      if (!exists) {
        await db.partnerProduct.create({
          data: { partnerId, name: prod.name, category: prod.category, expectedReturn: prod.expectedReturn, riskLevel: prod.riskLevel, description: prod.description },
        });
        console.log(`✓ Product created: ${prod.name}`);
      }
    }

    // ── 3. Articles ──────────────────────────────────────────────────────────
    for (const a of refs.articles) {
      await db.article.upsert({
        where: { slug: a.slug }, update: {},
        create: { slug: a.slug, title: a.title, excerpt: a.excerpt, content: a.content, category: a.category, authorName: "An Hưu", kind: "ARTICLE", status: "DRAFT" },
      });
    }
    console.log(`✓ ${refs.articles.length} articles seeded (existing unchanged).`);

    // ── 4. Assumption set ────────────────────────────────────────────────────
    const { ASSUMPTION_SERIES_CODE } = require("../src/modules/assumptions/schema");
    const existingAssumption = await db.assumptionSetVersion.findFirst({
      where: { modelCode: ASSUMPTION_SERIES_CODE, status: "PUBLISHED" },
    });

    if (existingAssumption) {
      console.log("✓ Published assumption set already exists — skipped.");
    } else {
      const admin = await db.user.findUnique({ where: { email: "admin@anhuu.test" } });
      if (!admin) throw new Error("admin@anhuu.test not found — run user seed first.");

      const assumptionsService = new AssumptionsService(db);
      const projYears = [];
      for (let y = 2026; y <= 2040; y++) projYears.push(y);

      const assumptionData = {
        schemaVersion: 2,
        title: "Bộ giả định kinh tế vĩ mô Việt Nam 2026-2040 (Local Dev)",
        currency: "VND",
        effectiveFrom: "2026-01-01",
        projectionStartYear: 2026,
        projectionEndYear: 2040,
        sources: [
          {
            id: "GSO_CPI",
            kind: "HISTORICAL_OFFICIAL",
            title: "Chỉ số giá tiêu dùng lịch sử Việt Nam 2015-2025 — Tổng cục Thống kê",
            publisher: "Tổng cục Thống kê Việt Nam (GSO)",
            url: "https://www.gso.gov.vn/du-lieu-va-so-lieu-thong-ke/2026/01/chi-so-gia-tieu-dung-cpi-nam-2025",
            release: "GSO-CPI-2025",
            publishedOn: "2026-01-10",
            retrievedOn: "2026-10-01",
            fromYear: 2015,
            toYear: 2025,
            note: "CPI bình quân năm chính thức từ Tổng cục Thống kê."
          },
          {
            id: "AN_HUU_LONG_TERM",
            kind: "AN_HUU_LONG_TERM",
            title: "Giả định dài hạn An Hưu 2026-2040",
            publisher: "An Hưu",
            url: "https://anhuu.vn/governance/assumptions/local-dev",
            release: "AH-LOCAL-DEV",
            publishedOn: "2026-01-01",
            retrievedOn: "2026-10-01",
            fromYear: 2026,
            toYear: 2040,
            note: "Giả định phát triển nội bộ cho môi trường local, không dùng trong production."
          },
          {
            id: "ASSET_RESEARCH",
            kind: "ASSET_RESEARCH",
            title: "Nghiên cứu lợi suất kỳ vọng các lớp tài sản Việt Nam",
            publisher: "An Hưu",
            url: "https://anhuu.vn/research/cma-local",
            release: "CMA-LOCAL",
            publishedOn: "2026-01-01",
            retrievedOn: "2026-10-01",
            fromYear: 2026,
            toYear: 2040,
            note: "Giả định lợi suất cho môi trường phát triển nội bộ."
          }
        ],
        historicalCpi: [
          { year: 2015, percent: "0.63", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2016, percent: "2.66", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2017, percent: "3.53", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2018, percent: "3.54", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2019, percent: "2.79", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2020, percent: "3.23", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2021, percent: "1.84", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2022, percent: "3.15", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2023, percent: "3.25", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2024, percent: "3.63", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
          { year: 2025, percent: "3.31", sourceId: "GSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" },
        ],
        inflation: projYears.map(y => ({
          year: y,
          percent: y <= 2028 ? "3.8" : "4.0",
          sourceId: y <= 2028 ? "GSO_CPI" : "AN_HUU_LONG_TERM",
          kind: y <= 2028 ? "FORECAST" : "LONG_TERM",
          rateType: "EFFECTIVE_ANNUAL",
          priceBasis: "NOMINAL",
          conversionNote: "Tỷ lệ lạm phát hiệu dụng hàng năm phục vụ kế hoạch dòng tiền."
        })),
        assetClasses: [
          { code: "CASH",        label: "Tiền gửi & Tiết kiệm",         horizons: [{ id: "ALL", minMonths: 1, maxMonths: 600 }] },
          { code: "BOND",        label: "Trái phiếu & Quỹ trái phiếu",   horizons: [{ id: "ALL", minMonths: 1, maxMonths: 600 }] },
          { code: "BALANCED",    label: "Quỹ cân bằng",                   horizons: [{ id: "ALL", minMonths: 1, maxMonths: 600 }] },
          { code: "STOCK",       label: "Cổ phiếu & Quỹ cổ phiếu",       horizons: [{ id: "ALL", minMonths: 1, maxMonths: 600 }] },
          { code: "REAL_ESTATE", label: "Bất động sản đầu tư",            horizons: [{ id: "ALL", minMonths: 1, maxMonths: 600 }] },
        ],
        returns: projYears.flatMap(y => [
          { year: y, assetClass: "CASH",        horizonId: "ALL", sourceId: "ASSET_RESEARCH", rate: { type: "EFFECTIVE_ANNUAL", percent: "5.0" }, priceBasis: "NOMINAL", fees: { treatment: "INCLUDED", evidence: "Lãi suất tiền gửi." }, taxes: { treatment: "INCLUDED", evidence: "Miễn thuế TNCN đối với lãi tiền gửi cá nhân cư trú." } },
          { year: y, assetClass: "BOND",        horizonId: "ALL", sourceId: "ASSET_RESEARCH", rate: { type: "EFFECTIVE_ANNUAL", percent: "7.2" }, priceBasis: "NOMINAL", fees: { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "0.8", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Phí quản lý quỹ trái phiếu 0.8%/năm." }, taxes: { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "0.1", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Thuế chuyển nhượng 0.1%." } },
          { year: y, assetClass: "BALANCED",    horizonId: "ALL", sourceId: "ASSET_RESEARCH", rate: { type: "EFFECTIVE_ANNUAL", percent: "9.5" }, priceBasis: "NOMINAL", fees: { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "1.2", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Phí quản lý quỹ cân bằng 1.2%/năm." }, taxes: { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "0.1", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Thuế chuyển nhượng 0.1%." } },
          { year: y, assetClass: "STOCK",       horizonId: "ALL", sourceId: "ASSET_RESEARCH", rate: { type: "EFFECTIVE_ANNUAL", percent: "12.0" }, priceBasis: "NOMINAL", fees: { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "1.5", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Phí quản lý quỹ cổ phiếu 1.5%/năm." }, taxes: { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "0.1", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Thuế chuyển nhượng 0.1%." } },
          { year: y, assetClass: "REAL_ESTATE", horizonId: "ALL", sourceId: "ASSET_RESEARCH", rate: { type: "EFFECTIVE_ANNUAL", percent: "8.5" }, priceBasis: "NOMINAL", fees: { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "0.5", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Chi phí vận hành BĐS 0.5%/năm." }, taxes: { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "0.4", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Thuế chuyển nhượng 2% phân bổ 5 năm." } },
        ]),
        reason: "Bộ giả định phát triển nội bộ phục vụ thử nghiệm tính năng local."
      };

      const draft = await assumptionsService.create(admin.id, assumptionData);
      const impact = await assumptionsService.previewImpact(admin.id, draft.id, { expectedRevision: 1 });
      await assumptionsService.approve(admin.id, draft.id, {
        expectedRevision: 1,
        impactToken: impact.impactToken,
        reviewNote: "Auto-approved by local dev seed.",
      });
      const published = await assumptionsService.publish(admin.id, draft.id, { expectedRevision: 2, confirm: true });
      console.log(`✓ Assumption set published: v${published.version} (${published.id})`);

      // ── 5. Portfolio policy ────────────────────────────────────────────────
      const { PORTFOLIO_POLICY_CODE } = require("../src/modules/portfolios/schema");
      const existingPortfolio = await db.assumptionSetVersion.findFirst({
        where: { modelCode: PORTFOLIO_POLICY_CODE, status: "PUBLISHED" },
      });

      if (existingPortfolio) {
        console.log("✓ Published portfolio policy already exists — skipped.");
      } else {
        const portfoliosService = new PortfoliosService(db);
        const portfolioData = {
          schemaVersion: 1,
          title: "Chính sách phân bổ danh mục đầu tư An Hưu (Local Dev)",
          reason: "Chính sách phát triển nội bộ cho môi trường local.",
          effectiveFrom: "2026-01-01",
          assumptionVersionId: published.id,
          source: {
            title: "Khung chính sách danh mục An Hưu (Local Dev)",
            url: "https://anhuu.vn/governance/portfolio-policy/local-dev",
            release: "AH-PORTFOLIO-LOCAL",
            reviewedOn: "2026-01-01"
          },
          questions: [
            {
              id: "Q_OBJECTIVE", dimension: "OBJECTIVE",
              prompt: "Mục tiêu tài chính ưu tiên nhất của bạn trong kế hoạch hưu trí là gì?",
              choices: [
                { id: "OBJ_PRESERVE",  label: "Bảo toàn vốn tối đa",                             score: 0  },
                { id: "OBJ_INCOME",    label: "Tạo dòng tiền thu nhập ổn định",                   score: 10 },
                { id: "OBJ_BALANCED",  label: "Cân bằng giữa tăng trưởng và kiểm soát biến động", score: 20 },
                { id: "OBJ_GROWTH",    label: "Tối đa hóa tích lũy tài sản dài hạn",              score: 30 },
              ]
            },
            {
              id: "Q_HORIZON", dimension: "HORIZON",
              prompt: "Thời gian dự kiến từ nay đến khi bắt đầu rút quỹ hưu trí?",
              choices: [
                { id: "HOR_SHORT",     label: "Dưới 5 năm",             score: 0  },
                { id: "HOR_MEDIUM",    label: "Từ 5 đến dưới 12 năm",   score: 10 },
                { id: "HOR_LONG",      label: "Từ 12 đến dưới 20 năm",  score: 20 },
                { id: "HOR_VERY_LONG", label: "Từ 20 năm trở lên",      score: 30 },
              ]
            },
            {
              id: "Q_LIQUIDITY", dimension: "LIQUIDITY",
              prompt: "Mức độ bạn có thể cần rút tiền đột xuất từ quỹ đầu tư?",
              choices: [
                { id: "LIQ_HIGH",     label: "Cao: có thể cần trong 6 tháng",           score: 0  },
                { id: "LIQ_MODERATE", label: "Trung bình: đã có quỹ dự phòng riêng",    score: 15 },
                { id: "LIQ_LOW",      label: "Thấp: toàn bộ dành riêng cho hưu trí",    score: 30 },
              ]
            },
            {
              id: "Q_LOSS_TOLERANCE", dimension: "LOSS_TOLERANCE",
              prompt: "Khi danh mục giảm 15%, bạn sẽ làm gì?",
              choices: [
                { id: "LOSS_SELL_ALL",  label: "Bán toàn bộ ngay lập tức",            score: 0  },
                { id: "LOSS_SELL_PART", label: "Bán bớt một phần tài sản rủi ro",      score: 10 },
                { id: "LOSS_HOLD",      label: "Bình tĩnh giữ nguyên và chờ phục hồi", score: 20 },
                { id: "LOSS_BUY_MORE",  label: "Mua thêm với giá rẻ hơn",              score: 30 },
              ]
            },
            {
              id: "Q_EXPERIENCE", dimension: "EXPERIENCE",
              prompt: "Kinh nghiệm đầu tư tài chính thực tế của bạn?",
              choices: [
                { id: "EXP_NONE",     label: "Chỉ gửi tiết kiệm ngân hàng",                 score: 0  },
                { id: "EXP_BASIC",    label: "Đã mua trái phiếu hoặc tiết kiệm tích lũy",    score: 10 },
                { id: "EXP_MODERATE", label: "Đã đầu tư chứng chỉ quỹ hoặc cổ phiếu 2+ năm", score: 20 },
                { id: "EXP_ADVANCED", label: "Kinh nghiệm sâu về thị trường và quỹ",          score: 30 },
              ]
            },
            {
              id: "Q_FINANCIAL_CAPACITY", dimension: "FINANCIAL_CAPACITY",
              prompt: "Dòng tiền thặng dư hàng tháng sau khi trang trải mọi chi phí?",
              choices: [
                { id: "CAP_TIGHT",  label: "Dưới 10% thu nhập",                         score: 0  },
                { id: "CAP_STABLE", label: "Từ 10% đến 25% thu nhập",                   score: 15 },
                { id: "CAP_STRONG", label: "Trên 25% thu nhập, có tài sản dự phòng vững", score: 30 },
              ]
            },
          ],
          riskBands: [
            { id: "BAND_CONSERVATIVE",          label: "Thận trọng Bảo toàn",      minScore: 0,   maxScore: 35  },
            { id: "BAND_MODERATE_CONSERVATIVE",  label: "Thận trọng Tăng trưởng",  minScore: 36,  maxScore: 75  },
            { id: "BAND_BALANCED",               label: "Cân bằng Chiến lược",      minScore: 76,  maxScore: 115 },
            { id: "BAND_GROWTH",                 label: "Tăng trưởng Bền vững",     minScore: 116, maxScore: 150 },
            { id: "BAND_AGGRESSIVE_GROWTH",      label: "Tăng trưởng Năng động",    minScore: 151, maxScore: 180 },
          ],
          templates: [
            {
              id: "TPL_CONSERVATIVE", label: "Danh mục Thận trọng Bảo toàn", coverageMonths: 360,
              rebalance: { everyMonths: 12, timing: "START_OF_MONTH", turnoverCostPercent: "0.1", costConvention: "HALF_L1_TURNOVER_TIMES_COST", evidence: "Chi phí luân chuyển 0.1%." },
              schedule: [{ fromIndex: 1, toIndex: 360, allocations: [{ assetClass: "CASH", weightPercent: "30" }, { assetClass: "BOND", weightPercent: "60" }, { assetClass: "BALANCED", weightPercent: "10" }, { assetClass: "STOCK", weightPercent: "0" }, { assetClass: "REAL_ESTATE", weightPercent: "0" }] }]
            },
            {
              id: "TPL_MODERATE_CONSERVATIVE", label: "Danh mục Thận trọng Tăng trưởng", coverageMonths: 360,
              rebalance: { everyMonths: 12, timing: "START_OF_MONTH", turnoverCostPercent: "0.15", costConvention: "HALF_L1_TURNOVER_TIMES_COST", evidence: "Chi phí luân chuyển 0.15%." },
              schedule: [{ fromIndex: 1, toIndex: 360, allocations: [{ assetClass: "CASH", weightPercent: "15" }, { assetClass: "BOND", weightPercent: "50" }, { assetClass: "BALANCED", weightPercent: "25" }, { assetClass: "STOCK", weightPercent: "10" }, { assetClass: "REAL_ESTATE", weightPercent: "0" }] }]
            },
            {
              id: "TPL_BALANCED", label: "Danh mục Cân bằng Chiến lược", coverageMonths: 360,
              rebalance: { everyMonths: 6, timing: "START_OF_MONTH", turnoverCostPercent: "0.2", costConvention: "HALF_L1_TURNOVER_TIMES_COST", evidence: "Chi phí luân chuyển 0.2%." },
              schedule: [{ fromIndex: 1, toIndex: 360, allocations: [{ assetClass: "CASH", weightPercent: "10" }, { assetClass: "BOND", weightPercent: "30" }, { assetClass: "BALANCED", weightPercent: "35" }, { assetClass: "STOCK", weightPercent: "25" }, { assetClass: "REAL_ESTATE", weightPercent: "0" }] }]
            },
            {
              id: "TPL_GROWTH", label: "Danh mục Tăng trưởng Bền vững", coverageMonths: 360,
              rebalance: { everyMonths: 6, timing: "START_OF_MONTH", turnoverCostPercent: "0.25", costConvention: "HALF_L1_TURNOVER_TIMES_COST", evidence: "Chi phí luân chuyển 0.25%." },
              schedule: [{ fromIndex: 1, toIndex: 360, allocations: [{ assetClass: "CASH", weightPercent: "5" }, { assetClass: "BOND", weightPercent: "20" }, { assetClass: "BALANCED", weightPercent: "25" }, { assetClass: "STOCK", weightPercent: "50" }, { assetClass: "REAL_ESTATE", weightPercent: "0" }] }]
            },
            {
              id: "TPL_AGGRESSIVE_GROWTH", label: "Danh mục Tăng trưởng Năng động", coverageMonths: 360,
              rebalance: { everyMonths: 6, timing: "START_OF_MONTH", turnoverCostPercent: "0.25", costConvention: "HALF_L1_TURNOVER_TIMES_COST", evidence: "Chi phí luân chuyển 0.25%." },
              schedule: [{ fromIndex: 1, toIndex: 360, allocations: [{ assetClass: "CASH", weightPercent: "5" }, { assetClass: "BOND", weightPercent: "10" }, { assetClass: "BALANCED", weightPercent: "15" }, { assetClass: "STOCK", weightPercent: "70" }, { assetClass: "REAL_ESTATE", weightPercent: "0" }] }]
            },
          ],
          rules: [
            { id: "RULE_CONSERVATIVE",         templateId: "TPL_CONSERVATIVE",         riskBandIds: ["BAND_CONSERVATIVE"],         explanation: "Bảo toàn vốn tối đa.",                              horizon: { min: 1, max: 360 }, liquidityNeed: { min: 0, max: 1200 }, dimensions: { OBJECTIVE: { min: 0, max: 30 }, HORIZON: { min: 0, max: 30 }, LIQUIDITY: { min: 0, max: 30 }, LOSS_TOLERANCE: { min: 0, max: 30 }, EXPERIENCE: { min: 0, max: 30 }, FINANCIAL_CAPACITY: { min: 0, max: 30 } } },
            { id: "RULE_MODERATE_CONSERVATIVE", templateId: "TPL_MODERATE_CONSERVATIVE", riskBandIds: ["BAND_MODERATE_CONSERVATIVE"], explanation: "Tăng trưởng vừa phải, rủi ro thấp.",              horizon: { min: 1, max: 360 }, liquidityNeed: { min: 0, max: 1200 }, dimensions: { OBJECTIVE: { min: 0, max: 30 }, HORIZON: { min: 0, max: 30 }, LIQUIDITY: { min: 0, max: 30 }, LOSS_TOLERANCE: { min: 0, max: 30 }, EXPERIENCE: { min: 0, max: 30 }, FINANCIAL_CAPACITY: { min: 0, max: 30 } } },
            { id: "RULE_BALANCED",              templateId: "TPL_BALANCED",              riskBandIds: ["BAND_BALANCED"],              explanation: "Cân bằng cổ phiếu và trái phiếu.",               horizon: { min: 1, max: 360 }, liquidityNeed: { min: 0, max: 1200 }, dimensions: { OBJECTIVE: { min: 0, max: 30 }, HORIZON: { min: 0, max: 30 }, LIQUIDITY: { min: 0, max: 30 }, LOSS_TOLERANCE: { min: 0, max: 30 }, EXPERIENCE: { min: 0, max: 30 }, FINANCIAL_CAPACITY: { min: 0, max: 30 } } },
            { id: "RULE_GROWTH",                templateId: "TPL_GROWTH",                riskBandIds: ["BAND_GROWTH"],                explanation: "Tăng trưởng vốn dài hạn qua quỹ cổ phiếu.",      horizon: { min: 1, max: 360 }, liquidityNeed: { min: 0, max: 1200 }, dimensions: { OBJECTIVE: { min: 0, max: 30 }, HORIZON: { min: 0, max: 30 }, LIQUIDITY: { min: 0, max: 30 }, LOSS_TOLERANCE: { min: 0, max: 30 }, EXPERIENCE: { min: 0, max: 30 }, FINANCIAL_CAPACITY: { min: 0, max: 30 } } },
            { id: "RULE_AGGRESSIVE_GROWTH",     templateId: "TPL_AGGRESSIVE_GROWTH",     riskBandIds: ["BAND_AGGRESSIVE_GROWTH"],     explanation: "Tập trung tối đa vào tài sản tăng trưởng.",       horizon: { min: 1, max: 360 }, liquidityNeed: { min: 0, max: 1200 }, dimensions: { OBJECTIVE: { min: 0, max: 30 }, HORIZON: { min: 0, max: 30 }, LIQUIDITY: { min: 0, max: 30 }, LOSS_TOLERANCE: { min: 0, max: 30 }, EXPERIENCE: { min: 0, max: 30 }, FINANCIAL_CAPACITY: { min: 0, max: 30 } } },
          ],
          scenarios: [
            {
              kind: "BASE", label: "Kịch bản Cơ sở", evidence: "Kịch bản kỳ vọng trung tâm.",
              convention: "DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES",
              years: projYears.map(y => ({ year: y, inflationDeltaPoints: "0", returns: [{ assetClass: "CASH", deltaPoints: "0" }, { assetClass: "BOND", deltaPoints: "0" }, { assetClass: "BALANCED", deltaPoints: "0" }, { assetClass: "STOCK", deltaPoints: "0" }, { assetClass: "REAL_ESTATE", deltaPoints: "0" }] }))
            },
            {
              kind: "ADVERSE", label: "Kịch bản Bất lợi", evidence: "Lạm phát cao, thị trường suy giảm.",
              convention: "DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES",
              years: projYears.map(y => ({ year: y, inflationDeltaPoints: "1.0", returns: [{ assetClass: "CASH", deltaPoints: "-0.5" }, { assetClass: "BOND", deltaPoints: "-1.5" }, { assetClass: "BALANCED", deltaPoints: "-2.0" }, { assetClass: "STOCK", deltaPoints: "-3.0" }, { assetClass: "REAL_ESTATE", deltaPoints: "-2.0" }] }))
            },
            {
              kind: "FAVORABLE", label: "Kịch bản Thuận lợi", evidence: "Kinh tế tăng trưởng, lạm phát kiểm soát tốt.",
              convention: "DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES",
              years: projYears.map(y => ({ year: y, inflationDeltaPoints: "-0.5", returns: [{ assetClass: "CASH", deltaPoints: "0.2" }, { assetClass: "BOND", deltaPoints: "1.0" }, { assetClass: "BALANCED", deltaPoints: "1.8" }, { assetClass: "STOCK", deltaPoints: "2.5" }, { assetClass: "REAL_ESTATE", deltaPoints: "1.5" }] }))
            },
          ]
        };

        const pDraft = await portfoliosService.create(admin.id, portfolioData);
        await portfoliosService.validate(pDraft.id);
        await portfoliosService.approve(admin.id, pDraft.id, {
          expectedRevision: 1,
          confirm: true,
          reviewNote: "Auto-approved by local dev seed.",
        });
        const publishedPortfolio = await portfoliosService.publish(admin.id, pDraft.id, { expectedRevision: 2, confirm: true });
        console.log(`✓ Portfolio policy published: v${publishedPortfolio.version} (${publishedPortfolio.id})`);
      }
    }

    // ── 6. System settings ───────────────────────────────────────────────────
    const systemSettings = [
      { key: "general",       category: "GENERAL",       value: { systemName: "An Hưu", defaultLanguage: "Tiếng Việt", operatingTimezone: "GMT+7 (Việt Nam)", supportEmail: "hotro@anhuu.vn", maintenanceMode: false } },
      { key: "security",      category: "SECURITY",      value: { sessionTimeoutMinutes: 60, maxLoginAttempts: 5, accountLockMinutes: 15, passwordMinLength: 8, passwordRequireUppercase: true, passwordRequireLowercase: true, passwordRequireNumber: true, passwordRequireSpecial: false, admin2faRequired: false } },
      { key: "notifications", category: "NOTIFICATIONS", value: { emailEnabled: true, inAppEnabled: true, smsEnabled: false, notifyAccount: true, notifySupport: true, notifyFinancial: true, notifySystem: true } },
    ];
    for (const s of systemSettings) {
      await db.systemSetting.upsert({ where: { key: s.key }, update: {}, create: { key: s.key, value: s.value, category: s.category } });
    }
    console.log("✓ System settings seeded (existing unchanged).");

    console.log("\nLocal fixtures ready.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("SEED_FAILED:", err?.message ?? "check local configuration; no credentials are logged.");
  process.exitCode = 1;
});
