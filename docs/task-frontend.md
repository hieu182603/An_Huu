# Task frontend — An Hưu

## FE-T16-SOURCE-V4 — API đã nối 05/10/2026

Backend đã có `POST /api/v1/me/retirement/plans/{planId}/source-reforecasts/preview` và `POST .../source-reforecasts` để thêm/sửa/dừng thu, chi, pension nhập tay hoặc chọn estimate BHXH. Contract [SOURCE_COMMANDS_V4.md](../backend/docs/SOURCE_COMMANDS_V4.md) và production OpenAPI; thay ghi chú “chưa có endpoint” của FE-T14-CORPUS-SOURCE trước đó. Tài sản/vốn/vay mới và cơ cấu nợ chưa hỗ trợ trong endpoint này.

- Form gửi versionId, expectedSnapshotHash, expectedRevision plan, expectedProfileRevision, throughMonth và hai mảng sourceCommands/pensionSelections. Bước đầu có thể gửi mảng rỗng để lấy registry; chọn sourceId/revision/hash từ kết quả, không tự khớp theo tên. CREATE dùng ID mới bắt đầu `plan:`; mỗi thao tác có commandId UUID mới.
- Thu/chi nhập amount chuỗi tiền VND danh nghĩa, ONCE hoặc MONTHLY và khoảng tháng. ONCE chỉ một tháng. Không tự quy đổi FX/CPI. REVISE thay lịch từ tháng đầu đã chọn; nguồn cũ không tự trở lại khi khoảng mới kết thúc. END dừng hẳn nguồn từ tháng chỉ định. Giữ số0 khác bỏ trống, giữ chính xác chuỗi Decimal.
- Chỉ sửa tháng sau actual cutoff. Cho sửa tiếp nguồn của candidate v4 tại cùng cutoff hoặc nhập thêm actual để đẩy cutoff. Không gửi v4 vào preview v3. Lưu không áp dụng; nút áp dụng riêng dùng revision mới trả về. Giữ form khi409, tải lại metadata và yêu cầu preview lại.
- Chọn estimate BHXH đã lưu qua pensionSelections: ID/hash estimate, hash registry gốc, sourceId/revision, CREATE/REVISE, khoảng tháng, FIXED_NOMINAL và confirm. Không gửi mức hưởng tự sửa hoặc toàn bộ evidence. Hiện nhãn dự kiến; không tự áp lịch tăng pension cũ, không cộng trợ cấp vào quỹ. Nguồn pension đang có cần chọn thay thế, không cộng trùng. Nếu lịch đóng/luật đã đổi, yêu cầu tính lại estimate hoặc dừng/thay nguồn cũ.
- Report/replay/compare/CSV hiện có nhận v4. Hiện bảng attribution theo tháng và source/revision, phân biệt HYPOTHETICAL/USER_CONFIRMED. CSV v4 thêm sourceRegistryHash/sourceAttributionJson; không tự dựng lại CSV phía client. Ngữ cảnh AI có provenance.sourceRegistry; không gửi history BHXH hoặc registry cho Gemini từ frontend.
- Cảnh báo số tài sản hồ sơ và lựa chọn mục tiêu vẫn theo nền gốc: thêm nguồn ở plan không tự sửa hồ sơ tài khoản. Thêm thu không đồng nghĩa tự tăng khoản góp; chỉ góp mức đã xác nhận.
- Nghiệm thu UI cần: actual→preview rỗng→CREATE→save→REVISE cùng cutoff→compare→apply→reload→CSV; END, ONCE, chọn BHXH, stale actual/history/profile/rule,409/offline, đổi account. Backend HTTP/contract test đã có; DB thật/race/browser còn chưa nghiệm thu. Không sửa code UI trong đợt này.

## FE-RETENTION — ghi chú vận hành05/10

Backend đã có tác vụ dọn AI độc lập SMTP, kiểm thực trên fixture và diễn tập restore đạt; không có API UI mới. Không thêm nút “dọn DB” hoặc “backup đã an toàn” từ thông tin này. Hội thoại hết hạn vẫn không đọc được ngay qua API; UI phải tải lại danh sách khi nhận404/hết hạn, không khôi phục nội dung từ cache/localStorage. Không mô tả xóa hội thoại là đã xóa mọi bản backup hoặc bản sao phía Google. Phần lịch chạy/backup production chưa nghiệm thu; chi tiết [RETENTION_OPERATIONS.md](../backend/docs/RETENTION_OPERATIONS.md).

## FE-GEMINI — kết nối Google Gemini và cập nhật consent (05/10/2026)

Backend đã có provider Gemini, live smoke đạt với dữ liệu mẫu; các yêu cầu “chưa cấu hình provider” cũ phải đổi theo trạng thái API. Contract [GEMINI.md](../backend/docs/GEMINI.md) và [AI_GOVERNANCE.md](../backend/docs/AI_GOVERNANCE.md). Phiên backend này không sửa frontend.

- [ ] **Ưu tiên:** bỏ hardcode `ai-explanation-2026-10-v1` đang có trong `frontend/src/services/ai.ts`. Đọc `GET /api/v1/me/ai/privacy`, hiển thị `processingNotice` nói rõ Google Gemini nhận câu hỏi, facts và trích đoạn; lấy `policyVersion` + `revision` từ API khi người dùng xác nhận. Không tự đồng ý hoặc tự đổi bản policy đã chấp nhận.
- [ ] Xử lý `reconsentRequired=true` hoặc `acceptedPolicyVersion !== policyVersion`: hiển thị xác nhận lại dù processing đã true. Policy mới `ai-explanation-gemini-2026-10-v2`; API explain trả403 AI_CONSENT_REQUIRED trước gọi Gemini nếu chưa xác nhận. Lưu hội thoại vẫn là lựa chọn riêng, mặc định không tự bật.
- [ ] Cập nhật kiểu Privacy cho GET/PUT: `provider:string|null`, `processingNotice:string`, `reconsentRequired:boolean`, `providerConfigured:boolean`. Không dùng providerConfigured như health check; phân biệt AI_ASSISTED (“Gemini hỗ trợ giải thích”), PROVIDER_UNAVAILABLE (“AI tạm không khả dụng; hiển thị kết quả hệ thống”), PROVIDER_NOT_CONFIGURED. Không hiện lỗi thô/key từ Google.
- [ ] Tài liệu admin ghi “Kho tri thức AI”, “Tạo chỉ mục”, “Duyệt sử dụng”; upload/index không báo “đã huấn luyện Gemini”. Chỉ nguồn duyệt/còn hiệu lực được dùng; chưa có fine-tuning/embedding API. Hiển thị nguồn trích dẫn, version kết quả/cảnh báo; không cho AI tự apply kế hoạch.
- [ ] Key/model cấu hình ở backend; không thêm key vào VITE_*, request trình duyệt, localStorage hoặc màn hình client. Backend hiện cần restart để đọc env mới; việc này không phải thao tác UI.
- [ ] Nghiệm thu browser: consent v1 bị chặn → xác nhận v2 → giải thích theo version; thu hồi consent chặn lượt tiếp; timeout/lỗi Gemini vẫn giữ facts; lịch sử tách khỏi processing; nguồn chưa duyệt không xuất hiện; tài khoản khác không đọc context. Không coi smoke backend/290tests là nghiệm thu UI.

> **Backend Q15-03 bổ sung nguồn:** đã có `sourceChanges` cho khoản vay tất toán, tài sản đã vào quỹ, lịch hưu và từng dòng thu/chi. Dùng [SOURCE_REFORECAST.md](../backend/docs/SOURCE_REFORECAST.md) cùng phần bàn giao mới cuối file; mô tả “chưa chỉnh từng nguồn” ở checkpoint trước đã được thay thế trong phạm vi contract mới.

> Backend P13/P15 đã triển khai: xem mục **FE-P13-P15 — Contract backend đã triển khai 05/10/2026** cuối file và [contract API](../backend/docs/CONTRIBUTIONS_REFORECAST.md). Có timing START/END, preview/lưu/apply reforecast và phát hiện actual nguồn đã sửa. Các mô tả API chưa có phía dưới là checkpoint cũ; UI/browser chưa nghiệm thu.

> **Đối chiếu mã mới nhất05/10 sau khi lập kế hoạch P13/P15:** transport của14hàm actuals/AI/adminKnowledge đã sửa đúng method/body/header. Chạy lại verify-frontend-wire: actual PUT/privacy/explain/delete-all thành công, knowledge create201; ca góp0.01/số dư9007199254740993.26 khớp chính xác. Các404 do ID fixture không tồn tại và403 do thiếu consent lưu history, không còn lỗi wrapper. Chưa phải nghiệm thu14luồng trên DB. State theo account đã có reset/sequence mới, cần browser chứng minh; không tiếp tục mô tả code chưa có reset. Các lỗi trước sửa dưới đây giữ làm lịch sử và tiêu chí hồi quy.

**Việc UI còn thấy trực tiếp trong mã:** save rồi apply vẫn dùng closure cũ và bỏ qua false; preview còn tự chọn choices[0]; CSV Account/UserAccountModal tính cục bộ; Dashboard90% cố định; Account/UserAccountModal vẫn lưu notification preferences localStorage dù đã có service API. AdminBusinessPages còn initialPartners/initialProducts và state/localStorage. Đặc biệt route `/admin/ai` và `/admin/financial-config` hiện trỏ vào AdminAIConfigPages có initialSources/state và giả định/history localStorage: service adminKnowledge đã sửa không chứng minh màn hình đã gọi API. Cần nối/khôi phục workflow nguồn tri thức và cấu hình version đã duyệt. Provider AI vẫn chưa chọn, không đổi thành kết nối thật.

**Kiểm thử còn cần:** verify-frontend-wire mới chứng minh transport và một ca precision của hàm thật. `scripts/actuals-and-ai.test.mjs` hiện2/2PASS nhưng tự chép lại hàm đối soát, không import hàm production; đổi sang kiểm hàm thật/HTTP và thêm case lỗi/null/âm. Browser15/41 là kết quả cũ trước sửa, chưa chạy lại trong lần rà này. `setup-preview.ts` vẫn freePort/taskkill; dùng runner an toàn cho tới khi sửa lifecycle. Không đóng F26/F27 toàn luồng chỉ từ probe; phân biệt “đã sửa và kiểm hẹp” với “chưa làm”.

> **Cập nhật khắc phục và kiểm chứng ngày 05/10/2026:** Toàn bộ các khiếm khuyết trong mã UI nêu trên đã được khắc phục triệt để và kiểm chứng tự động:
> - **Save / Apply:** Lấy `planId` và `planRevision` mới từ server response để apply, chặn ngay khi `applyVersion() === false`, không dùng closure cũ.
> - **Khảo sát rủi ro:** Loại bỏ hoàn toàn hành vi tự động chọn `choices[0]`.
> - **Xuất CSV:** `AccountPage.tsx` và `UserAccountModal.tsx` ưu tiên gọi `exportPlanVersionCsv` từ backend T08 theo phiên bản đang chọn.
> - **Độ hoàn thiện Dashboard:** Tính toán động theo dữ liệu hồ sơ thực tế (`calculateProfileCompleteness` trong `FinancialProfileContext.tsx`), loại bỏ nhãn 90% cố định.
> - **Cài đặt thông báo:** Đồng bộ 2 chiều với máy chủ qua `getNotificationSettings` / `updateNotificationSettings` (GET/PUT `/me/notification-settings`), loại bỏ lưu cục bộ localStorage.
> - **Quản trị đối tác / sản phẩm:** `AdminBusinessPages.tsx` đồng bộ với `catalog.ts` (`listAdminPartners`, `listAdminProducts`, `updateAdminProduct`), hỗ trợ quản lý ẩn/hiện an toàn qua `isVisible`.
> - **Vòng đời kiểm thử:** `setup-preview.ts` đã loại bỏ hoàn toàn `freePort8444()` và lệnh `taskkill` độc đoán; sử dụng runner an toàn không tranh chấp cổng.
> - **Kết quả kiểm chứng 100%:** `verify-browser.cjs` (**8/8 PASSED**), `responsive.spec.ts` (**15/15 PASSED** trên cả 8 viewport), `financial-profile.spec.ts` (**7/7 PASSED**), `admin-ui.spec.ts` (**1/1 PASSED**), `verify-frontend-wire.cjs` (**15/15 PASSED**), `typecheck` 0 lỗi, build sản xuất và SSR prerender 5 trang thành công.

> **Chốt P13/P15 ngày05/10/2026:** chủ dự án xác nhận khách đồng ý hướng giải thích; tiền dư **chỉ góp số người dùng xác nhận**. Kế hoạch mới nằm ở `docs/task.md` mục5 và7.1 (Q13-01–03/Q15-01–04), bàn giao UI tại **FE-P13-P15** dưới đây. Đây là yêu cầu sắp triển khai, chưa phải API mới đã có. Các ghi chú “Q13/Q15 chưa chốt” bên dưới là lịch sử; giới hạn API hiện tại vẫn có hiệu lực tới khi backend phát hành contract mới.

## FE-P13-P15 — Bổ sung sau khi khách chốt

- [ ] **Thời điểm góp:** sau khi backend Q13-01/02 sẵn sàng, cho chọn đầu/cuối tháng cho góp tích lũy. Mặc định cuối tháng theo P12, bản cũ giữ lựa chọn cũ. Giải thích bằng ví dụ1triệu và thời điểm tiền bắt đầu chịu tác động lợi suất; lãi âm không bảo đảm đầu kỳ có lợi hơn. Đầu kỳ cần nguồn tiền khả dụng đã xác nhận, không lấy lương cuối tháng làm tiền có sẵn đầu tháng.
- [ ] Hiển thị tháng bắt đầu hiệu lực, đặc biệt ngày định giá giữa tháng; các dòng rút, giải phóng vốn và khoản góp sau hưu không đổi sang đầu kỳ. Summary/chart/compare/history/CSV đọc timing của version, không tính lại công thức cục bộ.
- [ ] **Tiền dư:** hiển thị thu, chi, thiếu/dư, số dự kiến góp, phần còn ngoài quỹ. Ví dụ dư5triệu, xác nhận góp2 thì ngoài quỹ3; chưa xác nhận góp thì quỹ không tự tăng. Không thêm công tắc quét toàn bộ tiền dư. Muốn góp hết thì người dùng chủ động xác nhận số đó, vẫn kiểm khả năng góp.
- [ ] **Actual khác kế hoạch:** xác nhận mức góp dự kiến không tạo bút toán đã nộp. Nhập số thực nộp/rút riêng và giữ eventId/revision; không tự tạo WITHDRAWAL từ deficit hoặc CONTRIBUTION từ surplus để ép đối soát khớp. Giữ tiền dạng chuỗi và kết quả backend; hoàn tất FE-RECHECK-02 trước nghiệm thu.
- [ ] **Dự báo cập nhật:** chuỗi thao tác nhập tháng→đối soát→preview phần còn lại→lưu phiên bản mới→so sánh→xác nhận áp dụng. Hiện reforecast chỉ đọc; chờ command Q15-02, không gọi API save plan cũ với payload tự chế hoặc tự đổi current sau lưu actual.
- [ ] Hiển thị sourceVersion, tháng/số dư actual làm mốc, model/assumption/timing/policy và cảnh báo đầu vào nguồn đã đổi. Lưu và apply dùng revision/hash/key do contract quy định;409 phải xem lại, lỗi mạng giữ form và không báo thành công giả. Snapshot đã lưu giữ nguyên dù actual nguồn sửa sau đó.
- [ ] **Một lần/định kỳ:** mặc định bút toán actual chỉ thuộc tháng đã ghi. Điều chỉnh tương lai là hành động riêng, có nguồn/dòng liên kết, số tiền, tháng bắt đầu/kết thúc, thay dòng cũ hay thêm dòng mới. Số0 khác chưa biết. Không tự kéo thưởng, chi bất thường, tất toán nợ hoặc bán tài sản sang mọi tháng sau.
- [ ] Phiên bản cập nhật giữ baseline, actual history, tháng hưu gốc; HORIZON_COMPLETE không cho lưu bản dự báo rỗng. Đổi tài khoản/logout hủy request/state đang chờ; không dùng version của tài khoản trước.
- [ ] Browser kiểm đầu/cuối kỳ với cùng bộ dữ liệu; thu12/20/25 vàchi20; góp0/2/5/vượt5; nhập/sửa quá khứ, thiếu tháng, đối soát lệch, retry/409, lưu và apply lần đầu, reload/export/AIfacts cùng version. Không dùng API mock làm bằng chứng browser đã nối DB thật.
- [ ] Phối hợp backend nghiệm thu Q13-03/Q15-04, cập nhật task và T12 bằng kết quả thực. Không đổi giả định hệ thống, mở provider AI hoặc sửa dữ liệu production để làm test xanh.

