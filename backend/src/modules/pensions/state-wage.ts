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

/** ND158 Art15(2)(b): officers/professional soldiers/police officers who
 * transferred into state-salary work. The higher of the last window before
 * retirement and the last window before transfer; Art15(2)(c) all-time
 * comparison does not apply. null = a window is incomplete (needs review). */
export function militaryTransferAverage(firstParticipationMonth: string, transferMonth: string, months: AdjustedMonth[]) {
  monthSchema.parse(transferMonth);
  return alternativeWindowAverage(firstParticipationMonth, months, (sorted, window) => sorted.filter(m => m.month < transferMonth).slice(-window));
}

/** ND158 Art15(2)(a): the declared consecutive hazardous-salary window of N years. */
export function hazardousTransferAverage(firstParticipationMonth: string, windowFrom: string, months: AdjustedMonth[]) {
  monthSchema.parse(windowFrom);
  return alternativeWindowAverage(firstParticipationMonth, months, (sorted, window) => {
    const start = sorted.findIndex(m => m.month === windowFrom);
    return start < 0 ? [] : sorted.slice(start, start + window);
  });
}

/** max(last N state months, an alternative N-month window); never the all-time comparison of Art15(2)(c). */
function alternativeWindowAverage(firstParticipationMonth: string, months: AdjustedMonth[], pick: (sorted: AdjustedMonth[], window: number) => AdjustedMonth[]) {
  const window = stateAveragingWindow(firstParticipationMonth);
  if (!months.length || months.length > 1200 || new Set(months.map(m => m.month)).size !== months.length || months.some(m => m.salaryRegime !== "STATE"))
    throw new AppError(422, "INVALID_INSURANCE_MONTHS", "Chỉ áp dụng cho toàn bộ thời gian lương Nhà nước.");
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  if (window === null) return null;
  const final = sorted.slice(-window), alternative = pick(sorted, window);
  if (final.length < window || alternative.length < window) return null;
  const avg = (rows: AdjustedMonth[]) => rows.reduce((t, r) => t.plus(amount(r.adjustedBase)), new D(0)).div(rows.length);
  const finalAverage = avg(final), beforeTransferAverage = avg(alternative), average = D.max(finalAverage, beforeTransferAverage);
  return { prescribedWindowMonths: window, finalAverage: finalAverage.toFixed(), beforeTransferAverage: beforeTransferAverage.toFixed(),
    usedBeforeTransfer: beforeTransferAverage.gt(finalAverage), stateMonths: sorted.length, alternativeMonths: alternative.map(m => m.month), average: average.toFixed() };
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
