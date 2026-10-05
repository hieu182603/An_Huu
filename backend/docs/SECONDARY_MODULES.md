# T11 — Catalog, tùy chọn thông báo và module hiện có

Checkpoint 05/10/2026. Backend đã kiểm chứng; frontend nối theo FE-T11 trong `docs/task-frontend.md`. Không có chức năng giao dịch/mua sản phẩm, tư vấn chuyên viên hoặc chiến dịch gửi thông báo mới.

## Catalog

Tiền tố `/api/v1`; response `{data,meta:{requestId}}`, không cache.

| API | Quyền | Kết quả |
| --- | --- | --- |
| GET `/partners`, `/products` | Công khai | `{items,total,page,limit}`; chỉ hàng đã hiển thị |
| GET `/partners/:id`, `/products/:id` | Công khai | Một hàng hoặc 404; sản phẩm có partner, không contactEmail |
| GET `/admin/partners`, `/admin/products` và `/:id` | ADMIN | Cả nháp/ẩn, revision; contactEmail chỉ ở đối tác admin |
| POST `/admin/partners`, `/admin/products` | ADMIN | 201, hàng đã lưu, revision=0 |
| PUT `/admin/partners/:id`, `/admin/products/:id` | ADMIN | `{expectedRevision,data}` thay toàn bộ input; 409 nếu cũ, revision tăng 1 |

Danh sách hỗ trợ page=1..100000, limit=1..100 (mặc định20), search<=120, sortBy=name/updatedAt, order=asc/desc; partnerId là bộ lọc **sản phẩm**. ID UUID. Không có DELETE: ẩn bằng isVisible=false, giữ lịch sử/audit. URL đầu vào chỉ HTTPS; chuỗi văn bản phải render như text hoặc qua bộ sanitize của UI.

Đối tác: name, type=OPEN_FUND/BANK/INSURANCE/SECURITIES, logoUrl/website/contactEmail nullable, isHighlight, isVisible. Không bịa contactPerson/rating/trạng thái hợp đồng vì DB không có bằng chứng đó.

Sản phẩm: partnerId/name/category/expectedReturn/riskLevel=LOW/MEDIUM/HIGH, description/annualFee/conditions/disclosure nullable, isVisible. Nháp được thiếu thông tin; hiển thị phải có phí/điều kiện/disclosure không rỗng và đối tác đang hiển thị (422 PARTNER_NOT_VISIBLE nếu không). Ẩn đối tác làm toàn bộ sản phẩm của họ biến khỏi API công khai; bật lại sẽ hiện các sản phẩm đã được đánh dấu hiển thị trước đó. UI phải thông báo hệ quả này. expectedReturn là văn bản mô tả, **không chuyển vào giả định engine, không bảo đảm lợi nhuận**. Sản phẩm công khai vẫn trả đầy đủ rủi ro/phí/điều kiện/disclosure.

## Tùy chọn thông báo

GET/PUT `/me/notification-settings`, cả hai role nhưng chỉ tài khoản từ session; không nhận userId. PUT `{expectedRevision,emailDigest,goalAlerts,partnerUpdates}` strict. Chưa có bản ghi: revision0, tất cả false; lần lưu đầu revision1. Conflict409 giữ bản đang sửa, tải lại trước khi quyết định gửi lại. Response:

```json
{"revision":1,"emailDigest":true,"goalAlerts":false,"partnerUpdates":false,"deliveryAvailable":{"emailDigest":false,"goalAlerts":false,"partnerUpdates":false},"securityAndSupportRequired":true}
```

Đây là lưu lựa chọn bền vững, **chưa có producer gửi bản tin/cảnh báo mục tiêu/tin đối tác**; UI không báo đã bật gửi thành công khi deliveryAvailable=false. Không suy consent marketing từ localStorage cũ; chỉ lưu khi chủ tài khoản xác nhận. Thông báo bảo mật/tài khoản và phản hồi Support hiện có không bị ba tùy chọn này tắt. Không thêm job/email khi lưu. Audit metadata, không nội dung riêng tư.

## Module cũ

- Toàn bộ `/me/consultations` và `/admin/consultations` (kể cả đường dẫn con) trả410 FEATURE_RETIRED sau kiểm tra session/role. Bỏ service đọc/tạo/sửa và socket producer riêng. Socket join vẫn từ chối; không phòng tư vấn. Bảng Consultation và dữ liệu cũ giữ nguyên, audit lịch sử vẫn có. Support tiếp tục hoạt động.
- Content trùng slug trả409 SLUG_CONFLICT; revision cũ409. Bài DRAFT không công khai/không bookmark, bài bị rút xuất bản không còn trong bookmark hiển thị. PUT bookmark lặp không tạo bản thứ hai.
- Support lọc status enum OPEN/IN_PROGRESS/RESOLVED/CLOSED; owner-only ở `/me`. ADMIN trả lời tạo thông báo, CLOSED chặn trả lời. Đổi trạng thái yêu cầu revision.
- Operations audit cho lọc targetType tối đa80 ký tự để đọc cả module tài chính/catalog/AI. Chỉ metadata, không nội dung audit nhạy cảm. `mailDeliveryEvidence=COMPLETED_IS_PROVIDER_ACCEPTED_NOT_DELIVERED`: hoàn tất outbox không chứng minh email vào hộp thư.
- Báo cáo/CSV dùng T08 `GET /me/retirement/plans/:id/report?versionId=...` và `/versions/:versionId/export.csv`, số/giả định/ngày/version từ snapshot; không thêm calculator T11.

## DB và bằng chứng

Migration `202610050009_secondary_modules` **đã áp dụng**, không sửa/áp lại: notification_preferences FK user cascade; partners revision/isVisible; products revision/isVisible/updatedAt/annualFee/conditions/disclosure. 6 đối tác,11 sản phẩm cũ được giữ nhưng mặc định chưa hiển thị, phí/điều kiện/disclosure thiếu vẫn null. Cần ADMIN rà nội dung trước khi xuất bản; không seed/bịa thông tin.

- `secondary-modules.test.ts`:5 tests (preferences/revision/rollback/publication/slug/HTTP/schema/retirement).
- `verify-secondary-db.cjs`:26 checks HTTP/AuthService/PostgreSQL; outer rollback+savepoint mỗi command, fingerprint toàn35 bảng giữ nguyên, không email/provider.
- `verify-secondary-concurrency-db.cjs`:2 ca transaction độc lập, first preference creation và cùng revision đối tác chỉ một thắng; user SUSPENDED riêng, cleanup chính xác ID đã kiểm chứng.
- OpenAPI `secondary.openapi.yaml`, generator `generate-secondary-openapi.cjs`, lỗi chung DATABASE_UPDATE_REQUIRED503/DATABASE_UNAVAILABLE503 không báo lưu thành công.

T12 và giới hạn phát hành: `../../docs/T12-acceptance.md`.
