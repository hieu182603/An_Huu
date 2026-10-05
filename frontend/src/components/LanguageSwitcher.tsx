import React from "react";
import { useI18n, type Language } from "../i18n";
import { Icon, Tooltip } from "./ui";

interface LanguageSwitcherProps {
  variant?: "topbar" | "compact" | "select";
  className?: string;
}

export function LanguageSwitcher({ variant = "topbar", className = "" }: LanguageSwitcherProps) {
  const { language, setLanguage, toggleLanguage, t } = useI18n();

  if (variant === "select") {
    return (
      <div className={`anhuu-lang-select-wrap ${className}`}>
        <select
          className="anhuu-lang-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          aria-label={t("account.language_label")}
        >
          <option value="vi">Tiếng Việt (Mặc định)</option>
          <option value="en">English (US)</option>
        </select>
      </div>
    );
  }

  const tooltipText = language === "vi" ? "Chuyển sang Tiếng Anh (English)" : "Switch to Vietnamese (Tiếng Việt)";
  const nextLangLabel = language === "vi" ? "EN" : "VI";

  return (
    <Tooltip content={tooltipText}>
      <button
        type="button"
        className={`anhuu-lang-toggle-btn ${variant === "compact" ? "is-compact" : ""} ${className}`}
        onClick={toggleLanguage}
        aria-label={tooltipText}
        title={tooltipText}
      >
        <Icon name="globe" className="lang-globe-icon" />
        <span className="lang-code-badge">{language.toUpperCase()}</span>
      </button>
    </Tooltip>
  );
}

export default LanguageSwitcher;
