import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { useDiscoveryQuery } from "../hooks/useDiscoveryQuery";
import { allocationPackages, type AllocationPackageProduct, type WorkspaceInput } from "../services/allocationWorkspace";
import { discovery } from "../services/discovery";
import { financeMoney } from "../utils/financeHubSummary";
import { portfolioAssetLabel } from "../utils/portfolioGlidePath";
import ResponsiveDialog from "./ResponsiveDialog";

/** Two illustrative product packages for one allocation: lowest fee, and the most liquid alternative. Nothing is ordered or saved to a plan. */
export default function AllocationPackages({ input, onClose, labels }: { input: WorkspaceInput | null; onClose: () => void; labels: Record<string, string> }) {
  const en = useI18n().language === "en", t = (vi: string, eng: string) => en ? eng : vi;
  const query = useDiscoveryQuery(JSON.stringify(input), signal => input ? allocationPackages(input, signal) : Promise.resolve(null));
  const [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  const inputKey = JSON.stringify(input), liveKey = useRef(inputKey); liveKey.current = inputKey;
  useEffect(() => setMessage(""), [inputKey]);
  const save = async (ids: string[]) => {
    if (saving) return; const key = inputKey; setSaving(true); setMessage("");
    const results = await Promise.allSettled(ids.map(id => discovery.saveProduct(id, true)));
    const count = results.filter(r => r.status === "fulfilled").length;
    if (liveKey.current === key) setMessage(count === ids.length ? t(`Đã lưu quan tâm ${count} sản phẩm.`, `Saved ${count} products.`) : t(`Đã lưu ${count}/${ids.length} sản phẩm. Một số sản phẩm chưa lưu được; bạn có thể thử lại.`, `Saved ${count}/${ids.length} products. Some could not be saved; retry is available.`));
    setSaving(false);
  };
  const info = { A: { badge: t("Gói 1", "Package 1"), name: t("Gói chi phí thấp", "Low-cost package"), short: t("Chi phí thấp", "Low cost"), tagline: t("Ít phí, phù hợp nắm giữ lâu dài.", "Lower fees, suited to long-term holding.") },
    B: { badge: t("Gói 2", "Package 2"), name: t("Gói linh hoạt", "Flexible package"), short: t("Linh hoạt", "Flexible"), tagline: t("Dễ rút tiền hơn khi cần.", "Easier to withdraw when needed.") } } as const;
  const data = query.data;
  const cell = (row: NonNullable<typeof data>["lines"][number], product: AllocationPackageProduct | null, heading: string) => !product
    ? <td className="is-empty" data-label={heading}>{row.minimumNeededVnd ? t(`Số tiền chưa đủ mức tối thiểu (từ ${financeMoney(row.minimumNeededVnd, en)}).`, `Below the minimum investment (from ${financeMoney(row.minimumNeededVnd, en)}).`) : row.status === "NO_PRODUCT" ? t(`Chưa có sản phẩm cho ${portfolioAssetLabel(row.assetClass, en ? "en" : "vi", labels)}.`, `No product for ${portfolioAssetLabel(row.assetClass, en ? "en" : "vi", labels)} yet.`) : t("Chưa có sản phẩm đáp ứng", "No eligible product")}</td>
    : <td data-label={heading}><strong>{product.name}</strong><span>{product.partnerName}</span>
      <span className="is-metric">{t("Phí", "Fee")} {String(product.annualFeePercent).replace(".",",")}%/{t("năm", "yr")} · {t("thanh khoản", "liquidity")} {product.liquidityDays} {t("ngày", "days")}</span>
      <span>{t("Tối thiểu", "Minimum")} {financeMoney(product.minimumAmount, en)}</span>
      <Link className="remaining-text" to={`/user/explore?product=${encodeURIComponent(product.id)}`} onClick={onClose} aria-label={`${t("Xem chi tiết", "View details")}: ${product.name}`}>{t("Xem chi tiết", "View details")}</Link></td>;
  return <ResponsiveDialog open={!!input} onClose={onClose} title={t("Gói đầu tư cho danh mục tham khảo", "Investment package comparison")} className="user-workspace-dialog allocation-products-dialog">
    <p>{t("Ghép tỷ trọng với sản phẩm đang được phép giới thiệu theo số vốn từng nhóm, mức rủi ro, phí, thanh khoản và mức đầu tư tối thiểu. Đây là cách so sánh, không phải khuyến nghị mua.", "Matches the weights with distributable products by capital per asset, risk, fees, liquidity and investment minimums. This is a comparison, not a recommendation to buy.")}</p>
    {query.loading && input ? <p role="status">{t("Đang đối chiếu sản phẩm…", "Loading product comparison…")}</p> : query.error ? <p role="alert">{query.error}</p> : data && <>
      {data.status === "UNCONFIGURED" ? <p role="status">{t("Chưa có sản phẩm với dữ liệu hợp lệ đáp ứng phân bổ này.", "No products with valid metadata satisfy this allocation.")}</p> : <>
        <p>{data.lines.map(row=>`${portfolioAssetLabel(row.assetClass,en?"en":"vi",labels)} ${String(row.weightPercent).replace(".",",")}%`).join(" · ")}</p>
        {data.same && <p>{t("Hiện chỉ có một lựa chọn phù hợp cho mỗi loại tài sản, nên hai gói đang giống nhau.", "Only one eligible choice exists per asset class, so the two packages match.")}</p>}
        <div className="allocation-package-grid">{(["A", "B"] as const).map(key => { const p = data[key]; return <article key={key}><span>{info[key].badge}</span><h3>{info[key].name}</h3><p>{info[key].tagline}</p>
          <dl><div><dt>{t("Phí quản lý ước tính", "Estimated management fee")}</dt><dd>{financeMoney(p.annualFeeVnd, en)}/{t("năm", "yr")}</dd></div><div><dt>{t("Số đơn vị cung cấp", "Providers")}</dt><dd>{p.providers}</dd></div><div><dt>{t("Phần vốn có sản phẩm", "Capital with a product")}</dt><dd>{String(p.coveredPercent).replace(".",",")}%</dd></div></dl>
</article>; })}</div></>}
      <div className="allocation-comparison-scroll" tabIndex={0} role="region" aria-label={t("So sánh 2 gói theo từng loại tài sản", "Both packages by asset class")}><table className="allocation-package-table"><thead><tr><th scope="col">{t("Loại tài sản", "Asset class")}</th><th scope="col">{info.A.badge} · {info.A.short}</th><th scope="col">{info.B.badge} · {info.B.short}</th></tr></thead><tbody>{data.lines.map(row => <tr key={row.assetClass}>
        <th scope="row">{portfolioAssetLabel(row.assetClass, en ? "en" : "vi", labels)}<span>{String(row.weightPercent).replace(".",",")}% · {financeMoney(row.amountVnd, en)}</span>
          {row.a && row.b && row.a.id !== row.b.id && <Link className="remaining-text" to={`/user/explore?tab=compare&compare=${encodeURIComponent(row.a.id)},${encodeURIComponent(row.b.id)}`} onClick={onClose}>{t("So sánh chi tiết 2 sản phẩm", "Compare both products")}</Link>}</th>
        {cell(row, row.a, `${info.A.badge} · ${info.A.short}`)}{cell(row, row.b, `${info.B.badge} · ${info.B.short}`)}</tr>)}</tbody></table></div>
    </>}
    {data && data.status!=="UNCONFIGURED" && <footer className="allocation-package-save-actions">{(["A","B"] as const).map(key=><button key={key} className="overview-button secondary" disabled={saving||!data[key].ids.length} onClick={()=>void save(data[key].ids)}>{t(`Lưu ${info[key].name.toLowerCase()}`,`Save ${info[key].name.toLowerCase()}`)}</button>)}</footer>}
    {message && <p role="status">{message}</p>}
    <p>{t("Phí ước tính = số tiền × phí quản lý hằng năm của sản phẩm; chưa gồm phí giao dịch và thuế riêng. Chưa lưu kế hoạch hoặc đặt lệnh; cần xác minh với đơn vị cung cấp trước khi quyết định.", "Estimated fee = amount × the product's annual management fee; transaction fees and taxes are excluded. No plan is saved and no order is placed; verify with the provider before deciding.")}</p>
    <Link className="overview-button secondary" to="/user/explore" onClick={onClose}>{t("Khám phá sản phẩm", "Explore products")}</Link>
  </ResponsiveDialog>;
}
