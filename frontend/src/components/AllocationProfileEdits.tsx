import { useEffect, useState } from "react";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import type { GoalEntry } from "../services/financialProfile";
import ProfileFormattedInput from "./ProfileFormattedInput";
import { Decimal } from "../utils/decimal";
import { financeMoney } from "../utils/financeHubSummary";

// These two editors change the saved profile itself (the same fields the Finances pages edit),
// so the allocation is always recalculated from one source of truth.

/** The customer's own value always wins; otherwise the backend derives 6/9/12 months from declared income stability (method 3.2). */
function reserveDefaultNote(months: number | null, basis: string | undefined, en: boolean) {
  if (months === null || (basis !== "INCOME_STABILITY" && basis !== "DEFAULT")) return "";
  if (basis === "DEFAULT") return en ? `Default ${months} months (your income stability is not declared yet; the method uses 6 to 12 months depending on it). You can change it.` : `Mặc định ${months} tháng (bạn chưa khai độ ổn định thu nhập; phương pháp dùng 6–12 tháng tùy độ ổn định này). Bạn có thể đổi.`;
  const why = months >= 12 ? ["your income is uncertain", "thu nhập của bạn chưa chắc chắn"] : months >= 9 ? ["your income varies", "thu nhập của bạn biến động"] : ["your income is stable", "thu nhập của bạn ổn định"];
  return en ? `Default ${months} months because ${why[0]} (method: 6 to 12 months depending on income stability). You can change it.` : `Mặc định ${months} tháng vì ${why[1]} (theo phương pháp: 6–12 tháng tùy độ ổn định thu nhập). Bạn có thể đổi.`;
}
export function AllocationReserveMonths({ months, basis, en, essentialExpense, onPendingChange }: { months: number | null; basis?: "CUSTOMER" | "INCOME_STABILITY" | "DEFAULT"; en: boolean; essentialExpense?: string | null; onPendingChange?: (pending:boolean)=>void }) {
  const { updateProfileV2, saveStatus, saveError } = useFinancialProfile();
  const [value,setValue] = useState(months === null ? "" : String(months));
  const [error,setError] = useState("");
  useEffect(()=>setValue(months === null ? "" : String(months)),[months]);
  const valid = /^\d+$/.test(value) && Number(value)>=6 && Number(value)<=12;
  useEffect(()=>onPendingChange?.(!valid||Number(value)!==months||saveStatus==="saving"),[valid,value,months,saveStatus,onPendingChange]);
  const save=async(targetMonths?: number)=>{
    const n = targetMonths ?? Number(value);
    if(n < 6 || n > 12 || n === months || saveStatus === "saving") return;
    setError("");
    try {
      if(!await updateProfileV2({reserveMonths:n})) setError(en ? "Reserve months were not saved. Retry before continuing." : "Chưa lưu số tháng dự phòng. Thử lưu lại trước khi tiếp tục.");
    }
    catch(reason){setError(reason instanceof Error ? reason.message : "Chưa lưu số tháng dự phòng.");}
  };
  const pickPreset = (preset: number) => {
    setValue(String(preset));
    setError("");
    void save(preset);
  };
  return <div className="allocation-reserve-editor">
    <div className="allocation-field-header">
      <label htmlFor="reserve-months-input">{en ? "How many months of essential spending do you want in reserve?" : "Bạn muốn dự phòng mấy tháng chi tiêu thiết yếu? (6 đến 12 tháng)"}</label>
      <span className="allocation-field-tag">{en ? "Emergency Buffer" : "Quỹ khẩn cấp"}</span>
    </div>
    <div className="allocation-reserve-controls">
      <div className="allocation-reserve-presets" role="group" aria-label={en ? "Preset months" : "Chọn nhanh số tháng"}>
        {[6, 9, 12].map(preset => (
          <button
            type="button"
            key={preset}
            className={`allocation-reserve-chip${Number(value) === preset ? " is-selected" : ""}`}
            disabled={saveStatus === "saving"}
            onClick={() => pickPreset(preset)}
          >
            <strong>{preset} {en ? "months" : "tháng"}</strong>
            <small>{preset === 6 ? (en ? "Standard (6M)" : "Chuẩn (6T)") : preset === 9 ? (en ? "Secure (9M)" : "An toàn (9T)") : (en ? "Cautious (12M)" : "Vững chắc (12T)")}</small>
          </button>
        ))}
      </div>
      <div className="allocation-reserve-custom-wrap">
        <span className="allocation-reserve-custom-label">{en ? "Or custom:" : "Tùy chọn:"}</span>
        <input
          id="reserve-months-input"
          aria-label={en ? "Reserve months" : "Số tháng dự phòng"}
          type="number"
          min={6}
          max={12}
          step={1}
          value={value}
          disabled={saveStatus === "saving"}
          onChange={e => { setValue(e.target.value); setError(""); }}
          onBlur={() => void save()}
        />
        <span className="allocation-reserve-unit">{en ? "months" : "tháng"}</span>
      </div>
    </div>
    {reserveDefaultNote(months, basis, en) && <small className="allocation-reserve-default-note" role="note">{reserveDefaultNote(months, basis, en)}</small>}
    {valid && essentialExpense && Number(essentialExpense) > 0 && (
      <div className="allocation-reserve-preview">
        <span className="allocation-reserve-preview-badge">🛡️ {en ? "Calculated reserve" : "Quỹ dự phòng tương ứng"}</span>
        <span className="allocation-reserve-preview-formula">
          {financeMoney(essentialExpense, en)}/tháng × {value} {en ? "months" : "tháng"} = <strong>{financeMoney(new Decimal(essentialExpense).mul(value).toString(), en)}</strong>
        </span>
      </div>
    )}
    {!valid && <small className="allocation-error-text" role="status">{en ? "Enter a whole number from 6 to 12." : "Nhập số nguyên từ 6 đến 12 tháng."}</small>}
    {error && <><p role="alert">{saveError || error}</p><button type="button" className="overview-button secondary" disabled={saveStatus === "saving"} onClick={() => void save()}>{en ? "Retry saving reserve months" : "Thử lưu số tháng dự phòng"}</button></>}
  </div>;
}

