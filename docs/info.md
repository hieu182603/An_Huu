# AN HƯU — PRODUCT INFORMATION

> **06/10 — cập nhật khoản vay qua API:** đã có chuyển basis v1, phân bổ tiền trả theo gốc/lãi/phí và lịch vay v2 trong dự báo nguồn, lưu/áp dụng riêng, giữ lịch sử. Trần nghĩa vụ không reset; tiền đã rút ở actual không trừ lại. UI FE-T15-LOAN-V2-API. Refinance/vay-tài sản mới, kiểm DB/races/UI và các nhánh BHXH còn tiếp tục; chi tiết LOAN_REVISIONS_V2.md/PROGRESS.md.

> **05/10 — nguồn dự báo v4 đã có API:** thêm/sửa/dừng thu, chi, pension và đưa estimate BHXH vào candidate; lưu và áp dụng riêng, giữ replay bản cũ. Báo cáo/CSV/AI theo nguồn đã nối. UI nhận FE-T16-SOURCE-V4; PostgreSQL/race/browser chưa nghiệm thu, tài sản/vay mới và các nhánh BHXH còn tiếp tục. Chi tiết SOURCE_COMMANDS_V4.md và PROGRESS.md; thông tin “chưa mở API nguồn” bên dưới là checkpoint cũ.

> **05/10 — corpus và nguồn BHXH:** đã có hai bộ dữ liệu luật nháp 2026 có nguồn/hash và bước nội bộ chọn estimate vào nguồn pension; chưa công bố luật hoặc mở API chọn vào kế hoạch.404tests đạt, thêm29focused sau sửa cuối đạt. Kiểm DB mới chưa chạy được vì lỗi kết nối trước khi ghi. Backend mở rộng vẫn còn việc; UI xem FE-T14-CORPUS-SOURCE.

> **Cập nhật05/10 — BH2 thường:** API estimate đã có thêm lương Nhà nước/hỗn hợp thông thường, cùng trợ cấpBH1v2 và replay theoengine.388tests,13caHTTP/DB riêngBH2 đạt, dữ liệu được rollback. Các nhóm đặc thù/tự nguyện/lịch sử và corpus luật thực chưa hoàn tất; không công bố BHXH đầy đủ. UI xemFE-T14-STATE trong task-frontend.md.

> **Đang triển khai mở rộng05/10:** nền lịch nguồn/modelv4 đã có nội bộ; API lịch đóng/quản trị luật và preview/save/read estimate BH1 đã bổ sung.353tests và34kiểm traHTTP/DBrollback đạt. Migration0011 đã áp dụng giữ dữ liệu cũ; chưa có corpus luật thật công bố, publicv4 và các nhómBHXH khác còn tiếp tục. Hướng dẫn [INSURANCE_HISTORY_RULES.md](../backend/docs/INSURANCE_HISTORY_RULES.md), frontend FE-T14-ESTIMATES. Tiếp tục T14–T17 đến hết phạm vi backend.

> **Tiến độ mở rộng05/10 — T13-01/02:** đã rà bản ký còn thiếu, chốt [ma trận luật](../backend/docs/LEGAL_RULE_MATRIX.md) và [kiến trúc dữ liệu/API](../backend/docs/ADR-001-EXPANSION.md). Tra tuổi pension hiện tách rõ mốc tham chiếu với tháng hưởng chưa được xác định; giữ tháng nhận người dùng khai và kế hoạch cũ.299tests/backend đạt, UI xem FE-T13-REFERENCE. TiếpT13-03 nguồn/modelv4; chưa có BHXH tự tính, tái cơ cấu hoặc tạo nguồn mới trong API thực tế, chưa thêm bảngDB.

> **Kế hoạch mở rộng05/10:** đã nghiên cứu BHXH theo lịch đóng/luật có phiên bản, trả nợ một phần–tái cơ cấu vào dự báo và thêm nguồn mới. [Bản nghiên cứu](research-bhxh-no-nguon-moi.md), [task.md](task.md) mục10 T13–T17; UI FE-EXPANSION-T13-T17. Đây là kế hoạch chưa triển khai, không thay mức nhập hưu thủ công hoặc phạm vi đang chạy. “BHXH đầy đủ” được tách nhóm có căn cứ/nhóm cần rà, không quảng bá mọi đối tượng đã hỗ trợ.

> **Retention/khôi phục05/10:** backend có tác vụ dọn lịch sử AI độc lập email/Gemini, mặc định kiểm tra chỉ đọc. 295tests,7kiểm traDBrollback đạt; diễn tập sao lưu–khôi phục dữ liệu mẫu35bảng và dọn hội thoại hết hạn sau restore đạt. Chưa thiết lập lịch production hoặc backup thật; quyền xóa sau restore/P36 vẫn mở. Xem [RETENTION_OPERATIONS.md](../backend/docs/RETENTION_OPERATIONS.md).

