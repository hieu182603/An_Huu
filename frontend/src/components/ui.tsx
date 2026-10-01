import ResponsiveDialog from "./ResponsiveDialog";
import logoHorizontal from "../assets/logo.png";
import logoVertical from "../assets/logo-vertical.png";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAnglesLeft,
  faAnglesRight,
  faArrowLeft,
  faArrowPointer,
  faArrowRight,
  faBell,
  faBriefcase,
  faBullseye,
  faChartColumn,
  faCheck,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faCircleInfo,
  faCommentDots,
  faCompass,
  faDownload,
  faExpand,
  faEye,
  faEyeSlash,
  faFileLines,
  faFilter,
  faGear,
  faHouse,
  faLifeRing,
  faMagnifyingGlass,
  faPlus,
  faRightFromBracket,
  faTableCellsLarge,
  faTrashCan,
  faTriangleExclamation,
  faUsers,
  faWallet,
  faWandMagicSparkles,
  faXmark,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

export type IconName =
  | "arrow-left" | "arrow-right" | "bell" | "briefcase" | "chart" | "check"
  | "chevron-down" | "chevron-left" | "chevron-right" | "compass" | "download"
  | "file-text" | "filter" | "grid" | "home" | "info" | "life-buoy" | "log-out"
  | "maximize" | "message" | "mouse-pointer" | "panel-left" | "panel-right"
  | "plus" | "search" | "settings" | "sparkles" | "target" | "trash" | "users"
  | "wallet" | "x" | "alert" | "circle-check" | "eye" | "eye-off";

export const fontAwesomeIconMap: Record<IconName, IconDefinition> = {
  "arrow-left": faArrowLeft,
  "arrow-right": faArrowRight,
  bell: faBell,
  briefcase: faBriefcase,
  chart: faChartColumn,
  check: faCheck,
  "chevron-down": faChevronDown,
  "chevron-left": faChevronLeft,
  "chevron-right": faChevronRight,
  compass: faCompass,
  download: faDownload,
  "file-text": faFileLines,
  filter: faFilter,
  grid: faTableCellsLarge,
  home: faHouse,
  info: faCircleInfo,
  "life-buoy": faLifeRing,
  "log-out": faRightFromBracket,
  maximize: faExpand,
  message: faCommentDots,
  "mouse-pointer": faArrowPointer,
  "panel-left": faAnglesLeft,
  "panel-right": faAnglesRight,
  plus: faPlus,
  search: faMagnifyingGlass,
  settings: faGear,
  sparkles: faWandMagicSparkles,
  target: faBullseye,
  trash: faTrashCan,
  users: faUsers,
  wallet: faWallet,
  x: faXmark,
  alert: faTriangleExclamation,
  "circle-check": faCircleCheck,
  eye: faEye,
  "eye-off": faEyeSlash,
};

export { FontAwesomeIcon, type IconDefinition };

