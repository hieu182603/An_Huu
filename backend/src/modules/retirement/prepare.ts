import { addMonths } from "../../common/calendar";
import { AppError } from "../../common/errors";
import { profileV2Schema, type ProfileV2 } from "../profiles/schema-v2";
import { profileV2Summary } from "../profiles/summary-v2";
import { profileMonthlyCashflow } from "../profiles/cashflow";
import { buildContractSchedule } from "../debts/loan";
import { pensionAtMonth } from "../pensions/engine";
// Keep v3 preview metadata/hash semantics frozen; v4 will use the current reference.
import { legalRetirementAge } from "../pensions/legal-age-v1";
import { previewPortfolio } from "../portfolios/engine";
import type { PortfolioDocument } from "../portfolios/schema";
import type { AssumptionDocument } from "../assumptions/schema";
import { retirementPreviewSchema, RETIREMENT_MODEL, type RetirementPreview } from "./schema";
import { RetirementDecimal as D, projectRetirement, type MonthlyInput, type ProjectionInput } from "./engine";

type Issue = { path: string; code: string };
const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
const unique = (issues: Issue[]) => issues.filter((v, i) => issues.findIndex(o => o.path === v.path && o.code === v.code) === i);

export function prepareRetirement(profile: ProfileV2, command: RetirementPreview, policy: PortfolioDocument, assumptions: AssumptionDocument) {
  const data = profileV2Schema.parse(profile), input = retirementPreviewSchema.parse(command);
  const issues: Issue[] = [], warnings: Issue[] = [];
  const issue = (path: string, code: string) => issues.push({ path, code });
  const fail = () => ({ status: "INCOMPLETE" as const, issues: unique(issues), warnings: unique(warnings), calculation: null, replayInput: null });
  if (input.whatIf) {
    warnings.push({ path: "whatIf", code: "HYPOTHETICAL_VALUES_PROFILE_UNCHANGED" });
    if (input.whatIf.retirementMonth) data.personal.desiredRetirementMonth = { status: "KNOWN", value: input.whatIf.retirementMonth };
    for (const override of input.whatIf.assetValues ?? []) {
      const asset = data.assets.status === "KNOWN" ? data.assets.entries.find(a => a.id === override.assetId) : undefined;
      if (!asset) issue("whatIf.assetValues", "UNKNOWN_ASSET");
      else asset.value = { status: "KNOWN", value: override.value };
    }
    // Re-check date relationships after the alternative retirement month. Pension
    // dates, income end dates, ownership and liquidity are never auto-shifted.
    const revised = profileV2Schema.safeParse(data);
    if (!revised.success) revised.error.issues.forEach(i => issue(i.path.join("."), "INVALID_HYPOTHETICAL_PROFILE"));
    if (issues.length) return fail();
  }
  if (data.personal.desiredRetirementMonth.status !== "KNOWN") { issue("personal.desiredRetirementMonth", "RETIREMENT_MONTH_REQUIRED"); return fail(); }
  const firstMonth = data.valuationDate.slice(0, 7), retirementMonth = data.personal.desiredRetirementMonth.value;
  const contributionStartMonth = input.contributionTiming === "START_OF_MONTH" && !data.valuationDate.endsWith("-01") ? addMonths(firstMonth, 1) : firstMonth;
  if (input.contributionTiming === "START_OF_MONTH" && !input.startOfMonthFunding)
    issue("startOfMonthFunding", "START_OF_MONTH_FUNDING_CONFIRMATION_REQUIRED");
  if (contributionStartMonth !== firstMonth) warnings.push({ path: "contributionTiming", code: "FIRST_START_DEPOSIT_NEXT_FULL_MONTH" });
  if (input.startOfMonthFunding) warnings.push({ path: "startOfMonthFunding", code: "DECLARED_START_CASH_NOT_EXTRA_INCOME_OR_EXISTING_FUND_CAPITAL" });
  for (const row of input.startOfMonthFunding?.schedule ?? [])
    if (row.month < contributionStartMonth || row.month >= retirementMonth) issue("startOfMonthFunding.schedule", "FUNDING_OUTSIDE_ACCUMULATION");
  const length = monthIndex(input.endMonth) - monthIndex(firstMonth) + 1;
  if (retirementMonth < firstMonth || input.endMonth < retirementMonth || length < 1 || length > 1200)
    throw new AppError(400, "INVALID_PROJECTION_PERIOD", "Ngày hưu phải từ tháng định giá; kỳ cuối phải từ tháng nghỉ hưu, tối đa 1.200 kỳ.");
  if (!data.valuationDate.endsWith("-01")) warnings.push({ path: "valuationDate", code: "PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION" });
  for (const row of input.contributionSchedule) if (row.month < firstMonth || row.month >= retirementMonth)
    issue("contributionSchedule", "CONTRIBUTION_OUTSIDE_ACCUMULATION");
  for (const row of input.retirementContributionSchedule) if (row.month < retirementMonth || row.month > input.endMonth)
    issue("retirementContributionSchedule", "CONTRIBUTION_OUTSIDE_RETIREMENT");
  const portfolio = previewPortfolio(policy, assumptions, { policyVersionId: input.policyVersionId, startMonth: firstMonth, horizonMonths: length,
    answers: input.answers, liquidityNeedMonths: input.liquidityNeedMonths, ...(input.templateId ? { templateId: input.templateId } : {}) });
  if (portfolio.status !== "READY") { issues.push(...portfolio.issues); return fail(); }
  const scenario = portfolio.scenarios.find(s => s.kind === input.scenario)!;
  // Preserve T04's convention: scenario CPI delta modifies planning inflation;
  // the published real-to-nominal return conversion is performed exactly once.
  const scenarioAssumptions: AssumptionDocument = { ...assumptions, inflation: assumptions.inflation.map(r => ({ ...r,
    percent: new D(r.percent).plus(scenario.changes.find(c => c.year === r.year)!.inflationDeltaPoints).toFixed() })) };
  const summary = profileV2Summary(data), initialCapital = summary.values.retirementLiquidAssets;
  if (initialCapital === null) issue("assets", "RETIREMENT_CAPITAL_INCOMPLETE");
  warnings.push(...summary.issues.filter(i => !i.path.startsWith("income") && !i.path.startsWith("expenses") && i.path !== "pension"));
  const debtRows = new Map<string, InstanceType<typeof D>>();
  if (data.debts.status === "UNKNOWN") issue("debts", "DEBT_SCHEDULE_REQUIRED");
  const debts = data.debts.status === "KNOWN" ? data.debts.entries : [];
  for (const stress of input.debtStress) {
    const debt = debts.find(d => d.id === stress.loanId);
    if (!debt) issue("debtStress", "UNKNOWN_LOAN");
    else if (debt.paymentShare.status !== "KNOWN" || (new D(stress.totalPaymentShare).gt(debt.paymentShare.value) &&
      (debt.responsibility.status !== "KNOWN" || debt.responsibility.scope !== "FULL"))) issue("debtStress", "FULL_LIABILITY_CONFIRMATION_REQUIRED");
    if (stress.startMonth < firstMonth || stress.endMonth > input.endMonth) issue("debtStress", "STRESS_OUTSIDE_PROJECTION");
  }
  for (const debt of debts) {
    if (debt.outstandingBalance.status === "KNOWN" && new D(debt.outstandingBalance.value).isZero()) continue;
    if (debt.contract?.status === "KNOWN") {
      const schedule = buildContractSchedule(debt, data.valuationDate);
      if (schedule.status !== "READY") { issues.push(...schedule.issues.map(i => ({ path: `debts.${debt.id}`, code: i.code }))); continue; }
      if (schedule.rows.some(r => r.dueDate.slice(0, 7) > input.endMonth && new D(r.userPayment).gt(0)))
        warnings.push({ path: `debts.${debt.id}`, code: "DEBT_PAYMENTS_AFTER_PLAN_END" });
      for (const row of schedule.rows) {
        const month = row.dueDate.slice(0, 7), stress = input.debtStress.find(s => s.loanId === debt.id && s.startMonth <= month && month <= s.endMonth);
        const payment = stress ? new D(row.principal).plus(row.interest).plus(row.fee).mul(stress.totalPaymentShare) : new D(row.userPayment);
        debtRows.set(month, (debtRows.get(month) ?? new D(0)).plus(payment));
      }
    } else if (debt.payment.status === "KNOWN" && debt.paymentShare.status === "KNOWN") {
      warnings.push({ path: `debts.${debt.id}`, code: "LOAN_CONTRACT_ESTIMATED" });
      const monthlyPayment = new D(debt.payment.value).mul(debt.paymentShare.value);
      const balance = debt.outstandingBalance.status === "KNOWN" ? new D(debt.outstandingBalance.value) : new D(0);
      const estMonths = monthlyPayment.gt(0) && balance.gt(0) ? Math.ceil(balance.div(monthlyPayment).toNumber()) : 12;
      for (let m = 0; m < estMonths; m++) {
        const month = addMonths(firstMonth, m);
        if (month > input.endMonth) break;
        debtRows.set(month, (debtRows.get(month) ?? new D(0)).plus(monthlyPayment));
      }
    } else {
      issue(`debts.${debt.id}`, "DEBT_SCHEDULE_REQUIRED");
    }
  }
  const injections = new Map<string, InstanceType<typeof D>>(), rents: Array<{ start: string; amount: InstanceType<typeof D> }> = [];
  const linkedHousingIncome = new Set<string>();
  const assets = data.assets.status === "KNOWN" ? data.assets.entries : [];
  for (const mapping of input.housing) {
    const asset = assets.find(a => a.id === mapping.assetId);
    if (asset?.housingPlan?.status !== "CONFIRMED") issue("housing", "CONFIRMED_HOUSING_PLAN_REQUIRED");
    if (mapping.linkedIncomeId) {
      const entry = data.income.status === "KNOWN" ? data.income.entries.find(e => e.id === mapping.linkedIncomeId) : undefined;
      if (!entry || entry.source === "PENSION") issue("housing", "INVALID_LINKED_INCOME");
      linkedHousingIncome.add(mapping.linkedIncomeId);
    }
  }
  for (const asset of assets) {
    const path = `assets.${asset.id}`;
    if (asset.retirementShare.status === "KNOWN" && new D(asset.retirementShare.value).isZero()) continue;
    if (asset.housingPlan?.status === "CONFIRMED") {
      const plan = asset.housingPlan, mapping = input.housing.find(h => h.assetId === asset.id);
      if (!mapping) { issue(path, "HOUSING_AMOUNT_SCOPE_REQUIRED"); continue; }
      if (asset.currency !== "VND" || plan.netAmount.status !== "KNOWN" || asset.retirementShare.status !== "KNOWN" || asset.ownershipShare.status !== "KNOWN") {
        issue(path, "HOUSING_AMOUNT_INCOMPLETE"); continue;
      }
      const amount = new D(plan.netAmount.value).mul(asset.retirementShare.value).mul(mapping.amountScope === "WHOLE_ASSET" ? asset.ownershipShare.value : "1");
      if (plan.kind === "RENT") rents.push({ start: plan.startMonth, amount });
      else if (plan.startMonth < firstMonth) issue(path, "PAST_SALE_MUST_BE_RECONCILED_IN_CASH_ASSET");
      else injections.set(plan.startMonth, (injections.get(plan.startMonth) ?? new D(0)).plus(amount));
      continue;
    }
    if (["PRIMARY_HOME", "REAL_ESTATE"].includes(asset.type)) continue;
    if (asset.liquidity.status === "KNOWN" && asset.liquidity.value !== "LIQUID") {
      warnings.push({ path, code: "NONLIQUID_ASSET_EXCLUDED_UNTIL_CONFIRMED_LIQUIDITY" }); continue;
    }
    if (asset.availableFromMonth.status === "KNOWN" && asset.availableFromMonth.value > firstMonth) {
      if (asset.currency !== "VND" || asset.value.status !== "KNOWN" || asset.ownershipShare.status !== "KNOWN" || asset.retirementShare.status !== "KNOWN" ||
        asset.valuedOn.status !== "KNOWN" || asset.valuedOn.value !== data.valuationDate || asset.liquidity.status !== "KNOWN") {
        issue(path, "FUTURE_CAPITAL_INCOMPLETE"); continue;
      }
      const month = asset.availableFromMonth.value, amount = new D(asset.value.value).mul(asset.ownershipShare.value).mul(asset.retirementShare.value);
      injections.set(month, (injections.get(month) ?? new D(0)).plus(amount));
      warnings.push({ path, code: "DEFERRED_LIQUID_ASSET_FIXED_NOMINAL_NO_PRE_RELEASE_RETURN" });
    }
  }
  const incomeEntries = data.income.status === "KNOWN" ? data.income.entries : [];
  const expenseEntries = data.expenses.status === "KNOWN" ? data.expenses.entries : [];
  for (const id of input.retirementIncomeIds) {
    const entry = incomeEntries.find(e => e.id === id);
    if (!entry || entry.source === "PENSION") issue("retirementIncomeIds", "INVALID_RETIREMENT_INCOME_REFERENCE");
  }
  for (const id of input.retirementAdditionalExpenseIds) {
    const entry = expenseEntries.find(e => e.id === id);
    if (!entry || entry.category === "DEBT_PAYMENT") issue("retirementAdditionalExpenseIds", "INVALID_ADDITIONAL_EXPENSE_REFERENCE");
  }
  if (!data.pension || data.pension.status === "UNKNOWN") warnings.push({ path: "pension", code: "PENSION_NOT_INCLUDED" });
  if (issues.length || initialCapital === null) return fail();
  const rows: MonthlyInput[] = [], pensionCache = new Map<string, ReturnType<typeof pensionAtMonth>>();
  let inflationIndex = new D(1);
  for (let i = 0; i < length; i++) {
    const month = addMonths(firstMonth, i), retired = month >= retirementMonth;
    const incomeGroup = retired ? { status: "KNOWN" as const, entries: incomeEntries.filter(e => input.retirementIncomeIds.includes(e.id) && !linkedHousingIncome.has(e.id)) }
      : data.income.status === "KNOWN" ? { ...data.income, entries: incomeEntries.filter(e => !linkedHousingIncome.has(e.id)) } : data.income;
    const expenseGroup = retired ? { status: "KNOWN" as const, entries: expenseEntries.filter(e => input.retirementAdditionalExpenseIds.includes(e.id)) } : data.expenses;
    const cash = profileMonthlyCashflow({ income: incomeGroup, expenses: expenseGroup }, month);
    issues.push(...cash.issues.map(e => ({ path: `${month}.${e.path}`, code: e.code })));
    const beforePension = data.personal.pensionStartMonth.status === "KNOWN" && month < data.personal.pensionStartMonth.value;
    const adjustment = data.pension?.status === "KNOWN" && data.pension.adjustment.kind === "EXPLICIT_SCHEDULE"
      ? data.pension.adjustment.entries.filter(e => e.effectiveMonth <= month).map(e => e.effectiveMonth).sort().at(-1) : undefined;
    const key = beforePension ? "BEFORE_START" : adjustment ?? "INITIAL";
    const pensionResult = pensionCache.get(key) ?? pensionAtMonth(data, month, scenarioAssumptions);
    pensionCache.set(key, pensionResult);
    if (data.pension?.status === "KNOWN" && pensionResult.amount === null) issues.push(...pensionResult.issues);
    const pension = new D(pensionResult.amount ?? "0");
    const rent = rents.filter(r => r.start <= month).reduce((s, r) => s.plus(r.amount), new D(0));
    const income = (cash.income ?? new D(0)).plus(rent), debt = debtRows.get(month) ?? new D(0);
    const living = retired ? new D(input.monthlyExpenseToday).mul(inflationIndex) : cash.expenses ?? new D(0);
    const extraExpense = retired ? cash.expenses ?? new D(0) : new D(input.monthlyReserve);
    const remaining = income.plus(pension).minus(living).minus(extraExpense).minus(debt);
    const planned = new D(retired ? input.retirementContributionSchedule.find(r => r.month === month)?.amount ?? "0"
      : input.contributionSchedule.find(r => r.month === month)?.amount ?? input.monthlyContribution);
    const householdCapacity = D.max(0, remaining);
    const startAvailable = new D(input.startOfMonthFunding?.schedule.find(r => r.month === month)?.amount ?? input.startOfMonthFunding?.monthlyAvailable ?? "0");
    const capacity = !retired && input.contributionTiming === "START_OF_MONTH"
      ? month < contributionStartMonth ? new D(0) : D.min(householdCapacity, startAvailable) : householdCapacity;
    const contribution = D.min(planned, capacity);
    rows.push({ month, growthFactor: scenario.rows[i].returnMonthlyFactor, inflationFactor: scenario.rows[i].inflationMonthlyFactor,
      income: income.toFixed(), pension: pension.toFixed(), livingExpense: living.toFixed(), additionalExpense: extraExpense.toFixed(), debtPayment: debt.toFixed(),
      plannedContribution: planned.toFixed(), contribution: contribution.toFixed(), contributionCapacity: capacity.toFixed(),
      withdrawal: D.max(0, remaining.neg()).toFixed(), uninvestedSurplus: householdCapacity.minus(contribution).toFixed(), capitalInjection: (injections.get(month) ?? new D(0)).toFixed() });
    inflationIndex = inflationIndex.mul(scenario.rows[i].inflationMonthlyFactor);
  }
  if (issues.length) return fail();
  const replayInput: ProjectionInput = { valuationDate: data.valuationDate, retirementMonth, initialCapital,
    modelVersion: RETIREMENT_MODEL, contributionStartMonth,
    terminalBalance: input.terminalBalance, monthlyContribution: input.monthlyContribution, contributionTiming: input.contributionTiming, rows };
  return { status: "READY" as const, issues: [], warnings: unique(warnings), replayInput,
    calculation: { ...projectRetirement(replayInput), netWorth: summary.values.netWorth,
      assessment: portfolio.assessment, marketRows: scenario.rows, scenario: { kind: scenario.kind, label: scenario.label, evidence: scenario.evidence, changes: scenario.changes },
      legalRetirementAge: legalRetirementAge(data.personal, data.valuationDate),
      limitations: ["DETERMINISTIC_NOT_SUCCESS_PROBABILITY", "INITIAL_ALLOCATION_COST_NOT_MODELED",
        "DECLARED_FLOWS_FIXED_NOMINAL_EXCEPT_RETIREMENT_LIVING_EXPENSE", "START_FUNDING_IS_CONFIRMED_MONTHLY_ASSUMPTION_NOT_DAILY_LIQUIDITY", "EXPLICIT_DEPOSITS_ONLY",
        "PREVIEW_NOT_SAVED_OR_APPLIED", "WITHDRAWALS_AND_CAPITAL_RELEASES_AT_MONTH_END"] } };
}
