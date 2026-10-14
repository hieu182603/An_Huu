# Tài sản trên trang Tổng quan

- Thay biểu đồ vòng và tổng lặp lại bằng một tổng giá trị nổi bật, danh sách nhóm tài sản xếp theo giá trị giảm dần và thanh tỷ lệ ngay dưới từng nhóm.
- Tên mục là “Tài sản của bạn”; giải thích rõ tổng giá trị đã khai chưa trừ nợ. Mỗi nhóm có tên, số tiền, tỷ lệ bằng chữ/số; màu chỉ hỗ trợ nhận diện.
- Nhóm giá trị 0 không có thanh tỷ lệ rỗng. Tổng 0 có thông báo riêng. Dữ liệu UNKNOWN không bị hiển thị như tổng 0 hoặc phân bổ đã biết; có liên kết bổ sung hồ sơ.
- CSS giới hạn ở `.asset-overview` và các lớp con; màn hình hẹp đặt số tiền dưới tên để không chen chữ. Không thay đổi công thức, dữ liệu hay API.
- Build thành công. Hai bài Playwright đạt, bao gồm 5 tỷ/60%/40%, thứ tự nhóm, các nhóm 0, UNKNOWN, và bố cục 1920/1366/390px. Ảnh `artifacts/dashboard-assets-desktop.png`, `artifacts/dashboard-assets-1366.png`, `artifacts/dashboard-assets-390.png`.
- Typecheck lần cuối thành công. Lần đầu bắt gặp các file ngoài phạm vi đang chỉnh dở; không can thiệp các file đó.
