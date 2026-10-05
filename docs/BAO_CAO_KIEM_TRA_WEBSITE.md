# Báo cáo kiểm tra website An Hưu

Ngày kiểm tra: 01/10/2026. Phạm vi: mã nguồn và ứng dụng chạy cục bộ tại cổng 8446 trong thư mục `E:/An_Huu`.

**Kết luận:** giao diện tải được và thích ứng cơ bản với màn hình nhỏ, nhưng luồng dữ liệu và nhiều thao tác đang ở mức trình diễn. Chưa phù hợp để người dùng dựa vào các kết quả này lập kế hoạch tài chính thật. Các lỗi tính toán, xác nhận thành công không đúng thực tế và nội dung trợ lý AI cần được ưu tiên trước khi tiếp tục tinh chỉnh hình thức.

Đây là báo cáo kiểm tra, không có thay đổi mã sản phẩm trong lượt này.

## Phạm vi và cách kiểm tra

- Mở 30 đường dẫn ở 1440 × 1000 và 390 × 844; lưu 60 ảnh toàn trang.
- Quan sát giao diện máy tính và điện thoại, kiểm tra tiêu đề, ảnh, liên kết nội trang, lỗi JavaScript và tràn ngang.
- Thử các luồng xác thực, lưu hồ sơ, đổi giả định tài chính, đặt lại mô phỏng, lọc dữ liệu, đổi cài đặt, tạo nội dung và nhập giá trị không hợp lệ.
- Đối chiếu hành vi với mã nguồn để phân biệt lỗi giao diện với thao tác demo.
- Kiểm tra TypeScript: đạt. Không thấy lỗi JavaScript làm hỏng trang hay tràn ngang cấp trang trong 60 lượt mở.
- Đây không phải kiểm toán an ninh máy chủ, thẩm định mô hình tài chính hoặc xác minh các cam kết pháp lý. Không có bằng chứng trong phạm vi kiểm tra về dịch vụ email, OAuth, OTP, AI hoặc hệ thống lưu dữ liệu thật.

**Mức độ:** P1 = sửa trước khi dùng với người dùng/dữ liệu thật; P2 = lỗi chức năng hoặc khả năng sử dụng cần sửa; P3 = điểm chưa hợp lý về trình bày/nội dung. Một số chức năng chưa triển khai là giới hạn demo; lỗi nằm ở việc giao diện lại mô tả chúng như đã vận hành thật.

## Các lỗi cần ưu tiên

### 1. P1: Cùng thông số nhưng ba kết quả tài chính khác nhau

Trên `/user/simulation`, bấm **Đặt lại thông số ban đầu**:

| Thông số | Kế hoạch gốc | Mô phỏng đã đặt lại |
|---|---:|---:|
| Tuổi nghỉ hưu | 60 | 60 |
| Tích lũy/tháng | 14.200.000 đ | 14.200.000 đ |
| Chi tiêu tháng khi hưu | 22.000.000 đ | 22.000.000 đ |
| Lợi suất | 7,8% | 7,8% |
| Quỹ dự kiến | 6.120.000.000 đ | **17.292.041.235 đ** |

Biểu đồ trên `/user/dashboard` lại cho khoảng **21.380.110.416 đ** tại tuổi 60, trong khi chú thích ngay bên dưới ghi **6,12 tỷ**. Đường mục tiêu đạt **9,112 tỷ**, dù chú thích là **8,5 tỷ**.

Nguyên nhân: mỗi trang dùng công thức/dữ liệu riêng; biểu đồ dùng lợi suất 7,5%, đường mục tiêu nhân thêm 1,08 và nhánh sau nghỉ hưu quay về một giá trị cố định 6,12 tỷ. Cần một bộ tính chung, một tập giả định và dữ liệu đầu vào thống nhất, sau đó kiểm tra các bất biến giữa biểu đồ, thẻ số liệu và bảng so sánh.

Nguồn: [SimulationTrackingPage.tsx:16](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:16), [ProjectionWealthChart.tsx:24](E:/An_Huu/frontend/src/components/charts/ProjectionWealthChart.tsx:24). [Ảnh biểu đồ mâu thuẫn với chú thích](E:/An_Huu/frontend/responsive-audit/pages/evidence-dashboard-chart.png).

### 2. P1: Nhận định khả thi không phụ thuộc kết quả mô phỏng

