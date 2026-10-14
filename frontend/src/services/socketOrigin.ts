/**
 * Socket.IO origin. Vercel rewrites cannot proxy WebSockets, so a production
 * build only connects when it has an absolute backend origin (VITE_SOCKET_URL,
 * or an absolute VITE_API_URL). Dev uses the Vite proxy on the same origin.
 * Without one, notifications fall back to the shared poll in socket.ts.
 */
export function socketOrigin(env: { DEV?: boolean; VITE_SOCKET_URL?: string; VITE_API_URL?: string } = import.meta.env): string | null {
  if (env.VITE_SOCKET_URL) return env.VITE_SOCKET_URL.replace(/\/$/, "");
  if (env.VITE_API_URL && /^https?:\/\//.test(env.VITE_API_URL)) return new URL(env.VITE_API_URL).origin;
  return env.DEV ? "/" : null;
}
