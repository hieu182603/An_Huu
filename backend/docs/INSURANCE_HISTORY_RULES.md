# Lịch BHXH và quản trị quy tắc

Cập nhật runtime05/10: bước chọn estimate vào nguồn đã được nối API `plans/{id}/source-reforecasts[/preview]`, lưu evidence đầy đủ trong snapshot v4, kiểm stale khi save/apply và giữ replay độc lập DB. Xem [SOURCE_COMMANDS_V4.md](SOURCE_COMMANDS_V4.md). Các đoạn “chưa có endpoint T16” phía dưới mô tả checkpoint trước; PostgreSQL/race mới vẫn chưa chạy, corpus luật thực chưa PUBLISHED.

Triển khai 05/10/2026, migration `202610050011_pension_rules_history`. Contract production: [insurance.openapi.yaml](insurance.openapi.yaml), paths trong [openapi.yaml](openapi.yaml). Ba bảng mới: `legal_rule_set_versions`, `social_insurance_history_versions`, `pension_estimates`. Đã có API estimate cho BH1 thông thường; chưa có bộ luật PUBLISHED trên DB thật. Không suy lịch đóng từ hồ sơ cũ.

Hậu kiểm0011:11/11checksum,37modeltables+history38,empty schema diff;23HTTP/DBchecks sauapply đạt, rollback giữ38bảng. Kết nối lỗi trung gian đã phục hồi; ba bảng mới chưa có dữ liệu người dùng.

## Lịch đóng — USER

- `GET /api/v1/me/pension/history`: bản mới nhất hoặc `data:null`.
- `GET /api/v1/me/pension/history/:id`: bản bất biến của chính chủ; khác chủ trả404.
- `POST /api/v1/me/pension/history/import-preview`: `{expectedHistoryRevision,document}`; chỉ đọc. Trả `status`, `issues`, `normalized`, `inputHash`.
- `POST /api/v1/me/pension/history`: `{preview,expectedInputHash,confirm:true}` và `Idempotency-Key: UUID`; append bản mới, không sửa hồ sơ tài chính hoặc kế hoạch.

Document giữ độ chính xác ngày sinh DAY/MONTH/YEAR/UNKNOWN; không tự điền ngày quy ước. Mỗi tháng ghi scheme, salaryRegime, status, contributionBase và evidence. Số tiền VND là chuỗi, là căn cứ đóng chứ không phải lương thực nhận. CREDITED bắt buộc loại và căn cứ; nhóm đặc thù có khoảng/evidence, chưa được suy thành nhóm thông thường.

Khoảng lịch tối đa1.200tháng. Preview điền chỗ trống thành UNKNOWN và báo INCOMPLETE, không coi là tháng đã đóng hoặc 0 đồng. INCOMPLETE được lưu khi người dùng xác nhận để bổ sung sau; INVALID (trùng tháng/ngoài khoảng/xác nhận tương lai) không được lưu. `confirmedThroughMonth` không vượt tháng hiện tại ở Việt Nam; phần tương lai thực sự thuộc kịch bản estimate riêng. Preview hash gắn toàn bộ input ban đầu và normalized, vì vậy UI phải gửi lại `preview` đã xem, không tự thay document bằng normalized rồi dùng hash cũ.

Append khóa hàng chủ trong transaction rồi kiểm revision mới nhất, pin parentVersionId/parentHash; unique(userId,revision), composite owner FK. Lặp key/body trả kết quả cũ, khác body trả409. Trigger cấm UPDATE lịch/estimate. Xóa tài khoản cascade toàn bộ lịch/estimate, giữ quy tắc công khai. Đã thử chuỗi2revision và estimate cùng cascade bằng fixture rollback.

## Bộ luật — ADMIN

