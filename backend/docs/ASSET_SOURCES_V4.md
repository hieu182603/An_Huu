# T16 — Tài sản và vốn trong dự báo nguồn

Triển khai 07/10/2026 tại API USER `POST /api/v1/me/retirement/plans/{planId}/source-reforecasts/preview` và save riêng `POST .../source-reforecasts`. Thêm `assetCommands` tùy chọn, tối đa 30; một sourceId/commandId chỉ dùng một lần trong batch, kể cả flow/pension/loan. Không migration, không ghi ngược profile. Lịch sử v2/v3 giữ nguyên.

## Lệnh và chứng từ

Mỗi lệnh có commandId UUID, sourceId, expectedSourceRevision, expectedSourceHash, confirm=true, evidence[] `{reference,contentHash,confirmedOn}`. CREATE dùng sourceId=`plan:<uuid>`, revision=0/hash=null, `notAlreadyInSources=true`. REVISE/END dùng hash/revision từ `assetRevisionOptions` của preview. END có reason, dừng lịch từ tháng sau throughMonth. Không xóa lịch sử.

CREATE/REVISE có capital:

- `reference`: mã tài sản/chứng từ ổn định; khi sửa nguồn hồ sơ phải là asset id. Không đổi mã/loại của nguồn đã tạo, không dùng lại mã tài sản đã có ở nguồn khác (không phân biệt hoa/thường). `notAlreadyInSources` là xác nhận của người dùng; backend không thể nhận dạng một tài sản bị khai bằng hai bộ mã/chứng từ khác nhau.
- `kind`: ASSET_SALE hoặc LIQUID_CAPITAL; currency=VND, priceBasis=NOMINAL_AT_AVAILABILITY. Không tự đổi ngoại tệ hay tính lại giá tài sản từ thị trường.
- `amountScope`: WHOLE_ASSET hoặc USER_SHARE; ownershipShare > 0 và <=1, retirementShare trong [0,1]. Nếu số tiền đã là USER_SHARE thì không nhân ownershipShare lần nữa.
- `grossAmount`, `fees`, `taxes`, `securedDebtSettlement`, `netAmount`: tất cả cùng phạm vi. Kiểm chính xác `net = gross − fees − taxes − securedDebtSettlement >= 0`. Thuế/phí là số khai có căn cứ, không phải tính thuế tự động.
- `availableOn`, `confirmedContributionAmount`. Giới hạn góp = net × ownershipShare (chỉ WHOLE_ASSET) × retirementShare. Không tự chọn toàn bộ mức giới hạn để góp. Góp 0 là hợp lệ; phần còn lại không tự vào quỹ.

`securedDebtSettlement` chỉ khấu trừ khi tính tiền ròng; không tự đóng nguồn nợ. Tất toán khoản vay phải dùng loanRevisions/actuals riêng để không bỏ nghĩa vụ nợ chưa xác nhận.

## Tiền dự kiến và tiền đã góp

`funding.status=PLANNED` cần liquidity=AVAILABLE hoặc PLANNED_RELEASE, notIncludedInFund=true, contributionMonth và contributionTiming=END_OF_MONTH. AVAILABLE phải có availableOn không sau ngày server ghi nhận. Tháng góp phải sau actual cutoff, không trước tháng tiền sẵn có và nằm trong kỳ dự báo. Chỉ tạo một capitalInjection bằng số góp xác nhận vào cuối tháng, không tạo income hoặc thay plannedContribution định kỳ. Nguồn vẫn HYPOTHETICAL vì khoản góp chưa xảy ra; bản thân xác nhận nguồn không biến dự báo thành actual.

`funding.status=REALIZED` cần availableOn trong quá khứ không sau cutoff và allocations[] `{allocationId,eventId,actualRevision,bookedOn,amount}`. Backend tự lấy tháng thực tế đã đối soát của chủ tài khoản, kiểm event CONTRIBUTION, ngày/revision, khoản góp không trước lúc tiền sẵn có, tổng allocations đúng confirmedContributionAmount. Chặn dùng trùng allocation và tổng dùng chung event vượt số tiền, kể cả nguồn khác/bản trước/lệnh ASSET_REALIZED v3. Nếu góp 0 thì allocations rỗng. Không thêm capitalInjection; số dư quỹ đã có trong actual anchor. Muốn góp thêm phần tiền còn lại sau REALIZED phải chuyển sang STAGED theo mục bên dưới, không gửi lại khoản cũ hay chuyển về PLANNED/REALIZED mới.

