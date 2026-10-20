export type GlossaryTerm = {
  key: string;
  label: { vi: string; en: string };
  definition: { vi: string; en: string };
  aliases?: readonly string[];
  formula?: {
    symbolic?: string;
    vi: string;
    en: string;
  };
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
    aliases: [
      "Dòng tiền có thể tích lũy hiện tại:", "Dòng tiền có thể tích lũy hiện tại",
      "Tiền còn lại mỗi tháng", "Thặng dư mỗi tháng", "Thặng dư hàng tháng",
      "Phần còn dư", "Monthly money left", "Current monthly surplus:",
      "Current monthly surplus", "Monthly surplus", "Monthly surplus:"
    ],
    definition: {
      vi: "Thu nhập trừ chi tiêu và khoản trả nợ mỗi tháng theo hồ sơ. Nếu âm, các khoản chi đã khai lớn hơn thu nhập. Khoản còn lại chưa tự trở thành tiền góp vào quỹ hưu trí.",
      en: "Profile income minus spending and monthly debt payments. A negative amount means declared outgoings exceed income. The remainder is not automatically contributed to the retirement fund."
    },
    formula: {
      symbolic: "Dòng tiền tích lũy = Tổng thu nhập − Chi phí sinh hoạt − Tiền trả nợ hàng tháng",
      vi: "Lấy tổng thu nhập hàng tháng (thu nhập chính + phụ) trừ đi toàn bộ chi phí sinh hoạt (thiết yếu + linh hoạt) và khoản trả nợ định kỳ từ hồ sơ tài chính.",
      en: "Calculated as total monthly income minus declared living expenses and monthly debt service payments."
    }
  },
  {
    key: "expenseToday", label: { vi: "Chi tiêu hôm nay (PV)", en: "Today's expense (PV)" },
    aliases: [
      "Chi tiêu hôm nay (PV):", "Chi tiêu hôm nay", "Chi tiêu theo giá hôm nay",
      "Mức chi theo giá hôm nay", "Today's expense", "Today's expense (PV):",
      "Monthly expense today", "Spending in today's prices"
    ],
    definition: {
      vi: "Mức chi tiêu sinh hoạt hàng tháng bạn mong muốn duy trì khi nghỉ hưu, tính theo thời giá hiện tại (chưa tính trượt giá lạm phát). Khi lập kế hoạch, hệ thống sẽ tự động nhân hệ số lạm phát để tính chi phí tương lai tương ứng.",
      en: "Desired monthly living expenses in retirement expressed at current price levels (before inflation). The system projects future expenses by compounding inflation over your accumulation horizon."
    },
    formula: {
      symbolic: "Chi tiêu hôm nay (PV) = Chi thiết yếu + Chi linh hoạt (hoặc mức tự chọn theo phong cách sống)",
      vi: "Mặc định xác định từ tổng chi tiêu sinh hoạt hàng tháng trong hồ sơ tài chính, hoặc điều chỉnh theo phong cách sống nghỉ hưu mà bạn lựa chọn.",
      en: "Defaulted from total monthly living expenses in your financial profile, or adjusted by your selected retirement lifestyle."
    }
  },
  {
    key: "currentAge", label: { vi: "Tuổi hiện tại", en: "Current age" },
    aliases: ["Tuổi hiện tại của bạn", "Tuổi hiện tại:", "Tuổi của bạn", "Số tuổi hiện tại", "Current age", "Your current age"],
    definition: {
      vi: "Số tuổi hiện tại của bạn tính từ năm sinh đã khai trong hồ sơ tài chính cá nhân. Tuổi hiện tại là mốc xuất phát để xác định số năm còn lại trước khi bước vào tuổi hưu.",
      en: "Your current age derived from the birth year declared in your financial profile. It serves as the starting point for calculating remaining accumulation years."
    },
    formula: {
      symbolic: "Tuổi hiện tại = Năm hiện tại − Năm sinh",
      vi: "Xác định từ năm sinh đã lưu trong hồ sơ tài chính cá nhân.",
      en: "Calculated from the birth year declared in your financial profile."
    }
  },
  {
    key: "retirementAge", label: { vi: "Mốc tuổi nghỉ hưu", en: "Retirement age" },
    aliases: [
      "Mốc tuổi nghỉ hưu mong muốn", "Mốc tuổi nghỉ hưu", "Tuổi nghỉ hưu mong muốn",
      "Tuổi dự kiến nghỉ hưu", "Tuổi bắt đầu nghỉ", "Tuổi bắt đầu nghỉ:",
      "Tuổi nghỉ hưu mục tiêu", "Tuổi nghỉ hưu", "Tuổi hưu", "Độ tuổi nghỉ hưu",
      "Desired retirement age", "Desired Retirement Age Milestones",
      "Target retirement age", "Start retirement age", "Start Retirement Age:"
    ],
    definition: {
      vi: "Độ tuổi bạn mong muốn ngừng làm việc toàn thời gian và bắt đầu chuyển sang giai đoạn hưởng hưu. Mốc tuổi này quyết định số năm bạn có để tích lũy tài chính và số năm quỹ hưu trí cần chi trả.",
      en: "The target age at which you plan to stop working full-time and enter retirement. This sets both your accumulation timeline and retirement drawdown duration."
    },
    formula: {
      symbolic: "Năm bắt đầu nghỉ hưu = Năm sinh + Mốc tuổi nghỉ hưu mong muốn",
      vi: "Thời điểm bắt đầu nghỉ hưu tính bằng năm sinh cộng với mốc tuổi nghỉ hưu mà bạn lựa chọn.",
      en: "Retirement calendar year equals birth year plus your chosen retirement age."
    }
  },
  {
    key: "accumulationPeriod", label: { vi: "Thời gian tích lũy", en: "Accumulation duration" },
    aliases: [
      "Giai đoạn tích lũy", "Thời gian còn lại", "Thời gian còn lại:",
      "Số năm tích lũy", "Năm tích lũy", "Time remaining", "Time remaining:",
      "Accumulation duration", "Accumulation period", "years accumulating"
    ],
    definition: {
      vi: "Khoảng thời gian từ tuổi hiện tại đến mốc tuổi nghỉ hưu mục tiêu. Đây là giai đoạn quan trọng nhất để làm việc, tiết kiệm và đầu tư tạo nguồn vốn cho quỹ hưu trí.",
      en: "The period from your current age to your target retirement age. This is the primary window for earning, saving and investing into your retirement fund."
    },
    formula: {
      symbolic: "Thời gian tích lũy (năm) = Tuổi nghỉ hưu mục tiêu − Tuổi hiện tại",
      vi: "Số năm còn lại để chuẩn bị tài chính trước khi chính thức nghỉ hưu.",
      en: "Years remaining to build and grow capital before entering retirement."
    }
  },
  {
    key: "retirementPeriod", label: { vi: "Thời gian hưởng hưu", en: "Retirement duration" },
    aliases: [
      "Giai đoạn hưởng hưu", "Giai đoạn nghỉ hưu", "Thời gian hưởng hưu:",
      "Số năm hưởng hưu", "Số năm hưởng hưu:", "Thời gian hưu dự kiến",
      "Năm hưởng hưu", "Retirement duration", "Retirement duration:", "Years in retirement"
    ],
    definition: {
      vi: "Số năm dự kiến từ mốc tuổi bắt đầu nghỉ hưu cho đến tuổi kết thúc kế hoạch. Quỹ hưu trí cần đảm bảo đủ dòng tiền chi trả sinh hoạt không bị gián đoạn suốt thời gian này.",
      en: "The projected number of years from retirement age through the plan end age. The retirement fund must sustain continuous living cash flows throughout this span."
    },
    formula: {
      symbolic: "Thời gian hưởng hưu (năm) = Tuổi kết thúc kế hoạch − Tuổi bắt đầu nghỉ hưu",
      vi: "Số năm quỹ hưu trí cần tài trợ dòng tiền sinh hoạt cho cuộc sống tuổi hưu.",
      en: "The number of retirement years that must be funded by your capital and income streams."
    }
  },
  {
    key: "retirementGoal", label: { vi: "Mục tiêu nghỉ hưu", en: "Retirement goal" },
    aliases: [
      "Mục tiêu hưu trí độc lập", "MỤC TIÊU HƯU TRÍ ĐỘC LẬP", "Mục tiêu hưu trí",
      "Retirement goal", "Independent retirement goal", "MỤC TIÊU NGHỈ HƯU"
    ],
    definition: {
      vi: "Mục tiêu xác định độ tuổi nghỉ hưu mong muốn, phong cách sống tuổi già và số vốn cần tích lũy để bảo đảm tự do tài chính và an tâm suốt đời.",
      en: "Strategic goal defining your desired retirement age, lifestyle standard and target capital required for lifelong financial freedom."
    },
    formula: {
      symbolic: "Kế hoạch hưu trí = (Mốc tuổi hưu, Phong cách sống, Quỹ hưu trí cần đạt)",
      vi: "Tập hợp các lựa chọn cốt lõi: mốc tuổi nghỉ hưu, số năm hưởng hưu và mức chi tiêu hàng tháng theo phong cách sống đã chọn.",
      en: "Core parameters defining your retirement plan: target age, duration and lifestyle-based monthly spending."
    }
  },
  {
    key: "lifestyle", label: { vi: "Mức sống & Chi tiêu khi nghỉ hưu", en: "Retirement lifestyle & spending" },
    aliases: ["Mức sống khi nghỉ hưu", "Phong cách sống khi nghỉ hưu", "Mức sống và chi tiêu", "Retirement lifestyle", "Retirement Lifestyle & Expenses"],
    definition: {
      vi: "Lựa chọn tiêu chuẩn sinh hoạt phù hợp với định hướng cuộc sống tuổi hưu: Tiết kiệm (~75% chi tiêu hiện tại), Thoải mái (100% chi tiêu hiện tại), hoặc Thảnh thơi (~140% chi tiêu hiện tại).",
      en: "Selection of your standard of living in retirement: Frugal (~75%), Comfortable (100%), or Leisure (~140% of current living expenses)."
    },
    formula: {
      symbolic: "Chi tiêu hưu (PV) = Tỷ lệ mức sống (%) × Chi tiêu sinh hoạt hiện tại",
      vi: "Mức chi tiêu hưu trí theo giá hôm nay tính theo tỷ lệ phần trăm so với tổng chi tiêu hàng tháng trong hồ sơ tài chính.",
      en: "Today's purchasing power expense estimated as a percentage of current living expenses."
    }
  },
  {
    key: "lifestyleFrugal", label: { vi: "Tiết kiệm & Giản dị", en: "Frugal & Simple" },
    aliases: ["Mức sống tiết kiệm", "Tiết kiệm và giản dị", "Frugal & Simple"],
    definition: {
      vi: "Khoảng 75% chi tiêu hiện tại. Ăn uống cơ bản, sinh hoạt giản dị, tập trung vào nhu cầu thiết yếu và giảm thiểu chi tiêu xa xỉ.",
      en: "About 75% of current expenses. Essential living and simple lifestyle, prioritizing essentials."
    },
    formula: {
      symbolic: "Chi tiêu hưu = 75% × Chi tiêu hiện tại",
      vi: "Ước tính bằng 75% tổng chi tiêu hàng tháng hiện tại.",
      en: "Estimated at 75% of current monthly expenses."
    }
  },
  {
    key: "lifestyleComfortable", label: { vi: "Thoải mái & Độc lập", en: "Comfortable & Independent" },
    aliases: ["Mức sống thoải mái", "Thoải mái và độc lập", "Comfortable & Independent"],
    definition: {
      vi: "Duy trì 100% mức sống hiện tại. Đủ cho sinh hoạt quen thuộc, du lịch trong nước, chăm sóc sức khỏe chủ động và độc lập tài chính.",
      en: "Maintain 100% of current living standard, domestic travel and healthcare independence."
    },
    formula: {
      symbolic: "Chi tiêu hưu = 100% × Chi tiêu hiện tại",
      vi: "Duy trì nguyên vẹn 100% mức chi tiêu sinh hoạt hiện tại.",
      en: "Maintains 100% of current living expenses."
    }
  },
  {
    key: "lifestyleLuxury", label: { vi: "Thảnh thơi & Khám phá", en: "Leisure & Exploratory" },
    aliases: ["Mức sống thảnh thơi", "Thảnh thơi và khám phá", "Leisure & Exploratory"],
    definition: {
      vi: "Khoảng 140% chi tiêu hiện tại. Dành cho người muốn du lịch thường xuyên, trải nghiệm văn hóa ẩm thực phong phú và sinh hoạt tiện nghi cao cấp.",
      en: "About 140% of current expenses. Frequent travel, high-end living and rich experiences."
    },
    formula: {
      symbolic: "Chi tiêu hưu = 140% × Chi tiêu hiện tại",
      vi: "Ước tính bằng 140% mức chi tiêu hiện tại để có trải nghiệm hưu trí dư dả.",
      en: "Estimated at 140% of current living expenses."
    }
  },
  {
    key: "timeline", label: { vi: "Lộ trình các mốc thời gian cuộc đời", en: "Life milestones trajectory" },
    aliases: ["Lộ trình mốc thời gian", "Lộ trình cuộc đời", "Life milestones trajectory", "Life Milestones Trajectory"],
    definition: {
      vi: "Hình dung trực quan các chặng hành trình từ thời điểm hiện tại qua giai đoạn tích lũy, thời điểm nghỉ hưu cho đến hết vòng đời kế hoạch.",
      en: "Visual progression from present through accumulation, retirement date and plan horizon."
    }
  },
  {
    key: "goalsSummary", label: { vi: "Tổng hợp mục tiêu", en: "Goals summary" },
    aliases: ["TỔNG HỢP MỤC TIÊU", "Bảng tổng hợp mục tiêu", "Goals summary", "GOALS SUMMARY"],
    definition: {
      vi: "Bảng tóm tắt nhanh các chỉ số trọng yếu của kế hoạch: tuổi bắt đầu nghỉ, số năm tích lũy, số năm hưởng hưu, chi tiêu hôm nay (PV), chi tiêu lúc hưu (FV) và quỹ hưu trí mục tiêu.",
      en: "Quick summary of core retirement metrics: target age, accumulation years, duration, PV/FV spending and target fund."
    }
  },
  {
    key: "projectionEnd", label: { vi: "Kết thúc dự phóng", en: "Projection ends" },
    aliases: ["Tháng kết thúc dự phóng", "Projection end month"],
    definition: { vi: "Tháng cuối cùng được tính trong phương án đang xem. Kết quả trong khoảng này không cho biết quỹ sẽ ra sao sau tháng kết thúc.", en: "The last month calculated for the option being viewed. Results within this horizon do not describe what happens to the fund after that month." },
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
  {
    key: "inflation", label: { vi: "Lạm phát dài hạn", en: "Long-term inflation" },
    aliases: ["Lạm phát dài hạn", "Long-Term Inflation", "Lạm phát", "Inflation", "Trượt giá lạm phát", "Inflation adjusted"],
    definition: {
      vi: "Mức tăng giá sinh hoạt theo thời gian khiến cùng một số tiền mua được ít hàng hóa và dịch vụ hơn. Kế hoạch An Hưu sử dụng chuỗi giả định lạm phát theo từng năm đã công bố để quy đổi chi tiêu hôm nay thành chi phí thực tế khi nghỉ hưu.",
      en: "Rising prices over time mean the same amount of money buys fewer goods and services. The plan compounds annual inflation assumptions to convert today's expenses into future retirement costs."
    },
    formula: {
      symbolic: "Chi tiêu tương lai (FV) = Chi tiêu hôm nay (PV) × (1 + i)^n",
      vi: "Chi tiêu hôm nay nhân với hệ số trượt giá tích lũy theo tỷ lệ lạm phát hàng năm qua số năm tích lũy.",
      en: "Present expense multiplied by cumulative annual inflation factor over accumulation years."
    }
  },
  {
    key: "returnRate", label: { vi: "Lợi suất đầu tư kỳ vọng", en: "Expected investment return" },
    aliases: ["Lợi suất đầu tư kỳ vọng", "Lợi suất kỳ vọng", "Lợi suất đầu tư", "Expected Investment Return", "Expected return"],
    definition: {
      vi: "Mức sinh lời ước tính của danh mục đầu tư theo từng giai đoạn tích lũy và hưởng hưu, phản ánh cơ cấu phân bổ giữa tiền gửi, trái phiếu chính phủ, cổ phiếu và vàng.",
      en: "Estimated rate of return across accumulation and drawdown horizons, based on portfolio asset allocation."
    },
    formula: {
      symbolic: "Lợi suất danh mục = Σ (Tỷ trọng tài sản_i × Lợi suất kỳ vọng_i)",
      vi: "Lợi suất tổng hợp bằng tổng tỷ trọng của từng lớp tài sản nhân với lợi suất kỳ vọng của tài sản đó.",
      en: "Weighted sum of expected returns across all constituent asset classes in the portfolio."
    }
  },
  {
    key: "lifeExpectancy", label: { vi: "Tuổi kết thúc kế hoạch", en: "Plan end age" },
    aliases: ["Tuổi kết thúc kế hoạch", "Mốc kết thúc kế hoạch", "Tuổi thọ dự kiến", "Tuổi thọ", "Plan end age", "Planning life expectancy"],
    definition: {
      vi: "Mốc tuổi để tính thu chi đến cuối kế hoạch, không phải dự đoán tuổi thọ sinh học của bạn. Đây là chân trời hoạch định an toàn nhằm đảm bảo quỹ hưu trí không cạn kiệt trong suốt cuộc đời.",
      en: "The planning horizon age through which the model projects income and expenses; this is a safety margin for retirement cash flows, not a lifespan prediction."
    },
    formula: {
      symbolic: "Thời gian hưởng hưu (năm) = Tuổi kết thúc kế hoạch − Tuổi nghỉ hưu mục tiêu",
      vi: "Xác định toàn bộ số năm quỹ hưu trí cần chi trả thu nhập sinh hoạt.",
      en: "Total years across which the retirement fund must fund living cash flows."
    }
  },
  {
    key: "futureValue", label: { vi: "Chi tiêu lúc hưu (FV)", en: "Retirement expense (FV)" },
    aliases: ["Chi tiêu lúc hưu (FV):", "Chi tiêu lúc hưu (FV)", "Chi tiêu lúc hưu", "Chi tiêu tương lai", "Retirement expense (FV)", "Retirement expense (FV):", "Future monthly expense"],
    definition: {
      vi: "Số tiền bạn cần có mỗi tháng vào thời điểm chính thức nghỉ hưu để duy trì mức sống tương đương với chi tiêu mong muốn hôm nay, sau khi tính trượt giá lạm phát tích lũy.",
      en: "Monthly amount needed at the start of retirement to maintain equivalent living standard to today's budget, factoring in accumulated inflation."
    },
    formula: {
      symbolic: "Chi tiêu lúc hưu (FV) = Chi tiêu hôm nay (PV) × ∏ (1 + lạm phát_t)",
      vi: "Chi tiêu hôm nay nhân dồn với tỷ lệ lạm phát dự phóng qua từng năm tích lũy.",
      en: "Present expense compounded by annual projected inflation over the accumulation period."
    }
  },
  {
    key: "requiredFund", label: { vi: "Quỹ nghỉ hưu cần đạt (K)", en: "Target retirement fund" },
    aliases: [
      "QUỸ NGHỈ HƯU CẦN ĐẠT (K)", "QUỸ NGHỈ HƯU CẦN ĐẠT", "Quỹ nghỉ hưu cần đạt (K)",
      "Quỹ nghỉ hưu cần đạt", "Quỹ cần có khi nghỉ hưu", "Quỹ cần khi nghỉ hưu",
      "Target retirement fund", "TARGET RETIREMENT FUND (K)", "TARGET RETIREMENT FUND", "Retirement fund needed"
    ],
    definition: {
      vi: "Tổng số tiền cần có tại thời điểm bắt đầu nghỉ hưu để đảm bảo chi trả đầy đủ chi phí sinh hoạt cho suốt các năm hưởng hưu mà không bị thiếu hụt.",
      en: "Total fund required at retirement age to cover all living expenses and withdrawals through the end of the plan horizon."
    },
    formula: {
      symbolic: "Quỹ cần đạt = PV(toàn bộ chi tiêu hưu theo lạm phát và lợi suất)",
      vi: "Giá trị quy đổi tại thời điểm nghỉ hưu của toàn bộ nhu cầu rút tiền sinh hoạt hàng tháng trong suốt giai đoạn hưởng hưu.",
      en: "Present value at retirement date of all future retirement withdrawals discounted by portfolio return and inflation."
    }
  },
  {
    key: "pinnedAssumptions", label: { vi: "Giả định & Thời hạn kế hoạch", en: "Assumptions & Plan Horizon" },
    aliases: ["Giả định & Thời hạn kế hoạch", "Giả định và thời hạn kế hoạch", "Bộ giả định đã ghim", "Pinned assumptions", "Assumptions & Plan Horizon"],
    definition: {
      vi: "Bộ giả định vĩ mô (chuỗi lạm phát theo năm, tỷ suất sinh lời các nhóm tài sản) được phê duyệt và lưu giữ cùng phương án kế hoạch để kết quả minh bạch và có thể kiểm chứng lại.",
      en: "Versioned macroeconomic assumptions (annual inflation series, asset returns) pinned to the retirement plan for auditable and reproducible projections."
    },
    formula: {
      symbolic: "Dự phóng = Mô hình tài chính(Hồ sơ người dùng, Bộ giả định đã ghim)",
      vi: "Các tính toán tài chính dựa trên bộ giả định chuẩn hóa đã công bố, không tự ý thay đổi nếu bạn chưa chọn áp dụng phiên bản mới.",
      en: "Financial projections run on validated, published assumption series retained with your plan version."
    }
  },
];