`GET/POST /api/v1/admin/legal-rules`, `GET/PATCH /api/v1/admin/legal-rules/:id`, `POST /api/v1/admin/legal-rules/:id/transitions`. GET danh sách tối đa200bản; mọi mutation có Idempotency-Key và CAS. PATCH `{expectedRevision,draft}`; transition có action, expectedRevision, expectedDocumentHash, confirm và hash duyệt tương ứng.

Luồng DRAFT → VALIDATE → REVIEW → PUBLISH. VALIDATE luôn chạy bộ mẫu phía server; invalid giữ DRAFT với issues. REVIEW cần validationHash, reviewNote và người duyệt chưa từng soạn/sửa draft; `authorIds` lưu toàn bộ người soạn qua các lần chỉnh. PUBLISH kiểm lại fixture/hash, reviewHash, draftHash và khoảng hiệu lực/chuỗi thay thế. Sửa bản chưa công bố xóa review/validation và quay DRAFT. Trigger cấm sửa/xóa bản đã PUBLISHED. Cùng nhánh chồng ngày cần supersedes hợp lệ; không tự sửa cửa sổ của luật cũ.

Registry đã đăng ký `vn-bh1-employer-2025-v1`, engine `vn-pension-benefit-v1`, cho nhánh `BH1_COMPULSORY_EMPLOYER_NORMAL`: người lao động nhóm Điều2(1)(a), toàn bộ tháng được tính theo lương doanh nghiệp. Kiểm hệ số năm hưởng2026, tuổi theo nhóm tháng sinh và mức tham chiếu theo kỳ; 9 mẫu số/điều kiện độc lập chạy trước duyệt. Có thêm BH1v2 và BH2 thông thường mô tả bên dưới. BH2 đặc thù/BH3/BH4 còn tiếp tục. Tài liệu dùng trong test có chứng từ giả, tuyệt đối không dùng để seed/công bố luật thật.

## Ước tính BHXH — USER

- `GET /api/v1/me/pension/legal-rules?benefitDate=YYYY-MM-DD`: các bản đã công bố, đúng thời điểm hưởng, mới nhất theo chuỗi và nhánh hỗ trợ. Danh sách rỗng khi chưa có bộ luật phù hợp; UI không tự chọn hệ số.
- `POST /api/v1/me/pension/estimates/preview`: `EstimateInput`; yêu cầu lịch mới nhất của chủ tài khoản, revision và rule ID đã công bố. Không ghi dữ liệu.
- `POST /api/v1/me/pension/estimates`: `{preview,expectedInputHash}`, `Idempotency-Key: UUID`; lưu snapshot bất biến, không cập nhật pension của hồ sơ hoặc kế hoạch.
- `GET /api/v1/me/pension/estimates`: tối đa100kết quả gần nhất của chính chủ.
- `GET /api/v1/me/pension/estimates/:id`: kiểm toàn vẹn và tính lại từ snapshot; không đọc luật/lịch hiện hành để thay kết quả cũ.

Preview trả `inputHash` cấp ngoài để dùng khi lưu; `assessment.inputHash` là dấu vết bộ tính, không dùng thay hash lưu. Snapshot pin lịch, input, ngày đánh giá theo Việt Nam, văn bản luật, phiên bản/hash, mốc tri thức/công bố và hash kiểm chứng/phê duyệt. Qua ngày mới cần preview lại. Lịch mới hoặc quy định mới cùng phạm vi chặn save cũ; đọc kết quả đã lưu vẫn hợp lệ. Replay kiểm cả số tiền và breakdown/citations.

Lịch thêm `NOT_CONTRIBUTED` (đã xác nhận không đóng, base=null) khác `UNKNOWN`; `participantCategory` phải khai để xét đúng nhánh. Case hiện tại cần `caseDetails.NORMAL_EMPLOYEE`, trạng thái đang tham gia/bảo lưu và tháng hưởng theo văn bản người sử dụng lao động/đề nghị hoặc giả định có căn cứ. Giữ nguyên độ chính xác ngày sinh khai báo; ngày quy ước chỉ nằm trong breakdown. Chặn chứng từ xác nhận ở tương lai.

