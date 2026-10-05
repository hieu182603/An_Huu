import { z } from "zod";
import { monthSchema } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { pensionSourceSelectionSchema } from "../pensions/source-candidate";
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
}).strict().superRefine((v, ctx) => {
  const commands = [...v.sourceCommands, ...v.pensionSelections];
  if (new Set(commands.map(c => c.commandId)).size !== commands.length || new Set(commands.map(c => c.sourceId)).size !== commands.length)
    ctx.addIssue({ code: "custom", message: "Mỗi nguồn và mã thao tác chỉ được dùng một lần trong một lần xem trước." });
});
export const saveSourceReforecastSchema = z.object({ preview: sourceReforecastSchema, expectedInputHash: hash, confirm: z.literal(true) }).strict();
export type FlowSourceCommand = z.infer<typeof flowSourceCommandSchema>;
export type SourceReforecastCommand = z.infer<typeof sourceReforecastSchema>;
