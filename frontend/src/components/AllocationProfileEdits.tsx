import { useEffect, useState } from "react";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import type { GoalEntry } from "../services/financialProfile";
import ProfileFormattedInput from "./ProfileFormattedInput";

// These two editors change the saved profile itself (the same fields the Finances pages edit),
// so the allocation is always recalculated from one source of truth.

/** Reserve choice is independent of the user's declared income stability. */
export function AllocationReserveMonths({ months, en }: { months: number | null; en: boolean }) {
  const { updateProfileV2, saveStatus } = useFinancialProfile();
  const [value,setValue] = useState(months === null ? "" : String(months));
  useEffect(()=>setValue(months === null ? "" : String(months)),[months]);
  const valid = /^\d+$/.test(value) && Number(value)>=6 && Number(value)<=12;
  return <label>{en ? "How many months of essential spending do you want in reserve?" : "Bạn muốn dự phòng mấy tháng chi tiêu thiết yếu?"}
    <input aria-label={en ? "Reserve months" : "Số tháng dự phòng"} type="number" min={6} max={12} step={1} value={value} disabled={saveStatus === "saving"} onChange={e=>setValue(e.target.value)} onBlur={()=>{if(valid && Number(value)!==months)void updateProfileV2({reserveMonths:Number(value)});}} />
    {!valid&&<small role="status">{en ? "Enter a whole number from 6 to 12." : "Nhập số nguyên từ 6 đến 12 tháng."}</small>}
  </label>;
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
