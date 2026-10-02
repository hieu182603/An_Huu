# AN HƯU — FIGMA MAKE AI TASK PLAN

> Tài liệu này dùng để giao việc cho Figma Make AI theo **14 Phase tuần tự**.  
> **Không được thực hiện nhiều Phase song song hoặc gộp tất cả vào một lần thiết kế.**  
> Hãy hoàn thành từng Phase theo đúng thứ tự **1 → 14**. Khi một Phase hoàn tất và đã tự kiểm tra, **tự động chuyển sang Phase tiếp theo**.  
> **Bắt buộc giữ nguyên toàn bộ code, frame, component, variable, style và cấu trúc đã tạo ở các Phase trước; chỉ mở rộng hoặc chỉnh sửa có kiểm soát, tuyệt đối không xóa/ghi đè công việc cũ nếu không thật sự cần để sửa lỗi.**

---

# GLOBAL INSTRUCTION — ÁP DỤNG CHO TOÀN BỘ 14 PHASE

Bạn là **Senior Product Designer / UI UX Designer** chuyên thiết kế **SaaS, Fintech và Financial Planning Platform**.

Bạn sẽ thiết kế website/web application **AN HƯU** — nền tảng hỗ trợ người dùng lập kế hoạch nghỉ hưu dài hạn.

## 1. Nguồn thiết kế bắt buộc

Tôi đã cung cấp file:

`design-system.md`

Trước khi thiết kế bất kỳ giao diện nào:

1. Đọc toàn bộ file `design-system.md`.
2. Phân tích đầy đủ:
   - Brand principles
   - Color tokens
   - Typography
   - Spacing
   - Grid
   - Radius
   - Shadow
   - Components
   - Buttons
   - Forms
   - Cards
   - Navigation
   - Tables
   - Charts
   - Status
   - Responsive rules
   - Accessibility
   - User UI rules
   - Admin UI rules
3. Xem `design-system.md` là **SINGLE SOURCE OF TRUTH** cho toàn bộ UI.

### Tuyệt đối không tự ý tạo
- màu mới,
- font mới,
- radius mới,
- spacing tùy ý,
- shadow tùy ý,
- style button mới,
- style input mới,
- style card mới,

nếu Design System đã định nghĩa.

Nếu một component chưa được định nghĩa hoàn toàn, hãy mở rộng dựa trên component gần nhất trong Design System thay vì tạo phong cách mới.

---

## 2. Phong cách tổng thể

Phong cách giao diện:

**Modern Financial SaaS Dashboard**  
+ **Clean Minimal**  
+ **Premium**  
+ **Trustworthy**  
+ **Friendly**  
+ **Data-focused**

Tham chiếu về bố cục:

- Dashboard SaaS hiện đại.
- Modular card layout.
- Card lớn bo góc mềm.
- White space rộng.
- Layout sạch.
- Ít đường viền nặng.
- Hierarchy rõ ràng.
- Data visualization dễ đọc.
- Navigation tối giản.
- Các module có cảm giác như những khối độc lập nhưng thuộc cùng một hệ thống.

### Không thiết kế theo phong cách
- banking enterprise cứng nhắc,
- quá corporate,
- quá nhiều bảng,
- quá nhiều border,
- gradient mạnh,
- neon,
- glassmorphism quá mức,
- dashboard dày đặc thông tin,
- giao diện giống phần mềm kế toán.

An Hưu phải tạo cảm giác:

**An tâm → Dễ hiểu → Đáng tin cậy → Có kế hoạch → Có tương lai**

---

## 3. Brand Color

Màu thương hiệu chính:

- **Navy:** `#173B57`
- **Sage:** `#91B5A1`
- **Cream:** `#F7F5EF`
- **Mist:** `#D9E5DE`

Phải sử dụng đúng semantic color token được định nghĩa trong `design-system.md`.

### Nguyên tắc
**NAVY**
- Primary action
- Heading
- Navigation
- Important numbers
- Selected state

