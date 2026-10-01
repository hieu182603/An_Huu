import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, Button, Card, Icon, IconButton, Input } from "../components/ui";
import { SimulationComparisonChart } from "../components/charts";

export default function SimulationTrackingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"simulation" | "tracking">("simulation");

  // Simulation controls
  const [simRetireAge, setSimRetireAge] = useState(58);
  const [simMonthlySave, setSimMonthlySave] = useState(16500000); // Base is 14.2m
  const [simExpense, setSimExpense] = useState(20000000); // Base is 22m
  const [simReturn, setSimReturn] = useState(8.2); // Base is 7.8%

  // Simulation calculations
  const baseFundTarget = 8500000000;
  const baseProjectedFund = 6120000000;

  // With adjustments:
  const simFundTarget = Math.round(simExpense * 12 * (82 - simRetireAge) * 1.4);
  const simYears = Math.max(1, simRetireAge - 32);
  const simProjectedFund = Math.round((simMonthlySave * 12 * simYears * Math.pow(1 + simReturn / 100, simYears * 0.45)) + 2400000000 + 2600000000);
  const simGap = simFundTarget - simProjectedFund;
  const simScore = Math.min(98, Math.max(40, Math.round((simProjectedFund / simFundTarget) * 95)));

  const formatVND = (num: number) => {
    return new Intl.NumberFormat("vi-VN").format(num) + " đ";
  };

  return (
    <>
      <div className="phase-page-header">
        <div>
          <Badge tone="soft">CÔNG CỤ NÂNG CAO (U07)</Badge>
          <h1>Mô phỏng kịch bản & Theo dõi tiến độ</h1>
          <p>
            Thử nghiệm các giả định “Nếu... thì sao?” và giám sát kỷ luật tích lũy thực tế qua từng tháng.
          </p>
        </div>

        <div className="phase-view-switcher">
          <button
            type="button"
            className={activeTab === "simulation" ? "is-active" : ""}
            onClick={() => setActiveTab("simulation")}
          >
            Mô phỏng kịch bản
          </button>
          <button
            type="button"
            className={activeTab === "tracking" ? "is-active" : ""}
            onClick={() => setActiveTab("tracking")}
          >
            Theo dõi tiến độ
          </button>
        </div>
      </div>

      {activeTab === "simulation" ? (
        /* SIMULATION VIEW */
        <div className="simulation-layout">
          {/* Left: Simulation Controls */}
          <Card className="simulation-controls">
            <header>
              <div>
                <Badge tone="soft">THAM SỐ GIẢ ĐỊNH</Badge>
                <h2>Bảng thử nghiệm</h2>
                <p>Điều chỉnh các thông số để thấy ngay kết quả dự phóng.</p>
              </div>
            </header>

            <div className="simulation-fields">
              {/* Stepper 1: Retirement Age */}
              <div className="simulation-stepper">
                <span>1. Tuổi nghỉ hưu mong muốn</span>
                <div>
                  <IconButton
                    icon="chevron-left"
                    label="Giảm tuổi"
                    onClick={() => setSimRetireAge(Math.max(50, simRetireAge - 1))}
                  />
                  <strong>
                    {simRetireAge} <small>tuổi (sớm hơn {60 - simRetireAge} năm)</small>
                  </strong>
                  <IconButton
                    icon="chevron-right"
                    label="Tăng tuổi"
                    onClick={() => setSimRetireAge(Math.min(70, simRetireAge + 1))}
                  />
                </div>
                <p>Kế hoạch gốc: 60 tuổi</p>
              </div>

              {/* Stepper 2: Monthly Save */}
              <div className="simulation-stepper">
                <span>2. Mức tích lũy mỗi tháng</span>
                <div>
                  <IconButton
                    icon="chevron-left"
                    label="Giảm 1 triệu"
                    onClick={() => setSimMonthlySave(Math.max(5000000, simMonthlySave - 1000000))}
                  />
                  <strong>
                    {formatVND(simMonthlySave)}
                  </strong>
                  <IconButton
                    icon="chevron-right"
                    label="Tăng 1 triệu"
                    onClick={() => setSimMonthlySave(simMonthlySave + 1000000)}
                  />
                </div>
                <p>Kế hoạch gốc: 14.200.000 đ/tháng</p>
              </div>

              {/* Stepper 3: Monthly Expense in Retirement */}
              <div className="simulation-stepper">
                <span>3. Chi tiêu khi nghỉ hưu</span>
                <div>
                  <IconButton
                    icon="chevron-left"
                    label="Giảm chi tiêu"
                    onClick={() => setSimExpense(Math.max(10000000, simExpense - 1000000))}
                  />
                  <strong>
                    {formatVND(simExpense)}
                  </strong>
                  <IconButton
                    icon="chevron-right"
                    label="Tăng chi tiêu"
                    onClick={() => setSimExpense(simExpense + 1000000)}
                  />
                </div>
                <p>Kế hoạch gốc: 22.000.000 đ/tháng</p>
              </div>

              {/* Stepper 4: Return assumption */}
              <div className="simulation-stepper">
                <span>4. Lợi suất đầu tư kỳ vọng</span>
                <div>
                  <IconButton
                    icon="chevron-left"
                    label="Giảm lợi suất"
                    onClick={() => setSimReturn(Math.max(5, Math.round((simReturn - 0.2) * 10) / 10))}
                  />
                  <strong>
                    {simReturn}% <small>/ năm</small>
                  </strong>
                  <IconButton
                    icon="chevron-right"
                    label="Tăng lợi suất"
                    onClick={() => setSimReturn(Math.min(15, Math.round((simReturn + 0.2) * 10) / 10))}
                  />
                </div>
                <p>Kế hoạch gốc: 7.8%/năm</p>
              </div>
            </div>

            <div className="simulation-guidance">
              <Icon name="info" />
              <p>
                Kịch bản mô phỏng chỉ dùng để phân tích và không làm thay đổi kế hoạch chính thức cho đến khi bạn xác nhận lưu lại.
              </p>
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                setSimRetireAge(60);
                setSimMonthlySave(14200000);
                setSimExpense(22000000);
                setSimReturn(7.8);
              }}
            >
              <Icon name="trash" size="small" /> Đặt lại thông số ban đầu
            </Button>
          </Card>

          {/* Right: Simulation Results & Comparison */}
          <div className="simulation-results">
            <Card className="simulation-summary">
              <header>
                <div>
                  <div className="live-update">
                    <Icon name="circle-check" />
                    <span>Dự phóng được tính toán theo thời gian thực</span>
                  </div>
                  <h2>Kết quả kịch bản mô phỏng</h2>
                </div>
                <Badge tone={simGap <= 0 ? "success" : "warning"}>
                  {simGap <= 0 ? "DƯ THỪA MỤC TIÊU" : "CÒN THIẾU"}
                </Badge>
              </header>

              <div className="simulation-primary-result">
                <div>
                  <span>TỔNG QUỸ TÍCH LŨY MÔ PHỎNG</span>
                  <strong>{formatVND(simProjectedFund)}</strong>
                  <p>
                    So với mục tiêu {formatVND(simFundTarget)}:{" "}
                    <b>{simGap <= 0 ? `Vượt ${formatVND(Math.abs(simGap))}` : `Thiếu ${formatVND(simGap)}`}</b>
                  </p>
                </div>

                <div className="simulation-score">
                  <strong>{simScore}</strong>
                  <span>Điểm khả thi</span>
                  <small className={simScore >= 80 ? "is-positive" : ""}>
                    {simScore >= 85 ? "Rất khả thi" : simScore >= 70 ? "Khả quan" : "Cần nỗ lực"}
                  </small>
                </div>
              </div>

              {/* Side-by-side comparison table */}
              <p className="horizontal-scroll-hint">Vuốt ngang để xem đầy đủ số liệu.</p><div className="comparison-table" tabIndex={0} role="region" aria-label="So sánh các kịch bản">
                <div className="comparison-header">
                  <span>Chỉ số quan trọng</span>
                  <strong>Kế hoạch hiện tại</strong>
                  <strong style={{ color: "var(--color-secondary-700)" }}>Kịch bản mô phỏng</strong>
                </div>

                <div>
                  <span>Tuổi nghỉ hưu</span>
                  <strong>60 tuổi</strong>
                  <strong>{simRetireAge} tuổi ({simRetireAge < 60 ? `Sớm ${60 - simRetireAge} năm` : "Đúng hạn"})</strong>
                </div>

                <div>
                  <span>Mức tích lũy/tháng</span>
                  <strong>14.200.000 đ</strong>
                  <strong>{formatVND(simMonthlySave)}</strong>
                </div>

                <div>
                  <span>Chi tiêu tháng khi hưu</span>
                  <strong>22.000.000 đ</strong>
                  <strong>{formatVND(simExpense)}</strong>
                </div>

                <div>
                  <span>Lợi suất danh mục</span>
                  <strong>7.8% / năm</strong>
                  <strong>{simReturn}% / năm</strong>
                </div>

                <div>
                  <span>Quỹ hưu dự kiến</span>
                  <strong>6.120.000.000 đ</strong>
                  <strong style={{ color: "var(--color-primary-700)" }}>{formatVND(simProjectedFund)}</strong>
                </div>
              </div>
            </Card>

            {/* Interactive Simulation Comparison Chart */}
            <Card className="simulation-chart-card">
              <header>
                <div>
                  <h2>So sánh đường tích lũy tài sản</h2>
                  <p>Quan sát sự bứt phá khi điều chỉnh mức tiết kiệm và tuổi nghỉ hưu.</p>
                </div>
              </header>

              <div className="simulation-chart" tabIndex={0} role="region" aria-label="Biểu đồ mô phỏng">
                <SimulationComparisonChart
                  currentAge={32}
                  simRetireAge={simRetireAge}
                  baseProjectedFund={baseProjectedFund}
                  simProjectedFund={simProjectedFund}
                  simFundTarget={simFundTarget}
                />
              </div>

              <footer>
                <div>
                  <span><i className="legend-current-plan" /> Kế hoạch hiện tại</span>
                  <span><i className="legend-simulation" /> Kịch bản mô phỏng mới</span>
                  <span><i className="legend-target-line" /> Mức mục tiêu cần đạt</span>
                </div>
                <p>
                  <Icon name="info" size="small" /> Đường mô phỏng tăng tốc nhờ gia tăng tích lũy và lãi suất kép.
                </p>
              </footer>
            </Card>

            {/* AI Simulation Insight */}
            <div className="simulation-insight">
              <span><Icon name="sparkles" size="large" /></span>
              <div>
                <h2>Nhận định từ Trợ lý AI về kịch bản này</h2>
                <p>
                  Kịch bản nghỉ hưu ở tuổi <strong>{simRetireAge}</strong> hoàn toàn khả thi nếu bạn duy trì được mức tiết kiệm {formatVND(simMonthlySave)}/tháng. Bạn sẽ tiết kiệm được 2 năm tuổi xuân làm việc văn phòng mà vẫn đảm bảo 100% tài chính bền vững!
                </p>
                <small>Khuyến nghị: Phân bổ 40% vào quỹ chỉ số cổ phiếu, 40% trái phiếu doanh nghiệp top đầu và 20% tiền gửi linh hoạt.</small>
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  alert("Đã áp dụng kịch bản mô phỏng này làm kế hoạch tài chính chính thức của bạn!");
                  navigate("/user/plan");
                }}
              >
                Áp dụng kịch bản này <Icon name="check" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* TRACKING VIEW */
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Tracking Hero */}
          <div className="tracking-hero">
            <div className="tracking-hero-copy">
              <Badge tone="soft">THEO DÕI THÁNG 9/2025</Badge>
              <h2>Bạn đang đi rất đúng hướng trong hành trình kỷ luật tích lũy!</h2>
              <p>
                Tháng này bạn đã hoàn tất 100% chỉ tiêu trích lập <strong>14.200.000 đ</strong> vào quỹ hưu trí. Đây là tháng thứ 8 liên tiếp bạn duy trì được thói quen tuyệt vời này.
              </p>

              <div className="tracking-month-result">
                <span>TÍCH LŨY THỰC TẾ THÁNG NÀY</span>
                <strong>14.200.000 đ / 14.200.000 đ</strong>
                <small>Hoàn thành: Ngày 05/09/2025 thông qua trích nợ tự động</small>
              </div>
            </div>

            <div className="tracking-progress-visual">
              <div className="tracking-ring">
                <svg viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="72" className="ring-track" />
                  <circle cx="80" cy="80" r="72" className="tracking-ring-value" />
                </svg>
                <div>
                  <strong>100%</strong>
                  <span>MỤC TIÊU THÁNG</span>
                </div>
              </div>
              <div>
                <Icon name="circle-check" />
                <span>
                  <strong>Trạng thái: On Track</strong>
                  <small>Đạt chuẩn kế hoạch</small>
                </span>
              </div>
            </div>
          </div>

          {/* 4 Tracking Metrics */}
          <div className="tracking-metrics">
            <Card className="tracking-metric">
              <div>
                <span>Tích lũy lũy kế năm 2025</span>
                <Icon name="wallet" />
              </div>
              <strong>127.800.000 đ</strong>
              <small style={{ color: "var(--color-success)" }}>
                <Icon name="circle-check" size="small" /> Đạt 9/9 tháng chỉ tiêu
              </small>
            </Card>

            <Card className="tracking-metric">
              <div>
                <span>Tiến độ quỹ tổng thể</span>
                <Icon name="target" />
              </div>
              <strong>72.4%</strong>
              <small>Tương đương 6.15 tỷ / 8.5 tỷ đ</small>
            </Card>

            <Card className="tracking-metric">
              <div>
                <span>Chuỗi tháng kỷ luật</span>
                <Icon name="sparkles" />
              </div>
              <strong>8 tháng liên tiếp</strong>
              <small>Thói quen tài chính xuất sắc</small>
            </Card>

            <Card className="tracking-metric">
              <div>
                <span>Kỳ rà soát kế hoạch tới</span>
                <Icon name="compass" />
              </div>
              <strong>15/10/2025</strong>
              <small>Đánh giá định kỳ Quý 3</small>
            </Card>
          </div>

          {/* Analysis Grid: History Bars + Monthly Status List */}
          <div className="tracking-analysis-grid">
            {/* History Bars Card */}
            <Card className="history-card">
              <header>
                <div>
                  <h2>Lịch sử tích lũy 6 tháng gần nhất</h2>
                  <p>So sánh số tiền mục tiêu và số tiền thực tế đã chuyển vào quỹ.</p>
                </div>
                <Badge tone="soft">NĂM 2025</Badge>
              </header>

              <p className="horizontal-scroll-hint">Vuốt ngang để xem đầy đủ số liệu.</p><div className="history-bars" tabIndex={0} role="region" aria-label="Lịch sử tích lũy">
                <div className="history-axis">
                  <span>18 tr</span>
                  <span>14 tr</span>
                  <span>10 tr</span>
                  <span>6 tr</span>
                  <span>0 đ</span>
                </div>

                <div className="history-grid-lines">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                <div className="history-bar-groups">
                  {[
                    { month: "T4", target: 80, actual: 80 },
                    { month: "T5", target: 80, actual: 85 },
                    { month: "T6", target: 80, actual: 75 },
                    { month: "T7", target: 80, actual: 90 },
                    { month: "T8", target: 80, actual: 80 },
                    { month: "T9", target: 80, actual: 80 },
                  ].map((item) => (
                    <div key={item.month} className="history-month">
                      <div className="bars">
                        <span
                          className="target-bar"
                          style={{ "--history-height": `${item.target}%` } as React.CSSProperties}
                          title={`Mục tiêu: 14.2 tr`}
                        />
                        <span
                          className="actual-bar"
                          style={{ "--history-height": `${item.actual}%` } as React.CSSProperties}
                          title={`Thực tế: ${item.actual >= 80 ? "Đạt chỉ tiêu" : "Chưa đạt"}`}
                        />
                      </div>
                      <strong>{item.month}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <footer>
                <div>
                  <span><i className="target-legend" /> Mức mục tiêu (14.2 triệu)</span>
                  <span><i className="actual-legend" /> Thực tế tích lũy</span>
                </div>
                <p>
                  <Icon name="circle-check" size="small" /> Tháng 7 bạn đã thưởng thêm 2 triệu vào quỹ nhờ tiền thưởng dự án.
                </p>
              </footer>
            </Card>

            {/* Monthly Status List Card */}
            <Card className="monthly-status-card">
              <header>
                <div>
                  <h2>Chi tiết trạng thái từng tháng</h2>
                  <p>Nhật ký ghi nhận dòng tiền</p>
                </div>
              </header>

              <div className="monthly-status-list">
                <div>
                  <span className="month-state-icon state-on-track">
                    <Icon name="circle-check" />
                  </span>
                  <div>
                    <strong>Tháng 9/2025 · 14.200.000 đ</strong>
                    <small>Đúng hạn · Đạt 100% mục tiêu</small>
                  </div>
                  <Badge tone="success">On track</Badge>
                </div>

                <div>
                  <span className="month-state-icon state-on-track">
                    <Icon name="circle-check" />
                  </span>
                  <div>
                    <strong>Tháng 8/2025 · 14.200.000 đ</strong>
                    <small>Đúng hạn · Đạt 100% mục tiêu</small>
                  </div>
                  <Badge tone="success">On track</Badge>
                </div>

                <div>
                  <span className="month-state-icon state-on-track">
                    <Icon name="circle-check" />
                  </span>
                  <div>
                    <strong>Tháng 7/2025 · 16.200.000 đ</strong>
                    <small>Vượt chỉ tiêu (+2 triệu đ)</small>
                  </div>
                  <Badge tone="success">Vượt mục tiêu</Badge>
                </div>

                <div>
                  <span className="month-state-icon state-attention">
                    <Icon name="alert" />
                  </span>
                  <div>
                    <strong>Tháng 6/2025 · 13.500.000 đ</strong>
                    <small>Thiếu 700.000 đ (chi phí đột xuất)</small>
                  </div>
                  <Badge tone="warning">Cần chú ý</Badge>
                </div>
              </div>
            </Card>
          </div>

          {/* Overall Goal Progress Tracking Card */}
          <Card className="goal-progress-tracking">
            <header>
              <div>
                <h2>Tiến trình chạm mốc tự do tài chính trọn đời</h2>
                <p>Theo dõi 4 cột mốc quan trọng trong sự nghiệp tích lũy.</p>
              </div>
              <Badge tone="soft">MỤC TIÊU: 8.5 TỶ Đ</Badge>
            </header>

            <div className="big-progress-row">
              <strong>6.120.000.000 đ</strong>
              <span>đã tích lũy và bảo bọc / 8.500.000.000 đ tổng mục tiêu (72%)</span>
            </div>

            <div className="progress-track" role="progressbar" aria-valuenow={72} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ "--progress": "72%" } as React.CSSProperties} />
            </div>

            <div className="goal-milestones">
              <div className="is-complete">
                <span><Icon name="check" size="small" /></span>
                <strong>Mốc 1: Khởi đầu</strong>
                <small>Xây dựng quỹ khẩn cấp (Đã xong)</small>
              </div>

              <div className="is-complete">
                <span><Icon name="check" size="small" /></span>
                <strong>Mốc 2: Nền tảng</strong>
                <small>Đạt 25% mục tiêu hưu trí (Đã xong)</small>
              </div>

              <div className="is-complete">
                <span><Icon name="check" size="small" /></span>
                <strong>Mốc 3: Bứt phá 50%</strong>
                <small>Vượt mốc 4.25 tỷ (Đã xong)</small>
              </div>

              <div>
                <span>4</span>
                <strong>Mốc 4: Tự do 100%</strong>
                <small>Chạm đích 8.5 tỷ ở tuổi 60</small>
              </div>
            </div>
          </Card>

          {/* Tracking Next Action Banner */}
          <div className="tracking-next-action">
            <span><Icon name="sparkles" size="large" /></span>
            <div>
              <h2>Duy trì đà tích lũy trong tháng 10 tới</h2>
              <p>
                Lệnh trích chuyển tự động tiếp theo sẽ được thực hiện vào ngày 05/10/2025. Bạn có muốn kích hoạt tính năng tự động làm tròn tiết kiệm để nhanh về đích hơn không?
              </p>
              <small>Tính năng hoàn toàn miễn phí và có thể tạm ngưng bất kỳ lúc nào.</small>
            </div>
            <Button
              variant="primary"
              onClick={() => alert("Đã bật tính năng tự động tối ưu hóa tiết kiệm hàng tháng!")}
            >
              Kích hoạt ngay <Icon name="arrow-right" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
