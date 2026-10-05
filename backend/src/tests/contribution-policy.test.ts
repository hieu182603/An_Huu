import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { retirementPreviewSchema } from "../modules/retirement/schema";
import { prepareRetirement } from "../modules/retirement/prepare";
import { projectRetirement, RetirementDecimal as D, type ProjectionInput } from "../modules/retirement/engine";
import { projectRetirement as legacyProject } from "../modules/retirement/engine-v2";
import { plansFixture } from "./plans-fixtures";
import { known } from "./profile-v2-fixtures";

const funding = { confirmed: true as const, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START" as const, monthlyAvailable: "100", schedule: [] };
const prepare = (patch: object = {}, date = "2026-10-01") => {
  const p = retirementProfile(); p.valuationDate = date;
  const cfg = retirementConfiguration();
  return prepareRetirement(p, retirementPreviewSchema.parse({ ...retirementCommand(), ...patch }), cfg.policy, cfg.assumptions);
};
describe("P13/P15 production conventions", () => {
  it("normalizes omitted timing and policy and rejects unsupported policies", () => {
    const c = retirementCommand();
    expect(c.contributionTiming).toBe("END_OF_MONTH"); expect(c.surplusPolicy).toBe("EXPLICIT_DEPOSITS_ONLY");
    expect(retirementPreviewSchema.safeParse({ ...c, surplusPolicy: "AUTO_INVEST" }).success).toBe(false);
    expect(retirementPreviewSchema.safeParse({ ...c, contributionTiming: "START_OF_MONTH_RESEARCH" }).success).toBe(false);
    expect(prepare().calculation!.conventions.surplusPolicy).toBe("EXPLICIT_DEPOSITS_ONLY");
  });
  it("requires explicit start funding and does not treat zero availability as unknown", () => {
    expect(prepare({ contributionTiming: "START_OF_MONTH" }).issues).toContainEqual({ path: "startOfMonthFunding", code: "START_OF_MONTH_FUNDING_CONFIRMATION_REQUIRED" });
    const r = prepare({ contributionTiming: "START_OF_MONTH", startOfMonthFunding: { ...funding, monthlyAvailable: "0" } });
    expect(r.status).toBe("READY"); expect(r.calculation!.rows[0]).toMatchObject({ contribution: "0", uninvestedSurplus: "100", budgetShortfall: "100" });
  });
  it("caps start deposits by both start availability and disposable monthly surplus", () => {
    const r = prepare({ contributionTiming: "START_OF_MONTH", startOfMonthFunding: { ...funding, monthlyAvailable: "40" }, monthlyContribution: "200" });
    expect(r.calculation!.rows[0]).toMatchObject({ contribution: "40", contributionCapacity: "40", uninvestedSurplus: "60", budgetShortfall: "160" });
    expect(prepare({ contributionTiming: "START_OF_MONTH", startOfMonthFunding: { ...funding, monthlyAvailable: "500" }, monthlyContribution: "200" }).calculation!.rows[0].contribution).toBe("100");
  });
  it("starts on the next full month, does not invent an earlier deposit, and avoids a zero solver denominator", () => {
    const r = prepare({ contributionTiming: "START_OF_MONTH", startOfMonthFunding: funding }, "2026-10-05");
    expect(r.replayInput!.contributionStartMonth).toBe("2026-11");
    expect(r.calculation!.rows.slice(0, 2).map(x => x.contribution)).toEqual(["0", "100"]);
    expect(r.calculation!.summary.requiredConstantMonthlyContribution).toBe("150");
    const p = retirementProfile(); p.valuationDate = "2026-10-05"; p.personal.desiredRetirementMonth = known("2026-11");
    const cfg = retirementConfiguration();
    const one = prepareRetirement(p, { ...retirementCommand(), contributionTiming: "START_OF_MONTH", startOfMonthFunding: funding }, cfg.policy, cfg.assumptions);
    expect(one.calculation!.summary.requiredConstantMonthlyContribution).toBeNull();
    expect(one.calculation!.summary.savingsStatus).toBe("NO_ELIGIBLE_CONTRIBUTION_PERIOD");
  });
  it.each(["0.01", "0", "-0.01"])("matches independently summed FV for rate %s and never adds a period to initial capital", rate => {
    const row = prepare().replayInput!.rows[0];
    const rows = Array.from({ length: 13 }, (_, i) => ({ ...row, month: i < 12 ? `2026-${String(i + 1).padStart(2, "0")}` : "2027-01",
      growthFactor: new D(1).plus(rate).toFixed(), contribution: i < 12 ? "1000000" : "0", plannedContribution: i < 12 ? "1000000" : "0", contributionCapacity: "1000000", withdrawal: "0" }));
    const base: ProjectionInput = { ...prepare().replayInput!, valuationDate: "2026-01-01", retirementMonth: "2027-01", contributionStartMonth: "2026-01", initialCapital: "500000", rows };
    for (const timing of ["END_OF_MONTH", "START_OF_MONTH"] as const) {
      let expected = new D("500000").mul(new D(1).plus(rate).pow(12));
      for (let k = 0; k < 12; k++) expected = expected.plus(new D("1000000").mul(new D(1).plus(rate).pow(11 - k + (timing === "START_OF_MONTH" ? 1 : 0))));
      const actual = projectRetirement({ ...base, contributionTiming: timing });
      expect(new D(actual.summary.atRetirement.projectedFund).minus(expected).abs().lt("1e-30")).toBe(true);
      if (rate === "0.01") {
        const withoutInitial = projectRetirement({ ...base, initialCapital: "0", contributionTiming: timing });
        expect(new D(withoutInitial.summary.atRetirement.projectedFund).toFixed(0)).toBe(timing === "START_OF_MONTH" ? "12809328" : "12682503");
      }
    }
  });
  it("keeps retirement surplus outside the fund unless explicitly scheduled, regardless of accumulation timing", () => {
    const p = retirementProfile(); p.personal.desiredRetirementMonth = known("2026-10");
    if (p.income.status !== "KNOWN") throw new Error("fixture");
    p.income.entries[0].amount = known("25"); p.income.entries[0].endMonth = "2027-03";
    const cfg = retirementConfiguration();
    for (const [amount, contributed, retained] of [["0", "0", "5"], ["2", "2", "3"], ["5", "5", "0"], ["6", "5", "0"]]) {
      const r = prepareRetirement(p, { ...retirementCommand(), monthlyExpenseToday: "20", retirementIncomeIds: [p.income.entries[0].id], retirementContributionSchedule: [{ month: "2026-10", amount }] }, cfg.policy, cfg.assumptions);
      expect(r.calculation!.rows[0]).toMatchObject({ contribution: contributed, uninvestedSurplus: retained, withdrawal: "0" });
      expect(r.calculation!.rows[1].contribution).toBe("0");
    }
  });
  it("weights each changing monthly rate and keeps month-end capital separate from start deposits", () => {
    const base = prepare().replayInput!, factors = ["1.1", "0.9", "1.2"], deposits = ["10", "0", "20"];
    const rows = base.rows.map((r, i) => ({ ...r, growthFactor: factors[i] ?? "1", contribution: deposits[i] ?? "0", withdrawal: "0", capitalInjection: i === 0 ? "30" : "0" }));
    for (const timing of ["END_OF_MONTH", "START_OF_MONTH"] as const) {
      const actual = projectRetirement({ ...base, initialCapital: "100", rows, contributionTiming: timing });
      let expected = new D("100");
      for (let i = 0; i < 3; i++) {
        expected = expected.mul(factors[i]).plus(new D(deposits[i]).mul(timing === "START_OF_MONTH" ? factors[i] : "1")).plus(i === 0 ? "30" : "0");
        expect(actual.rows[i].closingBalance).toBe(expected.toFixed());
      }
      expect(actual.summary.atRetirement.projectedFund).toBe(expected.toFixed());
    }
  });
  it("does not claim a later contribution fixes an earlier unfunded partial month", () => {
    const base = prepare({ contributionTiming: "START_OF_MONTH", startOfMonthFunding: funding }, "2026-10-05").replayInput!;
    const rows = base.rows.map((r, i) => ({ ...r, withdrawal: i === 0 ? "10" : "0", capitalInjection: i === 1 ? "1000" : "0" }));
    const result = projectRetirement({ ...base, rows });
    expect(result.summary.firstShortfallMonth).toBe("2026-10");
    expect(new D(result.summary.terminalBalance).gt(0)).toBe(true);
    expect(result.summary.additionalMonthlyContribution).toBeNull();
    expect(result.summary.savingsStatus).toBe("EARLY_FUNDING_REQUIRED");
  });
  it("pins the new model and timing in saved/replayed/CSV versions, without changing the applied version", async () => {
    const f = await plansFixture(), old = await f.create();
    await f.plans.apply(f.owner, old.planId, { versionId: old.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID());
    const selection = { ...f.command.preview, contributionTiming: "START_OF_MONTH" as const, startOfMonthFunding: funding };
    const preview = await f.retirement.preview(f.owner, selection);
    expect(preview.inputHash).not.toBe(f.command.expectedInputHash);
    const saved = await f.plans.createVersion(f.owner, old.planId, { preview: selection, expectedInputHash: preview.inputHash, expectedRevision: 2 }, randomUUID());
    expect((await f.plans.get(f.owner, old.planId)).currentVersionId).toBe(old.saved.id);
    expect((await f.plans.version(f.owner, old.planId, saved.saved.id, true)).preview.modelVersion).toBe("retirement-monthly-v3");
    expect((await f.plans.exportCsv(f.owner, old.planId, saved.saved.id)).content).toContain("START_OF_MONTH");
  });
  it("dispatches historical unmarked inputs to the unchanged v2 engine", () => {
    const replay = prepare().replayInput!;
    const { modelVersion, contributionStartMonth, ...old } = replay;
    const legacy = { ...old, contributionTiming: "END_OF_MONTH" as const };
    expect(projectRetirement(legacy)).toEqual(legacyProject(legacy));
    expect(projectRetirement(legacy).modelVersion).toBe("retirement-monthly-v2");
  });
});