**SAGE**
- Positive
- Progress
- Secondary visual
- Supporting data
- Soft accent

**CREAM**
- Main soft background
- Section background
- Warm neutral surface

**MIST**
- Secondary surface
- Information background
- Subtle container
- Supporting state

Không biến toàn bộ giao diện thành màu xanh.

Background chính vẫn phải sáng, sạch và có nhiều white space.

---

## 4. Product Structure

Hệ thống **CHỈ CÓ 2 ROLE**:

- `USER`
- `ADMIN`

Không thiết kế:
- Advisor
- Super Admin
- Consultant role
- Staff role
- hoặc bất kỳ role mới nào.

---

## 5. User Experience

USER là khách hàng sử dụng An Hưu để:

- khai báo tài chính,
- xác định mục tiêu nghỉ hưu,
- nhận kế hoạch nghỉ hưu,
- mô phỏng các kịch bản,
- theo dõi tiến độ,
- sử dụng AI,
- tìm hiểu kiến thức và giải pháp tài chính,
- quản lý tài khoản.

Trải nghiệm phải đơn giản.

Người dùng có thể không có kiến thức tài chính chuyên sâu.

Vì vậy:

**KHÔNG** trình bày quá nhiều thuật ngữ tài chính cùng lúc.

Ưu tiên:
- visual explanation,
- progress,
- simple charts,
- summary,
- recommendation,
- clear CTA.

---

## 6. Admin Experience

ADMIN sử dụng hệ thống để:

- quản lý user,
- xem hồ sơ và kế hoạch,
- quản lý yêu cầu tư vấn,
- quản lý nội dung,
- quản lý đối tác,
- quản lý sản phẩm tài chính,
- quản lý AI,
- cấu hình tài chính,
- hỗ trợ người dùng,
- xem báo cáo,
- quản lý system settings.

Admin UI có thể data-dense hơn User UI nhưng vẫn phải:

- clean,
- scannable,
- structured,
- consistent.

---

## 7. Responsive

Ưu tiên thiết kế **Desktop trước**.

Desktop reference width:

`1440 px`

Trong Phase 1–12, ưu tiên Desktop và không tự tạo toàn bộ mobile.

Responsive chỉ được triển khai ở **Phase 13**, sau khi toàn bộ màn hình Desktop của các Phase trước đã hoàn thành.

---

## 8. Component-first

Không thiết kế mỗi màn hình như một artwork riêng.

Phải xây dựng bằng reusable component.

Ví dụ:

- Button
- Input
- Select
- Date Picker
- Tabs
- Badge
- Avatar
- Progress
- Card
- Metric Card
- Chart Card
- Empty State
- Alert
- Modal
- Drawer
- Table
- Pagination
- Search
- Filter
- Sidebar
- Topbar

Các component giống nhau phải sử dụng cùng:

- height,
- radius,
- spacing,
- typography,
- interaction state.

---

## 9. Figma Structure

Tổ chức file Figma rõ ràng:

```text
00 Foundations
01 Components
02 User
03 Admin
04 Responsive
05 Prototype
```

Đặt tên frame và component rõ ràng.

Ví dụ:

```text
USER / Dashboard / Desktop
USER / Retirement Plan / Desktop
ADMIN / Users / Desktop
```

Không đặt:

```text
Frame 123
Group 99
Rectangle 101
```

---

## 10. Auto Layout

Bắt buộc ưu tiên:

- Auto Layout
- Components
- Variants
- Variables
- Styles

Không sử dụng layout thủ công nếu Auto Layout có thể xử lý.

Thiết kế phải có khả năng đưa sang frontend dễ dàng.

---

## 11. Quy tắc thực hiện tuần tự & bảo toàn công việc

**KHÔNG ĐƯỢC thiết kế nhiều Phase cùng lúc hoặc làm song song.**

Dự án được chia thành 14 Phase và phải thực hiện tuần tự:

`PHASE 1 → PHASE 2 → ... → PHASE 14`

