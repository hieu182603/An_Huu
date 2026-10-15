// Builds the assumption v3 / glide-path policy v4 DRAFT documents from verified
// inputs. Writes JSON files only; never touches the database.
//   node scripts/build-allocation-drafts.cjs
// Every number below is either a cited observation (with retrieval date) or an
// explicit An Hưu policy choice marked "CHỜ DUYỆT" in the review document.
require("ts-node").register({ transpileOnly: true });
const fs = require("node:fs");
const path = require("node:path");
const { assumptionDocumentSchema } = require("../src/modules/assumptions/schema");
const { portfolioDocumentV2Schema } = require("../src/modules/portfolios/schema");

const OUT = path.join(__dirname, "../seed-data/allocation-2026-10");
const RETRIEVED = "2026-10-15", EFFECTIVE = "2026-10-16";
const START = 2026, END = 2110;
// Real v3 draft id via ASSUMPTION_V3_ID (created 15/10/2026: d9b30f3b-8a8a-443c-9294-c4e88a26adb6).
const ASSUMPTION_V3_ID = process.env.ASSUMPTION_V3_ID ?? "d9b30f3b-8a8a-443c-9294-c4e88a26adb6";
const years = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const fixed = (v, d = 4) => Number(v.toFixed(d)).toString();

// ---- Observed inputs ------------------------------------------------------
const VNINDEX = { close2015: 579.03, close2025: 1784.49 };            // closes 31/12/2015 and 31/12/2025
const TPCP_10Y = 4.43;                                                 // HNX, last auction 09/2026
const VCB_DEPOSIT_36_60M = 5.3;                                        // Vietcombank posted rate, 15/10/2026
const ETF_TER = 0.82;                                                  // DCVFM VN30 ETF, 12-month expense ratio
const IMF_CPI = { 2026: 4.7, 2027: 4.9, 2028: 4.7, 2029: 4.6, 2030: 4.2, 2031: 3.8 };
const HISTORICAL_CPI = { 2015: "0.63", 2016: "2.66", 2017: "3.53", 2018: "3.54", 2019: "2.79", 2020: "3.23",
  2021: "1.84", 2022: "3.15", 2023: "3.25", 2024: "3.63", 2025: "3.31" };
// ---- An Hưu policy choices (CHỜ DUYỆT) -------------------------------------
const LONG_TERM_CPI = 4.0;      // unchanged from approved v1
const CASH_LONG_TERM = 4.5;     // from 2031; doc example rate for reserved funds
const SHRINK_A = 0.5;           // Mu = a*Mu_hist + (1-a)*Mu_base, Mu_base = TPCP 10y (no equity premium added)
const EQUITY_CAP = 9.0;
const GOLD_LONG_TERM = 5.0;     // long-term CPI + 1 point; historical SJC gains not extrapolated

const vnHistory = (Math.pow(VNINDEX.close2025 / VNINDEX.close2015, 1 / 10) - 1) * 100;
const equityGross = Math.min(EQUITY_CAP, SHRINK_A * vnHistory + (1 - SHRINK_A) * TPCP_10Y);

const source = (id, kind, title, publisher, url, release, publishedOn, fromYear, toYear, note) =>
  ({ id, kind, title, publisher, url, release, publishedOn, retrievedOn: RETRIEVED, fromYear, toYear, note });
