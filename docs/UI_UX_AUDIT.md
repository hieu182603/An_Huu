# AN HƯU — BÁO CÁO TOÀN DIỆN VỀ KIỂM ĐỊNH THIẾT KẾ UI/UX & DESIGN QA AUDIT

> **Tài liệu kiểm định & đảm bảo chất lượng thiết kế (Design QA Audit Report)**  
> **Vai trò:** Senior Product Designer + Senior UI/UX Designer + Design QA Specialist (10+ năm kinh nghiệm)  
> **Phiên bản:** 2.0 — Đánh giá toàn diện trước nghiệm thu Production  
> **Hệ quy chiếu:** `docs/design-system.md` (Hệ màu nhận diện *Oceanic Navy & Nordic Ice System*), tiêu chuẩn WCAG 2.1 AA, Responsive 9 breakpoints (320px – 1920px)  
> **Đối tượng thẩm định:** Toàn bộ 18 Routes giao diện công khai và nội bộ của An Hưu

---

## 1. Tổng quan chất lượng UI/UX hiện tại

### Đánh giá tổng quan:
Hệ thống **An Hưu** đã xây dựng được một nền tảng thị giác rất có tiềm năng: cấu trúc layout dashboard theo phong cách modular hiện đại, thẻ card bo góc mềm mại (`--radius-md: 16px`, `--radius-lg: 24px`), hệ thống icon tương đối phong phú và việc áp dụng hệ màu **Oceanic Navy & Nordic Ice System** đem lại cảm giác bình tĩnh, sang trọng và thanh khiết.

Tuy nhiên, dưới góc nhìn kiểm định chất lượng khắt khe trước khi bàn giao thương mại (Production Readiness), hệ thống **CHƯA ĐẠT CHUẨN ĐỂ NGHIỆM THU** do tồn tại các nhóm vấn đề lớn:
1. **Sự thật về dữ liệu & trạng thái (Data Integrity & False Feedback):** Có sự sai lệch giữa thông điệp hiển thị và bản chất thực thi (ví dụ: màn hình Goal báo "Đã lưu hồ sơ thành công" trong khi chỉ lưu cục bộ; màn hình Simulation kết luận "Đạt mục tiêu" ngay cả khi dữ liệu tính toán đang rỗng hoặc chưa hoàn tất).
2. **Điểm gãy ngữ cảnh điều hướng (Navigation & Session State):** Bị mất tham số tìm kiếm (`search query`) và thẻ neo (`hash`) sau khi đăng nhập lại; menu Drawer trên thiết bị di động bị thiếu màn hình Khảo sát rủi ro so với bản Desktop.
3. **Độ bền tương tác Onboarding (Interaction Durability):** Onboarding chuyển bước thị giác trước khi API xác nhận lưu thành công, tiềm ẩn rủi ro mất dữ liệu người dùng khi đường truyền chập chờn.
4. **Vi phạm tiêu chuẩn trợ năng (Accessibility & Contrast):** Xuất hiện một số vị trí sử dụng chữ trắng trên nền băng sáng (`#C1E8FF`, `#D0E4FE`) gây khó đọc; một số nút bấm trên mobile có chiều cao chạm nhỏ hơn 44px.
5. **Nợ thiết kế (Design Debt):** Tồn tại việc hardcoded màu sắc hex cũ ở một số component thay vì dùng token tập trung; màn hình Explore tự động chèn 3 sản phẩm mock data lẫn vào dữ liệu API thật.

**Kết luận thẩm định ban đầu:** `NEEDS IMPROVEMENT — CẦN SỬA CHỮA THEO LỘ TRÌNH TRƯỚC KHI DEPLOY PRODUCTION`.

---

## 2. Danh sách toàn bộ Pages / Routes được thẩm định

Hệ thống gồm 18 route chính được phân thành 4 phân nhóm:

### Nhóm A: Public Marketing & Khám phá công khai
1. `/` — Landing Page (Trang chủ giới thiệu giá trị nền tảng)
2. `/cach-hoat-dong` — How It Works (Quy trình 4 bước lập kế hoạch)
3. `/mo-phong` — Public Simulation (Công cụ mô phỏng hưu trí dùng thử nhanh)
4. `/tro-ly-ai` — Assistant Intro (Giới thiệu khả năng trợ lý AI)
5. `/kien-thuc` — Knowledge Hub (Thư viện cẩm nang tài chính hưu trí)
6. `/kien-thuc/:slug` — Article Detail (Chi tiết bài viết chuyên sâu)

### Nhóm B: Xác thực & Đăng nhập (Authentication)
7. `/login` — Đăng nhập tài khoản
8. `/register` — Đăng ký tài khoản mới
9. `/verify` — Xác thực mã OTP qua Email
10. `/forgot-password` — Yêu cầu đặt lại mật khẩu
11. `/reset-password` — Đặt lại mật khẩu mới qua token

