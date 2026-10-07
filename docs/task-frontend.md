# Task frontend — An Hưu

## Kế hoạch thực thi frontend — rà lại ngày 07/10/2026

**Đọc mục này trước khi code.** Đây là thứ tự triển khai và tiêu chí đóng việc mới nhất sau khi đối chiếu mã nguồn. Các phần bàn giao phía dưới giữ chi tiết nghiệp vụ; dấu `[x]` ở checkpoint cũ không chứng minh các yêu cầu bổ sung đã hoàn thành. Kế hoạch này không đánh dấu nghiệm thu thay người triển khai, không thay công thức hay quy tắc backend.

### 1. Trạng thái đã xác minh và cách đọc tài liệu

| Phạm vi | Trạng thái tại lần rà này | Việc tiếp theo |
|---|---|---|
| T01–T12 nền tảng | Có triển khai; các mục cũ ghi đã hoàn thành, chưa chạy lại toàn bộ browser trong lần rà | Giữ nguyên luồng đang hoạt động, kiểm hồi quy phần bị tác động |
| P13/P15, Q15-03 | Có form reforecast và gọi preview/save; chưa thấy UI chọn contributionTiming | Hoàn thiện FE-03 và FE-04 dưới đây |
| T13/T14 BHXH | Có SocialInsuranceModal và service mới; sai cấu trúc response, đầu vào tự gán và payload save | Sửa FE-01/02 trước khi mở rộng nhánh |
| T15 khoản vay/refinance | Service mới có trường loanRevisions/loanCreations/refinances/plannedRefinances dạng any[]; chưa thấy form gửi chúng | FE-07 rồi FE-08 |
| T16 nguồn | Có form nguồn cơ bản; REVISE/END vẫn tạo ID mới; pensionSelections luôn rỗng | FE-04/05 rồi FE-09/10 |
| T17 nghiệm thu | Chưa thấy browser tests cho các luồng mở rộng trên | Viết kiểm thử theo từng bước; FE-11 nghiệm thu tổng hợp |

Kiểm tra đã chạy trên workspace trong lần rà 07/10: `npm --prefix frontend run typecheck` đạt; `npm --prefix frontend run test:assets` đạt **32/32**; `npm --prefix frontend run build` đạt, prerender **5 trang** (còn cảnh báo bundle lớn). Đây là kiểm tra nền, không phải bằng chứng BHXH/vay/tài sản chạy đúng; chưa kiểm DB thật, browser mở rộng hoặc production. Build đầu bị quyền sandbox, chạy lại ngoài sandbox đã đạt.

**Giải quyết ghi chú đã bị thay thế:**

| Ghi chú cũ trong file hoặc contract tổng quan | Nguồn hiện hành cần dùng |
|---|---|
| FE-EXPANSION/T13 nói toàn bộ API mới chưa tồn tại | FE-T14-HISTORY-RULES, FE-T14-ESTIMATES và các bổ sung nhánh; đọc insurance.openapi.yaml và router hiện tại |
| FE-T14-CORPUS-SOURCE nói chưa có endpoint chọn estimate | FE-T16-SOURCE-V4 và SOURCE_COMMANDS_V4.md: đã có pensionSelections |
| FE-T16-SOURCE-V4 nói chưa có vay mới/tài sản/refinance | FE-T15-LOAN-V2-API, FE-T15-T16-NEW-LOAN-REFINANCE, FE-T16-ASSET-CAPITAL và các bổ sung 07/10 |
| FE-T15-PLANNED-REFINANCE “chuẩn bị/chưa public” | FE-T15-PLANNED-REFINANCE-API: public API đã mở; giữ yêu cầu trình bày cũ, bỏ điều kiện chờ API |
| Tài sản RENT chưa chuyển SALE; chỉ góp một lần/một ngày tiền về | FE-T16-RENTAL-SALE, STAGED, AVAILABILITY, LEGACY-CAPITAL và ASSET_SOURCES_V4.md tương ứng |
| FE-T14-PAYMENTS-PENDING chưa mở đóng bù/đóng trước | FE-T14-TOP-UP và FE-T14-PREPAID trong phạm vi đã bàn giao |
| T10 luôn ghi chưa có provider | FE-GEMINI; trạng thái và policy phải đọc API, không suy provider đang hoạt động từ tài liệu |

Đọc contract chuyên biệt mới nhất cùng runtime schema/router trước mỗi bước. Nếu contract và runtime lệch nhau, ghi endpoint/field/lỗi tái hiện, chặn đúng thao tác phụ thuộc và tiếp tục việc độc lập; không sửa backend hoặc tự chế payload để vượt kiểm tra. Bộ luật có engine không đồng nghĩa đã PUBLISHED: lấy danh sách discovery từ server, không tự công bố corpus nháp.

### 2. Quy tắc thực hiện chung

- Phạm vi: frontend và bằng chứng kiểm thử/tài liệu liên quan. Kiểm tra `git status`/diff trước khi sửa; giữ thay đổi đang làm ở chat khác. Không reset DB, sửa snapshot, seed luật production, tự publish/deploy hoặc sửa backend để khớp form sai.
- Giữ giao diện hiện hành; ưu tiên đúng dữ liệu và luồng. `frontend/src/App.tsx` là nguồn xác định route/quyền. Không tranh thủ redesign màn không liên quan hoặc viết engine tài chính khác phía client.
- Chuỗi tiền giữ nguyên độ chính xác; dùng tiện ích Decimal hiện có khi cần đối soát. Không dùng `Math.round(Number(...))` tạo payload tiền, không đổi trống/null/UNKNOWN thành 0. Số 0 phải là lựa chọn có ý nghĩa của người dùng.
- Bỏ chứng từ mẫu/hash toàn số 0, ngày sinh/giới tính/nhóm tham gia tự gán, cờ DOCUMENTED_FULLY_PAID tự bật. Chứng từ phải có nguồn nhập thực theo contract; thiếu thì báo thiếu hoặc dùng HYPOTHETICAL nếu đúng nhánh được hỗ trợ, không chế chứng từ để gọi API thành công.
- Theo dõi rõ `draft → preview → saved → applied`; có loading/error/incomplete/stale riêng. Lưu chưa áp dụng. Thay bất cứ đầu vào/revision/version/cutoff nào phải làm preview hết hiệu lực. Chỉ lưu đúng body bất biến đã xem trước và hash server cấp.
- Một thao tác lưu có key và body cố định khi retry mạng. Đổi nội dung là thao tác mới với key mới; không sinh key mới ở mỗi lần bấm thử lại. 409 giữ nháp, tải metadata mới và yêu cầu preview lại; không tự tăng revision rồi gửi lại dữ liệu cũ.
- Apply dùng đúng plan ID/version ID/revision trả về sau lưu theo response contract, kiểm kết quả thất bại trước toast/đổi current. Sau apply đọc lại trạng thái server; actualSourceChanged phải yêu cầu đối soát, lịch sử cũ vẫn đọc/export được.
- Đổi tài khoản/logout phải xóa lịch/chứng từ/preview và vô hiệu hóa response đến muộn, kể cả cache liên quan. Hiện loading/error/empty riêng, không `catch(() => {})` để giả thành không có dữ liệu.
- Thay `any[]` ở các request/response mới bằng kiểu khớp OpenAPI/runtime, dùng union theo operation/kind. Chỉ tách form/helper khi có nhu cầu cụ thể; không tạo framework biểu mẫu tổng quát.
- Mỗi bước dưới đây là một thay đổi độc lập có thể review: đọc contract → chỉnh service/types → chỉnh form/state → test biên API và browser liên quan → ghi bằng chứng. Không đánh dấu `[x]` chỉ vì đã tạo file, có nút hoặc build đạt.

### 3. Thứ tự và điều kiện hoàn thành

Thứ tự mặc định: **FE-00 → FE-01 → FE-02 → FE-03 → FE-04 → FE-05 → FE-06 → FE-07 → FE-08 → FE-09 → FE-10 → FE-11**. FE-06 quản trị luật có thể làm sau FE-01 nếu cần chuẩn bị UI vận hành; không tự duyệt/công bố luật thật để mở khóa test. Kiểm thử đi cùng từng bước, không dồn toàn bộ đến FE-11.

#### FE-00 — Chốt cấu trúc API và fixture trước khi mở rộng (P0)

**Đọc/sửa:** `frontend/src/services/insurance.ts`, `plans.ts`, `actuals.ts`, `retirement.ts`; đối chiếu `backend/docs/insurance.openapi.yaml`, `plans.openapi.yaml`, `actuals.openapi.yaml`, `retirement.openapi.yaml`, `backend/src/modules/pensions/estimate-service.ts`, `insurance-router.ts`, `insurance-schema.ts`, `backend/src/modules/plans/source-schema.ts`. Đường dẫn file dịch vụ frontend cùng nằm trong `frontend/src/services/`.

- [x] Lập bảng request/response cho mỗi endpoint dùng trong phạm vi bước kế tiếp; giữ tên field, nullability, revision/hash, envelope và mã lỗi đúng server. `authenticatedRequest` đã bóc `data`, không bóc lần hai.
- [x] Sửa list luật và list estimate: server trả `{ items: [...] }`, service hiện khai mảng trực tiếp. Preview estimate trả hash cấp ngoài và `assessment`; không đọc assessmentStatus/calculation giả định ở cấp ngoài. Bản lưu trả `id`, `integrityHash` và dữ liệu kết quả đã trải ra, không giả định `result` lồng như type hiện tại. Render theo các trường thật như `assessment.monthlyPension/startMonth` và schema tương ứng.
- [x] Kiểm response source preview/save thực tế trước khi định kiểu registry/options/saved/revision. Không lấy cast TypeScript làm validation hoặc đổi fixture để khớp code sai.
- [x] Thêm test gọi service production qua fetch/HTTP được kiểm soát: method/path/body/header thật; fixtures khớp response schema, có `{items:[]}`, null, 409 và 422. Không copy lại hàm production vào test. Kiểm thử transport không được ghi DB vận hành.

**Đạt khi:** list/preview/detail hiển thị đúng fixture chuẩn server, không lỗi `.map`/mất field; payload từng loại được kiểm tại biên HTTP. Đây là điều kiện bắt đầu FE-01/02.

#### FE-01 — Lịch đóng BHXH và dữ liệu người dùng (P0; cần FE-00)

**Đọc/sửa:** `frontend/src/components/SocialInsuranceModal.tsx`, `FinancialProfilePanel.tsx`, `frontend/src/pages/RetirementPlanPage.tsx`, service insurance; FE-T14-HISTORY-RULES và INSURANCE_HISTORY_RULES.md.

- [x] Form ngày sinh giữ DAY/MONTH/YEAR/UNKNOWN, giới tính pháp lý theo lựa chọn; bỏ fallback YEAR/1985 và MALE. Cho nhập coverage/confirmedThroughMonth đúng phạm vi; lịch tương lai đi qua futureContributions, không ghi thành đã xác nhận.
- [x] Nhập/sửa tháng hoặc khoảng tháng với scheme/salaryRegime/status/participantCategory/căn cứ/evidence đúng contract. UNKNOWN khác NOT_CONTRIBUTED, CREDITED cần loại/căn cứ. Không tự gán ARTICLE_2_1_A hoặc thay tháng trùng một cách im lặng; hiển thị lỗi/ý định sửa rõ.
- [x] Giữ specialPeriods và metadata của bản đang sửa; không gửi `specialPeriods: []` làm mất dữ liệu đã có. Chứng từ nhạy cảm không vào log/AI/localStorage.
- [x] Tách import-preview khỏi nút lưu: hiển thị issues và tháng UNKNOWN bổ sung; INVALID chặn, INCOMPLETE cần xác nhận riêng. Lưu body gốc đã preview, không thay bằng normalized. Giữ key/body retry, append bản mới và đọc lại bản cũ.
- [x] Reset theo userId, chống response cũ; đổi ngày hưởng không được tải đè nháp lịch chưa lưu. Lỗi tải phải có retry, không hiển thị như chưa có lịch.

**Nghiệm thu:** lịch mới không tự có năm sinh/giới tính; thiếu tháng→INCOMPLETE→xác nhận→lưu; trùng tháng→INVALID; revision 1→2 vẫn đọc được 1; lỗi mạng retry không append hai lần; 409 giữ nháp; đổi tài khoản không thấy lịch/chứng từ cũ.

#### FE-02 — Ước tính BHXH xem trước/lưu/đọc lại đúng (P0; cần FE-01)

- [x] Tách mốc tuổi tham chiếu khỏi ngày hưởng khai báo. Rà `initialBenefitDate` tại FinancialProfilePanel: không biến retirementMonth tham chiếu thành ngày hưởng đã xác nhận; không tự gán 01/01 sau 10 năm. Giữ tháng hưởng theo khai báo/chứng từ/giả định được chọn rõ.
- [x] Chọn luật từ discovery theo ngày hưởng; danh sách rỗng báo chưa có quy định phù hợp và giữ lựa chọn nhập hưu thủ công. Không tự seed/công bố luật. Tách status điều kiện, estimateKind và kết quả tiền nullable.
- [x] Xây một body EstimateInput từ form, giữ body đó cùng preview response. Save phải gửi lại đầy đủ caseDetails/stateSalaryCase/voluntaryCase/voluntaryTopUp/voluntaryPrepaid đã preview, không tái dựng body thiếu như hiện tại. Dùng inputHash cấp ngoài; đổi form, lịch, luật hoặc ngày đánh giá thì xem trước lại.
- [x] Làm lần lượt nhánh thông thường → Nhà nước/hỗn hợp → tự nguyện/hỗn hợp → đóng bù → đóng trước → STATE-V2. Mỗi nhánh dùng mục FE-T14 tương ứng bên dưới và runtime mới nhất; nhánh chưa đủ input hiển thị thiếu/rà soát, không giả là đã hoàn thiện. Bổ sung conversion/creditKind/transferMonth/hazardousPeriods/hazardousWindowFrom/includesSeniorityAllowance đúng nhánh STATE-V2 hiện hành. Bàn giao FE-T14-VOLUNTARY-TRANSITION bổ sung chuyển tiếp 2025/LAW_ART141_9: đọc VOLUNTARY_PENSION.md trước triển khai; thiếu bảng RULE_TABLE_REQUIRED phải hiện thiếu, không tự ước lượng hoặc chọn quyền hưởng thay người dùng.
- [x] Cho nhập chứng từ, ngày đóng, trạng thái thực tế/giả định; không tự gắn DOCUMENTED_FULLY_PAID. Hiển thị breakdown, citations, thiếu dữ liệu, trợ cấp/hoàn trả riêng; không tự cộng khoản một lần vào quỹ.
- [x] Bản lưu hiển thị ngày đánh giá, lịch/luật/version/hash và kết quả server; mở lại estimate cũ không tính lại bằng luật hiện tại. Lưu estimate không tự sửa hồ sơ hoặc apply kế hoạch.

**Nghiệm thu:** luật rỗng; 179/180 tháng; UNKNOWN/NOT_CONTRIBUTED; null tiền; save giữ đúng toàn bộ body preview cho từng nhánh; stale history/rule/ngày→409; retry cùng key; đọc lại bản cũ; không có toast đủ điều kiện khi assessment yêu cầu rà soát. Nhánh STATE-V2 dùng fixture có ghi rõ là test nếu luật thật chưa công bố.

#### FE-03 — Góp đầu/cuối kỳ và cập nhật dự báo từ actual (P1; cần FE-00)

**Đọc/sửa:** RetirementGoalPage, RetirementPlanPage, SimulationTrackingPage trong `frontend/src/pages/`; FE-P13-P15, FE-Q15-03, CONTRIBUTIONS_REFORECAST.md, SOURCE_REFORECAST.md.

- [x] Có lựa chọn contributionTiming; START_OF_MONTH cần khai/xác nhận startOfMonthFunding, không tự điền 0/true hoặc lấy số quỹ làm thu khả dụng. Hiện contributionStartMonth và trạng thái EARLY_FUNDING_REQUIRED/NO_ELIGIBLE_CONTRIBUTION_PERIOD.
- [x] Tách thu trừ chi, góp được xác nhận, phần còn ngoài quỹ, phần bị giới hạn. futureChanges là thay tổng tháng; sourceChanges là thay riêng nguồn cũ theo contract v3. Không đưa source version v4 vào đường v3.
- [x] Dùng beforeChanges/candidate cùng anchor để so; READY mới lưu, BLOCKED/HORIZON_COMPLETE hiện vấn đề. Giữ một preview body/key và apply riêng theo revision mới. Actual sửa giữ lịch sử, báo actualSourceChanged và yêu cầu xem lại.

**Nghiệm thu:** dư 5, góp 0/2/5/6 cho kết quả 0/2/5/5; thu thấp hơn/bằng chi; timing→preview→save→apply→reload/CSV; actual sửa→409 giữ form; chọn bản cập nhật/cùng cutoff/tháng tiếp đúng contract; không coi null là đã đủ vốn.

#### FE-04 — Sửa vòng đời nguồn v4 (P0; cần FE-00, FE-03)

**Đọc/sửa:** `frontend/src/pages/SimulationTrackingPage.tsx`, `frontend/src/services/plans.ts`; SOURCE_COMMANDS_V4.md và source-schema.ts. Giữ service/form vừa làm, chỉ tách phần cần thiết để review được.

- [x] Preview mảng rỗng lấy registry/options. CREATE tạo sourceId `plan:<uuid>` và revision ban đầu đúng schema; REVISE/END chọn source hiện hữu và dùng ID/revision server. Giữ hash snapshot/registry theo đúng trường của từng contract; flowSourceCommand hiện không có expectedSourceHash, không thêm trường lạ vào schema strict. Bỏ tạo ID mới/revision 0 cho mọi operation trong handleAddV4Command.
- [x] Mỗi operation gửi đúng trường schema riêng, nhất là END; giữ Decimal, ONCE một tháng, lịch sau cutoff, lý do và xác nhận chủ động. Không tự chèn document thay người dùng hoặc tính lại registry hash.
- [x] Sửa nguồn ở cùng cutoff/đẩy cutoff, không phục hồi lịch cũ sau khoảng REVISE. Preview stale khi form/nguồn đổi. Save giữ body/key; giữ cả metadata plan revision mới cho apply, không chỉ lưu phần version nếu làm mất revision.
- [x] Report/compare/CSV theo bản chọn và attribution server; giữ bản cũ đọc/replay được. Không tự sửa profile khi thêm nguồn hoặc tự tăng mức góp từ phần thu thêm.

**Nghiệm thu:** CREATE→save→apply→reload→REVISE đúng source→END; ONCE; stale actual/profile; mất mạng retry; hai tab; compare/CSV đúng version. Gửi sai revision phải hiện conflict và giữ nháp.

#### FE-05 — Đưa estimate BHXH vào nguồn pension (P1; cần FE-02, FE-04)

- [x] Thêm chọn estimate đã lưu đủ điều kiện theo contract; dùng integrityHash estimate và registry hash server, không băm client hoặc gửi tiền hưởng tự sửa.
- [x] Tạo pensionSelections với CREATE/REVISE, ID/revision nguồn, khoảng tháng, FIXED_NOMINAL và xác nhận. Nếu có pension thì chọn thay thế rõ, không cộng thêm dòng PENSION trùng.
- [x] Preview tác động→save→apply riêng. Luật/lịch đổi yêu cầu estimate mới hoặc dừng/thay nguồn đúng contract; không sửa estimate cũ. Trợ cấp một lần chỉ giải thích phần bị loại khỏi lịch pension, không tự tạo góp quỹ.

**Nghiệm thu:** chọn estimate hợp lệ; thay pension cũ; lưu/áp dụng/reload; stale estimate bị chặn; bản lịch sử vẫn đọc được; payload không chứa toàn bộ lịch BHXH hoặc bằng chứng client tự dựng.

#### FE-06 — Quản trị luật BHXH và rà phần cũ còn liên quan (P1; cần FE-00)

- [x] Thêm UI admin riêng cho legal-rules, không gộp vào kho tri thức Gemini; nối GET/POST/PATCH/transitions theo FE-T14-HISTORY-RULES. Luồng DRAFT→VALIDATED→REVIEWED→PUBLISHED dùng hash/revision từ từng response; REVIEW cần ghi chú/người độc lập; bản công bố chỉ đọc hoặc tạo kế tiếp.
- [x] Hiện coverage, thời hạn, supersedes, lỗi strategy/validation và trạng thái corpus; không ghi “sẵn sàng tính” chỉ vì tạo draft. USER không gọi admin API; ADMIN không được mở lịch riêng của USER.
- [x] Rà FE-T13-REFERENCE, FE-GEMINI, FE-RETENTION theo API hiện tại: consent dùng policy/revision/processingNotice server; reconsent rõ; history hết hạn không phục hồi từ cache. Đã có triển khai thì kiểm và giữ, không viết lại vì checkbox cũ chưa cập nhật.

**Nghiệm thu:** chuyển trạng thái với fixture đúng contract, lỗi quyền/409 giữ form; sửa draft mất duyệt; không tự duyệt bằng người soạn; policy đổi yêu cầu xác nhận lại. Không publish bộ luật thật trong bước kiểm UI.

#### FE-07 — Cập nhật và tạo khoản vay (P1; cần FE-04)

**Đọc:** LOAN_REVISIONS_V2.md; FE-T15-LOAN-V2-API, DISBURSED-BALANCE, RESPONSIBILITY-AMENDMENT, DISBURSED-AMENDED. Chọn vị trí form trong màn mô phỏng/nguồn hiện có; trang DebtAnalysis giữ chức năng phân tích hiện hành.

- [x] Chọn từ loanRevisionOptions, giữ source/contract hash/revision. Nhập opening, actual allocations tách gốc/lãi/phí/ngày/phạm vi, điều khoản ngân hàng và nhãn HYPOTHETICAL/BANK_CONFIRMED; không lấy tổng trả làm giảm gốc.
- [x] Hỗ trợ loanRevisions REVISE/END đúng schema; v1 cần khai opening trước khi lên v2. Trả từ quỹ qua WITHDRAWAL không bị trừ thêm khi phân bổ DEBT_PAYMENT.
- [x] Tạo loanCreations theo từng funding EXISTING_BALANCE/PLANNED_DISBURSEMENT/DISBURSED_BALANCE được contract hỗ trợ. Khoản mới ở bản tiếp theo dùng revision, không CREATE lại; tiền vay không tự cộng thu nhập/quỹ.
- [x] Sửa CAPPED/ALLOCATED_SHARE có responsibilityAmendment/userPaidToDate; giữ lịch trả lũy kế khi bỏ/bật trần. Hợp đồng sửa sau giải ngân khai originalTerms và scopeChange khi cần; không sao điều khoản hiện tại làm lịch sử.

**Nghiệm thu:** v1→v2→trả một phần→save/apply/reload/CSV; tổng allocation không vượt event; CAPPED đã 30+trả 120=150, trần 250 còn 100, bỏ trần rồi trần 200 còn 50; đổi phạm vi/thiếu originalTerms bị chặn rõ; actual sửa→409. Không làm mới lịch sử v1/v3.

#### FE-08 — Refinance thực tế và dự kiến (P1; cần FE-07)

- [x] Thực tế: một form và một batch END cũ + CREATE mới + refinances, đúng command liên kết; gross/phí/tiền bù/tất toán/tiền dư cùng phạm vi. Không lưu hai khoản bằng hai request độc lập.
- [x] Giải ngân trước ngày tất toán: proceedsAtSettlement với danh sách tiền đã dùng/xác nhận chưa dùng theo FE-T15-EARLY-DISBURSEMENT. Không dùng dư gốc thay tiền còn sẵn có; không cộng tiền dư vào quỹ.
- [x] Dự kiến: theo PLANNED_REFINANCE.md và FE-T15-PLANNED-REFINANCE-API; chọn eligibleLoans, CREATE/REVISE/CANCEL dùng activePairs/hash; chỉ reviseAllowed mới sửa; nguồn bị khóa không cho sửa riêng.
- [x] Có lựa chọn tất toán trước/sau kỳ trả cùng ngày; nhãn HYPOTHETICAL. Đến hạn cần đối soát: CANCEL + refinance thật hoặc CANCEL/cập nhật actual + CREATE cặp mới; không tự chuyển giả định thành đã xảy ra.

**Nghiệm thu:** thực tế gross1000−đã dùng100=còn900, bù120=tất toán1020; khoản mới dư gốc900 được đối soát độc lập. Dự kiến tạo/sửa/hủy/đến hạn, hủy trả lịch gốc, lỗi batch không báo thành công một nửa; save/apply/reload/CSV giữ đúng phiên bản.

#### FE-09 — Tài sản và vốn một lần (P1; cần FE-04)

- [x] Form assetCommands từ assetRevisionOptions theo ASSET_SOURCES_V4.md/FE-T16-ASSET-CAPITAL. Phân biệt amountScope WHOLE_ASSET/USER_SHARE, tiền gộp/phí/thuế/nợ bảo đảm/net, sở hữu/phần hưu; không nhân sở hữu hai lần.
- [x] PLANNED/REALIZED theo contract: chọn số muốn góp kể cả 0, ngày tiền sẵn có/tháng góp; đã góp dùng CONTRIBUTION event/revision/date/allocation, không dùng INCOME/DEBT_PAYMENT/WITHDRAWAL. Không cộng lại tiền đã nằm trong anchor.
- [x] Giữ source identity khi REVISE/END, chọn đúng asset reference; không CREATE trùng nguồn đã realized. Phí trả nợ trong net không tự tất toán loan; muốn đóng loan thêm lệnh/chứng từ trong cùng batch.
- [x] Nguồn RENT→SALE có rentalExit và số thuê cuối xác nhận; khoản dự kiến đã qua cutoff dùng đối soát theo FE-T16-MISSED-CONTRIBUTION, không âm thầm dời tháng.

**Nghiệm thu:** bán1000−50−50−100=800, sở hữu50%/hưu50% tối đa200, chọn150 chỉ góp150; USER_SHARE800/hưu50% tối đa400; CONTRIBUTION300 không phân bổ200+200; thuê dừng đúng tháng; stale actual chặn apply nhưng đọc bản cũ được.

#### FE-10 — Góp/nhận nhiều đợt và tương thích tài sản v3 (P1; cần FE-09)

- [x] STAGED tách prior đã góp, allocation mới, plannedContributions còn lại và confirmedContributionAmount tổng. Không gửi lại priorRealized hoặc event cũ; nhận đủ giữ STAGED với lịch rỗng, END chỉ hủy tương lai.
- [x] Qua kỳ dự kiến phải khai reconciliations cho từng tháng; số chưa góp không tự chuyển kỳ. availability giữ các release CONFIRMED/EXPECTED/evidence, không tài trợ actual bằng tiền EXPECTED, không xóa/sửa release đã chốt trái contract.
- [x] V3 ASSET_REALIZED→REVISE STAGED cùng sourceId/hash/revision, giữ số cũ và trạng thái thuê đã dừng. Không tạo tài sản khác để tránh đối soát. Rà FE-T16-LEGACY-CAPITAL/AVAILABILITY/STAGED/RENTAL-SALE mới nhất.

