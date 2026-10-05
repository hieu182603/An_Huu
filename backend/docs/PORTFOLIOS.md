# T04 — Chính sách rủi ro, danh mục và kịch bản

Backend cung cấp bộ câu hỏi/chấm điểm, điều kiện danh mục, lịch phân bổ/tái cân bằng và ba kịch bản do ADMIN cấu hình, duyệt và công bố. Không có ngưỡng điểm, tỷ trọng hay tham số thị trường production được tự tạo. Dữ liệu kiểm thử chỉ nằm trong fixture/transaction rollback. USER chỉ trả lời câu hỏi và thử các lựa chọn được chính sách cho phép.

## API và lưu trữ

Route dưới `/api/v1`, yêu cầu phiên còn hiệu lực và đúng USER/ADMIN:

| Phương thức | Route | Nội dung |
| --- | --- | --- |
| GET/POST | `/admin/portfolio-policies` | Liệt kê page/limit hoặc tạo nháp |
| GET/PATCH | `/admin/portfolio-policies/:id` | Đọc hoặc thay nháp bằng `{expectedRevision, data}` |
| POST | `/admin/portfolio-policies/:id/validate` | Body `{}`, kiểm tra toàn bộ cấu hình và liên kết T03 |
| POST | `/admin/portfolio-policies/:id/approve` | `{expectedRevision, confirm: true, reviewNote}` |
| POST | `/admin/portfolio-policies/:id/publish` | `{expectedRevision, confirm: true}` |
| GET | `/me/portfolio-policies` | Liệt kê bản công bố đã có hiệu lực |
| GET | `/me/portfolio-policies/:id` | Đọc bộ câu hỏi, quy tắc, danh mục và tham số đã duyệt |
| POST | `/me/portfolio-policies/preview` | Đánh giá câu trả lời và chạy ba kịch bản chỉ đọc |

OpenAPI tại [portfolios.openapi.yaml](portfolios.openapi.yaml), gắn [openapi.yaml](openapi.yaml). Script `node scripts/generate-portfolios-openapi.cjs` tái tạo contract T04 từ thư mục backend. Generator dùng lại hàm chuyển schema cấu trúc của T03; các kiểm tra chéo thực thi ở server.

T04 dùng bảng cấu hình version `assumption_set_versions` hiện có, phân biệt bằng `modelCode: portfolio-policy-v1`. `values` chứa tài liệu schemaVersion 1; `policy` chứa approval; `source` chứa căn cứ quản trị. Không thêm migration hoặc diễn giải lại các bộ T03/v1. Số version unique toàn bảng; từng API lọc đúng modelCode. Liên kết assumptionVersionId trỏ đúng bộ T03 PUBLISHED đã có hiệu lực, không tự chọn bộ mới nhất.

Bản nháp sửa được với revision đúng. Phê duyệt ghi actor từ phiên ADMIN, thời gian server, reviewNote, hash tài liệu và hash bộ T03. Phải đủ cấu hình mới duyệt được. Công bố chỉ nhận bản APPROVED/revision đúng; số version phải mới hơn bản công bố trước trong cùng loại chính sách. Bản duyệt/công bố không sửa qua API, điều chỉnh bằng nháp mới. Ngày hiệu lực là 00:00 UTC ngày effectiveFrom; bản hẹn tương lai chưa cho USER dùng. Hash kiểm tra khi đọc và preview; bộ T03 sai hash hoặc chưa công bố không được dùng.

Phê duyệt hiện dựa trên vai trò ADMIN của người phụ trách An Hưu, không bổ sung vai trò thứ ba. Không tự xác nhận thẩm quyền pháp lý hoặc áp cơ chế hai người duyệt khi nghiệp vụ chưa yêu cầu. Công bố và preview không thay currentVersionId/stale, không tạo snapshot, outbox job, email hoặc lệnh giao dịch.

## Bộ câu hỏi và đánh giá

Mỗi câu hỏi có ID, nội dung, chiều đánh giá và các lựa chọn có điểm do chính sách quy định. Cần đủ sáu chiều: OBJECTIVE, HORIZON, LIQUIDITY, LOSS_TOLERANCE, EXPERIENCE, FINANCIAL_CAPACITY. Điểm mỗi lựa chọn là số nguyên 0–100; tổng mỗi chiều bằng tổng điểm các câu thuộc chiều đó; tổng chung bằng tổng sáu chiều. Risk bands là khoảng điểm nguyên liên tục, không trùng, từ 0 đến tổng điểm tối đa của các câu hỏi. Đây là miền kỹ thuật, không phải bộ ngưỡng rủi ro mặc định.

