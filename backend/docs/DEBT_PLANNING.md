# T02 — Lịch hợp đồng và so sánh trả nợ

Endpoint `POST /api/v1/me/debts/preview` chỉ dành cho USER đăng nhập; đọc hồ sơ v2 của chính phiên hiện tại. Không ghi hồ sơ, kế hoạch, audit hoặc outbox; không đặt lệnh trả nợ. Lưu hợp đồng qua API hồ sơ/nháp T01, dùng revision và idempotency hiện có. Không cần migration mới: hợp đồng nằm trong JSON v2. OpenAPI: [openapi.yaml](openapi.yaml), [debt.openapi.yaml](debt.openapi.yaml).

## Dữ liệu hợp đồng

`debts.entries[].contract` có thể bỏ trống trên hồ sơ T01 cũ, UNKNOWN, hoặc KNOWN kèm `value`. Thiếu hợp đồng vẫn lưu được hồ sơ nhưng preview trả INCOMPLETE, không suy lịch vay từ số tiền trả hàng tháng.

Hợp đồng v1 ghi nguồn/tài liệu, ngày xác nhận, ngày chốt dư nợ, các bên tham gia, ngày đáo hạn và từng kỳ trả. Số dư và ngày chốt phải khớp ngày định giá của hồ sơ. Kỳ đầu thuộc tháng định giá, đến hạn từ ngày chốt trở đi; lịch liên tục một kỳ mỗi tháng, kết thúc đúng ngày đáo hạn. Hỗ trợ tối đa 600 tháng, 100 khoản vay mỗi preview; phạm vi lịch 1900–2199. Tiền là decimal string, phép tính Decimal precision 48, không làm tròn sang VND hoặc 2 chữ số giữa các bước.

Lãi tính trên dư nợ giảm dần trước trả gốc trong kỳ. Với `r = percent / 100`:

| Loại lãi khai rõ | Lãi suất kỳ |
| --- | --- |
| EFFECTIVE_ANNUAL | `(1 + r)^(1/12) - 1` |
| NOMINAL_ANNUAL_MONTHLY | `r / 12` |
| EFFECTIVE_MONTHLY | `r` |
| SIMPLE_ANNUAL_DAILY | `r × days / yearDays`; cơ sở 360/365/366 khai rõ |

