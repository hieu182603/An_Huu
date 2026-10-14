# T08 — Báo cáo, so sánh, mô phỏng và xuất tháng

## Cập nhật 13/10/2026 — API cho giao diện desktop

- `comparison.atRetirement` bổ sung `status`, `reasons`, `basis: SAME_RETIREMENT_MONTH_NOMINAL`, `baselineMonth`, `candidateMonth`, `delta`. Các delta là `projectedFund`, `requiredFund`, `fundingGap`, `coveragePercentagePoints`, cùng chiều candidate trừ baseline. Chỉ trả delta khi hai tháng nghỉ hưu bằng nhau và các điều kiện so sánh gốc đều đạt; khác tháng trả `RETIREMENT_MONTH_DIFFERS`. Không dùng `comparison.delta.*AtValuation` cạnh hai cột lấy từ `summary.atRetirement`. `comparison.delta` cũ giữ nguyên.
- `GET /:planId/versions/:versionId/export.csv?format=readable-vi` xuất 20 cột tiếng Việt theo tháng, tiền làm tròn nửa lên đến đồng ở bước trình bày bằng Decimal; giữ số âm, tháng, phiên bản, ngày số liệu, kịch bản, nhãn giả định/dự báo cập nhật. Số dư âm là thiếu quỹ theo mô phỏng, không phải khoản vay thực tế. Không cộng các số dư tháng thành tổng năm.
- Bỏ `format` hoặc `format=technical` giữ bản CSV kỹ thuật đầy đủ và chính xác như trước. `format` không hợp lệ trả 400. Cả hai dùng cùng snapshot/ownership/no-store; không sửa số tiền gốc hoặc tạo phiên bản mới khi xuất.
- Preview nghỉ hưu `INCOMPLETE` có thêm `guidance` như [preview-guidance.openapi.yaml](preview-guidance.openapi.yaml): thời gian yêu cầu, năm bắt đầu/kết thúc bộ giả định, từng khoảng thời hạn của quy tắc, điều kiện không đạt và lời giải thích tiếng Việt cho các mã chặn cấu hình/lựa chọn. Giữ `issues` gốc để xử lý các mã chưa có hướng dẫn. Preview `READY` và snapshot lịch sử giữ cấu trúc/hash cũ, không thêm metadata hướng dẫn.
- API vẫn hỗ trợ tháng nghỉ hưu bằng tháng định giá (không có giai đoạn tích lũy). Không suy diễn rằng có thể gửi tháng nghỉ hưu trước tháng định giá; v3 hiện vẫn chặn trường hợp đó.

> Cập nhật 05/10/2026: model v3 hỗ trợ góp đầu/cuối tháng; EXPLICIT_DEPOSITS_ONLY đã chốt; có preview/lưu/apply reforecast và giữ replay v2. Contract hiện hành: [CONTRIBUTIONS_REFORECAST.md](CONTRIBUTIONS_REFORECAST.md). Các mô tả chỉ cuối kỳ/reforecast chỉ đọc/chờ Q13–Q15 ở checkpoint cũ bên dưới là lịch sử.

Backend checkpoint 04/10/2026. Nối tiếp [PLANS.md](PLANS.md) và [RETIREMENT_MONTHLY.md](RETIREMENT_MONTHLY.md). Không migration; vẫn dùng schema 0006. Backend có endpoint, contract và kiểm chứng; giao diện do AI frontend xử lý theo FE-T08 trong `docs/task-frontend.md`, chưa nghiệm thu xuyên các màn hình.

Tất cả endpoint dưới `/api/v1/me/retirement/plans` yêu cầu USER/Bearer/session thật, kiểm ownership plan và version cùng plan. ADMIN không đọc kế hoạch riêng qua endpoint USER. API quản trị T03/T04 vẫn theo contract riêng; không đăng ký FinancialService legacy tự chọn currentVersion sau calculate.

## Nguồn thống nhất để hiển thị

`GET /:planId/report?versionId=:versionId`

