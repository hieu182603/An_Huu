import { z } from "zod";
import { profileMonthlyCashflow } from "./cashflow";
import type { ProfileV2 } from "./schema-v2";
const marital = z.enum(["SINGLE", "MARRIED", "DIVORCED", "OTHER"]).nullable();
const dependents = z.union([z.object({ status: z.literal("KNOWN"), value: z.number().int().min(0).max(30) }).strict(), z.object({ status: z.literal("UNKNOWN") }).strict()]);
export const familyPatchSchema = z.object({ expectedRevision: z.number().int().min(1), maritalStatus: marital, dependents }).strict();
export function familyChanges(profile: ProfileV2, input: z.infer<typeof familyPatchSchema>) {
  // Null explicitly clears an optional marital declaration through profile merge.
  // Family counts never synthesize income, expenses, goals or entitlement.
  return { personal: { ...profile.personal, maritalStatus: input.maritalStatus, dependents: input.dependents } };
}
export function profileFamilyReport(profile: ProfileV2, profileRevision: number) {
  const month = profile.valuationDate.slice(0, 7), expenses = profile.expenses;
  const entries = expenses.status === "KNOWN" ? expenses.entries.filter(row => row.category === "DEPENDENT") : [];
  const support = profileMonthlyCashflow({ income: { status: "KNOWN", entries: [] }, expenses: expenses.status === "KNOWN" ? { ...expenses, entries } : expenses }, month);
  return { profileRevision, valuationDate: profile.valuationDate, maritalStatus: profile.personal.maritalStatus ?? null, dependents: profile.personal.dependents ?? { status: "UNKNOWN" as const }, currency: "VND" as const,
    monthlySupport: support.expenses?.toFixed() ?? null, supportState: expenses.status,
    supportEntries: entries.map(row => ({ id: row.id, label: row.label, amount: row.amount, currency: row.currency, startMonth: row.startMonth, endMonth: row.endMonth, frequency: row.frequency,
      active: row.startMonth <= month && (row.endMonth === null || row.endMonth >= month) })), issues: support.issues };
}
const amount = z.union([z.object({ status: z.literal("KNOWN"), value: z.string() }).strict(), z.object({ status: z.literal("UNKNOWN") }).strict()]);
export const familyReportSchema = z.object({ profileRevision: z.number().int(), valuationDate: z.string(), maritalStatus: marital, dependents, currency: z.literal("VND"), monthlySupport: z.string().nullable(), supportState: z.enum(["KNOWN", "UNKNOWN", "NOT_APPLICABLE"]), supportEntries: z.array(z.object({ id: z.string(), label: z.string(), amount, currency: z.string(), startMonth: z.string(), endMonth: z.string().nullable(), frequency: z.enum(["MONTHLY", "ONCE"]), active: z.boolean() }).strict()), issues: z.array(z.object({ path: z.string(), code: z.string() }).strict()) }).strict();
