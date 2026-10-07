import { describe, expect, it } from "vitest";
import { assessBenefit } from "../modules/pensions/benefit-engine";
import { MATERNITY_2006_CREDIT_KIND, MATERNITY_2014_CREDIT_KIND, MATERNITY_CREDIT_KIND } from "../modules/pensions/insurance-schema";
import { benefitFixtureV2, stateV2Career } from "./benefit-fixtures";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { legalRuleDraftSchema } from "../modules/pensions/insurance-schema";

const codes = (r: ReturnType<typeof assessBenefit>) => r.missingFields.map(f => f.code);
const credit = <T extends { month: string; status: string; creditKind?: string }>(months: T[], from: string, to: string, base?: null) => {
  for (const row of months) if (row.month >= from && row.month <= to) { row.status = "CREDITED"; row.creditKind = MATERNITY_CREDIT_KIND; if (base === null) (row as { contributionBase?: string | null }).contributionBase = null; }
};

describe("Law Art53(8) maternity months (BH1 v2)", () => {
  const withArt53 = () => { const f = benefitFixtureV2(); f.rules.citations.push({ ...f.rules.citations[0], id: "LAW_ART53" }); return f; };

  it("counts BHXH-recorded maternity months from 2025-07 exactly like contributed months", () => {
    const baseline = withArt53(), f = withArt53();
    credit(f.history.months, "2025-08", "2025-11");
    const r = assessBenefit(f.history, f.input, f.rules, "2026-10-05"), b = assessBenefit(baseline.history, baseline.input, baseline.rules, "2026-10-05");
    expect(b.assessmentStatus).toBe("ELIGIBLE");
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(r.monthlyPension).toBe(b.monthlyPension);
    expect(r.countedMonths).toBe(180);
    expect(r.breakdown.find(x => x.code === "MATERNITY_CREDITED_MONTHS")?.value).toBe("4");
    expect(r.historyHash).not.toBe(b.historyHash); // bound to the original (CREDITED) history
  });

  it.each([
    ["rule set without the Art53 citation", () => benefitFixtureV2(), "2025-08", undefined, "CREDITED_MONTH_ASSESSMENT_REQUIRED"],
    ["maternity before the 2024 law took effect", withArt53, "2025-01", undefined, "CREDITED_MONTH_ASSESSMENT_REQUIRED"],
    ["no BHXH-recorded base", withArt53, "2025-08", null, "POSITIVE_CONTRIBUTION_BASE_REQUIRED"],
  ] as const)("does not count it with %s", (_name, make, from, base, code) => {
    const f = make(); credit(f.history.months, from, from, base);
    const r = assessBenefit(f.history, f.input, f.rules, "2026-10-05");
    expect(r.assessmentStatus).not.toBe("ELIGIBLE");
    expect(codes(r)).toContain(code);
  });
});

