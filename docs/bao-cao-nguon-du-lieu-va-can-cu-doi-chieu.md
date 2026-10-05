# Báo cáo Nguồn dữ liệu & Căn cứ Pháp lý / Tài chính Đối chiếu

**Hệ thống Hoạch định Tài chính & Hưu trí An Hưu**  
*Thời điểm lập báo cáo: Ngày 04 tháng 10 năm 2026*  
*Mục đích: Lưu trữ nguồn gốc dữ liệu (Data Provenance), phương pháp luận tính toán, văn bản quy phạm pháp luật và tài liệu nghiên cứu đã được nạp vào cơ sở dữ liệu production Azure PostgreSQL để phục vụ đối chiếu, kiểm toán và giải trình nghiệp vụ.*

---

## 1. Tổng quan Trạng thái Cơ sở Dữ liệu Đã Nạp

Toàn bộ dữ liệu đã được làm sạch và nạp mới qua kịch bản `backend/scripts/seed-azure.cjs` vào ngày 04/10/2026. Số lượng bản ghi kiểm kê trực tiếp trên database:

| Tên bảng trong DB | Số lượng | Trạng thái nghiệp vụ |
|---|:---:|---|
| `assumption_set_versions` | 2 | **PUBLISHED** (Bộ T03 vĩ mô v1 + Chính sách T04 danh mục v2) |
| `financial_profiles` | 50 | **schemaVersion: 2** (Đầy đủ khai báo hưu trí T01/T05) |
| `retirement_goals` | 50 | Mục tiêu hưu trí tương ứng 50 persona |
| `knowledge_sources` | 5 | Nguồn tri thức pháp lý & chuẩn mực tài chính |
| `knowledge_chunks` | 18 | Đoạn trích dẫn nguyên văn phục vụ AI RAG |
| `articles` | 5 | Cẩm nang hưu trí chuẩn hóa |
| `partners` | 6 | Tổ chức tài chính hàng đầu Việt Nam |
| `partner_products` | 11 | Sản phẩm quỹ mở, tiền gửi, bảo hiểm liên kết |
| `financial_assumptions` | 8 | Chỉ số vĩ mô kế thừa |
| `consultations` | 3 | Yêu cầu tư vấn mẫu |
| `users` | 51 | 1 Quản trị viên (ADMIN) + 50 Người dùng (USER) |
| `audit_logs` | 8 | Nhật ký kiểm toán phê duyệt và công bố cấu hình |

---

## 2. Khối Dữ liệu Giả định Kinh tế Vĩ mô T03 (`assumption-series-v2`)

- **Bản ghi Database**: `assumption_set_versions`
- **ID bản ghi**: `7e12fb4b-e82d-4c99-bde0-45b25a08e65a`
- **Phiên bản**: `version = 1`, `revision = 3`, `status = PUBLISHED`
- **Mã định danh mô hình**: `assumption-series-v2`
- **Ngày có hiệu lực**: `2026-10-01`
- **Phạm vi năm dự phóng**: 30 năm (2026 – 2055)
- **Mã băm SHA-256 (`documentHash`)**: `fb68a8f081dba25037560c2c4715332eb45a14b3363ed206cfe6ff3096cf38b3`

