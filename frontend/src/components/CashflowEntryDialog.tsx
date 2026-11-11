import { useState, type FormEvent } from "react";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import type { CashflowCommand, ExpenseEntry, IncomeEntry, ProfileV2 } from "../services/financialProfile";
import { Decimal } from "../utils/decimal";
import { financeMoney } from "../utils/financeHubSummary";
import ProfileFormattedInput from "./ProfileFormattedInput";
import ResponsiveDialog from "./ResponsiveDialog";

export type CashflowGroup = "income" | "expenses";
export type CashflowEntry = IncomeEntry | ExpenseEntry;
export const isCashflowReference = (entry: CashflowEntry) => ("source" in entry && entry.source === "PENSION") || ("category" in entry && entry.category === "DEBT_PAYMENT");

export default function CashflowEntryDialog({ group, entry, profile, onClose, onSaved }: {
  group: CashflowGroup; entry?: CashflowEntry; profile: ProfileV2; onClose: () => void; onSaved: () => void;
}) {
  const { updateCashflow, saveError, reloadProfile } = useFinancialProfile();
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const collection = profile[group];
  const sources = collection.status === "KNOWN" ? collection.entries.filter(item => item.amount.status === "KNOWN" && !isCashflowReference(item)) : [];
  const [sourceId, setSourceId] = useState(entry ? "" : sources[0]?.id ?? "");
  const source = sources.find(item => item.id === sourceId);
  const [label, setLabel] = useState(entry?.label ?? "");
  const [amount, setAmount] = useState(entry?.amount.status === "KNOWN" ? entry.amount.value : "");
  const [unknown, setUnknown] = useState(entry?.amount.status === "UNKNOWN");
  const [category, setCategory] = useState(entry ? ("category" in entry ? entry.category : entry.kind) : group === "income" ? "FIXED" : "ESSENTIAL");
  const [incomeSource, setIncomeSource] = useState(entry && "source" in entry ? entry.source ?? "EMPLOYMENT" : "EMPLOYMENT");
  const [currency, setCurrency] = useState(entry?.currency ?? "VND");
  const [frequency, setFrequency] = useState<"MONTHLY" | "ONCE">(entry?.frequency ?? "MONTHLY");
  const [start, setStart] = useState(entry?.startMonth ?? profile.valuationDate.slice(0, 7));
  const [end, setEnd] = useState(entry?.endMonth ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [id] = useState(entry?.id ?? crypto.randomUUID());
  const split = !entry && Boolean(source), chosenFrequency = split ? source!.frequency : frequency;
  const chosenStart = split ? source!.startMonth : start, chosenEnd = split ? source!.endMonth ?? "" : end;
  const remainder = split && source!.amount.status === "KNOWN" && /^\d+(\.\d{1,2})?$/.test(amount)
    ? new Decimal(source!.amount.value).minus(amount).toString() : null;
  const suggestions = group === "income" ? [t("Lương sau thuế", "Net salary"), t("Kinh doanh", "Business"), t("Cho thuê", "Rent"), t("Thu nhập khác", "Other income")]
    : [t("Ăn uống", "Food"), t("Nhà ở", "Housing"), t("Đi lại", "Transport"), t("Y tế", "Health"), t("Gia đình", "Family")];
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return;
    setError(""); setAttempted(false);
    if (!label.trim()) { setError(t("Nhập tên để phân biệt khoản này.", "Enter a name for this item.")); return; }
    if ((!unknown || split) && !/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(amount)) { setError(t("Nhập số tiền không âm, tối đa 16 chữ số và 2 số thập phân.", "Enter a non-negative amount with up to 16 digits and 2 decimal places.")); return; }
    if (!chosenStart || (chosenEnd && chosenEnd < chosenStart)) { setError(t("Tháng kết thúc phải từ tháng bắt đầu trở đi.", "End month must be on or after the start month.")); return; }
    if (remainder?.startsWith("-")) { setError(t("Khoản tách vượt số còn lại. Giảm số tiền hoặc chọn cộng khoản mới.", "The split exceeds the remaining amount. Reduce it or add a new item.")); return; }
    if (collection.status === "UNKNOWN" && !confirmed) { setError(t("Xác nhận đã kê đầy đủ nhóm này trước khi lưu.", "Confirm that this group is complete before saving.")); return; }
    const base = { id, label: label.trim(), currency: split ? source!.currency : currency,
      amount: unknown && !split ? { status: "UNKNOWN" as const } : { status: "KNOWN" as const, value: amount },
      frequency: chosenFrequency, startMonth: chosenStart, endMonth: chosenFrequency === "ONCE" ? chosenStart : chosenEnd || null };
    const operation = { kind: entry ? "UPDATE" as const : split ? "SPLIT" as const : "ADD" as const,
      ...(split ? { sourceId } : {}), ...(confirmed ? { confirmUnknownGroup: true } : {}) };
    const command: CashflowCommand = group === "income"
      ? { ...operation, group, entry: { ...base, basis: "DISPOSABLE", source: incomeSource, kind: category as IncomeEntry["kind"] } }
      : { ...operation, group, entry: { ...base, category: category as ExpenseEntry["category"] } };
    setSaving(true); setAttempted(true);
    try { if (await updateCashflow(command)) { onSaved(); onClose(); } } finally { setSaving(false); }
  };
  return <ResponsiveDialog open title={entry ? t("Sửa khoản đã khai", "Edit item") : group === "income" ? t("Thêm nguồn thu", "Add income") : t("Thêm khoản chi", "Add expense")}
    className="user-workspace-dialog cashflow-entry-dialog" onClose={() => { if (!saving) onClose(); }} initialFocusSelector='input[name="cashflow-label"]' fallbackFocusSelector=".cashflow-add">
    <form className="cashflow-form" onSubmit={submit}>
      <fieldset disabled={saving}>
        <label>{t("Tên khoản", "Item name")}<input name="cashflow-label" required maxLength={120} value={label} onChange={event => setLabel(event.target.value)} placeholder={t("Chọn gợi ý bên dưới hoặc tự đặt tên", "Choose a suggestion or enter a name")} /></label>
        <div className="cashflow-suggestions">{suggestions.map((suggestion, index) => <button key={suggestion} type="button" onClick={() => { setLabel(suggestion); if (group === "income") { setIncomeSource(index === 0 ? "EMPLOYMENT" : "OTHER"); setCategory("FIXED"); } else setCategory(index === 3 ? "HEALTH" : index === 4 ? "DEPENDENT" : "ESSENTIAL"); }}>{suggestion}</button>)}</div>
        {!entry && sources.length > 0 && <label>{t("Khoản này đã nằm trong số tổng ban đầu chưa?", "Is this already included in a declared item?")}<select aria-label={t("Khoản này đã nằm trong số tổng ban đầu chưa?", "Is this already included in a declared item?")} value={sourceId} onChange={event => { setSourceId(event.target.value); setUnknown(false); }}>
          {sources.map(item => <option key={item.id} value={item.id}>{t("Tách từ", "Split from")} {item.label}</option>)}<option value="">{t("Cộng thêm khoản mới", "Add as new income or expense")}</option>
        </select><small>{t("Tách khoản giữ nguyên tổng và lịch của khoản gốc; cộng mới làm thay đổi tổng.", "Splitting preserves the original total and schedule; a new item changes the total.")}</small></label>}
        {!split && <label className="cashflow-checkbox"><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} />{t("Chưa xác định số tiền", "Amount is unknown")}</label>}
        {!unknown && <div data-large-amount={new Decimal(amount || "0").gt(Number.MAX_SAFE_INTEGER) || undefined}><ProfileFormattedInput label={chosenFrequency === "ONCE" ? t("Số tiền một lần", "One-time amount") : t("Số tiền mỗi tháng", "Monthly amount")} format="money" value={amount} onChange={setAmount} /></div>}
        <label>{group === "income" ? t("Loại thu nhập", "Income type") : t("Nhóm chi tiêu", "Expense category")}<select value={category} onChange={event => setCategory(event.target.value as typeof category)}>
          {(group === "income" ? [["FIXED", t("Định kỳ", "Regular")], ["BONUS", t("Thưởng", "Bonus")], ["IRREGULAR", t("Không đều", "Irregular")]] : [["ESSENTIAL", t("Thiết yếu", "Essential")], ["OPTIONAL", t("Linh hoạt", "Optional")], ["HEALTH", t("Y tế", "Health")], ["INSURANCE", t("Bảo hiểm", "Insurance")], ["DEPENDENT", t("Người phụ thuộc", "Dependents")]]).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>
        {group === "income" && <label>{t("Nguồn thu", "Income source")}<select value={incomeSource} onChange={event => setIncomeSource(event.target.value as typeof incomeSource)}><option value="EMPLOYMENT">{t("Việc làm", "Employment")}</option><option value="OTHER">{t("Nguồn khác", "Other")}</option></select><small>{t("Nhập phần sau thuế thuộc về bạn. Lương hưu được khai ở trang BHXH.", "Enter your net share. Declare pensions on the pension page.")}</small></label>}
        <details open={Boolean(entry)}><summary>{t("Thời gian và tần suất", "Dates and frequency")}</summary>
          {split && <p>{t("Giữ cùng thời gian và tiền tệ với khoản gốc để không thay đổi dòng tiền.", "The split keeps the original dates and currency to preserve cashflow.")}</p>}
          <div className="cashflow-field-grid"><label>{t("Tần suất", "Frequency")}<select disabled={split} value={chosenFrequency} onChange={event => setFrequency(event.target.value as typeof frequency)}><option value="MONTHLY">{t("Hàng tháng", "Monthly")}</option><option value="ONCE">{t("Một lần", "Once")}</option></select></label>
            <label>{t("Tiền tệ", "Currency")}<input disabled={split} value={split ? source!.currency : currency} required minLength={3} maxLength={3} pattern="[A-Z]{3}" onChange={event => setCurrency(event.target.value.toUpperCase())} /></label>
            <label>{t("Tháng bắt đầu", "Start month")}<input type="month" required disabled={split} value={chosenStart} onChange={event => setStart(event.target.value)} /></label>
            {chosenFrequency === "MONTHLY" && <label>{t("Tháng kết thúc (không bắt buộc)", "End month (optional)")}<input type="month" disabled={split} min={chosenStart} value={chosenEnd} onChange={event => setEnd(event.target.value)} /></label>}
          </div>
        </details>
        {remainder !== null && <p className="cashflow-split-preview" role="status">{t("Tổng không đổi. Khoản gốc còn:", "Total unchanged. Original item remaining:")} <strong>{financeMoney(remainder, en)}</strong></p>}
        {collection.status === "UNKNOWN" && <label className="cashflow-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t("Tôi xác nhận danh sách sau khi lưu đã kê đầy đủ nhóm này.", "I confirm this group's list will be complete after saving.")}</label>}
      </fieldset>
      {(error || attempted && saveError) && <div className="cashflow-error" role="alert"><p>{error || saveError}</p>{attempted && saveError && <button type="button" className="overview-button secondary" onClick={() => { onClose(); reloadProfile(); }}>{t("Tải lại hồ sơ", "Reload profile")}</button>}</div>}
      <footer><button type="button" className="cashflow-text-button" disabled={saving} onClick={onClose}>{t("Hủy", "Cancel")}</button><button type="submit" className="overview-button primary" disabled={saving}>{saving ? t("Đang lưu…", "Saving…") : t("Lưu thay đổi", "Save changes")}</button></footer>
    </form>
  </ResponsiveDialog>;
}
