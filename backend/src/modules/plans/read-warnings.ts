import { z } from "zod";
import { addMonths } from "../../common/calendar";
import type { ProfileV2 } from "../profiles/schema-v2";

export const planReadWarningSchema = z.object({ code: z.literal("PLAN_HORIZON_TRUNCATED"),
  message: z.string(), endMonth: z.string(), expectedEndMonth: z.string(), goalRevision: z.number().int(),
}).strict();
/** Read-time hint using the current declared goal and the pinned birth month.
 * Neither the snapshot nor its integrity/replay input is modified. */
export function planHorizonWarnings(profile: ProfileV2, endMonth: string, goal: { lifeExpectancy: number | null; revision: number } | null): z.infer<typeof planReadWarningSchema>[] {
  if (profile.personal.birthMonth.status !== "KNOWN" || goal?.lifeExpectancy == null) return [];
  const expectedEndMonth = addMonths(profile.personal.birthMonth.value, goal.lifeExpectancy * 12);
  return endMonth < expectedEndMonth ? [{ code: "PLAN_HORIZON_TRUNCATED", message: "Kế hoạch bị cắt ngắn, nên tính lại.",
    endMonth, expectedEndMonth, goalRevision: goal.revision }] : [];
}
