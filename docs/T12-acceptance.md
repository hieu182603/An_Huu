# T12 — Bằng chứng nghiệm thu nội bộ, 05/10/2026

## Bằng chứng mới nhất: Gemini và vận hành retention

Mốc này thay trạng thái chưa chọn provider/chưa có retention độc lập ở các bằng chứng lịch sử dưới. P13/P15/sourceChanges đã triển khai theo PROGRESS; UI/browser vẫn chưa nghiệm thu.

| Phần | Kết quả đã chạy | Giới hạn |
| --- | --- | --- |
| Gemini | Developer/gemini-3.8-flash live synthetic smoke PASS ở checkpoint trước; consent v2/strict fact selection | Chưa fine-tuning, chưa browser hoặc hợp đồng/P36 Google |
| Backend hiện tại |295tests/26files +testtypecheck +isolatedbuild/startup PASS | Build mặc định Windows DLL và CIremote còn riêng |
| Retention DB thật | verify-retention-db7checks PASS, scoped IDs, rollback/fingerprint35bảng giữ nguyên; CLI DRY_RUN0eligible/0deleted | Không chạy xóa dữ liệu thật/lịch production |
| Backup/restore mẫu | verify-clean-upgrade: clean10/upgrade4→10,10integration PASS; pg_dump/restore35bảng digest khớp; CLI cleanup expired sau restore PASS không cần SMTP/JWT/Gemini | Không backup production; không giải quyết dữ liệu còn hạn bị xóa sau backup |

Artifact mới `.cache/migration-fd1bd4f2-f2d2-4276-9b06-1627cd76afc7` (trong backend); container tạm đã dọn. Contract [RETENTION_OPERATIONS.md](../backend/docs/RETENTION_OPERATIONS.md). Lịch/giám sát production, backup thật/deletion reconciliation, quyền toàn tài khoản/P36, UI/browser/staging vẫn mở.

> Rà mã sau khi lập kế hoạch P13/P15: đã chạy lại verify-frontend-wire với frontend mới,14writes đúng transport; actual/privacy/explain/delete-all vàknowledgecreate thành công, ca precision sốlớn/0.01 đúng. Artifact frontend-wire-audit.json hiện chứa lần chạy mới; E15 bên dưới là kết quả lịch sử trước sửa. Chưa nghiệm thu14luồng nghiệp vụ vàchưa rerunbrowser; F26/F27 chuyển “đã sửa/kiểm hẹp, chờ hồi quy toàn luồng”. State account đã sửa, chờbrowser; F28save/apply vẫn còn. Admin routes hiện vẫn dùngdemo/localStorage dùserviceAPIđãsửa, F13/F14/F20 UI vẫn mở. Xem đầu task-frontend/PROGRESS.

> Cập nhật nghiệp vụ sau lượt kiểm tra: chủ dự án đã xác nhận P13/P15 theo hướng giải thích, tiền dư chỉ góp số người dùng xác nhận. Kế hoạch Q13-01–03/Q15-01–04 tại `task.md` mục7.1 thay trạng thái chờ khách trong các bằng chứng cũ. **Chưa có kết quả triển khai/nghiệm thu mới cho kế hoạch bổ sung**; các con số kiểm thử phía dưới giữ nguyên lịch sử, không suy đã PASS nhánh API đầu kỳ hoặc lưu reforecast mới.

## Bổ sung sau kiểm tra lại bốn nhóm còn mở

**Kết quả hiện hành:** DB sạch/nâng cấp đã được kiểm chứng và thiếu migration đã sửa; UI chưa đạt. Báo cáo [RECHECK-T00-T10.md](RECHECK-T00-T10.md); giao việc **FE-RECHECK-20261005** ở đầu [task-frontend.md](task-frontend.md). E01–E10 bên dưới giữ lịch sử lần kiểm trước.

