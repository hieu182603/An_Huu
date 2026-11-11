import { Prisma } from "@prisma/client";
import { z } from "zod";
import { liquidAssets, profileV2Summary } from "./summary-v2";
import type { ProfileV2 } from "./schema-v2";

const D = Prisma.Decimal.clone({ precision: 48 });
const amount = z.string().regex(/^-?(0|[1-9]\d*)(\.\d+)?$/).nullable();
const valuation = { declaredValue: amount, ownedValue: amount, retirementLiquidAssets: amount, emergencyReserve: amount, housingOwnedValue: amount, otherOwnedValue: amount };
export const assetReportSchema = z.object({
  profileRevision: z.number().int().min(1), valuationDate: z.string(), currency: z.literal("VND"),
  assetState: z.enum(["KNOWN", "UNKNOWN", "NOT_APPLICABLE"]), coverageBasis: z.enum(["KNOWN", "UNKNOWN", "NO_EXPENSE"]),
  totals: z.object({ ...valuation, monthlyExpense: amount, totalDebt: amount, netWorth: amount, reserveCoverageMonths: amount, debtToAssetsPercent: amount }).strict(),
  percentages: z.object({ retirementLiquidAssets: amount, emergencyReserve: amount, housingOwnedValue: amount, otherOwnedValue: amount }).strict(),
  entries: z.array(z.object({ id: z.string(), ...valuation }).strict()), issues: z.array(z.object({ path: z.string(), code: z.string() }).strict()),
}).strict();
const text = (value: Prisma.Decimal | null) => value?.toFixed() ?? null;
export function profileAssetSummary(profile: ProfileV2, profileRevision: number) {
  const summary = profileV2Summary(profile), values = summary.values;
  const entries = profile.assets.status === "KNOWN" ? profile.assets.entries.map(asset => {
    const declared = asset.currency === "VND" && asset.valuedOn.status === "KNOWN" && asset.valuedOn.value === profile.valuationDate && asset.value.status === "KNOWN" ? new D(asset.value.value) : null;
    const owned = declared !== null && asset.ownershipShare.status === "KNOWN" ? declared.mul(asset.ownershipShare.value) : null;
    const one = { ...profile, assets: { status: "KNOWN" as const, entries: [asset] } };
    const retirement = liquidAssets(one, "retirementShare").value, reserve = liquidAssets(one, "emergencyShare").value;
    const housing = asset.type === "PRIMARY_HOME" || asset.type === "REAL_ESTATE" ? owned : new D(0);
    const other = owned !== null && retirement !== null && reserve !== null && housing !== null ? owned.minus(retirement).minus(reserve).minus(housing) : null;
    return { id: asset.id, declaredValue: text(declared), ownedValue: text(owned), retirementLiquidAssets: text(retirement), emergencyReserve: text(reserve), housingOwnedValue: text(housing), otherOwnedValue: text(other) };
  }) : [];
  const sum = (key: Exclude<keyof typeof entries[number], "id">): string | null => {
    if (profile.assets.status === "UNKNOWN") return null;
    let result = new D(0);
    for (const row of entries) { if (row[key] === null) return null; result = result.plus(row[key]!); }
    return result.toFixed();
  };
  const coverageBasis = values.monthlyExpense === null || values.emergencyReserve === null ? "UNKNOWN" : new D(values.monthlyExpense).isZero() ? "NO_EXPENSE" : "KNOWN";
  const totals = { declaredValue: sum("declaredValue"), ownedValue: values.totalAssets, retirementLiquidAssets: values.retirementLiquidAssets,
    emergencyReserve: values.emergencyReserve, housingOwnedValue: sum("housingOwnedValue"), otherOwnedValue: sum("otherOwnedValue"),
    monthlyExpense: values.monthlyExpense, totalDebt: values.totalDebt, netWorth: values.netWorth,
    reserveCoverageMonths: coverageBasis === "KNOWN" ? new D(values.emergencyReserve!).div(values.monthlyExpense!).toFixed(1) : null,
    debtToAssetsPercent: values.totalAssets !== null && new D(values.totalAssets).gt(0) && values.totalDebt !== null ? new D(values.totalDebt).div(values.totalAssets).mul(100).toFixed(1) : null };
  const percentages = Object.fromEntries((["retirementLiquidAssets", "emergencyReserve", "housingOwnedValue", "otherOwnedValue"] as const).map(key => [key,
    totals.ownedValue === null || totals[key] === null ? null : new D(totals.ownedValue).isZero() ? "0.0" : new D(totals[key]!).div(totals.ownedValue).mul(100).toFixed(1)]));
  return { profileRevision, valuationDate: profile.valuationDate, currency: profile.currency, assetState: profile.assets.status, coverageBasis, totals, percentages, entries,
    issues: summary.issues.filter(issue => issue.path.startsWith("assets") || issue.path.startsWith("emergencyReserve.")) };
}
