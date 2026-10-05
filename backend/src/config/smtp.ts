import { z } from "zod";

const smtpSchema = z.object({
  SMTP_HOST: z.string().trim().min(1).refine(value => !/[\s/:]/.test(value)),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_USER: z.string().trim().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM_EMAIL: z.string().trim().email(),
  SMTP_FROM_NAME: z.string().trim().min(1).max(120).default("An Hưu"),
});

function parse(source: NodeJS.ProcessEnv) {
  return smtpSchema.safeParse({ ...source, SMTP_FROM_EMAIL: source.SMTP_FROM_EMAIL || source.SMTP_USER });
}
export function smtpConfigured(source: NodeJS.ProcessEnv = process.env): boolean {
  const result = parse(source);
  if (!result.success) return false;
  return result.data.SMTP_PORT !== 465 || result.data.SMTP_SECURE !== "false";
}
export function loadSmtpConfig(source: NodeJS.ProcessEnv = process.env) {
  const result = parse(source);
  if (!result.success || (result.data.SMTP_PORT === 465 && result.data.SMTP_SECURE === "false")) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }
  const value = result.data;
  return {
    host: value.SMTP_HOST, port: value.SMTP_PORT,
    secure: value.SMTP_SECURE ? value.SMTP_SECURE === "true" : value.SMTP_PORT === 465,
    user: value.SMTP_USER, pass: value.SMTP_PASS,
    from: { name: value.SMTP_FROM_NAME, address: value.SMTP_FROM_EMAIL },
  };
}
export type SmtpConfig = ReturnType<typeof loadSmtpConfig>;
