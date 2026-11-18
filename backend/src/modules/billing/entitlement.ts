import type { RequestHandler } from "express";
import { AppError } from "../../common/errors";
import type { AuthenticatedRequest } from "../../middlewares/authMiddleware";
import type { BillingService } from "./service";

/**
 * Feature gating for overdue accounts (plan §6). Only creating/computing is blocked, never reading:
 * every GET, CSV export, financial-profile edit, account, support, notification and billing route stays open.
 * Paths are relative to `/me/`.
 */
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
  const rest = /\/me\/(.+?)\/?$/.exec(urlPath)?.[1];
  return !!rest && GATED.some(([m, pattern]) => m === method && pattern.test(rest));
}

type Options = { passTtlMs?: number; blockedTtlMs?: number; now?: () => number };
/**
 * `402 BILLING_OVERDUE` while the user's billing account is OVERDUE. No account, TRIAL, ACTIVE and
 * STOPPED pass, and billing disabled is a no-op. The verdict is cached per user: 30 s when open, only 5 s
 * when blocked so a user who has just paid is not kept waiting.
 */
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

/** `requireBillingActive` limited to the write/compute routes above; mounted once next to authentication. */
export function billingGate(service: BillingService, options: Options = {}): RequestHandler {
  const check = requireBillingActive(service, options);
  return (req, res, next) => isBillingGated(req.method, req.originalUrl.split("?")[0]) ? check(req, res, next) : next();
}
