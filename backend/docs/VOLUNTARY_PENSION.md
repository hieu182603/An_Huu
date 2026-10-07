# BHXH tự nguyện và lịch sử hỗn hợp — 07/10/2026

Engine `vn-pension-voluntary-v1`, branch `BH2_VOLUNTARY_EMPLOYER_MIXED_NORMAL`, strategy `vn-voluntary-employer-normal-2025-v1` dùng các API lịch đóng, quản trị luật và estimates hiện có. Không migration, giữ hành vi và mã engine cũ. Một kết quả chỉ được dùng khi có bộ quy định phù hợp đã qua VALIDATE → REVIEW độc lập → PUBLISH. Kiểm thử với luật mẫu không phải công bố pháp lý; hiện chưa có corpus tự nguyện thật được duyệt/công bố.

Nhánh có lương Nhà nước dùng engine riêng `vn-pension-voluntary-state-v1`, branch `BH2_VOLUNTARY_STATE_MIXED_NORMAL`, strategy `vn-voluntary-state-normal-2025-v1`. Cho phép lương Nhà nước/doanh nghiệp nhóm Điều2(1)(a,b) trước khi chuyển tự nguyện. Bộ tính tự nguyện-doanh nghiệp cũ vẫn trả REVIEW_REQUIRED cho hồ sơ Nhà nước; không tự đổi kết quả đã lưu sang nhánh mới.

## Phạm vi hiện thực

Hồ sơ kết thúc bằng tham gia tự nguyện, đóng định kỳ thông thường, tuổi nghỉ hưu bình thường. Có thể có lịch sử bắt buộc lương doanh nghiệp thuộc Điều 2(1)(a). Kiểm tối thiểu 180 tháng thực được tính, không làm tròn 179 thành 180; WITHDRAWN/NOT_CONTRIBUTED không tính, UNKNOWN/khoảng trống không được suy thành không đóng. Chứng từ và lịch tương lai phải tách rõ; không nhận xác nhận sau ngày đánh giá.

Nhánh Nhà nước tính phần bình quân bắt buộc theo Điều72–73/NĐ158 Điều15/TT12 Điều16 trước khi ghép phần tự nguyện theo NĐ159 Điều11. Giữ cửa sổ theo thời điểm tham gia đầu tiên và phép so toàn thời gian đúng nhóm; không lấy bình quân đơn giản của hai mức bình quân. Người tham gia trước2016 dùng hệ số đóng Nhà nước có chứng từ nhân mức tham chiếu; các ca từ2016 cần hệ số năm hưởng đã công bố. Trước10/2004 hoặc chuyển nghề/phụ cấp đặc thù vẫn REVIEW_REQUIRED.

Thu nhập tự nguyện dùng INCOME_FACTOR theo năm; tiền lương doanh nghiệp dùng WAGE_FACTOR riêng. Bình quân hỗn hợp theo tổng số tháng và tổng căn cứ đã điều chỉnh. Sàn mức tham chiếu chỉ xét số tháng bắt buộc đúng nhóm, không lấy tổng tự nguyện + bắt buộc thay thế. Trợ cấp một lần trả riêng trong `lumpSum`, không trở thành vốn góp/quỹ.

