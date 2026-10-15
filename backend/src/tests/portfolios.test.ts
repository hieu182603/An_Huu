import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService } from "../modules/portfolios/service";
import { assessPortfolio, glideTargets, glideYears, previewPortfolio, validatePortfolioPolicy } from "../modules/portfolios/engine";
import { portfolioDocumentSchema, portfolioPreviewSchema } from "../modules/portfolios/schema";
import { AssumptionDecimal as D } from "../modules/assumptions/series";
import { glidePortfolioFixture, portfolioAssumptionsFixture, portfolioFixture, portfolioCommand } from "./portfolio-fixtures";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
const now = () => new Date("2026-10-04T12:00:00Z");
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("T04 multi-factor policy and scenarios", () => {
  it("distinguishes willingness and liquidity without an age-only default", () => {
    const policy = portfolioFixture();
    expect(validatePortfolioPolicy(policy, portfolioAssumptionsFixture()).status).toBe("VALID");
    expect(assessPortfolio(policy, portfolioCommand()).selectedTemplateId).toBe("GROWTH");
    expect(assessPortfolio(policy, portfolioCommand(undefined, false)).selectedTemplateId).toBe("CAUTIOUS");
    const liquid = { ...portfolioCommand(), liquidityNeedMonths: 2 };
    const result = assessPortfolio(policy, liquid);
    expect(result).toMatchObject({ status: "INCOMPLETE", selectedTemplateId: null });
    expect(result.checks.find(c => c.ruleId === "GROWTH")?.failed).toContain("LIQUIDITY_NEED_MONTHS");
  });
  it("does not turn missing answers into zero risk or hide invalid answers", () => {
    const incomplete = assessPortfolio(portfolioFixture(), { ...portfolioCommand(), answers: [] });
    expect(incomplete).toMatchObject({ status: "INCOMPLETE", totalScore: null, riskBandId: null, selectedTemplateId: null, eligibleTemplateIds: [], dimensionScores: { OBJECTIVE: null } });
    expect(incomplete.checks.every(c => !c.matched)).toBe(true);
    const command = portfolioCommand(); command.answers.push(command.answers[0]);
    expect(assessPortfolio(portfolioFixture(), command).issues).toContainEqual({ path: "answers", code: "DUPLICATE_ANSWER" });
    command.answers = [{ questionId: "UNKNOWN", choiceId: "HIGH" }];
    expect(assessPortfolio(portfolioFixture(), command).issues).toContainEqual({ path: "answers", code: "UNKNOWN_QUESTION" });
  });
  it("honors financial-capacity limits even with high willingness to take losses", () => {
    const policy = portfolioFixture(); policy.rules[1].dimensions.FINANCIAL_CAPACITY.min = 10;
    const command = portfolioCommand(); command.answers.find(a => a.questionId === "FINANCIAL_CAPACITY")!.choiceId = "LOW";
    const result = assessPortfolio(policy, command);
    expect(result).toMatchObject({ status: "INCOMPLETE", selectedTemplateId: null });
    expect(result.checks.find(c => c.ruleId === "GROWTH")?.failed).toContain("FINANCIAL_CAPACITY");
  });
  it("requires complete dimensions, score bands and unique questions", () => {
    const policy = portfolioFixture(); policy.questions.pop(); policy.questions.push(policy.questions[0]); policy.riskBands[0].minScore = 1;
    const codes = validatePortfolioPolicy(policy, portfolioAssumptionsFixture()).issues.map(i => i.code);
    expect(codes).toEqual(expect.arrayContaining(["DIMENSION_REQUIRED", "DUPLICATE_ENTRY", "SCORE_GAP_OR_OVERLAP"]));
  });
  it("rejects non-100 totals, leverage, duplicate holdings, gaps and overlaps", () => {
    const policy = portfolioFixture(); policy.templates[0].schedule[0].allocations[0].weightPercent = "99.99";
    expect(validatePortfolioPolicy(policy, portfolioAssumptionsFixture()).issues.map(i => i.code)).toContain("WEIGHTS_MUST_SUM_100");
    policy.templates[0].schedule[0].allocations[0].weightPercent = "-10";
    expect(portfolioDocumentSchema.safeParse(policy).success).toBe(false);
    const other = portfolioFixture(); other.templates[0].schedule.push(other.templates[0].schedule[0]);
    expect(validatePortfolioPolicy(other, portfolioAssumptionsFixture()).issues.map(i => i.code)).toContain("SCHEDULE_GAP_OR_OVERLAP");
  });
  it("checks all scenario years, directions and adjusted-rate solvability before approval", () => {
    const policy = portfolioFixture(); policy.scenarios[0].years[0].inflationDeltaPoints = "1";
    policy.scenarios[1].years.pop(); policy.scenarios[2].years[0].returns = [];
    expect(validatePortfolioPolicy(policy, portfolioAssumptionsFixture()).issues.map(i => i.code)).toEqual(expect.arrayContaining(["SCENARIO_DIRECTION_INVALID", "YEAR_REQUIRED", "ASSET_ADJUSTMENT_REQUIRED"]));
    const badRates = portfolioAssumptionsFixture(); badRates.returns[0].rate.percent = "-99";
    expect(validatePortfolioPolicy(portfolioFixture(), badRates).issues.map(i => i.code)).toContain("SCENARIO_RATE_OUT_OF_RANGE");
  });
  it("reports a user choice instead of choosing the first overlapping rule", () => {
    const policy = portfolioFixture(); policy.rules[0].dimensions.LOSS_TOLERANCE.max = 10;
    expect(assessPortfolio(policy, portfolioCommand()).issues).toContainEqual({ path: "templateId", code: "PORTFOLIO_CHOICE_REQUIRED" });
    expect(assessPortfolio(policy, { ...portfolioCommand(), templateId: "CAUTIOUS" }).selectedTemplateId).toBe("CAUTIOUS");
    expect(assessPortfolio(portfolioFixture(), { ...portfolioCommand(undefined, false), templateId: "GROWTH" }).issues).toContainEqual({ path: "templateId", code: "TEMPLATE_NOT_ELIGIBLE" });
  });
  it("uses weighted monthly returns and lets holdings drift until rebalance", () => {
    const result = previewPortfolio(portfolioFixture(), portfolioAssumptionsFixture(), { ...portfolioCommand(), horizonMonths: 4 });
    expect(result.status).toBe("READY");
    const base = result.scenarios.find(s => s.kind === "BASE")!;
    const factor = Math.pow(1 + Number(portfolioAssumptionsFixture().returns[3].rate.percent) / 100, 1 / 12);
    expect(Number(base.rows[0].unitValue)).toBeCloseTo(0.5 + 0.5 * factor, 12);
    expect(Number(base.rows[2].unitValue)).toBeCloseTo(0.5 + 0.5 * Math.pow(factor, 3), 12);
    expect(base.rows[1].rebalanced).toBe(false);
    expect(Number(base.rows[1].holdings.find(h => h.assetClass === "STOCK")!.startWeightPercent)).toBeGreaterThan(50);
    expect(base.rows[3]).toMatchObject({ month: "2027-01", rebalanced: true });
    expect(base.rows[3].holdings.find(h => h.assetClass === "STOCK")?.startWeightPercent).toBe("50");
    expect(base.rows[3].holdings.find(h => h.assetClass === "BOND")?.annualNetNominalReturnPercent).toBe("10");
  });
  it("applies schedule changes at the start of the exact month, charging declared turnover cost", () => {
    const policy = portfolioFixture(); const template = policy.templates[1]; template.rebalance.turnoverCostPercent = "1";
    template.schedule = [ { ...template.schedule[0], toIndex: 1 }, { fromIndex: 2, toIndex: 120, allocations: [{ assetClass: "BOND", weightPercent: "100" }] } ];
    const result = previewPortfolio(policy, portfolioAssumptionsFixture(), { ...portfolioCommand(), horizonMonths: 2 });
    const base = result.scenarios.find(s => s.kind === "BASE")!;
    const row = base.rows[1];
    expect(row.rebalanced).toBe(true);
    expect(row.holdings.find(h => h.assetClass === "BOND")?.startWeightPercent).toBe("100");
    expect(new D(row.rebalanceCostFraction).eq(new D(row.turnoverFraction).div(100))).toBe(true);
    expect(new D(row.returnMonthlyFactor).eq(new D(1).minus(row.rebalanceCostFraction))).toBe(true);
  });
  it("returns three approved, disclosed scenarios without mutating input", () => {
    const policy = portfolioFixture(), assumptions = portfolioAssumptionsFixture(), before = JSON.stringify([policy, assumptions]);
    const result = previewPortfolio(policy, assumptions, portfolioCommand());
    expect(result.scenarios.map(s => s.kind)).toEqual(["BASE", "ADVERSE", "FAVORABLE"]);
    expect(new D(result.scenarios[1].endingUnitValue).lt(result.scenarios[0].endingUnitValue)).toBe(true);
    expect(new D(result.scenarios[2].endingUnitValue).gt(result.scenarios[0].endingUnitValue)).toBe(true);
    expect(result.scenarios[1].rows[0]).toMatchObject({ inflationDeltaPoints: "1", inflationAnnualPercent: "1" });
    expect(result.scenarios[1].rows[0].holdings[0].returnDeltaPoints).toBe("-2");
    expect(JSON.stringify([policy, assumptions])).toBe(before);
  });
  it("does not manufacture returns when time or asset horizons are uncovered", () => {
    expect(previewPortfolio(portfolioFixture(), portfolioAssumptionsFixture(), { ...portfolioCommand(), horizonMonths: 120 }).status).toBe("INCOMPLETE");
    const assumptions = portfolioAssumptionsFixture(); assumptions.assetClasses[0].horizons[0].maxMonths = 12;
    expect(validatePortfolioPolicy(portfolioFixture(), assumptions).issues.map(i => i.code)).toContain("ASSET_HORIZON_NOT_COVERED");
    expect(portfolioPreviewSchema.safeParse({ ...portfolioCommand(), startMonth: "2199-12" }).success).toBe(false);
  });
});

