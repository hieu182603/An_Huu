# Báo cáo: Phân tích demo An Hưu, tài liệu thuật toán phân bổ tài sản và những gì cần sửa

Ngày lập: 15/10/2026

Nguồn đã xem:
- Tài liệu `An_Huu_Thuat_toan_phan_bo_tai_san.docx` (đặc tả thuật toán phía khách gửi).
- Trang demo `an-huu-ke-hoach-ca-nhan.mym100595.chatgpt.site`. Đã đi hết 10 bước câu hỏi, trang kịch bản, trang phân bổ và trang theo dõi tháng. Đã đọc mã nguồn engine công khai: `cashflow-engine.js`, `plan-engine.js`, `advisor-engine.js`, `market-engine.js`, `lab-engine.js`.
- Mã nguồn hệ thống hiện tại: `backend/src/modules/{retirement,portfolios,profiles,assumptions}`, `backend/scripts/seed.cjs`, `backend/seed-data/seed-datafull.sql`, `frontend/src/pages/OnboardingPage.tsx`.

---

## 0. Tóm tắt nhanh

1. **Cách tiếp cận khách của demo tốt hơn luồng hiện tại của mình.** Demo hỏi giấc mơ trước, dữ liệu sau: câu đầu tiên là mức chi khi nghỉ hưu theo giá hôm nay. Mỗi màn chỉ một câu, có gợi ý sẵn, không cần tài khoản. Khả năng chịu lỗ được hỏi bằng tiền ("1 tỷ còn 800 triệu"). Onboarding của mình mở đầu bằng giới tính, hôn nhân và các bảng thu chi, chưa hỏi khả năng chịu lỗ bằng tiền hay độ ổn định thu nhập.
2. **Demo có một lỗi mô hình lớn: tính quỹ hưu theo dòng chi vĩnh viễn.** Với hồ sơ mặc định (35 tuổi, chi 20 triệu/tháng), demo báo cần **37,98 tỷ** và phải góp **62 triệu/tháng** trên thu nhập 40 triệu. Nếu tính đến 90 tuổi thì chỉ cần khoảng **14,5 tỷ**. Mô hình vĩnh viễn còn rất nhạy với chênh lệch r − g: lợi suất chỉ lệch ±0,5 điểm % thì quỹ cần dao động từ 28 đến 58 tỷ. Tài liệu thuật toán không yêu cầu cách này. **Không nên sao chép.**
3. **Tài liệu thuật toán đúng hướng, và số học trong ví dụ 2 tỷ đã được kiểm lại là khớp.** Cốt lõi của tài liệu: phân bổ theo mục tiêu và nghĩa vụ chi; tách quỹ dự phòng và vốn cho mục tiêu gần hạn; danh mục nền có giới hạn; mô phỏng nhiều đường đi; đo tỷ lệ tài trợ chi thiết yếu và CVaR thiếu hụt; loại bỏ phương án vi phạm ràng buộc.
4. **Hệ thống hiện tại lệch tài liệu ở năm điểm chính:**
   - (a) Chọn danh mục bằng tổng điểm 6 câu trắc nghiệm, đúng kiểu tài liệu cảnh báo "không chỉ lấy điểm từ một câu hỏi thái độ".
   - (b) Chưa có lớp tách vốn bảo vệ được tính tự động (dự phòng và mục tiêu gần hạn).
   - (c) Nhóm tài sản chưa có vàng; còn có "quỹ cân bằng", vốn là một gói trộn chứ không phải một loại tiếp xúc.
   - (d) Chỉ có 3 kịch bản tất định (cơ sở, bất lợi, thuận lợi). Chưa có Monte Carlo, p_thiết_yếu hay CVaR.
   - (e) Lợi suất giả định trong seed cao, chưa có căn cứ: cổ phiếu 12%, trái phiếu 7,2%.
5. **Lỗi cấu hình nghiêm trọng, đã xác nhận trên DB thật (mục 8).** Chính sách đang công bố chỉ phủ tối đa 360 tháng, và giả định chỉ kéo đến năm 2055. Kế hoạch dài nhất tính được hiện là 351 tháng. Với mốc kết thúc mặc định của frontend, **0/52 hồ sơ** tính ra kế hoạch, và lỗi không được ghi log.
6. Phần mình đang làm tốt hơn demo: engine theo tháng có dòng thiếu hụt riêng (không cho vay âm, không xóa thiếu hụt); quản lý phiên bản, hash và phê duyệt cho bộ giả định; lịch nợ theo hợp đồng; lương hưu BHXH theo luật. Những phần này khớp tinh thần tài liệu và nên giữ.

---

## 1. Cách tiếp cận khách hàng của trang demo

### 1.1 Trang landing

| Thành phần | Nội dung | Ý đồ |
|---|---|---|
| Khẩu hiệu | "An tâm hôm nay. Thảnh thơi ngày mai." / "Một cuộc sống vừa ý. Một kế hoạch vừa sức." | Đánh vào cảm xúc an tâm, không nói lợi nhuận |
| Rào cản | "Không cần tài khoản · Từng bước, theo nhịp của bạn" | Bỏ đăng ký, giảm ma sát; dữ liệu lưu `localStorage` |
| 3 lời hứa | Biết cần bao nhiêu → hiểu kế hoạch đủ đến đâu → chọn việc làm ngay tháng này | Dẫn tới một hành động cụ thể chứ không dừng ở một con số |
| 5 loại tài sản | Vàng = đa dạng hóa; Tiết kiệm = giữ chủ động; BĐS = chăm dòng tiền; Trái phiếu = có lịch thu nhập; Cổ phiếu = nuôi tăng trưởng | Giới thiệu theo **vai trò** của tài sản, không theo lợi suất. Rất hợp tinh thần tài liệu |
| CTA thứ hai | "Vì sao danh mục có mức sinh lời đó?" → công cụ kéo tỷ trọng | Giáo dục và minh bạch, cho người dùng tự thử |

