import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, BrandLogo, Button, Card, Checkbox, Icon, IconButton, Input, Select, useNotification } from "../components/ui";
import {
  useFinancialProfile,
  DEFAULT_SAMPLE_PROFILE,
  type OnboardingDraftData,
} from "../context/FinancialProfileContext";

type StepId =
  | "welcome"
  | "personal"
  | "income"
  | "expense"
  | "assets"
  | "debt"
  | "invest-social"
  | "summary";

const steps = [
  { id: "welcome" as StepId, number: 0, title: "Khởi đầu", detail: "Giới thiệu & chuẩn bị" },
  { id: "personal" as StepId, number: 1, title: "Cá nhân", detail: "Tuổi & người phụ thuộc" },
  { id: "income" as StepId, number: 2, title: "Thu nhập", detail: "Lương & nguồn thu khác" },
  { id: "expense" as StepId, number: 3, title: "Chi tiêu", detail: "Chi phí sinh hoạt tháng" },
  { id: "assets" as StepId, number: 4, title: "Tài sản", detail: "Tiết kiệm & bất động sản" },
  { id: "debt" as StepId, number: 5, title: "Khoản nợ", detail: "Vay mua nhà & tiêu dùng" },
  { id: "invest-social" as StepId, number: 6, title: "Đầu tư & BHXH", detail: "Danh mục & bảo hiểm" },
  { id: "summary" as StepId, number: 7, title: "Tổng kết", detail: "Bức tranh tài sản ròng" },
];

