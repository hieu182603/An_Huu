import { getIO } from "../config/socket";

export class SocketService {
  /**
   * Gửi thông báo real-time tới 1 người dùng cụ thể
   * Ví dụ: Cập nhật tiến độ kế hoạch, phản hồi hỗ trợ
   */
  static notifyUser(userId: string, event: string, payload: any): void {
    try {
      const io = getIO();
      io.to(`user:${userId}`).emit(event, {
        ...payload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`Không thể gửi socket tới user ${userId}:`, err);
    }
  }

  /**
   * Bắn thông báo real-time tới toàn bộ Quản trị viên (Admin)
   * Ví dụ: Có yêu cầu hỗ trợ mới, hoặc có cảnh báo hệ thống
   */
  static notifyAdmins(event: string, payload: any): void {
    try {
      const io = getIO();
      io.to("room:admins").emit(event, {
        ...payload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Không thể gửi socket tới Admins:", err);
    }
  }

  /**
   * Phát thông báo tới tất cả client đang kết nối (Broadcast)
   * Ví dụ: Bật chế độ bảo trì, cập nhật tham số vĩ mô mới
   */
  static broadcast(event: string, payload: any): void {
    try {
      const io = getIO();
      io.emit(event, {
        ...payload,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Không thể broadcast socket:", err);
    }
  }

}
