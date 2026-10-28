import { describe, it, expect } from "vitest";
import { profileV2Schema, partialProfileV2Schema } from "../modules/profiles/schema-v2";
import { prepareRetirement } from "../modules/retirement/prepare";
import { retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { known, unknown } from "./profile-v2-fixtures";

// The smallest profile the 3-screen onboarding sends (docs/ONBOARDING_GIAM_NHAP_LIEU_2026-10-22.md,
// section 4): birth/retirement month, one income, one expense, one asset declared as retirement
// money, and debts either declined or as a balance plus monthly payment. Everything else stays UNKNOWN.
type QuickStart = { capital?: string; debt?: { balance: string; payment: string }; retirementShare?: "1" | "UNKNOWN" };
const quickStartProfile = ({ capital = "1000", debt, retirementShare = "1" }: QuickStart = {}) => ({
  schemaVersion: 2, valuationDate: "2026-10-01", currency: "VND", periodUnit: "MONTH",
  personal: { birthMonth: known("1976-05"), desiredRetirementMonth: known("2027-01"), pensionStartMonth: unknown },
  income: { status: "KNOWN", entries: [{ id: "inc_quick", label: "Thu nhập hằng tháng", kind: "FIXED", basis: "DISPOSABLE", source: "EMPLOYMENT",
    amount: known("300"), currency: "VND", startMonth: "2026-10", endMonth: "2026-12", frequency: "MONTHLY" }] },
  expenses: { status: "KNOWN", entries: [{ id: "exp_quick", label: "Chi tiêu hằng tháng", category: "ESSENTIAL",
    amount: known("100"), currency: "VND", startMonth: "2026-10", endMonth: null, frequency: "MONTHLY" }] },
  assets: { status: "KNOWN", entries: [{ id: "ast_quick", label: "Tiền dành cho hưu trí", type: "DEPOSIT", value: known(capital), currency: "VND",
    valuedOn: known("2026-10-01"), ownershipShare: known("1"),
    ...(retirementShare === "1"
      ? { retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") }
      : { retirementShare: unknown, emergencyShare: unknown, otherGoalsShare: unknown }),
    liquidity: known("LIQUID"), availableFromMonth: known("2026-10") }] },
  debts: debt
    ? { status: "KNOWN", entries: [{ id: "dbt_quick", label: "Khoản nợ", outstandingBalance: known(debt.balance), balanceAsOf: known("2026-10-01"),
      currency: "VND", payment: known(debt.payment), paymentShare: known("1"), balanceShare: known("1"), contract: unknown, responsibility: unknown,
      startMonth: "2026-10", endMonth: null, frequency: "MONTHLY" }] }
    : { status: "NOT_APPLICABLE", reason: "Người dùng xác nhận không có nợ" },
  pension: unknown,
});
const preview = (quick: QuickStart = {}) => {
  const cfg = retirementConfiguration();
  return prepareRetirement(profileV2Schema.parse(quickStartProfile(quick)), { ...retirementCommand(), monthlyContribution: "0" }, cfg.policy, cfg.assumptions);
};
const codes = (r: ReturnType<typeof preview>) => r.warnings.map(w => w.code);

describe("quick-start onboarding profile", () => {
  it("is accepted as an onboarding draft and as a completed profile", () => {
    expect(partialProfileV2Schema.safeParse(quickStartProfile()).success).toBe(true);
    expect(profileV2Schema.safeParse(quickStartProfile({ debt: { balance: "200", payment: "50" } })).success).toBe(true);
  });

  it("previews READY without debts, flagging only the omitted pension", () => {
    const r = preview();
    expect(r.status).toBe("READY");
    expect(r.issues).toEqual([]);
    expect(codes(r)).toEqual(["PENSION_NOT_INCLUDED"]);
  });

  it("previews READY with a debt known only by balance and payment, and says the loan is estimated", () => {
    const r = preview({ debt: { balance: "200", payment: "50" } });
    expect(r.status).toBe("READY");
    expect(r.issues).toEqual([]);
    expect(codes(r)).toEqual(expect.arrayContaining(["LOAN_CONTRACT_ESTIMATED", "LIABILITY_SCOPE_UNCONFIRMED", "PENSION_NOT_INCLUDED"]));
  });

  it("reports the required monthly contribution when nothing has been saved yet", () => {
    const r = preview({ capital: "0" });
    expect(r.status).toBe("READY");
    expect(r.calculation!.summary.requiredConstantMonthlyContribution).toBe("100");
  });

  it("stays INCOMPLETE when the saved money is not declared as retirement money", () => {
    const r = preview({ retirementShare: "UNKNOWN" });
    expect(r.status).toBe("INCOMPLETE");
    expect(r.issues).toContainEqual({ path: "assets", code: "RETIREMENT_CAPITAL_INCOMPLETE" });
  });
});
