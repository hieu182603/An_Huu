import { createHash } from "node:crypto";
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v !== null && typeof v === "object" ? `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k])).join(",")}}` : JSON.stringify(v);
export const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
