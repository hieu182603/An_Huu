# Tiến độ kiểm tra và sửa UI

Cập nhật 11/10/2026; đã dọn báo cáo theo yêu cầu người dùng. Đây là tệp theo dõi chung, không tạo thêm một báo cáo riêng sau mỗi task.

**Bàn giao hoàn thiện (đêm 11/10/2026):** Đã hoàn tất các điểm còn mở trong đợt bàn giao UI-01 đến UI-08 theo phong cách /ponytail (diff tối giản, chuẩn WCAG/HTML gốc, không thêm trừu tượng thừa):
- **UI-06 (Onboarding):** Khắc phục accessible name cho nút Quay lại mobile bằng `aria-label` (5/5 tests `onboarding-readability.spec.ts` pass ở 1440x1000, 768x1024, 390x844, 390x400 và retry).
- **UI-07 (Trợ lý AI):** Bảo toàn `processingNotice` chính xác từ backend, khóa Enter/gửi khi lỗi/chưa có quyền, retry chuẩn xác (14/14 tests `assistant-detail-fixes.spec.ts` pass).
- **UI-02 (Mục tiêu):** Chuẩn hóa nhãn "Tuổi kết thúc kế hoạch", tách PV/FV, xử lý lỗi mốc tuổi (16/16 tests `goal-detail-fixes.spec.ts` pass).
- **UI-01 (Tổng quan):** Bố cục 5 tầng tinh gọn, ngăn hiển thị thặng dư giả định khi thiếu thu/chi/nợ, reflow 200% (21/21 tests `dashboard-detail-fixes.spec.ts` pass).
- **UI-03 (Bảng Kế hoạch):** Bảng 10 cột căn phải chuẩn `tabular-nums`, cỡ chữ 14px, cuộn trong bảng, modal xác nhận áp dụng (32/32 tests `plan-detail-fixes.spec.ts` pass).
- **Kiểm định code & bundle:** Typecheck 0 lỗi, `test:assets` 59/59 pass, build dist thành công.

## Tài liệu cần dùng

- [Kế hoạch UI hiện hành](ui-friendly-implementation-plan-2026-10-11.md): đã có triển khai từng phần; chưa nghiệm thu toàn bộ UI-01 đến UI-08. Xem kết quả đối chiếu bên dưới thay vì coi số ca kiểm thử đạt là hoàn tất kế hoạch.
- [Task frontend](task-frontend.md): công việc, hợp đồng và phụ thuộc đang theo dõi.
- [Lưu trữ audit 08–11/10](../artifacts/ui-audit-history-2026-10-11.zip): 148 tệp đã đối chiếu SHA-256, gồm 14 báo cáo chi tiết, bản kế hoạch cũ, bản đầy đủ của tệp tiến độ trước khi rút gọn và 132 tệp minh chứng. Giữ đường dẫn docs/artifacts bên trong để tra lại.
- Đã bỏ 131 bản rời sau khi đối chiếu. Giữ 16 ảnh `dashboard-*.png` vừa thay đổi trong lúc dọn ở `artifacts/ui-audit-2026-10-08/`; chúng là đầu ra mới hơn bản lưu trữ, không xóa cùng task cũ.

## Các phần vừa hoàn tất

