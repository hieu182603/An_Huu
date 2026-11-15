import { z } from "zod";
import { Prisma } from "@prisma/client";
import { addMonths } from "../../common/calendar";
import { profileV2Schema, type ProfileV2, type ProfileV2Changes } from "./schema-v2";
import { quickStartSurveySchema, type QuickStartSurvey } from "./quick-start-schema";
const D = Prisma.Decimal.clone({ precision: 48 });
const unknown = { status: "UNKNOWN" } as const;
const known = <T>(value: T) => ({ status: "KNOWN" as const, value });
const absent = (v: unknown) => v === null || v === undefined;
const amount = (v: string | null | undefined) => absent(v) ? unknown : known(new D(v!).toFixed());
const none = (reason: string) => ({ status: "NOT_APPLICABLE" as const, reason });
export function surveyDates(s: QuickStartSurvey, first: string) {
  const birth = s.birthDate?.slice(0, 7) ?? s.birthMonth ?? "";
  const retirement = s.retirementMonth ?? (birth && s.retirementAge ? addMonths(birth, s.retirementAge * 12) : "");
  // The demo uses the 85th birthday as an exclusive boundary. Public engine
  // endMonth is inclusive, so the last spending month is one month earlier.
  const end = s.endMonth ?? (birth ? addMonths(birth, 85 * 12 - 1) : "");
  return { birth, retirement, end, first };
}
export function surveySupportEnd(s: QuickStartSurvey, key: "child" | "parent", dates: ReturnType<typeof surveyDates>) {
  const mode = s[`${key}Duration`] ?? "unknown";
  if (mode === "custom") return s[`${key}End`] ?? null;
  if (mode === "unknown") return dates.end || null;
  const end = mode === "retirement" ? addMonths(dates.retirement, -1) : addMonths(dates.first, Number(mode) * 12 - 1);
  return end < dates.first ? dates.first : end > dates.end ? dates.end : end;
}
export function validateQuickStart(s: QuickStartSurvey, valuationDate: string, complete = false, familyReady = false) {
  const dates = surveyDates(s, valuationDate.slice(0, 7));
  const issues: z.core.$ZodIssue[] = [];
  const issue = (field: keyof QuickStartSurvey, message: string) => issues.push({ code: "custom", path: ["quickStartSurvey", field], message });
  const positive = (field: keyof QuickStartSurvey) => { const v = s[field]; if (typeof v !== "string" || !new D(v).gt(0)) issue(field, "Nhập số tiền lớn hơn 0."); };
  if (dates.birth) {
    const age = (Number(dates.first.slice(0, 4)) - Number(dates.birth.slice(0, 4))) * 12 + Number(dates.first.slice(5)) - Number(dates.birth.slice(5));
    if (age < 216 || age > 1200) issue("birthDate", "Tuổi hiện tại phải từ 18 đến 100.");
    if (s.birthMonth && s.birthDate && s.birthMonth !== s.birthDate.slice(0, 7)) issue("birthDate", "Ngày sinh phải cùng tháng sinh.");
  } else if (complete) issue("birthDate", "Bổ sung ngày hoặc tháng sinh.");
  if (complete && !dates.retirement) issue("retirementAge", "Bổ sung tuổi nghỉ hưu.");
  if (dates.birth && dates.retirement) {
    const age = (Number(dates.retirement.slice(0, 4)) - Number(dates.birth.slice(0, 4))) * 12 + Number(dates.retirement.slice(5)) - Number(dates.birth.slice(5));
    if (age < 216 || age > 1200) issue("retirementAge", "Tuổi nghỉ hưu phải từ 18 đến 100.");
  }
  if (dates.end && (dates.end < dates.first || dates.retirement && dates.end < dates.retirement)) issue("endMonth", "Mốc kết thúc chi tiêu phải từ kỳ định giá và tháng nghỉ hưu trở đi.");
  if (complete || familyReady) {
    positive("monthlyExpenseToday");
    for (const field of ["monthlyIncome", "monthlyExpense", "retirementSavings", "monthlyContribution", "emergencyAmount"] as const)
      if (absent(s[field])) issue(field, "Khai số tiền; có thể nhập 0.");
    let included = new D(0);
    for (const key of ["child", "parent"] as const) if (s[`${key}Enabled`]) {
      positive(`${key}Amount`);
      const end = surveySupportEnd(s, key, dates);
      if (!end || end < dates.first || end > dates.end) issue(`${key}End`, "Chọn tháng kết thúc trong thời hạn kế hoạch.");
      if (s[`${key}Included`] !== false && s[`${key}Amount`]) included = included.plus(s[`${key}Amount`]!);
    }
    if (s.monthlyExpense && included.gt(s.monthlyExpense)) issue("monthlyExpense", "Tổng hỗ trợ đã nằm trong chi tiêu vượt tổng chi đã khai.");
    if (s.debtEnabled) {
      positive("debtBalance"); positive("debtMonthlyPayment");
      if (absent(s.debtAnnualRatePercent)) issue("debtAnnualRatePercent", "Khai lãi suất; nhập 0 nếu không có lãi.");
      else if (s.debtBalance && s.debtMonthlyPayment && new D(s.debtMonthlyPayment).lte(new D(s.debtBalance).mul(s.debtAnnualRatePercent!).div(1200))) issue("debtMonthlyPayment", "Khoản trả phải lớn hơn tiền lãi tháng để giảm gốc.");
    }
    if (s.goalEnabled) {
      if (!s.goalName?.trim()) issue("goalName", "Bổ sung tên mục tiêu."); positive("goalAmount");
      if (!s.goalMonth || s.goalMonth < dates.first || s.goalMonth > dates.end) issue("goalMonth", "Chọn tháng cần tiền trong thời hạn kế hoạch.");
    }
    if (s.pensionStatus === "known") {
      positive("pension"); const start = s.pensionStart ?? dates.retirement;
      if (!start || start < dates.first || start > dates.end) issue("pensionStart", "Chọn tháng nhận lương hưu trong thời hạn kế hoạch.");
    }
  }
  if (complete && !s.reaction) issue("reaction", "Chọn phản ứng phù hợp trước biến động.");
  if (complete && s.lossStatus === "amount" && absent(s.lossAmount)) issue("lossAmount", "Khai giới hạn lỗ bằng tiền hoặc chọn chưa rõ.");
  if (complete && s.lossStatus === "percent" && absent(s.lossPercent)) issue("lossPercent", "Khai giới hạn lỗ theo phần trăm hoặc chọn chưa rõ.");
  if (issues.length) throw new z.ZodError(issues);
  return dates;
}
/** Only onboarding calls this converter. Once completed, canonical profile
 * records are authoritative; raw answers are provenance/resume data, not a
 * second calculator and never reapplied to an edited existing profile. */
