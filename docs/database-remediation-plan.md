# Kế hoạch chỉnh sửa và bổ sung dữ liệu An Hưu

Ngày lập: **08/10/2026**. Trạng thái: **đã lập kế hoạch, chưa thực hiện ghi DB**.

> Yêu cầu tiếp theo đã chuyển sang chuẩn bị **một bộ nạp lại toàn bộ**, tái sử dụng dữ liệu hiện có và thông tin có nguồn thật, chờ user duyệt trước khi ghi DB. Xem [gói dữ liệu và kiểm chứng hiện hành](data-package-review-2026-10-08.md). Không tạo các fixture giả lập của DATA-09 vào gói nạp thật; những bảng chưa có chứng từ tiếp tục để trống.

Căn cứ: [kiểm tra DB thật ngày 08/10](database-audit-2026-10-08.md). Các số lượng dưới đây là mốc kiểm tra 400 bản ghi/40 bảng; phải đọc lại trước khi thực thi, không dùng số lượng cũ làm danh sách cập nhật.

## 1. Mục tiêu và phạm vi

1. Sửa dữ liệu không khớp hợp đồng hiện hành, giữ lịch sử và dữ liệu ngoài phạm vi.
2. Ngăn script tạo dữ liệu tiếp tục sinh cùng lỗi.
3. Bổ sung nguồn kiến thức, cấu hình BHXH và nội dung còn thiếu bằng nguồn đã kiểm chứng.
4. Có bộ dữ liệu kiểm thử xuyên frontend–API–DB cho kế hoạch, actual, BHXH, vay và tài sản, với kết quả mong đợi rõ ràng.

**Mặc định triển khai:** sửa bản ghi hiện có trên DB ứng dụng sau rehearsal; dữ liệu giả lập mới nằm trên DB kiểm thử/staging riêng. Không coi 51 tài khoản trùng email seed là quyền ghi đè hồ sơ hiện tại. Không tự tạo giao dịch, lịch đóng BHXH, đồng ý AI hay kế hoạch chính thức cho người dùng. Bảng rỗng chỉ cần bổ sung khi có mục đích sử dụng; không đặt mục tiêu lấp đủ mọi bảng.

## 2. Thứ tự và phụ thuộc

| Đợt | Công việc | Đầu ra / điều kiện chuyển bước |
|---|---|---|
| A — P0 | DATA-00 chốt danh sách; DATA-01 sửa cách tạo dữ liệu; DATA-02 chuẩn bị sửa có điều kiện | Dry-run liệt kê đúng từng thay đổi; có backup phục hồi thử; script chạy lại không nhân đôi |
| A — P1 | DATA-03 sửa bài viết; DATA-04 sửa metadata hồ sơ/mục tiêu; DATA-05 chuẩn hóa phiếu hỗ trợ | Rehearsal đạt, cập nhật theo từng nhóm, audit sau sửa không phát hiện sai lệch ngoài phạm vi |
| B — P1 | DATA-06 bổ sung kiến thức; DATA-07 quy định BHXH; DATA-08 nội dung/cấu hình bổ sung | Nguồn xác minh, workflow duyệt hợp lệ; mục nào thiếu chứng cứ giữ chưa hoàn tất |
| C — P1 | DATA-09 bộ dữ liệu nghiệm thu; DATA-10 chạy xuyên UI–API–DB | Replay, đối soát, idempotency, cạnh tranh và tách tài khoản đạt trên DB kiểm thử |
| Theo dõi | DATA-11 điều tra lỗi vận hành | Phân loại nguyên nhân, có bằng chứng kiểm lại; giữ log lịch sử |

DATA-06 và chuẩn bị DATA-07 có thể tiến hành trong lúc sửa dữ liệu. Phần BHXH của DATA-09 phụ thuộc bộ quy định hợp lệ; bộ test giả lập quy định chỉ được chạy ở DB riêng. Không chặn việc sửa tìm kiếm bài viết để chờ hoàn thành toàn bộ BHXH.