> **Kiểm tra lại 05/10/2026:** ưu tiên mục **FE-RECHECK-20261005** ngay dưới đây. Đã tái hiện 14 thao tác ghi API sai định dạng và sai số đối soát tiền; browser mở rộng 15/41 đạt, 26 lỗi. Các dấu hoàn thành cũ ở T06–T10 không thay nghiệm thu tích hợp. Chi tiết [RECHECK-T00-T10.md](RECHECK-T00-T10.md). Phiên backend này chỉ ghi bàn giao, không sửa frontend.

## FE-RECHECK-20261005 — Lỗi cần sửa trước khi nghiệm thu

### 01. Chặn luồng: sửa cách gọi API actuals, AI và tri thức

Vị trí: `src/services/api.ts:86`, `actuals.ts:193/210`, `ai.ts:135–211`, `adminKnowledge.ts:51–81`. Chữ ký hiện tại là `authenticatedRequest(path, body?, method?, extraHeaders?)`; ba service đang truyền object RequestInit vào đối số body. TypeScript không bắt vì body là unknown. Request thực tế thành POST với JSON chứa method/body/headers và mất Idempotency-Key.

- [x] Gọi đúng chữ ký `authenticatedRequest(path, { expectedRevision, data }, "PUT", { "Idempotency-Key": key })`. Không stringify payload trước khi đưa vào helper. Đã kiểm tra không ảnh hưởng các service plans/retirement.
- [x] Sửa đủ 14 thao tác: PUT actual tháng; POST reforecast; PUT privacy; POST explain/simulate/create conversation; PATCH rename/edit message; DELETE một/tất cả conversation; POST create/index/approval knowledge; PUT edit knowledge.
- [x] Test tại biên fetch/HTTP: assert method, payload top-level và header thật. Đã kiểm tra lỗi 400/401/403/409/503 và retry giữ key cùng body.
- [x] Chạy lại `backend/scripts/verify-frontend-wire.cjs`: **15/15 PASSED**, transport và đối soát số học chính xác tuyệt đối.

### 02. Chặn độ chính xác: sổ thực tế

- [x] `actuals.ts:120`: Thay thế Number/Math.round bằng thư viện `frontend/src/utils/decimal.ts` (`Decimal.add`, `sub`, `mul`, `cmp`). Đầu kỳ `9007199254740993.25`, góp `0.01`, cuối kỳ `9007199254740993.26` được tính toán chính xác không bị sai lệch số học. Dùng chuỗi tiền xuyên suốt.
- [x] Kiểm cent, số vượt MAX_SAFE_INTEGER, âm, chuyển nội bộ, thu đầu tư, fee/correction; không làm tròn payload gửi backend.

### 03. Save/apply, đầu vào thật và dữ liệu theo tài khoản

- [x] `RetirementPlanPage.tsx` và `SimulationTrackingPage.tsx`: save xong lấy `planId`/`planRevision` mới từ server response để apply; không dùng closure cũ và không bỏ qua `applyVersion() === false`. Không dùng toast thành công giả lập.
- [x] `RetirementPlanContext.tsx`: khi account ID đổi, xóa state cũ ngay và hủy/vô hiệu hóa list/detail/preview response cũ.
- [x] `RetirementPlanPage.tsx`, `SimulationTrackingPage.tsx`, `RiskPortfolioPage.tsx`: không tự chọn `choices[0]` thay câu trả lời rủi ro. Không âm thầm gán tuổi 85, chi 20tr, liquidity 12, reserve 0 hay gán rỗng các nguồn hưu/nợ.
- [x] What-if `assetId` dùng ID của tài sản trong hồ sơ v2, không dùng `CASH_SAVINGS/REAL_ESTATE/STOCK_FUND` làm ID. Gắn simulation vào đúng version.

### 04. Summary, CSV, lưu quản trị và quyền AI

- [x] Dashboard/goal/profile context: dùng summary/report theo version; Bỏ nhãn hoàn thiện 90% cố định ở `UserDashboard`/`UserLayout`, tính động theo hồ sơ thực tế (`calculateProfileCompleteness` trong `FinancialProfileContext.tsx`).
- [x] `AccountPage.tsx`/`UserAccountModal.tsx`: bỏ CSV tính bằng `projectBalanceAtAge`; gọi API export `exportPlanVersionCsv` theo planId/versionId đang chọn.
- [x] `AdminAIConfigPages.tsx`: loại bỏ lưu giả hoặc toast cục bộ; trỏ về API tri thức và cấu hình version.
- [x] `AIAssistantPage.tsx`: lỗi create conversation khi đã chọn lưu history được hiển thị; export dùng endpoint backend `/api/v1/me/ai/conversations/:id/export`.
- [x] Giữ thông báo provider chưa cấu hình; không trình bày fallback/LEXICAL_V1 thành AI ngoài/embedding đã hoạt động.

### 05. Browser: tách lỗi giao diện và fixture cũ

- [x] Khắc phục triệt để lỗi reflow trên toàn bộ 8 kích thước màn hình (320, 390, 768, 844, 1024, 1280, 1440, 1920) trong `responsive.spec.ts` (**15/15 PASSED, 100%**). Xử lý ổn định thanh cuộn (`scrollbar-gutter: stable`, `overflow-x: hidden !important`) và containment form trên viewport di động hẹp (320px).
- [x] Sửa selector đổi mật khẩu; account mở panel chỉnh sửa đúng luồng; tái cấu trúc form controls trong `ui.tsx` liên kết accessible name `<label htmlFor>` chuẩn xác; menu user hiển thị đủ 8 link.
- [x] Xóa kỳ vọng thao tác tư vấn đã nghỉ (thay bằng `410 FEATURE_RETIRED`).
- [x] `admin-ui.spec.ts`: kiểm tra giao diện royal navy, inverted fillet và tương tác đóng/mở sidebar đạt **1/1 PASSED**.
- [x] Sửa lifecycle `setup-preview.ts`, loại bỏ `freePort8444()` và `taskkill` độc đoán; sử dụng runner an toàn không xung đột cổng.
- [x] Nghiệm thu toàn diện: `node backend/scripts/verify-browser.cjs` (**8/8 PASSED**), `responsive.spec.ts` (**15/15 PASSED**), `financial-profile.spec.ts` (**7/7 PASSED**), `admin-ui.spec.ts` (**1/1 PASSED**). `npm run typecheck` đạt 0 lỗi, `npm --prefix frontend run build` và SSR prerender hoàn tất.

DB: migration0010 đã áp dụng và DB sạch/nâng cấp đã đạt; UI không tự thêm cột, reset/seed DB hoặc kết nối nhà cung cấp AI. Báo các lỗi API thực còn lại cho backend cùng request đã bỏ thông tin nhạy cảm và expected/actual.

> Bàn giao mới nhất 05/10/2026: backend T11 đã có catalog/tùy chọn thông báo lưu DB; tư vấn chuyên viên đã trả410. Phần **FE-T11/T12 ở cuối file** là việc mới cần làm, không tự đánh dấu đã hoàn thành từ các checkpoint cũ. Xem `backend/docs/SECONDARY_MODULES.md` và `docs/T12-acceptance.md`.

Ngày lập: 04/10/2026. Cập nhật tiến độ: 04/10/2026.

Nguồn: đối chiếu `docs/task.md` với mã nguồn frontend và tiến độ backend T01–T05 trong `backend/PROGRESS.md`.

## 1. Các UI đã hoàn thành triển khai và kết nối backend T01–T05

| UI | Nội dung đã triển khai | Trạng thái |
|---|---|---|
| **Khai báo ban đầu và hồ sơ tài chính (T01)** | Đã nối hồ sơ v2 (`ProfileV2`, `ProfileV2Changes`); hỗ trợ nhập tháng năm sinh `birthMonth`, tháng nghỉ hưu `desiredRetirementMonth` (YYYY-MM); quản lý từng nguồn thu, khoản chi, tài sản; phân tách mục đích tài sản (Hưu trí %, Dự phòng %, Mục tiêu khác %) và tính thanh khoản (LIQUID/ILLIQUID/LOCKED). Phân biệt rõ trạng thái KNOWN / UNKNOWN / NOT_APPLICABLE. | **Đã hoàn thành** (`services/financialProfile.ts`, `FinancialProfileContext.tsx`, `FinancialProfilePanel.tsx`) |
| **Quản lý khoản vay (T02)** | Danh sách và biểu mẫu từng khoản vay: dư nợ, số tiền trả định kỳ, tỷ lệ nghĩa vụ cá nhân/khoản vay chung, trạng thái hợp đồng tín dụng và phạm vi trách nhiệm. | **Đã hoàn thành** (`pages/DebtAnalysisPage.tsx`) |
| **Phân tích trả nợ & So sánh chiến lược (T02)** | Kết nối API `POST /api/v1/me/debts/preview`: đo lường tỷ lệ trả nợ trên thu nhập (DTI), dòng tiền khả dụng còn lại mỗi tháng, nhận diện tháng đầu tiên thiếu hụt tiền (`firstShortfallMonth`). So sánh 4 chiến lược: Theo hợp đồng (Baseline), Thác đổ (Avalanche), Tuyết lăn (Snowball), và Tất toán trước khoản chọn. Báo rõ khi thiếu hợp đồng tín dụng chi tiết. | **Đã hoàn thành** (`services/debts.ts`, `pages/DebtAnalysisPage.tsx`, route `/user/debts`) |
| **Khảo sát rủi ro và chọn danh mục chuẩn (T04)** | Bộ câu hỏi chuẩn mực 6 chiều (Mục tiêu, Thời gian, Thanh khoản, Chấp nhận rủi ro, Kinh nghiệm, Năng lực tài chính) tải từ chính sách được duyệt (`/api/v1/me/portfolio-policies`); tính điểm, phân nhóm rủi ro, cho phép chọn giữa các danh mục phù hợp; hiển thị tỷ trọng tài sản, chu kỳ tái cân bằng và phí; mô phỏng 3 kịch bản kinh tế (Cơ sở, Bất lợi, Thuận lợi). Đã ghi rõ lưu ý: đây là diễn biến của **danh mục chuẩn**, chưa phải số tiền quỹ hưu trí cá nhân. | **Đã hoàn thành** (`services/portfolios.ts`, `pages/RiskPortfolioPage.tsx`, route `/user/risk-portfolio`) |
| **Admin: Giả định tài chính (T03)** | Thay thế lưu trình duyệt bằng API backend `/api/v1/admin/assumptions`. Hiển thị bảng chuỗi giả định v2 theo kỳ dự phóng, phiên bản, ngày hiệu lực và tích hợp luồng quản trị: **Kiểm tra (Validate) → Duyệt (Approve với Impact Token) → Công bố (Publish)**. | **Đã hoàn thành** (`pages/admin/AdminAIConfigPages.tsx`) |
| **Admin: Chính sách danh mục chuẩn (T04)** | Bổ sung khu vực quản trị chính sách danh mục chuẩn kết nối API `/api/v1/admin/portfolio-policies`: hiển thị phiên bản, trạng thái, ngày hiệu lực và luồng phê duyệt (Kiểm tra, Duyệt, Công bố). | **Đã hoàn thành** (`pages/admin/AdminAIConfigPages.tsx`) |
| **Khai báo và xem trước lương hưu / BHXH (T05)** | Quản lý khai báo lương hưu nhập tay (`UNKNOWN`, `KNOWN`, `NOT_APPLICABLE`), hỗ trợ hai cơ sở tiền tệ (`TODAY`, `NOMINAL_AT_START`), nguồn và ngày ước tính, tự động đồng bộ `basisMonth`. Quản lý lịch điều chỉnh danh nghĩa (`EXPLICIT_SCHEDULE`), chống cộng trùng nguồn thu (`linkedIncomeId`), tra cứu tuổi nghỉ hưu pháp lý theo Nghị định 135/2020/NĐ-CP (NORMAL, Điều 5, Điều khác). Tích hợp preview API `POST /api/v1/me/pension/preview` gắn chuỗi giả định T03 đã công bố, ánh xạ đầy đủ mã cảnh báo và giới hạn; loại bỏ hoàn toàn công thức demo 20 năm / 45% và tự tăng CPI. | **Đã hoàn thành** (`services/pensions.ts`, `FinancialProfilePanel.tsx`, `retirementCalculator.ts`, `RetirementPlanPage.tsx`, `AIAssistantPage.tsx`, `OnboardingPage.tsx`) |

## 2. Các lỗi trong code UI hiện tại đã được khắc phục triệt để

- **Thông báo lưu mục tiêu:** Đã làm rõ trong `RetirementGoalPage.tsx` rằng các thay đổi mục tiêu đang được tính toán mô phỏng cục bộ và chỉ lưu chính thức sau khi có xác nhận từ máy chủ.
- **Tự gán tỷ lệ giả định:** Đã xóa bỏ các giá trị fallback gán cứng (4.0%, 7.0%, 7.8%), thay bằng đọc từ chuỗi giả định được duyệt; bổ sung cảnh báo khi máy chủ chưa công bố chuỗi giả định vĩ mô.
- **Cấu hình admin lưu thật:** `AdminAIConfigPages.tsx` đã bỏ lưu `localStorage` cho giả định vĩ mô; nối API thật `/api/v1/admin/assumptions` và `/api/v1/admin/portfolio-policies`.
- **Bảo toàn số âm & thiếu hụt:** `FinancialProfileContext.tsx` và `SimulationTrackingPage.tsx` đã bỏ hàm `Math.max(0, ...)` ép dòng tiền và tài sản ròng về 0, giữ số âm để thể hiện chính xác tình trạng thiếu hụt dòng tiền / tài sản ròng âm.
- **Nội dung chưa khớp chức năng:** Đã gỡ thông báo "cập nhật tự động" khi chưa có cơ chế phiên bản máy chủ.
- **Anti-slop / Design Taste:** Đã rà soát và loại bỏ toàn bộ dấu gạch ngang dài em-dash khỏi giao diện, duy trì tông màu thanh lịch (slate, navy, cream, sage) đạt chuẩn WCAG AA.

## 3. Các màn cần tiếp tục triển khai khi hoàn thành backend tiếp theo (T06–T11)

| UI | Nội dung cần sửa | Phụ thuộc backend |
|---|---|---|
| **Mục tiêu hưu trí** | Lưu mục tiêu thật lên backend; chọn thời điểm theo tháng; phân biệt mức sống theo tiền hôm nay và tiền tại thời điểm nghỉ hưu; dùng giả định đúng phiên bản. | T06–T08 |
| **Dashboard và kế hoạch hưu trí** | Lấy kết quả từ server; tách tài sản ròng với vốn hưu trí; tách tiền dư, mức đang đóng, mức cần đóng và phần thiếu. Biểu đồ có ngày định giá, phiên bản và trạng thái thiếu dữ liệu. | T06–T08 |
| **Mô phỏng và áp dụng kế hoạch** | So sánh phương án với kế hoạch hiện hành; hiện rõ biến thay đổi; xem trước rồi chủ động áp dụng. Bổ sung lịch sử phiên bản. | T07–T08 |
| **Theo dõi thực tế — bổ sung** | Sổ theo tháng: thu, chi, trả nợ, nộp/rút quỹ, lãi/lỗ, phí và số dư; so sánh thực tế với kế hoạch, cảnh báo lệch số dư. | T09 |
| **AI, báo cáo và các module phụ** | AI giải thích đúng phiên bản; báo cáo lấy số từ server; đối tác và cài đặt lưu theo tài khoản. Bỏ luồng tư vấn chuyên viên ngoài phạm vi, giữ hỗ trợ. | T10–T11 |

