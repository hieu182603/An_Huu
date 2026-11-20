# Kế hoạch sửa thuật toán phân bổ cho đủ 7 bước (20/11/2026)

Tài liệu gốc: `sites/an-huu-trai-nghiem/thuat-toan-phan-bo-tai-san.md` (gọi tắt là **spec**; ký hiệu §x.y là mục trong spec).
Căn cứ: kiểm toán chỉ đọc ngày 20/11/2026 (3 báo cáo theo nhóm bước), đối chiếu với code trong working tree và kết quả chạy 15 ca audit.
Người làm: **AI thực hiện** (không phải phiên viết plan này). Người kiểm: phiên viết plan, kiểm theo mục "Nghiệm thu" của từng việc và mục 12.

---

## 0. Quy tắc bắt buộc với AI thực hiện

1. **Không commit, không push, không deploy, không ghi DB thật** (kể cả Azure). Chủ sản phẩm tự commit. Chỉ dùng memory-db và test.
2. **Không tự quyết các mục ghi `CHỜ CHỐT`.** Làm phần cơ chế (code, schema, test) với tham số **tắt mặc định** hoặc lấy từ tài liệu đã duyệt. Không tự bịa con số nghiệp vụ, thuế suất, ngưỡng.
3. **Văn bản pháp luật**: chỉ dùng văn bản Việt Nam đã ban hành, dữ liệu đến hết 2026. Không dùng dự thảo hay quy tắc dự kiến. Mọi tham số pháp lý phải ghi số hiệu văn bản trong `evidence`.
4. **Giữ kết quả cũ**: kế hoạch đã lưu theo model `retirement-monthly-v3` (`engine-v3.ts`) phải replay **y hệt từng byte**. Không sửa `engine-v2.ts`, `engine-v3.ts`. Không sửa hoặc chạy lại migration đã có (`prisma/migrations/*` đến `202611190001_allocation_confirmation`).
5. **Môi trường Windows + Git Bash**: heredoc trong bash làm mất dấu `\`. Script vá phải viết bằng công cụ Write. Nhiều file dùng CRLF: giữ nguyên kiểu xuống dòng của từng file.
6. **Chạy test**: dùng `node node_modules/vitest/vitest.mjs run <file>` trong `backend/` (npm trên máy này không chuyển tham số ổn định). Typecheck: `npx tsc --noEmit -p tsconfig.json` và `npx tsc -p tsconfig.test.json`.
7. **Trình sinh OpenAPI** (`backend/scripts/generate-*openapi*.cjs`) có thể ghi đè `backend/docs/openapi.yaml` và làm mất khối của người khác (ví dụ `/me/portfolio-policies/workspace/packages`). Trước khi chạy, sao lưu `openapi.yaml` ra ngoài repo. Sau khi chạy, so danh sách path và schema; khối nào mất thì khôi phục.
8. **E2E**: hai bộ `playwright.allocation-custom.config.ts` và `playwright.allocation-result-review.config.ts` chạy bản build sẵn. Phải build lại trước:
   `cd frontend && VITE_API_URL=http://127.0.0.1:62412/api/v1 npx vite build --outDir ../.tmp/allocation-result-review-dist --emptyOutDir`
9. **Có phiên chat khác đang làm trong cùng thư mục.** Re-read file ngay trước khi sửa. Không hoàn tác thay đổi không phải của mình. Gặp thay đổi lạ thì ghi vào báo cáo.
10. Mỗi việc xong: cập nhật `backend/PROGRESS.md` (mục mới, ngày, hành vi đổi, lệnh + kết quả, việc còn lại). Phần giao diện chưa làm thì ghi vào `docs/task-frontend.md`.

## 1. Cách kiểm "không đổi kết quả" và "đổi đúng chỗ"

- **Bản golden hiện tại** (chụp sau tối ưu 20/11, trùng với trước tối ưu): tạo lại trước khi sửa bất cứ gì, vì file tạm có thể đã mất:
  ```
  cd backend
  AUDIT_RUN=1 AUDIT_RAW=1 AUDIT_OUT=../.tmp/golden-before-plan.json node node_modules/vitest/vitest.mjs run src/tests/audit-allocation-personalization.test.ts -t AUDIT
  ```
- **So sánh**: `node scripts/compare-audit-golden.cjs ../.tmp/golden-before-plan.json <file-sau.json>`. Script chỉ bỏ qua mã định danh do memory-db tạo và trường phụ thuộc thời gian. **Không được nới script.**
- Việc ghi **"Golden: phải IDENTICAL"** thì sau khi sửa phải ra `IDENTICAL`.
- Việc ghi **"Golden: được đổi"** thì phải liệt kê trong báo cáo **từng trường đổi và lý do**. Mọi khác biệt ngoài danh sách đó là lỗi.
- Nếu một việc cố ý đổi kết quả, chụp golden mới **sau khi việc đó được nghiệm thu**, làm mốc cho việc kế tiếp. Ghi tên file mốc vào PROGRESS.

## 2. Thứ tự và chia người

| Đợt | Việc | Chạy song song được? | Ghi chú |
|---|---|---|---|
| 1 | Nhóm A (lỗi code) | A1–A4 song song; A5 riêng | Không cần chốt nghiệp vụ, trừ A5 |
| 2 | Bước 1 (B1-x), Bước 2 (B2-x), Bước 6 kịch bản (B6-2..B6-6) | Song song theo file sở hữu ở mục 11 | Nhiều mục có phần `CHỜ CHỐT`: làm cơ chế, tắt mặc định |
| 3 | Bước 4 (dữ liệu), Bước 5 (ràng buộc, bộ tối ưu) | B4 trước B5-5 | B5-5 (bật bộ tối ưu) cần dữ liệu đạt chuẩn |
| 4 | Bước 7 (lịch sử quyết định, thuế, phí theo ngày, glidepath) | B7-1 riêng (có migration) | Migration cần chủ sản phẩm duyệt trước khi áp dụng |
| 5 | Đo 1.000 kịch bản trên B2 (B6-1), tài liệu, OpenAPI | | Sau khi chủ sản phẩm deploy |

