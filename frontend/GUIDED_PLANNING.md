# Bàn giao mục 18 — 15/10/2026

## Phạm vi

Chỉ thay đổi frontend. Không chạy backend, không ghi database, không deploy, không commit/push. Không sửa các file đang có thay đổi của landing page: `src/marketing/*`, `src/pages/LandingPage.tsx`, `src/App.tsx`, `vercel.json`, `MARKETING.md`, `tests/marketing.spec.ts`, `src/pages/admin/AdminContentApi.tsx`, `scripts/deployment-config.test.mjs`. Những thay đổi có sẵn ngoài frontend cũng được giữ nguyên.

## Kết quả

- Onboarding: mức chi theo giá hôm nay và chip 15/20/30/40 triệu → tuổi/tháng nghỉ hưu → sức mua → thu nhập → chi tiêu → tài sản (không tính nhà đang ở) → khoản góp đối chiếu phần dư → nợ → BHXH → tổng kết. Thu nhập và chi tiêu dùng hai màn để mỗi màn một câu chính. Thông tin giới tính/hôn nhân chuyển xuống phần thông tin BHXH; mặc định trung lập “Không tiết lộ”/“Khác”, không đoán giới tính hay tình trạng gia đình. Khoản góp vượt phần dư được cảnh báo cả ở bước khoản góp lẫn tổng kết sau khai nợ.
- Sức mua: đọc danh sách bộ giả định đang công bố rồi `GET /me/assumptions/:id`; nhân từng tỷ lệ lạm phát hiệu dụng năm, phần năm tính theo số tháng/12. Mốc đầu là tháng hiện tại theo giờ Việt Nam, mốc cuối là tháng nghỉ hưu người dùng chọn. Hiển thị phép tính, kết quả ước tính, phiên bản và nguồn liên quan. Không ngoại suy năm thiếu, không dùng tỷ lệ dự phòng khi API lỗi.
- Ba thẻ kế hoạch: mỗi thẻ gọi `POST /me/retirement/preview`, debounce 350 ms và hủy request cũ bằng AbortController. Thẻ giữ nguyên; thẻ đổi tháng nghỉ +60 tháng; thẻ giảm mức chi còn 85% (làm tròn tới phần trăm đồng theo định dạng tiền API). Không đổi các đầu vào khác, không lưu/áp dụng phiên bản. Không gọi phương án nghỉ muộn khi mốc mới vượt `endMonth`. Hiển thị trực tiếp `summary.atRetirement` và `requiredConstantMonthlyContribution`; null hiển thị “Chưa xác định”.
- Danh mục: giải thích vai trò tiền gửi, TPCP, cổ phiếu, vàng và nhóm tài sản chính sách v1. Không thêm tính toán lỗ do cú sốc.
- Đối tác: chỉ render sản phẩm khi `isVisible === true`; thẻ và hộp chi tiết có nhãn thông tin tham khảo, không khuyến nghị cá nhân. Không xếp hạng hay đối sánh hồ sơ. Trang AI không có thẻ catalog; thêm nhãn tham khảo cho mỗi câu trả lời trợ lý.

## Các giới hạn cần biết khi review

1. API nháp onboarding hiện tại không có `goal`, `monthlyExpenseToday`, `retirementMonth`, `monthlyContribution`. Dùng đúng `RetirementPlanContext.updateDraft` hiện có, với các trường đã thuộc `RetirementPreviewInput`; chúng nằm trong nháp kế hoạch theo tài khoản của phiên (sessionStorage hiện hành), chưa lưu lên tài khoản cho tới khi lưu phiên bản kế hoạch. UI nói rõ điều này. Không thêm localStorage hoặc trường giả, không thay hợp đồng API. Số liệu hồ sơ vẫn dùng API nháp cũ. Bước khoản góp ánh xạ sang enum `investment` đã có; sức mua là màn phụ của bước `personal`, không gửi enum mới.
2. Không đổi schemaVersion: onboarding tổng hợp vẫn hoàn tất hồ sơ v1; hồ sơ v2 tiếp tục được bảo vệ khỏi ghi đè. Tháng sinh chính xác và phân bổ phần tài sản dành cho hưu trí vẫn phải xác nhận trong hồ sơ chi tiết. Mục tiêu và tháng nghỉ được giữ trong nháp kế hoạch để dùng cho preview.
3. Nút “Chưa biết, bổ sung sau” bỏ qua việc bổ sung lịch sử BHXH, không tự tạo mức lương hưu. Hồ sơ tổng hợp v1 chỉ có số năm/lương đóng, chưa có trạng thái UNKNOWN riêng cho các tổng này. Lương hưu phải khai trong hồ sơ chi tiết; chuyển sang v2 vẫn giữ pension UNKNOWN theo cơ chế hiện có. Không coi số năm đóng bằng 0 là kết luận không có lương hưu.
4. Ba thẻ áp dụng cho kế hoạch dự phóng từ hồ sơ. Với kế hoạch đã dùng số dư thực tế (`preview.reforecast`), giữ luồng “Theo dõi thực tế” hiện có và không hiển thị ba thẻ gọi preview từ hồ sơ, vì như vậy sẽ bỏ mất số dư đã ghi. Đây là giới hạn tích hợp cần lưu ý nếu mở rộng so sánh từ số dư thực tế.
5. Chỉ nghiệm thu với API giả lập; chưa xác minh độ phủ dữ liệu của bộ giả định thực đang công bố. Không kết nối database. Khi thiếu năm hoặc API lỗi, màn sức mua không đưa ra số thay thế.
6. Nội dung câu trả lời AI là văn bản do backend cung cấp. Frontend gắn nhãn tham khảo, không tạo sản phẩm hay xếp hạng; việc bảo đảm AI không phát sinh lời khuyến nghị sản phẩm trong văn bản cần kiểm soát ở backend/provider, ngoài phạm vi lần này.