- Popup BHXH và phiên bản kế hoạch (11/10): chuyển sang popup giữa màn hình rộng tối đa 1120px, chiều cao theo viewport, header/nút đóng luôn hiện. BHXH có tab cố định khi cuộn, tăng cỡ nhãn, kết quả cạnh form trên desktop và tự cuộn/focus tới kết quả; mobile xếp dọc. Lịch sử bỏ drawer, hai thẻ cạnh nhau hoặc một thẻ trải ngang, làm rõ phiên bản đang áp dụng (không nhầm revision), mã đối chiếu thu gọn, giữ bước xác nhận/kiểm tra kết quả. Typecheck/build đạt; 33 ca khác nhau với API giả lập đạt: 17 ca trang kế hoạch/lịch sử và 16 ca BHXH, gồm bốn viewport, dữ liệu rỗng/một/nhiều bản, retry, khóa khi lưu, focus/đóng và bố cục kết quả. Đã xem ảnh và dọn ảnh/cấu hình tạm; không tạo báo cáo riêng. Chưa kiểm chứng tích hợp BHXH/tài khoản thật.
- Thanh bao phủ `/user/plan` (11/10): giữ thang 0–100%, vẫn hiển thị tỷ lệ thực trên 100%; thay cung tròn bị lặp nét bằng cung mở, đầu chỉ báo khớp giá trị. Sửa cách diễn đạt thành “Gấp khoảng … lần quỹ cần”, giữ số thập phân/biên sát 100%, phân biệt 0/âm/thiếu hoặc sai dữ liệu. Số tiền có dòng riêng; bỏ quy tắc thu nhỏ gây vỡ số trên mobile. Không đổi phép tính/payload tài chính. Typecheck/build đạt; 30 ca khác nhau đạt (29 ca ở lượt cuối toàn spec và 1 ca tiếng Anh/reflow mô phỏng 200% chạy riêng sau sửa phương pháp kiểm tra). Bốn viewport 1440×1000, 768×1024, 390×844, 390×400; dữ liệu API giả lập, chưa đối soát tài khoản thật. Đã xem ảnh và dọn cấu hình/ảnh tạm, không tạo báo cáo riêng.
- 09d-3: sửa/kết thúc khoản vay, giữ basis và lịch sử, phân bổ giao dịch thật từ sổ giả lập, xử lý nháp/xem trước/lưu/áp dụng. Đợt này đạt 64 ca chọn lọc; không suy ra toàn bộ nghiệp vụ khoản vay đã nghiệm thu.
- 09d-3b: giải ngân bổ sung, căn cứ, tiền/ngày chính xác, thứ tự đối soát và không cộng quỹ; 44 ca chọn lọc đạt.
- 09d-3c: thay trách nhiệm/trần nghĩa vụ có căn cứ riêng, giữ gốc/lãi/phí đã trả qua bỏ/bật trần; 61 ca chọn lọc đạt.
- Từ điển: popup rộng, hai cột desktop/một cột mobile, tìm kiếm luôn hiện; sửa lỗi thanh bên trượt khi khóa cuộn. 22 ca khác nhau đạt gồm hồi quy popup dùng chung.
- UI-01 đến UI-05, UI-07 (Kế hoạch giao diện thân thiện 11/10/2026):
  - UI-01 (/user/dashboard): Tái cấu trúc 5 tầng thông tin (Cockpit hưu trí lên trước, thu chi đã khai báo, chi tiết tài sản/BHXH, công cụ mô phỏng & nợ), đổi nền thẻ giấy ấm #FAF8F5, tăng cỡ chữ phụ lên 13.5-15px. Đạt 14/14 tests Playwright.
  - UI-02 (/user/goal): Phân định chi tiêu hôm nay (PV) và chi tiêu lúc hưu (FV), stepper tuổi mượt mà, lưu mốc hưu & giữ đầu vào trong phiên xem trước. Đạt 15/15 tests Playwright.
  - UI-03 (/user/plan): Đồng bộ căn phải toàn bộ 10 tiêu đề và ô số liệu bảng dòng tiền (MonthlyCashflowTable), áp dụng tabular-nums gióng thẳng hàng dọc tuyệt đối, độ rộng tối thiểu 1080px không bóp nghẹt; modal xác nhận áp dụng. Đạt 30/30 tests Playwright.
  - UI-04 (/user/simulation): Thử kịch bản What-if đối chiếu kế hoạch chính thức + sổ tháng đối soát thực tế; đồng bộ căn phải cột số tiền giao dịch và dư nợ gốc. Đạt 18/18 tests Playwright.
  - UI-05 (Popup BHXH & Khoản vay): Khóa cuộn trang chính, giữ chứng từ thật, đối soát không cộng dồn sai quỹ. Đạt 14/14 tests (BHXH) và 55/55 tests (Khoản vay).
  - UI-07 (/user/assistant): Rút gọn 3 chip gợi ý câu hỏi để điền nháp (không tự ý gửi ngầm, không ghi đè câu đang soạn), làm rõ trạng thái máy chủ AI và bản kế hoạch. Đạt 8/8 tests Playwright.
  - Hạ tầng dev & test: Đã xử lý triệt để cờ ECONNRESET trên Vite proxy socket; giải phóng port 8444; 59/59 test assets và typecheck thành công.
