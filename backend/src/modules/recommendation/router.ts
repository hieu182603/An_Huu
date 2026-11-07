import { Router } from "express";
import { z } from "zod";
import { asyncHandler, sendData, validate } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { RecommendationService } from "./service";
import { HoldingsRepository, holdingsRebalanceInput } from "../holdings/repository";
import { createRecommendation, transitionRecommendation, writeProductData, writeHolding } from "./schema";
export function investmentRouter(service: RecommendationService, holdings: HoldingsRepository) {
  const router = Router(), id = (v: unknown) => z.string().uuid().parse(v);
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.get("/permissions", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.permissions(req.user!.userId))));
  router.get("/admin/providers", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.providerHealth(req.user!.userId))));
  router.get("/admin/unconfigured-products", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.unconfiguredProducts(req.user!.userId))));
  router.get("/recommendations", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.list(req.user!.userId))));
  router.get("/holdings", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await holdings.read(req.user!.userId))));
  router.put("/holdings", validate(writeHolding), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await holdings.write(req.user!.userId, req.body))));
  router.post("/holdings/rebalance", validate(holdingsRebalanceInput), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await holdings.rebalance(req.user!.userId, req.body))));
  router.get("/admin/products", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.productList(req.user!.userId))));
  router.put("/admin/products/:id", validate(writeProductData), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.writeProduct(req.user!.userId, id(req.params.id), req.body))));
  router.get("/admin/recommendations", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.list(req.user!.userId, true))));
  router.post("/admin/recommendations", validate(createRecommendation), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.create(req.user!.userId, req.body), 201)));
  router.get("/admin/recommendations/:id/history", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.history(req.user!.userId, id(req.params.id)))));
  for (const action of ["validate", "suitability", "submit", "approve", "reject", "publish", "expire", "supersede"] as const) {
    router.post(`/admin/recommendations/:id/${action}`, validate(transitionRecommendation), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.transition(req.user!.userId, id(req.params.id), action, req.body))));
  }
  return router;
}
