import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import type { RetirementPreviewInput } from "../services/retirement";
import { allocationExpenseChanges } from "../utils/allocationExpenses";
import ProfileFormattedInput from "./ProfileFormattedInput";

const amountValid = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value);

export function AllocationCapitalInput({ en }: { en: boolean }) {
  const { v2Profile, updateProfileV2, saveStatus, saveError } = useFinancialProfile();
  const saved = v2Profile?.allocationCapital;
  const [basis, setBasis] = useState(saved?.basis ?? "PROFILE"), [amount, setAmount] = useState(saved?.totalAmount ?? "");
  useEffect(() => { setBasis(saved?.basis ?? "PROFILE"); setAmount(saved?.totalAmount ?? ""); }, [JSON.stringify(saved)]);
  const changed = basis !== (saved?.basis ?? "PROFILE") || basis === "TOTAL" && amount !== saved?.totalAmount;
  return <div className="allocation-personal-inputs"><label>{en ? "Allocation capital" : "Số vốn dùng để phân bổ"}<select aria-label={en ? "Allocation capital" : "Số vốn dùng để phân bổ"} value={basis} onChange={e => setBasis(e.target.value as typeof basis)} disabled={saveStatus === "saving"}>
    <option value="PROFILE">{en ? "Capital declared in your profile" : "Tiền đã khai trong hồ sơ"}</option><option value="TOTAL">{en ? "Total investable capital (including reserve)" : "Tổng vốn đầu tư (gồm cả dự phòng)"}</option>
  </select></label>{basis === "TOTAL" && <><ProfileFormattedInput format="money" label={en ? "Total available to invest today" : "Tổng tiền có thể đầu tư hôm nay"} value={amount} onChange={setAmount} disabled={saveStatus === "saving"} /><p>{en ? "Declare your available total, including reserves and near-term goals. It replaces the profile total for allocation; it does not add to it. Asset records stay separate. Review the resulting plan before applying." : "Khai tổng tiền hiện có, gồm dự phòng và mục tiêu gần hạn. Phân bổ dùng tổng này thay cho tổng trong hồ sơ, không cộng hai lần. Danh sách tài sản vẫn được giữ; bạn xem lại kế hoạch trước khi áp dụng."}</p></>}
    {changed && <button type="button" className="overview-button primary" disabled={saveStatus === "saving" || basis === "TOTAL" && !amountValid(amount)} onClick={() => void updateProfileV2({ allocationCapital: { basis, ...(basis === "TOTAL" ? { totalAmount: amount } : {}) } })}>{en ? "Save capital and recalculate" : "Lưu vốn và tính lại"}</button>}{changed && saveStatus === "error" && <p role="alert">{saveError}</p>}
  </div>;
}

export function AllocationSpendingInputs({ en, current, retirement, endMonth }: { en: boolean; current: string | null; retirement: string | null; endMonth: string }) {
  const t = (vi: string, english: string) => en ? english : vi;
  const { v2Profile: profile, updateProfileV2, updateRetirementGoal, saveStatus, saveError } = useFinancialProfile();
  const { updateDraft } = useRetirementPlan();
  const [now, setNow] = useState(current ?? ""), [later, setLater] = useState(retirement ?? ""), [error, setError] = useState("");
  useEffect(() => { setNow(current ?? ""); setLater(retirement ?? ""); }, [current, retirement]);
  const changed = now !== (current ?? "") || later !== (retirement ?? "");
  const save = async () => {
    if (!profile || !amountValid(now) || !amountValid(later) || Number(later) <= 0) { setError(t("Nhập hai mức chi; chi khi nghỉ hưu phải lớn hơn 0.", "Enter both spending amounts; retirement spending must be positive.")); return; }
    const birth = profile.personal.birthMonth, ret = profile.personal.desiredRetirementMonth;
    const expenses = allocationExpenseChanges(profile, now);
    if (now !== current && !expenses) { setError(t("Lịch chi có khoản chưa rõ, ngoại tệ hoặc chi một lần. Hãy sửa từng khoản trong Tài chính trước.", "The schedule has unknown, foreign-currency or one-off items. Edit individual expenses in Finances first.")); return; }
    if (birth.status !== "KNOWN" || ret.status !== "KNOWN" || !endMonth) { setError(t("Bổ sung các mốc thời gian trong Mục tiêu trước khi lưu.", "Complete your goal dates before saving.")); return; }
    setError("");
    if (now !== current && !await updateProfileV2({ expenses: { status: "KNOWN", entries: expenses! } })) return;
    if (later !== retirement) {
      const saved = await updateRetirementGoal({ birthMonth: birth.value, ...(profile.personal.birthDate ? { birthDate: profile.personal.birthDate } : {}), retirementMonth: ret.value, goal: { ...profile.retirementGoal, endMonth, monthlyExpenseToday: later, lifestylePriority: profile.retirementGoal?.lifestylePriority ?? null } });
      if (!saved) return;
      updateDraft({ monthlyExpenseToday: later });
    }
  };
  return <div className="allocation-personal-inputs"><ProfileFormattedInput format="money" label={t("Chi phí cần thiết mỗi tháng hiện nay", "Essential monthly expenses today")} value={now} onChange={setNow} disabled={saveStatus === "saving"} /><ProfileFormattedInput format="money" label={t("Chi phí cần thiết mỗi tháng khi nghỉ hưu", "Essential monthly expenses in retirement")} value={later} onChange={setLater} disabled={saveStatus === "saving"} />
    <p>{t("Mức chi hiện nay được chia theo tỷ lệ các khoản thiết yếu đang có; lịch và các nhóm chi khác được giữ. Mức chi nghỉ hưu cập nhật mục tiêu của bạn.", "Current spending is apportioned across existing essential entries; schedules and other categories are preserved. Retirement spending updates your goal.")}</p>
    {(error || changed && saveStatus === "error") && <p role="alert">{error || saveError}</p>}{changed && <button type="button" className="overview-button primary" disabled={saveStatus === "saving"} onClick={() => void save().catch(reason => setError(reason instanceof Error ? reason.message : "Chưa lưu được thông tin."))}>{t("Lưu chi tiêu và tính lại", "Save spending and recalculate")}</button>}{(error || current === null) && <Link to="/user/profile?section=cashflow">{t("Xem từng khoản chi →", "Review expense entries →")}</Link>}
  </div>;
}

