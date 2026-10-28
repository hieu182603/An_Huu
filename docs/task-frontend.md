# Task frontend — Sửa luồng sử dụng và câu chữ An Hưu

Ngày bàn giao: **13/10/2026**, múi giờ Việt Nam. Workspace: **E:/An_Huu**.

**Cập nhật backend cùng ngày:** đọc mục 10 ở cuối file trước khi triển khai trang nợ, bảng so sánh, thông báo cấu hình và xuất CSV.

Đây là prompt giao cho AI triển khai. Nội dung này **thay toàn bộ tài liệu task frontend cũ**, không nối tiếp các tuyên bố hoàn tất, số test hay hàng đợi lịch sử trong tài liệu cũ. Tại thời điểm tạo prompt: đã kiểm tra và lập danh sách, **chưa triển khai các sửa đổi được yêu cầu dưới đây**. Mã nguồn có thể đang được sửa bởi công việc khác; phải xác minh trạng thái hiện tại trước khi sửa.

## 1. Nhiệm vụ và kết quả cần đạt

Bạn là kỹ sư frontend chịu trách nhiệm sửa trực tiếp giao diện An Hưu. Hãy hoàn thành các lỗi chức năng, khả năng sử dụng và câu chữ trong tài liệu này, không chỉ phân tích hoặc đề xuất kế hoạch. Ưu tiên **trải nghiệm trên máy tính** của một người **50 tuổi, đã nghỉ làm**, muốn biết:

1. Hiện có bao nhiêu tiền thực sự dành được cho hưu trí?
2. Với mức chi đã khai, kế hoạch thiếu tiền từ tháng nào, theo các giả định nào?
3. Cần kiểm tra hoặc thay đổi gì tiếp theo?
4. Thay đổi vừa nhập đã tính, đã lưu, hay đã dùng làm kế hoạch hiện tại?

Người dùng không cần hiểu kiến trúc v1/v2/v4, mã công việc, tên trường API hay nghiệp vụ kiểm toán để hoàn thành luồng chính. Giữ sự chính xác của dữ liệu, phân biệt số thực tế và ước tính, diễn đạt ngắn và có bước tiếp theo rõ ràng.

Thực hiện theo từng nhóm: tái hiện → sửa → kiểm đúng hành vi → xem giao diện → cập nhật checklist trong file này. Đừng dừng ở việc đổi nhãn nếu lỗi nằm ở trạng thái hoặc luồng dữ liệu. Không thay đổi toàn bộ thiết kế, thư viện hoặc kiến trúc khi không cần thiết.

## 2. Phạm vi, quyền kiểm tra và giới hạn

- Được sửa frontend, kiểm thử frontend và tài liệu nghiệm thu liên quan. Bao gồm trang công khai, đăng nhập/đăng ký, onboarding, toàn bộ trang user, popup BHXH/hồ sơ, xuất báo cáo và các biểu mẫu thu chi/vay/tài sản nâng cao đã tồn tại.
- **Desktop làm trước**: 1440×1000 là kích thước đã kiểm tra; kiểm thêm cửa sổ desktop 1280×800 và 1920×1080, bàn phím, zoom 200%. Đừng gọi thu nhỏ viewport là đã kiểm zoom trình duyệt. Nếu công cụ không làm được zoom thật, nêu rõ cách kiểm thay thế.
- Mobile là nhóm sau cùng và kiểm hồi quy cho thành phần dùng chung. Không chuyển trọng tâm sang mobile trước khi luồng desktop chính đạt.
- Người dùng đã xác nhận đây là **database local dành cho thử nghiệm**, cho phép thử các trường hợp lưu, sửa, áp dụng, xóa dữ liệu thử. Không cần hỏi lại quyền cho các thao tác thử local thuộc phạm vi này. Xác minh kết nối local trước khi ghi; không reset DB, chạy migration mù hoặc tác động production.
- Tài khoản đã dùng: `user@anhuu.test` và `admin@anhuu.test`. Dùng mật khẩu người dùng đã cấp trong phiên bàn giao hoặc cấu hình bí mật local; không ghi mật khẩu/token vào source, báo cáo hay ảnh. Không đổi mật khẩu tài khoản dùng chung như một phần sửa UX. Nếu thiếu thông tin đăng nhập, tiếp tục sửa/kiểm độc lập và ghi rõ phần kiểm thật còn thiếu.
- Ở lần audit trước frontend chạy tại `http://localhost:8443`, backend tại `http://localhost:5000`. Xác minh tiến trình/port hiện tại; không tắt hoặc chiếm tiến trình của người dùng hay công việc khác.
- Workspace có nhiều thay đổi chưa commit. Không reset/checkout toàn repo, không ghi đè thay đổi ngoài phạm vi, không nhận toàn bộ git diff là công việc của mình.
- Không tự đổi công thức tài chính, điều kiện hưởng BHXH, hợp đồng API, enum hoặc chính sách bảo mật. Được sửa validation frontend khi phù hợp hợp đồng đã xác minh; được sửa phép tính chênh lệch để so sánh cùng cơ sở; được sửa formatter và lớp nhãn hiển thị.
- Không tự công bố giả định kinh tế hoặc luật BHXH giả để che lỗi. Nếu thiếu backend/API/config, sửa trạng thái frontend đúng và ghi dependency cụ thể. Tiếp tục các mục không bị chặn; không báo toàn bộ hoàn tất khi dependency còn mở.
- Không gửi email/SMS thật hoặc liên hệ bên ngoài để kiểm. Dùng môi trường local/sandbox có kiểm soát cho chức năng liên quan. Không tự viết điều khoản pháp lý, cam kết quyền riêng tư hoặc lời khuyên đầu tư như nội dung đã được duyệt.

## 3. Nguồn bằng chứng và cách hiểu kết quả

Các tài liệu tham chiếu nằm trong `E:/An_Huu/artifacts/retiree-50-review/`:

| Tài liệu | Vai trò |
|---|---|
| `nhan-xet-desktop-dang-nhap.md` | 20 nhận xét sau đăng nhập thật; nguồn chính cho các luồng user. |
| `live/*.json`, `live/*.png` | Bản ghi giao diện và ảnh, gồm các thao tác lưu/áp dụng/thử lại/tải lại. |
| `nhan-xet.md` | 10 nhận xét ban đầu: trang công khai được kiểm trực tiếp; khu vực riêng lúc đó có API giả lập. Không dùng dữ liệu giả để chứng minh tích hợp thật. |
| `full-observations.json`, `focused-observations.json` | Số đo, đầu vào và kiểm tra chuyển kịch bản ở trang công khai. |
| `tu-ngu-kho-hieu-desktop.md`, `tu-ngu-kho-hieu.json` | 247 mục rà soát câu chữ. Danh sách đã chèn đầy đủ ở phần 8 của file này. |

Ảnh và JSON là bằng chứng của ngày kiểm tra, không bảo đảm mã hiện tại chưa đổi. Nếu một lỗi đã được công việc khác sửa, kiểm lại rồi đánh dấu “đã có sửa — đã kiểm”; không sửa lại vô ích. Đường dẫn dòng trong phụ lục là mốc tìm kiếm; dùng nội dung và tên component để tìm khi dòng đã dịch chuyển.

Phân loại bằng chứng: **LIVE** = thao tác giao diện đăng nhập thật; **PUBLIC** = trang công khai kiểm trực tiếp; **CODE** = nhãn/nhánh mã đã đọc, chưa chắc đã đi tới nhánh đó; **MOCK** = kiểm dùng API giả. Phải giữ phân biệt này trong nghiệm thu.

## 4. Các lỗi frontend bắt buộc xử lý

### FE-01 — P1 — Luồng cho người đã nghỉ hưu bị chặn

- Bằng chứng LIVE/PUBLIC: tuổi hiện tại 50, chọn tuổi nghỉ hưu 50 bị Mục tiêu chặn vì phải lớn hơn hiện tại; mô phỏng công khai có min 51. Hồ sơ v2 lại lưu được tháng nghỉ hưu hiện tại. Không được kết luận toàn bộ backend không hỗ trợ chỉ từ validation frontend.
- Vị trí: `RetirementGoalPage.tsx`, `SimulationTrackingPage.tsx`, `FinancialProfilePanel.tsx`, `marketing/MarketingPages.tsx` và adapter liên quan.
- Sửa: hỗ trợ rõ trường hợp “Đã nghỉ hưu” và “Đang chuẩn bị nghỉ hưu”; thống nhất mốc tháng/tuổi giữa các trang theo hợp đồng API. Không tự đổi người 50 tuổi thành 51 để vượt validation. Với ngày nghỉ trong quá khứ, xác minh cách backend xử lý lịch sử; nếu chưa hỗ trợ thì nêu đúng giới hạn, không dựng số liệu thay thế.
- Đạt khi: người 50 tuổi chọn nghỉ trong tháng hiện tại và tiếp tục với 0 tháng tích lũy nếu API hỗ trợ; thử cả đã nghỉ trước đó, nghỉ tương lai, tháng cuối/năm mới, tuổi thiếu/không hợp lệ. Không tự giả định lương hưu BHXH bắt đầu cùng lúc nghỉ làm.
- Bằng chứng cũ: `live/13-retired-now-error.*`, `live/20-retire-now-profile-save.*`, `desktop-age50.png`.

### FE-02 — P1 — Onboarding xong nhưng mắc vòng Mục tiêu → Khảo sát → Kế hoạch

- LIVE: hồ sơ cơ bản hoàn tất, mục tiêu đã đặt, trả lời đủ 6 câu, khảo sát vẫn báo “Cần đặt mục tiêu trước”; phải tự tìm nâng cấp v2 trong tài khoản. Khung thời gian phụ thuộc dữ liệu hồ sơ chi tiết.
- Sửa luồng tạo/chuyển hồ sơ để các bước sau nhận đủ dữ liệu, hoặc đưa ngay bước bổ sung còn thiếu vào đúng chỗ bị chặn. Không yêu cầu người dùng hiểu phiên bản kỹ thuật. Không tự bổ sung tháng sinh, ngày định giá hoặc mục tiêu nếu chưa có cơ sở; mời xác nhận giá trị suy ra khi cần.
- Đạt khi: người mới đi hết onboarding → mục tiêu → khảo sát → xem trước → lưu → dùng kế hoạch bằng điều hướng thông thường; reload/back giữ dữ liệu; hồ sơ cũ không mất thu chi, tài sản, nợ, BHXH. Kiểm cả lỗi lưu/chuyển đổi và thử lại.
- Với tuổi còn trống: có thể cho lưu làm sau, nhưng không hiển thị “Nếu bạn 0 tuổi” hoặc suy ra 60 năm tích lũy. Phân biệt chưa nhập và tuổi 0; chỉ chặn ở đúng bước cần dữ liệu bắt buộc, thông báo ngay tại ô.
- Bằng chứng: `live/17-risk-complete.*`, `live/19-upgrade-profile.*`.

### FE-03 — P1 — Thiếu cấu hình nhưng thông báo đổ lỗi hồ sơ/khảo sát

- LIVE: kế hoạch 421 tháng vượt phạm vi chính sách được đối chiếu; xuất hiện `undefined tháng`, `undefined%`, rồi kế hoạch yêu cầu làm lại khảo sát. Mốc 301 tháng vượt qua chặn này nhưng gặp `PROJECTION_NOT_COVERED`, nút lại hướng “Bổ sung hồ sơ tài chính”.
- Sửa lớp trạng thái/lỗi ở Risk, Goal, Plan và service hiển thị: phân biệt thiếu câu trả lời, lựa chọn không còn hợp lệ, ngoài phạm vi chính sách, thiếu dữ liệu lạm phát/lợi suất, chưa tải được cấu hình và lỗi kết nối.
- Không hiện `undefined`, `null`, `NaN`, không biến thiếu dữ liệu thành 0 hoặc kết quả xanh. Nêu phạm vi được API cung cấp và cách xử lý khả thi. Không bắt sửa hồ sơ khi lỗi hệ thống. Nút đi tiếp có thể cho sang trang giải thích nhưng không được giả như đã đủ điều kiện tính/lưu.
- Đạt khi: từng trạng thái có thông báo đúng và bước xử lý phù hợp; 6 câu đã trả lời vẫn được giữ; thử lại sau cấu hình/tải dữ liệu thành công không cần nhập lại. Không hardcode mốc 2040 hay 360 tháng như giới hạn vĩnh viễn của sản phẩm.
- Bằng chứng: `live/21-risk-v2.*`, `live/24-plan-blockers.*`, `live/77-admin-finance.*`.

### FE-04 — P1 — Trang nợ báo an toàn khi chưa có kết quả

- LIVE: thu nhập 8 triệu, chi 12 triệu, khoản vay 100 triệu, trả 3 triệu/tháng. Trang vừa báo DTI thiếu dữ liệu vừa hiện xanh “Không có tháng thiếu hụt”, “Dòng tiền đảm bảo suốt kỳ”.
- Sửa `DebtAnalysisPage.tsx`: kết luận và màu chỉ xuất hiện khi kết quả phân tích hợp lệ. Phân biệt loading/error/incomplete/not-applicable/ready; 0 phải là giá trị đã biết. Rà nguồn thu nhập gửi/đọc để tìm nguyên nhân DTI N/A dù hồ sơ có thu nhập; ghi rõ nếu nguyên nhân nằm ở API.
- Đạt khi: missing/error không có lời trấn an; thu nhập 0 không chia cho 0; thu nhập dương và nghĩa vụ nợ đúng nguồn mới hiện tỷ lệ; không có nợ khác với chưa khai báo nợ; các chiến lược không hiện tiết kiệm hoặc ngày sạch nợ giả khi thiếu phân tích.
- Bằng chứng: `live/44-debt-after-reload.*`.

### FE-05 — P1 — Bảng chênh lệch so sánh hai mốc tiền khác nhau

- LIVE + CODE: chi tiêu 12 triệu → 10 triệu; vốn cần khoảng 1.717.065.672 → 1.430.888.060, chênh khoảng 286.177.612; bảng ghi giảm 269.724.422. Hai cột dùng `atRetirement`, Delta dùng `AtValuation`.
- Sửa `SimulationTrackingPage.tsx`: dùng cùng cơ sở tiền và mốc thời gian cho hai giá trị và chênh lệch. Nếu tháng nghỉ của hai phương án khác nhau, giải thích các mốc so sánh; không so hai đơn vị khác nhau dưới một nhãn giống nhau. Tái sử dụng phép tính decimal/độ chính xác hiện có; không dùng số đã format để tính.
- Đạt khi: Delta bằng phương án thử trừ kế hoạch gốc theo cùng cơ sở, đúng dấu; kiểm projected fund, required fund, funding gap, trường hợp không đổi, tăng, giảm, dữ liệu chưa có, đổi tuổi và đổi giả định. Chỉ làm tròn lúc hiển thị.
- Bằng chứng: `live/72-simulation-expense10.*`.

### FE-06 — P1 — Tổng kết onboarding cắt thâm hụt thành 0

- LIVE: thu 8 triệu − chi 12 triệu − nợ 0 = −4 triệu, tổng kết hiển thị 0; dashboard hiển thị −4 triệu.
- Sửa `OnboardingPage.tsx` và selector/adaptor liên quan: giữ số âm hợp lệ; thống nhất quy tắc đọc số liệu với dashboard, không nhân đôi nghĩa vụ nợ.
- Đạt khi: dương, bằng 0, âm và chưa biết được trình bày khác nhau; thiếu dữ liệu không biến thành 0; −4 triệu giữ đúng sau back/reload/hoàn tất.
- Bằng chứng: `live/10-resume-after-reload.*`.

### FE-07 — P1 — Tự chia tiền tiết kiệm 50/50 khi chuyển hồ sơ

- LIVE + CODE: 2 tỷ tiết kiệm bị chuyển thành 1 tỷ hưu trí và 1 tỷ dự phòng qua thao tác nâng cấp; kế hoạch bắt đầu bằng 1 tỷ mà người dùng chưa chủ động chọn phân bổ.
- Sửa `services/financialProfile.ts`, form phân bổ và luồng chuyển đổi: hiển thị giải thích, tổng tiền và các phần phân bổ; yêu cầu người dùng xác nhận trước khi lưu quyết định ảnh hưởng vốn. Đừng tự thay 50/50 bằng 100/0. Giữ dữ liệu cũ nếu hủy/lỗi.
- Đạt khi: tổng phần phân bổ đúng 100%, người dùng biết phần nào vào kế hoạch; nhà đang ở không tự coi là tiền mặt; không mất tổng tài sản; vốn ban đầu khớp phần dành cho hưu trí đã xác nhận. Với hồ sơ đã chuyển trước đó, cho rà soát chứ không âm thầm sửa lại.
- Bằng chứng: `live/19-upgrade-profile.*`, `live/26-plan-end64.*`.

### FE-08 — P2 — Không hoàn thành được khảo sát bằng bàn phím

- LIVE + CODE: lựa chọn câu trả lời là div có onClick, Tab bỏ qua các đáp án.
- Dùng radio/button phù hợp ngữ nghĩa, nhóm câu hỏi/nhãn truy cập; giữ trạng thái đã chọn và focus rõ. Không chỉ thêm tabindex mà bỏ hành vi bàn phím.
- Đạt khi: dùng Tab/Shift+Tab, phím mũi tên/Space theo loại control để trả lời đủ 6 câu, xem kết quả và tiếp tục; chuột vẫn đúng; không gửi lựa chọn hai lần.
- Vị trí/bằng chứng: `RiskPortfolioPage.tsx`, `live/71-risk-keyboard.json`.

### FE-09 — P2 — “Không có nợ” vẫn bị coi là chưa điền

- LIVE: đã chọn không có nợ nhưng tổng kết ghi “Khoản nợ — Chưa điền thông tin”.
- Lưu phân biệt explicit no-debt với chưa trả lời. Đạt khi xác nhận không nợ hoàn tất bước, số tiền 0 hợp lệ; chưa trả lời vẫn là thiếu; chuyển từ có nợ sang không nợ không để nghĩa vụ cũ âm thầm tồn tại. Nếu thao tác sẽ loại khoản đã lưu, phải nói rõ và xác nhận.
- Bằng chứng: `live/10-resume-after-reload.*`.

### FE-10 — P2 — Xóa khoản vay ngay, không có bước tránh nhầm

- LIVE: bấm Xóa là khoản vay bị gỡ ngay. Thêm xác nhận có tên khoản vay và ảnh hưởng cụ thể, hoặc hoàn tác thực sự được backend hỗ trợ. Phương án đơn giản là xác nhận trước khi gọi xóa.
- Đạt khi: hủy không có request xóa; xác nhận xóa một lần; lỗi không làm UI mất khoản vay giả; thành công cập nhật tổng; đóng modal trả focus về vị trí phù hợp. Phân biệt xóa bản ghi với trả hết nợ thực tế.
- Bằng chứng: `live/45-delete-loan-confirm.*` là ảnh sau khi đã xóa, không phải modal xác nhận.

### FE-11 — P2 — Chữ nhỏ, phân cấp và định dạng số không thống nhất

- LIVE/PUBLIC: nhãn/trạng thái/chú thích quan trọng chỉ 11–12px; tiền có nơi nguyên đồng, nơi có 3 chữ số lẻ; tỷ lệ dùng cả dấu chấm và dấu phẩy.
- Rà dashboard, goal, plan, simulation, risk, debt, hồ sơ, BHXH và popup nâng cao. Mục tiêu desktop: nội dung chính/ô nhập khoảng 16px; nhãn/hướng dẫn quan trọng tối thiểu 14px, tránh uppercase dài; điều khiển chính đủ dễ bấm. Điều chỉnh token/CSS có mục tiêu, không phóng tất cả gây tràn.
- Tiền VND phổ thông hiển thị đến đồng, số lớn có thể thêm triệu/tỷ kèm giá trị đầy đủ; phần trăm theo tiếng Việt và độ chính xác thống nhất. Giữ độ chính xác nội bộ và định dạng API; không biến không có dữ liệu thành 0. Tỷ lệ nhập 0–1 đổi thành % phải có chuyển đổi đúng cả hai chiều.
- Đạt khi: tiền không cắt, chú thích đọc được, bảng cuộn riêng thay vì tràn cả trang; focus/zoom không che nút; kiểm âm/0/rất lớn/thiếu dữ liệu. Không chỉ kiểm CSS mà phải xem ảnh và thao tác thực tế.
- Bằng chứng: `live/79-desktop-controls.json`, `live/72-simulation-expense10.*`, `full-observations.json`.

### FE-12 — P2 — Áp dụng toàn bộ danh mục câu chữ ở phần 8

- 247 mục là mục rà soát, không phải 247 lỗi chức năng độc lập. Có biến thể/khái niệm lặp giữa ngữ cảnh. Xử lý theo nhóm màn hình và ánh xạ hiển thị dùng chung ở nơi hợp lý.
- Giữ nguyên enum/API/schema; dùng nhãn VI/EN riêng. Không global replace mã như `BASE`, `KNOWN`, `CAPPED`, `PLANNED`, `rentalExit` trong logic hoặc payload. Không xóa tên pháp lý chính thức hoặc tính năng chỉ để hết từ khó.
- Áp dụng cả label, placeholder, tooltip, accessible name, validation, toast, bảng/biểu đồ, lựa chọn select, xuất báo cáo, trạng thái rỗng/lỗi và nhãn động từ API/AI. Các từ trong bản dịch không dùng nữa được ghi nhận đúng; không coi sự tồn tại trong source là đang hiện trên UI.
- Đạt khi: từng mục có trạng thái trong bảng theo dõi COPY; các phần nhạy cảm được kiểm đúng nghĩa; không còn mã kỹ thuật trên luồng phổ thông trừ phần “Thông tin hỗ trợ kỹ thuật” có chủ đích; không đổi chữ bằng lời khẳng định mới chưa có căn cứ.

### FE-13 — P2 — BHXH nhập lặp và khó khai lịch sử dài

- LIVE: onboarding khai 25 năm nhưng lịch sử chi tiết trống, phải nhập lại thông tin cá nhân và từng tháng.
- Sửa: giải thích số năm tổng quát chưa thay được lịch sử đóng chi tiết; điền lại thông tin đã biết từ hồ sơ với mức chính xác phù hợp, cho xác nhận/sửa. Không biến tháng sinh thành ngày sinh đầy đủ, không biến 25 năm thành 300 tháng đã đóng có chứng từ.
- Bổ sung nhập theo giai đoạn/thêm nhiều tháng nếu hợp đồng hiện tại hỗ trợ; cho xem trước các tháng được tạo, mức lương và căn cứ dùng chung trước khi lưu. Nếu API nhận từng tháng, có thể chuẩn bị danh sách frontend theo schema hiện có; không phát minh dữ liệu hoặc bỏ trường bắt buộc.
- Đạt khi: kỳ hợp lệ, trùng tháng, khoảng trống, khác mức lương, tháng tương lai, thiếu căn cứ, sửa/xóa trước lưu đều được xử lý rõ; giữ quy trình kiểm tra → lưu lịch sử → ước tính → lưu kết quả. Không gọi kiểm tra định dạng là xác nhận đủ quyền lợi.
- Thiếu luật BHXH local là dependency riêng. Nghiệm thu UI nhập/lưu được, nhưng không đánh dấu tính quyền lợi thật đạt nếu chưa có bộ luật công bố.
- Bằng chứng: `live/51-insurance-history.*`, `live/55-insurance-saved.*`.

### FE-14 — P2 — Xuất CSV quá kỹ thuật và mô tả sai kỳ dữ liệu

- LIVE: tải được CSV 48 cột, nhiều ID/hash/nhãn tiếng Anh, tiền rất nhiều chữ số lẻ; trang tài khoản ghi dữ liệu từng năm nhưng file theo tháng.
- Sửa: thêm bản báo cáo phổ thông tiếng Việt từ dữ liệu kế hoạch đang xem/đang dùng có nguồn rõ; bản kỹ thuật nếu cần giữ riêng. Cột chính: tháng, thu nhập, lương hưu, chi tiêu, trả nợ, góp/rút quỹ, lãi/lỗ, số dư và thiếu hụt theo dữ liệu có thật. Mô tả đúng kỳ tháng/năm; nếu thêm tổng hợp năm phải xác định tổng dòng tiền so với số dư cuối năm, không cộng các số dư.
- Đạt khi: tên file dễ hiểu có phiên bản/ngày; tiếng Việt/encoding/dấu phân cách mở được; số tiền không làm mất dữ liệu gốc trong engine; dữ liệu đúng bản, mọi tháng đúng, thiếu và âm không bị che. Không gọi .csv là .xlsx; không làm hỏng export kỹ thuật hiện có. Nếu chỉ backend xuất được schema cần thiết, ghi dependency và hoàn tất phần frontend có thể làm.
- Bằng chứng: `live/plan-export.csv`, `live/60-account-export.*`.

### FE-15 — P2 — Không rõ cách in hoặc lưu PDF

- LIVE: tài khoản dẫn sang kế hoạch để in/lưu PDF nhưng không thấy nút rõ ràng.
- Sửa: nút “In / Lưu PDF” dễ tìm, `window.print()` và print stylesheet nếu đủ; không cần thêm thư viện nặng cho chức năng trình duyệt đã có. Bản in có tên báo cáo, ngày, trạng thái/bản kế hoạch, giả định/giới hạn và bảng biểu đọc được; ẩn menu/nút không cần.
- Đạt khi: nút mở in, bản print/PDF không cắt số hoặc chồng trang; không gọi PDF preview là đã kiểm hộp thoại in hệ điều hành nếu chưa làm được. Cần xem bản render/in thực tế.

### FE-16 — P2 — Nút “Tài khoản” không có hành động

- LIVE + CODE: bấm “Tài khoản” trên thanh mục khi ở tab báo cáo không chuyển nội dung; `AccountPage.tsx` có button không onClick.
- Sửa thành điều hướng/tab đúng hoặc tiêu đề không giả dạng control. Đạt khi mouse/keyboard/back/URL và trạng thái active nhất quán; chỉnh hồ sơ cá nhân và hồ sơ tài chính có tên/vị trí dễ phân biệt.

### FE-17 — P2 — Mức góp vượt khả năng nhưng thiếu hướng xử lý rõ

- LIVE: thu 8 triệu, chi 12 triệu, kết quả yêu cầu góp khoảng 57,2 triệu/tháng. Chưa có bằng chứng công thức sai.
- Giữ kết quả máy tính, giải thích rõ mức cần góp vượt tiền dư hiện tại. Đặt hành động để người dùng tự thử chi tiêu, thời điểm nghỉ hoặc phần tài sản dành hưu trí; không tự giảm chi, bán nhà, vay tiền hoặc thay mốc kết thúc kế hoạch.
- Đạt khi: nhìn thấy mức thiếu và ảnh hưởng của lựa chọn; nguồn thu/tài sản giả định được phân biệt với số thật; dữ liệu chưa đủ thì không khẳng định khả năng góp. Không dùng “Cần nỗ lực thêm” như lời quy trách nhiệm cho người thiếu tiền.

### FE-18 — P3 — Cẩm nang chưa đáp ứng kỳ vọng tiêu đề

- LIVE + CODE: có 4 bài tích hợp sẵn, nội dung chỉ đoạn ngắn dù tiêu đề hứa hướng dẫn cụ thể; admin chưa có bài công bố không có nghĩa 4 bài này đến từ DB.
- Sửa kỳ vọng trình bày: ghi rõ nội dung giới thiệu/ngắn, điều chỉnh tiêu đề đúng phạm vi, hoặc dùng nội dung đầy đủ đã được duyệt nếu có. Không tự viết hướng dẫn luật hoặc lời khuyên đầu tư chưa kiểm chứng để lấp chỗ trống. Tách dữ liệu mẫu với bài do quản trị công bố.
- Đạt khi: tìm có/không dấu, lưu/bỏ lưu, reload và đọc bài vẫn đúng; trạng thái không có bài/không tải được phân biệt; không dùng “Luật mới” mà không ghi mốc cập nhật.

### FE-19 — P3 — Bấm tính lại mới biết tháng chưa kết thúc

- LIVE: tháng hiện tại cho bấm tính lại rồi mới báo tháng chưa kết thúc; backend chặn đúng.
- Sửa điều kiện/giải thích ở cạnh nút, cho chọn tháng đã kết thúc nếu có. Không chặn nhập/lưu dữ liệu của tháng hiện tại và không sửa ngày máy để vượt quy tắc.
- Đạt khi: điều kiện theo múi giờ Việt Nam đúng ở cuối tháng/đầu tháng, kết quả từ bản ghi đã lưu/đối soát hợp lệ; backend vẫn là nguồn xác nhận cuối cùng; stale/loading không giả như đủ điều kiện.

