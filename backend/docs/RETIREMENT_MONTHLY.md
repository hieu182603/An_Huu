# T06 — Dự phóng hưu trí theo tháng

> Cập nhật 05/10/2026: model v3 hỗ trợ góp đầu/cuối tháng; EXPLICIT_DEPOSITS_ONLY đã chốt; có preview/lưu/apply reforecast và giữ replay v2. Contract hiện hành: [CONTRIBUTIONS_REFORECAST.md](CONTRIBUTIONS_REFORECAST.md). Các mô tả chỉ cuối kỳ/reforecast chỉ đọc/chờ Q13–Q15 ở checkpoint cũ bên dưới là lịch sử.

Cập nhật T08 04/10/2026: request có thêm optional `whatIf` cho tháng hưu/giá trị tài sản tham chiếu hồ sơ, có cảnh báo giả định và không sửa hồ sơ. Xem [PLAN_PRESENTATION.md](PLAN_PRESENTATION.md). Snapshot/lưu/apply đã có tại [PLANS.md](PLANS.md); mô tả “chưa T07” trong checkpoint T06 phía dưới là lịch sử.

Checkpoint backend 04/10/2026. Model `retirement-monthly-v2`, API chỉ đọc; chưa tạo snapshot, lưu hoặc áp dụng kế hoạch T07. Contract máy đọc: [retirement.openapi.yaml](retirement.openapi.yaml), tham chiếu từ OpenAPI chính. Không cần migration T06.

## API và dữ liệu đầu vào

`POST /api/v1/me/retirement/preview`, Bearer USER có phiên còn hiệu lực. Ownership lấy từ phiên; ADMIN không dùng endpoint USER. Đọc hồ sơ v2 tại đúng revision và chính sách T04 đã công bố/có hiệu lực cùng bộ T03 đã được policy chốt. Đọc trong một transaction nhất quán; kiểm tra hash bản T03 với approval của policy. Không tự chọn bản mới nhất sau khi người dùng đã chọn một policy.

Ví dụ cấu trúc (thay ID/question/choice bằng dữ liệu đã duyệt; các số dưới đây chỉ minh họa, không phải cấu hình production):

```json
{
  "expectedProfileRevision": 1,
  "policyVersionId": "00000000-0000-4000-8000-000000000002",
  "scenario": "BASE",
  "answers": [{ "questionId": "id-trong-policy", "choiceId": "id-trong-policy" }],
  "liquidityNeedMonths": 12,
  "endMonth": "2075-12",
  "monthlyExpenseToday": "20000000",
  "monthlyContribution": "5000000",
  "monthlyReserve": "1000000",
  "terminalBalance": "0",
  "retirementIncomeIds": [],
  "retirementAdditionalExpenseIds": [],
  "contributionSchedule": [],
  "retirementContributionSchedule": [],
  "debtStress": [],
  "housing": []
}
```