Nguồn pháp lý: [Luật BHXH, bản hợp nhất](LEGAL_RULE_MATRIX.md), [NĐ159 Điều 10–11](https://vbpl.vn/bonoivu/Pages/vbpq-toanvan.aspx?ItemID=179149), [TT11 Điều 5](https://vbpl.vn/bonoivu/Pages/vbpq-toanvan.aspx?ItemID=179767), NĐ135 Phụ lục I và CV340/BHXH-CSXH ngày 03/02/2026. Hai trang bản ký CV340 đã đối chiếu cột thu nhập, từ 2008 đến 2026; không ngoại suy trước 2008 hoặc cho năm hưởng khác. Bộ kiểm luật có ba mẫu tiền hưu độc lập và năm ca chặn, nhưng không thay rà soát pháp lý độc lập.

## Hợp đồng API

`POST /api/v1/me/pension/estimates/preview` và body `preview` của API lưu nhận thêm trường sau, bên cạnh IDs/revision/ngày hưởng/ngày dừng và các trường chung đã có:

```json
{
  "voluntaryCase": {
    "kind": "NORMAL_VOLUNTARY",
    "paymentMethod": "REGULAR_ONLY",
    "ageRule": "NORMAL",
    "benefitStart": {
      "kind": "ELIGIBILITY",
      "month": "2026-07",
      "confirmation": "DOCUMENTED",
      "evidence": [{"reference": "Mã chứng từ", "contentHash": "<SHA-256 gồm 64 ký tự hex>", "confirmedOn": "2026-07-01"}]
    }
  }
}
```

Không gửi `caseDetails` cùng trường này. Với nhánh doanh nghiệp, không gửi `stateSalaryCase`. Với nhánh Nhà nước, **bắt buộc** `stateSalaryCase` theo hợp đồng đã có: firstParticipationMonth, firstParticipationEvidence, salaryTreatment=ORDINARY, treatmentEvidence. Mỗi tháng Nhà nước trước điều kiện điều chỉnh2016 phải có `stateSalary.totalContributionCoefficient` và evidence. Chọn bộ luật có coverage đúng branch từ API discovery; không tự hạ xuống engine doanh nghiệp khi thiếu bộ luật Nhà nước. Gửi voluntaryCase vào engine bắt buộc bị 422 `PENSION_CASE_ENGINE_MISMATCH`. Trường mới là optional ở hợp đồng chung để giữ dữ liệu cũ; bắt buộc khi chạy engine tự nguyện.

`ELIGIBILITY` dùng tháng sau tháng đủ tuổi và đủ 180 tháng. Khi tiếp tục đóng sau tháng đủ điều kiện, dùng `CONTINUED_CONTRIBUTIONS`, có `benefitRequestDate`; tháng hưởng là tháng sau cả dừng đóng và yêu cầu. `benefitStart.month` phải trùng ngày hưởng khai báo và kết quả luật. Trường hợp giả định phải khai `HYPOTHETICAL`; lịch dự kiến nằm ở `futureContributions`. Đây vẫn là ước tính theo bộ luật đã chọn, không xác nhận cơ quan BHXH đã duyệt quyền lợi.

Đầu ra giữ `assessmentStatus`, `estimateKind`, `missingFields`, `citations`, `monthlyPension`, `startMonth`, `lumpSum`. Breakdown thêm `COMPULSORY_MONTHS`, `VOLUNTARY_MONTHS`, `COMBINED_ADJUSTED_AVERAGE`, `ELIGIBILITY_MONTH`, `NORMAL_RETIREMENT_MONTH`, `PENSION_RATE`, `TRANSITIONAL_FLOOR_APPLIED`, `BENEFIT_START_CLAUSE`, `RETIREMENT_LUMP_SUM`.

Nhánh Nhà nước có thêm STATE_WAGE_WINDOW_MONTHS, STATE_CONTRIBUTION_MONTHS, STATE_ADJUSTED_AVERAGE và COMPULSORY_ADJUSTED_AVERAGE. Tổng241tháng có239tháng bắt buộc khác trường hợp240tháng bắt buộc khi xét sàn; không suy từ tổng số năm. Bộ luật kiểm nhánh doanh nghiệp8mẫu, nhánh Nhà nước14mẫu.

Lưu bằng hash preview và Idempotency-Key. Đọc lại dùng đúng engine/lịch/bộ luật/ngày đánh giá đã pin; lịch hoặc luật mới chặn lựa chọn estimate cũ vào nguồn mới, không làm mất replay. Chọn vào dự báo qua `pensionSelections` hiện có; chỉ số hưu hàng tháng tương lai, không tự góp trợ cấp, không ghi đè profile.

## Chưa hoàn tất

- Nhóm bắt buộc ngoài a/b, CREDITED, chuyển lương trước10/2004 và các chế độ Nhà nước đặc thù.
- Đóng trước/đóng bù đã có engine riêng (VOLUNTARY_PAYMENTS.md).

## Chuyển tiếp 2025 và Luật Điều141(9) (07/10/2026)

Căn cứ đã đọc: TT11/2025 Điều4–5 (R06, PDF trang2–3, bản scan đọc trực tiếp) và Luật BHXH Điều141(9) (R02). Không tạo engine version mới: hai giá trị input mới trước đây bị schema từ chối, input cũ đi đúng nhánh cũ (kể cả mã VOLUNTARY_TRANSITION_ASSESSMENT_REQUIRED), replay không đổi.

- `voluntaryCase.benefitStart.kind: "TRANSITION_2025"` (TT11 Điều5(4)/(5)): đủ điều kiện trước 07/2025 và tháng đóng cuối trước 07/2025 → ngày hưởng 2025-07. Khai khi không đủ điều kiện → VOLUNTARY_TRANSITION_CONDITIONS_NOT_MET; không khai khi thuộc trường hợp này → giữ REVIEW cũ. Nhóm thực tế là khoản4: ≥15 năm (gộp bắt buộc + tự nguyện), đủ tuổi ND135 trước 07/2025 — trước đây không đủ 20 năm theo luật cũ.
- `voluntaryCase.ageRule: "LAW_ART141_9"`: người dùng **chọn** lộ trình 60/55 (luật cho chọn Điều98 thay thế). Điều kiện: tháng tự nguyện đầu tiên trước 2021-01 và ≥240 tháng **tự nguyện**; không dùng bảng tuổi ND135 nên cũng không vướng đoàn hệ trước 1961/1966. Bộ luật phải có trích dẫn `LAW_ART141_9`; số tháng vượt ngưỡng trợ cấp một lần → LEGACY_AGE_GRANT_REVIEW_REQUIRED (Điều100 không nói mốc tuổi nào áp dụng).
- Giới hạn thực tế: BHXH tự nguyện bắt đầu 2008-01 nên 240 tháng tự nguyện sớm nhất đủ ở 2027-12 → Điều141(9) có hiệu lực từ năm hưởng 2028; khoản5 TT11 hầu như không phát sinh theo lịch sử tháng.
- **Năm hưởng 2025 (chuyển tiếp)**: draft `bh2-voluntary-transition-2025` (engine vn-pension-voluntary-v1, hiệu lực 2025-07-01→2026-01-01) dùng TT01/2025/TT-BLĐTBXH (nguồn FACTORS2025, datafiles.chinhphu.vn, SHA-256 b5657e5d…, đọc trực tiếp PDF trang 2–3: Bảng 1 lương, Bảng 2 thu nhập; phạm vi "hưởng từ 01/01 đến 31/12/2025") và mức tham chiếu 2.340.000 (NĐ73). **Điểm pháp lý cần người duyệt quyết định**: TT01 căn cứ NĐ115/NĐ134 (bị thay từ 01/07/2025); không tìm thấy văn bản xác nhận tiếp tục áp dụng sau 01/07/2025, cũng không có bảng thay thế cho nửa cuối 2025 (CV340 có dòng năm 2026=1,00, là bảng cho năm hưởng 2026). Số liệu cùng phương pháp CPI gốc 1994 như NĐ158 Điều16. Trích dẫn ghi rõ điều này; draft không được tự duyệt/công bố.
- Golden chuyển tiếp với hệ số thật: nam sinh 1963-03, 96 tháng bắt buộc 2005–2012 + 96 tháng tự nguyện 2013–2020, căn cứ 5.000.000 → (18,09+9,98)×12×5.000.000/192 = 8.771.875 × 41% = **3.596.468,75**, hưởng 2025-07.
- Điều141(9) vẫn cần bảng năm hưởng ≥2028 (chưa ban hành); test dùng bảng giả lập hệ số 1 (2.750.000 tính tay), không phải corpus pháp lý.
- Nghỉ sớm/đặc thù, suy giảm, nhà giáo, quân đội, điều ước.
- Đã tạo hai corpus tự nguyện doanh nghiệp/Nhà nước có nguồn/hash, mỗi bộ1.146dòng; **còn** rà soát độc lập, duyệt và công bố thực tế, nghiệm thu UI và hồ sơ đối chiếu chuyên môn.

Không đánh dấu T14 hoàn tất khi còn các phần trên. `REGULAR_ONLY` là khai báo có chứng từ của hồ sơ, không tự xác minh phương thức thanh toán bên cơ quan BHXH.

## Bằng chứng kiểm tra

Bổ sung cùng ngày:4draft tái lập offline,18corpus tests; nhánh Nhà nước+tự nguyện có ca cửa sổ bình quân,239/240tháng bắt buộc xét sàn, lưu/replay/owner/stale/source selection/OpenAPI. Full518tests/45files PASS, testtypecheck/sourceemit PASS. `--voluntary --corpus`17HTTP/DBchecks PASS; `--voluntary-state --corpus`17HTTP/DBchecks PASS, cả hai rollback giữ41bảng. Lượt đầu Nhà nước+tự nguyện dừng ở assert HTTP preview lịch (0checks), chưa lưu mã lỗi nên không kết luận nguyên nhân; thêm chẩn đoán status/code, chạy lại đạt. Không lấy lượt thất bại làm bằng chứng hoàn tất.

07/10: 26 ca core tự nguyện đạt; 15 ca service/validation đạt trước khi thêm ca OpenAPI tự nguyện. Verifier `node scripts/verify-state-pension-db.cjs --voluntary`: 16 kiểm tra HTTP/DB thật đạt, rollback đối chiếu toàn bộ 41 bảng không đổi, không gửi email/provider. Bao gồm lịch đóng, duyệt luật mẫu, preview/save/read/idempotency/ownership, capture nguồn và lịch sửa làm stale trong khi replay cũ giữ nguyên. Kiểm này dùng một giao dịch rollback, không phải bằng chứng race nhiều kết nối. Kết quả full suite/typecheck cuối xem PROGRESS.md.
