# Kiểm tra mức hoàn thiện website — 08/10/2026

**Cập nhật sau audit:** các lỗi frontend được liệt kê dưới đây đã được xử lý trong lượt tiếp theo, xem [bàn giao sửa frontend](frontend-fixes-2026-10-08.md). Bảng phát hiện và số test bên dưới giữ làm bằng chứng trước sửa; các giới hạn backend/dữ liệu/vận hành vẫn còn hiệu lực.

**Kết luận: chưa hoàn thiện toàn bộ.** Backend và frontend đã có nền tảng, nhiều luồng nghiệp vụ và kiểm thử, nhưng còn lỗi kết nối form với engine, nhánh BHXH chưa hỗ trợ đầy đủ, dữ liệu chưa được duyệt và nghiệm thu vận hành chưa khép kín. Không quy đổi checkbox lịch sử thành phần trăm hoàn thành.

Lượt này kiểm code hiện tại, chạy lại kiểm tra cục bộ và browser API giả lập. Không nạp `seed-datafull.sql`, không ghi DB thật, không gọi nhà cung cấp hoặc triển khai production. Trạng thái DB bên dưới lấy từ lần audit chỉ đọc ngày 08/10, không phải một lần kết nối DB mới trong lượt này.

## Các lỗi còn tồn tại đã xác định

| Ưu tiên | Phát hiện và ảnh hưởng | Bằng chứng |
|---|---|---|
| P1 | **BHXH Nhà nước thiếu `caseDetails`.** Form chỉ thêm trường này khi `estimateMode === ordinary`; chọn `state` chỉ gửi `stateSalaryCase`. Hồ sơ đầy đủ vẫn bị engine trả `NORMAL_EMPLOYEE_CASE_REQUIRED`. | `frontend/src/components/SocialInsuranceModal.tsx:502,519`; `backend/src/modules/pensions/state-assessment.ts:83`. Probe cục bộ: fixture ELIGIBLE → bỏ đúng trường form thiếu → INSUFFICIENT_DATA. |
| P1 | **Đóng trước BHXH không thể đi qua kiểm tra ngày.** Form luôn gửi `benefitRequestDate: null`; đồng thời lấy `periodStartMonth` bằng tháng hưởng. Backend yêu cầu ngày đề nghị hưởng và tháng ngừng đóng = tháng hưởng − 1, nằm trong kỳ đã đóng; kỳ bắt đầu ngay tháng hưởng không đáp ứng điều kiện này. | `SocialInsuranceModal.tsx:496,585`; `backend/src/modules/pensions/voluntary-assessment.ts:95–96`. Probe với fixture đủ điều kiện, chỉ đổi ngày yêu cầu về null đã trả `PREPAID_BENEFIT_REQUEST_REQUIRED`. |
| P1 | **Dời khoản góp tài sản vẫn gán revision 1.** Khi actual tháng đã lên revision 2 trở lên, UI gửi chứng minh cũ và backend từ chối 409; preview lại không sửa được hằng số này. | `frontend/src/pages/SimulationTrackingPage.tsx:1894`; `backend/src/modules/capital/source-candidate.ts:157`. Đối chiếu code; chưa chạy browser riêng cho nhánh missedContribution. |
| P1 | **Form còn tự dựng chứng từ/xác nhận.** Tên chứng từ thay thế khi để trống, hash từ chuỗi mô tả/tháng/ngày; nhánh prepaid tự gán `benefitRequest.confirmation: DOCUMENTED`. Định dạng hash hợp lệ không chứng minh đã có chứng từ thật. | `SocialInsuranceModal.tsx:512,520,534,553,572,593,599`; `frontend/src/services/insurance.ts` còn fallback hash 64 ký tự `a` khi cả Web Crypto và Node crypto lỗi. Không coi đây là bằng chứng tài liệu thực. |
| P2 | **UI BHXH Nhà nước chưa nhập đủ các nhánh đang cho chọn.** Payload thiếu `hazardousPeriods/hazardousWindowFrom`, lịch tháng chưa cho khai `pre2004Conversion/includesSeniorityAllowance`. Chọn chuyển nghề nặng nhọc/thâm niên có thể thiếu đầu vào bắt buộc. Thai sản vẫn phải gõ `creditKind` thay vì chọn đúng theo giai đoạn. | `SocialInsuranceModal.tsx:295,522,1445`; `backend/src/modules/pensions/insurance-schema.ts:129`; `state-assessment.ts:77,175`. |
| P2 | **Đầu vào tiền BHXH còn làm tròn trước khi gửi.** `Math.round(Number(newBase))` đổi giá trị thập phân và làm mất độ chính xác với số lớn. | `SocialInsuranceModal.tsx:319`; trái yêu cầu giữ chuỗi Decimal trong FE-00–FE-11. |

