import { z } from "zod";
import { AppError } from "../../common/errors";
import { moneySchema } from "../../common/http";
import { debtEntrySchema, profileV2Schema, type ProfileV2, type DebtEntry } from "./schema-v2";
import { DebtDecimal as D } from "../debts/loan";
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const debtPatchSchema = z.object({ expectedRevision: z.number().int().min(1), command: z.union([
  z.object({ kind: z.enum(["ADD", "UPDATE"]), entry: debtEntrySchema, confirmUnknownGroup: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal("SPLIT"), sourceId: id, entry: debtEntrySchema }).strict(),
  z.object({ kind: z.literal("DELETE"), id }).strict(),
  z.object({ kind: z.literal("CONFIRM_NONE"), reason: z.string().trim().min(1).max(300) }).strict(),
]) }).strict();
export type DebtCommand = z.infer<typeof debtPatchSchema>["command"];
export function debtChanges(profile: ProfileV2, command: DebtCommand): Pick<ProfileV2, "debts" | "expenses"> {
  const fail = (code: string, message: string): never => { throw new AppError(400, code, message); };
  const current = profile.debts;
  const rows: DebtEntry[] = current.status === "KNOWN" ? [...current.entries] : [];
  let expenses = profile.expenses;
  if (command.kind === "CONFIRM_NONE") {
    if (rows.length) return fail("DEBTS_NOT_EMPTY", "Hãy xóa từng khoản trước khi xác nhận không có nợ.");
    return { debts: { status: "NOT_APPLICABLE", reason: command.reason }, expenses };
  }
  const synchronize = (oldId: string, entry?: DebtEntry) => {
    if (expenses.status !== "KNOWN") return;
    expenses = { ...expenses, entries: expenses.entries.flatMap(expense => {
      if (expense.loanId !== oldId) return [expense];
      if (!entry) return [];
      const payment = entry.contract?.status !== "KNOWN" && entry.illustration?.annualRatePercent.status !== "KNOWN" && entry.payment.status === "KNOWN" && entry.paymentShare.status === "KNOWN" ? new D(entry.payment.value).mul(entry.paymentShare.value).toFixed() : null;
      return [{ ...expense, loanId: entry.id, currency: entry.currency, startMonth: entry.startMonth, endMonth: entry.endMonth, frequency: entry.frequency,
        amount: payment !== null && moneySchema.safeParse(payment).success ? { status: "KNOWN" as const, value: payment } : { status: "UNKNOWN" as const } }];
    }) };
  };
  const index = rows.findIndex(row => row.id === (command.kind === "DELETE" ? command.id : command.entry.id));
  if (command.kind === "DELETE" || command.kind === "UPDATE") {
    if (index < 0) return fail("DEBT_NOT_FOUND", "Khoản vay không còn trong hồ sơ. Hãy tải lại.");
    if (command.kind === "DELETE") { rows.splice(index, 1); synchronize(command.id); }
    else { rows[index] = command.entry; synchronize(command.entry.id, command.entry); }
  } else {
    if (index >= 0) return fail("DEBT_DUPLICATE_ID", "ID khoản vay đã tồn tại.");
    if (current.status === "UNKNOWN" && (command.kind !== "ADD" || command.confirmUnknownGroup !== true)) return fail("DEBT_COMPLETENESS_REQUIRED", "Xác nhận đã kê đầy đủ nhóm nợ trước khi lưu.");
    if (command.kind === "SPLIT") {
      const sourceIndex = rows.findIndex(row => row.id === command.sourceId), source = rows[sourceIndex];
      const originalBalance = source?.outstandingBalance, originalPayment = source?.payment, balance = command.entry.outstandingBalance, payment = command.entry.payment;
      if (!source || originalBalance?.status !== "KNOWN" || originalPayment?.status !== "KNOWN" || balance.status !== "KNOWN" || payment.status !== "KNOWN") return fail("DEBT_SPLIT_SOURCE_REQUIRED", "Cần dư nợ và tiền trả đã xác định của khoản gốc để tách.");
      if (source.contract?.status === "KNOWN" || command.entry.contract?.status === "KNOWN" || source.sharedLoanId) return fail("DEBT_SPLIT_CONTRACT_OR_SHARED", "Khoản có hợp đồng hoặc khoản vay chung cần chỉnh phân bổ, không tách thành hai khoản khai trùng.");
      const sameShare = (key: "balanceShare" | "paymentShare") => { const a = source[key], b = command.entry[key]; return a.status === b.status && (a.status === "UNKNOWN" || b.status === "KNOWN" && new D(a.value).eq(b.value)); };
      if (!sameShare("balanceShare") || !sameShare("paymentShare") || source.currency !== command.entry.currency || JSON.stringify(source.balanceAsOf) !== JSON.stringify(command.entry.balanceAsOf) || (["startMonth", "endMonth", "frequency"] as const).some(key => source[key] !== command.entry[key])) return fail("DEBT_SPLIT_BASIS_MISMATCH", "Khoản tách phải giữ ngày dư nợ, tiền tệ, tỷ lệ phân bổ và lịch của khoản gốc.");
      const remainingBalance = new D(originalBalance.value).minus(balance.value), remainingPayment = new D(originalPayment.value).minus(payment.value);
      if (!new D(balance.value).gt(0) || remainingBalance.lt(0) || remainingPayment.lt(0) || remainingBalance.isZero() && !remainingPayment.isZero()) return fail("DEBT_SPLIT_EXCEEDS_SOURCE", "Khoản tách vượt dư nợ/tiền trả còn lại; khi tách hết dư nợ phải tách hết tiền trả.");
      if (remainingBalance.isZero()) { rows.splice(sourceIndex, 1); synchronize(source.id, command.entry); }
      else {
        rows[sourceIndex] = { ...source, outstandingBalance: { status: "KNOWN", value: remainingBalance.toFixed() }, payment: { status: "KNOWN", value: remainingPayment.toFixed() } };
        synchronize(source.id, rows[sourceIndex]);
      }
    }
    rows.push(command.entry);
  }
  const checked = profileV2Schema.parse({ ...profile, debts: { status: "KNOWN", entries: rows }, expenses });
  return { debts: checked.debts, expenses: checked.expenses };
}