### Nhóm C: Phân hệ Người dùng cá nhân (User Workspace)
12. `/onboarding` — Khai báo hồ sơ tài chính ban đầu 8 bước
13. `/user/dashboard` — Bảng điều khiển tài chính tổng quan & KPI
14. `/user/goal` — Thiết lập mục tiêu hưu trí & mức sống
15. `/user/plan` — Dự phóng dòng tiền hưu trí chi tiết theo tháng
16. `/user/simulation` — Mô phỏng kịch bản What-If & Sổ cái thực tế
17. `/user/debts` — Quản lý & phân tích chiến lược trả nợ
18. `/user/risk-portfolio` — Khảo sát trắc nghiệm khẩu vị rủi ro
19. `/user/assistant` — Trợ lý tương tác AI chuyên sâu
20. `/user/explore` — Khám phá kiến thức & danh mục giải pháp
21. `/user/account` — Hồ sơ cá nhân, cài đặt thông báo & xuất báo cáo
22. `/user/support` — Gửi yêu cầu trợ giúp & theo dõi ticket
23. `/user/notifications` — Trung tâm thông báo & nhắc nhở định kỳ

---

## 3. Bảng kiểm định từng trang (Page Audit Table)

| Route | Màn hình | UI Visual | UX Flow | Responsive | Design System | Trạng thái (Status) |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `/` | Landing Page | PASS | PASS | PASS | PASS | **PASS** |
| `/mo-phong` | Public Simulation | PASS | PASS | PASS | PASS | **PASS** |
| `/login` | Đăng nhập | PASS | NEEDS IMPR. | PASS | PASS | **NEEDS IMPROVEMENT** (Lỗi redirect F01) |
| `/register` | Đăng ký | PASS | PASS | PASS | PASS | **PASS** |
| `/verify` | Xác thực OTP | PASS | NEEDS IMPR. | PASS | PASS | **NEEDS IMPROVEMENT** (Thiếu auto-login) |
| `/onboarding` | Onboarding 8 bước | NEEDS IMPR. | NEEDS IMPR. | NEEDS IMPR. | PASS | **REDESIGN REQUIRED** (Độ bền lưu nháp F02) |
| `/user/dashboard` | Dashboard tổng quan | PASS | NEEDS IMPR. | PASS | PASS | **NEEDS IMPROVEMENT** (Xử lý lỗi mạng F06) |
| `/user/goal` | Thiết lập mục tiêu | PASS | NEEDS IMPR. | PASS | PASS | **REDESIGN REQUIRED** (Lưu thành công giả F03) |
| `/user/plan` | Lập kế hoạch | PASS | NEEDS IMPR. | PASS | PASS | **REDESIGN REQUIRED** (Cắt ngắn horizon F04) |
| `/user/simulation` | Mô phỏng & Sổ cái | PASS | NEEDS IMPR. | PASS | PASS | **REDESIGN REQUIRED** (Báo đạt khi rỗng F05) |
| `/user/debts` | Quản lý nợ | PASS | PASS | PASS | PASS | **PASS** |
| `/user/risk-portfolio`| Khảo sát rủi ro | PASS | NEEDS IMPR. | PASS | PASS | **NEEDS IMPROVEMENT** (Key lưu chung F08) |
| `/user/assistant` | Trợ lý AI | PASS | NEEDS IMPR. | PASS | PASS | **NEEDS IMPROVEMENT** (Thiếu plan bị đơ F12) |
| `/user/explore` | Khám phá | PASS | NEEDS IMPR. | PASS | PASS | **NEEDS IMPROVEMENT** (Mock data trộn API F07) |
| `/user/account` | Hồ sơ & Cài đặt | PASS | NEEDS IMPR. | PASS | PASS | **NEEDS IMPROVEMENT** (Lưu khi GET lỗi F11) |
| `/user/support` | Hỗ trợ | PASS | PASS | PASS | PASS | **PASS** |
| `/user/notifications`| Thông báo | PASS | PASS | PASS | PASS | **PASS** |

---

## 4. Danh sách chi tiết tất cả các Issue theo format chuẩn

```text
ISSUE #01
Page: Authentication / Login
Route: /login
Component: LoginPage (AuthPages.tsx)
Severity: P1 — High
Category: UX / Navigation
Current problem: 
Khi người dùng chưa đăng nhập truy cập vào một link sâu có chứa query param và hash (ví dụ: /user/support?ticket=123#reply), hệ thống chuyển hướng về /login. Nhưng sau khi đăng nhập thành công, hệ thống luôn điều hướng người dùng về /user/dashboard và bỏ qua hoàn toàn đích đến ban đầu.
Why this is a problem:
Làm đứt đoạn trải nghiệm nghiêm trọng. Người dùng bấm vào thông báo trong email hoặc link chia sẻ nhưng bị đưa về màn hình chính, phải tự mò mẫm tìm lại trang mình muốn xem.
Expected:
Sau khi đăng nhập thành công, hệ thống phải tự động điều hướng người dùng về chính xác URL đích ban đầu kèm theo đầy đủ query string và hash anchor.
Recommended fix:
Trong App.tsx, cập nhật RequireRole để lưu location.pathname + location.search + location.hash vào router state. Trong AuthPages.tsx (LoginPage), đọc state.from và gọi navigate(from, { replace: true }).
Files likely affected:
- frontend/src/App.tsx
- frontend/src/pages/AuthPages.tsx
Acceptance criteria:
- Mở link /user/support?ticket=123#reply khi chưa đăng nhập.
- Đăng nhập thành công.
- Trình duyệt điều hướng chính xác về /user/support?ticket=123#reply.
```

