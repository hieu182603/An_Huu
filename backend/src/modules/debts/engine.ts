import { addMonths, monthSchema } from "../../common/calendar";
import type { ProfileV2 } from "../profiles/schema-v2";
import { profileMonthlyCashflow } from "../profiles/cashflow";
import { debtPreviewSchema, type DebtPreviewInput, type ContractPeriod } from "./schema";
import { DebtDecimal as D, prepareLoan, buildContractSchedule, scheduledPayment, comparableAnnualRate, type DebtIssue, type ReadyLoan } from "./loan";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";

export const DEBT_MODEL_VERSION = "debt-monthly-v1";
export function debtPressure(income: string | null, principalInterest: string | null, expense: string | null, fees = "0") {
  const remaining = income !== null && principalInterest !== null && expense !== null
    ? new D(income).minus(expense).minus(principalInterest).minus(fees).toFixed() : null;
  const ratio = income !== null && principalInterest !== null && new D(income).gt(0) ? new D(principalInterest).div(income).mul(100) : null;
  const status = income === null || principalInterest === null ? "INSUFFICIENT_DATA"
    : new D(income).lte(0) ? (new D(principalInterest).gt(0) ? "NO_REPAYMENT_SOURCE" : "UNDEFINED_RATIO")
    : ratio !== null && ratio.lt(30) ? "LOW_PRESSURE" : ratio !== null && ratio.lte(50) ? "REVIEW_DEBT_REDUCTION" : "HIGH_PRESSURE";
  return { definition: "PRINCIPAL_INTEREST_OVER_DISPOSABLE_INCOME", ratioPercent: ratio?.toFixed() ?? null, status,
    remainingCash: remaining, cashflowStatus: remaining === null ? "UNKNOWN" : new D(remaining).lt(0) ? "DEFICIT" : new D(remaining).isZero() ? "BALANCED" : "SURPLUS" };
}
type Strategy = "CONTRACT" | "AVALANCHE" | "SNOWBALL" | "SELECTED_PAYOFF" | "STRESS";
type LoanState = ReadyLoan & { balance: Prisma.Decimal };
type Payment = { state: LoanState; period: ContractPeriod; principal: Prisma.Decimal; interest: Prisma.Decimal; fee: Prisma.Decimal;
  share: Prisma.Decimal; baseline: Prisma.Decimal; extraPrincipal: Prisma.Decimal; extraFee: Prisma.Decimal };

function prepaymentIssues(loans: ReadyLoan[]): DebtIssue[] {
  const issues: DebtIssue[] = [];
  for (const loan of loans) {
    if (loan.opening.isZero()) continue;
    for (const period of loan.contract.periods) {
      const policy = period.prepayment;
      if (policy.status === "UNKNOWN") { issues.push({ loanId: loan.debt.id, code: "PREPAYMENT_TERMS_REQUIRED" }); break; }
      if (policy.status !== "ALLOWED") continue;
      if (loan.share.isZero() || loan.debt.balanceShare.status !== "KNOWN" || !loan.share.eq(loan.debt.balanceShare.value) ||
          (!loan.share.eq(1) && policy.funding !== "PRO_RATA_CONFIRMED")) {
        issues.push({ loanId: loan.debt.id, code: "SHARED_PREPAYMENT_AGREEMENT_REQUIRED" }); break;
      }
    }
  }
  return issues;
}
function extraPayment(payment: Payment, budget: Prisma.Decimal, fullOnly: boolean) {
  const policy = payment.period.prepayment, state = payment.state;
  if (policy.status !== "ALLOWED" || budget.lte(0) || state.balance.lte(0) || state.share.lte(0)) return;
  const fixed = new D(policy.fixedFee), rate = new D(policy.feePercent).div(100);
  const fullBudget = budget.div(state.share);
  if (fullBudget.lte(fixed)) return;
  const affordable = fullBudget.minus(fixed).div(rate.plus(1));
  let principal = D.min(state.balance, affordable);
  if (policy.maximumPrincipal !== null) principal = D.min(principal, policy.maximumPrincipal);
  if ((fullOnly || policy.mode === "FULL_ONLY") && principal.lt(state.balance)) return;
  if (principal.lte(0) || principal.lt(policy.minimumPrincipal)) return;
  const fee = principal.mul(rate).plus(fixed);
  payment.extraPrincipal = principal; payment.extraFee = fee;
  state.balance = state.balance.minus(principal);
}