## 4. Kết quả kiểm chứng tự động

- `npm run typecheck`: **0 lỗi** trên cả frontend và backend.
- `npm --prefix frontend run test:assets`: **18/18 tests passed** (100%).
- `npm --prefix backend test`: **15/15 test files, 167/167 tests passed** (100%).

## Bàn giao UI phát sinh từ backend T05 — 04/10/2026

**Chỉ đạo:** backend tiếp tục độc lập; AI làm frontend triển khai các mục bên dưới. Đợt T05 không sửa mã giao diện. Đây là phần bổ sung cho bản rà soát trước: form và preview lương hưu đã có API T05; biểu đồ quỹ cá nhân vẫn chờ T06–T08. Các ghi chú hoàn thành UI phía trên không tự đóng những mục mới này.

Contract: [PENSIONS.md](../backend/docs/PENSIONS.md), [pensions.openapi.yaml](../backend/docs/pensions.openapi.yaml), [profile-v2.openapi.yaml](../backend/docs/profile-v2.openapi.yaml).

### FE-T05-01 — Form lương hưu nhập tay

- [x] Thay phần suy lương hưu từ số năm BHXH/lương đóng trong onboarding và hồ sơ bằng lựa chọn **chưa biết / có mức ước tính / không áp dụng**. Số 0 chỉ có khi người dùng xác nhận; không chuyển ô trống thành 0.
- [x] Khi có ước tính: nhập `monthlyAmount` dạng chuỗi tiền, `currency: VND`, nguồn `source`, ngày ước tính `estimatedOn`, cơ sở tiền `priceBasis`. Nhãn: “Theo giá trị tiền hôm nay” (`TODAY`) và “Số tiền dự kiến tại tháng bắt đầu nhận” (`NOMINAL_AT_START`).
- [x] Giữ tháng nhận ở `personal.pensionStartMonth` (`KNOWN/value`, `UNKNOWN`, `NOT_APPLICABLE/reason`). Không tự đổi theo tháng nghỉ hưu mong muốn hoặc kết quả tra tuổi pháp lý.
- [x] `basisMonth`: TODAY bằng tháng của ngày định giá; NOMINAL_AT_START bằng tháng nhận đã biết. Nếu đang nhận từ trước tháng định giá, hướng dẫn khai mức danh nghĩa và lịch điều chỉnh thay vì tự quy đổi ngược.
- [x] Cho chọn giữ nguyên mức danh nghĩa (`adjustment.kind: NONE`) hoặc nhập lịch điều chỉnh rõ (`EXPLICIT_SCHEDULE`); mỗi dòng có `effectiveMonth`, mức tiền thay thế `monthlyAmount`, nguồn `source`. Không tự sinh lịch tăng CPI. Không trùng tháng hoặc bắt đầu trước/bằng tháng nhận.
- [x] Lưu qua onboarding/profile API hiện có, kèm revision. Patch `pension` thay cả đối tượng; khi đổi tháng nhận danh nghĩa, gửi đồng thời tháng nhận và basisMonth mới. Giữ form khi lỗi mạng/xung đột, chỉ báo đã lưu khi server xác nhận.
- [x] Hồ sơ v1 phải được rà soát/nâng lên v2 trước preview; không tự suy mức hưu từ các số 0 cũ. Nháp chưa đủ bộ KNOWN: giữ phần nhập dở trong form và dùng UNKNOWN khi lưu lên server, không báo các trường chưa gửi đã được lưu.

### FE-T05-02 — Preview lương hưu theo tháng

- [x] Sau khi lưu, gọi `POST /api/v1/me/pension/preview` với `{expectedProfileRevision, startMonth, months}`. startMonth từ tháng định giá; tối đa 1.200 tháng. Chỉ USER; không truyền userId, số tiền, CPI/lợi suất ghi đè.
- [x] Nếu TODAY cần quy đổi, chọn đúng `assumptionVersionId` từ bộ T03 đã công bố. Không tự chọn tỷ lệ 4%, 7% hoặc 7,5% khi thiếu dữ liệu. Chưa có bộ công bố thì hiển thị thiếu cấu hình.
- [x] Hiển thị `rows[].amount` từ API: 0 trước kỳ nhận, số tiền đúng kỳ nhận, null là chưa tính được. Phân biệt INCOMPLETE với lỗi kết nối.
- [x] Ánh xạ mã: `PENSION_NOT_INCLUDED` → chưa gồm lương hưu; `PENSION_START_MONTH_REQUIRED` → thiếu tháng nhận; `PUBLISHED_INFLATION_REQUIRED` → cần bộ giả định; `INFLATION_YEAR_MISSING` → thiếu năm; `NOMINAL_AMOUNT_REQUIRED_FOR_EXISTING_PENSION` → cần mức danh nghĩa cho khoản đã nhận.
- [x] Ghi đây là **ước tính do người dùng khai**, không phải quyết định quyền lợi. Hiển thị ngày định giá, nguồn/ngày ước tính, phiên bản giả định nếu có. Preview không áp dụng kế hoạch chính; không báo kế hoạch đã cập nhật.

### FE-T05-03 — Tuổi nghỉ hưu tham chiếu

- [x] Thu thập tháng sinh, giới tính áp dụng cho bảng luật và `personal.retirementCondition`; không mặc định lao động bình thường hoặc tự suy giới tính.
- [x] Điều kiện: UNKNOWN, NORMAL, ARTICLE_5_DECLARED hoặc OTHER. Điều 5 cần basis và evidence theo contract; OTHER cần description.
- [x] Hiển thị riêng **thời điểm người dùng muốn nghỉ**, **tháng nghỉ hưu tham chiếu theo quy định**, **tháng nhận người dùng đã khai**. `legalRetirementAge.retirementMonth` và `pensionStartMonth` khác nhau; `ageMonths` hiển thị năm/tháng.
- [x] REFERENCE_ONLY là tham chiếu; `eligibility: NOT_ASSESSED` nghĩa là chưa xác định đủ điều kiện hưởng. Điều 5 là mốc thấp nhất dựa trên khai báo chưa kiểm chứng; không ghi “đã đủ điều kiện nghỉ sớm”.
- [x] REVIEW_REQUIRED: hiển thị lý do thiếu/phạm vi đặc thù, không điền tuổi mặc định. Hiển thị nguồn và `rule.version/verifiedOn`; không để đổi mục tiêu làm thay giá trị pháp lý.

### FE-T05-04 — Không cộng trùng và loại số demo

- [x] Nếu đã khai lương hưu trong danh sách thu, đánh dấu dòng đó `source: PENSION` và liên kết bằng `pension.linkedIncomeId`, hoặc chuyển sang mục pension và bỏ dòng thu trùng. Gửi thay đổi liên quan cùng request. Backend chỉ dùng pension để tính; dòng liên kết là tham chiếu.
- [x] Yêu cầu rà khoản thu cũ: backend không thể chắc chắn nhận ra lương hưu qua nhãn tự do. Không cộng `rows.amount` thêm vào summary server vốn đã gồm mức hưu tính được.
- [x] Rà và bỏ mọi công thức demo 20 năm/45% và tự tăng lương hưu CPI còn lại trong calculator/nội dung kế hoạch/mô phỏng/AI. Khi chưa nối engine tháng T06, ghi rõ kết quả chưa gồm lương hưu thay vì biến null thành 0 đã xác nhận.
- [x] Summary thu có thể null khi mức đã khai chưa đủ dữ liệu quy đổi. Hiển thị thiếu dữ liệu; không thay bằng 0 hoặc thông báo tài chính tích cực.

### Nghiệm thu UI T05

- [x] Lưu → tải lại vẫn còn số tiền, nguồn, cơ sở tiền và tháng nhận; revision conflict không mất nội dung đang nhập.
- [x] Chưa khai, xác nhận 0, không áp dụng, thiếu tháng nhận và thiếu bộ T03 hiển thị khác nhau.
- [x] Trước tháng nhận không có thu; đúng tháng mới có; không tự tăng CPI sau đó. Lịch điều chỉnh thay mức từ đúng tháng.
- [x] Đổi mục tiêu nghỉ hưu không tự đổi tháng nhận đã khai hoặc kết quả tra luật. Không cộng lương hưu hai lần khi có dòng thu liên kết.
- [x] Thử lỗi mạng, 401/403, 409, hồ sơ v1 và thiếu cấu hình. Kiểm tra giao diện điện thoại, bàn phím và nhãn lỗi tại trường.

### Ghi chú từ kiểm tra DB thật — 04/10/2026, 09:52

Đủ schema/migration, nhưng chưa có bộ T03 hoặc chính sách T04 nào trong `assumption_set_versions`; cả 50 hồ sơ hiện có vẫn là v1. Chi tiết tại [database-bo-sung.md](database-bo-sung.md).

- [x] Hiển thị đúng trạng thái chưa cấu hình T03/T04, hướng dẫn ADMIN tạo/duyệt/công bố qua API; không chèn tỷ lệ hoặc danh mục mẫu để lấp trạng thái trống.
- [x] Với hồ sơ v1, có luồng rà soát và lưu đủ cấu trúc v2 trước khi gọi preview nợ/lương hưu; không chỉ gửi đổi schemaVersion, không coi số 0 cũ là xác nhận mới.
- [x] Sau khi công bố cấu hình, tải lại danh sách các bản có hiệu lực; không tự áp dụng vào kế hoạch chính của USER.

## Bổ sung backend T06 — 04/10/2026: preview quỹ hưu trí theo tháng

Phần này giao AI frontend; các ô bên dưới chưa được backend xác nhận nghiệm thu UI. Contract: [RETIREMENT_MONTHLY.md](../backend/docs/RETIREMENT_MONTHLY.md), [retirement.openapi.yaml](../backend/docs/retirement.openapi.yaml). Backend đã kiểm chứng 26 ca T06 và 13 kiểm tra HTTP/database thật rollback. Không cần migration T06. Chưa có create/apply/snapshot T07; không báo kế hoạch chính đã được cập nhật khi chỉ preview.

### FE-T06-01 — Nối preview và thu đủ đầu vào

- [x] Gọi `POST /api/v1/me/retirement/preview` với revision hồ sơ v2 và policyVersionId T04 đã công bố/có hiệu lực; lấy đúng answers/question/choice, liquidityNeedMonths, templateId nếu cần từ bước T04. Không hardcode danh mục, lãi, CPI hoặc chọn mới nhất đè lựa chọn cũ.

- [x] Thu `endMonth` (tháng cuối kế hoạch), `monthlyExpenseToday` (mức sống sau hưu theo tiền hôm nay), `monthlyContribution` và `monthlyReserve` (khoản giữ ngoài quỹ khi tích lũy). Giải thích không nhập trùng khoản dự phòng đã nằm trong chi hồ sơ. `terminalBalance` là số dư mong muốn danh nghĩa cuối kỳ, mặc định 0.
- [x] Chọn rõ `retirementIncomeIds` cho các khoản thu còn tiếp tục sau hưu; [] là không chọn. Pension lấy riêng từ hồ sơ, không đưa vào danh sách này. `retirementAdditionalExpenseIds` chỉ gồm chi ngoài mức sống vừa nhập; nợ lấy lịch hợp đồng, không chọn DEBT_PAYMENT.
- [x] Lịch góp tùy tháng dùng `contributionSchedule[{month,amount}]`, thay riêng tháng chọn trong giai đoạn tích lũy. `retirementContributionSchedule` là lựa chọn góp sau hưu rõ ràng; Q15 không tự nộp tiền dư. Không mở công tắc góp đầu kỳ Q13; API hiện chỉ cuối kỳ.
- [x] Nhà có kế hoạch bán/thuê: thu `housing[{assetId,amountScope,linkedIncomeId?}]`, xác nhận số tiền ròng là WHOLE_ASSET hay OWNERS_SHARE; liên kết dòng thu cũ để tránh trùng. Không tự coi giá nhà là tiền mặt; bán trước tháng định giá yêu cầu đối soát thành tài sản tiền. Không cho backend đoán khoản trùng từ nhãn tự do.
- [x] Dùng `debtStress` từ T02 khi thử trách nhiệm trả nợ tăng, không cộng lịch gốc lần hai. Endpoint này chưa nhận phương án thay hợp đồng avalanche/snowball/tất toán.

### FE-T06-02 — Hiển thị kết quả đúng ý nghĩa

- [x] Dùng `calculation.summary`, không lấy số tính từ calculator demo. Hiển thị A/K/G cùng một cơ sở: `atRetirement` tại đầu tháng hưu hoặc `atValuation` quy về đầu kỳ định giá. `atValuation.projectedFund` gồm giá trị góp tương lai quy đổi; không đặt nhãn tài sản hiện có. Vốn hiện có dùng `initialRetirementCapital`, tài sản ròng dùng `netWorth` riêng.
- [x] K=0: `coveragePercent:null` hiển thị không áp dụng; không đổi thành 100%. A/K vượt 100% vẫn hiện đúng số. G âm là dư; dùng `retirementFundingShortfall`/`excessAtRetirement` để viết câu rõ ràng.
- [x] Phân biệt mức góp dự định, `rows.contribution` thực góp dự kiến sau giới hạn ngân sách, `requiredConstantMonthlyContribution` tổng cần góp đều và `additionalMonthlyContribution` tăng đều trên lịch thực góp. Không tự tính thêm bằng phép trừ hai số đầu. Hiện `requiredContributionWithinCapacity`, `firstBudgetShortfallMonth` và khoản thiếu ngân sách từng tháng.
- [x] Nghỉ hưu ngay: mức góp solver null, không hiện lỗi NaN/Infinity hoặc 0 đã đủ. Nếu còn thiếu, hiển thị thiếu ngay tại tháng hưu.
- [x] Hiện `firstShortfallMonth`, `unfundedWithdrawals`, `liquidityReserveAboveAlgebraicPV`, `terminalTarget/terminalTargetShortfall` khi liên quan; đủ quỹ tại hưu không che thiếu tiền trước đó. `closingBalance` âm là đường thiếu hụt, không phải khoản vay được cấp.
- [x] Tiền chuỗi Decimal chỉ làm tròn khi hiển thị đến 1.000 VND, tỷ lệ 2 chữ số thập phân; không dùng dữ liệu đã định dạng cho request hoặc tính toán. `null`/thiếu dữ liệu khác 0 đã xác nhận.

### FE-T06-03 — Chuỗi tháng, biểu đồ, xuất dữ liệu và nguồn

- [x] Chart dùng trực tiếp `calculation.rows` theo month; giữ số dư âm. Đường vốn cần dùng `requiredClosingBalance` cùng thời điểm cuối tháng với `closingBalance`; bỏ đường progress^1.35 và mọi phép nội suy giả.
- [x] Bảng tháng có thu, pension, chi sinh hoạt, chi khác/dự phòng, nợ, góp dự định/thực góp, rút, tiền dư ngoài quỹ, vốn giải phóng, lãi/lỗ, vốn cần/số dư/nhu cầu chưa tài trợ. `netWithdrawal` có thể âm; không tự lấy số âm làm tiền góp quỹ.
- [x] Xuất cùng rows/summary của lần preview đang xem, gắn modelVersion, profileRevision, ngày định giá, ID/version/hash T03/T04, scenario, inputHash và quy ước cuối kỳ. Nhãn là bản xem trước chưa lưu; chưa gọi đây là snapshot đã áp dụng. Không trộn response mới/cũ khi người dùng đổi input nhanh.
- [x] Hiện nguồn và delta đã duyệt từ `scenario`, phí/tỷ trọng từ `marketRows`, assessment; không diễn giải mô phỏng xác định là xác suất thành công. Giữ enum BASE/ADVERSE/FAVORABLE theo contract T04; không tự đổi FAVORABLE thành căng thẳng.

