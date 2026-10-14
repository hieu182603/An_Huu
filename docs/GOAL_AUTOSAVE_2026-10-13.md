# Tự động lưu mục tiêu nghỉ hưu

- Bỏ nút “Giữ thay đổi để xem kế hoạch”; khu vực hành động chỉ còn “Xem trước kế hoạch”.
- Tự lưu sau 800 ms ngừng chỉnh sửa; không ghi khi mới mở trang. Hiển thị chờ lưu, đang lưu, đã lưu hoặc chưa lưu. Validation tự động không giật focus khỏi ô đang nhập.
- Biểu mẫu vẫn sửa được trong khi lưu; thay đổi tiếp theo được gửi sau yêu cầu đang chạy. Lỗi không tạo vòng lặp retry; chỉnh sửa tiếp hoặc bấm nút xem trước để thử lại. Xem trước kiểm tra/lưu giá trị mới nhất trước khi điều hướng.
- Giữ nguyên hợp đồng dữ liệu: tháng nghỉ hưu lưu bằng PATCH hồ sơ với revision; chi tiêu/endMonth/whatIf lưu bản nháp trong sessionStorage theo user. Không tự tạo hoặc áp dụng phiên bản kế hoạch. UI mô tả rõ phạm vi lưu.
- Bản nháp khôi phục sau reload trong cùng tab; xóa khi đăng xuất/đổi tài khoản, chọn kế hoạch khác hoặc áp dụng phiên bản.
- Kiểm tra TypeScript và build đạt. Năm kiểm thử trình duyệt đạt: lưu rồi áp dụng kế hoạch; tự lưu và reload; sửa trong lúc request chậm và phục hồi lỗi 409; lựa chọn đầu tư chuyển sang kế hoạch; kế hoạch mới không tự suy diễn khoản góp.
- Log: `artifacts/goal-autosave-build.log`, `artifacts/goal-autosave-tests.log`. Ảnh: `artifacts/goal-autosave-summary.png`. API fixture trên preview riêng; không thay đổi database trong lượt này.