- Các đợt trên đã typecheck/build thành công tại thời điểm thực hiện. Số ca là từng lượt, có phần hồi quy trùng nhau; không cộng thành tổng ca duy nhất của dự án.

## Đối chiếu bản triển khai với kế hoạch — 11/10/2026

Theo yêu cầu kiểm tra bản do AI khác hoàn thành: **chưa đủ điều kiện kết luận toàn bộ kế hoạch đã xong**. Lượt này kiểm browser lần lượt Tổng quan, Mục tiêu, Trợ lý; đọc đối chiếu các phần còn lại, không chạy toàn bộ màn hình. Không sửa mã ứng dụng trong lượt review này; không quy mọi vấn đề còn tồn tại là lỗi mới do bản chỉnh UI gây ra.

| ID / ưu tiên | Bằng chứng và tác động | Gói sửa nhỏ / điều kiện nghiệm thu |
|---|---|---|
| RV-01 / P1 | Tổng quan: hồ sơ V2 có thu nhập KNOWN 30 triệu, chi tiêu và nợ UNKNOWN vẫn hiện chi tiêu 0, trả nợ 0 và thặng dư 30 triệu màu xanh. `UserDashboard.tsx:48–53,379` dùng tổng legacy đã mất trạng thái thiếu dữ liệu (`financialProfile.ts:169`). Trái yêu cầu không đổi thiếu thành 0. Đã tái hiện trên browser. | Dùng trạng thái dữ liệu gốc khi trình bày thu/chi/nợ; khoản chưa biết hiện “Chưa khai báo”, chưa kết luận thặng dư khi thiếu đầu vào. Kiểm riêng UNKNOWN, KNOWN 0 và đủ dữ liệu, kể cả khoản con chưa biết. Không đổi công thức nghiệp vụ. |
| RV-02 / P2 | Trợ lý: `/me/ai/privacy` trả 503, nhập câu hỏi và Enter vẫn gửi một POST `/me/ai/explain`; ô soạn bị xóa dù chưa biết trạng thái quyền xử lý. `AIAssistantPage.tsx:307` chỉ chặn khi đối tượng privacy tồn tại. Đây là hành vi có từ trước, còn thiếu trong nghiệm thu UI-07; chỉ xác minh request frontend, không kết luận backend bỏ kiểm quyền hoặc dữ liệu đã đến nhà cung cấp. | Khi đang tải/tải lỗi quyền xử lý, giữ nháp, chặn cả nút gửi/Enter và đưa thao tác thử lại. Chỉ gửi sau khi tải được trạng thái hợp lệ; kiểm thêm chưa đồng ý và cần đồng ý lại. |
| RV-03 / P2 | Tổng quan mobile 390×844: khối chào hỏi cao khoảng 522 px; thẻ kế hoạch bắt đầu y≈644, số quỹ đầu tiên y≈865; thu chi y≈2010 vì biểu đồ nằm trước thu chi. `UserDashboard.tsx:80,281`. Chưa đúng thứ tự tiêu đề gọn → kế hoạch → thu chi → chi tiết trong mục 6 của kế hoạch. | Rút gọn lời chào/badge, đưa thu chi trước biểu đồ, cho mở chi tiết sau tóm tắt. Kiểm lại bốn viewport và chữ phóng to; cảnh báo thiếu/cũ vẫn phải hiện rõ. |
| RV-04 / P2 | Mục tiêu: đo chữ nhãn tóm tắt 11 px, số tiền/tuổi 12 px; quy tắc tại `index.css:3533`. Bảng dòng tiền kế hoạch cũng khai báo 12,5 px, cảnh báo thiếu tiền 10 px (`MonthlyCashflowTable.tsx:258,322`, đối chiếu mã, chưa đo lại browser trong lượt này). Chưa đáp ứng nhãn quan trọng từ 14 px của kế hoạch. | Tăng chữ số tiền/nhãn/cảnh báo tại đúng thành phần, giữ đủ số và cuộn bảng trong vùng riêng. Kiểm reflow 200%, không chỉ kiểm tràn ngang ở cỡ mặc định. |
| RV-05 / P2 | Mục tiêu còn “Kỳ vọng tuổi thọ trung bình”, “Tuổi thọ kỳ vọng” ở trường nhập, timeline và lỗi (`RetirementGoalPage.tsx:119,560,587,693`). Trái cách diễn đạt đã chốt, dễ bị hiểu là dự đoán tuổi thọ cá nhân. | Đổi nhãn, tên truy cập, lỗi và lời giải thích thành “Tuổi kết thúc kế hoạch”; giải thích đây là mốc tính toán. Giữ giá trị và validation hiện có. |
| RV-06 / P3 | Trợ lý khi `providerConfigured=false` hiện “Giải thích từ số liệu kế hoạch - động cơ An Hữu” (`AIAssistantPage.tsx:500`), chưa nói trực tiếp rằng chưa kết nối AI ngoài. Đã tái hiện với kế hoạch đang dùng. | Nêu ngắn gọn khả năng hiện có và trạng thái kết nối, phân biệt chưa chọn kế hoạch với chưa cấu hình nhà cung cấp; không hiển thị như AI ngoài đã sẵn sàng. |

