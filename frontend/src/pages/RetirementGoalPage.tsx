import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card, Icon } from "../components/ui";
import CurrencyInput from "../components/CurrencyInput";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useI18n } from "../i18n";
import "./retirement-goal.css";

const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function triple(n: number, full: boolean) {
  const h = Math.floor(n / 100), t = Math.floor(n / 10) % 10, u = n % 10;
  const a: string[] = [];
  if (h || full) a.push(digits[h], 'trăm');
  if (t > 1) a.push(digits[t], 'mươi'); else if (t === 1) a.push('mười'); else if (u && (h || full)) a.push('lẻ');
  if (u) a.push(u === 1 && t > 1 ? 'mốt' : u === 5 && t > 0 ? 'lăm' : digits[u]);
  return a.join(' ');
}
function moneyWords(value: number): string {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1e15) return '';
  if (n === 0) return 'Không đồng';
  let rest = n;
  const chunks: number[] = [];
  while (rest > 0) { chunks.push(rest % 1000); rest = Math.floor(rest / 1000); }
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const a: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i]) a.push(triple(chunks[i], i < chunks.length - 1 && chunks[i] < 100), units[i]);
  }
  const text = a.filter(Boolean).join(' ') + ' đồng';
  return text[0].toUpperCase() + text.slice(1);
}

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
    <div className="content" style={{ maxWidth: "960px", margin: "0 auto", padding: "36px 20px" }}>
      <nav className="breadcrumb" aria-label="Đường dẫn trang" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Link to="/user/dashboard" className="btn-breadcrumb" style={{ border: "1px solid var(--border, #D0E4FE)", borderRadius: "8px", padding: "6px 12px", background: "none", color: "var(--navy, #052659)", fontSize: "13px", fontWeight: 500, textDecoration: "none" }}>
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
            <div className="field">
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--navy, #052659)", marginBottom: "6px" }}>
                {language === "en" ? "Date of birth" : "Ngày tháng năm sinh"}
              </label>
              <input
                type="date"
                className="input"
                value={birthDate}
                onChange={e => handleBirthDateChange(e.target.value)}
                style={{ width: "100%", height: "44px", padding: "0 14px", border: "1px solid var(--border, #D0E4FE)", borderRadius: "8px", fontSize: "14px" }}
              />
            </div>
            <div className="field">
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--navy, #052659)", marginBottom: "6px" }}>
                {language === "en" ? "What age do you want to retire?" : "Bạn muốn nghỉ hưu năm bao nhiêu tuổi?"}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  className="input"
                  min={18}
                  max={80}
                  value={targetAge}
                  onChange={e => setTargetAge(Number(e.target.value) || 60)}
                  style={{ width: "100%", height: "44px", padding: "0 44px 0 14px", border: "1px solid var(--border, #D0E4FE)", borderRadius: "8px", fontSize: "14px" }}
                />
                <span style={{ position: "absolute", right: "12px", top: "12px", fontSize: "13px", color: "var(--muted, #64748b)" }}>tuổi</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--primary, #334DAF)", margin: "6px 0 0" }}>
                {language === "en" ? `Projected retirement: month ${retirementMonthText}` : `Dự kiến nghỉ hưu: tháng ${retirementMonthText}`}
              </p>
            </div>
          </div>

          {/* Row 2: Chi tiêu nghỉ hưu */}
          <div className="field" style={{ margin: "20px 0" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--navy, #052659)", marginBottom: "6px" }}>
              {language === "en" ? "Monthly retirement spending" : "Chi tiêu nghỉ hưu mỗi tháng"}
            </label>
            <CurrencyInput
              label={language === "en" ? "Monthly retirement spending" : "Chi tiêu nghỉ hưu mỗi tháng"}
              hideLabel
              value={monthlyExpenseInRetirement}
              onChange={val => setMonthlyExpenseInRetirement(val)}
              suffix="VND"
            />
            <span className="money-words" style={{ display: "block", color: "var(--primary, #334DAF)", fontSize: "12px", marginTop: "6px" }}>
              {moneyWords(monthlyExpenseInRetirement)}
            </span>
            <p className="small muted" style={{ fontSize: "12px", color: "var(--muted, #64748b)", margin: "4px 0 0" }}>
              {language === "en" ? "At today's prices; excluding debt payments and separate support schedules." : "Theo giá hôm nay; chưa gồm trả nợ và khoản hỗ trợ có lịch riêng."}
            </p>
          </div>

          {/* Row 3: Tháng bắt đầu & Chuẩn bị đến */}
          <div className="goal-card-two-col two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", margin: "20px 0" }}>
            <div className="field">
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--navy, #052659)", marginBottom: "6px" }}>
                {language === "en" ? "Planning start month" : "Tháng bắt đầu lập số liệu"}
              </label>
              <input
                type="month"
                className="input"
                value={valuationMonth}
                onChange={e => setValuationMonth(e.target.value)}
                style={{ width: "100%", height: "44px", padding: "0 14px", border: "1px solid var(--border, #D0E4FE)", borderRadius: "8px", fontSize: "14px" }}
              />
            </div>
            <div className="field">
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--navy, #052659)", marginBottom: "6px" }}>
                {language === "en" ? "Prepare fund until month" : "Chuẩn bị quỹ đến tháng"}
              </label>
              <input
                type="month"
                className="input"
                value={endMonth}
                onChange={e => setEndMonth(e.target.value)}
                style={{ width: "100%", height: "44px", padding: "0 14px", border: "1px solid var(--border, #D0E4FE)", borderRadius: "8px", fontSize: "14px" }}
              />
            </div>
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

          <div className="form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
            <button type="button" className="btn secondary" onClick={() => navigate("/user/dashboard")}>
              {language === "en" ? "Cancel" : "Hủy"}
            </button>
            <button type="submit" className="btn primary" disabled={isSaving}>
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
        <p style={{ color: "var(--muted, #64748b)", fontSize: "14px", margin: "0 0 16px" }}>
          {language === "en" ? "No other major goals added yet (home, car, education fund...)." : "Chưa có mục tiêu lớn khác (mua nhà, xe, quỹ học vấn...)."}
        </p>
        <Link to="/user/profile" className="btn secondary">
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
