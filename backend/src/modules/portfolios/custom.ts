import { z } from "zod";
import { Prisma } from "@prisma/client";

const D = Prisma.Decimal.clone({ precision: 48 });
const weight = z.string().max(20).regex(/^(0|[1-9]\d?|100)(\.\d{1,8})?$/).refine(v => new D(v).lte(100));
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
export const customAllocationSchema = z.object({
  model: z.literal("custom-glide-v1"),
  weights: z.array(z.object({ assetClass: code, weightPercent: weight }).strict()).min(1).max(20)
    .refine(rows => new Set(rows.map(r => r.assetClass)).size === rows.length, "Không được trùng loại tài sản.")
    .refine(rows => rows.reduce((sum, r) => sum.plus(r.weightPercent), new D(0)).eq(100), "Tổng tỷ trọng phải bằng 100%.")
    .transform(rows => [...rows].sort((a, b) => a.assetClass.localeCompare(b.assetClass))),
}).strict();
export const customizationPolicySchema = z.object({
  evidence: z.string().trim().min(5).max(2000),
  path: z.literal("FOLLOW_TEMPLATE_SHIFTS"),
  bounds: z.array(z.object({ assetClass: code, minPercent: weight, maxPercent: weight }).strict()
    .refine(row => new D(row.minPercent).lte(row.maxPercent))).min(1).max(20)
    .refine(rows => new Set(rows.map(r => r.assetClass)).size === rows.length),
}).strict();
export type CustomAllocation = z.infer<typeof customAllocationSchema>;
export type CustomizationPolicy = z.infer<typeof customizationPolicySchema>;

/** Follow the published template's shifts, clipping at zero and renormalizing.
 * This personal choice changes weights, never published returns or inflation. */
export function customTargets(custom: CustomAllocation, initial: Map<string, Prisma.Decimal>, target: Map<string, Prisma.Decimal>) {
  const values = [...initial.keys()].map(assetClass => ({ assetClass, value: D.max(0,
    new D(custom.weights.find(r => r.assetClass === assetClass)?.weightPercent ?? "0").div(100)
      .plus(target.get(assetClass) ?? 0).minus(initial.get(assetClass) ?? 0)) }));
  const total = values.reduce((sum, r) => sum.plus(r.value), new D(0));
  if (total.isZero()) throw new RangeError("Empty custom allocation path");
  let assigned = new D(0);
  return new Map(values.map((r, i) => {
    const value = i === values.length - 1 ? new D(1).minus(assigned) : r.value.div(total);
    assigned = assigned.plus(value);
    return [r.assetClass, value] as const;
  }));
}
export function customWeightIssues(custom: CustomAllocation, allowed: CustomizationPolicy | undefined, codes: string[], targets: Map<string, Prisma.Decimal>) {
  if (!allowed) return ["CUSTOM_POLICY_REQUIRED"];
  const issues: string[] = [];
  if (custom.weights.some(r => !codes.includes(r.assetClass)) || allowed.bounds.some(r => !codes.includes(r.assetClass))) issues.push("CUSTOM_ASSET_NOT_ALLOWED");
  for (const code of codes) {
    const bound = allowed.bounds.find(b => b.assetClass === code), percent = new D(targets.get(code) ?? 0).mul(100);
    if (!bound || percent.lt(bound.minPercent) || percent.gt(bound.maxPercent)) issues.push(`CUSTOM_BOUND:${code}`);
  }
  return issues;
}
