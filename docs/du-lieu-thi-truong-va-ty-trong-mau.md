# Bản nháp: dữ liệu thị trường thật và bộ tỷ trọng mẫu cho trang Phân bổ tài sản

Ngày lập: 18/11/2026. Trạng thái: **NHÁP, chưa ghi DB, chưa công bố, chưa commit.**
Các con số dưới đây là **tham số mô hình** để admin xem xét, không phải lời khuyên đầu tư cho cá nhân nào.

File đi kèm:
- `backend/data/drafts/policy-params-draft.json`: lộ trình tỷ trọng, `lossStress`, `allocationRisk` (gồm `essentialThreshold`, `equityShiftPoints`), `customization.bounds`.
- `backend/src/tests/drafts-schema.test.ts`: test **chỉ đọc file**. Test parse bản nháp bằng các schema thật, ghép vào chính sách v4 trong bộ nhớ, rồi chạy `validatePortfolioPolicy` với bộ giả định v3. Kết quả: không có lỗi nào. Nếu sau này có `market-data-draft.json`, test sẽ tự kiểm tra file đó theo `marketDocumentSchema`.
- Cập nhật 18/11/2026: theo yêu cầu của khách, đã có bản mặc định `backend/data/drafts/market-data-draft.json` (giấy phép chưa xác minh). Xem `docs/du-lieu-thi-truong-mac-dinh.md`. Mục 1.3 dưới đây là kết luận cũ.

Chạy lại kiểm tra:

```powershell
cd backend; npx vitest run src/tests/drafts-schema.test.ts
```

---

## 1. Dữ liệu thị trường tháng

### 1.1. Lớp tài sản phải có dữ liệu

Chính sách nháp v4 (`backend/seed-data/allocation-2026-10/draft-policy-v4.json`) dùng 4 lớp: `CASH` (tiền gửi), `GOV_BOND` (TPCP), `EQUITY` (cổ phiếu đa dạng hóa) và `GOLD` (vàng). Có thêm CPI theo tháng.

Mô phỏng yêu cầu **mỗi tháng có đủ cả 4 lớp**. Thiếu một lớp thì báo lỗi `Missing asset` (`allocation-risk/simulation.ts:63`). Vì vậy một bộ dữ liệu chỉ có vài lớp không dùng được: cần cả 4 lớp cùng CPI có giấy phép thì mới công bố được.

### 1.2. Nguồn và giấy phép

Môi trường làm việc này **không truy cập được** `gso.gov.vn`/`nso.gov.vn` (lỗi DNS), còn `sjc.com.vn` trả 403. Vì vậy chưa đọc được điều khoản của các trang này. Những ô ghi "chưa xác minh" phải được admin kiểm tra trực tiếp.