---

## 3. Nhóm A: lỗi code (không đổi thuật toán đã duyệt)

### A1. Phí tư vấn trong mô phỏng v5 tính theo công thức v3
- **Vấn đề**: `backend/src/modules/allocation-risk/simulation.ts:148` gọi `applyAdvisoryFee(protectedRows, initialCapital, retirementMonth, context.selection)` mà **không truyền cờ v5**. `retirement/prepare.ts:271` có truyền `v5`. Vì vậy kế hoạch v5 có phí tư vấn bị Monte Carlo tính cơ sở phí theo kiểu rút cuối tháng.
- **Sửa**:
  1. Trong `runPath`, truyền `context.projection.modelVersion === "retirement-monthly-v5"` làm tham số cuối của `applyAdvisoryFee`.
  2. Đường nhanh (`simulation-kernel.ts`, `runPathV5Fast`) hiện bỏ qua trường hợp có phí (`simulation.ts:111` chỉ dùng đường nhanh khi không có `advisoryFee`). Không bắt buộc tăng tốc trường hợp có phí ở việc này; nếu làm thì phải chứng minh bằng test so với `runPathFrozen`.
- **Test**: file mới `backend/src/tests/allocation-fee-v5.test.ts`:
  - Kế hoạch v5 có `advisoryFee` (FUND và EXTERNAL): `runPath` trả cùng `fundedClosingBalance` từng tháng với phép chiếu tất định của `prepareRetirement` (v5) trên cùng thị trường xác định (dùng `deterministicMarket`).
  - Context v3 có phí: kết quả không đổi so với trước khi sửa (chụp số trước khi sửa vào test).
- **Golden**: phải IDENTICAL (15 ca không có phí).

### A2. Chú thích và giới hạn "owner cap 50"
- **Vấn đề**: `allocation-risk/policy.ts:13` đặt `simulationPaths ... max(50)` kèm chú thích `// owner cap 19/11/2026 (LIMITS.maxPaths)`. `allocation-risk/schema.ts:12` ghi `milestones 20/50, owner cap 50`. Nhưng `LIMITS.maxPaths = 1000` (`simulation.ts:18`) và các mốc `[20,50,100,200,500,1000]`. Chủ sản phẩm đã duyệt mốc tới 1.000 (C1). Hai dòng này do một phiên khác sửa lúc 22:55 ngày 19/11, không có quyết định nào về trần 50.
- **Sửa** (`CHỜ CHỐT` nhẹ, mặc định đề xuất): `simulationPaths` max = `LIMITS.maxPaths` (1000). Sửa chú thích `schema.ts`: "Customer-chosen path count (milestones 20/50/100/200/500/1000, max LIMITS.maxPaths)". Nếu chủ sản phẩm muốn trần thấp hơn, chỉ đổi một hằng số ở `simulation.ts` (một nguồn duy nhất), không để hai con số khác nhau.
- **Test**: `allocation-risk.test.ts` hoặc test mới: policy `simulationPaths: 1000` hợp lệ, 1001 bị từ chối.
- **Golden**: phải IDENTICAL.

### A3. Khoảng K của quỹ dự phòng
- **Vấn đề**: `assumptions/schema.ts:34` `reserveMonthsValue = z.number().int().min(1).max(24)`. Spec §3.2: K ∈ [6, 12].
- **Sửa**: đổi thành `min(6).max(12)`. Kiểm `STABLE ≤ VARIABLE ≤ UNCERTAIN` và `default` trong khoảng vẫn giữ. Kiểm ràng buộc nhập tay của khách (`profiles/schema-v2.ts` `reserveMonths`): nếu cho phép ngoài 6–12 thì **giữ nguyên** (khách tự chọn là quyền của khách) nhưng thêm cảnh báo `RESERVE_MONTHS_OUTSIDE_METHOD_RANGE` trong kết quả tách vốn.
- **Test**: mở rộng `capital-reserve-stability.test.ts`: 5 và 13 bị từ chối ở khối duyệt; khách đặt 3 tháng thì vẫn dùng 3 kèm cảnh báo.
- **Golden**: phải IDENTICAL (15 ca dùng mặc định 6).

### A4. Ngưỡng kích hoạt tái cân bằng: "≥ 5" theo spec
- **Vấn đề**: spec §8.2 "Kích hoạt khi Δw_i ≥ 5%". Code dùng `>` ở:
  - `allocation-risk/rebalance.ts:34` (`.gt(bandPoints)`),
  - `allocation-risk/simulation.ts:43-44` (`bandTriggered`),
  - `allocation-risk/simulation-kernel.ts:102,104` (`bandExceeded`) và hàm lọc nhanh `screenBand` (dòng 44–60: phép so sánh và biên 1e-9 phải đổi theo),
  - `holdings/service.ts` (hàm `monitorPortfolioDrift`, tìm phép so với band).
- **Sửa**: đổi thành `.gte(...)` ở mọi nơi, nhất quán. Sửa mã lý do trong `proposeRebalance`: giữ `"ABSOLUTE_DRIFT_NOT_GREATER_THAN_BAND"` / `"ABSOLUTE_DRIFT_GREATER_THAN_BAND"` để tương thích, nhưng thêm trường `trigger: "AT_OR_ABOVE_BAND"` (hoặc đổi tên mã nếu chủ sản phẩm đồng ý, `CHỜ CHỐT`). Cập nhật test biên `allocation-risk.test.ts:209` và `allocation-algorithm-fixes.test.ts` (bandTriggered đúng 5 điểm giờ là true).
- **Golden**: được đổi, nhưng chỉ khi có tháng lệch đúng bằng 5 điểm. Báo cáo phải nêu đã có ca nào đổi chưa. Nếu không có ca nào đổi thì phải IDENTICAL.

