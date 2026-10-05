import { Router } from "express";
import { z } from "zod";
import { asyncHandler, sendData, validate } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import type { InsuranceHistoryService } from "./history-service";
import type { LegalRulesService } from "./legal-service";
import { historyPreviewSchema, historySaveSchema, legalRuleDraftSchema, legalRulePatchSchema, legalRuleTransitionSchema, pensionEstimateInputSchema, pensionEstimateSaveSchema } from "./insurance-schema";
import type { PensionEstimateService } from "./estimate-service";
import { dateSchema } from "../../common/calendar";
const id = (v: unknown) => z.string().uuid().parse(v);
export function pensionEstimatesRouter(service: PensionEstimateService) {
  const router = Router();
  router.get("/legal-rules", asyncHandler(async (req, res) => sendData(res, await service.publishedRules(dateSchema.parse(req.query.benefitDate)))));
  router.get("/estimates", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.list(req.user!.userId))));
  router.get("/estimates/:id", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.get(req.user!.userId, id(req.params.id)))));
  router.post("/estimates/preview", validate(pensionEstimateInputSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.preview(req.user!.userId, req.body))));
  router.post("/estimates", validate(pensionEstimateSaveSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.save(req.user!.userId, req.body, id(req.get("Idempotency-Key"))), 201)));
  return router;
}
export function insuranceHistoryRouter(service: InsuranceHistoryService) {
  const router = Router();
  router.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.get(req.user!.userId))));
  router.get("/:id", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.get(req.user!.userId, id(req.params.id)))));
  router.post("/import-preview", validate(historyPreviewSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.preview(req.user!.userId, req.body))));
  router.post("/", validate(historySaveSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.save(req.user!.userId, req.body, id(req.get("Idempotency-Key"))), 201)));
  return router;
}
export function legalRulesRouter(service: LegalRulesService) {
  const router = Router();
  router.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.list(req.user!.userId))));
  router.get("/:id", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.get(req.user!.userId, id(req.params.id)))));
  router.post("/", validate(legalRuleDraftSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.create(req.user!.userId, req.body, id(req.get("Idempotency-Key"))), 201)));
  router.patch("/:id", validate(legalRulePatchSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.patch(req.user!.userId, id(req.params.id), req.body, id(req.get("Idempotency-Key"))))));
  router.post("/:id/transitions", validate(legalRuleTransitionSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.transition(req.user!.userId, id(req.params.id), req.body, id(req.get("Idempotency-Key"))))));
  return router;
}
