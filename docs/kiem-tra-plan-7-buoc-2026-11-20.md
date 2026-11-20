# Kiểm tra phần việc theo plan sửa thuật toán 7 bước (20/11/2026)

Plan: `docs/plan-sua-thuat-toan-7-buoc-2026-11-20.md`. Báo cáo tự khai của AI thực hiện: `docs/bao-cao-hoan-thien-thuat-toan-7-buoc-2026-11-20.md` và mục M trong `AN_HUU_ALLOCATION_AUDIT.md`.
Người kiểm chạy lại toàn bộ trên working tree, không dựa vào số liệu tự khai. Các mục đầu ghi checkpoint trước commit; cập nhật commit và kiểm cây mã tách riêng tại §7. Chưa deploy hay áp migration DB thật.

## 1. Kết quả chạy lại (người kiểm tự chạy)

| Kiểm tra | Kết quả |
|---|---|
| Backend typecheck mã nguồn và test | Sạch |
| Backend toàn bộ test | **1.614/1.614**, 147 file; lần cuối chạy cô lập với --maxWorkers=2, 183,18 s; mã nguồn và test typecheck sạch |
| Frontend typecheck, `test:assets`, `test:logic` | Sạch; 133 + 18 |
| E2E trên bản build mới | allocation-custom **30/30** (107.89 s), allocation-result-review **37/37** (108.7 s); không retry, sau build cuối |
| Bộ audit (15 ca gốc + C16, C17) | Qua |
| So golden với bản chụp trước khi làm plan (`.tmp/golden-before-plan.json`) | Sau khi bỏ đúng các trường plan cho phép đổi: **IDENTICAL**. Không có số tính toán nào bị đổi ngoài dự kiến |
| C03 (A5) | 5,9 s → 3,8 s, đạt mục tiêu ≤ 4 s |

Các khác biệt golden đều thuộc loại plan cho phép:
- mã giới hạn mới trong `disclosure.limitations` (`BOOTSTRAP_USES_HISTORICAL_MEAN`, `MARKET_DATA_NOT_TOTAL_RETURN`, `LICENSE_UNVERIFIED`, `GOLD_LIQUIDATION_PRICE_SIDE_UNVERIFIED`);
- chuỗi `rule` có thêm đuôi `; ASSET_CLASS_LEVEL; LOT_AND_ISSUER_LIMITS_AT_EXECUTION`;
- trường `explanation` mới;
- các trường thêm bindingLimit, reactionApplied, deferFlexibleGoals, firstShortfallMonth; không có giá trị nào khác nhau ở các trường này nếu cùng tồn tại trên cả hai bản;
- trường `window` mới cho kịch bản mất thu nhập;
- kịch bản `SEQUENCE_OF_RETURNS` mới;
- C09, C12: mất thu nhập chuyển từ `REVIEW_REQUIRED` sang `READY` (`windowAdjusted`, B6-5).

## 2. Tiến độ từng việc

Ký hiệu: **Xong** = có code, có test, người kiểm đã thấy; **Cơ chế** = có code và test nhưng tắt cho tới khi chính sách có tham số được duyệt (đúng yêu cầu plan); **Mở** = chưa làm hoặc chưa thể làm.

