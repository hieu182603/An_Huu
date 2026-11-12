import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../i18n";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { discovery, type ProtectionResult } from "../services/discovery";
import { financeMoney } from "../utils/financeHubSummary";
import ProfileFormattedInput from "./ProfileFormattedInput";
import ResponsiveDialog from "./ResponsiveDialog";

const moneyPattern = /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/;
// Prefill only from server summary values; a missing value stays empty, never zero.
const fromSummary = (value: string | null | undefined) => value && moneyPattern.test(value) ? value : "";

/** D.I.M.E. protection-need illustration. Read-only: does not change the profile or plan. */
export default function ProtectionGapDialog({ onClose }: { onClose: () => void }) {
  const en = useI18n().language === "en", t = (vi: string, eng: string) => en ? eng : vi, money = (v: string) => financeMoney(v, en);
  const { profileSummary } = useFinancialProfile();
  const [values, setValues] = useState(() => ({
    outstandingDebt: fromSummary(profileSummary?.totalDebt), monthlyIncomeToReplace: fromSummary(profileSummary?.monthlyIncome), replacementYears: "5",
    educationNeed: "", otherNeeds: "", liquidAssets: fromSummary(profileSummary?.emergencyReserve), existingCoverage: "",
  }));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState<{ key: string; value: ProtectionResult } | null>(null);
  const controller = useRef<AbortController | null>(null), active = useRef(true);
  useEffect(() => () => { active.current = false; controller.current?.abort(); }, []);
  const key = JSON.stringify(values), current = result?.key === key ? result.value : null;
  const set = (name: keyof typeof values, value: string) => setValues(old => ({ ...old, [name]: value }));
  const calculate = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setError(""); setResult(null);
    const years = Number(values.replacementYears), amounts = ["outstandingDebt", "monthlyIncomeToReplace", "educationNeed", "liquidAssets", "existingCoverage"] as const;
    if (amounts.some(name => !moneyPattern.test(values[name])) || (values.otherNeeds && !moneyPattern.test(values.otherNeeds)) || !Number.isInteger(years) || years < 1 || years > 40) {
      setError(t("Nhập đủ các số tiền (không âm, có thể là 0) và số năm bù đắp từ 1 đến 40.", "Enter every amount (non-negative, 0 allowed) and 1–40 replacement years.")); return;
    }
    setBusy(true); controller.current = new AbortController();
    try {
      const value = await discovery.protection({ ...values, otherNeeds: values.otherNeeds || "0", replacementYears: years }, controller.current.signal);
      if (active.current) setResult({ key, value });
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : t("Chưa tính được kết quả.", "Could not calculate.")); }
    finally { if (active.current) setBusy(false); }
  };
  const cash = (name: keyof typeof values, label: string) => <ProfileFormattedInput key={name} format="money" label={label} value={values[name]} onChange={value => set(name, value)} />;
  const stat = (label: string, value: string) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>;
  return <ResponsiveDialog open title={t("Khảo sát khoảng trống bảo hiểm", "Protection gap check")} className="user-workspace-dialog discovery-tool-dialog" onClose={onClose} initialFocusSelector="input" fallbackFocusSelector=".discovery-tools">
    <p>{t("Phương pháp D.I.M.E: khoản nợ + thu nhập cần bù đắp + học vấn và nhu cầu khác, trừ tài sản thanh khoản và bảo hiểm đang có. Số đã điền sẵn lấy từ hồ sơ của bạn; đây là phép tính minh họa, không thay đổi hồ sơ hay kế hoạch.", "D.I.M.E method: debt + income to replace + education and other needs, less liquid assets and existing cover. Prefilled figures come from your profile; this illustration does not change your profile or plan.")}</p>
    <form className="cashflow-form discovery-tool-form" onSubmit={calculate}><fieldset disabled={busy}><div className="discovery-fields">
      {cash("outstandingDebt", t("Tổng dư nợ hiện tại", "Outstanding debt"))}
      {cash("monthlyIncomeToReplace", t("Thu nhập/tháng cần bù đắp cho gia đình", "Monthly income to replace"))}
      <label>{t("Số năm bù đắp", "Years to replace")}<input aria-label={t("Số năm bù đắp", "Years to replace")} type="number" inputMode="numeric" min={1} max={40} value={values.replacementYears} onChange={e => set("replacementYears", e.target.value)} /></label>
      {cash("educationNeed", t("Quỹ học vấn cho con", "Education fund"))}
      {cash("otherNeeds", t("Nhu cầu khác (tùy chọn)", "Other needs (optional)"))}
      {cash("liquidAssets", t("Tài sản thanh khoản sẵn có", "Liquid assets available"))}
      {cash("existingCoverage", t("Số tiền bảo hiểm đang có", "Existing life cover"))}
    </div></fieldset>{error && <p role="alert" className="discovery-error">{error}</p>}<button type="submit" className="overview-button primary" disabled={busy}>{busy ? t("Đang tính…", "Calculating…") : t("Tính khoảng trống", "Calculate gap")}</button></form>
    {current && <section className="discovery-tool-result" aria-label={t("Kết quả minh họa", "Illustrative results")}><h3>{t("Kết quả theo thông số đã nhập", "Results for your inputs")}</h3><dl>
      {stat(t("Khoản nợ", "Debt"), money(current.components.debt))}
      {stat(t("Thu nhập cần bù đắp", "Income replacement"), money(current.components.incomeReplacement))}
      {stat(t("Học vấn", "Education"), money(current.components.education))}
      {stat(t("Nhu cầu khác", "Other needs"), money(current.components.other))}
      {stat(t("Trừ tài sản thanh khoản", "Less liquid assets"), money(current.liquidAssetsOffset))}
      {stat(t("Mệnh giá bảo vệ cần có", "Protection needed"), money(current.protectionNeed))}
      {stat(t("Bảo hiểm đang có", "Existing cover"), money(current.existingCoverage))}
      {stat(t("Khoảng trống bảo vệ", "Protection gap"), money(current.protectionGap))}
      {current.surplusCoverage !== "0.00" && stat(t("Bảo hiểm vượt nhu cầu", "Cover above need"), money(current.surplusCoverage))}
    </dl></section>}
  </ResponsiveDialog>;
}
