import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Input } from "./ui";
import { useI18n } from "../i18n";
import "./profile-formatted-input.css";

type Props = ComponentProps<typeof Input> & {
  format: "money" | "month" | "date";
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

// Work on decimal strings so large balances never pass through floating point.
function moneyText(value: string, vi: boolean, editing = false) {
  if (!value) return "";
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, vi ? "." : ",");
  return grouped + (fraction !== undefined && (editing || /[1-9]/.test(fraction)) ? `${vi ? "," : "."}${fraction}` : "");
}

function dateText(value: string) {
  return value ? value.split("-").reverse().join("/") : "";
}

function parseDate(text: string, monthOnly: boolean): string | null {
  if (!text) return "";
  const parts = text.includes("-") ? text.split("-") : text.split("/").reverse();
  if (parts.length !== (monthOnly ? 2 : 3) || !/^\d{4}$/.test(parts[0]) || parts.some(p => !/^\d+$/.test(p))) return null;
  const [year, month, day = 1] = parts.map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${parts[0]}-${String(month).padStart(2, "0")}${monthOnly ? "" : `-${String(day).padStart(2, "0")}`}`;
}

export default function ProfileFormattedInput({ format, label, value = "", onChange, helper, error, disabled, placeholder, min, max, onFocus, onBlur }: Props) {
  const { language } = useI18n();
  const vi = language !== "en";
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const display = (v: string) => format === "money" ? moneyText(v, vi) : dateText(v);
  const [draft, setDraft] = useState(() => display(value));
  const [invalid, setInvalid] = useState(false);
  const dateHint = format === "month" ? (vi ? "mm/yyyy · tháng/năm" : "mm/yyyy · month/year") : (vi ? "dd/mm/yyyy · ngày/tháng/năm" : "dd/mm/yyyy · day/month/year");
  const invalidMessage = format === "money"
    ? (vi ? "Nhập số tiền không âm; dùng dấu phẩy nếu có phần thập phân." : "Enter a non-negative amount, using a dot for decimals.")
    : (vi ? `Nhập ${format === "month" ? "tháng/năm" : "ngày/tháng/năm"} hợp lệ.` : "Enter a valid date.");
  const message = invalid ? invalidMessage : error;
  const hint = helper || (format === "money" ? undefined : dateHint);

  useEffect(() => {
    if (!focused.current) { setDraft(display(value)); setInvalid(false); }
  }, [value, format, vi]);
  useEffect(() => { inputRef.current?.setCustomValidity(invalid ? invalidMessage : ""); }, [invalid, invalidMessage]);

  const parse = (text: string) => {
    if (format !== "money") return parseDate(text.trim(), format === "month");
    const compact = text.replace(/\s/g, "");
    if (!compact) return "";
    const normalized = vi ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, "");
    return /^\d+(?:\.\d{0,2})?$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, "") : null;
  };

  return <div className={`form-field profile-formatted-field ${message ? "has-error" : ""}`}>
    <label className="field-label" htmlFor={id}>{label}</label>
    <span className="input-wrap">
      <input ref={inputRef} id={id} type="text" inputMode={format === "money" ? "decimal" : "numeric"}
        value={draft} disabled={disabled} placeholder={placeholder || (format === "money" ? "0" : format === "month" ? "mm/yyyy" : "dd/mm/yyyy")}
        aria-invalid={Boolean(message)} aria-describedby={message || hint ? `${id}-hint` : undefined}
        onFocus={(event) => {
          focused.current = true;
          onFocus?.(event);
        }}
        onChange={event => {
          const text = event.target.value;
          const parsed = parse(text);
          const caret = event.target.selectionStart ?? text.length;
          const count = text.slice(0, caret).replace(vi ? /[^\d,]/g : /[^\d.]/g, "").length;
          const formatted = format === "money" && parsed !== null ? moneyText(parsed, vi, true) : text;
          setDraft(formatted); setInvalid(parsed === null);
          event.target.setCustomValidity(parsed === null ? invalidMessage : "");
          if (parsed !== null) onChange?.(parsed.endsWith(".") ? parsed.slice(0, -1) : parsed);
          if (format === "money" && parsed !== null) requestAnimationFrame(() => {
            if (document.activeElement !== inputRef.current) return;
            let position = 0, seen = 0;
            while (position < formatted.length && seen < count) {
              if ((vi ? /[\d,]/ : /[\d.]/).test(formatted[position])) seen++;
              position++;
            }
            inputRef.current?.setSelectionRange(position, position);
          });
        }}
        onBlur={(event) => {
          focused.current = false;
          const parsed = parse(draft);
          if (parsed !== null) setDraft(display(parsed.endsWith(".") ? parsed.slice(0, -1) : parsed));
          onBlur?.(event);
        }} />
      {format === "money" ? <span className="input-suffix">VND</span> : <span className="profile-date-picker">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
        <input type={format} value={value} disabled={disabled} min={min} max={max}
          aria-label={`${vi ? "Mở lịch chọn" : "Open calendar for"} ${label.toLowerCase()}`}
          onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* Native keyboard input remains available. */ } }}
          onChange={event => {
            const next = event.target.value;
            setDraft(display(next)); setInvalid(false); inputRef.current?.setCustomValidity(""); onChange?.(next);
          }} />
      </span>}
    </span>
    {(message || hint) && <small id={`${id}-hint`}>{message || hint}</small>}
  </div>;
}