| Mã | Trạng thái | Ghi chú của người kiểm |
|---|---|---|
| A1 phí v5 trong mô phỏng | Xong | `simulation.ts:148` truyền cờ v5 |
| A2 trần số kịch bản | Xong | `simulationPaths` max = `LIMITS.maxPaths`; chú thích đã sửa |
| A3 K 6–12 | Xong | `assumptions/schema.ts:34` min 6, max 12; có cảnh báo `RESERVE_MONTHS_OUTSIDE_METHOD_RANGE` |
| A4 ngưỡng ≥ 5 | Xong | Không còn `.gt(band)`; `screenBand` vẫn rơi về Decimal khi sát ngưỡng |
| A5 C03 chậm | Xong | 3,8 s |
| B1-1 nghĩa vụ ưu tiên | Xong | `retirement/obligations.ts`, trả trong workspace và preview |
| B1-2 lùi mục tiêu linh hoạt | Xong | Đòn bẩy thứ 4, có UI; ca C16 |
| B1-3 người phụ thuộc | Xong | Cảnh báo `DEPENDENT_EXPENSES_NOT_DECLARED` |
| B2-1 lỗ theo tiền và % | Xong | `bindingLimit`, lấy min |
| B2-2 phản ứng tâm lý | Cơ chế | Có bản nháp `lossReaction` (chưa duyệt) |
| B2-3 thanh khoản theo mục tiêu | Xong | `capital/liquidity.ts` |
| B2-4 nghề nghiệp, thu nhập bấp bênh | Cơ chế; có nháp CHỜ DUYỆT | T6 đề xuất UNCERTAIN trần cổ phiếu40%, giảm10 điểm khi tập trung người sử dụng lao động; là lựa chọn AI, chưa hiệu chỉnh. Chưa có ánh xạ ngành nên không tự loại ngành |
| B3-1 đối soát mục tiêu trùng | Xong | `matchedGoalId`, khách tự xác nhận |
| B3-2 căn cứ chiết khấu | Xong | `discountBasis` |
| B4-1 metadata dữ liệu, chặn công bố | Xong (cơ chế); **dữ liệu: Mở** | Dữ liệu nháp vẫn chưa đạt chuẩn tổng lợi suất và giấy phép (việc của admin) |
| B4-2 kiểm sai lệch dữ liệu | Xong | Cảnh báo giá đứng, nhìn trước, lịch sử ngắn, ngoại lệ |
| B4-3 Ledoit-Wolf tương quan không đổi | Xong | Có ghi rõ bootstrap không co kỳ vọng |
| B5-1 ràng buộc thanh khoản | Xong | `LIQUIDITY_CONSTRAINT` |
| B5-2 tài sản khóa | Xong | `LOCKED_HOLDINGS_EXCLUDED`; ESOP chờ chốt |
| B5-3 phạm vi lô/tổ chức phát hành | Xong | Ghi trong `rule` |
| B5-5 bộ tối ưu liên tục | Cơ chế | Có bản nháp và ca C17; production vẫn tắt (đúng plan) |
| B6-1 1.000 kịch bản | Một phần; B2 vẫn Mở | Giữ số local đã đo: C01 95 s không worker / 51 s một worker. T3 có checklist, chưa deploy; T4 chưa đo B2. Không lấy E2E20 đường thay benchmark1.000 đường |
| B6-2 sốc chứng khoán nhiều mốc | Cơ chế | Chỉ chạy khi chính sách có `offsetsMonths`. **Bản nháp chính sách chưa có giá trị đề xuất** |
| B6-3 thứ tự lợi suất | Cơ chế | Trả `REVIEW_REQUIRED` ở mọi ca vì chưa có tham số. Xem lỗi L4 |
| B6-4 vàng 5–10% | Cơ chế | Nhận mảng; bản nháp chưa có `[5, 10]` |
| B6-5 mất thu nhập sát hưu | Xong | C09, C12 nay `READY` |
| B6-6 y tế, chăm sóc cuối đời | Cơ chế | Tắt mặc định |
| B6-7 giải thích cá nhân hóa | Xong | Trường `explanation` từ số thật |
| B6-8 ngưỡng khách chọn | Xong API + UI local | Chọn theo range policy khi có; thiếu range giữ ngưỡng ghim. Mock E2E kiểm95%, gửi ngưỡng vào request và giữ nguyên kết quả/ngưỡng90% sau422 |
| B6-9 nhãn "mức nặng" | Xong | `AllocationScenarios.tsx` |
| B7-1 lịch sử quyết định | Xong API + UI local; **Mở trên DB thật** | Có lưu đề xuất, Đồng ý/Bỏ qua, ghi chú và lịch sử; null xác suất hiển thị —, không đặt lệnh. Migration chưa áp DB thật; tích hợp thật chờT3 |
| B7-2 thuế, phí khi bán | Cơ chế; CHỜ CHỐT phạm vi | T6 chỉ thêm evidence pháp lý. Thuế chứng khoán không được áp như một tỷ lệ bán chung mọi lớp tài sản; chưa chọn biểu phí, hai rate vẫn absent |
| B7-3 cổ tức, đáo hạn | Xong | Có `MATURITIES_NOT_RECORDED` khi thiếu dữ liệu |
| B7-4 route giám sát và lệnh | Xong API + UI local | Trang đầu tư đọc drift và lệnh tham khảo theo lô; tách tiền mặt/độ lệch và nhu cầu tái cân bằng, không cộng hai lần tiền BUY. Null hoặc REVIEW_REQUIRED giữ cần rà soát; tích hợp thật chờT3 |
| B7-5 phí ngày/365 | Xong | Chỉ v5; v3 giữ nguyên |
| B7-6 sàn chi tiêu trong lộ trình | Cơ chế; có nháp CHỜ DUYỆT | Base template đề xuất3 năm; hai template khác chưa bật. UI giữ context khi cần sàn, không lách REVIEW_REQUIRED; thiếu sàn dưới dải5điểm vẫn cần tái cân bằng |

