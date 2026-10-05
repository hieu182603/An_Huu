import { z } from "zod";
import { moneySchema } from "../../common/http";
import { monthSchema } from "../../common/calendar";
export const AI_POLICY_VERSION = "ai-explanation-gemini-2026-10-v2";
export const AI_RETENTION_DAYS = 30;
export const consentSchema = z.object({ expectedRevision: z.number().int().min(0), policyVersion: z.literal(AI_POLICY_VERSION),
  processing: z.boolean(), saveHistory: z.boolean() }).strict().refine(v => v.processing || !v.saveHistory, "Lưu hội thoại cần đồng ý xử lý.");
export const explanationSchema = z.object({ question: z.string().trim().min(1).max(2000),
  planId: z.string().uuid().optional(), versionId: z.string().uuid().optional(),
  throughMonth: monthSchema.optional(),
  conversationId: z.string().uuid().optional(), expectedRevision: z.number().int().min(0).optional() }).strict()
  .refine(v => !!v.planId === !!v.versionId, "Cần cả kế hoạch và phiên bản.")
  .refine(v => !v.throughMonth || !!v.planId, "Giải thích thực tế cần phiên bản kế hoạch.")
  .refine(v => !!v.conversationId === (v.expectedRevision !== undefined), "Hội thoại cần revision.");
export const aiSimulationSchema = z.object({ planId: z.string().uuid(), versionId: z.string().uuid(), expectedProfileRevision: z.number().int().min(1),
  changes: z.object({ retirementMonth: monthSchema.optional(), monthlyContribution: moneySchema.optional(), monthlyExpenseToday: moneySchema.optional() }).strict()
    .refine(v => Object.keys(v).length > 0, "Cần đầu vào mô phỏng.") }).strict();
export const titleSchema = z.object({ expectedRevision: z.number().int().min(0), title: z.string().trim().min(1).max(120) }).strict();
export const messageEditSchema = z.object({ expectedRevision: z.number().int().min(0), content: z.string().trim().min(1).max(2000) }).strict();
export const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const sourceInputSchema = z.object({ title: z.string().trim().min(1).max(200), referenceCode: z.string().trim().max(100).optional(),
  category: z.string().trim().min(1).max(80), version: z.string().trim().min(1).max(40), rawContent: z.string().trim().min(20).max(50000),
  fileUrl: z.string().url().max(1000).refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; }).optional(),
  effectiveDate: z.string().datetime(), validUntil: z.string().datetime().nullable().optional() }).strict()
  .refine(v => !v.validUntil || v.validUntil > v.effectiveDate, "Hết hiệu lực phải sau ngày hiệu lực.");
export const sourceEditSchema = z.object({ expectedRevision: z.number().int().min(0), data: sourceInputSchema }).strict();
export const sourceRevisionSchema = z.object({ expectedRevision: z.number().int().min(0) }).strict();
export const sourceApprovalSchema = sourceRevisionSchema.extend({ approved: z.boolean(), reviewNote: z.string().trim().min(1).max(1000), confirm: z.literal(true) }).strict();
