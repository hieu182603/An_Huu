# T15 — Lịch vay v2 và đối soát tiền trả nợ

**Refinance tương lai07/10:** có bộ tính nội bộ `planned-refinance-v1`, chưa public API/save/apply. Quy tắc/thứ tự cùng ngày/quote/CAPPED và các bước lifecycle bắt buộc ở [PLANNED_REFINANCE.md](PLANNED_REFINANCE.md). Không thay nhánh refinance thực tế bên dưới.

Kiểm chứng mới nhất07/10: sửa nghĩa vụ/CAPPED và giải ngân trước tất toán đã nối.600tests/51files/typechecks/sourceemit/OpenAPI đạt; verifier --refinance-early-disbursement24HTTP/DBchecks rollback41bảng đạt. Số liệu dưới đây là checkpoint cũ cho từng nhánh, không thay nghiệm thu ngân hàng/browser.

Kiểm chứng DISBURSED_BALANCE 07/10: 563 tests toàn bộ; 20 tests tập trung sau assertion cuối; 22 HTTP/DB checks rollback giữ 41 bảng. Typecheck/emit đạt. Không thay nghiệm thu ngân hàng/UI hoặc nhánh tương lai còn mở.

Trạng thái 07/10/2026: đã nối schema, bộ tính, đối soát, chuyển basis v1, khoản vay mới và tái cấp vốn thực tế (kể cả vay thay thế đã trả gốc trước cutoff) vào **API preview/save/apply v4**. Không thay đổi hành vi/replay của Contract v1 và không thêm migration. Các kiểu dữ liệu thực thi ở `src/modules/debts/revision-schema.ts`, `legacy-basis.ts`, `reconciliation.ts`, `source-candidate.ts`, `source-create.ts`, `refinance.ts`. Kiểm DB thật cập nhật vay 19 ca và refinance 20 ca đạt, rollback giữ 38 bảng. Races độc lập, tái cấp vốn tương lai và nghiệm thu ngân hàng/UI còn mở.

## Khoản vay mới và tái cấp vốn thực tế

Body nguồn nhận thêm loanCreations/refinances, mỗi mảng tối đa30. Loan creation có commandId UUID, sourceId=plan:UUID, operation=CREATE, expectedSourceRevision=0, confirm=true, agreementReference duy nhất trong lịch sử nguồn vay mới, contractv2 và funding. Không tự nhận diện một hợp đồng bị khai lại bằng mã khác; người dùng phải xác nhận chưa có trong nguồn.

- EXISTING_BALANCE: notAlreadyInSources=true, evidence; hợp đồng BANK_CONFIRMED, số dư ngày cuối throughMonth. Chỉ lập nghĩa vụ tương lai, không tăng anchor.
- DISBURSED_BALANCE: notAlreadyInSources=true, disbursedOn, grossPrincipal, openingUserPaid, evidence, allocations và principalAdvances. Hợp đồng BANK_CONFIRMED giữ **dư gốc cuối cutoff**, không buộc bằng tiền giải ngân. Đối soát gross−gốc đã trả+các giải ngân thêm=dư gốc cutoff; lãi/phí không trừ gốc. Bằng chứng actual và allocation đã dùng do server lấy theo chủ tài khoản, không nhận từ HTTP.
- PLANNED_DISBURSEMENT: grossPrincipal/withheldFees/netDisbursement, destination=EXTERNAL_ACCOUNT, evidence; gross=principalBalance và gross−fees=net. balanceNature=PROJECTED_DISBURSEMENT, confirmation=HYPOTHETICAL, ngày giải ngân sau cutoff. Không tạo income/capitalInjection hoặc đặt giả khoản vay đã được ngân hàng xác nhận. Lần cập nhật từ actual chuyển về CONFIRMED_BALANCE với allocation có căn cứ.
- Snapshot newLoanSources giữ bằng chứng tạo; nguồn mới được sửa tiếp bằng loanRevisions và các hash options server. CAPPED planned phải bắt đầu previouslyPaid=0.

