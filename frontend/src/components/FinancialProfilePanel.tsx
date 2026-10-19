import { PlanningQuestions } from "./PlanningQuestions";
import ProfileFormattedInput from "./ProfileFormattedInput";
import { Link } from "react-router";
import { profileCompletionItems } from "../utils/profileCompletion";
import { useState, useEffect, useRef, type FormEvent, type ComponentProps } from "react";
import { useFinancialProfile, type FinancialProfile } from "../context/FinancialProfileContext";
import {
  type ProfileV2,
  type AssetEntry,
  type IncomeEntry,
  type ExpenseEntry,
  type PensionDeclaration,
  type RetirementCondition,
  createDefaultProfileV2,
} from "../services/financialProfile";
import {
  fetchPensionPreview,
  fetchPublishedAssumptions,
  type PensionPreviewResponse,
} from "../services/pensions";
import { Alert, Badge, Button, Card, Checkbox, Icon, Input as BaseInput, Select as BaseSelect, useNotification } from "./ui";
import { useI18n } from "../i18n";
import { SocialInsuranceModal } from "./SocialInsuranceModal";
import { formatDateVN, formatMonthVN } from "../utils/date";
import ResponsiveDialog from "./ResponsiveDialog";

// Missing values are highlighted within this financial form only. Zero is a valid answer.
function Input({ money, ...props }: ComponentProps<typeof BaseInput> & { money?: boolean }) {
  const { language } = useI18n();
  const optional = typeof props.label === "string" ? /kết thúc|end month|không bắt buộc|optional/i.test(props.label) : false;
  const error = props.error || (!optional && props.value === "" ? (language === "en" ? "Not filled in yet" : "Chưa điền thông tin") : undefined);
  if (money || props.type === "date" || props.type === "month") return <ProfileFormattedInput {...props} error={error} format={money ? "money" : props.type as "date" | "month"} />;
  return <BaseInput {...props} step={props.step ?? (props.type === "number" ? "any" : undefined)} error={error} />;
}
function Select(props: ComponentProps<typeof BaseSelect>) {
  const { language } = useI18n();
  const missing = !props.value || props.value === "UNDISCLOSED" || /UNKNOWN/.test(props.value);
  return <BaseSelect {...props} error={props.error || (missing ? (language === "en" ? "Please select an answer" : "Chưa xác nhận thông tin") : undefined)} />;
}

const PENSION_ISSUE_LABELS: Record<string, { vi: string; en: string }> = {
  PENSION_NOT_INCLUDED: {
    vi: "Chưa gồm lương hưu trong hồ sơ tài chính.",
    en: "Pension not included in financial profile.",
  },
  PENSION_START_MONTH_REQUIRED: {
    vi: "Thiếu tháng bắt đầu nhận lương hưu trong thông tin cá nhân.",
    en: "Missing pension start month in personal profile.",
  },
  PUBLISHED_INFLATION_REQUIRED: {
    vi: "Cần có bộ dữ liệu ước tính lạm phát và đầu tư đã công bố để quy đổi giá trị hôm nay sang tương lai.",
    en: "Published macroeconomic assumptions required to convert today values into future values.",
  },
  INFLATION_YEAR_MISSING: {
    vi: "Bộ giả định thiếu dữ liệu lạm phát cho các năm dự phóng.",
    en: "Assumption set is missing inflation data for projection years.",
  },
  NOMINAL_AMOUNT_REQUIRED_FOR_EXISTING_PENSION: {
    vi: "Cần khai mức danh nghĩa cho khoản lương hưu đã nhận từ trước tháng định giá.",
    en: "Nominal amount required for pension received prior to valuation month.",
  },
};

const PENSION_LIMITATIONS_LABELS: Record<string, { vi: string; en: string }> = {
  NOT_A_BENEFIT_ENTITLEMENT: {
    vi: "Đây là ước tính do người dùng tự khai báo hoặc đối chiếu tham chiếu, không phải văn bản xác nhận quyền lợi BHXH chính thức.",
    en: "This is a user-declared or reference estimate, not an official Social Insurance benefit entitlement certification.",
  },
  NO_AUTOMATIC_CPI_INDEXATION: {
    vi: "Lương hưu không tự động tăng trượt giá CPI nếu chưa có quyết định điều chỉnh danh nghĩa cụ thể.",
    en: "Pensions do not automatically adjust with CPI without an explicit nominal adjustment decree.",
  },
  PERSONAL_PLAN_INTEGRATION_AWAITING_T06: {
    vi: "Dòng tiền xem trước mang tính độc lập; kế hoạch cá nhân tổng thể sẽ tích hợp tại bộ tính kế hoạch hưu trí.",
    en: "Preview cash flow is standalone; overall personal retirement plan integrates via the retirement calculator.",
  },
};

type PanelTab = "v2-constraints" | "basic" | "v2-timing" | "v2-cashflow" | "v2-assets" | "v2-pension" | "v2-debts";

