import type { ProfileV2 } from "../services/financialProfile";

const OPTIONAL_PROFILE_KEYS = new Set(["contract", "responsibility", "costBasis"]);

export function hasMissingProfileValue(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.status === "UNKNOWN") return true;
  if (record.status === "NOT_APPLICABLE") return !String(record.reason ?? "").trim();
  if (record.status === "KNOWN" && "value" in record && record.value === "") return true;
  return Object.entries(record).some(([key, val]) => {
    if (OPTIONAL_PROFILE_KEYS.has(key)) return false;
    return hasMissingProfileValue(val);
  });
}

export function profileCompletionItems(p: ProfileV2) {
  return [
    { key: "birth", vi: "Tháng năm sinh", en: "Birth month", tab: "v2-timing", complete: p.personal.birthMonth.status === "KNOWN" && !!p.personal.birthMonth.value },
    { key: "retirement", vi: "Thời điểm nghỉ hưu", en: "Retirement month", tab: "v2-timing", complete: p.personal.desiredRetirementMonth.status === "KNOWN" && !!p.personal.desiredRetirementMonth.value },
    { key: "gender", vi: "Giới tính", en: "Gender", tab: "v2-timing", complete: !!p.personal.gender && p.personal.gender !== "UNDISCLOSED" },
    { key: "pensionStart", vi: "Thời điểm nhận lương hưu", en: "Pension start", tab: "v2-pension", complete: !hasMissingProfileValue(p.personal.pensionStartMonth) },
    { key: "income", vi: "Thu nhập", en: "Income", tab: "v2-cashflow", complete: !hasMissingProfileValue(p.income) },
    { key: "expenses", vi: "Chi tiêu", en: "Expenses", tab: "v2-cashflow", complete: !hasMissingProfileValue(p.expenses) },
    { key: "assets", vi: "Tài sản", en: "Assets", tab: "v2-assets", complete: !hasMissingProfileValue(p.assets) },
    { key: "debts", vi: "Khoản nợ", en: "Debts", tab: "v2-debts", complete: !hasMissingProfileValue(p.debts) },
    { key: "pension", vi: "Lương hưu", en: "Pension", tab: "v2-pension", complete: !!p.pension && !hasMissingProfileValue(p.pension) },
  ] as const;
}
