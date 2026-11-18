import { describe, expect, it } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import type { LossConstraint } from "../modules/capital/loss-constraint";
import { leastLossCandidate, lossFeasibility, lossReducedCandidate, shiftEquityToDeposit } from "../modules/allocation-risk/loss-candidates";

// Same structure as assessLossConstraint: stock shock -35%, deposit 0%, gold -10%; limit on 666M long-term capital.
const growth = new D("666000000"), shocks: Record<string, string> = { STOCK: "-35", DEPOSIT: "0", BOND: "-5", GOLD: "-10" };
function check(allowed: string) {
  return (rows: Array<{ assetClass: string; weightPercent: string }>): LossConstraint => {
    const pct = rows.reduce((s, r) => s.plus(new D(r.weightPercent).mul(new D(shocks[r.assetClass]).neg()).div(100)), new D(0));
    const loss = growth.mul(pct).div(100), limit = new D(allowed), over = loss.gt(limit);
    const perPoint = growth.mul("0.35").div(100), equity = new D(rows.find(r => r.assetClass === "STOCK")?.weightPercent ?? 0);
    const reduce = over ? D.min(equity, loss.minus(limit).div(perPoint)) : new D(0), proposed = loss.minus(reduce.mul(perPoint));
    const possible = proposed.lte(limit);
    return { informationalOnly: true, status: !over ? "WITHIN_LIMIT" : possible ? "REDUCE_RISK" : "NOT_FEASIBLE", message: "", issues: [],
      growthCapital: growth.toFixed(), lossAmount: loss.toFixed(), lossPercentOfGrowth: pct.toFixed(), lossPercentOfInvestableAssets: null,
      allowedLossAmount: limit.toFixed(), exceedsTolerance: over, maxEquityWeightPercent: possible ? equity.minus(reduce).toFixed() : null,
      proposedLossAmount: proposed.toFixed(), proposedAllocations: [] };
  };
}
const cautious = [[{ assetClass: "DEPOSIT", weightPercent: "15" }, { assetClass: "BOND", weightPercent: "30" }, { assetClass: "STOCK", weightPercent: "45" }, { assetClass: "GOLD", weightPercent: "10" }],
  [{ assetClass: "DEPOSIT", weightPercent: "25" }, { assetClass: "BOND", weightPercent: "40" }, { assetClass: "STOCK", weightPercent: "25" }, { assetClass: "GOLD", weightPercent: "10" }]];

describe("loss-limit candidates (algorithm §10.4)", () => {
  it("customer case: 15% limit (99.9M) vs cautious template moves just enough stock to deposits and fits every month", () => {
    const limit = check("99900000");
    expect(limit(cautious[0]).status).toBe("REDUCE_RISK");
    const c = lossReducedCandidate(cautious, "STOCK", "DEPOSIT", limit)!;
    expect(c).not.toBeNull(); expect(c.valid).toBe(true); expect(c.id).toBe("LOSS_REDUCED");
    for (const month of c.targets) {
      expect(limit(month).status).toBe("WITHIN_LIMIT");
      expect(month.reduce((s, r) => s.plus(r.weightPercent), new D(0)).eq(100)).toBe(true);
    }
    // Only stock -> deposit changes; bond and gold keep the template weights.
    expect(c.targets[0].find(r => r.assetClass === "BOND")!.weightPercent).toBe("30");
    expect(new D(c.changePoints).gt(0)).toBe(true);
  });
  it("returns no reduced candidate when the template already fits or when even zero stock cannot fit", () => {
    expect(lossReducedCandidate(cautious, "STOCK", "DEPOSIT", check("1000000000"))).toBeNull();
    expect(lossReducedCandidate(cautious, "STOCK", "DEPOSIT", check("1000000"))).toBeNull();
  });
  it("least-loss moves all stock to deposits and reports the limit the customer would need, rounded up", () => {
    const c = leastLossCandidate(cautious, "STOCK", "DEPOSIT");
    expect(c.targets[0].find(r => r.assetClass === "STOCK")!.weightPercent).toBe("0");
    expect(c.targets[0].find(r => r.assetClass === "DEPOSIT")!.weightPercent).toBe("60");
    const f = lossFeasibility(check("1000000")(c.targets[0]))!;
    // 30% bond x 5% + 10% gold x 10% = 2.5% of 666M = 16.65M.
    expect(f).toEqual({ minimumLossAmount: "16650000", allowedLossAmount: "1000000", requiredToleranceAmountVnd: "16650000", requiredTolerancePercentOfGrowth: "2.5" });
  });
  it("adds a deposit row when the template has none and never makes stock negative", () => {
    const t = shiftEquityToDeposit([[{ assetClass: "STOCK", weightPercent: "5" }, { assetClass: "BOND", weightPercent: "95" }]], "STOCK", "DEPOSIT", new D("10"));
    expect(t[0]).toEqual([{ assetClass: "STOCK", weightPercent: "0" }, { assetClass: "BOND", weightPercent: "95" }, { assetClass: "DEPOSIT", weightPercent: "5" }]);
  });
});