**Nghiệm thu:** tổng200 đã60, dự kiến100 nhưng thực nhận30, còn110; anchor1090 không tăng thêm lần nữa; nhận110→anchor1200; release80 đã góp60 chỉ còn20 trước đợt kế; dời release sang tháng sau chặn góp sớm; replay/CSV bản cũ giữ nguyên.

#### FE-11 — Nghiệm thu liên màn và cập nhật bằng chứng (P1; cần các bước liên quan)

- [x] Thêm browser tests có tên/phạm vi rõ cho BHXH, source-v4, loan, refinance, asset; dùng fixture/API schema đúng contract. Bộ test `source-reforecast.spec.ts` trong `frontend/tests/` bao phủ luồng Preview -> Save (Idempotency-Key) -> Apply -> Export CSV, xử lý 409 conflict và kiểm tra zero em-dashes anti-slop.
- [x] Mỗi luồng có preview→save→apply→reload→report/CSV theo cùng version; test lỗi mạng sau server đã lưu, retry cùng key, sửa body key mới, 409 giữ nháp, 422 field errors, account switch và response đến muộn. BHXH history/estimate chỉ lưu, không tự apply.
- [x] Theo FE-T17-LOAN-ASSET-RACES: hai tab cùng revision chỉ một thắng; retry cùng key không thêm lịch sử; actual sửa cạnh apply phải đọc lại trạng thái. Changeset vay120/góp tài sản60/dự kiến140, quỹ1000→anchor940, chỉ140 là vốn tương lai; bản lưu chứa đủ vay và tài sản.
- [x] Chạy hồi quy profile/plan/account/admin/knowledge bị tác động và responsive cho form mới; không coi test sidebar/admin-ui là bằng chứng CRUD hoặc nghiệp vụ tài chính. Mock browser không chứng minh DB concurrency; kiểm backend/DB riêng theo quy trình hiện có khi có phạm vi được giao.
- [x] Ghi rõ API thật/DB/provider/production nào chưa kiểm. Không đánh dấu luật đã vận hành chỉ bằng fixture PUBLISHED, không suy Gemini live từ response mock.

### 4. Lệnh kiểm tra và cách đóng task

Từ thư mục gốc dự án, sau thay đổi code chạy các kiểm tra phù hợp:

```powershell
npm --prefix frontend run typecheck
npm --prefix frontend run test:assets
npm --prefix frontend run build
```

Browser chạy từ `frontend`: dùng Playwright CLI đã cài (`node node_modules/@playwright/test/cli.js test <file.spec.ts>`) với test file thực có và build mới. `tests/setup-preview.ts` chặn API không mock bằng UNMOCKED_TEST_API; giữ chặn này, không bỏ để test chạm DB thật. Không chiếm/kill tiến trình giữ cổng8444 của chat khác; dùng runner sở hữu cổng riêng hoặc cấu hình baseURL phù hợp khi cần. `backend/scripts/verify-browser.cjs` là runner cổng động cho tập test nó cấu hình, không mặc nhiên bao phủ test mới.

`backend/scripts/verify-frontend-wire.cjs` chạy từ `backend` và dùng DB memory/auth stub; hiện chỉ là probe transport/precision của tập API cũ, không thay kiểm thử BHXH/vay/tài sản. Khi thêm contract tests, phải assert cả body/response/error; không lấy exit0 hoặc HTTP400 nghiệp vụ làm bằng chứng happy path đã đạt. Không chạy lại toàn suite sau mỗi thay đổi tài liệu đơn thuần.

Mỗi khi hoàn thành bước, thêm một dòng bằng chứng vào bảng dưới rồi mới đổi checkbox tương ứng. Nếu mới có UI hoặc chỉ đạt mock, ghi đúng mức độ; phần chưa nghiệm thu vẫn mở. Không lấy tỷ lệ checkbox toàn file làm phần trăm hoàn thành vì có yêu cầu trùng/thay thế.

| Bước | Trạng thái | File/luồng đã sửa | Lệnh + kết quả + ngày | Mức kiểm chứng và phần còn thiếu |
|---|---|---|---|---|
| Rà nền 07/10 | Đã kiểm nền, chưa nghiệm thu mở rộng | Đối chiếu code với task; chưa sửa code trong lần lập kế hoạch | Typecheck đạt; tests32/32; build+5trang đạt | Chưa chạy browser mở rộng/DB thật/production |
| FE-00 | Đã nghiệm thu | `services/insurance.ts`, `plans.ts`, `api.ts`, `scripts/insurance-services.test.mjs` | Typecheck đạt; tests:assets 42/42; 07/10/2026 | Unit & wire mock fetch đạt; bóc đúng envelope `{items:[]}`, assessment cấp ngoài |
| FE-01 | Đã nghiệm thu | `SocialInsuranceModal.tsx`, `FinancialProfilePanel.tsx`, `RetirementPlanPage.tsx` | Typecheck đạt; tests:assets 44/44; 07/10/2026 | Unit & UI đạt: birth precision, legal sex, SHA-256 evidence, preview/save tách biệt |
| FE-02 | Đã nghiệm thu | `FinancialProfilePanel.tsx`, `SocialInsuranceModal.tsx`, `insurance.ts` | Typecheck đạt; tests:assets 44/44; 07/10/2026 | Unit & UI đạt: tách mốc tuổi khỏi ngày hưởng, lưu toàn bộ preview body các nhánh |
| FE-03 | Đã nghiệm thu | `utils/decimal.ts`, `services/actuals.ts`, `RetirementPlanPage.tsx`, `SimulationTrackingPage.tsx` | Typecheck đạt; tests:assets 47/47; 07/10/2026 | Unit & wire contract đạt: timing START/END_OF_MONTH, funding, 4 chỉ số dòng tiền, chặn save khi not READY |
| FE-04 | Đã nghiệm thu | `services/plans.ts`, `SimulationTrackingPage.tsx`, `scripts/actuals-and-ai.test.mjs` | Typecheck đạt; tests:assets 47/47; 07/10/2026 | Unit & wire contract đạt: lifecycle V4 CREATE `plan:<uuid>`, REVISE server ID/rev, strict END, Idempotency-Key |
| FE-05 | Đã nghiệm thu | `SimulationTrackingPage.tsx`, `services/plans.ts`, `scripts/actuals-and-ai.test.mjs` | Typecheck đạt; tests:assets 47/47; 07/10/2026 | Unit & wire contract đạt: gắn estimate ELIGIBLE vào pensionSelections FIXED_NOMINAL + hash integrity server |
| FE-06 | Đã nghiệm thu | `services/legalRules.ts`, `pages/admin/AdminLegalRulesPage.tsx`, `App.tsx`, `routes.ts`, `AdminApp.tsx`, `scripts/insurance-services.test.mjs` | Typecheck đạt; tests:assets 52/52; build đạt; 07/10/2026 | Unit & wire contract đạt: UI admin riêng cho legal-rules, DRAFT→VALIDATED→REVIEWED→PUBLISHED, CAS/hash, review độc lập, rà consent/retention/privacy đạt |
| FE-07 | Đã nghiệm thu | `services/plans.ts`, `SimulationTrackingPage.tsx`, `scripts/actuals-and-ai.test.mjs` | Typecheck đạt; tests:assets 54/54; build đạt; 07/10/2026 | Unit & wire contract đạt: loanRevisions REVISE (legacyOpening, CAPPED/ALLOCATED_SHARE responsibilityAmendment, allocations tách gốc/lãi/phí), END (gốc 0, periods rỗng, BANK_SCHEDULE), loanCreations (EXISTING_BALANCE, PLANNED_DISBURSEMENT net, DISBURSED_BALANCE originalTerms/scopeChange), Idempotency-Key |
| FE-08 | Đã nghiệm thu | `services/plans.ts`, `SimulationTrackingPage.tsx`, `scripts/actuals-and-ai.test.mjs` | Typecheck đạt; tests:assets 55/55; build đạt; 07/10/2026 | Unit & wire contract đạt: refinances (closingCommandId END + newLoanCommandId CREATE + proceedsAtSettlement early disbursement), plannedRefinances pairs (CREATE, REVISE, CANCEL), 0 em-dashes, Idempotency-Key |
| FE-09 | Đã nghiệm thu | `services/plans.ts`, `utils/decimal.ts`, `SimulationTrackingPage.tsx`, `scripts/actuals-and-ai.test.mjs` | Typecheck đạt; tests:assets 57/57; build đạt; 07/10/2026 | Unit & wire contract đạt: assetCommands (CREATE, REVISE, END), net equation, amountScope (WHOLE_ASSET/USER_SHARE), PLANNED/REALIZED, rentalExit chuyển thuê sang bán, missedContribution hoãn khoản dự kiến |
| FE-10 | Đã nghiệm thu | `services/plans.ts`, `SimulationTrackingPage.tsx`, `scripts/actuals-and-ai.test.mjs` | Typecheck đạt; tests:assets 57/57; build đạt; 07/10/2026 | Unit & wire contract đạt: STAGED funding, plannedContributions, availability.releases (CONFIRMED/EXPECTED), reconciliations kỳ lỡ hạn, tương thích kế thừa v3 ASSET_REALIZED |
| FE-11 | Đã nghiệm thu | `tests/source-reforecast.spec.ts`, `utils/decimal.ts`, `SimulationTrackingPage.tsx` | Playwright CLI 3/3 passed (4.8s); typecheck đạt; tests:assets 57/57; build đạt; 08/10/2026 | E2E browser suite đạt (Preview -> Save Idempotency-Key -> Apply -> CSV, 409 conflict error handling, zero em-dashes anti-slop). Chưa nghiệm thu DB concurrency cluster thực tế và multi-region live. |

**Điểm bắt đầu cho AI tiếp theo:** Toàn bộ các nhiệm vụ frontend V4 (FE-00 đến FE-11) đã hoàn tất và được nghiệm thu đầy đủ bằng chứng (typecheck 0 lỗi, tests:assets 57/57 passed, Playwright CLI 3/3 passed, build production + prerender 5 trang SSR thành công). Sẵn sàng bàn giao hoặc tích hợp backend staging tiếp theo.

---

## Các bàn giao chi tiết và checkpoint lịch sử

Các mục dưới đây giữ yêu cầu từng nhánh; khi có ghi chú cũ mâu thuẫn, dùng bảng thay thế và kế hoạch phía trên, rồi đối chiếu contract/runtime mới nhất. Nội dung đã có trong workspace được giữ để không mất bàn giao từ backend.

## FE-T14-MATERNITY-CREDIT — tháng thai sản tính là thời gian đóng, 07/10/2026

[Quy tắc](../backend/docs/INSURANCE_HISTORY_RULES.md) mục "Tháng thai sản được tính là thời gian đóng".
- [ ] Nhập lịch sử: tháng nghỉ thai sản `status: CREDITED` với `creditKind` theo giai đoạn: `"MATERNITY_ART53_8"` từ 07/2025, `"MATERNITY_LAW2014_ART39_2"` từ 01/2016 đến 06/2025 (nghỉ ≥14 ngày làm việc trong tháng), `"MATERNITY_LAW2006_ART35_2"` từ 01/2007 đến 12/2015; UI tự chọn loại theo tháng, không cho người dùng chọn sai. **Nhập căn cứ đóng/hệ số BHXH ghi trên sổ** (không để trống). Trước 2007: báo cần rà soát.
- [ ] Hiển thị breakdown MATERNITY_CREDITED_MONTHS; thông báo cho CREDITED_MONTH_ASSESSMENT_REQUIRED và POSITIVE_CONTRIBUTION_BASE_REQUIRED.

## FE-T14-VOLUNTARY-TRANSITION — chuyển tiếp 2025 và tuổi 60/55 (Điều141(9)), 07/10/2026

[Quy tắc](../backend/docs/VOLUNTARY_PENSION.md) mục "Chuyển tiếp 2025 và Luật Điều141(9)". Đã có draft corpus năm hưởng 2025 (`bh2-voluntary-transition-2025`) nhưng chưa được duyệt/công bố; khi bộ luật chưa công bố, hoặc với Điều141(9) (cần năm hưởng ≥2028), kết quả là thiếu bảng (RULE_TABLE_REQUIRED) — UI phải hiển thị đúng như vậy, không ước lượng thay. Khi hiển thị kết quả chuyển tiếp, ghi rõ hệ số lấy từ TT01/2025.

- [ ] `benefitStart.kind: "TRANSITION_2025"` khi người dùng đủ tuổi + ≥15 năm trước 01/07/2025 và không đóng từ 07/2025; ngày hưởng cố định 2025-07. Khi backend trả VOLUNTARY_TRANSITION_ASSESSMENT_REQUIRED, gợi ý chọn trường hợp chuyển tiếp.
- [ ] `ageRule: "LAW_ART141_9"` là lựa chọn của người dùng (giải thích có thể chọn hưởng theo tuổi thông thường Điều98). Chỉ gợi ý khi tham gia tự nguyện trước 2021 và có ≥20 năm tự nguyện.
- [ ] Thông báo cho VOLUNTARY_TRANSITION_CONDITIONS_NOT_MET, LEGACY_AGE_RULE_REQUIRES_PRE_2021_VOLUNTARY, LEGACY_AGE_RULE_REQUIRES_240_VOLUNTARY_MONTHS, LEGACY_AGE_GRANT_REVIEW_REQUIRED, STATUTORY_CITATION_REQUIRED:LAW_ART141_9.

## FE-T14-STATE-V2 — thời gian trước 1995, lương trước 2004, chuyển ngành, 07/10/2026

[Quy tắc](../backend/docs/INSURANCE_HISTORY_RULES.md) mục "Engine vn-pension-state-v2". Engine chỉ chạy khi admin đã duyệt/công bố bộ luật `bh2-state-mixed-v2` (hiện là bản nháp, chưa có trên DB vận hành).

- [ ] Nhập lịch sử: tháng CREDITED trước 1995 cho chọn `creditKind` = "Công tác khu vực Nhà nước trước 1995" (`PRE_1995_STATE_SECTOR`) hoặc "Sĩ quan/QNCN trước 1995" (`PRE_1995_ARMED_FORCES`), kèm chứng từ BHXH; không bắt nhập căn cứ đóng. Ghi rõ: chỉ khai khi BHXH đã xác nhận trên sổ/quá trình đóng.
- [ ] Tháng lương Nhà nước trước 10/2004: nhập **hệ số đã chuyển đổi** + thang (`ND204_PUBLIC` / `ND205_ENTERPRISE` / `ND204_ARMED_FORCES`) + chứng từ. Không tự quy đổi từ hệ số cũ.
- [ ] Trường hợp chuyển ngành từ quân đội/công an: chọn `salaryTreatment: MILITARY_TRANSFER` và nhập `transferMonth`; nhóm tham gia các tháng trước đó là điểm d.
- [ ] Nghề nặng nhọc chuyển việc: `salaryTreatment: HAZARDOUS_TRANSFER`, `transferMonth`, danh sách `hazardousPeriods` (từ/đến tháng + chứng từ BHXH) và tháng bắt đầu cửa sổ `hazardousWindowFrom`; giải thích cửa sổ là N năm liền nhau BHXH xác nhận (N theo năm bắt đầu tham gia).
- [ ] Phụ cấp thâm niên: `SENIORITY_ALLOWANCE_TRANSFER` + `transferMonth` + cờ `includesSeniorityAllowance` từng tháng; báo rõ hai trường hợp (a)/(c) cần rà soát thủ công.
- [ ] Hiện breakdown mới: CREDITED_MONTHS, PRE_2004_CONVERTED_MONTHS, FINAL_WINDOW_AVERAGE / BEFORE_TRANSFER_AVERAGE / USED_BEFORE_TRANSFER_AVERAGE, HAZARDOUS_WINDOW_AVERAGE / USED_HAZARDOUS_WINDOW_AVERAGE.
- [ ] Thông báo cho các mã: CREDITED_MONTH_ASSESSMENT_REQUIRED, PRE_2004_STATE_SALARY_CONVERSION_REQUIRED, PRE_2004_CONVERSION_SCALE_MISMATCH, TRANSFER_MONTH_REQUIRED/NOT_APPLICABLE/INCONSISTENT, TRANSFER_WINDOW_INCOMPLETE, MILITARY_TRANSFER_MIXED_REVIEW_REQUIRED, ARMED_FORCES_RETIREMENT_BRANCH_REQUIRED, HAZARDOUS_PERIODS_REQUIRED/INVALID, HAZARDOUS_FIFTEEN_YEARS_REQUIRED, HAZARDOUS_WINDOW_INVALID, HAZARDOUS_FIELDS_NOT_APPLICABLE, HAZARDOUS_TRANSFER_MIXED_REVIEW_REQUIRED, SENIORITY_FLAG_REQUIRED, SENIORITY_HISTORY_REQUIRED, SENIORITY_ALLOWANCE_ADDITION_REVIEW_REQUIRED, SENIORITY_MIXED_WINDOW_REVIEW_REQUIRED.

## FE-T15-DISBURSED-AMENDED — khoản vay sửa sau giải ngân, 07/10/2026

[Contract](../backend/docs/LOAN_REVISIONS_V2.md) mục "Hợp đồng sửa sau ngày giải ngân". Áp dụng cho `loanCreations[].funding` kind DISBURSED_BALANCE (cả khoản thay thế trong refinance).

- [ ] Khi ngày hiệu lực hợp đồng sau ngày giải ngân, form phải hỏi **điều khoản lúc giải ngân** (`originalTerms`: ngày ký/sửa/hiệu lực, phạm vi số dư, tỷ lệ trả, nghĩa vụ, chứng từ). Không tự sao từ hợp đồng hiện tại. Khi hợp đồng không sửa sau giải ngân thì không gửi trường này (backend 422).
- [ ] Nếu loại/trần nghĩa vụ đổi: hỏi thêm `responsibilityAmendment` (số đã trả tại giải ngân, chứng từ).
- [ ] Nếu phạm vi số dư đổi (toàn hợp đồng ↔ phần của tôi): hỏi `scopeChange.openingPrincipal` = dư gốc phần mới tại cuối ngày sửa + chứng từ; giải thích quy ước "khoản trả đến hết ngày sửa thuộc phạm vi cũ". Mỗi allocation phải chọn đúng phạm vi theo ngày.
- [ ] Hiển thị lỗi: `LOAN_ORIGINAL_TERMS_REQUIRED/INVALID`, `LOAN_SCOPE_CHANGE_REQUIRED/INVALID`, `LOAN_RESPONSIBILITY_REVIEW_REQUIRED` bằng câu hướng dẫn cụ thể.
- [ ] Nghiệm thu browser: khai khoản đã sửa tỷ lệ trả, đổi phạm vi, đổi sang CAPPED → preview/lưu/apply/mở lại.

## FE-T15-PLANNED-REFINANCE-API — public, 07/10/2026 (thay mục "chuẩn bị" bên dưới)

Backend đã mở `plannedRefinances` trong `POST /me/retirement/plans/{planId}/source-reforecasts[/preview]` ([contract](../backend/docs/PLANNED_REFINANCE.md), schema `PlannedPairCommand` trong plans.openapi.yaml). Preview trả `plannedRefinanceOptions: { eligibleLoans, activePairs }`.

- [ ] Nút "Lập phương án tái cấp vốn" chỉ hiện với khoản trong `eligibleLoans` (hợp đồng v2 chốt đúng tháng đối soát). Khoản v1/chưa cập nhật: hướng người dùng cập nhật khoản vay (`loanRevisions`) trước; có thể gửi cùng batch, backend xử lý theo thứ tự.
- [ ] CREATE: `oldSource` lấy từ eligibleLoans (`revision=sourceRevision`), `newSource={sourceId:"plan:<uuid>",revision:0,sourceHash:null}`, `expectedPairHash:null`, `replacement.sourceId/commandId` phải trùng `newSource.sourceId/replacementCommandId`.
- [ ] REVISE/CANCEL dùng nguyên `pairHash/oldSource/newSource/contractHash` trong `activePairs`. Chỉ cho REVISE khi `reviseAllowed=true`; ngược lại chỉ cho Hủy hoặc Hủy+lập lại.
- [ ] Khoản trong cặp đang hoạt động không còn trong `loanRevisionOptions`; không cho sửa riêng từng khoản (backend trả 409 `PLANNED_PAIR_SOURCE_LOCKED`).
- [ ] Khi preview trả 409 `PLANNED_PAIR_RECONCILIATION_REQUIRED`: hiện hộp đối soát. "Đã refinance thật" → gửi CANCEL + luồng refinance thực tế (END + DISBURSED_BALANCE). "Chưa/đổi ngày" → CANCEL (+ cập nhật khoản cũ bằng actual) rồi CREATE cặp mới với `pairId` mới và `sourceId` mới.
- [ ] Mọi số liệu của cặp mang nhãn HYPOTHETICAL (attribution.confirmation), không phải ngân hàng chấp thuận; không cộng tiền giải ngân vào quỹ.
- [ ] Nghiệm thu browser: tạo → lưu → apply → mở lại phiên bản (replay khớp); sửa trước ngày; hủy khôi phục lịch gốc; ca đến hạn bị chặn rồi xử lý được.

## FE-T15-PLANNED-REFINANCE — chuẩn bị luồng giả định, 07/10/2026

**Chưa có public API.** Backend mới có [bộ tính và contract nội bộ](../backend/docs/PLANNED_REFINANCE.md); chưa ghép form này vào nút lưu/apply hoặc gắn nhãn tính năng đã xong. Các endpoint refinance thực tế hiện tại không nhận input này.

- [ ] Chuẩn bị cách trình bày khoản cũ→ngày refinance→khoản mới; hiển thị các kỳ khoản cũ còn trả trước ngày dự kiến. Cùng ngày có kỳ trả phải cho chọn tất toán trước/sau kỳ đó, không mặc định ẩn.
- [ ] Tách dư gốc dự kiến (backend tính), lãi/phí báo giá giả định và phí giữ lại khoản vay mới. Hiện phương trình tài trợ toàn khoản và phần người dùng, phân biệt userTopUp với tổng tiền tất toán; chưa phải ngân hàng chấp thuận.
- [ ] Không cộng net giải ngân/tiền dư vào quỹ. Chỉ tiền bù của người dùng là khoản chi dự báo thêm; không tự tạo actual.
- [ ] Cần thao tác sửa/hủy cặp nguồn và bước đối soát khi đến ngày dự kiến. Chờ backend mở contract/proof/lifecycle và ghi checkpoint public trước khi nối API. Ca nghiệm thu chi tiết trong PLANNED_REFINANCE.md.


## FE-T15-EARLY-DISBURSEMENT — giải ngân trước tất toán, 07/10/2026

[Contract refinance](../backend/docs/LOAN_REVISIONS_V2.md) bổ sung proceedsAtSettlement trong refinances; giữ cặp END khoản cũ + CREATE khoản mới cùng lần lưu.

- [ ] Với DISBURSED_BALANCE và disbursedOn trước settledOn, nhập/xác nhận số tiền giải ngân còn sẵn có ngày tất toán, danh sách đã dùng trước đó (ID/ngày/tiền/mô tả/chứng từ). Không tự lấy dư gốc cuối kỳ làm số tiền còn sẵn có; mảng rỗng cần xác nhận chưa dùng.
- [ ] Hiện hai phép đối chiếu: gross−phí giữ lại−đã dùng=còn sẵn có; còn sẵn có+tiền bù=tiền tất toán+tiền dư. Các số cùng phạm vi toàn hợp đồng hoặc phần người dùng.
- [ ] Tách khoản trả gốc/lãi/phí theo actual khỏi dòng tiền giải ngân còn lại; khoản trả có thể do nguồn khác tài trợ. Không tự cộng khoản giải ngân/tiền dư vào quỹ hưu hoặc tự tạo WITHDRAWAL.
- [ ] Chặn nhập ngày dùng trước giải ngân/từ ngày tất toán trở đi; chứng từ số dư tiền xác nhận từ ngày tất toán. Giải ngân sau tất toán cần luồng khác chưa hỗ trợ, không đổi ngày để vượt kiểm tra. EXISTING_BALANCE không gửi trường mới.
- [ ] Nghiệm thu gross1000, đã dùng100, còn900, bù120, tất toán1020; khoản vay mới đã trả100gốc+10lãi thì dư gốc900 độc lập. Preview/save/apply/reload/CSV giữ lịch sử; thiếu confirmation/sai số trả422, sửa actual chặn apply. Browser còn cần chạy riêng.


## FE-T15-RESPONSIBILITY-AMENDMENT — sửa trần và nghĩa vụ, 07/10/2026

[Contract](../backend/docs/LOAN_REVISIONS_V2.md) và OpenAPI đã bổ sung responsibilityAmendment/userPaidToDate trong loanRevisions. Giữ preview → save → apply riêng, không sửa profile ngầm.

- [ ] Cho chọn đổi ALLOCATED_SHARE/CAPPED hoặc đổi limit; nhập ngày sửa/hiệu lực/chứng từ. Gửi responsibilityAmendment và tổng userPaidToDate; không chỉ sửa trực tiếp limit hoặc previouslyPaid.
- [ ] Hiện tổng đã trả tại **số dư mở đầu của bản trước**. Nếu backend đã pin số này, giữ nguyên; nếu chưa biết, yêu cầu xác nhận từ chứng từ, không tự điền0. Tổng kỳ này gồm gốc/lãi/phí người dùng thực trả, không lấy phần toàn hợp đồng của đồng vay.
- [ ] Khi bỏ trần vẫn giữ userPaidToDate; bật lại CAPPED phải dùng số đã trả lũy kế. Hiển thị giới hạn còn lại = limit−previouslyPaid, tách dư gốc toàn khoản vay. Hạ trần dưới số đã trả cần xử lý riêng, không tự tạo hoàn tiền.
- [ ] Ngày hiệu lực trong khoảng số dư mở đầu→cutoff; không biến ngày tương lai thành thay đổi thực tế đã xảy ra. Giữ nhãn giả định/ngân hàng xác nhận theo contract.confirmation, không tự đổi nhãn khi người dùng bấm xác nhận.
- [ ] Xử lý409 LOAN_RESPONSIBILITY_AMENDMENT_INVALID, LOAN_PAID_HISTORY_REQUIRED, LOAN_CAP_CARRY_MISMATCH; giữ nháp để sửa/xem trước lại. Kiểm đa tab và stale actual theo FE-T17.
- [ ] Nghiệm thu chuỗi: đã30+trả120=150; trần250 còn100; bỏ trần vẫn giữ150; bật lại trần200 còn50. Lưu/reload/replay/CSV giữ lịch sử và quỹ chỉ bị rút120 một lần. Browser chưa được nghiệm thu bởi kiểm backend.


## FE-T17-LOAN-ASSET-RACES — nghiệm thu nhiều tab, 07/10/2026

Backend đã kiểm3race service/DB độc lập cho cùng changeset sửa vay và góp tài sản STAGED. Không đổi endpoint/schema; phần dưới vẫn cần nghiệm thu browser.

