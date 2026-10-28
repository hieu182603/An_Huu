import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { transaction } from "../common/transaction";

describe("transaction helper", () => {
  it("waits up to 10 s for a pooled connection on the slow hosted database", async () => {
    const $transaction = vi.fn(async (work: (tx: unknown) => Promise<string>) => work({}));
    await expect(transaction({ $transaction } as unknown as PrismaClient, async () => "ok")).resolves.toBe("ok");
    expect($transaction).toHaveBeenCalledWith(expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 10000 });
  });
});
