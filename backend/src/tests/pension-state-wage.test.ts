import { expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { ordinaryStateMixedAverage, stateAveragingWindow } from "../modules/pensions/state-wage";

it.each([["1994-12",60],["1995-01",72],["2000-12",72],["2001-01",96],["2006-12",96],["2007-01",120],
  ["2015-12",120],["2016-01",180],["2019-12",180],["2020-01",240],["2024-12",240],["2025-01",null]] as const)
("state averaging window at first participation %s is %s", (month, expected) => expect(stateAveragingWindow(month)).toBe(expected));
it("uses the nearest state months across separate segments and weights all state months", () => {
  const months = Array.from({ length: 180 }, (_, i) => ({ month: addMonths("2005-01", i), salaryRegime: i >= 60 && i < 120 ? "EMPLOYER" as const : "STATE" as const,
    adjustedBase: i < 60 ? "10000000" : i < 120 ? "20000000" : "12000000" }));
  // First participation1994 => last60STATE months, all in2015..2019.
  // (120 state months*12m + 60 employer months*20m)/180 = 14,666,666.66...
  const result = ordinaryStateMixedAverage("1994-01", months.reverse());
  expect(result).toMatchObject({ prescribedWindowMonths: 60, stateMonths: 120, employerMonths: 60, stateAverage: "12000000", employerAdjustedTotal: "1200000000" });
  expect(result.selectedStateMonths[0]).toBe("2015-01");
  expect(Number(result.average)).toBeCloseTo(14666666.6666667, 5);
});
it("uses actual months for a short state career and the greater whole-career ordinary state average", () => {
  const short = ordinaryStateMixedAverage("2020-01", [{ month: "2020-01", salaryRegime: "STATE", adjustedBase: "10000000" },
    { month: "2020-03", salaryRegime: "STATE", adjustedBase: "14000000" }]);
  expect(short).toMatchObject({ prescribedWindowMonths: 240, stateMonths: 2, average: "12000000" });
  const months = Array.from({ length: 120 }, (_, i) => ({ month: addMonths("1994-01", i), salaryRegime: "STATE" as const, adjustedBase: i < 60 ? "20000000" : "10000000" }));
  expect(ordinaryStateMixedAverage("1994-01", months)).toMatchObject({ windowAverage: "10000000", allStateAverage: "15000000", average: "15000000", usedAllStateAverage: true });
});
it("rejects duplicate months, invalid amounts and a start date after contribution history", () => {
  const row = { month: "2020-01", salaryRegime: "STATE" as const, adjustedBase: "10000000" };
  expect(() => ordinaryStateMixedAverage("2020-01", [row, row])).toThrow();
  expect(() => ordinaryStateMixedAverage("2020-02", [row])).toThrow();
  expect(() => ordinaryStateMixedAverage("2020-01", [{ ...row, adjustedBase: "NaN" }])).toThrow();
  expect(() => ordinaryStateMixedAverage("2020-01", [])).toThrow();
});
