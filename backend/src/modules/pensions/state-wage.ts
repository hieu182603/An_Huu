import { AppError } from "../../common/errors";
import { monthSchema } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";

/** Law Art72(1). Start refers to first insurance participation, not the first
 * row of the current state-salary segment. null means the entire history. */
export function stateAveragingWindow(firstParticipationMonth: string): number | null {
  monthSchema.parse(firstParticipationMonth);
  if (firstParticipationMonth < "1995-01") return 60;
  if (firstParticipationMonth < "2001-01") return 72;
  if (firstParticipationMonth < "2007-01") return 96;
  if (firstParticipationMonth < "2016-01") return 120;
  if (firstParticipationMonth < "2020-01") return 180;
  if (firstParticipationMonth < "2025-01") return 240;
  return null;
}
type AdjustedMonth = { month: string; salaryRegime: "STATE" | "EMPLOYER"; adjustedBase: string };
function amount(value: string) {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value) || new D(value).gt("1e100"))
    throw new AppError(422, "INVALID_ADJUSTED_WAGE", "Căn cứ đóng sau điều chỉnh không hợp lệ.");
  return new D(value);
}

/** Internal arithmetic for ordinary state/mixed salary. Caller must resolve
 * Art73 adjustments, pre-Oct2004 conversion and special-job/seniority rules
 * before invoking. This helper does not accept or publish a statutory case. */
export function ordinaryStateMixedAverage(firstParticipationMonth: string, months: AdjustedMonth[]) {
  const window = stateAveragingWindow(firstParticipationMonth);
  if (!months.length || months.length > 1200 || new Set(months.map(m => m.month)).size !== months.length ||
    months.some(m => !monthSchema.safeParse(m.month).success || m.month < firstParticipationMonth))
    throw new AppError(422, "INVALID_INSURANCE_MONTHS", "Lịch đóng phải đúng phạm vi và không trùng tháng.");
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const state = sorted.filter(m => m.salaryRegime === "STATE"), employer = sorted.filter(m => m.salaryRegime === "EMPLOYER");
  if (!state.length || state.length + employer.length !== sorted.length)
    throw new AppError(422, "STATE_SALARY_REQUIRED", "Phải có tháng theo chế độ lương Nhà nước.");
  const sum = (rows: AdjustedMonth[]) => rows.reduce((total, r) => total.plus(amount(r.adjustedBase)), new D(0));
  const selected = window === null ? state : state.slice(-window);
  // ND158 Art15(1)(b)/(4): fewer than the prescribed window => actual months.
  const windowAverage = sum(selected).div(selected.length), allStateAverage = sum(state).div(state.length);
  // Art15(2)(c) for an ordinary wholly-state career. Mixed careers use the
  // state component described in Art15(4)/TT12 Art16(3), without silently
  // importing the special wholly-state comparison.
  const stateAverage = employer.length ? windowAverage : D.max(windowAverage, allStateAverage);
  const employerTotal = sum(employer), numerator = stateAverage.mul(state.length).plus(employerTotal);
  return { prescribedWindowMonths: window, selectedStateMonths: selected.map(r => r.month), stateMonths: state.length, employerMonths: employer.length,
    windowAverage: windowAverage.toFixed(), allStateAverage: allStateAverage.toFixed(), stateAverage: stateAverage.toFixed(),
    usedAllStateAverage: !employer.length && allStateAverage.gt(windowAverage), employerAdjustedTotal: employerTotal.toFixed(),
    average: numerator.div(sorted.length).toFixed() };
}
