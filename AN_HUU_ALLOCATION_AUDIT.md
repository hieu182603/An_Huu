# AN HƯU – Audit thuật toán phân bổ tài sản và lỗi không trả kết quả

Ngày audit: 19/11/2026. Phạm vi: mã nguồn nhánh `develop` (có thay đổi chưa commit), cấu hình, DB Azure (**chỉ đọc**), và thực thi các service thật trên memory-db.

Audit ban đầu không sửa mã. Ngày 19/11/2026 đã **sửa các lỗi P0** (K1, H1, H2, H3, L1) theo quyết định của chủ sản phẩm; xem **mục H** ở cuối. Bảng ở mục C là kết quả **sau khi sửa**. Không ghi DB thật, không deploy, không commit. Các file bằng chứng:
- `backend/src/tests/audit-allocation-personalization.test.ts`: bộ kiểm thử chỉ chạy khi bật `AUDIT_RUN=1`, dùng memory-db, không chạm PostgreSQL.
- `docs/audit-2026-11-19/`: bằng chứng gồm JSON kết quả từng ca, số đếm tổng hợp từ DB và script đọc DB.

---

## A. Kết luận tổng quan

**1. An Hưu đang dùng thuật toán gì?**

Không phải tối ưu danh mục. Thuật toán gồm 3 tầng:
1. **Chọn lộ trình mẫu.** Điểm khảo sát xác định nhóm rủi ro. Nhóm rủi ro chọn 1 trong 2 lộ trình mẫu của chính sách đang công bố (v6): `TPL_BASE_GLIDE` hoặc `TPL_CAUTIOUS_GLIDE`.
2. **Lấy tỷ trọng theo số năm còn đến hưu.** Tính số năm nguyên còn lại (tối đa 15), rồi nội suy tuyến tính giữa các mốc.
3. **Thử một nhóm nhỏ phương án lân cận** trên các kịch bản thị trường:
   - lộ trình mẫu (`BASE`), mẫu bớt 10 điểm cổ phiếu, mẫu thêm 10 điểm cổ phiếu;
   - mẫu đã giảm cổ phiếu cho vừa giới hạn chịu lỗ (`LOSS_REDUCED`);
   - phương án ít lỗ nhất (`LEAST_LOSS`).

   Phương án nào vượt giới hạn chịu lỗ bị loại. Các phương án còn lại được mô phỏng bằng block bootstrap rồi chọn theo thứ tự: đạt ngưỡng đủ chi thiết yếu ≥ 90% → mức thiếu ở kịch bản xấu (CVaR) thấp nhất → thay đổi tỷ trọng ít nhất.

Bộ tối ưu liên tục (`optimizer.ts`) có trong mã nhưng **đang tắt**: biến môi trường không bật, và chính sách v6 không có khối `continuousOptimizer`.

**2. Tỷ trọng có cá nhân hóa không?**

Chỉ một phần, và hẹp:
- **Tỷ trọng mẫu chỉ phụ thuộc 2 yếu tố:** nhóm rủi ro (tổng điểm 6 câu khảo sát, chỉ có 2 lộ trình) và số năm còn đến hưu. Tối đa khoảng 2 × 16 bộ tỷ trọng khác nhau.
- **Không đi trực tiếp vào tỷ trọng:** thu nhập, nợ, chi tiêu, quy mô tài sản, mục tiêu. Các yếu tố này chỉ ảnh hưởng số tiền, phần vốn dài hạn, phép kiểm tra chịu lỗ (khi khách khai theo số tiền) và kết quả mô phỏng.
- **Mô phỏng chỉ làm đổi tỷ trọng trong 2 trường hợp:**
  - mẫu vượt giới hạn chịu lỗ (ví dụ C03);
  - không phương án nào đạt ngưỡng (C05, C09, C12).

  Khi mọi phương án đều đạt ngưỡng, các phương án hòa nhau về CVaR = 0, và quy tắc "thay đổi ít nhất" luôn chọn lại lộ trình mẫu.
- **Trên DB thật, 41/67 hồ sơ có câu trả lời khảo sát nhận cùng một tỷ trọng 10/20/60/10.** Lý do là họ còn ≥ 15 năm đến hưu và thuộc nhóm Cân bằng trở lên. Đây là **quy tắc của chính sách**, không phải lỗi tính toán. Nhưng nó cho thấy bước "tạo danh mục có ràng buộc" (bước 5 của tài liệu) chưa được triển khai.

**3. Vì sao có người ra kết quả, có người không?**

Có 4 nguyên nhân chính, đã xác minh:
1. **Thiếu thông tin tách vốn.** Trên DB thật, 50/69 hồ sơ (72%) ở trạng thái tách vốn chưa hoàn tất; 49 trong số đó vì hồ sơ không có trường mục tiêu (`goals`). Phần chọn phương án khi đó trả `REVIEW_REQUIRED` và không có phương án nào. Giao diện chỉ báo chung chung "Cần hoàn thiện dòng tiền và chính sách mô phỏng".
2. **Kế hoạch không khả thi lại bị báo lỗi.** Khi không phương án nào đạt ngưỡng, server tính thêm gợi ý điều chỉnh, mất 14–27 giây trên máy local. Bước này không bị giới hạn 10 giây, trong khi trình duyệt chỉ chờ 20 giây. Kết quả là khách thấy "Chưa tính được phương án". Nếu bấm thử lại, server vẫn đang chạy lượt cũ nên từ chối với `CONCURRENT_RUN_LIMIT`.
3. **Vốn dài hạn âm** (tiền không đủ giữ dự phòng). Thực chất kế hoạch không khả thi, nhưng hiển thị như thiếu dữ liệu.
4. **Vượt giới hạn chịu lỗ.** 8 trong 17 hồ sơ đủ dữ liệu thuộc nhóm này. Họ được xem danh mục đã giảm rủi ro nhưng **không áp dụng được**, vì phương án đó không tái lập được dưới dạng tỷ trọng tự chọn.

---

## B. Luồng tính toán thực tế