## 3. Công việc chi tiết

### DATA-00 — Chốt phạm vi, nguồn gốc và khả năng phục hồi

- Chạy lại hai script audit; ghi thời điểm, fingerprint DB/migration và danh sách candidate theo ID, revision, hash của các trường liên quan. Không ghi URL kết nối hoặc dữ liệu riêng tư vào báo cáo chia sẻ.
- Xác định môi trường và tài khoản nào thực sự là demo; email trùng seed chỉ là tín hiệu để đối chiếu.
- Chụp backup vào nơi lưu trữ hạn chế truy cập; khôi phục thử trên DB tạm. Bản sao chứa dữ liệu thật phải có cùng kiểm soát truy cập, không đưa vào Git hoặc artifact công khai.
- Lưu bản trước/sau của đúng trường sẽ sửa trong hồ sơ thực thi riêng, có thời hạn lưu. Báo cáo tổng hợp chỉ ghi số lượng, ID tác vụ và mã lỗi.
- Chốt danh sách người chịu trách nhiệm nội dung, chủ dữ liệu và người duyệt quy định BHXH trước các bước phụ thuộc họ. Chưa cần tạo thêm tài khoản để lập kế hoạch/code/dry-run.

**Nghiệm thu:** kiểm đếm mới đầy đủ; phục hồi thử đọc được dữ liệu; danh sách candidate có thể đối chiếu; không làm thay đổi DB ứng dụng.

### DATA-01 — Sửa nguồn tạo dữ liệu để lỗi không tái diễn

File chính: `backend/scripts/seed-azure.cjs`, `backend/scripts/seed.cjs`, `backend/scripts/generate-demo-data.cjs` và các schema/service tương ứng. Hai script seed cục bộ có thể đang bị Git bỏ qua: kiểm tra tracking, đưa phần cần duy trì vào kiểm soát phiên bản.

- Loại bỏ việc dùng script reset/xóa diện rộng như công cụ sửa DB; giữ chức năng reset chỉ cho DB disposable có guard xác nhận môi trường và quyền sở hữu rõ ràng.
- Bổ sung công cụ dữ liệu riêng, có manifest cố định và idempotency; chạy mặc định dry-run. Tạo dữ liệu nghiệp vụ qua service/API hiện hành thay vì chèn JSON tự dựng vào các bảng snapshot.
- Dữ liệu mục tiêu dùng enum đúng; hồ sơ v2 lấy `asOfDate` từ `valuationDate`; dữ liệu bài dùng cùng hàm `normalized()` tạo `searchText`; category hỗ trợ dùng schema hiện hành.
- Validate fixture trước khi ghi. Hash, revision, lịch sử và trạng thái công bố do service tạo. Không sao chép công thức hưu trí/tài chính vào script.

**Nghiệm thu:** fixture sai bị chặn trước khi ghi; chạy lại không reset DB, không nhân đôi hoặc ghi đè chỉnh sửa của người dùng; test phát hiện lại được các lỗi audit vừa tìm thấy.

### DATA-02 — Công cụ sửa có điều kiện

Đề xuất file mới: `backend/scripts/repair-audited-data.cjs`, dùng manifest thay đổi đã kiểm tra; tận dụng quy ước trong `audit-database-content-readonly.cjs` và helper transaction/audit của backend.