const known = <T,>(value: T) => ({ status: "KNOWN" as const, value }), unknown = { status: "UNKNOWN" as const };
const text = (field: { status: string; value?: string } | undefined) => field?.status === "KNOWN" ? field.value ?? "" : "";

/** Add, edit and remove the dated goals that are protected before investing. */
export function AllocationGoals({ en, minMonth }: { en: boolean; minMonth?: string }) {
  const t = (vi: string, english: string) => en ? english : vi;
  const { v2Profile, updateProfileV2, saveStatus, saveError } = useFinancialProfile(), saving = saveStatus === "saving";
  const saved = v2Profile?.goals?.status === "KNOWN" ? v2Profile.goals.entries : [], savedKey = JSON.stringify(saved);
  const [goals, setGoals] = useState<GoalEntry[]>(saved), [problem, setProblem] = useState("");
  useEffect(() => { setGoals(saved); setProblem(""); }, [savedKey]);
  const edit = (index: number, change: Partial<GoalEntry>) => setGoals(rows => rows.map((row, i) => i === index ? { ...row, ...change } : row));
  const changed = JSON.stringify(goals) !== savedKey;
  const save = async () => {
    const bad = goals.findIndex(g => !g.label.trim() || g.amountToday.status !== "KNOWN" || !/^\d+(\.\d{1,2})?$/.test(g.amountToday.value) || g.dueMonth.status !== "KNOWN" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(g.dueMonth.value)
      || (g.inflation?.status === "KNOWN" && !(Number(g.inflation.value) >= 0 && Number(g.inflation.value) <= 30)));
    if (bad >= 0) { setProblem(t(`Kiểm tra tên, số tiền, tháng cần tiền và mức tăng giá của mục tiêu ${bad + 1}.`, `Check the name, amount, month and price growth of goal ${bad + 1}.`)); return; }
    setProblem("");
    await updateProfileV2({ goals: { status: "KNOWN", entries: goals.map(g => ({ ...g, label: g.label.trim() })) } });
  };
  return <div className="allocation-goals">
    {goals.length ? goals.map((goal, index) => <section className="allocation-goal" role="group" aria-label={t(`Mục tiêu ${index + 1}`, `Goal ${index + 1}`)} key={goal.id}>
      <div className="allocation-goal-heading"><h3>{t(`Mục tiêu ${index + 1}`, `Goal ${index + 1}`)}</h3><button type="button" className="remaining-text" disabled={saving} onClick={() => setGoals(rows => rows.filter((_, i) => i !== index))} aria-label={t(`Bỏ mục tiêu ${index + 1}`, `Remove goal ${index + 1}`)}>{t("Bỏ", "Remove")}</button></div>
      <label>{t("Tên mục tiêu", "Goal name")}<input value={goal.label} maxLength={120} onChange={event => edit(index, { label: event.target.value })} /></label>
      <div className="allocation-loss-fields">
        <ProfileFormattedInput format="money" label={t("Số tiền theo giá hôm nay", "Amount in today's prices")} value={text(goal.amountToday)} onChange={value => edit(index, { amountToday: value ? known(value) : unknown })} />
        <ProfileFormattedInput format="month" label={t("Tháng cần tiền", "Month needed")} value={text(goal.dueMonth)} min={minMonth} max="2199-12" onChange={value => edit(index, { dueMonth: value ? known(value) : unknown })} />
        <label>{t("Tăng giá mỗi năm (%)", "Price growth per year (%)")}<input inputMode="decimal" placeholder={t("Theo giả định đã công bố", "Published assumption")} value={text(goal.inflation)} onChange={event => { const value = event.target.value.replace(",", "."); if (/^\d{0,2}(\.\d{0,4})?$/.test(value)) edit(index, { inflation: value ? known(value) : undefined }); }} /></label>
        <label>{t("Mức ưu tiên", "Priority")}<select value={goal.priority.status === "KNOWN" ? goal.priority.value : ""} onChange={event => edit(index, { priority: event.target.value ? known(event.target.value as "ESSENTIAL" | "FLEXIBLE" | "LEGACY") : unknown })}>
          <option value="">{t("Chưa chọn", "Not set")}</option><option value="ESSENTIAL">{t("Thiết yếu", "Essential")}</option><option value="FLEXIBLE">{t("Linh hoạt", "Flexible")}</option>{goal.priority.status === "KNOWN" && goal.priority.value === "LEGACY" && <option value="LEGACY">{t("Để lại tài sản", "Legacy")}</option>}</select></label>
        <label>{t("Nếu thiếu tiền, có thể dời 1 năm?", "If funds are short, can it move by a year?")}<select value={goal.deferrable.status === "KNOWN" ? goal.deferrable.value ? "yes" : "no" : ""} onChange={event => edit(index, { deferrable: event.target.value ? known(event.target.value === "yes") : unknown })}>
          <option value="">{t("Chưa chọn", "Not set")}</option><option value="no">{t("Không", "No")}</option><option value="yes">{t("Có", "Yes")}</option></select></label>
      </div>
    </section>) : <p>{t("Không có mục tiêu khác trong lịch. Thêm khoản học phí, nhà ở hoặc chăm sóc nếu cần.", "No other goals are scheduled. Add tuition, housing or care if needed.")}</p>}
    <button type="button" className="overview-button secondary" disabled={saving || goals.length >= 12} onClick={() => setGoals(rows => [...rows, { id: crypto.randomUUID(), label: "", amountToday: unknown, dueMonth: unknown, priority: known("ESSENTIAL"), deferrable: known(false) }])}>{t("＋ Thêm mục tiêu", "＋ Add goal")}</button>
    <p>{t("Khoản cần trong 5 năm được dành vốn hôm nay theo giá trị chiết khấu. Mục tiêu xa hơn được đưa vào lịch rút của quỹ dài hạn.", "Goals due within 5 years are reserved today at present value. Later goals are drawn from the long-term fund.")}</p>
    {(problem || (changed && saveStatus === "error" && saveError)) && <p role="alert">{problem || saveError}</p>}
    {changed && <button type="button" className="overview-button primary" disabled={saving} onClick={() => void save()}>{saving ? t("Đang lưu…", "Saving…") : t("Lưu mục tiêu và tính lại", "Save goals and recalculate")}</button>}
  </div>;
}