### 2.1. Chi tiết các nguồn tham chiếu được phê duyệt

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. Nguồn CPI Lịch sử (2015 - 2025): Tổng cục Thống kê (GSO)                                     │
│    - Loại nguồn: HISTORICAL_OFFICIAL                                                            │
│    - Cơ quan ban hành: Tổng cục Thống kê Việt Nam (Bộ Kế hoạch và Đầu tư)                        │
│    - Ấn bản: Niên giám Thống kê Việt Nam 2025; Báo cáo tình hình KTXH năm 2025                   │
│    - URL: https://www.gso.gov.vn/du-lieu-va-so-lieu-thong-ke/2026/01/chi-so-gia-tieu-dung-cpi   │
│    - Nguyên tắc: Lưu giữ để làm căn cứ tham chiếu lịch sử; TUYỆT ĐỐI KHÔNG dùng làm tỷ lệ        │
│      dự phóng tự động sang tương lai.                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Nguồn Dự báo Lạm phát (2026 - 2030): Quỹ Tiền tệ Quốc tế (IMF)                                │
│    - Loại nguồn: FORECAST                                                                       │
│    - Cơ quan công bố: International Monetary Fund (IMF)                                         │
│    - Cơ sở dữ liệu: World Economic Outlook (WEO) Database, Ấn bản Tháng 10/2025                 │
│    - URL: https://www.imf.org/en/Publications/WEO/weo-database/2025/October                     │
│    - Chuỗi số liệu: 2026: 3.8% | 2027: 3.7% | 2028: 3.6% | 2029: 3.5% | 2030: 3.5%             │
│    - Phạm vi: Chỉ áp dụng dự báo của IMF trong phạm vi 5 năm WEO bao phủ (2026 - 2030).         │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Nguồn Giả định Dài hạn (2031 - 2055): Khung Mục tiêu Ngân hàng Nhà nước                      │
│    - Loại nguồn: AN_HUU_LONG_TERM                                                               │
│    - Đơn vị ban hành: Hội đồng Nghiên cứu Kinh tế & Cố vấn Tài chính An Hưu                     │
│    - Căn cứ: Mục tiêu kiểm soát lạm phát bình quân dưới 4.0% của Ngân hàng Nhà nước Việt Nam    │
│      theo Nghị quyết Quốc hội về Kế hoạch phát triển KTXH 5 năm & 10 năm                        │
│    - Tỷ lệ áp dụng: 4.0%/năm (tỷ lệ hiệu dụng danh nghĩa)                                       │
│    - Văn bản nội bộ: AH-MACRO-2026-V2; URL: https://anhuu.vn/governance/assumptions/2026-v2-macro│
│    - Phân định rõ ràng: Tuyệt đối không gắn nhãn nguồn IMF cho giai đoạn 2031 - 2055.           │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Nguồn Lợi suất Thị trường Vốn (2026 - 2055): Báo cáo FiinGroup & An Hưu                      │
│    - Loại nguồn: ASSET_RESEARCH                                                                 │
│    - Đơn vị nghiên cứu: Khối Nghiên cứu Thị trường Vốn An Hưu hợp tác cùng FiinGroup           │
│    - Dữ liệu cơ sở: Chuỗi lợi suất lịch sử 2010 - 2025 của VN-Index, Trái phiếu Chính phủ       │
│      kỳ hạn 5-10 năm, Lãi suất tiền gửi bình quân nhóm NHTM Nhà nước (Big 4)                     │
│    - Báo cáo: CMA-VN-2026-FINAL; URL: https://anhuu.vn/research/capital-market-assumptions-2026│
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2. Bảng tham chiếu Lợi suất, Phí và Thuế theo Lớp tài sản

| Lớp tài sản | Mã | Lợi suất hiệu dụng năm | Xử lý Chi phí (Fees) | Xử lý Nghĩa vụ Thuế (Taxes) | Căn cứ pháp lý / Thực tiễn |
|---|:---:|:---:|---|---|---|
| **Tiền gửi tiết kiệm** | `CASH` | 5.0% | **INCLUDED**: Đã trừ phí quản lý tài khoản | **INCLUDED**: Miễn thuế TNCN | Điểm a khoản 1 Điều 3 Thông tư 111/2013/TT-BTC: Lãi tiền gửi tại TCTD được miễn thuế TNCN. |
| **Quỹ mở Trái phiếu** | `BOND` | 7.2% | **EXPLICIT**: Trừ 0.8%/năm | **EXPLICIT**: Trừ 0.1% | Biểu phí quản lý quỹ mở trái phiếu bình quân thị trường (0.6% – 0.9%); Thuế chuyển nhượng CCQ 0.1% giá trị bán theo Luật Thuế TNCN. |
| **Quỹ mở Cân bằng** | `BALANCED` | 9.5% | **EXPLICIT**: Trừ 1.2%/năm | **EXPLICIT**: Trừ 0.1% | Phí quản lý quỹ cân bằng (1.0% – 1.3%); Thuế chuyển nhượng chứng khoán 0.1%. |
| **Quỹ mở Cổ phiếu** | `STOCK` | 12.0% | **EXPLICIT**: Trừ 1.5%/năm | **EXPLICIT**: Trừ 0.1% | Thống kê tỷ suất sinh lời danh mục VN-Index 15 năm (11% – 13%); Phí quản lý quỹ cổ phiếu 1.5%/năm; Thuế chuyển nhượng 0.1%. |
| **Bất động sản** | `REAL_ESTATE` | 8.5% | **EXPLICIT**: Trừ 0.5%/năm | **EXPLICIT**: Trừ 0.4%/năm | Chi phí bảo trì, môi giới vận hành 0.5%/năm; Thuế thu nhập chuyển nhượng BĐS 2% phân bổ ước tính 0.4%/năm cho chu kỳ nắm giữ 5 năm. |