```
Hồ sơ v2 (DB financial_profiles.profileData)        Chính sách đã công bố mới nhất (assumption_set_versions, portfolio-policy-v1 v6)
  │                                                  Giả định v3 · Dữ liệu thị trường v5 (80 tháng, 03/2020–10/2026)
  ▼
Trang /user/risk-portfolio  (frontend/src/pages/RiskPortfolioPage.tsx)
  · policy = list.items[0] (chính sách công bố mới nhất)                     RiskPortfolioPage.tsx:46
  · answers = retirementSurvey.answers / bản kế hoạch (mang sang nếu mã câu còn)  :53-55
  · planInput cần endMonth + monthlyExpenseToday; thêm allocationFunding=PROTECTED_CAPITAL_V1 khi chính sách có customization  :72-78
  ▼
POST /me/portfolio-policies/workspace/preview → portfolios/workspace.ts allocationWorkspace()
  1. basis(): hồ sơ đúng revision, schemaVersion 2, chính sách khớp hash giả định        workspace.ts:28-37
  2. separateCapital()  (capital/separation.ts)
       tổng vốn = tài sản LIQUID × sở hữu (retirement+emergency+otherGoals)
       dự phòng = chi thiết yếu × reserveMonths (mặc định 6)                            separation.ts:57-58
       mục tiêu ≤ 60 tháng: PV = số tiền × Π(1+lạm phát) ÷ Π(1+lãi CASH ròng)          separation.ts:75-113
       vốn dài hạn = tổng − dự phòng − PV mục tiêu gần hạn                               separation.ts:118
       goals vắng/UNKNOWN → INCOMPLETE (GOALS_REQUIRED), growthCapital = null
  3. portfolios.preview() → engine.ts assessPortfolio()
       tổng điểm 6 câu → riskBand → rule (dimensions đều 0–30, horizon 1–1200, liquidity 0–1200 → không lọc gì)  engine.ts:150-176
       → templateId (2 lựa chọn) → glideTargets(số năm nguyên đến hưu, tối đa 15)                               engine.ts:13-31
  4. assessLossConstraint(): lỗ = vốn dài hạn × Σ(tỷ trọng × sốc); sốc CASH 0/GOV_BOND −5/EQUITY −35/GOLD −10
       cho phép = % × vốn dài hạn | số tiền | min(cả hai) (hồ sơ cũ)                  loss-constraint.ts:36-63
  ▼  (bước 3 của trang: "Xem phương án của tôi"; nút khóa nếu khảo sát chưa hợp lệ / thiếu endMonth)  AllocationWorkspace.tsx:172
AllocationResults → AllocationExperiment: tự chạy nếu planInput && templateId                  AllocationExperiment.tsx:145,173
  · paths = max(4, min(200, ⌊30000 / (số tháng × 3)⌋)); nếu RUNTIME_LIMIT thì chạy lại 1 lần với ½   :160-163
  · timeout trình duyệt mặc định 20 s                                                           services/api.ts:54, planningAnalysis.ts:43
  ▼
POST /me/retirement/risk/selection → allocation-risk/service.ts run()/execute()
  · tối đa 2 lượt chạy đồng thời trên toàn server; cùng user chạy chồng → LIMIT_EXCEEDED CONCURRENT_RUN_LIMIT  service.ts:108
  · evaluate kế hoạch; context null → REVIEW_REQUIRED CLASSIFIED_SERVER_CASHFLOWS_AND_COMPLETE_PROJECTION_REQUIRED  :124
  · thiếu equityShiftPoints/essentialThreshold/lossStress → REVIEW_REQUIRED                     :155-157
  · ứng viên: allocationCandidates(±equityShiftPoints) + LOSS_REDUCED (+ CUSTOM)                :165-182, selection.ts:4-13
  · kiểm tra lỗ từng tháng; có REVIEW_REQUIRED → REVIEW_REQUIRED LOSS_CONSTRAINT_INPUTS_REQUIRED  :191-194
  · simulate(): block bootstrap 12 tháng, seed cố định, hạn 10 s                                simulation.ts:125-157
  · selectCandidate(): pE ≥ ngưỡng → CVaR nhỏ nhất → changePoints nhỏ nhất                      selection.ts:14-17, service.ts:247
  · không ai đạt → adjustmentOptions() (tìm góp thêm / hưu muộn / giảm chi), KHÔNG giới hạn thời gian   service.ts:254-257
  · trả READY | INSUFFICIENT | REVIEW_REQUIRED | LIMIT_EXCEEDED | DATA_REQUIRED
  ▼
Hiển thị (AllocationExperiment/AllocationResults):
  READY + reference → "Phương án đề xuất" + bảng ứng viên          → SUCCESS
  INSUFFICIENT + reference → "Chưa có phương án đạt ngưỡng" + tham khảo + gợi ý → INFEASIBLE (đúng)
  REVIEW_REQUIRED / không có ứng viên → "Cần hoàn thiện dòng tiền và chính sách mô phỏng" (chung chung)
  LIMIT_EXCEEDED → "Phép thử vượt giới hạn xử lý… thử lại sau"     → ERROR
  hết 20 s / lỗi mạng → "Chưa tính được phương án" + "Thử tính lại" → ERROR
```

### Ánh xạ 3 trạng thái

| Trạng thái backend | Ý nghĩa thật | Giao diện đang hiện | Đúng? |
|---|---|---|---|
| `READY` + reference | SUCCESS | Phương án đề xuất | Đúng |
| `INSUFFICIENT` + reference | INFEASIBLE | Chưa đạt ngưỡng, kèm gợi ý | Đúng, **nếu** phản hồi về kịp trong 20 giây |
| `INSUFFICIENT`, phản hồi mất hơn 20 giây | INFEASIBLE | "Chưa tính được phương án" | **Sai: INFEASIBLE thành ERROR** (lỗi K1) |
| `REVIEW_REQUIRED`, vốn dài hạn âm | INFEASIBLE (không đủ tiền giữ dự phòng) | "Cần hoàn thiện dòng tiền…" | **Sai** (lỗi H2) |
| `REVIEW_REQUIRED`, thiếu mục tiêu hoặc mức chịu lỗ | Thiếu đầu vào | "Cần hoàn thiện dòng tiền và chính sách…" | Sai lý do (lỗi H1) |
| `LIMIT_EXCEEDED` `CONCURRENT_RUN_LIMIT` | Server bận (ERROR tạm thời) | "Vượt giới hạn xử lý", không tự thử lại | ERROR đúng loại nhưng có thể tránh được (lỗi K1, M5) |

---

## C. Kết quả kiểm thử (thực thi service thật trên memory-db)

### Cách chạy

Dùng đúng các tài liệu đang công bố trên production:
- giả định v3: `seed-data/allocation-2026-10/draft-assumptions-v3.json`;
- chính sách: v4 kèm `customization`, tương đương v6;
- dữ liệu thị trường: `data/drafts/market-data-draft.json`, nguồn của v5.

Mỗi ca chạy qua `allocationWorkspace()` rồi `AllocationRiskService.run("selection")`, với cùng ngân sách số đường mô phỏng và cùng cách chạy lại như frontend.

Giả định chung của các ca:
- định giá ngày 04/10/2026;
- kế hoạch kết thúc ở tháng trước sinh nhật 85 tuổi;
- tiền góp = thu − chi thiết yếu − trả nợ;
- không có lương hưu;
- 80% tài sản thanh khoản dành cho hưu, 20% cho dự phòng.

Dữ liệu gốc từng ca nằm ở `docs/audit-2026-11-19/audit-cases-*.json`.

| Ca | Hồ sơ | Vốn dài hạn | Nhóm / lộ trình | Tỷ trọng mẫu (TG/TPCP/CP/Vàng) | Kiểm tra lỗ | Kết quả chọn | Tỷ trọng cuối | pE (đường) | Thời gian | Trạng thái sau P0 |
|---|---|---|---|---|---|---|---|---|---|---|
| C01 | 36t, 1 tỷ, thu 30tr, chi 15tr, KS trung bình, lỗ 25% | 910tr | BALANCED / BASE | 10/20/60/10 | Trong giới hạn | READY, BASE | 10/20/60/10 | 1,00 (17) | 3,6 s | SUCCESS |
| C02 | C01, thu 60tr | 910tr | BALANCED / BASE | 10/20/60/10 | Trong giới hạn | READY, BASE | **10/20/60/10** | 1,00 (17) | 4,7 s | SUCCESS |
| C03 | C01, lỗ 10% | 910tr | BALANCED / BASE | 10/20/60/10 | REDUCE_RISK (cổ phiếu tối đa 22,86%) | READY, LOSS_REDUCED | 47,56/20/22,44/10, **applicable: true** | 1,00 (17) | 3,6 s | SUCCESS, áp dụng được |
| C04 | C01, KS thấp | 910tr | CONSERVATIVE / CAUTIOUS | 15/30/45/10 | Trong giới hạn | READY, BASE | 15/30/45/10 | 1,00 (17) | 5,0 s | SUCCESS |
| C05 | C01, hưu 2035-05 | 910tr | BALANCED / BASE | 15/30/45/10 | Trong giới hạn | INSUFFICIENT, tham khảo HIGHER_EQUITY | 5/30/55/10 | 0,82 (17) | **4,9 s** | INFEASIBLE (trả về kịp, không còn timeout, có phương án tham khảo) |
| C06 | 5 tỷ, nợ 3 tỷ trả 40tr/th, thu 70tr | 4,91 tỷ (nợ không bị trừ) | BALANCED / BASE | 10/20/60/10 | Trong giới hạn | READY, BASE | 10/20/60/10 | 1,00 (17) | 3,9 s | SUCCESS |
| C07 | 100tr, chi 25tr, thu 26tr | **−50tr** | BALANCED / BASE | 10/20/60/10 | REVIEW_REQUIRED | INSUFFICIENT `PROTECTED_CAPITAL_EXCEEDS_ASSETS` | — | — | 0,09 s | INFEASIBLE (báo đúng thiếu 50tr quỹ dự phòng) |
| C08 | C01 + mục tiêu 500tr vào 09/2028 | 414,5tr (giữ riêng 495,5tr) | BALANCED / BASE | 10/20/60/10 | Trong giới hạn | READY, BASE | 10/20/60/10 | 1,00 (17) | 4,4 s | SUCCESS |
| C09 | Sinh 1966, hưu 2028-05, KS cao, 2 tỷ | 1,91 tỷ | AGGRESSIVE / BASE | 25/40/25/10 | Trong giới hạn | INSUFFICIENT, tham khảo LOWER_EQUITY | 35/40/15/10 | 0,41 (34) | **5,1 s** | INFEASIBLE (trả về kịp, không còn timeout, có phương án tham khảo) |
| C10 | BĐS khó bán 10 tỷ + 200tr thanh khoản | 110tr | BALANCED / BASE | 10/20/60/10 | Trong giới hạn | READY, BASE | 10/20/60/10 | 1,00 (17) | 3,1 s | SUCCESS |
| C11 | C01 nhưng chưa có mục tiêu (như 49 hồ sơ thật) | null | BALANCED / BASE | 10/20/60/10 | REVIEW_REQUIRED | REVIEW_REQUIRED kèm `GOALS_REQUIRED` | — | — | 0,07 s | REVIEW_REQUIRED (chỉ rõ câu hỏi cần trả lời) |
| C12 | Sinh 1971, hưu 2028-05, 300tr, chi hưu 40tr | 60tr | BALANCED / BASE | 25/40/25/10 | Trong giới hạn | INSUFFICIENT, tham khảo LOWER_EQUITY | 35/40/15/10 | 0,00 (28) | **4,4 s** | INFEASIBLE (trả về kịp, không còn timeout, có phương án tham khảo) |
| C13 | 100tr, chi 20tr (dự phòng 120tr) | **−20tr** | BALANCED / BASE | 10/20/60/10 | REVIEW_REQUIRED | INSUFFICIENT `PROTECTED_CAPITAL_EXCEEDS_ASSETS` | — | — | 0,08 s | INFEASIBLE (báo đúng thiếu 20tr quỹ dự phòng) |
| C14 | C01, KS cao | 910tr | AGGRESSIVE / BASE | 10/20/60/10 | Trong giới hạn | READY, BASE | **10/20/60/10** | 1,00 (17) | 3,5 s | SUCCESS |

