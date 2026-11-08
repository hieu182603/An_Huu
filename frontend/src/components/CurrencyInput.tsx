import { useId, useRef, useState, useEffect, useMemo, type ReactNode } from "react";
import { formatNumberWithDots, numberToVietnameseWords } from "../utils/currency";

export interface CurrencyInputProps {
  label: ReactNode;
  labelAction?: ReactNode;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  helper?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  showWords?: boolean;
  showZeroWords?: boolean;
  min?: number;
  max?: number;
}

export function CurrencyInput({
  label,
  labelAction,
  value,
  onChange,
  suffix = "đ",
  helper,
  error,
  placeholder = "0",
  disabled = false,
  hideLabel = false,
  showWords = true,
  showZeroWords = false,
  max,
}: CurrencyInputProps) {
  const id = useId();
  const messageId = `${id}-message`;

  // Local string to allow seamless typing while maintaining dot-separated thousand format
  const [displayText, setDisplayText] = useState<string>(() => {
    return value > 0 ? formatNumberWithDots(value) : (value === 0 ? "0" : "");
  });
  const [isFocused, setIsFocused] = useState(false);

  // Sync when prop value changes from outside
  useEffect(() => {
    if (value === 0 && displayText === "") {
      return;
    }
    const currentNum = Number(displayText.replace(/\D/g, "")) || 0;
    if (currentNum !== value) {
      setDisplayText(value > 0 ? formatNumberWithDots(value) : (value === 0 ? "0" : ""));
    }
  }, [value]);

  // Dynamic suggestions: only computed when focused and value > 0
  const suggestions = useMemo(() => {
    if (!isFocused || !value || value <= 0 || value > 1e15 || !Number.isSafeInteger(value)) return [];
    const n = Math.abs(value);
    const factors = n < 1000 ? [1e5, 1e6, 1e7] : n < 1e6 ? [100, 1000, 10000] : [0.1, 1, 10];
    const rawAmounts = Array.from(
      new Set(
        factors
          .map((f) => Math.round(value * f))
          .filter((v) => Number.isSafeInteger(v) && v > 0 && v <= 1e15)
      )
    );
    return rawAmounts;
  }, [isFocused, value]);

  // Vietnamese IMEs (Telex/VNI) compose text in-place; reformatting mid-composition makes digits repeat (7 -> 77).
  const composing = useRef(false);

  const composeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(composeTimer.current), []);

  const commit = (raw: string) => {
    const rawDigits = raw.replace(/\D/g, "");
    if (!rawDigits) {
      setDisplayText("");
      onChange(0);
      return;
    }

    let num = Number(rawDigits);
    if (max !== undefined && num > max) {
      num = max;
    }

    setDisplayText(formatNumberWithDots(num));
    onChange(num);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearTimeout(composeTimer.current);
    const el = e.target;
    if (composing.current) {
      // Some IMEs keep the composition open while digits are typed, so format once typing pauses.
      setDisplayText(el.value);
      composeTimer.current = setTimeout(() => { if (el.isConnected) commit(el.value); }, 250);
      return;
    }
    commit(el.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent negative sign, exponents, and arrow up/down
    if (e.key === "-" || e.key === "Subtract" || e.key === "e" || e.key === "E" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    (e.target as HTMLElement).blur();
  };

  const handleFocus = () => {
    setIsFocused(true);
    // If value is 0, clear it on focus so user can type cleanly
    if (value === 0 && displayText === "0") {
      setDisplayText("");
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (displayText.trim() === "") {
      setDisplayText("0");
      onChange(0);
    }
  };

  const words = showWords
    ? value > 0
      ? numberToVietnameseWords(value, suffix)
      : value === 0 && showZeroWords
      ? "Không đồng"
      : ""
    : "";

  return (
    <div className={`field form-field ${error ? "has-error" : ""} ${disabled ? "is-disabled" : ""}`}>
      {!hideLabel ? (
        <label className="field-header-row field-label" htmlFor={id}>
          <span>{label}</span>
          {labelAction}
        </label>
      ) : (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}

      <span className="input-wrap money">
        <input
          id={id}
          data-money
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={displayText}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(e) => {
            composing.current = false;
            handleChange(e as unknown as React.ChangeEvent<HTMLInputElement>);
          }}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          aria-invalid={Boolean(error)}
          aria-describedby={helper || error || words ? messageId : undefined}
          style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", paddingRight: "48px" }}
        />
        {suffix && <span className="suffix input-suffix">{suffix}</span>}
      </span>

      {/* Hiển thị số tiền bằng chữ dạng text thuần theo Demo */}
      {words && !error && (
        <span className="money-words" role="status" aria-live="polite">
          {words}
        </span>
      )}

      {/* Gợi ý số tiền: CHỈ HIỂN THỊ KHI ĐANG FOCUS/NHẬP và không có lỗi */}
      {isFocused && suggestions.length > 0 && !error && (
        <div className="amount-suggestions" role="group" aria-label="Gợi ý số tiền">
          <span>Chọn nhanh</span>
          {suggestions.map((amt: number) => {
            const abs = Math.abs(amt);
            const unit = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1000 ? 1000 : 1;
            const unitLabel = unit === 1e9 ? "tỷ" : unit === 1e6 ? "triệu" : unit === 1000 ? "nghìn" : "đồng";
            const numStr = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(amt / unit);
            const labelText = `${numStr} ${unitLabel}`;

            return (
              <button
                key={amt}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(amt);
                  setDisplayText(formatNumberWithDots(amt));
                }}
                aria-label={`Chọn ${formatNumberWithDots(amt)} đồng`}
              >
                {labelText}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <small id={messageId} className="field-error-text error-text" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontSize: "12px", fontWeight: 500 }}>
          {error}
        </small>
      ) : helper ? (
        <small id={messageId} className="help">
          {helper}
        </small>
      ) : null}
    </div>
  );
}

export default CurrencyInput;
