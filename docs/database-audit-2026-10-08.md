# Kiểm tra dữ liệu DB thật — 08/10/2026

Kiểm tra DB PostgreSQL được cấu hình trong `backend/.env`, không dùng mock hoặc DB fixture. Không công bố địa chỉ kết nối, email, tên, mật khẩu/hash, token, nội dung trao đổi hay số tiền cá nhân. Không chạy seed, migration, sửa/xóa dữ liệu, gửi email hoặc gọi nhà cung cấp.

- Cấu trúc kiểm tra lúc **11:54 giờ Việt Nam**; nội dung lúc **11:59 giờ Việt Nam**, ngày 08/10/2026.
- **40 bảng ứng dụng, 400 bản ghi**, cộng bảng lịch sử migration. Đây là ảnh chụp tại thời điểm kiểm tra; các lượt cấu trúc và nội dung là các snapshot riêng.
- Giao dịch nội dung được PostgreSQL xác nhận `transaction_read_only=on`, `repeatable read`.
- 13/13 migration hoàn tất, checksum khớp file hiện tại; không pending; schema diff rỗng; vector 0.8.2.
- 38/38 khóa ngoại đã được xác thực; truy vấn từng khóa không có bản ghi mồ côi. Không có chỉ mục invalid/not-ready.
- Tất cả bảng đã được thống kê, kiểm trường bắt buộc null, bộ đếm âm và thứ tự thời gian ở các cột áp dụng: không phát hiện bất thường theo những điều kiện này.

## Các vấn đề cần xử lý

| Mức | Dữ liệu | Bằng chứng và ảnh hưởng |
|---|---|---|
| Cần sửa | 50/50 mục tiêu hưu trí | `lifestyle="comfortable"`, trong khi schema nhận `COMFORTABLE`, `ESSENTIAL`, `FLEXIBLE`. Gọi trực tiếp dịch vụ đọc `FinancialService.getGoal` với toàn bộ chủ sở hữu trả **50 GOAL_INCOMPLETE**. Dịch vụ legacy này không được nối trong bộ services/router hiện tại; chưa kết luận màn hình hiện tại gặp HTTP 409 vì lỗi này. |
| Cần sửa | 50/50 hồ sơ tài chính | Cột `asOfDate` là **2026-10-07**, JSON `valuationDate` là **2026-10-01**. JSON vẫn hợp lệ; dịch vụ hồ sơ hiện hành khi lưu v2 đặt hai giá trị cùng ngày. Đây là dữ liệu không nhất quán; luồng dự báo hiện hành dùng ngày trong JSON, chưa chứng minh kết quả tính bị sai. |
| Cần sửa | 5/5 bài đã xuất bản | `publishedAt=null`, `searchText` rỗng. Nội dung bài qua schema, nhưng tìm kiếm có từ khóa dựa vào `searchText` sẽ loại các bài này. Không tự suy diễn ngày xuất bản từ ngày tạo. |
| Chưa sẵn sàng | 5/5 nguồn kiến thức, 18 đoạn | Nguồn đều `PENDING`, chưa duyệt, `rawContent=null`; 18 đoạn không có metadata `LEXICAL_V1`; **0 nguồn đủ điều kiện truy xuất**. Cần văn bản gốc trước khi lập chỉ mục, sau đó duyệt riêng. Không có embedding không tự nó là lỗi: bộ truy xuất hiện hành dùng lexical. |
| Cần rà soát | 4/4 phiếu hỗ trợ | `category` không thuộc enum tiếng Việt mà API tạo phiếu hiện hành nhận. Đọc và trả lời phiếu hiện tại không parse lại trường này, nên chưa có bằng chứng các thao tác đó thất bại. 7/7 tin nhắn hỗ trợ qua schema. |
| Thiếu cấu hình legacy | `financial_model_versions` rỗng | Dịch vụ legacy `benchmarks()` trả `BENCHMARKS_UNAVAILABLE`. Hai cấu hình hiện hành `assumption-series-v2` và `portfolio-policy-v1` vẫn đọc được, đều VALID và khớp hash phê duyệt/liên kết; không đánh đồng lỗi legacy với tất cả bộ máy tính. |

Nguồn tạo dữ liệu cần rà soát là `backend/scripts/seed-azure.cjs`: code ghi `comfortable`, đặt ngày JSON 01/10 nhưng không đặt cột `asOfDate` trong lệnh tạo hồ sơ. **51/53 email trong DB trùng chính xác email viết trong script seed**; đây là bằng chứng trùng dữ liệu seed, không chứng minh danh tính hay nguồn gốc của toàn bộ 400 bản ghi. Không chạy lại script seed để chữa dữ liệu vì script có thao tác xóa diện rộng.

## Những phần đã kiểm tra đạt