### Phép thử bổ sung (đã thực thi)

- **Chỉ 2 đường mô phỏng** (`audit-cases-paths2.json`): C01 mất 1,6 s; C05 vẫn mất 23,6 s; C12 vẫn mất 14,0 s. Vậy thời gian của ca không khả thi nằm ở bước tìm gợi ý điều chỉnh, không nằm ở mô phỏng.
- **Chạy chồng cùng một user** (`audit-concurrency-C06.json`): lượt đầu `READY`, lượt thứ hai `LIMIT_EXCEEDED` `CONCURRENT_RUN_LIMIT`.

### Đọc kết quả theo từng cặp so sánh

| Cặp | Tỷ trọng | Lý do |
|---|---|---|
| C01 và C02 (thu nhập khác) | Giống nhau | Thu nhập không vào tỷ trọng; cả hai đều có pE = 1, CVaR = 0, nên quy tắc "đổi ít nhất" chọn lộ trình mẫu. **Do logic cố định, đúng theo quy tắc**, nhưng chưa có cá nhân hóa theo thu nhập |
| C01 và C14 (khảo sát khác) | Giống nhau | Chính sách v6 chỉ có 2 lộ trình; nhóm Cân bằng, Tăng trưởng, Năng động dùng chung `TPL_BASE_GLIDE`, trần cổ phiếu 60%. **Do chính sách** |
| C01 và C03 (chịu lỗ khác) | Khác (60% → 22,85% cổ phiếu) | Giới hạn chịu lỗ hoạt động đúng; sau khi sửa H3 phương án đã giảm rủi ro áp dụng được (37,56 điểm, 47,56/20/22,44/10) |
| C01 và C05 (ngày hưu khác) | Khác | Khác số năm còn đến hưu nên khác điểm trên lộ trình; mô phỏng cũng đổi phương án |
| C01 và C04 | Khác | Khác lộ trình mẫu |
| C06, C08, C10 | Giống C01 | Nợ, mục tiêu gần hạn và BĐS khó bán chỉ làm đổi **số tiền** vốn dài hạn, không đổi tỷ trọng. Mục tiêu gần hạn được giữ riêng ở tiền gửi, đúng theo tài liệu |
| C09 (gần hưu, KS cao) | 25% cổ phiếu, khi không đạt thì 15% | Lộ trình ≤ 3 năm giới hạn rủi ro. Phương án tham khảo được chọn theo CVaR thấp nhất, có pE 41%, trong khi HIGHER_EQUITY có pE 82% (lỗi M6) |

### Số đếm trên DB thật (chỉ đọc, ngày 19/11/2026, `audit-db-20261119.json`)

**Dữ liệu đang công bố:**
- Chính sách v6: 2 lộ trình, có `customization`, `lossStress`, `essentialThreshold` 0,90, `equityShiftPoints` 10.
- Giả định v3.
- Dữ liệu thị trường v5: 80 tháng, 4 lớp tài sản. Cả 5 nguồn đều ghi giấy phép "CHƯA XÁC MINH".

**69 hồ sơ v2:**
- **Khảo sát:** 67 hồ sơ có đủ câu trả lời cho chính sách v6 (66 trả lời theo chính sách cũ, được mang sang); 2 hồ sơ chưa có câu trả lời nào.
- **Tách vốn:** 19 hồ sơ READY, 50 hồ sơ INCOMPLETE.
  - 49 hồ sơ thiếu mục tiêu (`GOALS_REQUIRED`). Cả 49 đều không có trường `goals` và không có `quickStartSurvey`, nhiều khả năng được tạo bằng script nạp dữ liệu.
  - 1 hồ sơ có giá trị chưa rõ (`UNKNOWN_VALUE`).
- **Vốn dài hạn:** 19 dương, 1 âm, 49 chưa xác định.
- **Kiểm tra giới hạn lỗ trên tỷ trọng tháng đầu** (67 hồ sơ có đủ khảo sát):
  - `REVIEW_REQUIRED` 54: 50 do tách vốn chưa xong, 3 hồ sơ cũ thiếu % hoặc số tiền chịu lỗ, 1 do vốn dài hạn âm;
  - `REDUCE_RISK` 8;
  - `WITHIN_LIMIT` 3;
  - `NOT_FEASIBLE` 2.
- **Tỷ trọng tháng đầu:** 41/67 hồ sơ cùng 10/20/60/10; 13 hồ sơ cùng 15/30/45/10; phần còn lại phân bố theo số năm còn đến hưu.

**Suy ra theo quy tắc mã nguồn** (chưa chạy phần chọn phương án trên từng hồ sơ thật, để không sao chép dữ liệu cá nhân):
- 54/69 hồ sơ sẽ nhận `REVIEW_REQUIRED` ở bước 3.
- Chỉ khoảng 13 hồ sơ có thể có danh mục tham khảo:
  - 3 hồ sơ trong giới hạn;
  - 8 hồ sơ được giảm rủi ro nhưng phương án đó không áp dụng được;
  - 2 hồ sơ chỉ có danh mục tham khảo vượt giới hạn.

---

## D. Danh sách lỗi và nguyên nhân gốc

### K1 – Critical: kế hoạch không khả thi hiển thị thành lỗi hệ thống