- Chỉ định versionId để mở bản lịch sử. Bỏ versionId thì đọc currentVersionId và snapshot cùng transaction; không chọn bản lưu mới nhất thay current.
- `status: AVAILABLE` có `version` (cấu trúc T07 với toàn bộ preview đã lưu), `goal` tóm tắt từ snapshot. Dùng `version.preview.calculation.summary/rows` cho dashboard, biểu đồ và bảng tháng; `goal`/`version.preview.selection` để nạp form mục tiêu. Goal gồm retirementMonth, endMonth, monthlyExpenseToday, monthlyContribution, monthlyReserve, terminalBalance; không lấy từ mục tiêu tuổi-năm legacy.
- Chưa áp dụng bản nào: `NO_APPLIED_VERSION`, version và goal null. Có thể mở bản đã lưu bằng versionId rõ ràng để xem trước khi áp dụng.
- `planRevision`, `currentVersionId`, `baselineVersionId` mô tả trạng thái kế hoạch tại lúc đọc; snapshot chọn không đổi khi current thay. `profileChanged` so revision hồ sơ với snapshot; không trộn giá trị hồ sơ mới vào kết quả cũ.
- `valueKind: FORECAST`, không phải số dư thực tế. `hypothetical` cho biết đã dùng nhánh giả định cá nhân `whatIf`. Cờ này không thay cảnh báo chi tiết trong preview.
- Danh sách/select plan dùng T07. Backend không tự chọn một primaryPlan toàn tài khoản; UI giữ rõ planId đang xem. Thông báo có cấu hình mới vẫn đọc từ detail T07 và không tự áp dụng.

JSON đầy đủ cũng có thể đọc qua `GET /:planId/versions/:versionId`; response T07 giữ nguyên. `Cache-Control: no-store` từ session router áp dụng cả báo cáo và CSV. Nội dung số liệu và nguồn của snapshot chỉ đến từ DB đã lưu; không tính lại bằng cấu hình hiện hành để hiển thị.

## Giả định cá nhân T08 trong request T06/T07

Request preview có thêm trường **optional**, không đổi hành vi của request cũ:

```json
{
  "whatIf": {
    "retirementMonth": "2050-05",
    "assetValues": [{ "assetId": "id-tai-san-trong-ho-so", "value": "100000000" }]
  }
}
```

Đây chỉ là phần bổ sung vào request T06 đầy đủ. whatIf phải có ít nhất một thay đổi; assetValues nếu có phải không rỗng, không trùng ID. Tiền theo moneySchema hiện hành: chuỗi không âm, tối đa 16 chữ số nguyên và 2 chữ số thập phân. Kết quả tính vẫn giữ Decimal precision 48.

- `retirementMonth` thay mục tiêu cho riêng dự phóng này. Không tự đổi birthMonth, pensionStartMonth, lịch thu nhập, kỳ cuối hay lịch trả nợ. Tháng phải nằm từ tháng định giá đến endMonth và thỏa kiểm tra profile. Lương không tự kéo dài hoặc được giữ sau hưu: retirementIncomeIds vẫn phải chọn rõ. Tháng hưu muốn lưu thành dữ liệu hồ sơ thật phải cập nhật profile API riêng rồi tính lại.
- `assetValues` thay giá trị **toàn tài sản** của đúng assetId trong bản sao hồ sơ. Sau đó vẫn nhân ownershipShare × retirementShare, kiểm ngày định giá, tiền tệ, thanh khoản/tháng dùng được; không tự mở khóa tài sản, thay sở hữu hay thêm vốn trực tiếp vào quỹ. Nhà chưa có phương án không thành tiền mặt. Khoản netAmount phương án bán/thuê độc lập với giá tài sản và không đổi theo assetValues.
- ID tài sản không tồn tại trả INCOMPLETE/UNKNOWN_ASSET; dữ liệu giả định không hợp lệ trả issue INVALID_HYPOTHETICAL_PROFILE hoặc lỗi request/khoảng kỳ. Macro/rate/ownership/valuationDate không được ghi đè qua whatIf.
- Có whatIf thì preview giữ warning `HYPOTHETICAL_VALUES_PROFILE_UNCHANGED`. netWorth trong calculation lúc này cũng là con số theo giả định, không phải tài sản ròng thực đã khai. Người dùng phải thấy nhãn giả định cùng mọi kết quả liên quan.
- Hồ sơ lưu không bị thay; references.profileHash vẫn là hồ sơ nguồn, selection/inputHash mang whatIf. Snapshot T07 lưu cả nguồn và selection; apply chỉ chọn kế hoạch này, không sửa hồ sơ. Có thể tái lập core như bản T06 khác. Model code không đổi vì recurrence/quy ước tính cũ không đổi; chỉ bổ sung cách tạo đầu vào giả định rõ ràng. Requests cũ và snapshot cũ giữ kết quả.

