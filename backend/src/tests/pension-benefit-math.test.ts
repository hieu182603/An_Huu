import { expect, it } from "vitest";
import { ordinaryPensionRate, benefitYears, adjustedWageAverage, disabilityReductionPercent } from "../modules/pensions/benefit-math";

it.each([
  [179, null, null], [180, "40", "45"], [181, "40.5", "46"], [186, "40.5", "46"], [187, "41", "47"], [191, "41", "47"],
  [192, "41", "47"], [234, "44.5", "54"], [239, "45", "55"], [240, "45", "55"], [241, "46", "56"],
  [360, "65", "75"], [420, "75", "75"], [600, "75", "75"],
])("statutory amount thresholds for %i actual months", (months, male, female) => {
  expect(ordinaryPensionRate("MALE", months)).toBe(male);
  expect(ordinaryPensionRate("FEMALE", months)).toBe(female);
});
it("does not convert rounded benefit years into eligibility or use binary money arithmetic", () => {
  expect(benefitYears(179).toFixed()).toBe("15");
  expect(ordinaryPensionRate("MALE", 179)).toBeNull();
  // Independently: (10,000,000*1.03 + 12,000,000*1)/2 = 11,150,000.
  expect(adjustedWageAverage([{ base: "10000000", factor: "1.03" }, { base: "12000000", factor: "1" }])).toBe("11150000");
  expect(adjustedWageAverage([{ base: "0.1", factor: "1.1" }, { base: "0.2", factor: "1.1" }])).toBe("0.165");
});
it.each([[0,"0"],[5,"0"],[6,"1"],[11,"1"],[12,"2"],[17,"2"],[18,"3"],[60,"10"]])("disability reduction at %i months uses its own fraction rule", (months, percent) => {
  expect(disabilityReductionPercent(months)).toBe(percent);
});
it("rejects fractional periods, absent coefficients and out-of-range monetary inputs", () => {
  expect(() => benefitYears(12.5)).toThrow();
  expect(() => ordinaryPensionRate("MALE", 1201)).toThrow();
  expect(() => adjustedWageAverage([])).toThrow();
  expect(() => adjustedWageAverage([{ base: "10", factor: "0" }])).toThrow();
  expect(() => adjustedWageAverage([{ base: "1e1000", factor: "1" }])).toThrow();
});