describe("Law 58/2014 Art39(2) maternity months 2016-01..2025-06 (BH1 v2)", () => {
  const with2014 = () => { const f = benefitFixtureV2(); f.rules.citations.push({ ...f.rules.citations[0], id: "LAW2014_ART39" }); return f; };
  const credit2014 = <T extends { month: string; status: string; creditKind?: string }>(months: T[], from: string, to: string, kind = MATERNITY_2014_CREDIT_KIND) => {
    for (const row of months) if (row.month >= from && row.month <= to) { row.status = "CREDITED"; row.creditKind = kind; }
  };

  it("counts 2014-law maternity months with the recorded base", () => {
    const baseline = with2014(), f = with2014();
    credit2014(f.history.months, "2024-03", "2024-08");
    const b = assessBenefit(baseline.history, baseline.input, baseline.rules, "2026-10-05"), r = assessBenefit(f.history, f.input, f.rules, "2026-10-05");
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(r.monthlyPension).toBe(b.monthlyPension);
    expect(r.breakdown.find(x => x.code === "MATERNITY_CREDITED_MONTHS")).toMatchObject({ value: "6", citationIds: ["LAW2014_ART39"] });
  });

  it.each([
    ["the 2024-law kind used for a 2014-law month", "2024-03", MATERNITY_CREDIT_KIND],
    ["a month before the 2014 law took effect", "2015-12", MATERNITY_2014_CREDIT_KIND],
    ["the 2014-law kind used after 2025-06", "2025-07", MATERNITY_2014_CREDIT_KIND],
  ] as const)("keeps %s in review", (_name, month, kind) => {
    const f = with2014(); f.rules.citations.push({ ...f.rules.citations[0], id: "LAW_ART53" });
    // Fixture history covers 2011-07..2026-06.
    credit2014(f.history.months, month, month, kind);
    expect(codes(assessBenefit(f.history, f.input, f.rules, "2026-10-05"))).toContain("CREDITED_MONTH_ASSESSMENT_REQUIRED");
  });

  it("requires the 2014-law citation in the rule set", () => {
    const f = benefitFixtureV2(); f.rules.citations.push({ ...f.rules.citations[0], id: "LAW_ART53" });
    credit2014(f.history.months, "2024-03", "2024-03");
    expect(codes(assessBenefit(f.history, f.input, f.rules, "2026-10-05"))).toContain("CREDITED_MONTH_ASSESSMENT_REQUIRED");
  });
});

describe("Law 71/2006 Art35(2) maternity months 2007-01..2015-12 (BH1 v2)", () => {
  const with2006 = () => { const f = benefitFixtureV2(); f.rules.citations.push({ ...f.rules.citations[0], id: "LAW2006_ART35" }); return f; };
  const mark = <T extends { month: string; status: string; creditKind?: string }>(months: T[], from: string, to: string, kind: string) => {
    for (const row of months) if (row.month >= from && row.month <= to) { row.status = "CREDITED"; row.creditKind = kind; }
  };
  it("counts 2006-law maternity months with the recorded base", () => {
    const baseline = with2006(), f = with2006();
    mark(f.history.months, "2012-02", "2012-07", MATERNITY_2006_CREDIT_KIND); // fixture history covers 2011-07..2026-06
    const b = assessBenefit(baseline.history, baseline.input, baseline.rules, "2026-10-05"), r = assessBenefit(f.history, f.input, f.rules, "2026-10-05");
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(r.monthlyPension).toBe(b.monthlyPension);
    expect(r.breakdown.find(x => x.code === "MATERNITY_CREDITED_MONTHS")).toMatchObject({ value: "6", citationIds: ["LAW2006_ART35"] });
  });
  it.each([["2016-01", MATERNITY_2006_CREDIT_KIND], ["2015-12", MATERNITY_2014_CREDIT_KIND]] as const)("keeps %s with kind %s in review", (month, kind) => {
    const f = with2006(); f.rules.citations.push({ ...f.rules.citations[0], id: "LAW2014_ART39" });
    mark(f.history.months, month, month, kind);
    expect(codes(assessBenefit(f.history, f.input, f.rules, "2026-10-05"))).toContain("CREDITED_MONTH_ASSESSMENT_REQUIRED");
  });
});

describe("Law Art53(8) maternity months (state v2)", () => {
  const v2 = legalRuleDraftSchema.parse(JSON.parse(readFileSync(join(resolve("seed-data/legal-2026"), "bh2-state-mixed-v2.draft.json"), "utf8"))).document;
  it("counts a civil servant's maternity months with the recorded coefficient", () => {
    const baseline = stateV2Career(), c = stateV2Career();
    credit(c.history.months, "2025-08", "2025-11");
    const b = assessBenefit(baseline.history, baseline.input, v2, "2026-10-07"), r = assessBenefit(c.history, c.input, v2, "2026-10-07");
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(r.monthlyPension).toBe(b.monthlyPension);
  });
});
