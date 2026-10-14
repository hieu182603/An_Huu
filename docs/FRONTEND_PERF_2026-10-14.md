# Frontend — hiệu năng & lỗi luồng (14/10/2026)

Thực hiện mục 16 trong `docs/task-frontend.md` theo yêu cầu trực tiếp của người dùng ("làm luôn phần việc frontend"). Backend tương ứng: `backend/PROGRESS.md` mục PERF 14/10. Không đổi hợp đồng API, không commit.

## Số liệu build production (`npm run build`)

| Tài nguyên | Trước | Sau |
|---|---|---|
| CSS chính `index-*.css` | 428,6 KB (gzip 72,4) | 242,5 KB (gzip 43,3) |
| Chunk `SimulationTrackingPage` | 216,0 KB (gzip 54,2) | 31,1 KB (gzip 9,6) + `ActualsTab` 186,5 KB chỉ tải khi mở tab Theo dõi tiến độ |
| Ảnh nền loader `loading-waves` | PNG 1.669 KB | WebP 35 KB |
| Logo ngang `logo` | PNG 153 KB | WebP 50 KB |
| Logo dọc `logo-vertical` | PNG 437 KB | WebP 20 KB |
| Ảnh 404 | PNG 867 KB | WebP 27 KB |
| JS chính `index-*.js` | 656,3 KB (gzip 206,5) | 660,4 KB (gzip 207,6) |

Ảnh đã so trực quan với bản gốc (vùng cắt độ phân giải đầy đủ): không thấy khác biệt. PNG gốc vẫn được giữ trong `src/assets` (có test đọc `logo.png`), nhưng không còn được import.

## Trạng thái 12 mục

1. **Gate chặn tải chunk** — đã làm. `FinancialProfileGate` vẫn ẩn trang khi hồ sơ đang tải (các trang giả định đã có revision), nhưng gọi `preloadRoute(location.pathname)` ngay khi bắt đầu tải, nên JS của trang tải song song với request hồ sơ.
2. **`refreshPlans` chạy hai lần** — đã làm. `activePlanId` đọc qua ref (`setActivePlanId` cập nhật cả ref lẫn state), `refreshPlans` không còn đổi identity khi chọn plan, nên effect tải theo user chỉ chạy một lần.
3. **Ghi dữ liệu xóa toàn bộ cache GET** — đã làm. `cacheInvalidationScope()` trong `services/api.ts`: đánh dấu thông báo chỉ xóa `/me/notifications`; ghi kế hoạch xóa `/me/retirement` + `/me/ai`; ghi hồ sơ xóa hồ sơ, nháp, kế hoạch, AI, lương hưu; `PATCH /me` chỉ xóa đúng `/me`; ghi không nhận diện được (admin, auth…) vẫn xóa hết. Test: `scripts/cache-scope.test.mjs`.
4. **What-if không debounce, xóa kết quả** — đã làm. Debounce 400 ms (`WHAT_IF_DEBOUNCE_MS`), hủy kết quả cũ bằng cờ `active` và hủy timer. Kết quả trước được giữ, làm mờ (`.is-recalculating`) cho tới khi có kết quả mới; chỉ xóa khi lỗi hoặc đổi phiên bản. Nút Lưu/Áp dụng vẫn khóa trong lúc đang tính.
5. **Socket.io qua Vercel và token cố định** — đã làm. `auth: cb => cb({ token: getAccessToken() })` nên mỗi lần reconnect dùng token mới. Origin socket: `VITE_SOCKET_URL`, hoặc origin của `VITE_API_URL` nếu là URL tuyệt đối, hoặc `/` khi dev. Production trên Vercel không có origin tuyệt đối thì không mở socket mà dùng poll. Ghi chú trong `.env.example`. Nếu đặt `VITE_SOCKET_URL`, origin Vercel phải nằm trong CORS backend (`config/socket.ts` dùng `isAllowedOrigin`). Test: `scripts/socket-origin.test.mjs`.
6. **Poll thông báo trùng** — đã làm. Bỏ vòng poll 60 giây trong `UserLayout`: biến `unread` ở đó được set nhưng không được hiển thị. `useRealtimeNotifications` giờ dùng một store chung (`useSyncExternalStore`): một fetch có khử trùng, một interval 60 giây chỉ chạy khi tab hiển thị và socket không kết nối, một bộ listener socket; tự reset khi component cuối unmount (đăng xuất).
7. **Ảnh nặng** — đã làm (bảng trên).
8. **`index.css` nguyên khối** — đã làm, theo hướng an toàn với cascade: xóa 2.130 selector / 1.871 rule chỉ khớp class không còn được phát ra ở đâu (918 class). Nguồn đối chiếu là toàn bộ JS/HTML đã build (gồm cả code thư viện như recharts) + `src`; class ghép động (`tone-${x}`, `"tone-"+x`) được tính là đang dùng. 12.152 → 6.816 dòng. Kiểm tra: chụp 32 route × 2 khổ (390, 1440) bằng Playwright với CSS gốc và CSS đã lọc rồi so pixel: tất cả trùng khớp, khác biệt duy nhất là đồng hồ "Đồng bộ hh:mm:ss" trên dashboard admin và nhiễu nội suy ở ảnh logo. Chưa tách CSS theo trang: chuyển rule sang chunk khác sẽ đổi thứ tự cascade, cần rà từng trang.
9. **Context value không memo** — đã làm. `AuthContext` dùng `useMemo`; `FinancialProfileContext` dùng `useStableValue` (`utils/useStableValue.ts`: hàm được bọc ổn định, object chỉ đổi khi dữ liệu đổi); `RetirementPlanContext` dùng `useMemo` + action ổn định qua ref; `usePlanSynchronization` trả object memo.
10. **`SimulationTrackingPage` 4.645 dòng** — đã làm. Tab Theo dõi tiến độ (sổ thực tế, dự báo lại, điều chỉnh nguồn) tách sang `pages/simulation/ActualsTab.tsx` và tải lazy. Helper định dạng chung ở `pages/simulation/format.ts`. Trang chính còn 860 dòng. Khi đã mở, tab vẫn được mount (ẩn bằng `display: none`, hiện bằng `display: contents` để không đổi layout), nên dữ liệu sổ đang nhập không mất khi chuyển tab như trước. Trạng thái đang ghi được báo lên qua `onBusyChange` để khóa nút chuyển tab như trước.
11. **`routePreload` thiếu route** — đã thêm `/user/debts`, `/user/risk-portfolio`.
12. **Onboarding v1 / `upgradeToV2` bịa dữ liệu** — đã làm.
    - `createDefaultProfileV2` chỉ đặt `KNOWN` cho số người dùng đã khai. Những gì v1 không hỏi đều để `UNKNOWN`: tháng sinh, tháng nghỉ hưu, tháng nhận lương hưu, tỷ lệ sở hữu/phân bổ tài sản, thời điểm dùng được bất động sản, trách nhiệm khoản vay, và tiền trả nợ khi có hai khoản vay chung một tổng. Trước đây tháng sinh được đặt `<năm>-01`, mặc định 30 tuổi.
    - `persistProfile` từ chối ghi dữ liệu dạng v1 lên hồ sơ v2. Trước đây nó gọi `createDefaultProfileV2` và có thể ghi đè hồ sơ chi tiết bằng giá trị mặc định. Hiện chưa có chỗ nào gọi đường này với hồ sơ v2, nên đây là chặn lỗi tiềm ẩn.
    - Sau onboarding, nếu không có trang cần quay lại, chuyển tới `/user/account?tab=profile` với thông báo bổ sung tháng sinh và tháng nghỉ hưu. Ở đó có nút "Bổ sung hồ sơ chi tiết" và danh sách mục còn thiếu.
    - Lỗi `PROFILE_V2_REQUIRED` khi xem trước được thay bằng hướng dẫn tiếng Việt.
    - Test: `scripts/profile-v2-defaults.test.mjs`.