- Mỗi nhóm là giao dịch riêng; timeout/lock timeout ngắn, khóa đúng bản ghi cần sửa và kiểm lại revision/hash/giá trị cũ. Có bản ghi bị sửa đồng thời thì rollback cả nhóm, xuất danh sách cần dry-run lại.
- Lần thực thi nhận manifest đúng DB và đúng hash; không chạy một câu UPDATE rộng theo số lượng dự đoán. Chạy lại manifest đã áp dụng phải trả `ALREADY_APPLIED` hoặc no-op có giải thích.
- Chỉ sửa trường thuộc nhiệm vụ; tăng revision/updatedAt khi có cơ chế revision và ghi audit trong cùng transaction. Với hồ sơ thay đổi revision, đánh dấu kế hoạch liên quan stale theo hợp đồng hiện hành; giữ nguyên snapshot và currentVersion.
- Rehearsal trên bản phục hồi có dữ liệu thật được bảo vệ; test lỗi giữa chừng, chạy lại và xung đột với lần sửa từ ứng dụng.
- Hoàn tác bằng thao tác bù có điều kiện so với trạng thái sau sửa, tăng revision tiếp và ghi audit. Không giảm revision, không xóa audit, không ghi đè thay đổi mới hơn; trạng thái stale được đánh giá lại. Khôi phục toàn DB là phương án sự cố, không dùng như undo thông thường.

**Nghiệm thu:** partial failure không để lại nửa nhóm; retry không lặp; conflict không mất dữ liệu; bản ghi ngoài manifest không bị công cụ sửa. Fingerprint chỉ so sánh trong snapshot ổn định; biến động do hoạt động thật phải được đối chiếu, không nhầm với lỗi công cụ.

### DATA-03 — Sửa 5 bài viết

Tham chiếu: `backend/src/modules/content/service.ts` và `frontend` các trang bài viết/tìm kiếm đang được `App.tsx` định tuyến.

- `searchText`: dựng lại bằng đúng hàm hiện hành từ title/excerpt/content/category. Đây là sửa xác định được từ dữ liệu có sẵn, ưu tiên thực hiện sớm.
- `publishedAt`: tìm chứng cứ xuất bản từ hệ thống nội dung/audit. Nếu không có, chủ nội dung quyết định giữ ngày chưa xác định hoặc xuất bản lại vào thời điểm thực hiện và ghi rõ đây là lần công bố lại. Không lấy `createdAt` làm ngày lịch sử giả định.
- Không viết lại nội dung/tác giả hoặc tăng lượt xem khi sửa metadata.

**Nghiệm thu:** 5 bài có searchText khớp; từ khóa tiếng Việt có/không dấu tìm đúng bài qua API/browser; ngày xuất bản chỉ được đánh dấu hoàn tất khi có căn cứ hoặc quyết định công bố lại.

### DATA-04 — Sửa metadata của 50 hồ sơ và 50 mục tiêu

Tham chiếu: `profiles/schema-v2.ts`, `profiles/service.ts`, `financial/schema.ts`, `financial/service.ts` dưới `backend/src/modules`.

- `lifestyle`: chỉ mapping `comfortable → COMFORTABLE`, `essential → ESSENTIAL`, `flexible → FLEXIBLE` khi giá trị hiện tại khớp chính xác; giá trị khác đưa vào danh sách rà soát. Không đổi mức chi hoặc ý muốn nghỉ hưu.
- `asOfDate`: hồ sơ v2 qua schema và có ngày JSON hợp lệ thì đồng bộ cột về `profileData.valuationDate`. Không đổi ngày trong JSON thành hôm nay và không định giá lại tài sản/nợ.
- Giữ `profileData`, `legacyProfileData`, số tiền, ID và snapshot lịch sử. Các cột tổng hợp legacy còn lại chỉ rà soát vai trò đọc; không tính lại bằng công thức seed hoặc mặc định về 0.
- Giữ thông tin rằng `FinancialService` là legacy, hiện không gắn router. Không mở lại API legacy hoặc tạo `financial_model_versions` chỉ để làm mất cảnh báo audit.

**Nghiệm thu:** không còn ngày lệch ở candidate đã sửa; mục tiêu qua schema và đọc service legacy thành công; JSON/số tiền/legacy backup nguyên vẹn; API hồ sơ và luồng preview hiện hành vẫn hoạt động; snapshot cũ replay nguyên kết quả nếu tại thời điểm thực thi đã có dữ liệu.

