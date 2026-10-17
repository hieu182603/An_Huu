export type GlossaryTerm = {
  key: string;
  label: { vi: string; en: string };
  definition: { vi: string; en: string };
  aliases?: readonly string[];
};

// Product help ships with the UI. Financial/model definitions remain owned by
// the versioned backend glossary; aliases below only map exact UI wording.
export const productExplanations: GlossaryTerm[] = [
  {
    key: "planPreview", label: { vi: "Bản xem trước", en: "Plan preview" },
    aliases: ["Bản dự kiến", "Chưa áp dụng chính thức", "Preview"],
    definition: { vi: "Kết quả tính thử từ các lựa chọn đang nhập. Bạn có thể thay đổi để so sánh; chỉ khi lưu và chọn dùng phương án thì nó mới trở thành kế hoạch đang dùng.", en: "A calculation using your current selections. You can change them to compare outcomes; saving and applying the option makes it your current plan." },
  },
  {
    key: "currentPlan", label: { vi: "Kế hoạch đang dùng", en: "Current plan" },
    definition: { vi: "Phiên bản kế hoạch bạn đã chọn áp dụng. Một bản xem trước hoặc phương án mới lưu chưa tự thay thế phiên bản này.", en: "The plan version you have applied. A preview or newly saved option does not automatically replace it." },
  },
  {
    key: "savedVersion", label: { vi: "Phiên bản đã lưu", en: "Saved version" },
    aliases: ["Lịch sử phiên bản", "Version history"],
    definition: { vi: "Bản ghi giữ lại đầu vào và kết quả của một lần lưu kế hoạch để bạn xem lại hoặc so sánh. Lưu phiên bản và chọn dùng phiên bản là hai thao tác riêng.", en: "A record of inputs and results from a saved plan, available for review or comparison. Saving a version and applying it are separate actions." },
  },
  {
    key: "actualBalance", label: { vi: "Số dư thực tế", en: "Actual balance" },
    definition: { vi: "Số dư bạn ghi nhận và đối chiếu từ tài khoản hoặc sao kê tại thời điểm theo dõi. Đây là dữ liệu thực tế, khác với số dư quỹ do mô hình dự báo.", en: "The balance you record and reconcile against an account or statement at the tracking date. This is actual data, distinct from the model's projected fund balance." },
  },
  {
    key: "monthlyIncome", label: { vi: "Thu nhập hàng tháng", en: "Monthly income" },
    aliases: ["Thu nhập mỗi tháng"],
    definition: { vi: "Tổng thu nhập định kỳ đã khai trong hồ sơ. Con số trên tổng quan phản ánh dữ liệu bạn nhập, không phải khoản thu được tự xác nhận từ tài khoản ngân hàng.", en: "The recurring income declared in your profile. The overview reflects your entries, rather than income automatically verified from a bank account." },
  },
  {
    key: "monthlyExpenses", label: { vi: "Chi tiêu hàng tháng", en: "Monthly expenses" },
    aliases: ["Chi tiêu mỗi tháng", "Monthly spending"],
    definition: { vi: "Các khoản chi sinh hoạt định kỳ đã khai. Trên tổng quan, khoản trả nợ được trình bày riêng để bạn nhìn rõ phần chi tiêu và nghĩa vụ nợ.", en: "Declared recurring living expenses. Debt payments are shown separately on the overview so you can distinguish spending from debt obligations." },
  },
  {
    key: "monthlyDebtPayment", label: { vi: "Trả nợ hàng tháng", en: "Monthly debt payments" },
    aliases: ["Trả nợ mỗi tháng", "Nghĩa vụ nợ mỗi tháng", "Nghĩa vụ nợ hàng tháng"],
    definition: { vi: "Khoản tiền phải dành cho nghĩa vụ trả nợ trong tháng theo thông tin đã khai. Khác với tổng dư nợ, là số tiền còn nợ tại một thời điểm.", en: "Money allocated to monthly debt obligations under the declared information. This differs from outstanding debt, which is the amount still owed at a point in time." },
  },
  {
    key: "monthlySurplus", label: { vi: "Tiền còn lại mỗi tháng", en: "Monthly surplus" },
    aliases: ["Phần còn dư", "Monthly money left"],
    definition: { vi: "Thu nhập trừ chi tiêu và khoản trả nợ mỗi tháng theo hồ sơ. Nếu âm, các khoản chi đã khai lớn hơn thu nhập. Khoản còn lại chưa tự trở thành tiền góp vào quỹ hưu trí.", en: "Profile income minus spending and monthly debt payments. A negative amount means declared outgoings exceed income. The remainder is not automatically contributed to the retirement fund." },
  },
  {
    key: "accumulationPeriod", label: { vi: "Thời gian tích lũy", en: "Accumulation duration" },
    aliases: ["Giai đoạn tích lũy", "Accumulation period"],
    definition: { vi: "Giai đoạn từ lúc bắt đầu tính kế hoạch đến mốc nghỉ hưu đã chọn. Kế hoạch dùng giai đoạn này để tính lịch góp và số quỹ dự kiến tại thời điểm nghỉ hưu.", en: "The period from the plan's calculation start to the selected retirement date. The plan uses it to model contributions and the projected fund at retirement." },
  },
  {
    key: "retirementPeriod", label: { vi: "Thời gian nghỉ hưu", en: "Retirement period" },
    aliases: ["Giai đoạn nghỉ hưu"],
    definition: { vi: "Giai đoạn từ mốc nghỉ hưu đến tháng kết thúc dự phóng đã chọn. Mô hình theo dõi thu nhập, chi tiêu và số dư quỹ trong từng tháng của giai đoạn này.", en: "The period from retirement to the selected projection end month. The model tracks income, spending and fund balances for each month in this period." },
  },
  {
    key: "projectionEnd", label: { vi: "Kết thúc dự phóng", en: "Projection ends" },
    aliases: ["Tháng kết thúc dự phóng", "Projection end month"],
    definition: { vi: "Tháng cuối cùng được tính trong phương án đang xem. Kết quả trong khoảng này không cho biết quỹ sẽ ra sao sau tháng kết thúc.", en: "The last month calculated for the option being viewed. Results within this horizon do not describe what happens to the fund after that month." },
  },
  {
    key: "expenseToday", label: { vi: "Mức chi theo giá hôm nay", en: "Spending in today's prices" },
    aliases: ["Chi tiêu theo giá hôm nay", "Monthly expense today"],
    definition: { vi: "Mức sinh hoạt bạn muốn duy trì, biểu thị bằng giá hiện tại. Khi tính chi phí ở các tháng tương lai, kế hoạch điều chỉnh mức này theo giả định lạm phát đã chọn.", en: "Your desired living expenses expressed at current prices. The plan adjusts this amount using the selected inflation assumptions when calculating future expenses." },
  },
  {
    key: "contributionTiming", label: { vi: "Thời điểm góp tiền", en: "Contribution timing" },
    aliases: ["Góp đầu tháng", "Góp cuối tháng", "Start-of-month contribution", "End-of-month contribution"],
    definition: { vi: "Lựa chọn tiền góp được đưa vào quỹ ở đầu hay cuối tháng. Thời điểm này ảnh hưởng cách tính dòng tiền và lợi suất; góp đầu tháng cần có nguồn tiền sẵn vào đầu tháng theo khai báo.", en: "Whether contributions enter the fund at the start or end of a month. This affects cash-flow and return calculations; start-of-month contributions require declared funds available at that time." },
  },
  {
    key: "scenarioComparison", label: { vi: "So sánh phương án", en: "Compare scenarios" },
    aliases: ["Kịch bản thử", "What-if scenario"],
    definition: { vi: "Tính thử kết quả khi đổi một số lựa chọn, rồi đối chiếu với phương án gốc. Chạy mô phỏng không tự lưu hoặc áp dụng các thay đổi vào kế hoạch đang dùng.", en: "Calculate outcomes after changing selected inputs and compare them with the original option. Running a simulation does not automatically save or apply changes to the current plan." },
  },
];

