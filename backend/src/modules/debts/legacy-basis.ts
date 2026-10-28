import { z } from "zod";
import { AppError } from "../../common/errors";
import { dateSchema } from "../../common/calendar";
import { digest } from "../../common/digest";
import { moneySchema } from "../../common/http";
import { debtEntrySchema } from "../profiles/schema-v2";
import { buildContractSchedule, DebtDecimal as D } from "./loan";
import { debtPreviewSchema } from "./schema";
import { loanBalanceBasisSchema, loanEvidenceSchema } from "./revision-schema";
import type { SourceCell, SourceRevision } from "../retirement/sources";

export const loanLegacyOpeningSchema = z.object({ signedOn: dateSchema, amendedOn: dateSchema.nullable(), effectiveOn: dateSchema,
  knownOn: dateSchema, previouslyPaid: moneySchema, capBasis: z.literal("TOTAL_USER_PAYMENTS").optional(), evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict();
export const loanLegacyBasisSchema = z.object({ debt: debtEntrySchema, opening: loanLegacyOpeningSchema,
  stress: debtPreviewSchema.shape.stress }).strict();
export type LoanLegacyBasis = z.infer<typeof loanLegacyBasisSchema>;
const fail = (): never => { throw new AppError(409, "LOAN_LEGACY_BASIS_MISMATCH", "Số dư/hợp đồng gốc hoặc chứng từ chuyển đổi không khớp."); };

export function readLegacyLoanBasis(value: LoanLegacyBasis, source: SourceRevision, knownOn: string, originHash: string) {
  const { debt, opening, stress } = loanLegacyBasisSchema.parse(value);
  const originalEvidenceHash = digest({ debt, stress });
  const legacyEvidenceHash = digest({ originalEvidenceHash, legacyChanges: [], originHash });
  if (source.sourceId !== `profile:debt:${debt.id}` || source.origin !== "PINNED_PROFILE" || source.kind !== "DEBT" ||
    source.revision !== 1 || source.operation !== "CREATE" || ![originalEvidenceHash, legacyEvidenceHash].includes(source.evidenceHash) ||
    debt.currency !== "VND" || debt.outstandingBalance.status !== "KNOWN" || debt.balanceAsOf.status !== "KNOWN" ||
    debt.paymentShare.status !== "KNOWN" || debt.responsibility.status !== "KNOWN" || debt.contract?.status !== "KNOWN") fail();
  // Narrow again explicitly so no unknown values can become zero defaults.
  if (debt.outstandingBalance.status !== "KNOWN" || debt.balanceAsOf.status !== "KNOWN" || debt.paymentShare.status !== "KNOWN" || debt.responsibility.status !== "KNOWN") return fail();
  const basisDate = debt.balanceAsOf.value;
  if (opening.signedOn > opening.effectiveOn || opening.effectiveOn > basisDate || basisDate > opening.knownOn || opening.knownOn > knownOn ||
    (opening.amendedOn && (opening.amendedOn < opening.signedOn || opening.amendedOn > opening.effectiveOn)) ||
    opening.evidence.some(e => e.confirmedOn > opening.knownOn)) fail();
  const cap = debt.responsibility.scope === "CAPPED";
  if (cap && (debt.responsibility.limit.status !== "KNOWN" || opening.capBasis !== "TOTAL_USER_PAYMENTS") ||
    !cap && (new D(opening.previouslyPaid).gt(0) || opening.capBasis !== undefined)) fail();
  const responsibility = cap && debt.responsibility.limit.status === "KNOWN"
    ? { kind: "CAPPED" as const, capBasis: "TOTAL_USER_PAYMENTS" as const, limit: debt.responsibility.limit.value,
      previouslyPaid: opening.previouslyPaid, evidence: opening.evidence }
    : { kind: "ALLOCATED_SHARE" as const };
  if (responsibility.kind === "CAPPED" && new D(responsibility.previouslyPaid).gt(responsibility.limit)) fail();
  const original = buildContractSchedule(debt, basisDate);
  if (original.status !== "READY") fail();
  const amounts = new Map<string, InstanceType<typeof D>>();
  for (const row of original.rows) {
    const month = row.dueDate.slice(0, 7);
    if (month < source.effectiveFromMonth || month > source.effectiveToMonth) continue;
    const override = stress.find(s => s.loanId === debt.id && s.startMonth <= month && month <= s.endMonth);
    const payment = override ? new D(row.principal).plus(row.interest).plus(row.fee).mul(override.totalPaymentShare) : new D(row.userPayment);
    amounts.set(month, (amounts.get(month) ?? new D(0)).plus(payment));
  }
  const schedule: SourceCell[] = [...amounts].map(([month, amount]) => ({ month, metric: "debtPayment", amount: amount.toFixed() }));
  if (digest(schedule) !== digest(source.schedule)) fail();
  const { previouslyPaid: _, capBasis: _capBasis, ...datesAndEvidence } = opening;
  return loanBalanceBasisSchema.parse({ basisVersion: 1, currency: "VND", ...datesAndEvidence, principalBalance: debt.outstandingBalance.value,
    balanceAsOf: basisDate, balanceScope: "FULL_CONTRACT", paymentShare: debt.paymentShare.value, responsibility });
}
