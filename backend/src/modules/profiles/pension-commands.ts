import { z } from "zod";
import { AppError } from "../../common/errors";
import { monthSchema } from "../../common/calendar";
import { pensionSchema } from "../pensions/schema";
import { pensionAtMonth } from "../pensions/engine";
import { profileV2Schema, type ProfileV2 } from "./schema-v2";
const start = z.union([z.object({ status: z.literal("KNOWN"), value: monthSchema }).strict(), z.object({ status: z.literal("UNKNOWN") }).strict(), z.object({ status: z.literal("NOT_APPLICABLE"), reason: z.string().trim().min(1).max(300) }).strict()]);
export const pensionPatchSchema = z.object({ expectedRevision: z.number().int().min(1), pension: pensionSchema, pensionStartMonth: start }).strict();
export function pensionChanges(profile: ProfileV2, input: z.infer<typeof pensionPatchSchema>) {
  let pension = input.pension, income = profile.income;
  if (pension.status === "KNOWN" && pension.priceBasis === "NOMINAL_AT_START" && input.pensionStartMonth.status !== "KNOWN") throw new AppError(422, "PENSION_START_MONTH_REQUIRED", "Số tiền tại tháng nhận cần xác định tháng bắt đầu nhận.");
  if (input.pensionStartMonth.status === "KNOWN" && profile.personal.birthMonth.status === "KNOWN" && input.pensionStartMonth.value < profile.personal.birthMonth.value) throw new AppError(422, "PENSION_START_BEFORE_BIRTH", "Tháng nhận không được trước tháng sinh.");
  const oldLink = profile.pension?.status === "KNOWN" ? profile.pension.linkedIncomeId : undefined;
  if (pension.status === "KNOWN" && pension.linkedIncomeId && pension.linkedIncomeId !== oldLink) throw new AppError(422, "PENSION_LINK_CHANGE_REQUIRES_REVIEW", "Không đổi liên kết thu nhập sang khoản khác trong biểu mẫu này.");
  if (income.status === "KNOWN" && oldLink) {
    if (pension.status !== "KNOWN" || input.pensionStartMonth.status !== "KNOWN") {
      income = { ...income, entries: income.entries.filter(row => row.id !== oldLink) };
      if (pension.status === "KNOWN") { const { linkedIncomeId: _link, ...rest } = pension; pension = rest; }
    } else {
      const month = input.pensionStartMonth.value;
      pension = { ...pension, linkedIncomeId: oldLink };
      income = { ...income, entries: income.entries.map(row => row.id === oldLink ? { ...row, amount: { status: "UNKNOWN" as const }, currency: "VND", frequency: "MONTHLY" as const, startMonth: month, endMonth: null } : row) };
    }
  }
  const personal = { ...profile.personal, pensionStartMonth: pension.status === "NOT_APPLICABLE" ? { status: "NOT_APPLICABLE" as const, reason: pension.reason } : input.pensionStartMonth };
  const checked = profileV2Schema.parse({ ...profile, pension, personal, income: income });
  return { pension: checked.pension, personal: checked.personal, income: checked.income };
}
export function profilePensionReport(profile: ProfileV2, profileRevision: number) {
  const month = profile.valuationDate.slice(0, 7), start = profile.personal.pensionStartMonth;
  const current = pensionAtMonth(profile, month);
  const ageMonths = start.status === "KNOWN" && profile.personal.birthMonth.status === "KNOWN" ? (Number(start.value.slice(0, 4)) - Number(profile.personal.birthMonth.value.slice(0, 4))) * 12 + Number(start.value.slice(5)) - Number(profile.personal.birthMonth.value.slice(5)) : null;
  return { profileRevision, valuationDate: profile.valuationDate, declaration: profile.pension ?? { status: "UNKNOWN" }, pensionStartMonth: start, ageAtStartMonths: ageMonths !== null && ageMonths >= 0 ? ageMonths : null, currentMonthAmount: current.amount, issues: current.issues, entitlement: "NOT_ASSESSED" as const, fundReduction: null };
}
export const profilePensionReportSchema = z.object({ profileRevision: z.number().int(), valuationDate: z.string(), declaration: pensionSchema, pensionStartMonth: start, ageAtStartMonths: z.number().int().nullable(), currentMonthAmount: z.string().nullable(), issues: z.array(z.object({ path: z.string(), code: z.string() })), entitlement: z.literal("NOT_ASSESSED"), fundReduction: z.null() }).strict();
