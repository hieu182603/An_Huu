import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "./errors";
import { digest } from "./digest";
import { transaction } from "./transaction";

export async function idempotentCommand<T>(db: PrismaClient, userId: string, scope: string, key: string, input: unknown,
  work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  z.string().uuid().parse(key);
  const requestHash = digest(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await transaction(db, async tx => {
        const previous = await tx.idempotencyRecord.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
        if (previous) {
          if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "Khóa yêu cầu đã dùng với nội dung khác.");
          return previous.response as T;
        }
        const result = await work(tx);
        await tx.idempotencyRecord.create({ data: { userId, scope, key, requestHash, response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonObject } });
        return result;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      if (attempt === 2) throw new AppError(409, "CONCURRENT_UPDATE", "Dữ liệu vừa được cập nhật. Hãy tải lại.");
    }
  }
  throw new AppError(409, "CONCURRENT_UPDATE", "Dữ liệu vừa được cập nhật. Hãy tải lại.");
}
