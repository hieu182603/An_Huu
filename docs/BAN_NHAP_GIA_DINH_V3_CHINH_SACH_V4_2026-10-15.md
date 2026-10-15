# Bản nháp chờ duyệt: Bộ giả định v3 và Chính sách danh mục v4

Ngày lập: 15/10/2026.

**Cập nhật 15/10/2026:** người dùng đã duyệt cả 7 điểm ở mục 6 theo phương án đề xuất. Phần engine đã commit (`001a87b`, nhánh `develop`). Bộ giả định **v3 đã có trong DB ở trạng thái DRAFT** (id `d9b30f3b-8a8a-443c-9294-c4e88a26adb6`), chưa duyệt và chưa công bố. Chính sách v4 vẫn là file, đã trỏ đúng id v3; chỉ tạo được trong DB sau khi v3 công bố.

Trạng thái ban đầu: CHƯA ghi vào DB, CHƯA công bố. Bản nháp đang là file:

- `backend/seed-data/allocation-2026-10/draft-assumptions-v3.json`
- `backend/seed-data/allocation-2026-10/draft-policy-v4.json`

Hai file được sinh lại được bằng lệnh `node scripts/build-allocation-drafts.cjs`. Kết quả chạy thử trên DB thật nằm ở `simulation-summary.json`, sinh bằng `scripts/simulate-allocation-drafts.cjs` (chỉ đọc).

---

## 1. Tóm tắt

| | Đang công bố (giả định v1 + chính sách v2) | Bản nháp (giả định v3 + chính sách v4) |
|---|---|---|
| Năm dự báo | 2026–2055 | **2026–2110** |
| Thời hạn kế hoạch tối đa | 351 tháng | **1.200 tháng** (giới hạn của engine) |
| Nhóm tài sản | Tiền gửi, Trái phiếu, Quỹ cân bằng, Cổ phiếu, BĐS | **Tiền gửi, TPCP, Cổ phiếu đa dạng hóa, Vàng** |
| Cách chọn tỷ trọng | 5 mẫu cố định suốt 360 tháng, chọn theo điểm khảo sát | **Danh mục nền của tài liệu, giảm dần rủi ro theo số năm tới nghỉ hưu**; điểm khảo sát chỉ chọn giữa bản nền và bản thận trọng |
| Lợi suất cổ phiếu (trước phí) | 12% (nguồn không truy cập được) | **8,17%** (công thức co ước lượng, có nguồn) |
| Lạm phát 2026–2027 | 3,8% / 3,7% | **4,7% / 4,9%** (IMF WEO 10/2026) |
| CPI 2025 (lịch sử) | 3,80% (sai) | **3,31%** (Cục Thống kê) |
| Hồ sơ tính được kế hoạch (52 hồ sơ thật) | **0/52** | **52/52** |

## 2. Thay đổi code (đã làm, đã test, chưa commit)

- `portfolios/schema.ts`: thêm `schemaVersion: 2` với `glidePath`. Mỗi template là một tập điểm `{ yearsToAnchor, allocations }`, neo vào **tháng nghỉ hưu của kế hoạch**. Tỷ trọng được nội suy tuyến tính theo số năm nguyên còn lại; khi còn dưới 12 tháng và sau khi nghỉ hưu thì dùng điểm 0 (còn đúng 12 tháng vẫn là bậc 1 năm). Schema v1 giữ nguyên cả thứ tự khóa.
- `portfolios/engine.ts`: kiểm tra hợp lệ cho v2 (bắt buộc có điểm 0, không trùng điểm, tổng tỷ trọng 100%); tái cân bằng khi bậc năm thay đổi và tính chi phí luân chuyển như ranh giới lịch của v1. Thiếu tháng nghỉ hưu thì trả `RETIREMENT_MONTH_REQUIRED`, không tự đoán theo tuổi.
- `retirement/prepare.ts`: truyền tháng nghỉ hưu của hồ sơ (kể cả khi đang mô phỏng giả định) vào engine danh mục. Chính sách v1 bỏ qua trường này.
- `portfolios/guidance.ts`: thêm thông điệp tiếng Việt cho `RETIREMENT_MONTH_REQUIRED`.
- Đặc tả OpenAPI `docs/portfolios.openapi.yaml`: sinh lại; chỉ thay đổi ở `Document`, `Write`, `Input`. Trình sinh được bổ sung trường `guidance` vốn trước đó chỉ được thêm tay.

**Kiểm chứng:**
- Toàn bộ test backend: **702/702** qua. Gồm 5 test mới cho v2 và 1 test đầu-cuối qua `prepareRetirement`.
- Typecheck mã nguồn và test: qua.
- Hash của chính sách v2 đang công bố, khi parse bằng schema mới, **vẫn khớp** hash đã phê duyệt trong DB.
- Kế hoạch đã lưu không bị ảnh hưởng: xem lại dùng số đã tính sẵn, còn `upgrade.ts` dùng lại bản chính sách v1 mà kế hoạch đó đã ghim.

