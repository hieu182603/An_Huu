import { Router } from "express";
import { z } from "zod";
import { asyncHandler, sendData } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import type { CatalogService } from "./service";
import { catalogQuery, productQuery, partnerInput, productInput, partnerUpdate, productUpdate } from "./schema";
export function catalogRouter(service: CatalogService, admin = false) {
  const router = Router(), id = (value: unknown) => z.string().uuid().parse(value);
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  if (!admin) router.get("/products/facets", asyncHandler(async (_req, res) => sendData(res, await service.facets())));
  for (const kind of ["partners", "products"] as const) {
    const list = (query: unknown, productId?: string) => kind === "products" ? service.products(productQuery.parse(query), admin, productId) : service.partners(catalogQuery.parse(query), admin, productId);
    router.get("/" + kind, asyncHandler(async (req, res) => sendData(res, await list(req.query))));
    router.get("/" + kind + "/:id", asyncHandler(async (req, res) => sendData(res, (await list({}, id(req.params.id))).items[0])));
  }
  if (admin) {
    router.post("/partners", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.writePartner(req.user!.userId, partnerInput.parse(req.body)), 201)));
    router.put("/partners/:id", asyncHandler(async (req: AuthenticatedRequest, res) => { const input = partnerUpdate.parse(req.body); sendData(res, await service.writePartner(req.user!.userId, input.data, id(req.params.id), input.expectedRevision)); }));
    router.post("/products", asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.writeProduct(req.user!.userId, productInput.parse(req.body)), 201)));
    router.put("/products/:id", asyncHandler(async (req: AuthenticatedRequest, res) => { const input = productUpdate.parse(req.body); sendData(res, await service.writeProduct(req.user!.userId, input.data, id(req.params.id), input.expectedRevision)); }));
  }
  return router;
}
