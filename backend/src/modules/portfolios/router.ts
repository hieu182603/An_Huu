import { Router } from "express";
import { z } from "zod";
import { asyncHandler, sendData, validate } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { assumptionsListSchema, publishAssumptionsSchema } from "../assumptions/schema";
import { portfolioDocumentSchema, portfolioPreviewSchema, writePortfolioSchema, approvePortfolioSchema } from "./schema";
import type { PortfoliosService } from "./service";

export function portfoliosRouter(service: PortfoliosService, admin: boolean) {
  const router = Router(), id = (v: unknown) => z.string().uuid().parse(v);
  router.get("/", validate(assumptionsListSchema, "query"), asyncHandler(async (req, res) => sendData(res, await service.list(req.query as unknown as z.infer<typeof assumptionsListSchema>, !admin))));
  if (admin) {
    router.post("/", validate(portfolioDocumentSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.create(req.user!.userId, req.body), 201)));
    router.patch("/:id", validate(writePortfolioSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.patch(req.user!.userId, id(req.params.id), req.body))));
    router.post("/:id/validate", validate(z.object({}).strict()), asyncHandler(async (req, res) => sendData(res, await service.validate(id(req.params.id)))));
    router.post("/:id/approve", validate(approvePortfolioSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.approve(req.user!.userId, id(req.params.id), req.body))));
    router.post("/:id/publish", validate(publishAssumptionsSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.publish(req.user!.userId, id(req.params.id), req.body))));
  } else router.post("/preview", validate(portfolioPreviewSchema), asyncHandler(async (req, res) => sendData(res, await service.preview(req.body))));
  router.get("/:id", asyncHandler(async (req, res) => sendData(res, await service.get(id(req.params.id), !admin))));
  return router;
}
