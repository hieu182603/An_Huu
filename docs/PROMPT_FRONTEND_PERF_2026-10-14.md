# Prompt cho AI frontend — Hiệu năng & lỗi luồng (14/10/2026)

> Dán toàn bộ nội dung dưới đây cho AI phụ trách frontend. Prompt tự đủ ngữ cảnh; nguồn gốc là mục 16 trong `docs/task-frontend.md`.

---

## Vai trò và phạm vi

Bạn là kỹ sư frontend của dự án **An Hưu** (`E:\An_Huu`): React + Vite trong `frontend/`, deploy trên Vercel. `/api/*` được Vercel rewrite sang backend Express trên Azure App Service (japaneast); Postgres đặt ở Southeast Asia, nên **mỗi request API tốn thêm vài chục đến hơn trăm ms mạng**. Giảm số request trùng lặp và tuần tự quan trọng hơn tối ưu vi mô.

Nhiệm vụ: sửa 12 vấn đề hiệu năng/lỗi luồng phía frontend liệt kê bên dưới, có đo trước/sau.

**Ràng buộc bắt buộc**
- Chỉ sửa trong `frontend/` (và `vercel.json` nếu cần cho mục 5). **Không sửa `backend/`.** Nếu cần thay đổi API, ghi yêu cầu vào cuối `docs/task-frontend.md` dưới tiêu đề mới, không tự sửa backend.
- Workspace có nhiều thay đổi chưa commit của người/phiên khác. **Không stash, reset, checkout, đổi nhánh**; không định dạng lại hay viết lại file ngoài phần mình sửa. Sửa hẹp, giữ nguyên các thay đổi đang có.
- **Không bịa dữ liệu tài chính/hồ sơ.** Trường chưa biết phải ở trạng thái `UNKNOWN` hoặc hỏi người dùng; không tự điền giá trị rồi gắn `KNOWN`. Không đổi `null` thành `0`.
- Không đổi hợp đồng API; giữ nguyên hành vi nghiệp vụ (lưu/áp dụng phiên bản, idempotency key, CAS revision).
- Không commit trừ khi người dùng yêu cầu.

## Những gì backend đã làm (không cần làm lại)

Backend đã sửa ngày 14/10/2026 (xem `backend/PROGRESS.md`, mục PERF):
- Nén gzip mọi JSON (`GET /me/retirement/plans/:id` từ 411 KB xuống ~43 KB).
- `GET /me/retirement/plans/:id/versions` chỉ trả summary, rất nhanh.
- Các GET kế hoạch và `POST /me/retirement/preview` không còn chạy transaction SERIALIZABLE, có cache policy/assumption.
- Rate limit theo `userId` cho request đã đăng nhập.
- Header `Server-Timing: total;dur=<ms>` trên `/me/retirement/plans*`, `/me/retirement/preview`, `/me/financial-profile`. Dùng header này để tách thời gian xử lý của server khỏi thời gian mạng khi đo.

## Bước 0 — Đo trước khi sửa (bắt buộc)

1. Chạy frontend (`npm run dev` trong `frontend/`, proxy `/api` tới backend local) hoặc dùng bản deploy. Đăng nhập bằng tài khoản USER test.
2. Dùng DevTools → Network (bật "Disable cache"; ghi một lần thêm với throttling "Fast 4G") cho luồng: **đăng nhập → `/user/dashboard` → `/user/plan` → `/user/simulation` (tab what-if: đổi chi tiêu 5 lần liên tiếp) → `/user/debts`**.
3. Ghi lại: số request API theo từng endpoint (đặc biệt các request trùng), tổng KB JS/CSS/ảnh của lần tải đầu, thời gian tới khi bảng kế hoạch hiển thị, số request `simulate` khi gõ.
4. Ghi số liệu `npm run build`: kích thước chunk chính, CSS, ảnh trong `dist/assets`.

Lưu bảng "trước" vào file báo cáo (xem phần cuối).

## Các việc cần làm (theo thứ tự ưu tiên)

Số dòng là vị trí lúc rà soát và có thể đã dịch; hãy tìm theo tên hàm/biến.

### P1 — Luồng tải trang và request trùng

