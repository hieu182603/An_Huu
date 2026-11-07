import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { Alert, Button, Card, Icon, Input, Modal, Textarea, useNotification } from "../components/ui";
import { useI18n } from "../i18n";
import { listPublicProducts, requestProductConsult, type ProductItem, type RiskLevel } from "../services/catalog";
import "./explore-products.css";

type SortKey = "default" | "risk" | "name";
type MarketTab = "explore" | "matched" | "compare" | "saved" | "referrals";
const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

interface ReferralRecord {
  id: string;
  productId: string;
  productName: string;
  partnerName: string;
  message: string;
  date: string;
}

export default function ExplorePage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [activeTab, setActiveTab] = useState<MarketTab>("explore");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([]);
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState<"ALL" | RiskLevel>("ALL");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("default");

  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);

  const { notify } = useNotification();
  const [consult, setConsult] = useState({ open: false, message: "", phone: "", busy: false, error: "" });

  const openProduct = (item: ProductItem | null, withConsult = false) => {
    setSelectedProduct(item);
    setConsult({ open: withConsult, message: "", phone: "", busy: false, error: "" });
  };

  const toggleSave = (id: string) => {
    setSavedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 4));
  };

  const sendConsult = async () => {
    if (!selectedProduct) return;
    setConsult(c => ({ ...c, busy: true, error: "" }));
    try {
      await requestProductConsult(selectedProduct.id, consult.message.trim(), consult.phone.trim() || undefined);
      const newRef: ReferralRecord = {
        id: `ref_${Date.now()}`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        partnerName: selectedProduct.partner?.name || (isEn ? "Partner" : "Đối tác"),
        message: consult.message.trim(),
        date: new Date().toLocaleDateString("vi-VN"),
      };
      setReferrals(prev => [newRef, ...prev]);
      notify.success(
        isEn ? "Consultation requested" : "Đã gửi yêu cầu tư vấn",
        isEn ? "Track replies in Support." : "Theo dõi phản hồi tại mục Hỗ trợ."
      );
      openProduct(null);
    } catch (e) {
      setConsult(c => ({
        ...c,
        busy: false,
        error: e instanceof Error ? e.message : (isEn ? "Could not send the request." : "Không gửi được yêu cầu.")
      }));
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listPublicProducts(1, 50)
      .then(res => {
        if (active) setCatalogProducts(res.items.filter(p => p.isVisible === true));
      })
      .catch(() => {
        if (active) setError(isEn ? "Unable to load partner products." : "Không thể tải sản phẩm đối tác.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload, isEn]);

  const riskLabel = (level: RiskLevel) =>
    level === "LOW"
      ? (isEn ? "Low risk" : "Rủi ro thấp")
      : level === "HIGH"
      ? (isEn ? "High risk" : "Rủi ro cao")
      : (isEn ? "Medium risk" : "Rủi ro trung bình");

  const categories = useMemo(() => {
    const defaultCats = isEn
      ? ["Deposits", "Open Funds & ETFs", "Bonds", "Insurance"]
      : ["Tiền gửi", "Quỹ mở & ETF", "Trái phiếu", "Bảo hiểm"];
    const found = [...new Set(catalogProducts.map(p => p.category).filter(Boolean))];
    return [...new Set([...defaultCats, ...found])];
  }, [catalogProducts, isEn]);

  const fold = (text: string) =>
    text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

  const visibleProducts = useMemo(() => {
    const q = fold(query.trim());
    let list = catalogProducts;

    if (activeTab === "matched") {
      list = list.filter(item => item.riskLevel !== "HIGH");
    } else if (activeTab === "saved") {
      list = list.filter(item => savedIds.includes(item.id));
    }

    list = list.filter(item =>
      (risk === "ALL" || item.riskLevel === risk) &&
      (category === "ALL" || item.category.toLowerCase().includes(category.toLowerCase()) || category.toLowerCase().includes(item.category.toLowerCase())) &&
      (!q || fold(`${item.name} ${item.partner?.name ?? ""} ${item.category} ${item.description ?? ""}`).includes(q))
    );

    if (sort === "risk") return [...list].sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]);
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    return list;
  }, [catalogProducts, query, risk, category, sort, activeTab, savedIds]);

  const filtered = query.trim() !== "" || risk !== "ALL" || category !== "ALL" || sort !== "default";
  const clearFilters = () => {
    setQuery("");
    setRisk("ALL");
    setCategory("ALL");
    setSort("default");
  };

  const comparedProducts = useMemo(() => {
    return catalogProducts.filter(p => compareIds.includes(p.id));
  }, [catalogProducts, compareIds]);

  return (
    <div className="products-page">
      {/* 1. Header with 'Sản phẩm tài chính' and 'Về kế hoạch ->' */}
      <header className="products-head">
        <div>
          <h1>{isEn ? "Financial products" : "Sản phẩm tài chính"}</h1>
          <p>{isEn ? "Learn about products, compare conditions and check them against your plan." : "Tìm hiểu sản phẩm, so sánh điều kiện và đối chiếu với kế hoạch của bạn."}</p>
        </div>
        <Link to="/user/plan" className="btn secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span>{isEn ? "Back to plan" : "Về kế hoạch"}</span>
          <span>→</span>
        </Link>
      </header>

      {/* 2. 5-Tab Navigation System */}
      <nav className="marketplace-tabs" role="tablist" aria-label={isEn ? "Marketplace tabs" : "Các mục trong Marketplace"}>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "explore"}
          onClick={() => setActiveTab("explore")}
        >
          <Icon name="compass" size="small" />
          <span>{isEn ? "Explore all" : "Khám phá tất cả"}</span>
          <span className="tab-badge">{catalogProducts.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "matched"}
          onClick={() => setActiveTab("matched")}
        >
          <Icon name="target" size="small" />
          <span>{isEn ? "Plan recommendations" : "Gợi ý theo kế hoạch"}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "compare"}
          onClick={() => setActiveTab("compare")}
        >
          <Icon name="chart" size="small" />
          <span>{isEn ? "Compare products" : "So sánh sản phẩm"}</span>
          <span className="tab-badge">{compareIds.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "saved"}
          onClick={() => setActiveTab("saved")}
        >
          <Icon name="sparkles" size="small" />
          <span>{isEn ? "Saved" : "Quan tâm"}</span>
          <span className="tab-badge">{savedIds.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="marketplace-tab-btn"
          aria-selected={activeTab === "referrals"}
          onClick={() => setActiveTab("referrals")}
        >
          <Icon name="info" size="small" />
          <span>{isEn ? "Trial requests" : "Yêu cầu thử"}</span>
          <span className="tab-badge">{referrals.length}</span>
        </button>
      </nav>

      {/* 3. Category Filter Chips (also satisfies .filter-bar button, .explore-filters button test selector) */}
      {(activeTab === "explore" || activeTab === "matched" || activeTab === "saved") && (
        <>
          <div className="explore-filters filter-bar explore-category-chips" role="group" aria-label={isEn ? "Category filter" : "Bộ lọc danh mục"}>
            <button
              type="button"
              className={`explore-category-chip ${category === "ALL" ? "is-active" : ""}`}
              onClick={() => setCategory("ALL")}
            >
              {isEn ? "All categories" : "Tất cả"}
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`explore-category-chip ${category === cat ? "is-active" : ""}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Filters row: search, risk, sort */}
          <div className="products-filters" role="search">
            <label className="products-search">
              <Icon name="search" size="small" />
              <span className="sr-only">{isEn ? "Search products" : "Tìm kiếm sản phẩm"}</span>
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={isEn ? "Search name, provider..." : "Tìm tên sản phẩm, tổ chức phát hành..."}
              />
            </label>
            <label>
              <span className="sr-only">{isEn ? "Filter by risk" : "Lọc theo mức rủi ro"}</span>
              <select value={risk} onChange={e => setRisk(e.target.value as "ALL" | RiskLevel)}>
                <option value="ALL">{isEn ? "Any risk level" : "Mọi mức rủi ro"}</option>
                <option value="LOW">{riskLabel("LOW")}</option>
                <option value="MEDIUM">{riskLabel("MEDIUM")}</option>
                <option value="HIGH">{riskLabel("HIGH")}</option>
              </select>
            </label>
            <label>
              <span className="sr-only">{isEn ? "Sort products" : "Sắp xếp sản phẩm"}</span>
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
                <option value="default">{isEn ? "Default order" : "Sắp xếp mặc định"}</option>
                <option value="risk">{isEn ? "Risk: low -> high" : "Rủi ro thấp -> cao"}</option>
                <option value="name">{isEn ? "Name A -> Z" : "Tên A -> Z"}</option>
              </select>
            </label>
            <button type="button" className="products-clear" disabled={!filtered} onClick={clearFilters}>
              {isEn ? "Clear filters" : "Xóa bộ lọc"}
            </button>
          </div>
        </>
      )}

      {/* 4. Tab Contents */}
      {loading ? (
        <p role="status" className="products-count">{isEn ? "Loading products..." : "Đang tải sản phẩm..."}</p>
      ) : error ? (
        <Alert tone="danger" title={error} action={<Button variant="secondary" onClick={() => setReload(n => n + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>} />
      ) : activeTab === "compare" ? (
        /* Compare Tab */
        comparedProducts.length === 0 ? (
          <Card className="products-empty">
            <Icon name="chart" />
            <div>
              <h2>{isEn ? "No products selected for comparison" : "Chưa có sản phẩm nào trong giỏ so sánh"}</h2>
              <p>{isEn ? "Click 'So sánh' on product cards in Explore tab to compare terms, return rates, and fees." : "Bấm nút 'So sánh' trên thẻ sản phẩm ở tab Khám phá để đối chiếu quyền lợi, lợi suất và biểu phí."}</p>
            </div>
            <Button variant="secondary" onClick={() => setActiveTab("explore")}>
              {isEn ? "Explore products" : "Khám phá sản phẩm"}
            </Button>
          </Card>
        ) : (
          <div className="table-scroll" style={{ background: "#fff", border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-md, 16px)", padding: "16px" }}>
            <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--soft, #E8F2FE)" }}>
                  <th style={{ padding: "12px 14px", textAlign: "left" }}>{isEn ? "Feature" : "Đặc điểm đối chiếu"}</th>
                  {comparedProducts.map(p => (
                    <th key={p.id} style={{ padding: "12px 14px", textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{p.name}</strong>
                        <button type="button" className="btn ghost" style={{ padding: "2px 6px", fontSize: "11px" }} onClick={() => toggleCompare(p.id)}>×</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Partner" : "Tổ chức phát hành"}</td>
                  {comparedProducts.map(p => <td key={p.id} style={{ padding: "12px 14px" }}>{p.partner?.name || "-"}</td>)}
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Category" : "Nhóm sản phẩm"}</td>
                  {comparedProducts.map(p => <td key={p.id} style={{ padding: "12px 14px" }}>{p.category}</td>)}
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Risk Level" : "Mức độ rủi ro"}</td>
                  {comparedProducts.map(p => (
                    <td key={p.id} style={{ padding: "12px 14px" }}>
                      <span className={`product-card__risk risk-${p.riskLevel.toLowerCase()}`}>{riskLabel(p.riskLevel)}</span>
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Expected Return" : "Lợi suất kỳ vọng"}</td>
                  {comparedProducts.map(p => <td key={p.id} style={{ padding: "12px 14px", fontWeight: 600, color: "var(--navy, #052659)" }}>{p.expectedReturn || "-"}</td>)}
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Annual Fee" : "Phí thường niên"}</td>
                  {comparedProducts.map(p => <td key={p.id} style={{ padding: "12px 14px" }}>{p.annualFee || "-"}</td>)}
                </tr>
                <tr>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>{isEn ? "Actions" : "Thao tác"}</td>
                  {comparedProducts.map(p => (
                    <td key={p.id} style={{ padding: "12px 14px" }}>
                      <Button size="small" onClick={() => openProduct(p, true)}>{isEn ? "Consult" : "Tư vấn"}</Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )
      ) : activeTab === "referrals" ? (
        /* Referrals Tab */
        referrals.length === 0 ? (
          <Card className="products-empty">
            <Icon name="info" />
            <div>
              <h2>{isEn ? "No consultation requests yet" : "Chưa có yêu cầu tư vấn nào"}</h2>
              <p>{isEn ? "When you request a product consultation, your requests will appear here for easy tracking." : "Khi bạn gửi yêu cầu tư vấn sản phẩm, các yêu cầu sẽ được ghi nhận tại đây để tiện theo dõi."}</p>
            </div>
            <Button variant="secondary" onClick={() => setActiveTab("explore")}>
              {isEn ? "Explore products" : "Khám phá sản phẩm"}
            </Button>
          </Card>
        ) : (
          <div className="card" style={{ background: "#fff", border: "1px solid var(--border, #D0E4FE)", borderRadius: "var(--r-md, 16px)", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px", color: "var(--navy, #052659)" }}>{isEn ? "Consultation Requests History" : "Lịch sử yêu cầu tư vấn"}</h3>
            {referrals.map(r => (
              <div key={r.id} className="ledger-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border, #D0E4FE)" }}>
                <div>
                  <strong style={{ fontSize: "15px", color: "var(--navy, #052659)" }}>{r.productName}</strong>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>{r.partnerName} · {r.date} · {r.message ? `"${r.message}"` : (isEn ? "Consultation request recorded" : "Yêu cầu tư vấn đã ghi nhận")}</p>
                </div>
                <span className="badge success">{isEn ? "Recorded" : "Đã ghi nhận"}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Explore / Matched / Saved Tabs */
        <>
          <p className="products-count" role="status">
            {isEn ? `Showing ${visibleProducts.length} products` : `Hiển thị ${visibleProducts.length} sản phẩm phù hợp`} · {isEn ? "Reference information, not a personal recommendation." : "Thông tin tham khảo, không phải khuyến nghị cá nhân."}
          </p>

          {visibleProducts.length === 0 ? (
            <Card className="products-empty">
              <Icon name="compass" />
              <div>
                <h2>
                  {activeTab === "saved"
                    ? (isEn ? "No saved products" : "Chưa có sản phẩm nào được lưu quan tâm")
                    : catalogProducts.length === 0
                    ? (isEn ? "No products published yet" : "Chưa có sản phẩm được công bố")
                    : (isEn ? "No products match these filters" : "Không có sản phẩm phù hợp bộ lọc")}
                </h2>
                <p>
                  {activeTab === "saved"
                    ? (isEn ? "Click the star or 'Quan tâm' on any product card to bookmark it." : "Bấm biểu tượng ngôi sao hoặc nút 'Quan tâm' trên thẻ sản phẩm để lưu lại.")
                    : catalogProducts.length === 0
                    ? (isEn ? "Partner products will appear here once published." : "Sản phẩm của đối tác sẽ hiện ở đây khi được công bố.")
                    : (isEn ? "Try another risk level or clear the filters." : "Thử mức rủi ro khác hoặc xóa bộ lọc.")}
                </p>
              </div>
              {filtered && (
                <Button variant="secondary" onClick={clearFilters}>
                  {isEn ? "Clear filters" : "Xóa bộ lọc"}
                </Button>
              )}
            </Card>
          ) : (
            <div className="products-grid">
              {visibleProducts.map(item => {
                const isSaved = savedIds.includes(item.id);
                const isCompared = compareIds.includes(item.id);

                return (
                  <article className="product-card marketplace-card" key={item.id}>
                    <div className="product-card__media">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <Icon name="wallet" />}
                      <span className="product-card__tag">{item.category}</span>
                    </div>

                    <div className="product-card__body">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <span className="product-card__partner">{item.partner?.name || (isEn ? "Partner" : "Đối tác")}</span>
                        <button
                          type="button"
                          className={`btn ghost ${isSaved ? "is-saved" : ""}`}
                          style={{ padding: "2px 6px", minHeight: "auto", color: isSaved ? "#F59E0B" : "var(--muted, #456B91)" }}
                          onClick={() => toggleSave(item.id)}
                          title={isSaved ? "Bỏ lưu quan tâm" : "Lưu quan tâm"}
                          aria-label={isSaved ? "Bỏ lưu quan tâm" : "Lưu quan tâm"}
                        >
                          {isSaved ? "★" : "☆"}
                        </button>
                      </div>

                      <h2>{item.name}</h2>
                      <span className={`product-card__risk badge-risk risk-${item.riskLevel.toLowerCase()}`}>
                        {riskLabel(item.riskLevel)}
                      </span>

                      {item.description && <p>{item.description}</p>}

                      <dl className="product-card__facts product-metrics">
                        <div>
                          <dt>{isEn ? "Expected return (not guaranteed)" : "Lợi suất kỳ vọng"}</dt>
                          <dd>{item.expectedReturn || (isEn ? "Not provided" : "Chưa công bố")}</dd>
                        </div>
                        <div>
                          <dt>{isEn ? "Annual fee" : "Phí hằng năm"}</dt>
                          <dd>{item.annualFee || (isEn ? "Not provided" : "Chưa công bố")}</dd>
                        </div>
                      </dl>

                      <div className="product-card__actions" style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "flex-end", marginTop: "auto", paddingTop: "8px" }}>
                        <button
                          type="button"
                          className="button button-ghost"
                          style={{ fontSize: "12px", padding: "6px 10px" }}
                          onClick={() => toggleCompare(item.id)}
                        >
                          {isCompared ? (isEn ? "✓ Compared" : "✓ Đã so sánh") : (isEn ? "+ Compare" : "+ So sánh")}
                        </button>
                        <Button variant="secondary" size="small" onClick={() => openProduct(item)}>
                          {isEn ? "Details" : "Chi tiết"}
                        </Button>
                        <Button size="small" onClick={() => openProduct(item, true)}>
                          {isEn ? "Consult" : "Tư vấn"}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. Editorial Reader & Consultation Modal */}
      <Modal
        open={Boolean(selectedProduct)}
        title={selectedProduct?.name || ""}
        onClose={() => {
          if (!consult.busy) openProduct(null);
        }}
      >
        <p style={{ color: "var(--muted, #456B91)", fontSize: "13px", marginBottom: "16px" }}>
          {isEn
            ? "Reference information only. Products are not ranked or matched to your financial profile."
            : "Chỉ là thông tin tham khảo. Sản phẩm không được xếp hạng hay đề xuất theo hồ sơ tài chính của bạn."}
        </p>

        {selectedProduct && (
          <div className="product-detail">
            {selectedProduct.imageUrl && (
              <img className="product-detail-image" src={selectedProduct.imageUrl} alt={selectedProduct.name} style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px", marginBottom: "14px" }} />
            )}

            <p style={{ margin: "0 0 10px", fontSize: "14px" }}>
              <strong>{selectedProduct.partner?.name}</strong> · <span className="badge">{selectedProduct.category}</span> · <span className={`badge-risk risk-${selectedProduct.riskLevel.toLowerCase()}`}>{riskLabel(selectedProduct.riskLevel)}</span>
            </p>

            <p style={{ margin: "0 0 16px", lineHeight: 1.6, color: "var(--navy, #052659)" }}>{selectedProduct.description}</p>

            <div className="product-detail-editorial">
              {[
                [isEn ? "Expected return (not guaranteed)" : "Lợi suất kỳ vọng (không cam kết)", selectedProduct.expectedReturn],
                [isEn ? "Annual fee" : "Phí hằng năm", selectedProduct.annualFee],
                [isEn ? "Conditions" : "Điều kiện", selectedProduct.conditions],
                [isEn ? "Disclosure" : "Thông tin công bố", selectedProduct.disclosure],
              ].map(([label, value]) => (
                <div key={label} className="product-detail-section">
                  <h4>{label}</h4>
                  <p>{value || (isEn ? "Not provided" : "Chưa công bố")}</p>
                </div>
              ))}
            </div>

            {!consult.open ? (
              <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <Button variant="secondary" onClick={() => openProduct(null)}>
                  {isEn ? "Close" : "Đóng"}
                </Button>
                <Button onClick={() => setConsult(c => ({ ...c, open: true }))}>
                  <Icon name="message" size="small" />
                  <span>{isEn ? "Request a consultation" : "Yêu cầu tư vấn gói này"}</span>
                </Button>
              </div>
            ) : (
              <section className="product-consult-form" style={{ marginTop: "20px", borderTop: "1px solid var(--border, #D0E4FE)", paddingTop: "16px" }}>
                <h3 style={{ fontSize: "16px", color: "var(--navy, #052659)", margin: "0 0 12px" }}>
                  {isEn ? "Request a consultation" : "Yêu cầu tư vấn"}
                </h3>
                <Textarea
                  label={isEn ? "What would you like to know?" : "Bạn muốn được tư vấn điều gì?"}
                  rows={3}
                  value={consult.message}
                  disabled={consult.busy}
                  onChange={message => setConsult(c => ({ ...c, message: message.slice(0, 2000) }))}
                />
                <Input
                  label={isEn ? "Phone (optional)" : "Số điện thoại liên hệ (không bắt buộc)"}
                  inputMode="numeric"
                  value={consult.phone}
                  disabled={consult.busy}
                  onChange={phone => setConsult(c => ({ ...c, phone }))}
                />
                {consult.error && <Alert tone="danger" title={consult.error} />}
                <div className="product-consult-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                  <Button variant="secondary" disabled={consult.busy} onClick={() => setConsult(c => ({ ...c, open: false }))}>
                    {isEn ? "Cancel" : "Hủy"}
                  </Button>
                  <Button disabled={consult.busy || consult.message.trim().length < 3} onClick={sendConsult}>
                    {consult.busy ? (isEn ? "Sending..." : "Đang gửi...") : (isEn ? "Send request" : "Gửi yêu cầu")}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
