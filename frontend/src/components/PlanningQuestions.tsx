import { useState } from "react";
import { useI18n } from "../i18n";
import { Button, Input, Select } from "./ui";
import type { PlanningConstraints, KnownOrUnknown, GoalEntry } from "../services/financialProfile";
import "./retirement/planning-analysis.css";

const unknown = { status: "UNKNOWN" } as const;
const value = <T,>(v?: KnownOrUnknown<T>) => v?.status === "KNOWN" ? String(v.value) : "";
const answer = <T extends string,>(v: T): KnownOrUnknown<T> => v === "" ? unknown : { status: "KNOWN", value: v };
export function PlanningQuestions({ data, onChange, valuationMonth }: { data: PlanningConstraints; onChange: (next: PlanningConstraints) => void; valuationMonth: string }) {
  const { language } = useI18n(); const en = language === "en";
  const [customInflation, setCustomInflation] = useState<string[]>([]);
  const t = (vi: string, english: string) => en ? english : vi;
  const choices = (items: [string, string, string][]) => [{ value: "", label: t("Chưa biết / bổ sung sau", "Unknown / add later") }, ...items.map(([value, vi, english]) => ({ value, label: t(vi, english) }))];
  const set = (changes: PlanningConstraints) => onChange({ ...data, ...changes });
  const goals = data.goals?.status === "KNOWN" ? data.goals.entries : [];
  const updateGoal = (id: string, changes: Partial<GoalEntry>) => set({ goals: { status: "KNOWN", entries: goals.map(g => g.id === id ? { ...g, ...changes } : g) } });
  const needs = [data.liquidityNeeds?.y1, data.liquidityNeeds?.y3, data.liquidityNeeds?.y5].filter(v => v?.status === "KNOWN").map(v => v!.status === "KNOWN" ? Number(v!.value) : NaN);
  const inconsistent = needs.some((n, i) => i > 0 && n < needs[i - 1]);
  return <section className="planning-analysis planning-questions" aria-label={t("Ràng buộc và mục tiêu", "Constraints and goals")}>
    <h2>{t("Bốn câu hỏi để bảo vệ những khoản quan trọng", "Four questions to protect what matters")}</h2>
    <p>{t("Mở từng câu để trả lời. Ô trống là chưa biết; chỉ nhập 0 khi bạn xác nhận không có khoản tiền đó. Các câu trả lời được lưu cùng hồ sơ khi tiếp tục.", "Open each question to answer. Blank means unknown; enter zero only to confirm no amount. Answers are saved with your profile when you continue.")}</p>
    <details open><summary>{t("1. Bạn chịu được mất tối đa bao nhiêu tiền?", "1. How much money could you afford to lose?")}</summary>
      <p>{t("Ví dụ: nếu 1 tỷ đồng đầu tư tạm giảm còn 800 triệu đồng, bạn sẽ thấy thế nào? Đây là tình huống để suy nghĩ, không phải dự báo.", "For example, how would you feel if VND 1 billion temporarily fell to VND 800 million? This is a question, not a forecast.")}</p>
      <p>{t("Bạn có thể bổ sung sau. Để so sánh giới hạn lỗ, hệ thống cần cả số tiền và tỷ lệ bạn khai; không tự suy tỷ lệ từ số tiền.", "You can answer later. Comparing the loss limit requires both your declared amount and percentage; the percentage is not inferred from the amount.")}</p>
      <div className="planning-grid">
        <Input label={t("Mức lỗ chịu được (đồng)", "Affordable loss (VND)")} inputMode="decimal" value={value(data.lossTolerance?.amountVnd)} onChange={v => set({ lossTolerance: { ...data.lossTolerance, amountVnd: answer(v) } })} />
        <Input label={t("Mức lỗ chịu được (%)", "Affordable loss (%)")} inputMode="decimal" value={value(data.lossTolerance?.percent)} onChange={v => set({ lossTolerance: { ...data.lossTolerance, percent: answer(v) } })} />
        <Select label={t("Bạn sẽ phản ứng thế nào?", "How would you react?")} value={value(data.lossTolerance?.reaction)} options={choices([["SELL", "Bán bớt", "Sell"], ["HOLD", "Giữ", "Hold"], ["BUY_MORE", "Mua thêm", "Buy more"]])} onChange={v => set({ lossTolerance: { ...data.lossTolerance, reaction: answer(v as "SELL" | "HOLD" | "BUY_MORE") } })} />
        <Select label={t("Mức phụ thuộc cùng ngành / nơi làm việc", "Dependence on one industry / employer")} value={value(data.employerConcentration)} options={choices([["LOW", "Thấp", "Low"], ["MEDIUM", "Vừa", "Medium"], ["HIGH", "Cao", "High"]])} onChange={v => set({ employerConcentration: answer(v as "LOW" | "MEDIUM" | "HIGH") })} />
      </div>
    </details>
    <details><summary>{t("2. Thu nhập của bạn ổn định đến mức nào?", "2. How stable is your income?")}</summary>
      <Select label={t("Độ ổn định thu nhập", "Income stability")} value={value(data.incomeStability)} options={choices([["STABLE", "Ổn định", "Stable"], ["VARIABLE", "Biến động", "Variable"], ["UNCERTAIN", "Có thể gián đoạn", "Uncertain"]])} onChange={v => set({ incomeStability: answer(v as "STABLE" | "VARIABLE" | "UNCERTAIN") })} />
      <p>{t("Kế hoạch dùng lần lượt 6 / 9 / 12 tháng chi thiết yếu để xác định dự phòng. Chưa trả lời thì chưa xác định dự phòng.", "The plan uses 6 / 9 / 12 months of essential expenses respectively. Without an answer, the reserve remains undetermined.")}</p>
    </details>
    <details><summary>{t("3. Trong 1 / 3 / 5 năm tới, bạn chắc chắn cần bao nhiêu tiền?", "3. How much will you need within 1 / 3 / 5 years?")}</summary>
      <p>{t("Nhập tổng lũy kế theo giá hôm nay: tiền trong 3 năm đã bao gồm tiền trong năm đầu. Đối chiếu với mục tiêu bên dưới để tránh tính hai lần.", "Enter cumulative amounts at today's prices: the three-year amount includes year one. Reconcile with goals below to avoid double counting.")}</p>
      <div className="planning-grid">{([1, 3, 5] as const).map(year => { const key = `y${year}` as const; return <Input key={key} label={t(`Trong ${year} năm (đồng)`, `Within ${year} years (VND)`)} value={value(data.liquidityNeeds?.[key])} inputMode="decimal" onChange={v => set({ liquidityNeeds: { ...data.liquidityNeeds, [key]: answer(v) } })} />; })}</div>
      {inconsistent && <p role="alert">{t("Số tiền lũy kế phải không giảm: 1 năm ≤ 3 năm ≤ 5 năm. Hãy kiểm tra lại trước khi lưu.", "Cumulative amounts must not decrease: 1 year ≤ 3 years ≤ 5 years. Check before saving.")}</p>}
    </details>
    <details><summary>{t("4. Bạn còn mục tiêu nào cần tiền vào một tháng cụ thể?", "4. Do you have other goals with a due month?")}</summary>
      <Select label={t("Mục tiêu khác", "Other goals")} value={!data.goals || data.goals.status === "UNKNOWN" ? "" : data.goals.status === "NOT_APPLICABLE" || goals.length === 0 ? "NONE" : "KNOWN"} options={choices([["NONE", "Không có mục tiêu khác", "No other goals"], ["KNOWN", "Có mục tiêu", "I have goals"]])} onChange={v => set({ goals: v === "" ? unknown : { status: "KNOWN", entries: v === "NONE" ? [] : goals.length ? goals : [{ id: crypto.randomUUID(), label: "", amountToday: unknown, dueMonth: unknown, priority: unknown, deferrable: unknown }] } })} />
      {goals.map((g, i) => <fieldset key={g.id}><legend>{t(`Mục tiêu ${i + 1}`, `Goal ${i + 1}`)}</legend><div className="planning-grid">
        <Input label={t("Tên mục tiêu", "Goal name")} value={g.label ?? ""} onChange={label => updateGoal(g.id, { label })} />
        <Input label={t("Số tiền theo giá hôm nay (đồng)", "Amount at today's prices (VND)")} inputMode="decimal" value={value(g.amountToday)} onChange={v => updateGoal(g.id, { amountToday: answer(v) })} />
        <Input label={t("Tháng cần tiền", "Due month")} type="month" min={valuationMonth} value={value(g.dueMonth)} onChange={v => updateGoal(g.id, { dueMonth: answer(v) })} />
        <Select label={t("Ưu tiên", "Priority")} value={value(g.priority)} options={choices([["ESSENTIAL", "Thiết yếu", "Essential"], ["FLEXIBLE", "Linh hoạt", "Flexible"], ["LEGACY", "Để lại", "Legacy"]])} onChange={v => updateGoal(g.id, { priority: answer(v as "ESSENTIAL" | "FLEXIBLE" | "LEGACY") })} />
        <Select label={t("Có thể hoãn?", "Can this be deferred?")} value={value(g.deferrable)} options={choices([["true", "Có thể hoãn", "Yes"], ["false", "Không thể hoãn", "No"]])} onChange={v => updateGoal(g.id, { deferrable: v === "" ? unknown : { status: "KNOWN", value: v === "true" } })} />
        <Select label={t("Lạm phát của mục tiêu", "Goal inflation")} value={customInflation.includes(g.id) ? "KNOWN" : g.inflation === undefined ? "BASE" : g.inflation.status} options={[{ value: "BASE", label: t("Dùng bộ giả định", "Use pinned assumptions") }, { value: "UNKNOWN", label: t("Chưa biết mức riêng", "Unknown custom rate") }, { value: "KNOWN", label: t("Nhập mức riêng", "Enter custom rate") }]} onChange={v => { setCustomInflation(ids => v === "KNOWN" ? [...ids, g.id] : ids.filter(id => id !== g.id)); const { inflation: _, ...rest } = g; set({ goals: { status: "KNOWN", entries: goals.map(goal => goal.id !== g.id ? goal : v === "BASE" ? rest : { ...rest, inflation: unknown }) } }); }} />
        {(g.inflation?.status === "KNOWN" || customInflation.includes(g.id)) && <Input label={t("Lạm phát riêng (%/năm)", "Custom inflation (%/year)")} inputMode="decimal" value={value(g.inflation)} onChange={v => updateGoal(g.id, { inflation: answer(v) })} />}
      </div><Button variant="secondary" onClick={() => set({ goals: { status: "KNOWN", entries: goals.filter(goal => goal.id !== g.id) } })}>{t("Xóa mục tiêu", "Remove goal")}</Button></fieldset>)}
      <Button variant="secondary" disabled={goals.length >= 200} onClick={() => set({ goals: { status: "KNOWN", entries: [...goals, { id: crypto.randomUUID(), label: "", amountToday: unknown, dueMonth: unknown, priority: unknown, deferrable: unknown }] } })}>{t("Thêm mục tiêu", "Add goal")}</Button>
    </details>
  </section>;
}
