# Kế hoạch sửa trang Phân bổ tài sản (sau audit 19/11/2026)

Nguồn: `AN_HUU_ALLOCATION_AUDIT.md`, các điểm đã kiểm lại từ phản biện của ChatGPT, và bằng chứng trong `docs/audit-2026-11-19/`.
Trạng thái: **P0, nhóm A và nhóm B (đối chiếu tài liệu thuật toán) đã sửa, chưa commit; còn nhóm C**. Không ghi DB, không deploy, không commit nếu chưa được yêu cầu.

Quy ước người làm:
- **BE**: backend, do phiên này làm.
- **FE**: frontend, mặc định ghi vào `docs/task-frontend.md` cho AI frontend.
- **ADMIN**: cần quyết định hoặc thao tác của admin hay chủ sản phẩm.

## Cập nhật 19/11

- **Nhóm A đã sửa** (chủ sản phẩm duyệt, chưa commit): A1 gợi ý điều chỉnh qua lượt gọi riêng `POST /me/retirement/risk/adjustments`; A2 chỉ cắt chi tiêu tùy chọn; A3 mô phỏng tái cân bằng theo ngưỡng lệch 5 điểm; A4 loại phương án vượt giới hạn tỷ trọng (`WEIGHT_BOUND_EXCEEDED`). Chi tiết: `AN_HUU_ALLOCATION_AUDIT.md` mục I và `backend/PROGRESS.md`.
- **Nhóm B chờ chủ sản phẩm chốt:** B1 rút chi tiêu đầu tháng (§7.2, engine v4); B2 số tháng dự phòng theo độ ổn định thu nhập (6/9/12); B3 đo đảo danh mục so với tỷ trọng đang nắm giữ.
- **Nhóm C chưa làm:** C1 từ 1.000 kịch bản trở lên (đề xuất chạy tăng dần theo mốc, dùng lại đường đã chạy); C2 dữ liệu tổng lợi suất và bộ tối ưu.

## Mục tiêu nghiệm thu

1. Khách không có khoản chi lớn sắp tới vẫn tính được sau khi chọn "Không có". Không tự đổi dữ liệu chưa khai thành "không có".
2. Khách thiếu tiền dự phòng nhận được giải thích còn thiếu bao nhiêu, không nhận lỗi chung.
3. Khách có kế hoạch chưa khả thi vẫn thấy phân tích, danh mục tham khảo và các hướng điều chỉnh, không bị báo lỗi.
4. Không mất kết quả vì chờ quá lâu, chạy chồng hoặc giới hạn tần suất.
5. Danh mục đề xuất (kể cả bản đã giảm rủi ro) áp dụng được vào kế hoạch.
6. Xác suất hiển thị kèm số kịch bản và khoảng tin cậy.
7. Bộ kiểm thử audit 14 ca (`AUDIT_RUN=1`) cho trạng thái đúng như bảng ở mục cuối.

---

## P0 – Lỗi khiến khách không có kết quả

### P0-1. Kế hoạch không khả thi bị báo lỗi (K1, Critical)

**Nguyên nhân gốc:** khi không phương án nào đạt ngưỡng, server tính thêm gợi ý điều chỉnh (`allocation-risk/service.ts:254-257`). Bước này mất 14–24 giây (đo với chỉ 2 đường mô phỏng) và không chịu giới hạn 10 giây. Trình duyệt chỉ chờ 20 giây. Trang Phân bổ cũng không hiển thị kết quả của bước này.

| Việc | Ai | File |
|---|---|---|
| Khi `detail: "ALLOCATION_V2"`, không tính `adjustmentOptions`. Vẫn trả `INSUFFICIENT`, `adjustmentKinds` và cờ `adjustmentsOmitted: true`. Trang Kế hoạch (không truyền `detail`) giữ nguyên hành vi cũ | BE | `allocation-risk/service.ts` |
| Với trang Kế hoạch: bước tìm gợi ý dùng chung `deadline`; nếu hết giờ thì trả phần gợi ý ở trạng thái `REVIEW_REQUIRED` `ADJUSTMENT_RUNTIME_LIMIT`, không chặn kết quả chính | BE | `service.ts`, `retirement/adjustments*` |
| Khi cùng một người chạy lượt mới: **hủy lượt cũ** thay vì từ chối lượt mới. Vòng `simulate()` kiểm tra thêm tín hiệu hủy | BE | `service.ts:108`, `simulation.ts:137` |
| Khi trình duyệt ngắt kết nối (`req.on("close")`): dừng lượt đang chạy và giải phóng chỗ | BE | `allocation-risk/router.ts` |
| Giới hạn tần suất 6 lần/phút đang đếm theo IP: đổi sang đếm theo tài khoản, khoảng 20 lần/phút (**chờ chốt**) | BE | `allocation-risk/router.ts` |
| Đặt `timeoutMs` cho lệnh gọi mô phỏng khoảng 45 giây. Tự thử lại có giãn cách khi gặp `CONCURRENT_RUN_LIMIT` hoặc 429 (tối đa 2 lần) | FE | `services/planningAnalysis.ts`, `AllocationExperiment.tsx` |
| Cập nhật OpenAPI và test | BE | `scripts/generate-allocation-risk-openapi.cjs`, `allocation-risk-api.test.ts` |