**1. `FinancialProfileGate` chặn tải chunk trang**
- Hiện trạng: `pages/UserLayout.tsx` (~252) bọc `<Suspense><Outlet/></Suspense>` trong `<FinancialProfileGate>`. `components/FinancialProfileGate.tsx` (~148) có `if (loading) return <Card>Đang tải hồ sơ…</Card>`, nên chunk lazy của trang đích **chỉ bắt đầu tải sau khi profile về**. Đây là thác nước tuần tự: profile → JS trang → API của trang.
- Yêu cầu: chunk trang và request profile phải chạy song song. Cách gợi ý: khi `loading`, vẫn render `Suspense/Outlet`; chỉ hiển thị trạng thái tải profile (banner/skeleton) và không bật modal nhắc khảo sát. Các trang tự xử lý trạng thái chưa có profile. Nếu không thể render trang, ít nhất gọi `routeIntent`/preload cho `location.pathname` ngay khi gate đang loading.
- Không làm hỏng: modal nhắc khảo sát chỉ hiện khi `!loading && !hasProfile`; chế độ `inline` và `onboarding` giữ nguyên.
- Nghiệm thu: trong Network, request JS của trang đích bắt đầu trước khi `GET /me/financial-profile` hoàn tất.

**2. `refreshPlans` chạy hai lần**
- Hiện trạng: `context/RetirementPlanContext.tsx`. `refreshPlans` là `useCallback` với deps `[user?.role, user?.id, activePlanId, loadPlanDetail]` (~179). Effect (~214–218) có deps `[user?.role, user?.id, refreshPlans]`. Khi `activePlanId` được đặt sau lần tải đầu, `refreshPlans` đổi identity, effect chạy lại và gọi lại danh sách + chi tiết.
- Yêu cầu: đọc `activePlanId` qua `useRef` bên trong `refreshPlans` (bỏ khỏi deps), hoặc tách effect "đổi user" khỏi "chọn plan". Giữ cơ chế chống race (`planListSeq`, `activeUserIdRef`).
- Nghiệm thu: vào `/user/plan` từ trạng thái mới đăng nhập chỉ có **1** `GET /me/retirement/plans` và **1** `GET /me/retirement/plans/:id`. Đổi tài khoản vẫn xóa state cũ.

**3. Ghi dữ liệu xóa toàn bộ cache GET**
- Hiện trạng: `services/api.ts` (~186–192). Mọi request không phải GET, trừ POST chứa `/preview|/simulate|/compare`, đều gọi `invalidateApiCache()` và xóa hết cache. Ví dụ đánh dấu đã đọc thông báo cũng làm mất cache kế hoạch/hồ sơ.
- Yêu cầu: invalidate theo tiền tố tài nguyên bị ghi. Ví dụ:
  - `/me/notifications/*` → `/me/notifications`
  - `/me/retirement/plans/:id/*` → `/me/retirement/plans`
  - `PATCH /me/financial-profile`, `/me/onboarding/*` → `/me/financial-profile`, `/me/onboarding-draft`, `/me/retirement/plans` (vì backend đánh dấu plan `stale`)
  - `PATCH /me`, `/me/avatar` → `/me`, `/auth/me`
  - Không chắc về một đường → mặc định xóa hết (an toàn).
  Giữ ngoại lệ preview/simulate/compare. Logout/đổi phiên vẫn xóa toàn bộ.
- Nghiệm thu: đánh dấu đã đọc một thông báo rồi quay lại `/user/plan` không gọi lại API kế hoạch; lưu hồ sơ thì có gọi lại. Viết test đơn vị cho hàm map đường → tiền tố.

**4. What-if trong `SimulationTrackingPage` không debounce và xóa kết quả mỗi lần đổi**
- Hiện trạng: `pages/SimulationTrackingPage.tsx`, effect "Run server preview simulation (What-If)" (~165–260). Mỗi lần `simExpense/simMonthlySave/simRetireAge/scenario/override*` đổi, effect gọi `setSimResult(null)`, `setComparisonDelta(null)` rồi gửi ngay `POST .../versions/:id/simulate`.
- Yêu cầu:
  - Debounce khoảng 400 ms trên các input số; thay đổi rời rạc như `scenario` có thể gửi ngay.
  - Hủy request cũ (`AbortController` nếu `authenticatedRequest` hỗ trợ; nếu không, dùng sequence id và bỏ kết quả cũ).
  - **Giữ kết quả trước** trên màn hình, kèm trạng thái "Đang tính lại…" (dùng `isSimulating`) cho tới khi có kết quả mới. Chỉ xóa khi lỗi hoặc khi đổi phiên bản kế hoạch.
  - Giữ nguyên các nhánh hiện có: `unchanged` dùng lại preview hiện tại, kiểm tra asset override, không đưa tháng nghỉ hưu của hồ sơ vào `whatIf`.
- Nghiệm thu: gõ liên tục 5 lần trong 1 giây sinh ra ≤ 1–2 request `simulate`; bảng/biểu đồ không nháy trống.

### P2 — Realtime và thông báo

