import type { CapitalSeparation } from "../capital/separation";
import type { LossConstraint } from "../capital/loss-constraint";
import { RetirementDecimal as D } from "../retirement/engine";
import type { FeeRow } from "../retirement/advisory-fee";
import type { essentialCoverage } from "../retirement/preview-insights";
import type { PlanPreview } from "../retirement/upgrade";
import type { RetirementService } from "../retirement/service";
import { normalizedAnnualReturn } from "../assumptions/series";
import { addMonths } from "../../common/calendar";
import type { ExplanationDetail } from "./schema";

export const METRIC_KEYS = [
  "summary.atRetirement.requiredFund", "summary.atRetirement.projectedFund", "summary.atRetirement.fundingGap", "summary.atRetirement.coveragePercent",
  "summary.requiredConstantMonthlyContribution", "summary.additionalMonthlyContribution", "summary.futureMonthlyExpense", "summary.initialRetirementCapital",
  "capitalSeparation.requiredEmergencyReserve", "capitalSeparation.nearTermGoalsPresentValue", "capitalSeparation.growthCapital",
  "lossConstraint.lossAmount", "essentialCoverage.essentialShortfall",
] as const;
export const METRIC_KEY_PATTERN = new RegExp(`^(?:${METRIC_KEYS.map(key => key.replaceAll(".", "\\.")).join("|")}|rows\\.\\d{4}-(?:0[1-9]|1[0-2])\\.advisoryFeeAmount)$`);
export type ExplanationCapture = Awaited<ReturnType<RetirementService["capture"]>>;
export type ExplanationPreview = PlanPreview & {
  capitalSeparation?: CapitalSeparation; lossConstraint?: LossConstraint;
  essentialCoverage?: ReturnType<typeof essentialCoverage>;
};
type Localized = { vi: string; en: string };
export type MetricExplanation = {
  metricKey: string; detail: ExplanationDetail; label: Localized; value: string; unit: string;
  formula: Localized & { symbolic: string };
  steps: Array<{ label: Localized; value: string; unit: string; source: string }>;
  assumptions: { version: number; sources: PlanPreview["sources"] };
  notes: string[]; limitations: string[];
};

/** Read-only presentation of authoritative server results. Nothing here changes
 * numerical kernels, replay inputs, persisted snapshots or their hashes. */
/** `SUMMARY` folds month-by-month inputs into a few totals for a small popup;
 * `MONTHLY` lists every month so the value can be recomputed step by step. */