Refinance thực tế cần cùng request: loanRevision operation=END cho vay cũ, loanCreation EXISTING_BALANCE hoặc DISBURSED_BALANCE cho vay mới và một refinances item liên kết commandId của cả hai. Hai lệnh con đều phải mang refinanceCommandId; thiếu một bên hoặc bỏ proof không được lưu/đọc. END chỉ hợp lệ khi gốc=0 và không còn tiền lãi/phí/kỳ phải trả; hợp đồng BANK_SCHEDULE đã đóng có periods=[] và maturityDate=balanceAsOf.

Refinance item: commandId, closingCommandId, newLoanCommandId, settledOn, fundingScope (FULL_CONTRACT/USER_SHARE), grossDisbursement, withheldFees, externalTopUp, unusedProceeds, confirm=true, evidence. Hai hợp đồng cùng scope/cutoff và BANK_CONFIRMED. Kiểm `gross−withheldFees+externalTopUp = tiền tất toán trong allocations ngày settledOn + unusedProceeds`. Ngày tất toán không trước hiệu lực khoản vay mới; không có allocation vay cũ sau ngày tất toán. Lưu cặp nguồn/proof trong một transaction của plan; thất bại không giữ một nửa. Tiền đã rút quỹ vẫn không bị trừ lại.

Với EXISTING_BALANCE, dư gốc khoản mới tại cutoff vẫn phải bằng grossDisbursement. Nếu đã trả gốc, dùng DISBURSED_BALANCE: grossPrincipal khớp grossDisbursement; disbursedOn cùng settledOn giữ luồng cũ, giải ngân sớm hơn cần proceedsAtSettlement bên dưới. Dư gốc cutoff được đối soát riêng. Refinance giả định tương lai và nguồn giải ngân về sau để hoàn lại tiền tất toán trước đó chưa triển khai. BANK_CONFIRMED là chứng từ người dùng khai, không phải xác minh ngân hàng trực tuyến. Không ngầm vốn hóa phí/lãi hoặc chuyển tiền dư vào quỹ.

### Giải ngân trước tất toán — 07/10/2026

Refinance dùng DISBURSED_BALANCE có disbursedOn < settledOn phải gửi `proceedsAtSettlement`:

```json
{
  "availableAmount": "900",
  "confirm": true,
  "usesBeforeSettlement": [{
    "useId": "<uuid>", "bookedOn": "2026-08-25", "amount": "100",
    "description": "Khoản đã dùng từ tiền giải ngân trước tất toán",
    "evidence": [{"reference": "Chứng từ", "contentHash": "<sha256>", "confirmedOn": "2026-08-28"}]
  }],
  "evidence": [{"reference": "Tiền còn sẵn có lúc tất toán", "contentHash": "<sha256>", "confirmedOn": "2026-08-28"}]
}
```

- Mọi số cùng fundingScope. `grossDisbursement − withheldFees − tổng usesBeforeSettlement = availableAmount`; `availableAmount + externalTopUp = settlementAmount + unusedProceeds`. Với gross1000/phí0/đã dùng100 thì còn900; thêm120 đủ tất toán1020, không dư. Số available là tiền khả dụng có xác nhận, không phải dư gốc khoản vay.
- useId không trùng, số tiền dương; ngày dùng từ disbursedOn và trước settledOn. Chứng từ không trước ngày dùng hoặc sau knownOn; chứng từ availableAmount không trước settledOn. Mảng rỗng là xác nhận không sử dụng tiền trước tất toán, không phải thiếu dữ liệu. Không hỗ trợ gộp thêm khoản sử dụng khác ngay ngày tất toán vì cần thứ tự trong ngày riêng.
- Khoản trả nợ mới trước/sau tất toán vẫn đối soát bằng allocations/actual của DISBURSED_BALANCE. Các khoản trả có thể từ nguồn khác; backend không suy chúng đều lấy từ tiền giải ngân. Nếu dùng tiền giải ngân để trả thì phải phản ánh trong usesBeforeSettlement tương ứng. Đây là xác nhận dòng tiền ngoài quỹ, không tự tạo giao dịch actual hoặc chứng minh thanh toán ngân hàng.
- Tiền giải ngân sau ngày tất toán bị chặn; muốn mô hình hóa vay hoàn lại/nguồn cầu nối cần luồng riêng. EXISTING_BALANCE thiếu ngày/basis giải ngân nên không nhận proceedsAtSettlement. Luồng cùng ngày cũ giữ nguyên khi không gửi trường mới; snapshot cũ không được thêm mặc định.
- Toàn bộ metadata pin trong refinance proof và kiểm khi replay. Lỗi dùng REFINANCE_FUNDING_MISMATCH (422). Save hai nguồn vẫn atomic, actual thay đổi chặn apply; tiền đã ở anchor không cộng/trừ lại. Không migration hoặc sửa loan v1.