export function Icon({
  name,
  size = "default",
  className = "",
}: {
  name: IconName | IconDefinition;
  size?: "small" | "default" | "large";
  className?: string;
}) {
  const iconDef = typeof name === "string" ? fontAwesomeIconMap[name] : name;
  return (
    <FontAwesomeIcon
      icon={iconDef}
      className={`icon icon-${size} ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

export function GoogleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "medium",
  icon,
  loading,
  disabled,
  onClick,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "soft" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
  className?: string;
}) {
  return (
    <button
      className={`button button-${variant} button-${size} ${className}`.trim()}
      disabled={disabled || loading}
      onClick={onClick}
      type={type}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size="small" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({ icon, label, onClick, badge = false, disabled = false }: { icon: IconName; label: string; onClick?: () => void; badge?: boolean; disabled?: boolean }) {
  return <button className="icon-button" aria-label={label} disabled={disabled} onClick={onClick} title={label} type="button"><Icon name={icon} />{badge && <span className="icon-notification" />}</button>;
}

export function Card({ children, className = "", variant = "default" }: { children: ReactNode; className?: string; variant?: "default" | "dark" | "ai" }) {
  const variantClass = variant === "dark" || variant === "ai" ? "card-dark" : "";
  return <div className={`card ${variantClass} ${className}`.trim()}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral" | "soft" | "honey" | "deficit" }) {
  const icon = tone === "success" ? "circle-check" : tone === "warning" || tone === "danger" || tone === "deficit" ? "alert" : tone === "info" ? "info" : null;
  return <span className={`badge badge-${tone}`}>{icon && <Icon name={icon} size="small" />}{children}</span>;
}

export function Avatar({ initials, name, detail, onLogout }: { initials: string; name?: string; detail?: string; onLogout?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="avatar-wrap" style={{ position: "relative" }}>
      <button
        type="button"
        className="avatar-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Tài khoản: ${name || initials}`}
        style={{ display: "flex", alignItems: "center", gap: "10px", background: "transparent", border: "none", cursor: "pointer", padding: "4px", borderRadius: "8px" }}
      >
        <span className="avatar">{initials}</span>
        {name && <span className="avatar-copy"><strong>{name}</strong>{detail && <small>{detail}</small>}</span>}
      </button>
      {open && (
        <div className="avatar-dropdown" role="menu" style={{ position: "absolute", top: "100%", right: 0, marginTop: "8px", background: "var(--color-white)", borderRadius: "12px", boxShadow: "var(--shadow-card)", minWidth: "200px", zIndex: 100, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
            <strong style={{ display: "block", fontSize: "14px" }}>{name}</strong>
            <small style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>{detail}</small>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onLogout?.(); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "10px 16px", border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", color: "var(--color-danger)", textAlign: "left" }}
          >
            <Icon name="log-out" size="small" />
            <span>Đăng xuất</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Input({ label, helper, error, suffix, placeholder, defaultValue, value, onChange, type = "text", autoComplete, inputMode, disabled }: { label: string; helper?: string; error?: string; suffix?: string; placeholder?: string; defaultValue?: string; value?: string; onChange?: (value: string) => void; type?: "text" | "email" | "password" | "number" | "datetime-local"; autoComplete?: string; inputMode?: "numeric" | "decimal" | "text"; disabled?: boolean }) {
  const id = useId();
  const messageId = `${id}-message`;
  return <label className={`form-field ${error ? "has-error" : ""} ${disabled ? "is-disabled" : ""}`} htmlFor={id}><span className="field-label">{label}</span><span className="input-wrap"><input id={id} type={type} disabled={disabled} autoComplete={autoComplete} inputMode={inputMode} placeholder={placeholder} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} aria-invalid={Boolean(error)} aria-describedby={helper || error ? messageId : undefined} />{suffix && <span className="input-suffix">{suffix}</span>}</span>{(helper || error) && <small id={messageId}>{error || helper}</small>}</label>;
}

export function Textarea({ label, placeholder, value, onChange, rows = 4, hideLabel = false, disabled }: { label: string; placeholder?: string; value?: string; onChange?: (value: string) => void; rows?: number; hideLabel?: boolean; disabled?: boolean }) {
  const id = useId();
  return <label className={`form-field ${hideLabel ? "label-hidden" : ""} ${disabled ? "is-disabled" : ""}`} htmlFor={id}><span className="field-label">{label}</span><textarea id={id} disabled={disabled} placeholder={placeholder} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} rows={rows} /></label>;
}

export function Select({ label, options, value, onChange, helper, disabled }: { label: string; options: string[]; value?: string; onChange?: (value: string) => void; helper?: string; disabled?: boolean }) {
  const id = useId();
  return <label className={`form-field ${disabled ? "is-disabled" : ""}`} htmlFor={id}><span className="field-label">{label}</span><span className="select-wrap"><select id={id} disabled={disabled} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined}>{options.map((option) => <option key={option}>{option}</option>)}</select><Icon name="chevron-down" size="small" /></span>{helper && <small>{helper}</small>}</label>;
}

export function SearchField({ label, placeholder, value, onChange, hideLabel = false, disabled }: { label: string; placeholder?: string; value?: string; onChange?: (value: string) => void; hideLabel?: boolean; disabled?: boolean }) {
  const id = useId();
  return <label className={`search-field ${hideLabel ? "label-hidden" : ""} ${disabled ? "is-disabled" : ""}`} htmlFor={id}><span className="field-label">{label}</span><span><Icon name="search" size="small" /><input id={id} type="search" disabled={disabled} placeholder={placeholder} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} /></span></label>;
}

export function Checkbox({ checked, label, onChange, disabled }: { checked: boolean; label: string; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={`choice-control ${disabled ? "is-disabled" : ""}`}><input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="checkbox-visual"><Icon name="check" size="small" /></span><span>{label}</span></label>;
}

export function Radio({ checked, label, onChange, disabled }: { checked: boolean; label: string; onChange: () => void; disabled?: boolean }) {
  return <label className={`choice-control ${disabled ? "is-disabled" : ""}`}><input type="radio" disabled={disabled} checked={checked} onChange={onChange} /><span className="radio-visual" /><span>{label}</span></label>;
}

export function Switch({ checked, label, onChange, disabled }: { checked: boolean; label: string; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={`switch-control ${disabled ? "is-disabled" : ""}`}><span>{label}</span><input type="checkbox" role="switch" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="switch-track"><span /></span></label>;
}

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  return <span className="tooltip-wrap">{children}<span className="tooltip-content" role="tooltip">{content}</span></span>;
}

export function ProgressBar({ value }: { value: number }) {
  return <div className="progress-track" role="progressbar" aria-label={`Tiến độ ${value}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><span style={{ "--progress": `${value}%` } as React.CSSProperties} /></div>;
}

export function Tabs({ items, active, onChange }: { items: string[]; active: string; onChange: (item: string) => void }) {
  return <div className="tabs" role="tablist">{items.map((item) => <button aria-selected={active === item} className={active === item ? "is-active" : ""} key={item} onClick={() => onChange(item)} role="tab" type="button">{item}</button>)}</div>;
}

export function Breadcrumb({ items }: { items: string[] }) {
  return <nav className="breadcrumb" aria-label="Breadcrumb">{items.map((item, index) => <span key={item}><button type="button" aria-current={index === items.length - 1 ? "page" : undefined}>{item}</button>{index < items.length - 1 && <Icon name="chevron-right" size="small" />}</span>)}</nav>;
}

export function Pagination({ current, total }: { current: number; total: number }) {
  if (total <= 1) return <p className="pagination-summary" aria-label="Phân trang">Trang 1/1</p>;
  const pages = Array.from({ length: Math.min(total, 5) }, (_, index) => index + 1);
  return <nav className="pagination" aria-label="Pagination"><IconButton icon="chevron-left" label="Trang trước" />{pages.map((page) => <button className={page === current ? "is-active" : ""} aria-current={page === current ? "page" : undefined} key={page} type="button">{page}</button>)}<IconButton icon="chevron-right" label="Trang sau" /></nav>;
}

export function Dropdown({ label, items }: { label: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  return <div className="dropdown"><Button variant="secondary" onClick={() => setOpen(!open)}>{label}</Button>{open && <div className="dropdown-menu" role="menu">{items.map((item) => <button key={item} role="menuitem" type="button" onClick={() => setOpen(false)}>{item}</button>)}</div>}</div>;
}

export function Modal(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <ResponsiveDialog {...props} />;
}

export function Drawer(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <ResponsiveDialog {...props} drawer />;
}

export function Alert({ tone, title, children }: { tone: "success" | "info" | "warning" | "danger"; title: string; children: ReactNode }) {
  const icon: IconName = tone === "success" ? "circle-check" : tone === "info" ? "info" : "alert";
  return <div className={`alert alert-${tone}`} role={tone === "danger" ? "alert" : "status"}><Icon name={icon} /><div><strong>{title}</strong><p>{children}</p></div></div>;
}

export function EmptyState() {
  return <div className="empty-state"><span><Icon name="file-text" size="large" /></span><h3>Chưa có dữ liệu</h3><p>Dữ liệu mới sẽ xuất hiện tại đây sau khi được thêm.</p><Button icon="plus">Thêm dữ liệu</Button></div>;
}

export function Skeleton({ width = "full", height = "normal" }: { width?: "small" | "medium" | "full"; height?: "normal" | "large" }) {
  return <div className={`skeleton skeleton-${width} skeleton-${height}`} aria-hidden="true" />;
}

export function MetricCard({ label, value, trend, icon }: { label: string; value: string; trend: string; icon: IconName }) {
  return <Card className="metric-card"><div className="metric-label"><span>{label}</span><span className="card-icon"><Icon name={icon} /></span></div><strong className="metric-value">{value}</strong><small><Icon name="arrow-right" size="small" /> {trend}</small></Card>;
}

export function ProgressCard({ label, value, helper, progress }: { label: string; value: string; helper: string; progress: number }) {
  return <Card className="progress-card"><div><span>{label}</span><strong>{value}</strong></div><ProgressBar value={progress} /><p>{helper}</p></Card>;
}

export function ChartContainer({ title, subtitle }: { title: string; subtitle: string }) {
  const bars = [38, 52, 46, 70, 64, 78, 86];
  return <Card className="chart-container"><header><div><h3>{title}</h3><p>{subtitle}</p></div><Button variant="secondary" size="small">12 tháng</Button></header><div className="chart-placeholder" role="img" aria-label="Biểu đồ cột mẫu tăng dần trong bảy kỳ">{bars.map((height, index) => <span className={index === bars.length - 1 ? "is-current" : ""} key={index} style={{ "--bar-height": `${height}%` } as React.CSSProperties} />)}</div><div className="chart-legend"><span><i className="legend-primary" /> Dữ liệu chính</span><span><i className="legend-secondary" /> Mức tham chiếu</span><p>Xu hướng mẫu tăng đều trong 7 kỳ gần nhất.</p></div></Card>;
}

export function TableToolbar() {
  return <div className="table-toolbar"><SearchField label="Tìm kiếm dữ liệu" placeholder="Tìm kiếm..." hideLabel /><div><Button variant="secondary" size="small" icon="filter">Bộ lọc</Button><Button size="small" icon="plus">Thêm mới</Button></div></div>;
}

export function Table() {
  const rows = [
    ["Mẫu dữ liệu 01", "Nội dung chính", "Đang hoạt động", "12/08/2025"],
    ["Mẫu dữ liệu 02", "Nội dung hỗ trợ", "Bản nháp", "09/08/2025"],
    ["Mẫu dữ liệu 03", "Nội dung chính", "Cần xem lại", "01/08/2025"],
  ];
  return <div className="table-scroll"><table><thead><tr><th>Tên dữ liệu</th><th>Phân loại</th><th>Trạng thái</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{rows.map((row, index) => <tr key={row[0]}><td><strong>{row[0]}</strong></td><td>{row[1]}</td><td><Badge tone={index === 0 ? "success" : index === 1 ? "neutral" : "warning"}>{row[2]}</Badge></td><td>{row[3]}</td><td><IconButton icon="chevron-right" label={`Xem ${row[0]}`} /></td></tr>)}</tbody></table></div>;
}

export function BrandLogo({
  variant = "horizontal",
  compact = false,
  inverted = false,
  height,
  className = "",
}: {
  variant?: "horizontal" | "vertical";
  compact?: boolean;
  inverted?: boolean;
  height?: number | string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const isVertical = variant === "vertical";
  const src = compact || isVertical ? logoVertical : logoHorizontal;

  const defaultHeight = compact ? "36px" : isVertical ? "72px" : "38px";
  const renderedHeight = height ? (typeof height === "number" ? `${height}px` : height) : defaultHeight;

  return (
    <span
      className={`brand-logo-container ${compact ? "is-compact" : ""} ${isVertical ? "is-vertical" : "is-horizontal"} ${inverted ? "is-inverted" : ""} ${className}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: isVertical ? "12px" : "8px",
        background: inverted ? "rgba(255, 255, 255, 0.96)" : "transparent",
        padding: inverted ? (isVertical ? "8px" : "4px 10px") : "0",
        boxShadow: inverted ? "0 2px 10px rgba(0, 0, 0, 0.12)" : "none",
        transition: "all var(--duration-fast) ease",
      }}
    >
      {!hasError ? (
        <img
          src={src}
          alt="An Hưu · Lập kế hoạch hôm nay, Cho an yên ngày mai"
          className="brand-logo-img"
          onError={() => setHasError(true)}
          style={{
            height: renderedHeight,
            width: compact ? renderedHeight : isVertical ? renderedHeight : "auto",
            maxWidth: compact ? renderedHeight : isVertical ? renderedHeight : "165px",
            aspectRatio: compact ? "1/1" : isVertical ? "1/1" : "3/1",
            objectFit: compact ? "cover" : "contain",
            objectPosition: compact ? "center 8%" : "center center",
            display: "block",
          }}
        />
      ) : (
        <span
          className="brand-logo-fallback"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            height: renderedHeight,
            fontWeight: 700,
            color: inverted ? "#153A52" : "var(--color-primary-700, #153A52)",
            letterSpacing: "0.5px",
            fontSize: compact ? "14px" : "18px",
            fontFamily: "var(--font-heading, serif)",
          }}
        >
          <span
            style={{
              width: compact ? "28px" : "32px",
              height: compact ? "28px" : "32px",
              borderRadius: "8px",
              background: "#153A52",
              color: "#F6F1E8",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            AH
          </span>
          {!compact && (
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, textAlign: "left" }}>
              <span style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "0.5px" }}>AN HƯU</span>
              <span style={{ fontSize: "9px", fontWeight: 500, color: "var(--color-text-muted, #556B7A)" }}>
                Hưu trí an tâm
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
