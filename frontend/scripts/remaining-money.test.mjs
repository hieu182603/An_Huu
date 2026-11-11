import{test}from"node:test";
import assert from"node:assert/strict";
import{formatMoneyDecimal as money}from"../src/utils/moneyDisplay.ts";
test("money display keeps huge integers and cents in both languages",()=>{assert.equal(money("9007199254740993.01"),"9.007.199.254.740.993,01 ₫");assert.equal(money("9007199254740993.01",true),"9,007,199,254,740,993.01 ₫");});
test("money display rounds at cents without float loss or negative zero",()=>{assert.equal(money("9999999999999999.995"),"10.000.000.000.000.000 ₫");assert.equal(money("-1.005"),"-1,01 ₫");assert.equal(money("-0.001"),"0 ₫");assert.equal(money("1000000.50"),"1.000.000,5 ₫");});
test("missing and invalid money stay undetermined while known zero remains zero",()=>{assert.equal(money(null),"Chưa xác định");assert.equal(money("bad"),"Chưa xác định");assert.equal(money("0"),"0 ₫");});