## Câu hỏi chưa thêm vì thiếu backend

- Mức lỗ chịu được bằng tiền.
- Độ ổn định thu nhập.
- Số tiền cần trong 1/3/5 năm.
- Danh sách mục tiêu có hạn và thứ tự ưu tiên.

Không lưu tạm bất kỳ câu trả lời nào cho các mục này. Không tự tính mức lỗ khi có cú sốc (chờ P1-6).

## File thay đổi trong lượt này

File mới:

- `src/components/PurchasingPower.tsx`
- `src/components/AssetRoles.tsx`
- `src/components/retirement/GuidedScenarios.tsx`
- `src/components/retirement/guided-scenarios.css`
- `tests/guided-planning.spec.ts`
- `GUIDED_PLANNING.md`

File sửa:

- `src/pages/OnboardingPage.tsx`
- `src/pages/onboarding-readability.css`
- `src/pages/RetirementPlanPage.tsx`
- `src/pages/RiskPortfolioPage.tsx`
- `src/pages/ExplorePage.tsx`
- `src/pages/AIAssistantPage.tsx`
- `src/services/api.ts` (truyền AbortSignal tùy chọn, không đổi payload/endpoint)
- `src/services/retirement.ts` (signal cho preview)
- `src/services/financialProfile.ts` (ánh xạ bước khoản góp)
- `src/utils/portfolioGlidePath.ts` (nhãn nhóm tài sản v1)
- `tests/onboarding-readability.spec.ts` (đi qua thứ tự mới, giữ kiểm tra nháp/lỗi lưu)

## Nghiệm thu

Thư mục chạy: `E:\An_Huu\frontend`.

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | Qua |
| `npm run test:assets` | 75/75 qua |
| `npm run build` | Qua, prerender 4 trang; cảnh báo bundle lớn hơn 500 kB |
| `npx playwright test tests/guided-planning.spec.ts tests/onboarding-readability.spec.ts tests/portfolio-policy-v2.spec.ts` | 20/20 qua |
| `git diff --check -- frontend` (từ thư mục repo) | Qua |

Playwright dùng Chromium đã cài bằng `$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\os\AppData\Local\ms-playwright'`. Lần đầu thiếu browser trong đường dẫn sandbox, lần tiếp bị sandbox chặn localhost (`ERR_NETWORK_ACCESS_DENIED`); chạy lại ngoài sandbox đã qua. Mọi API được mock; preview server trả 503 cho API thiếu fixture, không chuyển tiếp vào backend.

Kiểm tra gồm desktop/mobile 1440/768/390/375 px, chiều cao ngắn 400 px, nháp và hoàn tất v1, bản dịch Anh, tỷ lệ lạm phát khác nhau theo năm, thiếu năm, lỗi API, ba kịch bản, giới hạn ngày kết thúc, kết quả null/INCOMPLETE, phản hồi cũ khi đổi đầu vào, sản phẩm ẩn và vai trò tài sản. Bộ `portfolio-policy-v2.spec.ts` giữ nguyên và qua cả v1/v2.

Ảnh xem xét trực quan (được gitignore): `test-results/purchasing-power-375.png`, `test-results/purchasing-power-1440.png`, `test-results/guided-scenarios-mobile.png`.
