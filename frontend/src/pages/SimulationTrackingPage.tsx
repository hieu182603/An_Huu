import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Alert, Badge, Button, Card, Icon, IconButton } from "../components/ui";
import { SimulationComparisonChart } from "../components/charts";
import { useFinancialProfile, DEMO_STORAGE_DISCLAIMER } from "../context/FinancialProfileContext";
import { calculateRetirement, inputFromProfile } from "../domain/retirementCalculator";

const formatVND = (num: number) => new Intl.NumberFormat("vi-VN").format(num) + " đ";

export default function SimulationTrackingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"simulation" | "tracking">("simulation");
  const { profile, applySimulationScenario } = useFinancialProfile();
  const [applyNotice, setApplyNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [applying, setApplying] = useState(false);

  // Khởi tạo từ hồ sơ dùng chung để mặc định khớp kế hoạch chính thức.
  const [simRetireAge, setSimRetireAge] = useState(profile.goal.targetRetireAge);
  const [simMonthlySave, setSimMonthlySave] = useState(profile.plan.monthlySavings);
  const [simExpense, setSimExpense] = useState(profile.goal.monthlyExpenseInRetirement);
  const [simReturn, setSimReturn] = useState(profile.goal.investmentReturn);

  // Tài sản ròng dùng cho cả kịch bản gốc và mô phỏng.
  const netWorth = useMemo(() => {
    const totalAssets =
      profile.assets.cashSavings +
      profile.assets.realEstateValue +
      profile.assets.liquidAssets +
      profile.assets.stockFundValue;
    const totalDebt = profile.debt.hasDebt
      ? profile.debt.mortgageDebt + profile.debt.consumerDebt
      : 0;
    return Math.max(0, totalAssets - totalDebt);
  }, [profile]);

  // Tính kịch bản gốc và kịch bản mô phỏng bằng cùng bộ tính.
  const baseSim = useMemo(
    () =>
      calculateRetirement(inputFromProfile(profile)),
    [profile]
  );

  const scenarioSim = useMemo(
    () =>
      calculateRetirement({
        ...inputFromProfile(profile),
        retirementAge: simRetireAge,
        monthlyContribution: simMonthlySave,
        monthlyExpenseToday: simExpense,
        annualReturnRate: simReturn,
      }),
    [profile, simRetireAge, simMonthlySave, simExpense, simReturn]
  );

  const baseInput = useMemo(() => inputFromProfile(profile), [profile]);
  const scenarioInput = useMemo(() => ({
    ...baseInput,
    retirementAge: simRetireAge,
    monthlyContribution: simMonthlySave,
    monthlyExpenseToday: simExpense,
    annualReturnRate: simReturn,
  }), [baseInput, simRetireAge, simMonthlySave, simExpense, simReturn]);

  const baseFundTarget = baseSim.targetFund;
  const baseProjectedFund = baseSim.projectedFund;
  const simFundTarget = scenarioSim.targetFund;
  const simProjectedFund = scenarioSim.projectedFund;
  const simGap = scenarioSim.gap;
  const simScore = scenarioSim.readinessScore;

  // Đặt lại thông số ban đầu = kế hoạch chính thức.
  const resetToBaseline = () => {
    setSimRetireAge(profile.goal.targetRetireAge);
    setSimMonthlySave(profile.plan.monthlySavings);
    setSimExpense(profile.goal.monthlyExpenseInRetirement);
    setSimReturn(profile.goal.investmentReturn);
  };

  // Áp dụng kịch bản: ghi vào hồ sơ, sau đó chuyển sang Kế hoạch.
  const handleApplyScenario = async () => {
    setApplying(true);
    setApplyNotice(null);
    const ok = await applySimulationScenario({
      retireAge: simRetireAge,
      monthlySave: simMonthlySave,
      expense: simExpense,
      returnRate: simReturn,
      targetFund: simFundTarget,
      projectedFund: simProjectedFund,
      score: simScore,
    });
    setApplying(false);
    if (ok) {
      setApplyNotice({
        tone: "success",
        message: "Kịch bản đã được áp dụng làm kế hoạch chính thức. Đang chuyển sang trang Kế hoạch…",
      });
      setTimeout(() => navigate("/user/plan"), 1200);
    } else {
      setApplyNotice({ tone: "danger", message: "Không thể lưu kịch bản. Vui lòng thử lại." });
    }
  };

  return (
    <>
      <div className="phase-page-header">
        <div>
          <Badge tone="soft">CÔNG CỤ NÂNG CAO</Badge>
          <h1>Mô phỏng kịch bản & Theo dõi tiến độ</h1>
          <p>
            Thử nghiệm các giả định "Nếu... thì sao?" và giám sát kỷ luật tích lũy thực tế qua từng tháng.
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

      <p className="page-demo-note">
        <Icon name="info" size="small" />
        <span>{DEMO_STORAGE_DISCLAIMER} Cùng một bộ tính được dùng cho Mục tiêu, Kế hoạch và Mô phỏng.</span>
      </p>

      {activeTab === "simulation" ? (
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
              <div className="simulation-stepper">
                <span>1. Tuổi nghỉ hưu mong muốn</span>
                <div>
                  <IconButton
                    icon="chevron-left"
                    label="Giảm tuổi"
                    onClick={() => setSimRetireAge(Math.max(profile.personal.age + 1, simRetireAge - 1))}
                  />
                  <strong>
                    {simRetireAge}{" "}
                    <small>
                      {simRetireAge > profile.goal.targetRetireAge
                        ? `(nghỉ muộn ${simRetireAge - profile.goal.targetRetireAge} năm)`
                        : simRetireAge < profile.goal.targetRetireAge
                        ? `(nghỉ sớm ${profile.goal.targetRetireAge - simRetireAge} năm)`
                        : "(đúng hạn)"}
                    </small>
                  </strong>
                  <IconButton
                    icon="chevron-right"
                    label="Tăng tuổi"
                    onClick={() => setSimRetireAge(Math.min(75, simRetireAge + 1))}
                  />
                </div>
                <p>Kế hoạch gốc: {profile.goal.targetRetireAge} tuổi</p>
              </div>

              <div className="simulation-stepper">
                <span>2. Mức tích lũy mỗi tháng</span>
                <div>
                  <IconButton
                    icon="chevron-left"
                    label="Giảm 1 triệu"
                    onClick={() => setSimMonthlySave(Math.max(0, simMonthlySave - 1000000))}
                  />
                  <strong>{formatVND(simMonthlySave)}</strong>
                  <IconButton
                    icon="chevron-right"
                    label="Tăng 1 triệu"
                    onClick={() => setSimMonthlySave(simMonthlySave + 1000000)}
                  />
                </div>
                <p>Kế hoạch gốc: {formatVND(profile.plan.monthlySavings)}/tháng</p>
              </div>

              <div className="simulation-stepper">
                <span>3. Chi tiêu khi nghỉ hưu</span>
                <div>
                  <IconButton
                    icon="chevron-left"
                    label="Giảm chi tiêu"
                    onClick={() => setSimExpense(Math.max(0, simExpense - 1000000))}
                  />
                  <strong>{formatVND(simExpense)}</strong>
                  <IconButton
                    icon="chevron-right"
                    label="Tăng chi tiêu"
                    onClick={() => setSimExpense(simExpense + 1000000)}
                  />
                </div>
                <p>Kế hoạch gốc: {formatVND(profile.goal.monthlyExpenseInRetirement)}/tháng</p>
              </div>

              <div className="simulation-stepper">
                <span>4. Lợi suất đầu tư kỳ vọng</span>
                <div>
                  <IconButton
                    icon="chevron-left"
                    label="Giảm lợi suất"
                    onClick={() => setSimReturn(Math.max(0, Math.round((simReturn - 0.2) * 10) / 10))}
                  />
                  <strong>
                    {simReturn}% <small>/ năm</small>
                  </strong>
                  <IconButton
                    icon="chevron-right"
                    label="Tăng lợi suất"
                    onClick={() => setSimReturn(Math.min(20, Math.round((simReturn + 0.2) * 10) / 10))}
                  />
                </div>
                <p>Kế hoạch gốc: {profile.goal.investmentReturn}%/năm</p>
              </div>
            </div>

            <div className="simulation-guidance">
              <Icon name="info" />
              <p>
                Kịch bản mô phỏng không tự động thay đổi kế hoạch chính thức cho đến khi bạn bấm "Áp dụng kịch bản này".
              </p>
            </div>

            <Button variant="ghost" onClick={resetToBaseline}>
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
                    <b>
                      {simGap <= 0
                        ? `Vượt ${formatVND(Math.abs(simGap))}`
                        : `Thiếu ${formatVND(simGap)}`}
                    </b>
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

              <p className="horizontal-scroll-hint">Vuốt ngang để xem đầy đủ số liệu.</p>
              <div className="comparison-table" tabIndex={0} role="region" aria-label="So sánh các kịch bản">
                <div className="comparison-header">
                  <span>Chỉ số quan trọng</span>
                  <strong>Kế hoạch hiện tại</strong>
                  <strong style={{ color: "var(--color-secondary-700)" }}>Kịch bản mô phỏng</strong>
                </div>

                <div>
                  <span>Tuổi nghỉ hưu</span>
                  <strong>{profile.goal.targetRetireAge} tuổi</strong>
                  <strong>{simRetireAge} tuổi ({simRetireAge < profile.goal.targetRetireAge ? `Sớm ${profile.goal.targetRetireAge - simRetireAge} năm` : simRetireAge > profile.goal.targetRetireAge ? `Muộn ${simRetireAge - profile.goal.targetRetireAge} năm` : "Đúng hạn"})</strong>
                </div>

                <div>
                  <span>Mức tích lũy/tháng</span>
                  <strong>{formatVND(profile.plan.monthlySavings)}</strong>
                  <strong>{formatVND(simMonthlySave)}</strong>
                </div>

                <div>
                  <span>Chi tiêu tháng khi hưu</span>
                  <strong>{formatVND(profile.goal.monthlyExpenseInRetirement)}</strong>
                  <strong>{formatVND(simExpense)}</strong>
                </div>

                <div>
                  <span>Lợi suất danh mục</span>
                  <strong>{profile.goal.investmentReturn}% / năm</strong>
                  <strong>{simReturn}% / năm</strong>
                </div>

                <div>
                  <span>Quỹ hưu dự kiến</span>
                  <strong>{formatVND(baseProjectedFund)}</strong>
                  <strong style={{ color: "var(--color-primary-700)" }}>{formatVND(simProjectedFund)}</strong>
                </div>
              </div>
            </Card>

            <Card className="simulation-chart-card">
              <header>
                <div>
                  <h2>So sánh đường tích lũy tài sản</h2>
                  <p>Quan sát sự bứt phá khi điều chỉnh mức tiết kiệm và tuổi nghỉ hưu.</p>
                </div>
              </header>

              <div className="simulation-chart" tabIndex={0} role="region" aria-label="Biểu đồ mô phỏng">
                <SimulationComparisonChart
                  baseInput={baseInput}
                  scenarioInput={scenarioInput}
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
                  <Icon name="info" size="small" /> Đường mô phỏng phản ánh tác động của lợi suất và mức tiết kiệm mới.
                </p>
              </footer>
            </Card>

            <div className="simulation-insight">
              <span><Icon name="sparkles" size="large" /></span>
              <div>
                <h2>Nhận định từ Trợ lý AI về kịch bản này</h2>
                <p>
                  {simGap <= 0
                    ? `Kịch bản nghỉ hưu ở tuổi ${simRetireAge} cho kết quả vượt mục tiêu ${formatVND(Math.abs(simGap))}. Đây là vùng đệm tốt — bạn có thể cân nhắc giảm đóng góp hoặc nghỉ sớm hơn.`
                    : `Kịch bản nghỉ hưu ở tuổi ${simRetireAge} còn thiếu ${formatVND(simGap)} so với mục tiêu. Cần đánh giá lại mức tích lũy hoặc điều chỉnh chi tiêu khi về hưu.`}
                </p>
                <small>
                  Nhận định dựa trên giả định lạm phát {profile.goal.inflationRate}%/năm, lợi suất {simReturn}%/năm
                  và tài sản ròng hiện có {formatVND(netWorth)}.
                </small>
              </div>
              <Button
                variant="primary"
                onClick={handleApplyScenario}
                loading={applying}
              >
                Áp dụng kịch bản này <Icon name="check" />
              </Button>
            </div>

            {applyNotice && (
              <Alert tone={applyNotice.tone} title={applyNotice.tone === "success" ? "Áp dụng thành công" : "Lỗi"}>
                {applyNotice.message}
              </Alert>
            )}
          </div>
        </div>
      ) : (
        /* TRACKING VIEW */
        <div style={{ display: "grid", gap: "20px" }}>
          <div className="tracking-hero">
            <div className="tracking-hero-copy">
              <Badge tone="soft">THEO DÕI THEO HỒ SƠ</Badge>
              <h2>
                {profile.plan.projectedFund >= profile.plan.targetFund
                  ? "Bạn đang trên đà về đích sớm!"
                  : "Bạn đang đi đúng hướng trong hành trình kỷ luật tích lũy!"}
              </h2>
              <p>
                Mức tích lũy đề xuất hiện tại:{" "}
                <strong>{formatVND(profile.plan.monthlySavings)}</strong>/tháng, dựa trên dòng tiền thặng dư
                từ hồ sơ tài chính của bạn.
              </p>

              <div className="tracking-month-result">
                <span>TÍCH LŨY ĐỀ XUẤT HÀNG THÁNG</span>
                <strong>{formatVND(profile.plan.monthlySavings)}</strong>
                <small>Cập nhật lần cuối: {profile.plan.lastUpdated}</small>
              </div>
            </div>

            <div className="tracking-progress-visual">
              <div className="tracking-ring">
                <svg viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="72" className="ring-track" />
                  <circle
                    cx="80"
                    cy="80"
                    r="72"
                    className="tracking-ring-value"
                    style={{
                      strokeDashoffset: `${452.4 * (1 - Math.min(100, (profile.plan.projectedFund / Math.max(1, profile.plan.targetFund)) * 100) / 100)}`,
                    }}
                  />
                </svg>
                <div>
                  <strong>{Math.min(100, Math.round((profile.plan.projectedFund / Math.max(1, profile.plan.targetFund)) * 100))}%</strong>
                  <span>MỤC TIÊU</span>
                </div>
              </div>
              <div>
                <Icon name="circle-check" />
                <span>
                  <strong>
                    {profile.plan.projectedFund >= profile.plan.targetFund ? "Trạng thái: Vượt mục tiêu" : "Trạng thái: Đang bám sát"}
                  </strong>
                  <small>
                    {profile.plan.projectedFund >= profile.plan.targetFund
                      ? "Kế hoạch đã đáp ứng mục tiêu"
                      : "Tiếp tục duy trì tích lũy đều đặn"}
                  </small>
                </span>
              </div>
            </div>
          </div>

          <div className="tracking-metrics">
            <Card className="tracking-metric">
              <div>
                <span>Tài sản ròng hiện tại</span>
                <Icon name="wallet" />
              </div>
              <strong>{formatVND(netWorth)}</strong>
              <small>Bao gồm tiết kiệm, BĐS, đầu tư — trừ nợ</small>
            </Card>

            <Card className="tracking-metric">
              <div>
                <span>Tiến độ quỹ mục tiêu</span>
                <Icon name="target" />
              </div>
              <strong>{Math.min(100, Math.round((profile.plan.projectedFund / Math.max(1, profile.plan.targetFund)) * 100))}%</strong>
              <small>
                {formatVND(profile.plan.projectedFund)} / {formatVND(profile.plan.targetFund)}
              </small>
            </Card>

            <Card className="tracking-metric">
              <div>
                <span>Lợi suất kỳ vọng</span>
                <Icon name="sparkles" />
              </div>
              <strong>{profile.goal.investmentReturn}%/năm</strong>
              <small>Lạm phát dự kiến {profile.goal.inflationRate}%/năm</small>
            </Card>

            <Card className="tracking-metric">
              <div>
                <span>Thời điểm về hưu dự kiến</span>
                <Icon name="compass" />
              </div>
              <strong>{profile.goal.targetRetireAge} tuổi</strong>
              <small>Tuổi thọ kỳ vọng {profile.goal.lifeExpectancy}</small>
            </Card>
          </div>

          <div className="tracking-next-action">
            <span><Icon name="sparkles" size="large" /></span>
            <div>
              <h2>Duy trì kỷ luật tích lũy đều đặn</h2>
              <p>
                Tính năng trích chuyển tự động cần được kết nối với ngân hàng hoặc dịch vụ tài chính cá nhân.
                Trong bản demo, các thao tác này đ được mô phỏng.
              </p>
              <small>Cập nhật lại hồ sơ tại /user/account để kế hoạch phản ánh đúng th cận của bạn.</small>
            </div>
            <Link to="/user/account" className="button button-primary button-medium">
              Cập nhật hồ sơ <Icon name="arrow-right" />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