| ID | Bằng chứng chạy lại 05/10 | Kết quả và giới hạn |
| --- | --- | --- |
| E11 | verify-clean-upgrade.cjs, PostgreSQL16/pgvector Docker tạm | Clean10 vàprior4→10 PASS, checksum/diff rỗng, giữ legacy fixture;10/10 integration/2files PASS; purge expired/giữ unexpired PASS. Đã xóa container/volume đúnglabel. Không thay backup restore production |
| E12 | apply-financial-metadata.cjs preview rồi --apply; audit chỉ đọc09:48VN | 0010 bổ sung5cột thiếu trong chuỗi cài mới; DBthật dữ liệu fingerprint giữ nguyên,34bảng+history,10/10checksum,không pending/thiếucột,diff rỗng |
| E13 | Backend AI/actuals/retirement-monthly/plan-presentation tests; test typecheck | 62/62tests,4files PASS; typecheck PASS. Build mặc định vẫnEPERM DLL, E08 chưa đóng |
| E14 | Fresh frontendbuild/prerender; T12_BROWSER_EXTENDED=1 verify-browser.cjs | Build+5prerender PASS. Browser41ca:15PASS/26FAIL/0skip,558.95s,exit1 bình thường/khôngteardownhang. API mocked,không browserDBthật |
| E15 | verify-frontend-wire.cjs, unchanged frontend services→Express/auth+DB doubles | 14writes saiPOST wrapper/header,400/404; GETplans200. Đối soát client góp0.01→0, số lớn mất chính xác. Diagnostic cóexit0, không có nghĩa14nghiệp vụPASS |

E11 artifact cuối `backend/.cache/migration-1665fb0f-b373-4d50-b57b-ec871598ab0a`; E12 `backend/.tmp/database-audit.json`; E14 `.cache/t12-browser-results.json` vàtrace; E15 `.cache/frontend-wire-audit.json`. CI đã sửa imagepgvector/prepareextension và đườngprepare chạy localPASS, chưaGitHubActions.

E14 phân loại: selectorpassword/account/audit/chart/onboarding cũ, nút tăng tiền trùng, menu8linkkhác7; knowledge chưafixturearticles/bookmarks, nhận503Browserfixturemissing; responsive cònchờ tư vấnđãnghỉ. LỗiUIđođược: landing579px/viewport320 và583/390, admincontent373/320; ôsearch chặnmenuadminlandscape. Không kết luận26ca là26lỗibackend. `admin-ui.spec.ts` đã dùngtestInfo.outputPath, không cònpathcánhân nhưF16cũ. Runnerfrontend freePort/taskkill vẫn cần thay;41ca này đã dùngrunnerbackend an toàn.

Phát hiện mới và tiêu chí đóng:

- **F25 — Backend, CLOSED bằng E11/E12:** thiếu5cột migrationhistory;0010 áp dụng, cài mới+nângcấp+DBthật khớpschema,giữdữliệu.
- **F26 — AI frontend, OPEN/chặn:** actuals/AI/knowledge gọi helper sai,14requestfail; đóng khi method/body/header đúng và các hành động hợp lệ lưu/reload/quyền/conflict đạt.
- **F27 — AI frontend, OPEN/chặn:** số tiền đối soát client mấtchínhxác; đóng khi oracle sốlớn/cent/âm khớpbackend vàpayload giữchuỗi.
- **F28 — AI frontend, OPEN/cao:** đọc mã thấy save/apply closure cũ và bỏquafalse, account state khônginvalidatetheoID; đóng khi firstsave/apply/newversion và requestchậm A→B/logout khônghiệnsai/toastsai, cóbrowserassertions. Chưa ghi thành đãtái hiệnbrowser.
- **F29 — AI frontend, OPEN/cao:** overflow/hitbox ở E14; đóng khi320/390/landscape khôngtràn document, menubấm/keyboardđược, rerunresponsiveđạt.

T10provider vẫnchưachọn; retentionlogic đãđạt trênPGtạm nhưngworker cầnSMTP/outboxconfig, repo chưa có chứngcứdeploymentworker. Backup/quyền dữliệu/pháplýP36 vàQ13/Q15 cònnằmngoài nghiệmthu này.