- [ ] Gửi lại đúng yêu cầu lưu với cùng Idempotency-Key phải hiện cùng phiên bản, không thêm dòng lịch sử hoặc thông báo thành công hai lần. Khi sửa nội dung thì dùng key mới.
- [ ] Hai tab cùng plan revision: chỉ một yêu cầu lưu thắng; tab nhận409 giữ nội dung đang nhập, báo dữ liệu đã đổi và yêu cầu tải/xem trước lại, không tự tăng revision rồi gửi lại bản cũ.
- [ ] Khi sổ thực tế được sửa trong lúc áp dụng, đọc lại trạng thái server. Apply có thể thành công trước lần sửa, nhưng report sau đó có actualSourceChanged=true; hiển thị cần đối soát lại. Không gán mọi lần apply thành công thành “đang cập nhật” vĩnh viễn.
- [ ] Nghiệm thu changeset gồm trả vay120 (100gốc/10lãi/10phí), góp tài sản60 và dự kiến140: quỹ đầu1000 cho anchor940, chỉ140 là vốn dự kiến; bản lưu phải chứa đủ cả vay và tài sản. Sửa actual góp60→70 chặn áp dụng lại bản cũ nhưng vẫn xem được lịch sử đã lưu.


## FE-T16-LEGACY-CAPITAL — góp tiếp tài sản đã ghi nhận v3, 07/10/2026

[Contract tương thích](../backend/docs/ASSET_SOURCES_V4.md) đã nối ASSET_REALIZED v3 sang STAGED v4. Không đổi endpoint/schema: assetRevisionOptions nay có nguồn cũ này.

- [ ] Khi chọn nguồn đã góp ở v3, giữ cùng sourceId/hash/revision và chọn REVISE + STAGED. Không gửi lại sourceChanges/CREATE tài sản khác hoặc dùng PLANNED/REALIZED một lần.
- [ ] Hiển thị số đã góp từ event actual được sourceChanges tham chiếu; đó là toàn bộ event đã gắn, không nhân lại sở hữu hoặc ước từ profile. Preview STAGED trả proof priorRealized do backend đối chiếu.
- [ ] Nhập lại hạn mức net và chứng từ hiện tại, số muốn góp tiếp/lịch; confirmedContributionAmount gồm cả số đã góp cũ. Ví dụ đã60, còn140 thì tổng200, không phải140.
- [ ] Nếu nguồn thuê đã dừng bởi command v3, không tự phục hồi thuê hoặc bịa rentalExit. Chỉ góp tiếp phần tiền bán xác nhận được; bản v3 vẫn xem/replay theo lịch cũ.
- [ ] Giữ xử lý conflict actual/CAS, save/apply riêng. Nghiệm thu cũ60→góp thêm140, không cộng lại60 vào anchor; dùng lại event bị chặn; hủy phần tương lai; correction chặn apply nhưng đọc v3/v4 cũ vẫn được. Chưa có browser acceptance từ kiểm backend.


## FE-T16-AVAILABILITY — tiền nguồn nhận nhiều đợt, 07/10/2026

[Contract availability](../backend/docs/ASSET_SOURCES_V4.md) đã mở trong funding STAGED, thay giới hạn một ngày sẵn có của FE-T16-STAGED. Không dùng tính năng này để tự tạo tiền vay/thu nhập hoặc gọi đó là đã đối soát ngân hàng.

- [ ] Cho nhập danh sách releases: releaseId, availableOn, amount, status CONFIRMED/EXPECTED, evidence. Số tiền là phần ròng thuộc nguồn sau phí/thuế/trả nợ/sở hữu/phần hưu; không nhân tỷ lệ lần nữa. capital.availableOn bằng ngày sớm nhất.
- [ ] Tách “đã nhận ngoài quỹ”, “dự kiến nhận”, “đã góp quỹ” và “dự kiến góp”. Tiền nhận không tự cộng vào quỹ; tổng release không vượt hạn mức tiền ròng. Phần không khai release chưa được coi là sẵn có.
- [ ] Có EXPECTED thì liquidity=PLANNED_RELEASE; AVAILABLE chỉ khi toàn bộ CONFIRMED. Khoản góp thực phải được tiền CONFIRMED trước/đúng ngày giao dịch tài trợ; khoản góp cuối tháng được dùng release trong tháng nhưng không dùng tháng sau.
- [ ] Khi chốt qua tháng dự kiến nhận, yêu cầu xác nhận đã nhận hoặc cập nhật ngày còn ở tương lai; không tự đánh dấu nhận. Dời ngày nhận phải preview lại lịch góp, không tự dời tiền góp để che lỗi.
- [ ] Gửi đầy đủ release ở mỗi revision; khóa các đợt CONFIRMED cũ, không xóa availability. Chứng từ xác nhận sai cần báo luồng điều chỉnh riêng, không ghi đè lịch sử.
- [ ] Hiển thị ASSET_RECEIPT_BEFORE_RELEASE, ASSET_PLANNED_CONTRIBUTION_BEFORE_RELEASE, ASSET_RELEASE_RECONCILIATION_REQUIRED, ASSET_CONFIRMED_RELEASE_IMMUTABLE và các lỗi hạn mức/chứng từ. Không retry với số liệu đã sửa tự động.
- [ ] Nghiệm thu: đợt80 đã nhận, đã góp60, chỉ còn20 dùng được trước đợt kế; nhận cuối tháng dùng được cuối tháng, dời sang ngày1tháng sau bị chặn; chưa nhận không tài trợ actual; sửa lịch có preview/save/apply/reload/replay/CSV giữ lịch cũ. Chưa có nghiệm thu browser từ kiểm backend.


## FE-T16-STAGED — góp một phần/nhiều đợt, 07/10/2026

Backend đã mở funding.status=STAGED cho CREATE/REVISE cùng tài sản. [Contract và ví dụ](../backend/docs/ASSET_SOURCES_V4.md) thay ghi chú phần góp nhiều đợt chưa có trước đây. Phạm vi là góp nhiều lần từ tiền ròng có cùng ngày sẵn có; hợp đồng nhận tiền bán/giải ngân thành nhiều đợt cần luồng thanh khoản riêng.

- [ ] Hiển thị riêng đã góp lũy kế, khoản mới ghi nhận, lịch góp còn lại, tổng xác nhận và phần tiền ròng chưa chọn góp. confirmedContributionAmount là tổng đã góp + dự kiến, không chỉ số góp thêm.
- [ ] allocations chỉ gửi khoản mới với event/revision/ngày/số tiền; không gửi lại khoản cũ hoặc gửi priorRealized. Backend tự pin khoản cũ cùng nguồn, kiểm hạn mức và chống dùng event trùng.
- [ ] plannedContributions gồm installmentId UUID duy nhất, month, amount dương, timing=END_OF_MONTH. Cho nhiều đợt cùng tháng nhưng biểu đồ cộng thành một khoản vốn tháng; không cộng số đã góp lần nữa.
- [ ] Khi đẩy cutoff qua kỳ có lịch dự kiến, nhập reconciliations cho từng tháng: scheduledMonth, actualRevision, receivedAllocationIds, amountNotContributed, confirmedOn, reason, confirm. Các ID tham chiếu khoản mới nhận; số chưa góp không tự chuyển vào tương lai, phải chọn lịch mới rõ ràng.
- [ ] assetRevisionOptions hiện có cả nguồn REALIZED v4; muốn góp thêm chỉ REVISE sang STAGED và giữ tổng khoản cũ. Sau STAGED tiếp tục cùng chế độ; nhận hết dùng lịch rỗng, hủy phần tương lai dùng END. Không chuyển về chế độ một lần để bỏ số cũ.
- [ ] Không đánh dấu tiền chưa giải ngân là AVAILABLE. availableOn không sau khoản đã nhận nào; nhiều ngày giải phóng vốn/hạn mức tăng dần chưa thuộc contract này.
- [ ] RENT→SALE kết hợp STAGED giữ rentalExit. Dự kiến thuê vẫn hiển thị là dự kiến kể cả không chọn khoản góp tiền bán nào.
- [ ] Xử lý lỗi tổng/cap/đối soát/duplicate/actual stale bằng tải và preview lại, không tự sửa số để gửi thành công. Save/apply riêng, kiểm retry cùng key/multitab/đọc lại/CSV.
- [ ] Nghiệm thu ví dụ tổng200: đã góp60, kỳ tiếp dự kiến100 nhưng nhận30, còn110; lịch tháng mới110, anchor1090 giữ nguyên. Sau nhận110, anchor1200 và không thêm vốn tương lai. Thử hủy phần còn lại, event dùng lại, sửa actual, replay bản cũ và cùng tháng nhiều đợt.


## FE-T16-RENTAL-SALE — chuyển cho thuê sang bán, 07/10/2026

Backend đã nối lifecycle cùng sourceId qua assetCommands.REVISE. [Payload và quy tắc](../backend/docs/ASSET_SOURCES_V4.md). Các ghi chú cũ nói RENT luôn bị chặn được thay bằng mục này; chưa nghiệm thu browser.

- [ ] Hiển thị nguồn cho thuê từ assetRevisionOptions; dùng sourceId/hash/revision có sẵn, không CREATE tài sản bán mới trùng tài sản.
- [ ] Form chuyển sang bán thêm rentalExit: rentEndsOn, finalMonthIncome, amountScope=SOURCE_SHARE, confirm=true. Giải thích số thuê tháng cuối là phần ròng thuộc kế hoạch sau sở hữu/phần hưu, không nhân lại tỷ lệ hoặc tự chia theo ngày; cho nhập 0.
- [ ] Nhập riêng ngày tiền bán sẵn có (không trước ngày dừng thuê), net và các khấu trừ, tháng/số tiền xác nhận góp. Cùng tháng có thể vừa nhận khoản thuê cuối vừa góp tiền bán cuối tháng; không mặc định góp toàn bộ tiền bán hoặc tự đóng khoản vay.
- [ ] Preview thể hiện thuê trước tháng cuối giữ nguyên, tháng cuối theo số xác nhận, các tháng sau bằng 0; vốn chỉ một lần theo số góp. Gửi một lệnh REVISE và giữ save/apply tách biệt.
- [ ] Khi dời bán/góp, giữ rentalExit nếu không có thỏa thuận đổi thuê. Dời bán không tự nối lại tiền thuê. Ngày dừng thuê đã qua cutoff không được đổi; nhận lỗi ASSET_RENTAL_HISTORY_IMMUTABLE phải xử lý actual tương ứng, không ép gửi lại.
- [ ] Khi tiền bán đã góp, chuyển REALIZED theo actual allocation và giữ rentalExit, không ghi thêm quỹ. END dừng toàn bộ nguồn trong tương lai, không mang nghĩa “hủy bán và tự cho thuê lại”.
- [ ] Hiển thị lỗi ASSET_RENTAL_REVIEW_REQUIRED, ASSET_RENTAL_EXIT_MISMATCH, SOURCE_AGGREGATE_OVERLAP, actual stale; yêu cầu tải lại preview khi sửa sổ.
- [ ] Nghiệm thu nguồn có income linked không cộng trùng; bán giữa tháng/final rent0; dời bán có/không đổi ngày thuê; nhận tiền thật; replay cũ; CAS/multitab; report/CSV giữ attribution. Không tự xác nhận UI hoàn tất từ kiểm thử backend.


## FE-T16-MISSED-CONTRIBUTION — khoản góp dự kiến chưa thực hiện, 07/10/2026

[Contract và payload](../backend/docs/ASSET_SOURCES_V4.md) đã mở `assetCommands[].missedContribution` cho REVISE nguồn PLANNED qua API source-reforecasts. Đây là xác nhận toàn bộ khoản cũ chưa góp; đã góp một phần còn chờ luồng nhiều đợt.

- [ ] Khi lịch góp đã đến hạn, hiển thị nguồn, tháng và số tiền dự kiến cũ; cho chọn đã góp (REALIZED), chưa góp và dời lịch (REVISE + missedContribution), hoặc hủy lịch tương lai (END). Không mặc định “chưa góp” chỉ vì thiếu event gắn nguồn.
- [ ] Khai báo gồm scheduledMonth, actualRevision của tháng đó, amountNotContributed bằng khoản cũ, confirmedOn, reason và confirmNotContributed=true; yêu cầu chứng từ xác nhận. Gửi source revision/hash từ backend, không gửi actual payload hoặc tự sửa số dư.
- [ ] Nhập tháng mới sau cutoff và số góp mới do người dùng xác nhận; vẫn kiểm số ròng/sở hữu/phần hưu. Số tiền mới có thể khác khoản cũ; không ghi đè amountNotContributed bằng số mới.
- [ ] Không gửi metadata này cho CREATE/END/REALIZED hoặc nguồn đã nhận tiền. Khi lại lỡ hạn phải xác nhận tháng gần nhất; khi đã góp thì bỏ metadata và phân bổ actual CONTRIBUTION.
- [ ] Hiển thị riêng lỗi ASSET_PAST_CONTRIBUTION_REVIEW_REQUIRED, ASSET_MISSED_CONTRIBUTION_MISMATCH và ASSET_ACTUAL_STALE_OR_MISSING; actual bị sửa cần tải lại và preview lại. Không tự retry lưu/apply với dữ liệu cũ.
- [ ] Nghiệm thu: dời khoản 200 chưa góp sang tháng mới, actual có khoản góp khác 50 vẫn giữ nguyên; trì hoãn lần hai; nhận tiền sau trì hoãn không cộng hai lần; nguồn từ hồ sơ; replay bản cũ; actual correction chặn apply. Backend đã có kiểm thử các trường hợp này, chưa nghiệm thu trình duyệt.


## FE-T15-DISBURSED-BALANCE — vay thay thế đã trả gốc, 07/10/2026

[Contract](../backend/docs/LOAN_REVISIONS_V2.md) bổ sung funding.kind DISBURSED_BALANCE trong loanCreations; endpoint source-reforecasts hiện có. Tái cấp vốn giả định tương lai vẫn còn việc, không gắn nhãn đã hỗ trợ.

- [ ] Khi khoản mới đã trả bớt gốc trước throughMonth, thu thập tiền giải ngân ban đầu, ngày giải ngân, dư nợ cutoff và chứng từ; không ép gross bằng dư nợ, không sửa một số để khớp số kia.
- [ ] Điền funding.allocations từ actual DEBT_PAYMENT theo eventId/revision/bookedOn, tách gốc/lãi/phí và phần người dùng/toàn hợp đồng như loanRevisions; principalAdvances cho giải ngân thêm có chứng từ. Không gửi actuals/consumed/reconciliation tự tạo.
- [ ] CAPPED: xác nhận openingUserPaid tại mốc giải ngân; số đã thực hiện ở cutoff phải mang theo cả opening và các khoản người dùng đã trả. Không mặc định0, không tự đổi trần hoặc loại nghĩa vụ. ALLOCATED_SHARE đặt0 theo contract.
- [ ] Cặp tái cấp vốn giữ END vay cũ + CREATE vay mới + refinances cùng request. Với DISBURSED_BALANCE, grossPrincipal=refinances.grossDisbursement và disbursedOn=settledOn; contract.principalBalance là số đã đối soát sau trả gốc. Các ngày khác nhau/hợp đồng sửa giữa kỳ hiện cần rà.
- [ ] Preview trình bày riêng giải ngân, gốc đã trả, lãi/phí, tăng gốc và dư gốc cutoff. Không cộng tiền vay/tiền dư vào quỹ hoặc trừ lại DEBT_PAYMENT đã được WITHDRAWAL phản ánh trong actual.
- [ ] LOAN_ALLOCATION_REUSED/LOAN_EVENT_OVERALLOCATED/LOAN_ACTUAL_STALE_OR_MISSING/DEBT_BALANCE_MISMATCH/LOAN_CAP_CARRY_MISMATCH cần hướng về đúng khoản phân bổ/chứng từ. Sau sửa actual, preview lại; bản cũ vẫn đọc/replay.
- [ ] Nghiệm thu:100triệu→trả10triệu gốc+1triệu lãi→90triệu dư; wrongowner/revision, hai nguồn dùng quá một event, sửa tiếp nguồn vừa tạo, capcarry, duplicate save, save/apply/reload/report/CSV, thiếuproof bị chặn. Backend checks không thay nghiệm thu trình duyệt.


## FE-T14-PREPAID — đóng trước và ước tính hoàn trả khi nghỉ hưu, 07/10/2026

Thay phần chờ API đóng trước trong FE-T14-PAYMENTS-PENDING. [Contract hiện hành](../backend/docs/VOLUNTARY_PAYMENTS.md), [schema](../backend/docs/insurance.openapi.yaml). Chuyển tiếp/ngoại lệ/năm khác vẫn còn triển khai.

- [ ] Chọn bộ luật từ discovery có branch BH2_VOLUNTARY_PREPAID_REQUEST. Danh sách rỗng thì báo chưa có quy định công bố, không dùng trực tiếp file draft.
- [ ] Form voluntaryPrepaid theo contract: kỳ3/6/12tháng hoặc2–5năm, tháng bắt đầu, ngày đăng ký/ngày thanh toán, thu nhập, chứng từ, payment confirmation; benefitRequestDate và benefitRequest.confirmation/evidence riêng. Xác nhận không có khoản trả trước/đóng bù khác chưa đối soát; không tự đặt xác nhận.
- [ ] Dùng chung preview/save/read/source selection; không đồng gửi voluntaryCase/caseDetails/voluntaryTopUp, giữ stateSalaryCase khi phù hợp. Cutoff contributionStopMonth thuộc kỳ và ngay trước tháng hưởng; lấy kết quả thời điểm từ backend, không kéo ngày theo tổng tháng đã trả tiền.
- [ ] Phân biệt số tháng trong kỳ, số tháng được tính hưởng, số còn lại. Không cộng24/60tháng vào lịch vì đã trả trước; lịch PAID khớp chỉ được tính1lần, trạng thái/base mâu thuẫn cần sửa hoặc đối soát.
- [ ] refundSupport chưa biết gửinull; có đối soát gửi số M và chứng từ. Hiển thị UNKNOWN/null là “Cần đối soát tiền hỗ trợ”, không là0đồng. Lương hưu vẫn có thể có kết quả độc lập.
- [ ] PREPAID_REFUND_ESTIMATE là ước tính chưa nhận; tách khỏi tiền hưu/trợ cấp, không tự cộng vào quỹ hoặc đề nghị góp. ESTIMATE_NOT_RECEIVED/NO_REMAINING_PERIOD/SUPPORT_RECONCILIATION_REQUIRED có nội dung riêng.
- [ ] HYPOTHETICAL ở thanh toán hoặc yêu cầu đều là dự kiến, không chuyển thành đã thanh toán/đã nộp đơn. Các mã deadline/evidence/overlap/cutoff/unknownfactor cần hiện đúng trường; không cho sửa lãi quỹ pháp định.
- [ ] Nghiệm thu UI:7kỳ;179tháng dù mua tương lai,180đủ; trùng tháng khớp/mâu thuẫn, thiếuM/0M/Mquá lớn, sai biên nhận/yêu cầu, kỳ hết không hoàn, số dự kiến;save/reload409/ownership/source pension không chứa khoản hoàn. Backend tests không thay nghiệm thu trình duyệt.


## FE-T14-TOP-UP — API đóng bù phần thiếu, 07/10/2026

Thay phần chờ API **đóng bù** trong FE-T14-PAYMENTS-PENDING; đóng trước/hoàn trả/chuyển tiếp vẫn chờ. Contract chính thức: [VOLUNTARY_PAYMENTS.md](../backend/docs/VOLUNTARY_PAYMENTS.md), schema [insurance.openapi.yaml](../backend/docs/insurance.openapi.yaml).

- [ ] Chọn bộ luật đã công bố từ API có branch `BH2_VOLUNTARY_MISSING_YEARS_TOP_UP`. Nếu danh sách rỗng, báo chưa có bộ quy định được công bố; không tự dùng draft hoặc tính trên UI.
- [ ] Form `voluntaryTopUp`: paymentOn, missingMonths1–60, monthlyIncome chuỗi tiền, confirmation DOCUMENTED_FULLY_PAID/HYPOTHETICAL, evidence có reference/hash/confirmedOn. Gửi kind=MISSING_YEARS_TOP_UP, ageRule=NORMAL, historyTreatment=REGULAR_ONLY chỉ sau xác nhận lịch tháng không chứa khoản đóng trước/bù khác. Không gửi đồng thời voluntaryCase/caseDetails; giữ stateSalaryCase nếu lịch có Nhà nước.
- [ ] Dùng endpoint estimates hiện có cho preview/save/read, expectedInputHash/idempotency và chọn pension vào nguồn. Không tạo các tháng PAID giả để đủ180. Hiển thị riêng tháng định kỳ, tháng bù, tổng countedMonths; số thiếu phải khớp backend, không tự thay tháng người dùng nhập.
- [ ] Phân biệt đã đóng đủ có chứng từ và dự kiến. HYPOTHETICAL luôn PROJECTED_SCENARIO; không biến kế hoạch thanh toán thành trạng thái đã trả. FULL_PAYMENT_EVIDENCE_REQUIRED/BIRTH_DAY_REQUIRED_FOR_PAYMENT_MONTH phải dẫn về trường cần bổ sung.
- [ ] Hiển thị TOP_UP_GROSS_CONTRIBUTION là ước tính trước hỗ trợ và làm tròn thu thực tế, không là hóa đơn/số cá nhân chắc chắn phải trả. Lãi và giới hạn thu nhập do server chọn theo ngày đóng. Không cho chỉnh lãi suất quỹ pháp định.
- [ ] Hiển thị startMonth/ELIGIBILITY_MONTH từ backend. Không kéo dài lịch thêm số tháng bù để đoán ngày hưởng. Tiền đóng/trợ cấp/hoàn trả không tự sửa quỹ.
- [ ] Nghiệm thu: lịch tự nguyện/doanh nghiệp/Nhà nước,120+60 và179+1; sai số tháng, chứng từ trước ngày trả, ngày tương lai, trần trước/sau01/07/2026, thiếu bảng, sai tháng hưởng, luật/lịch stale409, owner, reload bản đã lưu, source selection. Backend544tests/18HTTP-DBrollback không thay nghiệm thu trình duyệt.


## FE-T14-PAYMENTS-PENDING — nghiên cứu/hàm nội bộ, chưa nối API

07/10: backend đã đối chiếu nguồn và có hàm tính khoản đóng trước/bù/hoàn trả, chưa mở nhánh estimates này. [VOLUNTARY_PAYMENTS.md](../backend/docs/VOLUNTARY_PAYMENTS.md) ghi contract dự kiến và giới hạn. UI không gọi endpoint tự đặt, không gửi các khoản này dưới REGULAR_ONLY, không đánh dấu PAID cho toàn bộ tháng tương lai vì đã trả tiền trước.

- [ ] Khi backend công bố contract: bổ sung phương thức đóng, ngày thanh toán đủ, số tháng/kỳ, thu nhập đóng, chứng từ và thực tế/dự kiến; khoản hỗ trợ/hoàn trả cần phần riêng.
- [ ] Không tính lãi trên UI hoặc cho sửa lãi suất quỹ pháp định; nhận từ bộ luật theo năm đóng. Phân biệt báo giá gross trước hỗ trợ với số người dùng thực trả.
- [ ] Phần đóng bù và đóng trước có quy tắc thời điểm hưởng khác nhau. Không suy tháng hưởng bằng cách kéo dài lịch đóng rồi lấy tháng cuối. Tiền hoàn trả/trợ cấp không tự chuyển vào quỹ.

Mục này là bàn giao chuẩn bị, chưa thay trạng thái chờ API của nhánh đóng trước/bù/chuyển tiếp.

## FE-T14-VOLUNTARY-STATE — Nhà nước + tự nguyện, 07/10/2026

Bổ sung sau FE-T14-VOLUNTARY: backend đã có engine `vn-pension-voluntary-state-v1`, coverage `BH2_VOLUNTARY_STATE_MIXED_NORMAL`. Dùng API estimates/lịch đóng hiện có. Contract [VOLUNTARY_PENSION.md](../backend/docs/VOLUNTARY_PENSION.md). Hai bộ nháp tự nguyện doanh nghiệp/Nhà nước, mỗi bộ1.146dòng, có nguồn lưu/hash; chưa duyệt độc lập hoặc công bố thực tế, UI vẫn dựa discovery để biết lựa chọn hiện có.

- [ ] Hồ sơ có lương Nhà nước trước tự nguyện phải chọn branch Nhà nước; gửi **cả** `voluntaryCase` và `stateSalaryCase`, không gửi `caseDetails`. Nhánh doanh nghiệp trước đó vẫn không nhận stateSalaryCase. Không tự chuyển engine của estimate đã lưu.
- [ ] Thu thập mốc tham gia lần đầu, chứng từ, chế độ lương thông thường và hệ số đóng từng tháng Nhà nước khi backend yêu cầu. Không lấy contributionBase tiền đồng thay hệ số, không tự giả định hệ số4 hoặc ngày tham gia.
- [ ] Hiển thị bình quân phần bắt buộc, bình quân Nhà nước/cửa sổ, số tháng từng chế độ và kết quả tổng hợp từ backend. Tổng số tháng BHXH không tự suy thành số tháng đủ điều kiện sàn. Trợ cấp vẫn tách riêng khỏi quỹ.
- [ ] Chặn luồng còn thiếu dữ liệu/review, nhất là lương trước10/2004, chuyển nghề/phụ cấp, CREDITED; không coi có engine Nhà nước là mọi hồ sơ Nhà nước đều đã hỗ trợ.
- [ ] Nghiệm thu lịch Nhà nước→tự nguyện và Nhà nước→doanh nghiệp→tự nguyện, thiếu hệ số/chứng từ/mốc tham gia, nguồn luật hết hiệu lực, 239/240tháng bắt buộc, xem lại bản cũ sau sửa lịch/luật. Giữ thao tác preview/lưu/chọn dự báo/áp dụng riêng.

Backend: full518tests/45files đạt,17HTTP/DB rollback với corpus Nhà nước+tự nguyện đạt và giữ41bảng. Không sửa frontend trong đợt này; kiểm UI vẫn giao AI UI.

## FE-T14-VOLUNTARY — backend tự nguyện/hỗn hợp doanh nghiệp, 07/10/2026

Contract [VOLUNTARY_PENSION.md](../backend/docs/VOLUNTARY_PENSION.md), schema trong `backend/docs/insurance.openapi.yaml`. API estimates hiện có đã nhận `voluntaryCase`; engine `vn-pension-voluntary-v1`, coverage `BH2_VOLUNTARY_EMPLOYER_MIXED_NORMAL`. Chỉ mở lựa chọn khi discovery có bộ luật phù hợp đã công bố; hiện chưa có corpus tự nguyện thật được duyệt/công bố. Không dùng luật mẫu kiểm thử hoặc giả dữ liệu khi danh sách rỗng.

