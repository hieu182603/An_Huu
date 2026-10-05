export type Language = "vi" | "en";

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatCurrency: (amount: number | string | null | undefined) => string;
  formatDate: (date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  formatPercent: (percent: number | string | null | undefined) => string;
}