Với mỗi Phase:

1. Chỉ tập trung vào scope của Phase hiện tại.
2. Hoàn thành đầy đủ các màn hình/component được yêu cầu.
3. Tự kiểm tra consistency với `design-system.md` và các Phase trước.
4. Giữ nguyên toàn bộ code, frame, component, variable, style và cấu trúc đã tạo.
5. Không xóa, reset, regenerate hoặc thay thế toàn bộ phần đã hoàn thành ở Phase trước.
6. Nếu cần sửa phần cũ để đồng bộ, chỉ chỉnh đúng phần cần thiết và phải giữ nguyên behavior/cấu trúc không liên quan.
7. Sau khi Phase hiện tại hoàn tất, **tự động chuyển sang Phase kế tiếp**.

### Quy tắc NO-REGRESSION bắt buộc

- Mọi Phase mới phải **xây tiếp trên kết quả hiện có**, không bắt đầu lại từ đầu.
- Reuse component đã tạo trước đó thay vì tạo bản duplicate.
- Không xóa component cũ chỉ vì Phase mới cần variant khác; hãy mở rộng bằng variant/property phù hợp.
- Không thay đổi token Design System đã dùng ổn định nếu không có xung đột rõ ràng.
- Không đổi tên hàng loạt frame/component đã được tạo ở Phase trước.
- Không làm mất prototype link, interaction, variable, style hoặc Auto Layout đã thiết lập.
- Không xóa dữ liệu mẫu hoặc nội dung cần thiết của màn hình cũ.
- Trước khi chuyển Phase, xác nhận nội bộ rằng Phase vừa làm không phá vỡ UI trước đó.

---

## 12. Trước và sau mỗi Phase

### Trước khi thiết kế

1. Đọc lại `design-system.md`.
2. Kiểm tra toàn bộ component đã có.
3. Reuse component nếu có.
4. Chỉ tạo component mới khi thật sự cần.
5. Kiểm tra consistency với các Phase trước.
6. Xác định chính xác những file/frame/component nào sẽ được thêm mới và những phần nào chỉ cần reuse.

### Sau khi hoàn thành

1. Tự QA Phase vừa làm.
2. Kiểm tra không có regression ở các Phase trước.
3. Không xóa hoặc reset code/frame/component cũ.
4. Giữ nguyên nền tảng đã tạo và **tiếp tục sang Phase kế tiếp**.

---

# PHASE 1 — DESIGN FOUNDATION & APP SHELL

## Mục tiêu

Xây dựng nền móng UI cho toàn bộ An Hưu để những Phase sau sử dụng lại.

## 1. Foundations

Tạo:

- Color styles / variables
- Typography styles
- Spacing system
- Grid
- Radius
- Shadow
- Icon sizing
- Container rules

Tất cả phải lấy từ `design-system.md`.

Không tự sáng tạo token mới nếu không cần thiết.

## 2. Core Components

Tạo reusable components:

### Button
- Primary
- Secondary
- Ghost
- Destructive
- Disabled
- Loading

### Form
- Input
- Textarea
- Select
- Search
- Checkbox
- Radio
- Switch

### General
- Badge / Status
- Avatar
- Tooltip
- Progress Bar
- Tabs
- Breadcrumb
- Modal
- Drawer
- Dropdown
- Pagination
- Alert / Notification
- Empty State
- Skeleton Loading

## 3. Data Components

Chuẩn bị:

- Metric Card
- Basic Content Card
- Progress Card
- Chart Container
- Table
- Table Toolbar
- Search + Filter Bar

Chưa cần đưa dữ liệu nghiệp vụ phức tạp.

## 4. User App Shell

Thiết kế cấu trúc navigation cho User:

- Sidebar / Navigation
- Topbar
- Page Header
- Content Container

Có trạng thái:

- Default
- Hover
- Active
- Collapsed nếu phù hợp

## 5. Admin App Shell

Thiết kế:

- Admin Sidebar
- Admin Topbar
- Admin Page Header
- Admin Content Layout