**Nghiệm thu:**
- C05 và C12 trả `INSUFFICIENT` trong dưới 10 giây (máy local).
- Test `allocation-risk-api.test.ts:135` của trang Kế hoạch vẫn qua.
- Lượt chạy chồng của cùng một người: lượt sau thắng, lượt trước dừng.

### P0-2. Báo đúng lý do bị chặn (H1, High)

**Nguyên nhân gốc:** mọi trường hợp kế hoạch không ra được trạng thái READY đều bị gộp thành `CLASSIFIED_SERVER_CASHFLOWS_AND_COMPLETE_PROJECTION_REQUIRED` (`service.ts:124`). Giao diện hiện một câu chung (`AllocationExperiment.tsx:229`).

| Việc | Ai | File |
|---|---|---|
| Trả kèm mã lý do thật từ `preview.issues` và `capital.issues`, ví dụ `GOALS_REQUIRED`, `UNKNOWN_VALUE`, `LOSS_TOLERANCE_REQUIRED` (giữ mã cũ ở vị trí đầu để tương thích) | BE | `service.ts:124,193` |
| Ánh xạ từng mã thành việc khách cần làm. `GOALS_REQUIRED` → "Trả lời câu Khoản lớn sắp tới", kèm nút mở bước 1 (lựa chọn "Không có" đã có sẵn ở `AllocationProfileEdits.tsx:142`) | FE | `AllocationExperiment.tsx`, `AllocationResults.tsx` |
| Không tự gán `goals = []` cho hồ sơ thiếu mục tiêu; khách phải tự xác nhận | Nguyên tắc | — |

**Nghiệm thu:** C11 trả `REVIEW_REQUIRED` kèm `GOALS_REQUIRED`; giao diện chỉ đúng câu hỏi cần trả lời.

### P0-3. Vốn dài hạn âm là không khả thi, không phải thiếu dữ liệu (H2, High)

| Việc | Ai | File |
|---|---|---|
| Khi vốn dài hạn < 0, trả `INSUFFICIENT` với `issues: ["PROTECTED_CAPITAL_EXCEEDS_ASSETS"]`, số tiền còn thiếu, không có phương án nào (**chờ chốt**) | BE | `service.ts`, `capital/loss-constraint.ts` |
| Hiển thị: "Bạn còn thiếu X để đủ quỹ dự phòng và khoản cần dùng sớm. An Hưu chưa đề xuất phân bổ vốn dài hạn; hãy ưu tiên hoàn thiện quỹ dự phòng", kèm các cách điều chỉnh (giảm số tháng dự phòng, thêm vốn, xem lại khoản cần dùng sớm) | FE | `AllocationExperiment.tsx`, `AllocationResults.tsx` |

**Nghiệm thu:** C07 và C13 trả `INSUFFICIENT` kèm số tiền còn thiếu (50 triệu và 20 triệu).

### P0-4. Danh mục "đã giảm rủi ro" phải áp dụng được (H3, High)

**Nguyên nhân gốc:** phương án `LOSS_REDUCED` trừ một số điểm cố định và cắt tại 0 (`loss-candidates.ts:14-22`). Khi lưu, hệ thống dựng lại theo cách của "tỷ trọng tự chọn" (cộng phần dịch chuyển, cắt 0, rồi chuẩn hóa lại, `custom.ts`). Khi số điểm cần chuyển lớn hơn tỷ trọng cổ phiếu ở mốc nghỉ hưu, hai cách cho kết quả khác nhau (`service.ts:205-217`), nên phương án bị đánh dấu không áp dụng được.

| Việc | Ai | File |
|---|---|---|
| Dựng `LOSS_REDUCED` và `LEAST_LOSS` bằng `customTargets(tỷ trọng tháng đầu đã giảm)` khi chính sách có `customization`. Nhờ vậy phương án tái lập được | BE | `allocation-risk/loss-candidates.ts`, `service.ts:178-182` |
| Giữ kiểm tra giới hạn lỗ cho từng tháng. Nếu một tháng nào đó vượt giới hạn, tăng mức giảm theo từng bước 0,01 điểm cho tới khi đạt, hoặc chuyển sang `LEAST_LOSS` | BE | `service.ts:191-194` |
| Nếu chính sách không có `customization`: giữ cách cũ, kèm lý do `CUSTOM_POLICY_REQUIRED` | BE | — |

**Nghiệm thu:** C03 trả `LOSS_REDUCED` với `applicable: true`; tỷ trọng dựng lại khớp với phương án đã mô phỏng ở mọi tháng; nút áp dụng mở.

---

## P1 – Độ tin cậy của kết quả

### P1-1. Số kịch bản mô phỏng quá ít (H4)