### DATA-05 — Chuẩn hóa 4 phiếu hỗ trợ

Tham chiếu: `backend/src/modules/community/service.ts`.

- Đọc từng phiếu trong môi trường có quyền để chốt mapping. Dự kiến `TECHNICAL → Sử dụng website`, `FEATURE_REQUEST → Khác`; `FINANCIAL` phải đọc ngữ cảnh để chọn `Nội dung` hoặc `Khác`, không áp đặt mapping hàng loạt.
- Manifest ghi category cũ/mới và căn cứ. Giữ chủ sở hữu, trạng thái, nội dung, 7 tin nhắn và tác giả; không phát thông báo như thể người dùng gửi yêu cầu mới.

**Nghiệm thu:** toàn bộ category đã duyệt thuộc enum; đọc danh sách/chi tiết và trả lời thử trên bản sao đạt; không thay đổi message hay quyền truy cập.

### DATA-06 — Hoàn thiện 5 nguồn kiến thức

Tham chiếu: `backend/src/modules/ai/knowledge.ts`, `ai/schema.ts`, `ai/router.ts`.

- Lập manifest nguồn: URL gốc, đơn vị ban hành, phiên bản, ngày hiệu lực/hết hiệu lực, ngày truy cập, hash văn bản và người kiểm tra. Khi thực hiện, đối chiếu văn bản nguồn chính thức; nội dung seed và nhãn tiêu đề không đủ làm bằng chứng.
- Bổ sung `rawContent` có nguồn. Không ghép 18 đoạn cũ thành văn bản pháp lý được coi là đầy đủ nếu chưa đối chiếu bản gốc.
- Dùng quy trình sửa nguồn → lập chỉ mục lexical → kiểm thử truy xuất → duyệt. Service phải thay các chunk cũ của đúng nguồn trong transaction và tạo hash/metadata hiện hành.
- Không đặt trực tiếp `isApproved=true`, không cần tạo embedding giả. Những nguồn chưa xác minh vẫn PENDING/chưa duyệt và được thống kê là còn việc.

**Nghiệm thu:** từng nguồn có văn bản hợp lệ; chunk khớp lát cắt, sourceHash và revision; câu hỏi mẫu trả đúng nguồn; nguồn chưa duyệt/hết hiệu lực không được chọn. Không coi số nguồn đủ 5 là tiêu chí thay cho chất lượng.

### DATA-07 — Bổ sung quy định BHXH có quản trị phiên bản

Tham chiếu: `backend/docs/LEGAL_RULE_MATRIX.md`, corpus hiện có, `backend/scripts/generate-legal-corpus.cjs`, `backend/src/modules/pensions/{legal-service,legal-validation,insurance-schema,insurance-router}.ts`.

- Lập bảng nhánh cần phục vụ, engine hỗ trợ, khoảng hiệu lực, tài liệu gốc và golden case. Chỉ dùng corpus đã đối chiếu văn bản chính thức; không công bố mọi fixture trong test thành luật chạy thật.
- Tạo draft qua `/api/v1/admin/legal-rules`; lần lượt VALIDATE → REVIEW → PUBLISH, giữ expectedRevision/documentHash/validationHash/reviewHash và idempotency.
- Snapshot audit chỉ có **1 ADMIN**. REVIEW yêu cầu người duyệt không thuộc `authorIds`, nên cần một người duyệt độc lập được cấp quyền theo quy trình tài khoản hiện hành. Không tạo danh tính giả để vượt yêu cầu. Có thể hoàn tất chuẩn bị draft/validation trước khi có người duyệt.
- Bộ quy định PUBLISHED bất biến ở cả service và DB. Chỉ công bố khi sẵn sàng sử dụng thật; sửa sai bằng bản superseding có hiệu lực đúng, không lên kế hoạch xóa/rollback bản đã công bố.
- Quy định BHXH và nguồn kiến thức AI là hai loại dữ liệu khác nhau; duyệt một loại không tự hợp thức hóa loại còn lại.