describe("Schema v2 glide path anchored on the retirement month", () => {
  const assumptions = portfolioAssumptionsFixture();
  const stockOf = (row: { holdings: Array<{ assetClass: string; startWeightPercent: string }> }) => row.holdings.find(h => h.assetClass === "STOCK")!.startWeightPercent;
  it("validates glide points and covers horizons beyond any indexed schedule", () => {
    expect(validatePortfolioPolicy(glidePortfolioFixture(), assumptions)).toEqual({ status: "VALID", issues: [] });
    const noZero = glidePortfolioFixture(); noZero.templates[0].glidePath.points.pop();
    expect(validatePortfolioPolicy(noZero, assumptions).issues).toContainEqual({ path: "templates.0.glidePath", code: "ZERO_YEAR_POINT_REQUIRED" });
    const duplicate = glidePortfolioFixture(); duplicate.templates[0].glidePath.points.push(duplicate.templates[0].glidePath.points[0]);
    expect(validatePortfolioPolicy(duplicate, assumptions).issues.map(i => i.code)).toContain("DUPLICATE_ENTRY");
    const uneven = glidePortfolioFixture(); uneven.templates[1].glidePath.points[1].allocations[0].weightPercent = "49";
    expect(validatePortfolioPolicy(uneven, assumptions).issues.map(i => i.code)).toContain("WEIGHTS_MUST_SUM_100");
  });
  it("interpolates whole years linearly and holds the end points", () => {
    const template = glidePortfolioFixture().templates[1];
    const percent = (years: number) => Object.fromEntries([...glideTargets(template, years, ["BOND", "STOCK"])].map(([k, v]) => [k, v.mul(100).toFixed()]));
    expect(percent(7)).toEqual({ BOND: "38", STOCK: "62" });
    expect(percent(1)).toEqual({ BOND: "90", STOCK: "10" });
    expect(percent(0)).toEqual({ BOND: "100", STOCK: "0" });
    expect(glideYears(template, "2026-10", "2046-10")).toBe(10);
    expect(glideYears(template, "2026-10", "2027-09")).toBe(0);
    expect(glideYears(template, "2030-01", "2027-09")).toBe(0);
  });
  it("requires the retirement month instead of guessing an age-based default", () => {
    const result = previewPortfolio(glidePortfolioFixture(), assumptions, portfolioCommand());
    expect(result).toMatchObject({ status: "INCOMPLETE", issues: [{ path: "retirementMonth", code: "RETIREMENT_MONTH_REQUIRED" }], scenarios: [] });
  });
  it("rebalances exactly when the whole-year position changes, charging turnover", () => {
    const policy = glidePortfolioFixture(); policy.templates[1].rebalance.turnoverCostPercent = "1";
    const result = previewPortfolio(policy, assumptions, { ...portfolioCommand(), horizonMonths: 3, retirementMonth: "2027-10" });
    expect(result.status).toBe("READY");
    const rows = result.scenarios.find(s => s.kind === "BASE")!.rows;
    expect(rows[0]).toMatchObject({ rebalanced: true, turnoverFraction: "0" });
    expect(stockOf(rows[0])).toBe("10");
    expect(rows[1].rebalanced).toBe(true);
    expect(stockOf(rows[1])).toBe("0");
    expect(new D(rows[1].rebalanceCostFraction).eq(new D(rows[1].turnoverFraction).div(100))).toBe(true);
    expect(rows[2].rebalanced).toBe(false);
  });
  it("leaves schema v1 results unchanged when a retirement month is supplied", () => {
    const command = { ...portfolioCommand(), horizonMonths: 6 };
    expect(previewPortfolio(portfolioFixture(), assumptions, { ...command, retirementMonth: "2027-01" }))
      .toEqual(previewPortfolio(portfolioFixture(), assumptions, command));
  });
});

