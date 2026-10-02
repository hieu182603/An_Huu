import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AppConfig } from "../config/env";
import { AppError } from "../common/errors";

export function seal(payload: object, config: AppConfig): Prisma.InputJsonObject {
  if (!config.OUTBOX_ENCRYPTION_KEY) throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Chức năng email chưa được cấu hình.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(config.OUTBOX_ENCRYPTION_KEY, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return { encrypted: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
export function unseal(payload: Prisma.JsonValue, config: AppConfig): unknown {
  if (!config.OUTBOX_ENCRYPTION_KEY || !payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("INVALID_OUTBOX_PAYLOAD");
  const { encrypted, iv, tag } = payload;
  if ([encrypted, iv, tag].some(v => typeof v !== "string")) throw new Error("INVALID_OUTBOX_PAYLOAD");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.OUTBOX_ENCRYPTION_KEY, "hex"), Buffer.from(iv as string, "base64"));
  decipher.setAuthTag(Buffer.from(tag as string, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted as string, "base64")), decipher.final()]).toString("utf8"));
}
export function enqueue(tx: Prisma.TransactionClient, type: string, entityId: string, payload: Prisma.InputJsonObject) {
  return tx.outboxEvent.create({ data: { type, entityId, payload } });
}
