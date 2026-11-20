import { Prisma } from "@prisma/client";
import type { MonthlyInput } from "./engine";
const D = Prisma.Decimal.clone({ precision: 48 });
export type Protection = {
  model: "protected-capital-v1";
  emergencyReserve: string;
  goals: Array<{ id: string; month: string; amount: string; openingReserve: string; essential: boolean; depositAssetClass?:string; depositFactors?:string[] }>;
  depositFactors: string[];
  depositAssetClass: string;
  rawRows: MonthlyInput[];
};
/** Reserved goals pay only their own obligations. Emergency funds cover household
 * deficits before the long-term fund. Each protected unit can be used once. */
export function protectCashflows(rows: MonthlyInput[], protection: Protection) {
  let emergency = new D(protection.emergencyReserve), released = new D(0);
  const goals = protection.goals.map(g => ({ ...g, balance: new D(g.openingReserve) }));
  return rows.map((original, i) => {
    const factor = new D(protection.depositFactors[i]);
    if (!factor.isFinite() || factor.lte(0)) throw new RangeError("Protected capital deposit coverage required");
    // Capital separation discounts the goal at valuation to its due month.
    // The valuation month's payment occurs before that month's reserve accrual.
    const due = goals.filter(g => g.month === original.month);
    const goalAmount = due.reduce((s,g)=>s.plus(g.amount),new D(0));
    const goalPaid = due.reduce((s,g)=>s.plus(D.min(g.balance,g.amount)),new D(0));
    const goalExcess = due.reduce((s,g)=>s.plus(D.max(0,g.balance.minus(g.amount))),new D(0));
    const essentialPaid = due.filter(g=>g.essential).reduce((s,g)=>s.plus(D.min(g.balance,g.amount)),new D(0));
    due.forEach(g=>{g.balance=new D(0);});
    const household = new D(original.withdrawal), reservePaid = D.min(emergency,household);
    emergency = emergency.minus(reservePaid);
    released = released.plus(goalExcess);
    const freePaid = D.min(released,household.minus(reservePaid));
    released = released.minus(freePaid);
    const withdrawal = household.minus(reservePaid).minus(freePaid).plus(goalAmount).minus(goalPaid);
    emergency=emergency.mul(factor); released=released.mul(factor);
    goals.filter(g=>g.month>original.month).forEach(g=>{g.balance=g.balance.mul(g.depositFactors?.[i]??factor);});
    return { ...original, withdrawal:withdrawal.toFixed(), additionalExpense:new D(original.additionalExpense).plus(goalAmount).toFixed(),
      protectedHouseholdPaid:reservePaid.plus(freePaid).toFixed(),goalExpense:goalAmount.toFixed(),protectedGoalPaid:goalPaid.toFixed(),
      essentialGoalExpense:due.filter(g=>g.essential).reduce((s,g)=>s.plus(g.amount),new D(0)).toFixed(),
      protectedEssentialGoalPaid:essentialPaid.toFixed(),
      protectedClosingBalance:emergency.plus(released).plus(goals.reduce((s,g)=>s.plus(g.balance),new D(0))).toFixed() };
  });
}

/** Decimal-in / Decimal-out variant of protectCashflows for the Monte Carlo hot path: same arithmetic in the same order
 * (so the values are bit-identical to protectCashflows), without the string round trips and without the fields the
 * simulation never reads (goalExpense, protectedGoalPaid, additionalExpense, protectedClosingBalance).
 * `goals[].factors` replaces goal.depositFactors (per-month factors of that goal; undefined = use the shared deposit factor). */
export type FastProtectionGoal = { month: string; amount: Prisma.Decimal; openingReserve: Prisma.Decimal; essential: boolean; factors?: Prisma.Decimal[] };
export type FastProtectedRow = { withdrawal: Prisma.Decimal; protectedHouseholdPaid: Prisma.Decimal; protectedEssentialGoalPaid: Prisma.Decimal; essentialGoalExpense: Prisma.Decimal };
export function protectCashflowsFast(months: string[], withdrawals: Prisma.Decimal[], emergencyReserve: Prisma.Decimal, goalDefs: FastProtectionGoal[], depositFactors: Prisma.Decimal[]): FastProtectedRow[] {
  const zero = new D(0);
  let emergency = emergencyReserve, released = zero;
  const goals = goalDefs.map(g => ({ ...g, balance: g.openingReserve }));
  return months.map((month, i) => {
    const factor = depositFactors[i];
    if (!factor.isFinite() || factor.lte(0)) throw new RangeError("Protected capital deposit coverage required");
    const due = goals.filter(g => g.month === month);
    const goalAmount = due.reduce((s, g) => s.plus(g.amount), zero);
    const goalPaid = due.reduce((s, g) => s.plus(D.min(g.balance, g.amount)), zero);
    const goalExcess = due.reduce((s, g) => s.plus(D.max(0, g.balance.minus(g.amount))), zero);
    const essentialDue = due.filter(g => g.essential);
    const essentialPaid = essentialDue.reduce((s, g) => s.plus(D.min(g.balance, g.amount)), zero);
    due.forEach(g => { g.balance = zero; });
    const household = withdrawals[i], reservePaid = D.min(emergency, household);
    emergency = emergency.minus(reservePaid);
    released = released.plus(goalExcess);
    const freePaid = D.min(released, household.minus(reservePaid));
    released = released.minus(freePaid);
    const withdrawal = household.minus(reservePaid).minus(freePaid).plus(goalAmount).minus(goalPaid);
    emergency = emergency.mul(factor); released = released.mul(factor);
    goals.forEach(g => { if (g.month > month) g.balance = g.balance.mul(g.factors?.[i] ?? factor); });
    return { withdrawal, protectedHouseholdPaid: reservePaid.plus(freePaid), protectedEssentialGoalPaid: essentialPaid,
      essentialGoalExpense: essentialDue.reduce((s, g) => s.plus(g.amount), zero) };
  });
}
