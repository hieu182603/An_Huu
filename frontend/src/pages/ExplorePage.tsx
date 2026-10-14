import { useState, useEffect } from "react";
import { Alert, Badge, Button, Card, Icon, Input, Modal, Textarea, useNotification } from "../components/ui";
import KnowledgeLibrary, { KnowledgeGlossary } from "../components/KnowledgeLibraryApi";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { listPublicProducts, requestProductConsult, type ProductItem } from "../services/catalog";

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
  const { notify } = useNotification();
  const [consult, setConsult] = useState({ open: false, message: "", phone: "", busy: false, error: "" });
  const openProduct = (item: ProductItem | null) => { setSelectedProduct(item); setConsult({ open: false, message: "", phone: "", busy: false, error: "" }); };
  const sendConsult = async () => {
    if (!selectedProduct) return;
    setConsult(c => ({ ...c, busy: true, error: "" }));
    try {
      await requestProductConsult(selectedProduct.id, consult.message.trim(), consult.phone.trim() || undefined);
      notify.success(isEn ? "Consultation requested" : "Đã gửi yêu cầu tư vấn", isEn ? "Track replies in Support." : "Theo dõi phản hồi tại mục Hỗ trợ.");
      openProduct(null);
    } catch (e) {
      setConsult(c => ({ ...c, busy: false, error: e instanceof Error ? e.message : (isEn ? "Could not send the request." : "Không gửi được yêu cầu.") }));
    }
  };

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
                {item.imageUrl && <img className="solution-image" src={item.imageUrl} alt="" loading="lazy" />}
                <header><span className="solution-icon"><Icon name="wallet" /></span><div><strong>{item.name}</strong><small>{item.partner?.name || (isEn ? "Partner" : "Đối tác")}</small></div><Badge tone="soft">{item.riskLevel === "LOW" ? (isEn ? "Low risk" : "Rủi ro thấp") : item.riskLevel === "HIGH" ? (isEn ? "High risk" : "Rủi ro cao") : (isEn ? "Medium risk" : "Rủi ro trung bình")}</Badge></header>
                <h3>{item.category}</h3><p>{item.description}</p>
                <div className="solution-details"><span><small>{isEn ? "Annual fee" : "Phí hằng năm"}</small><strong>{item.annualFee || (isEn ? "Not provided" : "Chưa công bố")}</strong></span></div>
                <Button variant="secondary" onClick={() => openProduct(item)}>{isEn ? "View solution details" : "Xem chi tiết giải pháp"}<Icon name="arrow-right" size="small" /></Button>
              </Card>
            ))}
          </div>)}
        </section>
      )}

      <KnowledgeGlossary />
      <Modal open={Boolean(selectedProduct)} title={selectedProduct?.name || ""} onClose={() => { if (!consult.busy) openProduct(null); }}>
        {selectedProduct && <div className="product-detail">{selectedProduct.imageUrl && <img className="product-detail-image" src={selectedProduct.imageUrl} alt={selectedProduct.name} />}<p><strong>{selectedProduct.partner?.name}</strong> · {selectedProduct.category}</p><p>{selectedProduct.description}</p>{[
          [isEn ? "Expected return (not guaranteed)" : "Lợi suất kỳ vọng (không cam kết)", selectedProduct.expectedReturn],
          [isEn ? "Annual fee" : "Phí hằng năm", selectedProduct.annualFee],
          [isEn ? "Conditions" : "Điều kiện", selectedProduct.conditions],
          [isEn ? "Disclosure" : "Thông tin công bố", selectedProduct.disclosure],
        ].map(([label, value]) => <section key={label}><h3>{label}</h3><p>{value || (isEn ? "Not provided" : "Chưa công bố")}</p></section>)}
          {!consult.open ? (
            <Button onClick={() => setConsult(c => ({ ...c, open: true }))}><Icon name="message" size="small" />{isEn ? "Request a consultation" : "Yêu cầu tư vấn gói này"}</Button>
          ) : (
            <section className="product-consult-form">
              <h3>{isEn ? "Request a consultation" : "Yêu cầu tư vấn"}</h3>
              <Textarea label={isEn ? "What would you like to know?" : "Bạn muốn được tư vấn điều gì?"} rows={3} value={consult.message} disabled={consult.busy}
                onChange={message => setConsult(c => ({ ...c, message: message.slice(0, 2000) }))} />
              <Input label={isEn ? "Phone (optional)" : "Số điện thoại liên hệ (không bắt buộc)"} inputMode="numeric" value={consult.phone} disabled={consult.busy}
                onChange={phone => setConsult(c => ({ ...c, phone }))} />
              {consult.error && <Alert tone="danger" title={consult.error} />}
              <div className="product-consult-actions">
                <Button variant="secondary" disabled={consult.busy} onClick={() => setConsult(c => ({ ...c, open: false }))}>{isEn ? "Cancel" : "Hủy"}</Button>
                <Button disabled={consult.busy || consult.message.trim().length < 3} onClick={sendConsult}>{consult.busy ? (isEn ? "Sending…" : "Đang gửi…") : (isEn ? "Send request" : "Gửi yêu cầu")}</Button>
              </div>
            </section>
          )}</div>}
      </Modal>
    </div>
  );
}