Request USER chỉ nhận ID câu hỏi/lựa chọn, policyVersionId, tháng bắt đầu, horizonMonths và liquidityNeedMonths; có thể chọn templateId khi có nhiều danh mục phù hợp. `liquidityNeedMonths` là số tháng đến nhu cầu dùng tiền, phải được UI giải thích đúng khi tích hợp. Dải tháng của policy là điều kiện riêng ngoài điểm câu hỏi, không suy thanh khoản từ tuổi.

```json
{
  "policyVersionId": "UUID-CUA-CHINH-SACH-DA-CONG-BO",
  "startMonth": "2026-10",
  "horizonMonths": 120,
  "liquidityNeedMonths": 24,
  "answers": [
    { "questionId": "ID_CAU_HOI", "choiceId": "ID_LUA_CHON" }
  ]
}
```

Cần trả lời đầy đủ tất cả câu hỏi trong đúng phiên bản, không trùng ID. Thiếu/sai câu trả lời trả INCOMPLETE, totalScore/dimensionScores/riskBandId là null, không biến thiếu thành 0 hoặc “ít rủi ro”. Không trả phân bổ/kịch bản từ câu trả lời thiếu. Server từ chối score, rate, weights, userId hoặc trường thừa do client gửi.

Các câu trả lời là tự khai, response ghi `USER_DECLARED_NOT_INDEPENDENTLY_VERIFIED`. T04 chưa xác minh độc lập khả năng tài chính từ hồ sơ, không tuyên bố đủ khả năng đầu tư dựa trên câu trả lời. Chưa lưu câu trả lời vào hồ sơ hoặc bản chính; T07/T08 cần ghi snapshot câu trả lời và phiên bản khi người dùng áp dụng kế hoạch.

## Chọn danh mục và giải thích

Mỗi quy tắc khai templateId, risk bands phù hợp, khoảng thời hạn, khoảng nhu cầu thanh khoản, khoảng điểm cho từng chiều và lời giải thích. Một quy tắc khớp khi tất cả điều kiện đều đúng. Response có điểm theo chiều, nhãn câu trả lời, ruleId, điều kiện không khớp và danh mục đủ điều kiện.

Không có quy tắc khớp → POLICY_NOT_COVERED, không tự gán tỷ trọng. Một danh mục khớp → chọn danh mục đó. Nhiều danh mục khớp → PORTFOLIO_CHOICE_REQUIRED; USER có thể thử từng templateId trong danh sách đủ điều kiện. Chọn template ngoài danh sách trả TEMPLATE_NOT_ELIGIBLE, không làm theo thứ tự quy tắc một cách ngầm định. Hai người cùng tuổi có thể có kết quả khác do mức chịu lỗ, thanh khoản hoặc khả năng tài chính; API không dùng tuổi như quy tắc duy nhất.

