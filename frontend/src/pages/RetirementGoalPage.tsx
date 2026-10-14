import PlanSyncStatus from "../components/PlanSyncStatus";
import { profileDisplayStatus } from "../services/profileDisplay";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon, Input, Tooltip } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { fetchUserAssumptions } from "../services/assumptions";
import { useI18n } from "../i18n";
import { formatNumberWithDots, formatVND } from "../utils/currency";

export default function RetirementGoalPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { profile, v2Profile, updateProfileV2, saveStatus, saveError } = useFinancialProfile();
  const cashflowKnown = profileDisplayStatus(v2Profile).surplus;
  const { synchronization, currentVersion, loadingPlans, plansError, refreshPlans, draftSelection, updateDraft } = useRetirementPlan();

  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const fields = useRef<HTMLFieldSetElement>(null);

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
  const [assumptionsStatus, setAssumptionsStatus] = useState<"loading" | "published" | "unconfigured" | "error">("loading");
  const [assumptionsAttempt, setAssumptionsAttempt] = useState(0);

  const [lifeExpectancy, setLifeExpectancy] = useState<number>(
    profile.goal.lifeExpectancy > targetAge ? profile.goal.lifeExpectancy : Math.max(80, targetAge + 15)
  );
  const edited = useRef(false);
  useEffect(() => {
    if (loadingPlans || edited.current) return;
    const selection = { ...currentVersion?.preview.selection, ...draftSelection };
    const birth = v2Profile?.personal.birthMonth;
    const birthYear = birth?.status === "KNOWN" ? Number(birth.value.slice(0, 4)) : null;
    const retirementMonth = draftSelection?.whatIf?.retirementMonth ?? (v2Profile?.personal.desiredRetirementMonth.status === "KNOWN" ? v2Profile.personal.desiredRetirementMonth.value : selection.whatIf?.retirementMonth ?? currentVersion?.preview.calculation?.summary.retirementMonth);
    setCurrentAge(profile.personal.age);
    if (birthYear && retirementMonth) setTargetAge(Number(retirementMonth.slice(0, 4)) - birthYear);
    if (birthYear && selection.endMonth) setLifeExpectancy(Number(selection.endMonth.slice(0, 4)) - birthYear);
    if (selection.monthlyExpenseToday !== undefined) setMonthlyExpenseInRetirement(Number(selection.monthlyExpenseToday));
  }, [loadingPlans, currentVersion?.id, draftSelection, v2Profile?.personal.birthMonth, profile.personal.age]);
  const [preparedInput, setPreparedInput] = useState("");
  const [validationError, setValidationError] = useState("");
  const [validationField, setValidationField] = useState("");
  const inputKey = JSON.stringify([currentAge, targetAge, lifeExpectancy, lifestyle, monthlyExpenseInRetirement]);

  useEffect(() => { setValidationError(""); setValidationField(""); }, [inputKey]);

  useEffect(() => {
    let active = true;
    setAssumptionsStatus("loading");
    fetchUserAssumptions()
      .then((res) => {
        if (!active) return;
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          setAssumptionsStatus("published");
        } else {
          setAssumptionsStatus("unconfigured");
        }
      })
      .catch(() => {
        if (active) setAssumptionsStatus("error");
      });
    return () => { active = false; };
  }, [assumptionsAttempt]);

  const yearsLeft = Math.max(0, targetAge - (currentAge || 18));
  const retirementDuration = Math.max(0, lifeExpectancy - targetAge);

  const planSummary = synchronization.preview?.calculation?.summary;
  const estimatedTargetFund = planSummary?.atRetirement.requiredFund != null ? Number(planSummary.atRetirement.requiredFund) : null;
  const currentSurplus = profile.income.primaryIncome + profile.income.secondaryIncome - currentTotalExpense - (profile.debt.hasDebt ? profile.debt.monthlyDebtService : 0);
  const fail = (field: string, message: string, focus = true) => {
    setValidationField(field); setValidationError(message);
    if (focus) fields.current?.querySelector<HTMLInputElement>(field === 'expense' ? '.goal-spending-field input' : `#goal-${field}`)?.focus();
    return false;
  };

  const handleSaveGoal = async (automatic = false) => {
    if (loadingPlans || saving.current || saveStatus === "saving") return false;
    if (!Number.isInteger(currentAge) || currentAge < 18 || currentAge > 74) {
      const err = language === "en"
        ? "Current age must be a whole number between 18 and 74."
        : "Tuổi hiện tại phải là số nguyên từ 18 đến 74.";
      return fail('current-age', err, !automatic);
    }
    if (!Number.isInteger(targetAge) || targetAge < currentAge || targetAge > 75) {
      const err = language === "en"
        ? "Target retirement age must be a whole number from your current age up to 75."
        : "Tuổi nghỉ hưu mục tiêu phải là số nguyên từ tuổi hiện tại đến 75.";
      return fail('target-age', err, !automatic);
    }
    if (!Number.isInteger(lifeExpectancy) || lifeExpectancy <= targetAge || lifeExpectancy > 110) {
      const err = language === "en"
        ? "Plan end age must be a whole number above retirement age and no greater than 110."
        : "Tuổi kết thúc kế hoạch phải là số nguyên, lớn hơn tuổi nghỉ hưu và không vượt quá 110.";
      return fail('life-age', err, !automatic);
    }
    if (!Number.isSafeInteger(monthlyExpenseInRetirement) || monthlyExpenseInRetirement <= 0) {
      const err = language === "en"
        ? "Enter a positive whole VND amount within the supported numeric range."
        : "Nhập số tiền nguyên dương trong giới hạn số được hỗ trợ.";
      return fail('expense', err, !automatic);
    }
    setValidationError("");

    // Sync retirement month into v2 profile
    const birthMonthStr = v2Profile?.personal.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value : null;
    const birthYear = birthMonthStr
      ? parseInt(birthMonthStr.slice(0, 4), 10)
      : new Date().getFullYear() - currentAge;
    if (v2Profile && (!birthMonthStr || currentAge !== profile.personal.age)) {
      setValidationError(language === "en" ? "Update your birth month in Financial Profile first." : "Hãy cập nhật tháng sinh trong Hồ sơ tài chính trước khi tiếp tục.");
      return false;
    }
    // Persist only the field covered by the profile contract. Goal assumptions
    // remain a session preview until the user saves a plan version.
    const savedSelection = { ...currentVersion?.preview.selection, ...draftSelection };
    const savedRetirementMonth = savedSelection.whatIf?.retirementMonth ?? currentVersion?.preview.calculation?.summary.retirementMonth;
    const retirementMonth = savedRetirementMonth && Number(savedRetirementMonth.slice(0, 4)) - birthYear === targetAge
      ? savedRetirementMonth
      : targetAge === profile.goal.targetRetireAge && v2Profile?.personal.desiredRetirementMonth.status === "KNOWN"
        ? v2Profile.personal.desiredRetirementMonth.value
        : `${birthYear + targetAge}-${birthMonthStr?.slice(5, 7) || "12"}`;
    const endMonth = savedSelection.endMonth && Number(savedSelection.endMonth.slice(0, 4)) - birthYear === lifeExpectancy
      ? savedSelection.endMonth : `${birthYear + lifeExpectancy}-${birthMonthStr?.slice(5, 7) || "12"}`;
    saving.current = true; setIsSaving(true);
    try {
      if (v2Profile && (v2Profile.personal.desiredRetirementMonth.status !== "KNOWN" || v2Profile.personal.desiredRetirementMonth.value !== retirementMonth)) {
        const saved = await updateProfileV2({
          personal: { ...v2Profile.personal, desiredRetirementMonth: { status: "KNOWN", value: retirementMonth } },
        });
        if (!saved) {
          setValidationError(language === "en" ? "Could not save retirement date. Your inputs are unchanged; please retry." : "Chưa lưu được thời điểm nghỉ hưu. Dữ liệu nhập vẫn được giữ; hãy thử lại.");
          return false;
        }
      }
      updateDraft({
        monthlyExpenseToday: String(monthlyExpenseInRetirement),
        endMonth,
        whatIf: { ...currentVersion?.preview.selection.whatIf, ...draftSelection?.whatIf, retirementMonth: v2Profile ? undefined : retirementMonth },
      });

      setPreparedInput(inputKey);
      return true;
    } catch {
      setValidationError(language === "en" ? "Changes could not be saved. Keep this page open and try Preview again." : "Chưa lưu được thay đổi. Hãy giữ trang này và bấm Xem trước kế hoạch để thử lại.");
      return false;
    } finally { saving.current = false; setIsSaving(false); }
  };

  const latestSave = useRef(handleSaveGoal);
  latestSave.current = handleSaveGoal;
  const attemptedInput = useRef("");
  useEffect(() => {
    if (!edited.current || loadingPlans || isSaving || saveStatus === "saving" || preparedInput === inputKey || attemptedInput.current === inputKey) return;
    const timer = window.setTimeout(() => {
      attemptedInput.current = inputKey;
      void latestSave.current(true);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [inputKey, loadingPlans, isSaving, saveStatus, preparedInput]);

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

      {!hasValidProfileAge && !v2Profile && (
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
          <fieldset onChange={() => { edited.current = true; }} onClick={() => { edited.current = true; }} ref={fields} className="goal-edit-fields" disabled={loadingPlans}>
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
                    disabled={Boolean(v2Profile) || currentAge <= 18}
                    onClick={() => setCurrentAge(Math.max(18, currentAge - 1))}
                  >
                    <Icon name="chevron-left" />
                  </button>

                  <div className="age-number-display-wrap">
                    <input
                      type="number"
                      id="goal-current-age"
                      disabled={Boolean(v2Profile)}
                      aria-invalid={validationField === 'current-age'}
                      aria-describedby={validationField === 'current-age' ? 'goal-current-error' : undefined}
                      min={18}
                      max={74}
                      value={currentAge || ""}
                      onChange={(e) => setCurrentAge(Number(e.target.value))}
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
                    disabled={Boolean(v2Profile) || currentAge >= 74}
                    onClick={() => setCurrentAge(Math.min(74, Math.max(18, currentAge + 1)))}
                  >
                    <Icon name="chevron-right" />
                  </button>
                </div>

                {validationField === 'current-age' && <p id="goal-current-error" className="goal-field-error">{validationError}</p>}
                <div className="age-card-footer-pill">
                  <Icon name="info" size="small" />
                  <span>{language === "en" ? "Birth year:" : "Năm sinh:"} <strong>{v2Profile?.personal.birthMonth.status === "KNOWN" ? v2Profile.personal.birthMonth.value.slice(0, 4) : currentAge >= 18 ? `${new Date().getFullYear() - currentAge} (${language === "en" ? "estimate" : "ước tính"})` : "—"}</strong></span>
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
                    disabled={targetAge <= currentAge}
                    onClick={() => setTargetAge(Math.max(currentAge, targetAge - 1))}
                  >
                    <Icon name="chevron-left" />
                  </button>

                  <div className="age-number-display-wrap">
                    <input
                      type="number"
                      id="goal-target-age"
                      aria-invalid={validationField === 'target-age'}
                      aria-describedby={validationField === 'target-age' ? 'goal-target-error' : undefined}
                      min={currentAge}
                      max={75}
                      value={targetAge || ""}
                      onChange={(e) => setTargetAge(Number(e.target.value))}
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
                    disabled={targetAge >= 75}
                    onClick={() => setTargetAge(Math.min(75, Math.max(currentAge, targetAge + 1)))}
                  >
                    <Icon name="chevron-right" />
                  </button>
                </div>

                {validationField === 'target-age' && <p id="goal-target-error" className="goal-field-error">{validationError}</p>}
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
                const baseExp = currentTotalExpense;
                return (
                  <>
                    <button
                      type="button"
                      className={lifestyle === "standard" ? "is-selected" : ""} aria-pressed={lifestyle === "standard"}
                      disabled={baseExp <= 0}
                      onClick={() => {
                        setLifestyle("standard");
                        setMonthlyExpenseInRetirement(Math.round(baseExp * 0.75));
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
                      disabled={baseExp <= 0}
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
                      disabled={baseExp <= 0}
                      onClick={() => {
                        setLifestyle("affluent");
                        setMonthlyExpenseInRetirement(Math.round(baseExp * 1.4));
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

            {currentTotalExpense <= 0 && <p>{language === "en" ? "No current spending is available for these suggestions. Enter your desired expense below." : "Chưa có chi tiêu hiện tại để tính các mức gợi ý. Hãy nhập mức chi tiêu mong muốn bên dưới."}</p>}
            <div className="goal-spending-field">
              <Input
                label={language === "en" ? "Projected monthly retirement expense (at today's price)" : "Mức chi tiêu dự kiến mỗi tháng (theo thời giá hiện tại)"}
                labelAction={
                  <Tooltip content={language === "en" ? "System automatically compounds annual future inflation into fund calculations." : "Hệ thống tự động cộng dồn lạm phát tương lai theo năm vào công thức tính quỹ."}>
                    <button
                      type="button"
                      className="field-help-icon"
                      style={{
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                        border: 0,
                        borderRadius: "50%",
                        background: "rgba(5, 38, 89, 0.08)",
                        color: "var(--color-primary-700)",
                      }}
                      aria-label={language === "en" ? "About expense inflation" : "Thông tin bổ sung về lạm phát chi tiêu"}
                    >
                      <Icon name="info" size="small" />
                    </button>
                  </Tooltip>
                }
                type="text"
                inputMode="numeric"
                value={monthlyExpenseInRetirement ? formatNumberWithDots(monthlyExpenseInRetirement) : ""}
                error={validationField === 'expense' ? validationError : undefined}
                onChange={(v) => {
                  const clean = v.replace(/\D/g, "");
                  setMonthlyExpenseInRetirement(clean ? parseInt(clean, 10) : 0);
                }}
                suffix={language === "en" ? "VND / month" : "VND / tháng"}
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
                <h2>{language === "en" ? "Assumptions & Plan Horizon" : "Giả định & Thời hạn kế hoạch"}</h2>
                <p>{language === "en" ? "Foundational metrics to ensure financial projections reflect long-term reality." : "Các chỉ số nền tảng giúp kế hoạch tài chính phản ánh đúng thực tế theo thời gian."}</p>
              </div>
            </header>

            {assumptionsStatus === "loading" && <p role="status">{language === "en" ? "Loading assumptions…" : "Đang tải giả định…"}</p>}
            {assumptionsStatus === "error" && <Alert tone="warning" title={language === "en" ? "Could not load assumptions" : "Chưa tải được giả định"} action={<Button onClick={() => setAssumptionsAttempt(value => value + 1)}>{language === "en" ? "Retry assumptions" : "Tải lại giả định"}</Button>}>{language === "en" ? "Publication status could not be checked." : "Chưa kiểm tra được trạng thái công bố. Vui lòng thử lại."}</Alert>}
            {assumptionsStatus === "unconfigured" && (
              <div style={{ margin: "var(--space-4) 0" }}>
                <Alert
                  tone="info"
                  title={language === "en" ? "No official macro assumption series published" : "Chưa có chuỗi giả định vĩ mô được phê duyệt"}
                >
                  {language === "en"
                    ? "No annual assumptions are available. You can prepare inputs; projection requires a published series."
                    : "Chưa có chuỗi giả định theo năm. Bạn có thể chuẩn bị đầu vào; việc dự phóng cần chuỗi đã công bố."}
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
                        : (language === "en" ? "Not confirmed" : "Chưa xác nhận")}
                    </span>
                  </div>
                  <div className="assumption-metric-value">
                    <span className="rate-num">{language === "en" ? "By year" : "Theo từng năm"}</span>
                    <span className="rate-unit">{language === "en" ? "/ year" : "/ năm"}</span>
                  </div>
                  <p className="assumption-metric-desc">
                    {language === "en"
                      ? "Select a published annual assumption series on the Plan screen."
                      : "Chọn chuỗi giả định theo năm đã công bố tại trang Kế hoạch."}
                  </p>
                </div>

                <div className="assumption-metric-box">
                  <div className="assumption-metric-header">
                    <span className="assumption-metric-label">{language === "en" ? "Expected Investment Return" : "Lợi suất đầu tư kỳ vọng"}</span>
                    <span className="assumption-tag-badge is-green">
                      {assumptionsStatus === "published"
                        ? (language === "en" ? "Published assumptions" : "Có chuỗi công bố")
                        : (language === "en" ? "Not confirmed" : "Chưa xác nhận")}
                    </span>
                  </div>
                  <div className="assumption-metric-value">
                    <span className="rate-num rate-green">{language === "en" ? "By portfolio" : "Theo danh mục"}</span>
                    <span className="rate-unit">{language === "en" ? "/ year" : "/ năm"}</span>
                  </div>
                  <p className="assumption-metric-desc">
                    {language === "en"
                      ? "Depends on the portfolio and assumptions selected on the Plan screen."
                      : "Phụ thuộc danh mục và giả định được chọn tại trang Kế hoạch."}
                  </p>
                </div>
              </div>

              {/* Plan horizon */}
              <div className="life-expectancy-card">
                <div className="life-expectancy-input-side">
                  <div className="life-expectancy-header">
                    <span className="life-expectancy-title">
                      {language === "en" ? "Plan end age" : "Tuổi kết thúc kế hoạch"}
                    </span>
                  </div>

                  <p id="goal-end-age-help">{language === "en" ? "The age through which this plan projects income and expenses; this is not a prediction of your lifespan." : "Mốc tuổi để tính thu chi đến cuối kế hoạch, không phải dự đoán tuổi thọ của bạn."}</p>
                  <div className="life-expectancy-controls-row">
                    <div className="life-expectancy-stepper-wrap">
                      <button
                        type="button"
                        className="life-stepper-btn"
                        aria-label={language === "en" ? "Decrease plan end age" : "Giảm 1 tuổi kết thúc kế hoạch"}
                        disabled={lifeExpectancy <= targetAge + 1}
                        onClick={() => setLifeExpectancy((prev) => Math.max(targetAge + 1, prev - 1))}
                      >
                        <Icon name="chevron-left" />
                      </button>

                      <div className="life-stepper-display">
                        <input
                          type="number"
                          id="goal-life-age"
                          aria-invalid={validationField === 'life-age'}
                          aria-describedby={validationField === 'life-age' ? 'goal-end-age-help goal-life-error' : 'goal-end-age-help'}
                          min={targetAge + 1}
                          max={110}
                          value={lifeExpectancy || ""}
                          onChange={(e) => setLifeExpectancy(Number(e.target.value))}
                          className="life-stepper-input"
                          aria-label={language === "en" ? "Plan end age" : "Tuổi kết thúc kế hoạch"}
                          title={language === "en" ? "Click to enter age directly" : "Bấm để nhập số tuổi trực tiếp"}
                        />
                        <span className="life-stepper-unit">{language === "en" ? "years" : "tuổi"}</span>
                      </div>

                      <button
                        type="button"
                        className="life-stepper-btn"
                        aria-label={language === "en" ? "Increase plan end age" : "Tăng 1 tuổi kết thúc kế hoạch"}
                        disabled={lifeExpectancy >= 110}
                        onClick={() => setLifeExpectancy((prev) => Math.min(110, Math.max(targetAge + 1, prev + 1)))}
                      >
                        <Icon name="chevron-right" />
                      </button>
                    </div>

                    <div className="life-expectancy-presets">
                      {[75, 80, 85, 90].map((presetAge) => {
                        if (presetAge <= targetAge) return null;
                        const isActive = lifeExpectancy === presetAge;
                        return (
                          <button
                            key={presetAge}
                            type="button"
                            className={`life-preset-chip ${isActive ? "is-active" : ""}`}
                            onClick={() => setLifeExpectancy(presetAge)}
                            aria-pressed={isActive}
                          >
                            {presetAge} {language === "en" ? "yrs" : "tuổi"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {validationField === 'life-age' && <p id="goal-life-error" className="goal-field-error">{validationError}</p>}
                  <p className="life-expectancy-helper">
                    {language === "en"
                      ? `Projected retirement income stream needed across ${retirementDuration} years.`
                      : `Dự kiến bạn sẽ cần nguồn thu nhập hưu trí trong suốt ${retirementDuration} năm.`}
                  </p>
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

              {yearsLeft > 0 ? (
                <div className="age-marker marker-mid">
                  <span>{Math.round((currentAge + targetAge) / 2)}</span>
                  <strong>{language === "en" ? "Midpoint" : "Giai đoạn giữa"}</strong>
                  <small>{language === "en" ? "Time remaining before retirement" : "Thời gian còn lại trước khi nghỉ hưu"}</small>
                </div>
              ) : (
                <div className="age-marker marker-mid">
                  <span>{targetAge}</span>
                  <strong>{language === "en" ? "Retiree" : "Đã nghỉ hưu"}</strong>
                  <small>{language === "en" ? "Start retirement drawdown" : "Bắt đầu chi tiêu hưu trí"}</small>
                </div>
              )}

              <div className="age-marker marker-target">
                <span>{targetAge}</span>
                <strong>{language === "en" ? "Retirement" : "Nghỉ hưu"}</strong>
                <small>
                  {yearsLeft === 0
                    ? (language === "en" ? `${targetAge} years old (Retired now)` : `${targetAge} tuổi (Đã nghỉ hưu)`)
                    : `${targetAge} ${language === "en" ? "years old" : "tuổi"} (${yearsLeft} ${language === "en" ? "years to go" : "năm nữa"})`}
                </small>
              </div>

              <div className="age-marker">
                <span>{lifeExpectancy}</span>
                <strong>{language === "en" ? "Plan end age" : "Tuổi kết thúc kế hoạch"}</strong>
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
          </fieldset>
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
            {loadingPlans && <p role="status">{language === "en" ? "Loading saved plan…" : "Đang tải kế hoạch đã lưu…"}</p>}
            {plansError && <Alert tone="warning" title={language === "en" ? "Could not load plans" : "Chưa tải được kế hoạch"} action={<Button onClick={() => void refreshPlans()}>{language === "en" ? "Retry plans" : "Tải lại kế hoạch"}</Button>}>{plansError}</Alert>}
            <PlanSyncStatus />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <Badge tone="soft">{language === "en" ? "GOALS SUMMARY" : "TỔNG HỢP MỤC TIÊU"}</Badge>
              {currentVersion && <Badge tone="info">v{currentVersion.version}</Badge>}
            </div>

            <div className="goal-summary-main">
              {planSummary && <p>{language === "en" ? "Calculated from the same profile and choices as the Plan page." : "Tính từ cùng hồ sơ và lựa chọn với trang Kế hoạch."}</p>}
              <span>{language === "en" ? "TARGET RETIREMENT FUND (K)" : "QUỸ NGHỈ HƯU CẦN ĐẠT (K)"}</span>
              {estimatedTargetFund != null && Number.isFinite(estimatedTargetFund) ? (
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
              <strong className="font-mono">{cashflowKnown ? `${formatVND(currentSurplus)} ${language === "en" ? "/ month" : "/ tháng"}` : (language === "en" ? "Complete income, expenses and debt payments first." : "Cần bổ sung thu nhập, chi tiêu và khoản trả nợ.")}</strong>
              <small>
                {language === "en" ? "Income minus living expenses and monthly debt payments in your current profile; not the plan's required contribution." : "Thu nhập trừ chi tiêu và tiền trả nợ hàng tháng trong hồ sơ hiện tại; không phải mức đóng góp cần duy trì của kế hoạch."}
              </small>
            </div>

            <p className="goal-draft-note">{language === "en" ? "Changes save automatically. Preview your plan when you are ready." : "Thay đổi được tự động lưu. Bạn có thể xem trước kế hoạch khi đã chỉnh xong."}</p>
            <p role="status" aria-live="polite" className="goal-autosave-status">{isSaving ? (language === "en" ? "Saving…" : "Đang lưu thay đổi…") : validationError ? (language === "en" ? "Changes not saved" : "Thay đổi chưa được lưu") : preparedInput === inputKey ? (language === "en" ? "Changes saved" : "Đã lưu thay đổi") : edited.current ? (language === "en" ? "Waiting to save…" : "Đang chờ lưu…") : (language === "en" ? "Autosave is on" : "Đã bật tự động lưu")}</p>
            <small className="goal-autosave-scope">{v2Profile ? (language === "en" ? "Retirement date saves to your profile. Other inputs are saved in this browser tab until you save a plan version." : "Thời điểm nghỉ hưu lưu vào hồ sơ. Các lựa chọn khác được lưu nháp trong tab này, chờ bạn lưu phiên bản kế hoạch.") : (language === "en" ? "Your draft is saved in this browser tab until you save a plan version." : "Bản nháp được lưu trong tab này, chờ bạn lưu phiên bản kế hoạch.")}</small>
            {validationError && <div id="goal-validation"><Alert tone="danger" title={language === "en" ? "Could not continue" : "Chưa thể tiếp tục"}>{validationError}{saveStatus === 'error' && saveError && <p>{saveError}</p>}</Alert></div>}

            <div className="goal-summary-actions">
              <Button
                variant="primary"
                size="large"
                onClick={handleProceedToPlan}
                className="goal-proceed-btn"
                disabled={loadingPlans || isSaving || saveStatus === "saving"}
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
