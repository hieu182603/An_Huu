# T01 — Hồ sơ tài chính phiên bản 2

Áp dụng trên API hiện có `/api/v1/me/financial-profile`, `/me/onboarding-draft`, `/me/onboarding/complete`. Giữ authentication, quyền USER, ownership từ JWT, revision và idempotency. OpenAPI gồm [openapi.yaml](openapi.yaml) và [profile-v2.openapi.yaml](profile-v2.openapi.yaml).

## Trạng thái dữ liệu và thời gian

- Tiền luôn là chuỗi decimal không âm. `{ "status": "KNOWN", "value": "0" }` là số 0 nhập rõ ràng; `{ "status": "UNKNOWN" }` không có `value`. Không đổi trống/null thành 0.
- Nhóm income/expenses/assets/debts nhận `KNOWN` kèm `entries`, `UNKNOWN`, hoặc `NOT_APPLICABLE` kèm lý do. Danh sách `KNOWN` rỗng là xác nhận không có khoản nào. `NOT_APPLICABLE` chỉ áp dụng cho nhóm và tháng nhận hưu, không dùng để che số tiền thiếu.
- `valuationDate`: ngày lịch hợp lệ `YYYY-MM-DD`. `periodUnit: MONTH`, currency hồ sơ mặc định VND. Ngày chốt dữ liệu không tự đổi khi sửa thông tin khác.
- `birthMonth`, `desiredRetirementMonth`, `pensionStartMonth` lưu riêng ở dạng `YYYY-MM`; sửa ngày hưu mục tiêu không thay ngày nhận lương hưu. Chưa suy ra tuổi nghỉ hưu pháp lý hoặc quyền lợi BHXH; phần đó thuộc T05.

Ví dụ hồ sơ đã khai rõ phần còn chưa biết (có thể lưu; chưa đủ tính hưu trí):

```json
{
  "schemaVersion": 2,
  "valuationDate": "2026-10-04",
  "currency": "VND",
  "periodUnit": "MONTH",
  "personal": {
    "birthMonth": { "status": "UNKNOWN" },
    "desiredRetirementMonth": { "status": "UNKNOWN" },
    "pensionStartMonth": { "status": "UNKNOWN" }
  },
  "income": { "status": "UNKNOWN" },
  "expenses": { "status": "UNKNOWN" },
  "assets": { "status": "UNKNOWN" },
  "debts": { "status": "UNKNOWN" }
}
```

## Chi tiết các nhóm

| Nhóm | Quy ước |
| --- | --- |
| Thu nhập | `basis: DISPOSABLE` là thu khả dụng sau khấu trừ; `kind: FIXED/BONUS/IRREGULAR`. Amount là số tiền trong kỳ đã khai, không tự chia thưởng theo năm hoặc suy đoán thu không đều. |
| Chi tiêu | `ESSENTIAL/OPTIONAL/HEALTH/INSURANCE/DEPENDENT/DEBT_PAYMENT`. Khoản trả nợ bắt buộc liên kết `loanId`; số tiền/lịch/tiền tệ phải khớp phần trả nợ được phân bổ. |
| Lịch thu/chi/trả nợ | `startMonth`, `endMonth` (null nếu chưa có kỳ kết thúc), `frequency: MONTHLY/ONCE`. Khoản một lần có start=end; không lặp sang các tháng sau. |
| Tài sản | Giá trị/ngày định giá, tiền tệ, tỷ lệ sở hữu, thanh khoản, tháng dùng được. `retirementShare/emergencyShare/otherGoalsShare` là các phần trong phần sở hữu, tổng 1 khi biết đủ; không phân bổ cùng giá trị hai lần. |
| Nhà ở | `housingPlan` chỉ cho bất động sản: chưa xác nhận hoặc phương án SALE/RENT đã xác nhận, tháng và số tiền ròng. Nhà ở không thành tiền mặt hưu trí hiện tại; phương án đã xác nhận được giữ cho dự báo T06, chưa tự sinh thu nhập trong T01. |
| Nợ | `id/sharedLoanId`, dư nợ/ngày chốt, phần dư nợ, phần trả định kỳ, phạm vi trách nhiệm theo tài liệu hoặc UNKNOWN. Không suy nghĩa vụ pháp lý từ tỷ lệ đang trả. `contract` tùy chọn chứa hợp đồng T02 với lãi/gốc/phí và từng kỳ trả; xem [DEBT_PLANNING.md](DEBT_PLANNING.md). |

Mỗi khoản có ID ổn định và duy nhất trong nhóm; một khoản vay chung chỉ được khai một lần. Liên kết chi trả nợ không được lặp. Currency từng khoản mặc định VND; khoản ngoại tệ được lưu nhưng các chỉ số cần quy đổi trả null kèm `FX_RULE_REQUIRED`, không cộng số ngoại tệ vào VND.

## Summary v2

`summary.values` chứa các chuỗi decimal chính xác hoặc null theo từng chỉ số. `summary.issues` chỉ ra trường thiếu hoặc giới hạn. Số học dùng Decimal với precision 48; không làm tròn trung gian hoặc khi xuất summary.

