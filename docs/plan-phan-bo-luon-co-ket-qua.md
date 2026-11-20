# Kế hoạch: trang Phân bổ luôn có kết quả mà vẫn đúng nghiệp vụ

Ngày lập: 18/11/2026. Phạm vi: phân tích và kế hoạch cho `/user/risk-portfolio`. Tài liệu này không sửa code, không chạy migration, không ghi DB, không công bố chính sách hay dữ liệu thị trường.

Mục tiêu: mọi hồ sơ hợp lệ đều thấy một danh mục có ý nghĩa, giống trải nghiệm demo, với ba nguyên tắc:
- Không bịa số.
- Không đưa ra xác suất khi chưa có dữ liệu thị trường đã công bố.
- Không gọi một danh mục vượt giới hạn chịu lỗ là "đề xuất".

---

## 1. Nguyên nhân gốc của từng điều kiện

### 1.1. Điều kiện 1: phải có dữ liệu thị trường tháng đã PUBLISHED

**Hiện trạng**
- `backend/src/modules/allocation-risk/service.ts:114-115`: hàm đọc bộ dữ liệu đã công bố rồi trả `DATA_REQUIRED` / `PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED`. Bước này chạy **trước** khi rẽ theo chế độ, nên áp cho cả ba chế độ `simulation`, `scenarios`, `selection`.
- Chế độ `scenarios` (`service.ts:124-151`) không dùng `dataset`. Chế độ này chạy trên `deterministicMarket(preview)` (`service.ts:85-93`, `130`), tức giả định năm đã ghim của kế hoạch. Kết quả tự ghi `limitations: ["NO_PROBABILITY_FOR_DETERMINISTIC_STRESS"]` (`service.ts:151`).
- Trong chế độ `selection`, việc kiểm tra giới hạn chịu lỗ (`service.ts:183-186`, hàm `assessLossConstraint`) chỉ dùng mức sốc tức thời của chính sách. Phần này cũng không cần dữ liệu thị trường.
- Test đang khóa hành vi hiện tại: `backend/src/tests/allocation-risk-api.test.ts:113` kỳ vọng `scenarios` trả `DATA_REQUIRED`.

**Kết luận**
- *Đúng nghiệp vụ* cho phần xác suất. Thuật toán định nghĩa `p thiết yếu` và CVaR trên các đường block bootstrap lấy từ chuỗi lợi suất tháng (`sites/an-huu-trai-nghiem/thuat-toan-phan-bo-tai-san.md` §7.1, §7.3; `backend/docs/ALLOCATION_RISK_P2.md:23`). Thiếu dữ liệu thì không có xác suất. Đây là quy tắc đúng.
- *Là khoảng trống triển khai* ở hai chỗ:
  - Chặn luôn phần tất định: kịch bản sốc và kiểm tra giới hạn lỗ.
  - Không trả về danh mục theo chính sách (template đã được chọn từ khảo sát) như một kết quả "chưa mô phỏng".

  Nhờ vậy demo luôn có số, còn bản chính hiện trống.

### 1.2. Điều kiện 2: chính sách phải có `data.customization`

**Hiện trạng**
- `backend/src/modules/portfolios/custom.ts:40-41`: `customWeightIssues` trả `CUSTOM_POLICY_REQUIRED` khi thiếu `customization`. `portfolios/engine.ts:256-260` chặn tỷ trọng tự chọn. `retirement/prepare.ts:96` chặn `allocationFunding`.
- Ảnh hưởng ngầm, ít được để ý: trong `selection`, ứng viên khác `BASE` chỉ có `selection` (công thức có thể phát lại vào kế hoạch) khi chính sách có `customization` (`service.ts:191-205`). Sau đó danh mục tham khảo chỉ được chọn trong số ứng viên phát lại được (`service.ts:210-212`).
- Vì vậy khi thiếu `customization`, ứng viên **duy nhất** có thể làm danh mục tham khảo là `BASE`. `LOWER_EQUITY` dù nằm trong giới hạn lỗ cũng không bao giờ được chọn. Điều kiện 2 làm điều kiện 3 tệ hơn.

**Kết luận**
- *Đúng nghiệp vụ*: tỷ trọng tự chọn phải nằm trong giới hạn admin đã duyệt (`custom.ts:14-21`). Hệ thống không được tự đặt giới hạn.
- *Khoảng trống triển khai*: điều kiện "phát lại được" đang trộn hai việc khác nhau:
  - "được **hiển thị** làm tham khảo";
  - "được **áp dụng** vào bản nháp".

  Danh mục giảm rủi ro chỉ chuyển cổ phiếu sang tiền gửi theo `lossStress` đã duyệt. Danh mục này vẫn đáng hiển thị làm tham khảo (ghi "chưa áp dụng được"), dù chưa phát lại được.

