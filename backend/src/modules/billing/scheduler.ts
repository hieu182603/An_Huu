import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../../config/env";
import { log } from "../../common/logger";
import { createBillingJobs } from "./jobs";
import { PayosClient } from "./payos";

/**
 * Billing job cadence shared by the standalone worker and the API server's inline mode
 * (production runs only `node dist/server.js`, so the server must run these too).
 * `tick()` runs whatever is due: EXPIRE_ORDERS every 5 minutes, the other jobs hourly.
 * Every job is idempotent, so overlapping runs (worker + server, several instances) are safe.
 */
export function createBillingRunner(db: PrismaClient, config: AppConfig) {
  if (config.BILLING_ENABLED !== "true") return null;
  const gateway = config.PAYOS_CLIENT_ID && config.PAYOS_API_KEY && config.PAYOS_CHECKSUM_KEY
    ? new PayosClient({ clientId: config.PAYOS_CLIENT_ID, apiKey: config.PAYOS_API_KEY, checksumKey: config.PAYOS_CHECKSUM_KEY, baseUrl: config.PAYOS_API_BASE_URL, timeoutMs: config.PAYOS_TIMEOUT_MS })
    : null;
  const jobs = createBillingJobs(db, gateway, config.BILLING_LAUNCH_AT ? new Date(config.BILLING_LAUNCH_AT) : null);
  let nextFrequent = 0, nextHourly = 0, running = false;
  return {
    async tick(now = Date.now()) {
      if (running) return;
      running = true;
      try {
        const groups = [] as typeof jobs.hourly;
        if (now >= nextFrequent) { nextFrequent = now + 300_000; groups.push(...jobs.frequent); }
        if (now >= nextHourly) { nextHourly = now + 3_600_000; groups.push(...jobs.hourly); }
        for (const job of groups) {
          try {
            const counts = await job.run(new Date());
            const total = (key: string) => typeof counts[key] === "number" ? counts[key] as number : 0;
            const created = total("issued") + total("waived") + total("reminded") + total("overdue") + total("expired") + total("superseded") + total("notified");
            if (created || total("failed")) log(total("failed") ? "warn" : "info", "billing.job", { code: job.code, created, failed: total("failed") });
          } catch { log("error", "worker.error", { code: "BILLING_" + job.code + "_FAILED" }); }
        }
      } finally { running = false; }
    },
  };
}
