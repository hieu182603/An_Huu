# T05 — Lương hưu nhập tay và tuổi nghỉ hưu tham chiếu

> Kế hoạch mở rộng05/10/2026: T13/T14 trong [nghiên cứu BHXH/nợ/nguồn mới](../../docs/research-bhxh-no-nguon-moi.md). Chưa triển khai bộ tính BHXH; luồng nhập tay dưới đây vẫn là contract hiện hành. Cần rà tác động NĐ158 Điều44 và các sửa đổi2026 trước publish rule mới; không coi nhãn NĐ135 hiện tại là coverage đầy đủ mọi đối tượng.

Backend MVP, ngày 04/10/2026. Không phải bộ tính quyền lợi BHXH tự động. Không migration: khai báo mới lưu trong JSON hồ sơ v2 qua API hồ sơ hiện có, cùng revision/audit/idempotency onboarding. Hồ sơ cũ không có `pension` vẫn đọc được và được coi là chưa khai báo; không chuyển số 0 v1 thành xác nhận mới.

## Khai báo

- `pension.status`: `UNKNOWN`, `NOT_APPLICABLE` (có `reason`) hoặc `KNOWN`.
- `KNOWN`: `monthlyAmount` là chuỗi tiền không âm, `currency: VND`, `priceBasis`, `basisMonth`, `source`, `estimatedOn`, `adjustment`; `linkedIncomeId` tùy chọn.
- Tháng nhận duy nhất: `personal.pensionStartMonth`. Không tự lấy `desiredRetirementMonth` hoặc tháng từ tra cứu luật để thay vào.
- `TODAY`: giá trị tại đầu tháng định giá, `basisMonth` phải bằng tháng của `valuationDate`. `NOMINAL_AT_START`: số tiền tại tháng bắt đầu nhận; `basisMonth` phải bằng tháng nhận khi tháng nhận đã biết.
- `estimatedOn` không được sau `valuationDate`. Tháng nhận trước tháng sinh bị từ chối. Thiếu tháng nhận vẫn lưu được như hồ sơ chưa đủ tính toán; không tự điền.
- `adjustment.kind: NONE`: giữ nguyên số tiền danh nghĩa sau khi nhận. `EXPLICIT_SCHEDULE`: các dòng `{effectiveMonth, monthlyAmount, source}` là mức tiền danh nghĩa thay thế, không phải chênh lệch; không trùng kỳ, chỉ sau tháng nhận.
- Nháp dùng `UNKNOWN` khi chưa có đủ bộ thông tin `KNOWN`. Khi patch, gửi toàn bộ đối tượng `pension`; không merge từng trường bên trong.

Ví dụ phần `changes` của `PATCH /api/v1/me/financial-profile` (bao ngoài phải có `expectedRevision`):

```json
{
  "schemaVersion": 2,
  "personal": { "pensionStartMonth": { "status": "KNOWN", "value": "2045-06" } },
  "pension": {
    "status": "KNOWN", "monthlyAmount": "5000000", "currency": "VND",
    "priceBasis": "NOMINAL_AT_START", "basisMonth": "2045-06",
    "source": "Mức người dùng tự ước tính", "estimatedOn": "2026-10-04",
    "adjustment": { "kind": "NONE" }
  }
}
```

Số tiền ví dụ chỉ mô tả request, không phải cấu hình hoặc quyền lợi được duyệt.

## Preview chỉ đọc

`POST /api/v1/me/pension/preview`, chỉ USER, ownership từ phiên đăng nhập:

```json
{ "expectedProfileRevision": 2, "startMonth": "2045-05", "months": 24 }
```

`assumptionVersionId` tùy chọn để chọn một bản T03 đã công bố, có hiệu lực và khớp hash phê duyệt. Không nhận CPI, lợi suất, số tiền hoặc userId ghi đè trong preview. Khoảng xem trước phải từ tháng định giá, tối đa 1.200 tháng và không vượt lịch 2199.

Response gồm `status`, `issues`, `rows[{month,amount}]`, `profileRevision`, `valuationDate`, `declaration`, `assumptionVersionId/assumptionHash`, `legalRetirementAge` và `limitations`.

- Trước tháng nhận: 0; từ tháng nhận: mức khai báo. `UNKNOWN` không biến thành 0; `rows.amount` là null khi thiếu dữ liệu để tính kỳ đó. `KNOWN` bằng 0 và không có điều chỉnh là số 0 đã xác nhận, không cần giả định lạm phát.
- `TODAY`: nhân hệ số lạm phát tháng T03 từ đầu `basisMonth` đến đầu tháng nhận một lần, dùng Decimal precision 48. Sau đó giữ số tiền danh nghĩa; chỉ lịch điều chỉnh khai rõ mới thay mức nhận. Không dùng CPI lịch sử hay kéo dài năm thiếu. Nếu tháng nhận đã trước tháng cơ sở, yêu cầu mức danh nghĩa thay vì tự giảm phát ngược.
- `INCOMPLETE` cùng `PENSION_NOT_INCLUDED`, `PENSION_START_MONTH_REQUIRED`, `PUBLISHED_INFLATION_REQUIRED`, `INFLATION_YEAR_MISSING` hoặc `NOMINAL_AMOUNT_REQUIRED_FOR_EXISTING_PENSION` phải hiển thị như thiếu dữ liệu. Không thay bằng tỷ lệ mẫu.
- Preview không ghi hồ sơ, kế hoạch, audit hoặc outbox. Lưu khai báo qua profile API phát sinh audit/đánh dấu stale theo T01, nhưng không áp dụng kế hoạch mới.