Đặt tích lũy về **5 triệu/tháng**, tăng chi tiêu khi hưu lên **50 triệu/tháng**, giữ tuổi 58. Kết quả báo thiếu **11.237.313.965 đ**, điểm khả thi 42; phần nhận định vẫn nói **“hoàn toàn khả thi”**, **“đảm bảo 100% tài chính bền vững”**. Khi chọn tuổi 63, nhãn còn ghi **“sớm hơn -3 năm”**.

Cần sinh nhận định từ số liệu thực tế của kịch bản, thể hiện rõ giả định và xử lý riêng nghỉ sớm/đúng hạn/muộn.

Nguồn: [SimulationTrackingPage.tsx:285](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:285), [nhãn tuổi:84](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:84).

### 3. P1: Thay giả định không ảnh hưởng kết quả; mục tiêu không truyền sang kế hoạch

Trên `/user/goal`, đổi lạm phát từ 4% lên 20%, lợi suất từ 7,8% xuống 1%. Quỹ vẫn **8.712.000.000 đ**, tích lũy khuyến nghị vẫn **11.667.857 đ/tháng**. Chỉ dòng mô tả lợi suất thay đổi.

Đổi chi tiêu lên **38 triệu/tháng**: mục tiêu là **15.048.000.000 đ**. Bấm **Xem kế hoạch hành động chi tiết**: kế hoạch vẫn là **8,5 tỷ**, chi tiêu **22 triệu/tháng**. Nhập chi tiêu **-1 triệu** được chấp nhận, tạo quỹ **-396 triệu** và khuyến nghị tích lũy **1 đ/tháng**.

Cần sử dụng các giả định trong công thức, kiểm tra miền giá trị và truyền dữ liệu qua một hồ sơ/kế hoạch chung.

Nguồn: [RetirementGoalPage.tsx:9](E:/An_Huu/frontend/src/pages/RetirementGoalPage.tsx:9), [RetirementPlanPage.tsx:33](E:/An_Huu/frontend/src/pages/RetirementPlanPage.tsx:33).

### 4. P1: Luồng xác thực chỉ mô phỏng nhưng hiển thị như thật

- Chưa đăng nhập vẫn mở được `/admin/users` và xem dữ liệu mẫu. Đây có thể là chủ đích của demo, nhưng không thể giữ nguyên khi nối dữ liệu thật; cần tách đường dẫn demo và kiểm tra quyền ở máy chủ.
- Bấm **Đăng nhập nhanh với Google** đăng nhập thẳng `user@demo.com`, không qua Google.
- Bỏ **Ghi nhớ đăng nhập** nhưng thông tin phiên vẫn được ghi vào localStorage.
- Đăng ký tài khoản mới, đi qua xác minh, rồi dùng tài khoản đó đăng nhập: bị báo sai email/mật khẩu vì không có bước tạo tài khoản.
- Để trống OTP vẫn vào được onboarding.
- Để trống mã đặt lại mật khẩu, nhập hai mật khẩu giống nhau: báo **“Mật khẩu đã được cập nhật”**.
- Nhập `abc` vào email quên mật khẩu rồi bấm gửi: báo **“Đã gửi email”** tới `abc`.

Cần ghi rõ thao tác mô phỏng khi chưa có dịch vụ thật, loại bỏ báo thành công giả, rồi hoàn thiện xác thực/OTP/đổi mật khẩu và phân quyền.

Nguồn: [App.tsx:93](E:/An_Huu/frontend/src/App.tsx:93), [AuthContext.tsx:65](E:/An_Huu/frontend/src/context/AuthContext.tsx:65), [AuthPages.tsx:262](E:/An_Huu/frontend/src/pages/AuthPages.tsx:262), [xác minh:751](E:/An_Huu/frontend/src/pages/AuthPages.tsx:751), [đặt lại mật khẩu:588](E:/An_Huu/frontend/src/pages/AuthPages.tsx:588).

### 5. P1: Báo đã lưu/cập nhật nhưng dữ liệu không được giữ

- Onboarding: đổi tuổi 32 → 45, bấm **Lưu nháp**, tải lại và mở bước cá nhân: tuổi quay về 32. Dòng **“Tự động lưu bản nháp theo thời gian thực”** không phản ánh hành vi thực tế.
- Tài khoản: đổi họ tên, lưu, tải lại: trở về Nguyễn Minh An.
- Trong tab bảo mật của tài khoản, không nhập mật khẩu nào rồi bấm **Đổi mật khẩu** vẫn hiện thông báo cập nhật thành công.
- **Áp dụng kịch bản này** chỉ mở thông báo và chuyển trang; kế hoạch không nhận dữ liệu mới.
- Các màn hình quản trị cũng dùng dữ liệu trong bộ nhớ trang; lưu nội dung, tham số, nguồn AI hoặc phản hồi không tạo lưu trữ bền vững.

