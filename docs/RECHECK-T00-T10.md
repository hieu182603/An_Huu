# Kiểm tra lại T00, frontend T06–T10, T10 và Q13/Q15

> Cập nhật sau báo cáo này: ngày05/10/2026 chủ dự án đã xác nhận hướng P13/P15 và tiền dư chỉ góp số người dùng xác nhận. Trạng thái “chưa có quyết định” bên dưới ghi lại thời điểm kiểm tra trước xác nhận; kế hoạch hiện hành là `task.md` mục5/7.1. Chưa có code hoặc kết quả kiểm thử mới cho phần bổ sung.

Ngày 05/10/2026, theo bốn nhóm trong ảnh chủ dự án gửi. Đây là kiểm tra kỹ thuật; chưa xác nhận nghiệm thu toàn sản phẩm. Không sửa frontend trong đợt này; việc UI được giao ở mục **FE-RECHECK-20261005** trong [task-frontend.md](task-frontend.md).

## T00: đã sửa thiếu migration và quy trình DB kiểm thử

Chín migration cũ chạy xong trên DB sạch nhưng thiếu năm cột so với schema: `assumption_set_versions.modelCode/publishedBy/revision` và `retirement_goals.lifeExpectancy/riskLevel`. DB đang dùng đã có các cột này, nên kiểm schema DB đó không phát hiện thiếu sót của chuỗi cài mới.

Đã thêm `202610050010_complete_financial_metadata` với `ADD COLUMN IF NOT EXISTS`; giữ nguyên checksum các migration cũ. Đã kiểm DDL trong transaction rollback, áp dụng lên DB thật và đối chiếu dữ liệu không đổi. Audit chỉ đọc lúc **09:48 VN**: 34 bảng nghiệp vụ + bảng migration, **10/10 checksum khớp, không pending, không thiếu cột/bảng, schema diff rỗng**. Không cần chủ dự án thêm các cột này thủ công.

Script `backend/scripts/verify-clean-upgrade.cjs` tạo PostgreSQL 16/pgvector trong Docker, chỉ mở cổng localhost, mật khẩu ngẫu nhiên, xóa đúng container/volume có nhãn của lần chạy. Không dùng `.env` hoặc DB ứng dụng làm fallback. Kết quả:

- DB không bật extension: xác nhận migration cần kiểu `vector` và thất bại như dự kiến.
- DB sạch qua chính `prepare-test-db.cjs`: tạo extension trước migration, **10 migration và diff rỗng**.
- DB ở bốn migration đầu + dữ liệu cũ tổng hợp: nâng cấp đủ 10 migration, giữ hồ sơ JSON/message/đối tác; backfill expiry đúng 30 ngày và không cấp consent ngầm. Đây là fixture phiên bản cũ, **không phải phục hồi bản backup production**.
- **10/10 integration tests, hai file PASS**, kiểm xóa chat hết hạn và giữ chat còn hạn PASS; container đã được dọn.
- CI đổi dịch vụ PostgreSQL sang image pgvector đã kiểm chứng, ghim digest; script chuẩn bị vẫn bắt buộc `TEST_DATABASE_URL` localhost và tên `anhuu_*_test`. Quy trình chạy đạt tại máy này; **chưa chạy GitHub Actions**.

Artifact cuối: `backend/.cache/migration-1665fb0f-b373-4d50-b57b-ec871598ab0a/{result.json,clean.log,prior-four.log,upgrade-to-current.log,diff-clean.log,diff-upgrade.log,integration.log}`; dùng lần này làm kết quả hiện hành.

Browser dùng runner riêng cổng động, không dùng `frontend/tests/setup-preview.ts` còn hành vi `freePort/taskkill`. Kết quả: **15/41 PASS, 26 FAIL, không skipped**, 558.95 giây, exit1 và thoát bình thường, không treo teardown. Một phần lỗi do selector/fixture cũ (knowledge thiếu API fixture, tư vấn đã nghỉ vẫn chờ nút); lỗi UI đo được gồm landing tràn579/320px và583/390px, admin/content tràn373/320px, input tìm kiếm che nút menu admin landscape. Chi tiết trong [T12-acceptance.md](T12-acceptance.md) và file bàn giao UI. Browser tài chính nối DB, fixture API đầy đủ và lifecycle runner frontend vẫn phải hoàn tất. Build backend mặc định vẫn vướng DLL Prisma đang được tiến trình khác giữ; không dừng tiến trình đó. Typecheck test và 62/62 tests AI/actuals/engine/report chạy lại đạt; bằng chứng client generation riêng + TypeScript ở checkpoint T12 trước không được ghi thành build mặc định đạt.

## Frontend T06–T10: chưa đủ điều kiện nghiệm thu

### Lỗi đã tái hiện bằng cách chạy hàm frontend

`backend/scripts/verify-frontend-wire.cjs` thực thi nguyên hàm service frontend trong bộ nhớ và đưa request vào Express. Auth/session và DB dùng test double; không provider/DB thật. Artifact `backend/.cache/frontend-wire-audit.json` ghi method, tên field và status, không ghi dữ liệu cá nhân.

**14 thao tác ghi đều gửi sai hình dạng request và trả 400/404.** `authenticatedRequest(path, body, method, extraHeaders)` bị gọi như `fetch(path, RequestInit)`, khiến object `{method, body, headers}` trở thành JSON payload, request luôn POST và mất header idempotency. Ảnh hưởng: lưu tháng thực tế, reforecast, consent AI, explain/simulate, tạo/đổi tên/sửa/xóa chat, xóa toàn bộ chat, tạo/sửa/index/duyệt tri thức. GET danh sách kế hoạch đối chứng trả 200. Đây là lỗi transport đã tái hiện; không phải 14 ca nghiệm thu nghiệp vụ đầy đủ. Các service plans/retirement đã dùng chữ ký đúng, không kết luận toàn bộ UI chưa nối API.