## 3. Lỗi và điểm cần xử lý

| # | Mức | Vấn đề | Việc cần làm |
|---|---|---|---|
| L1 | Cao | **3 file tài liệu bị xóa** trong working tree, không nằm trong plan và báo cáo không nhắc: `docs/SECONDARY_FEATURES.md`, `docs/UI_UX_AUDIT.md`, `docs/research-bhxh-no-nguon-moi.md`. Các file vẫn còn trong git (commit `ab2b995`). Chưa rõ AI nào xóa | **Đã chốt 20/11/2026: chủ sản phẩm giữ việc xóa.** Khi commit, 3 file này sẽ bị xóa khỏi repo (vẫn còn trong lịch sử git) |
| L2 | Trung bình | **Không ghi `backend/PROGRESS.md`** (quy tắc 10 của plan). AI ghi vào báo cáo riêng và mục M của audit | **Đã sửa 20/11**: thêm mục "20/11/2026: hoàn thiện cơ chế 7 bước theo plan" vào `backend/PROGRESS.md` |
| L3 | Trung bình | Tham số nháp còn cần căn cứ và duyệt trước khi chạy | Đã có nháp sốc nhiều mốc, sequence, spread, nghề nghiệp và sàn3năm template nền. T6 ghi rõ phần AI tự chọn. Thuế/phí bán theo phạm vi sản phẩm và hai tham số y tế tiếp tục CHỜ CHỐT; không suy ra CPI thành chi phí chăm sóc cá nhân. drafts-schema4/4; goldenT6 chính xác17ca IDENTICAL |
| L4 | Trung bình | Kịch bản `SEQUENCE_OF_RETURNS` trả `REVIEW_REQUIRED` cho **mọi** khách, nên trang "Thử biến cố" luôn có một dòng "cần rà soát" mà khách không làm gì được | **Đã sửa 20/11**: `AllocationScenarios.tsx` không hiện dòng cho kịch bản `REVIEW_REQUIRED` + `APPROVED_SCENARIO_PARAMETERS_REQUIRED`, chỉ liệt kê tên ở chú thích; không còn kịch bản chạy được thì không hiện bảng rỗng; thêm kiểm tra E2E trong `user-allocation-custom.spec.ts`. E2E sau sửa: 20/20 (1 lần lỗi tải trang ở test "fit landscape", chạy lại 2 lần qua) và 37/37 |
| L5 | Thấp | Chuỗi `rule` của response chọn phương án đã đổi (thêm đuôi). Frontend hiện không đọc chuỗi này và test hợp đồng đã qua, nhưng client khác so sánh nguyên chuỗi sẽ lệch | **Đã sửa 20/11/2026**: OpenAPI mô tả chuỗi phân tách bằng `; `, các phần sau là phạm vi có thể bổ sung; client chỉ nên so phần trước dấu `;` đầu tiên. Không đổi response và không thêm trường `scope`. |
| L6 | Thông tin | Migration chưa áp DB thật; nghiệm thu tích hợp B7 còn chờ | T9 đã có UI và kiểm mock/synthetic local gồm ngưỡng, quyết định/lịch sử, drift/lệnh, sàn; chủ SP áp migration/deploy theoT3 rồi kiểm tích hợp thật |
| L7 | Thông tin | Đo 1.000 kịch bản trên B2 chưa làm (cần deploy). Local: 95 s / 51 s cho C01 | Sau deploy chạy `node scripts/bench-simulation.cjs --cases=C01,C05,C15 --paths=20,100,500,1000 --workers=0,1` |