**Nghiệm thu:** đầy đủ các nhánh đã cam kết, kiểm ngày biên và golden case độc lập; quy trình chặn tự duyệt/overlap/hash sai; đọc danh sách quy định theo ngày hưởng đúng; các nhánh thiếu căn cứ giữ INCOMPLETE/REVIEW_REQUIRED.

### DATA-08 — Bổ sung có chọn lọc phần còn thiếu

| Nhóm | Việc làm | Điều kiện hoàn tất |
|---|---|---|
| 11 sản phẩm đang ẩn | Kiểm tra phí, điều kiện, disclosure, nguồn và thời điểm dữ liệu; sửa qua catalog service | Chỉ sản phẩm đủ nội dung và được duyệt mới hiển thị; không bịa lợi suất hoặc mặc định bật tất cả |
| Giả định hiện hành 2026–2055 | Đối chiếu thời hạn kịch bản; nếu cần năm sau 2055 thì tạo phiên bản giả định và chính sách mới có nguồn | Không kéo dài dòng cuối tự động; kế hoạch cũ giữ nguyên bản ghim; thiếu năm hiển thị INCOMPLETE |
| Hai USER chưa có hồ sơ | Kiểm onboarding và empty state; mời nhập qua luồng có sẵn khi cần | Không tự hoàn tất hồ sơ bằng giá trị demo |
| Notification preferences / AI consent | Kiểm mặc định khi chưa có bản ghi; chỉ lưu khi người dùng chọn | Không tự bật đăng ký thông báo, lưu hội thoại hoặc processing |
| Kế hoạch, actual, lịch đóng BHXH của người dùng thật | Nhập từ thông tin/chứng từ họ xác nhận qua luồng ứng dụng | Không dùng thu nhập dự kiến thay giao dịch thật; không suy lịch đóng chi tiết từ tổng số năm |
| Bảng legacy rỗng | Ghi rõ không thuộc đường chạy hiện hành; giữ tương thích | Không mở lại API hay tạo bản ghi trang trí để lấp bảng |

### DATA-09 — Bộ dữ liệu nghiệm thu đầy đủ trên DB riêng

Đề xuất `backend/scripts/seed-acceptance-data.cjs` cùng manifest fixture có version, namespace tài khoản rõ ràng và khóa idempotency. Dùng PostgreSQL cùng extension/migration với ứng dụng. Tránh dùng bản sao chứa PII làm môi trường demo chia sẻ.

**Tối thiểu 8 hồ sơ tổng hợp dưới đây**; mỗi hồ sơ có nguồn sinh, trạng thái mong đợi và giá trị đối chiếu độc lập. Hai tài khoản ADMIN test riêng phục vụ soạn/duyệt quy định, chỉ trên DB riêng.

| Hồ sơ | Dữ liệu và luồng cần tạo | Kết quả phải chứng minh |
|---|---|---|
| A — cơ bản | Hồ sơ hoàn chỉnh, kế hoạch baseline và phiên bản mới, 3 tháng actual MATCHED | Preview → lưu → áp dụng → tải lại; đúng currentVersion và replay |
| B — thiếu dữ liệu | UNKNOWN, bản nháp chưa xong, hoặc thiếu năm giả định | INCOMPLETE đúng chỗ; không quy UNKNOWN thành 0 |
| C — BHXH hợp lệ | Lịch đóng theo tháng có chứng cứ test, quy định test đã qua workflow, estimate đủ điều kiện | Preview/save history → estimate → nguồn hưu trí trong v4 → replay |
| D — BHXH chưa đủ | Thiếu chứng cứ/điều kiện; lịch sử được sửa tạo revision mới | INVALID/REVIEW_REQUIRED theo case; kết quả cũ không được dùng mới khi lineage stale |
| E — vay và refinance | Khoản vay, actual DEBT_PAYMENT đã lưu; ngày, revision, allocation và khoản vay mới phù hợp | Chọn đúng giao dịch có thật; không sinh eventId thay thế; tổng phân bổ không vượt giao dịch; sai ngày/revision bị chặn |
| F — tài sản | Tài sản cho thuê/bán, nhận vốn và góp một phần/nhiều đợt | Chỉ khoản thực góp vào quỹ; không đếm trùng vốn/thu nhập; kiểm dời lịch/hủy/nhận muộn |
| G — vay mới/kế hoạch giả định | Giải ngân, trả nợ, refinance dự kiến với vòng đời được engine hiện hành hỗ trợ | Lưu/đọc lại đúng; dự kiến không tự tạo actual; thiếu bằng chứng không apply |
| H — cạnh tranh và quyền | Chủ tài khoản độc lập, version cũ, actual sửa sau preview | Hai tab một thắng/một conflict; đổi tài khoản không lộ dữ liệu/cache hoặc draft |

