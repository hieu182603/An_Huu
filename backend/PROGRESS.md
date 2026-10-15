# Tiến độ triển khai backend An Hưu

## ALLOCATION V3/V4 15/10/2026 — engine glide path + bản nháp, CHƯA GHI DB

- Engine: chính sách danh mục thêm `schemaVersion: 2` (`glidePath` neo vào tháng nghỉ hưu, nội suy tuyến tính theo số năm nguyên còn lại, sau mốc giữ điểm 0). Schema v1 giữ nguyên thứ tự khóa; hash chính sách v2 đang công bố khi parse bằng schema mới vẫn khớp approval trong DB (kiểm READ ONLY). `prepareRetirement` truyền `retirementMonth`; preview độc lập với chính sách v2 thiếu tháng này trả `RETIREMENT_MONTH_REQUIRED`. OpenAPI portfolios sinh lại (chỉ khác `Document`/`Write`/`Input`; trình sinh bổ sung `guidance` vốn trước đó thêm tay). Không migration.
- Test: toàn bộ 702/702 (62 file) qua với `node node_modules/vitest/vitest.mjs run --maxWorkers=2`; `tsc --noEmit` và `tsc -p tsconfig.test.json --noEmit` qua.
- Bản nháp file: `seed-data/allocation-2026-10/draft-assumptions-v3.json` (2026–2110, CASH/GOV_BOND/EQUITY/GOLD, nguồn NSO/IMF WEO 10-2026/HNX/Vietcombank/VN-Index/Dragon Capital truy cập 15/10) và `draft-policy-v4.json` (danh mục nền của tài liệu thuật toán, 2 lộ trình, `assumptionVersionId` là id giữ chỗ). Sinh bằng `scripts/build-allocation-drafts.cjs`; bản công bố hiện tại được xuất ra `published-*.json` để đối chiếu.
- Chạy thử READ ONLY (`scripts/simulate-allocation-drafts.cjs`): đang công bố 0/52 READY; nháp 52/52 READY, quỹ cần trung vị 8,21 tỷ, độ phủ trung vị 139%.
- Chặn công bố: frontend `RiskPortfolioPage.tsx` đọc `template.schedule` → bàn giao `docs/task-frontend.md` mục 17. Thứ tự công bố và các điểm CHỜ DUYỆT ở `docs/BAN_NHAP_GIA_DINH_V3_CHINH_SACH_V4_2026-10-15.md`. Bước tiếp theo: chờ user duyệt các điểm đó rồi mới tạo DRAFT trong DB.

## AUDIT CHỈ ĐỌC PHÂN BỔ / GIẢ ĐỊNH / THỜI HẠN KẾ HOẠCH 15/10/2026

Script mới `scripts/audit-allocation-readonly.cjs` (transaction READ ONLY, chỉ in số đếm), chạy trên Azure sau khi user cho phép và thêm IP vào firewall. Không ghi DB, không sửa runtime.
- Đang công bố: giả định v1 `assumption-series-v2` 2026–2055 (CASH 5,0 / BOND 7,2 / BALANCED 9,5 / STOCK 12,0 / RE 8,5%/năm, lạm phát 3,5–4%) và chính sách v2 `portfolio-policy-v1` (6 câu cộng điểm → 5 band → 5 mẫu cố định, `coverageMonths` 360, quy tắc `horizon` 1–360). Hash phê duyệt khớp, `validatePortfolioPolicy` VALID.
- Thử `previewPortfolio` từ 2026-10: 120/240 tháng READY; 360 tháng `PROJECTION_NOT_COVERED` (vượt 2055-12, tức trần thực tế 351 tháng); ≥361 tháng `POLICY_NOT_COVERED`. Áp cho cả 5 band.
- 52 hồ sơ v2 (định giá 2026-10): với `endMonth` mặc định của FE (tháng sinh + `lifeExpectancy`, cả 50 goal đều là 82) thì **0/52 tính ra READY**; 6 hồ sơ có tháng nghỉ hưu sau 2055. Chỉ có 1 plan version, `endMonth` 2055 (bị cắt ngắn).
- Log 90 ngày không có mã nào ở trên: INCOMPLETE trả 200 kèm guidance, không bị ghi log.
- Bảng cũ `financial_assumptions` (EQUITY 12, BOND 6,8, SAVINGS 5,2, LIFE_EXPECTANCY 78,5) không còn code nào dùng. 11 `partner_products` đều `isVisible=false`, lợi suất ghi dạng chữ chưa có nguồn (cổ phiếu 12–19%/năm).
- Chi tiết và phương án sửa: `docs/BAO_CAO_THUAT_TOAN_PHAN_BO_VA_DEMO_2026-10-15.md` mục 8. Chưa sửa gì; chờ user duyệt.

## ĐIỀU TRA SYSTEM LOG / ĐĂNG NHẬP LỖI 15/10/2026 (side-session)

Truy vấn chỉ đọc `system_logs`/`login_logs` trên Azure (30 ngày, toàn bộ log từ 06/10 khi có migration 0012): 89 CRITICAL + 5 ERROR, đều `source=API`.
- 51 CRITICAL = 503 `DATABASE_UNAVAILABLE` (Prisma P1001/P2024… lúc kết nối Azure chập chờn; 38/51 dồn vào 23h–01h giờ VN đêm 11–12/10 và 14–15/10, trùng phiên dev local dùng chung DB Azure — log không ghi môi trường nên chưa tách chắc được); 25 = 503 `NOT_READY` của `/health/ready` (probe quá `HEALTH_TIMEOUT_MS`, rải rác); 13 = 503 `DATABASE_UPDATE_REQUIRED` `GET /products` 17:11–17:13Z ngày 14/10, ngay trước khi migration 0014 xong 17:15:53Z (client có cột `imageUrl` trước khi DB có). Đều là nhiễu/blip, không phải bug nghiệp vụ; lỗi nằm ở cách xếp mức: mọi 5xx khác 500 bị ghi CRITICAL còn 500 thật chỉ là ERROR.
- 5 ERROR = 500: 3× `POST /auth/refresh` trong cửa sổ mất kết nối 11/10 (khả năng cao P2028 không bắt được transaction trong `maxWait` — chưa chứng minh vì log không lưu nguyên nhân), 1× P2034 ở `findFirst` trong xác thực (bản ghi cũ còn `errorMessage`), 1× `POST /` không xác định được router nào (6 router có `post("/")`).
- Đăng nhập FAILED 28: 21 vào tài khoản admin, 11 từ 127.0.0.1 (dev local), còn lại theo cặp vài giây từ IP Vercel; tối đa 5/giờ, không có LOCKED → gõ sai, không phải brute-force. Phát hiện bảo mật: `ipAddress` dạng `ip:port` của egress Vercel (16.162.x/16.163.x/43.198.x, AWS HK) → limiter theo IP khoá theo từng kết nối; chưa sửa vì cần quyết định topology (`TRUST_PROXY_HOPS`, bỏ port); limiter theo email + khoá tài khoản vẫn hoạt động.
- Đã sửa `middlewares/errorHandler.ts`: `DATABASE_UNAVAILABLE`/`NOT_READY` → WARNING, 500 → ERROR, 5xx khác → CRITICAL; thêm P1008/P2028 → 503 và P2034 → 409 `CONCURRENT_UPDATE`; `details.cause` + stderr `cause` chỉ gồm tên lớp lỗi và mã Prisma (không message); `path` giữ template route kèm tiền tố mount (`/api/v1/...`), đường chưa khớp route thì che UUID/số. Không xoá/sửa log, không migration. Test `foundation.test.ts` +1; full 696 tests/62 files PASS, typecheck + typecheck:tests PASS.

## BÁO CÁO THEO KỲ 15/10/2026

`GET /admin/reports?days=7|30|90` (ADMIN, mặc định 30): KPI kỳ này vs kỳ trước cùng độ dài (đăng ký, user có đăng nhập, câu hỏi AI, ticket, tư vấn sản phẩm, bài xuất bản), chuỗi theo ngày giờ VN (dùng lại `dailyBuckets`), phễu (đăng ký → ACTIVE → hồ sơ → kế hoạch → dùng AI), ticket theo trạng thái/nhóm, đăng nhập theo trạng thái, system log theo mức, top 8 audit action. Chỉ đọc. Test `admin-overview.test.ts` +1; full 695 tests/62 files PASS. Chạy thật trên Azure (chỉ đọc) ~2,6s: 30 ngày có 88 log CRITICAL, 28 đăng nhập FAILED — chưa điều tra nguyên nhân.

## GÓI SẢN PHẨM + TƯ VẤN + AI GỢI Ý 15/10/2026

- `partner_products.imageUrl` (migration `202610150014_product_image`, chỉ `ADD COLUMN IF NOT EXISTS`, nullable). **ĐÃ APPLY lên Azure 15/10** theo yêu cầu user (`prisma migrate deploy`, 2 lần đầu lỗi mạng P1001, lần sau thành công); migrate status up to date, cột text nullable, 11 sản phẩm giữ nguyên; `/products` HTTP 200. Không sửa 0001–0013.
- `POST /admin/media` (ADMIN, uploadLimiter, Cloudinary sẵn có) trả `{url}`; `productInput.imageUrl` optional (bỏ trống = giữ ảnh cũ).
- Tư vấn sản phẩm = ticket hỗ trợ category "Tư vấn sản phẩm": `POST /me/products/:id/consult` {message, phone?} (USER, consultationLimiter, chỉ sản phẩm đang hiển thị), audit `PRODUCT_CONSULT_REQUESTED`. Không hồi sinh bảng/route Consultation (410 giữ nguyên). `/admin/support?category=` lọc phía server.
- AI: câu hỏi về sản phẩm thêm fact server `products` = gói đang phân phối lọc rủi ro theo số năm tới tháng muốn nghỉ hưu (<5 thấp, 5–15 thấp/TB, >15 tất cả), có câu miễn trừ; provider chỉ nhận đoạn tóm tắt. Hồ sơ chưa lưu khảo sát rủi ro phía server (ghi chú `ponytail:`).
- Admin overview `GET /admin/overview` (14/10) đã có từ trước trong phiên.
- Test: `product-consult.test.ts` (2), `admin-overview.test.ts` (2); full 694 tests/62 files PASS; typecheck PASS. Frontend e2e `tests/product-consult.spec.ts` 2 PASS.
- Tiếp: admin bật hiển thị sản phẩm (hiện 0/11 đang hiển thị nên `/products` rỗng).

## AI KNOWLEDGE XẾP HẠNG BM25 14/10/2026 (side-session, chỉ backend)

`KnowledgeService.retrieve` thay đếm token trùng bằng BM25 (IDF trên chunk đủ điều kiện), từ có dấu + bỏ dấu + cặp từ liền nhau, stopword hỏi, mở rộng viết tắt (BHXH, TNCN…), "%"→"phần trăm", cộng điểm khi term khớp tiêu đề/số hiệu, bỏ chunk < 40% điểm cao nhất. Term lấy từ nội dung chunk đã kiểm khớp rawContent nên **giữ LEXICAL_V1, không cần reindex** (không đổi metadata/index/loader); điều kiện duyệt/hiệu lực/hash/top 4/hòa theo id giữ nguyên. Từ của chunk được cache trong tiến trình (khóa id+indexedHash). Test mới `src/tests/ai-knowledge-ranking.test.ts` (4 tests; 2 test xếp hạng FAIL với mã V1, PASS với mã mới). Full 690 tests/60 files PASS, source + test typecheck PASS. DB local (30 nguồn, đã duyệt local): văn bản đúng đứng đầu ở cả 7 câu có văn bản tương ứng (câu tăng lương hưu 2026: TT 14/2026 hướng dẫn điều chỉnh đứng đầu, NĐ 162 hạng 2). Chunk chứa đáp án: "tăng thêm 8%" (NĐ 162, hạng 2), "2.530.000 đồng/tháng" (NĐ 161), "đủ 15 năm" (Luật BHXH); câu trả nợ trước hạn ra điều cho vay của Luật TCTD (không có văn bản riêng). Hạn chế: câu thuế TNCN với lương hưu ra đúng Luật 109/2025 nhưng chunk Điều 4 khoản 9 (miễn thuế lương hưu) đứng hạng 17 vì tiêu đề Điều 4 nằm ở chunk trước; cần chia chunk theo Điều (index V2) nếu muốn khắc phục. Ấm ~100 ms/lần như cũ, lần đầu sau khởi động ~300 ms. Chưa ghi gì lên production; production cần deploy mã này rồi admin mới duyệt nguồn.

## AI KNOWLEDGE NẠP PRODUCTION 14/10/2026

Theo yêu cầu người dùng, nạp 13 văn bản chính thức đang hiệu lực (Luật BHXH VBHN 19/VBHN-VPQH, NĐ 158/159/2025, TT 12/2025, NĐ 135/2020, BLLĐ 2019, NĐ 161/162/2026, TT 14/2026, Luật 51/2024 BHYT, Luật TNCN 109/2025, Luật Người cao tuổi, Luật TCTD VBHN 158) thành 30 nguồn qua `scripts/load-knowledge.cjs` + `seed-data/legal-2026/knowledge-manifest.json` (bản gốc + SHA256 trong `sources-kb/`, chữ trích trong `sources-kb-text/`). Production: 30 nguồn INDEXED, 699 chunk LEXICAL_V1, CHƯA duyệt; 2 bản ghi rỗng cũ (Luật 41/2024, NĐ 135) được cập nhật, 3 bản ghi khác (NĐ 75/2024 đã hết hiệu lực, CFA, báo cáo dân số) giữ nguyên. Audit: 28 CREATED, 2 EDITED, 30 INDEXED. Thử truy xuất trên local (duyệt tạm) cho thấy LEXICAL_V1 xếp hạng kém (đếm từ trùng không dấu, không IDF/tiêu đề): câu về tăng lương hưu 2026 không ra NĐ 162, lương cơ sở không ra NĐ 161. Không duyệt nguồn trên production cho tới khi cải thiện truy xuất.

## AI EXPORT GỠ 14/10/2026

Theo yêu cầu người dùng, gỡ `GET /me/ai/conversations/:id/export` (router, generator OpenAPI, khối path trong docs/openapi.yaml, AI_GOVERNANCE.md) và nút "Tải hội thoại (JSON)" ở frontend (nhánh dự phòng tự ghép JSON từ tin nhắn trên màn hình, không ứng với bản ghi nào). Xem hội thoại vẫn qua `GET /conversations/:id`; test ai.test.ts kiểm route cũ trả 404. Full 686 tests/59 files, source + test typecheck PASS.

## PERF 14/10/2026: hiệu năng đường đọc + rate limit (phiên side-session, chỉ backend)

**Đã triển khai:** (1) rate limit theo `user:<userId>` từ JWT đã xác minh cho route đã đăng nhập; general limiter (gắn trước auth) tự verify Bearer; ẩn danh/token giả giữ `ip:<req.ip>`. Không đổi biến môi trường production; `AZURE_DEPLOYMENT.md` ghi phải đo số hop thật trước khi đặt `TRUST_PROXY_HOPS`. (2) `PlansService.versions` đọc `integrityHash`/`preview.references`/`result.summary` bằng `$queryRaw` JSON path, không tải/digest toàn snapshot; detail/replay/export/compare/simulate/apply vẫn kiểm đủ. (3) `get/version/report/compare/simulate` và `RetirementService.preview` không còn transaction SERIALIZABLE, query độc lập chạy song song, `latest()` select {id,version}. Lưu/áp dụng giữ nguyên transaction. (4) `PublishedCache` (TTL 10 phút, 64 mục, trả bản clone) cho policy/assumption PUBLISHED theo id; kiểm effectiveAt mỗi lần hit; DRAFT/APPROVED không cache; sửa DB ngoài API chỉ được phát hiện lại sau TTL. (5) `compression@1.8.2` (1.8.1 có advisory GHSA-vc2v-76pw-4v95), bỏ qua `/socket.io` và `text/event-stream`. (6) `Server-Timing: total;dur=` + log `http.timing` (route template, không id) cho `/me/retirement/plans*`, `/me/retirement/preview`, `/me/financial-profile`. (7) FE bàn giao `docs/task-frontend.md` mục 16.

**Bằng chứng:** test mới `src/tests/read-path-performance.test.ts` 9 tests; memory-db giả lập câu SQL summary, SQL thật đã so khớp với đường cũ trên Postgres local (identical, phân trang đúng). Bảng trước/sau: `scripts/bench-read-paths.cjs` (chỉ đọc, chặn DB không phải localhost). Full 686 tests/59 files PASS, source + test typecheck PASS (14/10). Trước→sau p50 local: versions 169→16 ms, preview 335→153 ms, GET plan 109→80 ms; với RTT giả lập ~35 ms: GET plan 513→255, preview 712→271. Gzip: GET plan 411 KB→43 KB. Chưa chạy build/startup guard. Theo dõi: `validateSession` chạy 2 query tuần tự mỗi request, có thể song song hóa.

## Hiện hành — 13/10/2026: hoàn thiện AI cả backend và frontend

User đã yêu cầu trực tiếp hoàn thiện AI cả hai phía, thay phạm vi chỉ backend trước đó. Giữ các thay đổi frontend/backend có sẵn và không khởi động lại backlog lịch sử.

**Đã triển khai:** lời giải thích theo chủ đề bằng facts kiểm soát, tiền tiếng Việt không mất độ chính xác, cảnh báo hỏi-thử điều kiện mới, fallback dẫn nguồn còn hợp lệ. Hội thoại tự đặt tên câu đầu, ghi mốc tăng dần để đúng thứ tự PostgreSQL. UI xử lý consent, tải lỗi/thử lại/idempotency, chuyển hội thoại khi phản hồi còn chờ, rename revision, edit/export/delete/clear/pagination. Mô phỏng lấy tháng và chuỗi tiền thật từ phiên bản, không mặc định tuổi/tiền, giữ 0 khác null, dùng đúng atValuation và ngày từng phương án. Admin sửa tài liệu/URL/expiry, index/approve/revoke với revision mới; quy tắc hiển thị đúng hành vi backend. Bổ sung font/ô nhập/focus dễ dùng. Sửa 3 lời gọi `.toNumber()` không tồn tại trong SimulationTrackingPage sang `Number(decimal.toString())` để frontend biên dịch được, giữ phạm vi hiển thị số của mã cũ.

**Bằng chứng đã chạy:** backend full677tests/58files PASS; sau sửa thứ tự, AI/Gemini35tests PASS; source/test typecheck PASS; Prisma generate riêng + tsc emit + startup guard PASS. Frontend typecheck/build+prerender PASS,61tests assets/contracts PASS,28Playwright PASS và1bài bổ sung khác ngày/tiền lớn PASS trên bản dựng cuối. Có một lần sai số bounding box Chromium 47.999984px so với48px; sửa tolerance0.01px, chạy lại đạt. Compile từng bị chặn tạm thời bởi DebtAnalysisPage đang có chỉnh sửa đồng thời; lần cuối đã đạt, không sửa/hoàn tác phần đó.

**DB local:** `scripts/verify-ai-db.cjs`22checks PASS, rollback fingerprint15tables; bao gồm nhiều cặp hỏi–đáp có thứ tự. Trình duyệt desktop1440×1000 đăng nhập hai tài khoản test USER/ADMIN,13checks PASS: thêm/index/approve/edit/reapprove tri thức, hỏi từ kế hoạch thật, simulate READY/appliedfalse, mở/rename/export/edit/deleteconfirm hội thoại, không pageerror và rollback fingerprint13tables. Script/ảnh ignored tại artifacts/retiree-50-review/verify-ai-browser.cjs và artifacts/ai-completion.

**Provider:** synthetic-only `verify-gemini.cjs` PASS developer/gemini-3.8-flash. Các lượt browser ban đầu đã nhận AI_ASSISTED nhưng chưa hoàn tất script; lần chạy lại có dữ kiện tài khoản bị auto-review chặn vì thiếu ủy quyền rõ cho payload gửi Google. Không thử vượt chặn; hoàn tất browser với AI_PROVIDER=none, không outbound. Không đổi key/.env/provider cấu hình của web. Không email/reset/migration/công bố dữ liệu. Tất cả máy chủ/browser kiểm thử đã đóng; giữ máy chủ sẵn có.

Báo cáo: `../docs/AI_COMPLETION_2026-10-13.md`; cập nhật AI_GOVERNANCE.md và GEMINI.md. **Phần triển khai/nghiệm thu local AI trong lượt này đã xong.** Bước tiếp theo khi chuẩn bị production: admin rà và duyệt tài liệu thật, triển khai vận hành retention/backup và xác minh điều khoản provider theo hồ sơ riêng; không tự nhập gói seed-datafull.sql hoặc công bố quy tắc pháp lý. AI vẫn là giải thích có kiểm soát + mô phỏng qua engine, không chatbot tự sinh số tiền hoặc tự áp dụng kế hoạch. Các task frontend khác vẫn thuộc bản giao riêng.

## Hiện hành — 13/10/2026: sửa backend theo kiểm tra trải nghiệm desktop

Phạm vi lượt này: người dùng giao phần backend sau đợt trải nghiệm desktop và đã cho phép test database local. Giữ các chỉnh sửa có sẵn ở docker-compose.yml, seed.cjs, vitest.config.mts và frontend; không thực hiện lại hàng đợi lịch sử bên dưới.

**Đã sửa/bổ sung:**

- Debt preview: thêm `cashflowAssessment` cho từng kết quả có lịch, tách lịch trả nợ tính được với khả năng đánh giá dòng tiền. Thiếu thu/chi/dự phòng không còn chỉ được biểu diễn bằng `firstShortfallMonth: null`; có COMPLETE/PARTIAL/UNAVAILABLE, phạm vi đánh giá, tháng chưa biết và DETECTED/UNKNOWN/NOT_DETECTED_IN_HORIZON. Không đổi số tiền, lịch vay, thuật toán hay mã model.
- Compare/simulate: thêm `comparison.atRetirement` cùng mốc tháng và tiền danh nghĩa; khác tháng hưu hoặc khác cơ sở so sánh thì delta null với lý do. Giữ nguyên delta tại ngày định giá để không phá hợp đồng cũ.
- Portfolio/retirement preview thiếu dữ liệu: thêm `guidance` tiếng Việt, thời gian yêu cầu, giới hạn năm dự báo, từng khoảng quy tắc, điều kiện không đạt và hướng xử lý cấu hình/lựa chọn. Câu trả lời khảo sát thiếu không bị quy thành lỗi cấu hình. READY retirement preview giữ nguyên cấu trúc, inputHash/snapshot/replay; không ngoại suy lợi suất hoặc tự mở rộng cấu hình đã công bố.
- CSV: thêm `format=readable-vi` trên endpoint xuất bản đã lưu, 20 cột tiếng Việt theo tháng và làm tròn tiền đến đồng ở bước trình bày. Default/technical giữ nguyên byte/độ chính xác; ownership, no-store và lịch sử dùng chung. Cập nhật OpenAPI, PLAN_PRESENTATION.md, DEBT_PLANNING.md và mục 10 của `docs/task-frontend.md` cho AI frontend nối API.
- Kiểm chứng tuổi 50 nghỉ ngay tháng định giá, lưu/replay thành công. Không sửa engine v3 để nhận tháng nghỉ hưu quá khứ; giao diện cần bỏ chặn trường hợp cùng tháng, phần lịch sử trước ngày định giá vẫn là giới hạn hiện hành.

**Kết quả kiểm tra bản cuối:**

- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`: **674/674 tests, 58/58 files PASS** (108,60s). Có unit, HTTP/memory DB và OpenAPI; không gọi đây là toàn bộ integration PostgreSQL. Các ca mới kiểm thiếu/zero/partial dòng tiền, mốc so sánh, CSV, giới hạn cấu hình và tuổi 50.
- `npm run typecheck`, `npm run typecheck:tests`: PASS. `node scripts/verify-build-isolated.cjs`: isolated Prisma generate + TypeScript emit PASS. `node scripts/check-production-startup.cjs`: PASS. Build cô lập tránh thay DLL của server đang chạy.
- `artifacts/retiree-50-review/verify-backend-live.cjs`: **15 checks PASS** qua HTTP server tạm từ dist mới, đăng nhập user thật trên PostgreSQL local; đọc kế hoạch có sẵn, so sánh/mô phỏng, replay bản cũ, hai loại CSV, hướng dẫn giới hạn danh mục/dự báo, trạng thái nợ chưa đánh giá. Fingerprint dữ liệu hồ sơ/danh sách kế hoạch/phiên bản/bản đã lưu không đổi. Chỉ có thay đổi phiên đăng nhập/audit xác thực thông thường; đã đăng xuất phiên riêng, đóng server tạm và Prisma. Không khởi động worker/email/AI provider; không reset/migrate/ghi cấu hình hay dữ liệu tài chính.
- Các lần đầu: sandbox chặn Vitest realpath và Prisma generate (EPERM); chạy lại ngoài sandbox trong cùng scope local đạt. Kiểm thử bắt lỗi truyền dư trường vào schema portfolio và metadata READY ảnh hưởng contract v4; đã sửa trước lượt full suite cuối. Live verifier ban đầu dùng Decimal mặc định để đối chiếu khác precision48 của engine; sửa riêng verifier và chạy lại đạt. Không có lỗi test còn bỏ qua.

**Còn lại/tiếp theo:** frontend đọc đúng API và thực hiện 27 task + danh sách câu chữ trong tài liệu bàn giao; cần nghiệm thu lại giao diện desktop sau khi nối các trường mới. Local hiện thiếu cấu hình dài hạn ngoài phạm vi công bố: đã trả đúng nguyên nhân, chưa tự tạo/publish giả định mới. Cần bộ dữ liệu được rà soát nếu muốn kéo dài kế hoạch. Không coi các hạn chế dữ liệu/UI hoặc T14–T17 lịch sử là đã hoàn tất do lượt này.

## Hiện hành — 08/10/2026: bộ nạp toàn bộ chờ duyệt, chưa ghi DB thật

User yêu cầu đọc lại seed cũ, tái sử dụng dữ liệu và chuẩn bị một file nạp toàn bộ; dữ liệu quan trọng phải có nguồn thật, chỉ nạp DB thật sau khi user duyệt. Đã đọc seed-azure.cjs/seed.cjs/generate-demo-data.cjs, references và corpus; chụp 400 bản ghi/40 bảng qua transaction READ ONLY. Mới `scripts/prepare-reviewed-dataset.cjs` (capture read-only/build offline), `scripts/verify-reviewed-dataset.cjs` (owned Docker only), `seed-data/reviewed-references-20261008.json`. File riêng tư `seed-data/seed-datafull.sql` chứa toàn bộ 40 bảng, 400 rows sau sửa/bổ sung; không reset/delete, chặn thiếu approval code/DB không trống/migration lệch. Giữ tài khoản, credential, JSON hồ sơ, legacy và tiền; sửa ngày metadata/enum/category; thay các bài thiếu căn cứ bằng draft có nguồn; 7 knowledge nguồn thật, lexical hashes, chưa approved; 8 legal drafts từ corpus hiện có. Giả định seed chưa xác minh về DRAFT; catalog ẩn, không nhận lợi suất seed là thật. Không tạo actual/BHXH/plan giả để lấp bảng.

**Bản cuối 16/16 nhóm kiểm PostgreSQL PASS; 132 legal golden cases PASS**. Import chính SQL, round-trip mọi trường400rows, bảo toàn dữ liệu gốc trong phạm vi giữ nguyên, atomic rollback khi lỗi cuối, thiếu/saiapproval/migration/nonempty/rerun bị chặn, service reads50profile/goal, knowledge/review guards; container đã dọn. Hai lỗi verifier ban đầu (so sánh JSON/timezone và chờ PostgreSQL khởi động) đã sửa; final rerun đạt. Corpus generate --check đạt8draft/15nguồn. SQL SHA256 `0a49dae72c5673ef930ed05727015766ec4b5fab78db86726a52cac8edb3dc39`. Không chạy browser/full backend suite vì không sửa runtime. Không credential hoặc bản xuất DB được đưa vào Git.

Theo yêu cầu đặt tên file: đã chuyển nguyên byte sang `backend/seed-data/seed-datafull.sql`, cập nhật builder/verifier và Git ignore; SHA256 không đổi. Người dùng tự chạy sau; chưa nạp DB thật.

Review đầy đủ: `docs/data-package-review-2026-10-08.md`. **Bước tiếp theo: chờ user duyệt nội dung gói; không tự nạp/reset/chuyển DB thật.** Gói dùng DB đích trống đã migrate; trước cutover phải đối chiếu phần phát sinh sau snapshot và giữ đường phục hồi. Pháp lý độc lập, nội dung/cấu hình công bố, dữ liệu actual/BHXH thật và production cutover vẫn chưa hoàn tất.

## Hiện hành — 07/10/2026: T17 race xuyên nhánh BHXH (Docker tạm)

Mới `scripts/verify-pension-races-db.cjs`: bộ quy định PUBLISHED bị trigger cấm sửa/xóa nên KHÔNG commit fixture lên DB thật; script chạy PostgreSQL pgvector Docker tạm (nhãn riêng, cổng 127.0.0.1), migrate deploy 0001–0013 qua prepare-test-db, không đọc .env; container bị xóa cuối lượt. Hai PrismaClient + barrier xác nhận hai pg_backend_pid khác nhau mỗi race.

**6 race PASS, 2 lượt** (thứ tự xen kẽ khác nhau): lưu estimate cùng key → một bản ghi/cùng response; lưu nguồn v4 chọn estimate cùng revision → một thắng, bên kia409; apply bản có lương hưu ↔ thêm lịch đóng → append luôn thành công, apply hoặc commit trước hoặc409, apply lại sau đó HISTORY_REVISION_CONFLICT; lưu nguồn ↔ thêm lịch đóng → bản lưu (nếu thắng) ghim revision cũ và không apply được; lưu estimate ↔ thêm lịch đóng → cả hai nhánh đã quan sát (estimate ghim rev3 rồi captureForSource409, hoặc409); hai append cùng expectedRevision → một thắng, revision không trùng. Mọi bản lưu replay khớp. Không đổi runtime/schema/migration; không chạm DB thật/email/provider.

T17-02 thêm phạm vi BHXH; còn HTTP/browser (T17-03, frontend) và vận hành/backup production/P36.

## Hiện hành — 07/10/2026: T14 thai sản theo Luật 2006 (01/2007–12/2015)

Nguyên tắc user (07/10): làm lần lượt theo văn bản đã công bố; giai đoạn tương lai tính theo văn bản mới nhất, có văn bản mới thì sửa sau. Luật 71/2006/QH11: Cổng chỉ có .doc → lưu snapshot toàn văn HTML (LAW2006.html.txt, SHA-256 5b754491bf2985fe5025a97cd7b8e580d50041dd2cc7c3642c36e5f1ff5ee97c), đọc trực tiếp Điều35(2) và Điều140. Thêm `MATERNITY_LAW2006_ART35_2` + trích dẫn LAW2006_ART35 vào draft BH1/Nhà nước v2. Thai sản nay phủ 2007→nay theo 3 luật.

Kiểm chứng: typecheck PASS; full **666tests/57files PASS**; DB thật `--corpus --state-v2` PASS rollback41. User chốt 07/10: KHÔNG tạo bộ luật/bảng dự phóng; chỉ tuân thủ văn bản đang ban hành, dữ liệu đến năm 2026; năm tương lai theo luật hiện hành, có luật mới thì sửa dự án sau. Một bản sửa strategy dự phóng đã vô tình được áp dụng rồi gỡ hoàn toàn (benefit-validation về HEAD, voluntary-validation chỉ còn bảng TT01/2025); full 666 PASS sau khi gỡ.

## Hiện hành — 07/10/2026: T14 thai sản theo Luật 2014 (01/2016–06/2025)

Tìm và lưu Luật BHXH 58/2014/QH13 bản ký gốc (vanban.chinhphu.vn docid178127 → datafiles.chinhphu.vn/…/58.signed.pdf, 1.829.177 bytes, SHA-256 10dc17ba706c03f93a5b9f0aae492a3e637a09b480cbf01c7e12d6ffc547e64d), đọc trực tiếp Điều39(2) (trang17) và Điều124 (trang51, hiệu lực 01/01/2016). Thêm `MATERNITY_LAW2014_ART39_2` (2016-01..2025-06), engine kiểm trích dẫn theo luật của từng tháng (LAW_ART53 / LAW2014_ART39). Draft BH1 + Nhà nước v2 thêm LAW2014_ART39. Chưa đối chiếu văn bản hợp nhất cho riêng khoản này (ghi trong trích dẫn).

Kiểm chứng: typecheck PASS; full **663tests/57files PASS** (thêm 5 test Luật 2014); DB thật `--corpus --state-v2` 18 PASS rollback41. Còn mở T14: thai sản trước 2016 (Luật 2006), đoàn hệ tuổi lịch sử, thâm niên (a)(c), xác nhận TT01 sau 07/2025, Điều141(9) cần bảng ≥2028, điều ước.

## Hiện hành — 07/10/2026: T14 thai sản Điều53(8); bỏ qua đoàn hệ tuổi lịch sử vì văn bản chưa rõ

User yêu cầu làm mục có căn cứ rõ trước. Kiểm NĐ135 (AGE, đọc trực tiếp trang1–3): chỉ quy định từ 2021 → đoàn hệ trước 1961/1966 KHÔNG làm (hai cách đọc cho mốc tuổi khác nhau). Thai sản: Luật Điều53(8) rõ về đếm tháng; TT12 không quy định căn cứ lương → dùng căn cứ BHXH ghi, thiếu thì báo thiếu. `MATERNITY_ART53_8` (≥2025-07, cần citation LAW_ART53) cho BH1 v2 (tiền xử lý trước v1, hash gốc) và Nhà nước v2. Kiểm chỉ đọc DB thật: 0 legalRuleSetVersion, 0 pensionEstimate → sửa engine tại chỗ không ảnh hưởng replay. Draft BH1 và Nhà nước v2 thêm LAW_ART53 (BH1 đổi byte; các draft khác giữ byte).

Kiểm chứng: typecheck PASS; full **658tests/57files PASS** (5 test thai sản); DB thật `--corpus --state-v2` 18 PASS rollback41. Còn mở T14: thai sản trước 07/2025 (Luật 2014 chưa lưu), đoàn hệ tuổi lịch sử, thâm niên (a)(c), xác nhận TT01 sau 07/2025, Điều141(9) cần bảng ≥2028, điều ước.

## Hiện hành — 07/10/2026: T14 corpus năm hưởng 2025 cho chuyển tiếp tự nguyện

User cho phép tìm nguồn. Tìm và tải TT01/2025/TT-BLĐTBXH từ datafiles.chinhphu.vn (link từ vanban.chinhphu.vn docid212518), lưu FACTORS2025.pdf (2.417.192 bytes, SHA-256 b5657e5dfa0e59932efe25b582d41370e8cab962cc9da92d65b4e853864f24bf), đọc trực tiếp 3 trang. Đọc lại CV340 (trang 1–2): có dòng 2026=1,00, là bảng năm hưởng 2026, không phủ 07–12/2025. NĐ158 Điều16: hệ số = CPI năm liền trước năm hưởng / CPI năm t (gốc 1994), BHXH VN xác định. **Chưa tìm thấy** văn bản xác nhận TT01 (căn cứ NĐ115/134) còn áp dụng sau 01/07/2025 — ghi trong trích dẫn, để người duyệt quyết định. Draft thứ tám bh2-voluntary-transition-2025 (1.143 dòng); strategy tự nguyện chấp nhận năm hưởng 2025/2026 + golden VOL-TRANSITION-2025 (3.596.468,75 tính tay với hệ số thật). 7 draft cũ giữ byte. Không duyệt/công bố.

Kiểm chứng: typecheck PASS; full **653tests/56files PASS** (cập nhật số ca strategy +1 ở 4 test cũ); DB thật `--corpus --transition` **18 checks PASS** rollback41; hồi quy `--corpus --prepaid` 18 PASS; `--corpus --voluntary` lần đầu P2034 (xung đột transaction Serializable, đã rollback, không ghi) — chạy lại **17 PASS**. Còn mở T14: xác nhận pháp lý TT01 sau 07/2025, Điều141(9) cần bảng ≥2028, thâm niên (a)(c), CREDITED loại khác, đoàn hệ tuổi lịch sử nhánh thông thường, điều ước; nghiệm thu browser.

## Hiện hành — 07/10/2026: T14 tự nguyện — chuyển tiếp 2025 và Điều141(9)

Đọc TT11 Điều4–5 (R06 scan, đọc trực tiếp trang2–3) và Luật Điều141(9). Mở `benefitStart.kind: TRANSITION_2025` (start 2025-07 khi đủ điều kiện và ngừng đóng trước 07/2025) và `ageRule: LAW_ART141_9` (chọn 60/55; tự nguyện đầu tiên <2021-01, ≥240 tháng tự nguyện, cần citation LAW_ART141_9; trợ cấp vượt ngưỡng → review). Không version engine mới: giá trị mới trước bị schema chặn, input cũ giữ nguyên mã REVIEW cũ. Phát hiện: tự nguyện bắt đầu 2008 → 141(9) chỉ thực tế từ năm hưởng 2028.

Kiểm chứng: full **651tests/56files PASS**, typecheck PASS, corpus check byte không đổi; 9 test mới dùng bảng giả lập hệ số1 (2.050.000; 2.750.000 tính tay). **Không có DB verifier/golden corpus** vì chưa có bảng năm hưởng 2025 (cần văn bản hệ số 2025 — chưa tải, cần user cho phép tải nguồn chính thức) và 2028 (chưa ban hành). Còn mở T14: corpus năm hưởng 2025 cho chuyển tiếp, thâm niên (a)(c), CREDITED loại khác, đoàn hệ tuổi lịch sử nhánh thông thường, điều ước.

## Hiện hành — 07/10/2026: T14 v2 thêm nghề nặng nhọc (15(2)(a)) và thâm niên (15(3)(b))

Đọc TT12 Điều16: không có hướng dẫn chi tiết cho 15(2)(a)/(3). Nặng nhọc: user khai hazardousPeriods (≥180 tháng, BHXH xác nhận) + hazardousWindowFrom; engine kiểm cửa sổ N tháng trong một giai đoạn, max(cửa sổ cuối, cửa sổ khai báo). Thâm niên: chỉ (3)(b) tự động; (a),(c) REVIEW có mã riêng vì văn bản chưa xác định. state-wage tách alternativeWindowAverage dùng chung với chuyển ngành. v2 mở rộng tại chỗ (chưa từng công bố). Corpus check vẫn khớp (strategy thêm G4/G5 tính tay 8.602.000 / 4.958.800).

Kiểm chứng: typecheck PASS; full **642tests/55files PASS**; 24 test v2; DB thật `--corpus --hazardous` 18 checks và `--corpus --state-v2` 18 checks PASS rollback41. Không migration/frontend/provider/email; không công bố corpus. Còn mở T14: thâm niên (a)(c), CREDITED loại khác (thai sản…), chuyển tiếp tự nguyện 2025, đoàn hệ tuổi lịch sử, điều ước; nghiệm thu browser.

## Hiện hành — 07/10/2026: T14 engine vn-pension-state-v2 (CREDITED trước 1995, lương trước 2004, chuyển ngành)

Đối chiếu văn bản đã lưu: NĐ158 Điều34 (BHXH quyết định thời gian trước 1995), Điều15(1)(a) (chuyển đổi lương trước 10/2004 sang thang tại thời điểm hưởng), Điều15(2)(b)(c); Luật Điều2(1) a/b/d/đ. User chọn B: làm cả lực lượng vũ trang. v2 nhận CREDITED `PRE_1995_STATE_SECTOR`/`PRE_1995_ARMED_FORCES` (nhóm d), hệ số đã chuyển đổi `pre2004Conversion`, `MILITARY_TRANSFER`+`transferMonth` (max cửa sổ cuối/trước chuyển ngành, không so toàn thời gian). Nhóm đ, loại credit khác, nghỉ hưu khi tại ngũ, chuyển ngành + lương doanh nghiệp vẫn REVIEW. v1 không đổi (cùng hàm, cờ v2 tắt). Draft corpus thứ bảy `bh2-state-mixed-v2` (6 draft cũ giữ byte), strategy 18 mẫu v1 + 3 golden tính tay. Không migration/frontend/provider/email; không duyệt/công bố corpus.

Kiểm chứng: typecheck PASS; full **630tests/55files PASS**; 12 test v2; DB thật `verify-state-pension-db.cjs --corpus --state-v2` **18 checks PASS** rollback41, hồi quy `--corpus` v1 17 checks PASS. Lưu ý vận hành: `generate-pensions-openapi.cjs` lỗi thời so với pensions.openapi.yaml đã commit (thiếu LegacyAgeReference/scope/pensionStartMonth) — KHÔNG chạy lại; đã khôi phục file. Còn mở T14: nghề nặng nhọc/thâm niên (Điều15(2)(a),(3)), CREDITED loại khác (thai sản…), chuyển tiếp tự nguyện 2025, đoàn hệ tuổi lịch sử, điều ước; nghiệm thu browser FE-T14-STATE-V2. Không đóng T14/goal.

## Hiện hành — 07/10/2026: T15 DISBURSED_BALANCE sửa sau giải ngân

DISBURSED_BALANCE nhận `originalTerms` (bắt buộc khi contract.effectiveOn > disbursedOn, cấm khi không), `responsibilityAmendment` và `scopeChange` (user chọn phương án B: hỗ trợ đổi balanceScope). Basis đối soát dựng từ điều khoản gốc, không suy từ điều khoản mới. Đổi phạm vi có hiệu lực cuối ngày contract.effectiveOn; đối soát hai đoạn bằng reconcileLoanRevision có sẵn (next nay nhận basis trung gian), openingPrincipal do user khai kèm chứng từ, chỉ chặn chiều vô lý. Refinance kiểm fundingScope/effectiveOn theo điều khoản tại ngày tất toán. Không migration/frontend/provider/email; loan v1 không đổi; snapshot cũ không thêm mặc định.

Kiểm chứng: typecheck nguồn+test PASS; full **618tests/54files PASS**; 3 test service mới (tỷ lệ trả sửa; FULL→USER_SHARE gồm thiếu/vượt/lệch số dư/sai phạm vi allocation/tamper snapshot; đổi sang CAPPED cần amendment). DB thật: `verify-source-reforecast-db.cjs --disbursed-amended` **25 HTTP/DB checks PASS** rollback41/no email/provider; hồi quy `--refinance-repaid` 22 checks PASS. Chưa: nghiệm thu browser FE-T15-DISBURSED-AMENDED; chiều USER→FULL chỉ có kiểm biên, chưa có ca service riêng. Bước tiếp theo hàng đợi: T16 giải phóng vốn nhiều ngày (đã có releases — rà lại phần còn thiếu), rồi T14 CREDITED/chuyển tiếp, T17 race xuyên nhánh. Không đóng T15/goal.

## Hiện hành — 07/10/2026: T15 refinance tương lai đã public

`plannedRefinances` (CREATE/REVISE/CANCEL theo pairId) nối vào source-reforecasts preview/save/apply/replay. Basis lấy từ snapshot của chủ tài khoản; thứ tự batch CANCEL → lệnh vay thực tế → CREATE/REVISE. Nguồn trong cặp bị khóa (`PLANNED_PAIR_SOURCE_LOCKED`); qua tháng chứa settledOn mà chưa hủy → `PLANNED_PAIR_RECONCILIATION_REQUIRED`. Người dùng chọn phương án A: cutoff tiến trước ngày dự kiến thì giữ nguyên cặp. Builder cho CANCEL sau khi cutoff tiến (trước đây cặp bị kẹt); revision CANCEL là basis v2 cho loanRevisions. Reader kiểm chuỗi basis + replayPlannedPairs. Options: `plannedRefinanceOptions{eligibleLoans,activePairs}`; loanRevisionOptions loại nguồn khóa. OpenAPI sinh lại (source-snapshot/plans); converter thêm ZodNull. Không migration/frontend/provider/email; loan v1 không đổi.

Kiểm chứng: typecheck nguồn + test PASS; full **615tests/54files PASS**; test service mới chạy trọn vòng đời (tạo/khóa/giữ qua cutoff/chặn khi đến hạn/hủy + đối soát lại trong một batch/replay/tamper) và builder CANCEL sau cutoff. DB thật (user duyệt): `verify-source-reforecast-db.cjs --planned-refinance` lượt sandbox preflight0checks, lượt ngoài sandbox **24HTTP/DBchecks PASS** (create/funding sai/owner404/admin403/save+idempotency/replay/apply/report hypothetical/CSV/profile giữ nguyên/khóa nguồn/REVISE/cutoff tiến giữ cặp + REVISE bị chặn/CANCEL khôi phục lịch/ stale ACTUAL_SOURCE_CHANGED), rollbackVerified/tablesPreserved41/no email/provider. `verify-reforecast-concurrency-db.cjs --planned-refinance`: lượt đầu PrismaClientInitializationError preflight (chưa tạo fixture), lượt lại **3 independent-connection races PASS** (vay+tài sản STAGED+cặp refinance cùng changeset; cùng key/cùng revision/sửa actual cạnh apply), fixturesRemoved/existingDataUnchanged/tablesPreserved41/distinct backends. Ca "qua ngày dự kiến bị chặn" không dựng được trên DB thật (không ghi actual tháng tương lai) — chỉ có unit test thời gian giả. Bàn giao browser FE-T15-PLANNED-REFINANCE-API còn mở. Bước tiếp: T15 DISBURSED_BALANCE basis lịch sử khi hợp đồng sửa sau giải ngân. Không đóng T15/goal.

## Hiện hành — 07/10/2026: T15 bộ tính refinance tương lai (nội bộ)

Thêm `planned-refinance.ts` với engine `planned-refinance-v1`, đầu vào v2 đã chốt cuối cutoff + PLANNED_DISBURSEMENT cùng ngày tất toán tương lai. Tính dư gốc sau các kỳ được giữ; sameDayOrder rõ trước/sau kỳ cùng ngày; lãi/phí tất toán là HYPOTHETICAL_QUOTE có xác nhận bao gồm mọi khoản còn lại. Kiểm phương trình net+topup=settlement+unused và phần userTopUp+userFinancedAmount=nghĩa vụ người dùng, có paymentShare/CAPPED carry. Chỉ userTopUp và các kỳ giữ lại thành lịch nguồn cũ; lịch mới riêng, không actual/fund injection. Trả proof inputHash và nhãn HYPOTHETICAL, không sửa input/loanv1.

**Chỉ core nội bộ, chưa API/persistence/registry/save/apply/DB.** Public service chưa import module mới (đã rg kiểm). Không thêm OpenAPI chưa dùng. Tài liệu PLANNED_REFINANCE.md ghi 6 bước tích hợp bắt buộc gồm source CAS/cặp nguồn, proof, sửa/hủy, đối soát khi ngày dự kiến đến hạn, API/presentation và HTTP/DB/races; đây không phải hoàn thành refinance tương lai. FE-T15-PLANNED-REFINANCE ghi rõ chưa gọi API. Bước tiếp builder registry + lifecycle của cặp nguồn, nhất là khôi phục lịch pin khi hủy và chặn cutoff vượt ngày dự kiến khi chưa đối soát; sau đó public/source reader/apply/DB.

Kiểm chứng: 8ca core độc lập đạt (cashflow630=590+40, before/after cùng ngày, share50%, CAPPED400−100−150=150, USER_SHARE/unused, sai gốc/nguồn/ngày/chứng từ, khoản hết gốc và lịch chưa trả hết). Full **608tests/52files PASS** (91,53s). Typecheck đầu phát hiện TS chưa narrow union qua hàm fail; đổi thành return fail ở nhánh sai loại (không đổi hành vi); sau sửa **8focused PASS và testtypecheck/sourceemit PASS**. Các session90140/26962/24926 đã kết thúc, không còn chạy. Scoped whitespace/loanv1 diff đạt; không DB/migration/frontend/provider/email trong đợt này. Full608 chạy trước sửa narrow một dòng, không báo là lượt full mới sau đó.

Mục tiêu vẫn đầy đủ: T15 planned lifecycle/API, DISBURSED_BALANCE basis hợp đồng sửa sau giải ngân và nguồn hoàn lại/thứ tự cùng ngày; T14 chuyển tiếp/CREDITED/đặc thù/pháp lý/corpus review, T17/nghiệm thu UI và vận hành/backupproduction/P36. Không đóng goal/T15. Giữ migration0001–0013 bytes và concurrent work.


## Hiện hành — 07/10/2026: T15 giải ngân trước tất toán

Refinance DISBURSED_BALANCE nhận proceedsAtSettlement khi disbursedOn < settledOn: xác nhận availableAmount và usesBeforeSettlement có ID/ngày/tiền/mô tả/chứng từ. gross−withheldFees−uses=available, available+externalTopUp=settlement+unused. Không lấy dư gốc làm tiền khả dụng; allocations trả nợ (trước hoặc sau tất toán) vẫn đối soát riêng, nguồn trả có thể từ tiền khác. Ngày giải ngân sau tất toán, ngày dùng trước giải ngân/từ ngày tất toán trở đi, ID trùng, số/chứng từ lệch bị chặn. Mảng rỗng cần confirm rõ, không suy chưa dùng. Luồng cùng ngày không có optional field giữ nguyên; metadata pin trong proof, không thêm defaults vào snapshot cũ.

Kiểm chứng cuối: **600tests/51files PASS** (216,68s), testtypecheck/sourceemit PASS, OpenAPI source/plans sinh lại đạt. 24loan-focused trước thêm ca trả nợ mới trước tất toán đạt; ca đó nằm trong full600. Service kiểm save/idempotency/apply/CSV/old replay/stale và mất proof, không cộng/trừ anchor; các ca thiếu/balance/duplicate/ngày/chứng từ sai không tạo bản một nửa. `node scripts/verify-source-reforecast-db.cjs --refinance-early-disbursement`: **24HTTP/DBchecks PASS**, rollbackVerified=true/tablesPreserved=41/noEmailsQueued/noExternalCalls=true. Session80578/full3850/type61773+47070 đều kết thúc0, không còn session đang chạy. Syntax/scoped whitespace/loanv1 unchanged PASS. Không migration/frontend/provider/email.

Contract LOAN_REVISIONS_V2, ADR, OpenAPI và FE-T15-EARLY-DISBURSEMENT đã cập nhật. Đây là xác nhận dòng tiền ngoài quỹ, không kết nối tài khoản ngân hàng hoặc chứng minh nội dung chứng từ. Luồng vay giải ngân sau để hoàn lại tiền tất toán trước đó, khoản dùng khác cùng ngày cần thứ tự riêng chưa mở. Bước tiếp T15 refinance giả định tương lai: giữ lịch khoản cũ tới ngày dự kiến, dự báo tất toán và khoản mới atomic, không dùng actual giả/không coi hypothetical đã ngân hàng chấp thuận. DISBURSED_BALANCE hợp đồng sửa sau giải ngân cần basis lịch sử riêng. Toàn bộ T14 chuyển tiếp/CREDITED/đặc thù/pháp lý/corpus review, T17/GUI và vận hành/backupproduction/P36 vẫn mở trong goal. Giữ migration0001–0013 bytes và concurrent work.


## Hiện hành — 07/10/2026: T15 sửa nghĩa vụ/CAPPED

Loan revision nhận responsibilityAmendment (effectiveOn/openingUserPaid/confirm/evidence). Cho đổi loại ALLOCATED_SHARE↔CAPPED hoặc limit có metadata, không bỏ lịch sử. contract.userPaidToDate pin tổng đã trả và bắt buộc carry ở revision sau kể cả không còn trần; CAPPED previouslyPaid khớp tổng đó. Opening khớp số đã pin nếu biết, nếu chưa biết phải xác nhận và không thấp hơn allocations cùng source đã lưu. Có kiểm ngày/chứng từ, tổng mới=opening+actual components; không đổi dư gốc từ tiền lãi/phí, không thêm debit/refund, không xóa/reset ledger. DISBURSED_BALANCE mang opening ledger khi có; projected disbursement không nhận tổng đã trả khác0. Trường optional không default vào snapshot cũ; v1 loan.ts không đổi.

Chuỗi service đã kiểm: mở30+trả120=150, giảm trần250→còn100; bỏ trần vẫn150; bật lại trần200→còn50, reset0 bị chặn. Save/apply/replay v3/v4 và proof tamper được kiểm. Hai core tests bổ sung carry khi uncapped và không tự khởi tạo0 từ basis chưa biết. **Full597tests/51files PASS** (102,39s), testtypecheck và sourceemit PASS; 46focused trước hai core tests đạt. Typecheck đầu gặp thiếu narrow union trong test replay, đã sửa trước lượt typecheck/full đạt. OpenAPI source/plans sinh lại thành công; contract/ADR/FE-T15-RESPONSIBILITY-AMENDMENT cập nhật. Rà lại nguồn TT29/2026 Điều10 trên bản công khai; không suy công thức CAPPED từ luật hoặc coi evidence hash là thẩm định ngân hàng.

`verify-source-reforecast-db.cjs --loan-amendment`: lượt đầu21ca nghiệp vụ đạt nhưng fingerprint sau rollback khác, verifier exit1. Kiểm chỉ đọc sau đó xác nhận0 tài khoản fixture; chưa xác định nguyên nhân khác biệt lượt đầu, không quy cho tác vụ khác khi chưa có bằng chứng. Bổ sung chẩn đoán rollback-fixture chỉ tên bảng khác/số fixture, không in records. Lượt chạy lại **21HTTP/DBchecks PASS**, rollbackVerified=true/tablesPreserved=41/noEmailsQueued/noExternalCalls=true. Session41674 exit0; tất cả session kết thúc. Syntax/scoped whitespace và loanv1 diff đạt. Không migration/frontend/provider/email.

Tiếp T15 refinance tương lai và giải ngân khác ngày tất toán; hợp đồng DISBURSED_BALANCE sửa sau ngày giải ngân cần basis lịch sử riêng. Giữ toàn bộ T14 chuyển tiếp/CREDITED/đặc thù/pháp lý/corpus review, T17 nhánh khác/UI và vận hành/backupproduction/P36. Không đóng T15 hoặc goal. Migration0001–0013 giữ nguyên bytes, không reapply; giữ concurrent settings/frontend.


## Hiện hành — 07/10/2026: T17 races kết hợp vay và tài sản

Mở rộng `verify-reforecast-concurrency-db.cjs --loan-assets`: cùng changeset chuyển khoản vay v1 sang revision v2 (trả120 gồm100gốc/10lãi/10phí) và tạo tài sản STAGED có60đã góp/140dự kiến, release200đã xác nhận. Actual1000−120+60=940; preview và cả hai phiên bản lưu giữ anchor940, chỉ injection140, đủ loanSources/assetSources. Đây là mẫu tổng hợp kiểm độc lập số tiền, không phải đối chiếu lịch ngân hàng thật.

Lượt được duyệt **3 independent-connection races PASS**: cùng key trả cùng phiên bản; cùng revision chỉ một thắng/không thêm bản từ request thua; sửa actual cạnh apply làm report stale và lần apply tiếp theo bị chặn. Barrier xác nhận hai PostgreSQL backend PID khác nhau trong mỗi lượt. Replay hai bản v3, bản v4 cơ sở và candidate đạt; actual contribution sửa60→70 không viết lại lịch sử. Kiểm trực tiếp service/transaction DB, không gọi đây là HTTP/browser race.

Fixture cần commit riêng để hai connection nhìn thấy: tài khoản SUSPENDED/password không đăng nhập được; cấu hình trở về DRAFT trước commit, không có email/provider. Cleanup chỉ generated IDs, **fixturesRemoved=true, existingDataUnchanged=true, tablesPreserved=41** sau đối chiếu toàn bảng. Session46608 exit0, không còn kiểm thử đang chạy. Script syntax và scoped whitespace đạt. Không thay runtime/schema/migration/frontend/loan v1; không chạy lại593unit vì chỉ đổi verifier, kết quả593 trước đó không phải một lượt mới.

T17-02 có thêm bằng chứng cho changeset vay + asset STAGED; chưa phủ mọi refinance/BHXH/rental/legacy race hoặc UI. Ghi nghiệm thu UI tại FE-T17-LOAN-ASSET-RACES. Bước tiếp: T15 thay đổi nghĩa vụ/trần CAPPED bằng chứng từ và version riêng, giữ allocations/lũy kế cũ; các nhánh refinance tương lai/ngày khác nhau, T14 chuyển tiếp/CREDITED/đặc thù/pháp lý và vận hành/backupproduction/P36 vẫn trong toàn bộ mục tiêu. Không đóng T13–T17 hoặc goal.


## Hiện hành — 07/10/2026: góp tiếp tài sản legacy v3

Nguồn ASSET_REALIZED v3 được REVISE sang STAGED trên cùng sourceId. Backend lấy toàn bộ CONTRIBUTION đã gắn với nguồn vào priorRealized, không nhân lại sở hữu/phần hưu, không cộng lại anchor; tổng đã góp + góp mới + dự kiến phải khớp tổng xác nhận và không vượt net. Reader tái dựng/kiểm proof, ledger chống dùng lại event. Không cho quay về PLANNED/REALIZED để bỏ lịch sử. Nguồn cho thuê đã dừng ở v3 giữ lịch rỗng, không tự dựng rentalExit hoặc khôi phục tiền thuê.

Kiểm chứng: 17 focused tests (legacy + staged) PASS; test typecheck và source emit PASS; full **593 tests/51 files PASS** (110,55s). `node scripts/verify-source-reforecast-db.cjs --assets-legacy`: lượt sandbox lỗi kết nối ở preflight, 0 checks; lượt được duyệt **19 HTTP/DB checks PASS**, rollbackVerified=true, tablesPreserved=41, noEmailsQueued/noExternalCalls=true. Có preview/save/idempotency/ownership/apply/CSV, actual correction chặn apply và replay v3/v4 bất biến. Các session đã kết thúc. Loan v1 không đổi; scoped whitespace PASS trước cập nhật checkpoint. Không migration/frontend/provider/email.

Contract ASSET_SOURCES_V4.md và UI FE-T16-LEGACY-CAPITAL đã cập nhật. Rà task.md sửa hai mô tả lỗi thời: T13-03 public v4 và T14-06 candidate pension đã nối, không liệt kê lại là chưa code; checkbox nghiệm thu vẫn mở. Giữ toàn bộ mục tiêu T14/T15/T16/T17/vận hành. Tiếp kiểm races riêng cho vay/tài sản và cross-flow T17, sau đó các nhánh T15 refinance tương lai/đổi nghĩa vụ và T14 chuyển tiếp/CREDITED/đặc thù/pháp lý. Nối lại thuê sau END/điều chỉnh release đã xác nhận chưa hỗ trợ; phải đối chiếu tiêu chí task/ADR trước quyết định thêm contract. Production backup/scheduler/P36 và UI chưa có bằng chứng nghiệm thu; không đóng backend/goal.


## Hiện hành — 07/10/2026: availability nhiều đợt và T17 migration13

T16: STAGED.availability.releases thêm lịch tiền ngoài quỹ CONFIRMED/EXPECTED có ngày/số tiền ròng/chứng từ. Actual chỉ dùng prefix CONFIRMED trước/đúng ngày góp; planned theo prefix cuối tháng. Tổng releases <= net source share; availableOn là ngày đầu, AVAILABLE chỉ khi mọi release CONFIRMED. EXPECTED đã qua cutoff phải xác nhận/dời lịch; CONFIRMED giữ nguyên qua revision, không bỏ ledger. Không cộng tiền nhận vào quỹ hoặc tự tạo khoản vay/thu nhập. Proof/replay/schema/OpenAPI/UI FE-T16-AVAILABILITY đã nối.

Kiểm chứng runtime: **588tests/50files PASS** (75,39s),12staged-focused và testtypecheck/sourceemit PASS. verify-source-reforecast-db.cjs --assets-releases: sandbox preflight0checks lỗi kết nối, lượt được duyệt **29HTTP/DBchecks PASS**, rollback41bảng/no email/provider. Loanv1 không đổi, không sửa frontend. Tất cả session kiểm thử/DB đã kết thúc.

T17: Docker engine ban đầu chưa sẵn sàng; đã khởi động/kiểm trạng thái, chỉ tạo/xóa container có nhãn của verifier. Lượt clean12 áp dụng SQL được nhưng diff phát hiện thiếu articles_kind_status_idx và simulation_scenarios_userId_idx (hai @@index được thêm trong schema ở luồng khác, chưa có migration). Thêm **202610070013_complete_query_indexes** chỉ hai CREATE INDEX IF NOT EXISTS; DB thật đã có hai index và diff rỗng nên là bổ sung lịch sử cho cài mới, không sửa câu SQL cũ.

Read-only DB phát hiện checksum0002–0011 khác vì CRLF. Đã đối chiếu từng file: LF khớp chính xác checksum đã áp dụng, baseline0001 khớp CRLF,0012 khớp LF. Khôi phục đúng byte10file, không ghi checksum DB/không đổi nội dung SQL; git diff --ignore-space-at-eol PASS. .gitattributes nay cố định migrationsLF với riêngbaselineCRLF để clone/checkout không gây lệch lại.

Clean/upgrade chạy lại sau khôi phục byte: **clean13 và prior4→13 PASS**, schema diff/checksum đúng, legacy fixture nguyên, **10integration/2files PASS**. pg_dump/custom restore **41bảng** fingerprint khớp; standalone retention dry-run/execute trên dữ liệu mẫu sau restore đạt, dữ liệu còn hạn giữ nguyên. Container đã dọn. Artifact .cache/migration-d026d17f-f10d-4a44-a823-6ca6a8b223db và .cache/latest-clean-upgrade.json. Đây là backup mẫu, không phải backup/retention production.

verify-pension-migration.cjs --query-indexes chỉ cho phép đúng0013/hai câu index; mặc định rehearsalrollback. Rehearsal DB thật giữ40bảng dữ liệu PASS; --apply sau proofclean13 đã thành công, trước/sau40bảng nguyên. **0013 APPLIED; không sửa/reapply0001–0013.** Audit chỉ đọc sau apply:13/13checksum khớp, pending[],40modeltables/41publictables, không thiếu bảng/cột, schema diff rỗng. _prisma_migrations thêm bản ghi0013 là thay đổi có chủ đích; không nói bảng lịch sử bất biến.

Tiếp: bridge vốn legacy ASSET_REALIZED v3 khi cần góp tiếp với hạn mức/actual cũ, rà T13/T15/T16 theo tiêu chí hiện hành trước đóng phần backend; T14 nhánh chuyển tiếp/CREDITED/đặc thù/pháp lý/corpus review, T15 refinance tương lai/đổi nghĩa vụ, T17 race xuyên nhánh/UI và vận hành/backup/P36 vẫn giữ trong mục tiêu. Nối lại thuê sau END/điều chỉnh release đã xác nhận chưa triển khai; không coi giới hạn này đã nghiệm thu. Giữ concurrent settings/frontend; goal còn active.


## Hiện hành — 07/10/2026: T16 góp một phần/nhiều đợt STAGED

Thêm staged-contributions.ts/schema và nối funding STAGED vào source command/proof/API. allocations mỗi revision chỉ khoản mới; service tự lấy priorRealized cùng sourceId, reader kiểm ledger/history trước replay và từ chối thiếu proof. Tổng đã nhận lũy kế + lịch tương lai = confirmedContributionAmount <= tiền ròng sau sở hữu/phần hưu. Cộng nhiều đợt cùng tháng thành một vốn cuối tháng. Mỗi tháng dự kiến đã đến hạn cần đối soát nhận/missing bằng actual revision và chứng từ; không tự dời số thiếu. Hỗ trợ một phần, bù muộn/vượt dự kiến trong cap, nhận hết, hủy phần tương lai; actual/profile/anchor không đổi.

REALIZED v4 được nâng sang STAGED để góp thêm phần chưa dùng; options hiện có nguồn REALIZED. Sau STAGED chỉ STAGED hoặc END, không quay về chế độ một lần bỏ lịch sử. Nguồn RENT→SALE vẫn cần rentalExit; đã sửa nhãn để tiền thuê tương lai còn HYPOTHETICAL khi góp bán0. Không migration/frontend/provider/email/loanv1 changes. OpenAPI source/plans, ASSET_SOURCES_V4/ADR/task/info và FE-T16-STAGED đã cập nhật.

Kiểm chứng cuối: **583tests/50files PASS** (80,80s),15focused staged+rental PASS, testtypecheck/sourceemit PASS, loanv1 diff/scoped whitespace PASS. Lượt full trước phát hiện nhãn USER_CONFIRMED sai khi còn thuê dự kiến; đã sửa và chạy lại toàn bộ đạt. Assertion retry HTTP đã sửa để so data, requestId mỗi lần khác nhau đúng thiết kế. verify-source-reforecast-db.cjs --assets-staged: sandbox preflight PrismaClientInitializationError0checks, lượt được duyệt **26HTTP/DBchecks PASS**, rollbackVerified=true/tablesPreserved=41/noEmailsQueued/noExternalCalls=true. DB chứng minh create/partial/cumulative proof/save/idempotency/apply/stale/replay. Tất cả session đã kết thúc.

Còn bắt buộc: nhận tiền bán/giải ngân nhiều đợt với hạn mức thanh khoản tăng dần (STAGED hiện một availableOn cho toàn bộ tiền ròng); bridge nguồn ASSET_REALIZED v3 nếu góp thêm; lifecycle nối lại thuê sau END. Giữ toàn bộ T14 các nhánh/chuyển tiếp/CREDITED/pháp lý/corpus review, T15 refinance tương lai/ngày khác nhau/đổi nghĩa vụ, T17 migration0012/races/UI và vận hành/backup/P36. Không đóng goal/backend. Bước tiếp ledger giải phóng vốn nhiều ngày, ưu tiên không cho dùng khoản tương lai trước khi có tiền, kế thừa proof/replay.


## Hiện hành — 07/10/2026: T16 chuyển cho thuê sang bán

REVISE cùng ASSET_CAPITAL sourceId nhận rentalExit (ngày kết thúc, thu nhập ròng tháng cuối thuộc phần nguồn, xác nhận). Lịch thuê gốc giữ tới tháng cuối, tháng cuối lấy số xác nhận, sau đó bằng0; vốn bán chỉ góp số xác nhận sau ngày tiền sẵn có. Bán/góp cùng tháng được hỗ trợ, không chia thuê theo ngày hoặc nhân lại sở hữu/phần hưu. assetRevisionOptions đã trả nguồn thuê. END có thể dừng toàn bộ nguồn tương lai không thêm vốn/khôi phục thuê.

Dời bán không tự kéo dài thuê; muốn đổi ngày kết thúc tương lai phải khai rõ. Khi tháng kết thúc <=cutoff, metadata rentalExit bất biến; REVISE sang REALIZED phân bổ actual không thêm vốn lần2. Thuê linked trong profile không tái xuất hiện. Chặn aggregate income/capital override che lịch; actual/profile/anchor và loanv1 không đổi. Bằng chứng pin, kiểm lại đọc/replay; không migration/frontend/provider/email.

Kiểm chứng: 7 rental-sale tests PASS (service/HTTP/OpenAPI, same-month/zero, END replay, future extension, linked income, stale actual, aggregate override); full **575 tests/49 files PASS** trong93,40s. Test typecheck/source emit PASS, loanv1 diff/scoped whitespace PASS. Lượt đầu fixture sai enum nguồn thu trong test đã sửa thành OTHER trước các lượt đạt; không sửa schema sản phẩm theo fixture. verify-source-reforecast-db.cjs --rental-sale: sandbox preflight PrismaClientInitializationError,0checks/không ghi; lượt được duyệt **27HTTP/DBchecks PASS**, rollback41bảng/noEmailsQueued/noExternalCalls. Tất cả session đã kết thúc.

OpenAPI source/plans, ASSET_SOURCES_V4.md và FE-T16-RENTAL-SALE đã cập nhật. Chưa nghiệm thu UI/ngân hàng/thuế hoặc race riêng cho nhánh này. Tiếp góp một phần/nhiều đợt cùng tài sản với allocations/lũy kế tránh vượt net; giữ các nhánh T14 pháp lý/chuyển tiếp/CREDITED/đặc thù, T15 refinance tương lai/đổi nghĩa vụ/ngày khác nhau, T17 và vận hành/P36 trong mục tiêu. Không đóng goal/backend, giữ concurrent settings/migration0012/frontend.


## Hiện hành — 07/10/2026: T16 khoản góp dự kiến chưa thực hiện

REVISE nguồn vốn PLANNED nhận missedContribution tùy chọn: tháng/số tiền dự kiến cũ, actualRevision, ngày/lý do/chứng từ và xác nhận toàn bộ chưa góp. Đối chiếu đúng lịch trong revision gần nhất và actual đã đối soát của chủ tài khoản. Không suy “chưa góp” từ việc thiếu event; không hỗ trợ khai báo phần còn thiếu sau góp một phần bằng nhánh này. Không sửa actual/profile/anchor, chỉ tạo lịch tương lai do người dùng xác nhận. Pin metadata/actual trong assetSources, giữ replay cũ; không thêm defaults vào snapshot trước đây.

Đã kiểm nguồn từ hồ sơ, trì hoãn hai lần, sửa tiếp lịch chưa đến hạn không đòi xác nhận tháng cũ, nhận tiền sau trì hoãn không cộng hai lần, sai số/tháng/revision/ngày/chứng từ, stale actual/apply và request/response OpenAPI. Contract ASSET_SOURCES_V4.md, OpenAPI generated và FE-T16-MISSED-CONTRIBUTION đã cập nhật. Không sửa frontend/migration/loan v1, không gửi email/provider.

Kiểm chứng: 14 asset-reforecast tests PASS; test typecheck PASS; source tsc emit PASS; full **568 tests/48 files PASS** (90,73s). verify-source-reforecast-db.cjs --assets-missed: lượt sandbox lỗi PrismaClientInitializationError tại preflight, 0 checks/không ghi dữ liệu; lượt được duyệt chạy **28 HTTP/DB checks PASS**, rollbackVerified=true, tablesPreserved=41, noEmailsQueued/noExternalCalls=true. Có save/idempotency/replay/apply/stale correction và giữ profile. Loan v1 diff và scoped whitespace check PASS. Tất cả session đã kết thúc.

Bước tiếp: T16 lifecycle RENT→SALE với ngày dừng thuê/tiền bán riêng và không đếm đôi, sau đó góp nhiều đợt/một phần. T14 topup trước tuổi/chuyển tiếp/CREDITED/đặc thù/corpus review, T15 refinance tương lai/ngày khác nhau/đổi nghĩa vụ, T17 migration0012/races/UI và vận hành/backup/P36 vẫn thuộc mục tiêu. Không thu hẹp phạm vi hoặc đánh dấu backend hoàn thành; giữ concurrent settings/frontend.


## Hiện hành — 07/10/2026: T15 vay thay thế đã trả gốc trước cutoff

Đã nối DISBURSED_BALANCE vào loanCreations/refinances: tách grossPrincipal lúc giải ngân khỏi principalBalance cuối kỳ, đối soát gốc/lãi/phí bằng actual của chủ tài khoản, pin chứng cứ và ledger allocations theo thứ tự registry. CAPPED mang openingUserPaid và tổng trả xác nhận; không cộng giải ngân hoặc trừ khoản trả lần nữa vào quỹ. Preview/save/read/replay/apply/CSV và OpenAPI đã nối, v1 loan.ts không đổi. Chỉ nhận giải ngân cùng ngày tất toán trong cặp refinance này; chưa hỗ trợ refinance giả định tương lai/ngày khác nhau/hợp đồng sửa giữa kỳ.

Kiểm chứng: full 563 tests/48 files PASS; source emit và test typecheck PASS. Sau bổ sung assertion request OpenAPI và proof bị xóa: 20 loan-reforecast tests và test typecheck PASS. verify-source-reforecast-db.cjs --refinance-repaid đạt 22 HTTP/DB checks, rollbackVerified=true, tablesPreserved=41, không email/provider. Tất cả session đã kết thúc. Không migration hoặc frontend; FE-T15-DISBURSED-BALANCE và LOAN_REVISIONS_V2.md đã cập nhật.

Tiếp: T16 khoản góp dự kiến không xảy ra cần xác nhận riêng, sau đó lifecycle RENT→SALE/nhiều đợt; giữ toàn bộ T14 pháp lý/nhánh lịch sử, T15 nhánh còn thiếu, T17 và vận hành trong mục tiêu. Không đánh dấu backend hoàn thành.


## Hiện hành — 07/10/2026: đóng trước và ước tính hoàn trả khi nghỉ hưu

Đợt trước API đóng bù đã có bằng chứng; đợt này tiến triển, không blocker lặp. `voluntaryPrepaid` optional/no-default trong common estimate, newengine `vn-pension-voluntary-prepaid-v1` / branch BH2_VOLUNTARY_PREPAID_REQUEST / strategy2026. Không gửi chung regularcase/topup; engine cũ chặn metadata mới. Kỳ3/6/12/24/36/48/60, ngày đăng ký/trả vàdeadline Luật36(3), giấy biên nhận và yêu cầu (thực tế/hypothetical tách). Reference/rate theo paymentOn, income/wage theo benefitDate. Giữ matchingPAIDmonth1lần; conflictingbase/status/futureoverlap chặn. Chỉ derive tháng thuộc kỳ tới cutoff, không persist/months giả tươnglai; unusedmonths không làmđủ180sớm. Với history174+6đãđếnmốc=180; còn18/24tháng không tínhhưởng.

Hoàn khi đủđiềukiện/yêu cầu hưởng: quoteVoluntaryPeriod giữchiếtkhấukỳgốc, kỳngắnkhôngchiết; tiềnM hỗtrợ phải cóđốisoát/evidence, khôngđoán0. Chưa biếtM→refundnull/status SUPPORT_RECONCILIATION_REQUIRED, pension cóthểELIGIBLEriêng; ESTIMATE_NOT_RECEIVED không làactual. Trợcấp/refundkhôngghiquỹ/anchor/sourcecapital. Corpus thứ6 1.148rows/23cases (8base+9goldens+6guards); PythonDecimal80 sums độc lập cho7kỳ, pure/employer/state pensions. paymentcommonvalidation trích nguyêncheckđểdùngchung, giữfixtureSuiteHash/behaviornhánh topupcũ. 5draft trước giữnộidung,12archives khôngđổi.

Nối estimates preview/save/read/idempotency/owner/history/rule staleness/immutable replay/source candidate + OpenAPI request/response; regeneratedinsurance/source spec. FixtureDB --prepaid --corpus thêmcase thiếuM vẫn pension nhưngrefundnull. UI FE-T14-PREPAID và VOLUNTARY_PAYMENTS/README/task/info/matrix đã cậpnhật; nofrontend/migration/provider/email, không phêduyệt/côngbố corpus vận hành.

Kiểm:31focusedassessment/paymentold PASS;42service+corpusPASS(session37537exit0). **Full558tests48filesPASS**(session94690exit0), `tsc -p tsconfig.test.json`PASS(session22938exit0), `tsc`sourceemit vàcorpus6draft+fragmentcheckPASS(session6785exit0). `verify-state-pension-db.cjs --prepaid --corpus` escalatedapproved **18checksPASS/rollback41tables/noemails/noexternal**(session34195exit0). Các phiên đã đóng. Scoped whitespacecheck cr-at-eol PASS; không gọi fullworkspace whitespace sạch khi còn thayđổikhác.

Nghiên cứu thêm thấy Luật36(3)(e) R02trang26 cho thời hạn đóng phầnthiếu sớmnhất thángtrước tháng đủtuổi; NĐ159Điều7 nêuđãđủtuổi, TT11Điều5(6) hưởngsauđóngđủ. Cần đối chiếu nhánh trảsớm vàversion mới; topup-v1 chỉsauđủtuổi làscope chưa hỗtrợ, không phải tuyênbốcấmtheoluật. Không thaycũngầm. Bước tiếp: topup trảsớm/transition2025 và nhóm bắtđầutựnguyệntrước2021 theoNĐ159Điều13, cần coefficients/sourceyear đúng2025 trướcpublic; CREDITED/statepre2004/đặcthù còn mở. Các hoàn trảkhác tửtuất/BHXH1lần không nằmphạmvi pensionassessment này; không mởrộngthànhtoànbộchếđộBHXH ngoài task.

Giữ mọi T15future refinance/replacement đãtrảgốc/CAPPED, T16RENT→SALE/nhiềulần/khôngxảyra, T17migration0012/races/browser vàoperationsretention/backup/P36. Goal active chưaachieved, không thu hẹp; preserveconcurrentsettings/migration0012/frontend. Cần derive audit toànrequirements khi gầnđóngtask, khôngtickcheckbox từ testsnhánh.


## Hiện hành — 07/10/2026: API đóng bù BHXH

Nhánh `vn-pension-voluntary-top-up-v1` / `BH2_VOLUNTARY_MISSING_YEARS_TOP_UP` đã đăng ký ở dispatcher/strategy. Common input thêm voluntaryTopUp optional không default, engine cũ từ chối metadata mới; không tạo tháng PAID giả. Dùng lịch120–179tháng định kỳ và settlement1–60 để đủ180; lịch thuần tự nguyện, bảo lưu doanh nghiệp hoặc Nhà nước thông thường được tính riêng. Hệ số phần bù1, rate nam40/nữ45, không sàn/trợ cấp dư năm. Payment evidence/age-day/chronology/count/income limits kiểm; HYPOTHETICAL luôn projected, DOCUMENTED_FULLY_PAID không nhận ngày tương lai/chứng từ trước trả/future monthly scenario. Ngày31 clamp cuối tháng tuổi, tháng sinh chưa rõ ngày cần bổ sung nếu trả ngay tháng đủ tuổi. Start liền sau tháng trả đủ; ELIGIBILITY_MONTH là max tháng tuổi và thanh toán.

Lãi/minincome/reference giải theo ngày trả; bình quân/factor/reference Nhà nước theo ngày hưởng. Nguồn ký POVERTY2026 (NĐ351Điều2trang1, không phảiĐiều3 trong ghi chú trước), POVERTY2021 (NĐ07Điều3trang2) đã lưu/hash và xem. Hiệu lực NĐ35115/02/2026 khác khoảng chuẩn cũ áp dụng01/01–31/12/2026. Manifest12sources; generator thêm draft thứ5 1.148dòng với FUND_MONTHLY_RATE2026=0.31percent/month vàVOLUNTARY_MIN_INCOME1.5m;4draft cũ không đổi nội dung. Strategy17cases gồm8base+4goldens+5guards, goldens tổng PythonDecimal độc lập. Giá gross trước hỗ trợ/làm tròn, không là hóa đơn cá nhân. Không auto seed/review/publish corpus thực.

API giữ endpoints estimates hiện có; common capture/service tự pin metadata, engine, lịch/luật/assessment. Kiểm save/read/idempotency/owner/luật superseded/lịch stale/immutable replay/capture và chọn pension vào nguồn, OpenAPI requests/responses. Tạo lại insurance.openapi và source-snapshot.openapi. UI không sửa, bàn giao FE-T14-TOP-UP; VOLUNTARY_PAYMENTS.md/README/task/info/matrix đã cập nhật. Không migration/DBstructure/AIprovider/email.

Kiểm chứng:41focused cũPASS;47focused topup/service/corpusPASS; sau guard day và eligibilityMonth, **full544tests/47filesPASS** (session25693exit0). `tsc -p tsconfig.test.json` và `tsc` sourceemitPASS(session22950exit0). Corpus5draft+fragment offlinecheckPASS. `verify-state-pension-db.cjs --top-up --corpus`: sandbox lượt đầu lỗi Prisma initialization ởpreflight0checks/no writes; escalation được duyệt, **18checksPASS rollback41tables**(session46883exit0), noemail/noexternal. Sau fullsuite bổ sung ca179+1/180+1:11topupfocused PASS, testtypecheck cuối PASS(session34151exit0). Runtime không đổi sau fullsuite. Các phiên kiểm đều kết thúc. git diff --check toànworkspace gặpCRLF/trailingwhitespace có sẵn; scopedcheck với cr-at-eol PASS.

Bước tiếp: metadata/assessment/publiccontract đóng trước2–5năm và hoàn trả phần chưa hưởng (core số học có), rồi chuyển tiếp/CREDITED/đặc thù. Còn topup qua năm/năm khác và corpus duyệt thật, không coi REVIEW_REQUIRED là hoàn tất. Giữ mọi T15 refinance tương lai/nhánh hợp đồng, T16 lifecycle/nhiều đợt/không xảy ra, T17cleanupgrade/races/UI và vận hành/P36. Goal active, không thu hẹp hoặc đóng complete; đây là tiến triển, không blocker lặp. Preserve concurrent settings/migration0012/frontend.


## Hiện hành — 07/10/2026: BH3 đóng trước/bù, công thức và nguồn lãi

Đợt trước progress: Nhà nước+tự nguyện/corpus và sửa scopedHTTPlogs đã kiểm. Đợt này đối chiếu R04signed trang4–6 và TT11Điều5; tìm được nguồn chính thức CV151/BHXH-ĐTQ ngày14/01/2026 tại cổngBHXH ItemID4980. LinkPDF cóport4545 không mở quawebtool, tải được bằngurllib, xem bản ký1trang. Xác nhận0,31%/tháng (bình quân2025, dùng nămđóng2026). Lưu FUND2026.pdf268567bytes/SHA9239d7ca5e0c867c8b2c3a4a1966ddb6caa8b74866a9dc0c116e4a2a259191e9. Corpusmanifest10sources,4draft cũ không đổi, thêmfragmentrate riêng DRAFT_FRAGMENT_NOT_PUBLISHABLE, không thay luậtđãpin.

Thêm voluntary-payment-math.ts nội bộ: prepay2/3/4/5năm tổng22%thu nhập/(1+r)^(i−1), topup1–60tháng tổng22%thu nhập*(1+r)^i vàcount120–179→180/đủtuổi/ngàytừJul2025, refundgiữchỉsốkỳgốc/trừhỗtrợxácđịnh/từchốivượtphầncònlại. DùngDecimalvớiratepercentchia100; không dùnglợi suất danh mục.11tests với expected tínhđộc lập PythonDecimal80, giátrịso2chữsố nhưnghàm trảprecisionđầydủ; chưaquyướcroundingtiềnthuthực.29payments+corpusPASS trướcguardpaidOnlịchsử,11paymenttestsPASSsauguard; typechecktrướcguardPASS. Testtypecheck/sourceemit và corpuscheck cuối PASS (session22343 exit0). Không session kiểm thử còn chạy.

**Chưa API/estimate/persistence/DB cho payments**, không đăngkýnhánhpub hoặc dùnggiảlịchđóngđểvượt180tháng. NguồnND351/2025Điều3 chínhthức xácnhậngiữchuẩn2022–25 trong2026 đãtìm; cần tảiND351/NĐ07bảnký vàđưaminincome1.5m/trần20reference theo ngàyđóng vào rule. Doc VOLUNTARY_PAYMENTS.md ghi metadata/điềukiện/phânbiệtpaymentyear-benefityear/khôngcộngvốn. FE-T14-PAYMENTS-PENDING +task cậpnhật; UIchờcontractthực. KhôngDB/migration/frontend/provider/email trongđợtnày.

Bước tiếp: bổ sungthanh toánđóngbù/đóngtrước với evidence/paidOn/status vào snapshot mới (optionalfields khôngđổi hashcũ, dispatcherchặnenginecũbỏqua inputmới); kiểmđiềukiện/averages/specialfactor1 vàthánghưởngtheoTT11, nốiAPI/strategy/corpus/save/replay/source+DB. Sauđóchuyểntiếp/credited/đặcthù. GiữtoànbộT15refinance tươnglai,T16lifecycle,T17/vậnhành/P36; goalactive, khôngthuhẹpphạmvi hayđóngcomplete. Khôngcóblocker lặplại; đâylàprogress.

## Hiện hành — 07/10/2026: corpus và Nhà nước + tự nguyện

Đợt trước là progress (API tự nguyện/doanh nghiệp và kiểm DB); đợt này tải R04/R06 bản ký từ nguồn Chính phủ, hash trùng LEGAL_RULE_MATRIX, xem lại trang công thức/thời điểm. sources.json hiện9nguồn. generate-legal-corpus thêm2draft tự nguyện-doanh nghiệp và Nhà nước-tự nguyện, mỗi bộ1146dòng gồm19hệ số thu nhập chép riêng cột CV340. Hai draft cũ giữ nguyên byte. Corpus check offline/source hashesPASS; không seed hay publish luật thực.

Đã nối engine `vn-pension-voluntary-state-v1`/branch `BH2_VOLUNTARY_STATE_MIXED_NORMAL`, cùng voluntaryCase + stateSalaryCase. Tính bình quân bắt buộc Nhà nước/doanh nghiệp theo quy tắc riêng trước ghép tự nguyện; kiểm mốc tham gia/chứng từ/hệ số/nguồn hiệu lực; sàn dùng tháng bắt buộcA/B, không tổng tháng. Core dùng xử lý chung có nhánh engine rõ ràng, engine tự nguyện trước đó vẫn từ chối Nhà nước. Strategy14cases (8base+6state), không đổi hash fixtureSuite của nhánh cũ. Lưu/read/replay/idempotency/owner/stale/capture/source candidate và request/response OpenAPI đã kiểm. Docs VOLUNTARY_PENSION/README/task/FE-T14-VOLUNTARY-STATE cập nhật.

Kiểm chứng:35focused trước service,43focused sau corpus/source/OpenAPI; sau ca239/240tháng, **full518tests/45files PASS**. Testtypecheck/sourceemit PASS, corpus4draftcheckPASS. DB `--voluntary --corpus`17checksPASS; `--voluntary-state --corpus`17checksPASS, cả hai rollback giữ41bảng/noemails/noexternal. Lượt Nhà nước đầu dừng assert HTTP historypreview0checks; không lưu mã lỗi nên nguyên nhân chưa xác định, lần sau có diagnostic status/code đạt. Không phiên DB nhánh BHXH còn chạy.

Phát hiện lỗi vận hành ở phần logger thêm đồng thời: errorHandler ghi global Prisma và giữ originalUrl/error.message thô. Sửa nhỏ qua createErrorHandler nhận writer từ services.settings của createApp (đúng store/transaction), giữ metadata code/method/trace/status và route template, bỏ query/param value/rawerror. API router riêng không service không tự dùng globalDB; writer lỗi không đổi lỗi HTTP gốc. Thêm foundation test spy global + in-memory logger/failure;21foundation/settingsPASS,16estimate testsPASS trong lượt trước sửa kỳ vọng path. Testtypecheck/sourceemit sau sửa PASS. **verify-error-log-db.cjs:4checksPASS**, log được thấy trong transaction injected, metadata an toàn, rollback giữ41bảng/noemail/noexternal. Không session kiểm thử/DB/TypeScript còn chạy. Không thay logic settings/auth hay frontend.

**Goal đầy đủ vẫn active**: còn trước10/2004/CREDITED/nhánh đặc thù, đóng trước/bù/chuyển tiếp và rà soát pháp lý độc lập; T15refinance tương lai, T16lifecycle/giải ngân nhiều đợt, T17/migration/browser và vận hành/P36. Bước tiếp nghiên cứu/hiện thực đóng trước/bù/chuyển tiếp với metadata ngày thanh toán/tháng được tính và engine pin mới, không gán PAID tương lai thành đã được hưởng. Corpus hiện chưa phê duyệt pháp lý/PUBLISHED vận hành. Giữ concurrent settings/migration0012/frontend, không migration/reset.

## Hiện hành — 07/10/2026: API BHXH tự nguyện/hỗn hợp doanh nghiệp

Thêm voluntary-math/assessment/validation, engine `vn-pension-voluntary-v1`, branch `BH2_VOLUNTARY_EMPLOYER_MIXED_NORMAL`. Common input thêm voluntaryCase optional, engine mới bắt buộc; engine cũ từ chối case mới để không bỏ qua đầu vào. Bộ luật có8ca kiểm độc lập, hệ số thu nhập2026 từ cột tự nguyện CV340 đã xem cả2trang; runtime và validation kiểm nguồn bảng trong khoảng hiệu lực. Luồng estimates/discovery/source capture dùng engine đã pin, không sửa replay cũ. Không migration/provider/frontend.

Phạm vi: PAID định kỳ, tuổi bình thường, kết thúc tham gia tự nguyện, có thể trước đó là bắt buộc doanh nghiệp Điều2(1)(a). Bình quân theo số tháng từng chế độ/hệ số riêng; sàn chỉ số tháng bắt buộc đủ điều kiện; ngày hưởng dựa tháng đủ điều kiện hoặc dừng+request khi tiếp tục; trợ cấp tách riêng. Helper ngày đóng trước/bù/chuyển tiếp chỉ nội bộ, chưa mở API các trường hợp này. Không thay quyền lợi chính thức bằng kết quả mô phỏng.

Kiểm chứng:26coretests đạt;15service/validation đạt; sau thêm OpenAPI tự nguyện, full **499tests/44files PASS**. Sau guard citation hết hiệu lực, **25focusedtests/3files PASS**. OpenAPI insurance/source tái tạo, ca request/response dùng spec production đạt trong suite. **Test typecheck cuối và source TypeScript emit PASS**, verifier syntax PASS (session17128 exit0). Verifier `node scripts/verify-state-pension-db.cjs --voluntary`: **16HTTP/DBchecks PASS**, rollback giữ41bảng, noEmailsQueued/noExternalCalls=true. Luật mẫu chỉ PUBLISHED bên trong giao dịch rồi rollback; chưa công bố corpus thực. Không khẳng định race từ verifier một transaction.

Lượt kiểm đầu service phát hiện fixture giữ optional `caseDetails: undefined`, hash trước JSON khác sau JSON; đã bỏ key ở fixture trước parse, không thay thuật toán digest/replay toàn hệ thống. Payload HTTP JSON không chứa undefined. Test lưu/replay/idempotency/owner/stale/capture/source candidate hiện đạt.

Docs VOLUNTARY_PENSION.md, task.md và FE-T14-VOLUNTARY cập nhật. **Goal còn active, không hoàn tất backend/T14**. Bước tiếp: tạo corpus tự nguyện nguồn thật có hash (R04/R06 đã có nguồn/hash trong LEGAL_RULE_MATRIX nhưng chưa nằm corpus), kiểm luật nháp/DB; tiếp Nhà nước+tự nguyện, đóng trước/bù/chuyển tiếp/credited/đặc thù. Giữ toàn bộ T15refinance tương lai, T16lifecycle nguồn, T17 và vận hành/P36 trong mục tiêu; giữ concurrent settings/migration0012/frontend. Không còn session kiểm thử/DB/TypeScript đang chạy.

## Hiện hành — 07/10/2026: T17 cạnh tranh nguồn v4 trên PostgreSQL

Đợt trước là progress: đã thêm API nguồn vốn và kiểm DB. Đợt này mở rộng verify-reforecast-concurrency-db.cjs --sources, dùng hai PrismaClient riêng và barrier trước xử lý để chứng minh hai transaction cùng tồn tại với pg_backend_pid khác nhau. Các retry không chờ barrier lại. Promise.allSettled chờ cả hai kết thúc trước cleanup; timeout barrier hữu hạn.

**3 ca PASS**: retry cùng Idempotency-Key trả một version/response; hai key khác cùng expectedRevision chỉ một lưu thành công, bên còn lại409; sửa actual cạnh apply vẫn phát hiện nguồn stale sau cùng, apply tiếp bị chặn và replay cũ giữ nguyên. Lượt đầu kiểm8bảng đạt; lượt gia cố kiểm **toàn bộ41bảng**, count/digest trước/sau khớp và distinctPostgresBackendsVerified=true. Tài khoản mẫu bị khóa đăng nhập, cấu hình về DRAFT trước commit, outbox mẫu hoàn tất trong transaction; không gửi email/provider. Chỉ xóa UUID mẫu và model mới do fixture tạo nếu không được bản khác dùng; không reset/migration. Tất cả fixture đã dọn, không session còn chạy.

Đây là bằng chứng race cho lớp lưu/apply nguồn v4 (candidate có assetCommands), không tự chứng minh mọi nhánh BHXH/refinance/UI. T17 vẫn còn migration/replay xuyên nhóm và UI; toàn bộ goal còn T14/nhánh nguồn/vận hành. Bước tiếp nhánh tự nguyện/hỗn hợp: đã mở lại nguồn NĐ159 trên vbpl.vn và TT11 bản ký, chưa thêm engine trong checkpoint này.


## Hiện hành — 07/10/2026: vay mới, refinance thực tế và tài sản/vốn

Đã bổ sung loanCreations (số dư thực cuối cutoff hoặc giải ngân dự kiến), END khoản đã tất toán và refinances liên kết hai chiều đóng vay cũ/tạo vay mới trong một lần lưu. Đối soát gross−phí+tiền bù = tất toán+tiền dư; chứng từ BANK_CONFIRMED khác hypothetical. Tiền vay không là thu nhập/quỹ, WITHDRAWAL không trừ lại. newLoanSources/refinances pin và kiểm bằng chứng khi đọc/replay; giữ v1/v2/v3.

Đã mở assetCommands CREATE/REVISE/END qua API nguồn, assetRevisionOptions, assetSources pin. Kiểm net sau phí/thuế/trả nợ bảo đảm, WHOLE_ASSET/USER_SHARE, ownership/retirementShare, ngày thanh khoản và số góp xác nhận. Chỉ một capitalInjection cuối tháng; REALIZED dùng actual CONTRIBUTION theo chủ/revision, chia allocation không vượt event kể cả nguồn/bản trước/legacy, không đổi anchor. Chặn đổi identity, dùng lại source realized, dời khoản đã qua cutoff, biến nguồn RENT thành vốn. Không tự xóa nghĩa vụ vay từ số khấu trừ tài sản. Các giới hạn còn làm ở ASSET_SOURCES_V4.md.

Kiểm chứng đợt này: full 452tests/39files ở batch loan (cảnh báo Vitest kill EPERM, kiểm PID sau đó không còn worker); full **465tests/41files PASS** sau assets/công việc settings đồng thời, không cảnh báo teardown ở lượt mới. Sau thêm ca dự kiến→realized/đẩy cutoff, **9assettests PASS**. Source TypeScript emit PASS. Test typecheck ban đầu phát hiện TS18048 ở system-settings.test.ts:106–107 do updateLog possibly undefined, thuộc test được thêm đồng thời. Đã bổ sung đúng một guard nếu thiếu log (không đổi logic settings); 5tests settings PASS. Production và expansion OpenAPI validation PASS. **Test typecheck cuối PASS**, bao gồm toàn bộ source và test mới. Không còn session kiểm thử/DB đang chạy.

DB thật: verify-source-reforecast-db.cjs --loan **19checks PASS**, --refinance **20checks PASS**, rollback giữ **38bảng** tại thời điểm chạy. --assets **20checks PASS**, rollback giữ **41bảng** ở lượt07/10 (schema settings đã được bổ sung ở luồng khác). Không migration/reset/seed/provider/email trong đợt nguồn này. Hạn mức automatic approval review cũ đã qua thời điểm hết hạn; các lượt mới đều được duyệt qua require_escalated, không bypass. Ghi chú cũ nói DB vẫn bị chặn/chưa chạy chỉ là lịch sử. Kiểm rollback một transaction không chứng minh race nhiều kết nối.

Contracts LOAN_REVISIONS_V2.md, ASSET_SOURCES_V4.md, SOURCE_COMMANDS_V4.md và FE-T15-T16-NEW-LOAN-REFINANCE/FE-T16-ASSET-CAPITAL đã cập nhật. Không sửa frontend. Nguồn metadata tham chiếu/cam kết không tự xác minh sở hữu/thuế/ngân hàng ngoài hệ thống.

Còn bắt buộc: các nhánh BHXH lịch sử/CREDITED/tự nguyện/đặc thù và corpus legal review; refinance giả định tương lai, đổi nghĩa vụ CAPPED/nhánh còn thiếu; lifecycle RENT→SALE/giải ngân nhiều đợt/xử lý dự kiến không xảy ra; T17 race PostgreSQL/UI và vận hành/backup/P36. Không đóng mục tiêu/backend. Bước tiếp hoàn thiện các nhánh nguồn còn thiếu và race độc lập, giữ nguyên migration/settings/frontend đang làm ở chat khác.


## Hiện hành — 06/10/2026: API cập nhật khoản vay đã nối

Đã nối loanRevisions (tối đa30/batch) vào source-reforecasts preview/save; apply/read/replay/report/CSV dùng v4 có lịch nợ mới. loanRevisionOptions trả hash/revision từ server để UI không tự băm. legacy-basis.ts chuyển cơ sở số dư từ v1: ngày ký/sửa/hiệu lực/chứng từ do người dùng xác nhận, tiền và tỷ lệ lấy từ profile pin; kiểm lịch cũ và hash import legacy, không bịa lịch v2 lịch sử. Có CAPPED basis tổng payments được xác nhận rõ, mang phần đã trả; đổi trần/loại còn cần xử lý riêng.

Service lấy actual thuộc chủ từ lineage và toàn bộ allocation đã tiêu thụ, chặn trùng/vượt event kể cả nhiều khoản vay cùng batch. Snapshot pin loanSources; reader kiểm liên kết về profile/contract trước, consumed prefix, actual revisions và tái lập lịch. Actual sửa làm save/apply stale nhưng replay lịch sử giữ nguyên. Chuẩn hóa proof theo JSON trước hash để optional undefined không làm sai sau lưu JSONB. Không sửa Contractv1/v2-v3 replay hoặc database; không provider/email/frontend.

Kiểm chứng: toàn bộ **444tests/39files PASS**, source/test typechecks PASS, TypeScript emit PASS, startup thiếu secrets từ chối an toàn; production và expansion OpenAPI PASS. Sau thêm ca đẩy cutoff sang tháng sau, **32focusedtests/2files PASS** (24core +8public). Test typecheck cuối PASS sau khi khôi phục import type LoanContractV2; không còn tiến trình kiểm thử chạy. Luồng public gồm v1→preview/save/apply/read/replay/report, HTTP/schema, owner/hash/legacy metadata, stale actual, idempotency, multi-loan over-allocation, cap carry, cùng cutoff/đẩy cutoff và mất proof. Memory DB không chứng minh PostgreSQL/races.

Đã mở rộng verifier có sẵn: verify-source-reforecast-db.cjs --loan chuẩn bị19checks HTTP/DB rollback, syntax PASS, **chưa chạy**. Không retry/bypass lần automatic approval review usage-limit thất bại trước; không có DB write hay migration trong đợt. Docs LOAN_REVISIONS_V2/SOURCE_COMMANDS_V4/ADR/task và FE-T15-LOAN-V2-API đã cập nhật, supersede ghi chú core-only.

Tiếp theo: refinance atomic đóng vay cũ/tạo vay mới, giải ngân–tất toán–phí có chứng từ; T16-02 tài sản/vốn/vay mới; còn các nhánh BHXH lịch sử/CREDITED/tự nguyện/đặc thù, T17 realDB/races/UI và vận hành/backup/P36. Không thu hẹp mục tiêu hoặc đánh dấu T15/backend xong. Không tiến trình DB/worker được khởi động.

## Hiện hành — 06/10/2026: core khoản vay v2 và revision nguồn

Đã bổ sung revision-schema/revision-engine/reconciliation/source-candidate trong debts. Lịch giảm tiền/giảm kỳ/lịch ngân hàng/cơ cấu, lãi theo từng kỳ hoặc ngày, ân hạn gốc, balloon rõ ràng, phí/lãi riêng không vốn hóa. Không bỏ phí sau hết gốc. Phân biệt toàn hợp đồng/phần user, CAPPED tổng gốc+lãi+phí và mang phần đã trả sang revision. Contractv1 giữ nguyên.

Đối soát actual DEBT_PAYMENT theo event/revision/date, kiểm lại số dư tháng; 12tr trả gồm10tr gốc chỉ giảm10tr gốc. Tổng allocation không vượt event, không reuse ID kể cả khác khoản vay; không suy phần đồng vay theo share. Tăng gốc cần chứng từ và đúng thứ tự ngày, không lấy giải ngân sau bù cho số gốc trả vượt trước đó. Cùng ngày tăng/giảm cần thứ tự ghi sổ, hiện trả lỗi. WITHDRAWAL đã trong actual không bị trừ thêm (fundAdjustment=0).

Builder nội bộ nối basisv2 đã kiểm vào registryDEBT: CAS source/hash/contract, confirmed cutoff cuối tháng, thay từ tháng kế, bảo toàn lịch cũ/anchor, chặn legacy aggregate. Pin command/basis/actuals/consumed và replay bằng registry tiền nhiệm; sửa cùng cutoff không dùng lại actual. CHƯA nối API public/save/apply/snapshot reader, CHƯA bridge Contractv1 hoặc refinance atomic; không đánh dấu T15 hoàn tất. docs/LOAN_REVISIONS_V2.md và FE-T15-LOAN-V2-CORE đã ghi; không sửa frontend/schema/migration, không gọi provider/email hoặc DB.

Kiểm chứng: toàn bộ436tests/38files PASS. Sau bổ sung guard thứ tự ghi sổ,57focusedtests/3files PASS (24tests khoản vay mới); source typecheck PASS trước thay đổi cuối; test typecheck cuối (bao gồm source) PASS. Không còn tiến trình kiểm thử chạy. Không chạy lại toàn suite khi không có thay đổi phần khác. Source builder còn nội bộ nên chưa có bằng chứng HTTP/DB/race cho T15. DB verifier v4/corpus vẫn chưa có lượt thành công mới; lỗi approval usage limit lần trước không được coi là kết luận unsafe hay bằng chứng DB.

Bước tiếp cụ thể: chuẩn hóa basis số dư từ Contractv1 có chứng từ (không bịa ngày ký hoặc lãi giữa kỳ), nối command/evidence vào public source-reforecasts/save/apply/reader + OpenAPI; refinance atomic và T16-02 assets/newloan. Phần BHXH còn thiếu, T17/DB/races, UI và vận hành vẫn thuộc mục tiêu đầy đủ, chưa hoàn tất.

## Hiện hành — 05/10/2026: public nguồn v4 và estimate→candidate

Đã nối `POST plans/{id}/source-reforecasts/preview` và save riêng `POST .../source-reforecasts`. CREATE/REVISE/END thu/chi/pension danh nghĩa VND, ONCE/MONTHLY; owner/plan/profile/source revisions/snapshot hash, actual anchor và idempotency. Cho sửa lại cùng cutoff/cùng tháng bắt đầu nếu chưa nằm trong actual, giữ chuỗi revision; không hồi sinh lịch cũ sau khoảng thay thế. Legacy tổng override được kiểm trên toàn phần lịch bị tác động. Chưa nhận tài sản/vốn/vay mới, T15/T16-02 còn mở.

T14-06 đã nối estimate thuộc user vào candidate: pin toàn bộ capture/history/rules/hash vào snapshot, đọc/replay kiểm lại chứng cứ và mức tiền, không tự góp trợ cấp. Chọn mới/save/apply kiểm dependency BHXH còn dùng trong tương lai; nguồn đã bị thay/dừng vẫn giữ bằng chứng lịch sử nhưng không chặn thay kết quả stale. Luật/lịch hiện hành đổi không thay replay snapshot cũ. Corpus thực vẫn nháp, chưa duyệt/công bố.

PlansService lưu/đọc/replay/apply v4 đúng format/model, đăng ký release lúc tạo version; v2/v3 replay giữ nguyên. Report/compare/CSV có attribution/hash, AI provenance có nguồn nhưng không gửi registry/history ra provider. Actual forecast nhận v4; preview-update v3 chặn v4 để không mất lịch nguồn. Contract production và thiết kế đã cập nhật, [SOURCE_COMMANDS_V4.md](docs/SOURCE_COMMANDS_V4.md), ADR và FE-T16-SOURCE-V4 đầy đủ; không sửa frontend.

Kiểm chứng cuối đợt: **413 tests/37 files PASS**, source/test typechecks và TypeScript emit PASS; production + expansion OpenAPI PASS. Có 9 tests mới cho luồng public v4 gồm HTTP/response schema, actual→preview/save/replay/report/compare/CSV/AI, idempotency/ownership/stale, cùng cutoff/đẩy cutoff, ONCE/FX, BHXH→candidate→stale→END→apply, evidence bị bỏ và aggregate override. Startup thiếu secrets từ chối an toàn; verifier DB syntax đạt. Không coi memory DB là bằng chứng race PostgreSQL.

**DB mới chưa kiểm:** script `verify-source-reforecast-db.cjs` đã chuẩn bị 17checks/rollback, nhưng automatic approval review không hoàn tất do hết hạn mức và từ chối thực thi lệnh. Đây là lỗi cổng duyệt, không phải kết luận thao tác unsafe. Không retry/bypass cổng duyệt. Không có dữ liệu DB được ghi trong đợt này, không migration/provider/email. Lỗi preflight của corpus ở checkpoint trước là lượt khác.

Bước tiếp: T15 contractv2/partial repayment/restructure/refinance và T16-02 assets/capital/debt; các nhánh BHXH lịch sử/CREDITED/tự nguyện/đặc thù T14 cùng legal review; PostgreSQL/races/T17, UI/browser và vận hành. Toàn bộ backend chưa hoàn tất; giữ mục tiêu đầy đủ. Không session kiểm thử còn chạy.

## Hiện hành — 05/10/2026: corpus 2026 và nguồn từ estimate

Đã tạo hai bộ luật nháp BH1/BH2 (`seed-data/legal-2026/`), mỗi bộ 1.127 dòng; lưu bảy nguồn gốc/hash/URL, trình tạo offline tái lập byte và hướng dẫn rà soát. NĐ158/TT12 là bản toàn văn HTML chính thức, chưa phải bản ký lưu trữ. Chỉ thêm đúng CDN chính thức cho Công văn 340 vào allowlist; test tên miền giả mạo và byte nguồn bị sửa. Chưa seed hoặc duyệt/công bố luật thực.

T14-06 có bước nội bộ `captureForSource` kiểm owner/hash/history/rule supersession và `pensionSourceCandidate` pin toàn bộ estimate để replay, CREATE/REVISE sau cutoff, giữ nguyên lịch trước đó, chặn cộng trùng, FIXED_NOMINAL được chọn rõ. Luôn là nguồn dự kiến; trợ cấp một lần không thành vốn góp. Chưa nối public T16 preview/save/apply hoặc lưu evidence vào plan snapshot; không đánh dấu T14-06 hoàn thành. Contract thiết kế và FE-T14-CORPUS-SOURCE đã ghi.

Kiểm chứng: toàn bộ **404 tests/36 files PASS**; sau sửa guard nguồn có END trong tương lai, **29 focused tests/3 files PASS**; OpenAPI expansion và kiểm tái lập corpus PASS. Source/test typechecks và TypeScript emit cuối đợt PASS. Script kiểm DB BH2 đã hỗ trợ `--corpus`, gửi draft qua HTTP và kiểm capture nguồn; **ba lượt đều lỗi PrismaClientInitializationError ngay preflight, 0 checks**, gồm retry ngoài sandbox. Không có dữ liệu kiểm thử nào được ghi, không được dùng bằng chứng DB cũ để coi lượt mới đạt. Không migration/frontend/email/provider. Migration0011 giữ nguyên.

Bước tiếp: các nhánh BHXH lịch sử/CREDITED/tự nguyện/đặc thù và rà soát corpus độc lập; tích hợp candidate vào publicv4/T16, loan revision T15, T17 và vận hành. DB cần kiểm lại khi kết nối phục hồi. Backend chưa hoàn tất. Các checkpoint cũ dưới đây là lịch sử.

## Hiện hành — 05/10/2026: BH2 Nhà nước/hỗn hợp thông thường đã nối

Đã có engine `vn-pension-state-v1`, branch/strategy riêng với18mẫu kiểm chứng, dùng chung API discovery/preview/save/replay. Bổ sung stateSalaryCase và hệ số tháng Nhà nước có evidence; mốc tham gia không bỏ qua lịch đã rút một lần, chặn chứng từ tương lai. Trước2016 dùng hệ số đóng nhân mức tham chiếu; từ2016 dùng hệ số năm hưởng/năm đóng; ghép bình quân với lương doanh nghiệp. Giữ engineBH1v1/v2 và modelretirementv2/v3. Không migration hoặc frontend.

Đã chạy **388tests/35files PASS**, source/testtypecheck+emitPASS; **13HTTP/DBchecks riêng STATE_PENSION PASS**, rollback giữ38bảng. Sau thêm guard hệ số>20 và citationĐiều31, chạy lại11focusedtests+typechecks+emitPASS. Không tiến trình còn chạy. Script verify-state-pension-db.cjs được allowlist, fixture luật/history/estimate không được giữ lại. Contractgen đã chạy và FE-T14-STATE đã ghi hướng dẫn đầy đủ.

Phạm vi BH2 hiện là nhómĐiều2(1)(a)/(b), lương Nhà nước từ10/2004 và hỗn hợp doanh nghiệp, hưởng thông thường. **Còn trước10/2004/nghề/chuyển ngành/phụ cấp/CREDITED, tự nguyện/hỗn hợp tự nguyện/BH3/BH4**, trả thiếu/rà không có nghĩa đã làm xong. Corpus luật thật chưa được chuẩn bị/phê duyệt/PUBLISHED; cần làm artifact cụ thể để rà trước release. Bước tiếp chuẩn bị corpus/rule tables có nguồn/hash và hoàn thiện các nhánhBHXH còn lại; sau đócandidate/T15/T16/T17/vận hành. Goal active. Các checkpoint “BH2chỉcore” phía dưới đã được thay thế.

## Hiện hành — 05/10/2026: trợ cấp BH1 v2, nền bình quân BH2

Đợt trước là progress: engine/API/DB được thay đổi và kiểm chứng. Đợt này thêm `vn-pension-benefit-v2`, giữ v1 không đổi; dispatcher/capture/save pin đúng engine. V2 tính trợ cấp vượt420/360tháng, tách trước/sau tuổi và breakdown riêng, không đưa vào quỹ. Validator16mẫu; test lưuv1 rồi công bốv2 vẫn replayv1 đúng. Có15mẫu cửa sổ/bình quân lương Nhà nước và hỗn hợp; helper chỉ nhận tháng đã điều chỉnh, **chưa là API/coverageBH2**, còn tầng điều chỉnhĐiều73/tiền lương trước10/2004/nghề/phụ cấp và corpus thực.

Đã chạy **382tests/34files PASS**, source/test typecheck và TypeScript emit PASS; **39HTTP/DBchecks PASS, rollback giữ38bảng**, gồm publishfixturev2/save/readv2/replayv1. Không có tiến trình kiểm tra còn chạy. Không migration, không giữ luật/estimate fixture trongDB, không email/provider/frontend. Căn cứ TT12Điều14/16, NĐ158Điều15 và LuậtĐiều72/73 được mở đọc lại; diễn giải quy đổi tháng lẻ theo từng phần trợ cấp đã ghi rõ để người rà đối chiếu khi duyệt corpus. UI FE-T14-ESTIMATES có bổ sungv2.

Goal còn active: tiếp tục corpus luật thật có hash/nguồn và phê duyệt độc lập; hoàn thiện BH2/BH3/BH4 (không thay bằng guardREVIEW_REQUIRED), CREDITED/lịch sử; nối estimatecandidate; T15,T16,T17 và vận hành. Bước tiếp hợp đồng dữ liệu điều chỉnh lương Nhà nước/hỗn hợp và engine/strategyBH2, đồng thời chuẩn bị corpus để rà. Không đánh dấu backend hoàn tất.

## Hiện hành — 05/10/2026: BH1 và API estimate đã nối

Đã đăng ký strategy BH1 lương doanh nghiệp nhómĐiều2(1)(a), đếm tháng/điều kiện/tuổi theo cohort/bình quân điều chỉnh/hệ số2026/tỷ lệ/sàn đúng nhóm và tháng văn bản hưởng. 24test công thức +11assessment; validation9goldens/guards độc lập. API discovery luật đã công bố, preview/save/list/ownedread estimate nối production. Pin toàn bộ lịch/luật/input/ngày đánh giá, hash kiểm chứng/phê duyệt; CAS/idempotency, rule supersession, immutable replay không đọc dữ liệu mới. Không tự sửa pension/profile/plan.

Kiểm chứng đã chạy: **353tests/32files PASS**, source/testtypechecks, TypeScript emit và startup guard PASS. **34ca HTTP/DB thật PASS**, rollback giữ38bảng, không email/provider; lượt đầu sandbox không kết nối được, lượt retry thành công. Không có migration mới hoặc luật PUBLISHED được giữ lại trong DB;0011 bất biến. Contract production/schema và UI bàn giao **FE-T14-ESTIMATES** đã cập nhật; không sửa frontend.

Còn T14-01/03 corpus luật thật với chứng từ/hash và phê duyệt độc lập; BH1 chưa xử lý credited/hồ sơ lịch sử/trợ cấp dư năm, trả REVIEW_REQUIRED rõ. T14-04/05 các nhómBH2–4; T14-06 nối estimate thành nguồn candidate; T15loanrevision; T16publicv4/sourcecommands/report/CSV/AI; T17race/acceptance/vận hành. Không gọi BHXH đầy đủ hoặc backend hoàn tất. Goal vẫn active. Bước tiếp hoàn thiện corpusBH1 và trợ cấp, rồi BH2/3 theo nguồn đã rà. Các đoạn “strategy rỗng/chưa estimate” bên dưới là checkpoint cũ, được thay bằng mục này.

## Đang thực hiện — 05/10/2026: T13-03 core và T14-01/02, migration0011

Hậu kiểm0011 hoàn tất: audit11/11checksum,37modeltables+history=38bảng, không thiếubảng/cột, schema diffempty; ba bảngBHXH vẫn0record.23HTTP/DBchecks sauapply PASS,rollbackgiữ38bảng. Lỗi kết nối trung gian đã phục hồi. FE-T14-HISTORY-RULES đã ghi đủUI contract. source-snapshot.openapi.yaml/gen đã thêm financialv4 nội bộ vào spec thiết kế, khôngmởroutev4. Nhóm20tests/3files đạt saucontracttestinsurance; productionSwaggervalidatePASS, tscemitPASS. Bước tiếpT14-03 research luật rồiengineBH1/estimate.

User yêu cầu làm liên tục đến hết backend; goal active, không dừng ở batch này. Nền registry/composer/modelv4/serializer/upgrade no-op đã có và7tests; chưa nối v4 public preview/save/report/CSV/AI, T13-03 vẫn mở phần tích hợp. Giữ nguyên engine/hash/modelv2/v3. T14 rules/history services/routes đã có, [INSURANCE_HISTORY_RULES.md](docs/INSURANCE_HISTORY_RULES.md), production insurance.openapi.yaml/generator; strategy registry hiện rỗng nên chưa publish engineBHXH. Không giả fixture workflow là mẫu pháp lý.

Migration202610050011_pension_rules_history **APPLIED**, ba bảng rules/history/estimates, composite ownership FK, checks, immutable triggers; không chỉnh0001–0010. Normal Prisma generate và TypeScript emit đạt. Audit trước thêm:10checksums, schema empty,50profiles giữ nguyên. DDL rehearsal giữ34bảng;23HTTP/DBchecks+rollback giữ35bảng đạt trước deploy. Clean11/upgrade4→11/10integration/custombackup-restore38bảng/expiry cleanup đạt trong container tạm đã dọn. Apply lần đầu thất bại, kiểm chỉ đọc xác nhận chưa chạy/không dở dang; retry đạt, fingerprint dữ liệu cũ không đổi. Hậu kiểm audit/23DBchecks đang retry lỗi kết nối P1001/TLS tạm thời; cần ghi kết quả cuối trước kết thúc.

Full313tests/29files+test/source typechecks đạt; thêm contract test mới → nhóm20tests/3files đạt. Đã research lại TT12 Điều15/16, NĐ158 và hệ số340/2026 để tiếp T14-03; chưa code công thức BH1. Tiếp: kết thúc audit/DBcheck0011 và contract/source snapshot, rồi BH1 registered strategy + immutable estimate, sau từng BH2–4, T15/T16/T17/vận hành. Frontend không sửa; cần FE-T14-HISTORY-RULES. Không có migration/bảng cần user bổ sung thủ công, không seed/PUBLISH luật, không gọi provider/email.

## Checkpoint hiện hành — 05/10/2026: T13-01/T13-02, căn cứ và thiết kế mở rộng

User yêu cầu tiếp tục các task vừa nghiên cứu sau khi sửa cổng dev. Đã thực hiện T13-01 và T13-02 trong docs/task.md; chưa thực hiện T13-03 hoặc các engine BHXH/loan/source mới.

- LEGAL_RULE_MATRIX.md có nhóm/ngày/điều khoản, ranh giới coverage và bước nghiệm thu. Đã dựng ảnh và đọc toàn bộ bản ký R04(17trang), R06(4), R11(3); SHA-256 được ghi để đối chiếu byte tài liệu. NĐ158 Điều44 không bãi bỏ bảng tuổi I–II, nhưng bãi bỏ căn cứ thời điểm hưởng cũ. R11 Điều4/10 được đưa vào loan design, R12 TT14/2026 là nguồn bổ sung cho T14-04 cần đối chiếu khi làm bộ điều chỉnh. Không coi PDF đã đọc là bộ quy tắc đã publish.
- Pension preview dùng age referencev2: referenceFollowingMonth tách riêng; pensionStartMonth trong kết quả tra tuổi luôn null, pensionStartStatus REQUIRES_BENEFIT_ASSESSMENT. Không sửa personal.pensionStartMonth hoặc tiền pension đã khai. Xóa limitation cũ nói chưa tích hợpT06, thêm giới hạn assessment chưa triển khai.
- Đóng băng legal-age-v1.ts và preparev3 tiếp tục gọi bản đó. OpenAPI tách LegacyAgeReference cho retirement/plans; cập nhật generator để không tái tạo ref sai. Không thay engine/formula/hash/modelv2/v3. Bước focused đầu49tests có1contract failure vì ref chung; đã sửa tách schema, full suite sau đạt.
- ADR-001-EXPANSION.md chốt3bảng BHXH (rules/history versions/estimates), ERD, JSONB plan-scoped registry/loan revisions, hiệu lực/knowledge time, ownership/CAS/hash/atomic changeset, migration cộng thêm. expansion.openapi.yaml là spec thiết kế với x-runtime-status NOT_IMPLEMENTED, chưa ghép production; financial outputv4 hoàn thiện cùngT13-03. Không tạo route/bảng luật giả hoặc seedPUBLISHED.

Bằng chứng thực chạy: full Vitest **299tests/27files PASS** (`node node_modules/vitest/vitest.mjs run --maxWorkers=2`); source/test typechecks PASS; SwaggerParser validate spec thiết kế PASS; isolated Prisma generation + TypeScript emit PASS; production startup missing-secrets guard PASS. Sau siết OpenAPI pensionStartMonth=null, nhóm42tests/4files pensions/legal-reference/plans/contract PASS và spec thiết kế validate lại PASS. Bước build đầu bị EPERM lstat C:/Users/os (thư mục temp sandbox); đặt TEMP/TMP riêng trong .cache/t13-build-temp cho tiến trình kiểm tra rồi đạt, không sửa env tài khoản hoặc dừng server. Đây là build riêng, chưa chứng minh normalbuild với DLL đang dùng.

Không DB write/migration/provider/email/frontend edits, không khởi chạy thêm server. Không cần thêm DB thủ công lúc này; DDL ởT14 phải audit hiện trạng0010 trước. FE-T13-REFERENCE ghi giao diện cần sửa và các route thiết kế chưa khả dụng. Browser, CI, production operations/P36 còn mở; chưa dùng299tests để nghiệm thu chức năng mở rộng chưa code. **Tiếp theo T13-03: composer nguồn + registry snapshot/modelv4 + dispatcher v2/v3/v4 và no-op/replay/attribution tests**, rồi T14-01 rules lifecycle/storage theoADR.

## Checkpoint — 05/10/2026: xử lý cổng dev EADDRINUSE

User yêu cầu sửa lỗi `npm run dev` trước khi tiếp tục kế hoạch. Cổng 5000 bị PID 8952 giữ: đã xác minh command thuộc `E:\An_Huu\backend\node_modules\...\ts-node` chạy `src/server.ts`, tiến trình cha không còn, `/health` trả đúng An Hưu. Đã dừng riêng tiến trình cũ này. Kiểm tra khởi động cùng entrypoint với quyền mạng: `/health` và `/health/ready` đều HTTP 200; đã dừng tiến trình kiểm tra và xác nhận cổng 5000 không còn listener, sẵn cho terminal của user chạy lại (`rs` nếu nodemon còn mở). Lượt sandbox gặp P1011 nhưng lượt có quyền mạng đạt. Không sửa code, cấu hình, frontend hoặc dữ liệu DB; không đổi cổng. Các tiến trình npm/nodemon do phiên kiểm tra tạo đã được dọn. Kế hoạch T13–T17 giữ nguyên, chưa triển khai.

## Checkpoint hiện hành — 05/10/2026: nghiên cứu mở rộng sau MVP

User yêu cầu research chi tiết rồi lên plan cho BHXH tự tính, trả một phần/tái cơ cấu nợ và nguồn mới trong reforecast. Đã tra nguồn Chính phủ/Công báo và đối chiếu pensions/debts/actuals/plans; tạo docs/research-bhxh-no-nguon-moi.md, mục10 T13–T17 trong docs/task.md và FE-EXPANSION-T13-T17 trong task-frontend. Phiên này chỉ tài liệu: không code runtime, migration, DB write, provider call hoặc chạy lại tests.295tests/7DBretention/backup rehearsal ở checkpoint trước vẫn là bằng chứng cũ, không nghiệm thu phần mở rộng.

Research có Luật BHXH gốc +bản hợp nhất2026, NĐ158/159, TT11/12, hệ số340/2026, Luật Nhà giáo và NĐ162/2026; tín dụng dùng VBHN06/NHNN cộng rà TT29/2026 hiệu lực15/08, không gọi bản01/2026 là đủ hiện hành. Đã xác minh nguồn/hiệu lực R04/R06/R11 nhưng bản scan/điều khoản còn phải đối chiếu chi tiết trước executable rules; danh mục nghề/địa bàn/BH4 cần research riêng. NĐ158 Điều44 bãi bỏ một số khoản NĐ135: cần rà metadata/legal-age, không suy toàn bộ bảng tuổi hiện tại sai. Làm rõ engine nợ đã có mô phỏng partial prepay giảm kỳ; thiếu phần actual+revision lịch mới vào reforecast.

Plan: T13 rules/source registry/version compatibility; T14 BHXH theo coverageBH1–BH4, history tháng/factors/estimates; T15 payment allocation/loan revisions/restructure/refinance; T16 create/revise/end sources; T17 golden/DB/browser. Dự kiến3thực thể DB cho rule/history/estimate, chưa chốtDDL; registry ưu tiên snapshot JSON, phải đánh giá ràng buộc. Giữ EXPLICIT_DEPOSITS_ONLY, actual anchor, no double-count, save/apply riêng và replayv2/v3; proposedv4 không được sửa nghĩa v3. Next implementation khi user tiếp tục: T13-01/T13-02, không khởi động lạiT00 hoặc hỏi chốtP13/P15. Operations/backup deletion/P36/UI củaMVP vẫn mở riêng.

## Checkpoint hiện hành — 05/10/2026: retention độc lập và diễn tập backup/restore

Tiếp tục T10/T12 theo user: tách purge khỏi AiService sang ai/retention, giữ export tương thích. Thêm dist/retention.js chỉ cần DATABASE_URL, mặc định dry-run, --execute rõ ràng; batch/maxBatches có giới hạn, cutoff cố định, rollback từng lô, dừng giữa lô/đóng DB, log mã/count không PII. Worker outbox gọi cùng sweep có giới hạn và báo backlog; thêm npm scripts/env mẫu/Docker command. Không cần SMTP/JWT/outbox/Gemini để dọn AI. Không migration/frontend hoặc gửi email/provider.

Mở rộng verify-clean-upgrade: pg_dump custom→pg_restore vào DB thứ ba trong container tạm;35bảng count/digest khớp, giữ lịch sử migration/profile/nguồn. Chạy executable retention thật với các secret không liên quan trống: dry-run giữ dữ liệu, execute xóa expired conversation/messages/context, giữ hồ sơ/partner. Dump chỉ chứa fixture, nằm trong container rồi được dọn. Không phải backup production.

Evidence: test typecheck và full295tests/26files PASS; isolated Prisma generation/emit +startup guard PASS. verify-retention-db7checks PASS, chỉ ID mẫu, rollback/fingerprint35bảng giữ nguyên; lần đầu Prisma initialization lỗi trước fixture, TCP/SELECT1 sau đó đạt và retry thành công. CLI trên DB đang dùng chạy DRY_RUN:0eligible/0deleted/0remaining, không thực thi xóa dữ liệu thật. verify-clean-upgrade clean10/upgrade4→10 +10integration/2files PASS, backup/restore35bảng +standalone cleanup PASS, container/volume đã dọn; artifact .cache/migration-fd1bd4f2-f2d2-4276-9b06-1627cd76afc7. Lỗi type của mock trong test mới đã sửa trước lượt full PASS; không thay logic production để né test.

Contract docs/RETENTION_OPERATIONS.md; task/T12/info/plan/FE cập nhật. Còn mở: cấu hình lịch chạy và giám sát trên môi trường triển khai, backup production/retention của bản sao và áp lại yêu cầu xóa sau restore (purge expired không giải quyết dữ liệu còn hạn đã xóa sau backup), quyền dữ liệu toàn tài khoản/P36, staging provider khác, CIremote/build mặc địnhDLL và browser/UI. Bước tiếp backend phụ thuộc UI/staging: kiểm API lỗi thực khi nối FE-GEMINI/P13/P15; chọn môi trường scheduler/backup trước triển khai thật. Không coi mã/lần chạy thủ công là lịch production đã vận hành. Các checkpoint phía dưới là lịch sử.

## Checkpoint hiện hành — 05/10/2026: kết nối Google Gemini

User chốt Gemini và cung cấp key, thay chỉ đạo “chưa chọn provider” ở các checkpoint lịch sử. Đã nối GeminiProvider vào createServices: cấu hình bằng env, key chỉ trong backend/.env được Git bỏ qua, HTTPS/header không query/redirect, schema chỉ chọn facts/citations, giới hạn output/timeout, fallback giữ facts server và không lộ lỗi upstream. Không migration, không dữ liệu khách hàng gửi ra ngoài khi kiểm thử, không sửa frontend.

Policy `ai-explanation-gemini-2026-10-v2` yêu cầu consent lại trước outbound với tài khoản v1. Privacy GET/PUT có provider/processingNotice/reconsentRequired; OpenAPI cập nhật. “Training” hiện là tri thức local có index/duyệt/truy xuất vào context, chưa fine-tuning. Contract `docs/GEMINI.md`, UI ghi FE-GEMINI trong docs/task-frontend.md; UI hiện hardcode policy v1 cần cập nhật trước dùng luồng AI mới.

Đã chạy test typecheck PASS; full Vitest `--maxWorkers=2`:290tests/25files PASS; isolated Prisma generation/tsc emit PASS; startup thiếu secrets bị từ chối trước DB. Live smoke `verify-gemini.cjs` PASS bằng dữ liệu mẫu với Gemini API developer, gemini-3.8-flash, timeout15s. Thăm dò Vertex trước đó403 API_KEY_SERVICE_BLOCKED; developer 2.5 Flash404 không còn dành cho user mới, Google chỉ định3.8. Có lần timeout/network thất bại trước smoke cuối thành công; không suy độ ổn định dịch vụ từ một lần PASS. Đã lưu developer/3.8 trong env, không đưa key vào tài liệu/source/log. Không restart server đang chạy.

Bước tiếp: frontend thực hiện FE-GEMINI (notice/consent v2/trạng thái thật/tri thức), restart backend theo vận hành rồi nghiệm thu browser/tri thức theo version; quota/billing/retentionworker/backup/P36 và staging vẫn mở. Những dòng “không có provider” phía dưới là lịch sử; không còn chờ user chọn nhà cung cấp. T12 chưa nghiệm thu toàn sản phẩm.

## Checkpoint hiện hành — 05/10/2026: Q15-03 điều chỉnh từng nguồn

Đã thêm sourceChanges vào reforecast preview/save: DEBT_SETTLED (hợp đồng + event DEBT_PAYMENT + xác nhận remainingObligation0), ASSET_REALIZED (event CONTRIBUTION; bỏ đúng vốn/tiền thuê dự kiến), PENSION_REPLACE và FLOW_REPLACE (nguồn thu/chi có sẵn; số danh nghĩa theo khoảng). Không suy tất toán từ khoản trả một phần, không cộng lại tiền tài sản đã nằm trong actual anchor. SourceID phải thuộc capture của version; kiểm loại/ngày/event, reuseID/event, overlap theo nguồn và xung đột với futureChanges tổng tháng. Giữ nguồn cũ ngoài khoảng, recompute capacity/withdrawal/contribution và giữ explicit surplus policy. Không thay CPI/lãi suất/hồ sơ tài khoản. Model vẫn v3, không migration mới, không sửa frontend.

Snapshot lưu lịch sử sourceChanges; report/CSV/AI đánh dấu giả định khi thay dòng tương lai, CSV có sourceChangeIds, compare có sourceChanges. Actual evidence thay đổi vẫn invalidates save/apply qua hash/lineage, replay version cũ không đổi. Contract `docs/SOURCE_REFORECAST.md`, OpenAPI và contract chung CONTRIBUTIONS_REFORECAST đã cập nhật; UI ghi FE-Q15-03 trong docs/task-frontend.md.

Đã chạy: `node node_modules/typescript/bin/tsc -p tsconfig.test.json` PASS; full `node node_modules/vitest/vitest.mjs run --maxWorkers=2`:273tests/24files PASS, gồm7ca source mới. `verify-build-isolated.cjs`:Prisma generation riêng +tsc emit PASS. `check-production-startup.cjs`:thiếu secret bị từ chối trước DB. `verify-source-changes-db.cjs`:17HTTP/PostgreSQL checks PASS, rollback verified/35tables preserved/noemail/noexternal; có bốn loại nguồn, retry/save/apply/replay/CSV/OpenAPI/ownerADMIN/correction. Lần đầu fixture hợp đồng có kỳ đầu khác tháng định giá nên INCOMPLETE; đã sửa fixture theo quy tắc sẵn có. Hai lần kết nối tạm thời thất bại trước kiểm chứng, SELECT1 sau đó phục hồi và lần cuối17ca đạt. Không coi lần lỗi là evidence PASS; không reset/dừng DB. Git diff whitespace cho các file tracked thuộc đợt này không có lỗi.

Phạm vi còn mở: trả một phần/tái cơ cấu khoản vay, tài sản/nguồn hoàn toàn mới trong reforecast, tự tính BHXH không nằm trong sourceChanges đợt này; dùng cập nhật hồ sơ/nguồn riêng và tạo version nguồn mới. Bộ tính CAPPED/LIMITED vẫn theo giới hạn đã ghi trước. UI/browser FE-Q15-03/FE-P13-P15/FE-RECHECK và T12 toàn sản phẩm chưa nghiệm thu; actual nhu cầu chưa tài trợ cần thể hiện đúng, không tự sinh WITHDRAWAL/CONTRIBUTION. NormalbuildDLL, CIremote, staging, retentionworker/backup/P36 và provider chưa chọn vẫn mở. Bước tiếp backend: rà các điều kiện nghiệp vụ còn mở theo task và kiểm tích hợp với UI đã nối; không tự bật AIprovider, không nhận backend PASS làm UI/phát hành PASS. Các checkpoint dưới là lịch sử.

## Checkpoint hiện hành — 05/10/2026: triển khai P13/P15 backend

Chốt kiểm tra cuối đợt: source emit PASS;45tests/4files (contribution-policy, reforecast-update, ai, plan-presentation) PASS sau bổ sung nhãn nguồn AI và metadata so sánh. Full265 là lượt trước khi thêm test AI mới, không cộng hai lượt thành tổng mới. Không còn tiến trình kiểm tra của đợt này. UI handoff ở task-frontend.md dòng433; contract mới có đầy đủ JSON và giới hạn phạm vi.

Đã triển khai theo thứ tự Q13/Q15: enum START/END (END mặc định), khai nguồn đầu tháng có xác nhận, tháng hiệu lực sau partial month, capacity/solver nhất quán, model retirement-monthly-v3. engine-v2 giữ nguyên để replay snapshot cũ. EXPLICIT_DEPOSITS_ONLY chính thức. Có trạng thái EARLY_FUNDING_REQUIRED/NO_ELIGIBLE_CONTRIBUTION_PERIOD, không lấy số null làm0.

Q15 có POST actuals/reforecast/preview và plans/:id/reforecasts; preview trả candidate/beforeChanges cùng anchor, save idempotent/hash/revision và apply riêng. Snapshot pin source/hash/cutoff/actual revisions, mở lại history vẫn replay sau sửa actual; apply/dự báo tiếp/AI chặn nguồn lỗi thời, report/detail trả actualSourceChanged. Điều chỉnh REPLACE_MONTHLY_TOTAL cho income/livingExpense/additionalExpense/plannedContribution theo khoảng tương lai, không tự nhân giao dịch một lần hoặc góp hết dư. Report/CSV/AI đã phân biệt REFORECAST. Generic simulate từ chối reforecast để tránh bỏ anchor. Không sửa frontend, không migration mới.

Bằng chứng: full265tests/23files PASS bằng `node node_modules/vitest/vitest.mjs run --maxWorkers=2`; sau thêm AI provenance test, nhóm contribution-policy/reforecast-update/ai35tests PASS. Test typecheck PASS. `verify-contribution-reforecast-db.cjs`:22HTTP/DBchecks PASS, rollback/35tables preserved/noemail/noexternal. `verify-reforecast-concurrency-db.cjs`:3independent races PASS, fixture private SUSPENDED + config chuyển DRAFT trước commit, exact-ID cleanup và fingerprints unchanged. Không chạy lại migration0010. Sandbox không kết nối DB được, chạy phạm vi đã được user cho phép ngoài sandbox thì đạt. Isolated Prisma generation + tsc emit PASS ngoài sandbox; startup thiếu secret từ chối an toàn. Lượt full chạy song song cao có6 rồi2timeout ở các test cũ; lần2 npm PowerShell không chuyển maxWorkers như mong muốn. Gọi trực tiếp Vitest2workers đạt265; không thay timeout/assertions để làm xanh.

Contract mới `docs/CONTRIBUTIONS_REFORECAST.md`, OpenAPI và5contract liên quan đã đồng bộ. `docs/task.md` mục7.1 đánh dấu phần có evidence; `docs/task-frontend.md` có FE-P13-P15 contract/payload/error/state/acceptance. Generators liên quan và scripts kiểm chứng đã bỏ ignore có chọn lọc để bàn giao tái chạy được.

Còn lại: UI/browser trong các checkbox gộp; Q15-03 hiện thay tổng tháng, chưa chỉnh từng nguồn/hợp đồng nợ/tài sản/lương hưu trong reforecast. Các lịch đó vẫn pin và trả limitation yêu cầu rà nguồn riêng; netWorth/selection giữ cơ sở hồ sơ gốc. Actual ledger không tự tạo bút toán rút để bù thiếu, cần hoàn thiện trình bày nhu cầu chưa tài trợ cùng UI. Hồ sơ khác nguồn phải tạo version nguồn mới. Normal build DLL/CIremote/staging/workerretention/backup/P36/provider vẫn mở, không tự chọn AI provider. Bước tiếp: hoàn thiện luồng rà nguồn riêng Q15-03 nếu tiếp tục mở rộng backend, phối hợp UI AI kết nối FE-P13-P15/FE-RECHECK rồi chạy browser bằng runner sở hữu port; không nhận backend PASS thay UI nghiệm thu. Checkpoint bên dưới là lịch sử.

## Checkpoint hiện hành — 05/10/2026: rà việc còn lại sau kế hoạch P13/P15

User yêu cầu kiểm tra việc chưa làm. Đã đối chiếu mã hiện tại, không chỉ đếm checkbox. Q13-01–03/Q15-01–04 vẫn chưa triển khai bổ sung: prepare hardcodeEND_OF_MONTH, engine START_OF_MONTH_RESEARCH; plans metadataEND; actual router chỉreforecast, limitationREFORECAST_NOT_SAVED_OR_APPLIED. Nền ledger/explicit contributions đã có, không gọi toàn bộP15 là chưa làm. Nghiệp vụ đã chốt, không hỏi lại.

Frontend có sửa mới của workspace: actuals/AI/adminKnowledge đã gọi helper đúng; Decimal riêng thayNumber. Chạy `node scripts/verify-frontend-wire.cjs` lại:14writes đúngmethod/body/header; actualPUT/privacy/explain/deleteall200,knowledgecreate201;404 là IDfixture khôngtồn tại,403createconversation vìsaveHistory chưaconsent. Precision0.01 và9007199254740993.26 đạt đúng. Artifact `.cache/frontend-wire-audit.json` hiện là lần chạy mới, thay diagnostic cũ; không coi các lỗi nghiệp vụ fixture là transportfail. `node --experimental-strip-types --test scripts/actuals-and-ai.test.mjs`:2/2PASS nhưng test đối soát tự chép hàm, chưa bằng chứng hồi quy hàmproduction; probe dùng hàm thật đã kiểm mộtca. Không chạy lại browser/build/fulltests/DB trong lần rà này.

Còn thấy trong mã: save/apply bỏfalse/closurecũ, choices[0], CSVlocal, completion90%; settings Account/modal vẫnlocalStorage dùserviceAPIcó; AdminBusinessPages vẫndemostate. AdminAIConfigPages hiện initialSources vàlocalStoragefinancialassumptions/history, routesApp vẫntrỏđó: cần nối lại UI dùadminKnowledgeservice đãsửa. Accountstate đã córeset/sequence mới, cầnbrowserđánhgiá chứkhôngghi chưa sửa. Browserlần gầnnhất15/41 trước cácsửamới; runnerfrontend vẫntaskkill.

Việc còn lại:7góibổsungP13/P15; UI nêu trên vàFE-T11; T12browser/realDB/offline/multitab; normalbuildDLL/CIremote/staging/workerretention/backup/P36; providerAI chưachọn. Nợ nghĩa vụCAPPED/LIMITED chưa mô phỏngđầyđủ; BHXHtựtính thuộc sauMVP. DBsạch/nângcấp10migration đãđạt ởlầntrước, không đưa lại vào backlog. Cập nhật task/task-frontend để tránh checklist cũ dẫn sai trạng thái. Bước backend tiếp vẫn Q13-01 + Q15-01, frontend xử lý phần kết nối/kiểm chứng còn lại.

## Checkpoint hiện hành — 05/10/2026: bổ sung kế hoạch sau chốt P13/P15

Chủ dự án xác nhận khách đã chốt hướng giải thích; câu trả lời bổ sung **“Chỉ góp số người dùng xác nhận”** chốt EXPLICIT_DEPOSITS_ONLY. Đã cập nhật `docs/task.md` mục5/7.1 với Q13-01–03 và Q15-01–04, đồng bộ FE-P13-P15. P13 hướng hỗ trợ lựa chọn đầu/cuối tháng, giữ mặc định cuối tháng tương thích P12; cần điều kiện khả dụng đầu kỳ và kiểm semantics trước mở API. P15 giữ tiền dư/góp dự kiến/góp actual riêng; bổ sung lưu reforecast thành candidate version, linked actual revisions/anchor/hash, thay đổi lịch tương lai có xác nhận, apply riêng, replay lịch sử.

**Phiên này chỉ lập kế hoạch, chưa sửa backend/frontend runtime, chưa migration hoặc chạy lại tests.** API hiện tại vẫn chỉ END_OF_MONTH và reforecast chỉ đọc. Không dùng trạng thái chốt nghiệp vụ để đánh dấu code đạt. Bước backend tiếp: Q13-01 + Q15-01 thiết kế contract/version tương thích, rồi Q13-02/Q15-02; AI frontend xử lý FE-RECHECK và chỉ mở UI mới khi contract sẵn. Các mốc “Q13/Q15 còn chờ khách” phía dưới là lịch sử, không hỏi lại chính sách tiền dư. Provider/P36/worker/backup/browser/build vẫn là việc riêng chưa đóng.

## Checkpoint hiện hành — 05/10/2026: kiểm tra lại bốn nhóm còn mở

Theo ảnh user gửi: đã rà T00, frontend T06–T10, T10 provider/retention/P36 và Q13/Q15. **Báo cáo hiện hành: `docs/RECHECK-T00-T10.md`; UI ưu tiên FE-RECHECK-20261005 ở đầu `docs/task-frontend.md`. Các checkpoint dưới là lịch sử. Không sửa frontend trong đợt này.**

- Phát hiện DB sạch sau9 migrations thiếu5cột metadata giả định/goal mặc dù DB đang dùng có sẵn. Thêm migration `202610050010_complete_financial_metadata`, không sửa migration cũ; preview DDL rollback, apply thật và fingerprint dữ liệu giữ nguyên. Audit09:48 VN:34bảng nghiệp vụ+history,10/10checksum,không pending/thiếu cột,bảng,diff rỗng.50profiles/50goals/2config/5knowledge giữ nguyên.21refresh/2outbox/14audit là hoạt động hiện có, không dọn theo count.
- `node scripts/verify-clean-upgrade.cjs`: PostgreSQL16/pgvector Docker cổng localhost tạm; bare chưaextension thất bại đúngvector; clean10/upgrade từ4→10 với legacy fixture giữ nguyên và diff rỗng;10integration tests/2files PASS; purge history/context hết hạn, giữ chưa hết hạn PASS; xóa đúng container/volume có label. Artifact cuối `.cache/migration-1665fb0f-b373-4d50-b57b-ec871598ab0a`. Không backup production/không reset DB thật.
- `prepare-test-db.cjs` tạo extension sau guard local/tên DB; CI service đổi pgvector image ghim digest đã kiểm. Đường chuẩn bị CI chạy localPASS; chưa chạy GitHub Actions. Lần đầu container pg_isready socket sớm làm kết nối thất bại, đã sửa đợiTCP; lần tiếp theo phát hiện thiếu5cột rồi thêm0010 và chạy lại đạt. Không sửa công thức để làm test xanh.
- `verify-frontend-wire.cjs`: gọi nguyên hàm frontend vào Express/auth+DB giả lập;14 thao tác ghi actuals/AI/knowledge sai chữ ký authenticatedRequest → POST wrapper và mất header,400/404; GET plans đối chứng200. Diagnostic exit0 không có nghĩa nghiệp vụPASS. Cùng script chứng minh Number/round làm góp0.01→0 và số lớn mất chính xác. `.cache/frontend-wire-audit.json` lưu evidence. Findings static thêm: save/apply closure cũ/toastfalse, fabricated answers/defaults, account state chưa invalidation, CSVlegacy,90%cố định/adminsavecục bộ; giao UI kiểm và sửa, chưa gọi các phát hiện static là browser tái hiện.
- Fresh frontendbuild+5prerender PASS. `T12_BROWSER_EXTENDED=1 node scripts/verify-browser.cjs`:41ca,15PASS/26FAIL,0skip,558.95s/exit1,khôngteardownhang; JSON+traces `.cache/t12-browser-*`. Lỗi gồm selector/fixture cũ và UI overflow/menuhitbox thật; không coi26fail là26lỗibackend. admin-ui artifact đã dùng testInfo.outputPath, ghi chú path cá nhân cũ không còn áp dụng. Không chạy setup-preview freePort/taskkill.
- Rerun `npm test -- --run src/tests/ai.test.ts src/tests/actuals.test.ts src/tests/retirement-monthly.test.ts src/tests/plan-presentation.test.ts`:62/62,4files PASS; `npm run typecheck:tests` PASS. Standard build vẫnEPERM defaultPrismaDLL; không kill tiến trình khác. Bằng chứng build isolated ởcheckpoint trước vẫn ghi riêng.
- T10 không chọn/call provider. Retention logic PASS trên PGtạm, chưa chứng minh worker đã deploy: worker cầnSMTP/outboxconfig trước khi purge; workflow repo chỉdeployweb. Không chạy worker thật do outbox đang chờ. P36 UIrights bịlỗitransport; backup/quyền toàn tài khoản/pháp lý cònmở. Q13 productionEND_OF_MONTH, researchtest riêng; Q15 khôngautoinvestsurplus; chưa có quyết định user mới.
- Kiểm cuối:6script syntax,3case guard từ chối DBthiếu/remote/sai tên, YAML/image digest vàgitdiffcheck scoped PASS. Thêm exception `.gitignore` đúng các script kiểm chứng được bàn giao vì rule `scripts/` trước đó bỏ qua cả scripts backend; không mở toàn bộ thư mục script địa phương. Không commit hoặc deploy.

**Bước tiếp chính xác:** AI frontend sửa FE-RECHECK-20261005, ưu tiêntransport/precision/save-apply/data theoaccount; rerun41browser và bổ sung luồng nốiDB. Backend xử lý regression API có evidence; vận hành xác nhận normalbuild/worker/backup. F15/F21 phần migration local đã đạt; không còn ghi “chưa có bằng chứng DB sạch”. T00/T12 toàn bộ vẫn mở. Không áp lại0010 hoặc sửa0001–0010, không phục hồi SESSION_HANDOFF đã bị xóa.

## Checkpoint hiện hành — 05/10/2026: T11 backend và T12 nghiệm thu nội bộ

**T11 backend hoàn thành; T12 chưa đủ điều kiện phát hành toàn sản phẩm.** User yêu cầu tiếp T11/T12 theo task.md; tiếp tục backend và ghi UI vào file bàn giao, không sửa frontend implementation/test hiện có. Contract `backend/docs/SECONDARY_MODULES.md`; ma trận P01–P36/F01–F24 và bằng chứng `docs/T12-acceptance.md`; checklist FE-T11/T12 đã append vào `docs/task-frontend.md`. Các checkpoint phía dưới là lịch sử.

### Thay đổi

- Catalog có public GET list/detail partners/products và ADMIN GET/POST/PUT; revision/CAS/SERIALIZABLE/audit, pagination/search, HTTPS URL. Công khai sản phẩm cần phí/điều kiện/disclosure không rỗng và parent hiển thị. Ẩn parent ẩn sản phẩm khỏi public; contactEmail chỉ admin đối tác. Không có mua/giao dịch, không chuyển expectedReturn mô tả thành giả định engine; không DELETE lịch sử.
- GET/PUT `/me/notification-settings` lưu theo user từ session, revision0 trước lần lưu, defaultfalse, chống ghi đè/ghi đồng thời. Ba field emailDigest/goalAlerts/partnerUpdates là lựa chọn bền vững; **deliveryAvailable cả ba false**, chưa triển khai sender/campaign mới. Thông báo bảo mật/Support vẫn bắt buộc. Không queue email khi lưu, không suy consent từ localStorage.
- `/me/consultations` và `/admin/consultations` cả đường dẫn con trả410 FEATURE_RETIRED sau auth/role; bỏ service đọc/tạo/sửa và socket producer riêng, join socket tiếp tục từ chối. Giữ nguyên bảng/3 bản ghi lịch sử và Support.
- Content duplicate slug trả409 SLUG_CONFLICT. Support status query dùng enum đúng thay arbitrary string. Operations audit targetType nhận tên module mới có giới hạn độ dài; không lộ details. Mail delivery metadata nhắc COMPLETED không chứng minh delivered.
- OpenAPI và generator secondary mới; report/CSV tiếp tục T08 pin version/snapshot, không công thức mới. Không chọn/call provider AI. Không sửa/seed cấu hình production để làm test xanh.

### Migration và kiểm chứng thực tế

1. **202610050009_secondary_modules đã áp dụng** sau checksum/preflight và DDL rollback. Thêm notification_preferences, partners revision/isVisible, products revision/isVisible/updatedAt/annualFee/conditions/disclosure. Giữ nội dung6partners/11products, mặc địnhẩn pending rà disclosure; không bịa phí/điều kiện. Không sửa/áp lại0005–0009.
2. `npm test`: **246/246,21files PASS** gồm5 T11; nhóm T11+contract10/10PASS. Root frontend/backend typecheck và backend testtypecheck PASS.
3. `verify-secondary-db.cjs`: **26/26 HTTP/AuthService/DB checks PASS**, tất cả35bảng fingerprint giữ nguyên sau outer rollback; savepoint giữ rollback boundary từng command. Kiểm catalogdisclosure/visibility/revision/owner/contract, settingsreload/conflict, contentdraft/duplicate/bookmark, Supportreply/closed/notificationsowner, tư vấn410giữhistory, Operations/audit, suspend/restore cũtoken401. Lần đầu fixture viết hoa T11-email không khớp auth normalize; sửa fixturelowercase và chạy lại đạt, không sửa auth để lách kiểm.
4. `verify-secondary-concurrency-db.cjs`: **2ca transaction độc lập PASS**: tạo preference cùng revision0 chỉ một thắng; sửa đối tác cùng revision chỉ một thắng. User SUSPENDED riêng, không email; dọn chính xác IDs và kiểm sạch. Không global delete hoặc kill server.
5. `verify-acceptance-flow-db.cjs`: **18/18 HTTP/DB toàn luồng PASS**: onboarding+goal v2→review/approve/publish A/R→preview→save/idempotent retry→apply→publish bộ mới không tự đổi current→save/apply version2→actual/reforecast→correct history blocker→export bản cũ→owner/ADMIN→trigger immutable→logout-all. Oracle zero-rate Aug–Dec100/tháng→A500,K300; actual anchorSep100+còn3đóng100→A400. History/snapshot/35bảng rollback sạch. Đây là HTTP/DB, **chưa browser nốiDB**.
6. Frontend `test:assets`: **25/25PASS**; frontend build +5marketingprerender PASS. Đo JS chính750.67kB/gzip244.17kB,three.module746.95kB/gzip191.81kB,CSS381.73kB/gzip64.68kB,loadingimage1.67MB; chỉ ghi số đo/handoff, không tự tối ưu UI.
7. `verify-browser.cjs`: **7/8PASS,1FAIL**, lệnh thoát50.6s khôngteardowntimeout.6authAPIca và1accountedit/reload/conflict đạt; đổi mật khẩu test tìm nhãn cũ có dấu ngoặc trong khi UIname không ngoặc. Artifact/trace/JSON ở `backend/.cache/t12-browser-*`; FE-T12-01 chỉ rõ sửa selector và giữ assertions. API mocked, không evidenceprovider/DB thật. Runner backend staticservercổngđộng sở hữu đúngprocess,503mọiAPIchưa mock; không sử dụng `frontend/tests/setup-preview.ts` vì file đó freePort/taskkill tiến trình bất kỳ ở8444. Đã note AIfrontend sửa lifecycle, không chỉnh file đó trong phiên này.
8. **Build backend mặc định chưaPASS**: `prisma generate` bị WindowsEPERM rename query_engine-windows.dll.node đang được tiến trình khác giữ, kể cả sau khi DBfixtures kết thúc. Không kill hoặc lách bằng no-engine client. `verify-build-isolated.cjs` sinh client mới vào `.cache/t12-prisma-build` **PASS**, TypeScript emit **PASS**; startupguard thiếusecret **PASS**. F23 mở cho vận hành restartserver đúngquytrình/rerun npm build; không ghi test thay thế thành build mặc định đã đạt.
9. Audit chỉ đọc **09:31 ngày05/10 VN**: **34bảngnghiệpvụ+_prisma_migrations=35**,9/9checksums,khôngpending/thiếucộtbảng,diffrỗng,vector0.8.2.51users/50profilesv2/2configpublished/6partners/11products/3consultations giữ. Preferences/plans/versions/actuals/AIprivacy/chat/idempotency0saufixture. Có18refresh/2outbox/14audit hiện có từ hoạt động khác so với checkpoint cũ: bảo toàn, không dọn theo count.5knowledgePENDING/chưaduyệt/18chunks0embedding.

### Còn mở và bước tiếp chính xác

- AIfrontend thực hiện FE-T11/T12: APIcatalog/settings; Account/UserAccountModal bỏCSVtínhcục bộ; xử lý410; sửa passwordselector và previewlifecycle; kiểm toàn bộ màn hình390/768/1024/1440/accessibility/nội dung/loader, không tự đóng nghiệm thu từ testbackend.
- Rerun safe browser8/8 sau UI sửa, sau đó browser tài chính nốibackend/DB dùng fixturequảnlý; HTTPflow18/18 không thay browserflow. Build mặc định rerun khi server không còn khóaDLL; clientruntime cũ cần restart để dùng schema mới.
- T12release chưa đóng: migrationDBsạch, fullbrowser/offline/multitab, Q13/Q15 kết quả đã giải thích/ghi nhận, stagingGoogle/Cloudinary/AI/Azure/emailaccepted-vs-delivered/backuprestore và P36legal/retention. User chưa chọn AIprovider; không hỏi lại hoặc tự gọi dịch vụ. Nghĩa vụ LIMITED/cótrần và bộ tínhBHXH đầy đủ vẫn nằm giới hạn đã công bố.
- Ma trận `docs/T12-acceptance.md` phân biệt CLOSEDbackend/PARTIAL/OPEN/DEFERRED; không đánh dấu toàn bộF01–F22/P01–P36đạt. Không tái tạo SESSION_HANDOFF cũ đã được xóa bởi workspace; AGENTS/PROGRESS/PLAN/info/task là bàn giao hiện hành.

## Checkpoint hiện hành — 05/10/2026: T10 backend chuẩn bị AI, quyền dữ liệu và tri thức

**Phạm vi user đã chọn:** “Chưa chọn; chuẩn bị backend trước” khi được hỏi nhà cung cấp AI. Đã hoàn thành phần backend độc lập nhà cung cấp; composition production không có provider, không gửi dữ liệu ra AI ngoài. Không sửa frontend; FE-T10-01–04 và nghiệm thu đã ghi `docs/task-frontend.md`. **Chưa đóng T10 toàn sản phẩm/provider/pháp lý.**

### Thay đổi

- Module `ai`: GET/PUT privacy, POST explain/simulate, CRUD/export hội thoại, sửa câu hỏi. USER ownership/session/no-store; ADMIN chỉ quản trị knowledge, không đọc hội thoại USER. Consent processing/history tách biệt, default false, policyVersion có revision. Explain lấy snapshot T07 qua kiểm integrity; optional throughMonth lấy T09 trong cùng transaction, chỉ giữ anchor/revisions/issues, không đưa bút toán/ghi chú vào context.
- Facts gồm quỹ/vốn cần/chênh/mức góp/coverage/tháng thiếu được backend dựng từ số engine. Context giữ version/model/hash/nguồn/cảnh báo, không tự lấy hồ sơ mới thay bản cũ; thiếu version hoặc actual BLOCKED không lấp số. Nhãn mô phỏng, cảnh báo và giới hạn không bị provider loại bỏ; đã sửa câu chữ mốc vốn sau hưu thành đầu phần dự báo còn lại.
- `ExplanationProvider` chỉ nhận câu hỏi đã lọc email/số dài, facts và tối đa 4 đoạn tri thức với ID tạm; không DB/service/tool/planId/userId/fullprofile/history. Chỉ chấp nhận factKeys/citationIds từ tập đã đưa, backend dựng answer; output tự bịa số/citation hoặc lệnh khác bị fallback. Timeout 8s/AbortSignal. Khi chưa cấu hình trả PROVIDER_NOT_CONFIGURED kèm facts cơ bản, lỗi provider trả PROVIDER_UNAVAILABLE; không làm mất kết quả engine. Đây là nền lựa chọn giải thích có kiểm soát, chưa chatbot tự do/provider thật. Regex không được tuyên bố là ẩn danh toàn bộ PII tự nhập.
- Simulate nhận input cá nhân có cấu trúc do user xác nhận, chuyển vào T08/T06, không gọi provider hoặc tự apply. Thay đổi lưu/apply vẫn qua T07 riêng. Không nhận tỷ suất/CPI/tỷ trọng/input tài chính qua lời nói tự do làm lệnh.
- History fixed expiry 30 ngày từ lúc tạo (chính sách triển khai, không suy là luật), max100messages; samekey/body retry trả response đã lưu, revision chống ghi đè. Không history thì không ghi question/answer/context hoặc IdempotencyRecord chung. Sửa question xóa answer/context cũ, đổi key của câu hỏi về null; xóa/thu hồi history xóa cả messages/context và vô hiệu hóa response đang chờ bằng privacy revision. Audit chỉ metadata, không nội dung chat. API chặn đọc hết hạn; worker purge tối đa100 mỗi phút, lỗi purge không chặn outbox. Có script purge thủ công, chưa chạy global purge production.
- Knowledge ADMIN: tạo/sửa source strict/revision/audit; sửa bỏ duyệt/hash. Index LEXICAL_V1 local text 50k/chunk1500, INDEXED chưa approved; approval riêng với note/confirm. Chỉ retrieve approved+effective+chưa hết hạn+hash/index/content khớp; kiểm citation lại sau provider. Không fetch URL/OCR/vector/provider, không tự duyệt 5 nguồn production. Giới hạn lexical100 nguồn gần nhất/4000chunks/4kết quả, nêu rõ trong contract.
- OpenAPI/generator mới `ai.openapi.yaml`/`generate-ai-openapi.cjs`; shared generator bổ sung nullable/datetime. Contract `AI_GOVERNANCE.md`, API router/services và memory double mở rộng; ActualsService.forecast nhận optional transaction để giữ context đọc nhất quán. Không đổi công thức T06/model hoặc snapshot cũ.

### Migration và kiểm chứng

1. **Migration `202610050008_ai_governance` đã áp dụng lên DB thật**: ai_privacy; source revision/validUntil/indexedHash; conversation revision/expiresAt; message requestKey/context và unique conversation/key/role. Kiểm checksum + đúng một pending + DDL preview rollback, rồi apply; fingerprint giữ dữ liệu hồ sơ/kế hoạch/config/nguồn/chunks/nội dung chat. DB có 0 hội thoại lúc áp; legacy expiry rule createdAt+30days không cấp consent ngầm. Không sửa/áp lại file migration đã chạy.
2. Full cuối `npm test`: **241/241 tests, 20 files PASS**, gồm **15 T10**. Bao phủ consent/default/rollback, version pin/context loại ID, nguồn pending/future/expired/edited/tampered, prompt override/provider invalid IDs/timeout, actual blocker, bắt buộc giữ warning/hypothetical, retry/history/edit/export/delete/expiry, revoke/delete đang chờ, simulate không apply và HTTP/role/OpenAPI. Vòng trước là240 tests; cuối thêm ca warning/hypothetical đạt241. Các lỗi generator nullable và required=[] của empty body đã sửa, contract chạy lại đạt.
3. Root `npm run typecheck` **PASS frontend/backend**; `npm run typecheck:tests` cuối **PASS**, full `npm run build` **PASS** (Prisma generate+tsc), `npm run test:startup` **PASS**. Không kill tiến trình Prisma/UI khác.
4. `verify-ai-db.cjs` **21 kiểm tra HTTP/AuthService/PostgreSQL thật PASS**, chạy lại sau thay batch retrieve/delete và cảnh báo. Outer transaction+savepoints rollback; fingerprint gồm users/profile/plans/versions/config/model/knowledge/chunks/AI/privacy/audit/outbox/refresh/idempotency giữ nguyên. Kiểm fallback số golden, source citations qua stub, privacy/history/owner/role/sửa/xóa/revoke/expiry, actual BLOCKED/simulate150 thay300, macro injection và snapshot giữ nguyên. 50 hồ sơ,5 nguồn giữ nguyên, không external AI/email. Stub chỉ để chứng minh boundary, không bằng chứng nhà cung cấp ngoài.
5. `verify-ai-concurrency-db.cjs` **3 ca transaction độc lập PASS**: cùng key/body chỉ một cặp message; hai body cùng revision chỉ một thắng; revoke trong lúc chờ provider ngăn ghi và xóa history/context. Tài khoản SUSPENDED riêng, cleanup đúng ID cả audit/privacy/thread/message, manifest xóa sau kiểm. Lần gọi đầu từng bị automatic approval review không thực hiện do hết hạn mức xét duyệt (không phải kết luận unsafe); sau user yêu cầu tiếp tục đã chạy qua xét duyệt bình thường và PASS. Không bypass hoặc fixture sót từ lần bị từ chối.
6. Audit chỉ đọc **01:39 ngày 05/10/2026 giờ Việt Nam**: **33 bảng nghiệp vụ + _prisma_migrations**, không thiếu bảng/cột, **8/8 checksum khớp, không pending, schema diff rỗng**, vector0.8.2. Giữ51users/50profilesv2/2configs PUBLISHED, 5knowledge PENDING unapproved/18chunks0embedding. AI/privacy/actual/plans/versions/model/idempotency đều0 sau fixture. 4 refresh/2 outbox có sẵn giữ nguyên, không xóa dựa vào count.

### Phần còn lại và bước tiếp

**Backend T10 chuẩn bị xong theo lựa chọn chưa chọn provider.** AI thật, UI/browser, độ phù hợp tìm kiếm tri thức, worker retention ở môi trường triển khai/backup, quy trình quyền dữ liệu toàn tài khoản và rà pháp lý P36/S08 trước phát hành còn riêng. Chỉ xác nhận nguồn chính thức Luật91/2025/QH15 và Nghị định356/2025/NĐ-CP/trang thuộc tính hiệu lực01/01/2026; chưa hoàn tất đối chiếu từng điều khoản, không tuyên bố tuân thủ. Contract ghi link và phần cần người phụ trách rà, không tự duyệt nguồn hoặc consent cho user. Provider được chọn sau này cần adapter/notice/policyVersion mới/kiểm outbound và hiệu quả model; không dùng consent hiện tại cho mục đích mở rộng âm thầm.

**Bước backend tiếp: T11** — rà modules hiện có/admin/content/bookmark/support/notification/operations, nối partners/products/notification-settings theo phạm vi task, dừng route/producer tư vấn chuyên viên nhưng giữ lịch sử và Support, đồng bộ tài liệu. Đọc mã hiện có và quyền trước thay; không thực hiện frontend, tiếp tục ghi FE-T11. Q13/Q15/T12 vẫn mở. Không áp lại migration 0005–0008.

## Checkpoint hiện hành — 05/10/2026: backend T09, sổ thực tế/đối soát/dự báo còn lại

**Chỉ đạo:** tiếp tục backend, dùng DB thật, ghi UI cho AI frontend. Hoàn thành API sổ thực tế có sửa đổi/lịch sử/idempotency, đối soát và reforecast theo version; frontend không sửa. Q15 tự nộp tiền dư vẫn chưa bật.

### Thay đổi

- `modules/actuals`: USER GET list theo khoảng tháng, GET tháng/history, PUT toàn bộ tháng với expectedRevision + Idempotency-Key; POST reforecast từ planId/versionId/throughMonth. Tiền chuỗi, 10 loại bút toán, Decimal 48, revision CAS/audit/idempotency cùng SERIALIZABLE transaction. Trùng event UUID trong hoặc giữa tháng bị chặn, giữ chỗ ID sau khi loại bút toán khỏi bản mới. History bất biến, lưu chưa khớp được nhưng không đưa vào forecast.
- Một sổ quỹ hưu trí hợp nhất VND/user dùng giữa các phương án. Tách householdSurplus ba trạng thái với actualContribution; chuyển nội bộ không làm tăng vốn; lãi tái đầu tư chỉ ghi thu đầu tư. Đối soát đầu+nộp−rút+thu đầu tư+biến động giá−phí+điều chỉnh; điều chỉnh phải có note, không tự cân chênh. Không suy hai UUID khác nhau là cùng giao dịch ngân hàng; chưa có import/giao dịch ngân hàng.
- Reforecast đọc version qua integrity T07 và actual trong cùng transaction; chặn thiếu tháng/không khớp/đầu kỳ sau lệch/cuối kỳ chưa đóng theo lịch Việt Nam. Đầu tháng tiếp theo dùng actual cuối đã đối soát; giữ lịch tương lai/rates trong version, không lặp khoản bất thường thực tế, không tự nộp surplus. HORIZON_COMPLETE riêng, summary sau hưu là phần còn lại, originalRetirementMonth giữ mục tiêu gốc. Không viết profile/current/baseline/snapshot hoặc tự tạo job.
- Thêm `PlansService.readVersion(tx,...)` để đọc đúng ownership/integrity cùng transaction, không bật calculate legacy. `createServices`/router/OpenAPI đăng ký; contract `MONTHLY_ACTUALS.md`, generator `generate-actuals-openapi.cjs`. FE-T09-01–03 + nghiệm thu đã thêm vào `docs/task-frontend.md`.

### DB và bằng chứng đã chạy

1. Migration **202610050007_monthly_actuals đã áp dụng**: ba bảng actual_months/actual_month_revisions/actual_event_identities, unique tháng/event và trigger chặn UPDATE history. Kiểm checksum lịch sử + đúng một pending + DDL rollback trước apply; fingerprint hồ sơ/kế hoạch/phiên bản/tracking/config hiện có giữ nguyên. Không backfill legacy hoặc seed actual production.
2. Full `npm test`: **226/226 tests, 19 files PASS**, trong đó **11 T09** (ba trạng thái/precision/âm/nội bộ/interest, revision/idempotency/reserved IDs/rollback, thiếu tháng/sửa quá khứ, one-off/reforecast/baseline, đã hưu/hết horizon/tháng hiện tại/quyền và HTTP/OpenAPI). Sau bổ sung kiểm apply version mới giữ nguyên actual/history, nhóm T09 **11/11 PASS**. Một vòng contract ban đầu nhầm core output với enriched T06 Calculation có netWorth; đã sửa schema reforecast dùng đúng core, chạy lại contract đạt.
3. Root `npm run typecheck` **PASS frontend/backend**, `npm run typecheck:tests` **PASS**, `npm run build` đầy đủ Prisma+tsc **PASS**, `npm run test:startup` **PASS**. Git diff check scoped **PASS**, chỉ cảnh báo LF/CRLF.
4. `verify-actuals-db.cjs` **16 kiểm tra HTTP/AuthService/PostgreSQL thật PASS**, outer rollback xác nhận fingerprint toàn bộ profile/plan/version/config/model/actual/identity/history/idempotency/audit/outbox/refresh giữ nguyên, 50 hồ sơ. Có verify trigger bất biến bằng savepoint, quyền ADMIN/owner, retry/stale/trùng event, reforecast golden và sửa quá khứ. Vòng đầu fixture proxy không rollback riêng request lỗi tạo tháng trước khi phát hiện event trùng; đã sửa harness dùng SAVEPOINT cho từng command trong outer transaction rồi chạy lại đạt. Không phải sửa công thức hoặc bỏ kiểm lỗi; không fixture/email tồn dư.
5. `verify-actuals-concurrency-db.cjs` **3 ca transaction độc lập PASS**: cùng key đúng body trả cùng kết quả/chỉ một audit; khác request cùng revision chỉ một thắng; cùng event ở hai tháng chỉ một tháng được ghi. User mẫu SUSPENDED riêng, không cấu hình/email; cleanup chính xác ID cả audit/idempotency/history/event. Lần đầu setup thiếu passwordHash bắt buộc, chưa ghi user; cleanup kiểm sạch. Sửa fixture rồi chạy ba ca đạt, không đụng dữ liệu người dùng.
6. Audit chỉ đọc lúc **01:09 ngày 05/10/2026 giờ Việt Nam**: **32 bảng nghiệp vụ + migration**, không thiếu bảng/cột, **7/7 migration checksum khớp, không pending, schema diff rỗng**, vector 0.8.2. 50 hồ sơ v2, 2 cấu hình PUBLISHED/effective giữ nguyên; actual/history/event/model/plan/version/idempotency đều 0 sau kiểm thử. Có **4 refresh_tokens, 2 outbox_events** từ hoạt động khác so với checkpoint cũ, giữ nguyên, không coi số khác 0 là fixture để xóa. Knowledge vẫn 5 PENDING/chưa duyệt, 18 chunks/0 embedding.

### Giới hạn và bước tiếp chính xác

**T09 backend đã hoàn thành phạm vi ghi thực tế/đối soát/reforecast, chưa nghiệm thu UI toàn sản phẩm và chưa đóng Q15.** Một quỹ hợp nhất/user, chưa nhiều sổ tài khoản. Lịch tương lai giữ theo version; tất toán sớm/bán tài sản trước lịch hoặc nguồn thu mới cần cập nhật hồ sơ/phương án, không suy diễn từ nộp/rút. Reforecast chỉ đọc, chưa lưu thành PlanVersion; lịch sử actual độc lập phiên bản, không tự đổi baseline. Source version có whatIf vẫn là phương án giả định, UI dùng metadata T08 để trình bày đúng. Không dùng số thực tế lấp hồ sơ thiếu.

**Bước backend tiếp: T10** — AI giải thích và quản trị dữ liệu theo task.md, kiểm context tối thiểu/version/nguồn/cảnh báo, workflow tạo mô phỏng so với xác nhận apply, guard nội dung/role và knowledge đã duyệt. Đọc các module AI/knowledge đã có trước khi đổi, không tự duyệt 5 nguồn PENDING hoặc tạo nguồn mẫu production. Ghi UI phát sinh vào task-frontend.md. Không áp lại migration 0005/0006/0007.

## Checkpoint hiện hành — 04/10/2026: backend T08, báo cáo/so sánh/mô phỏng/CSV

**Chỉ đạo:** tiếp tục backend và ghi UI cho AI frontend. Đã bổ sung các API để dashboard/goal/plan/simulation/export dùng cùng phiên bản. Không sửa mã frontend hoặc tuyên bố nghiệm thu UI T08. Không migration/seed; giữ schema 0006 đã áp dụng.

### Thay đổi

- `GET /me/retirement/plans/:id/report?versionId`: snapshot cụ thể hoặc current trong cùng transaction, goal từ selection/tháng hưu đã tính, profileChanged/hypothetical và FORECAST. Chưa có current trả NO_APPLIED_VERSION/null, không lấy bản lưu mới nhất hoặc số mẫu.
- `POST /:id/compare`: so hai version cùng plan/ownership, Decimal candidate−baseline tại ngày định giá; delta null nếu khác ngày/tiền tệ/endMonth hoặc thiếu kết quả. Giữ null K=0, nêu nguồn/selectionFields khác nhau và hạn chế so nhiều biến/hệ số chiết khấu khác nhau.
- `POST /:id/versions/:versionId/simulate`: baseline snapshot và candidate từ hồ sơ hiện tại/revision/T03/T04 chỉ định; không ghi current/plan/profile/audit/outbox. Candidate có thể lưu/apply bằng T07, không tự áp dụng trong simulate.
- T06/T07 request thêm optional `whatIf.retirementMonth` và `whatIf.assetValues[{assetId,value}]`. Chỉ thay bản sao hồ sơ; giữ sở hữu/phần hưu trí/thanh khoản/ngày định giá/lịch thu/hưu/nợ. Không nhận macro/vốn quỹ trực tiếp, không tự đổi tiền bán/thuê nhà. Có warning HYPOTHETICAL_VALUES_PROFILE_UNCHANGED; apply chỉ chọn kế hoạch, không đổi hồ sơ gốc. Core/model recurrence không đổi; request/snapshot cũ vẫn tái lập.
- `GET /:id/versions/:versionId/export.csv`: UTF-8 BOM/CRLF, số tháng nguyên precision chưa làm tròn, giữ âm, metadata/version/hash/nguồn trên mỗi dòng. Không dùng calculator client hoặc current mới để xuất bản cũ. CSV thành công không JSON envelope, lỗi vẫn ErrorEnvelope. CORS expose Content-Disposition; auth/no-store giữ nguyên.
- Contract [PLAN_PRESENTATION.md](docs/PLAN_PRESENTATION.md), generator/OpenAPI T06/T07 mở rộng và contract tests. Dùng chung fixture T07 qua `plans-fixtures.ts`. Thêm **FE-T08-01–04** và nghiệm thu cho AI frontend. Rà UI thấy wrappers retirement/plans bóc data hai lần; simRetireMonth chưa gửi; tự lấy choice đầu/policy mới nhất; fallback tiền/revision mẫu; goal calculator cũ; save→apply dùng state cũ/bỏ qua false; pending retry chỉ giữ key chưa giữ body. Đã ghi file/cách xử lý, không chỉnh frontend.

### Bằng chứng đã chạy

1. Full `npm test` **215/215 tests, 18 files PASS**, gồm **10 ca T08**: whatIf/không đổi sourceprofile, ownership/validation, report trống/pin, simulation→save→apply→report/replay, null/khác ngày/horizon, source/CSV precision, HTTP contract/read-only. Ca CSV ban đầu dùng input 5 số lẻ trái moneySchema (tối đa 2); đã sửa input, kiểm precision dài sinh từ tính lãi/CPI. Sau thêm expose header, nhóm T08 + OpenAPI **15/15 PASS**.
2. Root `npm run typecheck` **PASS frontend/backend**; `npm run typecheck:tests` cuối **PASS**. `npm run build` đầy đủ **PASS** sau tiến trình DB verify kết thúc; lần đầu chạy khi Prisma DLL đang được tiến trình verify giữ bị EPERM, không kill tiến trình. `npm run test:startup` **PASS**.
3. `verify-plan-presentation-db.cjs` **31 kiểm tra HTTP/AuthService/PostgreSQL thật PASS**. Kế thừa T07 trigger/replay/revision/idempotency/baseline/worker; thêm report current và version cụ thể, CSV đối chiếu mọi field tháng, simulate readonly/INCOMPLETE, candidate save/apply/reload cùng kết quả, source profile giữ nguyên, compare tương đương preview, export bản cũ giữ nguyên, role/owner/macro injection. Outer transaction **rollback hoàn toàn**; fingerprint 50 hồ sơ, plans/snapshots/model/config trước/sau giữ nguyên, 2 cấu hình có sẵn; không email/fixture tồn dư.
4. Không đổi schema/migration T08; không chạy lại 0005/0006. DB không cần thêm bảng/cột cho API mới. Không bơm fixture production khi thiếu dữ liệu. File `docs/SESSION_HANDOFF_2026_10_03.md` không còn trong workspace tại lúc chốt (không do lượt này xóa); giữ thay đổi đồng thời đó, cập nhật bàn giao tại AGENTS/PROGRESS/IMPLEMENTATION_PLAN và docs/info/task hiện có.

### Giới hạn và bước tiếp chính xác

**T08 backend report/compare/simulate/export đã đạt; T08 toàn sản phẩm còn UI, tải CSV trong browser và nghiệm thu xuyên dashboard→goal→plan→simulation→apply→reload.** AI frontend xử lý FE-T08 cùng T06/T07; cần đối chiếu lỗi đã ghi thay vì suy nghiệm thu từ backend test. API mới vẫn USER; quản trị T03/T04 có endpoint riêng. FinancialService legacy calculate không đăng ký vì tự đổi current; mục tiêu tuổi-năm cũ không trở lại làm nguồn quỹ.

**Bước backend tiếp: T09** — sổ thực tế tháng, nộp/rút/thu/chi/nợ/phí/biến động giá, đối soát/revision/idempotency; lấy số dư thực tế đã đối soát làm đầu dự báo còn lại, giữ baseline/snapshot. Không coi report FORECAST là actual hoặc tự nộp surplus Q15. Tiếp tục DB thật theo fixture rollback/scoped cleanup và ghi UI vào task-frontend.md. T10 AI/T11–T12 còn mở.

## Checkpoint hiện hành — 04/10/2026: backend T07, snapshot và áp dụng phiên bản

**Chỉ đạo:** tiếp tục backend, DB thật, ghi UI cho AI frontend. Đã hoàn thành đợt T07: snapshot bất biến, lưu và áp dụng tách biệt, giữ bản gốc/lịch sử, worker chỉ báo cần rà soát. Không sửa frontend hoặc tự chọn kế hoạch cho dữ liệu production.

### Thay đổi

- `modules/plans`: API USER danh sách/chi tiết/history/version/replay, create plan + version, create version tiếp và apply. Chỉ nhận request T06 + expectedInputHash/revision để backend tính lại; không nhận snapshot/result từ client. Ownership, revision hồ sơ/kế hoạch, confirm và Idempotency-Key UUID bắt buộc cho lệnh ghi.
- Lưu snapshot `retirement-plan-snapshot-v1` gồm profile, full T03/T04/approval/nguồn/hash, lựa chọn, model, ngày định giá, quy ước, chuỗi tháng/kết quả/replay. SHA-256 chuẩn hóa thứ tự khóa để JSONB không phá hash; đọc kiểm snapshot/result/chart khớp. Replay core từ dữ liệu đã lưu, không lấy cấu hình hiện hành.
- Create chỉ lưu, không đổi current/baseline. Apply mới thay current, giữ baseline đầu tiên, audit và response chống lặp cùng SERIALIZABLE transaction. Profile đổi yêu cầu tạo bản mới; publish mới không bắt buộc đổi bản đã chọn. Revision tăng khi save/apply thực sự, không tăng khi thông báo stale. Cùng key retry trả response lịch sử; UI cần tải lại trạng thái hiện hành.
- Model registry tạo bản `retirement-monthly-v2` IMPLEMENTED khi lưu lần đầu, không tự duyệt tham số nghiệp vụ. goalRevision legacy = 0 vì mục tiêu tháng/lựa chọn T06 nằm trong snapshot; không đọc goal tuổi-năm v1. Kế hoạch có thể nhiều bản/plan; current riêng theo planId, chưa có primaryPlan toàn tài khoản.
- `jobs/handlers.ts` nối event legacy qua `plans/events.ts`; `FinancialService.handleEvent` cũng chuyển sang handler này. Job chỉ đánh stale; không gọi calculator/sinh version/chọn current. Batch 20, marker và continuation cùng transaction, retry không nhân bản, event riêng kiểm current còn khớp. T03/T04 publish không tạo job áp dụng; detail trả cờ có phiên bản mới khi đã có hiệu lực.
- Contract/generator [PLANS.md](docs/PLANS.md), `plans.openapi.yaml`, main OpenAPI. Đã thêm **FE-T07-01–04** và nghiệm thu cho AI frontend trong `docs/task-frontend.md`, giữ các cập nhật UI trước đó.

### Migration và bằng chứng

1. **Đã áp dụng `202610040006_plan_snapshots` lên DB thật** sau kiểm lịch sử/checksum và preview DDL rollback. Thêm revision/baselineVersionId + FK/unique và trigger chặn UPDATE PlanVersion; không thêm bảng, không chọn current/baseline hoặc sửa nội dung snapshot cũ. Fingerprint 50 hồ sơ/plans/versions không đổi. Script deploy lần đầu lỗi ở dòng in báo cáo sau khi áp dụng/kiểm dữ liệu thành công (truy cập shape cũ của fingerprint); đã sửa reporter, kiểm tra chỉ đọc xác nhận migration/checksum/cột/trigger, không áp lại. `apply-plan-snapshots.cjs` nay đã áp dụng thì chỉ kiểm tra.
2. `npm test`: **205/205 tests, 17 files PASS**, 12 ca T07 gồm lifecycle/idempotency, pin version/replay, baseline/switch back, conflict/profile đổi, quyền/cross-plan, integrity JSONB, rollback audit, worker retry/batch, HTTP và cả 7 loại response OpenAPI. Một vòng đầu contract phát hiện test double có updatedAt thừa; API đã đổi sang DTO rõ trường thay spread raw row. Bổ sung fixture type assertion rồi `typecheck:tests` cuối **PASS**.
3. Root `npm run typecheck` **PASS frontend/backend**; `npm run build` đầy đủ **PASS** với Prisma generate + tsc; `npm run test:startup` **PASS**, thiếu secrets bị chặn trước DB. Không dừng tiến trình khác.
4. `verify-plans-db.cjs`: **23 kiểm tra HTTP/AuthService/PostgreSQL thật PASS**, cả lưu JSONB/đọc/replay, trigger UPDATE bị chặn, create/apply lặp, revision/quyền, current/baseline, version cũ, profile đổi và worker. Fixture/model/plan/config/session/outbox trong outer transaction **rollback hoàn toàn**, giữ 50 hồ sơ và 2 cấu hình hiện có, không email.
5. `verify-plan-concurrency-db.cjs`: **3 ca kết nối độc lập PASS**: hai apply khác cùng revision chỉ một thắng; hai request cùng key trả cùng kết quả/không áp dụng lần hai; sửa profile cạnh tranh apply không mất dữ liệu mới. Fixture tài khoản riêng SUSPENDED không đăng nhập, policy/T03 mẫu chuyển DRAFT trước commit nên không hiển thị như cấu hình công bố. Dọn đúng ID. Rà soát sau vòng đầu phát hiện IdempotencyRecord không có FK cascade nên còn 5 response fixture; đã nhận diện bằng owner/time/payload mẫu và dọn đúng 5 bản, bổ sung cleanup + fingerprint bảng này + manifest ID; chạy lại 3 ca để kiểm cleanup đầy đủ. Không xóa bản ghi của người dùng.
6. Audit chỉ đọc cuối lúc **20:22 giờ Việt Nam**: đủ 29 bảng + migration, **6/6 migration checksum khớp, diff rỗng, không pending**, vector 0.8.2. Các cấu hình T03/T04 công bố và 50 hồ sơ v2 có sẵn giữ nguyên; knowledge còn PENDING/chưa embedding. Model/plan/snapshot production vẫn chưa có vì fixture đã dọn; các dòng thật sẽ được sinh qua luồng lưu của người dùng, không seed tay. Xác nhận cuối **idempotency_records/outbox_events/processed_events/refresh_tokens đều 0**, không còn dữ liệu kiểm thử của hai vòng cạnh tranh.

### Phần còn lại và bước tiếp chính xác

**T07 backend đã có luồng lưu/apply và kiểm chứng; UI toàn sản phẩm chưa nghiệm thu. Tiếp T08** — nối dashboard/goal/plan/history/simulation/export vào cùng planId/versionId/API tháng, loại đường calculator/demo hoặc báo unsupported giả thành công; bổ sung endpoint backend thực sự thiếu khi đối chiếu UI. Đọc `PLANS.md` về nhiều plan, revision, mục tiêu T06 so với goal legacy và phiên bản đang áp dụng. Không đăng ký calculate legacy tự thay current. Snapshot legacy khác model trả UNSUPPORTED, chưa có chuyển đổi ngầm. T09 thực tế/T10 AI còn riêng; thay công thức về sau phải tăng model code và giữ bộ replay cũ. Tiếp tục ghi mọi thay đổi UI vào task-frontend.md. **Không áp lại migration 0005 hoặc 0006.**

## Checkpoint hiện hành — 04/10/2026: backend T06, bộ tính hưu trí tháng

**Chỉ đạo:** tiếp tục T06/backend, dùng DB thật; yêu cầu UI ghi riêng cho AI frontend. Đã hoàn thành phần engine, adapter hồ sơ và API preview T06; không sửa frontend, không migration, không tự seed hoặc áp dụng kế hoạch.

### Thay đổi

- `modules/retirement/engine.ts`: core thuần Decimal precision 48, kỳ tháng, góp/rút/giải phóng vốn cuối tháng, L danh nghĩa, giữ số dư âm. Ledger tiền còn có riêng đếm nhu cầu mới chưa tài trợ; báo tháng thiếu đầu tiên, không cộng lặp thiếu cũ. PV vốn cần ràng buộc thanh khoản từng tháng để khoản thu muộn không che thiếu sớm.
- Solver tuyến tính cho mức góp đều tổng và phần tăng đều trên lịch thực góp biến đổi, kiểm tra thiếu sớm trong tích lũy; nghỉ ngay trả null thay chia 0. A/K/G cùng ngày, K=0 tỷ lệ null, >100% không cắt. Rows/summary/replay cùng công thức; đường vốn cần truy hồi từ nghĩa vụ còn lại.
- `prepare.ts`: vốn thanh khoản đủ điều kiện theo T01, không trừ toàn bộ nợ rồi lại trừ lịch T02. Thu/chi đúng lịch, nợ/stress thay phần trả, dự phòng giữ ngoài quỹ, góp không vượt khả năng tháng. Ghép T03/T04 đã duyệt (phí trong hệ số ròng, CPI theo năm) và pension T05 một lần, không auto CPI sau nhận. Nhà bán/thuê cần xác nhận phạm vi số tiền và liên kết dòng thu trùng; tài sản chưa dùng được giải phóng đúng tháng.
- Q13 chỉ nhánh core `START_OF_MONTH_RESEARCH`, public luôn END_OF_MONTH. Q15 không tự nộp surplus; phải khai góp sau hưu. Ngày định giá giữa tháng dùng đủ kỳ tháng, có cảnh báo; dòng khai danh nghĩa khác không tự tăng CPI. Chưa mô hình phí phân bổ vốn ban đầu; limitations trong response/contract.
- `POST /api/v1/me/retirement/preview`: USER/phiên thật, ownership, revision v2, policy và bộ T03 chốt hash trong cùng transaction đọc; không nhận macro/vốn/userId/timing ghi đè. READY/INCOMPLETE/warnings, phiên bản/hash/source/inputHash, marketRows, replayInput. Không ghi plan/snapshot/audit/outbox, không đăng ký worker tài chính legacy.
- Contract/generator `docs/RETIREMENT_MONTHLY.md`, `retirement.openapi.yaml`, main OpenAPI. UI thêm **FE-T06-01–04** và nghiệm thu trong `docs/task-frontend.md`; giữ các cập nhật trước của AI frontend. Chưa xác nhận nghiệm thu UI.

### Bằng chứng đã chạy

1. `npm test`: **193/193 tests, 16 files PASS**, trong đó **26 ca T06**. Golden FV/PV độc lập, 0/âm/biến lãi, L, nghỉ ngay, tiền lớn, thiếu sớm, nguồn đến muộn, góp thay tháng, pension/scenario, nợ/stress, nhà/tài sản muộn, chi phí tái cân bằng thực, replay, HTTP quyền/revision/phiên bản và OpenAPI READY/INCOMPLETE.
2. `npm run typecheck:tests` **PASS**. Root `npm run typecheck` **PASS frontend/backend**.
3. `npm run build` **PASS đầy đủ** (Prisma generate + tsc) ngoài sandbox. Lần sandbox ban đầu bị EPERM lstat thư mục tạm `C:\Users\os`; chạy lại với quyền phù hợp đạt. Lỗi DLL EPERM của checkpoint T05 không còn chặn lần build này; không dừng tiến trình khác. `npm run test:startup` **PASS**: thiếu secrets production bị chặn trước kết nối DB.
4. `node scripts/verify-retirement-db.cjs` **13 kiểm tra HTTP/AuthService/PostgreSQL thật PASS**, outer transaction serializable bắt buộc rollback. Lưu/đọc profile v2, công bố T03/T04 fixture, golden quỹ, replay/read-only, quyền/revision/injection, INCOMPLETE, chốt bản cũ khi có T03 mới, pension UNKNOWN/nợ UNKNOWN. **Rollback PASS**: 50 hồ sơ, toàn bộ plans/snapshots/config hiện có giữ nguyên; cấu hình trước/sau **2**; fixture/session/outbox không tồn tại sau rollback; không gửi email. Không thay kiểm chứng cạnh tranh transaction độc lập hoặc E2E UI.
5. Rà soát DB chỉ đọc lúc **19:51 giờ Việt Nam 04/10/2026** (`audit-database-readonly.cjs`): vẫn đủ 29 bảng + migration, diff rỗng, 5/5 checksum khớp. Trạng thái đã khác lần 09:52: **50/50 hồ sơ hiện v2**, **1 T03 + 1 T04 PUBLISHED/có hiệu lực**, **5 knowledge sources PENDING/chưa duyệt, 18 chunks chưa có embedding**. Đây là dữ liệu có sẵn khi kiểm tra, không do fixture T06 lưu lại. Chỉ kiểm metadata/cấu trúc, không khẳng định chất lượng nghiệp vụ hoặc toàn bộ hồ sơ hợp lệ/đủ input T06. Đã cập nhật ghi chú DB và UI để không dùng trạng thái trống cũ làm hiện trạng.

### Giới hạn và bước tiếp

**T06 backend engine/preview đã đạt đợt này; nghiệm thu toàn sản phẩm còn UI/chart/export gắn snapshot T07–T08.** Preview chưa lưu; không tạo model row hoặc giả áp dụng. Khoản góp/thu/chi/năm dự phóng phải do người dùng/cấu hình đã duyệt cung cấp; không dự báo xác suất, không tự bổ sung tỷ lệ production.

**Bước tiếp chính xác: T07** — snapshot bất biến với model/input/lịch tháng/phiên bản/quy ước, tách preview/create/apply với revision/idempotency; publish không tự đổi currentVersion; sửa semantics worker trước khi nối. Cần giữ khả năng tái lập T06, không pha giả định mới vào kế hoạch cũ. Tiếp tục dùng DB thật với fixture rollback và ghi UI vào task-frontend.md. Không áp lại migration 0005.

## Rà soát DB chỉ đọc — 04/10/2026, 09:52 giờ Việt Nam

Theo yêu cầu kiểm tra phần DB cần bổ sung: chạy `scripts/audit-database-readonly.cjs` trên DB thật với transaction READ ONLY và Prisma migrate diff (không thực thi DDL). Đủ 29 bảng nghiệp vụ + bảng migration; không thiếu bảng/cột, diff cấu trúc rỗng; 5/5 migration đã hoàn tất/checksum khớp, không pending; vector 0.8.2 có sẵn. Thiếu **dữ liệu cấu hình**: assumption_set_versions 0 (cả T03/T04), knowledge_sources/chunks 0; 50/50 hồ sơ vẫn v1. financial_assumptions có 8 bản legacy không thay thế bộ T03 có phiên bản. Model/plan/snapshot trống là phần backend T06–T08 cần sinh đúng luồng, không yêu cầu người dùng seed thủ công. Đã lập checklist [database-bo-sung.md](../docs/database-bo-sung.md). Không sửa DB; bước code tiếp vẫn T06. Đây là kiểm tra cấu trúc/số lượng, không thẩm định dữ liệu người dùng hay nghiệm thu UI.

## Checkpoint hiện hành — 04/10/2026: backend T05, lương hưu nhập tay và tuổi tham chiếu

**Chỉ đạo:** tiếp tục backend; mọi yêu cầu UI phát sinh ghi vào `docs/task-frontend.md` để AI frontend xử lý. Vẫn dùng DB thật theo ủy quyền. Đã hoàn thành đợt backend T05 contract/lưu/preview/tra tuổi; không sửa mã frontend, không migration hoặc deploy.

### Thay đổi

- `modules/pensions/schema.ts`: khai báo UNKNOWN/NOT_APPLICABLE/KNOWN, số tiền chuỗi VND, cơ sở TODAY/NOMINAL_AT_START, tháng cơ sở, nguồn/ngày ước tính, lịch điều chỉnh danh nghĩa. Lưu trong profile v2; dữ liệu cũ không có pension vẫn đọc được và không bị xác nhận 0 ngầm.
- `profiles/schema-v2.ts`: ràng buộc tháng cơ sở/nhận, ngày ước tính, điều chỉnh không trùng và sau tháng nhận; nguồn thu PENSION liên kết một lần qua linkedIncomeId. Summary/cashflow chỉ cộng mức hưu tính được một lần; thiếu mức khai có cảnh báo, thiếu quy đổi cho mức đã khai không thành số 0.
- `pensions/engine.ts`: dòng thu bắt đầu đúng tháng; TODAY quy đổi một lần bằng chuỗi lạm phát T03 đã công bố, Decimal precision 48; giữ mức danh nghĩa sau tháng nhận trừ lịch điều chỉnh được khai. Không dùng CPI lịch sử/tự kéo năm thiếu/tự giảm phát khoản đã nhận. Cache hệ số theo năm và theo đoạn mức nhận trong preview.
- `pensions/legal-age.ts`: tra nhóm tháng sinh Phụ lục I/II NĐ 135/2020, mốc chuyển tiếp Điều 7; phiên bản nguồn/ngày rà rõ ràng. Mục tiêu cá nhân độc lập với tuổi tham chiếu. Điều 5 là mốc thấp nhất dựa trên điều kiện tự khai, chưa xác minh; không kết luận đủ điều kiện hưởng. Ngoài phạm vi/thiếu thông tin trả REVIEW_REQUIRED.
- `POST /api/v1/me/pension/preview`: USER/session thật, ownership từ JWT, expectedProfileRevision, chỉ đọc. Có chuỗi tháng/null/issue, bản/hash T03, tuổi tham chiếu. Không nhận macro/số tiền/userId ghi đè, không ghi current plan/audit/outbox.
- Đã bỏ công thức BHXH demo khỏi calculator legacy backend: estimatedMonthlyPension null, pensionStatus NOT_ESTIMATED; lương đóng và số năm không còn tạo quyền lợi suy đoán. Context AI T10 và engine tháng cá nhân T06 chưa tích hợp.
- Contract `docs/PENSIONS.md`, `docs/pensions.openapi.yaml`, cập nhật profile-v2/main OpenAPI qua generator. `docs/task-frontend.md` đã thêm FE-T05-01–04 và checklist nghiệm thu; giữ phần cập nhật đồng thời từ luồng UI, không xác nhận thay các tuyên bố hoàn thành UI ở đó.

### Bằng chứng đã chạy

1. `npm test`: **167/167 tests, 15 files PASS** trên mã cuối; **21 ca T05**, gồm ranh giới phụ lục, điều kiện thiếu/đặc thù, đổi mục tiêu, lịch nhận/điều chỉnh, null/0, âm CPI, tiền lớn, quy đổi qua năm, không CPI sau nhận, chống trùng, HTTP quyền/revision/lifecycle T03 và OpenAPI. Lần đầu test mới thiếu confirm trong lệnh publish fixture; đã sửa fixture đúng contract và chạy lại đạt.
2. `npm run typecheck:tests`: **PASS** trên mã cuối. `npm run typecheck` từ root: **PASS frontend/backend**; sau chỉnh guard lịch/cache cuối, `npm exec -- tsc` backend và typecheck tests tiếp tục **PASS**. `npm run test:startup`: **PASS**, thiếu secrets production bị chặn trước DB.
3. `node scripts/verify-pensions-db.cjs` với quyền mạng: preflight cột/schema thật; **13 kiểm tra HTTP/AuthService/PostgreSQL PASS**, gồm lưu/đọc, lịch kỳ nhận, tuổi tham chiếu, read-only/replay, USER/ADMIN/ownership/revision, zero/unknown, thiếu bản T03/công bố trong rollback, chặn dữ liệu sai. **Rollback PASS**: 50 hồ sơ và toàn bộ kế hoạch/snapshot/cấu hình hiện có giữ nguyên; số bộ giả định trước/sau 0; không gửi email, không lưu fixture production. Kiểm chứng này không thay kiểm tra cạnh tranh transaction độc lập hoặc E2E UI.
4. **Build đầy đủ chưa đạt:** `npm run build` dừng ở `prisma generate` với EPERM khi rename DLL query engine Windows. Không dừng tiến trình của người dùng/AI khác để thay DLL. Schema Prisma không đổi; đã dùng client hiện có để biên dịch toàn bộ TypeScript backend thành công (`npm exec -- tsc`). Không báo build đầy đủ PASS; cần chạy lại khi tệp Prisma có thể được thay.

### Giới hạn và bước tiếp

- **T05 toàn sản phẩm còn mở:** UI cần FE-T05, kế hoạch cá nhân cần T06–T08; AI chỉ giải thích theo context đã kiểm chứng tại T10. Chưa triển khai tự tính quyền lợi BHXH hoặc xác minh điều kiện lao động/hồ sơ hưởng.
- Không có bộ số liệu T03 production được duyệt; TODAY cần quy đổi thì trả thiếu dữ liệu khi không có phiên bản được chọn. Preview nợ chưa nhận T03 nên khoản TODAY chưa quy đổi không được giả làm thu đã biết.
- **Bước tiếp chính xác: T06** — engine tháng dùng hồ sơ v2, lịch vay T02, giả định T03/danh mục T04 và dòng hưu T05; FV/PV/cuối kỳ, thanh khoản thiếu sớm, solver mức đóng, chuỗi chart, golden tests. Giữ Q13/Q15 rõ nhánh chưa chốt; chưa nối apply/worker T07 trước khi sửa semantics phiên bản. Dùng DB thật/fixture rollback; không áp lại migration 0005. Tiếp tục ghi thay đổi UI vào task-frontend.md.

## Checkpoint trước — 04/10/2026: backend T04, rủi ro/danh mục/kịch bản

**Chỉ đạo:** tiếp tục backend sau T03, vẫn dùng DB thật theo ủy quyền. Đã hoàn thành đợt T04 contract/lifecycle/preview; không tự đặt điểm/ngưỡng/tỷ trọng/kịch bản production và không thêm migration.

### Thay đổi

- `modules/portfolios/schema.ts`: chính sách có version, metadata nguồn/ngày hiệu lực và assumptionVersionId chốt T03. Sáu chiều questionnaire OBJECTIVE/HORIZON/LIQUIDITY/LOSS_TOLERANCE/EXPERIENCE/FINANCIAL_CAPACITY, lựa chọn/điểm và risk bands cấu hình; điều kiện từng chiều/thời hạn/thanh khoản, template, lịch phân bổ và phí tái cân bằng.
- `engine.ts`: kiểm tra đủ chiều, điểm liên tục, ID không trùng, lịch đủ kỳ, tổng tỷ trọng 100% không âm, nhóm/thời hạn có trong T03. Câu trả lời thiếu/sai không thành 0; trả null, không sinh phân bổ. Nhiều danh mục hợp lệ yêu cầu chọn rõ. Response giải thích câu trả lời/điểm/quy tắc khớp hoặc không khớp; tuổi không quyết định danh mục.
- Ba kịch bản BASE/ADVERSE/FAVORABLE từ delta từng năm/nhóm đã duyệt, không tự đặt spread. Lấy lãi danh nghĩa ròng T03, cộng điểm kịch bản và quy đổi tháng bằng Decimal precision 48. Danh mục chuẩn khởi đầu giá trị 1; tỷ trọng trôi theo tăng trưởng giữa kỳ, tái cân bằng đầu tháng theo chu kỳ 1/3/6/12 hoặc khi đổi đoạn lịch. Phí tái cân bằng theo nửa tổng chênh tỷ trọng tuyệt đối × tỷ lệ phí khai rõ. Không tự thêm đòn bẩy hoặc tiền góp/rút.
- `service.ts`/`router.ts`: ADMIN create/edit/validate/approve/publish; USER đọc bản công bố có hiệu lực và preview. Revision/approval/hash chốt đúng bản T03; bản duyệt/công bố không sửa được, chặn version đi lùi. Publish/preview không sửa current plan/stale/snapshot hoặc tạo outbox. Bộ cũ tái lập từ ID/hash, không tự nhảy sang T03 mới.
- Lưu cùng bảng cấu hình version hiện có với discriminator `portfolio-policy-v1`; không migration và không thay các bản T03/legacy. OpenAPI `portfolios.openapi.yaml`, generator `generate-portfolios-openapi.cjs`; dùng lại converter cấu trúc T03 (thêm hỗ trợ union). Hướng dẫn `docs/PORTFOLIOS.md` và tham chiếu chính thức Investor.gov. Không nối giao diện hoặc ghi cấu hình demo vào DB thật.

### Bằng chứng đã chạy

1. `npm test`: **146/146 tests, 14 files PASS**. Có **17 tests T04**: khác chịu lỗ/thanh khoản/khả năng tài chính, thiếu/invalid answers, ngưỡng/câu hỏi trùng, tổng tỷ trọng và lịch sai, horizon, scenario years/direction/rate domain, nhiều danh mục hợp lệ, weighted monthly growth độc lập, drift/tái cân bằng/phí/đổi năm, input bất biến, lifecycle/revision/audit rollback, replay bản cũ, hash/dependency/tương lai/version đi lùi, quyền HTTP ADMIN/USER và macro injection. OpenAPI phản hồi READY/INCOMPLETE/list/version/validation khớp và main specification hợp lệ.
2. `npm run typecheck:tests`: **PASS**. `npm run typecheck` từ root: **PASS frontend/backend**. `npm --prefix backend run build`: **PASS**, Prisma generate + tsc tuần tự sau test, TEMP/TMP workspace. `npm --prefix backend run test:startup`: **PASS**, production thiếu secrets bị từ chối trước kết nối DB.
3. `node scripts/verify-portfolios-db.cjs` với quyền mạng: preflight schema thật, **15 kiểm tra HTTP/PostgreSQL PASS** qua AuthService/session thật. Chuẩn bị T03 fixture đã duyệt; ADMIN lưu/reload/validate/approve/publish 2 chính sách, USER phân quyền/preview, câu trả lời thiếu, khác chịu lỗ/thanh khoản, chặn rate injection, bất biến và replay version cũ. Audit hiện diện, không tạo job/mail.
4. Tất cả tài khoản/phiên/bộ T03/chính sách công bố thử trong transaction rollback. **Rollback PASS**, **50 hồ sơ, kế hoạch chính và snapshot cũ không đổi**, số bản cấu hình trước/sau **0**. Fixture không commit cho tiến trình khác, không có giao dịch. Không coi kiểm tra này là bằng chứng cạnh tranh nhiều transaction độc lập hoặc E2E UI.

### Giới hạn và bước tiếp

- **T04 toàn sản phẩm còn mở**: UI và bộ câu hỏi/ngưỡng/tỷ trọng/tham số production chưa do người phụ trách duyệt. Không giả định policy mặc định khi thiếu; UNCONFIGURED/INCOMPLETE rõ ràng.
- Preview là **unit portfolio**, không có dòng tiền cá nhân, initial allocation cost hoặc giá trị quỹ hưu trí; tuổi/mức sống/tích lũy/tài sản nối T06–T08. Câu trả lời là tự khai, chưa xác minh độc lập bằng hồ sơ. Chưa lưu lựa chọn/câu trả lời thành snapshot hoặc apply current plan. Chưa tính thuế giao dịch riêng ngoài tham số phí/thuế đã khai.
- Dải lợi suất theo horizon cố định của lần preview; lịch phân bổ có thể đổi theo tháng. Phiên bản/căn cứ được giữ cho T06; không tự giảm 1,5 điểm lợi suất lúc nghỉ hưu, không tự gán danh mục theo tuổi.
- **Bước tiếp chính xác: T05** — mức lương hưu nhập tay với cơ sở tiền/ngày nhận/nguồn/trạng thái thiếu, không tăng theo CPI ngầm hoặc trùng thu; loại BHXH demo khỏi luồng chính/AI; đối chiếu văn bản/phụ lục chính thức cho tuổi nghỉ hưu, tách khỏi tuổi mục tiêu. Đọc task.md/S06–S07 và kiểm tra dữ liệu v2 trước sửa. Giữ DB thật/fixture rollback, không áp lại migration 0005. Q13/Q15 không chặn phần độc lập.

## Checkpoint trước — 04/10/2026: backend T03, bộ giả định năm có version

**Chỉ đạo:** tiếp tục backend sau T02, dùng DB thật đã được cho phép. Đợt này hoàn thành contract/lifecycle/chuỗi tháng T03, không nhập bộ số liệu kinh tế production thay người duyệt, không thêm migration hoặc deploy.

### Đã triển khai

- `modules/assumptions/schema.ts`: tài liệu v2 có năm đầu/cuối, ngày hiệu lực, sources với release/publisher/ngày công bố/ngày lấy/khoảng năm; historicalCpi riêng, inflation dự báo/dài hạn từng năm, lợi suất từng nhóm tài sản/dải thời hạn; loại lãi, thực/danh nghĩa, phí/thuế khai rõ. Nháp được thiếu kỳ, duyệt/công bố phải đủ, không trùng/không chồng thời hạn và đúng nguồn.
- `series.ts`: Decimal precision 48, danh nghĩa ghép kỳ → hiệu dụng, thực → danh nghĩa đúng một lần, phí/thuế INCLUDED không trừ lại, EXPLICIT_ANNUAL_DRAG trừ theo quy ước đã khai. UNKNOWN không thành 0; tỷ lệ âm/0 hợp lệ. Chuỗi tháng đổi rate đúng tháng 01 từng năm, không kéo lịch sử hoặc tự ngoại suy cuối nguồn. T04 sẽ cung cấp chính sách danh mục, chưa gán tỷ trọng theo tuổi.
- `service.ts`/`router.ts`: ADMIN nháp → validate → xem diff cấu hình → approve → publish. Revision/actor/token/hash/baseline bảo vệ đúng bản đã xem; bản đã duyệt/công bố bất biến qua API, không công bố version thấp sau số cao. Audit trong transaction; lỗi audit rollback thay đổi. Bản cũ vẫn resolve bằng ID sau khi công bố bản mới. USER chỉ xem/chọn bộ công bố đã có hiệu lực, server từ chối rate override/userId/dữ liệu thừa.
- Lưu `modelCode: assumption-series-v2` trong bảng `assumption_set_versions`, JSON values/policy/source hiện có; không migration hay sửa legacy. Không sửa currentVersionId/stale/snapshot, không tạo outbox job khi công bố. T03 không đi qua engine legacy. Đã bỏ phép tự trừ 1,5 điểm lợi suất hưu trí trong demo backend `services/financialEngine.ts`.
- OpenAPI `docs/assumptions.openapi.yaml` gắn main contract; script sinh DTO `scripts/generate-assumptions-openapi.cjs`. Hướng dẫn `docs/ASSUMPTIONS.md` gồm công thức, nguồn tham chiếu IMF/Investor.gov, lifecycle và giới hạn. Không tải URL nguồn do admin nhập hoặc seed tỷ lệ mẫu.

### Bằng chứng đã chạy

1. `npm test`: **129/129 tests, 13 files PASS** trên mã cuối. **19 tests T03** gồm ranh giới năm/không dùng CPI quá khứ, quy đổi thực/danh nghĩa/lãi ghép kỳ/lãi âm, phí/thuế, thiếu năm/nguồn sai/dải chồng, không kéo dài nguồn, revision/review/approve/publish, rollback audit, quyền HTTP ADMIN/USER, macro injection, OpenAPI response, replay bản cũ và hash đã duyệt. Lượt OpenAPI đầu phát hiện required rỗng ở body `{}`; đã sửa generator, bộ contract hoàn chỉnh đạt.
2. `npm run typecheck:tests`: **PASS** trên mã cuối. `npm run typecheck` từ root: **PASS frontend/backend**. `npm --prefix backend run build`: **PASS** Prisma generate + tsc, TEMP/TMP workspace, sau khi test kết thúc. `npm --prefix backend run test:startup`: **PASS**, production thiếu secrets bị từ chối an toàn trước kết nối DB.
3. `node scripts/verify-assumptions-db.cjs` với quyền mạng: kiểm tra cột DB thật trước ghi fixture, sau đó **14 kiểm tra HTTP/PostgreSQL PASS** qua AuthService/session thật. ADMIN/USER, lưu/đọc nháp, chặn publish chưa duyệt, xem tác động/duyệt/công bố thử 2 bản, resolve đúng năm, không sửa bản công bố, replay bản cũ, chặn macro override, thiếu năm, audit, không tạo job/mail.
4. Mọi tài khoản/phiên/bộ giả định kiểm thử trong một transaction rollback; bản công bố thử không lộ cho API/worker bên ngoài. **Rollback PASS**; fingerprint **50 hồ sơ, kế hoạch chính và snapshot cũ giữ nguyên**. Bảng assumption_set_versions có **0 bản trước/sau**, không đưa fixture vào production. Không cần migration. Bằng chứng này không thay kiểm tra cạnh tranh các transaction độc lập hoặc E2E frontend.

### Phần còn lại và bước tiếp

- Backend T03 contract/lifecycle/series đã kiểm chứng; **T03 toàn sản phẩm chưa đóng**. Chưa có bộ số liệu production được nghiệp vụ duyệt, chưa nối UI quản trị/tự đồng bộ CPI/WEO, frontend demo còn cần thay phép giảm lợi suất. Không dùng 0/4%/7,8% để giả bộ đủ cấu hình.
- Impact hiện **CONFIGURATION_DIFF_ONLY / AWAITING_T06**, có before/after và gate phê duyệt, chưa tính tác động quỹ trước/sau. T06 dùng factors danh nghĩa/ròng; caller không áp phí hoặc chuyển thực/danh nghĩa lần nữa. Chọn bộ ở resolve chưa ghi current plan; snapshot/apply thuộc T07–T08.
- Module tài chính legacy vẫn chưa nối router chính; T06/T07 phải thay engine/job/snapshot cũ trước khi nối. F07/F13 toàn sản phẩm còn mở phần UI/danh mục/engine. Không gửi email hoặc deploy.
- **Bước tiếp chính xác: T04** — questionnaire/rules/version/approval rủi ro đa yếu tố, danh mục tỷ trọng đủ 100% và lịch thay đổi, kịch bản tham số duyệt. Không tự đặt ngưỡng điểm/tỷ trọng production, không gán danh mục chỉ theo tuổi. Q13/Q15 không chặn phần độc lập. Dùng DB thật với fixture rollback, không áp dụng lại migration 0005.

## Checkpoint trước — 04/10/2026: backend T02, HTTP và DB thật

**Chỉ đạo:** người dùng yêu cầu tiếp tục sau T01, giữ ưu tiên backend và dùng DB thật đã được cho phép. Đợt này làm T02; không tạo migration vì hợp đồng nằm trong JSON v2, không sửa migration 0005 đã áp dụng.

### Thay đổi

- `modules/debts/schema.ts`, `loan.ts`, `engine.ts`: hợp đồng có nguồn/ngày chốt/các bên/kỳ trả/lãi/phí/tối thiểu/đáo hạn/điều khoản trả trước. Phân biệt lãi hiệu dụng năm, danh nghĩa năm ghép tháng, hiệu dụng tháng và lãi đơn theo ngày khai rõ. Dư nợ giảm dần, Decimal precision 48, không làm tròn tiền giữa các bước. Lịch rỗng/sai được từ chối bằng validation; không tự suy APR hoặc vốn hóa lãi chưa hỗ trợ.
- `profiles/schema-v2.ts`, `cashflow.ts`, `summary-v2.ts`: thêm contract tùy chọn, giữ đọc dữ liệu T01 chưa có hợp đồng. Summary và preview dùng cùng nguồn thu/chi và lịch nợ; contract KNOWN ghi đè payment scalar cũ. Chi liên kết nợ không cộng hai lần, netWorth và retirementLiquidAssets tiếp tục riêng biệt.
- So CONTRACT/AVALANCHE/SNOWBALL/SELECTED_PAYOFF với ngân sách sau chi thường kỳ và dự phòng; trả trước sau kỳ bắt buộc, phí cố định/phần trăm/mức tối thiểu/tối đa/thời gian cấm. Nợ chung trả trước cần xác nhận góp theo tỷ lệ, không tự lấy tiền dự phòng hoặc tài sản hưu trí. Tổng chi phí có thể cao hơn baseline; không ẩn chênh lệch âm. Hết horizon còn nợ báo HORIZON_LIMIT và SAME_HORIZON_ONLY, không gọi đó là tiết kiệm toàn kỳ.
- Stress thay phần phải trả trong tháng, không cộng lại cơ sở; tăng share chỉ khi phạm vi FULL xác nhận. UNKNOWN/CAPPED/ALLOCATED_ONLY trả thiếu dữ liệu cho phần stress, baseline có cảnh báo giới hạn mô hình. Không tính giới hạn nghĩa vụ còn lại hoặc suy nghĩa vụ pháp lý từ paymentShare.
- `POST /api/v1/me/debts/preview`: USER + phiên thực, ownership từ JWT, expectedProfileRevision, chỉ đọc hồ sơ đã lưu, không nhận macro/userId. Trả chuỗi tháng, áp lực theo ngưỡng 30/50, tiền còn lại (giữ âm), kỳ thiếu tiền, chi phí/ngày hết nợ và dòng tiền có thể dành hưu trí. OpenAPI `debt.openapi.yaml` liên kết với profile v2/main contract; hướng dẫn `docs/DEBT_PLANNING.md`.

### Bằng chứng đã chạy

1. `npm test`: **110/110 tests, 12 files PASS**. T02 có **26 tests** gồm số tính độc lập, lãi đổi/0/ngày/đáo hạn, tiền lớn và phần lẻ, nợ 5/10/15 triệu, tỷ lệ 29,99/30/50/50,01%, DTI thấp vẫn thiếu tiền, phí làm phương án đắt hơn, lịch thiếu, reserve/budget, tiền một lần, share, ownership/revision/auth và HTTP/OpenAPI. Sau rà soát thêm chặn horizon vượt 2199, lịch rỗng và ca tổng nợ 15 triệu: chạy lại riêng 26 tests T02 **PASS**.
2. `npm run typecheck:tests`: **PASS**, gồm lượt sau sửa cuối. `npm run typecheck` từ root: **PASS frontend/backend**. `npm --prefix backend run build`: **PASS** Prisma generate + tsc; TEMP/TMP tại workspace. `npm --prefix backend run test:startup`: **PASS**, production thiếu secrets bị từ chối trước kết nối DB.
3. `node scripts/verify-debts-db.cjs` với quyền mạng: **12 kiểm tra HTTP/PostgreSQL thật PASS**. AuthService login/validateSession thật; lưu nháp, complete, reload hợp đồng và summary, preview/replay, chỉ đọc, user khác 404, revision cũ 409, injection 400, stress nợ chung và hợp đồng UNKNOWN. Không mock DB hoặc session guard trong script này.
4. Toàn bộ fixture, refresh session, audit/outbox trong transaction ngoài rollback; event không commit cho worker. **Rollback/cleanup PASS**, **50 hồ sơ và toàn bộ snapshot cũ không đổi** qua fingerprint trước/sau, không có email được xếp hàng. Không chạy destructive integration suite trên DB thật. Script này không chứng minh isolation/concurrency của transaction nghiệp vụ độc lập; T01 đã có ca revision cạnh tranh riêng.

### Giới hạn và bước tiếp

- T02 backend/API đã có bằng chứng; **T02 toàn sản phẩm chưa đóng**. Frontend chưa có form contract/preview; engine hưu trí cũ chưa thay, F04/F05 toàn sản phẩm vẫn mở. `availableForRetirement` và chênh tháng sẵn để nối T06, không phải kết quả dự phóng quỹ hưu trí đã nghiệm thu.
- Chỉ lịch tháng VND giảm dần, khai lãi/dòng tiền rõ; không bảo đảm đủ tiền từng ngày trong tháng. Chưa hỗ trợ recast, tái cấp vốn, giao dịch thật, nghĩa vụ có trần/điều kiện bảo lãnh, vỡ nợ hoặc chậm trả. Thiếu điều khoản không biến thành giả định hợp lệ. Stress và tối ưu là các phương án riêng.
- T00/browser/nhà cung cấp ngoài chưa nghiệm thu. Không gửi mail hoặc deploy. Không thay các phần frontend/công việc khác đang có trong workspace.
- **Bước tiếp chính xác: T03** — đọc yêu cầu chuỗi giả định theo năm, nguồn/version/phê duyệt/hiệu lực/loại lãi/phí-thuế/danh nghĩa-thực; kiểm tra schema assumption hiện có và đường publish trước thay đổi. Giữ macro ngoài quyền USER. Q13/Q15 không chặn phần độc lập. Tiếp tục dùng DB thật có kiểm tra trạng thái, không chạy lại migration T01.

## Checkpoint trước — 04/10/2026: backend T01 và DB thật

**Chỉ đạo mới nhất:** người dùng yêu cầu “bắt đầu từ T01” rồi “dùng luôn db thật”. Tiếp tục backend T01, không chặn bởi yêu cầu DB test local trong ghi chú cũ. Không reset dữ liệu, không chạy cả bộ test phá dữ liệu trên DB thật, không gửi email hay deploy dịch vụ. Các mục T00 còn lại giữ trạng thái chưa nghiệm thu.

### Đã triển khai

- `modules/profiles/schema-v2.ts`: schemaVersion 2, ngày định giá, VND/tháng, KNOWN/UNKNOWN/NOT_APPLICABLE đúng phạm vi; không có tiền mặc định. Thu khả dụng FIXED/BONUS/IRREGULAR, nhóm chi chi tiết, lịch MONTHLY/ONCE, asset ownership/retirement/emergency/other-goals, thanh khoản/tháng dùng và phương án nhà ở; nợ chung và khoản chi trả nợ có liên kết, kiểm tra ID trùng/lịch/số tiền.
- `summary-v2.ts`: Decimal precision 48, chuỗi số không làm tròn; thiếu dữ liệu trả null theo chỉ số. Thu/chi theo tháng; trả nợ chỉ tính một lần. Tài sản ròng khác vốn hưu trí; nhà ở/dự phòng/mục tiêu khác không thành tiền mặt hưu trí. Ngoại tệ chưa có quy tắc và khác ngày định giá không cộng ngầm.
- `schema.ts`/`service.ts`: API hiện có đọc/ghi v1 và v2. Nháp thiếu nhóm/trường/khoản (giữ ID), merge personal và thay trạng thái/danh sách nguyên khối; validate lại khi complete. Giữ ownership, USER, revision, idempotency, audit/outbox và rollback. V2 không tự đổi ngày định giá khi sửa trường khác; không nhận dữ liệu v1 ghi đè v2.
- Dữ liệu v1 đọc được, kèm `LEGACY_UNREVIEWED` và đường dẫn số 0 chưa có bằng chứng. Chỉ nâng cấp khi user gửi tài liệu v2 đầy đủ; giữ nguyên JSON cũ trong `legacyProfileData`. Không tự xác nhận số 0 cũ hay thay snapshot/currentVersion.
- Migration `202610040005_profile_v2`: thêm JSONB lưu bản cũ; netWorth legacy cho phép null/bỏ default 0. V2 tính summary từ JSON, cache cũ đặt null để không lưu số đã làm tròn. OpenAPI cập nhật cả hai schema và thêm `docs/profile-v2.openapi.yaml`; hướng dẫn tại `docs/FINANCIAL_PROFILE_V2.md`.

### Bằng chứng thực tế

1. `node scripts/check-profile-db.cjs`: kết nối DB thật thành công; đủ migrations 0001–0004, checksum khớp file, pgvector **0.8.2**, **50 hồ sơ schemaVersion 1**. Chỉ đọc metadata/tổng số, không xuất hồ sơ/URL/credentials. Lượt sandbox đầu lỗi TLS P1011; chạy kết nối với quyền mạng đã đạt.
2. `node scripts/apply-profile-v2.cjs`: thử DDL trong transaction, đối chiếu fingerprint 50 hồ sơ, **PASS và rollback**. Sau đó `--apply`: **migration 0005 áp dụng thành công**, dữ liệu JSON/revision/schemaVersion/netWorth cũ không đổi. Không có pending migration khác bị áp dụng kèm.
3. `npm test`: **84/84 tests, 11 files PASS**. Bao gồm 16 tests T01 về thiếu/0, tiền Decimal lớn, ngày/tháng, lịch một lần, FX, phân bổ, chống trùng nợ, lưu/đọc lại, migration v1, rollback/idempotency, USER/ADMIN/ownership và HTTP/OpenAPI. Kết quả này là offline, không thay bằng chứng PostgreSQL.
4. `node scripts/verify-profile-v2-db.cjs`: **12 kiểm tra workflow PostgreSQL thật PASS**, gồm nháp thiếu trường, complete/replay, lưu UNKNOWN và số 0 nhập rõ ràng, đọc lại, ownership, stale revision, outbox và nâng cấp bảo toàn v1. Toàn luồng rollback; event không được commit cho worker. Một lỗi fixture ban đầu thiếu passwordHash đã sửa; không phải lỗi service hoặc thay đổi dữ liệu thật.
5. Cùng script: hai transaction draft thực cạnh tranh → **một thành công/một 409**, revision chỉ tăng một lần. User fixture bị khóa đăng nhập và draft đã dọn đúng ID; **cleanup PASS**. Đối chiếu **50 hồ sơ và toàn bộ snapshot cũ không đổi**.
6. `npm run typecheck:tests`: **PASS**. `npm run typecheck` tại root: **PASS frontend và backend**. `npm --prefix backend run build`: **PASS Prisma generate + tsc**; TEMP/TMP dùng thư mục workspace. `npm --prefix backend run test:startup`: **PASS**, thiếu secret production bị từ chối an toàn.

### Phạm vi còn lại và bước tiếp

- Backend T01 đã có bằng chứng ở trên; **T01 toàn sản phẩm chưa hoàn tất** vì onboarding/form/frontend v2 và browser chưa nối. Client cũ tiếp tục dùng v1 cho hồ sơ v1; cần hỗ trợ v2 trước khi nâng hồ sơ người dùng thực tế qua UI.
- Lịch hợp đồng/gốc/lãi/phí/tối ưu nợ ở T02 chưa làm. Thu từ phương án nhà ở mới lưu dữ liệu, chưa tạo dự báo T06. Lương hưu/tuổi pháp lý ở T05; engine T06 chưa nghiệm thu. Không tự tính hưu trí bằng summary T01.
- T00 migration sạch/browser và nhà cung cấp ngoài vẫn chưa nghiệm thu. Kiểm chứng T01 trên DB thật không tương đương chạy toàn bộ bộ integration hoặc chạy migrations từ DB trắng.
- Bước backend tiếp theo: đọc T02, mở rộng lịch vay trên cấu trúc v2 và kiểm chứng chống tính trùng; tiếp tục dùng DB thật theo chỉ đạo, ưu tiên transaction rollback/fixture riêng, không áp dụng lại migration 0005. Không sửa migration đã áp dụng.

## Checkpoint hiện hành — 04/10/2026: nhận backend T00–T12, sửa kiểm thử auth T00

- Theo yêu cầu người dùng, nhận phần backend của T00–T12 và ưu tiên T00 → T01. Phạm vi chi tiết ở mục 7 [task.md](../docs/task.md). Chưa triển khai toàn bộ danh sách; T00 còn mở phần DB và frontend/browser.
- Task hiện hành thay các ghi chú lịch sử “chờ khảo sát”, “không chạy test” và kế hoạch 14 phase. Chỉ Q13/Q15 còn trao đổi; không dùng chúng để chặn công việc độc lập.
- Đọc luồng đăng nhập/reset, router, OpenAPI và test trước khi sửa. Lượt baseline: **66/67 tests**, lỗi ở `modules.test.ts` reset mật khẩu: test đòi 403 EMAIL_NOT_VERIFIED cho mật khẩu cũ và đòi xóa refresh token đã có. Đúng nghiệp vụ là 401 UNAUTHENTICATED và thu hồi token, bảo toàn dấu vết phiên. Nhánh pending trong service test đã đúng khi bắt đầu lượt này.
- Sửa test reset đúng hành vi; thêm contract test HTTP chạy AuthService thật với DB giả lập: đúng mật khẩu/pending → 403, sai mật khẩu → 401; response theo OpenAPI, không cấp cookie, token hoặc bản ghi phiên. Làm rõ mô tả 401/403 của `/auth/login` trong OpenAPI. Không đổi logic AuthService.

Bằng chứng đã chạy tại backend:

1. `npm test`: **68/68 tests, 10 files PASS** (offline; không phải PostgreSQL integration).
2. `npm run typecheck:tests` và `npm run typecheck`: **PASS**.
3. `npm run build`: **PASS**, Prisma generate + tsc. Lần đầu chạy đồng thời test gặp EPERM đổi tên Prisma DLL; sau khi test kết thúc, chạy lại tuần tự đạt. TEMP/TMP dùng `E:/An_Huu/.cache/tmp`.
4. `npm run test:startup`: **PASS**, từ chối khởi động production thiếu secret, không kết nối DB.
5. `npm run test:local-db`: **FAIL trước integration**, thông báo `LOCAL_TEST_FAILED`. Kiểm tra chỉ xuất cờ cấu hình xác nhận DATABASE_URL không local và TEST_DATABASE_URL chưa được đặt; guard từ chối trước tạo database/migrate. Không kết luận DB/pgvector/migrations đạt.

Giới hạn: chưa chạy frontend/browser, chưa kiểm chứng provider thật, không migrate/reset/seed DB ứng dụng, không gửi email hoặc phát hành. F01 đóng trong phạm vi contract/test đã kiểm chứng; F15/F21 và các việc T00 còn lại giữ mở. Các checkpoint bên dưới là lịch sử, không phải bằng chứng cho toàn bộ code hiện tại.

Bước tiếp cụ thể: chuẩn bị PostgreSQL test local cô lập `anhuu_*_test`, kiểm tra extension vector ngay trong DB test trước migration 0003, chạy migration sạch và nâng từ phiên bản cũ, sau đó integration. Hoàn tất cổng T00 liên quan trước triển khai schema hồ sơ T01; tiếp tục theo thứ tự đã nhận, giữ các thay đổi khác trong workspace.

## Checkpoint mới nhất — 03/10/2026: Nodemailer + HTML email + refresh chủ động

- Theo yêu cầu mới, thay Resend bằng Nodemailer 10.0.13; cài types, cập nhật lockfile và gỡ SDK/config Resend. `jobs/mail.ts`, worker, legacy EmailService, dev runner và trang operations dùng SMTP mới. Không gọi API Resend nữa.
- Đã đọc HTML người dùng gửi tại attachment Pasted text.txt; chuyển thành template `src/templates/auth-email.json`, renderer `authEmail.ts`. Giữ thiết kế navy/mint, thêm biến nội dung cho OTP/reset, CTA, HTML escape mọi dữ liệu user và text fallback. Template JSON được tsc mang theo vào dist.
- Gmail cá nhân là cấu hình mặc định tạm; thêm các trường SMTP vào `.env.example` và chỉ thêm trường thiếu vào `.env` hiện có. Không in hoặc thay credentials cũ. SMTP_USER/SMTP_PASS ban đầu chưa có, cần người dùng điền riêng. Tên miền email không bắt buộc. Xem `../docs/SMTP_EMAIL_SETUP.md`.
- OTP và reset vẫn dùng verification hash/outbox mã hóa, cooldown/expiry/single-use và rate limit có sẵn. Nút xác minh mở form nhận email từ fragment, không tự kích hoạt tài khoản. Reset thành công xóa session frontend và thông báo logout sang tab khác.
- JWT/session backend đã có thật trước đợt này. Bổ sung client đọc exp để lên lịch refresh trước hết hạn, refresh khi focus/online, ngừng poll khi tab ẩn và retry mạng sau 30 giây. Authorization vẫn chỉ do backend quyết định; không lưu JWT localStorage. Request 401 không xoay thêm token nếu request khác vừa refresh xong.
- Đăng nhập bằng mật khẩu đúng nhưng email pending trả EMAIL_NOT_VERIFIED để hướng dẫn xác minh. Giữ xác thực backend, revoke/session family và HttpOnly cookie.
- SMTP bắt buộc TLS/STARTTLS, xác minh chứng chỉ, timeout từng giai đoạn, không log thư/secret. Worker gia hạn lease khi SMTP đang xử lý; Message-ID ổn định không phải idempotency provider. SMTP có thể gửi trùng nếu crash sau provider accept nhưng trước ghi completion.
- Đã cài dependency và sửa mã/tài liệu. **Không chạy test/build/typecheck hay gửi email thật** theo yêu cầu; mock test Resend cũ đã được chuyển sang Nodemailer, chưa thực thi. Không migrate/seed/reset database.
- Bước tiếp: người dùng điền SMTP_USER/SMTP_PASS của hộp thư gửi; chạy `npm run worker:dev` tại backend nếu API/web đang chạy. AI kiểm thử tiếp nhận các trường hợp ghi trong SMTP_EMAIL_SETUP. Không chạy thêm Vite trên 8443, không replay toàn bộ mail FAILED cũ.

Các mục nhắc Resend bên dưới là lịch sử trước khi chuyển SMTP, không phải cấu hình hiện tại.

## Điểm tiếp tục

- Cập nhật: **03/10/2026**, múi giờ Asia/Saigon.
- **Đã nối frontend đăng ký/đăng nhập vào API B02. Yêu cầu hiện tại ưu tiên xác thực; nghiệp vụ tài chính chính còn chờ phản hồi khảo sát. Phần data mẫu đã được người dùng giao AI khác.**
- Người dùng cho phép code theo nhóm rồi test chung. Ban đầu hoãn database; sau đó xác nhận database local đã kết nối được. Đã kiểm tra kết nối và dùng database test riêng để chạy migrations/integration.
- Đọc `AGENTS.md`, `IMPLEMENTATION_PLAN.md`, `info.md`, `task.md` trước khi tiếp tục. Không làm lại setup/đổi stack.
- **Chưa phát hành production. Frontend auth đã nối API; phần hồ sơ/tài chính chưa nối đầy đủ.** Không coi unit test hoặc adapter Azure đã compile là bằng chứng cloud hoạt động.

## Checkpoint 03/10/2026 — hoàn thiện auth frontend/API

- Thay phiên demo/localStorage bằng API đăng ký, OTP, gửi lại, đăng nhập, Google, refresh, logout, forgot/reset. USER/ADMIN lấy từ máy chủ; refresh cookie HttpOnly, access token chỉ trong bộ nhớ. Có loading/error, giữ nguyên mật khẩu, giới hạn gửi lại OTP trên UI, đồng bộ tài khoản/đăng xuất giữa tab và Web Locks cho rotation.
- Backend lưu điện thoại Việt Nam tùy chọn; Google token phải qua verifyIdToken đúng audience, email verified và Gmail/Workspace authoritative. Mật khẩu chưa xác minh cũ bị vô hiệu hóa khi Google kích hoạt tài khoản pending để ngăn chiếm quyền qua đăng ký trước.
- Link đặt mật khẩu dùng fragment và xóa sau khi đọc. Đường dẫn analytics không chứa token. Dữ liệu tài chính demo phía frontend tách khóa theo tài khoản; không thay công thức nghiệp vụ.
- Vite dev/preview proxy `/api` tới 5000. `npm run dev` ở root chạy frontend, API, worker khi đủ cấu hình; tạo khóa outbox local ổn định nếu thiếu. Đã chạy chính lệnh supervisor này: web 8443 trả 200, API readiness trả 200, log xác nhận worker.started/server.started. Không còn lỗi ECONNREFUSED trong probe local.
- Chỉ đọc trạng thái database ứng dụng; không import/seed/migrate/reset. Đã xác nhận 0 email auth đang chờ trước khi bật worker. Không gửi email thử hoặc đăng ký tài khoản thử vào DB ứng dụng. Không ghi secret vào tài liệu.

Bằng chứng đã chạy:

1. `npm run typecheck` ở root: frontend/backend đạt; `npm run typecheck:tests` backend đạt.
2. `npm --prefix frontend run build`: đạt, prerender 11 trang; còn cảnh báo chunk lớn của bundle hiện có.
3. `node node_modules/typescript/bin/tsc` ở backend: đạt.
4. `npm test` ở backend: **59/59 tests, 8 files PASS**, gồm kiểm tra Google giả lập, pending password, phone, HTTP/session và worker giả lập.
5. `npx playwright test tests/auth.spec.ts tests/auth-api.spec.ts tests/knowledge.spec.ts --reporter=line --timeout=30000`: **19/19 PASS**, 9 auth + 10 knowledge. Các API trong bộ trình duyệt dùng mock; không coi đây là kiểm chứng gửi email thật. Auth ở 1440/1024/768/390px không tràn ngang; đã xem ảnh đăng ký desktop/mobile.
6. Probe API thật `/health/ready`: **200**; POST `/api/v1/auth/refresh` qua Vite với Origin/CSRF hợp lệ, không có cookie: **401 UNAUTHENTICATED** đúng hợp đồng.

Giới hạn và bước tiếp theo: kiểm tra nhận OTP/reset ở hộp thư người dùng và OAuth Google trên origin đã đăng ký; chưa có bằng chứng gửi thư/Google thật hoặc deploy production. Cấu hình hosting API theo [AUTH_API_SETUP.md](../docs/AUTH_API_SETUP.md). B04 và các luồng tài chính tiếp theo chỉ triển khai theo phản hồi nghiệp vụ mới nhất; không tiếp tục sinh data mẫu.

## Trạng thái

| Phase | Code | Bằng chứng / giới hạn |
| --- | --- | --- |
| B00 | Hoàn tất nền API | Env, error/HTTP, CORS, health, auth claims, Socket.IO, contract, CI config đã có; kiểm tra local pass |
| B01 | Hoàn tất nền dữ liệu/audit/outbox | 2 migrations chạy trên DB trắng; rollback và cạnh tranh worker đã test bằng PostgreSQL; seed/bootstrap đã kiểm tra. Azure Service Bus và mail thật chưa chạy |
| B02 | Hoàn tất API xác thực | OTP, password reset, rotation/reuse, revoke/securityVersion, cookie/CSRF, auth/user status; offline + PostgreSQL pass |
| B03 | Hoàn tất hồ sơ/onboarding | Decimal, partial merge, revision conflict, ownership, completion transaction, idempotency; offline + PostgreSQL pass |
| B04–B12 | Chưa triển khai trong nhóm này | Các bảng goal/model/assumptions/plan version chỉ là nền schema; chưa có API/bộ tính mới |

## Kết quả kiểm tra đã thực sự chạy

Ngày 02/10/2026:

1. `npm run verify` **PASS**:
   - typecheck nguồn và test;
   - **50/50 tests, 7 files**: foundation, auth/profile HTTP và service, worker/mail giả lập, Socket.IO thật, media giả lập, OpenAPI, engine cũ;
   - Prisma generate + TypeScript build;
   - production startup thiếu secret bị từ chối, không lộ secret, không kết nối DB.
2. Kết nối read-only tới database local cấu hình trong `.env`: **PASS**, server localhost cổng 5433; database ứng dụng đang có bảng. Không ghi URL/mật khẩu vào nhật ký.
3. Tạo database riêng **anhuu_b013_6ead0b15c5_test** trên cùng server; `prisma migrate deploy` áp dụng **cả 2 migrations thành công**.
4. `npm run test:integration` với TEST_DATABASE_URL trỏ database riêng: **10/10 tests, 2 files PASS**.
   - Register → verify → login → refresh → logout với phiên lưu thật.
   - Hai refresh đồng thời: một thành công, token reuse làm revoke cả family.
   - Hai draft update cùng revision: một thành công, một trả conflict.
   - Onboarding ghi chính xác decimal vượt miền số nguyên an toàn JS, giữ surplus âm, replay idempotency và tách ownership.
   - Rollback user/audit/outbox cùng transaction.
   - Hai worker claim cùng event: xử lý một lần; phục hồi lease hết hạn.
   - Readiness/liveness với PostgreSQL thật và khi connection bị lỗi.
5. Seed chạy hai lần trên database test: đủ USER/ADMIN, không ghi đè. Bootstrap admin: tạo một lần có audit; lần trùng bị từ chối.
6. `npm audit --audit-level=high`: **0 vulnerabilities**.
7. `git diff --check`: không có lỗi whitespace; Git chỉ cảnh báo quy ước LF/CRLF.

Lỗi tìm được và đã sửa trong lượt kiểm tra:
- Kiểu UUID của familyId, tương thích cookie với CommonJS/TypeScript.
- Zod/Prisma JSON type tại payload mã hóa.
- OpenAPI 3.0 không cho required là mảng rỗng.
- Cleanup test dependency hỏng: Prisma có thể báo initialization error khi disconnect trong lúc probe cố ý thất bại đang kết thúc.
- Migration refresh family phải backfill trước SET NOT NULL; token plaintext cũ được vô hiệu hóa và xóa giá trị bí mật.

Không chạy migrate/reset/seed lên database ứng dụng. Database test được giữ để xem kết quả, chứa tài khoản fixture. Cụm PostgreSQL tạm ở cổng 55432 từ bước chuẩn bị trước vẫn đã dừng; không dùng lại.

## Những gì đã triển khai

- Hợp đồng `/api/v1`, envelope, requestId, Zod strict, lỗi chuẩn, CORS HTTP/WS, liveness/readiness, log metadata.
- Bảng auth/draft/goal/model/assumption/plan/outbox/processed/idempotency; audit cùng transaction; serializable transaction retry.
- Worker riêng với lease, backoff, FAILED sau 5 lỗi, processed marker, payload email AES-GCM, timeout và provider idempotency key.
- Azure adapter dùng managed identity; queue chỉ chứa eventId. Local worker xử lý từ database.
- Register/verify/resend/login/refresh/logout/logout-all/forgot/reset/auth-me; chỉ USER/ADMIN. Refresh cookie HttpOnly, production Secure; CSRF/Origin ở refresh/logout.
- Session xác thực lại user ACTIVE/role/securityVersion/family trên mỗi protected request. Socket xác thực lại định kỳ 15 giây; callback ngắt socket cùng instance khi revoke.
- `GET/PATCH /me`, profile và onboarding draft/complete; CAS revision, dữ liệu tiền chính xác, không nhận benchmark/summary do client tự tạo.
- OpenAPI cập nhật đủ B00–B03; [hướng dẫn cấu hình/vận hành](docs/ACCOUNTS_PROFILES.md).
- CI kiểm tra database service riêng trên push/PR; deploy cần cả hai job pass và cờ BACKEND_DEPLOY_ENABLED. Docker dùng client đã generate ở build stage, không tải Prisma CLI tùy ý ở runtime.

## Giới hạn còn cần xử lý

- Chưa kiểm tra gửi mail thật, quyền/domain Resend, Azure Service Bus, managed identity, image Docker, workflow CI/cloud hay tải nhiều instance.
- API/worker cần cấu hình OUTBOX_ENCRYPTION_KEY chung ổn định; worker cần RESEND_API_KEY/EMAIL_FROM. Không ghi/tạo provider credentials trong phiên này.
- Database ứng dụng đã có bảng: kiểm tra migrations/schema và baseline trước khi áp dụng vào đó. Chỉ chứng minh migration trên DB trắng; nâng cấp dữ liệu legacy thực tế cần kiểm tra riêng.
- Rate limiter còn memory. Pub/sub socket và thu hồi tức thời nhiều instance thuộc B12; hiện instance khác phát hiện tối đa chu kỳ kiểm tra 15 giây, còn HTTP kiểm tra session mỗi request.
- profile.changed/security.sessions_revoked hiện xác nhận dấu vết bền vững; tác động stale/revoke đã ở transaction nguồn. Chưa tự tính lại plan/push notification. B04/B10/B12 phải thêm consumer cho event mới khi triển khai tính năng đó.
- Financial engine cũ vẫn là demo, đặc biệt BHXH. Không nối kết quả cũ thành số liệu production. Không seed benchmark mẫu.
- Frontend tài chính vẫn có luồng demo, rate input và dữ liệu local. Auth đã nối API theo checkpoint 03/10; phần tài chính/hồ sơ cần adapter riêng và quy ước nhóm tiền không trùng.
- Có thay đổi frontend từ công việc khác trong workspace; giữ nguyên, không revert hoặc gom vào thay đổi backend.

## Bước tiếp theo cụ thể

1. B04: đọc lại phần giả định/mục tiêu trong info/task và kế hoạch. Thêm API published benchmarks + admin draft/publish bất biến; lưu nguồn, hiệu lực, lý do và model version.
2. Xây retirement goal với tuổi nghỉ hưu, chi tiêu và contribution/risk input được phép; cấm inflation/return override của USER.
3. Engine thuần dùng Decimal, snapshot input/version và chart series; định nghĩa thời điểm đóng/rút, làm tròn, số tích lũy yêu cầu và cạn quỹ.
4. Thiếu benchmark hợp lệ thì trả trạng thái chưa tính được. BHXH chưa đủ dữ liệu/quy tắc đã xác nhận thì không tự suy diễn quyền lợi.
5. Test theo nhóm đã thống nhất; tiếp tục dùng database test riêng và cập nhật nhật ký sau mỗi checkpoint.

## Lệnh tiếp tục

Từ backend:

- `npm run verify`
- `npm run test:local-db`: tạo database test mới trên server local, migrate rồi test; không đụng dữ liệu ứng dụng.
- Hoặc đặt TEST_DATABASE_URL local có tên anhuu_*_test rồi `npm run db:test:prepare` và `npm run test:integration`.
- `npm run worker` sau build/config đầy đủ; không chạy worker thật trên fixture nếu chưa muốn gửi email.

Trong sandbox Windows này, Prisma cần TEMP/TMP trỏ thư mục writable (đã dùng E:/An_Huu/.cache/tmp); npm cache đã dùng E:/An_Huu/.cache/npm. Đây là workaround môi trường, không phải yêu cầu khi chạy máy/CI thông thường.
## Checkpoint mới nhất — 03/10/2026: tiện ích API, reload và khôi phục dịch vụ

**Ưu tiên đọc mục này trước các checkpoint cũ bên dưới.** Người dùng đã giao dữ liệu mẫu và kiểm thử cho AI khác; yêu cầu phiên này tập trung viết chức năng, bỏ bước test, sửa reload/backend trước và để lại danh sách tiếp tục.

### Đã viết và nối giao diện

- Account: GET/PATCH tài khoản có revision; avatar upload/remove; đổi mật khẩu hiện tại/mới; thu hồi toàn bộ phiên. Thông báo account/password dùng outbox, tránh làm account API phụ thuộc bảng Notification chưa cập nhật. Worker tạo notification idempotent theo event ID.
- Admin users: tìm kiếm/lọc/phân trang, chi tiết/lịch sử, khóa/mở khóa có lý do/revision, cấm sửa ADMIN/tự khóa, thu hồi session.
- Content: quản trị ARTICLE/FAQ/GLOSSARY, nháp/xuất bản/ẩn, tìm kiếm không dấu, lưu/bỏ lưu bài theo user trên server. Explore chuyển sang KnowledgeLibraryApi; component demo cũ không còn là luồng chính.
- Support: tạo yêu cầu, xem 200 phản hồi mới nhất, trao đổi, admin đổi trạng thái có revision, notification.
- Consultations: tiếp nhận nhu cầu, admin cập nhật trạng thái/ghi chú/nhận phụ trách, bảo vệ ghi chú nội bộ; chưa xác nhận lịch tự động.
- Notifications: danh sách, đếm chưa đọc, đánh dấu một/tất cả, liên kết điều hướng; header đọc số chưa đọc từ API.
- Operations: API và trang `/admin/operations` hiển thị cấu hình dạng cờ, thống kê hàng đợi email, mã lỗi đã làm sạch; `/admin/settings/audit-log` lấy dữ liệu thật từ server. Không coi có cấu hình là đã kết nối nhà cung cấp thành công.
- Reload: bỏ % và thông điệp tiến độ tự giả lập; giữ nền/logo/vòng chờ, sửa SVG animation ghi đè transform, responsive và reduced motion, portal tránh ancestor transform. Khi restore lỗi mạng/5xx hiển thị thử lại; chỉ 401 mới về login. Bổ sung error boundary cho lỗi tải trang và thời hạn chờ khóa phiên giữa các tab. Bỏ export hằng navigation gây Vite full refresh.
- Dev runner: một dịch vụ chết không dừng tất cả; tối đa 3 lần thử lại có backoff, theo dõi source backend để restart; dừng tiến trình do runner quản lý khi thoát. Backend startup log whitelist mã lỗi cổng/DB/TypeScript; Prisma thiếu bảng/cột hoặc mất kết nối trả 503 có thông báo phù hợp.

### Trạng thái chạy thực tế, không phải kết quả test

- Khởi động backend chẩn đoán cổng 5001 đã ghi `server.started`; chưa tái hiện được crash mà user báo. Đã dừng đúng tiến trình chẩn đoán này.
- Đã khởi động lại backend An Hưu cổng 5000 bằng nodemon, log `.cache/backend-recovery.stdout.log` ghi `server.started`.
- Đã mở lại frontend, `.cache/frontend-recovery.stdout.log` ghi Vite ready tại localhost:8443. Không cần chạy thêm một bản trên cùng cổng.
- Backend chạy nền qua nodemon, frontend chạy nền riêng. Phần supervisor mới trong `scripts/dev.cjs` sẽ có hiệu lực khi dùng root `npm run dev`; không chạy lệnh đó chồng lên hai tiến trình hiện tại.
- **Không chạy test/typecheck/build/browser kiểm tra cho đợt tiện ích và sửa reload này theo chỉ đạo mới nhất.** Số test PASS ở checkpoint cũ không chứng minh code mới đã đạt.
- Không seed/import dữ liệu; không apply migration/reset database ứng dụng. Không gửi thêm email để kiểm thử trong đợt sửa reload.

### Phụ thuộc và việc tiếp theo

1. Xem `docs/SESSION_HANDOFF_2026_10_03.md` ở root và `backend/docs/SECONDARY_API.md` để tiếp tục. Các route bổ sung đã được mô tả bằng văn bản và OpenAPI v0.4.0; chưa chạy validation/contract tests cho bản mới.
2. Migration `202610030004_community_features` đã chuẩn bị: Article kind/revision/publishedAt/searchText, SavedArticle, SupportTicket/SupportMessage, Notification. **Chưa apply DB ứng dụng**. Phối hợp migration 0003 AI/pgvector của công việc khác; đọc lịch sử/schema thật và dùng bản sao trước, không reset/baseline mù. Prisma client đã generate trước checkpoint; nếu AI dữ liệu sửa schema sau đó phải generate lại.
3. Account API chỉ enqueue thông báo; nếu worker chạy trước migration0004, notification delivery có thể FAILED. Sau schema readiness cần xử lý sự kiện notification bị lỗi có kiểm soát, không replay hàng loạt email OTP/reset đã hết hạn.
4. Resend thật đã trả 403 do giới hạn sandbox/domain chưa được phép gửi tới địa chỉ user cung cấp. Cần domain/sender có quyền; không đổi Google password, không hứa email đã đến. Google login thật/Cloudinary thật chưa được xác nhận.
5. AI kiểm thử nhận phần quyền sở hữu, session/reload/backend outage, revision/concurrency, nội dung/bookmark, support/consultation/notification, upload, mobile. Tests frontend account/knowledge cũ có selector/localStorage assumptions cần điều chỉnh theo giao diện hiện tại.
6. Code tiếp: upload ảnh nội dung nếu cần, đưa cài đặt notification/quản trị còn demo sang server theo phạm vi đã thống nhất. Dashboard/report/partner/AI/tính tài chính production còn phụ thuộc khảo sát và nguồn dữ liệu được duyệt.

Giữ nguyên thay đổi từ AI frontend và AI dữ liệu; không coi dữ liệu trong khảo sát là quyết định đã phê duyệt.
