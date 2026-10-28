import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { requestContext, routeOf } from "../common/http";
import { watchEventLoop } from "../common/event-loop";

const logged = (spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> => spy.mock.calls.map(c => JSON.parse(String(c[0])));
const app = () => express().use(requestContext)
  .get("/api/v1/plans/:id", (_req, res) => { res.json({ ok: true }); })
  .get("/hang", () => {});

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("request logging", () => {
  it("logs the route without query string or ids", async () => {
    expect(routeOf("/api/v1/plans/0f8fad5b-d9cb-469f-a165-70867728950e/versions?token=x")).toBe("/api/v1/plans/:id/versions");
    await request(app()).get("/api/v1/plans/0f8fad5b-d9cb-469f-a165-70867728950e?email=a@b.c");
    await vi.waitFor(() => expect(logged(vi.mocked(console.info))).toContainEqual(
      expect.objectContaining({ event: "http.request", method: "GET", route: "/api/v1/plans/:id", statusCode: 200 })));
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("a@b.c");
  });
  it("logs a request whose client gave up as http.aborted", async () => {
    const server = http.createServer(app()).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const client = http.get(`http://127.0.0.1:${(server.address() as AddressInfo).port}/hang`);
    client.on("error", () => {});
    await new Promise(resolve => setTimeout(resolve, 50));
    client.destroy();
    await vi.waitFor(() => expect(logged(vi.mocked(console.warn))).toContainEqual(
      expect.objectContaining({ level: "warn", event: "http.aborted", route: "/hang" })));
    server.close();
  });
});

describe("event loop watchdog", () => {
  it("reports how long the loop was blocked", async () => {
    const stop = watchEventLoop({ thresholdMs: 100, intervalMs: 20 });
    const until = Date.now() + 250;
    while (Date.now() < until) { /* block the loop */ }
    await vi.waitFor(() => expect(logged(vi.mocked(console.warn))).toContainEqual(expect.objectContaining({ event: "eventloop.blocked" })));
    stop();
    expect(logged(vi.mocked(console.warn)).find(l => l.event === "eventloop.blocked")?.durationMs).toBeGreaterThanOrEqual(100);
  });
});
