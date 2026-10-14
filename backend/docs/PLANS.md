# T07 — Snapshot và áp dụng phiên bản kế hoạch

> Cập nhật 05/10/2026: model v3 hỗ trợ góp đầu/cuối tháng; EXPLICIT_DEPOSITS_ONLY đã chốt; có preview/lưu/apply reforecast và giữ replay v2. Contract hiện hành: [CONTRIBUTIONS_REFORECAST.md](CONTRIBUTIONS_REFORECAST.md). Các mô tả chỉ cuối kỳ/reforecast chỉ đọc/chờ Q13–Q15 ở checkpoint cũ bên dưới là lịch sử.

Cập nhật T08: đã có report chung, so sánh, mô phỏng, CSV và whatIf cá nhân; xem [PLAN_PRESENTATION.md](PLAN_PRESENTATION.md). Request lưu T07 nhận selection mở rộng T06, apply không biến giá trị whatIf thành dữ liệu hồ sơ thật. Nghiệm thu giao diện vẫn riêng, không suy từ backend tests.

Backend checkpoint 04/10/2026. Dùng bộ tính `retirement-monthly-v2` T06. Xem [RETIREMENT_MONTHLY.md](RETIREMENT_MONTHLY.md) về công thức, đầu vào, giới hạn và quy ước tháng. Contract API: [plans.openapi.yaml](plans.openapi.yaml), được ghép vào OpenAPI chính. Các endpoint dưới là USER có phiên hợp lệ; ownership lấy từ phiên, ADMIN không dùng đường USER.

## Quy trình và endpoint

1. Gọi `POST /api/v1/me/retirement/preview` T06, nhận READY và inputHash. Preview không ghi dữ liệu.
2. Gọi `POST /api/v1/me/retirement/plans` để tạo kế hoạch và phiên bản đầu, hoặc `POST /api/v1/me/retirement/plans/:planId/versions` để lưu phiên bản tiếp. Cả hai **không áp dụng** và không đổi currentVersionId/baselineVersionId.
3. Đọc lại bản đã lưu rồi gọi `POST /api/v1/me/retirement/plans/:planId/apply` với confirm, revision hiện tại và khóa chống lặp riêng. Chỉ lệnh này thay currentVersionId.

Hai lệnh ghi yêu cầu header `Idempotency-Key` là UUID. Giữ nguyên key khi retry cùng request; thao tác mới dùng key mới. Cùng key và nội dung đã chuẩn hóa trả lại kết quả đã commit; cùng key nhưng request khác trả 409 IDEMPOTENCY_CONFLICT. Phản hồi retry là kết quả lịch sử của lệnh đó, không phải trạng thái mới nhất: tải lại kế hoạch sau retry khi cần biết current hiện tại.

Payload lưu phiên bản:

```json
{
  "expectedRevision": 0,
  "expectedInputHash": "hash-64-ky-tu-hex-tu-response-preview",
  "preview": { "...": "toan-bo-request-T06-da-xem-truoc" }
}
```

Ví dụ chỉ biểu diễn cấu trúc, cần thay hash và preview bằng payload T06 thực. Tạo kế hoạch mới dùng revision 0; thêm version dùng revision kế hoạch đang đọc. Backend đọc lại hồ sơ/cấu hình, tính lại và so inputHash; không chấp nhận calculation/snapshot/initialCapital do client gửi. Nếu input khác preview trả PREVIEW_CHANGED; thiếu dữ liệu trả PLAN_INPUTS_INCOMPLETE, không lưu bản thiếu. Mỗi lưu thành công tăng revision kế hoạch 1 và version tuần tự trong kế hoạch.

Response lưu: `{planId,revision,currentVersionId,baselineVersionId,saved}`; saved gồm ID/version/thời điểm/profileRevision/snapshotHash và toàn bộ preview T06 đã lưu. HTTP 201; request lặp cũng trả 201 cùng nội dung.

Payload áp dụng:

```json
{
  "versionId": "uuid-phien-ban-da-luu",
  "expectedRevision": 1,
  "expectedProfileRevision": 1,
  "confirm": true
}
```

