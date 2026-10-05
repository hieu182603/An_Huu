# Bộ quy định hưu trí 2026 — bản nháp để rà soát

Hai file `bh1-employer.draft.json` và `bh2-state-mixed.draft.json` là body hợp lệ của `POST /api/v1/admin/legal-rules`. Chưa nhập vào DB, chưa được duyệt độc lập hoặc công bố. Lệnh `db:seed` không tự nạp chúng. Kiểm thử mô phỏng duyệt/công bố trong giao dịch rollback không phải phê duyệt pháp lý.

Phạm vi: BH1 lương doanh nghiệp thông thường, engine `vn-pension-benefit-v2`; BH2 Nhà nước/hỗn hợp thông thường, engine `vn-pension-state-v1`. Ngày hưởng trong `[2026-01-01, 2027-01-01)`. Mỗi bộ có 1.127 dòng: 1.092 tuổi theo tháng sinh, 33 hệ số tiền lương, hai khoảng mức tham chiếu. Bảng tuổi chỉ có nam sinh từ 1961 và nữ từ 1966 đến hết 2008; đây là phạm vi dữ liệu, không phải khẳng định mọi người trong khoảng đều đủ điều kiện. Không ngoại suy hệ số cho năm hưởng 2027.

## Nguồn và cách tái lập

`sources.json` ghi URL gốc, thời điểm tải, kích thước và SHA-256 của bảy tài liệu lưu trong `sources/`. PDF giữ nguyên byte tải về. Hai bản toàn văn NĐ158 và TT12 là snapshot HTML từ Cổng TTĐT Chính phủ, lưu đuôi `.html.txt` để không trình bày như trang web có thể thực thi; đây **không phải** bản ký PDF. Trình tạo không tải lại nguồn và không thực thi HTML.

| Nguồn | Nội dung được trích vào bộ quy định |
|---|---|
| R02 | Điều 5, 31, 64, 66, 68, 69, 72, 73 và 140(13), Luật BHXH hợp nhất; ngày hợp nhất không thay ngày hiệu lực từng quy định |
| AGE | NĐ135 Phụ lục I, PDF trang 7–10; các khối tháng sinh được chép độc lập với hàm tính tuổi |
| R03 | NĐ158 Điều 12, 13, 15, 16; bản toàn văn chính thức |
| R05 | TT12 Điều 14–16; bản toàn văn chính thức |
| FACTORS2026 | Công văn 340/BHXH-CSXH, PDF trang 1–2, cột tiền lương; không dùng cột thu nhập tự nguyện |
| BASE2024 | NĐ73 Điều 3(2), PDF trang 3; nối Điều 140(13) của Luật BHXH |
| BASE2026 | NĐ161 Điều 3(2), PDF trang 3; nối Điều 140(13) của Luật BHXH |

Chạy từ thư mục backend:

```text
node scripts/generate-legal-corpus.cjs --check
npm run legal:corpus:check
```

Lệnh đầu đối chiếu byte nguồn và tái tạo hai draft trong bộ nhớ, báo lỗi nếu file khác nội dung dự kiến. Bỏ `--check` để ghi lại hai draft từ các bảng đã chép; thao tác này vẫn không kết nối DB. Lệnh thứ hai còn chạy schema, bộ kiểm chứng đã đăng ký, ca tính thực sự bằng hai draft, ngưỡng tháng, thay đổi mức tham chiếu, thiếu hệ số và nguồn bị sửa/giả mạo.

SHA-256 chứng minh bản lưu và citation khớp byte, không tự xác thực chữ ký số hoặc cách diễn giải pháp luật. Danh sách tên miền được phép của API cũng không thay bước rà soát nội dung. Không dùng test fixtures với chứng từ giả để nhập dữ liệu khách hàng.

## Các điểm người rà soát phải quyết định trước công bố

1. Đối chiếu điều khoản, phạm vi, ngày hiệu lực và nội dung bản toàn văn NĐ158/TT12 với bản ký; kiểm chữ ký nếu quy trình yêu cầu. Không ghi nhận đã xác thực chữ ký chỉ vì tên file có chữ `signed`.
2. Rà cách quy đổi tháng lẻ riêng cho hai phần trợ cấp vượt số năm trước/sau tuổi nghỉ hưu. Đây là cách triển khai hiện tại, cần mẫu đối chiếu độc lập.
3. Rà cửa sổ bình quân Nhà nước và cách so bình quân toàn thời gian đối với hồ sơ hỗn hợp; các ca đặc thù chưa có quy tắc không được coi là đã hỗ trợ.
4. Đối chiếu các tháng CREDITED, chuyển đổi lương trước 10/2004, phụ cấp/chuyển nghề, tự nguyện, nghỉ sớm/nhà giáo/điều ước với nhóm triển khai riêng. Hai bộ này chưa giải quyết những nhóm đó; kết quả có thể là `REVIEW_REQUIRED`.
5. Xác nhận không dùng bộ này để tự điều chỉnh mức hưu đang hưởng, không chuyển trợ cấp một lần thành vốn góp và không áp hệ số 2026 cho ngày hưởng năm khác.

Sau rà soát, quản trị viên tạo DRAFT từ body, chạy VALIDATE, quản trị viên khác các tác giả REVIEW đúng hash, rồi PUBLISH theo API hiện có. Nếu nội dung cần sửa, sửa nguồn/bảng và tạo lại draft, kiểm lại toàn bộ; không sửa bản PUBLISHED hoặc tái sử dụng xác nhận của hash cũ. File này không thay bước duyệt độc lập của hệ thống.
