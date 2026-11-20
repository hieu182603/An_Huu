import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { customFixture } from "./allocation-custom-fixtures";
import { retirementCommand } from "./retirement-fixtures";
import { marketFixture } from "./allocation-risk-fixtures";
import { known } from "./profile-v2-fixtures";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { continuousCandidate } from "../modules/allocation-risk/optimizer-candidate";
import { applySpendingFloorTargets, previewPortfolio } from "../modules/portfolios/engine";
import { portfolioDocumentV2Schema } from "../modules/portfolios/schema";
import { AssumptionDecimal as D } from "../modules/assumptions/series";

describe("B5-1 liquidity constraint, B2-4 occupational risk filter, B7-6 spending floor, B2-2 draft", () => {
  it("B5-1 (grid): rejects candidates whose month-0 deposit weight is below uncovered12 / growthCapital", async () => {
    const f = await customFixture();
    // customFixture CAUTIOUS at years=0: BASE = 100% BOND / 0% STOCK, HIGHER_EQUITY = 90% BOND / 10% STOCK.
    // With allocationCapital TOTAL = 1,000M (reserve = 120M -> growth = 880M) and uncovered y1 = 836M -> 95% BOND floor:
    // HIGHER_EQUITY (90% BOND) is rejected with LIQUIDITY_CONSTRAINT while BASE (100% BOND) passes.
    await f.profiles.patchProfile("test-user", f.command.expectedProfileRevision, {
      schemaVersion: 2,
      allocationCapital: { basis: "TOTAL", totalAmount: "1000000000" },
      liquidityNeeds: { y1: known("836000000") },
    });
    const preview = { ...retirementCommand(f.policy.id), ...f.command, expectedProfileRevision: f.command.expectedProfileRevision + 1, allocationFunding: undefined };
    const res: any = await new AllocationRiskService(f.db).run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20 } as never, "selection");
    expect(res.rejected).toContainEqual({ id: "HIGHER_EQUITY", issues: ["LIQUIDITY_CONSTRAINT"] });
    expect(res.candidates.map((c: any) => c.id)).toContain("BASE");
  });

  it("B5-1 (optimizer): passes liquidity floor into hardLimits and enforces CASH >= minWeight", () => {
    const base = [[{ assetClass: "CASH", weightPercent: "10" }, { assetClass: "EQUITY", weightPercent: "90" }]];
    const policy = {
      riskAversionGamma: 1, uncertaintyKappa: 0, turnoverPenaltyEta: 0,
      bounds: [{ assetClass: "CASH", min: 0.05, max: 0.7 }, { assetClass: "EQUITY", min: 0, max: 0.95 }],
      estimation: { evidence: "B5-1 test", historicalWeight: 0, monthlyBaselines: [{ assetClass: "CASH", returnRate: 0.002 }, { assetClass: "EQUITY", returnRate: 0.01 }] },
    };
    const withoutLimit = continuousCandidate(base, marketFixture(), policy);
    expect(Number(withoutLimit.candidate!.targets[0][0].weightPercent)).toBeLessThan(35);

    const withLimit = continuousCandidate(base, marketFixture(), policy, undefined, [{ id: "LIQUIDITY_12M", assetClass: "CASH", min: 0.4 }]);
    expect(withLimit.input?.constraints?.hardLimits).toEqual([{ id: "LIQUIDITY_12M", coefficients: [1, 0], min: 0.4 }]);
    expect(withLimit.candidate?.valid).toBe(true);
    expect(Number(withLimit.candidate!.targets[0][0].weightPercent)).toBeGreaterThanOrEqual(39.999);
  });

  it("B2-4: rejects candidates exceeding occupationalRisk equity cap (UNCERTAIN income / HIGH employerConcentration), no-op when absent", async () => {
    const f = await customFixture();
    if (f.policy.data.schemaVersion !== 2) throw new Error("Expected v2");
    await f.profiles.patchProfile("test-user", f.command.expectedProfileRevision, {
      schemaVersion: 2,
      incomeStability: known("UNCERTAIN"),
      employerConcentration: known("HIGH"),
    });
    const rev = f.command.expectedProfileRevision + 1;
    // Policy without occupationalRisk: HIGHER_EQUITY (10% STOCK) is simulated alongside BASE (0% STOCK).
    const previewOff = { ...retirementCommand(f.policy.id), ...f.command, expectedProfileRevision: rev, allocationFunding: "PROTECTED_CAPITAL_V1" };
    const offRes: any = await new AllocationRiskService(f.db).run("test-user", { plan: { kind: "PREVIEW", preview: previewOff }, paths: 20 } as never, "selection");
    expect(offRes.candidates.map((c: any) => c.id)).toContain("HIGHER_EQUITY");

    // Policy with occupationalRisk capping UNCERTAIN income equity at 5%: HIGHER_EQUITY (10% STOCK) rejected, BASE (0% STOCK) passes.
    const occPolicy = await f.portfolios.create("test-admin", {
      ...f.policy.data,
      occupationalRisk: {
        evidence: "B2-4 test cap",
        incomeStability: { UNCERTAIN: { maxEquityPercent: "5" } },
        employerConcentration: { maxEquityPercentReduction: "70" },
      },
    });
    await f.portfolios.approve("test-admin", occPolicy.id, { expectedRevision: 1, confirm: true, reviewNote: "B2-4 test" });
    await f.portfolios.publish("test-admin", occPolicy.id, { expectedRevision: 2, confirm: true });

    const previewOn = { ...retirementCommand(occPolicy.id), ...f.command, expectedProfileRevision: rev, policyVersionId: occPolicy.id, allocationFunding: "PROTECTED_CAPITAL_V1" };
    const onRes: any = await new AllocationRiskService(f.db).run("test-user", { plan: { kind: "PREVIEW", preview: previewOn }, paths: 20 } as never, "selection");
    expect(onRes.rejected).toContainEqual({ id: "HIGHER_EQUITY", issues: ["OCCUPATIONAL_RISK_LIMIT"] });
    expect(onRes.candidates.map((c: any) => c.id)).toContain("BASE");
  });

  it("B7-6: applies spendingFloorYears from retirement onward (clamped to bounds), complete no-op when absent", async () => {
    const base = new Map([["CASH", new D("0.25")], ["GOV_BOND", new D("0.40")], ["EQUITY", new D("0.25")], ["GOLD", new D("0.10")]]);
    const bounds = [
      { assetClass: "CASH", minPercent: "5", maxPercent: "70" },
      { assetClass: "GOV_BOND", minPercent: "0", maxPercent: "60" },
      { assetClass: "EQUITY", minPercent: "0", maxPercent: "60" },
      { assetClass: "GOLD", minPercent: "0", maxPercent: "15" },
    ];
    // Already satisfied (0.50 <= 0.65) -> unchanged.
    expect(applySpendingFloorTargets(base, { essentialSpendingPV: "500", growthCapital: "1000", bounds })).toBe(base);

    // Requires 80% safe (PV=800 / growth=1000) -> raises CASH+GOV_BOND from 65% to 80%, proportionally lowers EQUITY & GOLD.
    const lifted = applySpendingFloorTargets(base, { essentialSpendingPV: "800", growthCapital: "1000", bounds });
    const safeSum = lifted.get("CASH")!.plus(lifted.get("GOV_BOND")!);
    const totalSum = [...lifted.values()].reduce((s, v) => s.plus(v), new D(0));
    expect(safeSum.toNumber()).toBeCloseTo(0.8, 10);
    expect(totalSum.toNumber()).toBeCloseTo(1, 12);
    expect(lifted.get("EQUITY")!.toNumber()).toBeLessThan(0.25);
    expect(lifted.get("GOLD")!.toNumber()).toBeLessThan(0.10);

    // Schema + previewPortfolio integration: off (spendingFloorYears absent) is identical whether spendingFloor arg is passed or omitted.
    const f = await customFixture();
    if (f.policy.data.schemaVersion !== 2) throw new Error("Expected v2");
    const assumptions = await f.assumptions.get(f.policy.data.assumptionVersionId, true);
    const cmd = { policyVersionId: f.policy.id, startMonth: "2026-10", horizonMonths: 15, liquidityNeedMonths: 12, answers: f.command.answers, templateId: f.command.templateId, retirementMonth: "2027-01" };
    const offPreview = previewPortfolio(f.policy.data, assumptions.data, cmd, "BASE", undefined, undefined, false, { essentialSpendingPV: "900", growthCapital: "1000" });
    const offNoArg = previewPortfolio(f.policy.data, assumptions.data, cmd, "BASE");
    expect(offPreview.status).toBe("READY");
    expect(offPreview.scenarios[0].rows).toEqual(offNoArg.scenarios[0].rows);

    const floorPolicy = portfolioDocumentV2Schema.parse({
      ...f.policy.data,
      templates: f.policy.data.templates.map(t => ({ ...t, glidePath: { ...t.glidePath, spendingFloorYears: 3 } })),
    });
    expect(floorPolicy.templates[0].glidePath.spendingFloorYears).toBe(3);
  });

  it("B2-2 draft: policy-params-draft.json includes valid lossReaction block", () => {
    const draft = JSON.parse(readFileSync(join(__dirname, "..", "..", "data/drafts/policy-params-draft.json"), "utf8"));
    const parsed = portfolioDocumentV2Schema.shape.lossReaction.parse(draft.lossReaction);
    expect(parsed?.SELL.allowedLossFactor).toBe("0.5");
    expect(parsed?.evidence).toContain("CHỜ DUYỆT");
  });
});
