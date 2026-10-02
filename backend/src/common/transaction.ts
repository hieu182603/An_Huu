import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "./errors";
export async function transaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
      if (attempt === 2) throw new AppError(409, "CONCURRENT_UPDATE", "Dữ liệu vừa thay đổi, vui lòng thử lại.");
    }
  }
  throw new AppError(409, "CONCURRENT_UPDATE", "Vui lòng thử lại.");
}
