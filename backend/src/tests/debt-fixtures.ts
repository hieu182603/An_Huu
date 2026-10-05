import { addMonths } from "../common/calendar";
import { debtEntrySchema, type DebtEntry } from "../modules/profiles/schema-v2";
import { loanContractSchema, type LoanContract } from "../modules/debts/schema";
import { known, fixtureProfile, empty } from "./profile-v2-fixtures";

export function loanFixture(overrides: Partial<LoanContract> = {}): LoanContract {
  return loanContractSchema.parse({ contractVersion: 1, source: "Fixture signed contract", confirmedOn: "2026-10-01", balanceAsOf: "2026-10-04",
    interestBasis: "REDUCING_BALANCE", periodConvention: "DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS", maturityDate: "2027-07-28", settleRemainingAtMaturity: true,
    parties: [{ reference: "borrower", role: "BORROWER" }],
    periods: Array.from({ length: 10 }, (_, index) => ({ dueDate: addMonths("2026-10", index) + "-28", rate: { kind: "NOMINAL_ANNUAL_MONTHLY", percent: "12" },
      repayment: { kind: "PRINCIPAL_PLUS_INTEREST", amount: "100" }, minimumPayment: "0", fee: "0",
      prepayment: { status: "ALLOWED", mode: "PARTIAL_OR_FULL", minimumPrincipal: "0", maximumPrincipal: null, fixedFee: "0", feePercent: "0",
        effect: "REDUCE_TERM_KEEP_SCHEDULE", funding: "SOLE_BORROWER", evidence: "Contract clause allowing early repayment" } })), ...overrides });
}
export function debtFixture(changes: Partial<DebtEntry> = {}, contract = loanFixture()): DebtEntry {
  return debtEntrySchema.parse({ id: "loan-a", label: "Vay A", currency: "VND", outstandingBalance: known("1000"), balanceAsOf: known("2026-10-04"),
    payment: known("999"), paymentShare: known("1"), balanceShare: known("1"), responsibility: { status: "KNOWN", scope: "FULL", confirmedDocument: "Fixture liability", limit: known("1000") },
    frequency: "MONTHLY", startMonth: "2026-01", endMonth: contract.maturityDate.slice(0, 7), contract: { status: "KNOWN", value: contract }, ...changes });
}
export function debtProfile(debts: DebtEntry[] = [debtFixture()]) {
  return fixtureProfile({ debts: { status: "KNOWN", entries: debts }, expenses: empty() });
}
export const debtCommand = { expectedProfileRevision: 1, horizonMonths: 12, reserveMonthly: "0", extraMonthlyBudget: "100", stress: [] };