function simulate(profile: ProfileV2, loans: ReadyLoan[], input: DebtPreviewInput, strategy: Strategy) {
  const states: LoanState[] = loans.map(loan => ({ ...loan, balance: new D(loan.opening) }));
  let principalTotal = new D(0), interestTotal = new D(0), feeTotal = new D(0), extraTotal = new D(0), peak = new D(0);
  let firstShortfallMonth: string | null = null, debtFreeDate: string | null = states.every(state => state.balance.isZero()) ? profile.valuationDate : null;
  const rows = [];
  for (let index = 0; index < input.horizonMonths; index++) {
    const month = addMonths(profile.valuationDate.slice(0, 7), index);
    const cashflow = profileMonthlyCashflow(profile, month);
    const payments: Payment[] = [];
    for (const state of states) {
      const period = state.contract.periods[index];
      if (!period) continue;
      const scheduled = scheduledPayment(state.balance, period, index === state.contract.periods.length - 1 && state.contract.settleRemainingAtMaturity);
      if (scheduled.code) throw new AppError(422, "INVALID_LOAN_SCHEDULE", "Lịch vay không thể tái lập sau thay đổi.");
      state.balance = scheduled.closing;
      const stress = strategy === "STRESS" ? input.stress.find(entry => entry.loanId === state.debt.id && entry.startMonth <= month && entry.endMonth >= month) : undefined;
      const share = stress ? new D(stress.totalPaymentShare) : state.share;
      payments.push({ state, period, principal: scheduled.principal, interest: scheduled.interest, fee: scheduled.fee, share,
        baseline: scheduled.principal.plus(scheduled.interest).plus(scheduled.fee).mul(state.share), extraPrincipal: new D(0), extraFee: new D(0) });
    }
    const scheduledTotal = payments.reduce((sum, payment) => sum.plus(payment.principal.plus(payment.interest).plus(payment.fee).mul(payment.share)), new D(0));
    const reserve = input.reserveMonthly === null ? null : new D(input.reserveMonthly);
    const available = cashflow.income !== null && cashflow.expenses !== null && reserve !== null ? cashflow.income.minus(cashflow.expenses).minus(reserve).minus(scheduledTotal) : null;
    let budget = input.extraMonthlyBudget !== null && available !== null ? D.min(D.max(available, 0), input.extraMonthlyBudget) : new D(0);
    if (strategy === "AVALANCHE" || strategy === "SNOWBALL" || strategy === "SELECTED_PAYOFF") {
      const annualRates = strategy === "AVALANCHE" ? new Map(payments.map(payment => [payment, comparableAnnualRate(payment.period.rate)])) : null;
      const ordered = [...payments].sort((a, b) => {
        const priority = annualRates ? annualRates.get(b)!.cmp(annualRates.get(a)!)
          : a.state.balance.mul(a.state.share).cmp(b.state.balance.mul(b.state.share));
        return priority || a.state.debt.id.localeCompare(b.state.debt.id, "en");
      });
      for (const payment of ordered) {
        if (strategy === "SELECTED_PAYOFF" && payment.state.debt.id !== input.payoffLoanId) continue;
        extraPayment(payment, budget, strategy === "SELECTED_PAYOFF");
        budget = budget.minus(payment.extraPrincipal.plus(payment.extraFee).mul(payment.state.share));
      }
    }
    let debtPrincipal = new D(0), debtInterest = new D(0), debtFees = new D(0), extraPrincipal = new D(0), extraFees = new D(0), stressIncrease = new D(0);
    const details = payments.map(payment => {
      const p = payment.principal.mul(payment.share), i = payment.interest.mul(payment.share), f = payment.fee.mul(payment.share);
      const extra = payment.extraPrincipal.mul(payment.state.share), fee = payment.extraFee.mul(payment.state.share);
      debtPrincipal = debtPrincipal.plus(p); debtInterest = debtInterest.plus(i); debtFees = debtFees.plus(f);
      extraPrincipal = extraPrincipal.plus(extra); extraFees = extraFees.plus(fee);
      stressIncrease = stressIncrease.plus(p.plus(i).plus(f).minus(payment.baseline));
      return { loanId: payment.state.debt.id, dueDate: payment.period.dueDate, principal: p.toFixed(), interest: i.toFixed(), fee: f.toFixed(),
        extraPrincipal: extra.toFixed(), prepaymentFee: fee.toFixed(), totalLoanClosingBalance: payment.state.balance.toFixed() };
    });
    const debtPayment = debtPrincipal.plus(debtInterest).plus(debtFees).plus(extraPrincipal).plus(extraFees);
    principalTotal = principalTotal.plus(debtPrincipal).plus(extraPrincipal); interestTotal = interestTotal.plus(debtInterest);
    feeTotal = feeTotal.plus(debtFees).plus(extraFees); extraTotal = extraTotal.plus(extraPrincipal);
    peak = D.max(peak, debtPayment);
    const pressure = debtPressure(cashflow.income?.toFixed() ?? null, debtPrincipal.plus(debtInterest).toFixed(), cashflow.expenses?.toFixed() ?? null, debtFees.toFixed());
    const remaining = cashflow.income !== null && cashflow.expenses !== null && reserve !== null
      ? cashflow.income.minus(cashflow.expenses).minus(debtPayment).minus(reserve) : null;
    if (remaining?.lt(0)) firstShortfallMonth ??= month;
    if (debtFreeDate === null && states.every(state => state.balance.isZero())) {
      const dates = payments.filter(payment => payment.principal.plus(payment.extraPrincipal).gt(0)).map(payment => payment.period.dueDate).sort();
      debtFreeDate = dates[dates.length - 1] ?? profile.valuationDate;
    }
    rows.push({ month, income: cashflow.income?.toFixed() ?? null, nonDebtExpense: cashflow.expenses?.toFixed() ?? null,
      reserveContribution: input.reserveMonthly, scheduledPrincipalInterest: debtPrincipal.plus(debtInterest).toFixed(), scheduledFees: debtFees.toFixed(),
      extraPrincipal: extraPrincipal.toFixed(), prepaymentFees: extraFees.toFixed(), debtPayment: debtPayment.toFixed(), stressIncrease: stressIncrease.toFixed(),
      availableForRetirement: remaining?.toFixed() ?? null, pressure, loans: details, issues: cashflow.issues });
  }
  return { strategy, status: states.some(state => state.balance.gt(0)) ? "HORIZON_LIMIT" : "CALCULATED", rows,
    totals: { principal: principalTotal.toFixed(), interest: interestTotal.toFixed(), fees: feeTotal.toFixed(), interestAndFees: interestTotal.plus(feeTotal).toFixed(),
      extraPrincipal: extraTotal.toFixed(), totalPaid: principalTotal.plus(interestTotal).plus(feeTotal).toFixed(), peakMonthlyPayment: peak.toFixed(),
      closingLoanBalance: states.reduce((sum, state) => sum.plus(state.balance), new D(0)).toFixed(), debtFreeDate, firstShortfallMonth } };
}