### 1.3. Điều kiện 3: ứng viên phải nằm trong giới hạn chịu lỗ

**Hiện trạng**
- `service.ts:183-186`: ứng viên có bất kỳ tháng nào không `WITHIN_LIMIT` thì bị loại với `LOSS_CONSTRAINT_EXCEEDED`. Ứng viên bị loại không được mô phỏng.
- Tập ứng viên chỉ gồm `BASE` và ± `equityShiftPoints` (`allocation-risk/selection.ts:4-13`; đặc tả nội bộ `backend/docs/ALLOCATION_RISK_P2.md:27`). Nếu cả ba vượt giới hạn thì:
  - `scores` rỗng, nên `referenceId = null` (`service.ts:211-217`);
  - status là `INSUFFICIENT`, kèm gợi ý góp thêm, nghỉ hưu muộn hoặc giảm chi (`service.ts:213-216`). Các gợi ý này **không** giải quyết được vấn đề vượt giới hạn lỗ;
  - frontend hiện "Chưa đủ dữ liệu để đề xuất phương án" (`frontend/src/components/AllocationResults.tsx:43`) và "Cần rà soát" (`AllocationResults.tsx:113`, `AllocationExperiment.tsx:213`).
- Backend **đã tính sẵn** phương án giảm rủi ro nhưng không dùng: `capital/loss-constraint.ts:52-66` trả `REDUCE_RISK` kèm `maxEquityWeightPercent`, `proposedAllocations` và `proposedLossAmount`. Phương án này chuyển đúng phần cổ phiếu cần thiết sang tiền gửi. Workspace cũng trả `loss` này (`portfolios/workspace.ts:46-47`). Tuy vậy `selection` không biến nó thành ứng viên.
- Demo luôn có nghiệm vì hai lý do:
  - Lưới khoảng 70 tổ hợp có cả danh mục 100% tiền gửi với mức sốc 0% (`sites/an-huu-trai-nghiem/dist/allocation-model.js:46` cho `SHOCK`, `54-63` cho lưới).
  - Ứng viên vượt lỗ chỉ bị đánh dấu `valid:false` (`allocation-model.js:51-52`).

  Nhờ vậy luôn còn ít nhất một ứng viên trong giới hạn.

**Kết luận**
- *Đúng nghiệp vụ*: giới hạn chịu lỗ là ràng buộc cứng. Thuật toán §7.4 bước 1 loại các phương án vi phạm ràng buộc cứng (`thuat-toan-phan-bo-tai-san.md:272`).
- *Khoảng trống triển khai*:
  1. Thuật toán §10.4 ghi khi vượt giới hạn thì *"buộc phải hạ tỷ trọng cổ phiếu dài hạn hoặc yêu cầu khách hàng điều chỉnh lại kỳ vọng"* (`thuat-toan-phan-bo-tai-san.md:390`). Bản chính không làm cả hai: không sinh ứng viên đã hạ cổ phiếu, cũng không nói khách cần nâng giới hạn lên bao nhiêu.
  2. Bước nhảy cố định ±`equityShiftPoints` quá thô. Nếu cần giảm 9 điểm mà bước là 5 thì `LOWER_EQUITY` vẫn vượt.
  3. Status `INSUFFICIENT` dùng chung cho hai tình huống khác nhau: "không đạt ngưỡng đủ chi" (§7.4 bước 4) và "không có phương án trong giới hạn lỗ" (§10.4).
- Ví dụ thực tế: giới hạn 99,9 triệu (15% vốn dài hạn, tức vốn dài hạn khoảng 666 triệu), danh mục thận trọng giảm 121,5 triệu (18,2%). Với cổ phiếu sốc -35% và tiền gửi 0%, chỉ cần chuyển khoảng 9,3 điểm cổ phiếu sang tiền gửi là đạt, tức `REDUCE_RISK` khả thi. Con số này là ước tính theo cấu trúc công thức. **Cần xác minh** bằng mức sốc và `equityShiftPoints` thật của chính sách đang công bố, đọc-only (bước 0 ở mục 3).

---

## 2. Đánh giá phương án

### (a) Luôn trả danh mục tham khảo khi mọi ứng viên vượt giới hạn lỗ: **khuyến nghị, làm theo hai tầng**