**5. Socket.io qua Vercel và token handshake cố định**
- Hiện trạng: `vercel.json` chỉ rewrite `/api/*` sang Azure, không có `/socket.io`; Vercel rewrite cũng không proxy được WebSocket. `services/socket.ts` (~37) tạo `io("/", { path: "/socket.io", auth: { token } … reconnectionAttempts: 10 })`, nên trên production kết nối thất bại và retry 10 lần. `auth: { token }` được chụp một lần; sau khi access token được refresh, các lần reconnect vẫn gửi token cũ.
- Yêu cầu:
  - Dùng `auth: (cb) => cb({ token: getAccessToken() })` để mỗi lần handshake lấy token mới.
  - Thêm biến `VITE_SOCKET_URL` (URL backend Azure trực tiếp). Khi có, kết nối tới đó; khi không có và đang ở production, **không** mở socket mà chỉ dùng poll (mục 6). Dev giữ proxy Vite hiện có (`vite.config` đã proxy `/socket.io`).
  - Ghi vào `docs/task-frontend.md` rằng backend cần cho phép origin Vercel trong CORS của Socket.IO nếu dùng `VITE_SOCKET_URL`. Không tự sửa backend.
- Nghiệm thu: trên build production không còn request `/socket.io` lỗi lặp; dev vẫn nhận `notification:*`.

**6. Poll thông báo trùng lặp**
- Hiện trạng: `pages/UserLayout.tsx` (~62–64) poll `GET /me/notifications?limit=1` mỗi 60 giây để lấy `unread`. Hook thông báo trong `services/socket.ts` (~64–70) gọi riêng `GET /me/notifications?page=1&limit=25`, cũng trả `unread`. Ngoài ra còn event `anhuu:notifications-updated`.
- Yêu cầu: một nguồn duy nhất (context/store) giữ `unread` + danh sách mới nhất, một interval chung. Tạm dừng poll khi `document.visibilityState === "hidden"` và khi socket đang kết nối; refresh ngay khi tab hiện lại hoặc khi có event socket.
- Nghiệm thu: để trang mở 3 phút thì mỗi phút có tối đa 1 request `/me/notifications`; tab ẩn thì không có request.

### P3 — Kích thước tải đầu

**7. Ảnh nặng**
- `assets/loading-waves.png` (1,67 MB) được import trong `components/AppLoader.tsx`, hiện trước mọi trang. `assets/logo-vertical.png` (437 KB) và `assets/logo.png` (152 KB) được import trong `components/ui.tsx`, tức nằm trong bundle chính. Thêm `reload-bg.png` (837 KB), `404-artwork.png` (867 KB), `404-reference.png` (897 KB).
- Yêu cầu: chuyển sang WebP/AVIF (hoặc SVG cho logo) ở kích thước hiển thị thật (≤ 2× DPR). Loader ưu tiên hiệu ứng CSS/SVG; nếu giữ ảnh thì ≤ 60 KB. Ảnh của trang 404/reload chỉ tải trên trang đó. Giữ nguyên nhận diện (màu, tỉ lệ logo); kiểm tra bằng ảnh chụp trước/sau.
- Nghiệm thu: không ảnh nào > 150 KB trên đường tải đầu `/user/dashboard`.

**8. `index.css` nguyên khối (~12.151 dòng)**
- Yêu cầu: tách CSS đặc thù trang vào file CSS import trong chính trang lazy (Vite tự tách theo chunk). `index.css` chỉ giữ token, reset, layout dùng chung, component trong `ui.tsx`. Xóa selector chết khi chắc chắn (grep className trong `src/`). Làm theo từng trang và kiểm tra trực quan từng trang sau mỗi bước, tránh vỡ giao diện.
- Nghiệm thu: CSS tải ở lần đầu `/user/dashboard` giảm rõ rệt (ghi số KB); không có trang nào vỡ layout (chụp desktop 1440 và mobile 375).

**9. Context value không memo**
- `context/AuthContext.tsx` (~116) truyền object literal vào `value`. `context/RetirementPlanContext.tsx` (~388) tạo `value` mới mỗi render. `context/FinancialProfileContext.tsx` (`useProfileState` trả object mới với các hàm inline, ~196–444).
- Yêu cầu: `useMemo` cho `value`, `useCallback` cho action. Nếu cần, tách context state và actions để component chỉ dùng action không render lại. Không đổi API public của hook.
- Nghiệm thu: React DevTools Profiler cho thấy gõ trong form what-if không render lại `UserLayout`/sidebar.

**10. `SimulationTrackingPage.tsx` dài 4.645 dòng**
- Yêu cầu: tách theo tab/khu vực (what-if, bảng dòng tiền tháng, đối soát thực tế, so sánh phiên bản) thành component riêng; tab không mặc định thì `lazy()`. Làm **sau** mục 4, refactor thuần, không đổi hành vi. Chuyển helper thuần sang file riêng có test.
- Nghiệm thu: file chính < 1.000 dòng; chunk ban đầu của trang nhỏ hơn; mọi test/Playwright hiện có của trang vẫn qua.