**Chưa đủ điều kiện phát hành hoặc ký nghiệm thu toàn sản phẩm.** Đã kiểm chứng backend T11 và luồng HTTP/DB tài chính. UI giao AI frontend; Q13/Q15, browser tài chính nối DB, môi trường staging/nhà cung cấp/khôi phục và rà quyền dữ liệu/pháp lý còn mở. Không dùng mock làm chứng cứ nhà cung cấp thật.

E01–E10 dùng đúng database chủ dự án đã cho phép, fixture cô lập bằng rollback hoặc tài khoản SUSPENDED riêng/dọn chính xác ID. Không chạy reset/seed/email worker, không phát hành. E11 bổ sung bằng chứng cài mới/nâng cấp trên DB Docker tạm; E12 xác minh lại DB đang dùng.

## Các lần chạy của checkpoint

| ID | Bằng chứng | Actual |
| --- | --- | --- |
| E01 | `npm --prefix backend test` | 246/246 tests,21 files PASS, gồm5 T11; công thức/HTTP/OpenAPI/quyền/rollback |
| E02 | Root `npm run typecheck`; backend `npm run typecheck:tests` | PASS frontend/backend/source/test |
| E03 | Frontend `npm run test:assets`, `npm run build` | 25/25 PASS; build+5 trang prerender PASS |
| E04 | Backend `node scripts/verify-secondary-db.cjs` | 26/26 HTTP/DB checks,35 bảng fingerprint giữ nguyên, rollback PASS |
| E05 | Backend `node scripts/verify-secondary-concurrency-db.cjs` | 2/2 transaction độc lập PASS, cleanup đúng ID PASS |
| E06 | Backend `node scripts/verify-acceptance-flow-db.cjs` | 18/18 HTTP/DB toàn luồng PASS,35 bảng giữ nguyên |
| E07 | Backend `node scripts/verify-browser.cjs` | 7/8 PASS,1 FAIL do nhãn đổi mật khẩu cũ; lệnh thoát bình thường50.6s, không teardown timeout |
| E08 | Backend `npm run build` | Chưa PASS: Windows EPERM khi thay DLL Prisma đang được tiến trình khác dùng; không kill server |
| E09 | Backend `node scripts/verify-build-isolated.cjs`; `npm run test:startup` | Sinh client trong `.cache/t12-prisma-build` PASS, TypeScript emit PASS; thiếu secret production bị từ chối an toàn. Không ghi thành E08 đã đạt |
| E10 | Backend `node scripts/audit-database-readonly.cjs`,09:31 VN | 34 bảng nghiệp vụ+_prisma_migrations,9/9 checksum khớp,không pending/thiếu cột,diff rỗng; không fixture T11/T12 còn sót |

E04 lần đầu fixture email T11 viết hoa không khớp email chuẩn hóa lúc login; sửa fixture lowercase rồi26checks PASS. E06 dùng API thật/session thật; cấu hình publish mẫu nằm trong transaction rollback, không thành cấu hình production. Không gọi provider ngoài.

E06 input độc lập: valuation2026-08-01, nghỉ2027-01, cuối2027-03, vốn0, đóng100/tháng Aug–Dec, rút100/tháng Jan–Mar, CPI/lãi0. Expected A=5×100=500,K=3×100=300; actual500/300. Sau actualAug100,Sep0, anchor100; còn3 khoản đóng100 → A=400; actual400. Sửa Aug110 làm openingSep100 lệch → BLOCKED; actualBLOCKED. Publish CPI1 và lưu phiên bản mới không tự đổi current; apply riêng mới đổi, baseline/CSV phiên bản cũ giữ nguyên. Update trực tiếp snapshot bị trigger từ chối; token đã logout-all bị401.

## Mẫu đối chiếu P01–P36