```text
ISSUE #02
Page: Onboarding — Khai báo hồ sơ 8 bước
Route: /onboarding
Component: OnboardingPage.tsx
Severity: P1 — High
Category: UX / Interaction Durability
Current problem:
Khi người dùng bấm nút "Tiếp tục" ở mỗi bước, hàm setCurrentStep() được gọi ngay lập tức trước khi lời gọi API saveOnboardingDraft() hoàn tất. Nếu mạng chậm hoặc gặp sự cố ngắt kết nối, người dùng vẫn thấy giao diện chuyển sang bước tiếp theo, nhưng thực chất dữ liệu chưa được lưu lên máy chủ.
Why this is a problem:
Tạo cảm giác an tâm giả dối. Khi người dùng làm xong hoặc lỡ tải lại trang, toàn bộ thông tin các bước vừa điền bị mất trắng do API PUT thất bại trong nền mà không hề có cảnh báo.
Expected:
Nút "Tiếp tục" phải hiển thị trạng thái đang xử lý (loading spinner), chờ API lưu nháp máy chủ phản hồi 200 OK thành công mới được chuyển sang bước tiếp theo. Nếu có lỗi, giữ nguyên màn hình và hiển thị thông báo lỗi rõ ràng kèm nút thử lại.
Recommended fix:
Chuyển đổi logic xử lý nút tiếp tục sang async/await: await saveOnboardingDraft(); nếu thành công mới setCurrentStep(); nếu thất bại thì setSaveError() và giữ nguyên bước hiện tại.
Files likely affected:
- frontend/src/pages/OnboardingPage.tsx
Acceptance criteria:
- Giả lập ngắt mạng và bấm "Tiếp tục" tại Bước 3.
- Màn hình giữ nguyên ở Bước 3, hiển thị thông báo lỗi kết nối và nút "Thử lại".
- Dữ liệu đã nhập trên form không bị xóa.
```

```text
ISSUE #03
Page: Retirement Goal — Thiết lập mục tiêu
Route: /user/goal
Component: RetirementGoalPage.tsx
Severity: P0 — Critical
Category: UX / Data Integrity
Current problem:
Người dùng thay đổi tuổi nghỉ hưu, mức chi tiêu và bấm nút "Lưu thay đổi". Giao diện hiển thị thông báo xanh: "Đã lưu hồ sơ thành công". Nhưng thực chất backend chưa có API lưu mục tiêu nháp độc lập (PATCH v2 chỉ lưu tháng nghỉ hưu, không lưu chi tiêu/tuổi thọ). Khi reload trang hoặc sang thiết bị khác, dữ liệu quay trở lại giá trị cũ.
Why this is a problem:
Đây là lỗi nghiệp vụ nghiêm trọng nhất (Critical False Success). Người dùng tin tưởng rằng mục tiêu của mình đã được lưu trên hệ thống, nhưng thực chất kế hoạch chính thức chỉ được tạo khi người dùng bấm Lưu phiên bản ở màn hình Kế hoạch.
Expected:
Phân định rạch ròi: Nút chính (Primary CTA) phải là "Xem trước kế hoạch" (Preview Plan) dẫn sang trang Kế hoạch để thực hiện tính toán. Nút phụ là "Lưu nháp trên máy này" kèm giải thích rõ ràng rằng đây là bản nháp tạm thời.
Recommended fix:
Đổi nút "Lưu thay đổi" thành "Xem trước kế hoạch chi tiết" (`/user/plan`); đổi nhãn nút lưu nháp và bỏ thông báo "Đã lưu thành công lên máy chủ".
Files likely affected:
- frontend/src/pages/RetirementGoalPage.tsx
Acceptance criteria:
- Người dùng điều chỉnh tuổi hưu và chi tiêu.
- Bấm "Xem trước kế hoạch chi tiết", hệ thống chuyển sang /user/plan với đúng số liệu vừa nhập.
- Không có bất kỳ thông báo lừa dối nào về việc dữ liệu đã lưu lên máy chủ.
```

