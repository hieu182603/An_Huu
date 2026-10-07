# An Hưu — Kế hoạch code backend

**07/10 — refinance dự kiến nội bộ:** engine planned-refinance-v1 giữ kỳ cũ tới tất toán, quote/CAPPED/thứ tự cùng ngày và chỉ tiền bù user vào lịch chi, không ghi actual.608tests/52files đạt; sau sửa narrow TypeScript,8focused/testtypes/sourceemit đạt. Chưa API/registry/save/apply/DB; xem PLANNED_REFINANCE.md (6bước còn làm) và FE-T15-PLANNED-REFINANCE. Tiếp builder/lifecycle cặp nguồn trước mởpublic, toàn bộ T14/T15/T17/vận hành vẫn còn trong mục tiêu.


**07/10 — giải ngân trước tất toán:** proceedsAtSettlement đã nối refinance/proof/replay; tiền còn lại sau sử dụng trước đó được xác nhận riêng với dư gốc.600tests/51files/typechecks/emit/OpenAPI và24HTTP/DBrollback41bảng đạt. UI FE-T15-EARLY-DISBURSEMENT, contract LOAN_REVISIONS_V2. Tiếp refinance giả định tương lai và basis hợp đồng sửa sau giải ngân; nhánh hoàn lại tiền tất toán trước đó/thứ tự cùng ngày chưa mở. T14/T17/vận hành vẫn giữ đầy đủ phạm vi.


**07/10 — sửa nghĩa vụ:** responsibilityAmendment/userPaidToDate đã nối public loan revision/proof/replay, đổi loại/trần nhưng giữ tổng đã trả qua uncapped và khi bật lại CAPPED.597tests/51files, typechecks/emit/OpenAPI đạt; lượt DB cuối21HTTPchecks rollback41bảng đạt. Lượt trước khác fingerprint sau21ca, residue0/nguyên nhân chưa rõ, ghi đầy đủ trong PROGRESS. UI FE-T15-RESPONSIBILITY-AMENDMENT; không migration. Tiếp refinance tương lai/ngày giải ngân khác tất toán/basis hợp đồng sửa sau giải ngân; T14/T17/vận hành còn mở.


**07/10 — T17 vay + tài sản:** verifier `--loan-assets` đạt3races qua hai PostgreSQL PID độc lập, changeset vayv2+STAGED giữ đầy đủ, số thực tế/tiền góp không đếm đôi, stale và replay đúng. Fixture commit riêng đã dọn đúng ID;41bảng giữ fingerprint. Không thay runtime/schema, không có lượt unit mới. T17-02 chỉ đạt thêm phạm vi này; UI/BHXH/refinance và vận hành chưa nghiệm thu đầy đủ. Tiếp T15 đổi nghĩa vụ/CAPPED có chứng từ, giữ lịch sử; xem PROGRESS.


**07/10 — vốn legacy v3:** đã nối ASSET_REALIZED → STAGED cùng sourceId, mang toàn bộ giao dịch góp cũ vào tổng lũy kế, không cộng lại quỹ hoặc khôi phục thuê đã dừng. Full593tests/51files,17focused/typechecks/sourceemit và19HTTP/DBrollback41bảng đạt. Contract ASSET_SOURCES_V4 và FE-T16-LEGACY-CAPITAL. Task đã sửa ghi chú public v4/candidate pension lỗi thời; nghiệm thu T13–T17 và vận hành còn mở. Tiếp races vay/tài sản và cross-flow T17; các nhánh T14/T15 còn lại giữ nguyên phạm vi.


**07/10 — T17/migration0013:** clean12 phát hiện thiếu2index đã có trong schema/DBthật; bổ sung0013 IFNOTEXISTS. Khôi phục0002–0011 về đúng LF khớp checksumDB (không đổi SQL), giữbaselineCRLF, .gitattributes cố định. Clean13/upgrade4→13/10integration/restore41bảng đạt; rehearsalrollback40 vàapply0013 DBthật đạt. Audit13/13checksum, không pending, diff rỗng,40model/41bảng. Không thay bằng chứng backup/scheduler production hoặc UI/races xuyên nhánh. Chi tiết PROGRESS.


**07/10 — availability nhiều đợt:** funding STAGED có releases theo ngày/tiền ròng thuộc nguồn, actual chỉ dùng CONFIRMED đã về trước ngày góp, dự kiến theo prefix cuối tháng; release quá cutoff phải xác nhận hoặc dời lịch. Khoản CONFIRMED giữ bất biến, không bỏ ledger ở revision sau. Full588tests/50files,12focused/typechecks/emit và29HTTP/DBrollback41bảng đạt. UI FE-T16-AVAILABILITY, contract ASSET_SOURCES_V4. Không tự đưa tiền nhận vào quỹ/thu nhập/vay. T17 clean/upgrade12 đang được kiểm lại riêng trên Docker tạm; xem PROGRESS.


**07/10 — góp nhiều đợt:** funding STAGED đã nối CREATE/REVISE/preview/save/apply/replay; priorRealized server lấy theo cùng nguồn, tổng lũy kế gồm đã góp và tương lai không vượt net. Có đối soát từng tháng đến hạn, nhận một phần/bù muộn, hủy phần còn lại và chuyển REALIZED v4 sang STAGED để góp thêm phần chưa dùng. UI FE-T16-STAGED. Kết quả cuối ở PROGRESS; không đóng toàn bộ T16/T14/T15/T17/vận hành. Nhận tiền bán/giải ngân nhiều đợt với hạn mức thanh khoản tăng dần cần phần tiếp theo, STAGED hiện có một availableOn cho tiền ròng.


**07/10 — thuê sang bán:** rentalExit cùng asset source đã nối API/preview/save/apply/replay; dừng thuê đúng tháng, tiền bán chỉ góp số xác nhận, không tự kéo dài thuê khi dời bán. Full575tests/49files,7focused/typechecks/emit,27HTTP/DBrollback41bảng đạt. UI FE-T16-RENTAL-SALE. Tiếp góp một phần/nhiều đợt và toàn bộ T14/T15/T17/vận hành còn mở.


**07/10 — khoản góp chưa thực hiện:** T16 REVISE.missedContribution đã nối API/đối soát/replay, xác nhận toàn bộ chưa góp và dời lịch tương lai; không đổi actual/profile/quỹ hiện tại. Full568tests/48files,14focused/typechecks/emit,28HTTP/DBrollback41bảng đạt. UI FE-T16-MISSED-CONTRIBUTION. Tiếp RENT→SALE và góp nhiều đợt; toàn bộ nhánh T14/T15/T17/vận hành vẫn mở.


**07/10 — vay thay thế đã trả gốc:** DISBURSED_BALANCE đã nối API/đối soát/replay, gross giải ngân khác dư nợ cuối kỳ; full563tests, final20focused, typechecks/emit và22HTTP/DBrollback41bảng đạt. UI FE-T15-DISBURSED-BALANCE; tiếp T16 khoản góp dự kiến không xảy ra và toàn bộ phần còn mở, chưa đóng mục tiêu.


**07/10 — đóng trước/hoàn trong kỳ nghỉ hưu:** engine/API/prepaidmetadata, day/payment-window/request/duplicate/cutoff/support checks,23case corpus vàsource capture đã nối. Full558tests48files/testtypes/sourceemit/6draftcheckPASS,18HTTP/DBrollback41bảngPASS. Không migration/AI/email/frontend; UI FE-T14-PREPAID. Tiếp T14 chuyển tiếp/CREDITED/đặc thù/năm khác và mở topup trả sớm theoLuật36(3)(e) bằngversion mới; giữtoànbộT15/T16/T17/vận hànhgoal.

**07/10 — đóng bù:** metadata thanh toán/engine riêng đã nối preview/save/read/replay/source selection, corpus năm2026 có nguồn giới hạn/lãi, OpenAPI và FE-T14-TOP-UP. Full544tests/47files, test/source typechecks+emit,18HTTP/DB rollback41bảng đạt. Không migration/frontend/provider/email hoặc công bố luật thật. Tiếp đóng trước/hoàn trả/chuyển tiếp/CREDITED/đặc thù và toàn bộT15/T16/T17/vận hành còn mở; mục tiêu chưa hoàn thành.