### 1.2 Bộ 10 câu hỏi (thứ tự thật trong demo)

| # | Câu hỏi | Kỹ thuật | Dữ liệu thu |
|---|---|---|---|
| 1 | "Bạn muốn chi bao nhiêu mỗi tháng để sống thoải mái khi nghỉ hưu?" | **Bắt đầu từ mong muốn**, theo giá hôm nay, chip 15/20/30/40 triệu, chọn riêng tôi hoặc hai vợ chồng | `spending`, `scope` |
| 2 | "Bạn muốn bắt đầu cuộc sống ấy khi nào?" | Chỉ hỏi 2 con số: tuổi hiện tại và tuổi nghỉ | `age`, `retire` |
| 3 | "Mỗi tháng, bạn nhận được và chi bao nhiêu?" | Thu nhập thực nhận; tổng chi đã gồm nuôi con, trả nợ, chu cấp; có tùy chọn tăng lương | `income`, `expense`, `promotion*` |
| 4 | "Bạn đang có bao nhiêu tài sản tài chính?" | Nói rõ không tính nhà đang ở; hỏi riêng phần đã dành dự phòng; mở thêm phần BĐS cho thuê | `assets`, `reserve`, `propertyValue`, `rental` |
| 5 | "Bạn muốn dành bao nhiêu cho ngày mai?" | **Kiểm tra ngay với phần dư** ("bạn còn khoảng 10 triệu/tháng"); có tốc độ tăng góp | `contribution`, `contribGrowth` |
| 6 | "Bạn còn những khoản nào cần chăm lo?" | 4 công tắc (con, khoản vay, cha mẹ, mục tiêu lớn); bật cái nào thì mới mở câu hỏi chi tiết của cái đó | `child*`, `debt*`, `parent*`, `goals[]` |
| 7 | "Sau nghỉ việc, bạn dự kiến có lương hưu không?" | Cho phép "chưa biết, bổ sung sau" | `pension`, `pensionStart` |
| 8 | "Nếu 1 tỷ đầu tư tạm giảm còn 800 triệu, bạn sẽ thấy thế nào?" | **Khả năng chịu lỗ hỏi bằng tiền**, kèm độ ổn định thu nhập và mức lỗ chấp nhận được bằng tiền | `reaction`, `stability`, `lossPct`, `lossAmount` |
| 9 | "Khoản nào cần được chăm lo nhiều hơn khi nghỉ hưu?" | Chọn ưu tiên (cân đối, y tế, nhà ở); **người dùng không phải tự đoán lạm phát** | `budgetStyle` → lạm phát +0 / +0,5 / +0,3 điểm % |
| 10 | "Mức sống hôm nay, sức mua ngày mai." | Hiện công thức `20 × 1,04^20 = 43,82`, lợi suất kế hoạch, mức dự phòng đã tách, "Vì sao đề xuất như vậy?" | Màn xác nhận giả định |

Sau 10 bước, người dùng được đưa tới:
- **Kịch bản**: quỹ cần, quỹ dự kiến, khoản cần góp, % đáp ứng; 3 thẻ so sánh (giữ nguyên, nghỉ muộn 5 năm, chi ít hơn 15%); thanh trượt; các công tắc thử thách (mất thu nhập 6 tháng, lạm phát +1 điểm, lợi suất −1,5 điểm, quỹ giảm 25% lúc nghỉ); Monte Carlo 1.000 đường đi.
- **Phân bổ**: danh mục đề xuất và danh mục người dùng tự chỉnh. Có chọn sản phẩm thật (Cake, DCBF, E1VFVN30, vàng SJC…) và hiện ngay quỹ cần tăng hay giảm.
- **Tháng này**: trò chơi hóa (đảo của "Mầm", hạt vui, heo đất), ghi nhận khoản góp tháng, số dư thực tế và dự phòng.

### 1.3 Nên học gì

- **Hỏi theo thứ tự cảm xúc rồi mới đến dữ liệu**: mong muốn → thời gian → dòng tiền → tài sản → nghĩa vụ → rủi ro.
- **Mỗi màn một câu**, có chip gợi ý, có giá trị mặc định hợp lý, giải thích ngắn ngay dưới ô nhập.
- **Hỏi rủi ro bằng tiền và bằng hoàn cảnh** (độ ổn định thu nhập, đã có dự phòng chưa), không chỉ hỏi thái độ.
- **Hỏi có điều kiện**: không có con hay khoản nợ thì không hiện câu hỏi tương ứng.
- **Không bắt người dùng đoán thông số kỹ thuật** (lạm phát, lợi suất). Hệ thống tự đề xuất và giải thích bằng công thức hiển thị.
- **Kết quả đi kèm cách sửa**: nghỉ muộn hơn, chi ít hơn, góp thêm. Tài liệu cũng yêu cầu đúng điều này.

### 1.4 Điểm yếu của demo (không nên chép)

- Phải qua 10 bước mới thấy con số đầu tiên. Có thể cho xem ước tính thô sau bước 2–3.
- Con số kết quả quá lớn (37,98 tỷ / góp 62 triệu với thu nhập 40 triệu / đáp ứng 19%) dễ làm khách bỏ đi. Nguyên nhân là mô hình vĩnh viễn (xem mục 2.3).
- Không có bước chuyển sang tư vấn hoặc để lại liên hệ. Dữ liệu chỉ nằm trên thiết bị.
- Liệt kê sản phẩm cụ thể (trái phiếu Vinhomes, Vingroup, cổ phiếu riêng lẻ trong VN30) ở bước phân bổ. Đây là rủi ro pháp lý theo chính tài liệu khách gửi (khuyến nghị chứng khoán cá nhân hóa).
- Phần trò chơi hóa khá nặng (đảo, hạt, bưu thiếp), có thể làm loãng thông điệp tài chính với nhóm khách 35–55 tuổi.

