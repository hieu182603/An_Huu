# BHXH tự nguyện: đóng trước, đóng bù và hoàn trả

Cập nhật07/10/2026. Nhánh **đóng bù phần thiếu** đã nối API estimates với engine riêng `vn-pension-voluntary-top-up-v1`. Nhánh đóng trước/nghỉ hưu trong kỳ trả trước dùng `vn-pension-voluntary-prepaid-v1`, gồm ước tính hoàn phần còn lại; không thực hiện chi hoàn tiền. Chưa công bố corpus vận hành hoặc nghiệm thu UI/pháp lý; T14-04 còn mở.

## Căn cứ đã đối chiếu

- [NĐ159/2025](https://vbpl.vn/bonoivu/Pages/vbpq-toanvan.aspx?ItemID=179149&Keyword=), bản ký R04.pdf đã lưu/hash: công thức Điều6 ở trang4–5, Điều7 trang5, Điều8 trang6. Đã xem trực tiếp các trang công thức.
- [TT11/2025 Điều5](https://vbpl.vn/bonoivu/Pages/vbpq-toanvan.aspx?ItemID=179767): thời điểm hưởng phải phân biệt đóng định kỳ, đang trong kỳ đóng trước, đóng phần thiếu, chuyển tiếp. R06.pdf đã lưu/hash.
- [CV151/BHXH-ĐTQ ngày14/01/2026](https://baohiemxahoi.gov.vn/vanban/Pages/default.aspx?ItemID=4980): đã tải và xem trang bản ký từ file đính kèm chính thức. Lãi suất bình quân tháng2025 là0,31%/tháng, dùng cho **năm đóng2026**. `sources/FUND2026.pdf`, SHA256 `9239d7ca5e0c867c8b2c3a4a1966ddb6caa8b74866a9dc0c116e4a2a259191e9`. Không dùng lợi suất danh mục hoặc hệ số điều chỉnh thu nhập thay lãi suất này.
- [NĐ351/2025](https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=186277) Điều2(1), PDF trang1 duy trì chuẩn nghèo2022–2025 trong2026; NĐ07/2021 Điều3(1)(a), PDF trang2 quy định nông thôn1.500.000. Đã lưu hai bản ký/hash trong manifest và thêm bảng `VOLUNTARY_MIN_INCOME`. Luật BHXH Điều36 nối mức tối thiểu này và trần20lần mức tham chiếu tại ngày đóng. Khoảng áp dụng chính sách2026 không phải ngày ban hành: NĐ351 ban hành30/12/2025, hiệu lực15/02/2026, Điều2 quy định áp dụng chuẩn cũ từ01/01 đến31/12/2026.

`fund-monthly-rate-2026.fragment.json` là mảnh dữ liệu để ghép vào bộ luật mới, **không** phải body đủ điều kiện tạo/công bố rule. Giá trị0.31 là phần trăm/tháng, phép tính chia100 thành0.0031. Năm công bố và năm áp dụng được giữ riêng bằng citation/năm đóng; không tự dùng bảng2026 cho2025/2027.

## Phần đã code

`voluntary-payment-math.ts` tính bằng Decimal, không kết nối DB hoặc ghi quỹ:

1. Đóng trước2/3/4/5năm: tổng22%thu nhập chia `(1+r)^(i−1)`, i từ1 đến số tháng; tháng đầu không bị chiết khấu.
2. Đóng bù1–60tháng: tổng22%thu nhập nhân `(1+r)^i`, bắt đầu i=1. Kiểm đã có120–179tháng, tổng sau đóng đúng180, đã đủ tuổi bình thường và ngày đóng không trước01/07/2025. Đây là kiểm đầu vào số học; caller phải xác định số tháng hợp lệ/tuổi từ hồ sơ.
3. Hoàn trả phần còn lại của khoản đóng trước nhiều năm: dùng các chỉ số tháng ban đầu, không tính lại chiết khấu từ0; trừ tiền hỗ trợ Nhà nước được xác định phải loại trừ, không đoán tỷ lệ hỗ trợ. Từ chối số tháng/tiền hỗ trợ vượt phần còn lại.

Trả chuỗi số tiền đầy đủ độ chính xác đang dùng trong engine, chưa đặt chính sách làm tròn tiền thu thực tế. Các expected tiền2chữ số trong tests được tính độc lập bằng Python Decimal80, chỉ để đối chiếu kết quả. Không suy mức hỗ trợ theo hộ/địa phương hoặc coi grossContribution là số cá nhân chắc chắn phải trả.

11tests đạt:4kỳ đóng trước,3số tháng đóng bù,hoàn trả/giới hạn, lãi0, tuổi/số tháng/ngày lịch sử sai, hash/đơn vị bảng công bố. Cùng18corpus tests =29tests đạt trước guard lịch sử cuối;11paymenttests đạt lại sau guard. Nhánh đóng bù có thêm kiểm assessment, strategy/corpus và service/API ở checkpoint hiện hành trong PROGRESS.md; các kiểm số học trước không thay bằng chứng đó.

## Contract đóng bù đã nối

Dùng các endpoint hiện có: `POST /api/v1/me/pension/estimates/preview`, `POST /api/v1/me/pension/estimates`, GET danh sách/chi tiết và chọn estimate vào nguồn pension. Chọn bộ luật có branch `BH2_VOLUNTARY_MISSING_YEARS_TOP_UP`; bộ nháp nguồn thật `bh2-voluntary-top-up.draft.json` có1.148dòng,17ca bắt buộc. Không tự công bố hoặc tạo luật từ giao diện người dùng.

Input giữ historyVersionId/revision, legalRuleSetVersionId, intendedBenefitDate, contributionStopMonth (tháng định kỳ cuối), employmentEndDate nếu có bắt buộc, benefitRequestDate và futureContributions; thêm:

```json
{
  "voluntaryTopUp": {
    "kind": "MISSING_YEARS_TOP_UP",
    "ageRule": "NORMAL",
    "historyTreatment": "REGULAR_ONLY",
    "paymentOn": "2026-06-28",
    "missingMonths": 60,
    "monthlyIncome": "4000000",
    "confirmation": "DOCUMENTED_FULLY_PAID",
    "evidence": [{"reference": "Chứng từ thanh toán", "contentHash": "<sha256-64-hex>", "confirmedOn": "2026-07-01"}]
  }
}
```

Không gửi cùng voluntaryCase/caseDetails. Lịch có lương Nhà nước cần stateSalaryCase và chứng từ/hệ số theo contract hiện có. historyTreatment xác nhận lịch định kỳ không chứa khoản đóng trước/đóng bù khác được diễn đạt sai thành tháng thông thường. Không ghi thêm tháng PAID giả; input thanh toán được pin riêng trong estimate capture, không sửa sổ/hồ sơ hoặc ghi tiền quỹ.

- Phải có120–179tháng hợp lệ, đóng thiếu1–60 để tổng đúng180. CREDITED/UNKNOWN/đặc thù không được lờ đi. Đã đủ tuổi bình thường tại ngày thanh toán; nếu chỉ rõ tháng sinh và trả ngay tháng đủ tuổi, cần bổ sung ngày sinh. Ngày31 được chặn về ngày cuối tháng tuổi khi tháng đó ngắn hơn.
- `DOCUMENTED_FULLY_PAID` không chấp nhận ngày tương lai, tháng đóng dự kiến hoặc chứng từ xác nhận trước ngày thanh toán. `HYPOTHETICAL` là dự kiến, luôn trả PROJECTED_SCENARIO, kể cả ngày dự kiến đã qua; không ghi nhận đã thanh toán.
- Năm đóng và năm hưởng2026; thiếu bảng/năm khác không ngoại suy. Thu nhập từ1.500.000 đến20×reference tại **paymentOn** (46.800.000 trước01/07,50.600.000 từ01/07). Phần bình quân Nhà nước và hệ số lịch sử dùng **intendedBenefitDate**. Tháng hưởng phải là tháng liền sau paymentOn.
- Bình quân cộng phần thu nhập đóng bù×số tháng×hệ số1 vào tổng thu nhập đã điều chỉnh, chia180; phần bắt buộc tính bình quân riêng. Nam40%, nữ45%; không sàn240tháng bắt buộc, không trợ cấp vượt năm. Lịch định kỳ không bắt buộc đã có tự nguyện: khoản đóng bù là phần tự nguyện mới của lịch bảo lưu bắt buộc thông thường.
- Breakdown thêm REGULAR_COUNTED_MONTHS, TOP_UP_MONTHS, TOP_UP_ADJUSTMENT_FACTOR, TOP_UP_GROSS_CONTRIBUTION, TOP_UP_PAYMENT_STATUS, TOP_UP_QUOTE_BASIS. `VOLUNTARY_MONTHS` là tháng tự nguyện định kỳ, số đóng bù nằm riêng; countedMonths tổng180. Gross chưa trừ hỗ trợ, chưa áp làm tròn thu thực tế; không hiển thị là số cá nhân phải thanh toán cuối cùng.
- Metadata mới gửi với engine cũ trả422 PENSION_CASE_ENGINE_MISMATCH; không bỏ qua. Trường optional không tạo mặc định trong input cũ. Hash/CAS/ownership/idempotency/snapshot read và chọn nguồn dùng cơ chế hiện có; thay lịch/luật chặn thao tác mới, bản đã lưu tiếp tục replay bản pin.

## Contract đóng trước và đề nghị nghỉ hưu trong kỳ

Dùng cùng API estimates/save/read/source selection; branch `BH2_VOLUNTARY_PREPAID_REQUEST`, engine `vn-pension-voluntary-prepaid-v1`, draft `bh2-voluntary-prepaid.draft.json`. Năm trả/năm hưởng2026, lịch tự nguyện và bắt buộc doanh nghiệp/Nhà nước thông thường; không tự nạp/công bố corpus. `contributionStopMonth` là tháng ngay trước intendedBenefitDate, nằm trong kỳ trả trước; `benefitRequestDate` bắt buộc.

```json
{
  "voluntaryPrepaid": {
    "kind": "PREPAID_REQUEST",
    "ageRule": "NORMAL",
    "historyTreatment": "NO_OTHER_ACTIVE_PREPAYMENT_OR_TOP_UP",
    "periodStartMonth": "2026-01",
    "periodMonths": 24,
    "registeredOn": "2026-01-10",
    "paymentOn": "2026-01-10",
    "monthlyIncome": "4000000",
    "confirmation": "DOCUMENTED_FULLY_PAID",
    "evidence": [{"reference": "Đăng ký và biên nhận", "contentHash": "<sha256-64-hex>", "confirmedOn": "2026-01-10"}],
    "benefitRequest": {
      "confirmation": "DOCUMENTED",
      "evidence": [{"reference": "Đề nghị hưởng", "contentHash": "<sha256-64-hex>", "confirmedOn": "2026-06-15"}]
    },
    "refundSupport": null
  }
}
```

- periodMonths nhận3/6/12/24/36/48/60. Kỳ3/6/12 không chiết khấu; kỳ24–60 giữ số mũ từng tháng trong công thức NĐ159Điều6/8. Không dùng lãi danh mục. Income bounds/reference/rate theo ngày thanh toán, factor/nhóm lương theo năm hưởng.
- registeredOn thuộc tháng bắt đầu; kỳ nhiều năm trả đúng ngày đăng ký. Kỳ3tháng trả trong3tháng, kỳ6tháng trong4tháng đầu, kỳ12tháng trong7tháng đầu, theo Luật36(3). Biên nhận phải xác nhận không trước paymentOn; yêu cầu DOCUMENTED phải có ngày/chứng từ không ở tương lai và không trước ngày yêu cầu. HYPOTHETICAL ở payment hoặc benefitRequest luôn là PROJECTED_SCENARIO.
- Không gửi voluntaryCase/caseDetails/voluntaryTopUp cùng payload này. stateSalaryCase cần nếu có lương Nhà nước. Các tháng bắt buộc không được chồng kỳ tự nguyện; employmentEndDate ở trước tháng bắt đầu kỳ.
- Bộ tính chỉ lấy tháng thuộc kỳ đến cutoff để tính180tháng/tuổi/tỷ lệ; phần kỳ còn lại không mua quyền hưởng ngay. Tháng hưởng lấy tháng sau khi đủ điều kiện và có yêu cầu, đang trong kỳ trả trước. Chỉ6tháng đã đến mốc tính hưởng thì không đếm cả24tháng dù đã thanh toán.
- Các tháng đã có PAID trong lịch và khớp scheme/base chỉ tính1lần; UNKNOWN hoặc tháng chưa có được suy từ chứng từ kỳ chỉ trong phần đến cutoff. Không sửa lịch đã lưu. PAID khácbase, WITHDRAWN/CREDITED/NOT_CONTRIBUTED chồng kỳ bị PREPAID_HISTORY_CONFLICT. Không nhận futureContributions chồng kỳ. Đóng kỳ trước hoàn tất có thể có lịch PAID đã qua; không được giấu khoản đóng bù/hoàn/trả trước khác chưa đối soát trong lịch này.
- `refundSupport:null` nghĩa **chưa xác định**, không mặc định không có hỗ trợ. Khi có số được đối soát, gửi `{stateSupportToExclude:"...",evidence:[...]}`. Không suy tỷ lệ hộ/địa phương hoặc giả xác nhận. Chứng từ không trước paymentOn, M không vượt grossRemaining. Nếu chưa rõM, vẫn có thể tính lương hưu độc lập; refundamountnull/STATUS=SUPPORT_RECONCILIATION_REQUIRED.
- Breakdown: PREPAID_PERIOD_MONTHS, PREPAID_USED_MONTHS, PREPAID_REMAINING_MONTHS, PREPAID_GROSS_CONTRIBUTION, PREPAID_REFUND_GROSS, PREPAID_REFUND_SUPPORT_EXCLUDED, PREPAID_REFUND_ESTIMATE, PREPAID_REFUND_STATUS, PREPAID_PAYMENT_STATUS. Status ESTIMATE_NOT_RECEIVED là ước tính sau loạiM, không là tiền đã nhận; NO_REMAINING_PERIOD khi hết kỳ. Giá trị tiền chưa áp quyết định làm tròn thu/chi thực tế. Khoản hoàn tách khỏi monthlyPension/lumpSum/capitalInjection và không đổi anchor thực tế.
- Ví dụ kiểm độc lập: 4triệu/tháng, đóng24tháng lãi0,31%tháng, dùng6tháng, M100.000: gross20.386.137,18; hoàn ước tính15.046.763,01. Đây là ca số học; từng hồ sơ cần chứng từ và bộ luật đúng năm. Test/DB ởPROGRESS, không coi chúng là duyệt pháp lý hoặc UI.

## Việc còn lại trong T14

Chuyển tiếp2025, CREDITED, nhóm đặc thù, tiền đóng/năm hưởng khác và lịch nhiều khoản thanh toán cần tiếp tục. Luật36(3)(e) cho thời hạn đóng phần thiếu sớm nhất tháng trước tháng đủ tuổi; cần đối chiếu với điều kiện NĐ159Điều7/TT11Điều5(6) để bổ sung nhánh trả sớm và ngày hưởng theo version mới. Nhánh top-up-v1 hiện chỉ hỗ trợ trả sau đủ tuổi; không coi giới hạn đó là quy định cấm pháp lý. Hoàn trả do chuyển sang bắt buộc/nhận BHXH một lần/tử tuất không nằm trong assessment nghỉ hưu trong kỳ này. Rà độc lập và công bố corpus vẫn mở; không đóng checkbox bằng REVIEW_REQUIRED. Hoàn trả/trợ cấp chỉ vào quỹ qua nguồn vốn/nghiệp vụ góp xác nhận riêng.