**07/10 — corpus/Nhà nước+tự nguyện:** thêm engine riêng cho lương Nhà nước/doanh nghiệp trước tự nguyện,4corpus draft nguồn/hash (2cũ không đổi,2mới1146dòng). Full518tests, typechecks/emit, corpus tái lập đạt;2lượt17HTTP/DBrollback41bảng đạt. Sửa logHTTP dùng writer củaservices thayglobalDB, bỏ rawerror/query,21focused và4DBrollbackchecks đạt. Chưa phê duyệt/công bố luật; tiếp đóng trước/bù/chuyển tiếp và toàn bộ nhánh/vận hành còn lại, không đóng mục tiêu. FE-T14-VOLUNTARY-STATE.

**07/10 — tự nguyện:** API/engine/strategy cho tự nguyện định kỳ và hỗn hợp doanh nghiệp đã nối;499tests +25focused sau guard nguồn luật đạt, testtypecheck/sourceemit đạt,16HTTP/DBrollback41bảng đạt. Contract VOLUNTARY_PENSION.md và FE-T14-VOLUNTARY. Còn corpus nguồn thật/duyệt độc lập, Nhà nước+tự nguyện, đóng trước/bù/chuyển tiếp/credited/đặc thù cùng các phần T15–T17/vận hành; không đóng goal.

**07/10 — nguồn vay/tài sản:** đã nối vay mới, refinance thực tế atomic và tài sản/vốn CREATE/REVISE/END, chứng từ actual và replay. Loan19/refinance20/asset20 ca DB rollback đạt; full465tests +9assetfocused đạt, source emit đạt, testtypecheck cuối đạt sau một guard ở test settings (5tests đạt), OpenAPI production/expansion đạt. Chi tiết PROGRESS/ASSET_SOURCES_V4/LOAN_REVISIONS_V2. Chưa đóng T14–T17: còn nhánh pháp lý, refinance tương lai/lifecycle tài sản, race/UI/vận hành. Giới hạn approval cũ đã hết, DB verifier mới được duyệt và chạy; các checkpoint chưa chạy bên dưới là lịch sử.

**06/10 — T15 public:** đã nối chuyển basis v1, loanRevisions v2, đối soát và proof vào preview/save/apply/read/replay; options hash server và OpenAPI/UI handoff đầy đủ.444tests +32focused sau ca đẩy cutoff đạt; verifierDB --loan mới chuẩn bị, chưa chạy. Refinance/tài sản-vay mới và các nhánhBHXH/T17/vận hành tiếp tục, không đánh dấu toàn bộ hoàn tất.

**06/10 — T15 core:** đã có lịch vay v2/đối soát gốc-lãi-phí/CAPPED và builder nguồn/replay nội bộ;436tests toàn bộ +57focused sau guard ngày đạt. Chưa nối API/save/apply, chuyển v1 có chứng từ hay refinance. Xem LOAN_REVISIONS_V2.md/PROGRESS.md và FE-T15-LOAN-V2-CORE; giữ T15 mở, tiếp các phần tích hợp và mục tiêu backend đầy đủ.

**05/10 — public nguồn v4:** đã nối preview/save/apply/read/replay/report/CSV/AI và actual forecast; CREATE/REVISE/END nguồn thu/chi/pension, chọn estimate BHXH vào candidate có evidence đầy đủ. Có sửa cùng cutoff, kiểm stale estimate còn dùng trong tương lai, không tự góp trợ cấp/tiền dư. Contract SOURCE_COMMANDS_V4.md; UI FE-T16-SOURCE-V4. PostgreSQL/race mới chưa được kiểm do automatic approval review hết hạn mức, script chưa chạy. T15/T16-02, các nhánh BHXH và vận hành còn mở, không migration/frontend.

**05/10 — corpus và nguồn BHXH:** hai bản nháp có nguồn/hash/tái lập offline đã tạo; chưa công bố. Nối nội bộ estimate→candidate nguồn pension với owner/CAS/lineage/replay, không tự góp trợ cấp; API T16 và lưu evidence trong plan còn làm.404tests và29focused sau sửa cuối đạt; OpenAPI/corpuscheck đạt. DB lượt mới lỗi kết nối preflight, không ghi dữ liệu. Xem checkpoint PROGRESS và README legal-2026; FE-T14-CORPUS-SOURCE.

**Hiện hành05/10 — BH2 thường:** engine/strategy/API lương Nhà nước và hỗn hợp đã nối; tham gia trước2016 dùng hệ số đóng có căn cứ với mức tham chiếu, từ2016 dùng hệ số năm.388tests,13STATE_PENSION HTTP/DBrollback38bảng; sauguardtrần11focused/typechecks/emit đạt. Còn chuyển đổi trước10/2004/đặc thù/CREDITED/tự nguyện/BH3/BH4 và corpus luật thực. FE-T14-STATE; không migration/frontend. Goal T13–T17/vận hành cònactive.

**Hiện hành05/10 — trợ cấp/v2:** đã bổ sung trợ cấp vượt35/30năm vào engine quyền lợiv2, giữreplayv1; nền bình quân lương Nhà nước/hỗn hợp có15mẫu nhưng chưa mởAPI.382tests/34files, typechecks/emit và39HTTP/DBrollback38bảng đạt. TiếpBH2 điều chỉnh lương/ngoại lệ/strategy và corpus luật thực; BH3/4/T15/T16/T17/vận hành còn mở. Không migration/frontend.

**Hiện hành05/10 — BH1/estimate:** đã nối API xem trước/lưu/đọc bất biến và discovery luật đã công bố; strategy BH1 thông thường có hệ số2026/9goldens.353tests/32files, typechecks/emit/startup và34realHTTP/DBrollback38bảng đạt. Chưa có corpus luật thật PUBLISHED; còn các nhómBHXH khác/trợ cấp, nối nguồnpension, T15/T16/T17/vận hành. Chi tiết PROGRESS.md; UI FE-T14-ESTIMATES. Không tạo thêm migration hoặc sửa frontend.

**Đang triển khai05/10 — T13 core/T14 storage:** registry/modelv4/serializer/no-op đã có nhưng publicv4 còn tích hợp. Rules/history API đã có; migration0011 ba bảng đã áp dụng, không chỉnh các migration cũ.313tests+20focusedcontract, clean11/upgrade/backuprestore và23predeployDBrollback đạt; hậu kiểm đang retry kết nối. TiếpT14-03 công thức BH1/estimate, sauBH2–4/T15/T16/T17/vận hành. Goal user yêu cầu làm đến hết vẫn active. Xem PROGRESS.md đầu file và INSURANCE_HISTORY_RULES.md; chưa công bố BHXH đầy đủ.

**T13-01/T13-02 đã thực hiện05/10:** ma trận pháp lý/bản ký R04/R06/R11, ADR-001/ERD/OpenAPI thiết kế đã có. Pension preview tách tuổi tham chiếu/tháng hưởng; freeze metadata v2/v3.299tests/27files/typechecks/build riêng/startup đạt. Chưa migration/API mở rộng/engineBHXH. TiếpT13-03 composer nguồn, registry/modelv4/dispatcher/no-op replay; sau đóT14-01 theoADR. UI FE-T13-REFERENCE; chi tiết mới nhất trong PROGRESS.md.

**Nghiên cứu/kế hoạch sau MVP05/10:** xem docs/research-bhxh-no-nguon-moi.md và task.md mục10. T13 nền rules/registry/compatibility → T14 BHXH theo nhóm → T15 cập nhật khoản vay thực tế/cơ cấu → T16 tạo nguồn mới → T17 nghiệm thu. Chỉ lập kế hoạch, chưa code/migration/tests mới. T13-01/T13-02 là điểm bắt đầu; giữ lịch sửv2/v3. Luật/hệ số2026 đã tìm nguồn, bản ký R04/R06/R11 và nhóm đặc thù còn bước kiểm chứng trước publish. Vận hành/P36 còn mở củaMVP không bị thay thế.

**T10/T12 vận hành05/10:** retention độc lập DB-only đã triển khai, dry-run mặc định, execute giới hạn lô/log/dừng;295tests +7DBrollbackchecks/typecheck/build/startup đạt. Diễn tập pg_dump/restore35bảng và dọn expired sau restore đạt với dữ liệu mẫu;10integration/clean-upgrade vẫn đạt. Xem RETENTION_OPERATIONS.md. Còn lịch/giám sát production, backup thật và áp lại yêu cầu xóa sau backup, P36/CI/staging/UI/browser; không gọi diễn tập là production acceptance.