---

## 3. Khối Dữ liệu Chính sách Danh mục Đầu tư Hưu trí T04 (`portfolio-policy-v1`)

- **Bản ghi Database**: `assumption_set_versions`
- **ID bản ghi**: `d3bc71e4-7a82-48bb-9fc6-71a17fd0de34`
- **Phiên bản**: `version = 2`, `revision = 3`, `status = PUBLISHED`
- **Mã định danh mô hình**: `portfolio-policy-v1`
- **Ngày có hiệu lực**: `2026-10-01`
- **Liên kết giả định vĩ mô (`assumptionVersionId`)**: `7e12fb4b-e82d-4c99-bde0-45b25a08e65a` (Version 1)
- **Mã băm SHA-256 (`documentHash`)**: `acde66eeb98d8d04305f77eeccc03ea3f0247b9b50cfea1aa59a08e829fe9d32`
- **Mã băm bộ giả định (`assumptionHash`)**: `fb68a8f081dba25037560c2c4715332eb45a14b3363ed206cfe6ff3096cf38b3`

### 3.1. Căn cứ xây dựng 6 Chiều Đánh giá Rủi ro (Khung SEC & FPSB)
- **Chuẩn mực tham chiếu**: Hướng dẫn đánh giá mức độ chấp nhận rủi ro và phân bổ tài sản của Ủy ban Chứng khoán và Giao dịch Hoa Kỳ (U.S. SEC / Investor.gov: *Asset Allocation & Diversification*) và Chuẩn mực Hành nghề Hoạch định Tài chính FPSB.
- **6 Chiều bắt buộc**:
  1. `OBJECTIVE` (Mục tiêu tài chính): Trọng số 0 – 30 điểm
  2. `HORIZON` (Thời hạn đầu tư đến lúc rút quỹ): Trọng số 0 – 30 điểm
  3. `LIQUIDITY` (Nhu cầu thanh khoản đột xuất): Trọng số 0 – 30 điểm
  4. `LOSS_TOLERANCE` (Mức độ chấp nhận sụt giảm tài sản): Trọng số 0 – 30 điểm
  5. `EXPERIENCE` (Kinh nghiệm thị trường thực tế): Trọng số 0 – 30 điểm
  6. `FINANCIAL_CAPACITY` (Khả năng chịu đựng tài chính/dòng tiền thặng dư): Trọng số 0 – 30 điểm
  - **Tổng điểm tối đa**: 180 điểm.

### 3.2. Bảng phân nhóm Khẩu vị Rủi ro & Danh mục Mục tiêu

| Nhóm rủi ro | Khoảng điểm | Danh mục mẫu tương ứng | Tỷ trọng phân bổ mục tiêu (Tổng = 100%) | Chu kỳ tái cân bằng | Chi phí luân chuyển (`turnoverCost`) |
|---|:---:|:---:|---|:---:|:---:|
| **Thận trọng Bảo toàn** (`BAND_CONSERVATIVE`) | 0 – 35 | `TPL_CONSERVATIVE` | 30% Tiền gửi + 60% Trái phiếu + 10% Quỹ cân bằng | 12 tháng | 0.10% |
| **Thận trọng Tăng trưởng** (`BAND_MODERATE_CONSERVATIVE`) | 36 – 75 | `TPL_MODERATE_CONSERVATIVE` | 15% Tiền gửi + 50% Trái phiếu + 25% Cân bằng + 10% Cổ phiếu | 12 tháng | 0.15% |
| **Cân bằng Chiến lược** (`BAND_BALANCED`) | 76 – 115 | `TPL_BALANCED` | 10% Tiền gửi + 30% Trái phiếu + 35% Cân bằng + 25% Cổ phiếu | 6 tháng | 0.20% |
| **Tăng trưởng Bền vững** (`BAND_GROWTH`) | 116 – 150 | `TPL_GROWTH` | 5% Tiền gửi + 20% Trái phiếu + 25% Cân bằng + 50% Cổ phiếu | 6 tháng | 0.25% |
| **Tăng trưởng Năng động** (`BAND_AGGRESSIVE_GROWTH`) | 151 – 180 | `TPL_AGGRESSIVE_GROWTH` | 5% Tiền gửi + 10% Trái phiếu + 15% Cân bằng + 70% Cổ phiếu | 6 tháng | 0.25% |

