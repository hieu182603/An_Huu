# Kết quả hoàn thiện và review thuật toán 7 bước — 20/11/2026

Đã tiếp tục phần Antigravity dừng do quota, hoàn thiện cơ chế trong phạm vi code và kiểm tra lại theo `sites/an-huu-trai-nghiem/thuat-toan-phan-bo-tai-san.md` cùng `docs/plan-sua-thuat-toan-7-buoc-2026-11-20.md`. Kết quả là bản sửa local để duyệt, chưa phải xác nhận nghiệm thu production: dữ liệu thị trường, đo Azure B2, triển khai migration và một số màn vận hành còn ở cuối báo cáo.

## Đối chiếu từng bước

| Phạm vi | Kết quả trong code | Trạng thái/giới hạn |
|---|---|---|
| A1–A5 | Phí v5 cùng quy ước giữa preview/mô phỏng; trần 1.000 đường dùng một nguồn; K 6–12; kích hoạt khi độ lệch ≥ dải; cache phép dựng/kiểm danh mục làm C03 nhanh hơn | Đã kiểm. Phí v3 giữ nguyên; chưa dùng thời gian local để chứng nhận B2 |
| B1-1..3 — hoàn cảnh, dòng tiền | Danh sách nghĩa vụ có thứ tự ưu tiên, lịch nợ và giá trị danh nghĩa theo kỳ; đòn bẩy thứ tư lùi mục tiêu FLEXIBLE/deferrable; cảnh báo chưa khai chi người phụ thuộc | Đã có API và UI. Tổng chưa tính được trả `null`, không giả thành 0. Chỉ tìm lùi theo bậc 6 tháng, tối đa 60; dựng lại vốn bảo vệ cho từng biến thể |
| B2-1..4 — khả năng chịu rủi ro | Nhập hai giới hạn lỗ độc lập với `BOTH`, lấy min và chỉ rõ giới hạn ràng buộc; cơ chế phản ứng tâm lý/nghề nghiệp theo chính sách; nhu cầu thanh khoản 12/36/60 tháng | Đã kiểm. Khối chưa được duyệt không áp hệ số/trần. Chưa có ánh xạ ngành: yêu cầu loại ngành công ty trả REVIEW_REQUIRED, không tự nhận đã loại |
| B3-1..2 — vốn bảo vệ | Đề xuất đối soát mục tiêu trùng; chỉ xác nhận/bỏ xác nhận theo thao tác khách; trừ đúng phần mục tiêu RESERVED trong cùng thời hạn; công khai căn cứ lãi tiền gửi theo kỳ hạn | Đã có UI/API. Không tự ghép; UNKNOWN chặn chọn phương án; mục tiêu ngoài 12 tháng không xóa nhu cầu 12 tháng; phần đã khớp được mang sang nhu cầu lũy kế sau |
| B4-1..3 — thị trường | Metadata loại lợi suất/giấy phép; chặn công bố dữ liệu mới không đạt nếu không có override có lý do; đọc bản cũ không sửa hash; cảnh báo lịch sử ngắn, giá đứng, nhìn trước, ngoại lệ; Ledoit–Wolf mục tiêu tương quan không đổi | Cơ chế đã kiểm. Dữ liệu nháp hiện có chưa đủ chuẩn tổng lợi suất/giấy phép. Vàng chưa rõ chiều giá được ghi rõ; không tự gán BUY. Bootstrap vẫn lấy mẫu lịch sử, không co kỳ vọng |
| B5-1..5 — tập danh mục | Ràng buộc tiền mặt, giới hạn lỗ, tỷ trọng, nghề nghiệp ở mọi tháng; truyền tài sản khóa và hard limits cho bộ tối ưu; lưới cố định công khai loại tài sản khóa; draft tối ưu liên tục và C17 | Đã kiểm, tối ưu production vẫn tắt. Solver trả FEASIBLE kèm OPTIMALITY_NOT_CERTIFIED, không chứng nhận tối ưu toàn cục. Lô/trần tổ chức thuộc tầng thực thi, không giả thành ràng buộc lớp tài sản |
| B6-1..9 — mô phỏng, đánh giá | Tiến độ tới 1.000 đường; sốc chứng khoán nhiều offset và kết quả xấu nhất; hai thứ tự cùng tập lợi suất; spread vàng nhiều mức; mất thu nhập chỉ trong tích lũy; y tế/chăm sóc theo tham số; tháng thiếu tiền đầu tiên; giải thích cá nhân hóa; API ngưỡng trong khoảng cho phép | Cơ chế và UI kịch bản đã kiểm. Tham số chưa duyệt không tự bật. B6-8 có API, UI chọn ngưỡng còn bàn giao. Đo B2 sau deploy còn mở |
| B7-1..6 — theo dõi, tái cân bằng | Lịch sử đề xuất/quyết định theo chủ sở hữu; so sánh pE trước/sau tùy chọn 20 đường; tiền góp/cổ tức/đáo hạn trước giao dịch; kiểm lại dải sau phân bổ tiền; route drift và lệnh sản phẩm theo lô; phí ngày thực tế/365 cho v5; sàn chi tiêu từ đúng tháng nghỉ hưu | Đã kiểm local/DB tạm. Sàn áp cả ứng viên, mô phỏng, mục tiêu lưu và đề xuất thực tế, kể cả mức thiếu <5 điểm %. UI lịch sử/giám sát/lệnh còn bàn giao; migration chưa áp DB thật |

