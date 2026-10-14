# Gemini — cấu hình và phạm vi tích hợp

Ngày 05/10/2026, chủ dự án chọn Google Gemini và cung cấp key. Quyết định này thay trạng thái “chưa chọn provider” trong các checkpoint cũ.

## Cấu hình backend

Trong `backend/.env` (được Git bỏ qua), hoặc secret store của môi trường triển khai:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=<secret của môi trường>
GEMINI_API_MODE=developer
GEMINI_MODEL=gemini-3.8-flash
GEMINI_TIMEOUT_MS=15000
```

Không đưa key vào frontend, localStorage, repository, log hoặc URL. `.env.example` không chứa key và mặc định `AI_PROVIDER=none`. Chọn Gemini nhưng thiếu key sẽ bị từ chối lúc khởi động; không cần migration hoặc sửa database. Tiến trình backend đang chạy phải khởi động lại để nhận cấu hình môi trường mới; phiên kiểm tra này không dừng server khác.

Adapter dùng HTTPS với header `x-goog-api-key`, chặn redirect, không tự retry. `developer` gọi `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`; `vertex-express` gọi `aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent` cho key có quyền express mode. Không suy loại key từ tiền tố. Cấu hình hiện tại dùng `developer` vì đã kiểm chứng thành công; Vertex trả `API_KEY_SERVICE_BLOCKED` với key này.

Model 2.5 Flash có trong danh sách nhưng Google trả 404 “no longer available to new users” khi gọi, chỉ định 3.8 Flash. Model 3.8 Flash đã trả HTTP200/STOP và selection hợp lệ. Không tự chuyển model trong mỗi request; đổi model qua cấu hình rồi kiểm lại.

## “Training” trong phạm vi hiện tại

Luồng đang có: admin nhập tài liệu → tạo chỉ mục LEXICAL_V1 → duyệt → đến ngày hiệu lực → truy xuất tối đa 4 đoạn liên quan cho câu hỏi → Gemini chọn facts/citations → backend dựng lời giải thích từ kết quả đã tính. Chỉnh tài liệu hoặc tạo lại chỉ mục phải duyệt lại. Không tự duyệt các nguồn đang có trong DB.

Đây là dùng tri thức trong ngữ cảnh, **chưa phải fine-tuning**, không tạo training job, không tải toàn bộ DB/dataset lên Google, không có embedding service mới. Gemini chỉ được trả `{factKeys,citationIds}` từ danh sách cho phép; không sinh tự do số tài chính, sửa công thức, chạy tool, ghi hoặc apply kế hoạch. Câu hỏi “nếu” tiếp tục qua engine và xác nhận riêng.

## Consent và trạng thái API

Policy mới: `ai-explanation-gemini-2026-10-v2`. Consent v1 không cho gọi provider; trả `AI_CONSENT_REQUIRED` trước outbound request. Không tự cập nhật consent đã lưu.

`GET/PUT /api/v1/me/ai/privacy` bổ sung `provider` (`gemini` hoặc null), `processingNotice`, `reconsentRequired`; vẫn trả `policyVersion`, `acceptedPolicyVersion`, `revision`, `providerConfigured`. UI hiển thị notice và xin xác nhận riêng, gửi phiên bản vừa đọc từ API. `providerConfigured=true` chỉ phản ánh cấu hình, không là kiểm tra khả dụng Google. `processing=true` là lựa chọn đã lưu; phải kiểm thêm policyVersion/reconsentRequired.

Gemini nhận câu hỏi đã lọc email/số dài, facts cần giải thích và trích đoạn đã duyệt. Không gửi ID tài khoản/plan/version, toàn hồ sơ, lịch sử chat hoặc danh sách giao dịch. Bộ lọc không bảo đảm ẩn danh tên/địa chỉ người dùng tự gõ. Không cam kết vị trí xử lý hoặc retention của Google khi chưa xác minh hợp đồng/tài khoản; phần vận hành/P36 trước phát hành vẫn mở.

Kết quả `AI_ASSISTED` chỉ khi selection hợp lệ; HTTP lỗi, timeout, output sai schema/nguồn, bị chặn hoặc cắt ngắn đều về `PROVIDER_UNAVAILABLE`, giữ facts server và không lộ lỗi thô. `AI_PROVIDER=none` trả `PROVIDER_NOT_CONFIGURED`. Giới hạn đáp ứng 64 KiB, output 2.048 tokens; timeout 15s, cấu hình 1–30s. Model 2.5 Flash/Lite nếu được chọn dùng thinkingBudget=0; model khác giữ mặc định nhà cung cấp.

## Bằng chứng kiểm tra

- `node node_modules/typescript/bin/tsc -p tsconfig.test.json`: PASS.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`: 290 tests /25 files PASS, gồm endpoint/header/schema, lỗi HTTP, output giả, giới hạn kích thước, fallback, wiring và chặn consent cũ trước network.
- `node scripts/verify-build-isolated.cjs`: Prisma generation riêng + TypeScript emit PASS; `node scripts/check-production-startup.cjs`: thiếu secret bị từ chối trước DB.
- `node scripts/verify-gemini.cjs`: PASS với `developer`/`gemini-3.8-flash`/timeout15s, câu hỏi và số dư giả, không DB hoặc dữ liệu khách hàng. Script chỉ chạy khi operator gọi, không nằm trong test/build. Các lần thăm dò trước đó có timeout/lỗi mạng/403 Vertex/404 model cũ; không coi chúng là thành công. Một smoke thành công không chứng minh độ ổn định dài hạn, chất lượng mọi câu hỏi hay quyền xóa phía Google.

UI/browser, quota/billing theo môi trường, retention worker/backup và P36 trước phát hành vẫn cần nghiệm thu. Bàn giao UI: FE-GEMINI trong `docs/task-frontend.md`.

Tham chiếu giao thức chính thức: [Gemini API](https://ai.google.dev/api), [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [Vertex express API](https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/vertex-ai-express-mode-api-reference). Khả dụng model ở đây dựa thêm vào phản hồi thật của Google với key hiện tại.

## Kiểm tra lại 13/10/2026

`node scripts/verify-gemini.cjs` đạt với cấu hình hiện có `developer/gemini-3.8-flash`, chỉ dữ liệu giả lập, không đọc DB. Giao diện USER/ADMIN được kiểm tra bằng đăng nhập local; lượt nghiệm thu cuối dùng `AI_PROVIDER=none`, rollback toàn bộ ghi DB. Một lần chạy lại định gửi dữ kiện tài khoản tới Gemini bị cơ chế duyệt tự động chặn; không tiếp tục gửi dữ liệu đó. Chế độ kiểm thử không thay cấu hình Gemini trong `.env`. Xem [báo cáo nghiệm thu](../../docs/AI_COMPLETION_2026-10-13.md).
