# AN HƯU — PRODUCT INFORMATION

> **File:** `info.md`  
> **Purpose:** Cung cấp bối cảnh sản phẩm, phạm vi nghiệp vụ, cấu trúc role, màn hình và luồng chính để AI Design / AI Coding hiểu đúng dự án An Hưu trước khi làm việc.  
> **Important:** File này mô tả **WHAT the product is**.  
> Quy chuẩn giao diện nằm trong `design-system.md`.  
> Kế hoạch triển khai thiết kế nằm trong `task.md`.

---

# 1. PROJECT OVERVIEW

## Product name

**AN HƯU**

## Product type

Web application / Financial Planning Platform.

## Primary purpose

An Hưu là nền tảng hỗ trợ người dùng:

- hiểu tình hình tài chính hiện tại,
- xác định mục tiêu nghỉ hưu,
- xây dựng kế hoạch nghỉ hưu,
- biết số tiền cần chuẩn bị,
- biết số tiền cần tích lũy theo tháng,
- thử các kịch bản tài chính khác nhau,
- theo dõi tiến độ thực hiện kế hoạch,
- nhận giải thích và hỗ trợ từ AI,
- tiếp cận kiến thức và giải pháp tài chính phù hợp.

## Core positioning

An Hưu không phải:

- ứng dụng ngân hàng,
- ứng dụng giao dịch chứng khoán,
- phần mềm kế toán,
- ví điện tử,
- marketplace tài chính,
- chatbot AI chung chung.

An Hưu là:

> **Nền tảng lập kế hoạch nghỉ hưu và hỗ trợ người dùng chuẩn bị tài chính cho tương lai dài hạn.**

## Brand feeling

Sản phẩm cần mang lại cảm giác:

**An tâm → Dễ hiểu → Đáng tin cậy → Có kế hoạch → Có tương lai**

---

# 2. PROJECT SCOPE

Hệ thống hiện tại chỉ có **2 role chính**:

1. `USER`
2. `ADMIN`

Không tạo thêm các role:

- Advisor
- Super Admin
- Consultant
- Staff
- Operator
- Content Manager
- Support Agent

Nếu trong tương lai cần phân quyền chi tiết hơn, có thể bổ sung permission bên trong `ADMIN`, nhưng **không được tự ý tạo role mới trong thiết kế hiện tại**.

---

# 3. ROLE — USER

## 3.1 Definition

USER là khách hàng sử dụng An Hưu để lập và theo dõi kế hoạch nghỉ hưu cá nhân.

## 3.2 Main goal

Giúp người dùng đi xuyên suốt hành trình:

```text
Hiểu tài chính hiện tại
→ Xác định mục tiêu nghỉ hưu
→ Nhận kế hoạch
→ Thử các kịch bản
→ Theo dõi tiến độ
→ Nhận hỗ trợ từ AI
```

## 3.3 Primary user journey

```text
Trang chủ
→ Đăng ký
→ Hồ sơ tài chính
→ Mục tiêu nghỉ hưu
→ Kế hoạch nghỉ hưu
→ Mô phỏng
→ Theo dõi
→ AI
```

## 3.4 Core capabilities

### 01 — Hồ sơ tài chính

Quản lý:

- tuổi,
- người phụ thuộc,
- thu nhập,
- chi tiêu,
- tài sản,
- khoản nợ,
- đầu tư,
- BHXH,
- các thông tin tài chính cần thiết khác.

Mục tiêu:

> Tạo dữ liệu đầu vào để hệ thống hiểu tình trạng tài chính hiện tại của người dùng.

---

### 02 — Mục tiêu nghỉ hưu

Cho phép xác định:

- tuổi nghỉ hưu mong muốn,
- mức sống mong muốn,
- mức chi tiêu dự kiến,
- nhu cầu tài chính dài hạn.

> **Quy chuẩn tính toán giả định vĩ mô:**  
> Người dùng **KHÔNG** tự nhập tỷ lệ lạm phát và lãi suất kỳ vọng (lợi suất đầu tư). Hai thông số này do hệ thống An Hưu tự động tính toán và áp dụng chuẩn hóa (dựa trên cấu hình kinh tế vĩ mô chuẩn và mô hình danh mục đầu tư theo độ tuổi/khẩu vị rủi ro) nhằm đảm bảo tính chính xác khoa học, tránh sai lệch do phỏng đoán cảm tính.

Mục tiêu:

> Xác định rõ người dùng muốn nghỉ hưu khi nào và cần duy trì mức sống như thế nào.

---

### 03 — Kế hoạch nghỉ hưu

Hệ thống tính toán và hiển thị:

- số tiền cần có khi nghỉ hưu,
- số tiền dự kiến có,
- khoản thiếu hụt,
- mức tích lũy cần thiết mỗi tháng,
- thời gian còn lại,
- tiến độ đạt mục tiêu.

Mục tiêu:

> Trả lời rõ người dùng cần chuẩn bị bao nhiêu và cần làm gì từ hiện tại.

---

### 04 — Mô phỏng

Cho phép thử các tình huống dạng:

> “Nếu... thì sao?”

Ví dụ:

- Nếu nghỉ hưu muộn hơn?
- Nếu tích lũy thêm mỗi tháng?
- Nếu chi tiêu ít hơn khi về già?
- Nếu thay đổi mức sống mong muốn?

*(Lưu ý: Không mở cho người dùng tự điều chỉnh tùy tiện lạm phát hay lãi suất kỳ vọng; việc mô phỏng tập trung vào các hành động thực tế người dùng kiểm soát được).*

Mục tiêu:

> Giúp người dùng hiểu tác động của từng quyết định lên kế hoạch nghỉ hưu.

---

### 05 — Theo dõi tiến độ & Thu chi hàng tháng

Hệ thống hỗ trợ:

- **Nhập thu - chi thực tế hàng tháng (Monthly Cashflow Entry):**
  - Ghi nhận thu nhập thực tế trong tháng (lương, thưởng, thu nhập phụ...).
  - Ghi nhận chi tiêu thực tế trong tháng (chi tiêu thiết yếu, chi tiêu nâng cao).
  - Tự động tính **Tiết kiệm thực tế (Dòng tiền ròng = Thu nhập - Chi tiêu)**.
- **Đối chiếu tiến độ:**
  - So sánh trực quan giữa **Tiết kiệm thực tế** và **Tiết kiệm mục tiêu hàng tháng**.
  - Theo dõi tiến độ tích lũy thực tế qua các mốc thời gian.
  - Lịch sử thu - chi và xu hướng tích lũy theo từng tháng.
- **Trạng thái kế hoạch:**

Các trạng thái có thể gồm:

- On track (Đạt hoặc vượt mức tích lũy mục tiêu)
- Needs attention (Thiếu hụt nhẹ, cần chú ý chi tiêu)
- Behind plan (Thiếu hụt đáng kể hoặc thâm hụt dòng tiền)

Tone của hệ thống không được gây hoảng sợ.

---

### 06 — Trợ lý AI

AI hỗ trợ:

- hỏi đáp,
- giải thích kế hoạch,
- giải thích số liệu,
- giải thích biểu đồ,
- hỗ trợ mô phỏng,
- giúp người dùng hiểu những thay đổi cần thực hiện.

AI phải sử dụng ngôn ngữ dễ tiếp cận.

AI không nên có cảm giác như chatbot chung chung.

AI được định vị là:

> **Financial Planning Assistant**

---

### 07 — Kiến thức & giải pháp

Người dùng có thể khám phá:

- bài viết,
- video,
- kiến thức về BHXH,
- đầu tư,
- bảo hiểm,
- nghỉ hưu,
- thuật ngữ tài chính,
- giải pháp tài chính,
- sản phẩm từ đối tác.

Mục tiêu:

> Hỗ trợ giáo dục tài chính và cung cấp thông tin hữu ích trong cùng hệ sinh thái An Hưu.

---

# 4. USER — SCREEN LIST

Có **10 màn hình/module chính**.

---

## U01 — Trang chủ

### Purpose

Giúp khách hiểu An Hưu là gì và bắt đầu sử dụng sản phẩm.

### Main content

- Giới thiệu An Hưu
- Lợi ích
- Value proposition
- CTA
- Tính thử / bắt đầu lập kế hoạch
- Cách hoạt động
- Giới thiệu AI
- Kiến thức tài chính
- Trust elements

### Primary CTA

- Bắt đầu lập kế hoạch
- Tính thử kế hoạch

---

## U02 — Đăng ký / Đăng nhập

### Functions

- Đăng ký
- Đăng nhập
- Quên mật khẩu
- Reset password
- Xác minh tài khoản

### Purpose

Tạo tài khoản riêng để lưu:

- dữ liệu tài chính,
- mục tiêu,
- kế hoạch,
- lịch sử theo dõi.

---

## U03 — Thiết lập hồ sơ tài chính

### Main data

- Tuổi
- Người phụ thuộc
- Thu nhập
- Chi tiêu
- Tài sản
- Nợ
- Đầu tư
- BHXH

### Recommended UX flow

```text
Welcome
→ Personal Information
→ Income
→ Expense
→ Assets
→ Debt
→ Investment
→ BHXH / Insurance
→ Summary
```

### Important UX rule

Không tạo cảm giác như người dùng đang khai báo kế toán.

Ưu tiên:

- từng bước,
- ngắn gọn,
- có giải thích,
- progress rõ ràng,
- có thể lưu tạm.

---

## U04 — Dashboard / Tổng quan

### Purpose

Dashboard cần trả lời nhanh:

1. Tình hình tài chính hiện tại thế nào?
2. Còn cách mục tiêu nghỉ hưu bao xa?
3. Kế hoạch có đúng hướng không?
4. Nên làm gì tiếp theo?

### Possible information

- Retirement Readiness Score
- Current Net Worth
- Target Retirement Fund
- Current Retirement Fund
- Monthly Saving Target
- Retirement Goal Progress
- Projection Chart
- Financial Snapshot
- AI Insight
- Alert
- Recommended Action
- Recent Activity

### Priority

**Retirement progress / readiness** là insight quan trọng nhất.

---

## U05 — Mục tiêu nghỉ hưu

### Main inputs

- Current age
- Target retirement age
- Desired monthly lifestyle
- Expected retirement spending
- **Giả định lạm phát & Lãi suất kỳ vọng:** *Do hệ thống tự động xác định và hiển thị dưới dạng thẻ thông tin chuẩn hóa (System-calculated Benchmark Card) kèm ghi chú giải thích căn cứ tính toán. Người dùng KHÔNG tự nhập các thông số này để bảo toàn tính chuẩn xác.*

### Purpose

Xác định:

- thời điểm nghỉ hưu,
- mức sống cần duy trì,
- mục tiêu tài chính dài hạn.

---

## U06 — Kế hoạch nghỉ hưu

### Core output

- Số tiền cần khi nghỉ hưu
- Số tiền dự kiến có
- Khoản thiếu
- Tích lũy cần thiết mỗi tháng
- Số năm còn lại
- Progress toward retirement
- Projected fund growth

### This is a core product screen

Primary result phải được nhìn thấy ngay.

Secondary financial details đặt ở hierarchy thấp hơn.

Các CTA phù hợp:

- Điều chỉnh kế hoạch
- Thử kịch bản khác
- Xem đề xuất
- Hỏi AI

---

## U07 — Mô phỏng & Theo dõi

### Simulation (Mô phỏng kịch bản)

Tập trung vào các đòn bẩy do người dùng chủ động quyết định:

- tuổi nghỉ hưu,
- mức tích lũy thêm mỗi tháng,
- mức chi tiêu kỳ vọng khi nghỉ hưu.
*(Không cho phép người dùng tự điều chỉnh lạm phát và lãi suất kỳ vọng; hệ thống giữ nguyên tham số chuẩn hóa để kết quả so sánh khách quan và chính xác).*

Hiển thị comparison:

```text
Current Plan
vs
Simulation
```

### Tracking & Ghi nhận Thu - Chi thực tế (Monthly Cashflow & Tracking)

Bao gồm 2 khối chức năng chính:

1. **Ghi nhận Thu - Chi hàng tháng (Monthly Cashflow Entry):**
   - Form / Modal ghi nhận dòng tiền tháng hiện tại:
     - **Thu nhập thực tế:** Lương chính, thu nhập phụ, thưởng, kinh doanh...
     - **Chi tiêu thực tế:** Chi phí thiết yếu (nhà ở, ăn uống, hóa đơn...) & Chi tiêu nâng cao (giải trí, mua sắm...).
     - **Tự động tính:** `Tiết kiệm thực tế (Net Cashflow) = Tổng Thu nhập - Tổng Chi tiêu`.
   - **Đối chiếu tức thì:** So sánh `Tiết kiệm thực tế` với `Mức tích lũy mục tiêu hàng tháng` từ Kế hoạch hưu trí.
   - Gắn nhãn trạng thái tháng:
     - `On track`: Tiết kiệm thực tế ≥ Tiết kiệm mục tiêu.
     - `Needs attention`: Tiết kiệm thực tế đạt 80% – 99% mục tiêu.
     - `Behind plan`: Tiết kiệm thực tế < 80% mục tiêu hoặc bị thâm hụt (chi tiêu > thu nhập).