Tầng 1, đúng như §10.4 "hạ tỷ trọng cổ phiếu":
- Thêm ứng viên `LOSS_REDUCED` lấy từ `assessLossConstraint(...).proposedAllocations` của từng tháng glide.
- Ứng viên này chỉ đổi cổ phiếu sang tiền gửi, theo `lossStress.equityAssetClass/depositAssetClass` đã duyệt.
- Nếu ứng viên nằm trong giới hạn: mô phỏng như ứng viên thường (khi có dữ liệu) và có thể trở thành danh mục tham khảo.

Tầng 2, đúng như §10.4 "yêu cầu khách điều chỉnh kỳ vọng". Khi kể cả chuyển hết cổ phiếu vẫn `NOT_FEASIBLE`:
- Trả `referenceKind: "LEAST_LOSS_OVER_LIMIT"` cùng danh mục ít lỗ nhất trong phạm vi chính sách cho phép.
- Kèm `lossFeasibility`: `minimumLossAmount`, `allowedLossAmount`, `requiredTolerancePercentOfGrowth = minimumLoss / growthCapital × 100`, `requiredToleranceAmountVnd`.

Ràng buộc để vẫn đúng:
- `selectedId` luôn `null` khi danh mục vượt giới hạn. Không bao giờ dán nhãn "Phương án đề xuất".
- Nút "Dùng trong bản nháp" bị khóa. Chỉ mở hành động "Nâng giới hạn chịu lỗ lên X" (`saveAllocationRisk`, `portfolios/workspace.ts:61-76`), và khách phải tự xác nhận.
- Tách status theo nguyên nhân: thêm issue `NO_CANDIDATE_WITHIN_LOSS_LIMIT`. Không trả `adjustmentOptions` góp thêm, nghỉ muộn hoặc giảm chi cho trường hợp này vì chúng không xử lý giới hạn lỗ. Hoặc trả kèm nhưng ghi rõ chúng thuộc ngưỡng đủ chi.

### (b) Chưa có dữ liệu published: chế độ "kiểm tra tất định": **khuyến nghị**

- `scenarios` chạy được không cần dữ liệu (bỏ gate ở `service.ts:114-115` cho chế độ này). `marketVersionId` khi đó là `null`.
- `selection` khi thiếu dữ liệu vẫn giữ `status: "DATA_REQUIRED"` để giữ đúng ngữ nghĩa, nhưng trả thêm khối `deterministic`:
  - với mỗi ứng viên (`BASE`, `LOWER/HIGHER_EQUITY`, `LOSS_REDUCED`): tỷ trọng, kết quả `assessLossConstraint`, và `runPath` trên `deterministicMarket(preview)` (đủ chi hay không theo đường cơ sở, `essentialLossToday`);
  - `referenceId` chọn theo: (1) trong giới hạn lỗ, (2) đổi ít nhất so với template (`BASE` trước). Không xếp hạng bằng một đường tất định, vì như vậy là thay tiêu chí xác suất và CVaR bằng một tiêu chí chưa được duyệt;
  - `basis: "PINNED_DETERMINISTIC_ASSUMPTIONS"` và `limitations: ["NO_PROBABILITY_WITHOUT_PUBLISHED_MARKET_DATA"]`.
- Không có `pEssential`, `cvar`, `wilson` hay `bands`. Frontend ghi rõ "Chưa mô phỏng xác suất, chỉ kiểm tra theo giả định cố định và tình huống sốc".
- Cần xác nhận thêm: chế độ `selection` còn đòi `equityShiftPoints`, `essentialThreshold` và `lossStress` (`service.ts:153-154`). Phải kiểm tra (đọc-only) chính sách đang công bố có các trường này chưa.

### (c) Dùng dữ liệu mô phỏng seed của demo làm fallback: **không khuyến nghị cho bản chính**

- *Độ đúng*:
  - Chuỗi demo sinh bằng công thức với lợi suất năm cố định 4,5 / 5,5 / 9 / 5 / 5,5 / 6% và seed cố định (`allocation-model.js:65-69`; `DOI-CHIEU-THUAT-TOAN-2026-11-06.md:90`).
  - Xác suất tính từ chuỗi này chỉ phản ánh giả định đã nhập vào, không phản ánh thị trường Việt Nam. Hiện nó dưới dạng "x% đủ chi" cho khách thật là giả xác suất, trái mục tiêu "không giả xác suất".
