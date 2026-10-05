# Database — danh sách cần bổ sung

**Kiểm tra lại09:48 ngày05/10/2026:** đã bổ sung migration **202610050010_complete_financial_metadata**, không cần thêm thủ công. Chuỗi9migration thiếu `assumption_set_versions.modelCode/publishedBy/revision` và `retirement_goals.lifeExpectancy/riskLevel` khi khởi tạo mới; DBthật vốn có các cột này.0010 dùng ADD COLUMN IF NOT EXISTS, apply giữ fingerprint dữ liệu, không chỉnh migration cũ. Audit10/10checksum,34bảng nghiệp vụ+history,khôngpending/thiếucột,diff rỗng. **DBsạch vànângcấptừ4→10 đãPASS**,10integration vàxóachat hếthạn trênPGtạmPASS; container dọn đúnglabel. PostgreSQLcầnpgvector trước0003; prepare-test-db guardedlocal vàCIimage đãsửa/kiểm local, chưaCIremote. Xem [báo cáo](RECHECK-T00-T10.md). Backuprestore/vận hànhworker còn kiểm riêng; không reset DBthật hoặc dọn21refresh/2outbox/14audit hiện có.

**Sau T11/T12 —09:31 ngày05/10/2026:** migration **202610050009_secondary_modules đã áp dụng**, không cần tự thêm cột/bảng T11. Thêm notification_preferences (FK user,revision,3 lựa chọn mặc địnhfalse), partners revision/isVisible, partner_products revision/isVisible/updatedAt/annualFee/conditions/disclosure. Audit chỉ đọc34bảng nghiệp vụ+_prisma_migrations,9/9checksum,không pending,diff rỗng,vector0.8.2. Giữ50profiles,6partners,11products,3consultations. Catalog cũ mặc địnhẩn/chưa đủdisclosure: ADMIN rà nội dung/phí/điều kiện rồi mới hiển thị; không seed dữ liệu giả. Notification preferences hiện0 do chưa user nào lưu; deliveryAvailable=false. 26T11+18T12 HTTP/DBchecks rollback35bảng và2races cleanup chính xác IDPASS. Có18refresh,2outbox,14audit từ hoạt động hiện có; không dọn vì khác0. Không sửa/áp lại0005–0009. DB sạch/backup restore còn nghiệm thu T12, không reset DB đang dùng.

**Sau T10 — 01:39 ngày 05/10/2026:** migration **202610050008_ai_governance đã áp dụng**, không cần tự thêm bảng/cột T10. Thêm `ai_privacy`, metadata revision/expiry/indexhash và context/idempotency trong các bảng AI/knowledge hiện có. Audit chỉ đọc: **33 bảng nghiệp vụ + _prisma_migrations,8/8 checksum khớp, diff rỗng, không pending**. Không áp lại 0005–0008. 21 kiểm tra HTTP/DB rollback+3 concurrency đã kiểm cleanup; 50 hồ sơ và5 nguồn PENDING giữ nguyên, AI/privacy hiện0. User chưa chọn provider: không cần nhập token/embedding mẫu hoặc tự duyệt nguồn. ADMIN có thể rà text/ngày/nguồn rồi index LEXICAL_V1 và duyệt riêng qua API T10; INDEXED không đồng nghĩa có vector embedding. Giữ4 refresh/2 outbox hiện có, không dọn vì count khác 0. Provider thật và P36/vận hành sẽ kiểm riêng trước phát hành.

**Sau T09 — 01:09 ngày 05/10/2026:** đã bổ sung bằng migration **202610050007_monthly_actuals**, không cần tự thêm bảng/cột T09. Ba bảng mới: `actual_months`, `actual_month_revisions`, `actual_event_identities`; unique tháng/event và trigger bảo vệ lịch sử. Audit chỉ đọc: **32 bảng nghiệp vụ + _prisma_migrations**, **7/7 checksum khớp, diff rỗng, không pending**. Không áp lại migration 0005–0007. Giữ 50 hồ sơ v2 và 2 cấu hình công bố; actual/history/event/plan/version/model/idempotency production còn 0, để người dùng nhập/lưu qua API. 16 kiểm tra HTTP/DB rollback và 3 ca concurrency đã dọn fixture theo ID. Có 4 refresh_tokens/2 outbox_events hiện có từ hoạt động khác, không xóa để làm số lượng về 0. Knowledge vẫn cần rà nguồn/duyệt/embedding như ghi chú trước; T10 sẽ xử lý workflow, không tự seed/duyệt thay người phụ trách.