- Tạo hồ sơ → preview/lưu kế hoạch → actual → reforecast/source changes → phiên bản mới → apply qua service/API. BHXH đi theo history import-preview/save → estimate preview/save → nguồn v4. Không INSERT trực tiếp snapshot, proof, documentHash hoặc lịch sử revision.
- Với refinance giải ngân trước ngày tất toán, có fixture `proceedsAtSettlement` riêng; không suy tiền sẵn có từ dư gốc. Fixture phí/lãi/gốc phải đúng chứng cứ của case, không dồn toàn bộ vào gốc để cho test qua.
- Tạo báo cáo kỳ vọng gồm tổng số tiền theo tháng và bảng đóng góp/tất toán để đối chiếu độc lập; không lấy cùng hàm tính sản xuất sinh cả kết quả thực và expected.
- Nhận dạng fixture để chạy lại có kiểm tra; dữ liệu đã được sửa thủ công không bị ghi đè im lặng. Dọn bằng DB disposable hoặc manifest thuộc quyền sở hữu test; không chuyển cơ chế dọn đó sang DB ứng dụng.

### DATA-10 — Nghiệm thu xuyên frontend–API–DB

Tận dụng các verifier backend hiện có và `frontend/tests/{source-preview-lifecycle,refinance-actual-payment,fe11-domain-flows,fe11-session-conflicts}.spec.ts`; thêm bộ browser chạy API thật riêng, giữ nguyên bộ mock để phân biệt tầng bằng chứng. Handoff frontend ghi tại `docs/task-frontend.md` khi triển khai.

- [ ] Chạy lại audit trước/sau sửa: FK, schema, migration checksum; zero lỗi dữ liệu còn lại trong phạm vi đã duyệt.
- [ ] Rehearsal lỗi giữa transaction, retry cùng key, sửa đồng thời và thao tác bù đạt.
- [ ] HTTP + PostgreSQL: preview/save/apply/reload/replay, lịch sử giữ nguyên; v1/v2/v3 replay kiểm bằng fixture tương thích, v4 kiểm bằng case mới.
- [ ] Browser API thật: nhập BHXH/vay/tài sản; sửa lệnh làm preview hết hiệu lực; mất phản hồi sau khi server đã lưu rồi retry không tạo bản trùng; hai tab; đổi tài khoản trong khi request đang chạy.
- [ ] CSV/report khớp đúng version đã chọn, không tự dùng currentVersion mới; lọc tài khoản đúng.
- [ ] Tìm kiếm bài có dấu/không dấu; nguồn kiến thức chỉ dùng bản duyệt còn hiệu lực; UI thể hiện thiếu luật/thiếu chứng cứ đúng.
- [ ] Lưu báo cáo test có môi trường, thời điểm, phạm vi, số ca và artifacts đã loại PII; cập nhật FE-11 theo ca thật đã chạy, giữ các mục chưa kiểm là mở.