- *Hợp đồng dữ liệu*: `marketDocumentSchema` bắt buộc mỗi nguồn có `url`, `license`, `usage = SIMULATION_AND_DERIVED_OUTPUTS_PERMITTED` và `quality.imputation = NONE` (`market-schema.ts:16-23`). Dữ liệu tổng hợp không có nguồn thật. Muốn nạp vào thì phải điền nguồn giả, tức bịa số và vi phạm chính sách chỉ dùng dữ liệu có nguồn.
- *Pháp lý*:
  - Sản phẩm trình bày kết quả phân bổ cho khách thật. Tài liệu thuật toán tự dẫn Luật Chứng khoán (VBHN 102/VBHN-VPQH ngày 22/04/2026, `thuat-toan-phan-bo-tai-san.md` §11.2).
  - Xác suất dựa trên dữ liệu không phải thị trường thật, nếu khách hiểu là ước lượng thật, có rủi ro bị coi là thông tin gây hiểu nhầm.
  - Tài liệu này **không** kết luận điều khoản cụ thể. Cần pháp chế xác nhận trước khi xem xét bất kỳ dạng nào.
- *Dùng được ở đâu*: fixture cho test và dev cục bộ (đã có `backend/src/tests/allocation-risk-fixtures.ts`) và bản demo riêng (đã ghi nhãn "mô phỏng"). Không nạp vào DB bản chính.

### (d) Tỷ trọng tự chọn khi chưa có `customization`: **giữ chặn, nhưng tách "hiển thị" khỏi "áp dụng"**

- Giữ nguyên `CUSTOM_POLICY_REQUIRED` cho thanh kéo tự chọn và `allocationFunding`. Không tự sinh giới hạn: giới hạn là quyết định của admin.
- Đổi trong `selection`:
  - Ứng viên không phát lại được (`selection: null`) vẫn được phép làm `referenceId` để **hiển thị**, kèm `applicable: false` và `applyIssues: ["CUSTOM_POLICY_REQUIRED"]`.
  - Lọc `replayable` ở `service.ts:210` chỉ dùng cho quyền áp dụng, không dùng cho quyền hiển thị.
- Frontend: thẻ tham khảo hiện tỷ trọng và lý do "Chính sách chưa cho phép áp dụng tỷ trọng ngoài mẫu". Nút áp dụng bị khóa, có giải thích.
- Khi admin công bố `customization` (theo `docs/admin-cong-bo-du-lieu-phan-bo.md` §2), các ứng viên này tự trở thành áp dụng được qua nhánh có sẵn (`service.ts:193-204`). Không cần sửa thêm.

---

## 3. Kế hoạch triển khai

### Bước 0: xác minh, đọc-only, không ghi DB
- Đọc chính sách đang công bố qua API admin GET hoặc test fixture: `lossStress.shocks`, `equityShiftPoints`, `essentialThreshold`, `allocationRisk.stresses`, có hay không `customization`.
- Tái hiện ví dụ 99,9 / 121,5 triệu bằng unit test với cùng tham số để xác nhận `REDUCE_RISK` hay `NOT_FEASIBLE`.

### Bước 1, backend: tách gate dữ liệu cho phần tất định
- `allocation-risk/service.ts` `execute`: chỉ trả `DATA_REQUIRED` sớm cho `simulation`. Với `scenarios`, chạy tiếp với `reference` có `marketVersionId/marketVersion/marketHash = null`.
- Sửa test `allocation-risk-api.test.ts:113`: `scenarios` không còn `DATA_REQUIRED`. Thêm test kỳ vọng `READY` hoặc `REVIEW_REQUIRED` theo từng kịch bản.

### Bước 2, backend: ứng viên giảm rủi ro và danh mục ít lỗ nhất (hàm thuần)
- File mới `allocation-risk/loss-candidates.ts`:
  - `lossReducedCandidate(targets, capital, profile, policy)`: áp `assessLossConstraint` cho từng tháng rồi lấy `proposedAllocations`. Trả `valid` nếu mọi tháng là `WITHIN_LIMIT` hoặc `REDUCE_RISK`, cùng `changePoints`.
  - `leastLossAllocation(targets, policy)`:
    - Nếu có `customization.bounds`: tham lam theo mức sốc tăng dần, dồn tỷ trọng vào lớp ít sốc nhất tới `maxPercent`, giữ `minPercent`. Đây là LP một ràng buộc tổng nên lời giải tham lam là tối ưu.
    - Nếu không có: chuyển toàn bộ cổ phiếu sang tiền gửi, giống `loss-constraint.ts:54-55`.
  - `requiredTolerance(minLoss, growthCapital)`.