**Gemini đã kết nối05/10:** theo lựa chọn mới của user, adapter gọi Gemini API bằng key env, schema chỉ chọn facts/citations và giữ công thức server. Live synthetic smoke developer/gemini-3.8-flash PASS;290tests/25files/typecheck/build riêng/startup đạt. Consent v2 yêu cầu xác nhận lại trước outbound; UI FE-GEMINI cần nối notice/trạng thái/policy từ API. Không migration, chưa fine-tuning. Contract GEMINI.md; quota/retention/backup/P36/browser vẫn mở. Ghi chú “provider chưa chọn” phía dưới là lịch sử.

**Q15-03 bổ sung nguồn đã triển khai05/10:** tất toán toàn bộ nghĩa vụ vay, tài sản đã vào quỹ, thay lịch hưu và từng dòng thu/chi theo nguồn có xác nhận. Kiểm chống trùng event/nguồn/khoảng/sửa tổng, snapshot/CSV/AI đồng bộ. 273tests/24files,17HTTP/DB rollback, typecheck/build riêng/startup đạt; không migration. Contract SOURCE_REFORECAST.md; UI FE-Q15-03 và browser còn chờ. Chưa mở tái cơ cấu/trả một phần hoặc thêm nguồn mới trong command reforecast.

**Đã triển khai bổ sung P13/P15 ngày05/10/2026:** model v3 đầu/cuối tháng và giữ replay v2; explicit deposits, preview/lưu/apply reforecast, lineage actual và điều chỉnh tổng tháng tương lai. 265 tests toàn bộ, 35 focused sau bổ sung AI, 22 kiểm tra DB rollback +3 concurrency đạt; typecheck/build riêng/startup đạt. Không migration mới. Contract CONTRIBUTIONS_REFORECAST.md, checklist task7.1/FE-P13-P15/T12 đã cập nhật. Còn chỉnh từng hợp đồng/nguồn riêng Q15-03, UI/browser và vận hành/provider. Các dòng “chưa triển khai” phía dưới là lịch sử.

**Cập nhật kế hoạch P13/P15 ngày05/10/2026:** khách đã chốt hướng; chủ dự án xác nhận tiền dư chỉ góp số người dùng xác nhận (EXPLICIT_DEPOSITS_ONLY). Thực hiện `docs/task.md` mục7.1: Q13-01–03 mở timing đầu/cuối kỳ có kiểm khả dụng và giữ replay cũ; Q15-01–04 lưu reforecast từ actual thành version, chỉnh lịch tương lai có hiệu lực, apply riêng và kiểm toàn luồng. Bắt đầu bằng contract/version Q13-01 + Q15-01. UI giao FE-P13-P15, ưu tiên sửa FE-RECHECK trước nghiệm thu. Đây là kế hoạch mới, chưa triển khai; các checkpoint dưới là lịch sử, không tiếp tục hỏi chốt Q13/Q15.

**Checkpoint mới nhất05/10/2026 — kiểm tra lại:** đã sửa thiếu5cột trong lịch sử bằng migration0010, áp dụngDBthật giữ dữ liệu; audit10/10/diff rỗng. DBsạch10 vànângcấptừ4→10 đãPASS,10integration/retentionPGPASS; CIpgvector/prepare đã sửa vàkiểm local.62tests AI/actuals/engine/report+testtypecheckPASS. Browser41ca:15PASS/26FAIL,khôngtreoteardown; frontend14writes saiAPI vàprecision đãtái hiện, ưu tiên FE-RECHECK-20261005. Báo cáo docs/RECHECK-T00-T10.md. Không sửa UI; normalbuildDLL/workertriểnkhai/backup/P36/provider/Q13/Q15 cònmở. Bước tiếp: AIfrontend sửatransport/precision/apply/state rồi nghiệmthu lại. Các checkpoint bên dưới là lịch sử, DBsạch không còn là mục chưa kiểm.

**Checkpoint hiện hành05/10/2026: T11 backend đã hoàn thành; T12 đã có bằng chứng nội bộ, chưa nghiệm thu phát hành.** Catalog/admin/quyền/revision, notification-settings theo tài khoản, ngừng route/producer tư vấn và giữ Support/history; migration0009 đã áp dụng,9/9checksum/diff rỗng. 246tests,26T11 HTTP/DB,2concurrency,18T12 HTTP/DB toàn luồng PASS; nguồn/test typecheck,frontend25tests/build,Prisma generation riêng+tsc/startupPASS. Browser7/8,1selector đổi mật khẩuFAIL. Build backend mặc định vướng DLL Windows đang dùng; không kill server, chờ restart có kiểm soát rồi chạy lại. Handoff FE-T11/T12; matrix `docs/T12-acceptance.md`, contract `backend/docs/SECONDARY_MODULES.md`. Phần mở: UI/browser thật,DB sạch,Q13/Q15,provider/staging/backup/P36. Các checkpoint bên dưới là lịch sử.

**Checkpoint hiện hành 05/10/2026: T10 backend chuẩn bị hoàn tất theo lựa chọn chưa chọn nhà cung cấp AI.** Có giải thích theo version/actual, provider boundary chỉ chọn facts, fallback, mô phỏng qua engine, consent/history/expiry/correction/export/delete và knowledge lexical index/approval. 241 tests, 21 HTTP/DB rollback,3 concurrency,typecheck/build/startup đạt. Migration0008 đã áp dụng,8/8 checksum/diff rỗng. UI FE-T10, provider thật và rà P36/vận hành trước phát hành chưa nghiệm thu. Contract AI_GOVERNANCE.md; **tiếp backend T11** theo task.md, không hồi sinh tư vấn chuyên viên. Checkpoint dưới là lịch sử.

**Checkpoint hiện hành 05/10/2026: T09 backend hoàn thành** sổ thực tế có revision/lịch sử/idempotency, đối soát và reforecast từ actual cuối tháng; giữ snapshot/baseline, không auto surplus Q15. 226 tests, 16 HTTP/DB rollback, 3 ca concurrency, typecheck/build/startup đạt. Migration 0007 đã áp dụng, 7/7 checksum/diff rỗng, không áp lại. Contract MONTHLY_ACTUALS.md; UI FE-T09 giao AI frontend, chưa nghiệm thu. **Bước tiếp T10 AI/context/nguồn/quản trị dữ liệu**. Checkpoint dưới là lịch sử; PROGRESS.md chứa giới hạn/evidence.

## Kế hoạch đang áp dụng — 04/10/2026

**Checkpoint thay thế mới nhất: backend T08.** Report/compare/simulate/CSV theo version, input whatIf và OpenAPI đã có; 215/215 tests, 31 HTTP/DB rollback, typecheck/build/startup đạt, không migration. FE-T08 ghi yêu cầu và lỗi UI cụ thể cho AI frontend; chưa đóng nghiệm thu toàn sản phẩm T08. **Tiếp backend T09 sổ thực tế/đối soát/dự báo còn lại**; không biến forecast thành actual hoặc tự nộp surplus Q15. Xem PROGRESS.md và docs/PLAN_PRESENTATION.md; các checkpoint dưới là lịch sử.

**Checkpoint thay thế mới nhất: backend T07.** Snapshot/lưu/apply/baseline/history/replay và worker an toàn đã đạt; migration 0006 đã áp dụng, không chạy lại. 205/205 tests, 23 HTTP/DB thật rollback, 3 ca cạnh tranh nhiều kết nối, typecheck/build/startup đạt. FE-T07 giao AI frontend. **Tiếp T08**, đồng bộ API/UI theo cùng planId/versionId, không nối calculate legacy tự đổi current. Xem PROGRESS.md và docs/PLANS.md; đoạn T06 trở xuống là lịch sử.

**Checkpoint thay thế mới nhất: backend T06.** Engine tháng Decimal, ghép hồ sơ/nợ/pension/cấu hình, solver/thanh khoản, API preview chỉ đọc đã đạt 193/193 tests và 13 kiểm tra HTTP/DB thật rollback. Typecheck/build đầy đủ/startup guard đạt; không migration. FE-T06 đã giao trong task-frontend.md. **Bước tiếp T07 snapshot bất biến, tách create/preview/apply, sửa worker trước khi nối**; xem PROGRESS.md cho bằng chứng và giới hạn. DB hiện có T03/T04 công bố và 50 hồ sơ v2, không còn đúng ghi chú trống buổi sáng. Các checkpoint dưới giữ làm lịch sử.