const sources = [
  source("NSO_CPI", "HISTORICAL_OFFICIAL", "Chỉ số giá tiêu dùng bình quân năm 2015–2025", "Cục Thống kê (Bộ Tài chính)",
    "https://www.nso.gov.vn/du-lieu-va-so-lieu-thong-ke/2026/01/chi-so-gia-tieu-dung-chi-so-gia-vang-va-chi-so-gia-do-la-my-thang-muoi-hai-quy-iv-va-nam-2025/",
    "Thông cáo CPI tháng 12, quý IV và năm 2025", "2026-01-06", 2015, 2025,
    "Năm 2025: CPI bình quân tăng 3,31% (thông cáo 06/01/2026). Các năm 2015–2024 giữ theo bộ v1 đã duyệt, đối chiếu khớp chuỗi lịch sử IMF WEO 10/2026 sau làm tròn. Bộ v1 ghi nhầm 2025 = 3,80%."),
  source("IMF_WEO_2026_10", "FORECAST", "IMF World Economic Outlook – Việt Nam, lạm phát bình quân", "International Monetary Fund",
    "https://www.imf.org/external/datamapper/PCPIPCH@WEO/VNM", "WEO October 2026 (datamapper cập nhật 08/10/2026)", "2026-10-08", 2026, 2031,
    "PCPIPCH VNM: 2026 4,7; 2027 4,9; 2028 4,7; 2029 4,6; 2030 4,2; 2031 3,8 (%/năm)."),
  source("AH_CPI_LONG_TERM", "AN_HUU_LONG_TERM", "Lạm phát dài hạn An Hưu 2032–2110", "An Hưu",
    "https://www.imf.org/external/datamapper/PCPIPCH@WEO/VNM", "AH-CPI-LT-2026-10", "2026-10-15", 2032, 2110,
    "Giữ mức 4,0%/năm đã duyệt ở bộ v1 cho giai đoạn sau dự báo IMF (năm cuối IMF 2031 là 3,8%). Là giả định kế hoạch, không phải dự báo."),
  source("HNX_TPCP_2026_09", "ASSET_RESEARCH", "Thị trường trái phiếu Chính phủ tháng 9/2026", "Sở Giao dịch Chứng khoán Hà Nội (HNX)",
    "https://hnx.vn/vi-vn/trung-tam-truyen-thong/chi-tiet-tin-bc-60023583-0.html", "Báo cáo thị trường TPCP tháng 9/2026", "2026-10-09", START, END,
    "Lãi suất trúng thầu phiên cuối tháng 9/2026: 5 năm 4,27%; 10 năm 4,43%; 30 năm 4,62%/năm. Dùng lợi suất 10 năm hiện tại làm kỳ vọng dài hạn cho nhóm TPCP (cách tiếp cận lợi suất đáo hạn)."),
  source("VCB_DEPOSIT_2026_10", "ASSET_RESEARCH", "Biểu lãi suất tiền gửi khách hàng cá nhân", "Vietcombank",
    "https://www.vietcombank.com.vn/vi-VN/KHCN/Cong-cu-Tien-ich/KHCN---Lai-suat", "Bảng niêm yết VND tại ngày truy cập", "2026-10-15", START, 2030,
    "Tại quầy: 12 tháng 5,90%; 24 tháng 6,00%; 36–60 tháng 5,30%/năm. Dùng mức 36–60 tháng cho 2026–2030 (khóa kỳ hạn trung hạn)."),
  source("AH_CASH_LONG_TERM", "AN_HUU_LONG_TERM", "Lãi tiền gửi dài hạn An Hưu từ 2031", "An Hưu",
    "https://www.vietcombank.com.vn/vi-VN/KHCN/Cong-cu-Tien-ich/KHCN---Lai-suat", "AH-CASH-LT-2026-10", "2026-10-15", 2031, END,
    "Mốc dài hạn 4,5%/năm sau khi hết kỳ hạn khóa; trùng mức minh họa cho vốn dành riêng trong tài liệu thuật toán. Không dùng lãi ưu đãi."),
  source("AH_EQUITY_SHRINK", "AN_HUU_LONG_TERM", "Kỳ vọng cổ phiếu đa dạng hóa theo công thức co ước lượng", "An Hưu",
    "https://www.dragoncapital.com.vn/individual/vi/product/a0eJ2000001X9zhIAC/vn30", "AH-EQ-2026-10", "2026-10-15", START, END,
    `Mu = ${SHRINK_A} × Mu_lịch_sử + ${1 - SHRINK_A} × Mu_nền. Mu_lịch_sử = tăng giá VN-Index 31/12/2015 (579,03) → 31/12/2025 (1.784,49) = ${fixed(vnHistory, 2)}%/năm, chưa gồm cổ tức. Mu_nền = TPCP 10 năm ${TPCP_10Y}% (không cộng phần bù rủi ro). Trần ${EQUITY_CAP}%. Kết quả ${fixed(equityGross, 2)}% trước phí; phí = tỷ lệ chi phí 12 tháng ETF DCVFM VN30 ${ETF_TER}% (Dragon Capital). Giai đoạn 2010–2019 VN-Index chỉ tăng khoảng 6,4%/năm: kết quả rất nhạy với cửa sổ lịch sử.`),
  source("AH_GOLD_LONG_TERM", "AN_HUU_LONG_TERM", "Kỳ vọng vàng dài hạn An Hưu", "An Hưu",
    "https://sjc.com.vn/gia-vang-online", "AH-GOLD-2026-10", "2026-10-15", START, END,
    "5,0%/năm = lạm phát dài hạn 4% + 1 điểm. Không ngoại suy mức tăng giá vàng SJC 2016–2025. Chênh mua/bán là chi phí giao dịch khi mua/bán, không trừ hằng năm khi nắm giữ (theo tài liệu thuật toán)."),
];