### A5. C03 chậm hơn bản trước (3,9 s → 6,5 s)
- **Vấn đề**: profile C03 cho thấy 32% thời gian ở `lossReducedCandidate` → `customEval` (`allocation-risk/service.ts` khoảng dòng 305–306) → `RetirementService.evaluate` → `prepareRetirement` cho **mỗi bước chia đôi**, trong đó `computePortfolioPreview` chiếm 22%. Chưa rõ vì sao chậm thêm khoảng 2 s so với golden cũ.
- **Việc**:
  1. Đo số lần gọi `customEval` của C03 và thời gian mỗi lần (thêm bộ đếm tạm, gỡ sau).
  2. Tìm lý do chậm thêm: so `prepareRetirement` v5 (`withGross=true` trong `portfolios/engine.ts`, key cache `portfolioPreviewCache` có `withGross`) với v3. Nghi vấn: cache preview portfolio không trúng vì tham số mới.
  3. Tối ưu: dùng chung một `portfolioPreviewCache` cho cả vòng tìm; nhớ kết quả `customEval` theo `JSON.stringify(customAllocation)` trong một lượt chạy.
- **Nghiệm thu**: C03 ≤ 4 s trên máy local (chạy riêng, `SIM_WORKERS=0`). **Golden: phải IDENTICAL.**

---

## 4. Bước 1: Hoàn cảnh và dòng tiền (§2 bảng 7 bước, §3.1)

### B1-1. Danh sách nghĩa vụ theo thứ tự ưu tiên (đầu ra chuẩn của bước 1)
- **Hiện tại**: thứ tự chỉ ngầm trong mô phỏng (`ESSENTIAL_FIRST_CLASSIFICATION_ONLY`), không có đầu ra riêng.
- **Làm**: hàm mới `obligationSchedule(profile, prepared)` trong `backend/src/modules/retirement/obligations.ts`, trả danh sách đã sắp:
  1. chi thiết yếu (expense `ESSENTIAL`, sinh hoạt hưu trí),
  2. trả nợ theo hợp đồng (lịch từ `buildContractSchedule`),
  3. mục tiêu `ESSENTIAL`,
  4. chi khác bắt buộc (`HEALTH`, `INSURANCE`, `DEPENDENT`),
  5. mục tiêu `FLEXIBLE` (đánh dấu `deferrable`),
  6. chi `OPTIONAL`,
  7. mục tiêu `LEGACY`.
  Mỗi dòng: `{ kind, id, label, priorityRank, firstMonth, lastMonth, totalNominal, presentValue?, deferrable }`.
- Trả trong response workspace phân bổ (`portfolios/workspace.ts`) và preview (bổ sung trường mới, không đổi trường cũ). Cập nhật OpenAPI.
- **Không đổi phép tính.** Golden: IDENTICAL, ngoại trừ trường mới nếu harness ghi nó (harness hiện không ghi).
- **FE**: hiển thị danh sách ở bước 1 trang Phân bổ (ghi `docs/task-frontend.md` nếu không làm).

### B1-2. Mục tiêu "có thể lùi" (`deferrable`)
- **Hiện tại**: `goalEntrySchema.deferrable` (`profiles/schema-v2.ts:105-110`) không được dùng ở đâu (chỉ quick-start ghi vào).
- **Làm**: thêm đòn bẩy thứ 4 trong `allocation-risk/adjustments.ts`: **"Lùi mục tiêu linh hoạt"**. Với các mục tiêu `deferrable = true`, tìm số tháng lùi nhỏ nhất (bậc 6 tháng, tối đa `CHỜ CHỐT`, mặc định đề xuất 60 tháng) sao cho pE đạt ngưỡng. Cùng seed, cùng số kịch bản, cùng danh mục, như các đòn bẩy khác. Không có mục tiêu lùi được thì `NOT_APPLICABLE` + `NO_DEFERRABLE_GOAL`.
- Lùi mục tiêu làm đổi PV mục tiêu gần hạn (bước 3): biến thể phải dựng lại `capital` bằng `separateCapital` với ngày mục tiêu mới.
- **Test**: `allocation-algorithm-fixes.test.ts` (đánh giá giả) và một ca audit mới **C16** (mục tiêu 300tr, FLEXIBLE, deferrable, sau 3 năm; kế hoạch không khả thi nếu không lùi).
- **Golden**: các ca cũ IDENTICAL; lever mới chỉ xuất hiện ở response adjustments (trường mới).
- **FE**: thêm dòng thứ 4 trong `AllocationAdjustments.tsx`.

### B1-3. Người phụ thuộc
- **Hiện tại**: chỉ là category `DEPENDENT` của khoản chi và `personal.dependents`.
- **Làm**: chỉ thêm kiểm tra. Nếu `personal.dependents > 0` mà không có khoản chi `DEPENDENT` nào thì cảnh báo `DEPENDENT_EXPENSES_NOT_DECLARED` trong preview và workspace. Không tự dựng lịch chi.

---

## 5. Bước 2: Khả năng chịu rủi ro (§3.1 dòng 1–3)

### B2-1. Ngưỡng lỗ theo cả số tiền và phần trăm
- **Hiện tại**: `capital/loss-constraint.ts:38-46` nhận **một trong hai** (`inputMode` PERCENT hoặc AMOUNT); chỉ bản cũ mới lấy min.
- **Làm**:
  - Cho phép hồ sơ lưu đủ cả hai (`lossTolerance.percent` và `lossTolerance.amountVnd`).
  - Khi có cả hai: giới hạn cho phép = **min(tiền, % × vốn tăng trưởng)**; ghi `bindingLimit: "AMOUNT" | "PERCENT"`.
  - `CHỜ CHỐT`: bắt buộc khách nhập cả hai hay cho phép một. Mặc định khi chưa chốt: cho phép một, có cả hai thì lấy min.
