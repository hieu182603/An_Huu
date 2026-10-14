# Kiểm tra kết quả phân tích trả nợ

## Nguyên nhân và thay đổi

Frontend khai báo và đọc sai cấu trúc API nợ: tỷ lệ trả nợ nằm ở `rows[].pressure.ratioPercent`, dòng tiền sau dự phòng ở `rows[].availableForRetirement`, ngày hết nợ và tháng thiếu tiền ở `totals`. Các trường cũ đọc trực tiếp từ dòng hoặc kết quả khiến số liệu bị hiện thiếu ngay cả khi backend đã tính.

- Sửa DTO và giao diện theo hợp đồng API đang chạy. Phân biệt `CALCULATED`, `HORIZON_LIMIT`, dữ liệu thiếu và phạm vi so sánh `FULL_TERM` / `SAME_HORIZON_ONLY` / `UNAVAILABLE`.
- Không thay tỷ lệ theo hợp đồng bằng phép cộng tiền trả tự khai báo. Không dùng trạng thái xanh khi dòng tiền chưa biết; không suy luận không thiếu tiền từ một ngày thiếu hụt rỗng nếu backend đánh giá dòng tiền chưa đầy đủ.
- Thay phần hiển thị cũ bằng bốn chỉ số dễ hiểu và các phương án có cùng cách trình bày. Bỏ nhãn mặc định “tiết kiệm tối đa” / “tối ưu toán học”, dấu cộng trước giá trị chưa biết và cách gọi thiếu thu chi là cạn toàn bộ tài sản.
- Phí trả trước khiến chi phí tăng được hiển thị là “Lãi và phí tăng thêm”. Với kỳ phân tích ngắn, hiện dư nợ cuối kỳ và ghi rõ chưa trả hết trong kỳ, không tự đoán ngày hết nợ.
- Dữ liệu thiếu được giải thích theo mã lỗi và tên khoản vay; không dựng các thẻ so sánh rỗng như kết quả đã tính.
- Thay hai ô ngân sách bằng ô tiền dùng chuỗi thập phân; kiểm tra giới hạn API trước khi gửi, không chuyển tiền qua số dấu phẩy động khi gửi yêu cầu.
- Người dùng sửa ngân sách, kỳ phân tích hoặc khoản ưu tiên rồi bấm **Tính lại**. Không gọi API hoặc lưu hồ sơ theo từng phím; kết quả trước vẫn hiển thị trong lúc chờ và được đánh dấu nếu thông số đã đổi. Làm mới tự động khi hồ sơ đã lưu thay đổi. Có nút thử lại khi lỗi.
- Gợi ý tiền luôn hiện, hỗ trợ chuột/bàn phím; bỏ chặn blur khiến ô tiền giữ giá trị cũ. Các ô cùng chiều cao và thẳng hàng.
- Thêm form tạo/sửa khoản vay: ngày xác nhận dư nợ, tháng bắt đầu và tháng kết thúc (có thể để trống). Kiểm tra ngày hợp lệ và thứ tự tháng, giữ nguyên hợp đồng, tỷ lệ phân bổ và trách nhiệm hiện có khi sửa. Không tự xác nhận chứng từ trách nhiệm cho khoản vay mới. Ngày dư nợ và tháng kết thúc của hợp đồng đã có lịch được hiển thị chỉ đọc để tránh lệch lịch hợp đồng.
- CSS ô ngày chuyển về component dùng chung để không phụ thuộc việc đã mở trang hồ sơ hay chưa.

## Đã kiểm chứng

- Typecheck frontend và build đạt.
- 8 ca Playwright đạt: gợi ý tiền/không gọi API khi gõ/căn hàng; nhập ngày sai, lưu và mở lại ngày khoản vay; kết quả từ bộ tính backend; thiếu hợp đồng/thu chi; lỗi và sửa thông số trong khi chờ; phí trả trước; kỳ phân tích ngắn; chuyển ngân sách sang bản nháp. Các ca dùng fixture, không dùng database.
- Đăng nhập tài khoản test vào backend/PostgreSQL local trong transaction rollback: không gọi tính toán lúc gõ, API tính lại thành công khi bấm nút; sửa tháng kết thúc khoản vay qua API thật và xác nhận sau reload. Không lỗi runtime. Đối chiếu dấu vân tay dữ liệu trước/sau rollback đạt.
- Ảnh kiểm tra: `artifacts/debt-results-ready.png`, `artifacts/debt-results-incomplete.png`, `artifacts/debt-results-local.png`.

## Giới hạn được xác nhận

Hồ sơ tài khoản local hiện thiếu dữ liệu hợp đồng nên chưa đủ điều kiện tính ngày hết nợ hoặc tiền tiết kiệm trả trước. Các kết quả đầy đủ được kiểm thử bằng fixture hợp đồng hợp lệ chạy qua bộ tính backend thật. Không tự tạo lịch gốc/lãi/phí cho tài khoản local; không sửa công thức backend, không thực hiện thanh toán và không triển khai ngoài local.