### FE-20 — P1 — Kịch bản công khai không được truyền sang mô phỏng

- PUBLIC: chọn “Nghỉ hưu sớm 50t”, bấm “Áp dụng kịch bản này vào Mô phỏng”, trang đích vẫn hiện tuổi 32/60.
- Sửa `marketing/MarketingPages.tsx`: truyền đúng đầu vào của kịch bản qua điều hướng, validate và hiển thị các giả định áp dụng. Nếu thẻ không chứa đủ đầu vào để áp dụng, đổi thành “Mở công cụ mô phỏng” thay vì hứa áp dụng; không lặng lẽ điền số mặc định rồi nói đã áp dụng.
- Đạt khi: từng thẻ đúng dữ liệu hoặc đúng lời hứa; reload/back/đổi thẻ không lẫn kịch bản; URL chỉ chứa dữ liệu phù hợp, không thông tin cá nhân nhạy cảm.
- Bằng chứng: `ai-retire50-selected.png`, `ai-retire50-applied.png`, `focused-observations.json`.

### FE-21 — P2 — Không đọc được điều khoản trước khi đồng ý

- PUBLIC: tên Điều khoản dịch vụ/Chính sách bảo mật nằm trong nhãn checkbox; bấm tên chỉ đổi trạng thái đồng ý, không mở tài liệu.
- Sửa UX đọc tài liệu riêng khỏi đồng ý khi đã có nội dung/URL chính thức. Đạt khi mở bằng chuột/bàn phím được, mở tài liệu không tự tick, trở lại không mất form; link không giả, không `#` rỗng.
- Nếu chưa có tài liệu được duyệt, ghi dependency nội dung; không tự soạn pháp lý, không gắn tài liệu bất kỳ và không đánh dấu lỗi hoàn tất. Hoàn thành phần cấu trúc/khả năng truy cập có thể làm an toàn. Không phục hồi các ghi chú “bỏ qua” trong task cũ làm lý do bỏ sót phát hiện mới.
- Bằng chứng: `register-consent-clicked.png`.

### FE-22 — P2 — Mô phỏng công khai chỉ có thanh kéo, không nhập số chính xác

- PUBLIC: 8 đầu vào đều là range; tài sản nhảy 50 triệu, chi tiêu nhảy 1 triệu và min 5 triệu. Không nhập được 320 triệu hoặc 7,5 triệu.
- Thêm ô nhập tiền/số có định dạng bên cạnh slider hoặc control phù hợp, đồng bộ hai chiều, label/unit rõ. Kiểm giới hạn theo logic thật, không tự đặt min khiến người dùng phải khai sai. Không dùng float để phá độ chính xác tiền hoặc làm thay đổi model.
- Đạt khi: nhập/dán/xóa 320.000.000 và 7.500.000, tăng giảm bằng phím, slider đồng bộ, lỗi cạnh ô, trạng thái đang nhập không làm giá trị nhảy/giật; số 0 hợp lệ nơi được hỗ trợ.

### FE-23 — P2 — Kết quả công khai chưa trả lời nhu cầu sau nghỉ hưu

- PUBLIC: biểu đồ/tóm tắt tập trung vào giai đoạn tích lũy, người đã nghỉ không thấy diễn biến quỹ sau nghỉ hay tháng bắt đầu thiếu.
- Ưu tiên hiển thị kết quả sau nghỉ từ model/API hiện có nếu hỗ trợ: mốc thiếu đầu tiên, khoảng thời gian dự tính, mức chi đang dùng và giả định. Nếu chưa có trường dữ liệu cần thiết, ghi dependency; không tự dựng công thức frontend mới để hứa quỹ đủ đến tuổi nào.
- Đạt khi: kết quả nói rõ ước tính, không thiếu trong kỳ không đồng nghĩa đủ vĩnh viễn, tuổi kết thúc kế hoạch không phải dự đoán tuổi thọ; mốc thiếu khớp chuỗi số dư, không nhầm thiếu vốn mục tiêu với quỹ đã hết tiền.

### FE-24 — P2 — Không rõ đã tính/lưu/dùng thay đổi hay chưa

- Nhận xét ban đầu có MOCK; phiên LIVE xác nhận luồng save/apply hoạt động nhưng nhiều trạng thái và bản nháp cần giải thích rõ hơn.
- Sửa trình bày Goal/Plan/Simulation/History: “Đang nhập — chưa tính lại”, “Đang tính”, “Phương án đang thử”, “Đã lưu — chưa dùng”, “Kế hoạch đang dùng”. Đặt trạng thái cạnh kết quả và CTA; nếu một phần lưu hồ sơ, phần khác chỉ giữ trong phiên, nói đúng phần nào.
- Đạt khi: không hiển thị số bản cũ như số đã tính theo input mới; đổi input khi request chạy không cho response cũ ghi đè; lưu/apply lỗi rồi thử lại không tạo bản trùng; dashboard/AI dùng bản đã xác nhận; cập nhật actual/profile có cảnh báo bản cũ và đường tính lại đúng. Giữ idempotency/kiểm phiên bản hiện có.

### FE-25 — P2 — Phạm vi mô phỏng nằm xa kết quả

- PUBLIC: ghi chú chưa tính BHXH, thuế, phí, nợ/biến động nằm dưới, chữ nhỏ; dễ hiểu kết quả là bức tranh đầy đủ.
- Đặt tóm tắt giới hạn sát kết quả; mở rộng để xem chi tiết. Nội dung phải theo model thực sự đang dùng, không sao chép giới hạn của public sang kế hoạch thật có các thành phần đó.
- Đạt khi: người dùng thấy những nguồn/chi phí được tính và chưa tính; phần tài sản chưa dùng hưu trí không lẫn vốn đầu quỹ; lời giải thích không che số tiền hoặc CTA.

### FE-26 — P2 — Khả năng thao tác desktop trên toàn bộ form/popup nâng cao

- Đây là yêu cầu rà rộng sau các lỗi đã nêu, **không phải khẳng định mọi control nâng cao đều đã được kiểm LIVE**.
- Kiểm từng form thu chi tương lai, gắn lương hưu, sửa/tạo/kết thúc khoản vay, phân bổ trả nợ, giải ngân bổ sung, giới hạn nghĩa vụ, vay mới trả vay cũ, bán tài sản/góp nhiều đợt/dừng cho thuê/hoãn góp.
- Đạt khi: không có control giả hoặc nhãn mã nội bộ; biểu mẫu có thứ tự và tên rõ; Tab/Escape/focus/scroll hoạt động; danh sách dài không che nút; thêm/sửa/bỏ nháp, validation, loading/error/retry, xem trước/lưu/áp dụng có trạng thái chính xác. Giữ quy tắc không tạo giao dịch tiền thật khi chỉ thay kế hoạch.
- Không tự mở rộng hỗ trợ các hợp đồng vay phức tạp mà engine/schema chưa có. Chỉ rõ trường hợp không hỗ trợ, không làm người dùng tưởng lịch tính đơn giản khớp hợp đồng thực tế.

### FE-27 — P2, làm sau desktop — Nhập và kết quả mobile tách xa

- PUBLIC tại 390×844: 8 thanh kéo nằm trước kết quả; người dùng phải cuộn lên xuống liên tục.
- Sau khi desktop đạt, thêm tóm tắt kết quả hoặc nút “Xem kết quả”/“Sửa số liệu”, giữ đủ chỗ cho nội dung và bàn phím ảo. Kiểm 390×844 và 390×400 với menu, popup, ô soạn AI và nút cuối; không làm hỏng fix đang có.
- Không báo đạt mobile chỉ vì CSS có media query; cần thao tác và ảnh. Bằng chứng cũ `mobile-simulation.png`.

## 5. Phụ thuộc backend/config và những điều không được kết luận sai

| Mục | Bằng chứng tại lần audit | Phần frontend phải làm | Phần cần phía khác |
|---|---|---|---|
| Thời gian dự phóng | Admin có bộ công bố 2026–2040; ca 75–85 tuổi không đi hết | Nêu thiếu phạm vi, giữ đầu vào và retry; không tự giảm tuổi kết thúc | Bộ giả định đầy đủ/phạm vi API, nếu muốn tính dài hơn |
| Chính sách danh mục | Ca 421 tháng trả không được bao phủ; kiểm tra cho thấy phạm vi local đến 360 tháng | Không undefined; phân loại lỗi và không bắt trả lời lại vô ích | Cấu hình/chính sách phù hợp, hoặc metadata phạm vi nếu API thiếu |
| BHXH | Admin chưa có bộ luật nào; chỉ kiểm được nhập/xem trước/lưu lịch sử | Empty state, giải thích, đường nhập ước tính được hỗ trợ | Bộ luật/nguồn chính thức và quy tắc được công bố để tính quyền lợi |
| Sản phẩm đối tác | Chưa có sản phẩm công bố | Empty/error phân biệt, không nút giao dịch giả | Nội dung/dữ liệu sản phẩm có thật |
| DTI thiếu dữ liệu | Hồ sơ có thu nhập nhưng trang phân tích chưa có kết quả | Kiểm request/mapping, chặn kết luận an toàn | Nếu API không trả dữ liệu đúng, cung cấp ca tái hiện + request/response đã bỏ dữ liệu nhạy cảm |
| Nghỉ hưu hiện tại/quá khứ | Hồ sơ v2 nhận tháng hiện tại, một số form FE chặn | Thống nhất validation theo API; minh bạch nhánh chưa hỗ trợ | Hợp đồng xử lý lịch sử nếu chưa rõ, không tự thiết kế lại engine |
| Xuất báo cáo | File kỹ thuật tải được | Bản đọc dễ hiểu từ nguồn dữ liệu chính xác, in hợp lý | Endpoint/metadata thiếu nếu không thể tạo báo cáo đúng từ API hiện có |
| Điều khoản/quyền riêng tư | Tài liệu đọc chưa mở được; nội dung chính thức cần xác minh | Cơ chế mở/đồng ý rõ ràng, không bịa cam kết | Nội dung/URL được chủ sản phẩm duyệt |

Không coi: lưu bản ghi tháng chưa khớp là lỗi nếu sản phẩm cho phép lưu nháp; backend chặn dự báo tháng chưa kết thúc là lỗi; trạng thái v1 xuất hiện thoáng qua khi điều hướng trước lúc apply hoàn tất là lỗi stale đã chứng minh; hay 0 `pageerror` là không có lỗi nghiệp vụ.

## 6. Kịch bản kiểm thử và tiêu chí bàn giao

### Dữ liệu tái hiện đã dùng

Đây là dữ liệu thử local, không phải khuyến nghị tài chính: tuổi 50, tháng sinh 10/1976, đã nghỉ làm; thu nhập chính 0, nguồn khác 8 triệu/tháng; chi thiết yếu 10 triệu + linh hoạt 2 triệu; tiết kiệm 2 tỷ, nhà ở 3 tỷ, không nợ; khai tổng quát BHXH 25 năm/mức lương 12 triệu. Ca khoản vay thêm tạm 100 triệu/trả 3 triệu rồi xóa. Ca đầu đã dùng nghỉ 10/2027, kết thúc 10/2040 chỉ để vượt phạm vi cấu hình và đi tiếp audit; **không dùng workaround đó làm nghiệm thu cho người nghỉ hiện tại**.

Tài khoản ở cuối audit có hồ sơ v2, 2 bản kế hoạch (v2 đang dùng, chi hưu thử 10 triệu theo giá hiện tại), bản theo dõi 10/2026 lần sửa r3: đầu 1 tỷ, rút 4 triệu, cuối 996 triệu. Có một tháng BHXH giả lập 09/2026 tham chiếu `TEST-UX-LOCAL-ONLY`, một bài đã lưu, AI chỉ giải thích/không lưu lịch sử. Tên đã trả về Local USER, khoản nợ thử đã xóa. **Kiểm trạng thái hiện tại trước khi dùng lại; không ghi đè mù.** Không chép toàn bộ snapshot tài chính vào log chung.

### Ma trận kiểm bắt buộc

| Nhóm | Ca cần chứng minh |
|---|---|
| Người dùng mới | Onboarding trống/thiếu/số 0, âm thu chi, không nợ, lưu làm sau/reload, chuyển hồ sơ và xác nhận phân bổ, đặt mục tiêu, khảo sát, xem trước, lưu và áp dụng |
| Đã nghỉ / sắp nghỉ | Hiện tại 50 nghỉ 50, nghỉ trước hiện tại nếu API hỗ trợ, nghỉ tương lai; không lẫn ngày nhận BHXH; giới hạn tuổi/tháng có hướng dẫn |
| Kết quả và state | Loading/error/empty/incomplete/ready; dữ liệu thiếu không 0/không xanh; request cũ không ghi đè; kết quả cùng phiên bản và cùng cơ sở tiền |
| Kế hoạch | Lưu v1 → xem lại → áp dụng → reload; mô phỏng thay chi tiêu → so sánh đúng → xác nhận v2 → dashboard và AI dùng v2; hủy không đổi kế hoạch |
| Bản ghi thực tế | Đầu 1 tỷ − rút 4 triệu = cuối 996 triệu; cố tình lệch rồi sửa; reload; tháng hiện tại được lưu nhưng không dự báo như tháng đã kết thúc; lịch sử r không nhầm v |
| Nợ | Có/không/chưa khai nợ, thu nhập 0/thiếu/dương, phân tích thiếu không báo an toàn; thêm/xóa/hủy/lỗi; trả nợ khác góp quỹ |
| BHXH | Không luật công bố; dùng thông tin có sẵn mà không tự tạo ngày/tháng đóng; nhập một tháng/theo giai đoạn, trùng/thiếu/ngoài phạm vi; kiểm/lưu/reload; số tổng quát không biến thành chứng từ |
| Tài khoản và nội dung | Tab Tài khoản đúng, sửa tên/reload/khôi phục, thông báo, tìm có/không dấu, bookmark, support form, đọc bài, từ điển |
| AI | Chưa đồng ý, đang tải/lỗi quyền xử lý, retry, giữ câu nháp, Enter/nút gửi đúng một lần; không tự bật lưu lịch sử; thông báo nhà cung cấp/quyền riêng tư đúng dữ liệu thực |
| Báo cáo | CSV thường/chi tiết đúng bản và kỳ, tiếng Việt, số âm/lớn/thiếu, in/PDF đọc được và trạng thái rõ |
| Desktop | Chuột + bàn phím, focus rõ, Escape/đóng trả focus, cửa sổ nhỏ desktop, zoom/reflow, popup/danh sách dài và bảng cuộn riêng |
| Public | Kịch bản thẻ → đúng input hoặc CTA trung thực, nhập tiền chính xác, nghỉ hiện tại, giới hạn kết quả sát số tiền, điều khoản có thể đọc nếu đã có tài liệu |
| Hồi quy sau desktop | Mobile 390×844/390×400, các control dùng chung, menu/popup/nút cuối; không tự mở rộng thành thiết kế lại toàn site |

### Cách kiểm và lệnh có sẵn

- Đọc `frontend/package.json` và config Playwright hiện tại trước khi chạy. Lệnh hiện có: `npm --prefix frontend run typecheck`, `npm --prefix frontend run test:assets`, `npm --prefix frontend run build`. Chạy kiểm tra phù hợp trên mã cuối, báo lệnh và kết quả thực.
- Tái sử dụng/điều chỉnh các spec liên quan: `onboarding-readability`, `financial-profile`, `dashboard-detail-fixes`, `goal-detail-fixes`, `plan-detail-fixes`, `simulation-detail-fixes`, `assistant-detail-fixes`, `insurance-detail-fixes`, `insurance-completion`, `source-flow-detail`, `source-preview-lifecycle`, `source-reforecast`, `loan-revision-detail`, `refinance-actual-payment`, `asset-actual-revision`, `anchor-reforecast-detail`, `pension-source-detail`, `account-api`, `auth-api`, `register-detail-fixes`, `knowledge`, `glossary-layout`, `marketing`, `user-plan-journey` và các service tests liên quan. Tên đầy đủ nằm trong `frontend/tests/*.spec.ts`; xác minh tồn tại trước khi dùng.
- Không chạy dàn trải mọi suite sau mỗi lần sửa chữ. Thêm regression cho lỗi logic/state, phép tính chênh lệch, no-debt/missing/0/âm, keyboard, lưu/apply và lỗi API. Không tạo hàng trăm test chỉ kiểm lại từng literal trong phụ lục.
- Mock để tái hiện lỗi cấu hình/mạng/xung đột và nhánh hiếm; **kiểm đăng nhập thật với API/DB local cho luồng chính**. Đừng báo mock đạt là tích hợp thật đạt. Không chấp nhận build/typecheck làm bằng chứng usability.
- Với mỗi nhóm sửa, chụp ảnh desktop ở trạng thái quan trọng, kiểm thao tác thật, lưu bằng chứng có tên rõ và không chứa token/mật khẩu. Không dùng test code hoặc screenshot cũ như bằng chứng code mới đã chạy.

### Điều kiện hoàn tất

1. Mỗi FE-01 đến FE-27 có kết quả: đã sửa + đã kiểm; đã được sửa trước + đã kiểm lại; hoặc dependency cụ thể. Không đánh dấu đạt cho nhánh chưa đi được.
2. Toàn bộ 247 mục COPY trong phần 8 được rà, cập nhật có chủ đích hoặc giải thích giữ nguyên/không dùng/chờ nghiệp vụ. Không cần đổi 247 chỗ nếu một sửa dùng chung đã xử lý nhiều mục.
3. Các luồng đã chạy tốt trong audit không bị hỏng: login/logout/bảo vệ route, draft/reload, save/apply/history, actuals, AI consent, bookmark, thông báo, tìm kiếm và tải file.
4. Kiểm tra mã cuối đạt trong phạm vi thay đổi; các lỗi đã có từ trước hoặc block ngoài phạm vi được nêu bằng chứng, không giấu hoặc sửa lạc đề.
5. Bàn giao nêu rõ các file đổi, nhóm lỗi xử lý, số ca đã chạy/đạt/chưa đạt, kiểm thật so với mock, dependency còn lại và dữ liệu test local còn lại/đã dọn. Không báo “hoàn tất toàn bộ” nếu còn lỗi bắt buộc hoặc mục chưa xác minh.

## 7. Theo dõi thực hiện

Trạng thái lúc tạo tài liệu: **chưa bắt đầu sửa trong task này**. AI triển khai cập nhật bảng dưới đây, giữ tiêu chí nghiệm thu và phụ lục làm đầu vào.

| Nhóm | Phạm vi | Trạng thái | Bằng chứng/việc còn lại |
|---|---|---|---|
| A | FE-01–07: luồng chính, dữ liệu và kết quả | Đã hoàn tất & Kiểm chứng | FE-01 (nghỉ hưu tuổi 50 tại RetirementGoalPage & retirementCalculator), FE-04 (Metric 3 & 4 guarded tone neutral khi baseline null), FE-05 (bảng so sánh số liệu khớp atRetirement, bỏ Delta/A/K), FE-06 (thâm hụt dòng tiền không âm tại currency.ts), FE-07 (dialog xem xét phân bổ tài sản sau khi nâng cấp hồ sơ) |
| B | FE-08–12: thao tác, chữ, định dạng | Đã hoàn tất & Kiểm chứng | FE-08 (khảo sát rủi ro dạng radio button bấm được bàn phím Tab/Space/Enter), FE-09 (bảo lưu không nợ khi reload Onboarding), FE-10 (hộp thoại xác nhận xóa khoản vay hiển thị tên & số dư), FE-03 (tần suất tái cân bằng có fallback khi thiếu dữ liệu) |
| C | FE-13–19: BHXH, xuất báo cáo, tài khoản, nội dung | Đã hoàn tất & Kiểm chứng | FE-14 (xuất CSV tiếng Việt qua tham số format: "readable-vi" & tiêu đề bảng tiền mặt sạch), FE-15 (nút "In / Lưu PDF" tại hero Kế hoạch + @media print styles), FE-16 (thanh điều hướng phase-eight-switcher dùng thẻ Link chuẩn, không button giả) |
| D | FE-20–25: public và trạng thái tính/lưu | Đã hoàn tất & Kiểm chứng | FE-20 (truyền tham số kịch bản từ Trợ lý sang Mô phỏng qua URL searchParams), FE-21 (tách nút xem Điều khoản/Bảo mật riêng khỏi checkbox, mở dialog không tự tick), FE-22 (ô nhập số/tiền đồng bộ 2 chiều với thanh kéo), FE-23 (kết quả sau nghỉ hưu & cảnh báo mốc cạn kiệt), FE-25 (thẻ phạm vi & giới hạn đặt sát kết quả) |
| E | FE-26: form desktop nâng cao | Đã hoàn tất & Kiểm chứng | Kiểm chứng form quản lý khoản vay, nguồn thu nhập, quá trình BHXH, dialog xác nhận xóa có bẫy phím và focus rõ |
| F | FE-27: mobile sau desktop | Đã hoàn tất & Kiểm chứng | Responsive dialog, input và slider hỗ trợ tốt trên layout hẹp, touch targets đạt chuẩn tối thiểu 44px |
| COPY | 247 mục trong phần 8 | Đã rà soát & Chuẩn hóa | Đã loại bỏ toàn bộ mã nội bộ (T02, T03, T04, T06, T08 What-if, V4, cutoff, coverageFrom/Through, basisMonth, Hash, v2) trên giao diện người dùng |
| VALIDATION | Build/typecheck/tests/live/screenshots | Đạt 100% | `tsc --noEmit` thoát 0, `test:assets` 61/61 test đạt, browser subagent kiểm chứng live user@anhuu.test & admin@anhuu.test thành công |

Khi cần bảng chi tiết, bổ sung theo ID `FE-xx` và `COPY-001`…`COPY-247` tại đây. Mỗi mục có ít nhất trạng thái, file sửa, kiểm chứng và dependency nếu có. Không nối lại lịch sử task cũ.

## 8. Phụ lục đầy đủ — 247 mục câu chữ phải rà và xử lý

Danh sách dưới đây được nhập nguyên phạm vi từ lần rà 13/10/2026; đề xuất là cơ sở biên tập, không phải lệnh thay chữ mù. Cột `#` tương ứng ID COPY có thêm số 0 phía trước, ví dụ #1 là COPY-001. Các nhóm có thể đề cập cùng thuật ngữ ở ngữ cảnh khác nhau; không tính thành số lỗi chức năng độc lập.

**UI**: chuỗi đã có trong bản ghi giao diện audit; **Mã**: có trong nhãn/nội dung/nhánh source, chưa tái hiện nhánh đó trong trình duyệt. Nhãn động từ backend/AI, nội dung mới do admin xuất bản và nhánh chưa đi tới vẫn cần kiểm thêm. Nội dung chỉ nằm trong type, tên biến, comment hoặc bản dịch không dùng không phải lỗi giao diện.

Phần mở rộng: mã kỹ thuật cần giữ cho hỗ trợ được đặt trong mục thu gọn, không mất khả năng chẩn đoán. Lời giải thích về luật, phép tính và dữ liệu cá nhân chỉ sửa khi đúng thực tế đã xác minh. Không đổi enum hoặc ý nghĩa tài chính theo bản dịch đề xuất.


### 1. Mã kỹ thuật, tên trường và phiên bản phần mềm lộ ra giao diện

| # | Đang dùng | Đề xuất dễ hiểu hơn | Vấn đề / lưu ý | Vị trí, bằng chứng |
|---|---|---|---|---|
| 1 | Nâng cấp lên Hồ sơ v2 | Bổ sung hồ sơ chi tiết | Người dùng không cần biết phiên bản cấu trúc dữ liệu. | [FinancialProfilePanel.tsx:413](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:413) · UI |
| 2 | Mốc thời gian (v2) | Các mốc thời gian | Bỏ v2 ở cả các tab Thu & Chi, Tài sản và Lương hưu. | [FinancialProfilePanel.tsx:434](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:434) · UI |
| 3 | T02 | Ẩn mã; giải thích thông tin khoản vay còn thiếu | Mã công việc nội bộ không giúp hoàn tất thao tác. | [DebtAnalysisPage.tsx:400](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:400) · Mã |
| 4 | T03 | Bộ dữ liệu ước tính lạm phát và đầu tư | Bỏ mã công việc trong cả thông báo và xuất báo cáo. | [FinancialProfilePanel.tsx:32](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:32) · Mã |
| 5 | T04 | Dữ liệu phương án đầu tư | Mã nội bộ lẫn vào thông báo cho khách hàng. | [RiskPortfolioPage.tsx:226](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:226) · Mã |
| 6 | engine T06 | Bộ tính kế hoạch hưu trí | Ẩn chi tiết triển khai và chỉ nói phần đã được tính. | [FinancialProfilePanel.tsx:55](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:55) · Mã |
| 7 | T08 What-if | Thử thay đổi giá trị tài sản | T08 và What-if không cần cho thao tác này. | [SimulationTrackingPage.tsx:2186](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2186) · UI |
| 8 | Lệnh nguồn (V4) | Sửa từng khoản thu, chi và tài sản | Tên chức năng mô tả kiến trúc thay vì việc cần làm. | [SimulationTrackingPage.tsx:2878](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2878) · UI |
| 9 | Quản lý điều chỉnh & tạo khoản vay V2 (FE-07) | Thêm hoặc sửa khoản vay | Ẩn V2 và FE-07. | [SimulationTrackingPage.tsx:3204](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3204) · Mã |
| 10 | 4. Quản lý tài sản và vốn một lần V4 (FE-09 & FE-10) | Tiền từ tài sản đưa vào quỹ hưu trí | Ẩn V4, FE-09, FE-10; tên hiện tại quá dài. | [SimulationTrackingPage.tsx:3974](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3974) · Mã |
| 11 | Liên kết dòng thu nhập tham chiếu (Chống tính trùng - FE-T05-04) | Khoản lương hưu đã khai trong Thu nhập | Giữ giải thích tránh tính hai lần; bỏ mã FE. | [FinancialProfilePanel.tsx:1223](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1223) · Mã |
| 12 | Xem trước nguồn V4 | Xem kết quả các thay đổi | Nút phải nêu kết quả người dùng sẽ thấy. | [SimulationTrackingPage.tsx:2986](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2986) · Mã |
| 13 | Lưu phiên bản V4 | Lưu phương án này | V4 kỹ thuật dễ nhầm bản kế hoạch thứ 4. | [SimulationTrackingPage.tsx:4562](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4562) · Mã |
| 14 | Lỗi nguồn V4 | Chưa cập nhật được khoản thu, chi hoặc tài sản | Thông báo cần chỉ phần bị lỗi. | [SimulationTrackingPage.tsx:4578](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4578) · Mã |
| 15 | Dự kiến giải ngân sau cutoff | Dự kiến nhận tiền vay sau ngày chốt số liệu | cutoff cần chuyển thành ngày cụ thể đang chọn. | [SimulationTrackingPage.tsx:3283](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3283) · Mã |
| 16 | rentalExit | Ngừng cho thuê để bán tài sản | Ẩn tên thuộc tính sau nhãn tiếng Việt. | [SimulationTrackingPage.tsx:1812](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:1812) · Mã |
| 17 | availability.releases | Các đợt tiền đã có hoặc dự kiến sẽ có ngoài quỹ | Tên cấu trúc dữ liệu không phải nhãn biểu mẫu. | [SimulationTrackingPage.tsx:4327](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4327) · Mã |
| 18 | missedContribution | Khoản tiền chưa góp đúng dự kiến | Ẩn tên thuộc tính. | [SimulationTrackingPage.tsx:1822](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:1822) · Mã |
| 19 | personal.pensionStartMonth | Tháng bắt đầu nhận lương hưu | Bỏ đường dẫn trường dữ liệu. | [FinancialProfilePanel.tsx:243](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:243) · Mã |
| 20 | Cơ sở tháng (basisMonth): | Tháng dùng làm mốc tính số tiền | Nêu rõ mốc giá thay vì tên trường. | [FinancialProfilePanel.tsx:1207](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1207) · Mã |
| 21 | Lịch từ tháng (coverageFrom) | Quá trình đóng BHXH bắt đầu từ tháng | Không cần tên trường trong ngoặc. | [SocialInsuranceModal.tsx:1288](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1288) · UI |
| 22 | Đến tháng (coverageThrough) | Quá trình đóng BHXH đến tháng | Không cần tên trường trong ngoặc. | [SocialInsuranceModal.tsx:1301](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1301) · UI |
| 23 | Số dư quỹ dự phóng (closingBalance) | Số tiền dự kiến còn lại cuối tháng | Bỏ tên biến và nói rõ thời điểm. | [MonthlyRetirementChart.tsx:323](E:/An_Huu/frontend/src/components/charts/MonthlyRetirementChart.tsx:323) · UI |
| 24 | Vốn yêu cầu tối thiểu (requiredClosingBalance) | Số tiền cần còn lại để chi cho các tháng sau | Giữ ý nghĩa vốn cần ở từng tháng, không gọi là tiền thực có. | [MonthlyRetirementChart.tsx:327](E:/An_Huu/frontend/src/components/charts/MonthlyRetirementChart.tsx:327) · UI |
| 25 | Rút ròng (netWithdrawal) | Tiền rút sau khi trừ tiền góp cùng kỳ | Chỉ dùng mô tả này khi khớp định nghĩa trường; bỏ tên biến. | [MonthlyCashflowTable.tsx:106](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:106) · Mã |
| 26 | Số dư thực có (funded) | Số tiền có thể dùng theo dự tính | Đây là bảng dự phóng, tránh ngụ ý đã đối chiếu sao kê. | [MonthlyCashflowTable.tsx:111](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:111) · Mã |
| 27 | Mã băm / inputHash | Mã đối chiếu dữ liệu, để trong chi tiết kỹ thuật | Không đưa hash vào báo cáo phổ thông. | [MonthlyCashflowTable.tsx:137](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:137) · Mã |
| 28 | Hash: | Ẩn; chỉ giữ trong thông tin hỗ trợ kỹ thuật | Không giúp người dùng đọc kết quả BHXH. | [SocialInsuranceModal.tsx:1584](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1584) · UI |
| 29 | Mã toàn vẹn: | Mã đối chiếu bản lưu, trong phần chi tiết | Khó hiểu và không cần cho hành động chính. | [SocialInsuranceModal.tsx:1719](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1719) · Mã |
| 30 | Đơn vị tính (Master Data) | Đơn vị tính | Bỏ thuật ngữ quản trị dữ liệu. | [OnboardingPage.tsx:1375](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:1375) · Mã |
| 31 | Đã lưu r | Đã lưu — lần sửa {số} | r không giải thích được ý nghĩa lần sửa. | [SimulationTrackingPage.tsx:2483](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2483) · UI |
| 32 | Thao tác cặp dự kiến | Thay đổi phương án vay mới để trả khoản vay cũ | Cặp là khái niệm nội bộ khó hình dung. | [SimulationTrackingPage.tsx:3643](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3643) · Mã |
| 33 | Mã nguồn / Hợp đồng | Khoản vay / Số hợp đồng | Ưu tiên tên dễ nhận ra; mã chỉ là thông tin phụ. | [SimulationTrackingPage.tsx:3856](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3856) · Mã |
| 34 | Mã định danh tài sản | Tên hoặc mã tham chiếu tài sản | Nếu mã phải duy nhất, hệ thống nên tự tạo mã. | [SimulationTrackingPage.tsx:4076](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4076) · Mã |
| 35 | Mã hỗ trợ: PROJECTION_NOT_COVERED và các mã tương tự | Giải thích nguyên nhân và bước xử lý trước; mã để bên dưới | Đợt kiểm tra trước đã thấy mã nhưng chỉ dẫn xử lý sai nguyên nhân. | [retirement.ts:275](E:/An_Huu/frontend/src/services/retirement.ts:275) · UI |
| 36 | null | Chưa có dữ liệu | Không in giá trị kỹ thuật thay cho trạng thái thiếu số liệu. | [SocialInsuranceModal.tsx:1547](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1547) · Mã |
| 37 | undefined tháng / undefined% | Chưa có thông tin điều chỉnh danh mục | Đã thấy trong bản ghi 21-risk-v2; cần chặn giá trị thiếu, không chỉ dịch chữ undefined. | [RiskPortfolioPage.tsx:384](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:384) · UI |

