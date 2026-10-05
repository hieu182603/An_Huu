# P13/P15 — Đóng góp và phiên bản cập nhật từ thực tế

Contract triển khai ngày 05/10/2026. Các ghi chú Q13/Q15 “chờ khách”, “production chỉ cuối kỳ” trong checkpoint cũ là lịch sử. Chính sách đã chốt: `EXPLICIT_DEPOSITS_ONLY`.

Bổ sung cùng ngày: `sourceChanges` đã hỗ trợ tất toán khoản vay, tài sản đã vào quỹ, thay lịch pension và từng nguồn thu/chi. Xem [SOURCE_REFORECAST.md](SOURCE_REFORECAST.md); phần “phạm vi” dưới đây mô tả riêng `futureChanges` thay tổng tháng.

## Thời điểm đóng góp

`POST /api/v1/me/retirement/preview` nhận `contributionTiming: END_OF_MONTH | START_OF_MONTH`, mặc định END; `surplusPolicy` chỉ nhận EXPLICIT_DEPOSITS_ONLY. Đầu kỳ chỉ áp dụng khoản góp trong giai đoạn tích lũy. Rút, giải phóng vốn, góp sau hưu vẫn cuối kỳ. Định giá giữa tháng thì khoản đầu kỳ bắt đầu từ tháng đầy đủ tiếp theo; xem `replayInput.contributionStartMonth`.

START yêu cầu `startOfMonthFunding: {confirmed: true, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START", monthlyAvailable: "...", schedule: [{month, amount}]}`. Thiếu trả INCOMPLETE với issue `START_OF_MONTH_FUNDING_CONFIRMATION_REQUIRED`. Đây là phần tiền thu–chi khả dụng trong tháng mà người dùng xác nhận đã sẵn có đầu tháng, không phải thêm thu nhập/vốn quỹ. Khoản góp bị giới hạn bởi cả dư thu–chi và số khả dụng đầu tháng; số 0 là giá trị xác nhận hợp lệ. Không lấy tiền bán tài sản cuối tháng làm nguồn đầu tháng. Mô hình theo tháng, không kiểm thanh khoản từng ngày.

Model mới `retirement-monthly-v3` dùng `(P+c)*g` cho khoản đầu kỳ đủ điều kiện; cuối kỳ dùng `P*g+c`. Vốn đầu không được nhân thêm một kỳ. Các hệ số từng tháng và lịch góp được giữ riêng. Lãi âm có thể khiến đầu kỳ thấp hơn cuối kỳ. Solver chỉ dùng những tháng đủ điều kiện; `EARLY_FUNDING_REQUIRED` báo thiếu vốn trước kỳ có thể góp, `NO_ELIGIBLE_CONTRIBUTION_PERIOD` báo có kỳ tích lũy nhưng chưa có kỳ đóng đủ điều kiện. Khi không giải được, mức góp trả null, không phải 0.

Snapshot v2 không có marker model trong replay được chạy bằng engine v2 riêng. Không backfill, đổi hash hoặc sửa lịch sử. Model v3 được đăng ký khi lưu phiên bản. Không cần migration: snapshot JSON hiện có chứa đủ trường mới, reader kiểm integrity và dispatch theo model.

## Cập nhật từ thực tế

Endpoint cũ `POST /api/v1/me/retirement/actuals/reforecast` vẫn chỉ đọc. Hai endpoint mới:

1. `POST /api/v1/me/retirement/actuals/reforecast/preview`
2. `POST /api/v1/me/retirement/plans/:id/reforecasts` (201, bắt buộc Idempotency-Key UUID)

Input xem trước:

```json
{
  "planId": "UUID kế hoạch",
  "versionId": "UUID phiên bản nguồn",
  "throughMonth": "2026-09",
  "expectedProfileRevision": 1,
  "futureChanges": [{
    "id": "UUID điều chỉnh mới",
    "field": "plannedContribution",
    "operation": "REPLACE_MONTHLY_TOTAL",
    "amount": "2000000",
    "startMonth": "2026-10",
    "endMonth": "2026-12",
    "reason": "Xác nhận mức góp ba tháng tới"
  }]
}
```

Response `status`, `issues`, `inputHash`, `candidate`, `beforeChanges`, `saved:false`, `applied:false`. BLOCKED/HORIZON_COMPLETE trả candidate/hash/beforeChanges null. `beforeChanges` và candidate cùng anchor, ngày định giá và model, dùng để so trước/sau điều chỉnh tương lai. Không so trực tiếp giá trị vốn ở hai ngày định giá khác nhau. Số quá khứ so với forecast lấy endpoint reforecast cũ.