export async function setupPortfolioFixture() {
  const f = memoryDb(), assumptions = new AssumptionsService(f.db, now), portfolios = new PortfoliosService(f.db, now);
  const draft = await assumptions.create("admin", portfolioAssumptionsFixture());
  const impact = await assumptions.previewImpact("admin", draft.id, { expectedRevision: 1 });
  await assumptions.approve("admin", draft.id, { expectedRevision: 1, impactToken: impact.impactToken, reviewNote: "Fixture review" });
  await assumptions.publish("admin", draft.id, { expectedRevision: 2, confirm: true });
  return { ...f, assumptions, portfolios, assumptionId: draft.id };
}
async function publishPolicy(f: Awaited<ReturnType<typeof setupPortfolioFixture>>) {
  const policy = await f.portfolios.create("admin", portfolioFixture(f.assumptionId));
  await f.portfolios.approve("admin", policy.id, { expectedRevision: 1, confirm: true, reviewNote: "Fixture multi-factor review" });
  return f.portfolios.publish("admin", policy.id, { expectedRevision: 2, confirm: true });
}
describe("T04 persistence and permissions", () => {
  it("requires a reviewed valid dependency, freezes policy and leaves current plans alone", async () => {
    const f = await setupPortfolioFixture();
    await f.db.retirementPlan.create({ data: { id: "plan", userId: "owner", currentVersionId: "unchanged", stale: false } });
    const before = JSON.stringify(f.rows("retirementPlan"));
    const policy = await f.portfolios.create("admin", portfolioFixture(f.assumptionId));
    await expect(f.portfolios.publish("admin", policy.id, { expectedRevision: 1, confirm: true })).rejects.toMatchObject({ status: 409 });
    await expect(f.portfolios.get(policy.id, true)).rejects.toMatchObject({ status: 404 });
    await f.portfolios.approve("admin", policy.id, { expectedRevision: 1, confirm: true, reviewNote: "Fixture reviewed" });
    const published = await f.portfolios.publish("admin", policy.id, { expectedRevision: 2, confirm: true });
    expect(published.approval?.assumptionHash).toBe((await f.assumptions.get(f.assumptionId)).documentHash);
    await expect(f.portfolios.patch("admin", policy.id, { expectedRevision: 3, data: portfolioFixture(f.assumptionId) })).rejects.toMatchObject({ status: 409 });
    expect((await f.portfolios.preview(portfolioCommand(policy.id))).status).toBe("READY");
    expect(JSON.stringify(f.rows("retirementPlan"))).toBe(before); expect(f.rows("outboxEvent")).toHaveLength(0);
  });
  it("replays old policy and assumption versions after new policy publication", async () => {
    const f = await setupPortfolioFixture(), first = await publishPolicy(f);
    const before = await f.portfolios.preview(portfolioCommand(first.id));
    await publishPolicy(f);
    expect(await f.portfolios.preview(portfolioCommand(first.id))).toEqual(before);
    expect((await f.portfolios.list({ page: 2, limit: 20 }, true))).toMatchObject({ status: "AVAILABLE", total: 2, items: [] });
  });
  it("enforces revisions, rejects invalid policy and rolls back failed audits", async () => {
    const f = await setupPortfolioFixture(), policy = await f.portfolios.create("admin", portfolioFixture(f.assumptionId));
    const invalid = portfolioFixture(f.assumptionId); invalid.questions = [];
    await f.portfolios.patch("admin", policy.id, { expectedRevision: 1, data: invalid });
    await expect(f.portfolios.patch("admin", policy.id, { expectedRevision: 1, data: invalid })).rejects.toMatchObject({ status: 409 });
    await expect(f.portfolios.approve("admin", policy.id, { expectedRevision: 2, confirm: true, reviewNote: "Invalid fixture" })).rejects.toMatchObject({ status: 422 });
    f.failWrites("auditLog"); const count = f.rows("assumptionSetVersion").length;
    await expect(f.portfolios.create("admin", portfolioFixture(f.assumptionId))).rejects.toThrow("Injected");
    expect(f.rows("assumptionSetVersion")).toHaveLength(count);
  });
  it("detects tampered policy and rejects unpublished assumption dependencies", async () => {
    const f = await setupPortfolioFixture(), published = await publishPolicy(f);
    f.rows("assumptionSetVersion").find(r => r.id === published.id)!.values.questions[0].choices[0].score = 9;
    await expect(f.portfolios.preview(portfolioCommand(published.id))).rejects.toMatchObject({ code: "POLICY_REVIEW_REQUIRED" });
    const draft = await f.assumptions.create("admin", portfolioAssumptionsFixture());
    const policy = await f.portfolios.create("admin", portfolioFixture(draft.id));
    await expect(f.portfolios.approve("admin", policy.id, { expectedRevision: 1, confirm: true, reviewNote: "Fixture review" })).rejects.toMatchObject({ status: 404 });
  });
  it("hides future policies, reports no configuration and prevents descending publication versions", async () => {
    const f = await setupPortfolioFixture();
    expect((await f.portfolios.list({ page: 1, limit: 20 }, true)).status).toBe("UNCONFIGURED");
    const old = await f.portfolios.create("admin", portfolioFixture(f.assumptionId));
    const future = portfolioFixture(f.assumptionId); future.effectiveFrom = "2027-01-01";
    const scheduled = await f.portfolios.create("admin", future);
    for (const v of [old, scheduled]) await f.portfolios.approve("admin", v.id, { expectedRevision: 1, confirm: true, reviewNote: "Fixture reviewed" });
    await f.portfolios.publish("admin", scheduled.id, { expectedRevision: 2, confirm: true });
    await expect(f.portfolios.publish("admin", old.id, { expectedRevision: 2, confirm: true })).rejects.toMatchObject({ code: "OLDER_VERSION" });
    await expect(f.portfolios.preview(portfolioCommand(scheduled.id))).rejects.toMatchObject({ status: 404 });
    expect((await f.portfolios.list({ page: 1, limit: 20 }, true)).total).toBe(0);
  });
  it("gates HTTP ADMIN/USER, rejects score/rate injection, and keeps preview read-only", async () => {
    const f = await setupPortfolioFixture(), published = await publishPolicy(f), auth = new AuthService(f.db, config);
    vi.spyOn(auth, "validateSession").mockResolvedValue({ id: "test-user", role: "USER" } as never);
    const app = createApp({ config, services: { auth, profiles: new ProfileService(f.db), portfolios: f.portfolios } });
    expect((await request(app).get("/api/v1/me/portfolio-policies")).status).toBe(401);
    expect((await request(app).post("/api/v1/admin/portfolio-policies").set("Authorization", "Bearer " + token()).send(portfolioFixture(f.assumptionId))).status).toBe(403);
    expect((await request(app).get("/api/v1/me/portfolio-policies").set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
    const before = JSON.stringify([f.rows("assumptionSetVersion"), f.rows("auditLog"), f.rows("retirementPlan")]);
    const response = await request(app).post("/api/v1/me/portfolio-policies/preview").set("Authorization", "Bearer " + token()).send(portfolioCommand(published.id));
    expect(response.status).toBe(200); expect(response.body.data.status).toBe("READY");
    const specification = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, uri: true, "date-time": true } });
    const conforms = (name: string, body: unknown) => {
      const validate = ajv.compile(specification.components.schemas["Portfolio" + name + "Envelope"]);
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    };
    conforms("Preview", response.body);
    const missing = await request(app).post("/api/v1/me/portfolio-policies/preview").set("Authorization", "Bearer " + token()).send({ ...portfolioCommand(published.id), answers: [] });
    expect(missing.body.data.status).toBe("INCOMPLETE"); conforms("Preview", missing.body);
    conforms("List", (await request(app).get("/api/v1/me/portfolio-policies").set("Authorization", "Bearer " + token())).body);
    conforms("Version", (await request(app).get("/api/v1/me/portfolio-policies/" + published.id).set("Authorization", "Bearer " + token())).body);
    conforms("Validation", (await request(app).post(`/api/v1/admin/portfolio-policies/${published.id}/validate`).set("Authorization", "Bearer " + token("ADMIN")).send({})).body);
    for (const extra of [{ score: 100 }, { annualReturnRate: "50" }, { weights: ["100"] }, { userId: "other" }])
      expect((await request(app).post("/api/v1/me/portfolio-policies/preview").set("Authorization", "Bearer " + token()).send({ ...portfolioCommand(published.id), ...extra })).status).toBe(400);
    expect(JSON.stringify([f.rows("assumptionSetVersion"), f.rows("auditLog"), f.rows("retirementPlan")])).toBe(before);
  });
});