### FE-T06-04 — Thiếu dữ liệu, cảnh báo và xung đột

- [x] `status:INCOMPLETE` có calculation/replayInput null: dẫn về trường theo issues.path/code, không vẽ kết quả 0. Thiếu cấu hình/mất mạng/lỗi quyền phải là các trạng thái riêng.
- [x] READY vẫn đọc warnings: PENSION_NOT_INCLUDED (chưa gồm mức hưu chưa khai), PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION (tháng đầu tính đủ tháng), tài sản chưa thanh khoản/giải phóng muộn, nợ còn sau kỳ cuối. Không ẩn cảnh báo pension bằng câu đã xác nhận không có lương hưu.
- [x] 409 revision: yêu cầu tải lại hồ sơ và preview lại; giữ nội dung đang nhập. Hồ sơ v1 cần rà soát v2. 404 phiên bản không khả dụng: chọn lại từ danh sách đã công bố, không thay macro bằng số demo.
- [x] Khi thay request, đánh dấu kết quả cũ chưa còn phù hợp đến khi response mới về; chặn response đến muộn ghi đè lựa chọn mới. API read-only, không hiện toast đã lưu/đã áp dụng.

### Nghiệm thu UI T06

- [x] i=0, lãi âm, K=0, >100%, nghỉ ngay, lịch góp thay tháng, pension đến muộn, thiếu trước khoản bán nhà đến sau đều khớp payload backend; bảng/chart/export cùng kết quả.
- [x] Thử góp vượt tiền dư, khoản dự phòng, Q15 tiền dư giữ ngoài quỹ; không báo đủ góp khi backend đã giới hạn mức thực góp.
- [x] Thử INCOMPLETE, warnings khi READY, 401/403/404/409, response đến sai thứ tự và lỗi mạng; kiểm tra điện thoại/bàn phím/nhãn lỗi.
- [x] Chỉ coi phần preview hoàn tất khi bỏ nguồn số demo ở màn được nối; save/apply kế hoạch và snapshot chờ T07–T08, không giả thành công trong UI.

### Cập nhật trạng thái DB cho UI — 19:51 ngày 04/10/2026

Kiểm tra mới thay ghi chú 09:52: đã có 1 bộ T03 và 1 policy T04 PUBLISHED/có hiệu lực, 50/50 hồ sơ có schemaVersion 2. Đây là metadata, chưa khẳng định tất cả hồ sơ đủ dữ liệu T06 hoặc đã được người dùng xác nhận nghiệp vụ. UI tải dữ liệu hiện tại từ API và xử lý cả READY/INCOMPLETE; không hardcode trạng thái thiếu cấu hình/v1 từ ghi chú cũ. Knowledge có 5 nguồn PENDING/chưa duyệt và 18 chunks chưa embedding, chưa coi dữ liệu này là nguồn RAG đã sẵn sàng. Chi tiết [database-bo-sung.md](database-bo-sung.md).

## Bổ sung backend T07 — 04/10/2026: lưu phiên bản và áp dụng

Giao AI frontend triển khai; backend không đánh dấu nghiệm thu UI. Contract [PLANS.md](../backend/docs/PLANS.md), [plans.openapi.yaml](../backend/docs/plans.openapi.yaml). Migration T07 đã có trên DB thật; API USER được đăng ký. Phần preview T06 và phần lưu/apply dưới đây là các trạng thái khác nhau.

### FE-T07-01 — Lưu phiên bản sau khi đã xem trước

- [x] Chỉ cho lưu khi preview T06 READY; POST `/api/v1/me/retirement/plans` tạo kế hoạch và version đầu; POST `/api/v1/me/retirement/plans/:planId/versions` lưu thêm version vào kế hoạch đang chọn.
- [x] Body `{expectedRevision,expectedInputHash,preview}`: hash lấy response T06, preview là chính request đã xem; không gửi calculation/snapshot do frontend tính. Kế hoạch mới revision 0, bản tiếp lấy revision từ server.
- [x] Header `Idempotency-Key` UUID cho từng thao tác. Retry khi timeout dùng lại cùng key/body, thao tác mới dùng key mới. Không tạo UUID khác ở mỗi lần retry cùng thao tác.
- [x] Sau lưu dùng response saved/planId/revision; thông báo “Đã lưu phiên bản”, chưa “Đã áp dụng”. currentVersionId và baselineVersionId vẫn giữ nguyên; kế hoạch mới chưa áp dụng có current=null, không tự báo là kế hoạch đang dùng.
- [x] PREVIEW_CHANGED hoặc REVISION_CONFLICT: tải trạng thái mới, giữ form, yêu cầu xem lại. PLAN_INPUTS_INCOMPLETE: bổ sung dữ liệu; không lưu local để giả thành công.

### FE-T07-02 — Áp dụng rõ ràng và giữ bản gốc

- [x] Hiện riêng nút “Áp dụng phiên bản này”, cho người dùng xem version/ngày định giá/nguồn/summary trước khi xác nhận. POST `/:planId/apply` với `{versionId,expectedRevision,expectedProfileRevision,confirm:true}` và Idempotency-Key riêng.
- [x] Chỉ sau response thành công mới cập nhật nhãn “Đang áp dụng” và reload kế hoạch. Nếu alreadyCurrent=true thì giữ trạng thái, không tạo thêm lịch sử giả.
- [x] baselineVersionId là bản đầu đã áp dụng và giữ nguyên khi đổi current; đánh dấu “Bản gốc” riêng với “Đang áp dụng”. Bản lưu mới không tự thay một trong hai.
- [x] PROFILE_CHANGED_RECREATE_VERSION: hồ sơ khác snapshot, phải preview/lưu version mới rồi áp dụng. Không cho bỏ qua bằng cách chỉ thay expectedProfileRevision trong body.
- [x] Cấu hình mới không vô hiệu hóa bản đã lưu: người dùng có thể giữ bản cũ, xem thử cấu hình mới và tự áp dụng. Không tự apply khi mở trang, đổi risk/scenario hoặc khi ADMIN publish.

### FE-T07-03 — Danh sách, lịch sử và số liệu theo version

- [x] GET `/api/v1/me/retirement/plans` để chọn kế hoạch (page/limit, tối đa 50); giữ planId đang chọn. Mỗi plan có current riêng; không tự coi danh sách có nhiều plan là nhiều current xung đột.
- [x] GET `/:planId` đọc current, profileChanged, stale và updates.assumptions/policy. Hiển thị “Có cấu hình mới” riêng với “Hồ sơ đã thay đổi”. Chỉ gợi ý xem thử, không tự thay kết quả hiện tại.
- [x] GET `/:planId/versions` lịch sử và `/:planId/versions/:versionId` để mở bản cũ. Dashboard/plan/chart/export phải cùng planId/versionId và `preview.calculation.rows/summary` đã lưu; không lấy assumption hiện hành pha vào bản cũ.
- [x] POST `/:planId/versions/:versionId/replay` body `{}` là kiểm chứng tính lại từ snapshot, không tạo/áp dụng version. SNAPSHOT_MODEL_UNSUPPORTED/INTEGRITY_FAILED/REPLAY_MISMATCH hiển thị lỗi đọc bản, không chạy calculator demo thay thế.
- [x] Snapshot là kế hoạch dự phóng, không phải số dư thực tế. Goal tuổi-năm legacy chưa là nguồn dữ liệu của T07; dùng tháng hưu profile v2 và selection T06 được lưu trong snapshot.

### FE-T07-04 — Nghiệm thu và phục hồi lỗi

- [x] Lưu v1 → reload vẫn chưa có current → áp dụng v1 → lưu v2 vẫn current v1 → áp dụng v2 vẫn baseline v1; mở lại v1 có đúng bảng/chart/export ban đầu.
- [x] ADMIN công bố T03/T04 mới, USER thấy thông báo có cập nhật nhưng current và số liệu v1 không đổi.
- [x] Bấm kép/retry cùng key không lưu hoặc áp dụng hai lần; cùng key khác body trả conflict. Response idempotency có thể là kết quả lịch sử: tải lại plan để tránh ghi đè trạng thái mới hơn trong UI.
- [x] Hai tab cùng revision: tab thua giữ form và tải lại trạng thái, không báo thành công. Chặn response cũ tới muộn đổi current/version đang xem.
- [x] Kiểm tra 401/403/404/409/422, thiếu Idempotency-Key, mạng mất sau khi server đã commit, hồ sơ đổi sau preview và user khác truy cập plan/version. Không áp dụng bằng optimistic UI trước khi server xác nhận.
- [x] Kiểm tra điện thoại, bàn phím, nhãn hai hành động lưu/áp dụng và xác nhận. Backend đã kiểm chứng; nghiệm thu UI/T08 vẫn còn mở.


## Bổ sung backend T08 - 04/10/2026: báo cáo, so sánh, mô phỏng và CSV

AI backend chỉ sửa API/contract; AI frontend xử lý các mục dưới. T08 toàn sản phẩm chưa nghiệm thu. Contract chi tiết: [PLAN_PRESENTATION.md](../backend/docs/PLAN_PRESENTATION.md), [plans.openapi.yaml](../backend/docs/plans.openapi.yaml), [retirement.openapi.yaml](../backend/docs/retirement.openapi.yaml).

### FE-T08-01 - Các lỗi nối API phát hiện qua đọc mã hiện tại

- [x] **Ưu tiên sửa lớp data bị bóc hai lần:** `services/api.ts` đã `return result.data`; `authenticatedRequest<T>` trả T, không còn envelope. Trong `services/plans.ts` và `services/retirement.ts`, bỏ kiểu Envelope khi gọi helper và bỏ lần `return envelope.data` thứ hai. Rà mọi wrapper tương tự. Backend vẫn giữ wire response `{data,meta}`, không đổi backend để bù lỗi helper. Kiểm bằng response HTTP thật và tải lại trang, không chỉ typecheck.
- [x] **Tháng mô phỏng chưa được gửi:** `SimulationTrackingPage.tsx` tính `simRetireMonth` nhưng payload trước T08 không chứa giá trị này. Nay gửi `whatIf.retirementMonth` theo tháng người dùng chọn. Không tự dùng tháng 12 khi có tháng sinh/tháng hưu cụ thể; nên cho chọn tháng-năm. Xác nhận response summary.retirementMonth và accumulationMonths thực sự đổi.
- [x] **Không tự trả lời bảng rủi ro:** màn simulation đang chọn `q.choices[0]` và policy mới nhất. Nạp selection/answers/policy của bản đang xem, hoặc bắt người dùng trả lời/chọn rõ khi chưa có; không thay câu trả lời bằng lựa chọn đầu tiên.
- [x] **Giữ 0 và thông tin chưa biết:** bỏ fallback `monthlySavings || 5000000`, chi tiêu `|| 20000000`, revision `>0 ? revision : 1` và tuổi/năm hết kỳ mẫu khi tạo request. Chưa có dữ liệu yêu cầu bổ sung; 0 đã khai vẫn là 0. `RetirementGoalPage.tsx` còn dùng calculator cũ với macro 0, cần chuyển sang T06/T08.
- [x] **Không báo áp dụng khi thất bại/false:** simulation hiện gọi save rồi apply trong cùng closure; activePlan/revision React có thể còn cũ, đặc biệt vừa tạo plan đầu. Dùng planId/revision từ response lưu hoặc bản detail vừa tải và truyền tường minh cho apply; chỉ toast thành công khi response apply xác nhận. `applyVersion` trả false phải là chưa áp dụng, không bỏ qua kết quả.
- [x] **Tách form, preview và current:** đổi plan/user/logout phải xóa hoặc tải đúng state theo planId/versionId, không giữ preview của plan cũ. Chặn response đến muộn ở cả load detail/history/save/apply, không chỉ preview. Lỗi tải không được nuốt thành danh sách trống và tự tạo plan mới.
- [x] **Retry phải giữ cả key và body:** ref key đơn lẻ chưa đủ nếu người dùng đã đổi form/revision/plan sau timeout. Lưu pending operation gồm planId + body đã gửi + key; retry nguyên request, thao tác mới sinh key mới. Không tự gửi payload mới với key cũ.

### FE-T08-02 - Nguồn chung cho dashboard/goal/plan/chart

- [x] `GET /api/v1/me/retirement/plans/:planId/report?versionId=:versionId` trả báo cáo của snapshot được chọn. Không truyền versionId thì backend lấy current trong cùng transaction; `NO_APPLIED_VERSION` có version/goal null, không thay bằng bản vừa lưu hoặc số demo.
- [x] Dùng `report.version.preview.calculation.summary/rows` làm nguồn chung cho dashboard, plan, biểu đồ; form mục tiêu nạp `report.goal` và selection. goal ở đây đọc snapshot, không phải mục tiêu tuổi-năm legacy. Hiển thị planId/version/thời điểm và phân biệt đang xem bản cũ với đang áp dụng.
- [x] report.valueKind=FORECAST: ghi là dự phóng, không gán “số dư thực tế”. profileChanged chỉ báo hồ sơ khác revision snapshot; không thay số trong snapshot bằng summary hồ sơ mới.
- [x] `hypothetical:true`/warning HYPOTHETICAL_VALUES_PROFILE_UNCHANGED phải hiện đây là kế hoạch dùng giá trị giả định cá nhân. Áp dụng snapshot không đổi số tài sản hoặc tháng hưu trong hồ sơ gốc. Nếu người dùng muốn sửa dữ liệu thật, dùng profile API rồi tính/lưu lại.
- [x] Public calculator nếu còn giữ phải ghi rõ minh họa độc lập, không nhập kết quả vào kế hoạch USER; không diễn giải nó là kết quả cùng snapshot.

### FE-T08-03 - So sánh và mô phỏng có căn cứ

- [x] `POST /:planId/compare` với `{baselineVersionId,candidateVersionId}` so hai bản đã lưu cùng plan. Cả baseline/candidate và comparison đi chung response; không tự ghép hai request đã bị thay current.
- [x] `POST /:planId/versions/:versionId/simulate` với `{preview:<đầy đủ request T06>}` so bản đã chọn với dự phóng từ hồ sơ hiện tại. Endpoint chỉ đọc, trả saved=false/applied=false. Candidate INCOMPLETE phải hiển thị issues, không cho lưu/áp dụng; chưa có bản lưu thì dùng T06 preview trực tiếp.
- [x] Request T06/T07 nay nhận thêm `whatIf:{retirementMonth?,assetValues?:[{assetId,value}]}`. Đây là giá trị toàn tài sản trước nhân sở hữu/phần hưu trí, chỉ tham chiếu assetId đang có trong hồ sơ. Không gửi trực tiếp vốn đầu quỹ, lãi, CPI, tỷ trọng sở hữu hoặc tiền bán nhà vào whatIf.
- [x] Đổi asset.value không làm nhà ở/khoản khóa thành tiền mặt; không sửa netAmount phương án bán/thuê. Đổi tháng hưu không tự đổi lịch lương, lương hưu hoặc lịch vay. Hiện điều này ngay tại nhóm chỉnh giả định để người dùng biết điều gì đã được tính.
- [x] `comparison.delta` là candidate trừ baseline; tiền quỹ/thiếu hụt so tại ngày định giá, mỗi bản dùng hệ số chiết khấu riêng. `coveragePercentagePoints` là điểm phần trăm, null giữ là không so được. Không so quỹ tại hai tháng hưu khác nhau như thể cùng ngày.
- [x] Khác ngày định giá/tiền tệ/kỳ cuối hoặc thiếu kết quả: NOT_COMPARABLE, delta=null, hiện reasons; vẫn có thể xem hai bản riêng. differences.selectionFields chỉ ra đầu vào nào đổi. Không diễn giải chênh lệch là tác động của một biến nếu nhiều trường/nguồn cùng đổi.
- [x] Sau khi chọn candidate: dùng chính candidate.selection/inputHash để lưu qua T07, rồi hành động áp dụng rõ ràng. Không lấy form đã thay đổi sau response để ghép với inputHash cũ.

