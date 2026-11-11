import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import { authenticatedRequest } from "../services/api";
import type { GoalEntry, KnownOrUnknown, PlanningReport, PlanningValues, ProfileV2 } from "../services/financialProfile";
import ProfileFormattedInput from "../components/ProfileFormattedInput";
import ResponsiveDialog from "../components/ResponsiveDialog";
import { Icon, useNotification } from "../components/ui";
import { Decimal } from "../utils/decimal";
import { financeMoney } from "../utils/financeHubSummary";
import { formatDateVN } from "../utils/date";
import "../components/user-workspace-dialogs.css";
import "./financial-cashflow.css";
import "./financial-constraints.css";

const unknown = { status: "UNKNOWN" as const };
const text = (value?: KnownOrUnknown<string>) => value?.status === "KNOWN" ? value.value : "";
const amount = (value: string): KnownOrUnknown<string> => value === "" ? unknown : { status: "KNOWN", value };
const validMoney = (value: string) => /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value);
const horizons = ["y1", "y3", "y5"] as const;
type Translate = (vi: string, en: string) => string;

function Question({ number, title, description, children, initialOpen, sectionRef }: { number: number; title: string; description: string; children: ReactNode; initialOpen?: boolean; sectionRef?: React.RefObject<HTMLDetailsElement | null> }) {
  return <details className="planning-question" open={initialOpen} ref={sectionRef}>
    <summary><span className="planning-question-index">{number}</span><span><strong>{title}</strong><small>{description}</small></span><Icon name="chevron-down" /></summary>
    <div className="planning-question-body">{children}</div>
  </details>;
}
function Tip({ children }: { children: ReactNode }) { return <div className="planning-tip"><Icon name="info" /><p>{children}</p></div>; }

