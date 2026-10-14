# Hoàn thiện trợ lý AI — 13/10/2026

## Đã triển khai

**Backend:** giải thích dễ đọc theo số liệu kế hoạch đã lưu; định dạng tiền chính xác; phân biệt thiếu, dư, không xác định và góp vượt khả năng. Câu hỏi thay đổi điều kiện phải đi qua bộ tính mô phỏng. Có giải thích nội bộ khi Gemini không khả dụng, dẫn nguồn đã duyệt còn hiệu lực, đặt tên hội thoại theo câu đầu và lưu đúng thứ tự hỏi–đáp.

**Người dùng:** quyền xử lý/lưu lịch sử rõ ràng; giữ câu hỏi khi lỗi; thử lại cùng yêu cầu; không trộn phản hồi giữa các hội thoại. Mở, đổi tên, sửa câu hỏi, xuất, xóa có xác nhận, xóa hết và tải thêm lịch sử. Form thử tháng nghỉ hưu/tiền góp/chi tiêu lấy từ kế hoạch thật, nhận số 0, chặn ô trống. Bảng so sánh dùng đúng ngày và cơ sở, không thay dữ liệu thiếu bằng 0. Tăng cỡ chữ, làm rõ ô nhập, thu gọn thông tin kỹ thuật.

**Quản trị:** thêm, đọc, sửa tài liệu, URL gốc và ngày hết hiệu lực; tạo chỉ mục, duyệt, thu hồi. Bản sửa cần xử lý/duyệt lại trước khi AI sử dụng. Bỏ mô tả các chức năng chưa có như giám sát lưu lượng và Hội đồng An toàn AI giả lập.

## Kiểm tra đã chạy

| Nhóm | Bằng chứng |
|---|---|
| Backend toàn bộ | 677 tests / 58 files đạt |
| AI/Gemini sau chỉnh thứ tự lưu | 35 tests / 2 files đạt |
| Frontend hợp đồng và tiện ích | 61 tests đạt, gồm tiền vượt Number.MAX_SAFE_INTEGER |
| TypeScript | Backend source/test và frontend đạt |
| Build | Frontend production + prerender đạt; backend Prisma generate riêng + TypeScript emit đạt; startup guard đạt |
| HTTP + PostgreSQL | `backend/scripts/verify-ai-db.cjs`: 22 checks đạt, đối chiếu fingerprint và rollback; gồm nhiều cặp hỏi–đáp, quyền sở hữu, consent, idempotency, tri thức, simulation, expiry |
| Gemini thật | `backend/scripts/verify-gemini.cjs`: developer / gemini-3.8-flash đạt, dữ liệu giả lập |
| Trình duyệt có API fixture | 28 tình huống đạt; thêm 1 bài so sánh khác ngày/số tiền lớn đạt trên bản dựng cuối (29 tổng cộng) |
| Desktop đăng nhập DB local | 13 checks đạt ở 1440×1000: Admin thêm/index/duyệt/sửa/reindex/reapprove; User hỏi, mô phỏng kế hoạch, mở/đổi tên/xuất/sửa/xóa; không có lỗi JavaScript; rollback khớp fingerprint |

Bài desktop dùng hai tài khoản test chủ dự án cung cấp, gọi API thật, không mock nghiệp vụ. Lượt hoàn chỉnh cuối chạy `AI_PROVIDER=none`, không gửi dữ liệu tài khoản ra ngoài. Các lượt trước đã nhận `AI_ASSISTED` nhưng dừng ở điều kiện/selector của script; không tính là nghiệm thu trọn luồng. Một lượt chạy lại có gửi dữ kiện tài khoản sang Gemini bị cơ chế duyệt tự động chặn; đã chuyển sang phương án nội bộ. Khóa Gemini/cấu hình thật không bị thay đổi.

Script local và ảnh kiểm chứng nằm trong `artifacts/retiree-50-review/verify-ai-browser.cjs` và `artifacts/ai-completion/` (ignored). Mật khẩu chỉ truyền qua biến môi trường lúc chạy, không ghi vào mã/báo cáo. Bản dựng dùng máy chủ riêng; không tắt máy chủ của người dùng, không reset/migrate database, không gửi email.

## Phạm vi còn cần tách rõ

- Trợ lý giải thích dữ kiện và trích đoạn đã duyệt; Gemini không tự sinh số tiền, tự đổi hồ sơ hoặc áp dụng phương án. Không phải chatbot tư vấn tự do hay fine-tuning.
- Mô phỏng thử không tự lưu; người dùng lập/lưu/áp dụng tại luồng kế hoạch. Bản cập nhật từ thực tế cần dùng luồng mô phỏng tương ứng, không sửa bằng form baseline.
- Tài liệu kiểm thử được rollback. Nội dung thật phải được quản trị viên nhập và duyệt; không tự công bố bộ dữ liệu hoặc quy tắc pháp lý.
- Bằng chứng ở local. Triển khai production, vận hành retention, backup và điều khoản nhà cung cấp vẫn theo hồ sơ vận hành riêng.