**Checkpoint thay thế mới nhất: backend T05.** Đã có khai báo lương hưu, lưu/đọc hồ sơ v2, preview tháng, tra tuổi tham chiếu theo phụ lục chính thức; 167/167 tests và 13 kiểm tra HTTP/DB thật rollback đạt. Không migration, không đổi frontend; FE-T05 đã ghi trong `docs/task-frontend.md`. Bước tiếp T06 engine tháng cá nhân. Biên dịch TypeScript đạt; build đầy đủ còn EPERM ở Prisma DLL Windows, xem PROGRESS.md. Đoạn T04 bên dưới giữ làm lịch sử.

Checkpoint mới nhất: backend **T04** đã có chính sách rủi ro sáu chiều, danh mục/lịch tái cân bằng/ba kịch bản gắn bộ T03 đã duyệt, kiểm chứng HTTP/PostgreSQL thật bằng fixture rollback. Không migration hoặc công bố cấu hình mẫu vào DB thật; kế hoạch hiện có giữ nguyên. UI, cấu hình nghiệp vụ production, quỹ cá nhân T06 và apply T07–T08 còn mở. **Bước tiếp T05**, xem đầu PROGRESS.md; đoạn T01/T02 dưới đây là mốc trước.

Thực hiện phần backend của T00–T12 theo [task.md](../docs/task.md). Chỉ đạo tiếp theo ngày 04/10: bắt đầu T01 trước khi hoàn tất T00 và dùng DB thật đang cấu hình. Backend hồ sơ v2/migration T01 và lịch vay/preview T02 đã được triển khai, kiểm chứng PostgreSQL thật; frontend v2 chưa nối. T02 lưu hợp đồng trong JSON v2, không thêm migration. Bước tiếp: T03 bộ giả định theo năm có nguồn/version; nối dòng tiền nợ vào engine hưu trí tại T06. Bảng nhận việc ở mục 7 của task.md là phạm vi hiện tại; bằng chứng nằm tại [PROGRESS.md](PROGRESS.md).

Các phần B00–B12 bên dưới được giữ làm lịch sử thiết kế ngày 02/10, không thay thế kế hoạch nghiệm thu mới. Các chỉ dẫn cũ về chờ khảo sát, 14 phase UI, tư vấn chuyên viên, publish tự tính lại/chọn bản chính, và BHXH demo không còn áp dụng. Chỉ Q13/Q15 còn trao đổi; các yêu cầu còn lại triển khai theo task.md. SMTP/Nodemailer là dịch vụ email hiện tại. Theo chỉ đạo dùng DB thật, chỉ áp dụng migration đã kiểm tra trạng thái/checksum và dữ liệu; không reset hoặc gửi email thật.

Ngày lập: 02/10/2026. Đây là kế hoạch tham chiếu; trạng thái triển khai và bằng chứng kiểm tra cập nhật tại `PROGRESS.md`.

Căn cứ: `info.md`, `task.md` và mã nguồn backend/frontend hiện có. Định hướng đã xác nhận: production, có khả năng mở rộng cao. Tiếp tục nền Express + TypeScript + Prisma/PostgreSQL + JWT + Socket.IO + Resend + Cloudinary, triển khai Azure theo cấu hình hiện tại.

## 1. Hiện trạng và khoảng trống

| Thành phần | Đã có trong mã nguồn | Công việc còn thiếu |
| --- | --- | --- |
| HTTP server | Express, Helmet, CORS, health, xử lý lỗi | Router nghiệp vụ, chuẩn request/response, kiểm tra cấu hình, readiness |
| Database | Prisma schema cho user, hồ sơ, simulation, tracking, tư vấn, bài viết, đối tác, giả định, audit | Chưa có thư mục migrations trong repo; thiếu draft, goal/plan có phiên bản, dòng tiền chi tiết, support, AI, notifications, consent |
| Auth | Middleware kiểm tra JWT, hai role USER/ADMIN, bảng token | Chưa có đăng ký/đăng nhập/refresh/reset/verify; chưa kiểm tra trạng thái user và thu hồi phiên |
| Tài chính | `services/financialEngine.ts` và 3 unit test | Validation tiền, số học thập phân, mức tích lũy cần thiết, chuỗi dữ liệu biểu đồ, nguồn giả định, phiên bản công thức |
| Realtime | Socket.IO, room user/admin/tư vấn, hàm phát sự kiện | Kiểm tra quyền vào room tư vấn, hết hạn/thu hồi token khi đang kết nối, phát sự kiện giữa nhiều instance |
| Email/media | Resend gửi OTP/xác nhận tư vấn; upload ảnh Cloudinary | Luồng nghiệp vụ gọi service, retry, trạng thái gửi, template reset, xác thực upload, tệp riêng tư |
| Kiểm thử | Vitest, Supertest; 6 test đang pass; typecheck pass | Test API với PostgreSQL thật, ownership, concurrency, token lifecycle, Socket.IO client và tải |
| CI/CD | Workflow backend, Dockerfile, tài liệu Azure | Migration release job, staging, artifact cố định, kiểm thử triển khai, rollback và cấu hình nhiều instance |

Kết quả kiểm tra ngày lập: `npm run typecheck` và `npm run test` trong backend đều thành công, 2 test file / 6 test. Chưa kiểm tra database chạy thật, gửi email thật, upload thật hoặc môi trường Azure. Các test hiện có chưa chứng minh phân quyền hay nghiệp vụ production hoạt động.

Các điểm phải xử lý sớm theo mã nguồn:

- `config/socket.ts`: khách chưa đăng nhập cũng có thể phát `join:consultation` với ID bất kỳ. Chặn trước khi phát dữ liệu tư vấn thật.
- `authMiddleware.ts`: có secret dự phòng; chưa kiểm tra tài khoản bị khóa; token không hợp lệ đang trả 403 thay vì 401. `requireRole` cho ADMIN vượt qua yêu cầu USER, cần thay bằng policy rõ ràng theo endpoint.
- `financialEngine.ts`: phần BHXH là công thức đơn giản, không đủ bằng chứng để coi là bộ tính quyền lợi production. Hàm validation chưa kiểm tra tiền/BHXH và hàm tính đang tự kẹp dữ liệu sai.
- Frontend hiện vẫn cho sửa lạm phát/lợi suất ở mục tiêu/mô phỏng, trái với `info.md` và `task.md` mới. Phải thay khi nối API.
- `MonthlyTracking` mới lưu target/actual, chưa lưu các khoản thu–chi tạo ra actual.
- `.env.example` dùng cổng frontend 5173 trong khi Vite dùng 8443; mật khẩu database ví dụ không khớp Compose. Đồng bộ cấu hình local.

## 2. Quy tắc nghiệp vụ cố định

1. Chỉ có `USER` và `ADMIN`. Người phụ trách tư vấn là ADMIN; permissions có thể bổ sung bên trong ADMIN.
2. USER không được ghi `inflationRate`, `annualInflationRate`, `investmentReturn`, `annualReturnRate`, phiên bản giả định hoặc kết quả tính toán. Backend từ chối các trường này trong DTO ghi dữ liệu, kể cả trường lồng trong JSON.
3. Lạm phát/lợi suất do backend xác định từ bộ giả định đã phát hành và quy tắc danh mục theo tuổi/khẩu vị rủi ro đã được nghiệp vụ xác nhận. Trả căn cứ và phiên bản để frontend hiển thị thẻ thông tin.
4. Simulation chỉ thay các đầu vào được phép: tuổi nghỉ hưu, tích lũy tăng thêm mỗi tháng, chi tiêu khi nghỉ hưu. Chưa xác nhận áp dụng thì không đổi kế hoạch chính.
5. Tiết kiệm thực tế = tổng thu nhập thực tế − tổng chi tiêu thực tế; giữ nguyên số âm. Không nhận `actualAmount` hoặc `status` do client tự tính.
6. Ngưỡng tracking lấy đúng tài liệu: `ON_TRACK` khi actual ≥ target; `NEEDS_ATTENTION` khi 80% ≤ actual/target < 100%; `BEHIND_PLAN` khi dưới 80% hoặc actual âm. Không làm tròn tỷ lệ trước khi phân loại.
7. AI giải thích kết quả từ backend và hỗ trợ tạo bản mô phỏng. Áp dụng thay đổi vẫn cần thao tác xác nhận của USER qua API nghiệp vụ.
8. Công thức, nguồn dữ liệu và giả định production cần được nghiệp vụ xác nhận. Dữ liệu demo không được seed thành benchmark production.
9. Giữ phạm vi nền tảng lập kế hoạch; không thêm giao dịch, ví, mua bảo hiểm hoặc giao dịch chứng khoán.

