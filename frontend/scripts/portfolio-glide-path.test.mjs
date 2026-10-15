import { test } from "node:test";
import assert from "node:assert/strict";
import { portfolioGlideYears, portfolioGlideWeights, portfolioAssetLabel } from "../src/utils/portfolioGlidePath.ts";

const points = [
  { yearsToAnchor: 15, allocations: [{ assetClass: "CASH", weightPercent: "20" }, { assetClass: "EQUITY", weightPercent: "80" }] },
  { yearsToAnchor: 0, allocations: [{ assetClass: "CASH", weightPercent: "80" }, { assetClass: "EQUITY", weightPercent: "20" }] },
  { yearsToAnchor: 5, allocations: [{ assetClass: "CASH", weightPercent: "60" }, { assetClass: "EQUITY", weightPercent: "40" }] },
];

test("whole years follow the engine at month boundaries, across years and outside the path", () => {
  for (const [start, anchor, expected] of [
    ["2026-10", "2027-09", 0], ["2026-10", "2027-10", 1], ["2026-10", "2027-11", 1],
    ["2026-12", "2028-01", 1], ["2026-10", "2026-10", 0], ["2026-10", "2025-09", 0],
    ["2026-10", "2041-10", 15], ["2026-10", "2070-10", 15],
  ]) assert.equal(portfolioGlideYears(points, start, anchor), expected);
});

test("unknown or invalid months and empty points never invent a current position", () => {
  for (const month of [undefined, "", "2026-00", "2026-13", "2026-1", "invalid"]) {
    assert.equal(portfolioGlideYears(points, "2026-10", month), null);
  }
  assert.equal(portfolioGlideYears(points, "", "2040-10"), null);
  assert.equal(portfolioGlideYears([], "2026-10", "2040-10"), null);
});

test("display interpolation respects exact points, both intervals, clamping and source order", () => {
  const before = structuredClone(points);
  for (const [years, cash] of [[0, 80], [2, 72], [5, 60], [10, 40], [15, 20], [25, 20], [-1, 80]]) {
    const result = portfolioGlideWeights(points, years);
    assert.equal(Number(result[0].weightPercent), cash);
    assert.equal(result.reduce((sum, a) => sum + Number(a.weightPercent), 0), 100);
  }
  assert.deepEqual(points, before);
  assert.deepEqual(portfolioGlideWeights([], 2), []);
});

test("asset labels use assumption labels, localized known groups and code fallback", () => {
  assert.equal(portfolioAssetLabel("CASH", "vi", { CASH: "Nhãn từ bộ giả định" }), "Nhãn từ bộ giả định");
  assert.equal(portfolioAssetLabel("CASH", "en", {}), "Deposits & cash");
  for (const code of ["CASH", "GOV_BOND", "EQUITY", "GOLD"]) {
    assert.notEqual(portfolioAssetLabel(code, "vi", {}), code);
    assert.notEqual(portfolioAssetLabel(code, "en", {}), code);
  }
  assert.equal(portfolioAssetLabel("NEW_ASSET", "en", {}), "NEW_ASSET");
  assert.equal(portfolioAssetLabel("NEW_ASSET", "vi", { NEW_ASSET: "Nhóm mới" }), "Nhóm mới");
});