Đây là bảng kiểm kỹ thuật đối chiếu yêu cầu, **không phải biên bản khách ký**. Input là fixture, không phải khuyến nghị/số dự báo production. “PASS” nghĩa là các assertions dẫn chiếu trong E01/E06 đã chạy; không suy thành mọi khía cạnh UI/nguồn/pháp lý của P đó đã được nghiệm thu.

Model/assumption: **M**=`retirement-monthly-v2`, snapshot=`retirement-plan-snapshot-v1`; **A**=`assumption-series-v2`, fixture `assumptions-fixtures.ts`/`retirementConfiguration()`, ID/version tạo riêng và rollback; **R**=`portfolio-policy-v1`, fixture `portfolioFixture()`. **H**=schema profile v2. N/A=kiểm schema/quyền, không phép tính phụ thuộc một bộ giả định. Các file bằng chứng ở `backend/src/tests/` trừ khi ghi script.

| ID | Input đối chiếu | Expected độc lập / actual đã kiểm | Model / giả định | Evidence và giới hạn |
| --- | --- | --- | --- | --- |
| P01 | Khoản chung trả10tr, phần riêng50%; stress trách nhiệm FULL | Base5tr, stress10tr thay5tr, không cộng thành15tr / PASS | H; lịch hợp đồng fixture | debts.test: replaces 5 million…; nghĩa vụ LIMITED/có trần chưa được mô phỏng đầy đủ |
| P02 | Thưởng ONCE1tr tháng10 | Tháng10=1tr, tháng11=0 / PASS | H/N/A | profile-v2.test: uses the actual month… |
| P03 | Khoản chi liên kết cùng debtId | Trả nợ chỉ tính một lần; khai không khớp bị chặn / PASS | H/lịch fixture | profile-v2.test: links debt expense once…; debts.test |
| P04 | Tài sản100tr, sở hữu50%, hưu60% phần sở hữu | Tổng tài sản50tr; vốn hưu30tr / PASS | H/N/A | profile-v2.test: separates ownership… |
| P05 | Các mức tỷ lệ trả nợ/thu khả dụng; chi thiết yếu lớn | Phân loại ngưỡng30/50 và vẫn giữ surplus âm; lịch trả thêm có phí/điều kiện / PASS assertions | H/lịch fixture | debts.test: boundaries, low ratio and negative residual, payoff totals; UI cần nghiệm thu |
| P06 | UNKNOWN so với KNOWN0 | UNKNOWN→null/missing;0 vẫn là0 / PASS | H/N/A | profile-v2.test: distinguishes an explicitly entered zero… |
| P07 | Ngày2026-02-29/2028-02-29, chuỗi tháng | Ngày đầu không hợp lệ, ngày sau hợp lệ; không kéo khoản ONCE / PASS | H,M/A0 | profile-v2.test; retirement-monthly.test |
| P08 | Chi tiền hôm nay, CPI đổi qua tháng1 | Quy đổi đúng tích hệ số CPI, không dùng lợi suất đầu tư / PASS | M/A fixture | retirement-monthly.test: uses annual inflation across January… |
| P09 | 12 kỳ CPI năm4% | Tích hệ số tháng×100=104 / PASS tolerance1e-12 | A fixture | assumptions.test: separates historical CPI… |
| P10 | Danh nghĩa12% ghép12 lần/năm | (1+.12/12)^12−1≈.1268250301319697 / PASS | A fixture | assumptions.test: honors nominal compounding…; debts.test loại lãi hợp đồng |
| P11 | Lợi suất thực10%,CPI4%,phí1đpt,thuế.4đpt | 1.10×1.04−1−.01−.004=.13 / actual .13 | A fixture | assumptions.test: converts real to nominal once… |
| P12 | Vốn25,đóng100×3,lãi0 | A325; số dư125,225,325 / actual đúng | M/A0 | retirement-monthly.test: zero interest… |
| P13 | Vốn1tr,đóng1tr×12,lãi1%/tháng, đầu/cuối tháng | Chỉ phần đóng đầu kỳ thêm hệ số1.01; vốn đầu không thêm / PASS nghiên cứu | M research/A fixture | Hướng đã chốt05/10; API hiện chỉ END_OF_MONTH. Q13-01–03 còn phải triển khai/nghiệm thu |
| P14 | 2 kỳ; tháng đầu thiếu50; vốn bổ sung ở tháng sau | Cần thêm50/tháng để không thiếu sớm, không lấy25 từ terminal-only / actual50 | M/A fixture | retirement-monthly.test: solves constant and incremental… |
| P15 | Thu/chi/nợ100/40/10;50/40/10;20/40/10 | Surplus50/0/−30; không tự biến thành khoản góp / PASS | M; actual ledger/A0 | EXPLICIT_DEPOSITS_ONLY đã chốt05/10; Q15-01–04 còn lưu reforecast/lịch tương lai/UI và nghiệm thu |
| P16 | Rút100×2,lãi10%/tháng,L50 | K=100/1.1+150/1.1² / PASS tolerance1e-12 | M/A fixture | retirement-monthly.test: PV withdraws at month END… |
| P17 | Vốn50,lãi−10%,rút100×3 | Số dư−55,−149.5,−234.55; thiếu ngaytháng1 / actual đúng | M/A fixture | retirement-monthly.test: retains losses… |
| P18 | A250,K100 rồiK0 | Coverage250%,rồi null / actual đúng | M/A0 | retirement-monthly.test: K=0…; T08 contract |
| P19 | 9007199254740993.25×.12345678 | 1111999816808722.760646735, không làm tròn giữa / actual đúng | H; M/A fixture | profile-v2.test exact integer oracle; engine chart precision |
| P20 | CPI lịch sử và forecast riêng, thiếu nguồn/nhìn trước | Không lấy CPI lịch sử90% thay dự báo; thiếu nguồn bị chặn / PASS cấu trúc | A fixture | assumptions.test; **chất lượng/duyệt dữ liệu CPI production cần chủ nghiệp vụ xác nhận** |
| P21 | Draft→review→approve→publish; sửa sau review | Chặn publish thiếu review hoặc token cũ; bản publish bất biến / PASS | A version fixture | assumptions.test lifecycle; E06 quaHTTP |
| P22 | Nhóm tài sản/horizon/phí/thuế bị thiếu hoặc trùng | Không tự thay0; thiếu/gap/overlap không được duyệt / PASS | A,R fixture | assumptions.test + portfolios.test |
| P23 | Publish bộ mới khi plan cũ đã apply | Current cũ và kết quả replay giữ nguyên / PASS | M/A,R version fixture | plans.test; E06 giữ snapshot trước/sauCPI1 |
| P24 | Tài sản có phần dự phòng/mục tiêu khác; ngân sách trả nợ | Loại phần dự phòng khỏi vốn hưu và không dùng trả nợ thêm / PASS | H; M/A fixture | profile-v2.test; debts.test: protects expenses/reserve… |
| P25 | Lịch dư nợ giảm dần, balloon, đổi lãi, trả trước | Lãi/tổng trả/maturity theo lịch độc lập; phí không bị bỏ / PASS assertions | Lịch fixture,N/A | debts.test: matches independent reducing-balance totals… |
| P26 | Lương hưu khai tay, tháng nhận trễ | Trước tháng nhận0, đúng tháng nhận số khai; không tự CPI mỗi kỳ / PASS | H; pension/A fixture | pensions.test: starts in the declared month… |
| P27 | Không đủ lịch sử đóng/nhóm điều kiện BHXH | Không trả entitlement từ công thức demo / phạm vi MVP giữ nhập tay | N/A | **DEFERRED sau MVP**; chưa có bộ tính BHXH đầy đủ, không đóng P27 toàn bộ |
| P28 | Nam sinh1961-01, điều kiện NORMAL | Tuổi723tháng, tháng nhận tham chiếu2021-05 / actual đúng | Bảng luật version T05/N/A | pensions.test annexI; chỉ REFERENCE_ONLY, không chứng minh đủ điều kiện hưởng |
| P29 | Giới tính/điều kiện hưu chưa biết | REVIEW_REQUIRED, không tự chọn; ước tính có nguồn / PASS | Pension/N/A | pensions.test: never defaults missing conditions… |
| P30 | Thiếu câu trả lời; chịu lỗ cao nhưng khả năng thấp | MISSING_INPUT hoặc giới hạn theo năng lực, không chỉ tuổi / PASS | R/A fixture | portfolios.test: missing answers, capacity limits |
| P31 | Danh mục có tổng≠100%, gap/overlap hoặc chưa duyệt | Chặn; chỉ bảng đã duyệt áp theo tháng / PASS | R/A fixture | portfolios.test allocation/lifecycle |
| P32 | BASE/ADVERSE/FAVORABLE và chỉnh input cá nhân | Ba kịch bản có nguồn/delta; simulate không apply / PASS | M,R/A fixture | portfolios.test scenarios; plan-presentation.test simulation |
| P33 | Vốn100,+góp30−rút10+lãi5−giá20−phí2,chuyển nội bộ900 | Closing103, không cộng nội bộ900 / actual103 | actual ledger/N/A | actuals.test: reconciles interest once… |
| P34 | Retry cùng key,apply version2,sửa actual quá khứ | Một bản/lượt ghi; baseline cũ và history giữ; lệch chuỗi bịBLOCKED / PASS | M/A,R version fixture | plans.test + actuals.test + E06; DB trigger immutable |
| P35 | AI yêu cầu tự thêm số/ghi đè/nguồn chưa duyệt | Không apply; facts engine/fallback, citation chỉ nguồn hợp lệ / PASS boundary | M/A,R snapshot + AI policy | ai.test; **chưa có provider thật** |
| P36 | Consent off,revoke/delete trong lúc chờ,history hết hạn | Chặn xử lý/ghi muộn, xóa cả context và messages / PASS backend | ai-explanation-2026-10-v1/N/A | ai.test, checkpoint T10 DB/races; **rà pháp lý, backup retention và quyền dữ liệu toàn tài khoản chưa đóng** |