Admin có thể density cao hơn User một chút.

## Output

Phase này chỉ gồm:

- Foundations
- Components
- User App Shell
- Admin App Shell

### Không thiết kế
- Dashboard
- Financial Profile
- Retirement Plan
- AI Assistant
- Admin Dashboard
- User Management

**Sau khi hoàn thành và tự QA: giữ nguyên toàn bộ kết quả Phase 1, sau đó tiếp tục PHASE 2.**

---

# PHASE 2 — PUBLIC WEBSITE & AUTHENTICATION

Đọc lại `design-system.md` và reuse toàn bộ component từ Phase 1.

Không thay đổi Design System.

Chỉ thiết kế:

- `U01 — Landing / Homepage`
- `U02 — Authentication`

## Authentication gồm
- Login
- Register
- Forgot Password
- Reset Password
- Verification

## Landing Page

Thiết kế Homepage An Hưu theo phong cách:

- Premium
- Financial planning
- Trustworthy
- Calm
- Modern

### Các section chính
- Hero
- Value proposition
- How An Hưu works
- Retirement planning benefits
- Simple financial visualization
- AI assistant introduction
- Knowledge / education preview
- Trust section
- Primary CTA
- Footer

Không biến Landing Page thành một trang ngân hàng.

Hero cần tạo cảm giác:

> “Chuẩn bị hôm nay cho một tương lai an tâm.”

Sử dụng financial visualization nhẹ nhàng:

- progress,
- projection chart,
- retirement timeline,
- saving goal.

Không dùng stock dashboard quá phức tạp ở Hero.

## Authentication

Login/Register phải:

- simple,
- friendly,
- low cognitive load.

Form rộng vừa phải.

Có clear hierarchy giữa:

- Heading
- Description
- Form
- Primary CTA
- Secondary action

## Output

Chỉ làm:

- Landing
- Login
- Register
- Forgot Password
- Reset Password
- Verification

**Sau khi hoàn thành và tự QA: giữ nguyên toàn bộ kết quả hiện có, sau đó tiếp tục PHASE 3.**

---

# PHASE 3 — USER ONBOARDING & FINANCIAL PROFILE

Đọc lại `design-system.md`.

Reuse components và patterns từ Phase 1–2.

Chỉ thiết kế:

`U03 — Thiết lập hồ sơ tài chính`

## Mục tiêu UX

Người dùng phải có thể nhập dữ liệu tài chính mà không cảm thấy:

- phức tạp,
- nặng nề,
- giống khai báo kế toán.

Thiết kế onboarding dạng từng bước.

## Flow đề xuất

```text
Welcome
→ Thông tin cá nhân
→ Thu nhập
→ Chi tiêu
→ Tài sản
→ Khoản nợ
→ Đầu tư
→ BHXH / bảo hiểm
→ Summary
```

Có:

- Step indicator
- Progress
- Back
- Continue
- Save draft

## Financial Input

Sử dụng:

- Financial input
- Currency input
- Number input
- Select
- Slider chỉ khi thực sự phù hợp
- Helper text
- Inline explanation

Với các khái niệm khó hiểu, sử dụng tooltip hoặc helper text.

## Summary

Trang cuối hiển thị:

- Monthly Income
- Monthly Expense
- Total Assets
- Total Debt
- Investment
- Estimated Net Worth

Sử dụng card và visualization đơn giản.

Không tạo chart quá phức tạp.

## Output

Chỉ thiết kế onboarding/hồ sơ tài chính.

Không thiết kế Dashboard hay Retirement Plan.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 4.**

---

# PHASE 4 — USER DASHBOARD

Đọc lại `design-system.md`.

Reuse App Shell và components đã có.

Thiết kế:

`U04 — USER DASHBOARD / TỔNG QUAN`

## Mục tiêu

Dashboard phải trả lời ngay 4 câu hỏi:

1. Tình hình tài chính của tôi hiện tại thế nào?
2. Tôi đang cách mục tiêu nghỉ hưu bao xa?
3. Kế hoạch có đang đúng hướng không?
4. Tôi nên làm gì tiếp theo?

## Layout

Áp dụng modular dashboard tương tự reference style đã cung cấp:

- large rounded cards,
- clean white surfaces,
- soft background,
- clear grid,
- comfortable spacing,
- data visualization.

## Nội dung

Có thể gồm:

- Welcome / Page Header
- Retirement Readiness Score
- Current Net Worth
- Target Retirement Fund
- Current Retirement Fund
- Monthly Saving Target vs Actual Cashflow (Tiết kiệm mục tiêu vs Dòng tiền thực tế)
- Quick Action: Ghi nhận thu chi tháng này
- Retirement Goal Progress
- Projection Chart
- Current Financial Snapshot
- AI Insight Card
- Important Alert
- Next Recommended Action
- Recent Activity

## Visual Priority

Có **1 primary insight lớn**.

Không để 10 card có importance giống nhau.

Retirement Progress phải nổi bật nhất.

Charts phải:

- simple,
- clear,
- labelled,
- accessible.

Không sử dụng chart chỉ để trang trí.

## Output

Chỉ thiết kế User Dashboard.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 5.**

---

# PHASE 5 — RETIREMENT GOAL & PLAN

Đọc lại `design-system.md`.

Chỉ thiết kế:

- `U05 — Mục tiêu nghỉ hưu`
- `U06 — Kế hoạch nghỉ hưu`

## Retirement Goal

Cho phép user xác định:

- Current age
- Target retirement age
- Desired monthly lifestyle
- Expected retirement spending
- **Tham số vĩ mô (Lạm phát & Lợi suất kỳ vọng):** *Hệ thống tự động tính toán và hiển thị chuẩn mực (System-calculated Card), tuyệt đối KHÔNG để người dùng tự nhập.*

UI phải làm cho các con số dễ hiểu.

Có thể sử dụng:

- summary card,
- timeline,
- progress,
- age marker.

## Retirement Plan

Đây là màn hình **CỐT LÕI** của sản phẩm.

Hiển thị rõ:

- Số tiền cần khi nghỉ hưu
- Số tiền dự kiến có
- Khoản thiếu
- Số tiền cần tích lũy hàng tháng
- Số năm còn lại
- Progress toward retirement
- Projected fund growth

## Hierarchy

Primary result phải được nhìn thấy ngay.

Secondary details đặt phía dưới.

Có AI explanation:

> “Điều này có nghĩa là gì?”

Có CTA:

- Điều chỉnh kế hoạch
- Thử kịch bản khác
- Xem đề xuất

## Output

Chỉ thiết kế Retirement Goal và Retirement Plan.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 6.**

---

# PHASE 6 — SIMULATION & TRACKING

Đọc lại `design-system.md`.

Thiết kế:

`U07 — Mô phỏng & Theo dõi`

## Simulation (Mô phỏng kịch bản)

Tập trung vào các đòn bẩy do người dùng chủ động kiểm soát:

- Retirement age (Tuổi nghỉ hưu)
- Monthly additional savings (Mức tích lũy tăng thêm hàng tháng)
- Expected expenses in retirement (Mức chi tiêu khi nghỉ hưu)

*(Lưu ý: Không cho người dùng tự do nhập lạm phát và lãi suất kỳ vọng để kết quả mô phỏng luôn chuẩn xác theo mô hình tài chính).*

Khi thay đổi phải trực quan thấy tác động.

Thiết kế:

```text
Control Panel
+
Result Visualization
```

Có comparison:

```text
Current Plan
vs
Simulation
```

Không sử dụng quá nhiều slider.

Đối với số tiền cần độ chính xác cao, ưu tiên number input.

## Tracking & Nhập Thu - Chi Thực Tế Hàng Tháng

Bao gồm 2 khối giao diện chính:

### 1. Form / Modal Nhập Thu - Chi Hàng Tháng (Monthly Cashflow Entry)
- Cho phép người dùng ghi nhận thu nhập thực tế trong tháng:
  - Thu nhập chính, thu nhập phụ, thưởng, kinh doanh...
- Cho phép người dùng ghi nhận chi tiêu thực tế trong tháng:
  - Chi tiêu thiết yếu (tiền nhà, ăn uống, tiện ích...).
  - Chi tiêu nâng cao / lối sống (mua sắm, giải trí, du lịch...).
- Tự động tính toán: `Tiết kiệm thực tế (Dòng tiền ròng) = Tổng Thu nhập - Tổng Chi tiêu`.
- Đối chiếu ngay lập tức với `Mức tích lũy mục tiêu hàng tháng`:
  - `On track` (Xanh): Tiết kiệm thực tế ≥ Tiết kiệm mục tiêu.
  - `Needs attention` (Vàng/Cam nhạt): Tiết kiệm thực tế đạt 80% – 99% mục tiêu.
  - `Behind plan` (Đỏ dịu): Tiết kiệm thực tế < 80% mục tiêu hoặc bị thâm hụt (chi tiêu > thu nhập).
- Nút lưu bản ghi tháng kèm ghi chú ngắn.

### 2. Bảng Điều Khiển & Biểu Đồ Tiến Độ (Cashflow & Savings Trend)
- Hiển thị:
  - Actual savings vs Target savings
  - Monthly cashflow breakdown chart (Cột ghép Thu nhập vs Chi tiêu vs Tích lũy qua từng tháng)
  - Cumulative savings progress vs Retirement target line
  - Historical progress table (Bảng lịch sử thu chi từng tháng)

Tone không được gây hoảng sợ.

## Output

Chỉ Simulation + Tracking.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 7.**

---

# PHASE 7 — AN HƯU AI ASSISTANT

Đọc lại `design-system.md`.

Thiết kế:

`U08 — AI Assistant`

## Mục tiêu

AI không được có cảm giác như chatbot chung chung.

AI là:

**Financial Planning Assistant**

giúp người dùng:

- Hiểu kế hoạch
- Hiểu con số
- Đặt câu hỏi
- Mô phỏng
- Nhận giải thích

## Layout

Có:

- Conversation area
- Suggested Questions
- Context cards
- Quick actions
- Financial insight cards
- References / source information nếu cần

## Example Questions

- “Nếu tôi nghỉ hưu ở tuổi 55 thì sao?”
- “Tôi cần tiết kiệm thêm bao nhiêu mỗi tháng?”
- “Tại sao kế hoạch của tôi đang chậm?”
- “Giải thích biểu đồ này cho tôi.”

## UX

AI response cần hỗ trợ:

- text,
- metric,
- small chart,
- recommendation cards,
- quick action.

Không thiết kế giống ChatGPT clone đơn thuần.

## Output

Chỉ AI Assistant.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 8.**

---

# PHASE 8 — EXPLORE & ACCOUNT

Đọc lại `design-system.md`.

Thiết kế:

- `U09 — Khám phá`
- `U10 — Tài khoản`

## Explore

Gộp:

```text
Financial Solutions
+
Financial Knowledge
```

Có:

- Featured article
- Article categories
- Video
- BHXH
- Investment
- Insurance
- Retirement knowledge
- Financial glossary

Financial products cần thể hiện:

- Provider
- Product type
- Basic conditions
- Risk
- Fees
- Disclosure

Không biến thành e-commerce marketplace.

## Account

Có:

- Personal information
- Security
- Password
- Notification
- Privacy / Consent
- Download retirement report

## Output

Chỉ Explore và Account.

Sau Phase này hoàn thành **USER AREA**.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 9.**

---

# PHASE 9 — ADMIN CORE

Đọc lại `design-system.md`.

Từ Phase này chuyển sang **ADMIN AREA**.

Reuse Admin Shell từ Phase 1.

Thiết kế:

- `AD01 — Admin Dashboard`
- `AD02 — User Management`
- `AD03 — User Detail`

## Admin Dashboard

Hiển thị:

- Total Users
- New Users
- Completed Financial Profiles
- Created Retirement Plans
- AI usage
- Consultation requests
- Alerts

Có:

- trend charts,
- activity,
- recent users,
- tasks requiring attention.

Admin Dashboard có thể dense hơn User Dashboard nhưng không được cluttered.

## User Management

Table:

- User
- Email
- Status
- Profile completion
- Plan status
- Created date
- Last active
- Actions

Có:

- Search
- Filter
- Sort
- Pagination

## User Detail

Admin có thể xem:

- Overview
- Financial profile
- Retirement goal
- Retirement plan
- Activity
- Support history

Sử dụng tab navigation.

## Output

Chỉ Admin Dashboard + Users.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 10.**

---

# PHASE 10 — ADMIN BUSINESS MANAGEMENT

Đọc lại `design-system.md`.

Thiết kế:

- `AD04 — Consultation Management`
- `AD05 — Content Management`
- `AD06 — Partners & Financial Products`

## Consultation

Danh sách yêu cầu:

- User
- Request
- Date
- Status
- Assigned admin nếu cần
- Notes

States:

- New
- Processing
- Scheduled
- Completed
- Cancelled

## Content

Article / Video / FAQ / Glossary management.

Có:

- List
- Search
- Filter
- Create
- Edit
- Draft
- Published

## Partners & Products

### Partner Management
### Financial Product Management

Có:

- Status
- Risk
- Fee
- Conditions
- Disclosure
- Visibility

Không đưa chức năng Advisor role vào đây.

## Output

Chỉ 3 module trên.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 11.**

---

# PHASE 11 — ADMIN AI & FINANCIAL CONFIG

Đọc lại `design-system.md`.

Thiết kế:

- `AD07 — AI & Knowledge Base`
- `AD08 — Financial Configuration`

## AI Management

Có:

- AI configuration overview
- Knowledge sources
- Prompt / Rule management
- AI status
- Usage overview
- Source status

Không thiết kế giống developer console quá kỹ thuật.

Admin nghiệp vụ phải hiểu được.

## Financial Configuration

Cho phép quản lý:

- Inflation assumption
- Expected return
- Life expectancy
- Financial assumptions
- Formula version

Vì đây là cấu hình nhạy cảm:

phải có:

- clear warning,
- confirmation,
- change history,
- current value,
- new value.

Không được cho phép chỉnh sửa nguy hiểm quá dễ dàng.

## Output

Chỉ AI Management + Financial Configuration.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 12.**

---

# PHASE 12 — ADMIN SUPPORT, REPORTS & SETTINGS

Đọc lại `design-system.md`.

Thiết kế:

- `AD09 — Support & Notifications`
- `AD10 — System & Reports`

## Support

Có:

- Ticket list
- Ticket detail
- Notification templates
- Send notification
- Status

## Report

Có dashboard reports:

- User growth
- Profile completion
- Retirement plan creation
- User engagement
- AI usage
- Consultation requests

Charts phải theo Design System.

## System Settings

Có:

- General settings
- Integration
- Notifications
- Privacy
- Audit log

Group setting theo section.

Không trình bày toàn bộ config trong một form dài.

## Output

Hoàn thành **Admin Area**.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 13.**

---

# PHASE 13 — RESPONSIVE DESIGN

Không thiết kế thêm feature.

Đọc lại `design-system.md`.

Audit toàn bộ màn hình đã được **APPROVE**.

Sau đó tạo responsive cho:

- Tablet
- Mobile

Ưu tiên USER trước.

## Quy tắc

Không chỉ scale Desktop xuống.

Phải thay đổi layout hợp lý.

Ví dụ:

```text
Desktop Sidebar
→ Mobile Navigation phù hợp
```

```text
Grid 3–4 columns
→ 1 column
```

