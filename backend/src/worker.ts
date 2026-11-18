import "dotenv/config";
import { loadEnv } from "./config/env";
import { log } from "./common/logger";

async function main() {
  const config = loadEnv();
  if (!config.OUTBOX_ENCRYPTION_KEY) throw new Error("OUTBOX_ENCRYPTION_KEY_REQUIRED");
  const [{ prisma }, { OutboxProcessor }, { createEventHandler }, { createMailSender }] = await Promise.all([
    import("./config/prisma"), import("./jobs/processor"), import("./jobs/handlers"), import("./jobs/mail"),
  ]);
  const processor = new OutboxProcessor(prisma, createEventHandler(prisma, config,
    createMailSender()));
  const queue = config.JOB_TRANSPORT === "azure"
    ? new (await import("./jobs/azure")).AzureEventQueue(config.AZURE_SERVICE_BUS_NAMESPACE!, config.AZURE_SERVICE_BUS_QUEUE) : null;
  const subscription = queue?.subscribe(id => processor.process(id));
  // Service-fee jobs (docs/KE_HOACH_TRIEN_KHAI_PHI_DICH_VU.md §5): only with BILLING_ENABLED=true.
  const billing = config.BILLING_ENABLED === "true" ? await (async () => {
    const [{ createBillingJobs }, { PayosClient }] = await Promise.all([import("./modules/billing/jobs"), import("./modules/billing/payos")]);
    return createBillingJobs(prisma, config.PAYOS_CLIENT_ID && config.PAYOS_API_KEY && config.PAYOS_CHECKSUM_KEY
      ? new PayosClient({ clientId: config.PAYOS_CLIENT_ID, apiKey: config.PAYOS_API_KEY, checksumKey: config.PAYOS_CHECKSUM_KEY, baseUrl: config.PAYOS_API_BASE_URL, timeoutMs: config.PAYOS_TIMEOUT_MS })
      : null);
  })() : null;
  let stopped = false;
  let nextAiPurge = 0, nextReminder = 0, nextBillingHourly = 0, nextBillingFrequent = 0;
  const stop = () => { stopped = true; };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  log("info", "worker.started");
  try {
    while (!stopped) {
      try {
        if (Date.now() >= nextAiPurge) {
          nextAiPurge = Date.now() + 60000;
          try {
            const result = await (await import("./modules/ai/retention")).runAiRetention(prisma, { execute: true });
            log("info", "retention.completed", { code: result.complete ? "COMPLETE" : "BACKLOG_REMAINS",
              eligible: result.eligible, deleted: result.deleted, remaining: result.remaining, batches: result.batches });
          }
          catch { log("error", "worker.error", { code: "AI_RETENTION_FAILED" }); }
        }
        if (Date.now() >= nextReminder) {
          nextReminder = Date.now() + 3600000;
          try {
            const result = await (await import("./jobs/reminders")).runMonthlyReminders(prisma);
            if (result.created) log("info", "reminders.created", { code: "MONTHLY_CHECKIN", created: result.created });
          }
          catch { log("error", "worker.error", { code: "REMINDERS_FAILED" }); }
        }
        if (billing) {
          const groups = [] as typeof billing.hourly;
          if (Date.now() >= nextBillingFrequent) { nextBillingFrequent = Date.now() + 300000; groups.push(...billing.frequent); }
          if (Date.now() >= nextBillingHourly) { nextBillingHourly = Date.now() + 3600000; groups.push(...billing.hourly); }
          for (const job of groups) {
            try {
              const counts = await job.run(new Date());
              const total = (key: string) => typeof counts[key] === "number" ? counts[key] as number : 0;
              const created = total("issued") + total("waived") + total("reminded") + total("overdue") + total("expired") + total("superseded") + total("notified");
              if (created || total("failed")) log(total("failed") ? "warn" : "info", "billing.job", { code: job.code, created, failed: total("failed") });
            }
            catch { log("error", "worker.error", { code: "BILLING_" + job.code + "_FAILED" }); }
          }
        }
        for (const event of await processor.pending()) {
          if (stopped) break;
          if (queue) await queue.publish(event.id); else await processor.process(event.id);
        }
      } catch { log("error", "worker.error", { code: "POLL_FAILED" }); }
      if (!stopped) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } finally {
    await subscription?.close();
    await queue?.close();
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => {
  const code = error instanceof Error && ["SMTP_NOT_CONFIGURED", "OUTBOX_ENCRYPTION_KEY_REQUIRED"].includes(error.message)
    ? error.message : "WORKER_FAILED";
  log("error", "worker.error", { code }); process.exitCode = 1;
});