- `monthlyExpenseToday`: toàn bộ mức sống tháng sau hưu theo tiền tại ngày định giá, chưa gồm lịch nợ và các chi bổ sung được chọn riêng. Thay mức chi sinh hoạt hiện tại khi đến tháng hưu; không cộng cả hai mức.
- `monthlyContribution`: mức dự định góp cuối mỗi tháng tích lũy. `contributionSchedule[{month,amount}]` thay mức ở riêng tháng đó, không kéo dài sang tháng sau. Mức thực góp bị giới hạn bởi dòng tiền còn lại.
- `monthlyReserve`: khoản giữ ngoài quỹ mỗi tháng tích lũy. Trừ khi tính khả năng góp, không trở thành vốn quỹ hay khoản góp. Nếu khoản này đã nằm trong chi hồ sơ thì phải loại phần trùng trước khi nhập.
- `retirementIncomeIds`: bắt buộc chọn rõ các dòng thu ngoài pension sẽ tiếp tục sau hưu; `[]` là không chọn. Lịch start/end trong hồ sơ vẫn có hiệu lực. Lương không tự kéo qua hưu. `retirementAdditionalExpenseIds` chỉ chọn chi ngoài mức sống đã nhập, không nhận khoản `DEBT_PAYMENT`.
- `retirementContributionSchedule`: khoản góp sau hưu do người dùng chủ động khai; không có dòng khai thì tiền dư giữ ngoài quỹ. Mức khai vẫn bị giới hạn bởi tiền dư có thật của tháng.
- `endMonth`: kỳ cuối được tính, gồm cả tháng này, không tự suy tuổi thọ. Tổng 1–1.200 tháng; phải gồm tháng hưu và từ tháng định giá. Policy, nhóm tài sản, lịch phân bổ, tỷ lệ và kịch bản phải đủ toàn horizon. Không tự kéo năm cuối còn thiếu.
- `terminalBalance`: số dư mong muốn danh nghĩa cuối `endMonth`, mặc định 0; không tự tăng CPI cho mục tiêu này.
- `debtStress`: dùng contract T02 `{loanId,startMonth,endMonth,totalPaymentShare}`. Thay tỷ lệ trả cơ sở trong khoảng chọn, không cộng hai lần; tăng nghĩa vụ cần xác nhận FULL. Không tự đổi phương án avalanche/snowball/tất toán. Các phương án tái cấu trúc có thay hợp đồng vẫn cần luồng chọn/lưu version về sau.
- `housing`: `{assetId,amountScope:WHOLE_ASSET|OWNERS_SHARE,linkedIncomeId?}`. Xác nhận số tiền ròng phương án nhà đã lưu là của toàn tài sản hay phần sở hữu của người dùng. WHOLE_ASSET nhân tỷ lệ sở hữu; cả hai nhân phần dành hưu trí. Bán chỉ thu một lần cuối tháng bán; cho thuê theo mức danh nghĩa cố định từ tháng bắt đầu. `linkedIncomeId` loại dòng thu đã có để tránh đếm trùng; cần người dùng rà dòng có nhãn tự do, backend không đoán từ tên. Bán trước ngày định giá phải đối soát thành tài sản tiền hiện có.

Ngày định giá, tháng hưu, tài sản/nợ và lương hưu lấy từ hồ sơ đã lưu. Request strict từ chối userId, vốn tự khai đè, lợi suất/lạm phát hoặc `contributionTiming`. Chỉ `END_OF_MONTH` dùng trong API; `START_OF_MONTH_RESEARCH` là nhánh core phục vụ kiểm chứng Q13, chưa là lựa chọn sản phẩm.

## Kết quả và trạng thái

Envelope `{data,meta.requestId}`. `data.status` READY hoặc INCOMPLETE; INCOMPLETE trả `calculation:null`, `replayInput:null`, `issues[{path,code}]`. `warnings` vẫn có thể xuất hiện khi READY, không được bỏ qua.

`references` gồm revision/hash hồ sơ, ID/version/hash T03 và policy T04; `inputHash`, `selection`, `sources`, `modelVersion`, ngày định giá, tiền tệ đi cùng mỗi kết quả. `replayInput` là chuỗi đã chuẩn hóa có thể chạy lại core, **chưa phải snapshot đã được lưu hoặc bằng chứng đã áp dụng**.

`calculation` gồm summary, rows tháng, marketRows phí/tỷ trọng/hệ số từ T04, assessment, các biến scenario thay đổi, tuổi luật tham chiếu T05, netWorth và limitations. Tiền/tỷ lệ dạng chuỗi Decimal; count/index dùng số nguyên. UI/export chỉ định dạng ở bước hiển thị (VND 1.000, phần trăm 2 số), không đưa giá trị đã làm tròn quay lại phép tính.

Các lỗi HTTP: 400 sai request/khoảng tháng; 401 phiên thiếu/hết hạn; 403 sai role; 404 chưa có hồ sơ hoặc phiên bản công bố được chọn không khả dụng; 409 revision thay đổi/v1/chưa khớp approval; 422 dữ liệu core vượt phạm vi. Mã thiếu dữ liệu thường gặp: RETIREMENT_MONTH_REQUIRED, RETIREMENT_CAPITAL_INCOMPLETE, DEBT_SCHEDULE_REQUIRED, FULL_LIABILITY_CONFIRMATION_REQUIRED, HOUSING_AMOUNT_SCOPE_REQUIRED, HOUSING_AMOUNT_INCOMPLETE, INVALID_RETIREMENT_INCOME_REFERENCE; mã T03/T04/T05 được giữ để dẫn người dùng sửa đúng mục.