## Chống trùng thu và giới hạn tích hợp

`income.entries[].source` bổ sung `EMPLOYMENT | OTHER | PENSION` (tùy chọn để giữ tương thích). Nếu đã có dòng thu lương hưu, đánh dấu `PENSION` và đặt `pension.linkedIncomeId` trỏ đúng dòng đó. Một hồ sơ chỉ có một dòng tham chiếu lương hưu; dòng tham chiếu không được cộng vào tổng thu. Số tiền và lịch ở `pension` là nguồn tính duy nhất. Không thể suy ra một khoản thu cũ là lương hưu chỉ từ nhãn tự do; UI phải yêu cầu người dùng rà lại.

Summary hồ sơ và dòng tiền nợ dùng mức danh nghĩa tính được đúng kỳ. Lương hưu chưa khai được loại khỏi phần thu đã biết, kèm `PENSION_NOT_INCLUDED` trong summary. Mức đã khai nhưng chưa quy đổi hoặc thiếu tháng nhận làm tổng thu liên quan chưa xác định. Preview nợ chưa nhận bộ giả định T03, nên mức TODAY cần quy đổi trong kỳ dự báo không được đưa vào tối ưu như số đã biết. T06 phải dùng cùng hàm với bộ T03 đã chốt và giữ cảnh báo trong kết quả cá nhân.

Bộ tính legacy backend không suy quyền lợi từ số năm đóng/lương đóng nữa: `estimatedMonthlyPension: null`, `pensionStatus: NOT_ESTIMATED`; kết quả legacy loại trừ lương hưu. Engine tháng cá nhân T06 và context AI T10 chưa tích hợp. Frontend calculator cũ phải thay theo task frontend.

## Tra tuổi tham chiếu có phiên bản

`personal.retirementCondition` nhận `UNKNOWN`, `NORMAL`, `ARTICLE_5_DECLARED` hoặc `OTHER`. Với Điều 5, `basis` nhận `HAZARDOUS_15_YEARS`, `DIFFICULT_REGION_15_YEARS`, `COMBINED_15_YEARS` hoặc `WORK_CAPACITY_LOSS_61_PERCENT`, kèm `evidence` do người dùng khai. `OTHER` có `description` và trả `REVIEW_REQUIRED`.

T13-01 cập nhật 05/10/2026: pension preview dùng `VN-AGE-REFERENCE-2026-10-v2`, `rule.scope=AGE_REFERENCE_ONLY`, có `relatedSources`. Đã rà NĐ158 Điều44: Phụ lục I–II và khoản2 Điều7 không bị bãi bỏ; căn cứ cũ về thời điểm hưởng tại khoản2 Điều3 đã bị bãi bỏ. Xem [ma trận và điều khoản thay thế](LEGAL_RULE_MATRIX.md). Bản `VN-135-2020-ART3-5-7-ANNEX-I-II-v1` chỉ giữ cho metadata model v2/v3 trong `legal-age-v1.ts`; không chỉnh hash/kết quả snapshot cũ.

Trong pension preview hiện tại, `pensionStartMonth` trong **kết quả tra tuổi** luôn null; `pensionStartStatus=REQUIRES_BENEFIT_ASSESSMENT`. `referenceFollowingMonth` chỉ là tháng kế tiếp mốc tuổi, không được UI lấy làm tháng nhận đã xác nhận. Trường nhập `personal.pensionStartMonth` vẫn giữ nguyên và là nguồn duy nhất của lịch tiền pension thủ công. Số tiền, thời điểm hưởng thực và tuổi tham chiếu là ba nội dung riêng. Contract OpenAPI tách `LegacyAgeReference` để không áp trường mới bắt buộc lên response/snapshot v2/v3.

Tra theo nhóm tháng sinh của phụ lục, tách tháng kết thúc làm việc với tháng nhận kế tiếp. Bao gồm mốc chuyển tiếp tháng 12/1960 nam và 12/1965 nữ. Điều 5 trả mốc thấp nhất theo phụ lục II, với điều kiện tự khai chưa xác minh. Trường hợp đặc thù, chưa khai điều kiện/giới tính áp dụng hoặc ngoài phạm vi bảng trả `REVIEW_REQUIRED`; không mặc định thành nam hoặc lao động bình thường. Không xét thời gian đóng, hồ sơ đủ điều kiện, giảm trừ hoặc quyết định hưởng. `eligibility` luôn `NOT_ASSESSED`; đổi mục tiêu cá nhân không sửa kết quả luật hay tháng nhận đã khai.

[Luật BHXH 41/2024/QH15, toàn văn chính thức](https://xaydungchinhsach.chinhphu.vn/toan-van-luat-so-41-2024-qh15-bao-hiem-xa-hoi-119240723163650489.htm) là nguồn cho giai đoạn tự tính sau MVP; không triển khai công thức chung 20 năm/45% cho mọi trường hợp. Giai đoạn đó cần luật có version, nhóm áp dụng, lịch sử đóng, bình quân căn cứ và điều kiện nghỉ sớm.

## Kiểm chứng

`src/tests/pensions.test.ts`: lịch tháng, thiếu/0, quy đổi một lần, điều chỉnh danh nghĩa, chống trùng, validation, ranh giới phụ lục, role/ownership/revision, bản T03 công bố và OpenAPI. `scripts/verify-pensions-db.cjs`: HTTP/AuthService/PostgreSQL thật trong giao dịch rollback, không email, fingerprint hồ sơ/kế hoạch/snapshot/cấu hình trước và sau. Kết quả thực thi xem đầu `PROGRESS.md`, không coi việc có script là bằng chứng đã chạy.
