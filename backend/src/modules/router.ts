import { Router, type RequestHandler, type Response } from "express";
import { parse as parseCookie } from "cookie";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { AppConfig } from "../config/env";
import { isAllowedOrigin } from "../config/cors";
import { AppError } from "../common/errors";
import { asyncHandler, validate, sendData } from "../common/http";
import { createAuthenticate, requireRole, type AuthenticatedRequest } from "../middlewares/authMiddleware";
import { authLimiter } from "../middlewares/rateLimiter";
import { AuthService, tokenHash } from "./auth/service";
import { registerSchema, loginSchema, emailRequestSchema, verifySchema, resetSchema, emptySchema } from "./auth/schema";
import { ProfileService } from "./profiles/service";
import { patchAccountSchema, patchProfileSchema, draftSchema, completeSchema } from "./profiles/schema";

export type Services = { auth: AuthService; profiles: ProfileService };
export function sessionGuard(auth: AuthService): RequestHandler {
  return asyncHandler(async (req: AuthenticatedRequest, res, next) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập.");
    res.locals.user = await auth.validateSession(req.user);
    next();
  });
}
export function createApiRouter(services: Services, config: AppConfig) {
  const router = Router();
  const { auth, profiles } = services;
  const cookieName = config.NODE_ENV === "production" ? "__Host-anhuu_refresh" : "anhuu_refresh";
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: config.COOKIE_SAME_SITE, path: "/" } as const;
  const authenticated = [createAuthenticate(config), sessionGuard(auth)];
  const accountLimiter = rateLimit({
    windowMs: 15 * 60000, limit: 5, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => tokenHash(String(req.body.email)),
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Vui lòng chờ trước khi thử lại.")),
  });
  const cookieCsrf: RequestHandler = (req, _res, next) => {
    if (!req.headers.origin || !isAllowedOrigin(req.headers.origin, config) || req.get("X-CSRF-Protection") !== "1")
      return next(new AppError(403, "CSRF_REJECTED", "Yêu cầu xác thực nguồn truy cập."));
    next();
  };
  function refreshCookie(req: AuthenticatedRequest) {
    const value = parseCookie(req.headers.cookie ?? "")[cookieName];
    if (!value || !/^[a-zA-Z0-9_-]{43}$/.test(value)) throw new AppError(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập.");
    return value;
  }
  function sendSession(res: Response, session: Awaited<ReturnType<AuthService["refresh"]>>) {
    res.cookie(cookieName, session.refreshToken, {
      ...cookieOptions, ...(session.persistent ? { expires: session.expiresAt } : {}),
    });
    res.setHeader("Cache-Control", "no-store");
    sendData(res, { accessToken: session.accessToken, tokenType: "Bearer", user: session.user });
  }
  router.post("/auth/register", authLimiter, validate(registerSchema), accountLimiter, asyncHandler(async (req, res) => sendData(res, await auth.register(req.body), 202)));
  router.post("/auth/verify-email", authLimiter, validate(verifySchema), accountLimiter, asyncHandler(async (req, res) => sendData(res, await auth.verifyEmail(req.body.email, req.body.otp))));
  router.post("/auth/resend-verification", authLimiter, validate(emailRequestSchema), accountLimiter, asyncHandler(async (req, res) => sendData(res, await auth.requestEmail(req.body.email, "EMAIL_VERIFICATION"), 202)));
  router.post("/auth/forgot-password", authLimiter, validate(emailRequestSchema), accountLimiter, asyncHandler(async (req, res) => sendData(res, await auth.requestEmail(req.body.email, "PASSWORD_RESET"), 202)));
  router.post("/auth/reset-password", authLimiter, validate(resetSchema), asyncHandler(async (req, res) => sendData(res, await auth.resetPassword(req.body.token, req.body.password))));
  router.post("/auth/login", authLimiter, validate(loginSchema), accountLimiter, asyncHandler(async (req, res) => sendSession(res, await auth.login(req.body))));
  router.post("/auth/refresh", cookieCsrf, validate(emptySchema), asyncHandler(async (req, res) => {
    try { sendSession(res, await auth.refresh(refreshCookie(req))); }
    catch (error) { if (error instanceof AppError && error.status === 401) res.clearCookie(cookieName, cookieOptions); throw error; }
  }));
  router.post("/auth/logout", cookieCsrf, validate(emptySchema), asyncHandler(async (req, res) => {
    const result = await auth.logout(refreshCookie(req));
    res.clearCookie(cookieName, cookieOptions); sendData(res, result);
  }));
  router.get("/auth/me", ...authenticated, (_req, res) => { res.setHeader("Cache-Control", "no-store"); sendData(res, res.locals.user); });
  router.post("/auth/logout-all", ...authenticated, validate(emptySchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await auth.logoutAll(req.user!.userId);
    res.clearCookie(cookieName, cookieOptions); sendData(res, result);
  }));
  router.use("/me", ...authenticated, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.get("/me", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await profiles.getAccount(req.user!.userId))));
  router.patch("/me", validate(patchAccountSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await profiles.patchAccount(req.user!.userId, req.body))));
  router.use("/me/financial-profile", requireRole("USER"));
  router.get("/me/financial-profile", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await profiles.getProfile(req.user!.userId))));
  router.patch("/me/financial-profile", validate(patchProfileSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await profiles.patchProfile(req.user!.userId, req.body.expectedRevision, req.body.changes))));
  router.use("/me/onboarding-draft", requireRole("USER"));
  router.get("/me/onboarding-draft", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await profiles.getDraft(req.user!.userId))));
  router.put("/me/onboarding-draft", validate(draftSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await profiles.saveDraft(req.user!.userId, req.body.expectedRevision, req.body.step, req.body.data))));
  router.post("/me/onboarding/complete", requireRole("USER"), validate(completeSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const key = z.string().uuid().parse(req.get("Idempotency-Key"));
    sendData(res, await profiles.complete(req.user!.userId, req.body, key));
  }));
  return router;
}
