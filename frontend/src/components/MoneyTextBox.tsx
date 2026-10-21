import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { useI18n } from "../i18n";
import { numberToVietnameseWords } from "../utils/currency";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
  showWords?: boolean;
  maxDecimals?: number;
  allowNegative?: boolean;
};

function group(value: string, vi: boolean) {
  if (!value) return "";
  if (value === "-") return value;
  const sign = value.startsWith("-") ? "-" : "";
  const [whole, fraction] = value.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, vi ? "." : ",");
  return sign + (fraction === undefined ? grouped : `${grouped}${vi ? "," : "."}${fraction}`);
}

/** Plain money <input> holding a canonical decimal string ("1500000.5"), shown with thousand separators and Vietnamese words. */
export default function MoneyTextBox({ value, onChange, showWords = true, maxDecimals = 2, allowNegative = false, ...rest }: Props) {
  const { language } = useI18n();
  const vi = language !== "en";
  const ref = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [draft, setDraft] = useState(() => group(value, vi));

  const canonical = (text: string) => {
    const compact = text.replace(/\s/g, "");
    return vi ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, "");
  };
  const valid = new RegExp("^" + (allowNegative ? "-?" : "") + "[0-9]*(?:[.][0-9]{0," + maxDecimals + "})?$");

  useEffect(() => {
    const current = canonical(draft).replace(/\.$/, "");
    if (current !== value) setDraft(group(value, vi));
  }, [value, vi]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (el: HTMLInputElement) => {
    const text = el.value;
    const next = canonical(text);
    if (!valid.test(next)) { setDraft(group(value, vi)); return; }
    const clean = next.replace(/^(-?)0+(?=\d)/, "$1");
    const formatted = group(clean, vi);
    const caret = el.selectionStart ?? text.length;
    const count = text.slice(0, caret).replace(/[^\d,.-]/g, "").length;
    setDraft(formatted);
    onChange(clean.replace(/\.$/, ""));
    requestAnimationFrame(() => {
      if (document.activeElement !== ref.current) return;
      let pos = 0, seen = 0;
      while (pos < formatted.length && seen < count) { if (/[\d-]/.test(formatted[pos]) || formatted[pos] === (vi ? "," : ".")) seen++; pos++; }
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const words = showWords ? numberToVietnameseWords(Math.abs(Number(value)) || 0) : "";
  return <>
    <input {...rest} ref={ref} type="text" inputMode="decimal" value={draft}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={e => { composing.current = false; clearTimeout(timer.current); commit(e.currentTarget); }}
      onChange={e => {
        clearTimeout(timer.current);
        if (!composing.current) { commit(e.target); return; }
        const el = e.target;
        setDraft(el.value);
        timer.current = setTimeout(() => { if (el.isConnected) commit(el); }, 250);
      }} />
    {words && <div className="currency-words-preview" role="status" aria-live="polite">
      <span className="currency-words-label">Bằng chữ:</span> <span className="currency-words-text">{words}</span>
    </div>}
  </>;
}