## 3. Bộ giả định v3

### 3.1 Nguồn (đã truy cập ngày 15/10/2026)

| Mã nguồn | Loại | Nội dung đã xác minh |
|---|---|---|
| `NSO_CPI` | Lịch sử chính thức | Cục Thống kê, thông cáo ngày 06/01/2026: CPI cả năm 2025 tăng **3,31%**. Các năm 2015–2024 giữ theo v1; đã đối chiếu khớp chuỗi lịch sử của IMF sau làm tròn |
| `IMF_WEO_2026_10` | Dự báo | IMF WEO tháng 10/2026 (datamapper, cập nhật 08/10/2026): 4,7 / 4,9 / 4,7 / 4,6 / 4,2 / 3,8% cho 2026–2031 |
| `AH_CPI_LONG_TERM` | Giả định An Hưu | 4,0%/năm cho 2032–2110, giữ đúng mức đã duyệt ở v1 |
| `HNX_TPCP_2026_09` | Nghiên cứu tài sản | HNX, báo cáo thị trường TPCP tháng 9/2026 (công bố 09/10/2026): lãi suất trúng thầu 10 năm **4,43%** |
| `VCB_DEPOSIT_2026_10` | Nghiên cứu tài sản | Vietcombank niêm yết: 12 tháng 5,90%; 36–60 tháng **5,30%** |
| `AH_CASH_LONG_TERM` | Giả định An Hưu | 4,5%/năm từ 2031 |
| `AH_EQUITY_SHRINK` | Giả định An Hưu | Công thức co ước lượng của tài liệu (xem mục 3.2) |
| `AH_GOLD_LONG_TERM` | Giả định An Hưu | 5,0% = lạm phát dài hạn 4% + 1 điểm |

### 3.2 Lợi suất mỗi năm (danh nghĩa)

| Nhóm | Trước phí | Phí/năm | Thuế/năm | **Ròng** | Căn cứ |
|---|---|---|---|---|---|
| Tiền gửi 2026–2030 | 5,30% | 0 | 0 (miễn thuế TNCN) | **5,30%** | Vietcombank, kỳ hạn 36–60 tháng |
| Tiền gửi 2031–2110 | 4,50% | 0 | 0 | **4,50%** | Mốc dài hạn (CHỜ DUYỆT) |
| TPCP | 4,43% | 0 | 0 | **4,43%** | HNX 10 năm. Giả định nắm giữ trực tiếp; thuế CHỜ DUYỆT |
| Cổ phiếu | 8,17% | 0,82% | 0,10% | **7,25%** | 0,5 × 11,91% (VN-Index 2015→2025, chưa gồm cổ tức) + 0,5 × 4,43%; phí = tỷ lệ chi phí ETF VN30 (Dragon Capital) |
| Vàng | 5,00% | 0 | 0 | **5,00%** | Giả định An Hưu; chênh mua/bán không trừ hằng năm |

Lưu ý: lợi suất lịch sử của VN-Index rất nhạy với khoảng thời gian chọn. Giai đoạn 2015–2025 đạt 11,9%/năm, nhưng giai đoạn 2010–2019 chỉ khoảng 6,4%/năm.

## 4. Chính sách v4: danh mục nền giảm dần rủi ro

Câu hỏi khảo sát và 5 nhóm rủi ro giữ nguyên như v2. Có 2 lộ trình (tỷ trọng theo thứ tự tiền gửi / TPCP / cổ phiếu / vàng):

| Số năm tới nghỉ hưu | `TPL_BASE_GLIDE` (bảng của tài liệu) | `TPL_CAUTIOUS_GLIDE` (lùi một bậc thời hạn) |
|---|---|---|
| ≥ 15 | 10 / 20 / **60** / 10 | 15 / 30 / **45** / 10 |
| 14 | 11 / 22 / 57 / 10 | 17 / 32 / 41 / 10 |
| 13 | 12 / 24 / 54 / 10 | 19 / 34 / 37 / 10 |
| 12 | 13 / 26 / 51 / 10 | 21 / 36 / 33 / 10 |
| 11 | 14 / 28 / 48 / 10 | 23 / 38 / 29 / 10 |
| 5–10 | 15 / 30 / **45** / 10 | 25 / 40 / 25 / 10 |
| 4 | 20 / 35 / 35 / 10 | 25 / 40 / 25 / 10 |
| ≤ 3 và sau nghỉ hưu | 25 / 40 / **25** / 10 | 25 / 40 / 25 / 10 |