- **Test**: `capital-loss-constraint*.test.ts` (tìm file hiện có; không có thì tạo `loss-constraint-both.test.ts`): ba ca chỉ %, chỉ tiền, cả hai.
- **Golden**: IDENTICAL (15 ca chỉ nhập %).
- **FE**: ô nhập thứ hai trong `AllocationProfileEdits.tsx` bước "mức chịu giảm".

### B2-2. Phản ứng tâm lý khi lỗ
- **Hiện tại**: `lossTolerance.reaction` (SELL/HOLD/BUY_MORE) lưu nhưng `loss-constraint.ts` không đọc.
- **Làm**: thêm tham số chính sách **tùy chọn** `lossReaction` trong schema chính sách danh mục (`portfolios/schema.ts`, phần `allocationRisk` hoặc `lossStress`): `{ evidence, SELL: { allowedLossFactor }, HOLD: {...}, BUY_MORE: {...} }`. Giới hạn cho phép = giới hạn khai × factor. **Không có khối được duyệt thì không áp dụng** và trả `reactionApplied: false`.
- `CHỜ CHỐT`: hệ số (ví dụ SELL 0,5). Đưa bản mẫu vào `backend/data/drafts/policy-params-draft.json` với `evidence: "CHỜ DUYỆT"`, không công bố.
- **Golden**: IDENTICAL (chính sách hiện tại không có khối).

### B2-3. Thời hạn cần tiền và yêu cầu thanh khoản theo từng mục tiêu
- **Hiện tại**: `liquidityNeeds` (1/3/5 năm) chỉ sinh cảnh báo (`capital/separation.ts:83-84`) và chặn `allocationFunding` (`prepare.ts` `GOAL_RECONCILIATION_REQUIRED`). `liquidityNeedMonths` chỉ là một con số toàn cục để lọc quy tắc chính sách.
- **Làm**:
  1. Hàm `liquidityRequirement(profile, capital, assumptions)` trong `capital/liquidity.ts`, trả số tiền cần dùng trong 12/36/60 tháng:
     - từ mục tiêu: các mục tiêu đã tách ở bước 3 (RESERVED) **không tính lại**;
     - từ `liquidityNeeds` đã khai mà chưa khớp với mục tiêu nào.
  2. Đầu ra: `{ horizons: [{months, amount, coveredByReserved, uncovered}], issues }`.
  3. Dùng ở bước 5 (B5-1).
- **Test**: unit test với mục tiêu 2 năm (đã RESERVED) và nhu cầu 3 năm chưa khớp.
- **Golden**: IDENTICAL (15 ca không có `liquidityNeeds`).

### B2-4. Độ ổn định thu nhập và tương quan nghề nghiệp
- **Hiện tại**: `incomeStability` chỉ quyết định K. `employerConcentration` chỉ hiện dòng "cần rà soát" (`retirement/preview-insights.ts:175-177`).
- **Làm** (cơ chế, tắt mặc định): thêm khối chính sách tùy chọn `occupationalRisk`: `{ evidence, employerConcentration: { maxEquityPercentReduction | excludeEmployerSector }, incomeStability: { UNCERTAIN: { maxEquityPercent } } }`. Có khối thì áp làm ràng buộc trần thêm ở bước 5 (loại phương án vượt, mã `OCCUPATIONAL_RISK_LIMIT`). Không có khối thì giữ dòng cảnh báo như cũ.
- `CHỜ CHỐT`: toàn bộ con số.
- **Golden**: IDENTICAL.

---

## 6. Bước 3: Vốn bảo vệ (§3.2)

Đã đúng; chỉ còn:

### B3-1. Đối soát mục tiêu trùng
- **Hiện tại**: cảnh báo `LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION` nhưng không có bước đối soát.
- **Làm**: trong response workspace, liệt kê từng `liquidityNeeds` kèm đề xuất "khớp với mục tiêu X" (cùng tháng ±3, số tiền ±10%) để khách xác nhận. Lưu xác nhận qua API hồ sơ hiện có (trường mới `liquidityNeeds[i].matchedGoalId`, tùy chọn). Không tự khớp.
- **Golden**: IDENTICAL.

### B3-2. Lợi suất phi rủi ro theo kỳ hạn
- **Hiện tại**: PV mục tiêu dùng lợi suất `CASH` theo khung kỳ hạn tiền gửi đã ghim (`separation.ts:86-106`). Spec: "lợi suất phi rủi ro phù hợp kỳ hạn sau khi trừ phí".
- **Làm**: chỉ ghi rõ trong response `discountBasis: "PINNED_DEPOSIT_RATE_BY_HORIZON"` và trong tài liệu. Không đổi phép tính (`CHỜ CHỐT` nếu muốn dùng lợi suất TPCP theo kỳ hạn).

---

## 7. Bước 4: Ước lượng thị trường (§5, §6.1, §6.2)

### B4-1. Dữ liệu đúng chuẩn tổng lợi suất (ADMIN + code)
- **Hiện tại** (bản nháp `backend/data/drafts/market-data-draft.json`, 80 tháng 2020-03..2026-10):
  - EQUITY là VN-Index **giá** (không có cổ tức);
  - GOV_BOND chỉ có lãi 10 năm/12 (không có lãi/lỗ giá);
  - CASH là lãi 12 tháng/12;
  - GOLD là SJC, không rõ giá mua vào hay bán ra;
  - cả 5 nguồn ghi `license: "CHƯA XÁC MINH"`.
