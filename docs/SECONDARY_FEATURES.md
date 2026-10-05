# Tiện ích triển khai trong lúc chờ chốt nghiệp vụ

> Cập nhật 03/10/2026: thư viện nội dung và bài đã lưu đã chuyển sang API/database qua KnowledgeLibraryApi; phần mô tả localStorage bên dưới là checkpoint lịch sử. Đã viết thêm tài khoản, quản lý người dùng, hỗ trợ, tư vấn, thông báo, vận hành và nhật ký. Xem [bàn giao mới nhất](SESSION_HANDOFF_2026_10_03.md) và [API tiện ích](../backend/docs/SECONDARY_API.md). Migration mới chưa áp dụng và đợt này chưa chạy test theo yêu cầu người dùng.

Ngày: 03/10/2026.

## Căn cứ và phạm vi

Đã đọc `AnHuu.xlsx` do người dùng cung cấp: sheet `Xác nhận`, các đề xuất P01–P36 tại A6:B46. Các ô xác nhận và ý kiến khách hàng ở cột C/D đang trống. Nội dung trong file là phương án đang lấy ý kiến, không phải các quy tắc đã được khách hàng phê duyệt.

Đợt này hoàn thiện tiện ích của trang `/user/explore`, dùng dữ liệu nội dung và các thành phần giao diện sẵn có. Không cần thay đổi API hoặc cơ sở dữ liệu.

## Đã triển khai

- Tìm bài viết theo tiêu đề, mô tả, nội dung và chủ đề. Hỗ trợ chữ có/không dấu, `đ/d`, chữ hoa/thường và nhiều từ khóa.
- Kết hợp tìm kiếm với bộ lọc chủ đề và bộ lọc bài đã lưu. Có số kết quả, trạng thái không tìm thấy và nút xóa bộ lọc.
- Lưu/bỏ lưu bài viết để đọc sau; giữ sau khi tải lại trang; tách danh sách theo ID tài khoản trong trình duyệt. Chỉ hiện bài vẫn đang được xuất bản.
- Mở bài trong hộp thoại dùng chung, hỗ trợ Escape, giữ focus trong hộp thoại và trả focus khi đóng. Nội dung giữ xuống dòng và hiển thị dưới dạng văn bản.
- Từ điển 12 thuật ngữ cơ bản, tìm theo tên, giải thích hoặc tên viết tắt. Thay đường dẫn từ điển sang AI bằng cửa sổ tra cứu tại chỗ.
- Nội dung quản trị sai cấu trúc được bỏ qua; lỗi đọc/lưu trình duyệt được thông báo, không báo lưu thành công khi ghi thất bại.

## Giới hạn hiện tại

- Bài đã lưu nằm trong localStorage, không đồng bộ thiết bị. Đăng nhập đã nối API ở đợt auth 03/10/2026; nội dung quản trị của thư viện vẫn dùng dữ liệu demo. Xem `AUTH_API_SETUP.md` về phạm vi xác thực.
- Các bài viết mẫu giữ nội dung minh họa, chưa được biên tập thành bài viết đầy đủ. Từ điển giải thích khái niệm, không thực hiện tính toán hay đề xuất danh mục.
- Không thay đổi phần sản phẩm đối tác hiện có. Việc phê duyệt nội dung, số liệu sản phẩm và chính sách phân phối vẫn cần được xử lý ở đợt nghiệp vụ phù hợp.

## Chờ phản hồi trước khi triển khai tiếp

| Nhóm | Mã khảo sát | Quyết định cần chốt |
| --- | --- | --- |
| Hồ sơ và đầu vào | P01–P06 | Phần sở hữu, thu nhập khả dụng, nhóm chi, lịch nợ, dữ liệu thiếu |
| Bộ tính hưu trí | P07–P19 | Kỳ tính, đơn vị tiền, thời điểm đóng/rút, công thức và cách hiển thị |
| Giả định và phiên bản | P20–P23 | Nguồn dữ liệu, bộ giả định được duyệt, giữ lịch sử |
| Tài sản, khoản vay, BHXH | P24–P29 | Quỹ ngoài hưu trí, tối ưu nợ, phạm vi ước tính BHXH |
| Rủi ro, theo dõi và AI | P30–P36 | Bộ câu hỏi rủi ro, phân bổ tài sản, snapshot, giới hạn AI và xử lý dữ liệu |

## Kiểm tra

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run build`
- Tại thư mục `frontend`: `npx playwright test tests/knowledge.spec.ts --reporter=line`

Bộ kiểm tra bao phủ tìm kiếm/lọc, lưu và bỏ lưu, tải lại trang, tách tài khoản, bài nháp, dữ liệu lỗi, lỗi ghi localStorage, thao tác bàn phím và bốn chiều rộng 1440/1024/768/390 px.
