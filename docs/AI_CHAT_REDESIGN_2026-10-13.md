# Tinh chỉnh cụm công cụ kế hoạch và lịch sử

Cụm góc phải dùng hai nút cùng chiều cao 44px, cùng đường viền và bo góc. Kế hoạch hiển thị một dòng **Kế hoạch nghỉ hưu · Bản N** (số bản là nhãn nhỏ), mô tả mục đích chuyển vào tooltip và nội dung hộp thoại. Nút bên phải đổi thành **Lịch sử chat**. Bảng lịch sử vẫn trượt trong vùng AI như trước. Build đạt, 7 kiểm thử liên quan đạt; đã xem ảnh desktop và mobile. Ảnh desktop: `artifacts/ai-completion/chat-toolbar-1366.png`.

---

# Cập nhật: nền trắng, bảng lịch sử nằm trong vùng chat

- Nền trang AI dùng trắng hoàn toàn `#ffffff`.
- Thứ tự góc phải: **Kế hoạch nghỉ hưu** → **Hội thoại**. Nhãn phụ ghi rõ **Dùng để trả lời · bản N**, hoặc chưa có kế hoạch áp dụng.
- Thay Drawer portal toàn màn hình bằng `aside` trong `.ai-chat-body`, nằm dưới thanh công cụ AI. Bảng chỉ phủ bên phải nội dung chat; không có backdrop toàn trang, không khóa header/sidebar chính.
- Mở/đóng trượt 240ms và thay đổi độ trong suốt 180ms; đảo chiều được khi bấm nhanh. Tôn trọng `prefers-reduced-motion`. Khi đóng, bảng có `inert` và `aria-hidden`, không nhận Tab.
- Nút Hội thoại bật/tắt bảng; nút X và Escape trong bảng đóng bảng và trả focus về nút mở. Tạo/mở hội thoại giữ nguyên API thật. Quyền riêng tư, xóa và mô phỏng vẫn dùng hộp xác nhận tương ứng.
- Ảnh hiện tại: `artifacts/ai-completion/chat-contained-1366.png`, `chat-contained-history-1366.png`, `chat-contained-1920.png`, `chat-contained-mobile.png`. Kiểm thử bổ sung giới hạn bảng trong vùng chat, thứ tự nút, nền trắng, trạng thái giảm chuyển động và đóng/mở liên tiếp.

Kiểm chứng bản mới: typecheck và build đạt, 38 bài Playwright đạt. Đã kiểm tra ảnh desktop và giới hạn panel trong vùng AI.

Các mục dưới đây là lịch sử; quyết định dùng Drawer phủ toàn màn hình đã được thay thế.

---

# Cập nhật theo yêu cầu giữ trang AI trong web — 13/10/2026

Bản hiện tại thay thế quyết định dùng trang chat toàn màn hình ở lần 2 bên dưới:

- Giữ nguyên sidebar, topbar, menu tài khoản và điều hướng của UserLayout khi chọn tab Trợ lý AI.
- Giữ giao diện chat vừa thiết kế, nằm trong vùng nội dung của dashboard.
- Lịch sử và nút tạo cuộc trò chuyện mới mặc định ẩn. Nút **Hội thoại** mở Drawer; đóng bằng nút X, Escape hoặc vùng ngoài bảng. Chọn một hội thoại hoặc tạo hội thoại mới tự đóng bảng.
- Mở/đóng bảng không xóa bản nháp, không tạo hội thoại mới và không thay đổi tin nhắn hiện tại. Quản lý lịch sử và quyền riêng tư tiếp tục dùng chức năng có sẵn.
- Tính chiều cao theo phần còn lại dưới topbar và phía trên menu mobile, không chuyển sang route/shell toàn màn hình riêng.

Kiểm chứng bản nhúng: typecheck và production build đạt; 36 bài Playwright đạt.

Mã thay đổi: `UserLayout.tsx`, `AIAssistantPage.tsx`, `ai-assistant.css`. Playwright kiểm tra lại khung dashboard, trạng thái mặc định ẩn, mở/đóng, giữ bản nháp và các luồng AI hiện có. Ảnh bản này: `artifacts/ai-completion/chat-embedded-1366.png`, `chat-embedded-1920.png`, `chat-embedded-history-1366.png`, `chat-embedded-mobile.png`. Log: `chat-embedded-build.log`, `chat-embedded-tests.log`.

---

## Lịch sử: thiết kế lần 2 (phần khung toàn màn hình đã được thay thế)