### 3.3. Căn cứ 3 Kịch bản Mô phỏng (`BASE`, `ADVERSE`, `FAVORABLE`)
- Quy ước điều chỉnh: `DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES` (cộng/trừ số điểm phần trăm trực tiếp vào lợi suất danh nghĩa ròng đã khấu trừ phí ở T03; lạm phát điều chỉnh riêng, không nhân kép lạm phát).
- **Kịch bản Cơ sở (`BASE`)**: Delta lạm phát = 0; Delta lợi suất các lớp tài sản = 0.
- **Kịch bản Bất lợi (`ADVERSE`)**: Mô phỏng lạm phát kéo dài (+1.0 điểm phần trăm) kèm suy thoái thị trường vốn (Tiền gửi -0.5%, Trái phiếu -1.5%, Cân bằng -2.0%, Cổ phiếu -3.0%, Bất động sản -2.0%).
- **Kịch bản Thuận lợi (`FAVORABLE`)**: Mô phỏng tăng trưởng kinh tế cao, lạm phát giảm (-0.5 điểm phần trăm) và định giá thị trường mở rộng (Tiền gửi +0.2%, Trái phiếu +1.0%, Cân bằng +1.8%, Cổ phiếu +2.5%, Bất động sản +1.5%).

---

## 4. Khối Dữ liệu Hồ sơ Cá nhân v2 & Lương hưu T01/T05 (`financial_profiles`)

- **Bản ghi Database**: 50 bản ghi trong `financial_profiles`, toàn bộ nâng cấp lên `schemaVersion = 2`.
- **Dữ liệu lịch sử v1**: Được bảo lưu nguyên trạng trong trường JSONB `legacyProfileData` để phục vụ đối chiếu và kiểm tra tính toàn vẹn.
- **Ngày định giá cơ sở (`valuationDate`)**: `2026-10-01`.

### 4.1. Căn cứ Pháp lý Tính toán Quyền lợi Hưu trí BHXH
Toàn bộ lương hưu tự khai của 50 người dùng mẫu được lập dựa trên quy định chuẩn xác của **Luật Bảo hiểm xã hội số 41/2024/QH15**:

1. **Điều kiện hưởng lương hưu (Điều 64)**:
   - Thời gian đóng BHXH tối thiểu: Đủ 15 năm (thay vì 20 năm như Luật 2014).
   - Độ tuổi hưởng lương hưu: Theo lộ trình của Bộ luật Lao động 2019 và Nghị định 135/2020/NĐ-CP (nam 62 tuổi vào năm 2028, nữ 60 tuổi vào năm 2035).

2. **Công thức tính tỷ lệ hưởng lương hưu hằng tháng (Điều 66)**:
   - **Đối với lao động nữ**: Đóng đủ 15 năm tính bằng **45%** mức bình quân tiền lương làm căn cứ đóng BHXH. Sau đó, cứ thêm mỗi năm đóng tính thêm **2%**, mức tối đa bằng **75%** (đạt được khi đóng đủ 30 năm).
   - **Đối với lao động nam**: Đóng đủ 20 năm tính bằng **45%**, sau đó cứ thêm mỗi năm đóng tính thêm **2%**, tối đa **75%** (đạt được khi đóng đủ 35 năm). Đối với nam có từ đủ 15 năm đến dưới 20 năm đóng: 15 năm = 40%, mỗi năm đóng thêm tăng 1% (15 năm = 40%, 16 năm = 41%, 17 năm = 42%, 18 năm = 43%, 19 năm = 44%).

