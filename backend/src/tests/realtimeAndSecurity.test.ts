import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import { io as connect, type Socket } from "socket.io-client";
import type { Server } from "socket.io";
import { initSocket } from "../config/socket";
import { config, token } from "./helpers";
let server: http.Server;
let io: Server;
let url: string;
const clients: Socket[] = [];
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });
beforeAll(async () => {
  server = http.createServer();
  io = initSocket(server, config, async () => {});
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
afterEach(() => { for (const client of clients.splice(0)) client.disconnect(); });
afterAll(async () => { await new Promise<void>(resolve => io.close(() => resolve())); });
function client(auth?: object, origin = config.CLIENT_URL) {
  const socket = connect(url, { auth, transports: ["websocket"], reconnection: false, autoConnect: false,
    extraHeaders: { Origin: origin }, timeout: 1500 });
  clients.push(socket); return socket;
}
function connected(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect();
  });
}
describe("real Socket.IO authorization", () => {
  it("rejects private consultation rooms for guests", async () => {
    const socket = client(); await connected(socket);
    const response = await socket.timeout(1500).emitWithAck("join:consultation", "someone-elses-id");
    expect(response.error.code).toBe("UNAUTHENTICATED");
    expect(io.of("/").adapter.rooms.has("consultation:someone-elses-id")).toBe(false);
    const rooms = io.of("/").sockets.get(socket.id!)!.rooms;
    expect([...rooms]).toEqual([socket.id]);
  });
  it.each(["USER", "ADMIN"] as const)("fails closed for %s until ownership policy exists", async role => {
    const socket = client({ token: token(role) }); await connected(socket);
    const response = await socket.timeout(1500).emitWithAck("join:consultation", "private");
    expect(response.error.code).toBe("FORBIDDEN");
    expect(io.of("/").adapter.rooms.has("consultation:private")).toBe(false);
    const rooms = io.of("/").sockets.get(socket.id!)!.rooms;
    expect(rooms.has("user:test-user")).toBe(true);
    expect(rooms.has("room:admins")).toBe(role === "ADMIN");
  });
  it("rejects malformed/expired tokens", async () => {
    for (const value of ["not-a-token", token("USER", -1), 123]) await expect(connected(client({ token: value }))).rejects.toThrow();
  });
  it("rejects an untrusted origin even for websocket-only clients", async () => {
    await expect(connected(client(undefined, "https://evil.test"))).rejects.toThrow();
  });
  it("disconnects an authenticated socket when its JWT expires", async () => {
    const socket = client({ token: token("USER", 2) });
    await connected(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("expired socket was not disconnected")), 3000);
      socket.once("disconnect", () => { clearTimeout(timer); resolve(); });
    });
    expect(socket.connected).toBe(false);
  });
});