Version phải thuộc đúng kế hoạch của người dùng, snapshot toàn vẹn, revision và nội dung hồ sơ hiện tại phải khớp hồ sơ của snapshot. Nếu hồ sơ đã đổi, trả 409 PROFILE_CHANGED_RECREATE_VERSION: xem trước/lưu phiên bản mới rồi áp dụng; không áp kế hoạch lỗi thời lên hồ sơ mới. Nếu chỉ T03/T04 mới được công bố, vẫn có thể chủ động áp dụng bản đã lưu theo giả định cũ, với thông báo có cập nhật từ endpoint chi tiết.

Áp dụng tăng revision 1, đặt currentVersionId, giữ baselineVersionId là bản đầu tiên đã áp dụng. Nếu chuyển lại phiên bản cũ cùng hồ sơ thì baseline vẫn giữ nguyên. Đối với kế hoạch legacy có current mà chưa có baseline, lần chuyển đầu giữ current cũ làm baseline. Gọi áp dụng đúng bản đang current với revision hiện tại trả alreadyCurrent=true, không tăng revision hoặc tạo audit áp dụng mới. Response gồm `{planId,revision,currentVersionId,baselineVersionId,alreadyCurrent}`.

API đọc:

| Endpoint dưới `/api/v1/me/retirement/plans` | Nội dung |
| --- | --- |
| `GET /?page=1&limit=20` | Danh sách kế hoạch của chính người dùng; current/baseline/revision/stale |
| `GET /:planId` | current đã lưu, profileChanged và updates.assumptions/policy |
| `GET /:planId/versions?page=1&limit=20` | Lịch sử từ mới xuống cũ, summary/nguồn/hash của từng snapshot. Từ 14/10/2026 đọc bằng phép chiếu JSON trong SQL và **không** kiểm toàn vẹn từng snapshot (chỉ là danh sách); chi tiết/replay/CSV/so sánh/mô phỏng/áp dụng vẫn kiểm đầy đủ và trả 409 SNAPSHOT_INTEGRITY_FAILED nếu lệch |
| `GET /:planId/versions/:versionId` | Toàn bộ preview đã lưu, không tính bằng cấu hình hiện hành |
| `POST /:planId/versions/:versionId/replay` với `{}` | Chạy lại core từ dòng tháng snapshot; xác nhận matched hoặc báo mismatch |

Page ≥1, limit 1–50. Có thể có nhiều kế hoạch; mỗi kế hoạch có current riêng, không tự lấy kế hoạch đầu tiên làm kế hoạch duy nhất của tài khoản. UI cần giữ planId đã chọn; lựa chọn “kế hoạch chính toàn tài khoản” chưa được bổ sung vào schema trong T07.

## Bất biến, nguồn và cạnh tranh

Snapshot `retirement-plan-snapshot-v1` lưu profile đã chuẩn hóa, dữ liệu/approval/ID/version/hash T03 và T04, lựa chọn người dùng, modelVersion, ngày định giá, quy ước, nguồn, toàn bộ kết quả và replayInput tháng. Kết quả/chartSeries được lưu cùng transaction, đối chiếu với snapshot khi đọc.

Integrity hash SHA-256 dùng sắp xếp khóa object; JSONB đổi thứ tự khóa không làm sai kiểm chứng. Đây là phát hiện dữ liệu không nhất quán, không phải chữ ký chống người có toàn quyền DB. Trigger `plan_version_immutable` chặn UPDATE nội dung PlanVersion ở DB. Không có API sửa/xóa phiên bản; DELETE ở DB vẫn được phép cho quy trình xóa tài khoản. Trigger không được mô tả là cơ chế chống DBA thay dữ liệu.

Model registry tạo dòng `retirement-monthly-v2` với trạng thái IMPLEMENTED khi lưu lần đầu, gắn mô tả bản code; không tự tuyên bố mô hình được duyệt nghiệp vụ. Các tham số vẫn phải qua approval T03/T04. Model này đọc mục tiêu từ lựa chọn T06 và tháng hưu trong profile; cột goalRevision legacy lưu 0, không đọc RetirementGoal tuổi-năm cũ. Mục tiêu/lựa chọn chính xác nằm trong snapshot/hash, không bị mất vì cột legacy này.

