import express, { type Express, type Router } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { createErrorHandler } from "./middlewares/errorHandler";
import { createGeneralLimiter } from "./middlewares/rateLimiter";
import { serverTiming } from "./common/timing";
import { loadEnv, type AppConfig } from "./config/env";
import { corsOptions } from "./config/cors";
import { asyncHandler, notFound, requestContext, sendData } from "./common/http";
import { createReadinessCheck } from "./common/health";
import { AppError } from "./common/errors";
import { createApiRouter, type Services } from "./modules/router";
import { createServices } from "./modules/services";
import { prisma } from "./config/prisma";
export type AppOptions = { config?: AppConfig; databaseProbe?: () => Promise<unknown>; apiRouter?: Router; services?: Services };
export function createApp(options: AppOptions = {}): Express {
  const config = options.config ?? loadEnv();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY_HOPS === 0 ? false : config.TRUST_PROXY_HOPS);
  app.locals.draining = false;
  app.use(requestContext, helmet(), cors(corsOptions(config)));
  // Socket.IO is attached to the HTTP server, not Express; SSE must stream unbuffered.
  app.use(compression({ filter: (req, res) => !req.path.startsWith("/socket.io") &&
    !String(req.headers.accept ?? "").includes("text/event-stream") && compression.filter(req, res) }));
  for (const route of ["/me/retirement/plans", "/me/retirement/preview", "/me/financial-profile"])
    app.use(`/api/v1${route}`, serverTiming(route));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "2mb" }));
  const probe = options.databaseProbe ?? (async () => {
    const { prisma } = await import("./config/prisma");
    await prisma.$queryRaw`SELECT 1`;
  });
  const readiness = createReadinessCheck(probe, config.HEALTH_TIMEOUT_MS);
  app.get("/health/live", (_req, res) => sendData(res, { status: "alive" }));
  app.get("/health/ready", asyncHandler(async (_req, res) => {
    if (app.locals.draining) throw new AppError(503, "NOT_READY", "Dịch vụ chưa sẵn sàng.");
    await readiness();
    sendData(res, { status: "ready" });
  }));
  // Legacy endpoints are liveness only.
  app.get("/health", (_req, res) => res.json({ status: "healthy", service: "An Huu Financial Planning Backend API", timestamp: new Date().toISOString(), uptime: process.uptime() }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok", version: "1.0.0", realtime: "Socket.IO enabled", environment: config.NODE_ENV }));
  app.use("/api", createGeneralLimiter(config));
  const services = options.services ?? (options.apiRouter ? undefined : createServices(prisma, config));
  app.use("/api/v1", options.apiRouter ?? createApiRouter(services!, config));
  const settings = services?.settings;
  app.use(notFound, createErrorHandler(settings ? data => settings.recordSystemLog(data) : undefined));
  return app;
}
export { authLimiter, aiLimiter, uploadLimiter, consultationLimiter } from "./middlewares/rateLimiter";
