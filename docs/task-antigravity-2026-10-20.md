# Task Antigravity — 20/10/2026 — Hồ sơ báo đỏ "Khoản nợ" dù đã khai

Workspace: `E:/An_Huu`, nhánh `develop`. Chỉ sửa frontend. Không commit, không đổi backend, không đổi hợp đồng API.

## FE-PROFILE-01 — P1 — Khai nợ rồi vẫn báo "Cần bổ sung" (đỏ)

**Triệu chứng (người dùng báo):** ở trang Hồ sơ, mục "Khoản nợ" trong ô "Còn N mục cần bổ sung" vẫn đỏ dù đã thêm khoản vay ở trang Khoản vay & Nợ. Phần trăm hoàn thiện hồ sơ không bao giờ đạt 100%.

**Nguyên nhân (đã tái hiện bằng chính hàm trong repo):**
- `frontend/src/utils/profileCompletion.ts` → `hasMissingProfileValue()` đệ quy vào **mọi** trường con của từng khoản; gặp bất kỳ `{ status: "UNKNOWN" }` nào là coi cả mục thiếu.
- `frontend/src/components/retirement/DebtLoanDialog.tsx` (~dòng 45) luôn lưu `contract: { status: "UNKNOWN" }` và `responsibility: { status: "UNKNOWN" }`. Form không có ô nào để người dùng điền hai trường này. → Mọi hồ sơ có ít nhất 1 khoản vay đều đỏ vĩnh viễn.
- Lỗi cùng loại ở **Tài sản**: `costBasis` ("Giá vốn (VND, tùy chọn)") để trống → `UNKNOWN` → mục "Tài sản" đỏ dù nhãn ghi là tùy chọn.

Kết quả tái hiện: một khoản vay đủ dư nợ, ngày dư nợ, số trả hằng tháng và tỷ lệ phần trách nhiệm → `hasMissingProfileValue(debts) === true`.

**Cách sửa (giữ nhỏ gọn):**
1. Trong `hasMissingProfileValue`, bỏ qua các trường tùy chọn mà người dùng không thể/không bắt buộc khai: `contract`, `responsibility`, `costBasis`. Cách tối giản: thêm một `Set` tên khóa tùy chọn và bỏ qua khi duyệt `Object.entries`. Không viết lại toàn bộ logic.
2. Các trường bắt buộc vẫn phải báo thiếu như cũ: `outstandingBalance`, `balanceAsOf`, `payment`, `paymentShare`, `balanceShare` (debts); `value`, `valuedOn`, các tỷ lệ share, `liquidity`, `availableFromMonth` (assets); `status: "UNKNOWN"` ở cấp mục.
3. Thêm test vào `frontend/scripts/profile-v2-defaults.test.mjs` (hoặc test mới cùng thư mục, đăng ký vào script `test:assets` trong `frontend/package.json`) cho 4 trường hợp:
   - khoản vay đủ trường bắt buộc, `contract`/`responsibility` UNKNOWN → **không** thiếu;
   - khoản vay thiếu `outstandingBalance` → **thiếu**;
   - `debts: { status: "UNKNOWN" }` → **thiếu**; `NOT_APPLICABLE` có lý do → **không** thiếu;
   - tài sản đủ trường, `costBasis` UNKNOWN → **không** thiếu.
4. Kiểm tra trang Hồ sơ (`FinancialProfilePanel.tsx`, tab "Khoản nợ" ~dòng 697–707) và thanh % hồ sơ (`FinancialProfileContext.tsx` ~dòng 179) dùng chung hàm này nên tự đúng theo; không cần sửa thêm nếu test qua.

**Đạt khi:**
- `npm --prefix frontend run typecheck` sạch.
- `npm --prefix frontend run test:assets` qua toàn bộ, gồm test mới.
- Hồ sơ có khoản vay hợp lệ hiển thị "Khoản nợ — Đã khai · Có thể sửa" (xanh).

## Báo cáo khi xong

Ghi ngắn vào cuối file này: file đã sửa, kết quả typecheck và test (số pass/fail). Không tự tuyên bố đã kiểm trên giao diện nếu chưa mở trình duyệt.

### Kết quả thực hiện (20/10/2026):
1. **Các file đã sửa:**
   - `frontend/src/utils/profileCompletion.ts`: Định nghĩa `OPTIONAL_PROFILE_KEYS = new Set(["contract", "responsibility", "costBasis"])` và bỏ qua các khóa này khi duyệt `Object.entries` trong hàm `hasMissingProfileValue`.
   - `frontend/scripts/profile-v2-defaults.test.mjs`: Thêm 4 test case kiểm tra `hasMissingProfileValue` theo yêu cầu FE-PROFILE-01.

2. **Kết quả kiểm tra tự động:**
   - `npm --prefix frontend run typecheck`: Sạch (exit code 0, không có lỗi type).
   - `npm --prefix frontend run test:assets`: 86/86 pass, 0 fail (bao gồm 4 test case mới cho FE-PROFILE-01).

3. **Ghi chú giao diện:** Chưa mở trình duyệt để kiểm tra trực tiếp giao diện người dùng. Logic tính toán trạng thái checklist ("Khoản nợ") và phần trăm hoàn thiện hồ sơ đều dùng chung `hasMissingProfileValue` nên tự động cập nhật chính xác theo kết quả test.

