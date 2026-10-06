import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon, Input, Select, useNotification, type IconName } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { previewDebts, type DebtPreviewResponse, type DebtAlternativeStrategy } from "../services/debts";
import { type DebtEntry } from "../services/financialProfile";
import { useI18n } from "../i18n";
import "./debt-page.css";

function formatCurrency(amount: string | number | null | undefined, language: "vi" | "en" = "vi"): string {
  if (amount === null || amount === undefined) return language === "en" ? "None" : "Chưa có";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(num);
}

function getLoanCategory(label: string, language: "vi" | "en"): { name: string; icon: IconName } {
  const l = label.toLowerCase();
  if (l.includes("nhà") || l.includes("đất") || l.includes("căn hộ") || l.includes("chung cư") || l.includes("home") || l.includes("house") || l.includes("mortgage") || l.includes("apartment")) {
    return { name: language === "en" ? "Real Estate & Housing" : "Bất động sản & Nhà ở", icon: "home" };
  }
  if (l.includes("xe") || l.includes("ô tô") || l.includes("oto") || l.includes("xe máy") || l.includes("car") || l.includes("auto") || l.includes("bike")) {
    return { name: language === "en" ? "Vehicle & Transportation" : "Phương tiện & Đi lại", icon: "compass" };
  }
  if (l.includes("thẻ") || l.includes("credit") || l.includes("tín dụng") || l.includes("tiêu dùng") || l.includes("card") || l.includes("consumer")) {
    return { name: language === "en" ? "Credit Card / Consumer" : "Thẻ tín dụng / Tiêu dùng", icon: "wallet" };
  }
  if (l.includes("kinh doanh") || l.includes("công ty") || l.includes("xưởng") || l.includes("business") || l.includes("commercial")) {
    return { name: language === "en" ? "Business Capital" : "Vốn kinh doanh", icon: "briefcase" };
  }
  return { name: language === "en" ? "Personal Loan" : "Khoản vay cá nhân", icon: "file-text" };
}