Có thể REVISE nguồn PLANNED thành REALIZED khi chốt tháng thực tế. Chứng từ gốc, actual snapshots và chuỗi allocations lưu trong assetSources; reader kiểm lại thứ tự, tổng đã dùng và lịch, kể cả outer hash được băm lại. Apply/save vẫn kiểm actual stale, replay lịch sử dùng chứng cứ đã pin.

## Khoản góp đến hạn nhưng chưa thực hiện — 07/10/2026

REVISE một nguồn PLANNED có thể dời khoản góp đã qua cutoff khi người dùng xác nhận **toàn bộ khoản dự kiến đó chưa góp**. Gửi thêm trường tùy chọn `missedContribution` bên cạnh `capital`, với `capital.funding.status=PLANNED` và tháng góp mới sau cutoff:

```json
{
  "scheduledMonth": "2026-09",
  "actualRevision": 1,
  "amountNotContributed": "200",
  "confirmedOn": "2026-10-01",
  "reason": "Bán tài sản bị trì hoãn, chưa góp khoản dự kiến",
  "confirmNotContributed": true
}
```

Tháng và số tiền phải khớp khoản capitalInjection dương duy nhất đã đến hạn trong revision nguồn hiện tại; không lấy số tiền dự định góp mới thay cho số cũ. Tháng actual phải thuộc chủ tài khoản, đã đối soát và đúng revision. Ngày xác nhận không trước cuối tháng dự kiến hoặc sau ngày server; command phải có evidence được xác nhận cùng ngày hoặc sau đó. Thiếu metadata vẫn trả `ASSET_PAST_CONTRIBUTION_REVIEW_REQUIRED`; sai tháng/số tiền/ngày/chứng từ trả `ASSET_MISSED_CONTRIBUTION_MISMATCH` (422), sai revision actual trả `ASSET_ACTUAL_STALE_OR_MISSING` (409).

Đây là khai báo có chứng từ của người dùng. Backend kiểm tính nhất quán với lịch và actual; không thể suy ra khoản nào chưa góp chỉ từ việc có/không có các CONTRIBUTION không gắn nguồn trong sổ. Khoản đã góp một phần cần luồng phân bổ nhiều đợt, chưa dùng khai báo này. Không gắn missedContribution cho CREATE, END hoặc REALIZED. Nguồn đã REALIZED không được dùng lại.

Áp dụng cho nguồn tạo trong kế hoạch và nguồn vốn từ hồ sơ đã pin. Mỗi lần lại lỡ hạn phải xác nhận lịch gần nhất; không tái sử dụng xác nhận cho tháng cũ. Sau khi dời, chỉnh tiếp một lịch chưa đến hạn không cần khai báo lại. Khi tiền thực sự góp, đổi thành REALIZED và phân bổ actual theo luồng hiện có, bỏ missedContribution. Hủy lịch tương lai dùng END.

Không sửa actual/profile/anchor hoặc bù trừ số tiền đã dự báo trong quá khứ. Candidate chỉ thêm số góp mới được xác nhận vào tháng tương lai; phiên bản cũ vẫn replay lịch cũ. Metadata và actual được pin trong assetSources, không default thêm trường vào snapshot cũ và không cần migration. Sửa actual sau lưu chặn apply; đọc/replay bản đã lưu vẫn dùng chứng cứ cũ.

## Giới hạn còn cần mở rộng

- STAGED đã có availability.releases cho tiền nhận nhiều ngày, theo mục bên dưới. Đây là khai báo/chứng từ ngoài quỹ, không phải kết nối ngân hàng hoặc tự tạo nguồn tiền vay.
- Chuyển RENT→SALE đã hỗ trợ theo mục bên dưới; không tự khôi phục thuê khi hủy/dời bán. Nối lại thuê sau END còn cần lifecycle riêng.
- Không chia cùng tài sản thành nhiều nguồn để vượt giới hạn. ASSET_REALIZED v3 có thể chuyển sang STAGED theo mục tương thích bên dưới; không viết lại command/snapshot cũ. Tiền vay không tự thành nguồn vốn này.
- Không nâng trực tiếp snapshot v2, thay số dư mở đầu hoặc định giá lại net worth/profile của bản gốc. Report/CSV/AI vẫn chỉ dùng attribution của candidate; không gửi chứng từ/actuals ra provider.

Các test service/HTTP/DB là bằng chứng backend trong phạm vi ghi tại PROGRESS; không thay nghiệm thu browser, kiểm chứng thuế/ngân hàng hoặc đo cạnh tranh nhiều kết nối PostgreSQL.