- **Code**:
  1. `allocation-risk/market-schema.ts`: thêm trường bắt buộc cho từng tài sản `returnBasis: "TOTAL_RETURN" | "PRICE_ONLY" | "INCOME_ONLY"` và `licenseStatus: "VERIFIED" | "UNVERIFIED"`. Với vàng thêm `priceSide: "BUY" | "SELL" | "MID"` (spec §5.2.3: giá thanh lý dùng giá mua vào của tiệm).
  2. `market-service.ts` `publish`: **chặn công bố** khi có tài sản `PRICE_ONLY`/`INCOME_ONLY` hoặc `UNVERIFIED`, trừ khi admin bật `override: { reason }`. Có override thì ghi vào `reviewNote`, và response mô phỏng có `disclosure.limitations` chứa `MARKET_DATA_NOT_TOTAL_RETURN` / `LICENSE_UNVERIFIED`.
  3. Bản đang công bố trên DB có thể không có trường mới. Khi đọc, bản cũ được coi là `UNVERIFIED` và `PRICE_ONLY` cho EQUITY (ghi limitation), **không chặn chạy** (để trang không hỏng).
- **ADMIN** (`CHỜ CHỐT`, không phải việc của AI): tìm nguồn chuỗi tổng lợi suất cổ phiếu (có cổ tức) và chỉ số giá TPCP, giá mua vào của vàng, xác minh giấy phép, kéo dài lịch sử. Thủ tục: `docs/du-lieu-thi-truong-va-ty-trong-mau.md`.
- **Test**: `market-data*.test.ts`: chặn công bố, override, đọc bản cũ.
- **Golden**: được đổi ở `disclosure.limitations` (thêm 2 mã). Mọi số khác phải trùng.

### B4-2. Kiểm sai lệch dữ liệu (§5.3)
- **Làm** trong `market-service.ts` `validate`, chỉ cảnh báo:
  - `STALE_PRICE_SUSPECTED`: 3 tháng liền lợi suất bằng 0 hoặc bằng nhau;
  - `LOOK_AHEAD_SUSPECTED`: tháng sau ngày `retrievedOn` của nguồn;
  - `SHORT_HISTORY`: dưới 120 tháng (`CHỜ CHỐT` ngưỡng);
  - `OUTLIER_RETURN`: |r| > 50%/tháng.
- **Golden**: IDENTICAL.

### B4-3. Co kỳ vọng lợi nhuận và Ledoit-Wolf
- **Hiện tại**: `allocation-risk/estimation.ts` (`shrinkMean`, `ledoitWolf`) chỉ dùng trong bộ tối ưu (`optimizer-candidate.ts:96-97`), đang tắt. Mục tiêu co của Ledoit-Wolf là μ·I, spec nêu "một nhân tố Sharpe hoặc tương quan không đổi".
- **Làm**:
  1. Thêm lựa chọn `target: "SCALED_IDENTITY" | "CONSTANT_CORRELATION"` vào khối tối ưu của chính sách (mặc định giữ `SCALED_IDENTITY` để không đổi). Cài `CONSTANT_CORRELATION` theo công thức Ledoit-Wolf 2004, có test so với kết quả tính tay trên ma trận 3×3.
  2. Tài liệu hóa rằng mô phỏng (bước 6) dùng lấy mẫu lịch sử, **không** co kỳ vọng. Spec không yêu cầu co trong bootstrap; ghi rõ trong `disclosure.limitations` mã `BOOTSTRAP_USES_HISTORICAL_MEAN`.
- **Golden**: được đổi ở `limitations` (thêm 1 mã).

---

## 8. Bước 5: Tạo tập danh mục có ràng buộc (§4, §6.3)

### B5-1. Ràng buộc thanh khoản (ràng buộc 4 §6.3)
- **Làm**: trong `allocation-risk/service.ts` (vòng duyệt ứng viên, cạnh `outsideBounds`), loại phương án có tỷ trọng CASH tháng đầu nhỏ hơn `uncovered12 / growthCapital` (lấy `uncovered` 12 tháng từ B2-3). Mã loại: `LIQUIDITY_CONSTRAINT`. Với bộ tối ưu: truyền `hardLimits` thanh khoản vào `optimizer-candidate.ts` (hiện dòng 102 chỉ truyền `assetBounds`).
- **Golden**: IDENTICAL (15 ca không có nhu cầu chưa khớp).

### B5-2. Tài sản bị khóa
- **Làm**: truyền `lockedWeights` cho bộ tối ưu (`optimizer.ts:39,361` đã hỗ trợ) từ holdings có `lockedUntil` sau ngày định giá (`holdings/repository.ts:36`). Trong lưới cố định: không có tài sản khóa trong 4 lớp chính sách, nên chỉ ghi `LOCKED_HOLDINGS_EXCLUDED` vào giải thích.
- ESOP: hồ sơ chưa có loại tài sản này (`CHỜ CHỐT` có thêm loại `EMPLOYER_STOCK` không).

### B5-3. Lô tối thiểu và trần từng tổ chức phát hành
- Spec gắn lô tối thiểu với "khi chuyển sang danh mục thực thi". Đây là bước 7 (sản phẩm cụ thể), không phải lớp tài sản.
- **Làm**: không thêm vào bước 5. Ghi rõ trong tài liệu và trong `rule` của response: `ASSET_CLASS_LEVEL; LOT_AND_ISSUER_LIMITS_AT_EXECUTION`. Phần thực thi xem B7-4.

### B5-4. Bảng nền và lộ trình
- Đã khớp §4.1 ở các mốc 15/10/5/3/0 năm. Chặng giữa nội suy tuyến tính; ghi vào tài liệu chính sách là lựa chọn của An Hưu. Không sửa.

### B5-5. Bật bộ tối ưu liên tục (sau B4-1)
- **Hiện tại**: tắt ở mọi nơi. `ENABLE_CONTINUOUS_OPTIMIZER` không có trong `.env*` lẫn cấu hình Azure; chính sách không có khối `continuousOptimizer`; 15/15 ca báo `optimization: DISABLED`.
- **Làm** (chỉ chuẩn bị, **không bật trên production**):
  1. Bản nháp khối `continuousOptimizer` trong `backend/data/drafts/policy-params-draft.json` (`evidence: "CHỜ DUYỆT"`; γ, κ, η, bounds giống `customization.bounds`, `estimation.historicalWeight`, `monthlyBaselines` lấy từ giả định đã công bố).
  2. Ca audit **C17** chạy với `ENABLE_CONTINUOUS_OPTIMIZER=true` và chính sách có khối nháp (memory-db): phương án tối ưu phải qua `checkPortfolioFeasibility`, qua giới hạn lỗ, và được mô phỏng như các ứng viên khác.
  3. Báo cáo so sánh C01–C15 khi bật và khi tắt (chỉ báo cáo, không đổi golden mặc định).
