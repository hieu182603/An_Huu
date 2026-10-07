# Bộ quy định hưu trí 2026 — bản nháp để rà soát

Bổ sung07/10 (lần 5): nguồn thứ mười lăm LAW2006 = Luật BHXH 71/2006/QH11, snapshot toàn văn HTML Cổng TTĐT Chính phủ (Cổng chỉ có tệp .doc, không có PDF ký). Draft BH1 và Nhà nước v2 thêm trích dẫn LAW2006_ART35 (thai sản 01/2007–12/2015).

Bổ sung07/10 (lần 4): nguồn thứ mười bốn LAW2014 = Luật BHXH 58/2014/QH13 bản ký gốc (51 trang scan, đọc trực tiếp Điều39 trang17 và Điều124 trang51). Draft BH1 và Nhà nước v2 có thêm trích dẫn LAW_ART53 (Luật 2024 Điều53(8)) và LAW2014_ART39 cho tháng thai sản được tính là thời gian đóng. Các draft còn lại giữ nguyên byte.

Bổ sung07/10 (lần 3): nguồn thứ mười ba FACTORS2025 = TT01/2025/TT-BLĐTBXH (datafiles.chinhphu.vn, PDF ký, 3 trang, đọc trực tiếp). Draft thứ tám `bh2-voluntary-transition-2025.draft.json` cho năm hưởng 2025 (hiệu lực 2025-07-01→2026-01-01, 1.143 dòng: tuổi + 32 hệ số lương Bảng 1 + 18 hệ số thu nhập Bảng 2 + mức tham chiếu 2.340.000). TT01 được ban hành theo NĐ115/NĐ134 đã bị thay từ 01/07/2025 — chưa có xác nhận chuyển tiếp chính thức; người duyệt pháp lý phải quyết định trước khi công bố. Strategy tự nguyện nay chấp nhận năm hưởng 2025 và 2026 và có thêm golden VOL-TRANSITION-2025. Bảy draft trước giữ nguyên byte.

Bổ sung07/10 (lần 2): thêm draft thứ bảy `bh2-state-mixed-v2.draft.json`, engine `vn-pension-state-v2`, cùng 1.127 dòng bảng với bộ v1 và hai trích dẫn mới LAW_ART2 (R02 Điều2(1)) và ND158_ART34 (R03 Điều34). Strategy chạy 18 mẫu v1 + 3 golden v2. Sáu draft trước giữ nguyên byte. Chưa nhập/duyệt/công bố. [Quy tắc](../../docs/INSURANCE_HISTORY_RULES.md).

Bổ sung07/10: corpus có12nguồn và6draft. Bộ thứ năm `bh2-voluntary-top-up.draft.json` dùng engine `vn-pension-voluntary-top-up-v1`,1.148dòng và17ca kiểm: đóng thiếu1–60tháng để đủ180, năm đóng/hưởng2026. Ghép CV1510,31%/tháng, NĐ351 Điều2/NĐ07 Điều3 cho mức tối thiểu1,5triệu, trần theo ngày đóng. Bốn draft cũ giữ nguyên nội dung. Fragment lãi riêng vẫn không phải body công bố. [Contract](../../docs/VOLUNTARY_PAYMENTS.md).

Sáu file draft là body của `POST /api/v1/admin/legal-rules`, chưa được nhập/duyệt/công bố trên DB vận hành; seed không tự nạp. Kiểm duyệt/công bố bằng fixture rollback không thay phê duyệt pháp lý độc lập.

Phạm vi: BH1 lương doanh nghiệp thông thường, engine `vn-pension-benefit-v2`; BH2 Nhà nước/hỗn hợp thông thường, engine `vn-pension-state-v1`. Ngày hưởng trong `[2026-01-01, 2027-01-01)`. Mỗi bộ có 1.127 dòng: 1.092 tuổi theo tháng sinh, 33 hệ số tiền lương, hai khoảng mức tham chiếu. Bảng tuổi chỉ có nam sinh từ 1961 và nữ từ 1966 đến hết 2008; đây là phạm vi dữ liệu, không phải khẳng định mọi người trong khoảng đều đủ điều kiện. Không ngoại suy hệ số cho năm hưởng 2027.

Bộ thứ ba (07/10) dùng `vn-pension-voluntary-v1`, cho tự nguyện định kỳ thông thường và lịch sử bắt buộc doanh nghiệp. Có 1.146 dòng: các nhóm bảng trên cộng 19 hệ số **thu nhập tự nguyện** 2008–2026, chép riêng từ cột thu nhập CV340. Citation `CV340_INCOME_2026` tách khỏi cột tiền lương. Không bao gồm Nhà nước+tự nguyện, đóng trước/bù, chuyển tiếp hoặc hồ sơ đặc thù; xem [VOLUNTARY_PENSION.md](../../docs/VOLUNTARY_PENSION.md).

Bộ thứ tư dùng `vn-pension-voluntary-state-v1`, cùng1.146dòng và nguồn bổ sung Điều31/NĐ158 Điều15/TT12 Điều16 cho phần bắt buộc lương Nhà nước hoặc hỗn hợp Nhà nước-doanh nghiệp trước tự nguyện. Có14mẫu kiểm bắt buộc so với8mẫu của nhánh tự nguyện-doanh nghiệp. Chỉ lương thông thường từ10/2004, chưa bao gồm CREDITED/đặc thù/đóng trước/bù/chuyển tiếp. Hai bộ đầu giữ nguyên byte qua lần bổ sung này.

