import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { Language, I18nContextType } from "./types";
import { vi } from "./translations/vi";
import { en } from "./translations/en";

export * from "./types";

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = "anhuu_language";

const dictionaries: Record<Language, Record<string, string>> = {
  vi,
  en,
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "vi") return stored;
    } catch {}
    return "vi";
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "vi" ? "en" : "vi");
  }, [language, setLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = dictionaries[language] || vi;
      let text = dict[key] ?? vi[key as keyof typeof vi] ?? key;

      if (params) {
        Object.entries(params).forEach(([paramKey, paramVal]) => {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramVal));
        });
      }
      return text;
    },
    [language]
  );

  const formatCurrency = useCallback(
    (amount: number | string | null | undefined): string => {
      if (amount === null || amount === undefined || amount === "") return "0 ₫";
      const num = typeof amount === "string" ? parseFloat(amount) : amount;
      if (isNaN(num)) return "0 ₫";

      const locale = language === "en" ? "en-US" : "vi-VN";
      const formatted = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      }).format(num);

      return `${formatted} ₫`;
    },
    [language]
  );

  const formatDate = useCallback(
    (date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string => {
      if (!date) return "";
      const d = typeof date === "string" ? new Date(date) : date;
      if (isNaN(d.getTime())) return String(date);

      const locale = language === "en" ? "en-US" : "vi-VN";
      const defaultOptions: Intl.DateTimeFormatOptions = options || {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      };

      return d.toLocaleDateString(locale, defaultOptions);
    },
    [language]
  );

  const formatPercent = useCallback(
    (percent: number | string | null | undefined): string => {
      if (percent === null || percent === undefined || percent === "") return "0%";
      const num = typeof percent === "string" ? parseFloat(percent) : percent;
      if (isNaN(num)) return "0%";
      return `${num.toFixed(1)}%`;
    },
    []
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
      formatCurrency,
      formatDate,
      formatPercent,
    }),
    [language, setLanguage, toggleLanguage, t, formatCurrency, formatDate, formatPercent]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Graceful fallback if called outside provider
    return {
      language: "vi",
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (k: string, p?: Record<string, string | number>) => {
        let text = vi[k as keyof typeof vi] || k;
        if (p) {
          Object.entries(p).forEach(([paramKey, paramVal]) => {
            text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramVal));
          });
        }
        return text;
      },
      formatCurrency: (amount) => {
        if (!amount) return "0 ₫";
        const num = typeof amount === "string" ? parseFloat(amount) : amount;
        return isNaN(num) ? "0 ₫" : `${new Intl.NumberFormat("vi-VN").format(num)} ₫`;
      },
      formatDate: (date) => (date ? new Date(date).toLocaleDateString("vi-VN") : ""),
      formatPercent: (val) => `${val || 0}%`,
    };
  }
  return ctx;
}
