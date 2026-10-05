import type { z } from "zod";
import { AppError } from "../../common/errors";
import { RetirementDecimal as D, type MonthlyInput } from "../retirement/engine";
import type { RetirementPreview } from "../retirement/schema";
import type { ProfileV2 } from "../profiles/schema-v2";
import { buildContractSchedule } from "../debts/loan";
import type { sourceChangeSchema, futureChangeSchema, ActualPayload } from "./schema";

export type SourceChange = z.infer<typeof sourceChangeSchema>;
type FutureChange = z.infer<typeof futureChangeSchema>;
const reject = (code: string) => { throw new AppError(422, code, "Cần rà lại nguồn, chứng từ và phạm vi điều chỉnh trước khi cập nhật dự báo."); };
/** Remove only the referenced source's future cashflows. Historical fund flows
 * are already in the actual anchor and must never be added here a second time. */
export function updateSourceRows(rows: MonthlyInput[], changes: SourceChange[], previous: SourceChange[], profile: ProfileV2,
  selection: RetirementPreview, actuals: Array<{ period: string; data: ActualPayload }>, futureChanges: FutureChange[]): MonthlyInput[] {
  const result = rows.map(row => ({ ...row })), seen = [...previous];
  for (const change of changes) {
    if (seen.some(old => old.id === change.id)) reject("SOURCE_CHANGE_ID_REUSED");
    const same = seen.filter(old => old.kind === change.kind && old.sourceId === change.sourceId &&
      (old.kind !== "FLOW_REPLACE" || change.kind !== "FLOW_REPLACE" || old.sourceType === change.sourceType));
    if (change.kind === "FLOW_REPLACE") {
      const group = change.sourceType === "INCOME" ? profile.income : profile.expenses;
      const source = group.status === "KNOWN" ? group.entries.find(e => e.id === change.sourceId) : undefined;
      if (!source || source.currency !== "VND" || source.amount.status !== "KNOWN" ||
        ("source" in source && source.source === "PENSION") || ("category" in source && source.category === "DEBT_PAYMENT") ||
        (change.sourceType === "INCOME" && selection.housing.some(h => h.linkedIncomeId === source.id))) reject("FLOW_SOURCE_REVIEW_REQUIRED");
      if (change.startMonth < rows[0].month || change.endMonth > rows.at(-1)!.month) reject("SOURCE_CHANGE_OUTSIDE_REMAINING_HORIZON");
      if (same.some(old => old.kind === "FLOW_REPLACE" && old.startMonth <= change.endMonth && change.startMonth <= old.endMonth)) reject("SOURCE_CHANGE_OVERLAP");
      const retirement = selection.whatIf?.retirementMonth ?? (profile.personal.desiredRetirementMonth.status === "KNOWN" ? profile.personal.desiredRetirementMonth.value : "");
      for (const row of result) if (change.startMonth <= row.month && row.month <= change.endMonth) {
        const retired = row.month >= retirement, income = change.sourceType === "INCOME";
        const field = income ? "income" : retired ? "additionalExpense" : "livingExpense";
        if (retired && !(income ? selection.retirementIncomeIds : selection.retirementAdditionalExpenseIds).includes(change.sourceId)) reject("FLOW_NOT_SELECTED_FOR_RETIREMENT");
        if (futureChanges.some(c => c.field === field && c.startMonth <= row.month && row.month <= c.endMonth)) reject("SOURCE_CHANGE_CONFLICTS_WITH_TOTAL_OVERRIDE");
        const oldAmount = source!.startMonth <= row.month && (source!.endMonth === null || row.month <= source!.endMonth)
          ? source!.amount.status === "KNOWN" ? source!.amount.value : "0" : "0";
        const remaining = new D(row[field]).minus(oldAmount);
        if (remaining.lt(0)) reject("SOURCE_SCHEDULE_MISMATCH");
        row[field] = remaining.plus(change.monthlyAmount).toFixed();
      }
      seen.push(change);
      continue;
    }
    if (change.kind === "PENSION_REPLACE") {
      if (!profile.pension || profile.pension.status !== "KNOWN") reject("DECLARED_PENSION_SOURCE_REQUIRED");
      if (change.startMonth < rows[0].month || change.endMonth > rows.at(-1)!.month) reject("SOURCE_CHANGE_OUTSIDE_REMAINING_HORIZON");
      if (same.some(old => old.kind === "PENSION_REPLACE" && old.startMonth <= change.endMonth && change.startMonth <= old.endMonth)) reject("SOURCE_CHANGE_OVERLAP");
      for (const row of result) if (change.startMonth <= row.month && row.month <= change.endMonth) row.pension = change.monthlyAmount;
    } else {
      if (same.length) reject("SOURCE_ALREADY_REALIZED");
      if (seen.some(old => (old.kind === "DEBT_SETTLED" || old.kind === "ASSET_REALIZED") && old.actual.eventId === change.actual.eventId)) reject("ACTUAL_EVENT_ALREADY_LINKED");
      const event = actuals.find(a => a.period === change.actual.period)?.data.entries.find(e => e.eventId === change.actual.eventId);
      const kind = change.kind === "DEBT_SETTLED" ? "DEBT_PAYMENT" : "CONTRIBUTION";
      if (!event || event.kind !== kind || new D(event.amount).lte(0) || event.date < profile.valuationDate) reject("SOURCE_ACTUAL_REFERENCE_INVALID");
      if (change.kind === "DEBT_SETTLED") {
        const loan = profile.debts.status === "KNOWN" ? profile.debts.entries.find(d => d.id === change.sourceId) : undefined;
        if (!loan || loan.contract?.status !== "KNOWN") reject("DECLARED_LOAN_CONTRACT_REQUIRED");
        const schedule = buildContractSchedule(loan!, profile.valuationDate);
        if (schedule.status !== "READY") reject("SOURCE_SCHEDULE_REVIEW_REQUIRED");
        for (const row of result) {
          const stress = selection.debtStress.find(s => s.loanId === change.sourceId && s.startMonth <= row.month && row.month <= s.endMonth);
          const amount = schedule.rows.filter(r => r.dueDate.slice(0, 7) === row.month).reduce((total, r) => total.plus(stress
            ? new D(r.principal).plus(r.interest).plus(r.fee).mul(stress.totalPaymentShare) : r.userPayment), new D(0));
          const payment = new D(row.debtPayment).minus(amount);
          if (payment.lt(0)) reject("SOURCE_SCHEDULE_MISMATCH");
          row.debtPayment = payment.toFixed();
        }
      } else {
        const asset = profile.assets.status === "KNOWN" ? profile.assets.entries.find(a => a.id === change.sourceId) : undefined;
        if (!asset || asset.currency !== "VND" || asset.retirementShare.status !== "KNOWN" || asset.ownershipShare.status !== "KNOWN") reject("DECLARED_ASSET_SOURCE_REQUIRED");
        const a = asset!, plan = a.housingPlan, share = new D(a.retirementShare.status === "KNOWN" ? a.retirementShare.value : "0");
        if (share.lte(0)) reject("ASSET_HAS_NO_RETIREMENT_SHARE");
        let month: string, amount: InstanceType<typeof D>, rent = false;
        if (plan?.status === "CONFIRMED") {
          const mapping = selection.housing.find(h => h.assetId === a.id);
          if (!mapping || plan.netAmount.status !== "KNOWN") reject("SOURCE_SCHEDULE_REVIEW_REQUIRED");
          month = plan.startMonth; rent = plan.kind === "RENT";
          amount = new D(plan.netAmount.status === "KNOWN" ? plan.netAmount.value : "0").mul(share)
            .mul(mapping!.amountScope === "WHOLE_ASSET" && a.ownershipShare.status === "KNOWN" ? a.ownershipShare.value : "1");
        } else {
          if (["PRIMARY_HOME", "REAL_ESTATE"].includes(a.type) || a.liquidity.status !== "KNOWN" || a.liquidity.value !== "LIQUID" ||
            a.availableFromMonth.status !== "KNOWN" || a.availableFromMonth.value <= profile.valuationDate.slice(0, 7) || a.value.status !== "KNOWN") reject("ASSET_NOT_A_DEFERRED_CAPITAL_SOURCE");
          month = a.availableFromMonth.status === "KNOWN" ? a.availableFromMonth.value : "";
          const declaredValue = selection.whatIf?.assetValues?.find(v => v.assetId === a.id)?.value ?? (a.value.status === "KNOWN" ? a.value.value : "0");
          amount = new D(declaredValue).mul(share).mul(a.ownershipShare.status === "KNOWN" ? a.ownershipShare.value : "0");
        }
        if (rent && futureChanges.some(c => c.field === "income" && c.endMonth >= rows[0].month && c.startMonth <= rows.at(-1)!.month)) reject("SOURCE_CHANGE_CONFLICTS_WITH_TOTAL_OVERRIDE");
        for (const row of result) if (rent ? row.month >= month! : row.month === month!) {
          const field = rent ? "income" : "capitalInjection", remaining = new D(row[field]).minus(amount!);
          if (remaining.lt(0)) reject("SOURCE_SCHEDULE_MISMATCH");
          row[field] = remaining.toFixed();
        }
      }
    }
    seen.push(change);
  }
  return result;
}