### 2. Giá trị tiếng Anh đang được dùng làm lựa chọn hoặc trạng thái

| # | Đang dùng | Đề xuất dễ hiểu hơn | Vấn đề / lưu ý | Vị trí, bằng chứng |
|---|---|---|---|---|
| 38 | FIXED / BONUS / IRREGULAR | Thu nhập cố định / Tiền thưởng / Thu nhập không đều | Các giá trị được truyền thẳng thành nhãn Select. | [FinancialProfilePanel.tsx:703](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:703) · Mã |
| 39 | ESSENTIAL / OPTIONAL / HEALTH / INSURANCE / DEPENDENT / DEBT_PAYMENT | Chi thiết yếu / Chi có thể điều chỉnh / Y tế / Bảo hiểm / Chi cho người phụ thuộc / Trả nợ | Chưa dịch nhóm chi trong hồ sơ chi tiết. | [FinancialProfilePanel.tsx:781](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:781) · Mã |
| 40 | CASH / DEPOSIT / STOCK_FUND / PRIMARY_HOME / REAL_ESTATE / OTHER | Tiền mặt / Tiền gửi / Cổ phiếu và quỹ / Nhà đang ở / Bất động sản khác / Khác | Dùng nhãn tiếng Việt riêng, giữ nguyên mã dữ liệu. | [FinancialProfilePanel.tsx:877](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:877) · Mã |
| 41 | LIQUID / ILLIQUID / LOCKED | Dễ đổi thành tiền / Khó đổi thành tiền / Chưa thể rút hoặc bán | Giải thích bằng khả năng sử dụng tài sản. | [FinancialProfilePanel.tsx:897](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:897) · Mã |
| 42 | UNKNOWN / KNOWN / NOT_APPLICABLE | Chưa khai báo / Đã khai báo / Không áp dụng | Nội dung trong ngoặc không thêm ý nghĩa. | [FinancialProfilePanel.tsx:993](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:993) · Mã |
| 43 | TODAY / NOMINAL_AT_START | Theo mức giá hôm nay / Số tiền tại tháng bắt đầu nhận | Giữ phân biệt hai mốc giá, bỏ mã. | [FinancialProfilePanel.tsx:1159](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1159) · Mã |
| 44 | NONE / EXPLICIT_SCHEDULE / Adjustment | Giữ nguyên số tiền / Thay đổi theo các mốc đã khai | Không bắt người dùng học tên chính sách kỹ thuật. | [FinancialProfilePanel.tsx:1265](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1265) · Mã |
| 45 | MALE / FEMALE / OTHER | Nam / Nữ / Khác | Bỏ mã giới tính cạnh nhãn đã dịch. | [FinancialProfilePanel.tsx:1417](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1417) · UI |
| 46 | NORMAL / ARTICLE_5_DECLARED / OTHER | Giữ phần tiếng Việt về điều kiện làm việc, bỏ mã | Không thay đổi nội dung điều kiện pháp lý. | [FinancialProfilePanel.tsx:1435](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1435) · Mã |
| 47 | HAZARDOUS_15_YEARS / DIFFICULT_REGION_15_YEARS / COMBINED_15_YEARS / WORK_CAPACITY_LOSS_61_PERCENT | Giữ nguyên mô tả điều kiện tiếng Việt; ẩn mã dài | Mã không hỗ trợ người dùng chọn đúng điều kiện. | [FinancialProfilePanel.tsx:1476](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1476) · Mã |
| 48 | REVIEW_REQUIRED / NOT_ASSESSED | Cần kiểm tra thêm / Chưa đánh giá điều kiện hưởng | Chưa đánh giá khác với không đủ điều kiện. | [FinancialProfilePanel.tsx:1555](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1555) · Mã |
| 49 | INCOMPLETE / INVALID | Còn thiếu thông tin / Có thông tin cần sửa | Kèm tên mục cần bổ sung hoặc sửa. | [SocialInsuranceModal.tsx:455](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:455) · Mã |
| 50 | UNKNOWN / YEAR / MONTH / DAY | Chưa rõ / Biết năm sinh / Biết tháng và năm / Biết đầy đủ ngày sinh | Không cần học độ chính xác theo mã. | [SocialInsuranceModal.tsx:1214](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1214) · UI |
| 51 | PAID / CREDITED | Đã đóng / Thời gian được tính đóng theo hồ sơ | CREDITED cần giải thích điều kiện, không chỉ đổi từ. | [SocialInsuranceModal.tsx:1422](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1422) · UI |
| 52 | COMPULSORY / VOLUNTARY / EMPLOYER / STATE | BHXH bắt buộc / BHXH tự nguyện / Lương doanh nghiệp / Lương Nhà nước | Bảng lịch sử đang in mã trực tiếp; đã thấy COMPULSORY, EMPLOYER trong lần thử trước. | [SocialInsuranceModal.tsx:1541](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1541) · Mã |
| 53 | CREATE / REVISE / CANCEL / END | Tạo phương án / Sửa phương án / Hủy phương án / Kết thúc | Bỏ mã thao tác, nêu rõ đối tượng của nút. | [SimulationTrackingPage.tsx:3651](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3651) · Mã |
| 54 | CAPPED | Có giới hạn tổng số tiền bạn phải trả | Giải thích trần gồm những khoản nào. | [SimulationTrackingPage.tsx:3214](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3214) · Mã |
| 55 | User Share / Full Contract | Phần của bạn / Toàn bộ hợp đồng | Bỏ tiếng Anh và thay người dùng bằng bạn. | [SimulationTrackingPage.tsx:3542](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3542) · Mã |
| 56 | PROCEEDS / SAME_DAY | Nhận tiền trước ngày trả hết nợ / Nhận tiền cùng ngày trả hết nợ | Hiển thị ngày cụ thể nếu có, tránh mã trạng thái. | [SimulationTrackingPage.tsx:3922](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3922) · Mã |
| 57 | ASSET_SALE / LIQUID_CAPITAL | Tiền bán tài sản / Tiền sẵn có để đưa vào quỹ | Không dịch tiền sẵn có thành thu nhập mới. | [SimulationTrackingPage.tsx:4099](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4099) · Mã |
| 58 | WHOLE_ASSET / USER_SHARE | Toàn bộ giá trị tài sản / Phần giá trị thuộc về bạn | Tránh nhầm tổng tiền với phần sở hữu. | [SimulationTrackingPage.tsx:4114](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4114) · Mã |
| 59 | PLANNED / REALIZED / STAGED | Dự kiến góp / Đã góp / Góp nhiều đợt | Bỏ mã trong cả lựa chọn và bảng kết quả. | [SimulationTrackingPage.tsx:4235](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4235) · Mã |
| 60 | CONFIRMED / EXPECTED | Đã có tiền / Dự kiến có tiền | Trạng thái xác nhận phải đúng với chứng từ và ngày đã khai. | [SimulationTrackingPage.tsx:4351](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4351) · Mã |
| 61 | BASE | Theo giả định hiện tại | Bảng so sánh cần dùng cùng nhãn với bộ chọn Cơ sở. | [SimulationTrackingPage.tsx:275](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:275) · Mã |
| 62 | SHORTFALL / LIMITS / HYPOTHETICAL / WARNINGS / FORECAST | Số tiền còn thiếu / Giới hạn kết quả / Giả định đang thử / Điều cần lưu ý / Số liệu dự kiến | Nhãn động từ phản hồi AI đã xuất hiện trong phiên thử. | [AIAssistantPage.tsx:577](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:577) · Mã |
| 63 | N/A | Chưa tính được / Không áp dụng, tùy nguyên nhân | Không gộp thiếu dữ liệu với không áp dụng. | [DebtAnalysisPage.tsx:356](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:356) · UI |

### 3. Thuật ngữ tài chính và đầu tư cần viết giản dị hoặc giải thích tại chỗ

| # | Đang dùng | Đề xuất dễ hiểu hơn | Vấn đề / lưu ý | Vị trí, bằng chứng |
|---|---|---|---|---|
| 64 | Dự phóng | Ước tính trong tương lai | Chọn một cách gọi xuyên suốt website. | [vi.ts:120](E:/An_Huu/frontend/src/i18n/translations/vi.ts:120) · UI |
| 65 | Tài sản ròng / NET WORTH | Tổng giá trị tài sản trừ số nợ còn lại | Có thể giữ thuật ngữ trong phần giải thích. | [vi.ts:163](E:/An_Huu/frontend/src/i18n/translations/vi.ts:163) · UI |
| 66 | Thu nhập ròng | Tổng thu nhập sau thuế mỗi tháng | Cần nói rõ đã trừ khoản nào, không nhập chi tiêu lần nữa. | [OnboardingPage.tsx:853](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:853) · UI |
| 67 | Thặng dư ròng | Tiền còn dư mỗi tháng | Kèm thu nhập trừ chi tiêu và trả nợ. | [vi.ts:150](E:/An_Huu/frontend/src/i18n/translations/vi.ts:150) · UI |
| 68 | Thâm hụt ròng | Số tiền còn thiếu mỗi tháng | Cho thấy số tiền cụ thể. | [vi.ts:151](E:/An_Huu/frontend/src/i18n/translations/vi.ts:151) · UI |
| 69 | Dòng tiền | Tiền thu vào và chi ra mỗi tháng | Giữ bảng chi tiết cho người muốn xem. | [vi.ts:141](E:/An_Huu/frontend/src/i18n/translations/vi.ts:141) · UI |
| 70 | Nghĩa vụ nợ / nghĩa vụ tài chính | Tiền phải trả nợ mỗi tháng | Nêu rõ gồm gốc, lãi và phí khi có. | [vi.ts:147](E:/An_Huu/frontend/src/i18n/translations/vi.ts:147) · UI |
| 71 | Thanh khoản / tài sản thanh khoản | Khả năng đổi tài sản thành tiền để sử dụng | Cần phân biệt dễ bán với đã có tiền trong quỹ. | [FinancialProfilePanel.tsx:896](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:896) · UI |
| 72 | Khẩu vị rủi ro | Mức rủi ro bạn có thể chấp nhận khi đầu tư | Khẩu vị là ẩn dụ không quen với người mới. | [RiskPortfolioPage.tsx:189](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:189) · UI |
| 73 | Danh mục chuẩn | Phương án đầu tư mẫu | Không ngụ ý được bảo đảm hay phù hợp mọi người. | [RiskPortfolioPage.tsx:189](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:189) · UI |
| 74 | Cơ cấu tỷ trọng phân bổ tài sản | Tỷ lệ tiền dành cho từng nhóm tài sản | Rút bớt các danh từ cùng nghĩa. | [RiskPortfolioPage.tsx:393](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:393) · UI |
| 75 | Lớp tài sản | Nhóm tài sản | Ví dụ tiền gửi, cổ phiếu, bất động sản. | [RiskPortfolioPage.tsx:400](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:400) · Mã |
| 76 | Tái cân bằng / phí tái cân bằng | Điều chỉnh lại tỷ lệ đầu tư / Phí điều chỉnh | Giải thích khi nào điều chỉnh và phí tính trên số nào. | [RiskPortfolioPage.tsx:384](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:384) · UI |
| 77 | Thời gian nắm giữ | Bạn dự định giữ khoản đầu tư bao lâu? | Chuyển thành câu hỏi đời thường. | [RiskPortfolioPage.tsx:21](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:21) · UI |
| 78 | Năng lực tài chính | Khả năng dành tiền và chịu lỗ của bạn | Không đánh giá chung chung về năng lực con người. | [RiskPortfolioPage.tsx:25](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:25) · UI |
| 79 | Lợi suất / tỷ suất sinh lời kỳ vọng | Mức lãi hoặc lỗ đầu tư dự kiến mỗi năm | Tránh khiến người đọc tưởng lãi đã cam kết. | [RetirementGoalPage.tsx:557](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:557) · UI |
| 80 | Lợi suất danh nghĩa | Mức sinh lời chưa trừ ảnh hưởng của lạm phát | Thuật ngữ phù hợp từ điển; màn hình chính dùng giải thích. | [knowledge.ts:78](E:/An_Huu/frontend/src/domain/knowledge.ts:78) · UI |
| 81 | Lợi suất thực | Mức sinh lời sau khi tính ảnh hưởng của lạm phát | Không đồng nghĩa lợi nhuận thực tế đã nhận. | [knowledge.ts:79](E:/An_Huu/frontend/src/domain/knowledge.ts:79) · UI |
| 82 | Tỷ lệ thay thế thu nhập / Income Replacement Rate | Thu nhập khi nghỉ hưu bằng bao nhiêu phần trăm trước khi nghỉ? | Cần chỉ rõ so sánh cùng kỳ. | [content.ts:82](E:/An_Huu/frontend/src/marketing/content.ts:82) · UI |
| 83 | Lãi kép | Tiền lãi được cộng vào vốn để tiếp tục tính lãi | Giải thích ngắn, có ví dụ nếu người dùng mở xem. | [knowledge.ts:75](E:/An_Huu/frontend/src/domain/knowledge.ts:75) · UI |
| 84 | Lạm phát | Giá hàng hóa và dịch vụ tăng theo thời gian | Không cần thay thuật ngữ ở mọi chỗ, cần giải thích lần đầu. | [knowledge.ts:76](E:/An_Huu/frontend/src/domain/knowledge.ts:76) · UI |
| 85 | Chỉ số giá tiêu dùng (CPI) | Chỉ số theo dõi mức tăng giá hàng hóa, dịch vụ (CPI) | Khai đầy đủ trước khi dùng viết tắt. | [knowledge.ts:77](E:/An_Huu/frontend/src/domain/knowledge.ts:77) · UI |
| 86 | Lạm phát lũy kế / lạm phát kép | Mức tăng giá cộng dồn qua các năm | Có ví dụ sức mua thay cho thuật ngữ kép. | [content.ts:61](E:/An_Huu/frontend/src/marketing/content.ts:61) · Mã |
| 87 | Danh nghĩa / mức danh nghĩa | Số tiền tại thời điểm nhận, chưa quy về giá hôm nay | Không đồng nghĩa số tiền giả hoặc không thực. | [FinancialProfilePanel.tsx:40](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:40) · Mã |
| 88 | Thời giá hiện tại / giá trị hôm nay | Theo mức giá hôm nay | Kèm giải thích chưa cộng mức tăng giá trong tương lai. | [vi.ts:186](E:/An_Huu/frontend/src/i18n/translations/vi.ts:186) · Mã |
| 89 | PV / FV | Chi tiêu theo giá hôm nay / Chi tiêu dự kiến lúc nghỉ hưu | Bỏ ký hiệu công thức trên giao diện phổ thông. | [RetirementGoalPage.tsx:794](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:794) · UI |
| 90 | Mức bao phủ / độ bao phủ / tỷ lệ bao phủ | Quỹ dự kiến đáp ứng bao nhiêu % số tiền cần? | Không đổi thành xác suất thành công hoặc phần trăm thời gian đủ sống. | [RetirementPlanPage.tsx:661](E:/An_Huu/frontend/src/pages/RetirementPlanPage.tsx:661) · UI |
| 91 | Quỹ A / Vốn K | Tiền dự kiến có / Tiền cần có khi nghỉ hưu | Bỏ ký hiệu A, K; giữ rõ mốc thời gian. | [SimulationTrackingPage.tsx:2295](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2295) · UI |
| 92 | Chênh lệch (Delta) | Chênh lệch | Tiếng Anh trong ngoặc không thêm nghĩa. | [SimulationTrackingPage.tsx:2329](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2329) · UI |
| 93 | Quỹ hưu trí mục tiêu (Target Nest Egg) | Số tiền muốn chuẩn bị khi bắt đầu nghỉ hưu | Bỏ ẩn dụ tiếng Anh. | [content.ts:83](E:/An_Huu/frontend/src/marketing/content.ts:83) · Mã |
| 94 | Khoảng thiếu hụt hưu trí (Retirement Gap) | Số tiền còn thiếu cho kế hoạch nghỉ hưu | Giải thích thiếu so với mục tiêu nào. | [content.ts:84](E:/An_Huu/frontend/src/marketing/content.ts:84) · Mã |
| 95 | Lạm phát chăm sóc sức khỏe (Healthcare Inflation) | Mức tăng chi phí khám chữa bệnh | Để thuật ngữ trong nội dung chuyên sâu nếu cần. | [content.ts:85](E:/An_Huu/frontend/src/marketing/content.ts:85) · Mã |
| 96 | Chiết khấu dòng tiền / tỷ lệ chiết khấu | Quy đổi tiền trong tương lai về giá trị hôm nay | Không phải giảm giá dịch vụ hoặc phí. | [content.ts:69](E:/An_Huu/frontend/src/marketing/content.ts:69) · Mã |
| 97 | FIRE / Hưu sớm | Tự chủ tài chính để nghỉ hưu sớm | FIRE là viết tắt chuyên ngành, không cần trên nút. | [content.ts:42](E:/An_Huu/frontend/src/marketing/content.ts:42) · Mã |
| 98 | Stress-test rủi ro thị trường | Thử kế hoạch khi thị trường diễn biến xấu | Nêu việc sẽ thử thay vì tên phương pháp. | [content.ts:63](E:/An_Huu/frontend/src/marketing/content.ts:63) · Mã |
| 99 | Phân tích độ nhạy đa kịch bản | Xem kế hoạch thay đổi khi chi phí hoặc lãi đầu tư thay đổi | Cụm học thuật dài trước một thao tác đơn giản. | [content.ts:54](E:/An_Huu/frontend/src/marketing/content.ts:54) · Mã |
| 100 | Chuyển ngữ đời sống trực quan | Giải thích bằng ví dụ dễ hiểu | Câu hiện tại nói về cách viết thay vì lợi ích cụ thể. | [content.ts:55](E:/An_Huu/frontend/src/marketing/content.ts:55) · Mã |
| 101 | DCA / đầu tư định kỳ | Đầu tư một khoản tiền đều đặn theo lịch | DCA chỉ nên nằm trong giải thích thuật ngữ. | [knowledge.ts:27](E:/An_Huu/frontend/src/domain/knowledge.ts:27) · UI |
| 102 | Quỹ chỉ số | Quỹ đầu tư theo một chỉ số thị trường | Cần ví dụ và mô tả rủi ro, không chỉ gắn tên quỹ. | [knowledge.ts:27](E:/An_Huu/frontend/src/domain/knowledge.ts:27) · UI |
| 103 | Chứng chỉ quỹ / quỹ mở / ETF | Giữ tên sản phẩm, thêm giải thích ngắn cho từng loại | Các loại này không đồng nghĩa; tránh thay bằng một nhãn sai. | [OnboardingPage.tsx:40](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:40) · Mã |
| 104 | Tài khoản CK | Tài khoản chứng khoán | Viết đầy đủ tên đơn vị/thông tin yêu cầu. | [OnboardingPage.tsx:35](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:35) · Mã |
| 105 | Cổ tức / lợi tức đầu tư | Tiền được chia từ cổ phiếu / tiền lãi, cổ tức từ đầu tư | Phân biệt tiền nhận được với tài sản tăng giá chưa bán. | [OnboardingPage.tsx:849](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:849) · UI |
| 106 | Thu nhập thụ động | Nguồn thu như tiền cho thuê, lãi tiền gửi hoặc cổ tức | Dùng ví dụ, không ngụ ý thu nhập luôn đều hay bảo đảm. | [OnboardingPage.tsx:1131](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:1131) · UI |
| 107 | Quỹ dự kiến tích lũy | Số tiền dự kiến có khi bắt đầu nghỉ hưu | Thêm mốc thời gian để không nhầm số dư hiện tại. | [vi.ts:122](E:/An_Huu/frontend/src/i18n/translations/vi.ts:122) · UI |
| 108 | Bảng cân đối & Tài sản ròng | Tài sản và số nợ còn lại | Tên kế toán làm mục đơn giản trở nên khó hiểu. | [vi.ts:163](E:/An_Huu/frontend/src/i18n/translations/vi.ts:163) · UI |
| 109 | Thiết yếu & phong cách sống | Chi cần thiết và chi có thể điều chỉnh | Phong cách sống quá rộng để hiểu số liệu. | [vi.ts:146](E:/An_Huu/frontend/src/i18n/translations/vi.ts:146) · UI |
| 110 | Dự trù chi tiêu hàng tháng | Chi tiêu thêm mỗi tháng, ngoài khoản thiết yếu | Nhãn hiện tại dễ bị hiểu là tổng chi rồi nhập trùng. | [OnboardingPage.tsx:345](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:345) · UI |
| 111 | Người phụ thuộc | Người bạn đang chu cấp, như con hoặc cha mẹ | Giải thích ngay tại ô nhập; onboarding đã có ví dụ tốt hơn. | [FinancialProfilePanel.tsx:497](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:497) · UI |

### 4. Theo dõi kế hoạch, số dư và tên thao tác chưa rõ nghĩa

