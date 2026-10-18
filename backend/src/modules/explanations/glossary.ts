export const explanationGlossary = {
  version: "explanations-glossary-2026-10-17-v2",
  terms: [
    {
      key: "inflation", label: { vi: "Lạm phát", en: "Inflation" },
      definition: { vi: "Mức tăng giá theo thời gian, khiến cùng một số tiền mua được ít hàng hóa và dịch vụ hơn. Kế hoạch dùng giả định lạm phát đã ghim để đổi mức chi hôm nay thành mức chi tương lai.", en: "Rising prices over time mean the same amount of money buys fewer goods and services. The plan uses pinned inflation assumptions to convert today's expenses into future expenses." },
    },
    {
      key: "presentValue", label: { vi: "Giá trị hiện tại", en: "Present value" },
      definition: { vi: "Số tiền tương đương tại mốc định giá của một khoản tiền ở tương lai, sau khi quy đổi theo lợi suất dùng trong phép tính. Đây không phải số tiền chắc chắn thu được khi bán tài sản hôm nay.", en: "The equivalent amount at the valuation date of a future amount, discounted using the return in the calculation. It is not a guaranteed sale value today." },
    },
    {
      key: "futureValue", label: { vi: "Giá trị tương lai", en: "Future value" },
      definition: { vi: "Giá trị của một khoản tiền hoặc mức chi tại một mốc tương lai theo giả định của kế hoạch. Với mục tiêu chi tiêu, giá trị này phản ánh giá tăng từ mức giá hôm nay.", en: "The value of money or an expense at a future date under the plan's assumptions. For a spending goal, it reflects price increases from today's price." },
    },
    {
      key: "nominalValue", label: { vi: "Giá trị danh nghĩa", en: "Nominal value" },
      definition: { vi: "Số tiền tính theo giá tại thời điểm phát sinh, chưa loại ảnh hưởng của lạm phát. Cần xem mốc thời gian trước khi so với một khoản tiền khác.", en: "An amount expressed in prices at the time it occurs, without removing inflation. Check its date before comparing it with another amount." },
    },
    {
      key: "purchasingPower", label: { vi: "Sức mua tại ngày định giá", en: "Purchasing power at valuation" },
      definition: { vi: "Cách đưa tiền ở các thời điểm khác nhau về cùng mặt bằng giá tại ngày định giá. Nhờ vậy có thể so sánh các khoản tiền sau khi tính ảnh hưởng của lạm phát.", en: "Amounts from different dates expressed in the same price level at the valuation date. This allows comparison after accounting for inflation." },
    },
    {
      key: "requiredFund", label: { vi: "Quỹ cần khi nghỉ hưu", en: "Required retirement fund" },
      definition: { vi: "Số quỹ cần tại mốc so sánh để đáp ứng các khoản rút và mục tiêu cuối kỳ trong mô hình. Mức cần phụ thuộc vào lịch dòng tiền và giả định đã ghim.", en: "The fund needed at the comparison date to cover modeled withdrawals and the end target. It depends on the cash-flow schedule and pinned assumptions." },
    },
    {
      key: "projectedFund", label: { vi: "Quỹ dự kiến khi nghỉ hưu", en: "Projected retirement fund" },
      definition: { vi: "Số quỹ mô hình dự báo có tại mốc so sánh từ vốn, lịch góp và dòng tiền đã chọn. Đây là dự báo, không phải số dư tài khoản hiện tại hay cam kết lợi nhuận.", en: "The modeled fund at the comparison date, based on selected capital, contributions and cash flows. It is a projection, not a current account balance or a promised return." },
    },
    {
      key: "fundingGap", label: { vi: "Chênh lệch quỹ cần và quỹ dự kiến", en: "Funding gap" },
      definition: { vi: "Quỹ cần trừ quỹ dự kiến tại cùng một mốc. Số dương thể hiện còn thiếu; số âm thể hiện dự kiến dư so với mức cần trong mô hình.", en: "Required fund minus projected fund at the same date. A positive amount means a shortfall; a negative amount means a modeled surplus over the required fund." },
    },
    {
      key: "fundCoverage", label: { vi: "Độ phủ quỹ", en: "Fund coverage" },
      definition: { vi: "Quỹ dự kiến chia cho quỹ cần, biểu thị bằng phần trăm. Đây là tỷ lệ giữa hai số tiền, không phải xác suất kế hoạch thành công; khi quỹ cần bằng không thì tỷ lệ chưa xác định.", en: "Projected fund divided by required fund, expressed as a percentage. It compares two amounts, not the probability of success; it is undefined when the required fund is zero." },
    },
    {
      key: "requiredMonthlyContribution", label: { vi: "Khoản góp đều cần mỗi tháng", en: "Required constant monthly contribution" },
      definition: { vi: "Khoản góp đều mô hình tính là cần trong thời gian tích lũy theo thời điểm góp đã chọn. Cần đối chiếu thêm với khả năng góp thực tế của từng tháng.", en: "The constant contribution the model requires during accumulation, using the selected contribution timing. It must also be checked against each month's contribution capacity." },
    },
    {
      key: "additionalMonthlyContribution", label: { vi: "Khoản cần góp thêm mỗi tháng", en: "Additional monthly contribution" },
      definition: { vi: "Khoản góp đều cần bổ sung ngoài lịch góp hiện tại theo mô hình. Chỉ số này có thể chưa xác định nếu không còn thời gian tích lũy hoặc dữ liệu chưa đủ.", en: "The constant contribution needed in addition to the current schedule. It may be unavailable when there is no accumulation period left or inputs are incomplete." },
    },
    {
      key: "initialRetirementCapital", label: { vi: "Vốn hưu trí đầu kỳ", en: "Initial retirement capital" },
      definition: { vi: "Số vốn được đưa vào quỹ ở đầu kỳ tính theo hồ sơ hoặc số dư thực tế đã xác nhận của phiên bản đang xem. Không bao gồm mọi tài sản chỉ vì chúng đã được khai trong hồ sơ.", en: "Capital entering the fund at the start of the calculation, from the profile or the confirmed actual balance of the version being viewed. It does not include every asset merely because it is listed in the profile." },
    },
    {
      key: "netWorth", label: { vi: "Tài sản ròng", en: "Net worth" },
      definition: { vi: "Tổng giá trị tài sản theo phần bạn sở hữu tại ngày định giá, trừ tổng dư nợ theo phần bạn chịu. Con số này gồm cả nhà đang ở và tài sản khó bán, nên khác với vốn hưu trí đầu kỳ chỉ tính tiền và tài sản dễ bán dành cho hưu trí.", en: "Total value of your owned share of assets at the valuation date minus your share of outstanding debts. It includes your home and hard-to-sell assets, so it differs from initial retirement capital, which counts only liquid assets set aside for retirement." },
    },
    {
      key: "emergencyReserve", label: { vi: "Dự phòng khẩn cấp", en: "Emergency reserve" },
      definition: { vi: "Phần vốn để ứng phó khi thu nhập gián đoạn hoặc phát sinh nhu cầu cấp bách. Mức dự phòng cần có trong phần tách vốn được tính từ chi thiết yếu và số tháng dự phòng theo quy tắc của hệ thống.", en: "Capital set aside for interrupted income or urgent needs. The required reserve in capital separation uses essential expenses and the reserve months defined by the system's rules." },
    },
    {
      key: "essentialExpenses", label: { vi: "Chi thiết yếu", en: "Essential expenses" },
      definition: { vi: "Các khoản chi được phân loại là thiết yếu trong hồ sơ; khi nghỉ hưu, mô hình còn tính mức sinh hoạt hưu trí đã chọn. Phân loại này giúp xác định phần thiếu hụt cần ưu tiên theo dõi.", en: "Expenses classified as essential in the profile; during retirement, the model also includes selected retirement living expenses. This classification identifies the shortfall to monitor first." },
    },
    {
      key: "otherExpenses", label: { vi: "Chi khác", en: "Other expenses" },
      definition: { vi: "Phần chi ngoài nhóm thiết yếu trong phép phân loại thiếu hụt. Có thể gồm nợ, phí hoặc y tế, nên không có nghĩa mọi khoản này đều có thể bỏ.", en: "Spending outside the essential group in the shortfall classification. It can include debt, fees or healthcare, so it does not mean every such expense can be skipped." },
    },
    {
      key: "essentialShortfall", label: { vi: "Thiếu hụt chi thiết yếu", en: "Essential expense shortfall" },
      definition: { vi: "Phần chi thiết yếu chưa được các nguồn tiền mô hình đáp ứng, sau khi ưu tiên phân loại nguồn còn lại cho chi thiết yếu. Tổng thiếu hụt cộng các tháng, không phải xác suất thiếu tiền.", en: "Essential spending not covered by modeled resources, classifying remaining resources toward essentials first. The total adds monthly shortfalls and is not a probability." },
    },
    {
      key: "growthCapital", label: { vi: "Vốn tăng trưởng", en: "Growth capital" },
      definition: { vi: "Tổng vốn đầu tư thanh khoản trừ dự phòng cần có và giá trị hiện tại của mục tiêu gần hạn. Đây là thông tin tách vốn tham khảo; không tự thay đổi quỹ hưu trí hoặc danh mục đang tính.", en: "Liquid investable capital minus the required reserve and present value of near-term goals. This informational separation does not automatically change the retirement fund or its allocation." },
    },
    {
      key: "nearTermGoals", label: { vi: "Mục tiêu gần hạn", en: "Near-term goals" },
      definition: { vi: "Mục tiêu có hạn chi nằm trong cửa sổ gần hạn mà phần tách vốn đang dùng. Hệ thống quy đổi số tiền theo giá hôm nay thành chi phí tương lai rồi tính số vốn cần giữ tại ngày định giá.", en: "A spending goal due within the near-term window used by capital separation. The system converts today's amount into future cost, then calculates the capital to reserve at valuation." },
    },
    {
      key: "liquidAssets", label: { vi: "Tài sản thanh khoản được tính", en: "Eligible liquid assets" },
      definition: { vi: "Phần tài sản đáp ứng điều kiện loại tài sản, khả năng sử dụng, ngày và tỷ lệ sở hữu trong phép tính đang xem. Tài sản bất động sản hoặc đang bị khóa không tự được cộng thành tiền có thể dùng ngay.", en: "The asset portion meeting the type, availability, date and ownership conditions of the calculation being viewed. Property or locked assets are not automatically counted as immediately usable money." },
    },
    {
      key: "lockedAssets", label: { vi: "Tài sản đang bị khóa", en: "Locked assets" },
      definition: { vi: "Tài sản chưa thể dùng theo trạng thái hoặc thời điểm đã khai. Hệ thống chỉ đưa vốn vào dòng tiền khi có điều kiện sử dụng phù hợp, không coi đó là tiền mặt sẵn có.", en: "An asset unavailable under its declared status or date. The system includes it in cash flows only under the appropriate availability conditions, rather than treating it as cash on hand." },
    },
    {
      key: "glidePath", label: { vi: "Lộ trình giảm dần rủi ro", en: "Glide path" },
      definition: { vi: "Lịch thay đổi tỷ trọng các nhóm tài sản theo thời gian còn lại tới nghỉ hưu trong chính sách đã ghim. Đây là quy tắc phân bổ của mô hình, không bảo đảm tránh được thua lỗ.", en: "A schedule of asset weights based on time remaining until retirement in the pinned policy. It is a model allocation rule and does not guarantee protection from losses." },
    },
    {
      key: "marketShock", label: { vi: "Cú sốc thị trường", en: "Market shock" },
      definition: { vi: "Tình huống giả định các nhóm tài sản thay đổi theo mức sốc trong chính sách đã ghim. Mức lỗ minh họa giúp đối chiếu khả năng chịu lỗ, không dự báo ngày xảy ra hay xác suất của cú sốc.", en: "A hypothetical change in asset groups using shocks from the pinned policy. The modeled loss helps compare loss tolerance; it does not predict when a shock will occur or its probability." },
    },
    {
      key: "lossTolerance", label: { vi: "Mức chịu lỗ đã khai", en: "Declared loss tolerance" },
      definition: { vi: "Giới hạn người dùng khai bằng số tiền và tỷ lệ vốn tăng trưởng. Khi đủ cả hai, hệ thống dùng giới hạn chặt hơn để so với mức lỗ trong cú sốc.", en: "The user's declared limits as an amount and a percentage of growth capital. When both are known, the system uses the stricter limit to compare with the shock loss." },
    },
    {
      key: "essentialCoverageProbability", label: { vi: "Tỷ lệ mô phỏng đủ chi thiết yếu", en: "Simulated essential expense coverage" },
      definition: { vi: "Tỷ lệ đường mô phỏng không thiếu chi thiết yếu ở bất kỳ tháng nào. Chỉ số này dựa trên dữ liệu và cách mô phỏng đã chọn, không bảo đảm đủ mọi khoản chi hoặc chắc chắn thành công trong tương lai.", en: "The share of simulated paths with no essential expense shortfall in any month. It depends on the selected data and method and does not guarantee all expenses or future success." },
    },
    {
      key: "cvar", label: { vi: "Thiếu hụt trung bình ở đuôi xấu (CVaR)", en: "Tail-average shortfall (CVaR)" },
      definition: { vi: "Mức thiếu hụt chi thiết yếu trung bình ở phần kết quả mô phỏng xấu nhất theo ngưỡng đã chọn, quy về sức mua tại ngày định giá. Cần đọc cùng ngưỡng và giới hạn mô phỏng; đây không phải mức lỗ chắc chắn tối đa.", en: "Average essential expense shortfall in the worst simulation tail at the selected threshold, expressed in purchasing power at valuation. Read it with the threshold and simulation limits; it is not a guaranteed maximum loss." },
    },
    {
      key: "rebalance", label: { vi: "Tái cân bằng", en: "Rebalancing" },
      definition: { vi: "Điều chỉnh tỷ trọng nhóm tài sản về gần mục tiêu của chính sách. Đề xuất trong hệ thống ưu tiên tiền góp hoặc đáo hạn trước; đề xuất chưa phải giao dịch đã thực hiện.", en: "Adjusting asset weights toward the policy's targets. System proposals prioritize contributions or matured amounts first; a proposal is not an executed trade." },
    },
    {
      key: "governmentBonds", label: { vi: "Trái phiếu chính phủ (TPCP)", en: "Government bonds" },
      definition: { vi: "Nhóm trái phiếu do Chính phủ phát hành, được hệ thống dùng như một nhóm tài sản trong danh mục. Giá trị và lợi suất mô hình vẫn phụ thuộc giả định và thời hạn; không đồng nghĩa với tiền mặt.", en: "Bonds issued by the government, treated as an asset group in the portfolio. Modeled value and return still depend on assumptions and horizon; they are not the same as cash." },
    },
    {
      key: "deposits", label: { vi: "Tiền gửi", en: "Deposits" },
      definition: { vi: "Nhóm tài sản tiền gửi trong mô hình, dùng lợi suất theo kỳ hạn và nguồn giả định tương ứng. Khả năng dùng tiền còn phụ thuộc thông tin thanh khoản và ngày đã khai.", en: "The deposit asset group in the model, using returns for the relevant horizon and assumption sources. Access to the money also depends on declared liquidity and dates." },
    },
    {
      key: "equities", label: { vi: "Cổ phiếu", en: "Equities" },
      definition: { vi: "Nhóm tài sản cổ phiếu trong danh mục mô hình. Lợi suất, tỷ trọng và mức sốc được lấy từ dữ liệu hoặc chính sách đã ghim, không phải cam kết lợi nhuận cho một mã cổ phiếu cụ thể.", en: "The equity asset group in the modeled portfolio. Returns, weights and shocks come from pinned data or policy and are not a promised return for a particular stock." },
    },
    {
      key: "gold", label: { vi: "Vàng", en: "Gold" },
      definition: { vi: "Nhóm tài sản vàng được hồ sơ và danh mục hỗ trợ. Hệ thống dùng thông tin sở hữu, thanh khoản và giả định của nhóm này; không coi giá vàng luôn tăng hoặc không có rủi ro.", en: "The gold asset group supported by the profile and portfolio. The system uses its ownership, liquidity and group assumptions; it does not assume gold always rises or is risk free." },
    },
    {
      key: "socialInsurance", label: { vi: "Bảo hiểm xã hội (BHXH)", en: "Social insurance" },
      definition: { vi: "Thông tin quá trình tham gia và quyền lợi được hệ thống đánh giá theo bộ quy tắc có nguồn và phiên bản. Kết quả còn phụ thuộc dữ liệu lịch sử, điều kiện của từng nhánh và chứng cứ; không phải quyết định hưởng của cơ quan BHXH.", en: "Participation history and benefits assessed using sourced, versioned rules. Results depend on history, branch conditions and evidence; they are not an official benefit decision by the social insurance authority." },
    },
    {
      key: "pension", label: { vi: "Lương hưu", en: "Pension" },
      definition: { vi: "Nguồn tiền định kỳ khi nghỉ hưu theo lựa chọn và lịch đã ghim trong kế hoạch. Khoản trợ cấp một lần được theo dõi riêng và không tự cộng vào vốn hưu trí.", en: "Recurring retirement income under the selection and schedule pinned in the plan. One-off grants are tracked separately and are not automatically added to retirement capital." },
    },
    {
      key: "pinnedAssumptions", label: { vi: "Giả định đã ghim", en: "Pinned assumptions" },
      definition: { vi: "Bộ giả định có phiên bản và nguồn được giữ cùng phép tính hoặc kế hoạch. Khi dữ liệu mới được công bố, bản kế hoạch đã lưu không tự đổi sang giả định mới.", en: "Versioned, sourced assumptions retained with a calculation or plan. Publishing new data does not automatically replace the assumptions in a saved plan." },
    },
    {
      key: "planSnapshot", label: { vi: "Bản chụp kế hoạch", en: "Plan snapshot" },
      definition: { vi: "Dữ liệu đầu vào, nguồn tham chiếu và kết quả được giữ cho một phiên bản kế hoạch. Khi xem hoặc phát lại, hệ thống dùng dữ liệu đã lưu thay vì lấy hồ sơ hiện tại để viết lại bản cũ.", en: "Inputs, references and results retained for a plan version. Reading or replaying it uses saved data rather than rewriting the old version from the current profile." },
    },
    {
      key: "advisoryFee", label: { vi: "Phí tư vấn bổ sung", en: "Additional advisory fee" },
      definition: { vi: "Phí dịch vụ tư vấn tùy chọn, tính theo tỷ lệ năm trên bình quân quỹ đầu tháng và cuối tháng trước phí. Nguồn trả có thể là quỹ hoặc ngân sách hộ; không trừ lại phí quản lý đã có trong NAV.", en: "An optional advisory service fee, using an annual rate on the average of opening fund and pre-fee closing fund. It can be paid from the fund or household budget; management costs already in NAV are not deducted again." },
    },
    {
      key: "nav", label: { vi: "Giá trị tài sản ròng (NAV)", en: "Net asset value (NAV)" },
      definition: { vi: "Giá trị tài sản ròng dùng để xác định giá trị quỹ. Khi dữ liệu lợi suất đã phản ánh phí quản lý trong NAV, hệ thống không trừ loại phí đó thêm lần nữa.", en: "Net asset value used to value a fund. When return data already reflects management costs in NAV, the system does not deduct those costs again." },
    },
    {
      key: "fundedBalance", label: { vi: "Số dư quỹ được tài trợ", en: "Funded balance" },
      definition: { vi: "Số tiền quỹ mô hình còn thực sự đáp ứng được sau dòng tiền của kỳ, có mức sàn bằng không. Phần nhu cầu rút vượt nguồn tiền được ghi riêng là thiếu hụt, không biến thành khoản vay giả định.", en: "The modeled fund amount actually available after the period's cash flows, floored at zero. Withdrawals beyond available resources are recorded as shortfalls rather than an assumed loan." },
    },
    {
      key: "unfundedWithdrawal", label: { vi: "Khoản rút chưa được đáp ứng", en: "Unfunded withdrawal" },
      definition: { vi: "Phần tiền cần rút nhưng quỹ không đủ để chi trong tháng. Hệ thống theo dõi riêng khoản này để không che thiếu hụt bằng số dư quỹ âm giả định.", en: "The part of a required monthly withdrawal that the fund cannot cover. It is tracked separately so an assumed negative fund balance does not hide the shortfall." },
    },
  ],
};