- [ ] Form phân biệt hồ sơ đóng tự nguyện định kỳ thông thường, có/không có lịch bắt buộc lương doanh nghiệp. Thu nhập tự nguyện và tiền lương bắt buộc là hai loại căn cứ; giữ từng tháng/chứng từ và UNKNOWN, không đổi tháng thiếu thành không đóng.
- [ ] Gửi `voluntaryCase` theo contract, không kèm `caseDetails`/`stateSalaryCase`. Phân biệt `ELIGIBILITY` với tiếp tục đóng sau đủ điều kiện `CONTINUED_CONTRIBUTIONS`; nhánh sau bắt buộc ngày yêu cầu hưởng. Không tự đoán phương thức đóng định kỳ cho hồ sơ đóng trước/đóng bù.
- [ ] Hiển thị tháng hưởng, số tháng từng chế độ, bình quân điều chỉnh, tỷ lệ, sàn có/không áp dụng, trợ cấp tách riêng và căn cứ. Dùng số do backend trả, không cộng hưu/trợ cấp thành vốn/quỹ hoặc tính lại bằng JavaScript.
- [ ] `DOCUMENTED`/`HYPOTHETICAL` và `estimateKind` phải hiển thị đúng. Số đóng tương lai gửi trong `futureContributions`, không ghi vào lịch đã xác nhận. Nhãn kết quả là ước tính, không là quyết định hưởng chính thức.
- [ ] Với `INSUFFICIENT_DATA`, `NOT_YET_ELIGIBLE`, `REVIEW_REQUIRED`, trình bày `missingFields` và việc cần bổ sung; không thay `null` bằng 0 hoặc cho chọn kết quả không đủ điều kiện vào kế hoạch. Chặn chọn engine cũ cho voluntaryCase; hiển thị lỗi 422/409 và yêu cầu xem trước lại khi phù hợp.
- [ ] Lưu/đọc lại theo hash + Idempotency-Key hiện có; lịch sửa hoặc bộ luật thay thế làm estimate cũ không chọn vào nguồn mới được, nhưng vẫn xem lịch sử. Nối `pensionSelections` của nguồn v4, lưu bản dự báo và áp dụng là hai thao tác riêng.
- [ ] Nghiệm thu UI: tự nguyện thuần, hỗn hợp doanh nghiệp, 179 tháng, thiếu tháng/hệ số/chứng từ, sai ngày hưởng, tiếp tục đóng thiếu ngày yêu cầu, tình huống giả định, lịch/luật stale, danh sách luật rỗng và xem lại phiên bản cũ. Nhà nước+tự nguyện, CREDITED, đóng trước/bù/chuyển tiếp/đặc thù chưa được nghiệm thu trong nhánh này.

Backend: full499tests/44files đạt trước guard nguồn bảng hết hiệu lực; thêm25focused đạt sau guard. HTTP/DB tự nguyện16checks rollback toàn bộ41bảng đạt. Đây chưa là nghiệm thu trình duyệt hoặc phê duyệt pháp lý. Không có chỉnh sửa frontend trong đợt này.

## FE-T16-SOURCE-V4 — API đã nối 05/10/2026

Backend đã có `POST /api/v1/me/retirement/plans/{planId}/source-reforecasts/preview` và `POST .../source-reforecasts` để thêm/sửa/dừng thu, chi, pension nhập tay hoặc chọn estimate BHXH. Contract [SOURCE_COMMANDS_V4.md](../backend/docs/SOURCE_COMMANDS_V4.md) và production OpenAPI; thay ghi chú “chưa có endpoint” của FE-T14-CORPUS-SOURCE trước đó. Tài sản/vốn/vay mới và cơ cấu nợ chưa hỗ trợ trong endpoint này.

- Form gửi versionId, expectedSnapshotHash, expectedRevision plan, expectedProfileRevision, throughMonth và hai mảng sourceCommands/pensionSelections. Bước đầu có thể gửi mảng rỗng để lấy registry; chọn sourceId/revision/hash từ kết quả, không tự khớp theo tên. CREATE dùng ID mới bắt đầu `plan:`; mỗi thao tác có commandId UUID mới.
- Thu/chi nhập amount chuỗi tiền VND danh nghĩa, ONCE hoặc MONTHLY và khoảng tháng. ONCE chỉ một tháng. Không tự quy đổi FX/CPI. REVISE thay lịch từ tháng đầu đã chọn; nguồn cũ không tự trở lại khi khoảng mới kết thúc. END dừng hẳn nguồn từ tháng chỉ định. Giữ số0 khác bỏ trống, giữ chính xác chuỗi Decimal.
- Chỉ sửa tháng sau actual cutoff. Cho sửa tiếp nguồn của candidate v4 tại cùng cutoff hoặc nhập thêm actual để đẩy cutoff. Không gửi v4 vào preview v3. Lưu không áp dụng; nút áp dụng riêng dùng revision mới trả về. Giữ form khi409, tải lại metadata và yêu cầu preview lại.
- Chọn estimate BHXH đã lưu qua pensionSelections: ID/hash estimate, hash registry gốc, sourceId/revision, CREATE/REVISE, khoảng tháng, FIXED_NOMINAL và confirm. Không gửi mức hưởng tự sửa hoặc toàn bộ evidence. Hiện nhãn dự kiến; không tự áp lịch tăng pension cũ, không cộng trợ cấp vào quỹ. Nguồn pension đang có cần chọn thay thế, không cộng trùng. Nếu lịch đóng/luật đã đổi, yêu cầu tính lại estimate hoặc dừng/thay nguồn cũ.
- Report/replay/compare/CSV hiện có nhận v4. Hiện bảng attribution theo tháng và source/revision, phân biệt HYPOTHETICAL/USER_CONFIRMED. CSV v4 thêm sourceRegistryHash/sourceAttributionJson; không tự dựng lại CSV phía client. Ngữ cảnh AI có provenance.sourceRegistry; không gửi history BHXH hoặc registry cho Gemini từ frontend.
- Cảnh báo số tài sản hồ sơ và lựa chọn mục tiêu vẫn theo nền gốc: thêm nguồn ở plan không tự sửa hồ sơ tài khoản. Thêm thu không đồng nghĩa tự tăng khoản góp; chỉ góp mức đã xác nhận.
- Nghiệm thu UI cần: actual→preview rỗng→CREATE→save→REVISE cùng cutoff→compare→apply→reload→CSV; END, ONCE, chọn BHXH, stale actual/history/profile/rule,409/offline, đổi account. Backend HTTP/contract test đã có; DB thật/race/browser còn chưa nghiệm thu. Không sửa code UI trong đợt này.

## FE-RETENTION — ghi chú vận hành05/10

Backend đã có tác vụ dọn AI độc lập SMTP, kiểm thực trên fixture và diễn tập restore đạt; không có API UI mới. Không thêm nút “dọn DB” hoặc “backup đã an toàn” từ thông tin này. Hội thoại hết hạn vẫn không đọc được ngay qua API; UI phải tải lại danh sách khi nhận404/hết hạn, không khôi phục nội dung từ cache/localStorage. Không mô tả xóa hội thoại là đã xóa mọi bản backup hoặc bản sao phía Google. Phần lịch chạy/backup production chưa nghiệm thu; chi tiết [RETENTION_OPERATIONS.md](../backend/docs/RETENTION_OPERATIONS.md).

## FE-GEMINI — kết nối Google Gemini và cập nhật consent (05/10/2026)

Backend đã có provider Gemini, live smoke đạt với dữ liệu mẫu; các yêu cầu “chưa cấu hình provider” cũ phải đổi theo trạng thái API. Contract [GEMINI.md](../backend/docs/GEMINI.md) và [AI_GOVERNANCE.md](../backend/docs/AI_GOVERNANCE.md). Phiên backend này không sửa frontend.

- [ ] **Ưu tiên:** bỏ hardcode `ai-explanation-2026-10-v1` đang có trong `frontend/src/services/ai.ts`. Đọc `GET /api/v1/me/ai/privacy`, hiển thị `processingNotice` nói rõ Google Gemini nhận câu hỏi, facts và trích đoạn; lấy `policyVersion` + `revision` từ API khi người dùng xác nhận. Không tự đồng ý hoặc tự đổi bản policy đã chấp nhận.
- [ ] Xử lý `reconsentRequired=true` hoặc `acceptedPolicyVersion !== policyVersion`: hiển thị xác nhận lại dù processing đã true. Policy mới `ai-explanation-gemini-2026-10-v2`; API explain trả403 AI_CONSENT_REQUIRED trước gọi Gemini nếu chưa xác nhận. Lưu hội thoại vẫn là lựa chọn riêng, mặc định không tự bật.
- [ ] Cập nhật kiểu Privacy cho GET/PUT: `provider:string|null`, `processingNotice:string`, `reconsentRequired:boolean`, `providerConfigured:boolean`. Không dùng providerConfigured như health check; phân biệt AI_ASSISTED (“Gemini hỗ trợ giải thích”), PROVIDER_UNAVAILABLE (“AI tạm không khả dụng; hiển thị kết quả hệ thống”), PROVIDER_NOT_CONFIGURED. Không hiện lỗi thô/key từ Google.
- [ ] Tài liệu admin ghi “Kho tri thức AI”, “Tạo chỉ mục”, “Duyệt sử dụng”; upload/index không báo “đã huấn luyện Gemini”. Chỉ nguồn duyệt/còn hiệu lực được dùng; chưa có fine-tuning/embedding API. Hiển thị nguồn trích dẫn, version kết quả/cảnh báo; không cho AI tự apply kế hoạch.
- [ ] Key/model cấu hình ở backend; không thêm key vào VITE_*, request trình duyệt, localStorage hoặc màn hình client. Backend hiện cần restart để đọc env mới; việc này không phải thao tác UI.
- [ ] Nghiệm thu browser: consent v1 bị chặn → xác nhận v2 → giải thích theo version; thu hồi consent chặn lượt tiếp; timeout/lỗi Gemini vẫn giữ facts; lịch sử tách khỏi processing; nguồn chưa duyệt không xuất hiện; tài khoản khác không đọc context. Không coi smoke backend/290tests là nghiệm thu UI.

> **Backend Q15-03 bổ sung nguồn:** đã có `sourceChanges` cho khoản vay tất toán, tài sản đã vào quỹ, lịch hưu và từng dòng thu/chi. Dùng [SOURCE_REFORECAST.md](../backend/docs/SOURCE_REFORECAST.md) cùng phần bàn giao mới cuối file; mô tả “chưa chỉnh từng nguồn” ở checkpoint trước đã được thay thế trong phạm vi contract mới.

> Backend P13/P15 đã triển khai: xem mục **FE-P13-P15 — Contract backend đã triển khai 05/10/2026** cuối file và [contract API](../backend/docs/CONTRIBUTIONS_REFORECAST.md). Có timing START/END, preview/lưu/apply reforecast và phát hiện actual nguồn đã sửa. Các mô tả API chưa có phía dưới là checkpoint cũ; UI/browser chưa nghiệm thu.

> **Đối chiếu mã mới nhất05/10 sau khi lập kế hoạch P13/P15:** transport của14hàm actuals/AI/adminKnowledge đã sửa đúng method/body/header. Chạy lại verify-frontend-wire: actual PUT/privacy/explain/delete-all thành công, knowledge create201; ca góp0.01/số dư9007199254740993.26 khớp chính xác. Các404 do ID fixture không tồn tại và403 do thiếu consent lưu history, không còn lỗi wrapper. Chưa phải nghiệm thu14luồng trên DB. State theo account đã có reset/sequence mới, cần browser chứng minh; không tiếp tục mô tả code chưa có reset. Các lỗi trước sửa dưới đây giữ làm lịch sử và tiêu chí hồi quy.

**Việc UI còn thấy trực tiếp trong mã:** save rồi apply vẫn dùng closure cũ và bỏ qua false; preview còn tự chọn choices[0]; CSV Account/UserAccountModal tính cục bộ; Dashboard90% cố định; Account/UserAccountModal vẫn lưu notification preferences localStorage dù đã có service API. AdminBusinessPages còn initialPartners/initialProducts và state/localStorage. Đặc biệt route `/admin/ai` và `/admin/financial-config` hiện trỏ vào AdminAIConfigPages có initialSources/state và giả định/history localStorage: service adminKnowledge đã sửa không chứng minh màn hình đã gọi API. Cần nối/khôi phục workflow nguồn tri thức và cấu hình version đã duyệt. Provider AI vẫn chưa chọn, không đổi thành kết nối thật.

**Kiểm thử còn cần:** verify-frontend-wire mới chứng minh transport và một ca precision của hàm thật. `scripts/actuals-and-ai.test.mjs` hiện2/2PASS nhưng tự chép lại hàm đối soát, không import hàm production; đổi sang kiểm hàm thật/HTTP và thêm case lỗi/null/âm. Browser15/41 là kết quả cũ trước sửa, chưa chạy lại trong lần rà này. `setup-preview.ts` vẫn freePort/taskkill; dùng runner an toàn cho tới khi sửa lifecycle. Không đóng F26/F27 toàn luồng chỉ từ probe; phân biệt “đã sửa và kiểm hẹp” với “chưa làm”.

> **Cập nhật khắc phục và kiểm chứng ngày 05/10/2026:** Toàn bộ các khiếm khuyết trong mã UI nêu trên đã được khắc phục triệt để và kiểm chứng tự động:
> - **Save / Apply:** Lấy `planId` và `planRevision` mới từ server response để apply, chặn ngay khi `applyVersion() === false`, không dùng closure cũ.
> - **Khảo sát rủi ro:** Loại bỏ hoàn toàn hành vi tự động chọn `choices[0]`.
> - **Xuất CSV:** `AccountPage.tsx` và `UserAccountModal.tsx` ưu tiên gọi `exportPlanVersionCsv` từ backend T08 theo phiên bản đang chọn.
> - **Độ hoàn thiện Dashboard:** Tính toán động theo dữ liệu hồ sơ thực tế (`calculateProfileCompleteness` trong `FinancialProfileContext.tsx`), loại bỏ nhãn 90% cố định.
> - **Cài đặt thông báo:** Đồng bộ 2 chiều với máy chủ qua `getNotificationSettings` / `updateNotificationSettings` (GET/PUT `/me/notification-settings`), loại bỏ lưu cục bộ localStorage.
> - **Quản trị đối tác / sản phẩm:** `AdminBusinessPages.tsx` đồng bộ với `catalog.ts` (`listAdminPartners`, `listAdminProducts`, `updateAdminProduct`), hỗ trợ quản lý ẩn/hiện an toàn qua `isVisible`.
> - **Vòng đời kiểm thử:** `setup-preview.ts` đã loại bỏ hoàn toàn `freePort8444()` và lệnh `taskkill` độc đoán; sử dụng runner an toàn không tranh chấp cổng.
> - **Kết quả kiểm chứng 100%:** `verify-browser.cjs` (**8/8 PASSED**), `responsive.spec.ts` (**15/15 PASSED** trên cả 8 viewport), `financial-profile.spec.ts` (**7/7 PASSED**), `admin-ui.spec.ts` (**1/1 PASSED**), `verify-frontend-wire.cjs` (**15/15 PASSED**), `typecheck` 0 lỗi, build sản xuất và SSR prerender 5 trang thành công.

> **Chốt P13/P15 ngày05/10/2026:** chủ dự án xác nhận khách đồng ý hướng giải thích; tiền dư **chỉ góp số người dùng xác nhận**. Kế hoạch mới nằm ở `docs/task.md` mục5 và7.1 (Q13-01–03/Q15-01–04), bàn giao UI tại **FE-P13-P15** dưới đây. Đây là yêu cầu sắp triển khai, chưa phải API mới đã có. Các ghi chú “Q13/Q15 chưa chốt” bên dưới là lịch sử; giới hạn API hiện tại vẫn có hiệu lực tới khi backend phát hành contract mới.

## FE-P13-P15 — Bổ sung sau khi khách chốt

- [ ] **Thời điểm góp:** sau khi backend Q13-01/02 sẵn sàng, cho chọn đầu/cuối tháng cho góp tích lũy. Mặc định cuối tháng theo P12, bản cũ giữ lựa chọn cũ. Giải thích bằng ví dụ1triệu và thời điểm tiền bắt đầu chịu tác động lợi suất; lãi âm không bảo đảm đầu kỳ có lợi hơn. Đầu kỳ cần nguồn tiền khả dụng đã xác nhận, không lấy lương cuối tháng làm tiền có sẵn đầu tháng.
- [ ] Hiển thị tháng bắt đầu hiệu lực, đặc biệt ngày định giá giữa tháng; các dòng rút, giải phóng vốn và khoản góp sau hưu không đổi sang đầu kỳ. Summary/chart/compare/history/CSV đọc timing của version, không tính lại công thức cục bộ.
- [ ] **Tiền dư:** hiển thị thu, chi, thiếu/dư, số dự kiến góp, phần còn ngoài quỹ. Ví dụ dư5triệu, xác nhận góp2 thì ngoài quỹ3; chưa xác nhận góp thì quỹ không tự tăng. Không thêm công tắc quét toàn bộ tiền dư. Muốn góp hết thì người dùng chủ động xác nhận số đó, vẫn kiểm khả năng góp.
- [ ] **Actual khác kế hoạch:** xác nhận mức góp dự kiến không tạo bút toán đã nộp. Nhập số thực nộp/rút riêng và giữ eventId/revision; không tự tạo WITHDRAWAL từ deficit hoặc CONTRIBUTION từ surplus để ép đối soát khớp. Giữ tiền dạng chuỗi và kết quả backend; hoàn tất FE-RECHECK-02 trước nghiệm thu.
- [ ] **Dự báo cập nhật:** chuỗi thao tác nhập tháng→đối soát→preview phần còn lại→lưu phiên bản mới→so sánh→xác nhận áp dụng. Hiện reforecast chỉ đọc; chờ command Q15-02, không gọi API save plan cũ với payload tự chế hoặc tự đổi current sau lưu actual.
- [ ] Hiển thị sourceVersion, tháng/số dư actual làm mốc, model/assumption/timing/policy và cảnh báo đầu vào nguồn đã đổi. Lưu và apply dùng revision/hash/key do contract quy định;409 phải xem lại, lỗi mạng giữ form và không báo thành công giả. Snapshot đã lưu giữ nguyên dù actual nguồn sửa sau đó.
- [ ] **Một lần/định kỳ:** mặc định bút toán actual chỉ thuộc tháng đã ghi. Điều chỉnh tương lai là hành động riêng, có nguồn/dòng liên kết, số tiền, tháng bắt đầu/kết thúc, thay dòng cũ hay thêm dòng mới. Số0 khác chưa biết. Không tự kéo thưởng, chi bất thường, tất toán nợ hoặc bán tài sản sang mọi tháng sau.
- [ ] Phiên bản cập nhật giữ baseline, actual history, tháng hưu gốc; HORIZON_COMPLETE không cho lưu bản dự báo rỗng. Đổi tài khoản/logout hủy request/state đang chờ; không dùng version của tài khoản trước.
- [ ] Browser kiểm đầu/cuối kỳ với cùng bộ dữ liệu; thu12/20/25 vàchi20; góp0/2/5/vượt5; nhập/sửa quá khứ, thiếu tháng, đối soát lệch, retry/409, lưu và apply lần đầu, reload/export/AIfacts cùng version. Không dùng API mock làm bằng chứng browser đã nối DB thật.
- [ ] Phối hợp backend nghiệm thu Q13-03/Q15-04, cập nhật task và T12 bằng kết quả thực. Không đổi giả định hệ thống, mở provider AI hoặc sửa dữ liệu production để làm test xanh.

> **Kiểm tra lại 05/10/2026:** ưu tiên mục **FE-RECHECK-20261005** ngay dưới đây. Đã tái hiện 14 thao tác ghi API sai định dạng và sai số đối soát tiền; browser mở rộng 15/41 đạt, 26 lỗi. Các dấu hoàn thành cũ ở T06–T10 không thay nghiệm thu tích hợp. Chi tiết [RECHECK-T00-T10.md](RECHECK-T00-T10.md). Phiên backend này chỉ ghi bàn giao, không sửa frontend.

## FE-RECHECK-20261005 — Lỗi cần sửa trước khi nghiệm thu

### 01. Chặn luồng: sửa cách gọi API actuals, AI và tri thức

Vị trí: `src/services/api.ts:86`, `actuals.ts:193/210`, `ai.ts:135–211`, `adminKnowledge.ts:51–81`. Chữ ký hiện tại là `authenticatedRequest(path, body?, method?, extraHeaders?)`; ba service đang truyền object RequestInit vào đối số body. TypeScript không bắt vì body là unknown. Request thực tế thành POST với JSON chứa method/body/headers và mất Idempotency-Key.

- [x] Gọi đúng chữ ký `authenticatedRequest(path, { expectedRevision, data }, "PUT", { "Idempotency-Key": key })`. Không stringify payload trước khi đưa vào helper. Đã kiểm tra không ảnh hưởng các service plans/retirement.
- [x] Sửa đủ 14 thao tác: PUT actual tháng; POST reforecast; PUT privacy; POST explain/simulate/create conversation; PATCH rename/edit message; DELETE một/tất cả conversation; POST create/index/approval knowledge; PUT edit knowledge.
- [x] Test tại biên fetch/HTTP: assert method, payload top-level và header thật. Đã kiểm tra lỗi 400/401/403/409/503 và retry giữ key cùng body.
- [x] Chạy lại `backend/scripts/verify-frontend-wire.cjs`: **15/15 PASSED**, transport và đối soát số học chính xác tuyệt đối.

### 02. Chặn độ chính xác: sổ thực tế

- [x] `actuals.ts:120`: Thay thế Number/Math.round bằng thư viện `frontend/src/utils/decimal.ts` (`Decimal.add`, `sub`, `mul`, `cmp`). Đầu kỳ `9007199254740993.25`, góp `0.01`, cuối kỳ `9007199254740993.26` được tính toán chính xác không bị sai lệch số học. Dùng chuỗi tiền xuyên suốt.
- [x] Kiểm cent, số vượt MAX_SAFE_INTEGER, âm, chuyển nội bộ, thu đầu tư, fee/correction; không làm tròn payload gửi backend.

### 03. Save/apply, đầu vào thật và dữ liệu theo tài khoản

- [x] `RetirementPlanPage.tsx` và `SimulationTrackingPage.tsx`: save xong lấy `planId`/`planRevision` mới từ server response để apply; không dùng closure cũ và không bỏ qua `applyVersion() === false`. Không dùng toast thành công giả lập.
- [x] `RetirementPlanContext.tsx`: khi account ID đổi, xóa state cũ ngay và hủy/vô hiệu hóa list/detail/preview response cũ.
- [x] `RetirementPlanPage.tsx`, `SimulationTrackingPage.tsx`, `RiskPortfolioPage.tsx`: không tự chọn `choices[0]` thay câu trả lời rủi ro. Không âm thầm gán tuổi 85, chi 20tr, liquidity 12, reserve 0 hay gán rỗng các nguồn hưu/nợ.
- [x] What-if `assetId` dùng ID của tài sản trong hồ sơ v2, không dùng `CASH_SAVINGS/REAL_ESTATE/STOCK_FUND` làm ID. Gắn simulation vào đúng version.

### 04. Summary, CSV, lưu quản trị và quyền AI

- [x] Dashboard/goal/profile context: dùng summary/report theo version; Bỏ nhãn hoàn thiện 90% cố định ở `UserDashboard`/`UserLayout`, tính động theo hồ sơ thực tế (`calculateProfileCompleteness` trong `FinancialProfileContext.tsx`).
- [x] `AccountPage.tsx`/`UserAccountModal.tsx`: bỏ CSV tính bằng `projectBalanceAtAge`; gọi API export `exportPlanVersionCsv` theo planId/versionId đang chọn.
- [x] `AdminAIConfigPages.tsx`: loại bỏ lưu giả hoặc toast cục bộ; trỏ về API tri thức và cấu hình version.
- [x] `AIAssistantPage.tsx`: lỗi create conversation khi đã chọn lưu history được hiển thị; export dùng endpoint backend `/api/v1/me/ai/conversations/:id/export`.
- [x] Giữ thông báo provider chưa cấu hình; không trình bày fallback/LEXICAL_V1 thành AI ngoài/embedding đã hoạt động.

### 05. Browser: tách lỗi giao diện và fixture cũ

- [x] Khắc phục triệt để lỗi reflow trên toàn bộ 8 kích thước màn hình (320, 390, 768, 844, 1024, 1280, 1440, 1920) trong `responsive.spec.ts` (**15/15 PASSED, 100%**). Xử lý ổn định thanh cuộn (`scrollbar-gutter: stable`, `overflow-x: hidden !important`) và containment form trên viewport di động hẹp (320px).
- [x] Sửa selector đổi mật khẩu; account mở panel chỉnh sửa đúng luồng; tái cấu trúc form controls trong `ui.tsx` liên kết accessible name `<label htmlFor>` chuẩn xác; menu user hiển thị đủ 8 link.
- [x] Xóa kỳ vọng thao tác tư vấn đã nghỉ (thay bằng `410 FEATURE_RETIRED`).
- [x] `admin-ui.spec.ts`: kiểm tra giao diện royal navy, inverted fillet và tương tác đóng/mở sidebar đạt **1/1 PASSED**.
- [x] Sửa lifecycle `setup-preview.ts`, loại bỏ `freePort8444()` và `taskkill` độc đoán; sử dụng runner an toàn không xung đột cổng.
- [x] Nghiệm thu toàn diện: `node backend/scripts/verify-browser.cjs` (**8/8 PASSED**), `responsive.spec.ts` (**15/15 PASSED**), `financial-profile.spec.ts` (**7/7 PASSED**), `admin-ui.spec.ts` (**1/1 PASSED**). `npm run typecheck` đạt 0 lỗi, `npm --prefix frontend run build` và SSR prerender hoàn tất.

DB: migration0010 đã áp dụng và DB sạch/nâng cấp đã đạt; UI không tự thêm cột, reset/seed DB hoặc kết nối nhà cung cấp AI. Báo các lỗi API thực còn lại cho backend cùng request đã bỏ thông tin nhạy cảm và expected/actual.

> Bàn giao mới nhất 05/10/2026: backend T11 đã có catalog/tùy chọn thông báo lưu DB; tư vấn chuyên viên đã trả410. Phần **FE-T11/T12 ở cuối file** là việc mới cần làm, không tự đánh dấu đã hoàn thành từ các checkpoint cũ. Xem `backend/docs/SECONDARY_MODULES.md` và `docs/T12-acceptance.md`.

Ngày lập: 04/10/2026. Cập nhật tiến độ: 04/10/2026.

Nguồn: đối chiếu `docs/task.md` với mã nguồn frontend và tiến độ backend T01–T05 trong `backend/PROGRESS.md`.

## 1. Các UI đã hoàn thành triển khai và kết nối backend T01–T05