## 4. Đánh giá chung

Các phần local đã kiểm qua như bảng trên; tham số mới vẫn là nháp. T3/T4, duyệt T5, dữ liệu đạt chuẩn T7, quyết định bật T8 và tích hợp thật T9 còn chờ đúng người có thẩm quyền. T10 chưa phải nghiệm thu toàn plan hay production.


## 5. Bằng chứng lượt T10 local (20/11/2026)

Kiểm cuối: backend 1.614/1.614, 147 file; source/test typecheck PASS; frontend typecheck PASS, assets 133/133, logic 18/18; Vite build PASS (cảnh báo chunk lớn sẵn có); E2E 30/30 và 37/37, không retry. Đã xem ảnh bốn màn ở 1440 và 375 px; đường dẫn trong docs/task-frontend.md.

Golden: .tmp/golden-before-T6.json → .tmp/golden-after-T6.json IDENTICAL 17 ca; .tmp/golden-before-plan.json → bản sauT6 qua .tmp/t10-filter-permitted.py IDENTICAL 15 ca gốc. C16/C17 là ca bổ sung nên không ghép với baseline15. Bộ lọc chỉ loại các thay đổi liệt kê tại §1; riêng INCOME_LOSS C09/C12 còn assert trạng thái cũ, trạng thái mới và tham số đúng trước khi loại. Cả hai phép so có 0 lever bỏ qua do hết thời gian.

Lỗi đã gặp và giữ bằng chứng: lần đầu custom 25/27 đỏ do Select không có liên kết nhãn rõ; lần hai 28/30 đỏ với assertion innerText/textContent khác cách biểu diễn và nhãn textarea chứa cả giá trị đang nhập. Đã sửa liên kết label và dùng cùng innerText khi so nguyên kết quả; recovery 2/2 qua. Review cũng sửa việc gắn context kế hoạch không liên quan, gửi note rỗng để xóa, null monitoring giả kết luận không cần tái cân bằng và copy ngưỡng 90% cố định. Ảnh 375 px phát hiện card so sánh tràn/đè nhãn, đã sửa cục bộ và kiểm lại. Không bỏ guard hay nới timeout.

Backend lần chạy chung audit/browser có allocation-deferrable-c16 (1 failed) và allocation-optimizer-c17 (2 failed); không đổi engine/test để làm xanh. Chạy cô lập --maxWorkers=2 sạch 1.614/1.614. Không coi số đo khi tranh CPU là benchmark B2. Log: .tmp/t10-vitest-final.txt, .tmp/t9-first-failed-results.json, .tmp/t9-second-failed-results.json và .tmp/t10-e2e-recovery.txt; bản sau cùng ở .tmp/t10-e2e-custom-final-review.txt, .tmp/t10-e2e-result-final-review.txt.

