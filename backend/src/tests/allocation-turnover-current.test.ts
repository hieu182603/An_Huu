import { describe, expect, it } from "vitest";
import { selectCandidate, compareChange } from "../modules/allocation-risk/selection";
import { currentWeightsFromHoldings, currentWeightsFromProfile, policyCodeResolver, turnoverFromCurrent } from "../modules/allocation-risk/current-weights";
import type { ProfileV2 } from "../modules/profiles/schema-v2";

const base = { pEssential: 0.95 };
const cand = (id: string, cvar: string, changePoints: string, turnoverFromCurrentPoints?: string | null) =>
  ({ ...base, id, cvarEssentialShortfallToday: cvar, changePoints, ...(turnoverFromCurrentPoints !== undefined ? { turnoverFromCurrentPoints } : {}) });
const resolve = policyCodeResolver(["CASH", "GOV_BOND", "EQUITY", "GOLD"], "EQUITY", "CASH");
const row = (assetClass: string, weightPercent: string) => ({ assetClass, weightPercent });
const targets = [row("CASH", "10"), row("GOV_BOND", "20"), row("EQUITY", "60"), row("GOLD", "10")];

describe("turnover tie-break against current holdings (spec 7.4 step 3 / 6.3)", () => {
  it("falls back to the template distance when no current weights exist", () => {
    // Equal CVaR: template distance decides (old behaviour), then id.
    const picked = selectCandidate([cand("HIGHER_EQUITY", "5", "2"), cand("BASE", "5", "0"), cand("LOWER_EQUITY", "5", "2")], "0.90");
    expect(picked?.id).toBe("BASE");
    expect(selectCandidate([cand("B", "5", "2", null), cand("A", "5", "1", null)], "0.90")?.id).toBe("A");
    expect(turnoverFromCurrent(null, targets)).toBeNull();
  });
  it("breaks a CVaR tie by turnover from the current holdings, not by the template distance", () => {
    // Template says BASE is closest (0), but the customer holds mostly equity, so HIGHER_EQUITY needs less trading.
    const picked = selectCandidate([cand("BASE", "5", "0", "20"), cand("HIGHER_EQUITY", "5", "5", "15"), cand("LOWER_EQUITY", "5", "5", "25")], "0.90");
    expect(picked?.id).toBe("HIGHER_EQUITY");
    expect(compareChange(cand("A", "1", "0", "3"), cand("B", "1", "9", "3"))).toBeLessThan(0); // equal turnover -> id
  });
  it("lets CVaR dominate turnover and the p_essential threshold dominate both", () => {
    const lowCvar = cand("LOWER_EQUITY", "4", "9", "40"), nearCurrent = cand("BASE", "6", "0", "0");
    expect(selectCandidate([nearCurrent, lowCvar], "0.90")?.id).toBe("LOWER_EQUITY");
    expect(selectCandidate([{ ...lowCvar, pEssential: 0.5 }, nearCurrent], "0.90")?.id).toBe("BASE");
  });
  it("computes half-L1 turnover in percentage points", () => {
    const current = currentWeightsFromHoldings([{ assetClass: "CASH", value: "30" }, { assetClass: "BOND", value: "20" }, { assetClass: "EQUITY", value: "50" }], resolve)!;
    expect(current.source).toBe("RECORDED_HOLDINGS");
    // |10-30| + |20-20| + |60-50| + |10-0| = 40 -> 20
    expect(turnoverFromCurrent(current, targets)).toBe("20");
    // A held class missing from the targets is not comparable.
    expect(turnoverFromCurrent({ ...current, weights: new Map([["REAL_ESTATE", current.weights.get("CASH")!]]) }, targets)).toBeNull();
  });
  it("returns no current weights for an empty or unmappable holdings snapshot", () => {
    expect(currentWeightsFromHoldings([], resolve)).toBeNull();
    expect(currentWeightsFromHoldings([{ assetClass: "CASH", value: "0" }], resolve)).toBeNull();
    expect(currentWeightsFromHoldings([{ assetClass: "BOND", value: "10" }], policyCodeResolver(["CASH", "EQUITY"], "EQUITY", "CASH"))).toBeNull();
  });
});