- `CHỜ CHỐT`: bật hay không, và khi nào (khuyến nghị: chỉ sau khi B4-1 đạt chuẩn).

---

## 9. Bước 6: Mô phỏng và đánh giá (§7, §9)

### B6-1. 1.000 kịch bản chạy thật được (sau deploy lên B2)
- **Làm**:
  1. Script `backend/scripts/bench-simulation.cjs`: chạy C01, C05, C15 ở 20/100/500/1000 kịch bản với `SIM_WORKERS=0/1`, in thời gian và số lượt gửi tiếp.
  2. Sau khi chủ sản phẩm deploy, chạy trên B2 qua một endpoint chẩn đoán **chỉ ADMIN**, hoặc chạy script trong Kudu console. `CHỜ CHỐT` cách chạy.
- **Mục tiêu đề xuất** (`CHỜ CHỐT`): 1.000 kịch bản × 3 phương án ≤ 3 phút trên B2.
- Nếu không đạt: thêm chế độ chạy nền (job id, lưu tiến độ trong cache hiện có, trình duyệt hỏi lại theo chu kỳ).

### B6-2. Sốc chứng khoán "trước hoặc trong 2 năm đầu nghỉ hưu" (§9.1 dòng 2)
- **Hiện tại**: `allocation-risk/stresses.ts:169` đặt sốc tại `retirementMonth + offsetMonths` với `offsetMonths: 0`, một tháng duy nhất.
- **Làm**: tham số chính sách `EQUITY_CRASH.offsetsMonths: number[]` (mặc định đề xuất `[-12, 0, 12, 24]`, `CHỜ CHỐT`). Chạy từng offset; báo **kịch bản xấu nhất** và từng kết quả. Thêm `firstShortfallMonth` vào mọi kết quả kịch bản (từ dòng có `unfundedWithdrawal > 0` đầu tiên).
- Giữ `offsetMonths` cũ cho tương thích (một phần tử).
- **Golden**: được đổi ở `rawScenarios` (thêm kết quả và `firstShortfallMonth`). Kết quả offset 0 phải trùng số cũ.

### B6-3. Rủi ro thứ tự lợi suất (§9.2)
- **Hiện tại**: `sequenceOfReturns` (`stresses.ts:130`) chỉ có trong test.
- **Làm**: kịch bản mới `SEQUENCE_OF_RETURNS` trong mode scenarios. Lấy chuỗi lợi suất xác định của kế hoạch quanh 5 năm đầu nghỉ hưu, chạy hai thứ tự "lỗ trước" và "lãi trước" có cùng lợi suất bình quân (đảo các năm âm lên đầu), rồi báo chênh lệch số dư. Tham số trong chính sách (`CHỜ CHỐT` mức lỗ/lãi, mặc định đề xuất −20%/+25% như ví dụ spec).
- Test giữ ví dụ 775M/820M của spec.
- **Golden**: được đổi ở `rawScenarios` (thêm kịch bản).

### B6-4. Vàng: spread 5–10%
- **Làm**: `GOLD.spreadPoints` nhận mảng `[5, 10]` (giữ kiểu số cũ), chạy cả hai mức, đánh dấu `SEVERE` cho 10.
- **Golden**: được đổi ở `rawScenarios`. Mức 5 phải trùng số cũ.

### B6-5. Mất thu nhập khi sắp nghỉ hưu
- **Hiện tại**: C09, C12 trả `REVIEW_REQUIRED SCENARIO_OUTSIDE_PLAN_HORIZON` vì bắt đầu 24 tháng trước nghỉ hưu rơi vào quá khứ.
- **Làm**: nếu cửa sổ bắt đầu trước tháng định giá, dời về tháng định giá và cắt độ dài cho vừa giai đoạn tích lũy. Không còn tháng tích lũy nào thì `NOT_APPLICABLE` + `NO_ACCUMULATION_MONTHS`. Ghi `windowAdjusted: true`.
- **Golden**: được đổi ở `rawScenarios` của C09, C12 (và ca nào khác bị dời).

### B6-6. Lạm phát chi phí y tế (§9.1 dòng 1) và chi phí cuối đời (dòng 8)
- `CHỜ CHỐT` tham số (mức lạm phát y tế, chi phí chăm sóc cuối đời). Làm cơ chế:
  - `HIGH_INFLATION.healthDeltaPoints` áp lên khoản chi `HEALTH`;
  - `LONGEVITY.lateLifeCareMonthly` cộng thêm từ tuổi 75.
  Không có tham số thì không áp dụng.
- **Golden**: IDENTICAL.

### B6-7. Giải thích bằng ngôn ngữ tự nhiên, cá nhân hóa (§2 "Explainability")
- **Hiện tại**: có `decisionExplanations` (`retirement/preview-insights.ts:149`) và bảng "vì sao" ở FE, nhưng lý do là chuỗi mẫu chung.
- **Làm**: trong response selection (`ALLOCATION_V2`) thêm `explanation: [{ code, parameters, text }]`, dựng từ số liệu thật:
  - mục tiêu đã tách riêng ("Bạn cần X cho Y tháng M, nên Z hôm nay được giữ riêng trong tiền gửi");
  - thời hạn vốn dài hạn;
  - ràng buộc nào đang chặn (giới hạn lỗ, trần tỷ trọng, thanh khoản);
  - vì sao chọn phương án này (đạt ngưỡng, CVaR, ít đổi so với tài sản đang giữ);
  - nếu không khả thi thì câu bất biến của spec §2 ("đề xuất điều chỉnh mức góp, lùi tuổi nghỉ hưu hoặc giảm chi tiêu tùy chọn; không tăng lãi suất kỳ vọng").
  Không có số nào ngoài số trong response.