- `monthlyIncome`: các khoản thu khả dụng có hiệu lực trong tháng định giá.
- `monthlyExpense`: chi trong tháng, loại dòng đã liên kết khoản vay.
- `monthlyDebtService`: tổng phần trả nợ đang được phân bổ. Khi có contract KNOWN, lấy gốc/lãi/phí tháng định giá từ lịch T02, không dùng số payment cũ để ghi đè; hợp đồng không đủ tính trả null cùng issue. Chưa khai hợp đồng thì summary vẫn dùng payment đã khai theo T01 nhưng preview T02 yêu cầu hợp đồng.
- `availableMonthlySurplus = monthlyIncome - monthlyExpense - monthlyDebtService`, giữ số âm.
- `totalAssets/totalDebt/netWorth`: cùng ngày định giá; tỷ lệ sở hữu/phần dư nợ đã khai. Khác ngày hoặc thiếu giá trị trả null cho chỉ số liên quan.
- `retirementLiquidAssets`: giá trị tài sản × tỷ lệ sở hữu × phần dành hưu trí, chỉ tài sản thanh khoản dùng được ở tháng định giá; loại nhà ở, dự phòng và mục tiêu khác. Không trừ toàn bộ dư nợ khỏi vốn rồi lại trừ lịch trả nợ.

Thiếu thu nhập không chặn kết quả tài sản đã đủ dữ liệu. UNKNOWN khác với danh sách không có khoản nào đã được xác nhận. `completed: true` của onboarding chỉ nghĩa là đã lưu cấu trúc hợp lệ; không phải chứng nhận đủ dữ liệu để engine T06 tính hưu trí.

## Lưu nháp và chuyển phiên bản

- V2 luôn gửi `schemaVersion: 2` trong `data`/`changes`. Draft được thiếu nhóm, trường cá nhân và trường của một khoản; khoản dở dang cần ID. Complete kiểm tra đầy đủ cấu trúc, cho phép trạng thái UNKNOWN khai rõ.
- `personal` merge từng trường. Nhóm/danh sách và object trạng thái thay thế nguyên khối; đổi KNOWN sang UNKNOWN không để sót giá trị cũ.
- V1 vẫn đọc/lưu theo contract cũ. Response có `schemaVersion: 1`, `dataQuality.status: LEGACY_UNREVIEWED` và `unconfirmedZeroFields`. Các số 0 cũ không được tự chuyển thành KNOWN của v2.
- Nâng hồ sơ v1: PATCH với đúng `expectedRevision` và một tài liệu v2 đầy đủ, hoặc hoàn tất draft v2 với đúng revision hồ sơ hiện có. Bản JSON v1 được giữ nguyên trong cột `legacyProfileData` phía server. Không gửi bản lưu cũ trong API thường.
- Không downgrade v2 về v1; client cũ ghi vào hồ sơ đã nâng cấp nhận 409 `PROFILE_SCHEMA_MISMATCH`. Draft khác phiên bản nhận 409 `DRAFT_SCHEMA_MISMATCH`; hoàn tất draft cũ trước khi bắt đầu phiên bản mới. Không tự ghi đè draft đang làm.
- Cột `netWorth` cũ giữ nguyên dữ liệu v1. Với v2 đặt null, lấy summary chính xác từ JSON; không lưu kết quả đã làm tròn vào cache Decimal(18,2). PlanVersion cũ không bị sửa; plan chỉ được đánh dấu stale khi hồ sơ thay đổi.

## Kiểm chứng trên DB đang cấu hình

Chủ dự án đã yêu cầu dùng DB thật ngày 04/10/2026. Không dùng toàn bộ bộ test phá dữ liệu trên DB này. Các guard của `test:integration`/`test:local-db` vẫn giữ nguyên.

- `node scripts/check-profile-db.cjs`: metadata trong transaction chỉ đọc, không in URL, tài khoản hoặc hồ sơ.
- `node scripts/apply-profile-v2.cjs`: yêu cầu checksum migrations đã áp dụng khớp và chỉ còn migration T01; thử DDL rồi rollback. `--apply` áp dụng đúng migration đã kiểm tra, đối chiếu dữ liệu hồ sơ trước/sau. Migration đã áp dụng thì không chạy lại lệnh này.
- `node scripts/verify-profile-v2-db.cjs`: service thực + PostgreSQL thực. Luồng hồ sơ nằm trong transaction rollback, event không lộ ra worker. Ca cạnh tranh dùng một user/draft riêng bị khóa đăng nhập; dọn đúng ID sau kiểm tra. Không đăng ký user qua auth, không gửi mail. Đối chiếu hồ sơ/snapshot cũ trước/sau.

Phần frontend nhập v2 và kiểm tra trình duyệt chưa nằm trong checkpoint backend này. Lịch hợp đồng/preview T02 đã triển khai và kiểm chứng backend; lương hưu T05 và authoritative engine T06 vẫn cần triển khai. Không dùng summary T01 hay preview T02 để tuyên bố kế hoạch hưu trí đã nghiệm thu.
