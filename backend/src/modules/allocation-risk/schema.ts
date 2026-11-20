import { z } from "zod";
import { retirementPreviewSchema } from "../retirement/schema";
import { LIMITS } from "./simulation";
import { unitRatio } from "./policy";
import { customAllocationSchema } from "../portfolios/custom";

export const riskRequestSchema = z.object({
  plan: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("PREVIEW"), preview: retirementPreviewSchema }).strict(),
    z.object({ kind: z.literal("SAVED_VERSION"), planId: z.string().uuid(), versionId: z.string().uuid() }).strict(),
  ]),
  marketVersionId: z.string().uuid().optional(),
  /** Customer-chosen path count (milestones 20/50/100/200/500/1000, max LIMITS.maxPaths). Omitted: policy simulationPaths, else 20. */
  paths: z.number().int().min(1).max(LIMITS.maxPaths).optional(),
  /** True when the request only raises paths for the same inputs (reuses cached paths): separate, looser rate limit. */
  continuation: z.boolean().optional(),
  detail: z.literal("ALLOCATION_V2").optional(),
  trialAllocation: customAllocationSchema.optional(),
  /** Optional customer-chosen essential probability threshold (validated against policy essentialThresholdRange). */
  essentialThreshold: unitRatio.optional(),
}).strict();
export type RiskRequest = z.infer<typeof riskRequestSchema>;