export default function DebtAnalysisPage() {
  const { t, language } = useI18n();
  const { v2Profile, schemaVersion, profileRevision, upgradeToV2, updateProfileV2 } = useFinancialProfile();
  const { notify } = useNotification();

  const [horizonMonths, setHorizonMonths] = useState<number>(60);
  const [reserveMonthly, setReserveMonthly] = useState<string>("2000000.00");
  const [extraMonthlyBudget, setExtraMonthlyBudget] = useState<string>("3000000.00");
  const [selectedPayoffLoanId, setSelectedPayoffLoanId] = useState<string>("");

  const [previewData, setPreviewData] = useState<DebtPreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showAddLoanModal, setShowAddLoanModal] = useState(false);

  // New loan form
  const [newLoanLabel, setNewLoanLabel] = useState("");
  const [newLoanBalance, setNewLoanBalance] = useState("");
  const [newLoanPayment, setNewLoanPayment] = useState("");
  const [newLoanShare, setNewLoanShare] = useState("100");

  const debtEntries: DebtEntry[] = useMemo(() => {
    if (v2Profile?.debts.status === "KNOWN") {
      return v2Profile.debts.entries;
    }
    return [];
  }, [v2Profile]);

  // Aggregate stats
  const totalDebtBalance = useMemo(() => {
    return debtEntries.reduce((acc, d) => {
      if (d.outstandingBalance.status === "KNOWN") {
        const bal = parseFloat(d.outstandingBalance.value);
        const share = d.balanceShare.status === "KNOWN" ? parseFloat(d.balanceShare.value) : 1;
        return acc + bal * share;
      }
      return acc;
    }, 0);
  }, [debtEntries]);

  const totalMonthlyPayment = useMemo(() => {
    return debtEntries.reduce((acc, d) => {
      if (d.payment.status === "KNOWN") {
        const pay = parseFloat(d.payment.value);
        const share = d.paymentShare.status === "KNOWN" ? parseFloat(d.paymentShare.value) : 1;
        return acc + pay * share;
      }
      return acc;
    }, 0);
  }, [debtEntries]);

  const loadPreview = async () => {
    if (schemaVersion !== 2 || !v2Profile) return;
    if (debtEntries.length === 0) {
      setPreviewData(null);
      return;
    }

    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const res = await previewDebts({
        expectedProfileRevision: profileRevision,
        horizonMonths,
        reserveMonthly: reserveMonthly.trim() ? parseFloat(reserveMonthly).toFixed(2) : null,
        extraMonthlyBudget: extraMonthlyBudget.trim() ? parseFloat(extraMonthlyBudget).toFixed(2) : null,
        payoffLoanId: selectedPayoffLoanId || undefined,
        stress: [],
      });
      setPreviewData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (language === "en" ? "Could not calculate debt payoff plan." : "Chưa thể tính toán phương án trả nợ.");
      setPreviewError(msg);
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (schemaVersion === 2 && debtEntries.length > 0) {
      loadPreview();
    }
  }, [schemaVersion, profileRevision, horizonMonths, reserveMonthly, extraMonthlyBudget, selectedPayoffLoanId]);

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const ok = await upgradeToV2();
      if (ok) {
        notify.success(
          language === "en" ? "Profile Upgraded" : "Đã nâng cấp hồ sơ",
          language === "en" ? "Your profile has been upgraded to detailed version 2." : "Hồ sơ của bạn đã được nâng cấp lên bản chi tiết v2."
        );
      }
    } catch (e) {
      notify.error(
        language === "en" ? "Upgrade Error" : "Lỗi nâng cấp",
        e instanceof Error ? e.message : (language === "en" ? "Could not upgrade." : "Không thể nâng cấp.")
      );
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleCreateLoan = async () => {
    if (!v2Profile) return;
    const balanceNum = parseFloat(newLoanBalance);
    const paymentNum = parseFloat(newLoanPayment);
    const shareNum = parseFloat(newLoanShare) / 100;

    if (!newLoanLabel.trim()) {
      return notify.warning(
        language === "en" ? "Missing Information" : "Thiếu thông tin",
        language === "en" ? "Please enter a loan name." : "Vui lòng nhập tên khoản vay."
      );
    }
    if (!Number.isFinite(balanceNum) || balanceNum <= 0) {
      return notify.warning(
        language === "en" ? "Invalid Format" : "Sai định dạng",
        language === "en" ? "Principal balance must be positive." : "Dư nợ phải là số dương."
      );
    }
    if (!Number.isFinite(paymentNum) || paymentNum < 0) {
      return notify.warning(
        language === "en" ? "Invalid Format" : "Sai định dạng",
        language === "en" ? "Monthly payment is invalid." : "Số tiền trả hàng tháng không hợp lệ."
      );
    }

    const valuationDate = v2Profile.valuationDate;
    const currentMonth = valuationDate.slice(0, 7);

    const newLoan: DebtEntry = {
      id: `dbt_${Date.now()}`,
      label: newLoanLabel.trim(),
      outstandingBalance: { status: "KNOWN", value: balanceNum.toFixed(2) },
      balanceAsOf: { status: "KNOWN", value: valuationDate },
      currency: "VND",
      payment: { status: "KNOWN", value: paymentNum.toFixed(2) },
      paymentShare: { status: "KNOWN", value: shareNum.toFixed(4) },
      balanceShare: { status: "KNOWN", value: shareNum.toFixed(4) },
      contract: { status: "UNKNOWN" },
      responsibility: {
        status: "KNOWN",
        scope: shareNum === 1 ? "FULL" : "ALLOCATED_ONLY",
        confirmedDocument: language === "en" ? "Personal credit agreement" : "Hợp đồng tín dụng cá nhân",
        limit: { status: "KNOWN", value: balanceNum.toFixed(2) },
      },
      startMonth: currentMonth,
      endMonth: null,
      frequency: "MONTHLY",
    };

    const currentEntries = v2Profile.debts.status === "KNOWN" ? v2Profile.debts.entries : [];
    const updatedDebts = { status: "KNOWN" as const, entries: [...currentEntries, newLoan] };

    const ok = await updateProfileV2({ debts: updatedDebts });
    if (ok) {
      notify.success(
        language === "en" ? "Loan Added Successfully" : "Thêm khoản vay thành công",
        language === "en" ? `Saved loan "${newLoan.label}".` : `Đã lưu khoản vay ${newLoan.label}.`
      );
      setShowAddLoanModal(false);
      setNewLoanLabel("");
      setNewLoanBalance("");
      setNewLoanPayment("");
      setNewLoanShare("100");
    }
  };

  const handleRemoveLoan = async (id: string) => {
    if (!v2Profile || v2Profile.debts.status !== "KNOWN") return;
    const nextEntries = v2Profile.debts.entries.filter((d) => d.id !== id);
    const updatedDebts = nextEntries.length > 0
      ? { status: "KNOWN" as const, entries: nextEntries }
      : { status: "NOT_APPLICABLE" as const, reason: language === "en" ? "No outstanding debts" : "Không có khoản nợ nào" };

    const ok = await updateProfileV2({ debts: updatedDebts });
    if (ok) {
      notify.success(
        language === "en" ? "Loan Removed" : "Đã xóa khoản vay",
        language === "en" ? "Loan has been removed from financial profile." : "Khoản vay đã được gỡ khỏi hồ sơ tài chính."
      );
    }
  };

  // Metrics derived from baseline
  const baseline = previewData?.baseline;
  const firstRow = baseline?.rows?.[0];
  const dtiRatio = firstRow?.ratioPercent ? parseFloat(firstRow.ratioPercent) : null;
  const remainingCash = firstRow?.remainingCash ? parseFloat(firstRow.remainingCash) : null;
  const shortfallMonth = baseline?.firstShortfallMonth;

  const avalanche = previewData?.alternatives.find((a) => a.strategy === "AVALANCHE");
  const snowball = previewData?.alternatives.find((a) => a.strategy === "SNOWBALL");
  const selectedPayoff = previewData?.alternatives.find((a) => a.strategy === "SELECTED_PAYOFF");

  const hasUnknownContracts = debtEntries.some((d) => !d.contract || d.contract.status !== "KNOWN");

  // DTI Gauge calculation
  const dtiPercentClamped = dtiRatio !== null ? Math.min(Math.max(dtiRatio, 0), 100) : 0;
  const circumference = 2 * Math.PI * 68;
  const strokeDashoffset = circumference - (dtiPercentClamped / 100) * circumference;

  const dtiStatusClass =
    dtiRatio === null
      ? "is-neutral"
      : dtiRatio < 30
      ? "is-safe"
      : dtiRatio <= 50
      ? "is-warning"
      : "is-danger";

  const dtiStatusLabel =
    dtiRatio === null
      ? (language === "en" ? "INSUFFICIENT DATA" : "Chưa đủ dữ liệu")
      : dtiRatio < 30
      ? (language === "en" ? "SAFE ZONE (< 30%)" : "Áp lực thấp (An toàn)")
      : dtiRatio <= 50
      ? (language === "en" ? "MODERATE (30% - 50%)" : "Cần rà soát giảm nợ")
      : (language === "en" ? "HIGH PRESSURE (> 50%)" : "Áp lực cao (Nguy hiểm)");

  return (
    <div className="debt-page-container">
      {/* 1. HERO COMMAND BANNER */}
      <motion.section
        className="debt-hero-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="debt-hero-ambient" />

        <div className="debt-hero-content">
          <span className="debt-hero-eyebrow">
            <Icon name="shield" size="small" />
            {language === "en" ? "DEBT MANAGEMENT & RETIREMENT CASHFLOW" : "QUẢN TRỊ NỢ VÀ DÒNG TIỀN HƯU TRÍ"}
          </span>

          <h1 className="debt-hero-title">
            {t("debt.page_title")}
          </h1>

          <p className="debt-hero-description">
            {t("debt.page_subtitle")}
          </p>

          <div className="debt-hero-pills">
            <div className="debt-hero-pill">
              <span>{language === "en" ? "Total Personal Debt:" : "Tổng dư nợ cá nhân:"}</span>
              <strong>{formatCurrency(totalDebtBalance, language)}</strong>
            </div>

            <div className="debt-hero-pill">
              <span>{language === "en" ? "Monthly Obligation:" : "Nghĩa vụ hàng tháng:"}</span>
              <strong>{formatCurrency(totalMonthlyPayment, language)}</strong>
            </div>

            <div className="debt-hero-pill">
              <span>{language === "en" ? "Active Loans:" : "Khoản vay quản lý:"}</span>
              <strong>{debtEntries.length} {language === "en" ? "loans" : "khoản"}</strong>
            </div>
          </div>
        </div>

        {/* Right Gauge */}
        <div className="debt-hero-visual">
          <div className="debt-dti-ring-container">
            <svg className="debt-dti-svg" viewBox="0 0 160 160">
              <circle
                cx="80"
                cy="80"
                r="68"
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="12"
              />
              <circle
                cx="80"
                cy="80"
                r="68"
                fill="none"
                stroke={
                  dtiRatio === null
                    ? "rgba(255, 255, 255, 0.2)"
                    : dtiRatio < 30
                    ? "var(--color-success, #1E7E55)"
                    : dtiRatio <= 50
                    ? "var(--color-warning, #B36800)"
                    : "var(--color-danger, #C0392B)"
                }
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{
                  transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s ease",
                  filter:
                    dtiRatio !== null && dtiRatio < 30
                      ? "drop-shadow(0 0 8px rgba(30, 126, 85, 0.5))"
                      : dtiRatio !== null && dtiRatio <= 50
                      ? "drop-shadow(0 0 8px rgba(179, 104, 0, 0.5))"
                      : "drop-shadow(0 0 8px rgba(192, 57, 43, 0.5))",
                }}
              />
            </svg>

            <div className="debt-dti-center">
              <span className="debt-dti-number">
                {dtiRatio !== null ? `${dtiRatio.toFixed(1)}%` : "N/A"}
              </span>
              <span className="debt-dti-label">{language === "en" ? "DTI INDEX" : "Chỉ số DTI"}</span>
            </div>
          </div>

          <span className={`debt-dti-badge ${dtiStatusClass}`}>
            <span className="status-pulse" />
            {dtiStatusLabel}
          </span>

          <p className="debt-hero-visual-footer">
            {dtiRatio === null
              ? (language === "en"
                  ? "Input your debt balances and income to calculate financial leverage and DTI ratio."
                  : "Nhập số dư nợ và thu nhập để tính toán đòn bẩy tài chính và chỉ số DTI.")
              : dtiRatio < 30
              ? (language === "en"
                  ? "Debt level is healthy. You can comfortably accumulate assets for retirement."
                  : "Áp lực nợ ở mức lành mạnh, an tâm tích lũy tài sản cho mục tiêu hưu trí.")
              : dtiRatio <= 50
              ? (language === "en"
                  ? "Consider accelerating principal payoff to free up cash flow for investments."
                  : "Cần cân nhắc tăng cường chi trả bớt nợ gốc để giải phóng dòng tiền đầu tư.")
              : (language === "en"
                  ? "High debt pressure. Consider applying the Avalanche or Snowball strategy immediately."
                  : "Áp lực trả nợ đang cao, nên áp dụng chiến lược Thác đổ hoặc Tuyết lăn ngay.")}
          </p>
        </div>
      </motion.section>

      {/* Profile v1 Warning */}
      {schemaVersion !== 2 && (
        <Alert
          tone="warning"
          title={language === "en" ? "Financial profile requires upgrade to version 2" : "Hồ sơ tài chính cần nâng cấp lên phiên bản 2"}
        >
          {language === "en"
            ? "Detailed debt payoff analysis requires profile version 2 to accurately determine personal debt obligations, maturity schedules, and early payoff terms."
            : "Hệ thống phân tích trả nợ chi tiết (T02) yêu cầu hồ sơ tài chính phiên bản 2 để xác định chính xác nghĩa vụ trả nợ cá nhân, lịch đáo hạn và điều khoản trả nợ trước hạn."}
          <div style={{ marginTop: "var(--space-3)" }}>
            <Button variant="primary" onClick={handleUpgrade} loading={isUpgrading}>
              {language === "en" ? "Upgrade to v2 now" : "Nâng cấp hồ sơ sang bản v2 ngay"}
            </Button>
          </div>
        </Alert>
      )}

      {/* Notice about unknown contract schedules */}
      {hasUnknownContracts && debtEntries.length > 0 && (
        <Alert
          tone="info"
          title={language === "en" ? "Periodic Referenced Loan Schedules" : "Hợp đồng vay tham chiếu định kỳ"}
        >
          {language === "en"
            ? "Some loans lack detailed amortization contracts. The system is calculating payoff cash flow based on self-reported periodic amounts. Once you have official contracts, add them for exact precision."
            : "Một số khoản vay chưa khai báo hợp đồng tín dụng chi tiết từng kỳ. Hệ thống đang tính toán dòng tiền trả nợ theo số tiền định kỳ bạn tự khai báo. Khi có hợp đồng chính thức, bạn có thể bổ sung để nhận kết quả tính toán chuẩn xác tuyệt đối."}
        </Alert>
      )}

      {/* 2. LOAN PORTFOLIO LIST */}
      <section>
        <div className="debt-section-header">
          <div className="debt-section-header-left">
            <h2 className="debt-section-title">
              {language === "en" ? "Current Loan Portfolio" : "Danh mục khoản vay hiện tại"}
            </h2>
            <Badge tone="soft">{debtEntries.length} {language === "en" ? "loans" : "khoản nợ"}</Badge>
          </div>

          <Button variant="primary" onClick={() => setShowAddLoanModal(true)}>
            <Icon name="plus" size="small" /> {language === "en" ? "Add New Loan" : "Thêm khoản vay mới"}
          </Button>
        </div>

        {debtEntries.length === 0 ? (
          <div className="debt-empty-card">
            <div className="debt-empty-icon">
              <Icon name="circle-check" />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700 }}>
              {language === "en" ? "No loans recorded" : "Bạn không có khoản nợ nào được ghi nhận"}
            </h3>
            <p style={{ color: "var(--color-text-muted)", maxWidth: "480px", margin: "0 0 20px", fontSize: "14px", lineHeight: 1.55 }}>
              {language === "en"
                ? "All available monthly cash flow can be allocated entirely to emergency reserves and your independent retirement portfolio."
                : "Toàn bộ dòng tiền khả dụng hàng tháng có thể được phân bổ trọn vẹn cho quỹ dự phòng khẩn cấp và danh mục tích lũy hưu trí độc lập."}
            </p>
            <Button variant="secondary" onClick={() => setShowAddLoanModal(true)}>
              <Icon name="plus" size="small" /> {language === "en" ? "Declare loan if any" : "Khai báo khoản vay nếu có"}
            </Button>
          </div>
        ) : (
          <div className="debt-loan-grid">
            {debtEntries.map((loan) => {
              const bal = loan.outstandingBalance.status === "KNOWN" ? parseFloat(loan.outstandingBalance.value) : 0;
              const pay = loan.payment.status === "KNOWN" ? parseFloat(loan.payment.value) : 0;
              const share = loan.balanceShare.status === "KNOWN" ? parseFloat(loan.balanceShare.value) * 100 : 100;
              const isContractKnown = loan.contract?.status === "KNOWN";
              const category = getLoanCategory(loan.label, language);

              return (
                <div key={loan.id} className="debt-loan-card">
                  <div>
                    <div className="debt-loan-header">
                      <div className="debt-loan-icon-wrap">
                        <Icon name={category.icon} />
                      </div>

                      <div className="debt-loan-title-group">
                        <h3>{loan.label}</h3>
                        <span className="debt-loan-sub">{category.name}</span>
                      </div>

                      {isContractKnown ? (
                        <Badge tone="success">{language === "en" ? "Standard Contract" : "Hợp đồng chuẩn"}</Badge>
                      ) : (
                        <Badge tone="neutral">{language === "en" ? "Periodic Estimate" : "Ước tính định kỳ"}</Badge>
                      )}
                    </div>

                    <div className="debt-loan-metrics">
                      <div className="debt-loan-metric-item">
                        <span>{language === "en" ? "Principal Balance" : "Dư nợ gốc"}</span>
                        <strong>{formatCurrency(bal, language)}</strong>
                      </div>

                      <div className="debt-loan-metric-item">
                        <span>{language === "en" ? "Monthly Payment" : "Trả hàng tháng"}</span>
                        <strong>{formatCurrency(pay, language)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="debt-loan-footer">
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 500 }}>
                      {language === "en" ? "Personal share:" : "Nghĩa vụ cá nhân:"} <strong style={{ color: "var(--color-text-strong)" }}>{share}%</strong>
                    </span>

                    <Button variant="ghost" size="small" onClick={() => handleRemoveLoan(loan.id)}>
                      <Icon name="trash" size="small" /> {language === "en" ? "Delete" : "Xóa"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. SCENARIO & CONTROLS */}
      {debtEntries.length > 0 && (
        <>
          <section>
            <div className="debt-scenario-card">
              <div className="debt-scenario-head">
                <div className="debt-scenario-head-icon">
                  <Icon name="settings" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>
                    {language === "en" ? "Debt Payoff Scenario Parameters" : "Tham số phân tích kịch bản trả nợ"}
                  </h2>
                  <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                    {language === "en"
                      ? "Adjust monthly reserve and extra payoff budget to see acceleration effects"
                      : "Điều chỉnh ngân sách dự phòng và số tiền trả thêm mỗi tháng để xem hiệu quả tăng tốc sạch nợ"}
                  </span>
                </div>
              </div>

              <div className="debt-scenario-grid">
                {/* Horizon Switcher */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                    {language === "en" ? "Comparison Horizon" : "Khung thời gian so sánh"}
                  </label>
                  <div className="debt-horizon-pills">
                    {[
                      { val: 24, label: language === "en" ? "2 years" : "2 năm" },
                      { val: 36, label: language === "en" ? "3 years" : "3 năm" },
                      { val: 60, label: language === "en" ? "5 years" : "5 năm" },
                      { val: 120, label: language === "en" ? "10 years" : "10 năm" },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        className={`debt-horizon-btn ${horizonMonths === item.val ? "is-active" : ""}`}
                        onClick={() => setHorizonMonths(item.val)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Monthly Reserve */}
                <div>
                  <Input
                    type="number"
                    label={language === "en" ? "Monthly reserve budget retained (VND)" : "Ngân sách dự phòng giữ lại mỗi tháng (VND)"}
                    value={reserveMonthly}
                    onChange={setReserveMonthly}
                  />
                  <div className="debt-quick-chips">
                    {["1000000", "2000000", "5000000"].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        className={`debt-chip ${parseFloat(reserveMonthly) === parseFloat(amt) ? "is-selected" : ""}`}
                        onClick={() => setReserveMonthly(`${amt}.00`)}
                      >
                        {parseInt(amt, 10) / 1000000} {language === "en" ? "million" : "triệu"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Extra Monthly Payment Budget */}
                <div>
                  <Input
                    type="number"
                    label={language === "en" ? "Extra payoff budget per month (VND)" : "Ngân sách trả nợ thêm mỗi tháng (VND)"}
                    value={extraMonthlyBudget}
                    onChange={setExtraMonthlyBudget}
                  />
                  <div className="debt-quick-chips">
                    {["1000000", "2000000", "3000000", "5000000"].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        className={`debt-chip ${parseFloat(extraMonthlyBudget) === parseFloat(amt) ? "is-selected" : ""}`}
                        onClick={() => setExtraMonthlyBudget(`${amt}.00`)}
                      >
                        +{parseInt(amt, 10) / 1000000} {language === "en" ? "million" : "triệu"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Payoff Dropdown */}
                <div>
                  <Select
                    label={language === "en" ? "Target loan for priority payoff" : "Khoản ưu tiên tất toán trước"}
                    options={[language === "en" ? "None selected" : "Không chọn", ...debtEntries.map((d) => d.label)]}
                    value={debtEntries.find((d) => d.id === selectedPayoffLoanId)?.label || (language === "en" ? "None selected" : "Không chọn")}
                    onChange={(lbl) => {
                      const match = debtEntries.find((d) => d.label === lbl);
                      setSelectedPayoffLoanId(match ? match.id : "");
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 4. REAL-TIME PRESSURE METRICS */}
          {loadingPreview ? (
            <Card style={{ padding: "36px", textAlign: "center" }}>
              <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
                {language === "en" ? "Calculating periodic payoff cash flow..." : "Đang tính toán dòng tiền trả nợ từng kỳ..."}
              </p>
            </Card>
          ) : previewError ? (
            <Alert tone="danger" title={language === "en" ? "Simulation failed" : "Không thể chạy mô phỏng"}>
              {previewError}
            </Alert>
          ) : previewData ? (
            <>
              <div className="debt-metrics-grid">
                {/* Metric 1: DTI */}
                <div className={`debt-metric-card ${dtiRatio !== null && dtiRatio > 50 ? "accent-rose" : dtiRatio !== null && dtiRatio > 30 ? "accent-amber" : "accent-emerald"}`}>
                  <span className="debt-metric-title">
                    {language === "en" ? "Debt-to-Income Ratio (DTI)" : "Tỷ lệ trả nợ trên thu nhập (DTI)"}
                  </span>
                  <div className="debt-metric-value">
                    {dtiRatio !== null ? `${dtiRatio.toFixed(1)}%` : (language === "en" ? "N/A" : "Chưa rõ")}
                  </div>
                  <div>
                    {dtiRatio === null ? (
                      <Badge tone="neutral">{language === "en" ? "Missing Income Data" : "Thiếu dữ liệu thu nhập"}</Badge>
                    ) : dtiRatio < 30 ? (
                      <Badge tone="success">{language === "en" ? "Low Pressure (Safe)" : "Áp lực thấp (An toàn)"}</Badge>
                    ) : dtiRatio <= 50 ? (
                      <Badge tone="warning">{language === "en" ? "Review to Reduce Debt" : "Cần rà soát giảm nợ"}</Badge>
                    ) : (
                      <Badge tone="danger">{language === "en" ? "High Pressure (Critical)" : "Áp lực cao (Nguy hiểm)"}</Badge>
                    )}
                  </div>
                  <p className="debt-metric-subtext">
                    {language === "en"
                      ? "Professional guideline: Maintain DTI below 30% of net income to keep retirement savings uninterrupted."
                      : "Khuyến nghị chuyên môn: DTI nên duy trì dưới 30% thu nhập khả dụng để đảm bảo quỹ hưu trí không bị gián đoạn."}
                  </p>
                </div>

                {/* Metric 2: Remaining Cashflow */}
                <div className={`debt-metric-card ${remainingCash !== null && remainingCash < 0 ? "accent-rose" : "accent-emerald"}`}>
                  <span className="debt-metric-title">
                    {language === "en" ? "Remaining Monthly Cash Flow" : "Dòng tiền khả dụng còn lại hàng tháng"}
                  </span>
                  <div className="debt-metric-value" style={{ color: remainingCash !== null && remainingCash < 0 ? "var(--color-danger)" : "inherit" }}>
                    {formatCurrency(remainingCash, language)}
                  </div>
                  <div>
                    {remainingCash !== null && remainingCash < 0 ? (
                      <Badge tone="danger">{language === "en" ? "Cash Shortfall" : "Thiếu hụt tiền mặt"}</Badge>
                    ) : (
                      <Badge tone="success">{language === "en" ? "Accumulation Surplus" : "Thặng dư tích lũy"}</Badge>
                    )}
                  </div>
                  <p className="debt-metric-subtext">
                    {language === "en"
                      ? "Actual amount remaining after deducting all essential living expenses and periodic debt payments."
                      : "Số tiền thực tế còn lại sau khi khấu trừ toàn bộ chi phí sinh hoạt thiết yếu và nghĩa vụ trả nợ định kỳ."}
                  </p>
                </div>

                {/* Metric 3: Shortfall Month */}
                <div className={`debt-metric-card ${shortfallMonth ? "accent-rose" : "accent-emerald"}`}>
                  <span className="debt-metric-title">
                    {language === "en" ? "Cash Depletion Warning" : "Cảnh báo nguy cơ cạn dòng tiền"}
                  </span>
                  <div className="debt-metric-value" style={{ fontSize: "22px" }}>
                    {shortfallMonth ? shortfallMonth : (language === "en" ? "No Shortfall Month" : "Không có tháng thiếu hụt")}
                  </div>
                  <div>
                    {shortfallMonth ? (
                      <Badge tone="danger">{language === "en" ? `Depleted at month ${shortfallMonth}` : `Cạn tiền tại tháng ${shortfallMonth}`}</Badge>
                    ) : (
                      <Badge tone="success">{language === "en" ? "Cash Flow Secured Throughout" : "Dòng tiền đảm bảo suốt kỳ"}</Badge>
                    )}
                  </div>
                  <p className="debt-metric-subtext">
                    {shortfallMonth
                      ? (language === "en" ? "Need to reduce spending or restructure debt before this milestone." : "Cần điều chỉnh giảm chi tiêu hoặc tái cơ cấu khoản nợ trước mốc thời gian này.")
                      : (language === "en" ? "Monthly cash flow maintains a safe surplus throughout the analysis horizon." : "Dòng tiền hàng tháng duy trì thặng dư an toàn trong khung thời gian phân tích.")}
                  </p>
                </div>

                {/* Metric 4: Projected Debt Free Date */}
                <div className="debt-metric-card accent-blue">
                  <span className="debt-metric-title">
                    {language === "en" ? "Projected Debt-Free Date (Contracted)" : "Ngày dự kiến sạch nợ (Theo hợp đồng)"}
                  </span>
                  <div className="debt-metric-value" style={{ fontSize: "22px" }}>
                    {baseline?.debtFreeDate ? baseline.debtFreeDate : (language === "en" ? "Beyond horizon" : "Chưa xong trong kỳ")}
                  </div>
                  <div>
                    <Badge tone="info">{language === "en" ? "Standard Schedule" : "Lịch hợp đồng chuẩn"}</Badge>
                  </div>
                  <p className="debt-metric-subtext">
                    {language === "en"
                      ? "Projected full debt clearance if current principal and interest payment pace is maintained."
                      : "Thời điểm kết thúc toàn bộ dư nợ nếu tuân thủ đúng tiến độ thanh toán gốc và lãi hiện tại."}
                  </p>
                </div>
              </div>

              {/* 5. STRATEGY COMPARISON MATRIX */}
              <section>
                <div className="debt-section-header">
                  <div className="debt-section-header-left">
                    <h2 className="debt-section-title">
                      {language === "en" ? "Optimize Debt Payoff Strategies" : "So sánh các chiến lược trả nợ tối ưu"}
                    </h2>
                    <Badge tone="honey">{language === "en" ? "Multi-Scenario Analysis" : "Phân tích đa kịch bản"}</Badge>
                  </div>
                </div>

                <div className="debt-strategies-grid">
                  {/* Strategy 1: Baseline */}
                  <div className="debt-strategy-card">
                    <div>
                      <div className="strategy-head">
                        <div className="strategy-title-wrap">
                          <h3>{language === "en" ? "1. Current Contracts" : "1. Theo hợp đồng hiện tại"}</h3>
                        </div>
                        <Badge tone="neutral">{language === "en" ? "Default" : "Mặc định"}</Badge>
                      </div>

                      <p className="strategy-description">
                        {language === "en"
                          ? "Pay strictly according to agreements with lenders without extra budget allocation."
                          : "Thực hiện trả nợ theo đúng lịch trình đã thỏa thuận với bên cho vay mà không phân bổ thêm ngân sách phụ trội."}
                      </p>
                    </div>

                    <div className="strategy-data-box">
                      <div className="strategy-data-row">
                        <span>{language === "en" ? "Total Interest & Fees:" : "Tổng lãi & phí:"}</span>
                        <strong>{formatCurrency(baseline?.totals.interestAndFees, language)}</strong>
                      </div>
                      <div className="strategy-data-row">
                        <span>{language === "en" ? "Debt-Free Date:" : "Ngày sạch nợ:"}</span>
                        <strong>{baseline?.debtFreeDate || (language === "en" ? "Beyond horizon" : "Vượt kỳ phân tích")}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Strategy 2: Avalanche */}
                  <div className="debt-strategy-card is-avalanche">
                    <span className="strategy-crown-badge">
                      <Icon name="sparkles" size="small" /> {language === "en" ? "MAXIMUM INTEREST SAVED" : "TIẾT KIỆM LÃI TỐI ĐA"}
                    </span>

                    <div>
                      <div className="strategy-head">
                        <div className="strategy-title-wrap">
                          <h3>{language === "en" ? "2. Avalanche" : "2. Thác đổ (Avalanche)"}</h3>
                        </div>
                        <Badge tone="success">{language === "en" ? "Mathematically Optimal" : "Tối ưu toán học"}</Badge>
                      </div>

                      <p className="strategy-description">
                        {language === "en"
                          ? "Direct all extra funds toward the loan with highest interest rate first, minimizing cumulative bank interest."
                          : "Tập trung toàn bộ ngân sách phụ trội để trả dứt điểm khoản vay có lãi suất cao nhất trước, giúp giảm tối đa chi phí lãi tích lũy cho ngân hàng."}
                      </p>

                      <div className="strategy-savings-banner">
                        <span>{language === "en" ? "Interest & Fees Saved:" : "Tiết kiệm lãi & phí:"}</span>
                        <strong>+{formatCurrency(avalanche?.interestAndFeesSaved, language)}</strong>
                      </div>
                    </div>

                    <div className="strategy-data-box">
                      <div className="strategy-data-row">
                        <span>{language === "en" ? "Remaining Interest & Fees:" : "Tổng lãi & phí còn lại:"}</span>
                        <strong>{formatCurrency(avalanche?.result?.totals.interestAndFees, language)}</strong>
                      </div>
                      <div className="strategy-data-row">
                        <span>{language === "en" ? "New Debt-Free Date:" : "Ngày sạch nợ mới:"}</span>
                        <strong style={{ color: "var(--color-secondary-700)" }}>
                          {avalanche?.result?.debtFreeDate || (language === "en" ? "Beyond horizon" : "Vượt kỳ phân tích")}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Strategy 3: Snowball */}
                  <div className="debt-strategy-card">
                    <div>
                      <div className="strategy-head">
                        <div className="strategy-title-wrap">
                          <h3>{language === "en" ? "3. Snowball" : "3. Tuyết lăn (Snowball)"}</h3>
                        </div>
                        <Badge tone="info">{language === "en" ? "Psychological Momentum" : "Động lực tâm lý"}</Badge>
                      </div>

                      <p className="strategy-description">
                        {language === "en"
                          ? "Pay off the loan with smallest balance first to quickly eliminate creditors, building momentum and freeing cash flow."
                          : "Ưu tiên thanh toán khoản vay có số dư nhỏ nhất trước để nhanh chóng loại bỏ từng chủ nợ, tạo cảm giác chiến thắng và giải phóng dòng tiền định kỳ."}
                      </p>

                      <div className="strategy-savings-banner" style={{ background: "var(--color-soft)", borderColor: "var(--color-border)" }}>
                        <span style={{ color: "var(--color-primary-700)" }}>
                          {language === "en" ? "Interest & Fees Saved:" : "Tiết kiệm lãi & phí:"}
                        </span>
                        <strong style={{ color: "var(--color-primary-700)" }}>
                          +{formatCurrency(snowball?.interestAndFeesSaved, language)}
                        </strong>
                      </div>
                    </div>

                    <div className="strategy-data-box">
                      <div className="strategy-data-row">
                        <span>{language === "en" ? "Remaining Interest & Fees:" : "Tổng lãi & phí còn lại:"}</span>
                        <strong>{formatCurrency(snowball?.result?.totals.interestAndFees, language)}</strong>
                      </div>
                      <div className="strategy-data-row">
                        <span>{language === "en" ? "New Debt-Free Date:" : "Ngày sạch nợ mới:"}</span>
                        <strong style={{ color: "var(--color-primary-700)" }}>
                          {snowball?.result?.debtFreeDate || (language === "en" ? "Beyond horizon" : "Vượt kỳ phân tích")}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Strategy 4: Selected Payoff */}
                  {selectedPayoff && (
                    <div className="debt-strategy-card">
                      <div>
                        <div className="strategy-head">
                          <div className="strategy-title-wrap">
                            <h3>{language === "en" ? "4. Priority Payoff" : "4. Tất toán khoản đã chọn"}</h3>
                          </div>
                          <Badge tone="honey">{language === "en" ? "Custom" : "Tùy biến"}</Badge>
                        </div>

                        <p className="strategy-description">
                          {language === "en"
                            ? "Channel all extra resources toward your chosen loan to close its contract early."
                            : "Dồn toàn bộ nguồn lực trả trước cho khoản nợ được bạn chỉ định cụ thể để đóng hợp đồng sớm."}
                        </p>

                        <div className="strategy-savings-banner" style={{ background: "var(--color-warning-soft)", borderColor: "var(--color-border)" }}>
                          <span style={{ color: "var(--color-warning)" }}>
                            {language === "en" ? "Interest & Fees Saved:" : "Tiết kiệm lãi & phí:"}
                          </span>
                          <strong style={{ color: "var(--color-warning)" }}>
                            +{formatCurrency(selectedPayoff?.interestAndFeesSaved, language)}
                          </strong>
                        </div>
                      </div>

                      <div className="strategy-data-box">
                        <div className="strategy-data-row">
                          <span>{language === "en" ? "Remaining Interest & Fees:" : "Tổng lãi & phí còn lại:"}</span>
                          <strong>{formatCurrency(selectedPayoff?.result?.totals.interestAndFees, language)}</strong>
                        </div>
                        <div className="strategy-data-row">
                          <span>{language === "en" ? "New Debt-Free Date:" : "Ngày sạch nợ mới:"}</span>
                          <strong style={{ color: "var(--color-warning)" }}>
                            {selectedPayoff?.result?.debtFreeDate || (language === "en" ? "Beyond horizon" : "Vượt kỳ phân tích")}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </>
      )}

      {/* ADD LOAN MODAL */}
      {showAddLoanModal && (
        <div className="debt-modal-backdrop" onClick={() => setShowAddLoanModal(false)}>
          <div className="debt-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "var(--color-soft)", color: "var(--color-primary-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="wallet" />
                </div>
                <h3 style={{ margin: 0, fontSize: "19px", fontWeight: 800 }}>
                  {language === "en" ? "Declare New Loan" : "Khai báo khoản vay mới"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddLoanModal(false)}
                style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--color-text-muted)" }}
                aria-label={language === "en" ? "Close" : "Đóng"}
              >
                <Icon name="x" />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <Input
                  label={language === "en" ? "Loan Name / Usage Purpose" : "Tên khoản vay / Mục đích sử dụng"}
                  placeholder={language === "en" ? "e.g. Masteri Apartment Mortgage, Car Loan, Credit Card..." : "Ví dụ: Vay mua căn hộ Masteri, Vay mua xe VinFast, Thẻ tín dụng VIB..."}
                  value={newLoanLabel}
                  onChange={setNewLoanLabel}
                />
                <div className="debt-quick-chips" style={{ marginTop: "6px" }}>
                  {(language === "en"
                    ? ["Home Mortgage", "Car Loan", "Credit Card", "Consumer Loan"]
                    : ["Vay mua nhà", "Vay mua ô tô", "Thẻ tín dụng", "Vay tiêu dùng"]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="debt-chip"
                      onClick={() => setNewLoanLabel(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                type="number"
                label={language === "en" ? "Current Principal Balance (VND)" : "Dư nợ gốc hiện tại (VND)"}
                placeholder={language === "en" ? "e.g. 500000000" : "Ví dụ: 500000000"}
                value={newLoanBalance}
                onChange={setNewLoanBalance}
              />

              <Input
                type="number"
                label={language === "en" ? "Monthly Payment (Principal + Interest) (VND)" : "Số tiền trả mỗi tháng (Gốc + Lãi) (VND)"}
                placeholder={language === "en" ? "e.g. 8500000" : "Ví dụ: 8500000"}
                value={newLoanPayment}
                onChange={setNewLoanPayment}
              />

              <Input
                type="number"
                label={language === "en" ? "Personal Responsibility Share (%)" : "Tỷ lệ nghĩa vụ cá nhân (%)"}
                placeholder={language === "en" ? "100 if sole borrower, 50 if co-borrower" : "100 nếu tự vay, 50 nếu chia sẻ nghĩa vụ đồng vay"}
                value={newLoanShare}
                onChange={setNewLoanShare}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "28px" }}>
              <Button variant="ghost" onClick={() => setShowAddLoanModal(false)}>
                {language === "en" ? "Cancel" : "Hủy bỏ"}
              </Button>
              <Button variant="primary" onClick={handleCreateLoan}>
                <Icon name="check" size="small" /> {language === "en" ? "Save Loan" : "Lưu khoản vay"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
