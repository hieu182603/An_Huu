import { Router } from "express";
import { z } from "zod";
import { asyncHandler, sendData, validate } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import type { PlansService } from "./service";
import { saveReforecastSchema } from "../actuals/schema";
import { sourceReforecastSchema, saveSourceReforecastSchema } from "./source-schema";
import { createPlanVersionSchema, applyPlanVersionSchema, planListSchema, planKeySchema, planReportQuerySchema, planExportQuerySchema, planCompareSchema, planSimulationSchema } from "./schema";
export function plansRouter(service: PlansService) {
  const router = Router(), id = (value: unknown) => z.string().uuid().parse(value);
  router.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.list(req.user!.userId, planListSchema.parse(req.query)))));
  router.post("/", validate(createPlanVersionSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.createVersion(req.user!.userId, null, req.body, planKeySchema.parse(req.get("Idempotency-Key"))), 201)));
  router.get("/:id", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.get(req.user!.userId, id(req.params.id)))));
  router.get("/:id/report", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.report(req.user!.userId, id(req.params.id), planReportQuerySchema.parse(req.query)))));
  router.post("/:id/compare", validate(planCompareSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.compare(req.user!.userId, id(req.params.id), req.body))));
  router.post("/:id/reforecasts", validate(saveReforecastSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.saveReforecast(req.user!.userId, id(req.params.id), req.body, planKeySchema.parse(req.get("Idempotency-Key"))), 201)));
  router.post("/:id/source-reforecasts/preview", validate(sourceReforecastSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.previewSources(req.user!.userId, id(req.params.id), req.body))));
  router.post("/:id/source-reforecasts", validate(saveSourceReforecastSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.saveSources(req.user!.userId, id(req.params.id), req.body, planKeySchema.parse(req.get("Idempotency-Key"))), 201)));
  router.post("/:id/versions/:versionId/simulate", validate(planSimulationSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.simulate(req.user!.userId, id(req.params.id), id(req.params.versionId), req.body))));
  router.get("/:id/versions/:versionId/export.csv", asyncHandler(async (req: AuthenticatedRequest, res) => {
    const query = planExportQuerySchema.parse(req.query);
    const result = await service.exportCsv(req.user!.userId, id(req.params.id), id(req.params.versionId), query.format);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.type("text/csv; charset=utf-8").send(result.content);
  }));
  router.get("/:id/versions", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.versions(req.user!.userId, id(req.params.id), planListSchema.parse(req.query)))));
  router.post("/:id/versions", validate(createPlanVersionSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.createVersion(req.user!.userId, id(req.params.id), req.body, planKeySchema.parse(req.get("Idempotency-Key"))), 201)));
  router.post("/:id/apply", validate(applyPlanVersionSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.apply(req.user!.userId, id(req.params.id), req.body, planKeySchema.parse(req.get("Idempotency-Key"))))));
  router.get("/:id/versions/:versionId", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.version(req.user!.userId, id(req.params.id), id(req.params.versionId)))));
  router.post("/:id/versions/:versionId/replay", validate(z.object({}).strict()), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res,
    await service.version(req.user!.userId, id(req.params.id), id(req.params.versionId), true))));
  return router;
}