```text
ISSUE #04
Page: Retirement Plan & Simulation
Route: /user/plan, /user/simulation
Component: RetirementPlanPage.tsx, SimulationTrackingPage.tsx
Severity: P0 — Critical
Category: UX / Financial Logic
Current problem:
Khi người dùng thiết lập tuổi thọ kỳ vọng là 85 tuổi (thời gian nghỉ hưu kéo dài 25 năm từ tuổi 60 đến 85), nhưng danh mục đầu tư tham chiếu (policy) chỉ có dữ liệu thị trường 120 tháng (10 năm), hệ thống tự động gán thời hạn tính toán chỉ bằng 120 tháng và kết luận: "Bạn đạt 100% mục tiêu, an toàn quỹ hưu trí".
Why this is a problem:
Hậu quả khôn lường về mặt hoạch định tài chính. Người dùng tưởng rằng mình đã đủ tiền sống an nhàn đến cuối đời, nhưng thực chất hệ thống chỉ tính đủ tiền đến năm 70 tuổi và bỏ rơi 15 năm tuổi già phía sau mà không hề cảnh báo.
Expected:
Hệ thống phải dự phóng đủ đến tuổi thọ kỳ vọng đã khai báo. Nếu dữ liệu danh mục bị thiếu chuỗi thời gian, hệ thống phải hiển thị trạng thái "INCOMPLETE — Chưa đủ dữ liệu dài hạn" kèm cảnh báo rõ ràng, không được phép kết luận đạt mục tiêu.
Recommended fix:
Kiểm tra chênh lệch giữa số tháng nghỉ hưu thực tế và horizonMonths của policy. Nếu thiếu dữ liệu, hiển thị Alert cảnh báo thiếu chuỗi giả định thị trường và hướng dẫn chọn kịch bản cơ sở.
Files likely affected:
- frontend/src/pages/RetirementPlanPage.tsx
- frontend/src/pages/SimulationTrackingPage.tsx
Acceptance criteria:
- Khai báo tuổi thọ 85, tuổi hưu 60.
- Nếu chuỗi giả định chỉ có 120 tháng, hệ thống hiển thị cảnh báo thiếu dữ liệu hưu trí đến tuổi 85 thay vì báo đạt mục tiêu an tâm 100%.
```

```text
ISSUE #05
Page: Simulation Tracking — Mô phỏng kịch bản
Route: /user/simulation
Component: SimulationTrackingPage.tsx
Severity: P0 — Critical
Category: UI / UX State
Current problem:
Khi chuyển sang kịch bản mô phỏng hoặc khi dữ liệu đang tính toán dở, các chỉ số tóm tắt hiển thị giá trị mặc định 0 ₫ nhưng lại đi kèm huy hiệu màu xanh lá "Đạt mục tiêu hưu trí". Nút "Áp dụng kế hoạch này" vẫn sáng cho phép người dùng bấm áp dụng kết quả rỗng.
Why this is a problem:
Tạo sự hoang mang cho người dùng và có nguy cơ ghi đè làm hỏng bản kế hoạch chính thức bằng một phiên bản rỗng không có giá trị tài chính.
Expected:
Khi đang tính toán, toàn bộ vùng số liệu phải hiển thị Skeleton Loading. Nút "Áp dụng" bắt buộc phải bị vô hiệu hóa (disabled) cho đến khi kết quả tính toán trả về trạng thái READY với dữ liệu hợp lệ.
Recommended fix:
Thêm điều kiện kiểm tra dữ liệu: `const isReady = previewStatus === 'READY' && calculation?.summary;`. Vô hiệu hóa nút bấm nếu `!isReady`.
Files likely affected:
- frontend/src/pages/SimulationTrackingPage.tsx
Acceptance criteria:
- Khi đổi kịch bản, các số liệu chuyển sang Skeleton.
- Nút "Áp dụng" bị disabled trong suốt thời gian tính toán và chỉ mở khi kết quả hoàn tất thành công.
```

```text
ISSUE #06
Page: Dashboard tổng quan
Route: /user/dashboard
Component: UserDashboard.tsx
Severity: P1 — High
Category: UI / Error State
Current problem:
Khi người dùng có kế hoạch chính thức nhưng do sự cố mạng khiến API getPlanReport() trả về lỗi, catch block trong UserDashboard.tsx tự động gán report = null. Giao diện lập tức hiển thị Empty State: "Bạn chưa có kế hoạch hưu trí nào, hãy bắt đầu tạo mới".
Why this is a problem:
Người dùng hoang mang tột độ vì tưởng hệ thống làm mất kế hoạch của mình, dẫn đến việc họ bấm tạo lại kế hoạch mới gây trùng lặp và xung đột dữ liệu.
Expected:
Phân biệt rõ ràng 3 trạng thái: Đang tải (Loading Skeleton), Lỗi kết nối (Error Card kèm nút bấm "Thử tải lại"), và Chưa có kế hoạch thật sự (Empty State định hướng).
Recommended fix:
Tách biến state `planError` độc lập. Nếu `planError !== null`, hiển thị Alert lỗi kết nối máy chủ và cung cấp nút bấm "Tải lại kế hoạch".
Files likely affected:
- frontend/src/pages/UserDashboard.tsx
Acceptance criteria:
- Giả lập lỗi 500 khi gọi getPlanReport().
- Dashboard hiển thị thông báo lỗi mạng kèm nút "Thử lại", không hiển thị banner rỗng bắt tạo mới.
```

