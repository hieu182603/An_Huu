import { z } from "zod";
import { DebtDecimal as D, buildContractSchedule, declaredDebtPayment } from "../debts/loan";
import { illustrateDebt, type IllustrationRow } from "../debts/illustration";
import { profileV2Summary } from "./summary-v2";
import type { ProfileV2 } from "./schema-v2";
const amount = z.string().regex(/^-?(0|[1-9]\d*)(\.\d+)?$/).nullable();
const issue = z.object({ loanId: z.string().nullable(), code: z.string() }).strict();
export const debtReportSchema = z.object({
  profileRevision: z.number().int(), valuationDate: z.string(), currency: z.literal("VND"), debtState: z.enum(["KNOWN", "UNKNOWN", "NOT_APPLICABLE"]),
  totals: z.object({ outstandingBalance: amount, monthlyPayment: amount, firstMonthInterest: amount, monthlyIncome: amount, monthlyExpense: amount, availableMonthlySurplus: amount, debtToIncomePercent: amount }).strict(),
  loans: z.array(z.object({ id: z.string(), status: z.enum(["CONTRACT", "ILLUSTRATIVE", "DECLARED", "INCOMPLETE"]), outstandingBalance: amount, monthlyPayment: amount, firstMonthInterest: amount, payoffDate: z.string().nullable(), scheduleStatus: z.enum(["READY", "INCOMPLETE", "HORIZON_LIMIT", "NOT_DECLARED"]),
    rate: z.object({ kind: z.string(), percent: z.string() }).strict().nullable(),
    rows: z.array(z.object({ dueDate: z.string(), opening: z.string(), principal: z.string(), interest: z.string(), fee: z.string(), closing: z.string(), userPayment: z.string(), userPrincipal: z.string(), userInterest: z.string(), userFee: z.string() }).strict()), issues: z.array(issue),
  }).strict()), issues: z.array(issue),
}).strict();
export function profileDebtSummary(profile: ProfileV2, profileRevision: number) {
  const summary = profileV2Summary(profile).values, month = profile.valuationDate.slice(0, 7);
  const loans = profile.debts.status === "KNOWN" ? profile.debts.entries.map(debt => {
    const payment = declaredDebtPayment(debt, profile.valuationDate);
    const balance = debt.currency === "VND" && debt.balanceAsOf.status === "KNOWN" && debt.balanceAsOf.value === profile.valuationDate && debt.outstandingBalance.status === "KNOWN" && debt.balanceShare.status === "KNOWN" ? new D(debt.outstandingBalance.value).mul(debt.balanceShare.value).toFixed() : null;
    let rows: IllustrationRow[] = [], payoffDate: string | null = null, rate: { kind: string; percent: string } | null = null;
    let status: "CONTRACT" | "ILLUSTRATIVE" | "DECLARED" | "INCOMPLETE" = "DECLARED", scheduleStatus: "READY" | "INCOMPLETE" | "HORIZON_LIMIT" | "NOT_DECLARED" = "NOT_DECLARED";
    const issues: Array<{ loanId: string | null; code: string }> = [...payment.issues];
    if (debt.contract?.status === "KNOWN") {
      const schedule = buildContractSchedule(debt, profile.valuationDate);
      status = schedule.status === "READY" ? "CONTRACT" : "INCOMPLETE"; scheduleStatus = schedule.status; issues.push(...schedule.issues);
      if (schedule.status === "READY" && debt.paymentShare.status === "KNOWN") {
        const share = debt.paymentShare.value;
        rows = schedule.rows.map(row => ({ dueDate: row.dueDate, opening: row.opening, principal: row.principal, interest: row.interest, fee: row.fee, closing: row.closing, userPayment: row.userPayment,
          userPrincipal: new D(row.principal).mul(share).toFixed(), userInterest: new D(row.interest).mul(share).toFixed(), userFee: row.userFee }));
        payoffDate = rows.find(row => new D(row.closing).isZero())?.dueDate ?? null;
      }
      const period = debt.contract.value.periods.find(period => period.dueDate.slice(0, 7) === month);
      if (period) rate = { kind: period.rate.kind, percent: period.rate.percent };
    } else if (debt.illustration?.annualRatePercent.status === "KNOWN") {
      const schedule = illustrateDebt(debt, profile.valuationDate); rows = schedule.rows; payoffDate = schedule.payoffDate; scheduleStatus = schedule.status; status = "ILLUSTRATIVE"; issues.push(...schedule.issues);
      rate = { kind: "NOMINAL_ANNUAL_MONTHLY", percent: debt.illustration.annualRatePercent.value };
    }
    const first = rows.find(row => row.dueDate.slice(0, 7) === month);
    const inactive = debt.startMonth > month || debt.endMonth !== null && debt.endMonth < month;
    const firstMonthInterest = first ? first.userInterest : debt.contract?.status !== "KNOWN" && (inactive || debt.outstandingBalance.status === "KNOWN" && new D(debt.outstandingBalance.value).isZero()) ? "0" : null;
    return { id: debt.id, status, outstandingBalance: balance, monthlyPayment: payment.value?.toFixed() ?? null, firstMonthInterest, payoffDate, rate, scheduleStatus, rows, issues: issues.filter((item, index) => issues.findIndex(other => other.loanId === item.loanId && other.code === item.code) === index) };
  }) : [];
  const firstMonthInterest = profile.debts.status === "UNKNOWN" || loans.some(loan => loan.firstMonthInterest === null) ? null : loans.reduce((sum, loan) => sum.plus(loan.firstMonthInterest!), new D(0)).toFixed();
  return { profileRevision, valuationDate: profile.valuationDate, currency: profile.currency, debtState: profile.debts.status,
    totals: { outstandingBalance: summary.totalDebt, monthlyPayment: summary.monthlyDebtService, firstMonthInterest, monthlyIncome: summary.monthlyIncome, monthlyExpense: summary.monthlyExpense, availableMonthlySurplus: summary.availableMonthlySurplus,
      debtToIncomePercent: summary.monthlyIncome !== null && new D(summary.monthlyIncome).gt(0) && summary.monthlyDebtService !== null ? new D(summary.monthlyDebtService).div(summary.monthlyIncome).mul(100).toFixed(1) : null },
    loans, issues: loans.flatMap(loan => loan.issues) };
}
