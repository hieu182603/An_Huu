import { describe, expect, it } from "vitest";
import { previewPortfolio } from "../modules/portfolios/engine";
import { previewGuidance } from "../modules/portfolios/guidance";
import { plansFixture } from "./plans-fixtures";
import { portfolioFixture, portfolioAssumptionsFixture, portfolioCommand } from "./portfolio-fixtures";
import { retirementProfile } from "./retirement-fixtures";
import { known } from "./profile-v2-fixtures";

describe("desktop preview blockers", () => {
  it("shows rule boundaries and failed conditions without modifying published configuration", () => {
    const policy = portfolioFixture(), assumptions = portfolioAssumptionsFixture();
    const input = { ...portfolioCommand(), horizonMonths: 421 };
    const before = JSON.stringify([policy, assumptions, input]);
    const result = previewPortfolio(policy, assumptions, input);
    const guidance = previewGuidance(policy, assumptions, input, result.issues);
    expect(guidance.requestedPeriod).toEqual({ startMonth: "2026-10", endMonth: "2061-10", horizonMonths: 421 });
    expect(guidance.issues).toContainEqual(expect.objectContaining({ code: "POLICY_NOT_COVERED", action: "REVIEW_CONFIGURATION" }));
    expect(guidance.policyRules.every(rule => rule.maxMonths === 120)).toBe(true);
    expect(guidance.policyChecks.every(check => check.failed.includes("HORIZON_MONTHS"))).toBe(true);
    expect(JSON.stringify([policy, assumptions, input])).toBe(before);
  });
  it("does not blame configuration when survey answers are missing", () => {
    const policy = portfolioFixture(), assumptions = portfolioAssumptionsFixture(), input = { ...portfolioCommand(), answers: [] };
    const result = previewPortfolio(policy, assumptions, input);
    expect(previewGuidance(policy, assumptions, input, result.issues).issues).toContainEqual(expect.objectContaining({ code: "POLICY_NOT_COVERED", action: "REVIEW_SELECTION" }));
  });
  it("returns actual published projection coverage on retirement previews without extrapolation", async () => {
    const f = await plansFixture();
    const preview = await f.retirement.preview(f.owner, { ...f.command.preview, endMonth: "2030-01" });
    expect(preview.status).toBe("INCOMPLETE");
    expect(preview.calculation).toBeNull();
    expect(preview.guidance?.assumptionPeriod).toEqual({ startYear: 2026, endYear: 2028 });
    expect(preview.guidance?.issues).toContainEqual(expect.objectContaining({ code: "PROJECTION_NOT_COVERED", action: "REVIEW_CONFIGURATION", message: expect.stringContaining("2028") }));
  });
  it("supports retirement at age 50 in the valuation month through save and replay", async () => {
    const profile = retirementProfile();
    profile.personal.birthMonth = known("1976-10");
    profile.personal.desiredRetirementMonth = known("2026-10");
    const f = await plansFixture(profile), saved = await f.create();
    expect(saved.saved.preview).not.toHaveProperty("guidance");
    expect(saved.saved.preview.calculation?.summary).toMatchObject({ retirementMonth: "2026-10", accumulationMonths: 0, requiredConstantMonthlyContribution: null });
    expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true))).toMatchObject({ replay: { matched: true } });
  });
});