## Chuyển tài sản đang cho thuê sang bán — 07/10/2026

`assetRevisionOptions` trả cả nguồn `profile:asset:<id>` có lịch thuê. Gửi **REVISE cùng sourceId** với capital.kind=ASSET_SALE và trường `rentalExit` dưới đây; không tạo nguồn bán mới cho cùng tài sản. Lưu một revision nguồn có cả phần thuê còn lại và khoản góp từ bán, nên không có bước dừng thuê/tạo vốn bị lưu một nửa.

```json
{
  "rentEndsOn": "2026-12-15",
  "finalMonthIncome": "7",
  "amountScope": "SOURCE_SHARE",
  "confirm": true
}
```

- `rentEndsOn`: ngày chấm dứt dòng thuê. Tháng đó phải có lịch thuê trong nguồn gốc, không sau availableOn của tiền bán. Ngày nhận tiền bán có thể cùng ngày kết thúc thuê. Với ngày đã qua, command.evidence phải có xác nhận từ ngày đó trở đi.
- `finalMonthIncome`: thu nhập thuê ròng của **phần đã phân bổ cho nguồn kế hoạch** trong tháng cuối, sau sở hữu và retirementShare. Không nhân các tỷ lệ lần nữa, không tự chia theo số ngày. Cho phép 0; người dùng xác nhận số thực/dự kiến có căn cứ. Các tháng trước giữ số thuê từ snapshot gốc; sau tháng cuối không còn thuê.
- Nếu tháng kết thúc thuê nằm trước/đúng cutoff, phải có actual của tháng đó trong lineage. Backend không ghi lại thu nhập quá khứ hoặc sửa anchor; khoản khai tháng cuối không thay sổ thực tế đã chốt. Số tiền này là lời khai có chứng từ, không được coi là kiểm chứng ngân hàng tự động.
- Góp tiền bán có thể cùng tháng kết thúc thuê hoặc muộn hơn, vẫn END_OF_MONTH và chỉ số confirmedContributionAmount. Net tiền bán, phí/thuế/trả nợ bảo đảm, sở hữu/phần hưu giữ các kiểm tra hiện hành. Không tự tất toán nguồn nợ hoặc góp toàn bộ net.

Khi sửa tiếp nguồn bán từng cho thuê, tiếp tục gửi rentalExit. Dời availableOn/contributionMonth giữ nguyên ngày dừng thuê sẽ không nối lại tiền thuê. Có thể đổi ngày kết thúc/thu nhập tháng cuối **còn trong tương lai sau cutoff**, có chứng từ; backend dựng lại phần thuê từ nguồn gốc. Một khi tháng kết thúc trước/đúng cutoff, metadata rentalExit bất biến trên các revision sau (`ASSET_RENTAL_HISTORY_IMMUTABLE`, 422), phải xử lý sai sổ quá khứ ở luồng actual thay vì ghi đè lịch sử.

Khi đã góp tiền bán, REVISE sang REALIZED với actual allocations và rentalExit giữ nguyên, không cộng lại tiền vào quỹ; góp nhiều đợt dùng STAGED và hạn mức lũy kế bên dưới. END có thể dừng thuê mà không bán, hoặc hủy toàn bộ dòng tương lai của nguồn đã chuyển; không tự nối lại thuê và không thêm vốn. Việc nối lại thuê sau END cần lifecycle mới, chưa dùng lệnh này.

Thiếu rentalExit trên nguồn thuê trả ASSET_RENTAL_REVIEW_REQUIRED; metadata trên nguồn không có lịch thuê hoặc ngày/số liệu không phù hợp trả ASSET_RENTAL_EXIT_MISMATCH. Nếu dự báo cũ đang thay tổng income/capitalInjection, chặn SOURCE_AGGREGATE_OVERLAP để lịch thuê/bán không bị tổng cũ che mất. Các income đã linked với housing ở bản gốc không tái xuất hiện sau chuyển. Hash/CAS/actual revision/idempotency/save/apply/replay tiếp tục như nguồn vốn hiện hành; không migration/profile mutation.

Kiểm chứng nhánh missedContribution 07/10: 14 asset tests, full568tests/48files, testtypecheck/sourceemit đạt;28HTTP/DBchecks rollback giữ41bảng. Không thay bằng chứng browser hoặc race độc lập.

Kiểm chứng RENT→SALE 07/10: 7 tests riêng, full575tests/49files, testtypecheck/sourceemit đạt;27HTTP/DBchecks rollback giữ41bảng. Nghiệm thu UI/ngân hàng/thuế/race riêng chưa được chứng minh bởi các kết quả này.

