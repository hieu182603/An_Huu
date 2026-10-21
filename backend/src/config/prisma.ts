import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Azure drops idle TCP connections without notifying the client; without a socket
// timeout Prisma keeps waiting on the dead sockets and every request fails with a
// pool timeout until the app restarts. Explicit values in DATABASE_URL win.
export function withConnectionTimeouts(url: string | undefined) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    for (const [key, value] of [["connect_timeout", "10"], ["socket_timeout", "30"], ["pool_timeout", "15"]])
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    return parsed.toString();
  } catch { return url; }
}

const url = withConnectionTimeouts(process.env.DATABASE_URL);

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: [],
    ...(url ? { datasources: { db: { url } } } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
