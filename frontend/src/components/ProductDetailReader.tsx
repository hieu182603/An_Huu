import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useDiscoveryQuery } from "../hooks/useDiscoveryQuery";
import { discovery } from "../services/discovery";
import { financeMoney } from "../utils/financeHubSummary";
import { DiscoveryError, DiscoveryImage } from "./DiscoveryParts";
import bondImage from "../assets/product-bond.jpg";
import investmentImage from "../assets/product-investment.jpg";
import insuranceImage from "../assets/product-insurance.jpg";
import depositImage from "../assets/product-deposit.jpg";

export default function ProductDetailReader({ id, onBack, onConsult }: { id: string; onBack: () => void; onConsult: () => void }) {
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const [attempt, setAttempt] = useState(0);
  const { data: product, loading, error } = useDiscoveryQuery(`${id}:${attempt}`, signal => discovery.product(id, signal));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (product) { window.scrollTo({ top: 0, behavior: "instant" }); heading.current?.focus({ preventScroll: true }); }
  }, [product?.id]);
  const sections = [
    { id: "product-overview", title: t("Giới thiệu sản phẩm", "About the product"), content: product?.description },
    { id: "product-return", title: t("Lợi suất công bố", "Published return"), content: product?.expectedReturn },
    { id: "product-fees", title: t("Phí hằng năm", "Annual fee"), content: product?.annualFee },
    { id: "product-conditions", title: t("Điều kiện tham gia", "Participation terms"), content: product?.conditions },
    { id: "product-disclosure", title: t("Thông tin công bố", "Disclosure"), content: product?.disclosure },
  ];
  return <section className="discovery-product-reader">
    <nav className="discovery-reader-bar" aria-label={t("Điều hướng sản phẩm", "Product navigation")}>
      <button type="button" className="overview-button secondary" onClick={onBack}>{t("← Quay lại danh sách sản phẩm", "← Back to products")}</button>
      {product && <button type="button" className="overview-button primary" onClick={onConsult}>{t("Yêu cầu tư vấn", "Request consultation")}</button>}
    </nav>
    {loading ? <p role="status">{t("Đang tải thông tin sản phẩm…", "Loading product details…")}</p> : error ? <DiscoveryError message={error} retry={() => setAttempt(n => n + 1)} /> : product && <div className="discovery-reader-grid">
      <article className="discovery-reader">
        <header><span className="discovery-category">{product.category}</span><h1 ref={heading} tabIndex={-1}>{product.name}</h1><div className="discovery-product-byline"><span>{product.partner?.name}</span><span className={`product-card__risk risk-${product.riskLevel.toLowerCase()}`}>{({ LOW: t("Rủi ro thấp", "Low risk"), MEDIUM: t("Rủi ro trung bình", "Medium risk"), HIGH: t("Rủi ro cao", "High risk") })[product.riskLevel]}</span></div></header>
        <figure><DiscoveryImage src={product.imageUrl} alt={product.name} fallback={/trái phiếu|bond/i.test(product.category) ? bondImage : /bảo hiểm|insurance/i.test(product.category) ? insuranceImage : /quỹ|đầu tư|fund|invest/i.test(product.category) ? investmentImage : depositImage} />{!product.imageUrl && <figcaption>{t("Ảnh minh họa", "Illustrative image")}</figcaption>}</figure>
        <div className="discovery-article-body">{sections.map(section => <section id={section.id} key={section.id}><h2>{section.title}</h2>{(section.content || t("Chưa công bố", "Not provided")).split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.id === "product-conditions" && product.minimumAmount != null && <p><strong>{t("Mức tham gia tối thiểu", "Minimum amount")}:</strong> {financeMoney(product.minimumAmount, en)}</p>}</section>)}</div>
        <footer className="discovery-reader-footer"><h2>{t("Bạn muốn tìm hiểu thêm?", "Want to learn more?")}</h2><div><button type="button" className="overview-button secondary" onClick={onBack}>{t("Xem sản phẩm khác", "More products")}</button><button type="button" className="overview-button primary" onClick={onConsult}>{t("Yêu cầu tư vấn", "Request consultation")}</button></div></footer>
      </article>
      <aside className="discovery-reader-aside"><section><h2>{t("Trong sản phẩm này", "On this page")}</h2><nav>{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav></section><section><h2>{t("Tổ chức cung cấp", "Provider")}</h2><p>{product.partner?.name || t("Chưa công bố", "Not provided")}</p>{product.minimumAmount != null && <><h2>{t("Mức tham gia tối thiểu", "Minimum amount")}</h2><p>{financeMoney(product.minimumAmount, en)}</p></>}</section></aside>
    </div>}
  </section>;
}