## Góp một phần và nhiều đợt — STAGED, 07/10/2026

CREATE hoặc REVISE nhận `capital.funding.status=STAGED`. Giữ cùng sourceId/reference tài sản; `capital.confirmedContributionAmount` là **tổng lũy kế đã góp và dự kiến sẽ góp**, không phải số góp thêm lần này. Kiểm tổng không vượt net × phần sở hữu × retirementShare như trước. Tiền chưa chọn góp vẫn ngoài quỹ.

```json
{
  "status": "STAGED",
  "liquidity": "AVAILABLE",
  "plannedNotIncludedInFund": true,
  "allocations": [],
  "plannedContributions": [
    {"installmentId": "00000000-0000-4000-8000-000000000001", "month": "2027-01", "amount": "70", "timing": "END_OF_MONTH"},
    {"installmentId": "00000000-0000-4000-8000-000000000002", "month": "2027-02", "amount": "40", "timing": "END_OF_MONTH"}
  ],
  "reconciliations": []
}
```

- `allocations` chỉ chứa **chứng từ mới gắn nguồn trong revision này**, cùng shape/kiểm CONTRIBUTION như REALIZED. Không gửi lại khoản đã dùng ở revision trước. Backend tự lấy `priorRealized` theo lịch sử cùng sourceId và pin trong proof; client không được gửi trường này. Ledger mọi nguồn vẫn kiểm trùng allocation và tổng event.
- `plannedContributions` là toàn bộ lịch còn lại, số dương, ID duy nhất trong request, tháng sau cutoff/không trước availableOn và trong horizon. Có thể nhiều đợt trong một tháng; backend cộng thành một capitalInjection cuối tháng. Không có khoản đầu tháng hoặc tự góp tiền thừa.
- Tổng `priorRealized + allocations mới + plannedContributions = confirmedContributionAmount`. Ví dụ đã góp60, tháng tiếp nhận30, dự kiến còn110 thì tổng vẫn200; anchor1090 không bị cộng thêm90. Có thể giảm/hủy phần dự kiến mà giữ phần đã góp; không giảm tổng thấp hơn số đã nhận.
- Không khai availability thì toàn bộ phần tiền ròng vẫn có một availableOn; ngày này không được sau bất kỳ khoản đã góp nào (kể cả lịch sử). Nếu nhận tiền nguồn thành nhiều đợt, dùng availability bên dưới để không coi cả hợp đồng là tiền đã sẵn có.

Nếu revision trước có capitalInjection dương đã đến hạn, phải có `reconciliations` cho từng tháng đó, kể cả chuyển từ PLANNED sang STAGED. Mỗi mục gồm:

```json
{
  "scheduledMonth": "2026-12",
  "actualRevision": 1,
  "receivedAllocationIds": ["00000000-0000-4000-8000-000000000003"],
  "amountNotContributed": "70",
  "confirmedOn": "2027-01-01",
  "reason": "Dự kiến100, đã góp30, chưa góp70",
  "confirm": true
}
```

`receivedAllocationIds` tham chiếu allocations mới; một allocation không giải thích hai tháng. Số chưa góp = max(0, khoản tháng cũ − số nhận được gắn vào mục). Có thể nhận bù muộn hoặc nhận nhiều hơn dự kiến, nhưng vẫn phải đúng tổng/hạn mức lũy kế. Nếu một event chia cho nhiều tháng, tách allocations với số tiền rõ và tổng không vượt event. Không tự chuyển số chưa góp vào lịch tương lai: người dùng phải nhập plannedContributions mới. Tháng actual phải đã đối soát/đúng revision; ngày xác nhận từ cuối tháng đó, không trước chứng từ nhận tiền hoặc sau ngày server, có evidence tương ứng. Không dùng `missedContribution` một lần của PLANNED cho STAGED.

Nguồn đã REALIZED v4 có thể REVISE sang STAGED để góp thêm phần chưa dùng, số cũ được tính vào hạn mức. Vì vậy assetRevisionOptions hiện trả cả REALIZED v4. Sau STAGED, các lần sửa phải tiếp tục STAGED; nhận hết thì allocations mới + plannedContributions=[] (vẫn giữ tổng lũy kế), hoặc END để hủy phần tương lai. Không chuyển về PLANNED/REALIZED nhằm bỏ lịch sử đã góp. Hủy và sửa lịch không hoàn tiền hay sửa actual. RENT→SALE kết hợp STAGED vẫn cần rentalExit; còn thuê tương lai thì nguồn vẫn HYPOTHETICAL ngay cả khi chọn góp0.