export const glossaryAliases: Record<string, readonly string[]> = {
  inflation: ["Lạm phát dài hạn", "Long-Term Inflation", "Trượt giá lạm phát", "Inflation adjusted"],
  returnRate: ["Lợi suất đầu tư kỳ vọng", "Lợi suất kỳ vọng", "Lợi suất đầu tư", "Expected Investment Return", "Expected return"],
  lifeExpectancy: ["Tuổi kết thúc kế hoạch", "Tuổi thọ dự kiến", "Tuổi thọ", "Plan end age", "Planning life expectancy"],
  futureValue: ["Chi tiêu lúc hưu (FV)", "Chi tiêu lúc hưu (FV):", "Chi tiêu lúc hưu", "Chi tiêu tương lai", "Retirement expense (FV)", "Retirement expense (FV):", "Future monthly expense"],
  requiredFund: [
    "QUỸ NGHỈ HƯU CẦN ĐẠT (K)", "QUỸ NGHỈ HƯU CẦN ĐẠT", "Quỹ nghỉ hưu cần đạt (K)",
    "Quỹ nghỉ hưu cần đạt", "Quỹ cần có khi nghỉ hưu", "Quỹ cần khi nghỉ hưu",
    "Target retirement fund", "TARGET RETIREMENT FUND (K)", "TARGET RETIREMENT FUND", "Retirement fund needed"
  ],
  projectedFund: ["Quỹ dự kiến tích lũy", "Số tiền dự kiến có khi nghỉ hưu", "Projected accumulated fund"],
  initialRetirementCapital: ["Vốn hưu trí ban đầu", "Tiền có thể đưa vào quỹ lúc bắt đầu", "Initial fund capital (liquid)"],
  netWorth: ["Tổng tài sản trừ tổng nợ", "Overall net worth"],
  fundCoverage: ["Mức bao phủ quỹ", "Tỷ lệ đáp ứng quỹ"],
  requiredMonthlyContribution: ["Mức góp cần thiết / tháng", "Required contribution / month"],
  emergencyReserve: ["Quỹ dự phòng khẩn cấp", "Dự phòng cần có", "Dự phòng đã khai", "Required reserve", "Declared reserve"],
  essentialExpenses: ["Chi thiết yếu mỗi tháng", "Monthly essential expenses"],
  lossTolerance: ["Khả năng chịu lỗ", "Loss tolerance"],
  pinnedAssumptions: ["Giả định & Thời hạn kế hoạch", "Giả định và thời hạn kế hoạch", "Bộ giả định đã ghim"],
  glidePath: ["Risk reduction path"],
};

export function mergeExplanationTerms(serverTerms: GlossaryTerm[]): GlossaryTerm[] {
  const terms = new Map(productExplanations.map(term => [term.key, term]));
  for (const term of serverTerms) {
    const existing = terms.get(term.key);
    terms.set(term.key, {
      ...existing,
      ...term,
      formula: term.formula ?? existing?.formula,
      aliases: [...(existing?.aliases ?? []), ...(term.aliases ?? [])],
    });
  }
  return [...terms.values()].map(term => ({
    ...term,
    aliases: Array.from(new Set([...(term.aliases ?? []), ...(glossaryAliases[term.key] ?? [])]))
  }));
}