- 53/53 tài khoản qua kiểm email/tên; không trùng email sau chuẩn hóa, không tài khoản ACTIVE thiếu xác minh; định dạng hash mật khẩu/token đúng mẫu. Không kiểm mật khẩu thực tế hay khả năng đăng nhập.
- 50/50 hồ sơ v2 qua schema, tính được các trường tổng hợp, đều giữ bản legacy. 38 hồ sơ có cảnh báo nhà ở chưa là tiền hưu trí: đây là quy tắc xử lý tài sản, không phải JSON hỏng.
- 50 hồ sơ đều có mục tiêu tương ứng; 2 tài khoản USER chưa có hồ sơ, chưa đủ căn cứ coi là lỗi onboarding.
- 1 bản nháp, 6 đối tác, 11 sản phẩm, 5 nội dung bài và 3 cấu hình hệ thống qua schema tương ứng. 6 đối tác hiển thị; 11 sản phẩm đang ẩn.
- Hai phiên bản cấu hình hiện hành đã công bố, có hiệu lực, VALID; hash phê duyệt và liên kết chính sách–giả định khớp. Phạm vi năm của bộ giả định: 2026–2055; chưa kiểm tính phù hợp với mọi thời hạn dự báo cá nhân hoặc độ đúng của nguồn kinh tế bên ngoài.
- 8 outbox đều COMPLETED, 8 receipt tương ứng, không job quá hạn/lease lỗi; payload đã dọn. Không suy ra email đã đến hộp thư.
- Liên kết chủ sở hữu được kiểm thêm cho kế hoạch, actual, tin nhắn hỗ trợ và người phụ trách tư vấn: không sai lệch; kiểm ở các bảng rỗng không chứng minh luồng ghi hoạt động.
- 72 refresh token: 69 đã thu hồi, 15 hết hạn, 2 còn hạn/chưa dùng/chưa thu hồi; các nhóm có thể giao nhau. Không lệch securityVersion trong nhóm đang hoạt động. 8 token xác minh đều hết hạn, 7 đã dùng; chưa xóa token.
- 1 bản đồng ý AI khớp policy hiện hành; không phát hiện lưu lịch sử khi chưa đồng ý xử lý.

## Nhật ký và khoảng trống bằng chứng

- 19 system log hiện có: **15 NOT_READY/503**, **3 DATABASE_UNAVAILABLE/503**, **1 INTERNAL_ERROR/500**. Đây là lỗi lịch sử ngày 07/10; lượt kiểm hiện tại kết nối DB thành công. Chưa xác định nguyên nhân gốc của INTERNAL_ERROR hoặc đối chiếu log máy chủ/deployment.
- 22 login log: 15 SUCCESS, 7 FAILED. Không suy ra hành vi tấn công từ số lượng này.
- **16 bảng rỗng**, gồm kế hoạch/phiên bản, actual/lịch sử/identity, quy định BHXH/lịch đóng/kết quả BHXH, hội thoại AI và một số bảng khác. Vì vậy không có snapshot thực để kiểm replay, hash lịch sử, đối soát refinance hoặc liên kết BHXH trên dữ liệu đang lưu.
- Kiểm tra bao phủ toàn bộ bảng và toàn bộ bản ghi theo các điều kiện đã nêu; không phải xác nhận mọi trường văn bản/JSON có ý nghĩa nghiệp vụ đúng, mọi số tiền/chứng từ chính xác, hay mọi hành trình HTTP/browser chạy thành công. Chưa chạy thử ghi, thử tải, phục hồi backup, hoặc gọi dịch vụ ngoài.
- Không có sửa chữa dữ liệu nào được thực hiện. Sửa từng nhóm cần mapping đúng nghiệp vụ và cập nhật có điều kiện; không tự viết lại ngày, category hay phê duyệt tài liệu.

## Bằng chứng và cách chạy lại

- Cấu trúc: [database-audit.json](../backend/.tmp/database-audit.json), [database-schema-diff.sql](../backend/.tmp/database-schema-diff.sql).
- Nội dung: [database-content-audit.json](../backend/.tmp/database-content-audit.json), chỉ có số lượng, mã lỗi, trạng thái và ngày tổng hợp.
- Script: [audit-database-readonly.cjs](../backend/scripts/audit-database-readonly.cjs), [audit-database-content-readonly.cjs](../backend/scripts/audit-database-content-readonly.cjs).
- Chạy từ thư mục `backend`: `node scripts/audit-database-readonly.cjs`, sau đó `node scripts/audit-database-content-readonly.cjs`. Hai script chỉ ghi báo cáo cục bộ. Kết quả `.tmp` không được Git theo dõi.
- Lượt kiểm đã chạy thành công cả hai script trên DB thật; script nội dung còn được kiểm cú pháp. Không chạy lại test ứng dụng vì lượt này không sửa runtime ứng dụng.

## Kiểm kê tất cả bảng ứng dụng

| Bảng | Bản ghi |
|---|---:|
| users | 53 |
| refresh_tokens | 72 |
| verification_tokens | 8 |
| financial_profiles | 50 |
| onboarding_drafts | 1 |
| retirement_goals | 50 |
| financial_model_versions | 0 |
| assumption_set_versions | 2 |
| retirement_plans | 0 |
| plan_versions | 0 |
| outbox_events | 8 |
| processed_events | 8 |
| idempotency_records | 0 |
| simulation_scenarios | 0 |
| monthly_trackings | 0 |
| consultations | 3 |
| articles | 5 |
| saved_articles | 0 |
| support_tickets | 4 |
| support_messages | 7 |
| notifications | 8 |
| partners | 6 |
| partner_products | 11 |
| financial_assumptions | 8 |
| audit_logs | 28 |
| system_settings | 3 |
| login_logs | 22 |
| system_logs | 19 |
| knowledge_sources | 5 |
| knowledge_chunks | 18 |
| ai_conversations | 0 |
| ai_messages | 0 |
| legal_rule_set_versions | 0 |
| social_insurance_history_versions | 0 |
| pension_estimates | 0 |
| notification_preferences | 0 |
| ai_privacy | 1 |
| actual_months | 0 |
| actual_month_revisions | 0 |
| actual_event_identities | 0 |

Tổng: 400 bản ghi.