## So sánh hai phiên bản

`POST /:planId/compare`

```json
{ "baselineVersionId": "uuid-ban-a", "candidateVersionId": "uuid-ban-b" }
```

Trả `{baseline,candidate,comparison}`. Hai bản đều phải thuộc plan của người gọi. Baseline trong request là bản đối chiếu được chọn, không mặc định bắt buộc bằng baselineVersionId của plan; UI ghi rõ đang so với bản nào.

`comparison.status` COMPARABLE hoặc NOT_COMPARABLE. Không tính delta nếu khác valuationDate, currency, endMonth hoặc một kết quả INCOMPLETE. Lý do lần lượt VALUATION_DATE_DIFFERS/CURRENCY_DIFFERS/END_MONTH_DIFFERS/INCOMPLETE_CALCULATION. Hai nội dung vẫn được trả để đọc riêng. Không lấy zero thay null.

COMPARABLE trả delta chuỗi Decimal, chiều **candidate trừ baseline**:

| Trường | Ý nghĩa |
| --- | --- |
| projectedFundAtValuation | Chênh A đã quy về ngày định giá |
| requiredFundAtValuation | Chênh K tại cùng ngày định giá |
| fundingGapAtValuation | Chênh thiếu hụt K−A tại cùng ngày định giá; tăng là thiếu nhiều hơn |
| coveragePercentagePoints | Chênh điểm phần trăm, không phải tỷ lệ tăng trưởng; null nếu K=0 ở một bản |
| requiredConstantMonthlyContribution | Chênh mức góp đều tổng; null nếu một bản không có kỳ tích lũy |
| additionalMonthlyContribution | Chênh mức tăng thêm trên lịch góp của từng bản |
| unfundedWithdrawals | Chênh tổng nhu cầu mới chưa tài trợ |
| terminalBalance | Chênh số dư signed cuối cùng tại cùng endMonth |

`basis: VALUATION_DATE_EACH_VERSION_DISCOUNT_FACTORS` nghĩa là quy về cùng ngày nhưng mỗi bản dùng hệ số riêng; thay lợi suất có thể thay cả dự phóng lẫn hệ số quy đổi. Không suy tác động nhân quả của một biến khi nhiều đầu vào/nguồn đổi. `differences` cho biết nguồn profile/policy/assumptions, tháng hưu và `selectionFields` thay đổi (so object không phụ thuộc thứ tự khóa JSONB). profile=false không có nghĩa whatIf không đổi: xem selectionFields.

Vẫn phải đọc `firstShortfallMonth`, warnings và terminalTarget trong từng summary để hiểu kết quả; một delta thuận lợi không chứng minh không thiếu tiền. Đây là mô phỏng xác định, không phải xác suất thành công.

## Mô phỏng so với bản đã lưu

`POST /:planId/versions/:versionId/simulate` với `{ "preview": <request T06 đầy đủ> }`.

Baseline là snapshot versionId; candidate lấy hồ sơ **hiện tại đúng expectedProfileRevision** và policyVersionId được chỉ định rõ. Đọc snapshot và nguồn candidate trong một transaction, tính bên ngoài transaction. Không tự lấy policy mới nhất/câu trả lời đầu tiên hoặc điền lương/chi/tuổi mẫu. UI có thể khởi tạo form từ baseline.preview.selection, rồi chủ động cập nhật revision/những mục người dùng muốn thử.

Response `{baseline,candidate,comparison,saved:false,applied:false}`. Candidate có thể INCOMPLETE; khi đó comparison không có delta. Endpoint không tạo version/audit/outbox hoặc đổi current/hồ sơ. Chưa có baseline thì dùng T06 preview trực tiếp.