> **Gemini05/10/2026:** chủ dự án đã chọn Google Gemini. Backend gọi thực bằng dữ liệu mẫu đạt với gemini-3.8-flash, có fallback và chỉ dùng facts server/tri thức đã duyệt;290tests đạt. Đây là tri thức trong context, chưa fine-tuning. Consent v2 cần xác nhận lại trước gửi dữ liệu ra Google; UI bàn giao FE-GEMINI. Xem [GEMINI.md](../backend/docs/GEMINI.md). Không cần migration; browser/vận hành/P36 chưa nghiệm thu. Các ghi chú chưa chọn provider bên dưới là lịch sử.

> **Q15-03 đã bổ sung backend:** có điều chỉnh từng nguồn cho tất toán khoản vay, tài sản đã vào quỹ, lương hưu và thu/chi; đối chiếu nguồn/giao dịch và chống tính trùng. 273 kiểm thử và17 kiểm tra HTTP/DB rollback đạt, không cần migration. Contract [SOURCE_REFORECAST.md](../backend/docs/SOURCE_REFORECAST.md); UI bàn giao FE-Q15-03, chưa nghiệm thu browser. Những ghi chú “chưa sửa từng nguồn” ở checkpoint trước được thay bằng phạm vi hỗ trợ/giới hạn trong contract mới.

> **Triển khai P13/P15 ngày05/10/2026:** backend model v3 đã hỗ trợ đầu/cuối kỳ với xác nhận nguồn đầu tháng; chỉ góp số xác nhận. Có preview/lưu/apply phiên bản dự báo từ thực tế, giữ baseline và replay v2; phát hiện actual nguồn bị sửa. Điều chỉnh tương lai hiện thay tổng tháng, chưa sửa từng hợp đồng/nguồn nợ–tài sản–lương hưu. Không cần migration mới. Contract [CONTRIBUTIONS_REFORECAST.md](../backend/docs/CONTRIBUTIONS_REFORECAST.md); phần UI bàn giao trong task-frontend, chưa nghiệm thu browser. Các ghi chú kế hoạch chưa triển khai dưới đây là lịch sử.

> **Chốt P13/P15 ngày05/10/2026:** khách đã đồng ý hướng giải thích; tiền dư chỉ góp số người dùng xác nhận. Kế hoạch bổ sung trong [task.md](task.md) mục5/7.1 và [task frontend](task-frontend.md) mụcFE-P13-P15: timing đầu/cuối tháng, lưu dự báo từ actual thành phiên bản mới, điều chỉnh tương lai có xác nhận và giữ lịch sử. Đây là kế hoạch chưa triển khai; API hiện tại vẫn cuối kỳ/reforecast chỉ đọc. Các ghi chú chờ khách ở mốc cũ không còn là trạng thái nghiệp vụ hiện hành.

> **Kiểm tra lại05/10/2026:** migration0010 đã sửa thiếu metadata trong chuỗi cài mới; DBthật10/10checksum vàdiff rỗng, DBsạch/nângcấp/integration đã kiểm đạt. Browser mở rộng15/41đạt,26lỗi gồm fixture cũ và lỗi UI;14thao tác ghi actuals/AI/knowledge sai request và mất chính xác tiền được ghi ở FE-RECHECK-20261005. Xem [báo cáo kiểm tra](RECHECK-T00-T10.md) và [task frontend](task-frontend.md). Chưa phát hành; provider chưa chọn, worker/backup/P36/Q13/Q15 và build DLL còn mở. Các checkpoint dưới là lịch sử.

> Checkpoint hiện hành05/10/2026: backend T11 đã có catalog đối tác/sản phẩm, tùy chọn thông báo lưu theo tài khoản; tư vấn chuyên viên trả410, Support và dữ liệu lịch sử giữ nguyên. Migration0009 đã áp dụng. T12 kiểm tra nội bộ đạt246backend tests,26T11+18T12 HTTP/DB checks và2races; browser7/8 còn1selector lỗi. Chưa phát hành: UI FE-T11/T12, Q13/Q15, DB sạch, provider/staging/backup/P36 và build mặc định bịDLL Windows khóa còn mở. Xem [T12-acceptance.md](T12-acceptance.md), [task-frontend.md](task-frontend.md), backend/docs/SECONDARY_MODULES.md. Không kết nối AI ngoài; không có producer gửi bản tin/cảnh báo/đối tác mới, deliveryAvailable=false. Checkpoint dưới là lịch sử.

> Checkpoint backend hiện hành 05/10/2026: T10 đã chuẩn bị context giải thích/version/actual, mô phỏng engine, consent/history/xóa/hết hạn và nguồn tri thức có duyệt. Chủ dự án chọn **chưa kết nối provider AI**; phản hồi cơ bản từ server phải ghi rõ trạng thái. 241 tests,21 HTTP/DB rollback,3 concurrency đạt; migration 0008 đã áp dụng. UI FE-T10 trong [task-frontend.md](task-frontend.md); contract [AI_GOVERNANCE.md](../backend/docs/AI_GOVERNANCE.md). Provider thật,UI/vận hành và rà P36/pháp lý còn mở; backend tiếp T11. Các checkpoint dưới là lịch sử.