- **Vấn đề:** khi không phương án nào đạt ngưỡng, API chọn phương án trả về sau 14–27 giây ngay trên máy local, nhanh hơn Azure B1. Trình duyệt hủy yêu cầu sau 20 giây, và khách thấy "Chưa tính được phương án".
- **Nguyên nhân gốc:** khi không có phương án đạt ngưỡng, `service.ts:254-257` gọi `prepareRetirement` và `adjustmentOptions`. Bước này là cả một vòng tìm kiếm qua nhiều phép chiếu (PROGRESS ngày 17/11 đo được 212 phép chiếu, 16–47 giây). Hạn 10 giây `LIMITS.maxRuntimeMs` chỉ áp cho `simulate()`. Phía trình duyệt, `analyzeRisk` không đặt `timeoutMs` nên dùng 20 giây (`planningAnalysis.ts:43`, `api.ts:54`).
- **Hiệu ứng nối tiếp:** server không dừng lượt đang chạy khi trình duyệt hủy. Nếu khách bấm "Thử tính lại" trong lúc đó, lượt mới bị từ chối với `CONCURRENT_RUN_LIMIT` (`service.ts:108`, đã thực thi). Trình duyệt chỉ tự thử lại với `RUNTIME_LIMIT_NO_PARTIAL_ESTIMATE` (`AllocationExperiment.tsx:163`).
- **Tái hiện:** C05 và C12, hoặc bất kỳ hồ sơ nào mà không phương án đạt pE ≥ 90%. Với 2 đường mô phỏng vẫn mất 14–24 giây.
- **Ảnh hưởng:** chính nhóm khách cần lời khuyên điều chỉnh nhất: sắp nghỉ hưu, ít vốn, chi tiêu cao.
- **Sai kết quả tài chính?** Không sai số liệu, nhưng che mất kết luận "không khả thi" và các gợi ý góp thêm, nghỉ muộn hơn, giảm chi.
- **Hướng sửa:**
  1. Trong `selection` với `detail: "ALLOCATION_V2"`, không tính `adjustmentOptions` đồng bộ. Trả `INSUFFICIENT` ngay, kèm cờ `adjustmentsPending`, rồi lấy gợi ý qua endpoint preview có sẵn (đã chạy trong preview pool). Nếu vẫn tính tại chỗ thì giới hạn bằng chính `deadline` 10 giây và trả `REVIEW_REQUIRED` cho riêng phần gợi ý.
  2. Đặt `timeoutMs` cho `analyzeRisk` (ví dụ 45 giây).
  3. Hủy lượt chạy phía server khi client đóng kết nối (`req.on("close")` → AbortSignal → kiểm tra trong vòng lặp và giải phóng `activeUsers`).
  4. Frontend tự thử lại có giãn cách khi gặp `CONCURRENT_RUN_LIMIT`.

### H1 – High: hồ sơ thiếu mục tiêu bị chặn, và thông báo sai lý do

- **Vấn đề:** 49/69 hồ sơ không có trường `goals`, nên tách vốn trả `GOALS_REQUIRED` và vốn dài hạn là `null`. Phần chọn phương án trả `REVIEW_REQUIRED` với mã `CLASSIFIED_SERVER_CASHFLOWS_AND_COMPLETE_PROJECTION_REQUIRED` (C11): vì frontend gửi `PROTECTED_CAPITAL_V1`, kế hoạch không ra được trạng thái READY. Giao diện hiện "Cần hoàn thiện dòng tiền và chính sách mô phỏng", không nói đúng việc khách cần trả lời câu "khoản lớn sắp tới".
- **Nguyên nhân gốc:**
  - Dữ liệu: các hồ sơ không đi qua khảo sát nhanh.
  - Mã nguồn: `service.ts:124` gộp mọi lý do kế hoạch không READY vào một mã; `AllocationExperiment.tsx:229` dùng một câu chung.
- **Lưu ý:** bước 1 của trang có câu hỏi mục tiêu (`AllocationWorkspace.tsx` hiện `AllocationGoalsQuestion` khi gặp `GOALS_REQUIRED`), nên khách tự sửa được nếu hiểu thông báo.
- **Hướng sửa:**
  - Trả kèm `capital.issues` hoặc `preview.issues` trong `review()`.
  - Frontend ánh xạ `GOALS_REQUIRED` thành "Trả lời câu khoản lớn sắp tới", kèm nút dẫn tới đó.
  - Cân nhắc đợt bổ sung dữ liệu (admin quyết định) cho 49 hồ sơ.

### H2 – High: vốn dài hạn âm bị coi là thiếu dữ liệu

- **Vấn đề:** C07 và C13 (cùng 1 hồ sơ thật) không đủ tiền giữ dự phòng. Thực chất kế hoạch không khả thi, nhưng nhận cùng `REVIEW_REQUIRED` như H1.
- **Nguyên nhân gốc:** `loss-constraint.ts` đưa `NONNEGATIVE_GROWTH_CAPITAL_REQUIRED` vào nhóm cần rà soát; còn kế hoạch có vốn bảo vệ không READY nên dừng ở `service.ts:124`.
- **Hướng sửa:** khi vốn dài hạn < 0, trả trạng thái riêng (ví dụ `INSUFFICIENT` kèm `PROTECTED_CAPITAL_EXCEEDS_ASSETS`) và thiếu hụt bằng tiền. Giao diện đã có sẵn câu "Còn thiếu để giữ đủ dự phòng" ở bước 1; nên dùng lại ở phần kết quả.

### H3 – High: danh mục "đã giảm rủi ro" không áp dụng được

- **Vấn đề:** C03 trả `LOSS_REDUCED` với `applicable:false`, nên nút "Dùng phương án này" bị khóa (cần `referenceCandidate.selection`). Trên DB có 8/17 hồ sơ đủ dữ liệu ở trạng thái `REDUCE_RISK`.
- **Nguyên nhân gốc:**
  - Phương án `shiftEquityToDeposit` trừ một số điểm cố định khỏi cổ phiếu mỗi tháng, cắt tại 0, và không chuẩn hóa lại (`loss-candidates.ts:14-22`).
  - Phương án dùng để lưu được dựng lại bằng `customTargets` (FOLLOW_TEMPLATE_SHIFTS: cộng phần dịch chuyển, cắt 0, rồi **chuẩn hóa lại**, `custom.ts`), sau đó so sánh với ứng viên từng tháng với sai số 1e-7 (`service.ts:205-217`).
  - Khi số điểm cần chuyển lớn hơn tỷ trọng cổ phiếu của lộ trình ở mốc nghỉ hưu (25%), hai cách cho kết quả khác nhau. Với C03 tại mốc 0 năm: ứng viên 50/40/0/10, dựng lại 55,4/35,7/0/8,9. Vì vậy `selection = null`.
- **Sai kết quả tài chính?** Phần tỷ trọng hiển thị đúng với phép thử, nhưng khách không lưu được.
- **Hướng sửa:** dựng ứng viên `LOSS_REDUCED` bằng chính `customTargets(tỷ trọng tháng đầu đã giảm)` để phương án luôn tái lập được. Sau đó kiểm tra lại giới hạn lỗ từng tháng (`checks` đã có sẵn). Cách khác: chỉ cho áp dụng khi số điểm chuyển ≤ tỷ trọng cổ phiếu nhỏ nhất của lộ trình, và hiển thị lý do khi không áp dụng được.

### H4 – High: độ tin cậy thống kê thấp

- **Vấn đề:**
  - Frontend xin 17–34 đường mô phỏng; tài liệu yêu cầu 1.000–10.000.
  - Với 17 đường, pE chỉ nhận các giá trị cách nhau 5,9%. Ngưỡng 90% tương đương 16/17 đường. CVaR 95% thực chất là đường xấu nhất.
  - Bộ dữ liệu chỉ 80 tháng.
- **Nguyên nhân gốc:** giới hạn 10 giây (`simulation.ts:12`) và chi phí khoảng 0,2–0,33 ms cho mỗi đường-tháng; ngân sách 30.000 đường-tháng (`AllocationExperiment.tsx:160`).
- **Hướng sửa:**
  - Chạy mô phỏng như một tác vụ nền (job) hoặc trong preview pool với ngân sách thời gian lớn hơn.
  - Tối ưu `runPath`, vì phần lớn thời gian là tính Decimal (đo ngày 17/11).
  - Hiển thị số đường và khoảng tin cậy Wilson; đã có `display.wilson*`.
  - Kéo dài lịch sử dữ liệu.

### H5 – High: dữ liệu thị trường đã công bố có giấy phép và chất lượng chưa xác minh

- **Vấn đề:** dữ liệu thị trường v5 đã PUBLISHED dù cả 5 nguồn đều ghi giấy phép "CHƯA XÁC MINH". Ngoài ra:
  - cổ phiếu chỉ là chỉ số giá, chưa gồm cổ tức;
  - TPCP chỉ tính phần lãi, chưa có lãi/lỗ giá;
  - vàng 18,5%/năm cho giai đoạn 2020–2026;
  - (`docs/du-lieu-thi-truong-mac-dinh.md`).
