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
import AdminActionButton from "./AdminActionButton";
import { useI18n } from "../../i18n";
import { createAdminProduct, listAdminPartners, listAdminProducts, updateAdminProduct, uploadAdminImage, type PartnerItem, type ProductInput, type ProductItem } from "../../services/catalog";

const emptyProduct: ProductInput = { partnerId: "", name: "", category: "", expectedReturn: "", riskLevel: "MEDIUM", description: null, annualFee: null, conditions: null, disclosure: null, imageUrl: null, isVisible: false };
const RISK_OPTIONS = [{ value: "LOW", label: "Rủi ro thấp" }, { value: "MEDIUM", label: "Rủi ro trung bình" }, { value: "HIGH", label: "Rủi ro cao" }];

/** Create / edit a product package: content, image and visibility. */
function ProductEditor({ product, onClose, onSaved }: { product: ProductItem | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ProductInput>(() => product ? {
    partnerId: product.partnerId, name: product.name, category: product.category, expectedReturn: product.expectedReturn, riskLevel: product.riskLevel,
    description: product.description, annualFee: product.annualFee, conditions: product.conditions, disclosure: product.disclosure, imageUrl: product.imageUrl ?? null, isVisible: product.isVisible,
  } : emptyProduct);
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { listAdminPartners(1, 100).then((r) => setPartners(r.items)).catch(() => setError("Không tải được danh sách đối tác.")); }, []);
  const set = (patch: Partial<ProductInput>) => setForm((f) => ({ ...f, ...patch }));
  const text = (v: string) => v.trim() ? v : null;

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy("upload"); setError("");
    try { set({ imageUrl: await uploadAdminImage(file) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Không thể tải ảnh lên."); }
    finally { setBusy(""); }
  };
  const save = async () => {
    setBusy("save"); setError("");
    try {
      if (product) await updateAdminProduct(product.id, product.revision ?? 0, form);
      else await createAdminProduct(form);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể lưu sản phẩm."); }
    finally { setBusy(""); }
  };
  const ready = form.partnerId && form.name.trim().length >= 2 && form.category.trim().length >= 2;

  return (
    <Modal open title={product ? "Sửa gói sản phẩm" : "Thêm gói sản phẩm"} onClose={() => { if (!busy) onClose(); }}>
      <div className="product-editor">
        <Select label="Đối tác phát hành" options={[{ value: "", label: "— Chọn đối tác —" }, ...partners.map((p) => ({ value: p.id, label: p.name + (p.isVisible ? "" : " (đang ẩn)") }))]} value={form.partnerId} onChange={(partnerId) => set({ partnerId })} />
        <Input label="Tên gói sản phẩm" value={form.name} onChange={(name) => set({ name })} />
        <div className="product-editor-row">
          <Input label="Loại hình" placeholder="VD: Bảo hiểm hưu trí tự nguyện" value={form.category} onChange={(category) => set({ category })} />
          <Select label="Mức rủi ro" options={RISK_OPTIONS} value={form.riskLevel} onChange={(riskLevel) => set({ riskLevel: riskLevel as ProductInput["riskLevel"] })} />
        </div>
        <div className="product-editor-image">
          {form.imageUrl ? <img src={form.imageUrl} alt="Ảnh gói sản phẩm" /> : <span>Chưa có ảnh</span>}
          <label className="button button-secondary button-small">
            {busy === "upload" ? "Đang tải ảnh…" : form.imageUrl ? "Đổi ảnh" : "Tải ảnh lên"}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!!busy} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {form.imageUrl && <Button variant="ghost" size="small" disabled={!!busy} onClick={() => set({ imageUrl: null })}>Gỡ ảnh</Button>}
        </div>
        <Textarea label="Mô tả gói" rows={4} value={form.description ?? ""} onChange={(v) => set({ description: text(v) })} />
        <Input label="Lợi suất kỳ vọng (không cam kết)" value={form.expectedReturn} onChange={(expectedReturn) => set({ expectedReturn })} />
        <Input label="Phí hằng năm" value={form.annualFee ?? ""} onChange={(v) => set({ annualFee: text(v) })} />
        <Textarea label="Điều kiện tham gia" rows={3} value={form.conditions ?? ""} onChange={(v) => set({ conditions: text(v) })} />
        <Textarea label="Công bố rủi ro & hoa hồng" rows={3} value={form.disclosure ?? ""} onChange={(v) => set({ disclosure: text(v) })} />
        <Switch label="Hiển thị cho người dùng (cần đủ phí, điều kiện, công bố rủi ro)" checked={form.isVisible} onChange={(isVisible) => set({ isVisible })} />
        {error && <Alert tone="danger" title="Chưa lưu được">{error}</Alert>}
        <div className="product-editor-actions">
          <Button variant="secondary" disabled={!!busy} onClick={onClose}>Hủy</Button>
          <Button disabled={!!busy || !ready} onClick={save}>{busy === "save" ? "Đang lưu…" : "Lưu gói sản phẩm"}</Button>
        </div>
      </div>
    </Modal>
  );
}

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

  const PAGE_SIZE = 10;
  const [activeTabKey, setActiveTabKey] = useState<"products" | "partners">("products");
  const tabProductsLabel = isEn ? "Financial Products" : "Sản phẩm tài chính";
  const tabPartnersLabel = isEn ? "Partner Organizations" : "Tổ chức đối tác";

  const [products, setProducts] = useState<FinancialProduct[]>([]);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotal, setProductsTotal] = useState(0);

  const [partners, setPartners] = useState<PartnerOrg[]>([]);
  const [partnersPage, setPartnersPage] = useState(1);
  const [partnersTotal, setPartnersTotal] = useState(0);

  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [savingProduct, setSavingProduct] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [riskFilterKey, setRiskFilterKey] = useState<string>("ALL");
  const [selectedProduct, setSelectedProduct] = useState<FinancialProduct | null>(null);
  const [editing, setEditing] = useState<ProductItem | "new" | null>(null);

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
    const totalPartners = partnersTotal;
    const totalProducts = productsTotal;
    const activeProducts = products.filter((p) => p.isVisible && p.status === "Đang phân phối").length;
    const pausedProducts = products.filter((p) => p.status === "Tạm dừng").length;
    return { totalPartners, totalProducts, activeProducts, pausedProducts };
  }, [partnersTotal, productsTotal, products]);

  // Filter products by risk tier on current page
  const filteredProducts = useMemo(() => {
    if (riskFilterKey === "ALL") return products;
    return products.filter((item) => item.riskTier === riskFilterKey);
  }, [products, riskFilterKey]);

  // Filter partners
  const filteredPartners = partners;

  const rawProductsRef = useRef<Map<string, ProductItem>>(new Map());

  // Initial load for overview stats
  useEffect(() => {
    let active = true;
    Promise.all([listAdminPartners(1, 1), listAdminProducts(1, 1)])
      .then(([partnersRes, productsRes]) => {
        if (!active) return;
        if (typeof partnersRes.total === "number") setPartnersTotal(partnersRes.total);
        if (typeof productsRes.total === "number") setProductsTotal(productsRes.total);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [reload]);

  // Paginated fetching based on active tab and search
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    const timer = setTimeout(async () => {
      try {
        if (activeTabKey === "products") {
          const productsRes = await listAdminProducts(productsPage, PAGE_SIZE, search.trim());
          if (!active) return;
          if (typeof productsRes.total === "number") setProductsTotal(productsRes.total);
          if (productsRes.items) {
            const map = new Map<string, ProductItem>();
            productsRes.items.forEach(item => map.set(item.id, item));
            rawProductsRef.current = map;
            setProducts(productsRes.items.map(item => ({
              id: item.id,
              name: item.name,
              partnerName: item.partner?.name || (isEn ? "Affiliate Partner" : "Đối tác liên kết"),
              partnerType: item.partner?.type === "BANK" ? "Ngân hàng thương mại" : item.partner?.type === "INSURANCE" ? "Công ty Bảo hiểm Nhân thọ" : "Công ty Quản lý Quỹ",
              category: item.category as FinancialProduct["category"] || "Quỹ mở cổ phiếu/trái phiếu",
              riskTier: item.riskLevel === "LOW" ? "Rủi ro thấp" : item.riskLevel === "HIGH" ? "Rủi ro cao" : "Rủi ro trung bình",
              annualFee: item.annualFee || (isEn ? "Per published fee" : "Theo biểu phí niêm yết"),
              conditions: item.conditions || item.description || "",
              disclosure: item.disclosure || (isEn ? "Not disclosed" : "Chưa công bố"),
              isVisible: item.isVisible,
              status: item.isVisible ? "Đang phân phối" : "Tạm dừng",
            })));
          }
        } else {
          const partnersRes = await listAdminPartners(partnersPage, PAGE_SIZE, search.trim());
          if (!active) return;
          if (typeof partnersRes.total === "number") setPartnersTotal(partnersRes.total);
          if (partnersRes.items) {
            setPartners(partnersRes.items.map(p => ({
              id: p.id,
              name: p.name,
              type: p.type === "BANK" ? "Ngân hàng thương mại" : p.type === "INSURANCE" ? "Công ty Bảo hiểm Nhân thọ" : "Công ty Quản lý Quỹ",
              productsCount: 0,
              contactPerson: p.contactEmail || (isEn ? "Updating" : "Đang cập nhật"),
              contactEmail: p.contactEmail || (isEn ? "Unpublished" : "Chưa công bố"),
              status: p.isVisible ? "Đang hợp tác" : "Đang rà soát hợp đồng",
              rating: isEn ? "Unrated" : "Chưa công bố",
            })));
          }
        }
      } catch {
        if (active) setLoadError(isEn ? "Unable to load catalog." : "Không thể tải danh mục đối tác.");
      } finally {
        if (active) setLoading(false);
      }
    }, search ? 200 : 0); // debounce typing only, not first load or tab switch

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeTabKey, productsPage, partnersPage, search, reload, isEn]);

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
        <Button onClick={() => setEditing("new")}><Icon name="plus" size="small" />{isEn ? "Add product" : "Thêm gói sản phẩm"}</Button>
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
      <Card className="admin-filter-card">
        <div className="content-type-tabs">
          <Tabs
            active={activeTabKey === "products" ? tabProductsLabel : tabPartnersLabel}
            items={[tabProductsLabel, tabPartnersLabel]}
            onChange={(item) => {
              setActiveTabKey(item === tabProductsLabel ? "products" : "partners");
              setSearch("");
              setProductsPage(1);
              setPartnersPage(1);
            }}
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
                onChange={(val) => {
                  setSearch(val);
                  if (activeTabKey === "products") setProductsPage(1);
                  else setPartnersPage(1);
                }}
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
      </Card>

      <Card className="business-table-card">

        {/* FINANCIAL PRODUCTS VIEW */}
        {activeTabKey === "products" && (
          <>
            <div className="business-table-scroll">
              <table className="business-table product-table">
                <thead>
                  <tr>
                    <th>{isEn ? "Product / Issuer" : "Sản phẩm / Tổ chức"}</th>
                    <th className="col-optional">{isEn ? "Category" : "Loại hình"}</th>
                    <th>{isEn ? "Risk Tier" : "Mức độ rủi ro"}</th>
                    <th className="col-optional">{isEn ? "Annual Mgmt Fee" : "Phí quản lý / năm"}</th>
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
                      <td className="col-optional">
                        <Badge tone="soft">{formatCategory(item.category)}</Badge>
                      </td>
                      <td>
                        <Badge tone={getRiskTone(item.riskTier)}>{formatRiskTier(item.riskTier)}</Badge>
                      </td>
                      <td className="col-optional">
                        <strong style={{ color: "var(--color-midnight-900)" }}>{item.annualFee}</strong>
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
                        <div className="admin-row-actions">
                          <AdminActionButton icon="eye" label={isEn ? "Details" : "Chi tiết"} context={item.name} onClick={() => setSelectedProduct(item)} />
                          <AdminActionButton icon="edit" label={isEn ? "Edit" : "Sửa"} context={item.name} onClick={() => setEditing(rawProductsRef.current.get(item.id) ?? null)} />
                        </div>
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
                    <th className="col-optional">{isEn ? "Contact" : "Liên hệ"}</th>
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
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone="soft">{formatPartnerType(item.type)}</Badge>
                      </td>
                      <td>
                        <strong>{isEn ? `${item.productsCount} products` : `${item.productsCount} sản phẩm`}</strong>
                      </td>
                      <td className="col-optional">{item.contactEmail}</td>
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
          page={activeTabKey === "products" ? productsPage : partnersPage}
          totalPages={Math.max(1, Math.ceil((activeTabKey === "products" ? productsTotal : partnersTotal) / PAGE_SIZE))}
          totalItems={activeTabKey === "products" ? productsTotal : partnersTotal}
          pageSize={PAGE_SIZE}
          showRowsPerPage={false}
          onPageChange={(p) => {
            if (activeTabKey === "products") setProductsPage(p);
            else setPartnersPage(p);
          }}
        />
      </Card>

      {editing && <ProductEditor product={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload((n) => n + 1); }} />}

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
