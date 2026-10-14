import { z } from "zod";
import { retirementPreviewSchema } from "../retirement/schema";
export const createPlanVersionSchema = z.object({
  expectedRevision: z.number().int().min(0),
  expectedInputHash: z.string().regex(/^[a-f0-9]{64}$/),
  preview: retirementPreviewSchema,
}).strict();
export const applyPlanVersionSchema = z.object({
  versionId: z.string().uuid(), expectedRevision: z.number().int().min(1),
  expectedProfileRevision: z.number().int().min(1), confirm: z.literal(true),
}).strict();
export const planListSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const planKeySchema = z.string().uuid();
export const planReportQuerySchema = z.object({ versionId: z.string().uuid().optional() }).strict();
export const planExportQuerySchema = z.object({ format: z.enum(["technical", "readable-vi"]).default("technical") }).strict();
export const planCompareSchema = z.object({ baselineVersionId: z.string().uuid(), candidateVersionId: z.string().uuid() }).strict();
export const planSimulationSchema = z.object({ preview: retirementPreviewSchema }).strict();
export const SNAPSHOT_FORMAT = "retirement-plan-snapshot-v1";
