# Đồng bộ hồ sơ và số liệu kế hoạch

## Hành vi đã sửa

- Tổng quan, Mục tiêu và Kế hoạch dùng chung kết quả xem trước trong `RetirementPlanContext`, thay cho việc mỗi trang tải báo cáo của phiên bản đã lưu rồi trộn với hồ sơ mới.
- Khi phiên bản hồ sơ hoặc lựa chọn nháp thay đổi, tự gọi API tính lại sau 350 ms. Chỉ nhận phản hồi khớp tài khoản, phiên bản kế hoạch, phiên bản hồ sơ và đầu vào hiện tại; phản hồi cũ không ghi đè lần sửa mới.
- Trong lúc tính lại, khi lỗi hoặc thiếu thông tin, không trình bày số liệu phiên bản cũ như số liệu đã cập nhật. Có trạng thái cập nhật, thử lại và đường dẫn bổ sung thông tin.
- Ngày nghỉ hưu đã lưu từ trang Mục tiêu không còn được gửi như một giả định. Với hồ sơ mới, bản xem trước theo ngày nghỉ hưu trong hồ sơ; ngày mô phỏng được chọn rõ ràng trong bản nháp vẫn được giữ. Giá trị tài sản mô phỏng và các lựa chọn kế hoạch khác được giữ.
- Mô phỏng cũng loại bỏ giả định ngày nghỉ hưu trùng hồ sơ và không tái sử dụng kết quả cũ khi phiên bản hồ sơ đã thay đổi.
- Bỏ banner yêu cầu tự tính lại hồ sơ trên ba trang. Giải thích cách tính được thu gọn thành mục mở rộng. Thiếu hụt thu chi vẫn hiện trong số tiền và mục xem chi tiết, không sửa dữ liệu để làm biến mất thiếu hụt.

## Ranh giới dữ liệu

Đây là tự cập nhật **bản xem trước**, không tự tạo hoặc áp dụng phiên bản chính thức. Lịch sử đã lưu giữ nguyên; người dùng vẫn chọn lưu/áp dụng phương án trên trang Kế hoạch. Các luồng đọc phiên bản chính thức, gồm hội thoại AI theo kế hoạch đã lưu, tiếp tục dùng phiên bản đó.

Kế hoạch có số dư thực tế không được tự chuyển thành phép tính từ đầu. Luồng này giữ kết quả đã ghi và dẫn người dùng sang Theo dõi thực tế để cập nhật đúng số dư.

## Kiểm chứng đã chạy

- `npm run typecheck`: đạt.
- `npm run build`: đạt.
- Playwright `user-plan-journey.spec.ts` và `dashboard-assets.spec.ts`: 18/18 đạt, gồm chuyển trang, lưu/áp dụng/reload, lỗi và thiếu dữ liệu, phản hồi đến muộn, giữ giả định tài sản, kế hoạch từ số dư thực tế và bố cục màn hình nhỏ.
- Đăng nhập tài khoản test với backend và PostgreSQL local trong transaction rollback: lưu thay đổi tháng nghỉ hưu, nhận kết quả `READY` cho phiên bản hồ sơ mới, xác nhận ba trang dùng trạng thái đồng bộ và không còn banner hồ sơ cũ. Không có lỗi runtime trên trình duyệt. Đối chiếu dấu vân tay dữ liệu trước/sau rollback đạt.
- Log kiểm thử: `artifacts/profile-sync-final-tests.log`; ảnh kiểm tra local: `artifacts/profile-sync-local.png`.

Không thay đổi schema hoặc công thức backend trong phần việc này. Không triển khai lên môi trường ngoài local.