Lỗi: ASSET_INSTALLMENT_TOTAL_MISMATCH (tổng), ASSET_INSTALLMENT_INVALID (ID/số tiền), ASSET_INSTALLMENT_RECONCILIATION_REQUIRED/MISMATCH (đối soát), ASSET_STAGED_HISTORY_REQUIRED (đổi về chế độ một lần), cùng lỗi cap/availability/actual stale/allocation cũ. Metadata tùy chọn không làm đổi hash snapshot cũ; save/apply tách riêng, replay giữ chứng cứ đã pin. Không migration.

Kiểm chứng STAGED 07/10: full583tests/50files,15focused staged/rental, testtypecheck/sourceemit đạt;26HTTP/DBchecks rollback41bảng. Chưa thay browser, kiểm chứng tiền ngoài hệ thống hoặc race riêng cho từng nhánh.

## Tiền nguồn nhận theo nhiều đợt — availability, 07/10/2026

Trong funding STAGED, khai tùy chọn `availability`. Giữ nguyên hợp đồng cũ khi trường này vắng mặt; không tự thêm vào snapshot cũ. Ví dụ phần tiền ròng dành cho nguồn có hạn mức200:

```json
{
  "amountScope": "NET_SOURCE_SHARE",
  "releases": [
    {
      "releaseId": "00000000-0000-4000-8000-000000000001",
      "availableOn": "2026-08-20",
      "amount": "80",
      "status": "CONFIRMED",
      "evidence": [{"reference": "Chứng từ nhận đợt1", "contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "confirmedOn": "2026-08-21"}]
    },
    {
      "releaseId": "00000000-0000-4000-8000-000000000002",
      "availableOn": "2026-11-30",
      "amount": "120",
      "status": "EXPECTED",
      "evidence": [{"reference": "Lịch thanh toán đợt2", "contentHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "confirmedOn": "2026-08-21"}]
    }
  ]
}
```

Số tiền mỗi release là phần **ròng sau phí/thuế/trả nợ, sở hữu và retirementShare thuộc nguồn**; không nhân tỷ lệ lần nữa. Tổng releases không vượt hạn mức net hiện hành. Có thể khai ít hơn hạn mức: phần chưa khai không tự thành tiền sẵn có. ID duy nhất, tiền dương, tối đa200đợt; capital.availableOn phải bằng ngày sớm nhất trong releases.

- CONFIRMED: người dùng xác nhận có tiền với chứng từ từ ngày nhận trở đi, không có ngày nhận/chứng từ tương lai so với knownOn. Đây không là kiểm chứng ngân hàng tự động. EXPECTED: khoản dự kiến, chứng từ lịch nhận không sau knownOn. Nếu có bất kỳ EXPECTED, liquidity phải PLANNED_RELEASE; AVAILABLE chỉ khi mọi đợt đã CONFIRMED.
- Góp thực tế: theo từng ngày bookedOn, tổng đã góp cùng nguồn (cả priorRealized) không vượt tổng các release CONFIRMED có availableOn <= ngày đó. Không dùng EXPECTED cho actual, dù ngày dự kiến đã qua; không lấy tiền nhận muộn để hợp thức hóa khoản góp sớm.
- Góp dự kiến: xét tuần tự các tháng, tổng actual + planned đến tháng đó không vượt tổng CONFIRMED/EXPECTED có ngày nhận trong hoặc trước tháng. Góp là cuối tháng, nên tiền dự kiến nhận ngày cuối tháng có thể dùng cho khoản góp cuối tháng; ngày đầu tháng sau không được dùng sớm. Không cộng release vào quỹ: chỉ CONTRIBUTION thực hoặc capitalInjection dự kiến do người dùng chọn.
- Khi đẩy cutoff qua tháng có release EXPECTED, phải xác nhận đã nhận hoặc sửa lịch dự kiến còn ở tương lai sau cutoff. Nếu không, trả ASSET_RELEASE_RECONCILIATION_REQUIRED. Dời ngày nhận phải kiểm lại lịch góp; không tự dời khoản góp để request được chấp nhận.

