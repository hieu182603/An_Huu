import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, Button, Card, Icon, IconButton } from "../components/ui";
import { ProjectionWealthChart, AssetDonutChart } from "../components/charts";
import { useFinancialProfile } from "../context/FinancialProfileContext";

const formatVND = (num: number) => new Intl.NumberFormat("vi-VN").format(num) + " đ";
const REFERENCE_YEAR = new Date().getFullYear();

export default function UserDashboard() {
  const navigate = useNavigate();
  const [chartPeriod, setChartPeriod] = useState<"5y" | "10y" | "retire" | "lifetime">("retire");
  const [showAlert, setShowAlert] = useState(true);

  const { profile, saveStatus, lastSavedAt, saveError } = useFinancialProfile();

  // Tính toán các chỉ số phái sinh từ hồ sơ dùng chung.
  const derived = useMemo(() => {
    const totalAssets =
      profile.assets.cashSavings +
      profile.assets.realEstateValue +
      profile.assets.liquidAssets +
      profile.assets.stockFundValue;
    const totalDebt = profile.debt.hasDebt
      ? profile.debt.mortgageDebt + profile.debt.consumerDebt
      : 0;
    const netWorth = totalAssets - totalDebt;
    const monthlyIncome = profile.income.primaryIncome + profile.income.secondaryIncome;
    const monthlyExpense = profile.expenses.essentialExpense + profile.expenses.lifestyleExpense;
    const monthlyDebtService = profile.debt.hasDebt ? profile.debt.monthlyDebtService : 0;
    const monthlySurplus = Math.max(0, monthlyIncome - monthlyExpense - monthlyDebtService);
    const targetAge = profile.goal.targetRetireAge;
    const yearsLeft = Math.max(0, targetAge - profile.personal.age);
    const targetRetireYear = REFERENCE_YEAR + yearsLeft;
    const progressPercent =
      profile.plan.targetFund > 0
        ? Math.min(100, Math.round((profile.plan.projectedFund / profile.plan.targetFund) * 100))
        : 0;
    const gap = profile.plan.targetFund - profile.plan.projectedFund;

    // Phân bổ phần trăm từng nhóm tài sản (an toàn, không chia cho 0).
    const safeTotal = totalAssets > 0 ? totalAssets : 1;
    const pctCash = Math.round((profile.assets.cashSavings / safeTotal) * 100);
    const pctRealEstate = Math.round((profile.assets.realEstateValue / safeTotal) * 100);
    const pctStock = Math.round((profile.assets.stockFundValue / safeTotal) * 100);
    const pctLiquid = Math.max(0, 100 - pctCash - pctRealEstate - pctStock);
    return {
      totalAssets,
      netWorth,
      monthlySurplus,
      yearsLeft,
      targetRetireYear,
      progressPercent,
      gap,
      targetAge,
      pctCash,
      pctRealEstate,
      pctStock,
      pctLiquid,
    };
  }, [profile]);

  const greetingName = profile.personal.name || "bạn";

  return (
    <>
      {/* Page Header */}
      <div className="dashboard-page-header">
        <div>
          <span>BẢN ĐỒ TÀI CHÍNH CÁ NHÂN</span>
          <h1>Chào buổi sáng, {greetingName}</h1>
          <p>Hôm nay là thời điểm lý tưởng để kiểm tra lại lộ trình tích lũy và sức khỏe tài chính dài hạn.</p>
        </div>
        <Link to="/user/goal" className="button button-primary button-medium">
          <Icon name="target" /> Điều chỉnh mục tiêu
        </Link>
      </div>

      {/* Trạng thái lưu hồ sơ */}
      <div className={`dashboard-save-indicator is-${saveStatus}`} role="status" aria-live="polite">
        {saveStatus === "saving" ? (
          <>
            <span className="save-spinner" aria-hidden="true" />
            <span>Đang đồng bộ hồ sơ…</span>
          </>
        ) : saveStatus === "saved" ? (
          <>
            <Icon name="circle-check" size="small" />
            <span>Đã đồng bộ{lastSavedAt ? ` lúc ${lastSavedAt}` : ""}</span>
          </>
        ) : saveStatus === "error" ? (
          <>
            <Icon name="alert" size="small" />
            <span>{saveError || "Không thể lưu hồ sơ"}</span>
          </>
        ) : saveStatus === "dirty" ? (
          <>
            <Icon name="info" size="small" />
            <span>Có thay đổi chưa được lưu</span>
          </>
        ) : (
          <>
            <Icon name="circle-check" size="small" />
            <span>Hồ sơ được lưu cục bộ</span>
          </>
        )}
      </div>

      {/* Full-width Hero Card */}
      <div className="retirement-hero retirement-hero-full">
        <div className="retirement-hero-copy">
          <div className="card-heading-row">
            <Badge tone="soft">TIẾN ĐỘ HƯU TRÍ TỔNG THỂ</Badge>
          </div>
          <h2 style={{ color: "#ffffff" }}>
            Bạn đã chuẩn bị được {derived.progressPercent}% cho mục tiêu nghỉ hưu ở tuổi {derived.targetAge}
          </h2>
          <p>
            Với mức tích lũy hiện tại <strong>{formatVND(profile.plan.monthlySavings)}/tháng</strong> cùng
            các khoản tài sản và BHXH dự phóng, bạn đang đi rất sát lộ trình để đạt cuộc sống an nhàn độc lập.
          </p>

          <div className="hero-financial-metrics">
            <div>
              <span>Mục tiêu quỹ hưu</span>
              <strong>{formatVND(profile.plan.targetFund)}</strong>
            </div>
            <div>
              <span>Dự kiến đạt được</span>
              <strong>{formatVND(profile.plan.projectedFund)}</strong>
            </div>
            <div>
              <span>Khoảng cần bổ sung</span>
              <strong style={{ color: "var(--color-warning-fill)" }}>
                {formatVND(Math.max(0, derived.gap))}
              </strong>
            </div>
          </div>

          <div className="hero-card-actions">
            <Link to="/user/plan" className="button button-primary button-medium">
              Xem chi tiết kế hoạch <Icon name="arrow-right" />
            </Link>
            <Link to="/user/simulation" className="button button-ghost button-medium">
              Thử kịch bản khác
            </Link>
          </div>
        </div>

        <div className="progress-ring-wrap">
          <div className="progress-ring">
            <svg viewBox="0 0 160 160">
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4d8b7e" />
                  <stop offset="100%" stopColor="#6fe1c8" />
                </linearGradient>
              </defs>
              <circle cx="80" cy="80" r="72" className="ring-track" />
              <circle
                cx="80"
                cy="80"
                r="72"
                className="ring-value"
                style={{ strokeDashoffset: `${452.4 * (1 - derived.progressPercent / 100)}`, stroke: "url(#ringGrad)" }}
              />
            </svg>
            <div>
              <strong>{derived.progressPercent}%</strong>
              <span>MỤC TIÊU TUỔI {derived.targetAge}</span>
            </div>
          </div>
          <div className="ring-caption">
            <Icon name="circle-check" size="small" />
            <span>Dự kiến về đích vào năm {derived.targetRetireYear}</span>
          </div>
        </div>
      </div>

      {/* Priority Cards Row */}
      <div className="dashboard-subpriority-grid">
        {/* Readiness Score Card */}
        <Card className="readiness-card">
          <div className="compact-card-heading">
            <span>CHỈ SỐ SẴN SÀNG</span>
            <span className="card-icon"><Icon name="target" /></span>
          </div>
          <div className="readiness-score">
            <strong>{profile.plan.readinessScore}</strong>
            <span>/ 100 điểm</span>
          </div>
          <p>
            {profile.plan.readinessScore >= 75
              ? "Mức chuẩn bị đạt hạng Khá vững vàng. Dòng tiền thặng dư hàng tháng đủ bù đắp trượt giá lạm phát."
              : profile.plan.readinessScore >= 55
              ? "Mức chuẩn bị ở nhóm trung bình khá. Cần duy trì đều đặn tích lũy để cải thiện điểm số."
              : "Kế hoạch đang cần điều chỉnh. Hãy thử mô phỏng các kịch bản để tìm hướng cải thiện."}
          </p>
          <div className="score-scale">
            <span className={profile.plan.readinessScore >= 25 ? "is-filled" : ""} />
            <span className={profile.plan.readinessScore >= 50 ? "is-filled" : ""} />
            <span className={profile.plan.readinessScore >= 75 ? "is-filled is-current" : ""} />
            <span />
          </div>
          <div className="score-labels">
            <span>Cần cố gắng</span>
            <span>Khá tốt</span>
            <span>Lý tưởng</span>
          </div>
        </Card>

        {/* Next Action Card */}
        <Card className="next-action-card">
          <div className="next-action-icon">
            <Icon name="sparkles" />
          </div>
          <div>
            <Badge tone="honey">HÀNH ĐỘNG KHUYẾN NGHỊ</Badge>
            <h3>
              {derived.gap > 0
                ? `Tăng thêm khoảng ${formatVND(Math.round(derived.gap / Math.max(1, derived.yearsLeft * 12)))}/tháng để bù thiếu hụt`
                : "Bạn đang vượt mục tiêu — cân nhắc tối ưu hóa danh mục"}
            </h3>
            <p>
              {derived.gap > 0
                ? "Bám sát kế hoạch tích lũy hàng tháng sẽ giúp bạn rút ngắn khoảng cách tới mục tiêu an nhàn."
                : "Kế hoạch hiện tại đã đáp ứng mục tiêu. Hãy thử mô phỏng để xem xét tối ưu hoá hoặc nghỉ sớm hơn."}
            </p>
          </div>
          <Button variant="secondary" size="small" onClick={() => navigate("/user/simulation")}>
            Thử mô phỏng điều chỉnh này <Icon name="arrow-right" />
          </Button>
        </Card>
      </div>

      {/* Metric Strip */}
      <div className="metric-strip">
        <Card className="dashboard-metric-card">
          <div>
            <span>Tài sản ròng hiện có</span>
            <span className="metric-icon"><Icon name="wallet" /></span>
          </div>
          <strong>{formatVND(derived.netWorth)}</strong>
          <small>
            <Icon name="info" size="small" /> Bao gồm tiết kiệm, BĐS, đầu tư và trừ nợ
          </small>
        </Card>

        <Card className="dashboard-metric-card">
          <div>
            <span>Tích lũy đề xuất mỗi tháng</span>
            <span className="metric-icon"><Icon name="chart" /></span>
          </div>
          <strong>{formatVND(profile.plan.monthlySavings)}</strong>
          <small className="is-positive">
            <Icon name="circle-check" size="small" /> Dựa trên dòng tiền thặng dư hiện tại
          </small>
        </Card>

        <Card className="dashboard-metric-card">
          <div>
            <span>Thời gian tích lũy còn lại</span>
            <span className="metric-icon"><Icon name="compass" /></span>
          </div>
          <strong>{derived.yearsLeft} năm</strong>
          <small>
            <Icon name="info" size="small" /> Tuổi {profile.personal.age} → Nghỉ hưu tuổi {derived.targetAge}
          </small>
        </Card>
      </div>

      {/* Analysis Grid: Projection Chart + Financial Snapshot */}
      <div className="dashboard-analysis-grid">
        <Card className="projection-chart-card">
          <div className="dashboard-card-heading">
            <div>
              <h2>Biểu đồ dự phóng tài sản dài hạn</h2>
              <p>So sánh đường tăng trưởng kỳ vọng so với mục tiêu tối thiểu cần đạt.</p>
            </div>
            <div className="chart-period">
              {(["5y", "10y", "retire", "lifetime"] as const).map((p) => {
                const labels = {
                  "5y": "5 năm",
                  "10y": "10 năm",
                  retire: "Đến tuổi 60",
                  lifetime: "Trọn đời (85t)",
                };
                return (
                  <button
                    key={p}
                    type="button"
                    className={chartPeriod === p ? "is-active" : ""}
                    onClick={() => setChartPeriod(p)}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="projection-chart-area" tabIndex={0} role="region" aria-label="Biểu đồ dự phóng tài sản">
            <ProjectionWealthChart period={chartPeriod} profile={profile} />
          </div>

          <div className="chart-summary">
            <div className="chart-legend-items">
              <span><i className="legend-target" /> Mục tiêu ({formatVND(profile.plan.targetFund)})</span>
              <span><i className="legend-current" /> Dự phóng ({formatVND(profile.plan.projectedFund)})</span>
            </div>
            <p>
              <Icon name="info" size="small" /> {derived.gap > 0
                ? `Khoảng thiếu hụt ${formatVND(derived.gap)} tương đương cần bổ sung thêm ~${formatVND(Math.round(derived.gap / Math.max(1, derived.yearsLeft * 12)))}/tháng.`
                : `Bạn đang vượt mục tiêu ${formatVND(Math.abs(derived.gap))}. Có thể cân nhắc tối ưu hóa danh mục.`}
            </p>
          </div>
        </Card>

        {/* Financial Snapshot */}
        <Card className="financial-snapshot">
          <div className="dashboard-card-heading">
            <div>
              <h2>Cơ cấu tài sản hiện tại</h2>
              <p>Tổng giá trị ước tính: {formatVND(derived.totalAssets)}</p>
            </div>
            <Badge tone="soft">CẬP NHẬT HÔM NAY</Badge>
          </div>

          <AssetDonutChart />

          <div className="snapshot-list">
            <div>
              <span className="snapshot-icon"><Icon name="wallet" /></span>
              <span>
                <small>Tiền gửi tiết kiệm ngân hàng</small>
                <strong>{formatVND(profile.assets.cashSavings)}</strong>
                <span style={{ display: "block", height: "4px", width: "100%", maxWidth: "160px", background: "#f1f5f9", borderRadius: "999px", marginTop: "4px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${derived.pctCash}%`, background: "var(--color-primary-700)", borderRadius: "999px" }} />
                </span>
              </span>
              <Badge tone="neutral">{derived.pctCash}%</Badge>
            </div>

            <div>
              <span className="snapshot-icon"><Icon name="home" /></span>
              <span>
                <small>Bất động sản nhà ở</small>
                <strong>{formatVND(profile.assets.realEstateValue)}</strong>
                <span style={{ display: "block", height: "4px", width: "100%", maxWidth: "160px", background: "#f1f5f9", borderRadius: "999px", marginTop: "4px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${derived.pctRealEstate}%`, background: "var(--color-secondary-500)", borderRadius: "999px" }} />
                </span>
              </span>
              <Badge tone="neutral">{derived.pctRealEstate}%</Badge>
            </div>

            <div>
              <span className="snapshot-icon"><Icon name="chart" /></span>
              <span>
                <small>Cổ phiếu & Quỹ đầu tư mở</small>
                <strong>{formatVND(profile.assets.stockFundValue)}</strong>
                <span style={{ display: "block", height: "4px", width: "100%", maxWidth: "160px", background: "#f1f5f9", borderRadius: "999px", marginTop: "4px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${derived.pctStock}%`, background: "var(--color-accent-500)", borderRadius: "999px" }} />
                </span>
              </span>
              <Badge tone="success">{derived.pctStock}%</Badge>
            </div>

            <div>
              <span className="snapshot-icon"><Icon name="sparkles" /></span>
              <span>
                <small>Tài sản thanh khoản khác</small>
                <strong>{formatVND(profile.assets.liquidAssets)}</strong>
                <span style={{ display: "block", height: "4px", width: "100%", maxWidth: "160px", background: "#f1f5f9", borderRadius: "999px", marginTop: "4px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${derived.pctLiquid}%`, background: "var(--color-info)", borderRadius: "999px" }} />
                </span>
              </span>
              <Badge tone="neutral">{derived.pctLiquid}%</Badge>
            </div>
          </div>

          <div className="cashflow-summary">
            <span>Dòng tiền thặng dư có thể tích lũy:</span>
            <strong>
              {formatVND(derived.monthlySurplus)} <small>/ tháng</small>
            </strong>
            <p>
              Thu nhập {formatVND(profile.income.primaryIncome + profile.income.secondaryIncome)} -
              Chi tiêu {formatVND(profile.expenses.essentialExpense + profile.expenses.lifestyleExpense)}
              {profile.debt.hasDebt && profile.debt.monthlyDebtService > 0
                ? ` - Trả nợ ${formatVND(profile.debt.monthlyDebtService)}`
                : ""} = Thặng dư {formatVND(derived.monthlySurplus)}
            </p>
          </div>
        </Card>
      </div>

      {/* Insight Grid: AI Card + Alert + Recent Activity */}
      <div className={`dashboard-insight-grid ${!showAlert ? "without-alert" : ""}`}>
        {/* AI Insight Card */}
        <div className="dashboard-ai-card">
          <div className="ai-card-topline">
            <Badge tone="soft">TRỢ LÝ AN HƯU AI</Badge>
            <span className="ai-card-icon"><Icon name="sparkles" /></span>
          </div>
          <h2>Tối ưu hóa lợi suất thêm 1% giúp nghỉ hưu sớm 2 năm</h2>
          <p>
            Nếu dịch chuyển 30% tiền gửi kỳ hạn thấp sang quỹ trái phiếu và quỹ chỉ số VN30 (lãi suất kỳ vọng 8.5%/năm), bạn sẽ đạt mốc tự do tài chính ở tuổi <strong>58 tuổi 2 tháng</strong>.
          </p>
          <div className="ai-assumption">
            <Icon name="info" size="small" />
            <span>Giả định dựa trên mô hình tăng trưởng kép và lạm phát 4.2%/năm tại Việt Nam.</span>
          </div>
          <Link to="/user/assistant" className="button button-soft button-medium">
            Trò chuyện & Thử kịch bản cùng AI <Icon name="arrow-right" />
          </Link>
        </div>

        {/* Important Alert */}
        {showAlert && (
          <Card className="important-alert">
            <span className="alert-card-icon"><Icon name="alert" /></span>
            <div>
              <Badge tone="warning">CẦN CHÚ Ý</Badge>
              <h3>Kỳ đối soát dữ liệu Q3</h3>
              <p>Đã 3 tháng kể từ lần cập nhật gần nhất. Hãy kiểm tra lại số dư tài khoản tiết kiệm và mức lương đóng BHXH mới.</p>
              <Link to="/user/account" className="button button-ghost button-small">
                Cập nhật số dư ngay <Icon name="arrow-right" />
              </Link>
            </div>
            <IconButton icon="x" label="Bỏ qua thông báo" onClick={() => setShowAlert(false)} />
          </Card>
        )}

        {/* Recent Activity */}
        <Card className="recent-activity">
          <div className="dashboard-card-heading">
            <div>
              <h2>Nhật ký hoạt động</h2>
              <p>Lịch sử thay đổi gần đây</p>
            </div>
            <Link to="/user/account" className="auth-text-action">Xem tất cả</Link>
          </div>

          <div className="activity-list">
            <div>
              <span><Icon name="circle-check" /></span>
              <div>
                <strong>Tích lũy định kỳ hàng tháng</strong>
                <small>Đề xuất {formatVND(profile.plan.monthlySavings)}/tháng từ dòng tiền thặng dư</small>
              </div>
              <Icon name="chevron-right" size="small" />
            </div>

            <div>
              <span><Icon name="target" /></span>
              <div>
                <strong>Mục tiêu hiện tại</strong>
                <small>Nghỉ hưu tuổi {derived.targetAge} · Chi tiêu {formatVND(profile.goal.monthlyExpenseInRetirement)}/tháng</small>
              </div>
              <Icon name="chevron-right" size="small" />
            </div>

            <div>
              <span><Icon name="sparkles" /></span>
              <div>
                <strong>Lần đồng bộ hồ sơ gần nhất</strong>
                <small>{lastSavedAt ? `Lúc ${lastSavedAt}` : "Chưa có thay đổi nào được lưu"}</small>
              </div>
              <Icon name="chevron-right" size="small" />
            </div>
          </div>
        </Card>
      </div>

      {/* Dashboard Data Note */}
      <div className="dashboard-data-note">
        <Icon name="info" />
        <span>
          Dữ liệu hồ sơ của bạn được lưu cục bộ trong trình duyệt. Lần đồng bộ gần nhất: {lastSavedAt || "chưa có"}.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          aria-label="Tải lại dữ liệu từ bộ nhớ cục bộ"
        >
          Tải lại dữ liệu
        </button>
      </div>

      <p className="dashboard-demo-note">
        <Icon name="info" size="small" />
        <span>Bộ số liệu dùng chung giữa Dashboard, Mục tiêu, Kế hoạch và Mô phỏng — đồng bộ tự động khi bạn lưu.</span>
      </p>
    </>
  );
}