Input lưu `{expectedRevision, expectedInputHash, preview: <input xem trước>}`. Server đọc lại nguồn và actual trong transaction Serializable; hash bao gồm actual revisions/số dư chốt và toàn bộ dòng tương lai. Actual đổi sau xem trước trả 409 PREVIEW_CHANGED. Lưu chỉ tạo version, tăng plan revision; áp dụng qua endpoint `/apply` hiện có với revision mới, expectedProfileRevision và confirm:true. Retry đúng key trả cùng kết quả; key khác với revision cũ bị conflict.

Candidate giữ `reforecast` gồm kind ACTUAL_REFORECAST, sourceVersionId/hash, originalValuationDate, originalRetirementMonth, throughMonth, actualRevisions. Anchor là closingBalance của tháng chốt, không nhận số dư do client gửi ở command này. Snapshot replay được sau khi actual bị sửa; apply hoặc dự báo tiếp từ nguồn lỗi thời trả 409 ACTUAL_SOURCE_CHANGED. Report/detail trả actualSourceChanged để UI cảnh báo. Muốn cập nhật lại số quá khứ đã sửa, chọn lại phiên bản nguồn trước đoạn actual đó. Khi tiếp từ một reforecast, opening tháng kế tiếp phải bằng anchor trước và lineage giữ cả revisions cũ.

## Phạm vi điều chỉnh tương lai

`futureChanges` thay **tổng theo tháng** của một trong `income`, `livingExpense`, `additionalExpense`, `plannedContribution`; không cộng thêm vào tổng cũ. Đây là liên kết tới trường aggregate của nguồn đã chọn, chưa phải sửa từng hợp đồng thu/chi. Mỗi khoảng phải hoàn toàn sau cutoff và trong horizon, cùng trường không chồng khoảng trong một command; ID không trùng/reuse trong chuỗi nguồn. Số 0 chủ động ngừng dòng. Lịch sử giữ toàn bộ changes; lần sau có thể thay cùng trường bằng ID mới.

Thay đổi chỉ áp dụng tháng được khai; actual một lần không tự trở thành dòng định kỳ. Tính lại capacity, withdrawal và uninvestedSurplus. START vẫn bị giới hạn bởi nguồn đầu tháng đã xác nhận ở phiên bản nguồn, không tự tăng mức khả dụng khi tăng thu. Góp sau hưu chỉ theo mức xác nhận; dư không tự vào quỹ. Khi góp 6 mà dư 5, contribution=5 và budgetShortfall=1.

Lịch nợ, lương hưu và giải phóng tài sản giữ theo snapshot trừ khi có `sourceChanges` hợp lệ; không sửa chúng bằng `futureChanges`. CPI/tỷ suất luôn giữ theo nguồn, không nhận override client. Tất toán/bán tài sản/thay lương hưu cần khai nguồn và xác nhận theo SOURCE_REFORECAST.md; không tự suy diễn từ bút toán. Hồ sơ toàn tài khoản phải còn đúng revision/nội dung của nguồn; thay đổi hồ sơ thì tạo nguồn mới. `netWorth`, assessment và `selection` giữ cơ sở hồ sơ gốc, không được hiển thị như giá trị tài sản thực tại cutoff. Mục tiêu báo cáo giữ tháng nghỉ hưu gốc; summary có thể dùng đầu kỳ dự báo còn lại khi đã nghỉ hưu.

Report/CSV đánh dấu REFORECAST, CSV kèm sourceVersionId/throughMonth/originalRetirementMonth. AI giải thích dữ kiện của bản đã lưu và từ chối nguồn actual lỗi thời; chưa có provider. Endpoint simulate thông thường từ chối bản reforecast với REFORECAST_USE_ACTUAL_UPDATE: để thử lại cùng cutoff hãy dùng nguồn và cutoff đã lưu ở reforecast; để đi tiếp chọn bản cập nhật và cutoff mới.

## Kiểm chứng

`contribution-policy.test.ts`, `reforecast-update.test.ts`, các bộ actuals/plans/engine/AI hiện có và `scripts/verify-contribution-reforecast-db.cjs`. Script DB dùng harness rollback, không reset dữ liệu, không gửi email/AI. Bằng chứng chạy và những phần nghiệm thu còn mở xem PROGRESS.md. Backend tests không thay cho browser hoặc kiểm cạnh tranh trên các transaction DB độc lập.
