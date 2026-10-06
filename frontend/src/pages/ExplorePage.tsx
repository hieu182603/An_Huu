import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Icon, Modal } from "../components/ui";
import KnowledgeLibrary, { KnowledgeGlossary } from "../components/KnowledgeLibraryApi";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { listPublicProducts, type ProductItem } from "../services/catalog";

export default function ExplorePage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const isEn = language === "en";

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listPublicProducts(1, 50)
      .then(res => { if (active) setCatalogProducts(res.items.filter(p => p.isVisible)); })
      .catch(() => { if (active) setError(isEn ? "Unable to load partner products." : "Không thể tải sản phẩm đối tác."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, isEn]);

  const visibleProducts = catalogProducts.filter(item => selectedCategory === "all" || (selectedCategory === "health" ? /bảo hiểm|insurance/i.test(item.category) : !/bảo hiểm|insurance/i.test(item.category)));

  const categories = [
    { id: "all", label: isEn ? "All Topics" : "Tất cả chủ đề", icon: "compass" as const },
    { id: "bhxh", label: isEn ? "Social Insurance (BHXH)" : "Bảo hiểm Xã hội (BHXH)", icon: "file-text" as const },
    { id: "invest", label: isEn ? "Investment & Funds" : "Chiến lược đầu tư & Quỹ", icon: "chart" as const },
    { id: "health", label: isEn ? "Health & Medical Insurance" : "Bảo hiểm y tế & Sức khỏe", icon: "life-buoy" as const },
    { id: "lifestyle", label: isEn ? "Retirement Lifestyle" : "Lối sống hưu trí viên mãn", icon: "sparkles" as const },
  ];

  return (
    <div className="phase-eight-page">
      {/* Header */}
      <div className="phase-page-header phase-eight-header">
        <div>
          <span className="section-eyebrow">{isEn ? "PARTNER ECOSYSTEM & SOLUTIONS" : "HỆ SINH THÁI ĐỐI TÁC & GIẢI PHÁP"}</span>
          <h1>{isEn ? "Retirement Partners & Solutions" : "Đối tác & Giải pháp hưu trí"}</h1>
          <p>
            {isEn
              ? "Explore financial products from our partner network (investment funds, health insurance, banks) and retirement accumulation handbooks."
              : "Khám phá các sản phẩm tài chính từ mạng lưới đối tác liên kết (quỹ đầu tư, bảo hiểm y tế, ngân hàng) và cẩm nang tích lũy hưu trí."}
          </p>
        </div>

        <div className="phase-eight-switcher">
          <button type="button" className="is-active">{isEn ? "Explore" : "Khám phá"}</button>
          <Link className="button button-ghost" to="/user/account">{isEn ? "Account" : "Tài khoản"}</Link>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="explore-category-tabs">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={selectedCategory === c.id ? "is-active" : ""}
            aria-pressed={selectedCategory === c.id}
            onClick={() => setSelectedCategory(c.id)}
          >
            <Icon name={c.icon} size="small" />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <KnowledgeLibrary key={user?.id || "guest"} userId={user?.id || "guest"} category={selectedCategory} resetCategory={() => setSelectedCategory("all")} />

      {/* Financial Solutions Section */}
      {(selectedCategory === "all" || selectedCategory === "invest" || selectedCategory === "health") && (
        <section className="explore-section">
          <header>
            <div>
              <Badge tone="soft">{isEn ? "CURATED PARTNER SOLUTIONS" : "GIẢI PHÁP ĐỐI TÁC CHỌN LỌC"}</Badge>
              <h2>{isEn ? "Transparent Accumulation & Insurance Solutions" : "Giải pháp tích lũy & bảo hiểm minh bạch"}</h2>
              <p>{isEn ? "Information published by partners. Review fees, conditions and risk before choosing." : "Thông tin do đối tác công bố. Đọc kỹ phí, điều kiện và mức rủi ro trước khi lựa chọn."}</p>
            </div>
          </header>

          {loading ? <p role="status">{isEn ? "Loading products…" : "Đang tải sản phẩm…"}</p> : error ? <Alert tone="danger" title={error} action={<Button variant="secondary" onClick={() => setReload(n => n + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>} /> : visibleProducts.length === 0 ? <Card className="explore-empty"><Icon name="compass" /><p>{isEn ? "No published products in this category yet." : "Chưa có sản phẩm được công bố trong nhóm này."}</p></Card> : (
          <div className="solutions-grid">
            {visibleProducts.map(item => (
              <Card className="solution-card" key={item.id}>
                <header><span className="solution-icon"><Icon name="wallet" /></span><div><strong>{item.name}</strong><small>{item.partner?.name || (isEn ? "Partner" : "Đối tác")}</small></div><Badge tone="soft">{item.riskLevel === "LOW" ? (isEn ? "Low risk" : "Rủi ro thấp") : item.riskLevel === "HIGH" ? (isEn ? "High risk" : "Rủi ro cao") : (isEn ? "Medium risk" : "Rủi ro trung bình")}</Badge></header>
                <h3>{item.category}</h3><p>{item.description}</p>
                <div className="solution-details"><span><small>{isEn ? "Annual fee" : "Phí hằng năm"}</small><strong>{item.annualFee || (isEn ? "Not provided" : "Chưa công bố")}</strong></span></div>
                <Button variant="secondary" onClick={() => setSelectedProduct(item)}>{isEn ? "View solution details" : "Xem chi tiết giải pháp"}<Icon name="arrow-right" size="small" /></Button>
              </Card>
            ))}
          </div>)}
        </section>
      )}

      <KnowledgeGlossary />
      <Modal open={Boolean(selectedProduct)} title={selectedProduct?.name || ""} onClose={() => setSelectedProduct(null)}>
        {selectedProduct && <div className="product-detail"><p>{selectedProduct.description}</p>{[
          [isEn ? "Expected return (not guaranteed)" : "Lợi suất kỳ vọng (không cam kết)", selectedProduct.expectedReturn],
          [isEn ? "Annual fee" : "Phí hằng năm", selectedProduct.annualFee],
          [isEn ? "Conditions" : "Điều kiện", selectedProduct.conditions],
          [isEn ? "Disclosure" : "Thông tin công bố", selectedProduct.disclosure],
        ].map(([label, value]) => <section key={label}><h3>{label}</h3><p>{value || (isEn ? "Not provided" : "Chưa công bố")}</p></section>)}</div>}
      </Modal>
    </div>
  );
}