---

## 2. Demo tính toán thế nào

### 2.1 Chuỗi xử lý

```
Trả lời 10 câu
  → advisor.resolve(): lạm phát, dự phòng, phân bổ trước và sau hưu, lợi suất danh mục
  → plan.retirementModel(): quỹ cần tại tuổi nghỉ (dòng chi tăng trưởng VĨNH VIỄN)
  → plan.accumulate(): tích lũy theo tháng, khoản góp bị chặn bởi phần dư thu nhập
  → plan.needed(): tìm khoản góp cần bằng chia đôi
  → monteCarlo(): 1.000 đường đi, bootstrap theo khối 12 tháng trên DỮ LIỆU GIẢ LẬP
```

### 2.2 Các công thức chính (trích từ mã nguồn)

| Bước | Cách tính trong demo |
|---|---|
| Lạm phát | `max(4, ceil((CPI_bq_hình_học_2016–2025 + 0,5) × 2)/2)`, cộng 0,5 nếu ưu tiên y tế, 0,3 nếu ưu tiên nhà thuê. CPI bình quân ≈ 3,1% → **4%** |
| Dự phòng | `max(số tháng khai, 9 nếu thu nhập biến động, 12 nếu có thể gián đoạn) × (chi hiện tại × 70%)` |
| Mục tiêu gần hạn | Mục tiêu trong ≤ 60 tháng và trước khi nghỉ: giữ `PV = số_tiền × (1+lp)^n / 1,045^n` trong phần an toàn |
| Vốn tăng trưởng | `tài sản − dự phòng − vốn mục tiêu gần hạn` (đúng công thức của tài liệu) |
| Trần cổ phiếu theo thời hạn | >15 năm 65%; >10 năm 55%; >5 năm 45%; >3 năm 35%; còn lại 25% |
| Thái độ | Bán khi giảm → 20%; giữ → 55%; mua thêm → 65%. Thu nhập không ổn định → ≤40%. BĐS > 40% tổng tài sản → ≤35% |
| Ngân sách | Không còn dư → cổ phiếu ≤10%; nợ ≥35% thu nhập → ≤20%; dư <10% → ≤30% |
| Trái phiếu, vàng, tiền | Trái phiếu 40% nếu còn <5 năm, ngược lại 25%; vàng 10%; tiền = phần còn lại |
| Ràng buộc mức lỗ | Cú sốc `35%·CP + 5%·TP + 10%·Vàng` phải ≤ `min(lossPct, lossAmount / vốn tăng trưởng)`. Nếu vượt, giảm dần từng 1% theo thứ tự cổ phiếu → vàng → trái phiếu, chuyển sang tiền |
| Lợi suất nhóm | Tiền 4,5%; TP 4,35% (đấu thầu TPCP 10 năm, 6/2026); CP = `min(9, (lịch sử quỹ BCF + 4,35)/2)`; Vàng 5% |
| Lợi suất danh mục | `Σ w·μ − 50·σ²_danh_mục` (xấp xỉ tăng trưởng kép), biến động và tương quan đều là giả định |
| Quỹ cần | `PV = Chi_năm_đầu / (r − g)` cộng các dòng lương hưu, tiền thuê, chi y tế (cũng vĩnh viễn) và các nghĩa vụ có hạn theo từng tháng; lấy thêm sàn thanh khoản |
| Monte Carlo | Chuỗi giả lập (CP μ 9%, σ 20%), dời tâm về lợi suất kế hoạch, bootstrap theo khối 12 tháng, kiểm tra 30 năm sau hưu; tỷ lệ thành công kèm khoảng tin cậy Wilson; CVaR 95% của thiếu hụt thực; dải p10/p50/p90 |
| Lợi suất theo sản phẩm | Tiền gửi = 40% lãi niêm yết + 60% × 4,5%; CP = 50% CAGR NAV + 50% × 4,35%, giới hạn trong khoảng −5% đến 10% |

### 2.3 Lỗi mô hình lớn nhất: dòng chi vĩnh viễn

Hồ sơ mặc định: 35 tuổi, nghỉ ở 55, chi 20 triệu/tháng theo giá hôm nay, g = 4%, r sau hưu = 5,44%.

| Lợi suất sau hưu r | Demo (vĩnh viễn) | Nếu tính đến 90 tuổi (35 năm) |
|---|---|---|
| 4,94% | 58,18 tỷ | 15,72 tỷ |
| **5,44%** | **37,98 tỷ** | **14,51 tỷ** |
| 5,94% | 28,19 tỷ | 13,43 tỷ |

- Mô hình vĩnh viễn khiến quỹ cần **gấp khoảng 2,6 lần** so với kế hoạch đến 90 tuổi, và chỉ cần lệch 0,5 điểm % lợi suất là số tiền đổi gấp đôi. Khi r ≤ g, demo báo lỗi "R_NOT_ABOVE_G" và không đưa ra được kết quả nào.
- Tài liệu yêu cầu thử thách "sống lâu thêm 5 đến 10 năm", tức là kế hoạch có mốc kết thúc cộng thêm kiểm tra tuổi thọ. Engine của mình (chạy theo tháng đến `endMonth`) đã đi đúng hướng này. Phần cần làm thêm là kịch bản tuổi thọ.