## F01–F22: trạng thái và chủ việc

| Finding | Kết quả/backend evidence | Việc còn lại / chủ việc |
| --- | --- | --- |
| F01 | CLOSED backend:401 sai mật khẩu,403 chưa xác minh, không cấp session; E01 | Không mở lại lỗi assertion cũ |
| F02 | CLOSED backend: T06–T09 router/services, E06 | UI API tài chính: AI frontend |
| F03 | PARTIAL: engine server và version-pinned report đạt E01/E06 | AccountPage/UserAccountModal CSV còn tính client; AI frontend |
| F04 | CLOSED backend: vốn không trừ dư nợ hai lần; debts/retirement tests | Đối chiếu UI toàn luồng |
| F05 | PARTIAL: schema nợ/lịch/DTI/stress FULL đạt | Nghĩa vụ LIMITED chưa mô phỏng, UI hợp đồng; backend + chủ nghiệp vụ/AI frontend |
| F06 | CLOSED backend: PV/withdrawal cuối kỳ, golden M | Q13 đóng đầu kỳ là quyết định riêng |
| F07 | CLOSED backend: A/R theo năm/tháng và metadata | Dữ liệu production có phê duyệt nghiệp vụ |
| F08 | CLOSED backend: publish/worker không tự apply; E06 | UI thông báo cập nhật cần đối chiếu |
| F09 | CLOSED MVP backend: pension nhập tay, không tính demo | Bộ tính BHXH đầy đủ sau MVP; UI không dựng entitlement |
| F10 | PARTIAL: H giữ UNKNOWN/0, backend PASS | Kiểm UI không lấp mặc định/zero |
| F11 | PARTIAL: K0=null,>100% giữ nguyên, chart server | UI/report/canvas/chú giải và CSV client |
| F12 | CLOSED backend: sổ/đối soát/reforecast immutable, E06 | Browser thực tế/reforecast cùng version |
| F13 | CLOSED backend: giả định/policy approval/revision/publish | Browser admin reload/multi-tab, AI frontend |
| F14 | PARTIAL: context/fallback/governance/nguồn đạt T10 | Provider chưa chọn; UI/browser/pháp lý mở |
| F15 | CLOSED kiểm tra local: E11 clean10/upgrade4→10/extension/integration PASS | GitHub Actions và backup restore vẫn kiểm riêng; không sửa migration cũ |
| F16 | PARTIAL: artifact admin hiện dùngtestInfo.outputPath; E14 đã chạy41ca | Fixture/selector cũ cònlỗi; AIfrontend sửa vàrerun |
| F17 | CLOSED backend: routes410/service/socket producer removed, history/Support giữ; E04 | UI xử lý410/xóa CTA, AI frontend |
| F18 | OPEN UI: số/metadata server đã có | CSV Account, nhãn/thực-danh nghĩa/lỗi chữ/responsive/accessibility |
| F19 | PARTIAL:6 auth browser PASS, account reload/conflict PASS | Test đổi mật khẩu locator cũ FAIL; AI frontend |
| F20 | PARTIAL: catalog/settings DB+ownership+CAS+reload đạt E04/E05 | Thay demo/localStorage và chỉ báo saved sau API; AI frontend |
| F21 | CLOSED kiểm tra DB local vàđangdùng: E11 vàE04/E06/E12 | Staging/backup chưađạt; không reset DBứngdụng |
| F22 | PARTIAL: runner T12 cổng động, 41 ca kết thúc 558.95s/exit1/report đủ, không treo teardown | Runner frontend cũ còn freePort/taskkill; AI frontend thay lifecycle, sửa 26 ca lỗi và chạy lại toàn suite |