export function explainMetric(metricKey: string, preview: ExplanationPreview, capture: ExplanationCapture, detail: ExplanationDetail): MetricExplanation | null {
  if (!METRIC_KEY_PATTERN.test(metricKey)) return null;
  const steps: MetricExplanation["steps"] = [], notes: string[] = [];
  const add = (vi: string, en: string, value: string | number, unit: string, source: string) =>
    steps.push({ label: { vi, en }, value: String(value), unit, source });
  const result = (vi: string, en: string, value: string | null | undefined, unit: string, wordVi: string, wordEn: string, symbolic: string): MetricExplanation | null =>
    value === null || value === undefined ? null : { metricKey, detail, label: { vi, en }, value, unit, formula: { vi: wordVi, en: wordEn, symbolic }, steps,
      assumptions: { version: preview.references.assumptionVersion, sources: preview.sources }, notes,
      limitations: [...(preview.calculation?.limitations ?? []), "EXPLANATION_USES_PINNED_SERVER_VALUES", "DISPLAY_ROUNDING_ONLY"] };
  const calculation = preview.calculation, replay = preview.replayInput, capital = preview.capitalSeparation;
  const summary = calculation?.summary;
  const money = (vi: string, en: string, value: string, source: string) => add(vi, en, value, "VND", source);
  const summaryNote = "Bản tóm tắt cộng gộp các tháng để dễ đọc. Giá trị được tính lần lượt từng tháng; xem chi tiết từng tháng để tái tạo chính xác.";
  const period = (vi: string, en: string, first: string, last: string, months: number, source: string) => {
    add(vi, en, `${first} → ${last}`, "PERIOD", source);
    add("Số tháng", "Number of months", months, "MONTHS", source);
  };

  if (metricKey === "capitalSeparation.requiredEmergencyReserve") {
    if (!capital || capital.requiredEmergencyReserve === null || capital.essentialMonthlyExpense === null || capital.reserveMonths === null) return null;
    money("Chi thiết yếu mỗi tháng", "Monthly essential spending", capital.essentialMonthlyExpense, "capitalSeparation.essentialMonthlyExpense");
    add("Số tháng dự phòng theo độ ổn định thu nhập đã khai", "Reserve months for declared income stability", capital.reserveMonths, "MONTHS", "capitalSeparation.reserveMonths");
    return result("Dự phòng cần có", "Required emergency reserve", capital.requiredEmergencyReserve, "VND",
      "Chi thiết yếu mỗi tháng nhân số tháng dự phòng của mô hình.", "Monthly essential spending multiplied by model reserve months.", "R = E × m");
  }
  if (metricKey === "capitalSeparation.nearTermGoalsPresentValue") {
    if (!capital || capital.nearTermGoalsPresentValue === null) return null;
    for (const [index, goal] of capital.goals.entries()) {
      if (goal.treatment !== "RESERVED") continue;
      if (goal.futureAmount === null || goal.presentValue === null) return null;
      money(`${goal.id}: số tiền tại hạn mục tiêu`, `${goal.id}: amount due at the goal date`, goal.futureAmount, `capitalSeparation.goals[${index}].futureAmount`);
      if (goal.monthsUntilDue === 0 || new D(goal.futureAmount).isZero()) continue;
      const assumptions = capture.assumptions.data;
      const horizons = assumptions.assetClasses.filter(asset => asset.code === "CASH").flatMap(asset => asset.horizons)
        .filter(horizon => horizon.minMonths <= goal.monthsUntilDue && goal.monthsUntilDue <= horizon.maxMonths);
      if (horizons.length !== 1) return null;
      for (let elapsed = 0; elapsed < goal.monthsUntilDue;) {
        const month = addMonths(capital.valuationMonth, elapsed), year = Number(month.slice(0, 4));
        const count = Math.min(goal.monthsUntilDue - elapsed, 13 - Number(month.slice(5, 7)));
        const returns = assumptions.returns.map((row, i) => ({ row, i })).filter(({ row }) => row.year === year && row.assetClass === "CASH" && row.horizonId === horizons[0].id);
        const inflation = assumptions.inflation.map((row, i) => ({ row, i })).filter(({ row }) => row.year === year);
        if (returns.length !== 1 || inflation.length !== 1) return null;
        const rate = normalizedAnnualReturn(returns[0].row, inflation[0].row.percent);
        if (rate === null) return null;
        add(`${goal.id}, ${year}: lợi suất tiền gửi ròng năm`, `${goal.id}, ${year}: net annual deposit return`, rate.mul(100).toFixed(), "PERCENT",
          `normalizedAnnualReturn(capture.assumptions.data.returns[${returns[0].i}], capture.assumptions.data.inflation[${inflation[0].i}].percent); sourceId=${returns[0].row.sourceId}`);
        add(`${goal.id}, ${year}: số tháng chiết khấu`, `${goal.id}, ${year}: discount months`, count, "MONTHS", `capitalSeparation.goals[${index}].monthsUntilDue; segment=${month}`);
        elapsed += count;
      }
    }
    notes.push("Chỉ cộng mục tiêu được RESERVED (hạn trong 60 tháng). Số tiền tại hạn đã bao gồm lạm phát của từng mục tiêu; không cộng lại vốn mục tiêu đã khai.");
    return result("Giá trị hiện tại của mục tiêu gần hạn", "Near-term goals present value", capital.nearTermGoalsPresentValue, "VND",
      "Chiết khấu số tiền tại hạn của từng mục tiêu bằng lợi suất tiền gửi ròng đã ghim, rồi cộng lại.",
      "Discount each reserved goal amount using pinned net deposit returns, then add the present values.", "PV = Σg [F_g / Πy (1 + r_g,y / 100)^(m_g,y / 12)]");
  }
  if (metricKey === "capitalSeparation.growthCapital") {
    if (!capital || capital.growthCapital === null || capital.investableLiquidAssets === null || capital.requiredEmergencyReserve === null || capital.nearTermGoalsPresentValue === null) return null;
    money("Tổng tài sản thanh khoản có thể phân bổ", "Total investable liquid assets", capital.investableLiquidAssets, "capitalSeparation.investableLiquidAssets");
    money("Dự phòng cần có", "Required emergency reserve", capital.requiredEmergencyReserve, "capitalSeparation.requiredEmergencyReserve");
    money("Giá trị hiện tại mục tiêu gần hạn", "Near-term goals present value", capital.nearTermGoalsPresentValue, "capitalSeparation.nearTermGoalsPresentValue");
    notes.push("Kết quả có thể âm khi vốn bảo vệ lớn hơn tài sản thanh khoản. Phân tách này chỉ cung cấp thông tin, không đổi vốn đầu kỳ của dự báo.");
    return result("Vốn tăng trưởng", "Growth capital", capital.growthCapital, "VND", "Tài sản thanh khoản trừ dự phòng cần có và vốn dành cho mục tiêu gần hạn.",
      "Investable liquid assets minus the required reserve and near-term goals present value.", "G = A − R − PV");
  }
  if (metricKey === "lossConstraint.lossAmount") {
    const loss = preview.lossConstraint, stress = capture.policy.data.schemaVersion === 2 ? capture.policy.data.lossStress : undefined;
    const holdings = calculation?.marketRows[0]?.holdings;
    if (!loss || loss.lossAmount === null || loss.growthCapital === null || !stress || !holdings?.length) return null;
    money("Vốn tăng trưởng chịu cú sốc", "Growth capital exposed to stress", loss.growthCapital, "lossConstraint.growthCapital");
    for (const [index, holding] of holdings.entries()) {
      const shockIndex = stress.shocks.findIndex(shock => shock.assetClass === holding.assetClass);
      if (shockIndex < 0) return null;
      add(`${holding.assetClass}: tỷ trọng đầu kỳ`, `${holding.assetClass}: opening weight`, holding.startWeightPercent, "PERCENT", `calculation.marketRows[0].holdings[${index}].startWeightPercent`);
      add(`${holding.assetClass}: biến động trong cú sốc`, `${holding.assetClass}: stress return`, stress.shocks[shockIndex].percent, "PERCENT", `capture.policy.data.lossStress.shocks[${shockIndex}].percent`);
    }
    notes.push("Đây là mức lỗ theo cú sốc của chính sách đã ghim, không phải dự báo thị trường hay xác suất mất tiền. Danh mục đề xuất giảm rủi ro chưa được áp dụng.");
    return result("Mức lỗ khi có cú sốc", "Stress loss amount", loss.lossAmount, "VND", "Vốn tăng trưởng nhân tổng tỷ trọng từng tài sản và mức giảm của tài sản trong cú sốc.",
      "Growth capital multiplied by the weighted loss under pinned asset stress returns.", "L = G × Σa [w_a × (−s_a) / 100] / 100");
  }
  if (metricKey === "essentialCoverage.essentialShortfall") {
    const essential = preview.essentialCoverage;
    if (!essential || essential.essentialShortfall === null || !calculation || essential.rows.length !== calculation.rows.length) return null;
    if (detail === "SUMMARY" && essential.rows.length) {
      if (essential.rows.some(row => row.essentialExpense === null || row.essentialShortfall === null)) return null;
      const range = `essentialCoverage.rows[0..${essential.rows.length - 1}]`;
      period("Giai đoạn kiểm tra", "Checked period", essential.rows[0].month, essential.rows.at(-1)!.month, essential.rows.length, range);
      money("Tổng chi thiết yếu", "Total essential spending", essential.rows.reduce((sum, row) => sum.plus(row.essentialExpense!), new D(0)).toFixed(), `Σ ${range}.essentialExpense`);
      add("Số tháng thiếu chi thiết yếu", "Months with an essential shortfall", essential.rows.filter(row => new D(row.essentialShortfall!).gt(0)).length, "MONTHS", `${range}.essentialShortfall > 0`);
      if (essential.firstEssentialShortfallMonth) add("Tháng đầu tiên thiếu", "First shortfall month", essential.firstEssentialShortfallMonth, "MONTH", "essentialCoverage.firstEssentialShortfallMonth");
      notes.push(summaryNote);
    } else {
      for (const [index, row] of essential.rows.entries()) {
        if (row.essentialExpense === null || row.essentialShortfall === null) return null;
        const calculated = calculation.rows[index];
        money(`${row.month}: chi thiết yếu`, `${row.month}: essential spending`, row.essentialExpense, `essentialCoverage.rows[${index}].essentialExpense`);
        for (const [key, vi, en] of [
          ["income", "thu nhập", "income"], ["pension", "lương hưu", "pension"], ["fundedClosingBalance", "quỹ thực có cuối kỳ", "funded closing balance"],
          ["withdrawal", "khoản rút cần có", "required withdrawal"], ["unfundedWithdrawal", "khoản rút thiếu nguồn", "unfunded withdrawal"],
        ] as const) money(`${row.month}: ${vi}`, `${row.month}: ${en}`, calculated[key], `calculation.rows[${index}].${key}`);
      }
    }
    notes.push("Phân loại thiếu hụt ưu tiên chi thiết yếu. Khoản chi sinh hoạt hưu trí được tính là thiết yếu; không phải tỷ lệ xác suất đủ tiền.");
    return result("Tổng thiếu hụt chi thiết yếu", "Total essential spending shortfall", essential.essentialShortfall, "VND",
      "Mỗi tháng lấy phần chi thiết yếu còn thiếu sau thu nhập, lương hưu và quỹ có thể dùng, giới hạn bởi tổng khoản rút thiếu nguồn; cộng tất cả các tháng.",
      "Add monthly essential spending deficits after income, pension and available funded capital, capped by each month's unfunded withdrawal.",
      "F_t = fundedClosing_t + W_t − U_t; S = Σt min(U_t, max(0, E_t − I_t − P_t − F_t))");
  }
  if (!summary || !calculation || !replay) return null;
  const n = summary.accumulationMonths;
  const rowSteps = (from: number, through: number, fields: Array<["growthFactor" | "contribution" | "capitalInjection" | "withdrawal", string, string]>) => {
    if (detail === "SUMMARY") {
      if (through <= from) return;
      const range = `replayInput.rows[${from}..${through - 1}]`, rows = replay.rows.slice(from, through);
      period("Giai đoạn", "Period", rows[0].month, rows.at(-1)!.month, rows.length, range);
      for (const [key, vi, en] of fields) {
        if (key === "growthFactor") add("Hệ số tăng trưởng lũy kế", "Cumulative growth factor",
          rows.reduce((product, row) => product.mul(row.growthFactor), new D(1)).toSignificantDigits(15).toFixed(), "FACTOR", `Π ${range}.growthFactor`);
        else money(`Tổng ${vi}`, `Total ${en}`, rows.reduce((sum, row) => sum.plus(row[key]), new D(0)).toFixed(), `Σ ${range}.${key}`);
      }
      notes.push(summaryNote);
      return;
    }
    for (let i = from; i < through; i++) for (const [key, vi, en] of fields)
      add(`${replay.rows[i].month}: ${vi}`, `${replay.rows[i].month}: ${en}`, replay.rows[i][key], key === "growthFactor" ? "FACTOR" : "VND", `replayInput.rows[${i}].${key}`);
  };
  const allFlows: Parameters<typeof rowSteps>[2] = [["growthFactor", "hệ số tăng trưởng", "growth factor"], ["contribution", "góp thực tế trong mô hình", "modeled funded contribution"],
    ["capitalInjection", "vốn được giải phóng cuối tháng", "capital released at month end"], ["withdrawal", "khoản rút cuối tháng", "month-end withdrawal"]];
  const timingSteps = () => {
    add("Thời điểm góp", "Contribution timing", replay.contributionTiming, "TIMING", "replayInput.contributionTiming");
    add("Tháng bắt đầu được góp", "First eligible contribution month", replay.contributionStartMonth ?? replay.valuationDate.slice(0, 7), "MONTH", "replayInput.contributionStartMonth ?? replayInput.valuationDate[0:7]");
    if (replay.contributionTiming === "START_OF_MONTH_RESEARCH") notes.push("Phiên bản v2 đã lưu dùng START_OF_MONTH_RESEARCH: trong công thức, START nghĩa là góp đầu tháng của nhánh nghiên cứu cũ; không áp dụng quy ước v3 vào bản cũ.");
  };

  if (metricKey === "summary.atRetirement.requiredFund") {
    money("Số dư mong muốn cuối kế hoạch", "Target end-of-plan balance", replay.terminalBalance, "replayInput.terminalBalance");
    rowSteps(n, replay.rows.length, allFlows);
    notes.push("Tính ngược từng tháng hưu trí, không vay trước một khoản thu trong tương lai. Vì vậy đây có thể lớn hơn PV đại số chỉ xét cuối kỳ.");
    return result("Quỹ cần khi nghỉ hưu", "Required fund at retirement", summary.atRetirement.requiredFund, "VND",
      "Từ số dư mục tiêu cuối kỳ, cộng khoản rút, trừ khoản góp và vốn giải phóng, chia hệ số tăng trưởng; chặn dưới bằng 0 rồi lùi từng tháng tới tháng nghỉ hưu.",
      "Work backward from the terminal target: add withdrawals, subtract contributions and released capital, divide by growth, and floor at zero every retirement month.",
      "K_T = terminal; K_(t−1) = max(0, (K_t + W_t − C_t − J_t) / G_t), t = T…h");
  }
  if (metricKey === "summary.atRetirement.projectedFund") {
    money("Vốn đầu kỳ của dự báo", "Opening projection capital", replay.initialCapital, "replayInput.initialCapital");
    timingSteps(); rowSteps(0, n, allFlows);
    return result("Quỹ dự kiến khi nghỉ hưu", "Projected fund at retirement", summary.atRetirement.projectedFund, "VND",
      "Bắt đầu từ vốn đầu kỳ, lần lượt cộng góp theo đúng thời điểm, nhân tăng trưởng, cộng vốn giải phóng và trừ khoản rút trong từng tháng tích lũy.",
      "Roll opening capital through accumulation, applying contribution timing, growth, released capital and withdrawals in order.",
      "B_0 = initial; B_t = (B_(t−1) + C_start,t) × G_t + C_end,t + J_t − W_t; projected = B_h");
  }
  if (metricKey === "summary.atRetirement.fundingGap" || metricKey === "summary.atRetirement.coveragePercent") {
    money("Quỹ cần khi nghỉ hưu", "Required fund at retirement", summary.atRetirement.requiredFund, "calculation.summary.atRetirement.requiredFund");
    money("Quỹ dự kiến khi nghỉ hưu", "Projected fund at retirement", summary.atRetirement.projectedFund, "calculation.summary.atRetirement.projectedFund");
    return metricKey.endsWith("fundingGap") ? result("Khoảng thiếu hụt khi nghỉ hưu", "Funding gap at retirement", summary.atRetirement.fundingGap, "VND",
      "Quỹ cần trừ quỹ dự kiến; kết quả âm nghĩa là vượt quỹ cần.", "Required fund minus projected fund; a negative gap means a surplus.", "gap = required − projected")
      : result("Độ phủ khi nghỉ hưu", "Retirement funding coverage", summary.atRetirement.coveragePercent, "PERCENT",
        "Quỹ dự kiến chia quỹ cần, nhân 100. Không xác định khi quỹ cần bằng 0.", "Projected fund divided by required fund, multiplied by 100; undefined when the required fund is zero.", "coverage = projected / required × 100 (required > 0)");
  }
  if (metricKey === "summary.requiredConstantMonthlyContribution" || metricKey === "summary.additionalMonthlyContribution") {
    const additional = metricKey === "summary.additionalMonthlyContribution";
    const value = additional ? summary.additionalMonthlyContribution : summary.requiredConstantMonthlyContribution;
    if (value === null) return null;
    money("Vốn đầu kỳ", "Opening capital", replay.initialCapital, "replayInput.initialCapital");
    money("Quỹ cần khi nghỉ hưu", "Required fund at retirement", summary.atRetirement.requiredFund, "calculation.summary.atRetirement.requiredFund");
    timingSteps(); rowSteps(0, n, allFlows);
    notes.push("Mức góp hằng tháng là nghiệm lý thuyết theo các dòng tiền đã ghim; cần xem riêng khả năng góp thực tế. Phí đang có được giữ theo lịch đã tính, cần chạy lại preview nếu đổi mức góp.");
    return result(additional ? "Mức góp thêm mỗi tháng" : "Mức góp đều cần mỗi tháng", additional ? "Additional monthly contribution" : "Required constant monthly contribution", value, "VND",
      additional ? "Tính hệ số tích lũy của một đồng góp mỗi tháng. Lấy mức góp thêm lớn nhất để không thiếu vốn ở mỗi tháng tích lũy và đạt quỹ cần khi nghỉ hưu, so với lịch góp đang có."
        : "Tính quỹ nếu không góp và hệ số tích lũy của một đồng góp mỗi tháng. Lấy mức góp lớn nhất để không thiếu vốn mỗi tháng tích lũy và đạt quỹ cần khi nghỉ hưu.",
      additional ? "Use the accumulated value of one unit contributed monthly; take the largest extra contribution needed for every accumulation month and the retirement target, on top of existing deposits."
        : "Compute capital without contributions and the accumulated value of one unit contributed monthly; take the largest contribution needed for each accumulation month and the retirement target.",
      `A_0 = initial; A_t = A_(t−1)G_t + J_t − W_t; k_0 = 0; k_t = k_(t−1)G_t + w_t; w_t = 0 before eligibility, G_t at START, 1 at END; ${additional ? "B_t = (B_(t−1) + C_start,t)G_t + C_end,t + J_t − W_t; extra = max(0, max_t(−B_t/k_t), (required − B_h)/k_h)" : "requiredMonthly = max(0, max_t(−A_t/k_t), (required − A_h)/k_h)"} (k_t > 0)`);
  }
  if (metricKey === "summary.futureMonthlyExpense") {
    if (preview.modelVersion === "retirement-monthly-v4") {
      const cells = preview.calculation!.attribution.filter(cell => cell.month === summary.retirementMonth && cell.metric === "livingExpense");
      cells.forEach(cell => money(`${cell.sourceId}: chi sinh hoạt tháng hưu`, `${cell.sourceId}: retirement-month living expense`, cell.amount,
        `calculation.attribution[sourceHash=${cell.sourceHash},month=${cell.month},metric=livingExpense]`));
      return result("Chi sinh hoạt tháng đầu nghỉ hưu", "First retirement month living expense", summary.futureMonthlyExpense, "VND",
        "Cộng các nguồn chi sinh hoạt đang có hiệu lực trong tháng nghỉ hưu theo sổ nguồn đã ghim.", "Add active living-expense source cells in the retirement month from the pinned source registry.", "E_h = Σs E_(s,h)");
    }
    if (preview.reforecast || preview.futureChanges?.length || preview.sourceChanges?.length) {
      money("Chi sinh hoạt tháng hưu đã ghim", "Pinned retirement-month living expense", replay.rows[n].livingExpense, `replayInput.rows[${n}].livingExpense`);
      notes.push("Bản cập nhật giữ số chi sinh hoạt danh nghĩa trong lịch nguồn đã ghim; không lấy lại số tiền hôm nay từ hồ sơ hiện tại.");
      return result("Chi sinh hoạt tháng đầu nghỉ hưu", "First retirement month living expense", summary.futureMonthlyExpense, "VND",
        "Lấy khoản chi sinh hoạt danh nghĩa của tháng hưu trong đầu vào tính lại đã lưu.", "Read the nominal living expense for the retirement month from the saved replay input.", "E_h = pinnedLivingExpense_h");
    }
    money("Chi sinh hoạt hưu theo giá hôm nay", "Retirement living expense in today's prices", preview.selection.monthlyExpenseToday, "selection.monthlyExpenseToday");
    if (detail === "SUMMARY") {
      if (n > 0) add("Hệ số lạm phát lũy kế tới tháng nghỉ hưu", "Cumulative inflation factor to retirement",
        replay.rows.slice(0, n).reduce((product, row) => product.mul(row.inflationFactor), new D(1)).toFixed(), "FACTOR", `Π replayInput.rows[0..${n - 1}].inflationFactor`);
    } else for (let i = 0; i < n; i++) add(`${replay.rows[i].month}: hệ số lạm phát tháng`, `${replay.rows[i].month}: monthly inflation factor`, replay.rows[i].inflationFactor, "FACTOR", `replayInput.rows[${i}].inflationFactor`);
    return result("Chi sinh hoạt tháng đầu nghỉ hưu", "First retirement month living expense", summary.futureMonthlyExpense, "VND",
      "Chi sinh hoạt hưu theo giá hôm nay nhân lần lượt các hệ số lạm phát trước tháng nghỉ hưu.", "Today's retirement living expense multiplied by monthly inflation factors before retirement.", "E_h = E_today × Π_(t<h) inflationFactor_t");
  }
  if (metricKey === "summary.initialRetirementCapital") {
    if (preview.reforecast) {
      const index = preview.reforecast.actualRevisions.findIndex(row => row.period === preview.reforecast!.throughMonth);
      const actual = preview.reforecast.actualRevisions[index];
      if (!actual || !new D(actual.closingBalance).eq(replay.initialCapital)) return null;
      money(`Số dư thực tế cuối ${actual.period}`, `Actual closing balance for ${actual.period}`, actual.closingBalance, `reforecast.actualRevisions[${index}].closingBalance`);
      return result("Vốn đầu kỳ của dự báo", "Opening retirement projection capital", summary.initialRetirementCapital, "VND",
        "Số dư thực tế tại tháng chốt được chuyển nguyên vẹn thành vốn đầu kỳ của dự báo cập nhật.", "The pinned actual closing balance at the cutoff is carried forward as opening reforecast capital.", "initial = actualClosing_throughMonth");
    }
    const profile = capture.profile, assets = profile.assets.status === "KNOWN" ? profile.assets.entries : [];
    if (profile.assets.status === "UNKNOWN") return null;
    for (const [index, asset] of assets.entries()) {
      if (["PRIMARY_HOME", "REAL_ESTATE"].includes(asset.type) || (asset.retirementShare.status === "KNOWN" && new D(asset.retirementShare.value).isZero()) ||
        (asset.liquidity.status === "KNOWN" && asset.liquidity.value !== "LIQUID") ||
        (asset.availableFromMonth.status === "KNOWN" && asset.availableFromMonth.value > profile.valuationDate.slice(0, 7))) continue;
      const overrideIndex = preview.selection.whatIf?.assetValues?.findIndex(row => row.assetId === asset.id) ?? -1;
      const override = overrideIndex >= 0 ? preview.selection.whatIf!.assetValues![overrideIndex] : undefined;
      if ((!override && asset.value.status !== "KNOWN") || asset.ownershipShare.status !== "KNOWN" || asset.retirementShare.status !== "KNOWN" ||
        asset.currency !== "VND" || asset.valuedOn.status !== "KNOWN" || asset.valuedOn.value !== profile.valuationDate || asset.liquidity.status !== "KNOWN" || asset.availableFromMonth.status !== "KNOWN") return null;
      money(`${asset.id}: giá trị tài sản`, `${asset.id}: asset value`, override?.value ?? (asset.value.status === "KNOWN" ? asset.value.value : "0"),
        override ? `selection.whatIf.assetValues[${overrideIndex}].value` : `capture.profile.assets.entries[${index}].value.value`);
      add(`${asset.id}: phần sở hữu`, `${asset.id}: ownership share`, asset.ownershipShare.value, "FACTOR", `capture.profile.assets.entries[${index}].ownershipShare.value`);
      add(`${asset.id}: phần dành cho hưu trí`, `${asset.id}: retirement share`, asset.retirementShare.value, "FACTOR", `capture.profile.assets.entries[${index}].retirementShare.value`);
    }
    notes.push("Chỉ cộng tài sản thanh khoản có thể dùng tại ngày định giá, đúng phần sở hữu và phần hưu trí. Bất động sản, vốn mở khóa sau này và tài sản bị khóa không được cộng.");
    return result("Vốn đầu kỳ dành cho hưu trí", "Initial retirement capital", summary.initialRetirementCapital, "VND",
      "Cộng giá trị từng tài sản đủ điều kiện, nhân phần sở hữu và phần dành cho hưu trí.", "Add eligible liquid asset values multiplied by ownership and retirement shares.", "initial = Σa value_a × ownershipShare_a × retirementShare_a");
  }
  const feeMonth = /^rows\.(\d{4}-(?:0[1-9]|1[0-2]))\.advisoryFeeAmount$/.exec(metricKey)?.[1];
  const index = replay.rows.findIndex(row => row.month === feeMonth), row = replay.rows[index] as FeeRow | undefined, fee = preview.selection.advisoryFee;
  if (!feeMonth || !row || !fee || row.advisoryFeeAmount === undefined || row.advisoryFeeAverageFund === undefined) return null;
  money("Quy mô quỹ bình quân làm căn cứ tính phí", "Average fund used for the fee", row.advisoryFeeAverageFund, `replayInput.rows[${index}].advisoryFeeAverageFund`);
  add("Tỷ lệ phí tư vấn mỗi năm", "Annual advisory fee rate", fee.annualPercent, "PERCENT", "selection.advisoryFee.annualPercent");
  notes.push(`Phí tháng ${feeMonth}; nguồn trả ${row.advisoryFeePaidFrom ?? fee.paidFrom}. Quy mô bình quân là trung bình quỹ thực có đầu kỳ và cuối kỳ trước phí, chặn quỹ cuối kỳ dưới bằng 0; đây là dịch vụ tư vấn bổ sung.`);
  return result(`Phí tư vấn tháng ${feeMonth}`, `Advisory fee for ${feeMonth}`, row.advisoryFeeAmount, "VND",
    "Quy mô quỹ bình quân trước phí nhân tỷ lệ phí năm, chia 100 và chia 12 tháng.", "Average funded capital before the fee multiplied by the annual percentage rate, divided by 100 and 12 months.", "fee_t = averageFund_t × (annualPercent / 100 / 12)");
}
