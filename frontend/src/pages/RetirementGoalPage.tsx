import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useI18n } from "../i18n";
import type { ProfileV2 } from "../services/financialProfile";
import ProfileFormattedInput from "../components/ProfileFormattedInput";
import ResponsiveDialog from "../components/ResponsiveDialog";
import { DiscoveryError } from "../components/DiscoveryParts";
import { formatMoneyDecimal as financeMoney } from "../utils/moneyDisplay";
import { formatMonthVN } from "../utils/date";

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
    birth: data.personal.birthMonth.status === "KNOWN" ? data.personal.birthMonth.value : "",
    retirement: data.personal.desiredRetirementMonth.status === "KNOWN" ? data.personal.desiredRetirementMonth.value : "",
    end: data.retirementGoal?.endMonth ?? selection.endMonth ?? "",
    expense: data.retirementGoal?.monthlyExpenseToday ?? selection.monthlyExpenseToday ?? data.retirementSurvey?.monthlyExpenseToday ?? "",
    lifestyle: data.retirementGoal?.lifestylePriority ?? "",
  });

  const [form, setForm] = useState(original);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState<"explain" | "discard" | null>(null);
  const committed = useRef<{ key: string; revision: number } | null>(null);

  useEffect(() => {
    if (!dirty && !busy) setForm(original());
  }, [profileRevision, currentVersion?.id]);

  const set = (key: keyof typeof form, value: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const birthIdx = monthIndex(form.birth), retIdx = monthIndex(form.retirement);
  const ageMonths = birthIdx !== null && retIdx !== null ? retIdx - birthIdx : null;
  const ageYears = ageMonths !== null && ageMonths > 0 ? Math.floor(ageMonths / 12) : null;
  const setAge = (age: number) => {
    if (!form.birth || isNaN(age)) return;
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
    const end = monthIndex(form.end);

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
      !form.expense
    ) {
      setError(
        t(
          "Bổ sung tháng sinh, tháng nghỉ hưu từ 18–100 tuổi, tháng kết thúc từ kỳ định giá và không trước nghỉ hưu, cùng mức chi mỗi tháng.",
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
          retirementMonth: form.retirement,
          goal: {
            endMonth: form.end,
            monthlyExpenseToday: form.expense,
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
        endMonth: form.end,
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

  return <div className="goal-page-wrapper remaining-user-page goal-sync-page">
    <nav className="goal-top-nav" aria-label={t("Quay lại Tổng quan", "Back to overview")}><Link className="overview-button secondary" to="/user/dashboard">{t("← Tổng quan", "← Overview")}</Link><span aria-hidden="true">/</span><span>{t("Mục tiêu nghỉ hưu", "Retirement goal")}</span></nav>
    <header className="goal-page-header"><h1>{t("Mục tiêu nghỉ hưu", "Retirement goals")}</h1><p>{t("Chọn mốc thời gian, mức sống và thời gian cần chuẩn bị quỹ.", "Choose your timeline, spending and preparation horizon.")}</p></header>
    <form onSubmit={save} className="remaining-form remaining-card goal-main-form">
      <h2>{t("Mục tiêu của bạn", "Your goal")}</h2>
      <fieldset disabled={busy}>
        <div className="goal-inputs-grid">
          <ProfileFormattedInput format="month" label={t("Tháng năm sinh", "Birth month")} value={form.birth} onChange={v => set("birth", v)} />
          <div><label className="goal-age-field"><span>{t("Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", "Retirement age")}</span><div><input aria-label={t("Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", "Retirement age")} type="number" min="18" max="100" value={ageYears ?? ""} onChange={e => e.target.value === "" ? set("retirement", "") : setAge(Number(e.target.value))} /><span>{t("tuổi", "years")}</span></div></label><p className="goal-field-note">{t("Dự kiến nghỉ hưu:", "Retirement month:")} <strong>{form.retirement ? formatMonthVN(form.retirement) : t("Chưa xác định", "Undetermined")}</strong></p></div>
        </div>
        <ProfileFormattedInput format="money" label={t("Chi tiêu nghỉ hưu mỗi tháng", "Monthly retirement spending")} value={form.expense} onChange={v => set("expense", v)} />
        <p className="goal-field-note">{t("Theo giá hôm nay; chưa gồm trả nợ và khoản hỗ trợ có lịch riêng.", "At today's prices; debt and separately scheduled support are modeled separately.")}</p>
        <div className="goal-inputs-grid">
          <label className="goal-valuation-field"><span>{t("Tháng bắt đầu lập số liệu", "Valuation month")}</span><input value={formatMonthVN(data.valuationDate.slice(0, 7))} readOnly /><small>{t("Theo kỳ định giá hồ sơ. Rà soát tài sản trong Tài chính khi muốn đổi kỳ số liệu.", "Uses your profile valuation period. Review assets in Finances before changing it.")}</small></label>
          <ProfileFormattedInput format="month" label={t("Chuẩn bị quỹ đến tháng", "End month")} value={form.end} onChange={v => set("end", v)} />
        </div>
        <label className="goal-lifestyle-field"><span>{t("Khi về hưu, bạn mong muốn mức sống như thế nào? (không bắt buộc điền)", "Retirement lifestyle (optional)")}</span><select aria-label={t("Mức sống mong muốn", "Lifestyle preference")} value={form.lifestyle} onChange={e => set("lifestyle", e.target.value)}>{[["", t("Chưa chọn", "Not selected")], ["BALANCED", t("Sinh hoạt cân đối", "Balanced living")], ["HEALTH", t("Sức khỏe và chăm sóc", "Health and care")], ["HOUSING", t("Nhà ở / tiền thuê", "Housing / rent")], ["TRAVEL", t("Du lịch và trải nghiệm", "Travel and leisure")]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <details className="goal-exact-month"><summary>{t("Chỉnh chính xác tháng nghỉ hưu", "Adjust the exact retirement month")}</summary><ProfileFormattedInput format="month" label={t("Tháng nghỉ hưu mong muốn", "Desired retirement month")} value={form.retirement} onChange={v => set("retirement", v)} /></details>
      </fieldset>
      <button type="button" className="remaining-text goal-explain-btn" onClick={() => setPopup("explain")}>{t("Cách xác định mốc nghỉ hưu", "How retirement dates are determined")}</button>
      {(error || saveError) && <div role="alert" className="remaining-error"><p>{error || saveError}</p><button type="button" className="overview-button secondary" onClick={reloadProfile}>{t("Tải lại hồ sơ", "Reload profile")}</button></div>}
      <footer className="goal-form-footer"><button type="button" className="overview-button secondary" disabled={busy} onClick={cancel}>{t("Hủy", "Cancel")}</button><button type="submit" className="overview-button primary" disabled={busy}>{busy ? t("Đang lưu…", "Saving…") : t("Lưu và xem kết quả mới", "Save and see new results")}</button></footer>
    </form>
    <section className="remaining-card goal-other-goals"><h2>{t("Mục tiêu lớn khác", "Other major goals")}</h2>{data.goals?.status === "KNOWN" ? data.goals.entries.length ? <ul>{data.goals.entries.map(g => <li key={g.id}><strong>{g.label}</strong><span>{financeMoney(g.amountToday.status === "KNOWN" ? g.amountToday.value : null, en)} · {g.dueMonth.status === "KNOWN" ? formatMonthVN(g.dueMonth.value) : t("Chưa có kỳ hạn", "No due month")}</span></li>)}</ul> : <p>{t("Đã xác nhận chưa có mục tiêu khác.", "No other goals declared.")}</p> : data.goals?.status === "NOT_APPLICABLE" ? <p>{t("Đã xác nhận không có mục tiêu khác.", "No other goals confirmed.")}</p> : <p>{t("Mục tiêu khác chưa được xác nhận.", "Other goals have not been confirmed.")}</p>}<Link className="overview-button secondary" to="/user/profile?section=constraints">{t("Xem & chỉnh sửa mục tiêu khác →", "Review other goals →")}</Link></section>
    <ol className="goal-sync-timeline life-timeline">{[[t("Bắt đầu tính", "Valuation"), data.valuationDate.slice(0, 7)], [t("Nghỉ hưu mong muốn", "Retirement"), form.retirement], [t("Chuẩn bị đến hết tháng", "Through end of month"), form.end]].map(([label, date]) => <li key={label}><span>{label}</span><strong>{date ? formatMonthVN(date) : t("Chưa xác định", "Undetermined")}</strong></li>)}</ol>
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