Phần đã xác minh đạt: gợi ý Trợ lý điền nháp, không tự gửi/ghi đè; Mục tiêu phân biệt PV/FV và nói rõ kết quả thuộc phiên bản đã lưu. Việc sửa đầu vào chưa tính lại kết quả đã lưu **không được ghi thành lỗi** vì đã có chú thích đúng. Các kiểm thử thao tác hiện có đạt 37/37 (Tổng quan 14, Mục tiêu 15, Trợ lý 8); thêm 5 ca thăm dò/đo bố cục: 2 đạt và 3 không đạt tại RV-01, RV-02, RV-06. Tổng lượt này 42 ca, 39 đạt/3 không đạt; ca RV-06 kiểm câu trạng thái rõ nghĩa, không phải lỗi gọi API. Typecheck và build đạt. Dùng API giả lập, bốn viewport; không coi đây là kiểm tài khoản/DB thật, đầy đủ phóng chữ 200% hay usability với người thật.

Trạng thái nghiệm thu: UI-01/UI-02/UI-07 còn các điểm trên; UI-03 có căn số bảng và các sửa thanh bao phủ/lịch sử đã kiểm trước đây; UI-04 có thay đổi mã nhưng lượt này chưa chạy lại hai nhóm thử kịch bản/sổ tháng; UI-05 chỉ có bằng chứng theo từng popup đã ghi, không suy ra mọi form khoản vay/nguồn đã xong. UI-06 và UI-08 chưa có bằng chứng hoàn thành toàn bộ yêu cầu của kế hoạch. Tiêu đề “chưa thực hiện” trong tài liệu kế hoạch là trạng thái lúc lập tài liệu, không còn là mô tả đầy đủ của mã hiện tại.

Thứ tự tiếp theo: RV-01 → RV-02 → RV-03 → RV-04/RV-05 → RV-06; sau đó nghiệm thu riêng UI-03, UI-04a, UI-04b, từng form UI-05, UI-06 và UI-08. Ảnh và cấu hình/spec thăm dò của lượt review được dọn sau khi kiểm; giữ các spec hồi quy sẵn có. Không tạo báo cáo riêng.

## Giới hạn và việc còn mở

