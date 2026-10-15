import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, sendData, validate } from "../../common/http";
import { AppError } from "../../common/errors";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { assumptionsListSchema, publishAssumptionsSchema } from "../assumptions/schema";
import { marketDocumentSchema, writeMarketSchema, approveMarketSchema } from "./market-schema";
import { MarketDataService } from "./market-service";
import { AllocationRiskService } from "./service";
import { riskRequestSchema } from "./schema";
import { rebalanceInputSchema } from "./rebalance";

export function marketDataRouter(service: MarketDataService) {
  const router = Router(), id = (v: unknown) => z.string().uuid().parse(v);
  router.get("/", validate(assumptionsListSchema, "query"), asyncHandler(async (req, res) => sendData(res, await service.list(assumptionsListSchema.parse(req.query)))));
  router.post("/", validate(marketDocumentSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.create(req.user!.userId, req.body), 201)));
  router.get("/:id", asyncHandler(async (req, res) => sendData(res, await service.get(id(req.params.id)))));
  router.patch("/:id", validate(writeMarketSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.patch(req.user!.userId, id(req.params.id), req.body))));
  router.post("/:id/validate", validate(z.object({}).strict()), asyncHandler(async (req, res) => sendData(res, await service.validate(id(req.params.id)))));
  router.post("/:id/approve", validate(approveMarketSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.approve(req.user!.userId, id(req.params.id), req.body))));
  router.post("/:id/publish", validate(publishAssumptionsSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.publish(req.user!.userId, id(req.params.id), req.body))));
  return router;
}
export function allocationRiskRouter(service: AllocationRiskService) {
  const router = Router();
  router.use(rateLimit({ windowMs: 60000, limit: 6, standardHeaders: true, legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Vui lòng chờ trước khi chạy mô phỏng tiếp.")) }));
  // POST transports a large selection, but these methods are entirely read-only.
  for (const mode of ["simulation", "scenarios", "selection"] as const)
    router.post("/" + mode, validate(riskRequestSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.run(req.user!.userId, req.body, mode))));
  router.post("/rebalance", validate(rebalanceInputSchema), asyncHandler(async (req, res) => sendData(res, await service.rebalance(req.body))));
  return router;
}
