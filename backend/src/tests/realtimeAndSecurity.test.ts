import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import request from "supertest";
import { createApp } from "../app";
import { initSocket, getIO } from "../config/socket";
import {
  generalLimiter,
  authLimiter,
  aiLimiter,
  uploadLimiter,
  consultationLimiter,
} from "../middlewares/rateLimiter";

describe("Real-time & Security Suite", () => {
  let server: http.Server;
  const app = createApp();

  beforeAll(() => {
    server = http.createServer(app);
    initSocket(server);
  });

  afterAll((done) => {
    const io = getIO();
    io.close(() => {
      server.close(done);
    });
  });

  it("verifies health check endpoint returns Socket.io status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.realtime).toBe("Socket.IO enabled");
  });

  it("verifies rate limiters are properly configured", () => {
    expect(generalLimiter).toBeDefined();
    expect(authLimiter).toBeDefined();
    expect(aiLimiter).toBeDefined();
    expect(uploadLimiter).toBeDefined();
    expect(consultationLimiter).toBeDefined();
  });

  it("verifies socket instance is initialized and accessible via getIO()", () => {
    const io = getIO();
    expect(io).toBeDefined();
    expect(typeof io.on).toBe("function");
    expect(typeof io.emit).toBe("function");
  });
});
