import { Link } from "react-router";
import { useI18n } from "../i18n";
import { formatMoneyDecimal } from "../utils/moneyDisplay";
import { formatDateVN } from "../utils/date";
import MoneyExplanationDialog from "./MoneyExplanationDialog";

export default function NetWorthExplanation({ assets, debt, netWorth, valuationDate, onClose }: {
  assets: string | null; debt: string | null; netWorth: string | null; valuationDate?: string; onClose: () => void;
}) {
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const money = (v: string | null) => formatMoneyDecimal(v, en);
  return <MoneyExplanationDialog onClose={onClose} data={{
    title: t("Tài sản ròng được tính thế nào?", "How is net worth calculated?"), label: t("Tài sản ròng", "Net worth"), value: money(netWorth), subtitle: valuationDate ? `${t("Ngày định giá", "Valuation date")}: ${formatDateVN(valuationDate)}` : t("Theo hồ sơ đã khai", "As declared in your profile"),
    description: t("Tài sản ròng = tài sản thuộc sở hữu của bạn − phần dư nợ của bạn. Đây không phải toàn bộ tiền có thể góp nghỉ hưu; nhà ở và tiền dự phòng có vai trò riêng.", "Net worth = your owned assets − your outstanding debt. This is not the total available for retirement; housing and emergency savings have separate roles."),
    steps: [{ label: t("Tài sản thuộc sở hữu của bạn", "Your owned assets"), value: money(assets) }, { label: t("Trừ phần dư nợ của bạn", "Subtract your outstanding debt"), value: money(debt) }],
    result: `${money(assets)} − ${money(debt)} ≈ ${money(netWorth)}`, warning: netWorth?.startsWith("-"),
    note: t("Tài sản và dư nợ phải cùng ngày định giá và đúng phần sở hữu, trách nhiệm của bạn. Giá trị chưa xác định được giữ nguyên trạng thái thiếu dữ liệu.", "Assets and debts must share the valuation date and use your ownership and responsibility shares. Unknown values remain undetermined."),
  }} action={<Link className="overview-button primary" to="/user/debts" onClick={onClose}>{t("Rà soát khoản nợ", "Review debts")}</Link>} />;
}
