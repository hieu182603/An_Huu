import { useEffect, useState } from "react";
import { Link } from "react-router";
import { investmentApi, type Recommendation, type ProductData } from "../../services/investments";
import { useAuth } from "../../context/AuthContext";
import InvestmentProductEditor, { newInvestmentProduct } from "./InvestmentProductEditor";
import { investmentMoney } from "../InvestmentsPage";
import "../investments.css";
const labels: Record<string, string> = { DRAFT: "Bản nháp", DATA_VALIDATED: "Đã kiểm tra dữ liệu", SUITABILITY_CHECKED: "Đã kiểm tra phù hợp", PENDING_APPROVAL: "Chờ duyệt", APPROVED: "Đã duyệt", PUBLISHED: "Đã công bố", REJECTED: "Từ chối", EXPIRED: "Hết hạn", SUPERSEDED: "Đã thay thế" };
export default function AdminInvestmentsPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<string[]>([]), [enabled, setEnabled] = useState(false), [rows, setRows] = useState<Recommendation[]>([]), [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const [userId, setUserId] = useState(""), [planId, setPlanId] = useState(""), [versionId, setVersionId] = useState(""), [reason, setReason] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof investmentApi.history>> | null>(null), [editing, setEditing] = useState<ProductData | null>(null);
  const [unconfigured, setUnconfigured] = useState<Awaited<ReturnType<typeof investmentApi.unconfiguredProducts>>>([]);
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof investmentApi.providers>>>([]);
  useEffect(() => { let active = true; setError(""); setLoading(true); setRows([]); setProducts([]); setHistory(null);
    investmentApi.permissions().then(async p => { if (!active) return; setRoles(p.roles); setEnabled(p.publicationEnabled);
      const [r, products, unconfigured, providers] = await Promise.all([p.roles.some(r => ["ADVISOR", "APPROVER", "OPERATIONS", "SYSTEM_ADMIN"].includes(r)) ? investmentApi.recommendations(true) : [], p.roles.some(r => ["DATA_ADMIN", "ADVISOR", "APPROVER", "OPERATIONS", "SYSTEM_ADMIN"].includes(r)) ? investmentApi.products() : [], p.roles.includes("DATA_ADMIN") ? investmentApi.unconfiguredProducts() : [], p.roles.some(r => ["DATA_ADMIN", "OPERATIONS", "SYSTEM_ADMIN"].includes(r)) ? investmentApi.providers() : []]);
      if (active) { setRows(r); setProducts(products); setUnconfigured(unconfigured); setProviders(providers); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
  }, [refresh, user?.id]);
  async function act(work: () => Promise<unknown>) { setBusy(true); setError(""); try { await work(); setRefresh(v => v + 1); } catch (e) { setError(e instanceof Error ? e.message : "Không thể cập nhật."); } finally { setBusy(false); } }
  const has = (role: string) => roles.includes(role);
  return <main className="investment-page"><Link to="/admin/financial-config">← Cấu hình tài chính</Link><h1>Khuyến nghị và danh mục</h1>
    <p>{enabled ? "Cổng công bố đã được cấu hình ở server." : "Công bố đang khóa. Cần điều kiện pháp lý và cấu hình server được phê duyệt."}</p>
    {error && <p role="alert" className="investment-alert">{error}</p>}
    {loading ? <p role="status">Đang tải…</p> : !roles.length ? <p>Tài khoản chưa có quyền nghiệp vụ đầu tư. Quyền quản trị chung không tự cấp quyền tư vấn hoặc phê duyệt.</p> : <>
      {has("ADVISOR") && <section className="investment-card"><h2>Tạo khuyến nghị từ kế hoạch</h2><form onSubmit={e => { e.preventDefault(); void act(() => investmentApi.create({ userId, planId, versionId })); }}><div className="investment-fields"><label>Mã khách hàng<input required value={userId} onChange={e => setUserId(e.target.value)} /></label><label>Mã kế hoạch<input required value={planId} onChange={e => setPlanId(e.target.value)} /></label><label>Mã phiên bản đang áp dụng<input required value={versionId} onChange={e => setVersionId(e.target.value)} /></label></div><button disabled={busy}>Tạo bản nháp</button></form></section>}
      <section className="investment-card"><h2>Hàng chờ xử lý</h2><label>Lý do quyết định<textarea minLength={5} value={reason} onChange={e => setReason(e.target.value)} /></label>{!rows.length && <p>Chưa có khuyến nghị cần xử lý.</p>}
        <div className="investment-items">{rows.map(r => { const own = r.recommendation.createdBy === user?.id; const action = r.status === "DRAFT" ? "validate" : r.status === "DATA_VALIDATED" ? "suitability" : r.status === "SUITABILITY_CHECKED" ? "submit" : r.status === "PENDING_APPROVAL" ? "approve" : r.status === "APPROVED" ? "publish" : null;
          const allowed = action === "approve" ? has("APPROVER") && !own : action === "publish" ? has("OPERATIONS") && enabled : has("ADVISOR") && own;
          return <article key={r.id} data-recommendation-id={r.id}><strong>{labels[r.status] ?? r.status}</strong><small>Khách hàng {r.recommendation.userId}</small><span>{investmentMoney(r.recommendation.totalAllocatedVnd)}</span><small>Phiên bản xử lý {r.revision}</small>
            <details><summary>Nội dung cần thẩm định</summary><p>{r.recommendation.explanation.executiveSummary}</p><p>Hết hiệu lực: {new Date(r.recommendation.expiresAt).toLocaleString("vi-VN")}</p>{r.recommendation.items.map(i => <p key={i.productId}>{i.productName} · {i.assetClass} · {investmentMoney(i.recommendedAmountVnd)} · {(i.recommendedWeight * 100).toFixed(2)}% · Phí/năm {investmentMoney(i.estimatedAnnualFeeVnd)}</p>)}{r.recommendation.explanation.suitabilityRationale.map((text, i) => <p key={i}>{text}</p>)}</details>
            {action && allowed && <button disabled={busy || reason.trim().length < 5} onClick={() => void act(() => investmentApi.transition(r, action, reason))}>{({ validate: "Kiểm tra dữ liệu", suitability: "Kiểm tra phù hợp", submit: "Gửi duyệt", approve: "Phê duyệt", publish: "Công bố" } as Record<string, string>)[action]}</button>}
            {r.status === "PENDING_APPROVAL" && has("APPROVER") && !own && <button disabled={busy || reason.trim().length < 5} onClick={() => void act(() => investmentApi.transition(r, "reject", reason))}>Từ chối</button>}
            {own && r.status === "PENDING_APPROVAL" && <small>Cần người khác có quyền phê duyệt.</small>}
            <button disabled={busy} onClick={async () => { try { setHistory(await investmentApi.history(r.id)); } catch (e) { setError(e instanceof Error ? e.message : "Không tải được lịch sử."); } }}>Lịch sử quyết định</button>
          </article>; })}</div>
        {history && <section aria-label="Lịch sử quyết định"><h3>Lịch sử quyết định</h3>{history.map((h, i) => <p key={i}>{new Date(h.createdAt).toLocaleString("vi-VN")} · {h.decision} · {h.reason}<br /><small>{h.actorId}</small></p>)}</section>}
      </section>
      <section className="investment-card"><h2>Giá và dữ liệu sản phẩm</h2><p>Sản phẩm được quản lý trong <Link to="/admin/partners">Danh mục đối tác</Link>. Chỉ sử dụng số liệu có nguồn và thời hạn.</p>
        {!products.length && <p>Chưa có dữ liệu sản phẩm đủ điều kiện.</p>}<div className="investment-items">{products.map(p => <article key={p.id}><strong>{p.name}</strong><span>{investmentMoney(p.data.nav)} · {p.stale ? "Giá hết hạn" : "Trong hạn khai báo"}</span><small>{p.data.priceAsOf} · {p.data.sourceKind}</small>{has("DATA_ADMIN") && <button onClick={() => setEditing(structuredClone(p))}>Cập nhật giá và nguồn</button>}</article>)}</div>
        {has("DATA_ADMIN") && unconfigured.length > 0 && <label>Bổ sung dữ liệu sản phẩm<select value="" onChange={e => { const p = unconfigured.find(p => p.id === e.target.value); if (p) setEditing(newInvestmentProduct(p)); }}><option value="">Chọn sản phẩm chưa có dữ liệu</option>{unconfigured.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        {editing && <InvestmentProductEditor value={editing} onChange={setEditing} busy={busy} onCancel={() => setEditing(null)} onSave={() => void act(async () => { await investmentApi.saveProduct(editing); setEditing(null); })} />}

      </section>
      {providers.length > 0 && <section className="investment-card"><h2>Nguồn dữ liệu thị trường</h2><div className="investment-items">{providers.map(p => <article key={p.providerId}><strong>{p.providerId}</strong><span>{({ NOT_CONFIGURED: "Chưa cấu hình", CONFIGURED: "Có cấu hình · chưa xác minh kết nối", HEALTHY: "Kết nối đã xác minh", DEGRADED: "Kết nối suy giảm", UNAVAILABLE: "Không khả dụng", DATA_INVALID: "Dữ liệu không hợp lệ", CONNECTING: "Đang kết nối" } as Record<string, string>)[p.status] ?? p.status}</span><small>{p.message}</small></article>)}</div></section>}
    </>}
  </main>;
}
