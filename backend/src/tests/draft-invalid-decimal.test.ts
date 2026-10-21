import { describe, expect, it } from "vitest";
import { partialProfileV2Schema } from "../modules/profiles/schema-v2";

// Refinements still run after a field fails its regex, so comparisons must not throw on that value.
describe("draft validation with malformed amounts", () => {
  it("reports a validation issue instead of throwing for formatted liquidity needs", () => {
    const result = partialProfileV2Schema.safeParse({ schemaVersion: 2,
      liquidityNeeds: { y1: { status: "KNOWN", value: "1.000.000" }, y3: { status: "KNOWN", value: "2000000" } } });
    expect(result.success).toBe(false);
  });
  it("reports a validation issue for a malformed linked loan share", () => {
    const result = partialProfileV2Schema.safeParse({ schemaVersion: 2,
      debts: { status: "KNOWN", entries: [{ id: "loan", payment: { status: "KNOWN", value: "5000000" }, paymentShare: { status: "KNOWN", value: "50%" } }] },
      expenses: { status: "KNOWN", entries: [{ id: "pay", category: "DEBT_PAYMENT", loanId: "loan", amount: { status: "KNOWN", value: "2500000" } }] } });
    expect(result.success).toBe(false);
  });
});