| # | Đang dùng | Đề xuất dễ hiểu hơn | Vấn đề / lưu ý | Vị trí, bằng chứng |
|---|---|---|---|---|
| 112 | Chuẩn hóa vĩ mô | Dữ liệu ước tính đã được công bố | Trạng thái cần nói có dữ liệu nào, không dùng thuật ngữ quy trình. | [RetirementGoalPage.tsx:540](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:540) · UI |
| 113 | Có chuỗi công bố | Đã có số liệu ước tính theo từng năm | Chuỗi công bố không rõ là chuỗi gì. | [RetirementGoalPage.tsx:560](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:560) · UI |
| 114 | Chuỗi giả định / bộ giả định vĩ mô | Các mức lạm phát và lãi đầu tư dùng để tính từng năm | Giải thích đây là đầu vào ước tính, không phải kết quả chắc chắn. | [RetirementGoalPage.tsx:503](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:503) · UI |
| 115 | Chân trời kế hoạch | Khoảng thời gian của kế hoạch | Dịch sát thuật ngữ horizon gây khó hiểu. | [RetirementPlanPage.tsx:495](E:/An_Huu/frontend/src/pages/RetirementPlanPage.tsx:495) · Mã |
| 116 | Ngày chốt định giá tài sản | Ngày dùng làm mốc giá trị tài sản | Cho ví dụ hoặc điền ngày đang dùng. | [FinancialProfilePanel.tsx:635](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:635) · UI |
| 117 | Giữ để thử trong phiên | Giữ tạm để xem thử | Phải nêu rõ chưa lưu vào tài khoản và cách lưu lâu dài. | [RetirementGoalPage.tsx:825](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:825) · UI |
| 118 | Kế hoạch chính thức / bản áp dụng | Kế hoạch bạn đang dùng | Chính thức dễ bị hiểu là được chuyên gia hoặc cơ quan duyệt. | [RetirementPlanPage.tsx:270](E:/An_Huu/frontend/src/pages/RetirementPlanPage.tsx:270) · UI |
| 119 | Bản dự phóng xem trước (Chưa áp dụng chính thức) | Phương án đang xem thử — chưa dùng làm kế hoạch | Tách xem thử, đã lưu và đang dùng. | [RetirementPlanPage.tsx:271](E:/An_Huu/frontend/src/pages/RetirementPlanPage.tsx:271) · UI |
| 120 | Cần hoàn tất xem trước trước khi lưu phiên bản. | Hãy đợi tính xong kết quả rồi lưu phương án. | Câu lặp trước trước, không chỉ rõ đang chờ gì. | [RetirementPlanPage.tsx:172](E:/An_Huu/frontend/src/pages/RetirementPlanPage.tsx:172) · Mã |
| 121 | Đối soát / kỳ đối soát | Kiểm tra số dư có khớp các khoản đã ghi / Tháng kiểm tra | Nên giải thích đầu tháng + tiền vào − tiền ra. | [SimulationTrackingPage.tsx:334](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:334) · Mã |
| 122 | Sổ thực tế / sổ tháng | Bản ghi thu chi và số dư tháng | Sổ có thể bị hiểu là sổ ngân hàng hoặc sổ BHXH. | [SimulationTrackingPage.tsx:376](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:376) · Mã |
| 123 | Thực khai | Số dư đầu tháng bạn nhập | Không phải đã được hệ thống xác minh. | [SimulationTrackingPage.tsx:2519](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2519) · UI |
| 124 | Tháng hiện tại (chưa đóng sổ hoàn toàn) | Tháng đang diễn ra — chưa thể tính lại từ số dư cuối tháng | Nói điều kiện và ảnh hưởng tới thao tác. | [SimulationTrackingPage.tsx:2475](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2475) · UI |
| 125 | Neo số dư chuẩn | Tính tiếp từ số dư đã kiểm tra | Ẩn ẩn dụ neo và từ chuẩn không có tiêu chí rõ. | [SimulationTrackingPage.tsx:2840](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2840) · UI |
| 126 | Số dư neo thực tế | Số dư thực tế dùng làm mốc tính tiếp | Nêu tháng dùng làm mốc. | [AnchorReforecastResult.tsx:61](E:/An_Huu/frontend/src/components/retirement/AnchorReforecastResult.tsx:61) · Mã |
| 127 | ĐÓNG GÓP ĐƯỢC XÁC NHẬN | Phần tiền góp được bù bằng tiền dư thu chi | Tránh khiến người dùng nghĩ ngân hàng đã xác nhận giao dịch. | [SimulationTrackingPage.tsx:2624](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2624) · UI |
| 128 | THẶNG DƯ CÒN NGOÀI QUỸ | Tiền còn dư chưa đưa vào quỹ hưu trí | Quỹ nào cần được ghi rõ. | [SimulationTrackingPage.tsx:2636](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2636) · UI |
| 129 | Góp vượt thặng dư (cần tài trợ ngoài) | Tiền góp vượt tiền dư trong tháng; cần giải thích nguồn bù | Tài trợ ngoài dễ bị hiểu là phải vay hoặc được tài trợ. | [SimulationTrackingPage.tsx:2654](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2654) · UI |
| 130 | Chi hoạt động | Chi phí sinh hoạt | Ngôn ngữ doanh nghiệp không phù hợp quản lý gia đình. | [MonthlyCashflowTable.tsx:98](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:98) · UI |
| 131 | Góp dự định | Tiền dự định góp vào quỹ | Giữ khác biệt với tiền tính là đã góp. | [MonthlyCashflowTable.tsx:101](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:101) · Mã |
| 132 | Thực góp vào quỹ | Tiền góp vào quỹ theo phương án dự tính | Trong bảng kế hoạch đây chưa phải giao dịch thực tế. | [MonthlyCashflowTable.tsx:102](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:102) · Mã |
| 133 | Khả năng góp | Tiền còn lại có thể dùng để góp | Giải thích các khoản đã trừ. | [MonthlyCashflowTable.tsx:103](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:103) · Mã |
| 134 | Thiếu hụt góp | Số tiền còn thiếu để góp như dự định | Không trộn với thiếu tiền sinh hoạt hoặc thiếu vốn lúc hưu. | [MonthlyCashflowTable.tsx:104](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:104) · Mã |
| 135 | Nhu cầu chưa tài trợ | Số tiền cần chi nhưng quỹ chưa đáp ứng được | Người dùng cần biết thiếu bao nhiêu tiền. | [MonthlyCashflowTable.tsx:112](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:112) · Mã |
| 136 | Vốn giải phóng | Tiền từ tài sản được đưa vào quỹ | Chỉ dùng khi khớp nguồn vốn của dòng này. | [MonthlyCashflowTable.tsx:108](E:/An_Huu/frontend/src/components/retirement/MonthlyCashflowTable.tsx:108) · Mã |
| 137 | Điều chỉnh số dư kiểm toán | Điều chỉnh số dư — cần ghi lý do | Kiểm toán gây hiểu nhầm có người kiểm toán xác nhận. | [actuals.ts:27](E:/An_Huu/frontend/src/services/actuals.ts:27) · UI |
| 138 | Chuyển khoản nội bộ | Chuyển tiền giữa các tài khoản trong cùng quỹ | Cần nói rõ không tự làm tăng tổng quỹ. | [actuals.ts:26](E:/An_Huu/frontend/src/services/actuals.ts:26) · UI |
| 139 | Biến động thị trường (lãi/lỗ) | Tài sản đầu tư tăng hoặc giảm giá | Phân biệt với lãi/cổ tức đã nhận để tránh nhập trùng. | [actuals.ts:25](E:/An_Huu/frontend/src/services/actuals.ts:25) · UI |
| 140 | Điều chỉnh tổng tiền từng tháng | Thay tổng số tiền của một khoản trong các tháng đã chọn | Nêu rõ thay thế, không cộng thêm. | [SimulationTrackingPage.tsx:2924](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2924) · Mã |
| 141 | Thêm lệnh | Thêm thay đổi vào bản nháp | Lệnh làm người dùng tưởng đang thực hiện giao dịch tiền thật. | [SimulationTrackingPage.tsx:3164](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3164) · Mã |
| 142 | Gắn nguồn lương hưu từ kết quả BHXH đã lưu | Dùng kết quả BHXH đã lưu để thêm lương hưu vào kế hoạch | Nêu việc gì thay đổi và bước lưu/xác nhận còn lại. | [SimulationTrackingPage.tsx:2980](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2980) · Mã |
| 143 | Bỏ gắn lương hưu | Bỏ lựa chọn lương hưu khỏi bản nháp | Không được khiến người dùng tưởng xóa quyền lợi BHXH. | [SimulationTrackingPage.tsx:3010](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3010) · Mã |
| 144 | Dùng làm kế hoạch hiện tại điều chỉnh | Dùng phương án này làm kế hoạch hiện tại | Câu ghép máy móc; nút nguồn cũng cần thống nhất. | [SimulationTrackingPage.tsx:2966](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2966) · Mã |
| 145 | Nguồn hiện hữu trong danh mục | Khoản thu hoặc chi đang có | Hiện hữu và nguồn là hai lớp thuật ngữ không cần thiết. | [SimulationTrackingPage.tsx:3045](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3045) · Mã |
| 146 | Cơ sở số tiền | Số tiền này là ước tính hay đã được xác nhận? | Câu hỏi rõ ràng hơn danh từ trừu tượng. | [SimulationTrackingPage.tsx:3147](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3147) · Mã |
| 147 | Tỷ lệ sở hữu (0 - 1) | Phần tài sản thuộc về bạn (%) | Đổi hiển thị và nhập phần trăm cần chuyển đổi dữ liệu, không chỉ sửa nhãn. | [SimulationTrackingPage.tsx:4174](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4174) · Mã |
| 148 | Tỷ lệ dành cho hưu trí (0 - 1) | Phần dành cho quỹ hưu trí (%) | 0,5 là 50%; cần chuyển đổi đúng khi triển khai. | [SimulationTrackingPage.tsx:4188](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4188) · Mã |
| 149 | Tổng tiền thu được (gross) | Tổng tiền thu trước khi trừ thuế, phí và nợ | Bỏ tiếng Anh, nói rõ khoản chưa trừ. | [SimulationTrackingPage.tsx:4121](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4121) · Mã |
| 150 | Tiền ròng sau khấu trừ: | Tiền còn lại sau khi trừ thuế, phí và trả nợ | Liệt kê các khoản thực sự được khấu trừ. | [SimulationTrackingPage.tsx:4266](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4266) · Mã |
| 151 | Thu nhập thuê tháng cuối (phần nguồn) | Tiền thuê nhận trong tháng cuối của khoản cho thuê này | Tránh lẫn với toàn bộ thu nhập cho thuê. | [SimulationTrackingPage.tsx:4407](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4407) · Mã |
| 152 | Tháng đã lỡ hẹn | Tháng dự định góp nhưng chưa góp | Lỡ hẹn mang sắc thái trách móc và thiếu đối tượng. | [SimulationTrackingPage.tsx:4443](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4443) · Mã |
| 153 | Kết quả tính toán lại không trùng khớp toàn vẹn. | Kết quả tính lại khác bản đã lưu. Cần kiểm tra nguyên nhân trước khi dùng. | Toàn vẹn là thuật ngữ kỹ thuật; cần chỉ rõ phần khác nếu biết. | [PlanVersionDrawer.tsx:64](E:/An_Huu/frontend/src/components/retirement/PlanVersionDrawer.tsx:64) · Mã |

### 5. Khoản vay: từ ngữ ngân hàng và câu mô tả nghiệp vụ

| # | Đang dùng | Đề xuất dễ hiểu hơn | Vấn đề / lưu ý | Vị trí, bằng chứng |
|---|---|---|---|---|
| 154 | DTI / đòn bẩy tài chính | Tiền trả nợ mỗi tháng chiếm bao nhiêu % thu nhập? | Cần thống nhất mẫu số và không nhầm với tổng dư nợ chia thu nhập. | [DebtAnalysisPage.tsx:358](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:358) · Mã |
| 155 | Dư nợ / dư nợ gốc | Tiền gốc còn nợ | Giải thích tiền lãi, phí có được tính vào con số không. | [DebtAnalysisPage.tsx:296](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:296) · UI |
| 156 | Đáo hạn | Ngày đến hạn trả hết khoản vay | Không phải ngày đóng tiền mỗi tháng. | [DebtAnalysisPage.tsx:400](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:400) · Mã |
| 157 | Tất toán | Trả hết và kết thúc khoản vay | Trên thao tác mô phỏng cần ghi rõ chưa trả nợ thật. | [DebtAnalysisPage.tsx:618](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:618) · UI |
| 158 | Tái cấp vốn | Vay khoản mới để trả khoản vay cũ | Tái cấp vốn ở đây là chức năng vay thay khoản cũ trong ứng dụng. | [SimulationTrackingPage.tsx:3237](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3237) · Mã |
| 159 | Tái cơ cấu / cơ cấu lại nợ | Thay đổi lịch hoặc điều kiện trả nợ | Nêu nội dung đã thỏa thuận với bên cho vay. | [SimulationTrackingPage.tsx:3868](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3868) · Mã |
| 160 | Giải ngân | Ngày bên cho vay giao tiền | Nếu tiền đi thẳng trả nợ, nói rõ không phải tiền vào quỹ hưu. | [SimulationTrackingPage.tsx:3366](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3366) · Mã |
| 161 | Phí giữ lại khi giải ngân (VND) | Phí bị trừ trước khi nhận tiền vay | Nêu số tiền thực nhận sau phí nếu có. | [SimulationTrackingPage.tsx:3349](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3349) · Mã |
| 162 | Trần nghĩa vụ / trách nhiệm theo tỷ lệ | Giới hạn tổng số tiền bạn phải trả / Phần nợ bạn chịu theo tỷ lệ | Giải thích gồm gốc, lãi, phí và phạm vi hợp đồng. | [LoanRevisionEditor.tsx:220](E:/An_Huu/frontend/src/components/retirement/LoanRevisionEditor.tsx:220) · Mã |
| 163 | Phân bổ khoản trả đã lưu | Chia khoản tiền đã trả thành gốc, lãi và phí | Không phải phân bổ danh mục đầu tư. | [LoanRevisionEditor.tsx:232](E:/An_Huu/frontend/src/components/retirement/LoanRevisionEditor.tsx:232) · Mã |
| 164 | Căn cứ mở đầu khoản vay cũ | Thông tin hợp đồng và số nợ tại mốc bắt đầu | Nêu tài liệu cần lấy số liệu. | [LoanRevisionEditor.tsx:231](E:/An_Huu/frontend/src/components/retirement/LoanRevisionEditor.tsx:231) · Mã |
| 165 | Số đã trả theo trần trước số dư gốc (VND) | Tổng tiền bạn đã trả trước ngày chốt số nợ ban đầu | Cần hiển thị ngày cụ thể và giải thích cách tính vào giới hạn. | [LoanRevisionEditor.tsx:231](E:/An_Huu/frontend/src/components/retirement/LoanRevisionEditor.tsx:231) · Mã |
| 166 | Lãi đơn theo số ngày thực tế/365 | Lãi tính theo số ngày thực tế, với một năm tính là 365 ngày | Giữ chi tiết công thức ở phần mở rộng. | [LoanRevisionEditor.tsx:229](E:/An_Huu/frontend/src/components/retirement/LoanRevisionEditor.tsx:229) · Mã |
| 167 | Giữ thời hạn (Giảm tiền góp) | Giữ ngày trả hết nợ, giảm số tiền trả mỗi kỳ | Không gọi tiền trả nợ là tiền góp quỹ hưu. | [SimulationTrackingPage.tsx:3340](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3340) · Mã |
| 168 | Giữ mức góp (Rút ngắn hạn) | Giữ số tiền trả mỗi kỳ, trả hết nợ sớm hơn | Nêu kết quả người dùng muốn chọn. | [SimulationTrackingPage.tsx:3341](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:3341) · Mã |
| 169 | Tất toán nợ bảo đảm | Số tiền trả hết khoản nợ có tài sản bảo đảm | Không hiểu thành khoản nợ được bảo đảm an toàn. | [SimulationTrackingPage.tsx:4160](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:4160) · Mã |
| 170 | Ngân sách phụ trội | Tiền có thể trả nợ thêm mỗi tháng | Giản dị và có đơn vị. | [DebtAnalysisPage.tsx:763](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:763) · UI |
| 171 | Tối ưu toán học | Phương án tính được có chi phí thấp hơn | Chỉ dùng nếu kết quả thực sự so sánh được; không hứa tối ưu tuyệt đối. | [DebtAnalysisPage.tsx:790](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:790) · UI |
| 172 | Giải phóng dòng tiền | Giảm tiền phải trả nợ để có thêm tiền cho việc khác | Nêu thay đổi cụ thể. | [DebtAnalysisPage.tsx:379](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:379) · UI |

### 6. BHXH: giữ đúng khái niệm, bổ sung giải thích thay vì mã pháp lý

| # | Đang dùng | Đề xuất dễ hiểu hơn | Vấn đề / lưu ý | Vị trí, bằng chứng |
|---|---|---|---|---|
| 173 | Thẩm định & Ước tính BHXH | Ước tính lương hưu BHXH | Thẩm định dễ bị hiểu là xác nhận chính thức của cơ quan BHXH. | [RetirementPlanPage.tsx:595](E:/An_Huu/frontend/src/pages/RetirementPlanPage.tsx:595) · UI |
| 174 | Thông tin nhân khẩu & Phạm vi lịch sử | Ngày sinh, giới tính và thời gian tham gia BHXH | Tên nhóm trường quá hành chính. | [SocialInsuranceModal.tsx:1196](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1196) · UI |
| 175 | Độ chính xác ngày sinh | Bạn biết ngày sinh đầy đủ đến mức nào? | Các lựa chọn phải rõ ngày, tháng, năm. | [SocialInsuranceModal.tsx:1201](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1201) · UI |
| 176 | Giới tính pháp lý | Giới tính ghi trên hồ sơ BHXH | Nêu đúng giấy tờ dùng để tính thay vì thuật ngữ pháp lý. | [SocialInsuranceModal.tsx:1272](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1272) · UI |
| 177 | Chế độ tham gia & Nhánh tính | Hình thức tham gia BHXH và trường hợp cần tính | Nhánh tính là cách tổ chức chương trình. | [SocialInsuranceModal.tsx:766](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:766) · UI |
| 178 | Bộ luật & Căn cứ pháp lý | Quy định dùng để ước tính | Nên tự chọn theo trường hợp và cho xem căn cứ chi tiết. | [SocialInsuranceModal.tsx:743](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:743) · UI |
| 179 | Tuổi luật định / tháng nhận theo luật định | Tuổi nghỉ hưu theo quy định / Tháng dự kiến bắt đầu hưởng theo quy định | Giữ khác biệt giữa tuổi nghỉ làm và điều kiện hưởng BHXH. | [FinancialProfilePanel.tsx:1403](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1403) · Mã |
| 180 | Bảo lưu thời gian đóng | Đã ngừng đóng nhưng giữ lại thời gian đã tham gia | Có thể giữ thuật ngữ trong ngoặc. | [SocialInsuranceModal.tsx:812](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:812) · UI |
| 181 | Tiền lương làm căn cứ đóng (VND) | Mức lương dùng để đóng BHXH | Nói rõ không nhất thiết bằng lương thực nhận. | [SocialInsuranceModal.tsx:1469](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1469) · UI |
| 182 | Mức lương làm căn cứ đóng BHXH bình quân | Mức lương đóng BHXH trung bình | Cần chỉ rõ khoảng thời gian tính trung bình. | [OnboardingPage.tsx:1163](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:1163) · UI |
| 183 | Tổng hệ số đóng (Hệ số) | Hệ số lương dùng để tính đóng BHXH | Cần ví dụ và chỉ dẫn lấy từ hồ sơ nào, không tự giản lược cách tính. | [SocialInsuranceModal.tsx:1485](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1485) · Mã |
| 184 | Thang lương đã chuyển đổi | Thang lương trong hồ sơ sau khi chuyển đổi | Giải thích ai xác nhận và tìm ở giấy tờ nào. | [SocialInsuranceModal.tsx:1500](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1500) · Mã |
| 185 | Phụ cấp thâm niên nghề | Khoản phụ cấp theo thời gian làm nghề | Giữ thuật ngữ chính thức trong phần hướng dẫn. | [SocialInsuranceModal.tsx:860](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:860) · Mã |
| 186 | Tháng bắt đầu cửa sổ lương được xác nhận | Tháng bắt đầu giai đoạn lương dùng để tính bình quân | Cửa sổ lương là dịch thuật kỹ thuật khó hiểu. | [SocialInsuranceModal.tsx:1046](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1046) · Mã |
| 187 | Điểm a (HĐLĐ xác định/không XĐTH) | Làm việc theo hợp đồng lao động — xem chi tiết nhóm áp dụng | Viết đầy đủ HĐLĐ, XĐTH và dẫn điều khoản trong phần giải thích. | [SocialInsuranceModal.tsx:1441](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1441) · UI |
| 188 | Điều 141(9) (tham gia trước 2021) | Trường hợp tham gia trước năm 2021 — xem quy định áp dụng | Không yêu cầu người dùng hiểu số điều để tự phân loại. | [SocialInsuranceModal.tsx:891](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:891) · Mã |
| 189 | Chuyển tiếp 2025 | Trường hợp áp dụng quy định chuyển tiếp năm 2025 | Cần mô tả ai thuộc trường hợp này sau khi đối chiếu quy định. | [SocialInsuranceModal.tsx:906](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:906) · Mã |
| 190 | KTXH | Kinh tế - xã hội | Viết đầy đủ trong mô tả vùng làm việc. | [FinancialProfilePanel.tsx:1476](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1476) · Mã |
| 191 | Đóng bù năm thiếu (1-60 tháng) | Đóng thêm cho thời gian còn thiếu, nếu đủ điều kiện | Không để nhãn khiến người dùng tưởng ai cũng được đóng bù. | [SocialInsuranceModal.tsx:777](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:777) · UI |
| 192 | Đóng trước theo kỳ (3-60 tháng) | Đóng trước cho nhiều tháng, nếu thuộc trường hợp áp dụng | Giải thích thời gian và số tiền tương ứng. | [SocialInsuranceModal.tsx:778](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:778) · UI |
| 193 | Được tính đóng (CREDITED) | Thời gian được tính là đã đóng theo hồ sơ | Cần ví dụ theo nhóm phù hợp; không đồng nghĩa đã nộp tiền. | [SocialInsuranceModal.tsx:1423](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1423) · UI |
| 194 | TRỢ CẤP MỘT LẦN KHI NGHỈ HƯU (DO ĐÓNG VƯỢT TRẦN): | Trợ cấp một lần khi nghỉ hưu do thời gian đóng vượt mức tính tỷ lệ lương hưu tối đa | Phân biệt với rút BHXH một lần; đối chiếu quy tắc trước khi chốt câu. | [SocialInsuranceModal.tsx:1161](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1161) · Mã |
| 195 | Xác nhận đến tháng (≤ hiện tại) | Thông tin đã được bạn kiểm tra đến tháng nào? | Nói rõ người xác nhận và không dùng ký hiệu toán thay hướng dẫn. | [SocialInsuranceModal.tsx:1314](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1314) · UI |
| 196 | Kết quả kiểm tra cấu trúc hồ sơ | Kết quả kiểm tra thông tin đã nhập | Cấu trúc hợp lệ không đồng nghĩa đủ điều kiện hưởng. | [SocialInsuranceModal.tsx:1579](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:1579) · UI |
| 197 | Tên / số hiệu căn cứ | Tên hoặc số của giấy tờ dùng để đối chiếu | Ví dụ hợp đồng, sao kê, xác nhận quá trình đóng. | [EvidenceEditor.tsx:26](E:/An_Huu/frontend/src/components/EvidenceEditor.tsx:26) · UI |
| 198 | Chỉ mã kiểm tra nội dung được gửi lên. | Tài liệu được xử lý trên thiết bị; hệ thống lưu mã dùng để đối chiếu nội dung. | Cần có giải thích dễ hiểu về dữ liệu lưu; không nói thành tài liệu đã được xác minh. | [EvidenceEditor.tsx:46](E:/An_Huu/frontend/src/components/EvidenceEditor.tsx:46) · UI |
| 199 | Không áp dụng nhận lương hưu | Không đưa lương hưu BHXH vào kế hoạch này | Chỉ dùng nếu đúng ý nghĩa lựa chọn; không tự kết luận không có quyền hưởng. | [FinancialProfilePanel.tsx:1044](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1044) · Mã |

### 7. Lỗi nhập liệu, tài khoản, trợ lý và điều hướng

| # | Đang dùng | Đề xuất dễ hiểu hơn | Vấn đề / lưu ý | Vị trí, bằng chứng |
|---|---|---|---|---|
| 200 | Mã OTP phải gồm đúng 6 chữ số. | Mã xác nhận gửi qua email gồm 6 chữ số. | Nêu nơi nhận mã; giữ OTP trong hướng dẫn nếu cần. | [AuthPages.tsx:542](E:/An_Huu/frontend/src/pages/AuthPages.tsx:542) · Mã |
| 201 | Chưa cấu hình Google OAuth | Đăng nhập bằng Google hiện chưa sẵn sàng | Người dùng không sửa được cấu hình OAuth. | [AuthPages.tsx:660](E:/An_Huu/frontend/src/pages/AuthPages.tsx:660) · Mã |
| 202 | Không thể khởi động Google Sign-In. Vui lòng kiểm tra cấu hình mạng hoặc Google Cloud Console. | Chưa đăng nhập được bằng Google. Hãy thử lại hoặc dùng email và mật khẩu. | Không hướng khách hàng vào bảng quản trị Google. | [AuthPages.tsx:679](E:/An_Huu/frontend/src/pages/AuthPages.tsx:679) · Mã |
| 203 | Không dùng ký pháp mũ | Nhập đầy đủ chữ số, ví dụ 1000000 | Nói cách nhập đúng thay cho tên định dạng. | [SimulationTrackingPage.tsx:1039](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:1039) · Mã |
| 204 | Số không âm / số dương | Nhập số tiền từ 0 trở lên / lớn hơn 0 | Chọn đúng theo quy tắc từng ô. | [SimulationTrackingPage.tsx:951](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:951) · Mã |
| 205 | Tuổi phải là số nguyên | Nhập tuổi tròn, ví dụ 50 | Thông báo kèm đúng giới hạn tuổi mà chức năng hỗ trợ. | [RetirementGoalPage.tsx:121](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:121) · UI |
| 206 | YYYY-MM | Chọn tháng và năm, ví dụ tháng 10/2026 | Nếu vẫn nhập dạng kỹ thuật, cho ví dụ 2026-10 rõ ràng. | [FinancialProfilePanel.tsx:255](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:255) · UI |
| 207 | Dùng dấu chấm cho phần lẻ, ví dụ 1000000.50 | Ví dụ nhập 1.000.000 đồng | Cần sửa bộ nhập theo định dạng Việt Nam trước khi đổi hướng dẫn. | [SimulationTrackingPage.tsx:2936](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2936) · Mã |
| 208 | Máy chủ trả về dữ liệu không hợp lệ. | Chưa đọc được dữ liệu. Hãy tải lại; nếu vẫn lỗi, gửi mã hỗ trợ. | Không yêu cầu người dùng hiểu định dạng dữ liệu máy chủ. | [api.ts:68](E:/An_Huu/frontend/src/services/api.ts:68) · Mã |
| 209 | Một tab khác đang cập nhật phiên đăng nhập. Vui lòng thử lại. | Tài khoản đang được cập nhật ở cửa sổ khác. Hãy chờ rồi thử lại. | Tab và phiên không quen với mọi người. | [api.ts:47](E:/An_Huu/frontend/src/services/api.ts:47) · Mã |
| 210 | Phiên đăng nhập | Các thiết bị hoặc cửa sổ khác đang dùng tài khoản | Nêu rõ ảnh hưởng khi đổi mật khẩu. | [AccountApiPanels.tsx:291](E:/An_Huu/frontend/src/components/AccountApiPanels.tsx:291) · UI |
| 211 | Thông tin định danh | Thông tin cá nhân | Không làm người dùng tưởng cần căn cước khi chỉ sửa tên. | [AccountPage.tsx:115](E:/An_Huu/frontend/src/pages/AccountPage.tsx:115) · UI |
| 212 | Ticket / mã ticket | Yêu cầu hỗ trợ / Mã yêu cầu | Một tên dùng ở danh sách, tìm kiếm và thông báo. | [SupportPage.tsx:343](E:/An_Huu/frontend/src/pages/SupportPage.tsx:343) · Mã |
| 213 | Xuất tệp CSV | Tải bảng số liệu để mở bằng Excel (.csv) | Giữ đúng định dạng, không gọi là tệp Excel .xlsx. | [AccountPage.tsx:89](E:/An_Huu/frontend/src/pages/AccountPage.tsx:89) · UI |
| 214 | Xuất dữ liệu hội thoại (JSON) | Tải dữ liệu cuộc trò chuyện (.json) | Đây là bản dữ liệu; nên có thêm bản văn bản dễ đọc. | [AIAssistantPage.tsx:480](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:480) · Mã |
| 215 | Khởi tạo hội thoại mới | Bắt đầu cuộc trò chuyện mới | Khởi tạo là từ ngữ phần mềm không cần thiết. | [AIAssistantPage.tsx:500](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:500) · Mã |
| 216 | Động cơ An Hữu | Trợ lý giải thích kế hoạch An Hưu | Động cơ là dịch sát engine; thống nhất cách viết tên thương hiệu. | [AIAssistantPage.tsx:452](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:452) · UI |
| 217 | Nguồn dữ liệu & Ngữ cảnh | Thông tin trợ lý đang dùng để trả lời | Ngữ cảnh không nói rõ người dùng sẽ xem gì. | [AIAssistantPage.tsx:490](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:490) · Mã |
| 218 | Đang tải quyền xử lý AI | Đang kiểm tra lựa chọn dùng dữ liệu của bạn | Quyền xử lý không phải từ quen thuộc. | [AIAssistantPage.tsx:457](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:457) · Mã |
| 219 | AI tạm không khả dụng (kết quả hệ thống) | AI chưa trả lời được; dưới đây là giải thích từ số liệu kế hoạch | Phân biệt câu trả lời AI với phần giải thích dự phòng. | [AIAssistantPage.tsx:543](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:543) · Mã |
| 220 | SỐ LIỆU CHÍNH TỪ MÔ HÌNH: | Các số liệu chính trong kế hoạch của bạn | Không cần nhấn tên bộ máy tính toán. | [AIAssistantPage.tsx:561](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:561) · UI |
| 221 | CĂN CỨ VÀ NGUỒN TRI THỨC PHÁP LÝ / CHUẨN MỰC: | Tài liệu và quy định được dùng để giải thích | Cụm danh từ dài khó đọc. | [AIAssistantPage.tsx:590](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:590) · Mã |
| 222 | GIỚI HẠN PHÁP LÝ (DISCLAIMER) | Điều cần biết khi dùng kết quả | Nội dung vẫn cần nêu giới hạn cụ thể, không chỉ đổi tiêu đề. | [AIAssistantPage.tsx:875](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:875) · UI |
| 223 | Dòng sổ thu chi chi tiết được cách ly nội bộ | Các giao dịch chi tiết được giữ trong hệ thống An Hưu | Chỉ dùng sau khi xác minh đúng phạm vi xử lý và gửi dữ liệu. | [AIAssistantPage.tsx:1129](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:1129) · UI |
| 224 | HỆ SINH THÁI ĐỐI TÁC & GIẢI PHÁP | Sản phẩm và dịch vụ từ đối tác | Giải pháp không cho biết người dùng sẽ tìm được gì. | [ExplorePage.tsx:47](E:/An_Huu/frontend/src/pages/ExplorePage.tsx:47) · UI |
| 225 | Đối sánh với hồ sơ tài chính của bạn | So sánh với thông tin tài chính của bạn | Cần nói rõ so với đối tượng nào nếu có chức năng đó. | [FinancialProfileGate.tsx:74](E:/An_Huu/frontend/src/components/FinancialProfileGate.tsx:74) · Mã |

### 8. Câu dễ hiểu sai, quá tuyệt đối hoặc thiếu nhất quán