2. **Bảng & Biểu đồ Theo dõi tiến độ tích lũy:**
   - **Cashflow Bar Chart:** Thu nhập vs Chi tiêu vs Tích lũy qua từng tháng.
   - **Cumulative Savings vs Target Line:** Đường tích lũy dồn thực tế so với đường mục tiêu của kế hoạch.
   - **Lịch sử ghi nhận:** Danh sách các tháng đã ghi nhận thu chi và mức chênh lệch.

---

## U08 — Trợ lý AI

### Main functions

- Chat / hỏi đáp
- Giải thích kế hoạch
- Giải thích số liệu
- Hỗ trợ mô phỏng
- Suggested questions
- Quick actions
- Financial insight cards

### Example questions

- “Nếu tôi nghỉ hưu ở tuổi 55 thì sao?”
- “Tôi cần tiết kiệm thêm bao nhiêu mỗi tháng?”
- “Tại sao kế hoạch của tôi đang chậm?”
- “Giải thích biểu đồ này cho tôi.”

### AI UX principle

Không biến màn này thành clone của ChatGPT.

Nó phải giữ context tài chính của An Hưu.

---

## U09 — Khám phá

Gồm hai nhóm nội dung:

### Financial Knowledge

- Bài viết
- Video
- BHXH
- Investment
- Insurance
- Retirement knowledge
- Financial glossary

### Financial Solutions

Có thể hiển thị:

- Provider
- Product type
- Basic conditions
- Risk
- Fees
- Disclosure

Không thiết kế như e-commerce marketplace.

---

## U10 — Tài khoản & Bảo mật

### Functions

- Thông tin cá nhân
- Password
- Security
- Notifications
- Privacy
- Consent
- Download retirement report

---

# 5. USER EXPERIENCE PRINCIPLES

## Principle 1 — Simple before advanced

Người dùng không nhất thiết có kiến thức tài chính.

Không dồn quá nhiều thuật ngữ vào một màn hình.

---

## Principle 2 — Explain the meaning

Không chỉ hiển thị:

> 3.250.000.000 VNĐ

Phải giúp người dùng hiểu:

- con số này là gì,
- tại sao quan trọng,
- tác động thế nào,
- nên làm gì tiếp theo.

---

## Principle 3 — Actionable information

Mỗi insight quan trọng nên dẫn đến hành động.

Ví dụ:

```text
Bạn đang thiếu 18% so với mục tiêu.
→ Tăng tích lũy hàng tháng
→ Thử kế hoạch mới
```

---

## Principle 4 — Calm financial experience

Không sử dụng:

- cảnh báo đỏ quá mạnh,
- ngôn ngữ gây hoảng loạn,
- biểu đồ phức tạp không cần thiết.

Mục tiêu là giúp user cảm thấy có thể kiểm soát tương lai.

---

## Principle 5 — Progress-focused

Ưu tiên:

- progress,
- milestone,
- timeline,
- projection,
- next action.

---

# 6. ROLE — ADMIN

## 6.1 Definition

ADMIN là nhóm quản trị và vận hành nền tảng An Hưu.

Admin chịu trách nhiệm:

- theo dõi hoạt động hệ thống,
- quản lý user,
- hỗ trợ user,
- quản lý nội dung,
- quản lý đối tác,
- quản lý sản phẩm,
- quản lý AI,
- quản lý cấu hình tài chính,
- báo cáo,
- system settings.

## 6.2 Admin operating flow

```text
Dashboard
→ Users
→ Plans
→ Tư vấn
→ Nội dung
→ Đối tác / Sản phẩm
→ AI
→ Settings
```

## 6.3 Core admin capabilities

### 01 — Người dùng

- Tìm kiếm
- Kiểm tra trạng thái tài khoản
- Xem hồ sơ
- Xem mục tiêu
- Xem kế hoạch
- Xem activity
- Khóa / mở tài khoản khi cần

---

### 02 — Tư vấn & hỗ trợ

- Tiếp nhận yêu cầu
- Quản lý lịch
- Ghi chú
- Người phụ trách
- Ticket
- Thông báo
- Trạng thái xử lý

