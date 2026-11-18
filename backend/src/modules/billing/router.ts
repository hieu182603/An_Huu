import { Router } from "express";
import { z } from "zod";
import { asyncHandler, sendData, validate } from "../../common/http";
import { createLimiter } from "../../middlewares/rateLimiter";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import type { BillingService } from "./service";

const id = z.object({ id: z.string().uuid() }).strict();
const estimateInput = z.object({ baseAmountVnd: z.string().regex(/^(0|[1-9]\d{0,17})$/, "Căn cứ phí phải là số nguyên VND không âm.") }).strict();
const termsInput = z.object({ termsVersion: z.string().trim().min(3).max(80) }).strict();
const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
}).strict();
const revisionInput = z.object({ expectedRevision: z.number().int().min(0) }).strict();
const emptyBody = z.object({}).strict();

/** Public: GET /billing/fee-schedule. */
export function billingPublicRouter(service: BillingService) {
  const r = Router();
  r.get("/fee-schedule", asyncHandler(async (_req, res) => sendData(res, await service.publicSchedule())));
  return r;
}

/** USER: mounted at /me/billing behind authentication + requireRole("USER"). */
export function billingMeRouter(service: BillingService) {
  const r = Router();
  const payLimiter = createLimiter(60 * 1000, 10);
  r.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  r.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.overview(req.user!.userId))));
  r.post("/estimate", validate(estimateInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.estimate(req.user!.userId, req.body.baseAmountVnd))));
  r.post("/terms", validate(termsInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.acceptTerms(req.user!.userId, req.body.termsVersion))));
  r.get("/statements", validate(listQuery, "query"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    sendData(res, await service.statements(req.user!.userId, q.page, q.limit));
  }));
  r.get("/statements/:id", validate(id, "params"), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.statement(req.user!.userId, req.params.id))));
  r.post("/statements/:id/pay", payLimiter, validate(id, "params"), validate(emptyBody), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.pay(req.user!.userId, req.params.id, String(req.get("Idempotency-Key") ?? "")))));
  r.post("/stop", validate(revisionInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.stop(req.user!.userId, req.body.expectedRevision))));
  r.post("/resume", validate(revisionInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.resume(req.user!.userId, req.body.expectedRevision))));
  r.get("/orders/:id", validate(id, "params"), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.order(req.user!.userId, req.params.id))));
  return r;
}

/** payOS → POST /webhooks/payos. No JWT: the HMAC signature over `data` authenticates it. */
export function payosWebhookRouter(service: BillingService) {
  const r = Router();
  r.post("/", createLimiter(60 * 1000, 120), asyncHandler(async (req, res) => {
    const result = await service.handleWebhook(req.body);
    res.status(200).json({ success: true, outcome: result.outcome });
  }));
  return r;
}