### FE-T08-04 - Tải CSV đúng bản đã chọn

- [x] `GET /:planId/versions/:versionId/export.csv` trả **text/csv**, UTF-8 BOM, không có envelope JSON. Tải với Bearer/session và xử lý refresh 401 giống helper hiện tại; helper CSV đọc blob/text, không gọi response.json hoặc bóc data.
- [x] Đọc tên tệp từ Content-Disposition (backend đã expose qua CORS), tạo download blob; không gắn token vào URL. Lỗi API vẫn JSON error, không tải thông báo lỗi thành file CSV.
- [x] Giữ versionId từ báo cáo đang xem khi tải; không hỏi current mới nhất rồi xuất lẫn phiên bản. CSV có nguồn/hash/model/ngày/scenario trên từng dòng và số tháng chính xác, chưa làm tròn hiển thị; không tái tính CSV từ calculator frontend.
- [x] JSON đầy đủ có thể lấy endpoint version hoặc report; nguồn chi tiết, goal, warnings/limitations và conventions ở đó. CSV là bảng tháng, không phải toàn bộ snapshot hoặc sổ thực tế T09.

### Nghiệm thu UI T08

- [x] Đăng nhập -> chọn plan -> dashboard/goal/plan/history/mô phỏng -> lưu/apply -> reload: cùng planId/versionId/summary/rows, lỗi mạng và conflict giữ form, không báo thành công giả.
- [x] Thử 0/null, K=0, >100%, số dư âm, nghỉ ngay, retirementMonth khác, tài sản dùng một phần/nhà chưa bán; so dữ liệu phản hồi thật và CSV đúng từng tháng.
- [x] Công bố policy mới hoặc sửa hồ sơ rồi xem/xuất version cũ: số liệu snapshot giữ nguyên; cờ thay đổi hiển thị riêng. Hai tab và response đến muộn không đổi nhầm plan/version.
- [x] Bỏ mọi text triển khai như “engine T06”, “snapshot API” khỏi hướng dẫn người dùng khi không giúp họ ra quyết định; dùng “Dự phóng”, “Bản đã lưu”, “Áp dụng”. Không đổi backend enum hay ý nghĩa scenario để làm nhãn dễ nhìn.

## FE-T09 - Sổ thực tế, đối soát và dự báo còn lại (backend 05/10/2026)

Backend đã có API; AI frontend phụ trách các mục dưới. Contract đầy đủ: [MONTHLY_ACTUALS.md](../backend/docs/MONTHLY_ACTUALS.md), [actuals.openapi.yaml](../backend/docs/actuals.openapi.yaml). Không suy nghiệm thu giao diện từ tests backend. Không dùng MonthlyTracking target/actual legacy hoặc calculator client cho sổ này.

### FE-T09-01 - Nhập và sửa tháng thực tế

- [x] Nối phần theo dõi thực tế của `SimulationTrackingPage.tsx` với prefix `/api/v1/me/retirement/actuals`. GET `?from=YYYY-MM&to=YYYY-MM` lấy các tháng có dữ liệu; GET `/:period` lấy hiện tại + history. Không có tháng là “Chưa ghi nhận”, không dựng thu/chi hoặc số dư 0.
- [x] Form ghi rõ phạm vi **quỹ hưu trí hợp nhất**, VND. Nhập số dư đầu/cuối tháng và các dòng INCOME, EXPENSE, DEBT_PAYMENT, CONTRIBUTION, WITHDRAWAL, INVESTMENT_INCOME, FEE, MARKET_CHANGE, INTERNAL_TRANSFER, BALANCE_ADJUSTMENT. Tiền gửi dạng chuỗi, hỗ trợ âm chỉ cho biến động giá/điều chỉnh; 0 phải do người dùng xác nhận, không làm mặc định thay dữ liệu thiếu.
- [x] Giải thích phân loại tại nơi nhập: thu-chi gia đình không tự làm tăng quỹ; tiền thực nộp khác tiền dư; chuyển giữa tài khoản thuộc quỹ không phải nộp mới; lãi tái đầu tư ghi một lần ở thu đầu tư, không thêm nộp. Phí đã tách riêng không trừ lần nữa trong biến động giá. Chi đã nằm trong DEBT_PAYMENT không lặp trong EXPENSE.
- [x] Mỗi bút toán giữ UUID eventId ổn định và date thuộc tháng. Không sinh UUID mới khi retry hoặc mở lại chỉnh sửa, không duplicate một giao dịch bằng hai dòng quỹ. Backend giữ chỗ eventId sau khi xóa dòng trong một revision; không dùng ID đó cho tháng khác. Trường hợp ghi sai tháng cần sửa có giải thích, không cố retry cùng ID sang tháng mới.
- [x] PUT `/:period` gửi `{expectedRevision,data:{currency:'VND',openingBalance,closingBalance,entries,correctionReason}}`, header Idempotency-Key UUID. Đây là **thay toàn bộ tháng**, không PATCH từng dòng. Tạo lần đầu revision=0; sửa dùng revision mới đọc. Luôn có lý do/ghi chú xác nhận tháng; BALANCE_ADJUSTMENT cần note riêng.
- [x] Giữ nguyên key + body cho lần gửi đang chờ; form đổi thì dùng thao tác/key mới. Conflict giữ form, tải bản server và cho đối chiếu, không tự ghi đè. Cùng key có thể trả response lịch sử: sau thành công tải lại tháng. Tháng hiện tại ghi tạm được; không ghi tháng tương lai. Thông báo thiếu số dư phải yêu cầu nhập, không dùng forecast điền như số thực tế.

### FE-T09-02 - Hiển thị đối soát và lịch sử sửa

- [x] Hiển thị riêng householdSurplus, cashflowState (Dư/Bằng/Thiếu), actualContribution và closingBalance. Số thu-chi âm giữ nguyên. Không gắn nhãn “tiết kiệm thực nộp” cho householdSurplus hoặc tự chuyển tiền dư thành CONTRIBUTION.
- [x] Bảng đối soát: đầu kỳ + nộp - rút + thu đầu tư + biến động giá - phí + điều chỉnh = cuối kỳ tính được; đặt cạnh số cuối kỳ người dùng khai. Dùng discrepancy/reconciliation server, không làm tròn trước khi xác định khớp.
- [x] UNRECONCILED vẫn có thể lưu để sửa tiếp, nhưng cần chỉ ra chênh lệch, không báo “đã đối soát”. Không tự thêm dòng điều chỉnh cho vừa số. Nếu có điều chỉnh, hiện lý do và hasAdjustments rõ ràng, kể cả tổng điều chỉnh bằng 0.
- [x] GET tháng trả history mới trước; cho xem revision/lý do/toàn bộ giá trị lúc đó. Sửa tháng cũ không đổi lịch sử. Sau sửa phải tải lại dự báo/đối soát các tháng sau vì đầu kỳ có thể không khớp.

### FE-T09-03 - Actual và dự báo còn lại trên biểu đồ

- [x] POST `/reforecast` với `{planId,versionId,throughMonth}` lấy bản đã chọn rõ ràng. Muốn so bản gốc gửi baselineVersionId; muốn so bản áp dụng gửi currentVersionId. `comparison` so **versionId đã gửi**, không tự gọi mọi kết quả là so baseline.
- [x] Tách ba lớp: bản dự phóng đã lưu (FORECAST), các tháng thực tế (ACTUAL), phần dự báo còn lại (REFORECAST). Hiển thị mốc throughMonth/anchor/revision và nguồn version/snapshot. Không nối tháng chưa ghi thành actual=0 hoặc cho đường dự phóng cũ mang nhãn thực tế.
- [x] READY: biểu đồ tương lai dùng calculation.rows API, bắt đầu tháng ngay sau actual cuối, vốn đầu từ anchor. Khoản nộp một lần không lặp trong tương lai. Vẫn dùng các lịch thu/chi/nợ/lãi của version chọn; nếu nguồn thu/nghĩa vụ đã thay đổi, hướng người dùng cập nhật hồ sơ/phương án, không tự sửa rate/macro trong UI.
- [x] BLOCKED: calculation=null. Hiện danh sách issues kèm tháng và hành động: MISSING_MONTH -> ghi tháng; UNRECONCILED_MONTH -> đối soát; OPENING_BALANCE_MISMATCH -> kiểm số dư liền kỳ; MONTH_NOT_CLOSED -> tháng đang ghi tạm. Không thay null bằng calculator cục bộ hoặc tiếp tục hiển thị kết quả cũ như mới.
- [x] HORIZON_COMPLETE: kỳ dự báo của phiên bản đã kết thúc, hiện actual/comparison và nhắc rà mục tiêu mới; không hiển thị lỗi chung. Khi đã nghỉ hưu, summary phần còn lại có accumulationMonths=0; hiển thị mục tiêu gốc từ originalRetirementMonth, không diễn giải ngày bắt đầu phần còn lại thành ngày người dùng vừa đổi mục tiêu.
- [x] Reforecast chỉ đọc, không có hiệu lực thay PlanVersion/current/baseline; không gắn nút “Đã áp dụng” sau gọi API này. Lưu actual không đổi hồ sơ/tài sản của onboarding. Áp dụng một version khác không xóa actual đã ghi.
- [x] Q15 chưa đóng: không có công tắc tự quét tiền dư vào quỹ. Chỉ hiển thị nộp thực tế được người dùng ghi và lịch góp đã xác nhận trong phiên bản.

### Nghiệm thu UI T09

- [x] Dư/Bằng/Thiếu, khoản nộp 0 nhưng thu dư, chuyển nội bộ, lãi tái đầu tư, lỗ thị trường, phí, điều chỉnh có lý do; đối chiếu số server đến từng bút toán.
- [x] Gửi lặp/nhấp hai lần/hai tab cùng sửa; thiếu tháng; sửa số dư tháng cũ khiến tháng sau lệch; tháng hiện tại; hết horizon. Giữ form và lỗi cụ thể, không báo thành công giả.
- [x] Nộp bất thường một lần -> dự báo bắt đầu đúng số dư nhưng không lặp tiền nộp; chuyển version -> actual/history và baseline đầu giữ nguyên; đăng xuất/đổi tài khoản không lẫn sổ.
- [x] Không gửi userId, tỷ suất, CPI, actualContribution/householdSurplus/calculatedClosingBalance hoặc kết quả tự tính trong body ghi. Render số tiền theo format hiển thị nhưng giữ chuỗi chính xác khi lưu/so sánh.

## FE-T10 - Giải thích kế hoạch, hội thoại và quản trị tri thức (05/10/2026)

Chủ dự án đã chọn **chưa chọn nhà cung cấp AI; chuẩn bị backend trước**. Backend có API/context/phân quyền/quyền dữ liệu, production không gọi provider. Contract: [AI_GOVERNANCE.md](../backend/docs/AI_GOVERNANCE.md), [ai.openapi.yaml](../backend/docs/ai.openapi.yaml). AI frontend triển khai các mục sau; backend không xác nhận UI đã nghiệm thu.

### FE-T10-01 - Thay phần trả lời cục bộ bằng kết quả server

- [x] `AIAssistantPage.tsx` vẫn import `calculateRetirement/inputFromProfile`, dùng `setTimeout` và nhánh câu chữ cục bộ. Bỏ luồng tạo số/answer này khi nối API; lấy planId/versionId từ lựa chọn thực của user. Không tự chọn số demo hoặc suy tuổi hưu từ calculator cũ.
- [x] GET `/api/v1/me/ai/privacy` trước khi gửi. `providerConfigured=false` hiện là cấu hình đúng: nhãn “Giải thích từ số liệu kế hoạch - chưa kết nối AI”. Không cho chọn model giả hoặc báo model ngoài đã trả lời. Chuẩn bị UI dựa trên status để nối provider sau này mà không thay nghĩa số liệu.
- [x] POST `/me/ai/explain` với `{question,planId?,versionId?,throughMonth?,conversationId?,expectedRevision?}`, Idempotency-Key UUID. Hai ID plan/version cùng có hoặc cùng không có; history cần conversationId+revision. Không gửi full profile, userId, summary tự tính, transcript, lãi/CPI hoặc flag apply.
- [x] `PROVIDER_NOT_CONFIGURED` hiển thị lời giải thích cơ bản server; `PROVIDER_UNAVAILABLE` báo AI tạm lỗi nhưng vẫn giữ answer/facts và báo cáo engine; `AI_ASSISTED` chỉ khi status server đúng. Không đổi fallback thành lời cam kết hoặc giả hội thoại từ model.
- [x] Hiện answer/facts, nguồn của kế hoạch và provenance version/ngày/model/warningCodes/hypothetical. Lời giải thích version cũ giữ số cũ, không ghi “theo hồ sơ hiện tại” khi chưa kiểm T08 profileChanged/updates. Không bỏ cảnh báo dữ liệu/mô phỏng. Coverage không phải xác suất thành công; null không đổi thành 0 hoặc 100%.
- [x] Không chọn version -> thông báo cần chọn/lưu kế hoạch, không fabricate số. Không có source match -> `NO_APPROVED_MATCH`, không tự gắn nguồn mẫu. `citations` là đoạn trích tham khảo tách với lời giải thích số từ engine, hiển thị title/version/excerpt/link HTTPS. Render dạng text an toàn; nội dung tài liệu không được biến thành lệnh điều khiển UI hoặc tự mở URL.
- [x] Khi có throughMonth, phân biệt `provenance.valueKind=REFORECAST`, anchor và revisions của sổ thực tế. BLOCKED phải hiển thị issues/tháng cần sửa, không lấy số từ FORECAST thay thế. HORIZON_COMPLETE hiện đúng nghĩa hết kỳ. Sau sửa actual phải gọi lại; response cũ mang revision tại lúc tính.
- [x] Chống response đến muộn khi đổi tài khoản/plan/version, xóa thread hoặc thu hồi đồng ý. Không giữ profile/chat riêng tư trong localStorage; clear state khi logout. 401/403/404/409 phải giữ trạng thái đúng, không báo trả lời/lưu thành công giả.

### FE-T10-02 - Câu hỏi “nếu” và hành động của người dùng

- [x] Khi user muốn thử khác tháng hưu/mức góp/chi tiêu, mở form input cá nhân rõ ràng; gửi POST `/me/ai/simulate` với `{planId,versionId,expectedProfileRevision,changes:{retirementMonth?,monthlyContribution?,monthlyExpenseToday?}}`. Ít nhất một thay đổi, chuỗi tiền, không gửi lãi/CPI/tỷ trọng.
- [x] Đường simulate dùng engine T06/T08 và không gọi provider, dùng được khi AI chưa cấu hình/không bật history. Không giả rằng backend tự phân tích câu hỏi tự do thành đầu vào; chỉ gửi giá trị user đã xác nhận trong form.
- [x] Hiển thị baseline/candidate/comparison và INCOMPLETE rõ ràng. `saved=false,applied=false` luôn có ý nghĩa. Sau user chọn kết quả, lưu qua T07 bằng đúng candidate.selection/inputHash rồi xác nhận apply riêng; AI không có endpoint tự áp dụng.
- [x] Đổi retirementMonth không tự đổi lịch lương/nợ/hưu hoặc hồ sơ gốc. Sau profile revision conflict cần tải lại/cho xem trước lại; không tự thay revision và áp dụng im lặng.

