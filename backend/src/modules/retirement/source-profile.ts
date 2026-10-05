import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { profileV2Schema, type ProfileV2 } from "../profiles/schema-v2";
import { buildContractSchedule } from "../debts/loan";
import { RetirementDecimal as D, type MonthlyInput } from "./engine";
import type { RetirementPreview } from "./schema";
import { assertSourceTotals, sealSourceRegistry, sealSourceRevision, type SourceCell, type SourceRevision } from "./sources";

/** Build identities from pinned inputs, never labels or differences between totals.
 * baselineRows must be the original prepared v3 rows, before actual adjustments.
 * The final reconciliation deliberately fails closed if the old composer changes. */
export function profileSourceRegistry(profile: ProfileV2, selection: RetirementPreview, baselineRows: MonthlyInput[], originHash: string) {
  if (!baselineRows.length) throw new AppError(422, "SOURCE_COMPOSITION_EMPTY", "Thiếu lịch nguồn gốc.");
  const data = profileV2Schema.parse(profile), first = baselineRows[0].month, last = baselineRows.at(-1)!.month;
  for (const override of selection.whatIf?.assetValues ?? []) {
    const asset = data.assets.status === "KNOWN" ? data.assets.entries.find(a => a.id === override.assetId) : undefined;
    if (!asset) throw new AppError(422, "UNKNOWN_ASSET", "Nguồn tài sản không tồn tại.");
    asset.value = { status: "KNOWN", value: override.value };
  }
  const retirement = selection.whatIf?.retirementMonth ?? (data.personal.desiredRetirementMonth.status === "KNOWN" ? data.personal.desiredRetirementMonth.value : "");
  const revisions: SourceRevision[] = [];
  const add = (sourceId: string, kind: SourceRevision["kind"], evidence: unknown, schedule: SourceCell[], origin: SourceRevision["origin"] = "PINNED_PROFILE") => {
    revisions.push(sealSourceRevision({ sourceId, revision: 1, previousHash: null, scope: "PLAN_VERSION", kind, origin,
      effectiveFromMonth: first, effectiveToMonth: last, knownOn: data.valuationDate, evidenceHash: digest(evidence),
      commandId: `initial:${sourceId}`, confirmation: "HYPOTHETICAL", operation: "CREATE", schedule }));
  };
  const linked = new Set(selection.housing.map(h => h.linkedIncomeId).filter(Boolean));
  for (const entry of data.income.status === "KNOWN" ? data.income.entries : []) {
    if (entry.source === "PENSION" || linked.has(entry.id)) continue;
    const schedule = baselineRows.filter(r => r.month >= entry.startMonth && (entry.endMonth === null || r.month <= entry.endMonth) &&
      (r.month < retirement || selection.retirementIncomeIds.includes(entry.id))).map(r => ({ month: r.month, metric: "income" as const,
        amount: entry.amount.status === "KNOWN" && entry.currency === "VND" ? entry.amount.value : invalid() }));
    add(`profile:income:${entry.id}`, "INCOME", entry, schedule);
  }
  for (const entry of data.expenses.status === "KNOWN" ? data.expenses.entries : []) {
    if (entry.category === "DEBT_PAYMENT") continue;
    const schedule = baselineRows.filter(r => r.month >= entry.startMonth && (entry.endMonth === null || r.month <= entry.endMonth) &&
      (r.month < retirement || selection.retirementAdditionalExpenseIds.includes(entry.id))).map(r => ({ month: r.month,
        metric: r.month < retirement ? "livingExpense" as const : "additionalExpense" as const,
        amount: entry.amount.status === "KNOWN" && entry.currency === "VND" ? entry.amount.value : invalid() }));
    add(`profile:expense:${entry.id}`, "EXPENSE", entry, schedule);
  }
  add("plan:retirement-living", "EXPENSE", { monthlyExpenseToday: selection.monthlyExpenseToday, retirement,
    inflation: baselineRows.map(r => r.inflationFactor) }, baselineRows.filter(r => r.month >= retirement)
    .map(r => ({ month: r.month, metric: "livingExpense", amount: r.livingExpense })), "PLAN_ASSUMPTION");
  add("plan:reserve", "EXPENSE", { monthlyReserve: selection.monthlyReserve }, baselineRows.filter(r => r.month < retirement)
    .map(r => ({ month: r.month, metric: "additionalExpense", amount: selection.monthlyReserve })), "PLAN_ASSUMPTION");
  if (data.pension?.status === "KNOWN") add("profile:pension", "PENSION", { pension: data.pension, start: data.personal.pensionStartMonth },
    baselineRows.map(r => ({ month: r.month, metric: "pension", amount: r.pension })));
  for (const debt of data.debts.status === "KNOWN" ? data.debts.entries : []) {
    const payments = new Map<string, InstanceType<typeof D>>();
    if (!(debt.outstandingBalance.status === "KNOWN" && new D(debt.outstandingBalance.value).isZero())) {
      const schedule = buildContractSchedule(debt, data.valuationDate);
      if (schedule.status !== "READY") invalid();
      for (const row of schedule.rows) {
        const month = row.dueDate.slice(0, 7);
        if (month < first || month > last) continue;
        const stress = selection.debtStress.find(s => s.loanId === debt.id && s.startMonth <= month && month <= s.endMonth);
        const amount = stress ? new D(row.principal).plus(row.interest).plus(row.fee).mul(stress.totalPaymentShare) : new D(row.userPayment);
        payments.set(month, (payments.get(month) ?? new D(0)).plus(amount));
      }
    }
    add(`profile:debt:${debt.id}`, "DEBT", { debt, stress: selection.debtStress.filter(s => s.loanId === debt.id) },
      [...payments].map(([month, amount]) => ({ month, metric: "debtPayment", amount: amount.toFixed() })));
  }
  for (const asset of data.assets.status === "KNOWN" ? data.assets.entries : []) {
    if (asset.retirementShare.status === "KNOWN" && new D(asset.retirementShare.value).isZero()) continue;
    let schedule: SourceCell[] = [];
    const plan = asset.housingPlan, mapping = selection.housing.find(h => h.assetId === asset.id);
    if (plan?.status === "CONFIRMED") {
      if (!mapping || plan.netAmount.status !== "KNOWN" || asset.retirementShare.status !== "KNOWN" || asset.ownershipShare.status !== "KNOWN") invalid();
      const amount = new D(plan.netAmount.status === "KNOWN" ? plan.netAmount.value : invalid())
        .mul(asset.retirementShare.status === "KNOWN" ? asset.retirementShare.value : invalid())
        .mul(mapping!.amountScope === "WHOLE_ASSET" && asset.ownershipShare.status === "KNOWN" ? asset.ownershipShare.value : "1").toFixed();
      schedule = baselineRows.filter(r => plan.kind === "RENT" ? r.month >= plan.startMonth : r.month === plan.startMonth)
        .map(r => ({ month: r.month, metric: plan.kind === "RENT" ? "income" : "capitalInjection", amount }));
    } else if (!["PRIMARY_HOME", "REAL_ESTATE"].includes(asset.type) && asset.liquidity.status === "KNOWN" && asset.liquidity.value === "LIQUID" &&
      asset.availableFromMonth.status === "KNOWN" && asset.availableFromMonth.value > first) {
      const month = asset.availableFromMonth.value;
      const amount = new D(asset.value.status === "KNOWN" ? asset.value.value : invalid())
        .mul(asset.retirementShare.status === "KNOWN" ? asset.retirementShare.value : invalid())
        .mul(asset.ownershipShare.status === "KNOWN" ? asset.ownershipShare.value : invalid()).toFixed();
      if (month <= last) schedule = [{ month, metric: "capitalInjection", amount }];
    } else continue; // Initial liquid assets belong to initialCapital, not a second injection.
    add(`profile:asset:${asset.id}`, "ASSET_CAPITAL", { asset, mapping: mapping ?? null }, schedule);
  }
  const registry = sealSourceRegistry({ schemaVersion: 1, startMonth: first, endMonth: last, knowledgeAsOf: data.valuationDate, originHash, revisions });
  assertSourceTotals(registry, baselineRows);
  return registry;
}
function invalid(): never { throw new AppError(422, "SOURCE_PROFILE_INCOMPLETE", "Nguồn chưa đủ dữ liệu để tái lập lịch."); }
