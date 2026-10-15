# Đối chiếu landing page và tinh chỉnh demo

Nguồn khách hàng: https://an-huu-ke-hoach-ca-nhan.mym100595.chatgpt.site/#home

Đã đọc trang công khai và mã giao diện `app.js?v=8` ngày 15/10/2026. Chỉ dùng làm tham chiếu nội dung; không sửa trang của khách hàng.

## Những điểm được chọn để áp dụng

| Nội dung bản khách hàng | Điều chỉnh trong dự án |
| --- | --- |
| Bắt đầu từ cuộc sống mong muốn, kế hoạch vừa sức | Hero và các thẻ lợi ích nói rõ cần bao nhiêu, đủ đến đâu, làm gì từ tháng này. CTA chính mở demo không cần đăng nhập. |
| Xem kết quả và bước hành động cùng nhau | Demo hiển thị mức đáp ứng mục tiêu, số tiền cần góp mỗi tháng và nút thử khoản góp đó. Nếu nghỉ ngay, hiển thị thiếu vốn thay vì chia cho số tháng bằng 0. |
| Thay đổi kịch bản để so sánh | Bốn lựa chọn: nghỉ muộn hơn 5 năm, giảm mức chi 15%, lạm phát tăng 1 điểm %, lợi suất giảm 1,5 điểm %. Mỗi thẻ thể hiện chênh lệch với số liệu đang nhập. |
| Hiểu năm nhóm tài sản, lợi suất có giải thích | Bổ sung phần giải thích tiết kiệm, trái phiếu Chính phủ, cổ phiếu đa dạng hóa, vàng, bất động sản. Cho thay đổi tỷ trọng/lợi suất của bốn nhóm tài chính và chỉ áp dụng khi tổng tỷ trọng bằng 100%. |
| Không nhập nhằng tài sản với tiền có thể rút | Bất động sản trực tiếp được giải thích riêng; không đưa giá nhà vào quỹ rút chi tiêu. Nhắc tách dự phòng và mục tiêu gần hạn trước khi nhập vốn hưu trí. |
| Thử trước, hiểu giả định | Số liệu mẫu được gắn nhãn minh họa. Thay đổi demo không tự lưu thành hồ sơ. Không hứa rằng đăng ký sẽ tự bổ sung mọi giới hạn tính toán. |

## Phạm vi được giữ nguyên

- Không đổi CSS, bảng màu, font, ảnh, nền Three.js, phong cách thẻ/nút hay bố cục landing page hiện có.
- Giữ bộ tính hưu trí hữu hạn đến tuổi dự trù của dự án. Không chuyển sang mô hình dòng chi vĩnh viễn của trang khách hàng, vì sẽ thay đổi ý nghĩa và kết quả tính toán.
- Không đưa game, dữ liệu thị trường, giao dịch hay mô hình gia đình từ bản khách hàng vào demo công khai. Không giả lập các tính năng chưa được nối với dữ liệu thực.
- Phân bổ là phép thử lợi suất bình quân, chưa phải tối ưu danh mục hay đánh giá khả năng chịu rủi ro. Các con số mặc định là minh họa, không phải dữ liệu thị trường.

## Sửa các điểm ảnh hưởng độ tin cậy demo

- Liên kết chỉ có một tham số (lợi suất, vốn hoặc mức chi) vẫn được áp dụng; bỏ giá trị không hữu hạn.
- Đồng bộ giới hạn tuổi và giả định giữa ô nhập, thanh trượt và phép tính; hỗ trợ nghỉ ngay tại tuổi hiện tại.
- Nhập số được xác nhận khi rời ô hoặc nhấn Enter, tránh ép tuổi thành giá trị khác khi mới gõ chữ số đầu.
- Gắn nhãn truy cập cho thanh trượt, hỗ trợ bàn phím.
- Biểu đồ lấy mẫu từng năm và luôn có đúng mốc nghỉ hưu.
- Liên kết phân bổ từ landing page mở đúng phần demo.

## Kiểm chứng

Kiểm tra TypeScript, build/prerender và các ca trình duyệt trong `frontend/tests/marketing.spec.ts`: nhập số, lãi suất 0%, nghỉ ngay, tỷ trọng không đủ 100%, áp dụng/đặt lại, liên kết neo, bố cục desktop/mobile và màu hiện hữu.

Kết quả: TypeScript và build/prerender thành công; 8 kiểm thử bộ tính và 3 kiểm thử SEO đều qua. Lượt trình duyệt đầy đủ đạt 14/15, phát hiện sai số hiển thị lợi suất bình quân; sau khi sửa, 2 ca liên quan (áp dụng/đặt lại và liên kết phân bổ/responsive) đều qua trên bản build cuối. Hai kiểm thử cũ được cập nhật theo thư viện bài viết tải qua API, thay vì giả định bài tĩnh.

Ảnh kiểm chứng: `frontend/artifacts/marketing/demo-allocation-desktop.png` và `frontend/artifacts/marketing/demo-allocation-mobile.png`. Thay đổi ở mã nguồn cục bộ, chưa triển khai lên website đang chạy.
