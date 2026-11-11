import type { FinancialProfile } from "../context/FinancialProfileContext";
import type { ProfileV2 } from "../services/financialProfile";
import { Decimal } from "./decimal";

export const financeAmount = (value: unknown): string | null =>
  typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? value.trim() : null;
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export function financeMoney(value: string | null, en = false): string {
  if (value === null) return en ? "Undetermined" : "Chưa xác định";
  // Format server decimals without first rounding them through a JS number.
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const rounded = (BigInt(whole) + (fraction[0] >= "5" ? 1n : 0n)) * (value.startsWith("-") ? -1n : 1n);
  return `${new Intl.NumberFormat(en ? "en-US" : "vi-VN").format(rounded)} ₫`;
}

export function financeHubSummary(summary: Record<string, string | null> | null, v2: ProfileV2 | null, legacy: FinancialProfile) {
  const pick = (key: string, fallback: number | null) => summary && has(summary, key)
    ? financeAmount(summary[key]) : !v2 && fallback !== null && Number.isFinite(fallback) && Math.abs(fallback) <= Number.MAX_SAFE_INTEGER ? financeAmount(String(fallback)) : null;
  const income = pick("monthlyIncome", legacy.income.primaryIncome + legacy.income.secondaryIncome);
  const expenses = pick("monthlyExpense", legacy.expenses.essentialExpense + legacy.expenses.lifestyleExpense);
  const debtPayment = pick("monthlyDebtService", legacy.debt.hasDebt ? legacy.debt.monthlyDebtService : 0);
  const surplus = summary && has(summary, "availableMonthlySurplus") ? financeAmount(summary.availableMonthlySurplus)
    : !v2 && income !== null && expenses !== null && debtPayment !== null ? new Decimal(income).minus(expenses).minus(debtPayment).toString() : null;
  return {
    income, expenses, debtPayment, surplus,
    debtBalance: pick("totalDebt", legacy.debt.hasDebt ? legacy.debt.mortgageDebt + legacy.debt.consumerDebt : 0),
    retirementAssets: pick("retirementLiquidAssets", legacy.assets.cashSavings + legacy.assets.liquidAssets + legacy.assets.stockFundValue),
    reserve: summary && has(summary, "emergencyReserve") ? financeAmount(summary.emergencyReserve) : null,
  };
}