Để giữ mô phỏng, gửi `candidate.selection` và `candidate.inputHash` qua create T07 với revision kế hoạch hiện tại. Chỉ sau khi lưu thành công mới dùng ID/revision trả về cho apply rõ ràng. Không ghép inputHash cũ với form đã đổi. Kết quả saved/report/replay/CSV dùng đúng candidate đó. Không có bước tự áp dụng nằm trong simulate.

## CSV theo phiên bản

`GET /:planId/versions/:versionId/export.csv`

HTTP 200 `text/csv; charset=utf-8`, UTF-8 BOM, CRLF, trường được quote/escape dấu nháy. Content-Disposition chứa tên tệp gồm planId, version và versionId; CORS expose header này cho origin được phép. Token vẫn nằm trong Authorization, không đưa vào URL. Không trả JSON envelope trên nhánh CSV thành công; lỗi trả ErrorEnvelope JSON như API khác. Client phải kiểm status/content-type trước tải.

Mỗi dòng là một tháng snapshot, metadata lặp: plan/version/snapshotHash, modelVersion, profileRevision, valuationDate, currency, policyVersionId/hash, assumptionVersionId/hash, inputHash, scenario, timing, FORECAST và hypothetical. Các cột số gồm toàn bộ row tháng (thu/pension/chi/nợ/góp/rút/giải phóng/lãi/số dư âm/funded/unmet/vốn cần). Không chạy lại engine hoặc làm tròn theo đơn vị hiển thị. Text tự do của người dùng không được đưa vào CSV; helper vô hiệu hóa text có tiền tố công thức mà vẫn giữ số âm là giá trị số.

CSV là dữ liệu xuất **chưa làm tròn**, không phải bảng trình bày làm tròn 1.000 VND; UI định dạng riêng. Phần mềm bảng tính có thể tự làm mất độ chính xác khi nhập số dài, nên nhập cột decimal dưới dạng text nếu cần đối chiếu nguyên chuỗi; snapshot JSON là nguồn đầy đủ gồm summary/nguồn/warnings/limitations. Không coi CSV này là snapshot để nhập lại hoặc sổ thực tế T09.

## Những việc UI cần sửa và bằng chứng

Rà mã frontend (không sửa trong đợt backend): helper apiRequest đã bóc data nhưng retirement/plans wrappers bóc thêm lần hai; simulation tính tháng hưu nhưng chưa gửi; tự lấy câu trả lời rủi ro đầu tiên; fallback 0 thành tiền mẫu; goal vẫn chạy calculator cũ; save→apply có thể dùng activePlan/revision cũ rồi bỏ qua false. Chi tiết thao tác/file/tiêu chí nghiệm thu tại FE-T08, không coi typecheck hoặc backend test là chứng minh UI hoạt động.

- 10 ca T08: input whatIf/không đổi hồ sơ, sở hữu/thanh khoản, macro rejection, report chưa áp dụng/pin version, simulation→save→apply→report/replay, so sánh null/khác ngày/horizon, CSV số âm/precision/nguồn, ownership và 3 response OpenAPI, no-store/CORS/read-only.
- Full backend **215/215 tests, 18 files PASS**; sau thay header CORS/ca CSV lãi âm, kiểm lại nhóm T08 + OpenAPI **15/15 PASS**. Typecheck source/frontend/tests đạt; build đầy đủ đạt sau khi tiến trình DB verification đóng kết nối (lần build trong lúc tiến trình giữ DLL bị Windows EPERM, không dừng tiến trình khác).
- `verify-plan-presentation-db.cjs`: **31 kiểm tra HTTP/AuthService/PostgreSQL thật PASS**, gồm luồng T07 và report/CSV/so sánh/mô phỏng readonly/save/apply/reload/preserve profile/pin bản cũ. Toàn bộ fixture rollback, 50 hồ sơ và 2 cấu hình hiện có giữ nguyên; không email. Không migration T08.
- Còn nghiệm thu UI T08 xuyên màn, export tải từ browser và tương tác nhiều tab. Backend tiếp T09 sổ thực tế; không tự gắn actuals vào forecast khi chưa có đối soát.
