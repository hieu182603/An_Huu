import { Prisma } from "@prisma/client";
import type { AssetEntry, ProfileV2 } from "./schema-v2";
import { declaredDebtPayment } from "../debts/loan";
import { profileMonthlyCashflow } from "./cashflow";

const D = Prisma.Decimal.clone({ precision: 48 });
type Metric = "monthlyIncome" | "monthlyExpense" | "monthlyDebtService" | "totalAssets" | "totalDebt" | "netWorth" | "retirementLiquidAssets" | "availableMonthlySurplus";
type Issue = { path: string; code: string };
type Amount = { status: "KNOWN"; value: string } | { status: "UNKNOWN" };
type Group<T> = { status: "KNOWN"; entries: T[] } | { status: "UNKNOWN" } | { status: "NOT_APPLICABLE"; reason: string };

export function profileV2Summary(data: ProfileV2) {
  const issues: Issue[] = [];
  for (const key of ["birthMonth", "desiredRetirementMonth"] as const) {
    if (data.personal[key].status === "UNKNOWN") issues.push({ path: "personal." + key, code: "PROJECTION_INPUT_REQUIRED" });
  }
  if (data.debts.status === "KNOWN") data.debts.entries.forEach((entry, index) => {
    if (entry.responsibility.status === "UNKNOWN") issues.push({ path: `debts.entries.${index}.responsibility`, code: "LIABILITY_SCOPE_UNCONFIRMED" });
  });
  const month = data.valuationDate.slice(0, 7);
  const missing = (path: string, code = "UNKNOWN_VALUE"): null => { issues.push({ path, code }); return null; };
  const amount = (value: Amount, path: string) => value.status === "KNOWN" ? new D(value.value) : missing(path);
  const multiply = (...values: Array<Prisma.Decimal | null>) => {
    let result: Prisma.Decimal = new D(1);
    for (const value of values) { if (value === null) return null; result = result.mul(value); }
    return result;
  };
  const sum = <T>(group: Group<T>, path: string, calculate: (entry: T, index: number) => Prisma.Decimal | null): Prisma.Decimal | null => {
    if (group.status === "UNKNOWN") return missing(path);
    if (group.status === "NOT_APPLICABLE") return new D(0);
    const values = group.entries.map(calculate);
    let result: Prisma.Decimal = new D(0);
    for (const value of values) { if (value === null) return null; result = result.plus(value); }
    return result;
  };
  const isVnd = (entry: { currency: string }, path: string) => entry.currency === "VND" || missing(path + ".currency", "FX_RULE_REQUIRED");
  const cashflow = profileMonthlyCashflow(data, month);
  const monthlyIncome = cashflow.income, monthlyExpense = cashflow.expenses;
  issues.push(...cashflow.issues);
  const monthlyDebtService = sum(data.debts, "debts", (entry, index) => {
    const payment = declaredDebtPayment(entry, data.valuationDate);
    issues.push(...payment.issues.map(issue => ({ path: `debts.entries.${index}`, code: issue.code })));
    return payment.value;
  });
  const totalDebt = sum(data.debts, "debts", (entry, index) => {
    const path = `debts.entries.${index}`;
    if (!isVnd(entry, path)) return null;
    if (entry.balanceAsOf.status !== "KNOWN" || entry.balanceAsOf.value !== data.valuationDate)
      return missing(path + ".balanceAsOf", "VALUATION_DATE_REQUIRED");
    return multiply(amount(entry.outstandingBalance, path + ".outstandingBalance"), amount(entry.balanceShare, path + ".balanceShare"));
  });
  const assetValue = (entry: AssetEntry, path: string) => {
    if (!isVnd(entry, path)) return null;
    if (entry.valuedOn.status !== "KNOWN" || entry.valuedOn.value !== data.valuationDate)
      return missing(path + ".valuedOn", "VALUATION_DATE_REQUIRED");
    return multiply(amount(entry.value, path + ".value"), amount(entry.ownershipShare, path + ".ownershipShare"));
  };
  const totalAssets = sum(data.assets, "assets", (entry, index) => assetValue(entry, `assets.entries.${index}`));
  const retirementLiquidAssets = sum(data.assets, "assets", (entry, index) => {
    const path = `assets.entries.${index}`;
    // A residence or future sale/rent is not cash available at the valuation date.
    if (entry.type === "PRIMARY_HOME" || entry.type === "REAL_ESTATE") {
      issues.push({ path, code: entry.housingPlan?.status === "CONFIRMED" ? "HOUSING_PLAN_FOR_FORECAST" : "HOUSING_NOT_RETIREMENT_CASH" });
      return new D(0);
    }
    if (entry.retirementShare.status === "KNOWN" && new D(entry.retirementShare.value).isZero()) return new D(0);
    if (entry.liquidity.status !== "KNOWN") return missing(path + ".liquidity");
    if (entry.liquidity.value !== "LIQUID") return new D(0);
    if (entry.availableFromMonth.status !== "KNOWN") return missing(path + ".availableFromMonth");
    if (entry.availableFromMonth.value > month) return new D(0);
    return multiply(assetValue(entry, path), amount(entry.retirementShare, path + ".retirementShare"));
  });
  const netWorth = totalAssets !== null && totalDebt !== null ? totalAssets.minus(totalDebt) : null;
  const availableMonthlySurplus = monthlyIncome !== null && monthlyExpense !== null && monthlyDebtService !== null
    ? monthlyIncome.minus(monthlyExpense).minus(monthlyDebtService) : null;
  const values: Record<Metric, Prisma.Decimal | null> = {
    monthlyIncome, monthlyExpense, monthlyDebtService, totalAssets, totalDebt, netWorth, retirementLiquidAssets, availableMonthlySurplus,
  };
  return {
    currency: data.currency, valuationDate: data.valuationDate, periodUnit: data.periodUnit,
    values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value?.toFixed() ?? null])),
    issues: issues.filter((issue, index) => issues.findIndex(other => other.path === issue.path && other.code === issue.code) === index),
  };
}
