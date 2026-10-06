import { useState, useMemo, useEffect, useRef } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  Icon,
  Input,
  Modal,
  Pagination,
  SearchField,
  Select,
  Switch,
  Tabs,
  Textarea,
  Avatar,
  type IconName,
} from "../../components/ui";
import { downloadCsv } from "../../utils/downloads";
import { useI18n } from "../../i18n";
import { listAdminPartners, listAdminProducts, updateAdminProduct, type PartnerItem, type ProductItem } from "../../services/catalog";

export { default as AdminContentPage } from "./AdminContentApi";

export type PartnerOrg = {
  id: string;
  name: string;
  type: "Ngân hàng thương mại" | "Công ty Quản lý Quỹ" | "Công ty Bảo hiểm Nhân thọ";
  productsCount: number;
  contactPerson: string;
  contactEmail: string;
  status: "Đang hợp tác" | "Đang rà soát hợp đồng";
  rating: string;
};

export type FinancialProduct = {
  id: string;
  name: string;
  partnerName: string;
  partnerType: string;
  category: "Quỹ mở cổ phiếu/trái phiếu" | "Bảo hiểm hưu trí tự nguyện" | "Tiết kiệm mục tiêu";
  riskTier: "Rủi ro thấp" | "Rủi ro trung bình" | "Rủi ro cao";
  annualFee: string;
  conditions: string;
  disclosure: string;
  isVisible: boolean;
  status: "Đang phân phối" | "Tạm dừng";
};

