import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { incomeEntrySchema, expenseEntrySchema, profileV2Schema, type ProfileV2 } from "./schema-v2";

const group = z.enum(["income", "expenses"]);
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const entryFields = { kind: z.enum(["ADD", "UPDATE", "SPLIT"]), sourceId: id.optional(), confirmUnknownGroup: z.boolean().optional() };
const entryCommand = z.discriminatedUnion("group", [
  z.object({ ...entryFields, group: z.literal("income"), entry: incomeEntrySchema }).strict(),
  z.object({ ...entryFields, group: z.literal("expenses"), entry: expenseEntrySchema }).strict(),
]).superRefine((value, ctx) => {
  if ((value.kind === "SPLIT") !== (value.sourceId !== undefined))
    ctx.addIssue({ code: "custom", path: ["sourceId"], message: "Chỉ thao tác tách khoản mới cần ID khoản gốc." });
});
export const cashflowPatchSchema = z.object({
  expectedRevision: z.number().int().min(1),
  command: z.union([entryCommand,
    z.object({ kind: z.literal("DELETE"), group, id }).strict(),
    z.object({ kind: z.literal("CONFIRM_NONE"), group, reason: z.string().trim().min(1).max(300) }).strict(),
  ]),
}).strict();
export type CashflowCommand = z.infer<typeof cashflowPatchSchema>["command"];
const D = Prisma.Decimal.clone({ precision: 48 });
const reference = (entry: z.infer<typeof incomeEntrySchema> | z.infer<typeof expenseEntrySchema>) =>
  ("source" in entry && entry.source === "PENSION") || ("category" in entry && entry.category === "DEBT_PAYMENT");

/** Build one revision-checked profile change. Splitting preserves the entire
 * schedule and currency, so the original cashflow is never counted twice. */
export function cashflowChanges(profile: ProfileV2, command: CashflowCommand): Partial<ProfileV2> {
  const key = command.group, current = profile[key];
  const fail = (code: string, message: string): never => { throw new AppError(400, code, message); };
  if (command.kind === "CONFIRM_NONE") {
    if (current.status === "KNOWN" && current.entries.length)
      fail("CASHFLOW_NOT_EMPTY", "Hãy xóa từng khoản trước khi xác nhận không có, tránh mất dữ liệu.");
    return { [key]: { status: "NOT_APPLICABLE", reason: command.reason } };
  }
  const rows = current.status === "KNOWN" ? [...current.entries] : [];
  const targetId = command.kind === "DELETE" ? command.id : command.entry.id;
  const index = rows.findIndex(entry => entry.id === targetId);
  if (command.kind === "DELETE" || command.kind === "UPDATE") {
    if (index < 0) fail("CASHFLOW_ENTRY_NOT_FOUND", "Khoản cần sửa hoặc xóa không còn trong hồ sơ. Hãy tải lại.");
    if (reference(rows[index])) fail("CASHFLOW_REFERENCE_READ_ONLY", "Cập nhật lương hưu hoặc trả nợ ở trang tương ứng để tránh tính trùng.");
    if (command.kind === "DELETE") rows.splice(index, 1);
    else {
      if (reference(command.entry)) fail("CASHFLOW_REFERENCE_READ_ONLY", "Không đổi khoản sinh hoạt thành lương hưu hoặc trả nợ ở đây.");
      rows[index] = command.entry;
    }
  } else {
    if (index >= 0) fail("CASHFLOW_DUPLICATE_ID", "ID khoản đã tồn tại. Hãy tải lại trước khi thêm.");
    if (reference(command.entry)) fail("CASHFLOW_REFERENCE_READ_ONLY", "Khai lương hưu hoặc trả nợ ở trang tương ứng.");
    if (current.status === "UNKNOWN" && command.confirmUnknownGroup !== true)
      fail("CASHFLOW_COMPLETENESS_REQUIRED", "Xác nhận đã kê đầy đủ nhóm thu hoặc chi trước khi thay trạng thái chưa xác định.");
    if (command.kind === "SPLIT") {
      const sourceIndex = rows.findIndex(entry => entry.id === command.sourceId), source = rows[sourceIndex];
      const originalAmount = source?.amount, splitAmount = command.entry.amount;
      if (!source || reference(source) || originalAmount?.status !== "KNOWN" || splitAmount.status !== "KNOWN")
        return fail("CASHFLOW_SPLIT_SOURCE_REQUIRED", "Chọn khoản gốc và số tiền đã xác định để tách.");
      if ((["currency", "frequency", "startMonth", "endMonth"] as const).some(field => source[field] !== command.entry[field]))
        fail("CASHFLOW_SPLIT_SCHEDULE_MISMATCH", "Khoản tách phải giữ cùng tiền tệ, tần suất và thời gian với khoản gốc.");
      const remaining = new D(originalAmount.value).minus(splitAmount.value);
      if (remaining.lt(0)) fail("CASHFLOW_SPLIT_EXCEEDS_SOURCE", "Khoản tách vượt số còn lại. Giảm số tiền hoặc chọn cộng khoản mới.");
      if (remaining.isZero()) rows.splice(sourceIndex, 1);
      else rows[sourceIndex] = { ...source, amount: { status: "KNOWN", value: remaining.toFixed() } };
    }
    rows.push(command.entry);
  }
  // Validate cross-references, duplicate IDs and collection limits after mutation.
  const checked = profileV2Schema.parse({ ...profile, [key]: { status: "KNOWN", entries: rows } });
  return { [key]: checked[key] };
}