/** Yes/No question that settles `goals` (an UNKNOWN answer blocks long-term capital with
 *  GOALS_REQUIRED). "No" saves an explicit empty list; "Yes" opens the goal editor. */
export function AllocationGoalsQuestion({ en, minMonth, id }: { en: boolean; minMonth?: string; id?: string }) {
  const t = (vi: string, english: string) => en ? english : vi;
  const { v2Profile, updateProfileV2, saveStatus } = useFinancialProfile(), saving = saveStatus === "saving";
  const goals = v2Profile?.goals, answered = goals?.status === "KNOWN", count = goals?.status === "KNOWN" ? goals.entries.length : 0;
  const [choice, setChoice] = useState<"yes" | "no" | null>(answered ? (count ? "yes" : "no") : null), [confirmNo, setConfirmNo] = useState(false), [problem, setProblem] = useState("");
  useEffect(() => { setChoice(answered ? (count ? "yes" : "no") : null); setConfirmNo(false); }, [answered, count]);
  const sayNo = async () => {
    setProblem("");
    // Only this save's own failure is shown here; other editors report theirs (shared saveError).
    if (!await updateProfileV2({ goals: { status: "KNOWN", entries: [] } })) setProblem(t("Chưa lưu được câu trả lời. Hãy thử lại.", "Your answer was not saved. Please retry."));
  };
  const pickNo = () => { setChoice("no"); if (count) setConfirmNo(true); else if (!answered) void sayNo(); };
  return <fieldset className="allocation-goals-question" id={id}>
    <legend>{t("Trong tương lai bạn có khoản lớn cần dùng không?", "Do you have a large expense coming up?")}</legend>
    <p>{t("Ví dụ học phí, mua nhà, chữa bệnh, chăm sóc cha mẹ. Khoản cần trong 5 năm tới được giữ riêng, không đem đầu tư.",
      "For example tuition, a home, medical care or caring for parents. Money needed within 5 years is set aside, not invested.")}</p>
    <div className="allocation-choice-row" role="radiogroup">
      <label className={`allocation-choice${choice === "no" ? " is-selected" : ""}`}><input type="radio" name="allocation-goals" checked={choice === "no"} disabled={saving} onChange={pickNo} /><span><strong>{t("Không có", "No")}</strong><small>{t("Toàn bộ phần còn lại dành cho dài hạn", "Everything left goes to the long term")}</small></span></label>
      <label className={`allocation-choice${choice === "yes" ? " is-selected" : ""}`}><input type="radio" name="allocation-goals" checked={choice === "yes"} disabled={saving} onChange={() => { setChoice("yes"); setConfirmNo(false); }} /><span><strong>{t("Có", "Yes")}</strong><small>{t("Khai số tiền và thời điểm cần", "Enter the amount and when you need it")}</small></span></label>
    </div>
    {confirmNo && <div className="allocation-loss-hint" data-kind="warn"><p>{t(`Bạn đã khai ${count} khoản. Chọn "Không có" sẽ xoá các khoản này khỏi hồ sơ.`, `You have ${count} goals. Choosing "No" removes them from your profile.`)}</p>
      <button type="button" className="overview-button secondary" disabled={saving} onClick={() => void sayNo()}>{t("Xoá và xác nhận không có", "Remove and confirm none")}</button>
      <button type="button" className="remaining-text" onClick={() => { setChoice("yes"); setConfirmNo(false); }}>{t("Giữ các khoản đã khai", "Keep my goals")}</button></div>}
    {choice === "yes" && <AllocationGoals en={en} minMonth={minMonth} />}
    {problem && <p role="alert">{problem}</p>}
    {choice === null && <p className="allocation-required-note" role="status">{t("Cần trả lời câu này để tính phần vốn dài hạn.", "Answer this to calculate long-term capital.")}</p>}
  </fieldset>;
}
