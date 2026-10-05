import { type OutboxEvent, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppConfig } from "../config/env";
import { unseal } from "./outbox";
import { renderAuthEmail } from "../templates/authEmail";
import { handlePlanUpdateEvent } from "../modules/plans/events";

export type Mail = { to: string; subject: string; text: string; html?: string; idempotencyKey: string };
export type MailSender = (mail: Mail) => Promise<void>;
const mailPayload = z.object({ tokenId: z.string().uuid(), to: z.string().email(), token: z.string() }).strict();
export function createEventHandler(db: PrismaClient, config: AppConfig, send: MailSender) {
  return async (event: OutboxEvent) => {
    if (["financial.recalculate_batch", "financial.recalculate_plan"].includes(event.type)) {
      await handlePlanUpdateEvent(db, event);
      return;
    }
    if (event.type === "notification.account_updated" || event.type === "notification.password_changed") {
      const user = await db.user.findUnique({ where: { id: event.entityId }, select: { id: true, role: true } });
      if (!user) return;
      const passwordChanged = event.type === "notification.password_changed";
      // Keep core account writes independent of the optional community schema.
      // An event ID provides idempotency if delivery is retried after a crash.
      await db.notification.upsert({ where: { id: event.id }, update: {}, create: {
        id: event.id, userId: user.id,
        title: passwordChanged ? "Mật khẩu đã được thay đổi" : "Thông tin tài khoản đã cập nhật",
        message: passwordChanged ? "Các phiên đăng nhập trước đã được thu hồi." : "Thông tin cá nhân của bạn vừa được thay đổi.",
        path: user.role === "ADMIN" ? "/admin/settings" : "/user/account",
      } });
      return;
    }
    if (event.type === "profile.changed" || event.type === "security.sessions_revoked") {
      // Durable change notification only in B01-B03. Plans are marked stale in the
      // originating transaction; API/socket authorization reads current DB state.
      return;
    }
    if (!["auth.verify_email", "auth.reset_password"].includes(event.type)) throw new Error("UNSUPPORTED_EVENT");
    const data = mailPayload.parse(unseal(event.payload, config));
    const record = await db.verificationToken.findUnique({ where: { id: data.tokenId }, include: { user: true } });
    const type = event.type === "auth.verify_email" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET";
    if (!record || record.type !== type || record.userId !== event.entityId || record.consumedAt ||
        record.expiresAt <= new Date() || record.user.status === "SUSPENDED" || record.user.email !== data.to ||
        (type === "EMAIL_VERIFICATION" && record.user.status !== "PENDING_VERIFICATION")) return;
    if (type === "EMAIL_VERIFICATION") {
      if (!/^\d{6}$/.test(data.token)) throw new Error("INVALID_MAIL_PAYLOAD");
      const link = config.CLIENT_URL + "/verify#email=" + encodeURIComponent(data.to);
      await send({ to: data.to, ...renderAuthEmail({ kind: "verification", name: record.user.fullName,
        code: data.token, link, expiresAt: record.expiresAt }), idempotencyKey: event.id });
    } else {
      if (!/^[a-zA-Z0-9_-]{43}$/.test(data.token)) throw new Error("INVALID_MAIL_PAYLOAD");
      // Fragment is consumed by the frontend; it is not sent in HTTP requests/referrers.
      const link = config.CLIENT_URL + "/reset-password#token=" + encodeURIComponent(data.token);
      await send({ to: data.to, ...renderAuthEmail({ kind: "reset", name: record.user.fullName,
        link, expiresAt: record.expiresAt }), idempotencyKey: event.id });
    }
  };
}
