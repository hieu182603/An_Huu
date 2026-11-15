import { addMonths } from "../../common/calendar";
import { RetirementDecimal as D } from "./engine";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { AssumptionDocument } from "../assumptions/schema";
/** New survey profiles opt into dated one-off goals. Legacy captures have no
 * marker and retain their historical composer. Protected-capital previews own
 * their goal ledger separately and must not charge these rows a second time. */
export function surveyGoalExpenses(profile: ProfileV2, assumptions: AssumptionDocument, endMonth: string, protectedFunding = false) {
  const entries: Array<{ id: string; month: string; amount: string }> = [], issues: Array<{ path: string; code: string }> = [];
  if (!profile.quickStartSurvey || protectedFunding || profile.goals?.status !== "KNOWN") return { entries, issues };
  const first = profile.valuationDate.slice(0, 7);
  for (const goal of profile.goals.entries) {
    const path = `goals.${goal.id}`;
    if (goal.amountToday.status !== "KNOWN" || goal.dueMonth.status !== "KNOWN") { issues.push({ path, code: "GOAL_HORIZON_OR_AMOUNT_REQUIRED" }); continue; }
    const due = goal.dueMonth.value;
    if (due < first || due > endMonth) { issues.push({ path, code: "GOAL_HORIZON_OR_AMOUNT_REQUIRED" }); continue; }
    let month = first, factor = new D(1), valid = true;
    while (month < due) {
      const year = Number(month.slice(0, 4)), nextYear = `${year + 1}-01`;
      const end = due < nextYear ? due : nextYear;
      const count = (Number(end.slice(0, 4)) - year) * 12 + Number(end.slice(5)) - Number(month.slice(5));
      const cpi = assumptions.inflation.filter(r => r.year === year);
      if (cpi.length !== 1 || goal.inflation?.status === "UNKNOWN") { issues.push({ path, code: "GOAL_ASSUMPTIONS_NOT_COVERED" }); valid = false; break; }
      const rate = goal.inflation?.status === "KNOWN" ? goal.inflation.value : cpi[0].percent;
      factor = factor.mul(new D(rate).div(100).plus(1).pow(new D(count).div(12)));
      month = addMonths(month, count);
    }
    if (valid) entries.push({ id: goal.id, month: due, amount: new D(goal.amountToday.value).mul(factor).toFixed() });
  }
  return { entries, issues };
}