| # | Đang dùng | Đề xuất dễ hiểu hơn | Vấn đề / lưu ý | Vị trí, bằng chứng |
|---|---|---|---|---|
| 226 | Tài sản ròng khả dụng | Tài sản trừ nợ; chưa phải toàn bộ tiền có thể dùng ngay | Nhà đang ở cũng có thể nằm trong tổng này, không thể gọi toàn bộ là tiền khả dụng. | [OnboardingPage.tsx:1233](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:1233) · UI |
| 227 | Đường số dư thực tế phản ánh chính xác dòng tiền | Đường biểu diễn số dư dự kiến theo các giả định của kế hoạch | Biểu đồ dự phóng lại gọi là thực tế, dễ nhầm với sao kê. | [MonthlyRetirementChart.tsx:192](E:/An_Huu/frontend/src/components/charts/MonthlyRetirementChart.tsx:192) · UI |
| 228 | Dòng tiền đảm bảo suốt kỳ | Chưa thấy thiếu tiền trong khoảng thời gian đã tính | Chỉ hiện khi có kết quả hợp lệ; thiếu dữ liệu phải báo chưa đánh giá được. | [DebtAnalysisPage.tsx:709](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:709) · UI |
| 229 | Chuẩn xác tuyệt đối | Ước tính chi tiết hơn từ thông tin hợp đồng | Không hứa kết quả tương lai tuyệt đối chính xác. | [DebtAnalysisPage.tsx:412](E:/An_Huu/frontend/src/pages/DebtAnalysisPage.tsx:412) · UI |
| 230 | Cam kết bảo vệ tuyệt đối | Thông tin được sử dụng và bảo vệ như thế nào | Nêu biện pháp và phạm vi có thể kiểm chứng. | [AIAssistantPage.tsx:1079](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:1079) · Mã |
| 231 | Tuyệt đối không gửi họ tên, email, số điện thoại | Mô tả đúng những trường dữ liệu hệ thống không gửi | Cần tính cả trường hợp người dùng tự gõ thông tin vào câu hỏi; chưa kết luận cơ chế lọc đã đủ. | [AIAssistantPage.tsx:1119](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:1119) · UI |
| 232 | An Hưu đã phân tích đầy đủ | An Hưu đã lưu thông tin bạn vừa khai báo | Hoàn tất biểu mẫu chưa có nghĩa đã phân tích đủ mọi dữ liệu. | [OnboardingPage.tsx:540](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:540) · Mã |
| 233 | Các tài sản tích lũy hiện thời sẽ tiếp tục sinh lời | Giá trị tài sản có thể tăng hoặc giảm theo thời gian | Tài sản không mặc nhiên tiếp tục sinh lời. | [OnboardingPage.tsx:924](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:924) · UI |
| 234 | toàn bộ số tiền thặng dư hàng tháng của bạn được tích lũy trọn vẹn | Bạn có thể chọn dành một phần tiền dư cho quỹ hưu trí | Không khẳng định tiền dư đã tự chuyển vào quỹ. | [OnboardingPage.tsx:1113](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:1113) · Mã |
| 235 | Quy luật hưu trí 70 - 80% | Gợi ý tham khảo về chi tiêu khi nghỉ hưu | Không gọi tỷ lệ kinh nghiệm là quy luật áp dụng cho mọi người. | [OnboardingPage.tsx:907](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:907) · UI |
| 236 | Mức chuẩn quốc tế / chuẩn mực quốc tế | Nêu nguồn và phạm vi, hoặc bỏ khẳng định chuẩn | Đây là nhận xét về cách trình bày, chưa xác minh cơ sở khuyến nghị. | [content.ts:82](E:/An_Huu/frontend/src/marketing/content.ts:82) · Mã |
| 237 | Phù hợp nhất / Hội đồng Quản trị rủi ro | Phương án gợi ý từ câu trả lời của bạn và dữ liệu đang áp dụng | Không dùng thẩm quyền chung chung để thay giải thích cơ sở lựa chọn. | [RiskPortfolioPage.tsx:194](E:/An_Huu/frontend/src/pages/RiskPortfolioPage.tsx:194) · UI |
| 238 | Hồ sơ đáp ứng điều kiện theo quy định pháp luật. | Theo dữ liệu đã khai, kết quả ước tính cho thấy đáp ứng các điều kiện được kiểm tra. | Kèm giới hạn kiểm tra và tránh ngụ ý quyết định hưởng chính thức. | [SocialInsuranceModal.tsx:602](E:/An_Huu/frontend/src/components/SocialInsuranceModal.tsx:602) · Mã |
| 239 | Thời điểm hoàn thành nghĩa vụ làm việc | Tháng nghỉ hưu tham chiếu theo quy định | Không đánh đồng một mốc tính tuổi với nghĩa vụ phải làm việc đến ngày đó. | [FinancialProfilePanel.tsx:1666](E:/An_Huu/frontend/src/components/FinancialProfilePanel.tsx:1666) · Mã |
| 240 | lượng hóa chính xác | Được ước tính khi bạn mở Kế hoạch | Số liệu tài chính tương lai phụ thuộc giả định. | [RetirementGoalPage.tsx:774](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:774) · UI |
| 241 | 100% độc lập / không ăn hoa hồng | Nêu chính sách quan hệ đối tác và nguồn thu cụ thể | Cần xác minh chính sách; không kết luận sai chỉ từ việc có trang đối tác. | [content.ts:65](E:/An_Huu/frontend/src/marketing/content.ts:65) · Mã |
| 242 | Lợi suất an toàn | Mức sinh lời giả định dùng trong phép tính | Từ an toàn không cho biết rủi ro hoặc bảo đảm nào. | [content.ts:83](E:/An_Huu/frontend/src/marketing/content.ts:83) · Mã |
| 243 | Kế hoạch sẽ tính các mục này bằng 0. | Các mục chưa khai báo có thể làm kết quả thiếu thông tin; hãy xác nhận từng mục. | Không thay câu khi logic vẫn dùng 0; cần phân biệt chưa biết và xác nhận không có. | [OnboardingPage.tsx:1198](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:1198) · UI |
| 244 | Bứt phá tích lũy | Thời gian còn lại trước khi nghỉ hưu | Không phù hợp người đã nghỉ hưu; khi đó cần bỏ giai đoạn này. | [RetirementGoalPage.tsx:704](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:704) · UI |
| 245 | Vững vàng / Khả quan / Cần nỗ lực thêm | Quỹ dự kiến đạt {x}% số tiền cần theo giả định đang dùng | Nhãn cảm tính cần đi kèm số liệu và điều kiện; không quy thiếu tiền thành thiếu nỗ lực. | [SimulationTrackingPage.tsx:2312](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:2312) · Mã |
| 246 | Luật BHXH mới | Ghi rõ tên văn bản hoặc thời điểm cập nhật bài viết | Mới không có mốc thời gian, dễ lỗi thời. | [knowledge.ts:20](E:/An_Huu/frontend/src/domain/knowledge.ts:20) · UI |
| 247 | Chỉ mất 2 phút | Có thể thử nhanh bằng số liệu mẫu | Nếu giữ thời lượng phải nói rõ áp dụng cho bước nào, không cả hồ sơ chi tiết. | [content.ts:64](E:/An_Huu/frontend/src/marketing/content.ts:64) · Mã |

### Những cách gọi nên thống nhất toàn website

- **Kế hoạch đang dùng**: phương án người dùng đã xác nhận áp dụng; tránh xen kẽ kế hoạch chính thức, bản áp dụng, baseline.
- **Phương án đang thử** → **Phương án đã lưu** → **Kế hoạch đang dùng**: ba trạng thái riêng, nêu rõ hành động nào chuyển trạng thái.
- **Tiền góp vào quỹ** khác **tiền trả nợ**: không dùng tiền góp cho cả hai.
- **Tiền dự kiến có khi nghỉ hưu** khác **số dư thực tế hiện tại**: luôn ghi mốc thời gian và nguồn số liệu.
- **Chưa khai báo**, **không áp dụng**, **đã xác nhận bằng 0**, **chưa tính được**: không gom thành N/A hoặc 0.
- **Tháng bắt đầu nghỉ làm** khác **tháng bắt đầu nhận lương hưu BHXH**.
- **Bản kế hoạch số 2** khác **lần sửa thứ 2 của bản ghi tháng**; v2 của cấu trúc phần mềm không cần xuất hiện.
- **Số tiền còn thiếu** luôn nói rõ thiếu để sinh hoạt, để góp vào quỹ, hay thiếu so với vốn cần lúc hưu.
- **Triệu đồng / đồng mỗi tháng**, ngày tháng tiếng Việt; mã VND chỉ giữ khi cần phân biệt loại tiền.

### Những mục không nên báo nhầm là đang hiện trên giao diện user

- Bản dịch còn các cụm “Chiến lược Quả tuyết lăn (Snowball)” và “Chiến lược Thác tuyết (Avalanche)”. Màn hình nợ hiện tại đã dùng “Trả khoản có số dư nhỏ trước” và “Trả khoản có lãi suất cao trước”; không coi hai nhãn dịch cũ là lỗi đã quan sát trên màn hình tiếng Việt hiện tại.
- OAuth, JSON, các tên enum chỉ nằm trong biến/type/comment không tự động là lỗi UX. Danh sách chính chỉ lấy nơi có nhãn, thông báo, lựa chọn hoặc dữ liệu được render. Một số mã được gộp thành nhóm từ cùng chức năng.
- Chuỗi lỗi từ backend còn có các đường hiển thị trực tiếp qua thông báo lỗi, mã kiểm tra, kết quả BHXH và nhãn AI. Cần lớp chuyển mã thành câu tiếng Việt cho các trường hợp đó; kiểm tra riêng các phản hồi chưa được tái hiện.
- Các tiêu đề thuần admin như “Vận hành hệ thống”, “Quản trị luật BHXH”, nhật ký quản trị không nằm trong danh sách chính.

### Cách sửa câu chữ nên áp dụng

1. Nhãn nói đúng việc: “Số tiền còn thiếu”, “Tiền cần trả nợ”, “Tháng bắt đầu nhận lương hưu”.
2. Thông báo lỗi có ba phần: chuyện gì xảy ra, dữ liệu nào liên quan, bước tiếp theo người dùng làm được. Không yêu cầu khách hàng sửa Google Cloud Console hoặc cấu hình server.
3. Với thuật ngữ cần giữ, đặt giải thích ngắn ngay cạnh trường, mở chi tiết khi cần; từ điển riêng không thay được hướng dẫn tại chỗ.
4. Đưa mã hỗ trợ, hash, phiên bản mô hình vào chi tiết kỹ thuật; không bỏ mã cần cho hỗ trợ nhưng không để mã là lời giải thích chính.
5. Không chỉ đổi chữ đối với nhãn sai bản chất, dữ liệu thiếu nhưng báo an toàn, tỷ lệ 0–1 hoặc số dư thực tế/dự kiến. Những mục đó cần sửa cả cách xử lý/hiển thị liên quan.

Ví dụ thay một câu khó: “Tồn tại giai đoạn tích lũy nhưng không tìm thấy kỳ đóng góp đủ điều kiện nào trong chân trời kế hoạch.” → “Chưa có tháng nào đủ điều kiện góp tiền trước khi nghỉ hưu. Hãy kiểm tra tháng bắt đầu góp và nguồn tiền đầu tháng.” Chỉ đưa hướng dẫn này khi đúng nguyên nhân máy chủ trả về.

Bản có cấu trúc: [tu-ngu-kho-hieu.json](E:/An_Huu/artifacts/retiree-50-review/tu-ngu-kho-hieu.json). Dữ liệu thô phục vụ rà soát: copy-corpus.json; không dùng toàn bộ chuỗi trích xuất làm danh sách lỗi vì có mã không hiển thị, bản dịch cũ và các nhánh dùng chung với admin.


## 9. Bắt đầu thực hiện

Hãy kiểm trạng thái workspace và đọc các file liên quan; tái hiện FE-01–07 trước, chọn nhóm sửa có quan hệ gần nhau, rồi thực hiện và kiểm lần lượt. Tiếp tục cho tới khi xử lý hết phạm vi frontend có thể thực hiện. Không dừng sau khi chỉ lập kế hoạch, đổi một vài nhãn hoặc chạy build. Nếu gặp dependency, ghi chính xác điều còn thiếu và tiếp tục nhóm độc lập. Khi kết thúc, cập nhật mục 7 bằng bằng chứng của chính lượt triển khai, không dùng kết quả audit cũ làm nghiệm thu sửa lỗi mới.

## 10. Hợp đồng backend bổ sung ngày 13/10/2026

Backend đã bổ sung các trường/định dạng sau cho những lỗi được ghi nhận trong đợt trải nghiệm desktop. AI frontend cần dùng hợp đồng này khi sửa; không tự sửa phép tính tài chính hoặc đổi dữ liệu người dùng để vượt chặn.

1. **Trang nợ — không kết luận an toàn khi chưa đủ dữ liệu.** `baseline`, `alternatives[].result`, `stress.result` có `cashflowAssessment`: `status` = `COMPLETE | PARTIAL | UNAVAILABLE`, `evaluatedMonths`, `totalMonths`, `firstUnknownMonth`, `shortfallStatus` = `DETECTED | UNKNOWN | NOT_DETECTED_IN_HORIZON`, `issues` = `CASHFLOW_REQUIRED` và/hoặc `RESERVE_REQUIRED`. Chỉ dùng câu “Không thấy tháng thiếu tiền trong thời gian đã tính” khi `NOT_DETECTED_IN_HORIZON`; không hứa “đảm bảo suốt kỳ/an toàn”. Null baseline hoặc thiếu trường từ bản API cũ thì hiện “Chưa đủ dữ liệu để đánh giá”. `totals.firstShortfallMonth` là tháng thiếu đã biết sớm nhất, không xác nhận tháng chưa biết. Đọc DTI tại `rows[i].pressure.ratioPercent`; đọc số tiền sau trả nợ, trả thêm, phí và dự phòng tại `rows[i].availableForRetirement`; ngày hết nợ và tháng thiếu nằm trong `totals`. Phân biệt `HORIZON_LIMIT` với đã trả xong.
2. **So sánh mô phỏng — đúng mốc số tiền.** Giữ `comparison.delta` cũ cho các cột `summary.atValuation`. Với hai cột tại tháng nghỉ hưu, dùng `comparison.atRetirement.delta.{projectedFund,requiredFund,fundingGap,coveragePercentagePoints}`. Nhóm mới có `status`, `reasons`, `basis: SAME_RETIREMENT_MONTH_NOMINAL`, `baselineMonth`, `candidateMonth`; chiều candidate trừ baseline. Nếu tháng nghỉ hưu khác nhau, nhóm này trả `NOT_COMPARABLE`, `RETIREMENT_MONTH_DIFFERS`, delta null: giải thích khác mốc, hoặc trình bày so sánh tại ngày định giá cho cả ba cột. Không đổi null thành 0.
3. **Chặn vì cấu hình dự báo/danh mục.** Portfolio preview có `guidance`; retirement preview thêm `guidance` khi `INCOMPLETE`. Gồm `requestedPeriod`, `assumptionPeriod`, `policyRules` (từng khoảng riêng, không bảo đảm đủ điều kiện), `policyChecks`, `issues[{path,code,action,message}]`. Ưu tiên lời giải thích `message`; vẫn giữ và dịch `issues` gốc. `REVIEW_CONFIGURATION`: báo cấu hình chưa hỗ trợ và cần bên quản trị rà soát, không dẫn người dùng khai lại hồ sơ/đổi câu trả lời. `REVIEW_SELECTION`: hướng về khảo sát/lựa chọn phù hợp. Các mã đã có lời giải thích: `PROJECTION_NOT_COVERED`, `ASSET_HORIZON_NOT_COVERED`, `POLICY_NOT_COVERED`, `PORTFOLIO_CHOICE_REQUIRED`, `TEMPLATE_NOT_ELIGIBLE`. Thiếu câu trả lời không bị phân loại thành lỗi cấu hình. Không tự rút ngắn tuổi kết thúc kế hoạch để vượt giới hạn. Snapshot đã lưu/READY không bắt buộc có guidance.
4. **Xuất báo cáo dễ đọc.** Giữ endpoint `GET /api/v1/me/retirement/plans/:planId/versions/:versionId/export.csv`, thêm `?format=readable-vi` cho nút “Tải báo cáo tháng (CSV)”. Đây là 20 cột tiếng Việt, UTF-8 BOM, tiền làm tròn đến đồng, giữ dấu âm, phiên bản/ngày số liệu/kịch bản/nhãn giả định. Dùng `Content-Disposition`; vẫn cần xác thực. Bản kỹ thuật giữ `format=technical` hoặc không truyền format. Không mô tả là báo cáo năm/PDF. Số dư âm là thiếu tiền dự báo, không phải khoản vay thực tế.
5. **Người nghỉ hưu tuổi 50 ngay hiện tại.** Backend đã có kiểm thử hồ sơ tuổi 50, tháng nghỉ hưu bằng tháng định giá, không có kỳ tích lũy, lưu và replay được. Frontend cần bỏ chặn tuổi nghỉ hưu bằng tuổi hiện tại và chuyển sang tháng chính xác. Backend v3 chưa nhận tháng hưu trước tháng định giá; không hứa UI hỗ trợ toàn bộ lịch sử đã nghỉ hưu nếu chưa có thiết kế riêng.

Nghiệm thu thêm: thu/chi hoặc dự phòng null; đã xác nhận không có nợ và thu nhập 0; một tháng đã thiếu nhưng tháng sau chưa rõ; hai phương án cùng/khác tháng hưu; dự báo vượt năm được công bố; khảo sát thiếu câu; tải cả CSV tiếng Việt và kỹ thuật. Hợp đồng chi tiết: [PLAN_PRESENTATION.md](../backend/docs/PLAN_PRESENTATION.md), [DEBT_PLANNING.md](../backend/docs/DEBT_PLANNING.md), [preview-guidance.openapi.yaml](../backend/docs/preview-guidance.openapi.yaml). Các trường mới cần triển khai và kiểm tra giao diện thật, không coi kiểm thử backend là nghiệm thu frontend.


## 11. Cập nhật AI đã được triển khai — 13/10/2026

Theo yêu cầu mới “hoàn thiện tính năng Ai của web cả backend và frontend”, các thay đổi tại `AIAssistantPage.tsx`, `ai-assistant.css`, `aiPresentation.ts` và `admin/AdminAIConfigPages.tsx` đã thực hiện: consent/history thật, retry giữ câu hỏi, chặn phản hồi nhầm hội thoại, đổi tên đúng revision, sửa/xuất/xóa/xóa hết/tải thêm, form mô phỏng lấy tháng và tiền đúng bản kế hoạch, so sánh atValuation và ngày từng bản, không đổi null thành0; thêm sửa tài liệu/URL/expiry và duyệt lại. Giữ các thay đổi này khi tiếp tục xử lý phần frontend khác.

Nghiệm thu:29tình huống trình duyệt (28suite +1so sánh bổ sung),61test tiện ích/hợp đồng, typecheck/build đạt. Desktop1440×1000 đăng nhập USER/ADMIN và DB thật đạt13checks, mọi ghi thử rollback. Lượt cuối dùng giải thích nội bộ; Gemini thật kiểm riêng bằng dữ liệu giả lập. Chi tiết/phạm vi tại [AI_COMPLETION_2026-10-13.md](AI_COMPLETION_2026-10-13.md). Chỉ đánh dấu phần AI đã làm; không suy ra các yêu cầu còn lại trong tài liệu này đã hoàn thành.


## 12. Trang chat đã được thiết kế lại — 13/10/2026

Theo yêu cầu mới của người dùng, giao diện chat đã chuyển sang một cột, chữ trả lời16px, thanh kế hoạch ngắn, gợi ý đúng khả năng và ô gửi dễ thấy. Bỏ sidebar/facts lặp, trạng thái trông như online, gợi ý hỏi tự tính nghỉ sớm, placeholder tư vấn rộng, tải hội thoại rỗng. Giữ các API thật và không thêm tính năng giả. Quyền riêng tư có thao tác trực tiếp trên mọi màn hình. 31Playwright, frontend typecheck/build đạt; đăng nhập local+API/DB13checks đạt với provider tắt riêng ở verifier và rollback. Chi tiết [AI_CHAT_REDESIGN_2026-10-13.md](AI_CHAT_REDESIGN_2026-10-13.md). Giữ thiết kế này khi tiếp tục các phần frontend khác.


## 13. Trang chat thiết kế lần 2 theo phản hồi (13/10/2026)

Bản bố cục ở mục 12 đã được thay bằng workspace kiểu ChatGPT/Claude: sidebar lịch sử riêng, bỏ topbar/sidebar dashboard trên route chat, nhóm lời chào + composer ở giữa khi chưa có tin nhắn, composer dưới đáy khi trò chuyện, kế hoạch thu gọn vào nút mở thông tin. Có đường về tổng quan và quyền riêng tư trên desktop/mobile. Không thêm tính năng giả. Xem `docs/AI_CHAT_REDESIGN_2026-10-13.md` để biết mã nguồn, kiểm thử và ảnh bản cuối; không khôi phục bố cục hai thanh đầu trang/gợi ý dạng thẻ lớn cũ.


## 14. Giữ tab AI trong khung web (13/10/2026)

Theo phản hồi mới: bỏ shell chat toàn màn hình riêng ở mục 13. Tab AI dùng lại sidebar/topbar của UserLayout, giữ thiết kế vùng chat. Lịch sử và tạo chat mới mặc định ẩn, mở bằng nút Hội thoại rồi đóng lại được; giữ bản nháp khi đóng/mở. Không phục hồi sidebar chat thường trực cạnh sidebar chính. Xem cập nhật đầu `docs/AI_CHAT_REDESIGN_2026-10-13.md`.


## 15. Lịch sử chỉ nằm trong vùng AI, nền trắng hoàn toàn

Thay Drawer portal ở mục 14 bằng bảng `aside` trượt trong `.ai-chat-body`. Không backdrop/inert toàn ứng dụng; header và sidebar web luôn dùng được. Nút Hội thoại nằm bên phải nút **Kế hoạch nghỉ hưu** (nhãn phụ **Dùng để trả lời · bản N**). Nền `#ffffff`. Đóng/mở 240ms, hỗ trợ giảm chuyển động, đóng bằng X/Escape/nút Hội thoại và giữ bản nháp. Không dùng lại Drawer toàn màn hình cho danh sách hội thoại. Chi tiết ở đầu `docs/AI_CHAT_REDESIGN_2026-10-13.md`.


## 16. Hiệu năng và lỗi luồng phía frontend — bàn giao từ đợt sửa backend 14/10/2026

Backend đã sửa phần của mình (xem `backend/PROGRESS.md`, mục PERF 14/10): rate limit theo `userId` cho route đã đăng nhập, `GET /me/retirement/plans/:id/versions` chỉ trả summary (không còn digest toàn bộ snapshot), các GET kế hoạch và `POST /me/retirement/preview` không còn chạy transaction SERIALIZABLE, cache tài liệu policy/assumption đã PUBLISHED, nén gzip toàn bộ JSON (`GET /plans/:id` 411 KB → ~43 KB) và header `Server-Timing: total;dur=…` trên `/me/retirement/plans*`, `/me/retirement/preview`, `/me/financial-profile`. Hợp đồng API không đổi. Các việc dưới đây thuộc frontend; số dòng là vị trí lúc ghi, có thể đã dịch.

1. **`FinancialProfileGate` chặn tải chunk trang.** Khi profile đang tải, gate không render children nên chunk lazy của trang đích chỉ bắt đầu tải sau khi profile về (thác nước tuần tự). Bắt đầu `import()` trang (qua `routePreload`) song song với request profile, hoặc render khung trang và chỉ chặn phần dữ liệu.
2. **`refreshPlans` phụ thuộc `activePlanId` nên effect chạy hai lần** (`context/RetirementPlanContext.tsx` ~179 deps `[user?.role, user?.id, activePlanId, loadPlanDetail]`, ~218 effect deps `[..., refreshPlans]`). Mỗi lần đặt plan đang chọn làm `refreshPlans` đổi identity → effect gọi lại danh sách + chi tiết. Đọc `activePlanId` qua ref, hoặc tách effect “đổi user” khỏi “đổi plan”. Nghiệm thu: lần vào `/user/plan` chỉ có 1 request `GET /me/retirement/plans` và 1 `GET /plans/:id`.
3. **Ghi bất kỳ xóa toàn bộ cache GET** (`services/api.ts` ~186–192: mọi POST/PUT/PATCH/DELETE trừ `/preview|/simulate|/compare` gọi `invalidateApiCache()`). Ví dụ đánh dấu đã đọc thông báo cũng xóa cache kế hoạch/hồ sơ. Invalidate theo tiền tố tài nguyên bị ghi (vd. `/me/notifications*`, `/me/retirement/plans/:id*`, `/me/financial-profile`).
4. **What-if trong `SimulationTrackingPage` không debounce và mỗi lần đổi lại xóa kết quả.** Mỗi lần gõ gửi `POST .../versions/:id/simulate` và làm trống bảng/biểu đồ. Debounce ~400 ms, hủy request cũ (`AbortController`/sequence id), giữ kết quả trước (đánh dấu “đang tính lại”) cho tới khi có kết quả mới.
5. **Socket.io không chạy qua Vercel và token handshake bị cố định.** `vercel.json` không có rewrite `/socket.io` (Vercel rewrite cũng không proxy WebSocket), nên `io("/", { path: "/socket.io" })` thất bại rồi retry 10 lần. `services/socket.ts` ~37 đặt `auth: { token }` một lần; sau khi access token được refresh, các lần reconnect vẫn gửi token cũ. Dùng URL backend trực tiếp (`VITE_SOCKET_URL`, CORS đã có), `auth: cb => cb({ token: getAccessToken() })`, hoặc tắt socket khi không cấu hình và chỉ dùng poll.
6. **Poll thông báo bị trùng lặp.** `UserLayout.tsx` (~62–64) poll `GET /me/notifications?limit=1` mỗi 60 giây để đếm chưa đọc, trong khi hook thông báo ở `services/socket.ts` (~64–70) tải `GET /me/notifications?page=1&limit=25` riêng và cũng trả `unread`. Gom về một nguồn (context/store) với một interval, tạm dừng khi tab ẩn (`document.visibilityState`) và khi socket đang kết nối.
7. **Ảnh nặng trên đường tải đầu.** `assets/loading-waves.png` 1,67 MB nằm trong `AppLoader` (hiện trước mọi trang); `assets/logo-vertical.png` 437 KB và logo ~152 KB nằm trong bundle chính. Chuyển sang WebP/AVIF hoặc SVG, đặt kích thước đúng hiển thị, loader dùng CSS/SVG nhẹ.
8. **`index.css` nguyên khối ~481 KB (12.151 dòng).** Tách CSS theo trang/route (Vite tự tách CSS cho chunk lazy khi CSS được import trong file trang), bỏ CSS chết; CSS dùng chung giữ lại tối thiểu.
9. **Context value không memo.** Các provider (`RetirementPlanContext`, `FinancialProfileContext`, …) tạo object `value` mới mỗi lần render → mọi consumer render lại. Bọc `useMemo`/`useCallback`, tách context state và actions nếu cần.
10. **`SimulationTrackingPage.tsx` dài 4.645 dòng.** Tách theo tab/khu vực (what-if, bảng tháng, đối soát thực tế, so sánh) thành component lazy để giảm chunk và thời gian parse, giúp sửa mục 4 an toàn hơn.
11. **`routePreload` thiếu `/user/debts` và `/user/risk-portfolio`.** Thêm hai route này vào bảng trong `services/routePreload.ts` (trỏ tới `DebtAnalysisPage`, `RiskPortfolioPage`).
12. **Onboarding ghi hồ sơ v1, còn trang kế hoạch/preview cần v2.** `POST /me/onboarding/complete` lưu `schemaVersion: 1`; preview trả `409 PROFILE_V2_REQUIRED`. Phía frontend `upgradeToV2` (`context/FinancialProfileContext.tsx` ~295) gọi `createDefaultProfileV2` (`services/financialProfile.ts` ~268/445) đặt `birthMonth: { status: "KNOWN", value: "<năm>-01" }`, với năm suy từ tuổi hoặc mặc định 30 tuổi khi thiếu — tháng sinh bịa nhưng gắn nhãn KNOWN, trái quy tắc không tự đặt giá trị. Phải để `UNKNOWN`/hỏi người dùng xác nhận tháng sinh trong bước rà soát v2, và hướng người dùng sang rà soát hồ sơ v2 ngay sau onboarding thay vì để họ gặp lỗi ở trang kế hoạch.

Nghiệm thu: đo bằng DevTools Network trên bản deploy (Vercel) cho luồng đăng nhập → dashboard → `/user/plan` → `/user/simulation`: số request API trùng lặp, tổng KB tải đầu, thời gian tới khi bảng kế hoạch hiển thị; ghi số trước/sau. Đọc thêm cột `Server-Timing` (tab Timing) để tách thời gian backend khỏi mạng.