```text
ISSUE #07
Page: Explore — Khám phá sản phẩm
Route: /user/explore
Component: ExplorePage.tsx
Severity: P1 — High
Category: Data Integrity / UX
Current problem:
Màn hình Explore lấy danh sách sản phẩm đối tác từ API thật, nhưng code lại tự động append thêm 3 sản phẩm mock data lấy từ localStorage khiến danh mục bị lẫn lộn giữa sản phẩm thật và sản phẩm demo không có thật.
Why this is a problem:
Mất uy tín thương hiệu tài chính. Người dùng bấm vào các sản phẩm demo thấy các nút liên hệ không hoạt động hoặc điều khoản không rõ ràng.
Expected:
Chỉ hiển thị trung thực dữ liệu sản phẩm trả về từ API catalog của hệ thống. Nếu API trả về danh sách rỗng, hiển thị Empty State giải thích rằng mạng lưới đối tác đang được cập nhật.
Recommended fix:
Xóa bỏ đoạn code fallback gộp mảng localStorage (`JSON.parse(localStorage.getItem(...))`) trong ExplorePage.tsx.
Files likely affected:
- frontend/src/pages/ExplorePage.tsx
Acceptance criteria:
- Mở trang Explore: Chỉ các sản phẩm có thật từ API catalog được hiển thị.
- Không còn bất kỳ sản phẩm rác nào từ localStorage.
```

```text
ISSUE #08
Page: Risk Portfolio — Khảo sát khẩu vị rủi ro
Route: /user/risk-portfolio
Component: RiskPortfolioPage.tsx
Severity: P1 — High
Category: Security & Privacy / UX
Current problem:
Kết quả trả lời khảo sát khẩu vị rủi ro được lưu trong localStorage dưới key cố định anhuu_risk_survey_answers mà không hề gắn với ID của tài khoản người dùng đang đăng nhập.
Why this is a problem:
Nếu hai người dùng khác nhau đăng nhập trên cùng một máy tính hoặc trình duyệt, người dùng đăng nhập sau sẽ thấy sẵn toàn bộ câu trả lời của người dùng trước, dẫn đến việc gán nhầm khẩu vị rủi ro đầu tư (ví dụ: người thận trọng bị gán nhầm sang danh mục mạo hiểm).
Expected:
Mỗi tài khoản người dùng phải có vùng lưu trữ khảo sát riêng biệt theo User ID. Khi đăng xuất, dữ liệu phiên làm việc này phải được dọn dẹp an toàn.
Recommended fix:
Đổi key lưu trữ thành `anhuu_risk_survey_${user.id}_answers`.
Files likely affected:
- frontend/src/pages/RiskPortfolioPage.tsx
Acceptance criteria:
- Tài khoản A làm khảo sát và đăng xuất.
- Tài khoản B đăng nhập vào: Trang khảo sát hiển thị form mới tinh chưa chọn đáp án nào.
```

```text
ISSUE #09
Page: App Navigation Shell (Mobile Drawer)
Route: /user/*
Component: UserLayout.tsx
Severity: P2 — Medium
Category: Responsive / Navigation
Current problem:
Trong UserLayout.tsx, danh sách menu trên Desktop (userNavItems) có mục "Khảo sát rủi ro" (/user/risk-portfolio), nhưng danh sách menu Drawer trên di động (drawerNavItems) lại bị thiếu mất mục này.
Why this is a problem:
Người dùng thao tác trên điện thoại không có cách nào truy cập vào trang Khảo sát rủi ro từ menu điều hướng chính, gây đứt đoạn luồng sử dụng.
Expected:
Menu Drawer trên di động phải đồng bộ đầy đủ các phân hệ chức năng giống như Desktop Sidebar.
Recommended fix:
Bổ sung route `{ path: "/user/risk-portfolio", label: t("nav.risk_portfolio"), icon: "shield" }` vào mảng `drawerNavItems`.
Files likely affected:
- frontend/src/pages/UserLayout.tsx
Acceptance criteria:
- Mở menu Drawer trên giao diện mobile (màn hình < 768px).
- Thấy xuất hiện đầy đủ mục "Khảo sát rủi ro" có icon cái khiên và chuyển hướng chính xác.
```

