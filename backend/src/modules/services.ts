import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config/env";
import { AuthService } from "./auth/service";
import { ProfileService } from "./profiles/service";
import { getIO } from "../config/socket";
export function createServices(db: PrismaClient, config: AppConfig) {
  return {
    auth: new AuthService(db, config, id => {
      try { getIO().in("user:" + id).disconnectSockets(true); } catch { /* No socket server in HTTP-only jobs/tests. */ }
    }),
    profiles: new ProfileService(db),
  };
}