const asset = (type: string, value: string, extra: Record<string, unknown> = {}) => ({ id: type + value, label: type, type, value: { status: "KNOWN", value }, currency: "VND",
  valuedOn: { status: "KNOWN", value: "2026-01-01" }, ownershipShare: { status: "KNOWN", value: "1" }, retirementShare: { status: "KNOWN", value: "1" },
  emergencyShare: { status: "KNOWN", value: "0" }, otherGoalsShare: { status: "KNOWN", value: "0" }, liquidity: { status: "KNOWN", value: "LIQUID" },
  availableFromMonth: { status: "KNOWN", value: "2026-01" }, ...extra });
const profile = (entries: unknown[]) => ({ valuationDate: "2026-01-01", assets: { status: "KNOWN", entries } }) as unknown as ProfileV2;

describe("current weights derived from profile assets (explicit mapping only)", () => {
  it("maps CASH/DEPOSIT/BOND/STOCK_FUND/GOLD and skips homes and non-liquid assets", () => {
    const w = currentWeightsFromProfile(profile([asset("CASH", "10"), asset("DEPOSIT", "20"), asset("BOND", "20"), asset("STOCK_FUND", "40"), asset("GOLD", "10"),
      asset("PRIMARY_HOME", "9000"), asset("REAL_ESTATE", "9000"), asset("STOCK_FUND", "500", { liquidity: { status: "KNOWN", value: "LOCKED" } })]), resolve)!;
    expect(w.source).toBe("PROFILE_ASSETS");
    expect([...w.weights].map(([k, v]) => [k, v.toFixed()])).toEqual([["CASH", "30"], ["GOV_BOND", "20"], ["EQUITY", "40"], ["GOLD", "10"]]);
  });
  it("removes the protected reserve and near-term goals from cash before weighting (capital separation)", () => {
    const w = currentWeightsFromProfile(profile([asset("DEPOSIT", "100"), asset("STOCK_FUND", "50")]), resolve, "50")!;
    expect(w.weights.get("CASH")?.toFixed()).toBe("50");
    expect(w.weights.get("EQUITY")?.toFixed()).toBe("50");
    // Not enough cash to hold the protected amount, or protected amount unknown: the split is ambiguous.
    expect(currentWeightsFromProfile(profile([asset("DEPOSIT", "10"), asset("STOCK_FUND", "50")]), resolve, "20")).toBeNull();
    expect(currentWeightsFromProfile(profile([asset("DEPOSIT", "100")]), resolve, null)).toBeNull();
  });
  it("applies ownership and retirement share", () => {
    const w = currentWeightsFromProfile(profile([asset("CASH", "100", { retirementShare: { status: "KNOWN", value: "0.5" } }), asset("GOLD", "100", { ownershipShare: { status: "KNOWN", value: "0.5" } })]), resolve)!;
    expect(w.weights.get("CASH")!.toFixed()).toBe("50");
    expect(w.weights.get("GOLD")!.toFixed()).toBe("50");
  });
  it("is unavailable for OTHER, unknown values, foreign currency, or nothing investable", () => {
    expect(currentWeightsFromProfile(profile([asset("CASH", "10"), asset("OTHER", "10")]), resolve)).toBeNull();
    expect(currentWeightsFromProfile(profile([asset("CASH", "10", { value: { status: "UNKNOWN" } })]), resolve)).toBeNull();
    expect(currentWeightsFromProfile(profile([asset("CASH", "10", { currency: "USD" })]), resolve)).toBeNull();
    expect(currentWeightsFromProfile(profile([asset("PRIMARY_HOME", "10")]), resolve)).toBeNull();
    expect(currentWeightsFromProfile({ valuationDate: "2026-01-01", assets: { status: "UNKNOWN" } } as unknown as ProfileV2, resolve)).toBeNull();
    // An asset class that exists in the profile but not among the policy targets cannot be placed.
    expect(currentWeightsFromProfile(profile([asset("GOLD", "10")]), policyCodeResolver(["CASH", "EQUITY"], "EQUITY", "CASH"))).toBeNull();
  });
});