---

### 03 — Nội dung

Quản lý:

- bài viết,
- video,
- FAQ,
- thuật ngữ,
- danh mục.

---

### 04 — Đối tác & sản phẩm

Quản lý:

- đối tác,
- sản phẩm tài chính,
- điều kiện,
- phí,
- rủi ro,
- disclosure,
- trạng thái hiển thị.

---

### 05 — AI & mô hình tài chính

Quản lý:

- Knowledge Base
- nguồn kiến thức,
- prompt / rule,
- AI configuration,
- giả định tài chính,
- công thức,
- phiên bản tính toán.

---

### 06 — Hệ thống & báo cáo

Quản lý:

- báo cáo vận hành,
- audit log,
- integrations,
- privacy,
- security,
- system settings.

---

# 7. ADMIN — SCREEN LIST

Có **10 module chính**.

---

## AD01 — Admin Dashboard

### Purpose

Cho Admin thấy nhanh:

- tình hình hệ thống,
- chỉ số vận hành,
- công việc cần xử lý.

### Possible KPIs

- Total Users
- New Users
- Completed Financial Profiles
- Created Retirement Plans
- AI Usage
- Consultation Requests
- Open Tickets
- Alerts

### Other content

- Trend charts
- Recent users
- Recent activity
- Tasks requiring attention

---

## AD02 — Quản lý người dùng

### Table data

- User
- Email
- Status
- Profile completion
- Plan status
- Created date
- Last active
- Actions

### Functions

- Search
- Filter
- Sort
- Pagination
- Lock / Unlock
- Open detail

---

## AD03 — Chi tiết người dùng

### Suggested tabs

- Overview
- Financial Profile
- Retirement Goal
- Retirement Plan
- Activity
- Support History

### Purpose

Hỗ trợ Admin kiểm tra trạng thái hồ sơ và kế hoạch của từng user.

---

## AD04 — Quản lý tư vấn

### Data

- User
- Request
- Date
- Status
- Responsible Admin
- Notes

### Possible states

- New
- Processing
- Scheduled
- Completed
- Cancelled

### Purpose

Theo dõi yêu cầu từ lúc tiếp nhận tới hoàn thành.

---

## AD05 — Quản lý nội dung

### Content types

- Article
- Video
- FAQ
- Glossary
- Category

### Functions

- List
- Search
- Filter
- Create
- Edit
- Draft
- Publish
- Hide

---

## AD06 — Đối tác & Sản phẩm

### Partner management

Quản lý thông tin đối tác.

### Product management

Quản lý:

- conditions,
- risk,
- fees,
- disclosure,
- visibility,
- status.

### Purpose

Quản lý các giải pháp tài chính xuất hiện trên nền tảng.

---

## AD07 — AI & Knowledge Base

### Functions

- Knowledge source management
- AI rules
- Prompt management
- Allowed data sources
- AI status
- Usage overview
- Source status

### Important principle

Giao diện dành cho Admin nghiệp vụ.

Không biến thành developer console quá kỹ thuật.

---

## AD08 — Cấu hình tài chính

### Configurable data

- Inflation assumption
- Expected return
- Life expectancy
- Other financial assumptions
- Formula
- Formula version

### Important safety UX

Các thay đổi phải có:

- current value,
- new value,
- warning,
- confirmation,
- history.

Các cấu hình này có thể tác động trực tiếp tới kết quả kế hoạch của nhiều user.

---

## AD09 — Hỗ trợ & Thông báo

### Functions

- Ticket list
- Ticket detail
- Notification templates
- Send notification
- Status management

---

## AD10 — Hệ thống & Báo cáo

### Reports

- User growth
- Profile completion
- Retirement plan creation
- User engagement
- AI usage
- Consultation requests

### System settings

- General settings
- Integration
- Notifications
- Privacy
- Security
- Audit log

Không trình bày tất cả setting trong một form dài.

Chia theo section rõ ràng.

---

# 8. ADMIN EXPERIENCE PRINCIPLES

## Principle 1 — Action first

Dashboard Admin ưu tiên dữ liệu cần hành động.

Ví dụ:

- user mới,
- hồ sơ chưa hoàn thành,
- ticket chưa xử lý,
- cảnh báo,
- yêu cầu tư vấn.

---

## Principle 2 — Dense but readable

Admin có thể chứa nhiều dữ liệu hơn User.

Nhưng vẫn phải:

- scannable,
- clear hierarchy,
- consistent spacing,
- searchable,
- filterable.

---

## Principle 3 — Sensitive financial data

Dữ liệu tài chính user chỉ hiển thị trong phạm vi phục vụ:

- vận hành,
- hỗ trợ,
- kiểm tra kế hoạch.

Không thiết kế theo hướng khai thác dữ liệu cá nhân không cần thiết.

---

## Principle 4 — Configuration safety

Các thay đổi liên quan:

- công thức,
- AI,
- financial assumptions,
- system configuration

cần có:

- warning,
- confirmation,
- history,
- audit trail.

---

# 9. INFORMATION ARCHITECTURE

## USER

```text
USER
│
├── Home
├── Authentication
│   ├── Login
│   ├── Register
│   ├── Forgot Password
│   ├── Reset Password
│   └── Verification
│
├── Financial Profile
├── Dashboard
├── Retirement Goal
├── Retirement Plan
├── Simulation & Tracking
├── AI Assistant
├── Explore
│   ├── Knowledge
│   └── Financial Solutions
│
└── Account
    ├── Profile
    ├── Security
    ├── Notifications
    ├── Privacy
    └── Reports
```

---

## ADMIN

```text
ADMIN
│
├── Dashboard
├── Users
│   ├── User List
│   └── User Detail
│
├── Consultations
├── Content
├── Partners & Products
├── AI & Knowledge Base
├── Financial Configuration
├── Support & Notifications
└── System & Reports
    ├── Reports
    ├── Integrations
    ├── Privacy
    ├── Security
    ├── Audit Log
    └── System Settings
```

---

# 10. IMPORTANT DATA CONCEPTS

AI / Designer / Developer cần hiểu các khái niệm sau.

## Financial Profile

Tập hợp dữ liệu tài chính hiện tại của user.

Có thể bao gồm:

```text
Income
Expense
Assets
Debt
Investment
BHXH
Dependents
Age
```

---

## Retirement Goal

Mục tiêu người dùng mong muốn đạt được khi nghỉ hưu.

Ví dụ:

```text
Target retirement age
Expected monthly spending
Desired lifestyle
```

---

## Retirement Plan

Kết quả hệ thống tính toán dựa trên:

```text
Financial Profile
+
Retirement Goal
+
Financial Assumptions
```

Kết quả có thể gồm:

```text
Required Retirement Fund
Projected Retirement Fund
Funding Gap
Monthly Saving Requirement
Years Remaining
Progress
```

---

## Simulation

Phiên thử nghiệm các giả định khác nhau.

Simulation không nhất thiết thay đổi kế hoạch chính cho tới khi user xác nhận.

---

## Tracking

Theo dõi dữ liệu thực tế so với kế hoạch.

```text
Actual
vs
Target
```

---

## Financial Assumption

Các tham số hệ thống dùng trong tính toán.

Ví dụ:

- inflation,
- return rate,
- life expectancy.

Các giá trị cụ thể phải được xác nhận bởi nghiệp vụ; **không tự invent con số thật trong thiết kế sản phẩm**.

---

# 11. AI PRODUCT CONTEXT

AI trong An Hưu có vai trò hỗ trợ hiểu thông tin.

AI có thể:

- giải thích,
- tóm tắt,
- trả lời câu hỏi,
- phân tích kế hoạch đã có,
- hỗ trợ simulation,
- gợi ý bước tiếp theo dựa trên context được phép.

AI không nên được trình bày như một công cụ ra quyết định thay cho người dùng.

### UX language

Ưu tiên:

> “Bạn có thể cân nhắc…”

thay vì:

> “Bạn phải…”

Ưu tiên:

> “Theo kế hoạch hiện tại…”

thay vì:

> “Chắc chắn bạn sẽ…”

---

# 12. CONTENT & MICROCOPY PRINCIPLES

## User-facing language

Ngôn ngữ phải:

- dễ hiểu,
- ngắn,
- thân thiện,
- không quá technical,
- không gây áp lực.

## Financial numbers

Luôn cung cấp context.

Không chỉ:

```text
2.800.000.000 VNĐ
```

Nên có thêm:

```text
Số tiền dự kiến bạn cần tại thời điểm nghỉ hưu
```

## Warnings

Không dùng warning khi chỉ cần information.

Phân biệt:

- Info
- Positive
- Attention
- Critical

theo Design System.

---