| Việc | Ai |
|---|---|
| Hiển thị số kịch bản và khoảng tin cậy Wilson cạnh mọi xác suất (dữ liệu đã có trong `display.wilson*`) | FE |
| Đo và tối ưu `runPath` (phần lớn thời gian là tính Decimal), giữ kết quả y hệt bằng test golden | BE |
| Đưa phần chọn phương án vào preview pool hoặc chạy nền (tạo job, lấy kết quả sau), để nâng số kịch bản lên ≥ 1.000 theo tài liệu | BE, cần quyết định kiến trúc |

### P1-2. Chọn phương án tham khảo khi không khả thi (M6)

- **Hiện tại:** chọn phương án có CVaR thấp nhất. Ví dụ C09 chọn phương án có pE 41% thay vì 82%.
- **Đề xuất:** giữ quy tắc của tài liệu, nhưng chỉ dùng CVaR khi số kịch bản đủ lớn; nếu không, chọn pE cao nhất. **Cần khách hàng duyệt**, vì đây là thay đổi quy tắc.

### P1-3. Khi mọi phương án đều đạt, luôn chọn lại lộ trình mẫu (M2)

- Đề xuất thêm tiêu chí phụ (pAll hoặc trung vị tài sản cuối kỳ) trước tiêu chí "thay đổi ít nhất". **Cần khách hàng duyệt.**

### P1-4. Công cụ kiểm tra

- Đã xong: sửa phần so sánh hash trong script audit; đã xác minh hash khớp thật.
- Còn lại: sửa `backend/scripts/audit-allocation-readonly.cjs` cho chính sách schema v2 (L1).

---

## P1 – Dữ liệu và chính sách (ADMIN)

1. **Dữ liệu thị trường v5:** xác minh giấy phép của 5 nguồn; thay VN-Index bằng chỉ số tổng lợi suất (gồm cổ tức); thêm biến động giá cho TPCP; kéo dài lịch sử dữ liệu; rồi công bố bản mới (H5). Thủ tục: `docs/du-lieu-thi-truong-va-ty-trong-mau.md`.
2. **49 hồ sơ thiếu mục tiêu:** không tự điền. Nhắc khách trả lời ở bước 1, hoặc gửi thông báo.
3. **Chính sách mới** (cần duyệt):
   - thêm lộ trình Tăng trưởng (`TPL_GROWTH_GLIDE` trong `data/drafts/policy-params-draft.json`);
   - số tháng dự phòng theo độ ổn định thu nhập (M4);
   - cách đưa nợ vào hoàn cảnh (M3).

## P2 – Cá nhân hóa sâu hơn (sau P0 và P1)

- Bật hoặc hoàn thiện `continuousOptimizer`, chỉ khi dữ liệu thị trường đạt chuẩn và hiệu năng đủ (M1). Làm trước P0 sẽ khiến timeout nặng hơn.
- Tỷ trọng ban đầu dựa trên ràng buộc cá nhân (thời hạn từng mục tiêu, khả năng chịu lỗ bằng tiền, độ ổn định thu nhập), không chỉ chọn mẫu theo nhóm điểm.
- Nguyên tắc: hai người có cùng tỷ trọng là chấp nhận được, miễn hệ thống giải thích được lý do.

---

## Trạng thái mong đợi của 14 ca sau P0

| Ca | Hiện tại | Sau P0 |
|---|---|---|
| C01, C02, C04, C06, C08, C10, C14 | SUCCESS | SUCCESS (không đổi) |
| C03 | SUCCESS, không áp dụng được | SUCCESS, áp dụng được |
| C05, C12 | INSUFFICIENT sau 24–27 giây (trình duyệt báo lỗi) | INSUFFICIENT dưới 10 giây |
| C09 | INSUFFICIENT sau 19 giây | INSUFFICIENT dưới 10 giây |
| C07, C13 | REVIEW_REQUIRED, mã chung | INSUFFICIENT kèm số tiền còn thiếu |
| C11 | REVIEW_REQUIRED, mã chung | REVIEW_REQUIRED kèm `GOALS_REQUIRED` |

## Thứ tự làm

1. P0-1 (BE) → P0-2 và P0-3 (BE) → P0-4 (BE).
2. Ghi phần FE của P0 vào `docs/task-frontend.md`.
3. Chạy toàn bộ test backend, typecheck, sinh lại OpenAPI, chạy lại bộ kiểm thử audit, cập nhật bảng trong `AN_HUU_ALLOCATION_AUDIT.md`.
4. P1-1: hiển thị số kịch bản (FE) và tối ưu `runPath` (BE).
5. P1-2, P1-3, P2: sau khi khách hàng duyệt.

## Cần chốt

1. Vốn dài hạn âm: `INSUFFICIENT` (đề xuất) hay giữ `REVIEW_REQUIRED` kèm mã mới?
2. Giới hạn tần suất: đếm theo tài khoản, 20 lần/phút (đề xuất)?
3. Phần FE: ghi cho AI frontend (mặc định) hay phiên này làm luôn?