Cần có trạng thái lưu thật: đang lưu, thành công, thất bại; chỉ xác nhận thành công sau khi dữ liệu được lưu. Hồ sơ, mục tiêu, kế hoạch và mô phỏng phải cùng đọc một nguồn dữ liệu.

Nguồn: [OnboardingPage.tsx:97](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:97), [AccountPage.tsx:26](E:/An_Huu/frontend/src/pages/AccountPage.tsx:26), [SimulationTrackingPage.tsx:297](E:/An_Huu/frontend/src/pages/SimulationTrackingPage.tsx:297).

### 6. P1/P2: Trang trợ lý AI chứa nội dung kiểm thử và che nội dung trên điện thoại

Tin nhắn mở đầu kể việc kiểm tra **30 đường dẫn, 8 kích thước**, cập nhật đăng nhập/menu và tránh xung đột thư mục dự án. Đây là ghi chú phát triển website, không phù hợp với tư vấn tài chính cho khách hàng.

Phản hồi hiện lấy từ vài nhánh từ khóa rồi trả câu viết sẵn; các mô tả **“dữ liệu tài chính thời gian thực”**, **“đã cập nhật dự báo”** chưa tương ứng một luồng xử lý thật. Bảng bên phải còn hiện `Outputs`, `Local preview`, tài liệu nội bộ và liên kết chia sẻ chat.

Ở 390px, bảng nguồn mặc định mở và phủ lên phần lớn hội thoại. Cần đóng mặc định trên điện thoại, mở theo yêu cầu và xử lý như ngăn riêng; nội dung tư vấn và các điều khiển phải tiếp cận được bằng bàn phím.

Nguồn: [AIAssistantPage.tsx:29](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:29), [phản hồi từ khóa:86](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:86), [bảng nguồn:450](E:/An_Huu/frontend/src/pages/AIAssistantPage.tsx:450). [Ảnh trên điện thoại](E:/An_Huu/frontend/responsive-audit/pages/evidence-ai-mobile.png).

### 7. P2: Bố cục tiêu đề onboarding bị áp nhầm quy tắc

Ở desktop 1440px, tiêu đề bước đầu bị ép còn khoảng **120px**, thành 5 dòng; nhãn bước chỉ còn **32px**. Lỗi vẫn xuất hiện trên điện thoại.

`.step-heading` nằm trực tiếp trong `.welcome-points`, nên bị áp dụng `.welcome-points > div { display: flex; ... }`. Quy tắc dành cho hàng biểu tượng + mô tả lại áp vào toàn bộ tiêu đề. Cần tách lớp cho hàng nội dung hoặc giới hạn selector.

Nguồn: [OnboardingPage.tsx:235](E:/An_Huu/frontend/src/pages/OnboardingPage.tsx:235), [index.css:836](E:/An_Huu/frontend/src/index.css:836). [Ảnh lỗi](E:/An_Huu/frontend/responsive-audit/pages/evidence-onboarding.png).

### 8. P1/P2: Quản trị chấp nhận dữ liệu sai và hiển thị sai đối tượng

- `/admin/users/NO-SUCH-USER` vẫn hiển thị hồ sơ **Nguyễn Minh An**, vì không tìm thấy ID thì lấy người đầu tiên. Cần trạng thái không tìm thấy; không được thay bằng người khác.
- Tạo nội dung mới, để trống mọi trường, bấm **Tạo và lưu**: xuất hiện **“Nội dung mới chưa đặt tên”**, trạng thái **“Đã xuất bản”**. Cần kiểm tra dữ liệu và mặc định bản nháp.
- Điều chỉnh lạm phát về **-100%**, nhập lý do và xác nhận: hệ thống nhận giá trị và ghi lịch sử. Cần kiểm tra miền hợp lệ theo từng tham số, không chỉ kiểm tra đó là số.

Nguồn: [AdminCorePages.tsx:614](E:/An_Huu/frontend/src/pages/admin/AdminCorePages.tsx:614), [AdminBusinessPages.tsx:681](E:/An_Huu/frontend/src/pages/admin/AdminBusinessPages.tsx:681), [AdminAIConfigPages.tsx:656](E:/An_Huu/frontend/src/pages/admin/AdminAIConfigPages.tsx:656).

## Rà soát từng trang