Không nhận nhãn APR không có quy ước. Các kỳ đầu/cuối không tròn tháng phải khai số ngày theo hợp đồng; chế độ lãi tháng nghĩa là một kỳ tháng đầy đủ đã xác nhận, không tự suy ngày từ hai dueDate. Lịch thay đổi lãi thể hiện ở từng kỳ. Phân biệt lãi danh nghĩa/hiệu dụng theo [Microsoft EFFECT](https://support.microsoft.com/en-us/excel/functions/effect-function); đây là quy tắc quy đổi, không thay thế điều khoản hợp đồng vay.

`repayment.kind`:

- PRINCIPAL_PLUS_INTEREST: `amount` là gốc trong kỳ, lãi tính thêm.
- TOTAL_PAYMENT: `amount` là gốc + lãi, chưa gồm phí.
- INTEREST_ONLY: trả lãi, gốc bằng 0 nếu không có mức tối thiểu cao hơn.

`minimumPayment` là mức gốc + lãi tối thiểu; phí `fee` cộng riêng. Gốc không vượt dư nợ. `settleRemainingAtMaturity: true` là xác nhận trả phần gốc còn lại vào kỳ cuối. Nếu false và còn nợ ở đáo hạn, trả thiếu dữ liệu/không hỗ trợ thay vì tự tạo kỳ sau. Lịch gây vốn hóa lãi âm chưa hỗ trợ. Khi trả hết, những kỳ sau có tiền trả bằng 0.

`payment` của T01 không được ghi đè kết quả hợp đồng KNOWN: summary và preview cùng lấy lịch hợp đồng. Dòng chi DEBT_PAYMENT chỉ tham chiếu `loanId` và được loại khỏi tổng chi không phải nợ. Nếu khai amount KNOWN, số tiền phải khớp lịch trong khoảng hiệu lực; hợp đồng có số tiền thay đổi nên dùng amount UNKNOWN cho dòng tham chiếu. Không cần lặp lịch nợ trong nhóm chi.

## Phân bổ và căng thẳng nợ chung

`outstandingBalance` là dư nợ toàn khoản vay. `balanceShare` phân bổ nợ để báo cáo tài sản ròng; `paymentShare` phân bổ dòng tiền gốc, lãi, phí. `responsibility`/tài liệu/limit mô tả phạm vi nghĩa vụ đã khai, không suy từ tỷ lệ đang trả hay tên người vay. Không truy cập hoặc nối tự động hồ sơ của người đồng vay.

Stress nhận `totalPaymentShare`, tức tỷ lệ **tổng phải trả trong kịch bản**, thay thế phần trả cơ sở trong các tháng chỉ định. Ví dụ cơ sở 5 triệu của khoản 10 triệu, kịch bản trả 100% là tổng 10 triệu, chênh thêm 5 triệu. Nếu có khoản riêng 5 triệu nữa, tổng là 15 triệu. Không cộng lại phần đã có trong cơ sở. Stress không chồng khoảng của cùng khoản vay, không giảm tỷ lệ và phải nằm trong horizon.

Tăng phần phải trả hiện chỉ tính khi trách nhiệm FULL đã được xác nhận. UNKNOWN, ALLOCATED_ONLY hoặc CAPPED trả `FULL_LIABILITY_CONFIRMATION_REQUIRED` cho stress, baseline vẫn dùng phần đang trả và có cảnh báo `LIABILITY_SCOPE_NOT_FULLY_MODELED`. Chưa mô hình hóa giới hạn nghĩa vụ còn lại, bảo lãnh có điều kiện hoặc nghĩa vụ truy đòi. Stress là giả định trả đủ nghĩa vụ theo tháng, chưa mô phỏng vỡ nợ/phạt chậm trả khi dòng tiền âm.

## Áp lực nợ và ngân sách

`ratioPercent = scheduledPrincipalInterest / disposableIncome × 100`. Dưới 30: LOW_PRESSURE; từ 30 đến 50: REVIEW_DEBT_REDUCTION; trên 50: HIGH_PRESSURE. Đây là ngưỡng sản phẩm theo task.md, không phải ngưỡng phê duyệt tín dụng. [CFPB định nghĩa DTI phổ biến trên thu nhập gộp](https://www.consumerfinance.gov/ask-cfpb/what-is-a-debt-to-income-ratio-en-1791/); API dùng thu khả dụng đã khai và trả tên định nghĩa rõ ràng, không đánh đồng hai chỉ số.

Thu bằng 0/âm nhưng còn trả nợ: NO_REPAYMENT_SOURCE và ratio null. Thu và nợ cùng 0: UNDEFINED_RATIO; thiếu dữ liệu: INSUFFICIENT_DATA. `pressure.remainingCash` trừ chi thường kỳ, gốc/lãi/phí bắt buộc. `availableForRetirement` trừ thêm phần dự phòng, trả trước và phí trả trước. Giữ số âm và tháng thiếu tiền đầu tiên, kể cả khi tỷ lệ trả nợ thấp.

Ngân sách trả thêm mỗi tháng là `min(extraMonthlyBudget, max(thu - chi không phải nợ - dự phòng - trả theo lịch, 0))`. Hai trường reserveMonthly/extraMonthlyBudget nhận số 0 xác nhận hoặc null chưa biết; null không thành 0. Không rút tài sản hưu trí, nhà ở, quỹ dự phòng hay mục tiêu khác để trả trước. Không tự chuyển dư tháng trước thành tiền dùng được tháng sau. Lịch thu một lần không lặp lại.

## So phương án

Tất cả phương án bắt đầu cùng ngày định giá và cùng dữ liệu hợp đồng, trả trước sau khoản trả bắt buộc trong tháng:

- CONTRACT: trả theo lịch.
- AVALANCHE: ưu tiên lãi cao theo lãi năm tương đương của kỳ hiện tại; ngày đơn quy đổi theo 365/ngày để xếp hạng, không thay cách tính lãi thực của hợp đồng.
- SNOWBALL: ưu tiên dư nợ phân bổ còn lại nhỏ nhất.
- SELECTED_PAYOFF: chỉ xuất hiện khi có payoffLoanId; tất toán khoản đã chọn trong tháng nếu ngân sách tháng đủ cả gốc còn lại và phí, không tích lũy một quỹ tất toán giả định.

Điều khoản trả trước từng kỳ là UNKNOWN, PROHIBITED hoặc ALLOWED. ALLOWED cần nguồn xác nhận, cho phép trả một phần/toàn bộ, mức tối thiểu/tối đa, phí cố định/phần trăm và hiệu ứng REDUCE_TERM_KEEP_SCHEDULE. Phí lẫn gốc cùng nằm trong ngân sách. Phương án có thể tốn hơn baseline; giữ số tiết kiệm âm. Không tuyên bố avalanche là tối ưu toàn cục khi có phí/phạt hoặc lãi biến đổi.

Nợ chung chỉ so trả trước khi paymentShare = balanceShare > 0 và có `PRO_RATA_CONFIRMED` nếu tỷ lệ dưới 100%: tất cả bên cùng đóng theo tỷ lệ xác nhận. Nếu không, trả thiếu điều khoản thay vì giả định một người được hưởng toàn bộ giảm dư nợ từ tiền của mình. Không xử lý tái cấp vốn, recast làm giảm kỳ trả, trả trước ngay ngày định giá hoặc giao dịch thật.

Response có chuỗi tháng, gốc/lãi/phí, ngày hết nợ theo lịch, kỳ thiếu tiền, tổng chi phí, vốn hưu trí riêng và chênh dòng tiền dành hưu trí so baseline. `closingLoanBalance`/ngày hết nợ tính toàn khoản vay; các khoản tiền trả/tổng chi phí là phần của người dùng. Hết horizon còn nợ → HORIZON_LIMIT, không tự gán ngày hết nợ. `comparisonScope` FULL_TERM khi cả hai đã hết nợ, SAME_HORIZON_ONLY khi chỉ so cùng khoảng đang xem; không dùng chênh chi phí một phần để khẳng định tiết kiệm trọn đời khoản vay.

## Gọi API và lỗi

```json
{
  "expectedProfileRevision": 1,
  "horizonMonths": 120,
  "reserveMonthly": "2000000",
  "extraMonthlyBudget": "1000000",
  "stress": []
}
```

Không nhận userId, hồ sơ thay thế, lợi suất hưu trí hoặc lạm phát trong body. 401 chưa đăng nhập, 403 sai vai trò, 404 thiếu hồ sơ, 409 revision cũ/v1/dữ liệu cần rà soát, 400 payload hoặc kịch bản sai, 422 quá số khoản vay. Response 200 INCOMPLETE có thể thiếu hợp đồng, FX, dư nợ/ngày chốt; baseline đủ vẫn trả được khi thiếu dữ liệu chỉ cần cho tối ưu hoặc stress. Không trả lỗi 500 cho lịch rỗng.

## Kiểm chứng và phần còn lại

`src/tests/debts.test.ts` kiểm tra số tính độc lập, tỷ lệ 29,99/30/50/50,01%, nợ 5/10/15 triệu, phí làm đổi lợi ích, dữ liệu thiếu, ownership/revision, API và OpenAPI. `node scripts/verify-debts-db.cjs` dùng DB đang cấu hình, HTTP qua AuthService thật, toàn bộ tài khoản/phiên/hồ sơ trong transaction rollback; đối chiếu fingerprint hồ sơ/snapshot trước và sau, không gửi mail. Không chạy integration suite có cleanup toàn bảng trên DB thật.

Đã kiểm chứng checkpoint 04/10/2026: 12 kiểm tra HTTP/PostgreSQL đạt, rollback đạt, 50 hồ sơ và các snapshot cũ không đổi. T02 backend cung cấp dòng tiền để nối T06; chưa thay engine hưu trí cũ, chưa nối giao diện hoặc mô phỏng số dư quỹ hưu trí. F04/F05 toàn sản phẩm vẫn mở đến khi T06 và frontend được kiểm chứng. Chuỗi tháng không bảo đảm thanh khoản từng ngày trong tháng.
