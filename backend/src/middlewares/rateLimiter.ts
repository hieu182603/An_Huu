import rateLimit from "express-rate-limit";

// Rate limiter chung cho toàn bộ API
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 300, // Tối đa 300 requests / 15 phút
  standardHeaders: true, // Trả header `RateLimit-*`
  legacyHeaders: false, // Tắt header `X-RateLimit-*`
  message: {
    success: false,
    message: "Quá nhiều yêu cầu từ địa chỉ IP của bạn. Vui lòng thử lại sau 15 phút.",
  },
});

// Rate limiter nghiêm ngặt cho Authentication (Đăng nhập, Đăng ký, Quên mật khẩu, OTP)
// Mục đích: Chặn tấn công Brute Force mật khẩu & Chống spam gửi mail qua Nodemailer
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10, // Tối đa 10 lần thử / 15 phút trên mỗi IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: "Bạn đã thao tác đăng nhập/xác thực quá số lần cho phép. Vui lòng đợi 15 phút trước khi thử lại.",
  },
});

// Rate limiter cho Trợ lý Hưu trí AI
// Mục đích: Tránh cạn kiệt Quota API Gemini/OpenAI và chống spam hội thoại
export const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 15, // Tối đa 15 tin nhắn / phút
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Trợ lý AI đang xử lý nhiều yêu cầu. Vui lòng chờ 1 phút trước khi gửi tin nhắn tiếp theo.",
  },
});

// Rate limiter cho upload tệp lên Cloudinary
// Mục đích: Tránh lạm dụng dung lượng lưu trữ Cloudinary & băng thông
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20, // Tối đa 20 tệp / 15 phút
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Bạn đã tải lên quá nhiều tệp trong thời gian ngắn. Vui lòng thử lại sau.",
  },
});

// Rate limiter cho gửi yêu cầu tư vấn 1-1
export const consultationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 5, // Tối đa 5 lần gửi lịch hẹn / giờ
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Bạn đã gửi đủ số yêu cầu tư vấn cho phép trong giờ này. Chuyên viên sẽ sớm liên hệ lại.",
  },
});