## Các lỗi review đã sửa thêm

- Thanh khoản: xác nhận mục tiêu 10 triệu không được xóa nhu cầu 100 triệu; mục tiêu sau 24 tháng không phủ nhu cầu 12 tháng; không tính lại phần đã phủ ở các cửa sổ lũy kế. Nhu cầu khai UNKNOWN không được đi tiếp như 0.
- Nghĩa vụ: dùng số danh nghĩa của replay hoặc `futureAmount`, cắt theo kỳ kế hoạch; không dùng tiền hôm nay giả làm số danh nghĩa tương lai, không tính trùng chi trước/sau nghỉ hưu. Workspace chưa có lịch sinh hoạt đầy đủ trả `null`.
- Tiền tự do: phân bổ trước, kiểm dải sau. Ví dụ cổ phiếu 600/tiền 400 + góp 100 trở thành 600/500, lệch 4,545%: chỉ phân bổ tiền, không bán/mua phần còn lại, không tính phí giao dịch. Lệnh sản phẩm cộng `cashAllocated + buy` đúng một lần rồi làm tròn xuống theo lô.
- Phân loại sản phẩm an toàn: nhóm sản phẩm BOND bao gồm cả quỹ trái phiếu và trái phiếu Chính phủ. Khi bật sàn, chỉ metadata GOVERNMENT_BOND mới được dùng như trái phiếu Chính phủ; hồ sơ quỹ/mapping trộn an toàn và rủi ro trả REVIEW, lệnh mua không tự chọn quỹ trái phiếu thay thế.
- Sàn chi tiêu: tỷ trọng mục tiêu và tài sản thực tế đều phải đạt mức tối thiểu đã giới hạn bởi chính sách từ tháng nghỉ hưu. Thiếu 3 điểm % cũng kích hoạt `SPENDING_FLOOR_BREACHED`; giữ hành vi dải thông thường khi không bật sàn. Cache phân biệt hai chế độ. Xác suất so sánh tỷ trọng cố định bỏ cơ chế tự sửa sàn để phản ánh đúng hai giả thuyết trước/sau.
- Trần nghề nghiệp được kiểm trên mọi tháng, không chỉ tháng đầu. Tái cân bằng theo kế hoạch dùng đúng policy/template/tháng và kiểm chủ sở hữu; lưu quyết định không được gắn phiên bản kế hoạch tài khoản khác.
- Sửa hồi đáp đến muộn ghi đè số vốn người dùng đang nhập. Giao diện giải thích đúng điều kiện ≥ dải, có lý do riêng khi thiếu sàn.