Điều kiện tính trên tháng thực trước khi quy đổi tháng lẻ;179tháng chưa đủ. Mức bình quân dùng căn cứ nhân hệ số theo năm đóng/năm hưởng. Chỉ xét sàn khi đúng nhóm chuyển tiếp và đủ240tháng. Hệ số tương lai thiếu trả `INSUFFICIENT_DATA`; lịch tương lai/văn bản giả định gắn `PROJECTED_SCENARIO`. Chưa tự xử lý CREDITED, tự nguyện hoặc nhóm đặc thù/hồ sơ lịch sử: `REVIEW_REQUIRED`. Lương Nhà nước/hỗn hợp dùng nhánh riêng bên dưới. Không dùng các trạng thái thiếu/rà soát để tự áp pension vào kế hoạch. T14-03 còn rà corpus pháp lý thực; T14-06 còn nối nguồn vào candidate.

### Bộ tính quyền lợi v2 — trợ cấp nghỉ hưu

`vn-pension-benefit-v2`/`vn-bh1-employer-2025-v2` bổ sung trợ cấp vượt420tháng nam/360tháng nữ. Chỉ lấy các tháng đóng vượt ngưỡng, tách theo tháng đủ tuổi nghỉ hưu: phần đến tháng tuổi dùng0,5lần bình quân/năm, phần sau dùng2lần. Quy đổi tháng lẻ của từng thành phần theoĐiều5(6); cần người rà luật đối chiếu cách tách tháng lẻ khi duyệt corpus thực. Breakdown ghi số tháng và số tiền từng phần, tổng `RETIREMENT_LUMP_SUM`. Không cộng trợ cấp vào vốn/quỹ hoặc vào lương hưu tháng.

V2 yêu cầu thêm citations `LAW_ART68`, `TT12_ART14`; validator có16mẫu (9cũ+7trợ cấp). V1 giữ nguyên kết quả thiếu đánh giá trợ cấp. Save pin engine từ bộ luật; dispatcher chọn đúng v1/v2, không nâng engine của estimate cũ khi đọc. Luật kế tiếp có thể dùng engine mới qua supersedes/phê duyệt; không sửa luật đã công bố.

### Lương Nhà nước/hỗn hợp thông thường — đã nối API estimate

Engine `vn-pension-state-v1`, strategy `vn-bh2-state-mixed-2025-v1`, branch `BH2_COMPULSORY_STATE_MIXED_NORMAL` đã nối discovery/preview/save/replay. Phạm vi tháng bắt buộc thuộc nhómĐiều2(1)(a)/(b), lương doanh nghiệp hoặc Nhà nước, có ít nhất một tháng Nhà nước; hưởng thông thường, không có giai đoạn đặc thù. 18mẫu validation trước duyệt luật. Discovery chọn phiên bản theo cả chuỗi luật và branch.

Input estimate thêm `stateSalaryCase`: `firstParticipationMonth` cùng `firstParticipationEvidence`, `salaryTreatment`, `treatmentEvidence`. Mốc tham gia phải có trong lịch và không bỏ qua giai đoạn đã rútBHXH một lần. `ORDINARY` cần được xác nhận có căn cứ, không tự mặc định; UNKNOWN/HAZARDOUS_TRANSFER/MILITARY_TRANSFER/SENIORITY_ALLOWANCE_TRANSFER còn REVIEW_REQUIRED.

