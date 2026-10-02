import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { loadEnv, type AppConfig } from "../config/env";
import { AppError } from "../common/errors";
const claimsSchema = z.object({
  userId: z.string().min(1).max(128), email: z.string().email(), role: z.enum(["USER", "ADMIN"]),
  exp: z.number().int().positive(), iat: z.number().int().nonnegative(),
  securityVersion: z.number().int().nonnegative().default(0), sessionId: z.string().uuid().optional(),
});
export type TokenPayload = z.infer<typeof claimsSchema>;
export interface AuthenticatedRequest extends Request { user?: TokenPayload }
export function verifyAccessToken(token: string, config: AppConfig): TokenPayload {
  try {
    return claimsSchema.parse(jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"], issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE,
    }));
  } catch { throw new AppError(401, "UNAUTHENTICATED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."); }
}
export function createAuthenticate(config: AppConfig): RequestHandler {
  return (req: AuthenticatedRequest, _res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "");
    if (!match) return next(new AppError(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập."));
    try { req.user = verifyAccessToken(match[1], config); next(); } catch (error) { next(error); }
  };
}
export const authenticate: RequestHandler = (req, res, next) => createAuthenticate(loadEnv())(req, res, next);
export function requireRole(...roles: Array<"USER" | "ADMIN">): RequestHandler {
  return (req: AuthenticatedRequest, _res, next) => {
    if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập."));
    if (!roles.includes(req.user.role)) return next(new AppError(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này."));
    next();
  };
}
