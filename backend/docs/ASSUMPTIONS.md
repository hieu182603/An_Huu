# T03 — Bộ giả định theo năm có nguồn và phiên bản

Backend lưu bộ giả định v2 trong bảng `assumption_set_versions` đã có, với `modelCode: assumption-series-v2`. Đây là mã phân biệt contract dữ liệu, không phải xác nhận engine hưu trí đã được duyệt. `values` chứa tài liệu v2, `policy` chứa dấu vết xem tác động/phê duyệt; `source` lưu bản sao metadata nguồn. Không cần migration; các bộ v1 và snapshot cũ giữ nguyên. Số version dùng chung ràng buộc unique với bộ cũ, không tái sử dụng số cũ.

## API

Mọi route cần phiên đăng nhập còn hiệu lực. Các route quản trị chỉ ADMIN; `/me` chỉ USER.

| Phương thức | Đường dẫn dưới `/api/v1` | Hành vi |
| --- | --- | --- |
| GET | `/admin/assumptions` | Danh sách tất cả bản v2, page/limit/total |
| POST | `/admin/assumptions` | Tạo nháp từ tài liệu v2 |
| GET | `/admin/assumptions/:id` | Đọc nháp/bản duyệt/bản công bố |
| PATCH | `/admin/assumptions/:id` | `{expectedRevision, data}` thay nội dung nháp |
| POST | `/admin/assumptions/:id/validate` | Body `{}`, kiểm tra đủ kỳ/nguồn/quy ước |
| POST | `/admin/assumptions/:id/impact` | `{expectedRevision}`, xem nội dung trước/sau và lấy impactToken |
| POST | `/admin/assumptions/:id/approve` | `{expectedRevision, impactToken, reviewNote}` |
| POST | `/admin/assumptions/:id/publish` | `{expectedRevision, confirm: true}` |
| GET | `/me/assumptions` | Chỉ các bản PUBLISHED đã có hiệu lực |
| GET | `/me/assumptions/:id` | Đọc một bản đã công bố và có hiệu lực |
| POST | `/me/assumptions/resolve` | Chọn version/nhóm tài sản/thời hạn để lấy chuỗi tháng |

OpenAPI đầy đủ tại [assumptions.openapi.yaml](assumptions.openapi.yaml), được nối vào [openapi.yaml](openapi.yaml). Có thể tái tạo phần T03 bằng `node scripts/generate-assumptions-openapi.cjs` từ thư mục backend. Các kiểm tra chéo và trạng thái dữ liệu được thực thi phía server, ngoài kiểm tra cấu trúc OpenAPI.

USER chỉ chọn một bộ đã công bố trong yêu cầu resolve. Việc lựa chọn này chưa ghi vào kế hoạch chính; snapshot/apply thuộc T07–T08. Body không nhận lạm phát/lợi suất tùy ý, userId, hồ sơ hoặc tỷ trọng danh mục.

```json
{
  "versionId": "ID-UUID-CUA-BAN-DA-CONG-BO",
  "startMonth": "2026-10",
  "endMonth": "2050-12",
  "assetClass": "BOND",
  "horizonMonths": 291
}
```

`horizonMonths` là thời hạn dùng để chọn dải lợi suất trong yêu cầu này, không phải chỉ thị tự chọn danh mục theo tuổi. T04 sẽ xác định chính sách nhiều yếu tố; T06 sẽ gọi với thời hạn phù hợp từng dòng tiền. Không giảm lợi suất 1,5 điểm lúc nghỉ hưu. Phần demo backend cũ cũng đã bỏ phép giảm tự đặt này; frontend demo chưa thay trong đợt backend này.

## Tài liệu v2 và nguồn

Tài liệu có `schemaVersion: 2`, tiêu đề, VND, ngày có hiệu lực, năm đầu/cuối dự phóng, lý do, sources, historicalCpi, inflation, assetClasses và returns. Lưu được nháp với các mảng chưa đủ dữ liệu; không được duyệt/công bố bản thiếu.

Nguồn có ID, loại, tiêu đề, tổ chức phát hành, URL HTTPS, bản phát hành, ngày công bố/ngày lấy, khoảng năm dữ liệu và ghi chú. URL chỉ là nguồn tham chiếu, server không tải URL do admin nhập. Người duyệt và ngày duyệt lấy từ phiên/thời gian server, không do body tự điền. Ngày lấy không trước ngày công bố, không sau ngày hiệu lực; phê duyệt không chấp nhận ngày lấy ở tương lai.