Phát hiện mới:

- **F23 — Chủ vận hành/backend:** build mặc định bị DLL Prisma đang dùng trên Windows. Client generation riêng+tsc đãPASS; tiêu chí đóng: khi người vận hành dừng/restart server đúng quy trình, `npm --prefix backend run build` PASS và chạy backend bằng client mới. Không kill tiến trình khác để làm test xanh.
- **F24 — Chủ AI frontend:** nhãn thực tế `Mật khẩu mới Tối thiểu 12 ký tự`, test tìm `Mật khẩu mới (tối thiểu 12 ký tự)`; sửa selector theo accessible name, giữ ca lỗi server không logout và thành công mới logout; chạy đủ8/8. Trace `backend/.cache/t12-browser-artifacts`, JSON `backend/.cache/t12-browser-results.json`.

## Bundle, browser và các bước phát hành còn mở

Build đo được JS chính750.67kB/gzip244.17kB, three.module746.95kB/gzip191.81kB, CSS381.73kB/gzip64.68kB, loading-waves1.67MB. Đây là kích thước build, chưa phải LCP/INP hoặc thời gian mạng thực. Không bỏ validation/chức năng; AI frontend đo tải trước/sau và xem tải lười thư viện3D/ảnh loading. Auth browser đã kiểm390/768/1024/1440 theo ca hiện có; không suy toàn bộ màn hình đáp ứng accessibility.

