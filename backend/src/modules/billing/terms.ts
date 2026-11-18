import type { Prisma } from "@prisma/client";
import { profileV2Schema } from "../profiles/schema-v2";
import { profileV2Summary } from "../profiles/summary-v2";
import type { OverrideTerms } from "./fee-math";

type Tx = Prisma.TransactionClient;

/** Schedule in force for a period: the latest published (or since superseded) one whose
 * effectiveFromPeriod is not after the period. Statements pin the id, so history is stable. */
export function scheduleFor(tx: Tx, period: string) {
  return tx.feeSchedule.findFirst({
    where: { status: { in: ["PUBLISHED", "SUPERSEDED"] }, effectiveFromPeriod: { lte: period } },
    orderBy: [{ effectiveFromPeriod: "desc" }, { version: "desc" }],
  });
}

/** Active per-user override covering the period (not revoked, fromPeriod ≤ period ≤ toPeriod). */
export async function overrideFor(tx: Tx, userId: string, period: string) {
  const rows = await tx.userFeeOverride.findMany({
    where: { userId, revokedAt: null, fromPeriod: { lte: period } }, orderBy: { createdAt: "desc" },
  });
  return rows.find(row => row.toPeriod === null || row.toPeriod >= period) ?? null;
}
export const overrideTerms = (row: { kind: string; value: unknown } | null): OverrideTerms =>
  row ? { kind: row.kind as NonNullable<OverrideTerms>["kind"], value: row.value === null || row.value === undefined ? null : String(row.value) } : null;

export type FeeBase = {
  amount: string;
  source: { metric: "retirementLiquidAssets"; profileRevision: number | null; valuationDate: string | null; issues: string[] };
};
/**
 * Fee base = the profile's retirementLiquidAssets (financial assets set aside for retirement,
 * home and real estate excluded — see profiles/summary-v2.ts). Anything unknown counts as 0,
 * so the statement falls to the minimum fee; the reason is kept in `issues`.
 */
export async function feeBase(tx: Tx, userId: string): Promise<FeeBase> {
  const profile = await tx.financialProfile.findUnique({ where: { userId }, select: { profileData: true, schemaVersion: true, revision: true } });
  const source = (issues: string[], extra: Partial<FeeBase["source"]> = {}): FeeBase =>
    ({ amount: "0", source: { metric: "retirementLiquidAssets", profileRevision: profile?.revision ?? null, valuationDate: null, issues, ...extra } });
  if (!profile) return source(["PROFILE_MISSING"]);
  if (profile.schemaVersion !== 2) return source(["LEGACY_PROFILE"]);
  const parsed = profileV2Schema.safeParse(profile.profileData);
  if (!parsed.success) return source(["PROFILE_DATA_REVIEW_REQUIRED"]);
  const summary = profileV2Summary(parsed.data);
  const value = summary.values.retirementLiquidAssets;
  const issues = summary.issues.filter(issue => issue.path.startsWith("assets")).map(issue => `${issue.code}:${issue.path}`);
  if (value === null) return source(issues.length ? issues : ["ASSETS_UNKNOWN"], { valuationDate: summary.valuationDate });
  return { amount: value, source: { metric: "retirementLiquidAssets", profileRevision: profile.revision, valuationDate: summary.valuationDate, issues } };
}
