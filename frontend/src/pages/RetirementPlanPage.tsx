import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Badge, Button, Card, Icon } from "../components/ui";
import { FundGrowthChart } from "../components/charts";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { calculateRetirement, inputFromProfile } from "../domain/retirementCalculator";

const formatVND = (num: number) => new Intl.NumberFormat("vi-VN").format(num) + " VND";
const REFERENCE_YEAR = new Date().getFullYear();

export default function RetirementPlanPage() {
  const navigate = useNavigate();
  const [chartView, setChartView] = useState<"annual" | "milestone">("milestone");
  const { profile } = useFinancialProfile();

  // Tất cả con số dùng cùng bộ tính với Dashboard, Mục tiêu và Mô phỏng.
  const derived = useMemo(() => {
    const result = calculateRetirement(inputFromProfile(profile));
    return {
      yearsLeft: result.yearsToRetirement,
      retirementDuration: result.retirementYears,
      targetFund: result.targetFund,
      projectedFund: result.projectedFund,
      gap: result.gap,
      progressPercent: result.readinessScore,
      readinessScore: result.readinessScore,
      targetRetireYear: REFERENCE_YEAR + result.yearsToRetirement,
      targetAge: profile.goal.targetRetireAge,
      futureMonthlyWithdraw: result.futureMonthlyExpense,
      estimatedMonthlyPension: result.estimatedMonthlyPension,
      requiredMonthlyWithdrawal: result.requiredMonthlyWithdrawal,
    };
  }, [profile]);

  return (
    <>
      <div className="retirement-page-header">
        <div>
          <div className="plan-update-state">
            <Icon name="circle-check" />
            <span>Kế hoạch được cập nhật tự động theo mục tiêu mới nhất</span>
          </div>
          <h1>Kế hoạch hưu trí chi tiết</h1>
          <p>
            Đây là bản kế hoạch tài chính toàn diện giúp bạn biết rõ số tiền cần có, tiến độ hiện tại và hành động cụ thể mỗi tháng.
          </p>
        </div>

        <div className="retirement-view-switcher">
          <Link to="/user/goal"><button type="button">Mục tiêu</button></Link>
          <button type="button" className="is-active">Kế hoạch</button>
        </div>
      </div>

      {/* Primary Result Hero */}
      <motion.div
        className="plan-result-hero"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div className="plan-result-copy">
          <Badge tone="soft">KẾT QUẢ ĐẦU RA CỐT LÕI</Badge>
          <span className="result-kicker">TỔNG QUỸ HƯU TRÍ CẦN CHUẨN BỊ ĐẾN TUỔI {derived.targetAge}</span>
          <strong className="result-total">{formatVND(derived.targetFund)}</strong>
          <p>
            Đảm bảo bạn có dòng tiền <strong>{formatVND(derived.futureMonthlyWithdraw)}/tháng</strong> (đã điều chỉnh trượt giá lạm phát) để an tâm sống độc lập suốt {derived.retirementDuration} năm hưu trí từ {derived.targetAge} đến {profile.goal.lifeExpectancy} tuổi.
          </p>

          <div className="plan-hero-actions">
            <Link to="/user/goal" className="button button-primary button-medium">
              <Icon name="target" /> Điều chỉnh mục tiêu
            </Link>
            <Link to="/user/simulation" className="button button-ghost button-medium">
              <Icon name="chart" /> Thử kịch bản bù đắp thiếu hụt
            </Link>
          </div>
        </div>

        <div className="plan-progress-panel">
          <div className="plan-progress-ring">
            <svg viewBox="0 0 180 180">
              <circle cx="90" cy="90" r="76" className="ring-track" />
              <circle
                cx="90"
                cy="90"
                r="76"
                className="ring-value"
                style={{ strokeDashoffset: `${477.5 * (1 - derived.progressPercent / 100)}` }}
              />
            </svg>
            <div>
              <strong>{derived.progressPercent}%</strong>
              <span>MỨC ĐỘ SẴN SÀNG</span>
            </div>
          </div>
          <div className="plan-progress-copy">
            <span>
              <strong>
                {derived.gap > 0
                  ? `Còn thiếu ${formatVND(derived.gap)} để chạm đích an toàn`
                  : `Vượt mục tiêu ${formatVND(Math.abs(derived.gap))} — kế hoạch rất vững vàng`}
              </strong>
              <small>
                {derived.gap > 0
                  ? `Cần bổ sung trong ${derived.yearsLeft} năm tới thông qua tích lũy tăng thêm`
                  : `Bạn có thể cân nhắc giảm đóng góp hoặc nghỉ sớm hơn`}
              </small>
            </span>
          </div>
        </div>
      </motion.div>

      {/* 4 Plan Key Metrics */}
      <motion.div
        className="plan-metrics"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
      >
        <Card className="plan-metric-card">
          <div>
            <span>Số tiền dự kiến có</span>
            <Icon name="wallet" />
          </div>
          <strong>{formatVND(derived.projectedFund)}</strong>
          <small>Từ tài sản tài chính thanh khoản và đóng góp; không tính nhà ở là tiền chi tiêu</small>
        </Card>

        <Card className="plan-metric-card tone-warning">
          <div>
            <span>Khoảng thiếu hụt</span>
            <Icon name="alert" />
          </div>
          <strong style={{ color: derived.gap > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
            {derived.gap > 0 ? formatVND(derived.gap) : "Đã đạt mục tiêu"}
          </strong>
          <small>
            {derived.gap > 0
              ? `Cần bù đắp trong ${derived.yearsLeft} năm tới thông qua tích lũy tăng thêm`
              : "Bạn đang tích lũy vượt mục tiêu — có thể tối ưu hoặc nghỉ sớm"}
          </small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>Số tiền cần tích lũy/tháng</span>
            <Icon name="target" />
          </div>
          <strong>{formatVND(profile.plan.monthlySavings)}</strong>
          <small>Đều đặn mỗi tháng với lợi suất kỳ vọng {profile.goal.investmentReturn}%/năm</small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>Thời gian còn lại</span>
            <Icon name="compass" />
          </div>
          <strong>{derived.yearsLeft} năm</strong>
          <small>Thời điểm chạm mốc tuổi {derived.targetAge}: Năm {derived.targetRetireYear}</small>
        </Card>
      </motion.div>

      {/* Projected Fund Growth Card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.14, ease: "easeOut" }}
      >
        <Card className="fund-growth-card">
          <header>
            <div>
              <h2>Lộ trình tăng trưởng tài sản dự phóng theo thời gian</h2>
              <p>Mô phỏng sức mạnh lãi suất kép và dòng tiền tích lũy tích tụ qua các thập kỷ.</p>
            </div>
            <div className="chart-period">
              <button
                type="button"
                className={chartView === "milestone" ? "is-active" : ""}
                onClick={() => setChartView("milestone")}
              >
                Theo mốc tuổi
              </button>
              <button
                type="button"
                className={chartView === "annual" ? "is-active" : ""}
                onClick={() => setChartView("annual")}
              >
                Từng năm chi tiết
              </button>
            </div>
          </header>

          <div className="fund-chart" tabIndex={0} role="region" aria-label="Biểu đồ tăng trưởng quỹ">
            <FundGrowthChart view={chartView} profile={profile} />
          </div>

          <footer>
            <div>
              <span><i className="fund-legend-target" /> Mục tiêu kỳ vọng: {formatVND(derived.targetFund)}</span>
              <span><i className="fund-legend-current" /> Dự phóng tích lũy hiện thời: {formatVND(derived.projectedFund)}</span>
            </div>
            <p>
              <Icon name="info" size="small" /> Sau tuổi {derived.targetAge}, quỹ chuyển từ giai đoạn tích lũy sang giai đoạn rút tiền hàng tháng trong {derived.retirementDuration} năm.
            </p>
          </footer>
        </Card>
      </motion.div>

      {/* Details Grid: "What It Means" AI explanation + Breakdown */}
      <motion.div
        className="plan-details-grid"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" }}
      >
        {/* "What it means" Card */}
        <Card className="what-it-means-card">
          <span className="meaning-icon">
            <Icon name="sparkles" size="large" />
          </span>

          <div className="meaning-copy">
            <Badge tone="soft">GIẢI THÍCH TỪ CHUYÊN GIA AI</Badge>
            <h2>Điều này có ý nghĩa gì đối với bạn?</h2>
            {derived.gap > 0 ? (
              <>
                <p>
                  Khoảng thiếu hụt <strong>{formatVND(derived.gap)}</strong> không phải lý do để lo lắng, mà là chiếc kim chỉ nam rõ ràng cho hành động ngay lúc này.
                </p>
                <p>
                  Với <strong>{derived.yearsLeft} năm</strong> tích lũy phía trước, nhờ sức mạnh của lãi kép, bạn cần tiết kiệm thêm khoảng <strong>{formatVND(Math.round(derived.gap / Math.max(1, derived.yearsLeft * 12)))} mỗi tháng</strong> hoặc cải thiện tỷ suất sinh lời của danh mục để lấp đầy khoảng thiếu này.
                </p>
              </>
            ) : (
              <>
                <p>
                  Kế hoạch hiện tại <strong>vượt mục tiêu {formatVND(Math.abs(derived.gap))}</strong>. Đây là vùng đệm an toàn giúp bạn linh hoạt điều chỉnh mục tiêu.
                </p>
                <p>
                  Bạn có thể cân nhắc tăng mức chi tiêu khi nghỉ hưu, nghỉ sớm hơn vài năm, hoặc phân bổ thêm cho các mục tiêu tài chính khác.
                </p>
              </>
            )}

            <div className="meaning-assumptions">
              <Icon name="info" size="small" />
              <span>
                Tính toán dựa trên giả định lạm phát dài hạn {profile.goal.inflationRate}%/năm và mức sinh lời danh mục {profile.goal.investmentReturn}%/năm.
              </span>
            </div>
          </div>

          <div className="meaning-actions">
            <Link to="/user/simulation" className="button button-primary button-medium">
              Thử nghiệm kịch bản bù đắp <Icon name="arrow-right" />
            </Link>
            <Link to="/user/assistant" className="button button-ghost button-medium">
              Hỏi đáp chi tiết cùng AI
            </Link>
          </div>
        </Card>

        {/* Plan Breakdown Card */}
        <Card className="plan-breakdown-card">
          <header>
            <div>
              <h2>Cơ cấu nguồn tài sản hưu trí</h2>
              <p>Phân bổ 3 trụ cột vững chắc hình thành nên quỹ</p>
            </div>
            <Badge tone="soft">3 TRỤ CỘT</Badge>
          </header>

          <div className="breakdown-list">
            <div>
              <span><Icon name="file-text" /></span>
              <div>
                <strong>Lương hưu Bảo hiểm Xã hội (BHXH)</strong>
                <small>Dự kiến {Math.min(35, profile.socialSecurity.socialInsuranceYears + derived.yearsLeft)} năm đóng, hệ số ước tính</small>
              </div>
              <b>{formatVND(Math.round(profile.socialSecurity.socialInsuranceSalary * 12 * 0.75 * Math.min(35, profile.socialSecurity.socialInsuranceYears + derived.yearsLeft)))}</b>
            </div>

            <div>
              <span><Icon name="chart" /></span>
              <div>
                <strong>Danh mục đầu tư & Tích lũy tự nguyện</strong>
                <small>Quỹ mở, chứng chỉ tiền gửi & cổ tức</small>
              </div>
              <b>{formatVND(profile.assets.stockFundValue + profile.assets.liquidAssets)}</b>
            </div>

            <div>
              <span><Icon name="home" /></span>
              <div>
                <strong>Tài sản bất động sản (giá trị ước tính)</strong>
                <small>BĐS nhà ở — chưa tính là quỹ chi tiêu hưu trí</small>
              </div>
              <b>{formatVND(profile.assets.realEstateValue)}</b>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Plan Disclaimer & Export Action */}
      <div className="plan-disclaimer">
        <Icon name="info" />
        <span>
          Bản kế hoạch dùng chung bộ công thức với trang Mục tiêu & Mô phỏng, luôn tự động cập nhật khi bạn điều chỉnh hồ sơ.
        </span>
        <button
          type="button"
          onClick={() => window.print()}
        >
          <Icon name="download" size="small" /> In hoặc lưu báo cáo PDF
        </button>
      </div>
    </>
  );
}