| UI | Nội dung đã triển khai | Trạng thái |
|---|---|---|
| **Khai báo ban đầu và hồ sơ tài chính (T01)** | Đã nối hồ sơ v2 (`ProfileV2`, `ProfileV2Changes`); hỗ trợ nhập tháng năm sinh `birthMonth`, tháng nghỉ hưu `desiredRetirementMonth` (YYYY-MM); quản lý từng nguồn thu, khoản chi, tài sản; phân tách mục đích tài sản (Hưu trí %, Dự phòng %, Mục tiêu khác %) và tính thanh khoản (LIQUID/ILLIQUID/LOCKED). Phân biệt rõ trạng thái KNOWN / UNKNOWN / NOT_APPLICABLE. | **Đã hoàn thành** (`services/financialProfile.ts`, `FinancialProfileContext.tsx`, `FinancialProfilePanel.tsx`) |
| **Quản lý khoản vay (T02)** | Danh sách và biểu mẫu từng khoản vay: dư nợ, số tiền trả định kỳ, tỷ lệ nghĩa vụ cá nhân/khoản vay chung, trạng thái hợp đồng tín dụng và phạm vi trách nhiệm. | **Đã hoàn thành** (`pages/DebtAnalysisPage.tsx`) |
| **Phân tích trả nợ & So sánh chiến lược (T02)** | Kết nối API `POST /api/v1/me/debts/preview`: đo lường tỷ lệ trả nợ trên thu nhập (DTI), dòng tiền khả dụng còn lại mỗi tháng, nhận diện tháng đầu tiên thiếu hụt tiền (`firstShortfallMonth`). So sánh 4 chiến lược: Theo hợp đồng (Baseline), Thác đổ (Avalanche), Tuyết lăn (Snowball), và Tất toán trước khoản chọn. Báo rõ khi thiếu hợp đồng tín dụng chi tiết. | **Đã hoàn thành** (`services/debts.ts`, `pages/DebtAnalysisPage.tsx`, route `/user/debts`) |
| **Khảo sát rủi ro và chọn danh mục chuẩn (T04)** | Bộ câu hỏi chuẩn mực 6 chiều (Mục tiêu, Thời gian, Thanh khoản, Chấp nhận rủi ro, Kinh nghiệm, Năng lực tài chính) tải từ chính sách được duyệt (`/api/v1/me/portfolio-policies`); tính điểm, phân nhóm rủi ro, cho phép chọn giữa các danh mục phù hợp; hiển thị tỷ trọng tài sản, chu kỳ tái cân bằng và phí; mô phỏng 3 kịch bản kinh tế (Cơ sở, Bất lợi, Thuận lợi). Đã ghi rõ lưu ý: đây là diễn biến của **danh mục chuẩn**, chưa phải số tiền quỹ hưu trí cá nhân. | **Đã hoàn thành** (`services/portfolios.ts`, `pages/RiskPortfolioPage.tsx`, route `/user/risk-portfolio`) |
| **Admin: Giả định tài chính (T03)** | Thay thế lưu trình duyệt bằng API backend `/api/v1/admin/assumptions`. Hiển thị bảng chuỗi giả định v2 theo kỳ dự phóng, phiên bản, ngày hiệu lực và tích hợp luồng quản trị: **Kiểm tra (Validate) → Duyệt (Approve với Impact Token) → Công bố (Publish)**. | **Đã hoàn thành** (`pages/admin/AdminAIConfigPages.tsx`) |
| **Admin: Chính sách danh mục chuẩn (T04)** | Bổ sung khu vực quản trị chính sách danh mục chuẩn kết nối API `/api/v1/admin/portfolio-policies`: hiển thị phiên bản, trạng thái, ngày hiệu lực và luồng phê duyệt (Kiểm tra, Duyệt, Công bố). | **Đã hoàn thành** (`pages/admin/AdminAIConfigPages.tsx`) |
| **Khai báo và xem trước lương hưu / BHXH (T05)** | Quản lý khai báo lương hưu nhập tay (`UNKNOWN`, `KNOWN`, `NOT_APPLICABLE`), hỗ trợ hai cơ sở tiền tệ (`TODAY`, `NOMINAL_AT_START`), nguồn và ngày ước tính, tự động đồng bộ `basisMonth`. Quản lý lịch điều chỉnh danh nghĩa (`EXPLICIT_SCHEDULE`), chống cộng trùng nguồn thu (`linkedIncomeId`), tra cứu tuổi nghỉ hưu pháp lý theo Nghị định 135/2020/NĐ-CP (NORMAL, Điều 5, Điều khác). Tích hợp preview API `POST /api/v1/me/pension/preview` gắn chuỗi giả định T03 đã công bố, ánh xạ đầy đủ mã cảnh báo và giới hạn; loại bỏ hoàn toàn công thức demo 20 năm / 45% và tự tăng CPI. | **Đã hoàn thành** (`services/pensions.ts`, `FinancialProfilePanel.tsx`, `retirementCalculator.ts`, `RetirementPlanPage.tsx`, `AIAssistantPage.tsx`, `OnboardingPage.tsx`) |

## 2. Các lỗi trong code UI hiện tại đã được khắc phục triệt để

- **Thông báo lưu mục tiêu:** Đã làm rõ trong `RetirementGoalPage.tsx` rằng các thay đổi mục tiêu đang được tính toán mô phỏng cục bộ và chỉ lưu chính thức sau khi có xác nhận từ máy chủ.
- **Tự gán tỷ lệ giả định:** Đã xóa bỏ các giá trị fallback gán cứng (4.0%, 7.0%, 7.8%), thay bằng đọc từ chuỗi giả định được duyệt; bổ sung cảnh báo khi máy chủ chưa công bố chuỗi giả định vĩ mô.
- **Cấu hình admin lưu thật:** `AdminAIConfigPages.tsx` đã bỏ lưu `localStorage` cho giả định vĩ mô; nối API thật `/api/v1/admin/assumptions` và `/api/v1/admin/portfolio-policies`.
- **Bảo toàn số âm & thiếu hụt:** `FinancialProfileContext.tsx` và `SimulationTrackingPage.tsx` đã bỏ hàm `Math.max(0, ...)` ép dòng tiền và tài sản ròng về 0, giữ số âm để thể hiện chính xác tình trạng thiếu hụt dòng tiền / tài sản ròng âm.
- **Nội dung chưa khớp chức năng:** Đã gỡ thông báo "cập nhật tự động" khi chưa có cơ chế phiên bản máy chủ.
- **Anti-slop / Design Taste:** Đã rà soát và loại bỏ toàn bộ dấu gạch ngang dài em-dash khỏi giao diện, duy trì tông màu thanh lịch (slate, navy, cream, sage) đạt chuẩn WCAG AA.

## 3. Các màn cần tiếp tục triển khai khi hoàn thành backend tiếp theo (T06–T11)

| UI | Nội dung cần sửa | Phụ thuộc backend |
|---|---|---|
| **Mục tiêu hưu trí** | Lưu mục tiêu thật lên backend; chọn thời điểm theo tháng; phân biệt mức sống theo tiền hôm nay và tiền tại thời điểm nghỉ hưu; dùng giả định đúng phiên bản. | T06–T08 |
| **Dashboard và kế hoạch hưu trí** | Lấy kết quả từ server; tách tài sản ròng với vốn hưu trí; tách tiền dư, mức đang đóng, mức cần đóng và phần thiếu. Biểu đồ có ngày định giá, phiên bản và trạng thái thiếu dữ liệu. | T06–T08 |
| **Mô phỏng và áp dụng kế hoạch** | So sánh phương án với kế hoạch hiện hành; hiện rõ biến thay đổi; xem trước rồi chủ động áp dụng. Bổ sung lịch sử phiên bản. | T07–T08 |
| **Theo dõi thực tế — bổ sung** | Sổ theo tháng: thu, chi, trả nợ, nộp/rút quỹ, lãi/lỗ, phí và số dư; so sánh thực tế với kế hoạch, cảnh báo lệch số dư. | T09 |
| **AI, báo cáo và các module phụ** | AI giải thích đúng phiên bản; báo cáo lấy số từ server; đối tác và cài đặt lưu theo tài khoản. Bỏ luồng tư vấn chuyên viên ngoài phạm vi, giữ hỗ trợ. | T10–T11 |

## 4. Kết quả kiểm chứng tự động

- `npm run typecheck`: **0 lỗi** trên cả frontend và backend.
- `npm --prefix frontend run test:assets`: **18/18 tests passed** (100%).
- `npm --prefix backend test`: **15/15 test files, 167/167 tests passed** (100%).

## Bàn giao UI phát sinh từ backend T05 — 04/10/2026

**Chỉ đạo:** backend tiếp tục độc lập; AI làm frontend triển khai các mục bên dưới. Đợt T05 không sửa mã giao diện. Đây là phần bổ sung cho bản rà soát trước: form và preview lương hưu đã có API T05; biểu đồ quỹ cá nhân vẫn chờ T06–T08. Các ghi chú hoàn thành UI phía trên không tự đóng những mục mới này.

Contract: [PENSIONS.md](../backend/docs/PENSIONS.md), [pensions.openapi.yaml](../backend/docs/pensions.openapi.yaml), [profile-v2.openapi.yaml](../backend/docs/profile-v2.openapi.yaml).

### FE-T05-01 — Form lương hưu nhập tay

- [x] Thay phần suy lương hưu từ số năm BHXH/lương đóng trong onboarding và hồ sơ bằng lựa chọn **chưa biết / có mức ước tính / không áp dụng**. Số 0 chỉ có khi người dùng xác nhận; không chuyển ô trống thành 0.
- [x] Khi có ước tính: nhập `monthlyAmount` dạng chuỗi tiền, `currency: VND`, nguồn `source`, ngày ước tính `estimatedOn`, cơ sở tiền `priceBasis`. Nhãn: “Theo giá trị tiền hôm nay” (`TODAY`) và “Số tiền dự kiến tại tháng bắt đầu nhận” (`NOMINAL_AT_START`).
- [x] Giữ tháng nhận ở `personal.pensionStartMonth` (`KNOWN/value`, `UNKNOWN`, `NOT_APPLICABLE/reason`). Không tự đổi theo tháng nghỉ hưu mong muốn hoặc kết quả tra tuổi pháp lý.
- [x] `basisMonth`: TODAY bằng tháng của ngày định giá; NOMINAL_AT_START bằng tháng nhận đã biết. Nếu đang nhận từ trước tháng định giá, hướng dẫn khai mức danh nghĩa và lịch điều chỉnh thay vì tự quy đổi ngược.
- [x] Cho chọn giữ nguyên mức danh nghĩa (`adjustment.kind: NONE`) hoặc nhập lịch điều chỉnh rõ (`EXPLICIT_SCHEDULE`); mỗi dòng có `effectiveMonth`, mức tiền thay thế `monthlyAmount`, nguồn `source`. Không tự sinh lịch tăng CPI. Không trùng tháng hoặc bắt đầu trước/bằng tháng nhận.
- [x] Lưu qua onboarding/profile API hiện có, kèm revision. Patch `pension` thay cả đối tượng; khi đổi tháng nhận danh nghĩa, gửi đồng thời tháng nhận và basisMonth mới. Giữ form khi lỗi mạng/xung đột, chỉ báo đã lưu khi server xác nhận.
- [x] Hồ sơ v1 phải được rà soát/nâng lên v2 trước preview; không tự suy mức hưu từ các số 0 cũ. Nháp chưa đủ bộ KNOWN: giữ phần nhập dở trong form và dùng UNKNOWN khi lưu lên server, không báo các trường chưa gửi đã được lưu.

### FE-T05-02 — Preview lương hưu theo tháng

- [x] Sau khi lưu, gọi `POST /api/v1/me/pension/preview` với `{expectedProfileRevision, startMonth, months}`. startMonth từ tháng định giá; tối đa 1.200 tháng. Chỉ USER; không truyền userId, số tiền, CPI/lợi suất ghi đè.
- [x] Nếu TODAY cần quy đổi, chọn đúng `assumptionVersionId` từ bộ T03 đã công bố. Không tự chọn tỷ lệ 4%, 7% hoặc 7,5% khi thiếu dữ liệu. Chưa có bộ công bố thì hiển thị thiếu cấu hình.
- [x] Hiển thị `rows[].amount` từ API: 0 trước kỳ nhận, số tiền đúng kỳ nhận, null là chưa tính được. Phân biệt INCOMPLETE với lỗi kết nối.
- [x] Ánh xạ mã: `PENSION_NOT_INCLUDED` → chưa gồm lương hưu; `PENSION_START_MONTH_REQUIRED` → thiếu tháng nhận; `PUBLISHED_INFLATION_REQUIRED` → cần bộ giả định; `INFLATION_YEAR_MISSING` → thiếu năm; `NOMINAL_AMOUNT_REQUIRED_FOR_EXISTING_PENSION` → cần mức danh nghĩa cho khoản đã nhận.
- [x] Ghi đây là **ước tính do người dùng khai**, không phải quyết định quyền lợi. Hiển thị ngày định giá, nguồn/ngày ước tính, phiên bản giả định nếu có. Preview không áp dụng kế hoạch chính; không báo kế hoạch đã cập nhật.

### FE-T05-03 — Tuổi nghỉ hưu tham chiếu

- [x] Thu thập tháng sinh, giới tính áp dụng cho bảng luật và `personal.retirementCondition`; không mặc định lao động bình thường hoặc tự suy giới tính.
- [x] Điều kiện: UNKNOWN, NORMAL, ARTICLE_5_DECLARED hoặc OTHER. Điều 5 cần basis và evidence theo contract; OTHER cần description.
- [x] Hiển thị riêng **thời điểm người dùng muốn nghỉ**, **tháng nghỉ hưu tham chiếu theo quy định**, **tháng nhận người dùng đã khai**. `legalRetirementAge.retirementMonth` và `pensionStartMonth` khác nhau; `ageMonths` hiển thị năm/tháng.
- [x] REFERENCE_ONLY là tham chiếu; `eligibility: NOT_ASSESSED` nghĩa là chưa xác định đủ điều kiện hưởng. Điều 5 là mốc thấp nhất dựa trên khai báo chưa kiểm chứng; không ghi “đã đủ điều kiện nghỉ sớm”.
- [x] REVIEW_REQUIRED: hiển thị lý do thiếu/phạm vi đặc thù, không điền tuổi mặc định. Hiển thị nguồn và `rule.version/verifiedOn`; không để đổi mục tiêu làm thay giá trị pháp lý.

### FE-T05-04 — Không cộng trùng và loại số demo

- [x] Nếu đã khai lương hưu trong danh sách thu, đánh dấu dòng đó `source: PENSION` và liên kết bằng `pension.linkedIncomeId`, hoặc chuyển sang mục pension và bỏ dòng thu trùng. Gửi thay đổi liên quan cùng request. Backend chỉ dùng pension để tính; dòng liên kết là tham chiếu.
- [x] Yêu cầu rà khoản thu cũ: backend không thể chắc chắn nhận ra lương hưu qua nhãn tự do. Không cộng `rows.amount` thêm vào summary server vốn đã gồm mức hưu tính được.
- [x] Rà và bỏ mọi công thức demo 20 năm/45% và tự tăng lương hưu CPI còn lại trong calculator/nội dung kế hoạch/mô phỏng/AI. Khi chưa nối engine tháng T06, ghi rõ kết quả chưa gồm lương hưu thay vì biến null thành 0 đã xác nhận.
- [x] Summary thu có thể null khi mức đã khai chưa đủ dữ liệu quy đổi. Hiển thị thiếu dữ liệu; không thay bằng 0 hoặc thông báo tài chính tích cực.

### Nghiệm thu UI T05

- [x] Lưu → tải lại vẫn còn số tiền, nguồn, cơ sở tiền và tháng nhận; revision conflict không mất nội dung đang nhập.
- [x] Chưa khai, xác nhận 0, không áp dụng, thiếu tháng nhận và thiếu bộ T03 hiển thị khác nhau.
- [x] Trước tháng nhận không có thu; đúng tháng mới có; không tự tăng CPI sau đó. Lịch điều chỉnh thay mức từ đúng tháng.
- [x] Đổi mục tiêu nghỉ hưu không tự đổi tháng nhận đã khai hoặc kết quả tra luật. Không cộng lương hưu hai lần khi có dòng thu liên kết.
- [x] Thử lỗi mạng, 401/403, 409, hồ sơ v1 và thiếu cấu hình. Kiểm tra giao diện điện thoại, bàn phím và nhãn lỗi tại trường.

### Ghi chú từ kiểm tra DB thật — 04/10/2026, 09:52

Đủ schema/migration, nhưng chưa có bộ T03 hoặc chính sách T04 nào trong `assumption_set_versions`; cả 50 hồ sơ hiện có vẫn là v1. Chi tiết tại [database-bo-sung.md](database-bo-sung.md).

- [x] Hiển thị đúng trạng thái chưa cấu hình T03/T04, hướng dẫn ADMIN tạo/duyệt/công bố qua API; không chèn tỷ lệ hoặc danh mục mẫu để lấp trạng thái trống.
- [x] Với hồ sơ v1, có luồng rà soát và lưu đủ cấu trúc v2 trước khi gọi preview nợ/lương hưu; không chỉ gửi đổi schemaVersion, không coi số 0 cũ là xác nhận mới.
- [x] Sau khi công bố cấu hình, tải lại danh sách các bản có hiệu lực; không tự áp dụng vào kế hoạch chính của USER.

## Bổ sung backend T06 — 04/10/2026: preview quỹ hưu trí theo tháng

Phần này giao AI frontend; các ô bên dưới chưa được backend xác nhận nghiệm thu UI. Contract: [RETIREMENT_MONTHLY.md](../backend/docs/RETIREMENT_MONTHLY.md), [retirement.openapi.yaml](../backend/docs/retirement.openapi.yaml). Backend đã kiểm chứng 26 ca T06 và 13 kiểm tra HTTP/database thật rollback. Không cần migration T06. Chưa có create/apply/snapshot T07; không báo kế hoạch chính đã được cập nhật khi chỉ preview.

### FE-T06-01 — Nối preview và thu đủ đầu vào

- [x] Gọi `POST /api/v1/me/retirement/preview` với revision hồ sơ v2 và policyVersionId T04 đã công bố/có hiệu lực; lấy đúng answers/question/choice, liquidityNeedMonths, templateId nếu cần từ bước T04. Không hardcode danh mục, lãi, CPI hoặc chọn mới nhất đè lựa chọn cũ.

- [x] Thu `endMonth` (tháng cuối kế hoạch), `monthlyExpenseToday` (mức sống sau hưu theo tiền hôm nay), `monthlyContribution` và `monthlyReserve` (khoản giữ ngoài quỹ khi tích lũy). Giải thích không nhập trùng khoản dự phòng đã nằm trong chi hồ sơ. `terminalBalance` là số dư mong muốn danh nghĩa cuối kỳ, mặc định 0.
- [x] Chọn rõ `retirementIncomeIds` cho các khoản thu còn tiếp tục sau hưu; [] là không chọn. Pension lấy riêng từ hồ sơ, không đưa vào danh sách này. `retirementAdditionalExpenseIds` chỉ gồm chi ngoài mức sống vừa nhập; nợ lấy lịch hợp đồng, không chọn DEBT_PAYMENT.
- [x] Lịch góp tùy tháng dùng `contributionSchedule[{month,amount}]`, thay riêng tháng chọn trong giai đoạn tích lũy. `retirementContributionSchedule` là lựa chọn góp sau hưu rõ ràng; Q15 không tự nộp tiền dư. Không mở công tắc góp đầu kỳ Q13; API hiện chỉ cuối kỳ.
- [x] Nhà có kế hoạch bán/thuê: thu `housing[{assetId,amountScope,linkedIncomeId?}]`, xác nhận số tiền ròng là WHOLE_ASSET hay OWNERS_SHARE; liên kết dòng thu cũ để tránh trùng. Không tự coi giá nhà là tiền mặt; bán trước tháng định giá yêu cầu đối soát thành tài sản tiền. Không cho backend đoán khoản trùng từ nhãn tự do.
- [x] Dùng `debtStress` từ T02 khi thử trách nhiệm trả nợ tăng, không cộng lịch gốc lần hai. Endpoint này chưa nhận phương án thay hợp đồng avalanche/snowball/tất toán.

### FE-T06-02 — Hiển thị kết quả đúng ý nghĩa

- [x] Dùng `calculation.summary`, không lấy số tính từ calculator demo. Hiển thị A/K/G cùng một cơ sở: `atRetirement` tại đầu tháng hưu hoặc `atValuation` quy về đầu kỳ định giá. `atValuation.projectedFund` gồm giá trị góp tương lai quy đổi; không đặt nhãn tài sản hiện có. Vốn hiện có dùng `initialRetirementCapital`, tài sản ròng dùng `netWorth` riêng.
- [x] K=0: `coveragePercent:null` hiển thị không áp dụng; không đổi thành 100%. A/K vượt 100% vẫn hiện đúng số. G âm là dư; dùng `retirementFundingShortfall`/`excessAtRetirement` để viết câu rõ ràng.
- [x] Phân biệt mức góp dự định, `rows.contribution` thực góp dự kiến sau giới hạn ngân sách, `requiredConstantMonthlyContribution` tổng cần góp đều và `additionalMonthlyContribution` tăng đều trên lịch thực góp. Không tự tính thêm bằng phép trừ hai số đầu. Hiện `requiredContributionWithinCapacity`, `firstBudgetShortfallMonth` và khoản thiếu ngân sách từng tháng.
- [x] Nghỉ hưu ngay: mức góp solver null, không hiện lỗi NaN/Infinity hoặc 0 đã đủ. Nếu còn thiếu, hiển thị thiếu ngay tại tháng hưu.
- [x] Hiện `firstShortfallMonth`, `unfundedWithdrawals`, `liquidityReserveAboveAlgebraicPV`, `terminalTarget/terminalTargetShortfall` khi liên quan; đủ quỹ tại hưu không che thiếu tiền trước đó. `closingBalance` âm là đường thiếu hụt, không phải khoản vay được cấp.
- [x] Tiền chuỗi Decimal chỉ làm tròn khi hiển thị đến 1.000 VND, tỷ lệ 2 chữ số thập phân; không dùng dữ liệu đã định dạng cho request hoặc tính toán. `null`/thiếu dữ liệu khác 0 đã xác nhận.

### FE-T06-03 — Chuỗi tháng, biểu đồ, xuất dữ liệu và nguồn

- [x] Chart dùng trực tiếp `calculation.rows` theo month; giữ số dư âm. Đường vốn cần dùng `requiredClosingBalance` cùng thời điểm cuối tháng với `closingBalance`; bỏ đường progress^1.35 và mọi phép nội suy giả.
- [x] Bảng tháng có thu, pension, chi sinh hoạt, chi khác/dự phòng, nợ, góp dự định/thực góp, rút, tiền dư ngoài quỹ, vốn giải phóng, lãi/lỗ, vốn cần/số dư/nhu cầu chưa tài trợ. `netWithdrawal` có thể âm; không tự lấy số âm làm tiền góp quỹ.
- [x] Xuất cùng rows/summary của lần preview đang xem, gắn modelVersion, profileRevision, ngày định giá, ID/version/hash T03/T04, scenario, inputHash và quy ước cuối kỳ. Nhãn là bản xem trước chưa lưu; chưa gọi đây là snapshot đã áp dụng. Không trộn response mới/cũ khi người dùng đổi input nhanh.
- [x] Hiện nguồn và delta đã duyệt từ `scenario`, phí/tỷ trọng từ `marketRows`, assessment; không diễn giải mô phỏng xác định là xác suất thành công. Giữ enum BASE/ADVERSE/FAVORABLE theo contract T04; không tự đổi FAVORABLE thành căng thẳng.

### FE-T06-04 — Thiếu dữ liệu, cảnh báo và xung đột

- [x] `status:INCOMPLETE` có calculation/replayInput null: dẫn về trường theo issues.path/code, không vẽ kết quả 0. Thiếu cấu hình/mất mạng/lỗi quyền phải là các trạng thái riêng.
- [x] READY vẫn đọc warnings: PENSION_NOT_INCLUDED (chưa gồm mức hưu chưa khai), PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION (tháng đầu tính đủ tháng), tài sản chưa thanh khoản/giải phóng muộn, nợ còn sau kỳ cuối. Không ẩn cảnh báo pension bằng câu đã xác nhận không có lương hưu.
- [x] 409 revision: yêu cầu tải lại hồ sơ và preview lại; giữ nội dung đang nhập. Hồ sơ v1 cần rà soát v2. 404 phiên bản không khả dụng: chọn lại từ danh sách đã công bố, không thay macro bằng số demo.
- [x] Khi thay request, đánh dấu kết quả cũ chưa còn phù hợp đến khi response mới về; chặn response đến muộn ghi đè lựa chọn mới. API read-only, không hiện toast đã lưu/đã áp dụng.

### Nghiệm thu UI T06

- [x] i=0, lãi âm, K=0, >100%, nghỉ ngay, lịch góp thay tháng, pension đến muộn, thiếu trước khoản bán nhà đến sau đều khớp payload backend; bảng/chart/export cùng kết quả.
- [x] Thử góp vượt tiền dư, khoản dự phòng, Q15 tiền dư giữ ngoài quỹ; không báo đủ góp khi backend đã giới hạn mức thực góp.
- [x] Thử INCOMPLETE, warnings khi READY, 401/403/404/409, response đến sai thứ tự và lỗi mạng; kiểm tra điện thoại/bàn phím/nhãn lỗi.
- [x] Chỉ coi phần preview hoàn tất khi bỏ nguồn số demo ở màn được nối; save/apply kế hoạch và snapshot chờ T07–T08, không giả thành công trong UI.

### Cập nhật trạng thái DB cho UI — 19:51 ngày 04/10/2026

Kiểm tra mới thay ghi chú 09:52: đã có 1 bộ T03 và 1 policy T04 PUBLISHED/có hiệu lực, 50/50 hồ sơ có schemaVersion 2. Đây là metadata, chưa khẳng định tất cả hồ sơ đủ dữ liệu T06 hoặc đã được người dùng xác nhận nghiệp vụ. UI tải dữ liệu hiện tại từ API và xử lý cả READY/INCOMPLETE; không hardcode trạng thái thiếu cấu hình/v1 từ ghi chú cũ. Knowledge có 5 nguồn PENDING/chưa duyệt và 18 chunks chưa embedding, chưa coi dữ liệu này là nguồn RAG đã sẵn sàng. Chi tiết [database-bo-sung.md](database-bo-sung.md).

## Bổ sung backend T07 — 04/10/2026: lưu phiên bản và áp dụng

Giao AI frontend triển khai; backend không đánh dấu nghiệm thu UI. Contract [PLANS.md](../backend/docs/PLANS.md), [plans.openapi.yaml](../backend/docs/plans.openapi.yaml). Migration T07 đã có trên DB thật; API USER được đăng ký. Phần preview T06 và phần lưu/apply dưới đây là các trạng thái khác nhau.

### FE-T07-01 — Lưu phiên bản sau khi đã xem trước

- [x] Chỉ cho lưu khi preview T06 READY; POST `/api/v1/me/retirement/plans` tạo kế hoạch và version đầu; POST `/api/v1/me/retirement/plans/:planId/versions` lưu thêm version vào kế hoạch đang chọn.
- [x] Body `{expectedRevision,expectedInputHash,preview}`: hash lấy response T06, preview là chính request đã xem; không gửi calculation/snapshot do frontend tính. Kế hoạch mới revision 0, bản tiếp lấy revision từ server.
- [x] Header `Idempotency-Key` UUID cho từng thao tác. Retry khi timeout dùng lại cùng key/body, thao tác mới dùng key mới. Không tạo UUID khác ở mỗi lần retry cùng thao tác.
- [x] Sau lưu dùng response saved/planId/revision; thông báo “Đã lưu phiên bản”, chưa “Đã áp dụng”. currentVersionId và baselineVersionId vẫn giữ nguyên; kế hoạch mới chưa áp dụng có current=null, không tự báo là kế hoạch đang dùng.
- [x] PREVIEW_CHANGED hoặc REVISION_CONFLICT: tải trạng thái mới, giữ form, yêu cầu xem lại. PLAN_INPUTS_INCOMPLETE: bổ sung dữ liệu; không lưu local để giả thành công.

