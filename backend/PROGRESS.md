# Tiến độ triển khai backend An Hưu

## Điểm tiếp tục

- Ngày: 02/10/2026.
- Phase hiện tại: **hoàn thiện B00, code nhóm B01–B03**.
- Chỉ dẫn mới nhất của người dùng: code các module theo nhóm rồi kiểm tra chung; bỏ qua kết nối database vì chưa setup. Thay thế yêu cầu kiểm tra từng phase trước khi chuyển ban đầu.
- Kế hoạch: `IMPLEMENTATION_PLAN.md`. Hướng dẫn phiên tiếp theo: `AGENTS.md`.

## Trạng thái phase

| Phase | Trạng thái |
| --- | --- |
| B00 | Đang thực hiện |
| B01–B03 | Đang code theo nhóm; sẽ kiểm tra chung |
| B04–B12 | Chưa bắt đầu |

## Mốc kiểm tra trước thay đổi

- Typecheck và 6/6 test nền đã pass trong phiên lập kế hoạch.
- Backend chưa có router nghiệp vụ hoặc migrations; B00 sẽ bổ sung hợp đồng và bảo vệ nền.
- PostgreSQL tạm đã được khởi chạy để chuẩn bị kiểm tra, sau đó dừng theo yêu cầu bỏ qua database. Chưa chạy migrations/integration tests lên database. Không dùng database của người dùng.

## Checklist B00

- [ ] Env validation, secret production, CORS dùng chung, trust proxy cấu hình.
- [ ] Request ID, logger an toàn, AppError/404/body errors, asyncHandler, Zod validation, pagination/sort, money/role contract.
- [ ] Health live/ready và timeout; giữ health legacy.
- [ ] Chặn room tư vấn riêng tư khi chưa có policy nghiệp vụ.
- [ ] OpenAPI và test HTTP/Socket.IO/contract.
- [ ] CI working directory, npm ci, Prisma generate/build, kiểm tra database tạm.
- [ ] Typecheck, build, toàn bộ test và rà soát diff thành công.

## Lần cập nhật đầu

Đã đọc lại setup, tạo nhật ký và quy tắc handoff. Không ghi nhận phase nào hoàn tất chỉ dựa trên kế hoạch.
