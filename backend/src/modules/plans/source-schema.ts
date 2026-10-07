import { z } from "zod";
import { monthSchema } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { pensionSourceSelectionSchema } from "../pensions/source-candidate";
import { loanSourceRevisionSchema } from "../debts/source-candidate";
import { loanCreationSchema } from "../debts/source-create";
import { refinanceSchema } from "../debts/refinance";
import { assetSourceCommandSchema } from "../capital/source-candidate";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const amount = z.string().max(160).regex(/^(0|[1-9]\d*)(\.\d+)?$/).refine(v => new D(v).lte("1e100"));
const identity = { commandId: z.string().uuid(), sourceId: z.string().min(1).max(200), expectedSourceRevision: z.number().int().min(0),
  effectiveFromMonth: monthSchema, effectiveToMonth: monthSchema, confirm: z.literal(true), document: z.string().trim().min(1).max(2000) };
export const flowSourceCommandSchema = z.discriminatedUnion("operation", [
  z.object({ ...identity, operation: z.literal("CREATE"), metric: z.enum(["income", "livingExpense", "additionalExpense", "pension"]),
    frequency: z.enum(["ONCE", "MONTHLY"]), amount, currency: z.literal("VND"), confirmation: z.enum(["USER_CONFIRMED", "HYPOTHETICAL"]) }).strict(),
  z.object({ ...identity, operation: z.literal("REVISE"), metric: z.enum(["income", "livingExpense", "additionalExpense", "pension"]),
    frequency: z.enum(["ONCE", "MONTHLY"]), amount, currency: z.literal("VND"), confirmation: z.enum(["USER_CONFIRMED", "HYPOTHETICAL"]) }).strict(),
  z.object({ ...identity, operation: z.literal("END") }).strict(),
]);
export const sourceReforecastSchema = z.object({ versionId: z.string().uuid(), expectedSnapshotHash: hash,
  expectedRevision: z.number().int().min(1), expectedProfileRevision: z.number().int().min(1), throughMonth: monthSchema,
  sourceCommands: z.array(flowSourceCommandSchema).max(100), pensionSelections: z.array(pensionSourceSelectionSchema).max(1).default([]),
  loanRevisions: z.array(loanSourceRevisionSchema).max(30).optional(),
  loanCreations: z.array(loanCreationSchema).max(30).optional(),
  refinances: z.array(refinanceSchema).max(30).optional(),
  assetCommands: z.array(assetSourceCommandSchema).max(30).optional(),
}).strict().superRefine((v, ctx) => {
  const commands = [...v.sourceCommands, ...v.pensionSelections, ...(v.loanRevisions ?? []), ...(v.loanCreations ?? []), ...(v.assetCommands ?? [])];
  const allIds = [...commands.map(c => c.commandId), ...(v.refinances ?? []).map(c => c.commandId)];
  if (new Set(allIds).size !== allIds.length || new Set(commands.map(c => c.sourceId)).size !== commands.length)
    ctx.addIssue({ code: "custom", message: "Mỗi nguồn và mã thao tác chỉ được dùng một lần trong một lần xem trước." });
  const linked = new Set<string>();
  for (const refi of v.refinances ?? []) {
    if (linked.has(refi.closingCommandId) || linked.has(refi.newLoanCommandId) ||
      !v.loanRevisions?.some(c => c.commandId === refi.closingCommandId && c.operation === "END" && c.refinanceCommandId === refi.commandId) ||
      !v.loanCreations?.some(c => c.commandId === refi.newLoanCommandId && c.refinanceCommandId === refi.commandId))
      ctx.addIssue({ code: "custom", message: "Tái cấp vốn cần một lệnh tất toán và một khoản vay mới riêng trong cùng lần lưu." });
    linked.add(refi.closingCommandId); linked.add(refi.newLoanCommandId);
  }
  for (const command of [...(v.loanRevisions ?? []), ...(v.loanCreations ?? [])]) if (command.refinanceCommandId && !v.refinances?.some(r => r.commandId === command.refinanceCommandId && linked.has(command.commandId)))
    ctx.addIssue({ code: "custom", message: "Thiếu bằng chứng đối soát tái cấp vốn trong cùng lần lưu." });
});
export const saveSourceReforecastSchema = z.object({ preview: sourceReforecastSchema, expectedInputHash: hash, confirm: z.literal(true) }).strict();
export type FlowSourceCommand = z.infer<typeof flowSourceCommandSchema>;
export type SourceReforecastCommand = z.infer<typeof sourceReforecastSchema>;