export function previewDebts(profile: ProfileV2, command: DebtPreviewInput) {
  const input = debtPreviewSchema.parse(command);
  if (!monthSchema.safeParse(addMonths(profile.valuationDate.slice(0, 7), input.horizonMonths - 1)).success)
    throw new AppError(400, "HORIZON_DATE_OUT_OF_RANGE", "Thời gian so sánh vượt phạm vi năm được hỗ trợ (1900–2199).");
  const issues: DebtIssue[] = [], loans: ReadyLoan[] = [];
  if (profile.debts.status === "UNKNOWN") issues.push({ loanId: null, code: "DEBTS_REQUIRED" });
  if (profile.debts.status === "KNOWN") {
    if (profile.debts.entries.length > 100) throw new AppError(422, "DEBT_LIMIT_EXCEEDED", "Mỗi lần so sánh tối đa 100 khoản vay.");
    for (const debt of profile.debts.entries) {
      const prepared = prepareLoan(debt, profile.valuationDate), schedule = buildContractSchedule(debt, profile.valuationDate);
      if (schedule.status !== "READY" || !prepared.loan) issues.push(...schedule.issues);
      else loans.push(prepared.loan);
    }
  }
  const context = { modelVersion: DEBT_MODEL_VERSION, valuationDate: profile.valuationDate, currency: "VND", periodUnit: "MONTH",
    timing: "EXTRA_AFTER_SCHEDULED_PAYMENT", budgetTiming: "MONTHLY_LIQUIDITY_ONLY", issues,
    warnings: loans.filter(loan => loan.debt.responsibility.status !== "KNOWN" || loan.debt.responsibility.scope !== "FULL")
      .map(loan => ({ loanId: loan.debt.id, code: "LIABILITY_SCOPE_NOT_FULLY_MODELED" })),
    limitations: ["NO_INTRAMONTH_LIQUIDITY_GUARANTEE", "NO_REFINANCING_OR_TRANSACTIONS", "RETIREMENT_RETURN_NOT_APPLIED"],
  };
  if (issues.length) return { ...context, status: "INCOMPLETE", baseline: null, alternatives: [], stress: null };
  if (input.payoffLoanId && !loans.some(loan => loan.debt.id === input.payoffLoanId)) throw new AppError(400, "UNKNOWN_LOAN", "Khoản vay được chọn không có trong hồ sơ.");
  for (const scenario of input.stress) {
    if (scenario.startMonth < profile.valuationDate.slice(0, 7) || scenario.endMonth > addMonths(profile.valuationDate.slice(0, 7), input.horizonMonths - 1))
      throw new AppError(400, "STRESS_OUTSIDE_HORIZON", "Khoảng căng thẳng phải nằm trong thời gian đang so sánh.");
    const loan = loans.find(loan => loan.debt.id === scenario.loanId);
    if (!loan) throw new AppError(400, "UNKNOWN_LOAN", "Khoản vay trong kịch bản không có trong hồ sơ.");
    if (new D(scenario.totalPaymentShare).lt(loan.share)) throw new AppError(400, "INVALID_STRESS_SHARE", "Kịch bản căng thẳng không được giảm phần đang trả.");
  }
  const baseline = simulate(profile, loans, input, "CONTRACT");
  const optimizationIssues = prepaymentIssues(loans);
  if (input.reserveMonthly === null || input.extraMonthlyBudget === null) optimizationIssues.push({ loanId: null, code: "CONFIRMED_BUDGET_REQUIRED" });
  if (baseline.rows.some(row => row.income === null || row.nonDebtExpense === null)) optimizationIssues.push({ loanId: null, code: "CASHFLOW_REQUIRED" });
  const strategies: Array<"AVALANCHE" | "SNOWBALL" | "SELECTED_PAYOFF"> = input.payoffLoanId ? ["AVALANCHE", "SNOWBALL", "SELECTED_PAYOFF"] : ["AVALANCHE", "SNOWBALL"];
  const alternatives = strategies.map(strategy => {
    if (optimizationIssues.length) return { strategy, status: "INCOMPLETE", comparisonScope: "UNAVAILABLE", result: null, interestAndFeesSaved: null, retirementCashflowDelta: [], issues: optimizationIssues };
    const result = simulate(profile, loans, input, strategy);
    return { strategy, status: result.status, comparisonScope: baseline.status === "CALCULATED" && result.status === "CALCULATED" ? "FULL_TERM" : "SAME_HORIZON_ONLY", result,
      interestAndFeesSaved: new D(baseline.totals.interestAndFees).minus(result.totals.interestAndFees).toFixed(),
      retirementCashflowDelta: result.rows.map((row, index) => ({ month: row.month,
        value: new D(baseline.rows[index].debtPayment).minus(row.debtPayment).toFixed() })), issues: [] };
  });
  const stressIssues: DebtIssue[] = [];
  for (const scenario of input.stress) {
    const loan = loans.find(loan => loan.debt.id === scenario.loanId);
    if (!loan) continue;
    if (new D(scenario.totalPaymentShare).gt(loan.share) && (loan.debt.responsibility.status !== "KNOWN" || loan.debt.responsibility.scope !== "FULL"))
      stressIssues.push({ loanId: loan.debt.id, code: "FULL_LIABILITY_CONFIRMATION_REQUIRED" });
  }
  const stress = !input.stress.length ? null : stressIssues.length ? { status: "INCOMPLETE", result: null, issues: stressIssues }
    : { status: "CALCULATED", result: simulate(profile, loans, input, "STRESS"), issues: [] };
  return { ...context, status: "READY", baseline, alternatives, stress };
}