Phân biệt bốn loại nguồn:

- HISTORICAL_OFFICIAL: CPI lịch sử đã được nguồn chính thức công bố, chỉ tham chiếu. Phân biệt biến động bình quân năm và cuối năm; không dùng lịch sử như tỷ lệ dự phóng.
- FORECAST: dự báo có bản phát hành và khoảng năm giới hạn. Từng tỷ lệ dự phóng phải nằm trong khoảng của nguồn.
- AN_HUU_LONG_TERM: giả định dài hạn do An Hưu duyệt, phải mang đúng nhãn này. Không gắn nguồn IMF cho những năm nằm ngoài nguồn dự báo.
- ASSET_RESEARCH: nguồn lợi suất nhóm tài sản, giới hạn theo năm/thời hạn đã khai.

[IMF mô tả WEO](https://data.imf.org/Datasets/WEO) có dự báo khoảng năm năm cho phần lớn chuỗi. [FAQ WEO](https://www.imf.org/en/Publications/WEO/frequently-asked-questions) giải thích dữ liệu lịch sử/dự báo và cập nhật. Backend không tự nhập số WEO, không giả định mọi chuỗi đều có cùng ngày kết thúc; người quản trị phải ghi đúng phạm vi bản nguồn đang dùng. Trong DB thật ở checkpoint T03 chưa có bộ giả định đã lưu, không tạo sẵn tỷ lệ 4%/7,8% hay tỷ lệ kiểm thử.

`inflation` có đúng một dòng cho mỗi năm trong khoảng dự phóng. Mỗi dòng ghi percent, FORECAST/LONG_TERM, sourceId, loại EFFECTIVE_ANNUAL và conversionNote. ConversionNote ghi cách chuyển chỉ số nguồn thành giả định lạm phát hiệu dụng dùng trong kế hoạch; không coi tăng CPI bình quân năm mặc nhiên là tỷ lệ tích lũy từng tháng. Lịch sử trước năm bắt đầu dự phóng nằm ở historicalCpi; chuỗi dự báo đứng trước chuỗi dài hạn. Mọi năm dài hạn phải được khai rõ, không tự kéo tỷ lệ cuối ra vô hạn.

`assetClasses` khai mã/nhãn và các dải horizon có ID, minMonths/maxMonths. Các dải không chồng nhau; khoảng không được khai sẽ trả ASSET_HORIZON_NOT_COVERED. `returns` cần đúng một dòng cho mỗi năm × nhóm tài sản × dải thời hạn đã khai. Không có tỷ trọng danh mục hoặc mặc định theo tuổi ở T03.

## Quy đổi lãi và phí/thuế

Tỷ lệ là chuỗi decimal, lớn hơn -100% và không quá 100%, tối đa 10 chữ số thập phân. Tỷ lệ âm hợp lệ; không kẹp thành 0. Quy đổi Decimal precision 48, không làm tròn tiền/rate về 2 chữ số ở bước trung gian. Kết quả có căn bậc 12 dùng độ chính xác hữu hạn 48 chữ số, không tuyên bố biểu diễn vô hạn chính xác.

1. EFFECTIVE_ANNUAL: dùng trực tiếp r = percent/100.
2. NOMINAL_ANNUAL: cần compoundsPerYear = m, đổi `r_effective = (1 + r/m)^m - 1`.
3. Nếu priceBasis REAL, chuyển sang danh nghĩa đúng một lần: `(1 + r_real) × (1 + inflation) - 1`. Nếu đã NOMINAL thì không nhân thêm lạm phát vào lợi suất.
4. Phí và thuế mỗi loại phải là INCLUDED có căn cứ, hoặc EXPLICIT_ANNUAL_DRAG với mức phần trăm và quy ước `PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION`. Trường hợp thứ hai trừ đúng số điểm phần trăm đã được duyệt sau khi quy đổi sang danh nghĩa. INCLUDED không bị trừ lần nữa. UNKNOWN chặn duyệt và tính.
5. Nếu lợi suất ròng sau phí/thuế <= -100% thì từ chối cấu hình.
6. Hệ số tháng là `(1 + r_annual)^(1/12)`, giữ lạm phát và lợi suất thành hai hệ số riêng.

Ví dụ kiểm thử: lợi suất thực 10%, lạm phát 4% → danh nghĩa 14,4%; phí được duyệt giảm 1 điểm, thuế giảm 0,4 điểm → 13%. Đây là số kiểm thử, không phải giả định production. `EXPLICIT_ANNUAL_DRAG` là mô hình tác động năm đã được duyệt, không tự tính nghĩa vụ thuế giao dịch hay áp một thuế suất chung. [Investor.gov về phí đầu tư](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/updated) giải thích ảnh hưởng của phí đến giá trị danh mục; quy ước cụ thể của từng bộ vẫn phải được người phụ trách xác nhận.

Response resolve ghi `priceBasis: NOMINAL`, `costs: ALREADY_APPLIED`, versionId/version/documentHash, nguồn và từng tháng. Không trừ phí hoặc chuyển thực/danh nghĩa lần nữa ở caller. Tỷ lệ của năm sau chỉ xuất hiện từ tháng 01 của năm đó. Lạm phát chưa được áp vào tiền chi tiêu ở T03; T06 phải dùng đúng cơ sở tiền hôm nay/tiền danh nghĩa và tránh lạm phát hai lần.

## Duyệt, bất biến và kế hoạch hiện có

Nháp revision 1 → xem tác động → duyệt revision 2 → công bố revision 3. Sửa nháp tăng revision và xóa dấu xem tác động. ImpactToken gắn với nội dung, revision, người xem và bản công bố nền; người duyệt phải là người đã xem đúng bản. Không bắt buộc người tạo và người duyệt khác nhau vì task chưa yêu cầu cơ chế đó.

Impact hiện trả `scope: CONFIGURATION_DIFF_ONLY`, cấu hình trước/sau, trạng thái kiểm tra và `planProjectionStatus: AWAITING_T06`. Chưa có con số dự phóng quỹ trước/sau; không tạo số tác động giả. Nếu bộ khác được công bố sau khi xem/duyệt, bản đang chờ phải được rà soát lại qua nháp mới. APPROVED và PUBLISHED không sửa được qua API; tạo bản mới từ nội dung cũ để điều chỉnh. Bản công bố ghi hash tài liệu đã duyệt; resolve kiểm tra hash trước tính.

Ngày hiệu lực là 00:00 UTC của effectiveFrom. Bản công bố hẹn ngày tương lai chưa xuất hiện trong danh sách USER và không được resolve. Bản cũ vẫn đọc/tính lại bằng ID của nó sau khi công bố bản mới. Không có fallback sang bản mới khi ID cũ thiếu kỳ. Công bố không cập nhật currentVersionId/stale, không sửa snapshot và không tạo outbox job tự tính lại. Module financial legacy chưa được nối router chính; bộ T03 không đi qua luồng publish/tính kế hoạch cũ. Thay engine/snapshot/job cũ vẫn thuộc T06–T07.

Danh sách chưa có cấu hình trả UNCONFIGURED; resolve thiếu năm/thời hạn/phí trả INCOMPLETE và `months: []`. 400 sai DTO, 401/403 sai phiên/quyền, 404 không thấy hoặc chưa công bố/có hiệu lực, 409 revision/review/hash/baseline sai, 422 thiếu cấu hình để duyệt. Danh sách trang trống khi có dữ liệu ở trang khác vẫn là AVAILABLE với total thực.

## Bằng chứng và phạm vi còn lại

Các kiểm thử T03 bao gồm ranh giới năm, công thức thực/danh nghĩa/phí, lãi âm/0/danh nghĩa ghép kỳ, lịch sử khác dự báo/dài hạn, thiếu năm/nguồn/chi phí, horizon, revision/token, audit rollback, quyền ADMIN/USER, OpenAPI, immutability và tái lập bản cũ. `node scripts/verify-assumptions-db.cjs` kiểm tra schema thật rồi chạy HTTP với AuthService/PostgreSQL thật: 14 kiểm tra đạt, toàn bộ fixture/phiên/bộ giả định công bố thử nằm trong transaction rollback; 50 hồ sơ, kế hoạch/snapshot và trạng thái bộ giả định ban đầu giữ nguyên. Không có mail hay job được tạo. Không dùng bộ integration xóa toàn bảng trên DB thật.

T03 backend đã có contract/lifecycle/chuỗi tháng; chưa có bộ dữ liệu nguồn production do nghiệp vụ duyệt, chưa tự đồng bộ nguồn, chưa nối UI quản trị hoặc thay demo frontend, chưa tính tác động lên quỹ trước/sau. T04 làm chính sách danh mục/rủi ro; T06 dùng chuỗi này trong engine hưu trí; T07–T08 ghi lựa chọn và snapshot/apply. Kiểm tra transaction rollback không thay bằng chứng cạnh tranh nhiều transaction độc lập.
