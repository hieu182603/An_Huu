import { test } from "node:test";
import assert from "node:assert/strict";
import { socketOrigin } from "../src/services/socketOrigin.ts";

test("production builds behind Vercel do not open a socket without an absolute origin", () => {
  assert.equal(socketOrigin({ DEV: false, VITE_API_URL: "/api/v1" }), null);
  assert.equal(socketOrigin({ DEV: true, VITE_API_URL: "/api/v1" }), "/");
});
test("an explicit socket origin or absolute API origin is used", () => {
  assert.equal(socketOrigin({ DEV: false, VITE_SOCKET_URL: "https://api.example.test/" }), "https://api.example.test");
  assert.equal(socketOrigin({ DEV: false, VITE_API_URL: "https://api.example.test/api/v1" }), "https://api.example.test");
});