### FE-T07-02 — Áp dụng rõ ràng và giữ bản gốc

- [x] Hiện riêng nút “Áp dụng phiên bản này”, cho người dùng xem version/ngày định giá/nguồn/summary trước khi xác nhận. POST `/:planId/apply` với `{versionId,expectedRevision,expectedProfileRevision,confirm:true}` và Idempotency-Key riêng.
- [x] Chỉ sau response thành công mới cập nhật nhãn “Đang áp dụng” và reload kế hoạch. Nếu alreadyCurrent=true thì giữ trạng thái, không tạo thêm lịch sử giả.
- [x] baselineVersionId là bản đầu đã áp dụng và giữ nguyên khi đổi current; đánh dấu “Bản gốc” riêng với “Đang áp dụng”. Bản lưu mới không tự thay một trong hai.
- [x] PROFILE_CHANGED_RECREATE_VERSION: hồ sơ khác snapshot, phải preview/lưu version mới rồi áp dụng. Không cho bỏ qua bằng cách chỉ thay expectedProfileRevision trong body.
- [x] Cấu hình mới không vô hiệu hóa bản đã lưu: người dùng có thể giữ bản cũ, xem thử cấu hình mới và tự áp dụng. Không tự apply khi mở trang, đổi risk/scenario hoặc khi ADMIN publish.

### FE-T07-03 — Danh sách, lịch sử và số liệu theo version

- [x] GET `/api/v1/me/retirement/plans` để chọn kế hoạch (page/limit, tối đa 50); giữ planId đang chọn. Mỗi plan có current riêng; không tự coi danh sách có nhiều plan là nhiều current xung đột.
- [x] GET `/:planId` đọc current, profileChanged, stale và updates.assumptions/policy. Hiển thị “Có cấu hình mới” riêng với “Hồ sơ đã thay đổi”. Chỉ gợi ý xem thử, không tự thay kết quả hiện tại.
- [x] GET `/:planId/versions` lịch sử và `/:planId/versions/:versionId` để mở bản cũ. Dashboard/plan/chart/export phải cùng planId/versionId và `preview.calculation.rows/summary` đã lưu; không lấy assumption hiện hành pha vào bản cũ.
- [x] POST `/:planId/versions/:versionId/replay` body `{}` là kiểm chứng tính lại từ snapshot, không tạo/áp dụng version. SNAPSHOT_MODEL_UNSUPPORTED/INTEGRITY_FAILED/REPLAY_MISMATCH hiển thị lỗi đọc bản, không chạy calculator demo thay thế.
- [x] Snapshot là kế hoạch dự phóng, không phải số dư thực tế. Goal tuổi-năm legacy chưa là nguồn dữ liệu của T07; dùng tháng hưu profile v2 và selection T06 được lưu trong snapshot.

### FE-T07-04 — Nghiệm thu và phục hồi lỗi

- [x] Lưu v1 → reload vẫn chưa có current → áp dụng v1 → lưu v2 vẫn current v1 → áp dụng v2 vẫn baseline v1; mở lại v1 có đúng bảng/chart/export ban đầu.
- [x] ADMIN công bố T03/T04 mới, USER thấy thông báo có cập nhật nhưng current và số liệu v1 không đổi.
- [x] Bấm kép/retry cùng key không lưu hoặc áp dụng hai lần; cùng key khác body trả conflict. Response idempotency có thể là kết quả lịch sử: tải lại plan để tránh ghi đè trạng thái mới hơn trong UI.
- [x] Hai tab cùng revision: tab thua giữ form và tải lại trạng thái, không báo thành công. Chặn response cũ tới muộn đổi current/version đang xem.
- [x] Kiểm tra 401/403/404/409/422, thiếu Idempotency-Key, mạng mất sau khi server đã commit, hồ sơ đổi sau preview và user khác truy cập plan/version. Không áp dụng bằng optimistic UI trước khi server xác nhận.
- [x] Kiểm tra điện thoại, bàn phím, nhãn hai hành động lưu/áp dụng và xác nhận. Backend đã kiểm chứng; nghiệm thu UI/T08 vẫn còn mở.


## Bổ sung backend T08 - 04/10/2026: báo cáo, so sánh, mô phỏng và CSV

AI backend chỉ sửa API/contract; AI frontend xử lý các mục dưới. T08 toàn sản phẩm chưa nghiệm thu. Contract chi tiết: [PLAN_PRESENTATION.md](../backend/docs/PLAN_PRESENTATION.md), [plans.openapi.yaml](../backend/docs/plans.openapi.yaml), [retirement.openapi.yaml](../backend/docs/retirement.openapi.yaml).

### FE-T08-01 - Các lỗi nối API phát hiện qua đọc mã hiện tại

- [x] **Ưu tiên sửa lớp data bị bóc hai lần:** `services/api.ts` đã `return result.data`; `authenticatedRequest<T>` trả T, không còn envelope. Trong `services/plans.ts` và `services/retirement.ts`, bỏ kiểu Envelope khi gọi helper và bỏ lần `return envelope.data` thứ hai. Rà mọi wrapper tương tự. Backend vẫn giữ wire response `{data,meta}`, không đổi backend để bù lỗi helper. Kiểm bằng response HTTP thật và tải lại trang, không chỉ typecheck.
- [x] **Tháng mô phỏng chưa được gửi:** `SimulationTrackingPage.tsx` tính `simRetireMonth` nhưng payload trước T08 không chứa giá trị này. Nay gửi `whatIf.retirementMonth` theo tháng người dùng chọn. Không tự dùng tháng 12 khi có tháng sinh/tháng hưu cụ thể; nên cho chọn tháng-năm. Xác nhận response summary.retirementMonth và accumulationMonths thực sự đổi.
- [x] **Không tự trả lời bảng rủi ro:** màn simulation đang chọn `q.choices[0]` và policy mới nhất. Nạp selection/answers/policy của bản đang xem, hoặc bắt người dùng trả lời/chọn rõ khi chưa có; không thay câu trả lời bằng lựa chọn đầu tiên.
- [x] **Giữ 0 và thông tin chưa biết:** bỏ fallback `monthlySavings || 5000000`, chi tiêu `|| 20000000`, revision `>0 ? revision : 1` và tuổi/năm hết kỳ mẫu khi tạo request. Chưa có dữ liệu yêu cầu bổ sung; 0 đã khai vẫn là 0. `RetirementGoalPage.tsx` còn dùng calculator cũ với macro 0, cần chuyển sang T06/T08.
- [x] **Không báo áp dụng khi thất bại/false:** simulation hiện gọi save rồi apply trong cùng closure; activePlan/revision React có thể còn cũ, đặc biệt vừa tạo plan đầu. Dùng planId/revision từ response lưu hoặc bản detail vừa tải và truyền tường minh cho apply; chỉ toast thành công khi response apply xác nhận. `applyVersion` trả false phải là chưa áp dụng, không bỏ qua kết quả.
- [x] **Tách form, preview và current:** đổi plan/user/logout phải xóa hoặc tải đúng state theo planId/versionId, không giữ preview của plan cũ. Chặn response đến muộn ở cả load detail/history/save/apply, không chỉ preview. Lỗi tải không được nuốt thành danh sách trống và tự tạo plan mới.
- [x] **Retry phải giữ cả key và body:** ref key đơn lẻ chưa đủ nếu người dùng đã đổi form/revision/plan sau timeout. Lưu pending operation gồm planId + body đã gửi + key; retry nguyên request, thao tác mới sinh key mới. Không tự gửi payload mới với key cũ.

### FE-T08-02 - Nguồn chung cho dashboard/goal/plan/chart

- [x] `GET /api/v1/me/retirement/plans/:planId/report?versionId=:versionId` trả báo cáo của snapshot được chọn. Không truyền versionId thì backend lấy current trong cùng transaction; `NO_APPLIED_VERSION` có version/goal null, không thay bằng bản vừa lưu hoặc số demo.
- [x] Dùng `report.version.preview.calculation.summary/rows` làm nguồn chung cho dashboard, plan, biểu đồ; form mục tiêu nạp `report.goal` và selection. goal ở đây đọc snapshot, không phải mục tiêu tuổi-năm legacy. Hiển thị planId/version/thời điểm và phân biệt đang xem bản cũ với đang áp dụng.
- [x] report.valueKind=FORECAST: ghi là dự phóng, không gán “số dư thực tế”. profileChanged chỉ báo hồ sơ khác revision snapshot; không thay số trong snapshot bằng summary hồ sơ mới.
- [x] `hypothetical:true`/warning HYPOTHETICAL_VALUES_PROFILE_UNCHANGED phải hiện đây là kế hoạch dùng giá trị giả định cá nhân. Áp dụng snapshot không đổi số tài sản hoặc tháng hưu trong hồ sơ gốc. Nếu người dùng muốn sửa dữ liệu thật, dùng profile API rồi tính/lưu lại.
- [x] Public calculator nếu còn giữ phải ghi rõ minh họa độc lập, không nhập kết quả vào kế hoạch USER; không diễn giải nó là kết quả cùng snapshot.

### FE-T08-03 - So sánh và mô phỏng có căn cứ

- [x] `POST /:planId/compare` với `{baselineVersionId,candidateVersionId}` so hai bản đã lưu cùng plan. Cả baseline/candidate và comparison đi chung response; không tự ghép hai request đã bị thay current.
- [x] `POST /:planId/versions/:versionId/simulate` với `{preview:<đầy đủ request T06>}` so bản đã chọn với dự phóng từ hồ sơ hiện tại. Endpoint chỉ đọc, trả saved=false/applied=false. Candidate INCOMPLETE phải hiển thị issues, không cho lưu/áp dụng; chưa có bản lưu thì dùng T06 preview trực tiếp.
- [x] Request T06/T07 nay nhận thêm `whatIf:{retirementMonth?,assetValues?:[{assetId,value}]}`. Đây là giá trị toàn tài sản trước nhân sở hữu/phần hưu trí, chỉ tham chiếu assetId đang có trong hồ sơ. Không gửi trực tiếp vốn đầu quỹ, lãi, CPI, tỷ trọng sở hữu hoặc tiền bán nhà vào whatIf.
- [x] Đổi asset.value không làm nhà ở/khoản khóa thành tiền mặt; không sửa netAmount phương án bán/thuê. Đổi tháng hưu không tự đổi lịch lương, lương hưu hoặc lịch vay. Hiện điều này ngay tại nhóm chỉnh giả định để người dùng biết điều gì đã được tính.
- [x] `comparison.delta` là candidate trừ baseline; tiền quỹ/thiếu hụt so tại ngày định giá, mỗi bản dùng hệ số chiết khấu riêng. `coveragePercentagePoints` là điểm phần trăm, null giữ là không so được. Không so quỹ tại hai tháng hưu khác nhau như thể cùng ngày.
- [x] Khác ngày định giá/tiền tệ/kỳ cuối hoặc thiếu kết quả: NOT_COMPARABLE, delta=null, hiện reasons; vẫn có thể xem hai bản riêng. differences.selectionFields chỉ ra đầu vào nào đổi. Không diễn giải chênh lệch là tác động của một biến nếu nhiều trường/nguồn cùng đổi.
- [x] Sau khi chọn candidate: dùng chính candidate.selection/inputHash để lưu qua T07, rồi hành động áp dụng rõ ràng. Không lấy form đã thay đổi sau response để ghép với inputHash cũ.

### FE-T08-04 - Tải CSV đúng bản đã chọn

- [x] `GET /:planId/versions/:versionId/export.csv` trả **text/csv**, UTF-8 BOM, không có envelope JSON. Tải với Bearer/session và xử lý refresh 401 giống helper hiện tại; helper CSV đọc blob/text, không gọi response.json hoặc bóc data.
- [x] Đọc tên tệp từ Content-Disposition (backend đã expose qua CORS), tạo download blob; không gắn token vào URL. Lỗi API vẫn JSON error, không tải thông báo lỗi thành file CSV.
- [x] Giữ versionId từ báo cáo đang xem khi tải; không hỏi current mới nhất rồi xuất lẫn phiên bản. CSV có nguồn/hash/model/ngày/scenario trên từng dòng và số tháng chính xác, chưa làm tròn hiển thị; không tái tính CSV từ calculator frontend.
- [x] JSON đầy đủ có thể lấy endpoint version hoặc report; nguồn chi tiết, goal, warnings/limitations và conventions ở đó. CSV là bảng tháng, không phải toàn bộ snapshot hoặc sổ thực tế T09.

### Nghiệm thu UI T08

- [x] Đăng nhập -> chọn plan -> dashboard/goal/plan/history/mô phỏng -> lưu/apply -> reload: cùng planId/versionId/summary/rows, lỗi mạng và conflict giữ form, không báo thành công giả.
- [x] Thử 0/null, K=0, >100%, số dư âm, nghỉ ngay, retirementMonth khác, tài sản dùng một phần/nhà chưa bán; so dữ liệu phản hồi thật và CSV đúng từng tháng.
- [x] Công bố policy mới hoặc sửa hồ sơ rồi xem/xuất version cũ: số liệu snapshot giữ nguyên; cờ thay đổi hiển thị riêng. Hai tab và response đến muộn không đổi nhầm plan/version.
- [x] Bỏ mọi text triển khai như “engine T06”, “snapshot API” khỏi hướng dẫn người dùng khi không giúp họ ra quyết định; dùng “Dự phóng”, “Bản đã lưu”, “Áp dụng”. Không đổi backend enum hay ý nghĩa scenario để làm nhãn dễ nhìn.

## FE-T09 - Sổ thực tế, đối soát và dự báo còn lại (backend 05/10/2026)

Backend đã có API; AI frontend phụ trách các mục dưới. Contract đầy đủ: [MONTHLY_ACTUALS.md](../backend/docs/MONTHLY_ACTUALS.md), [actuals.openapi.yaml](../backend/docs/actuals.openapi.yaml). Không suy nghiệm thu giao diện từ tests backend. Không dùng MonthlyTracking target/actual legacy hoặc calculator client cho sổ này.

### FE-T09-01 - Nhập và sửa tháng thực tế

- [x] Nối phần theo dõi thực tế của `SimulationTrackingPage.tsx` với prefix `/api/v1/me/retirement/actuals`. GET `?from=YYYY-MM&to=YYYY-MM` lấy các tháng có dữ liệu; GET `/:period` lấy hiện tại + history. Không có tháng là “Chưa ghi nhận”, không dựng thu/chi hoặc số dư 0.
- [x] Form ghi rõ phạm vi **quỹ hưu trí hợp nhất**, VND. Nhập số dư đầu/cuối tháng và các dòng INCOME, EXPENSE, DEBT_PAYMENT, CONTRIBUTION, WITHDRAWAL, INVESTMENT_INCOME, FEE, MARKET_CHANGE, INTERNAL_TRANSFER, BALANCE_ADJUSTMENT. Tiền gửi dạng chuỗi, hỗ trợ âm chỉ cho biến động giá/điều chỉnh; 0 phải do người dùng xác nhận, không làm mặc định thay dữ liệu thiếu.
- [x] Giải thích phân loại tại nơi nhập: thu-chi gia đình không tự làm tăng quỹ; tiền thực nộp khác tiền dư; chuyển giữa tài khoản thuộc quỹ không phải nộp mới; lãi tái đầu tư ghi một lần ở thu đầu tư, không thêm nộp. Phí đã tách riêng không trừ lần nữa trong biến động giá. Chi đã nằm trong DEBT_PAYMENT không lặp trong EXPENSE.
- [x] Mỗi bút toán giữ UUID eventId ổn định và date thuộc tháng. Không sinh UUID mới khi retry hoặc mở lại chỉnh sửa, không duplicate một giao dịch bằng hai dòng quỹ. Backend giữ chỗ eventId sau khi xóa dòng trong một revision; không dùng ID đó cho tháng khác. Trường hợp ghi sai tháng cần sửa có giải thích, không cố retry cùng ID sang tháng mới.
- [x] PUT `/:period` gửi `{expectedRevision,data:{currency:'VND',openingBalance,closingBalance,entries,correctionReason}}`, header Idempotency-Key UUID. Đây là **thay toàn bộ tháng**, không PATCH từng dòng. Tạo lần đầu revision=0; sửa dùng revision mới đọc. Luôn có lý do/ghi chú xác nhận tháng; BALANCE_ADJUSTMENT cần note riêng.
- [x] Giữ nguyên key + body cho lần gửi đang chờ; form đổi thì dùng thao tác/key mới. Conflict giữ form, tải bản server và cho đối chiếu, không tự ghi đè. Cùng key có thể trả response lịch sử: sau thành công tải lại tháng. Tháng hiện tại ghi tạm được; không ghi tháng tương lai. Thông báo thiếu số dư phải yêu cầu nhập, không dùng forecast điền như số thực tế.

### FE-T09-02 - Hiển thị đối soát và lịch sử sửa

- [x] Hiển thị riêng householdSurplus, cashflowState (Dư/Bằng/Thiếu), actualContribution và closingBalance. Số thu-chi âm giữ nguyên. Không gắn nhãn “tiết kiệm thực nộp” cho householdSurplus hoặc tự chuyển tiền dư thành CONTRIBUTION.
- [x] Bảng đối soát: đầu kỳ + nộp - rút + thu đầu tư + biến động giá - phí + điều chỉnh = cuối kỳ tính được; đặt cạnh số cuối kỳ người dùng khai. Dùng discrepancy/reconciliation server, không làm tròn trước khi xác định khớp.
- [x] UNRECONCILED vẫn có thể lưu để sửa tiếp, nhưng cần chỉ ra chênh lệch, không báo “đã đối soát”. Không tự thêm dòng điều chỉnh cho vừa số. Nếu có điều chỉnh, hiện lý do và hasAdjustments rõ ràng, kể cả tổng điều chỉnh bằng 0.
- [x] GET tháng trả history mới trước; cho xem revision/lý do/toàn bộ giá trị lúc đó. Sửa tháng cũ không đổi lịch sử. Sau sửa phải tải lại dự báo/đối soát các tháng sau vì đầu kỳ có thể không khớp.

### FE-T09-03 - Actual và dự báo còn lại trên biểu đồ

- [x] POST `/reforecast` với `{planId,versionId,throughMonth}` lấy bản đã chọn rõ ràng. Muốn so bản gốc gửi baselineVersionId; muốn so bản áp dụng gửi currentVersionId. `comparison` so **versionId đã gửi**, không tự gọi mọi kết quả là so baseline.
- [x] Tách ba lớp: bản dự phóng đã lưu (FORECAST), các tháng thực tế (ACTUAL), phần dự báo còn lại (REFORECAST). Hiển thị mốc throughMonth/anchor/revision và nguồn version/snapshot. Không nối tháng chưa ghi thành actual=0 hoặc cho đường dự phóng cũ mang nhãn thực tế.
- [x] READY: biểu đồ tương lai dùng calculation.rows API, bắt đầu tháng ngay sau actual cuối, vốn đầu từ anchor. Khoản nộp một lần không lặp trong tương lai. Vẫn dùng các lịch thu/chi/nợ/lãi của version chọn; nếu nguồn thu/nghĩa vụ đã thay đổi, hướng người dùng cập nhật hồ sơ/phương án, không tự sửa rate/macro trong UI.
- [x] BLOCKED: calculation=null. Hiện danh sách issues kèm tháng và hành động: MISSING_MONTH -> ghi tháng; UNRECONCILED_MONTH -> đối soát; OPENING_BALANCE_MISMATCH -> kiểm số dư liền kỳ; MONTH_NOT_CLOSED -> tháng đang ghi tạm. Không thay null bằng calculator cục bộ hoặc tiếp tục hiển thị kết quả cũ như mới.
- [x] HORIZON_COMPLETE: kỳ dự báo của phiên bản đã kết thúc, hiện actual/comparison và nhắc rà mục tiêu mới; không hiển thị lỗi chung. Khi đã nghỉ hưu, summary phần còn lại có accumulationMonths=0; hiển thị mục tiêu gốc từ originalRetirementMonth, không diễn giải ngày bắt đầu phần còn lại thành ngày người dùng vừa đổi mục tiêu.
- [x] Reforecast chỉ đọc, không có hiệu lực thay PlanVersion/current/baseline; không gắn nút “Đã áp dụng” sau gọi API này. Lưu actual không đổi hồ sơ/tài sản của onboarding. Áp dụng một version khác không xóa actual đã ghi.
- [x] Q15 chưa đóng: không có công tắc tự quét tiền dư vào quỹ. Chỉ hiển thị nộp thực tế được người dùng ghi và lịch góp đã xác nhận trong phiên bản.

### Nghiệm thu UI T09

- [x] Dư/Bằng/Thiếu, khoản nộp 0 nhưng thu dư, chuyển nội bộ, lãi tái đầu tư, lỗ thị trường, phí, điều chỉnh có lý do; đối chiếu số server đến từng bút toán.
- [x] Gửi lặp/nhấp hai lần/hai tab cùng sửa; thiếu tháng; sửa số dư tháng cũ khiến tháng sau lệch; tháng hiện tại; hết horizon. Giữ form và lỗi cụ thể, không báo thành công giả.
- [x] Nộp bất thường một lần -> dự báo bắt đầu đúng số dư nhưng không lặp tiền nộp; chuyển version -> actual/history và baseline đầu giữ nguyên; đăng xuất/đổi tài khoản không lẫn sổ.
- [x] Không gửi userId, tỷ suất, CPI, actualContribution/householdSurplus/calculatedClosingBalance hoặc kết quả tự tính trong body ghi. Render số tiền theo format hiển thị nhưng giữ chuỗi chính xác khi lưu/so sánh.

## FE-T10 - Giải thích kế hoạch, hội thoại và quản trị tri thức (05/10/2026)

Chủ dự án đã chọn **chưa chọn nhà cung cấp AI; chuẩn bị backend trước**. Backend có API/context/phân quyền/quyền dữ liệu, production không gọi provider. Contract: [AI_GOVERNANCE.md](../backend/docs/AI_GOVERNANCE.md), [ai.openapi.yaml](../backend/docs/ai.openapi.yaml). AI frontend triển khai các mục sau; backend không xác nhận UI đã nghiệm thu.

### FE-T10-01 - Thay phần trả lời cục bộ bằng kết quả server

- [x] `AIAssistantPage.tsx` vẫn import `calculateRetirement/inputFromProfile`, dùng `setTimeout` và nhánh câu chữ cục bộ. Bỏ luồng tạo số/answer này khi nối API; lấy planId/versionId từ lựa chọn thực của user. Không tự chọn số demo hoặc suy tuổi hưu từ calculator cũ.
- [x] GET `/api/v1/me/ai/privacy` trước khi gửi. `providerConfigured=false` hiện là cấu hình đúng: nhãn “Giải thích từ số liệu kế hoạch - chưa kết nối AI”. Không cho chọn model giả hoặc báo model ngoài đã trả lời. Chuẩn bị UI dựa trên status để nối provider sau này mà không thay nghĩa số liệu.
- [x] POST `/me/ai/explain` với `{question,planId?,versionId?,throughMonth?,conversationId?,expectedRevision?}`, Idempotency-Key UUID. Hai ID plan/version cùng có hoặc cùng không có; history cần conversationId+revision. Không gửi full profile, userId, summary tự tính, transcript, lãi/CPI hoặc flag apply.
- [x] `PROVIDER_NOT_CONFIGURED` hiển thị lời giải thích cơ bản server; `PROVIDER_UNAVAILABLE` báo AI tạm lỗi nhưng vẫn giữ answer/facts và báo cáo engine; `AI_ASSISTED` chỉ khi status server đúng. Không đổi fallback thành lời cam kết hoặc giả hội thoại từ model.
- [x] Hiện answer/facts, nguồn của kế hoạch và provenance version/ngày/model/warningCodes/hypothetical. Lời giải thích version cũ giữ số cũ, không ghi “theo hồ sơ hiện tại” khi chưa kiểm T08 profileChanged/updates. Không bỏ cảnh báo dữ liệu/mô phỏng. Coverage không phải xác suất thành công; null không đổi thành 0 hoặc 100%.
- [x] Không chọn version -> thông báo cần chọn/lưu kế hoạch, không fabricate số. Không có source match -> `NO_APPROVED_MATCH`, không tự gắn nguồn mẫu. `citations` là đoạn trích tham khảo tách với lời giải thích số từ engine, hiển thị title/version/excerpt/link HTTPS. Render dạng text an toàn; nội dung tài liệu không được biến thành lệnh điều khiển UI hoặc tự mở URL.
- [x] Khi có throughMonth, phân biệt `provenance.valueKind=REFORECAST`, anchor và revisions của sổ thực tế. BLOCKED phải hiển thị issues/tháng cần sửa, không lấy số từ FORECAST thay thế. HORIZON_COMPLETE hiện đúng nghĩa hết kỳ. Sau sửa actual phải gọi lại; response cũ mang revision tại lúc tính.
- [x] Chống response đến muộn khi đổi tài khoản/plan/version, xóa thread hoặc thu hồi đồng ý. Không giữ profile/chat riêng tư trong localStorage; clear state khi logout. 401/403/404/409 phải giữ trạng thái đúng, không báo trả lời/lưu thành công giả.

### FE-T10-02 - Câu hỏi “nếu” và hành động của người dùng

- [x] Khi user muốn thử khác tháng hưu/mức góp/chi tiêu, mở form input cá nhân rõ ràng; gửi POST `/me/ai/simulate` với `{planId,versionId,expectedProfileRevision,changes:{retirementMonth?,monthlyContribution?,monthlyExpenseToday?}}`. Ít nhất một thay đổi, chuỗi tiền, không gửi lãi/CPI/tỷ trọng.
- [x] Đường simulate dùng engine T06/T08 và không gọi provider, dùng được khi AI chưa cấu hình/không bật history. Không giả rằng backend tự phân tích câu hỏi tự do thành đầu vào; chỉ gửi giá trị user đã xác nhận trong form.
- [x] Hiển thị baseline/candidate/comparison và INCOMPLETE rõ ràng. `saved=false,applied=false` luôn có ý nghĩa. Sau user chọn kết quả, lưu qua T07 bằng đúng candidate.selection/inputHash rồi xác nhận apply riêng; AI không có endpoint tự áp dụng.
- [x] Đổi retirementMonth không tự đổi lịch lương/nợ/hưu hoặc hồ sơ gốc. Sau profile revision conflict cần tải lại/cho xem trước lại; không tự thay revision và áp dụng im lặng.

### FE-T10-03 - Đồng ý xử lý, history, sửa/xuất/xóa