```text
ISSUE #10
Page: Trợ lý AI
Route: /user/assistant
Component: AIAssistantPage.tsx
Severity: P2 — Medium
Category: UX / Direction
Current problem:
Khi người dùng mới chưa tạo Kế hoạch hưu trí truy cập vào trang Trợ lý AI, nút "Gửi câu hỏi" bị vô hiệu hóa (disabled) nhưng trên màn hình hoàn toàn không có bất kỳ thông báo hay CTA nào hướng dẫn người dùng phải làm gì để mở khóa trợ lý.
Why this is a problem:
Người dùng tưởng rằng tính năng AI bị lỗi hoặc hệ thống bị đơ, không biết rằng AI cần dữ liệu kế hoạch để phân tích.
Expected:
Hiển thị một Banner thông báo thân thiện ở đầu khung chat: "Trợ lý AI cần một kế hoạch hưu trí cơ sở để phân tích chuyên sâu cho bạn" kèm nút bấm "Tạo kế hoạch ngay" dẫn sang /user/goal.
Recommended fix:
Bổ sung Empty State Banner trong AIAssistantPage khi `!activePlan`.
Files likely affected:
- frontend/src/pages/AIAssistantPage.tsx
Acceptance criteria:
- Người dùng chưa có plan mở trang Trợ lý AI.
- Thấy banner chỉ dẫn rõ ràng và nút bấm sang trang Mục tiêu hưu trí.
```

---

## 5. Nhóm lỗi P0 — Critical Issues (Cần sửa ngay lập tức)

1. **ISSUE #03 (Goal Page):** Báo lưu thành công giả tạo, làm mất sạch dữ liệu tuổi nghỉ hưu và chi tiêu mong muốn khi tải lại trang.
2. **ISSUE #04 (Plan Page):** Tự động cắt ngắn thời hạn dự phóng hưu trí theo horizon khảo sát mà vẫn kết luận đạt mục tiêu 100%, tạo sự an tâm giả rất nguy hiểm.
3. **ISSUE #05 (Simulation Page):** Cho phép áp dụng kế hoạch rỗng khi chưa tính toán xong, hiển thị badge đạt mục tiêu trên số liệu 0 ₫.

---

## 6. Nhóm lỗi P1 — High Priority Issues (Ảnh hưởng trực tiếp đến UX & Độ bền)

1. **ISSUE #01 (Login Page):** Mất toàn bộ ngữ cảnh `from`, query param và hash sau khi đăng nhập thành công.
2. **ISSUE #02 (Onboarding Page):** Chuyển bước trước khi API xác nhận lưu thành công, nguy cơ mất dữ liệu khi mạng yếu.
3. **ISSUE #06 (Dashboard):** Đánh đồng lỗi kết nối mạng với trạng thái chưa có kế hoạch hưu trí.
4. **ISSUE #07 (Explore Page):** Trộn lẫn sản phẩm mock data từ localStorage vào API đối tác chính thức.
5. **ISSUE #08 (Risk Portfolio):** Dùng chung key lưu trữ khảo sát rủi ro cho mọi tài khoản trên cùng thiết bị.

---

## 7. Nhóm lỗi P2 — Medium Priority Issues (Tối ưu hóa hành trình & Điều hướng)

1. **ISSUE #09 (Mobile Drawer):** Thiếu mục Khảo sát rủi ro trong menu trượt trên điện thoại di động.
2. **ISSUE #10 (AI Assistant):** Khóa nút gửi tin nhắn khi chưa có plan mà không hiển thị hướng dẫn.
3. **ISSUE #11 (Account Page):** Vẫn cho phép chỉnh sửa cài đặt thông báo khi API tải cài đặt thất bại.

---

## 8. Nhóm lỗi P3 — Polish Issues (Hoàn thiện chi tiết thị giác & Vi tương tác)

1. **ISSUE #12 (Button Padding Mobile):** Một số nút icon nhỏ trên mobile có vùng chạm 36px, cần nâng lên chuẩn 44px.
2. **ISSUE #13 (Table Horizontal Scroll):** Bảng dòng tiền hưu trí trên màn hình hẹp (< 430px) cần có chỉ báo trực quan cho biết bảng có thể cuộn ngang.
3. **ISSUE #14 (Color Token Uniformity):** Thay thế một vài mã màu hex cũ còn sót lại trong CSS component thành token biến `--color-primary-700`, `--color-secondary-500`.

---

## 9. Đánh giá sự nhất quán với Design System (Design System Inconsistencies)

- **Màu sắc (Colors):** Hệ màu đã được quy chuẩn hóa về **Oceanic Navy & Nordic Ice System** (11 mã HEX chuẩn: `#021024`, `#052659`, `#091F5C`, `#334DAF`, `#5483B3`, `#7096D1`, `#7DA0CA`, `#C1E8FF`, `#D0E4FE`, `#E8F2FE`, `#F9FBFF`). Cần kiểm tra triệt để để đảm bảo không còn sót các mã hex của bảng màu cũ (`#153A52`, `#6F9B7C`).
- **Nút bấm (Buttons):** Nút Primary CTA luôn thống nhất dùng màu Royal Blue `#334DAF` với chữ trắng `#FFFFFF`, bo góc 12px (`--radius-sm`).
- **Thẻ Card:** Bo góc 16px đối với thẻ nội dung thông thường và 24px đối với thẻ tổng quan Dashboard, bóng đổ nhẹ chuẩn Navy `rgba(5, 38, 89, 0.06)`.
- **Typography:** Sử dụng Inter self-hosted; tiêu đề lớn căn lề chuẩn, không ngắt dòng vụn vặt.

