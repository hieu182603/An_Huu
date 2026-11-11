import { useState, type FormEvent } from "react";
import type { AssetCommand, AssetEntry, ProfileV2 } from "../services/financialProfile";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import { Decimal } from "../utils/decimal";
import { financeMoney } from "../utils/financeHubSummary";
import ProfileFormattedInput from "./ProfileFormattedInput";
import ResponsiveDialog from "./ResponsiveDialog";

const known = (value: string) => ({ status: "KNOWN" as const, value });
const shareKeys = ["ownershipShare", "retirementShare", "emergencyShare", "otherGoalsShare"] as const;
type ShareKey = typeof shareKeys[number];
const basis = (asset: AssetEntry) => ({ ownershipShare: asset.ownershipShare, valuedOn: asset.valuedOn, currency: asset.currency, liquidity: asset.liquidity, availableFromMonth: asset.availableFromMonth });
export default function AssetEntryDialog({ profile, entry, onClose, onSaved }: { profile: ProfileV2; entry?: AssetEntry; onClose: () => void; onSaved: () => void }) {
  const { updateAssets, saveError, reloadProfile } = useFinancialProfile();
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const sources = profile.assets.status === "KNOWN" ? profile.assets.entries.filter(asset => asset.value.status === "KNOWN" && new Decimal(asset.value.value).gt(0) && asset.housingPlan?.status !== "CONFIRMED") : [];
  const [sourceId, setSourceId] = useState(entry ? "" : sources[0]?.id ?? "");
  const source = !entry ? sources.find(asset => asset.id === sourceId) : undefined, split = Boolean(source);
  const [form, setForm] = useState<AssetEntry>(() => entry ?? ({ id: crypto.randomUUID(), label: "", type: "DEPOSIT", value: known(""), currency: "VND", valuedOn: known(profile.valuationDate), ownershipShare: known("1"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0"), liquidity: { status: "KNOWN", value: "LIQUID" }, availableFromMonth: known(profile.valuationDate.slice(0, 7)), ...(sources[0] ? basis(sources[0]) : {}) }));
  const [shares, setShares] = useState(() => Object.fromEntries(shareKeys.map(key => [key, { unknown: form[key].status === "UNKNOWN", text: form[key].status === "KNOWN" ? new Decimal(form[key].value).mul(100).toString() : "" }])) as Record<ShareKey, { unknown: boolean; text: string }>);
  const allocationKeys = ["retirementShare", "emergencyShare", "otherGoalsShare"] as const;
  const singlePurpose = entry && allocationKeys.every(key => entry[key].status === "KNOWN") ? allocationKeys.find(key => { const share = entry[key]; return share.status === "KNOWN" && new Decimal(share.value).toString() === "1"; }) : undefined;
  const initialRole = entry ? entry.type === "PRIMARY_HOME" && singlePurpose === "otherGoalsShare" ? "HOME" : singlePurpose ?? "CUSTOM" : "retirementShare";
  const [role, setRole] = useState(initialRole), [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false), [attempted, setAttempted] = useState(false), [error, setError] = useState("");
  const setField = <K extends keyof AssetEntry>(key: K, value: AssetEntry[K]) => setForm(current => ({ ...current, [key]: value }));
  const chooseRole = (value: string) => {
    setRole(value);
    if (value !== "CUSTOM") {
      setShares(current => ({ ...current, ...Object.fromEntries(["retirementShare", "emergencyShare", "otherGoalsShare"].map(key => [key, { unknown: value === "UNKNOWN", text: value === key || value === "HOME" && key === "otherGoalsShare" ? "100" : "0" }])) }));
      if (value === "HOME") setForm(current => ({ ...current, type: "PRIMARY_HOME", ...(!split ? { liquidity: { status: "KNOWN", value: "ILLIQUID" } as const } : {}) }));
    }
  };
  const chooseSource = (id: string) => {
    setSourceId(id); const selected = sources.find(asset => asset.id === id);
    if (selected) {
      setForm(current => ({ ...current, ...basis(selected) }));
      setShares(current => ({ ...current, ownershipShare: { unknown: selected.ownershipShare.status === "UNKNOWN", text: selected.ownershipShare.status === "KNOWN" ? new Decimal(selected.ownershipShare.value).mul(100).toString() : "" } }));
    }
  };
  const shareInput = (key: ShareKey, label: string) => <div className="asset-share-field"><label>{label}<input aria-label={label} inputMode="decimal" disabled={shares[key].unknown || split && key === "ownershipShare"} value={shares[key].text} onChange={event => setShares(current => ({ ...current, [key]: { ...current[key], text: event.target.value } }))} /></label>
    <label className="cashflow-checkbox"><input type="checkbox" aria-label={`${t("Chưa xác định", "Unknown")}: ${label}`} disabled={split && key === "ownershipShare"} checked={shares[key].unknown} onChange={event => setShares(current => ({ ...current, [key]: { ...current[key], unknown: event.target.checked } }))} />{t("Chưa xác định", "Unknown")}</label></div>;
  const dateInput = (key: "valuedOn" | "availableFromMonth", label: string, type: "date" | "month") => <div><label>{label}<input aria-label={label} type={type} disabled={split || form[key].status === "UNKNOWN"} value={form[key].status === "KNOWN" ? form[key].value : ""} onChange={event => setField(key, known(event.target.value))} /></label><label className="cashflow-checkbox"><input type="checkbox" disabled={split} checked={form[key].status === "UNKNOWN"} onChange={event => setField(key, event.target.checked ? { status: "UNKNOWN" } : known(type === "date" ? profile.valuationDate : profile.valuationDate.slice(0, 7)))} aria-label={`${t("Chưa xác định", "Unknown")}: ${label}`} />{t("Chưa xác định", "Unknown")}</label></div>;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setError(""); setAttempted(false);
    if (!form.label.trim()) { setError(t("Nhập tên để phân biệt tài sản.", "Enter an asset name.")); return; }
    if (form.value.status === "KNOWN" && !/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(form.value.value)) { setError(t("Giá trị phải là số không âm, tối đa 16 chữ số và 2 số thập phân.", "Enter a non-negative value, up to 16 digits and 2 decimal places.")); return; }
    if (form.valuedOn.status === "KNOWN" && !/^\d{4}-\d{2}-\d{2}$/.test(form.valuedOn.value) || form.availableFromMonth.status === "KNOWN" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(form.availableFromMonth.value)) { setError(t("Điền ngày định giá và tháng sử dụng, hoặc đánh dấu chưa xác định.", "Enter the valuation date and availability month, or mark them as unknown.")); return; }
    if (form.costBasis?.status === "KNOWN" && !/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(form.costBasis.value)) { setError(t("Nhập giá vốn không âm hợp lệ, hoặc đánh dấu chưa xác định.", "Enter a valid non-negative cost basis, or mark it as unknown.")); return; }
    const parsedShares = {} as Pick<AssetEntry, ShareKey>;
    for (const key of shareKeys) {
      const value = shares[key], raw = value.text.replace(",", ".");
      if (!value.unknown && (!/^\d+(\.\d{1,6})?$/.test(raw) || new Decimal(raw).gt(100))) { setError(t("Tỷ lệ phải từ 0 đến 100%, tối đa 6 chữ số thập phân.", "Shares must be between 0 and 100%, with up to 6 decimal places.")); return; }
      parsedShares[key] = value.unknown ? { status: "UNKNOWN" } : known(new Decimal(raw).mul("0.01").toString());
    }
    const allocations = [parsedShares.retirementShare, parsedShares.emergencyShare, parsedShares.otherGoalsShare];
    const total = allocations.reduce((sum, value) => value.status === "KNOWN" ? sum.plus(value.value) : sum, new Decimal(0));
    if (total.gt(1) || allocations.every(value => value.status === "KNOWN") && total.toString() !== "1") { setError(t("Tổng phần hưu trí, dự phòng và mục đích khác phải bằng 100%.", "Retirement, emergency and other allocations must total 100%.")); return; }
    if (profile.assets.status === "UNKNOWN" && !confirmed) { setError(t("Xác nhận đã kê đầy đủ danh sách tài sản trước khi lưu.", "Confirm that the asset list is complete before saving.")); return; }
    let next: AssetEntry = { ...form, ...parsedShares, label: form.label.trim() };
    if (source) {
      if (next.value.status !== "KNOWN" || source.value.status !== "KNOWN" || !new Decimal(next.value.value).gt(0) || new Decimal(next.value.value).gt(source.value.value)) { setError(t("Giá trị tách phải lớn hơn 0 và không vượt số còn lại.", "A split must be positive and must not exceed the original asset.")); return; }
      next = { ...next, ...basis(source) };
    }
    const command: AssetCommand = entry ? { kind: "UPDATE", entry: next } : source ? { kind: "SPLIT", sourceId: source.id, entry: next } : { kind: "ADD", entry: next, ...(confirmed ? { confirmUnknownGroup: true } : {}) };
    setSaving(true); setAttempted(true);
    try { if (await updateAssets(command)) { onSaved(); onClose(); } } finally { setSaving(false); }
  };
  const remainder = source?.value.status === "KNOWN" && form.value.status === "KNOWN" && /^\d+(\.\d{1,2})?$/.test(form.value.value) ? new Decimal(source.value.value).minus(form.value.value).toString() : null;
  return <ResponsiveDialog open title={entry ? t("Sửa tài sản", "Edit asset") : t("Thêm tài sản", "Add asset")} className="user-workspace-dialog cashflow-entry-dialog asset-entry-dialog" initialFocusSelector='input[name="asset-label"]' fallbackFocusSelector=".asset-add" onClose={() => { if (!saving) onClose(); }}>
    <form className="cashflow-form asset-form" onSubmit={submit}><fieldset disabled={saving}>
      <label>{t("Khoản này dùng để làm gì?", "What is this asset for?")}<select aria-label={t("Khoản này dùng để làm gì?", "What is this asset for?")} value={role} onChange={event => chooseRole(event.target.value)}><option value="retirementShare">{t("Dành cho nghỉ hưu", "Retirement")}</option><option value="emergencyShare">{t("Quỹ dự phòng", "Emergency reserve")}</option><option value="HOME">{t("Nhà đang ở", "Primary home")}</option><option value="otherGoalsShare">{t("Mục đích khác", "Other purposes")}</option><option value="CUSTOM">{t("Chia cho nhiều mục đích", "Split across purposes")}</option><option value="UNKNOWN">{t("Chưa phân loại", "Unclassified")}</option></select></label>
      <label>{t("Tên tài sản", "Asset name")}<input name="asset-label" required maxLength={120} value={form.label} onChange={event => setField("label", event.target.value)} placeholder={t("Chọn gợi ý bên dưới hoặc tự đặt tên", "Choose a suggestion or enter a name")} /></label>
      <div className="cashflow-suggestions">{[[t("Tiết kiệm", "Savings"), "DEPOSIT", "retirementShare"], [t("Quỹ đầu tư", "Investment fund"), "STOCK_FUND", "retirementShare"], [t("Quỹ dự phòng", "Emergency reserve"), "CASH", "emergencyShare"], [t("Nhà đang ở", "Primary home"), "PRIMARY_HOME", "HOME"]].map(([label, type, purpose]) => <button type="button" key={type} onClick={() => { setForm(current => ({ ...current, label, type: type as AssetEntry["type"] })); chooseRole(purpose); }}>{label}</button>)}</div>
      {!entry && sources.length > 0 && <label>{t("Khoản này đã nằm trong số tổng ban đầu chưa?", "Is this included in an existing asset?")}<select aria-label={t("Khoản này đã nằm trong số tổng ban đầu chưa?", "Is this included in an existing asset?")} value={sourceId} onChange={event => chooseSource(event.target.value)}>{sources.map(asset => <option value={asset.id} key={asset.id}>{t("Tách từ", "Split from")} {asset.label}</option>)}<option value="">{t("Cộng thêm tài sản mới", "Add a new asset")}</option></select><small>{t("Tách giữ nguyên tổng giá trị và phần sở hữu; phần còn lại được tính tự động.", "Splitting preserves total value and ownership; the remainder updates automatically.")}</small></label>}
      {!split && <label className="cashflow-checkbox"><input type="checkbox" checked={form.value.status === "UNKNOWN"} onChange={event => setField("value", event.target.checked ? { status: "UNKNOWN" } : known(""))} />{t("Chưa xác định giá trị", "Value is unknown")}</label>}
      {form.value.status === "KNOWN" && <div data-large-amount={new Decimal(form.value.value || "0").gt(Number.MAX_SAFE_INTEGER) || undefined}><ProfileFormattedInput format="money" label={t("Tổng giá trị tài sản", "Total asset value")} value={form.value.value} onChange={value => setField("value", known(value))} /></div>}
      <label>{t("Loại tài sản", "Asset type")}<select aria-label={t("Loại tài sản", "Asset type")} value={form.type} onChange={event => setField("type", event.target.value as AssetEntry["type"])}>{[["CASH", t("Tiền mặt", "Cash")], ["DEPOSIT", t("Tiền gửi", "Deposit")], ["STOCK_FUND", t("Cổ phiếu / quỹ", "Stocks / funds")], ["GOLD", t("Vàng", "Gold")], ["BOND", t("Trái phiếu", "Bonds")], ["PRIMARY_HOME", t("Nhà đang ở", "Primary home")], ["REAL_ESTATE", t("Bất động sản khác", "Other property")], ["OTHER", t("Tài sản khác", "Other asset")]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <details className="asset-ownership-details" open><summary>{t("Phần sở hữu và thời điểm có thể dùng", "Ownership and availability")}</summary>
        {shareInput("ownershipShare", t("Bạn sở hữu bao nhiêu phần trăm tài sản này?", "Your ownership (%)"))}
        {role === "CUSTOM" && <div className="asset-share-grid">{shareInput("retirementShare", t("Phần dành cho nghỉ hưu (%)", "Retirement allocation (%)"))}{shareInput("emergencyShare", t("Phần dự phòng (%)", "Emergency allocation (%)"))}{shareInput("otherGoalsShare", t("Phần mục đích khác (%)", "Other allocation (%)"))}</div>}
        <p>{t("Các tỷ lệ mục đích tính trên phần sở hữu và cộng lại bằng 100%. Nhà ở và bất động sản chưa chuyển thành tiền không đưa vào quỹ hiện tại.", "Purpose shares apply to your ownership and total 100%. Housing and unrealized property are excluded from current liquid funds.")}</p>
        <div className="cashflow-field-grid"><label>{t("Tiền tệ", "Currency")}<input required disabled={split} value={form.currency} minLength={3} maxLength={3} pattern="[A-Z]{3}" onChange={event => setField("currency", event.target.value.toUpperCase())} /></label><label>{t("Thanh khoản", "Liquidity")}<select aria-label={t("Thanh khoản", "Liquidity")} disabled={split} value={form.liquidity.status === "KNOWN" ? form.liquidity.value : "UNKNOWN"} onChange={event => setField("liquidity", event.target.value === "UNKNOWN" ? { status: "UNKNOWN" } : { status: "KNOWN", value: event.target.value as "LIQUID" | "ILLIQUID" | "LOCKED" })}><option value="LIQUID">{t("Có thể sử dụng", "Liquid")}</option><option value="ILLIQUID">{t("Khó chuyển thành tiền", "Illiquid")}</option><option value="LOCKED">{t("Đang bị khóa", "Locked")}</option><option value="UNKNOWN">{t("Chưa xác định", "Unknown")}</option></select></label>{dateInput("valuedOn", t("Ngày định giá", "Valuation date"), "date")}{dateInput("availableFromMonth", t("Tháng có thể sử dụng", "Available from month"), "month")}</div>
        {split && <p>{t("Giữ sở hữu, tiền tệ, định giá và thanh khoản như khoản gốc để không đổi tổng sở hữu.", "Ownership, currency, valuation and liquidity stay the same as the original asset.")}{source?.costBasis && ` ${t("Giá vốn được chia theo tỷ lệ giá trị, làm tròn đến 2 số thập phân; tổng giá vốn giữ nguyên.", "Cost basis is split proportionally to two decimal places, preserving the total.")}`}</p>}
      </details>
      {!split && <details><summary>{t("Giá vốn và thông tin bổ sung", "Cost basis and additional information")}</summary><label className="cashflow-checkbox"><input type="checkbox" checked={form.costBasis !== undefined} onChange={event => { if (event.target.checked) setField("costBasis", { status: "UNKNOWN" }); else setForm(current => { const { costBasis: _cost, ...rest } = current; return rest; }); }} />{t("Khai giá vốn", "Declare cost basis")}</label>{form.costBasis && <><label className="cashflow-checkbox"><input type="checkbox" checked={form.costBasis.status === "UNKNOWN"} onChange={event => setField("costBasis", event.target.checked ? { status: "UNKNOWN" } : known(""))} />{t("Chưa xác định giá vốn", "Cost basis is unknown")}</label>{form.costBasis.status === "KNOWN" && <ProfileFormattedInput format="money" label={t("Giá vốn", "Cost basis")} value={form.costBasis.value} onChange={value => setField("costBasis", known(value))} />}</>}{form.housingPlan && <p>{t("Giữ phương án nhà ở đã khai. Rà soát ảnh hưởng bán/cho thuê tại trang Kế hoạch.", "Your declared housing plan is retained. Review sale/rental effects on the Plan page.")}</p>}</details>}
      {remainder !== null && <p className="cashflow-split-preview" role="status">{t("Tổng không đổi. Tài sản gốc còn:", "Total unchanged. Original asset remaining:")} <strong>{financeMoney(remainder, en)}</strong></p>}
      {profile.assets.status === "UNKNOWN" && <label className="cashflow-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t("Tôi xác nhận danh sách sau khi lưu đã kê đầy đủ tài sản.", "I confirm the saved list will include all my assets.")}</label>}
    </fieldset>{(error || attempted && saveError) && <div className="cashflow-error" role="alert"><p>{error || saveError}</p>{attempted && saveError && <button type="button" className="overview-button secondary" onClick={() => { onClose(); reloadProfile(); }}>{t("Tải lại hồ sơ", "Reload profile")}</button>}</div>}
    <footer><button type="button" className="cashflow-text-button" disabled={saving} onClick={onClose}>{t("Hủy", "Cancel")}</button><button className="overview-button primary" type="submit" disabled={saving}>{saving ? t("Đang lưu…", "Saving…") : t("Lưu thay đổi", "Save changes")}</button></footer></form>
  </ResponsiveDialog>;
}
