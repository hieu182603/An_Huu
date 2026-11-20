import { useEffect, useState } from "react";
import { financeMoney } from "../utils/financeHubSummary";
import { resolveLossTolerance } from "../utils/lossTolerance";
import type { LossLimitInput } from "../services/allocationWorkspace";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const sharePercent = (v: number) => !Number.isFinite(v) || v <= 0 ? "0" : v >= 100 ? "100"
  : String(v >= 0.1 ? Math.round(v * 10) / 10 : v >= 0.01 ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000);
const QUICK = [5, 10, 15, 20];
type Kind = "PERCENT" | "AMOUNT";

/** Legacy single limits still convert between units. Independent caps require an explicit choice. */
export default function AllocationLossLimit({ growth, amount, percent, inputMode, saving, save, en, error, onFixCapital }: {
  inputMode?: Kind | "BOTH";
  growth: string | null; amount: string | null; percent: string | null; saving: boolean;
  save: (limit: LossLimitInput) => void; en: boolean; error?: string;
  onFixCapital?: () => void;
}) {
  const t = (vi: string, english: string) => en ? english : vi;
  const g = growth === null ? null : Number(growth), positive = g !== null && g > 0;
  const money = (n: number) => financeMoney(String(Math.round(n)), en);
  const resolved = resolveLossTolerance(growth, amount, percent, inputMode);
  const savedAmount = inputMode === "BOTH" ? amount ?? "" : resolved.amount ?? "";
  const savedPercent = inputMode === "BOTH" ? percent ?? "" : resolved.percent === null ? "" : sharePercent(Number(resolved.percent));
  const [both, setBoth] = useState(inputMode === "BOTH");
  const [a, setA] = useState(savedAmount), [pc, setPc] = useState(savedPercent), [last, setLast] = useState<Kind>(resolved.inputMode === "AMOUNT" ? "AMOUNT" : "PERCENT");
  useEffect(() => { setA(savedAmount); setPc(savedPercent); setBoth(inputMode === "BOTH"); setLast(resolved.inputMode === "AMOUNT" ? "AMOUNT" : "PERCENT"); }, [savedAmount, savedPercent, resolved.inputMode, inputMode]);

  const typePercent = (raw: string) => {
    const text = raw.replace(",", ".");
    if (!/^\d{0,3}(\.\d{0,3})?$/.test(text)) return;
    setPc(text); setLast("PERCENT");
    if (!both) setA(positive && text && Number(text) <= 100 ? String(Math.round(g! * Number(text) / 100)) : "");
  };
  const typeAmount = (raw: string) => {
    if (!positive) return;
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);
    setA(digits); setLast("AMOUNT");
    if (!both) setPc(digits ? sharePercent(Math.min(100, Number(digits) / g! * 100)) : "");
  };
  const toggleBoth = (on: boolean) => {
    setBoth(on);
    if (!on) { setLast("PERCENT"); setA(positive && pc && Number(pc) <= 100 ? String(Math.round(g! * Number(pc) / 100)) : ""); }
  };
  const n = Number(a), share = Number(pc), over = positive && (both || last === "AMOUNT") && a !== "" && n > g!;
  const badPercent = pc !== "" && !(share >= 0 && share <= 100);
  const changed = (positive ? a !== savedAmount : false) || pc !== savedPercent || both !== (inputMode === "BOTH");
  const ready = !badPercent && (both ? positive && pc !== "" && a !== "" && !over : last === "AMOUNT" ? positive && a !== "" : pc !== "");
  const capitalNote = g === null
    ? t("Chưa xác định được vốn dài hạn nên chưa quy ra số tiền. Bạn vẫn lưu được mức %; số tiền sẽ tự tính khi hoàn tất bước 1.",
      "Long-term capital is not known yet, so no amount can be shown. You can still save a percentage; the amount appears once step 1 is complete.")
    : !positive ? t("Hiện chưa còn vốn dài hạn: tiền đã khai mới đủ (hoặc chưa đủ) để giữ dự phòng và khoản cần dùng sớm. Bạn vẫn lưu được mức %; số tiền sẽ tự tính khi có vốn dài hạn.",
      "There is no long-term capital yet: declared money only covers (or falls short of) the reserve and near-term needs. You can still save a percentage; the amount appears once there is long-term capital.")
    : null;
  const hint = badPercent ? { kind: "error", text: t("Hãy nhập số từ 0 đến 100, ví dụ 10 hoặc 12,5.", "Enter a share from 0 to 100, for example 10 or 12.5.") }
    : over ? { kind: both ? "error" : "warn", text: both ? t("Giới hạn số tiền riêng không được lớn hơn vốn dài hạn.", "The separate amount limit cannot exceed long-term capital.") : t(`Số tiền lớn hơn toàn bộ vốn dài hạn (${money(g!)}), nên được tính là 100%.`, `The amount exceeds long-term capital (${money(g!)}), so it counts as 100%.`) }
    : null;
  const commit = () => both ? save({ kind: "BOTH", percent: pc.replace(/\.$/, ""), amountVnd: a }) : over ? save({ kind: "PERCENT", value: "100" }) : save({ kind: last, value: last === "PERCENT" ? pc.replace(/\.$/, "") : a });
  // Save when focus leaves the whole group, so moving between the two caps never stores a half-entered pair.
  const commitOnLeave = (e: React.FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && changed && ready && !saving) commit(); };
  const effective = ready ? resolveLossTolerance(growth, a || null, pc || null, both ? "BOTH" : last) : null;

  return <div className="allocation-loss-limit">
    <h3>{t("Nếu quỹ giảm, bạn có thể chấp nhận đến mức nào?", "If the fund falls, how much can you accept?")}</h3>
    <p className="allocation-loss-lead">{both ? t("Bạn khai hai giới hạn độc lập. Hệ thống dùng mức thấp hơn giữa số tiền và phần trăm của vốn dài hạn.", "These are two independent limits. The lower of the amount and percentage of long-term capital applies.") : positive ? t(`Nhập % hoặc số tiền, ô còn lại tự tính theo vốn dài hạn ${money(g!)}. Ví dụ 10% nghĩa là quỹ 100 triệu có thể tạm xuống 90 triệu.`,
      `Enter a percentage or an amount; the other is calculated from long-term capital ${money(g!)}. For example, 10% means 100 million may temporarily drop to 90 million.`)
      : t("Chọn mức giảm tối đa của phần vốn dài hạn mà bạn vẫn giữ được bình tĩnh. Ví dụ 10% nghĩa là quỹ 100 triệu có thể tạm xuống 90 triệu.",
      "Pick the largest temporary fall of your long-term capital you could live with. For example, 10% means 100 million may temporarily drop to 90 million.")}</p>
    <label className="allocation-independent-limit" style={{ display: "inline-flex", flexDirection: "row", alignItems: "center", gap: "8px", margin: "12px 0 16px", cursor: "pointer", userSelect: "none" }}>
      <input
        type="checkbox"
        checked={both}
        disabled={saving || (!positive && !both)}
        onChange={event => toggleBoth(event.target.checked)}
        style={{ width: "18px", height: "18px", minWidth: "18px", maxWidth: "18px", minHeight: "18px", maxHeight: "18px", margin: 0, padding: 0, flexShrink: 0, accentColor: "#245dab", cursor: "pointer" }}
      />
      <span style={{ fontSize: "14px", color: "#132e4c", lineHeight: 1.4, cursor: "pointer" }}>{t("Đặt thêm giới hạn số tiền riêng", "Set a separate amount limit too")}</span>
    </label>
    <div className="allocation-loss-fields" onBlur={commitOnLeave}>
      <label>{t("Theo phần trăm", "As a percentage")}
        <span className="allocation-loss-input"><input type="text" inputMode="decimal" value={pc} placeholder={t("Ví dụ 10", "e.g. 10")} onChange={e => typePercent(e.target.value)} disabled={saving} /><i>%</i></span></label>
      <span className="allocation-loss-equals" aria-hidden="true">{both ? t("và", "and") : "≈"}</span>
      <label>{both ? t("Giới hạn số tiền riêng", "Separate amount limit") : t("Tương đương số tiền", "Equivalent amount")}
        <span className="allocation-loss-input"><input type="text" inputMode="numeric" value={a ? vnd.format(Number(a)) : ""} placeholder={positive ? "" : t("Tự tính khi có vốn dài hạn", "Calculated once capital is known")} onChange={e => typeAmount(e.target.value)} disabled={saving || !positive} /><i>₫</i></span></label>
    </div>
    <div className="allocation-loss-choices" role="group" aria-label={t("Chọn nhanh mức giảm", "Quick choices")}>
      {QUICK.map(x => <button type="button" key={x} className={`allocation-loss-chip${pc === String(x) ? " is-selected" : ""}`} aria-pressed={pc === String(x)} disabled={saving} onClick={() => { typePercent(String(x)); if (!both && !saving && String(x) !== savedPercent) save({ kind: "PERCENT", value: String(x) }); }}>{x}%</button>)}
    </div>
    {capitalNote && <div className="allocation-loss-hint" data-kind="info" role="note"><p>{capitalNote}</p>
      {onFixCapital && <button type="button" className="remaining-text" onClick={onFixCapital}>{t("Xem lại bước 1: Tiền có thể đầu tư →", "Review step 1: Investable money →")}</button>}</div>}
    {hint && <p className="allocation-loss-hint" data-kind={hint.kind} aria-live="polite">{hint.text}</p>}
    {both && effective && <p className="allocation-loss-note">{t("Giới hạn đang áp dụng", "Effective limit")}: {financeMoney(effective.amount, en)}.</p>}
    {error && <p role="alert">{error}</p>}
    {changed && <button type="button" className="overview-button primary" disabled={saving || !ready}
      onClick={commit}>
      {saving ? t("Đang lưu…", "Saving…") : t("Lưu mức giảm", "Save loss limit")}</button>}
    {!changed && savedPercent !== "" && <p className="allocation-loss-saved" role="status">{both ? t(`Đã lưu ${savedPercent.replace(".", ",")}% và giới hạn riêng ${money(Number(savedAmount))}. Áp dụng mức thấp hơn.`, `Saved ${savedPercent}% and a separate ${money(Number(savedAmount))} limit. The lower limit applies.`) : t(`Đã lưu ${savedPercent.replace(".", ",")}%${savedAmount ? ` ≈ ${money(Number(savedAmount))}` : ""}.`, `Saved ${savedPercent}%${savedAmount ? ` ≈ ${money(Number(savedAmount))}` : ""}.`)}</p>}
  </div>;
}
