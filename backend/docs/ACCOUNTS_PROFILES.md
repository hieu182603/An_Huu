# B01–B03 — Tài khoản, hồ sơ và tác vụ nền

Tất cả endpoint nằm trong `/api/v1`; hợp đồng tại [openapi.yaml](openapi.yaml).
Nhật ký bằng chứng kiểm tra tại [PROGRESS.md](../PROGRESS.md).

## Cấu hình và chạy

- Node 22, PostgreSQL; cài dependency bằng `npm ci`, sinh client bằng `npm run prisma:generate`.
- API và worker dùng cùng DATABASE_URL, JWT secrets, OUTBOX_ENCRYPTION_KEY và CLIENT_URL.
- OUTBOX_ENCRYPTION_KEY là khóa AES 32 byte dạng 64 ký tự hex, độc lập với JWT secrets. Tạo ngẫu nhiên, lưu secret manager; không đổi khóa khi còn job chưa xử lý.
- Đặt RESEND_API_KEY và EMAIL_FROM thuộc domain gửi đã xác minh. API chỉ xếp hàng; cần worker chạy để gửi.
- `npm run build`, `npm start` cho API; tiến trình riêng `npm run worker`.
- JOB_TRANSPORT=inline: worker lấy job từ PostgreSQL. Từ “inline” không có nghĩa gửi mail trong HTTP request.
- JOB_TRANSPORT=azure: cấu hình namespace `*.servicebus.windows.net`, queue và quyền gửi/nhận cho managed identity. Local dùng DefaultAzureCredential. Queue chỉ chứa eventId; cấu hình dead-letter/max delivery ở hạ tầng.
- Tài khoản/phiên được kiểm tra từ database mỗi request bảo vệ. Socket kiểm tra lúc handshake, khi JWT hết hạn và mỗi 15 giây; đăng xuất/đổi mật khẩu ngắt ngay các socket trên instance xử lý thao tác. Đồng bộ tức thời giữa các instance thuộc B12.
- Các service email/socket cũ chưa được nối vào module mới. Luồng auth dùng `jobs/handlers.ts` và `jobs/mail.ts`.

## Migrations và tài khoản vận hành

Hai migration: baseline schema cũ và accounts_profiles_outbox. Migration thứ hai thu hồi token plaintext cũ, xóa giá trị bí mật cũ, thêm revision/session/outbox và các bảng chuẩn bị cho B04. Không seed benchmark/công thức mẫu.

Database trắng: `npm run prisma:deploy`. Database đã có bảng: kiểm tra schema và baseline tương ứng trước; không reset hay chạy CREATE TABLE mù quáng. Migration chạy một lần trong release job, không chạy mỗi replica API.

`npm run db:seed` chỉ cho local non-production, cần SEED_PASSWORD; tạo USER và ADMIN fixture nếu chưa có. `npm run admin:bootstrap` cần BOOTSTRAP_ADMIN_EMAIL/PASSWORD; tạo ADMIN mới và audit cùng transaction, không nâng quyền/ghi đè tài khoản đã có. Xóa biến bootstrap sau khi dùng. Scripts không in mật khẩu.

## Xác thực

Register chỉ tạo USER/PENDING_VERIFICATION. Email normalize lowercase; password không trim, tối thiểu 12 ký tự và tối đa 72 byte UTF-8. Email tồn tại/không tồn tại dùng response generic ở register/resend/forgot.

OTP 6 chữ số: HMAC theo user + ID lần phát + mã, hết hạn 15 phút, tối đa 5 lần thử, cooldown phát lại 60 giây. Reset dùng token ngẫu nhiên 32 byte, chỉ lưu hash. Payload email mã hóa trong outbox; worker kiểm tra token còn hiệu lực trước khi gửi, xóa payload khi hoàn tất.

Access JWT mặc định 15 phút; refresh opaque lưu hash, xoay mỗi lần. remember=true giữ cookie tới hạn cấu hình (mặc định 30 ngày); false dùng session cookie, hạn server 24 giờ. Refresh rotation giữ hạn ban đầu, không gia hạn vô hạn. Token đã dùng lại làm thu hồi toàn bộ family.

Frontend giữ access token trong bộ nhớ, gửi credentials cho auth và xử lý refresh single-flight (bao gồm phối hợp nhiều tab). Refresh/logout cần Origin nằm trong allowlist và X-CSRF-Protection: 1. Cookie production tên __Host-anhuu_refresh, Secure/HttpOnly, path=/; local anhuu_refresh. COOKIE_SAME_SITE=none chỉ khi production HTTPS và topology cần cross-site.

Link reset dùng /reset-password#token=... để token không vào request URL/referrer. Frontend B12 phải đọc rồi xóa fragment. Frontend hiện chưa nối API.

