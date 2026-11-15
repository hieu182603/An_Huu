import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "./errors";
// maxWait: each round trip to the hosted database can take ~0.5–1.5 s, so the
// default 2 s wait for a pooled connection surfaced as P2028 → 503 under light load.
// timeout comes from DB_TRANSACTION_TIMEOUT_MS (default 10 s); see config/env.ts.
let timeoutMs = 10000;
export function setTransactionTimeout(ms: number) { timeoutMs = ms; }
export async function transaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: timeoutMs }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
      if (attempt === 2) throw new AppError(409, "CONCURRENT_UPDATE", "Dữ liệu vừa thay đổi, vui lòng thử lại.");
    }
  }
  throw new AppError(409, "CONCURRENT_UPDATE", "Vui lòng thử lại.");
}