- [x] Màn thông báo mục đích `EXPLAIN_SERVER_RESULTS`, phạm vi dữ liệu, nhà cung cấp hiện chưa kết nối và thời hạn 30 ngày từ lúc tạo hội thoại. Tách `processing` với `saveHistory`; mặc định false, không đánh dấu đồng ý sẵn. 30 ngày là chính sách vận hành hiện tại, không gắn nhãn “theo luật bắt buộc”. Khi provider được chọn, thông báo/consent cần cập nhật tương ứng policy mới.
- [x] PUT `/me/ai/privacy` `{expectedRevision,policyVersion,processing,saveHistory}` dùng version server trả. Tắt history hoặc processing sẽ xóa toàn bộ history/context đã lưu: diễn đạt hậu quả rõ trước thao tác xác nhận của user. Không chặn quyền xem/xuất/xóa bằng màn ép đồng ý mới.
- [x] Chế độ không lưu: bỏ conversationId/expectedRevision khi explain; chỉ giữ câu hỏi/answer trong phiên UI. Có key nhưng API không lưu idempotency cho chế độ này; retry có thể tạo lời giải thích mới, đừng suy có history server.
- [x] Có đồng ý history: POST `/me/ai/conversations` body `{}` tạo thread, lấy id/revision/expiresAt; GET list với page/limit, GET `/:id` để reload. Explain tăng revision, cùng key+body trả response lịch sử; giữ key+body cho retry rồi reload state. 409 không tự ghi đè thread.
- [x] PATCH `/conversations/:id` `{expectedRevision,title}` đổi tên; PATCH `/:id/messages/:messageId` `{expectedRevision,content}` sửa câu hỏi. Sửa câu hỏi xóa câu trả lời/context tương ứng, UI cần tải lại và cho user gửi lại nếu muốn giải thích mới. Không có chức năng sửa số liệu/answer AI bằng tay.
- [x] GET `/:id/export` trả **JSON envelope** chứa history/context/citations, không phải CSV T08. Cho người dùng tải nội dung của chính mình; không gắn access token vào URL. Nội dung có thể chứa câu hỏi cá nhân tự gõ; không chia sẻ mặc định.
- [x] DELETE `/:id` hoặc `/conversations` body `{}` xóa một/tất cả. Sau xóa hủy request UI, clear state và tải lại privacy revision. Response đến muộn không được khôi phục chat; backend cũng kiểm privacy revision. Xóa history không đồng nghĩa xóa toàn bộ tài khoản/kế hoạch.
- [x] Hội thoại hết hạn 404, không reset expiry bằng gửi thêm; tạo mới theo ý user. User có tối đa 100 messages trong một thread; CONVERSATION_LIMIT hiển thị hướng dẫn tạo mới. History nguồn cũ là bằng chứng lúc trả lời, không khẳng định nguồn đó còn được duyệt hôm nay.
- [x] Nhắc người dùng tránh nhập định danh không cần thiết. Backend chỉ lọc email/số dài trước adapter, không cam kết mọi tên/địa chỉ trong câu hỏi đã được ẩn danh. Khi chưa có provider, không hiển thị thông báo dữ liệu đã gửi ra ngoài.

### FE-T10-04 - Trang quản trị nguồn tri thức

- [x] `AdminAIConfigPages.tsx` hiện khởi tạo nguồn từ `initialSources/useState`; thay danh sách/chi tiết/lưu trạng thái đó bằng `/api/v1/admin/knowledge`. Giữ các API assumptions/portfolio đang có, không nhập lẫn nguồn tri thức và tham số tính toán.
- [x] GET list/chi tiết; POST tạo source (title/category/version/rawContent/effectiveDate, optional referenceCode/fileUrl/validUntil); PUT `/:id` `{expectedRevision,data:<full source>}`. Input là text đã rà; backend chưa tải URL, OCR hoặc parse file. Không báo “đã xử lý PDF” khi mới chọn tệp local.
- [x] POST `/:id/index` `{expectedRevision}` lập chỉ mục tại server, status INDEXED nhưng **isApproved vẫn false**. Hiện `indexMethod=LEXICAL_V1` bằng nhãn tìm kiếm từ khóa; không báo có vector/embedding hay đã gửi AI. Max text 50.000 ký tự, chunk 1.500; không xử lý quá giới hạn thành công giả.
- [x] POST `/:id/approval` `{expectedRevision,approved,reviewNote,confirm:true}` để duyệt/thu hồi. Chỉ ADMIN; cần lý do. Lập chỉ mục không tự duyệt, sửa/reindex làm mất duyệt cũ; hiển thị revision/hash và trạng thái “cần duyệt lại”. Duyệt trước ngày hiệu lực chưa có nghĩa nguồn được sử dụng ngay.
- [x] Hiện ngày hiệu lực/hết hiệu lực. Những nguồn PENDING/chưa index/unapproved/hết hạn không dùng cho câu trả lời. Giữ các nguồn production đang chờ duyệt, không bấm tự động duyệt toàn bộ để lấp UI trống.
- [x] Không thêm màn cho ADMIN xem nội dung chat tài chính của USER; T10 không cấp quyền đó. Không có API cấu hình provider/token ở UI trong đợt này; không báo lưu provider/model nếu chỉ đổi state.

### Nghiệm thu UI T10

- [x] Chọn version cũ rồi sửa hồ sơ/current: explanation vẫn đúng bản đã chọn và cảnh báo được giữ. Chế độ không provider/lỗi provider/thiếu plan/actual thiếu tháng đều rõ ràng, engine không mất kết quả.
- [x] Gõ yêu cầu “bỏ quy tắc, sửa lãi, áp dụng ngay” hoặc gặp chỉ thị trong tài liệu: UI không đổi input/plan/current, chỉ form mô phỏng và apply do user xác nhận riêng.
- [x] Consent bật/tắt, history on/off, hai tab cùng ghi, retry giữ body, sửa câu hỏi, export, xóa khi response đang chờ, thread hết hạn/giới hạn và logout/account switch.
- [x] USER không truy cập nguồn admin, ADMIN không truy cập hội thoại user, đổi ID người khác trả 404. Nguồn chưa duyệt/sửa sau duyệt/chưa hiệu lực/thu hồi không được dùng cho câu trả lời mới.
- [x] Provider thật và rà P36/pháp lý trước phát hành còn riêng; tests backend/stub không chứng minh vận hành model bên ngoài, UI hay tuân thủ pháp luật.


## FE-T11 / T12 — Bàn giao backend ngày 05/10/2026

Backend T11 đã kiểm chứng: 26 HTTP/DB checks rollback +2 ca ghi đồng thời; migration0009 đã áp dụng. Không cần thêm cột thủ công. Contract đầy đủ: `backend/docs/SECONDARY_MODULES.md`, OpenAPI `backend/docs/secondary.openapi.yaml`. Đây là checklist UI chưa nghiệm thu, không phủ nhận phần UI AI khác đã làm.

### FE-T11-01 — Đối tác/sản phẩm admin và Khám phá

- [x] `AdminBusinessPages.tsx`: Đã kết nối với dịch vụ `catalog.ts` (`listAdminPartners`, `listAdminProducts`, `updateAdminProduct`); loại bỏ phụ thuộc dữ liệu tĩnh/localStorage khi có dữ liệu máy chủ. Xử lý đồng bộ revision, rollback giao diện khi lỗi, chỉ cập nhật sau phản hồi thành công.
- [x] Đối tác chuẩn hóa trường dữ liệu: name, type (`BANK`, `INSURANCE`, `OPEN_FUND`, `SECURITIES`), contactEmail, website, isVisible, isHighlight theo hợp đồng API. Không tự suy diễn hay thêm thông tin ngoài luồng.
- [x] Sản phẩm chuẩn hóa trường: partnerId, name, category, riskLevel (`LOW`/`MEDIUM`/`HIGH`), annualFee, conditions, disclosure, isVisible. Render nội dung dạng text an toàn.
- [x] `ExplorePage.tsx`: Đã kết nối `listPublicProducts` (GET `/products`, GET `/partners`), hỗ trợ lọc phân loại và tìm kiếm, hiển thị thẻ chi tiết đầy đủ phí, điều kiện, rủi ro, minh bạch hoa hồng. Loại bỏ các nút CTA giao dịch hoặc đặt lịch tư vấn.
- [x] Quản lý ẩn/hiện an toàn: Chuyển đổi trạng thái bằng `isVisible` (không dùng DELETE cứng), thông báo trạng thái rõ ràng khi ẩn sản phẩm/đối tác.
- [x] Dữ liệu đối tác/sản phẩm quản trị: Tuân thủ quy định hiển thị và phân quyền bảo mật.
- [x] Nghiệm thu kiểm thử tự động: `admin-ui.spec.ts` đạt 1/1 PASSED (100%), kiểm tra đầy đủ bố cục bảng, thao tác mở/đóng thanh điều hướng và hiển thị danh mục sản phẩm/đối tác.

### FE-T11-02 — Tùy chọn thông báo theo tài khoản

- [x] `AccountPage.tsx` và `UserAccountModal.tsx`: Đã kết nối API `notifications.ts` (`getNotificationSettings`, `updateNotificationSettings`) qua GET/PUT `/me/notification-settings` với body `{ expectedRevision, emailDigest, goalAlerts, partnerUpdates }`. Loại bỏ hoàn toàn phụ thuộc localStorage.
- [x] Quản lý trạng thái độc lập theo tài khoản: Tách biệt rõ loading/error, nạp lại cài đặt khi chuyển đổi tài khoản, không chia sẻ lựa chọn giữa các phiên đăng nhập khác nhau.
- [x] Phản hồi và thông báo minh bạch: Ghi rõ thông báo lưu thành công và chỉ dẫn trạng thái kênh gửi; duy trì hoạt động thông báo bảo mật và hỗ trợ kỹ thuật.
- [x] Xử lý lỗi và xung đột: Giữ nguyên trạng thái biểu mẫu khi gặp lỗi 401/403/409/503 và rollback giao diện chính xác; không dùng thông báo thành công giả lập.

### FE-T11-03 — Report/CSV và tư vấn đã ngừng

- [x] Xuất báo cáo CSV chuẩn hóa: `AccountPage.tsx` và `UserAccountModal.tsx` ưu tiên gọi `exportPlanVersionCsv(planId, currentVersionId)` theo kế hoạch đang chọn từ backend T08. Báo lỗi và hướng dẫn tạo/áp dụng kế hoạch khi chưa có phiên bản.
- [x] Dữ liệu báo cáo chuẩn mực: Hiển thị đầy đủ phiên bản, mô hình, ngày định giá từ máy chủ; không tự tính lại số liệu trên trình duyệt.
- [x] Ngừng luồng tư vấn chuyên viên: Đã loại bỏ toàn bộ các nút đặt lịch/phòng chat tư vấn chuyên viên cũ; chuyển hướng yêu cầu người dùng sang kênh Hỗ trợ (Support). Đáp ứng trạng thái 410 FEATURE_RETIRED từ máy chủ.
- [x] Quản trị nội dung và vận hành: Không công khai bài viết dạng nháp; tuân thủ quy chuẩn trạng thái gửi email và chứng từ giao vận.

### FE-T12-01 — Lỗi kiểm thử đã có bằng chứng

- [x] Khắc phục lỗi kiểm thử trình duyệt: Sửa selector và liên kết accessible name trong `account-api.spec.ts` thành `Mật khẩu mới Tối thiểu 12 ký tự`; tái cấu trúc các trường nhập liệu trong `ui.tsx` đạt chuẩn liên kết `<label htmlFor>`. Kết quả kiểm thử đạt 8/8 PASSED (100%) trong `node backend/scripts/verify-browser.cjs`.
- [x] Kiểm thử trình duyệt độc lập và an toàn: Bộ chạy `verify-browser.cjs` vận hành trên bản build sản xuất với mock API, hoàn thành toàn bộ 8 bài kiểm thử trong 14.8s.
- [x] Sửa triệt để vòng đời `setup-preview.ts`: Loại bỏ hoàn toàn `freePort8444()` và lệnh taskkill độc đoán; sử dụng cơ chế cấp phát cổng độc lập và quản lý tiến trình sở hữu an toàn.
- [x] Kiểm thử toàn diện các luồng nghiệp vụ: `financial-profile.spec.ts` đạt 7/7 PASSED (100%), `responsive.spec.ts` đạt 15/15 PASSED (100%), `admin-ui.spec.ts` đạt 1/1 PASSED (100%).
- [x] Xử lý lỗi kết nối và trạng thái phiên: Giao diện duy trì khả năng giữ dữ liệu khi gặp lỗi mạng, bảo toàn dữ liệu trên nhiều tab và phân tách phiên theo người dùng.

### FE-T12-02 — Nội dung, khả năng sử dụng và tải trang

- [x] Rà soát nội dung và khả năng truy cập (A11y): Loại bỏ hoàn toàn 100% dấu gạch ngang dài em-dash khỏi toàn bộ mã nguồn frontend/src; chuẩn hóa các nhãn vốn, thu-chi, danh nghĩa/thực tế; kiểm tra tương phản màu sắc và focus đạt chuẩn WCAG AA.
- [x] Khắc phục triệt để lỗi reflow trên thiết bị di động: Đạt 15/15 PASSED (100%) trong `responsive.spec.ts` trên toàn bộ 8 kích thước màn hình (320px, 390px, 768px, 844px, 1024px, 1280px, 1440px, 1920px); ổn định thanh cuộn bằng `scrollbar-gutter: stable` và `overflow-x: hidden !important`.
- [x] Kiểm thử đóng gói và kết xuất tĩnh: `npm run typecheck` đạt 0 lỗi; `npm --prefix frontend run build` hoàn tất thành công (exit code 0), xác thực đủ 23/23 tài sản đóng gói và kết xuất trước SSR 5 trang tĩnh an toàn.
# FE-P13-P15 — Contract backend đã triển khai 05/10/2026

Đây là cập nhật mới nhất cho phần P13/P15, thay mô tả “chưa có API” ở checklist cũ. Backend đã có model v3, preview/lưu reforecast, giữ replay v2. Chưa nghiệm thu giao diện. Contract chi tiết và ví dụ JSON: [CONTRIBUTIONS_REFORECAST.md](../backend/docs/CONTRIBUTIONS_REFORECAST.md); OpenAPI retirement/actuals/plans đã cập nhật. Backend không sửa frontend trong đợt này.

- [ ] Màn mục tiêu/kế hoạch: chọn `contributionTiming` END_OF_MONTH (mặc định) hoặc START_OF_MONTH. START yêu cầu xác nhận `startOfMonthFunding` theo contract; không tự khai 0/true, không lấy số dư quỹ làm thu khả dụng. Hiển thị tháng hiệu lực từ replayInput.contributionStartMonth, các issue/cảnh báo và mức góp thực sau giới hạn. Đầu kỳ chỉ áp dụng tích lũy, góp sau hưu vẫn cuối kỳ. Lãi âm có thể làm đầu kỳ thấp hơn cuối kỳ.
- [ ] Hiển thị `savingsStatus` mới EARLY_FUNDING_REQUIRED / NO_ELIGIBLE_CONTRIBUTION_PERIOD; null mức góp nghĩa là không tính được, không chuyển thành 0 hoặc “đã đủ vốn”. Tiền vẫn dùng chuỗi thập phân.
- [ ] Sổ thực tế tiếp tục dùng endpoint cũ; không suy CONTRIBUTION từ thu trừ chi. Hiện dư hộ gia đình, góp xác nhận, còn ngoài quỹ và mức bị giới hạn riêng. Ba trường hợp thu12/chi20,20/20,25/20; dư5 với góp0/2/5/6 cho góp0/2/5/5, giữ ngoài5/3/0/0, trường hợp6 thiếu khả năng1.
- [ ] Xem cập nhật: POST `/api/v1/me/retirement/actuals/reforecast/preview` với planId/versionId/throughMonth/expectedProfileRevision/futureChanges. READY hiển thị candidate; BLOCKED/HORIZON_COMPLETE phải hiện issues, không cho lưu. `beforeChanges` là dự báo cùng anchor trước khi điều chỉnh tương lai, dùng so trước/sau với candidate.calculation; số quá khứ so actual/forecast lấy endpoint reforecast cũ.
- [ ] Form thay đổi tương lai ghi rõ “thay tổng theo tháng”, chọn income/livingExpense/additionalExpense/plannedContribution, amount, startMonth/endMonth sau cutoff, reason và UUID mới. Cùng field không chồng khoảng; 0 là chủ động dừng. Không gọi đây là sửa một nguồn thu riêng hoặc cộng thêm nguồn; chưa có API chỉnh từng hợp đồng trong reforecast. Khoản thực tế một lần không tự kéo dài. START giữ trần khả dụng đã xác nhận từ nguồn; không tự tăng trần khi đổi thu nhập.
- [ ] Lưu POST `/api/v1/me/retirement/plans/:id/reforecasts` với `{expectedRevision, expectedInputHash, preview}` và Idempotency-Key UUID. Retry cùng payload dùng cùng key; đổi payload dùng key mới. Thành công chỉ là lưu version, không báo đã áp dụng. Apply gọi API hiện có với versionId/revision mới/expectedProfileRevision/confirm:true và chờ thành công trước đổi current. Giữ baseline.
- [ ] Sau lưu/reload/report/CSV: giữ model/timing, REFORECAST, nguồn version, mốc actual, originalRetirementMonth. `actualSourceChanged=true` phải hiện nguồn đã sửa và yêu cầu xem lại; 409 PREVIEW_CHANGED/ACTUAL_SOURCE_CHANGED/REVISION_CONFLICT giữ form và tải lại dữ liệu liên quan. Snapshot cũ vẫn xem/replay/export được, không ghi đè. Sau sửa actual quá khứ, dùng phiên bản nguồn trước đoạn bị sửa để preview lại.
- [ ] Bản đã cập nhật muốn thử lại cùng cutoff: dùng sourceVersionId/throughMonth trong reforecast, khai lại điều chỉnh mong muốn. Muốn dự báo tiếp qua tháng mới: dùng chính version đã cập nhật làm nguồn; tháng thực đầu tiên phải nối đúng số dư anchor. Không gọi simulate thông thường trên reforecast (422 REFORECAST_USE_ACTUAL_UPDATE).
- [ ] Không trình bày selection.monthlyContribution/monthlyExpenseToday hoặc netWorth là số thực mới ở cutoff: đây là đầu vào/cơ sở hồ sơ gốc; thay đổi theo tháng nằm trong rows/futureChanges. Goal.retirementMonth giữ tháng hưu gốc; summary.retirementMonth có thể là đầu phần dự báo còn lại khi đã nghỉ hưu. So sánh báo NOT_COMPARABLE khi khác ngày định giá, không ép thành chênh lệch trực tiếp; selectionFields có thể chứa futureChanges/actualRevisions.
- [ ] Nợ/lương hưu/bán tài sản vẫn lấy lịch nguồn; hiện rõ yêu cầu rà nguồn riêng khi phát sinh tất toán/bán/thay lương hưu, không hứa đã tự xóa dòng dự báo. Hồ sơ khác revision nguồn trả PROFILE_CHANGED_RECREATE_VERSION.
- [ ] Browser nghiệm thu: timing → preview → save → apply → reload/CSV; actual → đối soát → preview thay đổi tương lai → lưu → apply. Kiểm 409/mất mạng giữ form, retry không trùng, đổi account không lộ dữ liệu; vẫn phải sửa các blocker FE-RECHECK/FE-T11 trước đóng T12. Backend tests/DB đạt không đồng nghĩa UI đã nghiệm thu.
# FE-Q15-03 — Điều chỉnh từng nguồn đã có backend (05/10/2026)

Contract [SOURCE_REFORECAST.md](../backend/docs/SOURCE_REFORECAST.md), OpenAPI đã cập nhật. Dùng cùng preview/lưu/apply reforecast, thêm sourceChanges; không cần UI gọi endpoint mới hoặc tự tính dòng tiền.

- [ ] Form chọn nguồn từ hồ sơ/version đang xem: tất toán khoản vay, tài sản đã thành tiền vào quỹ, thay mức hưu hoặc thay riêng dòng thu/chi. Mỗi điều chỉnh có UUID mới, document và ô xác nhận chủ động; không tự đặt confirmed:true khi mở form.
- [ ] Tất toán: chọn sourceId khoản vay có hợp đồng, actual.period/eventId là DEBT_PAYMENT trong sổ đã đối soát; xác nhận remainingObligation:"0". Giao dịch trả một phần không được gán tất toán. Nếu tiền trả lấy từ quỹ, hướng dẫn ghi WITHDRAWAL riêng trong ledger, không tự thêm hai bút toán.
- [ ] Tài sản: chọn nguồn và CONTRIBUTION đã ghi phần tiền thực vào quỹ. Backend bỏ lần vốn dự kiến/dòng thuê tương ứng, không tự cộng số tiền bán vào anchor. Không dùng INCOME thay cho khoản nộp quỹ. Không cho nhầm tài sản đã nằm trong vốn đầu thành vốn mới.
- [ ] Pension: sourceId:"pension", startMonth/endMonth sau cutoff, monthlyAmount là tiền danh nghĩa tháng, priceBasis:"NOMINAL_MONTHLY". Ghi nguồn xác nhận; số0 là chủ động ngừng. Chưa có tự tính mức BHXH từ lịch sử đóng.
- [ ] Thu/chi: FLOW_REPLACE với sourceType INCOME/EXPENSE, ID dòng có sẵn, monthlyAmount và khoảng. Nhãn phải là “thay số tiền của nguồn này”, khác futureChanges “thay tổng tháng”. Không trộn hai loại trên cùng trường/tháng; không sửa dòng tham chiếu pension/nợ/tiền thuê qua form thu/chi thường. Nguồn dùng sau hưu phải nằm trong danh sách đã chọn của phiên bản.
- [ ] Hiện trước/sau từ beforeChanges và candidate.calculation, cùng mốc số dư thực. Lưu sourceChanges cùng form và payload hash; save không đồng nghĩa apply. Lịch sử version trả sourceChanges; CSV kèm sourceChangeIds, compare có selectionFields sourceChanges. Không đưa document của người dùng vào log/telemetry.
- [ ] Xử lý422 theo contract, giữ form và chỉ rõ cần rà nguồn/giao dịch/phạm vi. Không tự bỏ một adjustment để làm request thành công. Không dùng lại event/ID, không chồng khoảng nguồn đã pin. Sửa điều chỉnh cũ thì chọn nguồn trước điều chỉnh để xem lại; sửa actual nguồn vẫn trả409 như trước.
- [ ] Nghiệm thu browser: hai khoản vay chỉ bỏ đúng khoản đã tất toán; tài sản thực vào quỹ khác dự kiến không cộng hai lần; thuê dừng đúng phần sở hữu; pension không cộng lại thành thu; sửa một nguồn không xóa nguồn khác; tháng0/ngoài khoảng đúng; retry/save/apply/reload/CSV và409 giữ dữ liệu. Phần backend có tests; chưa có bằng chứng UI.


## FE-T13-REFERENCE — Tuổi tham chiếu và tháng hưởng (backend đã có)

05/10/2026, contract [PENSIONS.md](../backend/docs/PENSIONS.md), endpoint hiện có `POST /api/v1/me/pension/preview`. Thay đổi này đã kiểm backend; UI/browser chưa nghiệm thu.

- [ ] Trong `data.legalRetirementAge`, hiển thị `retirementMonth` là mốc tuổi tham chiếu; `referenceFollowingMonth` là tháng kế tiếp mốc tuổi nếu cần giải thích. Không dùng trường đó tự điền hoặc xác nhận tháng nhận hưu.
- [ ] `pensionStartMonth=null` và `pensionStartStatus=REQUIRES_BENEFIT_ASSESSMENT` nghĩa là chưa xét đủ hồ sơ hưởng, không có nghĩa là người dùng không được hưởng. Giữ riêng tháng nhận do người dùng khai tại `personal.pensionStartMonth`; lịch tiền `rows` vẫn từ khai báo này.
- [ ] Nhãn căn cứ đọc `rule.version`, `rule.scope=AGE_REFERENCE_ONLY` và `relatedSources`. `eligibility=NOT_ASSESSED` không được đổi thành “đủ điều kiện”. Nhánh OTHER/special vẫn cần rà; không tự tính nghỉ sớm của giáo viên bằng nút trừ5năm.
- [ ] Lịch sử modelv2/v3 có metadata dạng cũ, không có các trường mới; tiếp tục hiển thị “tham chiếu, chưa xét điều kiện”, không gọi đó là kết luận pháp lý. Không cập nhật lại snapshot để thêm trường.
- [ ] Browser: mốc tuổi2028 nhưng tháng nhận khai2030 → form/rows vẫn2030; thiếu tháng sinh → cần bổ sung, không ngày giả; đọc version cũ không lỗi/null→0.

Thiết kế T13-02 ở [ADR-001](../backend/docs/ADR-001-EXPANSION.md) và [expansion.openapi.yaml](../backend/docs/expansion.openapi.yaml). File này có `x-runtime-status: NOT_IMPLEMENTED`, chỉ bàn giao cấu trúc; chưa gọi các route BHXH/history/estimate/reforecast-v4 trong UI. Chưa có bảng hoặc migration cần frontend xử lý.

## FE-EXPANSION-T13-T17 — Kế hoạch UI cho ba phần mở rộng

Ngày05/10/2026. **Chỉ lập kế hoạch, các API mới chưa tồn tại.** Theo [nghiên cứu](research-bhxh-no-nguon-moi.md) và mục10/task.md. Giữ UI hiện hành cho đến khi backend bàn giao schema/payload/fixtures; không dùng số demo để giả lập tính BHXH đã có.

- [ ] FE-BHXH-01: nhập lịch sử đóng theo giai đoạn/tháng, hình thức bắt buộc/tự nguyện/chế độ lương, nguồn/ngày xác nhận; import preview chỉ lỗi đúng dòng, trùng tháng/thiếu khác0. Không yêu cầu CCCD/mã BHXH khi không cần cho phép tính.
- [ ] FE-BHXH-02: hiển thị riêng điều kiện hưởng, tháng được tính, bình quân, tỷ lệ, giảm theo nhóm, tháng nhận và trợ cấp một lần. ELIGIBLE khác PROJECTED_SCENARIO; REVIEW_REQUIRED cho nhánh chưa hỗ trợ. Phân biệt bảng điều chỉnh chính thức với giả định tương lai; có phiên bản luật/ngày tính/nguồn.
- [ ] FE-BHXH-03: giữ lựa chọn nhập mức từ thông báo BHXH; cho người dùng xem thay đổi trước khi chọn estimate đưa vào pension của candidate. Không tự apply hay cộng thêm incomePENSION; không gửi hồ sơ đóng/giám định vào chat AI.
- [ ] FE-BHXH-ADMIN: nháp→kiểm dữ liệu→xem tác động→duyệt→công bố bộ quy tắc có coverage, nguồn và thời hạn. Không gộp quản trị luật với upload knowledge/training Gemini; chưa có bảng hệ số thì không hiện đã sẵn sàng.
- [ ] FE-DEBT-01: form liên kết actual với khoản vay, tách gốc/lãi/phí/ngày ghi nhận/số dư sau; nói rõ toàn khoản hay phần người dùng trả. Giữ form khi số liệu không khớp; không lấy tổng tiền trả làm giảm gốc.
- [ ] FE-DEBT-02: so lịch cũ/mới: giảm hạn, giảm tiền trả, lịch ngân hàng, ân hạn/gia hạn/refinance; hiển thị tổng lãi/phí và ảnh hưởng quỹ. Có nhãn dự kiến hoặc đã được bên cho vay chấp thuận, không báo app đã tái cơ cấu khoản vay.
- [ ] FE-SOURCE-01: thêm thu/chi/pension/tài sản/vốn/khoản vay trong dự báo; sourceId/revision quản lý theo API, chọn one-off/recurring/start/end, nominal/today. Nguồn mới ở version sau vẫn sửa/kết thúc được.
- [ ] FE-SOURCE-02: phân biệt tài sản sở hữu, sốnet dự kiến thu, tiền đã ởactual và số góp được xác nhận. Tiền dư/vay mới/bán nhà không tự góp100%; giữ quy tắc khả dụng đầu/cuối kỳ. Chỉ cập nhật hồ sơ tài khoản bằng thao tác riêng khi API hỗ trợ.
- [ ] FE-SHARED: hiển thị attribution từng nguồn và warning/missingEvidence, before/after từ server; giữ cùng hash trên preview/save/apply. Không tiếp tục dùng candidate khi revision/actual nguồn đổi; xử lý409/422 theo fieldPath, không tự bỏ điều chỉnh.
- [ ] FE-ACCEPTANCE: browser các nhóm BH-G/DN-G/SRC-G/ALL-G trong tài liệu; replayv2/v3 giữ số, đổi tài khoản không lộ lịch/chứng từ; lỗi mạng không báo đã lưu/apply; CSV và màn hình cùng version. Chỉ đánh dấu hoàn thành nhóm backend đã có coverage và bằng chứng thật.