function PlanningForm({ profile, revision }: { profile: ProfileV2; revision: number }) {
  const en = useI18n().language === "en", t: Translate = (vi, english) => en ? english : vi;
  const { updatePlanning, saveError, reloadProfile } = useFinancialProfile(), navigate = useNavigate(), { notify } = useNotification();
  const initialNeeds = () => Object.fromEntries(horizons.map(h => [h, text(profile.liquidityNeeds?.[h])])) as Record<typeof horizons[number], string>;
  const initialCare = profile.personal.careResponsibility?.status === "KNOWN" ? profile.personal.careResponsibility.value : "";
  const [care, setCare] = useState<"" | Extract<PlanningValues["careResponsibility"], { status: "KNOWN" }>["value"]>(initialCare), [needs, setNeeds] = useState(initialNeeds);
  const [goals, setGoals] = useState<PlanningValues["goals"]>(() => structuredClone(profile.goals ?? unknown));
  const [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [errors, setErrors] = useState<Record<string, string>>({}), [remove, setRemove] = useState<number | "UNKNOWN" | "NOT_APPLICABLE" | null>(null);
  const form = useRef<HTMLFormElement>(null), second = useRef<HTMLDetailsElement>(null);
  const setGoal = (index: number, patch: Partial<GoalEntry>) => setGoals(current => current.status !== "KNOWN" ? current : { ...current, entries: current.entries.map((row, i) => {
    if (i !== index) return row; const next = { ...row, ...patch }; if ("inflation" in patch && patch.inflation === undefined) delete next.inflation; return next;
  }) });
  const validate = () => {
    const next: Record<string, string> = {};
    for (const h of horizons) if (needs[h] && !validMoney(needs[h])) next[h] = t("Nhập số tiền không âm, tối đa 16 chữ số và 2 số lẻ; hoặc để trống nếu chưa biết.", "Enter a non-negative amount with up to 16 digits and 2 decimals, or leave blank if unknown.");
    for (const [a, b] of [["y1", "y3"], ["y1", "y5"], ["y3", "y5"]] as const)
      if (needs[a] && needs[b] && validMoney(needs[a]) && validMoney(needs[b]) && new Decimal(needs[a]).gt(needs[b])) next[b] = t("Nhu cầu lũy kế không được giảm: 1 năm ≤ 3 năm ≤ 5 năm.", "Cumulative needs must not decrease: 1 year ≤ 3 years ≤ 5 years.");
    if (goals.status === "NOT_APPLICABLE" && !goals.reason.trim()) next.goals = t("Nêu lý do xác nhận chưa có mục tiêu khác.", "Provide a reason for confirming no other goals.");
    if (goals.status === "KNOWN") goals.entries.forEach((goal, index) => {
      const key = `goal-${index}`;
      const previous = profile.goals?.status === "KNOWN" ? profile.goals.entries.find(row => row.id === goal.id) : undefined;
      const changedBasics = !previous || goal.label !== previous.label || JSON.stringify(goal.amountToday) !== JSON.stringify(previous.amountToday) || JSON.stringify(goal.dueMonth) !== JSON.stringify(previous.dueMonth);
      // Keep old incomplete or zero declarations when only unrelated data changes.
      // A new or edited goal still needs the complete name/amount/date triad.
      if (changedBasics) {
      if (!goal.label.trim() || goal.label.trim().length > 120) next[`${key}-label`] = t("Đặt tên mục tiêu, tối đa 120 ký tự.", "Name the goal using up to 120 characters.");
      if (goal.amountToday.status !== "KNOWN" || !validMoney(goal.amountToday.value) || !new Decimal(goal.amountToday.value).gt(0)) next[`${key}-amount`] = t("Mục tiêu cần có số tiền lớn hơn 0 theo giá hôm nay.", "A goal needs an amount greater than zero in today's prices.");
      if (goal.dueMonth.status !== "KNOWN" || !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(goal.dueMonth.value) || goal.dueMonth.value < profile.valuationDate.slice(0, 7)) next[`${key}-due`] = t("Chọn tháng cần tiền từ tháng định giá hồ sơ đến 12/2199.", "Choose a due month from the profile valuation month through December 2199.");
      }
      if (goal.inflation?.status === "KNOWN" && (!/^-?(0|[1-9]\d{0,2})(\.\d{1,10})?$/.test(goal.inflation.value) || !new Decimal(goal.inflation.value).gt(-100) || new Decimal(goal.inflation.value).gt(100))) next[`${key}-inflation`] = t("Lạm phát phải lớn hơn -100% và không quá 100%.", "Inflation must be above -100% and at most 100%.");
    });
    setErrors(next); const key = Object.keys(next)[0];
    if (key) {
      if (second.current) second.current.open = true;
      requestAnimationFrame(() => {
        const target = form.current?.querySelector<HTMLElement>(`[data-planning-field="${key}"] input, [data-planning-field="${key}"] select`);
        for (let parent = target?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
        target?.focus();
      });
      return false;
    }
    return true;
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setAttempted(false); if (!validate()) return;
    setBusy(true); setAttempted(true);
    try {
      const values: PlanningValues = { careResponsibility: care ? { status: "KNOWN", value: care } : unknown,
        liquidityNeeds: { y1: amount(needs.y1), y3: amount(needs.y3), y5: amount(needs.y5) }, goals };
      if (await updatePlanning(values)) { notify.success(t("Đã lưu mục tiêu khác", "Other goals saved"), t("Đã cập nhật hồ sơ. Hãy xem lại bản tính trước khi áp dụng vào kế hoạch chính.", "Profile updated. Review the calculation before applying it to your main plan.")); navigate("/user/plan"); }
    } finally { setBusy(false); }
  };
  const reset = () => { setCare(initialCare); setNeeds(initialNeeds()); setGoals(structuredClone(profile.goals ?? unknown)); setErrors({}); setAttempted(false); setRemove(null); };
  const field = (key: string, children: ReactNode) => <div key={key} data-planning-field={key}>{children}</div>;
  return <section className="cashflow-card planning-card"><h2>{t("Nhu cầu của bạn", "Your needs")}</h2>
    <form ref={form} className="cashflow-form planning-form" onSubmit={save} onInvalidCapture={event => {
      event.preventDefault();
      const target = event.target as HTMLInputElement;
      for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
      const holder = target.closest<HTMLElement>("[data-planning-field]"), key = holder?.dataset.planningField ?? "input";
      const message = (target.validity.rangeUnderflow || target.validity.rangeOverflow) && target.type === "month" ? t("Chọn tháng cần tiền từ tháng định giá hồ sơ đến 12/2199.", "Choose a due month from the profile valuation month through December 2199.") : target.validationMessage;
      setErrors({ [key]: message });
      requestAnimationFrame(() => (holder?.querySelector<HTMLElement>("input,select") ?? target).focus());
    }}>
      <fieldset disabled={busy}>
        <Tip><strong>{t("Theo nhu cầu thực tế:", "Based on your actual needs:")}</strong> {t("Mở từng nhóm phù hợp để hoàn thiện. Ô trống biểu thị chưa biết; chỉ nhập 0 khi bạn chắc chắn không có khoản đó.", "Open the relevant groups. Blank means unknown; enter zero only when you are sure there is no such amount.")}</Tip>
        <Question number={1} title={t("Bạn đang chăm lo cho những ai?", "Who are you caring for?")} description={t("Ghi nhận hoàn cảnh, tránh bỏ sót chi phí.", "Record your circumstances and review your expenses.")} initialOpen>
          <label>{t("Nghĩa vụ gia đình hiện tại", "Current family responsibilities")} <small>{t("(không bắt buộc điền)", "(optional)")}</small>
            <select aria-label={t("Nghĩa vụ gia đình hiện tại", "Current family responsibilities")} value={care} onChange={event => setCare(event.target.value as typeof care)}>
              <option value="">{t("Chưa biết / bổ sung sau", "Unknown / add later")}</option>
              {([["SELF", "Chủ yếu cho bản thân", "Mostly myself"], ["CHILDREN", "Có con nhỏ / con cái cần chăm lo", "Children needing care"], ["PARENTS", "Có bố mẹ già phụ thuộc vào tôi", "Parents depending on me"], ["BOTH", "Cả con nhỏ và bố mẹ già", "Both children and parents"], ["OTHER", "Nghĩa vụ khác", "Other responsibilities"]] as const).map(([value, vi, english]) => <option key={value} value={value}>{t(vi, english)}</option>)}
            </select>
          </label>
          <Tip>{t("Các khoản cho con, cha mẹ hoặc nhà ở đã nằm trong tổng chi sinh hoạt thì không nhập thêm lần nữa. Khai lịch và số tiền tại Tài chính → Thu chi. Câu trả lời này giúp nhắc việc, chưa tự thay đổi mức chi hoặc lạm phát.", "Do not enter family or housing costs twice if already included in living expenses. Manage amounts and schedules under Income & expenses. This answer is a reminder and does not change expenses or inflation.")}</Tip>
        </Question>
        <Question number={2} title={t("Những khoản nào sắp cần đến?", "Which expenses are coming up?")} description={t("Nhu cầu gần hạn và các mục tiêu quan trọng.", "Near-term needs and important financial goals.")} sectionRef={second}>
          <h3>{t("Nhu cầu tiền mặt gần hạn (1 / 3 / 5 năm)", "Near-term cash needs (1 / 3 / 5 years)")}</h3>
          <p>{t("Nhập tổng lũy kế theo giá hôm nay: số trong 3 năm bao gồm năm đầu, số trong 5 năm bao gồm 3 năm. Không cộng dồn ba số với nhau.", "Enter cumulative totals in today's prices: three years includes year one, and five years includes the first three. The three amounts are not added together.")}</p>
          <div className="planning-three">{horizons.map((h, i) => field(h, <ProfileFormattedInput key={h} format="money" label={t(`Trong ${[1, 3, 5][i]} năm tới`, `Within ${[1, 3, 5][i]} ${i === 0 ? "year" : "years"}`)} placeholder={t("Chưa xác định", "Undetermined")} value={needs[h]} onChange={value => setNeeds(current => ({ ...current, [h]: value }))} error={errors[h]} />))}</div>
          <div className="planning-goals-heading"><h3>{t("Mục tiêu tài chính quan trọng", "Important financial goals")}</h3></div>
          <p>{t("Khai các dự định lớn theo giá hôm nay và thời điểm cần tiền. Có thể giữ nguyên mục tiêu đang chờ bổ sung khi bạn chỉ cập nhật thông tin khác.", "Declare major goals in today's prices and when the money is needed. Existing incomplete goals can be retained when you only update other information.")}</p>
          {field("goals", <label>{t("Tình trạng các mục tiêu khác", "Other goals status")}<select aria-label={t("Tình trạng các mục tiêu khác", "Other goals status")} value={goals.status} onChange={event => { const next = event.target.value as PlanningValues["goals"]["status"]; if (goals.status === "KNOWN" && goals.entries.length && next !== "KNOWN") setRemove(next); else setGoals(next === "KNOWN" ? { status: "KNOWN", entries: [] } : next === "UNKNOWN" ? unknown : { status: "NOT_APPLICABLE", reason: t("Chưa có mục tiêu khác", "No other goals") }); }}>
            <option value="UNKNOWN">{t("Chưa biết / bổ sung sau", "Unknown / add later")}</option><option value="KNOWN">{t("Khai các mục tiêu", "Declare goals")}</option><option value="NOT_APPLICABLE">{t("Xác nhận chưa có mục tiêu khác", "Confirm no other goals")}</option>
          </select></label>)}
          {goals.status === "NOT_APPLICABLE" && <label>{t("Lý do chưa có mục tiêu khác", "Reason for no other goals")}<input aria-label={t("Lý do chưa có mục tiêu khác", "Reason for no other goals")} value={goals.reason} maxLength={300} onChange={event => setGoals({ ...goals, reason: event.target.value })} /></label>}
          {goals.status === "KNOWN" && <>
            {goals.entries.map((goal, index) => {
              const key = `goal-${index}`, inflation = goal.inflation?.status ?? "PUBLISHED";
              return <section className="planning-goal" role="group" aria-label={t(`Mục tiêu ${index + 1}`, `Goal ${index + 1}`)} key={goal.id}>
                <div className="planning-goal-heading"><h4>{t(`Mục tiêu ${index + 1}`, `Goal ${index + 1}`)}</h4><button type="button" className="cashflow-text-button" aria-label={t(`Xóa mục tiêu ${index + 1}`, `Remove goal ${index + 1}`)} onClick={() => setRemove(index)}><Icon name="trash" /> {t("Xóa", "Remove")}</button></div>
                {field(`${key}-label`, <label>{t("Bạn muốn dùng tiền vào việc gì?", "What is the goal?")}<input aria-label={t("Bạn muốn dùng tiền vào việc gì?", "What is the goal?")} value={goal.label} maxLength={120} onChange={event => setGoal(index, { label: event.target.value })} aria-invalid={Boolean(errors[`${key}-label`])} placeholder={t("Ví dụ: học phí, sửa nhà", "For example: tuition, home repairs")} /></label>)}
                <div className="planning-two">
                  {field(`${key}-amount`, <ProfileFormattedInput format="money" label={t("Cần bao nhiêu tiền (theo giá hiện tại)?", "How much is needed in today's prices?")} value={text(goal.amountToday)} onChange={value => setGoal(index, { amountToday: amount(value) })} error={errors[`${key}-amount`]} />)}
                  {field(`${key}-due`, <ProfileFormattedInput format="month" label={t("Khi nào bạn cần dùng số tiền này?", "When is the money needed?")} value={text(goal.dueMonth)} min={profile.valuationDate.slice(0, 7)} max="2199-12" onChange={value => setGoal(index, { dueMonth: amount(value) })} error={errors[`${key}-due`]} />)}
                  <label>{t("Mức ưu tiên của mục tiêu", "Goal priority")}<select aria-label={t("Mức ưu tiên của mục tiêu", "Goal priority")} value={goal.priority.status === "KNOWN" ? goal.priority.value : ""} onChange={event => setGoal(index, { priority: event.target.value ? { status: "KNOWN", value: event.target.value as "ESSENTIAL" | "FLEXIBLE" | "LEGACY" } : unknown })}><option value="">{t("Chưa biết / bổ sung sau", "Unknown / add later")}</option><option value="ESSENTIAL">{t("Thiết yếu", "Essential")}</option><option value="FLEXIBLE">{t("Linh hoạt", "Flexible")}</option><option value="LEGACY">{t("Để lại tài sản", "Legacy")}</option></select></label>
                  <label>{t("Nếu chưa đủ tiền, có thể lùi thời gian không?", "Can the goal be deferred if funds are short?")}<select aria-label={t("Nếu chưa đủ tiền, có thể lùi thời gian không?", "Can the goal be deferred if funds are short?")} value={goal.deferrable.status === "KNOWN" ? goal.deferrable.value ? "yes" : "no" : ""} onChange={event => setGoal(index, { deferrable: event.target.value ? { status: "KNOWN", value: event.target.value === "yes" } : unknown })}><option value="">{t("Chưa biết / bổ sung sau", "Unknown / add later")}</option><option value="yes">{t("Có thể dời", "Can defer")}</option><option value="no">{t("Cần đúng thời điểm", "Fixed date")}</option></select></label>
                </div>
                <details className="planning-goal-inflation"><summary>{t("Giá và lạm phát của mục tiêu", "Goal prices and inflation")}</summary><p>{t("Số tiền khai theo giá tại tháng định giá hồ sơ. Lạm phát riêng chỉ áp dụng cho mục tiêu này; không thay giả định chung của bản tính.", "Amounts use prices at the profile valuation month. A custom rate applies only to this goal and does not change shared calculation assumptions.")}</p><label>{t("Cách quy đổi giá mục tiêu", "Goal inflation basis")}<select aria-label={t("Cách quy đổi giá mục tiêu", "Goal inflation basis")} value={inflation} onChange={event => setGoal(index, { inflation: event.target.value === "PUBLISHED" ? undefined : event.target.value === "UNKNOWN" ? unknown : { status: "KNOWN", value: goal.inflation?.status === "KNOWN" ? goal.inflation.value : "" } })}><option value="PUBLISHED">{t("Dùng giả định đã công bố trong bản tính", "Use published calculation assumptions")}</option><option value="UNKNOWN">{t("Chưa xác định lạm phát mục tiêu", "Goal inflation is unknown")}</option><option value="KNOWN">{t("Khai mức lạm phát riêng", "Declare a custom rate")}</option></select></label>{inflation === "KNOWN" && field(`${key}-inflation`, <label>{t("Lạm phát riêng (%/năm)", "Custom inflation (%/year)")}<input aria-label={t("Lạm phát riêng (%/năm)", "Custom inflation (%/year)")} inputMode="decimal" value={text(goal.inflation)} onChange={event => setGoal(index, { inflation: { status: "KNOWN", value: event.target.value.replace(",", ".") } })} aria-invalid={Boolean(errors[`${key}-inflation`])} /></label>)}</details>
              </section>;
            })}
            {!goals.entries.length && <p>{t("Danh sách đã khai hiện chưa có mục tiêu. Bạn có thể thêm một mục tiêu bên dưới.", "Your declared list is empty. Add a goal below.")}</p>}
            <button type="button" className="overview-button secondary planning-add" disabled={goals.entries.length >= 200} onClick={() => setGoals({ ...goals, entries: [...goals.entries, { id: crypto.randomUUID(), label: "", amountToday: unknown, dueMonth: unknown, priority: unknown, deferrable: unknown }] })}><Icon name="plus" /> {t("Thêm mục tiêu", "Add goal")}</button>
          </>}
          <Tip>{t("Nếu mục tiêu đã nằm trong nhu cầu 1 / 3 / 5 năm, không cộng lần nữa. Mở Phân bổ tài sản để xác nhận lịch và dành vốn. Việc lưu ở đây không tự trừ tiền khỏi quỹ nghỉ hưu hoặc áp dụng một kế hoạch mới.", "Do not count a goal twice if included in the 1 / 3 / 5-year needs. Review schedules and protected capital in Asset allocation. Saving here does not withdraw from retirement funds or apply a new plan.")}</Tip>
        </Question>
        <section className="planning-related" aria-label={t("Thiết lập liên quan", "Related settings")}><h3><Icon name="settings" /> {t("Các khu vực thiết lập liên quan", "Related settings")}</h3><p>{t("Dự phòng khẩn cấp, mức chịu lỗ và tiền giữ lại hàng tháng được quản lý tại các chuyên mục riêng:", "Emergency reserves, loss tolerance and monthly reserves are managed in their own sections:")}</p><div>
          {([["/user/profile?section=assets", "shield", "Tài sản & dự phòng", "Assets & reserves", "Quỹ dự phòng khẩn cấp & tài sản có sẵn", "Emergency funds and available assets"], ["/user/risk-portfolio?section=allocation", "target", "Phân bổ tài sản", "Asset allocation", "Mức chịu lỗ, bảo vệ vốn & danh mục", "Loss tolerance, protected capital and portfolio"], ["/user/profile?section=cashflow", "wallet", "Thu nhập & chi tiêu", "Income & expenses", "Tiền giữ lại hàng tháng & ngân sách", "Monthly reserves and budget"]] as const).map(([to, icon, vi, english, note, noteEn]) => <Link key={to} to={to}><Icon name={icon} /><span><strong>{t(vi, english)}</strong><small>{t(note, noteEn)}</small></span><Icon name="arrow-right" /></Link>)}
        </div></section>
      </fieldset>
      {(Object.keys(errors).length > 0 || attempted && saveError) && <div className="cashflow-error" role="alert"><p>{Object.values(errors)[0] || saveError}</p>{attempted && saveError && <button className="overview-button secondary" type="button" onClick={() => void reloadProfile()}>{t("Tải lại hồ sơ", "Reload profile")}</button>}</div>}
      <footer><button type="button" className="cashflow-text-button" disabled={busy} onClick={reset}>{t("Hủy thay đổi", "Discard changes")}</button><button className="overview-button primary" disabled={busy} type="submit">{busy ? t("Đang lưu…", "Saving…") : t("Lưu và xem kế hoạch", "Save and view plan")}</button></footer>
    </form>
    <ResponsiveDialog open={remove !== null} title={typeof remove === "string" ? t("Bỏ toàn bộ danh sách đang chỉnh?", "Remove the entire draft goal list?") : t("Bỏ mục tiêu khỏi bản đang chỉnh?", "Remove this goal from your draft?")} className="user-workspace-dialog planning-remove-dialog" onClose={() => setRemove(null)} fallbackFocusSelector=".planning-add"><p>{t("Mục tiêu chỉ được xóa khỏi hồ sơ sau khi bạn bấm Lưu và xem kế hoạch. Kế hoạch chính đang áp dụng được giữ nguyên.", "The goal is removed from your profile only after Save and view plan. Your currently applied plan is preserved.")}</p><footer><button type="button" className="overview-button secondary" onClick={() => setRemove(null)}>{t("Giữ lại", "Keep goal")}</button><button type="button" className="overview-button primary" onClick={() => { setGoals(current => typeof remove === "number" ? current.status === "KNOWN" ? { ...current, entries: current.entries.filter((_, i) => i !== remove) } : current : remove === "UNKNOWN" ? unknown : remove === "NOT_APPLICABLE" ? { status: "NOT_APPLICABLE", reason: t("Chưa có mục tiêu khác", "No other goals") } : current); setRemove(null); }}>{t("Bỏ khỏi bản đang chỉnh", "Remove from draft")}</button></footer></ResponsiveDialog>
    <span className="planning-revision">{t("Dữ liệu theo hồ sơ ngày", "Profile valuation date")}: {formatDateVN(profile.valuationDate)} · {t("Phiên bản", "Revision")} {revision}</span>
  </section>;
}

export default function FinancialConstraintsPage() {
  const { user } = useAuth(), { v2Profile: v2, profileRevision, hasProfile, loading, loadError, upgradeToV2, saveStatus, saveError, reloadProfile } = useFinancialProfile();
  const en = useI18n().language === "en", t: Translate = (vi, english) => en ? english : vi;
  const [state, setState] = useState<{ key: string; report?: PlanningReport; error?: string; revisionMismatch?: boolean } | null>(null), [attempt, setAttempt] = useState(0), [help, setHelp] = useState(false);
  const key = `${user?.id}:${profileRevision}:${attempt}`;
  useEffect(() => {
    if (!user?.id || !v2 || !hasProfile || loading || loadError) return;
    let active = true;
    authenticatedRequest<PlanningReport>("/me/financial-profile/planning", undefined, "GET", undefined, { skipCache: true })
      .then(report => { if (active) setState(report.profileRevision === profileRevision ? { key, report } : { key, revisionMismatch: true, error: t("Hồ sơ đã đổi. Tải lại để xem cùng phiên bản.", "Your profile changed. Reload to view the current revision.") }); })
      .catch(error => { if (active) setState({ key, error: error instanceof Error ? error.message : t("Chưa tải được báo cáo mục tiêu.", "Could not load the goals report.") }); });
    return () => { active = false; };
  }, [key, user?.id, Boolean(v2), profileRevision, hasProfile, loading, loadError]);
  const current = state?.key === key && !loading && !loadError && hasProfile ? state : null, report = current?.report;
  return <div className="financial-constraints-page">
    <nav className="cashflow-breadcrumb" aria-label={t("Đường dẫn trang", "Breadcrumb")}><Link className="overview-button secondary" to="/user/goal">{t("← Mục tiêu nghỉ hưu", "← Retirement goals")}</Link><span aria-hidden="true">/</span><span aria-current="page">{t("Mục tiêu khác", "Other goals")}</span></nav>
    <header className="cashflow-heading"><h1>{t("Mục tiêu khác", "Other goals")}</h1><p>{t("Những câu hỏi nhỏ để kế hoạch phù hợp với cuộc sống của bạn.", "A few questions to fit your plan to your life.")}</p></header>
    {loadError ? <p role="status">{t("Thông tin tạm ẩn đến khi tải lại hồ sơ thành công.", "Information is hidden until your profile reloads successfully.")}</p> : !loading && !hasProfile ? <section className="cashflow-card"><h2>{t("Bạn chưa có hồ sơ tài chính", "Start your financial profile")}</h2><Link className="overview-button primary" to="/onboarding">{t("Khai báo hồ sơ", "Create profile")}</Link></section> : !loading && hasProfile && !v2 ? <section className="cashflow-card"><p>{t("Chuyển sang hồ sơ chi tiết để quản lý nhu cầu và mục tiêu khác.", "Upgrade to a detailed profile to manage needs and other goals.")}</p><button className="overview-button primary" disabled={saveStatus === "saving"} onClick={() => void upgradeToV2()}>{t("Chuyển hồ sơ", "Upgrade profile")}</button>{saveError && <p role="alert">{saveError}</p>}</section> : v2 && !loading && <>
      <PlanningForm key={profileRevision} profile={v2} revision={profileRevision} />
      {current?.error && <div role="alert" className="cashflow-error"><p>{current.error}</p><button className="overview-button secondary" onClick={() => { if (current.revisionMismatch) void reloadProfile(); else setAttempt(value => value + 1); }}>{current.revisionMismatch ? t("Tải lại hồ sơ", "Reload profile") : t("Thử lại báo cáo", "Retry report")}</button></div>}
      <button className="cashflow-text-button planning-help" disabled={!report} onClick={() => setHelp(true)}><Icon name="info" /> {t("Các khoản này được dùng thế nào?", "How are these declarations used?")}</button>
    </>}
    <Link className="overview-button secondary planning-back" to="/user/goal">{t("← Quay lại Mục tiêu nghỉ hưu", "← Back to retirement goals")}</Link>
    <ResponsiveDialog open={help && Boolean(report)} title={t("Cách dùng nhu cầu và mục tiêu", "How needs and goals are used")} className="user-workspace-dialog planning-help-dialog" onClose={() => setHelp(false)} fallbackFocusSelector=".planning-help"><p>{t("Ba nhu cầu tiền là tổng lũy kế, không phải ba khoản chi độc lập. Mục tiêu có thể đã nằm trong các nhu cầu này. Bản tính phân tách vốn dùng danh sách mục tiêu và giả định được công bố; thiếu dữ kiện thì giữ chưa xác định.", "The three cash needs are cumulative totals, not separate expenses. Goals may already be included in them. Capital separation uses the goal list and published assumptions; missing data remains undetermined.")}</p>{report && <><p>{t("Thông tin đã lưu theo hồ sơ ngày", "Saved profile valuation date")}: <strong>{formatDateVN(report.valuationDate)}</strong></p><dl>{horizons.map((h, i) => <div key={h}><dt>{t(`Trong ${[1, 3, 5][i]} năm tới`, `Within ${[1, 3, 5][i]} ${i === 0 ? "year" : "years"}`)}</dt><dd>{financeMoney(text(report.liquidityNeeds[h]) || null, en)}</dd></div>)}</dl><p>{report.goals.status === "KNOWN" ? t(`Đã lưu ${report.goals.entries.length} mục tiêu.`, `${report.goals.entries.length} goals saved.`) : report.goals.status === "UNKNOWN" ? t("Danh sách mục tiêu chưa xác định.", "The goal list is unknown.") : t("Đã xác nhận chưa có mục tiêu khác.", "No other goals confirmed.")}</p></>}<Tip>{t("Lưu hồ sơ chỉ đánh dấu kế hoạch cần xem lại. Không tự cộng khoản chi, rút quỹ hay áp dụng bản tính mới.", "Saving flags your plan for review. It does not add expenses, withdraw funds or apply a new calculation.")}</Tip><footer><button className="overview-button secondary" onClick={() => setHelp(false)}>{t("Đóng", "Close")}</button><Link className="overview-button primary" to="/user/risk-portfolio?section=allocation" onClick={() => setHelp(false)}>{t("Xem phân bổ tài sản", "Review asset allocation")}</Link></footer></ResponsiveDialog>
  </div>;
}