[Investor.gov về phân bổ tài sản](https://www.investor.gov/introduction-investing/getting-started/asset-allocation) nêu thời hạn và khả năng chấp nhận rủi ro là yếu tố của phân bổ. Tài liệu này là căn cứ thiết kế chiều đánh giá, không cung cấp điểm/ngưỡng/tỷ trọng production cho An Hưu.

## Lịch phân bổ và tái cân bằng

Mỗi template có coverageMonths và schedule theo chỉ số tháng tính từ đầu preview: tháng đầu = 1. Các khoảng liên tục, không trùng, phủ đúng coverageMonths. Mỗi kỳ phân bổ đủ 100%, không âm, không trùng nhóm tài sản; nhóm phải có trong T03. Không thêm đòn bẩy, bán khống hoặc tỷ trọng vượt vốn. Khoảng thời hạn của quy tắc phải được template và dải lợi suất T03 bao phủ.

Rebalance nhận chu kỳ 1/3/6/12 tháng, thời điểm đầu tháng. Tỷ trọng ban đầu theo lịch tháng 1. Giữa các lần tái cân bằng, giá trị từng nhóm tăng/giảm theo hệ số T03 và tỷ trọng trôi theo thực tế mô phỏng. Tái cân bằng theo chu kỳ tính từ tháng đầu hoặc ngay khi bước sang đoạn phân bổ mới; không giữ tỷ trọng cố định giả tạo ở các tháng không tái cân bằng.

`turnoverCostPercent` là giả định phí/thuế **tăng thêm** cho tái cân bằng, có evidence. Quy ước bắt buộc HALF_L1_TURNOVER_TIMES_COST:

- Tỷ lệ luân chuyển `turnover = sum(abs(targetWeight - driftedWeight)) / 2`.
- Phần chi phí theo giá trị danh mục `costFraction = turnover × turnoverCostPercent / 100`.
- Khấu trừ theo tỷ lệ khỏi danh mục trước tăng trưởng tháng; chi phí không làm lệch tỷ trọng mục tiêu.

Đây là mô hình chi phí được khai rõ để phê duyệt, không phải biểu phí/thuế giao dịch thực tế. Nếu chi phí đã nằm trong T03 thì cần khai 0 có căn cứ ở lớp tái cân bằng, không thu hai lần. Lần phân bổ ban đầu chưa mô hình hóa chi phí mua; response ghi INITIAL_ALLOCATION_COST_NOT_MODELED. [Investor.gov về tái cân bằng](https://www.investor.gov/additional-resources/general-resources/publications-research/info-sheets/beginners-guide-asset) lưu ý phí và thuế có thể phát sinh khi tái cân bằng.

Horizon dùng để chọn dải lợi suất T03 là thời hạn người dùng yêu cầu, cố định trong lần preview. Chưa tự chuyển dải lợi suất khi thời hạn còn lại rút ngắn; lịch phân bổ vẫn có thể đổi theo chỉ số tháng đã duyệt. T06 cần giữ rõ quy ước khi nối dòng tiền cá nhân.

## Ba kịch bản

Policy cần đúng BASE/ADVERSE/FAVORABLE, đầy đủ các năm và nhóm tài sản của T03. Mỗi kịch bản có nguồn/căn cứ và điều chỉnh theo năm được duyệt. BASE có delta bằng 0; ADVERSE không giảm lạm phát và không tăng lợi suất; FAVORABLE theo chiều ngược lại. Không tạo độ lệch chuẩn, xác suất hoặc biên +/- từ dữ liệu không tồn tại.

Quy ước `DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES`: lấy lợi suất hiệu dụng năm đã quy đổi danh nghĩa và trừ phí/thuế ở T03, sau đó cộng số điểm phần trăm kịch bản; lạm phát cộng delta riêng. Không áp CPI lần nữa vào lợi suất đã danh nghĩa. Tỷ lệ sau điều chỉnh <= -100% bị chặn trước phê duyệt; thiếu năm/nhóm trả INCOMPLETE. Hệ số tháng `(1 + rate/100)^(1/12)`, Decimal precision 48.

Preview bắt đầu từ danh mục chuẩn giá trị 1, không phải 1 VND tiền thực của người dùng. Với tỷ trọng đầu tháng w và hệ số tăng trưởng từng nhóm g, hệ số danh mục trước chi phí là `sum(w × g)`, sau chi phí là `(1 - costFraction) × sum(w × g)`. Cuối tháng chuẩn hóa giá trị các nhóm để có tỷ trọng trôi cho tháng sau. Response trả thay đổi đã áp, tỷ trọng đầu kỳ, tái cân bằng/luân chuyển/chi phí, hệ số tháng, chỉ số giá trị danh mục và hệ số lạm phát riêng. Không làm tròn sang 2 chữ số giữa các bước.

Không có đóng góp/rút tiền/thu–chi/tài sản riêng trong preview này; đây chưa phải kết quả quỹ hưu trí T06. Thử tuổi, mức sống, tích lũy, tài sản hoặc áp danh mục vào kế hoạch chính thuộc T06–T08. Ba kịch bản là tham số mô hình đã duyệt, không phải dự báo xác suất hoặc cam kết lợi nhuận. Hiệu ứng phí/tái cân bằng có thể làm kết quả không đơn giản bằng xếp hạng lợi suất từng nhóm.

## Kiểm chứng và phần còn lại

`src/tests/portfolios.test.ts` kiểm tra đa chiều, khả năng tài chính, thanh khoản, câu trả lời thiếu, tổng tỷ trọng, lịch, drift/tái cân bằng/phí, năm hiệu lực, ba kịch bản, revision/approval/hash, bất biến/replay, quyền ADMIN/USER và OpenAPI READY/INCOMPLETE. `node scripts/verify-portfolios-db.cjs` kiểm tra cột thật rồi gọi HTTP với AuthService/PostgreSQL thật: 15 bước đạt; toàn bộ tài khoản/phiên/bộ T03/chính sách công bố thử rollback, 50 hồ sơ và kế hoạch/snapshot cũ giữ nguyên. Không có job/mail hay giao dịch. Kiểm chứng này chưa chứng minh cạnh tranh nhiều transaction độc lập.

Backend T04 có contract/lifecycle/preview; chưa có chính sách, câu hỏi chấm điểm hay tỷ trọng production được người phụ trách duyệt, UI chưa nối và chưa lưu lựa chọn thành snapshot/current plan. Trạng thái không có cấu hình là UNCONFIGURED; không seed fixture vào DB thật. Chuyển sang T05 trước khi hoàn thiện engine T06 và apply T07–T08.