| Trang | Mức | Lỗi và điểm chưa hợp lý |
|---|---|---|
| Trang chủ `/` | P2/P3 | Các bài kiến thức dẫn sang đăng ký thay vì nội dung; email/số điện thoại ở footer là nút không có hành động. Thẻ giá trị lớn có khoảng trống đáng kể. Các cam kết bảo mật, kiểm định, kết nối đối tác cần bằng chứng và trạng thái rõ hơn so với chức năng hiện có. |
| Chọn demo `/demo` | P3 | Có ghi rõ demo, là điểm phù hợp. Tuy nhiên nhãn “10 màn hình hoàn thiện” dễ khiến người xem nghĩ các chức năng đã xong, trong khi nhiều nút chỉ mô phỏng. Nên dùng “màn hình minh họa”. |
| Đăng nhập `/login` | P1/P2 | Google thực chất vào tài khoản mẫu; bỏ ghi nhớ vẫn lưu phiên. Trên điện thoại không có logo/liên kết về trang chủ như các trang xác minh. Font tiêu đề serif khác phong cách chính của website. |
| Đăng ký `/register` | P1/P2 | Không tạo tài khoản có thể đăng nhập. Đồng ý điều khoản được chọn sẵn và văn bản không có liên kết đọc điều khoản/chính sách. |
| Quên mật khẩu `/forgot-password` | P1/P2 | Email không hợp lệ `abc` vẫn được báo đã gửi. Chưa có gửi email thật; nhãn hành động gây hiểu nhầm. |
| Đặt lại mật khẩu `/reset-password` | P1 | Mã được điền sẵn, để trống cũng báo đổi thành công. Không kiểm tra mã hoặc cập nhật mật khẩu của tài khoản. |
| Xác minh `/verify` | P1 | OTP điền sẵn; xóa hết vẫn xác nhận được. Không hiện email đích, không có kiểm tra mã/hết hạn thực tế. |
| Khai báo hồ sơ `/onboarding` | P1/P2 | Lưu nháp không giữ dữ liệu; tiêu đề bước đầu vỡ bố cục. Hoàn tất không truyền hồ sơ sang dashboard. Lời hứa 3 phút ở trang chủ và 5–7 phút ở đây không thống nhất. |
| Tổng quan `/user/dashboard` | P1/P2 | Biểu đồ khoảng 21,38 tỷ nhưng thẻ/chú thích 6,12 tỷ. Năm cơ sở 2025 và mốc 2053 cố định; hồ sơ/giả định ở các trang khác không đồng bộ. |
| Mục tiêu `/user/goal` | P1 | Lạm phát và lợi suất không tham gia công thức. Cho chi tiêu âm. Mục tiêu mới không được truyền sang kế hoạch. |
| Kế hoạch `/user/plan` | P1/P2 | Báo “cập nhật tự động theo mục tiêu mới nhất” nhưng số liệu cố định. Nút PDF chỉ hiện thông báo. Cần thống nhất tiền theo giá hiện tại/giá tương lai với trang mục tiêu và AI. |
| Mô phỏng & theo dõi `/user/simulation` | P1/P2 | Đặt lại cùng đầu vào nhưng kết quả khác kế hoạch; nhận định khả thi cố định; áp dụng không lưu. Tuổi 63 ghi “sớm hơn -3 năm”. Tab theo dõi dùng số liệu mẫu và một số điều khiển chưa gắn hành động. |
| Trợ lý AI `/user/assistant` | P1/P2 | Nội dung kiểm thử lọt vào hội thoại; trả lời theo từ khóa; bảng nguồn che nội dung trên điện thoại. Nhiều chi tiết công cụ phát triển không có ích cho khách hàng hưu trí. |
| Kiến thức `/user/explore` | P2 | Chọn chủ đề chỉ đổi nút đang chọn, danh sách không lọc. Đọc bài/xem giải pháp chỉ mở hộp thông báo. Ảnh bên ngoài có tải chậm trong kiểm tra nhưng tải được sau khi chờ, không kết luận là ảnh hỏng. |
| Tài khoản `/user/account` | P1/P2 | Lưu hồ sơ không bền vững; đổi mật khẩu trống báo thành công; 2FA chỉ là công tắc. Xuất/xóa dữ liệu chưa thực hiện thật. Email mẫu khác tài khoản demo đang đăng nhập. |
| Tổng quan admin `/admin/dashboard` | P2 | Chỉ số cố định, không đồng bộ với trang báo cáo: 12.480/12.482 người dùng, 8.920/8.946 hồ sơ, 7.640/7.215 kế hoạch. Cần cùng mốc thời gian và định nghĩa chỉ số nếu muốn so sánh. |
| Danh sách người dùng `/admin/users` | P2 | Bộ lọc có xử lý dữ liệu mẫu. Xuất Excel chỉ báo đang xuất; nút phân trang không có xử lý chuyển trang và không vô hiệu hóa khi chỉ có một trang. |
| Chi tiết người dùng `/admin/users/:userId` | P1/P2 | ID sai mở hồ sơ người đầu tiên. Đổi tab chỉ đổi tab được chọn, nội dung vẫn giữ nguyên. Tiến độ 72% và tích lũy 14,2 triệu cố định cho các hồ sơ. |
| Tư vấn `/admin/consultations` | P2 | Có thể gán “Đã xếp lịch” nhưng không có trường lịch hẹn có cấu trúc để kiểm tra ngày/giờ. Chỉ đổi ghi chú/trạng thái trong bộ nhớ; nút xuất chưa thực hiện. |
| Quản lý nội dung `/admin/content` | P1/P2 | Cho xuất bản bài trống; form chưa có phần nội dung bài viết/video thật. Thay đổi không được lưu bền vững và không cập nhật sang trang kiến thức. |
| Đối tác `/admin/partners` | P2 | Công tắc hiển thị chỉ đổi danh sách trong trang admin, chưa chi phối trang giải pháp người dùng; tải lại mất trạng thái. Chưa thể kiểm chứng chức năng “đang hiển thị cho người dùng” từ thao tác này. |
| Quản trị AI `/admin/ai` | P2 | “Tải lên tài liệu mới” chưa có hành động. Đồng bộ chỉ chờ rồi đổi trạng thái; sửa quy tắc không ảnh hưởng trợ lý đang dùng phản hồi viết sẵn. |
| Cấu hình tài chính `/admin/financial-config` | P1 | Nhận lạm phát -100%; các tham số không nối với bộ tính ở trang người dùng. Thông báo tính lại 14.250 kế hoạch/lưu vĩnh viễn chưa có cơ chế thực hiện trong mã được kiểm tra. |
| Hỗ trợ `/admin/support` | P2 | Phản hồi, mẫu và thông báo chỉ cập nhật trạng thái cục bộ. “Đã gửi” không tương ứng gửi tới người dùng; cần ghi rõ mô phỏng hoặc nối dịch vụ gửi. |
| Báo cáo `/admin/reports` | P2 | Chọn 30 ngày vẫn giữ số liệu và biểu đồ tháng 3–8; chỉ thay phụ đề. Nút xuất báo cáo chưa có xử lý. |
| Cài đặt chung `/admin/settings/general` | P2 | Chọn English tự trở lại Tiếng Việt; múi giờ cũng dùng giá trị cố định. Nút lưu chỉ bật nhãn “Đã lưu”. Bảo trì chưa chặn thao tác ghi thực tế. |
| Tích hợp `/admin/settings/integrations` | P2 | Bật đồng bộ đối tác nhưng vẫn ghi “Chưa kết nối”. Cần phân biệt yêu cầu bật, đã xác thực kết nối, lỗi và đang đồng bộ; hiện chưa có quy trình kết nối dịch vụ. |
| Cài đặt thông báo `/admin/settings/notifications` | P2 | Chọn Hàng tuần tự trở lại Hàng ngày. Kênh/tần suất chưa nối với gửi thông báo và không được giữ sau tải lại. |
| Quyền riêng tư `/admin/settings/privacy` | P2 | Chọn lưu hồ sơ 10 năm tự trở lại 5 năm; thời gian lưu audit cũng cố định. Các lựa chọn phê duyệt/xử lý dữ liệu chỉ là trạng thái giao diện. |
| Nhật ký `/admin/settings/audit-log` | P2 | Lọc Bảo mật vẫn hiện đủ 5 dòng mọi loại; nhật ký không nhận các thay đổi vừa làm ở trang cài đặt. Xuất nhật ký chưa có hành động. |