- `service.ts` vùng `162-216`:
  - Thêm ứng viên `LOSS_REDUCED` khi `BASE` không `WITHIN_LIMIT`.
  - Nếu sau vòng lặp `scores` rỗng: mô phỏng **một** danh mục ít lỗ nhất (nếu có dữ liệu và còn trong `LIMITS.maxPathMonths`), đánh dấu `withinLossLimit: false`.
  - Trả `referenceKind`, `lossFeasibility`, issue `NO_CANDIDATE_WITHIN_LOSS_LIMIT`. Giữ `selectedId: null`.
  - Không mô phỏng toàn bộ ứng viên bị loại, để giữ giới hạn tài nguyên.
- `selection.ts`: giữ nguyên `selectCandidate`, vì quy tắc chọn không đổi.
- Tách quyền: `applicable = !!selection` và `applyIssues`. `referenceChoice` chọn trên tất cả ứng viên trong giới hạn lỗ (`service.ts:210-212`).

### Bước 3, backend: `selection` khi thiếu dữ liệu
- Khi `!dataset` và `mode === "selection"`, chạy phần ứng viên và giới hạn lỗ như bước 2. Thay `simulate` bằng `runPath(context', deterministicMarket(preview))`.
- Trả `status: "DATA_REQUIRED"`, `issues` giữ mã cũ, thêm `deterministic: { basis, referenceId, referenceKind, candidates[], rejected[], lossFeasibility, limitations }`.
- Kiểm tra lại `activeUsers` và giới hạn thời gian: chạy tất định rẻ, nhưng vẫn đi qua `run()`.

### Bước 4: hợp đồng API và OpenAPI
- `backend/scripts/generate-allocation-risk-openapi.cjs`, sinh lại `backend/docs/allocation-risk.openapi.yaml` (schema `RiskResult` ở dòng `1554-1680`) và `backend/docs/openapi.yaml`. Các trường mới, đều tùy chọn và tương thích ngược:
  - `referenceKind`: enum `QUALIFIED | BEST_WITHIN_LOSS_LIMIT | LOSS_REDUCED_WITHIN_LIMIT | LEAST_LOSS_OVER_LIMIT | TEMPLATE_UNSIMULATED`, nullable;
  - `lossFeasibility`: object;
  - `deterministic`: object;
  - `Candidate.withinLossLimit`, `Candidate.applicable`, `Candidate.applyIssues`;
  - `marketVersionId/marketVersion/marketHash` nullable cho `scenarios`.
- Cập nhật mô tả `RiskResult` (dòng `1670-1679`) và `backend/docs/ALLOCATION_RISK_P2.md:27`: thêm ứng viên `LOSS_REDUCED`, cách xử lý khi không có ứng viên trong giới hạn lỗ, và chế độ tất định.
- Cập nhật `frontend/src/services/planningAnalysis.ts:30-36` (kiểu `RiskResult`).

### Bước 5, frontend: theo quy ước, bàn giao qua `docs/task-frontend.md` trừ khi người dùng giao trực tiếp
- `AllocationExperiment.tsx`:
  - dòng `201-202`: khi `DATA_REQUIRED` có `deterministic`, hiện thẻ tham khảo với nhãn "Chưa mô phỏng xác suất";
  - dòng `45-47` (`candidateName`): phân nhãn theo `referenceKind`;
  - dòng `250`: tách thông điệp vượt lỗ khỏi thông điệp chưa đạt ngưỡng đủ chi.
- `AllocationResults.tsx`:
  - dòng `40-44`: tiêu đề theo `referenceKind` thay cho "Chưa đủ dữ liệu";
  - dòng `84-87`: lấy danh mục tham khảo từ `deterministic` khi thiếu dữ liệu;
  - dòng `113`: huy hiệu "Vượt giới hạn X ₫, cần nâng lên Y ₫ hoặc Z%".
- `AllocationWorkspace.tsx:184`: `canApply` phụ thuộc `applicable`. Thêm nút "Nâng giới hạn chịu lỗ" dẫn tới form giới hạn có sẵn. Không tự lưu.
- `AllocationScenarios.tsx:9`: hiển thị khi `scenarios` chạy không cần dữ liệu.

