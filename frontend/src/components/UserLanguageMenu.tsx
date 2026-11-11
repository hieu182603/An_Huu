import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Icon } from "./ui";

export default function UserLanguageMenu() {
  const { language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="user-language-menu" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" ref={trigger} className="user-language-trigger" aria-label={language === "en" ? "Choose language" : "Chọn ngôn ngữ"} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>{language.toUpperCase()}<Icon name="chevron-down" /></button>
    {open && <div className="user-language-options" role="menu" aria-label={language === "en" ? "Language" : "Ngôn ngữ"} onKeyDown={event => {
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[(current + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
    }}>
      {([ ["vi", "Tiếng Việt"], ["en", "English"] ] as const).map(([code, label]) => <button type="button" role="menuitemradio" aria-checked={language === code} key={code} onClick={() => { setLanguage(code); close(); }}><span>{label}</span>{language === code && <Icon name="check" />}</button>)}
    </div>}
  </div>;
}
