import ProfileMoneyMetrics from "../components/ProfileMoneyMetrics";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import CashflowEntryDialog, { isCashflowReference, type CashflowEntry, type CashflowGroup } from "../components/CashflowEntryDialog";
import ResponsiveDialog from "../components/ResponsiveDialog";
import ProfileFormattedInput from "../components/ProfileFormattedInput";
import { useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useI18n } from "../i18n";
import { financeAmount, financeHubSummary, financeMoney } from "../utils/financeHubSummary";
import { Decimal } from "../utils/decimal";
import { formatMonthVN } from "../utils/date";
import "../components/user-workspace-dialogs.css";
import "./financial-cashflow.css";

type Action = { group: CashflowGroup; entry?: CashflowEntry; remove?: boolean; none?: boolean };
export default function FinancialCashflowPage() {
  const { profile, v2Profile: v2, profileSummary, hasProfile, loading, loadError, profileRevision, saveStatus, saveError, updateProfileV2, updateCashflow, reloadProfile, upgradeToV2 } = useFinancialProfile();
  const { synchronization: sync, currentVersion, previewData, previewStatus, loadingPlans, plansError, refreshPlans, draftSelection, lastPreviewInput, updateDraft } = useRetirementPlan();
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const { notify } = useNotification();
  const money = (value: string | null | undefined) => financeMoney(financeAmount(value), en);
  const values = financeHubSummary(profileSummary, v2, profile);
  const originalStability = v2?.incomeStability?.status === "KNOWN" ? v2.incomeStability.value : "UNKNOWN";
  const [stability, setStability] = useState(originalStability);
  useEffect(() => setStability(originalStability), [originalStability]);
  const [action, setAction] = useState<Action | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false), [reserveInput, setReserveInput] = useState("");
  const [localError, setLocalError] = useState(""), [confirmationBusy, setConfirmationBusy] = useState(false);
  const busy = saveStatus === "saving" || confirmationBusy;
  const candidate = currentVersion ? sync.status === "ready" ? sync.preview : null : previewStatus === "ready" ? previewData : null;
  const draftMatches = !candidate || !draftSelection || Object.entries(draftSelection).every(([key, value]) => JSON.stringify(candidate.selection?.[key as keyof typeof candidate.selection]) === JSON.stringify(value));
  const preview = !loadingPlans && !plansError && draftMatches && candidate?.status === "READY" && candidate.profileRevision === profileRevision && !candidate.reforecast && !candidate.selection?.whatIf ? candidate : null;
  const month = v2?.valuationDate.slice(0, 7);
  const firstRow = preview?.calculation?.rows?.[0];
  const row = firstRow && firstRow.month === month ? firstRow : null;
  const selection = currentVersion?.preview.selection ?? lastPreviewInput ?? previewData?.selection;
  const reserve = financeAmount(draftSelection?.monthlyReserve ?? selection?.monthlyReserve);
  const planPending = Boolean(currentVersion && (!row || sync.status !== "ready"));
  const capacity = row ? financeAmount(row.contributionCapacity) : currentVersion ? null : values.surplus;
  const parts: Array<{ label: string; value: string | null; kind: string }> = row ? [
    { label: t("Sinh hoạt", "Living expenses"), value: financeAmount(row.livingExpense), kind: "spend" },
    { label: t("Trả nợ", "Debt payments"), value: financeAmount(row.debtPayment), kind: "debt" },
    { label: t("Tiền cho việc khác và mục tiêu", "Other reserves and goals"), value: financeAmount(row.additionalExpense), kind: "reserve" },
    ...(row.advisoryFeePaidFrom === "EXTERNAL" ? [{ label: t("Phí trả ngoài quỹ", "Fees paid outside the fund"), value: financeAmount(row.advisoryFeeAmount), kind: "debt" }] : []),
    { label: t("Góp quỹ hưu", "Retirement contribution"), value: financeAmount(row.contribution), kind: "fund" },
    { label: t("Còn dư", "Unallocated surplus"), value: financeAmount(row.uninvestedSurplus), kind: "free" },
  ] : [
    { label: t("Sinh hoạt", "Living expenses"), value: values.expenses, kind: "spend" },
    { label: t("Trả nợ", "Debt payments"), value: values.debtPayment, kind: "debt" },
    { label: t("Phần dư trước phân bổ", "Surplus before allocation"), value: values.surplus, kind: "free" },
  ];
  const resources = row ? new Decimal(row.income).plus(row.pension).toString() : values.income;
  const positiveParts = parts.map(part => part.value !== null && new Decimal(part.value).gt(0) ? part.value : "0");
  const sum = positiveParts.reduce((total, value) => total.plus(value), new Decimal(0));
  const denominator = resources !== null && new Decimal(resources).gt(sum) ? new Decimal(resources) : sum;
  const chartKnown = resources !== null && parts.every(part => part.value !== null);
  const needsWithdrawal = Boolean(row && new Decimal(row.withdrawal).gt(0));
  const budgetStatus = row ? needsWithdrawal ? t("Cần bù từ quỹ", "Fund withdrawal needed") : t("Thu chi cân đối", "Balanced cashflow")
    : values.surplus === null ? t("Chưa đủ dữ liệu", "Incomplete data") : values.surplus.startsWith("-") ? t("Ngân sách đang thiếu", "Budget shortfall") : t("Thu chi cân đối", "Balanced cashflow");
  const showSuccess = () => notify.success(t("Đã lưu", "Saved"), t("Đã cập nhật hồ sơ và số tổng. Kế hoạch chính chưa được áp dụng lại.", "Profile and totals updated. Your main plan has not been reapplied."));
  const confirmAction = async () => {
    if (!action || confirmationBusy) return; setConfirmationBusy(true);
    try {
      const success = await updateCashflow(action.none
        ? { kind: "CONFIRM_NONE", group: action.group, reason: t("Đã xác nhận không có khoản trong nhóm này", "Confirmed no items in this group") }
        : { kind: "DELETE", group: action.group, id: action.entry!.id });
      if (success) { setAction(null); showSuccess(); }
    } finally { setConfirmationBusy(false); }
  };
  const saveStability = async (event: FormEvent) => {
    event.preventDefault();
    if (await updateProfileV2({ incomeStability: stability === "UNKNOWN" ? { status: "UNKNOWN" } : { status: "KNOWN", value: stability as "STABLE" | "VARIABLE" | "UNCERTAIN" } })) showSuccess();
  };
  const saveReserve = (event: FormEvent) => {
    event.preventDefault(); setLocalError("");
    if (!/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(reserveInput)) { setLocalError(t("Nhập số tiền không âm hợp lệ, tối đa 16 chữ số và 2 số thập phân.", "Enter a valid non-negative amount, up to 16 digits and 2 decimal places.")); return; }
    try { updateDraft({ monthlyReserve: reserveInput }); setReserveOpen(false); notify.success(t("Đã cập nhật bản nháp", "Draft updated"), t("Mở kế hoạch để xem lại, lưu và áp dụng khi sẵn sàng.", "Open your plan to review, save and apply when ready.")); }
    catch { setLocalError(t("Chưa lưu được bản nháp trên trình duyệt. Hãy thử lại.", "Could not save the browser draft. Please retry.")); }
  };
  const ledger = (group: CashflowGroup) => {
    const collection = v2![group], items = collection.status === "KNOWN" ? collection.entries : [];
    const label = group === "income" ? t("Nguồn thu", "Income sources") : t("Khoản chi", "Expenses");
    return <section className="cashflow-card cashflow-ledger" aria-labelledby={`cashflow-${group}`}>
      <header><h2 id={`cashflow-${group}`}>{label}</h2><span className="cashflow-count">{items.length} {t("mục", "items")}</span></header>
      <p>{group === "income" ? t("Lương sau thuế, kinh doanh, cho thuê hoặc nguồn thu khác. Khi thêm khoản, chọn tách từ khoản đã nhập hoặc cộng mới.", "Net salary, business, rent or other income. Split an existing item or add a new one.") : t("Tách chi phí sinh hoạt; không nhập tiền trả nợ ở đây. Khi thêm khoản, chọn tách từ khoản đã nhập hoặc cộng mới.", "List living expenses here. Manage debt payments on the debt page. Split an existing item or add a new one.")}</p>
      {!items.length && <div className="cashflow-empty"><strong>{collection.status === "UNKNOWN" ? t("Chưa xác định", "Unknown") : t("Chưa có khoản nào", "No items")}</strong><p>{collection.status === "NOT_APPLICABLE" ? collection.reason : collection.status === "UNKNOWN" ? t("Kê đầy đủ các khoản bạn biết hoặc xác nhận không có.", "List all known items or confirm there are none.") : t("Danh sách đã kê trống: tổng bằng 0.", "The declared list is empty: the total is zero.")}</p>
        {collection.status === "UNKNOWN" && <button className="cashflow-text-button" disabled={busy} onClick={() => setAction({ group, none: true })}>{t("Xác nhận không có", "Confirm none")}</button>}</div>}
      <ul>{items.map(item => {
        const reference = isCashflowReference(item), active = item.startMonth <= month! && (!item.endMonth || item.endMonth >= month!);
        return <li key={item.id} data-entry-id={item.id}><div><strong>{item.label}</strong><p>{item.frequency === "ONCE" ? t("Một lần", "Once") : t("Theo tháng", "Monthly")} · {formatMonthVN(item.startMonth)}{item.endMonth ? ` – ${formatMonthVN(item.endMonth)}` : t(" trở đi", " onward")}{!active && <span className="cashflow-inactive"> · {t("Ngoài kỳ hồ sơ", "Outside valuation period")}</span>}</p>{reference && <Link to={group === "income" ? "/user/profile?section=insurance" : "/user/debts"}>{t("Quản lý ở trang liên kết", "Manage on the linked page")}</Link>}</div>
          <strong>{item.currency === "VND" ? money(item.amount.status === "KNOWN" ? item.amount.value : null) : item.amount.status === "KNOWN" ? `${item.amount.value} ${item.currency}` : t("Chưa xác định", "Undetermined")}</strong>
          {!reference && <div className="cashflow-row-actions"><button disabled={busy} onClick={() => setAction({ group, entry: item })} aria-label={`${t("Sửa", "Edit")} ${item.label}`}>{t("Sửa", "Edit")}</button><button disabled={busy} onClick={() => setAction({ group, entry: item, remove: true })} aria-label={`${t("Xóa", "Delete")} ${item.label}`}>{t("Xóa", "Delete")}</button></div>}
        </li>;
      })}</ul>
      <div className="cashflow-total"><strong>{group === "income" ? t("Tổng thu và lương hưu trong kỳ", "Current income and pension") : t("Tổng chi sinh hoạt trong kỳ", "Current living expenses")}</strong><strong>{money(group === "income" ? values.income : values.expenses)}</strong></div>
      <button type="button" className="overview-button secondary cashflow-add" disabled={busy} onClick={() => setAction({ group })}>{group === "income" ? t("＋ Thêm nguồn thu", "+ Add income") : t("＋ Thêm khoản chi", "+ Add expense")}</button>
    </section>;
  };
  return <div className="financial-cashflow-page">
    <nav aria-label={t("Đường dẫn trang", "Breadcrumb")} className="cashflow-breadcrumb"><Link className="overview-button secondary" to="/user/profile">{t("← Tài chính của bạn", "← Your finances")}</Link><span aria-hidden="true">/</span><span aria-current="page">{t("Thu nhập & chi tiêu", "Income & expenses")}</span></nav>
    <header className="cashflow-heading"><h1>{t("Thu nhập & chi tiêu", "Income & expenses")}</h1><p>{t("Kê từng khoản nếu bạn muốn. Thông tin được cập nhật vào bản xem trước; kế hoạch đang áp dụng giữ nguyên.", "List individual items if you wish. Changes update your preview; your applied plan stays unchanged.")}</p></header>
    {loading ? <p role="status">{t("Đang tải hồ sơ…", "Loading profile…")}</p> : loadError ? <p role="status">{t("Số liệu tạm ẩn cho đến khi tải lại hồ sơ thành công.", "Figures are hidden until your profile reloads successfully.")}</p> : !hasProfile ? <section className="cashflow-card"><h2>{t("Bạn chưa có hồ sơ tài chính", "Start your financial profile")}</h2><Link to="/onboarding" className="overview-button primary">{t("Khai báo hồ sơ", "Create profile")}</Link></section> : !v2 ? <section className="cashflow-card"><h2>{t("Kê chi tiết từ hồ sơ hiện có", "Itemize your existing profile")}</h2><p>{t("Nâng cấp để giữ các số đã khai và quản lý từng khoản thu chi.", "Upgrade to keep your declared totals and manage individual items.")}</p><button className="overview-button primary" disabled={busy} onClick={() => void upgradeToV2()}>{t("Nâng cấp hồ sơ chi tiết", "Upgrade profile")}</button>{saveError && <p role="alert">{saveError}</p>}</section> : <>
      {saveError && !action && <div className="cashflow-error" role="alert"><p>{saveError}</p><button className="overview-button secondary" onClick={reloadProfile}>{t("Tải lại hồ sơ", "Reload profile")}</button></div>}
      {plansError && <div className="cashflow-error" role="alert"><p>{plansError}</p><button className="overview-button secondary" onClick={() => void refreshPlans()}>{t("Tải lại kế hoạch", "Reload plan")}</button></div>}
      <ProfileMoneyMetrics />
      <section className="cashflow-card cashflow-budget" aria-labelledby="cashflow-budget-title">
        <header><div><p className="cashflow-period">{row ? t("Dòng tiền dự phóng tháng", "Projected cashflow for") : t("Dòng tiền hồ sơ tháng", "Profile cashflow for")} {formatMonthVN(month!)}</p><h2 id="cashflow-budget-title">{t("Tiền của bạn được dùng thế nào?", "Where does your money go?")}</h2></div><span className={`cashflow-budget-status ${needsWithdrawal || values.surplus?.startsWith("-") ? "is-negative" : ""}`}>{budgetStatus}</span></header>
        <div className="cashflow-budget-layout"><div><div className="cashflow-budget-income"><span>{t("Thu nhập và lương hưu", "Income and pension")}</span><strong>{money(resources)}</strong></div>
          <div className={`cashflow-budget-bar ${!chartKnown ? "is-unknown" : ""}`} role="img" aria-label={chartKnown ? parts.map(part => `${part.label}: ${money(part.value)}`).join("; ") : t("Chưa đủ dữ liệu để phân bổ dòng tiền", "Not enough data to allocate cashflow")}>{chartKnown && !denominator.isZero() && parts.map((part, index) => <span key={part.label} className={`budget-${part.kind}`} style={{ width: `${Number(positiveParts[index]) / Number(denominator.toString()) * 100}%` }} />)}</div>
          <dl className="cashflow-budget-legend">{parts.map(part => <div key={part.label}><dt><i className={`budget-${part.kind}`} />{part.label}</dt><dd>{money(part.value)}</dd></div>)}</dl>
          {!row && <p className="cashflow-budget-note">{t("Số tổng từ hồ sơ, trước tiền giữ lại và góp nghỉ hưu. Khoản một lần chỉ tính trong tháng phát sinh.", "Profile totals before reserves and retirement contributions. One-time items count only in their scheduled month.")}</p>}
        </div><aside className="cashflow-budget-focus"><span>{row ? t("Có thể dành cho nghỉ hưu", "Retirement contribution capacity") : currentVersion ? t("Khả năng góp đang cập nhật", "Updating contribution capacity") : t("Phần dư trước phân bổ", "Surplus before allocation")}</span><strong>{money(capacity)}<small>{t("/tháng", "/month")}</small></strong>
          <dl><div><dt>{t("Mức góp đang chọn", "Selected contribution")}</dt><dd>{money(draftSelection?.monthlyContribution ?? selection?.monthlyContribution)}</dd></div><div><dt>{t("Thực góp trong dự phóng", "Projected contribution")}</dt><dd>{money(row?.contribution)}</dd></div></dl>
          {row && new Decimal(row.budgetShortfall).gt(0) && <p className="cashflow-warning">{money(row.budgetShortfall)} {t("vượt ngân sách, chưa được đưa vào quỹ.", "exceeds the budget and is not added to the fund.")}</p>}
          {row && new Decimal(row.withdrawal).gt(0) && <p className="cashflow-warning">{t("Cần rút", "Withdrawal needed:")} {money(row.withdrawal)}{new Decimal(row.unfundedWithdrawal).gt(0) && ` · ${t("còn thiếu", "unfunded")} ${money(row.unfundedWithdrawal)}`}</p>}
          {planPending && <p role="status">{sync.error ?? t("Đang chờ dự phóng hợp lệ cho hồ sơ mới; số liệu cũ được tạm ẩn.", "Waiting for a valid preview for the updated profile; old figures are hidden.")}{sync.status === "error" && <button type="button" className="cashflow-text-button" onClick={sync.retry}>{t("Thử lại dự phóng", "Retry preview")}</button>}</p>}
          <Link className="overview-button secondary" to="/user/plan">{t("Điều chỉnh mức góp →", "Adjust contribution →")}</Link></aside></div>
      </section>
      <div className="cashflow-ledgers">{ledger("income")}{ledger("expenses")}</div>
      <section className="cashflow-card"><h2>{t("Độ ổn định thu nhập", "Income stability")}</h2><form className="cashflow-form" onSubmit={saveStability}><label htmlFor="cashflow-stability">{t("Thu nhập của bạn thường thế nào? (không bắt buộc)", "How stable is your income? (optional)")}</label><select id="cashflow-stability" value={stability} disabled={busy} onChange={event => setStability(event.target.value)}><option value="UNKNOWN">{t("Chưa xác định", "Unknown")}</option><option value="STABLE">{t("Khá ổn định", "Stable")}</option><option value="VARIABLE">{t("Có biến động", "Variable")}</option><option value="UNCERTAIN">{t("Có thể gián đoạn", "May be interrupted")}</option></select><footer><button type="button" className="cashflow-text-button" disabled={busy} onClick={() => setStability(originalStability)}>{t("Hủy", "Cancel")}</button><button className="overview-button primary" disabled={busy || stability === originalStability}>{busy ? t("Đang lưu…", "Saving…") : t("Lưu thông tin thu nhập", "Save income information")}</button></footer></form></section>
      <section className="cashflow-card"><h2>{t("Tiền dành cho việc khác mỗi tháng", "Monthly reserve for other needs")}</h2><div className="cashflow-total"><span>{t("Đang để riêng trong bản kế hoạch:", "Reserved in the plan:")}</span><strong data-testid="cashflow-reserve">{money(reserve)}</strong></div><p>{t("Khoản này thuộc bản nháp kế hoạch và làm giảm khả năng góp quỹ hưu. Xem lại, lưu rồi áp dụng tại trang Kế hoạch; không cộng vào chi sinh hoạt hoặc quỹ dự phòng hiện có.", "This belongs to the plan draft and reduces contribution capacity. Review, save and apply it on the Plan page; it is separate from living expenses and existing emergency savings.")}</p><button className="overview-button secondary" disabled={busy} onClick={() => { setReserveInput(reserve ?? ""); setLocalError(""); setReserveOpen(true); }}>{t("Điều chỉnh tiền dành cho việc khác", "Adjust monthly reserve")}</button></section>
      <Link className="overview-button secondary" to="/user/profile">{t("← Quay lại Tài chính của bạn", "← Back to your finances")}</Link>
    </>}
    {v2 && action && !action.remove && !action.none && <CashflowEntryDialog key={`${action.group}-${action.entry?.id ?? "new"}`} profile={v2} group={action.group} entry={action.entry} onClose={() => setAction(null)} onSaved={showSuccess} />}
    <ResponsiveDialog open={Boolean(action?.remove || action?.none)} title={action?.none ? t("Xác nhận không có khoản nào", "Confirm no items") : t("Xóa khoản đã khai?", "Delete this item?")} className="user-workspace-dialog cashflow-confirm-dialog" onClose={() => { if (!busy) setAction(null); }} fallbackFocusSelector=".cashflow-add">
      <p>{action?.none ? t("Nhóm này sẽ được ghi nhận là không có, tổng bằng 0.", "This group will be confirmed as having no items, with a zero total.") : `${t("Xóa", "Delete")} “${action?.entry?.label ?? ""}”? ${t("Số tổng và bản xem trước sẽ được tính lại; kế hoạch chính giữ nguyên.", "Totals and the preview will be recalculated; your main plan stays unchanged.")}`}</p>
      {saveError && <div role="alert" className="cashflow-error"><p>{saveError}</p><button className="overview-button secondary" onClick={() => { setAction(null); reloadProfile(); }}>{t("Tải lại hồ sơ", "Reload profile")}</button></div>}
      <footer><button className="overview-button secondary" disabled={busy} onClick={() => setAction(null)}>{t("Hủy", "Cancel")}</button><button className="overview-button primary" disabled={busy} onClick={() => void confirmAction()}>{busy ? t("Đang lưu…", "Saving…") : action?.none ? t("Xác nhận", "Confirm") : t("Xóa khoản", "Delete item")}</button></footer>
    </ResponsiveDialog>
    <ResponsiveDialog open={reserveOpen} title={t("Tiền dành cho việc khác mỗi tháng", "Monthly reserve for other needs")} className="user-workspace-dialog cashflow-entry-dialog" onClose={() => setReserveOpen(false)}>
      <form className="cashflow-form" onSubmit={saveReserve}><ProfileFormattedInput label={t("Số tiền mỗi tháng (VND)", "Monthly amount (VND)")} format="money" value={reserveInput} onChange={setReserveInput} /><p>{t("Cập nhật bản nháp trên trình duyệt; mở kế hoạch để xem lại, lưu và áp dụng. Kế hoạch chính chưa thay đổi.", "Update the browser draft, then open the plan to review, save and apply. Your main plan is unchanged.")}</p>{localError && <p role="alert" className="cashflow-error">{localError}</p>}<footer><button type="button" className="cashflow-text-button" onClick={() => setReserveOpen(false)}>{t("Hủy", "Cancel")}</button><button className="overview-button primary">{t("Cập nhật bản nháp", "Update draft")}</button></footer></form>
    </ResponsiveDialog>
  </div>;
}
