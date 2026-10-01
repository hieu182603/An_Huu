import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, Button, Card, Icon, IconButton } from "../components/ui";
import { ProjectionWealthChart, AssetDonutChart } from "../components/charts";

export default function UserDashboard() {
  const navigate = useNavigate();
  const [chartPeriod, setChartPeriod] = useState<"5y" | "10y" | "retire" | "lifetime">("retire");
  const [showAlert, setShowAlert] = useState(true);

  return (
    <>
      {/* Page Header */}
      <div className="dashboard-page-header">
        <div>
          <span>BẢN ĐỒ TÀI CHÍNH CÁ NHÂN</span>
          <h1>Chào buổi sáng, Minh An</h1>
          <p>Hôm nay là thời điểm lý tưởng để kiểm tra lại lộ trình tích lũy và sức khỏe tài chính dài hạn.</p>
        </div>
        <Link to="/user/goal" className="button button-primary button-medium">
          <Icon name="target" /> Điều chỉnh mục tiêu
        </Link>
      </div>

      {/* Full-width Hero Card */}
      <div className="retirement-hero retirement-hero-full">
        <div className="retirement-hero-copy">
          <div className="card-heading-row">
            <Badge tone="soft">TIẾN ĐỘ HƯU TRÍ TỔNG THỂ</Badge>
          </div>
          <h2 style={{ color: "#ffffff" }}>Bạn đã chuẩn bị được 72% cho mục tiêu nghỉ hưu ở tuổi 60</h2>
          <p>
            Với mức tích lũy hiện tại <strong>14.200.000 đ/tháng</strong> cùng các khoản tài sản và BHXH dự phóng, bạn đang đi rất sát lộ trình để đạt cuộc sống an nhàn độc lập.
          </p>

          <div className="hero-financial-metrics">
            <div>
              <span>Mục tiêu quỹ hưu</span>
              <strong>8.500.000.000 đ</strong>
            </div>
            <div>
              <span>Dự kiến đạt được</span>
              <strong>6.120.000.000 đ</strong>
            </div>
            <div>
              <span>Khoảng cần bổ sung</span>
              <strong style={{ color: "var(--color-warning-fill)" }}>2.380.000.000 đ</strong>
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
                style={{ strokeDashoffset: `${452.4 * (1 - 0.72)}`, stroke: "url(#ringGrad)" }}
              />
            </svg>
            <div>
              <strong>72%</strong>
              <span>MỤC TIÊU TUỔI 60</span>
            </div>
          </div>
          <div className="ring-caption">
            <Icon name="circle-check" size="small" />
            <span>Dự kiến về đích vào năm 2053</span>
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
            <strong>78</strong>
            <span>/ 100 điểm</span>
          </div>
          <p>Mức chuẩn bị đạt hạng Khá vững vàng. Dòng tiền thặng dư hàng tháng đủ bù đắp trượt giá lạm phát.</p>
          <div className="score-scale">
            <span className="is-filled" />
            <span className="is-filled" />
            <span className="is-filled is-current" />
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
            <h3>Tăng 1.5 triệu vào Quỹ đầu tư</h3>
            <p>Chỉ cần tăng thêm 1.500.000 đ/tháng vào danh mục quỹ cổ phiếu định kỳ, bạn sẽ lấp kín 100% khoảng thiếu hụt.</p>
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
          <strong>2.870.000.000 đ</strong>
          <small className="is-positive">
            <Icon name="arrow-right" size="small" /> +4.8% so với quý trước
          </small>
        </Card>

        <Card className="dashboard-metric-card">
          <div>
            <span>Tích lũy tháng này</span>
            <span className="metric-icon"><Icon name="chart" /></span>
          </div>
          <strong>14.200.000 đ</strong>
          <small className="is-positive">
            <Icon name="circle-check" size="small" /> Đạt 100% chỉ tiêu tháng
          </small>
        </Card>

        <Card className="dashboard-metric-card">
          <div>
            <span>Thời gian tích lũy còn lại</span>
            <span className="metric-icon"><Icon name="compass" /></span>
          </div>
          <strong>28 năm</strong>
          <small>
            <Icon name="info" size="small" /> Tuổi 32 → Nghỉ hưu tuổi 60
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
            <ProjectionWealthChart period={chartPeriod} />
          </div>

          <div className="chart-summary">
            <div className="chart-legend-items">
              <span><i className="legend-target" /> Mục tiêu tối thiểu (8.5 tỷ)</span>
              <span><i className="legend-current" /> Dự phóng với mức tiết kiệm hiện tại (6.12 tỷ)</span>
            </div>
            <p>
              <Icon name="info" size="small" /> Khoảng thiếu hụt 2.38 tỷ tương đương cần bổ sung thêm 1.48 tr/tháng.
            </p>
          </div>
        </Card>

        {/* Financial Snapshot */}
        <Card className="financial-snapshot">
          <div className="dashboard-card-heading">
            <div>
              <h2>Cơ cấu tài sản hiện tại</h2>
              <p>Tổng giá trị ước tính: 3.720.000.000 đ</p>
            </div>
            <Badge tone="soft">CẬP NHẬT Q3</Badge>
          </div>

          <AssetDonutChart />

          <div className="snapshot-list">
            <div>
              <span className="snapshot-icon"><Icon name="wallet" /></span>
              <span>
                <small>Tiền gửi tiết kiệm ngân hàng</small>
                <strong>450.000.000 đ</strong>
                <span style={{ display: "block", height: "4px", width: "100%", maxWidth: "160px", background: "#f1f5f9", borderRadius: "999px", marginTop: "4px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: "12%", background: "var(--color-primary-700)", borderRadius: "999px" }} />
                </span>
              </span>
              <Badge tone="neutral">12%</Badge>
            </div>

            <div>
              <span className="snapshot-icon"><Icon name="home" /></span>
              <span>
                <small>Bất động sản nhà ở</small>
                <strong>2.400.000.000 đ</strong>
                <span style={{ display: "block", height: "4px", width: "100%", maxWidth: "160px", background: "#f1f5f9", borderRadius: "999px", marginTop: "4px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: "65%", background: "var(--color-secondary-500)", borderRadius: "999px" }} />
                </span>
              </span>
              <Badge tone="neutral">65%</Badge>
            </div>

            <div>
              <span className="snapshot-icon"><Icon name="chart" /></span>
              <span>
                <small>Cổ phiếu & Quỹ đầu tư mở</small>
                <strong>570.000.000 đ</strong>
                <span style={{ display: "block", height: "4px", width: "100%", maxWidth: "160px", background: "#f1f5f9", borderRadius: "999px", marginTop: "4px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: "15%", background: "var(--color-accent-500)", borderRadius: "999px" }} />
                </span>
              </span>
              <Badge tone="success">15%</Badge>
            </div>

            <div>
              <span className="snapshot-icon"><Icon name="sparkles" /></span>
              <span>
                <small>Tài sản thanh khoản khác</small>
                <strong>300.000.000 đ</strong>
                <span style={{ display: "block", height: "4px", width: "100%", maxWidth: "160px", background: "#f1f5f9", borderRadius: "999px", marginTop: "4px", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: "8%", background: "var(--color-info)", borderRadius: "999px" }} />
                </span>
              </span>
              <Badge tone="neutral">8%</Badge>
            </div>
          </div>

          <div className="cashflow-summary">
            <span>Dòng tiền thặng dư có thể tích lũy:</span>
            <strong>
              18.500.000 đ <small>/ tháng</small>
            </strong>
            <p>Thu nhập 43 triệu - Chi tiêu 25 triệu = Thặng dư 18 triệu</p>
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
                <strong>Tích lũy định kỳ tháng 9</strong>
                <small>Đã ghi nhận 14.200.000 đ vào quỹ</small>
              </div>
              <Icon name="chevron-right" size="small" />
            </div>

            <div>
              <span><Icon name="target" /></span>
              <div>
                <strong>Điều chỉnh mục tiêu tuổi hưu</strong>
                <small>Chuyển mục tiêu từ 62 tuổi sang 60 tuổi</small>
              </div>
              <Icon name="chevron-right" size="small" />
            </div>

            <div>
              <span><Icon name="sparkles" /></span>
              <div>
                <strong>Hỏi đáp cùng Trợ lý AI</strong>
                <small>Giải thích về công thức lương hưu BHXH mới</small>
              </div>
              <Icon name="chevron-right" size="small" />
            </div>
          </div>
        </Card>
      </div>

      {/* Dashboard Data Note */}
      <div className="dashboard-data-note">
        <Icon name="info" />
        <span>Dữ liệu tính toán được cập nhật tự động theo chuẩn kinh tế tài chính Việt Nam. Lần đồng bộ gần nhất: Hôm qua, 18:30.</span>
        <button type="button" onClick={() => alert("Dữ liệu tài khoản đã được đồng bộ mới nhất.")}>
          Làm mới dữ liệu ngay
        </button>
      </div>
    </>
  );
}