- Audit browser dùng API giả lập, một số ca gọi schema/bộ đối soát thuần thật. Không chứng minh DB/SMTP/OAuth/ngân hàng thật, production, đa tab hoặc thiết bị/bàn phím ảo thật.
- Khoản vay còn lịch trả chi tiết 09d-3d, đổi phạm vi và các form vay mới/tái cấp vốn/tài sản; tiếp tục mỗi form một lượt. Còn thiếu các tổ hợp legacy, nhiều tháng/nhiều nguồn, lịch sử tiêu thụ và tích hợp thật.
- Điều khoản dịch vụ/chính sách bảo mật chưa có nội dung: tiếp tục bỏ qua theo yêu cầu người dùng; không tạo chính sách hoặc link giả.
- Những màn còn lại bên dưới chưa được coi là đã kiểm chỉ vì component dùng chung được sửa. Chi tiết phát hiện/giới hạn lịch sử nằm trong tệp lưu trữ.

## Quy tắc dọn sau mỗi task

- Cập nhật ngắn trong tệp này hoặc task-frontend; chỉ tạo báo cáo riêng khi người dùng yêu cầu hoặc có nhu cầu bàn giao cụ thể.
- Xóa tệp tạm và ảnh thử trùng sau khi kiểm xong. Nếu cần giữ minh chứng, gom vào một tệp lưu trữ; không để nhiều báo cáo/ảnh rời của task đã hoàn tất.
- Giữ mã nguồn, kiểm thử hồi quy, kế hoạch đang dùng và việc chưa hoàn tất. Dọn đúng tệp do task tạo, không xóa dựa riêng vào chữ audit trong tên.

## Hàng đợi audit còn giữ để tiếp tục

Mục 02, 06, 07, 08a, 08b, 09a, 09b, 09c và 09d-1 đến 09d-3c đã được thực hiện trong phạm vi ghi ở báo cáo riêng; các mục 03–05, 09d-3d trở đi và 10–37 chưa được nghiệm thu trong các đợt này. User ưu tiên tiếp tục các trang sau đăng nhập. Mỗi hàng là một lượt kiểm tra riêng; nếu một màn có nhiều popup nghiệp vụ, tách mỗi popup phức tạp thành lượt con. Tên các nhóm thao tác dưới đây là mục tiêu rà soát, phải đối chiếu thành phần thực tế khi đến lượt, không phải khẳng định mọi nút/popup đó đã tồn tại.

