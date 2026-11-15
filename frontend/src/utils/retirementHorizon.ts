import { formatMonthVN } from "./date.ts";

// Demo boundary: the 85th birthday is exclusive; the server's endMonth is inclusive.
export function illustrativeRetirementEnd(birthMonth: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(birthMonth)) return "";
  const end = Number(birthMonth.slice(0, 4)) * 12 + Number(birthMonth.slice(5, 7)) - 1 + 85 * 12 - 1;
  const year = Math.floor(end / 12);
  return year <= 9999 ? `${year}-${String(end % 12 + 1).padStart(2, "0")}` : "";
}

/** Saved custom horizons keep their actual month instead of claiming age 85. */
export function projectionHorizonLabel(endMonth: string, birthMonth?: string, en = false): string {
  return birthMonth && endMonth === illustrativeRetirementEnd(birthMonth)
    ? (en ? "age 85" : "85 tuổi") : formatMonthVN(endMonth);
}
