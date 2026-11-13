import { z } from "zod";
import { retirementPreviewSchema } from "../retirement/schema";
import { LIMITS } from "./simulation";
import { customAllocationSchema } from "../portfolios/custom";

export const riskRequestSchema = z.object({
  plan: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("PREVIEW"), preview: retirementPreviewSchema }).strict(),
    z.object({ kind: z.literal("SAVED_VERSION"), planId: z.string().uuid(), versionId: z.string().uuid() }).strict(),
  ]),
  marketVersionId: z.string().uuid().optional(),
  paths: z.number().int().min(1).max(LIMITS.maxPaths).default(100),
  detail: z.literal("ALLOCATION_V2").optional(),
  trialAllocation: customAllocationSchema.optional(),
}).strict();
export type RiskRequest = z.infer<typeof riskRequestSchema>;