### 2.4 Các hạn chế khác của demo

- Monte Carlo chạy trên **dữ liệu giả lập rồi dời tâm về đúng lợi suất kế hoạch**, nên kết quả gần như lặp lại giả định đầu vào. Demo có ghi chú điều này, nhưng con số % vẫn dễ bị hiểu là xác suất thật.
- Chỉ đưa ra một danh mục theo quy tắc kinh nghiệm, chưa có tập phương án như tài liệu yêu cầu (bước 5).
- Phí tư vấn mặc định bằng 0 (tài liệu yêu cầu đưa phí vào dòng tiền). Lãi quỹ dự phòng cố định 4,5%.
- Chưa có chính sách tái cân bằng (dải lệch 5 điểm %, ưu tiên dùng tiền góp mới) và chưa có nhật ký quyết định.
- Thiếu các thử thách: lãi suất tăng (duration), rủi ro tín dụng, chênh mua bán vàng tăng, BĐS khó bán.

---

## 3. Tài liệu thuật toán: nội dung cốt lõi và kiểm tra

### 3.1 Cốt lõi (7 bước)

1. Lập lịch thu, chi, nợ, con cái, lương hưu và mục tiêu theo tháng.
2. Đo khả năng chịu rủi ro bằng **tiền**, theo **thời hạn cần tiền** và **độ ổn định thu nhập**.
3. Tách vốn bảo vệ: `Vốn tăng trưởng = Tài sản đầu tư − dự phòng (6–12 tháng chi thiết yếu) − PV các mục tiêu gần hạn`.
4. Ước lượng thị trường: dùng tổng lợi nhuận, co kỳ vọng (`μ = a·μ_lịch_sử + (1−a)·μ_nền`), co hiệp phương sai theo Ledoit-Wolf.
5. Tạo **tập phương án** bằng tối ưu có ràng buộc. Phiên bản đầu được phép dùng danh mục nền có giới hạn.
6. Mô phỏng nhiều đường đi (bootstrap theo khối 12–36 tháng, thêm cú sốc). Đo `p_thiết_yếu`, CVaR thiếu hụt. Chọn phương án đạt ngưỡng 90–95% có thiếu hụt xấu nhỏ nhất và ít phải đổi danh mục nhất. Nếu không có phương án nào đạt, trả lại các cách điều chỉnh (góp thêm, nghỉ muộn, chi ít).
7. Theo dõi: tái cân bằng khi lệch quá 5 điểm %, ưu tiên dùng tiền góp mới, lưu nhật ký quyết định.

**Danh mục nền** (áp dụng cho phần vốn dài hạn):

| Loại tài sản | > 15 năm, thu nhập ổn định | 5–10 năm | ≤ 3 năm tới hưu |
|---|---|---|---|
| Tiền gửi / thanh khoản | 10% | 15% | 25% |
| Trái phiếu Chính phủ | 20% | 30% | 40% |
| Cổ phiếu đa dạng hóa | 60% | 45% | 25% |
| Vàng | 10% | 10% | 10% |
| Bạc / BĐS mua mới | 0% | 0% | 0% |

### 3.2 Kiểm tra số học

Tất cả số trong tài liệu đã được tính lại và đều khớp:

- Ví dụ 2 tỷ: dự phòng 225; học phí 300 × 1,04³ = 337,46; vốn dành hôm nay 337,46 / 1,045³ = 295,71; vốn dài hạn còn lại 1.479,29.
- Phân bổ trên tổng tài sản: 668,64 / 295,86 / 887,57 / 147,93 triệu.
- Cú sốc: 14,79 + 310,65 + 14,79 = **340,24 triệu**, tức 17,01% tổng tài sản và 23% phần vốn dài hạn.
- Kiểm tra thứ tự lợi suất: 775 so với 820 triệu.

### 3.3 Điểm còn hở, cần chốt với khách

1. Bảng danh mục nền **thiếu các khoảng 10–15 năm và 3–5 năm**. Cần chốt cách xử lý: nội suy tuyến tính hay thêm cột.
2. Cột "> 15 năm" có điều kiện "thu nhập ổn định". Chưa rõ thu nhập không ổn định thì áp trần nào (demo dùng 40%).
3. Chưa chốt ngưỡng `p_thiết_yếu` (90% hay 95%) và alpha của CVaR.
4. Chưa nêu cách xử lý quỹ cân bằng hay quỹ hỗn hợp, loại sản phẩm mà hệ thống mình đang có (`BALANCED`).
5. Mức phí tư vấn trên tài sản (ví dụ 0,5%/năm) chỉ là minh họa, và ranh giới pháp lý về tư vấn chứng khoán chưa được xác nhận. Cần ý kiến luật sư trước khi đưa ra khuyến nghị sản phẩm cụ thể.

---

## 4. Đối chiếu: tài liệu ↔ demo ↔ hệ thống hiện tại

