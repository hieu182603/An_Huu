# T15 — Lịch vay v2 và đối soát tiền trả nợ

Trạng thái 06/10/2026: đã nối schema, bộ tính, đối soát, chuyển basis v1 và revision nguồn vào **API preview/save/apply v4**. Không thay đổi hành vi/replay của Contract v1 và không thêm migration. Các kiểu dữ liệu thực thi ở `src/modules/debts/revision-schema.ts`, `legacy-basis.ts`, `reconciliation.ts`, `source-candidate.ts`. Refinance vẫn chưa triển khai; PostgreSQL/races và nghiệm thu ngân hàng/UI còn mở.

## API đã nối

Sử dụng `POST /api/v1/me/retirement/plans/{planId}/source-reforecasts/preview`; body cũ bổ sung `loanRevisions` tùy chọn, tối đa30. Không trùng sourceId/commandId với flow/pension trong cùng request. Gửi các mảng lệnh rỗng để nhận `loanRevisionOptions`: sourceId, sourceRevision, sourceHash, contractHash và legacyOpeningRequired. Dùng các hash server trả; không tự băm hoặc suy từ tên khoản vay.

Một loan revision có `commandId`, `sourceId`, `operation:REVISE`, `expectedSourceRevision`, `expectedSourceHash`, `expectedContractHash`, `confirm:true`, `contract` v2, `allocations`, `principalAdvances`. Dư gốc xác nhận phải tại ngày cuối tháng throughMonth; lịch mới bắt đầu sau cutoff. Service lấy actual theo chủ tài khoản và toàn bộ allocation từ snapshot cha; HTTP không chấp nhận actuals, consumed hoặc basis tự gửi.

Lần đầu từ hồ sơ v1 cần `legacyOpening`: signedOn, amendedOn (nullable), effectiveOn, knownOn, previouslyPaid, evidence. Chuyển đổi chỉ xác nhận **cơ sở số dư**, không bịa một lịch v2 thay cho lịch v1. Dư gốc/ngày số dư/tỷ lệ trả lấy từ profile đã pin, kiểm hash cùng lịch nguồn v1 (bao gồm debtStress). Khoản đã tất toán bởi lệnh legacy không được phục hồi qua bước này. Nếu trách nhiệm CAPPED phải xác nhận `capBasis:TOTAL_USER_PAYMENTS` và previouslyPaid; loại khác cần previouslyPaid=0 và bỏ capBasis. Revision tiếp theo bỏ legacyOpening và lấy hợp đồng từ bằng chứng trước.

Save vẫn `POST .../source-reforecasts` với `{preview,expectedInputHash,confirm:true}` và Idempotency-Key. Apply riêng qua endpoint hiện có. Save tính lại trong transaction và kiểm hash; actual sửa revision chặn save/apply/further reforecast, không sửa replay lịch sử. V4 snapshot giữ `loanSources` với đầy đủ chứng cứ; reader kiểm liên kết về profile/hợp đồng tiền nhiệm, chuỗi tiêu thụ allocation và lịch tái lập. Report/compare/CSV dùng attribution nợ mới. Tài liệu OpenAPI production đã cập nhật.

## Dữ liệu và cách tính đã có

- Contract v2 giữ ngày ký, sửa, hiệu lực, số dư, ngày ghi nhận và chứng từ/hash. `HYPOTHETICAL` và `BANK_CONFIRMED` là trạng thái khai báo có căn cứ, không là xác thực trực tuyến với ngân hàng hoặc kết luận pháp lý.
- `FULL_CONTRACT` dùng dư gốc toàn hợp đồng và nhân `paymentShare` ở khoản người dùng trả. `USER_SHARE` dùng số dư phần người dùng và bắt buộc share=1 để không nhân hai lần.
- Bốn chế độ: giữ hạn/giảm tiền; giữ khoản trả/giảm hạn; lịch gốc/lãi ngân hàng; lịch cơ cấu. Lãi suất được ghi từng kỳ, không đọc chỉ số thị trường trực tiếp. Kỳ ngắn/dài hơn một tháng cần số ngày và mẫu số năm cụ thể. Ngày đầu bị loại, ngày cuối được tính.
- Lãi/phí tồn đọng tách riêng, không cộng vào dư gốc. Ân hạn gốc vẫn trả lãi hiện tại. Trả hết gốc sớm không xóa các phí/lãi còn được khai trong lịch.
- Chọn rõ điều chỉnh kỳ cuối, balloon hoặc không balloon. Nếu đáo hạn vẫn còn gốc mà không có cách xử lý, kết quả `REVIEW_REQUIRED`, không trả lịch một phần như thể hoàn chỉnh. Lịch ngân hàng có lãi khác công thức đã khai cũng cần rà lại.
- `CAPPED` hiện hỗ trợ trần **tổng tiền người dùng trả**, gồm gốc/lãi/phí. Mức đã thực hiện được trừ trước khi lập lịch và phải được mang sang revision sau; chưa hỗ trợ tự đổi loại/trần nghĩa vụ trong cùng thao tác.