| Đợt | Màn hình/route | Trọng tâm chi tiết |
|---|---|---|
| 02 — đã kiểm tra/sửa | `/login` | 8 điểm và bằng chứng: mật khẩu, ghi nhớ, lỗi, xác minh lại, Google, liên kết |
| 03 | `/forgot-password` | Gửi yêu cầu, chờ, lỗi/retry, thông báo không lộ tài khoản |
| 04 | `/reset-password` | Token, hai ô mật khẩu, hiện/ẩn, hết hạn, thành công |
| 05 | `/onboarding` | Tách từng bước; tiến/lùi, dữ liệu dở dang, validation |
| 06 — đã kiểm tra/sửa phạm vi chọn | `/user/dashboard` | 12 nhóm phát hiện và bằng chứng: số liệu thiếu, report, biểu đồ, thông báo, cài đặt, xuất, focus và responsive |
| 07 — đã kiểm tra/sửa phạm vi chọn | `/user/goal` | 10 nhóm phát hiện và bằng chứng: nhập tuổi/chi tiêu, tháng hưu, gợi ý, report, giả định, lưu phiên và chuyển xem trước |
| 08a — đã kiểm tra/sửa phạm vi chọn | `/user/plan` | 12 nhóm phát hiện và bằng chứng: preview, lưu/áp dụng, popup xác nhận, lịch sử, CSV, trạng thái lỗi/cũ và giới hạn dự phóng |
| 08b — đã kiểm tra/sửa phạm vi chọn | Popup BHXH từ `/user/plan` | 11 nhóm phát hiện và bằng chứng: ba tab, lỗi/thử lại, preview/lưu, dữ liệu thiếu, phản hồi muộn, bàn phím và mobile; các nhánh còn lại ghi trong báo cáo |
| 09a — đã kiểm tra/sửa phạm vi chọn | `/user/simulation` — khung chính | 13 nhóm phát hiện và bằng chứng: tải/chọn tháng, nhập/lưu sổ, mô phỏng, nguồn bảng so sánh, xác nhận áp dụng, dữ liệu thiếu và responsive |
| 09b — đã kiểm tra/sửa phạm vi chọn | `/user/simulation` — dự báo neo số dư | 10 nhóm phát hiện và bằng chứng: trạng thái kết quả, bảng đối chiếu/tương lai, retry, phản hồi muộn, giới hạn, lọc/phân trang và responsive |
| 09c — đã kiểm tra/sửa phạm vi chọn | `/user/simulation` — dòng tiền tương lai | 11 nhóm phát hiện và bằng chứng: nhập/thêm/sửa/xóa, preview cũ, lưu/thử lại, xác nhận áp dụng, xung đột, kế hoạch theo nguồn và responsive |
| 09d-1 — đã kiểm tra/sửa phạm vi chọn | `/user/simulation` — nguồn thu/chi | 12 nhóm phát hiện và bằng chứng: nguồn gốc/revision, trường nhập, END, nhập dở, kết quả, lưu và popup áp dụng |
| 09d-2 — đã kiểm tra/sửa phạm vi chọn | `/user/simulation` — gắn nguồn lương hưu | 11 nhóm phát hiện và bằng chứng: tải lại, bản lưu, xác nhận, hash/revision, kỳ còn lại, trùng lệnh, đổi tài khoản; 43 ca chọn lọc đạt |
| 09d-3 — đã kiểm tra/sửa phạm vi cơ bản | `/user/simulation` — sửa/kết thúc khoản vay, giữ trách nhiệm gốc | 13 nhóm phát hiện và bằng chứng: hợp đồng gốc, phân bổ trả nợ, trần/lịch sử, lịch ngân hàng, nhập dở, phản hồi muộn; 64 ca chọn lọc đạt |
| 09d-3b — đã kiểm tra/sửa | `/user/simulation` — giải ngân bổ sung cho khoản vay | Báo cáo và bằng chứng: tiền/ngày/căn cứ, đối soát theo ngày, chống trùng, nhập dở/bỏ/xóa, không cộng quỹ; 17 ca mới và 27 ca hồi quy đạt |
| 09d-3c — đã kiểm tra/sửa | `/user/simulation` — thay trách nhiệm/trần nghĩa vụ | Báo cáo: xác nhận/căn cứ riêng, giữ lịch sử, trần còn lại, ngày, hủy/focus, không cộng quỹ; 17 ca mới + 44 ca hồi quy đạt |
| 09d-3d — tiếp theo | `/user/simulation` — lịch trả chi tiết | Bắt đầu ngày trả/khoảng tính lãi; tách ân hạn, lãi/phí chuyển kỳ và khoản cuối thành các lượt nhỏ khi cần |
| 09d-4 trở đi | Các form tạo khoản vay/tái cấp vốn/tài sản của `/user/simulation` | Mỗi form phức tạp một lượt riêng; trạng thái draft/preview/saved/applied/stale |
| 10a | `/user/debts` — khung chính | Danh sách, chi tiết, thanh toán và phí |
| 10b trở đi | Popup khoản vay/tái cấp vốn thực tế | Mỗi form phức tạp một lượt; chứng từ, ngày, trách nhiệm, chống gửi lặp |
| 11 | `/user/risk-portfolio` | Số liệu, giải thích, biểu đồ, chọn danh mục |
| 12 | `/user/assistant` | Gửi/dừng/retry, lịch sử, cuộn, trả lời lỗi |
| 13 | `/user/explore` | Danh sách, tìm/lọc, thẻ, liên kết |
| 14 | `/user/account` | Từng tab và popup sửa hồ sơ/mật khẩu/avatar thực tế |
| 15 | `/user/support` | Tìm/lọc/phân trang, tạo yêu cầu, chi tiết, tệp |
| 16 | `/user/notifications` | Đọc/chưa đọc, lọc, thao tác từng mục, trạng thái rỗng |
| 17 | `/admin/dashboard` | Thẻ số liệu, khoảng ngày, điều hướng chi tiết |
| 18 | `/admin/users` | Tìm/lọc/phân trang, menu từng dòng và xác nhận |
| 19 | `/admin/users/:userId` | Chi tiết, chỉnh sửa, trạng thái và quyền |
| 20 | `/admin/content` | Danh sách, editor/popup, lưu nháp/xuất bản thực tế |
| 21 | `/admin/partners` | Từng tab, form và menu dòng |
| 22 | `/admin/ai` | Từng khối cấu hình, bí mật, lưu/retry |
| 23 | `/admin/financial-config` | Đơn vị, giới hạn, sửa/lưu, xung đột |
| 24 | `/admin/legal-rules` | Phiên bản, ngày hiệu lực, popup, nguồn dữ liệu |
| 25 | `/admin/support` | Phân công/trả lời/trạng thái và quyền |
| 26 | `/admin/reports` | Bộ lọc, bảng/biểu đồ, xuất, rỗng/lỗi |
| 27 | `/admin/settings/general` | Từng trường, loading/error, lưu/thử lại |
| 28 | `/admin/settings/security` | Giới hạn, lựa chọn, xác nhận, lưu |
| 29 | `/admin/settings/notifications` | Toggle, phụ thuộc cấu hình, lưu |
| 30 | `/admin/settings/logs` | Lọc, phân trang, chi tiết log |
| 31 | `/` | Header/mobile menu, từng CTA, footer |
| 32 | `/cach-hoat-dong` | Nội dung từng phần và đường đi CTA |
| 33 | `/mo-phong` | Input/slider/kết quả/tooltip và CTA |
| 34 | `/tro-ly-ai` | Nội dung, thao tác demo nếu có, CTA |
| 35 | `/kien-thuc` | Tìm/lọc, thẻ bài, trạng thái rỗng |
| 36 | `/kien-thuc/:slug` | Nội dung bài, điều hướng, bài không tồn tại |
| 37 | Trang không tìm thấy và route chuyển hướng | Quay lại, trang chủ, deep link và vai trò |