export function AllocationPersonalPlan({ en, input, retirementMonth }: { en: boolean; input?: RetirementPreviewInput | null; retirementMonth?: string }) {
  const t = (vi: string, english: string) => en ? english : vi;
  const { v2Profile: profile, updateCashflow, saveStatus, saveError } = useFinancialProfile();
  const { updateDraft } = useRetirementPlan();
  const incomeId = "allocation-retirement-income";
  const income = profile?.income.status === "KNOWN" ? profile.income.entries.find(row => row.id === incomeId) : undefined;
  const [legacy, setLegacy] = useState(input?.terminalBalance ?? ""), [other, setOther] = useState(income?.amount.status === "KNOWN" ? income.amount.value : ""), [error, setError] = useState("");
  useEffect(() => setLegacy(input?.terminalBalance ?? ""), [input?.terminalBalance]);
  useEffect(() => setOther(income?.amount.status === "KNOWN" ? income.amount.value : ""), [JSON.stringify(income)]);
  const save = async () => {
    if (!input || !profile || !retirementMonth || !amountValid(legacy) || other !== "" && !amountValid(other)) { setError(t("Nhập số tiền hợp lệ; chỉ nhập 0 khi bạn xác nhận không có khoản này.", "Enter valid amounts; use 0 only to confirm none.")); return; }
    setError("");
    if (other === "" && income?.amount.status === "KNOWN") { setError(t("Khoản thu đã được lưu. Nhập mức mới hoặc nhập 0 để xác nhận không còn khoản thu; để trống không xóa số đã lưu.", "This income is already saved. Enter a new amount, or 0 to confirm none; blank does not delete the saved amount.")); return; }
    if (other === "") { updateDraft({ terminalBalance: legacy }); return; }
    if (!income && profile.income.status === "UNKNOWN") { setError(t("Xác nhận các nguồn thu trong Tài chính trước khi thêm khoản thu sau nghỉ hưu.", "Confirm income sources in Finances before adding retirement income.")); return; }
    const ok = await updateCashflow({ kind: income ? "UPDATE" : "ADD", group: "income", entry: { id: incomeId, label: t("Thu nhập khác sau nghỉ hưu", "Other retirement income"), kind: "FIXED", basis: "DISPOSABLE", source: "OTHER", amount: { status: "KNOWN", value: other }, currency: "VND", startMonth: retirementMonth, endMonth: input.endMonth, frequency: "MONTHLY" } });
    if (ok) updateDraft({ terminalBalance: legacy, retirementIncomeIds: [...new Set([...input.retirementIncomeIds, incomeId])] });
  };
  return <details className="allocation-disclosure"><summary>{t("Tiền để lại và nguồn thu sau nghỉ hưu", "Legacy and retirement income")}</summary><ProfileFormattedInput format="money" label={t("Tiền muốn để lại cuối kế hoạch", "Desired balance at plan end")} value={legacy} onChange={setLegacy} /><ProfileFormattedInput format="money" label={t("Thu nhập khác sau nghỉ hưu mỗi tháng", "Other monthly retirement income")} value={other} onChange={setOther} /><p>{t("Khoản thu này bổ sung các nguồn đã khai và không gồm BHXH. Tiền để lại dùng theo giá cuối kỳ của kế hoạch.", "This income supplements existing sources and excludes pension. The legacy amount is in nominal prices at plan end.")}</p>{(error || saveStatus === "error") && <p role="alert">{error || saveError}</p>}<button type="button" className="overview-button secondary" disabled={!input || saveStatus === "saving"} onClick={() => void save().catch(reason => setError(reason instanceof Error ? reason.message : "Chưa lưu được thông tin."))}>{t("Lưu thông tin và tính lại", "Save inputs and recalculate")}</button></details>;
}