Nếu bắt đầu trước2016, mỗi tháng lương Nhà nước từ10/2004 cần `stateSalary:{kind:CURRENT_SCALE_COEFFICIENT,totalContributionCoefficient,evidence}`. Đây là tổng hệ số làm căn cứ đóng trên chứng từ, không phải riêng hệ số ngạch lương hoặc lương thực nhận chia cho mức tham chiếu hiện tại. Bộ tính nhân hệ số này với mức tham chiếu tại tháng hưởng. Thiếu hệ số/chứng từ báo thiếu; hệ số vượt20 yêu cầu rà lại trần/căn cứ thay vì tự cắt hoặc cho kết quả. Với mốc tham gia từ2016, dùng căn cứ đóng nhân hệ số điều chỉnh theo năm đóng/năm hưởng. Phần doanh nghiệp luôn dùng phương pháp hệ số năm. Không cho client gửi `adjustedBase` hoặc bảng hệ số vĩ mô.

Cửa sổ60/72/96/120/180/240/toàn bộ theo mốc bắt đầu tham gia. Gom tháng Nhà nước gần nhất qua nhiều đoạn; thiếu cửa sổ dùng số tháng thực, nhân bình quân Nhà nước với tổng tháng Nhà nước để ghép phần doanh nghiệp. Trường hợp hoàn toàn Nhà nước thông thường so thêm bình quân toàn thời gian theoNĐ158Điều15(2)(c); chưa áp phép so này cho nhánh hỗn hợp. Breakdown có `STATE_ADJUSTMENT_METHOD`, cửa sổ, tổng tháng, bình quân Nhà nước, tổng doanh nghiệp và cờ dùng toàn thời gian. Thông tin gốc không bị thay bằng tiền đã điều chỉnh.

## Engine `vn-pension-state-v2` (07/10/2026, corpus nháp, chưa PUBLISHED)

v1 giữ nguyên để replay. v2 bổ sung, chỉ dựa trên kết quả cơ quan BHXH đã xác nhận (NĐ158 Điều34(4): BHXH quyết định tính hay không, ứng dụng không tự xét):
- **Tháng CREDITED trước 01/1995** khi `creditKind` là `PRE_1995_STATE_SECTOR` (Điều34(1), nhóm a/b) hoặc `PRE_1995_ARMED_FORCES` (Điều34(2)(3), chỉ nhóm d — sĩ quan/QNCN), chế độ STATE, có hệ số đã chuyển đổi và chứng từ. Không cần contributionBase. Tính vào số năm và bình quân toàn thời gian (Điều15(2)(c)). Hạ sĩ quan/binh sĩ (nhóm đ), loại khác (thai sản…) và tháng từ 1995 vẫn REVIEW_REQUIRED.
- **Lương Nhà nước trước 10/2004** khi tháng có `stateSalary.pre2004Conversion {scale, evidence}` = hệ số **đã được BHXH chuyển đổi** sang thang lương tại thời điểm hưởng (Điều15(1)(a)): `ND204_PUBLIC`, `ND205_ENTERPRISE` (doanh nghiệp), `ND204_ARMED_FORCES` (bắt buộc cho tháng nhóm d). Không tự dựng bảng chuyển đổi thang lương cũ. Thiếu → PRE_2004_STATE_SALARY_CONVERSION_REQUIRED; sai thang → PRE_2004_CONVERSION_SCALE_MISMATCH.
- **Chuyển ngành lực lượng vũ trang** (Điều15(2)(b)): `salaryTreatment: MILITARY_TRANSFER` + `transferMonth`. Tháng nhóm d chỉ hợp lệ trước tháng chuyển ngành. Bình quân = max(N năm cuối trước nghỉ hưu, N năm cuối trước chuyển ngành), N theo Điều72(1); không áp thêm so sánh toàn thời gian (2)(c). Thiếu đủ N năm trước chuyển ngành → TRANSFER_WINDOW_INCOMPLETE; có thời gian lương doanh nghiệp → MILITARY_TRANSFER_MIXED_REVIEW_REQUIRED.
- Tháng cuối trước nghỉ hưu phải là dân sự (a/b); nghỉ hưu khi còn tại ngũ → ARMED_FORCES_RETIREMENT_BRANCH_REQUIRED (BH4, tuổi theo luật riêng).
- **Chuyển từ nghề nặng nhọc/độc hại** (Điều15(2)(a)): `salaryTreatment: HAZARDOUS_TRANSFER`, `transferMonth` (tháng chuyển việc), `hazardousPeriods[]` (giai đoạn đóng theo mức lương nghề nặng nhọc, BHXH xác nhận, không chồng nhau, kết thúc trước tháng chuyển, mọi tháng trong giai đoạn phải là tháng lương Nhà nước được tính) và `hazardousWindowFrom`. Văn bản chỉ nói "số năm đóng liền nhau… tương ứng số năm Điều72(1)", **không chỉ rõ N năm nào** → người dùng khai cửa sổ, engine chỉ kiểm cửa sổ N tháng nằm trọn trong một giai đoạn. Cần ≥180 tháng nặng nhọc (HAZARDOUS_FIFTEEN_YEARS_REQUIRED). Bình quân = max(N năm cuối, cửa sổ khai báo); không so toàn thời gian. Có lương doanh nghiệp → HAZARDOUS_TRANSFER_MIXED_REVIEW_REQUIRED.
- **Phụ cấp thâm niên nghề** (Điều15(3)): `SENIORITY_ALLOWANCE_TRANSFER` + `transferMonth` (tháng chuyển nghề) + cờ `stateSalary.includesSeniorityAllowance` từng tháng. Chỉ điểm (b) — mọi tháng trong N năm cuối có thâm niên — được tính tự động (như thông thường, gồm (2)(c)). Điểm (a) ("cộng phụ cấp thâm niên cao nhất… tính theo thời gian đã đóng") chưa xác định được cách tính → SENIORITY_ALLOWANCE_ADDITION_REVIEW_REQUIRED; điểm (c) chưa rõ quan hệ với (2)(c) → SENIORITY_MIXED_WINDOW_REVIEW_REQUIRED. Thiếu cờ → SENIORITY_FLAG_REQUIRED; chưa từng có thâm niên trước chuyển nghề → SENIORITY_HISTORY_REQUIRED.
- v2 được mở rộng tại chỗ (07/10, cùng ngày tạo) vì bộ luật v2 chưa từng được nhập/công bố, không có estimate v2 thật cần replay.