## Đối soát với thực tế

`allocations` trỏ event `DEBT_PAYMENT` bằng ID, revision tháng và ngày ghi sổ, đồng thời tách principal/interest/prepaymentFee/otherFee. `components` là phần tiền của người dùng; `contractComponents` là phần giảm nghĩa vụ theo phạm vi số dư. Với toàn hợp đồng, phần đồng vay phải có chứng từ riêng trong cùng bản phân bổ, không suy bằng phép chia theo share. Giữ `paymentStatus` CURRENT/OVERDUE/MIXED và `allocationBasis` BANK_STATEMENT/AGREEMENT_COMPONENTS để rà căn cứ, không tự quyết thứ tự thu theo luật.

Ví dụ kiểm chứng: dư gốc 100 triệu, trả 12 triệu gồm 10 triệu gốc + 1 triệu lãi + 1 triệu phí → dư gốc 90 triệu. Khi actual đã có WITHDRAWAL 12 triệu và DEBT_PAYMENT 12 triệu, đối soát vay trả `fundAdjustment="0"`; không trừ quỹ lần nữa.

Service tích hợp phải lấy **toàn bộ** allocation trong lineage và actual đã chốt thuộc tài khoản; không nhận chứng cứ actual/consumed do client tự cung cấp. Core kiểm lại phép đối soát số dư tháng, loại/ngày/revision event, ID allocation không trùng, tổng tiền phân bổ không vượt event kể cả khác khoản vay. Dư gốc đầu − gốc trả + khoản tăng gốc có chứng từ = dư gốc cuối. Kiểm từng ngày để khoản giải ngân về sau không che trả gốc vượt dư trước đó. Tăng và giảm gốc cùng ngày cần thứ tự ghi sổ, hiện từ chối với `LOAN_POSTING_ORDER_REQUIRED`.

## Revision nguồn

`loanSourceCandidate` nhận nguồn DEBT có basis v2 hoặc basis số dư v1 do service xác minh, kiểm source revision/hash và contract hash. Bắt buộc số dư cuối tháng cutoff, thay lịch từ tháng tiếp theo; không sửa actual hoặc capitalInjection/income. Ghép các khoản trả đúng tháng theo ngày đến hạn, không chia trung bình. Chặn vùng override tổng nợ legacy. Nguồn cũ không tự chạy lại sau lịch thay thế.

Evidence pin command, basis, actuals và allocation đã dùng cùng cutoff/ngày ghi nhận. `replayLoanSourceEvidence` dựng lại revision trên registry tiền nhiệm và kiểm hash/lịch; revision sau không thay bằng chứng cũ. Cho sửa phương án tiếp tại cùng cutoff nếu không dùng lại tiền đã phân bổ.

## Việc bắt buộc còn lại

1. Refinance đóng nguồn cũ/tạo nguồn mới nguyên tử, đối soát giải ngân–tất toán–phí; mới có lịch cơ cấu, **chưa có refinance**.
2. Kiểm PostgreSQL/races độc lập. Verifier `scripts/verify-source-reforecast-db.cjs --loan` đã chuẩn bị thêm luồng vay trên HTTP/DB rollback nhưng chưa chạy; syntax check không là bằng chứng DB.
3. Rà thứ tự phân bổ/chuyển tiếp theo [ma trận luật](LEGAL_RULE_MATRIX.md), đối chiếu bảng ngân hàng thực; không coi có evidence hash là đã thẩm định hợp đồng. Đổi loại/trần CAPPED, vốn hóa hoặc thiếu thứ tự ghi sổ chưa tự hỗ trợ.
4. UI và nghiệm thu T17. UI handoff `FE-T15-LOAN-V2-API` thay trạng thái chờ API ở `FE-T15-LOAN-V2-CORE` trong `docs/task-frontend.md`.

Kiểm chứng: `src/tests/loan-revisions.test.ts` gồm golden lịch số cụ thể, lãi 0/thả nổi/ngày/ân hạn/balloon, fees sau hết gốc, CAPPED, chống reuse và đối soát, nguồn/replay/CAS/cutoff/legacy aggregate. `loan-reforecast.test.ts` thêm8ca qua service/HTTP/response schema, chuyển v1→save→apply→replay/report, ownership/stale, idempotency, đa khoản vay, cap, sửa cùng cutoff/đẩy cutoff và mất proof. Xem PROGRESS.md cho kết quả các lệnh đã chạy.
