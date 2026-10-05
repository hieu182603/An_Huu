# Q15-03 — Điều chỉnh nguồn của dự báo từ thực tế

Triển khai 05/10/2026, bổ sung cho [CONTRIBUTIONS_REFORECAST.md](CONTRIBUTIONS_REFORECAST.md). Dùng endpoint preview/lưu/apply hiện có, không migration hoặc model tính mới: các dòng đầu vào được xác định lại trước khi chạy engine v3; v2/v3 đã lưu vẫn replay bằng snapshot riêng.

## Command

Input `POST /api/v1/me/retirement/actuals/reforecast/preview` có thêm `sourceChanges?: []`. Mỗi phần tử có UUID `id`, `confirmed:true`, `document` (1–500 ký tự mô tả/tham chiếu chứng từ). Server lưu khai báo nguồn trong candidate/version; đây là xác nhận của người dùng, không phải xác minh chứng từ tại ngân hàng/BHXH. Không tải URL hoặc gọi dịch vụ bên ngoài.

| kind | Trường riêng | Hành vi |
| --- | --- | --- |
| DEBT_SETTLED | sourceId là ID khoản vay, actual:{period,eventId}, remainingObligation:"0" | Kiểm hợp đồng nguồn, giao dịch DEBT_PAYMENT dương, người dùng xác nhận không còn nghĩa vụ. Bỏ đúng lịch trả của khoản đó trong các tháng tương lai, kể cả tỷ lệ stress đã chọn. Khoản vay khác giữ nguyên. |
| ASSET_REALIZED | sourceId là ID tài sản, actual:{period,eventId} | Giao dịch CONTRIBUTION dương đã ghi phần tiền thực vào quỹ. Bỏ lần giải phóng vốn dự kiến của tài sản; nếu tài sản đang cho thuê thì dừng đúng phần tiền thuê của tài sản. Không cộng số tiền bán thêm vào anchor. |
| PENSION_REPLACE | sourceId:"pension", startMonth, endMonth, monthlyAmount, priceBasis:"NOMINAL_MONTHLY" | Cần nguồn pension KNOWN. Thay số hưu danh nghĩa từng tháng trong khoảng xác nhận; số0 chủ động ngừng. Ngoài khoảng vẫn theo nguồn cũ; không tự nhân CPI/lợi suất. |
| FLOW_REPLACE | sourceType:INCOME hoặc EXPENSE, sourceId, startMonth, endMonth, monthlyAmount | Thay riêng số của một dòng thu/chi có sẵn; giữ các dòng khác. Một tháng là start=end; định kỳ là khoảng nhiều tháng. Số0 chủ động dừng. |

Ví dụ sourceChanges (các chuỗi UUID cần thay bằng ID thật):

```json
[
  {
    "id": "UUID điều chỉnh",
    "kind": "DEBT_SETTLED",
    "sourceId": "loan-a",
    "actual": {"period": "2026-09", "eventId": "UUID giao dịch"},
    "remainingObligation": "0",
    "confirmed": true,
    "document": "Xác nhận hoàn tất nghĩa vụ khoản vay"
  }
]
```

Preview trả `beforeChanges` và `candidate.calculation` cùng anchor để so trước/sau. Lưu gửi nguyên preview command cùng inputHash/revision qua `/plans/:id/reforecasts`, Idempotency-Key bắt buộc. Apply riêng như trước. Candidate có `sourceChanges` chứa cả lịch sử từ nguồn; CSV thêm `sourceChangeIds`, compare có thể liệt kê sourceChanges trong selectionFields. Pension/FLOW mới là đầu vào giả định tương lai nên report/CSV/AI gắn hypothetical; chỉ xác nhận tất toán/tài sản đã thực hiện không tự tạo nhãn giả định này.

## Kiểm tra chống trùng và phạm vi