## Các điểm chung về trải nghiệm và trình bày

1. **Tìm kiếm toàn hệ thống và chuông người dùng chưa có kết quả/hành động.** Ô tìm kiếm cho phép gõ nhưng không gắn hàm tìm; chuông người dùng không có sự kiện mở thông báo. Cần hoạt động thật hoặc ghi rõ trạng thái chưa có dữ liệu/chưa hỗ trợ. Nguồn: [UserLayout.tsx:104](E:/An_Huu/frontend/src/pages/UserLayout.tsx:104), [AdminApp.tsx:357](E:/An_Huu/frontend/src/AdminApp.tsx:357).
2. **Thông tin mẫu chưa được biểu thị nhất quán.** Trang demo và thanh đầu trang admin có nhãn minh họa; phần tài chính người dùng và xác thực lại nói như xử lý dữ liệu thật. Cần một cách biểu thị demo thống nhất ở nơi người dùng đưa ra quyết định.
3. **Màu biểu đồ chưa hoàn toàn theo bảng màu mới.** Trên mã hiện tại, nhiều đường/tooltip dùng trực tiếp navy `#153A52`, sage `#6F9B7C`, vàng `#D9A85E`, trong khi chú giải dùng biến màu mới. Đường và dấu chú giải có thể lệch màu. Nguồn: [ProjectionWealthChart.tsx:199](E:/An_Huu/frontend/src/components/charts/ProjectionWealthChart.tsx:199), [FundGrowthChart.tsx](E:/An_Huu/frontend/src/components/charts/FundGrowthChart.tsx).
4. **Thứ bậc thông tin trên điện thoại cần gọn hơn.** Vòng 72% trên dashboard/kế hoạch và các thẻ thống kê admin chiếm nhiều chiều cao, đẩy dữ liệu và việc cần làm xuống xa. Các trang cài đặt còn cần cuộn qua danh sách 5 mục trước khi đến form. Đây là đề xuất UX, không phải lỗi tràn màn hình.
5. **Chi tiết nhỏ và chữ kỹ thuật gây nhiễu.** Nhiều đoạn phụ cỡ 10–12px, các mã U05/AD08 và nhãn “Vector Index”, “Outputs” xuất hiện trong giao diện. Cần giảm mã nội bộ trên luồng khách hàng và kiểm tra khả năng đọc với người lớn tuổi.
6. **Ngôn ngữ và thời gian chưa thống nhất.** Xen kẽ “On track”, “Worked for”, “Outputs”, “Local preview” với tiếng Việt; dữ liệu 2025 đi cùng “hôm nay” và năm sinh tính theo thời gian hiện tại. Nên cố định rõ ngày của bộ dữ liệu demo hoặc đồng bộ theo ngày hiện hành.
7. **Không nên lấy việc qua kiểm tra bố cục làm bằng chứng nghiệp vụ đúng.** Các kiểm tra hiện có chủ yếu đảm bảo đường dẫn, tiêu đề, menu và không tràn ngang. Cần bổ sung kiểm tra kết quả tài chính, dữ liệu được giữ sau tải lại, đăng ký→đăng nhập, giả định→kế hoạch và bộ lọc→kết quả khi sửa các lỗi trên.

