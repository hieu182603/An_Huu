import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLossTolerance as resolve } from "../src/utils/lossTolerance.ts";
test("percentage remains 30% when long-term capital changes to 76 million", () => {
 assert.deepEqual(resolve("76000000", "53000000", "30", "PERCENT"), {amount:"22800000",percent:"30",inputMode:"PERCENT"});
});
test("fixed amount remains fixed when capital changes", () => {
 assert.deepEqual(resolve("76000000", "19000000", "30", "AMOUNT"), {amount:"19000000",percent:"25",inputMode:"AMOUNT"});
});
test("zero capital does not invent a tolerance and known zero stays zero", () => {
 assert.equal(resolve("0", "53000000", "30", "PERCENT").amount,null);
 assert.equal(resolve("76000000", null, "0", "PERCENT").amount,"0");
});

test("legacy records preserve the smaller cap until an explicit mode is saved",()=>{
 assert.deepEqual(resolve("76000000","19000000","30"),{amount:"19000000",percent:"25",inputMode:"AMOUNT"});
});
// Customer feedback 18/11/2026: a percent saved before long-term capital is known stays visible.
assert.deepEqual(resolve(null, null, "15", "PERCENT"), { amount: null, percent: "15", inputMode: "PERCENT" });
assert.deepEqual(resolve("0", "53000000", null, "AMOUNT"), { amount: null, percent: null, inputMode: "AMOUNT" });
