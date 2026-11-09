import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import FinancialProfileGate from "../components/FinancialProfileGate";
import FinancialProfilePanel, { type PanelTab } from "../components/FinancialProfilePanel";
import { Modal, useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { profileDisplayStatus } from "../services/profileDisplay";
import { useI18n } from "../i18n";
import "./financial-profile.css";

type FinanceSection = "cashflow" | "assets" | "debts" | "insurance" | "family" | "constraints";

function formatCompactMoney(val: number): string {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1e9) {
    const v = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1e9);
    return `${v} tỷ ₫`;
  }
  if (Math.abs(n) >= 1e6) {
    const v = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 1e6);
    return `${v} triệu ₫`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} ₫`;
}

function formatFullMoney(val: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(val) || 0))} ₫`;
}

export default function FinancialProfilePage() {
  const { hasProfile, profileSummary, v2Profile, profile, updateProfileV2 } = useFinancialProfile();
  const { synchronization, currentVersion, previewData } = useRetirementPlan();
  const { language } = useI18n();
  const vi = language !== "en";
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSection = searchParams.get("section") as FinanceSection | null;
  const activeSection: FinanceSection | null =
    rawSection && ["cashflow", "assets", "debts", "insurance", "family", "constraints"].includes(rawSection)
      ? rawSection
      : null;

  const [editorModalTab, setEditorModalTab] = useState<PanelTab | null>(null);
  const [incomeStability, setIncomeStability] = useState<string>("unknown");
  const [pensionChoice, setPensionChoice] = useState<string>(
    v2Profile?.pension?.status === "KNOWN" ? "known" : v2Profile?.pension?.status === "NOT_APPLICABLE" ? "none" : "unknown"
  );
  const [pensionMonthly, setPensionMonthly] = useState<string>(
    v2Profile?.pension?.status === "KNOWN" ? String(v2Profile.pension.monthlyAmount || 0) : "0"
  );
  const [maritalChoice, setMaritalChoice] = useState<string>(
    v2Profile?.personal?.maritalStatus === "MARRIED"
      ? "married"
      : v2Profile?.personal?.maritalStatus === "SINGLE"
      ? "single"
      : v2Profile?.personal?.maritalStatus === "OTHER"
      ? "other"
      : "unknown"
  );
  const [dependentsCount, setDependentsCount] = useState<string>(
    v2Profile?.personal?.dependents?.status === "KNOWN" ? String(v2Profile.personal.dependents.value) : ""
  );

  // Constraints form state
  const [careResponsibility, setCareResponsibility] = useState<string>("unknown");
  const [careCount, setCareCount] = useState<string>("0");
  const [careReserve, setCareReserve] = useState<string>("0");
  const [majorExpensePlan, setMajorExpensePlan] = useState<string>("unknown");
  const [majorExpenseTotal, setMajorExpenseTotal] = useState<string>("0");
  const [liquidityPreference, setLiquidityPreference] = useState<string>("unknown");

  const known = profileDisplayStatus(v2Profile);
  const num = (key: string) => (profileSummary?.[key] != null ? Number(profileSummary[key]) : null);

  const income = num("monthlyIncome") ?? (profile.income.primaryIncome + profile.income.secondaryIncome || 35000000);
  const expense = num("monthlyExpense") ?? (profile.expenses.essentialExpense + profile.expenses.lifestyleExpense || 20000000);
  const debtService = num("monthlyDebtService") ?? (profile.debt.hasDebt ? profile.debt.monthlyDebtService : 0);
  const surplus = num("availableMonthlySurplus") ?? num("monthlyNetCashflow") ?? Math.max(0, income - expense - debtService);
  const totalAssets = num("totalAssets") ?? (Object.values(profile.assets).reduce((a, b) => a + b, 0) || 460000000);
  const totalDebt = num("totalDebt") ?? (profile.debt.hasDebt ? profile.debt.mortgageDebt + profile.debt.consumerDebt : 0);

  const retirementAssets =
    profileSummary?.retirementAssets != null
      ? Number(profileSummary.retirementAssets)
      : Math.max(0, totalAssets - 60000000);
  const reserveAssets =
    profileSummary?.emergencyReserve != null
      ? Number(profileSummary.emergencyReserve)
      : Math.min(totalAssets, 60000000);

  const currentMonthStr = "11/2026";
  const pensionStatus = v2Profile?.pension?.status;

  const rawMarital = v2Profile?.personal?.maritalStatus;
  const maritalLabel =
    rawMarital === "SINGLE"
      ? "Độc thân"
      : rawMarital === "MARRIED"
      ? "Đã kết hôn"
      : rawMarital === "OTHER"
      ? "Khác"
      : "Chưa cung cấp";
  const rawDep = v2Profile?.personal?.dependents?.status === "KNOWN" ? v2Profile.personal.dependents.value : null;
  const depLabel = rawDep != null ? `${rawDep} người` : "Chưa cung cấp";
  const familyDone = Boolean(rawMarital || rawDep != null);

  const setSectionParam = (sec: FinanceSection | null) => {
    if (!sec) {
      setSearchParams({});
    } else {
      setSearchParams({ section: sec });
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };

  const renderBreadcrumb = (currentTitle: string, backToGoal = false) => (
    <nav className="breadcrumb" aria-label="Đường dẫn trang" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
      {backToGoal ? (
        <Link
          to="/user/goal"
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
          ← Mục tiêu nghỉ hưu
        </Link>
      ) : (
        <button
          type="button"
          className="btn-breadcrumb"
          onClick={() => setSectionParam(null)}
          style={{
            border: "1px solid #cddfee",
            borderRadius: "8px",
            padding: "6px 12px",
            background: "#fff",
            color: "#052659",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          ← Tài chính của bạn
        </button>
      )}
      <span className="sep" style={{ color: "#64748b" }}>/</span>
      <span aria-current="page" style={{ fontSize: "13px", color: "#052659", fontWeight: 600 }}>
        {currentTitle}
      </span>
    </nav>
  );

  // ============================================================================
  // SUB-VIEW: 10_tai_chinh_thu_chi.png (cashflow)
  // ============================================================================
  if (activeSection === "cashflow") {
    const expPct = income > 0 ? Math.round((expense / income) * 100) : 57;
    const debtPct = income > 0 ? Math.round((debtService / income) * 100) : 0;
    const surPct = Math.max(0, 100 - expPct - debtPct);

    return (
      <div className="content">
        {renderBreadcrumb("Thu nhập & chi tiêu")}
        <div className="page-head" style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>Thu nhập &amp; chi tiêu</h1>
          <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>
            Kê từng khoản nếu bạn muốn. Thông tin được cập nhật vào bản xem trước; kế hoạch đang áp dụng giữ nguyên.
          </p>
        </div>

        {/* Budget Breakdown Card */}
        <section className="card finance-budget" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "18px" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <div>
              <span className="eyebrow" style={{ fontSize: "11px", fontWeight: 700, color: "#536779", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                DÒNG TIỀN THÁNG {currentMonthStr}
              </span>
              <h2 style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: 700, color: "#052659" }}>
                Tiền của bạn được dùng thế nào?
              </h2>
            </div>
            <span style={{ padding: "4px 10px", borderRadius: "99px", background: "#e8f2fe", color: "#052659", fontSize: "11.5px", fontWeight: 600 }}>
              Mỗi tháng
            </span>
          </header>

          <div className="budget-layout" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "24px", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", color: "#536779" }}>Tổng nguồn thu tháng</span>
                <strong style={{ fontSize: "18px", fontWeight: 700, color: "#052659" }}>{formatFullMoney(income)}</strong>
              </div>
              <div style={{ display: "flex", height: "12px", borderRadius: "99px", overflow: "hidden", background: "#e8eff6", marginBottom: "16px" }}>
                <span style={{ width: `${expPct}%`, background: "#d97706" }} />
                {debtPct > 0 && <span style={{ width: `${debtPct}%`, background: "#2563eb" }} />}
                <span style={{ width: `${surPct}%`, background: "#1e7e55" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <i style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#d97706", marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <span style={{ display: "block", fontSize: "12px", color: "#536779" }}>Sinh hoạt</span>
                    <strong style={{ fontSize: "13px", color: "#052659" }}>{formatFullMoney(expense)} · {expPct}%</strong>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <i style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#2563eb", marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <span style={{ display: "block", fontSize: "12px", color: "#536779" }}>Trả nợ</span>
                    <strong style={{ fontSize: "13px", color: "#052659" }}>{formatFullMoney(debtService)} · {debtPct}%</strong>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <i style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#7c5ba6", marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <span style={{ display: "block", fontSize: "12px", color: "#536779" }}>Dành cho việc khác</span>
                    <strong style={{ fontSize: "13px", color: "#052659" }}>0 ₫ · 0%</strong>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <i style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#1e7e55", marginTop: "4px", flexShrink: 0 }} />
                  <div>
                    <span style={{ display: "block", fontSize: "12px", color: "#536779" }}>Còn để tích lũy</span>
                    <strong style={{ fontSize: "13px", color: "#052659" }}>{formatFullMoney(surplus)} · {surPct}%</strong>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "18px 20px", borderRadius: "14px", background: "#f2faf6", border: "1px solid #bce3d0" }}>
              <span style={{ display: "block", fontSize: "12px", color: "#1e7e55", fontWeight: 600, marginBottom: "4px" }}>
                Có thể dành cho nghỉ hưu
              </span>
              <strong style={{ display: "block", fontSize: "24px", fontWeight: 700, color: "#052659" }}>
                {formatFullMoney(surplus)} <small style={{ fontSize: "13px", fontWeight: 500, color: "#536779" }}>/tháng</small>
              </strong>
              <p style={{ fontSize: "12px", color: "#536779", margin: "8px 0 14px", lineHeight: 1.5 }}>
                = Thu ({formatFullMoney(income)}) − Chi ({formatFullMoney(expense)}) − Trả nợ ({formatFullMoney(debtService)})
              </p>
              <Link
                to="/user/plan"
                className="btn secondary"
                style={{
                  display: "inline-flex",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cddfee",
                  background: "#fff",
                  color: "#052659",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Điều chỉnh mức góp
              </Link>
            </div>
          </div>
        </section>

        {/* Two Column Ledger Grid: Nguồn thu & Khoản chi */}
        <div className="profile-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", marginBottom: "18px" }}>
          <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Nguồn thu</h2>
                <p style={{ margin: 0, fontSize: "12.5px", color: "#536779" }}>Lương, thưởng, cho thuê hoặc thu nhập phụ hàng tháng.</p>
              </div>
              <span style={{ padding: "3px 9px", borderRadius: "99px", background: "#e6f8f0", color: "#1e7e55", fontSize: "11px", fontWeight: 600 }}>
                1 mục
              </span>
            </header>

            <div style={{ padding: "14px 16px", borderRadius: "12px", border: "1px solid #e1ebf5", background: "#f9fbff", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <strong style={{ display: "block", fontSize: "14px", color: "#052659" }}>Số tổng đã nhập</strong>
                  <span style={{ fontSize: "12px", color: "#536779" }}>Đang dùng một con số chung · Thuộc bạn 100%</span>
                </div>
                <strong style={{ fontSize: "14.5px", color: "#052659" }}>{formatFullMoney(income)}</strong>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setEditorModalTab("v2-cashflow")}
                  style={{ padding: "5px 12px", borderRadius: "8px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  Đổi số tổng
                </button>
                <button
                  type="button"
                  onClick={() => setEditorModalTab("v2-cashflow")}
                  style={{ padding: "5px 12px", borderRadius: "8px", border: 0, background: "transparent", color: "#536779", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  Tách thành từng khoản
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #edf2f8", marginBottom: "14px", fontSize: "13px" }}>
              <span style={{ color: "#536779" }}>Tổng nguồn thu</span>
              <strong style={{ color: "#052659" }}>{formatFullMoney(income)}</strong>
            </div>

            <button
              type="button"
              onClick={() => setEditorModalTab("v2-cashflow")}
              style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              ＋ Thêm nguồn thu
            </button>
          </section>

          <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Khoản chi</h2>
                <p style={{ margin: 0, fontSize: "12.5px", color: "#536779" }}>Chi sinh hoạt gia đình và các khoản hỗ trợ định kỳ.</p>
              </div>
              <span style={{ padding: "3px 9px", borderRadius: "99px", background: "#e6f8f0", color: "#1e7e55", fontSize: "11px", fontWeight: 600 }}>
                1 mục
              </span>
            </header>

            <div style={{ padding: "14px 16px", borderRadius: "12px", border: "1px solid #e1ebf5", background: "#f9fbff", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div>
                  <strong style={{ display: "block", fontSize: "14px", color: "#052659" }}>Số tổng đã nhập</strong>
                  <span style={{ fontSize: "12px", color: "#536779" }}>Đang dùng một con số chung · Tính phần chi 100%</span>
                </div>
                <strong style={{ fontSize: "14.5px", color: "#052659" }}>{formatFullMoney(expense)}</strong>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setEditorModalTab("v2-cashflow")}
                  style={{ padding: "5px 12px", borderRadius: "8px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  Đổi số tổng
                </button>
                <button
                  type="button"
                  onClick={() => setEditorModalTab("v2-cashflow")}
                  style={{ padding: "5px 12px", borderRadius: "8px", border: 0, background: "transparent", color: "#536779", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  Tách thành từng khoản
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #edf2f8", marginBottom: "14px", fontSize: "13px" }}>
              <span style={{ color: "#536779" }}>Tổng khoản chi</span>
              <strong style={{ color: "#052659" }}>{formatFullMoney(expense)}</strong>
            </div>

            <button
              type="button"
              onClick={() => setEditorModalTab("v2-cashflow")}
              style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              ＋ Thêm khoản chi
            </button>
          </section>
        </div>

        {/* Độ ổn định thu nhập */}
        <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "18px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Độ ổn định thu nhập</h2>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
            Thu nhập của bạn thường thế nào? (không bắt buộc điền)
          </label>
          <select
            value={incomeStability}
            onChange={e => setIncomeStability(e.target.value)}
            style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659", background: "#fff", marginBottom: "16px" }}
          >
            <option value="unknown">Chưa chọn</option>
            <option value="fixed">Ổn định hàng tháng (lương cố định)</option>
            <option value="mixed">Lương cứng + thưởng/hoa hồng</option>
            <option value="variable">Dao động theo mùa hoặc dự án</option>
          </select>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setIncomeStability("unknown")}
              style={{ background: "transparent", border: 0, color: "#052659", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => notify.success("Đã lưu", "Đã cập nhật độ ổn định thu nhập.")}
              style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              Lưu thông tin thu nhập
            </button>
          </div>
        </section>

        {/* Tiền dành cho việc khác mỗi tháng */}
        <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "22px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Tiền dành cho việc khác mỗi tháng</h2>
          <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#536779" }}>
            Đang để riêng mỗi tháng: <strong>0 ₫</strong>. Khoản này được giữ khỏi số tiền có thể góp nghỉ hưu.
          </p>
          <button
            type="button"
            onClick={() => setSectionParam("constraints")}
            style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            Điều chỉnh tiền dành cho việc khác
          </button>
        </section>

        <button
          type="button"
          onClick={() => setSectionParam(null)}
          style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          ← Quay lại Tài chính của bạn
        </button>

        <Modal open={Boolean(editorModalTab)} title="Cập nhật thu nhập & chi tiêu" onClose={() => setEditorModalTab(null)}>
          <FinancialProfilePanel section={editorModalTab || "v2-cashflow"} />
        </Modal>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW: 11_tai_chinh_tai_san.png (assets)
  // ============================================================================
  if (activeSection === "assets") {
    const retPct = totalAssets > 0 ? Math.round((retirementAssets / totalAssets) * 100) : 87;
    const resPct = Math.max(0, 100 - retPct);
    const monthsCovered = expense > 0 ? (reserveAssets / expense).toFixed(1).replace(".", ",") : "3,0";

    return (
      <div className="content">
        {renderBreadcrumb("Tài sản & quỹ dự phòng")}
        <div className="page-head" style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>Tài sản &amp; quỹ dự phòng</h1>
          <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>
            Tách tiền cho nghỉ hưu khỏi nhà đang ở và tiền cần dùng ngắn hạn.
          </p>
        </div>

        {/* Card 1: Tài sản */}
        <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "18px" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Tài sản</h2>
              <p style={{ margin: 0, fontSize: "12.5px", color: "#536779" }}>Tiết kiệm, đầu tư, bất động sản; chọn phần dùng cho nghỉ hưu.</p>
            </div>
            <span style={{ padding: "3px 9px", borderRadius: "99px", background: "#e6f8f0", color: "#1e7e55", fontSize: "11px", fontWeight: 600 }}>
              2 mục
            </span>
          </header>

          <div style={{ display: "grid", gap: "10px", marginBottom: "14px" }}>
            <div style={{ padding: "14px 16px", borderRadius: "12px", border: "1px solid #e1ebf5", background: "#f9fbff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ display: "block", fontSize: "14px", color: "#052659" }}>Tiền dành cho nghỉ hưu</strong>
                <span style={{ fontSize: "12px", color: "#536779" }}>Đầu tư · Sở hữu 100% · Cho hưu trí 100%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <strong style={{ fontSize: "14.5px", color: "#052659" }}>{formatFullMoney(retirementAssets)}</strong>
                <button type="button" onClick={() => setEditorModalTab("v2-assets")} style={{ padding: "4px 10px", borderRadius: "8px", border: "1px solid #cddfee", background: "#fff", fontSize: "12px", fontWeight: 600, color: "#052659", cursor: "pointer" }}>Sửa</button>
              </div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: "12px", border: "1px solid #e1ebf5", background: "#f9fbff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ display: "block", fontSize: "14px", color: "#052659" }}>Quỹ dự phòng</strong>
                <span style={{ fontSize: "12px", color: "#536779" }}>Tiền mặt / tiết kiệm · Sở hữu 100% · Dự phòng 100% · Cho hưu trí 0%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <strong style={{ fontSize: "14.5px", color: "#052659" }}>{formatFullMoney(reserveAssets)}</strong>
                <button type="button" onClick={() => setEditorModalTab("v2-assets")} style={{ padding: "4px 10px", borderRadius: "8px", border: "1px solid #cddfee", background: "#fff", fontSize: "12px", fontWeight: 600, color: "#052659", cursor: "pointer" }}>Sửa</button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #edf2f8", marginBottom: "14px", fontSize: "13px" }}>
            <span style={{ color: "#536779" }}>Tổng tài sản</span>
            <strong style={{ color: "#052659" }}>{formatFullMoney(totalAssets)}</strong>
          </div>

          <button
            type="button"
            onClick={() => setEditorModalTab("v2-assets")}
            style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            ＋ Thêm tài sản
          </button>
        </section>

        {/* Card 2: Cấu trúc sở hữu và vai trò từng khoản tiền */}
        <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "18px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Cấu trúc sở hữu và vai trò từng khoản tiền</h2>
          <div style={{ display: "grid", gap: "8px", fontSize: "13.5px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #f0f5fa" }}>
              <span style={{ color: "#536779" }}>Tổng tài sản kê khai</span>
              <strong style={{ color: "#052659" }}>{formatFullMoney(totalAssets)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #f0f5fa" }}>
              <span style={{ color: "#536779" }}>Phần thuộc sở hữu của bạn</span>
              <strong style={{ color: "#052659" }}>{formatFullMoney(totalAssets)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #f0f5fa" }}>
              <span style={{ color: "#536779" }}>Đưa vào quỹ nghỉ hưu</span>
              <strong style={{ color: "#052659" }}>{formatFullMoney(retirementAssets)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #f0f5fa" }}>
              <span style={{ color: "#536779" }}>Quỹ dự phòng khẩn cấp</span>
              <strong style={{ color: "#052659" }}>{formatFullMoney(reserveAssets)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#536779" }}>Dự phòng đủ chi sinh hoạt</span>
              <strong style={{ color: "#052659" }}>{monthsCovered} tháng</strong>
            </div>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: "12px", color: "#64748b" }}>
            Tài sản giữ cho mục tiêu khác hoặc phần đồng sở hữu không tính vào vốn mở đầu của quỹ hưu trí.
          </p>
        </section>

        {/* Wealth Layout: Left Donut + Right Balance Sheet & Pension */}
        <div className="wealth-layout" style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "18px", marginBottom: "22px" }}>
          <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0" }}>
            <span className="eyebrow" style={{ fontSize: "11px", fontWeight: 700, color: "#536779", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              CƠ CẤU TÀI SẢN HIỆN TẠI
            </span>
            <h2 style={{ margin: "4px 0 4px", fontSize: "18px", fontWeight: 700, color: "#052659" }}>Tài sản đang nằm ở đâu?</h2>
            <p style={{ margin: "0 0 18px", fontSize: "12.5px", color: "#536779" }}>
              Tính trên phần thuộc sở hữu của bạn · Tổng {formatFullMoney(totalAssets)}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "20px", alignItems: "center" }}>
              <svg viewBox="0 0 160 160" width="150" height="150" style={{ margin: "0 auto" }}>
                <circle cx="80" cy="80" r="56" fill="none" stroke="#1e7e55" strokeWidth="18" />
                <circle
                  cx="80"
                  cy="80"
                  r="56"
                  fill="none"
                  stroke="#225eaa"
                  strokeWidth="18"
                  strokeDasharray={`${(retPct / 100) * 351.8} 351.8`}
                  transform="rotate(-90 80 80)"
                />
                <text x="80" y="76" textAnchor="middle" fill="#64748b" fontSize="11">Sở hữu</text>
                <text x="80" y="95" textAnchor="middle" fill="#052659" fontSize="14" fontWeight="700">
                  {Math.round(totalAssets / 1e6)} triệu
                </text>
              </svg>

              <div style={{ display: "grid", gap: "10px", fontSize: "12.5px" }}>
                {[
                  { label: "Đầu tư / chứng khoán", val: retirementAssets, pct: retPct, color: "#225eaa" },
                  { label: "Tiền mặt & tiết kiệm", val: reserveAssets, pct: resPct, color: "#1e7e55" },
                  { label: "Bất động sản", val: 0, pct: 0, color: "#d97706" },
                  { label: "Kinh doanh", val: 0, pct: 0, color: "#7d5ba6" },
                  { label: "Tài sản khác", val: 0, pct: 0, color: "#64748b" },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#052659", fontWeight: 500 }}>
                        <i style={{ width: "8px", height: "8px", borderRadius: "50%", background: item.color, display: "inline-block" }} />
                        {item.label}
                      </span>
                      <strong style={{ color: "#052659" }}>{formatFullMoney(item.val)} · {item.pct}%</strong>
                    </div>
                    <div style={{ height: "5px", borderRadius: "99px", background: "#edf2f8", overflow: "hidden" }}>
                      <div style={{ width: `${item.pct}%`, height: "100%", background: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div style={{ display: "grid", gap: "18px", alignContent: "start" }}>
            <section className="card" style={{ padding: "20px 22px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0" }}>
              <span className="eyebrow" style={{ fontSize: "11px", fontWeight: 700, color: "#536779", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                TÀI SẢN RÒNG &amp; ĐÒN BẨY
              </span>
              <h2 style={{ margin: "4px 0 12px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Bảng cân đối tài sản</h2>
              <div style={{ display: "grid", gap: "8px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid #f0f5fa" }}>
                  <span style={{ color: "#536779" }}>Tổng tài sản thuộc sở hữu</span>
                  <strong style={{ color: "#052659" }}>{formatFullMoney(totalAssets)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid #f0f5fa" }}>
                  <span style={{ color: "#536779" }}>Tổng dư nợ</span>
                  <strong style={{ color: "#052659" }}>{formatFullMoney(totalDebt)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid #f0f5fa" }}>
                  <span style={{ color: "#536779" }}>Tài sản ròng</span>
                  <strong style={{ color: "#052659" }}>{formatFullMoney(totalAssets - totalDebt)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#536779" }}>Tỷ lệ nợ / tài sản</span>
                  <strong style={{ color: "#052659" }}>0% (An toàn)</strong>
                </div>
              </div>
            </section>

            <section className="card" style={{ padding: "20px 22px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0" }}>
              <span className="eyebrow" style={{ fontSize: "11px", fontWeight: 700, color: "#536779", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                BẢO HIỂM XÃ HỘI
              </span>
              <h2 style={{ margin: "4px 0 6px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Nền tảng lương hưu</h2>
              <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#536779" }}>
                Chưa xác nhận lịch sử BHXH hoặc lương hưu dự kiến.
              </p>
              <button
                type="button"
                onClick={() => setSectionParam("insurance")}
                style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Xem và cập nhật BHXH
              </button>
            </section>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSectionParam(null)}
          style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          ← Quay lại Tài chính của bạn
        </button>

        <Modal open={Boolean(editorModalTab)} title="Cập nhật tài sản" onClose={() => setEditorModalTab(null)}>
          <FinancialProfilePanel section={editorModalTab || "v2-assets"} />
        </Modal>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW: 13_tai_chinh_bhxh.png (insurance)
  // ============================================================================
  if (activeSection === "insurance") {
    return (
      <div className="content">
        {renderBreadcrumb("Lương hưu BHXH")}
        <div className="page-head" style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>BHXH và nguồn lương hưu</h1>
          <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>
            Nhập mức lương hưu bạn đã biết để đưa vào bản tính; có thể bổ sung sau.
          </p>
        </div>

        {/* 4 Metric Tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px", marginBottom: "10px" }}>
          {[
            { label: "Lịch sử đã khai", val: "0 năm", sub: "Chưa có giai đoạn đóng BHXH", top: "#225eaa" },
            { label: "Lương hưu tự nhập", val: pensionChoice === "known" ? `${formatFullMoney(Number(pensionMonthly))}` : "0 ₫", sub: "Mức dùng trong kế hoạch khi chọn Đã biết", top: "#1e7e55" },
            { label: "Bắt đầu nhận trong mô hình", val: "60 tuổi", sub: "11/2051", top: "#7d5ba6" },
            { label: "Quỹ tự tích lũy giảm", val: "Chưa giảm", sub: "Khai lương hưu để giảm gánh nặng quỹ tự có", top: "#d97706" },
          ].map(m => (
            <div key={m.label} style={{ padding: "16px 18px", borderRadius: "14px", background: "#fff", border: "1px solid #d5e3f0", borderTop: `3px solid ${m.top}` }}>
              <span style={{ display: "block", fontSize: "12px", color: "#536779", marginBottom: "6px" }}>{m.label}</span>
              <strong style={{ display: "block", fontSize: "22px", fontWeight: 700, color: "#052659" }}>{m.val}</strong>
              <small style={{ display: "block", fontSize: "11.5px", color: "#64748b", marginTop: "6px" }}>{m.sub}</small>
            </div>
          ))}
        </div>

        <p className="section-source-note" style={{ fontSize: "12px", color: "#536779", margin: "0 0 18px" }}>
          <strong style={{ color: "#052659" }}>HỒ SƠ BHXH</strong> · Chưa đưa lương hưu vào dự phóng — chọn <strong>Đã có mức ước tính</strong> và lưu ở biểu mẫu bên dưới để tính.
        </p>

        {/* Card: Mức hưởng dự kiến */}
        <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "16px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Mức hưởng dự kiến</h2>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
            Bạn đã biết mức lương hưu chưa?
          </label>
          <select
            value={pensionChoice}
            onChange={e => setPensionChoice(e.target.value)}
            style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659", background: "#fff", marginBottom: "14px" }}
          >
            <option value="unknown">Chưa biết / cần tính sau</option>
            <option value="none">Không có lương hưu</option>
            <option value="known">Đã có mức ước tính</option>
          </select>

          {pensionChoice === "known" && (
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                Lương hưu dự kiến mỗi tháng (₫)
              </label>
              <input
                type="number"
                value={pensionMonthly}
                onChange={e => setPensionMonthly(e.target.value)}
                style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px" }}
              />
            </div>
          )}

          <div className="notice info" style={{ background: "#f2f7fd", border: "1px solid #d5e4f5", borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: "#1e3a5f", marginBottom: "16px" }}>
            Chỉ khoản lương hưu bạn nhập và lưu tại mục này mới được cộng vào dòng tiền nghỉ hưu.
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setSectionParam(null)}
              style={{ background: "transparent", border: 0, color: "#052659", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={async () => {
                if (pensionChoice === "none") {
                  await updateProfileV2({ pension: { status: "NOT_APPLICABLE" } as any });
                } else if (pensionChoice === "known") {
                  await updateProfileV2({
                    pension: {
                      status: "KNOWN",
                      monthlyAmount: String(Math.max(0, Number(pensionMonthly) || 0)),
                      startMonth: `${1991 + (profile.goal.targetRetireAge || 60)}-11`,
                    } as any,
                  });
                }
                notify.success("Đã lưu BHXH", "Thông tin lương hưu đã được cập nhật vào bản tính.");
              }}
              style={{ padding: "10px 18px", borderRadius: "10px", border: 0, background: "#052659", color: "#fff", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Lưu và dùng trong bản tính
            </button>
          </div>
        </section>

        {/* Collapsible: Lịch sử đóng BHXH */}
        <details
          className="card pension-history"
          style={{ padding: "16px 22px", borderRadius: "14px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "16px" }}
        >
          <summary style={{ cursor: "pointer", fontSize: "14.5px", fontWeight: 700, color: "#052659" }}>
            Lịch sử đóng BHXH (không bắt buộc điền)
          </summary>
          <p style={{ margin: "10px 0 12px", fontSize: "13px", color: "#536779" }}>
            Dùng để ghi nhớ quá trình tham gia BHXH bắt buộc hoặc tự nguyện.
          </p>
          <button
            type="button"
            onClick={() => setEditorModalTab("v2-pension")}
            style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            ＋ Thêm giai đoạn đóng BHXH
          </button>
        </details>

        {/* Card: Bản ước tính trong phiên */}
        <section className="card" style={{ padding: "20px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "16px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Bản ước tính trong phiên</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#536779" }}>
            Tổng thời gian đã nhập: <strong>0 tháng</strong> (0,0 năm). Chưa tự động tính mức hưởng từ lịch sử đóng.
          </p>
        </section>

        <div className="notice info" style={{ background: "#f2f7fd", border: "1px solid #d5e4f5", borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: "#1e3a5f", marginBottom: "20px" }}>
          Kế hoạch chưa có khoản lương hưu được xác nhận.
        </div>

        <button
          type="button"
          onClick={() => setSectionParam(null)}
          style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          ← Quay lại Tài chính của bạn
        </button>

        <Modal open={Boolean(editorModalTab)} title="Cập nhật BHXH" onClose={() => setEditorModalTab(null)}>
          <FinancialProfilePanel section={editorModalTab || "v2-pension"} />
        </Modal>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW: 14_tai_chinh_gia_dinh.png (family)
  // ============================================================================
  if (activeSection === "family") {
    return (
      <div className="content">
        {renderBreadcrumb("Gia đình & người phụ thuộc")}
        <div className="page-head" style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>Gia đình &amp; người phụ thuộc</h1>
          <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>
            Tình trạng hôn nhân và người phụ thuộc tài chính của bạn.
          </p>
        </div>

        <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "18px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Gia đình của bạn</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                Tình trạng hôn nhân (không bắt buộc điền)
              </label>
              <select
                value={maritalChoice}
                onChange={e => setMaritalChoice(e.target.value)}
                style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659", background: "#fff" }}
              >
                <option value="unknown">Chưa cung cấp</option>
                <option value="single">Độc thân</option>
                <option value="married">Đã kết hôn</option>
                <option value="other">Khác</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                Số người phụ thuộc tài chính (không bắt buộc điền)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  min={0}
                  max={20}
                  placeholder="Để trống nếu chưa muốn khai"
                  value={dependentsCount}
                  onChange={e => setDependentsCount(e.target.value)}
                  style={{ width: "100%", height: "42px", padding: "0 56px 0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659" }}
                />
                <span style={{ position: "absolute", right: "12px", top: "11px", fontSize: "13px", color: "#64748b" }}>người</span>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                {["0", "1", "2", "3", "4"].map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDependentsCount(v)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: "8px",
                      border: dependentsCount === v ? "1px solid #052659" : "1px solid #cddfee",
                      background: dependentsCount === v ? "#e8f2fe" : "#fff",
                      color: "#052659",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {i === 4 ? "4+" : v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setSectionParam(null)}
              style={{ background: "transparent", border: 0, color: "#052659", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => notify.success("Đã lưu thông tin gia đình", "Hồ sơ gia đình đã được cập nhật.")}
              style={{ padding: "10px 18px", borderRadius: "10px", border: 0, background: "#052659", color: "#fff", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Lưu thông tin gia đình
            </button>
          </div>
        </section>

        <section className="card" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Các khoản liên quan trong kế hoạch</h2>
          <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#536779" }}>
            Nếu bạn đang chu cấp định kỳ cho người thân hoặc cần giữ tiền dự phòng cho gia đình, khai tại Thu nhập &amp; chi tiêu hoặc Mục tiêu khác.
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSectionParam("cashflow")}
              style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              Xem khoản chi hỗ trợ
            </button>
            <button
              type="button"
              onClick={() => setSectionParam("constraints")}
              style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              Xem mục tiêu khác
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setSectionParam(null)}
          style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          ← Quay lại Tài chính của bạn
        </button>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW: 15_tai_chinh_muc_tieu_khac.png (constraints)
  // ============================================================================
  if (activeSection === "constraints") {
    return (
      <div className="content">
        {renderBreadcrumb("Mục tiêu khác", true)}
        <div className="page-head" style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>Mục tiêu khác</h1>
          <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>
            Những câu hỏi nhỏ để kế hoạch phù hợp với cuộc sống của bạn.
          </p>
        </div>

        <section className="card" style={{ padding: "24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>Nhu cầu của bạn</h2>

          <div className="notice info" style={{ background: "#f2f7fd", border: "1px solid #d5e4f5", borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: "#1e3a5f", marginBottom: "16px" }}>
            Không câu nào bắt buộc. Mọi thông tin bạn chọn có thể đổi lại bất kỳ lúc nào.
          </div>

          <details open style={{ border: "1px solid #d5e3f0", borderRadius: "12px", padding: "16px 18px", marginBottom: "14px" }}>
            <summary style={{ cursor: "pointer", fontSize: "14.5px", fontWeight: 700, color: "#052659", marginBottom: "12px" }}>
              1. Bạn đang chăm lo cho những ai?
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                  Trách nhiệm chăm sóc người thân (không bắt buộc điền)
                </label>
                <select
                  value={careResponsibility}
                  onChange={e => setCareResponsibility(e.target.value)}
                  style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659", background: "#fff" }}
                >
                  <option value="unknown">Chưa chọn</option>
                  <option value="none">Chưa có</option>
                  <option value="parents">Hỗ trợ cha mẹ / người thân</option>
                  <option value="children">Lo học tập cho con</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                  Số người đang hỗ trợ tài chính
                </label>
                <input
                  type="number"
                  min={0}
                  value={careCount}
                  onChange={e => setCareCount(e.target.value)}
                  style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659" }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                Tiền giữ lại mỗi tháng cho việc khác ngoài nghỉ hưu (không bắt buộc điền)
              </label>
              <input
                type="text"
                value={new Intl.NumberFormat("vi-VN").format(Number(careReserve.replace(/\D/g, "")) || 0)}
                onChange={e => setCareReserve(e.target.value.replace(/\D/g, ""))}
                style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659" }}
              />
              <small style={{ display: "block", fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Không đồng</small>
            </div>
          </details>

          <details style={{ border: "1px solid #d5e3f0", borderRadius: "12px", padding: "16px 18px", marginBottom: "18px" }}>
            <summary style={{ cursor: "pointer", fontSize: "14.5px", fontWeight: 700, color: "#052659" }}>
              2. Những khoản nào sắp cần đến?
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                  Dự định chi khoản lớn trong 3–5 năm tới (không bắt buộc điền)
                </label>
                <select
                  value={majorExpensePlan}
                  onChange={e => setMajorExpensePlan(e.target.value)}
                  style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659", background: "#fff" }}
                >
                  <option value="unknown">Chưa chọn</option>
                  <option value="none">Chưa có dự định lớn</option>
                  <option value="housing">Mua / sửa nhà</option>
                  <option value="education">Quỹ học vấn</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                  Ước tính tổng tiền cần cho mục tiêu đó
                </label>
                <input
                  type="number"
                  min={0}
                  value={majorExpenseTotal}
                  onChange={e => setMajorExpenseTotal(e.target.value)}
                  style={{ width: "100%", height: "42px", padding: "0 14px", borderRadius: "10px", border: "1px solid #cddfee", fontSize: "14px", color: "#052659" }}
                />
              </div>
            </div>
          </details>

          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#052659", margin: "0 0 10px" }}>Các khu vực thiết lập liên quan</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "20px" }}>
            <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid #dce7f3", background: "#f9fbff" }}>
              <strong style={{ display: "block", fontSize: "13px", color: "#052659", marginBottom: "4px" }}>Thu nhập &amp; độ ổn định</strong>
              <p style={{ fontSize: "12px", color: "#536779", margin: "0 0 10px" }}>Thiết lập tại Tài chính của bạn → Thu nhập &amp; chi tiêu.</p>
              <button type="button" onClick={() => setSectionParam("cashflow")} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                Mở Thu nhập &amp; chi tiêu
              </button>
            </div>
            <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid #dce7f3", background: "#f9fbff" }}>
              <strong style={{ display: "block", fontSize: "13px", color: "#052659", marginBottom: "4px" }}>Ưu tiên mức sống hưu trí</strong>
              <p style={{ fontSize: "12px", color: "#536779", margin: "0 0 10px" }}>Thiết lập tại Mục tiêu nghỉ hưu.</p>
              <Link to="/user/goal" style={{ display: "inline-block", padding: "6px 12px", borderRadius: "8px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>
                Mở Mục tiêu nghỉ hưu
              </Link>
            </div>
            <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid #dce7f3", background: "#f9fbff" }}>
              <strong style={{ display: "block", fontSize: "13px", color: "#052659", marginBottom: "4px" }}>Khẩu vị rủi ro &amp; biến động</strong>
              <p style={{ fontSize: "12px", color: "#536779", margin: "0 0 10px" }}>Thiết lập tại Phân bổ tài sản → Khả năng chịu rủi ro.</p>
              <Link to="/user/risk-portfolio?section=risk" style={{ display: "inline-block", padding: "6px 12px", borderRadius: "8px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>
                Mở Khả năng chịu rủi ro
              </Link>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => navigate("/user/goal")}
              style={{ background: "transparent", border: 0, color: "#052659", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => navigate("/user/plan")}
              style={{ padding: "10px 18px", borderRadius: "10px", border: 0, background: "#052659", color: "#fff", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              Lưu và xem kế hoạch
            </button>
          </div>
        </section>

        <Link
          to="/user/goal"
          style={{ display: "inline-block", padding: "9px 16px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
        >
          ← Quay lại Mục tiêu nghỉ hưu
        </Link>
      </div>
    );
  }

  // ============================================================================
  // DEFAULT HUB VIEW: 09_tai_chinh_tong_hop.png
  // ============================================================================
  const hubMetrics = [
    {
      label: vi ? "Thu nhập + lương hưu" : "Income & pension",
      compact: formatCompactMoney(income),
      full: `${formatFullMoney(income)}/tháng · Theo các nguồn thu đã khai`,
      borderTop: "#1e7e55",
      bg: "#f2faf6",
    },
    {
      label: vi ? "Chi tiêu sinh hoạt" : "Living expenses",
      compact: formatCompactMoney(expense),
      full: `${formatFullMoney(expense)}/tháng · Chưa bao gồm tiền trả nợ`,
      borderTop: "#d97706",
      bg: "#fffaf0",
    },
    {
      label: vi ? "Trả nợ trong tháng" : "Debt payments",
      compact: formatFullMoney(debtService),
      full: "Theo dư nợ và lịch đã khai",
      borderTop: "#225eaa",
      bg: "#f4f8fd",
    },
    {
      label: vi ? "Phần dư thu chi" : "Monthly surplus",
      compact: formatCompactMoney(surplus),
      full: `${formatFullMoney(surplus)}/tháng · Trước khoản góp nghỉ hưu`,
      borderTop: "#1e7e55",
      bg: "#f2faf6",
    },
  ];

  const topics = [
    {
      title: vi ? "Thu nhập & chi tiêu" : "Income & expenses",
      done: true,
      lines: [
        `Thu nhập + lương hưu: ${formatFullMoney(income)}/tháng`,
        `Chi tiêu sinh hoạt: ${formatFullMoney(expense)}/tháng`,
        `Phần dư thu chi: ${formatFullMoney(surplus)}/tháng`,
      ],
      note: `Tháng ${currentMonthStr} · Sau sinh hoạt và trả nợ, trước tiền giữ lại và góp nghỉ hưu.`,
      action: "Xem & cập nhật thu chi",
      onClick: () => setSectionParam("cashflow"),
    },
    {
      title: vi ? "Tài sản & dự phòng" : "Assets & reserves",
      done: true,
      lines: [
        `Dành cho hưu trí: ${formatFullMoney(retirementAssets)}`,
        `Quỹ dự phòng: ${formatFullMoney(reserveAssets)}`,
      ],
      note: "Tách riêng tiền hưu trí khỏi nhà ở, tiền kinh doanh và dự phòng khẩn cấp.",
      action: "Xem & phân loại tài sản",
      onClick: () => setSectionParam("assets"),
    },
    {
      title: vi ? "Khoản nợ & trả nợ" : "Debts & repayments",
      done: true,
      lines: [
        `Tổng dư nợ: ${formatFullMoney(totalDebt)}`,
        `Trả nợ tháng ${currentMonthStr}: ${formatFullMoney(debtService)}`,
      ],
      note: "Lãi suất, lịch trả nợ và ảnh hưởng của việc trả nợ đến ngân sách tích lũy.",
      action: "Xem chi tiết khoản nợ",
      to: "/user/debts",
    },
    {
      title: vi ? "Lương hưu BHXH" : "Social insurance pension",
      done: pensionStatus === "KNOWN" || pensionStatus === "NOT_APPLICABLE",
      lines: [
        `Lương hưu: ${pensionStatus === "KNOWN" ? `${formatFullMoney(Number(v2Profile?.pension?.monthlyAmount || 0))}/tháng` : "Chưa xác nhận"}`,
        `Bắt đầu từ: ${profile.goal.targetRetireAge || 60} tuổi`,
      ],
      note: "Lịch sử tham gia BHXH và mức lương hưu dự kiến đưa vào kế hoạch.",
      action: "Xem & cập nhật lương hưu",
      onClick: () => setSectionParam("insurance"),
    },
    {
      title: vi ? "Gia đình & người phụ thuộc" : "Family & dependents",
      done: familyDone,
      lines: [`Hôn nhân: ${maritalLabel}`, `Người phụ thuộc: ${depLabel}`],
      note: "Tình trạng hôn nhân và số người cần chăm sóc tài chính.",
      action: "Xem & cập nhật gia đình",
      onClick: () => setSectionParam("family"),
    },
  ];

  return (
    <div className="financial-profile-page finance-hub-page">
      <header className="financial-profile-header finance-hub-head">
        <div>
          <h1>{vi ? "Tài chính của bạn" : "Your finances"}</h1>
          <p>
            {vi
              ? "Nắm rõ toàn bộ thu chi, tài sản, nợ và nghĩa vụ gia đình trước khi lập kế hoạch."
              : "Get a clear view of income, spending, assets, debts and family duties before planning."}
          </p>
        </div>
      </header>
      <FinancialProfileGate inline>
        {hasProfile ? (
          <>
            <section
              className="finance-hub-metrics"
              aria-label={vi ? "Dòng tiền hằng tháng" : "Monthly cash flow"}
              style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px", marginBottom: "20px" }}
            >
              {hubMetrics.map(m => (
                <div
                  key={m.label}
                  className="metric-tile"
                  style={{
                    padding: "18px 20px",
                    borderRadius: "14px",
                    background: m.bg,
                    border: "1px solid #d5e3f0",
                    borderTop: `3px solid ${m.borderTop}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#536779", fontWeight: 500 }}>{m.label}</span>
                    <span
                      className="metric-info-btn"
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: "1px solid #c0cedb",
                        background: "#fff",
                        color: "#4f6b85",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        fontStyle: "italic",
                      }}
                    >
                      i
                    </span>
                  </div>
                  <strong style={{ display: "block", fontSize: "24px", fontWeight: 700, color: "#052659" }}>{m.compact}</strong>
                  <small style={{ display: "block", fontSize: "11px", color: "#637589", marginTop: "6px" }}>{m.full}</small>
                </div>
              ))}
            </section>

            <section
              className="finance-hub-grid"
              aria-label={vi ? "Các mục hồ sơ tài chính" : "Financial profile topics"}
              style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}
            >
              {topics.map(topic => (
                <article key={topic.title} className="finance-hub-card">
                  <header>
                    <h2>{topic.title}</h2>
                    <span className={`finance-hub-badge ${topic.done ? "is-done" : "is-missing"}`}>
                      {topic.done ? (vi ? "Đã khai" : "Declared") : vi ? "Chưa khai" : "Missing"}
                    </span>
                  </header>
                  <ul>
                    {topic.lines.map(line => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p>{topic.note}</p>
                  {topic.to ? (
                    <Link className="button button-secondary" to={topic.to} style={{ textDecoration: "none" }}>
                      {topic.action} →
                    </Link>
                  ) : (
                    <button type="button" className="button button-secondary" onClick={topic.onClick}>
                      {topic.action} →
                    </button>
                  )}
                </article>
              ))}
            </section>
          </>
        ) : (
          <section className="financial-profile-empty">
            <h2>{vi ? "Bạn chưa có hồ sơ tài chính" : "Start your financial profile"}</h2>
            <p>{vi ? "Khai báo thông tin ban đầu để theo dõi và cập nhật hồ sơ tại đây." : "Enter your initial information to review and update it here."}</p>
            <Link className="btn btn-primary" to="/onboarding">
              {vi ? "Khai báo hồ sơ" : "Create profile"}
            </Link>
          </section>
        )}
      </FinancialProfileGate>
    </div>
  );
}