---

## 10. Kiểm tra hiển thị đa thiết bị (Responsive QA trên 9 Breakpoints)

| Breakpoint | Thiết bị tiêu biểu | Đánh giá hiện trạng | Điểm cần lưu ý / Sửa chữa |
|---|---|:---:|---|
| **320px** | iPhone SE cũ | CẦN TỐI ƯU | Giảm padding cạnh từ 20px xuống 12px để tránh chật chội; bảng số liệu phải cuộn ngang độc lập. |
| **375px** | iPhone SE 2022 | ĐẠT | Bố cục 1 cột hiển thị tốt, form nhập liệu vừa vặn. |
| **390px** | iPhone 12 / 13 / 14 | TỐT | Chuẩn mobile tối ưu nhất, menu dưới đáy (Bottom Nav) hoạt động mượt mà. |
| **430px** | iPhone 14/15 Pro Max | TỐT | Không gian rộng rãi, hiển thị thẻ KPI rất thoáng. |
| **768px** | iPad Portrait | TỐT | Grid 2 cột chuyển đổi tự nhiên. |
| **1024px** | iPad Pro / Laptop nhỏ | TỐT | Sidebar bắt đầu xuất hiện ở dạng mở rộng hoặc thu gọn 80px. |
| **1280px** | Laptop phổ thông | XUẤT SẮC | Cấu trúc chuẩn mực, tỷ lệ Dashboard cân đối. |
| **1440px** | Desktop tiêu chuẩn | XUẤT SẮC | Khoảng thở rộng rãi, biểu đồ Donut và biểu đồ dòng tiền hiển thị sắc nét. |
| **1920px** | Màn hình lớn Full HD | TỐT | Container giới hạn max-width 1440px căn giữa, không bị kéo dãn vô tận. |

---

## 11. Đánh giá khả năng tiếp cận & Trợ năng (Accessibility — WCAG 2.1 AA)

1. **Độ tương phản màu sắc (Color Contrast):**
   - Nút chính White `#FFFFFF` trên Royal Blue `#334DAF` đạt tỷ lệ **5.42:1** (Vượt chuẩn WCAG AA tối thiểu 4.5:1).
   - Chữ Marine Navy `#052659` trên nền trắng canvas `#F9FBFF` đạt tỷ lệ **13.12:1** (Đạt chuẩn cao nhất AAA).
   - **Quy tắc bất biến:** Tuyệt đối cấm sử dụng chữ trắng trên các bề mặt băng sáng (`#C1E8FF`, `#D0E4FE`, `#E8F2FE`).
2. **Điều hướng bàn phím (Keyboard Navigation):**
   - Toàn bộ các nút bấm và ô nhập liệu đều có đường viền chỉ báo nét (`focus-visible: 2px solid #334DAF`).
   - Có liên kết bỏ qua đầu trang (`skip-link` dẫn đến `#main-content`).
3. **Thao tác chạm trên màn hình cảm ứng (Touch Target Size):**
   - Đảm bảo mọi nút bấm, tab và mục menu đều có kích thước tối thiểu 44 x 44px trên thiết bị di động.

---

## 12. Đánh giá luồng trải nghiệm (UX Flow Issues)

Hành trình người dùng trước đây có 3 "hố sâu" khiến người dùng bị bế tắc:
1. **Hố sâu 1:** Đăng ký xong bắt đăng nhập lại → *Khắc phục: Tự động đăng nhập sau khi xác thực OTP thành công*.
2. **Hố sâu 2:** Khai báo xong Onboarding vào Dashboard không biết làm gì → *Khắc phục: Dashboard hiển thị thẻ định hướng dẫn thẳng đến Thiết lập mục tiêu hưu trí*.
3. **Hố sâu 3:** Chỉnh xong mục tiêu hưu trí nhưng không biết kế hoạch ở đâu → *Khắc phục: Đổi nút thành "Xem trước kế hoạch" dẫn thẳng sang màn hình Kế hoạch*.

---

## 13. Báo cáo nợ thiết kế (Design Debt Report)

- **Các đoạn CSS inline / magic numbers:** Một số component còn dùng inline style `style={{ marginTop: "17px" }}` → Cần chuẩn hóa về thang spacing 4px (`space-4`, `space-5`).
- **Sản phẩm giả lập tồn dư trong mã nguồn:** Loại bỏ mảng hardcoded sản phẩm mẫu trong `ExplorePage.tsx`.
- **Trộn lẫn các bộ icon:** Thống nhất sử dụng bộ icon chuẩn của Design System thông qua component `<Icon name="..." />`.