## Kiểm tra đã chạy

- `npm run typecheck`: sạch.
- `npm run test:assets`: 71/71 pass (gồm 3 file test mới).
- `npm run build`: thành công.
- So sánh pixel CSS: như mục 8.
- Đo request trên bản build với API mock, lần tải đầu `/user/dashboard`: danh sách plan **1**, chi tiết **1**, versions **1**, `/me/notifications` **1**. Theo code trước đây là 2/2/2/2: effect tải plan chạy lại khi `activePlanId` được đặt; `UserLayout` và dropdown mỗi bên tự gọi thông báo. Request hồ sơ bắt đầu ở 189 ms, chunk `UserDashboard` ở 236 ms, tức là tải song song thay vì chờ hồ sơ. Không đo lại được bản "trước" trên trình duyệt vì không tách được code cũ khỏi các thay đổi chưa commit của phiên khác.
- Playwright (9 spec liên quan: simulation, user-plan-journey, plan, goal, financial-profile, onboarding, account): 50 pass, 60 fail. Các test đi đúng vào phần đã sửa đều pass: what-if trên kế hoạch thật, giữ lựa chọn và áp dụng (`user-plan-journey` 77, 97); sổ thực tế trên component đã tách (`simulation-detail-fixes` 38, 44, 60, 67, 136); onboarding → hồ sơ chi tiết và xung đột schema (`user-plan-journey` 226, 237, 257); tự động lưu và tính lại (119, 139, 298, 322, 344). 60 test lỗi đều chờ nhãn hoặc trạng thái không còn trong code hiện tại, ví dụ "Lưu phiên bản này", "Áp dụng vào kế hoạch chính thức", "Kỳ đối soát tháng (Việt Nam)", "Chưa tải được báo cáo kế hoạch", hoặc mở what-if khi chưa có kế hoạch áp dụng. Không lỗi nào đến từ selector hay hành vi do đợt này thay đổi. Chưa chạy toàn bộ 449 test: mỗi test lỗi có sẵn tốn 40–120 giây timeout.

## Phát hiện ngoài phạm vi (lỗi có sẵn, không do đợt này)

- Nhiều spec Playwright tham chiếu nhãn cũ đã được đổi trong bản chưa commit: "Lệnh nguồn (V4)" → "Điều chỉnh thu chi & tài sản", "Kỳ đối soát tháng (Việt Nam)" → "Tháng cần kiểm tra số dư (giờ Việt Nam)", "Thẩm định & Ước tính BHXH", "Áp dụng kịch bản này", `.admin-users-table`. Các spec này timeout dù code không đổi hành vi.
- Với dữ liệu mock mặc định trong `tests/helpers.ts`, `/user/plan` crash ở `displayedPreview?.warnings.length` và `/user/simulation` crash ở `summary.retirementMonth.slice(5, 7)`. Cả hai biểu thức đến từ phần sửa chưa commit (không có trong HEAD). Nên dùng `?.` hoặc cập nhật mock nếu API luôn trả các trường này.
- `financial-profile.spec` 1.2 chờ màn hình "HỒ SƠ TÀI CHÍNH HOÀN TẤT", nhưng code đã chuyển trang ngay sau khi hoàn tất từ trước đợt này.
