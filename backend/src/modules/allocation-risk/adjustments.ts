import { addMonths } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import type { RetirementPreview } from "../retirement/schema";
import type { ProfileV2 } from "../profiles/schema-v2";
import { profileMonthlyCashflow } from "../profiles/cashflow";

/**
 * Spec §7.4 step 4 (and the §2 invariant): when no allocation reaches the essential-funding threshold,
 * return the behavioural adjustments that would: contribute more, retire later, or cut OPTIONAL spending.
 * Each lever is searched alone, on the same simulation (same seed, paths and allocation) as the selection,
 * so a "found" value is one at which the simulated p_essential reaches the threshold. Returns are never raised.
 */
export type Probe = { pEssential: number } | { limit: true } | { review: string };
export type Variant = { selection: RetirementPreview; profile?: ProfileV2 };
export type Evaluate = (variant: Variant) => Promise<Probe>;
type LeverStatus = "FOUND" | "NOT_FEASIBLE" | "NOT_APPLICABLE" | "REVIEW_REQUIRED";
type Lever = { status: LeverStatus; issues: string[]; evaluations: number; pEssential: number | null };

/** Search resolution: each probe is a full simulation, so steps are coarse enough to fit the run budget. */
export const CONTRIBUTION_STEP_VND = "500000";
export const RETIREMENT_STEP_MONTHS = 6;
export const RETIREMENT_MAX_DELAY_MONTHS = 120;
export const OPTIONAL_CUT_STEP_PERCENT = 5;
export const GOAL_DEFER_STEP_MONTHS = 6;
export const GOAL_DEFER_MAX_MONTHS = 60;