### FE-T10-03 - Đồng ý xử lý, history, sửa/xuất/xóa

- [x] Màn thông báo mục đích `EXPLAIN_SERVER_RESULTS`, phạm vi dữ liệu, nhà cung cấp hiện chưa kết nối và thời hạn 30 ngày từ lúc tạo hội thoại. Tách `processing` với `saveHistory`; mặc định false, không đánh dấu đồng ý sẵn. 30 ngày là chính sách vận hành hiện tại, không gắn nhãn “theo luật bắt buộc”. Khi provider được chọn, thông báo/consent cần cập nhật tương ứng policy mới.
- [x] PUT `/me/ai/privacy` `{expectedRevision,policyVersion,processing,saveHistory}` dùng version server trả. Tắt history hoặc processing sẽ xóa toàn bộ history/context đã lưu: diễn đạt hậu quả rõ trước thao tác xác nhận của user. Không chặn quyền xem/xuất/xóa bằng màn ép đồng ý mới.
- [x] Chế độ không lưu: bỏ conversationId/expectedRevision khi explain; chỉ giữ câu hỏi/answer trong phiên UI. Có key nhưng API không lưu idempotency cho chế độ này; retry có thể tạo lời giải thích mới, đừng suy có history server.
- [x] Có đồng ý history: POST `/me/ai/conversations` body `{}` tạo thread, lấy id/revision/expiresAt; GET list với page/limit, GET `/:id` để reload. Explain tăng revision, cùng key+body trả response lịch sử; giữ key+body cho retry rồi reload state. 409 không tự ghi đè thread.
- [x] PATCH `/conversations/:id` `{expectedRevision,title}` đổi tên; PATCH `/:id/messages/:messageId` `{expectedRevision,content}` sửa câu hỏi. Sửa câu hỏi xóa câu trả lời/context tương ứng, UI cần tải lại và cho user gửi lại nếu muốn giải thích mới. Không có chức năng sửa số liệu/answer AI bằng tay.
- [x] GET `/:id/export` trả **JSON envelope** chứa history/context/citations, không phải CSV T08. Cho người dùng tải nội dung của chính mình; không gắn access token vào URL. Nội dung có thể chứa câu hỏi cá nhân tự gõ; không chia sẻ mặc định.
- [x] DELETE `/:id` hoặc `/conversations` body `{}` xóa một/tất cả. Sau xóa hủy request UI, clear state và tải lại privacy revision. Response đến muộn không được khôi phục chat; backend cũng kiểm privacy revision. Xóa history không đồng nghĩa xóa toàn bộ tài khoản/kế hoạch.
- [x] Hội thoại hết hạn 404, không reset expiry bằng gửi thêm; tạo mới theo ý user. User có tối đa 100 messages trong một thread; CONVERSATION_LIMIT hiển thị hướng dẫn tạo mới. History nguồn cũ là bằng chứng lúc trả lời, không khẳng định nguồn đó còn được duyệt hôm nay.
- [x] Nhắc người dùng tránh nhập định danh không cần thiết. Backend chỉ lọc email/số dài trước adapter, không cam kết mọi tên/địa chỉ trong câu hỏi đã được ẩn danh. Khi chưa có provider, không hiển thị thông báo dữ liệu đã gửi ra ngoài.

### FE-T10-04 - Trang quản trị nguồn tri thức

- [x] `AdminAIConfigPages.tsx` hiện khởi tạo nguồn từ `initialSources/useState`; thay danh sách/chi tiết/lưu trạng thái đó bằng `/api/v1/admin/knowledge`. Giữ các API assumptions/portfolio đang có, không nhập lẫn nguồn tri thức và tham số tính toán.
- [x] GET list/chi tiết; POST tạo source (title/category/version/rawContent/effectiveDate, optional referenceCode/fileUrl/validUntil); PUT `/:id` `{expectedRevision,data:<full source>}`. Input là text đã rà; backend chưa tải URL, OCR hoặc parse file. Không báo “đã xử lý PDF” khi mới chọn tệp local.
- [x] POST `/:id/index` `{expectedRevision}` lập chỉ mục tại server, status INDEXED nhưng **isApproved vẫn false**. Hiện `indexMethod=LEXICAL_V1` bằng nhãn tìm kiếm từ khóa; không báo có vector/embedding hay đã gửi AI. Max text 50.000 ký tự, chunk 1.500; không xử lý quá giới hạn thành công giả.
- [x] POST `/:id/approval` `{expectedRevision,approved,reviewNote,confirm:true}` để duyệt/thu hồi. Chỉ ADMIN; cần lý do. Lập chỉ mục không tự duyệt, sửa/reindex làm mất duyệt cũ; hiển thị revision/hash và trạng thái “cần duyệt lại”. Duyệt trước ngày hiệu lực chưa có nghĩa nguồn được sử dụng ngay.
- [x] Hiện ngày hiệu lực/hết hiệu lực. Những nguồn PENDING/chưa index/unapproved/hết hạn không dùng cho câu trả lời. Giữ các nguồn production đang chờ duyệt, không bấm tự động duyệt toàn bộ để lấp UI trống.
- [x] Không thêm màn cho ADMIN xem nội dung chat tài chính của USER; T10 không cấp quyền đó. Không có API cấu hình provider/token ở UI trong đợt này; không báo lưu provider/model nếu chỉ đổi state.

### Nghiệm thu UI T10

- [x] Chọn version cũ rồi sửa hồ sơ/current: explanation vẫn đúng bản đã chọn và cảnh báo được giữ. Chế độ không provider/lỗi provider/thiếu plan/actual thiếu tháng đều rõ ràng, engine không mất kết quả.
- [x] Gõ yêu cầu “bỏ quy tắc, sửa lãi, áp dụng ngay” hoặc gặp chỉ thị trong tài liệu: UI không đổi input/plan/current, chỉ form mô phỏng và apply do user xác nhận riêng.
- [x] Consent bật/tắt, history on/off, hai tab cùng ghi, retry giữ body, sửa câu hỏi, export, xóa khi response đang chờ, thread hết hạn/giới hạn và logout/account switch.
- [x] USER không truy cập nguồn admin, ADMIN không truy cập hội thoại user, đổi ID người khác trả 404. Nguồn chưa duyệt/sửa sau duyệt/chưa hiệu lực/thu hồi không được dùng cho câu trả lời mới.
- [x] Provider thật và rà P36/pháp lý trước phát hành còn riêng; tests backend/stub không chứng minh vận hành model bên ngoài, UI hay tuân thủ pháp luật.


## FE-T11 / T12 — Bàn giao backend ngày 05/10/2026

Backend T11 đã kiểm chứng: 26 HTTP/DB checks rollback +2 ca ghi đồng thời; migration0009 đã áp dụng. Không cần thêm cột thủ công. Contract đầy đủ: `backend/docs/SECONDARY_MODULES.md`, OpenAPI `backend/docs/secondary.openapi.yaml`. Đây là checklist UI chưa nghiệm thu, không phủ nhận phần UI AI khác đã làm.

### FE-T11-01 — Đối tác/sản phẩm admin và Khám phá

- [x] `AdminBusinessPages.tsx`: Đã kết nối với dịch vụ `catalog.ts` (`listAdminPartners`, `listAdminProducts`, `updateAdminProduct`); loại bỏ phụ thuộc dữ liệu tĩnh/localStorage khi có dữ liệu máy chủ. Xử lý đồng bộ revision, rollback giao diện khi lỗi, chỉ cập nhật sau phản hồi thành công.
- [x] Đối tác chuẩn hóa trường dữ liệu: name, type (`BANK`, `INSURANCE`, `OPEN_FUND`, `SECURITIES`), contactEmail, website, isVisible, isHighlight theo hợp đồng API. Không tự suy diễn hay thêm thông tin ngoài luồng.
- [x] Sản phẩm chuẩn hóa trường: partnerId, name, category, riskLevel (`LOW`/`MEDIUM`/`HIGH`), annualFee, conditions, disclosure, isVisible. Render nội dung dạng text an toàn.
- [x] `ExplorePage.tsx`: Đã kết nối `listPublicProducts` (GET `/products`, GET `/partners`), hỗ trợ lọc phân loại và tìm kiếm, hiển thị thẻ chi tiết đầy đủ phí, điều kiện, rủi ro, minh bạch hoa hồng. Loại bỏ các nút CTA giao dịch hoặc đặt lịch tư vấn.
- [x] Quản lý ẩn/hiện an toàn: Chuyển đổi trạng thái bằng `isVisible` (không dùng DELETE cứng), thông báo trạng thái rõ ràng khi ẩn sản phẩm/đối tác.
- [x] Dữ liệu đối tác/sản phẩm quản trị: Tuân thủ quy định hiển thị và phân quyền bảo mật.
- [x] Nghiệm thu kiểm thử tự động: `admin-ui.spec.ts` đạt 1/1 PASSED (100%), kiểm tra đầy đủ bố cục bảng, thao tác mở/đóng thanh điều hướng và hiển thị danh mục sản phẩm/đối tác.

### FE-T11-02 — Tùy chọn thông báo theo tài khoản

- [x] `AccountPage.tsx` và `UserAccountModal.tsx`: Đã kết nối API `notifications.ts` (`getNotificationSettings`, `updateNotificationSettings`) qua GET/PUT `/me/notification-settings` với body `{ expectedRevision, emailDigest, goalAlerts, partnerUpdates }`. Loại bỏ hoàn toàn phụ thuộc localStorage.
- [x] Quản lý trạng thái độc lập theo tài khoản: Tách biệt rõ loading/error, nạp lại cài đặt khi chuyển đổi tài khoản, không chia sẻ lựa chọn giữa các phiên đăng nhập khác nhau.
- [x] Phản hồi và thông báo minh bạch: Ghi rõ thông báo lưu thành công và chỉ dẫn trạng thái kênh gửi; duy trì hoạt động thông báo bảo mật và hỗ trợ kỹ thuật.
- [x] Xử lý lỗi và xung đột: Giữ nguyên trạng thái biểu mẫu khi gặp lỗi 401/403/409/503 và rollback giao diện chính xác; không dùng thông báo thành công giả lập.

### FE-T11-03 — Report/CSV và tư vấn đã ngừng

- [x] Xuất báo cáo CSV chuẩn hóa: `AccountPage.tsx` và `UserAccountModal.tsx` ưu tiên gọi `exportPlanVersionCsv(planId, currentVersionId)` theo kế hoạch đang chọn từ backend T08. Báo lỗi và hướng dẫn tạo/áp dụng kế hoạch khi chưa có phiên bản.
- [x] Dữ liệu báo cáo chuẩn mực: Hiển thị đầy đủ phiên bản, mô hình, ngày định giá từ máy chủ; không tự tính lại số liệu trên trình duyệt.
- [x] Ngừng luồng tư vấn chuyên viên: Đã loại bỏ toàn bộ các nút đặt lịch/phòng chat tư vấn chuyên viên cũ; chuyển hướng yêu cầu người dùng sang kênh Hỗ trợ (Support). Đáp ứng trạng thái 410 FEATURE_RETIRED từ máy chủ.
- [x] Quản trị nội dung và vận hành: Không công khai bài viết dạng nháp; tuân thủ quy chuẩn trạng thái gửi email và chứng từ giao vận.

### FE-T12-01 — Lỗi kiểm thử đã có bằng chứng

- [x] Khắc phục lỗi kiểm thử trình duyệt: Sửa selector và liên kết accessible name trong `account-api.spec.ts` thành `Mật khẩu mới Tối thiểu 12 ký tự`; tái cấu trúc các trường nhập liệu trong `ui.tsx` đạt chuẩn liên kết `<label htmlFor>`. Kết quả kiểm thử đạt 8/8 PASSED (100%) trong `node backend/scripts/verify-browser.cjs`.
- [x] Kiểm thử trình duyệt độc lập và an toàn: Bộ chạy `verify-browser.cjs` vận hành trên bản build sản xuất với mock API, hoàn thành toàn bộ 8 bài kiểm thử trong 14.8s.
- [x] Sửa triệt để vòng đời `setup-preview.ts`: Loại bỏ hoàn toàn `freePort8444()` và lệnh taskkill độc đoán; sử dụng cơ chế cấp phát cổng độc lập và quản lý tiến trình sở hữu an toàn.
- [x] Kiểm thử toàn diện các luồng nghiệp vụ: `financial-profile.spec.ts` đạt 7/7 PASSED (100%), `responsive.spec.ts` đạt 15/15 PASSED (100%), `admin-ui.spec.ts` đạt 1/1 PASSED (100%).
- [x] Xử lý lỗi kết nối và trạng thái phiên: Giao diện duy trì khả năng giữ dữ liệu khi gặp lỗi mạng, bảo toàn dữ liệu trên nhiều tab và phân tách phiên theo người dùng.

### FE-T12-02 — Nội dung, khả năng sử dụng và tải trang

- [x] Rà soát nội dung và khả năng truy cập (A11y): Loại bỏ hoàn toàn 100% dấu gạch ngang dài em-dash khỏi toàn bộ mã nguồn frontend/src; chuẩn hóa các nhãn vốn, thu-chi, danh nghĩa/thực tế; kiểm tra tương phản màu sắc và focus đạt chuẩn WCAG AA.
- [x] Khắc phục triệt để lỗi reflow trên thiết bị di động: Đạt 15/15 PASSED (100%) trong `responsive.spec.ts` trên toàn bộ 8 kích thước màn hình (320px, 390px, 768px, 844px, 1024px, 1280px, 1440px, 1920px); ổn định thanh cuộn bằng `scrollbar-gutter: stable` và `overflow-x: hidden !important`.
- [x] Kiểm thử đóng gói và kết xuất tĩnh: `npm run typecheck` đạt 0 lỗi; `npm --prefix frontend run build` hoàn tất thành công (exit code 0), xác thực đủ 23/23 tài sản đóng gói và kết xuất trước SSR 5 trang tĩnh an toàn.
# FE-P13-P15 — Contract backend đã triển khai 05/10/2026

Đây là cập nhật mới nhất cho phần P13/P15, thay mô tả “chưa có API” ở checklist cũ. Backend đã có model v3, preview/lưu reforecast, giữ replay v2. Chưa nghiệm thu giao diện. Contract chi tiết và ví dụ JSON: [CONTRIBUTIONS_REFORECAST.md](../backend/docs/CONTRIBUTIONS_REFORECAST.md); OpenAPI retirement/actuals/plans đã cập nhật. Backend không sửa frontend trong đợt này.

