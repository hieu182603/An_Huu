import { AssumptionDecimal as D } from "../assumptions/series";
import type { AssumptionDocument } from "../assumptions/schema";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { CapitalSeparation } from "./separation";

export type LiquidityHorizon = {
  months: 12 | 36 | 60;
  amount: string;
  coveredByReserved: string;
  uncovered: string;
};

export type LiquidityRequirementResult = {
  horizons: LiquidityHorizon[];
  issues: Array<{ path: string; code: string }>;
};

export type LiquidityReconciliationSuggestion = {
  goalId: string;
  label: string;
  dueMonth: string;
  monthsUntilDue: number;
  amountToday: string;
};

export type LiquidityReconciliationItem = {
  horizonKey: "y1" | "y3" | "y5";
  horizonMonths: 12 | 36 | 60;
  amount: string;
  matchedGoalId: string | null;
  suggestions: LiquidityReconciliationSuggestion[];
};

const HORIZONS = [
  { key: "y1" as const, months: 12 as const },
  { key: "y3" as const, months: 36 as const },
  { key: "y5" as const, months: 60 as const },
];

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));

/** Spec §3.1 / B2-3: liquidity required over 12/36/60 months.
 * Goals already separated in Step 3 (RESERVED) are coveredByReserved and never double-counted in uncovered.
 * Unmatched liquidityNeeds (no matchedGoalId pointing to a RESERVED goal) contribute to uncovered. */
export function liquidityRequirement(
  profile: ProfileV2,
  capital: CapitalSeparation,
  _assumptions?: AssumptionDocument,
): LiquidityRequirementResult {
  const issues: Array<{ path: string; code: string }> = [];
  if (capital.status !== "READY") issues.push({ path: "capital", code: "CAPITAL_SEPARATION_REQUIRED" });
  const reservedGoalIds = new Set<string>();
  for (const goal of capital.goals) {
    if (goal.treatment !== "RESERVED") continue;
    reservedGoalIds.add(goal.id);
    if (goal.presentValue === null) issues.push({ path: `goals.${goal.id}`, code: "RESERVED_GOAL_PV_REQUIRED" });
  }
  const needs = profile.liquidityNeeds;
  for (const h of HORIZONS) {
    if (needs?.[h.key]?.status === "UNKNOWN") issues.push({ path: `liquidityNeeds.${h.key}`, code: "LIQUIDITY_NEED_UNKNOWN" });
  }
  const horizons: LiquidityHorizon[] = HORIZONS.map(({ months }) => {
    let covered = new D(0);
    for (const goal of capital.goals) {
      if (goal.treatment === "RESERVED" && goal.monthsUntilDue >= 0 && goal.monthsUntilDue <= months && goal.presentValue !== null) {
        covered = covered.plus(goal.presentValue);
      }
    }
    // Needs are cumulative: confirmed earlier matches still cover their share in a later declaration.
    // A match can exempt only the goal's actual amount, available inside this need's horizon.
    let uncovered = new D(0);
    for (const h of HORIZONS) {
      if (h.months > months) break;
      const entry = needs?.[h.key];
      if (entry?.status !== "KNOWN") continue;
      const matched = new Map<string, InstanceType<typeof D>>();
      for (const prior of HORIZONS) {
        if (prior.months > h.months) break;
        const confirmation = needs?.[prior.key];
        if (confirmation?.status !== "KNOWN" || !confirmation.matchedGoalId || !reservedGoalIds.has(confirmation.matchedGoalId)) continue;
        const reserved = capital.goals.find(g => g.id === confirmation.matchedGoalId);
        const goal = profile.goals?.status === "KNOWN" ? profile.goals.entries.find(g => g.id === confirmation.matchedGoalId) : undefined;
        if (!reserved || reserved.monthsUntilDue < 0 || reserved.monthsUntilDue > prior.months || goal?.amountToday.status !== "KNOWN") continue;
        const coveredAmount = D.min(new D(confirmation.value), new D(goal.amountToday.value));
        matched.set(reserved.id, D.max(matched.get(reserved.id) ?? new D(0), coveredAmount));
      }
      const matchedTotal = [...matched.values()].reduce((sum, value) => sum.plus(value), new D(0));
      uncovered = D.max(uncovered, D.max(0, new D(entry.value).minus(matchedTotal)));
    }
    return {
      months,
      amount: covered.plus(uncovered).toFixed(),
      coveredByReserved: covered.toFixed(),
      uncovered: uncovered.toFixed(),
    };
  });
  return { horizons, issues };
}

/** Spec B3-1: suggest goals within +-3 months and +-10% amount for each unmatched liquidityNeed.
 * Never auto-matches; customer confirms via profile update (matchedGoalId). */
export function reconcileLiquidityNeeds(profile: ProfileV2): LiquidityReconciliationItem[] {
  const needs = profile.liquidityNeeds;
  if (!needs) return [];
  const valIdx = monthIndex(profile.valuationDate.slice(0, 7));
  const goals = profile.goals?.status === "KNOWN" ? profile.goals.entries : [];
  const items: LiquidityReconciliationItem[] = [];
  for (const { key, months } of HORIZONS) {
    const entry = needs[key];
    if (entry?.status !== "KNOWN" || new D(entry.value).lte(0)) continue;
    if (entry.matchedGoalId) {
      items.push({ horizonKey: key, horizonMonths: months, amount: entry.value, matchedGoalId: entry.matchedGoalId, suggestions: [] });
      continue;
    }
    const needAmount = new D(entry.value);
    const tolerance = needAmount.mul("0.1");
    const suggestions: LiquidityReconciliationSuggestion[] = [];
    for (const goal of goals) {
      if (goal.dueMonth.status !== "KNOWN" || goal.amountToday.status !== "KNOWN") continue;
      const monthsUntilDue = monthIndex(goal.dueMonth.value) - valIdx;
      if (Math.abs(monthsUntilDue - months) > 3) continue;
      if (new D(goal.amountToday.value).minus(needAmount).abs().gt(tolerance)) continue;
      suggestions.push({
        goalId: goal.id,
        label: goal.label,
        dueMonth: goal.dueMonth.value,
        monthsUntilDue,
        amountToday: goal.amountToday.value,
      });
    }
    items.push({ horizonKey: key, horizonMonths: months, amount: entry.value, matchedGoalId: null, suggestions });
  }
  return items;
}
