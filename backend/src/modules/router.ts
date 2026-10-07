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
import { registerSchema, loginSchema, googleAuthSchema, emailRequestSchema, verifySchema, resetSchema, emptySchema, changePasswordSchema } from "./auth/schema";
import { uploadMedia, cloudinary } from "../config/cloudinary";
import { uploadLimiter } from "../middlewares/rateLimiter";
import { UsersService, userListSchema, userStatusSchema } from "./users/service";
import { ContentService, contentQuery, contentInput, contentUpdate } from "./content/service";
import { CommunityService, listQuery, ticketInput, replyInput, ticketStatusInput } from "./community/service";
import type { CatalogService } from "./catalog/service";
import { catalogRouter } from "./catalog/router";
import { notificationSettingsInput } from "./catalog/schema";
import { consultationLimiter } from "../middlewares/rateLimiter";
import { OperationsService, auditQuery } from "./operations/service";
import { SocketService } from "../services/socketService";

import { ProfileService } from "./profiles/service";
import { DebtService } from "./debts/service";
import { debtPreviewSchema } from "./debts/schema";
import { PensionsService } from "./pensions/service";
import { pensionPreviewSchema } from "./pensions/schema";
import type { InsuranceHistoryService } from "./pensions/history-service";
import type { LegalRulesService } from "./pensions/legal-service";
import { insuranceHistoryRouter, legalRulesRouter, pensionEstimatesRouter } from "./pensions/insurance-router";
import type { PensionEstimateService } from "./pensions/estimate-service";
import { RetirementService } from "./retirement/service";
import { retirementPreviewSchema } from "./retirement/schema";
import { PlansService } from "./plans/service";
import { plansRouter } from "./plans/router";
import { actualsRouter } from "./actuals/router";
import { aiRouter, knowledgeRouter } from "./ai/router";
import type { AiService } from "./ai/service";
import type { KnowledgeService } from "./ai/knowledge";
import type { ActualsService } from "./actuals/service";
import { AssumptionsService } from "./assumptions/service";
import { assumptionsRouter } from "./assumptions/router";
import { PortfoliosService } from "./portfolios/service";
import { portfoliosRouter } from "./portfolios/router";
import type { SystemSettingsService } from "./settings/service";
import { settingsRouter } from "./settings/router";
import { patchAccountSchema, patchProfileSchema, draftSchema, completeSchema } from "./profiles/schema";