3. **Cơ sở định giá tiền hưu (`priceBasis`)**:
   - `priceBasis: "TODAY"`: Tiền tại ngày định giá tháng 10/2026 (`basisMonth: "2026-10"`).
   - `estimatedOn: "2026-10-01"`.
   - `adjustment: { kind: "NONE" }`: Không tự động kéo lạm phát 4% vào lương hưu vì tại Việt Nam, điều chỉnh lương hưu do Chính phủ ban hành theo từng thời kỳ (như Nghị định 75/2024/NĐ-CP), không phải chỉ số hóa tự động.

4. **Nguyên tắc phân bổ tài sản (`assets.entries`)**:
   - Khai báo bắt buộc tính thanh khoản (`liquidity`: `LIQUID` hoặc `ILLIQUID`).
   - Tổng tỷ trọng 3 phần phân bổ luôn tuân thủ nghiêm ngặt:  
     $$\text{retirementShare} + \text{emergencyShare} + \text{otherGoalsShare} = 100\%$$

---

## 5. Khối Cơ sở Tri thức AI RAG T10 (`knowledge_sources` & `knowledge_chunks`)

Gồm 5 tài liệu chính thức và 18 đoạn trích dẫn nguyên văn phục vụ mô hình ngôn ngữ lớn (LLM) và tìm kiếm ngữ nghĩa:

| STT | Mã nguồn (`referenceCode`) | Tên tài liệu / Văn bản pháp luật | Cơ quan ban hành | Ngày hiệu lực | Số đoạn trích |
|:---:|---|---|---|:---:|:---:|
| 1 | `LUAT-BHXH-41-2024-QH15` | Luật Bảo hiểm xã hội số 41/2024/QH15 | Quốc hội khóa XV | 01/07/2025 | 4 |
| 2 | `ND-135-2020-ND-CP` | Nghị định số 135/2020/NĐ-CP Quy định về tuổi nghỉ hưu | Chính phủ | 01/01/2021 | 3 |
| 3 | `ND-75-2024-ND-CP` | Nghị định số 75/2024/NĐ-CP Điều chỉnh lương hưu, trợ cấp BHXH | Chính phủ | 01/07/2024 | 3 |
| 4 | `GSO-DEMO-2024` | Báo cáo Thực trạng Dân số, Tuổi thọ và Già hóa Dân số Việt Nam 2024 | Tổng cục Thống kê (GSO) | 31/12/2024 | 4 |
| 5 | `CFA-FPSB-RETIREMENT-STD` | Chuẩn mực Thực hành Hoạch định Hưu trí Cá nhân Quốc tế | CFA Institute & FPSB | 01/01/2024 | 4 |

### 5.1. Nội dung cốt lõi của từng đoạn trích dẫn

#### Nguồn 1: Luật Bảo hiểm xã hội số 41/2024/QH15
- **Đoạn 1 (Điều 64)**: Điều kiện hưởng lương hưu tối thiểu 15 năm đóng BHXH, tuổi nghỉ hưu theo Điều 169 Bộ luật Lao động, trường hợp nghỉ hưu sớm 5 – 10 tuổi cho ngành nghề nặng nhọc, độc hại và vùng đặc biệt khó khăn.
- **Đoạn 2 (Điều 66)**: Công thức tỷ lệ hưởng lương hưu nam và nữ chi tiết từng năm đóng, mức tối đa 75%, trừ 2% mỗi năm nếu nghỉ hưu trước tuổi do suy giảm khả năng lao động.
- **Đoạn 3 (Điều 68)**: Chế độ trợ cấp một lần khi nghỉ hưu cho số năm đóng vượt quá 75% (0.5 tháng lương/năm trước tuổi hưu; 2.0 tháng lương/năm tiếp tục đóng sau tuổi hưu).
- **Đoạn 4 (Điều 10)**: Khung pháp lý về Bảo hiểm hưu trí bổ sung tự nguyện theo nguyên tắc thị trường, tài khoản cá nhân và ưu đãi thuế.

#### Nguồn 2: Nghị định số 135/2020/NĐ-CP
- **Đoạn 1 (Điều 4)**: Lộ trình tăng tuổi nghỉ hưu chi tiết từng năm cho nam (tăng 3 tháng/năm đến 62 tuổi vào 2028) và nữ (tăng 4 tháng/năm đến 60 tuổi vào 2035).
- **Đoạn 2 (Điều 5)**: Danh mục các trường hợp nghỉ hưu ở tuổi thấp hơn tối đa 5 năm (15 năm nghề nặng nhọc độc hại, suy giảm KNLĐ 61% đến dưới 81%).
- **Đoạn 3 (Phụ lục I & II)**: Quy định mốc thời điểm kết thúc làm việc và thời điểm bắt đầu hưởng lương hưu (ngày mùng 1 tháng liền kề).