## Khoản đã giải ngân và trả gốc trước cutoff

DISBURSED_BALANCE dùng cho nguồn vay mới thực tế hoặc khoản thay thế trong refi. Ví dụ giải ngân100triệu, đã trả11triệu gồm10triệu gốc+1triệu lãi → contract.principalBalance90triệu. Nguồn giải ngân dùng100triệu; lịch trả sau cutoff dùng90triệu. Actual WITHDRAWAL đã trong anchor không bị trừ thêm. Tiền dư sau refi không tự là vốn/quỹ.

`funding` có:

```json
{
  "kind": "DISBURSED_BALANCE",
  "notAlreadyInSources": true,
  "disbursedOn": "2026-08-28",
  "grossPrincipal": "100000000",
  "openingUserPaid": "0",
  "evidence": [{"reference": "Giải ngân và số dư", "contentHash": "<sha256-64-hex>", "confirmedOn": "2026-09-01"}],
  "allocations": [],
  "principalAdvances": []
}
```

Đây là hình dạng input, không là payload hoàn chỉnh cho ví dụ đã trả11triệu: trường hợp đó phải điền allocation trỏ đúng event DEBT_PAYMENT/revision/ngày vàcomponents/contractComponents10triệu gốc+1triệu lãi. Rỗng trong ví dụ JSON chỉ để chỉ ra tên trường, không tự chứng minh90triệu dư cuối.

- Hợp đồng/số dư vẫn ở ngày cuối throughMonth, BANK_CONFIRMED. disbursedOn từ effectiveOn (của điều khoản đang hiệu lực khi giải ngân) tới cutoff; chứng từ xác nhận không trước ngày giải ngân và không sau contract.knownOn.

### Hợp đồng sửa sau ngày giải ngân (07/10/2026)

Khi `contract.effectiveOn > disbursedOn`, **bắt buộc** `funding.originalTerms` = điều khoản đang hiệu lực tại ngày giải ngân: `signedOn` (bằng hợp đồng hiện tại), `amendedOn` (null hoặc ≤ effectiveOn), `effectiveOn` (≤ disbursedOn), `balanceScope`, `paymentShare`, `responsibility` (CAPPED: previouslyPaid = openingUserPaid), `evidence` (≤ knownOn), `confirm:true`. Thiếu thì `LOAN_ORIGINAL_TERMS_REQUIRED`; gửi khi hợp đồng không sửa sau giải ngân, hoặc ngày/chứng từ sai thì `LOAN_ORIGINAL_TERMS_INVALID`. Hợp đồng hiện tại phải có `amendedOn` sau disbursedOn. Không suy điều khoản lịch sử từ điều khoản mới.

