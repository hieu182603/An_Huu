import { useMemo, useState } from "react";
import type { MarketDocument } from "../../services/planningAnalysis";
import { Button } from "../../components/ui";
import { decimalToPercent, percentToDecimal } from "../../utils/percentDecimal";

// Manual-entry form for the market data document. It edits the same JSON the
// page saves, so admins can switch between the form and raw JSON at any time.
// Monthly values are typed as percent (1.25 = 1.25%) and converted to the
// server's decimal unit by shifting the decimal point — no float rounding.

type Doc = MarketDocument;
type Source = Doc["sources"][number];
type Asset = Doc["assets"][number];

const COMMON_ASSETS: Array<[string, string]> = [["CASH", "Tiền gửi"], ["GOV_BOND", "Trái phiếu Chính phủ"], ["EQUITY", "Cổ phiếu"], ["GOLD", "Vàng"]];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number); const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const monthsBetween = (from: string, to: string) => {
  if (!MONTH.test(from) || !MONTH.test(to) || to < from) return [];
  const out: string[] = []; for (let m = from; m <= to && out.length < 2400; m = addMonths(m, 1)) out.push(m); return out;
};

export function emptyMarketDocument(): Doc {
  const today = new Date().toISOString().slice(0, 10);
  return {
    schemaVersion: 1, title: "", reason: "", effectiveFrom: today, currency: "VND", unit: "DECIMAL_MONTHLY_TOTAL_RETURN",
    priceBasis: "NOMINAL", cpiMeasure: "MONTH_ON_MONTH_CHANGE", period: { from: "", to: "" },
    sources: [{ id: "SRC_1", title: "", url: "", retrievedOn: today, license: "", usage: "SIMULATION_AND_DERIVED_OUTPUTS_PERMITTED", evidence: "" }],
    assets: COMMON_ASSETS.map(([assetClass]) => ({ assetClass, sourceId: "SRC_1", totalReturnEvidence: "", fees: { treatment: "NET" as const, evidence: "" }, taxTreatment: "" })),
    cpiSourceId: "SRC_1", quality: { missingValues: "REJECT", imputation: "NONE", reviewNote: "" }, rows: [],
  };
}

