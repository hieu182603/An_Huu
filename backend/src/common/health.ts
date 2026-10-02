import { AppError } from "./errors";
export function createReadinessCheck(probe: () => Promise<unknown>, timeoutMs: number) {
  let inFlight: Promise<unknown> | undefined;
  return async () => {
    // A stalled dependency must not accumulate new queries for every health request.
    if (!inFlight) inFlight = Promise.resolve().then(probe).finally(() => { inFlight = undefined; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([inFlight, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
      })]);
    } catch { throw new AppError(503, "NOT_READY", "Dịch vụ chưa sẵn sàng."); }
    finally { if (timer) clearTimeout(timer); }
  };
}
