import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card, Icon } from "../components/ui";
import CurrencyInput from "../components/CurrencyInput";
import DateInput from "../components/DateInput";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useI18n } from "../i18n";
import "./retirement-goal.css";

function formatMonthDisplay(ym: string): string {
  if (!ym || ym.length < 7) return "";
  return `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
}

function prevMonthText(ym: string): string {
  if (!ym || ym.length < 7) return "";
  const year = parseInt(ym.slice(0, 4), 10);
  const month = parseInt(ym.slice(5, 7), 10);
  if (month === 1) return `12/${year - 1}`;
  const m = String(month - 1).padStart(2, "0");
  return `${m}/${year}`;
}

export default function RetirementGoalPage() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const { profile, v2Profile, updateProfileV2 } = useFinancialProfile();
  const { currentVersion, draftSelection, updateDraft, loadingPlans } = useRetirementPlan();

  const [isSaving, setIsSaving] = useState(false);

  // Birth date / month
  const initialBirth = v2Profile?.personal.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value : "1991-11";
  const [birthDate, setBirthDate] = useState<string>(initialBirth.length === 7 ? `${initialBirth}-15` : initialBirth);

  const birthYear = useMemo(() => {
    const y = parseInt(birthDate.slice(0, 4), 10);
    return isNaN(y) ? 1991 : y;
  }, [birthDate]);

  const currentYear = new Date().getFullYear();
  const currentAge = Math.max(18, currentYear - birthYear);

  // Target retirement age
  const [targetAge, setTargetAge] = useState<number>(() => {
    if (profile.goal.targetRetireAge >= 18) return profile.goal.targetRetireAge;
    return 60;
  });

  // Monthly expense
  const [monthlyExpenseInRetirement, setMonthlyExpenseInRetirement] = useState<number>(() => {
    if (profile.goal.monthlyExpenseInRetirement > 0) return profile.goal.monthlyExpenseInRetirement;
    return 15_000_000;
  });

  // Valuation month
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [valuationMonth, setValuationMonth] = useState<string>(currentMonth);

  // End month
  const [endMonth, setEndMonth] = useState<string>(() => {
    const endY = birthYear + 85;
    const m = birthDate.slice(5, 7) || "11";
    return `${endY}-${m}`;
  });

  // Lifestyle priority
  const [lifestylePriority, setLifestylePriority] = useState<string>("unknown");

  // Computed retirement month
  const retirementMonth = useMemo(() => {
    const rYear = birthYear + targetAge;
    const m = birthDate.slice(5, 7) || "11";
    return `${rYear}-${m}`;
  }, [birthYear, targetAge, birthDate]);

  const otherGoalsAssets = useMemo(() => {
    if (v2Profile?.assets?.status !== "KNOWN") return [];
    return v2Profile.assets.entries.filter(
      a => a.otherGoalsShare.status === "KNOWN" && Number(a.otherGoalsShare.value) > 0
    );
  }, [v2Profile?.assets]);

  const retirementMonthText = formatMonthDisplay(retirementMonth);

  const handleBirthDateChange = (val: string) => {
    setBirthDate(val);
    const y = parseInt(val.slice(0, 4), 10);
    const m = val.slice(5, 7) || "11";
    if (!isNaN(y)) {
      setEndMonth(`${y + 85}-${m}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (updateDraft) {
        updateDraft({
          monthlyExpenseToday: String(monthlyExpenseInRetirement),
          endMonth,
          whatIf: {
            retirementMonth,
          },
        });
      }
      navigate("/user/plan");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="content">
      <nav className="breadcrumb" aria-label="Đường dẫn trang" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Link to="/user/dashboard" className="btn-breadcrumb" style={{ border: "1px solid var(--border, #D0E4FE)", borderRadius: "8px", padding: "6px 12px", background: "#fff", color: "var(--navy, #052659)", fontSize: "13px", fontWeight: 500, textDecoration: "none" }}>
          ← {language === "en" ? "Overview" : "Tổng quan"}
        </Link>
        <span className="sep" style={{ color: "var(--muted, #64748b)" }}>/</span>
        <span aria-current="page" style={{ fontSize: "13px", color: "var(--navy, #052659)", fontWeight: 600 }}>
          {language === "en" ? "Retirement Goals" : "Mục tiêu nghỉ hưu"}
        </span>
      </nav>

      <div className="page-head" style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--navy, #052659)", margin: "0 0 8px" }}>
          {language === "en" ? "Retirement goals" : "Mục tiêu nghỉ hưu"}
        </h1>
        <p style={{ color: "var(--muted, #64748b)", fontSize: "14px", margin: 0 }}>
          {language === "en" ? "Choose your timeline, living standard, and preparation horizon." : "Chọn mốc thời gian, mức sống và thời gian cần chuẩn bị quỹ."}</p>
      </div>

      {/* Card: Mục tiêu của bạn */}
      <Card className="card" style={{ padding: "28px", borderRadius: "16px", marginBottom: "20px" }}>
        <header style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--navy, #052659)", margin: 0 }}>
            {language === "en" ? "Your goal" : "Mục tiêu của bạn"}
          </h2>
        </header>

        <form onSubmit={handleSubmit}>
          {/* Row 1: Ngày sinh & Tuổi nghỉ hưu */}
          <div className="goal-card-two-col two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <DateInput
              label={language === "en" ? "Date of birth" : "Ngày tháng năm sinh"}
              mode="date"
              value={birthDate}
              onChange={val => handleBirthDateChange(val)}
            />
            <div className="field">
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--navy, #052659)", marginBottom: "6px" }}>
                {language === "en" ? "What age do you want to retire?" : "Bạn muốn nghỉ hưu năm bao nhiêu tuổi?"}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  className="input"
                  min={18}
                  max={100}
                  value={targetAge}
                  onChange={e => setTargetAge(Number(e.target.value) || 0)}
                  style={{ width: "100%", height: "44px", padding: "0 44px 0 14px", border: `1px solid ${(targetAge < 18 || targetAge > 100) ? "#dc2626" : "var(--border, #D0E4FE)"}`, borderRadius: "8px", fontSize: "14px" }}
                />
                <span style={{ position: "absolute", right: "12px", top: "12px", fontSize: "13px", color: "var(--muted, #64748b)" }}>tuổi</span>
              </div>
              {(targetAge < 18 || targetAge > 100) ? (
                <small className="field-error-text error-text" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontSize: "12px", fontWeight: 500 }}>
                  {language === "en" ? "Retirement age must be between 18 and 100." : "Tuổi nghỉ hưu phải từ 18 đến 100 tuổi."}
                </small>
              ) : (
                <p style={{ fontSize: "12px", color: "var(--primary, #334DAF)", margin: "6px 0 0" }}>
                  {language === "en" ? `Projected retirement: month ${retirementMonthText}` : `Dự kiến nghỉ hưu: tháng ${retirementMonthText}`}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Chi tiêu nghỉ hưu */}
          <div className="field" style={{ margin: "20px 0" }}>
            <CurrencyInput
              label={language === "en" ? "Monthly retirement spending" : "Chi tiêu nghỉ hưu mỗi tháng"}
              value={monthlyExpenseInRetirement}
              onChange={val => setMonthlyExpenseInRetirement(val)}
              suffix="₫"
            />
            <p className="small muted" style={{ fontSize: "12px", color: "var(--muted, #64748b)", margin: "4px 0 0" }}>
              {language === "en" ? "At today's prices; excluding debt payments and separate support schedules." : "Theo giá hôm nay; chưa gồm trả nợ và khoản hỗ trợ có lịch riêng."}
            </p>
          </div>

          {/* Row 3: Tháng bắt đầu & Chuẩn bị đến */}
          <div className="goal-card-two-col two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", margin: "20px 0" }}>
            <DateInput
              label={language === "en" ? "Planning start month" : "Tháng bắt đầu lập số liệu"}
              mode="month"
              value={valuationMonth}
              onChange={val => setValuationMonth(val)}
            />
            <DateInput
              label={language === "en" ? "Prepare fund until month" : "Chuẩn bị quỹ đến tháng"}
              mode="month"
              value={endMonth}
              onChange={val => setEndMonth(val)}
            />
          </div>

          {/* Row 4: Mức sống mong muốn */}
          <div className="field" style={{ margin: "20px 0" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--navy, #052659)", marginBottom: "6px" }}>
              {language === "en" ? "What lifestyle do you desire in retirement? (optional)" : "Khi về hưu, bạn mong muốn mức sống như thế nào? (không bắt buộc điền)"}
            </label>
            <select
              value={lifestylePriority}
              onChange={e => setLifestylePriority(e.target.value)}
              style={{ width: "100%", height: "44px", padding: "0 14px", border: "1px solid var(--border, #D0E4FE)", borderRadius: "8px", fontSize: "14px", background: "#fff" }}
            >
              <option value="unknown">{language === "en" ? "Not selected" : "Chưa chọn"}</option>
              <option value="balanced">{language === "en" ? "Balanced living" : "Sinh hoạt cân đối"}</option>
              <option value="health">{language === "en" ? "Health and care" : "Sức khỏe và chăm sóc"}</option>
              <option value="housing">{language === "en" ? "Housing / rent" : "Nhà ở / tiền thuê"}</option>
              <option value="travel">{language === "en" ? "Travel and leisure" : "Du lịch và trải nghiệm"}</option>
            </select>
          </div>

          <details className="field-help" style={{ margin: "16px 0", fontSize: "13px", color: "var(--muted, #64748b)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 500, color: "var(--navy, #052659)" }}>{language === "en" ? "How retirement milestone is determined" : "Cách xác định mốc nghỉ hưu"}</summary>
            <p style={{ margin: "8px 0 0" }}>{language === "en" ? "Calculated by birth month at chosen age. Social security start date is declared separately." : "Tính theo tháng sinh nhật ở tuổi bạn chọn. Tháng bắt đầu nhận BHXH được khai riêng."}</p>
          </details>

          <div className="form-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "24px" }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate("/user/dashboard")}
              style={{ background: "transparent", border: 0, color: "#052659", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}
            >
              {language === "en" ? "Cancel" : "Hủy"}
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={isSaving}
              style={{ background: "#052659", color: "#fff", border: 0, borderRadius: "10px", padding: "10px 18px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer" }}
            >
              {isSaving ? (language === "en" ? "Saving…" : "Đang lưu…") : (language === "en" ? "Save and see new results" : "Lưu và xem kết quả mới")}
            </button>
          </div>
        </form>
      </Card>

      {/* Card: Mục tiêu lớn khác */}
      <Card className="card" style={{ padding: "24px 28px", borderRadius: "16px", marginBottom: "24px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--navy, #052659)", margin: "0 0 8px" }}>
          {language === "en" ? "Other major life goals" : "Mục tiêu lớn khác"}
        </h2>
        {otherGoalsAssets.length > 0 ? (
          <ul style={{ margin: "0 0 16px", paddingLeft: "20px" }}>
            {otherGoalsAssets.map(a => {
              const othShareNum = a.otherGoalsShare.status === "KNOWN" ? Number(a.otherGoalsShare.value) : 0;
              const valNum = a.value.status === "KNOWN" ? Number(a.value.value) : 0;
              const goalAmount = Math.round(valNum * othShareNum);
              return (
                <li key={a.id} style={{ fontSize: "14px", color: "var(--navy, #052659)", marginBottom: "4px" }}>
                  <strong>{a.label}</strong>: {Math.round(othShareNum * 100)}% ({new Intl.NumberFormat("vi-VN").format(goalAmount)} ₫)
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={{ color: "var(--muted, #64748b)", fontSize: "14px", margin: "0 0 16px" }}>
            {language === "en" ? "No other major goals added yet (home, car, education fund...)." : "Chưa có mục tiêu lớn khác (mua nhà, xe, quỹ học vấn...)."}
          </p>
        )}
        <Link
          to="/user/profile?section=constraints"
          className="btn secondary"
          style={{
            display: "inline-flex",
            alignItems: "center",
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
          {language === "en" ? "View & edit other goals →" : "Xem & chỉnh sửa mục tiêu khác →"}
        </Link>
      </Card>

      {/* Lộ trình cuộc đời (.life-timeline) */}
      <ol className="life-timeline">
        <li>
          <span>{language === "en" ? "PLANNING START" : "BẮT ĐẦU TÍNH"}</span>
          <strong>{formatMonthDisplay(valuationMonth)}</strong>
          <small>{currentAge || 35} {language === "en" ? "years old" : "tuổi"}</small>
        </li>
        <li>
          <span>{language === "en" ? "DESIRED RETIREMENT" : "NGHỈ HƯU MONG MUỐN"}</span>
          <strong>{retirementMonthText}</strong>
          <small>{targetAge} {language === "en" ? "years old" : "tuổi"}</small>
        </li>
        <li>
          <span>{language === "en" ? "PREPARE UNTIL" : "CHUẨN BỊ ĐẾN"}</span>
          <strong>{formatMonthDisplay(endMonth)}</strong>
          <small>{language === "en" ? `Spend through end of month ${prevMonthText(endMonth)}` : `Dự tính chi tiêu đến hết tháng ${prevMonthText(endMonth)}`}</small>
        </li>
      </ol>
    </div>
  );
}