- Đối soát chạy từ basis gốc (gross tại disbursedOn) tới hợp đồng hiện tại; lịch sau cutoff dùng hợp đồng hiện tại (ví dụ tỷ lệ trả mới). Allocations là một ledger actual xuyên qua lần sửa, không phân bổ lại theo tỷ lệ mới.
- Loại/trần nghĩa vụ khác nhau giữa gốc và hiện tại: gửi `funding.responsibilityAmendment` (cùng schema loanRevisions, effectiveOn = contract.effectiveOn, openingUserPaid = số đã trả tại giải ngân); thiếu → `LOAN_RESPONSIBILITY_REVIEW_REQUIRED`. Amendment chỉ hợp lệ khi có originalTerms.
- **Đổi phạm vi số dư** (originalTerms.balanceScope ≠ contract.balanceScope) có hiệu lực **cuối ngày contract.effectiveOn**: allocation/principalAdvance có ngày ≤ ngày đó thuộc phạm vi cũ, sau ngày đó thuộc phạm vi mới. Bắt buộc `funding.scopeChange {openingPrincipal, evidence, confirm}` = dư gốc theo phạm vi mới tại cuối ngày đổi (chứng từ từ ngày đổi tới knownOn); thiếu → `LOAN_SCOPE_CHANGE_REQUIRED`. Backend đối soát hai đoạn: gốc→dư phạm vi cũ P1 tính từ actual; openingPrincipal→hợp đồng hiện tại. Không suy tỷ lệ tách của ngân hàng: chỉ chặn chiều vô lý (FULL→USER: openingPrincipal ≤ P1; USER→FULL: ≥ P1; luôn > 0) → `LOAN_SCOPE_CHANGE_INVALID`. Tổng đã trả/cap carry đi xuyên hai đoạn.
- Refinance có khoản thay thế bị sửa sau ngày tất toán: `fundingScope` và kiểm settledOn ≥ effectiveOn dùng originalTerms (điều khoản tại ngày tất toán).
- Trường mới là tùy chọn, không thêm mặc định vào snapshot cũ; replay chạy lại toàn bộ đối soát.
- openingUserPaid là tổng tiền người dùng đã thực hiện theo trần CAPPED tại mốc giải ngân được chứng từ xác nhận; cộng tổng các components sau ngày đó để khớp contract.responsibility.previouslyPaid. Không phải khoản góp quỹ. Nếu ALLOCATED_SHARE thì bằng0; với CAPPED phải xác nhận, không mặc định0. Loại/trần nghĩa vụ không tự đổi trong phép đối soát này.
- Allocations dùng cùng schema loanRevisions; principalAdvances là tăng gốc có chứng từ. Không lấy tổng tiền trả làm gốc. FULL_CONTRACT/USER_SHARE theo đúngscope hiện có, không tự suy phần người đồng vay. Khoản trả cùng ngày opening chưa xác định trước/sau số dư thì không chấp nhận; cần mốc/thứ tự phù hợp.
- Server giữ reconciliation.actuals/consumed trong newLoanSources evidence. Replay kiểm theo thứ tự revisionregistry, cả nguồn tạo mới và nguồn sửa; mọi allocation đã dùng tiếp tục chặn reuse/overallocated ở lần tạo/sửa kế tiếp. Không chấp nhận client tự gửiactuals/consumed/reconciliation.
- Save/apply/read/replay/report/CSV cùng API v4, sourceRevision/contractHash từ options. Không sửa profile/actual, không thêm migration. Kiểm DB `--refinance-repaid` và các kiểm bổ sung xem PROGRESS.md.

## API đã nối

### Sửa nghĩa vụ và trần CAPPED — 07/10/2026

Loan revision có thể gửi `responsibilityAmendment: {effectiveOn, openingUserPaid, confirm:true, evidence}` khi đổi loại ALLOCATED_SHARE/CAPPED hoặc đổi trần. Cần `contract.amendedOn`, ngày hiệu lực khớp contract.effectiveOn, không trước số dư mở đầu và không sau cutoff. Chứng từ xác nhận từ ngày hiệu lực tới knownOn. Điều chỉnh giữa hai mốc số dư được đối soát bằng allocations thực tế; chỉ lịch sau cutoff thay đổi, không phân bổ lại giao dịch cũ theo tỷ lệ mới.