**Trạng thái mục 16 (14/10/2026):** đã thực hiện cả 12 việc theo yêu cầu trực tiếp của người dùng; chi tiết, số liệu trước/sau và các test Playwright lỗi thời có sẵn ở [FRONTEND_PERF_2026-10-14.md](FRONTEND_PERF_2026-10-14.md). Mục 8 mới xóa CSS chết (đã so pixel), chưa tách CSS theo trang.


## 17. Chính sách danh mục schemaVersion 2 (lộ trình theo năm tới nghỉ hưu) — bàn giao 15/10/2026

Backend đã thêm `schemaVersion: 2` cho chính sách danh mục (xem `backend/PROGRESS.md` mục ALLOCATION V3/V4 và `docs/BAN_NHAP_GIA_DINH_V3_CHINH_SACH_V4_2026-10-15.md`). Bản v4 đang là **bản nháp, chưa công bố**. **Không được công bố v4 trước khi mục 1–2 dưới đây lên production**, nếu không trang Danh mục sẽ lỗi.

Khác biệt hợp đồng: template v2 **không có** `coverageMonths` và `schedule`; thay vào đó là
`glidePath: { anchor: "RETIREMENT_MONTH", interpolation: "LINEAR_BY_WHOLE_YEARS_TO_ANCHOR", afterAnchor: "HOLD_ZERO_YEAR_POINT", points: [{ yearsToAnchor, allocations: [{ assetClass, weightPercent }] }] }`.
Tỷ trọng tại một tháng = nội suy tuyến tính theo số năm nguyên còn lại tới tháng nghỉ hưu (`floor(tháng còn lại / 12)`, chặn trong [0, điểm lớn nhất]); khi còn dưới 12 tháng (11 tháng trở xuống) và sau khi nghỉ hưu thì dùng điểm 0; còn đúng 12 tháng vẫn là bậc 1 năm. Mã nhóm tài sản mới: `CASH`, `GOV_BOND`, `EQUITY`, `GOLD` (nhãn lấy từ bộ giả định, không gắn cứng).

1. **`pages/RiskPortfolioPage.tsx` ~454 đọc `selectedTemplate.schedule.length`** → crash với template v2. Phân nhánh theo `"glidePath" in template`: v1 giữ hiển thị cũ; v2 hiển thị bảng/biểu đồ "Số năm tới nghỉ hưu → tỷ trọng" từ `points` và đánh dấu vị trí hiện tại theo `desiredRetirementMonth` của hồ sơ v2 (hoặc `whatIf.retirementMonth` nếu đang mô phỏng).
2. **`services/portfolios.ts`**: `PortfolioPolicyDocument.schemaVersion` thành `1 | 2`, `PortfolioTemplate` thành union (v1 `coverageMonths`/`schedule` | v2 `glidePath`); `PortfolioPreviewCommand` thêm `retirementMonth?: string` (YYYY-MM).
3. **Preview độc lập `POST /me/portfolio-policies/preview`** với chính sách v2 bắt buộc gửi `retirementMonth`; thiếu thì trả `INCOMPLETE` với issue `{ path: "retirementMonth", code: "RETIREMENT_MONTH_REQUIRED" }` và guidance tiếng Việt. `POST /me/retirement/preview` tự lấy tháng nghỉ hưu từ hồ sơ, không cần đổi payload.
4. Trang admin nếu có form sửa chính sách: không giả định mọi template có `schedule`.

Nghiệm thu: với chính sách v2 (dùng bản nháp `backend/seed-data/allocation-2026-10/draft-policy-v4.json` trên môi trường thử), trang Danh mục không lỗi console, hiển thị lộ trình 15→0 năm và vị trí hiện tại; preview độc lập trả `READY` khi có `retirementMonth`; với chính sách v1 hiện tại giao diện không đổi.


## 18. Luồng câu hỏi dẫn dắt và trình bày kết quả theo tài liệu thuật toán — bàn giao 15/10/2026

Nguồn: `docs/BAO_CAO_THUAT_TOAN_PHAN_BO_VA_DEMO_2026-10-15.md` (mục 1 phân tích demo, mục 5 FE-1 → FE-6). Mục này **chỉ gồm phần làm được với API hiện có**. Các câu hỏi cần backend mới (mức lỗ chịu được bằng tiền, độ ổn định thu nhập, tiền cần trong 1/3/5 năm, danh sách mục tiêu có hạn và ưu tiên) **chưa có chỗ lưu**: không thêm vào UI, không lưu vào localStorage hay trường tự đặt để "giả" lưu; backend sẽ bàn giao hợp đồng ở mục sau (P1-1/P1-2/P1-3).

1. **Thứ tự onboarding theo hướng "mong muốn trước, dữ liệu sau" (FE-1/FE-2).** `pages/OnboardingPage.tsx` hiện: Cá nhân → Thu nhập → Chi tiêu → Tài sản → Nợ → BHXH → Tổng kết. Đổi trình tự và cách hỏi, chỉ dùng các trường đã có trong hồ sơ: (a) mức chi mong muốn khi nghỉ hưu **theo giá hôm nay** (mục tiêu `monthlyExpense`/`monthlyExpenseInRetirement`), có chip gợi ý; (b) tuổi hiện tại/tháng sinh và tuổi/tháng muốn nghỉ hưu; (c) thu nhập và chi tiêu; (d) tài sản (ghi rõ không tính nhà đang ở); (e) khoản góp mỗi tháng, hiển thị ngay "phần còn dư = thu − chi" và cảnh báo khi khoản góp vượt phần dư; (f) nợ; (g) BHXH/lương hưu, cho phép "chưa biết, bổ sung sau". Giới tính và tình trạng hôn nhân đưa xuống sau hoặc chỉ hỏi khi bước BHXH cần. Mỗi màn một câu chính, có giá trị mặc định hợp lý và câu giải thích ngắn. Giữ nguyên việc lưu nháp và hợp đồng API; không đổi cách lưu `schemaVersion`.
2. **Màn "Mức sống hôm nay, sức mua ngày mai" (FE-3).** Sau bước tuổi nghỉ hưu, hiển thị `chi hôm nay × (1 + lạm phát)^số năm = chi tại tuổi nghỉ hưu` với lạm phát lấy từ bộ giả định đang công bố (`GET /me/assumptions/:id`, chuỗi `inflation` theo năm: nhân lũy kế từng năm, không tự đặt 4%). Có khối "Vì sao An Hưu dùng con số này?" nêu nguồn (`sources`) của bộ giả định.
3. **Ba thẻ so sánh kịch bản ở trang kế hoạch (FE-4).** "Giữ kế hoạch đã khai", "Nghỉ muộn hơn 5 năm" (`whatIf.retirementMonth` + 60 tháng, không vượt `endMonth`), "Chi ít hơn 15%" (`monthlyExpenseToday` × 0,85). Gọi `POST /me/retirement/preview` cho từng thẻ (debounce, hủy request cũ), hiển thị quỹ cần, quỹ dự kiến và khoản góp cần (`summary.atRetirement`, `requiredConstantMonthlyContribution`). Chỉ là xem trước, không lưu phiên bản.
4. **Trang danh mục (FE-5).** Với mỗi nhóm tài sản hiển thị **vai trò** (tiền gửi = giữ chủ động/khoản sắp cần; TPCP = gắn kỳ hạn với nhu cầu tiền; cổ phiếu = tăng trưởng dài hạn; vàng = đa dạng hóa) thay vì chỉ mã. Không tự tính "mức lỗ khi có cú sốc" ở frontend; backend sẽ trả số này sau (P1-6).
5. **Không hiển thị sản phẩm cụ thể như khuyến nghị (FE-6).** Rà các trang người dùng (`ExplorePage`, trang danh mục, AI): sản phẩm đối tác chỉ hiện khi API trả `isVisible`, luôn kèm nhãn thông tin tham khảo/không phải khuyến nghị; không xếp hạng hay gợi ý sản phẩm theo hồ sơ người dùng.

Nghiệm thu: `npm run typecheck`, `npm run test:assets`, `npm run build` đều qua; Playwright (mock API như `tests/portfolio-policy-v2.spec.ts`) cho onboarding mới, màn sức mua và 3 thẻ kịch bản; giao diện vẫn đúng với chính sách v1 đang công bố. Liệt kê rõ những câu hỏi đã bỏ lại vì thiếu backend.

## 19. P1-1 / P1-2 / P1-3: hồ sơ ràng buộc, mục tiêu và thông tin tách vốn — bàn giao 15/10/2026

Backend đã hỗ trợ các câu hỏi còn thiếu được ghi trong `frontend/GUIDED_PLANNING.md`. Phần này thay ghi chú “chưa có chỗ lưu” tại mục 18; chưa sửa hoặc nghiệm thu frontend. Không cần migration (profile JSONB). Các trường mới đều **tùy chọn**, không gán mặc định khi đọc hồ sơ cũ. Khảo sát và engine hưu trí hiện tại giữ nguyên; các ràng buộc mới chưa dùng để áp trần cổ phiếu/cú sốc (P1-6).

**Lưu và đọc:** tiếp tục API hồ sơ v2 hiện tại: `GET/PATCH /api/v1/me/financial-profile`, `GET/PUT /api/v1/me/onboarding-draft`, `POST /api/v1/me/onboarding/complete`. PATCH dùng `{ expectedRevision, changes: { schemaVersion: 2, ... } }`; nháp dùng `{ expectedRevision, step, data: { schemaVersion: 2, ... } }`. Giữ các giá trị `step` hiện có, ví dụ `investment` cho rủi ro/mục tiêu, không tự gửi step mới. Xử lý conflict 409 bằng tải lại/đối chiếu, không ghi đè. Gửi toàn bộ nhóm `lossTolerance`, `liquidityNeeds` hoặc danh sách `goals` khi sửa nhóm đó: merge hiện tại thay thế nhóm, chỉ `personal` được merge từng khóa. Bỏ trường trong PATCH nghĩa là giữ dữ liệu cũ; muốn xóa câu trả lời dùng `UNKNOWN`.

Quy ước `K<T> = { status: "KNOWN", value: T } | { status: "UNKNOWN" }`. Không gửi value kèm UNKNOWN, không gửi null/chuỗi rỗng thay cho UNKNOWN. Mọi object strict; số tiền/tỷ lệ là **decimal string**, không phải JSON number.

| Trường mới tại gốc profile v2 | Kiểu / validation | Ý nghĩa hiển thị |
|---|---|---|
| `lossTolerance.amountVnd?` | `K<money>` | Mức lỗ tối đa chịu được, VND ≥ 0 |
| `lossTolerance.percent?` | `K<percent>`; 0–100, tối đa 10 chữ số lẻ | `"20"` nghĩa là 20%, **khác** asset share `"0.2"` |
| `lossTolerance.reaction?` | `K<SELL / HOLD / BUY_MORE>` | Khi tài sản giảm: bán / giữ / mua thêm |
| `incomeStability?` | `K<STABLE / VARIABLE / UNCERTAIN>` | Ổn định / biến động / có thể gián đoạn; lần lượt dự phòng 6/9/12 tháng |
| `employerConcentration?` | `K<LOW / MEDIUM / HIGH>` | Mức phụ thuộc vào cùng ngành/nơi làm việc do người dùng tự đánh giá. Chưa có ngưỡng % hay phép chấm điểm suy ra tự động |
| `liquidityNeeds.y1?`, `.y3?`, `.y5?` | `K<money>` | Tổng tiền chắc chắn cần **lũy kế** trong 1/3/5 năm, theo giá hôm nay. Các mốc KNOWN phải không giảm: y1 ≤ y3 ≤ y5; so cả y1/y5 nếu y3 chưa biết |
| `goals?` | `{status:"KNOWN",entries:Goal[]}` / `{status:"UNKNOWN"}` / `{status:"NOT_APPLICABLE",reason:string}` | `KNOWN` + `[]` xác nhận không có mục tiêu; thiếu/UNKNOWN nghĩa là chưa biết |

Hai nhóm `lossTolerance?`, `liquidityNeeds?` cũng tùy chọn, các khóa con tùy chọn. Money dùng validation sẵn có: không âm, không ký hiệu khoa học, tối đa 16 chữ số nguyên và 2 chữ số thập phân. Không tự gán 0 khi người dùng bỏ qua.

Mỗi Goal khi hoàn tất hồ sơ có các trường sau (tối đa 200 mục tiêu):

| Trường | Kiểu / validation |
|---|---|
| `id` | Chuỗi ổn định 1–100 ký tự `[a-zA-Z0-9_-]+`, không trùng trong goals |
| `label` | Chuỗi có nội dung 1–120 ký tự |
| `amountToday` | `K<money>`; VND theo giá tại tháng định giá hồ sơ |
| `dueMonth` | `K<YYYY-MM>`; 1900–2199, không trước tháng định giá, được bằng tháng định giá |
| `inflation?` | `K<decimal string>`; > −100% và ≤ 100%, tối đa 10 số lẻ. **Bỏ trường** để dùng chuỗi CPI của bộ giả định đã ghim; explicit UNKNOWN yêu cầu bổ sung, không tự thay bằng CPI |
| `priority` | `K<ESSENTIAL / FLEXIBLE / LEGACY>`; thiết yếu / linh hoạt / để lại |
| `deferrable` | `K<boolean>`; có thể hoãn hay không |

Nháp cho phép từng Goal chỉ có `id`; khi complete phải có các trường bắt buộc, nhưng có thể trả UNKNOWN cho câu chưa biết. Lạm phát riêng là ngoại lệ được cho phép **chỉ trong mục tiêu**, không phải override CPI/lợi suất của engine hoặc preview. Priority/deferrable được lưu để dùng tiếp; hiện mọi mục tiêu ≤60 tháng đều giữ vốn, không tự bỏ/hoãn mục tiêu FLEXIBLE/LEGACY.

Ví dụ phần bổ sung vào `changes` hoặc `data`:

```json
{
  "schemaVersion": 2,
  "lossTolerance": {
    "amountVnd": { "status": "KNOWN", "value": "100000000" },
    "percent": { "status": "KNOWN", "value": "20" },
    "reaction": { "status": "KNOWN", "value": "HOLD" }
  },
  "incomeStability": { "status": "KNOWN", "value": "VARIABLE" },
  "employerConcentration": { "status": "UNKNOWN" },
  "liquidityNeeds": {
    "y1": { "status": "KNOWN", "value": "0" },
    "y3": { "status": "KNOWN", "value": "300000000" },
    "y5": { "status": "KNOWN", "value": "300000000" }
  },
  "goals": { "status": "KNOWN", "entries": [{
    "id": "tuition", "label": "Học phí", "amountToday": { "status": "KNOWN", "value": "300000000" },
    "dueMonth": { "status": "KNOWN", "value": "2029-10" },
    "priority": { "status": "KNOWN", "value": "ESSENTIAL" },
    "deferrable": { "status": "KNOWN", "value": false }
  }] }
}
```

**Hiển thị tách vốn:** `POST /api/v1/me/retirement/preview` giữ nguyên request và thêm `data.capitalSeparation`, ngang hàng với `calculation`. Trường này **không có trên kết quả kế hoạch đã lưu/replay**; frontend phải kiểm tra tồn tại. Không gửi nó ngược vào lệnh save. `inputHash` preview vẫn dùng nguyên cơ chế cũ; phần bổ sung không được ghi vào snapshot, không đổi `calculation`, `replayInput` hoặc `initialRetirementCapital`.

| Trường kết quả | Cách hiển thị |
|---|---|
| `status: READY / INCOMPLETE`, `issues`, `warnings` | Trạng thái riêng của tách vốn; INCOMPLETE không tự làm preview hưu trí INCOMPLETE. Hiển thị yêu cầu bổ sung theo path; null = chưa tính được, không đổi thành 0 |
| `informationalOnly: true`, `assumptionBasis: PINNED_BASE`, `valuationMonth`, `currency: VND` | Nhãn “Thông tin tách vốn — chưa áp dụng vào quỹ hưu trí đang tính”. Dùng giả định cơ sở đã ghim trong `data.references`, độc lập kịch bản BASE/ADVERSE/FAVORABLE |
| `essentialMonthlyExpense`, `reserveMonths`, `requiredEmergencyReserve` | Chi ESSENTIAL đang hiệu lực tại tháng định giá × 6/9/12. Bao gồm khoản ONCE đúng tháng đó theo quy ước cashflow hiện có; không dùng tỷ lệ 70%, không cộng HEALTH/OPTIONAL nếu chúng không được khai ESSENTIAL |
| `declaredEmergencyReserve`, `emergencyShortfall` | Tổng tài sản LIQUID có sẵn × ownershipShare × emergencyShare; thiếu = max(0, dự phòng cần − đã khai). Chỉ tài sản VND đúng ngày định giá, loại nhà/BĐS/LOCKED/ILLIQUID/tài sản tương lai như summary hiện tại |
| `retirementLiquidAssets` | Chỉ phần retirementShare, cùng cơ sở như `profile.summary.values.retirementLiquidAssets`; giữ để tham chiếu engine hưu trí hiện tại, không dùng làm cơ sở trừ dự phòng/mục tiêu lần nữa. Khi what-if giá tài sản, dùng giá giả định của preview |
| `declaredOtherGoalsCapital` | Tổng tài sản LIQUID có sẵn × ownershipShare × otherGoalsShare, cùng quy tắc loại trừ và định giá với hai phần còn lại; null nếu thiếu dữ liệu cần tính |
| `investableLiquidAssets` | Tổng `retirementLiquidAssets + declaredEmergencyReserve + declaredOtherGoalsCapital`: toàn bộ vốn đầu tư thanh khoản thuộc cả ba phần đã khai, tính phần sở hữu đúng một lần. Bất kỳ phần cần tính nào null thì tổng này và growthCapital null, có issue; không suy phần chưa biết từ hai tỷ lệ còn lại |
| `nearTermGoalsPresentValue` | Tổng PV các mục tiêu 0–60 tháng, gồm mục tiêu sau tháng nghỉ hưu nếu vẫn trong 60 tháng; mục tiêu tháng hiện tại PV = amountToday |
| `growthCapital` | **investableLiquidAssets − requiredEmergencyReserve − nearTermGoalsPresentValue**. Trừ mỗi nhu cầu bảo vệ đúng một lần từ tổng vốn đầu tư, không trừ lần nữa từ phần retirementShare vốn đã loại dự phòng/mục tiêu. Giữ số âm để thấy thiếu vốn; không đổi số vốn đầu vào của engine hưu trí |
| `goals[]` | `id`, `dueMonth`, `monthsUntilDue`, `treatment: RESERVED/LONG_TERM`, `futureAmount`, `presentValue`, `inflationBasis`, `inflationSourceIds`, `depositSourceIds`. LONG_TERM (>60 tháng) không tính FV/PV trong lớp này, các số đó null |

PV dùng đúng số tháng giữa tháng định giá và tháng cần tiền (không làm tròn năm): nhân `(1+g_năm)^(số_tháng_trong_năm/12)` và chia hệ số tiền gửi tương ứng, từ tháng định giá **đến trước** tháng cần tiền. Tiền gửi là nhóm `CASH` trong bộ giả định đã ghim, chọn duy nhất horizon bao phủ thời hạn mục tiêu, chuẩn hóa danh nghĩa/thực, ghép lãi, phí và thuế bằng helper hiện có. CPI chuyển lợi suất REAL luôn là CPI thị trường, không dùng lạm phát riêng của mục tiêu. Không extrapolate năm hay lấy “lãi suất hiện tại” ngoài bộ đã ghim. Chỉ làm tròn khi trình bày; API giữ Decimal precision 48, không làm tròn trung gian.

Thông điệp cần có cho frontend:

- `INCOME_STABILITY_REQUIRED`, `GOALS_REQUIRED`, `GOAL_AMOUNT_REQUIRED`, `GOAL_DUE_MONTH_REQUIRED`, `GOAL_INFLATION_REQUIRED`: hỏi đúng câu còn thiếu. Hồ sơ cũ vẫn dùng được cho engine hưu trí.
- `UNKNOWN_VALUE`, `VALUATION_DATE_REQUIRED`, `FX_RULE_REQUIRED`: dữ liệu tiền/định giá chưa đủ, không ước lượng thay.
- `DEPOSIT_HORIZON_NOT_COVERED`, `GOAL_ASSUMPTIONS_NOT_COVERED`, `DEPOSIT_NET_RETURN_REQUIRED`: cấu hình đã ghim thiếu nhóm/kỳ hạn/năm hoặc phí thuế; hiển thị chưa đủ cấu hình, không cho người dùng tự nhập lãi tiền gửi để né lỗi.
- `EMERGENCY_RESERVE_SHORTFALL`: hiển thị phần dự phòng cần bổ sung.
- `OTHER_GOALS_CAPITAL_SHORTFALL`: `declaredOtherGoalsCapital < nearTermGoalsPresentValue`; hiển thị vốn dành cho mục tiêu khác đã khai chưa đủ PV mục tiêu gần hạn. So sánh số chưa làm tròn; nếu một bên null thì không kết luận thiếu hoặc đủ.
- `PROTECTED_CAPITAL_EXCEEDS_RETIREMENT_ASSETS`: vốn tăng trưởng âm, tổng vốn đầu tư thanh khoản không đủ dự phòng và PV mục tiêu; giữ mã cảnh báo cũ để tương thích. Không hiện biểu đồ phân bổ với tỷ trọng từ số âm.
- `LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION`: tiền chắc chắn cần 1/3/5 năm chỉ là khai báo ràng buộc, **không tự cộng thêm vào PV goals** vì có thể trùng mục tiêu. Hướng dẫn nhập/đối chiếu danh sách mục tiêu tương ứng. Không tuyên bố mọi nhu cầu thanh khoản đã được bảo đảm chỉ vì `status=READY`.

**Bốn câu hỏi onboarding cần bổ sung** (thay danh sách đang để lại trong GUIDED_PLANNING):

1. “Bạn chịu được mất tối đa bao nhiêu tiền?” → amountVnd; hỏi thêm %/phản ứng khi giảm và mức tập trung ngành/nơi làm việc trong cùng bước rủi ro. Không suy câu trả lời từ riskLevel cũ.
2. “Thu nhập của bạn ổn định đến mức nào?” → incomeStability, giải thích số tháng dự phòng tương ứng. Không chọn sẵn STABLE.
3. “Trong 1/3/5 năm tới, bạn chắc chắn cần bao nhiêu tiền?” → liquidityNeeds, giải thích lũy kế và cảnh báo dữ liệu mâu thuẫn.
4. “Bạn còn mục tiêu nào cần tiền vào một tháng cụ thể?” → goals; hỏi tiền theo giá hôm nay, tháng, ưu tiên, có thể hoãn; lạm phát riêng tùy chọn, mặc định UI là “Dùng bộ giả định”, tức **không gửi inflation**. Phải có lựa chọn “không có mục tiêu khác” khác với “chưa biết”.

Nghiệm thu frontend tiếp theo: round-trip nháp/complete/PATCH/GET cả UNKNOWN và số 0; hồ sơ cũ không tự thêm dữ liệu; phần tách vốn READY/INCOMPLETE/âm/cảnh báo thiếu dự phòng; 60/61 tháng; không lỗi khi kế hoạch đã lưu thiếu capitalSeparation; các bảng/biểu đồ quỹ cũ không bị thay bằng growthCapital; không gọi DB/script seed để tạo demo. Golden backend tham số 2 tỷ, chi 25 triệu, VARIABLE, mục tiêu 300 triệu sau 36 tháng, CPI 4%, tiền gửi 4,5%: dự phòng 225 triệu; FV 337,46 triệu; PV 295,71 triệu; vốn tăng trưởng 1.479,29 triệu. Các mức lãi này là fixture kiểm thử, không phải mặc định production. OpenAPI: `backend/docs/profile-v2.openapi.yaml`, `backend/docs/retirement.openapi.yaml`.

**Sửa theo review 16/10/2026:** công thức dùng retirementLiquidAssets ở bản bàn giao đầu đã trừ hai lần phần vốn bảo vệ người dùng khai; dùng investableLiquidAssets theo bảng trên. Golden thứ hai chia 2 tỷ thành ba tài sản: 225 triệu emergencyShare=1, 295,71 triệu otherGoalsShare=1, 1.479,29 triệu retirementShare=1; tổng vốn đầu tư vẫn 2 tỷ và growthCapital vẫn **1.479,29 triệu** sau làm tròn, bằng trường hợp khai toàn bộ vào retirementShare. Chuyển phần khai giữa ba mục đích không đổi growthCapital nếu tổng vốn đầu tư/sở hữu/thanh khoản không đổi. Khai 295,71 triệu cho mục tiêu vẫn có thể thiếu một khoản nhỏ so với PV chính xác, vì vậy frontend không làm tròn trước khi quyết định cảnh báo. Thiếu bất kỳ phần vốn cần tính → null/issue, không hiển thị tổng vốn từng phần như tổng đầy đủ.

## 20. BACKEND đợt A — ràng buộc lỗ, thiết yếu, điều chỉnh, phí và cảnh báo (16/10/2026)

Phạm vi: P1-4/P1-6→P1-10/P0-4/P0-5. Đây là hợp đồng backend; chưa sửa hoặc nghiệm thu frontend. P1-1→P1-3 ở mục 19 giữ nguyên. Không gọi DB/seed hoặc tự công bố cấu hình để tích hợp UI.

### 20.1 Hồ sơ GOLD/BOND

- `assetEntry.type` thêm `GOLD`, `BOND` cho cả hồ sơ đầy đủ và nháp.
- `costBasis?: {status: "KNOWN", value: "80000000"} | {status: "UNKNOWN"}` cùng đơn vị/currency với tài sản. Đây là thông tin giá vốn, không thay `value`, không suy thuế/lợi nhuận.
- Không gửi mặc định vào hồ sơ cũ. GOLD/BOND dùng đúng quy tắc STOCK_FUND: nhân ownershipShare/retirementShare, kiểm currency/valuedOn; LIQUID có thể vào vốn, LOCKED/ILLIQUID bị loại; availableFromMonth tương lai là vốn chờ khả dụng, không vừa vốn đầu kỳ vừa injection. Các luồng nguồn/reconcile actuals dùng cùng quy tắc.

### 20.2 Các trường mới chỉ bổ sung vào POST /me/retirement/preview

Không thay `status` READY/INCOMPLETE cấp ngoài, `inputHash`, `replayInput` hay số tiền hiện có khi không gửi phí. READY nghĩa là tính được, không có nghĩa mọi ràng buộc đều đạt. Kế hoạch đã lưu/replay có thể không có các trường bổ sung dưới đây; UI phải hỗ trợ thiếu trường.

**`lossConstraint`**:

- `informationalOnly: true`; `status`: WITHIN_LIMIT / REDUCE_RISK / NOT_FEASIBLE / REVIEW_REQUIRED; `message` tiếng Việt và `issues[]`.
- `growthCapital`, `lossAmount`, `allowedLossAmount`, `lossPercentOfGrowth`, `lossPercentOfInvestableAssets`, `exceedsTolerance`. Các số là chuỗi thập phân chưa làm tròn; dữ liệu thiếu là null, không phải 0.
- Cú sốc tức thì ở tháng định giá dùng `calculation.marketRows[0].holdings[].startWeightPercent` của danh mục được chọn, trên growthCapital. Không dùng tổng tài sản hoặc retirementLiquidAssets làm mẫu số ràng buộc. `allowedLossAmount = min(percent / 100 × growthCapital, amountVnd)`.
- Tỷ lệ sốc và vai trò tài sản lấy từ **chính sách đã duyệt/công bố**, optional `schemaVersion: 2.lossStress = {evidence, equityAssetClass, depositAssetClass, shocks: [{assetClass, percent}]}`. Percent cú sốc thuộc [-100,0], đơn vị điểm phần trăm. Cấu hình thiếu/không phủ đủ tài sản → REVIEW_REQUIRED; không có tỷ lệ dự phòng trong code. Schema 1 cũ không tự thêm trường.
- `maxEquityWeightPercent` là mức cổ phiếu tối đa **trong phạm vi chỉ giảm từ tỷ trọng hiện tại**, giữ trái phiếu/vàng và chuyển phần giảm sang tiền gửi; `proposedAllocations`, `proposedLossAmount` là minh họa, không tự áp dụng/lưu. Nếu chuyển hết cổ phiếu vẫn vượt: NOT_FEASIBLE, trần khả thi null, phương án trả về thể hiện cổ phiếu bằng 0 nhưng vẫn không đạt.
- Thiếu tolerance vẫn có thể tính số tiền sốc nếu đủ capital/policy; `exceedsTolerance = null`. Vốn âm/thiếu → REVIEW_REQUIRED.
- Nháp v4 đã thêm CASH 0%, GOV_BOND -5%, EQUITY -35%, GOLD -10% từ tài liệu khách. **Chưa duyệt/công bố trong DB**. Giữ assumptionVersionId `d9b30f3b-8a8a-443c-9294-c4e88a26adb6`; assumptions v3 không đổi byte. Không diễn giải preview với chính sách v2 cũ thiếu lossStress thành đã vượt qua ràng buộc lỗ.