Lương hưu UNKNOWN không bị xác nhận thành 0: kết quả mang cảnh báo `PENSION_NOT_INCLUDED`, mức chưa khai không được tính vào thu. Lương hưu KNOWN mà thiếu điều kiện quy đổi làm INCOMPLETE. TODAY dùng CPI của kịch bản được chọn đến tháng nhận một lần; sau nhận giữ danh nghĩa trừ lịch điều chỉnh người dùng khai. Không cộng dòng PENSION trong income lần nữa, không tự tính quyền lợi BHXH.

## Quy ước toán và ý nghĩa số liệu

Số học Decimal precision 48, không làm tròn theo đơn vị hiển thị giữa các bước. Đầu kỳ là tháng chứa ngày định giá; ngày giữa tháng vẫn tính đủ một tháng và cảnh báo `PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION`. Đây là quy ước mô hình cần thể hiện trên UI, không phải dòng tiền theo từng ngày.

Vốn ban đầu chỉ là tài sản thanh khoản đủ điều kiện × sở hữu × phần dành hưu trí; không lấy netWorth và không trừ toàn bộ dư nợ. Nợ đi vào lịch trả gốc/lãi/phí tháng. Nhà không trở thành tiền mặt trước tháng bán; tài sản thanh khoản chưa dùng được chỉ giải phóng cuối tháng đã khai theo giá trị danh nghĩa khai báo, không tự nhận lãi trước khi giải phóng. Tài sản khóa/kém thanh khoản bị loại kèm cảnh báo cho tới khi có phương án đủ điều kiện. Giá trị dùng được ngoài horizon không làm tăng quỹ trong horizon.

Mỗi tháng có:

```
remaining = income + pension - livingExpense - additionalExpense - debtPayment
capacity = max(0, remaining)
contribution = min(plannedContribution, capacity)
withdrawal = max(0, -remaining)
uninvestedSurplus = capacity - contribution
B[k] = B[k-1] * g[k] + contribution[k] + capitalInjection[k] - withdrawal[k]
```

`g[k]` là hệ số danh nghĩa ròng T04, đã gồm chi phí tái cân bằng; không trừ phí lần nữa. Góp/rút/giải phóng vốn cuối tháng theo tỷ trọng tài sản đang giữ. Phí phân bổ vốn ban đầu chưa mô phỏng; có limitation rõ. Chi sinh hoạt sau hưu tháng n = mức hôm nay × tích hệ số CPI của n tháng trước; đổi năm lấy tỷ lệ của đúng năm. Các dòng thu/chi đã khai khác giữ danh nghĩa cố định theo lịch, không tự thêm CPI.

Với lãi cố định `i`, n tháng tích lũy, góp c cuối kỳ: `A=P*(1+i)^n+c*((1+i)^n-1)/i`. `i=0`: `A=P+c*n`. Nhánh nghiên cứu góp đầu kỳ chỉ nhân phần góp thêm `(1+i)`, không nhân vốn ban đầu thêm lần nữa. Luồng thật dùng vòng lặp theo từng hệ số/dòng tiền.

Vốn cần tại đầu tháng hưu dùng truy hồi từ mục tiêu cuối L:

```
K[end+1] = L
K[k] = max(0, (K[k+1] + withdrawal[k] - contribution[k] - capitalInjection[k]) / g[k])
```

Giữ điều kiện không âm **từng tháng**, không chỉ PV tổng. `algebraicRequiredFund` bỏ phép max để đối chiếu PV thuần; `liquidityReserveAboveAlgebraicPV` chỉ phần bổ sung để không lấy nguồn thu muộn bù giả cho nhu cầu sớm. Q15 chưa tự nộp surplus: chỉ các khoản góp sau hưu đã khai rõ mới giảm K.

