import express, { type Express, type Router } from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middlewares/errorHandler";
import { generalLimiter } from "./middlewares/rateLimiter";
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
  app.use("/api", generalLimiter);
  app.use("/api/v1", options.apiRouter ?? createApiRouter(options.services ?? createServices(prisma, config), config));
  app.use(notFound, errorHandler);
  return app;
}
export { authLimiter, aiLimiter, uploadLimiter, consultationLimiter } from "./middlewares/rateLimiter";
