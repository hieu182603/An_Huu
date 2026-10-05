import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { loadRetentionConfig } from "./config/retention";
import { runAiRetention } from "./modules/ai/retention";
import { log } from "./common/logger";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--execute")) throw new Error("AI_RETENTION_ARGUMENT_INVALID");
  const config = loadRetentionConfig();
  const db = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } }, log: [] });
  const controller = new AbortController(), stop = () => controller.abort();
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    const result = await runAiRetention(db, { execute: args[0] === "--execute", batchSize: config.AI_RETENTION_BATCH_SIZE,
      maxBatches: config.AI_RETENTION_MAX_BATCHES, signal: controller.signal });
    log("info", "retention.completed", { code: result.cancelled ? "CANCELLED" : result.mode === "DRY_RUN" ? "DRY_RUN"
      : result.complete ? "COMPLETE" : "BACKLOG_REMAINS", eligible: result.eligible, deleted: result.deleted,
      remaining: result.remaining, batches: result.batches });
    if (result.cancelled || (result.mode === "EXECUTE" && !result.complete)) process.exitCode = 2;
  } finally {
    process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop);
    await db.$disconnect();
  }
}
main().catch(() => { log("error", "retention.failed", { code: "AI_RETENTION_FAILED" }); process.exitCode = 1; });