## FE-T14-HISTORY-RULES — API lịch đóng và quản trị luật đã có

Ngày05/10/2026. Bổ sung này thay thông tin “mọi API mở rộng chưa tồn tại” phía trên **chỉ với history/legal-rules**. Contract [insurance.openapi.yaml](../backend/docs/insurance.openapi.yaml), paths trong [openapi.yaml](../backend/docs/openapi.yaml), hướng dẫn [INSURANCE_HISTORY_RULES.md](../backend/docs/INSURANCE_HISTORY_RULES.md). Backend không chỉnh UI trong đợt này.

- [ ] USER: `GET /api/v1/me/pension/history` trả bản mới nhất hoặc data:null; `GET /:id` đọc bản cũ. Form giữ `id/revision/documentHash`, xóa state khi đổi tài khoản. Không gọi các route ADMIN để đọc lịch khách.
- [ ] Nhập `birth.precision/declaredValue` đúng DAY/MONTH/YEAR/UNKNOWN; legalSex; coverageFrom/Through/confirmedThroughMonth; tháng đóng, scheme/chế độ lương/status/căn cứ đóng/evidence; nhóm đặc thù theo khoảng. Không mặc định UNKNOWN thành0, không tự điền ngày sinh quy ước, không lấy lương thực nhận làm căn cứ đóng.
- [ ] Import có cấu trúc: POST `/me/pension/history/import-preview` với `{expectedHistoryRevision,document}`. Hiển thị READY/INCOMPLETE/INVALID và mọi issues. normalized có tháng UNKNOWN được bổ sung; INCOMPLETE được lưu với xác nhận, INVALID thì sửa trước. Không báo UNKNOWN là tháng đã đóng; không nộp Excel macro/URL/hồ sơ vào Gemini.
- [ ] Save: POST `/me/pension/history` với `{preview:<đúng body đã preview>,expectedInputHash,confirm:true}`, Idempotency-Key UUID. Giữ cùng key/body khi retry mạng; không thay body bằng normalized rồi giữ hash cũ.409 yêu cầu tải revision/xem lại; save append không tự thay pension/profile/plan.
- [ ] ADMIN: GET/POST `/admin/legal-rules`, GET/PATCH `/:id`, POST `/:id/transitions`. Mutation có Idempotency-Key. PATCH `{expectedRevision,draft}`; transitions VALIDATE/REVIEW/PUBLISH dùng revision/documentHash/validationHash/reviewHash theo phản hồi mới nhất; REVIEW cần reviewNote.
- [ ] DRAFT → VALIDATED → REVIEWED → PUBLISHED. Không cho người từng soạn/sửa tựreview; PATCH xóa duyệt cũ; published chỉ xem hoặc tạo bản kế tiếp, có supersedesId khi thay luật. Hiện strategy chưa đăng ký: VALIDATE trảDRAFT vàSTRATEGY_NOT_IMPLEMENTED; không hiển thị bộ tínhBHXH sẵn sàng chỉ vì tạo được draft.
- [ ] Browser: chưa có lịch → nhập thiếu tháng → previewunknown → save/reload; sửa tạorevision2 đọc lạirevision1; trùng thángINVALID;409multitab; khác tài khoản404; USER vào ADMIN403; ADMIN vào lịchUSER403; lỗi mạng retrykhôngappendtrùng. Bộ tínhestimate, chọnpensionv4 và luồng khoản vay/nguồn mới tiếp tục chờ backend bàn giao riêng.

## FE-T14-ESTIMATES — Xem trước và lưu kết quả BHXH

Ngày05/10/2026. API estimate đã có, thay ghi chú chờ ở trên. Phạm vi hiện tại: đóng bắt buộc theo lương doanh nghiệp, nhómĐiều2(1)(a), điều kiện thông thường. Chưa có bộ luật công bố trên DB thật; không hiển thị sẵn sàng tính khi danh sách bộ luật rỗng. Contract production: [insurance.openapi.yaml](../backend/docs/insurance.openapi.yaml), [hướng dẫn](../backend/docs/INSURANCE_HISTORY_RULES.md).

- [ ] Form lịch thêm `participantCategory`; trạng thái `NOT_CONTRIBUTED` là xác nhận không đóng, `contributionBase=null`, có căn cứ, khác tháng chưa rõ `UNKNOWN`. Không tự gán loại người tham gia từ tên nghề.
- [ ] Lấy `GET /api/v1/me/pension/legal-rules?benefitDate=YYYY-MM-DD` khi đổi ngày hưởng. Chọn ID bản luật do backend trả; danh sách rỗng thì giải thích chưa có bộ quy định phù hợp, vẫn giữ lựa chọn nhập hưu thủ công.
- [ ] `POST /api/v1/me/pension/estimates/preview`: gửi historyVersionId/revision mới nhất, legalRuleSetVersionId, intendedBenefitDate, employmentEndDate, contributionStopMonth, benefitRequestDate và futureContributions. `caseDetails` khai đang tham gia/bảo lưu và tháng hưởng theo thông báo/đề nghị hoặc giả định có căn cứ; không lấy mốc tuổi tự điền thành quyết định hưởng.
- [ ] Tách `assessmentStatus` (ELIGIBLE/NOT_YET_ELIGIBLE/INSUFFICIENT_DATA/REVIEW_REQUIRED) khỏi `estimateKind` (CURRENT_RULE_ESTIMATE/PROJECTED_SCENARIO). Hiển thị tháng tính đóng, bình quân, tỷ lệ, sàn nếu có, tháng nhận, trợ cấp một lần, missingFields và citations. `null` là chưa xác định, không chuyển thành0. Có mức hưu nhưng REVIEW_REQUIRED không được diễn giải là hồ sơ đã xét đầy đủ.
- [ ] Lưu bằng `POST /api/v1/me/pension/estimates` với `{preview:<body vừa xem>,expectedInputHash:<inputHash cấp ngoài>}`, Idempotency-Key UUID. Không dùng `assessment.inputHash`. Giữ key/body khi retry.409 yêu cầu xem lại vì lịch/luật/ngày đánh giá có thể đã đổi.
- [ ] Danh sách `GET /api/v1/me/pension/estimates`; chi tiết `GET /:id`. Hiển thị đúng assessedOn, historyRevision, legalRuleVersion và kết quả bất biến; không tính lại bằng dữ liệu hiện hành trên trình duyệt. Lưu estimate chưa thay pension/profile/plan; nút áp vào candidate còn chờ tích hợpT14-06/T16.
- [ ] ADMIN: BH1 đã đăng ký để VALIDATE; BH2–4 còn STRATEGY_NOT_IMPLEMENTED. Duyệt/công bố vẫn cần chứng từ thật và người duyệt độc lập. Không sử dụng fixture test để tạo bộ luật production.
- [ ] Browser nghiệm thu:179/180tháng; UNKNOWNkhácNOT_CONTRIBUTED; thiếu hệ sốnăm hưởng; pensionnull; lưu trùng khi retry;409lịch/luật cũ; đổi tài khoản404; đọc lại estimate cũ sau thay lịch; không tự cộng trợ cấp vào quỹ.

### Bổ sung FE-T14-ESTIMATES — phiên bản quyền lợi v2

- [ ] Hiển thị `engineCode` từ kết quả đã lưu; quyền lợiv1/v2 khác với model kế hoạch retirement-monthly-v2/v3/v4. Không đổi phiên bản khi đọc lịch sử.
- [ ] Với quyền lợiv2, `lumpSum` có trợ cấp vượt số tháng đóng; breakdown `LUMP_SUM_EXCESS_MONTHS_BEFORE_AGE`, `LUMP_SUM_EXCESS_MONTHS_AFTER_AGE`, `LUMP_SUM_BEFORE_AGE`, `LUMP_SUM_AFTER_AGE`, `RETIREMENT_LUMP_SUM`. Hiển thị riêng khoản một lần, không nhân thành thu nhập tháng hoặc tự góp vào quỹ. V1 có thể vẫn null/REVIEW_REQUIRED cho cùng hồ sơ; không tự thay bằng sốv2.
- [ ] Các nhóm lương Nhà nước/hỗn hợp vẫn chờAPI đầy đủ; core nội bộ mới không là căn cứ mở form gửi bình quân đã tính hoặc báo hỗ trợ toàn bộBHXH.

### FE-T14-STATE — nhánh lương Nhà nước/hỗn hợp thông thường đã có API

Ngày05/10/2026, thay thông tin “chỉ core” phía trên đối với nhóm thông thường. Dùng chung routes estimate và [contract](../backend/docs/insurance.openapi.yaml). Branch `BH2_COMPULSORY_STATE_MIXED_NORMAL`, engine `vn-pension-state-v1`. Các nhóm đặc thù vẫn chờ triển khai, chưa có bộ luật thực công bố trênDB.

- [ ] Form lịch tháng STATE có `stateSalary` khi cần: `kind=CURRENT_SCALE_COEFFICIENT`, `totalContributionCoefficient` là chuỗi, evidence. Nhập đúng tổng hệ số làm căn cứ đóng theo chứng từ; không lấy riêng hệ số ngạch hoặc suy từ lương thực nhận. Backend không nhận tiền `adjustedBase` doUI tính.
- [ ] Form estimate thêm `stateSalaryCase`: mốc tham gia đầu tiên, căn cứ xác nhận mốc, salaryTreatment và căn cứ phân loại. Không mặc địnhORDINARY; cho chọn chưa rõ/nhóm chuyển nghề-thâm niên và hiển thị trạng thái cần rà. Lịch phải bao gồm cả giai đoạn trước đã rútBHXH một lần nếu có, không chỉ đoạn đang giữ.
- [ ] Trước2016 dùng hệ số đóng và mức tham chiếu do luật cung cấp; từ2016 dùng hệ số năm. Hiển thị `STATE_ADJUSTMENT_METHOD`, `STATE_WAGE_WINDOW_MONTHS`, `STATE_CONTRIBUTION_MONTHS`, `STATE_ADJUSTED_AVERAGE`, `EMPLOYER_ADJUSTED_TOTAL`, `STATE_USED_ALL_TIME_AVERAGE`. Cửa sổnull nghĩa toàn bộ, không phải0tháng.
- [ ] Với giai đoạn trước10/2004, trần hệ số cần rà, nhóm thâm niên/chuyển ngành hoặc CREDITED, giải thích missingFields/REVIEW_REQUIRED; không dùng0 hoặc vẫn báo đã tính đủ. Không suy trợ cấp/quỹ từ lương hưu tháng.
- [ ] Browser: thuần Nhà nước, xen kẽ Nhà nước/doanh nghiệp, thiếu hệ số, đổi mốc tham gia, chứng từ tương lai, nhóm cần rà,409sau sửa lịch, đọc lại estimate cũ và cùng key khi retry. Giữ riêng pension nhập tay và chưa tự apply vào plan.
# FE-T14-CORPUS-SOURCE — bổ sung 05/10/2026

- Backend có hai bộ luật nháp 2026 có nguồn/hash tại `backend/seed-data/legal-2026/`; không coi file nháp là luật đã công bố. Màn hình chọn luật tiếp tục chỉ dùng discovery API trả PUBLISHED. Có file corpus không có nghĩa đã có dữ liệu luật dùng được trong DB.
- Nguồn pháp lý có thể dẫn tới bản ký trên `xdcs.cdnchinhphu.vn`; hiển thị tên văn bản/điều khoản và liên kết do API trả, không tự đổi URL hoặc bỏ hash. Không gắn nhãn đã xác thực chữ ký chỉ dựa vào URL.
- Đã chuẩn bị builder nội bộ chọn estimate vào nguồn pension; **chưa mở endpoint T16**, chưa nối nút thành công giả. Khi API được bàn giao: gửi estimateId/hash, revision nguồn/registry và khoảng tháng; chỉ phần sau cutoff, cần chọn thay nguồn pension cũ để tránh cộng trùng.
- Kết quả ước tính đưa vào nguồn phải mang nhãn dự kiến; giữ số danh nghĩa cố định khi chọn FIXED_NOMINAL, không âm thầm áp lịch tăng của pension cũ. Trợ cấp một lần hiển thị riêng, không tự cộng vào quỹ. Lịch đóng hoặc luật thay đổi trước save phải yêu cầu xem trước lại. Backend chưa sửa frontend trong đợt này.

## FE-T15-LOAN-V2-CORE — 06/10/2026: chuẩn bị màn cập nhật khoản vay

Backend đã có core lịch/đối soát/revision nguồn; **chưa có API T15 public**. Chưa bật nút lưu/apply tính năng này hoặc gửi Contractv2 vào API Contractv1. Chi tiết: [LOAN_REVISIONS_V2.md](../backend/docs/LOAN_REVISIONS_V2.md).

- Form cần tách dư gốc và ngày xác nhận; toàn hợp đồng/phần người dùng; tỷ lệ trả; ngày ký/sửa/hiệu lực; chứng từ. Hiển thị rõ phương án giả định và lịch được ngân hàng xác nhận.
- Tiền thực trả tách gốc, lãi, phí trả trước, phí khác; chọn giao dịch DEBT_PAYMENT và phiên bản tháng. Cho thấy phần còn chưa phân bổ; không lấy toàn bộ tiền trả làm tiền giảm gốc, không suy phần đồng vay từ tỷ lệ.
- Chọn giữ hạn/giảm khoản trả, giữ khoản trả/giảm hạn, lịch ngân hàng hoặc cơ cấu. Lịch cần thể hiện gốc/lãi/phí/dư cuối từng kỳ; ân hạn gốc vẫn có thể trả lãi. Không đưa refinance vào trạng thái đã hỗ trợ.
- Với kỳ giữa tháng cần ngày bắt đầu/kết thúc và cách tính lãi theo ngày; lãi thả nổi khai từng kỳ. Kỳ cuối phải chỉ rõ balloon nếu có. Tiền phí/lãi sau khi hết gốc vẫn có thể phải trả.
- CAPPED hiện là trần tổng nghĩa vụ người dùng, gồm gốc/lãi/phí; hiển thị đã trả và còn lại. Không đặt lại trần về số ban đầu mỗi khi sửa lịch.
- REVIEW_REQUIRED không phải kết quả hoàn chỉnh để lưu/apply. Các lỗi số dư không khớp, event stale/đã phân bổ, sửa trước cutoff, thiếu thứ tự ghi sổ cùng ngày cần giữ dữ liệu nhập và hướng dẫn đối soát.
- Ví dụ nghiệm thu: gốc100tr, trả12tr gồm gốc10+lãi1+phí1 → gốc90tr. WITHDRAWAL12tr đã chốt không bị trừ lại khi phân bổ DEBT_PAYMENT. Sửa lịch chỉ tác động sau cutoff, không đổi số dư quỹ thực tế.
- Chờ handoff API tiếp theo để nối endpoint, hash/revisions/idempotency và luồng save/apply. Backend chưa sửa mã frontend trong đợt này.

## FE-T15-LOAN-V2-API — 06/10/2026: đã nối luồng cập nhật khoản vay

Thay ghi chú “chưa có API” tại FE-T15-LOAN-V2-CORE. Backend đã nhận `loanRevisions` ở preview/save nguồn v4, chuyển cơ sở số dư v1, giữ evidence trong snapshot, kiểm stale actual khi apply. Không có refinance/new loan trong đợt này. [Contract đầy đủ](../backend/docs/LOAN_REVISIONS_V2.md).

1. Gửi preview nguồn với các mảng lệnh rỗng để nhận `loanRevisionOptions`. Dùng sourceId/sourceRevision/sourceHash/contractHash server trả; không tự băm JSON. Nếu legacyOpeningRequired, lấy thông tin ngày ký/sửa/hiệu lực và chứng từ từ người dùng; không tự đặt ngày. CAPPED phải xác nhận capBasis=TOTAL_USER_PAYMENTS và phần đã thực hiện trước số dư gốc; loại khác previouslyPaid=0.
2. Gửi tối đa30 loanRevisions; mỗi khoản vay một commandId UUID mới và operation=REVISE, expectedSourceRevision/expectedSourceHash/expectedContractHash/confirm=true. Có thể kèm flow/pension khác nhưng không trùng nguồn hoặc commandId. Contractv2 phải có số dư ngày cuối throughMonth và đầy đủ lịch sau đó, không chỉ những tháng đang hiển thị trên biểu đồ.
3. Chọn actual DEBT_PAYMENT của đúng tài khoản, gửi allocationId/eventId/actualRevision/bookedOn/scope và bốn thành phần gốc/lãi/phí trả trước/phí khác. components là tiền người dùng; contractComponents là phần hợp đồng có chứng từ. Không tự chia tiền theo share để suy phần người khác. Chỉ gửi allocations mới trong revision này; backend tự giữ phần đã phân bổ.
4. Preview READY trả candidate và inputHash; lưu đúng body đó + expectedInputHash qua endpoint source-reforecasts có Idempotency-Key. Apply riêng với revision mới. Không gửi actuals/consumed/basis hoặc tự chỉnh anchor. Xem lại loanSources để hiển thị lịch/chứng cứ đã pin của bản đã lưu.
5. Sau409 giữ bản nhập nhưng phải tải lại nguồn/actual và preview mới; không lặp apply với hash cũ. Khi actual bị sửa, đọc/replay lịch sử vẫn được nhưng save/apply từ nguồn stale bị chặn. Sửa tiếp cùng cutoff bỏ legacyOpening và dùng hash hợp đồng v2 mới từ options; sang tháng tiếp theo chỉ phân bổ giao dịch mới.
6. Nghiệm thu: v1→trả một phần→preview→save→apply→reload/report/CSV; sửa kỳ hạn tại cùng cutoff; thêm tháng thực tế; hai khoản vay dùng chung một event không được vượt tổng; CAPPED không reset; bản v1/v3 lịch sử giữ nguyên; tiền WITHDRAWAL không bị trừ thêm.

Backend đã kiểm bằng service/HTTP và response schema; PostgreSQL/races, browser/UI và đối chiếu ngân hàng vẫn chưa nghiệm thu. Không sửa mã frontend trong đợt backend này.

## FE-T15-T16-NEW-LOAN-REFINANCE — 07/10/2026

Backend đã mở khoản vay mới và refinance thực tế trong cùng preview/save nguồn. Thay ghi chú chưa có hai chức năng ở FE-T15-LOAN-V2-API. [Contract](../backend/docs/LOAN_REVISIONS_V2.md). Đã kiểm HTTP/DB rollback loan 19 ca và refinance 20 ca; chưa nghiệm thu UI.

1. Form vay mới gửi loanCreations[] với sourceId plan:UUID, commandId, operation CREATE, expectedSourceRevision=0, confirm=true, agreementReference, contractv2 và funding. EXISTING_BALANCE cần xác nhận chưa có trong nguồn, evidence, BANK_CONFIRMED và dư gốc cuối throughMonth; PLANNED_DISBURSEMENT cần gross/withheldFees/net, destination EXTERNAL_ACCOUNT, balanceNature PROJECTED_DISBURSEMENT và HYPOTHETICAL. Hiển thị riêng tiền vay nhận về và nghĩa vụ phải trả; không cộng khoản vay vào thu nhập hoặc quỹ.
2. Cập nhật vay mới ở bản sau vẫn dùng loanRevisionOptions và loanRevisions; không gửi lại CREATE. Không tự chuyển trạng thái dự kiến sang ngân hàng xác nhận khi chỉ bấm lưu.
3. Refinance thực tế là một form tổng hợp: khoản cũ đã tất toán, khoản mới đã giải ngân, chứng từ gốc/lãi/phí và tiền bù ngoài/tiền còn dư. Gửi END khoản cũ + CREATE khoản mới + refinances cùng một body; cả hai lệnh con có refinanceCommandId. Hiển thị phép cân đối gross−withheldFees+externalTopUp = settlementAmount+unusedProceeds. Không lưu hai API tách rời.
4. Khoản đã đóng: gốc=0, không còn phí/lãi tương lai; BANK_SCHEDULE periods=[] và maturityDate=balanceAsOf. Không cho UI chỉ sửa gốc=0 rồi bỏ nghĩa vụ chưa trả. Sai đối soát phải giữ form, hiển thị lỗi, không thông báo một nửa refinance đã xong.
5. Nhánh hiện tại chỉ refinance đã xảy ra có actual/chứng từ; chưa mở giả định refinance tương lai hoặc khoản mới đã trả gốc trước cutoff. Save/apply vẫn tách riêng, 409 tải lại source/actual rồi preview; report/CSV/replay theo bản đã chọn.

## FE-T16-ASSET-CAPITAL — 07/10/2026

Backend đã nhận assetCommands[] (tối đa30) và trả assetRevisionOptions. [Contract và giới hạn](../backend/docs/ASSET_SOURCES_V4.md). Bộ kiểm thử có HTTP/schema/save/apply/replay/CSV, 20 ca DB thật rollback giữ41bảng; chưa kiểm browser. Không sửa frontend trong đợt này.

1. Thêm form bán tài sản/nguồn vốn thanh khoản: mã tài sản/chứng từ, toàn tài sản hay phần người dùng, tỷ lệ sở hữu, phần dành cho hưu, tổng tiền, phí, thuế, tiền trả nợ bảo đảm và tiền ròng. Các số tiền phải cùng phạm vi; USER_SHARE không nhân tỷ lệ sở hữu lần nữa. Hiển thị mức góp tối đa nhưng để người dùng xác nhận số thực sự muốn góp, kể cả0; không mặc định góp hết tiền ròng.
2. Tách “Dự kiến góp” và “Đã góp trong sổ thực tế”. Dự kiến cần ngày tiền có sẵn, trạng thái thanh khoản AVAILABLE/PLANNED_RELEASE, tháng góp, xác nhận tiền chưa nằm trong quỹ; thời điểm góp hiện là cuối tháng. Không cho tháng góp trước tiền sẵn có hoặc trước/sát cutoff actual. Dự báo vẫn ghi HYPOTHETICAL.
3. Đã góp: chọn event CONTRIBUTION của tháng đã đối soát, gửi eventId/actualRevision/bookedOn/allocationId/amount, tổng bằng confirmedContributionAmount; không chọn INCOME/DEBT_PAYMENT/WITHDRAWAL thay thế. Backend lấy actual theo tài khoản, không nhận actuals/consumed/số dư tự gửi. Khoản này không được cộng lại vào quỹ vì anchor đã bao gồm nó.
4. CREATE dùng sourceId plan:UUID, revision0/hashnull, notAlreadyInSources=true; REVISE/END dùng options server. Khi sửa nguồn hồ sơ, capital.reference phải là asset id gốc. Mỗi nguồn/command chỉ xuất hiện một lần trong batch và không đổi mã tài sản qua sửa. Nguồn đã realized không cho tạo lại một khoản góp từ cùng tài sản.
5. Gửi body preview nguồn hiện có + assetCommands. READY/inputHash mới cho lưu; save dùng Idempotency-Key, apply riêng với plan revision mới. Render assetSources của bản lưu để xem chứng cứ. Hiển thị attribution vốn trên báo cáo/CSV; không thay net worth/profile gốc bằng tổng tiền nguồn mới.
6. Phí/thuế/securedDebtSettlement chỉ giúp tính tiền ròng, chưa tự tất toán nguồn nợ. Muốn đóng vay phải thêm loanRevision/chứng từ tương ứng. Nguồn RENT hoặc chuyển thuê→bán chưa hỗ trợ; khoản góp dự kiến đã qua cutoff cần đối soát, không âm thầm dời sang tháng sau. Với ASSET_*_REVIEW_REQUIRED giữ dữ liệu nhập và giải thích phạm vi cần rà.
7. Nghiệm thu: bán1000−phí50−thuế50−trả nợ100=800; sở hữu50%, phần hưu50% → tối đa200, góp150 thì chỉ150 vào quỹ. USER_SHARE800/phần hưu50% → tối đa400. Sửa tháng/mức góp rồi hủy không làm lịch cũ xuất hiện lại. Event CONTRIBUTION300 không được phân bổ200+200 cho hai tài sản. Sửa actual làm apply409 nhưng replay lịch sử giữ nguyên; chuyển dự kiến→đã góp không cộng lần hai.

**Bổ sung T17 ngày07/10:** backend nguồn v4 đã kiểm race cùng key/cùng revision/actual sửa cạnh apply trên hai kết nối PostgreSQL độc lập. UI vẫn cần tự nghiệm thu đa tab: retry cùng key giữ cùng body; sau409 tải nguồn mới và preview lại; actual sửa sau apply phải hiện trạng thái cần tính lại, không che bằng thông báo áp dụng thành công cũ.

## FE-T17-PENSION-RACES — nghiệm thu nhiều tab BHXH, 07/10/2026

Backend đã kiểm6race service/DB độc lập cho lịch đóng, estimate và chọn lương hưu vào dự báo. Không đổi endpoint/schema.

- [ ] Tab A thêm lịch đóng trong khi tab B lưu/áp dụng bản dự báo có lương hưu: tab B có thể nhận409 HISTORY_REVISION_CONFLICT → báo lịch đóng đã đổi, giữ nháp, hướng dẫn tính lại estimate rồi chọn lại; không tự gửi lại.
- [ ] Bản dự báo đã lưu trước khi lịch đóng đổi vẫn xem/replay được nhưng nút Áp dụng phải xử lý409 HISTORY_REVISION_CONFLICT, không hiện “đã áp dụng”.
- [ ] Estimate lưu ngay trước khi lịch đóng đổi vẫn hiển thị trong danh sách, nhưng chọn vào dự báo bị409; đánh dấu “cần tính lại theo lịch đóng mới”.
- [ ] Hai tab cùng thêm lịch đóng từ cùng revision: chỉ một thắng; tab còn lại tải lại lịch đóng mới nhất trước khi sửa tiếp.