- `atRetirement`: A là quỹ dự kiến đầu tháng hưu, K là vốn cần tại cùng thời điểm, G=`K-A`. `atValuation` chiết khấu **cả A và K** về đầu kỳ định giá bằng cùng tích hệ số. A quy đổi vẫn gồm giá trị các khoản góp tương lai, không phải tài sản hiện có. Vốn hiện có đọc riêng `initialRetirementCapital`.
- `coveragePercent=A/K*100` khi K>0, K=0 trả null, không cắt ở 100%. G<0 thể hiện dư; `retirementFundingShortfall` và `excessAtRetirement` tách phần dương tương ứng. Cần hiển thị firstShortfall song song, vì đủ tiền tại hưu không có nghĩa là chưa từng thiếu trước đó.
- `requiredConstantMonthlyContribution`: mức góp đều tổng cần có nếu thay lịch góp tích lũy bằng mức này; `additionalMonthlyContribution`: mức tăng đều trên **lịch thực góp dự kiến hiện tại**, không phải chỉ trừ monthlyContribution khỏi mức tổng. Solver theo hệ số tuyến tính của từng tháng, lấy yêu cầu lớn nhất tại mọi kỳ thanh khoản và tại hưu. Không đổi lịch góp người dùng. `requiredContributionWithinCapacity` kiểm tra mức tổng đó có vừa khả năng từng tháng không.
- Không còn kỳ tích lũy: hai mức solver là null; nếu thiếu thì `NO_ACCUMULATION_PERIOD` và tiền thiếu ngay tại hưu, không chia 0. `plannedMonthlyContribution` là ý định; `rows.contribution` mới là thực góp dự kiến; `budgetShortfall` là phần ý định chưa có tiền để góp.
- `closingBalance` giữ âm làm đường thiếu hụt, không ngụ ý được vay với lãi suất đầu tư. Ledger riêng `fundedClosingBalance` giữ tiền thực còn có; `unfundedWithdrawal` đếm **nhu cầu mới chưa tài trợ** trong tháng, không cộng lặp thiếu cũ/lãi trên thiếu cũ. `firstShortfallMonth` là lần đầu có nhu cầu chưa tài trợ; `unfundedWithdrawals` cộng các nhu cầu mới. Terminal signed và funded cùng xuất để phân biệt.
- `requiredOpeningBalance/requiredClosingBalance` là yêu cầu vốn theo lịch dòng tiền còn lại, không phải đường trang trí tiến độ lũy thừa. Chart và export dùng cùng `rows`; không tự chạy calculator frontend.

Tham chiếu công thức niên kim cho bộ golden: [Microsoft FV](https://support.microsoft.com/en-us/excel/functions/fv-function?nochrome=true), [Microsoft PV](https://support.microsoft.com/en-us/excel/functions/pv-function?nochrome=true). type=0 là cuối kỳ; đơn vị tỷ lệ phải khớp đơn vị kỳ. Các trường hợp biến lãi/dòng tiền và thanh khoản dùng truy hồi đã nêu, không áp một công thức lãi cố định cho cả horizon.

## Bằng chứng và phần còn lại

- 26 ca T06: FV/PV đối chiếu công thức độc lập, 0/âm/đổi lãi, vốn lớn, L, nghỉ ngay, thiếu sớm/thu muộn, nợ/stress, thu một lần, pension, housing, phí tái cân bằng, replay, quyền/revision/pin phiên bản và response OpenAPI. Full backend 193/193 tests, 16 files đạt.
- Typecheck nguồn/frontend/tests, build đầy đủ (Prisma generate + tsc) và startup guard đạt. Build sandbox ban đầu vướng quyền thư mục tạm Windows; chạy ngoài sandbox đạt, không sửa schema/DB.
- 13 kiểm tra AuthService/HTTP/PostgreSQL thật bằng `scripts/verify-retirement-db.cjs` đạt. Transaction luôn rollback; 50 hồ sơ, plans/snapshots/config có sẵn giữ nguyên; không gửi email. Không thay kiểm thử cạnh tranh transaction độc lập hoặc nghiệm thu UI.
- Chưa lưu snapshot/chọn currentVersion/tạo apply job hoặc nối calculator legacy. T07 cần lưu toàn bộ input/model/phiên bản/quy ước, tách create/preview/apply và sửa worker trước khi đăng ký luồng tài chính cũ. Nghiệm thu chart/export gắn snapshot và UI thuộc T07–T08.
- Đây là mô phỏng xác định, không phải xác suất thành công hoặc lời hứa kết quả. Các con số production phải do ADMIN duyệt, không dùng fixtures. BASE/ADVERSE/FAVORABLE giữ contract T04; không tự đổi FAVORABLE thành kịch bản căng thẳng vì nhãn đề bài khác.
