# Nghiên cứu và kế hoạch mở rộng BHXH, khoản vay, nguồn dự báo

Ngày rà soát: **05/10/2026**. Yêu cầu ban đầu: nghiên cứu rồi lên kế hoạch cho ba phần trước đây để sau MVP. **Đã bắt đầu T13-01/T13-02 theo yêu cầu tiếp tục:** xem [ma trận luật](../backend/docs/LEGAL_RULE_MATRIX.md) và [ADR-001](../backend/docs/ADR-001-EXPANSION.md). R04/R06/R11 đã đọc trực tiếp bản ký; pension preview đã tách tuổi tham chiếu khỏi tháng hưởng. Chưa có công thức BHXH tự tính, API mở rộng hoặc migration mới. Nội dung thiết kế bên dưới dùng cùng ADR; trạng thái cũ về việc chưa đọc scan được thay bằng checkpoint này.

## 1. Kết luận và phạm vi

Nên mở rộng theo năm gói: T13 nền tảng phiên bản/quy tắc → T14 BHXH → T15 cập nhật khoản vay → T16 nguồn mới → T17 nghiệm thu kết hợp. T13 chuẩn bị cấu trúc nguồn chung cho cả ba nhánh. Giữ luồng nhập lương hưu thủ công và replay v2/v3; kết quả mới chỉ vào kế hoạch sau preview, lưu version và apply riêng.

“BHXH đầy đủ” trong kế hoạch này là **ước tính chế độ hưu trí từ lịch sử BHXH**, gồm bắt buộc/tự nguyện/hỗn hợp, điều kiện, mức hưởng, nhóm đặc thù và chuyển tiếp có bộ quy tắc được kiểm chứng. Không đồng nghĩa toàn bộ chế độ ốm đau/thai sản/tử tuất, thủ tục nộp hồ sơ hay quyết định hưởng do cơ quan BHXH ban hành. Những giai đoạn như thai sản có thể ảnh hưởng thời gian đóng vẫn phải được mô hình hóa để tính hưu đúng.

Phần nguồn mới là thiết kế sản phẩm dựa trên cơ chế snapshot/actual đang có, **không phải một quy tắc pháp luật về phân bổ tiền**. Chính sách khách đã chốt vẫn là EXPLICIT_DEPOSITS_ONLY; không tự đưa tiền dư, khoản vay hoặc tiền bán tài sản vào quỹ.

## 2. Căn cứ đã tra cứu

Chỉ dùng nguồn Chính phủ/Công báo làm căn cứ pháp lý. Ngày đăng bài hoặc metadata công cụ tìm kiếm không thay ngày hiệu lực trong văn bản. Đã phát hiện thay đổi trong 2026 nên không dùng riêng bản Luật BHXH2024 hoặc TT39 nguyên gốc làm bộ quy tắc “hiện hành”.

