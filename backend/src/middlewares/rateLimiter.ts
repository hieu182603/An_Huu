import rateLimit from "express-rate-limit";
import { AppError } from "../common/errors";

export function createLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.")),
  });
}
export const generalLimiter = createLimiter(15 * 60 * 1000, 300);
export const authLimiter = createLimiter(15 * 60 * 1000, process.env.NODE_ENV === "production" ? 10 : 500);
export const aiLimiter = createLimiter(60 * 1000, 15);
export const uploadLimiter = createLimiter(15 * 60 * 1000, 20);
export const consultationLimiter = createLimiter(60 * 60 * 1000, 5);
