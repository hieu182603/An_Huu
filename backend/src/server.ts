import http from "http";
import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";
import { prisma } from "./config/prisma";
import { initSocket } from "./config/socket";

const PORT = Number(process.env.PORT || process.env.WEBSITE_PORT || 5000);
const app = createApp();

// Tạo Node HTTP Server để dùng chung cho cả Express và Socket.io
const httpServer = http.createServer(app);

// Khởi tạo Socket.io trên HTTP server
const io = initSocket(httpServer);

async function start() {
  try {
    // Kiểm tra kết nối cơ sở dữ liệu PostgreSQL
    await prisma.$connect();
    console.log(" Kết nối PostgreSQL (Prisma) thành công.");

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 An Hưu Backend đang chạy tại http://0.0.0.0:${PORT}`);
      console.log(`⚡ WebSocket (Socket.io) đã sẵn sàng phục vụ real-time.`);
      console.log(`📡 Môi trường: ${process.env.NODE_ENV || "development"}`);
    });

    // Graceful Shutdown cho Docker & Azure Container
    const shutdown = async (signal: string) => {
      console.log(`\n Nhận tín hiệu ${signal}. Đang đóng server và ngắt kết nối WebSocket...`);
      io.close(() => {
        console.log(" Socket.io đã đóng kết nối.");
      });
      httpServer.close(async () => {
        await prisma.$disconnect();
        console.log(" Đã ngắt kết nối PostgreSQL. Tiến trình kết thúc an toàn.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Không thể kết nối cơ sở dữ liệu hoặc khởi chạy server:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

start();
