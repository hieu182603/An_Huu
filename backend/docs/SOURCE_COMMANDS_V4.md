# Nguồn trong dự báo v4

**Cập nhật07/10:** body nhận thêm `loanCreations`, `refinances`, `assetCommands` (mỗi mảng tối đa30); snapshot giữ newLoanSources/refinances/assetSources và kiểm lại proof khi đọc. Loan revision/actual refinance đã kiểm DB rollback 19/20 ca. Tài sản/vốn: [ASSET_SOURCES_V4.md](ASSET_SOURCES_V4.md). Response thêm assetRevisionOptions bên cạnh loanRevisionOptions; dùng hash server, không băm phía client. Các ghi chú chưa có vay mới/refinance phía dưới là checkpoint cũ; refinance tương lai, RENT→SALE và các giới hạn trong contract vẫn chưa hỗ trợ.

API USER, triển khai 05/10/2026. Không migration mới; snapshot nằm trong `plan_versions`. `retirement-plan-snapshot-v2` / `retirement-monthly-v4` phân biệt với snapshot v1 / model v2–v3. Luồng v3 cũ vẫn giữ nguyên body, kết quả và replay; khi cập nhật nguồn từ v3, backend dựng registry và kiểm no-op trước khi áp thay đổi. V2 đọc/replay được, chưa nâng trực tiếp qua API nguồn.

## API

| Thao tác | Đường dẫn dưới `/api/v1/me/retirement/plans/{planId}` |
|---|---|
| Xem trước | `POST /source-reforecasts/preview` |
| Lưu candidate, cần Idempotency-Key UUID | `POST /source-reforecasts` |
| Áp dụng riêng, như trước | `POST /apply` |
| Đọc/replay/report/compare/CSV | Các endpoint phiên bản hiện có nhận cả v3 và v4 |

Body preview: `versionId`, `expectedSnapshotHash`, `expectedRevision` của plan, `expectedProfileRevision`, `throughMonth`, `sourceCommands` (tối đa 100), `pensionSelections` (tối đa 1, mặc định rỗng), `loanRevisions`, `loanCreations`, `refinances`, `assetCommands` (tùy chọn, mỗi mảng tối đa30). Preview kiểm owner, plan/snapshot/profile, actual đã đóng và MATCHED, chuỗi số dư và actual revisions của các bản trước. Không nhận số dư anchor, lãi suất đầu tư hoặc kết quả tính từ client; lãi khoản vay được khai theo chứng từ hợp đồng.

Response `{status, issues, inputHash, candidate, loanRevisionOptions, assetRevisionOptions, saved:false, applied:false}`. BLOCKED/HORIZON_COMPLETE có candidate và hash null, options rỗng. READY chứa v4, replayInput.sourceRegistry, sourceBudget, calculation.attribution và các căn cứ đã pin. Có thể gửi các mảng lệnh rỗng để xem registry/bản no-op và hash hợp đồng trước khi chọn sửa nguồn. `knownOn` lấy ngày Việt Nam; qua ngày mới cần xem trước lại. Khoản vay xem [LOAN_REVISIONS_V2.md](LOAN_REVISIONS_V2.md); có chuyển basis v1, allocation gốc/lãi/phí, lịch v2, vay mới/refinance thực tế, lưu proof và stale checks.

Body save: `{preview: <đúng body preview>, expectedInputHash, confirm:true}`. Save đọc/tính lại trong transaction Serializable, kiểm hash trước lưu. Không áp dụng, không sửa profile/actual. Retry cùng key/body trả cùng version; key khác nhưng plan revision cũ trả409. Apply cần expectedRevision mới nhất và expectedProfileRevision như trước, kiểm actual cùng các estimate còn đóng góp vào lịch tương lai.

## Thu/chi/pension nhập tay

Mỗi lệnh có `commandId` UUID mới, `sourceId`, `expectedSourceRevision`, `effectiveFromMonth`, `effectiveToMonth`, `document` (1–2000 ký tự), `confirm:true`.

- CREATE: sourceId chưa tồn tại, bắt đầu `plan:`, revision kỳ vọng0. REVISE/END giữ đúng sourceId và revision trước. Snapshot hash và revision kế hoạch pin toàn bộ sourceHash; không nhận hash độc lập có thể lệch snapshot.
- CREATE/REVISE thêm `metric` = income/livingExpense/additionalExpense/pension, `frequency` = MONTHLY/ONCE, `amount` chuỗi Decimal không âm, `currency:VND`, `confirmation` = HYPOTHETICAL/USER_CONFIRMED. Đây là **số danh nghĩa từng tháng**, không tự điều chỉnh CPI hoặc FX. ONCE có cùng tháng đầu/cuối; không suy định kỳ từ actual một lần.
- END không nhận metric/amount/frequency/currency/confirmation. Không sửa DEBT, ASSET_CAPITAL hoặc AGGREGATE bằng lệnh dòng tiền thông thường.
- Chỉ sửa tháng sau cutoff. REVISE có thể cùng tháng bắt đầu với revision trước nếu toàn bộ phần đó chưa thuộc actual. Khi revision mới hết khoảng, revision cũ không tự chạy lại. END dừng nguồn từ tháng đầu đã chọn trở đi.
- Không đổi kind; không dùng tên hiển thị để khớp nguồn; không dùng một source hai lần trong cùng batch. Mã command đã có trong lineage bị chặn. Xung đột với legacy override tổng cùng metric/tháng trả422. Pension mới không cộng cạnh pension còn hoạt động: dùng REVISE nguồn cũ.

