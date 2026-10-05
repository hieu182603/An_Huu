# Dọn lịch sử AI và kiểm chứng khôi phục

Cập nhật 05/10/2026. T10/T12 bổ sung tác vụ chạy độc lập, không phụ thuộc SMTP, JWT, outbox, Azure queue hoặc Gemini. Không migration mới; giữ nguyên thời hạn hội thoại đã lưu và policy đồng ý.

## Chạy tác vụ

Sau khi build, từ thư mục backend:

```text
node dist/retention.js
node dist/retention.js --execute
```

Lệnh đầu **chỉ đọc**, trả số hội thoại đủ điều kiện và không xóa. Lệnh thứ hai thực thi; tương ứng `npm run retention:check` và `npm run retention:run`. Đối số lạ bị từ chối. Production dùng entrypoint đã biên dịch này; script cũ `purge-ai-history.cjs` là công cụ local trước đây, không dùng làm lịch vận hành mới.

Chỉ cần `DATABASE_URL` trỏ đúng môi trường. `AI_RETENTION_BATCH_SIZE` mặc định100 (1–1000), `AI_RETENTION_MAX_BATCHES` mặc định10 (1–100). Giữ secret trong môi trường chạy. Cùng image backend có thể chạy command `node dist/retention.js --execute` dưới dạng scheduled job; không cần mở cổng HTTP.

Mỗi lượt giữ một mốc cutoff và chỉ xóa conversation có expiresAt≤cutoff hoặc legacy không có expiresAt (API đã chặn truy cập loại này). Mỗi lô xóa messages/context và conversation trong một transaction SERIALIZABLE; lỗi rollback cả lô. Hội thoại còn hạn giữ nguyên. Không xóa nguồn tri thức, consent, audit, hồ sơ hoặc kế hoạch. Giới hạn lô giúp tránh một lượt chạy không có điểm dừng; lượt sau tiếp tục phần tồn đọng.

SIGTERM/SIGINT dừng trước lô tiếp theo, chờ transaction hiện tại kết thúc và đóng DB. Log chỉ có mã kết quả/số lượng, không có ID, nội dung chat hoặc URL/credential DB. Kết quả:

| Mã | Ý nghĩa | Exit |
| --- | --- | --- |
| DRY_RUN | Đã đếm, không xóa; không phải bằng chứng đã dọn | 0 |
| COMPLETE | Không còn hội thoại đủ điều kiện tại cutoff ở lần đếm cuối | 0 |
| BACKLOG_REMAINS | Đã đạt giới hạn lô, còn dữ liệu chờ | 2 |
| CANCELLED | Nhận yêu cầu dừng giữa các lô | 2 |
| AI_RETENTION_FAILED | Cấu hình/đối số/kết nối/transaction lỗi; không in exception gốc | 1 |

Các counts có thể thay đổi nếu request/worker khác xóa đồng thời; không dùng eligible−deleted để suy số còn lại, tác vụ đếm lại DB. Worker outbox hiện hữu vẫn gọi cùng hàm mỗi phút với mặc định100×10 và ghi số lượng; nếu worker không khởi động vì thiếu SMTP, scheduled job độc lập vẫn dùng được. Không coi outbox worker và lịch riêng là đã được triển khai chỉ vì mã tồn tại.

## Thiết lập trên môi trường triển khai — còn mở

- Dùng đúng secret DB của môi trường và image đã build; chạy lệnh chỉ đọc trước, kiểm tra log/exit.
- Cấu hình scheduler chạy `--execute` mỗi phút, một lượt chủ động tại một thời điểm. Đặt timeout lớn hơn thời gian lô thực đo, retry có giới hạn; exit2 cần lượt tiếp theo, exit1 cần cảnh báo.
- Theo dõi lần hoàn thành gần nhất và remaining; cảnh báo khi không có kết quả qua nhiều chu kỳ hoặc backlog không giảm. API chặn đọc hết hạn ngay cả khi scheduler ngừng, nhưng xóa vật lý vẫn cần job.
- Chưa chọn/cấu hình scheduler production trong phiên này; không tự khởi động worker gửi mail, không xóa dữ liệu thật để thử tác vụ.

## Sao lưu và khôi phục

`node scripts/verify-clean-upgrade.cjs` nay có thêm pg_dump custom-format → pg_restore vào DB thứ ba trong container PostgreSQL tạm, kiểm count/digest của toàn bộ bảng trước/sau. Sau đó chạy chính `dist/retention.js` ở chế độ chỉ đọc và thực thi, với SMTP/JWT/outbox/Gemini key trống; xác minh conversation/message hết hạn bị xóa, hồ sơ/tài liệu khác giữ nguyên. Build trước khi chạy. Script không đọc `.env` làm nguồn DB, không backup dữ liệu khách hàng; chỉ container tạo riêng có nhãn và port localhost tạm. Dump nằm trong container, được dọn cùng container/volume có nhãn sở hữu.

Đây là **diễn tập khôi phục với dữ liệu mẫu**, chưa là bằng chứng backup/restore production. Khi triển khai thật cần đích lưu mã hóa/quyền truy cập/thời hạn lưu, lịch backup, mục tiêu mất dữ liệu/thời gian phục hồi và diễn tập với backup được phép sử dụng. Không tự coi việc xóa DB hiện hành là đã xóa các bản sao lưu hoặc bản sao phía Google.

DB khôi phục phải cách ly khỏi API/worker/provider cho đến khi đối chiếu schema/checksum, dọn dữ liệu hết hạn và xử lý các yêu cầu xóa/thu hồi phát sinh sau thời điểm backup. **Purge theo expiresAt không xử lý được hội thoại chưa hết hạn đã bị người dùng xóa sau backup**; cần sổ yêu cầu xóa đáng tin cậy ngoài bản backup cùng quy trình áp lại trước mở dịch vụ. Cơ chế đó và quyền dữ liệu toàn tài khoản/P36 vẫn còn mở, không suy đã đạt từ diễn tập này.

## Bằng chứng ngày05/10

- 295tests/26files và test typecheck PASS;5test retention mới: dry-run, giới hạn/drain/idempotency, rollback lô, dừng, cấu hình.
- Isolated Prisma generation/TypeScript emit và startup thiếu secret PASS.
- `verify-retention-db.cjs`:7checks PASS, mọi read/delete retention giới hạn đúng ID mẫu, rollback và fingerprint35bảng giữ nguyên. Lần đầu kết nối lỗi trước fixture; SELECT1 phục hồi, lần cuối đạt.
- `node dist/retention.js` trên DB đang cấu hình: DRY_RUN, eligible0/deleted0/remaining0; không chạy `--execute` trên dữ liệu thật.
- `verify-clean-upgrade.cjs`: clean10/upgrade4→10,10integration/2files PASS; pg_dump/restore35bảng fingerprint khớp, standalone cleanup sau restore PASS, container đã dọn. Artifact `.cache/migration-fd1bd4f2-f2d2-4276-9b06-1627cd76afc7/result.json`.
- Chưa chạy lịch Azure/scheduler production, GitHub Actions hoặc backup production. Không sửa frontend.
