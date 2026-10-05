import nodemailer from "nodemailer";
import { createHash } from "node:crypto";
import { loadSmtpConfig, type SmtpConfig } from "../config/smtp";
import type { MailSender } from "./handlers";
export class MailDeliveryError extends Error {
  constructor(public readonly code: "EMAIL_CREDENTIALS_INVALID" | "EMAIL_PROVIDER_FORBIDDEN" | "EMAIL_RATE_LIMITED" | "EMAIL_PROVIDER_UNAVAILABLE" | "EMAIL_REJECTED" | "EMAIL_NETWORK_ERROR") { super("EMAIL_DELIVERY_FAILED"); }
}
// SMTP is at-least-once: stable Message-ID helps tracing, but is NOT a provider
// idempotency guarantee if the worker dies after SMTP accepts a message.
export function createMailSender(config: SmtpConfig = loadSmtpConfig()): MailSender {
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, dnsTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true,
    logger: false, debug: false,
  });
  return async mail => {
    try {
      const result = await transport.sendMail({
        from: config.from, to: { address: mail.to, name: "" },
        subject: mail.subject, text: mail.text, html: mail.html,
        messageId: `<${createHash("sha256").update(mail.idempotencyKey).digest("hex")}@${config.from.address.split("@")[1]}>`,
      });
      if (!result.accepted?.length || result.rejected?.length) throw new MailDeliveryError("EMAIL_REJECTED");
    } catch (error) {
      if (error instanceof MailDeliveryError) throw error;
      const failure = error as { code?: string; responseCode?: number } | null;
      throw new MailDeliveryError(failure?.code === "EAUTH" ? "EMAIL_CREDENTIALS_INVALID"
        : failure?.responseCode === 421 || failure?.responseCode === 450 ? "EMAIL_RATE_LIMITED"
        : failure?.responseCode && failure.responseCode >= 500 ? "EMAIL_REJECTED"
        : failure?.responseCode && failure.responseCode >= 400 ? "EMAIL_PROVIDER_UNAVAILABLE"
        : "EMAIL_NETWORK_ERROR");
    }
  };
}
