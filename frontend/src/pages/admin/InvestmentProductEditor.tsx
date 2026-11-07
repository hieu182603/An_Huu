import type { ProductData } from "../../services/investments";
import MoneyTextBox from "../../components/MoneyTextBox";

export function newInvestmentProduct(product: { id: string; name: string }): ProductData {
  return { ...product, revision: 0, stale: true, data: { code: "", assetClass: "CASH", category: "TERM_DEPOSIT", nav: "", annualExpenseRatioPercent: "", liquidityDays: 0, lotSize: 1, minimumInvestmentVnd: "", riskScore: 1, isDistributionPermitted: false, status: "INACTIVE", sourceKind: "REVIEWED_MANUAL", sourceReference: "", currency: "VND", priceAsOf: "", validUntil: "", distributionEvidence: "" } };
}

export default function InvestmentProductEditor({ value, onChange, onSave, onCancel, busy }: {
  value: ProductData; onChange: (p: ProductData) => void; onSave: () => void; onCancel: () => void; busy: boolean;
}) {
  const set = <K extends keyof ProductData["data"]>(key: K, v: ProductData["data"][K]) => onChange({ ...value, data: { ...value.data, [key]: v } });
  return <form onSubmit={e => { e.preventDefault(); onSave(); }}><h3>{value.name}</h3>
    <p>Nhập theo hồ sơ sản phẩm đã kiểm tra. Dữ liệu mới mặc định chưa được sử dụng để khuyến nghị.</p>
    <div className="investment-fields">
      <label>Mã sản phẩm<input required maxLength={60} value={value.data.code} onChange={e => set("code", e.target.value)} /></label>
      <label>Loại tài sản<select value={value.data.assetClass} onChange={e => set("assetClass", e.target.value)}>{[["CASH", "Tiền gửi"], ["BOND", "Trái phiếu"], ["EQUITY", "Cổ phiếu"], ["GOLD", "Vàng"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label>Nhóm sản phẩm<select value={value.data.category} onChange={e => set("category", e.target.value)}>{[["TERM_DEPOSIT", "Tiền gửi có kỳ hạn"], ["GOVERNMENT_BOND", "Trái phiếu chính phủ"], ["OPEN_BOND_FUND", "Quỹ trái phiếu"], ["EQUITY_ETF", "ETF cổ phiếu"], ["ACTIVE_EQUITY_FUND", "Quỹ cổ phiếu"], ["PHYSICAL_GOLD", "Vàng vật chất"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label>Giá mỗi đơn vị<MoneyTextBox required value={value.data.nav} onChange={v => set("nav", v)} /></label>
      <label>Đầu tư tối thiểu<MoneyTextBox required value={value.data.minimumInvestmentVnd} onChange={v => set("minimumInvestmentVnd", v)} /></label>
      <label>Phí mỗi năm (%)<input required type="number" min="0" max="100" step="0.000001" value={value.data.annualExpenseRatioPercent} onChange={e => set("annualExpenseRatioPercent", e.target.value)} /></label>
      <label>Số ngày thanh khoản<input required type="number" min="0" max="36500" value={value.data.liquidityDays} onChange={e => set("liquidityDays", Number(e.target.value))} /></label>
      <label>Số đơn vị mỗi lô<input required type="number" min="1" max="1000000" value={value.data.lotSize} onChange={e => set("lotSize", Number(e.target.value))} /></label>
      <label>Mức rủi ro (1–10)<input required type="number" min="1" max="10" value={value.data.riskScore} onChange={e => set("riskScore", Number(e.target.value))} /></label>
      <label>Ngày giá<input required type="date" value={value.data.priceAsOf} onChange={e => set("priceAsOf", e.target.value)} /></label>
      <label>Hiệu lực đến<input required type="date" min={value.data.priceAsOf} value={value.data.validUntil} onChange={e => set("validUntil", e.target.value)} /></label>
      <label>Loại nguồn<select value={value.data.sourceKind} onChange={e => set("sourceKind", e.target.value)}><option value="REVIEWED_MANUAL">Nhập thủ công đã kiểm tra</option><option value="LICENSED_FEED">Nguồn dữ liệu được cấp phép</option>{value.data.sourceKind === "TEST_FIXTURE" && <option value="TEST_FIXTURE">Dữ liệu kiểm thử mô phỏng</option>}</select></label>
      <label>Nguồn và bằng chứng<input required minLength={5} maxLength={1000} value={value.data.sourceReference} onChange={e => set("sourceReference", e.target.value)} /></label>
      <label>Căn cứ quyền phân phối<input required minLength={5} maxLength={2000} value={value.data.distributionEvidence} onChange={e => set("distributionEvidence", e.target.value)} /></label>
      <label>Quyền phân phối<select value={String(value.data.isDistributionPermitted)} onChange={e => set("isDistributionPermitted", e.target.value === "true")}><option value="false">Chưa được xác nhận</option><option value="true">Đã xác nhận theo bằng chứng</option></select></label>
      <label>Sử dụng trong khuyến nghị<select value={value.data.status} onChange={e => set("status", e.target.value)}><option value="INACTIVE">Tạm ngưng</option><option value="ACTIVE">Cho phép xét điều kiện</option></select></label>
    </div><button disabled={busy}>Lưu phiên bản dữ liệu</button><button disabled={busy} type="button" onClick={onCancel}>Hủy</button>
  </form>;
}
