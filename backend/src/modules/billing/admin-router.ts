import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { asyncHandler, sendData, validate } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { adjustInput, alertsQuery, createOverrideInput, createScheduleInput, exportQuery, manualPaymentInput, ordersQuery, overridesQuery,
  overviewQuery, patchScheduleInput, publishScheduleInput, reasonBody, reconcileInput, refundInput, resolveAlertInput, statementsQuery, userParam, uuidParam } from "./admin-schema";
import type { BillingAdminService } from "./admin-service";

const idempotencyKey = z.string({ error: "Thiếu header Idempotency-Key." }).uuid("Idempotency-Key phải là UUID.");
const keyOf = (req: AuthenticatedRequest) => idempotencyKey.parse(req.get("Idempotency-Key"));
const query = <T>(req: AuthenticatedRequest) => req.query as unknown as T;

/**
 * Mounted at /admin/billing behind authentication + requireRole("ADMIN"). Reads need ADMIN only; writes also need an
 * InvestmentRoleGrant, which the service verifies inside its transaction (403 FORBIDDEN otherwise).
 * Everything is 503 BILLING_DISABLED while BILLING_ENABLED=false, like the user API.
 */
export function billingAdminRouter(service: BillingAdminService) {
  const r = Router();
  r.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next(service.enabled ? undefined : new AppError(503, "BILLING_DISABLED", "Chức năng phí dịch vụ chưa được bật."));
  });
  const admin = (req: AuthenticatedRequest) => req.user!.userId;

  r.get("/permissions", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.permissions(admin(req)))));
  r.get("/overview", validate(overviewQuery, "query"), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.overview(query<z.infer<typeof overviewQuery>>(req).period))));

  r.get("/statements", validate(statementsQuery, "query"), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.statements(query<z.infer<typeof statementsQuery>>(req)))));
  r.get("/statements/:id", validate(uuidParam, "params"), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.statement(req.params.id))));
  r.post("/statements/:id/manual-payment", validate(uuidParam, "params"), validate(manualPaymentInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.manualPayment(admin(req), req.params.id, req.body, keyOf(req)), 201)));
  r.post("/statements/:id/adjust", validate(uuidParam, "params"), validate(adjustInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.adjust(admin(req), req.params.id, req.body), 201)));
  r.post("/statements/:id/void", validate(uuidParam, "params"), validate(reasonBody), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.voidStatement(admin(req), req.params.id, req.body.reason))));

  r.get("/orders", validate(ordersQuery, "query"), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.orders(query<z.infer<typeof ordersQuery>>(req)))));
  r.post("/orders/:id/reconcile", validate(uuidParam, "params"), validate(reconcileInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.reconcileOrder(admin(req), req.params.id, req.body.reason))));
  r.post("/payments/:id/refund", validate(uuidParam, "params"), validate(refundInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.refund(admin(req), req.params.id, req.body, keyOf(req)), 201)));

  r.get("/alerts", validate(alertsQuery, "query"), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.alerts(query<z.infer<typeof alertsQuery>>(req)))));
  r.post("/alerts/resolve", validate(resolveAlertInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.resolveAlert(admin(req), req.body))));

  r.get("/fee-schedules", asyncHandler(async (_req, res) => sendData(res, await service.schedules())));
  r.post("/fee-schedules", validate(createScheduleInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.createSchedule(admin(req), req.body), 201)));
  r.patch("/fee-schedules/:id", validate(uuidParam, "params"), validate(patchScheduleInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.patchSchedule(admin(req), req.params.id, req.body))));
  r.post("/fee-schedules/:id/preview", validate(uuidParam, "params"), validate(z.object({}).strict()), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.previewSchedule(admin(req), req.params.id))));
  r.post("/fee-schedules/:id/publish", validate(uuidParam, "params"), validate(publishScheduleInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.publishSchedule(admin(req), req.params.id, req.body))));

  r.get("/overrides", validate(overridesQuery, "query"), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.overrides(query<z.infer<typeof overridesQuery>>(req)))));
  r.post("/users/:userId/overrides", validate(userParam, "params"), validate(createOverrideInput), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.createOverride(admin(req), req.params.userId, req.body), 201)));
  r.post("/overrides/:id/revoke", validate(uuidParam, "params"), validate(reasonBody), asyncHandler(async (req: AuthenticatedRequest, res) =>
    sendData(res, await service.revokeOverride(admin(req), req.params.id, req.body.reason))));
  r.get("/users/:userId", validate(userParam, "params"), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.userBilling(req.params.userId))));

  r.get("/export.csv", validate(exportQuery, "query"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await service.exportCsv(admin(req), query<z.infer<typeof exportQuery>>(req).period);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.type("text/csv; charset=utf-8").send(result.content);
  }));
  return r;
}