| Lớp | Nguồn ưu tiên | URL | Tần suất / lịch sử | Giấy phép | Cho mô phỏng và kết quả suy ra? |
|---|---|---|---|---|---|
| CPI | Cục Thống kê (NSO, trước đây là GSO): thông cáo CPI hằng tháng, có % so với tháng trước | https://www.nso.gov.vn (mục Số liệu thống kê, Giá cả) | Tháng; chuỗi % so tháng trước có từ trước 2010 | Chưa xác minh (không truy cập được). Thường yêu cầu ghi nguồn khi dùng lại | **Cần admin xác nhận bằng văn bản** điều khoản dùng lại cho sản phẩm thương mại |
| CPI (thay thế) | IMF, Consumer Price Index (IFS/CPI dataset), Việt Nam | https://data.imf.org | Tháng | IMF Copyright and Usage: cho phép tải, tạo sản phẩm phái sinh, công bố, kèm điều kiện ghi nguồn; **dùng thương mại phải xin phép qua copyright@imf.org** | **Chưa**. An Hưu có thu phí (kế hoạch PayOS), nên phải xin phép |
| CASH | NHNN: lãi suất huy động bình quân; hoặc biểu lãi suất niêm yết của Vietcombank/nhóm Big 4 | https://sbv.gov.vn ; https://www.vietcombank.com.vn | NHNN công bố không đều theo tháng; ngân hàng niêm yết theo ngày, **không có kho lịch sử chính thức** | Chưa xác minh. Biểu lãi suất ngân hàng là nội dung có bản quyền | **Cần xin phép**, và phải có chuỗi lịch sử theo tháng được xác nhận |
| GOV_BOND | HNX: kết quả đấu thầu và đường cong lợi suất TPCP | https://hnx.vn | Ngày/phiên; lịch sử dài | Chưa xác minh. HNX cung cấp dữ liệu qua gói dịch vụ | **Cần xin phép** HNX hoặc mua của nhà cung cấp được cấp phép |
| EQUITY | HOSE/VNX: VN-Index, VN30. Cần **chỉ số tổng lợi suất** (có cổ tức) | https://www.hsx.vn ; https://vnx.vn | Ngày; VN-Index có từ 28/07/2000 | HOSE quản lý dữ liệu theo gói bán cho khách hàng. Nhà phân phối có phép, ví dụ FiinGroup Datafeed, bán qua API | **Không**, khi chưa có hợp đồng dữ liệu. VN-Index chỉ là chỉ số giá, chưa gồm cổ tức |
| GOLD | SJC: giá mua vào/bán ra vàng miếng | https://sjc.com.vn | Trong ngày; không có kho lịch sử công khai chính thức | Chưa xác minh (403) | **Cần xin phép SJC** |
| GOLD (thay thế) | World Bank Commodity Price Data (Pink Sheet), "Gold, spot average of daily rates", USD/oz | https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx | Tháng, từ 01/1960 | Trang Commodity Markets dẫn tới giấy phép CC BY 4.0 của World Bank (https://datacatalog.worldbank.org/public-licenses#cc-by): được dùng cả cho mục đích thương mại, phải ghi nguồn và nêu rõ phần đã biến đổi | **Có**, về giấy phép. Nhưng **trái tài liệu thuật toán** (xem dưới), và còn cần tỷ giá USD/VND có giấy phép |

Ghi chú về vàng: tài liệu thuật toán của khách (`sites/an-huu-trai-nghiem/thuat-toan-phan-bo-tai-san.md`, bảng nguồn dữ liệu) ghi rõ không được dùng giá vàng thế giới quy đổi theo tỷ giá thay cho giá trong nước. Chênh lệch giữa giá SJC và giá thế giới tại Việt Nam có giai đoạn rất lớn. Vì vậy nguồn World Bank chỉ dùng được nếu khách **đồng ý bỏ quy định này bằng văn bản**. Tỷ giá USD/VND cũng cần nguồn có phép (tỷ giá trung tâm của NHNN, hoặc IMF nếu được cấp phép thương mại).

### 1.3. Kết luận về `market-data-draft.json`

Chưa có nguồn nào vừa có giấy phép rõ ràng, vừa phủ đủ 4 lớp và CPI. Lớp `EQUITY` không có nguồn miễn phí nào được phép dùng. Theo yêu cầu, **không đưa số nào vào file**. Không tạo file dữ liệu thị trường, kể cả bản thiếu một phần, vì bản thiếu không qua được schema và không chạy được mô phỏng.

Một số giá vàng tháng đã đọc được từ các bản Pink Sheet chính thức (USD/oz, bình quân tháng): 10/2025: 4.058; 11/2025: 4.087; 12/2025: 4.309; 01/2026: 4.753; 02/2026: 5.020; 03/2026: 4.856; 04/2026: 4.721; 05/2026: 4.587; 06/2026: 4.228. Các số này chỉ để tham chiếu, chưa quy đổi VND, và **không đưa vào bản nháp** vì lý do ở mục 1.2.

### 1.4. Phương pháp quy đổi (áp dụng khi đã có nguồn được phép)

Mọi dòng: `month` dạng `YYYY-MM`; lợi suất là số thập phân của tháng, danh nghĩa, VND. Tháng t dùng giá trị cuối tháng t so với cuối tháng t−1. Thiếu số liệu thì **loại cả kỳ** (`missingValues: REJECT`, `imputation: NONE`); không điền 0, không nội suy.

| Lớp | Công thức tháng | Phí (`fees`) | Thuế (`taxTreatment`) |
|---|---|---|---|
| CPI | `cpi = (% so tháng trước của NSO) / 100` | — | — |
| CASH | Lãi suất tiền gửi kỳ hạn 12 tháng niêm yết đầu tháng, `r = i_năm / 12` (lãi đơn của tháng, chưa tái tục). Nêu rõ cách quy đổi này trong `totalReturnEvidence` | `NET`: không có phí | Miễn thuế TNCN đối với lãi tiền gửi tại tổ chức tín dụng (tài liệu hiện có dẫn Thông tư 111/2013/TT-BTC; **pháp chế cần xác nhận văn bản còn hiệu lực**) |
| GOV_BOND | Ưu tiên chỉ số tổng lợi suất TPCP có giấy phép. Nếu chỉ có lợi suất 10 năm `y`: `r_t ≈ y_{t−1}/12 − D·(y_t − y_{t−1}) + ½·C·(y_t − y_{t−1})²` với D (thời lượng hiệu chỉnh) và C (độ lồi) tính cho trái phiếu mệnh giá kỳ hạn 10 năm. Đây là **biến đổi đáng kể** (với IMF/World Bank phải ghi rõ khi dùng). Không đưa phần này vào khi chưa duyệt | `NET` nếu nắm giữ trực tiếp; `GROSS` kèm `monthlyDrag` nếu mô phỏng qua quỹ trái phiếu | Thuế với lãi TPCP của cá nhân: **chưa xác nhận**. Đây là điểm 1 còn treo của bản nháp v3/v4 |
| EQUITY | Bắt buộc dùng **chỉ số tổng lợi suất** (có cổ tức): `r = TRI_t / TRI_{t−1} − 1`. Không dùng VN-Index giá trơn, vì như vậy lợi suất bị thấp đi khoảng bằng tỷ suất cổ tức | `GROSS`, `monthlyDrag = (1 + TER)^(1/12) − 1`. Ví dụ với TER 0,82%/năm của v3: ≈ 0,000681/tháng | Thuế 0,1% trên giá trị bán và 5% trên cổ tức tiền mặt. Nêu cách phân bổ trong `taxTreatment`, không trừ hai lần với phí |
| GOLD | `r = P_t / P_{t−1} − 1`, với P là giá **mua vào** của SJC cuối tháng (giá thanh lý). Chênh mua/bán **không** trừ hằng tháng, theo tài liệu thuật toán | `NET` | Không có thuế định kỳ; nêu rõ chênh mua/bán được xử lý trong kịch bản GOLD (`spreadPoints`) |

Kỳ dữ liệu đề xuất: **01/2012 – 10/2026** (178 tháng). Lý do chọn 2012: từ năm này giá vàng miếng được quản lý theo Nghị định 24/2012/NĐ-CP, nên chuỗi SJC có tính liên tục. Kỳ này cũng chứa hai đợt sụt giảm lớn của thị trường cổ phiếu (2018 và 2022), không cần dùng dữ liệu tương lai. Chỉ dùng số đã công bố tới hết tháng 10/2026; không ngoại suy sang 11–12/2026.

Khung JSON cần điền (không có số):

```json
{
  "schemaVersion": 1, "title": "...", "reason": "...", "effectiveFrom": "YYYY-MM-DD",
  "currency": "VND", "unit": "DECIMAL_MONTHLY_TOTAL_RETURN", "priceBasis": "NOMINAL", "cpiMeasure": "MONTH_ON_MONTH_CHANGE",
  "period": { "from": "2012-01", "to": "2026-10" },
  "sources": [{ "id": "NSO_CPI", "title": "...", "url": "https://...", "retrievedOn": "YYYY-MM-DD",
    "license": "Văn bản cho phép số ... ngày ...", "usage": "SIMULATION_AND_DERIVED_OUTPUTS_PERMITTED", "evidence": "..." }],
  "assets": [{ "assetClass": "EQUITY", "sourceId": "...", "totalReturnEvidence": "...",
    "fees": { "treatment": "GROSS", "monthlyDrag": "0.000681", "evidence": "..." }, "taxTreatment": "..." }],
  "cpiSourceId": "NSO_CPI",
  "quality": { "missingValues": "REJECT", "imputation": "NONE", "reviewNote": "..." },
  "rows": [{ "month": "2012-01", "returns": { "CASH": "...", "GOV_BOND": "...", "EQUITY": "...", "GOLD": "..." }, "cpi": "..." }]
}
```

---

## 2. Bộ tỷ trọng mẫu đề xuất

### 2.1. Căn cứ

- Mọi con số tỷ trọng **chỉ lấy từ bảng danh mục nền** của tài liệu thuật toán: lâu hơn 15 năm là 10/20/60/10; từ 5 đến 10 năm là 15/30/45/10; từ 3 năm trở xuống là 25/40/25/10 (theo thứ tự tiền gửi / TPCP / cổ phiếu / vàng). Không tạo thêm mức mới.
- Lộ trình thận trọng "lùi một bậc thời hạn" giữ nguyên như v4.
- **Mới:** thêm lộ trình tăng trưởng "tiến một bậc thời hạn". Lộ trình này giữ cổ phiếu 60% đến lúc còn 10 năm, và 45% khi còn 3 năm. Cổ phiếu vẫn **không vượt 60%**, đúng mức cao nhất của tài liệu. Ở v4, nhóm Tăng trưởng và Tăng trưởng năng động dùng chung lộ trình với nhóm Cân bằng, nên điểm khảo sát cao không tạo ra khác biệt nào.
- Cả ba lộ trình hội tụ về 25/40/25/10 tại tháng nghỉ hưu. Như vậy rủi ro giai đoạn rút tiền (sequence risk) là như nhau sau khi nghỉ hưu, và việc chọn nhóm chỉ ảnh hưởng giai đoạn tích lũy.

### 2.2. Bảng tỷ trọng (tiền gửi / TPCP / cổ phiếu / vàng, %)

Số có phần thập phân là kết quả nội suy tuyến tính theo năm nguyên của engine (`LINEAR_BY_WHOLE_YEARS_TO_ANCHOR`).

| Số năm tới hưu | Thận trọng `TPL_CAUTIOUS_GLIDE` | Cân bằng `TPL_BASE_GLIDE` | Tăng trưởng `TPL_GROWTH_GLIDE` (mới) |
|---|---|---|---|
| ≥ 15 | 15 / 30 / 45 / 10 | 10 / 20 / 60 / 10 | 10 / 20 / 60 / 10 |
| 12 | 21 / 36 / 33 / 10 | 13 / 26 / 51 / 10 | 10 / 20 / 60 / 10 |
| 10 | 25 / 40 / 25 / 10 | 15 / 30 / 45 / 10 | 10 / 20 / 60 / 10 |
| 7 | 25 / 40 / 25 / 10 | 15 / 30 / 45 / 10 | 12,14 / 24,29 / 53,57 / 10 |
| 5 | 25 / 40 / 25 / 10 | 15 / 30 / 45 / 10 | 13,57 / 27,14 / 49,29 / 10 |
| 3 | 25 / 40 / 25 / 10 | 25 / 40 / 25 / 10 | 15 / 30 / 45 / 10 |
| 1 | 25 / 40 / 25 / 10 | 25 / 40 / 25 / 10 | 21,67 / 36,67 / 31,67 / 10 |
| 0 và sau hưu | 25 / 40 / 25 / 10 | 25 / 40 / 25 / 10 | 25 / 40 / 25 / 10 |

Gán nhóm rủi ro (cần thêm `RULE_GROWTH_GLIDE`; các ngưỡng `dimensions` chép từ `RULE_BASE_GLIDE` của v4):

| Nhóm | v4 | Đề xuất |
|---|---|---|
| Thận trọng Bảo toàn, Thận trọng Tăng trưởng | `TPL_CAUTIOUS_GLIDE` | Giữ nguyên |
| Cân bằng Chiến lược | `TPL_BASE_GLIDE` | Giữ nguyên |
| Tăng trưởng Bền vững, Tăng trưởng Năng động | `TPL_BASE_GLIDE` | `TPL_GROWTH_GLIDE` |

### 2.3. `customization.bounds`

| Lớp | min % | max % | Căn cứ |
|---|---|---|---|
| CASH | 5 | 70 | Tối thiểu 5% để giữ thanh khoản. Mức thấp nhất trong các lộ trình là 10%, và việc chuyển cổ phiếu sang tiền gửi (LEAST_LOSS) có thể đẩy tiền gửi lên tới khoảng 70% |
| GOV_BOND | 0 | 60 | Các lộ trình nằm trong khoảng 20–40%; để biên cho người muốn thay cổ phiếu bằng TPCP |
| EQUITY | 0 | 60 | Không vượt mức cao nhất của tài liệu |
| GOLD | 0 | 15 | Tài liệu đặt cố định 10%; cộng 5 điểm, vì vàng là tài sản không sinh lãi và giá trong nước biến động mạnh |

Test đã kiểm tra mọi năm từ 0 đến 40 của cả ba lộ trình: tỷ trọng đều nằm trong các giới hạn này. Tổng min là 5, nhỏ hơn hoặc bằng 100; tổng max là 205, lớn hơn hoặc bằng 100, nên không gặp lỗi `CUSTOM_BOUNDS_INFEASIBLE`.

Lưu ý: tỷ trọng tự chọn đi theo `FOLLOW_TEMPLATE_SHIFTS`, tức là cộng phần dịch chuyển của lộ trình mẫu vào tỷ trọng người dùng chọn. Nếu người dùng chọn tiền gửi 5% với lộ trình Cân bằng, tiền gửi sẽ tăng thêm 15 điểm khi tới hưu và vẫn nằm trong giới hạn. Nếu chọn cổ phiếu 60% với lộ trình Thận trọng, tỷ trọng sẽ tự giảm theo lộ trình đó.

### 2.4. `lossStress`, `essentialThreshold`, `equityShiftPoints` và các tham số khác

| Tham số | Đề xuất | v4 | Căn cứ |
|---|---|---|---|
| `lossStress.shocks` | CASH 0, GOV_BOND −5, EQUITY −35, GOLD −10 | Như nhau | Ví dụ 2 tỷ trong tài liệu. −35% là cận nhẹ của khoảng 35–50% ở mục 9.1 |
| `stresses.EQUITY_CRASH` | −35 / sâu −50 | Như nhau | Mục 9.1. Admin nên đối chiếu với mức sụt từ đỉnh xuống đáy của VN-Index năm 2008 và 2022, sau khi có dữ liệu được phép |
| `essentialThreshold` | 0,90 | 0,90 | Tài liệu: 90–95%; chọn cận dưới. Nếu dùng 0,95 sẽ có nhiều hồ sơ "chưa đạt" hơn |
| `allGoalsThreshold` | 0,80 (**mới**) | Không có | Chỉ dùng để hiển thị (`allThreshold`), không ảnh hưởng cách chọn. Lựa chọn của An Hưu |
| `equityShiftPoints` | 10 | 10 | Giữ theo v4. Bước dịch 10 điểm vẫn thô, nhưng ứng viên `LOSS_REDUCED` đã tính đúng mức giảm cần thiết, nên không làm mất kết quả. Phương án khác là 5 nếu muốn các ứng viên ±gần nhau hơn |
| `blockMonths` / `cvarAlpha` / `rebalanceBandPoints` | 12 / 0,95 / 5 | Như nhau | Tài liệu: khối 12–36 tháng; CVaR 95%; dải tái cân bằng 5 điểm. Với chuỗi 178 tháng, khối 12 tháng cho khoảng 167 điểm bắt đầu |
| Các kịch bản sốc khác | Giữ v4 | — | — |

### 2.5. So sánh với các chính sách hiện có

| | Fixture test (`portfolio-fixtures.ts`) | Chính sách v2 đang công bố | Nháp v4 | **Bản nháp này** |
|---|---|---|---|---|
| Lớp tài sản | BOND, STOCK (tổng hợp) | CASH, BOND, BALANCED, STOCK, REAL_ESTATE | CASH, GOV_BOND, EQUITY, GOLD | Như v4 |
| Kiểu | Lộ trình 80→50→0% cổ phiếu, chỉ để test | 5 mẫu cố định, cổ phiếu tối đa 70% | 2 lộ trình, cổ phiếu tối đa 60% | 3 lộ trình, cổ phiếu tối đa 60% |
| `customization` | 0–100 / 0–80 (tổng hợp) | Không có | **Không có** (thẻ tự chọn bị khóa) | Có (mục 2.3) |
| `lossStress` | −20 / −2 (tổng hợp) | Không có | Có | Như v4 |
| `essentialThreshold` / `equityShiftPoints` | 0,9 / 10 | Không có | 0,90 / 10 | Như v4, thêm `allGoalsThreshold` |

---

## 3. Rủi ro

1. **Không có dữ liệu được phép thì không có xác suất.** Bộ tỷ trọng này có thể công bố riêng: thẻ tự chọn và việc kiểm tra giới hạn lỗ chạy được ngay. Nhưng tỷ lệ "đủ chi thiết yếu" vẫn chỉ hiện "Chưa xác định" cho tới khi có dữ liệu thị trường.
2. **Chỉ số giá và chỉ số tổng lợi suất.** Nếu dùng VN-Index giá trơn, lợi suất cổ phiếu bị thấp đi khoảng bằng tỷ suất cổ tức, và xác suất tính ra sẽ thận trọng một cách sai.
3. **Vàng thế giới và vàng SJC.** Quy đổi giá thế giới làm sai cả mức sụt giảm lẫn chênh lệch giá trong nước. Hiện việc này bị tài liệu của khách cấm.
4. **Chuỗi ngắn** (khoảng 15 năm). Bootstrap chỉ lặp lại các giai đoạn đã xảy ra, nên không bao quát được cú sốc nặng hơn năm 2008. Các kịch bản sốc ở mục 2.4 bù một phần cho điểm này.
5. **TPCP tính từ lợi suất** (công thức D/C) là phép xấp xỉ: bỏ qua lợi nhuận do kỳ hạn rút ngắn và thanh khoản. Nên ưu tiên chỉ số tổng lợi suất có giấy phép.
6. **Lộ trình tăng trưởng mới** có nhiều cổ phiếu hơn trong khoảng 3–10 năm trước hưu. Sau khi có dữ liệu, cần chạy thử trên 52 hồ sơ (như mục 5 của bản nháp v3/v4) trước khi công bố.

## 4. Việc admin cần duyệt hoặc làm

1. Xin phép bằng văn bản, hoặc ký hợp đồng dữ liệu, cho phép **mô phỏng và hiển thị kết quả suy ra** trong sản phẩm thương mại: NSO (CPI), HNX (TPCP), HOSE/VNX hoặc nhà phân phối có phép (chỉ số tổng lợi suất cổ phiếu), SJC (giá vàng), NHNN hoặc ngân hàng (lãi suất tiền gửi). Phương án thay thế: xin phép IMF (copyright@imf.org) cho CPI, lãi suất tiền gửi và tỷ giá.
2. Quyết định về vàng: dùng SJC (cần xin phép), hoặc xin khách đồng ý bằng văn bản cho dùng giá vàng thế giới của World Bank (CC BY 4.0) quy đổi sang VND.
3. Pháp chế xác nhận cách tính thuế: lãi tiền gửi, lãi TPCP của cá nhân, cổ tức và chuyển nhượng.
4. Duyệt các tham số đang đánh dấu CHỜ DUYỆT trong `policy-params-draft.json`: lộ trình tăng trưởng, `customization.bounds`, `allGoalsThreshold`, và việc giữ `equityShiftPoints` 10 hay đổi sang 5.
5. Sau khi duyệt: ghép bản nháp vào chính sách v4 (theo cách test đang làm), tạo **phiên bản chính sách mới**, rồi chạy thử chỉ đọc trên các hồ sơ, sau đó mới duyệt và công bố. Dữ liệu thị trường được ghi và duyệt riêng theo `docs/admin-cong-bo-du-lieu-phan-bo.md`.

## Nguồn đã tra cứu (18/11/2026)

- [IMF Copyright and Usage](https://www.imf.org/en/about/copyright-and-terms)
- [World Bank Commodity Markets](https://www.worldbank.org/en/research/commodity-markets), [World Bank public licenses (CC BY 4.0)](https://datacatalog.worldbank.org/public-licenses)
- [CMO Pink Sheet tháng 01/2026](https://thedocs.worldbank.org/en/doc/18675f1d1639c7a34d463f59263ba0a2-0050012025/related/CMO-Pink-Sheet-January-2026.pdf), [02/2026](https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Pink-Sheet-February-2026.pdf), [05/2026](https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Pink-Sheet-May-2026.pdf), [07/2026](https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Pink-Sheet-July-2026.pdf)
- [FiinGroup Datafeed: HOSE Index](https://datafeed.fiingroup.vn/api-giao-dich/co-phieu/co-phieu/hose-index): ví dụ về nhà phân phối dữ liệu có phép
- Không truy cập được trong phiên này: nso.gov.vn và gso.gov.vn (lỗi DNS), sjc.com.vn (403). hnx.vn, hsx.vn và sbv.gov.vn chưa được kiểm tra trực tiếp.
