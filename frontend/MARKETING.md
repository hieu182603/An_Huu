# Website giới thiệu An Hưu

## Các trang công khai

| Trang | Đường dẫn |
| --- | --- |
| Trang chủ | `/` |
| Cách hoạt động | `/cach-hoat-dong` |
| Mô phỏng | `/mo-phong` |
| Trợ lý AI | `/tro-ly-ai` |
| Kiến thức | `/kien-thuc` |

Ba bài viết bên trong trang Kiến thức cũng có URL và HTML riêng. Liên kết neo cũ của bốn mục điều hướng được chuyển sang trang tương ứng. Menu có trạng thái hiện tại, hỗ trợ bàn phím và drawer trên thiết bị nhỏ.

## Thiết kế

- Hero theo ảnh tham chiếu: tiêu đề căn giữa, thẻ sản phẩm nổi, nền cột Three.js. Giữ navy `#10385b`, midnight `#0b2545`, jade `#008a75` và mint `#83d8c8` của thương hiệu.
- Sáu phần: hero, tính năng, hành trình, trợ lý, kiến thức, CTA. Footer cuối cùng dùng nền xanh nhạt, bố cục gọn, không dùng dòng thương hiệu khổng lồ.
- Tiêu đề trên nền tối dùng màu sáng rõ ràng, không phụ thuộc vào màu tiêu đề mặc định của ứng dụng.
- Three.js tải riêng, giới hạn pixel ratio và 30 fps, dừng ngoài màn hình/khi ẩn tab, giải phóng geometry/material/renderer khi rời trang. Điện thoại, chế độ giảm chuyển động, tiết kiệm dữ liệu và thiết bị không có WebGL dùng nền CSS.
- Phông chữ được lưu cùng ứng dụng. Ảnh marketing WebP là bản tối ưu từ ảnh gốc, không thay đổi ảnh của các trang tài khoản.
- Những con số hoặc cam kết chưa có bằng chứng đã được bỏ khỏi landing page. Hội thoại trợ lý trên website giới thiệu là ví dụ biên soạn sẵn, có nhãn minh họa. Mô phỏng dùng bộ tính hiện có và hiển thị rõ giả định.

## SEO và tên miền

Chạy `npm run build` trong `frontend` để xuất HTML tĩnh cho tám URL công khai, title/description riêng, Open Graph, Twitter metadata, JSON-LD và robots.txt. Trang tài khoản/quản trị/lỗi dùng `noindex`.

Hiện chưa có tên miền chính thức. Khi có, đặt `VITE_SITE_URL` thành origin thực (ví dụ định dạng `https://ten-mien-cua-ban.vn`) trong môi trường build rồi build lại. Khi đó hệ thống mới xuất canonical, các URL chia sẻ tuyệt đối và `sitemap.xml`. Không tự gắn tên miền giả. Gửi sitemap lên Search Console sau khi website được triển khai.

Cấu hình Vercel ở gốc và `frontend` đều ánh xạ các URL công khai vào HTML riêng. Preview của Vite dùng cùng các quy tắc để có thể kiểm tra không JavaScript tại máy.

## Kiểm tra

- `npm run typecheck`
- `npm run test:assets`
- `npm run test:marketing`

`test:marketing` gồm kiểm tra HTML/metadata và kiểm tra trình duyệt cho điều hướng, độ tương phản tiêu đề, kích thước màn hình, mô phỏng, hội thoại mẫu, reduced motion/WebGL fallback, ảnh, đăng nhập và các tuyến tài khoản/quản trị. Có thể đặt `MARKETING_BASE_URL` để chạy trên một preview đang mở thay vì khởi động server kiểm thử.

Ảnh chụp giao diện nằm trong `artifacts/marketing`; sáu ảnh tham chiếu do công cụ imagegen tích hợp tạo nằm trong `../deliverables/landing-redesign/references`. Đây là ảnh tham khảo thiết kế, không thay thế HTML của website.

Tài liệu đối chiếu: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Three.js resource cleanup](https://threejs.org/manual/pages/cleanup.html), [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
