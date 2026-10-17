# Kế hoạch: Chế độ giải thích bằng Trợ lý AI (17/10/2026)

## 1. Mô tả chức năng

Người dùng đã đăng nhập bấm nút **"Trợ lý AI"** trên header để bật **chế độ giải thích**. Khi đang bật chế độ này, người dùng trỏ vào một **cụm từ khó hiểu** hoặc một **con số do hệ thống tính** rồi bấm (hoặc chạm). Một popup nhỏ hiện ngay cạnh con trỏ, cho biết nghĩa của cụm từ, hoặc công thức và các số liệu đầu vào của con số đó.

Phạm vi: chỉ các trang trong `UserLayout` (đã đăng nhập). Không áp dụng cho trang marketing công khai và chưa áp dụng cho trang admin.

## 2. Nguyên tắc bắt buộc

1. **Giải thích con số là tất định và do server cung cấp.** Công thức, giá trị đầu vào và nguồn giả định được backend dựng từ đúng kết quả engine đã tính (bản xem trước hoặc phiên bản kế hoạch đã lưu). Frontend không tự tính lại, và AI tạo sinh không được viết ra con số.
2. **Giá trị trong popup phải trùng với giá trị đang hiển thị.** Backend trả kèm giá trị, frontend so sánh; nếu lệch thì báo "số liệu đã thay đổi, hãy tải lại" thay vì hiện công thức sai.
3. **Thuật ngữ dùng bảng thuật ngữ có kiểm duyệt.** Nội dung soạn sẵn, có phiên bản, viết đơn giản cho người 35–55 tuổi, tiếng Việt có dấu, kèm bản tiếng Anh.
4. **AI chỉ là phương án dự phòng cho cụm từ không có trong bảng.** Gọi endpoint `POST /me/ai/explain` hiện có; phải có đồng ý dùng AI (consent) và giới hạn tần suất như hiện tại; luôn gắn nhãn "AI giải thích – tham khảo". Không gửi dữ liệu cá nhân ngoài những gì endpoint đó vốn đã dùng.
5. **Không đổi kết quả tính, không đổi hash hay snapshot của kế hoạch, không cần migration.**

## 3. Trải nghiệm

- **Bật/tắt:** bấm nút "Trợ lý AI" thì nút chuyển sang trạng thái đang bật, kèm dải thông báo "Chạm vào cụm từ hoặc con số để xem giải thích · Esc để thoát". Bấm lại nút hoặc nhấn Esc để tắt. Trang trò chuyện AI vẫn vào được từ menu bên trái và từ nút "Hỏi thêm" trong popup.
- **Khi đang bật:** các phần tử giải thích được có viền chấm và con trỏ dạng trợ giúp. Bấm vào thì popup hiện cạnh vị trí con trỏ, tự lật để không tràn khỏi màn hình. Trên mobile thì chạm.
- **Nội dung popup:**
  - Thuật ngữ: tiêu đề, nghĩa 1–3 câu, ví dụ ngắn nếu có, nút "Hỏi thêm Trợ lý AI".
  - Con số: tên chỉ số, giá trị, công thức bằng lời và ký hiệu, bảng đầu vào (nhãn, giá trị, nguồn), phiên bản giả định, giới hạn của mô hình.
  - Cụm từ không có trong bảng: tự động nhờ AI giải thích ngay khi bôi đen (đoạn dài hơn 300 ký tự mới cần bấm nút).
- **Hỗ trợ tiếp cận (a11y):** các phần tử giải thích được dùng Tab để đi tới, Enter để mở, Esc để đóng. Popup dùng `role="dialog"`, có `aria-labelledby`, trả focus về phần tử ban đầu khi đóng, và tôn trọng `prefers-reduced-motion`.

## 4. Backend (giai đoạn 1)

