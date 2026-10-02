import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken, type TokenPayload } from "../middlewares/authMiddleware";
import { loadEnv, type AppConfig } from "./env";
import { corsOptions, isAllowedOrigin } from "./cors";
import { log } from "../common/logger";
export interface AuthenticatedSocket extends Socket { data: { user?: TokenPayload } }
let ioInstance: Server | null = null;
export function initSocket(httpServer: HttpServer, config: AppConfig = loadEnv(),
  authorize: (claims: TokenPayload) => Promise<unknown> = async () => { throw new Error("AUTH_NOT_CONFIGURED"); }): Server {
  const io = new Server(httpServer, {
    cors: corsOptions(config),
    // CORS alone does not restrict WebSocket upgrades.
    allowRequest: (req, done) => done(null, isAllowedOrigin(req.headers.origin, config)),
    maxHttpBufferSize: 64 * 1024, pingTimeout: 30000, pingInterval: 10000,
  });
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token ?? socket.handshake.headers.authorization?.replace(/^Bearer /, "");
    if (token === undefined) return next();
    if (typeof token !== "string" || !token) return next(new Error("UNAUTHENTICATED"));
    try {
      const claims = verifyAccessToken(token, config);
      authorize(claims).then(() => { socket.data.user = claims; next(); }).catch(() => next(new Error("UNAUTHENTICATED")));
    }
    catch { next(new Error("UNAUTHENTICATED")); }
  });
  io.on("connection", (socket: AuthenticatedSocket) => {
    const user = socket.data.user;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let recheck: ReturnType<typeof setInterval> | undefined;
    if (user) {
      socket.join(`user:${user.userId}`);
      if (user.role === "ADMIN") socket.join("room:admins");
      expiry = setTimeout(() => socket.disconnect(true), Math.max(0, Math.min(user.exp * 1000 - Date.now(), 2147483647)));
      expiry.unref();
      let checking = false;
      recheck = setInterval(() => {
        if (checking) return;
        checking = true;
        authorize(user).catch(() => socket.disconnect(true)).finally(() => { checking = false; });
      }, 15000);
      recheck.unref();
    }
    log("info", "socket.connected");
    // B07 adds ownership/assigned-admin policy. Fail closed until then.
    socket.on("join:consultation", (_id: unknown, ack: unknown) => {
      const result = { error: { code: user ? "FORBIDDEN" : "UNAUTHENTICATED", message: "Chưa được phép tham gia phòng tư vấn." } };
      if (typeof ack === "function") ack(result);
      else socket.emit("operation:error", result);
    });
    socket.on("leave:consultation", (id: unknown) => {
      if (typeof id === "string" && id.length <= 128) socket.leave(`consultation:${id}`);
    });
    socket.on("disconnect", () => {
      if (expiry) clearTimeout(expiry);
      if (recheck) clearInterval(recheck);
      log("info", "socket.disconnected");
    });
  });
  ioInstance = io;
  return io;
}
export function getIO(): Server {
  if (!ioInstance) throw new Error("Socket.io chưa được khởi tạo.");
  return ioInstance;
}
