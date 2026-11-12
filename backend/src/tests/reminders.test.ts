import { describe, expect, it } from "vitest";
import { memoryDb } from "./memory-db";
import { reminderId, runMonthlyReminders } from "../jobs/reminders";

async function fixture() {
  const f = memoryDb();
  const user = async (id: string, extra: Record<string, unknown> = {}) => f.db.user.create({ data: { id, email: `${id}@x.vn`, passwordHash: "x", fullName: id, role: "USER", status: "ACTIVE", ...extra } as never });
  for (const id of ["opted", "optedOut", "noPlan", "recorded", "suspended", "admin"]) await user(id, id === "suspended" ? { status: "SUSPENDED" } : id === "admin" ? { role: "ADMIN" } : {});
  for (const id of ["opted", "noPlan", "recorded", "suspended", "admin"]) await f.db.notificationPreference.create({ data: { userId: id, goalAlerts: true } as never });
  await f.db.notificationPreference.create({ data: { userId: "optedOut", goalAlerts: false } as never });
  for (const id of ["opted", "optedOut", "recorded", "suspended", "admin"]) await f.db.retirementPlan.create({ data: { userId: id, currentVersionId: `v-${id}` } as never });
  await f.db.retirementPlan.create({ data: { userId: "noPlan", currentVersionId: null } as never });
  await f.db.actualMonth.create({ data: { userId: "recorded", period: "2026-11", revision: 1, payload: {} } as never });
  return f;
}

describe("monthly check-in reminders", () => {
  it("does nothing before the 25th in Vietnam time", async () => {
    const f = await fixture();
    // 2026-11-24 23:59 in Vietnam is still before the reminder day.
    expect(await runMonthlyReminders(f.db, new Date("2026-11-24T16:59:00Z"))).toEqual({ period: "2026-11", due: false, created: 0 });
    expect(f.rows("notification") ?? []).toHaveLength(0);
  });
  it("reminds only opted-in active users with a main plan and no record for the month, once", async () => {
    const f = await fixture(), now = new Date("2026-11-24T17:00:00Z"); // 2026-11-25 00:00 in Vietnam
    expect(await runMonthlyReminders(f.db, now)).toMatchObject({ period: "2026-11", due: true, created: 1 });
    expect(f.rows("notification")).toHaveLength(1);
    expect(f.rows("notification")[0]).toMatchObject({ id: reminderId("opted", "2026-11"), userId: "opted", path: "/user/simulation" });
    expect(await runMonthlyReminders(f.db, new Date("2026-11-30T10:00:00Z"))).toMatchObject({ created: 0 });
    expect(f.rows("notification")).toHaveLength(1);
    // A new month produces a new reminder with a different stable id.
    expect(await runMonthlyReminders(f.db, new Date("2026-12-26T00:00:00Z"))).toMatchObject({ period: "2026-12", created: 2 });
  });
  it("derives a valid, deterministic UUID per user and month", () => {
    expect(reminderId("a", "2026-11")).toBe(reminderId("a", "2026-11"));
    expect(reminderId("a", "2026-11")).not.toBe(reminderId("a", "2026-12"));
    expect(reminderId("a", "2026-11")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