export async function searchAdjustments(input: {
  selection: RetirementPreview; profile: ProfileV2; threshold: string; retirementMonth: string;
  /** Monthly contribution capacity of each accumulation month (deterministic plan rows). */
  accumulationCapacity: string[]; evaluate: Evaluate; outOfTime: () => boolean;
}) {
  const { selection, profile, threshold, evaluate, outOfTime } = input;
  let stopped = false;
  const passes = (p: { pEssential: number }) => new D(p.pEssential).gte(threshold);
  /** One probe; null when the budget is spent or the variant cannot be evaluated. */
  const probe = async (lever: Lever, variant: Variant) => {
    if (stopped || outOfTime()) { stopped = true; return null; }
    lever.evaluations++;
    const result = await evaluate(variant);
    if ("limit" in result) { stopped = true; return null; }
    if ("review" in result) { if (!lever.issues.includes(result.review)) lever.issues.push(result.review); return null; }
    return result;
  };
  const unfinished = (lever: Lever) => {
    lever.status = "REVIEW_REQUIRED";
    if (stopped && !lever.issues.includes("ADJUSTMENT_RUNTIME_LIMIT")) lever.issues.push("ADJUSTMENT_RUNTIME_LIMIT");
  };
  /** Smallest step k in (0, steps] that passes, assuming more of the lever never hurts on the same paths
   * (step 0 is today's plan, which fails). undefined = unfinished, null = even the largest step fails. */
  const bisect = async (lever: Lever, steps: number, at: (k: number) => Variant) => {
    const top = await probe(lever, at(steps));
    if (!top) return undefined;
    if (!passes(top)) return null;
    let low = 0, high = steps, best = top.pEssential;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2), r = await probe(lever, at(mid));
      if (!r) return undefined;
      if (passes(r)) { high = mid; best = r.pEssential; } else low = mid;
    }
    return { k: high, p: best };
  };

  // 1. Contribute more, within the declared monthly capacity.
  const step = new D(CONTRIBUTION_STEP_VND), current = new D(selection.monthlyContribution);
  const contribution: Lever & { requiredMonthlyContribution: string | null; additionalMonthlyContribution: string | null; withinCapacityEveryMonth: boolean | null } =
    { status: "NOT_APPLICABLE", issues: [], evaluations: 0, pEssential: null, requiredMonthlyContribution: null, additionalMonthlyContribution: null, withinCapacityEveryMonth: null };
  if (!input.accumulationCapacity.length) contribution.issues.push("NO_ACCUMULATION_PERIOD");
  else if (selection.contributionSchedule.length) { contribution.status = "REVIEW_REQUIRED"; contribution.issues.push("CONTRIBUTION_SCHEDULE_DECLARED"); }
  else {
    const capacity = input.accumulationCapacity.map(v => new D(v)), maxCapacity = D.max(...capacity), minCapacity = D.min(...capacity);
    const steps = maxCapacity.minus(current).div(step).toDecimalPlaces(0, D.ROUND_DOWN).toNumber();
    if (steps < 1) { contribution.status = "NOT_FEASIBLE"; contribution.issues.push("CONTRIBUTION_CAPACITY_REACHED"); }
    else {
      const amount = (k: number) => current.plus(step.mul(k));
      const found = await bisect(contribution, steps, k => ({ selection: { ...selection, monthlyContribution: amount(k).toFixed() } }));
      if (found === undefined) unfinished(contribution);
      else if (found === null) { contribution.status = "NOT_FEASIBLE"; contribution.issues.push("THRESHOLD_NOT_REACHED_WITHIN_CAPACITY"); }
      else {
        const required = amount(found.k);
        contribution.status = "FOUND"; contribution.pEssential = found.p; contribution.requiredMonthlyContribution = required.toFixed();
        contribution.additionalMonthlyContribution = required.minus(current).toFixed(); contribution.withinCapacityEveryMonth = required.lte(minCapacity);
      }
    }
  }

  // 2. Retire later, in RETIREMENT_STEP_MONTHS steps, up to RETIREMENT_MAX_DELAY_MONTHS and one year before the plan end.
  const monthIndex = (m: string) => +m.slice(0, 4) * 12 + +m.slice(5, 7);
  const maxDelay = Math.min(RETIREMENT_MAX_DELAY_MONTHS, monthIndex(selection.endMonth) - monthIndex(input.retirementMonth) - 12);
  const retirementSteps = Math.floor(maxDelay / RETIREMENT_STEP_MONTHS);
  const retirement: Lever & { retirementMonth: string | null; delayMonths: number | null } =
    { status: "NOT_APPLICABLE", issues: [], evaluations: 0, pEssential: null, retirementMonth: null, delayMonths: null };
  if (retirementSteps < 1) retirement.issues.push("PLAN_END_TOO_CLOSE");
  else {
    const delay = (k: number) => k * RETIREMENT_STEP_MONTHS;
    const found = await bisect(retirement, retirementSteps, k => ({ selection: { ...selection, whatIf: { ...selection.whatIf, retirementMonth: addMonths(input.retirementMonth, delay(k)) } } }));
    if (found === undefined) unfinished(retirement);
    else if (found === null) { retirement.status = "NOT_FEASIBLE"; retirement.issues.push("THRESHOLD_NOT_REACHED_WITHIN_DELAY_LIMIT"); }
    else { retirement.status = "FOUND"; retirement.pEssential = found.p; retirement.delayMonths = delay(found.k); retirement.retirementMonth = addMonths(input.retirementMonth, delay(found.k)); }
  }

  // 3. Optional spending only (spec §7.4: "giảm chi tiêu tùy chọn"); essential spending is never cut.
  const optionalIds = profile.expenses.status === "KNOWN" ? profile.expenses.entries
    .filter(e => e.category === "OPTIONAL" && e.amount.status === "KNOWN" && new D(e.amount.value).gt(0)).map(e => e.id) : [];
  const optionalToday = profile.expenses.status === "KNOWN" && optionalIds.length ? profileMonthlyCashflow({ income: { status: "KNOWN", entries: [] },
    expenses: { ...profile.expenses, entries: profile.expenses.entries.filter(e => optionalIds.includes(e.id)) } }, profile.valuationDate.slice(0, 7)).expenses : null;
  const optional: Lever & { cutPercent: number | null; keepPercent: number | null; monthlyOptionalToday: string | null; monthlyCutToday: string | null } =
    { status: "NOT_APPLICABLE", issues: [], evaluations: 0, pEssential: null, cutPercent: null, keepPercent: null,
      monthlyOptionalToday: optionalToday?.toFixed() ?? null, monthlyCutToday: null };
  if (!optionalIds.length) optional.issues.push("NO_OPTIONAL_SPENDING_DECLARED");
  else {
    // Every OPTIONAL expense keeps (100 - cut)% of its declared amount, before and after retirement.
    const scaled = (cut: number): ProfileV2 => profile.expenses.status !== "KNOWN" ? profile : { ...profile, expenses: { ...profile.expenses,
      entries: profile.expenses.entries.map(e => !optionalIds.includes(e.id) || e.amount.status !== "KNOWN" ? e
        : { ...e, amount: { status: "KNOWN" as const, value: new D(e.amount.value).mul(100 - cut).div(100).toDecimalPlaces(0, D.ROUND_DOWN).toFixed() } }) } };
    const cutAt = (k: number) => k * OPTIONAL_CUT_STEP_PERCENT;
    const found = await bisect(optional, Math.floor(100 / OPTIONAL_CUT_STEP_PERCENT), k => ({ selection, profile: scaled(cutAt(k)) }));
    if (found === undefined) unfinished(optional);
    else if (found === null) { optional.status = "NOT_FEASIBLE"; optional.issues.push("THRESHOLD_NOT_REACHED_WITHOUT_OPTIONAL_SPENDING"); }
    else {
      optional.status = "FOUND"; optional.pEssential = found.p; optional.cutPercent = cutAt(found.k); optional.keepPercent = 100 - cutAt(found.k);
      optional.monthlyCutToday = optionalToday ? optionalToday.mul(cutAt(found.k)).div(100).toDecimalPlaces(0, D.ROUND_UP).toFixed() : null;
    }
  }

  // 4. Defer flexible deferrable goals (spec B1-2), in GOAL_DEFER_STEP_MONTHS steps up to GOAL_DEFER_MAX_MONTHS.
  // Shifting goal dueMonth changes Step-3 capital separation PV/treatment; each variant rebuilds capital via evaluate().
  const deferrableGoals = profile.goals?.status === "KNOWN" ? profile.goals.entries.filter(
    g => g.priority.status === "KNOWN" && g.priority.value === "FLEXIBLE"
      && g.deferrable.status === "KNOWN" && g.deferrable.value
      && g.dueMonth.status === "KNOWN" && g.amountToday.status === "KNOWN" && new D(g.amountToday.value).gt(0),
  ) : [];
  const deferFlexibleGoals: Lever & { deferMonths: number | null; deferredGoalIds: string[]; shiftedGoals: Array<{ id: string; fromMonth: string; toMonth: string }> } =
    { status: "NOT_APPLICABLE", issues: [], evaluations: 0, pEssential: null, deferMonths: null, deferredGoalIds: [], shiftedGoals: [] };
  if (!deferrableGoals.length) deferFlexibleGoals.issues.push("NO_DEFERRABLE_GOAL");
  else {
    const clampToEnd = (m: string) => m > selection.endMonth ? selection.endMonth : m;
    const maxShift = Math.max(...deferrableGoals.map(g => Math.min(GOAL_DEFER_MAX_MONTHS, Math.max(0, monthIndex(selection.endMonth) - monthIndex(g.dueMonth.status === "KNOWN" ? g.dueMonth.value : selection.endMonth)))));
    const goalSteps = Math.floor(maxShift / GOAL_DEFER_STEP_MONTHS);
    if (goalSteps < 1) deferFlexibleGoals.issues.push("PLAN_END_TOO_CLOSE");
    else {
      const deferIds = new Set(deferrableGoals.map(g => g.id));
      const shiftProfile = (delay: number): ProfileV2 => profile.goals?.status !== "KNOWN" ? profile : {
        ...profile,
        goals: {
          ...profile.goals,
          entries: profile.goals.entries.map(g => !deferIds.has(g.id) || g.dueMonth.status !== "KNOWN" ? g
            : { ...g, dueMonth: { status: "KNOWN" as const, value: clampToEnd(addMonths(g.dueMonth.value, delay)) } }),
        },
      };
      const delayAt = (k: number) => k * GOAL_DEFER_STEP_MONTHS;
      // Dated goals and market paths need not be monotone: certify the first passing six-month step.
      let found: { k: number; p: number } | null | undefined = null;
      for (let k = 1; k <= goalSteps; k++) {
        const result = await probe(deferFlexibleGoals, { selection, profile: shiftProfile(delayAt(k)) });
        if (!result) { found = undefined; break; }
        if (passes(result)) { found = { k, p: result.pEssential }; break; }
      }
      if (found === undefined) unfinished(deferFlexibleGoals);
      else if (found === null) { deferFlexibleGoals.status = "NOT_FEASIBLE"; deferFlexibleGoals.issues.push("THRESHOLD_NOT_REACHED_WITHIN_GOAL_DEFER_LIMIT"); }
      else {
        const delay = delayAt(found.k);
        deferFlexibleGoals.status = "FOUND"; deferFlexibleGoals.pEssential = found.p; deferFlexibleGoals.deferMonths = delay;
        deferFlexibleGoals.deferredGoalIds = deferrableGoals.map(g => g.id);
        deferFlexibleGoals.shiftedGoals = deferrableGoals.map(g => {
          const fromMonth = g.dueMonth.status === "KNOWN" ? g.dueMonth.value : "";
          return { id: g.id, fromMonth, toMonth: clampToEnd(addMonths(fromMonth, delay)) };
        });
      }
    }
  }

  const levers = [contribution, retirement, optional, deferFlexibleGoals];
  return {
    status: levers.some(l => l.status === "FOUND") ? "READY" as const : levers.some(l => l.status === "REVIEW_REQUIRED") ? "REVIEW_REQUIRED" as const : "NOT_FEASIBLE" as const,
    contribution, retirement, optionalSpending: optional, deferFlexibleGoals,
    evaluations: levers.reduce((s, l) => s + l.evaluations, 0),
    steps: { contributionVnd: CONTRIBUTION_STEP_VND, retirementMonths: RETIREMENT_STEP_MONTHS, optionalCutPercent: OPTIONAL_CUT_STEP_PERCENT, goalDeferMonths: GOAL_DEFER_STEP_MONTHS },
    limitations: ["ONE_LEVER_AT_A_TIME", "SAME_SEED_PATHS_AND_ALLOCATION_AS_SELECTION", "RETIREMENT_SEARCH_ASSUMES_LATER_IS_NOT_WORSE",
      "OPTIONAL_SPENDING_ONLY_ESSENTIAL_NEVER_CUT", "ONLY_CONFIRMED_DEPOSITS_ARE_INVESTED", "RETURNS_NEVER_RAISED"],
  };
}