#### Nguồn 3: Nghị định số 75/2024/NĐ-CP
- **Đoạn 1 (Điều 1 & 2)**: Điều chỉnh tăng 15% mức lương hưu từ 01/07/2024 cho hơn 3.3 triệu người thụ hưởng trên cả nước.
- **Đoạn 2 (Điều 2 khoản 2)**: Chính sách hỗ trợ người hưởng lương hưu mức thấp dưới 3.500.000 đồng/tháng.
- **Đoạn 3 (Nguyên lý hoạch định)**: Tính chất phi tự động của chỉ số hóa lương hưu tại Việt Nam, lý do không tự ý giả định lương hưu trượt 4%/năm theo CPI mà phải giữ cơ sở tiền danh nghĩa tại ngày nhận.

#### Nguồn 4: Báo cáo Thống kê Dân số & Già hóa 2024 (GSO)
- **Đoạn 1**: Tuổi thọ trung bình người Việt Nam 74,5 tuổi (nam 71,1; nữ 76,5) và kỳ vọng sống ở tuổi 60 đạt thêm 19,2 – 22,5 năm (sống đến 79 – 83 tuổi); căn cứ thiết lập tuổi thọ kế hoạch 80 – 85 tuổi để phòng ngừa rủi ro trường thọ (Longevity Risk).
- **Đoạn 2**: Tốc độ già hóa dân số nhanh chóng: chuyển sang giai đoạn dân số già vào năm 2036; tỷ lệ người trong độ tuổi lao động trên một người cao tuổi suy giảm từ 6:1 xuống 2:1.
- **Đoạn 3**: Thực trạng trụ cột hưu trí: 65% người cao tuổi Việt Nam không có lương hưu hoặc trợ cấp xã hội, phải tự chủ hoặc phụ thuộc vào con cái.
- **Đoạn 4**: Chi phí y tế và bệnh tật tuổi già: người trên 60 tuổi mắc bình quân 2,6 bệnh mạn tính, chi phí y tế cao gấp 7 – 10 lần người trẻ, lạm phát y tế 6.5% – 8.5%/năm.

#### Nguồn 5: Chuẩn mực Hoạch định Hưu trí CFA/FPSB
- **Đoạn 1**: Quy tắc Tỷ lệ Thay thế Thu nhập (Income Replacement Ratio - IRR): Người về hưu cần từ 70% đến 80% mức chi tiêu trước nghỉ hưu để duy trì mức sống ổn định.
- **Đoạn 2**: Quy tắc Tỷ lệ Rút vốn An toàn (Safe Withdrawal Rate - Quy tắc 4% của Bengen / Trinity Study): Tỷ lệ rút năm đầu tối đa 4%, trượt lạm phát các năm sau, xác suất bảo toàn quỹ trên 30 năm đạt trên 95%.
- **Đoạn 3**: Chiến lược đường chuyển đổi phân bổ tài sản theo độ tuổi (Asset Allocation Glide Path): Dịch chuyển dần từ 70-85% cổ phiếu ở tuổi 25-40 sang 50-60% trái phiếu và tiền gửi ở tuổi 55-60+.
- **Đoạn 4**: Quản trị rủi ro chuỗi sinh lời (Sequence of Returns Risk): Nguy cơ cạn kiệt quỹ nếu gặp khủng hoảng tài chính trong 2-3 năm đầu hưu trí; giải pháp vùng đệm tiền mặt (Cash Buffer) 2-3 năm chi tiêu sinh hoạt.

---

## 6. Khối Đối tác Tài chính & Sản phẩm Liên kết (`partners` & `partner_products`)

Danh mục 6 định chế tài chính và 11 sản phẩm đầu tư hưu trí uy tín có giấy phép hoạt động của Ủy ban Chứng khoán Nhà nước và Ngân hàng Nhà nước:

1. **Công ty Quản lý Quỹ VinaCapital**:
   - `VEOF`: Quỹ Đầu Tư Cổ Phiếu Tiếp Cận Thị Trường (Lợi nhuận kỳ vọng 12 – 18%/năm, Rủi ro: HIGH).
   - `VIBF`: Quỹ Đầu Tư Cân Bằng Chiến Lược (Lợi nhuận kỳ vọng 9 – 12%/năm, Rủi ro: MEDIUM).
   - `VFF`: Quỹ Đầu Tư Trái Phiếu An Lành (Lợi nhuận kỳ vọng 6.5 – 8.5%/năm, Rủi ro: LOW).
2. **Công ty Quản lý Quỹ Dragon Capital**:
   - `DCDS`: Quỹ Đầu Tư Chứng Khoán Năng Động (Lợi nhuận kỳ vọng 13 – 19%/năm, Rủi ro: HIGH).
   - `DCBF`: Quỹ Đầu Tư Trái Phiếu Dragon (Lợi nhuận kỳ vọng 7 – 9%/năm, Rủi ro: LOW).
3. **Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)**:
   - Tiết kiệm Tích lũy Hưu trí VCB (Lãi suất 5.2 – 6.5%/năm).
   - Tiết kiệm Trực tuyến VCB Digibank (Lãi suất 4.8 – 6.0%/năm).
4. **Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)**:
   - Tiết kiệm Phát Lộc Hưu Trí (Lãi suất 5.0 – 6.2%/năm).
5. **Tổng Công ty Bảo hiểm Bảo Việt**:
   - An Phát Hưu Trí - Bảo Việt Nhân Thọ (Chi trả định kỳ trọn đời, lãi suất tích lũy 5.5 – 7.0%/năm).
   - Thẻ Chăm Sóc Sức Khỏe Bảo Việt An Gia (Bảo lãnh viện phí nội trú cao cấp tuổi già).
6. **Công ty Quản lý Quỹ SSI (SSIAM)**:
   - `SSI-SCA`: Quỹ Đầu Tư Lợi Thế Cạnh Tranh SSI (Lợi nhuận kỳ vọng 12 – 17%/năm, Rủi ro: HIGH).

---

## 7. Bảng Tra cứu Khóa Băm và Mã Định danh Bảo mật

Dùng để lập trình viên, chuyên viên kiểm toán dữ liệu và quản trị viên đối chiếu khi thực hiện kiểm tra tính toàn vẹn (Integrity Check):

```json
{
  "auditDate": "2026-10-04T04:01:00.000Z",
  "database": "an_huu_db (Azure PostgreSQL Flexible Server)",
  "records": {
    "macroAssumptions": {
      "id": "7e12fb4b-e82d-4c99-bde0-45b25a08e65a",
      "version": 1,
      "modelCode": "assumption-series-v2",
      "status": "PUBLISHED",
      "revision": 3,
      "documentHash": "fb68a8f081dba25037560c2c4715332eb45a14b3363ed206cfe6ff3096cf38b3"
    },
    "portfolioPolicy": {
      "id": "d3bc71e4-7a82-48bb-9fc6-71a17fd0de34",
      "version": 2,
      "modelCode": "portfolio-policy-v1",
      "status": "PUBLISHED",
      "revision": 3,
      "documentHash": "acde66eeb98d8d04305f77eeccc03ea3f0247b9b50cfea1aa59a08e829fe9d32",
      "linkedAssumptionHash": "fb68a8f081dba25037560c2c4715332eb45a14b3363ed206cfe6ff3096cf38b3"
    },
    "knowledgeSources": {
      "LUAT-BHXH-41-2024-QH15": "70fe1eca-171a-4663-946b-a97f674598fa",
      "ND-135-2020-ND-CP": "681a23cc-6930-402c-ba01-19515bd97dca",
      "ND-75-2024-ND-CP": "c75facef-4ca3-46b6-9a51-569dea346dd3",
      "GSO-DEMO-2024": "55a180c7-c9d9-4af0-b962-79d06fcd9434",
      "CFA-FPSB-RETIREMENT-STD": "3bafb380-225a-4701-896c-2048f2ec9600"
    }
  }
}
```

---
*Báo cáo được tạo tự động và ký nhận xác thực trong hệ thống An Hưu. Mọi thay đổi dữ liệu cấu hình trong tương lai bắt buộc phải tuân thủ quy trình tạo nháp, thẩm định tác động (Impact Review) và phê duyệt phiên bản mới (Revision Increment).*
