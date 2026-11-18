import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useI18n } from "../i18n";
import type { ProfileV2 } from "../services/financialProfile";
import ProfileFormattedInput from "../components/ProfileFormattedInput";
import ResponsiveDialog from "../components/ResponsiveDialog";
import { DiscoveryError } from "../components/DiscoveryParts";
import { Explain } from "../components/explanations/ExplainMode";
import { formatMoneyDecimal as financeMoney } from "../utils/moneyDisplay";
import { formatMonthVN } from "../utils/date";
import { illustrativeRetirementEnd } from "../utils/retirementHorizon";

import "../components/user-workspace-dialogs.css";
import "./remaining-user-sync.css";
import "./retirement-goal.css";

const monthIndex = (s: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
    ? Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1
    : null;

function GoalForm({ data }: { data: ProfileV2 }) {
  const { language } = useI18n();
  const en = language === "en";
  const t = (vi: string, english: string) => (en ? english : vi);
  const navigate = useNavigate();

  const { profileRevision, updateRetirementGoal, saveError, reloadProfile } = useFinancialProfile();
  const { draftSelection, currentVersion, updateDraft } = useRetirementPlan();

  const selection = { ...currentVersion?.preview.selection, ...draftSelection };
  const original = () => ({
    birthDate: data.personal.birthDate ?? "",
    birth: data.personal.birthMonth.status === "KNOWN" ? data.personal.birthMonth.value : "",
    retirement: data.personal.desiredRetirementMonth.status === "KNOWN" ? data.personal.desiredRetirementMonth.value : "",
    end: data.retirementGoal?.endMonth ?? selection.endMonth ?? illustrativeRetirementEnd(data.personal.birthMonth.status === "KNOWN" ? data.personal.birthMonth.value : ""),
    expense: data.retirementGoal?.monthlyExpenseToday ?? selection.monthlyExpenseToday ?? data.retirementSurvey?.monthlyExpenseToday ?? "",
    lifestyle: data.retirementGoal?.lifestylePriority ?? "",
  });

  const [form, setForm] = useState(original);
  const [autoEnd, setAutoEnd] = useState(original().end === illustrativeRetirementEnd(original().birth));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [endEdited, setEndEdited] = useState(false);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState<"explain" | "discard" | null>(null);
  const committed = useRef<{ key: string; revision: number } | null>(null);

  useEffect(() => {
    if (!dirty && !busy) { setForm(original()); setAutoEnd(original().end === illustrativeRetirementEnd(original().birth)); }
  }, [profileRevision, currentVersion?.id]);

  const prepareMonth = form.end ? (() => { const index = monthIndex(form.end)! + 1; return `${Math.floor(index/12)}-${String(index%12+1).padStart(2,"0")}`; })() : "";
  const legacyEnd = Boolean(form.end && form.end !== illustrativeRetirementEnd(form.birth));

  const set = (key: keyof typeof form, value: string) => {
    setDirty(true);
    if (key === "end") { setAutoEnd(false); setEndEdited(true); }
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setBirth = (value: string) => {
    setDirty(true);
    setForm(f => {
      const birth = value.slice(0, 7), oldBirth = monthIndex(f.birth), oldRetirement = monthIndex(f.retirement);
      const age = oldBirth !== null && oldRetirement !== null ? Math.floor((oldRetirement - oldBirth) / 12) : null;
      const retirement = birth && birth !== f.birth && age !== null ? `${Number(birth.slice(0, 4)) + age}-${birth.slice(5, 7)}` : f.retirement;
      return { ...f, birth, birthDate: value.length === 10 ? value : "", retirement, ...(autoEnd ? { end: illustrativeRetirementEnd(birth) } : {}) };
    });
  };

  const birthIdx = monthIndex(form.birth), retIdx = monthIndex(form.retirement);
  const ageMonths = birthIdx !== null && retIdx !== null ? retIdx - birthIdx : null;
  const ageYears = ageMonths !== null && ageMonths > 0 ? Math.floor(ageMonths / 12) : null;
  const setAge = (age: number) => {
    if (!form.birth || !Number.isInteger(age)) return;
    const bYear = Number(form.birth.slice(0, 4));
    const bMonth = form.birth.slice(5, 7);
    if (!bYear || !bMonth) return;
    const rYear = bYear + age;
    set("retirement", `${rYear}-${bMonth}`);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");

    const start = monthIndex(data.valuationDate.slice(0, 7));
    const birth = monthIndex(form.birth);
    const ret = monthIndex(form.retirement);
    const savedEnd = legacyEnd && !endEdited ? illustrativeRetirementEnd(form.birth) : form.end;
    const end = monthIndex(savedEnd);

    if (
      birth === null ||
      ret === null ||
      end === null ||
      birth > start! ||
      end < start! ||
      ret <= birth ||
      end < ret ||
      ageMonths! < 216 ||
      ageMonths! > 1200 ||
      !form.expense || Number(form.expense) <= 0
    ) {
      setError(
        t(
          "Bổ sung tháng sinh, tháng nghỉ hưu từ 18–100 tuổi, tháng kết thúc từ kỳ định giá và không trước nghỉ hưu, cùng mức chi mỗi tháng lớn hơn 0.",
          "Enter valid birth, retirement (age 18–100), end month and monthly spending. End must be at or after valuation and retirement."
        )
      );
      return;
    }

    setBusy(true);
    const key = JSON.stringify(form);
    try {
      let revision = profileRevision;
      if (committed.current?.key !== key || committed.current.revision !== profileRevision) {
        const ok = await updateRetirementGoal({
          birthMonth: form.birth,
          ...(form.birthDate ? { birthDate: form.birthDate } : {}),
          retirementMonth: form.retirement,
          goal: {
            endMonth: savedEnd,
            monthlyExpenseToday: form.expense,
            ...(data.retirementGoal?.monthlyContribution !== undefined ? { monthlyContribution: data.retirementGoal.monthlyContribution } : {}),
            lifestylePriority: (form.lifestyle || null) as NonNullable<
              ProfileV2["retirementGoal"]
            >["lifestylePriority"],
          },
        });
        if (!ok) return;
        revision++;
        committed.current = { key, revision };
      }
      updateDraft({
        expectedProfileRevision: revision,
        endMonth: savedEnd,
        monthlyExpenseToday: form.expense,
        whatIf: { ...selection.whatIf, retirementMonth: form.retirement },
      });
      setDirty(false);
      navigate("/user/plan");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t(
              "Chưa chuyển được mục tiêu sang bản nháp. Thử lại sẽ dùng dữ liệu đã lưu.",
              "Could not update the draft. Retry uses the saved goal."
            )
      );
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (dirty) setPopup("discard");
    else navigate("/user/dashboard");
  };

    const accumMonths = form.retirement && data.valuationDate && form.retirement.length >= 7 && data.valuationDate.length >= 7
      ? (Number(form.retirement.slice(0, 4)) * 12 + Number(form.retirement.slice(5, 7))) - (Number(data.valuationDate.slice(0, 4)) * 12 + Number(data.valuationDate.slice(5, 7)))
      : null;
    const accumYears = accumMonths !== null && accumMonths > 0 ? Math.floor(accumMonths / 12) : null;

    const spendMonths = form.end && form.retirement && form.end.length >= 7 && form.retirement.length >= 7
      ? (Number(form.end.slice(0, 4)) * 12 + Number(form.end.slice(5, 7))) - (Number(form.retirement.slice(0, 4)) * 12 + Number(form.retirement.slice(5, 7)))
      : null;
    const spendYears = spendMonths !== null && spendMonths > 0 ? Math.floor(spendMonths / 12) : null;

    const getAgeAt = (d: string | undefined) => {
      if (!d || !form.birth || d.length < 7 || form.birth.length < 7) return null;
      return Math.floor(
        (Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - Number(form.birth.slice(0, 4)) * 12 - Number(form.birth.slice(5, 7))) / 12
      );
    };
    const startAge = getAgeAt(data.valuationDate.slice(0, 7));
    const targetAge = getAgeAt(form.retirement);
    const endAge = getAgeAt(prepareMonth);

    return <div className="goal-page-wrapper remaining-user-page goal-sync-page">
    <header className="goal-page-header"><h1><Explain term="retirementGoal">{t("Mục tiêu nghỉ hưu", "Retirement goals")}</Explain></h1><p>{t("Chọn mốc thời gian, mức sống và thời gian cần chuẩn bị quỹ.", "Choose your timeline, spending and preparation horizon.")}</p></header>
    <form onSubmit={save} className="remaining-form remaining-card goal-main-form">
      <h2>{t("Mục tiêu của bạn", "Your goal")}</h2>
      <fieldset disabled={busy}>
        <div className="goal-inputs-grid">
          <ProfileFormattedInput format="date" hideDateHint label={t("Ngày tháng năm sinh", "Date of birth")} value={form.birthDate || form.birth} onChange={setBirth} />
          <div><label className="goal-age-field"><span><Explain term="retirementAge">{t("Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", "Retirement age")}</Explain></span><div><input aria-label={t("Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", "Retirement age")} type="number" min="18" max="100" value={ageYears ?? ""} onChange={e => e.target.value === "" ? set("retirement", "") : setAge(Number(e.target.value))} /><span>{t("tuổi", "years")}</span></div></label><p className="goal-field-note">{t("Dự kiến nghỉ hưu:", "Retirement month:")} <strong>{form.retirement ? (en ? `${Number(form.retirement.slice(5))}/${form.retirement.slice(0,4)}` : `tháng ${Number(form.retirement.slice(5))}/${form.retirement.slice(0,4)}`) : t("Chưa xác định", "Undetermined")}</strong></p></div>
        </div>
        <div className="goal-retirement-expense"><ProfileFormattedInput format="money" label={<Explain term="expenseToday">{t("Chi tiêu nghỉ hưu mỗi tháng", "Monthly retirement spending")}</Explain>} value={form.expense} onChange={v => set("expense", v)} /></div>
        <p className="goal-field-note">{t("Theo giá hôm nay; chưa gồm trả nợ và khoản hỗ trợ có lịch riêng.", "At today's prices; debt and separately scheduled support are modeled separately.")}</p>
        <div className="goal-inputs-grid">
          <label className="goal-valuation-field"><span>{t("Tháng bắt đầu lập số liệu", "Valuation month")}</span><input value={formatMonthVN(data.valuationDate.slice(0, 7))} readOnly /></label>
          <label className="goal-valuation-field"><span>{t("Chuẩn bị quỹ đến tháng", "Prepare the fund by")}</span><input aria-label={t("Chuẩn bị quỹ đến tháng", "Prepare the fund by")} value={prepareMonth ? formatMonthVN(prepareMonth) : ""} placeholder="mm/yyyy" readOnly /></label>
        </div>
        {legacyEnd && !endEdited && <p role="status" className="goal-field-note">{t(`Kế hoạch đang lưu tính đến ${formatMonthVN(form.end)}. Lưu lại để dùng mốc 85 tuổi.`, `The saved plan runs through ${formatMonthVN(form.end)}. Save again to use the age-85 horizon.`)}</p>}
        <details className="goal-exact-month"><summary>{t("Chỉnh thời gian nghỉ hưu và chi tiêu", "Adjust retirement and spending dates")}</summary>
          <div><ProfileFormattedInput format="month" label={t("Tháng nghỉ hưu mong muốn", "Desired retirement month")} value={form.retirement} onChange={v => set("retirement", v)} /><ProfileFormattedInput format="month" label={t("Tính chi tiêu nghỉ hưu đến tháng", "Model retirement spending through")} value={form.end} onChange={v => set("end", v)} />
            <p className="goal-field-note">{t("Chỉ cần chỉnh khi muốn thử thời gian chi tiêu khác; không phải dự đoán tuổi thọ.", "Adjust only to explore a different spending period; this is not a lifespan prediction.")}</p>
            <button type="button" className="remaining-text" onClick={() => { setDirty(true); setAutoEnd(true); setForm(f => ({ ...f, end: illustrativeRetirementEnd(f.birth) })); }}>{t("Dùng mốc 85 tuổi như bản demo", "Use the demo's age-85 horizon")}</button>
            {form.end && form.end === form.retirement && <p role="status" className="goal-field-note">{t("Hai mốc đang trùng nhau: quỹ cần chỉ tính 1 tháng chi tiêu khi nghỉ hưu. Chọn tháng kết thúc muộn hơn để tính các năm tiếp theo.", "These dates match: the required fund covers only one retirement month. Choose a later end month to include subsequent years.")}</p>}
          </div>
        </details>
        <label className="goal-lifestyle-field"><span>{t("Khi về hưu, bạn mong muốn mức sống như thế nào? (không bắt buộc điền)", "Retirement lifestyle (optional)")}</span><select aria-label={t("Mức sống mong muốn", "Lifestyle preference")} value={form.lifestyle} onChange={e => set("lifestyle", e.target.value)}>{[["", t("Chưa chọn", "Not selected")], ["BALANCED", t("Sinh hoạt cân đối", "Balanced living")], ["HEALTH", t("Sức khỏe và chăm sóc", "Health and care")], ["HOUSING", t("Nhà ở / tiền thuê", "Housing / rent")], ["TRAVEL", t("Du lịch và trải nghiệm", "Travel and leisure")]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </fieldset>
      <button type="button" className="remaining-text goal-explain-btn" onClick={() => setPopup("explain")}>{t("Cách xác định mốc nghỉ hưu", "How retirement dates are determined")}</button>
      {(error || saveError) && <div role="alert" className="remaining-error"><p>{error || saveError}</p><button type="button" className="overview-button secondary" onClick={reloadProfile}>{t("Tải lại hồ sơ", "Reload profile")}</button></div>}
      <footer className="goal-form-footer"><button type="button" className="overview-button secondary" disabled={busy} onClick={cancel}>{t("Hủy", "Cancel")}</button><button type="submit" className="overview-button primary" disabled={busy}>{busy ? t("Đang lưu…", "Saving…") : t("Lưu và xem kết quả mới", "Save and see new results")}</button></footer>
    </form>
    <section className="remaining-card goal-other-goals"><h2>{t("Mục tiêu lớn khác", "Other major goals")}</h2>{data.goals?.status === "KNOWN" ? data.goals.entries.length ? <ul>{data.goals.entries.map(g => <li key={g.id}><strong>{g.label}</strong><span>{financeMoney(g.amountToday.status === "KNOWN" ? g.amountToday.value : null, en)} · {g.dueMonth.status === "KNOWN" ? formatMonthVN(g.dueMonth.value) : t("Chưa có kỳ hạn", "No due month")}</span></li>)}</ul> : <p>{t("Chưa có mục tiêu lớn khác (mua nhà, xe, quỹ học vấn...)", "No other goals declared.")}</p> : data.goals?.status === "NOT_APPLICABLE" ? <p>{t("Chưa có mục tiêu lớn khác (mua nhà, xe, quỹ học vấn...)", "No other goals confirmed.")}</p> : <p>{t("Mục tiêu khác chưa được xác nhận.", "Other goals have not been confirmed.")}</p>}<Link className="overview-button secondary" to="/user/profile?section=constraints">{t("Xem & chỉnh sửa mục tiêu khác →", "Review other goals →")}</Link></section>
    <ol className="remaining-card goal-sync-timeline life-timeline" aria-label={t("Lộ trình các mốc thời gian", "Planning milestones timeline")}>
      <li className="goal-timeline-header-item">
        <h2 className="goal-timeline-title">{t("Các mốc thời gian cốt lõi", "Key planning milestones")}</h2>
        <p className="goal-timeline-desc">
          {t("Tổng quan 3 mốc định hình dòng tiền tích lũy và thời gian chuẩn bị quỹ hưu trí của bạn.", "Overview of the three key milestones shaping your accumulation cashflows and retirement fund horizon.")}
        </p>
      </li>

      <li className="goal-timeline-phase-track" aria-hidden="true">
        <div className="phase-bar-segment phase-accum">
          <span className="phase-bar-label">
            <span className="phase-dot" />
            <strong>{t("Giai đoạn tích lũy", "Accumulation Phase")}</strong>
            {accumYears ? ` · ${accumYears} ${t("năm", "years")}` : ""}
          </span>
          <span className="phase-bar-arrow">→</span>
        </div>
        <div className="phase-bar-segment phase-spend">
          <span className="phase-bar-label">
            <span className="phase-dot spend" />
            <strong>{t("Giai đoạn an hưởng", "Retirement Phase")}</strong>
            {spendYears ? ` · ${spendYears} ${t("năm", "years")}` : ""}
          </span>
        </div>
      </li>

      <li className="goal-timeline-nodes-item">
        <div className="goal-nodes-grid">
          {/* Node 1 */}
          <div className="goal-node-col node-start">
            <div className="node-caption-row">
              <span className="node-caption">{t("BẮT ĐẦU TÍNH", "VALUATION")}</span>
            </div>
            <div className="node-date-wrap">
              <strong className="node-date">{data.valuationDate.slice(0, 7) ? formatMonthVN(data.valuationDate.slice(0, 7)) : ""}</strong>
              {startAge !== null && <span className="node-age-badge">{startAge} {t("tuổi", "years old")}</span>}
            </div>
            <p className="node-note">{t("Thời điểm định giá tài sản & bắt đầu lộ trình", "Asset valuation & plan starting point")}</p>
          </div>

          {/* Node 2 - Hero Goal */}
          <div className="goal-node-col node-target is-hero">
            <div className="node-caption-row">
              <span className="node-caption">
                <Explain term="retirementAge">{t("NGHỈ HƯU MONG MUỐN", "DESIRED RETIREMENT")}</Explain>
              </span>
              <span className="hero-target-pill">{t("Mục tiêu hưu trí", "Retirement Goal")}</span>
            </div>
            <div className="node-date-wrap">
              <strong className="node-date hero-date">{form.retirement ? formatMonthVN(form.retirement) : t("Chưa xác định", "Undetermined")}</strong>
              {targetAge !== null && <span className="node-age-badge hero-age">{targetAge} {t("tuổi", "years old")}</span>}
            </div>
            <p className="node-note hero-note">
              {accumYears
                ? t(`Sau ${accumYears} năm tích lũy · Bắt đầu chi dùng quỹ`, `After ${accumYears} years saving · Fund spending begins`)
                : t("Bắt đầu bước vào giai đoạn an hưởng", "Retirement begins")}
            </p>
          </div>

          {/* Node 3 */}
          <div className="goal-node-col node-end">
            <div className="node-caption-row">
              <span className="node-caption">
                <Explain term="projectionEnd">{t("CHUẨN BỊ ĐẾN", "PREPARE THROUGH")}</Explain>
              </span>
            </div>
            <div className="node-date-wrap">
              <strong className="node-date">{prepareMonth ? formatMonthVN(prepareMonth) : t("Chưa xác định", "Undetermined")}</strong>
              {endAge !== null && <span className="node-age-badge">{endAge} {t("tuổi", "years old")}</span>}
            </div>
            <p className="node-note">
              {spendYears ? `${spendYears} ${t("năm an hưởng", "years retired")} · ` : ""}
              {t("Dự tính chi tiêu đến hết tháng", "Spending modeled through")} {formatMonthVN(form.end)}
            </p>
          </div>
        </div>
      </li>
    </ol>
    <ResponsiveDialog open={popup !== null} title={popup === "discard" ? t("Bỏ thay đổi chưa lưu?", "Discard unsaved changes?") : t("Mốc thời gian trong kế hoạch", "Planning dates")} className="user-workspace-dialog goal-timeline-dialog" onClose={() => { if (!busy) setPopup(null); }}>
      {popup === "discard" ? <><p>{t("Các thay đổi chưa lưu sẽ được bỏ khi quay lại Tổng quan.", "Unsaved edits will be discarded when returning to Overview.")}</p><footer><button type="button" className="overview-button secondary" onClick={() => setPopup(null)}>{t("Tiếp tục sửa", "Keep editing")}</button><button type="button" className="overview-button primary" onClick={() => navigate("/user/dashboard")}>{t("Bỏ thay đổi", "Discard changes")}</button></footer></> : <><p>{t("Hồ sơ lưu tháng sinh và tháng nghỉ hưu, không tự tạo ngày sinh cụ thể. Chọn tuổi dùng tháng sinh ở tuổi đó; bạn có thể chỉnh chính xác tháng nghỉ hưu trong mục mở rộng.", "The profile stores birth and retirement months without inventing a birth day. Choosing an age uses that birth month; the exact retirement month is editable in the expanded section.")}</p><p>{t("Mô hình tính đến hết tháng kết thúc đã chọn. Đây là khoảng thời gian dự phóng, không phải cam kết quỹ đủ chi tiêu hay dự đoán tuổi thọ.", "The model runs through the selected end month. This is a projection horizon, not a guarantee of sufficient funding or a life-expectancy prediction.")}</p><p>{t("Thời điểm nhận lương hưu BHXH được khai riêng tại Tài chính → BHXH và có thể khác tháng nghỉ làm.", "State pension start is declared separately under Finances → Pension and can differ from your retirement month.")}</p><p>{t("Lưu mục tiêu cập nhật hồ sơ và bản nháp để xem kết quả mới. Dùng làm kế hoạch chính cần được xác nhận tại trang Kế hoạch.", "Saving updates your profile and draft for a new preview. Applying a main plan requires confirmation on the Plan page.")}</p><footer><button type="button" className="overview-button primary" onClick={() => setPopup(null)}>{t("Đã hiểu", "Got it")}</button></footer></>}
    </ResponsiveDialog>
  </div>;
}

export default function RetirementGoalPage() {
  const { v2Profile, loading, loadError, reloadProfile } = useFinancialProfile();
  if (loading) {
    return (
      <div className="remaining-user-page goal-loading-wrap">
        <p role="status">Đang tải mục tiêu…</p>
      </div>
    );
  }
  if (loadError) {
    return <DiscoveryError message={loadError} retry={reloadProfile} />;
  }
  if (v2Profile) {
    return <GoalForm data={v2Profile} />;
  }
  return (
    <div className="remaining-user-page">
      <h1>Mục tiêu nghỉ hưu</h1>
      <p>Hãy hoàn tất hoặc nâng cấp hồ sơ tài chính trước khi lưu mục tiêu.</p>
      <Link to="/user/profile" className="overview-button primary">
        Mở Tài chính
      </Link>
    </div>
  );
}
