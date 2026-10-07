import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { legalRuleDraftSchema } from "../modules/pensions/insurance-schema";
import { stateV2Career as career, type StateV2Options as Options } from "./benefit-fixtures";
import { validateLegalDocument } from "../modules/pensions/legal-validation";
import { assessBenefit } from "../modules/pensions/benefit-engine";
import { RetirementDecimal as D } from "../modules/retirement/engine";

const draft = (file: string) => legalRuleDraftSchema.parse(JSON.parse(readFileSync(join(resolve("seed-data/legal-2026"), file), "utf8"))).document;
const v2 = draft("bh2-state-mixed-v2.draft.json"), v1 = draft("bh2-state-mixed.draft.json");

const run = (c: ReturnType<typeof career>, rules = v2) => assessBenefit(c.history, c.input, rules, "2026-10-07");
const codes = (r: ReturnType<typeof run>) => r.missingFields.map(f => f.code);

describe("vn-pension-state-v2 (draft corpus only)", () => {
  it("validates the v2 draft against v1 goldens plus three hand-computed v2 goldens", () => {
    const report = validateLegalDocument(v2);
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.coverage[0].cases.map(c => c.id)).toEqual(expect.arrayContaining(["BH2-V2-CREDITED-WINDOW", "BH2-V2-CREDITED-ALLTIME", "BH2-V2-MILITARY-TRANSFER", "BH2-V2-HAZARDOUS-TRANSFER", "BH2-V2-SENIORITY-B"]));
    expect(report.coverage[0].cases.every(c => c.passed)).toBe(true);
  });

  it("counts BHXH-confirmed pre-1995 credited time and uses the higher all-time average (Art15(2)(c))", () => {
    const r = run(career({ credited: "6", early: "3", late: "3" }));
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(r.countedMonths).toBe(438);
    expect(new D(r.monthlyPension!).toFixed(2)).toBe("6472294.52");
    expect(r.breakdown.find(b => b.code === "CREDITED_MONTHS")?.value).toBe("60");
    expect(r.breakdown.find(b => b.code === "PRE_2004_CONVERTED_MONTHS")?.value).toBe("177");
  });

  it("uses the higher pre-transfer window for an officer who transferred into state work (Art15(2)(b))", () => {
    const r = run(career({ from: "2000-01", early: "6", late: "3", transfer: "2011-01" }));
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(new D(r.monthlyPension!).toFixed(2)).toBe("8804400.00");
    expect(r.breakdown.find(b => b.code === "USED_BEFORE_TRANSFER_AVERAGE")?.value).toBe("true");
    expect(r.breakdown.some(b => b.code === "STATE_USED_ALL_TIME_AVERAGE")).toBe(false);
  });

  it.each([
    ["unknown credit kind", { credited: "2", creditKind: "MATERNITY" }, "CREDITED_MONTH_ASSESSMENT_REQUIRED"],
    ["conscript credited time (Art2(1)(đ))", { credited: "2", creditKind: "PRE_1995_ARMED_FORCES", creditCategory: "ARTICLE_2_1_DD" }, "CREDITED_MONTH_ASSESSMENT_REQUIRED"],
    ["pre-2004 salary not converted", { convert: false }, "PRE_2004_STATE_SALARY_CONVERSION_REQUIRED"],
    ["armed-forces scale on a civilian month", { scale: "ND204_ARMED_FORCES" }, "PRE_2004_CONVERSION_SCALE_MISMATCH"],
    ["retiring while still an officer", { lastCategory: "ARTICLE_2_1_D" }, "ARMED_FORCES_RETIREMENT_BRANCH_REQUIRED"],
    ["transfer window shorter than 72 months", { from: "2000-01", early: "6", late: "3", transfer: "2004-01" }, "TRANSFER_WINDOW_INCOMPLETE"],
  ] as const)("keeps %s in review", (_name, options, code) => {
    const r = run(career(options as Options));
    expect(r.assessmentStatus).toBe("REVIEW_REQUIRED");
    expect(codes(r)).toContain(code);
  });

  it("does not accept officer months unless the transfer is declared", () => {
    const c = career({ from: "2000-01", early: "6", late: "3", transfer: "2011-01" });
    c.input.stateSalaryCase!.salaryTreatment = "ORDINARY"; delete (c.input.stateSalaryCase as { transferMonth?: string }).transferMonth;
    expect(codes(run(c))).toContain("PARTICIPANT_BRANCH_REVIEW_REQUIRED");
  });

  it("requires a transfer month for MILITARY_TRANSFER and rejects it otherwise", () => {
    const missing = career({ from: "2000-01", early: "6", late: "3", transfer: "2011-01" });
    delete (missing.input.stateSalaryCase as { transferMonth?: string }).transferMonth;
    expect(codes(run(missing))).toContain("TRANSFER_MONTH_REQUIRED");
    const stray = career(); stray.input.stateSalaryCase!.transferMonth = "2011-01";
    expect(codes(run(stray))).toContain("TRANSFER_MONTH_NOT_APPLICABLE");
  });

  const hazardous: Options = { from: "1995-01", early: "5", late: "3", transfer: "2013-01", treatment: "HAZARDOUS_TRANSFER", hazard: [["1995-01", "2012-12"]], windowFrom: "2007-01" };
  it("uses the declared consecutive hazardous-salary window after >=15 years (Art15(2)(a))", () => {
    const r = run(career(hazardous));
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(new D(r.monthlyPension!).toFixed(2)).toBe("8602000.00");
    expect(r.breakdown.find(b => b.code === "USED_HAZARDOUS_WINDOW_AVERAGE")?.value).toBe("true");
    // A lower window is allowed but the final window then wins: max, never a forced substitution.
    const low = run(career({ ...hazardous, early: "2" }));
    expect(new D(low.monthlyPension!).toFixed(2)).toBe(new D("7590000").mul("0.68").toFixed(2));
  });

  it.each([
    ["fewer than 15 hazardous years", { ...hazardous, hazard: [["2000-01", "2012-12"]] as Array<[string, string]> }, "HAZARDOUS_FIFTEEN_YEARS_REQUIRED"],
    ["window running past the hazardous period", { ...hazardous, windowFrom: "2008-01" }, "HAZARDOUS_WINDOW_INVALID"],
    ["hazardous period after the change month", { ...hazardous, hazard: [["1995-01", "2013-06"]] as Array<[string, string]> }, "HAZARDOUS_PERIODS_INVALID"],
    ["overlapping hazardous periods", { ...hazardous, hazard: [["1995-01", "2005-12"], ["2005-06", "2012-12"]] as Array<[string, string]> }, "HAZARDOUS_PERIODS_INVALID"],
    ["hazardous fields on an ordinary case", { hazard: [["1995-01", "2012-12"]] as Array<[string, string]> }, "HAZARDOUS_FIELDS_NOT_APPLICABLE"],
    ["missing hazardous periods", { ...hazardous, hazard: undefined }, "HAZARDOUS_PERIODS_REQUIRED"],
  ] as const)("rejects %s", (_name, options, code) => {
    expect(codes(run(career(options as Options)))).toContain(code);
  });

  const seniority: Options = { from: "2004-10", early: "4", late: "4", transfer: "2010-01", treatment: "SENIORITY_ALLOWANCE_TRANSFER", seniority: () => true };
  it("computes the unambiguous seniority case (3)(b) like an ordinary state career", () => {
    const r = run(career(seniority));
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(new D(r.monthlyPension!).toFixed(2)).toBe("4958800.00");
  });

  it.each([
    ["(3)(a): final window without the allowance", (m: string) => m < "2010-01", "SENIORITY_ALLOWANCE_ADDITION_REVIEW_REQUIRED", "REVIEW_REQUIRED"],
    ["(3)(c): final window partly with the allowance", (m: string) => m < "2010-01" || m >= "2020-01", "SENIORITY_MIXED_WINDOW_REVIEW_REQUIRED", "REVIEW_REQUIRED"],
    ["no allowance before the change", (m: string) => m >= "2010-01", "SENIORITY_HISTORY_REQUIRED", "INSUFFICIENT_DATA"],
    ["missing allowance flags", (m: string) => (m >= "2020-01" ? undefined : true), "SENIORITY_FLAG_REQUIRED", "INSUFFICIENT_DATA"],
  ] as const)("keeps seniority %s out of automatic assessment", (_name, flag, code, status) => {
    const r = run(career({ ...seniority, seniority: flag }));
    expect(r.assessmentStatus).toBe(status);
    expect(codes(r)).toContain(code);
  });

  it("leaves v1 behaviour and input hashes unchanged for the same history", () => {
    const c = career({ credited: "6", early: "3", late: "3" }), r = run(c, v1);
    expect(r.assessmentStatus).toBe("REVIEW_REQUIRED");
    expect(codes(r)).toContain("CREDITED_MONTH_ASSESSMENT_REQUIRED");
    expect(r.inputHash).not.toBe(run(c).inputHash);
  });
});