Bộ thứ sáu `bh2-voluntary-prepaid.draft.json`: engine `vn-pension-voluntary-prepaid-v1`,1.148dòng/23ca. Thêm nguồn đã lưu Luật36(3), NĐ159Điều6/8, TT11Điều5(3) cho kỳ3/6/12/24/36/48/60 và hoàn phần còn lại khi đề nghị nghỉ hưu. Tháng thực tính hưởng khác thời gian đã trả tiền. Năm bộ trước giữ nội dung; không gọi khoản hoàn là đã nhận. [Contract](../../docs/VOLUNTARY_PAYMENTS.md).

## Nguồn và cách tái lập

`sources.json` ghi URL gốc, thời điểm tải, kích thước và SHA-256 của mười hai tài liệu lưu trong `sources/`. PDF giữ nguyên byte tải về. Hai bản toàn văn NĐ158 và TT12 là snapshot HTML từ Cổng TTĐT Chính phủ, lưu đuôi `.html.txt` để không trình bày như trang web có thể thực thi; đây **không phải** bản ký PDF. Trình tạo không tải lại nguồn và không thực thi HTML. R04/R06 tải ngày07/10 khớp hash đã rà tại LEGAL_RULE_MATRIX.md; không thay nguồn hoặc thay byte của bảy bản lưu trước.

| Nguồn | Nội dung được trích vào bộ quy định |
|---|---|
| R02 | Điều5,31,64,66,68,69,72,73,98–101,104 và140(13), Luật BHXH hợp nhất; ngày hợp nhất không thay ngày hiệu lực từng quy định |
| AGE | NĐ135 Phụ lục I, PDF trang 7–10; các khối tháng sinh được chép độc lập với hàm tính tuổi |
| R03 | NĐ158 Điều 12, 13, 15, 16; bản toàn văn chính thức |
| R05 | TT12 Điều 14–16; bản toàn văn chính thức |
| R04 | NĐ159 Điều10–11, PDF trang7–9; hệ số thu nhập, hỗn hợp và sàn đúng nhóm |
| R06 | TT11 Điều5(1,2,7), PDF trang2–3; thời điểm hưởng nhánh định kỳ |
| FACTORS2026 | Công văn340/BHXH-CSXH, PDF trang1–2; cột tiền lương cho WAGE_FACTOR, cột thu nhập riêng cho INCOME_FACTOR |
| BASE2024 | NĐ73 Điều 3(2), PDF trang 3; nối Điều 140(13) của Luật BHXH |
| BASE2026 | NĐ161 Điều 3(2), PDF trang 3; nối Điều 140(13) của Luật BHXH |
| POVERTY2026 | NĐ351/2025 Điều2(1), PDF trang1: tiếp tục chuẩn cũ từ01/01 đến31/12/2026 |
| POVERTY2021 | NĐ07/2021 Điều3(1)(a), PDF trang2: thu nhập nông thôn1.500.000 |
| FUND2026 | CV151/BHXH-ĐTQ, PDF trang1;0,31%/tháng cho năm đóng2026, fragment riêng chưa publish |

Chạy từ thư mục backend:

```text
node scripts/generate-legal-corpus.cjs --check
npm run legal:corpus:check
```

Lệnh đầu đối chiếu byte nguồn và tái tạo cả sáu draft trong bộ nhớ, báo lỗi nếu file khác nội dung dự kiến. Bỏ `--check` để ghi lại draft từ các bảng đã chép; thao tác này vẫn không kết nối DB. Lệnh thứ hai còn chạy schema, bộ kiểm chứng đã đăng ký, ca tính bằng draft thực, ngưỡng tháng, thay đổi mức tham chiếu, thiếu hệ số và nguồn bị sửa/giả mạo/hết hiệu lực.

SHA-256 chứng minh bản lưu và citation khớp byte, không tự xác thực chữ ký số hoặc cách diễn giải pháp luật. Danh sách tên miền được phép của API cũng không thay bước rà soát nội dung. Không dùng test fixtures với chứng từ giả để nhập dữ liệu khách hàng.

## Các điểm người rà soát phải quyết định trước công bố

1. Đối chiếu điều khoản, phạm vi, ngày hiệu lực và nội dung bản toàn văn NĐ158/TT12 với bản ký; kiểm chữ ký nếu quy trình yêu cầu. Không ghi nhận đã xác thực chữ ký chỉ vì tên file có chữ `signed`.
2. Rà cách quy đổi tháng lẻ riêng cho hai phần trợ cấp vượt số năm trước/sau tuổi nghỉ hưu. Đây là cách triển khai hiện tại, cần mẫu đối chiếu độc lập.
3. Rà cửa sổ bình quân Nhà nước và cách so bình quân toàn thời gian đối với hồ sơ hỗn hợp; các ca đặc thù chưa có quy tắc không được coi là đã hỗ trợ.
4. Đối chiếu các tháng CREDITED, chuyển đổi lương trước10/2004, phụ cấp/chuyển nghề, đóng trước/bù/chuyển tiếp, nghỉ sớm/nhà giáo/điều ước với nhóm triển khai riêng. Bộ đóng bù mới chỉ hỗ trợ thiếu tối đa60tháng thông thường; các nhóm còn lại chưa giải quyết; kết quả có thể là `REVIEW_REQUIRED`.
5. Xác nhận không dùng bộ này để tự điều chỉnh mức hưu đang hưởng, không chuyển trợ cấp một lần thành vốn góp và không áp hệ số 2026 cho ngày hưởng năm khác.

Sau rà soát, quản trị viên tạo DRAFT từ body, chạy VALIDATE, quản trị viên khác các tác giả REVIEW đúng hash, rồi PUBLISH theo API hiện có. Nếu nội dung cần sửa, sửa nguồn/bảng và tạo lại draft, kiểm lại toàn bộ; không sửa bản PUBLISHED hoặc tái sử dụng xác nhận của hash cũ. File này không thay bước duyệt độc lập của hệ thống.
