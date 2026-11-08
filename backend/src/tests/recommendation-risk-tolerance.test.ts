import { describe, expect, it } from "vitest";
import { riskToleranceFromAssessment, storable } from "../modules/recommendation/service";

// Risk tolerance comes from the risk band pinned in the plan version, not the legacy retirement_goals row.
const policy = { riskBands: [
  { id: "BAND_GROWTH", minScore: 116 }, { id: "BAND_CONSERVATIVE", minScore: 0 }, { id: "BAND_BALANCED", minScore: 76 },
  { id: "BAND_AGGRESSIVE_GROWTH", minScore: 151 }, { id: "BAND_MODERATE_CONSERVATIVE", minScore: 36 },
] };

describe("riskToleranceFromAssessment", () => {
  it("maps band position on the pinned policy scale (unsorted input)", () => {
    expect(riskToleranceFromAssessment(policy, "BAND_CONSERVATIVE")).toBe("LOW");
    expect(riskToleranceFromAssessment(policy, "BAND_MODERATE_CONSERVATIVE")).toBe("LOW");
    expect(riskToleranceFromAssessment(policy, "BAND_BALANCED")).toBe("MEDIUM");
    expect(riskToleranceFromAssessment(policy, "BAND_GROWTH")).toBe("HIGH");
    expect(riskToleranceFromAssessment(policy, "BAND_AGGRESSIVE_GROWTH")).toBe("HIGH");
  });
  it("returns null when the band is missing or unknown, so suitability inputs stay required", () => {
    expect(riskToleranceFromAssessment(policy, null)).toBeNull();
    expect(riskToleranceFromAssessment(policy, "UNKNOWN")).toBeNull();
    expect(riskToleranceFromAssessment(undefined, "BAND_BALANCED")).toBeNull();
  });
  it("treats a single-band policy as MEDIUM and three bands as LOW/MEDIUM/HIGH", () => {
    expect(riskToleranceFromAssessment({ riskBands: [{ id: "ALL", minScore: 0 }] }, "ALL")).toBe("MEDIUM");
    const three = { riskBands: [{ id: "A", minScore: 0 }, { id: "B", minScore: 10 }, { id: "C", minScore: 20 }] };
    expect(["A", "B", "C"].map(id => riskToleranceFromAssessment(three, id))).toEqual(["LOW", "MEDIUM", "HIGH"]);
  });
});

describe("storable", () => {
  it("rounds floats to what PostgreSQL JSONB keeps, leaving integers and strings untouched", () => {
    const v = storable({ w: 0.28115061621621623, n: 3, s: "0.28115061621621623", a: [0.1 + 0.2] }) as Record<string, unknown>;
    expect(v).toEqual({ w: 0.281150616216, n: 3, s: "0.28115061621621623", a: [0.3] });
    expect(storable(v)).toEqual(v); // idempotent: a stored document re-hashes identically
  });
});