Nguồn chi thuộc metric đã chọn trong toàn khoảng; chọn livingExpense cho chi sinh hoạt, additionalExpense cho chi bổ sung, không tự đổi metric khi đến tuổi hưu. Thay metric trong cùng kind EXPENSE phải được người dùng chủ động chọn. Thêm thu nhập chỉ đổi khả năng góp; mức góp được xác nhận trong lịch cũ vẫn giữ, không tự góp toàn bộ dư.

## Chọn estimate BHXH

`pensionSelections` dùng schema `PensionSourceSelection`: estimateId, expectedEstimateIntegrityHash, expectedRegistryHash lấy từ preview không sửa, commandId, sourceId, operation CREATE/REVISE, expectedSourceRevision, khoảng tháng, `amountPolicy:FIXED_NOMINAL`, `confirm:true`. Các selection tham chiếu registry trước batch, kể cả batch có flow khác; server nối lịch sau từng lệnh.

Server đọc estimate thuộc user, kiểm nội dung/replay/history hiện hành/luật đã công bố chưa bị thay thế, yêu cầu ELIGIBLE có mức hưởng dương. Chỉ tạo pension sau cutoff và không trước tháng hưởng. Pin toàn bộ input/history/rules và hash trong `pensionSources`; không nhận chứng từ tính toán từ client. Luôn mang nhãn HYPOTHETICAL; mức tháng giữ danh nghĩa cố định. Trợ cấp một lần nằm trong assessment gốc, không thành capitalInjection, income hay khoản góp.

Trước save/apply, lịch sử/luật thay đổi khiến estimate còn dùng trong tương lai bị chặn. Có thể END/REVISE thay hết lịch tương lai của estimate cũ bằng nguồn mới; estimate cũ vẫn ở lịch sử nhưng không còn chặn apply. Nếu vẫn còn tháng tương lai dùng estimate cũ thì phải rà lại. Đọc/replay bản đã lưu không tra lịch/luật hiện hành.

## Tiếp tục từ v4, trình bày và AI

Có thể sửa tiếp tại cùng throughMonth của candidate đã lưu; backend kiểm actual revisions cũ và dùng anchor đã pin. Đẩy throughMonth về phía trước cần nhập/đối soát đủ tháng mới, kiểm số dư đầu chuỗi bằng anchor cũ. Không cộng lại thu/vốn các tháng đã nằm trong actual. Endpoint preview v3 trả `SOURCE_VERSION_USE_SOURCE_COMMANDS` nếu nhận nguồn v4, tránh làm mất lịch nguồn.

Report/compare dùng đúng snapshot. CSV v4 thêm `sourceRegistryHash`, `sourceAttributionJson` mỗi dòng tháng; CSV v2/v3 giữ cột cũ. Attribution chứa nguồn/revision/hash/metric/amount/confirmation; amount là VND danh nghĩa, bảng quy đổi today/nominal của phiên bản vẫn dùng discount factors được pin. Không dùng tổng vốn hồ sơ cũ làm tổng tài sản mới: limitations giữ `PROFILE_NET_WORTH_AND_GOAL_SELECTION_RETAIN_ORIGINAL_BASIS`.

AI dùng summary đúng model; provenance trả sourceRegistry hash/attribution cho chủ tài khoản, lọc tháng đã actual nếu có cutoff mới. Registry/history BHXH/document không gửi ra provider. Phần giải thích vẫn chỉ chọn câu số liệu do server tính; không tự áp dụng phương án.

## Trạng thái nghiệm thu

HTTP trong memory DB và contract tests đã chạy cho preview/save/read/replay/report/compare/CSV/actual/AI và luồng BHXH→candidate, stale history/actual, ownership, idempotency, thay nguồn/END, một lần, FX, tamper evidence. Script `scripts/verify-source-reforecast-db.cjs` đã chạy thành công qua cổng duyệt: --loan19/--refinance20/--assets20 checks, rollback dữ liệu. Ghi chú hạn mức cũ đã hết hiệu lực. Kiểm race PostgreSQL nhiều kết nối vẫn còn; không dùng rollback một transaction để thay bằng chứng race.

Chưa hỗ trợ các biến thể refinance tương lai, chuyển RENT sang bán, nhiều đợt góp từ cùng tài sản hoặc dời khoản góp dự kiến đã qua cutoff mà thiếu đối soát. Các nhóm BHXH chưa hỗ trợ vẫn theo T14. Race nhiều kết nối và UI/browser chưa nghiệm thu. Không coi phạm vi hiện có là toàn bộ backend hoàn thành.