Chưa chạy browser nối DB cho toàn luồng tài chính; E06 là HTTP/DB. Chưa kiểm hoàn chỉnh keyboard/focus/contrast/reduced-motion cho mọi màn hình. Chưa kiểm outage nhiều tab của toàn bộ engine. Staging Google/Cloudinary/AI/Azure/email-delivery/backup-restore chưa chạy; chỉ báo configuration không chứng minh provider hoạt động. Q13/Q15 cần ghi nhận lựa chọn, không mở lại các P đã chốt khác. Pháp lý P36 cần người phụ trách rà từng yêu cầu thực thi. Chỉ sau khi các blocker này đạt mới ký/phát hành.
# Bổ sung kiểm chứng P13/P15 — 05/10/2026

Lượt cuối sau thay đổi AI/context và metadata so sánh:45tests/4files PASS và source emit PASS. Full265 bên dưới là lượt toàn bộ trước khi thêm một test AI mới, không cộng các lượt chạy thành tổng.

Model mới retirement-monthly-v3; snapshot v2 giữ reader/engine cũ. Contract [CONTRIBUTIONS_REFORECAST.md](../backend/docs/CONTRIBUTIONS_REFORECAST.md). Đây là bằng chứng backend, chưa nghiệm thu UI/phát hành.

| Nhóm | Kết quả kiểm tra thực tế |
| --- | --- |
| P13: FV/solver | Oracle đầu/cuối kỳ, vốn đầu không thêm kỳ, lãi dương/0/âm, hệ số đổi tháng, tháng góp0, partial month và nguồn đầu tháng. Mẫu 1 triệu ×12 tháng, 1%: 12.682.503 / 12.809.328 sau làm tròn. |
| P15/P19: thu–chi, số thực | Góp chỉ theo xác nhận; giới hạn theo dư/khả dụng, không lặp giao dịch một lần. Tháng thiếu, mở, không đối soát hoặc đứt chuỗi số dư chặn dự báo. Thiếu vốn sớm vẫn báo dù cuối kỳ dương. |
| P23/P33: version/apply | Preview không ghi, lưu không apply, baseline giữ nguyên; 22 kiểm tra HTTP/DB rollback đạt và giữ 35 bảng. Source actual revision/hash được pin, replay vẫn khớp sau sửa actual; apply cũ trả409. |
| P34: nguồn, export, AI | CSV ghi model/timing/REFORECAST/source/cutoff; report cảnh báo actualSourceChanged. AI dùng facts đã lưu, nhãn REFORECAST, không provider, từ chối nguồn lỗi thời. |
| Cạnh tranh PostgreSQL | 3 trường hợp đạt: save cùng key cùng kết quả/một version; cùng revision một thắng; actual edit vs apply theo thứ tự Serializable, sau edit nguồn bị đánh dấu cũ và không được apply tiếp. Fixture riêng đã dọn, cấu hình fixture không hiển thị công bố. |
| Build/test | Full 265/23 đạt với 2 workers; sau bổ sung AI, nhóm 35 tests đạt. Typecheck, Prisma generate riêng + emit, startup thiếu secret từ chối an toàn. Lượt chạy song song cao có timeout ở test cũ, không bỏ test hoặc tăng timeout để che lỗi. |
| Chưa nghiệm thu | Browser timing/actual/save/apply/reload/export/409/multitab; chỉnh từng hợp đồng nợ/tài sản/lương hưu từ actual; normal build DLL, CI remote, staging, worker/backup/P36 và provider chưa chọn. |
# Bổ sung Q15-03 theo nguồn — 05/10/2026

- Backend:273tests/24files PASS, testtypecheck/build riêng/startup PASS.
- `verify-source-changes-db.cjs`:17HTTP/PostgreSQL checks PASS, rollback verified,35tables preserved, không email/dịch vụ ngoài. Fixture lần đầu sai tháng kỳ đầu hợp đồng được sửa; kết nối tạm gián đoạn đã phục hồi trước lượt cuối PASS.
- Nguồn: hai khoản vay chỉ xóa lịch một khoản; tài sản thực vào quỹ không được cộng lại; thay mức hưu không cộng hai lần; thay riêng thu/chi giữ các nguồn khác; zero/khoảng/overlap/event reuse/permission/schema/replay/correction được kiểm.
- SourceChanges được lưu cùng version; baseline/profile cũ giữ nguyên; CSV/compare ghi nguồn; sửa actual evidence chặn apply và vẫn replay được snapshot cũ.
- UI FE-Q15-03 chưa nghiệm thu browser. Chưa hỗ trợ trong command này: tái cơ cấu/trả một phần, thêm nguồn hoàn toàn mới, tự tính BHXH. Không migration, không đồng nghĩa chấp thuận phát hành.
