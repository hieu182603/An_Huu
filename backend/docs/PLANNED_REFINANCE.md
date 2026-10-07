# T15 — Refinance giả định tương lai

Trạng thái07/10/2026: **bộ tính nội bộ đã có; chưa là API công khai, chưa lưu/apply được phương án này**. Không gửi input dưới đây vào source-reforecasts hiện tại. Các nhánh refinance thực tế vẫn dùng [LOAN_REVISIONS_V2.md](LOAN_REVISIONS_V2.md).

## Quy tắc đã triển khai

`planned-refinance-v1` nhận hợp đồng v2 khoản cũ đã chốt tại ngày cuối cutoff, khoản vay mới `PLANNED_DISBURSEMENT`, ngày tất toán tương lai, báo giá giả định và phân bổ tiền bù. Không tạo actual hoặc thay số dư quỹ; chỉ trả hai lịch nghĩa vụ tương lai để service ghép vào registry sau khi kiểm ownership/CAS.

- Khoản cũ: tính lịch gốc từ hợp đồng đã pin; giữ những khoản có ngày trả trước tất toán. Cùng ngày dùng lựa chọn rõ `BEFORE_SCHEDULED_PAYMENT` hoặc `AFTER_SCHEDULED_PAYMENT`, không đoán thứ tự. Dư gốc dự kiến là dư sau những khoản được giữ; báo giá phải khớp số đó. Đã hết gốc không được giả làm khoản refinance còn nợ.
- Báo giá `payoffQuote` khai principal, interest, carriedInterest, prepaymentFee, otherFee, evidence và `allRemainingChargesIncluded:true`. Tất cả mang `HYPOTHETICAL_QUOTE`: lãi/phí là đầu vào giả định có căn cứ, không tự áp công thức pháp luật/ngân hàng cho mọi hợp đồng. Khi tất toán ngay sau kỳ trả cùng ngày thì không có ngày phát sinh lãi thông thường mới; lãi tồn/phí vẫn khai riêng.
- Vay mới giữ `HYPOTHETICAL/PROJECTED_DISBURSEMENT`, số dư mở là gross giải ngân, ngày giải ngân bằng ngày tất toán. Net=gross−phí giữ lại. Không được mang actual allocations hoặc số đã trả khác0 vào nguồn mới dự kiến. Hai khoản cùng balanceScope/funding.scope; USER_SHARE có share1.
- Phương trình toàn phạm vi: net giải ngân + externalTopUp = tổng tất toán + unusedProceeds. Phần người dùng: userTopUp + userFinancedAmount = phần nghĩa vụ tất toán của người dùng. userTopUp không vượt externalTopUp; userFinancedAmount không vượt net. Không suy phần đồng vay từ phần người dùng.
- Phần nghĩa vụ người dùng bằng tổng tất toán×paymentShare, theo quy tắc làm tròn hợp đồng. Với CAPPED, giới hạn bằng limit−previouslyPaid−tổng khoản người dùng dự kiến trả trước tất toán. Hợp đồng vay mới có nghĩa vụ riêng được khai rõ; không tự áp lại trần của khoản cũ.
- Lịch nguồn cũ sau thay thế chỉ còn các khoản trả được giữ và **userTopUp** ở tháng tất toán; phần được vay mới tài trợ không trừ tiền hộ gia đình lần nữa. Lịch nguồn mới bắt đầu sau ngày giải ngân theo hợp đồng. unusedProceeds không được góp vào quỹ, không tạo income/capitalInjection. Tiền bù là khoản chi dự báo trong ngân sách, không là WITHDRAWAL thực tế.
- Ngày tất toán phải sau knownOn/cutoff, trong thời hạn khoản cũ và trong horizon. Giả định đã đến hạn cần luồng đối soát, không tiếp tục coi nó là sự kiện tương lai. Hợp đồng v1 cần đối soát/chuyển basis thành v2 trước, không sửa engine v1.

Mẫu độc lập: dư900 tại31/10, ba kỳ gốc300 vào30/11,31/12,31/01. Tất toán15/12 giữ kỳ300 tháng11, dư gốc600. Báo giá600gốc+10lãi+20phí=630. Vay mới600, phí giữ10 → net590, bù40. Lịch cũ tháng11=300/tháng12=40; vay mới hai kỳ300. Không ghi chi630 và thu590 vào quỹ lần nữa. Với share50%, phần tất toán315 có thể phân bổ bù20/vay tài trợ295. Nếu trần400, đã thực trả100, đã dự kiến trả150 tháng11 thì nghĩa vụ tất toán còn150 (bù20/vay tài trợ130).

## Các bước tích hợp bắt buộc còn lại

1. Source command/proof riêng có expectedSourceHash/revision/contractHash và cặp nguồn cũ/mới; service lấy hợp đồng cũ từ snapshot của chủ tài khoản. Từ chối trùng nguồn/refinance nhiều lần và aggregate debt override. Không nhận previous contract tự khai từ HTTP.
2. Builder registry giữ lịch cũ tới ngày dự kiến rồi thay bằng userTopUp, tạo nguồn vay mới trong cùng transaction. Pin engine/input/quote/order/proof và kiểm khi đọc/replay. Không đánh dấu END ngay tại cutoff vì còn khoản trả trước ngày dự kiến.
3. Sửa/hủy trước ngày dự kiến phải thay đồng thời cả hai nguồn. Hủy phải khôi phục lịch hợp đồng đã pin, không lấy profile mutable; giữ mọi phiên bản đã lưu. CAPPED carry trong thời gian thực tế vẫn cần số thực trả, không biến khoản dự kiến thành đã trả.
4. Khi cutoff tiến qua ngày dự kiến, buộc đối soát đã xảy ra/chưa xảy ra/đổi ngày. Đã xảy ra phải dùng actual payoff/new-loan balance và kiểm khoản tiền góp/rút chỉ một lần; không dựng actual giả. Nếu chưa xảy ra, cả lịch vay mới và lịch khoản cũ phải cập nhật đồng bộ. Đây là điều kiện trước khi mở API.
5. Nối schema/OpenAPI, preview/save/apply/read/replay/report/compare/CSV/AI; giữ actual/profile staleness, owner/admin/CAS/idempotency. Source options phải biết khoản nằm trong cặp refinance dự kiến, không cho sửa một nửa bằng loanRevisions thông thường.
6. Kiểm service/HTTP/DB rollback và race, fixture v2/v3/v4 cũ, mất/tamper proof, chênh hạn mức/thứ tự cùng ngày, số liệu độc lập; bàn giao browser trước khi đánh dấu nghiệm thu. Bộ tính thuần không thay bằng chứng này.

Các trường hợp cần contract tiếp: giải ngân dự kiến khác ngày tất toán, vốn cầu nối/giải ngân hoàn lại, thay điều kiện hợp đồng trong khoảng trước cutoff. Vẫn thuộc phần mở rộng còn mở, không mặc nhiên coi đã hỗ trợ qua engine này.