const cost = (percent, evidence) => percent === null ? { treatment: "INCLUDED", evidence }
  : { treatment: "EXPLICIT_ANNUAL_DRAG", percent: String(percent), convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence };
const returnRow = (year, assetClass, sourceId, percent, fees, taxes) => ({ year, assetClass, horizonId: "ALL", sourceId,
  rate: { type: "EFFECTIVE_ANNUAL", percent: fixed(percent) }, priceBasis: "NOMINAL", fees, taxes });
const returns = years(START, END).flatMap(year => [
  returnRow(year, "CASH", year <= 2030 ? "VCB_DEPOSIT_2026_10" : "AH_CASH_LONG_TERM", year <= 2030 ? VCB_DEPOSIT_36_60M : CASH_LONG_TERM,
    cost(null, "Lãi niêm yết, không thu phí quản lý tài khoản tiền gửi có kỳ hạn."),
    cost(null, "Lãi tiền gửi của cá nhân không chịu thuế TNCN theo quy định hiện hành.")),
  returnRow(year, "GOV_BOND", "HNX_TPCP_2026_09", TPCP_10Y,
    cost(0, "Giả định nắm giữ trực tiếp TPCP tới đáo hạn, không phí quản lý. Nếu tiếp cận qua quỹ trái phiếu, phí quỹ phải trừ ở tầng sản phẩm."),
    cost(0, "Chưa trừ thuế. CHỜ DUYỆT: cần xác nhận pháp lý về thuế TNCN với lãi TPCP của cá nhân trước khi công bố.")),
  returnRow(year, "EQUITY", "AH_EQUITY_SHRINK", equityGross,
    cost(ETF_TER, `Tỷ lệ chi phí 12 tháng ${ETF_TER}% của ETF DCVFM VN30 (phí quản lý 0,65%), Dragon Capital, truy cập ${RETRIEVED}.`),
    cost(0.1, "Thuế 0,1% trên giá trị chuyển nhượng, áp hằng năm như bộ v1 (thận trọng vì thực tế chỉ phát sinh khi bán).")),
  returnRow(year, "GOLD", "AH_GOLD_LONG_TERM", GOLD_LONG_TERM,
    cost(null, "Không có phí định kỳ khi tự lưu giữ; chênh mua/bán khoảng 2% là chi phí giao dịch, không trừ hằng năm."),
    cost(null, "Không có thuế định kỳ khi nắm giữ vàng miếng.")),
]);
const assumptions = assumptionDocumentSchema.parse({
  schemaVersion: 2, title: "Bộ giả định vĩ mô và thị trường vốn Việt Nam 2026–2110 (v3)", currency: "VND",
  effectiveFrom: EFFECTIVE, projectionStartYear: START, projectionEndYear: END, sources,
  historicalCpi: Object.entries(HISTORICAL_CPI).map(([year, percent]) => ({ year: Number(year), percent, sourceId: "NSO_CPI", measure: "ANNUAL_AVERAGE_CHANGE" })),
  inflation: years(START, END).map(year => IMF_CPI[year] !== undefined
    ? { year, percent: String(IMF_CPI[year]), sourceId: "IMF_WEO_2026_10", kind: "FORECAST", rateType: "EFFECTIVE_ANNUAL", priceBasis: "NOMINAL",
        conversionNote: "Lạm phát bình quân năm theo IMF WEO 10/2026, dùng như tỷ lệ hiệu dụng năm cho kế hoạch dòng tiền." }
    : { year, percent: String(LONG_TERM_CPI), sourceId: "AH_CPI_LONG_TERM", kind: "LONG_TERM", rateType: "EFFECTIVE_ANNUAL", priceBasis: "NOMINAL",
        conversionNote: "Giả định dài hạn An Hưu, dùng như tỷ lệ hiệu dụng năm cho kế hoạch dòng tiền." }),
  assetClasses: [
    { code: "CASH", label: "Tiền gửi & thanh khoản" },
    { code: "GOV_BOND", label: "Trái phiếu Chính phủ / tiếp xúc phù hợp" },
    { code: "EQUITY", label: "Cổ phiếu đa dạng hóa" },
    { code: "GOLD", label: "Vàng" },
  ].map(a => ({ ...a, horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] })),
  returns,
  reason: "Thay bộ v1 (2026–2055): kéo dài dự báo tới 2110 để kế hoạch tới tuổi thọ kỳ vọng tính được; sửa CPI 2025 theo Cục Thống kê; dùng dự báo IMF WEO 10/2026; thay lợi suất chưa có nguồn bằng số liệu HNX, Vietcombank, VN-Index; thêm nhóm vàng; bỏ quỹ cân bằng và BĐS mua mới khỏi lớp phân bổ.",
});