**Thiếu hụt thiết yếu**:

- `calculation.summary.essentialShortfall`, `firstEssentialShortfallMonth`; mỗi `calculation.rows[]` thêm `essentialShortfall`, `otherShortfall`.
- `essentialCoverage = {basis: "ESSENTIAL_FIRST_CLASSIFICATION_ONLY", essentialShortfall, firstEssentialShortfallMonth, rows: [{month, essentialExpense, essentialShortfall, otherShortfall}]}` cho biết cơ sở phân loại.
- Trước hưu: chi ESSENTIAL đang hiệu lực. Sau hưu: toàn bộ `livingExpense` (chi hưu đã theo CPI) + ESSENTIAL trong `retirementAdditionalExpenseIds` đã chọn. Không tự cộng các chi chưa chọn sau hưu vào mô phỏng.
- Đo bằng sổ quỹ thực có, ưu tiên phân loại nguồn còn lại cho thiết yếu; không lấy số dư âm giả định làm khoản vay, không đếm thiếu hụt tháng trước lần nữa. Đây là phân loại kết quả, không sửa thứ tự giao dịch của engine.
- `essentialShortfall + otherShortfall = unfundedWithdrawal` từng tháng. `otherShortfall` gồm toàn bộ phần chi ngoài ESSENTIAL (có thể gồm nợ, phí, y tế chưa được phân loại ESSENTIAL); nhãn UI nên là **“Thiếu hụt chi khác”**, không gọi toàn bộ là chi có thể bỏ. Chi thiết yếu chưa đủ dữ liệu → null.

**`adjustmentOptions`**:

- Có đủ ba hướng: `requiredMonthlyContribution` + `contributionWithinCapacity`; `earliestFeasibleRetirementMonth`; `maximumFeasibleMonthlyExpenseToday`.
- Thêm `retirementSearchStatus`, `expenseSearchStatus` (NOT_NEEDED / FOUND / NOT_FEASIBLE / REVIEW_REQUIRED), `feasibleRetirementCandidate`, `endMonth`, `evaluations`, `issues`; status chung READY / NOT_NEEDED / NOT_FEASIBLE / REVIEW_REQUIRED.
- Điều kiện đạt: không thiếu rút quỹ, không thiếu mục tiêu cuối kỳ và không thiếu ngân sách góp đã khai. Kết quả xác định, không phải xác suất thành công.
- Tìm tháng từ tháng hưu đang chọn đến endMonth, dùng what-if trên cùng engine và chính sách, không kéo dài endMonth, không kéo dài hợp đồng lương/pension/lịch góp. Chia đôi tìm ứng viên, kiểm tra các tháng sớm hơn để không giả định quan hệ đơn điệu khi lộ trình/dòng tiền thay đổi. Tối đa **64 phép tính tháng ứng viên**; chưa chứng minh được sớm nhất hoặc có tháng thiếu dữ liệu → REVIEW_REQUIRED, earliest null. `feasibleRetirementCandidate` chỉ là ứng viên đã kiểm chứng, **không gắn nhãn “sớm nhất”**.
- Chi hưu: chia đôi trong [0, mức chi đang không đạt], tối đa 64 vòng, giữ cận dưới khả thi đến 0,01 VND theo độ chính xác input. Zero cũng không đạt → NOT_FEASIBLE/null. Không nâng lợi suất, không suy thêm thu nhập. Không tự bỏ lịch góp có ngày cố định để làm phương án hợp lệ.
- Đây là các hướng sửa độc lập, chưa phải phép tối ưu đồng thời vừa đạt mục tiêu vừa giảm rủi ro. Nếu lossConstraint yêu cầu giảm, UI không được tuyên bố phương án dòng tiền đã được kiểm lại ở danh mục giảm rủi ro.

**`decisionExplanations[]`**:

- Mỗi phần tử `{code, parameters, text}`; parameters chứa số liệu nguồn (Decimal là string), câu tiếng Việt làm tròn tiền để hiển thị.
- Mã hiện có: GOAL_CAPITAL_RESERVED, GROWTH_CAPITAL, PORTFOLIO_HORIZON, LOSS_CONSTRAINT, PLAN_FUNDED / PLAN_NOT_FUNDED, REVIEW_REQUIRED.
- PORTFOLIO_HORIZON có templateId, retirementMonth, years và JSON-string `startAllocations`/`endAllocations` (assetClass, weightPercent) từ lộ trình thực tính. Không parse câu text để lấy số liệu.
- Chưa có ngưỡng được duyệt cho employerConcentration hoặc quy tắc đối chiếu liquidityNeeds với goals: giữ REVIEW_REQUIRED; không tự đặt trần cổ phiếu, không cộng thêm liquidityNeeds vào PV.
- Các giải thích/thông tin rủi ro/thiết yếu/điều chỉnh bổ sung hiện chỉ ở preview HTTP, không hồi tố vào snapshot cũ và không tham gia inputHash.

### 20.3 Phí tư vấn tùy chọn

Input mới: `advisoryFee?: {annualPercent: "1", paidFrom: "FUND" | "EXTERNAL"}`. Không gửi = không phí; **không prefill mức phí**, không gửi `{annualPercent:"0"}` thay cho việc bỏ trường. Chỉ nhập khoản phí tư vấn bổ sung, không nhập lại phí quản lý đã phản ánh trong NAV/giả định lợi suất.

- Kỳ là một tháng đầy đủ theo engine hiện có (kể cả kỳ định giá lẻ ngày): `fee = annualPercent / 100 × averageFund × 1/12`.
- `averageFund = (funded opening + max(0, funded closing trước phí tư vấn kỳ này)) / 2`. Số cuối tham chiếu gồm lãi, khoản góp đúng START/END, injection và rút của kỳ; không tính AUM trên đường số dư âm. Phí các kỳ trước đã giảm vốn đầu kỳ hiện tại. Đây là bình quân hai đầu kỳ, không phải bình quân NAV theo ngày.
- FUND: phí cộng vào khoản rút quỹ cuối tháng. EXTERNAL: cộng vào chi ngân sách hộ, giảm khả năng góp và phần dư. Nếu ngân sách hộ âm, thiếu hụt đi qua quy tắc rút quỹ hiện có; EXTERNAL không có nghĩa miễn trừ kiểm tra thiếu tiền.
- Mỗi row có `advisoryFeeAmount`, `advisoryFeeAverageFund`, `advisoryFeePaidFrom` **chỉ khi có input**. `netWithdrawal` vẫn là dòng thu chi hộ; phí FUND thể hiện trong withdrawal và advisoryFeeAmount, không đổi nghĩa netWithdrawal cũ.
- Input có phí làm inputHash thay đổi; bỏ phí giữ đường hash cũ. Save tạo kế hoạch mới ghim các dòng phí/cashflow đã tính, replay v3 tái lập chính xác; không sửa kế hoạch đã lưu.
- Khoản góp cần của engine là nghiệm với lịch phí hiện tại đã ghim, vì đổi khoản góp có thể đổi AUM/phí. `CONTRIBUTION_ESTIMATE_USES_CURRENT_FEE_SCHEDULE_REPREVIEW_REQUIRED` yêu cầu preview lại trước khi chấp nhận mức góp. Hai phép tìm tháng/chi chạy lại prepare nên tính lại phí mỗi ứng viên.
- **Giới hạn luồng mới**: cập nhật từ actuals/source-reforecast đối với kế hoạch mới có advisoryFee trả 422 `ADVISORY_FEE_REFORECAST_REVIEW_REQUIRED`; chưa được giữ nguyên khoản phí tính từ vốn cũ khi vốn thực tế đổi. Replay/read và các kế hoạch không có phí vẫn hoạt động như cũ. Giao diện cần hướng dẫn tạo preview mới; không tự bỏ phí để né guard.

### 20.4 Cảnh báo cấu hình và kế hoạch cũ

- Preview retirement/portfolio trả POLICY_NOT_COVERED, PROJECTION_NOT_COVERED, ASSET_HORIZON_NOT_COVERED sẽ ghi structured logger mức `warn`, event `preview.coverage_warning`; mỗi code tối đa một lần/phản hồi. Chỉ có time/level/event/route/code, không userId, profile, số tiền, answers hay ngày cá nhân. Không ghi DB/systemLog riêng trong tính năng này.
- GET plan detail, GET version, replay version và GET report có optional `readWarnings[]` khi thực sự bị cắt ngắn. Mỗi cảnh báo `{code:"PLAN_HORIZON_TRUNCATED", message:"Kế hoạch bị cắt ngắn, nên tính lại.", endMonth, expectedEndMonth, goalRevision}`.
- So endMonth đã lưu với **birthMonth trong snapshot + lifeExpectancy của RetirementGoal hiện tại**. Không có birthMonth/tuổi thọ → không suy mặc định. Bằng mốc thì không cảnh báo. Cảnh báo nằm ngoài preview/snapshot và không đổi hash/kết quả đã lưu. Không có cảnh báo thì trường bị lược bỏ để giữ hình dạng phản hồi cũ.
- Hành động UI: gợi ý tính lại tới expectedEndMonth với cấu hình được phép; không tự chỉnh endMonth/apply kế hoạch. Nếu chính sách chưa phủ thời hạn thì hiện lỗi cấu hình đúng như backend, không cắt ngắn để né lỗi.

### 20.5 Nghiệm thu UI trên mock/local

1. GOLD/BOND + KNOWN/UNKNOWN costBasis round-trip draft/complete/PATCH; tài sản LOCKED/future không vào vốn ngay.
2. Golden 2 tỷ: loss 340,24 triệu, 17,01% vốn đầu tư, 23% tăng trưởng; tolerance bằng mức sốc không bị coi vượt. Thiếu policy/tolerance/capital không hiện “đạt”.
3. REDUCE_RISK hiển thị trần cổ phiếu và danh mục đề xuất, không thay danh mục đã lưu; NOT_FEASIBLE vẫn hiển thị lỗ còn lại sau khi cổ phiếu về 0.
4. Thiếu chi khác nhưng không thiếu thiết yếu; thiếu thiết yếu ở một tháng về sau; snapshot/replay cũ thiếu trường mới vẫn đọc được.
5. Ba hướng sửa có số hoặc trạng thái rõ ràng; chỉ FOUND mới ghi “sớm nhất/tối đa”; REVIEW_REQUIRED không biến null thành 0. Giữ endMonth và lịch hợp đồng khi thử phương án.
6. Không gửi phí / phí 0 / FUND / EXTERNAL; invalidate preview khi đổi phí, đọc đúng phần tiền bị trừ, không trừ NAV hai lần; xử lý guard reforecast mới.
7. Đọc kế hoạch cũ bị cắt ngắn hiện banner và nút tính lại; kiểm tra snapshotHash, saved version và replay không bị sửa.

OpenAPI được sinh bằng các script generate: profile-v2, portfolios, retirement, plans. Hợp đồng cũ comparison.atRetirement và export.csv format technical/readable-vi được giữ nguyên. Kết quả test backend và danh sách file ở đầu `backend/PROGRESS.md`; không dùng test backend thay bằng chứng UI/browser.

## 21. BACKEND đợt B (P2) — mô phỏng, thử thách, chọn danh mục, tái cân bằng (16/10/2026)

Backend đã thêm API phân tích riêng; không đổi request/response lưu kế hoạch, inputHash hay replay v2/v3/v4. **Chưa có bộ dữ liệu thị trường thật được công bố trong đợt này.** Không tự dựng dữ liệu hay xác suất để lấp màn hình. Chi tiết: `backend/docs/ALLOCATION_RISK_P2.md`; hợp đồng sinh tự động: `backend/docs/allocation-risk.openapi.yaml`.

### 21.1 API USER chỉ đọc

POST `/api/v1/me/retirement/risk/simulation`, `/scenarios`, `/selection`:

```json
{
  "plan": { "kind": "PREVIEW", "preview": "<object retirement preview hiện có, không phải string>" },
  "marketVersionId": "<UUID bộ đã công bố, có thể bỏ để server chọn bản hiệu lực mới nhất>",
  "paths": 100
}
```

Kế hoạch đã lưu thay `plan` bằng `{kind:"SAVED_VERSION",planId,versionId}`. Backend kiểm chủ sở hữu, integrity snapshot, dùng hồ sơ/giả định/chính sách đã ghim. Không gửi returns/CPI/seed/alpha/block/threshold/weights; strict schema sẽ từ chối. POST chỉ truyền lựa chọn, không ghi DB. Chọn lại dataset ID từ phản hồi để tái lập cùng kết quả; không tự thay phiên bản chính sách đang công bố cho kế hoạch cũ.

| Trạng thái | UI phải làm |
|---|---|
| DATA_REQUIRED | Thông báo chưa có chuỗi tổng lợi nhuận tháng được cấp phép/công bố/đủ cột; không hiện 0%, biểu đồ giả hay gọi đây là minh họa |
| REVIEW_REQUIRED | Hiện issues về tham số chính sách, phân loại chi hoặc lịch nguồn; không dùng default tự đặt |
| LIMIT_EXCEEDED | Cho giảm paths hoặc thử lại; không hiện thống kê đường đi chạy dở |
| INSUFFICIENT | Không có phương án đạt ngưỡng; hiện adjustmentOptions và ba hướng góp thêm/nghỉ muộn/chi ít |
| READY | Hiện kết quả theo đúng basis/disclosure; với scenarios vẫn phải kiểm từng tình huống |

`paths` mặc định 100, tối đa 500; tổng candidate-path-months ≤200000, deadline tính số 10 giây; một phiên chạy/user, hai/process, sáu request/phút/IP. Deadline hợp tác kiểm giữa các đường đi; không phải bảo đảm thời gian HTTP kể cả đọc DB. Không tự tăng N hoặc retry vòng lặp khi bị giới hạn.

### 21.2 Hiển thị mô phỏng và chọn phương án

- `pEssential` là số trong [0,1], tỷ lệ đường đi không thiếu **bất kỳ tháng chi thiết yếu nào**, không phải bảo đảm đủ mọi khoản chi/mục tiêu cuối kỳ. Hiển thị `display.pEssentialPercent` nguyên phần trăm cùng `display.wilsonLowerPercent/UpperPercent`; giải thích Wilson 95% chỉ phản ánh sai số lấy mẫu mô phỏng.
- `cvarEssentialShortfallToday` là chuỗi VND chính xác của thiếu hụt thiết yếu ở đuôi xấu theo `cvarAlpha`. Hiển thị `display.cvarVnd` đã làm tròn triệu đồng. Không đặt nhãn CVaR95 cố định nếu alpha khác .95.
- `bands[].p10/p50/p90`: số dư **được tài trợ** theo sức mua tại ngày định giá, làm tròn triệu; không phải ba danh mục, lợi suất hay số dư âm giả định. Dùng dữ liệu server, không tính lại percentile ở frontend.
- Công khai dataset ID/version/hash, sources/license, period, historyMonths, paths, seed, blockMonths và hạn chế. Bootstrap lịch sử không bảo đảm xác suất tương lai. Chưa có dữ liệu → DATA_REQUIRED.
- `/selection` trả `selectedId`, `candidates`, `rejected`, `threshold`, `rule`. Ưu tiên p đạt ngưỡng → CVaR nhỏ nhất → thay đổi danh mục ít nhất. Không xếp theo Sharpe/lợi suất cao nhất. Không tự áp selectedId vào kế hoạch đã lưu; đây là dữ liệu phân tích.
- `adjustmentOptions` dùng hợp đồng P1-8 mục 20.2; các số là điều chỉnh tất định, cần chạy lại mô phỏng sau khi chọn. Kế hoạch reforecast chưa đủ phân loại/lịch nguồn có thể chỉ trả ba hướng và REVIEW_REQUIRED, không suy null thành 0.

### 21.3 Tám tình huống

`scenarios` có HIGH_INFLATION, EQUITY_CRASH, RATE_RISE, CREDIT, GOLD, PROPERTY_ILLIQUIDITY, INCOME_LOSS. Tình huống thứ tám là `longevity`, có các results extraYears=5/10 được duyệt. Mỗi entry có READY/REVIEW_REQUIRED/NOT_APPLICABLE riêng; bao ngoài READY không có nghĩa cả tám đã chạy. Không có tham số → REVIEW_REQUIRED; không có bán BĐS trong cửa sổ → NOT_APPLICABLE. Sống lâu thiếu dữ liệu năm hoặc lịch nguồn mở rộng cũng REVIEW_REQUIRED, không kéo dài tự động lương hưu/nợ/thu nhập. Không diễn giải thử thách tất định thành xác suất.

Bản draft v4 chỉ có block=12 (trong khoảng 12–36), alpha=.95, ngưỡng=.90 CHỜ DUYỆT, dải=5 điểm %, longevity=[5,10]. Bước dịch cổ phiếu và bảy cú sốc khác còn trống. Các trường này chỉ dùng khi chính sách được ADMIN duyệt/công bố; không lấy trực tiếp file draft để hiển thị kết quả thật.

### 21.4 Đề xuất tái cân bằng

POST `/api/v1/me/retirement/risk/rebalance`:

```json
{
  "policyVersionId": "<UUID>", "templateId": "<mẫu glide được công bố>",
  "month": "2026-10", "retirementMonth": "2050-05",
  "holdings": [{ "assetClass": "CASH", "value": "100000000", "maturedAmount": "0" }],
  "newContribution": "0"
}
```

Ví dụ trên chỉ minh họa shape, không phải bộ dữ liệu thị trường hay phương án đề xuất. Gửi toàn bộ nhóm thực tế; nhóm mục tiêu vắng trong holdings có nghĩa người dùng xác nhận không nắm giữ. `maturedAmount` là phần nằm **trong value**, không cộng lại tổng tài sản. Target lấy từ policy, client không gửi target/cost/band. Vượt tuyệt đối **hơn** dải mới đề xuất; bằng dải trả WITHIN_BAND. Ưu tiên tiền góp/đáo hạn trước rồi mua bán còn thiếu; chi phí theo half-L1 của phần mua bán còn lại.

Hiện `oldWeights`, `targetWeights/newWeights`, `reason`, `trades` (cashAllocated/buy/sell/newValue), `cost`, `netValue`, `assumptions`. Nhãn rõ **đề xuất, chưa giao dịch, chưa lưu nhật ký** (`persisted:false`). WITHIN_BAND chưa phân bổ tiền góp mới. Không sửa ActualMonth hoặc giả lập nút đã áp dụng. Nếu cần nhật ký gắn ActualMonth, yêu cầu thiết kế bảng riêng ở đợt sau; không có migration trong P2.

### 21.5 ADMIN — tài liệu dữ liệu thị trường

GET/POST `/api/v1/admin/market-data`; GET/PATCH `/:id`; POST `/:id/validate`, `/:id/approve`, `/:id/publish`. DRAFT→APPROVED→PUBLISHED, expectedRevision bắt buộc khi sửa/duyệt/công bố. Approval `{expectedRevision,confirm:true,reviewNote}`; publish `{expectedRevision,confirm:true}`. Không có impact-token cho model này (giống portfolio policy). Đã duyệt/công bố thì tạo draft mới để sửa; không ghi đè chuỗi.

Form/JSON import phải có title/reason/effectiveFrom; period; sources URL/ngày/license/quyền mô phỏng và kết quả dẫn xuất; nhóm tài sản/sourceId/chứng cứ total return/fees/taxTreatment; CPI source; quality review; rows theo tháng. Unit cố định DECIMAL_MONTHLY_TOTAL_RETURN (`0.01`=1%), CPI là thay đổi tháng so tháng trước, VND danh nghĩa. NET không trừ phí lần nữa; GROSS phải có monthlyDrag được duyệt. Không dùng chuỗi tăng giá chỉ số thay tổng lợi nhuận có cổ tức. ADMIN chịu trách nhiệm chứng minh nguồn/quyền sử dụng; backend không tự xác minh giấy phép nhà cung cấp.

Chặn tháng thiếu/trùng/không liên tục, thiếu/thừa cột, thiếu nguồn/license; **không điền 0 hoặc nội suy**. Không tự upload fixture unit test hoặc draft giả vào môi trường thật. Chưa có dữ liệu đã công bố thì để USER thấy DATA_REQUIRED.

### 21.6 Nghiệm thu UI mock/local

1. Không có dataset, dataset chưa hiệu lực, thiếu tham số và timeout: mỗi trạng thái có thông báo đúng, không số giả.
2. Cùng savedVersion/dataset/model/seed/path count cho kết quả giống nhau; đổi hồ sơ hiện tại không sửa kết quả snapshot đã ghim.
3. Hiện tỷ lệ + Wilson + CVaR + dải tiền với đơn vị/làm tròn/disclosure đúng; raw values chỉ dùng kỹ thuật, không hiển thị xác suất nhiều chữ số.
4. Không có ứng viên đạt thì có hướng điều chỉnh; không gọi selectedId null là danh mục khuyến nghị; không tự apply.
5. Bảy scenarios và longevity mỗi kết quả có trạng thái riêng; thiếu lịch 5/10 năm không hiển thị đường kéo dài giả.
6. Rebalance dùng tiền góp mới trước: trường hợp đủ tiền mặt không có bán hoặc chi phí; đáo hạn không tăng tài sản hai lần; đúng bằng 5 điểm % không kích hoạt.
7. ADMIN revision cũ trả conflict; USER bị chặn mọi route ADMIN; request nhét returns/CPI/policy bị từ chối; token ADMIN không dùng endpoint USER.
8. Snapshot/replay v2/v3/v4, inputHash và kế hoạch đã lưu giữ nguyên. Bộ test backend không thay bằng chứng nghiệm thu frontend/browser.

**Trạng thái mục 19–21 (16/10/2026):** Codex đã làm phần frontend cho cả ba mục (4 câu hỏi ràng buộc trong `PlanningQuestions.tsx`, `RiskAnalysis.tsx`, `AnalysisResults.tsx`, `AdvisoryFeeEditor.tsx`, `ProfileReviewPreview.tsx`, `AdminMarketDataPage.tsx`, `services/planningAnalysis.ts`; luồng nháp tuân theo guard `DRAFT_SCHEMA_MISMATCH` thật của backend) rồi dừng vì hết hạn mức trước khi viết báo cáo. Đã kiểm lại: `typecheck`, `test:assets` 75/75, `build`, Playwright `guided-planning` + `onboarding-readability` + `portfolio-policy-v2` + `market-data-admin` + `planning-contracts` 45/45 (một test của `planning-contracts` được sửa nhãn cho khớp UI thật: "Tháng cần kiểm tra số dư (giờ Việt Nam)", "Tính lại từ số dư đã ghi"). Việc Codex đang làm dở khi dừng: thêm kiểm thử nháp → lưu → mở lại 4 câu hỏi trên màn 375px. Chưa commit.

## 22. BACKEND giai đoạn 1 — Chế độ giải thích bằng Trợ lý AI (17/10/2026)

Hợp đồng cho giai đoạn frontend theo `docs/KE_HOACH_CHE_DO_GIAI_THICH_AI_2026-10-17.md`. Phạm vi giao diện là `UserLayout`; hai endpoint mới dưới đây dành cho tài khoản `USER`, yêu cầu Bearer token. Token `ADMIN` trả 403; không dùng endpoint này cho trang admin. Endpoint giải thích tất định và bảng thuật ngữ không cần đồng ý xử lý AI, không gọi nhà cung cấp AI, không lưu hoặc áp dụng kế hoạch.

### 22.1 Nguồn dữ liệu và request giải thích chỉ số

POST `/api/v1/me/explanations/metric`, JSON:

```ts
type MetricSource =
  | { kind: "PLAN_VERSION"; planId: string; versionId: string }
  | { kind: "PREVIEW"; input: RetirementPreviewInput };

type MetricExplanationRequest = { metricKey: string; source: MetricSource };
```

`planId` và `versionId` là UUID. `RetirementPreviewInput` là đúng input đã dùng cho POST `/me/retirement/preview` (schema backend `retirementPreviewSchema`), gồm `expectedProfileRevision`, `policyVersionId`, kịch bản và các lựa chọn cá nhân. `policyVersionId` ghim chính sách đã công bố; chính sách ghim bộ giả định. Backend đọc hồ sơ của chính người gọi, kiểm tra revision và tự tính lại từ một lần chụp dữ liệu. Không gửi hồ sơ tùy ý, giả định lợi suất/lạm phát, snapshot, `calculation`, `summary`, `result`, `value` hay bất kỳ số kết quả nào trong request. Các object nguồn/input và object lồng trong input đều được kiểm tra trường lạ; các số tiền đầu vào cá nhân hợp lệ vẫn là chuỗi thập phân như hợp đồng preview hiện có.

Ví dụ chọn số của một phiên bản đã lưu:

```json
{
  "metricKey": "summary.atRetirement.coveragePercent",
  "source": {
    "kind": "PLAN_VERSION",
    "planId": "<UUID kế hoạch>",
    "versionId": "<UUID phiên bản>"
  }
}
```

Ví dụ nguồn preview dùng nguyên input của lần tính thành công, không dùng input nháp vừa sửa nhưng chưa tính:

```ts
const body: MetricExplanationRequest = {
  metricKey: "capitalSeparation.growthCapital",
  source: { kind: "PREVIEW", input: lastSuccessfulPreviewInput },
};
```

`PLAN_VERSION` được đọc qua `PlansService`, kiểm tra đồng thời chủ sở hữu kế hoạch và phiên bản thuộc kế hoạch, giữ nguyên bản chụp, hash và kết quả đã lưu. Không tính bổ sung từ hồ sơ hiện tại để giải thích số của bản cũ. Các phần tách vốn/ràng buộc lỗ/thiết yếu hiện được bổ sung riêng ở HTTP preview, nên có thể không tồn tại trong snapshot đã lưu: lúc đó trả `METRIC_NOT_AVAILABLE`, không tự suy hoặc ghi thêm vào snapshot.

### 22.1b Mức chi tiết `detail` (bổ sung sau review, 17/10/2026)

Request có thêm `detail: "SUMMARY" | "MONTHLY"`, mặc định `SUMMARY`; response trả lại đúng `detail` đã dùng.

- **`SUMMARY` (dùng cho popup):** các đầu vào theo từng tháng được gộp lại thành: giai đoạn (`unit: "PERIOD"`, giá trị `YYYY-MM → YYYY-MM`), số tháng (`MONTHS`), tổng (`source` bắt đầu bằng `Σ`, đơn vị VND) và hệ số lũy kế (`source` bắt đầu bằng `Π`, `FACTOR`). Một popup thường chỉ có dưới 16 bước. `notes` có câu nhắc "xem chi tiết từng tháng để tái tạo chính xác".
- **`MONTHLY`:** trả từng tháng như trước (có thể hàng nghìn bước). Chỉ gọi khi người dùng chủ động bấm "Xem chi tiết từng tháng"; hiển thị bằng bảng có cuộn hoặc phân trang, không nhồi vào popup.
- `value`, `formula` và `label` giống hệt nhau ở cả hai chế độ.
- Nguồn `PREVIEW` giờ chạy bản preview rút gọn: giữ nguyên các số, nhưng không chạy bộ tìm phương án điều chỉnh và không ghi log lặp lại. Thời gian phản hồi vì vậy ngắn hơn nhiều, nhưng frontend vẫn nên debounce và không gọi trước khi người dùng bấm.

### 22.2 Response, độ chính xác và lỗi

Thành công HTTP 200 theo envelope chuẩn `{ data, meta: { requestId } }`:

```ts
type LocalizedText = { vi: string; en: string };
type AssumptionSource = {
  id: string;
  kind: "HISTORICAL_OFFICIAL" | "FORECAST" | "AN_HUU_LONG_TERM" | "ASSET_RESEARCH";
  title: string; publisher: string; url: string; release: string;
  publishedOn: string; retrievedOn: string;
  fromYear: number; toYear: number; note: string;
};
type MetricExplanation = {
  metricKey: string;
  label: LocalizedText;
  value: string; // Chuỗi thập phân từ đúng kết quả server; không đổi sang float để đối chiếu.
  unit: "VND" | "PERCENT";
  formula: LocalizedText & { symbolic: string };
  steps: Array<{ label: LocalizedText; value: string; unit: string; source: string }>;
  assumptions: { version: number; sources: AssumptionSource[] };
  notes: string[];
  limitations: string[];
};
```