**11. `routePreload` thiếu route**
- `services/routePreload.ts` chưa có `/user/debts` (→ `pages/DebtAnalysisPage`) và `/user/risk-portfolio` (→ `pages/RiskPortfolioPage`). Thêm vào bảng, kiểm tra đúng đường import mà router đang dùng.

### P1 (lỗi luồng dữ liệu) — làm cùng đợt với P1

**12. Onboarding ghi hồ sơ v1, trang kế hoạch/preview cần v2; `upgradeToV2` bịa tháng sinh**
- Hiện trạng:
  - Wizard onboarding chỉ thu tổng số v1 (`writeDraft` trong `context/FinancialProfileContext.tsx`), nên `POST /me/onboarding/complete` lưu hồ sơ `schemaVersion: 1`.
  - `POST /me/retirement/preview` trả `409 PROFILE_V2_REQUIRED` với hồ sơ v1, nên người dùng gặp lỗi ở trang kế hoạch.
  - `upgradeToV2` (~295) gọi `createDefaultProfileV2` (`services/financialProfile.ts` ~264–445), hàm này đặt `birthMonth: { status: "KNOWN", value: "<năm>-01" }`. Năm suy từ tuổi, **mặc định 30 tuổi** khi thiếu; tháng luôn là 01. Đây là dữ liệu bịa nhưng gắn `KNOWN`.
- Yêu cầu:
  - `createDefaultProfileV2` không được tạo giá trị `KNOWN` mà người dùng chưa khai. Khi không có tháng sinh thật, đặt `birthMonth: { status: "UNKNOWN" }`. Rà toàn bộ hàm: mọi chỗ dùng giá trị mặc định (`|| 30`, `|| 60`, tháng hiện tại làm mốc…) mà gắn `KNOWN` đều phải sửa theo cùng nguyên tắc.
  - Sau khi hoàn tất onboarding (hồ sơ v1), đưa người dùng tới bước **rà soát hồ sơ v2** (form v2 trong `FinancialProfilePanel`), yêu cầu xác nhận các trường bắt buộc cho preview (tối thiểu tháng sinh, tháng muốn nghỉ hưu). Chỉ gọi lưu v2 khi người dùng xác nhận.
  - Trang `/user/plan`, `/user/simulation`, `/user/goal`, `/user/debts` khi gặp `PROFILE_V2_REQUIRED` hoặc thiếu trường v2: hiển thị lời giải thích tiếng Việt và nút dẫn tới bước rà soát, không hiện mã lỗi thô.
  - Các chỗ hiển thị đã có nhánh `UNKNOWN` (ví dụ `RetirementGoalPage.tsx` ~313 hiện "ước tính") phải vẫn đúng.
- Nghiệm thu: tạo tài khoản mới → onboarding → được dẫn sang rà soát v2 → nhập tháng sinh thật → preview kế hoạch READY. Kiểm tra trong DB/response rằng `birthMonth` là giá trị người dùng nhập, không phải `-01` tự đặt.

## Kiểm tra sau khi sửa

Trong `frontend/`:
```
npm run typecheck
npm run build
npm run test:assets
```
Chạy thêm các test Playwright/script hiện có liên quan trang đã sửa (`frontend/tests/`, `frontend/scripts/*.test.mjs`). Thêm test cho: map invalidate cache (mục 3), debounce/giữ kết quả what-if (mục 4), `createDefaultProfileV2` không sinh `KNOWN` giả (mục 12).

Lặp lại đúng kịch bản đo ở Bước 0 và chụp màn hình desktop 1440×1000 + mobile 375 cho các trang đã đổi CSS/ảnh.

## Báo cáo khi xong

Tạo `docs/FRONTEND_PERF_2026-10-14.md` gồm:
1. Bảng **trước/sau**: số request API theo endpoint cho luồng đo, số request `simulate` khi gõ 5 lần, KB JS/CSS/ảnh lần tải đầu, thời gian tới khi bảng kế hoạch hiển thị (kèm điều kiện mạng), `Server-Timing` trung bình của các API kế hoạch.
2. Trạng thái từng mục 1–12: đã làm / làm một phần (nêu phần còn lại) / chưa làm (lý do). Không đánh dấu "xong" khi chưa kiểm bằng trình duyệt thật.
3. Danh sách file đã sửa và lệnh kiểm tra đã chạy cùng kết quả.
4. Yêu cầu phát sinh cho backend (nếu có): append vào `docs/task-frontend.md` và nêu lại trong báo cáo.

Cuối cùng cập nhật mục 16 trong `docs/task-frontend.md`: thêm một dòng trạng thái trỏ tới báo cáo. Không xóa nội dung cũ.
