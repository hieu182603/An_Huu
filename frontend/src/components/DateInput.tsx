import { useState, useRef, useEffect, useId, type ReactNode } from "react";
import "./date-input.css";

export interface DateInputProps {
  id?: string;
  label: ReactNode;
  labelAction?: ReactNode;
  value: string; // "YYYY-MM" or "YYYY-MM-DD"
  onChange: (isoMonth: string, isoDate?: string) => void;
  mode?: "date" | "month";
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

function formatDateToDisplay(iso: string, mode: "date" | "month"): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length >= 3 && mode === "date") {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  if (parts.length >= 2) {
    if (mode === "date") {
      return `01/${parts[1]}/${parts[0]}`;
    }
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
  mode = "date",
  placeholder,
  min = "1920-01",
  max = "2100-12",
  disabled = false,
  required = false,
  error,
  helper,
}: DateInputProps) {
  const generatedId = useId();
  const id = propId || `date-input-${generatedId}`;
  const wrapRef = useRef<HTMLDivElement>(null);

  const defaultPlaceholder = mode === "date" ? "Ngày/tháng/năm" : "Tháng/năm";
  const [displayText, setDisplayText] = useState(() => formatDateToDisplay(value, mode));
  const [isOpen, setIsOpen] = useState(false);

  // Parse current year/month for calendar view
  const getInitialPeriod = () => {
    if (value && value.length >= 7) {
      return value.slice(0, 7);
    }
    return mode === "date" ? "1990-01" : isoDay(new Date()).slice(0, 7);
  };

  const [viewPeriod, setViewPeriod] = useState(getInitialPeriod);

  // Sync displayText when value changes externally
  useEffect(() => {
    const formatted = formatDateToDisplay(value, mode);
    setDisplayText(formatted);
    if (value && value.length >= 7) {
      setViewPeriod(value.slice(0, 7));
    }
  }, [value, mode]);

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

    if (!raw) {
      onChange("", "");
      return;
    }

    if (mode === "date") {
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
        }
      }
    } else {
      let text = raw;
      if (/^\d{6}$/.test(text)) {
        text = `${text.slice(0, 2)}/${text.slice(2)}`;
        setDisplayText(text);
      }
      const match = text.match(/^(\d{1,2})\/(\d{4})$/);
      if (match) {
        const [, m, y] = match;
        const month = Number(m);
        const year = Number(y);
        if (month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
          const ym = `${year}-${pad(month)}`;
          setViewPeriod(ym);
          onChange(ym);
        }
      }
    }
  };

  const handleClear = () => {
    setDisplayText("");
    onChange("", "");
    setIsOpen(false);
  };

  // Calendar view navigation
  const currentViewYear = Number(viewPeriod.slice(0, 4));
  const currentViewMonth = Number(viewPeriod.slice(5, 7));

  const shiftPeriod = (deltaMonths: number) => {
    const d = new Date(Date.UTC(currentViewYear, currentViewMonth - 1 + deltaMonths, 1));
    const nextYm = isoDay(d).slice(0, 7);
    if (nextYm >= min && nextYm <= max) {
      setViewPeriod(nextYm);
    }
  };

  // Build 42 days grid for mode="date"
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
            const d = formatDateToDisplay(iso, "date");
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

  // Month grid for mode="month"
  const renderMonthGrid = () => {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${currentViewYear}-${pad(m)}`;
      const isSelected = value === ym;
      months.push(
        <button
          key={ym}
          type="button"
          aria-pressed={isSelected}
          onClick={() => {
            const d = `${pad(m)}/${currentViewYear}`;
            setDisplayText(d);
            onChange(ym);
            setIsOpen(false);
          }}
        >
          Tháng {m}
        </button>
      );
    }
    return months;
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
          placeholder={placeholder || defaultPlaceholder}
          maxLength={mode === "date" ? 10 : 7}
          disabled={disabled}
          required={required}
          autoComplete="off"
          aria-invalid={Boolean(error)}
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
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="m8 9 4-4 4 4m-8 6 4 4 4-4" />
          </svg>
        </button>

        {isOpen && (
          <div className="month-popup" role="dialog" aria-modal="true">
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
                  aria-label="Chọn năm"
                  value={currentViewYear}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setViewPeriod(`${y}-${pad(currentViewMonth)}`);
                  }}
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

            {mode === "date" ? (
              <>
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
              </>
            ) : (
              <div className="month-grid">{renderMonthGrid()}</div>
            )}

            <div className="calendar-footer">
              <button type="button" onClick={handleClear}>
                Xóa {mode === "date" ? "ngày" : "tháng"}
              </button>
              <button type="button" onClick={() => setIsOpen(false)}>
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <small className="field-error-text error-text" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontSize: "12px", fontWeight: 500 }}>
          {error}
        </small>
      ) : helper ? (
        <small className="help">{helper}</small>
      ) : null}
    </div>
  );
}

export default DateInput;

