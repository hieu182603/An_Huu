# Plan task: các việc còn lại của thuật toán phân bổ tài sản (20/11/2026)

Tài liệu giao việc cho AI thực hiện. Người kiểm (Claude, phiên phân bổ) sẽ chạy lại toàn bộ kiểm tra sau khi AI báo xong, không tin số tự khai.

Tài liệu nền, đọc trước khi làm:
- Thuật toán gốc: `sites/an-huu-trai-nghiem/thuat-toan-phan-bo-tai-san.md` (§2–§10, 7 bước).
- Plan trước và kết quả kiểm: `docs/plan-sua-thuat-toan-7-buoc-2026-11-20.md`, `docs/kiem-tra-plan-7-buoc-2026-11-20.md`.
- Bàn giao frontend còn mở: `docs/task-frontend.md`, mục `FE-ALLOCATION-7-STEPS-20261120`.
- Nhật ký backend: `backend/PROGRESS.md`, mục "20/11/2026: hoàn thiện cơ chế 7 bước theo plan".

---

## 0. Quy tắc bắt buộc (đọc hết trước khi sửa dòng nào)

### 0.1 Bắt buộc dùng skill `ponytail`

1. **Mỗi task bắt đầu bằng việc gọi skill `ponytail` (mức `full`)**, ví dụ `Skill({ skill: "ponytail" })`, trước khi đọc code để sửa. Task thuần giấy tờ hay vận hành (T2, T3, T5, T7) cũng gọi, để soi xem có thật cần viết code không.
2. **Trước khi báo xong mỗi task có sửa code, chạy `ponytail-review`** trên diff của task đó. Mọi phát hiện phải được xử lý (cắt bỏ) hoặc ghi lý do giữ vào báo cáo.
3. Tinh thần ponytail áp vào dự án này:
   - **Hỏi "việc này có cần tồn tại không" trước.** Nếu một dòng tài liệu giải quyết được thì không viết code. Nếu sửa 1 file được thì không tạo file mới.
   - **Dùng lại cái đã có**, cụ thể:
     - backend: `RetirementDecimal`, schema zod sẵn có, `review(...)`/`REVIEW_REQUIRED`, `LIMITS`;
     - frontend: `ResponsiveDialog`, `financeMoney`, `useDiscoveryQuery`, `authenticatedRequest`, các class CSS `allocation-*` sẵn có.
   - **Không thêm thư viện npm mới.** Không thêm abstraction, factory hay config "để sau này dùng". Không thêm cờ tính năng mới khi policy hoặc env đã có cơ chế bật/tắt.
   - **Ponytail không bao giờ được phép đổi đúng/sai của thuật toán.** "Lười" là ít code, **không** phải bỏ kiểm tra, bỏ test, hay bỏ guard `REVIEW_REQUIRED`. Khi ponytail và quy tắc 0.2 mâu thuẫn, **0.2 thắng**.

### 0.2 Quy tắc dự án (vi phạm là task bị trả lại)

1. **Không commit, không push, không deploy, không ghi DB thật hay DB Azure.** Chủ sản phẩm tự làm. Các task T2–T4 chỉ chuẩn bị lệnh và checklist, **người chạy là chủ sản phẩm**, trừ khi chủ sản phẩm nói rõ trong chat là giao cho AI.
2. **Không đổi số tính toán khi không được phép.** Mọi task chạm backend phải qua quy trình golden ở mục 0.4.
3. **Nguồn pháp lý:** chỉ văn bản pháp luật Việt Nam **đã ban hành**, dữ liệu tới hết 2026, không dùng bộ quy tắc dự phóng. Mỗi giá trị thuế hay phí phải ghi số hiệu văn bản, điều và khoản. Không chắc thì để trống và ghi "CHỜ CHỐT".
4. **Không tự điền tham số chính sách như thể đã duyệt.** Mọi giá trị mới chỉ vào file nháp `backend/data/drafts/*.json`, kèm chữ "CHỜ DUYỆT" và căn cứ trong `evidence`. Không publish policy.
5. **Không in hay sao chép credential, token, chuỗi kết nối, hay dữ liệu tài chính của người dùng thật.**
6. **Môi trường:** Windows + Git Bash.
   - Heredoc làm mất dấu `\`, nên viết script vá bằng công cụ Write, không dùng heredoc.
   - Nhiều file dùng CRLF; giữ nguyên kiểu xuống dòng khi sửa.
7. **Không động vào phần việc của phiên khác** đang có trong working tree (billing, admin, marketing…). Chỉ sửa các file liệt kê trong task.
8. **Ghi nhật ký:** khi xong, thêm mục ngắn vào `backend/PROGRESS.md` (backend) hoặc cập nhật mục tương ứng trong `docs/task-frontend.md` (frontend). Không tạo file báo cáo riêng nếu không được yêu cầu.

### 0.3 Lệnh kiểm chuẩn

```bash
# Backend (thư mục backend/)
npx tsc --noEmit
npx vitest run                         # hiện tại 1.613/1.613, 147 file
npx vitest run src/tests/drafts-schema.test.ts   # khi sửa file nháp

# Frontend (thư mục frontend/)
npm run typecheck
npm run test:assets                    # 133
npm run test:logic                     # 18

