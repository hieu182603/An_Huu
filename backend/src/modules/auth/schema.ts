import { z } from "zod";
export const emailSchema = z.string().trim().email().max(254).transform(v => v.toLowerCase());
export const passwordSchema = z.string().min(12).refine(v => Buffer.byteLength(v, "utf8") <= 72, "Mật khẩu tối đa 72 byte UTF-8.");
export const registerSchema = z.object({ email: emailSchema, password: passwordSchema, fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().transform(v => v.replace(/[ ()-]/g, "")).refine(v => /^(?:0|\+84)[35789]\d{8}$/.test(v), "Số điện thoại di động Việt Nam không hợp lệ.").optional(),
}).strict();
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).refine(v => Buffer.byteLength(v, "utf8") <= 72), remember: z.boolean().default(false) }).strict();
export const emailRequestSchema = z.object({ email: emailSchema }).strict();
export const verifySchema = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/) }).strict();
export const resetSchema = z.object({ token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/), password: passwordSchema }).strict();
export const googleAuthSchema = z.object({ credential: z.string().min(10) }).strict();
export const emptySchema = z.object({}).strict();
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200), password: passwordSchema,
}).strict().refine(v => v.currentPassword !== v.password, "Mật khẩu mới phải khác mật khẩu hiện tại.");
