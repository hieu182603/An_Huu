import { useState, useRef, useEffect, useId, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { formatMonthVN } from "../utils/date";
import "./date-input.css";

export interface DateInputProps {
  id?: string;
  label: ReactNode;
  labelAction?: ReactNode;
  value: string; // "YYYY-MM" or "YYYY-MM-DD"
  onChange: (isoMonth: string, isoDate?: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  helper?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatDateToDisplay(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length >= 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0]}`;
  }
  return "";
}

export function DateInput({
  id: propId,
  label,
  labelAction,
  value,
  onChange,
  placeholder,
  min = "1920-01",
  max = "2100-12",
  disabled = false,
  required = false,
  error,
  helper,
}: DateInputProps) {
  const { language } = useI18n();
  const en = language === "en";
  const generatedId = useId();
  const id = propId || `date-input-${generatedId}`;
  const pickerId = `${id}-picker`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [invalid, setInvalid] = useState(false);

  const [displayText, setDisplayText] = useState(() => formatDateToDisplay(value));
  const [isOpen, setIsOpen] = useState(false);

  const [viewPeriod, setViewPeriod] = useState(() => value.slice(0, 7) || "1990-01");

  // Sync displayText when value changes externally
  useEffect(() => {
    const formatted = formatDateToDisplay(value);
    if (!focused.current) setDisplayText(formatted);
    if (value) setInvalid(false);
    if (value && value.length >= 7) {
      setViewPeriod(value.slice(0, 7));
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Handle typing inside input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    setDisplayText(e.target.value);
    setInvalid(false);

    if (!raw) {
      onChange("", "");
      return;
    }

    let text = raw;
    // Auto-format 8 digits: 01062004 -> 01/06/2004
    if (/^\d{8}$/.test(text)) {
      text = `${text.slice(0, 2)}/${text.slice(2, 4)}/${text.slice(4)}`;
      setDisplayText(text);
    }
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      const day = Number(d);
      const month = Number(m);
      const year = Number(y);
      const dt = new Date(Date.UTC(year, month - 1, day));
      if (
        dt.getUTCFullYear() === year &&
        dt.getUTCMonth() === month - 1 &&
        dt.getUTCDate() === day &&
        month >= 1 &&
        month <= 12 &&
        year >= 1900 &&
        year <= 2100
      ) {
        const ym = `${year}-${pad(month)}`;
        const ymd = `${year}-${pad(month)}-${pad(day)}`;
        setViewPeriod(ym);
        onChange(ym, ymd);
        return;
      }
    }
    setInvalid(raw.length >= 10);
    onChange("", "");
  };

  const handleClear = () => {
    setInvalid(false);
    setDisplayText("");
    onChange("", "");
    setIsOpen(false);
  };

  // Calendar view navigation
  const currentViewYear = Number(viewPeriod.slice(0, 4));
  const currentViewMonth = Number(viewPeriod.slice(5, 7));

  const showYear = (year: number) => setViewPeriod(`${year}-${pad(currentViewMonth)}`);

  const shiftPeriod = (deltaMonths: number) => {
    const d = new Date(Date.UTC(currentViewYear, currentViewMonth - 1 + deltaMonths, 1));
    const nextYm = isoDay(d).slice(0, 7);
    if (nextYm >= min && nextYm <= max) {
      setViewPeriod(nextYm);
    }
  };

  // Build the 42-day calendar grid.
  const renderCalendarDays = () => {
    const firstOfMonth = new Date(Date.UTC(currentViewYear, currentViewMonth - 1, 1));
    const offset = (firstOfMonth.getUTCDay() + 6) % 7; // Monday = 0
    const today = isoDay(new Date());

    const days = [];
    for (let i = 0; i < 42; i++) {
      const dayDate = new Date(Date.UTC(currentViewYear, currentViewMonth - 1, 1 - offset + i));
      const iso = isoDay(dayDate);
      const isAdjacent = iso.slice(0, 7) !== viewPeriod;
      const isToday = iso === today;
      const isSelected = value === iso || (value.length === 7 && iso === `${value}-01`);

      days.push(
        <button
          key={iso}
          type="button"
          className={`${isAdjacent ? "adjacent" : ""} ${isToday ? "today" : ""}`}
          aria-pressed={isSelected}
          onClick={() => {
            const ym = iso.slice(0, 7);
            const d = formatDateToDisplay(iso);
            setDisplayText(d);
            onChange(ym, iso);
            setIsOpen(false);
          }}
        >
          {dayDate.getUTCDate()}
        </button>
      );
    }
    return days;
  };

  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  const yearOptions = [];
  for (let y = maxYear; y >= minYear; y--) {
    yearOptions.push(y);
  }

  return (
    <div className={`field month-field ${error ? "has-error" : ""}`} ref={wrapRef}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {labelAction}
        </label>
      )}

      <div className="date-control">
        <div className="input-wrap month-input-wrap">
          <span className="date-prefix" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M7 2v6m10-6v6M3 11h18" />
            </svg>
          </span>

          <input
            id={id}
            data-month-display
            type="text"
            inputMode="numeric"
            value={displayText}
            placeholder={placeholder || "Ngày/tháng/năm"}
            maxLength={10}
            disabled={disabled}
            required={required}
            autoComplete="off"
            aria-invalid={Boolean(error) || invalid}
            onFocus={() => { focused.current = true; }}
            onBlur={() => {
              focused.current = false;
              if (displayText.trim() && !value) setInvalid(true);
            }}
            onChange={handleInputChange}
            onClick={() => !disabled && setIsOpen(true)}
          />

          {displayText && !disabled && (
            <button
              type="button"
              className="date-clear"
              data-date-clear
              aria-label="Xóa ngày đã chọn"
              onClick={handleClear}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          )}

          <button
            type="button"
            className="month-open"
            data-month-open
            aria-label="Mở lịch chọn"
            aria-controls={isOpen ? pickerId : undefined}
            aria-expanded={isOpen}
            disabled={disabled}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="m8 9 4-4 4 4m-8 6 4 4 4-4" />
            </svg>
          </button>
        </div>

        {isOpen && (
          <div id={pickerId} className="month-popup" role="group" aria-label="Chọn ngày">
            <div className="month-picker-heading">
              <button
                type="button"
                className="calendar-prev"
                aria-label="Tháng trước"
                onClick={() => shiftPeriod(-1)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="m15 19-7-7 7-7" />
                </svg>
              </button>

              <div className="calendar-period">
                <select
                  data-calendar-month
                  aria-label="Chọn tháng"
                  value={currentViewMonth}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setViewPeriod(`${currentViewYear}-${pad(m)}`);
                  }}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Tháng {i + 1}
                    </option>
                  ))}
                </select>

                <select
                  data-calendar-year
                  aria-label={en ? "Choose year" : "Chọn năm"}
                  value={currentViewYear}
                  onChange={e => showYear(Number(e.target.value))}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="calendar-next"
                aria-label="Tháng sau"
                onClick={() => shiftPeriod(1)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="calendar-weekdays" aria-hidden="true">
              <span>T2</span>
              <span>T3</span>
              <span>T4</span>
              <span>T5</span>
              <span>T6</span>
              <span>T7</span>
              <span>CN</span>
            </div>
            <div className="calendar-days">{renderCalendarDays()}</div>

            <div className="calendar-footer">
              <button type="button" onClick={handleClear}>
                Xóa ngày
              </button>
              <button type="button" onClick={() => setIsOpen(false)}>
                {en ? "Close" : "Đóng"}
              </button>
            </div>
          </div>
        )}
      </div>

      {error || invalid ? (
        <small className="field-error-text error-text" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontSize: "12px", fontWeight: 500 }}>
          {error || "Nhập ngày/tháng/năm hợp lệ."}
        </small>
      ) : helper ? (
        <small className="help">{helper}</small>
      ) : null}
    </div>
  );
}

function parseMonthEntry(text: string) {
  const compact = text.trim();
  const match = /^(\d{1,2})\/(\d{4})$/.exec(compact) ?? /^(\d{2})(\d{4})$/.exec(compact);
  if (!match) return "";
  const [, month, year] = match;
  return Number(month) >= 1 && Number(month) <= 12 && Number(year) >= 1900
    ? `${year}-${pad(Number(month))}`
    : "";
}

export function MonthInput({ label, value, onChange, error }: {
  label: string;
  value: string;
  onChange: (month: string) => void;
  error?: string;
}) {
  const { language } = useI18n();
  const en = language === "en";
  const id = useId();
  const hintId = `${id}-hint`;
  const focused = useRef(false);
  const [draft, setDraft] = useState(() => formatMonthVN(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(formatMonthVN(value));
      setInvalid(false);
    }
  }, [value]);

  const message = invalid
    ? (en ? "Enter a valid month and year." : "Nhập tháng và năm hợp lệ.")
    : error;

  return (
    <div className={`field form-field month-entry${message ? " has-error" : ""}`}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={7}
          placeholder="MM/YYYY"
          value={draft}
          aria-invalid={Boolean(message)}
          aria-describedby={hintId}
          onFocus={() => { focused.current = true; }}
          onChange={event => {
            const input = event.currentTarget;
            const text = input.value;
            const month = parseMonthEntry(text);
            const sixDigits = /^\d{6}$/.test(text);
            // Format completed typing at the end without moving the caret during edits in the middle.
            setDraft(sixDigits && input.selectionStart === text.length ? `${text.slice(0, 2)}/${text.slice(2)}` : text);
            setInvalid(!month && (sixDigits || text.length === 7));
            onChange(month);
          }}
          onBlur={() => {
            focused.current = false;
            const month = parseMonthEntry(draft);
            if (month) setDraft(formatMonthVN(month));
            setInvalid(Boolean(draft.trim() && !month));
          }}
        />
      </div>
      <small id={hintId} className={message ? "field-error-text" : "help"}>
        {message || (en ? "Example: 06/2028" : "Ví dụ: 06/2028")}
      </small>
    </div>
  );
}

export default DateInput;

