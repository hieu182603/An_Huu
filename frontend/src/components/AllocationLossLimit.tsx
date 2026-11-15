import { useEffect, useState } from "react";
import { financeMoney } from "../utils/financeHubSummary";
import { resolveLossTolerance } from "../utils/lossTolerance";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
// Same rounding ladder as the demo: one decimal normally, more only for very small shares.
const sharePercent = (v: number) => !Number.isFinite(v) || v <= 0 ? "0" : v >= 100 ? "100"
  : String(v >= 0.1 ? Math.round(v * 10) / 10 : v >= 0.01 ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000);

type Kind = "PERCENT" | "AMOUNT";
/** Loss limit as an amount and a share of long-term capital, kept in step like the demo.
 *  The server stores both values from whichever one was typed last. */
export default function AllocationLossLimit({ growth, amount, percent, inputMode, saving, save, en, error }: {
  inputMode?: Kind;
  growth: string | null; amount: string | null; percent: string | null; saving: boolean;
  save: (kind: Kind, value: string) => void; en: boolean; error?: string;
}) {
  const t = (vi: string, english: string) => en ? english : vi;
  const g = growth === null ? 0 : Number(growth), money = (n: number) => financeMoney(String(Math.round(n)), en);
  const resolved = resolveLossTolerance(growth, amount, percent, inputMode);
  const savedAmount = resolved.amount ?? "";
  const savedPercent = resolved.percent === null ? "" : sharePercent(Number(resolved.percent));
  const [a, setA] = useState(savedAmount), [pc, setPc] = useState(savedPercent), [last, setLast] = useState<Kind>(resolved.inputMode);
  useEffect(() => { setA(savedAmount); setPc(savedPercent); setLast(resolved.inputMode); }, [savedAmount, savedPercent, resolved.inputMode]);

  const typeAmount = (raw: string) => {
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);
    setA(digits); setLast("AMOUNT");
    if (g > 0) setPc(digits ? sharePercent(Math.min(100, Number(digits) / g * 100)) : "");
  };
  const typePercent = (raw: string) => {
    const text = raw.replace(",", ".");
    if (!/^\d{0,3}(\.\d{0,3})?$/.test(text)) return;
    setPc(text); setLast("PERCENT");
    if (g > 0) setA(text && Number(text) <= 100 ? String(Math.round(g * Number(text) / 100)) : "");
  };

  const n = Number(a), share = Number(pc), over = last === "AMOUNT" && a !== "" && n > g;
  const badPercent = pc !== "" && !(share >= 0 && share <= 100);
  const changed = a !== savedAmount || pc !== savedPercent, ready = g > 0 && a !== "" && pc !== "" && !badPercent;
  const hint = !(g > 0) ? { kind: "error", text: t("Chưa tự tính được. Vốn dài hạn đang bằng 0 vì số tiền đã khai chưa đủ để giữ quỹ dự phòng và tiền cho mục tiêu gần hạn.", "Cannot calculate yet. Long-term capital is zero after the emergency reserve and near-term goals.") }
    : badPercent ? { kind: "error", text: t("Mức giảm tối đa là 100% vốn dài hạn. Hãy nhập số từ 0 đến 100, ví dụ 10 hoặc 12,5.", "Enter a share from 0 to 100, for example 10 or 12.5.") }
    : over ? { kind: "warn", text: t(`Số tiền lớn hơn toàn bộ vốn dài hạn (${money(g)}), nên được tính là 100%.`, `The amount exceeds long-term capital (${money(g)}), so it counts as 100%.`) }
    : ready ? { kind: "ok", text: last === "AMOUNT"
      ? t(`${money(n)} = ${pc}% trên vốn dài hạn ${money(g)}.`, `${money(n)} = ${pc}% of long-term capital ${money(g)}.`)
      : t(`${pc}% = ${money(n)} trên vốn dài hạn ${money(g)}.`, `${pc}% = ${money(n)} of long-term capital ${money(g)}.`) }
    : null;

  return <div className="allocation-loss-limit">
    <h3>{t("Nếu quỹ giảm, bạn có thể chấp nhận đến mức nào?", "If the fund falls, how much can you accept?")}</h3>
    <div className="allocation-loss-fields">
      <label>{t("Số tiền giảm bạn có thể chấp nhận", "Loss amount you can accept")}
        <span className="allocation-loss-input"><input type="text" inputMode="numeric" value={a ? vnd.format(Number(a)) : ""} onChange={e => typeAmount(e.target.value)} disabled={saving} /><i>₫</i></span></label>
      <label>{t("Mức giảm chấp nhận (% vốn dài hạn)", "Loss you can accept (% of long-term capital)")}
        <span className="allocation-loss-input"><input type="text" inputMode="decimal" value={pc} onChange={e => typePercent(e.target.value)} disabled={saving} /><i>%</i></span></label>
    </div>
    {hint && <p className="allocation-loss-hint" data-kind={hint.kind} aria-live="polite">{hint.text}</p>}
    <div className="allocation-loss-choices"><span>{t("Điền nhanh giới hạn:", "Quick fill:")}</span>
      {[5, 10, 20].map(x => <button type="button" key={x} className="overview-button secondary" disabled={saving || !(g > 0)} onClick={() => typePercent(String(x))}>{x}% {t("vốn dài hạn", "of long-term capital")}</button>)}</div>
    {error && <p role="alert">{error}</p>}
    {changed && <button type="button" className="overview-button primary" disabled={saving || !ready}
      onClick={() => over ? save("PERCENT", "100") : save(last, last === "PERCENT" ? pc.replace(/\.$/, "") : a)}>
      {saving ? t("Đang lưu…", "Saving…") : t("Lưu giới hạn và tính lại", "Save limit and recalculate")}</button>}
  </div>;
}