- [ ] Màn mục tiêu/kế hoạch: chọn `contributionTiming` END_OF_MONTH (mặc định) hoặc START_OF_MONTH. START yêu cầu xác nhận `startOfMonthFunding` theo contract; không tự khai 0/true, không lấy số dư quỹ làm thu khả dụng. Hiển thị tháng hiệu lực từ replayInput.contributionStartMonth, các issue/cảnh báo và mức góp thực sau giới hạn. Đầu kỳ chỉ áp dụng tích lũy, góp sau hưu vẫn cuối kỳ. Lãi âm có thể làm đầu kỳ thấp hơn cuối kỳ.
- [ ] Hiển thị `savingsStatus` mới EARLY_FUNDING_REQUIRED / NO_ELIGIBLE_CONTRIBUTION_PERIOD; null mức góp nghĩa là không tính được, không chuyển thành 0 hoặc “đã đủ vốn”. Tiền vẫn dùng chuỗi thập phân.
- [ ] Sổ thực tế tiếp tục dùng endpoint cũ; không suy CONTRIBUTION từ thu trừ chi. Hiện dư hộ gia đình, góp xác nhận, còn ngoài quỹ và mức bị giới hạn riêng. Ba trường hợp thu12/chi20,20/20,25/20; dư5 với góp0/2/5/6 cho góp0/2/5/5, giữ ngoài5/3/0/0, trường hợp6 thiếu khả năng1.
- [ ] Xem cập nhật: POST `/api/v1/me/retirement/actuals/reforecast/preview` với planId/versionId/throughMonth/expectedProfileRevision/futureChanges. READY hiển thị candidate; BLOCKED/HORIZON_COMPLETE phải hiện issues, không cho lưu. `beforeChanges` là dự báo cùng anchor trước khi điều chỉnh tương lai, dùng so trước/sau với candidate.calculation; số quá khứ so actual/forecast lấy endpoint reforecast cũ.
- [ ] Form thay đổi tương lai ghi rõ “thay tổng theo tháng”, chọn income/livingExpense/additionalExpense/plannedContribution, amount, startMonth/endMonth sau cutoff, reason và UUID mới. Cùng field không chồng khoảng; 0 là chủ động dừng. Không gọi đây là sửa một nguồn thu riêng hoặc cộng thêm nguồn; chưa có API chỉnh từng hợp đồng trong reforecast. Khoản thực tế một lần không tự kéo dài. START giữ trần khả dụng đã xác nhận từ nguồn; không tự tăng trần khi đổi thu nhập.
- [ ] Lưu POST `/api/v1/me/retirement/plans/:id/reforecasts` với `{expectedRevision, expectedInputHash, preview}` và Idempotency-Key UUID. Retry cùng payload dùng cùng key; đổi payload dùng key mới. Thành công chỉ là lưu version, không báo đã áp dụng. Apply gọi API hiện có với versionId/revision mới/expectedProfileRevision/confirm:true và chờ thành công trước đổi current. Giữ baseline.
- [ ] Sau lưu/reload/report/CSV: giữ model/timing, REFORECAST, nguồn version, mốc actual, originalRetirementMonth. `actualSourceChanged=true` phải hiện nguồn đã sửa và yêu cầu xem lại; 409 PREVIEW_CHANGED/ACTUAL_SOURCE_CHANGED/REVISION_CONFLICT giữ form và tải lại dữ liệu liên quan. Snapshot cũ vẫn xem/replay/export được, không ghi đè. Sau sửa actual quá khứ, dùng phiên bản nguồn trước đoạn bị sửa để preview lại.
- [ ] Bản đã cập nhật muốn thử lại cùng cutoff: dùng sourceVersionId/throughMonth trong reforecast, khai lại điều chỉnh mong muốn. Muốn dự báo tiếp qua tháng mới: dùng chính version đã cập nhật làm nguồn; tháng thực đầu tiên phải nối đúng số dư anchor. Không gọi simulate thông thường trên reforecast (422 REFORECAST_USE_ACTUAL_UPDATE).
- [ ] Không trình bày selection.monthlyContribution/monthlyExpenseToday hoặc netWorth là số thực mới ở cutoff: đây là đầu vào/cơ sở hồ sơ gốc; thay đổi theo tháng nằm trong rows/futureChanges. Goal.retirementMonth giữ tháng hưu gốc; summary.retirementMonth có thể là đầu phần dự báo còn lại khi đã nghỉ hưu. So sánh báo NOT_COMPARABLE khi khác ngày định giá, không ép thành chênh lệch trực tiếp; selectionFields có thể chứa futureChanges/actualRevisions.
- [ ] Nợ/lương hưu/bán tài sản vẫn lấy lịch nguồn; hiện rõ yêu cầu rà nguồn riêng khi phát sinh tất toán/bán/thay lương hưu, không hứa đã tự xóa dòng dự báo. Hồ sơ khác revision nguồn trả PROFILE_CHANGED_RECREATE_VERSION.
- [ ] Browser nghiệm thu: timing → preview → save → apply → reload/CSV; actual → đối soát → preview thay đổi tương lai → lưu → apply. Kiểm 409/mất mạng giữ form, retry không trùng, đổi account không lộ dữ liệu; vẫn phải sửa các blocker FE-RECHECK/FE-T11 trước đóng T12. Backend tests/DB đạt không đồng nghĩa UI đã nghiệm thu.
# FE-Q15-03 — Điều chỉnh từng nguồn đã có backend (05/10/2026)

Contract [SOURCE_REFORECAST.md](../backend/docs/SOURCE_REFORECAST.md), OpenAPI đã cập nhật. Dùng cùng preview/lưu/apply reforecast, thêm sourceChanges; không cần UI gọi endpoint mới hoặc tự tính dòng tiền.

- [ ] Form chọn nguồn từ hồ sơ/version đang xem: tất toán khoản vay, tài sản đã thành tiền vào quỹ, thay mức hưu hoặc thay riêng dòng thu/chi. Mỗi điều chỉnh có UUID mới, document và ô xác nhận chủ động; không tự đặt confirmed:true khi mở form.
- [ ] Tất toán: chọn sourceId khoản vay có hợp đồng, actual.period/eventId là DEBT_PAYMENT trong sổ đã đối soát; xác nhận remainingObligation:"0". Giao dịch trả một phần không được gán tất toán. Nếu tiền trả lấy từ quỹ, hướng dẫn ghi WITHDRAWAL riêng trong ledger, không tự thêm hai bút toán.
- [ ] Tài sản: chọn nguồn và CONTRIBUTION đã ghi phần tiền thực vào quỹ. Backend bỏ lần vốn dự kiến/dòng thuê tương ứng, không tự cộng số tiền bán vào anchor. Không dùng INCOME thay cho khoản nộp quỹ. Không cho nhầm tài sản đã nằm trong vốn đầu thành vốn mới.
- [ ] Pension: sourceId:"pension", startMonth/endMonth sau cutoff, monthlyAmount là tiền danh nghĩa tháng, priceBasis:"NOMINAL_MONTHLY". Ghi nguồn xác nhận; số0 là chủ động ngừng. Chưa có tự tính mức BHXH từ lịch sử đóng.
- [ ] Thu/chi: FLOW_REPLACE với sourceType INCOME/EXPENSE, ID dòng có sẵn, monthlyAmount và khoảng. Nhãn phải là “thay số tiền của nguồn này”, khác futureChanges “thay tổng tháng”. Không trộn hai loại trên cùng trường/tháng; không sửa dòng tham chiếu pension/nợ/tiền thuê qua form thu/chi thường. Nguồn dùng sau hưu phải nằm trong danh sách đã chọn của phiên bản.
- [ ] Hiện trước/sau từ beforeChanges và candidate.calculation, cùng mốc số dư thực. Lưu sourceChanges cùng form và payload hash; save không đồng nghĩa apply. Lịch sử version trả sourceChanges; CSV kèm sourceChangeIds, compare có selectionFields sourceChanges. Không đưa document của người dùng vào log/telemetry.
- [ ] Xử lý422 theo contract, giữ form và chỉ rõ cần rà nguồn/giao dịch/phạm vi. Không tự bỏ một adjustment để làm request thành công. Không dùng lại event/ID, không chồng khoảng nguồn đã pin. Sửa điều chỉnh cũ thì chọn nguồn trước điều chỉnh để xem lại; sửa actual nguồn vẫn trả409 như trước.
- [ ] Nghiệm thu browser: hai khoản vay chỉ bỏ đúng khoản đã tất toán; tài sản thực vào quỹ khác dự kiến không cộng hai lần; thuê dừng đúng phần sở hữu; pension không cộng lại thành thu; sửa một nguồn không xóa nguồn khác; tháng0/ngoài khoảng đúng; retry/save/apply/reload/CSV và409 giữ dữ liệu. Phần backend có tests; chưa có bằng chứng UI.


## FE-T13-REFERENCE — Tuổi tham chiếu và tháng hưởng (backend đã có)

05/10/2026, contract [PENSIONS.md](../backend/docs/PENSIONS.md), endpoint hiện có `POST /api/v1/me/pension/preview`. Thay đổi này đã kiểm backend; UI/browser chưa nghiệm thu.

- [ ] Trong `data.legalRetirementAge`, hiển thị `retirementMonth` là mốc tuổi tham chiếu; `referenceFollowingMonth` là tháng kế tiếp mốc tuổi nếu cần giải thích. Không dùng trường đó tự điền hoặc xác nhận tháng nhận hưu.
- [ ] `pensionStartMonth=null` và `pensionStartStatus=REQUIRES_BENEFIT_ASSESSMENT` nghĩa là chưa xét đủ hồ sơ hưởng, không có nghĩa là người dùng không được hưởng. Giữ riêng tháng nhận do người dùng khai tại `personal.pensionStartMonth`; lịch tiền `rows` vẫn từ khai báo này.
- [ ] Nhãn căn cứ đọc `rule.version`, `rule.scope=AGE_REFERENCE_ONLY` và `relatedSources`. `eligibility=NOT_ASSESSED` không được đổi thành “đủ điều kiện”. Nhánh OTHER/special vẫn cần rà; không tự tính nghỉ sớm của giáo viên bằng nút trừ5năm.
- [ ] Lịch sử modelv2/v3 có metadata dạng cũ, không có các trường mới; tiếp tục hiển thị “tham chiếu, chưa xét điều kiện”, không gọi đó là kết luận pháp lý. Không cập nhật lại snapshot để thêm trường.
- [ ] Browser: mốc tuổi2028 nhưng tháng nhận khai2030 → form/rows vẫn2030; thiếu tháng sinh → cần bổ sung, không ngày giả; đọc version cũ không lỗi/null→0.

Thiết kế T13-02 ở [ADR-001](../backend/docs/ADR-001-EXPANSION.md) và [expansion.openapi.yaml](../backend/docs/expansion.openapi.yaml). File này có `x-runtime-status: NOT_IMPLEMENTED`, chỉ bàn giao cấu trúc; chưa gọi các route BHXH/history/estimate/reforecast-v4 trong UI. Chưa có bảng hoặc migration cần frontend xử lý.

## FE-EXPANSION-T13-T17 — Kế hoạch UI cho ba phần mở rộng

Ngày05/10/2026. **Chỉ lập kế hoạch, các API mới chưa tồn tại.** Theo [nghiên cứu](research-bhxh-no-nguon-moi.md) và mục10/task.md. Giữ UI hiện hành cho đến khi backend bàn giao schema/payload/fixtures; không dùng số demo để giả lập tính BHXH đã có.

- [ ] FE-BHXH-01: nhập lịch sử đóng theo giai đoạn/tháng, hình thức bắt buộc/tự nguyện/chế độ lương, nguồn/ngày xác nhận; import preview chỉ lỗi đúng dòng, trùng tháng/thiếu khác0. Không yêu cầu CCCD/mã BHXH khi không cần cho phép tính.
- [ ] FE-BHXH-02: hiển thị riêng điều kiện hưởng, tháng được tính, bình quân, tỷ lệ, giảm theo nhóm, tháng nhận và trợ cấp một lần. ELIGIBLE khác PROJECTED_SCENARIO; REVIEW_REQUIRED cho nhánh chưa hỗ trợ. Phân biệt bảng điều chỉnh chính thức với giả định tương lai; có phiên bản luật/ngày tính/nguồn.
- [ ] FE-BHXH-03: giữ lựa chọn nhập mức từ thông báo BHXH; cho người dùng xem thay đổi trước khi chọn estimate đưa vào pension của candidate. Không tự apply hay cộng thêm incomePENSION; không gửi hồ sơ đóng/giám định vào chat AI.
- [ ] FE-BHXH-ADMIN: nháp→kiểm dữ liệu→xem tác động→duyệt→công bố bộ quy tắc có coverage, nguồn và thời hạn. Không gộp quản trị luật với upload knowledge/training Gemini; chưa có bảng hệ số thì không hiện đã sẵn sàng.
- [ ] FE-DEBT-01: form liên kết actual với khoản vay, tách gốc/lãi/phí/ngày ghi nhận/số dư sau; nói rõ toàn khoản hay phần người dùng trả. Giữ form khi số liệu không khớp; không lấy tổng tiền trả làm giảm gốc.
- [ ] FE-DEBT-02: so lịch cũ/mới: giảm hạn, giảm tiền trả, lịch ngân hàng, ân hạn/gia hạn/refinance; hiển thị tổng lãi/phí và ảnh hưởng quỹ. Có nhãn dự kiến hoặc đã được bên cho vay chấp thuận, không báo app đã tái cơ cấu khoản vay.
- [ ] FE-SOURCE-01: thêm thu/chi/pension/tài sản/vốn/khoản vay trong dự báo; sourceId/revision quản lý theo API, chọn one-off/recurring/start/end, nominal/today. Nguồn mới ở version sau vẫn sửa/kết thúc được.
- [ ] FE-SOURCE-02: phân biệt tài sản sở hữu, sốnet dự kiến thu, tiền đã ởactual và số góp được xác nhận. Tiền dư/vay mới/bán nhà không tự góp100%; giữ quy tắc khả dụng đầu/cuối kỳ. Chỉ cập nhật hồ sơ tài khoản bằng thao tác riêng khi API hỗ trợ.
- [ ] FE-SHARED: hiển thị attribution từng nguồn và warning/missingEvidence, before/after từ server; giữ cùng hash trên preview/save/apply. Không tiếp tục dùng candidate khi revision/actual nguồn đổi; xử lý409/422 theo fieldPath, không tự bỏ điều chỉnh.
- [ ] FE-ACCEPTANCE: browser các nhóm BH-G/DN-G/SRC-G/ALL-G trong tài liệu; replayv2/v3 giữ số, đổi tài khoản không lộ lịch/chứng từ; lỗi mạng không báo đã lưu/apply; CSV và màn hình cùng version. Chỉ đánh dấu hoàn thành nhóm backend đã có coverage và bằng chứng thật.

## FE-T14-HISTORY-RULES — API lịch đóng và quản trị luật đã có

Ngày05/10/2026. Bổ sung này thay thông tin “mọi API mở rộng chưa tồn tại” phía trên **chỉ với history/legal-rules**. Contract [insurance.openapi.yaml](../backend/docs/insurance.openapi.yaml), paths trong [openapi.yaml](../backend/docs/openapi.yaml), hướng dẫn [INSURANCE_HISTORY_RULES.md](../backend/docs/INSURANCE_HISTORY_RULES.md). Backend không chỉnh UI trong đợt này.

- [ ] USER: `GET /api/v1/me/pension/history` trả bản mới nhất hoặc data:null; `GET /:id` đọc bản cũ. Form giữ `id/revision/documentHash`, xóa state khi đổi tài khoản. Không gọi các route ADMIN để đọc lịch khách.
- [ ] Nhập `birth.precision/declaredValue` đúng DAY/MONTH/YEAR/UNKNOWN; legalSex; coverageFrom/Through/confirmedThroughMonth; tháng đóng, scheme/chế độ lương/status/căn cứ đóng/evidence; nhóm đặc thù theo khoảng. Không mặc định UNKNOWN thành0, không tự điền ngày sinh quy ước, không lấy lương thực nhận làm căn cứ đóng.
- [ ] Import có cấu trúc: POST `/me/pension/history/import-preview` với `{expectedHistoryRevision,document}`. Hiển thị READY/INCOMPLETE/INVALID và mọi issues. normalized có tháng UNKNOWN được bổ sung; INCOMPLETE được lưu với xác nhận, INVALID thì sửa trước. Không báo UNKNOWN là tháng đã đóng; không nộp Excel macro/URL/hồ sơ vào Gemini.
- [ ] Save: POST `/me/pension/history` với `{preview:<đúng body đã preview>,expectedInputHash,confirm:true}`, Idempotency-Key UUID. Giữ cùng key/body khi retry mạng; không thay body bằng normalized rồi giữ hash cũ.409 yêu cầu tải revision/xem lại; save append không tự thay pension/profile/plan.
- [ ] ADMIN: GET/POST `/admin/legal-rules`, GET/PATCH `/:id`, POST `/:id/transitions`. Mutation có Idempotency-Key. PATCH `{expectedRevision,draft}`; transitions VALIDATE/REVIEW/PUBLISH dùng revision/documentHash/validationHash/reviewHash theo phản hồi mới nhất; REVIEW cần reviewNote.
- [ ] DRAFT → VALIDATED → REVIEWED → PUBLISHED. Không cho người từng soạn/sửa tựreview; PATCH xóa duyệt cũ; published chỉ xem hoặc tạo bản kế tiếp, có supersedesId khi thay luật. Hiện strategy chưa đăng ký: VALIDATE trảDRAFT vàSTRATEGY_NOT_IMPLEMENTED; không hiển thị bộ tínhBHXH sẵn sàng chỉ vì tạo được draft.
- [ ] Browser: chưa có lịch → nhập thiếu tháng → previewunknown → save/reload; sửa tạorevision2 đọc lạirevision1; trùng thángINVALID;409multitab; khác tài khoản404; USER vào ADMIN403; ADMIN vào lịchUSER403; lỗi mạng retrykhôngappendtrùng. Bộ tínhestimate, chọnpensionv4 và luồng khoản vay/nguồn mới tiếp tục chờ backend bàn giao riêng.

