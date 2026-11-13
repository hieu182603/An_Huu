import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { digest } from "../../common/digest";
import { AppError } from "../../common/errors";
import { SocketService } from "../../services/socketService";

export const broadcastInput = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
}).strict();
export const BROADCAST_SCOPE = "admin.notification-broadcast";
export const BROADCAST_BATCH_SIZE = 1000;
export const BROADCAST_PATH = "/user/notifications";
type Progress = { broadcastId: string; title: string; message: string; snapshotAt: string; cursor: string | null; recipients: number; status: "IN_PROGRESS" | "COMPLETED" };
type Emit = (payload: { broadcastId: string; title: string; message: string; recipients: number }) => void;
const result = (p: Progress, replayed: boolean) => ({ broadcasted: true, broadcastId: p.broadcastId, title: p.title, message: p.message, recipients: p.recipients, replayed });

/**
 * Persists one notification per ACTIVE USER (snapshot: accounts created up to the first request), then pushes
 * the socket event for whoever is online. Each batch is its own short transaction that also advances the
 * cursor kept in idempotency_records, so a retry with the same Idempotency-Key resumes without duplicates
 * and a completed broadcast is replayed instead of re-sent.
 */
export class NotificationBroadcastService {
  constructor(private db: PrismaClient, private batchSize = BROADCAST_BATCH_SIZE,
    private emit: Emit = payload => SocketService.broadcast("notification:broadcast", { ...payload, persisted: true })) {}
  async broadcast(actorId: string, raw: z.infer<typeof broadcastInput>, key: string | undefined) {
    const input = broadcastInput.parse(raw);
    if (!key || !z.string().uuid().safeParse(key).success)
      throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Thiếu header Idempotency-Key (UUID) cho thao tác gửi thông báo.");
    const id = { userId: actorId, scope: BROADCAST_SCOPE, key };
    let progress = await this.claim(actorId, id, input);
    if (progress.status === "COMPLETED") return result(progress, true);
    let completedHere = false;
    while (progress.status !== "COMPLETED") ({ progress, completedHere } = await transaction(this.db, tx => this.step(tx, actorId, id)));
    if (completedHere) this.emit({ broadcastId: progress.broadcastId, title: progress.title, message: progress.message, recipients: progress.recipients });
    return result(progress, false);
  }
  /** Records the request (and its audit row) once; a different body under the same key is rejected. */
  private async claim(actorId: string, id: { userId: string; scope: string; key: string }, input: z.infer<typeof broadcastInput>): Promise<Progress> {
    const requestHash = digest(input);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await transaction(this.db, async tx => {
          const previous = await tx.idempotencyRecord.findUnique({ where: { userId_scope_key: id } });
          if (previous) {
            if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "Khóa yêu cầu đã dùng với nội dung khác.");
            return previous.response as unknown as Progress;
          }
          const progress: Progress = { broadcastId: randomUUID(), ...input, snapshotAt: new Date().toISOString(), cursor: null, recipients: 0, status: "IN_PROGRESS" };
          await tx.idempotencyRecord.create({ data: { ...id, requestHash, response: progress as unknown as Prisma.InputJsonObject } });
          await audit(tx, actorId, "ADMIN_NOTIFICATION_BROADCAST", "NOTIFICATION_BROADCAST", progress.broadcastId, { title: input.title, message: input.message, idempotencyKey: id.key });
          return progress;
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    }
    throw new AppError(409, "CONCURRENT_UPDATE", "Yêu cầu đang được xử lý. Hãy thử lại.");
  }
  private async step(tx: Prisma.TransactionClient, actorId: string, id: { userId: string; scope: string; key: string }): Promise<{ progress: Progress; completedHere: boolean }> {
    const record = await tx.idempotencyRecord.findUnique({ where: { userId_scope_key: id } });
    if (!record) throw new AppError(409, "CONCURRENT_UPDATE", "Yêu cầu đang được xử lý. Hãy thử lại.");
    const current = record.response as unknown as Progress;
    if (current.status === "COMPLETED") return { progress: current, completedHere: false };
    const users = await tx.user.findMany({
      where: { role: "USER", status: "ACTIVE", createdAt: { lte: new Date(current.snapshotAt) }, ...(current.cursor ? { id: { gt: current.cursor } } : {}) },
      select: { id: true }, orderBy: { id: "asc" }, take: this.batchSize,
    });
    if (users.length) await tx.notification.createMany({ data: users.map(u => ({ userId: u.id, title: current.title, message: current.message, path: BROADCAST_PATH })) });
    const next: Progress = { ...current, cursor: users.at(-1)?.id ?? current.cursor, recipients: current.recipients + users.length,
      status: users.length < this.batchSize ? "COMPLETED" : "IN_PROGRESS" };
    await tx.idempotencyRecord.update({ where: { id: record.id }, data: { response: next as unknown as Prisma.InputJsonObject } });
    if (next.status === "COMPLETED")
      await audit(tx, actorId, "ADMIN_NOTIFICATION_BROADCAST_COMPLETED", "NOTIFICATION_BROADCAST", next.broadcastId, { recipients: next.recipients });
    return { progress: next, completedHere: next.status === "COMPLETED" };
  }
}
