# API tiện ích và quản trị — 03/10/2026

Tài liệu diễn giải các route mới, đồng bộ với hợp đồng `openapi.yaml` phiên bản 0.4.0.
Đã viết mã và nối giao diện; chưa chạy bộ kiểm thử cho đợt này theo yêu cầu người dùng.

## Quy ước

- Tiền tố `/api/v1`. Thành công: `{ data, meta: { requestId } }`; lỗi: `{ error: { code, message, fieldErrors? }, requestId }`.
- Route riêng tư cần `Authorization: Bearer <accessToken>`. `/admin/*` chỉ nhận ADMIN; `/me/*` lấy chủ sở hữu từ token, không nhận userId từ trình duyệt.
- Client dùng `credentials: include`, refresh bằng cookie HttpOnly và `X-CSRF-Protection: 1` cùng Origin hợp lệ; token truy cập chỉ giữ trong bộ nhớ.
- UUID trong đường dẫn; ngày giờ ISO 8601. Các body có schema strict, trường lạ bị từ chối.
- Danh sách: `page=1`, `limit=20` (tối đa 100), `{ items, total, page, limit }`. Các route có phân trang không trả toàn bộ database.
- `400`: dữ liệu sai; `401`: hết phiên; `403`: sai quyền; `404`: không tồn tại/không sở hữu; `409`: xung đột phiên bản; `429`: giới hạn yêu cầu.
- `503 DATABASE_UPDATE_REQUIRED`: bảng/cột chưa được cập nhật; `503 DATABASE_UNAVAILABLE`: kết nối DB gián đoạn. Lỗi không trả URL DB, token hoặc lỗi nhà cung cấp thô.
- Cần migration `202610030004_community_features` cho nội dung/bookmark/support/notification. Migration này chưa được áp dụng lên database ứng dụng trong phiên này. Không reset database để chạy migration.

## Tài khoản và người dùng

| Method/path | Body/query | Data trả về |
| --- | --- | --- |
| `POST /auth/change-password` | `{ currentPassword, password }` | `{ changed: true }`; thu hồi mọi phiên và xóa cookie refresh |
| `GET /me` | Không | PublicUser, gồm revision và emailVerifiedAt |
| `PATCH /me` | `{ expectedRevision, changes: { fullName?, phone?, city? } }` | PublicUser sau cập nhật |
| `POST /me/avatar` | Multipart `file`, `expectedRevision` | PublicUser sau cập nhật |
| `DELETE /me/avatar` | `{ expectedRevision }` | PublicUser sau cập nhật |
| `GET /admin/users` | `search` tối đa 120 ký tự, `status`, page/limit, sortBy=`createdAt/fullName/email`, order=`asc/desc` | Danh sách USER; không bao gồm ADMIN |
| `GET /admin/users/:id` | Không | `{ user, history }`; tối đa 30 thao tác gần nhất |
| `PATCH /admin/users/:id/status` | `{ expectedRevision, action: "suspend" hoặc "restore", reason }` | Người dùng sau cập nhật |

Mật khẩu mới tối thiểu 12 ký tự, tối đa 72 byte UTF-8, khác mật khẩu hiện tại. Sai mật khẩu hiện tại trả `INCORRECT_PASSWORD`. Thay đổi đồng thời trả `ACCOUNT_CHANGED`.

Avatar JPEG/PNG/WebP tối đa 5 MB; cấu hình lưu ảnh thiếu trả `MEDIA_NOT_CONFIGURED`; ảnh đã tải lên nhưng không lưu được do revision lỗi được yêu cầu xóa để tránh tệp mồ côi.

Khóa/mở khóa cần lý do 3–500 ký tự, tăng securityVersion và thu hồi phiên. Không cho tự khóa hoặc sửa trạng thái ADMIN. Người chưa xác minh được mở khóa về PENDING_VERIFICATION.

Thông báo đổi mật khẩu/sửa tài khoản được đưa vào outbox cùng transaction, worker tạo notification với ID sự kiện để tránh trùng. Account API không phụ thuộc trực tiếp vào bảng notification; worker vẫn cần bảng này để phát thông báo.

## Nội dung, FAQ, từ điển và lưu bài

| Method/path | Nội dung |
| --- | --- |
| `GET /content` | Công khai; chỉ trả nội dung PUBLISHED |
| `GET /admin/content` | Danh sách quản trị, gồm cả nháp |
| `POST /admin/content` | Tạo nội dung, trả 201 với bản ghi mới |
| `PATCH /admin/content/:id` | Sửa toàn bộ các trường nhập của bản ghi, kèm expectedRevision |
| `GET /me/saved-articles` | Trả mảng `{ articleId }`, chỉ bài ARTICLE đang PUBLISHED |
| `GET /me/saved-content` | Danh sách nội dung đã lưu có phân trang và bộ lọc |
| `PUT /me/saved-articles/:id` | Body `{}`; lưu idempotent, trả `{ saved: true }` |
| `DELETE /me/saved-articles/:id` | Không cần body; bỏ lưu idempotent, trả `{ saved: false }` |

Query: page/limit, sortBy=`updatedAt/title`, order=`asc/desc`, search tối đa 120 ký tự, category, kind=`ARTICLE/FAQ/GLOSSARY` (mặc định ARTICLE), status=`DRAFT/PUBLISHED` (chỉ có tác dụng trong quản trị).

Body tạo/sửa:

```json
{
  "title": "Tiêu đề nội dung",
  "slug": "tieu-de-noi-dung",
  "excerpt": "Mô tả ngắn",
  "content": "Nội dung văn bản thuần",
  "category": "Kế hoạch hưu trí",
  "authorName": "Ban biên tập",
  "thumbnail": null,
  "kind": "ARTICLE",
  "status": "DRAFT"
}
```

