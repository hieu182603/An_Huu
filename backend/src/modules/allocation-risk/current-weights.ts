import { RetirementDecimal as D } from "../retirement/engine";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { Allocation } from "./rebalance";

/**
 * Customer's CURRENT holdings by policy asset class, as percent weights (sum 100).
 * Used only to measure turnover for the tie-break after CVaR (spec 7.4 step 3 / 6.3):
 * it never changes capital, constraints or simulation inputs.
 *
 * Sources, in order of preference:
 *  1. RECORDED_HOLDINGS: the user's recorded investment holdings valued at published prices
 *     (holdings module summary, asset classes CASH/BOND/EQUITY/GOLD). Ignored when the snapshot
 *     is empty or cannot be fully valued (stale price, missing class).
 *  2. PROFILE_ASSETS: liquid, retirement-share profile assets with an unambiguous type mapping:
 *     CASH, DEPOSIT -> CASH; BOND -> BOND (policy GOV_BOND/BOND); STOCK_FUND -> EQUITY; GOLD -> GOLD.
 *     PRIMARY_HOME/REAL_ESTATE and non-liquid/not-yet-available assets are not investable and are
 *     skipped (same rule as capital separation). OTHER, or any unknown/foreign-currency/unvalued
 *     asset that would carry retirement share, makes current weights unavailable.
 */
export type TurnoverBasis = "CURRENT_HOLDINGS" | "TEMPLATE_FALLBACK";
export type CurrentWeights = { source: "RECORDED_HOLDINGS" | "PROFILE_ASSETS"; weights: Map<string, InstanceType<typeof D>> };
type Generic = "CASH" | "BOND" | "EQUITY" | "GOLD";

/** Policy asset-class code for a generic class, only when a target row carries it unambiguously. */
export function policyCodeResolver(targetCodes: string[], equityCode: string, depositCode: string) {
  const options: Record<Generic, string[]> = { CASH: [depositCode, "CASH"], EQUITY: [equityCode, "EQUITY", "STOCK"], BOND: ["GOV_BOND", "BOND"], GOLD: ["GOLD"] };
  return (generic: string): string | null => (options[generic as Generic] ?? []).find(code => targetCodes.includes(code)) ?? null;
}
type Resolve = ReturnType<typeof policyCodeResolver>;

function normalise(amounts: Map<string, InstanceType<typeof D>>): Map<string, InstanceType<typeof D>> | null {
  const total = [...amounts.values()].reduce((s, v) => s.plus(v), new D(0));
  if (total.lte(0)) return null;
  return new Map([...amounts].map(([code, v]) => [code, v.div(total).mul(100)]));
}

export function currentWeightsFromHoldings(assetClasses: Array<{ assetClass: string; value: string }> | null | undefined, resolve: Resolve): CurrentWeights | null {
  if (!assetClasses?.length) return null;
  const amounts = new Map<string, InstanceType<typeof D>>();
  for (const row of assetClasses) {
    const code = resolve(row.assetClass);
    if (new D(row.value).lte(0)) continue;
    if (!code) return null;
    amounts.set(code, (amounts.get(code) ?? new D(0)).plus(row.value));
  }
  const weights = normalise(amounts);
  return weights ? { source: "RECORDED_HOLDINGS", weights } : null;
}

const MAPPED: Record<string, Generic> = { CASH: "CASH", DEPOSIT: "CASH", BOND: "BOND", STOCK_FUND: "EQUITY", GOLD: "GOLD" };

/** protectedAmount: capital separation's emergency reserve + near-term goals (held in deposits, not long-term
 * capital). It is removed from the cash bucket first; if cash cannot cover it the split is ambiguous -> null. */
export function currentWeightsFromProfile(profile: ProfileV2, resolve: Resolve, protectedAmount: string | null = "0"): CurrentWeights | null {
  if (profile.assets.status !== "KNOWN") return null;
  const month = profile.valuationDate.slice(0, 7), amounts = new Map<string, InstanceType<typeof D>>();
  for (const a of profile.assets.entries) {
    if (a.type === "PRIMARY_HOME" || a.type === "REAL_ESTATE") continue;
    if (a.retirementShare.status !== "KNOWN") return null;
    if (new D(a.retirementShare.value).isZero()) continue;
    if (a.liquidity.status !== "KNOWN" || a.availableFromMonth.status !== "KNOWN") return null;
    if (a.liquidity.value !== "LIQUID" || a.availableFromMonth.value > month) continue;
    if (a.currency !== "VND" || a.valuedOn.status !== "KNOWN" || a.valuedOn.value !== profile.valuationDate) return null;
    if (a.value.status !== "KNOWN" || a.ownershipShare.status !== "KNOWN") return null;
    const generic = MAPPED[a.type], code = generic ? resolve(generic) : null;
    if (!code) return null;
    const amount = new D(a.value.value).mul(a.ownershipShare.value).mul(a.retirementShare.value);
    amounts.set(code, (amounts.get(code) ?? new D(0)).plus(amount));
  }
  if (protectedAmount === null) return null;
  const cash = resolve("CASH");
  if (new D(protectedAmount).gt(0)) {
    const held = cash ? amounts.get(cash) ?? new D(0) : new D(0);
    if (!cash || held.lt(protectedAmount)) return null;
    amounts.set(cash, held.minus(protectedAmount));
  }
  const weights = normalise(amounts);
  return weights ? { source: "PROFILE_ASSETS", weights } : null;
}

/** Half-L1 distance in percentage points between current weights and a month's targets; null when not comparable. */
export function turnoverFromCurrent(current: CurrentWeights | null, targets: Allocation[] | undefined): string | null {
  if (!current || !targets?.length) return null;
  const codes = new Set(targets.map(t => t.assetClass));
  if ([...current.weights.keys()].some(code => !codes.has(code))) return null;
  return targets.reduce((s, t) => s.plus(new D(t.weightPercent).minus(current.weights.get(t.assetClass) ?? 0).abs()), new D(0)).div(2).toFixed();
}