export const glossaryAliases: Record<string, readonly string[]> = {
  inflation: ["Trượt giá lạm phát", "Inflation adjusted"],
  requiredFund: ["Quỹ cần có khi nghỉ hưu", "Retirement fund needed"],
  projectedFund: ["Quỹ dự kiến tích lũy", "Số tiền dự kiến có khi nghỉ hưu", "Projected accumulated fund"],
  initialRetirementCapital: ["Vốn hưu trí ban đầu", "Tiền có thể đưa vào quỹ lúc bắt đầu", "Initial fund capital (liquid)"],
  netWorth: ["Tổng tài sản trừ tổng nợ", "Overall net worth"],
  fundCoverage: ["Mức bao phủ quỹ", "Tỷ lệ đáp ứng quỹ"],
  requiredMonthlyContribution: ["Mức góp cần thiết / tháng", "Required contribution / month"],
  emergencyReserve: ["Quỹ dự phòng khẩn cấp", "Dự phòng cần có", "Dự phòng đã khai", "Required reserve", "Declared reserve"],
  essentialExpenses: ["Chi thiết yếu mỗi tháng", "Monthly essential expenses"],
  lossTolerance: ["Khả năng chịu lỗ", "Loss tolerance"],
  pinnedAssumptions: ["Bộ giả định đã ghim"],
  glidePath: ["Risk reduction path"],
};

export function mergeExplanationTerms(serverTerms: GlossaryTerm[]): GlossaryTerm[] {
  const terms = new Map(productExplanations.map(term => [term.key, term]));
  for (const term of serverTerms) terms.set(term.key, term);
  return [...terms.values()].map(term => ({ ...term, aliases: [...(term.aliases ?? []), ...(glossaryAliases[term.key] ?? [])] }));
}
