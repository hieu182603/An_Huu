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
  let stopped = false;
  let nextAiPurge = 0;
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