| Mã | Nguồn chính thức | Phạm vi dùng và mức xác minh |
| --- | --- | --- |
| R01 | [Luật41/2024/QH15 — thuộc tính](https://vanban.chinhphu.vn/?pageid=27160&docid=211199), [toàn văn](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-so-41-2024-qh15-bao-hiem-xa-hoi-119240723163650489.htm) | Hiệu lực01/07/2025; điều kiện/mức hưởng/bình quân/điều chỉnh/thời điểm, Điều5,64–73,98–104,111,141. Là bản gốc, cần ghép sửa đổi. |
| R02 | [Luật BHXH hợp nhất, Công báo133 ngày28/02/2026](https://congbaocdn.chinhphu.vn/180507251028987904/2026/3/5/468972-1772691642_v1_1772691941_signed.pdf) | Đã đọc phạm vi hợp nhất và phần hưu trí; liệt kê sửa đổi bởi Luật73/2025,84/2025,113/2025,142/2025 với ngày hiệu lực riêng. Không lấy ngày hợp nhất làm ngày hiệu lực của mọi điều. |
| R03 | [NĐ158/2025/NĐ-CP](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-158-2025-nd-cp-quy-dinh-ve-bao-hiem-xa-hoi-bat-buoc-119250629171336803.htm) | BHXH bắt buộc; Điều12–16, phần hỗn hợp/chuyển tiếp; Điều44 bãi bỏ một số khoản của NĐ135. Cần lập bảng áp dụng theo nhóm trước code. |
| R04 | [NĐ159/2025/NĐ-CP](https://chinhphu.vn/?classid=1&docid=214269&pageid=27160), [bản ký](https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/6/159-cp.signed.pdf) | BHXH tự nguyện, hiệu lực01/07/2025. T13-01 đã đọc17trang bản ký và ghi SHA-256; Điều6/7/10/11/13/16 đưa vào ma trận. T14 vẫn cần code/fixtures và rà nghiệp vụ trước publish. |
| R05 | [TT12/2025/TT-BNV](https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-12-2025-tt-bnv-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-bhxh-ve-bhxh-bat-buoc-11925070415595016.htm) | Điều12–16: thời gian, thời điểm hưởng, bình quân và trợ cấp khi nghỉ hưu; dùng làm bảng tình huống và mẫu đối chiếu. |
| R06 | [TT11/2025/TT-BNV](https://vanban.chinhphu.vn/?classid=0&docid=214422&pageid=27160) | Tự nguyện, hiệu lực01/07/2025. T13-01 đã đọc toàn bộ4trang bản ký, đối chiếu Điều3–6 với R04; chưa triển khai engine cho nhánh này. |
| R07 | [Công văn340/BHXH-CSXH ngày03/02/2026](https://xaydungchinhsach.chinhphu.vn/he-so-dieu-chinh-tien-luong-thu-nhap-thang-da-dong-bao-hiem-xa-hoi-119260206103115775.htm) | Đã đọc bảng hệ số2026; lưu hai loại tiền lương/thu nhập, năm hưởng và năm đóng. Không dùng CPI dự báo cá nhân thay bảng điều chỉnh này. |
| R08 | [Luật Nhà giáo73/2025/QH15](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-nha-giao-119250703171419548.htm) | Điều26/40, hiệu lực01/01/2026: có nhóm nghỉ tuổi thấp hơn không giảm tỷ lệ. Không áp ngoại lệ cho mọi nhà giáo. |
| R09 | [NĐ162/2026/NĐ-CP trong Công báo290, từ trang10](https://congbaocdn.chinhphu.vn/180507251028987904/2026/5/29/cong-bao-so-290-639154061914615919-ngay-29-05-47209_1780017031_signed.pdf), [thông tin thực hiện](https://media.chinhphu.vn/tang-luong-co-so-luong-huu-va-tro-cap-tu-ngay-01-7-2026-102260518164500927.htm) | Điều chỉnh từ01/07/2026 cho đối tượng thuộc phạm vi, mức tăng chung8% trên mức tháng6; có nhóm mức thấp riêng. Không nhân8% cho mọi người nghỉ hưu trong tương lai hoặc cho số tiền đã điều chỉnh. |
| R10 | [VBHN06/NHNN, bản01/2026](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/06-vbhn-nhnn.pdf) | Hợp nhất TT39/2016, gồm sửa đổi đến52/2025. Điều13–14/18–19/23 là căn cứ đối chiếu lãi, phí, thứ tự thu, cơ cấu và hợp đồng; OCR có lỗi nên không chuyển tự động thành luật executable. |
| R11 | [TT29/2026/TT-NHNN](https://chinhphu.vn/?classid=1&docid=218709&orggroupid=4&pageid=27160), [bản ký](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/7/29-nhnn.signed.pdf) | Ban hành30/06/2026, hiệu lực15/08/2026, sửa TT39. T13-01 đã đọc toàn bộ3trang; Điều4 thay khoản4 Điều18 và Điều10 chuyển tiếp đã được đưa vào ADR. Hợp đồng cụ thể và fixtures T15 còn cần kiểm. |

Các dự thảo tìm thấy trong2026 không được nhập vào bản luật đã công bố. Rà lại văn bản thay thế/sửa đổi vào ngày bắt đầu triển khai và ngày phát hành; nghiên cứu này chưa chứng minh bao phủ toàn bộ quy định cho mọi nghề/chế độ đặc thù. R04/R06/R11 đã đối chiếu bản ký ởT13-01; danh mục nghề/địa bàn và fixtures nghiệp vụ vẫn cần hoàn thiện, không được lấp bằng suy đoán.

## 3. Đối chiếu backend đang có

| Phần | Đã có trong mã | Khoảng thiếu thực sự |
| --- | --- | --- |
| BHXH | `backend/src/modules/pensions/{schema,engine,legal-age,service}.ts`: mức nhập tay, nguồn/ngày/cơ sở tiền, lịch tăng rõ ràng, tuổi tham chiếu | Chưa có lịch đóng từng tháng, bảng hệ số/luật có duyệt, đánh giá điều kiện và bộ tính quyền lợi. `legal-age.ts` còn nhãn NĐ135/2020; cần rà tác động R03 Điều44 trước mở rộng, không kết luận cả bảng tuổi đang sai. |
| Nợ | `debts/schema.ts`, `loan.ts`, `engine.ts`: lịch hợp đồng, lãi/phí, trả trước có điều khoản; đã có mô phỏng giảm kỳ giữ lịch | **Không phải chưa có trả trước một phần ở mọi nơi**. Thiếu cập nhật thực tế một phần/tái cơ cấu vào reforecast; thiếu giảm tiền giữ kỳ/lịch điều chỉnh mới và phân bổ chứng từ gốc–lãi–phí. |
| Nguồn | `actuals/schema.ts`, `source-changes.ts`: DEBT_SETTLED, ASSET_REALIZED, PENSION_REPLACE, FLOW_REPLACE | Chỉ tác động nguồn đã pin; chưa tạo định danh/lịch cho nguồn mới hoặc revision hợp đồng ở giữa chuỗi. |
| Sổ/quỹ | `actuals/reconcile.ts`: DEBT_PAYMENT giảm tiền dư hộ gia đình; WITHDRAWAL/CONTRIBUTION mới tác động số dư quỹ | Không được trừ DEBT_PAYMENT vào quỹ lần hai khi đã có WITHDRAWAL. Thêm nguồn và xử lý nợ phải giữ quy ước này. |
| Phiên bản | `plans/service.ts`, `actuals/lineage.ts`, engine v2/v3: hash, CAS, actual revisions, save/apply riêng, replay | Cần phiên bản mới cho cấu trúc nguồn/lịch BHXH/hợp đồng, không đổi nghĩa snapshot v3 hoặc bỏ qua actual anchor. |

## 4. BHXH: mô hình nghiệp vụ và dữ liệu

### 4.1 Quy tắc phải tách

Điều kiện đủ tháng và cách quy đổi tháng lẻ để tính mức hưởng là hai bước khác nhau. R02 Điều5 giữ tháng cho điều kiện; không được làm tròn179tháng thành đủ15năm. Nhánh thông thường và nhánh suy giảm khả năng lao động có điều kiện khác nhau; không lấy15năm áp cho tất cả. R02 Điều64–66/99 là căn cứ. [R02](https://congbaocdn.chinhphu.vn/180507251028987904/2026/3/5/468972-1772691642_v1_1772691941_signed.pdf)

Với trường hợp thông thường, đủ tuổi/đủ điều kiện, số năm nguyên: nữ15năm45%, thêm2điểm/năm; nam15năm40%, thêm1điểm/năm đến trước20năm; nam20năm45%, thêm2điểm/năm sau đó; trần75%. Giảm do nghỉ sớm phải đúng nhóm, không là công tắc chung. Đây là mẫu kiểm chuẩn, không đủ thay toàn bộ bộ tính. [R01 Điều66/99](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-so-41-2024-qh15-bao-hiem-xa-hoi-119240723163650489.htm)

Mức bình quân phụ thuộc chế độ lương và giai đoạn bắt đầu: lương Nhà nước có các cửa sổ5/6/8/10/15/20năm hoặc toàn bộ; lương người sử dụng lao động quyết định dùng toàn kỳ; hỗn hợp cần tổng hợp đúng từng phần. Tháng lương sau điều chỉnh mới đưa vào bình quân. [R05 Điều16](https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-12-2025-tt-bnv-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-bhxh-ve-bhxh-bat-buoc-11925070415595016.htm)

Thời điểm hưởng còn phụ thuộc nghỉ việc, tiếp tục đóng, giám định hoặc đóng bù; tuổi mục tiêu không tự quyết định tháng nhận. Sàn theo mức tham chiếu có điều kiện chuyển tiếp, không áp mặc định cho mọi người đóng15năm. NĐ158 còn bãi bỏ một số quy định thời điểm tại NĐ135; phải ghép theo ngày hiệu lực. [R03](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-158-2025-nd-cp-quy-dinh-ve-bao-hiem-xa-hoi-bat-buoc-119250629171336803.htm), [R05 Điều15](https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-12-2025-tt-bnv-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-bhxh-ve-bhxh-bat-buoc-11925070415595016.htm)

Các quy tắc cần thêm: nhánh Nhà giáo đủ điều kiện theo R08, nhận trước/sau thời điểm điều chỉnh R09, số năm đóng vượt ngưỡng cho trợ cấp nghỉ hưu, lịch sử đã hưởng BHXH một lần, bảo lưu/đóng bù và bắt buộc+tự nguyện. Không tự cộng khoản trợ cấp một lần vào dòng hưu hàng tháng hoặc vào quỹ. [R08](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-nha-giao-119250703171419548.htm), [R09](https://congbaocdn.chinhphu.vn/180507251028987904/2026/5/29/cong-bao-so-290-639154061914615919-ngay-29-05-47209_1780017031_signed.pdf)

### 4.2 Dữ liệu đầu vào đề xuất

| Nhóm | Trường cần lưu | Kiểm tra |
| --- | --- | --- |
| Nhân thân/quyền áp dụng | Ngày/tháng/năm sinh và mức độ đầy đủ của chứng từ; giới tính pháp lý phục vụ tra luật; quốc tịch/nhóm đối tượng; ngày dự kiến nghỉ và ngày chấm dứt làm việc | Không suy từ tên hoặc CCCD; giữ giá trị người khai riêng với ngày quy ước pháp lý, kèm căn cứ |
| Lịch đóng | `period`, `scheme` bắt buộc/tự nguyện, `salaryRegime`, `contributionBase`, `creditedMonths`, `status` đã xác nhận/chưa rõ, nguồn chứng từ | Tách lương thực nhận khỏi căn cứ đóng; tháng trùng/giao nhiều hợp đồng không cộng gấp đôi thời gian; không lấp tháng thiếu bằng0 |
| Giai đoạn đặc biệt | Nghề/địa bàn và khoảng hiệu lực, giám định và ngày kết luận, nghỉ thai sản/tạm dừng/bảo lưu, thời gian đã rút một lần | Mã danh mục có version; chưa có chứng từ thì cần rà, không tự cấp điều kiện |
| Dữ liệu tương lai | Lịch tiếp tục đóng, mức đóng giả định, tháng dừng, phương án đóng bù | Tách khỏi lịch sử thực; nguồn giả định có duyệt và người dùng xác nhận |
| Căn cứ tính | `legalRuleSetVersionId`, hệ số từng năm, mức tham chiếu theo ngày, bảng tuổi và ngoại lệ, `knowledgeAsOf` | Thiếu hệ số năm hưởng thì không gọi kết quả là quyền lợi đã xác định |

Không cần lưu mã BHXH/CCCD để thực hiện phép tính; chỉ thêm định danh khi có nhu cầu nghiệp vụ được xác định. Không giả định có API VssID: giai đoạn đầu nhập/import lịch sử có bước người dùng rà lại; tích hợp tự động cần tài liệu và quyền truy cập riêng. Tài liệu khách hàng không đưa vào kho tri thức chung hoặc Gemini.

### 4.3 Chuỗi tính và đầu ra

1. Chuẩn hóa lịch theo tháng, xác định tháng được tính/tháng thiếu/tháng chồng, giữ hash dữ liệu nguồn.
2. Chọn bộ quy tắc theo thời điểm hưởng và nhóm; tách **thời điểm pháp lý áp dụng** với **thời điểm hệ thống biết quy tắc**.
3. Đánh giá tuổi, thời gian đóng và điều kiện đặc thù; trả lý do khi chưa đủ.
4. Điều chỉnh từng tháng căn cứ đóng theo đúng bảng/phân nhóm → bình quân → tỷ lệ → giảm trừ đúng trường hợp → sàn/trần đúng điều kiện.
5. Tính tháng nhận, trợ cấp một lần riêng, các điều chỉnh sau hưởng đã có căn cứ. Chống tăng kép khi mức nhập đã gồm đợt điều chỉnh.
6. Trả `assessmentStatus` (ELIGIBLE/NOT_YET_ELIGIBLE/INSUFFICIENT_DATA/REVIEW_REQUIRED), `estimateKind` (CURRENT_RULE_ESTIMATE/PROJECTED_SCENARIO/MANUAL), số tháng, mức bình quân, tỷ lệ gốc/giảm, monthlyPension, startMonth, lumpSum, breakdown, missingFields, citations, hashes.

Số tiền là chuỗi Decimal, chưa xác định trảnull. Một người dự kiến nghỉ2050 chưa thể có bảng điều chỉnh chính thức2050: kết quả chỉ là kịch bản dưới giả định đã nêu, không lấy hệ số2026 lặp đến2050 hoặc để Gemini tự dự báo luật. Ước tính dưới luật hiện hành vẫn không phải quyết định hưởng chính thức.

Luồng tích hợp: preview BHXH → lưu estimate bất biến → người dùng chọn thay nguồn pension của candidate version → xem tác động → save/apply riêng. Giữ `linkedIncomeId` chống cộng lại khoản hưu đã khai trong income; tiền đóng BHXH chưa khấu trừ trong thu nhập phải được đưa vào chi tương lai, còn thu nhập khai net thì không trừ lần hai.

### 4.4 Mức bao phủ và điều kiện mở

| Đợt | Bao phủ | Điều kiện để công bố hỗ trợ |
| --- | --- | --- |
| BH1 | Lao động thông thường, bắt buộc/lương doanh nghiệp; đủ tuổi; lịch tháng đủ | Mẫu tính độc lập, hệ số năm hưởng, tuổi/tháng bắt đầu, không làm tròn điều kiện |
| BH2 | Lương Nhà nước, hỗn hợp chế độ lương; tự nguyện và bắt buộc+tự nguyện | Hoàn thành đối chiếu R04/R06; cửa sổ bình quân, bảng hệ số, không trùng tháng |
| BH3 | Nghề nặng nhọc/địa bàn/than hầm lò, suy giảm khả năng, nhà giáo, chuyển tiếp, đóng bù, trợ cấp nghỉ hưu | Mỗi nhánh có bộ hồ sơ mẫu và dẫn chiếu điều khoản; người rà nghiệp vụ ký kết quả đối chiếu |
| BH4 | Quân đội/công an/nghề đặc biệt, điều ước quốc tế, hồ sơ lịch sử đặc thù | Research chuyên biệt theo nhóm và mẫu cơ quan có thẩm quyền; trước đó REVIEW_REQUIRED |

Chưa đóng BH4 thì không quảng bá “tính được mọi trường hợp BHXH”. Việc cho REVIEW_REQUIRED là xử lý an toàn, không được đánh dấu nhánh đó đã tự tính xong. Bảo lưu luồng nhập mức trên thông báo BHXH cho các nhóm chưa tự tính.

## 5. Trả một phần và tái cơ cấu khoản vay

### 5.1 Căn cứ và quyết định thiết kế

Thỏa thuận trả trước/phí, thứ tự thu nợ và cơ cấu phải đối chiếu hợp đồng/quy định áp dụng. Cơ cấu lại thời hạn là quyết định của tổ chức cho vay, không phải việc người dùng tự đổi ngày trên ứng dụng; giảm kỳ và gia hạn quá thời hạn vay là các tình huống khác nhau. Kết quả mô phỏng không được mang nhãn ngân hàng đã chấp thuận. Cần đọc R10 cùng sửa đổi R11 trước chốt bộ quy tắc. [VBHN06/NHNN](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/06-vbhn-nhnn.pdf), [TT29/2026](https://chinhphu.vn/?classid=1&docid=218709&orggroupid=4&pageid=27160)

Tách ba command đề xuất:

| Command | Đầu vào tối thiểu | Tác động |
| --- | --- | --- |
| DEBT_PAYMENT_APPLIED | Khoản vay/revision; actual event(s); ngày hạch toán; principal/interest/prepaymentFee/otherFee; số dư ngân hàng xác nhận; phạm vi người trả/toàn khoản | Đối soát nghĩa vụ còn lại, chỉ thay lịch sau actual cutoff |
| DEBT_CONTRACT_REVISED | Revision trước/sau; ngày hiệu lực; loại điều chỉnh; chứng từ chấp thuận hoặc nhãn hypothetical; lịch/tham số mới và điều khoản phí | Thay phần tương lai của cùng nghĩa vụ; giữ mọi kỳ cũ và dấu vết revision |
| DEBT_REFINANCED | Khoản cũ/khoản mới, số tất toán thực, phí, số giải ngân, phần tiền khách nhận thực, bằng chứng hoặc kịch bản | Đóng nguồn cũ, tạo nguồn mới có liên kết; giải ngân không là thu nhập và không tự thành tiền góp quỹ |

Không suy principal từ tổngDEBT_PAYMENT; một khoản20triệu có thể gồm lãi/phí. Đối soát `cashPaid = principalPaid + interestPaid + feesPaid` trong cùng phạm vi; principal sau = principal trước − principalPaid + phần tăng gốc đã được khai/xác nhận hợp lệ. Không tự vốn hóa lãi/phí. Sai lệch trảDEBT_BALANCE_MISMATCH thay vì tự điều chỉnh số dư.

Lãi ngày cần ngày trả thực, khoảng tính/ngày tính đã gồm hay chưa, quy ước năm và lãi áp dụng từng đoạn. Không tiếp tục áp lãi cả tháng trên dư nợ đầu tháng khi thực tế có trả giữa kỳ mà thiếu quy ước. Ngày trả, ngày ghi sổ ngân hàng và tháng actual có thể khác nhau: thiếu căn cứ thì yêu cầu lịch ngân hàng thay vì đoán.

### 5.2 Lịch sau điều chỉnh

- Giữ hạn, tính lại khoản trả: chỉ dùng công thức niên kim khi lãi cố định/đều kỳ, có nhánh lãi0 và kỳ cuối xử lý dư; lãi thả nổi dùng lịch hoặc giả định có nguồn, không lấy một lãi cho toàn kỳ.
- Giữ khoản trả, giảm hạn: kế thừa engine hiện tại trong phạm vi hỗ trợ, thêm ngày hiệu lực/actual anchor và kiểm phí; không dùng kết quả preview cũ như bằng chứng đã trả.
- Lịch ngân hàng cung cấp: authoritative schedule có gốc/lãi/phí/ngày trả/số dư, kiểm liên tục và tổng; luôn giữ provenance.
- Gia hạn/ân hạn: khai riêng có trả lãi trong ân hạn hay không, xử lý lãi phát sinh, kỳ balloon; chưa rõ thì không tự sinh khoản trả0.
- Nợ quá hạn, lãi phạt hoặc vốn hóa: nhánh riêng; chỉ mở khi có điều khoản và golden tests. Không đưa vào khoản vay chuẩn bằng cách cộng mọi thứ vào gốc.
- Đồng nghĩa vụ: phân biệt dư nợ toàn hợp đồng, phần dự kiến người dùng trả, nghĩa vụ tối đa CAPPED và tổng đã thực hiện. Không tự suy thanh toán của đồng vay từ phần người dùng; nhánh chưa đủ căn cứ vẫn REVIEW_REQUIRED.

### 5.3 Giữ đúng quỹ/actual/version

Actual đã nằm trong anchor không được phát lại ở tháng tương lai. Nếu trả nợ từ quỹ, WITHDRAWAL đã giảm quỹ; DEBT_PAYMENT chỉ phân loại chi hộ gia đình. Evidence link chỉ giải thích sự liên hệ, không tạo bút toán mới. Phí ngân hàng đã nằm trong DEBT_PAYMENT không được thêm FEE của quỹ lần nữa; FEE ledger hiện tại dành cho tác động quỹ.

Đề xuất bảng phân bổ bằng chứng trong changeset: eventId, actualRevision, loanId, component, amount, amountScope; tổng phân bổ không vượt số event và không chiếm cùng phần tiền hai lần trong cùng chuỗi version. Chia một event cho nhiều khoản chỉ được khi khai phân bổ đầy đủ; giai đoạn đầu có thể yêu cầu tách actual event để giảm rủi ro nhập sai.

Mốc cutover phải sau phần actual đã đối soát. Chứng từ giữa tháng được xử lý trong đối soát nghĩa vụ đến cuối tháng; không chèn lại dòng trước anchor. Sửa actual hoặc sửa revision hợp đồng nguồn làm preview/save/apply cũ bị stale; replay lịch sử vẫn dùng bản đã pin.

## 6. Thêm nguồn mới ngay trong dự báo lại

### 6.1 Kiểu nguồn và phạm vi

| Nguồn | Dữ liệu | Quy tắc tránh tính trùng |
| --- | --- | --- |
| Thu nhập/chi phí mới | sourceId, ngày/tháng bắt đầu/kết thúc, lịch số tiền, nominal/today, recurring/one-off, nguồn xác nhận | Không suy định kỳ từ một actual; mỗi khoản chỉ vào đúng nhóm/tháng |
| Pension mới | Mức nhập tay hoặc estimateId BHXH, tháng nhận và lịch điều chỉnh | Một nguồn pension logic; dùng thao tác thay/khởi tạo có kiểm, không thêm song song incomePENSION |
| Tài sản/nguồn vốn tương lai | Giá trị, sở hữu, phần hưu/dự phòng/mục tiêu khác, thanh khoản, thời điểm thu, thuế/phí hoặc sốnet có xác nhận | Giá trị tài sản không đồng nghĩa tiền mặt đã góp; tiền bán đã có trong anchor không cộng lại |
| Khoản vay mới | Contract revision, giải ngân, người hưởng, dòng trả, nguồn thanh toán | Giải ngân là nguồn tài trợ kèm nghĩa vụ, không là thu nhập thường xuyên; không tự tăng quỹ |
| Nguồn đã phát sinh trước cutoff | Liên kết actual/evidence hoặc snapshot đối soát tài sản/nợ tại cutoff | Không backdate vào forecast sau anchor; chỉ cập nhật registry khi có căn cứ, không sửa openingBalance |

### 6.2 Cách lưu và tính đề xuất

Mỗi plan version mới có `sourceRegistry` gồm sourceId ổn định, type, scope, origin, revision, effective interval, evidence/hash và dữ liệu. `scope=PLAN_VERSION` cho nguồn tạo ngay trong dự báo; không âm thầm ghi vào hồ sơ tài khoản. Nguồn hồ sơ dùng namespace khác; không dựa tên/nhãn để nhận diện trùng. Nếu cần đưa về hồ sơ, thêm thao tác riêng có expectedProfileRevision và preview tác động.

Changeset có operation CREATE/REVISE/END, schemaVersion, commandId và expectedSourceRevision. Bản kế tiếp được chỉnh nguồn đã tạo ở bản trước; registry hợp lệ đến cutoff là cơ sở tính, không chỉ đọc profile gốc. Chống nguồn trùng ID, chuỗi supersedes vòng, nguồn thuộc tài khoản khác, reference đến nguồn đã kết thúc và reuse evidence.

Thay cách cộng/trừ trực tiếp vào tổng bằng bước tổng hợp lịch theo nguồn: profile đã pin → registry tại anchor → changeset hợp lệ → schedule của từng source → cộng thành income/expense/debt/pension/capital → engine quỹ. Mỗi dòng giữ source attribution để report/CSV/AI chỉ ra nguyên nhân thay đổi. Với futureChanges kiểu thay tổng tháng cũ, tiếp tục từ chối overlap với sửa nguồn cùng trường/khoảng; không tự đặt ưu tiên ngầm.

Quỹ actual là một quỹ hợp nhất VND. Giá trị tài sản mới nằm ngoài quỹ không đổi anchor. Số tiền tương lai cần rõ `netAmount`, `amountScope`, `confirmedContributionAmount` và thời điểm khả dụng; góp đầu kỳ chỉ nhận nguồn thực có sẵn đầu kỳ, không lấy tiền bán cuối tháng tài trợ đầu tháng. Chưa có quy tắc FX thì nguồn ngoại tệ yêu cầu rà thay vì ngầm đổi1:1.

Tài sản ròng trong report phải ghi rõ ngày/cơ sở: số của profile gốc khác số đã đối soát tại cutoff. Nếu không có bộ tài sản/nợ được cập nhật đầy đủ thì giữ nhãn cơ sở cũ/cần rà, không lấy một tài sản mới cộng vào tổng cũ rồi gọi là tài sản ròng hiện tại. Đây là tiêu chí report của T16-03.

## 7. Kiến trúc, API và database đề xuất

| Thành phần | Thay đổi dự kiến | Tương thích |
| --- | --- | --- |
| LegalRuleSetVersion | Nhóm luật, phiên bản, khoảng hiệu lực, vùng áp dụng, sourceURLs/hashes, ngày rà, bộ bảng quy tắc, DRAFT→REVIEWED→PUBLISHED | Bản công bố bất biến; luật và giả định kinh tế là hai loại độc lập; không lấy bài knowledge AI làm rule |
| SocialInsuranceHistoryVersion | Owner, revision, lịch đóng JSON theo schema có kiểm, hash/provenance, supersedes | Nhập/import tạo revision; không suy lịch đóng từ vài trường legacy |
| PensionEstimate | Owner, inputHistoryHash/revision, legalRuleSetHash, bảng hệ số đã pin, assumptionsHash, kết quả/breakdown, engineVersion | Ước tính bất biến; sửa lịch tạo bản mới, cảnh báo bản kế hoạch dùng estimate cũ |
| PlanVersion | Registry/changeset/hợp đồng/estimate refs trong snapshot JSON; source/schema/model version | Ưu tiên tái dùng snapshot hiện tại; không thêm bảng nguồn toàn cục khi chưa có nhu cầu truy vấn/ràng buộc |
| FinancialModelVersion | Đăng ký engine/serializer mới, dự kiến monthly-v4 | Đóng băng đường replayv2/v3 trước sửa hàm dùng chung; không tính lại snapshot cũ bằng luật mới |

**Dự kiến cần migration cộng thêm cho ba thực thể BHXH đầu bảng; chưa có DDL được duyệt hoặc thực thi.** Các trường registry có thể dùng JSON hiện hữu nếu kiểm chứng đủ uniqueness/audit/hiệu năng. T13-02 chốt relational so với JSON trước viết migration; không yêu cầu người dùng bổ sung DB thủ công bây giờ. Không sửa/áp lại0010 hoặc các migration trước.

API dự kiến, có thể đổi tên ở bước contract:

- USER `/api/v1/me/social-insurance/history`: đọc/ghi revision; `/import/preview` chỉ parse/validate và báo lỗi, không ghi hoặc gọi AI; `/estimates/preview`, `/estimates` lưu bất biến, `/estimates/:id` owner-only.
- ADMIN `/api/v1/admin/social-insurance/rule-sets`: nháp/validate/impact/review/publish với audit, kiểm đủ bảng và hiệu lực. Không có endpoint thực thi công thức tùy ý từ text.
- Mở rộng `/api/v1/me/retirement/actuals/reforecast/preview` và lưu `/plans/:id/reforecasts` bằng changeset version mới; giữ payload cũ. Có preview chuyên biệt khoản vay nếu giúp nhập liệu, nhưng kết quả phải dùng chung evaluator.
- Response preview gồm before/after, delta theo nguồn, fundsRequired, missingEvidence, hypothetical, source revisions, hash và lỗi có fieldPath. Không nhận userId, CPI/lãi hệ thống hoặc output tổng từ client làm kết quả tin cậy.

Mọi ghi có idempotency/CAS/ownership. Canonical hash phải gồm actual anchor+revisions, registry+commands, hợp đồng, history BHXH, rules/factors và model. Apply dùng đúng candidate được kiểm; replay không phụ thuộc profile hoặc bảng luật hiện tại. Chứng từ nhạy cảm chỉ giữ tham chiếu cần thiết, quyền theo owner; AI nhận facts tóm tắt, không nhận lịch đóng/chứng từ sức khỏe/hợp đồng.

## 8. Backlog thực thi và điều kiện hoàn thành

| Task | Đầu ra cụ thể | Phụ thuộc / tiêu chí hoàn thành |
| --- | --- | --- |
| T13-01 | Danh mục pháp lý có hiệu lực, coverage matrix, đối chiếu R04/R06/R11 và nghề/địa bàn; rà legal-age hiện có | Mỗi nhánh có điều/khoản, hiệu lực, người rà; chỗ thiếu ghi REVIEW_REQUIRED, không publish rule thiếu |
| T13-02 | ADR snapshot/registry/history/rules; ERD, OpenAPI và migration cộng thêm nếu cần | Không phá profilev2, migration0010 hoặc replayv2/v3; mô tả vòng đời nguồn và xóa dữ liệu |
| T13-03 | Bộ tổng hợp schedule theo nguồn và version model mới | Tổng từng nguồn khớp tổng tháng; fixtures cũ replay không đổi; không mở hành vi mới trong engine cũ |
| T14-01 | Rule-set lifecycle + bảng hệ số/tuổi/mức tham chiếu có version | Admin validate/impact/review/publish, USER chỉ dùng bản hiệu lực; bảng thiếu không được coi là0 |
| T14-02 | Nhập/import lịch đóng và version history | Không trùng tháng; phân biệt paid/credited/unknown/withdrawn; owner/revision/error preview |
| T14-03 | Bộ tính BH1 và estimate có breakdown | Tách điều kiện/tháng lẻ/bình quân/tỷ lệ/thời điểm; đúng các fixture độc lập |
| T14-04 | BH2 và BH3 theo từng coverage group | Đối chiếu bản ký tự nguyện/hỗn hợp, Nhà nước, suy giảm/nghề/nhà giáo/chuyển tiếp; không gọi partial là đầy đủ |
| T14-05 | BH4 và nhập mức chính thức fallback | Research riêng điều ước/lực lượng đặc thù; nhóm chưa golden test vẫn REVIEW_REQUIRED và task còn mở |
| T14-06 | Estimate→nguồn pension trong candidate, report/CSV/AI | Không trùng income, không nhân CPI/điều chỉnh hai lần; save/apply riêng, pin rule/history |
| T15-01 | Contractv2 và allocation thực tế; rà sửa đổi cho vay2026 | Gốc/lãi/phí/toàn khoản/phần người dùng rõ; thiếu dư nợ xác nhận không suy tất toán |
| T15-02 | Giảm kỳ, giảm khoản trả, lịch ngân hàng, trả giữa kỳ | Lãi0/lãi thay đổi/phí/dư cuối đúng; không double-count quỹ/actual |
| T15-03 | Gia hạn/ân hạn/refinance/CAPPED theo nhánh | Lịch mới có nguồn/chấp thuận hoặc hypothetical; không vốn hóa mặc định; chưa hỗ trợ trả REVIEW_REQUIRED |
| T15-04 | Nối contract revision với registry và reforecast | Sửa evidence làm stale; replay cũ còn được; save retry không tạo nguồn/tiền lặp |
| T16-01 | CREATE/REVISE/END cho thu/chi/pension | Nguồn tạo ởv1 được chỉnh ởv2, không ghi profile ngầm, thời gian sau anchor |
| T16-02 | Tài sản/vốn/khoản vay mới và liên kết actual | Tách giá trị tài sản/net cash/góp xác nhận; newloan không là income; START/END đúng nguồn khả dụng |
| T16-03 | Attribution/so sánh/report/CSV/AI và luồng promote riêng nếu làm | Cùng số liệu/hashes, nêu đủ assumed vs realized; không cho Gemini tạo command ghi |
| T17-01 | Golden tests/contract/property/metamorphic | Expected độc lập, đủ ca dưới đây; không chỉ chép lại implementation |
| T17-02 | Migration clean/upgrade +HTTP/DB/CAS/races/replay | Fixture rollback trên DB thật được phép; không reset/seed toàn DB; zero lost update/double-allocation |
| T17-03 | Browser tích hợp và nghiệm thu nghiệp vụ | Mỗi nhánh đã bật có evidence; build/test không thay browser; nhóm BH4 chưa làm vẫn ghi mở |

Ưu tiên bắt đầu **T13-01 + T13-02**, sau đó T13-03 và T14. Không cần chờ khách chốt lại P13/P15. Việc vận hành/P36 của MVP vẫn là luồng còn mở độc lập, không được bỏ khỏi checklist khi mở T13–T17.

## 9. Bộ ca nghiệm thu tối thiểu

Các con số sau là fixture đơn giản có điều kiện đầu vào rõ, chưa phải kết quả kiểm thử đã chạy.

| ID | Đầu vào | Expected cần kiểm |
| --- | --- | --- |
| BH-G01 | Nam thông thường, đủ tuổi;180tháng, mức bình quân đã điều chỉnh10triệu, không sàn/giảm | Tỷ lệ40%, lương4triệu |
| BH-G02 | Nữ cùng điều kiện,180tháng, bình quân10triệu |45%,4,5triệu |
| BH-G03 | Nam240tháng; nam420tháng; nữ360tháng |45%;75%;75%, kiểm ngưỡng/trần |
| BH-G04 |179/180tháng;239/240tháng; tháng lẻ1/6/7/11 | Điều kiện dùng tháng thực; tỷ lệ dùng quy tắc đúng nhóm, không làm tròn để đủ điều kiện |
| BH-G05 | Cùng nghỉ trước tuổi, nhóm suy giảm và nhóm nhà giáo thuộc ngoại lệ | Chọn nhánh giảm khác nhau, không dùng công tắc giảm chung |
| BH-G06 | Bắt đầu chế độ Nhà nước ở mỗi mốc1995/2001/2007/2016/2020/2025; lịch hỗn hợp | Chọn cửa sổ đúng và trọng số đúng, không bình quân đơn giản hai mức bình quân |
| BH-G07 | Hệ số năm hưởng thiếu; tháng đóng thiếu; một giai đoạn đã rút một lần | Null/issue hoặc scenario có nhãn; không tự điền hệ số1/thời gian0 |
| BH-G08 | Mức nhận2026 đã/ chưa gồm đợt tăng, người bắt đầu nhận sau phạm vi áp dụng | Không nhân tăng kép/áp cho sai đối tượng; giữ nguồn và ngày |
| DN-G01 | Dư gốc100triệu; chứng từ trả12triệu gồm gốc10/lãi1/phí1 | Dư gốc90triệu, dòng tiền12triệu; không giảm gốc12 |
| DN-G02 | Trả từ quỹ có WITHDRAWAL12triệu +DEBT_PAYMENT12triệu | Quỹ chỉ giảm12triệu, chi hộ gia đình không mất dấu |
| DN-G03 | Lãi0; khoản trả giữ hạn vs giữ khoản trả; phí vượt lợi ích | Lịch/tổng chi đúng, phương án có thể bất lợi; không ép kết quả tốt hơn |
| DN-G04 | Cùng event dùng hai lần; sửa actual sau save; profile revision cũ | Reject allocation/409 hoặc stale; không tạo phiên bản trùng |
| DN-G05 | Trả giữa kỳ, ân hạn, balloon, thả nổi, CAPPED, refinance | Expected từ lịch ngân hàng/mẫu tính độc lập; chưa có quy tắc thì review |
| SRC-G01 | Thu mới5triệu từ01/2027, góp xác nhận0 | Thu tăng5triệu; plannedContribution không tự tăng |
| SRC-G02 | Khoản thu20triệu one-off tháng03 | Chỉ xuất hiện tháng03, không kéo dài |
| SRC-G03 | Bán tài sản: net100triệu, phần hưu50%, góp xác nhận30triệu | Không góp100/50triệu tự động; phần còn lại tách rõ |
| SRC-G04 | Tiền bán đã ở actual anchor; vay mới trả thẳng bên bán | Không tăng quỹ lần nữa; có nghĩa vụ vay đúng lịch |
| SRC-G05 | Tạo nguồn→save→version sau sửa→END; overlap tổng tháng; nguồn user khác | Registry/replay/ownership đúng; xung đột rõ, không cộng hai lần |
| ALL-G01 | BHXH mới +nợ điều chỉnh +thu mới trong cùng candidate; backend lỗi/409/retry/đa tab | Preview/save/apply/report/CSV cùnghash; form giữ input; current/baseline đúng và dữ liệu cũ không đổi |

Kiểm bất biến bổ sung: đổi nhãn không đổi tiền; đổi thứ tự command độc lập không đổi kết quả; không nguồn nào vào hai nhóm; tổng source schedule bằng aggregate; no-op giữ kết quả; sửa rule mới không thay replay cũ. Golden tính pháp lý phải được người am hiểu nghiệp vụ kiểm tra, không để AI tự tạo expected rồi tự chứng nhận.

## 10. Bàn giao và phần cần bổ sung căn cứ

UI có checklist FE-EXPANSION-T13-T17 trong `task-frontend.md`; backend phải bàn giao OpenAPI/fixtures/error examples trước khi UI gắn form. Không thêm form đang giả lập thành tính BHXH đã hỗ trợ.

Cần bổ sung trong các task: danh mục nghề/địa bàn và nhóm BH4; mẫu lịch BHXH ẩn định danh theo từng nhóm; mẫu hợp đồng/thông báo trả trước/tái cơ cấu có phạm vi sử dụng; quyết định lưu chứng từ và thời hạn dữ liệu. Bảng đối chiếu R04/R06/R11 đã có ởT13-01. Không yêu cầu key/CCCD/chứng từ cá nhân thật để viết bộ máy thử nghiệm.

Tài liệu nghiên cứu này xác định hướng triển khai và những chỗ phải kiểm chứng thêm. Phần mở rộng chỉ được coi hoàn thành theo từng coverage group đã có mã, dữ liệu quy tắc được duyệt và bằng chứng chạy thật.