> Checkpoint backend hiện hành 05/10/2026: T09 sổ thực tế/revision/lịch sử/đối soát/reforecast đã có, 226 tests + 16 HTTP/DB rollback + 3 ca cạnh tranh đạt. Migration 0007 đã áp dụng, không cần tự bổ sung bảng T09. Q15 chưa bật tự nộp surplus, UI còn nghiệm thu theo FE-T09 trong [task-frontend.md](task-frontend.md). Contract [MONTHLY_ACTUALS.md](../backend/docs/MONTHLY_ACTUALS.md); bước backend tiếp T10 AI giải thích/quản trị. Các checkpoint dưới là lịch sử.

> Checkpoint backend thay thế 04/10/2026: T08 có report/compare/simulate/CSV theo snapshot, thử tháng hưu/giá tài sản mà giữ hồ sơ gốc; 215 tests và 31 HTTP/DB rollback đạt, không migration. UI T08 vẫn cần AI frontend sửa theo FE-T08 trong [task-frontend.md](task-frontend.md); backend tiếp T09 thực tế/đối soát. Contract [PLAN_PRESENTATION.md](../backend/docs/PLAN_PRESENTATION.md); không coi forecast là số dư thực.

> Checkpoint backend thay thế 04/10/2026: T07 đã lưu snapshot bất biến, tách lưu/áp dụng, giữ bản gốc/lịch sử và replay, worker chỉ báo cập nhật. 205 tests, 23 HTTP/DB rollback và 3 ca cạnh tranh nhiều kết nối đạt; migration 0006 đã áp dụng. Tiếp T08 nối API/UI nhất quán theo planId/versionId; FE-T07 tại [task-frontend.md](task-frontend.md), contract [PLANS.md](../backend/docs/PLANS.md). Các checkpoint dưới là lịch sử.

> Checkpoint backend thay thế 04/10/2026: T06 đã có engine quỹ theo tháng và API preview chỉ đọc từ hồ sơ v2/nợ/T03/T04/lương hưu; 193 tests và 13 kiểm tra DB thật rollback đạt, build đầy đủ đạt. Chưa lưu/áp dụng kế hoạch; bước tiếp T07 snapshot và version. Yêu cầu UI ở FE-T06 trong [task-frontend.md](task-frontend.md), contract [RETIREMENT_MONTHLY.md](../backend/docs/RETIREMENT_MONTHLY.md). Các checkpoint phía dưới là lịch sử, không thay trạng thái mới nhất trong [PROGRESS.md](../backend/PROGRESS.md).

> Checkpoint backend 04/10/2026: T05 đã có lương hưu nhập tay và tra tuổi nghỉ hưu tham chiếu; không tự tính quyền lợi BHXH theo công thức demo. Engine quỹ cá nhân T06 là bước tiếp. Theo chỉ đạo chủ dự án, AI backend ghi thay đổi giao diện vào [task-frontend.md](task-frontend.md) cho AI frontend; không coi backend test là nghiệm thu UI. Xem [PENSIONS.md](../backend/docs/PENSIONS.md) và [PROGRESS.md](../backend/PROGRESS.md).

> Cập nhật phạm vi 04/10/2026: kế hoạch thực thi/nghiệm thu hiện hành là T00–T12 trong [task.md](task.md), ưu tiên backend. Tài liệu đó thay kế hoạch 14 phase và ghi chú chờ khảo sát cũ; chỉ Q13/Q15 còn trao đổi. Khi có mâu thuẫn về công thức, version hoặc thời điểm dòng tiền, áp dụng yêu cầu đã chốt trong task.md. Xem [tiến độ backend](../backend/PROGRESS.md) để phân biệt nhận việc với đã kiểm chứng.

> Chỉ đạo tiếp theo cùng ngày: làm T01 trước khi hoàn tất T00 và dùng DB thật. Backend hồ sơ v2/migration T01 đã được kiểm chứng; giao diện nhập v2 chưa nối. Dữ liệu v1 giữ nguyên, không tự xác nhận các số 0 cũ.

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

### 02 — Hỗ trợ

> Không có chức năng yêu cầu tư vấn với chuyên viên. Toàn bộ tư vấn do Trợ lý AI đảm nhận. Không xây dựng lại luồng tư vấn, lịch hẹn hay trang quản lý tư vấn.

- Tiếp nhận yêu cầu hỗ trợ
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

## AD04 — (ĐÃ LOẠI BỎ) Quản lý tư vấn

Chức năng yêu cầu tư vấn với chuyên viên đã bị loại khỏi phạm vi sản phẩm. Toàn bộ tư vấn do Trợ lý AI đảm nhận (AD07 và trang Trợ lý AI phía User). Không thiết kế, không xây dựng lại màn hình, route, API hay bảng dữ liệu tư vấn. Người dùng cần trợ giúp gửi yêu cầu hỗ trợ qua Support (AD09).

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
- cảnh báo.

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
AD04 — (Đã loại bỏ) Tư vấn do AI đảm nhận
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