// Lấy giá trị mặc định ban đầu từ bộ dữ liệu mẫu để Onboarding luôn đồng bộ với Profile.
const INITIAL_FORM_DATA = {
  age: DEFAULT_SAMPLE_PROFILE.personal.age,
  gender: DEFAULT_SAMPLE_PROFILE.personal.gender,
  maritalStatus: DEFAULT_SAMPLE_PROFILE.personal.maritalStatus,
  dependents: DEFAULT_SAMPLE_PROFILE.personal.dependents,
  city: DEFAULT_SAMPLE_PROFILE.personal.city,
  primaryIncome: DEFAULT_SAMPLE_PROFILE.income.primaryIncome,
  secondaryIncome: DEFAULT_SAMPLE_PROFILE.income.secondaryIncome,
  essentialExpense: DEFAULT_SAMPLE_PROFILE.expenses.essentialExpense,
  lifestyleExpense: DEFAULT_SAMPLE_PROFILE.expenses.lifestyleExpense,
  cashSavings: DEFAULT_SAMPLE_PROFILE.assets.cashSavings,
  realEstateValue: DEFAULT_SAMPLE_PROFILE.assets.realEstateValue,
  liquidAssets: DEFAULT_SAMPLE_PROFILE.assets.liquidAssets,
  hasDebt: DEFAULT_SAMPLE_PROFILE.debt.hasDebt,
  mortgageDebt: DEFAULT_SAMPLE_PROFILE.debt.mortgageDebt,
  consumerDebt: DEFAULT_SAMPLE_PROFILE.debt.consumerDebt,
  monthlyDebtService: DEFAULT_SAMPLE_PROFILE.debt.monthlyDebtService,
  stockFundValue: DEFAULT_SAMPLE_PROFILE.assets.stockFundValue,
  socialInsuranceYears: DEFAULT_SAMPLE_PROFILE.socialSecurity.socialInsuranceYears,
  socialInsuranceSalary: DEFAULT_SAMPLE_PROFILE.socialSecurity.socialInsuranceSalary,
} as const;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const {
    onboardingDraft,
    draftSaveStatus,
    lastDraftSavedAt,
    saveOnboardingDraft,
    completeOnboarding,
  } = useFinancialProfile();
  const [currentStep, setCurrentStep] = useState<StepId>(() => {
    if (onboardingDraft?.step && onboardingDraft.step !== "welcome") {
      return onboardingDraft.step as StepId;
    }
    return "welcome";
  });
  const [isCompleted, setIsCompleted] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Khôi phục form từ bản nháp đã lưu trong localStorage (nếu có),
  // ngược lại dùng giá trị mặc định từ dữ liệu mẫu.
  const initialFromDraft = useMemo(() => {
    const d = onboardingDraft;
    return {
      ...INITIAL_FORM_DATA,
      age: d.age ?? INITIAL_FORM_DATA.age,
      gender: d.gender ?? INITIAL_FORM_DATA.gender,
      maritalStatus: d.maritalStatus ?? INITIAL_FORM_DATA.maritalStatus,
      dependents: d.dependents ?? INITIAL_FORM_DATA.dependents,
      city: d.city ?? INITIAL_FORM_DATA.city,
      primaryIncome: d.primaryIncome ?? INITIAL_FORM_DATA.primaryIncome,
      secondaryIncome: d.secondaryIncome ?? INITIAL_FORM_DATA.secondaryIncome,
      essentialExpense: d.essentialExpense ?? INITIAL_FORM_DATA.essentialExpense,
      lifestyleExpense: d.lifestyleExpense ?? INITIAL_FORM_DATA.lifestyleExpense,
      cashSavings: d.cashSavings ?? INITIAL_FORM_DATA.cashSavings,
      realEstateValue: d.realEstateValue ?? INITIAL_FORM_DATA.realEstateValue,
      liquidAssets: d.liquidAssets ?? INITIAL_FORM_DATA.liquidAssets,
      hasDebt: d.hasDebt ?? INITIAL_FORM_DATA.hasDebt,
      mortgageDebt: d.mortgageDebt ?? INITIAL_FORM_DATA.mortgageDebt,
      consumerDebt: d.consumerDebt ?? INITIAL_FORM_DATA.consumerDebt,
      monthlyDebtService: d.monthlyDebtService ?? INITIAL_FORM_DATA.monthlyDebtService,
      stockFundValue: d.stockFundValue ?? INITIAL_FORM_DATA.stockFundValue,
      socialInsuranceYears: d.socialInsuranceYears ?? INITIAL_FORM_DATA.socialInsuranceYears,
      socialInsuranceSalary: d.socialInsuranceSalary ?? INITIAL_FORM_DATA.socialInsuranceSalary,
    };
  }, [onboardingDraft]);

  // Form states — khởi tạo từ bản nháp đã lưu
  const [formData, setFormData] = useState(initialFromDraft);

  // Bản nháp được đọc đồng bộ khi component khởi tạo. Không đồng bộ ngược lại
  // sau mỗi lần lưu, vì thao tác đó sẽ kéo người dùng về bước vừa hoàn tất.

  const totalMonthlyIncome = formData.primaryIncome + formData.secondaryIncome;
  const totalMonthlyExpense = formData.essentialExpense + formData.lifestyleExpense;
  const totalMonthlySurplus = totalMonthlyIncome - totalMonthlyExpense - (formData.hasDebt ? formData.monthlyDebtService : 0);

  const totalAssets = formData.cashSavings + formData.realEstateValue + formData.liquidAssets + formData.stockFundValue;
  const totalDebt = formData.hasDebt ? formData.mortgageDebt + formData.consumerDebt : 0;
  const estimatedNetWorth = totalAssets - totalDebt;

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const progressPercent = Math.round((currentStepIndex / (steps.length - 1)) * 100);

  const formatVND = (num: number) => {
    return new Intl.NumberFormat("vi-VN").format(num) + " đ";
  };

  const handleNext = async () => {
    // Lưu nháp vào context mỗi khi chuyển bước — đảm bảo dữ liệu luôn được đồng bộ.
    await saveOnboardingDraft({
      step: currentStep,
      ...formData,
    });
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1].id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Bước cuối: hoàn tất Onboarding, chuyển nháp vào hồ sơ chính thức.
      const completed = await completeOnboarding({
        ...formData,
        step: currentStep,
        updatedAt: new Date().toISOString(),
      } as OnboardingDraftData);
      if (completed) {
        setIsCompleted(true);
        notify.success("Khởi tạo hồ sơ thành công", "Bức tranh tài chính của bạn đã được thiết lập hoàn tất!");
      } else {
        const err = "Không thể hoàn tất hồ sơ. Vui lòng thử lại.";
        setSaveError(err);
        notify.error("Lỗi hoàn tất", err);
      }
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1].id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSaveDraft = async () => {
    setSaveError(null);
    const ok = await saveOnboardingDraft({
      step: currentStep,
      ...formData,
    });
    if (ok) {
      setShowSaveToast(true);
      notify.info("Đã lưu bản nháp", `Tiến độ khảo sát đã được lưu an toàn${lastDraftSavedAt ? ` lúc ${lastDraftSavedAt}` : ""}.`);
      setTimeout(() => setShowSaveToast(false), 3000);
    } else {
      const err = "Không thể lưu nháp. Vui lòng thử lại.";
      setSaveError(err);
      notify.error("Lỗi lưu nháp", err);
    }
  };

  if (isCompleted) {
    return (
      <div className="profile-complete">
        <Card className="profile-complete-card">
          <div className="complete-icon">
            <Icon name="circle-check" size="large" />
          </div>
          <Badge tone="success">HỒ SƠ TÀI CHÍNH HOÀN TẤT</Badge>
          <h1>Tuyệt vời! Bức tranh tài chính của bạn đã sẵn sàng</h1>
          <p>
            An Hưu đã phân tích đầy đủ tài sản, thu nhập và dòng tiền của bạn. Tài sản ròng ước tính hiện tại:
          </p>
          <strong>{formatVND(estimatedNetWorth)}</strong>

          <div className="complete-actions">
            <Button variant="secondary" onClick={() => setIsCompleted(false)}>
              Xem lại các bước khai báo
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => navigate("/user/dashboard")}
            >
              Mở Dashboard & Lập kế hoạch hưu trí <Icon name="arrow-right" />
            </Button>
          </div>
          <small>Dữ liệu này sẽ được dùng làm căn cứ tự động cho công cụ mô phỏng hưu trí.</small>
        </Card>
      </div>
    );
  }

  return (
    <div className="onboarding-app">
      {/* Topbar */}
      <header className="onboarding-topbar">
        <Link to="/" className="onboarding-brand" aria-label="Trang chủ An Hưu">
          <BrandLogo />
        </Link>

        <div
          className={`save-status save-status-${draftSaveStatus}`}
          role="status"
          aria-live="polite"
        >
          {draftSaveStatus === "saving" ? (
            <>
              <span className="save-spinner" aria-hidden="true" />
              <span>Đang lưu bản nháp…</span>
            </>
          ) : draftSaveStatus === "saved" ? (
            <>
              <Icon name="circle-check" size="small" />
              <span>Đã lưu bản nháp{lastDraftSavedAt ? ` lúc ${lastDraftSavedAt}` : ""}</span>
            </>
          ) : draftSaveStatus === "error" ? (
            <>
              <Icon name="alert" size="small" />
              <span>Lỗi lưu bản nháp. Hãy thử lại.</span>
            </>
          ) : (
            <>
              <Icon name="circle-check" size="small" />
              <span>Bản nháp được lưu cục bộ trong trình duyệt của bạn</span>
            </>
          )}
        </div>

        <IconButton
          icon="x"
          label="Lưu và thoát về trang chủ"
          onClick={() => {
            saveOnboardingDraft({ step: currentStep, ...formData });
            navigate("/");
          }}
        />
      </header>

      {/* Mobile progress tracker */}
      <div className="onboarding-progress-mobile">
        <div>
          <span>Bước {currentStepIndex + 1}/{steps.length}</span>
          <strong>{steps[currentStepIndex].title}</strong>
          <small>{progressPercent}%</small>
        </div>
        <div className="progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ "--progress": `${progressPercent}%` } as React.CSSProperties} />
        </div>
      </div>

      <div className="onboarding-layout">
        {/* Step Sidebar */}
        <aside className="step-sidebar" aria-label="Tiến trình khai báo">
          <div className="step-progress-summary">
            <span>TIẾN ĐỘ THIẾT LẬP</span>
            <div>
              <strong>{progressPercent}%</strong>
              <small>({currentStepIndex + 1}/{steps.length} bước)</small>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ "--progress": `${progressPercent}%` } as React.CSSProperties} />
            </div>
          </div>

          <nav>
            {steps.map((s, index) => {
              const isActive = s.id === currentStep;
              const isDone = index < currentStepIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`}
                  onClick={() => setCurrentStep(s.id)}
                >
                  <span>{isDone ? <Icon name="check" size="small" /> : index}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>{s.detail}</small>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="step-sidebar-help">
            <Icon name="info" />
            <div>
              <strong>Cần hỗ trợ nhập liệu?</strong>
              <button type="button" onClick={() => alert("Các số liệu này dùng để tính toán khả năng tài chính của bạn và có thể điều chỉnh bất kỳ lúc nào tại mục Tài khoản.")}>
                Xem giải thích cách tính
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="onboarding-main" id="main-content">
          <div className="onboarding-content">
            {/* STEP 0: WELCOME */}
            {currentStep === "welcome" && (
              <div className="welcome-step">
                <div className="welcome-illustration">
                  <div className="welcome-ring ring-outer" />
                  <div className="welcome-ring ring-inner" />
                  <div className="welcome-center">
                    <Icon name="wallet" size="large" />
                  </div>
                  <div className="orbit-item orbit-wallet">
                    <Icon name="target" />
                  </div>
                  <div className="orbit-item orbit-chart">
                    <Icon name="chart" />
                  </div>
                  <div className="orbit-item orbit-home">
                    <Icon name="home" />
                  </div>
                </div>

                <div className="welcome-points">
                  <div className="step-heading">
                    <Badge tone="soft">BƯỚC 0 · KHỞI ĐẦU</Badge>
                    <h1>Thiết lập hồ sơ tài chính ban đầu</h1>
                    <p>
                      Để tính toán kế hoạch nghỉ hưu chính xác, An Hưu cần hiểu bức tranh toàn cảnh về tài chính của bạn hiện tại. Quá trình này chỉ mất khoảng 5–7 phút.
                    </p>
                  </div>

                  <div>
                    <span><Icon name="check" /></span>
                    <div>
                      <strong>Số liệu mang tính ước tính</strong>
                      <p>Bạn không cần phải nhớ chính xác từng đồng lẻ, chỉ cần con số xấp xỉ hợp lý.</p>
                    </div>
                  </div>

                  <div>
                    <span><Icon name="check" /></span>
                    <div>
                      <strong>Dễ dàng chỉnh sửa về sau</strong>
                      <p>Mọi thông tin đều có thể cập nhật lại khi thu nhập hoặc hoàn cảnh gia đình thay đổi.</p>
                    </div>
                  </div>

                  <div>
                    <span><Icon name="check" /></span>
                    <div>
                      <strong>Bảo mật chuẩn tài chính</strong>
                      <p>Dữ liệu chỉ phục vụ mục đích tính toán của bạn, không bán hay chia sẻ với bên thứ ba.</p>
                    </div>
                  </div>
                </div>

                <div className="context-note">
                  <span><Icon name="info" /></span>
                  <div>
                    <strong>Lời khuyên chuẩn bị</strong>
                    <p>Hãy chuẩn bị sẵn con số ước tính về thu nhập hàng tháng, số dư tiết kiệm và số năm đã đóng BHXH để hoàn thành nhanh nhất.</p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: PERSONAL INFO */}
            {currentStep === "personal" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="users" /></span>
                  <Badge tone="soft">BƯỚC 1/7</Badge>
                  <h1>Thông tin cá nhân & Gia đình</h1>
                  <p>Các mốc tuổi và người phụ thuộc ảnh hưởng trực tiếp đến thời gian tích lũy và quy mô quỹ hưu trí.</p>
                </div>

                <div className="form-grid">
                  <Input
                    label="Tuổi hiện tại của bạn"
                    type="number"
                    value={String(formData.age)}
                    onChange={(v) => setFormData({ ...formData, age: Number(v) || 0 })}
                    suffix="tuổi"
                  />

                  <Select
                    label="Giới tính"
                    options={["Nam", "Nữ"]}
                    value={formData.gender}
                    onChange={(v) => setFormData({ ...formData, gender: v })}
                    helper="Theo luật lao động Việt Nam, tuổi nghỉ hưu nam & nữ có lộ trình khác nhau."
                  />

                  <Select
                    label="Tình trạng hôn nhân"
                    options={["Đã kết hôn", "Độc thân", "Khác"]}
                    value={formData.maritalStatus}
                    onChange={(v) => setFormData({ ...formData, maritalStatus: v })}
                  />

                  <Input
                    label="Số người phụ thuộc (con cái, cha mẹ già)"
                    type="number"
                    value={String(formData.dependents)}
                    onChange={(v) => setFormData({ ...formData, dependents: Number(v) || 0 })}
                    suffix="người"
                  />

                  <Select
                    label="Nơi sinh sống dự kiến khi nghỉ hưu"
                    options={["TP. Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Đô thị loại 1", "Nông thôn / Ngoại ô"]}
                    value={formData.city}
                    onChange={(v) => setFormData({ ...formData, city: v })}
                    helper="Mức chi phí sinh hoạt tại các thành phố lớn thường cao hơn 30-40% so với khu vực khác."
                  />

                  <div className="context-note">
                    <span><Icon name="info" /></span>
                    <div>
                      <strong>Tác động đến kế hoạch</strong>
                      <p>Nếu bạn {formData.age} tuổi và dự kiến nghỉ hưu ở tuổi 60, bạn còn đúng {Math.max(0, 60 - formData.age)} năm vàng để tạo lập tài sản.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: INCOME */}
            {currentStep === "income" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="wallet" /></span>
                  <Badge tone="soft">BƯỚC 2/7</Badge>
                  <h1>Nguồn thu nhập hàng tháng</h1>
                  <p>Thu nhập là dòng chảy tài chính quan trọng quyết định khả năng tích lũy đều đặn mỗi tháng của bạn.</p>
                </div>

                <div className="form-grid">
                  <Input
                    label="Thu nhập chính sau thuế (Lương / Thù lao)"
                    type="number"
                    value={String(formData.primaryIncome)}
                    onChange={(v) => setFormData({ ...formData, primaryIncome: Number(v) || 0 })}
                    suffix="đ/tháng"
                    helper="Số tiền thực nhận vào tài khoản hàng tháng sau khi đã trừ các khoản thuế và bảo hiểm."
                  />

                  <Input
                    label="Thu nhập phụ / Đầu tư / Kinh doanh"
                    type="number"
                    value={String(formData.secondaryIncome)}
                    onChange={(v) => setFormData({ ...formData, secondaryIncome: Number(v) || 0 })}
                    suffix="đ/tháng"
                    helper="Thu nhập từ cho thuê nhà, cổ tức, làm tự do (lấy mức bình quân hàng tháng)."
                  />

                  <Card className="inline-total-card">
                    <span>Tổng thu nhập ròng mỗi tháng:</span>
                    <strong>{formatVND(totalMonthlyIncome)}</strong>
                  </Card>

                  <div className="context-note">
                    <span><Icon name="sparkles" /></span>
                    <div>
                      <strong>Gợi ý từ chuyên gia</strong>
                      <p>Người có nguồn thu nhập ổn định trên 30 triệu/tháng thường dành 20–30% cho quỹ hưu trí để đạt mức sống thoải mái.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: EXPENSE */}
            {currentStep === "expense" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="chart" /></span>
                  <Badge tone="soft">BƯỚC 3/7</Badge>
                  <h1>Chi tiêu & Mức sống sinh hoạt</h1>
                  <p>Chi tiêu hiện tại là thước đo cơ bản để dự toán mức chi phí bạn cần có khi về già để giữ nguyên phong cách sống.</p>
                </div>

                <div className="form-grid">
                  <Input
                    label="Chi tiêu thiết yếu hàng tháng"
                    type="number"
                    value={String(formData.essentialExpense)}
                    onChange={(v) => setFormData({ ...formData, essentialExpense: Number(v) || 0 })}
                    suffix="đ/tháng"
                    helper="Bao gồm: ăn uống, điện nước, tiền thuê nhà/quản lý, y tế, học phí của con."
                  />

                  <Input
                    label="Chi tiêu phong cách sống & Giải trí"
                    type="number"
                    value={String(formData.lifestyleExpense)}
                    onChange={(v) => setFormData({ ...formData, lifestyleExpense: Number(v) || 0 })}
                    suffix="đ/tháng"
                    helper="Bao gồm: mua sắm, du lịch, giao lưu bạn bè, sở thích cá nhân."
                  />

                  <Card className="inline-total-card">
                    <span>Tổng chi tiêu sinh hoạt hàng tháng:</span>
                    <strong>{formatVND(totalMonthlyExpense)}</strong>
                  </Card>

                  <div className="context-note">
                    <span><Icon name="info" /></span>
                    <div>
                      <strong>Quy luật hưu trí 70–80%</strong>
                      <p>Khi nghỉ hưu, bạn không còn các chi phí liên quan công việc và nuôi con nhỏ, mức chi tiêu thường bằng 70–80% so với thời điểm đi làm.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: ASSETS */}
            {currentStep === "assets" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="home" /></span>
                  <Badge tone="soft">BƯỚC 4/7</Badge>
                  <h1>Tài sản tích lũy hiện có</h1>
                  <p>Các tài sản tích lũy hiện thời sẽ tiếp tục sinh lời và tạo thành bệ phóng cho quỹ hưu trí tương lai.</p>
                </div>

                <div className="form-grid">
                  <Input
                    label="Tiền gửi ngân hàng & Tiền mặt"
                    type="number"
                    value={String(formData.cashSavings)}
                    onChange={(v) => setFormData({ ...formData, cashSavings: Number(v) || 0 })}
                    suffix="VNĐ"
                    helper="Tài khoản thanh toán, sổ tiết kiệm có kỳ hạn tại các ngân hàng."
                  />

                  <Input
                    label="Giá trị Bất động sản đang sở hữu"
                    type="number"
                    value={String(formData.realEstateValue)}
                    onChange={(v) => setFormData({ ...formData, realEstateValue: Number(v) || 0 })}
                    suffix="VNĐ"
                    helper="Giá thị trường ước tính của nhà ở, đất hoặc căn hộ."
                  />

                  <Input
                    label="Vàng / Tài sản thanh khoản khác"
                    type="number"
                    value={String(formData.liquidAssets)}
                    onChange={(v) => setFormData({ ...formData, liquidAssets: Number(v) || 0 })}
                    suffix="VNĐ"
                    helper="Vàng miếng, chứng chỉ tiền gửi, xe cộ hoặc tài sản có giá trị chuyển đổi."
                  />

                  <Card className="inline-total-card">
                    <span>Tổng tài sản ước tính ban đầu:</span>
                    <strong>{formatVND(formData.cashSavings + formData.realEstateValue + formData.liquidAssets)}</strong>
                  </Card>
                </div>
              </div>
            )}

            {/* STEP 5: DEBT */}
            {currentStep === "debt" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="alert" /></span>
                  <Badge tone="soft">BƯỚC 5/7</Badge>
                  <h1>Các khoản nợ & Nghĩa vụ tài chính</h1>
                  <p>Nắm rõ các khoản nợ giúp tính toán chính xác dòng tiền thặng dư thực tế có thể dành cho tích lũy.</p>
                </div>

                <div className="form-grid">
                  <Checkbox
                    checked={formData.hasDebt}
                    label="Tôi hiện đang có các khoản nợ cần trả (vay mua nhà, vay tiêu dùng, trả góp)"
                    onChange={(v) => setFormData({ ...formData, hasDebt: v })}
                  />

                  {formData.hasDebt && (
                    <div className="debt-fields">
                      <Input
                        label="Dư nợ vay mua nhà / Bất động sản"
                        type="number"
                        value={String(formData.mortgageDebt)}
                        onChange={(v) => setFormData({ ...formData, mortgageDebt: Number(v) || 0 })}
                        suffix="VNĐ"
                      />

                      <Input
                        label="Dư nợ vay tiêu dùng / Thẻ tín dụng"
                        type="number"
                        value={String(formData.consumerDebt)}
                        onChange={(v) => setFormData({ ...formData, consumerDebt: Number(v) || 0 })}
                        suffix="VNĐ"
                      />

                      <Input
                        label="Số tiền trả nợ cả gốc lẫn lãi hàng tháng"
                        type="number"
                        value={String(formData.monthlyDebtService)}
                        onChange={(v) => setFormData({ ...formData, monthlyDebtService: Number(v) || 0 })}
                        suffix="đ/tháng"
                        helper="Khoản trích cố định từ thu nhập để trả cho các tổ chức tín dụng."
                      />
                    </div>
                  )}

                  <Card className="inline-total-card">
                    <span>Tổng dư nợ hiện tại:</span>
                    <strong style={{ color: "var(--color-danger)" }}>
                      {formatVND(formData.hasDebt ? formData.mortgageDebt + formData.consumerDebt : 0)}
                    </strong>
                  </Card>

                  <div className="context-note">
                    <span><Icon name="circle-check" /></span>
                    <div>
                      <strong>Mục tiêu trước khi nghỉ hưu</strong>
                      <p>Nguyên tắc vàng của tài chính hưu trí: Phải thanh toán toàn bộ nợ lãi suất cao trước khi bước vào tuổi nghỉ hưu để bảo toàn thu nhập thụ động.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: INVEST & SOCIAL SECURITY */}
            {currentStep === "invest-social" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="sparkles" /></span>
                  <Badge tone="soft">BƯỚC 6/7</Badge>
                  <h1>Đầu tư & Bảo hiểm Xã hội (BHXH)</h1>
                  <p>Lương hưu từ BHXH và lợi nhuận từ danh mục đầu tư là hai trụ cột chính nuôi dưỡng quỹ hưu trí.</p>
                </div>

                <div className="form-grid">
                  <Input
                    label="Giá trị danh mục đầu tư (Cổ phiếu, Quỹ mở, Trái phiếu)"
                    type="number"
                    value={String(formData.stockFundValue)}
                    onChange={(v) => setFormData({ ...formData, stockFundValue: Number(v) || 0 })}
                    suffix="VNĐ"
                    helper="Số dư hiện tại trong các tài khoản chứng khoán hoặc ứng dụng đầu tư."
                  />

                  <Input
                    label="Số năm đã tham gia BHXH bắt buộc / tự nguyện"
                    type="number"
                    value={String(formData.socialInsuranceYears)}
                    onChange={(v) => setFormData({ ...formData, socialInsuranceYears: Number(v) || 0 })}
                    suffix="năm"
                    helper="Tối thiểu 15–20 năm đóng BHXH để đủ điều kiện hưởng lương hưu hàng tháng."
                  />

                  <Input
                    label="Mức lương làm căn cứ đóng BHXH bình quân"
                    type="number"
                    value={String(formData.socialInsuranceSalary)}
                    onChange={(v) => setFormData({ ...formData, socialInsuranceSalary: Number(v) || 0 })}
                    suffix="đ/tháng"
                    helper="Mức lương ghi trên hợp đồng lao động đóng BHXH (thường khác với tổng thu nhập thực nhận)."
                  />

                  <div className="context-note">
                    <span><Icon name="info" /></span>
                    <div>
                      <strong>Thuật toán mô phỏng BHXH An Hưu</strong>
                      <p>Hệ thống tự động áp dụng công thức tính lương hưu mới nhất (tỷ lệ hưởng tối đa 75% mức bình quân tiền lương đóng) kết hợp dự báo hệ số trượt giá.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 7: SUMMARY */}
            {currentStep === "summary" && (
              <div className="summary-step">
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="circle-check" /></span>
                  <Badge tone="success">BƯỚC 7/7 · TỔNG KẾT</Badge>
                  <h1>Bức tranh tài chính tổng quan của bạn</h1>
                  <p>Hãy xem lại toàn bộ các chỉ số tài chính quan trọng trước khi hoàn tất hồ sơ và tiến hành lập kế hoạch nghỉ hưu chi tiết.</p>
                </div>

                {/* Net Worth Card */}
                <div className="net-worth-card">
                  <div className="net-worth-copy">
                    <Badge tone="soft">TÀI SẢN RÒNG HIỆN TẠI (NET WORTH)</Badge>
                    <strong>{formatVND(estimatedNetWorth)}</strong>
                    <p>Tổng tài sản ({formatVND(totalAssets)}) trừ đi tổng nghĩa vụ nợ ({formatVND(totalDebt)})</p>
                  </div>

                  <div className="net-worth-visual">
                    <div className="worth-bar">
                      <span
                        className="assets-part"
                        style={{ "--asset-share": `${totalAssets > 0 ? Math.round((estimatedNetWorth / totalAssets) * 100) : 100}%` } as React.CSSProperties}
                      />
                      <span className="debt-part" />
                    </div>
                    <div className="worth-legend">
                      <span>
                        <i className="legend-assets" />
                        <span>Tài sản ròng khả dụng</span>
                        <strong>{formatVND(estimatedNetWorth)}</strong>
                      </span>
                      <span>
                        <i className="legend-debt" />
                        <span>Nghĩa vụ nợ cần tất toán</span>
                        <strong>{formatVND(totalDebt)}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Summary Metrics */}
                <div className="summary-metrics">
                  <Card className="summary-metric-card">
                    <span className="summary-metric-icon"><Icon name="wallet" /></span>
                    <div>
                      <small>Thu nhập hàng tháng</small>
                      <strong>{formatVND(totalMonthlyIncome)}</strong>
                    </div>
                    <Badge tone="success">Dương</Badge>
                  </Card>

                  <Card className="summary-metric-card">
                    <span className="summary-metric-icon"><Icon name="chart" /></span>
                    <div>
                      <small>Chi tiêu hàng tháng</small>
                      <strong>{formatVND(totalMonthlyExpense)}</strong>
                    </div>
                    <Badge tone="neutral">Sinh hoạt</Badge>
                  </Card>

                  <Card className="summary-metric-card">
                    <span className="summary-metric-icon"><Icon name="alert" /></span>
                    <div>
                      <small>Trả nợ hàng tháng</small>
                      <strong>{formatVND(formData.hasDebt ? formData.monthlyDebtService : 0)}</strong>
                    </div>
                    <Badge tone={formData.hasDebt ? "warning" : "success"}>
                      {formData.hasDebt ? "Đang trả" : "Không có nợ"}
                    </Badge>
                  </Card>

                  <Card className="summary-metric-card">
                    <span className="summary-metric-icon"><Icon name="target" /></span>
                    <div>
                      <small>Dòng tiền thặng dư có thể tích lũy</small>
                      <strong>{formatVND(Math.max(0, totalMonthlySurplus))}</strong>
                    </div>
                    <Badge tone="honey">Sẵn sàng lập kế hoạch</Badge>
                  </Card>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Onboarding Actions */}
          <div className="onboarding-actions">
            <div>
              {currentStepIndex > 0 && (
                <Button variant="secondary" onClick={handlePrev}>
                  <Icon name="arrow-left" size="small" /> Quay lại
                </Button>
              )}
              <Button variant="ghost" onClick={handleSaveDraft} loading={draftSaveStatus === "saving"}>
                Lưu nháp
              </Button>
            </div>

            <Button variant="primary" size="large" onClick={handleNext}>
              {currentStepIndex === steps.length - 1 ? (
                <>Hoàn tất hồ sơ & Nhận kế hoạch <Icon name="check" /></>
              ) : (
                <>Tiếp tục bước tiếp theo <Icon name="arrow-right" /></>
              )}
            </Button>
          </div>

          {saveError && (
            <div className="save-error-banner" role="alert">
              <Icon name="alert" />
              <span>{saveError}</span>
            </div>
          )}
        </main>
      </div>

      {/* Save Draft Toast */}
      {showSaveToast && (
        <div className="save-toast" role="status">
          <Icon name="circle-check" />
          <div>
            <strong>Đã lưu bản nháp</strong>
            <span>Bản nháp của bạn đã được lưu tự động, có thể tiếp tục bất cứ lúc nào.</span>
          </div>
          <IconButton icon="x" label="Đóng thông báo" onClick={() => setShowSaveToast(false)} />
        </div>
      )}
    </div>
  );
}
