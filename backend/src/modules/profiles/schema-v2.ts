import { Prisma } from "@prisma/client";
import { z } from "zod";
import { moneySchema } from "../../common/http";
import { dateSchema, monthSchema } from "../../common/calendar";
import { contractDeclarationSchema } from "../debts/schema";
import { buildContractSchedule } from "../debts/loan";
import { pensionSchema, retirementConditionSchema } from "../pensions/schema";
export { dateSchema, monthSchema } from "../../common/calendar";
const PreciseDecimal = Prisma.Decimal.clone({ precision: 48 });

const unknown = z.object({ status: z.literal("UNKNOWN") }).strict();
const notApplicable = z.object({ status: z.literal("NOT_APPLICABLE"), reason: z.string().trim().min(1).max(300) }).strict();
export const knownOrUnknown = <T extends z.ZodTypeAny>(value: T) => z.discriminatedUnion("status", [
  z.object({ status: z.literal("KNOWN"), value }).strict(), unknown,
]);
const optionalMonth = z.discriminatedUnion("status", [
  z.object({ status: z.literal("KNOWN"), value: monthSchema }).strict(), unknown, notApplicable,
]);
export const amountSchema = knownOrUnknown(moneySchema);
const fraction = z.string().regex(/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/);
const share = knownOrUnknown(fraction);
const id = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const currency = z.string().regex(/^[A-Z]{3}$/).default("VND");
const scheduleFields = {
  startMonth: monthSchema, endMonth: monthSchema.nullable(), frequency: z.enum(["MONTHLY", "ONCE"]),
};
function scheduleCheck(value: { startMonth: string; endMonth: string | null; frequency: string }, ctx: z.RefinementCtx) {
  if (value.endMonth !== null && value.endMonth < value.startMonth)
    ctx.addIssue({ code: "custom", path: ["endMonth"], message: "Kỳ kết thúc phải từ kỳ bắt đầu trở đi." });
  if (value.frequency === "ONCE" && value.endMonth !== value.startMonth)
    ctx.addIssue({ code: "custom", path: ["endMonth"], message: "Khoản một lần phải có cùng kỳ bắt đầu và kết thúc." });
}
export const incomeEntrySchema = z.object({
  id, label: z.string().trim().min(1).max(120), kind: z.enum(["FIXED", "BONUS", "IRREGULAR"]),
  basis: z.literal("DISPOSABLE"),
  source: z.enum(["EMPLOYMENT", "OTHER", "PENSION"]).optional(),
  amount: amountSchema, currency, ...scheduleFields,
}).strict().superRefine(scheduleCheck);
export const expenseEntrySchema = z.object({
  id, label: z.string().trim().min(1).max(120),
  category: z.enum(["ESSENTIAL", "OPTIONAL", "HEALTH", "INSURANCE", "DEPENDENT", "DEBT_PAYMENT"]),
  amount: amountSchema, currency, loanId: id.optional(), ...scheduleFields,
}).strict().superRefine((value, ctx) => {
  scheduleCheck(value, ctx);
  if ((value.category === "DEBT_PAYMENT") !== (value.loanId !== undefined))
    ctx.addIssue({ code: "custom", path: ["loanId"], message: "Khoản trả nợ phải liên kết khoản vay; các nhóm chi khác không nhận loanId." });
});
export const housingPlanSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNCONFIRMED") }).strict(),
  z.object({ status: z.literal("CONFIRMED"), kind: z.enum(["SALE", "RENT"]), startMonth: monthSchema, netAmount: amountSchema }).strict(),
]);
export const assetEntrySchema = z.object({
  id, label: z.string().trim().min(1).max(120),
  type: z.enum(["CASH", "DEPOSIT", "STOCK_FUND", "PRIMARY_HOME", "REAL_ESTATE", "OTHER"]),
  value: amountSchema, currency, valuedOn: knownOrUnknown(dateSchema), ownershipShare: share,
  retirementShare: share, emergencyShare: share, otherGoalsShare: share,
  liquidity: knownOrUnknown(z.enum(["LIQUID", "ILLIQUID", "LOCKED"])),
  availableFromMonth: knownOrUnknown(monthSchema), housingPlan: housingPlanSchema.optional(),
}).strict().superRefine((value, ctx) => {
  const shares = [value.retirementShare, value.emergencyShare, value.otherGoalsShare];
  const sum = shares.reduce((total, item) => item.status === "KNOWN" ? total.plus(item.value) : total, new Prisma.Decimal(0));
  if (sum.gt(1) || (shares.every(item => item.status === "KNOWN") && !sum.eq(1)))
    ctx.addIssue({ code: "custom", path: ["retirementShare"], message: "Tổng phần hưu trí, dự phòng và mục tiêu khác phải bằng 100%." });
  if (value.housingPlan && !["PRIMARY_HOME", "REAL_ESTATE"].includes(value.type))
    ctx.addIssue({ code: "custom", path: ["housingPlan"], message: "Phương án nhà ở chỉ áp dụng cho bất động sản." });
});
export const debtEntrySchema = z.object({
  id, label: z.string().trim().min(1).max(120), sharedLoanId: id.optional(),
  outstandingBalance: amountSchema, balanceAsOf: knownOrUnknown(dateSchema), currency,
  payment: amountSchema, paymentShare: share, balanceShare: share,
  contract: contractDeclarationSchema.optional(),
  responsibility: z.discriminatedUnion("status", [unknown,
    z.object({ status: z.literal("KNOWN"), scope: z.enum(["ALLOCATED_ONLY", "FULL", "CAPPED"]),
      confirmedDocument: z.string().trim().min(1).max(300), limit: amountSchema }).strict(),
  ]),
  ...scheduleFields,
}).strict().superRefine(scheduleCheck);
export const collectionSchema = <T extends z.ZodTypeAny>(entry: T) => z.discriminatedUnion("status", [
  z.object({ status: z.literal("KNOWN"), entries: z.array(entry).max(200) }).strict(), unknown, notApplicable,
]);
const personalV2 = z.object({
  birthMonth: knownOrUnknown(monthSchema), desiredRetirementMonth: knownOrUnknown(monthSchema), pensionStartMonth: optionalMonth,
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).optional(),
  retirementCondition: retirementConditionSchema.optional(),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "OTHER"]).optional(),
  dependents: knownOrUnknown(z.number().int().min(0).max(30)).optional(), city: z.string().trim().max(120).optional(),
}).strict();
export const profileV2Object = z.object({
  schemaVersion: z.literal(2), valuationDate: dateSchema, currency: z.literal("VND").default("VND"), periodUnit: z.literal("MONTH"),
  personal: personalV2, income: collectionSchema(incomeEntrySchema), expenses: collectionSchema(expenseEntrySchema),
  assets: collectionSchema(assetEntrySchema), debts: collectionSchema(debtEntrySchema),
  pension: pensionSchema.optional(),
}).strict();
function referencesCheck(data: z.infer<typeof profileV2Object> | z.infer<typeof partialProfileV2Object>, ctx: z.RefinementCtx) {
  const pension = data.pension, pensionStart = data.personal?.pensionStartMonth;
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (pension?.status === "KNOWN") {
    if (data.valuationDate && pension.estimatedOn > data.valuationDate)
      issue(["pension", "estimatedOn"], "Ngày ước tính không được sau ngày định giá.");
    if (pension.priceBasis === "TODAY" && data.valuationDate && pension.basisMonth !== data.valuationDate.slice(0, 7))
      issue(["pension", "basisMonth"], "Tiền hôm nay phải cùng tháng với ngày định giá.");
    if (pensionStart?.status === "NOT_APPLICABLE") issue(["personal", "pensionStartMonth"], "Mức hưu đã khai không tương thích với tháng nhận không áp dụng.");
    if (pension.priceBasis === "NOMINAL_AT_START" && pensionStart?.status === "KNOWN" && pension.basisMonth !== pensionStart.value)
      issue(["pension", "basisMonth"], "Tiền tại ngày nhận phải cùng tháng bắt đầu nhận.");
    if (pension.adjustment.kind === "EXPLICIT_SCHEDULE") {
      const seen = new Set<string>();
      pension.adjustment.entries.forEach((entry, i) => {
        if (seen.has(entry.effectiveMonth) || (pensionStart?.status === "KNOWN" && entry.effectiveMonth <= pensionStart.value))
          issue(["pension", "adjustment", "entries", i], "Tháng điều chỉnh phải sau tháng nhận và không trùng.");
        seen.add(entry.effectiveMonth);
      });
    }
    if (pension.linkedIncomeId && data.income && data.income.status !== "UNKNOWN") {
      const linked = data.income.status === "KNOWN" ? data.income.entries.find(e => e.id === pension.linkedIncomeId) : undefined;
      if (!linked || linked.source !== "PENSION") issue(["pension", "linkedIncomeId"], "Dòng thu tham chiếu phải tồn tại và có source PENSION.");
    }
  }
  if (data.income?.status === "KNOWN") data.income.entries.forEach((entry, i) => {
    if (entry.source === "PENSION" && (pension?.status !== "KNOWN" || pension.linkedIncomeId !== entry.id))
      issue(["income", "entries", i, "source"], "Lương hưu phải khai ở pension và liên kết đúng một dòng tham chiếu; không cộng hai lần.");
  });
  if (pension?.status === "NOT_APPLICABLE" && pensionStart?.status === "KNOWN")
    issue(["personal", "pensionStartMonth"], "Lương hưu không áp dụng không được có tháng nhận đã xác nhận.");
  for (const key of ["income", "expenses", "assets", "debts"] as const) {
    const group = data[key];
    if (group?.status !== "KNOWN") continue;
    const seen = new Set<string>();
    group.entries.forEach((entry, index) => {
      if (seen.has(entry.id)) ctx.addIssue({ code: "custom", path: [key, "entries", index, "id"], message: "ID không được trùng trong một nhóm." });
      seen.add(entry.id);
    });
  }
  if (data.debts?.status === "KNOWN") {
    const ids = new Set<string>();
    data.debts.entries.forEach((entry, index) => {
      if (entry.sharedLoanId && ids.has(entry.sharedLoanId))
        ctx.addIssue({ code: "custom", path: ["debts", "entries", index, "sharedLoanId"], message: "Khoản vay chung chỉ khai báo một lần trong hồ sơ." });
      if (entry.sharedLoanId) ids.add(entry.sharedLoanId);
    });
  }
  if (data.expenses?.status === "KNOWN" && data.debts && data.debts.status !== "UNKNOWN") {
    const loans = data.debts.status === "KNOWN" ? data.debts.entries : [];
    const linked = new Set<string>();
    data.expenses.entries.forEach((entry, index) => {
      if (!entry.loanId) return;
      if (!loans.some(loan => loan.id === entry.loanId) || linked.has(entry.loanId))
        ctx.addIssue({ code: "custom", path: ["expenses", "entries", index, "loanId"], message: "Khoản vay phải tồn tại và chỉ được liên kết một lần." });
      const loan = loans.find(loan => loan.id === entry.loanId);
      if (loan && entry.currency !== undefined && loan.currency !== undefined && entry.currency !== loan.currency)
        ctx.addIssue({ code: "custom", path: ["expenses", "entries", index, "currency"], message: "Khoản chi liên kết phải cùng tiền tệ với khoản vay." });
      if (loan && loan.contract?.status !== "KNOWN" && (["currency", "startMonth", "endMonth", "frequency"] as const).some(key =>
        entry[key] !== undefined && loan[key] !== undefined && entry[key] !== loan[key]))
        ctx.addIssue({ code: "custom", path: ["expenses", "entries", index], message: "Khoản trả nợ liên kết phải cùng tiền tệ và lịch với khoản vay." });
      if (loan && loan.contract?.status !== "KNOWN" && entry.amount?.status === "KNOWN" && loan.payment?.status === "KNOWN" && loan.paymentShare?.status === "KNOWN" &&
          !new PreciseDecimal(entry.amount.value).eq(new PreciseDecimal(loan.payment.value).mul(loan.paymentShare.value)))
        ctx.addIssue({ code: "custom", path: ["expenses", "entries", index, "amount"], message: "Khoản trả nợ liên kết phải bằng phần trả nợ được phân bổ." });
      if (loan?.contract?.status === "KNOWN" && entry.amount?.status === "KNOWN" && data.valuationDate && entry.startMonth && entry.endMonth !== undefined) {
        const parsed = debtEntrySchema.safeParse(loan);
        if (parsed.success) {
          const schedule = buildContractSchedule(parsed.data, data.valuationDate);
          if (schedule.status === "READY" && schedule.rows.some(row => row.dueDate.slice(0, 7) >= (entry.startMonth ?? "") &&
              (entry.endMonth === null || row.dueDate.slice(0, 7) <= (entry.endMonth ?? "")) &&
              entry.amount?.status === "KNOWN" && !new PreciseDecimal(row.userPayment).eq(entry.amount.value)))
            ctx.addIssue({ code: "custom", path: ["expenses", "entries", index, "amount"], message: "Khoản chi liên kết không khớp lịch hợp đồng. Dùng UNKNOWN cho dòng tham chiếu nếu số tiền thay đổi theo kỳ." });
        }
      }
      linked.add(entry.loanId);
    });
  }
  const birth = data.personal?.birthMonth;
  const retirement = data.personal?.desiredRetirementMonth;
  if (birth?.status === "KNOWN" && data.valuationDate && birth.value > data.valuationDate.slice(0, 7))
    ctx.addIssue({ code: "custom", path: ["personal", "birthMonth"], message: "Tháng sinh không thể sau ngày định giá." });
  if (birth?.status === "KNOWN" && retirement?.status === "KNOWN" && retirement.value < birth.value)
    ctx.addIssue({ code: "custom", path: ["personal", "desiredRetirementMonth"], message: "Tháng nghỉ hưu không thể trước tháng sinh." });
  if (birth?.status === "KNOWN" && pensionStart?.status === "KNOWN" && pensionStart.value < birth.value)
    issue(["personal", "pensionStartMonth"], "Tháng nhận hưu không thể trước tháng sinh.");
}
// A draft may contain an unfinished row, identified by its stable ID. Finalization
// validates the full document; supplied amount/status pairs remain strict in drafts.
export const partialProfileV2Object = profileV2Object.partial().extend({
  schemaVersion: z.literal(2), personal: personalV2.partial().optional(),
  income: collectionSchema(incomeEntrySchema.innerType().partial().required({ id: true })).optional(),
  expenses: collectionSchema(expenseEntrySchema.innerType().partial().required({ id: true })).optional(),
  assets: collectionSchema(assetEntrySchema.innerType().partial().required({ id: true })).optional(),
  debts: collectionSchema(debtEntrySchema.innerType().partial().required({ id: true })).optional(),
}).strict();
export const profileV2Schema = profileV2Object.superRefine(referencesCheck);
export const partialProfileV2Schema = partialProfileV2Object.superRefine(referencesCheck);
export type ProfileV2 = z.infer<typeof profileV2Schema>;
export type ProfileV2Changes = z.infer<typeof partialProfileV2Schema>;
export type AssetEntry = z.infer<typeof assetEntrySchema>;
export type DebtEntry = z.infer<typeof debtEntrySchema>;
export const isV2 = (value: unknown): value is { schemaVersion: 2 } =>
  typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion === 2;
