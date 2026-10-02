# B00 — Nền API

Đọc PROGRESS.md trước khi tiếp tục. Theo yêu cầu ngày 02/10/2026, bỏ qua bước kết nối database; integration test database được chuẩn bị nhưng chưa chạy.

- API nghiệp vụ: /api/v1. OpenAPI chỉ liệt kê endpoint đã có.
- Success: { data, meta: { requestId } }; error: { error: { code, message, fieldErrors? }, requestId }.
- /health và /api/health giữ response cũ. /health/live kiểm tra process; /health/ready trả 503 khi database không sẵn sàng hoặc đang dừng.
- CLIENT_URL local: http://localhost:8443. CORS_ORIGINS thêm origin chính xác, không wildcard hoặc đường dẫn. CORS không thay xác thực.
- JWT_SECRET và JWT_REFRESH_SECRET độc lập, >=32 ký tự. Production từ chối secret mẫu và origin HTTP. Tạo bằng crypto.randomBytes; không commit .env.
- TRUST_PROXY_HOPS mặc định 0; chỉ đổi sau khi xác minh topology proxy và chặn đường truy cập trực tiếp bỏ qua proxy.
- JWT giới hạn HS256, issuer/audience, role và expiry. Auth lifecycle và database user status check thuộc B02.
- Room tư vấn từ chối USER/ADMIN/guest đến khi B07 có ownership policy. Guest không vào room user/admin; token hết hạn ngắt socket.
- Tiền API là decimal string Decimal(18,2), timestamp UTC, role USER/ADMIN; frontend map lowercase ở lớp API khi tích hợp B12.
- Logger chỉ ghi metadata allowlist, không body/query/token/email hoặc nguyên văn lỗi provider/database.
- Express 4 route mới dùng asyncHandler và Zod strict, cả object con.
- B00 còn dùng rate limiter bộ nhớ; shared store và multi-instance delivery thuộc B12.

## Kiểm tra không cần database

Trong backend: npm run verify. Prisma generate chỉ sinh client, không kết nối database. Test startup production thiếu secret cũng không kết nối database.

## Database checks sau khi setup

Dùng database test riêng có tên anhuu_*_test trên localhost. Đặt TEST_DATABASE_URL; chạy npm run db:test:prepare rồi npm run test:integration. Script không fallback DATABASE_URL, không reset/xóa database.

Baseline migration mô tả schema ban đầu. Database đã có bảng cần kiểm tra/baseline trước, không chạy migration tạo bảng mù quáng.

CI mặc định không chạy database checks. Có thể workflow_dispatch với run_database_checks=true sau khi sẵn sàng. Deploy cần BACKEND_DEPLOY_ENABLED=true; không phát hành khi database chưa cấu hình.

## Dependency

Vitest chuyển sang bản vá mới và config .mts; Cloudinary dùng SDK 2 + StorageEngine adapter nội bộ thay package khóa SDK 1. B08 vẫn cần kiểm tra upload thật, nội dung ảnh và quyền trước khi gắn route.
