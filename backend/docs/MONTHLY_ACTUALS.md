# T09 — Sổ thực tế và dự báo phần còn lại

> Cập nhật 05/10/2026: model v3 hỗ trợ góp đầu/cuối tháng; EXPLICIT_DEPOSITS_ONLY đã chốt; có preview/lưu/apply reforecast và giữ replay v2. Contract hiện hành: [CONTRIBUTIONS_REFORECAST.md](CONTRIBUTIONS_REFORECAST.md). Các mô tả chỉ cuối kỳ/reforecast chỉ đọc/chờ Q13–Q15 ở checkpoint cũ bên dưới là lịch sử.

Backend 05/10/2026. USER only, Bearer/session, Cache-Control no-store. Tiền là chuỗi thập phân VND (input tối đa 2 số lẻ); tính Decimal precision 48. Không dùng MonthlyTracking target/actual legacy làm nguồn. Không tự migrate số legacy thành giao dịch thực tế.

## API

Prefix `/api/v1/me/retirement/actuals`. Response JSON `{data,meta}`. OpenAPI: `actuals.openapi.yaml`, generator `scripts/generate-actuals-openapi.cjs`.

| Method/path | Input | Result |
|---|---|---|
| GET `?from=YYYY-MM&to=YYYY-MM` | Khoảng tháng bắt buộc | Các tháng có dữ liệu, không tự lấp tháng trống bằng 0 |
| GET `/:period` | Tháng | Bản hiện tại và history giảm dần revision; chưa nhập = 404 |
| PUT `/:period` | Idempotency-Key UUID, body bên dưới | Thay **toàn bộ** nội dung tháng, revision tăng 1, lưu lịch sử/audit |
| POST `/reforecast` | `{planId,versionId,throughMonth}` | Đối soát actual và dự báo còn lại từ một version cụ thể; chỉ đọc |

Ví dụ body ghi:

```json
{
  "expectedRevision": 0,
  "data": {
    "currency": "VND",
    "openingBalance": "1000000",
    "closingBalance": "1200000",
    "entries": [{
      "eventId": "00000000-0000-4000-8000-000000000001",
      "date": "2026-09-20",
      "kind": "CONTRIBUTION",
      "amount": "200000",
      "note": "Đã nộp vào quỹ"
    }],
    "correctionReason": "Đã đối chiếu sao kê tháng 9"
  }
}
```

`expectedRevision=0` tạo tháng chưa có; sửa dùng revision đọc gần nhất. `correctionReason` bắt buộc cả lần đầu để xác nhận nội dung, không tự suy rằng entries=[] là chưa biết. Thiếu số dư không gửi 0 thay. Có thể lưu chưa khớp để tiếp tục đối soát, nhưng không dùng làm điểm dự báo. Không nhận userId/kết quả/tỷ suất/CPI do client tính. Ngày giao dịch phải thuộc tháng; không ghi tháng tương lai. Tháng hiện tại có thể ghi tạm, chỉ tháng đã qua theo lịch Việt Nam mới dùng reforecast.

## Phạm vi và cách phân loại

Một sổ **quỹ hưu trí hợp nhất cho mỗi user, VND**, dùng chung giữa các phương án kế hoạch của user. Không phải nhiều tài khoản ngân hàng/ví hay sổ cho nhiều quỹ độc lập. Số dư phải bao gồm đúng phần tài sản thanh khoản dành cho hưu trí, loại phần nhà chưa chuyển đổi/dự phòng ngoài quỹ. Không lấy tổng net worth làm số dư. Nếu muốn quỹ độc lập cần thiết kế account scope riêng trước khi mở rộng.

| Kind | Ý nghĩa |
|---|---|
| INCOME | Thu nhập hộ gia đình thực nhận, ngoài lợi nhuận còn trong quỹ |
| EXPENSE | Chi sinh hoạt, chưa gồm trả nợ hoặc phí quỹ |
| DEBT_PAYMENT | Khoản trả nợ thực tế, không lặp trong EXPENSE |
| CONTRIBUTION | Tiền thực từ ngoài vào phạm vi quỹ, gồm nộp tiết kiệm/chuyển vốn một lần; không phải tiền dư chưa nộp |
| WITHDRAWAL | Tiền rời quỹ, kể cả rút để trả sinh hoạt hoặc nhận lợi nhuận ra ngoài |
| INVESTMENT_INCOME | Lãi/cổ tức ghi vào quỹ; tái đầu tư vẫn chỉ ghi tại đây, không thêm CONTRIBUTION |
| FEE | Phí quỹ chưa trừ trong MARKET_CHANGE/INVESTMENT_INCOME |
| MARKET_CHANGE | Tăng/giảm định giá tài sản, giữ số âm; loại lãi đã ghi riêng và phí đã ghi riêng |
| INTERNAL_TRANSFER | Chuyển giữa tài khoản/tài sản **bên trong** quỹ hợp nhất; ảnh hưởng tổng quỹ bằng 0 |
| BALANCE_ADJUSTMENT | Điều chỉnh tăng/giảm có `note` giải thích bắt buộc, được trình bày tách khỏi nộp/lợi nhuận |

