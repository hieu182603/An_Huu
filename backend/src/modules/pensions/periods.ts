import { z } from "zod";
import { addMonths, monthSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
import { digest } from "../../common/digest";
import { AppError } from "../../common/errors";
import { contributionMonthSchema, insuranceHistorySchema, type InsuranceHistory } from "./insurance-schema";
const entry = z.object({ fromMonth: monthSchema, toMonth: monthSchema, scheme: z.enum(["COMPULSORY", "VOLUNTARY"]), salaryRegime: z.enum(["EMPLOYER", "VOLUNTARY_INCOME", "UNKNOWN"]), contributionBase: moneySchema.nullable() }).strict();
export const historyPeriodPatchSchema = z.object({ expectedHistoryRevision: z.number().int().min(0), command: z.union([
  z.object({ kind: z.literal("ADD"), entry }).strict(),
  z.object({ kind: z.literal("UPDATE"), id: z.string().regex(/^[a-f0-9]{64}$/), entry }).strict(),
  z.object({ kind: z.literal("DELETE"), id: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]) }).strict();
type Row = InsuranceHistory["months"][number];
const template = ({ month: _month, ...rest }: Row) => rest;
const gap = (row: Row) => row.status === "UNKNOWN" && row.scheme === "UNKNOWN" && row.salaryRegime === "UNKNOWN" && row.contributionBase === null && !row.evidence.length && !row.stateSalary && !row.creditKind && (!row.participantCategory || row.participantCategory === "UNKNOWN");
export function historyPeriods(document: InsuranceHistory) {
  const groups: Array<{ id: string; fromMonth: string; toMonth: string; months: number; details: Row; advancedOnly: boolean }> = [];
  for (const row of [...document.months].sort((a, b) => a.month.localeCompare(b.month))) {
    if (gap(row)) continue;
    const last = groups.at(-1);
    if (last && addMonths(last.toMonth, 1) === row.month && digest(template(last.details)) === digest(template(row))) { last.toMonth = row.month; last.months++; }
    else groups.push({ id: "", fromMonth: row.month, toMonth: row.month, months: 1, details: row, advancedOnly: row.status !== "PAID" || row.salaryRegime === "STATE" || row.evidence.length > 0 || Boolean(row.stateSalary || row.creditKind || row.participantCategory && row.participantCategory !== "UNKNOWN") });
  }
  return groups.map(group => ({ ...group, id: digest({ fromMonth: group.fromMonth, toMonth: group.toMonth, template: template(group.details) }), advancedOnly: group.advancedOnly || document.specialPeriods.some(period => period.startMonth <= group.toMonth && period.endMonth >= group.fromMonth) }));
}
export const historyPeriodsReportSchema = z.object({ historyRevision: z.number().int(), historyId: z.string().uuid().nullable(), documentHash: z.string().nullable(), recordedAt: z.string().nullable(), state: z.enum(["NOT_DECLARED", "DECLARED"]), declaredContributionMonths: z.number().int().nullable(), unknownMonths: z.number().int().nullable(), missingEvidenceMonths: z.number().int().nullable(), periods: z.array(z.object({ id: z.string(), fromMonth: z.string(), toMonth: z.string(), months: z.number().int(), details: contributionMonthSchema, advancedOnly: z.boolean() }).strict()) }).strict();
export function historyPeriodsReport(record: { id: string; revision: number; documentHash: string; recordedAt: string; document: InsuranceHistory } | null) {
  const rows = record?.document.months;
  return { historyRevision: record?.revision ?? 0, historyId: record?.id ?? null, documentHash: record?.documentHash ?? null, recordedAt: record?.recordedAt ?? null, state: record ? "DECLARED" as const : "NOT_DECLARED" as const,
    declaredContributionMonths: rows ? rows.filter(row => row.status === "PAID" || row.status === "CREDITED").length : null,
    unknownMonths: rows ? rows.filter(row => row.status === "UNKNOWN").length : null,
    missingEvidenceMonths: rows ? rows.filter(row => (row.status === "PAID" || row.status === "CREDITED") && !row.evidence.length).length : null,
    periods: record ? historyPeriods(record.document) : [] };
}
/** Granular commands append canonical history versions. Missing months stay
 * UNKNOWN; simple edits never replace legal evidence or special-period data. */
export function changeHistoryPeriod(document: InsuranceHistory | null, command: z.infer<typeof historyPeriodPatchSchema>["command"], today: string): InsuranceHistory {
  const fail = (code: string, message: string): never => { throw new AppError(422, code, message); };
  const source = command.kind === "ADD" ? undefined : document ? historyPeriods(document).find(period => period.id === command.id) : undefined;
  if (command.kind !== "ADD" && !source) return fail("HISTORY_PERIOD_NOT_FOUND", "Giai đoạn đã thay đổi. Hãy tải lại lịch sử.");
  if (source?.advancedOnly) return fail("HISTORY_PERIOD_ADVANCED_REQUIRED", "Giai đoạn có chứng từ hoặc chi tiết đặc thù; mở hồ sơ chi tiết để chỉnh mà không mất căn cứ.");
  const months = document?.months.filter(row => !source || row.month < source.fromMonth || row.month > source.toMonth) ?? [];
  let from = document?.coverageFrom, through = document?.coverageThrough, confirmed = document?.confirmedThroughMonth;
  if (command.kind !== "DELETE") {
    const value = command.entry;
    if (value.fromMonth > value.toMonth || value.toMonth > today.slice(0, 7)) return fail("HISTORY_PERIOD_DATES", "Tháng kết thúc phải từ tháng bắt đầu và không sau tháng hiện tại.");
    if (value.scheme === "VOLUNTARY" && value.salaryRegime === "EMPLOYER" || value.scheme === "COMPULSORY" && value.salaryRegime === "VOLUNTARY_INCOME") return fail("HISTORY_PERIOD_SCHEME", "Chế độ lương không khớp hình thức BHXH.");
    if (addMonths(value.fromMonth, 1199) < value.toMonth) return fail("HISTORY_PERIOD_TOO_LONG", "Lịch sử tối đa 1.200 tháng.");
    if (months.some(row => row.month >= value.fromMonth && row.month <= value.toMonth && !gap(row))) return fail("HISTORY_PERIOD_OVERLAP", "Giai đoạn này trùng lịch sử đã nhập. Hãy sửa mốc tháng.");
    if (document?.specialPeriods.some(period => period.startMonth <= value.toMonth && period.endMonth >= value.fromMonth)) return fail("HISTORY_PERIOD_ADVANCED_REQUIRED", "Khoảng này có giai đoạn đặc thù; cần quản lý ở hồ sơ chi tiết.");
    for (let month = value.fromMonth; month <= value.toMonth; month = addMonths(month, 1)) {
      const index = months.findIndex(row => row.month === month); if (index >= 0) months.splice(index, 1);
      months.push({ month, scheme: value.scheme, salaryRegime: value.salaryRegime, contributionBase: value.contributionBase, status: "PAID", evidence: [], ...(source?.details.participantCategory ? { participantCategory: source.details.participantCategory } : {}) });
    }
    from = from && from < value.fromMonth ? from : value.fromMonth; through = through && through > value.toMonth ? through : value.toMonth;
    confirmed = confirmed && confirmed > value.toMonth ? confirmed : value.toMonth;
  }
  if (!from || !through || !confirmed) return fail("HISTORY_PERIOD_NOT_FOUND", "Chưa có lịch sử để xóa.");
  return insuranceHistorySchema.parse({ ...(document ?? { schemaVersion: 1, birth: { precision: "UNKNOWN", declaredValue: null }, legalSex: "UNKNOWN", specialPeriods: [] }), coverageFrom: from, coverageThrough: through, confirmedThroughMonth: confirmed, months: months.sort((a, b) => a.month.localeCompare(b.month)) });
}