`task.md` là kế hoạch thiết kế UI 14 phase. Kế hoạch backend bên dưới giữ nguyên phạm vi màn hình nhưng sắp thứ tự theo phụ thuộc dữ liệu: đưa cấu hình tài chính lên trước bộ tính và dashboard, đưa knowledge base trước trợ lý AI.

## 3. Cấu trúc triển khai

Giữ `app.ts`, `server.ts`, `config/`, `middlewares/`, `services/` đang có; bổ sung theo từng module, không tạo lại dự án.

```text
backend/
  prisma/
    schema.prisma
    migrations/
    seed.ts                         # fixture dev/test; production không có tài khoản mẫu
  src/
    config/env.ts                   # kiểm tra biến môi trường qua Zod
    common/                         # AppError, pagination, money, requestId, asyncHandler
    modules/
      auth/ users/ profiles/ financial-config/
      plans/ simulations/ cashflows/ dashboard/
      consultations/ content/ partners/ support/
      notifications/ account/ reports/ settings/ ai/
    services/                       # financial engine, email, socket và adapter dùng chung
    jobs/                           # outbox, gửi mail, PDF, reindex, recalculation
    worker.ts                       # tiến trình chạy tác vụ nền độc lập API
    tests/                          # unit, integration, contract, realtime
  docs/openapi.yaml
```

Mỗi module có routes, schema Zod, controller, service và repository khi cần query phức tạp. Controller xử lý HTTP; service giữ quy tắc nghiệp vụ và transaction; Prisma không được gọi trực tiếp từ frontend hoặc controller để bỏ qua service. Với Express 4 hiện tại, bọc async handler để lỗi Promise đi vào error middleware.

API nghiệp vụ dùng `/api/v1`. Giữ các endpoint health hiện có; bổ sung `/health/live` và `/health/ready`. REST là nguồn dữ liệu chính; Socket.IO thông báo thay đổi sau commit, client nhận event rồi đọc lại API nếu cần.

## 4. Kế hoạch điều chỉnh dữ liệu

Thêm migration theo module. Trước migration đầu tiên, kiểm tra database đích có dữ liệu/bảng chưa: database mới dùng initial migration; database đã có schema cần baseline. Không reset database để làm khớp schema.

| Nhóm | Điều chỉnh / model dự kiến | Ràng buộc chính |
| --- | --- | --- |
| User/Auth | Bổ sung `lastActiveAt`, `securityVersion`; mở rộng refresh/verification token | Email chuẩn hóa + unique; lưu hash token; hạn dùng, số lần thử, consumed/revoked, refresh family |
| Profile | Giữ `FinancialProfile.profileData` JSONB với Zod schema version; thêm `revision`, `completedAt`, `asOfDate`; thêm `OnboardingDraft` | Một profile và một draft/user; draft cho thiếu trường; complete phải đủ trường |
| Goal | Thêm `RetirementGoal` | Chỉ chứa đầu vào USER được phép; revision; một mục tiêu đang dùng theo phạm vi hiện tại |
| Assumptions | Thêm `FinancialModelVersion`, `AssumptionSetVersion`, policy phân bổ tài sản | Trạng thái draft/published/retired; ngày hiệu lực, nguồn, lý do, người thay đổi; bản published bất biến |
| Plan | Thêm `RetirementPlan`, `PlanVersion`; profile giữ summary như dữ liệu dẫn xuất nếu cần | Input snapshot, kết quả, chart series, asOfDate, model/assumption version; một current version/plan |
| Simulation | Mở rộng `SimulationScenario`: expense, additionalMonthlySavings, baselinePlanVersionId, appliedPlanVersionId | Rate hiện có chỉ là snapshot do server ghi; không phải input USER |
| Cashflow | Mở rộng `MonthlyTracking` hoặc đổi tên bằng migration bảo toàn dữ liệu; thêm các trường thu/chi, updatedAt, revision, targetPlanVersionId | Unique user + YYYY-MM; actual/status dẫn xuất; target tháng giữ phiên bản lịch sử |
| Consultation | Dùng bảng hiện có, bổ sung lịch sử trạng thái; tách ghi chú nội bộ khi cần | assignedAdminId phải trỏ ADMIN hợp lệ; SCHEDULED phải có appointmentAt |
| Content | Mở rộng Article với content type, hidden, publishedAt; Category | Article/video/FAQ/glossary; slug unique; publish yêu cầu dữ liệu đầy đủ |
| Partner/Product | Thêm active/visibility, fees, conditions, disclosure | Chỉ đọc công khai sản phẩm hợp lệ của đối tác đang hoạt động |
| Support/Notifications | Ticket, TicketMessage, Notification, NotificationPreference, NotificationTemplate, DeliveryAttempt | Tách ghi chú nội bộ khỏi tin nhắn user; trạng thái gửi/read bền vững |
| Account/Reports | ConsentRecord, ExportJob, MediaAsset; yêu cầu xóa dữ liệu nếu bật chức năng trên UI | Phiên bản chính sách, chủ sở hữu, tệp riêng tư và hạn tải |
| AI | Conversation, Message, KnowledgeSource, KnowledgeRevision, PromptVersion, AIUsage | Ownership, nguồn được phép, trạng thái indexing, model/prompt version, token/cost metadata |
| Operations | SystemSetting có schema; AuditLog mở rộng; OutboxEvent, ProcessedEvent | Audit cùng transaction thay đổi; sự kiện có ID duy nhất, consumer chống xử lý lặp |

Quy ước chung: tiền dùng PostgreSQL Decimal và thư viện tính thập phân; JSON/API truyền chuỗi số thập phân, kèm `currency: VND`. Chuẩn hóa tỷ lệ là phần trăm/năm với tên trường rõ ràng. Không chuyển về JS number trước tính toán; frontend chỉ chuyển sang number khi vẽ/hiển thị trong miền cho phép. Lưu timestamp UTC; kỳ tháng và lịch hiển thị theo `Asia/Ho_Chi_Minh`.

Index ưu tiên: userId + createdAt; userId + period; status + createdAt; consultation assignedAdminId + appointmentAt; planId + version; publishedAt/category; audit targetType + targetId + createdAt. Không thêm GIN cho mọi JSONB; chỉ thêm theo query thực tế.

## 5. Các phase code theo thứ tự

### B00 — Củng cố nền API và hợp đồng tích hợp

- Thêm env validation, request ID, logger có che dữ liệu nhạy cảm, error code thống nhất, 404 JSON, pagination/sort allowlist và asyncHandler.
- Loại secret dự phòng ở production; đồng bộ CORS HTTP/socket và cấu hình local; cấu hình trust proxy theo đường đi thực tế.
- Sửa ngay quyền `join:consultation`; khi module tư vấn chưa tồn tại thì từ chối join room riêng tư. Guest chỉ được nhận sự kiện công khai không có dữ liệu cá nhân.
- Chốt tiền dạng decimal string, ngày ISO, role uppercase; frontend có adapter cho role lowercase hiện tại.
- Thêm OpenAPI và test contract. Tách liveness/readiness; readiness kiểm tra phụ thuộc bắt buộc có timeout.
- CI chạy từ working-directory backend, `npm ci`, generate Prisma trước typecheck/build; test migration với PostgreSQL tạm.

Nghiệm thu: secret thiếu làm startup production thất bại; request sai trả lỗi có cấu trúc; guest không vào room riêng tư; health phân biệt được database lỗi. Không đổi giao diện hoặc xóa phần setup đã có.

### B01 — Migrations nền, audit và tác vụ nền

- Tạo migration nền cho schema hiện có và các bảng auth/draft/goal/version/outbox cần ở B02–B04; các bảng khác thêm ở phase tương ứng.
- Tạo seed dev/test có hai role; bootstrap admin production bằng thao tác vận hành riêng, không có mật khẩu mẫu trong seed.
- Xây audit service; outbox được ghi cùng transaction nghiệp vụ. Worker phát sự kiện/gửi email có retry, backoff, trạng thái lỗi và khóa xử lý.
- Hướng production trên Azure: adapter Azure Service Bus; local/test dùng adapter giả lập hoặc test resource riêng. Không gọi dịch vụ thật trong unit test.
- Chỉ đưa eventId/entityId/revision và dữ liệu tối thiểu vào queue. Consumer kiểm tra idempotency và trạng thái mới nhất trước side effect.

