import { RetirementDecimal as D, type ProjectionInput } from "./engine";
import { addMonths } from "../../common/calendar";
import { buildContractSchedule } from "../debts/loan";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { CapitalSeparation } from "../capital/separation";

export type ObligationKind =
  | "ESSENTIAL_EXPENSE"
  | "RETIREMENT_LIVING"
  | "CONTRACT_DEBT"
  | "ESSENTIAL_GOAL"
  | "MANDATORY_EXPENSE"
  | "FLEXIBLE_GOAL"
  | "OPTIONAL_EXPENSE"
  | "LEGACY_GOAL";

export type ObligationRow = {
  kind: ObligationKind;
  id: string;
  label: string;
  priorityRank: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  firstMonth: string | null;
  lastMonth: string | null;
  totalNominal: string | null;
  presentValue?: string | null;
  deferrable: boolean;
};

export type ObligationPreparedInput = {
  endMonth?: string;
  retirementMonth?: string;
  capital?: CapitalSeparation;
  replayInput?: ProjectionInput | null;
  retirementAdditionalExpenseIds?: string[];
};

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
const monthsBetween = (a: string, b: string) => monthIndex(b) - monthIndex(a) + 1;

/** Spec B1-1 (§2 step 1, §3.1): priority-ordered schedule of household obligations (ranks 1..7). */
export function obligationSchedule(profile: ProfileV2, prepared?: ObligationPreparedInput): ObligationRow[] {
  const startMonth = profile.valuationDate.slice(0, 7);
  const replay = prepared?.replayInput ?? null;
  const horizonEnd = prepared?.endMonth ?? replay?.rows.at(-1)?.month ?? null;
  const retirementMonth = replay?.retirementMonth ?? prepared?.retirementMonth;
  const clippedEnd = (end: string | null) => horizonEnd && (end === null || end > horizonEnd) ? horizonEnd : end;
  const rows: ObligationRow[] = [];

  // Expenses: rank 1 (ESSENTIAL), rank 4 (HEALTH/INSURANCE/DEPENDENT), rank 6 (OPTIONAL). Skip DEBT_PAYMENT (covered in rank 2).
  if (profile.expenses.status === "KNOWN") {
    for (const entry of profile.expenses.entries) {
      if (entry.category === "DEBT_PAYMENT") continue;
      if (entry.endMonth !== null && entry.endMonth < startMonth) continue;
      const firstMonth = entry.startMonth < startMonth ? startMonth : entry.startMonth;
      if (horizonEnd && firstMonth > horizonEnd) continue;
      let lastMonth = clippedEnd(entry.frequency === "ONCE" ? entry.startMonth : entry.endMonth);
      // A prepared plan replaces the unselected household expenses with retirement living.
      // Keep workspace declarations intact until the caller supplies that explicit selection.
      if (replay && retirementMonth && prepared?.retirementAdditionalExpenseIds !== undefined
        && !prepared.retirementAdditionalExpenseIds.includes(entry.id)) {
        const lastAccumulation = addMonths(retirementMonth, -1);
        if (lastMonth === null || lastMonth > lastAccumulation) lastMonth = lastAccumulation;
      }
      if (lastMonth !== null && lastMonth < firstMonth) continue;
      let totalNominal: string | null = null;
      if (entry.currency === "VND" && entry.amount.status === "KNOWN") {
        if (entry.frequency === "ONCE") totalNominal = entry.amount.value;
        else if (lastMonth !== null && lastMonth >= firstMonth) totalNominal = new D(entry.amount.value).mul(monthsBetween(firstMonth, lastMonth)).toFixed();
      }
      const [kind, priorityRank]: [ObligationKind, 1 | 4 | 6] =
        entry.category === "ESSENTIAL" ? ["ESSENTIAL_EXPENSE", 1]
          : entry.category === "OPTIONAL" ? ["OPTIONAL_EXPENSE", 6]
            : ["MANDATORY_EXPENSE", 4];
      rows.push({ kind, id: entry.id, label: entry.label, priorityRank, firstMonth, lastMonth, totalNominal, deferrable: false });
    }
  }

  // Retirement living expense from prepared projection (rank 1) when available.
  if (replay && replay.rows.length > 0) {
    const retiredRows = replay.rows.filter(r => r.month >= replay.retirementMonth && r.month >= startMonth && (!horizonEnd || r.month <= horizonEnd));
    if (retiredRows.length > 0) {
      const total = retiredRows.reduce((s, r) => s.plus(r.livingExpense), new D(0));
      rows.push({
        kind: "RETIREMENT_LIVING",
        id: "retirement-living",
        label: "Sinh hoạt hưu trí",
        priorityRank: 1,
        firstMonth: retiredRows[0].month,
        lastMonth: retiredRows[retiredRows.length - 1].month,
        totalNominal: total.toFixed(),
        deferrable: false,
      });
    }
  }

  // Workspace can expose the dated obligation before an exact retirement cashflow has been calculated.
  if (!replay && prepared?.retirementMonth && (!horizonEnd || horizonEnd >= prepared.retirementMonth)) {
    rows.push({ kind: "RETIREMENT_LIVING", id: "retirement-living", label: "Sinh hoạt hưu trí", priorityRank: 1,
      firstMonth: prepared.retirementMonth < startMonth ? startMonth : prepared.retirementMonth, lastMonth: horizonEnd, totalNominal: null, deferrable: false });
  }

  // Debts: rank 2 (contract schedule via buildContractSchedule when available; otherwise declared schedule).
  if (profile.debts.status === "KNOWN") {
    for (const debt of profile.debts.entries) {
      if (debt.outstandingBalance.status === "KNOWN" && new D(debt.outstandingBalance.value).isZero()) continue;
      if (debt.contract?.status === "KNOWN") {
        const schedule = buildContractSchedule(debt, profile.valuationDate);
        if (schedule.status === "READY" && schedule.rows.length > 0) {
          const active = schedule.rows.filter(r => r.dueDate.slice(0, 7) >= startMonth && (!horizonEnd || r.dueDate.slice(0, 7) <= horizonEnd));
          if (active.length === 0) continue;
          const total = active.reduce((s, r) => s.plus(r.userPayment), new D(0));
          rows.push({
            kind: "CONTRACT_DEBT",
            id: debt.id,
            label: debt.label,
            priorityRank: 2,
            firstMonth: active[0].dueDate.slice(0, 7),
            lastMonth: active[active.length - 1].dueDate.slice(0, 7),
            totalNominal: total.toFixed(),
            deferrable: false,
          });
          continue;
        }
      }
      if (debt.endMonth !== null && debt.endMonth < startMonth) continue;
      const firstMonth = debt.startMonth < startMonth ? startMonth : debt.startMonth;
      if (horizonEnd && firstMonth > horizonEnd) continue;
      const lastMonth = clippedEnd(debt.frequency === "ONCE" ? debt.startMonth : debt.endMonth);
      if (lastMonth !== null && lastMonth < firstMonth) continue;
      let totalNominal: string | null = null;
      if (debt.currency === "VND" && debt.contract?.status !== "KNOWN" && debt.payment.status === "KNOWN" && debt.paymentShare.status === "KNOWN") {
        const monthly = new D(debt.payment.value).mul(debt.paymentShare.value);
        if (debt.frequency === "ONCE") totalNominal = monthly.toFixed();
        else if (lastMonth !== null && lastMonth >= firstMonth) totalNominal = monthly.mul(monthsBetween(firstMonth, lastMonth)).toFixed();
      }
      rows.push({ kind: "CONTRACT_DEBT", id: debt.id, label: debt.label, priorityRank: 2, firstMonth, lastMonth, totalNominal, deferrable: false });
    }
  }

  // Goals: rank 3 (ESSENTIAL), rank 5 (FLEXIBLE), rank 7 (LEGACY).
  if (profile.goals?.status === "KNOWN") {
    const capGoals = new Map((prepared?.capital?.goals ?? []).map(g => [g.id, g]));
    const projectedGoals = new Map((replay?.protection?.goals ?? []).map(g => [g.id, g]));
    for (const goal of profile.goals.entries) {
      const priority = goal.priority.status === "KNOWN" ? goal.priority.value : "FLEXIBLE";
      const [kind, priorityRank]: [ObligationKind, 3 | 5 | 7] =
        priority === "ESSENTIAL" ? ["ESSENTIAL_GOAL", 3]
          : priority === "LEGACY" ? ["LEGACY_GOAL", 7]
            : ["FLEXIBLE_GOAL", 5];
      const dueMonth = goal.dueMonth.status === "KNOWN" ? goal.dueMonth.value : null;
      const cap = capGoals.get(goal.id);
      // amountToday is a valuation-month amount, never an unadjusted future obligation.
      // Protected projections already carry the exact nominal amount used by the engine.
      const projected = projectedGoals.get(goal.id);
      const totalNominal = projected?.amount ?? cap?.futureAmount
        ?? (dueMonth === startMonth && goal.amountToday.status === "KNOWN" ? goal.amountToday.value : null);
      const deferrable = goal.deferrable.status === "KNOWN" ? goal.deferrable.value : false;
      rows.push({
        kind,
        id: goal.id,
        label: goal.label,
        priorityRank,
        firstMonth: dueMonth,
        lastMonth: dueMonth,
        totalNominal,
        ...(cap && cap.presentValue !== null ? { presentValue: cap.presentValue } : {}),
        deferrable,
      });
    }
  }

  return rows.sort((a, b) =>
    a.priorityRank - b.priorityRank
    || (a.firstMonth ?? "9999-99").localeCompare(b.firstMonth ?? "9999-99")
    || a.id.localeCompare(b.id));
}

/** Spec B1-3: warn if dependents > 0 without any declared DEPENDENT expense. Never fabricates cashflows. */
export function dependentWarnings(profile: ProfileV2): Array<{ path: string; code: string }> {
  if (profile.personal.dependents?.status !== "KNOWN" || profile.personal.dependents.value <= 0) return [];
  const hasDependentExpense = profile.expenses.status === "KNOWN" && profile.expenses.entries.some(e => e.category === "DEPENDENT");
  return hasDependentExpense ? [] : [{ path: "personal.dependents", code: "DEPENDENT_EXPENSES_NOT_DECLARED" }];
}
