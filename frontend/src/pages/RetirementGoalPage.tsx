import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon, IconButton, Input, Tooltip, useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { calculateRetirement, inputFromProfile, validateRetirementInput } from "../domain/retirementCalculator";

const formatVND = (num: number) => new Intl.NumberFormat("vi-VN").format(num) + " VND";

export default function RetirementGoalPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile, updateProfile, saveStatus, lastSavedAt, saveError } = useFinancialProfile();

  // Goal states initialized from shared profile
  const [currentAge, setCurrentAge] = useState(profile.personal.age || 32);
  const [targetAge, setTargetAge] = useState(profile.goal.targetRetireAge || 60);
  const [lifestyle, setLifestyle] = useState<"standard" | "comfortable" | "affluent">(profile.goal.lifestyle || "comfortable");
  const [monthlyExpenseInRetirement, setMonthlyExpenseInRetirement] = useState(profile.goal.monthlyExpenseInRetirement || 22000000);
  // Giả định kinh tế vĩ mô được chuẩn hóa bởi thuật toán An Hưu để bảo đảm độ chính xác tối ưu
  const inflationNum = profile.goal.inflationRate ?? 4.0;
  const returnNum = profile.goal.investmentReturn ?? 7.8;
  const [lifeExpectancy, setLifeExpectancy] = useState(profile.goal.lifeExpectancy || 82);
  const [saveNotice, setSaveNotice] = useState(false);
  const [validationError, setValidationError] = useState("");

  const yearsLeft = Math.max(0, targetAge - currentAge);
  const retirementDuration = Math.max(0, lifeExpectancy - targetAge);

  const previewInput = {
    ...inputFromProfile(profile),
    currentAge,
    retirementAge: targetAge,
    lifeExpectancy,
    monthlyExpenseToday: monthlyExpenseInRetirement,
    annualInflationRate: inflationNum,
    annualReturnRate: returnNum,
  };
  const preview = calculateRetirement(previewInput);
  const estimatedTargetFund = preview.targetFund;
  const estimatedMonthlySave = profile.plan.monthlySavings;

  const handleSaveGoal = async () => {
    const errors = validateRetirementInput(previewInput);
    if (errors.length) {
      setValidationError(errors[0]);
      notify.error("Thông tin chưa hợp lệ", errors[0]);
      return false;
    }
    setValidationError("");
    const ok = await updateProfile({
      personal: { ...profile.personal, age: currentAge },
      goal: {
        ...profile.goal,
        targetRetireAge: targetAge,
        lifeExpectancy,
        lifestyle,
        monthlyExpenseInRetirement,
        inflationRate: inflationNum,
        investmentReturn: returnNum,
      },
    });
    if (ok) {
      setSaveNotice(true);
      notify.success("Lưu mục tiêu thành công", "Các tham số tuổi hưu và quỹ tích lũy mục tiêu đã được cập nhật.");
      setTimeout(() => setSaveNotice(false), 3000);
    } else {
      notify.error("Lỗi cập nhật", "Không thể lưu mục tiêu hưu trí. Vui lòng thử lại.");
    }
    return ok;
  };

  const handleProceedToPlan = async () => {
    if (await handleSaveGoal()) navigate("/user/plan");
  };

  return (
    <>
      <div className="retirement-page-header">
        <div>
          <Badge tone="soft">MỤC TIÊU HƯU TRÍ</Badge>
          <h1>Xác định mục tiêu & kỳ vọng nghỉ hưu</h1>
          <p>
            Chọn thời điểm và phong cách sống bạn mong muốn khi về già. Hệ thống sẽ tự động lượng hóa số tiền mục tiêu cần tích lũy.
          </p>
        </div>

        <div className="retirement-view-switcher">
          <button type="button" className="is-active">Mục tiêu</button>
          <Link to="/user/plan"><button type="button">Kế hoạch</button></Link>
        </div>
      </div>

      <div className="goal-layout">
        {/* Left Column: Form & Timeline */}
        <motion.div
          className="goal-form-column"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          {/* Section 1: Age Controls */}
          <Card className="goal-form-card">
            <header>
              <span className="form-section-index">01</span>
              <div>
                <h2>Mốc tuổi nghỉ hưu mong muốn</h2>
                <p>Điều chỉnh tuổi hiện tại và thời điểm bạn muốn ngừng làm việc toàn thời gian.</p>
              </div>
            </header>

            <div className="age-controls-grid">
              {/* Card 1: Tuổi hiện tại */}
              <div className="age-control-card">
                <div className="age-card-header">
                  <div className="age-card-title-group">
                    <span className="age-card-icon-pill">
                      <Icon name="users" size="small" />
                    </span>
                    <span className="age-card-title">Tuổi hiện tại của bạn</span>
                  </div>
                  <span className="age-card-badge">Mốc bắt đầu</span>
                </div>

                <div className="age-stepper-cluster">
                  <button
                    type="button"
                    className="age-stepper-btn"
                    aria-label="Giảm 1 tuổi"
                    onClick={() => setCurrentAge(Math.max(18, currentAge - 1))}
                  >
                    <Icon name="chevron-left" />
                  </button>

                  <div className="age-number-display-wrap">
                    <input
                      type="number"
                      min={18}
                      max={targetAge - 1}
                      value={currentAge}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          setCurrentAge(Math.max(18, Math.min(targetAge - 1, val)));
                        }
                      }}
                      className="age-hero-number-input"
                      aria-label="Nhập tuổi hiện tại của bạn"
                      title="Bấm để nhập số tuổi trực tiếp"
                    />
                    <span className="age-hero-unit">tuổi</span>
                  </div>

                  <button
                    type="button"
                    className="age-stepper-btn"
                    aria-label="Tăng 1 tuổi"
                    onClick={() => setCurrentAge(Math.min(targetAge - 1, currentAge + 1))}
                  >
                    <Icon name="chevron-right" />
                  </button>
                </div>

                <div className="age-card-footer-pill">
                  <Icon name="info" size="small" />
                  <span>Năm sinh ước tính: <strong>{new Date().getFullYear() - currentAge}</strong></span>
                </div>
              </div>

              {/* Card 2: Tuổi dự kiến nghỉ hưu */}
              <div className="age-control-card is-highlight">
                <div className="age-card-header">
                  <div className="age-card-title-group">
                    <span className="age-card-icon-pill">
                      <Icon name="target" size="small" />
                    </span>
                    <span className="age-card-title">Tuổi dự kiến nghỉ hưu</span>
                  </div>
                  <span className="age-card-badge is-highlight">Mục tiêu</span>
                </div>

                <div className="age-stepper-cluster">
                  <button
                    type="button"
                    className="age-stepper-btn"
                    aria-label="Giảm 1 tuổi hưu"
                    onClick={() => setTargetAge(Math.max(currentAge + 1, targetAge - 1))}
                  >
                    <Icon name="chevron-left" />
                  </button>

                  <div className="age-number-display-wrap">
                    <input
                      type="number"
                      min={currentAge + 1}
                      max={80}
                      value={targetAge}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          setTargetAge(Math.max(currentAge + 1, Math.min(80, val)));
                        }
                      }}
                      className="age-hero-number-input"
                      aria-label="Nhập tuổi dự kiến nghỉ hưu"
                      title="Bấm để nhập số tuổi trực tiếp"
                    />
                    <span className="age-hero-unit">tuổi</span>
                  </div>

                  <button
                    type="button"
                    className="age-stepper-btn"
                    aria-label="Tăng 1 tuổi hưu"
                    onClick={() => setTargetAge(Math.min(80, targetAge + 1))}
                  >
                    <Icon name="chevron-right" />
                  </button>
                </div>

                <div className="age-card-footer-pill is-highlight">
                  <Icon name="target" size="small" />
                  <span>Thời gian tích lũy: <strong>{yearsLeft} năm</strong> (về hưu năm {new Date().getFullYear() + yearsLeft})</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Section 2: Lifestyle Choice */}
          <Card className="goal-form-card">
            <header>
              <span className="form-section-index">02</span>
              <div>
                <h2>Mức sống & Chi tiêu khi nghỉ hưu</h2>
                <p>Lựa chọn tiêu chuẩn sinh hoạt phù hợp với định hướng cuộc sống tuổi hưu của bạn.</p>
              </div>
            </header>

            <div className="lifestyle-options">
              <button
                type="button"
                className={lifestyle === "standard" ? "is-selected" : ""}
                onClick={() => {
                  setLifestyle("standard");
                  setMonthlyExpenseInRetirement(15000000);
                }}
              >
                <span><Icon name="home" /></span>
                <strong>Tiết kiệm & Giản dị</strong>
                <small>Bao gồm chi tiêu ăn uống cơ bản, sinh hoạt gia đình tại vùng ngoại ô hoặc nông thôn.</small>
                {lifestyle === "standard" && <Icon name="check" />}
              </button>

              <button
                type="button"
                className={lifestyle === "comfortable" ? "is-selected" : ""}
                onClick={() => {
                  setLifestyle("comfortable");
                  setMonthlyExpenseInRetirement(22000000);
                }}
              >
                <span><Icon name="sparkles" /></span>
                <strong>Thoải mái & Độc lập</strong>
                <small>Duy trì mức sống đô thị, thỉnh thoảng đi du lịch trong nước, bảo hiểm y tế tư nhân cao cấp.</small>
                {lifestyle === "comfortable" && <Icon name="check" />}
              </button>

              <button
                type="button"
                className={lifestyle === "affluent" ? "is-selected" : ""}
                onClick={() => {
                  setLifestyle("affluent");
                  setMonthlyExpenseInRetirement(38000000);
                }}
              >
                <span><Icon name="compass" /></span>
                <strong>Thảnh thơi & Khám phá</strong>
                <small>Du lịch quốc tế hàng năm, viện dưỡng lão hoặc dịch vụ điều dưỡng riêng, chăm sóc thể thao.</small>
                {lifestyle === "affluent" && <Icon name="check" />}
              </button>
            </div>

            <div className="goal-spending-field">
              <Input
                label="Mức chi tiêu dự kiến mỗi tháng (theo thời giá hiện tại)"
                type="text"
                inputMode="numeric"
                value={new Intl.NumberFormat("vi-VN").format(monthlyExpenseInRetirement)}
                onChange={(v) => {
                  const clean = v.replace(/\D/g, "");
                  setMonthlyExpenseInRetirement(clean ? parseInt(clean, 10) : 0);
                }}
                suffix="VND / tháng"
                helper="Số tiền trung bình bạn muốn có mỗi tháng để chi trả toàn bộ chi phí cuộc sống tuổi già."
              />
              <div className="tooltip-wrap">
                <Tooltip content="Hệ thống tự động cộng dồn lạm phát tương lai theo năm vào công thức tính quỹ.">
                  <span className="field-help-icon"><Icon name="info" size="small" /></span>
                </Tooltip>
              </div>
            </div>
          </Card>

          {/* Section 3: Assumptions */}
          <Card className="goal-form-card">
            <header>
              <span className="form-section-index">03</span>
              <div>
                <h2>Giả định kinh tế & Tuổi thọ</h2>
                <p>Lãi suất và lạm phát được An Hưu tính toán chuẩn hóa dựa trên chu kỳ kinh tế vĩ mô để đảm bảo độ chính xác cao nhất.</p>
              </div>
            </header>

            <div className="assumptions-grid">
              <div className="assumption-standardized-card">
                <div className="assumption-card-header">
                  <span className="assumption-label">Lạm phát dự kiến bình quân</span>
                  <span className="standardized-badge">
                    <Icon name="circle-check" size="small" /> Hệ thống chuẩn hóa
                  </span>
                </div>
                <div className="assumption-card-value">
                  <strong>{inflationNum.toFixed(1)}%</strong>
                  <span>/năm</span>
                </div>
                <p className="assumption-card-desc">
                  Mức mục tiêu vĩ mô dài hạn được chuẩn hóa theo dữ liệu Tổng cục Thống kê (3.5% - 4.5%).
                </p>
              </div>

              <div className="assumption-standardized-card">
                <div className="assumption-card-header">
                  <span className="assumption-label">Lợi suất đầu tư kỳ vọng</span>
                  <span className="standardized-badge">
                    <Icon name="circle-check" size="small" /> Hệ thống chuẩn hóa
                  </span>
                </div>
                <div className="assumption-card-value">
                  <strong>{returnNum.toFixed(1)}%</strong>
                  <span>/năm</span>
                </div>
                <p className="assumption-card-desc">
                  Mô phỏng tự động theo danh mục phân bổ tài sản tăng trưởng cân bằng (Trái phiếu & Quỹ mở VN).
                </p>
              </div>

              <Input
                label="Kỳ vọng tuổi thọ trung bình"
                type="number"
                value={String(lifeExpectancy)}
                onChange={(v) => setLifeExpectancy(Number(v) || 80)}
                suffix="tuổi"
                helper={`Khoảng thời gian cần quỹ hưu trí bảo bọc: ~${retirementDuration} năm (từ ${targetAge} đến ${lifeExpectancy} tuổi).`}
              />

              <div className="assumption-note" style={{ gridColumn: "1 / -1" }}>
                <Icon name="info" />
                <p>
                  Để kế hoạch đạt độ chuẩn xác thực tế, thuật toán An Hưu tự động tính toán lạm phát tích lũy và điều chỉnh giá trị tiền tệ theo thời gian thực (Time Value of Money) thay vì để người dùng ước tính cảm tính.
                </p>
              </div>
            </div>
          </Card>

          {/* Timeline Card */}
          <Card className="goal-timeline-card">
            <header>
              <div>
                <h2>Lộ trình các mốc thời gian cuộc đời</h2>
                <p>Hình dung các chặng hành trình từ thời điểm hiện tại đến hết vòng đời.</p>
              </div>
              <Badge tone="soft">{yearsLeft} năm tích lũy</Badge>
            </header>

            <div className="goal-timeline">
              <div className="timeline-line" />

              <div className="age-marker marker-now">
                <span>{currentAge}</span>
                <strong>Hiện tại</strong>
                <small>{currentAge} tuổi</small>
              </div>

              <div className="age-marker marker-mid">
                <span>{Math.round((currentAge + targetAge) / 2)}</span>
                <strong>Giai đoạn giữa</strong>
                <small>Bứt phá tích lũy</small>
              </div>

              <div className="age-marker marker-target">
                <span>{targetAge}</span>
                <strong>Nghỉ hưu</strong>
                <small>{targetAge} tuổi ({yearsLeft} năm nữa)</small>
              </div>

              <div className="age-marker">
                <span>{lifeExpectancy}</span>
                <strong>Tuổi thọ kỳ vọng</strong>
                <small>{lifeExpectancy} tuổi ({retirementDuration} năm hưởng hưu)</small>
              </div>
            </div>

            <footer>
              <Icon name="info" size="small" />
              <span>Giai đoạn hưởng hưu kéo dài {retirementDuration} năm đòi hỏi dòng tiền bảo đảm liên tục không bị gián đoạn.</span>
            </footer>
          </Card>
        </motion.div>

        {/* Right Sticky Column: Summary Card */}
        <motion.aside
          className="goal-summary-column"
          aria-label="Tóm tắt mục tiêu"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
        >
          <Card className="goal-summary-card">
            <Badge tone="soft">TỔNG HỢP MỤC TIÊU</Badge>

            <div className="goal-summary-main">
              <span>QUỸ NGHỈ HƯU CẦN ĐẠT</span>
              <strong>{Math.round(estimatedTargetFund / 1000000000 * 10) / 10}</strong>
              <p>Tỷ đồng (tương đương <b>{formatVND(estimatedTargetFund)}</b>)</p>
            </div>

            <div className="goal-summary-stats">
              <div>
                <span>Tuổi bắt đầu nghỉ:</span>
                <strong>{targetAge} tuổi</strong>
              </div>
              <div>
                <span>Thời gian còn lại:</span>
                <strong>{yearsLeft} năm</strong>
              </div>
              <div>
                <span>Số năm hưởng hưu:</span>
                <strong>{retirementDuration} năm</strong>
              </div>
              <div>
                <span>Mức chi tiêu/tháng:</span>
                <strong>{formatVND(monthlyExpenseInRetirement)}</strong>
              </div>
            </div>

            <div className="goal-estimate">
              <span>Mức tích lũy khuyến nghị:</span>
              <strong>{formatVND(estimatedMonthlySave)} / tháng</strong>
              <small>
                Tính theo lạm phát {inflationNum}%, lợi suất {returnNum}% và tài sản hiện có.
                {returnNum === 0 && " (Lưu ý: lợi suất 0% làm tăng mức tích lũy cần thiết.)"}
              </small>
            </div>

            {validationError && <Alert tone="danger" title="Thông tin chưa hợp lệ">{validationError}</Alert>}

            <Button
              variant="secondary"
              size="medium"
              onClick={handleSaveGoal}
              className="goal-save-btn"
              loading={saveStatus === "saving"}
            >
              <Icon name="check" size="small" /> Lưu mục tiêu
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={handleProceedToPlan}
            >
              Xem kế hoạch hành động chi tiết <Icon name="arrow-right" />
            </Button>
          </Card>
        </motion.aside>
      </div>
    </>
  );
}