Kiểm chứng: 5 golden tính tay trong strategy (7.590.000; 6.472.294,52; 8.804.400; 8.602.000; 4.958.800), 24 test riêng, `verify-state-pension-db.cjs --corpus --state-v2` và `--corpus --hazardous` mỗi bộ 18 HTTP/DB checks rollback.

## Tháng thai sản được tính là thời gian đóng (07/10/2026)

Luật BHXH 2024 Điều53 khoản8 (R02): thời gian nghỉ hưởng thai sản khi sinh con/nhận con nuôi dưới 6 tháng/mang thai hộ, và các trường hợp khác nghỉ thai sản từ 14 ngày làm việc trong tháng, được tính là thời gian đóng BHXH bắt buộc, không phải đóng. TT12 Điều liên quan chỉ hướng dẫn tháng nào được tính (ví dụ hợp đồng hết hạn giữa kỳ thì phần sau không tính) — **không** quy định căn cứ tiền lương để tính bình quân. Vì vậy:
- `status: CREDITED`, `creditKind: "MATERNITY_ART53_8"`, tháng ≥ 2025-07, bắt buộc; dùng đúng căn cứ đóng/hệ số **BHXH đã ghi** cho tháng đó, thiếu → POSITIVE_CONTRIBUTION_BASE_REQUIRED (không tự suy).
- Bộ luật phải có trích dẫn `LAW_ART53` (đã thêm vào draft BH1 và Nhà nước v2); thiếu → giữ CREDITED_MONTH_ASSESSMENT_REQUIRED.
- Tháng thai sản **01/2016–06/2025**: Luật BHXH 58/2014/QH13 Điều39 khoản2 (nguồn LAW2014, bản ký gốc datafiles.chinhphu.vn, đọc trực tiếp PDF trang17; Điều124 trang51: hiệu lực 01/01/2016) — "nghỉ hưởng chế độ thai sản từ 14 ngày làm việc trở lên trong tháng được tính là thời gian đóng BHXH, không phải đóng". `creditKind: "MATERNITY_LAW2014_ART39_2"`, bộ luật cần trích dẫn `LAW2014_ART39`. Chưa đối chiếu riêng các văn bản hợp nhất sửa đổi Luật 2014 cho khoản này (ghi trong trích dẫn).
- Tháng thai sản **01/2007–12/2015**: Luật BHXH 71/2006/QH11 Điều35 khoản2 (nguồn LAW2006 = bản toàn văn HTML Cổng TTĐT Chính phủ, không phải PDF ký; đọc trực tiếp Điều35 và Điều140 hiệu lực 01/01/2007) — toàn bộ thời gian nghỉ hưởng thai sản được tính là thời gian đóng, không có ngưỡng 14 ngày. `creditKind: "MATERNITY_LAW2006_ART35_2"`, trích dẫn `LAW2006_ART35`.
- Dùng sai loại cho giai đoạn, tháng trước 2007, hoặc bộ luật thiếu trích dẫn tương ứng → giữ CREDITED_MONTH_ASSESSMENT_REQUIRED.
- BH1 v2 đưa các tháng này vào phép tính v1 như tháng được tính, nhưng hash lịch sử vẫn gắn với lịch sử gốc; breakdown MATERNITY_CREDITED_MONTHS. Nhà nước v2 chỉ nhận nhóm dân sự (a/b).
- Sửa engine tại chỗ an toàn: kiểm chỉ đọc DB thật 07/10 có 0 bộ luật và 0 estimate lương hưu đã lưu.