export function normalizeQuickStart(input: ProfileV2Changes, complete = false, familyReady = false): ProfileV2 {
  const s = quickStartSurveySchema.parse(input.quickStartSurvey);
  if (!input.valuationDate) throw new z.ZodError([{ code: "custom", path: ["valuationDate"], message: "Thiếu kỳ định giá." }]);
  const dates = validateQuickStart(s, input.valuationDate, complete, familyReady);
  const expenses: ProfileV2["expenses"] = absent(s.monthlyExpense) ? unknown : { status: "KNOWN", entries: [] };
  let remainder = new D(s.monthlyExpense ?? "0");
  for (const key of ["child", "parent"] as const) if (s[`${key}Enabled`] && s[`${key}Amount`] && new D(s[`${key}Amount`]!).gt(0)) {
    if (s[`${key}Included`] !== false) remainder = remainder.minus(s[`${key}Amount`]!);
    if (expenses.status === "KNOWN") expenses.entries.push({ id: `exp_quick_${key}`, label: key === "child" ? "Chăm lo con cái" : "Phụng dưỡng bố mẹ", category: "DEPENDENT", amount: amount(s[`${key}Amount`]), currency: "VND", startMonth: dates.first, endMonth: surveySupportEnd(s, key, dates), frequency: "MONTHLY" });
  }
  if (remainder.lt(0)) throw new z.ZodError([{ code: "custom", path: ["quickStartSurvey", "monthlyExpense"], message: "Tổng hỗ trợ vượt chi sinh hoạt đã khai." }]);
  if (expenses.status === "KNOWN" && remainder.gt(0)) expenses.entries.unshift({ id: "exp_quick", label: "Chi sinh hoạt còn lại", category: "ESSENTIAL", amount: known(remainder.toFixed()), currency: "VND", startMonth: dates.first, endMonth: null, frequency: "MONTHLY" });
  const assets: ProfileV2["assets"] = absent(s.retirementSavings) ? unknown : { status: "KNOWN", entries: [] };
  if (assets.status === "KNOWN") for (const [id, label, value, reserve] of [["ast_quick", "Tiền dành cho hưu trí", s.retirementSavings, false], ["ast_quick_reserve", "Quỹ dự phòng", s.emergencyAmount, true]] as const) {
    if (!value || new D(value).isZero()) continue;
    assets.entries.push({ id, label, value: amount(value), type: "DEPOSIT", currency: "VND", valuedOn: known(input.valuationDate), ownershipShare: known("1"), retirementShare: known(reserve ? "0" : "1"), emergencyShare: known(reserve ? "1" : "0"), otherGoalsShare: known("0"), liquidity: known("LIQUID"), availableFromMonth: known(dates.first) });
  }
  const pensionStart = s.pensionStatus === "known" ? s.pensionStart ?? dates.retirement : null;
  const profile: ProfileV2 = {
    schemaVersion: 2, valuationDate: input.valuationDate, currency: "VND", periodUnit: "MONTH",
    quickStartSurvey: s,
    personal: { birthMonth: dates.birth ? known(dates.birth) : unknown, ...(s.birthDate ? { birthDate: s.birthDate } : {}), desiredRetirementMonth: dates.retirement ? known(dates.retirement) : unknown,
      pensionStartMonth: pensionStart ? known(pensionStart) : s.pensionStatus === "none" ? none("Không có lương hưu") : unknown,
      maritalStatus: s.maritalStatus ?? null, dependents: absent(s.dependents) ? unknown : known(s.dependents!),
      careResponsibility: known(s.childEnabled ? s.parentEnabled ? "BOTH" : "CHILDREN" : s.parentEnabled ? "PARENTS" : "SELF") },
    income: absent(s.monthlyIncome) ? unknown : { status: "KNOWN", entries: new D(s.monthlyIncome!).gt(0) && dates.retirement > dates.first ? [{ id: "inc_quick", label: "Thu nhập hằng tháng", source: "EMPLOYMENT", kind: "FIXED", basis: "DISPOSABLE", amount: amount(s.monthlyIncome), currency: "VND", startMonth: dates.first, endMonth: addMonths(dates.retirement, -1), frequency: "MONTHLY" }] : [] },
    expenses, assets,
    debts: !s.debtEnabled ? none("Không chọn khoản nợ") : { status: "KNOWN", entries: [{ id: "dbt_quick", label: "Khoản vay đã khai", outstandingBalance: amount(s.debtBalance), balanceAsOf: known(input.valuationDate), currency: "VND", payment: amount(s.debtMonthlyPayment), paymentShare: known("1"), balanceShare: known("1"), contract: unknown, illustration: { annualRatePercent: amount(s.debtAnnualRatePercent) }, responsibility: unknown, startMonth: dates.first, endMonth: null, frequency: "MONTHLY" }] },
    pension: s.pensionStatus === "none" ? none("Không có lương hưu") : s.pensionStatus === "known" && s.pension && pensionStart ? { status: "KNOWN", monthlyAmount: s.pension, currency: "VND", priceBasis: "TODAY", basisMonth: dates.first, source: "Ước tính tự khai trong khảo sát", estimatedOn: input.valuationDate, adjustment: { kind: "NONE" } } : unknown,
    goals: s.goalEnabled ? { status: "KNOWN", entries: [{ id: "goal_quick", label: s.goalName || "Mục tiêu đang khai", amountToday: amount(s.goalAmount), dueMonth: s.goalMonth ? known(s.goalMonth) : unknown, priority: known(s.goalDeferrable ? "FLEXIBLE" : "ESSENTIAL"), deferrable: known(s.goalDeferrable ?? false) }] } : none("Không chọn mục tiêu lớn khác"),
    incomeStability: s.stability && s.stability !== "UNKNOWN" ? known(s.stability) : unknown,
    lossTolerance: { ...(s.lossStatus === "amount" || s.lossStatus === "percent" ? { inputMode: s.lossStatus === "amount" ? "AMOUNT" as const : "PERCENT" as const } : {}), reaction: s.reaction ? known(s.reaction) : unknown, amountVnd: s.lossStatus === "amount" ? amount(s.lossAmount) : unknown, percent: s.lossStatus === "percent" ? amount(s.lossPercent) : unknown },
    ...(dates.retirement && dates.end && s.monthlyExpenseToday ? { retirementGoal: { endMonth: dates.end, monthlyExpenseToday: s.monthlyExpenseToday, monthlyContribution: s.monthlyContribution ?? undefined, lifestylePriority: s.priority ?? null } } : {}),
    ...(input.retirementSurvey ? { retirementSurvey: input.retirementSurvey } : {}),
  };
  return profileV2Schema.parse(profile);
}