- Nhóm Cân bằng, Tăng trưởng và Tăng trưởng năng động dùng `TPL_BASE_GLIDE`. Cổ phiếu tối đa 60%, kể cả khi điểm khảo sát cao.
- Nhóm Thận trọng và Thận trọng tăng trưởng dùng `TPL_CAUTIOUS_GLIDE`.
- Các quy tắc áp cho thời hạn 1–1.200 tháng.
- Tái cân bằng hằng năm, hoặc khi đổi bậc năm, với chi phí luân chuyển 0,2%.
- Kịch bản bất lợi và thuận lợi giữ mức điều chỉnh của v2 cho các nhóm cũ (cổ phiếu −3/+2,5; TPCP −1,5/+1; tiền gửi −0,5/+0,2; CPI +1/−0,5). Riêng vàng dùng **−2/+1,5 (CHỜ DUYỆT)**.

## 5. Chạy thử trên 52 hồ sơ v2 thật (chỉ đọc, kịch bản cơ sở)

Cách chạy: mốc kết thúc = tháng sinh + tuổi thọ (82); câu trả lời khảo sát suy từ `riskLevel` của mục tiêu (LOW → Thận trọng, MEDIUM → Cân bằng, HIGH → Tăng trưởng); mức chi và khoản góp lấy từ mục tiêu đã lưu.

| | Đang công bố | Đang công bố, cắt mốc kết thúc ở 2055 | **Bản nháp v3/v4** |
|---|---|---|---|
| Tính được | 0/52 | 46/52 (6 lỗi do nghỉ hưu sau 2055) | **52/52** |
| Quỹ cần lúc nghỉ hưu (trung vị) | — | 1,9 tỷ | **8,21 tỷ** |
| Quỹ dự kiến (trung vị) | — | 16,7 tỷ | **10,56 tỷ** |
| Độ phủ (trung vị) | — | 814% | **139%** |
| Cần góp thêm | — | 2 hồ sơ | **8 hồ sơ** |
| Thiếu tiền trong giai đoạn hưu | — | 2 | **8** |

Cột "cắt ở 2055" cho thấy vì sao không được tạm cắt mốc kết thúc: giai đoạn hưu bị rút ngắn nên quỹ cần chỉ còn khoảng một phần tư, và người dùng sẽ được trấn an sai.

Tỷ trọng cổ phiếu lúc bắt đầu theo bản nháp: nhóm MEDIUM/HIGH 60%; nhóm LOW từ 25% đến 45% (trung vị 33%). Tại tháng nghỉ hưu, mọi nhóm khoảng 25%.

## 6. Các điểm cần bạn quyết định trước khi công bố

1. **Thuế lãi TPCP với cá nhân:** đang để 0, cần xác nhận pháp lý.
2. **Lợi suất tiền gửi dài hạn 4,5% từ 2031** (tài liệu dùng mức này làm ví dụ).
3. **Hệ số co a = 0,5 cho cổ phiếu và không cộng phần bù rủi ro.** Đây là cách thận trọng, cho 8,17% trước phí.
4. **Vàng 5%/năm**, cùng mức điều chỉnh kịch bản −2/+1,5.
5. **Nội suy ở khoảng 10–15 năm và 3–5 năm**, và dùng cột "≤3 năm" cho cả giai đoạn sau nghỉ hưu. Tài liệu chưa nói rõ hai điểm này (câu hỏi 1 trong báo cáo).
6. **Lộ trình thận trọng "lùi một bậc thời hạn"**, chỉ dùng các con số có sẵn trong tài liệu.
7. **Ngày hiệu lực** đang đặt 16/10/2026.

## 7. Thứ tự công bố đề xuất (cần bạn cho phép ở bước ghi DB)

1. **Frontend làm xong mục 17 trong `docs/task-frontend.md`.** Trang Danh mục hiện đọc `template.schedule`, nên sẽ lỗi nếu gặp chính sách v2. Đây là điều kiện chặn.
2. Tạo bản nháp giả định v3 → xem tác động → duyệt → công bố. Hệ thống chỉ cho duyệt chính sách khi bộ giả định mà nó trỏ tới đã công bố.
3. Tạo bản nháp chính sách v4, thay `assumptionVersionId` giữ chỗ bằng id thật của v3 → kiểm tra hợp lệ → duyệt → công bố ngay sau bước 2. Nếu để cách quãng, người dùng sẽ thấy thông báo "có giả định mới" trong khi chính sách đang dùng vẫn trỏ về v1.
4. Không sửa hay xóa giả định v1 và chính sách v2: kế hoạch đã lưu đang ghim chúng. Người dùng chủ động tạo phiên bản kế hoạch mới theo luồng "cập nhật giả định" có sẵn.
5. Khôi phục: nếu có sự cố, công bố một bản v5 mới (không có thao tác gỡ công bố). Kế hoạch cũ vẫn xem lại được.