- Nguồn phải nằm trong hồ sơ đã pin của version thuộc tài khoản; profile revision/nội dung vẫn được kiểm. Không sửa hồ sơ toàn tài khoản khi preview/save/apply.
- Giao dịch tham chiếu phải thuộc các tháng actual đã đọc, đã đóng và đối soát trong đợt này, đúng kind, số dương, ngày từ ngày định giá nguồn. Một event chỉ gắn một nguồn; không nhận số tiền/số dư từ sourceChanges làm anchor. Sửa actual sau preview làm đổi hash; sửa sau save chặn apply/dự báo tiếp theo lineage hiện có. Với chứng từ của tháng đã nằm trước cutoff của bản reforecast nguồn, phải chọn bản nguồn trước đoạn actual đó để xem lại.
- Không khai tất toán/realized cùng nguồn lần nữa trong chuỗi. Không reuse ID giữa sourceChanges và futureChanges, kể cả lịch sử. Khoảng PENSION/FLOW cùng nguồn không được chồng nhau, kể cả lịch sử; muốn sửa khoảng đã pin, xem lại từ nguồn trước điều chỉnh đó.
- PENSION/FLOW bắt đầu sau cutoff, kết thúc trong horizon. Thu/chi sau hưu phải thuộc danh sách nguồn đã chọn trong selection; không tự cho nguồn thu chưa được phép chạy tiếp sau nghỉ hưu. Thu PENSION, chi DEBT_PAYMENT và dòng thu liên kết nhà cho thuê phải dùng luồng chuyên biệt; không đi qua FLOW_REPLACE.
- Không trộn thay tổng (`futureChanges`) và thay riêng nguồn (`sourceChanges`) trên cùng trường/tháng. Thay tổng thu và dừng tài sản cho thuê trong cùng phạm vi cũng bị chặn, vì không còn biết phần thuê trong tổng đã sửa. Số trước sửa không khớp phần nguồn cần bỏ trả SOURCE_SCHEDULE_MISMATCH, không tự ép về0.
- Tài sản hỗ trợ phương án SALE/RENT đã xác nhận hoặc tài sản thanh khoản được lên lịch giải phóng sau ngày định giá. Tài sản đã nằm trong vốn đầu kỳ không được khai thêm như vốn mới. Giữ đúng ownershipShare/retirementShare/amountScope và whatIf đã pin. Số tiền thực nhận có thể khác dự kiến; nguồn thực lấy từ ledger, không ép khớp giá dự kiến.
- DEBT_PAYMENT thuộc thu–chi hộ gia đình; nếu dùng quỹ để trả thì WITHDRAWAL phải được ghi riêng trong sổ thực tế. Backend không tự tạo giao dịch này. ASSET_REALIZED cần tiền thực vào quỹ đã ghi bằng CONTRIBUTION, không dùng INCOME làm khoản nộp quỹ.

## Errors (422)

SOURCE_ACTUAL_REFERENCE_INVALID, DECLARED_LOAN_CONTRACT_REQUIRED, DECLARED_ASSET_SOURCE_REQUIRED, DECLARED_PENSION_SOURCE_REQUIRED, ASSET_HAS_NO_RETIREMENT_SHARE, ASSET_NOT_A_DEFERRED_CAPITAL_SOURCE, SOURCE_ALREADY_REALIZED, ACTUAL_EVENT_ALREADY_LINKED, SOURCE_CHANGE_OVERLAP, SOURCE_CHANGE_OUTSIDE_REMAINING_HORIZON, SOURCE_CHANGE_CONFLICTS_WITH_TOTAL_OVERRIDE, SOURCE_SCHEDULE_REVIEW_REQUIRED, SOURCE_SCHEDULE_MISMATCH, FLOW_SOURCE_REVIEW_REQUIRED, FLOW_NOT_SELECTED_FOR_RETIREMENT. Trùng ID cũ dùng FUTURE_CHANGE_ID_REUSED tại command gate. Input thiếu xác nhận/field sai trả400. Giữ form khi gặp lỗi, không tự bỏ nguồn hay chuyển amount thành0.

## Giới hạn còn lại

Kế hoạch giải quyết các giới hạn dưới đã được research05/10 và tách T13–T17 trong [tài liệu mở rộng](../../docs/research-bhxh-no-nguon-moi.md); chưa phải API đã triển khai. Partial prepay đã có ở mô phỏng nợ T02; phần mở rộng là actual allocation, revision hợp đồng và nguồn mới trong reforecast.

Không tự nhận diện sự kiện từ nội dung ghi chú. Chưa thay toàn bộ hợp đồng nợ sau trả một phần/tái cơ cấu, chưa nhập tài sản/nguồn thu hoàn toàn mới vào snapshot từ command này, chưa tính BHXH theo quá trình đóng. Các việc đó đi qua cập nhật hồ sơ/nguồn riêng hiện có và tạo version nguồn mới. Đợt này xử lý tất toán hoàn toàn, tài sản đã thành tiền và các lịch danh nghĩa được xác nhận; không hứa hỗ trợ mọi biến đổi hợp đồng.

`source-changes.test.ts` và `verify-source-changes-db.cjs` kiểm cách tách nguồn, bằng chứng thực tế, bất biến snapshot, permission, schema và rollback. Trạng thái đã chạy xem PROGRESS.md; UI chưa nghiệm thu.