Khi sửa thêm `expectedRevision`. Title 3–200, slug tối đa 200 chữ Latin thường/số/dấu gạch nối; excerpt 1–1000; content 1–100000; category/authorName 1–120 ký tự. Thumbnail null hoặc URL HTTPS tối đa 2000 ký tự.

Data có thêm id, revision, publishedAt, updatedAt. Tìm kiếm chuẩn hóa không dấu và AND các từ. publishedAt do máy chủ quản lý. Ẩn bài bằng đổi trạng thái về DRAFT; bookmark giữ lại nhưng không trả bài đã ẩn cho người dùng.

## Hỗ trợ

| Method/path | Body/query | Data |
| --- | --- | --- |
| `GET /me/support` / `GET /admin/support` | page/limit, status, sortBy=`createdAt/updatedAt`, order | Danh sách ticket |
| `POST /me/support` | `{ subject, category, message }` | Ticket mới, HTTP 201 |
| `GET /me/support/:id` / `GET /admin/support/:id` | Không | Ticket và `messages` |
| `POST /me/support/:id/messages` / `POST /admin/support/:id/messages` | `{ message }` | `{ id }`, HTTP 201 |
| `PATCH /admin/support/:id` | `{ expectedRevision, status }` | `{ updated: true }` |

Subject 3–200 ký tự; category một trong `Tài khoản`, `Sử dụng website`, `Nội dung`, `Khác`. Tin nhắn đầu 3–5000, phản hồi 1–5000 ký tự. Ticket có id, userId, subject, category, status, revision, createdAt, updatedAt.

Trạng thái `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`. Ticket CLOSED không nhận phản hồi (409 TICKET_CLOSED). Người dùng phản hồi ticket RESOLVED sẽ mở lại OPEN. Mỗi phản hồi tăng revision.

Chi tiết trả tối đa 200 tin nhắn mới nhất, hiển thị theo thời gian tăng dần. Message có id, body, createdAt, author.fullName, author.role; không trả email của tác giả. Admin phản hồi/đổi trạng thái tạo thông báo cho chủ ticket.

## Nhu cầu tư vấn

| Method/path | Body/query | Data |
| --- | --- | --- |
| `GET /me/consultations` / `GET /admin/consultations` | page/limit, status, sortBy=`createdAt/updatedAt`, order | Danh sách nhu cầu |
| `POST /me/consultations` | `{ phone, topic, details, preferredTime? }` | Bản ghi mới, HTTP 201 |
| `PATCH /admin/consultations/:id` | `{ expectedUpdatedAt, status, notes, assignToMe? }` | `{ updated: true }` |

Phone di động Việt Nam 0/+84; topic 3–200; details 10–5000; preferredTime tối đa 200 ký tự. Tên/email lấy từ tài khoản xác thực. Đây là yêu cầu được liên hệ, chưa phải lịch hẹn được xác nhận.

Tạo ở trạng thái NEW; quản trị đổi sang NEW/PROCESSING/COMPLETED/CANCELLED, ghi notes tối đa 5000 ký tự, có thể nhận phụ trách bằng assignToMe. `expectedUpdatedAt` lấy nguyên ISO từ phản hồi trước. SCHEDULED legacy chỉ đọc/lọc, chưa tạo lịch tự động.

User response không có notes hoặc assignedAdminId. Admin response bổ sung hai trường này. Đổi trạng thái tạo notification cho chủ yêu cầu.

## Thông báo và vận hành

| Method/path | Body/query | Data |
| --- | --- | --- |
| `GET /me/notifications` | page/limit | `{ items, total, unread, page, limit }` |
| `POST /me/notifications/:id/read` | `{}` | `{ updated: true }` |
| `POST /me/notifications/read-all` | `{}` | `{ updated: true }` |
| `GET /admin/operations` | Không | asOfDate, api, database, uptimeSeconds, configuration, mailJobs, recentFailures, lastJobCompletedAt |
| `GET /admin/audit-logs` | page/limit, order, sortBy=`createdAt`, action (khớp chính xác), targetType=`USER/ARTICLE/SUPPORT/CONSULTATION` | Danh sách nhật ký |

Notification chỉ trả bản ghi thuộc tài khoản, mới nhất trước: id, title, message, path, readAt, createdAt. Đánh dấu đọc không sửa bản ghi của người khác.

Operations chỉ trả cờ có/không cấu hình, không trả secret. mailJobs đếm auth.verify_email/auth.reset_password theo trạng thái; recentFailures tối đa 20 mục gồm mã lỗi đã phân loại, số lần thử và thời gian. lastJobCompletedAt là lịch sử tác vụ gần nhất, không chứng minh worker còn sống hay email đã tới hộp thư.

Audit trả id, action, targetType, targetId, performerId, createdAt. Không trả payload tài chính, email OTP/reset, token hay nội dung chi tiết nhạy cảm.

## Bàn giao kiểm thử

Đã bổ sung OpenAPI machine-readable cho các route trong tài liệu này. AI kiểm tra cần chạy kiểm tra hợp đồng với các phản hồi thực tế; chưa chạy validation/contract tests trong đợt code này. Không coi bảng mô tả hay code đã viết là bằng chứng kiểm thử đạt.

Ưu tiên: migration trên bản sao DB; quyền sở hữu; phân quyền admin; revision; refresh/reload khi backend ngắt; gửi email thật sau khi cấu hình Resend được cấp quyền; upload ảnh; giao diện mobile. Không dùng database ứng dụng làm fixture hoặc reset dữ liệu.