Hai probe BHXH dùng engine nguồn và fixture cục bộ, không mock kết quả tính; chứng minh lỗi thiếu trường, không thay kiểm end-to-end hay kết luận pháp lý. Bằng chứng riêng: `backend/.tmp/feature-completion-probes-20261008.json`.

## Phạm vi đã có và mức hoàn thiện

| Nhóm chức năng | Backend | Frontend / nghiệm thu |
|---|---|---|
| Xác thực, OTP, tài khoản, phân quyền | Có API và unit tests | Có route/form và browser đại diện; chưa kiểm lại email/OAuth/provider thật |
| Onboarding, hồ sơ, mục tiêu | Có service/schema | Có UI và các test lưu/reload/đổi tài khoản; dữ liệu mục tiêu DB cũ còn lỗi enum theo audit |
| Kế hoạch hưu, mô phỏng, phiên bản, actual, báo cáo | Có engine Decimal, snapshot, preview/save/apply, replay và API | Có màn/service; còn thiếu nghiệm thu liên màn/report/CSV đúng version cho mọi nhánh |
| Vay, trả một phần, refinance thực tế/dự kiến | Có code tích hợp source-reforecast, lifecycle và tests | Đã có form. Refinance thực tế lấy eventId/revision/ngày từ actual. Chưa phủ toàn bộ lifecycle qua browser/DB |
| Tài sản PLANNED/REALIZED/STAGED, thuê sang bán | Có nguồn, đối soát và tests | Có form, nhưng missedContribution còn revision cố định; nhánh phức tạp chưa đủ browser |
| BHXH và quản trị bộ luật | Có lịch đóng, estimate, quy trình luật và nhiều strategy | Có UI nhưng còn các lỗi P1/P2 trên; bộ luật thật chưa được công bố theo audit gần nhất |
| AI, thư viện kiến thức, bài viết | Có API/provider adapter/consent/retrieval | Có màn, nhưng nguồn DB gần nhất chưa đủ điều kiện truy xuất; browser không chứng minh AI live |
| Đối tác, hỗ trợ, thông báo, quản trị/cấu hình | Có route/service và UI tương ứng | Kiểm thử đang có không bao phủ toàn bộ CRUD, quyền, lỗi provider và nghiệp vụ admin |
| Vận hành | Có worker/retention và bộ kiểm migration/backup thử nghiệm | Chưa đủ bằng chứng scheduler/giám sát/backup-restore production, quyền xóa sau phục hồi, P36 và nhà cung cấp |

Đã xác nhận ghi chú cũ “planned refinance chỉ có engine nội bộ” không còn đúng: runtime có `plannedRefinances` trong schema và composer, API source-reforecast đã nối; frontend có CREATE/REVISE/CANCEL. Không liệt kê nó là tính năng chưa được tích hợp.

Các bản sửa trước được giữ: preview V4 lưu nguyên payload đã xem trước (`SimulationTrackingPage.tsx:1952`), refinance dùng actual đã chọn (`:1374`), cache GET tách phiên (`services/api.ts:17,141`).

## Backend vẫn giới hạn phạm vi BHXH

Đây là giới hạn triển khai được code biểu diễn, không phải đánh giá lại quy định pháp luật:

- `benefit-assessment.ts:50`: các specialPeriods cần nhánh đánh giá riêng.
- `state-assessment.ts:143,177–178,193`: lực lượng đặc thù, một số cách xử lý thâm niên và đoàn hệ lịch sử còn REVIEW_REQUIRED.
- `voluntary-assessment.ts:94,198`: thanh toán đóng trước/đóng bù giới hạn năm 2026; các bảng chưa có không được tự điền số tương lai.
- Các draft luật/corpus qua test chưa đồng nghĩa được người có thẩm quyền duyệt và PUBLISHED.

## Dữ liệu và nghiệm thu thật

