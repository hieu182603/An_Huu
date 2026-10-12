import { useId, useState, useEffect, type ReactNode } from "react";
import { formatNumberWithDots, numberToVietnameseWords } from "../utils/currency";

export interface CurrencyInputProps {
  label: string;
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
  min?: number;
  max?: number;
}

export function CurrencyInput({
  label,
  labelAction,
  value,
  onChange,
  suffix = "VND",
  helper,
  error,
  placeholder = "0",
  disabled = false,
  hideLabel = false,
  showWords = true,
  max,
}: CurrencyInputProps) {
  const id = useId();
  const messageId = `${id}-message`;

  // Local string to allow seamless typing while maintaining dot-separated thousand format
  const [displayText, setDisplayText] = useState<string>(() => {
    return value > 0 ? formatNumberWithDots(value) : (value === 0 ? "0" : "");
  });

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, "");
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent negative sign, exponents, and arrow up/down
    if (e.key === "-" || e.key === "Subtract" || e.key === "e" || e.key === "E" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    (e.target as HTMLElement).blur();
  };

  const words = showWords && value > 0 ? numberToVietnameseWords(value, suffix) : "";

  return (
    <div className={`form-field ${error ? "has-error" : ""} ${disabled ? "is-disabled" : ""}`}>
      {!hideLabel ? (
        <label className="field-header-row" htmlFor={id}>
          <span className="field-label">{label}</span>
          {labelAction}
        </label>
      ) : (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}

      <span className="input-wrap">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={displayText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          aria-invalid={Boolean(error)}
          aria-describedby={helper || error || words ? messageId : undefined}
          style={{ fontVariantNumeric: "tabular-nums" }}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </span>

      {/* Hiển thị số tiền bằng chữ ngay dưới ô input */}
      {words && !error && (
        <div className="currency-words-preview" role="status" aria-live="polite">
          <span className="currency-words-label">Bằng chữ:</span>
          <span className="currency-words-text">{words}</span>
        </div>
      )}

      {(helper || error) && <small id={messageId}>{error || helper}</small>}
    </div>
  );
}

export default CurrencyInput;