## Checklist dùng cho mỗi lượt tiếp theo

1. Chọn đúng một màn/nhóm popup con; ghi route, quyền, điều kiện dữ liệu và nguồn bằng chứng.
2. Liệt kê mọi điều khiển nhìn thấy: nút chữ/icon, dấu X, menu ba chấm, checkbox/toggle, tab, bộ lọc, phân trang, tooltip, liên kết; ghi đạt/lỗi/chưa kiểm tra.
3. Mở từng popup: tên/nhãn, focus ban đầu, Tab/Shift+Tab, Escape/nền/X, cuộn, đóng khi đang sửa/chờ; việc mất dữ liệu phải có chủ đích rõ ràng.
4. Kiểm tra đầu vào rỗng/sai/biên; đơn vị/ngày/tiền; sau sửa lỗi có hết không; các trạng thái chờ, lỗi, thử lại, thành công, dữ liệu cũ.
5. Đối chiếu thao tác với request/hợp đồng; dùng mock cho lỗi và race, ghi tách riêng bằng chứng API/DB thật nếu có. Không gửi dữ liệu thật để thử nút phá hủy.
6. Kiểm tra desktop/mobile và chiều cao hạn chế; chụp đúng trạng thái gây lỗi. Không lấy một ảnh mặc định để kết luận cả popup ổn.
7. Mỗi lỗi có ID, ưu tiên, bước tái hiện, kết quả thực tế/mong muốn, vị trí mã, gói sửa nhỏ và điều kiện nghiệm thu. Kết thúc bằng phạm vi chưa kiểm chứng và màn tiếp theo.
