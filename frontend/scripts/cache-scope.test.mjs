import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheInvalidationScope, cacheKeyInScope } from "../src/services/api.ts";

const stale = (method, path, keys) => {
  const scope = cacheInvalidationScope(method, path);
  return scope === null ? keys : keys.filter(key => scope.some(s => cacheKeyInScope(key, s)));
};
const keys = ["/me|{}", "/me/notifications?limit=1|{}", "/me/notifications?page=1&limit=25|{}", "/me/retirement/plans?page=1&limit=50|{}",
  "/me/retirement/plans/p1|{}", "/me/retirement/plans/p1/versions?page=1&limit=50|{}", "/me/financial-profile|{}", "/me/ai/conversations|{}", "/me/assumptions|{}"];

test("read-only POSTs keep every cached GET", () => {
  for (const path of ["/me/retirement/preview", "/me/retirement/pension-impact", "/me/retirement/plans/p1/versions/v1/simulate", "/me/retirement/plans/p1/compare", "/me/debts/preview", "/me/ai/simulate", "/me/explanations/metric", "/me/product-tools/deposit/preview", "/me/product-tools/bond/preview", "/me/portfolio-policies/workspace/preview", "/me/retirement/plans/p1/versions/v1/replay", "/me/retirement/risk/rebalance", "/me/retirement/risk/simulation", "/me/retirement/risk/scenarios", "/me/retirement/risk/selection"])
    assert.deepEqual(stale("POST", path, keys), [], path);
});
test("marking notifications read only drops notification lists", () => {
  assert.deepEqual(stale("POST", "/me/notifications/n1/read", keys), ["/me/notifications?limit=1|{}", "/me/notifications?page=1&limit=25|{}"]);
});
test("plan writes drop plan and AI caches but keep profile and notifications", () => {
  assert.deepEqual(stale("POST", "/me/retirement/plans/p1/apply", keys),
    ["/me/retirement/plans?page=1&limit=50|{}", "/me/retirement/plans/p1|{}", "/me/retirement/plans/p1/versions?page=1&limit=50|{}", "/me/ai/conversations|{}"]);
});
test("profile writes also drop plans (server marks them stale)", () => {
  const dropped = stale("PATCH", "/me/financial-profile", keys);
  assert.ok(dropped.includes("/me/financial-profile|{}") && dropped.includes("/me/retirement/plans/p1|{}"));
  assert.ok(!dropped.includes("/me/notifications?limit=1|{}") && !dropped.includes("/me|{}"));
});
test("account writes match /me exactly, unknown writes clear everything", () => {
  assert.deepEqual(stale("PATCH", "/me", keys), ["/me|{}"]);
  assert.equal(cacheInvalidationScope("POST", "/auth/change-password"), null);
  assert.equal(cacheInvalidationScope("PATCH", "/admin/assumptions/a1"), null);
  assert.ok(!cacheKeyInScope("/me/retirement-other|{}", "/me/retirement"));
});

test("discovery writes refresh owned bookmarks or consultation tickets and keep financial caches", () => {
  const discoveryKeys = [...keys, "/me/saved-products|{}", "/me/saved-articles|{}", "/me/saved-content?kind=ARTICLE|{}", "/me/support?page=1|{}"];
  assert.deepEqual(stale("PUT", "/me/saved-products/product-1", discoveryKeys), ["/me/saved-products|{}"]);
  assert.deepEqual(stale("DELETE", "/me/saved-articles/article-1", discoveryKeys), ["/me/saved-articles|{}", "/me/saved-content?kind=ARTICLE|{}"]);
  assert.deepEqual(stale("POST", "/me/products/product-1/consult", discoveryKeys), ["/me/support?page=1|{}"]);
});