**Sau backend T08 (04/10/2026):** không cần bổ sung bảng/cột hoặc migration mới. Report/so sánh/mô phỏng/CSV dùng schema T07 đã áp dụng; 31 kiểm tra DB thật đã rollback, giữ 50 hồ sơ và 2 cấu hình hiện có. T09 sẽ rà riêng nhu cầu lưu sổ thực tế; không seed kế hoạch hoặc actuals để lấp trạng thái trống.

## Cập nhật sau T07 — 04/10/2026

Đã áp dụng migration **202610040006_plan_snapshots**: revision/baseline cho kế hoạch và trigger cấm sửa nội dung phiên bản. Hiện **6/6 migration** checksum khớp, schema diff rỗng, không pending; vẫn 29 bảng nghiệp vụ, không cần tự thêm bảng/cột T07. Không áp dụng lại migration 0005/0006. Model/plan/snapshot sẽ được backend tạo khi người dùng lưu phiên bản; không cần seed tay. Các trạng thái cấu hình/hồ sơ/knowledge ở cập nhật 19:51 dưới vẫn là căn cứ; còn phải duyệt nguồn và tạo embedding cho kho tri thức.

## Cập nhật thay thế — 19:51 ngày 04/10/2026, giờ Việt Nam

Rà soát DB thật chỉ đọc lại sau T06: schema vẫn đủ, diff rỗng, 5/5 migration checksum khớp. **Đã có 1 bộ T03 và 1 policy T04 PUBLISHED/có hiệu lực; 50/50 hồ sơ hiện schemaVersion 2.** Không yêu cầu tạo thêm chỉ vì ghi chú 0/v1 buổi sáng bên dưới. Kiểm tra này xác nhận metadata/số lượng, chưa thẩm định nguồn/tỷ lệ/chất lượng hồ sơ hoặc đủ đầu vào từng preview.

Knowledge hiện **5 nguồn PENDING, chưa duyệt; 18 chunks, 0 embedding**: phần còn cần xử lý là rà nội dung/duyệt nguồn và tạo embedding đúng luồng, không chỉ thêm bản ghi. Model/plan/snapshot vẫn 0; để backend T07 tạo qua luồng version, không seed thủ công. T06 không thêm bảng/cột và không lưu fixtures; 13 kiểm tra thật đã rollback, 50 hồ sơ và 2 cấu hình có sẵn giữ nguyên.

Các mục bên dưới giữ làm checklist chuẩn bị và **ảnh chụp 09:52**, không phải hiện trạng sau cập nhật này.

Kiểm tra trực tiếp DB thật lúc **09:52 ngày 04/10/2026, giờ Việt Nam**, chế độ chỉ đọc. Đây là ảnh chụp trạng thái tại thời điểm kiểm tra; không ghi/migrate/seed dữ liệu.

## 1. Cấu trúc hiện tại đã đủ

- Đủ **29 bảng nghiệp vụ**, cộng `_prisma_migrations` là 30 bảng public.
- Không thiếu bảng/cột đối với Prisma client; Prisma migrate diff giữa DB và `prisma/schema.prisma` trả **không có chênh lệch** trong phạm vi Prisma quản lý.
- **5/5 migration** đã hoàn tất; checksum khớp file trong repo; không có migration chờ áp dụng.
- Đã có extension **vector 0.8.2**.
- Backend T03/T04 lưu cấu hình có phiên bản trong `assumption_set_versions`; T05 lưu khai báo hưu trong JSON `financial_profiles.profileData`. Không cần thêm bảng riêng cho các phần này.

## 2. Cần chuẩn bị ngay: bộ giả định T03

**Hiện trạng:** `assumption_set_versions` có **0 bản ghi**. `financial_assumptions` có 8 bản ghi kiểu cũ nhưng không được các API T03/T04 dùng thay cho bộ đã duyệt.