Một khoản thu/chi gia đình có thể liên quan dòng nộp/rút quỹ: chỉ nhóm household tính thu–chi, chỉ nhóm fund tính số dư quỹ, không cộng cả hai vào cùng phép đối soát. `eventId` xác định từng bút toán; giữ nguyên khi sửa/retry/import. Không tạo hai bút toán quỹ cho cùng một chuyển động tiền. Backend chặn trùng UUID trong tháng và giữa tháng, nhưng không suy ra hai UUID khác nhau cùng đại diện một giao dịch ngân hàng; chưa tích hợp import hoặc ghép giao dịch ngân hàng. UI phải giữ ID ổn định. ID vẫn được giữ chỗ tại tháng gốc sau khi xóa bút toán bằng sửa tháng; muốn chuyển sai ngày sang tháng khác cần quy trình sửa/ghi bút toán mới có giải thích, không tái sử dụng ID đã lưu ở tháng cũ.

## Đối soát

`householdSurplus = INCOME − EXPENSE − DEBT_PAYMENT`: SURPLUS / BALANCED / DEFICIT, giữ âm. `actualContribution` chỉ tổng CONTRIBUTION, không tự bằng householdSurplus.

`calculatedClosingBalance = openingBalance + CONTRIBUTION − WITHDRAWAL + INVESTMENT_INCOME + MARKET_CHANGE − FEE + BALANCE_ADJUSTMENT`.

`discrepancy = closingBalance − calculatedClosingBalance`; bằng 0 chính xác → MATCHED, còn lại UNRECONCILED. Không làm tròn trước đối soát, không tự cân bằng sai lệch. Muốn ghi điều chỉnh phải khai BALANCE_ADJUSTMENT có lý do; `hasAdjustments` giữ cờ ngay cả tổng điều chỉnh bằng 0. Số dư quỹ khai không âm; không mô hình vay âm trong sổ quỹ này. Nợ/chi vượt thu vẫn giữ deficit riêng.

## Reforecast

Đọc version bằng bộ kiểm integrity T07 cùng transaction SERIALIZABLE với sổ tháng. Đòi đủ mọi tháng từ tháng định giá phiên bản đến throughMonth, tháng đã đóng, từng tháng MATCHED và đầu kỳ tháng kế tiếp bằng cuối kỳ trước. Tháng đầu actual có thể khác vốn dự báo gốc; đó là chênh thực tế, không bị ép bằng forecast. Tháng định giá giữa tháng giữ quy ước đầy đủ kỳ của T06; UI cần nhất quán phạm vi kỳ.

- BLOCKED + issues + calculation=null khi MISSING_MONTH, UNRECONCILED_MONTH, OPENING_BALANCE_MISMATCH hoặc MONTH_NOT_CLOSED. Không lấy forecast lấp actual còn thiếu.
- READY: số dư thực cuối throughMonth làm vốn đầu kỳ tháng tiếp. Dùng các rows tương lai của version chỉ định, giữ nguồn/lãi/CPI/lịch nợ/lương hưu; không tự tạo giả định từ actual. Nếu đã nghỉ hưu, summary của **phần còn lại** có accumulationMonths=0, retirementMonth là tháng bắt đầu phần còn lại; `originalRetirementMonth` giữ mục tiêu gốc.
- HORIZON_COMPLETE: hết kỳ phiên bản, calculation=null, vẫn trả actual/comparison. Không gọi đây là lỗi hay kế hoạch mới.
- `comparison` so từng tháng actual với dự phóng của **versionId chỉ định**, không mặc định đó là baseline đầu tiên. Muốn so bản gốc dùng baselineVersionId; API trả cả snapshotHash/anchor revision và tất cả actual revisions để truy vết.
- Khoản một lần trong actual không được lặp vào các tháng sau. Nguồn thu mới, tài sản đã bán sớm, khoản vay đã tất toán sớm có thể làm lịch tương lai cũ không còn phù hợp: phải cập nhật hồ sơ và tạo/chọn phiên bản phù hợp, không tự suy từ bút toán. Không tự chỉnh scheduled capital release khi phân loại tiền nộp đơn thuần.
- Q15 vẫn EXPLICIT_DEPOSITS_ONLY, không tự nộp surplus. Endpoint không lưu hoặc áp dụng một PlanVersion mới; baseline/current/snapshot và hồ sơ không đổi. Ghi actual cũng không phát job tự đổi kế hoạch. Thay version áp dụng không sửa dữ liệu actual lịch sử.

## Lưu trữ và kiểm chứng

Migration `202610050007_monthly_actuals` thêm `actual_months` (unique user+period, current revision/payload), `actual_month_revisions` (history bất biến bằng trigger UPDATE), `actual_event_identities` (unique user+event, giữ chỗ). Cascade xóa khi xóa tài khoản; DELETE history vẫn cho account erasure. Chưa có API xóa riêng tháng; sửa toàn bộ payload tạo revision mới. Idempotency response và audit cùng transaction; xung đột P2034/P2002 retry có giới hạn, CAS revision bảo vệ ghi đè.

`apply-monthly-actuals.cjs` kiểm checksum toàn bộ lịch sử, chỉ cho đúng một migration pending, preview DDL rollback trước deploy; đã áp dụng thì chỉ kiểm tra. `verify-actuals-db.cjs` fixture trong outer rollback, savepoint giữ đúng ranh giới rollback của từng request. `verify-actuals-concurrency-db.cjs` dùng nhiều transaction độc lập với user SUSPENDED riêng và cleanup ID cả idempotency/audit. Không reset DB, không email. Bằng chứng chạy và giới hạn mới nhất ở PROGRESS.md; test double không chứng minh PostgreSQL concurrency.