`openingUserPaid` là tổng **tiền người dùng đã trả tới previous.balanceAsOf**, gồm gốc/lãi/phí thuộc phạm vi TOTAL_USER_PAYMENTS, không phải số đã trả tới ngày sửa đổi hoặc dư gốc. Nếu bản trước có CAPPED hoặc userPaidToDate thì phải khớp chính xác số đã pin; nếu chưa có lịch sử tổng, phải xác nhận bằng chứng từ và không được thấp hơn tổng allocations cùng nguồn đã lưu. Không mặc định số chưa biết thành0;0 chỉ hợp lệ khi xác nhận rõ.

Revision bắt đầu dùng amendment phải có `contract.userPaidToDate = openingUserPaid + tổng components của allocations mới`. Nếu CAPPED, userPaidToDate phải bằng responsibility.previouslyPaid và không vượt limit. Sau đó mọi revision tiếp theo phải giữ userPaidToDate và cộng khoản thực trả mới, kể cả khi chuyển sang ALLOCATED_SHARE; không xóa/reset ledger để bật CAPPED lại với trần còn nguyên. Hạ trần xuống dưới số đã trả không thuộc phép sửa này; không suy hoàn tiền/xóa nghĩa vụ từ việc hạ trần.

Ví dụ mở đầu đã30, kỳ này trả120 (100gốc/10lãi/10phí) → tổng150. Đổi trần thành250 thì tương lai người dùng trả tối đa100. Chuyển sang ALLOCATED_SHARE vẫn giữ150; bật CAPPED lại với trần200 thì còn50. Số dư thực tế đã có khoản rút120 không bị trừ lần nữa. Dư gốc và lịch toàn hợp đồng được đối soát riêng.

Thiếu amendment khi đổi loại/trần giữ lỗi cũ LOAN_RESPONSIBILITY_REVIEW_REQUIRED/LOAN_CAP_CARRY_MISMATCH. Lỗi mới LOAN_RESPONSIBILITY_AMENDMENT_INVALID, LOAN_PAID_HISTORY_REQUIRED trả409. Snapshot pin toàn bộ metadata, reader kiểm lại; trường tùy chọn không được thêm mặc định vào snapshot cũ. Không migration, loan v1 không đổi. New-loan DISBURSED_BALANCE mang openingUserPaid vào ledger nếu được khai; khoản giải ngân dự kiến chưa được ghi đã trả tiền.

Đây là xác nhận phục vụ tính toán, không tự kết luận hợp đồng sửa đổi hợp pháp hoặc ngân hàng đã chấp thuận. Giữ contract.confirmation HYPOTHETICAL/BANK_CONFIRMED theo hồ sơ. Căn cứ yêu cầu lưu dấu sửa đổi: [TT29/2026 Điều10](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/7/29-nhnn.signed.pdf); công thức lũy kế/trần ở trên là quy tắc sản phẩm theo chứng từ, không phải công thức mặc định của văn bản pháp luật.

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
- `CAPPED` hỗ trợ trần **tổng tiền người dùng trả**, gồm gốc/lãi/phí. Mức đã thực hiện được trừ trước khi lập lịch và phải mang sang revision sau. Đổi loại/trần dùng responsibilityAmendment theo mục trên, không đặt lại số đã trả.

## Đối soát với thực tế

`allocations` trỏ event `DEBT_PAYMENT` bằng ID, revision tháng và ngày ghi sổ, đồng thời tách principal/interest/prepaymentFee/otherFee. `components` là phần tiền của người dùng; `contractComponents` là phần giảm nghĩa vụ theo phạm vi số dư. Với toàn hợp đồng, phần đồng vay phải có chứng từ riêng trong cùng bản phân bổ, không suy bằng phép chia theo share. Giữ `paymentStatus` CURRENT/OVERDUE/MIXED và `allocationBasis` BANK_STATEMENT/AGREEMENT_COMPONENTS để rà căn cứ, không tự quyết thứ tự thu theo luật.

