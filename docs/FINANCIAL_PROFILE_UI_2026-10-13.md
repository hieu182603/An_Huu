# Hồ sơ tài chính riêng — 13/10/2026

Theo yêu cầu: bỏ nút Hồ sơ tài chính ở đầu Tổng quan; mở hồ sơ bằng thẻ Độ hoàn thiện hồ sơ ở thanh bên; trang hồ sơ chỉ chứa dữ liệu tài chính, đánh dấu mục thiếu và cho chỉnh sửa dữ liệu đã khai.

- `/user/account` và `?tab=profile` mở FinancialProfilePage. Trang giữ khung điều hướng chung, không hiển thị ảnh đại diện, email, đổi mật khẩu, thông báo hay xuất báo cáo. Các luồng tài khoản qua menu ảnh đại diện và đường dẫn settings/reports cũ vẫn hoạt động.
- Thẻ tiến độ là liên kết, dùng được bằng bàn phím cả khi thu gọn menu. Checklist của hồ sơ chi tiết mở và cuộn tới phần cần điền; trạng thái thiếu dùng chữ, biểu tượng và màu đỏ.
- Tiến độ V2 được tính từ cùng chín mục với checklist, kiểm tra cả giá trị UNKNOWN bên trong các khoản. Vì vậy hồ sơ local hiện có 78% thay vì 89%: khoản nợ còn thông tin chưa xác nhận và lương hưu chưa khai. Đây là thay đổi cách nhận diện thiếu, không phải xóa dữ liệu.
- Không có hồ sơ thì hiển thị 0% và liên kết khai báo. Số 0 đã nhập và xác nhận không áp dụng có lý do là thông tin hợp lệ.
- Hồ sơ V2 mở đúng biểu mẫu chi tiết; không cho lưu bằng biểu mẫu tổng hợp cũ vì thao tác đó có thể dựng lại và làm mất các khoản chi tiết. Giữ nguyên chuỗi tiền, ID và dữ liệu không sửa; API vẫn dùng expectedRevision.
- Chọn lương hưu UNKNOWN không bị nhầm với KNOWN, và không tự điền mức lương hưu 5 triệu. Giá trị chưa khai không hiển thị giả thành 0. Ô số cho phép số thập phân; máy chủ tiếp tục kiểm tra quy tắc dữ liệu.
- Khoản vay có liên kết tới Khoản vay & Nợ để sửa hợp đồng và lịch trả nợ trong luồng chuyên biệt. Các biểu mẫu khác lưu trực tiếp trong hồ sơ.

## Xác minh

- Frontend build và typecheck thành công.
- `financial-profile-completion.spec.ts` + `account-api.spec.ts`: 8 bài kiểm thử trình duyệt, bao gồm lưu/tải lại, bảo toàn dữ liệu, xung đột 409, số 0, UNKNOWN, màn hình nhỏ và bàn phím.
- Đăng nhập thực tế `user@anhuu.test` với backend và DB local trong transaction: mở hồ sơ, sửa tháng sinh, lưu API thành công, xác nhận DB, tải lại; giữ nguyên thu nhập, chi tiêu, tài sản, nợ và lương hưu. Không có lỗi runtime. Rollback và fingerprint DB xác nhận không để lại thay đổi thử nghiệm.
- Log: `artifacts/financial-profile-tests.log`, `artifacts/financial-profile-local-tests.log`, `artifacts/financial-profile-build.log`.
- Ảnh: `artifacts/financial-profile-local-desktop.png`, `artifacts/financial-profile-desktop.png`, `artifacts/financial-profile-mobile.png`.
- Bản preview kiểm thử riêng; không dừng máy chủ đang dùng, không gọi nhà cung cấp AI bên ngoài.

## Chỉnh chi tiết biểu mẫu và thẻ thanh bên

- Các ô tháng hiển thị `mm/yyyy`, ngày hiển thị `dd/mm/yyyy`; có thể nhập trực tiếp hoặc chọn lịch. Kiểm tra ngày thực tế (ví dụ 31/02 bị chặn); API vẫn nhận ISO.
- Thu nhập, chi tiêu, tài sản, lương hưu và lịch điều chỉnh dùng dấu chấm phân nhóm, dấu phẩy thập phân trong tiếng Việt và nhãn VND. Xử lý bằng chuỗi để không làm tròn số tiền lớn; ô trống giữ trạng thái chưa khai. Ô tỷ lệ và số năm không bị định dạng như tiền.
- Bỏ khoảng đệm lặp của grid/field, thêm padding cho thẻ tài sản và lương hưu, căn hàng thu/chi và chuyển về một cột trên điện thoại. Đổi “Thanh khoản” thành “Khả năng đổi thành tiền”.
- Thẻ thanh bên có tiêu đề “Hồ sơ tài chính”, tiến độ và phần hành động sáng “Chỉnh sửa hồ sơ”; toàn thẻ vẫn là một liên kết dùng được bằng bàn phím.
- Build thành công; 10 bài kiểm thử account/profile đạt, gồm định dạng ngày, lịch, số tiền thập phân lớn, lưu/tải lại và năm tab ở 1366px/390px. Log: `artifacts/financial-profile-fields-tests.log`, `artifacts/financial-profile-fields-build.log`.
- Đăng nhập local, lưu tiền `8.000.001,25` qua API thành `8000001.25`, tải lại đúng và xác minh rollback DB: `artifacts/financial-profile-fields-local.log`. Ảnh từng tab: `artifacts/profile-tab-*-1366.png`, `artifacts/profile-tab-*-390.png`; thẻ mới: `artifacts/profile-entry-redesign.png`.