- **Hệ quả:** các phương án trong ca dễ đạt pE = 1 (C01–C14). Khi mọi phương án đạt, hệ thống luôn chọn lại lộ trình mẫu (M2). Đồng thời có rủi ro pháp lý về quyền sử dụng dữ liệu.
- **Hướng sửa:** admin xác minh giấy phép; thay chỉ số tổng lợi suất; kéo dài lịch sử dữ liệu (thủ tục trong `docs/du-lieu-thi-truong-va-ty-trong-mau.md`).

### M1 – Medium: tỷ trọng mẫu không cá nhân hóa theo hoàn cảnh

- **Vấn đề:** tỷ trọng chỉ phụ thuộc nhóm rủi ro (2 lộ trình) và số năm còn đến hưu. Các bộ lọc trong quy tắc không có tác dụng: điểm từng chiều 0–30, thời hạn 1–1.200 tháng, thanh khoản 0–1.200 tháng (DB, engine.ts:165-172).
- **Bằng chứng:** 41/67 hồ sơ thật cùng 10/20/60/10; C01, C02, C14 giống nhau.
- **Đánh giá:** không phải lỗi tính toán; đây là thiết kế chính sách và giới hạn của bước 5 (xem E).
- **Hướng sửa:**
  - Bật hoặc hoàn thiện `continuousOptimizer` sau khi có dữ liệu được phép.
  - Thêm lộ trình Tăng trưởng (bản nháp có `TPL_GROWTH_GLIDE`, nhưng v6 chưa dùng).
  - Dùng độ ổn định thu nhập để chọn số tháng dự phòng.

### M2 – Medium: khi mọi phương án đạt ngưỡng, luôn chọn lại lộ trình mẫu

- Các phương án hòa nhau về CVaR = 0, nên quy tắc "đổi ít nhất" chọn BASE (`selection.ts:15-16`). Đúng theo tài liệu §7.4, nhưng mô phỏng không tạo khác biệt cho các kế hoạch dư dả.
- **Hướng sửa:** thêm tiêu chí phụ, ví dụ trung vị tài sản cuối kỳ hoặc pAll, nếu khách hàng đồng ý.

### M3 – Medium: nợ không vào phép tách vốn

- C06: nợ 3 tỷ không làm giảm vốn dài hạn (4,91 tỷ). Nợ chỉ có mặt trong dòng tiền qua khoản trả hằng tháng.
- Tài liệu yêu cầu lập lịch nghĩa vụ và cân nhắc trả nợ trước hạn (§8.1). Chưa có so sánh "trả nợ trước hạn" với "đầu tư".

### M4 – Medium: số tháng dự phòng không theo độ ổn định thu nhập

- `separation.ts:57`: mặc định 6 tháng, khách tự chọn. Tài liệu: 6–12 tháng tùy độ ổn định thu nhập. Trên DB, 68/69 hồ sơ đang dùng 6.

### M5 – Medium: chỉ 2 lượt chạy đồng thời trên toàn server

- `service.ts:108`: người thứ 3 chạy cùng lúc nhận ngay `LIMIT_EXCEEDED`, và frontend không tự thử lại.

### M6 – Medium: phương án tham khảo khi không khả thi được chọn theo CVaR với mẫu rất nhỏ

- C09: chọn LOWER_EQUITY (pE 41%) thay vì HIGHER_EQUITY (pE 82%), vì CVaR nhỏ hơn trên 34 đường. Đúng theo quy tắc, nhưng không ổn định khi mẫu nhỏ (gắn với H4).

### L1 – Low: script audit cũ hỏng

- `backend/scripts/audit-allocation-readonly.cjs` dừng ở bước `policies` với chính sách schema v2. Script thay thế: `docs/audit-2026-11-19/audit-allocation-db-readonly.cjs`.

---

## E. So sánh với tài liệu `An_Huu_Thuat_toan_phan_bo_tai_san.docx`

Dự án có bản `docs/An_Huu_Thuat_toan_phan_bo_tai_san.docx`; không tìm thấy bản "(2)". Đã đọc nội dung docx và đối chiếu với `sites/an-huu-trai-nghiem/thuat-toan-phan-bo-tai-san.md`.

| Bước theo tài liệu | Trạng thái | Ghi chú |
|---|---|---|
| 1. Hoàn cảnh, dòng tiền | **Đã triển khai** | Phép chiếu dòng tiền theo tháng: thu, chi, nợ, lương hưu, mục tiêu |
| 2. Khả năng chịu rủi ro | **Đã triển khai một phần** | 6 câu khảo sát cho ra 5 nhóm, nhưng chỉ 2 lộ trình. Giới hạn lỗ bằng tiền hoặc % có hoạt động. Chưa dùng độ ổn định thu nhập và rủi ro tương quan nghề nghiệp |
| 3. Vốn bảo vệ | **Đã triển khai** | Dự phòng × số tháng; mục tiêu ≤ 60 tháng chiết khấu theo lãi tiền gửi đã công bố; loại tài sản kém thanh khoản và nhà ở. Thiếu: chọn số tháng theo độ ổn định thu nhập; xử lý nợ |
| 4. Ước lượng thị trường | **Có dữ liệu, chất lượng chưa đạt** | Đã có chuỗi tháng, nhưng giấy phép chưa xác minh; cổ phiếu chỉ là chỉ số giá; TPCP chưa có biến động giá; chỉ 80 tháng. Co ước lượng và Ledoit-Wolf (`estimation.ts`) chỉ phục vụ bộ tối ưu đang tắt |
| 5. Tạo danh mục có ràng buộc | **Chưa triển khai, chỉ có khung** | Đang dùng lộ trình mẫu cộng lưới ±10 điểm, LOSS_REDUCED, LEAST_LOSS. Bộ tối ưu bền vững có mã nhưng tắt (biến môi trường và chính sách) |
| 6. Mô phỏng mục tiêu, kịch bản xấu | **Đã triển khai, quy mô nhỏ** | Block bootstrap 12 tháng, pE, CVaR 95%, quy tắc chọn §7.4, 8 kịch bản sốc (chế độ `scenarios`). Số đường 17–34 thay vì 1.000+. Phần gợi ý khi không khả thi có nhưng bị timeout (K1) Cập nhật 19/11: gợi ý khi không khả thi nay chạy qua lượt riêng, xem mục I. |
| 7. Theo dõi, tái cân bằng | **Có API, chưa kiểm chứng đầu-cuối** | Có `rebalance` với dải 5 điểm (`service.ts:267-272`) và module số liệu thực tế. Trong mô phỏng, tái cân bằng theo lịch hằng năm hoặc khi đổi mốc, không theo dải lệch Cập nhật 19/11: mô phỏng đã tái cân bằng theo ngưỡng lệch, xem mục I. |
| Bạc, BĐS mua mới 0% | Phù hợp | Không có lớp tài sản này trong chính sách |
| Vàng theo giá SJC, không quy đổi giá thế giới | Phù hợp về nguồn | Giá lấy từ trang tổng hợp, chưa rõ là giá mua hay giá bán |

**Tỷ trọng mẫu có bị dùng như tỷ trọng cố định cho mọi người không?** Có, ở tầng mẫu. Mọi khách cùng nhóm lộ trình và cùng số năm còn đến hưu nhận cùng tỷ trọng mẫu. Chỉ giới hạn chịu lỗ và kết quả mô phỏng mới làm đổi tỷ trọng (lưới ±10 điểm hoặc LOSS_REDUCED). Tài liệu ghi rõ tỷ trọng mẫu là "điểm khởi đầu minh họa… chưa phải kết quả tối ưu", và "ràng buộc ưu tiên hơn danh mục nền".

---

## F. Đề xuất sửa, theo thứ tự ưu tiên

