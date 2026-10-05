import { z } from "zod";

// This job needs only the database. SMTP, JWT, Azure and Gemini are unrelated.
export function loadRetentionConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = z.object({
    DATABASE_URL: z.string().url().refine(v => /^postgres(ql)?:\/\//.test(v)),
    AI_RETENTION_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
    AI_RETENTION_MAX_BATCHES: z.coerce.number().int().min(1).max(100).default(10),
  }).safeParse(source);
  if (!parsed.success) throw new Error("AI_RETENTION_CONFIG_INVALID");
  return parsed.data;
}