# Trang trò chuyện An Hưu — thiết kế lần 2, 13/10/2026

Bản này thay thế bố cục lần 1 theo phản hồi của người dùng: hai thanh đầu trang quá cao, gợi ý bị cắt và ô nhập xa lời chào. Tham khảo cách tổ chức chat/lịch sử của ChatGPT và Claude, giữ thương hiệu An Hưu và chỉ dùng tính năng đã có API.

## Bố cục đã triển khai

- Route `/user/assistant` dùng không gian riêng toàn chiều cao cửa sổ. Không lồng sidebar và topbar dashboard; có đường quay về tổng quan ở cột trái và menu mobile.
- Desktop: lịch sử thật ở cột trái 272px (248px ở màn hình nhỏ hơn), tạo cuộc trò chuyện ở trên, quyền riêng tư ở dưới. Mở, đổi tên, xóa, tải thêm và xóa toàn bộ vẫn dùng API.
- Màn hình mới: lời chào, ô nhập và ba gợi ý gọn nằm cùng một nhóm ở giữa. Gợi ý chỉ điền bản nháp, không tự gửi. Không còn vùng cuộn riêng cắt các thẻ.
- Có hội thoại: nội dung cuộn trong vùng chat, ô nhập ở đáy. Câu hỏi và câu trả lời phân biệt rõ; không lặp facts thành thẻ. Tài liệu chỉ hiện khi có nguồn thật.
- Nút kế hoạch trên góc phải mở thông tin phiên bản, đường xem/lập kế hoạch và phép thử thay đổi thật. Không có thanh kế hoạch lớn chiếm diện tích thường trực.
- Màu nền ấm, xanh dịu, chữ tiếng Việt dùng font hiện có. Không thêm model selector, micro, upload, trạng thái trực tuyến giả hay giả lập streaming.
- Mobile: lịch sử mở trong Drawer; vẫn vào được quyền riêng tư và tổng quan. Nút gửi có chiều cao 48px; màn hình thấp cuộn bên trong workspace.

## Mã nguồn

`frontend/src/pages/AIAssistantPage.tsx`, `frontend/src/pages/ai-assistant.css`, `frontend/src/pages/UserLayout.tsx`, `frontend/tests/assistant-detail-fixes.spec.ts`.

Giữ logic request epoch, idempotency, revision, consent, xuất JSON, chỉnh câu hỏi, lưu lịch sử 30 ngày và mô phỏng từ lần hoàn thiện AI. Không thay cấu hình provider hay dữ liệu nghiệp vụ.

## Kiểm chứng

- TypeScript và production build/prerender đạt.
- 36 bài Playwright đạt trên bản dựng cuối, kiểm tra hợp đồng gửi câu hỏi, quyền riêng tư, lỗi/thử lại, phản hồi đến muộn, mở/đổi tên/xóa hội thoại, mô phỏng và bố cục. Kích thước: 1920×850, 1366×768, 1440×1000, 768×1024, 390×844, 390×400.
- Test đo vị trí để đảm bảo lời chào sát ô nhập, gợi ý nằm trong viewport desktop, và ô nhập chuyển xuống đáy khi có tin nhắn; kiểm tra Drawer bằng bàn phím và quyền riêng tư mobile.
- Đăng nhập user/admin local và gọi backend/PostgreSQL thật: 13 kiểm tra đạt (giải thích, mô phỏng, lịch sử, xuất, sửa, xóa, quản lý nguồn). Không lỗi JavaScript; transaction rollback xác minh fingerprint dữ liệu khớp trước/sau. Dùng `AI_PROVIDER=none`, không gửi dữ liệu tài khoản ra ngoài, không đổi cấu hình web đang chạy.
- Sau kiểm thử DB chỉ sửa font, màu câu hỏi và accessible label của nút tải; các luồng nghiệp vụ giữ nguyên.

Ảnh cuối dùng dữ liệu giả lập: `artifacts/ai-completion/chat-workspace-1920.png`, `chat-workspace-1366.png`, `chat-workspace-answer-1920.png`, `chat-workspace-mobile.png`. Ảnh tài khoản thật trước bước chỉnh font: `user-ai-redesign-empty.png`, `user-ai-redesign-answer.png`. Log build/test: `chat-workspace-build.log`, `chat-workspace-tests.log`.

Tham khảo: https://help.openai.com/en/articles/6825453-chatgpt-release-notes và https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings . Công cụ tìm kiếm agent-reach không kết nối được Exa; dùng công cụ web tích hợp để tra nguồn.