1. **K1:** tách `adjustmentOptions` khỏi `selection` đồng bộ (hoặc giới hạn bằng `deadline`); đặt `timeoutMs` cho `analyzeRisk`; hủy lượt chạy khi client ngắt kết nối; tự thử lại khi gặp `CONCURRENT_RUN_LIMIT`. File: `allocation-risk/service.ts`, `allocation-risk/router.ts`, `frontend/src/services/planningAnalysis.ts`, `frontend/src/components/AllocationExperiment.tsx`.
2. **H1 và H2:** trả đúng mã lý do (`capital.issues`, vốn dài hạn âm thành INFEASIBLE). Frontend ánh xạ từng mã thành hành động cụ thể. File: `allocation-risk/service.ts:124,193`, `AllocationExperiment.tsx:229`, `AllocationResults.tsx`.
3. **H3:** làm `LOSS_REDUCED` tái lập được bằng `customTargets`. File: `allocation-risk/loss-candidates.ts`, `service.ts:178-217`.
4. **H5 (admin):** xác minh giấy phép, thay chỉ số tổng lợi suất, kéo dài lịch sử dữ liệu, rồi công bố dữ liệu thị trường v7.
5. **H4:** chạy mô phỏng nền hoặc trong pool với ngân sách lớn hơn; hiển thị số đường và khoảng tin cậy.
6. **M1–M6:**
   - thêm lộ trình Tăng trưởng (chính sách mới);
   - chọn số tháng dự phòng theo độ ổn định thu nhập;
   - đưa nợ vào hoàn cảnh;
   - thêm tiêu chí phụ khi các phương án hòa;
   - bật bộ tối ưu khi dữ liệu đạt chuẩn.
7. **Dữ liệu (admin):** bổ sung câu trả lời mục tiêu cho 49 hồ sơ, hoặc nhắc khách trả lời ngay ở bước 1.

---

## G. Đánh giá độ tin cậy

**Đã xác minh bằng thực thi:**
- 14 ca chạy qua service thật trên memory-db, với tài liệu tương đương bản production.
- Trạng thái, tỷ trọng và thời gian chạy từng ca.
- `applicable:false` của LOSS_REDUCED.
- `CONCURRENT_RUN_LIMIT` khi cùng một user chạy chồng.
- Thời gian ca không khả thi không phụ thuộc số đường mô phỏng.
- Các số đếm trên DB thật (chỉ đọc): phiên bản đang công bố, trạng thái tách vốn và kiểm tra lỗ, phân bố tỷ trọng tháng đầu.
- Test `drafts-schema` chạy qua.
- Hash của chính sách v6 và giả định v3 so khớp thật với phê duyệt bằng chính hàm băm của ứng dụng (sửa ngày 19/11: bản script đầu chỉ kiểm tra hash có tồn tại). Câu hỏi khảo sát và 5 nhóm rủi ro của v2 và v6 giống hệt nhau, nên câu trả lời cũ mang sang vẫn giữ nguyên ý nghĩa.

**Đã xác minh bằng mã nguồn:**
- Luồng ở mục B và mọi số dòng trích dẫn.
- Timeout 20 giây của frontend.
- Bộ tối ưu đang tắt (biến môi trường và chính sách).
- Nguyên nhân lệch tỷ trọng của H3 (đã kiểm bằng phép tính tay).
- Các bộ lọc trong quy tắc chính sách không có tác dụng.

**Chưa thể xác minh:**
- Thời gian chạy thực tế trên Azure B1. Thời gian local đã vượt 20 giây với ca không khả thi; trên Azure có thể còn chậm hơn.
- Trình duyệt thật có thực sự hiển thị lỗi timeout và `CONCURRENT_RUN_LIMIT` hay không: chưa chạy UI.
- Kết quả phần chọn phương án cho từng hồ sơ thật: chỉ suy ra theo quy tắc, không chạy, để tránh sao chép dữ liệu cá nhân.
- 49 hồ sơ thiếu `goals` là khách thật hay dữ liệu nạp.
- Điều khoản sử dụng của các nguồn dữ liệu thị trường.
- Tần suất kích hoạt `CONCURRENT_RUN_LIMIT` trong trình duyệt thật.

---

## H. Kết quả sửa P0 (19/11/2026)

Quyết định của chủ sản phẩm:
1. Vốn dài hạn âm: trả `INSUFFICIENT` kèm `PROTECTED_CAPITAL_EXCEEDS_ASSETS` và số tiền thiếu, **chỉ khi** tách vốn đã READY; thiếu dữ liệu thì vẫn `REVIEW_REQUIRED`.
2. Giới hạn theo tài khoản: preview 20 lần/phút, mô phỏng 3 lần/phút, 1 mô phỏng đang chạy mỗi tài khoản, 2 mô phỏng đồng thời toàn server. Đây là cấu hình ban đầu, sẽ hiệu chỉnh sau khi đo tải.
3. Phiên này sửa cả backend và frontend.

### Lỗi đã khắc phục

| Mã | Đã sửa | File |
|---|---|---|
| K1 | Trang Phân bổ (`detail: ALLOCATION_V2`) không tính gợi ý điều chỉnh, trả `adjustmentsOmitted`. Trang Kế hoạch vẫn có gợi ý, nhưng giới hạn trong cùng thời hạn 10 s (`ADJUSTMENT_RUNTIME_LIMIT`). Trình duyệt chờ 45 s | `allocation-risk/service.ts`, `retirement/preview-insights.ts`, `frontend/src/services/planningAnalysis.ts` |
| K1 | Mỗi tài khoản 1 lượt chạy. Lượt mới cùng loại hủy lượt cũ và **chờ lượt cũ dừng hẳn** (tối đa 3 s) mới chạy. Lượt khác loại bị từ chối với `CONCURRENT_RUN_LIMIT` và `ACCOUNT_RUN_IN_PROGRESS`, không hủy lượt đang chạy. Giới hạn toàn server đếm cả lượt đã hủy nhưng chưa dừng | `allocation-risk/service.ts` |
| K1 | Trình duyệt ngắt kết nối thì dừng lượt chạy, dựa trên `res.on("close")` kèm `!res.writableFinished`. Bản trước dùng `req.on("close")`; trên Node 22 sự kiện này có thể phát ngay khi đọc xong body, trong app thì không phát, nên ngắt kết nối không dừng được gì | `allocation-risk/router.ts` |
| K1 | Giới hạn tần suất đếm theo tài khoản: mô phỏng 3 lần/phút, preview 20 lần/phút. Có thể chỉnh qua `RISK_RUNS_PER_MINUTE` và `PREVIEW_REQUESTS_PER_MINUTE`. Bộ giới hạn preview nay đứng **sau** bước xác thực; bản trước đứng trước nên vẫn đếm theo IP | `allocation-risk/router.ts`, `modules/router.ts` |
| K1 | Frontend: chỉ thử lại 1 lần (sau 3 s) khi server bận; không thử lại khi gặp 429, vì thử lại chỉ tốn thêm lượt; báo rõ "3 lần/phút". Lỗi hết thời gian chờ hoặc mất mạng được ghi là lỗi kỹ thuật, không phải kết luận về kế hoạch | `AllocationExperiment.tsx` |
| H1 | Trả kèm mã lý do thật (`GOALS_REQUIRED`, `UNKNOWN_VALUE`, `LOSS_TOLERANCE_REQUIRED`…). Giao diện có thông báo và nút mở đúng bước: câu hỏi khoản lớn, mức chịu giảm, hoặc hồ sơ | `service.ts`, `AllocationExperiment.tsx`, `AllocationWorkspace.tsx` |
| H2 | Vốn dài hạn âm trả `INSUFFICIENT` kèm `shortfallAmount`; giao diện hiển thị số tiền thiếu và hướng điều chỉnh. Bỏ ngưỡng gán cứng `"0.90"` | `service.ts`, `AllocationExperiment.tsx` |
| H3 | `LOSS_REDUCED` và `LEAST_LOSS` được dựng theo `customTargets`, nên tái lập được. Mức giảm là mức **nhỏ nhất** (0,01 điểm) qua cả 2 phép kiểm tra: tỷ trọng mục tiêu và tỷ trọng đã trôi giữa hai lần tái cân bằng (`prepare.ts`). Tìm bằng cách nhảy cóc rồi chia đôi, thay cho vòng lặp từng 0,01 điểm (C03: 9,3 s → 3,6 s) | `allocation-risk/loss-candidates.ts`, `service.ts` |
| Mới | Các nút "mở bước để sửa" không hoạt động sau khi khung chỉnh sửa đổi từ `<details>` sang `<section>`; nay dùng sự kiện `anhuu:allocation-edit` | `AllocationExperiment.tsx`, `AllocationWorkspace.tsx` |
| Mới | Tiêu đề kết quả phân biệt 3 trạng thái: "Kế hoạch chưa khả thi" / "Cần bổ sung thông tin" / "Chưa tính được phương án" (trước đây đều là "Chưa đủ dữ liệu") | `AllocationResults.tsx` |
| Mới | Hộp "Thử biến cố" báo server bận là lỗi kỹ thuật tạm thời; trước đây báo "Chưa đủ dòng tiền hoặc chính sách" | `AllocationScenarios.tsx` |
| L1 | Script audit cũ đọc được chính sách schema v2 (glidePath), giao dịch chỉ đọc có thời hạn 170 s. Đã chạy lại trên DB thật (chỉ đọc) | `backend/scripts/audit-allocation-readonly.cjs` |