export type Services = { auth: AuthService; profiles: ProfileService; pensionEstimates?: PensionEstimateService; insuranceHistory?: InsuranceHistoryService; legalRules?: LegalRulesService; catalog?: CatalogService; ai?: AiService; knowledge?: KnowledgeService; actuals?: ActualsService; plans?: PlansService; debts?: DebtService; pensions?: PensionsService; retirement?: RetirementService; assumptions?: AssumptionsService; portfolios?: PortfoliosService; users?: UsersService; content?: ContentService; community?: CommunityService; operations?: OperationsService; settings?: SystemSettingsService };
export function sessionGuard(auth: AuthService): RequestHandler {
  return asyncHandler(async (req: AuthenticatedRequest, res, next) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Yêu cầu đăng nhập.");
    res.locals.user = await auth.validateSession(req.user);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
}
export function createApiRouter(services: Services, config: AppConfig) {
  const router = Router();
  const { auth, profiles } = services;
  const cookieName = config.NODE_ENV === "production" ? "__Host-anhuu_refresh" : "anhuu_refresh";
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: config.COOKIE_SAME_SITE, path: "/" } as const;
  const authenticated = [createAuthenticate(config), sessionGuard(auth)];
  if (services.insuranceHistory) router.use("/me/pension/history", ...authenticated, requireRole("USER"), insuranceHistoryRouter(services.insuranceHistory));
  if (services.pensionEstimates) router.use("/me/pension", ...authenticated, requireRole("USER"), pensionEstimatesRouter(services.pensionEstimates));
  if (services.legalRules) router.use("/admin/legal-rules", ...authenticated, requireRole("ADMIN"), legalRulesRouter(services.legalRules));
  if (services.catalog) {
    router.use("/", catalogRouter(services.catalog));
    router.use("/admin", ...authenticated, requireRole("ADMIN"), catalogRouter(services.catalog, true));
  }
  if (services.knowledge) router.use("/admin/knowledge", ...authenticated, requireRole("ADMIN"), knowledgeRouter(services.knowledge));
  if (services.ai) router.use("/me/ai", ...authenticated, requireRole("USER"), aiRouter(services.ai));
  if (services.portfolios) {
    router.use("/admin/portfolio-policies", ...authenticated, requireRole("ADMIN"), portfoliosRouter(services.portfolios, true));
    router.use("/me/portfolio-policies", ...authenticated, requireRole("USER"), portfoliosRouter(services.portfolios, false));
  }
  if (services.assumptions) {
    router.use("/admin/assumptions", ...authenticated, requireRole("ADMIN"), assumptionsRouter(services.assumptions, true));
    router.use("/me/assumptions", ...authenticated, requireRole("USER"), assumptionsRouter(services.assumptions, false));
  }
  router.get("/admin/operations", ...authenticated, requireRole("ADMIN"), asyncHandler(async (_req, res) => sendData(res, await services.operations!.overview())));
  router.get("/admin/audit-logs", ...authenticated, requireRole("ADMIN"), asyncHandler(async (req, res) => {
    if (services.settings) {
      sendData(res, await services.settings.listAuditLogs(auditQuery.parse(req.query)));
    } else {
      sendData(res, await services.operations!.audit(auditQuery.parse(req.query)));
    }
  }));
  if (services.settings) {
    router.use("/admin/settings", ...authenticated, requireRole("ADMIN"), settingsRouter(services.settings));
  }
  router.post("/admin/notifications/broadcast", ...authenticated, requireRole("ADMIN"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim() : "Thông báo toàn hệ thống (Broadcast)";
    const message = typeof req.body?.message === "string" && req.body.message.trim() ? req.body.message.trim() : "Quản trị viên đã phát đi bản tin cập nhật tham số vận hành.";
    SocketService.broadcast("notification:broadcast", { title, message, timestamp: new Date().toISOString() });
    sendData(res, { broadcasted: true, title, message });
  }));
  const uuidParam = (id: unknown) => z.string().uuid().parse(id);
  const listParams = (query: unknown) => listQuery.parse(query);
  router.use("/admin/support", ...authenticated, requireRole("ADMIN"));
  router.get("/admin/support", asyncHandler(async (req, res) => sendData(res, await services.community!.tickets(null, listParams(req.query)))));
  router.get("/admin/support/:id", asyncHandler(async (req, res) => sendData(res, await services.community!.ticket(null, uuidParam(req.params.id)))));
  router.post("/admin/support/:id/messages", consultationLimiter, validate(replyInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.community!.reply(req.user!.userId, true, uuidParam(req.params.id), req.body.message), 201)));
  router.patch("/admin/support/:id", validate(ticketStatusInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.community!.ticketStatus(req.user!.userId, uuidParam(req.params.id), req.body))));
  router.use("/admin/consultations", ...authenticated, requireRole("ADMIN"));
  const retiredConsultations: RequestHandler = (_req, _res, next) => next(new AppError(410, "FEATURE_RETIRED", "Tư vấn chuyên viên đã ngừng. Bạn có thể gửi yêu cầu hỗ trợ tại Support."));
  router.use("/admin/consultations", retiredConsultations);
  router.get("/content", validate(contentQuery, "query"), asyncHandler(async (req, res) => sendData(res, await services.content!.list(req.query as unknown as z.infer<typeof contentQuery>))));
  router.get("/content/:slug", asyncHandler(async (req, res) => sendData(res, await services.content!.publishedArticle(z.string().max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).parse(req.params.slug)))));
  router.use("/admin/content", ...authenticated, requireRole("ADMIN"));
  router.get("/admin/content", validate(contentQuery, "query"), asyncHandler(async (req, res) => sendData(res, await services.content!.list(req.query as unknown as z.infer<typeof contentQuery>, true))));
  router.post("/admin/content", validate(contentInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.content!.write(req.user!.userId, req.body), 201)));
  router.patch("/admin/content/:id", validate(contentUpdate), asyncHandler(async (req: AuthenticatedRequest, res) => { const { expectedRevision, ...input } = req.body; sendData(res, await services.content!.write(req.user!.userId, input, z.string().uuid().parse(req.params.id), expectedRevision)); }));
  router.use("/admin/users", ...authenticated, requireRole("ADMIN"), (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.get("/admin/users", validate(userListSchema, "query"), asyncHandler(async (req, res) => sendData(res, await services.users!.list(req.query as unknown as z.infer<typeof userListSchema>))));
  router.get("/admin/users/:id", asyncHandler(async (req, res) => sendData(res, await services.users!.detail(z.string().uuid().parse(req.params.id)))));
  router.patch("/admin/users/:id/status", validate(userStatusSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.users!.status(req.user!.userId, z.string().uuid().parse(req.params.id), req.body))));
  const accountLimiter = rateLimit({
    windowMs: 15 * 60000, limit: 5, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
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
  router.post("/auth/login", authLimiter, validate(loginSchema), accountLimiter, asyncHandler(async (req, res) => sendSession(res, await auth.login(req.body, { ipAddress: req.ip, userAgent: req.get("user-agent") }))));
  router.post("/auth/google", authLimiter, validate(googleAuthSchema), asyncHandler(async (req, res) => sendSession(res, await auth.googleLogin(req.body.credential))));
  router.post("/auth/refresh", cookieCsrf, validate(emptySchema), asyncHandler(async (req, res) => {
    try { sendSession(res, await auth.refresh(refreshCookie(req))); }
    catch (error) { if (error instanceof AppError && error.status === 401) res.clearCookie(cookieName, cookieOptions); throw error; }
  }));
  router.post("/auth/logout", cookieCsrf, validate(emptySchema), asyncHandler(async (req, res) => {
    const result = await auth.logout(refreshCookie(req));
    res.clearCookie(cookieName, cookieOptions); sendData(res, result);
  }));
  router.get("/auth/me", ...authenticated, (_req, res) => { res.setHeader("Cache-Control", "no-store"); sendData(res, res.locals.user); });
  router.post("/auth/change-password", ...authenticated, authLimiter, validate(changePasswordSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await auth.changePassword(req.user!.userId, req.body.currentPassword, req.body.password);
    res.clearCookie(cookieName, cookieOptions); sendData(res, result);
  }));
  router.post("/auth/logout-all", ...authenticated, validate(emptySchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await auth.logoutAll(req.user!.userId);
    res.clearCookie(cookieName, cookieOptions); sendData(res, result);
  }));
  router.use("/me", ...authenticated, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  if (services.plans) router.use("/me/retirement/plans", requireRole("USER"), plansRouter(services.plans));
  if (services.actuals) router.use("/me/retirement/actuals", requireRole("USER"), actualsRouter(services.actuals));
  router.get("/me", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await profiles.getAccount(req.user!.userId))));
  router.get("/me/support", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.community!.tickets(req.user!.userId, listParams(req.query)))));
  router.post("/me/support", consultationLimiter, validate(ticketInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.community!.createTicket(req.user!.userId, req.body), 201)));
  router.get("/me/support/:id", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.community!.ticket(req.user!.userId, uuidParam(req.params.id)))));
  router.post("/me/support/:id/messages", consultationLimiter, validate(replyInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.community!.reply(req.user!.userId, false, uuidParam(req.params.id), req.body.message), 201)));
  router.use("/me/consultations", retiredConsultations);
  if (services.catalog) {
    router.get("/me/notification-settings", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.catalog!.settings(req.user!.userId))));
    router.put("/me/notification-settings", validate(notificationSettingsInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.catalog!.saveSettings(req.user!.userId, req.body))));
  }
  router.get("/me/notifications", asyncHandler(async (req: AuthenticatedRequest, res) => { const q = listParams(req.query); sendData(res, await services.community!.notifications(req.user!.userId, q.page, q.limit)); }));
  router.post("/me/notifications/read-all", validate(emptySchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.community!.readNotification(req.user!.userId))));
  router.post("/me/notifications/:id/read", validate(emptySchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.community!.readNotification(req.user!.userId, uuidParam(req.params.id)))));
  router.get("/me/saved-articles", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.content!.saved(req.user!.userId))));
  router.get("/me/saved-content", validate(contentQuery, "query"), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.content!.list(req.query as unknown as z.infer<typeof contentQuery>, false, req.user!.userId))));
  router.put("/me/saved-articles/:id", validate(emptySchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.content!.save(req.user!.userId, z.string().uuid().parse(req.params.id), true))));
  router.delete("/me/saved-articles/:id", validate(emptySchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await services.content!.save(req.user!.userId, z.string().uuid().parse(req.params.id), false))));
  router.post("/me/avatar", uploadLimiter, (_req, _res, next) => {
    if (![process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET].every(Boolean))
      return next(new AppError(503, "MEDIA_NOT_CONFIGURED", "Tải ảnh chưa sẵn sàng. Bạn vẫn có thể lưu thông tin tài khoản."));
    next();
  }, uploadMedia.single("file"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.file) throw new AppError(400, "FILE_REQUIRED", "Vui lòng chọn ảnh JPEG, PNG hoặc WebP.");
    try {
      const revision = z.coerce.number().int().min(0).parse(req.body.expectedRevision);
      sendData(res, await profiles.updateAvatar(req.user!.userId, revision, req.file.path));
    } catch (error) {
      await cloudinary.uploader.destroy(req.file.filename, { resource_type: "image" }).catch(() => {});
      throw error;
    }
  }));
  router.delete("/me/avatar", validate(z.object({ expectedRevision: z.number().int().min(0) }).strict()), asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendData(res, await profiles.updateAvatar(req.user!.userId, req.body.expectedRevision, null));
  }));
  router.patch("/me", validate(patchAccountSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await profiles.patchAccount(req.user!.userId, req.body))));
  router.use("/me/financial-profile", requireRole("USER"));
  router.post("/me/retirement/preview", requireRole("USER"), validate(retirementPreviewSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!services.retirement) throw new AppError(503, "RETIREMENT_UNAVAILABLE", "Bộ tính hưu trí chưa sẵn sàng.");
    sendData(res, await services.retirement.preview(req.user!.userId, req.body));
  }));
  router.post("/me/pension/preview", requireRole("USER"), validate(pensionPreviewSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!services.pensions) throw new AppError(503, "PENSIONS_UNAVAILABLE", "Xem trước lương hưu chưa sẵn sàng.");
    sendData(res, await services.pensions.preview(req.user!.userId, req.body));
  }));
  router.post("/me/debts/preview", requireRole("USER"), validate(debtPreviewSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!services.debts) throw new AppError(503, "DEBTS_UNAVAILABLE", "So sánh nợ chưa sẵn sàng.");
    sendData(res, await services.debts.preview(req.user!.userId, req.body));
  }));
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