| Yêu cầu của tài liệu | Demo | Hệ thống mình | Đánh giá |
|---|---|---|---|
| Lịch dòng tiền theo tháng, nghĩa vụ có thời hạn | Có | **Có**, chi tiết hơn: engine v3/v4, lịch nợ theo hợp đồng, BHXH | Giữ nguyên |
| Không cho số dư âm sinh lãi, không xóa thiếu hụt | Có | **Có** (`fundedBalance`, `unfundedWithdrawals`) | Giữ nguyên |
| Kế hoạch có mốc kết thúc + thử thách tuổi thọ | Không (vĩnh viễn) | Có mốc kết thúc; **chưa có kịch bản tuổi thọ** | Bổ sung |
| Khả năng chịu lỗ bằng tiền | Có (`lossPct`, `lossAmount`) | **Không**: 6 câu cộng điểm 0–180 | **Sửa** |
| Độ ổn định thu nhập, rủi ro tương quan với nghề nghiệp | Có (`stability`) | Không | **Thêm** |
| Dự phòng 6–12 tháng chi thiết yếu, tính tự động | Có | Không: người dùng tự chia `emergencyShare` cho từng tài sản | **Thêm** |
| Mục tiêu gần hạn: PV theo kỳ hạn, giữ riêng | Có (≤ 5 năm) | Không có thực thể mục tiêu (chỉ có `RetirementGoal` và `otherGoalsShare`) | **Thêm** |
| Chia chi thiết yếu và chi tùy chọn | Một phần (70%) | Có danh mục `ESSENTIAL`/`OPTIONAL` nhưng engine **chưa tách** khi đo | **Sửa** |
| Nhóm tài sản: Tiền / TPCP / CP / Vàng (/ Bạc / BĐS) | Có 4 nhóm | CASH / BOND / **BALANCED** / STOCK / REAL_ESTATE; **không có vàng** | **Sửa** |
| Danh mục nền thay đổi theo thời hạn | Có trần theo thời hạn | 5 mẫu **cố định suốt 360 tháng**, không có lộ trình giảm dần rủi ro | **Sửa** |
| Ràng buộc mạnh hơn danh mục nền (cú sốc ≤ mức lỗ chịu được) | Có | Không | **Thêm** |
| Lợi suất kỳ vọng có căn cứ, co về mốc nền | Có (CP ≤ 9%, TP 4,35% HNX) | Seed: CP 12%, TP 7,2%, cân bằng 9,5%, BĐS 8,5%, chưa có căn cứ | **Sửa dữ liệu** |
| Mô phỏng nhiều đường đi, p_thiết_yếu, CVaR | Có (dữ liệu giả lập) | **Không**: chỉ 3 kịch bản tất định | **Thêm** (giai đoạn 1 có thể dùng bootstrap trên dữ liệu được cấp phép) |
| Thử thách: cú sốc lúc nghỉ, lạm phát cao, mất thu nhập… | 5 công tắc | Có debtStress và kịch bản ADVERSE; chưa có cú sốc giá, mất thu nhập, tuổi thọ | **Bổ sung** |
| Tập phương án và quy tắc chọn | Không | Không (`PORTFOLIO_CHOICE_REQUIRED` khi trùng mẫu) | **Thêm** |
| Không đạt mục tiêu → trả cách điều chỉnh | Có (nghỉ muộn, chi ít) | Có khoản góp cần (`requiredConstantMonthlyContribution`); chưa có tuổi nghỉ khả thi hay mức chi khả thi | **Bổ sung** |
| Phí tư vấn trong dòng tiền | Có tham số, mặc định 0 | Chỉ có chi phí luân chuyển và phí quỹ | **Thêm** |
| Tái cân bằng theo dải lệch, nhật ký quyết định | Không | Có theo dõi thực tế hằng tháng; chưa có cảnh báo lệch tỷ trọng | **Thêm** |
| Giải thích quyết định theo dữ liệu cá nhân | Có "Vì sao…" | Chỉ có câu giải thích cố định theo quy tắc | **Sửa** |
| Dữ liệu: nguồn, ngày, phiên bản, quyền sử dụng | Bản chụp NAV và giá vàng | **Có** khung phiên bản, hash, phê duyệt | Giữ khung; bổ sung dữ liệu |
| Độ dài kế hoạch | 30 năm sau hưu | Quy tắc tối đa **360 tháng**; giả định đến **2040 / 2055** | **Lỗi P0** |

---

## 5. Danh sách cần sửa (theo ưu tiên)

### P0: Lỗi chặn, sửa ngay

| # | Việc | Vị trí | Ghi chú |
|---|---|---|---|
| P0-1 | Mở rộng phạm vi chính sách danh mục: `horizon.max` và `coverageMonths` ≥ 900 tháng | `scripts/seed.cjs` (rules, templates), `seed-data/seed-datafull.sql`, bản chính sách đã xuất bản trên DB thật | Hiện kế hoạch dài hơn 30 năm sẽ báo `POLICY_NOT_COVERED` |
| P0-2 | Kéo `projectionEndYear` của bộ giả định đến ít nhất 2100, kèm 3 kịch bản cho từng năm | Seed assumptions và bản giả định đang xuất bản | Hiện chỉ đến 2040 / 2055 → `PROJECTION_NOT_COVERED` |
| P0-3 | Rà lại lợi suất giả định theo căn cứ có nguồn: TPCP theo đấu thầu HNX (khoảng 4,35%), CP co về mốc nền với trần, tiền gửi theo biểu lãi chính thức | Bộ giả định (admin) | CP 12% hay TP 7,2% làm kế hoạch trông khả thi một cách giả tạo; tài liệu cấm "nâng lợi suất kỳ vọng để kế hoạch đạt" |

Cần chạy kiểm tra trên DB thật trước khi kết luận P0-1 và P0-2. Báo cáo này mới đọc từ seed.

### P1: Khớp lõi thuật toán (Backend)