## Tương thích có chủ đích

`PERCENT`/`AMOUNT` cũ thường lưu thêm trường thứ hai là số quy đổi tự động. Chỉ `BOTH` biểu thị hai giới hạn do khách nhập độc lập; không lấy min một số quy đổi lịch sử với cơ sở vốn mới. Hồ sơ cũ và 15 ca phần trăm giữ kết quả chọn danh mục. Các khối phản ứng tâm lý, nghề nghiệp, chăm sóc y tế, thuế/phí mới và sàn chi tiêu đều tùy chọn; không có chính sách được duyệt thì không áp. Không tự thêm thuế suất, nguồn dữ liệu, loại ESOP hay thời gian chăm sóc.

## Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Toàn bộ backend `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --reporter=dot` | **1.613/1.613 test, 147/147 file PASS**, 239,48 giây; log `.tmp/resume-verified-backend-20261120.log` |
| Backend source + test TypeScript | PASS; `tsc -p tsconfig.test.json` và source emit qua isolated build |
| Prisma generate/build/startup | `verify-build-isolated.cjs`: ISOLATED_PRISMA_GENERATION_PASS, TYPESCRIPT_EMIT_PASS; startup thiếu secrets từ chối an toàn, không kết nối DB |
| OpenAPI Swagger Parser | VALID, **186 path/120 root schema**, giữ182path cũ +4path mới; trường mới/generator đồng bộ |
| Frontend | TypeScript,133test assets,18test logic, build cuối sau sửa copy PASS; Playwright allocation-custom20/20, allocation-result-review37/37 PASS trên build mới |
| Bảo vệ lịch sử | SHA-256 **22/22 file** giữ nguyên: engine-v2/v3 và20migration đến202611190001 |
| Vệ sinh diff/file tạm | `git diff --check` PASS; không có `zz-tmp-*`/`*.tmp.ts`/script vá trong source |

Các kiểm cụ thể quan trọng: phí v5 28/31 ngày, ngưỡng bằng 5 điểm %, residual/cumulative liquidity, trần nghề nghiệp ở tháng sau, sàn nhỏ hơn dải với fast/fee/no-band kernel, cash-only thành lệnh mua theo lô, quyền quyết định và xác suất, nghĩa vụ theo số danh nghĩa, C16/C17, replay v3 và hợp đồng API. Test cũ đòi mất thu nhập READY dù đã nghỉ hưu được sửa sang NOT_APPLICABLE; kịch bản thứ tự lợi suất chưa có tham số trả REVIEW_REQUIRED, không giả thêm tham số vào fixture.

## Audit và golden

- Chụp trước khi tiếp tục: `.tmp/golden-before-resume-20261120.json` (15 ca). Milestone A trước đó đã so IDENTICAL với golden trước plan bằng script gốc.
- Sau triển khai: `.tmp/golden-after-resume-20261120.json` (17 ca). Comparator gốc không bị nới quy tắc; so toàn bộ hai file phải DIFFERENT vì có thêm trường/ca và thay kịch bản được plan cho phép. Danh sách đầy đủ 432 lá thay đổi ở 15 ca cũ: `.tmp/audit-differences-resume-20261120.json`.
- Các nhóm thay đổi: disclosure thị trường/giấy phép/chiều giá vàng/bootstrap; `reactionApplied`/`bindingLimit`; giải thích thời hạn; kịch bản/firstShortfallMonth; đòn bẩy lùi mục tiêu. Số tài chính ở selection 15 ca cũ giữ nguyên. Thay số ở kịch bản cũ tập trung INCOME_LOSS C09/C12 do cắt cửa sổ theo đúng plan.
- C16: pE nền 0,85; lùi mục tiêu 300 triệu từ 2029-10 đến 2031-10 (24 tháng) đạt 0,90 sau 4 lần thử, giữ chi thiết yếu. C17: ứng viên CONTINUOUS qua feasibility/giới hạn lỗ và mô phỏng trong memory DB.
- So tối ưu bật/tắt C01–C15 (`.tmp/optimizer-on-20261120.json`): trạng thái đạt/không đủ/thiếu dữ liệu không đổi; tham khảo C05 và C15 chuyển sang CONTINUOUS, vẫn INSUFFICIENT; 13 ca khác giữ tham khảo. Không thay golden hay bật optimizer production vì thử nghiệm này.

