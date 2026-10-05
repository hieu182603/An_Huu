import type { CorsOptions } from "cors";
import type { AppConfig } from "./env";
import { AppError } from "../common/errors";
export function isAllowedOrigin(origin: string | undefined, config: AppConfig): boolean {
  return origin === undefined || config.origins.includes(origin);
}
export function corsOptions(config: AppConfig): CorsOptions {
  return {
    origin: (origin, callback) => isAllowedOrigin(origin, config)
      ? callback(null, true)
      : callback(new AppError(403, "ORIGIN_NOT_ALLOWED", "Nguồn truy cập không được phép.")),
    credentials: true, exposedHeaders: ["X-Request-Id", "Retry-After", "Content-Disposition"],
  };
}