| # | Việc | Chi tiết |
|---|---|---|
| P1-1 | **Hồ sơ rủi ro theo ràng buộc** thay cho cộng điểm | Thêm vào profile v2: `lossTolerance { amountVnd, percent, reaction }`, `incomeStability: STABLE / VARIABLE / UNCERTAIN`, `employerConcentration`, `liquidityNeeds { y1, y3, y5 }`. Điểm trắc nghiệm chỉ còn là một đầu vào phụ, không tự quyết định danh mục |
| P1-2 | **Thực thể mục tiêu** (`goals[]`) | Mỗi mục tiêu có `amountToday`, `dueMonth`, `inflation`, `priority: ESSENTIAL / FLEXIBLE / LEGACY`, `deferrable`. Mục tiêu trong ≤ 5 năm thì giữ `PV = amount·(1+g)^n / (1+y_kỳ_hạn)^n` ở phần thanh khoản |
| P1-3 | **Lớp tách vốn** (module mới `capital/buckets`) | Dự phòng = `months(stability) × chi_thiết_yếu` (6, 9 hoặc 12 tháng); vốn tăng trưởng = tài sản − dự phòng − PV mục tiêu gần hạn. Hiện so sánh với `emergencyShare` người dùng tự khai và cảnh báo nếu thiếu |
| P1-4 | **Nhóm tài sản mới** | `CASH`, `GOV_BOND`, `CORP_BOND` (giới hạn hoặc 0% ở giai đoạn đầu), `EQUITY`, `GOLD`, `SILVER` (0–5%), `REAL_ESTATE` (chỉ để theo dõi BĐS đang sở hữu, mua mới = 0%). Bỏ `BALANCED` khỏi lớp phân bổ; nếu người dùng giữ quỹ cân bằng thì tách tiếp xúc ra từng nhóm. Thêm `GOLD` và `BOND` vào `assetEntrySchema.type`, cùng `costBasis` và trạng thái khóa hoặc hạn chế bán |
| P1-5 | **Danh mục nền theo thời hạn** | Thay 5 mẫu cố định bằng bảng nền của tài liệu, nội suy theo số năm tới khi cần tiền (lộ trình giảm dần rủi ro theo tháng trong `schedule`). Áp các trần: thu nhập không ổn định, BĐS tập trung, ngân sách mỏng, nợ cao |
| P1-6 | **Ràng buộc mức lỗ** | Cú sốc `CP −35%, TP −5%, Vàng −10%, TPDN −20%` trên vốn tăng trưởng phải ≤ `min(%, số tiền chịu được)`. Nếu vượt thì giảm rủi ro; nếu vẫn không đạt mục tiêu thì báo "chưa khả thi" |
| P1-7 | **Đo riêng phần thiết yếu** | Engine đánh dấu tháng thiếu chi thiết yếu riêng với thiếu chi tùy chọn; xuất `essentialShortfall`, `firstEssentialShortfallMonth` |
| P1-8 | **Gợi ý điều chỉnh khi không khả thi** | Trả về đủ 3 cách: khoản góp cần, tuổi nghỉ khả thi sớm nhất, mức chi khả thi tối đa (tìm bằng chia đôi trên engine hiện có) |
| P1-9 | **Phí tư vấn trong dòng tiền** | `advisoryFee { annualPercent, base: AUM_IN_SCOPE, paidFrom: FUND / EXTERNAL }`. Không trừ lại phí đã nằm trong NAV |
| P1-10 | **Giải thích quyết định** | Sinh câu giải thích từ dữ liệu, ví dụ: "Bạn cần X cho học phí năm Y nên khoản này được giữ riêng; phần còn lại có thời hạn Z năm…". Lưu cùng bản chụp kế hoạch |

### P2: Mô phỏng và theo dõi

| # | Việc | Chi tiết |
|---|---|---|
| P2-1 | Module mô phỏng ngẫu nhiên | Bootstrap theo khối 12–36 tháng trên chuỗi tổng lợi nhuận tháng **được cấp phép**, có cả CPI; N đường đi cố định seed; xuất `p_essential` (có khoảng tin cậy), `CVaR95` thiếu hụt quy về giá hôm nay, dải p10/p50/p90. Chưa có dữ liệu thì đánh dấu rõ là "minh họa" như demo |
| P2-2 | Bộ thử thách đủ 8 tình huống | Lạm phát cao, cổ phiếu giảm sát lúc nghỉ, lãi suất tăng (duration), tín dụng, vàng giảm và chênh lệch giá tăng, BĐS khó bán, mất thu nhập, sống lâu thêm 5–10 năm |
| P2-3 | Tập phương án và quy tắc chọn | Sinh vài biến thể quanh danh mục nền (±10 điểm cổ phiếu); loại các phương án vi phạm ràng buộc; chọn phương án đạt `p_essential ≥ ngưỡng` có CVaR thấp nhất và ít phải đổi nhất |
| P2-4 | Tái cân bằng | Lệch so với mục tiêu > 5 điểm % → đề xuất; ưu tiên dùng tiền góp mới hoặc khoản đáo hạn; lưu nhật ký (tỷ trọng cũ và mới, lý do, chi phí) gắn với `ActualMonth` |
| P2-5 | Ước lượng thị trường | Co kỳ vọng `a·μ_ls + (1−a)·μ_nền`, Ledoit-Wolf cho hiệp phương sai. Làm khi đã có dữ liệu chuỗi đầy đủ |

### Frontend: chuyển cho AI frontend (qua `docs/task-frontend.md`)

| # | Việc |
|---|---|
| FE-1 | Viết lại luồng onboarding theo thứ tự: **mức sống mong muốn → tuổi → thu chi → tài sản → khoản góp (kiểm tra với phần dư) → gia đình và mục tiêu (hỏi có điều kiện) → lương hưu → mức chịu lỗ bằng tiền và độ ổn định thu nhập → ưu tiên chi tiêu**. Đưa giới tính và hôn nhân xuống sau hoặc chỉ hỏi khi cần cho BHXH |
| FE-2 | Mỗi màn một câu, có chip gợi ý, có mặc định; hiện ước tính thô sớm (sau bước 3) |
| FE-3 | Màn giả định có công thức sức mua `chi × (1+g)^n` và nút "Vì sao đề xuất như vậy?" |
| FE-4 | Trang kịch bản: 3 thẻ so sánh (giữ nguyên, nghỉ muộn 5 năm, chi ít hơn 15%) và các công tắc thử thách |
| FE-5 | Trang danh mục: hiện vai trò từng nhóm tài sản (như landing của demo), tỷ trọng trên toàn bộ tài sản và trên phần dài hạn, mức lỗ khi gặp cú sốc tính bằng tiền |
| FE-6 | Không hiển thị tên sản phẩm hay mã chứng khoán cụ thể như một khuyến nghị cho đến khi pháp lý được chốt |