# E2E: luôn build lại dist trước, không dùng bản cũ
cd frontend && VITE_API_URL=http://127.0.0.1:62412/api/v1 npx vite build --outDir ../.tmp/allocation-result-review-dist --emptyOutDir
npx playwright test --config playwright.allocation-custom.config.ts         # 20/20
npx playwright test --config playwright.allocation-result-review.config.ts  # 37/37
```

Về E2E:
- Trước khi chạy, kiểm cổng 62411/62412 còn trống: `netstat -ano | grep 6241`. Không chạy hai bộ E2E song song.
- Test "custom controls and package dialog fit landscape" thỉnh thoảng lỗi tải trang. Chạy lại 2 lần mà qua thì coi là flake, và ghi vào báo cáo.

### 0.4 Quy trình golden (mọi task chạm `backend/src/modules/allocation-risk`, `retirement`, `capital`, `holdings`)

```bash
cd backend
# 1. TRƯỚC khi sửa: chụp golden
AUDIT_RUN=1 AUDIT_RAW=1 AUDIT_OUT=../.tmp/golden-before-<task>.json npx vitest run src/tests/audit-allocation-personalization.test.ts
# 2. SAU khi sửa: chụp lại
AUDIT_RUN=1 AUDIT_RAW=1 AUDIT_OUT=../.tmp/golden-after-<task>.json npx vitest run src/tests/audit-allocation-personalization.test.ts
# 3. So sánh (bỏ qua id, hash và thời gian chạy)
node scripts/compare-audit-golden.cjs ../.tmp/golden-before-<task>.json ../.tmp/golden-after-<task>.json
```

Kết quả phải là `IDENTICAL`. Nếu có khác biệt:
- chỉ được chấp nhận các khác biệt mà task ghi rõ là "được phép đổi";
- lọc chúng bằng script tạm (xem mẫu `.tmp/filter-allowed.cjs`) rồi so lại, phải ra `IDENTICAL`;
- liệt kê từng khác biệt trong báo cáo.

---

## 1. Tổng quan và thứ tự

| Mã | Việc | Ai làm | Phụ thuộc | Ước lượng |
|---|---|---|---|---|
| T1 | L5: tài liệu hóa chuỗi `rule` có đuôi | AI | — | 0,5 giờ |
| T2 | Chuẩn bị commit (gom nhóm, kiểm sạch) | AI chuẩn bị, **chủ SP commit** | T1 | 1 giờ |
| T3 | Deploy B2 và áp migration `202611200001_rebalance_decisions` | **Chủ SP chạy**, AI viết checklist | T2 | 1 giờ |
| T4 | Đo 1.000 kịch bản trên B2 | AI (sau khi chủ SP deploy) | T3 | 1 giờ |
| T5 | Duyệt tham số nháp đang CHỜ DUYỆT | **Chủ SP duyệt**, AI lập bảng duyệt | — | 1 giờ |
| T6 | Lập tham số còn thiếu (thuế phí khi bán, nghề nghiệp, sàn chi tiêu, y tế) | AI soạn nháp, chủ SP duyệt | — | 3 giờ |
| T7 | Dữ liệu thị trường đạt chuẩn (tổng lợi suất, giấy phép) | **Admin hoặc chủ SP nhập**, AI kiểm cổng chặn | — | tùy nguồn |
| T8 | Bộ tối ưu liên tục: tiêu chí bật | AI kiểm, chủ SP quyết | T5, T7 | 2 giờ |
| T9 | UI còn thiếu: B6-8, B7-1, B7-4, sàn chi tiêu | AI (frontend) | T3 cho phần kiểm tích hợp B7 | 2–3 ngày |
| T10 | Kiểm tổng cuối | AI | tất cả | 1 giờ |

Thứ tự khuyến nghị: **T1 → T2 → (chủ SP: T3) → T4**, và song song **T5, T6, T9**. T7 và T8 làm sau cùng.

Cần làm rõ từ đầu để tránh hiểu nhầm: thuật toán **đã đủ cơ chế cho 7 bước** (golden sạch, test qua). Phần còn lại là **dữ liệu, tham số, triển khai và giao diện**. Không task nào ở đây được viết lại engine.

---

## T1. L5: tài liệu hóa chuỗi `rule` có thêm đuôi

**Vấn đề.** Response chọn phương án trả về:

```
rule: "P_ESSENTIAL_THRESHOLD_THEN_MIN_CVAR_THEN_MIN_ALLOCATION_CHANGE; ASSET_CLASS_LEVEL; LOT_AND_ISSUER_LIMITS_AT_EXECUTION"
```

Chuỗi này nằm ở `backend/src/modules/allocation-risk/service.ts:228` và `:506`. Client nào so nguyên chuỗi cũ sẽ lệch. Frontend hiện không đọc trường này.

**Cách làm (ponytail: tài liệu, không code).**
1. **Không** tách trường `scope` mới, **không** đổi chuỗi. Tách trường là thêm API surface mà không ai dùng (YAGNI).
2. Trong `backend/scripts/generate-allocation-risk-openapi.cjs`, tìm chỗ khai báo property `rule` (trong YAML hiện là anchor `*a5` quanh dòng 2342 của `backend/docs/allocation-risk.openapi.yaml`). Thêm `description`:
   > "Chuỗi phân tách bằng `; `. Phần đầu là quy tắc chọn; các phần sau là phạm vi áp dụng và có thể được bổ sung. Client chỉ nên so phần trước dấu `;` đầu tiên."
3. Chạy lại generator: `node scripts/generate-allocation-risk-openapi.cjs`. Kiểm tra diff YAML chỉ có thêm `description`.
4. Nếu có test so snapshot OpenAPI (`grep -rl "allocation-risk.openapi" backend/src/tests`), chạy test đó.

**Nghiệm thu.**
- Diff chỉ gồm file generator và file YAML, không đụng `service.ts`.
- `npx vitest run` qua toàn bộ.
- Cập nhật dòng L5 trong `docs/kiem-tra-plan-7-buoc-2026-11-20.md` thành "Đã sửa".

---

## T2. Chuẩn bị commit (AI chuẩn bị, chủ sản phẩm commit)

**Cách làm.**
1. Gọi `ponytail`. Mục tiêu là **không tạo thêm file nào**; chỉ đọc `git status` và phân nhóm.
2. Chạy `git status --porcelain` và `git diff --stat`. Lập bảng nhóm commit đề xuất, mỗi nhóm một dòng gồm danh sách file và message tiếng Việt kiểu `fix(allocation): …`:
   - (a) engine/backend phân bổ 7 bước cùng test;
   - (b) migration `202611200001_rebalance_decisions` cùng `schema.prisma`;
   - (c) OpenAPI và generator;
   - (d) file nháp chính sách và dữ liệu (`backend/data/drafts/*`);
   - (e) frontend phân bổ cùng E2E;
   - (f) tài liệu (`docs/*`, `PROGRESS.md`), **kèm 3 file đã xóa theo quyết định giữ xóa**: `docs/SECONDARY_FEATURES.md`, `docs/UI_UX_AUDIT.md`, `docs/research-bhxh-no-nguon-moi.md`;
   - (g) file của phiên khác (billing, admin, marketing…): **ghi riêng, không gom vào**.
3. Kiểm không có file rác bị theo dõi: thư mục `.tmp/`, dist build E2E, file `.env`, log. Nếu thấy, báo cho chủ sản phẩm, không tự sửa `.gitignore` (file này đang có thay đổi của phiên khác).
4. Chạy đủ bộ lệnh 0.3 trên working tree hiện tại, ghi kết quả vào bảng.
5. Ghi bảng vào cuối file này (mục "Kết quả T2"). **Không chạy `git add` hay `git commit`.**

**Nghiệm thu.** Mỗi file thay đổi thuộc đúng một nhóm. Không có file trong `.tmp/` bị theo dõi. Các lệnh kiểm đều qua.

---

## T3. Deploy B2 và áp migration (chủ sản phẩm chạy)

AI **chỉ viết checklist**, chủ sản phẩm chạy. Viết checklist vào cuối file này (mục "Checklist T3"), gồm:

1. **Trước deploy:**
   - Sao lưu DB thật bằng cơ chế backup của Azure PostgreSQL, ghi thời điểm.
   - Kiểm `npx prisma migrate status` (chủ SP chạy với chuỗi kết nối thật, AI không cầm chuỗi này).
2. **Áp migration:** chạy `npx prisma migrate deploy`. Migration chỉ **tạo bảng mới** cho lịch sử quyết định tái cân bằng. AI đọc lại `backend/prisma/migrations/202611200001_rebalance_decisions/migration.sql` để xác nhận không có `DROP`/`ALTER ... DROP`/sửa dữ liệu cũ, rồi ghi kết luận vào checklist.
3. **Deploy app** `anhuu-backend` (plan `anhuu-plan` B2) theo quy trình deploy hiện có của dự án. Đọc `backend/README*` hoặc script deploy để chép đúng lệnh, không tự nghĩ lệnh mới.
4. **Kiểm sau deploy:**
   - `GET /health` và `GET /health/ready` trả 200.
   - Mở trang Phân bổ bằng tài khoản thử của chủ SP. Kết quả 20 kịch bản hiện ra rồi tăng dần lên 1.000.
   - `GET /api/v1/me/retirement/risk/rebalance/history` trả 200 (bảng mới đã có).
5. **Biến môi trường** cần giữ: `SIM_WORKERS` (B2 có 2 vCPU, giá trị đề xuất **1**; đổi phải đo ở T4). `ENABLE_CONTINUOUS_OPTIMIZER` **không đặt hoặc đặt `false`**.
6. **Quay lui:** migration chỉ thêm bảng nên quay lui app không cần quay lui DB. Ghi rõ điều này.

**Nghiệm thu.** Checklist đủ 6 phần, mọi lệnh lấy từ tài liệu hay script có sẵn trong repo (ghi nguồn), có kết luận đọc migration.

---

## T4. Đo 1.000 kịch bản trên B2 (sau khi chủ SP deploy xong)

1. Gọi `ponytail`. Dùng script có sẵn `backend/scripts/bench-simulation.cjs`, **không viết script đo mới**.
2. Chạy đúng lệnh trên máy cấu hình tương đương B2, hoặc qua Kudu/SSH của App Service nếu chủ SP cho phép:
   ```bash
   node scripts/bench-simulation.cjs --cases=C01,C05,C15 --paths=20,100,500,1000 --workers=0,1
   ```
3. Thêm một bảng vào `backend/PROGRESS.md`: thời gian theo ca × số đường × số worker, so với local (C01 1.000 đường: 95 s không worker, 51 s 1 worker).
4. Kết luận: `SIM_WORKERS` nên là 0, 1 hay 2 trên B2. Nếu đề xuất 2 thì phải có số đo và kiểm bộ nhớ (B2 có 3,5 GB) không vượt 80%.
5. Kiểm mốc tăng dần 20→1.000 trên production: thời gian mỗi bước tiếp nối, và rate limiter cho request tiếp nối không chặn nhầm.

**Nghiệm thu.** Có bảng số thật, có đề xuất `SIM_WORKERS` kèm lý do. Không sửa code, trừ khi phát hiện lỗi; khi đó dừng và báo.

---

## T5. Duyệt tham số đang CHỜ DUYỆT (chủ sản phẩm duyệt)

1. Gọi `ponytail`. Làm một bảng duyệt, **không viết công cụ duyệt mới**. Admin đã có trang thông số phân bổ (`frontend/src/pages/admin/AdminPortfolioPoliciesPage.tsx` và trang tham số phân bổ, xem mục `FE-ADMIN-ALLOC-PARAMS-20261118` trong `docs/task-frontend.md`).
2. Đọc `backend/data/drafts/policy-params-draft.json`, liệt kê **mọi** giá trị đang CHỜ DUYỆT vào bảng gồm các cột: đường dẫn JSON | giá trị | căn cứ trong tài liệu thuật toán (mục §) | ảnh hưởng khi bật | ca audit thể hiện ảnh hưởng. Tối thiểu có:
   - `allocationRisk.stresses.EQUITY_CRASH.offsetsMonths` = `[-12, 0, 12, 24]`, `shockPercent` −35, `severeShockPercent` −50 (§9.1);
   - `allocationRisk.stresses.GOLD.spreadPoints` = `["5","10"]`;
   - `allocationRisk.stresses.LONGEVITY.extraYears` = `[5,10]`;
   - `allocationRisk.stresses.SEQUENCE_OF_RETURNS` = EQUITY −20% / +25%;
   - `lossReaction` (B2-2);
   - các khối khác có chữ CHỜ DUYỆT trong `evidence`.
3. Với mỗi giá trị, chạy audit với policy nháp để thấy ảnh hưởng. Dùng cơ chế sẵn có của harness audit: kiểm `src/tests/audit-allocation-personalization.test.ts` xem có cách nạp policy nháp không; **nếu không có thì không thêm**, chỉ ghi "ảnh hưởng: chưa đo".
4. Ghi bảng vào cuối file này (mục "Bảng duyệt T5"). Chủ SP đánh dấu Duyệt hoặc Không và publish trên trang admin. **AI không publish.**

**Nghiệm thu.** Bảng đủ mọi mục CHỜ DUYỆT (đối chiếu bằng `grep -c "CHỜ DUYỆT"`), mỗi dòng có căn cứ §.

---

## T6. Soạn tham số còn thiếu (AI soạn nháp, chủ SP duyệt)

Các cơ chế dưới đây **đã có code và đang tắt** vì policy chưa có giá trị. Việc của task này là **chỉ điền file nháp**. **Không sửa engine.**

| Mục | Trường trong schema | File schema | Ghi chú cách điền |
|---|---|---|---|
| B7-2 thuế khi bán | `allocationRisk.rebalance.saleTaxPercent`, `transactionFeePercent`, `evidence` | `backend/src/modules/allocation-risk/policy.ts:25-29` | Thuế suất **chỉ lấy từ văn bản đã ban hành còn hiệu lực năm 2026** (luật thuế TNCN và văn bản hướng dẫn hiện hành về chuyển nhượng chứng khoán). Ghi số hiệu, điều, khoản trong `evidence`. Phí giao dịch là phí công ty chứng khoán, không phải luật, nên ghi "giả định, cần chủ SP chọn công ty". Không tìm được văn bản chắc chắn thì để trống và ghi CHỜ CHỐT |
| B2-4 nghề nghiệp | `occupationalRisk` (`incomeStability.UNCERTAIN.maxEquityPercent`, `employerConcentration.*`) | policy schema v2, xem `service.ts:359-370` | Tài liệu thuật toán không cho con số cụ thể, nên **đề xuất một con số kèm lập luận** và ghi rõ "đề xuất của AI, không có trong tài liệu". `excludeEmployerSector` chỉ bật khi đã có ánh xạ ngành; hiện chưa có nên để `false` hoặc bỏ trống |
| B7-6 sàn chi tiêu | `glidePath.spendingFloorYears` (1–10) trong template danh mục | `backend/src/modules/portfolios/schema.ts:32` | Spec nêu khoảng 3–5 năm. Đề xuất **một** giá trị trong khoảng (ví dụ 3) và nêu lý do. Đặt vào file nháp template danh mục tương ứng, không đặt vào policy rủi ro |
| B6-6 y tế | `stresses.HIGH_INFLATION.healthDeltaPoints`, `stresses.LONGEVITY.lateLifeCareMonthly` | `policy.ts` khối `stresses` | Chỉ dùng số liệu chính thức đã công bố (ví dụ CPI nhóm thuốc và dịch vụ y tế của Tổng cục Thống kê đến 2026). Không có nguồn thì để trống, ghi CHỜ CHỐT |

**Cách làm.**
1. Gọi `ponytail`.
2. Chụp golden trước khi sửa (0.4). File nháp không ảnh hưởng golden, nhưng chụp để chứng minh.
3. Sửa đúng file nháp, giữ CRLF. Mỗi giá trị kèm một câu trong `evidence`, mở đầu bằng "CHỜ DUYỆT (bổ sung <ngày>):".
4. Chạy `npx vitest run src/tests/drafts-schema.test.ts`. File nháp phải qua schema thật. Nếu schema từ chối thì **sửa giá trị, không sửa schema**.
5. Chụp golden sau khi sửa; phải ra `IDENTICAL`.
6. Thêm các dòng mới vào bảng duyệt T5.

**Nghiệm thu.**
- Không đổi file `.ts` nào.
- Test schema nháp qua, golden `IDENTICAL`.
- Mỗi giá trị có căn cứ hoặc ghi "đề xuất AI" hoặc "CHỜ CHỐT".

---

## T7. Dữ liệu thị trường đạt chuẩn (admin hoặc chủ SP nhập, AI kiểm cổng chặn)

**Tình trạng.**
- Cổng chặn công bố đã có (B4-1): mỗi tài sản cần `returnBasis` và `licenseStatus`. Xem `backend/src/modules/allocation-risk/market-schema.ts:12-55`.
- Kiểm sai lệch (B4-2) cũng đã có.
- Dữ liệu nháp `backend/data/drafts/market-data-draft.json` **chưa đạt**: chưa phải tổng lợi suất hoặc chưa xác minh giấy phép.

**AI làm.**
1. Gọi `ponytail`. **Không viết pipeline nhập dữ liệu mới.** Admin đã có trang nhập dữ liệu thị trường theo ngày.
2. Lập checklist dữ liệu cho từng lớp tài sản trong file nháp. Mỗi lớp ghi: nguồn hiện tại | `returnBasis` hiện tại | thiếu gì để thành tổng lợi suất (cổ tức, coupon tái đầu tư) | `licenseStatus` | người cần xác minh giấy phép.
3. Viết **một test** (thêm vào file test market-schema sẵn có, không tạo file mới nếu đã có file phù hợp) khẳng định: tài sản `UNVERIFIED` hoặc không phải tổng lợi suất thì **không** publish được và mô phỏng gắn giới hạn tương ứng. Nếu test như vậy đã có, chỉ ghi tên test, **không viết thêm**.
4. **Không tự sửa** `returnBasis` thành `TOTAL_RETURN` hay `licenseStatus` thành `VERIFIED` trong file nháp. Đó là việc của người có bằng chứng.

**Nghiệm thu.** Có checklist theo lớp tài sản. Có tên test chứng minh cổng chặn hoạt động. Không đổi dữ liệu.

---

## T8. Bộ tối ưu liên tục: tiêu chí bật (AI kiểm, chủ SP quyết)

**Tình trạng.** Code có ở `optimizer-candidate.ts`. Bộ tối ưu chỉ chạy khi:
- env `ENABLE_CONTINUOUS_OPTIMIZER=true` (`backend/src/config/env.ts:8`), và
- policy publish có khối `continuousOptimizer`.

Ca C17 đã kiểm. Production đang tắt.

**AI làm (chỉ sau khi T5 và T7 xong).**
1. Gọi `ponytail`. **Không thêm cờ mới**: env và policy là đủ hai lớp khóa.
2. Chạy audit C01–C17 hai lần, một lần env tắt và một lần bật (local, policy nháp có `continuousOptimizer`). So golden, liệt kê ca nào đổi phương án được chọn, đổi bao nhiêu điểm %, pEssential và CVaR trước/sau.
3. Kiểm: khi tối ưu thất bại hoặc vi phạm ràng buộc thì trả `REVIEW_REQUIRED` hoặc `OPTIMIZER_CONSTRAINTS_REQUIRED`, không trả danh mục rỗng; `ENABLE_OPTIMIZER_FALLBACK` vẫn tắt.
4. Viết kết luận vào `backend/PROGRESS.md`: nên bật hay chưa, kèm điều kiện. **Không bật trên production.**

**Nghiệm thu.** Có bảng so sánh 17 ca và kết luận. Không đổi code. Env production không đổi.

---

## T9. Giao diện còn thiếu (frontend)

Đọc kỹ `docs/task-frontend.md` mục `FE-ALLOCATION-7-STEPS-20261120`, phần "Còn bàn giao". API backend **đã có và đã test**; task chỉ làm UI.

**Ràng buộc ponytail cho T9.**
- Không thêm thư viện, không thêm state manager hay thư viện form/bảng.
- Dùng `ResponsiveDialog`, `financeMoney`, `useDiscoveryQuery`, `authenticatedRequest`, `t(vi, en)` theo mẫu trong `frontend/src/components/AllocationScenarios.tsx`.
- Mỗi việc ưu tiên **sửa file đã có**: `InvestmentsPage.tsx`, `AllocationResults.tsx`, `RiskAnalysis.tsx`, `services/investments.ts`, `services/planningAnalysis.ts`. Chỉ tạo component mới khi file đích vượt ~400 dòng.
- Không tạo trang mới nếu có thể đặt vào trang hoặc dialog sẵn có.
- Mọi chữ hiện cho khách là tiếng Việt dễ hiểu, không lộ mã kỹ thuật (theo phụ lục câu chữ trong `docs/task-frontend.md` §8).

### T9.1 B6-8: khách chọn ngưỡng xác suất đủ thiết yếu

- **API:** `analyzeRisk(..., essentialThreshold)` đã có tham số cuối (`frontend/src/services/planningAnalysis.ts:47`). Khoảng cho phép lấy từ policy `allocationRisk.essentialThresholdRange` `{min,max}`. Kiểm tra API đọc policy hiện có trả trường này; nếu không trả, **dừng và báo** người kiểm, đừng tự sửa backend.
- **UI:** một ô chọn (select theo bước 0,05, hoặc input number) đặt cạnh kết quả chọn phương án trong `AllocationResults.tsx`.
  - Không có khối range thì **không hiện ô**, dùng ngưỡng ghim.
  - Giá trị ngoài khoảng mà backend trả 422 thì hiện thông báo lỗi, giữ giá trị cũ.
  - Hiển thị "Đang dùng ngưỡng X%" cùng lượt kết quả. Không tự đổi ngưỡng.
- **Test:** thêm 1–2 test E2E vào `frontend/tests/user-allocation-custom.spec.ts` (mock range, đổi ngưỡng, request có `essentialThreshold`; trường hợp 422).

### T9.2 B7-1: lịch sử quyết định tái cân bằng

- **API:**
  - `POST /me/retirement/risk/rebalance` với `record:true`, `planId`, `planVersionId`;
  - `GET /me/retirement/risk/rebalance/history`;
  - `POST /me/retirement/risk/rebalance/:id/decision` với body `{decision:"ACCEPTED"|"DISMISSED", note?}`.

  Đã có `proposeRebalance` ở `planningAnalysis.ts:65`; thêm 2 hàm cạnh đó, **không tạo file service mới**.
- **UI:** trong dialog hoặc khu đề xuất tái cân bằng sẵn có:
  - nút "Đồng ý" / "Bỏ qua", kèm ghi chú tùy chọn;
  - danh sách lịch sử (ngày, đề xuất tóm tắt, quyết định, ghi chú).
  - Dòng chú thích bắt buộc: "Đồng ý chỉ ghi lại quyết định, An Hưu không đặt lệnh."
- **So sánh xác suất** (`compareProbabilities:true`, cần hai ID):
  - chỉ hiện trước/sau khi `comparison.status === "READY"`;
  - **giá trị null hiện "—", không đổi thành 0**;
  - nếu chạy 20 đường thì ghi "kết quả sơ bộ".
- **Phụ thuộc:** cần migration ở DB đang test. E2E dùng mock; kiểm tích hợp thật để sau T3.
- **Test:** E2E mock cho: ghi quyết định, danh sách lịch sử, comparison null.

### T9.3 B7-4: giám sát lệch tỷ trọng và lệnh tham khảo

- **API** (prefix `/api/v1/me`):
  - `GET /investments/holdings/drift`;
  - `POST /investments/holdings/rebalance-orders`.

  Tham số: `planId`/`versionId` hiện hành, `newContribution`, `driftThresholdPercent` tùy chọn. Thêm vào `frontend/src/services/investments.ts` cạnh `rebalance`.
- **UI:** trong `frontend/src/pages/InvestmentsPage.tsx`, cạnh nút "Xem đề xuất" hiện có.
  - Hiện **riêng** hai trạng thái:
    - `isDrifted`: lệch so với mục tiêu, trước khi dùng tiền mặt;
    - `rebalanceRequired`: vẫn cần tái cân bằng sau khi đã dùng tiền mặt, hoặc thiếu sàn.
  - Hiện `maxDriftPercent`, `driftThresholdPercent`, `costEstimated`, `cashUsedBeforeTrades`, và bảng lệnh (đã làm tròn theo lô).
- **Cấm:**
  - không có nút đặt lệnh thật (response có `persisted:false`);
  - **không cộng lại `cashAllocated`** vào khoản BUY, vì BUY đã gồm tiền mặt phân bổ.
- **Test:** E2E mock cho ba trường hợp: lệch nhưng tiền mặt đủ bù (`isDrifted` đúng, `rebalanceRequired` sai), cần lệnh, và kiểm tổng BUY không bị cộng đôi.

### T9.4 Sàn chi tiêu trong lộ trình (chỉ khi policy bật `spendingFloorYears`)

- Thiếu dữ liệu thì hiện trạng thái `REVIEW_REQUIRED` bằng câu dễ hiểu. **Không gửi lại mục tiêu mẫu để lách sàn.**
- Mức thiếu sàn dưới 5 điểm % vẫn có thể cần tái cân bằng. UI không được ẩn trường hợp này.
- Khi BOND gồm quỹ trái phiếu chưa chứng minh là trái phiếu chính phủ, giữ nguyên trạng thái REVIEW. **Không tự gắn nhãn an toàn.**
- `RiskAnalysis.tsx` đã giải thích `SPENDING_FLOOR_BREACHED`; dùng lại phần đó.

**Nghiệm thu T9.**
- `npm run typecheck`, `test:assets` (≥133), `test:logic` (18) qua.
- E2E hai bộ qua (≥20 và ≥37 cộng các test mới).
- `ponytail-review` sạch trên diff frontend.
- Chụp ảnh 4 màn (desktop và mobile 375 px) để vào `docs/task-frontend.md`.
- Cập nhật mục `FE-ALLOCATION-7-STEPS-20261120`: chuyển các mục 1–4 sang "ĐÃ LÀM".

---

## T10. Kiểm tổng cuối

1. Chạy toàn bộ mục 0.3 và golden 0.4, so với `.tmp/golden-before-plan.json` (bản gốc trước plan 7 bước) qua bộ lọc cho phép. Phải ra `IDENTICAL` ngoài các khác biệt đã liệt kê trong `docs/kiem-tra-plan-7-buoc-2026-11-20.md` §1.
2. Chạy `ponytail-review` trên **toàn bộ diff** của plan này. Báo cáo số dòng thêm và xóa theo task.
3. Cập nhật `docs/kiem-tra-plan-7-buoc-2026-11-20.md` (trạng thái L5, B6-1, B6-8, B7-1, B7-4) và `backend/PROGRESS.md`.
4. Gửi báo cáo cuối theo mẫu mục 3.

---

## 2. Phân quyền file (tránh hai việc đè nhau)

| Task | Được sửa | Không được sửa |
|---|---|---|
| T1 | `backend/scripts/generate-allocation-risk-openapi.cjs`, `backend/docs/allocation-risk.openapi.yaml`, dòng L5 trong file kiểm | mọi `.ts` |
| T2, T3, T5 | chỉ file này (các mục kết quả ở cuối) | mọi file khác |
| T4, T8 | `backend/PROGRESS.md` | code, env production |
| T6 | `backend/data/drafts/*.json` | mọi `.ts`, schema |
| T7 | 1 test market-schema (nếu thiếu), file này | dữ liệu nháp |
| T9 | `frontend/src/**` liên quan phân bổ và đầu tư, `frontend/tests/user-allocation-custom.spec.ts`, `frontend/tests/*allocation-result-review*`, `docs/task-frontend.md` | `backend/**` |
| T10 | file kiểm, `PROGRESS.md` | code |

Phát hiện lỗi backend trong lúc làm T9 thì **dừng, ghi lại và báo**, không tự sửa backend.

---

## 3. Mẫu báo cáo khi xong mỗi task

```
Task: T?
Đã gọi ponytail: có (mức full) | ponytail-review: <số phát hiện, đã xử lý thế nào>
File đã sửa: <danh sách>   (+X / −Y dòng)
Lệnh kiểm đã chạy và kết quả: <dán số thật: tsc, vitest x/y, assets, logic, E2E x/y>
Golden: IDENTICAL | khác biệt được phép: <liệt kê>
Việc chưa làm hoặc CHỜ CHỐT: <liệt kê>
Rủi ro hoặc ghi chú cho người kiểm: <…>
```

Không ghi "đã kiểm" mà không có số. Test lỗi thì dán output lỗi.

---

## 4. Những việc KHÔNG nằm trong plan (đừng làm)

- Viết lại hay "tối ưu thêm" engine mô phỏng, kernel v5 hay quy tắc chọn §7.4.
- Đổi số đường, seed (20261016), độ dài khối bootstrap, ngưỡng 90%.
- Publish policy hay dữ liệu thị trường, bật bộ tối ưu trên production.
- Khôi phục 3 file tài liệu đã xóa (chủ SP đã chốt giữ xóa).
- Sửa phần billing, admin, marketing của phiên khác.

---

## Kết quả T2

Ponytail full; chỉ phân nhóm, chưa stage/commit/push. Snapshot 187 đường dẫn, mỗi đường dẫn đúng một nhóm. Nhóm g là file dùng chung/của phiên khác, không gom tự động. Các nhóm a–f có phụ thuộc, phải kiểm lại toàn tập trước phát hành.

| Nhóm | Số file | Message đề xuất | File chính xác |
|---|---:|---|---|
| a | 113 | fix(allocation): hoàn thiện cơ chế 7 bước và kiểm hồi quy | backend/scripts/discovery-ui-test-server.cjs<br>backend/src/modules/actuals/service.ts<br>backend/src/modules/allocation-risk/estimation.ts<br>backend/src/modules/allocation-risk/loss-candidates.ts<br>backend/src/modules/allocation-risk/market-schema.ts<br>backend/src/modules/allocation-risk/market-service.ts<br>backend/src/modules/allocation-risk/optimizer-candidate.ts<br>backend/src/modules/allocation-risk/policy.ts<br>backend/src/modules/allocation-risk/rebalance.ts<br>backend/src/modules/allocation-risk/router.ts<br>backend/src/modules/allocation-risk/schema.ts<br>backend/src/modules/allocation-risk/selection.ts<br>backend/src/modules/allocation-risk/service.ts<br>backend/src/modules/allocation-risk/simulation.ts<br>backend/src/modules/allocation-risk/stresses.ts<br>backend/src/modules/assumptions/schema.ts<br>backend/src/modules/capital/loss-constraint.ts<br>backend/src/modules/capital/separation.ts<br>backend/src/modules/explanations/glossary.ts<br>backend/src/modules/explanations/registry.ts<br>backend/src/modules/holdings/repository.ts<br>backend/src/modules/holdings/service.ts<br>backend/src/modules/plans/presentation.ts<br>backend/src/modules/plans/service.ts<br>backend/src/modules/portfolios/engine.ts<br>backend/src/modules/portfolios/schema.ts<br>backend/src/modules/portfolios/workspace.ts<br>backend/src/modules/profiles/schema-v2.ts<br>backend/src/modules/recommendation/router.ts<br>backend/src/modules/retirement/advisory-fee.ts<br>backend/src/modules/retirement/engine-v4.ts<br>backend/src/modules/retirement/engine.ts<br>backend/src/modules/retirement/prepare.ts<br>backend/src/modules/retirement/preview-insights.ts<br>backend/src/modules/retirement/protected-capital.ts<br>backend/src/modules/retirement/replay.ts<br>backend/src/modules/retirement/schema.ts<br>backend/src/modules/retirement/service.ts<br>backend/src/modules/retirement/upgrade.ts<br>backend/src/tests/allocation-custom-fixtures.ts<br>backend/src/tests/allocation-custom.test.ts<br>backend/src/tests/allocation-risk-api.test.ts<br>backend/src/tests/allocation-risk-fixtures.ts<br>backend/src/tests/allocation-risk.test.ts<br>backend/src/tests/allocation-workspace-fixtures.ts<br>backend/src/tests/asset-reforecast.test.ts<br>backend/src/tests/backend-batch-a.test.ts<br>backend/src/tests/capital-separation.test.ts<br>backend/src/tests/challenger-2-f03-f09-adversarial.test.ts<br>backend/src/tests/challenger-m1-it2-empirical.test.ts<br>backend/src/tests/contribution-policy.test.ts<br>backend/src/tests/explanations-registry.test.ts<br>backend/src/tests/holdings-monitoring.test.ts<br>backend/src/tests/longevity-stress.test.ts<br>backend/src/tests/memory-db.ts<br>backend/src/tests/optimizer-candidate.test.ts<br>backend/src/tests/plan-presentation.test.ts<br>backend/src/tests/profile-family.test.ts<br>backend/src/tests/retirement-monthly.test.ts<br>backend/src/tests/source-reforecast.test.ts<br>backend/src/tests/source-registry.test.ts<br>backend/scripts/bench-simulation.cjs<br>backend/scripts/compare-audit-golden.cjs<br>backend/scripts/verify-rebalance-migration.cjs<br>backend/src/modules/allocation-risk/adjustments.ts<br>backend/src/modules/allocation-risk/current-weights.ts<br>backend/src/modules/allocation-risk/rebalance-decisions.ts<br>backend/src/modules/allocation-risk/simulation-cache.ts<br>backend/src/modules/allocation-risk/simulation-kernel.ts<br>backend/src/modules/allocation-risk/simulation-pool.ts<br>backend/src/modules/allocation-risk/simulation-worker.ts<br>backend/src/modules/capital/liquidity.ts<br>backend/src/modules/retirement/engine-core.ts<br>backend/src/modules/retirement/engine-v3.ts<br>backend/src/modules/retirement/engine-v5.ts<br>backend/src/modules/retirement/obligations.ts<br>backend/src/modules/retirement/spending-floor.ts<br>backend/src/tests/allocation-algorithm-fixes.test.ts<br>backend/src/tests/allocation-contribution-first.test.ts<br>backend/src/tests/allocation-deferrable-c16.test.ts<br>backend/src/tests/allocation-explanation.test.ts<br>backend/src/tests/allocation-fee-v5.test.ts<br>backend/src/tests/allocation-optimizer-c17.test.ts<br>backend/src/tests/allocation-policy-cap.test.ts<br>backend/src/tests/allocation-risk-incremental.test.ts<br>backend/src/tests/allocation-risk-parallel.test.ts<br>backend/src/tests/allocation-risk-v5.test.ts<br>backend/src/tests/allocation-seven-step-regressions.test.ts<br>backend/src/tests/allocation-spending-floor-band.test.ts<br>backend/src/tests/allocation-step5-step7-guards.test.ts<br>backend/src/tests/allocation-threshold-override.test.ts<br>backend/src/tests/allocation-turnover-current.test.ts<br>backend/src/tests/audit-allocation-personalization.test.ts<br>backend/src/tests/capital-reserve-stability.test.ts<br>backend/src/tests/capital-step1-step3.test.ts<br>backend/src/tests/engine-v5.test.ts<br>backend/src/tests/holdings-cash-orders.test.ts<br>backend/src/tests/holdings-rebalance-routes.test.ts<br>backend/src/tests/holdings-spending-floor-safety.test.ts<br>backend/src/tests/ledoit-wolf-cc.test.ts<br>backend/src/tests/liquidity-confirmation.test.ts<br>backend/src/tests/market-data-governance.test.ts<br>backend/src/tests/market-data-warnings.test.ts<br>backend/src/tests/obligation-schedule-nominal.test.ts<br>backend/src/tests/plans-v5-convention.test.ts<br>backend/src/tests/rebalance-cash-band.test.ts<br>backend/src/tests/rebalance-decisions.test.ts<br>backend/src/tests/rebalance-floor-band.test.ts<br>backend/src/tests/rebalance-probability.test.ts<br>backend/src/tests/rebalance-tax-fee.test.ts<br>backend/src/tests/spending-floor-integration.test.ts<br>backend/src/tests/stress-health-latelife.test.ts<br>backend/src/tests/stress-scenarios-complete.test.ts |
| b | 2 | feat(allocation): thêm lịch sử quyết định tái cân bằng | backend/prisma/schema.prisma<br>backend/prisma/migrations/202611200001_rebalance_decisions/migration.sql |
| c | 17 | docs(api): đồng bộ hợp đồng phân bổ và mô tả rule | backend/docs/actuals.openapi.yaml<br>backend/docs/allocation-risk.openapi.yaml<br>backend/docs/allocation-workspace.openapi.yaml<br>backend/docs/assumptions.openapi.yaml<br>backend/docs/openapi.yaml<br>backend/docs/plans.openapi.yaml<br>backend/docs/portfolios.openapi.yaml<br>backend/docs/profile-v2.openapi.yaml<br>backend/docs/retirement.openapi.yaml<br>backend/docs/source-snapshot.openapi.yaml<br>backend/scripts/generate-allocation-risk-openapi.cjs<br>backend/scripts/generate-allocation-workspace-openapi.cjs<br>backend/scripts/generate-assumptions-openapi.cjs<br>backend/scripts/generate-plans-openapi.cjs<br>backend/scripts/generate-portfolios-openapi.cjs<br>backend/scripts/generate-retirement-openapi.cjs<br>backend/scripts/generate-source-openapi.cjs |
| d | 3 | docs(policy): bổ sung tham số nháp chờ duyệt | backend/data/drafts/market-data-draft.json<br>backend/data/drafts/policy-params-draft.json<br>backend/data/drafts/emergency-reserve-months-draft.json |
| e | 39 | feat(allocation-ui): hoàn thiện màn phân bổ và vận hành | frontend/scripts/demo-engine-parity.test.mjs<br>frontend/scripts/loss-tolerance.test.mjs<br>frontend/src/App.tsx<br>frontend/src/components/AllocationExperiment.tsx<br>frontend/src/components/AllocationLossLimit.tsx<br>frontend/src/components/AllocationPersonalInputs.tsx<br>frontend/src/components/AllocationProfileEdits.tsx<br>frontend/src/components/AllocationResults.tsx<br>frontend/src/components/AllocationScenarios.tsx<br>frontend/src/components/CurrentPlanBanner.tsx<br>frontend/src/components/allocation-experiment.css<br>frontend/src/components/allocation-results.css<br>frontend/src/components/explanations/catalog.ts<br>frontend/src/components/retirement/AdvisoryFeeEditor.tsx<br>frontend/src/components/retirement/AnalysisResults.tsx<br>frontend/src/components/retirement/MonthlyCashflowTable.tsx<br>frontend/src/components/retirement/PlanMoneyExplanation.tsx<br>frontend/src/components/retirement/RiskAnalysis.tsx<br>frontend/src/pages/AllocationWorkspace.tsx<br>frontend/src/pages/FinancialConstraintsPage.tsx<br>frontend/src/pages/InvestmentsPage.tsx<br>frontend/src/pages/PlanSavedViews.tsx<br>frontend/src/pages/RetirementPlanPage.tsx<br>frontend/src/pages/RiskPortfolioPage.tsx<br>frontend/src/pages/allocation-workspace.css<br>frontend/src/services/allocationWorkspace.ts<br>frontend/src/services/assumptions.ts<br>frontend/src/services/financialProfile.ts<br>frontend/src/services/investments.ts<br>frontend/src/services/planningAnalysis.ts<br>frontend/src/services/plans.ts<br>frontend/src/services/portfolios.ts<br>frontend/src/services/retirement.ts<br>frontend/src/utils/lossTolerance.ts<br>frontend/tests/user-allocation-custom.spec.ts<br>frontend/tests/user-allocation-sync.spec.ts<br>frontend/src/components/AllocationAdjustments.tsx<br>frontend/src/components/AllocationObligations.tsx<br>frontend/src/components/CalculationNoticeBanner.tsx |
| f | 5 | docs(allocation): ghi bằng chứng và việc còn chờ | backend/PROGRESS.md<br>docs/SECONDARY_FEATURES.md<br>docs/UI_UX_AUDIT.md<br>docs/research-bhxh-no-nguon-moi.md<br>docs/task-frontend.md |
| g | 8 | Tách riêng, xác nhận chủ sở hữu từng hunk | .gitignore<br>backend/src/modules/router.ts<br>backend/src/modules/services.ts<br>backend/src/server.ts<br>frontend/src/components/DemoNavigationIcon.tsx<br>frontend/src/pages/UserLayout.tsx<br>frontend/src/pages/admin/AdminFinancialConfigPage.tsx<br>frontend/src/pages/user-demo-theme.css |

Kiểm file rác: git ls-files .tmp và git ls-files *.env *.log *dist* không trả file. Build nằm trong .tmp/ đã ignore. Hai tài liệu plan này và docs/kiem-tra-plan-7-buoc-2026-11-20.md bị .gitignore:117 (*.md) bỏ qua; chủ sản phẩm phải chọn rõ tài liệu cần giữ khi chuẩn bị commit. Không sửa .gitignore.

Kiểm nền trước T9: backend tsc PASS, vitest1613/1613 (147file,59,30s); frontend tsc PASS, assets133/133, logic18/18; build Vite mới PASS; E2E custom20/20 (1,2phút), result-review37/37 (1,5phút), không retry. Số nền không thay nghiệm thu code mới.

T1: generator+1/−1 dòng, YAML+5/−1 dòng (alias string bung thành type+description); L5 và câu kết đã cập nhật. Generator exit0, vitest1613/1613. Không đổi service/response; ponytail-review0 phát hiện. Không chụp golden-before-T1 vì chỉ sửa mô tả schema, không chạm module tính toán; không tự khai có bản golden này.

## Checklist T3

Ponytail full; chỉ chuẩn bị. Chủ sản phẩm chạy mọi bước production/DB. **T3 chưa chạy; T4 chưa có số B2**.

1. Trước deploy: sao lưu Azure PostgreSQL theo cơ chế backup hiện có, ghi thời điểm/phương án khôi phục; chủ sản phẩm chạy npx prisma migrate status trong backend với kết nối thật do mình giữ. Đọc drift billing payment_order_code_seq trong docs/bao-cao-hoan-thien-thuat-toan-7-buoc-2026-11-20.md trước khi quyết định áp migration. Không reset DB hay sửa migration cũ để mất cảnh báo.
2. Migration: chủ sản phẩm chạy npx prisma migrate deploy (backend/package.json, script prisma:deploy). Đã đọc SQL 202611200001_rebalance_decisions: CREATE TABLE/INDEX IF NOT EXISTS, ADD FK/CHECK trên bảng mới; không DROP, không UPDATE/DELETE/INSERT dữ liệu cũ. FK có ON DELETE CASCADE từ users sang lịch sử. Lệnh deploy áp mọi migration pending, không mặc định chỉ có một; đối chiếu status trước. Kiểm migration riêng không chứng nhận toàn schema hết drift.
3. Deploy theo .github/workflows/backend-ci-cd.yml: chủ sản phẩm chọn workflow Backend CI / CD — Azure Deployment (workflow_dispatch hoặc push main đã duyệt), kiểm BACKEND_DEPLOY_ENABLED=true, environment production và publish profile trong Secrets. Workflow chạy npm ci/prisma:generate/verify, kiểm DB cô lập, prune dev deps; azure/webapps-deploy@v3 đẩy package backend vào anhuu-backend. Repo không có script CLI deploy B2 riêng nên không tự chế lệnh. Workflow không áp migration production.
4. Sau deploy: chủ sản phẩm xác nhận GET /health và /health/ready trả200; tài khoản thử mở Phân bổ, kiểm20→1000 đường và continuation; GET /api/v1/me/retirement/risk/rebalance/history trả200. T9 B7 kiểm tích hợp thật sau bước này. Không dán token hay số liệu tài khoản thật vào báo cáo.
5. Giữ ENABLE_CONTINUOUS_OPTIMIZER không đặt/false, không bật ENABLE_OPTIMIZER_FALLBACK. SIM_WORKERS=1 là ứng viên cần đo T4, chưa phải kết luận B2; ghi giá trị trước khi đổi. Sau khi xác nhận đích chạy và cho phép, T4 dùng script sẵn: node scripts/bench-simulation.cjs --cases=C01,C05,C15 --paths=20,100,500,1000 --workers=0,1. AI chưa chạy production.
6. Quay lui: khôi phục bản app đã xác nhận tốt; migration mới chỉ thêm bảng nên không xóa bảng để quay lui app. Giữ lịch sử/backup, kiểm lại health/ready. Chủ sản phẩm ghi commit/version, thời điểm migration/deploy, kết quả health và số đo T4.

Nguồn: workflow CI/CD, backend/package.json, SQL migration và báo cáo drift nêu trên. Chưa thực hiện bước production nào.

## Bảng duyệt T5

Ponytail full; **tất cả CHỜ DUYỆT, chưa publish**. P = `backend/data/drafts/policy-params-draft.json`; R = `backend/data/drafts/emergency-reserve-months-draft.json`. Chủ sản phẩm duyệt từng dòng trên giao diện admin; dấu § chỉ căn cứ yêu cầu/phạm vi, không biến các con số do An Hưu/AI chọn thành con số của tài liệu.

| Đường dẫn JSON | Giá trị nháp hiện tại | Căn cứ / phần do sản phẩm chọn | Ảnh hưởng khi duyệt | Audit / số đo riêng |
|---|---|---|---|---|
| P.templates[0..2].rebalance (3 evidence) | everyMonths 12, START_OF_MONTH, turnoverCostPercent 0.2, HALF_L1_TURNOVER_TIMES_COST | §8.2; chu kỳ/chi phí kế thừa v4, cần duyệt riêng | Lịch/chi phí tái cân bằng tất định | Chưa đo; harness không nạp templates nháp |
| P.templates[0..2].glidePath.points và P._meta.ruleMapping | 3 bảng/ánh xạ giữ nguyên trong file nháp | §4.1; thận trọng/tăng trưởng là điều chỉnh sản phẩm đã ghi nhãn | Tỷ trọng nền theo thời hạn/khảo sát | Chưa đo riêng; không coi bảng này là đã duyệt |
| P.lossStress | CASH 0%, GOV_BOND −5%, EQUITY −35%, GOLD −10%; equityAssetClass EQUITY, depositAssetClass CASH | §10.4; mức nặng cổ phiếu ở §9.1 | Giới hạn lỗ/ứng viên khả thi | Chưa đo; harness không nạp lossStress nháp |
| P.allocationRisk.blockMonths | 12 | §7.1 cho 12–36; sản phẩm chọn 12 | Khối bootstrap | Chưa đo riêng |
| P.allocationRisk.cvarAlpha | 0.95 | §7.3 | Đuôi thiếu hụt CVaR | Chưa đo riêng |
| P.allocationRisk.essentialThreshold | 0.90 | §7.3–7.4 cho90–95%; sản phẩm chọn90% | Ngưỡng đủ thiết yếu | Chưa đo riêng; essentialThresholdRange chưa có trong bản nháp |
| P.allocationRisk.allGoalsThreshold | 0.80 | Lựa chọn An Hưu, không có số80% trong spec | Chỉ báo mục tiêu tổng thể | Chưa đo riêng |
| P.allocationRisk.equityShiftPoints | 10 | Bước ứng viên kế thừa v4; §7.4 không ấn định10 | Khoảng ứng viên hữu hạn | Chưa đo riêng |
| P.allocationRisk.rebalanceBandPoints | 5 | §8.2 (điểm phần trăm) | Ngưỡng kích hoạt tái cân bằng | Chưa đo riêng |
| P.allocationRisk.continuousOptimizer | γ2.5, κ0.5, η0.002 | §6.1–6.3 là phương pháp; hệ số là giả định sản phẩm | Hàm mục tiêu tối ưu | C17 kiểm cơ chế; chưa đo riêng từng hệ số |
| P.allocationRisk.continuousOptimizer.estimation | historicalWeight0.5; monthlyBaselines CASH0.00375, GOV_BOND0.003692, EQUITY0.006043, GOLD0.004167 | §6.1; 0.5 do sản phẩm chọn; baseline kế thừa giả định v3 chia12, chưa là kỳ vọng đã duyệt | Kết hợp lịch sử và lợi suất cơ sở | Chưa đo riêng |
| P.allocationRisk.continuousOptimizer.bounds | CASH[0.05,0.7], GOV_BOND[0,0.6], EQUITY[0,0.6], GOLD[0,0.15] | §6.3 yêu cầu ràng buộc; biên cụ thể do sản phẩm chọn | Miền tối ưu | C17 kiểm khả thi, chưa đo riêng |
| P.allocationRisk.stresses.HIGH_INFLATION | offset0, duration60tháng, annualDeltaPoints3 | §9.1 yêu cầu sốc; 60tháng/+3điểm là giả định cần duyệt | Sốc lạm phát | Chưa đo riêng |
| P.allocationRisk.stresses.EQUITY_CRASH | offsets[-12,0,12,24], shock−35%, severe−50% | §9.1; lựa chọn 4 mốc nằm quanh thời điểm hưu | Nhiều mốc sốc cổ phiếu | Chưa đo riêng |
| P.allocationRisk.stresses.RATE_RISE | offset0, GOV_BOND, durationYears5, yieldRisePoints2 | §9.1 yêu cầu sốc; 5năm/+2điểm là giả định | Sốc lãi suất trái phiếu | Chưa đo riêng |
| P.allocationRisk.stresses.GOLD | offset0, GOLD, shock−20%, spreadPoints[5,10] | Spread §9.1; mức giảm−20% cần sản phẩm xác nhận | Giá và chênh giá thanh lý vàng | Chưa đo riêng |
| P.allocationRisk.stresses.PROPERTY_ILLIQUIDITY | offset0, duration24tháng, delay24tháng, haircut30% | §9.1 yêu cầu sốc; cường độ là giả định | Trì hoãn/giảm giá BĐS | Chưa đo riêng |
| P.allocationRisk.stresses.INCOME_LOSS | offset−24tháng, duration12tháng, lost50% | §9.1 yêu cầu mất thu nhập; mốc/mức là giả định | Sốc thu nhập trong tích lũy | Chưa đo riêng |
| P.allocationRisk.stresses.LONGEVITY.extraYears | [5,10] | §9.1 | Kéo dài kỳ chi tiêu | Chưa đo riêng |
| P.allocationRisk.stresses.SEQUENCE_OF_RETURNS | EQUITY −20%/+25% | §9.2 ví dụ | Thứ tự lợi suất | Chưa đo riêng |
| P.customization | FOLLOW_TEMPLATE_SHIFTS, PROTECTED_CAPITAL_V1; bounds CASH5–70%, GOV_BOND0–60%, EQUITY0–60%, GOLD0–15% | §4.1/§6.3; min/max cụ thể có phần sản phẩm tự chọn trong evidence | Miền tỷ trọng khách tự chỉnh | Harness có nạp; C01 kiểm loại vượt trần; chưa đo riêng |
| P.lossReaction | SELL0.5, HOLD1, BUY_MORE1 | §3.1/§6.3 yêu cầu xét tâm lý; hệ số là lựa chọn sản phẩm | Điều chỉnh giới hạn lỗ | Chưa đo; harness không nạp khối này |
| R.emergencyReserveMonths | STABLE6, VARIABLE9, UNCERTAIN12, default6 | §3.2 cho6–12; 9/default6 là lựa chọn An Hưu | Dự phòng khi khách chưa khai | capital-reserve-stability.test.ts; chưa có audit riêng |
| P.occupationalRisk (T6 bổ sung) | UNCERTAIN.maxEquityPercent40; employerConcentration.maxEquityPercentReduction10; excludeEmployerSector=false | §3.1/§6.3; **đề xuất AI, không có số cụ thể trong tài liệu** | Thêm trần cổ phiếu; chưa xử lý rủi ro ngành khi thiếu mapping | Chưa đo; production schema parse PASS |
| P.templates[TPL_BASE_GLIDE].glidePath.spendingFloorYears (T6) | 3; hai template khác chưa bật | §8.3 cho3–5; **AI đề xuất cận dưới**; evidence ở P._meta.evidence | Vốn an toàn cho sàn chi tiêu từ hưu | Chưa đo riêng; schema PASS |
| P.allocationRisk.rebalance (T6) | Chỉ evidence; **không có** saleTaxPercent/transactionFeePercent | §8.2; [112/VBHN-VPQH](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/5/112-vbhn-vpqh.pdf), Điều13(2), Điều5(4). Thuế chứng khoán không phải tỷ lệ chung mọi lớp tài sản; phí cần chọn công ty | **CHỜ CHỐT**; không bật tỷ lệ toàn cục sai phạm vi | Chưa đo; kiểm hai rate vẫn absent PASS |
| P.allocationRisk.stresses.HIGH_INFLATION.healthDeltaPoints / LONGEVITY.lateLifeCareMonthly | Đều absent | §9.1; **CHỜ CHỐT**: thiếu dữ liệu hiệu chỉnh theo kỳ giá/đối tượng. CPI y tế quá khứ không tự suy ra sốc tương lai hay tiền chăm sóc cá nhân | Hai cơ chế chưa có tham số tiếp tục không đủ điều kiện chạy | Không tự điền |

Đối chiếu sau T6: **15** lần xuất hiện CHỜ DUYỆT trong các file nháp (trước T6 là12). Bảng bao phủ9 evidence ban đầu, evidence mới cho rebalance/occupationalRisk và _meta.evidence, cùng nội dung templates/ruleMapping chưa được duyệt dù không có marker riêng. Marker không thay việc rà toàn bộ file.

Hạn chế đo T5: harness hiện có chỉ nạp customization, còn `AUDIT_OPTIMIZER=1` vừa nạp allocationRisk nháp vừa bật optimizer và fallback. Nó không cô lập từng giá trị và không nạp templates/lossStress/lossReaction/occupationalRisk/reserve nháp. Theo plan không viết loader mới; vì vậy ghi **chưa đo riêng**, không coi C17 là bằng chứng hiệu quả của từng tham số. Kiểm tập trung trước T6: drafts-schema + capital-reserve-stability + allocation-step5-step7-guards **30/30**,3file. Sau T6: drafts-schema **4/4**; parse occupationalRisk bằng schema thật PASS; golden17ca **IDENTICAL**, không bỏ qua lever do hết thời gian.

## Kết quả T7: checklist dữ liệu và cổng chặn

Ponytail full. Không sửa nhãn hay số liệu trong market-data-draft.json; không viết pipeline nhập mới. File hiện có80 tháng (2020-03→2026-10); quyền sử dụng ghi trong prose chưa phải bằng chứng cấp phép.

| Lớp/nguồn hiện tại | returnBasis / licenseStatus | Thiếu gì | Người phải xác minh |
|---|---|---|---|
| CASH / VCB_DEPOSIT_12M | INCOME_ONLY / UNVERIFIED | Lãi niêm yết12tháng÷12 chưa có tái tục/tái đầu tư; xác nhận mốc lãi2022–2023, quy ước phí/thuế và quyền nguồn | Admin/chủ SP, người kiểm quyền dữ liệu |
| GOV_BOND / HNX_GOV_BOND_10Y | INCOME_ONLY / UNVERIFIED | Lợi suất đấu thầu÷12 không gồm biến động giá/coupon tái đầu tư; cần chuỗi tổng lợi suất có căn cứ và quyền | Admin/chủ SP, người kiểm quyền dữ liệu |
| EQUITY / YAHOO_VNINDEX | PRICE_ONLY / UNVERIFIED | Thiếu cổ tức; xác minh hai giá override; không coi thiếu cổ tức bù được phí chưa trừ | Admin/chủ SP, chủ sở hữu nguồn |
| GOLD / GIAVANGHN_SJC | PRICE_ONLY / UNVERIFIED; priceSide absent | Cần chiều BUY thanh lý nhất quán, spread, metadata lợi suất đúng và quyền nguồn | Admin/chủ SP, chủ sở hữu nguồn |
| CPI / IMF_NSO_CPI | CPI MoM; prose giấy phép chưa xác minh | Xác minh bản gốc/override10-2026, chuyển đổi tháng và quyền dùng kết quả phái sinh | Admin/chủ SP, người kiểm quyền dữ liệu |

Test sẵn `blocks %s data without altering the approved version, and records explicit override` chứng minh chặn PRICE_ONLY/INCOME_ONLY; test `publishes verified total-return data with BUY-side gold without an override` chứng minh đường hợp lệ. Một test bổ sung trong **file sẵn** market-data-governance.test.ts: `blocks isolated basis or license gaps and carries each limitation into an overridden simulation` cô lập TOTAL_RETURN+UNVERIFIED và PRICE_ONLY+VERIFIED, chặn publish thường rồi kiểm disclosure của mô phỏng thật sau override tổng hợp có lý do. Không sửa runtime. Governance+warnings **13/13**,2file; ponytail-review0 phát hiện. Explicit override vẫn là ngoại lệ có ghi lý do; test không chứng nhận giấy phép ngoài thực tế, CPI/source prose vẫn cần người có bằng chứng.

## Trạng thái T8 / T10 và phần nghiệm thu thật còn chờ

T8 **chưa tới cổng quyết định bật**: T5 mới là bảng chờ chủ SP duyệt, T7 mới kiểm cổng chặn, chưa có dữ liệu đạt chuẩn. Chưa chạy so17ca bật/tắt đáp ứng đủ điều kiện T8. Harness hiện còn tự bật fallback khi AUDIT_OPTIMIZER=1, nên không thể coi lần chạy đó là phép so fallback-off riêng; không sửa harness trái phân quyền. Giữ nguyên env production, chưa đề xuất bật tối ưu.

T3 deploy/migration do chủ SP chạy; T4 benchmark B2 và tích hợp thật T9 chờ T3. T10 chỉ có thể kiểm local và cập nhật bằng chứng hiện có; **không tuyên bố toàn plan hay nghiệm thu production đã xong**.

## Kết quả T9 / T10 local
Ponytail full và ponytail-review: Lean already. Ship. T9 có UI bốn phần ; custom 30/30 (107,89 s), result-review 37/37 (108,7 s), không retry, sau build cuối. Frontend typecheck, 133 assets và 18 logic đều sạch. Đã xem đủ bốn màn ở 1440 / 375 px; ảnh và phạm vi mock tại docs/task-frontend.md. Các lỗi label/copy/context/note/null và card mobile được sửa bằng thay đổi cục bộ, không thêm dependency.
Backend cuối: 1.614/1.614, 147 file, 183,18 s; chạy cô lập --maxWorkers=2; source và test typecheck sạch. Root OpenAPI validate PASS; generator chạy lặp cho kết quả byte-identical. Golden T6 chính xác 17 ca IDENTICAL; baseline 15 ca gốc qua allowlist §1 IDENTICAL; 0 lever bỏ qua cả hai. Script tạm .tmp/t10-filter-permitted.py không được Git theo dõi.

| Task | Delta quy được cho lượt này | Phạm vi |
|---|---|---|
| T1 | +6/−2 | generator +1/−1, YAML +5/−1 ; không tính tài liệu kiểm |
| T2/T3/T5 | Không sửa runtime | Inventory/checklist/matrix trong tài liệu này; chỉ chuẩn bị |
| T4 | +0/−0 | Chưa chạy B2, chờ T3 |
| T6 | +11/−2 | Chín dòng thêm evidence/rebalance/occupationalRisk và hai dòng thay basis/baseglide; chỉ JSON nháp |
| T7 | +21/−1 | Một test loop hai cổng chặn, dùng fixture/schema/service cũ |
| T8 | +0/−0 | Chưa tới cổng duyệt/dữ liệu ; không sửa harness |
| T9 | +181/−30 trên 10 file có snapshot (source +80/−30, test +101/−0); allocation-workspace.css thêm −2 dòng theo snapshot follow-up | AllocationAdjustments và FE journal thiếu snapshot task-start nên không gán số giả; batch review riêng +2/−4 đã bao gồm phần sửa AllocationResults |
| T10 | docs/kiem-tra-plan-7-buoc-2026-11-20.md: +38/−13; backend/PROGRESS.md: +11/−0; docs\plan-viec-con-lai-phan-bo-2026-11-20.md: +37/−0 | Chỉ tài liệu kiểm, journal và phần này; không sửa code |

Bằng chứng và lỗi đã khắc phục ghi tại docs/kiem-tra-plan-7-buoc-2026-11-20.md §5. T3/T4, quyết định duyệt T5 và dữ liệuT7, kiểm T8 cùng tích hợp thật T9 vẫn CHỜ; T10 local không đồng nghĩa toàn plan xong. Không commit / push / deploy / ghi DB thật / publish. Hai file plan / kiểm này đang bị *.md ignore; chủ SP phải chọn rõ khi chuẩn bị commit, không sửa ignore hay gom file phiên khác.


## Đối chiếu hoàn thành sau review toàn diff (20/11/2026)

T2 hiện tại: 187/187 đường dẫn được phân nhóm đúng một lần. Full ponytail-review đã phủ 179 đường dẫn thuộc plan (nhóm a–f), không file bị bỏ sót; 8 file phiên khác (g) không nhập vào phạm vi. Ba phát hiện và cách xử lý ghi trong file kiểm §6: hai phần dư frontend đã cắt ở T9 (+2/−4 dòng), một đoạn lặp tính min tại capital/loss-constraint.ts:54–62 giữ nguyên do phân quyền cấm sửa module tính toán. Không có runtime backend mới.

| Task | Bằng chứng hiện tại | Phần chưa hoàn thành |
|---|---|---|
| T1 | Mô tả rule, generator lặp byte-identical, root OpenAPI validate; L5 cập nhật | Không còn phần AI local |
| T2 | 187 đường dẫn đối chiếu máy; không file .tmp được theo dõi; đủ kết quả kiểm | Chủ SP chọn hunk và commit; AI không stage |
| T3 | Checklist đủ 6 phần, nguồn workflow/package/SQL | Chủ SP backup, migration, deploy và xác nhận health/history thật |
| T4 | Lệnh benchmark sẵn có và mốc so local đã ghi | Chờ T3 và môi trường B2/cho phép chạy; chưa có bảng số B2 |
| T5 | Matrix đủ marker, tác động chưa đo riêng được ghi đúng hạn chế harness | Chủ SP quyết từng dòng và publish |
| T6 | Nháp/schema 4/4, golden 17 ca IDENTICAL; thuế/y tế CHỜ CHỐT đúng quy tắc nguồn | Duyệt tham số và cung cấp căn cứ phạm vi/số liệu còn thiếu |
| T7 | Checklist theo tài sản, test governance/warnings 13/13 | Admin/chủ SP cung cấp tổng lợi suất và bằng chứng cấp phép |
| T8 | Hai lớp khóa giữ nguyên; đã nêu harness tự bật fallback | Chỉ chạy so 17 ca sau T5/T7; không tự đổi harness hoặc bật production |
| T9 | Typecheck / 133 assets / 18 logic; build 12,70 s; E2E 30/30 (107,89 s), 37/37 (108,70 s), không retry; 10 ảnh | Kiểm tích hợp B7 thật sau T3 |
| T10 | Kiểm local, golden, full complexity-review và journal/row trạng thái đã cập nhật | Nghiệm thu toàn plan phụ thuộc các cổng owner/admin ở trên |

Lượt trước là tiến độ đã thực hiện, không phải đợi một process còn chạy. Hiện không có job production do AI khởi tạo; các cổng trên cần hành động hoặc ủy quyền rõ của chủ SP/admin. Giữ nguyên objective đầy đủ, chưa đánh dấu goal hoàn tất.

## Uỷ quyền commit và push develop (20/11/2026)
- Chủ sản phẩm đã giao trực tiếp trong chat: làm phần commit/push theo chức năng lên develop. Uỷ quyền này mở phần Git của T2/T3; chưa giao deploy, migration, publish policy hay dữ liệu.
- Backend/API: abd00fd; frontend: 9e19ea2. Schema, draft và hợp đồng API đi cùng backend vì test contract đọc OpenAPI và schema production; không tạo commit trung gian thiếu phụ thuộc. Commit tài liệu đi sau hai commit mã nguồn.
- Kiểm cây mã đã commit trong worktree tách riêng, không có ba diff billing: backend source/test typecheck,1614/1614 (147 file,153.44s), isolated Prisma generation+TypeScript emit và startup guard PASS; frontend typecheck,assets133/133,logic18/18, production build,SEO3/3,E2E30/30 (65.03s) và37/37 (63.27s),không retry.
- test:logic có phụ thuộc đã tồn tại từ HEAD cũ vào5 file tham chiếu demo trong repo lồng sites/an-huu-trai-nghiem. Lượt này dùng bản sao fixture cục bộ có ghi SHA, không gọi đó là kiểm fresh-clone tự chứa. Không đưa dist/node_modules/.tmp/.env vào commit; không commit repo lồng hoặc nguồn thuật toán thuộc repo đó.
- Giữ riêng DemoNavigationIcon.tsx,UserLayout.tsx,user-demo-theme.css và mục FE-BILLING-NAV-20261119 trong docs/task-frontend.md. Chỉ chọn9 tài liệu allocation đang bị ignore bằng đường dẫn cụ thể, không sửa rộng quy tắc ignore.
- Lô commit nhắm origin/develop; kết quả push và SHA remote được xác minh sau khi tạo commit tài liệu này, báo trong chat. T3 triển khai thật,T4,T5/T7,T8 và tích hợp B7 vẫn theo các cổng chưa hoàn thành đã ghi.

## Kết quả T3 / T5 trên production (20/11/2026)
Chủ sản phẩm giao trực tiếp trong chat. Chi tiết trong `backend/PROGRESS.md`, mục "T3 deploy B2, migration thật và T5 công bố chính sách v7".
- T3: migration `202611200001_rebalance_decisions` đã áp lên DB thật (mốc PITR 2026-11-20T05:31:28Z). Deploy qua hieu182603/An_Huu#31, merge `a3c1e69`, health/ready 200.
- T5: chính sách v7 đã công bố gồm nhóm A và B trong Bảng duyệt T5. Riêng `rebalance.saleTaxPercent`/`transactionFeePercent`, `healthDeltaPoints`, `lateLifeCareMonthly` vẫn CHỜ CHỐT; template TPL_GROWTH_GLIDE không đưa vào.
- T4: chưa đo; chờ đăng nhập để đo trang Phân bổ thật trên B2.
