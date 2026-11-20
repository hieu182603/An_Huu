import { describe, expect, it } from "vitest";
import { liquidityRequirement } from "../modules/capital/liquidity";
import { fixtureProfile, known } from "./profile-v2-fixtures";
import type { CapitalSeparation } from "../modules/capital/separation";

function result(amount: string, due: number, later?: string) {
  const profile = fixtureProfile({ liquidityNeeds: { y1: { ...known("100000000"), matchedGoalId: "goal" }, ...(later ? { y3: known(later) } : {}) },
    goals: { status: "KNOWN", entries: [{ id: "goal", label: "Confirmed need", amountToday: known(amount), dueMonth: known("2027-10"),
      priority: known("ESSENTIAL"), deferrable: { status: "KNOWN", value: false } }] } });
  const capital = { status: "READY", goals: [{ id: "goal", monthsUntilDue: due, treatment: "RESERVED", presentValue: amount }] } as CapitalSeparation;
  return liquidityRequirement(profile, capital).horizons;
}
describe("confirmed liquidity is bounded by the goal's amount and date", () => {
  it("keeps a partial match's residual inside the twelve-month cash constraint", () => {
    expect(result("10000000", 12)[0]).toMatchObject({ coveredByReserved: "10000000", uncovered: "90000000", amount: "100000000" });
  });
  it("does not use a two-year goal to erase cash needed in twelve months", () => {
    expect(result("100000000", 24)[0]).toMatchObject({ coveredByReserved: "0", uncovered: "100000000", amount: "100000000" });
  });
  it("carries the confirmed part into later cumulative needs without double counting", () => {
    expect(result("100000000", 12, "200000000")[1]).toMatchObject({ coveredByReserved: "100000000", uncovered: "100000000", amount: "200000000" });
  });
});
