import { Fragment } from "react";
import { useDiscoveryQuery } from "../hooks/useDiscoveryQuery";
import { useI18n } from "../i18n";
import { analyzeRisk, type ScenarioResult } from "../services/planningAnalysis";
import type { RetirementPreviewInput } from "../services/retirement";
import { financeMoney } from "../utils/financeHubSummary";
import ResponsiveDialog from "./ResponsiveDialog";

export default function AllocationScenarios({ plan, onClose }: { plan: RetirementPreviewInput | null; onClose: () => void }) {
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const query = useDiscoveryQuery(JSON.stringify(plan), signal => plan ? analyzeRisk("scenarios", { kind: "PREVIEW", preview: plan }, 1, undefined, signal, undefined, "ALLOCATION_V2") : Promise.resolve(null));
  const names: Record<string, string> = { HIGH_INFLATION: t("Lạm phát cao", "High inflation"), INCOME_LOSS: t("Mất thu nhập", "Income loss"), PROPERTY_ILLIQUIDITY: t("Bất động sản chậm thanh khoản", "Delayed property liquidity"), EQUITY_CRASH: t("Cổ phiếu giảm sâu", "Equity crash"), RATE_RISE: t("Lãi suất tăng", "Rising interest rates"), CREDIT: t("Rủi ro tín dụng", "Credit event"), GOLD: t("Giá vàng giảm", "Gold decline"), SEQUENCE_OF_RETURNS: t("Rủi ro thứ tự lợi suất", "Sequence of returns"), LONGEVITY: t("Sống lâu hơn", "Longer life") };
  const formatMonth = (m: string | null | undefined) => m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : "—";
  const formatOffset = (n: number) => n === 0 ? t("Tại mốc nghỉ hưu", "At retirement") : n < 0 ? t(`${Math.abs(n)} tháng trước nghỉ hưu`, `${Math.abs(n)} months before retirement`) : t(`${n} tháng sau nghỉ hưu`, `${n} months after retirement`);
  const rowLabel = (row: ScenarioResult) => {
    const parts: string[] = [];
    if (row.extraYears) parts.push(`+${row.extraYears} ${t("năm", "years")}`);
    if (row.level === "SEVERE" || row.severity === "SEVERE") parts.push(t("mức nặng", "severe"));
    if (!row.offsets?.length && typeof row.parameters?.offsetMonths === "number") parts.push(formatOffset(row.parameters.offsetMonths));
    const spread = row.parameters?.spreadPoints;
    if (row.kind === "GOLD" && (typeof spread === "number" || typeof spread === "string")) parts.push(t(`chênh giá mua/bán ${spread}%`, `buy/sell spread ${spread}%`));
    if (row.windowAdjusted) parts.push(t("đã điều chỉnh thời gian", "timing adjusted"));
    return `${names[row.kind ?? ""] ?? t("Tình huống", "Scenario")}${parts.length ? ` (${parts.join(" · ")})` : ""}`;
  };
  const verdict = (row: Pick<ScenarioResult, "status" | "result" | "issues">) => row.status === "NOT_APPLICABLE" ? t("Không áp dụng", "Not applicable")
    : row.status !== "READY" ? row.issues?.includes("SCENARIO_OUTSIDE_PLAN_HORIZON") ? t("Ngoài thời gian của kế hoạch", "Outside this plan's horizon") : t("Chưa có đủ tham số được duyệt", "Approved parameters required")
      : !row.result ? t("Chưa xác định", "Unavailable") : row.result.funded ? t("Đủ thiết yếu", "Essentials funded") : t("Có thiếu hụt", "Shortfall");
  const allRows: ScenarioResult[] = [...(query.data?.scenarios ?? []), ...(query.data?.longevity?.results ?? []).map(row => ({ ...row, kind: "LONGEVITY" }))];
  // A scenario without approved policy parameters is not something the customer can act on: list it once below the table
  // instead of a row that always reads "parameters required".
  const awaitingParameters = (row: ScenarioResult) => row.status === "REVIEW_REQUIRED" && !!row.issues?.includes("APPROVED_SCENARIO_PARAMETERS_REQUIRED");
  const rows = allRows.filter(row => !awaitingParameters(row));
  const pendingNames = [...new Set(allRows.filter(awaitingParameters).map(row => names[row.kind ?? ""] ?? t("Tình huống", "Scenario")))];
  return <ResponsiveDialog open={!!plan} onClose={onClose} title={t("Kiểm tra phương án trước biến cố", "Allocation stress scenarios")} className="user-workspace-dialog allocation-products-dialog">
    <p>{t("Dùng đúng tỷ trọng và dòng tiền của phương án đang xem. Mỗi tình huống có điều kiện riêng, không phải xác suất.", "Uses the displayed allocation and cash flows. Each scenario has its own parameters; these are not probabilities.")}</p>
    {query.loading && plan ? <p role="status">{t("Đang kiểm tra…", "Calculating…")}</p> : query.error ? <p role="alert">{query.error}</p> : query.data?.status === "LIMIT_EXCEEDED" ? <p role="alert">{t("Hệ thống đang bận với lượt mô phỏng khác. Hãy đóng hộp này và thử lại sau ít giây.", "The system is busy with another simulation. Close this dialog and retry in a few seconds.")}</p> : query.data?.status !== "READY" ? <p role="status">{t("Chưa đủ dòng tiền hoặc chính sách để thử tình huống.", "Cash flows or policy settings are incomplete for stress testing.")}</p> : rows.length === 0 ? null : <div className="allocation-comparison-scroll"><table className="allocation-scenarios"><thead><tr><th scope="col">{t("Tình huống", "Scenario")}</th><th scope="col">{t("Kết quả", "Result")}</th><th scope="col">{t("Tháng thiếu đầu tiên", "First shortfall")}</th><th scope="col">{t("Khoản thiếu thiết yếu (sức mua hôm nay)", "Essential shortfall (today's purchasing power)")}</th></tr></thead><tbody>
      {rows.map((row, i) => <Fragment key={`${row.kind}:${i}`}>
        <tr><th scope="row">{rowLabel(row)}</th><td>{verdict(row)}{row.offsets?.length ? <small>{t("Kết quả xấu nhất trong các thời điểm được thử", "Worst result across the tested timings")}</small> : null}</td><td>{formatMonth(row.firstShortfallMonth ?? row.result?.firstShortfallMonth)}</td><td>{financeMoney(row.result?.essentialLossToday ?? null, en)}</td></tr>
        {!!row.offsets?.length && <tr><td colSpan={4}><details><summary>{t(`Xem ${row.offsets.length} thời điểm sốc`, `View ${row.offsets.length} shock timings`)}</summary><table><thead><tr><th scope="col">{t("Thời điểm", "Timing")}</th><th scope="col">{t("Kết quả", "Result")}</th><th scope="col">{t("Tháng thiếu đầu tiên", "First shortfall")}</th><th scope="col">{t("Thiếu thiết yếu hôm nay", "Essential shortfall today")}</th></tr></thead><tbody>{row.offsets.map(offset => <tr key={offset.offsetMonths}><th scope="row">{formatOffset(offset.offsetMonths)}</th><td>{verdict(offset)}</td><td>{formatMonth(offset.firstShortfallMonth ?? offset.result?.firstShortfallMonth)}</td><td>{financeMoney(offset.result?.essentialLossToday ?? null, en)}</td></tr>)}</tbody></table></details></td></tr>}
        {row.kind === "SEQUENCE_OF_RETURNS" && row.status === "READY" && row.result?.lossFirstTerminalBalance !== undefined && <tr><td colSpan={4}><dl className="allocation-sequence-balances"><div><dt>{t("Lỗ trước, lãi sau: số dư cuối kỳ", "Loss first, gains later: ending balance")}</dt><dd>{financeMoney(row.result.lossFirstTerminalBalance, en)}</dd></div><div><dt>{t("Lãi trước, lỗ sau: số dư cuối kỳ", "Gains first, loss later: ending balance")}</dt><dd>{financeMoney(row.result.gainFirstTerminalBalance ?? null, en)}</dd></div><div><dt>{t("Chênh lệch số dư cuối kỳ", "Difference in ending balances")}</dt><dd>{financeMoney(row.result.balanceDifference ?? null, en)}</dd></div></dl><p>{t("Hai thứ tự dùng cùng tập lợi suất; thời điểm lỗ khác nhau làm số tiền còn lại khác nhau khi có rút chi tiêu.", "Both orders use the same set of returns; the timing of losses changes the amount left when spending is withdrawn.")}</p></td></tr>}
      </Fragment>)}
    </tbody></table></div>}
    {query.data?.status === "READY" && pendingNames.length > 0 && <p className="allocation-result-footnote" data-testid="scenarios-awaiting-parameters">{t(`Chưa chạy vì chưa có tham số được duyệt: ${pendingNames.join(", ")}.`, `Not run until approved parameters exist: ${pendingNames.join(", ")}.`)}</p>}
  </ResponsiveDialog>;
}
