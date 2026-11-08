import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { motion } from "motion/react";
import { Alert, Badge, Button, Icon, Select, useNotification, type IconName } from "../components/ui";
import { Decimal } from "../utils/decimal";
import DebtLoanDialog from "../components/retirement/DebtLoanDialog";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { previewDebts, type DebtPreviewResponse } from "../services/debts";
import { type DebtEntry } from "../services/financialProfile";
import { useI18n } from "../i18n";
import { formatDateVN } from "../utils/date";
import { formatNumberWithDots } from "../utils/currency";
import "./debt-page.css";
import DebtAnalysisResults from "../components/retirement/DebtAnalysisResults";
import ProfileFormattedInput from "../components/ProfileFormattedInput";

function formatCurrency(amount: string | number | null | undefined, language: "vi" | "en" = "vi"): string {
  if (amount === null || amount === undefined) return language === "en" ? "None" : "Chưa có";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return "0 VND";
  const rounded = Math.round(num);
  const isNeg = rounded < 0;
  const absStr = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isNeg ? "-" : ""}${absStr} VND`;
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

function getLoanInterestRate(loan: DebtEntry): number {
  if (loan.contract?.status === "KNOWN" && loan.contract.value) {
    const raw = (loan.contract.value as Record<string, unknown>).interestRateAnnual;
    if (raw && typeof raw === "object" && "status" in raw && (raw as { status: string; value?: unknown }).status === "KNOWN") {
      const parsed = parseFloat(String((raw as { status: string; value?: unknown }).value));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } else if (raw) {
      const parsed = parseFloat(String(raw));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 8.5;
}

export default function DebtAnalysisPage() {
  const { t, language } = useI18n();
  const { profile, v2Profile, schemaVersion, profileRevision, upgradeToV2, updateProfileV2 } = useFinancialProfile();
  const { notify } = useNotification();
  const { currentVersion, draftSelection, updateDraft } = useRetirementPlan();
  const navigate = useNavigate();

  const [horizonMonths, setHorizonMonths] = useState<number>(60);
  const [reserveInput, setReserveMonthly] = useState<string | null>(null);
  const reserveMonthly = reserveInput ?? draftSelection?.monthlyReserve ?? currentVersion?.preview.selection.monthlyReserve ?? "0";
  const [extraMonthlyBudget, setExtraMonthlyBudget] = useState<string>("0");
  const [selectedPayoffLoanId, setSelectedPayoffLoanId] = useState<string>("");

  const [previewData, setPreviewData] = useState<DebtPreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showAddLoanModal, setShowAddLoanModal] = useState(false);
  const [loanToDelete, setLoanToDelete] = useState<DebtEntry | null>(null);
  const [isDeletingLoan, setIsDeletingLoan] = useState(false);
  const [scheduleLoan, setScheduleLoan] = useState<DebtEntry | null>(null);

  const [editingLoan, setEditingLoan] = useState<DebtEntry | null>(null);

  const openLoan = (loan: DebtEntry | null = null) => {
    setEditingLoan(loan); setShowAddLoanModal(true);
  };

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

  const totalEstimatedInterest = useMemo(() => {
    return debtEntries.reduce((acc, loan) => {
      if (loan.outstandingBalance.status === "KNOWN") {
        const bal = parseFloat(loan.outstandingBalance.value);
        const rate = getLoanInterestRate(loan);
        const interest = Math.round(bal * (rate / 1200));
        return acc + interest;
      }
      return acc;
    }, 0);
  }, [debtEntries]);

  const scenarioForm = useRef<HTMLFormElement>(null);
  const previewRequest = useRef(0);
  const scenarioKey = JSON.stringify([profileRevision, horizonMonths, reserveMonthly || "0", extraMonthlyBudget || "0", selectedPayoffLoanId]);
  const [calculatedScenario, setCalculatedScenario] = useState<{ key: string; horizon: number } | null>(null);
  const resultOutdated = Boolean(previewData && calculatedScenario?.key !== scenarioKey);
  const loadPreview = async () => {
    if (schemaVersion !== 2 || !v2Profile || debtEntries.length === 0) {
      setPreviewData(null); setPreviewError(null); setLoadingPreview(false);
      return;
    }

    if (scenarioForm.current && !scenarioForm.current.reportValidity()) return;
    const request = ++previewRequest.current;
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const validMoney = (value: string) => !value.trim() || /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value.trim());
      if (!validMoney(reserveMonthly) || !validMoney(extraMonthlyBudget)) throw new Error(language === "en" ? "Enter a non-negative budget with at most two decimal places." : "Nhập ngân sách không âm, tối đa 16 chữ số và 2 chữ số thập phân.");
      const res = await previewDebts({
        expectedProfileRevision: profileRevision,
        horizonMonths,
        reserveMonthly: reserveMonthly.trim() || null,
        extraMonthlyBudget: extraMonthlyBudget.trim() || null,
        payoffLoanId: debtEntries.some(loan => loan.id === selectedPayoffLoanId) ? selectedPayoffLoanId : undefined,
        stress: [],
      });
      if (request === previewRequest.current) {
        setPreviewData(res); setCalculatedScenario({ key: scenarioKey, horizon: horizonMonths });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : (language === "en" ? "Could not calculate debt payoff plan." : "Chưa thể tính toán phương án trả nợ.");
      if (request === previewRequest.current) setPreviewError(msg);
    } finally {
      if (request === previewRequest.current) setLoadingPreview(false);
    }
  };

  // Recalculate on saved profile changes; typing scenario parameters is local only.
  useEffect(() => {
    setPreviewData(null); setCalculatedScenario(null);
    void loadPreview();
    return () => { previewRequest.current++; };
  }, [schemaVersion, profileRevision, v2Profile]);

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

  const monthlyIncome = profile.income.primaryIncome + profile.income.secondaryIncome;
  const firstRow = previewData?.baseline?.rows?.[0];
  const ratio = firstRow?.pressure?.ratioPercent;
  let effectiveDti: number | null = ratio != null && Number.isFinite(Number(ratio)) ? Number(ratio) : null;
  if (effectiveDti === null && monthlyIncome > 0 && totalMonthlyPayment === 0) {
    effectiveDti = 0;
  }

  const hasUnknownContracts = debtEntries.some((d) => !d.contract || d.contract.status !== "KNOWN");

  // DTI Gauge calculation
  const totalReservedMonthly = (Number(reserveMonthly) || 0) + (Number(extraMonthlyBudget) || 0);
  const dtiText = effectiveDti !== null ? `${new Intl.NumberFormat(language === "en" ? "en-US" : "vi-VN", { maximumFractionDigits: 1 }).format(effectiveDti)}%` : (language === "en" ? "None" : "Chưa tính được");
  const isDtiLong = dtiText.length > 5;
  const dtiPercentClamped = effectiveDti !== null ? Math.min(Math.max(effectiveDti, 0), 100) : 0;
  const circumference = 2 * Math.PI * 68;
  const strokeDashoffset = circumference - (dtiPercentClamped / 100) * circumference;

  const dtiStatusClass =
    effectiveDti === null
      ? "is-neutral"
      : effectiveDti < 30
      ? "is-safe"
      : effectiveDti <= 50
      ? "is-warning"
      : "is-danger";

  const dtiStatusLabel =
    effectiveDti === null
      ? (language === "en" ? "INSUFFICIENT DATA" : "Chưa đủ dữ liệu")
      : effectiveDti < 30
      ? (language === "en" ? "SAFE ZONE (< 30%)" : "Tỷ lệ trả nợ dưới 30%")
      : effectiveDti <= 50
      ? (language === "en" ? "MODERATE (30% - 50%)" : "Cần rà soát giảm nợ")
      : (language === "en" ? "HIGH PRESSURE (> 50%)" : "Tỷ lệ trả nợ trên 50%");

  return (
    <div className="debt-page-container">
      {/* Breadcrumb Navigation */}
      <nav className="breadcrumb" aria-label="Đường dẫn trang" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--muted, #456B91)", marginBottom: "4px" }}>
        <Link to="/user/profile" className="btn-breadcrumb" style={{ color: "var(--primary, #334DAF)", textDecoration: "none", fontWeight: 600 }}>
          ← {language === "en" ? "Your finances" : "Tài chính của bạn"}
        </Link>
        <span className="sep" style={{ color: "var(--border, #D0E4FE)" }}>/</span>
        <span aria-current="page" style={{ fontWeight: 600, color: "var(--navy, #052659)" }}>
          {language === "en" ? "Debts & Repayments" : "Khoản nợ & trả nợ"}
        </span>
      </nav>

      {/* Page Heading */}
      <div className="page-head" style={{ marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: 700, color: "var(--navy, #052659)", margin: "0 0 6px", letterSpacing: "-1px" }}>
            {language === "en" ? "Debts & ability to pay" : "Khoản nợ & khả năng trả"}
          </h1>
          <p style={{ margin: 0, color: "var(--muted, #456B91)", fontSize: "14px" }}>
            {language === "en" ? "Track balances, interest rates, and monthly repayments for each loan." : "Theo dõi dư nợ, lãi suất và tiền trả hàng tháng của từng khoản."}
          </p>
        </div>
      </div>

      {/* Notice about unknown contract schedules */}
      {hasUnknownContracts && debtEntries.length > 0 && (
        <Alert
          tone="info"
          title={language === "en" ? "Periodic Referenced Loan Schedules" : "Cần bổ sung lịch trả nợ"}
        >
          {language === "en"
            ? "Choose “Edit loan” below to enter the balance date and repayment months. These dates do not replace the contractual schedule: principal, interest and fees for each period are still needed to compare early repayment options."
            : "Chọn “Sửa khoản vay” bên dưới để nhập ngày xác nhận dư nợ, tháng bắt đầu và tháng kết thúc trả nợ. Các mốc ngày này chưa thay thế lịch hợp đồng: vẫn cần số tiền gốc, lãi và phí từng kỳ để so sánh cách trả trước."}
        </Alert>
      )}

      {/* 2. LOAN PORTFOLIO LIST & PLAN IMPACT */}
      <section className="card" style={{ background: "var(--white, #fff)", border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-lg, 24px)", padding: "28px" }}>
        <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--navy, #052659)", margin: "0 0 6px" }}>
              {language === "en" ? "Debts" : "Khoản nợ"}
            </div>
            <p className="muted small" style={{ margin: 0, color: "var(--muted, #456B91)", fontSize: "13px" }}>
              {language === "en"
                ? "Monthly debt repayments are subtracted from your investable budget. When adding a loan, choose to split from the entered total or add a new loan. The remainder is calculated automatically."
                : "Tiền trả nợ hàng tháng được trừ khỏi ngân sách có thể tích lũy. Khi thêm khoản, chọn tách từ số tổng đã nhập hoặc cộng khoản mới. Phần còn lại được tính tự động."}
            </p>
          </div>
          <Button variant="secondary" size="small" onClick={() => openLoan()}>
            <Icon name="plus" size="small" /> {language === "en" ? "Add loan" : "Thêm khoản nợ"}
          </Button>
        </div>

        {debtEntries.length === 0 ? (
          <div className="debt-empty-card" style={{ padding: "32px 16px", textAlign: "center" }}>
            <div className="debt-empty-icon" style={{ marginBottom: "12px" }}>
              <Icon name="circle-check" />
            </div>
            <p style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, color: "var(--navy, #052659)" }}>
              {language === "en" ? "No loans recorded" : "Bạn không có khoản nợ nào được ghi nhận"}
            </p>
            <p style={{ color: "var(--muted, #456B91)", maxWidth: "480px", margin: "0 auto 20px", fontSize: "14px", lineHeight: 1.55 }}>
              {language === "en"
                ? "All available monthly cash flow can be allocated entirely to emergency reserves and your independent retirement portfolio."
                : "Toàn bộ dòng tiền khả dụng hàng tháng có thể được phân bổ trọn vẹn cho quỹ dự phòng khẩn cấp và danh mục tích lũy hưu trí độc lập."}
            </p>
            <Button variant="secondary" onClick={() => openLoan()}>
              <Icon name="plus" size="small" /> {language === "en" ? "Declare loan if any" : "Khai báo khoản nợ"}
            </Button>
          </div>
        ) : (
          <div className="debt-loan-list" style={{ display: "grid" }}>
            {debtEntries.map((loan) => {
              const bal = loan.outstandingBalance.status === "KNOWN" ? parseFloat(loan.outstandingBalance.value) : 0;
              const pay = loan.payment.status === "KNOWN" ? parseFloat(loan.payment.value) : 0;
              const isContractKnown = loan.contract?.status === "KNOWN";
              const rate = getLoanInterestRate(loan);
              const monthlyRate = rate / 1200;
              const interest = Math.round(bal * monthlyRate);
              const months = pay > interest && monthlyRate > 0
                ? Math.ceil(-Math.log(1 - (bal * monthlyRate) / pay) / Math.log(1 + monthlyRate))
                : (pay > 0 ? Math.ceil(bal / pay) : null);
              const payoffStr = months
                ? (language === "en" ? `Est. payoff: ${months} months` : `Ước tính trả hết: ${months} tháng`)
                : (pay > 0 ? (language === "en" ? "Payment insufficient to reduce principal" : "Khoản trả chưa đủ giảm gốc") : (language === "en" ? "No payment entered" : "Chưa có tiền trả"));
              const category = getLoanCategory(loan.label, language);

              return (
                <div
                  key={loan.id}
                  className="ledger-row debt-row debt-card"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "16px",
                    padding: "16px 0",
                    borderBottom: "1px solid var(--border, #D0E4FE)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "220px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <Icon name={category.icon} size="small" />
                      <strong style={{ fontSize: "15px", color: "var(--navy, #052659)" }}>{loan.label}</strong>
                      {isContractKnown ? (
                        <Badge tone="success">{language === "en" ? "Standard Contract" : "Hợp đồng chuẩn"}</Badge>
                      ) : (
                        <Badge tone="neutral">{language === "en" ? "Periodic Estimate" : "Ước tính định kỳ"}</Badge>
                      )}
                    </div>
                    <p className="small muted" style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted, #456B91)" }}>
                      {language === "en" ? "Balance: " : "Dư nợ: "}{formatCurrency(bal, language)} · {language === "en" ? "Pay: " : "Trả: "}{formatCurrency(pay, language)}/{language === "en" ? "month" : "tháng"} · {payoffStr} · {language === "en" ? "Rate: " : "Lãi "}{rate}%/{language === "en" ? "year" : "năm"}
                    </p>
                  </div>

                  <strong style={{ fontSize: "16px", color: "var(--navy, #052659)", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(bal, language)}
                  </strong>

                  <div className="row" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <Button variant="secondary" size="small" onClick={() => setScheduleLoan(loan)}>
                      {language === "en" ? "Schedule" : "Xem lịch trả"}
                    </Button>
                    <Button variant="ghost" size="small" onClick={() => openLoan(loan)}>
                      {language === "en" ? "Edit" : "Sửa"}
                    </Button>
                    <Button variant="ghost" size="small" onClick={() => setLoanToDelete(loan)}>
                      <Icon name="trash" size="small" /> {language === "en" ? "Delete" : "Xóa"}
                    </Button>
                  </div>
                </div>
              );
            })}

            <div
              className="detail-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 0 10px",
                borderBottom: "1px solid var(--border, #D0E4FE)",
              }}
            >
              <strong style={{ fontSize: "15px", color: "var(--navy, #052659)" }}>
                {language === "en" ? "Total debts" : "Tổng khoản nợ"}
              </strong>
              <strong style={{ fontSize: "18px", color: "var(--navy, #052659)", fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(totalDebtBalance, language)}
              </strong>
            </div>

            <div className="top-space" style={{ marginTop: "16px" }}>
              <Button variant="primary" onClick={() => openLoan()}>
                ＋ {language === "en" ? "Add debt" : "Thêm khoản nợ"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* IMPACT ON PLAN CARD */}
      <section className="card" style={{ background: "var(--white, #fff)", border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-lg, 24px)", padding: "28px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy, #052659)", margin: "0 0 16px" }}>
          {language === "en" ? "Impact on retirement plan" : "Ảnh hưởng tới kế hoạch"}
        </h2>
        <div className="detail-row" style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border, #D0E4FE)" }}>
          <span style={{ color: "var(--muted, #456B91)", fontSize: "14px" }}>{language === "en" ? "Total remaining debt balance" : "Tổng dư nợ còn lại"}</span>
          <strong style={{ color: "var(--navy, #052659)", fontSize: "15px" }}>{formatCurrency(totalDebtBalance, language)}</strong>
        </div>
        <div className="detail-row" style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border, #D0E4FE)" }}>
          <span style={{ color: "var(--muted, #456B91)", fontSize: "14px" }}>{language === "en" ? "Total monthly debt payment" : "Tổng trả nợ mỗi tháng"}</span>
          <strong style={{ color: "var(--navy, #052659)", fontSize: "15px" }}>{formatCurrency(totalMonthlyPayment, language)}</strong>
        </div>
        <div className="detail-row" style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border, #D0E4FE)" }}>
          <span style={{ color: "var(--muted, #456B91)", fontSize: "14px" }}>{language === "en" ? "Estimated first-month interest" : "Ước tính lãi tháng đầu"}</span>
          <strong style={{ color: "var(--navy, #052659)", fontSize: "15px" }}>{formatCurrency(totalEstimatedInterest, language)}</strong>
        </div>
        <div className="detail-row" style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border, #D0E4FE)" }}>
          <span style={{ color: "var(--muted, #456B91)", fontSize: "14px" }}>{language === "en" ? "Debt-to-income ratio (DTI)" : "Tỷ lệ trả nợ / thu nhập"}</span>
          <strong style={{ color: "var(--navy, #052659)", fontSize: "15px" }}>{effectiveDti !== null ? dtiText : (monthlyIncome > 0 ? `${Math.round(totalMonthlyPayment / monthlyIncome * 100)}%` : (language === "en" ? "No income recorded" : "Chưa có thu nhập"))}</strong>
        </div>

        {debtEntries.map((loan) => {
          const bal = loan.outstandingBalance.status === "KNOWN" ? parseFloat(loan.outstandingBalance.value) : 0;
          const pay = loan.payment.status === "KNOWN" ? parseFloat(loan.payment.value) : 0;
          const rate = getLoanInterestRate(loan);
          const monthlyRate = rate / 1200;
          const interest = Math.round(bal * monthlyRate);
          const months = pay > interest && monthlyRate > 0
            ? Math.ceil(-Math.log(1 - (bal * monthlyRate) / pay) / Math.log(1 + monthlyRate))
            : (pay > 0 ? Math.ceil(bal / pay) : null);
          return (
            <p key={loan.id} className="top-space" style={{ marginTop: "12px", fontSize: "14px", color: "var(--navy, #052659)" }}>
              <strong>{loan.label}</strong>: {months ? (language === "en" ? `approx. ${months} months to payoff` : `khoảng ${months} tháng để trả hết`) : (language === "en" ? "payment insufficient to reduce principal" : "khoản trả chưa đủ giảm gốc")}. {interest > 0 ? (language === "en" ? `First-month interest approx. ${formatCurrency(interest, language)}.` : `Lãi tháng đầu khoảng ${formatCurrency(interest, language)}.`) : ""}
            </p>
          );
        })}

        <p className="small muted top-space" style={{ marginTop: "16px", fontSize: "12px", color: "var(--muted, #456B91)", lineHeight: 1.6 }}>
          {language === "en"
            ? "Estimates assume declining balance, fixed interest rates, and constant monthly payments, excluding fees. Detailed loans use this amortization schedule; overall amounts assume fixed payments."
            : "Ước tính dư nợ giảm dần, lãi suất và khoản trả cố định, chưa gồm phí. Khoản đã kê chi tiết dùng lịch trả minh họa này trong dự phóng; khoản chỉ nhập tổng giữ tiền trả cố định."}
        </p>
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

              <div className="debt-reserve-banner">
                <div className="debt-reserve-banner-body">
                  <div className="debt-reserve-banner-icon">
                    <Icon name="wallet" />
                  </div>
                  <div className="debt-reserve-banner-info">
                    <h3 className="debt-reserve-banner-title">
                      {language === "en" ? "Budget Allocation for Debt Acceleration" : "Ngân sách giữ riêng cho phương án trả nợ"}
                    </h3>
                    <p className="debt-reserve-banner-desc">
                      {language === "en"
                        ? "This analysis does not modify loan contracts or your active retirement plan. You can reserve this budget below to verify whether your retirement contribution remains feasible."
                        : "Phân tích này chưa thay đổi khoản vay hay kế hoạch hưu trí. Bạn có thể giữ riêng ngân sách dưới đây, rồi kiểm tra tiền góp hưu trí còn phù hợp không."}
                    </p>
                    <div className="debt-reserve-banner-subnotes">
                      <span className="debt-reserve-subnote-item">
                        <Icon name="shield" size="small" />
                        {language === "en"
                          ? "Includes monthly buffer + extra payoff budget, kept outside retirement fund until updated."
                          : "Gồm dự phòng hàng tháng và khoản trả nợ thêm, nằm ngoài quỹ hưu trí cho đến khi sửa lại; chưa ghi nhận khoản vay nào đã được trả."}
                      </span>
                      <Link to="/user/simulation?tab=actuals" className="debt-reserve-actuals-link">
                        <Icon name="chart" size="small" />
                        {language === "en" ? "Record payments already made" : "Ghi lại khoản trả nợ đã thực hiện"}
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="debt-reserve-banner-action-group">
                  {totalReservedMonthly > 0 && (
                    <div className="debt-reserve-amount-pill">
                      <span className="pill-caption">{language === "en" ? "Total Reserved Budget" : "Tổng tiền giữ riêng"}</span>
                      <strong className="pill-value">
                        {formatCurrency(totalReservedMonthly, language)} / {language === "en" ? "month" : "tháng"}
                      </strong>
                    </div>
                  )}
                  <Button
                    variant="primary"
                    disabled={
                      !Number.isFinite(Number(reserveMonthly)) ||
                      !Number.isFinite(Number(extraMonthlyBudget)) ||
                      Number(reserveMonthly) < 0 ||
                      Number(extraMonthlyBudget) < 0
                    }
                    onClick={() => {
                      if (scenarioForm.current && !scenarioForm.current.reportValidity()) return;
                      updateDraft({
                        monthlyReserve: new Decimal(reserveMonthly || "0").plus(extraMonthlyBudget || "0").toString(),
                      });
                      navigate("/user/plan");
                    }}
                  >
                    {language === "en"
                      ? "Reserve this budget and review retirement plan"
                      : "Giữ riêng ngân sách này và xem kế hoạch hưu trí"}
                  </Button>
                </div>
              </div>
              <form ref={scenarioForm} onSubmit={event => { event.preventDefault(); void loadPreview(); }}>
              <div className="debt-scenario-grid">
                {/* Horizon Switcher */}
                <div className="debt-scenario-col">
                  <label className="debt-scenario-col-label">
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
                <div className="debt-scenario-col">
                  <ProfileFormattedInput
                    format="money"
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
                            onClick={() => setReserveMonthly(amt)}
                          >
                            {formatNumberWithDots(amt)} {language === "en" ? "VND" : "đ"}
                          </button>
                        ))}
                      </div>
                </div>

                {/* Extra Monthly Payment Budget */}
                <div className="debt-scenario-col">
                  <ProfileFormattedInput
                    format="money"
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
                            onClick={() => setExtraMonthlyBudget(amt)}
                          >
                            {formatNumberWithDots(amt)} {language === "en" ? "VND" : "đ"}
                          </button>
                        ))}
                      </div>
                </div>

                {/* Selected Payoff Dropdown */}
                <div className="debt-scenario-col">
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
              <div className="debt-calculate-actions">
                <p role="status">{loadingPreview
                  ? (language === "en" ? "Calculating… Previous results remain below." : "Đang tính toán… Kết quả trước vẫn được giữ bên dưới.")
                  : resultOutdated
                    ? (language === "en" ? "Parameters changed. Recalculate to update the results below." : "Thông số đã thay đổi. Bấm Tính lại để cập nhật kết quả bên dưới.")
                    : (language === "en" ? "Edit the parameters, then recalculate. Your loan records will not be changed." : "Chỉnh thông số rồi bấm Tính lại. Thao tác này không sửa hồ sơ khoản vay.")}</p>
                <Button type="submit" variant="primary" loading={loadingPreview}>{language === "en" ? "Recalculate" : "Tính lại"}</Button>
              </div>
              </form>
            </div>
          </section>

          {previewError && (
            <Alert tone="danger" title={language === "en" ? "Calculation failed; previous results have not been updated" : "Chưa tính được; kết quả trước chưa được cập nhật"} action={<Button disabled={loadingPreview} onClick={() => void loadPreview()}>{language === "en" ? "Retry" : "Thử lại"}</Button>}>
              {previewError}
            </Alert>
          )}
          {previewData && <div aria-busy={loadingPreview}>
            {resultOutdated && <p className="debt-results-stale">{language === "en" ? "Results below use the previous parameters." : "Kết quả bên dưới đang dùng thông số của lần tính trước."}</p>}
            <DebtAnalysisResults data={previewData} loans={debtEntries} horizonMonths={calculatedScenario?.horizon ?? horizonMonths} />
          </div>}
        </>
      )}

      {showAddLoanModal && v2Profile && <DebtLoanDialog
        loan={editingLoan} valuationDate={v2Profile.valuationDate}
        onClose={() => setShowAddLoanModal(false)}
        onSave={async loan => {
          const entries = editingLoan ? debtEntries.map(entry => entry.id === loan.id ? loan : entry) : [...debtEntries, loan];
          const ok = await updateProfileV2({ debts: { status: "KNOWN", entries } });
          if (ok) {
            notify.success(language === "en" ? "Loan saved" : "Đã lưu khoản vay", loan.label);
            setShowAddLoanModal(false);
          }
          return ok;
        }}
      />}

      {/* CONFIRM DELETE LOAN MODAL */}
      {loanToDelete && (
        <div className="debt-modal-backdrop" onClick={() => !isDeletingLoan && setLoanToDelete(null)}>
          <div className="debt-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-loan-dialog-title">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(192, 57, 43, 0.1)", color: "var(--color-danger, #C0392B)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="trash" />
                </div>
                <h3 id="delete-loan-dialog-title" style={{ margin: 0, fontSize: "19px", fontWeight: 800 }}>
                  {language === "en" ? "Confirm Loan Deletion" : "Xác nhận xóa khoản vay"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isDeletingLoan && setLoanToDelete(null)}
                style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--color-text-muted)" }}
                aria-label={language === "en" ? "Close" : "Đóng"}
              >
                <Icon name="x" />
              </button>
            </div>

            <p style={{ margin: "0 0 16px", color: "var(--color-text-muted)", fontSize: "14px", lineHeight: 1.6 }}>
              {language === "en"
                ? `Are you sure you want to delete the loan "${loanToDelete.label}" with outstanding balance ${formatCurrency(loanToDelete.outstandingBalance.status === "KNOWN" ? loanToDelete.outstandingBalance.value : 0, language)}? This action will remove it from your debt schedule and recalculate your cash flow.`
                : `Bạn có chắc chắn muốn xóa khoản vay "${loanToDelete.label}" với dư nợ ${formatCurrency(loanToDelete.outstandingBalance.status === "KNOWN" ? loanToDelete.outstandingBalance.value : 0, language)} khỏi hồ sơ tài chính không? Thao tác này sẽ cập nhật lại dòng tiền và kế hoạch trả nợ của bạn.`}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <Button variant="ghost" disabled={isDeletingLoan} onClick={() => setLoanToDelete(null)}>
                {language === "en" ? "Cancel" : "Hủy bỏ"}
              </Button>
              <Button
                variant="primary"
                style={{ background: "var(--color-danger, #C0392B)", borderColor: "var(--color-danger, #C0392B)" }}
                loading={isDeletingLoan}
                onClick={async () => {
                  setIsDeletingLoan(true);
                  try {
                    await handleRemoveLoan(loanToDelete.id);
                    setLoanToDelete(null);
                  } finally {
                    setIsDeletingLoan(false);
                  }
                }}
              >
                <Icon name="trash" size="small" /> {language === "en" ? "Delete Loan" : "Xác nhận xóa"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 24-PERIOD LOAN AMORTIZATION SCHEDULE MODAL */}
      {scheduleLoan && (() => {
        const bal = scheduleLoan.outstandingBalance.status === "KNOWN" ? parseFloat(scheduleLoan.outstandingBalance.value) : 0;
        const pay = scheduleLoan.payment.status === "KNOWN" ? parseFloat(scheduleLoan.payment.value) : 0;
        const rate = getLoanInterestRate(scheduleLoan);
        const monthlyRate = rate / 1200;
        let curr = bal;
        const scheduleRows: { m: number; principal: number; interest: number; closing: number }[] = [];
        for (let m = 1; m <= Math.min(1200, pay > 0 ? bal / pay + 1200 : 24); m++) {
          const interest = Math.round(curr * monthlyRate);
          const payment = Math.min(curr + interest, pay);
          const principal = Math.max(0, payment - interest);
          const closing = Math.max(0, curr - principal);
          scheduleRows.push({ m, principal, interest, closing });
          curr = closing;
          if (curr < 1 || principal <= 0) break;
        }
        const totalInterestCalc = scheduleRows.reduce((acc, r) => acc + r.interest, 0);

        return (
          <div className="debt-modal-backdrop" onClick={() => setScheduleLoan(null)}>
            <div className="debt-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: "680px", width: "100%", background: "var(--white, #fff)", borderRadius: "var(--r-lg, 24px)", padding: "28px", border: "1px solid var(--border, #D0E4FE)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--navy, #052659)" }}>
                    {language === "en" ? "Illustrative Repayment Schedule" : "Lịch trả nợ minh họa"}
                  </h3>
                  <p style={{ margin: "6px 0 0", fontSize: "14px", color: "var(--muted, #456B91)" }}>
                    <strong>{scheduleLoan.label}</strong> · {language === "en" ? "Rate: " : "Lãi "}{rate}%/{language === "en" ? "year" : "năm"} · {language === "en" ? "Payment: " : "Trả "}{formatCurrency(pay, language)}/{language === "en" ? "month" : "tháng"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleLoan(null)}
                  style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--muted, #456B91)" }}
                  aria-label={language === "en" ? "Close" : "Đóng"}
                >
                  <Icon name="x" />
                </button>
              </div>

              <div className="notice" style={{ background: "var(--soft, #E8F2FE)", color: "var(--navy, #052659)", padding: "12px 16px", borderRadius: "var(--r-sm, 12px)", fontSize: "13px", marginBottom: "16px" }}>
                {language === "en"
                  ? "Interest calculated on reducing balance; rate and payment are fixed. Excludes fees or contract amendments."
                  : "Lãi tính trên dư nợ giảm dần; lãi suất và tiền trả cố định. Chưa gồm phí hoặc thay đổi hợp đồng."}
              </div>

              <div className="table-scroll" style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-sm, 12px)" }}>
                <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "var(--soft, #E8F2FE)", color: "var(--navy, #052659)" }}>
                      <th style={{ padding: "10px 14px", textAlign: "left" }}>{language === "en" ? "Period" : "Kỳ"}</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>{language === "en" ? "Principal" : "Tiền gốc"}</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>{language === "en" ? "Interest" : "Tiền lãi"}</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>{language === "en" ? "Remaining" : "Còn nợ"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.slice(0, 24).map((r) => (
                      <tr key={r.m} style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                        <td style={{ padding: "10px 14px" }}>{r.m}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>{formatCurrency(r.principal, language)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>{formatCurrency(r.interest, language)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>{formatCurrency(r.closing, language)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="small muted" style={{ marginTop: "14px", fontSize: "12px", color: "var(--muted, #456B91)" }}>
                {scheduleRows.length > 24 ? (language === "en" ? "Showing first 24 periods. " : "Đang hiển thị 24 kỳ đầu. ") : ""}
                {curr < 1
                  ? (language === "en" ? `Paid off in approx. ${scheduleRows.length} months; total interest ${formatCurrency(totalInterestCalc, language)}.` : `Trả hết trong khoảng ${scheduleRows.length} tháng; tổng lãi ${formatCurrency(totalInterestCalc, language)}.`)
                  : (language === "en" ? "Payment insufficient to reduce principal." : "Khoản trả chưa đủ giảm gốc.")}
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                <Button variant="secondary" onClick={() => setScheduleLoan(null)}>
                  {language === "en" ? "Close" : "Đóng"}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Navigation Footer */}
      <div style={{ marginTop: "24px" }}>
        <Link to="/user/account" className="button button-secondary" style={{ display: "inline-flex", textDecoration: "none" }}>
          ← {language === "en" ? "Back to your finances" : "Quay lại Tài chính của bạn"}
        </Link>
      </div>
    </div>
  );
}