Mỗi revision gửi toàn bộ danh sách release hiện hành. Release EXPECTED có thể cập nhật sang CONFIRMED có chứng từ, hoặc sửa/hủy kế hoạch; các khoản CONFIRMED trước đó phải giữ nguyên đầy đủ cùng ID/ngày/số tiền/chứng từ. Không bỏ cả availability ở revision sau để vượt hạn mức theo ngày (ASSET_AVAILABILITY_HISTORY_REQUIRED); sửa khoản đã xác nhận trả ASSET_CONFIRMED_RELEASE_IMMUTABLE. END vẫn chỉ hủy tương lai và giữ lịch sử; sửa sai chứng từ nhận tiền đã xác nhận cần nghiệp vụ điều chỉnh riêng, chưa ghi đè ngầm.

Lỗi bổ sung: ASSET_RELEASE_INVALID, ASSET_RELEASE_CONFIRMATION_INVALID, ASSET_RELEASE_AVAILABILITY_MISMATCH, ASSET_RELEASE_LIMIT_EXCEEDED, ASSET_RECEIPT_BEFORE_RELEASE và ASSET_PLANNED_CONTRIBUTION_BEFORE_RELEASE. Tất cả là422. Chứng từ/prefix được pin và kiểm lại trong replay; actual revision/CAS/stale vẫn áp dụng. Không ghi profile, không thay anchor, không migration, không tự thêm khoản vay hoặc thu nhập từ giải ngân.

Kiểm chứng availability 07/10: full588tests/50files,12staged-focused và testtypecheck/sourceemit đạt;29HTTP/DBchecks rollback41bảng. Chỉ xác nhận lớp backend/chứng từ khai báo, không thay đối soát ngân hàng ngoài hệ thống hoặc browser/races.

## Góp tiếp nguồn đã ghi nhận ở v3 — 07/10/2026

Khi bản cha có `sourceChanges.kind=ASSET_REALIZED`, assetRevisionOptions hiện trả cùng `profile:asset:<id>` với hash/revision đã nâng. REVISE sang **STAGED** để xác nhận tổng lũy kế và lịch góp thêm. Không gửi lại sourceChanges hoặc CREATE một tài sản trùng mã; không chuyển sang PLANNED/REALIZED để bỏ số đã góp.

Backend lấy **toàn bộ số tiền event CONTRIBUTION mà command v3 đã gắn**, theo chủ tài khoản và revision actual được pin, vào priorRealized cùng nguồn. AllocationId lịch sử là ID sourceChange. Không chia lại theo tỷ lệ sở hữu, không tự coi phần event chưa dùng cho nguồn khác; v3 đã gắn toàn bộ event. Ledger chung vẫn coi số đó đã dùng, chống gửi lại event dưới allocationId mới. Reader kiểm lại chứng cứ khi replay, không chỉ tin tổng ở client.

Số tiền hiện còn dành cho quỹ phải khai qua net/phí/thuế/trả nợ, scope, ownershipShare/retirementShare và chứng từ ở capital. Không suy giá trị hiện tại/phí từ profile cũ hoặc mặc định phần còn lại bằng toàn bộ giá tài sản. Tổng mới = khoản v3 đã góp + các khoản v4 đã góp + khoản mới + lịch tương lai, không vượt hạn mức net được xác nhận. Ví dụ event cũ60, hạn mức200, muốn góp hết phần còn lại thì tổng200 và lịch140; anchor1060 giữ nguyên, không trở thành1120.

Với tài sản cho thuê mà ASSET_REALIZED v3 đã dừng thu nhập, nâng nguồn giữ lịch thuê đã dừng. Dùng ASSET_SALE, không thêm rentalExit để bịa lại ngày kết thúc lịch sử; không tự khôi phục thuê từ profile cũ. Các bản v3 tiếp tục replay chính xác hành vi đã lưu.

Kiểm chứng 07/10: 5 legacy tests và 12 staged tests đạt; full593tests/51files và hai typecheck/emit đạt. Verifier `--assets-legacy` đạt19HTTP/DBchecks, rollback41bảng: lưu/idempotency/phân quyền/apply/CSV, sửa actual chặn áp dụng và replay v3/v4 không đổi. Không migration; không thay bằng chứng UI hoặc race riêng cho nhánh.

Sau chuyển, STAGED/END hoạt động như nguồn v4: sửa phần tương lai, nhận tiền mới theo allocation, hủy phần chưa góp không hoàn khoản đã góp. Sửa actual gốc chặn apply; bản đã lưu vẫn replay chứng cứ gốc. Không migration, không sửa actual/profile hoặc mã engine v3/v2. Thiếu actual/chứng từ gốc vẫn cần xử lý dữ liệu trước, không nhập số mang sang tùy ý.