- **FE**: hiển thị trong khối "Vì sao" (`AllocationResults.tsx` hoặc `AllocationExperiment.tsx`).
- **Golden**: được đổi (thêm trường `explanation`).

### B6-8. Ngưỡng do khách chọn (§7.4 bước 2 "hoặc ngưỡng do khách hàng lựa chọn")
- **Làm**: request selection nhận `essentialThreshold` tùy chọn, chỉ trong khoảng chính sách cho phép (`policy.allocationRisk.essentialThresholdRange`, mặc định đề xuất [0,90; 0,95], `CHỜ CHỐT`). Ngoài khoảng thì từ chối 422. Không gửi thì dùng ngưỡng chính sách như cũ.
- **Golden**: IDENTICAL.

### B6-9. Giao diện kịch bản sốc
- `AllocationScenarios.tsx`: hàng `SEVERE` đang trùng tên với hàng thường. Thêm nhãn "mức nặng", hiện các offset của B6-2 và kịch bản mới của B6-3.

---

## 10. Bước 7: Theo dõi và tái cân bằng (§8)

### B7-1. Lịch sử quyết định tái cân bằng (có migration)
- **Hiện tại**: `proposeRebalance` trả `persisted: false`; không có bảng lưu.
- **Làm**:
  1. Migration mới `prisma/migrations/2026112X0001_rebalance_decisions/` với model `RebalanceDecision`:
     `id, userId, planVersionId?, createdAt, source ("PROPOSAL" | "MONITOR"), oldWeights Json, targetWeights Json, newWeights Json, trigger, bandPoints, costEstimate, trades Json, probabilityBefore?, probabilityAfter?, decision ("PROPOSED" | "ACCEPTED" | "DISMISSED"), note?`.
     Khóa ngoại tới user (giống các bảng sở hữu khác), có index `(userId, createdAt)`. Không sửa migration cũ.
  2. API: `POST /me/retirement/risk/rebalance` có `record: true` thì lưu `PROPOSED`. Thêm `POST .../rebalance/:id/decision` (ACCEPTED/DISMISSED) và `GET .../rebalance/history`. Chỉ chủ sở hữu đọc được.
  3. `probabilityBefore/After`: tùy chọn, chạy mô phỏng 20 kịch bản với tỷ trọng cũ và mới (dùng cache). `CHỜ CHỐT` có bắt buộc không.
- **Kiểm**: theo `backend/AGENTS.md`: chạy migration trên DB tạm (`scripts/verify-clean-upgrade.cjs` hoặc tương đương), **không áp dụng lên DB thật**. Ghi lệnh áp dụng để chủ sản phẩm tự chạy.
- **FE**: lịch sử trong `InvestmentsPage.tsx`/`RiskAnalysis.tsx` (ghi `task-frontend.md`).

### B7-2. Thuế và phí giao dịch khi bán
- **Làm**: tham số chính sách `rebalance.saleTaxPercent` và `rebalance.transactionFeePercent` có `evidence` ghi **số hiệu văn bản pháp luật đã ban hành** (`CHỜ CHỐT` giá trị và văn bản; AI không tự tra rồi điền). `proposeRebalance` cộng thuế trên giá trị bán vào chi phí. Không có tham số thì giữ như cũ và ghi `TAX_NOT_MODELED`.
- **Golden**: IDENTICAL.

### B7-3. Cổ tức và đáo hạn vào tiền tự do (bước 1 §8.2)
- **Hiện tại**: `holdings/repository.ts:36,55` luôn truyền `maturedAmount: "0"`.
- **Làm**: lấy `maturedAmount` từ holdings có ngày đáo hạn đã qua trong tháng (nếu schema có), và cổ tức/lợi tức đã ghi nhận (nếu module actuals có). Không có dữ liệu thì để 0 và ghi `MATURITIES_NOT_RECORDED`.

### B7-4. Nối giám sát lệch và lệnh theo sản phẩm
- **Hiện tại**: `holdings/service.ts:154 monitorPortfolioDrift` và `:310 generateProductLevelRebalanceOrders` chỉ có trong test.
- **Làm**: route `GET /investments/holdings/drift` (giám sát) và `POST /investments/holdings/rebalance-orders` (lệnh theo sản phẩm, có lô HoSE 100 và quỹ mở lẻ), chỉ đọc, `persisted: false`. Cập nhật OpenAPI. FE ghi `task-frontend.md`.

### B7-5. Phí tư vấn theo số ngày/365 (§8.1)
- **Hiện tại**: `retirement/advisory-fee.ts:12,22-23` dùng `annualPercent/12` theo tháng nguyên (quy ước `FULL_MONTH_NO_DAILY_PRORATION`).
- **Làm**: chỉ áp cho model v5. Phí tháng = `annualPercent/100 × A_bq × (số ngày của tháng)/365`. Ghi `conventions.advisoryFeeBasis: "ACTUAL_DAYS_365"`. v3 giữ nguyên. Áp cho cả `prepareRetirement` và mô phỏng (sau A1).
- **Golden**: IDENTICAL (15 ca không có phí). Test mới so tay một tháng 31 ngày và một tháng 28 ngày.

### B7-6. Lộ trình giảm rủi ro theo chi tiêu thực tế (§8.3)
- **Hiện tại**: nội suy theo số năm còn lại (`portfolios/engine.ts:13-30`), không dựa trên chi tiêu.
- **Làm** (cơ chế, tắt mặc định): tùy chọn chính sách `glidePath.spendingFloorYears` (`CHỜ CHỐT`, spec gợi ý 3–5). Từ tháng nghỉ hưu, tỷ trọng CASH + GOV_BOND tối thiểu bằng PV chi tiêu thiết yếu của N năm đầu chia cho vốn tăng trưởng (giới hạn trong `customization.bounds`). Phần còn lại theo lộ trình mẫu.
- **Golden**: IDENTICAL khi không bật.

