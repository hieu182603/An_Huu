import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AppError } from "../../common/errors";
import { asyncHandler, sendData, validate } from "../../common/http";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { explanationGlossary } from "./glossary";
import { metricExplanationSchema } from "./schema";
import type { ExplanationsService } from "./service";

export function explanationsRouter(service: ExplanationsService) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => (req as AuthenticatedRequest).user!.userId,
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Vui lòng chờ trước khi xem thêm giải thích.")),
  });
  router.get("/glossary", (_req, res) => sendData(res, explanationGlossary));
  router.post("/metric", limiter, validate(metricExplanationSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendData(res, await service.metric(req.user!.userId, req.body));
  }));
  return router;
}