### Dữ liệu và pháp lý

- Chốt quyền sử dụng dữ liệu SSI FastConnect hoặc FiinGroup (lịch sử tổng lợi nhuận, quyền tái phân phối) trước khi làm P2-1.
- Giá vàng phải lấy theo giá mua và giá bán trong nước (SJC, PNJ, Phú Quý), không quy đổi từ giá thế giới.
- Xin ý kiến pháp lý về Luật Chứng khoán (VBHN 102/VBHN-VPQH ngày 22/04/2026, Điều 72–73): phạm vi "đề xuất phân bổ theo loại tài sản" và "khuyến nghị sản phẩm cụ thể" khác nhau thế nào. Kết quả quyết định có làm FE-6 và phần chọn sản phẩm hay không.

---

## 6. Lộ trình đề xuất

1. **Tuần 1 (P0):** sửa phạm vi chính sách và năm giả định; hiệu chỉnh lại lợi suất; viết test cho kế hoạch 35 tuổi đến 90 tuổi.
2. **Tuần 2–3 (P1-1 → P1-6):** hồ sơ rủi ro theo ràng buộc, mục tiêu, tách vốn, nhóm tài sản mới, danh mục nền nội suy, ràng buộc mức lỗ. Tái hiện đúng ví dụ 2 tỷ của tài liệu làm golden test (668,64 / 295,86 / 887,57 / 147,93; cú sốc 340,24).
3. **Tuần 4 (P1-7 → P1-10):** đo riêng phần thiết yếu, gợi ý điều chỉnh, phí tư vấn, giải thích quyết định. Đồng thời bàn giao FE-1 → FE-5.
4. **Sau khi có dữ liệu được cấp phép (P2):** mô phỏng ngẫu nhiên, đủ bộ thử thách, tập phương án, tái cân bằng.

## 8. Kết quả kiểm tra DB thật (Azure `anhuu-db1`, 15/10/2026, chỉ đọc)

Đã chạy `backend/scripts/audit-allocation-readonly.cjs` trong transaction READ ONLY, sau đó thêm hai truy vấn đếm chỉ đọc. Không có ghi nào lên DB.

### 8.1 Cấu hình đang công bố

| Bản | Loại | Hiệu lực | Nội dung |
|---|---|---|---|
| v1 | Bộ giả định `assumption-series-v2` | 01/10/2026 | Năm dự báo **2026–2055**; lạm phát 3,5–4% |
| v2 | Chính sách danh mục `portfolio-policy-v1` | 01/10/2026 | Trỏ đúng giả định v1; hash phê duyệt khớp; kiểm tra cấu hình VALID |

**Lợi suất đang dùng** (giống hệt nhau cho mọi năm từ 2026 đến 2055, không có lộ trình riêng theo năm):

| Nhóm | Lợi suất danh nghĩa | Phí | Thuế | So với tài liệu / demo |
|---|---|---|---|---|
| CASH | 5,0% | đã gồm | đã gồm | Demo dùng 4,5% |
| BOND | 7,2% | 0,8% | 0,1% | TPCP 10 năm HNX khoảng 4,35%; demo dùng 4,35% |
| BALANCED | 9,5% | 1,2% | 0,1% | Tài liệu không có nhóm này |
| STOCK | **12,0%** | 1,5% | 0,1% | Demo giới hạn ≤ 9% |
| REAL_ESTATE | 8,5% | 0,5% | 0,4% | Tài liệu: BĐS mua mới = 0% |

Không có nhóm **vàng**. Mọi nhóm tài sản đều khai thời hạn 1–1.200 tháng, nên giới hạn không đến từ phía nhóm tài sản.

**Chính sách v2 công bố đúng y như seed:**
- 6 câu cộng điểm 0–180, chia thành 5 band.
- 5 mẫu danh mục cố định suốt 360 tháng: STOCK từ 0 đến 70%, BALANCED từ 10 đến 35%, REAL_ESTATE 0%.
- Mọi quy tắc chỉ áp cho thời hạn 1–360 tháng.
- 3 kịch bản (cơ sở, bất lợi, thuận lợi) cộng hoặc trừ cùng một mức điểm % cho mọi năm.

### 8.2 Lỗi thời hạn: đã xác nhận, và nặng hơn dự đoán

Đã chạy thử engine thật với chính sách v2 và giả định v1, bắt đầu từ tháng 2026-10, cho cả 5 band:

| Thời hạn kế hoạch | Kết quả |
|---|---|
| 120, 240 tháng | READY |
| **360 tháng** | **INCOMPLETE `PROJECTION_NOT_COVERED`**: kế hoạch kéo đến 2056-09, vượt năm cuối của giả định (2055) |
| 361, 480, 600, 780 tháng | INCOMPLETE `POLICY_NOT_COVERED` |

Như vậy, với điểm định giá hiện tại, kế hoạch dài nhất tính được là **351 tháng** (2026-10 đến 2055-12).

### 8.3 Ảnh hưởng tới người dùng hiện có