Nghiệm thu: database trắng dựng được từ migrations; rollback transaction không tạo event; worker chết rồi chạy lại không làm lặp thay đổi nghiệp vụ. Service Bus hỗ trợ queue và dead-letter, nhưng vẫn phải xử lý lặp ở ứng dụng. [Tài liệu Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-messaging-overview).

### B02 — Xác thực, phiên đăng nhập và tài khoản cơ bản

API: `POST /auth/register`, `/verify-email`, `/resend-verification`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`; `GET /auth/me`; `POST /auth/logout-all`.

- Dùng bcryptjs hiện có với giới hạn độ dài theo byte phù hợp; không trim mật khẩu. Register chỉ tạo USER, bỏ khả năng client chọn role/status.
- Access JWT ngắn hạn; refresh token xoay vòng, chỉ lưu hash, có revoke/family và phát hiện reuse. Access giữ trong bộ nhớ frontend; refresh trong cookie HttpOnly/Secure, kiểm tra Origin/CSRF và cấu hình SameSite theo domain triển khai.
- Kiểm tra issuer/audience/algorithm, token payload, user ACTIVE và securityVersion. Khóa tài khoản/đổi mật khẩu thu hồi phiên và ngắt socket hiện hữu.
- OTP/reset dùng một lần, có hạn và giới hạn lần thử; OTP ngắn lưu HMAC với secret phía server, không dùng hash không khóa dễ dò. Giới hạn theo IP và tài khoản.
- Resend xử lý qua outbox; API không báo đã giao email chỉ vì tạo job. Email reset dùng token đủ entropy; không log token.
- `401` cho phiên không hợp lệ, `403` cho thiếu quyền. Admin đọc dữ liệu user qua admin route có policy/audit, không bypass ownership toàn hệ thống.

Nghiệm thu: register → verify → login → refresh → logout; email trùng; OTP hết hạn/dùng lại; refresh race; reset token reuse; user bị khóa còn JWT cũ; user sửa role trong body không có tác dụng.

### B03 — Hồ sơ tài chính và onboarding lưu nháp

API: `GET/PATCH /me`, `GET/PATCH /me/financial-profile`, `GET/PUT /me/onboarding-draft`, `POST /me/onboarding/complete`.

- Validation từng nhóm personal/income/expenses/assets/debt/socialSecurity; phân biệt chưa nhập với số 0.
- Lưu nháp từng bước và resume đa thiết bị. Dùng revision/If-Match để tránh tab cũ ghi đè tab mới.
- Hoàn tất onboarding trong transaction: kiểm tra đủ dữ liệu → ghi profile → tạo revision/audit/event → xóa draft sau khi ghi thành công.
- Tách tài sản ròng khỏi tài sản có thể chi cho hưu trí; không gộp nhà ở với quỹ thanh khoản hoặc tính trùng khoản nợ.
- Không nhận summary hoặc kế hoạch do client tự tính. JSONB được validate và merge theo trường được phép, không spread toàn bộ body vào database.

Nghiệm thu: lưu/tải lại không mất dữ liệu; hồ sơ hai user tách biệt; dữ liệu không hợp lệ không xóa draft; xung đột trả 409; onboarding không dùng số tích lũy demo khi thặng dư bằng 0 hoặc âm.

### B04 — Giả định chuẩn hóa, mục tiêu và bộ tính kế hoạch

API USER: `GET /financial-benchmarks`, `GET/PUT /me/retirement-goal`, `POST /me/plans/calculate`, `GET /me/plans/current`, `GET /me/plans/:id/versions`.

API trang chủ: `POST /public/retirement-preview`, dùng cùng engine và benchmark published, đầu vào tối giản và rate limit riêng. Không lưu hồ sơ khách, không nhận macro override; nếu thiếu đầu vào cho bản tính đầy đủ thì hiển thị rõ các giả định của bản tính thử.

API ADMIN: `GET/POST /admin/financial-config/versions`, `PATCH /admin/financial-config/versions/:id`, `POST /admin/financial-config/versions/:id/preview-impact`, `/publish`, `GET /admin/financial-config/history`.

- Hoàn thiện financialEngine thành hàm thuần, tách `resolveAssumptions()` và adapter BHXH; validate trước khi tính, không âm thầm sửa input sai.
- Benchmark đọc bộ published có hiệu lực; resolve theo tuổi/risk policy đã duyệt. Nếu chưa có cấu hình hợp lệ, trả trạng thái chưa thể tính, không fallback dữ liệu mẫu.
- Bổ sung mức tích lũy bắt buộc mỗi tháng bằng bộ giải số có điều kiện hội tụ; tách `requiredMonthlySavings`, `plannedMonthlyContribution`, `availableMonthlySurplus` và actual cashflow.
- Tính cả bảng thời gian tích lũy/rút tiền cho biểu đồ từ cùng engine; quy ước thời điểm đóng/rút, lãi suất thực/danh nghĩa, làm tròn, cạn quỹ được ghi trong model version.
- BHXH phải có dữ liệu đầu vào, nguồn và phiên bản quy tắc đã kiểm chứng. Khi chưa đủ, trả trạng thái chưa ước tính được hoặc kịch bản không tính BHXH được ghi rõ; không gọi công thức hiện tại là quyền lợi chính thức.
- Mỗi lần tạo plan lưu snapshot đầu vào, profile/goal revision, model/assumption version và asOfDate. Chọn current version trong transaction, có kiểm tra revision nguồn.
- Admin chỉnh bản draft; publish có lý do, diff old/new và xác nhận. Công thức là mã đã kiểm thử, admin chọn version đã triển khai; không cho nhập JavaScript/SQL để chạy tùy ý.
- Publish benchmark mới tạo job tính lại theo batch thành phiên bản mới; giữ lịch sử và user overrides được phép. Job dựa trên nguồn cũ không được ghi đè kế hoạch user vừa sửa.

Nghiệm thu: body chứa macro override bị từ chối cả trường lồng; cùng snapshot/version tạo cùng kết quả; golden test đối chiếu bộ mẫu nghiệp vụ độc lập; giá trị summary khớp chart; benchmark mới không viết lại lịch sử.

### B05 — Mô phỏng và áp dụng kịch bản

API: `POST /me/simulations/preview`, `GET/POST /me/simulations`, `GET/DELETE /me/simulations/:id`, `POST /me/simulations/:id/apply`.

- Request dùng `additionalMonthlySavings`; server tính contribution tuyệt đối từ baseline + phần tăng thêm. Không nhầm phần tăng thêm với tổng tích lũy.
- So sánh dùng cùng snapshot benchmark/model/asOfDate của baseline; chỉ thay ba đòn bẩy được phép.
- Preview không đổi kế hoạch; save lưu kịch bản. Apply yêu cầu baselinePlanVersionId và idempotency key, cập nhật goal/contribution và tạo plan version trong transaction.
- Nếu baseline đã đổi, trả 409 yêu cầu tính lại/xác nhận bản mới; không áp dụng kết quả cũ vào dữ liệu mới.

Nghiệm thu: preview không có side effect; user không đọc/áp dụng scenario người khác; retry apply không tạo hai plan; benchmark không thể bị chỉnh bằng client hoặc AI.

### B06 — Thu–chi thực tế, tracking và dashboard USER

API: `GET /me/cashflows`, `GET/PUT/DELETE /me/cashflows/:period`, `GET /me/tracking/summary`, `GET /me/dashboard`.

- Lưu thu nhập chính/phụ/thưởng/khác, chi thiết yếu/nâng cao và ghi chú. Các khoản đầu vào không âm; net cashflow có thể âm.
- Unique tháng/user và optimistic concurrency; server tính tổng, net, chênh lệch và status theo mục 2.
- Target tháng gắn plan version hiệu lực tại đầu tháng; thay mục tiêu mặc định áp dụng từ tháng kế tiếp, không sửa lịch sử. Đây là quy tắc đề xuất cần nghiệp vụ xác nhận trước B06.
- Chưa có kế hoạch hoặc target chưa xác định: trả `status: null` cùng lý do, không mặc định ON_TRACK. Target = 0: actual ≥ 0 là ON_TRACK, actual < 0 là BEHIND_PLAN, tỷ lệ null để tránh chia 0; cần duyệt quy tắc biên này.
- Tháng chưa nhập trả missing/null, không biến thành thu–chi bằng 0. Cumulative actual nêu rõ phạm vi tháng đã ghi nhận; cumulative target đủ các tháng trong khoảng và trả coverage để không gây hiểu nhầm.
- Cashflow tích lũy không tự động cộng vào số dư tài sản trong profile, tránh tính hai lần; thay đổi tài sản cần nghiệp vụ cập nhật số dư riêng.
- Dashboard kết hợp profile, plan version, tracking, hoạt động và đề xuất; chỉ rõ asOfDate/data freshness, trạng thái chưa hoàn tất onboarding/chưa có kế hoạch.

Nghiệm thu: biên 79.99%, 80%, 99.99%, 100%; actual âm; target 0; tháng thiếu dữ liệu; cập nhật cùng tháng không tạo bản ghi trùng; chart và bảng cùng nguồn.

### B07 — Quản trị người dùng và tư vấn

API: `GET /admin/dashboard`, `GET /admin/users`, `GET /admin/users/:id` và các tài nguyên profile/goal/plans/activity/support; `PATCH /admin/users/:id/status`; `POST/GET /me/consultations`; `GET/PATCH /admin/consultations/:id`, `GET /admin/consultations`.

- Search/filter/sort/pagination phía database; không trả hồ sơ thay thế khi ID không tồn tại.
- Khóa/mở user có lý do/audit và tác động đến auth/socket. Thông tin nhạy cảm chỉ trả theo permission và nhu cầu hỗ trợ.
- Workflow tư vấn NEW → PROCESSING → SCHEDULED → COMPLETED, hoặc CANCELLED; mọi chuyển trạng thái kiểm tra tiền điều kiện. SCHEDULED bắt buộc thời điểm, múi giờ và admin phụ trách.
- Kiểm tra xung đột lịch nếu sản phẩm quy định thời lượng; không tự phát minh độ dài buổi tư vấn. Ghi chú nội bộ không đi vào response USER.
- Room tư vấn chỉ cho chủ yêu cầu hoặc ADMIN có quyền; phát event sau commit, email xác nhận theo trạng thái thật.

Nghiệm thu: USER không vào admin; ID sai trả 404; status transition sai bị chặn; khóa user có hiệu lực với phiên cũ; guest/user khác không nhận event tư vấn.

### B08 — Nội dung, đối tác, giải pháp và media

API đọc: `GET /content`, `/content/:slug`, `/categories`, `/partners`, `/products`, `/products/:id`. ADMIN CRUD tương ứng dưới `/admin`; `POST /media/images`.

- Article/video/FAQ/glossary dùng content type; quản lý category, draft/publish/hide; sanitize nội dung rich text.
- Publish kiểm tra title/slug/body hoặc video source, category và metadata cần thiết; user chỉ đọc published.
- Sản phẩm có fees/conditions/risk/disclosure/visibility/status, và bị ẩn nếu đối tác ngừng hoạt động.
- Reuse Cloudinary cho ảnh công khai: kiểm tra quyền, MIME/nội dung tệp, dung lượng, tên file, ownership và xóa asset mồ côi.
- Báo cáo tài chính và tài liệu cá nhân dùng storage riêng tư; không đặt vào luồng ảnh công khai Cloudinary hiện có.

Nghiệm thu: bài nháp không xuất hiện ở explore; không publish nội dung rỗng; bộ lọc trả đúng dữ liệu; ẩn đối tác có hiệu lực phía user; upload trái quyền bị chặn.

### B09 — Hỗ trợ, thông báo, tài khoản và xuất báo cáo

API: `/me/tickets`, `/me/tickets/:id/messages`, `/admin/tickets`; `/me/notifications`, `/me/notifications/:id/read`, `/admin/notification-templates`; `/me/preferences`, `/me/consents`, `/me/password`, `/me/sessions`; `POST /me/reports`, `GET /me/reports/:id`.

- Ticket có lịch sử trao đổi và trạng thái; admin có ghi chú nội bộ tách biệt. Không trộn ticket với lịch tư vấn.
- Notification lưu database trước khi emit; read/unread theo user; preference kênh/tần suất được áp dụng khi gửi.
- Resend retry có giới hạn, lưu provider message ID và trạng thái queued/sent/failed; phân biệt accepted với delivered. Escape dữ liệu người dùng trong template email hiện có.
- Đổi mật khẩu cần mật khẩu hiện tại hoặc luồng reset hợp lệ; thu hồi phiên theo chính sách. Chỉ bật điều khiển MFA khi backend có enrollment/challenge/recovery thật.
- Report PDF chạy worker, lấy đúng snapshot plan version, có tiếng Việt/font và assumptions; file riêng tư, link tải hạn ngắn, kiểm tra ownership. Reuse snapshot cho export dữ liệu cá nhân.
- Consent có policy version và thời điểm đồng ý/rút lại. Nếu nối nút xóa tài khoản hiện có, xử lý xóa/ẩn danh theo chính sách đã duyệt, bao gồm file, chat, queue và phục hồi backup.

Nghiệm thu: offline vẫn đọc lại notification; không trùng email do retry thông thường; xử lý trường hợp provider timeout chưa rõ đã gửi; USER không đọc ticket/report người khác; báo cáo khớp plan snapshot.

### B10 — Knowledge base và trợ lý AI

API ADMIN: `/admin/ai/sources`, `/admin/ai/sources/:id/reindex`, `/admin/ai/prompts`, `/admin/ai/config`, `/admin/ai/usage`. USER: `/me/ai/conversations`, `/me/ai/conversations/:id/messages`.

- Tạo interface AIProvider; model/provider cụ thể chốt bằng kiểm thử tiếng Việt, dữ liệu và chi phí. Chưa có SDK AI trong backend hiện tại.
- Knowledge source có nguồn, phiên bản, ngày hiệu lực, loại tài liệu, trạng thái upload/scan/index/ready/failed; chỉ nguồn được duyệt mới tham gia trả lời.
- Ingestion chạy worker; lưu tài liệu riêng tư; chống URL nội bộ/SSRF và giới hạn kích thước. Vector search chỉ bổ sung khi cần RAG; kiểm tra hỗ trợ pgvector của database đích trước migration.
- AI lấy context bằng service có ownership: hồ sơ, current plan, cashflow và nguồn kiến thức; không có quyền query database tùy ý.
- Tool mô phỏng gọi cùng SimulationService và schema USER; AI không đặt lạm phát/lợi suất hay tự apply kế hoạch.
- Trả text/metric/chart/action/source có schema; metric và chart lấy từ engine, không dùng con số do model tự tạo. Lưu prompt/model/source/plan versions.
- Streaming qua Socket.IO gắn conversationId/messageId, lưu trạng thái để resume/refetch; quota người dùng, timeout, cancel, token budget và giới hạn concurrency.

Nghiệm thu: không rò context giữa hai user; chống prompt injection từ tài liệu; nguồn bị ẩn không còn được truy hồi; model lỗi không làm hỏng kế hoạch; câu hỏi mô phỏng không thay current plan.

### B11 — Báo cáo quản trị và cài đặt hệ thống

API: `/admin/reports/*`, `/admin/settings/general`, `/integrations`, `/notifications`, `/privacy`, `/security`, `/audit-logs`; export reports qua job.

- Chốt định nghĩa total/new users, completed profiles, current plans, AI usage, open tickets; dashboard và báo cáo dùng cùng truy vấn/aggregate và khoảng ngày.
- Phân biệt tài khoản có kế hoạch với số plan versions, tránh tăng KPI mỗi lần tính lại.
- Settings dùng Zod schema và version; secret tích hợp nằm trong secret manager, admin UI chỉ nhận trạng thái masked/configured/error và thao tác kiểm tra kết nối được phép.
- Privacy/retention phải được worker thực thi; chế độ bảo trì thực sự chặn thao tác ghi tương ứng. Audit có filter/pagination, tài khoản ứng dụng không được sửa lịch sử tùy ý.
- Aggregate/cache báo cáo có thời điểm cập nhật; chạy job nặng ngoài API và tránh query toàn bộ JSONB mỗi request.

Nghiệm thu: đổi khoảng ngày làm dữ liệu thay đổi đúng; KPI khớp dashboard; setting lưu bền và tác động thực tế; secret không xuất hiện trong API/log/export.

### B12 — Tích hợp frontend và nghiệm thu production

- Nối từng màn hình đã có qua API client; thay dữ liệu demo/localStorage bằng dữ liệu server. Giữ demo trong chế độ rõ ràng, không tự nhập mẫu thành hồ sơ production.
- Xóa điều khiển ghi macro trong U05/U07, thay bằng benchmark card; đổi frontend dùng chart/summary từ server; thêm form thu–chi theo tài liệu mới.
- Kiểm thử user journey đầy đủ, phân quyền, failover/tác vụ nền và tải trước phát hành.
- Cấu hình nhiều API instance, worker độc lập, PostgreSQL dự phòng/private networking, secret manager, giám sát và phục hồi backup phù hợp Azure.
- Bổ sung shared rate-limit store; Socket.IO có adapter truyền event giữa instance. Khi dùng long-polling cần session affinity; nếu chọn WebSocket-only phải kiểm thử khả năng kết nối client. [Hướng dẫn Socket.IO nhiều node](https://socket.io/docs/v4/using-multiple-nodes/).
- CI build artifact một lần, migration bằng release job có quyền riêng, deploy staging → smoke test → production, rollback về artifact trước; database migration tương thích cả phiên bản đang chạy và phiên bản mới.
- Sửa các khoảng trống deployment hiện có: Prisma CLI phải có phiên bản cố định ở bước migrate/generate; không để `npx` tải major bất định sau prune; không chạy migrate ở mỗi API replica; không coi tài liệu B1/F1/Burstable hiện tại là bằng chứng đáp ứng tải production.
- Kiểm tra dependency/security trước release và lên PR nâng cấp tương thích nếu cần; không thay framework chỉ để khớp kế hoạch cũ.

Nghiệm thu: đăng ký → verify → onboarding → goal → plan → simulation → apply → cashflow → dashboard → report chạy thật; hai API instance đồng bộ event/quota; restore thử thành công; không có endpoint báo thành công khi chỉ mô phỏng.

## 6. Quy ước API và tính nhất quán

- Thành công: `{ data, meta?: { requestId, pagination, asOfDate } }`; lỗi: `{ error: { code, message, fieldErrors? }, requestId }`. Không trả stack, passwordHash, token hash, secret hay nội dung nội bộ.
- Zod `.strict()` cho DTO và object con; validation trường chéo về tuổi, kỳ tháng, tiền và lịch hẹn. Lỗi input 400; auth 401/403; không thấy 404; revision conflict 409; rate limit 429.
- Tiền và tỷ lệ trả decimal string. Chưa có dữ liệu trả null/trạng thái thiếu dữ liệu thay cho số 0 giả.
- `userId` lấy từ phiên xác thực; không tin body/query. Truy vấn resource user luôn ràng buộc cả id và userId. ADMIN có route/policy riêng.
- Idempotency cho apply simulation, complete onboarding, tạo export và các lệnh có side effect cần chống gửi lại; key được scope theo user/endpoint và hash payload, khác payload trả conflict.
- Event có eventId, type, entityId, revision, occurredAt. Frontend bỏ qua revision cũ; reconnect đọc lại REST. Socket không phải nơi lưu thông báo duy nhất.
- Khi profile/goal thay đổi, plan cũ được đánh dấu stale. Chỉ dùng kết quả current khi khớp revision nguồn; job cũ không thay current pointer sau thay đổi mới.

## 7. Mapping phạm vi sản phẩm → backend

| Phạm vi `task.md` | Module/phase backend |
| --- | --- |
| Phase 1 — Foundation | B00–B01 |
| Phase 2 — Landing/Auth | B02; endpoint tính thử công khai dùng engine B04, hạn tải và không nhận macro override |
| Phase 3 — Onboarding | B03 |
| Phase 4 — Dashboard | B06, phụ thuộc B04 |
| Phase 5 — Goal/Plan | B04 |
| Phase 6 — Simulation/Tracking | B05–B06 |
| Phase 7 — AI | B10 |
| Phase 8 — Explore/Account | B08–B09 |
| Phase 9 — Admin Core | B07 và KPI hoàn thiện B11 |
| Phase 10 — Consultations/Content/Partners | B07–B08 |
| Phase 11 — Admin AI/Financial Config | B04 và B10 |
| Phase 12 — Support/Reports/Settings | B09–B11 |
| Phase 13–14 — Responsive/Final Audit | B12 kiểm tra tích hợp, không tạo thêm nghiệp vụ |

## 8. Kiểm thử bắt buộc theo rủi ro

| Nhóm | Bộ kiểm thử cần có |
| --- | --- |
| Auth | Token sai/hết hạn/reuse, đổi mật khẩu, khóa user, nâng quyền, refresh đồng thời, cookie/CSRF |
| Ownership | Dùng ID user B với token user A trên profile, scenario, cashflow, tư vấn, ticket, chat, report, media và socket room |
| Financial | Bộ golden do nghiệp vụ xác nhận; zero return, input tiền sai, tuổi biên, target 0, thiếu BHXH, cạn quỹ; macro override không được chấp nhận |
| Cashflow | Các ngưỡng 80%/100%, số âm, tháng chưa nhập, target 0, thay kế hoạch giữa tháng, không cộng tiền hai lần |
| Concurrency | Hai tab sửa hồ sơ; apply retry; admin publish trong lúc tính; worker cũ ghi sau worker mới |
| Integrations | Resend/Cloudinary/AI timeout và lỗi; retry/outbox; event lặp; Socket.IO client thật với nhiều instance |
| Database | Chạy migrations từ đầu; nâng từ schema trước; index/query plan; transaction rollback và snapshot consistency |
| E2E | User journey đầy đủ + quản trị publish nội dung/cấu hình + thao tác user nhìn thấy kết quả thật |
| Production | Load test theo RPS/kết nối/job backlog đã chốt; deploy/rollback; backup/restore; hết connection pool; provider bị gián đoạn |

Mỗi phase chỉ được đánh dấu xong khi có migration cần thiết, OpenAPI, test của nghiệp vụ mới, typecheck/build pass và không làm hỏng phase trước. Không dùng số lượng test hoặc trạng thái health để thay cho kiểm chứng nghiệp vụ.

## 9. Backlog mở đầu và các quyết định cần chốt

Thứ tự PR đề xuất cho đợt đầu:

1. B00: env/error/validation/API contract và đóng lỗ hổng socket room.
2. B01: migrations nền, fixtures, audit/outbox, worker skeleton và integration test PostgreSQL.
3. B02a: register/verify/login và email workflow.
4. B02b: refresh/logout/reset/revoke, kiểm tra trạng thái user ở HTTP/socket.
5. B03: onboarding draft/profile, revision và complete transaction.
6. B04a: assumption/model versions + admin publish + benchmark read-only.
7. B04b: engine đã đối chiếu nghiệp vụ + goal/plan/version/chart API.
8. B05–B06: simulation apply, monthly cashflow và dashboard có dữ liệu thật.

Các quyết định chưa được tài liệu xác định đầy đủ; không cản B00–B03 nhưng phải chốt trước phần phụ thuộc:

- Trước B04: công thức production, dữ liệu BHXH, nguồn benchmark, mapping tuổi/khẩu vị rủi ro, policy tuổi thọ; ai xác nhận các kết quả chuẩn.
- Trước B06: thời điểm target tháng có hiệu lực; quy tắc target 0; khoản trả nợ nằm trong chi tiêu nào để tránh trừ hai lần; có cho chỉnh tháng đã chốt không.
- Trước B07: độ dài và chính sách xung đột buổi tư vấn nếu cần kiểm tra lịch.
- Trước B09: yêu cầu MFA, nội dung báo cáo, thời hạn lưu/xóa dữ liệu và quyền admin xem/xuất hồ sơ nhạy cảm.
- Trước B10: AI provider/model, giới hạn chi phí, nguồn kiến thức được phép và cách xử lý dữ liệu gửi provider.
- Trước B12: domain production/staging, tải dự kiến (RPS, số socket đồng thời, tốc độ job), ngân sách, mục tiêu độ sẵn sàng và thời gian/mức mất dữ liệu chấp nhận khi phục hồi.

Không lấy số user đăng ký làm bằng chứng chịu tải. Xác định tải và đo trước khi chốt số instance/pool/queue concurrency. Các bổ sung Service Bus, shared rate-limit store, Socket.IO adapter và storage riêng tư là công việc dự kiến, chưa được cài hoặc provision trong lần lập kế hoạch này.
