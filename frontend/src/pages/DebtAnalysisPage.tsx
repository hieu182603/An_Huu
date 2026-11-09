import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useNotification } from "../components/ui";
import DebtLoanDialog from "../components/retirement/DebtLoanDialog";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { type DebtEntry } from "../services/financialProfile";
import { useI18n } from "../i18n";
import "./debt-page.css";

function formatFullMoney(val: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(val) || 0))} ₫`;
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
  const { language } = useI18n();
  const vi = language !== "en";
  const { profile, v2Profile, profileSummary, updateProfileV2 } = useFinancialProfile();
  const { notify } = useNotification();

  const [showAddLoanModal, setShowAddLoanModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState<DebtEntry | null>(null);

  const debtEntries: DebtEntry[] = useMemo(() => {
    if (v2Profile?.debts?.status === "KNOWN") {
      return v2Profile.debts.entries;
    }
    return [];
  }, [v2Profile]);

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

  const firstMonthInterest = useMemo(() => {
    return debtEntries.reduce((acc, loan) => {
      if (loan.outstandingBalance.status === "KNOWN") {
        const bal = parseFloat(loan.outstandingBalance.value);
        const rate = getLoanInterestRate(loan);
        return acc + Math.round((bal * (rate / 100)) / 12);
      }
      return acc;
    }, 0);
  }, [debtEntries]);

  const monthlyIncome =
    profileSummary?.monthlyIncome != null
      ? Number(profileSummary.monthlyIncome)
      : profile.income.primaryIncome + profile.income.secondaryIncome || 35000000;

  const dtiPercent = monthlyIncome > 0 ? Math.round((totalMonthlyPayment / monthlyIncome) * 100) : 0;

  const openLoan = (loan: DebtEntry | null = null) => {
    setEditingLoan(loan);
    setShowAddLoanModal(true);
  };

  return (
    <div className="content">
      <nav className="breadcrumb" aria-label="Đường dẫn trang" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Link
          to="/user/profile"
          className="btn-breadcrumb"
          style={{
            border: "1px solid #cddfee",
            borderRadius: "8px",
            padding: "6px 12px",
            background: "#fff",
            color: "#052659",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          ← {vi ? "Tài chính của bạn" : "Your finances"}
        </Link>
        <span className="sep" style={{ color: "#64748b" }}>/</span>
        <span aria-current="page" style={{ fontSize: "13px", color: "#052659", fontWeight: 600 }}>
          {vi ? "Khoản nợ & trả nợ" : "Debts & repayments"}
        </span>
      </nav>

      <div className="page-head" style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>
          {vi ? "Khoản nợ & khả năng trả" : "Debts & repayment capacity"}
        </h1>
        <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>
          {vi
            ? "Theo dõi dư nợ, lãi suất và tiền trả hàng tháng của từng khoản."
            : "Track outstanding balances, interest rates, and monthly payments for each loan."}
        </p>
      </div>

      {/* Card 1: Khoản nợ */}
      <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "18px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>
              {vi ? "Khoản nợ" : "Loans"}
            </h2>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#536779" }}>
              {vi ? "Vay mua nhà, xe, tiêu dùng; có thể khai chi tiết lãi suất và kỳ hạn." : "Home, auto, or personal loans with interest rate and term details."}
            </p>
          </div>
          <span
            style={{
              padding: "3px 9px",
              borderRadius: "99px",
              background: debtEntries.length > 0 ? "#e6f8f0" : "#edf2f8",
              color: debtEntries.length > 0 ? "#1e7e55" : "#536779",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            {debtEntries.length > 0 ? `${debtEntries.length} mục` : vi ? "Không có" : "None"}
          </span>
        </header>

        {debtEntries.length === 0 ? (
          <div
            style={{
              padding: "20px",
              borderRadius: "12px",
              border: "1px dashed #cbdced",
              background: "#f9fbff",
              textAlign: "center",
              marginBottom: "14px",
            }}
          >
            <strong style={{ display: "block", fontSize: "14px", color: "#052659", marginBottom: "4px" }}>
              {vi ? "Chưa có khoản nào" : "No loans declared"}
            </strong>
            <span style={{ fontSize: "12.5px", color: "#536779" }}>
              {vi ? "Thêm từng khoản bạn biết; có thể bổ sung sau." : "Add any loans you have; you can update them anytime."}
            </span>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px", marginBottom: "14px" }}>
            {debtEntries.map(loan => {
              const bal = loan.outstandingBalance.status === "KNOWN" ? parseFloat(loan.outstandingBalance.value) : 0;
              const pay = loan.payment.status === "KNOWN" ? parseFloat(loan.payment.value) : 0;
              return (
                <div
                  key={loan.id}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: "1px solid #e1ebf5",
                    background: "#f9fbff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", fontSize: "14px", color: "#052659" }}>{loan.label}</strong>
                    <span style={{ fontSize: "12px", color: "#536779" }}>
                      Trả tháng: {formatFullMoney(pay)} · Lãi {getLoanInterestRate(loan)}%/năm
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <strong style={{ fontSize: "14.5px", color: "#052659" }}>{formatFullMoney(bal)}</strong>
                    <button
                      type="button"
                      onClick={() => openLoan(loan)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "8px",
                        border: "1px solid #cddfee",
                        background: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#052659",
                        cursor: "pointer",
                      }}
                    >
                      Sửa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "10px",
            borderTop: "1px solid #edf2f8",
            marginBottom: "14px",
            fontSize: "13px",
          }}
        >
          <span style={{ color: "#536779" }}>{vi ? "Tổng khoản nợ" : "Total debt"}</span>
          <strong style={{ color: "#052659" }}>{formatFullMoney(totalDebtBalance)}</strong>
        </div>

        <button
          type="button"
          onClick={() => openLoan(null)}
          style={{
            padding: "9px 16px",
            borderRadius: "10px",
            border: 0,
            background: "#052659",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ＋ {vi ? "Thêm khoản nợ" : "Add loan"}
        </button>
      </section>

      {/* Card 2: Ảnh hưởng tới kế hoạch */}
      <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "18px" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>
          {vi ? "Ảnh hưởng tới kế hoạch" : "Impact on your plan"}
        </h2>
        <div style={{ display: "grid", gap: "8px", fontSize: "13.5px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #f0f5fa" }}>
            <span style={{ color: "#536779" }}>Tổng dư nợ còn lại</span>
            <strong style={{ color: "#052659" }}>{formatFullMoney(totalDebtBalance)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #f0f5fa" }}>
            <span style={{ color: "#536779" }}>Tổng trả nợ mỗi tháng</span>
            <strong style={{ color: "#052659" }}>{formatFullMoney(totalMonthlyPayment)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #f0f5fa" }}>
            <span style={{ color: "#536779" }}>Ước tính lãi tháng đầu</span>
            <strong style={{ color: "#052659" }}>{formatFullMoney(firstMonthInterest)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#536779" }}>Tỷ lệ trả nợ / thu nhập</span>
            <strong style={{ color: "#052659" }}>
              {dtiPercent}% ({dtiPercent <= 35 ? "An toàn" : "Cần lưu ý"})
            </strong>
          </div>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: "12px", color: "#64748b" }}>
          Khoản trả nợ hàng tháng tự động giảm số tiền có thể góp vào quỹ nghỉ hưu cho đến tháng đáo hạn của từng khoản vay.
        </p>
      </section>

      {/* Card 3: Xem tiền gốc và tiền lãi */}
      <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "22px" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>
          {vi ? "Xem tiền gốc và tiền lãi" : "Principal and interest breakdown"}
        </h2>
        {debtEntries.length === 0 ? (
          <div style={{ padding: "16px 18px", borderRadius: "12px", border: "1px solid #e1ebf5", background: "#f9fbff" }}>
            <strong style={{ display: "block", fontSize: "14px", color: "#052659", marginBottom: "4px" }}>
              {vi ? "Chưa có khoản vay" : "No active loans"}
            </strong>
            <span style={{ fontSize: "13px", color: "#536779" }}>
              {vi
                ? "Khai khoản vay trong hồ sơ để xem tiền gốc, tiền lãi và tháng dự kiến trả xong."
                : "Add a loan in your profile to inspect principal, interest, and projected payoff month."}
            </span>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "13px", color: "#536779" }}>
            Đang theo dõi {debtEntries.length} khoản vay trong dòng tiền kế hoạch.
          </p>
        )}
      </section>

      <Link
        to="/user/profile"
        style={{
          display: "inline-block",
          padding: "9px 16px",
          borderRadius: "10px",
          border: "1px solid #cddfee",
          background: "#fff",
          color: "#052659",
          fontSize: "13px",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        ← {vi ? "Quay lại Tài chính của bạn" : "Back to Your finances"}
      </Link>

      {showAddLoanModal && v2Profile && (
        <DebtLoanDialog
          loan={editingLoan}
          valuationDate={v2Profile.valuationDate}
          onClose={() => setShowAddLoanModal(false)}
          onSave={async loan => {
            const entries = editingLoan
              ? debtEntries.map(entry => (entry.id === loan.id ? loan : entry))
              : [...debtEntries, loan];
            const ok = await updateProfileV2({ debts: { status: "KNOWN", entries } });
            if (ok) {
              notify.success(vi ? "Đã lưu khoản vay" : "Loan saved", loan.label);
              setShowAddLoanModal(false);
            }
            return ok;
          }}
        />
      )}
    </div>
  );
}
