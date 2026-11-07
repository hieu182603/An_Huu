import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { investmentApi, type Holdings, type Recommendation, type Rebalance } from "../services/investments";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useAuth } from "../context/AuthContext";
import MoneyTextBox from "../components/MoneyTextBox";
import "./investments.css";
export const investmentMoney = (v: string | number | null | undefined) => v == null ? "Chưa có giá" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(v)) + " ₫";
export default function InvestmentsPage() {
  const { user } = useAuth(), { activePlanId, currentVersion } = useRetirementPlan();
  const [holdings, setHoldings] = useState<Holdings | null>(null), [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const [productId, setProductId] = useState(""), [quantity, setQuantity] = useState(""), [unitCost, setUnitCost] = useState(""), [lockedUntil, setLockedUntil] = useState("");
  const [contribution, setContribution] = useState("0"), [proposal, setProposal] = useState<Rebalance | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); generation.current++; setLoading(true); setHoldings(null); setRecommendations([]); setProposal(null); setError("");
    Promise.all([investmentApi.holdings(controller.signal), investmentApi.recommendations(false, controller.signal)]).then(([h, r]) => { if (!controller.signal.aborted) { setHoldings(h); setRecommendations(r); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); generation.current++; };
  }, [user?.id, activePlanId, currentVersion?.id, refresh]);
  useEffect(() => { generation.current++; setProposal(null); }, [contribution]);
  const selected = holdings?.holdings.find(h => h.productId === productId);
  async function act(work: () => Promise<void>) { setBusy(true); setError(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Không thể cập nhật."); } finally { setBusy(false); } }
  return <main className="investment-page">
    <header><Link to="/user/risk-portfolio">← Khảo sát và phân bổ</Link><h1>Danh mục của bạn</h1><p>Khuyến nghị đã duyệt và tài sản bạn đang nắm giữ.</p></header>
    {error && <p role="alert" className="investment-alert">{error} <button onClick={() => setRefresh(v => v + 1)}>Tải lại</button></p>}
    {loading ? <p role="status">Đang tải danh mục…</p> : <>
      <section className="investment-card"><h2>Khuyến nghị đã duyệt</h2>{!recommendations.length ? <p>Chưa có khuyến nghị còn hiệu lực cho hồ sơ hiện tại.</p> : recommendations.map(r => <article key={r.id}>
        <p>{r.recommendation.explanation.executiveSummary}</p><p>Vốn tăng trưởng: <strong>{investmentMoney(r.recommendation.growthCapitalVnd)}</strong> · Phân bổ: <strong>{investmentMoney(r.recommendation.totalAllocatedVnd)}</strong></p><p>Chưa phân bổ: <strong>{investmentMoney(Number(r.recommendation.growthCapitalVnd) - Number(r.recommendation.totalAllocatedVnd))}</strong>. Phần này chưa được xem là đã đầu tư.</p>
        <div className="investment-items">{r.recommendation.items.map(i => <div key={i.productId}><strong>{i.productName}</strong><span>{investmentMoney(i.recommendedAmountVnd)} · {(i.recommendedWeight * 100).toFixed(1)}%</span><small>Phí ước tính/năm: {investmentMoney(i.estimatedAnnualFeeVnd)}</small></div>)}</div>
        <details><summary>Căn cứ và thông tin cần biết</summary>{[...r.recommendation.explanation.suitabilityRationale, ...r.recommendation.explanation.regulatoryDisclosures].map((text, i) => <p key={i}>{text}</p>)}</details>
      </article>)}</section>
      <section className="investment-card"><h2>Tài sản đang nắm giữ</h2>
        {holdings?.summary && <div className="investment-stats"><div>Giá trị hiện tại<strong>{investmentMoney(holdings.summary.totalValue)}</strong></div><div>Tổng giá vốn<strong>{investmentMoney(holdings.summary.totalCost)}</strong></div><div>Lãi/lỗ chưa thực hiện<strong>{investmentMoney(holdings.summary.totalUnrealizedGainLoss)}</strong></div></div>}
        {holdings?.status === "DATA_REQUIRED" && <p role="status">Một số giá chưa có hoặc đã cũ. Tổng định giá và đề xuất tạm dừng đến khi dữ liệu được cập nhật.</p>}
        {!holdings?.holdings.length ? <p>Chưa ghi nhận tài sản. Thêm số lượng và giá vốn để xem danh mục.</p> : <div className="investment-items">{holdings.holdings.map(h => <article key={h.id}><strong>{h.productName}</strong><span>Số lượng: {h.quantity} · Giá vốn/đơn vị: {investmentMoney(h.costBasis)}</span><span>Giá tham chiếu: {investmentMoney(h.currentPrice)} {h.stale && "· Cần cập nhật"}</span><small>{h.priceAsOf} · {h.sourceKind === "TEST_FIXTURE" ? "Dữ liệu test mô phỏng" : "Giá theo nguồn được khai báo"}</small>{h.lockedUntil && <small>Khóa đến {h.lockedUntil}</small>}
          <button onClick={() => { setProductId(h.productId); setQuantity(h.quantity); setUnitCost(h.costBasis); setLockedUntil(h.lockedUntil ?? ""); }}>Chỉnh sửa</button></article>)}</div>}
        <form onSubmit={e => { e.preventDefault(); void act(async () => { await investmentApi.saveHolding({ productId, quantity, unitCost, lockedUntil: lockedUntil || null, expectedRevision: selected?.revision ?? 0 }); setRefresh(v => v + 1); setQuantity(""); setUnitCost(""); setProductId(""); }); }}>
          <h3>Ghi nhận tài sản</h3><div className="investment-fields">
            <label>Sản phẩm<select aria-label="Sản phẩm" required value={productId} onChange={e => { const h = holdings?.holdings.find(h => h.productId === e.target.value); setProductId(e.target.value); setQuantity(h?.quantity ?? ""); setUnitCost(h?.costBasis ?? ""); setLockedUntil(h?.lockedUntil ?? ""); }}><option value="">Chọn sản phẩm</option>{holdings?.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Số lượng<input required inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value.replace(",", "."))} pattern="[0-9]+([.][0-9]{1,8})?" /></label>
            <label>Giá vốn mỗi đơn vị<MoneyTextBox required value={unitCost} onChange={setUnitCost} /></label>
            <label>Ngày hết khóa (nếu có)<input type="date" value={lockedUntil} onChange={e => setLockedUntil(e.target.value)} /></label>
          </div><button disabled={busy || !holdings?.products.length}>Lưu tài sản</button>
        </form>
      </section>
      <section className="investment-card"><h2>Xem độ lệch và đề xuất điều chỉnh</h2><p>Dựa trên danh mục đã ghi nhận và kế hoạch đang áp dụng. Bạn chủ động quyết định; hệ thống không đặt lệnh.</p>
        <label>Tiền dự định góp thêm<MoneyTextBox value={contribution} onChange={setContribution} /></label>
        <button disabled={busy || !activePlanId || !currentVersion || holdings?.status !== "READY"} onClick={() => void act(async () => { const g = generation.current; const result = await investmentApi.rebalance({ planId: activePlanId, versionId: currentVersion!.id, newContribution: contribution }); if (g === generation.current) setProposal(result); })}>Xem đề xuất</button>
        {!currentVersion && <p><Link to="/user/plan">Áp dụng một phiên bản kế hoạch trước</Link></p>}
        {proposal && <div role="status"><h3>{proposal.status === "WITHIN_BAND" ? "Danh mục trong giới hạn cho phép" : proposal.status === "PROPOSED" ? "Đề xuất để bạn xem xét" : "Cần kiểm tra dữ liệu kế hoạch"}</h3>{proposal.cost != null && <p>Chi phí điều chỉnh dự tính: {investmentMoney(proposal.cost)}</p>}{proposal.trades?.map(t => <p key={t.assetClass}>{t.assetClass}: phân bổ tiền mới {investmentMoney(t.cashAllocated)} · tăng {investmentMoney(t.buy)} · giảm {investmentMoney(t.sell)}</p>)}</div>}
      </section>
    </>}
  </main>;
}
