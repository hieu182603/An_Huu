import { describe, expect, it } from "vitest";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { separateCapital } from "../modules/capital/separation";
import { prepareRetirement } from "../modules/retirement/prepare";
import { fixtureProfile, fixtureAsset, known, unknown, empty } from "./profile-v2-fixtures";
import { assumptionFixture } from "./assumptions-fixtures";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";

describe("profile emergency reserve", () => {
  it.each([
    ["owned allocation", fixtureAsset({ ownershipShare: known("0.5") }), "15000000"],
    ["locked", fixtureAsset({ liquidity: known("LOCKED") }), "0"],
    ["illiquid", fixtureAsset({ liquidity: known("ILLIQUID") }), "0"],
    ["future", fixtureAsset({ availableFromMonth: known("2026-11") }), "0"],
    ["current month", fixtureAsset({ availableFromMonth: known("2026-10") }), "30000000"],
    ["home", fixtureAsset({ type: "PRIMARY_HOME" }), "0"],
    ["property", fixtureAsset({ type: "REAL_ESTATE" }), "0"],
    ["unknown liquidity", fixtureAsset({ liquidity: unknown }), null],
    ["unknown availability", fixtureAsset({ availableFromMonth: unknown }), null],
    ["unknown allocation", fixtureAsset({ emergencyShare: unknown }), null],
    ["unknown ownership", fixtureAsset({ ownershipShare: unknown }), null],
    ["unknown value", fixtureAsset({ value: unknown }), null],
    ["unknown valuation date", fixtureAsset({ valuedOn: unknown }), null],
    ["stale valuation", fixtureAsset({ valuedOn: known("2026-10-03") }), null],
    ["foreign currency", fixtureAsset({ currency: "USD" }), null],
    ["explicit zero", fixtureAsset({ retirementShare: known("0.9"), emergencyShare: known("0"), value: unknown, liquidity: unknown, availableFromMonth: unknown }), "0"],
    ["zero value", fixtureAsset({ value: known("0") }), "0"],
    ["large decimal", fixtureAsset({ value: known("9007199254740993.25"), ownershipShare: known("1"), retirementShare: known("0.8"), emergencyShare: known("0.2"), otherGoalsShare: known("0") }), "1801439850948198.65"],
  ] as const)("%s agrees with capital separation", (_label, asset, expected) => {
    const profile = fixtureProfile({ assets: { status: "KNOWN", entries: [asset] } });
    expect(profileV2Summary(profile).values.emergencyReserve).toBe(expected);
    expect(separateCapital(profile, assumptionFixture()).declaredEmergencyReserve).toBe(expected);
  });

  it("keeps unknown groups distinct from confirmed empty or inapplicable groups", () => {
    for (const [assets, expected] of [
      [unknown, null], [empty(), "0"], [{ status: "NOT_APPLICABLE", reason: "Confirmed no assets" }, "0"],
    ] as const) expect(profileV2Summary(fixtureProfile({ assets })).values.emergencyReserve).toBe(expected);
  });

  it("sums eligible owned allocations, but cannot treat an unknown eligible amount as zero", () => {
    const profile = fixtureProfile({ assets: { status: "KNOWN", entries: [
      fixtureAsset({ id: "first", ownershipShare: known("0.5") }),
      fixtureAsset({ id: "second", value: known("200000000") }),
      fixtureAsset({ id: "locked", liquidity: known("LOCKED"), value: unknown }),
    ] } });
    expect(profileV2Summary(profile).values.emergencyReserve).toBe("75000000");
    if (profile.assets.status !== "KNOWN") throw new Error("fixture");
    profile.assets.entries[1].emergencyShare = unknown;
    const summary = profileV2Summary(profile);
    expect(summary.values.emergencyReserve).toBeNull();
    expect(summary.values.retirementLiquidAssets).toBe("150000000");
    expect(summary.issues).toContainEqual({ path: "emergencyReserve.assets.entries.1.emergencyShare", code: "UNKNOWN_VALUE" });
  });

  it("reserve-only unknowns do not change prepared retirement calculations or warnings", () => {
    const profile = retirementProfile(), { policy, assumptions } = retirementConfiguration(), command = retirementCommand();
    profile.assets = { status: "KNOWN", entries: [fixtureAsset({ retirementShare: known("0"), emergencyShare: known("1"), otherGoalsShare: known("0") })] };
    const baseline = prepareRetirement(profile, command, policy, assumptions);
    const unchanged = JSON.stringify(profile);
    profileV2Summary(profile);
    expect(JSON.stringify(profile)).toBe(unchanged);
    profile.assets.entries[0].liquidity = unknown;
    expect(profileV2Summary(profile).values.emergencyReserve).toBeNull();
    expect(prepareRetirement(profile, command, policy, assumptions)).toEqual(baseline);
    profile.assets.entries[0].emergencyShare = unknown;
    expect(prepareRetirement(profile, command, policy, assumptions)).toEqual(baseline);
  });
});
