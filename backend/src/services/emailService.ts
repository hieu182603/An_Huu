import { randomUUID } from "node:crypto";
import { createMailSender } from "../jobs/mail";
import { loadEnv } from "../config/env";
import { escapeHtml, renderAuthEmail } from "../templates/authEmail";

// Legacy callers use the same SMTP transport. Auth routes use the durable outbox.
export class EmailService {
  static async sendVerificationOtp(to: string, otp: string): Promise<boolean> {
    const config = loadEnv();
    const content = renderAuthEmail({ kind: "verification", name: "bạn", code: otp,
      link: config.CLIENT_URL + "/verify#email=" + encodeURIComponent(to), expiresAt: new Date(Date.now() + 3 * 60000) });
    await createMailSender()({ to, ...content, idempotencyKey: randomUUID() });
    return true;
  }

  static async sendConsultationConfirmation(to: string, userName: string, topic: string, time: string): Promise<boolean> {
    const text = `Xin chào ${userName},\nAn Hưu đã tiếp nhận nhu cầu tư vấn.\nChủ đề: ${topic}\nThời gian mong muốn: ${time}\nĐội ngũ tư vấn sẽ liên hệ để xác nhận lịch hẹn.`;
    await createMailSender()({ to, subject: "Tiếp nhận yêu cầu tư vấn - An Hưu", text,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;color:#0D2E59;background:#F2FAF8"><h2>An Hưu đã tiếp nhận yêu cầu</h2><p style="white-space:pre-line;line-height:1.7">${escapeHtml(text)}</p></div>`,
      idempotencyKey: randomUUID() });
    return true;
  }
}