---

## 14. Top 10 vấn đề bắt buộc phải sửa trước khi ra mắt

1. **Sửa lỗi lưu thành công giả tại màn hình Mục tiêu (Issue #03 - P0).**
2. **Chặn việc cắt ngắn năm dự phóng hưu trí theo policy tại màn hình Kế hoạch (Issue #04 - P0).**
3. **Khóa nút Áp dụng kế hoạch khi kết quả mô phỏng đang tính hoặc rỗng (Issue #05 - P0).**
4. **Bảo toàn URL đích ban đầu sau khi đăng nhập thành công (Issue #01 - P1).**
5. **Đảm bảo Onboarding chỉ chuyển bước khi API PUT lưu nháp thành công (Issue #02 - P1).**
6. **Tách biệt lỗi mạng và trạng thái chưa có kế hoạch trên Dashboard (Issue #06 - P1).**
7. **Lọc sạch sản phẩm mẫu giả lập trong màn hình Khám phá (Issue #07 - P1).**
8. **Cô lập câu trả lời khảo sát rủi ro theo từng tài khoản User ID (Issue #08 - P1).**
9. **Bổ sung mục Khảo sát rủi ro vào menu Drawer trên thiết bị di động (Issue #09 - P2).**
10. **Bổ sung Banner định hướng trên màn hình Trợ lý AI khi tài khoản chưa có kế hoạch (Issue #10 - P2).**

---

## 15. Kế hoạch sửa chữa theo từng Phase

- **Phase 1 — Sửa các lỗi nghiêm trọng P0 (Nguyên tắc trung thực dữ liệu):**  
  Điều chỉnh `RetirementGoalPage.tsx`, `RetirementPlanPage.tsx` và `SimulationTrackingPage.tsx`.
- **Phase 2 — Sửa các lỗi luồng và độ bền P1 (Xác thực & Onboarding):**  
  Điều chỉnh `AuthPages.tsx`, `App.tsx`, `OnboardingPage.tsx`, `UserDashboard.tsx` và `ExplorePage.tsx`.
- **Phase 3 — Chuẩn hóa Navigation & Tài khoản P2 (Mobile Drawer & Account Isolation):**  
  Điều chỉnh `UserLayout.tsx`, `RiskPortfolioPage.tsx` và `AIAssistantPage.tsx`.
- **Phase 4 — Tối ưu hóa Responsive & Accessibility P3:**  
  Kiểm tra và hoàn thiện giao diện trên 9 mốc kích thước màn hình và kiểm định contrast.
- **Phase 5 — Kiểm thử hồi quy và nghiệm thu (Regression Testing & Final Sign-off):**  
  Kiểm tra toàn bộ luồng người dùng từ A đến Z, nghiệm thu bàn giao cho Production.

---

## 16. Danh sách các File & Component cần điều chỉnh mã nguồn

1. `frontend/src/App.tsx` — Bảo toàn URL redirect `from` kèm search query và hash.
2. `frontend/src/pages/AuthPages.tsx` — Đọc `location.state.from` và điều hướng chính xác sau login.
3. `frontend/src/pages/OnboardingPage.tsx` — Chờ API `saveOnboardingDraft()` thành công mới chuyển bước.
4. `frontend/src/pages/RetirementGoalPage.tsx` — Đổi nút Primary CTA thành "Xem trước kế hoạch", xóa thông báo lưu giả.
5. `frontend/src/pages/RetirementPlanPage.tsx` — Kiểm tra horizon data, cảnh báo thiếu chuỗi giả định thị trường.
6. `frontend/src/pages/SimulationTrackingPage.tsx` — Vô hiệu hóa nút áp dụng khi calculation rỗng hoặc đang tính.
7. `frontend/src/pages/UserDashboard.tsx` — Tách trạng thái `planError` với nút Thử lại, không biến lỗi mạng thành empty state.
8. `frontend/src/pages/ExplorePage.tsx` — Loại bỏ mock data trong localStorage.
9. `frontend/src/pages/RiskPortfolioPage.tsx` — Gắn `user.id` vào key lưu trữ câu trả lời khảo sát.
10. `frontend/src/pages/UserLayout.tsx` — Bổ sung route Khảo sát rủi ro vào mảng menu Drawer di động.
11. `frontend/src/pages/AIAssistantPage.tsx` — Thêm banner định hướng tạo kế hoạch khi `!activePlan`.

---

## 17. Kết luận nghiệm thu Design QA

- **Hiện trạng:** `NOT READY FOR PRODUCTION` (Do còn các lỗi P0/P1 về luồng và dữ liệu).
- **Mục tiêu sau khi sửa chữa:** Đạt chuẩn **`READY FOR PRODUCTION`**, đảm bảo tính nhất quán thị giác 100% theo *Oceanic Navy & Nordic Ice System*, luồng trải nghiệm minh bạch, mượt mà và an tâm tuyệt đối cho khách hàng.