Không thay đổi thuật toán phân bổ hay quy tắc chọn danh mục. Không bỏ qua phép kiểm tra rủi ro nào: mọi ứng viên vẫn qua kiểm tra lỗ từng tháng; `LOSS_REDUCED` còn qua thêm kiểm tra của kế hoạch.

### Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Backend `npm test` | 112 file, **1.391/1.391** qua |
| Backend typecheck (mã nguồn và test) | Sạch |
| 14 ca audit (`AUDIT_RUN=1`, có khẳng định trạng thái) | **14/14** đúng trạng thái mong đợi; mọi ca ≤ 5,1 s |
| Test hồi quy nhanh (luôn chạy) | C03, C07, C11, C12; hủy lượt cũ cùng loại; từ chối lượt khác loại; hủy khi trình duyệt ngắt kết nối (socket thật); giới hạn 3/20 lần/phút |
| Frontend typecheck, 132 test đơn vị, 18 test logic, `npm run build` | Qua |
| E2E API → giao diện: `playwright.allocation-result-review` | **37/37** |
| E2E: `playwright.allocation-custom` | **14/14** |

E2E chạy trên máy chủ kiểm thử memory-db (`discovery-ui-test-server.cjs`). Máy chủ này nới giới hạn tần suất, vì cả bộ dùng chung một tài khoản kiểm thử; giới hạn thật được kiểm bằng test backend. Chưa kiểm trên PostgreSQL hay Azure; chưa deploy.

### Còn tồn tại

1. **Hệ quả của giới hạn 3 lần/phút:** một lượt xem trang có thể dùng 1–2 lượt (tự chạy, chạy lại với nửa số đường). Khách thử tỷ trọng tự chọn hai lần rồi bấm "Thử biến cố" trong cùng một phút sẽ nhận 429; e2e đã tái hiện đúng điều này với mức 3 lần/phút. Cần đo tải để hiệu chỉnh (`RISK_RUNS_PER_MINUTE`).
2. **Lượt cũ bị hủy không dừng ngay** khi đang ở bước không có điểm kiểm tra (đánh giá kế hoạch khoảng 0,2–0,5 s). Đã có các điểm kiểm tra trước và trong mô phỏng; lượt mới chờ tối đa 3 s.
3. **Các mục chưa làm, cần quyết định nghiệp vụ hoặc admin:**
   - H4: số kịch bản 17–34;
   - H5: giấy phép và chất lượng dữ liệu thị trường v5;
   - M1–M6: cá nhân hóa, tiêu chí phụ khi hòa, quy tắc chọn khi không khả thi, nợ, số tháng dự phòng;
   - 49 hồ sơ thật thiếu mục tiêu (người dùng sẽ thấy thông báo chỉ đúng câu hỏi).
4. Chưa nghiệm thu trên môi trường thật (Azure B1); thời gian chạy ở đó có thể chậm hơn máy local.

## I. Sửa nhóm A theo tài liệu thuật toán (19/11/2026)

Chủ sản phẩm duyệt "nhóm A" gồm các chỗ code lệch so với `sites/an-huu-trai-nghiem/thuat-toan-phan-bo-tai-san.md`. Chưa commit.

| Mã | Mục tài liệu | Đã sửa | File |
|---|---|---|---|
| A1 | §7.4 bước 4, nguyên tắc bất biến §2 | Trang Phân bổ trả lại gợi ý điều chỉnh qua lượt gọi riêng `POST /me/retirement/risk/adjustments` (chế độ `adjustments`), chạy sau khi có kết quả chọn phương án, ngân sách riêng 60 s (trình duyệt chờ 90 s). Tìm từng đòn bẩy riêng lẻ trên chính mô phỏng (cùng seed, số đường, danh mục tham khảo) tới khi pE ≥ 90%: góp thêm (bậc 500.000 đ, trong khả năng góp), nghỉ hưu muộn hơn (bậc 6 tháng, tối đa 10 năm), giảm chi tùy chọn (bậc 5%). Không nâng lợi suất | `backend/src/modules/allocation-risk/adjustments.ts`, `service.ts`; `frontend/src/components/AllocationAdjustments.tsx`, `AllocationExperiment.tsx`, `frontend/src/services/planningAnalysis.ts` |
| A2 | §7.4 | Chỉ cắt chi tiêu nhóm OPTIONAL, không bao giờ đề xuất cắt chi thiết yếu; không khai chi tùy chọn thì trả `NO_OPTIONAL_SPENDING_DECLARED`. Mô hình chỉ đầu tư khoản góp xác nhận (`EXPLICIT_DEPOSITS_ONLY`) nên cắt chi tùy chọn trước hưu không làm quỹ tăng; chỉ phần chi tùy chọn tiếp tục sau hưu làm giảm khoản rút. Khoản lương có ngày kết thúc không tự kéo dài khi nghỉ muộn | `adjustments.ts` |
| A3 | §8.2 | Mô phỏng tái cân bằng theo ngưỡng lệch của chính sách (`rebalanceBandPoints` = 5 điểm, kích hoạt khi lệch > 5, như API `proposeRebalance`) thay vì theo lịch. Tài liệu ghi "≥ 5%", code vận hành dùng "> 5", giữ đồng nhất với vận hành. Phép chiếu tất định của trang Kế hoạch giữ lịch cũ | `simulation.ts` (`bandTriggered`, `portfolioFactors`), `service.ts` (`contextOf`) |
| A4 | §7.4 bước 1, ràng buộc 3 §6.3 | Loại phương án có tỷ trọng ngoài giới hạn `customization.bounds` ở bất kỳ tháng nào, mã `WEIGHT_BOUND_EXCEEDED`. Ví dụ C01: `HIGHER_EQUITY` 70% cổ phiếu bị loại vì trần 60% | `allocation-risk/service.ts` |

### Kiểm chứng

- Backend 1.398/1.398 test (113 file); typecheck mã nguồn và test sạch. Test mới `backend/src/tests/allocation-algorithm-fixes.test.ts` (7 test).
- Frontend typecheck sạch, 132 + 18 test, build qua. E2E Playwright trên bản build mới: `allocation-custom` 15/15 (có ca mới cho thẻ gợi ý điều chỉnh), `allocation-result-review` 37/37. Hai bộ này chạy bản build sẵn ở `.tmp/allocation-result-review-dist`, phải build lại trước khi chạy.
- Bộ audit 15/15 ca đúng trạng thái. C05, C09, C12 gợi ý `NOT_FEASIBLE` vì hồ sơ đã góp hết khả năng, không có chi tùy chọn, lương dừng đúng mốc hưu.
- Ca mới C15 (hưu 2044-05, góp 3 triệu trên khả năng 10 triệu, chi tùy chọn 5 triệu cả sau hưu): góp 6,5 triệu/tháng (+3,5 triệu) cho pE 94%; nghỉ hưu 2048-05 (+48 tháng) cho pE 94%; bỏ hết chi tùy chọn vẫn chưa đủ.

### Còn tồn

1. **Nhóm B: đã sửa ngày 19/11, xem mục J.** Trước đó: B1 rút chi tiêu đầu tháng theo §7.2 (engine v4); B2 số tháng dự phòng theo độ ổn định thu nhập (6/9/12); B3 đo đảo danh mục so với tỷ trọng đang nắm giữ.
2. **Nhóm C:** C1 từ 1.000 kịch bản trở lên (đề xuất chạy tăng dần theo mốc, dùng lại đường đã chạy); C2 dữ liệu tổng lợi suất và bộ tối ưu.
3. Chưa mô hình hóa "dùng tiền góp mới trước" khi tái cân bằng (bước 1 §8.2).
4. Tìm nghỉ hưu muộn giả định nghỉ muộn hơn thì không kém hơn.
5. Bậc tìm thô (500.000 đ, 6 tháng, 5%) vì giới hạn thời gian chạy.