export default function FinancialProfilePanel() {
  const { language } = useI18n();
  const isVi = language === "vi";

  const {
    profile,
    v2Profile,
    schemaVersion,
    profileRevision,
    updateProfile,
    updateProfileV2,
    upgradeToV2,
    saveStatus,
    saveError,
    lastSavedAt,
    reloadProfile,
  } = useFinancialProfile();
  const { notify } = useNotification();

  const sectionTabsRef = useRef<HTMLDivElement>(null);
  const openSection = (tab: PanelTab) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      sectionTabsRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  };
  const [activeTab, setActiveTab] = useState<PanelTab>(schemaVersion === 2 ? "v2-timing" : "basic");
  const [form, setForm] = useState<FinancialProfile>(profile);
  const [v2Form, setV2Form] = useState<ProfileV2 | null>(v2Profile);
  const [error, setError] = useState("");
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showAssetReviewModal, setShowAssetReviewModal] = useState(false);

  // Pension simulation preview state
  const [pensionPreview, setPensionPreview] = useState<PensionPreviewResponse | null>(null);
  const [loadingPensionPreview, setLoadingPensionPreview] = useState(false);
  const [pensionPreviewError, setPensionPreviewError] = useState("");
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);

  const updatePensionKnown = (
    updater: (prev: Extract<PensionDeclaration, { status: "KNOWN" }>) => Extract<PensionDeclaration, { status: "KNOWN" }>
  ) => {
    if (!v2Form || v2Form.pension?.status !== "KNOWN") return;
    const nextPension = updater(v2Form.pension);
    setV2Form({ ...v2Form, pension: nextPension });
  };

  useEffect(() => {
    setForm(profile);
    setV2Form(v2Profile);
  }, [profile, v2Profile]);

  useEffect(() => { if (schemaVersion === 2) setActiveTab(tab => tab === "basic" ? "v2-timing" : tab); }, [schemaVersion]);
  const completion = v2Form ? profileCompletionItems(v2Form) : [];
  const missingCount = completion.filter(item => !item.complete).length;
  const busy = saveStatus === "saving" || isUpgrading;

  const handleUpgrade = async () => {
    setError("");
    setIsUpgrading(true);
    try {
      const ok = await upgradeToV2();
      if (ok) {
        notify.success(
          isVi ? "Nâng cấp thành công" : "Upgrade Successful",
          isVi
            ? "Hồ sơ của bạn đã được nâng cấp lên chuẩn chi tiết phiên bản 2."
            : "Your profile has been upgraded to detailed version 2 standards."
        );
        setShowAssetReviewModal(true);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : isVi
          ? "Chưa thể nâng cấp hồ sơ. Vui lòng thử lại."
          : "Could not upgrade profile. Please try again."
      );
    } finally {
      setIsUpgrading(false);
    }
  };

  const loadPensionPreview = async () => {
    if (!v2Form || !profileRevision) return;
    setLoadingPensionPreview(true);
    setPensionPreviewError("");
    try {
      const startMonth = v2Form.valuationDate.slice(0, 7);
      let assumptionVersionId: string | undefined = undefined;
      if (v2Form.pension?.status === "KNOWN" && v2Form.pension.priceBasis === "TODAY") {
        try {
          const published = await fetchPublishedAssumptions();
          if (published.items && published.items.length > 0) {
            assumptionVersionId = published.items[0].id;
          }
        } catch {
          // If fetching published assumptions fails, server preview will return PUBLISHED_INFLATION_REQUIRED issue
        }
      }
      const res = await fetchPensionPreview({
        expectedProfileRevision: profileRevision,
        startMonth,
        months: 120,
        assumptionVersionId,
      });
      setPensionPreview(res);
    } catch (err) {
      setPensionPreviewError(
        err instanceof Error
          ? err.message
          : isVi
          ? "Chưa thể tải dữ liệu mô phỏng lương hưu."
          : "Unable to load pension simulation data."
      );
    } finally {
      setLoadingPensionPreview(false);
    }
  };

  const saveBasic = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || schemaVersion === 2) return;
    setError("");
    const { personal, income, expenses, assets, debt, socialSecurity } = form;
    if (personal.age < 18 || personal.age > 74 || !Number.isInteger(personal.age)) {
      return setError(isVi ? "Tuổi hiện tại phải là số nguyên từ 18 đến 74." : "Current age must be an integer between 18 and 74.");
    }
    await updateProfile({ personal, income, expenses, assets, debt, socialSecurity });
  };

  const saveV2 = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !v2Form) return;
    setError("");

    // Validate birth and retirement months
    const birth = v2Form.personal.birthMonth;
    const ret = v2Form.personal.desiredRetirementMonth;
    if (birth.status === "KNOWN" && ret.status === "KNOWN" && ret.value < birth.value) {
      return setError(
        isVi
          ? "Tháng nghỉ hưu dự kiến không thể trước tháng năm sinh."
          : "Expected retirement month cannot be prior to birth month."
      );
    }

    // Validate asset shares sum to 100%
    if (v2Form.assets.status === "KNOWN") {
      for (const asset of v2Form.assets.entries) {
        if ([asset.retirementShare, asset.emergencyShare, asset.otherGoalsShare].some(share => share.status !== "KNOWN")) continue;
        const retShare = asset.retirementShare.status === "KNOWN" ? parseFloat(asset.retirementShare.value) : 0;
        const emgShare = asset.emergencyShare.status === "KNOWN" ? parseFloat(asset.emergencyShare.value) : 0;
        const othShare = asset.otherGoalsShare.status === "KNOWN" ? parseFloat(asset.otherGoalsShare.value) : 0;
        const sum = Math.round((retShare + emgShare + othShare) * 1000) / 1000;
        if (Math.abs(sum - 1.0) > 0.001) {
          return setError(
            isVi
              ? `Tài sản "${asset.label}": Tổng tỷ trọng phân bổ (Hưu trí + Dự phòng + Mục tiêu khác) phải bằng 100% (hiện tại: ${Math.round(sum * 100)}%).`
              : `Asset "${asset.label}": Total allocation share (Retirement + Emergency + Other Goals) must equal 100% (currently: ${Math.round(sum * 100)}%).`
          );
        }
      }
    }

    // Validate pension declaration if KNOWN
    if (v2Form.pension && v2Form.pension.status === "KNOWN") {
      const amtStr = v2Form.pension.monthlyAmount?.trim() || "";
      if (!amtStr || !/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(amtStr)) {
        return setError(
          isVi
            ? "Mức lương hưu dự kiến phải là số tiền hợp lệ không âm (ví dụ: 5000000 hoặc 5000000.00)."
            : "Expected pension amount must be a valid non-negative number (e.g., 5000000 or 5000000.00)."
        );
      }
      if (!v2Form.pension.source.trim()) {
        return setError(
          isVi
            ? "Vui lòng nhập nguồn ước tính lương hưu (ví dụ: VssID, Ước tính từ sổ BHXH, Doanh nghiệp)."
            : "Please enter the pension estimate source (e.g., VssID, Social Insurance booklet, Employer)."
        );
      }
      if (v2Form.pension.estimatedOn > v2Form.valuationDate) {
        return setError(
          isVi
            ? "Ngày lập ước tính lương hưu không được sau ngày định giá hồ sơ."
            : "Pension estimate date cannot be later than profile valuation date."
        );
      }
      if (v2Form.pension.priceBasis === "TODAY") {
        v2Form.pension.basisMonth = v2Form.valuationDate.slice(0, 7);
      } else if (v2Form.pension.priceBasis === "NOMINAL_AT_START") {
        if (v2Form.personal.pensionStartMonth.status === "KNOWN") {
          v2Form.pension.basisMonth = v2Form.personal.pensionStartMonth.value;
        } else {
          v2Form.pension.basisMonth = v2Form.valuationDate.slice(0, 7);
        }
      }
      if (v2Form.pension.adjustment.kind === "EXPLICIT_SCHEDULE") {
        const seen = new Set<string>();
        for (const entry of v2Form.pension.adjustment.entries) {
          if (!entry.effectiveMonth || !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(entry.effectiveMonth)) {
            return setError(
              isVi
                ? "Tháng áp dụng điều chỉnh phải có định dạng YYYY-MM."
                : "Adjustment effective month must follow format YYYY-MM."
            );
          }
          if (seen.has(entry.effectiveMonth)) {
            return setError(
              isVi
                ? `Mốc điều chỉnh tháng ${entry.effectiveMonth} bị trùng lặp.`
                : `Adjustment milestone for month ${entry.effectiveMonth} is duplicated.`
            );
          }
          seen.add(entry.effectiveMonth);
          if (v2Form.personal.pensionStartMonth.status === "KNOWN" && entry.effectiveMonth <= v2Form.personal.pensionStartMonth.value) {
            return setError(
              isVi
                ? `Mốc điều chỉnh (${entry.effectiveMonth}) phải sau tháng bắt đầu nhận lương hưu (${v2Form.personal.pensionStartMonth.value}).`
                : `Adjustment milestone (${entry.effectiveMonth}) must be after pension start month (${v2Form.personal.pensionStartMonth.value}).`
            );
          }
          if (!entry.monthlyAmount || !/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(entry.monthlyAmount)) {
            return setError(
              isVi
                ? `Mức tiền điều chỉnh tháng ${entry.effectiveMonth} không hợp lệ.`
                : `Adjustment amount for month ${entry.effectiveMonth} is invalid.`
            );
          }
        }
      }
    }

    const ok = await updateProfileV2(v2Form);
    if (ok) {
      notify.success(
        isVi ? "Đã lưu hồ sơ" : "Profile v2 Saved",
        isVi ? "Các tham số tài chính chi tiết đã được cập nhật." : "Detailed financial parameters have been updated."
      );
      if (activeTab === "v2-pension") {
        loadPensionPreview();
      }
    }
  };

  // Helper to add new asset
  const handleAddAsset = () => {
    if (!v2Form) return;
    const newAsset: AssetEntry = {
      id: `ast_${Date.now()}`,
      label: isVi ? "Tài sản mới" : "New Asset",
      type: "CASH",
      value: { status: "KNOWN", value: "0.00" },
      currency: "VND",
      valuedOn: { status: "KNOWN", value: v2Form.valuationDate },
      ownershipShare: { status: "KNOWN", value: "1" },
      retirementShare: { status: "KNOWN", value: "1" },
      emergencyShare: { status: "KNOWN", value: "0" },
      otherGoalsShare: { status: "KNOWN", value: "0" },
      liquidity: { status: "KNOWN", value: "LIQUID" },
      availableFromMonth: { status: "KNOWN", value: v2Form.valuationDate.slice(0, 7) },
    };
    const currentEntries = v2Form.assets.status === "KNOWN" ? v2Form.assets.entries : [];
    setV2Form({
      ...v2Form,
      assets: { status: "KNOWN", entries: [...currentEntries, newAsset] },
    });
  };

  const handleRemoveAsset = (id: string) => {
    if (!v2Form || v2Form.assets.status !== "KNOWN") return;
    setV2Form({
      ...v2Form,
      assets: {
        status: "KNOWN",
        entries: v2Form.assets.entries.filter((a) => a.id !== id),
      },
    });
  };

  const groups = [
    {
      key: "income" as const,
      title: isVi ? "Thu nhập hàng tháng" : "Monthly Income",
      fields: {
        primaryIncome: isVi ? "Thu nhập chính" : "Primary Income",
        secondaryIncome: isVi ? "Thu nhập khác" : "Other Income",
      },
    },
    {
      key: "expenses" as const,
      title: isVi ? "Chi tiêu hàng tháng" : "Monthly Expenses",
      fields: {
        essentialExpense: isVi ? "Chi tiêu thiết yếu" : "Essential Expenses",
        lifestyleExpense: isVi ? "Chi tiêu linh hoạt" : "Discretionary Expenses",
      },
    },
    {
      key: "assets" as const,
      title: isVi ? "Tài sản hiện tại" : "Current Assets",
      fields: {
        cashSavings: isVi ? "Tiền tiết kiệm" : "Savings & Cash",
        realEstateValue: isVi ? "Bất động sản" : "Real Estate Value",
        liquidAssets: isVi ? "Tài sản khác có thể đổi thành tiền" : "Other Liquid Assets",
        stockFundValue: isVi ? "Cổ phiếu và quỹ" : "Stocks & Funds",
      },
    },
    {
      key: "debt" as const,
      title: isVi ? "Khoản nợ" : "Liabilities & Debt",
      fields: {
        mortgageDebt: isVi ? "Nợ mua nhà" : "Mortgage Debt",
        consumerDebt: isVi ? "Nợ tiêu dùng" : "Consumer Debt",
        monthlyDebtService: isVi ? "Trả nợ hàng tháng" : "Monthly Debt Service",
      },
    },
    {
      key: "socialSecurity" as const,
      title: isVi ? "Bảo hiểm xã hội" : "Social Insurance (BHXH)",
      fields: {
        socialInsuranceYears: isVi ? "Số năm đã đóng" : "Years Contributed",
        socialInsuranceSalary: isVi ? "Lương đóng bảo hiểm" : "Contribution Wage Basis",
      },
    },
  ];

  // Helper mappings for v1 selects
  const genderOptions = [
    { key: "Nam", label: isVi ? "Nam" : "Male" },
    { key: "Nữ", label: isVi ? "Nữ" : "Female" },
    { key: "Khác", label: isVi ? "Khác" : "Other" },
    { key: "Không tiết lộ", label: isVi ? "Không tiết lộ" : "Prefer not to say" },
  ];

  const maritalOptions = [
    { key: "Độc thân", label: isVi ? "Độc thân" : "Single" },
    { key: "Đã kết hôn", label: isVi ? "Đã kết hôn" : "Married" },
    { key: "Khác", label: isVi ? "Khác" : "Other" },
  ];

  return (
    <Card className="account-card financial-profile-editor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
            <h2>{isVi ? "Thông tin của bạn" : "Your information"}</h2>
          </div>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            {isVi
              ? "Các mục màu đỏ cần được bổ sung. Bạn có thể chỉnh sửa mọi thông tin đã khai và bấm Lưu khi hoàn tất."
              : "Quantitative baseline for retirement planning calculations, cash flow projections, and debt management."}
          </p>
        </div>

        {schemaVersion !== 2 && (
          <Button variant="secondary" onClick={handleUpgrade} loading={isUpgrading}>
            <Icon name="sparkles" size="small" /> {isVi ? "Bổ sung hồ sơ chi tiết" : "Upgrade to Detailed Profile"}
          </Button>
        )}
      </div>

      {v2Form && <section className="profile-checklist" aria-label={isVi ? "Kiểm tra độ hoàn thiện hồ sơ" : "Profile completion checklist"}>
        <div className="profile-checklist-heading"><h3>{missingCount ? (isVi ? `Còn ${missingCount} mục cần bổ sung` : `${missingCount} items to complete`) : (isVi ? "Bạn đã khai đủ các mục chính" : "Your main profile items are complete")}</h3><span>{isVi ? "Chọn một mục để xem hoặc sửa" : "Select an item to view or edit"}</span></div>
        <div className="profile-checklist-grid">{completion.map(item => <button type="button" key={item.key} className={item.complete ? "is-complete" : "is-missing"} onClick={() => openSection(item.tab)}><Icon name={item.complete ? "circle-check" : "alert"} size="small" /><span>{isVi ? item.vi : item.en}<small>{item.complete ? (isVi ? "Đã khai · Có thể sửa" : "Completed · Edit") : (isVi ? "Cần bổ sung" : "Needs information")}</small></span><Icon name="chevron-right" size="small" /></button>)}</div>
        <p>{isVi ? "Sau khi chỉnh sửa, hãy bấm Lưu ở cuối mỗi phần. Độ hoàn thiện hồ sơ sẽ cập nhật khi lưu thành công." : "Completed fields are not saved automatically. The page percentage updates after a successful save."}</p>
      </section>}
      {saveStatus === "saved" && activeTab !== "basic" && <p role="status" className="profile-save-success">{isVi ? "Đã lưu hồ sơ vào tài khoản" : "Profile saved to your account"}{lastSavedAt ? ` · ${lastSavedAt}` : ""}</p>}
      {/* Tabs */}
      {saveError && <div role="alert"><p>{saveError}</p><p>{isVi ? "Nếu phiên bản đã đổi, hãy đối chiếu câu trả lời đang nhập trước khi tải lại; không tự ghi đè." : "If the revision changed, compare your edits before reloading; no automatic overwrite."}</p><Button variant="secondary" onClick={reloadProfile}>{isVi ? "Tải lại hồ sơ để đối chiếu" : "Reload profile for comparison"}</Button></div>}
      {schemaVersion === 2 && <Button variant="secondary" onClick={() => openSection("v2-constraints")}>{isVi ? "Ràng buộc và mục tiêu" : "Constraints and goals"}</Button>}
      <div ref={sectionTabsRef} className="profile-section-tabs" style={{ display: "flex", gap: "var(--space-2)", borderBottom: "1px solid var(--color-border)", paddingBottom: "var(--space-2)", marginBottom: "var(--space-4)", overflowX: "auto" }}>
        {schemaVersion !== 2 && <>
        <button
          type="button"
          className={`btn-filter ${activeTab === "basic" ? "is-active" : ""}`}
          onClick={() => setActiveTab("basic")}
        >
          {isVi ? "Tổng quan cơ bản" : "Basic Overview"}
        </button>
        </>}
        {schemaVersion === 2 && (
          <>
            <button
              type="button"
              className={`btn-filter ${activeTab === "v2-timing" ? "is-active" : ""}`}
              onClick={() => setActiveTab("v2-timing")}
            >
              {isVi ? "Thông tin & thời gian" : "Personal details & dates"}
            </button>
            <button
              type="button"
              className={`btn-filter ${activeTab === "v2-cashflow" ? "is-active" : ""}`}
              onClick={() => setActiveTab("v2-cashflow")}
            >
              {isVi ? "Thu nhập & chi tiêu" : "Income & expenses"}
            </button>
            <button
              type="button"
              className={`btn-filter ${activeTab === "v2-assets" ? "is-active" : ""}`}
              onClick={() => setActiveTab("v2-assets")}
            >
              {isVi ? "Tài sản" : "Assets"}
            </button>
            <button type="button" className={`btn-filter ${activeTab === "v2-debts" ? "is-active" : ""}`} onClick={() => setActiveTab("v2-debts")}>{isVi ? "Khoản nợ" : "Debts"}</button>
            <button
              type="button"
              className={`btn-filter ${activeTab === "v2-pension" ? "is-active" : ""}`}
              onClick={() => {
                setActiveTab("v2-pension");
                if (!pensionPreview && profileRevision > 0) {
                  loadPensionPreview();
                }
              }}
            >
              {isVi ? "Lương hưu" : "Pension"}
            </button>
          </>
        )}
      </div>

      {/* Tab 1: Basic View */}
      {activeTab === "basic" && schemaVersion !== 2 && (
        <form onSubmit={saveBasic}>
          <fieldset className="account-api-fields" disabled={busy}>
            <div className="account-form-grid">
              <Input
                type="number"
                label={isVi ? "Tuổi hiện tại" : "Current Age"}
                value={String(form.personal.age)}
                onChange={(value) => setForm((p) => ({ ...p, personal: { ...p.personal, age: Number(value) } }))}
              />
              <Select
                label={isVi ? "Giới tính" : "Gender"}
                options={genderOptions.map((o) => o.label)}
                value={genderOptions.find((o) => o.key === form.personal.gender)?.label || genderOptions[0].label}
                onChange={(selectedLabel) => {
                  const matched = genderOptions.find((o) => o.label === selectedLabel);
                  if (matched) setForm((p) => ({ ...p, personal: { ...p.personal, gender: matched.key } }));
                }}
              />
              <Select
                label={isVi ? "Tình trạng hôn nhân" : "Marital Status"}
                options={maritalOptions.map((o) => o.label)}
                value={maritalOptions.find((o) => o.key === form.personal.maritalStatus)?.label || maritalOptions[0].label}
                onChange={(selectedLabel) => {
                  const matched = maritalOptions.find((o) => o.label === selectedLabel);
                  if (matched) setForm((p) => ({ ...p, personal: { ...p.personal, maritalStatus: matched.key } }));
                }}
              />
              <Input
                type="number"
                label={isVi ? "Số người phụ thuộc" : "Number of Dependents"}
                value={String(form.personal.dependents)}
                onChange={(value) => setForm((p) => ({ ...p, personal: { ...p.personal, dependents: Number(value) } }))}
              />
              <Input
                label={isVi ? "Nơi sinh sống dự kiến" : "Expected Place of Living"}
                value={form.personal.city}
                onChange={(city) => setForm((p) => ({ ...p, personal: { ...p.personal, city } }))}
              />
            </div>

            {groups.map((group) => (
              <section key={group.key} style={{ marginTop: "var(--space-4)" }}>
                <h3 style={{ fontSize: "var(--text-base)", marginBottom: "var(--space-2)" }}>{group.title}</h3>
                {group.key === "debt" && (
                  <div style={{ marginBottom: "var(--space-3)" }}>
                    <Checkbox
                      label={isVi ? "Tôi đang có khoản nợ tài chính" : "I currently have financial liabilities"}
                      checked={form.debt.hasDebt}
                      onChange={(hasDebt) =>
                        setForm((p) => ({
                          ...p,
                          debt: {
                            ...p.debt,
                            hasDebt,
                            ...(!hasDebt ? { mortgageDebt: 0, consumerDebt: 0, monthlyDebtService: 0 } : {}),
                          },
                        }))
                      }
                    />
                  </div>
                )}
                <div className="account-form-grid">
                  {Object.entries(group.fields).map(([key, label]) => (
                    <Input
                      key={key}
                      money={key !== "socialInsuranceYears"}
                      label={label}
                      type="number"
                      value={String((form[group.key] as unknown as Record<string, number>)[key])}
                      disabled={group.key === "debt" && !form.debt.hasDebt}
                      onChange={(value) =>
                        setForm((p) => ({
                          ...p,
                          [group.key]: { ...(p[group.key] as unknown as Record<string, unknown>), [key]: Number(value) },
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
            ))}

            {(error || saveError) && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <Alert
                  tone="danger"
                  title={isVi ? "Chưa lưu được hồ sơ" : "Could not save profile"}
                  action={
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(isVi ? "Tải lại hồ sơ và bỏ các thay đổi chưa lưu?" : "Reload profile and discard unsaved changes?")) {
                          reloadProfile();
                        }
                      }}
                    >
                      {isVi ? "Tải bản mới nhất" : "Load latest version"}
                    </Button>
                  }
                >
                  {error || saveError}
                </Alert>
              </div>
            )}

            {saveStatus === "saved" && (
              <p role="status" style={{ color: "var(--color-success)", marginTop: "var(--space-3)" }}>
                {isVi ? "Đã lưu vào tài khoản" : "Saved to account"}{" "}
                {lastSavedAt && (isVi ? `lúc ${lastSavedAt}` : `at ${lastSavedAt}`)}.
              </p>
            )}

            <div style={{ marginTop: "var(--space-4)" }}>
              <Button type="submit" variant="primary" loading={busy}>
                {isVi ? "Lưu hồ sơ tài chính" : "Save Financial Profile"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}

      {/* Tab 2: V2 Timing */}
      {activeTab === "v2-timing" && v2Form && (
        <form onSubmit={saveV2}>
          <fieldset className="account-api-fields" disabled={busy}>
            <div style={{ marginBottom: "var(--space-3)" }}>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                {isVi
                  ? "Các mốc thời gian giúp tính kế hoạch nghỉ hưu của bạn theo từng tháng. Nhập ngày sinh và thời điểm bạn dự định nghỉ hưu."
                  : "Version 2 standardizes timeline milestones into exact year-month format (YYYY-MM) to project periodic cash flows instead of rounded years."}
              </p>
            </div>

            <div className="account-form-grid">
              <Select label={isVi ? "Giới tính" : "Gender"} options={[{ value: "UNDISCLOSED", label: isVi ? "Chưa cung cấp" : "Not provided" }, { value: "MALE", label: isVi ? "Nam" : "Male" }, { value: "FEMALE", label: isVi ? "Nữ" : "Female" }, { value: "OTHER", label: isVi ? "Khác" : "Other" }]} value={v2Form.personal.gender ?? "UNDISCLOSED"} onChange={value => setV2Form({ ...v2Form, personal: { ...v2Form.personal, gender: value as NonNullable<ProfileV2["personal"]["gender"]> } })} />
              <Input label={isVi ? "Nơi sinh sống (không bắt buộc)" : "Place of living (optional)"} value={v2Form.personal.city ?? ""} onChange={city => setV2Form({ ...v2Form, personal: { ...v2Form.personal, city } })} />

              <Input
                type="month"
                label={isVi ? "Tháng năm sinh" : "Birth Month (YYYY-MM)"}
                value={v2Form.personal.birthMonth.status === "KNOWN" ? v2Form.personal.birthMonth.value : ""}
                onChange={(val) =>
                  setV2Form({
                    ...v2Form,
                    personal: {
                      ...v2Form.personal,
                      birthMonth: val ? { status: "KNOWN", value: val } : { status: "UNKNOWN" },
                    },
                  })
                }
              />
              <Input
                type="month"
                label={isVi ? "Tháng dự kiến nghỉ hưu" : "Expected Retirement Month (YYYY-MM)"}
                value={
                  v2Form.personal.desiredRetirementMonth.status === "KNOWN"
                    ? v2Form.personal.desiredRetirementMonth.value
                    : ""
                }
                onChange={(val) =>
                  setV2Form({
                    ...v2Form,
                    personal: {
                      ...v2Form.personal,
                      desiredRetirementMonth: val ? { status: "KNOWN", value: val } : { status: "UNKNOWN" },
                    },
                  })
                }
              />
              <Input
                type="date"
                label={isVi ? "Ngày cập nhật số liệu tài chính" : "Asset Valuation Cut-off Date"}
                value={v2Form.valuationDate}
                onChange={(val) => setV2Form({ ...v2Form, valuationDate: val })}
              />
            </div>

            {(error || saveError) && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <Alert tone="danger" title={isVi ? "Lỗi thông tin" : "Information Error"}>{error || saveError}</Alert>
              </div>
            )}

            <div style={{ marginTop: "var(--space-4)" }}>
              <Button type="submit" variant="primary" loading={busy}>
                {isVi ? "Lưu thông tin & thời gian" : "Save Timeline v2"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}

      {activeTab === "v2-debts" && v2Form && <form onSubmit={saveV2}><fieldset className="account-api-fields" disabled={busy}>
        <h3>{isVi ? "Các khoản nợ của bạn" : "Your debts"}</h3>
        {v2Form.debts.status === "UNKNOWN" && <p className="profile-missing-note">{isVi ? "Bạn chưa xác nhận có khoản nợ hay không." : "Please confirm whether you have debts."}</p>}
        {v2Form.debts.status === "NOT_APPLICABLE" && <p>{isVi ? "Bạn đã xác nhận không có khoản nợ." : "You have confirmed that you have no debts."}</p>}
        {v2Form.debts.status === "KNOWN" && <div className="profile-debt-list">{v2Form.debts.entries.map(debt => <div key={debt.id}><strong>{debt.label}</strong><span>{isVi ? "Đã khai trong hồ sơ" : "Recorded in your profile"}</span></div>)}</div>}
        <p>{isVi ? "Thêm hoặc sửa khoản vay tại trang Khoản vay & Nợ để giữ đúng lịch trả nợ và hợp đồng." : "Add or edit loans on Loans & Debts to keep repayment schedules and contracts consistent."}</p>
        <div className="profile-debt-actions"><Link className="button button-secondary" to="/user/debts">{isVi ? "Thêm / sửa khoản vay" : "Add / edit loans"}</Link>
        {v2Form.debts.status !== "KNOWN" && <Button variant="secondary" onClick={() => setV2Form({ ...v2Form, debts: { status: "NOT_APPLICABLE", reason: "Người dùng xác nhận không có khoản nợ" } })}>{isVi ? "Tôi không có khoản nợ" : "I have no debts"}</Button>}
        <Button type="submit" loading={busy}>{isVi ? "Lưu thông tin khoản nợ" : "Save debt information"}</Button></div>
        {(error || saveError) && <p role="alert">{error || saveError}</p>}
      </fieldset></form>}

      {/* Tab 3: V2 Cashflow */}
      {activeTab === "v2-cashflow" && v2Form && (
        <form onSubmit={saveV2}>
          <fieldset className="account-api-fields" disabled={busy}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <h3 style={{ fontSize: "var(--text-base)", margin: 0 }}>
                {isVi ? "Nguồn thu nhập chi tiết" : "Detailed Income Sources"}
              </h3>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const current = v2Form.income.status === "KNOWN" ? v2Form.income.entries : [];
                  const newEntry: IncomeEntry = {
                    id: `inc_${Date.now()}`,
                    label: isVi ? `Khoản thu #${current.length + 1}` : `Income #${current.length + 1}`,
                    kind: "FIXED",
                    source: "EMPLOYMENT",
                    basis: "DISPOSABLE",
                    amount: { status: "KNOWN", value: "0.00" },
                    currency: "VND",
                    startMonth: v2Form.valuationDate.slice(0, 7),
                    endMonth: null,
                    frequency: "MONTHLY",
                  };
                  setV2Form({ ...v2Form, income: { status: "KNOWN", entries: [...current, newEntry] } });
                }}
              >
                {isVi ? "+ Thêm nguồn thu nhập" : "+ Add Income Source"}
              </Button>
            </div>

            {v2Form.income.status === "UNKNOWN" && <p className="profile-missing-note">{isVi ? "Chưa khai báo nguồn thu nhập. Hãy thêm thông tin hoặc xác nhận không có." : "Information is missing. Add an entry or confirm none."}</p>}
            {v2Form.income.status !== "KNOWN" && <Button variant="ghost" onClick={() => setV2Form({ ...v2Form, income: { status: "NOT_APPLICABLE", reason: "Người dùng xác nhận không có nguồn thu nhập" } })}>{isVi ? "Tôi không có nguồn thu nhập" : "I have none"}</Button>}
            {v2Form.income.status === "KNOWN" && v2Form.income.entries.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
                {v2Form.income.entries.map((inc, idx) => (
                  <div key={inc.id} className="profile-cashflow-row">
                    <Input
                      label={isVi ? `Khoản thu #${idx + 1}` : `Income #${idx + 1}`}
                      value={inc.label}
                      onChange={(lbl) => {
                        const entries = [...(v2Form.income as { status: "KNOWN"; entries: IncomeEntry[] }).entries];
                        entries[idx] = { ...entries[idx], label: lbl };
                        setV2Form({ ...v2Form, income: { status: "KNOWN", entries } });
                      }}
                    />
                    <Select
                      label={isVi ? "Phân loại" : "Category"}
                      options={[
                        { value: "FIXED", label: isVi ? "Thu nhập cố định" : "Fixed Income" },
                        { value: "BONUS", label: isVi ? "Tiền thưởng" : "Bonus" },
                        { value: "IRREGULAR", label: isVi ? "Thu nhập không đều" : "Irregular" },
                      ]}
                      value={inc.kind}
                      onChange={(k) => {
                        const entries = [...(v2Form.income as { status: "KNOWN"; entries: IncomeEntry[] }).entries];
                        entries[idx] = { ...entries[idx], kind: k as "FIXED" | "BONUS" | "IRREGULAR" };
                        setV2Form({ ...v2Form, income: { status: "KNOWN", entries } });
                      }}
                    />
                    <Input
                      type="number"
                      money
                      label={isVi ? "Số tiền (VND)" : "Amount (VND)"}
                      value={inc.amount.status === "KNOWN" ? inc.amount.value : ""}
                      onChange={(amt) => {
                        const entries = [...(v2Form.income as { status: "KNOWN"; entries: IncomeEntry[] }).entries];
                        entries[idx] = { ...entries[idx], amount: amt === "" ? { status: "UNKNOWN" } : { status: "KNOWN", value: amt } };
                        setV2Form({ ...v2Form, income: { status: "KNOWN", entries } });
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const entries = (v2Form.income as { status: "KNOWN"; entries: IncomeEntry[] }).entries.filter((_, i) => i !== idx);
                        setV2Form({ ...v2Form, income: { status: "KNOWN", entries } });
                      }}
                    >
                      {isVi ? "Xóa" : "Delete"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--color-text-muted)" }}>
                {isVi ? "Chưa có nguồn thu nhập riêng lẻ." : "No individual income sources recorded."}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)", marginTop: "var(--space-4)" }}>
              <h3 style={{ fontSize: "var(--text-base)", margin: 0 }}>
                {isVi ? "Khoản chi tiêu chi tiết" : "Detailed Expense Items"}
              </h3>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const current = v2Form.expenses.status === "KNOWN" ? v2Form.expenses.entries : [];
                  const newEntry: ExpenseEntry = {
                    id: `exp_${Date.now()}`,
                    label: isVi ? `Khoản chi #${current.length + 1}` : `Expense #${current.length + 1}`,
                    category: "ESSENTIAL",
                    amount: { status: "KNOWN", value: "0.00" },
                    currency: "VND",
                    startMonth: v2Form.valuationDate.slice(0, 7),
                    endMonth: null,
                    frequency: "MONTHLY",
                  };
                  setV2Form({ ...v2Form, expenses: { status: "KNOWN", entries: [...current, newEntry] } });
                }}
              >
                {isVi ? "+ Thêm khoản chi tiêu" : "+ Add Expense Item"}
              </Button>
            </div>

            {v2Form.expenses.status === "UNKNOWN" && <p className="profile-missing-note">{isVi ? "Chưa khai báo khoản chi tiêu. Hãy thêm thông tin hoặc xác nhận không có." : "Information is missing. Add an entry or confirm none."}</p>}
            {v2Form.expenses.status !== "KNOWN" && <Button variant="ghost" onClick={() => setV2Form({ ...v2Form, expenses: { status: "NOT_APPLICABLE", reason: "Người dùng xác nhận không có khoản chi tiêu" } })}>{isVi ? "Tôi không có khoản chi tiêu" : "I have none"}</Button>}
            {v2Form.expenses.status === "KNOWN" && v2Form.expenses.entries.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
                {v2Form.expenses.entries.map((exp, idx) => (
                  <div key={exp.id} className="profile-cashflow-row">
                    <Input
                      label={isVi ? `Khoản chi #${idx + 1}` : `Expense #${idx + 1}`}
                      value={exp.label}
                      onChange={(lbl) => {
                        const entries = [...(v2Form.expenses as { status: "KNOWN"; entries: ExpenseEntry[] }).entries];
                        entries[idx] = { ...entries[idx], label: lbl };
                        setV2Form({ ...v2Form, expenses: { status: "KNOWN", entries } });
                      }}
                    />
                    <Select
                      label={isVi ? "Nhóm chi" : "Group"}
                      options={[
                        { value: "ESSENTIAL", label: isVi ? "Chi thiết yếu" : "Essential" },
                        { value: "OPTIONAL", label: isVi ? "Chi có thể điều chỉnh" : "Discretionary" },
                        { value: "HEALTH", label: isVi ? "Y tế" : "Healthcare" },
                        { value: "INSURANCE", label: isVi ? "Bảo hiểm" : "Insurance" },
                        { value: "DEPENDENT", label: isVi ? "Chi cho người phụ thuộc" : "Dependent" },
                        { value: "DEBT_PAYMENT", label: isVi ? "Trả nợ" : "Debt Service" },
                      ]}
                      value={exp.category}
                      onChange={(cat) => {
                        const entries = [...(v2Form.expenses as { status: "KNOWN"; entries: ExpenseEntry[] }).entries];
                        entries[idx] = { ...entries[idx], category: cat as any };
                        setV2Form({ ...v2Form, expenses: { status: "KNOWN", entries } });
                      }}
                    />
                    <Input
                      type="number"
                      money
                      label={isVi ? "Số tiền (VND)" : "Amount (VND)"}
                      value={exp.amount.status === "KNOWN" ? exp.amount.value : ""}
                      onChange={(amt) => {
                        const entries = [...(v2Form.expenses as { status: "KNOWN"; entries: ExpenseEntry[] }).entries];
                        entries[idx] = { ...entries[idx], amount: amt === "" ? { status: "UNKNOWN" } : { status: "KNOWN", value: amt } };
                        setV2Form({ ...v2Form, expenses: { status: "KNOWN", entries } });
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const entries = (v2Form.expenses as { status: "KNOWN"; entries: ExpenseEntry[] }).entries.filter((_, i) => i !== idx);
                        setV2Form({ ...v2Form, expenses: { status: "KNOWN", entries } });
                      }}
                    >
                      {isVi ? "Xóa" : "Delete"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--color-text-muted)" }}>
                {isVi ? "Chưa có khoản chi riêng lẻ." : "No individual expense items recorded."}
              </p>
            )}

            {(error || saveError) && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <Alert tone="danger" title={isVi ? "Lỗi thông tin" : "Information Error"}>{error || saveError}</Alert>
              </div>
            )}

            <div style={{ marginTop: "var(--space-4)" }}>
              <Button type="submit" variant="primary" loading={busy}>
                {isVi ? "Lưu thu nhập & chi tiêu" : "Save Cash Flow v2"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}

      {/* Tab 4: V2 Assets */}
      {activeTab === "v2-constraints" && v2Form && <form onSubmit={saveV2}><fieldset disabled={busy} style={{ border: 0, minWidth: 0, padding: 0 }}><PlanningQuestions data={v2Form} onChange={next => setV2Form({ ...v2Form, ...next })} valuationMonth={v2Form.valuationDate.slice(0, 7)} /><Button type="submit" loading={busy}>{isVi ? "Lưu ràng buộc và mục tiêu" : "Save constraints and goals"}</Button></fieldset></form>}
      {activeTab === "v2-assets" && v2Form && (
        <form onSubmit={saveV2}>
          <fieldset className="account-api-fields" disabled={busy}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)", flexWrap: "wrap", gap: "var(--space-2)" }}>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                {isVi
                  ? "Chọn tài sản dành cho hưu trí, dự phòng hoặc mục tiêu khác. Chỉ phần bạn dành cho hưu trí mới được đưa vào kế hoạch."
                  : "Standard T01: Clearly segregate asset purposes (Retirement, Emergency, Other Goals) and liquidity to optimize planning."}
              </p>
              <Button type="button" variant="secondary" onClick={handleAddAsset}>
                <Icon name="plus" size="small" /> {isVi ? "Thêm tài sản" : "Add Asset"}
              </Button>
            </div>

            {v2Form.assets.status === "UNKNOWN" && <p className="profile-missing-note">{isVi ? "Chưa khai báo tài sản. Hãy thêm thông tin hoặc xác nhận không có." : "Information is missing. Add an entry or confirm none."}</p>}
            {v2Form.assets.status !== "KNOWN" && <Button variant="ghost" onClick={() => setV2Form({ ...v2Form, assets: { status: "NOT_APPLICABLE", reason: "Người dùng xác nhận không có tài sản" } })}>{isVi ? "Tôi không có tài sản" : "I have none"}</Button>}
            {v2Form.assets.status === "KNOWN" && v2Form.assets.entries.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {v2Form.assets.entries.map((asset, idx) => (
                  <Card key={asset.id} className="profile-entry-card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
                      <strong style={{ fontSize: "var(--text-base)" }}>
                        #{idx + 1}: {asset.label}
                      </strong>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleRemoveAsset(asset.id)}
                      >
                        <Icon name="trash" size="small" /> {isVi ? "Xóa" : "Delete"}
                      </Button>
                    </div>

                    <div className="account-form-grid" style={{ marginBottom: "var(--space-3)" }}>
                      <Input
                        label={isVi ? "Tên tài sản" : "Asset Name"}
                        value={asset.label}
                        onChange={(lbl) => {
                          const entries = [...(v2Form.assets as { status: "KNOWN"; entries: AssetEntry[] }).entries];
                          entries[idx] = { ...entries[idx], label: lbl };
                          setV2Form({ ...v2Form, assets: { status: "KNOWN", entries } });
                        }}
                      />
                      <Select
                        label={isVi ? "Loại tài sản" : "Asset Type"}
                        options={[
                          { value: "CASH", label: isVi ? "Tiền mặt" : "Cash" },
                          { value: "DEPOSIT", label: isVi ? "Tiền gửi" : "Savings Deposit" },
                          { value: "STOCK_FUND", label: isVi ? "Cổ phiếu và quỹ" : "Stock / Fund" },
                          { value: "GOLD", label: isVi ? "Vàng" : "Gold" },
                          { value: "BOND", label: isVi ? "Trái phiếu" : "Bond" },
                          { value: "PRIMARY_HOME", label: isVi ? "Nhà đang ở" : "Primary Residence" },
                          { value: "REAL_ESTATE", label: isVi ? "Bất động sản khác" : "Other Real Estate" },
                          { value: "OTHER", label: isVi ? "Khác" : "Other" },
                        ]}
                        value={asset.type}
                        onChange={(t) => {
                          const entries = [...(v2Form.assets as { status: "KNOWN"; entries: AssetEntry[] }).entries];
                          entries[idx] = { ...entries[idx], type: t as any };
                          setV2Form({ ...v2Form, assets: { status: "KNOWN", entries } });
                        }}
                      />
                      <Input
                        type="number"
                        money
                      label={isVi ? "Giá trị (VND)" : "Value (VND)"}
                        value={asset.value.status === "KNOWN" ? asset.value.value : ""}
                        onChange={(val) => {
                          const entries = [...(v2Form.assets as { status: "KNOWN"; entries: AssetEntry[] }).entries];
                          entries[idx] = { ...entries[idx], value: val === "" ? { status: "UNKNOWN" } : { status: "KNOWN", value: val } };
                          setV2Form({ ...v2Form, assets: { status: "KNOWN", entries } });
                        }}
                      />
                      <BaseInput label={isVi ? "Giá vốn (VND, tùy chọn)" : "Cost basis (VND, optional)"} inputMode="decimal" value={asset.costBasis?.status === "KNOWN" ? asset.costBasis.value : ""} onChange={value => {
                        const entries = [...(v2Form.assets as { status: "KNOWN"; entries: AssetEntry[] }).entries];
                        entries[idx] = { ...asset, costBasis: value === "" ? { status: "UNKNOWN" } : { status: "KNOWN", value } };
                        setV2Form({ ...v2Form, assets: { status: "KNOWN", entries } });
                      }} />
                      <Select
                        label={isVi ? "Khả năng đổi thành tiền" : "Liquidity"}
                        options={[
                          { value: "UNKNOWN", label: isVi ? "Chưa xác định" : "Not specified" },
                          { value: "LIQUID", label: isVi ? "Dễ đổi thành tiền" : "Liquid" },
                          { value: "ILLIQUID", label: isVi ? "Khó đổi thành tiền" : "Illiquid" },
                          { value: "LOCKED", label: isVi ? "Chưa thể rút hoặc bán" : "Locked" },
                        ]}
                        value={asset.liquidity.status === "KNOWN" ? asset.liquidity.value : "UNKNOWN"}
                        onChange={(l) => {
                          const entries = [...(v2Form.assets as { status: "KNOWN"; entries: AssetEntry[] }).entries];
                          entries[idx] = { ...entries[idx], liquidity: l === "UNKNOWN" ? { status: "UNKNOWN" } : { status: "KNOWN", value: l as "LIQUID" | "ILLIQUID" | "LOCKED" } };
                          setV2Form({ ...v2Form, assets: { status: "KNOWN", entries } });
                        }}
                      />
                    </div>

                    <div className="account-form-grid" style={{ marginBottom: 20 }}>
                      <Input type="date" label={isVi ? "Ngày xác định giá trị tài sản" : "Asset valuation date"} value={asset.valuedOn.status === "KNOWN" ? asset.valuedOn.value : ""} onChange={value => { const entries = [...(v2Form.assets as {status: "KNOWN"; entries: AssetEntry[]}).entries]; entries[idx] = {...asset, valuedOn: value ? {status: "KNOWN", value} : {status: "UNKNOWN"}}; setV2Form({...v2Form, assets: {status: "KNOWN", entries}}); }} />
                      <Input type="number" min={0} max={100} step="any" label={isVi ? "Phần tài sản thuộc sở hữu của bạn (%)" : "Your ownership share (%)"} value={asset.ownershipShare.status === "KNOWN" ? String(Number(asset.ownershipShare.value) * 100) : ""} onChange={value => { const entries = [...(v2Form.assets as {status: "KNOWN"; entries: AssetEntry[]}).entries]; entries[idx] = {...asset, ownershipShare: value !== "" ? {status: "KNOWN", value: String(Number(value) / 100)} : {status: "UNKNOWN"}}; setV2Form({...v2Form, assets: {status: "KNOWN", entries}}); }} />
                      <Input type="month" label={isVi ? "Tháng có thể sử dụng tài sản" : "Available from month"} value={asset.availableFromMonth.status === "KNOWN" ? asset.availableFromMonth.value : ""} onChange={value => { const entries = [...(v2Form.assets as {status: "KNOWN"; entries: AssetEntry[]}).entries]; entries[idx] = {...asset, availableFromMonth: value ? {status: "KNOWN", value} : {status: "UNKNOWN"}}; setV2Form({...v2Form, assets: {status: "KNOWN", entries}}); }} />
                    </div>
                    {/* Purpose shares */}
                    <div style={{ background: "var(--color-surface-subtle)", padding: "var(--space-3)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>
                        {isVi ? "Bạn dành tài sản này cho mục đích nào? (Tổng 100%)" : "PURPOSE ALLOCATION (MUST SUM TO 100%)"}
                      </div>
                      <div className="profile-allocation-grid">
                        <Input
                          type="number"
                          label={isVi ? "Dành cho nghỉ hưu (%)" : "Retirement Share (%)"}
                          value={asset.retirementShare.status === "KNOWN" ? String(Number(asset.retirementShare.value) * 100) : ""}
                          onChange={(pct) => {
                            const entries = [...(v2Form.assets as { status: "KNOWN"; entries: AssetEntry[] }).entries];
                            const fraction = (Math.max(0, Math.min(100, parseFloat(pct || "0"))) / 100).toFixed(4);
                            entries[idx] = { ...entries[idx], retirementShare: pct === "" ? { status: "UNKNOWN" } : { status: "KNOWN", value: fraction } };
                            setV2Form({ ...v2Form, assets: { status: "KNOWN", entries } });
                          }}
                        />
                        <Input
                          type="number"
                          label={isVi ? "Quỹ dự phòng (%)" : "Emergency Fund (%)"}
                          value={asset.emergencyShare.status === "KNOWN" ? String(Number(asset.emergencyShare.value) * 100) : ""}
                          onChange={(pct) => {
                            const entries = [...(v2Form.assets as { status: "KNOWN"; entries: AssetEntry[] }).entries];
                            const fraction = (Math.max(0, Math.min(100, parseFloat(pct || "0"))) / 100).toFixed(4);
                            entries[idx] = { ...entries[idx], emergencyShare: pct === "" ? { status: "UNKNOWN" } : { status: "KNOWN", value: fraction } };
                            setV2Form({ ...v2Form, assets: { status: "KNOWN", entries } });
                          }}
                        />
                        <Input
                          type="number"
                          label={isVi ? "Mục tiêu khác (%)" : "Other Goals (%)"}
                          value={asset.otherGoalsShare.status === "KNOWN" ? String(Number(asset.otherGoalsShare.value) * 100) : ""}
                          onChange={(pct) => {
                            const entries = [...(v2Form.assets as { status: "KNOWN"; entries: AssetEntry[] }).entries];
                            const fraction = (Math.max(0, Math.min(100, parseFloat(pct || "0"))) / 100).toFixed(4);
                            entries[idx] = { ...entries[idx], otherGoalsShare: pct === "" ? { status: "UNKNOWN" } : { status: "KNOWN", value: fraction } };
                            setV2Form({ ...v2Form, assets: { status: "KNOWN", entries } });
                          }}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--color-text-muted)" }}>
                {isVi ? "Chưa có danh mục tài sản nào." : "No asset items registered yet."}
              </p>
            )}

            {(error || saveError) && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <Alert tone="danger" title={isVi ? "Lỗi thông tin" : "Information Error"}>{error || saveError}</Alert>
              </div>
            )}

            <div style={{ marginTop: "var(--space-4)" }}>
              <Button type="submit" variant="primary" loading={busy}>
                {isVi ? "Lưu thông tin tài sản" : "Save Asset Allocation v2"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}

      {/* Tab 5: Pension & Legal Retirement Age (T05) */}
      {activeTab === "v2-pension" && v2Form && (
        <form onSubmit={saveV2}>
          <fieldset className="account-api-fields" disabled={busy}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {/* Section 1: Khai báo lương hưu dự kiến & Tháng nhận */}
              <Card className="profile-entry-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  <div>
                    <h3 style={{ fontSize: "var(--text-base)", margin: 0 }}>
                      {isVi ? "Khai báo mức lương hưu dự kiến & Tháng nhận" : "Expected Pension Declaration & Start Month"}
                    </h3>
                    <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                      {isVi
                        ? "Nhập số tiền ước tính theo tháng từ VssID hoặc tài liệu BHXH. Khoản tiền độc lập, không tự suy đoán quyền lợi."
                        : "Enter monthly pension estimate from VssID or Social Insurance documents. Standalone amount, not an entitlement determination."}
                    </p>
                  </div>
                  <Select
                    label={isVi ? "Trạng thái khai báo lương hưu" : "Pension Declaration Status"}
                    options={[
                      { value: "UNKNOWN", label: isVi ? "Chưa khai báo" : "Not Declared" },
                      { value: "KNOWN", label: isVi ? "Có ước tính lương hưu" : "Has Pension Estimate" },
                      { value: "NOT_APPLICABLE", label: isVi ? "Không áp dụng" : "Not Applicable" },
                    ]}
                    value={!v2Form.pension || v2Form.pension.status === "UNKNOWN" ? "UNKNOWN" : v2Form.pension.status}
                    onChange={(val) => {
                      if (val === "KNOWN") {
                        setV2Form({
                          ...v2Form,
                          pension: {
                            status: "KNOWN",
                            monthlyAmount: v2Form.pension?.status === "KNOWN" ? v2Form.pension.monthlyAmount : "",
                            currency: "VND",
                            priceBasis: "TODAY",
                            basisMonth: v2Form.valuationDate.slice(0, 7),
                            source: isVi ? "Ước tính sổ BHXH / VssID" : "VssID / Social Insurance estimate",
                            estimatedOn: v2Form.valuationDate,
                            adjustment: { kind: "NONE" },
                          },
                        });
                      } else if (val === "NOT_APPLICABLE" || val.includes("NOT_APPLICABLE")) {
                        setV2Form({
                          ...v2Form,
                          pension: {
                            status: "NOT_APPLICABLE",
                            reason: isVi
                              ? "Người dùng xác nhận không tham gia hoặc không nhận lương hưu BHXH"
                              : "User confirms not participating or not receiving Social Insurance pension",
                          },
                        });
                      } else {
                        setV2Form({ ...v2Form, pension: { status: "UNKNOWN" } });
                      }
                    }}
                  />
                </div>

                {/* Tháng bắt đầu nhận lương hưu (personal.pensionStartMonth) */}
                <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-sm)" }}>
                  <div className="account-form-grid">
                    <Select
                      label={isVi ? "Thông tin tháng nhận lương hưu" : "Pension Start Month Status"}
                      options={[
                        { value: "KNOWN", label: isVi ? "Đã biết tháng bắt đầu nhận" : "Start month is known" },
                        { value: "UNKNOWN", label: isVi ? "Chưa biết tháng bắt đầu nhận" : "Start month is not known" },
                        { value: "NOT_APPLICABLE", label: isVi ? "Tôi không nhận lương hưu" : "I will not receive a pension" },
                      ]}
                      value={v2Form.personal.pensionStartMonth.status}
                      onChange={(val) => {
                        if (val.includes("KNOWN") && !val.includes("UNKNOWN")) {
                          setV2Form({
                            ...v2Form,
                            personal: {
                              ...v2Form.personal,
                              pensionStartMonth: {
                                status: "KNOWN",
                                value: v2Form.personal.desiredRetirementMonth.status === "KNOWN"
                                  ? v2Form.personal.desiredRetirementMonth.value
                                  : "",
                              },
                            },
                          });
                        } else if (val.includes("NOT_APPLICABLE")) {
                          setV2Form({
                            ...v2Form,
                            personal: {
                              ...v2Form.personal,
                              pensionStartMonth: {
                                status: "NOT_APPLICABLE",
                                reason: isVi ? "Không có kế hoạch nhận lương hưu" : "No pension plan",
                              },
                            },
                          });
                        } else {
                          setV2Form({
                            ...v2Form,
                            personal: {
                              ...v2Form.personal,
                              pensionStartMonth: { status: "UNKNOWN" },
                            },
                          });
                        }
                      }}
                      helper={
                        isVi
                          ? "Khai báo riêng biệt; không tự đổi theo tháng nghỉ hưu mong muốn hay kết quả tra tuổi pháp lý."
                          : "Declared separately; does not auto-alter with desired retirement month or statutory age result."
                      }
                    />

                    {v2Form.personal.pensionStartMonth.status === "KNOWN" && (
                      <Input
                        type="month"
                        label={isVi ? "Tháng bắt đầu nhận lương hưu" : "Start Month (YYYY-MM)"}
                        value={v2Form.personal.pensionStartMonth.value}
                        onChange={(m) => {
                          if (v2Form.personal.pensionStartMonth.status === "KNOWN") {
                            setV2Form({
                              ...v2Form,
                              personal: {
                                ...v2Form.personal,
                                pensionStartMonth: { status: "KNOWN", value: m },
                              },
                            });
                          }
                        }}
                        helper={
                          isVi
                            ? "Tháng đầu tiên tiền lương hưu dự kiến bắt đầu đổ về tài khoản."
                            : "First month expected pension begins arriving in bank account."
                        }
                      />
                    )}

                    {v2Form.personal.pensionStartMonth.status === "NOT_APPLICABLE" && (
                      <Input
                        label={isVi ? "Lý do không áp dụng tháng nhận" : "Reason for Non-Applicability"}
                        value={v2Form.personal.pensionStartMonth.reason}
                        onChange={(r) => {
                          if (v2Form.personal.pensionStartMonth.status === "NOT_APPLICABLE") {
                            setV2Form({
                              ...v2Form,
                              personal: {
                                ...v2Form.personal,
                                pensionStartMonth: { status: "NOT_APPLICABLE", reason: r },
                              },
                            });
                          }
                        }}
                      />
                    )}
                  </div>
                </div>

                {v2Form.pension?.status === "KNOWN" && (() => {
                  const p = v2Form.pension;
                  const availableIncomes = v2Form.income.status === "KNOWN" ? v2Form.income.entries : [];
                  return (
                    <>
                      <div className="account-form-grid" style={{ marginTop: "var(--space-3)" }}>
                        <Input
                          type="number"
                          money
                      label={isVi ? "Mức lương hưu dự kiến (VND / tháng)" : "Expected Pension Amount (VND / month)"}
                          value={p.monthlyAmount}
                          onChange={(v) => updatePensionKnown((prev) => ({ ...prev, monthlyAmount: v }))}
                          helper={
                            isVi
                              ? "Số tiền lương hưu thực nhận dự kiến mỗi tháng (không tự chuyển ô trống thành 0)."
                              : "Expected monthly pension received (blank fields will not auto-convert to 0)."
                          }
                        />
                        <Select
                          label={isVi ? "Cơ sở định giá tiền" : "Price Basis"}
                          options={[
                            { value: "TODAY", label: isVi ? "Theo mức giá hôm nay" : "Today's Purchasing Power" },
                            { value: "NOMINAL_AT_START", label: isVi ? "Số tiền tại tháng bắt đầu nhận" : "Nominal Amount at Start" },
                          ]}
                          value={p.priceBasis}
                          onChange={(pb) => {
                            updatePensionKnown((prev) => ({ ...prev, priceBasis: pb as "TODAY" | "NOMINAL_AT_START" }));
                          }}
                          helper={
                            isVi
                              ? "Chọn 'Theo mức giá hôm nay' nếu bạn ước tính theo sức mua hiện tại; hệ thống sẽ điều chỉnh lạm phát theo các năm dự phóng."
                              : "Select 'Today's Purchasing Power' for today purchasing power; system will project inflation accordingly."
                          }
                        />
                        <Input
                          label={isVi ? "Nguồn dữ liệu ước tính" : "Estimate Data Source"}
                          value={p.source}
                          onChange={(v) => updatePensionKnown((prev) => ({ ...prev, source: v }))}
                          helper={
                            isVi
                              ? "Ví dụ: Tra cứu ứng dụng VssID, Sổ BHXH, Doanh nghiệp trả lương."
                              : "E.g.: VssID app lookup, Social Insurance booklet, Employer payroll."
                          }
                        />
                        <Input
                          type="date"
                          label={isVi ? "Ngày lập ước tính" : "Estimate Creation Date"}
                          value={p.estimatedOn}
                          onChange={(v) => updatePensionKnown((prev) => ({ ...prev, estimatedOn: v }))}
                          helper={
                            isVi
                              ? "Không được sau ngày định giá hồ sơ."
                              : "Cannot be later than profile valuation date."
                          }
                        />
                      </div>

                      <div style={{ marginTop: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                        {isVi ? "Tháng dùng làm mốc tính số tiền:" : "Calculation Basis Month:"} <strong>{p.basisMonth}</strong>.
                        {p.priceBasis === "TODAY"
                          ? isVi
                            ? " Khớp với tháng định giá hồ sơ. Máy chủ áp dụng tỷ lệ lạm phát từ bộ dữ liệu ước tính công bố."
                            : " Matches profile valuation month. Server applies inflation rate from published assumptions."
                          : isVi
                          ? " Khớp với tháng bắt đầu nhận lương hưu danh nghĩa. Nếu đang nhận từ trước tháng định giá, hướng dẫn khuyến nghị khai theo giá trị này."
                          : " Matches nominal start month. If receiving prior to valuation month, recommended to declare at this value."}
                      </div>

                      {/* FE-T05-04: Anti-double counting */}
                      {availableIncomes.length > 0 && (
                        <div style={{ marginTop: "var(--space-3)" }}>
                          <Select
                            label={
                              isVi
                                ? "Khoản lương hưu đã khai trong Thu nhập (Tránh tính hai lần)"
                                : "Link Reference Income Stream (Avoid Double-Counting)"
                            }
                            options={[
                              isVi ? "Không liên kết (khoản độc lập)" : "No Link (Standalone Item)",
                              ...availableIncomes.map((i) => `${i.label} (${i.kind}) [id:${i.id}]`),
                            ]}
                            value={
                              p.linkedIncomeId
                                ? availableIncomes.find((i) => i.id === p.linkedIncomeId)
                                  ? `${availableIncomes.find((i) => i.id === p.linkedIncomeId)?.label} (${availableIncomes.find((i) => i.id === p.linkedIncomeId)?.kind}) [id:${p.linkedIncomeId}]`
                                  : isVi ? "Không liên kết (khoản độc lập)" : "No Link (Standalone Item)"
                                : isVi ? "Không liên kết (khoản độc lập)" : "No Link (Standalone Item)"
                            }
                            onChange={(val) => {
                              const match = val.match(/\[id:([^\]]+)\]/);
                              if (match && match[1]) {
                                updatePensionKnown((prev) => ({ ...prev, linkedIncomeId: match[1] }));
                              } else {
                                updatePensionKnown((prev) => ({ ...prev, linkedIncomeId: undefined }));
                              }
                            }}
                            helper={
                              isVi
                                ? "Nếu đã khai lương hưu trong danh sách Thu nhập, hãy liên kết dòng đó. Máy chủ sẽ chỉ dùng mục Lương hưu để tính toán và không cộng trùng hai lần vào tổng thu."
                                : "If pension is already declared in Income list, link it here. The server will use the Pension section and avoid double counting."
                            }
                          />
                        </div>
                      )}

                      {/* FE-T05-01: Explicit Schedule */}
                      <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-sm)" }}>
                        <h4 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)" }}>
                          {isVi
                            ? "Lịch điều chỉnh mức lương hưu danh nghĩa"
                            : "Nominal Pension Adjustment Schedule"}
                        </h4>
                        <Select
                          label={isVi ? "Chính sách điều chỉnh lương hưu" : "Pension Adjustment Policy"}
                          options={[
                            { value: "NONE", label: isVi ? "Giữ nguyên số tiền sau khi nhận" : "Maintain Nominal Level After Receipt" },
                            { value: "EXPLICIT_SCHEDULE", label: isVi ? "Thay đổi theo các mốc đã khai" : "Declare Explicit Periodic Adjustment Schedule" },
                          ]}
                          value={p.adjustment.kind}
                          onChange={(v) => {
                            if (v === "EXPLICIT_SCHEDULE" || v.includes("EXPLICIT_SCHEDULE")) {
                              updatePensionKnown((prev) => ({
                                ...prev,
                                adjustment: {
                                  kind: "EXPLICIT_SCHEDULE",
                                  entries: [
                                    {
                                      effectiveMonth: "",
                                      monthlyAmount: prev.monthlyAmount || "",
                                      source: isVi ? "Dự kiến điều chỉnh lương hưu định kỳ" : "Expected periodic pension adjustment",
                                    },
                                  ],
                                },
                              }));
                            } else {
                              updatePensionKnown((prev) => ({ ...prev, adjustment: { kind: "NONE" } }));
                            }
                          }}
                          helper={
                            isVi
                              ? "Hệ thống không tự sinh lịch tăng CPI tự động. Chỉ khi có văn bản điều chỉnh danh nghĩa cụ thể mới áp dụng lịch điều chỉnh."
                              : "The system does not generate automatic CPI bumps. Explicit schedule applies only when nominal adjustment decisions exist."
                          }
                        />

                        {p.adjustment.kind === "EXPLICIT_SCHEDULE" && (() => {
                          const adj = p.adjustment;
                          return (
                            <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                              {adj.entries.map((entry, idx) => (
                                <div key={idx} className="profile-cashflow-row">
                                  <Input
                                    type="month"
                                    label={isVi ? "Tháng áp dụng" : "Effective Month (YYYY-MM)"}
                                    value={entry.effectiveMonth}
                                    onChange={(m) => {
                                      const nextEntries = [...adj.entries];
                                      nextEntries[idx] = { ...nextEntries[idx], effectiveMonth: m };
                                      updatePensionKnown((prev) => ({ ...prev, adjustment: { kind: "EXPLICIT_SCHEDULE", entries: nextEntries } }));
                                    }}
                                  />
                                  <Input
                                    type="number"
                                    money
                      label={isVi ? "Mức tiền mới (VND/tháng)" : "New Amount (VND/month)"}
                                    value={entry.monthlyAmount}
                                    onChange={(a) => {
                                      const nextEntries = [...adj.entries];
                                      nextEntries[idx] = { ...nextEntries[idx], monthlyAmount: a };
                                      updatePensionKnown((prev) => ({ ...prev, adjustment: { kind: "EXPLICIT_SCHEDULE", entries: nextEntries } }));
                                    }}
                                  />
                                  <Input
                                    label={isVi ? "Nguồn / Căn cứ" : "Source / Reference"}
                                    value={entry.source}
                                    onChange={(s) => {
                                      const nextEntries = [...adj.entries];
                                      nextEntries[idx] = { ...nextEntries[idx], source: s };
                                      updatePensionKnown((prev) => ({ ...prev, adjustment: { kind: "EXPLICIT_SCHEDULE", entries: nextEntries } }));
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                      const nextEntries = adj.entries.filter((_: unknown, i: number) => i !== idx);
                                      updatePensionKnown((prev) => ({
                                        ...prev,
                                        adjustment: nextEntries.length > 0 ? { kind: "EXPLICIT_SCHEDULE", entries: nextEntries } : { kind: "NONE" },
                                      }));
                                    }}
                                  >
                                    {isVi ? "Xóa" : "Delete"}
                                  </Button>
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  const nextEntries = [
                                    ...adj.entries,
                                    {
                                      effectiveMonth: "2055-01",
                                      monthlyAmount: "7000000.00",
                                      source: isVi ? "Điều chỉnh lương hưu tiếp theo" : "Subsequent pension adjustment",
                                    },
                                  ];
                                  updatePensionKnown((prev) => ({ ...prev, adjustment: { kind: "EXPLICIT_SCHEDULE", entries: nextEntries } }));
                                }}
                              >
                                {isVi ? "+ Thêm mốc điều chỉnh danh nghĩa" : "+ Add Nominal Adjustment Milestone"}
                              </Button>
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  );
                })()}

                {v2Form.pension?.status === "NOT_APPLICABLE" && (
                  <div style={{ marginTop: "var(--space-3)" }}>
                    <Input
                      label={isVi ? "Lý do không áp dụng lương hưu" : "Reason for Pension Non-Applicability"}
                      value={v2Form.pension.reason}
                      onChange={(r) => {
                        if (v2Form.pension?.status === "NOT_APPLICABLE") {
                          setV2Form({
                            ...v2Form,
                            pension: { status: "NOT_APPLICABLE", reason: r },
                          });
                        }
                      }}
                    />
                  </div>
                )}
              </Card>

              {/* Section 2: Working Conditions & Statutory Retirement Age */}
              <Card className="profile-entry-card">
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <h3 style={{ fontSize: "var(--text-base)", margin: 0 }}>
                    {isVi ? "Điều kiện lao động & Tuổi nghỉ hưu luật định" : "Working Conditions & Statutory Retirement Age"}
                  </h3>
                  <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                    {isVi
                      ? "Tra cứu tuổi nghỉ hưu chính thức theo Nghị định 135/2020/NĐ-CP (Phụ lục I và II). Mốc tuổi Điều 5 là quyền nghỉ hưu sớm tự nguyện khi thỏa mãn các điều kiện quy định."
                      : "Lookup official retirement age under Decree 135/2020/ND-CP (Appendices I & II). Article 5 provides statutory early retirement rights when eligible conditions are met."}
                  </p>
                </div>

                <div className="account-form-grid">
                  <Select
                    label={isVi ? "Giới tính pháp lý" : "Legal Gender"}
                    options={[
                      { value: "UNDISCLOSED", label: isVi ? "Chưa cung cấp" : "Not provided" },
                      { value: "OTHER", label: isVi ? "Khác" : "Other" },
                      { value: "MALE", label: isVi ? "Nam" : "Male" },
                      { value: "FEMALE", label: isVi ? "Nữ" : "Female" },
                    ]}
                    value={v2Form.personal.gender ?? "UNDISCLOSED"}
                    onChange={(g) =>
                      setV2Form({
                        ...v2Form,
                        personal: { ...v2Form.personal, gender: g as "MALE" | "FEMALE" },
                      })
                    }
                  />

                  <Select
                    label={isVi ? "Điều kiện lao động thực tế" : "Actual Working Conditions"}
                    options={[
                      { value: "NORMAL", label: isVi ? "Điều kiện bình thường" : "Normal Conditions" },
                      { value: "ARTICLE_5_DECLARED", label: isVi ? "Nghỉ hưu sớm theo Điều 5 NĐ 135" : "Early Retirement per Article 5" },
                      { value: "OTHER", label: isVi ? "Trường hợp đặc thù khác" : "Other Specific Condition" },
                    ]}
                    value={v2Form.personal.retirementCondition?.kind || "NORMAL"}
                    onChange={(c) => {
                      let nextCond: RetirementCondition = { kind: "NORMAL" };
                      if (c === "ARTICLE_5_DECLARED" || c.includes("ARTICLE_5_DECLARED")) {
                        nextCond = {
                          kind: "ARTICLE_5_DECLARED",
                          basis: "HAZARDOUS_15_YEARS",
                          evidence: isVi ? "Hồ sơ công việc nặng nhọc độc hại" : "Hazardous working environment documentation",
                        };
                      } else if (c === "OTHER" || c.includes("OTHER")) {
                        nextCond = {
                          kind: "OTHER",
                          description: isVi ? "Trường hợp đặc thù" : "Special case",
                        };
                      }
                      setV2Form({
                        ...v2Form,
                        personal: { ...v2Form.personal, retirementCondition: nextCond },
                      });
                    }}
                  />
                </div>

                {v2Form.personal.retirementCondition?.kind === "ARTICLE_5_DECLARED" && (() => {
                  const cond = v2Form.personal.retirementCondition;
                  return (
                    <div className="account-form-grid" style={{ marginTop: "var(--space-3)" }}>
                      <Select
                        label={isVi ? "Căn cứ áp dụng Điều 5" : "Article 5 Qualification Basis"}
                        options={[
                          { value: "HAZARDOUS_15_YEARS", label: isVi ? "15 năm nghề nặng nhọc, độc hại, nguy hiểm" : "15 years hazardous/heavy labor" },
                          { value: "DIFFICULT_REGION_15_YEARS", label: isVi ? "15 năm vùng KTXH đặc biệt khó khăn" : "15 years socio-economically difficult region" },
                          { value: "COMBINED_15_YEARS", label: isVi ? "15 năm kết hợp cả hai điều kiện trên" : "15 years combining both conditions" },
                          { value: "WORK_CAPACITY_LOSS_61_PERCENT", label: isVi ? "Suy giảm khả năng lao động từ 61% trở lên" : "Work capacity loss >= 61%" },
                        ]}
                        value={cond.basis || "HAZARDOUS_15_YEARS"}
                        onChange={(b) => {
                          const basis = b as "HAZARDOUS_15_YEARS" | "DIFFICULT_REGION_15_YEARS" | "COMBINED_15_YEARS" | "WORK_CAPACITY_LOSS_61_PERCENT";
                          setV2Form({
                            ...v2Form,
                            personal: {
                              ...v2Form.personal,
                              retirementCondition: {
                                kind: "ARTICLE_5_DECLARED",
                                basis,
                                evidence: cond.evidence,
                              },
                            },
                          });
                        }}
                      />
                      <Input
                        label={isVi ? "Căn cứ / Hồ sơ chứng minh" : "Evidence / Documentation Reference"}
                        value={cond.evidence}
                        onChange={(ev) =>
                          setV2Form({
                            ...v2Form,
                            personal: {
                              ...v2Form.personal,
                              retirementCondition: {
                                kind: "ARTICLE_5_DECLARED",
                                basis: cond.basis,
                                evidence: ev,
                              },
                            },
                          })
                        }
                        helper={
                          isVi
                            ? "Ví dụ: Giấy tờ xác nhận chức danh nghề hoặc kết luận giám định y khoa."
                            : "E.g.: Certified job title records or medical assessment evaluation."
                        }
                      />
                    </div>
                  );
                })()}

                {v2Form.personal.retirementCondition?.kind === "OTHER" && (() => {
                  const cond = v2Form.personal.retirementCondition;
                  return (
                    <div style={{ marginTop: "var(--space-3)" }}>
                      <Input
                        label={isVi ? "Mô tả trường hợp đặc thù" : "Description of Special Condition"}
                        value={cond.description}
                        onChange={(desc) =>
                          setV2Form({
                            ...v2Form,
                            personal: {
                              ...v2Form.personal,
                              retirementCondition: {
                                kind: "OTHER",
                                description: desc,
                              },
                            },
                          })
                        }
                        helper={
                          isVi
                            ? "Trường hợp đặc thù sẽ được đánh dấu cần kiểm tra thêm và không tự động điền tuổi mặc định."
                            : "Special conditions are flagged as requiring review and do not automatically fill a default age."
                        }
                      />
                    </div>
                  );
                })()}
              </Card>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
                <Button type="submit" variant="primary" loading={busy}>
                  {isVi ? "Lưu thông tin lương hưu" : "Save Pension Declaration v2"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={loadingPensionPreview}
                  onClick={loadPensionPreview}
                >
                  <Icon name="sparkles" size="small" />{" "}
                  {isVi ? "Tra cứu tuổi luật định & Dòng tiền lương hưu" : "Look up Statutory Age & Pension Cash Flow"}
                </Button>
              </div>

              {(error || saveError) && (
                <Alert tone="danger" title={isVi ? "Lỗi thông tin" : "Information Error"}>{error || saveError}</Alert>
              )}

              {pensionPreviewError && (
                <Alert tone="warning" title={isVi ? "Thông báo tra cứu" : "Lookup Notice"}>{pensionPreviewError}</Alert>
              )}

              {/* Preview results */}
              {pensionPreview && (
                <Card style={{ marginTop: "var(--space-3)", border: "1px solid var(--color-primary-200)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                    <div>
                      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                        <Badge tone={pensionPreview.status === "READY" ? "success" : "warning"}>
                          {pensionPreview.status === "READY"
                            ? isVi ? "ĐỦ ĐIỀU KIỆN MÔ PHỎNG" : "ELIGIBLE FOR SIMULATION"
                            : isVi ? "CHƯA HOÀN THIỆN ĐẦY ĐỦ" : "INCOMPLETE DATA"}
                        </Badge>
                        <Badge tone="neutral">
                          {pensionPreview.legalRetirementAge.status === "REFERENCE_ONLY"
                            ? isVi ? "THAM CHIẾU LUẬT ĐỊNH" : "STATUTORY REFERENCE"
                            : pensionPreview.legalRetirementAge.status === "REVIEW_REQUIRED"
                            ? isVi ? "CẦN KIỂM TRA THÊM" : "REVIEW REQUIRED"
                            : isVi ? "CHƯA ĐÁNH GIÁ ĐIỀU KIỆN HƯỞNG" : "NOT ASSESSED"}
                        </Badge>
                      </div>
                      <h3 style={{ fontSize: "var(--text-lg)", margin: "var(--space-2) 0 var(--space-1)" }}>
                        {isVi
                          ? "Kết quả đối chiếu Nghị định 135/2020/NĐ-CP & Dự báo lương hưu"
                          : "Decree 135/2020/ND-CP Comparison & Pension Projection"}
                      </h3>
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                        {isVi ? "Quy tắc:" : "Rule:"} {pensionPreview.legalRetirementAge.rule.version} (
                        {isVi ? "Hiệu lực từ" : "Effective from"} {formatDateVN(pensionPreview.legalRetirementAge.rule.effectiveFrom)}).{" "}
                        {isVi ? "Ngày định giá:" : "Valuation date:"} {formatDateVN(pensionPreview.valuationDate)}.
                        {pensionPreview.assumptionVersionId &&
                          ` · ${isVi ? "Bộ giả định vĩ mô:" : "Macro assumption set:"} ${pensionPreview.assumptionVersionId}`}
                      </p>
                    </div>
                  </div>

                  {/* Backend issues */}
                  {pensionPreview.issues.length > 0 && (
                    <div style={{ marginBottom: "var(--space-3)" }}>
                      <Alert tone="warning" title={isVi ? "Dữ liệu chưa hoàn thiện" : "Data Incomplete"}>
                        <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "var(--space-4)" }}>
                          {pensionPreview.issues.map((issue, idx) => (
                            <li key={idx}>
                              <strong>{issue.code}</strong>:{" "}
                              {PENSION_ISSUE_LABELS[issue.code]
                                ? (isVi ? PENSION_ISSUE_LABELS[issue.code].vi : PENSION_ISSUE_LABELS[issue.code].en)
                                : issue.message || issue.code}
                            </li>
                          ))}
                        </ul>
                      </Alert>
                    </div>
                  )}

                  {/* 4 milestones */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
                    <Card className="summary-metric-card">
                      <small>{isVi ? "Tuổi nghỉ hưu luật định" : "Statutory Retirement Age"}</small>
                      <strong style={{ fontSize: "var(--text-lg)" }}>
                        {pensionPreview.legalRetirementAge.ageMonths !== null
                          ? isVi
                            ? `${Math.floor(pensionPreview.legalRetirementAge.ageMonths / 12)} tuổi ${pensionPreview.legalRetirementAge.ageMonths % 12 > 0 ? `${pensionPreview.legalRetirementAge.ageMonths % 12} tháng` : ""}`
                            : `${Math.floor(pensionPreview.legalRetirementAge.ageMonths / 12)} yrs ${pensionPreview.legalRetirementAge.ageMonths % 12 > 0 ? `${pensionPreview.legalRetirementAge.ageMonths % 12} mos` : ""}`
                          : isVi ? "Cần rà soát" : "Needs review"}
                      </strong>
                      <small style={{ color: "var(--color-text-muted)" }}>
                        {pensionPreview.legalRetirementAge.ageMonths !== null
                          ? isVi
                            ? `(${pensionPreview.legalRetirementAge.ageMonths} tháng tuổi)`
                            : `(${pensionPreview.legalRetirementAge.ageMonths} months old)`
                          : pensionPreview.legalRetirementAge.issue || (isVi ? "Không điền tuổi mặc định" : "No default age filled")}
                      </small>
                    </Card>

                    <Card className="summary-metric-card">
                      <small>{isVi ? "Tháng nghỉ hưu luật định" : "Statutory Retirement Month"}</small>
                      <strong style={{ fontSize: "var(--text-lg)" }}>
                        {pensionPreview.legalRetirementAge.retirementMonth || (isVi ? "Chưa xác định" : "Unspecified")}
                      </strong>
                      <small style={{ color: "var(--color-text-muted)" }}>
                        {isVi ? "Thời điểm hoàn thành nghĩa vụ làm việc" : "Completion of working obligation"}
                      </small>
                    </Card>

                    <Card className="summary-metric-card">
                      <small>{isVi ? "Tháng nhận theo luật định" : "Statutory Pension Start Month"}</small>
                      <strong style={{ fontSize: "var(--text-lg)", color: "var(--color-primary-700)" }}>
                        {pensionPreview.legalRetirementAge.pensionStartMonth
                          ? pensionPreview.legalRetirementAge.pensionStartMonth
                          : pensionPreview.legalRetirementAge.pensionStartStatus === "REQUIRES_BENEFIT_ASSESSMENT"
                          ? (isVi ? "Cần xét điều kiện hưởng" : "Requires benefit assessment")
                          : (isVi ? "Chưa xác định" : "Unspecified")}
                      </strong>
                      <small style={{ color: "var(--color-text-muted)" }}>
                        {pensionPreview.legalRetirementAge.referenceFollowingMonth
                          ? `${isVi ? "Tháng kế tiếp mốc tuổi:" : "Month after age benchmark:"} ${pensionPreview.legalRetirementAge.referenceFollowingMonth}`
                          : (isVi ? "Đầu tháng kế tiếp tháng nghỉ" : "Start of month following retirement")}
                      </small>
                    </Card>

                    <Card className="summary-metric-card">
                      <small>{isVi ? "Tháng nhận người dùng khai" : "User Declared Start Month"}</small>
                      <strong style={{ fontSize: "var(--text-lg)" }}>
                        {v2Form.personal.pensionStartMonth.status === "KNOWN"
                          ? v2Form.personal.pensionStartMonth.value
                          : isVi ? "Chưa xác định" : "Unspecified"}
                      </strong>
                      <small style={{ color: "var(--color-text-muted)" }}>
                        {isVi ? "Độc lập với tra cứu luật định" : "Independent of statutory lookup"}
                      </small>
                    </Card>

                    <Card className="summary-metric-card">
                      <small>{isVi ? "Tháng mong muốn cá nhân" : "Personal Target Month"}</small>
                      <strong style={{ fontSize: "var(--text-lg)" }}>
                        {pensionPreview.legalRetirementAge.desiredRetirementMonth || (isVi ? "Chưa chọn" : "Not selected")}
                      </strong>
                      <small style={{ color: "var(--color-text-muted)" }}>
                        {isVi ? "Mục tiêu lập kế hoạch riêng" : "Custom planning milestone target"}
                      </small>
                    </Card>
                  </div>

                  <div style={{ marginTop: "var(--space-3)", display: "flex", justifyContent: "flex-end" }}>
                    <Button variant="secondary" onClick={() => setShowInsuranceModal(true)}>
                      <Icon name="sparkles" size="small" />{" "}
                      {isVi ? "Thẩm định quá trình & Ước tính lương hưu BHXH" : "Assess Insurance History & Estimate Pension"}
                    </Button>
                  </div>

                  {/* Cashflow projection */}
                  {pensionPreview.rows.length > 0 && (
                    <div style={{ marginTop: "var(--space-3)" }}>
                      <h4 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                        {isVi
                          ? `Dòng tiền lương hưu dự kiến (12 tháng đầu tiên kể từ tháng định giá ${formatMonthVN(pensionPreview.valuationDate.slice(0, 7))})`
                          : `Expected Pension Cash Flow (First 12 months from valuation month ${formatMonthVN(pensionPreview.valuationDate.slice(0, 7))})`}
                      </h4>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "var(--space-2)" }}>
                        {pensionPreview.rows.slice(0, 12).map((row) => (
                          <div
                            key={row.month}
                            style={{
                              padding: "var(--space-2)",
                              background: "var(--color-surface)",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--color-border)",
                              fontSize: "var(--text-xs)",
                            }}
                          >
                            <span style={{ color: "var(--color-text-muted)", display: "block" }}>{formatMonthVN(row.month)}</span>
                            <strong>
                              {row.amount === null
                                ? isVi ? "Chưa tính được" : "Indeterminate"
                                : Number(row.amount) > 0
                                ? `${Math.round(Number(row.amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VND`
                                : isVi ? "0 VND (trước kỳ nhận)" : "0 VND (prior to receipt)"}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Limitations and disclaimers */}
                  <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", background: "var(--color-surface)", borderRadius: "var(--radius-md)", borderLeft: "3px solid var(--color-primary)" }}>
                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                      <Icon name="info" size="small" />
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                        <strong>{isVi ? "Giới hạn kỹ thuật và pháp lý quan trọng:" : "Important Technical and Legal Disclaimers:"}</strong>
                        <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "var(--space-4)" }}>
                          {pensionPreview.limitations.map((lim, idx) => (
                            <li key={idx}>
                              {PENSION_LIMITATIONS_LABELS[lim]
                                ? (isVi ? PENSION_LIMITATIONS_LABELS[lim].vi : PENSION_LIMITATIONS_LABELS[lim].en)
                                : lim}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </fieldset>
        </form>
      )}

      <SocialInsuranceModal
        open={showInsuranceModal}
        onClose={() => setShowInsuranceModal(false)}
        language={isVi ? "vi" : "en"}
        initialBenefitDate={
          v2Form?.personal?.pensionStartMonth?.status === "KNOWN" && v2Form?.personal?.pensionStartMonth?.value
            ? `${v2Form.personal.pensionStartMonth.value}-01`
            : undefined
        }
      />

      {/* FE-07: Review Asset Allocation Confirmation Dialog */}
      <ResponsiveDialog
        open={showAssetReviewModal}
        title={isVi ? "Rà soát phân bổ tài sản (Phiên bản 2)" : "Review Asset Allocation (Version 2)"}
        onClose={() => {
          setShowAssetReviewModal(false);
          setActiveTab("v2-timing");
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--color-text)", lineHeight: 1.6 }}>
            {isVi
              ? "Hồ sơ của bạn đã được nâng cấp lên phiên bản 2. Các tài sản hiện có đã được tự động phân bổ theo tỷ lệ chuẩn (Dành cho hưu trí, Dự phòng khẩn cấp, Mục tiêu khác). Để kế hoạch nghỉ hưu phản ánh đúng thực tế, bạn nên xem lại và điều chỉnh tỷ lệ này."
              : "Your financial profile has been upgraded to version 2. Your assets were assigned default allocation shares (Retirement, Emergency, Other Goals). We recommend reviewing these proportions now."}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
            <Button
              variant="secondary"
              onClick={() => {
                setShowAssetReviewModal(false);
                setActiveTab("v2-timing");
              }}
            >
              {isVi ? "Để sau (Đến thông tin thời gian)" : "Later (Go to Timeline)"}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setShowAssetReviewModal(false);
                setActiveTab("v2-assets");
              }}
            >
              <Icon name="check" size="small" /> {isVi ? "Xem và điều chỉnh tài sản ngay" : "Review Assets Now"}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </Card>
  );
}