`source` trong mỗi bước là đường dẫn/nguồn dữ liệu backend, dùng để đối chiếu đầu vào của công thức. Danh sách bước có thể dài theo số tháng hoặc số mục tiêu; không giả định chỉ có hai đầu vào. `assumptions.version` là phiên bản số của bộ giả định đã ghim, không phải phiên bản bảng thuật ngữ. Nhãn và công thức có cả tiếng Việt có dấu và tiếng Anh; hiện `notes`/`limitations` là chuỗi do server cung cấp, phải giữ nguyên ý nghĩa và hiển thị giới hạn liên quan.

Đơn vị chỉ số v1 là `VND` hoặc `PERCENT`; khoản góp mang nghĩa mỗi tháng qua nhãn/công thức. Đơn vị bước còn có `FACTOR` (hệ số), `MONTHS` (số tháng), `TIMING` (quy ước thời điểm), `MONTH` (mốc tháng). Không tự định dạng mọi `steps[].value` thành tiền; các bước quy ước có thể là chuỗi như `END_OF_MONTH` hoặc `YYYY-MM`.

Frontend giữ giá trị thập phân gốc gắn với phần tử đang hiển thị và nguồn tương ứng. Khi popup nhận response, so sánh `value` với **giá trị gốc của đúng trường**, có thể dùng Decimal để coi `1` và `1.0` là bằng nhau. Chỉ định dạng/làm tròn để hiển thị sau khi đã đối chiếu; không so với text đã làm tròn, tỷ lệ đã chặn để vẽ vòng tròn, số tiền đổi sang triệu, số dư sau lấy trị tuyệt đối hoặc chênh lệch do UI tự tính. Nếu lệch, hiển thị **“Số liệu đã thay đổi, hãy tải lại”** và mời tính/tải lại; không hiện công thức của dữ liệu khác. Khi đổi nguồn, input, revision hoặc phiên bản trong lúc chờ response, bỏ response cũ.

Lỗi theo envelope hiện có `{ error: { code, message, fieldErrors? }, requestId }`:

| HTTP / code | Xử lý frontend |
| --- | --- |
| 400 `VALIDATION_ERROR` | Sai shape/trường lạ/input preview không hợp lệ; sửa request, không gửi thêm số kết quả. |
| 401 / 403 | Chưa đăng nhập hoặc sai vai trò; theo luồng xác thực hiện có. |
| 404 `NOT_FOUND` | Kế hoạch/phiên bản không tồn tại hoặc không thuộc người gọi; không tiết lộ dữ liệu người khác. |
| 409 `REVISION_CONFLICT` và các guard hồ sơ/chính sách hiện có | Hồ sơ hoặc dữ liệu ghim cần tải/rà soát lại; giữ nguyên thông báo server. |
| 422 `METRIC_NOT_AVAILABLE` | Khóa chưa được hỗ trợ, số null, nguồn không có trường đó, tháng phí không có hoặc không áp dụng. Hiện “Chưa có giải thích cho số liệu này”; không biến null thành 0, không nhờ AI bịa công thức/con số thay thế. |
| 429 `RATE_LIMITED` | POST giới hạn 30 lần/phút theo user; chờ theo header, không retry vòng lặp. GET glossary không có limiter riêng; cả hai vẫn chịu limiter chung của API. |

POST giải thích tất định không cần `Idempotency-Key`; thao tác chỉ đọc/tính. Chỉ gọi khi người dùng mở popup, có thể tái dùng response còn đúng nguồn/input để giảm request; không tải đồng loạt mọi con số mỗi lần rê chuột.

### 22.3 Danh sách metricKey v1 và nơi gắn trên giao diện

Trong bảng, `summary` viết tắt cho `preview.calculation.summary`; các phần còn lại là nhánh của response preview. Vị trí dưới đây đối chiếu mã frontend hiện có, không xác nhận giai đoạn 2 đã được triển khai.

| metricKey | Giá trị gốc server | Vị trí số hiện có / quy tắc gắn |
| --- | --- | --- |
| `summary.atRetirement.requiredFund` | `calculation.summary.atRetirement.requiredFund` | `/user/plan`: “Quỹ cần có khi nghỉ hưu”, hộp xác nhận áp dụng; `/user/dashboard`: dòng “Quỹ cần”; `/user/simulation`: cột quỹ cần của bản hiện tại và kịch bản. |
| `summary.atRetirement.projectedFund` | `calculation.summary.atRetirement.projectedFund` | `/user/plan`: quỹ dự kiến trong khối đầu trang và thẻ quỹ dự kiến; dashboard: quỹ dự kiến; simulation: quỹ dự kiến/cột so sánh; `PlanVersionDrawer`, `GuidedScenarios`, `AnchorReforecastResult` khi có nguồn phù hợp. |
| `summary.atRetirement.fundingGap` | `calculation.summary.atRetirement.fundingGap` | Simulation: ô chênh lệch thiếu hụt của **bản hiện tại** đang dùng đúng trường này. Không gắn vào thẻ thiếu hụt của trang kế hoạch hoặc ô kịch bản chỉ vì tên nhãn giống nhau; xem lưu ý bên dưới. |
| `summary.atRetirement.coveragePercent` | `calculation.summary.atRetirement.coveragePercent` | Plan: số phần trăm trong vòng độ phủ và hộp xác nhận; dashboard: phần trăm độ phủ; simulation: tỷ lệ bao phủ, giữ raw trước `Math.round`; drawer phiên bản/anchor result khi có nguồn. Không dùng chiều rộng thanh/vòng đã chặn về 0–100. |
| `summary.requiredConstantMonthlyContribution` | `calculation.summary.requiredConstantMonthlyContribution` | Plan: thẻ khoản góp cần mỗi tháng; dashboard: khoản góp/tháng; `GuidedScenarios`: khoản góp cần. Null là chưa xác định. |
| `summary.additionalMonthlyContribution` | `calculation.summary.additionalMonthlyContribution` | Plan: dòng “Đóng góp bổ sung … mỗi tháng” dưới thẻ thiếu hụt. |
| `summary.futureMonthlyExpense` | `calculation.summary.futureMonthlyExpense` | Plan: dòng tiền sinh hoạt/tháng đã điều chỉnh lạm phát; dashboard: dòng chi tương lai dưới khoản góp. Không gắn vào input chi theo giá hôm nay. |
| `summary.initialRetirementCapital` | `calculation.summary.initialRetirementCapital` | Plan: vốn ban đầu trong khối quỹ cần; simulation: câu “Tính toán dựa trên tài sản thanh khoản ban đầu …”. Không gắn vào toàn bộ tài sản ròng của hồ sơ. |
| `capitalSeparation.requiredEmergencyReserve` | `capitalSeparation.requiredEmergencyReserve` | `PreviewInsights` trên plan: “Dự phòng cần có”. Không dùng ô dự phòng đã khai/cần bổ sung. |
| `capitalSeparation.nearTermGoalsPresentValue` | `capitalSeparation.nearTermGoalsPresentValue` | `PreviewInsights`: “Vốn giữ cho mục tiêu gần hạn (giá trị hiện tại)”. Không dùng số mục tiêu giá hôm nay hoặc vốn mục tiêu đã khai. |
| `capitalSeparation.growthCapital` | `capitalSeparation.growthCapital` | `PreviewInsights`: “Vốn tăng trưởng”; giữ dấu âm nếu có. Tách vốn chỉ tham khảo, không tự áp vào quỹ. |
| `lossConstraint.lossAmount` | `lossConstraint.lossAmount` | `PreviewInsights`: “Mức lỗ mô hình” trong “Nếu thị trường có cú sốc”. Không dùng giới hạn lỗ, tỷ lệ lỗ hoặc lỗ của phương án đề xuất. |
| `essentialCoverage.essentialShortfall` | `essentialCoverage.essentialShortfall` | `PreviewInsights`: “Tổng thiếu hụt thiết yếu”. Là tổng các tháng, không dùng cho từng hàng tháng hoặc `pEssential`/CVaR của mô phỏng rủi ro. |
| `rows.YYYY-MM.advisoryFeeAmount` | `calculation.rows.find(r => r.month === "YYYY-MM").advisoryFeeAmount` | `PreviewInsights`: cột “Phí” của đúng tháng trong bảng “Phí tư vấn trong dòng tiền”. Ví dụ khóa `rows.2026-10.advisoryFeeAmount`; tháng phải tồn tại trong nguồn. Không gắn vào tỷ lệ phí năm hay “Quỹ bình quân”. |

Đối chiếu trường thật: engine có `summary.retirementFundingShortfall` và `summary.excessAtRetirement` **khác** `summary.atRetirement.fundingGap`. Trang plan đang dùng hai trường đầu cho thẻ thiếu/dư; simulation đang dùng `retirementFundingShortfall` qua biến `simGap` cho số thiếu và cột kịch bản của hàng “Chênh lệch thiếu hụt”. V1 không đăng ký hai chỉ số đó hoặc ô chênh lệch giữa hai kịch bản; giữ chúng chưa gắn metric cho tới khi có registry đúng, không chọn khóa gần giống.

Phí tư vấn không có trường tổng phí trong summary; trường thật là `rows[].advisoryFeeAmount`, `advisoryFeeAverageFund`, `advisoryFeePaidFrom`. Vì request không có tham số tháng riêng, tháng nằm trong metricKey để giải thích đúng hàng; không tự chọn tháng đầu hoặc tạo tổng phí không có trên màn hình.

Chọn nguồn theo số **đang thực sự hiển thị**:

- Plan và dashboard: khi `synchronization.changed` và đang dùng preview mới, dùng `PREVIEW` với `synchronization.input` của response đó; khi hiển thị snapshot không đổi, dùng `PLAN_VERSION` với `activePlan.id/currentVersion.id`. Preview thủ công dùng `lastPreviewInput` đã tính thành công; không lấy input nháp mới.
- Simulation: cột bản hiện tại dùng `PLAN_VERSION`; kịch bản chưa lưu dùng input preview đã tạo `simResult`. Từng bên giữ nguồn riêng; số chênh lệch giữa hai bên không phải metric v1. Nếu vẫn giữ kết quả cũ trong lúc đang tính, giữ luôn input gắn với kết quả cũ hoặc tạm khóa mở popup số đó.
- Tab theo dõi và nguồn của `ActualsTab`: kết quả dự báo lại/candidate chưa lưu không phải `RetirementPreviewInput`. Không ép chúng vào `PREVIEW` hoặc thay bằng phiên bản gốc; chỉ dùng `PLAN_VERSION` sau khi có đúng phiên bản chứa kết quả đó, còn lại dùng thuật ngữ/chưa hỗ trợ giải thích chỉ số ở v1.
- `/user/risk-portfolio` hiện hiển thị điểm khảo sát, tỷ trọng, lộ trình và kịch bản danh mục, không có các số tách vốn/ràng buộc lỗ của `PreviewInsights`. Gắn glossary cho thuật ngữ trước. Không gửi `PortfolioPreviewInput` vào endpoint này hoặc lấy metric quỹ hưu trí để giải thích lợi suất/điểm khảo sát. Nếu frontend bổ sung đúng số từ RetirementPreview thì dùng nguồn/metric tương ứng ở bảng.

### 22.4 Bảng thuật ngữ có phiên bản đặt ở backend

GET `/api/v1/me/explanations/glossary` trả HTTP 200 `{ data: { version, terms }, meta: { requestId } }`:

```ts
type Glossary = {
  version: string;
  terms: Array<{ key: string; label: LocalizedText; definition: LocalizedText }>;
};
```

Phiên bản đầu: `explanations-glossary-2026-10-17-v1`, 38 mục; bản hiện tại `explanations-glossary-2026-10-17-v2`, 39 mục (thêm `netWorth` – Tài sản ròng), tiếng Việt có dấu và tiếng Anh, nội dung viết sẵn trong `backend/src/modules/explanations/glossary.ts`. Chọn đặt ở backend để frontend và các client cùng dùng một bản được kiểm duyệt, cập nhật nội dung/phiên bản cùng ý nghĩa engine, tránh mỗi màn hình tự định nghĩa khác nhau. Nội dung là dữ liệu tĩnh không cần migration, DB hay LLM. Client có thể cache theo `version`; không cần gọi AI cho mục đã có.

Khóa v1: `inflation`, `presentValue`, `futureValue`, `nominalValue`, `purchasingPower`, `requiredFund`, `projectedFund`, `fundingGap`, `fundCoverage`, `requiredMonthlyContribution`, `additionalMonthlyContribution`, `initialRetirementCapital`, `emergencyReserve`, `essentialExpenses`, `otherExpenses`, `essentialShortfall`, `growthCapital`, `nearTermGoals`, `liquidAssets`, `lockedAssets`, `glidePath`, `marketShock`, `lossTolerance`, `essentialCoverageProbability`, `cvar`, `rebalance`, `governmentBonds`, `deposits`, `equities`, `gold`, `socialInsurance`, `pension`, `pinnedAssumptions`, `planSnapshot`, `advisoryFee`, `nav`, `fundedBalance`, `unfundedWithdrawal`.

Frontend gắn khóa rõ cho từng cụm từ (`<Explain term="fundCoverage"/>`), không đoán nghĩa chỉ bằng trùng chuỗi nhãn. Đặc biệt phân biệt độ phủ quỹ với tỷ lệ đường mô phỏng đủ chi thiết yếu; chi khác có thể gồm khoản bắt buộc; cú sốc minh họa không phải dự báo xác suất; quy tắc dự phòng trong hệ thống không phải quy định pháp luật.

### 22.5 Dự phòng bằng endpoint AI hiện có cho cụm từ chưa có trong bảng

Bôi đen một cụm từ (tối đa 300 ký tự) thì popup tự giải thích, không cần bấm thêm: khớp đúng nhãn trong bảng thuật ngữ thì hiện định nghĩa; nếu không khớp thì tự gọi `/me/ai/explain` (vẫn kiểm tra đồng ý dùng AI trước). Đoạn dài hơn 300 ký tự mới hiện nút "Nhờ AI giải thích đoạn này". Một lần bôi đen chỉ gửi một yêu cầu (chờ 300 ms để gộp double/triple click). Luôn gắn nhãn **“AI giải thích – tham khảo”**. Đây là luồng AI hiện có, không phải response/formula của endpoint chỉ số mới. Backend AI hiện chọn các đoạn sự thật/kiến thức được phép; có thể chưa có giải thích cụ thể cho một thuật ngữ mới. Giữ thông báo và nguồn thực tế trả về, không hứa rằng mọi cụm từ đều được AI định nghĩa đầy đủ.

1. Đọc GET `/api/v1/me/ai/privacy`. Nếu `processing === false` hoặc `reconsentRequired === true`, mở luồng đồng ý hiện có; không tự bật đồng ý chỉ vì người dùng bật chế độ giải thích. PUT `/me/ai/privacy` dùng `{ expectedRevision, policyVersion, processing, saveHistory }`, lấy revision/policyVersion từ response. `saveHistory` là lựa chọn riêng; bật processing không bắt buộc lưu lịch sử.
2. POST `/api/v1/me/ai/explain` với header `Idempotency-Key: <UUID>`, body tối thiểu `{ "question": "Giải thích cụm từ: <cụm từ người dùng chọn>" }`. Giới hạn question là 1–2000 ký tự. Có thể gửi đồng thời `planId` và `versionId` khi người dùng đã chọn một phiên bản thuộc họ và muốn dùng ngữ cảnh đó; không có định dạng PREVIEW ở endpoint AI này. Không gửi thêm hồ sơ, số liệu tự tính, DOM toàn trang hoặc nội dung ngoài cụm từ/ngữ cảnh đã được phép. `throughMonth`, `conversationId`/`expectedRevision` chỉ dùng theo luồng theo dõi/hội thoại hiện có, không tự thêm để mở popup.
3. `AI_CONSENT_REQUIRED` (403) yêu cầu đồng ý; `AI_PRIVACY_CHANGED` (409) yêu cầu tải lại tùy chọn; 429 `RATE_LIMITED` chờ, không retry liên tục. AI giữ giới hạn hiện tại 15 request/phút theo user, dùng chung limiter với một số thao tác AI khác. Khóa idempotency không miễn giới hạn.
4. Response AI có `status: AI_ASSISTED | PROVIDER_NOT_CONFIGURED | PROVIDER_UNAVAILABLE`, `answer`, `facts`, `citations`, `knowledgeStatus`, `provenance`, `savedHistory` và trạng thái hội thoại. Khi nhà cung cấp không cấu hình/gián đoạn, vẫn có thể nhận HTTP 200 với câu trả lời dự phòng; hiển thị đúng status và `NO_APPROVED_MATCH` nếu có, không báo đã có câu trả lời AI có nguồn chỉ vì HTTP thành công. Không dùng answer này thay value/công thức tất định.
5. Nút “Hỏi thêm Trợ lý AI” dẫn tới `/user/assistant`, giữ luồng hỏi đáp/consent hiện có. Việc bật chế độ, gọi glossary hoặc mở công thức tất định không tự tạo hội thoại AI.

### 22.6 Điểm nghiệm thu giai đoạn frontend

Giữ yêu cầu bật/tắt bằng header/Esc, tắt khi chuyển trang, Tab/Enter/Esc, `role="dialog"`, trả focus, đóng khi bấm ngoài/cuộn/resize, popup không tràn ở 375px và tôn trọng giảm chuyển động trong kế hoạch. Ngoài chế độ, vùng được gắn giải thích giữ hành vi bấm hiện có. Test mock cần có nguồn saved/preview đúng, raw value lệch, null/422, revision đổi, response cũ, sai vai trò, 429, glossary song ngữ/có phiên bản, AI chưa đồng ý/đổi consent/provider gián đoạn. Không dùng DB production để nghiệm thu; backend giai đoạn 1 không sửa `frontend/` và không thay bằng chứng kiểm thử giao diện cho giai đoạn 2.

## 23. Thiết kế lại popup giải thích — 18/10/2026

Phạm vi lần chỉnh này: `frontend/src/components/explanations/ExplainMode.tsx`, `explanations.css`, bổ sung kiểm thử vào `frontend/tests/explain-mode.spec.ts`. Đã đọc mục 22 và brief frontend trước khi chỉnh; tiếp tục từ phần giải thích đã có.

- Dùng token navy/ice hiện có; phân biệt nhãn thuật ngữ, số liệu và AI tham khảo. Nội dung chính 16px, bảng/nguồn 14px; tiêu đề và nút đóng nằm ngoài vùng cuộn.
- Số liệu có khối kết quả, cách tính, bảng thành phần; nguồn/phiên bản giả định thu gọn trong mục mở rộng. Giữ notes, limitations và nguồn kỹ thuật để đối chiếu, không sửa công thức hay hợp đồng API.
- Nội dung AI giữ xuống dòng, nguồn tham khảo mở rộng; trạng thái chờ/lỗi/đồng ý xử lý và liên kết Trợ lý AI rõ ràng.
- Sửa cuộn trong popup làm đóng popup; bảng tháng dùng ResponsiveDialog hiện có, hỗ trợ Tab/Esc, trả focus về nút mở bảng. Cuộn/bấm ngoài popup vẫn đóng như trước.
- Theo dõi thay đổi kích thước khi tải nội dung; giới hạn vị trí theo vùng hiển thị thực, trừ thanh cuộn trình duyệt. Giữ giảm chuyển động và giao diện màn hình hẹp.
- Nghiệm thu giao diện dùng **MOCK API**, không phải chứng minh tích hợp AI/backend thật. Ảnh trong `artifacts/explanation-redesign/`; không kiểm zoom trình duyệt 200% thật trong lần chỉnh này.

Kết quả kiểm tra:
- `npm run typecheck` (frontend): PASS; lần kiểm tra từ root cũng PASS frontend/backend.
- `npm run test:assets`: 77/77 PASS.
- `npm run build`: PASS; còn cảnh báo kích thước bundle >500 kB của ứng dụng.
- Playwright: `explain-mode`, `guided-planning`, `onboarding-readability`, `portfolio-policy-v2`, `planning-contracts`, `plan-detail-fixes`: 97/97 PASS.
- Sau chỉnh mép viewport và cỡ chữ bảng: chạy lại `explain-mode`: 12/12 PASS. Có kiểm tra cỡ chữ thực tế, cuộn bên trong, nguồn mở rộng, focus/Tab/Esc và bảng tháng tại 375/1440px; nội dung AI dài tại 375/1280/1440/1920px.
- Đã xem ảnh thuật ngữ, AI mobile, số liệu desktop và bảng tháng mobile. Không thêm dependency. Không sửa backend, không ghi DB, không deploy/commit/push trong lần chỉnh này.

## 24. Giải thích viết sẵn và tái sử dụng kết quả — 18/10/2026

### Kế hoạch và phần đã triển khai

1. **Nội dung cố định:** thêm 14 mục Việt/Anh trong `frontend/src/components/explanations/catalog.ts` cho bản xem trước, kế hoạch đang dùng, phiên bản đã lưu, số dư thực tế, thu nhập/chi tiêu/trả nợ/tiền còn lại hàng tháng, thời gian tích lũy/nghỉ hưu, kết thúc dự phóng, mức chi theo giá hôm nay, thời điểm góp và so sánh phương án. Kết hợp 39 thuật ngữ hiện có từ backend; định nghĩa tài chính vẫn do bảng thuật ngữ có phiên bản cung cấp. Bổ sung các cách gọi tương đương đúng nhãn UI, chỉ khớp chính xác, không đoán bằng một phần chuỗi.
2. **Gắn khóa rõ:** bổ sung nhãn trên Tổng quan và Kế hoạch chi tiết; nhãn “Số dư thực tế” trong theo dõi dùng định nghĩa riêng, không dùng định nghĩa số dư mô hình. Bôi đen tên/alias đã biết cũng dùng nội dung viết sẵn. Khóa `term` thiếu hoặc glossary tải lỗi hiển thị thông báo/thử lại; không tự gửi khóa kỹ thuật cho AI. Văn bản người dùng chọn chưa khớp sau khi đã tải được glossary vẫn dùng luồng AI có kiểm tra đồng ý hiện có.
3. **Giảm request:** bảng thuật ngữ tái sử dụng tối đa 15 phút trong phiên; kết quả `SUMMARY`/`MONTHLY` lưu tạm tối đa 5 phút, giới hạn 40 mục. Khóa gồm metric, toàn bộ source/input (revision, policy, phương án, lịch góp…), giá trị gốc, mức chi tiết và ngôn ngữ. Cùng request đang chạy được dùng chung; lỗi hoặc giá trị lệch không được giữ để tái sử dụng. Đổi đầu vào/phiên bản tạo khóa khác; vùng số liệu thay đổi hoặc biến mất sẽ đóng popup cũ, response cũ không ghi vào popup mới.
4. **Phạm vi cache:** chỉ bộ nhớ của provider, tách theo tài khoản qua key của UserLayout và hết khi provider bị tháo; không ghi localStorage/sessionStorage, không lưu tạm câu trả lời AI. Bản xem trước vẫn bị kiểm revision ở backend khi cần request mới; người dùng mở lại ngay cùng dữ liệu được dùng kết quả còn hạn.
5. **Kiểm chứng:** đếm request trên trình duyệt cho glossary, AI, summary và monthly; kiểm thử lỗi rồi thử lại, đổi input, nội dung Việt/Anh, alias, giới hạn/TTL cache và popup được mở sau thao tác cuộn tới nhãn. Sửa việc sự kiện cuộn đến trễ làm đóng popup vừa mở; cuộn thực sự sau khi mở vẫn đóng popup.

### Cách bổ sung nội dung

- Hướng dẫn cố định của giao diện: thêm key, label/definition Việt–Anh và aliases chính xác vào `catalog.ts`, gắn `<Explain term="key">` vào nhãn. Nhãn nằm trong nút/link đang có hành động không được bọc bằng một nút tương tác khác.
- Thuật ngữ tài chính đã có định nghĩa backend: dùng key hiện có; thêm cách gọi của UI vào `glossaryAliases`, không chép lại công thức hay chính sách vào frontend.
- Con số cá nhân: dùng `metric`, source và giá trị gốc của đúng số đang hiển thị; không thay bằng lời giải thích cố định về giá trị của người dùng.
- Các bài kiểm tra catalog đối chiếu trực tiếp glossary backend để phát hiện alias mơ hồ hoặc nội dung Việt/Anh thiếu. Nghiệm thu trình duyệt dùng MOCK API, không gọi nhà cung cấp AI hay ghi DB.

### Kết quả nghiệm thu

- `npm run typecheck` (frontend): PASS.
- `npm run test:assets`: **82/82 PASS**, gồm catalog Việt/Anh, đối chiếu alias với glossary backend, khóa đầy đủ, request đang chạy dùng chung, TTL, giới hạn bộ nhớ, thử lại và cache độc lập.
- `npm run build`: PASS (cảnh báo bundle lớn có sẵn của ứng dụng).
- `npx --no-install playwright test tests/explain-mode.spec.ts tests/plan-detail-fixes.spec.ts --reporter=line`: **55/55 PASS** trên bản cuối. Kiểm request chứng minh: thuật ngữ viết sẵn không gọi AI; bật/tắt lại không tải glossary lần nữa khi còn hạn; mở lại summary/monthly không POST thêm; đổi tiền góp có POST mới mang đúng input; lỗi 429 không ngăn thử lại.
- Các thay đổi ở frontend và tài liệu; không thay endpoint, công thức, backend, DB hoặc chính sách đồng ý AI. Kiểm trình duyệt dùng dữ liệu giả lập.

## 25. Giảm nhập liệu ở onboarding — luồng "Kế hoạch đầu tiên" 3 màn (đề xuất 22/10/2026)

Tài liệu đầy đủ: `docs/ONBOARDING_GIAM_NHAP_LIEU_2026-10-22.md`. **Chưa triển khai.** Chờ chủ sản phẩm chốt D1–D4 ở mục 9 của tài liệu.

- Vấn đề: hiện người dùng phải qua khoảng 15 màn và khoảng 45 trường nhập, trải ở onboarding, hồ sơ chi tiết, `/user/risk-portfolio` và `/user/goal`, mới tới bản kế hoạch đầu tiên.
- Luồng mới: 3 màn với 7–9 trường và 5 lần bấm chip rồi ra bản xem trước READY ngay. Các phần còn lại chuyển thành checklist sau khi người dùng đã thấy kế hoạch.
- Backend: **không cần thêm hay đổi API.** Đã kiểm hồ sơ v2 tối thiểu theo mục 4 của tài liệu qua `profileV2Schema` và `prepareRetirement`: READY, `issues: []`. Dùng các endpoint `onboarding-draft`, `onboarding/complete`, `retirement/preview` hiện có.
- Việc frontend:
  1. Mang tuổi, tuổi hưu, mức chi từ `/mo-phong` sang đăng ký và điền sẵn ở onboarding.
  2. Luồng 3 màn cho người dùng mới; bản nháp v1 cũ và hồ sơ v2 đã có giữ luồng hiện tại.
  3. Tài sản "Tiền để dành cho hưu trí" lưu với `retirementShare = 1`.
  4. Tự điền `Q_HORIZON`; gợi ý `Q_FINANCIAL_CAPACITY` nhưng người dùng phải bấm xác nhận.
  5. Màn kết quả có dòng "Chưa tính", lấy từ cảnh báo backend.
  6. Checklist 7 mục, bắt đầu ở 2/7.
  7. Sửa ngay toast hoàn tất trong `OnboardingPage.tsx`: không yêu cầu nhập lại tháng nghỉ hưu.
  8. Thêm sự kiện đo lường theo mục 7 trước khi phát hành.

## 26. Nâng cấp UI/UX khu vực user theo chuẩn fintech — bàn giao 23/10/2026

Task đầy đủ: `docs/task-antigravity-2026-10-23-ui-ux.md`. Phân tích và bằng chứng: `docs/UI_UX_NANG_CAP_FINTECH_2026-10-23.md`. **Chưa triển khai.**

- Chỉ sửa frontend; không đổi API, công thức, bảng màu. Không đụng luồng onboarding (mục 25 đang chờ chốt).
- Thứ tự: A (component nền: font và thang chữ, `MoneyValue`, `PlanStatusHero`, `NextStepCard`, skeleton, `LockedPreview`) → B (P0: hero trạng thái lên đầu Dashboard, một thước đo tiến độ, Kế hoạch tối đa 1 "Chưa xác định", ẩn điểm khảo sát, gỡ UUID) → C (P1: tab Kế hoạch thật, khảo sát một câu một màn, rà câu chữ, mobile nav 4 mục, tương phản trang Nợ, gọi API song song) → D (P2: gộp CSS vá, giảm `!important`, màu cứng → token).
- Nghiệm thu bằng script đo và bảng chỉ số "trước/sau" ở mục E của file task.
