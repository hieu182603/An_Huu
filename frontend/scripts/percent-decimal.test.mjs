import test from "node:test";
import assert from "node:assert/strict";
import { decimalToPercent, percentToDecimal } from "../src/utils/percentDecimal.ts";

test("percentToDecimal shifts the decimal point exactly", () => {
  const cases = [["1.25", "0.0125"], ["-3", "-0.03"], ["0", "0"], ["12", "0.12"], ["150", "1.5"], ["0.5", "0.005"],
    ["0,42", "0.0042"], ["-0.0001", "-0.000001"], ["2%", "0.02"], ["100", "1"], ["-35", "-0.35"], ["", ""]];
  for (const [input, expected] of cases) assert.equal(percentToDecimal(input), expected, input);
});

test("percentToDecimal rejects non-numbers", () => {
  for (const input of ["abc", "1.2.3", "--1", "1e3"]) assert.equal(percentToDecimal(input), null, input);
});

test("decimalToPercent round-trips", () => {
  for (const pct of ["1.25", "-3", "12", "1.5", "0.005", "-35", "0.0001"]) assert.equal(decimalToPercent(percentToDecimal(pct)), String(Number(pct)), pct);
  assert.equal(decimalToPercent(undefined), "");
});