export default function MarketDataForm({ doc, onChange, disabled }: { doc: Doc; onChange: (next: Doc) => void; disabled: boolean }) {
  const [paste, setPaste] = useState(""); const [pasteNote, setPasteNote] = useState("");
  const assets = doc.assets.map(a => a.assetClass);
  const months = useMemo(() => monthsBetween(doc.period.from, doc.period.to), [doc.period.from, doc.period.to]);
  const rowsByMonth = useMemo(() => new Map(doc.rows.map(r => [r.month, r])), [doc.rows]);
  const update = (mutate: (d: Doc) => void) => { const next = structuredClone(doc); mutate(next); onChange(next); };

  // Rows follow the period; values already typed for a month are kept.
  const syncRows = (d: Doc) => {
    const keep = new Map(d.rows.map(r => [r.month, r]));
    d.rows = monthsBetween(d.period.from, d.period.to).map(month => {
      const old = keep.get(month);
      return { month, cpi: old?.cpi ?? "", returns: Object.fromEntries(d.assets.map(a => [a.assetClass, old?.returns[a.assetClass] ?? ""])) };
    });
  };
  const setPeriod = (key: "from" | "to", value: string) => update(d => { d.period[key] = value; syncRows(d); });
  const setCell = (month: string, column: string, raw: string) => update(d => {
    const row = d.rows.find(r => r.month === month); if (!row) return;
    const v = percentToDecimal(raw); const value = v === null ? raw.trim() : v;
    if (column === "__CPI__") row.cpi = value; else row.returns[column] = value;
  });
  const setSource = (i: number, key: keyof Source, value: string) => update(d => { (d.sources[i] as Record<string, string>)[key] = value; });
  const renameSource = (i: number, value: string) => update(d => {
    const old = d.sources[i].id; d.sources[i].id = value;
    d.assets.forEach(a => { if (a.sourceId === old) a.sourceId = value; }); if (d.cpiSourceId === old) d.cpiSourceId = value;
  });
  const setAsset = (i: number, mutate: (a: Asset) => void) => update(d => mutate(d.assets[i]));
  const renameAsset = (i: number, value: string) => update(d => {
    const old = d.assets[i].assetClass; d.assets[i].assetClass = value;
    d.rows.forEach(r => { r.returns[value] = r.returns[old] ?? ""; if (value !== old) delete r.returns[old]; });
  });

  const applyPaste = () => {
    const lines = paste.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let applied = 0, skipped = 0;
    update(d => {
      for (const line of lines) {
        const cells = line.split(/\t|;|\s{2,}/).map(c => c.trim());
        const month = cells[0]?.replace(/^(\d{1,2})\/(\d{4})$/, (_, mm, yy) => `${yy}-${mm.padStart(2, "0")}`);
        const row = d.rows.find(r => r.month === month);
        if (!row) { skipped++; continue; }
        d.assets.forEach((a, i) => { const v = percentToDecimal(cells[i + 1] ?? ""); if (v !== null) row.returns[a.assetClass] = v; });
        const cpi = percentToDecimal(cells[d.assets.length + 1] ?? ""); if (cpi !== null) row.cpi = cpi;
        applied++;
      }
    });
    setPasteNote(`Đã điền ${applied} tháng${skipped ? `, bỏ qua ${skipped} dòng không khớp tháng trong kỳ` : ""}.`);
  };
  const filled = doc.rows.reduce((n, r) => n + assets.filter(a => r.returns[a] !== "" && r.returns[a] !== undefined).length + (r.cpi !== "" ? 1 : 0), 0);
  const total = doc.rows.length * (assets.length + 1);

  return <fieldset className="market-form" disabled={disabled}>
    <legend>Nhập tay dữ liệu thị trường</legend>

    <section className="market-form__grid">
      <label className="is-wide">Tiêu đề<input value={doc.title} onChange={e => update(d => { d.title = e.target.value; })} placeholder="Ví dụ: Tổng lợi nhuận tháng 2015–2026 (NAV quỹ)" /></label>
      <label className="is-wide">Lý do / căn cứ<textarea rows={2} value={doc.reason} onChange={e => update(d => { d.reason = e.target.value; })} /></label>
      <label>Ngày hiệu lực<input type="date" value={doc.effectiveFrom} onChange={e => update(d => { d.effectiveFrom = e.target.value; })} /></label>
      <label>Từ tháng<input type="month" value={doc.period.from} onChange={e => setPeriod("from", e.target.value)} /></label>
      <label>Đến tháng<input type="month" value={doc.period.to} onChange={e => setPeriod("to", e.target.value)} /></label>
      <label className="is-wide">Ghi chú rà soát chất lượng<textarea rows={2} value={doc.quality.reviewNote} onChange={e => update(d => { d.quality.reviewNote = e.target.value; })} placeholder="Đã đối chiếu nguồn, không nội suy, không điền 0 cho tháng thiếu." /></label>
    </section>

    <h3>Nguồn dữ liệu</h3>
    {doc.sources.map((s, i) => <div key={i} className="market-form__card">
      <div className="market-form__grid">
        <label>Mã nguồn<input value={s.id} onChange={e => renameSource(i, e.target.value.toUpperCase())} /></label>
        <label className="is-wide">Tên nguồn<input value={s.title} onChange={e => setSource(i, "title", e.target.value)} /></label>
        <label className="is-wide">URL<input type="url" value={s.url} onChange={e => setSource(i, "url", e.target.value)} /></label>
        <label>Ngày truy cập<input type="date" value={s.retrievedOn} onChange={e => setSource(i, "retrievedOn", e.target.value)} /></label>
        <label className="is-wide">Giấy phép / quyền sử dụng<input value={s.license} onChange={e => setSource(i, "license", e.target.value)} /></label>
        <label className="is-wide">Căn cứ<textarea rows={2} value={s.evidence} onChange={e => setSource(i, "evidence", e.target.value)} /></label>
      </div>
      {doc.sources.length > 1 && <Button variant="ghost" size="small" onClick={() => update(d => { d.sources.splice(i, 1); })}>Xóa nguồn này</Button>}
    </div>)}
    <Button variant="secondary" size="small" onClick={() => update(d => { d.sources.push({ id: `SRC_${d.sources.length + 1}`, title: "", url: "", retrievedOn: new Date().toISOString().slice(0, 10), license: "", usage: "SIMULATION_AND_DERIVED_OUTPUTS_PERMITTED", evidence: "" }); })}>Thêm nguồn</Button>
    <p className="market-form__hint">Lưu tài liệu nghĩa là xác nhận nguồn cho phép dùng để mô phỏng và tạo kết quả dẫn xuất.</p>

    <h3>Nhóm tài sản</h3>
    {doc.assets.map((a, i) => <div key={i} className="market-form__card">
      <div className="market-form__grid">
        <label>Mã nhóm<input list="market-asset-codes" value={a.assetClass} onChange={e => renameAsset(i, e.target.value.toUpperCase())} /></label>
        <label>Nguồn<select value={a.sourceId} onChange={e => setAsset(i, x => { x.sourceId = e.target.value; })}>{doc.sources.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</select></label>
        <label>Cách tính phí<select value={a.fees.treatment} onChange={e => setAsset(i, x => { x.fees = e.target.value === "GROSS" ? { treatment: "GROSS", monthlyDrag: "0", evidence: x.fees.evidence } : { treatment: "NET", evidence: x.fees.evidence }; })}>
          <option value="NET">NET – số liệu đã trừ phí</option><option value="GROSS">GROSS – chưa trừ phí</option></select></label>
        {a.fees.treatment === "GROSS" && <label>Phí mỗi tháng (%)<input value={decimalToPercent(a.fees.monthlyDrag)} onChange={e => setAsset(i, x => { const v = percentToDecimal(e.target.value); x.fees.monthlyDrag = v ?? e.target.value; })} /></label>}
        <label className="is-wide">Căn cứ tổng lợi nhuận (gồm cổ tức/lãi)<input value={a.totalReturnEvidence} onChange={e => setAsset(i, x => { x.totalReturnEvidence = e.target.value; })} /></label>
        <label className="is-wide">Căn cứ phí<input value={a.fees.evidence} onChange={e => setAsset(i, x => { x.fees.evidence = e.target.value; })} /></label>
        <label className="is-wide">Thuế<input value={a.taxTreatment} onChange={e => setAsset(i, x => { x.taxTreatment = e.target.value; })} /></label>
      </div>
      {doc.assets.length > 1 && <Button variant="ghost" size="small" onClick={() => update(d => { const code = d.assets[i].assetClass; d.assets.splice(i, 1); d.rows.forEach(r => { delete r.returns[code]; }); })}>Xóa nhóm này</Button>}
    </div>)}
    <datalist id="market-asset-codes">{COMMON_ASSETS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</datalist>
    <Button variant="secondary" size="small" onClick={() => update(d => { const code = `ASSET_${d.assets.length + 1}`; d.assets.push({ assetClass: code, sourceId: d.sources[0]?.id ?? "", totalReturnEvidence: "", fees: { treatment: "NET", evidence: "" }, taxTreatment: "" }); d.rows.forEach(r => { r.returns[code] = ""; }); })}>Thêm nhóm tài sản</Button>
    <label className="market-form__inline">Nguồn của CPI<select value={doc.cpiSourceId} onChange={e => update(d => { d.cpiSourceId = e.target.value; })}>{doc.sources.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</select></label>

    <h3>Số liệu theo tháng</h3>
    <p className="market-form__hint">Nhập theo <strong>%</strong> tổng lợi nhuận trong tháng (ví dụ 1.25 = 1,25%; −3 = −3%). CPI là thay đổi so với tháng trước. Để trống tháng chưa có số liệu — máy chủ sẽ từ chối, không tự điền 0. Đã điền {filled}/{total} ô.</p>
    {months.length === 0 ? <p className="market-form__hint">Chọn "Từ tháng" và "Đến tháng" để tạo bảng (tối thiểu 12 tháng).</p> : <>
      <details className="market-form__paste">
        <summary>Dán từ Excel</summary>
        <p className="market-form__hint">Mỗi dòng: Tháng (YYYY-MM hoặc MM/YYYY), rồi {assets.join(", ")}, rồi CPI — đơn vị %, cách nhau bằng Tab.</p>
        <textarea rows={6} value={paste} onChange={e => setPaste(e.target.value)} placeholder={`2015-01\t0.42\t0.38\t1.9\t-0.5\t0.1`} />
        <Button variant="secondary" size="small" disabled={!paste.trim()} onClick={applyPaste}>Điền vào bảng</Button>
        {pasteNote && <p role="status">{pasteNote}</p>}
      </details>
      <div className="market-form__table-wrap">
        <table className="market-form__table">
          <thead><tr><th scope="col">Tháng</th>{assets.map(a => <th key={a} scope="col">{a} (%)</th>)}<th scope="col">CPI (%)</th></tr></thead>
          <tbody>{months.map(month => { const row = rowsByMonth.get(month); return <tr key={month}>
            <th scope="row">{month}</th>
            {assets.map(a => { const v = row?.returns[a] ?? ""; return <td key={a}><input aria-label={`${a} ${month}`} className={v === "" ? "is-empty" : ""} inputMode="decimal" value={decimalToPercent(v)} onChange={e => setCell(month, a, e.target.value)} /></td>; })}
            <td><input aria-label={`CPI ${month}`} className={!row?.cpi ? "is-empty" : ""} inputMode="decimal" value={decimalToPercent(row?.cpi)} onChange={e => setCell(month, "__CPI__", e.target.value)} /></td>
          </tr>; })}</tbody>
        </table>
      </div>
    </>}
  </fieldset>;
}