Mock pass không thay bằng chứng DB; bảng có dữ liệu không thay bằng chứng hành vi; không gọi nhà cung cấp/email thật trong bộ nghiệm thu nếu không nằm trong phạm vi triển khai.

### DATA-11 — Lỗi vận hành và dữ liệu hết hạn

- Đối chiếu timestamp/trace của 15 NOT_READY, 3 DATABASE_UNAVAILABLE và 1 INTERNAL_ERROR với log ứng dụng/deployment; phân biệt startup/shutdown, lỗi kết nối và lỗi nội bộ chưa phân loại. Không suy nguyên nhân chỉ từ số lượng.
- Sau khi xác định nguyên nhân, kiểm health và luồng bị lỗi; bổ sung giám sát phù hợp. Giữ log cũ làm bằng chứng.
- Token hết hạn/đã thu hồi và outbox COMPLETED không phải dữ liệu hỏng. Chỉ dọn theo retention đã xác định, chạy dry-run và theo dõi riêng; không gộp vào script sửa nội dung.

## 4. Điểm cần quyết định trước công việc phụ thuộc

| Quyết định | Mặc định/đề xuất của kế hoạch | Có thể làm trước khi chốt |
|---|---|---|
| Dữ liệu tổng hợp mới đặt ở đâu? | DB kiểm thử/staging riêng; muốn demo lâu dài thì dùng môi trường demo riêng | Hoàn tất fixture, manifest và bộ test |
| Ngày xuất bản 5 bài thiếu chứng cứ? | Chờ căn cứ hoặc quyết định công bố lại, không tự bù ngày | Sửa searchText ngay trong đợt A |
| Category FINANCIAL của phiếu hỗ trợ? | Duyệt theo nội dung từng phiếu | Chuẩn bị candidate/mapping có điều kiện |
| Ai soạn/duyệt quy định BHXH? | Người duyệt độc lập, quyền ADMIN hợp lệ; hiện chỉ có 1 ADMIN | Chuẩn bị corpus, draft, validation và test trên DB riêng |
| Có nhu cầu bật lại model/API legacy? | Không nằm trong kế hoạch này | Sửa dữ liệu tương thích, giữ báo cáo lỗi legacy tách riêng |

Không yêu cầu quyết định lại cho các thao tác đã được chủ dự án ủy quyền ở giai đoạn thực thi. Các điểm trên là thông tin nghiệp vụ/môi trường còn thiếu, không phải lý do dừng phần công việc độc lập.

## 5. Tiêu chí hoàn thành và bàn giao

- **Đợt A:** sửa xong các candidate có mapping/căn cứ đã chốt; công cụ chạy lại an toàn; nguyên nhân từ script tạo dữ liệu đã sửa; mọi ngoại lệ còn chờ có danh sách rõ ràng. Không gọi toàn đợt hoàn tất nếu còn metadata bắt buộc chưa được xử lý.
- **Đợt B:** nội dung/quy định đã kiểm nguồn và qua đúng workflow cho phạm vi cam kết; nêu rõ nhánh chưa phục vụ. Không yêu cầu tạo giao dịch hay hồ sơ giả cho người thật.
- **Đợt C:** đủ 8 case trên DB riêng, kiểm xuyên API/browser đạt, dữ liệu lưu replay được, không còn bằng chứng mock bị mô tả như DB thật.
- Bàn giao: báo cáo trước/sau, manifest sửa, hướng dẫn chạy/hoàn tác, kết quả rehearsal/backup restore, bộ fixture có version, ma trận test và phần còn mở. Không đưa bí mật hoặc bản xuất dữ liệu cá nhân vào Git.

**Bước triển khai đầu tiên:** DATA-00 → DATA-01/DATA-02 → rehearsal DATA-03/04; sau đó áp dụng từng nhóm đã đủ căn cứ. Lượt lập kế hoạch này chỉ ghi tài liệu, chưa sửa runtime hoặc DB.
