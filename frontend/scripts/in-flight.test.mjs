import { test } from "node:test";
import assert from "node:assert/strict";
import { shareInFlight } from "../src/utils/inFlight.ts";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("identical in-flight requests share one call; settled calls are not cached", async () => {
  let calls = 0; const gate = deferred();
  const start = () => { calls++; return gate.promise; };
  const a = shareInFlight("k", undefined, start), b = shareInFlight("k", new AbortController().signal, start);
  const other = shareInFlight("other", undefined, () => { calls++; return Promise.resolve("x"); });
  gate.resolve("result");
  assert.deepEqual(await Promise.all([a, b, other]), ["result", "result", "x"]);
  assert.equal(calls, 2);
  await shareInFlight("k", undefined, () => { calls++; return Promise.resolve("again"); });
  assert.equal(calls, 3);
});

test("one caller aborting keeps the shared call for the others", async () => {
  const gate = deferred(); let shared;
  const start = signal => { shared = signal; return gate.promise; };
  const first = new AbortController(), second = new AbortController();
  const a = shareInFlight("k2", first.signal, start), b = shareInFlight("k2", second.signal, start);
  first.abort();
  await assert.rejects(a);
  assert.equal(shared.aborted, false);
  gate.resolve("ok");
  assert.equal(await b, "ok");
});

test("the shared call is aborted only when every caller aborted", async () => {
  let shared;
  const start = signal => { shared = signal; return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))); };
  const first = new AbortController(), second = new AbortController();
  const a = shareInFlight("k3", first.signal, start), b = shareInFlight("k3", second.signal, start);
  first.abort(); second.abort();
  await assert.rejects(a); await assert.rejects(b);
  assert.equal(shared.aborted, true);
  let calls = 0;
  await shareInFlight("k3", undefined, () => { calls++; return Promise.resolve("fresh"); });
  assert.equal(calls, 1);
});