| Chỉ số | Giá trị |
|---|---|
| Người dùng | 1 ADMIN, 55 USER |
| Hồ sơ | 54 (52 bản v2, 2 bản v1); tất cả định giá tháng 2026-10 |
| Tuổi hiện tại (hồ sơ v2) | 25–54 tuổi; đông nhất 30–39 |
| Mốc kết thúc frontend tự đặt | Tháng sinh + `lifeExpectancy` (`RetirementPlanPage.tsx:119`, `RiskPortfolioPage.tsx:47`). Cả 50 bản ghi mục tiêu đều để `lifeExpectancy = 82` |
| **Hồ sơ tính ra READY với mốc mặc định** | **0/52** |
| Hồ sơ có tháng nghỉ hưu sau 2055 (lỗi ngay cả khi chỉ tính đến lúc nghỉ) | 6 |
| Kế hoạch đã lưu | Chỉ 1 phiên bản. Mốc kết thúc bị đặt tay về 2055, nên giai đoạn hưu bị cắt ngắn. Kết quả `NO_ADDITIONAL_CONTRIBUTION` vì thế có thể đang trấn an người dùng sai |
| Log 90 ngày có `POLICY_NOT_COVERED` / `PROJECTION_NOT_COVERED` | 0 lần. Lý do: lỗi được trả về như phản hồi INCOMPLETE bình thường (HTTP 200 kèm hướng dẫn), không bị ghi log. Vì vậy lỗi này không bao giờ hiện trên trang admin |

Kết luận: **với cấu hình hiện tại, gần như không người dùng nào tạo được kế hoạch hưu trí đầy đủ.** Đây là lỗi P0 thật, không chỉ là giả thuyết từ seed.

### 8.4 Dữ liệu cũ và rủi ro khác

- Bảng `financial_assumptions` (EQUITY 12%, BOND 6,8%, SAVINGS 5,2%, lạm phát 3,5%, tuổi thọ 78,5…) **không còn code backend nào đọc**. Nếu trang admin vẫn hiển thị hoặc cho sửa bảng này, người vận hành sẽ tưởng đang chỉnh giả định thật.
- `lifeExpectancy` = 82 cho mọi bản ghi, `lifestyle` = `comfortable` cho mọi bản ghi, và cả 52 hồ sơ có cùng một tháng định giá. Rất có thể đây là dữ liệu nhập hàng loạt hoặc dữ liệu mẫu. Cần xác nhận trước khi coi đây là hành vi của người dùng thật.
- `partner_products`: 11 sản phẩm, **tất cả đang ẩn** (`isVisible = false`). Lợi suất ghi dạng chữ chưa có nguồn, ví dụ quỹ cổ phiếu "13–19%/năm", "12–18%/năm". Chưa lộ ra người dùng, nhưng không nên bật lên trước khi chốt pháp lý (mục 5, phần Dữ liệu và pháp lý).
- `simulation_scenarios`: 0 bản ghi.

### 8.5 Cập nhật nhóm P0 sau khi có số liệu thật

| # | Việc | Ghi chú triển khai |
|---|---|---|
| P0-1 | Bộ giả định mới (v3), năm dự báo đến ít nhất **2110**. Người trẻ nhất 25 tuổi, tuổi thọ 82, cộng 10 năm thử thách tuổi thọ thì cần đến khoảng 2103 | Tạo bản nháp mới → phê duyệt → công bố qua quy trình admin có sẵn. Không sửa bản v1 đã công bố, vì kế hoạch đã lưu đang ghim v1 |
| P0-2 | Chính sách danh mục mới (v4) trỏ tới giả định v3: `horizon.max` và `coverageMonths` ≥ 1.200 tháng | Cùng lúc thay 5 mẫu cố định bằng lộ trình giảm dần rủi ro (P1-5) hoặc trước mắt chỉ kéo dài thời hạn. Đây là lựa chọn cần bạn quyết định |
| P0-3 | Hiệu chỉnh lại lợi suất ngay trong bản v3, có ghi nguồn: TPCP khoảng 4,35%, cổ phiếu ≤ 9%, tiền gửi theo biểu lãi; thêm nhóm vàng | Lợi suất thấp hơn sẽ làm quỹ cần tăng và khoản góp cần tăng. Nên báo trước cho khách |
| P0-4 | Ghi log hoặc tạo số liệu theo dõi khi kế hoạch trả `PROJECTION_NOT_COVERED` / `POLICY_NOT_COVERED` | Để lỗi cấu hình không bị ẩn lần nữa |
| P0-5 | Rà lại kế hoạch đã lưu có mốc kết thúc 2055 | Đánh dấu cần tính lại sau khi công bố v3 và v4; không sửa bản đã lưu |
| P0-6 | Gỡ hoặc đánh dấu "không dùng" bảng `financial_assumptions` trên trang admin | Kiểm tra frontend admin trước khi gỡ |

## 9. Câu hỏi cần khách trả lời

1. Danh mục nền cho các khoảng 10–15 năm và 3–5 năm: nội suy hay thêm cột?
2. Ngưỡng `p_thiết_yếu` là 90% hay 95%? Alpha của CVaR là bao nhiêu?
3. Có giữ "quỹ cân bằng" như một lựa chọn sản phẩm không, hay chỉ phân bổ theo loại tiếp xúc?
4. Mốc kết thúc kế hoạch mặc định: 85, 90 hay theo bảng tuổi thọ? Mức kéo dài cho thử thách tuổi thọ là +5 hay +10 năm?
5. Phạm vi pháp lý giai đoạn đầu: chỉ phân bổ theo loại tài sản, hay được nêu tên sản phẩm?
6. Có giữ phần trò chơi hóa theo dõi hằng tháng như demo không?
