import { z } from "zod";
import { amountSchema, collectionSchema, goalEntrySchema, knownOrUnknown, type ProfileV2 } from "./schema-v2";
import { Prisma } from "@prisma/client";
import { moneySchema } from "../../common/http";

export const careResponsibilitySchema = knownOrUnknown(z.enum(["SELF", "CHILDREN", "PARENTS", "BOTH", "OTHER"]));
const liquidityNeedsSchema = z.object({ y1: amountSchema, y3: amountSchema, y5: amountSchema }).strict();
const planningFields = {
  careResponsibility: careResponsibilitySchema,
  liquidityNeeds: liquidityNeedsSchema,
  goals: collectionSchema(goalEntrySchema),
};
export const planningPatchObject = z.object({ expectedRevision: z.number().int().min(1), ...planningFields }).strict();
export const planningPatchSchema = planningPatchObject.superRefine((input, ctx) => {
  for (const [earlier, later] of [["y1", "y3"], ["y1", "y5"], ["y3", "y5"]] as const) {
    const a = input.liquidityNeeds[earlier], b = input.liquidityNeeds[later];
    if (a.status === "KNOWN" && b.status === "KNOWN" && moneySchema.safeParse(a.value).success && moneySchema.safeParse(b.value).success && new Prisma.Decimal(a.value).gt(b.value))
      ctx.addIssue({ code: "custom", path: ["liquidityNeeds", later], message: "Nhu cầu lũy kế phải theo thứ tự 1 năm ≤ 3 năm ≤ 5 năm." });
  }
});
export function planningChanges(profile: ProfileV2, input: z.infer<typeof planningPatchSchema>) {
  // These cumulative declarations may cover the same goals: never create expenses,
  // sum the three horizons, infer family costs or change retirement preview inputs.
  return { personal: { ...profile.personal, careResponsibility: input.careResponsibility }, liquidityNeeds: input.liquidityNeeds, goals: input.goals };
}
export function profilePlanningReport(profile: ProfileV2, profileRevision: number) {
  return { profileRevision, valuationDate: profile.valuationDate, currency: "VND" as const,
    careResponsibility: profile.personal.careResponsibility ?? { status: "UNKNOWN" as const },
    liquidityNeeds: { y1: profile.liquidityNeeds?.y1 ?? { status: "UNKNOWN" as const }, y3: profile.liquidityNeeds?.y3 ?? { status: "UNKNOWN" as const }, y5: profile.liquidityNeeds?.y5 ?? { status: "UNKNOWN" as const } },
    goals: profile.goals ?? { status: "UNKNOWN" as const },
  };
}
export const planningReportSchema = z.object({ profileRevision: z.number().int(), valuationDate: z.string(), currency: z.literal("VND"), ...planningFields }).strict();