Transaction SERIALIZABLE + update có điều kiện revision + unique idempotency đảm bảo create/apply/audit/response ghi đồng thời hoặc rollback toàn bộ. Hai apply khác nhau cùng revision chỉ một thắng; cùng key/nội dung chạy đồng thời trả cùng kết quả. Hồ sơ thay trong lúc áp dụng sẽ gây retry/conflict hoặc được lưu sau apply và đánh stale; không xóa sửa đổi hồ sơ mới. Snapshot cũ vẫn đọc/replay được sau khi hồ sơ hoặc cấu hình thay đổi.

Replay hiện hỗ trợ `retirement-monthly-v2` từ normalized monthly input, so rows và summary với dữ liệu lưu. Không gọi T03/T04 hiện hành hoặc tính lại quyền lợi BHXH. Khi đổi công thức phải tạo model code mới và giữ implementation cũ trong dispatcher; không sửa semantics dưới cùng code. Snapshot legacy không cùng format trả SNAPSHOT_MODEL_UNSUPPORTED, không chuyển đổi ngầm. Chưa có API migration snapshot legacy.

## Publish và worker

T03/T04 publish vẫn chỉ công bố phiên bản; không tạo/apply kế hoạch. `GET /:planId` trả updates khi có version T03 hoặc T04 lớn hơn và đã có hiệu lực. Thông báo lấy lúc đọc để bản công bố có ngày tương lai chỉ xuất hiện từ ngày hiệu lực; không viết lại snapshot/current. `profileChanged` khác thông báo cấu hình mới. `stale` là cờ cần rà soát, không phải chỉ dẫn tự tính rồi áp dụng.

Worker đã nối các event legacy `financial.recalculate_batch` và `financial.recalculate_plan` vào handler an toàn: chỉ đánh stale, không tính/sinh/chọn version. Batch phân trang 20 bản, marker processed và event trang tiếp ghi cùng transaction; retry không nhân bản. Event riêng phải còn đúng user và expectedCurrentVersionId; event cũ không ghi đè current mới. `FinancialService.handleEvent` legacy cũng ủy quyền cùng handler. Không gửi email hay notification ra ngoài từ các event này. Không đăng ký đường calculate legacy vốn dùng dữ liệu v1 vào API T07.

## Migration và bằng chứng

- `202610040006_plan_snapshots` thêm revision (default 0), baselineVersionId/FK/unique vào retirement_plans, relation Prisma tương ứng và trigger bất biến PlanVersion. Không thêm bảng, không backfill chọn current/baseline, không đổi nội dung snapshot cũ. Đã kiểm checksum/lịch sử, thử DDL trong rollback rồi áp dụng lên DB thật; 50 hồ sơ và plans/snapshots hiện có giữ nguyên. Không áp dụng lại migration.
- `scripts/apply-plan-snapshots.cjs`: mặc định preview nếu còn đúng migration chờ; `--apply` mới deploy. Nếu đã áp dụng chỉ kiểm checksum/cột/trigger và trả trạng thái, không thực hiện DDL lại.
- **205/205 tests, 17 files**, gồm 12 ca T07 và validation đủ 7 response OpenAPI. Root typecheck, typecheck tests, build Prisma+tsc và startup guard đạt.
- `verify-plans-db.cjs`: **23 kiểm tra HTTP/AuthService/PostgreSQL**, cả JSONB/replay, trigger UPDATE bị chặn, quyền, idempotency, current/baseline, profile thay đổi và worker; tất cả fixture trong outer transaction đã rollback.
- `verify-plan-concurrency-db.cjs`: **3 phép thử nhiều kết nối độc lập**: apply khác nhau cùng revision; cùng key; sửa profile cạnh tranh apply. Fixture riêng bị khóa đăng nhập; cấu hình fixture không bao giờ lộ ở trạng thái PUBLISHED sau commit (đã chuyển DRAFT bên trong transaction setup). Sau kiểm chứng xóa đúng ID fixture; fingerprint dữ liệu hiện có giữ nguyên, không mail. Script có cleanup cuối cùng và báo ID cần dọn nếu cleanup gặp lỗi.
- Chưa nghiệm thu UI hoặc luồng T08 xuyên dashboard/goal/simulation/export; yêu cầu tại FE-T07 trong task-frontend.md. T09 sổ thực tế và T10 context AI vẫn riêng; không coi snapshot kế hoạch là số dư thực tế.