Ponytail-review lượt đầu có phạm vi đại diện; lượt rà đầy đủ đã được bổ sung tại §6 dưới đây. Các phát hiện correctness trước đó đã xử lý và kiểm hồi quy. Chưa commit/push/deploy, chưa ghi DB thật, chưa publish policy/dữ liệu.


## 6. Đóng phạm vi ponytail-review toàn diff (20/11/2026)

Đối chiếu máy: T2 có đúng 187 đường dẫn, mỗi đường dẫn thuộc một nhóm; không trùng, không thiếu và không dư. Rà đủ 179 đường dẫn nhóm a–f của plan; 8 đường dẫn nhóm g thuộc phiên khác được loại khỏi phạm vi. Bốn file không đổi được đọc thêm làm ngữ cảnh (optimizer, optimizer-feasibility và hai spec result-review). Coverage manifests hợp nhất không có đường dẫn thuộc plan chưa được review.

Phân công review: allocation-risk 53 file thay đổi + 2 file ngữ cảnh; backend khác 56; frontend 39 +2 spec không đổi; root 31 đường dẫn gồm schema/migration, 7 generator, 10 YAML, 3 draft, 4 script và 5 tài liệu/việc xóa đã được duyệt. YAML sinh tự động được rà qua generator và parse đủ 10 tệp; đây là review độ phức tạp, không thay cho audit đúng/sai hoặc đo hiệu năng production.

Ba phát hiện: (1) rule margin lặp trong allocation-workspace.css đã bỏ; (2) infoItem.title không được đọc trong AllocationResults.tsx đã bỏ khỏi state/payload; hai thay đổi được xử lý ở T9, delta riêng +2/−4, net −2 dòng. (3) capital/loss-constraint.ts:54–62 có hai nhánh lặp phép min/binding cho BOTH và dữ liệu cũ, có thể giảm 4 dòng. Giữ nguyên có chủ ý: phân quyền T10 chỉ cho sửa tài liệu, T1/T6/T7 không cho sửa module tính toán này; chưa có lỗi đúng/sai được chứng minh, không mở refactor engine để xử lý phát hiện style. Không bỏ guard thiếu dữ liệu.

Sau batch T9 nhỏ: typecheck PASS, assets 133/133, logic 18/18; build 12,70 s; custom 30/30 (107,89 s), result-review 37/37 (108,70 s), không retry. Mã backend có SHA không đổi từ lúc rà và không có source mới hơn lượt vitest 1.614/1.614 đã ghi; golden 17 ca chính xác và 15 ca allowlist tiếp tục là bằng chứng phù hợp. Manifest/hash tạm: .tmp/t10-full-review-audit.json, .tmp/t10-review-*-paths.json.

## 7. Kiểm cây mã commit trên develop (20/11/2026)
Theo uỷ quyền chat mới, backend/API abd00fd và frontend 9e19ea2 đã được commit; không đồng nghĩa hoàn tất triển khaiT3. Cây commit được kiểm riêng không chứa thay đổi billing của phiên khác: backend1614/1614,147file,153.44s;source/testtypes,Prisma generation+emit,startup guard sạch. Frontendtypes/assets133/logic18/production build/SEO3;E2E30/30 (65.03s),37/37 (63.27s),không retry.
test:logic đã phụ thuộc demo ở repo lồng từ HEAD trước; dùng lại5file local-reference có SHA trong manifest tạm, không khai là fresh-clone tự chứa và không commit các file dist đó. Phần kiểm CI-ready độc lập (typecheck/assets/production build/SEO) đã qua ở worktree tách riêng. Không sửa logic mô hình; chỉ bỏ một dòng trống dư cuối test parallel khi kiểm index.
Commit tài liệu này ghi bằng chứng trước push; SHA remote được kiểm sau push và báo trong chat. Mục0.2 của plan được uỷ quyền mới mở riêng thao tác Git; các cổng DB/deploy/duyệt/dữ liệu vẫn giữ.