// ---- Policy v4: base portfolios from the algorithm document -----------------
const mix = (cash, bond, equity, gold) => [["CASH", cash], ["GOV_BOND", bond], ["EQUITY", equity], ["GOLD", gold]]
  .map(([assetClass, w]) => ({ assetClass, weightPercent: String(w) }));
const LONG = mix(10, 20, 60, 10), MID = mix(15, 30, 45, 10), NEAR = mix(25, 40, 25, 10);
const glide = (points) => ({ anchor: "RETIREMENT_MONTH", interpolation: "LINEAR_BY_WHOLE_YEARS_TO_ANCHOR", afterAnchor: "HOLD_ZERO_YEAR_POINT",
  points: points.map(([yearsToAnchor, allocations]) => ({ yearsToAnchor, allocations })) });
const rebalance = { everyMonths: 12, timing: "START_OF_MONTH", turnoverCostPercent: "0.2", costConvention: "HALF_L1_TURNOVER_TIMES_COST",
  evidence: "Tái cân bằng hằng năm hoặc khi đổi bậc năm; giữ mức chi phí luân chuyển 0,2% của chính sách v2 đã duyệt." };
const published = JSON.parse(fs.readFileSync(path.join(OUT, "published-policy-v2.json"), "utf8")).values;
const allDims = Object.fromEntries(["OBJECTIVE", "HORIZON", "LIQUIDITY", "LOSS_TOLERANCE", "EXPERIENCE", "FINANCIAL_CAPACITY"].map(d => [d, { min: 0, max: 30 }]));
const scenarioDelta = { BASE: { cpi: "0", CASH: "0", GOV_BOND: "0", EQUITY: "0", GOLD: "0" },
  ADVERSE: { cpi: "1.0", CASH: "-0.5", GOV_BOND: "-1.5", EQUITY: "-3.0", GOLD: "-2.0" },
  FAVORABLE: { cpi: "-0.5", CASH: "0.2", GOV_BOND: "1.0", EQUITY: "2.5", GOLD: "1.5" } };
