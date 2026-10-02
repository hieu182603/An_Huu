# Ảnh khi triển khai Vercel

## Cách tổ chức ảnh

- Ảnh trang chủ và logo nằm trong `src/assets`, được import từ React. Vite xuất tên chứa mã nội dung, ví dụ `hero-lifestyle-Cu6wNehx.jpg`. Khi thay ảnh, mã thay đổi và trình duyệt tải URL mới.
- Tệp cần URL cố định vẫn có thể đặt trong `public`. Những ảnh này phải xác thực lại với máy chủ trước khi dùng bản lưu đệm.
- Không đưa tệp tham chiếu Git LFS chưa tải nội dung vào bản triển khai. Lệnh build tự kiểm tra `public` và `src/assets`, dừng nếu gặp tham chiếu LFS hoặc ảnh rỗng.

## Cấu hình Vercel

Cả cấu hình ở gốc dự án và trong `frontend` dùng cùng quy tắc:

- Trang chủ, bốn trang giới thiệu và ba bài viết được xuất HTML riêng khi build; các URL này được ánh xạ đến đúng tệp HTML để đọc được ngay cả khi không chạy JavaScript.
- Các đường dẫn tài khoản, quản trị và đường dẫn chưa xác định dùng `app-shell.html` để React Router xử lý. Tệp này có `noindex`, không chứa nội dung trang chủ.
- `/assets`, `/images` và đường dẫn kết thúc bằng phần mở rộng tệp không dùng quy tắc này. Tệp thiếu được Vercel xử lý như tài nguyên không tồn tại.
- `/assets/*` dùng cache lâu dài cho tệp có mã nội dung.
- Ảnh URL cố định dùng `max-age=0, must-revalidate`; không có hai quy tắc cache chồng lên ảnh trong `/assets`.

Cú pháp loại trừ trong rewrite theo [tài liệu cấu hình Vercel](https://vercel.com/docs/project-configuration/vercel-json#negative-lookahead).

## Kiểm tra trước khi triển khai

Chạy trong thư mục `frontend`:

```sh
npm run test:assets
npm run typecheck
npm run build
npx playwright test tests/assets.spec.ts
```

Khi đưa thay đổi lên Git, cần bao gồm cả ảnh chuyển sang `src/assets`, các import, script kiểm tra và hai tệp cấu hình Vercel. Không chỉ đưa các thay đổi mã nguồn lên mà bỏ qua tệp ảnh mới.

Sau khi triển khai, xác nhận trong trình duyệt:

1. Trang chủ hiển thị ba ảnh lớn và logo; URL ảnh bắt đầu bằng `/assets/` và có mã nội dung.
2. Mở trực tiếp `/user/explore` và tải lại trang vẫn hoạt động.
3. Một URL ảnh không tồn tại, ví dụ `/images/missing-check.jpg`, trả `404` thay vì `200` kèm trang HTML.
4. Ảnh `/assets/` trả đúng loại nội dung ảnh. Ảnh URL cố định như `/logo.png` có `Cache-Control: public, max-age=0, must-revalidate`.

Kiểm tra cấu hình ở máy phát triển không thay thế kiểm tra HTTP sau triển khai: Vite preview không áp dụng `vercel.json`.
