import { Decimal } from "../../utils/decimal";
import { toBaseAmount } from "../../services/billingFormat";

type Known = { status: "KNOWN"; value: string } | { status: "UNKNOWN" };
export type AssetBaseDraft = {
  type: string;
  currency: string;
  value: Known;
  liquidity: { status: "KNOWN"; value: string } | { status: "UNKNOWN" };
  availableFromMonth: Known;
};

/**
 * Fee base (retirement liquid assets) after saving an asset, or null when it cannot be told
 * from the form alone (unknown shares/liquidity, foreign currency, future availability,
 * housing/property, missing current figures). Callers then simply show no fee hint.
 * `currentTotal` is the profile's retirement total, `entryNow` this asset's present share of it.
 */
export function projectedFeeBase(input: {
  currentTotal: string | null | undefined;
  entryNow: string | null | undefined;
  draft: AssetBaseDraft;
  ownershipPercent: string;
  retirementPercent: string;
  currentMonth: string;
}): string | null {
  const { currentTotal, entryNow, draft } = input;
  if (currentTotal == null || entryNow == null) return null;
  const percent = (text: string) => { const raw = text.trim().replace(",", "."); return /^\d+(\.\d+)?$/.test(raw) && Number(raw) <= 100 ? raw : null; };
  const ownership = percent(input.ownershipPercent), retirement = percent(input.retirementPercent);
  let contribution = new Decimal(0);
  if (draft.type === "PRIMARY_HOME" || draft.type === "REAL_ESTATE") contribution = new Decimal(0);
  else if (retirement !== null && Number(retirement) === 0) contribution = new Decimal(0);
  else {
    if (ownership === null || retirement === null) return null;
    if (draft.currency !== "VND" || draft.value.status !== "KNOWN" || !/^\d+(\.\d+)?$/.test(draft.value.value)) return null;
    if (draft.liquidity.status !== "KNOWN") return null;
    if (draft.liquidity.value === "LIQUID") {
      if (draft.availableFromMonth.status !== "KNOWN" || draft.availableFromMonth.value > input.currentMonth) return null;
      contribution = new Decimal(draft.value.value).mul(ownership).mul(retirement).mul("0.0001");
    }
  }
  const next = new Decimal(currentTotal).minus(entryNow).plus(contribution);
  if (next.lt(0)) return null;
  return toBaseAmount(next.toFixed().split(".")[0]);
}