**Số tiền bị sai ở đối soát phía UI:** đầu kỳ `9007199254740993.25`, góp `0.01`, cuối kỳ `9007199254740993.26`; `calculateLocalReconciliation` trả góp `0`, cuối tính `9007199254740994` do Number/Math.round. Backend dùng số thập phân chính xác; UI cần giữ chuỗi và kết quả đối soát backend, hoặc phép toán Decimal tương thích, chỉ định dạng ở bước hiển thị.

### Lỗi/khả năng lỗi xác định từ mã nguồn, chưa tái hiện qua browser

| Vị trí | Vấn đề cần sửa | Tiêu chí kiểm lại |
| --- | --- | --- |
| RetirementPlanPage / SimulationTrackingPage | Tự chọn câu trả lời rủi ro đầu tiên; điền mặc định tuổi/chi tiêu/thanh khoản, reserve/terminal=0 và danh sách rỗng | Dùng dữ liệu người dùng đã xác nhận; thiếu đầu vào phải chỉ rõ, không tự hợp thức hóa preview |
| SimulationTrackingPage | What-if gửi loại tài sản `CASH_SAVINGS/REAL_ESTATE/STOCK_FUND` như assetId | Gửi ID tài sản thật thuộc hồ sơ v2 |
| RetirementPlanPage và RetirementPlanContext | Save rồi apply dùng closure plan/revision cũ; bỏ qua kết quả false nhưng vẫn báo đã áp dụng | Dùng planId/revision trả về sau save, chỉ toast sau apply thành công; kiểm lần đầu tạo và version mới |
| RetirementPlanContext | Khi đổi USER A sang USER B không xóa state ngay; request cũ không bị vô hiệu hóa theo tài khoản | Reset dữ liệu và invalidation theo account; chậm mạng/logout/chuyển tài khoản không hiện dữ liệu A ở B |
| UserDashboard / RetirementGoalPage / FinancialProfileContext | Dữ liệu legacy/local calculator, tên trường surplus không khớp; thiếu kết quả bị lấp số; nhãn hoàn thiện 90% cố định | Dashboard/goal dùng summary đúng version; null khác 0; completion từ dữ liệu thật |
| AccountPage / UserAccountModal | CSV vẫn dùng công thức cục bộ | Xuất API theo planId/versionId đã chọn, khớp report và history |
| AdminAIConfigPages | Prompt và phần giả định legacy lưu state/toast; tồn tại song song với phần cấu hình version có API | Bỏ lưu giả; không nhầm thẻ demo với workflow draft/review/approve/publish thật |
| AIAssistantPage | Tạo chat lỗi có thể chuyển local; xuất JSON đang dựng từ state màn hình | Khi chọn lưu history phải báo lỗi API; export qua endpoint owned và đúng context/version |

## T10: backend sẵn phần chuẩn bị, dịch vụ/vận hành còn mở

Giữ lựa chọn **chưa chọn nhà cung cấp AI**. Production không có provider; fallback không được trình bày thành AI ngoài đang hoạt động. Tri thức dùng `LEXICAL_V1`, không đồng nghĩa đã có embedding. DB đang dùng có năm nguồn PENDING chưa duyệt; không tự index/duyệt thay người phụ trách.

Kiểm tra lại nhóm AI/actuals/engine/report **62 tests PASS**. Kiểm retention trên PostgreSQL tạm: xóa cả conversation/messages/context hết hạn, giữ conversation chưa hết hạn. Đây là bằng chứng code xử lý đúng, **chưa chứng minh lịch chạy ở môi trường triển khai hoặc backup đã được xử lý**.

`worker.ts` tạo mail sender trước vòng lặp; thiếu SMTP khiến worker không khởi động được và purge định kỳ cũng không chạy. Workflow trong repo chỉ deploy web app, chưa thể hiện deployment worker riêng. Vận hành cần xác nhận worker đã chạy với cấu hình cần thiết hoặc cấu hình job retention riêng, có log/giám sát và kiểm backup/restore. Không khởi chạy worker thật trong đợt này vì có thể gửi outbox đang chờ. Không suy từ repo rằng hạ tầng ngoài chắc chắn chưa có worker.

P36 chưa đóng: UI consent/sửa/xóa đang bị lỗi request nói trên; quyền dữ liệu toàn tài khoản, chính sách backup và rà pháp lý vẫn cần kiểm riêng. Đợt này không có rà pháp lý mới và không tuyên bố tuân thủ.

## Q13 / Q15: kiểm được hành vi, chưa thay quyết định nghiệp vụ

- **Q13:** API production chỉ đóng `END_OF_MONTH`; nhánh `START_OF_MONTH_RESEARCH` chỉ phục vụ nghiên cứu/test. Golden tests kiểm độc lập phần góp đầu kỳ thêm một kỳ lãi, vốn đầu không tự thêm kỳ. Không tự bật nhánh nghiên cứu.
- **Q15:** tiền dư sau hưu được theo dõi riêng, không tự nhập vào quỹ; khoản góp thực tế phải được khai rõ. Test phân biệt thu vượt/bằng/thấp chi và không biến dư thành góp đã đạt. Chưa có lựa chọn nghiệp vụ xác nhận việc tái đầu tư tiền dư.

Hai mục còn mở là quyết định Q13/Q15; không mở lại các yêu cầu nghiệp vụ đã chốt khác. Ưu tiên tiếp: AI frontend sửa FE-RECHECK-20261005, chạy lại service/browser và toàn luồng version/actual/CSV; vận hành xác nhận build/worker/backup. Không cần thêm schema thủ công cho các phần vừa kiểm.
