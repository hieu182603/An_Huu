import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canPayStatement, daysUntil, formatCountdown, formatPeriod, formatVnDate, formatVnd, needsAssetDeclaration,
  nextVnPeriod, orderView, secondsLeft, toBaseAmount,
} from "../src/services/billingFormat.ts";

test("period and money formatting", () => {
  assert.equal(formatPeriod("2026-11"), "11/2026");
  assert.equal(formatPeriod(null), "");
  assert.equal(formatVnd(1234567), "1.234.567 ₫");
  assert.equal(formatVnd("1500000.49"), "1.500.000 ₫");
  assert.equal(formatVnd("1500000.5"), "1.500.001 ₫");
  assert.equal(formatVnd(0), "0 ₫");
  assert.equal(formatVnd(null), "—");
});

test("dates use Vietnam time", () => {
  // 17:30 UTC on 30 Nov is already 1 Dec in Vietnam.
  assert.equal(formatVnDate("2026-11-30T17:30:00.000Z"), "01/12/2026");
  assert.equal(nextVnPeriod(Date.parse("2026-11-30T17:30:00.000Z")), "2027-01");
  assert.equal(nextVnPeriod(Date.parse("2026-11-19T05:00:00.000Z")), "2026-12");
  assert.equal(daysUntil("2026-11-24T05:00:00.000Z", Date.parse("2026-11-19T20:00:00.000Z")), 4);
  assert.equal(daysUntil("2026-11-18T05:00:00.000Z", Date.parse("2026-11-19T05:00:00.000Z")), -1);
});

test("countdown never goes negative", () => {
  const now = Date.parse("2026-11-19T00:00:00.000Z");
  assert.equal(secondsLeft("2026-11-19T00:02:05.000Z", now), 125);
  assert.equal(secondsLeft("2026-11-18T23:59:00.000Z", now), 0);
  assert.equal(secondsLeft(null, now), 0);
  assert.equal(formatCountdown(125), "02:05");
  assert.equal(formatCountdown(-3), "00:00");
});

test("payable statements and asset hint issues", () => {
  assert.equal(canPayStatement({ status: "ISSUED", amountDueVnd: 100 }), true);
  assert.equal(canPayStatement({ status: "OVERDUE", amountDueVnd: 100 }), true);
  assert.equal(canPayStatement({ status: "PAID", amountDueVnd: 0 }), false);
  assert.equal(canPayStatement({ status: "ISSUED", amountDueVnd: 0 }), false);
  assert.equal(canPayStatement(null), false);
  assert.equal(needsAssetDeclaration(["ASSETS_UNKNOWN"]), true);
  assert.equal(needsAssetDeclaration(["SOMETHING_ELSE"]), false);
  assert.equal(needsAssetDeclaration(undefined), false);
});

test("estimate base is a whole non-negative VND string", () => {
  assert.equal(toBaseAmount(1500000.9), "1500000");
  assert.equal(toBaseAmount("2000000.75"), "2000000");
  assert.equal(toBaseAmount(0), "0");
  assert.equal(toBaseAmount(-5), null);
  assert.equal(toBaseAmount(Number.NaN), null);
  assert.equal(toBaseAmount(""), null);
});

test("result page states", () => {
  assert.equal(orderView("PAID", 1), "paid");
  assert.equal(orderView("UNDERPAID", 3), "underpaid");
  assert.equal(orderView("EXPIRED", 1), "retry");
  assert.equal(orderView("CANCELLED", 1), "retry");
  assert.equal(orderView("PENDING", 5), "waiting");
  assert.equal(orderView("PENDING", 20), "late");
  assert.equal(orderView(undefined, 0), "waiting");
});
