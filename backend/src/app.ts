import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middlewares/errorHandler";
import {
  generalLimiter,
  authLimiter,
  aiLimiter,
  uploadLimiter,
  consultationLimiter,
} from "./middlewares/rateLimiter";

export function createApp(): Express {
  const app = express();

  // Bật trust proxy khi chạy trên Azure App Service / Nginx / Cloudflare
  // để rate limiter nhận diện đúng IP thật của client từ header `x-forwarded-for`
  app.set("trust proxy", 1);

  // Security Headers
  app.use(helmet());

  // CORS config
  const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://localhost:3000",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
          callback(null, true);
        } else {
          callback(new Error("CORS Policy Violation: Origin not allowed"));
        }
      },
      credentials: true,
    })
  );

  // Áp dụng Rate Limiting chung cho toàn bộ API
  app.use("/api", generalLimiter);

  // Body Parsing
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  // Health Check Endpoint (dùng cho Azure Web App Health Probe và Load Balancer)
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "healthy",
      service: "An Huu Financial Planning Backend API",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      version: "1.0.0",
      realtime: "Socket.IO enabled",
      environment: process.env.NODE_ENV || "development",
    });
  });

  // Export rate limiters cho các router gắn riêng:
  // app.use("/api/auth", authLimiter, authRoutes);
  // app.use("/api/ai", aiLimiter, aiRoutes);
  // app.use("/api/upload", uploadLimiter, uploadRoutes);
  // app.use("/api/consultations", consultationLimiter, consultationRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
}

export { authLimiter, aiLimiter, uploadLimiter, consultationLimiter };