### Bước 6: test
- Vitest backend (`backend/src/tests`):
  - `allocation-risk.test.ts`:
    - `lossReducedCandidate` cho đúng trần cổ phiếu, trùng `maxEquityWeightPercent`;
    - `leastLossAllocation` tối ưu trong `bounds`, có và không có `customization`;
    - `requiredTolerance` làm tròn đúng bằng Decimal;
    - ca 99,9 / 121,5 triệu.
  - `allocation-risk-api.test.ts`:
    - (1) `scenarios` không dữ liệu trả `READY` hoặc `REVIEW_REQUIRED`, không có xác suất;
    - (2) `selection` không dữ liệu trả `DATA_REQUIRED` kèm `deterministic.referenceId`, không có `pEssential`;
    - (3) mọi ứng viên vượt lỗ thì `selectedId null`, `referenceKind LEAST_LOSS_OVER_LIMIT`, có `lossFeasibility.requiredTolerance*`, `applicable false`;
    - (4) thiếu `customization` thì `LOSS_REDUCED` hiển thị được nhưng `applicable false`;
    - (5) có dữ liệu và trong giới hạn thì hành vi cũ không đổi (regression);
    - (6) kiểm tra OpenAPI (dòng `171-180`) cho các trường mới.
  - `allocation-custom.test.ts`: có `customization` thì `LOSS_REDUCED` phát lại được (`selection` không null).
- Playwright (`frontend/tests`): thêm `user-allocation-always-result.spec.ts`, dùng `page.route` mock `/me/retirement/risk/selection` cho 4 trạng thái:
  - thiếu dữ liệu;
  - vượt lỗ, có `LOSS_REDUCED`;
  - vượt lỗ, không khả thi;
  - đủ dữ liệu, đạt ngưỡng.

  Kiểm tra nhãn, nút áp dụng bị khóa hay mở, không có ký tự "%" xác suất khi thiếu dữ liệu, và chạy được trên viewport mobile.
- Chạy: `npm test` (backend), `npx playwright test user-allocation-*` (frontend), trên DB test cục bộ.

### Thứ tự làm
Bước 0 → 2 → 1 → 4 (phần bước 1–2) → 3 → 4 (phần bước 3) → 5 → 6 (test viết cùng từng bước).

Bước 2 đi trước vì nó giải quyết ca thật đang gặp (vượt lỗ) mà không phụ thuộc admin.

### Rủi ro
- Tăng số ứng viên làm tăng path-months. Phải giữ dưới `LIMITS.maxPathMonths` (`service.ts:176`): chỉ thêm tối đa 1–2 ứng viên.
- `assessLossConstraint` dùng vốn dài hạn hiện tại cho mọi tháng glide. Ứng viên giảm theo từng tháng có thể làm lộ trình không đơn điệu. Cần test chọn "giảm theo tháng đầu rồi đi theo dịch chuyển của template", giống `customTargets`.
- Khách hiểu nhầm "tham khảo vượt giới hạn" là khuyến nghị. Giảm rủi ro bằng nhãn, khóa nút áp dụng và `selectedId null`.
- Đổi hành vi `scenarios` làm đổi hợp đồng đã khóa bằng test. Phải cập nhật test và OpenAPI cùng lúc.
- Kết quả tất định không được trình bày như xác suất. Cần review giao diện và copy.

### Quyết định cần người dùng, admin hoặc khách chốt
1. **(Người dùng)** Chấp nhận trả danh mục "ít lỗ nhất, vượt giới hạn" làm tham khảo, khóa áp dụng (a, tầng 2), hay chỉ trả con số giới hạn tối thiểu cần nâng?
2. **(Người dùng)** Khi thiếu dữ liệu, có cho áp dụng template `BASE` (trong giới hạn lỗ) vào bản nháp không? Khuyến nghị: có, vì kế hoạch vốn tính tất định.
3. **(Người dùng)** Xác nhận không đưa dữ liệu seed của demo vào bản chính (c), và có cần pháp chế xem lại cách trình bày không.
4. **(Admin)** Công bố bộ dữ liệu thị trường có nguồn và giấy phép, cùng `customization.bounds` (`docs/admin-cong-bo-du-lieu-phan-bo.md`). Cũng cần xác nhận `equityShiftPoints`, `essentialThreshold` và `lossStress` đã có trong chính sách hiện hành.
5. **(Khách)** Nâng giới hạn chịu lỗ là thao tác của khách, có xác nhận. Hệ thống chỉ gợi ý con số tối thiểu.
6. **(Người dùng)** Frontend do AI khác làm (bàn giao qua `docs/task-frontend.md`) hay giao trực tiếp?