[Audit DB ngày 08/10](database-audit-2026-10-08.md) ghi nhận 50 mục tiêu sai enum, ngày metadata của 50 hồ sơ lệch JSON, 5 bài thiếu searchText/ngày xuất bản, 0 nguồn kiến thức đủ điều kiện retrieve và các bảng kế hoạch/actual/BHXH còn rỗng. Các bảng rỗng không phải lỗi tự thân, nhưng không có lịch sử thực để nghiệm thu replay/đối soát trên dữ liệu đang lưu.

[Bộ seed đã chuẩn bị](data-package-review-2026-10-08.md) **chưa được nạp**. Không coi lỗi DB đã được sửa chỉ vì file SQL qua test. Bộ đề xuất giữ giả định chưa xác minh ở DRAFT, danh mục/nội dung chưa duyệt ở trạng thái ẩn; cần hoàn tất phê duyệt trước khi coi các tính năng phụ thuộc đã vận hành.

## Kiểm tra chạy lại trong lượt này

- Backend typecheck nguồn và test: đạt; unit suite **666/666, 57 file** đạt. Prisma generation trong thư mục riêng và TypeScript emit đạt; không gồm DB integration hay startup production.
- Frontend typecheck: đạt; `test:assets` **58/58** đạt; build và prerender 5 trang đạt. Còn cảnh báo bundle lớn và Node crypto externalized.
- Hai probe engine BHXH: xác nhận cả hai lỗi form nêu trên trên fixture vốn ELIGIBLE.
- Browser mở rộng: **71/76 đạt, 5 thất bại, 0 skipped**, 8,1 phút, API giả lập. Bao gồm các luồng FE-11, refinance/preview/session, auth/account/profile/knowledge, admin layout, responsive, page audit và UI fixes.
- Bốn thất bại `page-audit` ở 390/768/1024/1440 đều do test đòi `/verify` giữ nguyên URL, trong khi `App.tsx:108` chủ động chuyển sang `/register`. Mỗi viewport đã đi qua 38 đường dẫn; các assertion về JavaScript, ảnh, tên điều khiển và overflow không thất bại. Không coi chuyển hướng đúng router là lỗi sản phẩm.
- Một thất bại `ui-audit-fixes.spec.ts:83` đòi focus quay về nút tạo tài khoản sau Escape. Runtime `AuthPages.tsx:624` chủ động focus ô email để sửa địa chỉ. Cần thống nhất tiêu chí với hành vi này; test hiện không đạt, chưa có bằng chứng mất focus ra ngoài trang hay OTP không đóng.
- Đã lưu báo cáo browser riêng `backend/.tmp/feature-completion-browser-20261008.json`; các ca thất bại có trace tại `backend/.cache/t12-browser-artifacts`. Lượt audit này chưa sửa test để biến suite thành xanh.
- Lượt đầu build/test bị EPERM sandbox; đã chạy lại ngoài sandbox và đạt. Không ghi nhận EPERM như lỗi nghiệp vụ.

Rà bố cục trang dùng dữ liệu giả lập và có màn đi qua trạng thái lỗi API dự kiến/thiếu fixture. Một trang không tràn ngang hoặc không crash không chứng minh nội dung/API thật của trang hoạt động. Danh sách rà trang hiện cũng chưa có `/admin/legal-rules`; không dùng kết quả này để đóng toàn bộ quản trị luật hoặc form mở rộng.

## Thứ tự hoàn thiện

1. Sửa payload và chứng từ BHXH Nhà nước/đóng trước, liên kết actual revision khi dời góp tài sản; thêm browser gọi engine hoặc contract nghiêm cho các nhánh này.
2. Hoàn thiện các trường BHXH Nhà nước/thiếu căn cứ, giữ Decimal; rà các màn còn tự mặc định chứng từ.
3. Nghiệm thu FE-11: từng nhánh preview → save → apply → reload → report/CSV, 409/422, retry, hai tab, đổi tài khoản; kiểm các race với DB tạm riêng.
4. Duyệt và nạp dữ liệu theo quy trình riêng; xác nhận cấu hình/luật/knowledge công bố thực sự dùng được.
5. Nghiệm thu staging/production và nhà cung cấp, scheduler/giám sát, backup/restore trước tuyên bố hoàn thành toàn bộ.