# 13. DESIGN RESPONSIBILITY SPLIT

## `info.md`

Quy định:

> Sản phẩm là gì, có những feature nào, role nào, màn hình nào và dữ liệu nào.

## `design-system.md`

Quy định:

> UI phải trông như thế nào và component phải được xây dựng theo rule nào.

## `task.md`

Quy định:

> AI phải triển khai thiết kế theo thứ tự nào.

### Priority when files interact

Nếu thực hiện UI task:

1. Dùng `info.md` để hiểu nghiệp vụ.
2. Dùng `design-system.md` để quyết định visual/UI.
3. Dùng `task.md` để quyết định phạm vi Phase hiện tại.

Không được dùng `task.md` để tự tạo nghiệp vụ không có trong `info.md`.

Không được dùng `info.md` để phá vỡ rule trong `design-system.md`.

---

# 14. HARD CONSTRAINTS FOR AI

Các quy tắc sau là bắt buộc.

## Roles

Chỉ:

```text
USER
ADMIN
```

Không tạo role khác.

---

## Scope

Không tự thêm:

- trading,
- stock buying,
- banking transaction,
- crypto,
- payment wallet,
- loan application,
- insurance purchasing flow

nếu chưa có yêu cầu riêng.

---

## Financial data

Không tự tạo các công thức tài chính được xem như dữ liệu production.

Mock data dùng trong design phải được xem là demo.

---

## Screen reuse

Không tạo nhiều màn khác tên nhưng cùng chức năng nếu không có lý do UX rõ ràng.

---

## Design consistency

Không tự thay đổi:

- color,
- typography,
- spacing,
- radius,
- shadows,
- navigation pattern

ngoài `design-system.md`.

---

## Progressive implementation

Khi làm theo `task.md`:

- hoàn thành từng Phase,
- giữ nguyên các Phase trước,
- không xóa code/frame/component cũ,
- reuse những gì đã làm,
- mở rộng trên nền tảng có sẵn,
- chỉ refactor phần cũ nếu cần để đảm bảo consistency,
- không reset toàn bộ project khi sang Phase mới.

---

# 15. PRODUCT SUCCESS EXPERIENCE

Một trải nghiệm An Hưu tốt phải giúp User luôn hiểu:

```text
Tôi đang ở đâu?
↓
Tôi muốn đi tới đâu?
↓
Tôi còn thiếu bao nhiêu?
↓
Tôi cần làm gì mỗi tháng?
↓
Tôi có đang đi đúng hướng không?
```

Admin phải luôn hiểu:

```text
Hệ thống đang hoạt động thế nào?
↓
User nào cần hỗ trợ?
↓
Yêu cầu nào đang chờ xử lý?
↓
Nội dung / sản phẩm nào đang hoạt động?
↓
Có cấu hình quan trọng nào thay đổi?
```

---

# 16. FINAL PRODUCT SUMMARY

## USER

```text
U01 — Trang chủ
U02 — Đăng ký / Đăng nhập
U03 — Thiết lập hồ sơ tài chính
U04 — Dashboard / Tổng quan
U05 — Mục tiêu nghỉ hưu
U06 — Kế hoạch nghỉ hưu
U07 — Mô phỏng & Theo dõi
U08 — Trợ lý AI
U09 — Khám phá
U10 — Tài khoản & Bảo mật
```

## ADMIN

```text
AD01 — Admin Dashboard
AD02 — Quản lý người dùng
AD03 — Chi tiết người dùng
AD04 — Quản lý tư vấn
AD05 — Quản lý nội dung
AD06 — Đối tác & Sản phẩm
AD07 — AI & Knowledge Base
AD08 — Cấu hình tài chính
AD09 — Hỗ trợ & Thông báo
AD10 — Hệ thống & Báo cáo
```

---

# 17. INSTRUCTION FOR AI BEFORE STARTING WORK

Trước bất kỳ task thiết kế hoặc phát triển nào:

```text
1. Read info.md
2. Read design-system.md
3. Read the current phase in task.md
4. Understand the existing project before modifying it
5. Reuse existing components
6. Do not remove previous work
7. Implement only within the defined product scope
8. Run a consistency check after the task
```

Nếu có mâu thuẫn hoặc thiếu dữ liệu nghiệp vụ quan trọng:

**Không tự invent.**

Giữ assumption ở mức mock/demo hoặc đánh dấu cần xác nhận.

---

**AN HƯU — Product Information**
