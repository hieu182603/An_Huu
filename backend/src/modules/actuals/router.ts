import { Router } from "express";
import { asyncHandler, sendData, validate } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import type { ActualsService } from "./service";
import { actualWriteSchema, actualRangeSchema, actualForecastSchema, reforecastPreviewSchema } from "./schema";
export function actualsRouter(service: ActualsService) {
  const router = Router();
  router.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.list(req.user!.userId, actualRangeSchema.parse(req.query)))));
  router.post("/reforecast", validate(actualForecastSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.forecast(req.user!.userId, req.body))));
  router.post("/reforecast/preview", validate(reforecastPreviewSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.previewUpdate(req.user!.userId, req.body))));
  router.get("/:period", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.get(req.user!.userId, String(req.params.period)))));
  router.put("/:period", validate(actualWriteSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.write(req.user!.userId, String(req.params.period), req.body, req.get("Idempotency-Key") ?? ""))));
  return router;
}
