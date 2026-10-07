import "dotenv/config";
import http from "node:http";
import { loadEnv } from "./config/env";
import { log } from "./common/logger";

async function start() {
  // Validate before importing integrations or connecting to the database.
  const config = loadEnv();
  const [{ createApp }, { prisma }, { initSocket }] = await Promise.all([
    import("./app"), import("./config/prisma"), import("./config/socket"),
  ]);
  const { createServices } = await import("./modules/services");
  const services = createServices(prisma, config);
  const app = createApp({ config, services });
  const server = http.createServer(app);
  const io = initSocket(server, config, claims => services.auth.validateSession(claims));
  let stopping = false;
  let stopWorker = () => {};
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    stopWorker();
    app.locals.draining = true;
    log("info", "server.stopping");
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    try {
      await new Promise<void>(resolve => io.close(() => resolve()));
      await prisma.$disconnect();
      clearTimeout(deadline);
      process.exit(0);
    } catch {
      log("error", "server.stop_failed");
      process.exit(1);
    }
  }
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  if (config.JOB_TRANSPORT === "inline" && config.OUTBOX_ENCRYPTION_KEY) {
    try {
      const [{ OutboxProcessor }, { createEventHandler }, { createMailSender }] = await Promise.all([
        import("./jobs/processor"), import("./jobs/handlers"), import("./jobs/mail"),
      ]);
      const processor = new OutboxProcessor(prisma, createEventHandler(prisma, config, createMailSender()));
      let workerStopped = false;
      stopWorker = () => { workerStopped = true; };
      const runPoll = async () => {
        while (!workerStopped && !stopping) {
          try {
            const pending = await processor.pending();
            for (const event of pending) {
              if (workerStopped || stopping) break;
              await processor.process(event.id);
            }
          } catch {
            // ignore background poll errors
          }
          if (!workerStopped && !stopping) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      };
      void runPoll();
      log("info", "worker.started");
    } catch {
      log("error", "worker.error", { code: "INLINE_INIT_FAILED" });
    }
  }
  try {
    await prisma.$connect();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.PORT, "0.0.0.0", resolve);
    });
    log("info", "server.started");
  } catch (error) {
    stopWorker();
    await new Promise<void>(resolve => io.close(() => resolve()));
    await prisma.$disconnect();
    throw error;
  }
}
void start().catch((error: unknown) => {
  // Invalid environment values and connection strings must never reach logs.
  const failure = error as { code?: unknown; errorCode?: unknown; name?: unknown; diagnosticCodes?: unknown } | null;
  const candidate = failure?.code ?? failure?.errorCode;
  const allowed = ["EADDRINUSE", "EACCES", "ECONNREFUSED", "ETIMEDOUT", "P1000", "P1001", "P1002", "P1011", "P1012", "P2021", "P2022"];
  const code = typeof candidate === "string" && allowed.includes(candidate) ? candidate
    : failure?.name === "TSError" ? "TYPESCRIPT_STARTUP_FAILED" : "STARTUP_FAILED";
  log("error", "server.start_failed", { code });
  if (code === "TYPESCRIPT_STARTUP_FAILED" && Array.isArray(failure?.diagnosticCodes)) {
    for (const diagnostic of failure.diagnosticCodes) {
      if (Number.isSafeInteger(diagnostic)) log("error", "server.start_failed", { code: `TS${diagnostic}` });
    }
  }
  process.exit(1);
});