## Thứ tự khắc phục đề xuất

1. Thống nhất mô hình tài chính và dữ liệu hồ sơ giữa mục tiêu, kế hoạch, mô phỏng và biểu đồ; xử lý đầu vào sai, sửa nhận định cố định.
2. Tách demo khỏi luồng thật; hoàn thiện xác thực/phân quyền; chỉ báo lưu/gửi thành công khi thực hiện được.
3. Sửa nội dung trợ lý AI, bố cục onboarding và bảng nguồn AI trên điện thoại.
4. Hoàn thiện bộ lọc, tab chi tiết, cài đặt, xuất tệp và đồng bộ admin→người dùng.
5. Rà lại chữ, màu biểu đồ, thứ bậc nội dung trên mobile, các cam kết và mốc thời gian.

## Bằng chứng lưu kèm

- [Dữ liệu 60 lượt mở trang](E:/An_Huu/frontend/responsive-audit/pages/audit.json).
- [Kết quả thử thao tác lượt đầu](E:/An_Huu/frontend/responsive-audit/pages/interactions.json).
- [Kết quả xác minh bổ sung](E:/An_Huu/frontend/responsive-audit/pages/followup.json).
- [Đăng ký→đăng nhập và tab chi tiết admin](E:/An_Huu/frontend/responsive-audit/pages/final-probes.json).

Các mục có lỗi bộ chọn hoặc thời gian chờ trong nhật ký thử nghiệm không được tự động tính là lỗi website; các kết luận tương ứng trong báo cáo được dựa vào lượt xác minh bổ sung hoặc đối chiếu mã nguồn. Ảnh chụp biểu đồ minh chứng được chờ hoàn tất chuyển động trước khi kết luận.