Cần ít nhất một bộ đầy đủ, có nguồn và được duyệt:

- [ ] Tên bộ, ngày hiệu lực, năm bắt đầu/kết thúc dự phóng, lý do ban hành.
- [ ] Lạm phát từng năm; phân biệt giai đoạn dự báo có nguồn với giả định dài hạn nội bộ. Đủ toàn bộ năm trong phạm vi bộ, không tự kéo dài năm cuối.
- [ ] Danh sách nhóm tài sản và dải thời hạn áp dụng.
- [ ] Lợi suất theo từng năm × nhóm tài sản × dải thời hạn; ghi rõ lãi hiệu dụng hay danh nghĩa, số lần ghép nếu có, giá trị thực hay danh nghĩa.
- [ ] Phí và thuế: đã nằm trong lợi suất hay phải trừ riêng; nếu trừ riêng phải có mức và quy ước. Không tự coi chưa biết là 0.
- [ ] Mỗi nguồn có đơn vị công bố, tên tài liệu, URL HTTPS, phiên bản/kỳ công bố, ngày công bố/ngày lấy và khoảng năm bao phủ.
- [ ] CPI lịch sử, nếu cung cấp, lưu riêng để tham chiếu; không dùng làm dự báo tự động.

Nạp qua `/api/v1/admin/assumptions`: tạo nháp → validate → impact → approve → publish. Không tự INSERT bản PUBLISHED vì backend kiểm tra revision/hash phê duyệt. Người dùng cần quyết định số liệu/nghiệp vụ; backend không lấy fixture kiểm thử làm cấu hình thật.

Contract: [ASSUMPTIONS.md](../backend/docs/ASSUMPTIONS.md), [assumptions.openapi.yaml](../backend/docs/assumptions.openapi.yaml).

## 3. Cần chuẩn bị ngay: chính sách danh mục T04

**Hiện trạng:** chưa có bản `portfolio-policy-v1` trong `assumption_set_versions`. Tạo sau T03 vì phải chốt `assumptionVersionId` của bộ T03 đã công bố.

- [ ] Câu hỏi, lựa chọn và điểm cho đủ 6 chiều: mục tiêu, thời hạn, thanh khoản, chịu lỗ, kinh nghiệm, khả năng tài chính.
- [ ] Các ngưỡng phân nhóm rủi ro, tên nhóm, khoảng điểm.
- [ ] Danh mục mẫu: nhóm tài sản, tỷ trọng, khoảng tháng áp dụng từng phân bổ; mỗi đoạn có tổng tỷ trọng 100%.
- [ ] Quy tắc lựa chọn danh mục theo nhóm rủi ro, từng chiều đánh giá, thời hạn và nhu cầu thanh khoản; có lời giải thích.
- [ ] Chu kỳ tái cân bằng, phí, căn cứ tính phí và thời gian bao phủ của danh mục.
- [ ] Ba kịch bản API hiện hành `BASE`, `ADVERSE`, `FAVORABLE`: chênh lệch lạm phát/lợi suất theo năm và nhóm tài sản, có căn cứ. Trước khi chốt nội dung cần thống nhất tên/ý nghĩa với P32 trong task.md, không đổi nhãn để che sự khác nhau về kịch bản.
- [ ] Nguồn, phiên bản tài liệu, ngày rà soát và ngày hiệu lực của chính sách.

Nạp qua `/api/v1/admin/portfolio-policies`: tạo nháp → validate → approve → publish. Không tự gán điểm/ngưỡng/tỷ trọng từ dữ liệu kiểm thử.

Contract: [PORTFOLIOS.md](../backend/docs/PORTFOLIOS.md), [portfolios.openapi.yaml](../backend/docs/portfolios.openapi.yaml).

## 4. Cần bổ sung theo từng người dùng: hồ sơ v2 và T05

**Hiện trạng:** 50 hồ sơ, cả 50 là `schemaVersion: 1`, chưa có hồ sơ v2. Đây là dữ liệu cũ cần được chủ hồ sơ rà soát; không chỉ đổi cột schemaVersion từ 1 sang 2.

