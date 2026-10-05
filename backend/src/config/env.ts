import { z } from "zod";

const origin = z.string().url().refine(v => {
  const u = new URL(v);
  return ["http:", "https:"].includes(u.protocol) && u.origin === v;
}, "Phải là origin HTTP(S), không chứa đường dẫn.");
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().url().refine(v => /^postgres(ql)?:\/\//.test(v)),
  CLIENT_URL: origin.default("http://localhost:8443"),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default("an-huu-api"),
  JWT_AUDIENCE: z.string().min(1).default("an-huu-web"),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default("30d"),
  OUTBOX_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  JOB_TRANSPORT: z.enum(["inline", "azure"]).default("inline"),
  AZURE_SERVICE_BUS_NAMESPACE: z.string().regex(/^[a-zA-Z0-9-]+\.servicebus\.windows\.net$/).optional(),
  AZURE_SERVICE_BUS_QUEUE: z.string().default("anhuu-events"),
  HEALTH_TIMEOUT_MS: z.coerce.number().int().min(50).max(10000).default(1500),
  GOOGLE_CLIENT_ID: z.string().optional(),
  AI_PROVIDER: z.enum(["none", "gemini"]).default("none"),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_API_MODE: z.enum(["developer", "vertex-express"]).default("developer"),
  GEMINI_MODEL: z.string().regex(/^gemini-[a-z0-9.-]+$/).default("gemini-3.8-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(15000),
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) throw new Error("Cấu hình không hợp lệ: " +
    [...new Set(parsed.error.issues.map(i => i.path[0]))].join(", "));
  const config = parsed.data;
  if (config.AI_PROVIDER === "gemini" && !config.GEMINI_API_KEY)
    throw new Error("Gemini yêu cầu GEMINI_API_KEY.");
  if (config.JOB_TRANSPORT === "azure" && !config.AZURE_SERVICE_BUS_NAMESPACE)
    throw new Error("Azure queue yêu cầu AZURE_SERVICE_BUS_NAMESPACE.");
  if (config.COOKIE_SAME_SITE === "none" && config.NODE_ENV !== "production")
    throw new Error("SameSite=None yêu cầu cookie Secure trong production HTTPS.");
  const origins = [...new Set([config.CLIENT_URL, ...(config.CORS_ORIGINS?.split(",").map(v => v.trim()).filter(Boolean) ?? [])])];
  if (origins.some(v => !origin.safeParse(v).success)) throw new Error("Cấu hình không hợp lệ: CORS_ORIGINS");
  if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) throw new Error("Hai JWT secrets phải khác nhau.");
  if (config.NODE_ENV === "production") {
    const placeholder = /placeholder|replace|example|default|an_huu_production|change.?me|dev.only/i;
    if ([config.JWT_SECRET, config.JWT_REFRESH_SECRET].some(v => placeholder.test(v)))
      throw new Error("Production yêu cầu JWT secrets riêng, không dùng giá trị mẫu.");
    if (!source.CLIENT_URL || origins.some(v => !v.startsWith("https://")))
      throw new Error("Production yêu cầu CLIENT_URL và CORS_ORIGINS HTTPS rõ ràng.");
  }
  return Object.freeze({ ...config, origins: Object.freeze(origins) });
}
export type AppConfig = ReturnType<typeof loadEnv>;