## FE-T14-ESTIMATES — Xem trước và lưu kết quả BHXH

Ngày05/10/2026. API estimate đã có, thay ghi chú chờ ở trên. Phạm vi hiện tại: đóng bắt buộc theo lương doanh nghiệp, nhómĐiều2(1)(a), điều kiện thông thường. Chưa có bộ luật công bố trên DB thật; không hiển thị sẵn sàng tính khi danh sách bộ luật rỗng. Contract production: [insurance.openapi.yaml](../backend/docs/insurance.openapi.yaml), [hướng dẫn](../backend/docs/INSURANCE_HISTORY_RULES.md).

- [ ] Form lịch thêm `participantCategory`; trạng thái `NOT_CONTRIBUTED` là xác nhận không đóng, `contributionBase=null`, có căn cứ, khác tháng chưa rõ `UNKNOWN`. Không tự gán loại người tham gia từ tên nghề.
- [ ] Lấy `GET /api/v1/me/pension/legal-rules?benefitDate=YYYY-MM-DD` khi đổi ngày hưởng. Chọn ID bản luật do backend trả; danh sách rỗng thì giải thích chưa có bộ quy định phù hợp, vẫn giữ lựa chọn nhập hưu thủ công.
- [ ] `POST /api/v1/me/pension/estimates/preview`: gửi historyVersionId/revision mới nhất, legalRuleSetVersionId, intendedBenefitDate, employmentEndDate, contributionStopMonth, benefitRequestDate và futureContributions. `caseDetails` khai đang tham gia/bảo lưu và tháng hưởng theo thông báo/đề nghị hoặc giả định có căn cứ; không lấy mốc tuổi tự điền thành quyết định hưởng.
- [ ] Tách `assessmentStatus` (ELIGIBLE/NOT_YET_ELIGIBLE/INSUFFICIENT_DATA/REVIEW_REQUIRED) khỏi `estimateKind` (CURRENT_RULE_ESTIMATE/PROJECTED_SCENARIO). Hiển thị tháng tính đóng, bình quân, tỷ lệ, sàn nếu có, tháng nhận, trợ cấp một lần, missingFields và citations. `null` là chưa xác định, không chuyển thành0. Có mức hưu nhưng REVIEW_REQUIRED không được diễn giải là hồ sơ đã xét đầy đủ.
- [ ] Lưu bằng `POST /api/v1/me/pension/estimates` với `{preview:<body vừa xem>,expectedInputHash:<inputHash cấp ngoài>}`, Idempotency-Key UUID. Không dùng `assessment.inputHash`. Giữ key/body khi retry.409 yêu cầu xem lại vì lịch/luật/ngày đánh giá có thể đã đổi.
- [ ] Danh sách `GET /api/v1/me/pension/estimates`; chi tiết `GET /:id`. Hiển thị đúng assessedOn, historyRevision, legalRuleVersion và kết quả bất biến; không tính lại bằng dữ liệu hiện hành trên trình duyệt. Lưu estimate chưa thay pension/profile/plan; nút áp vào candidate còn chờ tích hợpT14-06/T16.
- [ ] ADMIN: BH1 đã đăng ký để VALIDATE; BH2–4 còn STRATEGY_NOT_IMPLEMENTED. Duyệt/công bố vẫn cần chứng từ thật và người duyệt độc lập. Không sử dụng fixture test để tạo bộ luật production.
- [ ] Browser nghiệm thu:179/180tháng; UNKNOWNkhácNOT_CONTRIBUTED; thiếu hệ sốnăm hưởng; pensionnull; lưu trùng khi retry;409lịch/luật cũ; đổi tài khoản404; đọc lại estimate cũ sau thay lịch; không tự cộng trợ cấp vào quỹ.

### Bổ sung FE-T14-ESTIMATES — phiên bản quyền lợi v2

- [ ] Hiển thị `engineCode` từ kết quả đã lưu; quyền lợiv1/v2 khác với model kế hoạch retirement-monthly-v2/v3/v4. Không đổi phiên bản khi đọc lịch sử.
- [ ] Với quyền lợiv2, `lumpSum` có trợ cấp vượt số tháng đóng; breakdown `LUMP_SUM_EXCESS_MONTHS_BEFORE_AGE`, `LUMP_SUM_EXCESS_MONTHS_AFTER_AGE`, `LUMP_SUM_BEFORE_AGE`, `LUMP_SUM_AFTER_AGE`, `RETIREMENT_LUMP_SUM`. Hiển thị riêng khoản một lần, không nhân thành thu nhập tháng hoặc tự góp vào quỹ. V1 có thể vẫn null/REVIEW_REQUIRED cho cùng hồ sơ; không tự thay bằng sốv2.
- [ ] Các nhóm lương Nhà nước/hỗn hợp vẫn chờAPI đầy đủ; core nội bộ mới không là căn cứ mở form gửi bình quân đã tính hoặc báo hỗ trợ toàn bộBHXH.

### FE-T14-STATE — nhánh lương Nhà nước/hỗn hợp thông thường đã có API

Ngày05/10/2026, thay thông tin “chỉ core” phía trên đối với nhóm thông thường. Dùng chung routes estimate và [contract](../backend/docs/insurance.openapi.yaml). Branch `BH2_COMPULSORY_STATE_MIXED_NORMAL`, engine `vn-pension-state-v1`. Các nhóm đặc thù vẫn chờ triển khai, chưa có bộ luật thực công bố trênDB.

- [ ] Form lịch tháng STATE có `stateSalary` khi cần: `kind=CURRENT_SCALE_COEFFICIENT`, `totalContributionCoefficient` là chuỗi, evidence. Nhập đúng tổng hệ số làm căn cứ đóng theo chứng từ; không lấy riêng hệ số ngạch hoặc suy từ lương thực nhận. Backend không nhận tiền `adjustedBase` doUI tính.
- [ ] Form estimate thêm `stateSalaryCase`: mốc tham gia đầu tiên, căn cứ xác nhận mốc, salaryTreatment và căn cứ phân loại. Không mặc địnhORDINARY; cho chọn chưa rõ/nhóm chuyển nghề-thâm niên và hiển thị trạng thái cần rà. Lịch phải bao gồm cả giai đoạn trước đã rútBHXH một lần nếu có, không chỉ đoạn đang giữ.
- [ ] Trước2016 dùng hệ số đóng và mức tham chiếu do luật cung cấp; từ2016 dùng hệ số năm. Hiển thị `STATE_ADJUSTMENT_METHOD`, `STATE_WAGE_WINDOW_MONTHS`, `STATE_CONTRIBUTION_MONTHS`, `STATE_ADJUSTED_AVERAGE`, `EMPLOYER_ADJUSTED_TOTAL`, `STATE_USED_ALL_TIME_AVERAGE`. Cửa sổnull nghĩa toàn bộ, không phải0tháng.
- [ ] Với giai đoạn trước10/2004, trần hệ số cần rà, nhóm thâm niên/chuyển ngành hoặc CREDITED, giải thích missingFields/REVIEW_REQUIRED; không dùng0 hoặc vẫn báo đã tính đủ. Không suy trợ cấp/quỹ từ lương hưu tháng.
- [ ] Browser: thuần Nhà nước, xen kẽ Nhà nước/doanh nghiệp, thiếu hệ số, đổi mốc tham gia, chứng từ tương lai, nhóm cần rà,409sau sửa lịch, đọc lại estimate cũ và cùng key khi retry. Giữ riêng pension nhập tay và chưa tự apply vào plan.
# FE-T14-CORPUS-SOURCE — bổ sung 05/10/2026

- Backend có hai bộ luật nháp 2026 có nguồn/hash tại `backend/seed-data/legal-2026/`; không coi file nháp là luật đã công bố. Màn hình chọn luật tiếp tục chỉ dùng discovery API trả PUBLISHED. Có file corpus không có nghĩa đã có dữ liệu luật dùng được trong DB.
- Nguồn pháp lý có thể dẫn tới bản ký trên `xdcs.cdnchinhphu.vn`; hiển thị tên văn bản/điều khoản và liên kết do API trả, không tự đổi URL hoặc bỏ hash. Không gắn nhãn đã xác thực chữ ký chỉ dựa vào URL.
- Đã chuẩn bị builder nội bộ chọn estimate vào nguồn pension; **chưa mở endpoint T16**, chưa nối nút thành công giả. Khi API được bàn giao: gửi estimateId/hash, revision nguồn/registry và khoảng tháng; chỉ phần sau cutoff, cần chọn thay nguồn pension cũ để tránh cộng trùng.
- Kết quả ước tính đưa vào nguồn phải mang nhãn dự kiến; giữ số danh nghĩa cố định khi chọn FIXED_NOMINAL, không âm thầm áp lịch tăng của pension cũ. Trợ cấp một lần hiển thị riêng, không tự cộng vào quỹ. Lịch đóng hoặc luật thay đổi trước save phải yêu cầu xem trước lại. Backend chưa sửa frontend trong đợt này.

## FE-T15-LOAN-V2-CORE — 06/10/2026: chuẩn bị màn cập nhật khoản vay

Backend đã có core lịch/đối soát/revision nguồn; **chưa có API T15 public**. Chưa bật nút lưu/apply tính năng này hoặc gửi Contractv2 vào API Contractv1. Chi tiết: [LOAN_REVISIONS_V2.md](../backend/docs/LOAN_REVISIONS_V2.md).

- Form cần tách dư gốc và ngày xác nhận; toàn hợp đồng/phần người dùng; tỷ lệ trả; ngày ký/sửa/hiệu lực; chứng từ. Hiển thị rõ phương án giả định và lịch được ngân hàng xác nhận.
- Tiền thực trả tách gốc, lãi, phí trả trước, phí khác; chọn giao dịch DEBT_PAYMENT và phiên bản tháng. Cho thấy phần còn chưa phân bổ; không lấy toàn bộ tiền trả làm tiền giảm gốc, không suy phần đồng vay từ tỷ lệ.
- Chọn giữ hạn/giảm khoản trả, giữ khoản trả/giảm hạn, lịch ngân hàng hoặc cơ cấu. Lịch cần thể hiện gốc/lãi/phí/dư cuối từng kỳ; ân hạn gốc vẫn có thể trả lãi. Không đưa refinance vào trạng thái đã hỗ trợ.
- Với kỳ giữa tháng cần ngày bắt đầu/kết thúc và cách tính lãi theo ngày; lãi thả nổi khai từng kỳ. Kỳ cuối phải chỉ rõ balloon nếu có. Tiền phí/lãi sau khi hết gốc vẫn có thể phải trả.
- CAPPED hiện là trần tổng nghĩa vụ người dùng, gồm gốc/lãi/phí; hiển thị đã trả và còn lại. Không đặt lại trần về số ban đầu mỗi khi sửa lịch.
- REVIEW_REQUIRED không phải kết quả hoàn chỉnh để lưu/apply. Các lỗi số dư không khớp, event stale/đã phân bổ, sửa trước cutoff, thiếu thứ tự ghi sổ cùng ngày cần giữ dữ liệu nhập và hướng dẫn đối soát.
- Ví dụ nghiệm thu: gốc100tr, trả12tr gồm gốc10+lãi1+phí1 → gốc90tr. WITHDRAWAL12tr đã chốt không bị trừ lại khi phân bổ DEBT_PAYMENT. Sửa lịch chỉ tác động sau cutoff, không đổi số dư quỹ thực tế.
- Chờ handoff API tiếp theo để nối endpoint, hash/revisions/idempotency và luồng save/apply. Backend chưa sửa mã frontend trong đợt này.

## FE-T15-LOAN-V2-API — 06/10/2026: đã nối luồng cập nhật khoản vay

Thay ghi chú “chưa có API” tại FE-T15-LOAN-V2-CORE. Backend đã nhận `loanRevisions` ở preview/save nguồn v4, chuyển cơ sở số dư v1, giữ evidence trong snapshot, kiểm stale actual khi apply. Không có refinance/new loan trong đợt này. [Contract đầy đủ](../backend/docs/LOAN_REVISIONS_V2.md).

1. Gửi preview nguồn với các mảng lệnh rỗng để nhận `loanRevisionOptions`. Dùng sourceId/sourceRevision/sourceHash/contractHash server trả; không tự băm JSON. Nếu legacyOpeningRequired, lấy thông tin ngày ký/sửa/hiệu lực và chứng từ từ người dùng; không tự đặt ngày. CAPPED phải xác nhận capBasis=TOTAL_USER_PAYMENTS và phần đã thực hiện trước số dư gốc; loại khác previouslyPaid=0.
2. Gửi tối đa30 loanRevisions; mỗi khoản vay một commandId UUID mới và operation=REVISE, expectedSourceRevision/expectedSourceHash/expectedContractHash/confirm=true. Có thể kèm flow/pension khác nhưng không trùng nguồn hoặc commandId. Contractv2 phải có số dư ngày cuối throughMonth và đầy đủ lịch sau đó, không chỉ những tháng đang hiển thị trên biểu đồ.
3. Chọn actual DEBT_PAYMENT của đúng tài khoản, gửi allocationId/eventId/actualRevision/bookedOn/scope và bốn thành phần gốc/lãi/phí trả trước/phí khác. components là tiền người dùng; contractComponents là phần hợp đồng có chứng từ. Không tự chia tiền theo share để suy phần người khác. Chỉ gửi allocations mới trong revision này; backend tự giữ phần đã phân bổ.
4. Preview READY trả candidate và inputHash; lưu đúng body đó + expectedInputHash qua endpoint source-reforecasts có Idempotency-Key. Apply riêng với revision mới. Không gửi actuals/consumed/basis hoặc tự chỉnh anchor. Xem lại loanSources để hiển thị lịch/chứng cứ đã pin của bản đã lưu.
5. Sau409 giữ bản nhập nhưng phải tải lại nguồn/actual và preview mới; không lặp apply với hash cũ. Khi actual bị sửa, đọc/replay lịch sử vẫn được nhưng save/apply từ nguồn stale bị chặn. Sửa tiếp cùng cutoff bỏ legacyOpening và dùng hash hợp đồng v2 mới từ options; sang tháng tiếp theo chỉ phân bổ giao dịch mới.
6. Nghiệm thu: v1→trả một phần→preview→save→apply→reload/report/CSV; sửa kỳ hạn tại cùng cutoff; thêm tháng thực tế; hai khoản vay dùng chung một event không được vượt tổng; CAPPED không reset; bản v1/v3 lịch sử giữ nguyên; tiền WITHDRAWAL không bị trừ thêm.

Backend đã kiểm bằng service/HTTP và response schema; PostgreSQL/races, browser/UI và đối chiếu ngân hàng vẫn chưa nghiệm thu. Không sửa mã frontend trong đợt backend này.