---

## 11. Sở hữu file khi chạy song song

| Nhóm việc | File được sửa |
|---|---|
| A1, B7-5 | `allocation-risk/simulation.ts` (runPath), `retirement/advisory-fee.ts`, `simulation-kernel.ts` (nếu tăng tốc phí) |
| A2 | `allocation-risk/policy.ts`, `allocation-risk/schema.ts` |
| A3, B3-x, B2-3 | `assumptions/schema.ts`, `capital/separation.ts`, `capital/liquidity.ts` (mới) |
| A4 | `rebalance.ts`, `simulation.ts` (bandTriggered), `simulation-kernel.ts` (bandExceeded, screenBand), `holdings/service.ts` |
| A5 | `allocation-risk/service.ts` (customEval), `allocation-risk/loss-candidates.ts`, `portfolios/engine.ts` (cache) |
| B1-x | `retirement/obligations.ts` (mới), `portfolios/workspace.ts`, `allocation-risk/adjustments.ts` |
| B2-1, B2-2, B2-4 | `capital/loss-constraint.ts`, `portfolios/schema.ts`, `profiles/schema-v2.ts` |
| B4-x | `allocation-risk/market-schema.ts`, `market-service.ts`, `estimation.ts` |
| B5-x | `allocation-risk/service.ts` (vòng ứng viên), `optimizer-candidate.ts` |
| B6-2..B6-6 | `allocation-risk/stresses.ts`, `allocation-risk/policy.ts` (stresses) |
| B6-7, B6-8 | `allocation-risk/service.ts` (dựng response), `retirement/preview-insights.ts` |
| B7-1..B7-4 | `prisma/schema.prisma`, migration mới, `holdings/*`, `allocation-risk/rebalance.ts`, router |

Hai việc cùng chạm một file thì **chạy nối tiếp**, không song song: A4 và A1 (`simulation.ts`, `simulation-kernel.ts`); A2 và B6-x (`policy.ts`); A5, B5-x và B6-7 (`allocation-risk/service.ts`).

## 12. Nghiệm thu chung (phiên kiểm sẽ chạy)

1. `cd backend && npx tsc --noEmit -p tsconfig.json && npx tsc -p tsconfig.test.json`: sạch.
2. `node node_modules/vitest/vitest.mjs run --maxWorkers=2`: toàn bộ qua. Hiện có 1.479 test, sau plan phải nhiều hơn.
3. Audit 16–17 ca (thêm C16, C17): `AUDIT_RUN=1 AUDIT_RAW=1 ...`. So golden theo mục 1 và đối chiếu danh sách "được đổi" của từng việc.
4. Frontend: `npx tsc --noEmit -p tsconfig.json`, `npm run test:assets`, `npm run test:logic`, build lại dist rồi chạy 2 bộ E2E.
5. OpenAPI: mỗi trường mới có trong `backend/docs/*.openapi.yaml`, test hợp đồng qua, `openapi.yaml` không mất path.
6. `backend/PROGRESS.md` có mục cho từng việc. `AN_HUU_ALLOCATION_AUDIT.md` có mục M: bảng 7 bước cập nhật trạng thái.
7. Không có file tạm trong repo (`zz-tmp-*`, `*.tmp.ts`, script vá), không có thư mục mới ngoài repo.

## 13. Danh sách `CHỜ CHỐT` (chủ sản phẩm trả lời trước hoặc trong lúc làm)

| Mã | Câu hỏi | Mặc định nếu chưa chốt |
|---|---|---|
| A2 | Trần số kịch bản do chính sách ghim | 1.000 (= LIMITS.maxPaths) |
| A4 | Đổi tên mã lý do tái cân bằng | Giữ tên cũ, thêm trường `trigger` |
| B1-2 | Lùi mục tiêu linh hoạt tối đa bao lâu | 60 tháng, bậc 6 tháng |
| B2-1 | Bắt buộc nhập cả số tiền và % | Cho phép một; có cả hai thì lấy min |
| B2-2 | Hệ số theo phản ứng SELL/HOLD/BUY_MORE | Không áp dụng (chưa có khối duyệt) |
| B2-4 | Quy tắc tương quan nghề nghiệp, thu nhập bấp bênh | Không áp dụng |
| B3-2 | Chiết khấu mục tiêu theo TPCP kỳ hạn | Giữ lãi tiền gửi theo kỳ hạn |
| B4-1 | Nguồn dữ liệu tổng lợi suất, giấy phép, override công bố | Chặn công bố bản mới thiếu chuẩn |
| B4-2 | Ngưỡng lịch sử tối thiểu | 120 tháng, chỉ cảnh báo |
| B5-2 | Thêm loại tài sản cổ phiếu công ty nơi làm việc | Không thêm |
| B5-5 | Bật bộ tối ưu liên tục | Không bật |
| B6-1 | Mục tiêu thời gian và cách chạy đo trên B2 | ≤ 3 phút; cách chạy chờ chốt |
| B6-2 | Các offset sốc chứng khoán | [-12, 0, 12, 24] tháng |
| B6-3 | Mức lỗ/lãi kịch bản thứ tự lợi suất | −20% / +25% |
| B6-6 | Lạm phát y tế, chi phí chăm sóc cuối đời | Không áp dụng |
| B6-8 | Khoảng ngưỡng khách được chọn | [0,90; 0,95] |
| B7-1 | Bắt buộc tính xác suất trước/sau khi lưu quyết định | Không bắt buộc |
| B7-2 | Thuế suất, phí giao dịch và văn bản pháp luật | Không áp dụng, ghi `TAX_NOT_MODELED` |
| B7-6 | Số năm chi tiêu được bảo vệ trong lộ trình | Không bật |
