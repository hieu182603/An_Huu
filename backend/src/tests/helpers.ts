import { loadEnv } from "../config/env";
import jwt from "jsonwebtoken";
export const testEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://anhuu_test@127.0.0.1:55432/anhuu_b00_test",
  JWT_SECRET: "test-access-key-for-isolated-tests-only-012345",
  JWT_REFRESH_SECRET: "test-refresh-key-for-isolated-tests-only-678901",
  CLIENT_URL: "http://localhost:8443", HEALTH_TIMEOUT_MS: "50",
  OUTBOX_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".slice(0, 64),
};
export const config = loadEnv(testEnv);
export function token(role: "USER" | "ADMIN" = "USER", expiresIn = 60) {
  return jwt.sign({ userId: "test-user", email: "test@example.test", role }, config.JWT_SECRET, {
    algorithm: "HS256", issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, expiresIn,
  });
}
