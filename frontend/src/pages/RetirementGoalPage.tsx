import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon, IconButton, Input, Tooltip, useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { formatVNDCurrency } from "../services/retirement";
import { fetchUserAssumptions } from "../services/assumptions";
import { type PlanReport } from "../services/plans";
import { useI18n } from "../i18n";

const formatVND = (num: number) => new Intl.NumberFormat("vi-VN").format(num) + " ₫";

export default function RetirementGoalPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile, v2Profile, updateProfileLocal, updateProfileV2, saveStatus } = useFinancialProfile();
  const { activePlan, currentVersion, fetchPlanReport } = useRetirementPlan();

  const [report, setReport] = useState<PlanReport | null>(null);

  // Check valid age from profile
  const hasValidProfileAge = Number.isFinite(profile.personal.age) && profile.personal.age >= 18 && profile.personal.age <= 74;
  const [currentAge, setCurrentAge] = useState<number>(hasValidProfileAge ? profile.personal.age : 0);

  // Target retirement age
  const [targetAge, setTargetAge] = useState<number>(
    profile.goal.targetRetireAge >= 18
      ? profile.goal.targetRetireAge
      : Math.max(60, hasValidProfileAge ? profile.personal.age + 5 : 60)
  );

  const [lifestyle, setLifestyle] = useState<"standard" | "comfortable" | "affluent">(profile.goal.lifestyle || "comfortable");

  // Monthly expense in retirement
  const currentTotalExpense = profile.expenses.essentialExpense + profile.expenses.lifestyleExpense;
  const initialExpense = profile.goal.monthlyExpenseInRetirement > 0
    ? profile.goal.monthlyExpenseInRetirement
    : currentTotalExpense;
  const [monthlyExpenseInRetirement, setMonthlyExpenseInRetirement] = useState<number>(initialExpense);

  // Macro assumptions
  const [inflationNum, setInflationNum] = useState<number>(profile.goal.inflationRate > 0 ? profile.goal.inflationRate : 0);
  const [returnNum, setReturnNum] = useState<number>(profile.goal.investmentReturn > 0 ? profile.goal.investmentReturn : 0);
  const [assumptionsStatus, setAssumptionsStatus] = useState<"loading" | "published" | "unconfigured">("loading");

  const [lifeExpectancy, setLifeExpectancy] = useState<number>(
    profile.goal.lifeExpectancy > targetAge ? profile.goal.lifeExpectancy : Math.max(80, targetAge + 15)
  );
  const [saveNotice, setSaveNotice] = useState(false);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    fetchUserAssumptions()
      .then((res) => {
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          setAssumptionsStatus("published");
        } else {
          setAssumptionsStatus("unconfigured");
        }
      })
      .catch(() => {
        setAssumptionsStatus("unconfigured");
      });
  }, []);

  useEffect(() => {
    if (activePlan?.id) {
      fetchPlanReport(activePlan.id).then((res) => {
        if (res) {
          setReport(res);
          if (res.goal) {
            if (Number(res.goal.monthlyExpenseToday) > 0) {
              setMonthlyExpenseInRetirement(Number(res.goal.monthlyExpenseToday));
            }
          }
        }
      });
    }
  }, [activePlan?.id, activePlan?.currentVersionId]);

  const yearsLeft = Math.max(0, targetAge - (currentAge || 18));
  const retirementDuration = Math.max(0, lifeExpectancy - targetAge);

  const planSummary = report?.version?.preview?.calculation?.summary ?? currentVersion?.preview?.calculation?.summary;
  const estimatedTargetFund = planSummary ? Number(planSummary.atRetirement.requiredFund) : 0;
  const estimatedMonthlySave = planSummary?.requiredConstantMonthlyContribution
    ? Number(planSummary.requiredConstantMonthlyContribution)
    : profile.plan.monthlySavings;

  const handleSaveGoal = async () => {
    if (currentAge < 18 || currentAge > 74) {
      const err = language === "en"
        ? "Current age is invalid (must be between 18 and 74). Please check again."
        : "Tuổi hiện tại chưa hợp lệ (phải từ 18 đến 74 tuổi). Vui lòng kiểm tra lại.";
      setValidationError(err);
      notify.error(language === "en" ? "Invalid Information" : "Thông tin chưa hợp lệ", err);
      return false;
    }
    if (targetAge <= currentAge || targetAge > 75) {
      const err = language === "en"
        ? "Target retirement age must be greater than current age and not exceed 75."
        : "Tuổi nghỉ hưu mục tiêu phải lớn hơn tuổi hiện tại và không vượt quá 75.";
      setValidationError(err);
      notify.error(language === "en" ? "Invalid Information" : "Thông tin chưa hợp lệ", err);
      return false;
    }
    if (lifeExpectancy <= targetAge || lifeExpectancy > 110) {
      const err = language === "en"
        ? "Life expectancy must be greater than retirement age and not exceed 110."
        : "Tuổi thọ kỳ vọng phải lớn hơn tuổi nghỉ hưu và không vượt quá 110.";
      setValidationError(err);
      notify.error(language === "en" ? "Invalid Information" : "Thông tin chưa hợp lệ", err);
      return false;
    }
    if (monthlyExpenseInRetirement <= 0) {
      const err = language === "en"
        ? "Projected monthly retirement expense must be greater than 0."
        : "Mức chi tiêu dự kiến mỗi tháng khi nghỉ hưu phải lớn hơn 0.";
      setValidationError(err);
      notify.error(language === "en" ? "Invalid Information" : "Thông tin chưa hợp lệ", err);
      return false;
    }
    setValidationError("");

    // Sync retirement month into v2 profile
    const birthMonthStr = v2Profile?.personal.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value : null;
    const birthYear = birthMonthStr
      ? parseInt(birthMonthStr.slice(0, 4), 10)
      : new Date().getFullYear() - currentAge;
    const computedRetireMonth = `${birthYear + targetAge}-12`;

    if (v2Profile && currentAge !== profile.personal.age) {
      setValidationError(language === "en" ? "Update your birth month in Financial Profile before changing your age." : "Hãy cập nhật tháng sinh trong Hồ sơ tài chính nếu tuổi hiện tại chưa đúng.");
      return false;
    }
    // Persist only the field covered by the profile contract. Goal assumptions
    // remain a session preview until the user saves a plan version.
    const retirementMonth = `${birthYear + targetAge}-${birthMonthStr?.slice(5, 7) || "12"}`;
    if (v2Profile) {
      const saved = await updateProfileV2({
        personal: { ...v2Profile.personal, desiredRetirementMonth: { status: "KNOWN", value: retirementMonth } },
      });
      if (!saved) {
        setValidationError(language === "en" ? "Could not save retirement date. Your inputs are unchanged; please retry." : "Chưa lưu được thời điểm nghỉ hưu. Dữ liệu nhập vẫn được giữ; hãy thử lại.");
        return false;
      }
    }
    updateProfileLocal({
      personal: { ...profile.personal, age: currentAge },
      goal: { ...profile.goal, targetRetireAge: targetAge, lifeExpectancy, lifestyle, monthlyExpenseInRetirement, inflationRate: inflationNum, investmentReturn: returnNum },
    });

    setSaveNotice(true);
    notify.info(
      language === "en" ? "Ready to preview" : "Đã chuẩn bị đầu vào xem trước",
      language === "en" ? "Save a plan version on the next screen to keep these assumptions in your account." : "Chi tiêu và tuổi thọ đang dùng để thử trong phiên này. Hãy lưu phiên bản ở trang Kế hoạch để giữ các giả định trong tài khoản."
    );
    setTimeout(() => setSaveNotice(false), 4000);
    return true;
  };

  const handleProceedToPlan = async () => {
    if (await handleSaveGoal()) navigate("/user/plan");
  };

  return (
    <>
      <div className="retirement-page-header">
        <div className="retirement-header-main">
          <div className="header-status-badge is-goal">
            <Icon name="target" size="small" />
            <span>{language === "en" ? "INDEPENDENT RETIREMENT GOAL" : "MỤC TIÊU HƯU TRÍ ĐỘC LẬP"}</span>
          </div>
          <h1>{t("goal.page_title")}</h1>
          <p>{t("goal.page_subtitle")}</p>
        </div>

        <div className="header-quick-stats">
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Target Retirement Age" : "Tuổi nghỉ hưu mục tiêu"}</span>
            <span className="stat-value">{targetAge} {language === "en" ? "years" : "tuổi"}</span>
          </div>
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Retirement Duration" : "Thời gian hưu dự kiến"}</span>
            <span className="stat-value">{retirementDuration} {language === "en" ? "years" : "năm"}</span>
          </div>
        </div>
      </div>

      {!hasValidProfileAge && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <Alert
            tone="warning"
            title={language === "en" ? "Profile missing age information" : "Hồ sơ tài chính chưa có thông tin tuổi"}
          >
            {language === "en" ? (
              <>
                Your current age is not declared. Please enter your age below (18 to 74) for accurate calculation, or{" "}
                <Link to="/onboarding" style={{ textDecoration: "underline", fontWeight: 600 }}>
                  complete the initial survey
                </Link>.
              </>
            ) : (
              <>
                Bạn chưa khai báo tuổi hiện tại trong hồ sơ tài chính. Vui lòng nhập số tuổi hiện tại bên dưới (18 đến 74 tuổi) để thuật toán tính toán chính xác, hoặc{" "}
                <Link to="/onboarding" style={{ textDecoration: "underline", fontWeight: 600 }}>
                  hoàn thành bảng khảo sát ban đầu
                </Link>.
              </>
            )}
          </Alert>
        </div>
      )}

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
                <h2>{language === "en" ? "Desired Retirement Age Milestones" : "Mốc tuổi nghỉ hưu mong muốn"}</h2>
                <p>{language === "en" ? "Adjust current age and the point you want to stop full-time work." : "Điều chỉnh tuổi hiện tại và thời điểm bạn muốn ngừng làm việc toàn thời gian."}</p>
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
                    <span className="age-card-title">{language === "en" ? "Your Current Age" : "Tuổi hiện tại của bạn"}</span>
                  </div>
                  <span className="age-card-badge">{language === "en" ? "Starting Point" : "Mốc bắt đầu"}</span>
                </div>

                <div className="age-stepper-cluster">
                  <button
                    type="button"
                    className="age-stepper-btn"
                    aria-label={language === "en" ? "Decrease age by 1" : "Giảm 1 tuổi"}
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
                      aria-label={language === "en" ? "Enter your current age" : "Nhập tuổi hiện tại của bạn"}
                      title={language === "en" ? "Click to enter age directly" : "Bấm để nhập số tuổi trực tiếp"}
                    />
                    <span className="age-hero-unit">{language === "en" ? "years" : "tuổi"}</span>
                  </div>

                  <button
                    type="button"
                    className="age-stepper-btn"
                    aria-label={language === "en" ? "Increase age by 1" : "Tăng 1 tuổi"}
                    onClick={() => setCurrentAge(Math.min(targetAge - 1, currentAge + 1))}
                  >
                    <Icon name="chevron-right" />
                  </button>
                </div>

                <div className="age-card-footer-pill">
                  <Icon name="info" size="small" />
                  <span>{language === "en" ? "Estimated birth year:" : "Năm sinh ước tính:"} <strong>{new Date().getFullYear() - currentAge}</strong></span>
                </div>
              </div>

              {/* Card 2: Tuổi dự kiến nghỉ hưu */}
              <div className="age-control-card is-highlight">
                <div className="age-card-header">
                  <div className="age-card-title-group">
                    <span className="age-card-icon-pill">
                      <Icon name="target" size="small" />
                    </span>
                    <span className="age-card-title">{language === "en" ? "Target Retirement Age" : "Tuổi dự kiến nghỉ hưu"}</span>
                  </div>
                  <span className="age-card-badge is-highlight">{language === "en" ? "Target" : "Mục tiêu"}</span>
                </div>

                <div className="age-stepper-cluster">
                  <button
                    type="button"
                    className="age-stepper-btn"
                    aria-label={language === "en" ? "Decrease retirement age" : "Giảm 1 tuổi hưu"}
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
                      aria-label={language === "en" ? "Enter target retirement age" : "Nhập tuổi dự kiến nghỉ hưu"}
                      title={language === "en" ? "Click to enter age directly" : "Bấm để nhập số tuổi trực tiếp"}
                    />
                    <span className="age-hero-unit">{language === "en" ? "years" : "tuổi"}</span>
                  </div>

                  <button
                    type="button"
                    className="age-stepper-btn"
                    aria-label={language === "en" ? "Increase retirement age" : "Tăng 1 tuổi hưu"}
                    onClick={() => setTargetAge(Math.min(80, targetAge + 1))}
                  >
                    <Icon name="chevron-right" />
                  </button>
                </div>

                <div className="age-card-footer-pill is-highlight">
                  <Icon name="target" size="small" />
                  <span>
                    {language === "en"
                      ? `Accumulation duration: ${yearsLeft} years (retiring in ${new Date().getFullYear() + yearsLeft})`
                      : `Thời gian tích lũy: ${yearsLeft} năm (về hưu năm ${new Date().getFullYear() + yearsLeft})`}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Section 2: Lifestyle Choice */}
          <Card className="goal-form-card">
            <header>
              <span className="form-section-index">02</span>
              <div>
                <h2>{language === "en" ? "Retirement Lifestyle & Spending" : "Mức sống & Chi tiêu khi nghỉ hưu"}</h2>
                <p>{language === "en" ? "Choose living standards aligned with your vision of life in retirement." : "Lựa chọn tiêu chuẩn sinh hoạt phù hợp với định hướng cuộc sống tuổi hưu của bạn."}</p>
              </div>
            </header>

            <div className="lifestyle-options">
              {(() => {
                const baseExp = currentTotalExpense > 0 ? currentTotalExpense : 20000000;
                return (
                  <>
                    <button
                      type="button"
                      className={lifestyle === "standard" ? "is-selected" : ""} aria-pressed={lifestyle === "standard"}
                      onClick={() => {
                        setLifestyle("standard");
                        setMonthlyExpenseInRetirement(Math.round((baseExp * 0.75) / 1000000) * 1000000);
                      }}
                    >
                      <span><Icon name="home" /></span>
                      <strong>{language === "en" ? "Frugal & Modest" : "Tiết kiệm & Giản dị"}</strong>
                      <small>
                        {language === "en"
                          ? "Approx 75% of current expenses. Essential living, peaceful family life in suburban areas."
                          : "Khoảng 75% chi tiêu hiện tại. Ăn uống cơ bản, sinh hoạt gia đình tại vùng ngoại ô."}
                      </small>
                      {lifestyle === "standard" && <Icon name="check" />}
                    </button>

                    <button
                      type="button"
                      className={lifestyle === "comfortable" ? "is-selected" : ""} aria-pressed={lifestyle === "comfortable"}
                      onClick={() => {
                        setLifestyle("comfortable");
                        setMonthlyExpenseInRetirement(baseExp);
                      }}
                    >
                      <span><Icon name="sparkles" /></span>
                      <strong>{language === "en" ? "Comfortable & Independent" : "Thoải mái & Độc lập"}</strong>
                      <small>
                        {language === "en"
                          ? "Maintain 100% current living standards, domestic travel, proactive healthcare."
                          : "Duy trì 100% mức sống hiện tại, du lịch trong nước, chăm sóc sức khỏe chủ động."}
                      </small>
                      {lifestyle === "comfortable" && <Icon name="check" />}
                    </button>

                    <button
                      type="button"
                      className={lifestyle === "affluent" ? "is-selected" : ""} aria-pressed={lifestyle === "affluent"}
                      onClick={() => {
                        setLifestyle("affluent");
                        setMonthlyExpenseInRetirement(Math.round((baseExp * 1.4) / 1000000) * 1000000);
                      }}
                    >
                      <span><Icon name="compass" /></span>
                      <strong>{language === "en" ? "Abundant & Exploring" : "Thảnh thơi & Khám phá"}</strong>
                      <small>
                        {language === "en"
                          ? "Approx 140% of current expenses. Frequent vacations, premium wellness and leisure."
                          : "Khoảng 140% chi tiêu hiện tại. Du lịch thường xuyên, điều dưỡng tiện nghi cao cấp."}
                      </small>
                      {lifestyle === "affluent" && <Icon name="check" />}
                    </button>
                  </>
                );
              })()}
            </div>

            <div className="goal-spending-field">
              <Input
                label={language === "en" ? "Projected monthly retirement expense (at today's price)" : "Mức chi tiêu dự kiến mỗi tháng (theo thời giá hiện tại)"}
                labelAction={
                  <Tooltip content={language === "en" ? "System automatically compounds annual future inflation into fund calculations." : "Hệ thống tự động cộng dồn lạm phát tương lai theo năm vào công thức tính quỹ."}>
                    <span
                      className="field-help-icon"
                      style={{
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "rgba(5, 38, 89, 0.08)",
                        color: "var(--color-primary-700)",
                      }}
                      aria-label="Thông tin bổ sung về lạm phát chi tiêu"
                    >
                      <Icon name="info" size="small" />
                    </span>
                  </Tooltip>
                }
                type="text"
                inputMode="numeric"
                value={new Intl.NumberFormat("vi-VN").format(monthlyExpenseInRetirement)}
                onChange={(v) => {
                  const clean = v.replace(/\D/g, "");
                  setMonthlyExpenseInRetirement(clean ? parseInt(clean, 10) : 0);
                }}
                suffix={language === "en" ? "VND / month" : "đ / tháng"}
                helper={language === "en" ? "Average monthly amount desired to cover all living costs in old age." : "Số tiền trung bình bạn muốn có mỗi tháng để chi trả toàn bộ chi phí cuộc sống tuổi già."}
              />
            </div>

            <p className="flow-note">{language === "en" ? "Future purchasing power is calculated using the published annual assumption series on the Plan screen." : "Chi tiêu tương lai được tính theo chuỗi giả định từng năm tại trang Kế hoạch; không dùng tỷ lệ 0% thay cho dữ liệu chưa tải."}</p>

          </Card>

          {/* Section 3: Assumptions */}
          <Card className="goal-form-card">
            <header>
              <span className="form-section-index">03</span>
              <div>
                <h2>{language === "en" ? "Economic Assumptions & Longevity" : "Giả định kinh tế & Tuổi thọ"}</h2>
                <p>{language === "en" ? "Foundational metrics to ensure financial projections reflect long-term reality." : "Các chỉ số nền tảng giúp kế hoạch tài chính phản ánh đúng thực tế theo thời gian."}</p>
              </div>
            </header>

            {assumptionsStatus === "unconfigured" && (
              <div style={{ margin: "var(--space-4) 0" }}>
                <Alert
                  tone="info"
                  title={language === "en" ? "No official macro assumption series published" : "Chưa có chuỗi giả định vĩ mô được phê duyệt"}
                >
                  {language === "en"
                    ? "The server has not yet published an official annual macroeconomic assumption series (T03). The rates below are for temporary reference."
                    : "Máy chủ chưa công bố chuỗi giả định kinh tế vĩ mô chính thức theo năm (T03). Các tỷ lệ bên dưới đang ở trạng thái tham chiếu tạm thời."}
                </Alert>
              </div>
            )}

            <div className="assumptions-container">
              {/* 2 Cards: Lạm phát & Lợi suất */}
              <div className="assumptions-cards-grid">
                <div className="assumption-metric-box">
                  <div className="assumption-metric-header">
                    <span className="assumption-metric-label">{language === "en" ? "Long-Term Inflation" : "Lạm phát dài hạn"}</span>
                    <span className="assumption-tag-badge">
                      {assumptionsStatus === "published"
                        ? (language === "en" ? "Macro Standard" : "Chuẩn hóa vĩ mô")
                        : (language === "en" ? "Reference Benchmark" : "Giả định tham chiếu")}
                    </span>
                  </div>
                  <div className="assumption-metric-value">
                    <span className="rate-num">{language === "en" ? "By year" : "Theo từng năm"}</span>
                    <span className="rate-unit">{language === "en" ? "/ year" : "/ năm"}</span>
                  </div>
                  <p className="assumption-metric-desc">
                    {language === "en"
                      ? "Uses the published annual assumptions; see the Plan screen for the calculation."
                      : "Dùng chuỗi giả định đã công bố; xem kết quả tính tại trang Kế hoạch."}
                  </p>
                </div>

                <div className="assumption-metric-box">
                  <div className="assumption-metric-header">
                    <span className="assumption-metric-label">{language === "en" ? "Expected Investment Return" : "Lợi suất đầu tư kỳ vọng"}</span>
                    <span className="assumption-tag-badge is-green">
                      {assumptionsStatus === "published"
                        ? (language === "en" ? "Balanced Portfolio" : "Danh mục cân bằng")
                        : (language === "en" ? "Prudent Reference" : "Tham chiếu thận trọng")}
                    </span>
                  </div>
                  <div className="assumption-metric-value">
                    <span className="rate-num rate-green">{language === "en" ? "By portfolio" : "Theo danh mục"}</span>
                    <span className="rate-unit">{language === "en" ? "/ year" : "/ năm"}</span>
                  </div>
                  <p className="assumption-metric-desc">
                    {language === "en"
                      ? "Simulated on a balanced growth portfolio (Bonds & Open-Ended Mutual Funds in VN)."
                      : "Mô phỏng dựa trên danh mục đầu tư tăng trưởng cân bằng (Trái phiếu & Quỹ mở VN)."}
                  </p>
                </div>
              </div>

              {/* Life Expectancy Row / Card */}
              <div className="life-expectancy-card">
                <div className="life-expectancy-input-side">
                  <Input
                    label={language === "en" ? "Average Life Expectancy Expectation" : "Kỳ vọng tuổi thọ trung bình"}
                    type="number"
                    value={String(lifeExpectancy)}
                    onChange={(v) => setLifeExpectancy(Number(v) || 80)}
                    suffix={language === "en" ? "years" : "tuổi"}
                    helper={language === "en"
                      ? `Projected retirement income stream needed across ${retirementDuration} years.`
                      : `Dự kiến bạn sẽ cần nguồn thu nhập hưu trí trong suốt ${retirementDuration} năm.`}
                  />
                </div>
                <div className="life-expectancy-pill-metric">
                  <div className="pill-metric-icon">
                    <Icon name="compass" />
                  </div>
                  <div className="pill-metric-content">
                    <span className="pill-metric-label">{language === "en" ? "Retirement Duration" : "Thời gian hưởng hưu"}</span>
                    <div className="pill-metric-val">
                      <strong>{retirementDuration}</strong> <span>{language === "en" ? "years" : "năm"}</span>
                    </div>
                    <small>
                      {language === "en"
                        ? `From age ${targetAge} to age ${lifeExpectancy}`
                        : `Từ tuổi ${targetAge} đến tuổi ${lifeExpectancy}`}
                    </small>
                  </div>
                </div>
              </div>

              {/* Info Note */}
              <div className="assumption-note-banner">
                <span className="note-banner-icon"><Icon name="info" /></span>
                <p>
                  {language === "en"
                    ? "An Huu algorithms automatically compound annual inflation to safeguard real purchasing power throughout retirement."
                    : "Thuật toán An Hưu tự động tính toán lạm phát tích lũy theo từng năm nhằm đảm bảo sức mua thực tế của dòng tiền trong suốt giai đoạn hưu trí."}
                </p>
              </div>
            </div>
          </Card>

          {/* Timeline Card */}
          <Card className="goal-timeline-card">
            <header>
              <div>
                <h2>{language === "en" ? "Life Milestones Trajectory" : "Lộ trình các mốc thời gian cuộc đời"}</h2>
                <p>{language === "en" ? "Visualize journey stages from current age through end of life." : "Hình dung các chặng hành trình từ thời điểm hiện tại đến hết vòng đời."}</p>
              </div>
              <Badge tone="soft">{yearsLeft} {language === "en" ? "years accumulating" : "năm tích lũy"}</Badge>
            </header>

            <div className="goal-timeline">
              <div className="timeline-line" />

              <div className="age-marker marker-now">
                <span>{currentAge}</span>
                <strong>{language === "en" ? "Now" : "Hiện tại"}</strong>
                <small>{currentAge} {language === "en" ? "years old" : "tuổi"}</small>
              </div>

              <div className="age-marker marker-mid">
                <span>{Math.round((currentAge + targetAge) / 2)}</span>
                <strong>{language === "en" ? "Midpoint" : "Giai đoạn giữa"}</strong>
                <small>{language === "en" ? "Accelerate accumulation" : "Bứt phá tích lũy"}</small>
              </div>

              <div className="age-marker marker-target">
                <span>{targetAge}</span>
                <strong>{language === "en" ? "Retirement" : "Nghỉ hưu"}</strong>
                <small>{targetAge} {language === "en" ? "years old" : "tuổi"} ({yearsLeft} {language === "en" ? "years to go" : "năm nữa"})</small>
              </div>

              <div className="age-marker">
                <span>{lifeExpectancy}</span>
                <strong>{language === "en" ? "Life Expectancy" : "Tuổi thọ kỳ vọng"}</strong>
                <small>{lifeExpectancy} {language === "en" ? "years old" : "tuổi"} ({retirementDuration} {language === "en" ? "years in retirement" : "năm hưởng hưu"})</small>
              </div>
            </div>

            <footer>
              <Icon name="info" size="small" />
              <span>
                {language === "en"
                  ? `Retirement stage lasting ${retirementDuration} years requires uninterrupted cashflow security.`
                  : `Giai đoạn hưởng hưu kéo dài ${retirementDuration} năm đòi hỏi dòng tiền bảo đảm liên tục không bị gián đoạn.`}
              </span>
            </footer>
          </Card>
        </motion.div>

        {/* Right Sticky Column: Summary Card */}
        <motion.aside
          className="goal-summary-column"
          aria-label={language === "en" ? "Goals summary" : "Tóm tắt mục tiêu"}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
        >
          <Card className="goal-summary-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <Badge tone="soft">{language === "en" ? "GOALS SUMMARY" : "TỔNG HỢP MỤC TIÊU"}</Badge>
              {report?.version && <Badge tone="info">v{report.version.version}</Badge>}
            </div>

            {report?.hypothetical && (
              <div style={{ marginBottom: "12px" }}>
                <Badge tone="warning">{language === "en" ? "Plan with personal assumptions" : "Kế hoạch có giả định cá nhân"}</Badge>
              </div>
            )}

            <div className="goal-summary-main">
              <span>{language === "en" ? "TARGET RETIREMENT FUND (K)" : "QUỸ NGHỈ HƯU CẦN ĐẠT (K)"}</span>
              {estimatedTargetFund > 0 ? (
                <>
                  <strong className="font-mono">{Math.round(estimatedTargetFund / 1000000000 * 10) / 10}</strong>
                  <p>
                    {language === "en" ? "Billion VND (equivalent to " : "Tỷ đồng (tương đương "}
                    <b className="font-mono">{formatVND(estimatedTargetFund)}</b>)
                  </p>
                </>
              ) : (
                <>
                  <strong style={{ fontSize: "20px" }}>{language === "en" ? "Awaiting Plan" : "Chờ kế hoạch"}</strong>
                  <p>
                    {language === "en"
                      ? "Target fund will be accurately quantified upon running simulation on Plan page."
                      : "Số tiền mục tiêu sẽ được lượng hóa chính xác khi chạy dự phóng tại trang Kế hoạch."}
                  </p>
                </>
              )}
            </div>

            <div className="goal-summary-stats">
              <div>
                <span>{language === "en" ? "Start Retirement Age:" : "Tuổi bắt đầu nghỉ:"}</span>
                <strong className="font-mono">{targetAge} {language === "en" ? "years" : "tuổi"}</strong>
              </div>
              <div>
                <span>{language === "en" ? "Time Remaining:" : "Thời gian còn lại:"}</span>
                <strong className="font-mono">{yearsLeft} {language === "en" ? "years" : "năm"}</strong>
              </div>
              <div>
                <span>{language === "en" ? "Retirement Duration:" : "Số năm hưởng hưu:"}</span>
                <strong className="font-mono">{retirementDuration} {language === "en" ? "years" : "năm"}</strong>
              </div>
              <div>
                <span>{language === "en" ? "Today's Expense (PV):" : "Chi tiêu hôm nay (PV):"}</span>
                <strong className="font-mono">{formatVND(monthlyExpenseInRetirement)}</strong>
              </div>
              <div>
                <span>{language === "en" ? "Retirement Expense (FV):" : "Chi tiêu lúc hưu (FV):"}</span>
                <strong className="font-mono">
                  {planSummary?.futureMonthlyExpense ? formatVND(Number(planSummary.futureMonthlyExpense)) : (language === "en" ? "Awaiting projection" : "Chờ dự phóng")}
                </strong>
              </div>
            </div>

            <div className="goal-estimate">
              <span>{language === "en" ? "Current monthly surplus:" : "Dòng tiền có thể tích lũy hiện tại:"}</span>
              <strong className="font-mono">{formatVND(profile.plan.monthlySavings)} {language === "en" ? "/ month" : "/ tháng"}</strong>
              <small>
                {planSummary
                  ? (language === "en" ? `Accurately calculated from server as of valuation date ${planSummary.valuationDate}.` : `Tính toán chuẩn xác từ máy chủ theo ngày định giá ${planSummary.valuationDate}.`)
                  : (language === "en" ? "Savings rate will be optimized based on approved macroeconomic assumptions." : "Mức tích lũy sẽ được tính toán tối ưu theo chuỗi giả định kinh tế vĩ mô được duyệt.")}
              </small>
            </div>

            <p className="goal-draft-note">{language === "en" ? "These inputs are for this session. Save a version on the Plan screen to keep your goal; applying it requires confirmation." : "Đầu vào thử trong phiên. Lưu phiên bản tại trang Kế hoạch để giữ mục tiêu; chỉ trở thành kế hoạch chính thức sau khi bạn xác nhận áp dụng."}</p>
            {validationError && <Alert tone="danger" title={language === "en" ? "Invalid Information" : "Thông tin chưa hợp lệ"}>{validationError}</Alert>}

            <div className="goal-summary-actions">
              <Button
                variant="secondary"
                size="medium"
                onClick={handleSaveGoal}
                className="goal-save-btn"
                loading={saveStatus === "saving"}
              >
                <Icon name="check" size="small" /> {language === "en" ? "Use for this preview" : "Giữ để thử trong phiên"}
              </Button>
              <Button
                variant="primary"
                size="large"
                onClick={handleProceedToPlan}
                className="goal-proceed-btn"
                disabled={saveStatus === "saving"}
              >
                {language === "en" ? "Preview retirement plan" : "Xem trước kế hoạch"} <Icon name="arrow-right" />
              </Button>
            </div>
          </Card>
        </motion.aside>
      </div>
    </>
  );
}