- Module mới `explanations`. Bộ đăng ký chỉ số (metric registry) liệt kê rõ: khóa chỉ số → nhãn, công thức, cách lấy từng đầu vào từ kết quả tính.
- Danh sách chỉ số v1 là các số đang hiển thị nổi bật:
  - `summary.atRetirement`: `requiredFund`, `projectedFund`, `fundingGap`, `coveragePercent`;
  - `requiredConstantMonthlyContribution`, `additionalMonthlyContribution`, `futureMonthlyExpense`, `initialRetirementCapital`;
  - tách vốn: `requiredEmergencyReserve`, `nearTermGoalsPresentValue`, `growthCapital`;
  - ràng buộc lỗ: mức lỗ khi có cú sốc;
  - thiếu hụt chi thiết yếu;
  - phí tư vấn.
- Endpoint `POST /me/explanations/metric` nhận `{ metricKey, source }`, trong đó `source` là:
  - `{ kind: "PLAN_VERSION", planId, versionId }`: đọc snapshot đã lưu, có kiểm tra quyền sở hữu; hoặc
  - `{ kind: "PREVIEW", input }`: chạy lại preview phía server từ hồ sơ và giả định đã ghim; không nhận số liệu do client gửi lên.
- Kết quả trả về: `{ metricKey, label, value, unit, formula, steps:[{label,value,unit,source}], assumptions:{version,sources}, notes, limitations }`. Nếu chỉ số không áp dụng thì trả `METRIC_NOT_AVAILABLE`.
- Có thể dùng thêm `GET /me/explanations/glossary` để phục vụ bảng thuật ngữ (có phiên bản), hoặc để bảng ở frontend; chọn một và ghi rõ trong hợp đồng.
- Test: mỗi chỉ số có test chứng minh `value` trùng đúng số trong kết quả tính, và các bước công thức tái tạo được giá trị đó (ví dụ PV, độ phủ). Thêm test quyền sở hữu, test không nhận số từ client, cập nhật OpenAPI, ghi hợp đồng vào mục 22 trong `docs/task-frontend.md`.

## 5. Frontend (giai đoạn 2)

- `ExplainModeProvider` đặt trong `UserLayout`; nút header thành nút bật/tắt; `Esc` để thoát; chuyển trang thì tắt chế độ.
- Component `<Explain term="..."/>` cho thuật ngữ và `<Explain metric="..." source={...}/>` cho con số. Gắn vào trang kế hoạch, dashboard, danh mục, mô phỏng và theo dõi. Ngoài chế độ giải thích, component không làm thay đổi giao diện hay hành vi bấm.
- Popup tự định vị (không thêm thư viện lớn): đặt theo tọa độ chuột, lật hoặc dịch để nằm trong màn hình, đóng khi bấm ra ngoài, cuộn hoặc đổi kích thước.
- Bảng thuật ngữ v1 (khoảng 25–40 mục) cho các cụm từ đang có trên các trang này, ví dụ: lạm phát, giá trị hiện tại, quỹ cần khi nghỉ hưu, độ phủ, vốn tăng trưởng, dự phòng, lộ trình giảm dần rủi ro, cú sốc thị trường, CVaR, tỷ lệ đủ tiền cho chi thiết yếu, tái cân bằng, TPCP, chi thiết yếu / tùy chọn, BHXH…
- Cụm từ không có trong bảng: bôi đen là tự động gọi `/me/ai/explain` (cập nhật 17/10 theo yêu cầu: không bắt người dùng bấm thêm; đoạn dài hơn 300 ký tự vẫn cần bấm nút). Xử lý đủ các trường hợp chưa đồng ý, đã đồng ý, vượt giới hạn tần suất và nhà cung cấp AI gián đoạn.
- Test: unit test cho phần định vị popup và bảng thuật ngữ; Playwright với API giả lập (bật/tắt, bấm thuật ngữ, bấm con số, giá trị lệch, chưa đồng ý dùng AI, bàn phím, mobile 375px, không ảnh hưởng khi chế độ tắt).

## 6. Nghiệm thu chung

- Backend: hai lần typecheck và toàn bộ vitest qua.
- Frontend: typecheck, `test:assets`, build và Playwright mới cùng các bộ hiện có đều qua.
- Không ghi DB production, không deploy, không commit. Người dùng tự review và commit.
