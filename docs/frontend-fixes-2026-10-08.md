# Sửa frontend sau audit — 08/10/2026

Phạm vi: các lỗi frontend trong `feature-completion-audit-2026-10-08.md`, giữ backend và dữ liệu thật nguyên trạng. Áp dụng ui-ux-pro-max cho nhãn điều khiển, thông báo lỗi có focus, biểu mẫu theo kích thước màn hình và trạng thái request; giữ hệ thống màu/giao diện hiện có.

## Đã sửa

- **BHXH Nhà nước:** gửi `caseDetails` cùng `stateSalaryCase`; nhập căn cứ hưởng, ngày chấm dứt việc làm, tháng ngừng đóng và ngày đề nghị hưởng. Không tự đặt tháng tham gia đầu tiên.
- **Đóng trước/đóng bù:** người dùng nhập ngày đăng ký/ngày nộp tiền/tháng đầu kỳ riêng với ngày hưởng; không còn `benefitRequestDate: null` cố định hay lấy tháng hưởng làm tháng đầu kỳ. Trạng thái xác nhận mặc định HYPOTHETICAL, người dùng chọn DOCUMENTED khi có hồ sơ.
- **Đầu vào Nhà nước mở rộng:** nhập nhiều giai đoạn nghề nặng nhọc và cửa sổ lương; khai thang lương chuyển đổi trước 10/2004 và có/không/chưa rõ phụ cấp thâm niên theo tháng. Chọn thai sản bằng tên dễ hiểu, code tương ứng tự xác định theo tháng từ ba giai đoạn đã được backend hỗ trợ; trước 2007 báo cần rà soát.
- **Tiền:** giữ nguyên chuỗi căn cứ đóng, kiểm tối đa hai chữ số thập phân, bỏ `Math.round(Number(...))` trước khi gửi.
- **Chứng từ:** `EvidenceEditor` dùng tên/số hiệu, ngày xác nhận, nội dung trích dẫn hoặc file gốc. File chỉ được đọc/hash trên máy, không upload file hay đoạn trích. Bỏ tên/hồ sơ tự dựng và hash lặp a/b/c/d/e trong các form vay/tài sản; hash thật từ nội dung/file. Không có Web Crypto thì báo lỗi và chặn thao tác, không tạo hash thay thế. Dữ liệu khai báo không tự được coi là xác minh pháp lý.
- **Tài sản hoãn góp:** tải sổ tháng đã lưu, yêu cầu MATCHED, gửi revision thực tế; báo tải/lỗi/tải lại. Đổi tháng/tài khoản hoặc reload làm mất hiệu lực preview cũ. Reload actual cho cả tài sản và refinance bỏ cache để đọc được revision mới ngay.
- **Vòng đời form:** thay bất kỳ đầu vào ước tính/căn cứ nào hủy preview cũ; bỏ qua response đến muộn. Lịch sử/rules/records có chặn callback sau đổi phiên/đóng form. Chứng từ và đầu vào nhạy cảm được xóa khi đổi tài khoản.
- **Khả năng sử dụng:** nhãn BHXH và các trường tài sản được liên kết với input; có lỗi trong modal, focus sau submit lỗi; ô nhập đủ rộng, xuống dòng trên điện thoại. Bổ sung CSS có phạm vi riêng, không đổi toàn bộ theme.

## Kiểm chứng

- Typecheck và build frontend/prerender 5 trang đạt. Không còn cảnh báo import Node crypto vào browser; cảnh báo bundle lớn vẫn có.
- `test:assets`: **59/59 đạt**, gồm SHA-256 đúng bytes và chặn khi crypto không khả dụng.
- `insurance-completion.spec.ts`: browser lấy payload từ form thật; schema và engine backend chạy cục bộ trên corpus/fixture. Ba ca Nhà nước/đóng trước/nghề nặng nhọc phải trả ELIGIBLE; nhánh nghề nặng nhọc đối chiếu 8.602.000 từ golden có sẵn. Kiểm thiếu căn cứ không gửi request, sửa form vô hiệu preview và response đến muộn không được khôi phục preview.
- Lịch đóng kiểm chuỗi `90071992547409.91`, mã thai sản theo tháng, thang ND204 và cờ phụ cấp được truyền đúng; không dùng fixture này như tiền/hồ sơ người thật.
- `asset-actual-revision.spec.ts`: revision 7 → tải lỗi/chặn → tải lại revision 9; command dùng revision mới, không nhân đôi nguồn.
- Đã kiểm file cục bộ và ảnh form tại 390/768/1440 px (`frontend/.cache/insurance-fixes-*.png`).
- Bộ browser cuối **49/49 đạt, 0 skipped**, 2,8 phút: các ca trên, auth/account, FE-11, preview/refinance và rà trang 4 viewport. Bằng chứng giữ riêng tại `backend/.tmp/frontend-fixes-browser-20261008.json`.

Lệnh browser từ `backend`: `$env:T12_SPEC='{insurance-completion,asset-actual-revision,fe11-*,refinance-actual-payment,source-preview-lifecycle,source-reforecast,ui-audit-fixes,auth-api,account-api,page-audit}.spec.ts'; node scripts/verify-browser.cjs`. Kiểm nền từ frontend: `npm run typecheck`, `npm run test:assets`, `npm run build`.

Hai kỳ vọng test cũ đã được sửa theo hành vi chủ đích: `/verify` chuyển `/register`; đóng OTP trả focus ô email để sửa địa chỉ. Vẫn kiểm URL đích và vị trí focus, không bỏ assertion.

Các lượt kiểm trung gian phát hiện thiếu liên kết label và việc reload đọc cache; đã sửa runtime rồi chạy lại. Các ca mới dùng backend engine cục bộ cho BHXH; HTTP/browser vẫn mock API, không phải DB integration hoặc production acceptance.

## Phần còn lại

Không đóng toàn bộ FE-11: vẫn cần nghiệm thu đủ mọi nhánh loan/asset lifecycle, report/CSV từng version, 422 theo trường, DB concurrency và dịch vụ thật. Các nhánh BHXH backend chưa hỗ trợ vẫn giữ trạng thái thiếu dữ liệu/cần rà soát. Chưa nạp `seed-datafull.sql`, chưa công bố luật/cấu hình/knowledge và chưa triển khai production.