## J. Sửa nhóm B theo tài liệu thuật toán (19/11/2026)

Chủ sản phẩm duyệt nhóm B với các mặc định: vốn giải phóng và tiền góp cuối tháng vẫn vào cuối tháng; tiền góp đầu tháng được bù khoản rút cùng tháng; phí tư vấn tính trên quỹ bình quân nhưng trừ đầu tháng; kế hoạch v3 đã lưu tiếp tục chạy v3; không tự nâng cấp hàng loạt. Với B3, giữ đúng tài liệu khi hòa CVaR. Chưa commit.

| Mã | Mục tài liệu | Đã sửa |
|---|---|---|
| B1 | §7.2 | Engine `retirement-monthly-v5`: rút chi tiêu, phí và chi phí giao dịch đầu tháng; quỹ không âm, không lãi âm. Bản xem trước mới dùng v5; kế hoạch v3 đã lưu giữ nguyên số và có thông báo "cách tính đã cập nhật". Mô phỏng phân bổ, module giải thích, OpenAPI và giao diện theo đúng phiên bản |
| B2 | §3.2 | Dự phòng mặc định theo độ ổn định thu nhập: 6 / 9 / 12 tháng; số khách đặt luôn thắng |
| B3 | §7.4 bước 3, §6.3 | Hòa CVaR thì chọn phương án ít đổi nhất so với tài sản đang giữ (đã trừ vốn bảo vệ); thiếu dữ liệu thì so với danh mục mẫu |

Ví dụ tác động B1: quỹ 1 tỷ, rút 4 triệu/tháng, 0,5%/tháng, 300 tháng: cuối kỳ thấp hơn khoảng 0,8% so với v3. Ca C15 cần góp 7 triệu/tháng thay vì 6,5 triệu.

Kiểm chứng: backend 1.443/1.443; audit 15/15 ca đúng trạng thái, mọi ca ≤ 8,9 s; 7 ca chuyển BASE → LOWER_EQUITY theo B3; frontend 132 + 18 test; E2E 15/15 và 37/37.

Còn tồn: nhóm C (C1 tăng số kịch bản theo mốc, C2 dữ liệu và bộ tối ưu); mức 9 tháng chờ nghiệp vụ xác nhận; chưa mô hình hóa "dùng tiền góp mới trước" khi tái cân bằng; chưa kiểm trên PostgreSQL/Azure.

## K. C1, §8.2 góp trước và tham số dự phòng (19/11/2026)

- **C1:** mặc định 20 kịch bản, khách tăng theo mốc tới 1.000; kịch bản đã chạy được giữ lại và không chạy lại; hết 10 giây thì lưu tiến độ và trình duyệt tự gửi tiếp. Kết quả tăng dần trùng từng chữ số với chạy một lần (đã kiểm trên C01, C05). Dưới 1.000 kịch bản ghi "ước tính sơ bộ".
- **§8.2 bước 1:** mô phỏng rót tiền góp vào tài sản thiếu tỷ trọng trước, chỉ mua bán khi vẫn lệch quá ngưỡng.
- **Số tháng dự phòng:** thành tham số trong bộ giả định, admin duyệt và công bố; chưa duyệt thì dùng 6/9/12 và ghi "chờ xác nhận".

Thời gian chạy xong 20 kịch bản (máy local, chạy riêng): 4,6–17,8 s mỗi ca, trung bình khoảng 11 s; 7/12 ca cần 1 lượt gửi tiếp. Chi phí khoảng 0,27 s mỗi kịch bản mỗi phương án, nên 1.000 kịch bản cần khoảng 13–14 phút cho một ca 3 phương án. Cần tối ưu tính toán (giữ kết quả y hệt) trước khi mốc 500–1.000 dùng được thực tế.

## L. Tối ưu tốc độ mô phỏng và chia luồng (20/11/2026)

Kết quả của 15 ca trùng từng chữ số với bản golden chụp trước khi tối ưu (`backend/scripts/compare-audit-golden.cjs`, bỏ qua chỉ mã định danh do DB tạm tạo và các trường phụ thuộc thời gian). Tổng thời gian chọn phương án 15 ca: 97,9 s xuống 36,0 s (nhanh hơn 2,7 lần). Mô phỏng có thể chia cho worker trên máy nhiều lõi (Azure đã lên B2); worker chỉ có lợi khi chạy nhiều kịch bản. Code mới chưa deploy. Còn tồn: C03 chậm hơn ở bước tìm phương án đã giảm rủi ro, chưa đo trên B2 thật.

## M. Hoàn thiện cơ chế 7 bước và review theo plan 20/11/2026

Bản local đã tiếp tục phần Antigravity dừng vì quota. Trạng thái dưới đây thay các ghi chú “chưa làm” ở mục trước trong cùng phạm vi; không thay xác nhận nghiệm thu production. Báo cáo chi tiết: [hoàn thiện và kiểm chứng](docs/bao-cao-hoan-thien-thuat-toan-7-buoc-2026-11-20.md).

| Bước | Đã có và kiểm | Phần chưa thể gọi là hoàn tất vận hành |
|---|---|---|
| 1 — Hoàn cảnh/dòng tiền | Lịch nghĩa vụ ưu tiên/nominal, người phụ thuộc, lùi mục tiêu linh hoạt; API và UI | Dữ liệu UNKNOWN giữ null/cảnh báo, không suy diễn |
| 2 — Khả năng chịu rủi ro | BOTH lấymin; giới hạn ràng buộc; phản ứng/nghề nghiệp theo policy; nhu cầu thanh khoản | Hệ số/trần chưa duyệt tắt; loại ngành cần ánh xạ |
| 3 — Vốn bảo vệ | Xác nhận mục tiêu trùng, residual và cumulative đúng kỳ; tiền gửi theo kỳ hạn ghim | Không tự đổi sang lợi suất TPCP, không tự xác nhận |
| 4 — Thị trường | Chặn/override publish, legacy disclosure, kiểm chất lượng, LW constant-correlation | Chuỗi nháp chưa là total-return có giấy phép; không công bố mới |
| 5 — Tập danh mục | Cash/loss/bounds/occupation mọi tháng, locked/hardlimits, C17 | Optimizer production tắt; FEASIBLE không đồng nghĩa tối ưu toàn cục; lô/issuer thuộc thực thi |
| 6 — Mô phỏng/giải thích | Tới1000, offsets/worst/sequence/spread/income/health/shortfall, giải thích, API ngưỡng, UI shock | Đo SLA Azure B2 và UI threshold còn mở |
| 7 — Theo dõi/tái cân bằng | History/owner, pE trước/sau tùy chọn, cashfirst+postcashband, cổtức/đáohạn, route/lệnhlô, v5days365, floor xuyên các tầng | Migration chỉ kiểmDBtạm; UI history/drift/orders và nghiệmthu thật còn mở |

Kiểm: backend **1.613/1.613 test/147file**, source/testTypeScript, isolatedPrisma/build/startup PASS; SwaggerParser VALID186path/120schema; frontend133assets+18logic+TypeScript/build, Playwright20/20 và37/37. Migration mới clean/upgrade trênDBtạmPASS,56bảngcũ bảo toàn. Golden17ca và sooptimizer bật/tắt xem báo cáo; B2 chưa nghiệm thu.

Các sửa review quan trọng gồm liquidity khớp thiếu/ngoài kỳ, lịch nghĩa vụ sai nominal và horizon, trần nghề nghiệp ở tháng sau, ngưỡng sau tiền tự do, bỏ sót cashAllocated trong lệnh sản phẩm và sàn chi tiêu dưới ngưỡng5pp. Không bật tham số chưa duyệt; không đổi số lịch sử v3. Mọi engine/migration được bảo vệ đã đối chiếu SHA-256. Chưa commit hay deploy.
