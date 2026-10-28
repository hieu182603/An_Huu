import { parentPort } from "node:worker_threads";
import { AppError } from "../../common/errors";
import { RetirementService } from "./service";
import type { PreviewJob, PreviewReply } from "./preview-pool";

// Pure computation: the snapshot was captured by the main thread, so no database
// client is created here. The reply is JSON-shaped exactly as the HTTP response.
const service = new RetirementService(null as never);
parentPort!.on("message", ({ id, job }: { id: number; job: PreviewJob }) => {
  let reply: PreviewReply;
  try {
    const result = service.previewCaptured(job.snapshot, job.input, job.options);
    reply = { id, result: JSON.parse(JSON.stringify(result)) };
  } catch (error) {
    reply = { id, error: error instanceof AppError
      ? { status: error.status, code: error.code, message: error.message }
      : { message: error instanceof Error ? error.message : String(error) } };
  }
  parentPort!.postMessage(reply);
});