**Không làm (văn bản chưa rõ):** tuổi nghỉ hưu của người sinh trước 1961/1966 — NĐ135 Điều4 chỉ quy định lộ trình từ 01/01/2021 (bảng theo năm nghỉ hưu, Phụ lục I theo tháng sinh từ 1961/1966); cách đọc "theo năm nghỉ hưu" và "đủ 60/55 theo luật cũ" cho mốc tuổi khác nhau, ảnh hưởng trợ cấp một lần → giữ HISTORICAL_BIRTH_COHORT_REVIEW_REQUIRED.

**Còn mở:** phụ cấp thâm niên điểm (a),(c) (Điều15(3)); CREDITED ngoài các loại trên (thai sản trước 2007…); BHXH tự nguyện/hỗn hợp tự nguyện và lịch sử/điều ước. Các trường hợp này vẫn có trạng thái thiếu/rà soát và vẫn nằm trong T14 chưa hoàn thành. Chưa có corpus luật thật PUBLISHED. BH2 thông thường đã kiểm13HTTP/DBrollback trên DB thật; schemaJSON mới không cần migration.

## Nền nguồn T13-03

`sources.ts`, `source-profile.ts`, `source-legacy.ts` dựng lịch từ identity pin sẵn; đối chiếu sáu nhóm dòng tiền theo tháng. Registry có thời điểm hiệu lực inclusive, `knownOn` theo ngày, hash/evidence/revision; snapshot và capture chứa lineage thuộc kế hoạch. Legacy aggregate giữ attribution và override chính xác; nguồn thường không bị cộng đôi dưới vùng override. Sau REVISE hết hạn không phục hồi revision cũ; END cắt từ đầu tháng.