export function AdminPartnersPage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [activeTabKey, setActiveTabKey] = useState<"products" | "partners">("products");
  const tabProductsLabel = isEn ? "Financial Products" : "Sản phẩm tài chính";
  const tabPartnersLabel = isEn ? "Partner Organizations" : "Tổ chức đối tác";

  const [products, setProducts] = useState<FinancialProduct[]>([]);
  const [partners, setPartners] = useState<PartnerOrg[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [savingProduct, setSavingProduct] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [riskFilterKey, setRiskFilterKey] = useState<string>("ALL");
  const [selectedProduct, setSelectedProduct] = useState<FinancialProduct | null>(null);

  const riskOptions = useMemo(
    () => [
      { key: "ALL", label: isEn ? "All risk tiers" : "Tất cả mức rủi ro" },
      { key: "Rủi ro thấp", label: isEn ? "Low risk" : "Rủi ro thấp" },
      { key: "Rủi ro trung bình", label: isEn ? "Medium risk" : "Rủi ro trung bình" },
      { key: "Rủi ro cao", label: isEn ? "High risk" : "Rủi ro cao" },
    ],
    [isEn]
  );

  // Stats
  const stats = useMemo(() => {
    const totalPartners = partners.length;
    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.isVisible && p.status === "Đang phân phối").length;
    const pausedProducts = products.filter((p) => p.status === "Tạm dừng").length;
    return { totalPartners, totalProducts, activeProducts, pausedProducts };
  }, [partners, products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      const matchSearch =
        search === "" ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.partnerName.toLowerCase().includes(search.toLowerCase());
      const matchRisk = riskFilterKey === "ALL" || item.riskTier === riskFilterKey;
      return matchSearch && matchRisk;
    });
  }, [products, search, riskFilterKey]);

  // Filter partners
  const filteredPartners = useMemo(() => {
    return partners.filter((item) => {
      return (
        search === "" ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.contactPerson.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [partners, search]);

  const rawProductsRef = useRef<Map<string, ProductItem>>(new Map());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    Promise.all([listAdminPartners(1, 50), listAdminProducts(1, 50)])
      .then(([partnersRes, productsRes]) => {
        if (!active) return;
        if (partnersRes.items) {
          setPartners(partnersRes.items.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type === "BANK" ? "Ngân hàng thương mại" : p.type === "INSURANCE" ? "Công ty Bảo hiểm Nhân thọ" : "Công ty Quản lý Quỹ",
            productsCount: productsRes.items.filter(item => item.partnerId === p.id).length,
            contactPerson: p.contactEmail || "Đang cập nhật",
            contactEmail: p.contactEmail || "Chưa công bố",
            status: p.isVisible ? "Đang hợp tác" : "Đang rà soát hợp đồng",
            rating: "Chưa công bố",
          })));
        }
        if (productsRes.items) {
          const map = new Map<string, ProductItem>();
          productsRes.items.forEach(item => map.set(item.id, item));
          rawProductsRef.current = map;
          setProducts(productsRes.items.map(item => ({
            id: item.id,
            name: item.name,
            partnerName: item.partner?.name || "Đối tác liên kết",
            partnerType: item.partner?.type === "BANK" ? "Ngân hàng thương mại" : item.partner?.type === "INSURANCE" ? "Công ty Bảo hiểm Nhân thọ" : "Công ty Quản lý Quỹ",
            category: item.category as FinancialProduct["category"] || "Quỹ mở cổ phiếu/trái phiếu",
            riskTier: item.riskLevel === "LOW" ? "Rủi ro thấp" : item.riskLevel === "HIGH" ? "Rủi ro cao" : "Rủi ro trung bình",
            annualFee: item.annualFee || "Theo biểu phí niêm yết",
            conditions: item.conditions || item.description || "",
            disclosure: item.disclosure || "Chưa công bố",
            isVisible: item.isVisible,
            status: item.isVisible ? "Đang phân phối" : "Tạm dừng",
          })));
        }
      })
      .catch(() => { if (active) setLoadError(isEn ? "Unable to load catalog." : "Không thể tải danh mục đối tác."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, isEn]);

  const handleToggleProductVisibility = async (id: string) => {
    const raw = rawProductsRef.current.get(id);
    const target = products.find(p => p.id === id);
    const nextVisible = target ? !target.isVisible : true;

    if (savingProduct || !raw || typeof raw.revision !== "number") return;
    setSavingProduct(id);
    setLoadError("");
    if (raw && typeof raw.revision === "number") {
      try {
        const updated = await updateAdminProduct(id, raw.revision, {
          partnerId: raw.partnerId,
          name: raw.name,
          category: raw.category,
          expectedReturn: raw.expectedReturn,
          riskLevel: raw.riskLevel,
          description: raw.description,
          annualFee: raw.annualFee,
          conditions: raw.conditions,
          disclosure: raw.disclosure,
          isVisible: nextVisible,
        });
        rawProductsRef.current.set(id, updated);
        setProducts(prev => prev.map(p => p.id === id ? { ...p, isVisible: updated.isVisible, status: updated.isVisible ? "Đang phân phối" : "Tạm dừng" } : p));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Không thể lưu thay đổi.");
      } finally { setSavingProduct(null); }
    }
  };

  const getRiskTone = (tier: FinancialProduct["riskTier"]) => {
    switch (tier) {
      case "Rủi ro thấp":
        return "success";
      case "Rủi ro trung bình":
        return "warning";
      case "Rủi ro cao":
        return "danger";
    }
  };

  const formatRiskTier = (tier: FinancialProduct["riskTier"]) => {
    if (!isEn) return tier;
    switch (tier) {
      case "Rủi ro thấp":
        return "Low Risk";
      case "Rủi ro trung bình":
        return "Medium Risk";
      case "Rủi ro cao":
        return "High Risk";
    }
  };

  const formatCategory = (category: FinancialProduct["category"]) => {
    if (!isEn) return category;
    switch (category) {
      case "Quỹ mở cổ phiếu/trái phiếu":
        return "Mutual Fund";
      case "Bảo hiểm hưu trí tự nguyện":
        return "Retirement Insurance";
      case "Tiết kiệm mục tiêu":
        return "Target Savings";
    }
  };

  const formatPartnerType = (type: PartnerOrg["type"]) => {
    if (!isEn) return type;
    switch (type) {
      case "Công ty Quản lý Quỹ":
        return "Fund Management Company";
      case "Công ty Bảo hiểm Nhân thọ":
        return "Life Insurance Company";
      case "Ngân hàng thương mại":
        return "Commercial Bank";
    }
  };

  return (
    <div className="admin-page business-page">
      {loading && <p role="status">{isEn ? "Loading catalog…" : "Đang tải danh mục…"}</p>}
      {loadError && <Alert tone="danger" title={loadError} action={<Button onClick={() => setReload(n => n + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>} />}
      <p className="catalog-scope">{isEn ? "Showing up to 50 records returned by the service." : "Hiển thị tối đa 50 bản ghi do dịch vụ trả về."}</p>
      <header className="admin-page-header">
        <div>
          <span>{isEn ? "PARTNERS & SOLUTIONS" : "ĐỐI TÁC VÀ GIẢI PHÁP"}</span>
          <h1>{isEn ? "Partners & Financial Products (AD06)" : "Đối tác & Sản phẩm tài chính (AD06)"}</h1>
          <p>
            {isEn
              ? "Manage affiliate organizations, mutual funds, insurance distribution, and commission transparency."
              : "Quản lý tổ chức liên kết, phân phối sản phẩm quỹ mở, bảo hiểm và minh bạch hoa hồng."}
          </p>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="business-summary-grid">
        <Card className="business-summary-card">
          <div className="summary-card-icon">
            <Icon name="briefcase" />
          </div>
          <div>
            <small>{isEn ? "Partner Organizations" : "Tổ chức đối tác"}</small>
            <strong>{stats.totalPartners}</strong>
            <span>{isEn ? "Contracted affiliates" : "Đã ký hợp đồng liên kết"}</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-info">
            <Icon name="target" />
          </div>
          <div>
            <small>{isEn ? "Financial Products" : "Sản phẩm tài chính"}</small>
            <strong>{stats.totalProducts}</strong>
            <span>{isEn ? "Funds, Savings, Insurance" : "Quỹ mở, Tiết kiệm, BH"}</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-success">
            <Icon name="circle-check" />
          </div>
          <div>
            <small>{isEn ? "Visible to Members" : "Đang hiển thị cho người dùng"}</small>
            <strong>{stats.activeProducts}</strong>
            <span>{isEn ? "Full commission transparency" : "Đầy đủ minh bạch hoa hồng"}</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-warning">
            <Icon name="alert" />
          </div>
          <div>
            <small>{isEn ? "Distribution Suspended" : "Tạm dừng phân phối"}</small>
            <strong>{stats.pausedProducts}</strong>
            <span>{isEn ? "Fee schedule update needed" : "Cần cập nhật biểu phí"}</span>
          </div>
        </Card>
      </div>

      {/* Main Container */}
      <Card className="business-table-card">
        <div className="content-type-tabs">
          <Tabs
            active={activeTabKey === "products" ? tabProductsLabel : tabPartnersLabel}
            items={[tabProductsLabel, tabPartnersLabel]}
            onChange={(item) => setActiveTabKey(item === tabProductsLabel ? "products" : "partners")}
          />
        </div>

        <header className="admin-table-toolbar">
          <div className="admin-filter-group">
            <div className="business-search">
              <SearchField
                label={isEn ? "Search" : "Tìm kiếm"}
                placeholder={
                  activeTabKey === "products"
                    ? isEn
                      ? "Search product name or fund manager..."
                      : "Tìm tên sản phẩm hoặc quỹ phát hành..."
                    : isEn
                    ? "Search organization name, contact person..."
                    : "Tìm tên tổ chức, đại diện liên hệ..."
                }
                value={search}
                onChange={setSearch}
              />
            </div>
            {activeTabKey === "products" && (
              <Select
                label={isEn ? "Risk Tier" : "Mức độ rủi ro"}
                options={riskOptions.map((o) => o.label)}
                value={riskOptions.find((o) => o.key === riskFilterKey)?.label || riskOptions[0].label}
                onChange={(val) => {
                  const found = riskOptions.find((o) => o.label === val);
                  setRiskFilterKey(found ? found.key : "ALL");
                }}
              />
            )}
          </div>
        </header>

        {/* FINANCIAL PRODUCTS VIEW */}
        {activeTabKey === "products" && (
          <>
            <div className="business-table-scroll">
              <table className="business-table product-table">
                <thead>
                  <tr>
                    <th>{isEn ? "Product / Issuer" : "Sản phẩm / Tổ chức"}</th>
                    <th>{isEn ? "Category" : "Loại hình"}</th>
                    <th>{isEn ? "Risk Tier" : "Mức độ rủi ro"}</th>
                    <th>{isEn ? "Annual Mgmt Fee" : "Phí quản lý / năm"}</th>
                    <th>{isEn ? "Eligibility" : "Điều kiện tham gia"}</th>
                    <th>{isEn ? "Commission & Risk Disclosure" : "Minh bạch hoa hồng & Rủi ro"}</th>
                    <th>{isEn ? "Visibility" : "Hiển thị"}</th>
                    <th style={{ textAlign: "right" }}>{isEn ? "Action" : "Thao tác"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="partner-name">
                          <span>
                            <Icon name="wallet" />
                          </span>
                          <div>
                            <strong>{item.name}</strong>
                            <small>{item.partnerName}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone="soft">{formatCategory(item.category)}</Badge>
                      </td>
                      <td>
                        <Badge tone={getRiskTone(item.riskTier)}>{formatRiskTier(item.riskTier)}</Badge>
                      </td>
                      <td>
                        <strong style={{ color: "var(--color-midnight-900)" }}>{item.annualFee}</strong>
                      </td>
                      <td className="conditions-cell">
                        <small>{item.conditions}</small>
                      </td>
                      <td className="disclosure-cell">
                        <small style={{ color: "var(--color-text-muted)" }}>{item.disclosure}</small>
                      </td>
                      <td>
                        <Switch
                        disabled={Boolean(savingProduct) || loading}
                          checked={item.isVisible}
                          label={item.isVisible ? (isEn ? "Visible" : "Hiển thị") : (isEn ? "Hidden" : "Ẩn")}
                          onChange={() => handleToggleProductVisibility(item.id)}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => setSelectedProduct(item)}
                        >
                          {isEn ? "Details" : "Chi tiết"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="business-mobile-list">
              {filteredProducts.map((item) => (
                <Card key={item.id} className="business-mobile-card">
                  <header>
                    <Badge tone="soft">{formatCategory(item.category)}</Badge>
                    <Badge tone={getRiskTone(item.riskTier)}>{formatRiskTier(item.riskTier)}</Badge>
                  </header>
                  <h2>{item.name}</h2>
                  <p>{item.partnerName}</p>
                  <div>
                    <span>
                      {isEn ? "Mgmt fee:" : "Phí quản lý:"}
                      <strong>{item.annualFee}</strong>
                    </span>
                    <span>
                      {isEn ? "Status:" : "Trạng thái:"}
                      <strong>{item.status === "Đang phân phối" ? (isEn ? "Active" : "Đang phân phối") : (isEn ? "Paused" : "Tạm dừng")}</strong>
                    </span>
                  </div>
                  <Button variant="secondary" onClick={() => setSelectedProduct(item)}>
                    {isEn ? "View transparent details" : "Xem chi tiết minh bạch"}
                  </Button>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* PARTNER ORGS VIEW */}
        {activeTabKey === "partners" && (
          <>
            <div className="business-table-scroll">
              <table className="business-table partner-table">
                <thead>
                  <tr>
                    <th>{isEn ? "Partner Organization" : "Tổ chức đối tác"}</th>
                    <th>{isEn ? "Institution Type" : "Loại hình định chế"}</th>
                    <th>{isEn ? "Listed Products" : "Số sản phẩm niêm yết"}</th>
                    <th>{isEn ? "Contact Representative" : "Đại diện liên hệ"}</th>
                    <th>{isEn ? "Credit Rating" : "Hạng tín nhiệm"}</th>
                    <th>{isEn ? "Partnership Status" : "Trạng thái hợp tác"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="partner-name">
                          <span>
                            <Icon name="briefcase" />
                          </span>
                          <div>
                            <strong>{item.name}</strong>
                            <small>{item.id}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone="soft">{formatPartnerType(item.type)}</Badge>
                      </td>
                      <td>
                        <strong>{isEn ? `${item.productsCount} products` : `${item.productsCount} sản phẩm`}</strong>
                      </td>
                      <td>
                        <div>
                          <strong>{item.contactPerson}</strong>
                          <small style={{ display: "block", color: "var(--color-text-muted)" }}>
                            {item.contactEmail}
                          </small>
                        </div>
                      </td>
                      <td>
                        <Badge tone="info">{item.rating}</Badge>
                      </td>
                      <td>
                        <Badge tone={item.status === "Đang hợp tác" ? "success" : "warning"}>
                          {item.status === "Đang hợp tác" ? (isEn ? "Active Partner" : "Đang hợp tác") : (isEn ? "Under Review" : "Đang rà soát hợp đồng")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards for Partners */}
            <div className="business-mobile-list">
              {filteredPartners.map((item) => (
                <Card key={item.id} className="business-mobile-card">
                  <header>
                    <Badge tone="info">{isEn ? `Rating ${item.rating}` : `Hạng ${item.rating}`}</Badge>
                    <Badge tone={item.status === "Đang hợp tác" ? "success" : "warning"}>
                      {item.status === "Đang hợp tác" ? (isEn ? "Active Partner" : "Đang hợp tác") : (isEn ? "Under Review" : "Đang rà soát hợp đồng")}
                    </Badge>
                  </header>
                  <h2>{item.name}</h2>
                  <p>{formatPartnerType(item.type)}</p>
                  <div>
                    <span>
                      {isEn ? "Products:" : "Sản phẩm:"}
                      <strong>{isEn ? `${item.productsCount} packages` : `${item.productsCount} gói`}</strong>
                    </span>
                    <span>
                      {isEn ? "Contact:" : "Liên hệ:"}
                      <strong>{item.contactPerson}</strong>
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        <Pagination
          page={1}
          totalPages={1}
          totalItems={activeTabKey === "products" ? filteredProducts.length : filteredPartners.length}
          pageSize={10}
          showRowsPerPage={false}
        />
      </Card>

      {/* Product Detail Modal */}
      <Modal
        open={Boolean(selectedProduct)}
        title={selectedProduct ? selectedProduct.name : (isEn ? "Product Details" : "Chi tiết sản phẩm")}
        onClose={() => setSelectedProduct(null)}
      >
        {selectedProduct && (
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <div style={{ background: "rgba(23, 59, 87, 0.04)", padding: "var(--space-4)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
              <small style={{ color: "var(--color-text-muted)" }}>{isEn ? "Issuing / Managing Institution:" : "Tổ chức phát hành / Quản lý:"}</small>
              <h3 style={{ margin: "var(--space-1) 0", color: "var(--color-midnight-900)" }}>{selectedProduct.partnerName}</h3>
              <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "13px" }}>{selectedProduct.partnerType}</p>
            </div>

            <div className="modal-details-grid">
              <div>
                <small style={{ color: "var(--color-text-muted)" }}>{isEn ? "Risk Level:" : "Mức độ rủi ro:"}</small>
                <div style={{ marginTop: "var(--space-1)" }}>
                  <Badge tone={getRiskTone(selectedProduct.riskTier)}>{formatRiskTier(selectedProduct.riskTier)}</Badge>
                </div>
              </div>
              <div>
                <small style={{ color: "var(--color-text-muted)" }}>{isEn ? "Listed Management Fee:" : "Phí quản lý niêm yết:"}</small>
                <strong style={{ display: "block", marginTop: "var(--space-1)", color: "var(--color-midnight-900)", fontSize: "15px" }}>{selectedProduct.annualFee}</strong>
              </div>
            </div>

            <div>
              <small style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>{isEn ? "Eligibility Conditions:" : "Điều kiện tham gia:"}</small>
              <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-strong)", fontSize: "13px", lineHeight: 1.5 }}>
                {selectedProduct.conditions}
              </p>
            </div>

            <div style={{ padding: "var(--space-3)", background: "rgba(229, 169, 60, 0.12)", border: "1px solid rgba(229, 169, 60, 0.3)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text-strong)", fontWeight: 600, fontSize: "13px" }}>
                <Icon name="alert" /> {isEn ? "Commission Transparency & Risk Disclosure" : "Minh bạch hoa hồng & Cảnh báo rủi ro"}
              </div>
              <p style={{ margin: "var(--space-2) 0 0", color: "var(--color-text-muted)", fontSize: "12px", lineHeight: 1.5 }}>
                {selectedProduct.disclosure}
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
              <Button variant="secondary" onClick={() => setSelectedProduct(null)}>
                {isEn ? "Close" : "Đóng"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
