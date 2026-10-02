import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { type TokenPayload } from "../middlewares/authMiddleware";

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: TokenPayload;
  };
}

let ioInstance: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://localhost:3000",
  ];

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
          callback(null, true);
        } else {
          callback(new Error("CORS Socket Policy Violation"));
        }
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // Middleware xác thực JWT cho kết nối WebSocket
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization?.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.split(" ")[1]
        : null);

    if (!token) {
      // Cho phép kết nối ẩn danh (Guest) nếu chỉ xem bảng tin vĩ mô, nhưng không gán room user
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_dev_secret") as TokenPayload;
      (socket as AuthenticatedSocket).data.user = decoded;
      next();
    } catch (err) {
      next(new Error("Xác thực WebSocket thất bại: Token không hợp lệ hoặc đã hết hạn."));
    }
  });

  // Quản lý các phòng (Rooms) và sự kiện Real-time
  io.on("connection", (socket: AuthenticatedSocket) => {
    const user = socket.data.user;

    if (user) {
      // Mỗi người dùng tự động tham gia vào phòng riêng của họ: `user:{userId}`
      const userRoom = `user:${user.userId}`;
      socket.join(userRoom);
      console.log(`🔌 WebSocket: Người dùng [${user.email}] (${user.role}) đã kết nối -> Vào room [${userRoom}]`);

      // Nếu là ADMIN, tự động vào phòng quản trị viên: `room:admins`
      if (user.role === "ADMIN") {
        socket.join("room:admins");
        console.log(`🛡️ WebSocket: Admin [${user.email}] đã tham gia [room:admins]`);
      }
    } else {
      console.log(`🔌 WebSocket: Khách vãng lai (Guest) đã kết nối: ${socket.id}`);
    }

    // Lắng nghe sự kiện người dùng tham gia theo dõi 1 buổi tư vấn cụ thể
    socket.on("join:consultation", (consultationId: string) => {
      socket.join(`consultation:${consultationId}`);
    });

    // Lắng nghe rời phòng tư vấn
    socket.on("leave:consultation", (consultationId: string) => {
      socket.leave(`consultation:${consultationId}`);
    });

    // Xử lý ngắt kết nối
    socket.on("disconnect", (reason) => {
      console.log(`🔌 WebSocket ngắt kết nối: ${socket.id} (Lý do: ${reason})`);
    });
  });

  ioInstance = io;
  return io;
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error("Socket.io chưa được khởi tạo. Hãy gọi initSocket(httpServer) trước.");
  }
  return ioInstance;
}
