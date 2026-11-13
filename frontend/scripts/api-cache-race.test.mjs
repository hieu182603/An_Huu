import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticatedRequest, clearAccessToken } from "../src/services/api.ts";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const response = data => new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });

test("a late pre-save GET cannot refill the profile cache or be shared by a post-save read", async () => {
  const originalFetch = globalThis.fetch;
  const old = deferred(), fresh = deferred(), started = deferred();
  const pending = [];
  let reads = 0;
  clearAccessToken();
  globalThis.fetch = async (_url, options) => {
    if (options.method === "PATCH") return response({ revision: 2 });
    reads++;
    if (reads === 1) { started.resolve(); return old.promise; }
    return fresh.promise;
  };
  try {
    const pendingOld = authenticatedRequest("/me/financial-profile");
    pending.push(pendingOld);
    await started.promise;
    await authenticatedRequest("/me/financial-profile", { expectedRevision: 1 }, "PATCH");
    const pendingFresh = authenticatedRequest("/me/financial-profile");
    pending.push(pendingFresh);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 2, "a read after saving must not join an obsolete request");
    fresh.resolve(response({ revision: 2 }));
    assert.deepEqual(await pendingFresh, { revision: 2 });
    old.resolve(response({ revision: 1 }));
    await pendingOld;
    assert.deepEqual(await authenticatedRequest("/me/financial-profile"), { revision: 2 });
    assert.equal(reads, 2);
  } finally {
    old.resolve(response({ revision: 1 })); fresh.resolve(response({ revision: 2 }));
    await Promise.allSettled(pending);
    globalThis.fetch = originalFetch; clearAccessToken();
  }
});

test("a skip-cache GET started before a save cannot replace the saved revision", async () => {
  const originalFetch = globalThis.fetch, old = deferred(), started = deferred();
  let reads = 0;
  clearAccessToken();
  globalThis.fetch = async (_url, options) => {
    if (options.method === "PATCH") return response({ revision: 2 });
    reads++;
    if (reads === 1) { started.resolve(); return old.promise; }
    return response({ revision: 2 });
  };
  try {
    const pendingOld = authenticatedRequest("/me/financial-profile", undefined, "GET", undefined, { skipCache: true });
    await started.promise;
    await authenticatedRequest("/me/financial-profile", {}, "PATCH");
    assert.deepEqual(await authenticatedRequest("/me/financial-profile"), { revision: 2 });
    old.resolve(response({ revision: 1 }));
    await pendingOld;
    assert.deepEqual(await authenticatedRequest("/me/financial-profile"), { revision: 2 });
  } finally { old.resolve(response({ revision: 1 })); globalThis.fetch = originalFetch; clearAccessToken(); }
});

test("a notification write and read-only preview keep unrelated in-flight profile reads shared", async () => {
  const originalFetch = globalThis.fetch, gate = deferred(), started = deferred();
  let reads = 0;
  clearAccessToken();
  globalThis.fetch = async (_url, options) => {
    if (options.method === "POST") return response({ ok: true });
    reads++; started.resolve(); return gate.promise;
  };
  try {
    const first = authenticatedRequest("/me/financial-profile");
    await started.promise;
    await authenticatedRequest("/me/notifications/n1/read", {}, "POST");
    await authenticatedRequest("/me/retirement/preview", {}, "POST");
    const second = authenticatedRequest("/me/financial-profile");
    gate.resolve(response({ revision: 1 }));
    assert.deepEqual(await Promise.all([first, second]), [{ revision: 1 }, { revision: 1 }]);
    assert.equal(reads, 1);
  } finally { gate.resolve(response({ revision: 1 })); globalThis.fetch = originalFetch; clearAccessToken(); }
});

test("an opted-in read-only POST is cached by its body and cleared by a profile write", async () => {
  const originalFetch = globalThis.fetch;
  let computes = 0;
  clearAccessToken();
  globalThis.fetch = async (_url, options) => {
    if (options.method === "PATCH") return response({ revision: 2 });
    computes++;
    return response({ input: JSON.parse(options.body), run: computes });
  };
  const preview = body => authenticatedRequest("/me/retirement/preview?adjustments=skip", body, "POST", undefined, { cacheReadOnlyPost: true });
  try {
    assert.deepEqual(await preview({ a: 1 }), { input: { a: 1 }, run: 1 });
    assert.deepEqual(await preview({ a: 1 }), { input: { a: 1 }, run: 1 }, "same input reuses the result");
    assert.deepEqual(await preview({ a: 2 }), { input: { a: 2 }, run: 2 }, "a different input is computed");
    await authenticatedRequest("/me/financial-profile", {}, "PATCH");
    assert.deepEqual(await preview({ a: 1 }), { input: { a: 1 }, run: 3 }, "a profile write makes previews stale");
    await authenticatedRequest("/me/retirement/preview?adjustments=skip", { a: 1 }, "POST");
    assert.equal(computes, 4, "without the option a POST is never served from cache");
  } finally { globalThis.fetch = originalFetch; clearAccessToken(); }
});