Audit cuối `.tmp/golden-final-20261120.json` đạt **17/17 trạng thái**, chạy 95,83 giây. So bằng comparator gốc với file 17 ca sau triển khai chỉ còn **4 khác biệt nhãn** (`C16.title`, `C16.input.title`, `C17.title`, `C17.input.title`) do sửa chữ tiếng Việt bị mất dấu; mọi trường tính toán so được đều trùng. Không bỏ các nhãn khỏi comparator để gọi kết quả IDENTICAL.

Thử local `node scripts/bench-simulation.cjs --cases=C01 --paths=1000 --workers=0,1`: C01 **READY 1.000 đường**, không worker 94,96 giây/9 lượt tiếp, một worker 51,39 giây/4 lượt tiếp; C01 có 2 ứng viên được mô phỏng sau khi loại ứng viên vượt bounds. Log `.tmp/benchmark-local-1000-20261120.log`. Đây là kiểm chạy được ở máy local, chưa phải kết quả C05/C15 hay SLA Azure B2.

## PostgreSQL và triển khai còn mở

`node scripts/verify-rebalance-migration.cjs` đã chạy trên Docker PostgreSQL/pgvector ghim digest riêng, không dùng DB ứng dụng: clean 21 migrations và upgrade 20→21 đạt; 56 bảng cũ giữ nguyên dấu vân tay dữ liệu/cấu trúc; 16 cột mới, 2 index, FK CASCADE, 2 CHECK, insert hợp lệ/không hợp lệ, nullable, chạy SQL lần hai và xóa cascade đạt. Container/volume riêng đã xóa. Bằng chứng: `backend/.cache/rebalance-migration-bc24ae82-421c-4486-81ae-a691265ffdc3.json`; migration SHA-256 `545cd90c8577ad10fdf0aa22ea5a2dee3ae20353b0fb8759b98239dfd192dc9d`.

Verifier toàn schema `verify-clean-upgrade.cjs` dừng ở drift sequence `payment_order_code_seq` thuộc billing có trước (Prisma đưa ra SET DEFAULT rồi DROP DEFAULT/DROP SEQUENCE). Đã giữ nguyên lỗi đó và mọi migration cũ; verifier riêng chỉ chứng nhận migration mới, không chứng nhận toàn schema hết drift. Không áp migration lên DB thật. Lệnh dành cho đợt triển khai đã duyệt: từ `backend`, `node node_modules/prisma/build/index.js migrate deploy`, sau backup và xử lý/đánh giá drift billing.

Còn mở để nghiệm thu vận hành:

1. Chủ sản phẩm/admin thay chuỗi tổng lợi suất cổ phiếu/TPCP, giá mua vào vàng và xác minh giấy phép; quy trình ở `docs/du-lieu-thi-truong-va-ty-trong-mau.md`. Override không biến dữ liệu nháp thành dữ liệu đã xác minh.
2. Chốt và công bố các khối nghiệp vụ đang tùy chọn; chỉ bật optimizer sau dữ liệu đạt chuẩn. Loại ngành công ty còn cần ánh xạ ngành.
3. Đo C01/C05/C15 × 20/100/500/1000 × SIM_WORKERS 0/1 trên Azure B2 sau deploy. Script đã có; mốc ≤3 phút là đề xuất chờ chốt, chưa được chứng nhận bằng máy local.
4. UI chọn ngưỡng, lịch sử/quyết định, drift và lệnh sản phẩm: xem mục bàn giao mới trong `docs/task-frontend.md`.
5. Duyệt migration, triển khai và nghiệm thu browser/API với tài khoản thật đúng quyền. Chưa commit, push, deploy, công bố chính sách hay gọi nhà cung cấp trong đợt này.