```text
Admin Table
→ Horizontal Scroll
hoặc
→ Mobile-friendly representation
```

Chart phải giữ khả năng đọc.

CTA quan trọng phải dễ chạm.

Form input phải phù hợp mobile.

## Breakpoint

Tuân thủ breakpoint trong `design-system.md`.

Không tự đặt breakpoint mới.

## Output

Responsive variants cho các màn hình đã duyệt.

Không thêm feature.

**Sau khi hoàn thành và tự QA: không xóa hay reset bất kỳ phần nào đã làm; tiếp tục PHASE 14.**

---

# PHASE 14 — FINAL DESIGN SYSTEM AUDIT

Không thiết kế thêm màn hình mới.

Hãy audit toàn bộ An Hưu.

Đọc lại `design-system.md` từ đầu.

Kiểm tra từng frame và component.

## Check

- Color consistency
- Typography
- Spacing
- Grid
- Radius
- Shadow
- Button
- Input
- Form
- Card
- Navigation
- Table
- Charts
- Status colors
- Icons
- Responsive
- Accessibility
- Component reuse
- Auto Layout
- Naming convention

## Tìm các lỗi

Tìm:

- màu không thuộc token,
- font size tự phát sinh,
- spacing bất thường,
- radius khác Design System,
- card style không nhất quán,
- button duplicate,
- input duplicate,
- component có thể reuse nhưng lại tạo mới,
- layout lệch grid,
- alignment lỗi,
- chart dùng màu sai,
- UI Admin và User không cùng một brand,
- mobile bị overflow,
- text bị truncate không hợp lý.

## Sau khi Audit

Sửa những lỗi consistency.

Không redesign những màn hình đã được approve nếu không có lỗi.

## Mục tiêu cuối cùng

Một sản phẩm có cảm giác như được thiết kế bởi **MỘT design team**, không phải nhiều màn hình AI sinh riêng lẻ.

**Sau khi hoàn tất audit: giữ nguyên toàn bộ sản phẩm, không xóa code/frame/component đã tạo, hoàn tất dự án và STOP.**

---

# CÁCH SỬ DỤNG FILE NÀY

1. Upload `design-system.md` vào Figma Make.
2. Upload hoặc copy file `task.md`.
3. Yêu cầu Figma Make đọc toàn bộ **GLOBAL INSTRUCTION** trước.
4. Bắt đầu từ **PHASE 1**.
5. Figma Make phải hoàn thành từng Phase theo thứ tự, tự QA, rồi **tự động chuyển sang Phase kế tiếp**.
6. Không làm nhiều Phase song song và không gộp nhiều Phase thành một lần thiết kế lớn.
7. Ở mọi Phase, phải **giữ nguyên và tiếp tục xây trên code/frame/component của các Phase trước**.
8. Tuyệt đối không xóa, reset hoặc regenerate toàn bộ công việc đã làm chỉ để chuyển sang Phase mới.
9. Chỉ hoàn tất khi đã đi hết **PHASE 14** và thực hiện Final Design System Audit.

## Prompt khởi chạy toàn bộ quy trình tuần tự

```text
Đọc toàn bộ design-system.md và GLOBAL INSTRUCTION trong task.md trước khi bắt đầu.

Bắt đầu từ PHASE 1 và thực hiện tuần tự đến PHASE 14.
Mỗi thời điểm chỉ làm đúng một Phase.

Khi hoàn thành một Phase:
1. Tự QA theo design-system.md.
2. Kiểm tra không gây regression cho những Phase trước.
3. Giữ nguyên toàn bộ code, frame, component, variables, styles, Auto Layout và prototype đã tạo.
4. Không xóa, reset, regenerate hoặc ghi đè công việc cũ.
5. Reuse và mở rộng component hiện có thay vì tạo duplicate.
6. Sau đó tự động chuyển sang Phase tiếp theo.

Không cần chờ tôi nhắc chuyển Phase.
Chỉ STOP sau khi hoàn tất PHASE 14 và Final Design System Audit.
```
