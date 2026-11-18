import { useI18n } from "../i18n";
import { Icon } from "./ui";

/** One click switches Vietnamese <-> English (no dropdown). */
export default function UserLanguageMenu() {
  const { language, setLanguage } = useI18n();
  const next = language === "en" ? "vi" : "en";
  return <div className="user-language-menu">
    <button type="button" className="anhuu-lang-toggle-btn" aria-label={language === "en" ? "Switch to Vietnamese" : "Chuyển sang English"} title={language === "en" ? "Tiếng Việt" : "English"} onClick={() => setLanguage(next)}>
      <Icon name="globe" className="lang-globe-icon" />
      <span className="lang-code-badge">{language.toUpperCase()}</span>
    </button>
  </div>;
}
