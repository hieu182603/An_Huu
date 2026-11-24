import type { RequestHandler } from "express";
import { AppError } from "../../common/errors";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import type { BillingService } from "./service";

const GATED: Array<[method: string, path: RegExp]> = [
  ["POST", /^retirement\/plans$/],
  ["POST", /^retirement\/plans\/[^/]+\/(?:versions|apply|compare|reforecasts|source-reforecasts|source-reforecasts\/preview)$/],
  ["POST", /^retirement\/plans\/[^/]+\/versions\/[^/]+\/(?:simulate|replay)$/],
  ["PUT", /^retirement\/actuals\/[^/]+$/],
  ["POST", /^retirement\/actuals\/reforecast(?:\/preview)?$/],
  ["POST", /^ai\/(?:explain|simulate|conversations)$/],
  ["POST", /^explanations\/metric$/],
  ["POST", /^portfolio-policies\/workspace\/[^/]+$/],
  ["POST", /^retirement\/risk\/[^/]+$/],
  ["POST", /^retirement\/(?:preview|pension-impact)$/],
  ["POST", /^pension\/preview$/],
  ["POST", /^debts\/preview$/],
];
export function isBillingGated(method: string, urlPath: string) {
  // Express matches routes case-insensitively, so the gate must too.
  const rest = /\/me\/(.+?)\/?$/i.exec(urlPath)?.[1]?.toLowerCase();
  return !!rest && GATED.some(([m, pattern]) => m === method && pattern.test(rest));
}

type Options = { passTtlMs?: number; blockedTtlMs?: number; now?: () => number };
export function requireBillingActive(service: BillingService, options: Options = {}): RequestHandler {
  const passTtl = options.passTtlMs ?? 30_000, blockedTtl = options.blockedTtlMs ?? 5_000, clock = options.now ?? Date.now;
  const cache = new Map<string, { until: number; notice: Awaited<ReturnType<BillingService["overdueNotice"]>> }>();
  return async (req: AuthenticatedRequest, _res, next) => {
    try {
      if (!service.enabled || !req.user) return next();
      const userId = req.user.userId, now = clock();
      let entry = cache.get(userId);
      if (!entry || entry.until <= now) {
        const notice = await service.overdueNotice(userId);
        if (cache.size > 10_000) cache.clear();
        entry = { notice, until: now + (notice ? blockedTtl : passTtl) };
        cache.set(userId, entry);
      }
      if (!entry.notice) return next();
      next(new AppError(402, "BILLING_OVERDUE", "Phí dịch vụ đã quá hạn. Bạn vẫn xem được toàn bộ dữ liệu của mình; hãy thanh toán để tiếp tục tạo mới hoặc tính toán lại.",
        undefined, { statementId: entry.notice.statementId, amountDueVnd: entry.notice.amountDueVnd, dueDate: entry.notice.dueDate.toISOString() }));
    } catch (error) { next(error); }
  };
}

export function billingGate(service: BillingService, options: Options = {}): RequestHandler {
  const check = requireBillingActive(service, options);
  return (req, res, next) => isBillingGated(req.method, req.originalUrl.split("?")[0]) ? check(req, res, next) : next();
}