## Hồ sơ và onboarding

Hồ sơ v2 theo T01 đã được bổ sung: xem [FINANCIAL_PROFILE_V2.md](FINANCIAL_PROFILE_V2.md). Các quy tắc sáu nhóm và summary cố định bên dưới mô tả v1 được giữ để tương thích; v2 dùng trạng thái dữ liệu rõ ràng, khoản chi tiết và ngày định giá do người dùng khai.

- Chỉ USER ghi hồ sơ riêng; userId luôn từ JWT đã kiểm tra session. ADMIN không tự động bypass ownership.
- Tiền nhập là chuỗi decimal không âm, tối đa Decimal(18,2); summary giữ thặng dư/tài sản ròng âm. Tính bằng Prisma.Decimal, kiểm tra tổng netWorth không vượt cột DB.
- cashSavings, liquidAssets, stockFundValue là các nhóm không trùng nhau; retirementLiquidAssets không tính realEstateValue. Cần làm rõ ý nghĩa tài sản thanh khoản ở frontend B12 (xe cộ/nhà ở không tự coi là quỹ chi hưu trí).
- availableMonthlySurplus = income − expenses − monthlyDebtService. essentialExpense/lifestyleExpense phải loại trừ khoản trả nợ đã khai riêng. Đây là thặng dư hồ sơ, khác actual savings theo thu–chi tháng tại B06.
- API không nhận kết quả/benchmark do người dùng tự tính. B03 chưa tính kế hoạch hưu trí/BHXH; B04 quản lý mục tiêu, khẩu vị rủi ro và model/assumptions.
- Draft cho thiếu nhóm/trường. expectedRevision=0 để tạo; lần sau gửi revision nhận từ server. Merge theo nhóm giữ trường cũ. Không tự điền 0 vào dữ liệu chưa nhập.
- Complete yêu cầu đủ sáu nhóm personal/income/expenses/assets/debt/socialSecurity, expectedDraftRevision và expectedProfileRevision (0 nếu chưa có profile). Header Idempotency-Key là UUID.
- Complete ghi profile/audit/outbox/idempotency response rồi xóa draft trong cùng transaction. Lặp cùng key/body trả kết quả cũ. Body khác cùng key hoặc revision cũ trả 409.
- Update profile tăng revision và đánh dấu plan stale. Legacy readinessScore/projectedFund chưa cập nhật và không được trả làm kết quả mới.

## Worker, retry và giới hạn

Worker claim bằng compare-and-set, lease 90 giây, retry exponential backoff, 5 lần lỗi rồi FAILED; ghi mã lỗi cố định, không lưu nguyên văn lỗi provider. ProcessedEvent chống xử lý lại các job hoàn tất; lease hết hạn cho phép phục hồi sau crash.

Email gửi với timeout 15 giây và Idempotency-Key=eventId. Resend giữ key 24 giờ; token auth hết hạn trong 15 phút nên retry auth nằm trong cửa sổ đó. [Tài liệu Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

Queue là at-least-once. Azure publisher có thể phát lặp ID chưa claim; consumer kiểm tra DB. Job FAILED cần điều tra, token hết hạn thì yêu cầu cấp lại, không replay email cũ. Chưa có admin UI thao tác job.

profile.changed và security.sessions_revoked hiện là dấu vết thay đổi bền vững được xác nhận xử lý; hiệu lực stale/revoke đã ghi trong transaction nguồn. Chưa có push notification/calculate lại kế hoạch từ các event này. Khi làm B04/B10/B12 cần bổ sung consumer thích hợp cho sự kiện mới, không dựa vào replay event đã COMPLETED.

Đã test worker trực tiếp với PostgreSQL và mail provider giả lập. Azure Service Bus, email thật, image Docker, CI cloud, reverse proxy và tải nhiều instance còn cần kiểm tra môi trường triển khai. Rate limit hiện dùng memory; shared store thuộc B12.

## Kiểm tra

- `npm run verify`: typecheck nguồn/test, unit/HTTP/Socket.IO/contract, build, startup thiếu secret.
- `npm run test:local-db`: tạo database anhuu_*_test mới trên server local từ cấu hình hiện tại, migrate và chạy integration. Không reset/delete/migrate database ứng dụng. Database test được giữ để xem kết quả.
- Hoặc cung cấp TEST_DATABASE_URL trỏ database test local riêng, chạy `npm run db:test:prepare` và `npm run test:integration`. Không fallback URL ứng dụng.
- Tests không gửi email thật hoặc gọi Azure/Cloudinary thật. CI chạy database service cô lập trên push/PR; kết quả CI phải xem trên lần chạy thực tế.
