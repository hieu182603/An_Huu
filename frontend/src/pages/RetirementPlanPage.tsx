import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, Button, Card, Icon } from "../components/ui";

export default function RetirementPlanPage() {
  const navigate = useNavigate();
  const [chartView, setChartView] = useState<"annual" | "milestone">("milestone");

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
      <div className="plan-result-hero">
        <div className="plan-result-copy">
          <Badge tone="soft">KẾT QUẢ ĐẦU RA CỐT LÕI (U06)</Badge>
          <span className="result-kicker">TỔNG QUỸ HƯU TRÍ CẦN CHUẨN BỊ ĐẾN TUỔI 60</span>
          <strong className="result-total">8.500.000.000 đ</strong>
          <p>
            Đảm bảo bạn có dòng tiền <strong>22.000.000 đ/tháng</strong> (đã điều chỉnh trượt giá lạm phát) để an tâm sống độc lập suốt 22 năm hưu trí từ 60 đến 82 tuổi.
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
                style={{ strokeDashoffset: `${477.5 * (1 - 0.72)}` }}
              />
            </svg>
            <div>
              <strong>72%</strong>
              <span>MỨC ĐỘ SẴN SÀNG</span>
            </div>
          </div>
          <div className="plan-progress-copy">
            <span>
              <strong>Tiến độ đạt 72%</strong>
              <small>Còn thiếu 28% (~2.38 tỷ đ) để chạm đích an toàn</small>
            </span>
          </div>
        </div>
      </div>

      {/* 4 Plan Key Metrics */}
      <div className="plan-metrics">
        <Card className="plan-metric-card">
          <div>
            <span>Số tiền dự kiến có</span>
            <Icon name="wallet" />
          </div>
          <strong>6.120.000.000 đ</strong>
          <small>Từ tài sản hiện có, lãi kép tích lũy và lương hưu BHXH</small>
        </Card>

        <Card className="plan-metric-card tone-warning">
          <div>
            <span>Khoảng thiếu hụt</span>
            <Icon name="alert" />
          </div>
          <strong style={{ color: "var(--color-danger)" }}>2.380.000.000 đ</strong>
          <small>Cần bù đắp trong 28 năm tới thông qua tích lũy tăng thêm</small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>Số tiền cần tích lũy/tháng</span>
            <Icon name="target" />
          </div>
          <strong>14.200.000 đ</strong>
          <small>Đều đặn mỗi tháng với lợi suất kỳ vọng bình quân 7.8%/năm</small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>Thời gian còn lại</span>
            <Icon name="compass" />
          </div>
          <strong>28 năm</strong>
          <small>Thời điểm chạm mốc tuổi 60: Năm 2053</small>
        </Card>
      </div>

      {/* Projected Fund Growth Card */}
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

        <p className="horizontal-scroll-hint">Vuốt ngang để xem đầy đủ số liệu.</p><div className="fund-chart" tabIndex={0} role="region" aria-label="Biểu đồ tăng trưởng quỹ">
          <div className="fund-chart-axis">
            <span>9.0 tỷ</span>
            <span>6.7 tỷ</span>
            <span>4.5 tỷ</span>
            <span>2.2 tỷ</span>
            <span>0 đ</span>
          </div>

          <svg viewBox="0 0 680 300" preserveAspectRatio="none">
            <line x1="0" y1="40" x2="680" y2="40" className="fund-grid" />
            <line x1="0" y1="105" x2="680" y2="105" className="fund-grid" />
            <line x1="0" y1="170" x2="680" y2="170" className="fund-grid" />
            <line x1="0" y1="235" x2="680" y2="235" className="fund-grid" />

            {/* Target Area Fill */}
            <path
              d="M 30 260 C 200 240, 380 160, 650 40 L 650 260 Z"
              className="fund-area"
            />

            {/* Target line */}
            <path
              d="M 30 260 C 200 240, 380 160, 650 40"
              className="fund-target-line"
            />

            {/* Current projection line */}
            <path
              d="M 30 260 C 200 248, 400 195, 650 102"
              className="fund-current-line"
            />

            {/* Gap line */}
            <line x1="650" y1="40" x2="650" y2="102" className="fund-gap-line" />

            <circle cx="30" cy="260" r="5" className="fund-now-point" />
            <circle cx="650" cy="40" r="6" className="fund-target-point" />
            <circle cx="650" cy="102" r="5" className="fund-current-point" />
          </svg>

          <div className="fund-chart-labels">
            <span>32 tuổi (Hiện tại)</span>
            <span>40 tuổi</span>
            <span>50 tuổi</span>
            <span>60 tuổi (Nghỉ hưu)</span>
            <span>70 tuổi</span>
            <span>82 tuổi (Hết chu kỳ)</span>
          </div>
        </div>

        <footer>
          <div>
            <span><i className="fund-legend-target" /> Mục tiêu kỳ vọng: 8.50 tỷ đ</span>
            <span><i className="fund-legend-current" /> Dự phóng tích lũy hiện thời: 6.12 tỷ đ</span>
          </div>
          <p>
            <Icon name="info" size="small" /> Sau tuổi 60, quỹ chuyển từ giai đoạn tích lũy sang giai đoạn rút tiền hàng tháng.
          </p>
        </footer>
      </Card>

      {/* Details Grid: "What It Means" AI explanation + Breakdown */}
      <div className="plan-details-grid">
        {/* "What it means" Card */}
        <Card className="what-it-means-card">
          <span className="meaning-icon">
            <Icon name="sparkles" size="large" />
          </span>

          <div className="meaning-copy">
            <Badge tone="soft">GIẢI THÍCH TỪ CHUYÊN GIA AI</Badge>
            <h2>Điều này có ý nghĩa gì đối với bạn?</h2>
            <p>
              Khoảng thiếu hụt <strong>2.38 tỷ đồng</strong> không phải là lý do để lo lắng, mà là chiếc kim chỉ nam rõ ràng cho hành động ngay lúc này.
            </p>
            <p>
              Với <strong>28 năm</strong> tích lũy phía trước, nhờ vào sức mạnh của lãi kép, bạn chỉ cần tiết kiệm thêm khoảng <strong>1.480.000 đ mỗi tháng</strong> hoặc cải thiện tỷ suất sinh lời của danh mục đầu tư thêm 0.8%/năm là hoàn toàn lấp đầy khoảng thiếu này!
            </p>

            <div className="meaning-assumptions">
              <Icon name="info" size="small" />
              <span>
                Tính toán dựa trên giả định lạm phát dài hạn 4.0%/năm và mức sinh lời danh mục trung hòa 7.8%/năm.
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
                <small>Dự kiến 35 năm đóng, tỷ lệ hưởng 75%</small>
              </div>
              <b>2.975.000.000 đ (35%)</b>
            </div>

            <div>
              <span><Icon name="chart" /></span>
              <div>
                <strong>Danh mục đầu tư & Tích lũy tự nguyện</strong>
                <small>Quỹ mở, chứng chỉ tiền gửi & cổ tức</small>
              </div>
              <b>3.145.000.000 đ (37%)</b>
            </div>

            <div>
              <span><Icon name="home" /></span>
              <div>
                <strong>Tài sản bất động sản & Quỹ dự phòng</strong>
                <small>Nhà ở cho thuê hoặc giá trị thanh khoản</small>
              </div>
              <b>2.380.000.000 đ (28%)</b>
            </div>
          </div>
        </Card>
      </div>

      {/* Plan Disclaimer & Export Action */}
      <div className="plan-disclaimer">
        <Icon name="info" />
        <span>
          Bản kế hoạch tài chính được lập độc lập theo các nguyên lý tài chính cá nhân chuẩn mực. Các số liệu có thể được điều chỉnh lại bất cứ lúc nào.
        </span>
        <button
          type="button"
          onClick={() => alert("Đang chuẩn bị tải về bản báo cáo kế hoạch hưu trí hoàn chỉnh dạng PDF...")}
        >
          <Icon name="download" size="small" /> Tải báo cáo PDF chi tiết
        </button>
      </div>
    </>
  );
}
