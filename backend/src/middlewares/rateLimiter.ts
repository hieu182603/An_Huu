import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { AppError } from "../common/errors";
import type { AppConfig } from "../config/env";
import { verifyAccessToken, type AuthenticatedRequest } from "./authMiddleware";

// Behind Vercel -> Azure the socket peer is a proxy unless TRUST_PROXY_HOPS
// matches the verified hop count, so IP keys can collapse every user into one
// bucket. Signed-in requests are therefore keyed by the verified JWT subject;
// only anonymous requests (or invalid tokens) fall back to the IP.
export function rateLimitKey(req: Request, config?: AppConfig): string {
  const user = (req as AuthenticatedRequest).user;
  if (user?.userId) return `user:${user.userId}`;
  if (config) {
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "");
    if (match) try { return `user:${verifyAccessToken(match[1], config).userId}`; } catch { /* anonymous */ }
  }
  return `ip:${req.ip ?? "unknown"}`;
}
export function createLimiter(windowMs: number, max: number, config?: AppConfig) {
  return rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => rateLimitKey(req, config),
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.")),
  });
}
// Mounted before authentication, so it verifies the Bearer token itself.
export const createGeneralLimiter = (config: AppConfig) => createLimiter(15 * 60 * 1000, 300, config);
export const authLimiter = createLimiter(15 * 60 * 1000, process.env.NODE_ENV === "production" ? 10 : 500);
export const aiLimiter = createLimiter(60 * 1000, 15);
export const uploadLimiter = createLimiter(15 * 60 * 1000, 20);
export const consultationLimiter = createLimiter(60 * 60 * 1000, 5);