- [ ] Tháng sinh, tháng nghỉ hưu mong muốn, tháng bắt đầu nhận hưu; khai riêng từng mốc.
- [ ] Từng nguồn thu/khoản chi, số tiền, lịch hiệu lực, trạng thái biết/chưa biết/không áp dụng.
- [ ] Từng tài sản, ngày định giá, phần sở hữu, phần dành hưu trí/dự phòng/mục tiêu khác và tính thanh khoản.
- [ ] Từng khoản vay: hợp đồng, lãi suất, lịch trả, phí, phần trả nợ/sở hữu dư nợ, phạm vi nghĩa vụ nợ chung. Thiếu hợp đồng thì không giả lập thành một lịch vay chính thức.
- [ ] Lương hưu tự khai: số tiền hoặc trạng thái chưa biết, cơ sở tiền, nguồn, ngày ước tính và lịch điều chỉnh nếu có. Không dùng lương đóng BHXH để suy quyền lợi tự động.
- [ ] Điều kiện lao động phục vụ tra tuổi tham chiếu; trường hợp chưa biết/đặc thù giữ trạng thái cần rà soát.

Lưu bằng API onboarding/profile v2 để giữ validation, revision và dữ liệu legacy. Contract: [FINANCIAL_PROFILE_V2.md](../backend/docs/FINANCIAL_PROFILE_V2.md), [PENSIONS.md](../backend/docs/PENSIONS.md).

## 5. Chuẩn bị tài liệu AI cho T10

**Hiện trạng:** `knowledge_sources`: 0; `knowledge_chunks`: 0; chưa có embedding nào. Extension vector đã có nên không cần cài lại.

- [ ] Chuẩn bị tài liệu được phép dùng: quy tắc sản phẩm, cách hiểu chỉ số, nguồn chính sách BHXH, nội dung hỏi đáp.
- [ ] Kèm nguồn/URL, phiên bản, ngày hiệu lực và người/phạm vi phê duyệt.
- [ ] Tại T10, xử lý nhập tài liệu → kiểm tra/phê duyệt → chia đoạn → tạo embedding thực → chỉ đưa nguồn được phép vào AI. Không tự đặt trạng thái INDEXED hoặc isApproved để giả bộ đã xử lý.

Phần này không chặn lập trình engine T06; chưa coi có bảng là đã có dịch vụ AI hoạt động.

## 6. Những bảng trống không cần người dùng nhập tay

| Nhóm | Hiện trạng | Hướng xử lý |
|---|---|---|
| `financial_model_versions` | 0 | Backend đăng ký phiên bản engine sau kiểm chứng T06/T07; không nhập model legacy để mở khóa luồng mới. |
| `retirement_plans`, `plan_versions` | 0, 0 | Sinh qua luồng tính/lưu/áp dụng T06–T08; không tạo snapshot giả. |
| `simulation_scenarios`, `monthly_trackings` | 0, 0 | Sinh từ thao tác mô phỏng và ghi thực tế sau khi nối các luồng tương ứng. |
| Nháp, idempotency, thông báo, hội thoại | Một số bảng đang trống | Dữ liệu vận hành phát sinh theo sử dụng; không phải thiếu schema hoặc cần seed bắt buộc. |

Đã có 1 ADMIN hoạt động, 5 bài viết, 6 đối tác và 11 sản phẩm. Chỉ kiểm đếm, chưa thẩm định nội dung/phí/tính đúng của các bản ghi đó; không cần tạo thêm chỉ vì muốn lấp đầy bảng.

**Thứ tự bổ sung:** bộ T03 → chính sách T04 → chủ hồ sơ xác nhận v2/lương hưu → nguồn AI khi triển khai T10. Các bảng kế hoạch/kết quả để backend tạo đúng luồng.

## Bằng chứng kiểm tra

Script: `backend/scripts/audit-database-readonly.cjs`. Truy vấn metadata/số lượng trong transaction READ ONLY; không in thông tin đăng nhập hay dữ liệu cá nhân. Prisma migrate diff chỉ in khác biệt, không chạy SQL thay đổi.

Báo cáo máy: `backend/.tmp/database-audit.json`; diff rỗng: `backend/.tmp/database-schema-diff.sql`. Các file `.tmp` là bằng chứng cục bộ, không phải migration cần áp dụng.
