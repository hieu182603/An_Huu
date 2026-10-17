import { z } from "zod";
import { retirementPreviewSchema } from "../retirement/schema";

export const metricExplanationSchema = z.object({
  metricKey: z.string().min(1).max(160),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("PLAN_VERSION"), planId: z.string().uuid(), versionId: z.string().uuid() }).strict(),
    z.object({ kind: z.literal("PREVIEW"), input: retirementPreviewSchema }).strict(),
  ]),
  // SUMMARY (popup) aggregates month-by-month inputs; MONTHLY returns every month.
  detail: z.enum(["SUMMARY", "MONTHLY"]).default("SUMMARY"),
}).strict();
export type ExplanationDetail = z.infer<typeof metricExplanationSchema>["detail"];
// Request shape before defaults: callers may omit `detail`.
export type MetricExplanationRequest = z.input<typeof metricExplanationSchema>;
export type MetricExplanationSource = z.infer<typeof metricExplanationSchema>["source"];
