import { useState } from "react";
import { Link } from "react-router";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import type { LiquidityReconciliationItem, ObligationRow } from "../services/allocationWorkspace";
import { financeMoney } from "../utils/financeHubSummary";

const month = (value: string | null) => value ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : "—";

export function AllocationObligations({ rows, en }: { rows: ObligationRow[]; en: boolean }) {
  if (!rows.length) return null;
  const t = (vi: string, english: string) => en ? english : vi;
  return <details className="allocation-disclosure allocation-obligations">
    <summary>{t("Các khoản cần chi theo thứ tự ưu tiên", "Spending commitments by priority")}</summary>
    <p>{t("Các khoản dưới đây được xếp theo thứ tự bảo vệ tiền trong kế hoạch. Số tiền là tổng trong thời gian được hiển thị, không phải số tiền cần giữ riêng hôm nay.", "These commitments are ordered by protection priority. Amounts are totals over the displayed periods, not amounts to reserve today.")}</p>
    <div className="allocation-comparison-scroll" role="region" tabIndex={0} aria-label={t("Lịch chi theo ưu tiên", "Commitment schedule")}>
      <table><thead><tr><th scope="col">{t("Ưu tiên", "Priority")}</th><th scope="col">{t("Khoản chi", "Commitment")}</th><th scope="col">{t("Thời gian", "Period")}</th><th scope="col">{t("Tổng dự kiến", "Projected total")}</th></tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.kind}:${row.id}`}><td>{row.priorityRank}</td><th scope="row">{row.label}{row.deferrable && <small>{t("Có thể lùi thời điểm", "Can be deferred")}</small>}</th><td>{month(row.firstMonth)}{row.lastMonth && row.lastMonth !== row.firstMonth ? ` – ${month(row.lastMonth)}` : ""}</td><td>{row.totalNominal === null ? t("Tính khi có lịch chi tiết", "Calculated with the detailed schedule") : financeMoney(row.totalNominal, en)}</td></tr>)}</tbody>
      </table>
    </div>
  </details>;
}

/** Matching requires a customer choice; suggestions never change their profile automatically. */
export function AllocationLiquidityReconciliation({ rows, en }: { rows: LiquidityReconciliationItem[]; en: boolean }) {
  const { v2Profile, updateProfileV2, saveStatus } = useFinancialProfile();
  const [problem, setProblem] = useState("");
  if (!rows.length) return null;
  const t = (vi: string, english: string) => en ? english : vi;
  const saving = saveStatus === "saving";
  const match = async (row: LiquidityReconciliationItem, goalId?: string) => {
    const need = v2Profile?.liquidityNeeds?.[row.horizonKey];
    if (saving || need?.status !== "KNOWN") return;
    setProblem("");
    const { matchedGoalId: _previous, ...declaration } = need;
    const ok = await updateProfileV2({ liquidityNeeds: { ...v2Profile?.liquidityNeeds, [row.horizonKey]: { ...declaration, ...(goalId ? { matchedGoalId: goalId } : {}) } } });
    if (!ok) setProblem(t("Chưa lưu được xác nhận. Hãy tải lại hồ sơ rồi thử lại.", "Could not save the confirmation. Reload your profile and retry."));
  };
  const goalLabel = (id: string) => v2Profile?.goals?.status === "KNOWN" ? v2Profile.goals.entries.find(goal => goal.id === id)?.label : undefined;
  return <section className="allocation-liquidity-review" aria-label={t("Đối chiếu nhu cầu tiền với mục tiêu", "Match cash needs with goals")}>
    <h3>{t("Khoản cần dùng đã nằm trong mục tiêu nào?", "Which goals already include these cash needs?")}</h3>
    <p>{t("Chỉ xác nhận khi hai khai báo nói về cùng một khoản tiền để tránh tính hai lần. Gợi ý chưa được tự động khớp.", "Confirm only when both declarations refer to the same money, to avoid counting it twice. Suggestions are not matched automatically.")}</p>
    {rows.map(row => <div key={row.horizonKey} className="allocation-liquidity-item">
      <strong>{t(`Trong ${row.horizonMonths / 12} năm tới`, `Within ${row.horizonMonths / 12} years`)} · {financeMoney(row.amount, en)}</strong>
      {row.matchedGoalId ? <><p role="status">{t("Đã xác nhận cùng khoản với", "Confirmed as the same need as")} <strong>{goalLabel(row.matchedGoalId) ?? t("mục tiêu đã lưu", "a saved goal")}</strong>.</p><button type="button" className="remaining-text" disabled={saving} onClick={() => void match(row)}>{t("Bỏ xác nhận trùng", "Remove match")}</button></>
        : row.suggestions.length ? <ul>{row.suggestions.map(goal => <li key={goal.goalId}><span>{goal.label} · {month(goal.dueMonth)} · {financeMoney(goal.amountToday, en)}</span><button type="button" className="overview-button secondary" disabled={saving} onClick={() => void match(row, goal.goalId)}>{t(`Xác nhận cùng khoản: ${goal.label}`, `Confirm same need: ${goal.label}`)}</button></li>)}</ul>
          : <p>{t("Chưa có mục tiêu gần khớp về số tiền và thời điểm. Kiểm tra lại nếu khoản này đã được khai ở mục tiêu.", "No goal closely matches the amount and timing. Review your goals if this need is already included there.")}</p>}
    </div>)}
    {problem && <p role="alert">{problem}</p>}
    <Link to="/user/profile?section=constraints">{t("Xem và sửa nhu cầu, mục tiêu →", "Review cash needs and goals →")}</Link>
  </section>;
}