const policy = portfolioDocumentV2Schema.parse({
  allocationRisk: {
    evidence: "CHỜ DUYỆT — tài liệu khách: bootstrap khối 12–36 tháng (chọn 12); CVaR alpha 95%; ngưỡng p thiết yếu 90–95% (chọn 90%); dải tái cân bằng 5 điểm %. Bước dịch cổ phiếu và tham số cú sốc chưa được khách xác nhận: để trống, REVIEW_REQUIRED. Không dùng chuỗi thị trường giả lập.",
    blockMonths: 12, cvarAlpha: "0.95", essentialThreshold: "0.90", rebalanceBandPoints: "5",
    stresses: { LONGEVITY: { extraYears: [5, 10] } },
  },
  lossStress: {
    evidence: "Tài liệu thuật toán khách hàng, mục ví dụ 2 tỷ: tiền gửi 0%, TPCP -5%, cổ phiếu -35%, vàng -10%. Bản nháp phải được phê duyệt và công bố trước khi dùng.",
    equityAssetClass: "EQUITY", depositAssetClass: "CASH",
    shocks: [{ assetClass: "CASH", percent: "0" }, { assetClass: "GOV_BOND", percent: "-5" },
      { assetClass: "EQUITY", percent: "-35" }, { assetClass: "GOLD", percent: "-10" }],
  },
  schemaVersion: 2, title: "Chính sách phân bổ hưu trí An Hưu 2026 – danh mục nền giảm dần rủi ro theo thời hạn (v4)",
  reason: "Thay 5 mẫu cố định 360 tháng của v2 bằng danh mục nền của tài liệu thuật toán, giảm dần rủi ro theo số năm còn lại tới tháng nghỉ hưu; áp dụng cho mọi độ dài kế hoạch tới 1.200 tháng.",
  effectiveFrom: EFFECTIVE, assumptionVersionId: ASSUMPTION_V3_ID,
  source: { title: "Tài liệu Thuật toán phân bổ tài sản An Hưu – bảng Các danh mục nền; khung CFA Principles of Asset Allocation",
    url: "https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/principles-asset-allocation",
    release: "An_Huu_Thuat_toan_phan_bo_tai_san.docx (nhận 15/10/2026)", reviewedOn: RETRIEVED },
  questions: published.questions, riskBands: published.riskBands,
  templates: [
    { id: "TPL_BASE_GLIDE", label: "Danh mục nền theo thời hạn (bảng của tài liệu)", rebalance,
      glidePath: glide([[15, LONG], [10, MID], [5, MID], [3, NEAR], [0, NEAR]]) },
    { id: "TPL_CAUTIOUS_GLIDE", label: "Danh mục nền thận trọng (lùi một bậc thời hạn)", rebalance,
      glidePath: glide([[15, MID], [10, NEAR], [0, NEAR]]) },
  ],
  rules: [
    { id: "RULE_BASE_GLIDE", templateId: "TPL_BASE_GLIDE", riskBandIds: ["BAND_BALANCED", "BAND_GROWTH", "BAND_AGGRESSIVE_GROWTH"],
      explanation: "Danh mục nền của tài liệu: ≥15 năm tới hưu 10/20/60/10, 5–10 năm 15/30/45/10, ≤3 năm và sau hưu 25/40/25/10 (tiền gửi/TPCP/cổ phiếu/vàng); nội suy tuyến tính ở khoảng 10–15 và 3–5 năm. Cổ phiếu không vượt 60% kể cả với điểm khảo sát cao.",
      horizon: { min: 1, max: 1200 }, liquidityNeed: { min: 0, max: 1200 }, dimensions: allDims },
    { id: "RULE_CAUTIOUS_GLIDE", templateId: "TPL_CAUTIOUS_GLIDE", riskBandIds: ["BAND_CONSERVATIVE", "BAND_MODERATE_CONSERVATIVE"],
      explanation: "Hồ sơ thận trọng dùng danh mục nền của bậc thời hạn ngắn hơn: ≥15 năm 15/30/45/10, ≤10 năm và sau hưu 25/40/25/10.",
      horizon: { min: 1, max: 1200 }, liquidityNeed: { min: 0, max: 1200 }, dimensions: allDims },
  ],
  scenarios: [["BASE", "Kịch bản cơ sở", "Giả định cơ sở của bộ v3, không điều chỉnh."],
    ["ADVERSE", "Kịch bản bất lợi", "Lạm phát +1 điểm; lợi suất tiền gửi −0,5, TPCP −1,5, cổ phiếu −3, vàng −2 điểm mỗi năm (giữ mức v2 cho các nhóm cũ; vàng là giả định mới, CHỜ DUYỆT)."],
    ["FAVORABLE", "Kịch bản thuận lợi", "Lạm phát −0,5 điểm; tiền gửi +0,2, TPCP +1, cổ phiếu +2,5, vàng +1,5 điểm mỗi năm (giữ mức v2; vàng CHỜ DUYỆT)."]]
    .map(([kind, label, evidence]) => ({ kind, label, evidence, convention: "DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES",
      years: years(START, END).map(year => ({ year, inflationDeltaPoints: scenarioDelta[kind].cpi,
        returns: ["CASH", "GOV_BOND", "EQUITY", "GOLD"].map(assetClass => ({ assetClass, deltaPoints: scenarioDelta[kind][assetClass] })) })) })),
});

fs.writeFileSync(path.join(OUT, "draft-assumptions-v3.json"), JSON.stringify(assumptions, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "draft-policy-v4.json"), JSON.stringify(policy, null, 2) + "\n");
console.log(JSON.stringify({ vnIndexCagr: fixed(vnHistory, 4), equityGross: fixed(equityGross, 4), returns: returns.length,
  inflationYears: assumptions.inflation.length, templates: policy.templates.map(t => t.id) }));