`engine-v4.ts` dựng lại ngân sách từ lịch nguồn, kiểm contribution/withdrawal/capacity/surplus và dùng recurrence v3 đóng băng. `replay.ts` dispatch theo cả format/model. `upgrade.ts` so no-op rows/summary, `plans/source-snapshot.ts` serialize/read/hash/replay không đọc DB mutable. Schema nội bộ [source-snapshot.openapi.yaml](source-snapshot.openapi.yaml). Chưa nối v4 vào API preview/save/report/CSV/AI: tích hợp đó còn ở T13-03/T16. Không cho UI gọi route v4 dựa vào file thiết kế.

## Bằng chứng

Full313tests/29files và source/test typechecks đạt trước bổ sung contract test; nhóm20tests/3files sau bổ sung schema production đạt. Generate Prisma thường và TypeScript emit đã chạy đạt. Clean11migrations, upgrade4→11 giữ dữ liệu cũ, integration hiện có, custom backup/restore38bảng và retention trên bản restore đạt trong Docker tạm; container do script tạo đã được dọn.

Trước deploy: audit0010 checksum/schema, DDL transaction rollback giữ34bảng;23ca HTTP/DB gồm ownership/idempotency/CAS/hash/trigger/FK/cascade chạy rollback thành công. Deploy0011 lần đầu không hoàn thành; kiểm lại thấy chưa có bản ghi migration dở dang, lần chạy lại đạt và so dữ liệu cũ giữ nguyên. Các lượt kiểm sau deploy gặp kết nối tạm thời và đang chạy lại. Không gửi email, không gọi Gemini, không thay frontend. Bằng chứng hậu kiểm cuối cùng xem checkpoint mới nhất trong PROGRESS.md.
# Bổ sung 05/10/2026: corpus có nguồn và chọn estimate vào nguồn

Hai body luật nháp có nguồn thật nằm ở `../seed-data/legal-2026/`, hướng dẫn rà soát trong README cùng thư mục. Trình tạo kiểm SHA-256 bảy bản lưu, chép độc lập bảng cohort/hệ số và tái tạo byte hai draft; không seed hoặc tự công bố. Bộ kiểm thử sử dụng trực tiếp draft để tính mức hưởng, không chỉ chạy corpus thay thế của validator. API xác nhận nguồn cho phép chính xác CDN `xdcs.cdnchinhphu.vn` được trang Chính phủ dẫn tới; danh sách tên miền không xác thực nội dung/chữ ký.

`PensionEstimateService.captureForSource` và `pensionSourceCandidate` là bước nội bộ T14-06 cho T16, **chưa có endpoint chọn vào kế hoạch**. Service kiểm owner, hash estimate và replay; việc chọn mới phải dùng lịch đóng còn hiện hành và luật chưa bị thay thế. Caller phải gọi lại trong transaction lưu candidate, đồng thời kiểm revision/actual/plan tại T16. Đọc estimate cũ và replay nguồn đã pin vẫn không phụ thuộc dữ liệu mới.

Builder nhận registry đã kiểm, selection và evidence do server lấy (không nhận evidence từ client). Evidence giữ toàn bộ lịch đóng, luật và input của estimate cùng hash; replay kiểm lại cả hash estimate gốc. Chỉ nhận ELIGIBLE có mức hưởng dương/tháng bắt đầu. CREATE/REVISE có expectedRegistryHash/expectedSourceRevision; chỉ tạo dòng sau cutoff và từ tháng hưởng, chặn trùng nguồn pension hoặc override tổng cũ. Nguồn mới mang nhãn HYPOTHETICAL, chính sách FIXED_NOMINAL phải được chọn rõ; không tự tăng theo CPI. Khoản trợ cấp một lần trả riêng `excludedLumpSum`, không sinh vốn góp. Builder không sửa profile/actual/plan.

T16 còn phải lưu evidence bên cạnh registry trong snapshot mới, đọc/replay/attribution, API preview/save/apply và đồng bộ report/CSV/AI; chưa đóng T14-06. Schema nội bộ đã có trong `source-snapshot.openapi.yaml` và spec thiết kế expansion; không thêm vào spec production như một route đã hoạt động.