Ví dụ kiểm chứng: dư gốc 100 triệu, trả 12 triệu gồm 10 triệu gốc + 1 triệu lãi + 1 triệu phí → dư gốc 90 triệu. Khi actual đã có WITHDRAWAL 12 triệu và DEBT_PAYMENT 12 triệu, đối soát vay trả `fundAdjustment="0"`; không trừ quỹ lần nữa.

Service tích hợp phải lấy **toàn bộ** allocation trong lineage và actual đã chốt thuộc tài khoản; không nhận chứng cứ actual/consumed do client tự cung cấp. Core kiểm lại phép đối soát số dư tháng, loại/ngày/revision event, ID allocation không trùng, tổng tiền phân bổ không vượt event kể cả khác khoản vay. Dư gốc đầu − gốc trả + khoản tăng gốc có chứng từ = dư gốc cuối. Kiểm từng ngày để khoản giải ngân về sau không che trả gốc vượt dư trước đó. Tăng và giảm gốc cùng ngày cần thứ tự ghi sổ, hiện từ chối với `LOAN_POSTING_ORDER_REQUIRED`.

## Revision nguồn

`loanSourceCandidate` nhận nguồn DEBT có basis v2 hoặc basis số dư v1 do service xác minh, kiểm source revision/hash và contract hash. Bắt buộc số dư cuối tháng cutoff, thay lịch từ tháng tiếp theo; không sửa actual hoặc capitalInjection/income. Ghép các khoản trả đúng tháng theo ngày đến hạn, không chia trung bình. Chặn vùng override tổng nợ legacy. Nguồn cũ không tự chạy lại sau lịch thay thế.

Evidence pin command, basis, actuals và allocation đã dùng cùng cutoff/ngày ghi nhận. `replayLoanSourceEvidence` dựng lại revision trên registry tiền nhiệm và kiểm hash/lịch; revision sau không thay bằng chứng cũ. Cho sửa phương án tiếp tại cùng cutoff nếu không dùng lại tiền đã phân bổ.

## Việc bắt buộc còn lại

1. Refinance giả định tương lai, giải ngân sau để hoàn lại tiền tất toán trước đó, thay đổi điều kiện/nghĩa vụ giữa ngày giải ngân và cutoff cần basis lịch sử riêng. Giải ngân trước tất toán đã có proceedsAtSettlement; vay thay thế đã trả gốc trong kỳ đã nối DISBURSED_BALANCE. Không coi các nhánh chưa có basis là đã hoàn tất.
2. Kiểm PostgreSQL/races độc lập nhiều kết nối. Verifier `scripts/verify-source-reforecast-db.cjs --loan` và `--refinance` đã đạt 19/20 checks, rollback giữ 38 bảng; không thay bằng chứng race.
3. Rà thứ tự phân bổ/chuyển tiếp theo [ma trận luật](LEGAL_RULE_MATRIX.md), đối chiếu bảng ngân hàng thực; không coi có evidence hash là đã thẩm định hợp đồng. Đổi loại/trần CAPPED đã có thao tác xác nhận riêng; vốn hóa hoặc thiếu thứ tự ghi sổ vẫn cần nhánh có căn cứ, không tự suy.
4. UI và nghiệm thu T17. UI handoff `FE-T15-LOAN-V2-API` thay trạng thái chờ API ở `FE-T15-LOAN-V2-CORE` trong `docs/task-frontend.md`.

Kiểm chứng: `src/tests/loan-revisions.test.ts` gồm golden lịch số cụ thể, lãi 0/thả nổi/ngày/ân hạn/balloon, fees sau hết gốc, CAPPED, chống reuse và đối soát, nguồn/replay/CAS/cutoff/legacy aggregate. `loan-reforecast.test.ts` thêm8ca qua service/HTTP/response schema, chuyển v1→save→apply→replay/report, ownership/stale, idempotency, đa khoản vay, cap, sửa cùng cutoff/đẩy cutoff và mất proof. Xem PROGRESS.md cho kết quả các lệnh đã chạy.
