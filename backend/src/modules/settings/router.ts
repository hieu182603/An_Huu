import { Router } from "express";
import { asyncHandler, sendData, validate } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import type { SystemSettingsService } from "./service";
import {
  generalSettingsSchema,
  securitySettingsSchema,
  notificationSettingsSchema,
  auditLogQuery,
  loginLogQuery,
  systemLogQuery,
} from "./schema";

export function settingsRouter(service: SystemSettingsService) {
  const router = Router();

  // 1. General Settings
  router.get(
    "/general",
    asyncHandler(async (_req, res) => {
      sendData(res, await service.getGeneralSettings());
    })
  );

  router.put(
    "/general",
    validate(generalSettingsSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const actorId = req.user!.userId;
      const actorName = req.user!.email;
      const meta = { ipAddress: req.ip, userAgent: req.get("user-agent") };
      sendData(res, await service.updateGeneralSettings(actorId, actorName, req.body, meta));
    })
  );

  // 2. Security Settings
  router.get(
    "/security",
    asyncHandler(async (_req, res) => {
      sendData(res, await service.getSecuritySettings());
    })
  );

  router.put(
    "/security",
    validate(securitySettingsSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const actorId = req.user!.userId;
      const actorName = req.user!.email;
      const meta = { ipAddress: req.ip, userAgent: req.get("user-agent") };
      sendData(res, await service.updateSecuritySettings(actorId, actorName, req.body, meta));
    })
  );

  // 3. Notification Settings
  router.get(
    "/notifications",
    asyncHandler(async (_req, res) => {
      sendData(res, await service.getNotificationSettings());
    })
  );

  router.put(
    "/notifications",
    validate(notificationSettingsSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const actorId = req.user!.userId;
      const actorName = req.user!.email;
      const meta = { ipAddress: req.ip, userAgent: req.get("user-agent") };
      sendData(res, await service.updateNotificationSettings(actorId, actorName, req.body, meta));
    })
  );

  // 4. Logs
  router.get(
    "/logs/audit",
    validate(auditLogQuery, "query"),
    asyncHandler(async (req, res) => {
      sendData(res, await service.listAuditLogs(req.query as unknown as Parameters<typeof service.listAuditLogs>[0]));
    })
  );

  router.get(
    "/logs/audit/:id",
    asyncHandler(async (req, res) => {
      sendData(res, await service.getAuditLogDetail(req.params.id));
    })
  );

  router.get(
    "/logs/login",
    validate(loginLogQuery, "query"),
    asyncHandler(async (req, res) => {
      sendData(res, await service.listLoginLogs(req.query as unknown as Parameters<typeof service.listLoginLogs>[0]));
    })
  );

  router.get(
    "/logs/system",
    validate(systemLogQuery, "query"),
    asyncHandler(async (req, res) => {
      sendData(res, await service.listSystemLogs(req.query as unknown as Parameters<typeof service.listSystemLogs>[0]));
    })
  );

  return router;
}
