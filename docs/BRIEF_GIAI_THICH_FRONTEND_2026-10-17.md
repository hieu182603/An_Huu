# Tài liệu yêu cầu: FRONTEND giai đoạn 2, "Chế độ giải thích bằng Trợ lý AI"

Repo: `E:\An_Huu`, phần React + Vite trong `frontend/`.

## Đọc trước và làm đúng theo

- `docs/KE_HOACH_CHE_DO_GIAI_THICH_AI_2026-10-17.md`, các mục 1, 2, 3, 5, 6.
- Hợp đồng backend ở mục 22 trong `docs/task-frontend.md`, gồm cả 22.1b về `detail` `SUMMARY`/`MONTHLY`.
- Backend đã xong và đã có test:
  - `POST /me/explanations/metric` và `GET /me/explanations/glossary`; code ở `backend/src/modules/explanations`, OpenAPI ở `backend/docs/explanations.openapi.yaml`.
  - Cụm từ không có trong bảng thuật ngữ dùng endpoint có sẵn `POST /me/ai/explain`.

## Việc cần làm

1. **Nút "Trợ lý AI" trên header** (`frontend/src/pages/UserLayout.tsx`, class `topbar-ai-pill`; hiện đang `navigate("/user/assistant")`):
   - Đổi thành nút bật/tắt chế độ giải thích, có `aria-pressed`.
   - Khi bật, hiện dải thông báo "Chạm vào cụm từ hoặc con số để xem giải thích · Esc để thoát", kèm liên kết mở trang trò chuyện AI.
   - Chuyển trang thì tắt chế độ. Chỉ áp dụng trong `UserLayout` (đã đăng nhập).
2. **`ExplainModeProvider` và component** `<Explain term=... />`, `<Explain metric=... source=... />`:
   - Khi chế độ tắt: không làm thay đổi giao diện hay hành vi bấm.
   - Khi chế độ bật: viền chấm và con trỏ dạng trợ giúp; mở bằng Tab rồi Enter, hoặc bấm.
3. **Popup:**
   - Tự định vị cạnh vị trí chuột hoặc điểm chạm; lật hoặc dịch để không tràn khỏi màn hình; không thêm thư viện lớn.
   - `role="dialog"`, có `aria-labelledby`.
   - Đóng khi nhấn Esc, bấm ra ngoài, cuộn hoặc đổi kích thước cửa sổ; trả focus về phần tử ban đầu; tôn trọng `prefers-reduced-motion`.
4. **Thuật ngữ:**
   - Lấy từ `GET /me/explanations/glossary` (có cache), hiển thị theo ngôn ngữ đang dùng.
   - Popup có nút "Hỏi thêm Trợ lý AI".
5. **Con số:**
   - Gọi `/me/explanations/metric` với `detail: "SUMMARY"`. `source` là `PREVIEW` (đúng input của bản xem trước đang hiển thị) hoặc `PLAN_VERSION` (kế hoạch đã lưu).
   - So `value` backend trả về với số đang hiển thị. Nếu lệch thì báo "số liệu đã thay đổi, hãy tải lại", không hiện công thức.
   - Nội dung hiển thị: nhãn, giá trị, công thức, bảng các bước (định dạng theo `unit`: VND, PERCENT, FACTOR, MONTHS, MONTH, PERIOD, TIMING), phiên bản giả định, `notes`, giới hạn của mô hình.
   - Nút "Xem chi tiết từng tháng": gọi lại với `detail: "MONTHLY"`, hiển thị trong một bảng có cuộn hoặc phân trang, đặt ngoài popup nhỏ.
   - Khi gặp `METRIC_NOT_AVAILABLE`, 429 hoặc lỗi khác: hiện thông điệp tiếng Việt. Không đổi null thành 0, không nhờ AI bịa công thức hay con số.
6. **Cụm từ không có trong bảng:**
   - (Cập nhật 17/10) Bôi đen là tự động giải thích: khớp bảng thuật ngữ thì hiện định nghĩa, không khớp thì tự gọi `/me/ai/explain`; đoạn dài hơn 300 ký tự mới cần bấm "Nhờ AI giải thích đoạn này".
   - Xử lý đủ các trường hợp: chưa đồng ý dùng AI (dẫn tới chỗ đồng ý hiện có), vượt giới hạn tần suất, nhà cung cấp AI gián đoạn.
   - Luôn gắn nhãn "AI giải thích – tham khảo".
7. **Gắn `<Explain>`** vào các số và thuật ngữ chính trên trang kế hoạch, dashboard, danh mục, mô phỏng và theo dõi, theo bảng vị trí ở mục 22.3.

## Ràng buộc bắt buộc

- Chỉ sửa `frontend/`; có thể ghi chú thêm vào `docs/task-frontend.md`.
- KHÔNG sửa `backend/`, KHÔNG ghi database, KHÔNG deploy, KHÔNG commit hay push.
- Thư mục đang có thay đổi chưa commit của luồng thiết kế lại trang kế hoạch (`RetirementPlanPage.tsx`, `retirement-plan.css`, `GuidedScenarios.tsx`, `guided-scenarios.css`, `tests/guided-planning.spec.ts`, `tests/plan-detail-fixes.spec.ts`) và của backend. Không revert, không ghi đè; nếu phải sửa cùng file thì chỉ thêm phần của mình.
- Không tự tính toán tài chính ở frontend, chỉ hiển thị số backend trả. Không gọi API giải thích trước khi người dùng bấm.
- Tiếng Việt có dấu, giữ song ngữ, giữ design system hiện có, đọc được trên mobile, lời giải thích đơn giản cho người 35–55 tuổi.

## Nghiệm thu trước khi báo xong (chạy trong `frontend/`)

- `npm run typecheck`, `npm run test:assets`, `npm run build` đều qua.
- Có unit test cho phần định vị popup.
- Playwright với API giả lập, gồm các trường hợp:
  - bật/tắt bằng nút và bằng Esc;
  - bấm thuật ngữ;
  - bấm con số (`SUMMARY`, và xem chi tiết `MONTHLY`);
  - giá trị lệch;
  - `METRIC_NOT_AVAILABLE`, 429, chưa đồng ý dùng AI;
  - thao tác bằng bàn phím;
  - mobile 375px;
  - không ảnh hưởng gì khi chế độ tắt.
- Chạy lại các bộ test hiện có: `guided-planning`, `onboarding-readability`, `portfolio-policy-v2`, `planning-contracts`, `plan-detail-fixes`.
- Cuối cùng liệt kê: file đã sửa, lệnh đã chạy và kết quả, chỗ hợp đồng backend mâu thuẫn hoặc còn thiếu, và những điểm còn chưa chắc.
