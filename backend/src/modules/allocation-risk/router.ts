import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, sendData, validate } from "../../common/http";
import { AppError } from "../../common/errors";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import { assumptionsListSchema } from "../assumptions/schema";
import { marketDocumentSchema, writeMarketSchema, approveMarketSchema, publishMarketSchema } from "./market-schema";
import { MarketDataService } from "./market-service";
import { convertDailyMarketData, dailyConvertSchema } from "./market-daily";
import { AllocationRiskService } from "./service";
import { riskRequestSchema } from "./schema";
import { rebalanceInputSchema } from "./rebalance";
import { RebalanceDecisionService, rebalanceDecisionUpdateSchema, rebalanceHistoryQuerySchema } from "./rebalance-decisions";

export function marketDataRouter(service: MarketDataService) {
  const router = Router(), id = (v: unknown) => z.string().uuid().parse(v);
  router.get("/", validate(assumptionsListSchema, "query"), asyncHandler(async (req, res) => sendData(res, await service.list(assumptionsListSchema.parse(req.query)))));
  router.post("/", validate(marketDocumentSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.create(req.user!.userId, req.body), 201)));
  // Pure conversion of daily prices to monthly rows for preview; writes nothing.
  router.post("/convert-daily", validate(dailyConvertSchema), asyncHandler(async (req, res) => sendData(res, convertDailyMarketData(req.body))));
  router.get("/:id", asyncHandler(async (req, res) => sendData(res, await service.get(id(req.params.id)))));
  router.patch("/:id", validate(writeMarketSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.patch(req.user!.userId, id(req.params.id), req.body))));
  router.post("/:id/validate", validate(z.object({}).strict()), asyncHandler(async (req, res) => sendData(res, await service.validate(id(req.params.id)))));
  router.post("/:id/approve", validate(approveMarketSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.approve(req.user!.userId, id(req.params.id), req.body))));
  router.post("/:id/publish", validate(publishMarketSchema), asyncHandler(async (req: AuthenticatedRequest, res) => sendData(res, await service.publish(req.user!.userId, id(req.params.id), req.body))));
  return router;
}
/** Per-account limit per minute from the environment, falling back to the decided default. */
export function perMinute(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
export function allocationRiskRouter(service: AllocationRiskService, decisions?: RebalanceDecisionService) {
  const router = Router(), id = (v: unknown) => z.string().uuid().parse(v);
  const simulationLimiter = rateLimit({
    windowMs: 60000,
    // Initial setting decided 19/11/2026 (3 heavy runs/min/account); RISK_RUNS_PER_MINUTE tunes it after load measurements.
    limit: perMinute("RISK_RUNS_PER_MINUTE", 3),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthenticatedRequest).user?.userId || req.ip || "anonymous",
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", `Vui lòng chờ trước khi chạy mô phỏng tiếp (tối đa ${perMinute("RISK_RUNS_PER_MINUTE", 3)} lần/phút).`)),
  });
  // Continuations only raise the path count for inputs already simulated; their compute is mostly reused, so they get their own budget.
  const continuationLimiter = rateLimit({
    windowMs: 60000,
    limit: perMinute("RISK_CONTINUATIONS_PER_MINUTE", 20),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthenticatedRequest).user?.userId || req.ip || "anonymous",
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", `Vui lòng chờ trước khi tăng số đường mô phỏng tiếp (tối đa ${perMinute("RISK_CONTINUATIONS_PER_MINUTE", 20)} lần/phút).`)),
  });
  const runLimiter: RequestHandler = (req, res, next) => (req.body?.continuation === true ? continuationLimiter : simulationLimiter)(req, res, next);
  const rebalanceLimiter = rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthenticatedRequest).user?.userId || req.ip || "anonymous",
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Vui lòng chờ trước khi gửi yêu cầu tiếp.")),
  });
  // POST transports a large selection, but these methods are entirely read-only.
  for (const mode of ["simulation", "scenarios", "selection", "adjustments"] as const)
    router.post("/" + mode, runLimiter, validate(riskRequestSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
      // Node >= 16 emits req "close" as soon as the body is read; only the response
      // closing before it finished means the client went away.
      const controller = new AbortController();
      res.on("close", () => { if (!res.writableFinished) controller.abort(); });
      sendData(res, await service.run(req.user!.userId, req.body, mode, controller.signal));
    }));
  router.post("/rebalance", rebalanceLimiter, validate(rebalanceInputSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const proposal = await service.rebalance(req.body, req.user!.userId);
    if (req.body.record === true && decisions && (proposal.status === "PROPOSED" || proposal.status === "WITHIN_BAND")) {
      const saved = await decisions.recordProposal(req.user!.userId, {
        planVersionId: req.body.planVersionId ?? null,
        source: req.body.source ?? "PROPOSAL",
        oldWeights: proposal.oldWeights,
        targetWeights: proposal.targetWeights,
        newWeights: "newWeights" in proposal ? proposal.newWeights : proposal.oldWeights,
        trigger: proposal.trigger,
        bandPoints: "bandPoints" in proposal ? proposal.bandPoints : "0",
        costEstimate: proposal.cost,
        trades: proposal.trades,
        probabilityBefore: proposal.probabilityComparison?.status === "READY" ? proposal.probabilityComparison.before : null,
        probabilityAfter: proposal.probabilityComparison?.status === "READY" ? proposal.probabilityComparison.after : null,
      });
      return sendData(res, { ...proposal, persisted: true, decisionId: saved.id, decision: saved.decision });
    }
    return sendData(res, proposal);
  }));
  if (decisions) {
    router.post("/rebalance/:id/decision", rebalanceLimiter, validate(rebalanceDecisionUpdateSchema), asyncHandler(async (req: AuthenticatedRequest, res) =>
      sendData(res, await decisions.updateDecision(req.user!.userId, id(req.params.id), req.body))));
    router.get("/rebalance/history", validate(rebalanceHistoryQuerySchema, "query"), asyncHandler(async (req: AuthenticatedRequest, res) =>
      sendData(res, await decisions.listHistory(req.user!.userId, req.query))));
  }
  return router;
}
