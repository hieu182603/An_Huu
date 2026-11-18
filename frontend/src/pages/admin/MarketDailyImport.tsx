import { useState } from "react";
import { authenticatedRequest } from "../../services/api";
import type { MarketDocument } from "../../services/planningAnalysis";
import { Button } from "../../components/ui";
import { decimalToPercent } from "../../utils/percentDecimal";

// Daily price / total-return index import. The server converts the daily CSV into
// monthly total returns (month-end / previous month-end - 1) and monthly CPI and
// returns a preview; nothing is stored. "Đưa vào bản nháp" only fills period/rows
// of the document on screen — the admin still saves the draft, and publishing
// remains the separate confirmed step.

type Issue = { code: string; message: string; line?: number; assetClass?: string; month?: string };
export type DailyConvertResult = {
  status: "VALID" | "INVALID"; assets: string[]; observationCount: number; period: { from: string; to: string } | null;
  rows: MarketDocument["rows"]; preview: Array<{ month: string; returns: Record<string, string | null>; cpi: string | null; monthEndDates: Record<string, string | null> }>;
  issues: Issue[]; warnings: Issue[];
};
export const convertDailyMarketData = (body: { pricesCsv: string; cpi: { kind: "MOM_PERCENT" | "INDEX"; csv: string }; maxMonthEndGapDays: number }) =>
  authenticatedRequest<DailyConvertResult>("/admin/market-data/convert-daily", body, "POST");

/** Replace period/rows and align asset columns, keeping evidence already typed for kept classes. */
export function applyDailyResult(doc: MarketDocument, result: DailyConvertResult): MarketDocument {
  const next = structuredClone(doc), old = new Map(doc.assets.map(a => [a.assetClass, a]));
  next.assets = result.assets.map(assetClass => old.get(assetClass) ?? { assetClass, sourceId: doc.sources[0]?.id ?? "", totalReturnEvidence: "", fees: { treatment: "NET", evidence: "" }, taxTreatment: "" });
  next.period = result.period!;
  next.rows = result.rows;
  return next;
}

const readFile = (file: File | undefined, set: (v: string) => void) => { if (file) void file.text().then(set); };
const MAX_PREVIEW = 240;

export default function MarketDailyImport({ doc, disabled, onApply }: { doc: MarketDocument; disabled: boolean; onApply: (next: MarketDocument) => void }) {
  const [prices, setPrices] = useState(""); const [cpi, setCpi] = useState(""); const [cpiKind, setCpiKind] = useState<"MOM_PERCENT" | "INDEX">("MOM_PERCENT");
  const [gap, setGap] = useState("7"); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [result, setResult] = useState<DailyConvertResult | null>(null); const [applied, setApplied] = useState(false);
  const gapDays = Number(gap), gapOk = Number.isInteger(gapDays) && gapDays >= 0 && gapDays <= 15;
  const reset = () => { setResult(null); setApplied(false); };
  const convert = async () => {
    setBusy(true); setError(""); reset();
    try { setResult(await convertDailyMarketData({ pricesCsv: prices, cpi: { kind: cpiKind, csv: cpi }, maxMonthEndGapDays: gapDays })); }
    catch (e) { setError(e instanceof Error ? e.message : "Không quy đổi được dữ liệu."); }
    finally { setBusy(false); }
  };
  const removed = result ? doc.assets.map(a => a.assetClass).filter(a => !result.assets.includes(a)) : [];

  return <section className="market-daily" data-testid="market-daily-import">
    <h3>Cập nhật từ giá theo ngày (CSV)</h3>
    <p className="market-form__hint">Dán hoặc chọn tệp CSV: dòng đầu <code>date,EQUITY,GOV_BOND,…</code> (mã lớp tài sản viết hoa), mỗi dòng sau là một ngày (YYYY-MM-DD hoặc DD/MM/YYYY) với giá đóng cửa hoặc <strong>chỉ số tổng lợi nhuận</strong> của từng lớp; dấu chấm thập phân, không phân cách hàng nghìn, để trống ngày không giao dịch. Máy chủ lấy quan sát cuối mỗi tháng và tính lợi suất tháng = giá cuối tháng / giá cuối tháng trước − 1. Tháng thiếu dữ liệu bị báo lỗi, không điền 0. Nếu chỉ có giá (chưa gồm cổ tức/lãi), ghi rõ trong "Căn cứ tổng lợi nhuận".</p>
    <fieldset className="market-daily__inputs" disabled={disabled || busy}>
      <label className="is-wide">Giá / chỉ số theo ngày
        <textarea rows={8} spellCheck={false} value={prices} onChange={e => { setPrices(e.target.value); reset(); }} placeholder={"date,EQUITY,GOV_BOND,CASH,GOLD\n2024-01-02,1150.32,215.4,101.02,7350\n2024-01-03,1148.10,215.5,101.03,7365"} aria-label="CSV giá theo ngày" />
      </label>
      <label>Hoặc chọn tệp giá<input type="file" accept=".csv,.txt,text/csv" onChange={e => { readFile(e.target.files?.[0], v => { setPrices(v); reset(); }); }} /></label>
      <label>CPI theo tháng là
        <select value={cpiKind} onChange={e => { setCpiKind(e.target.value as "MOM_PERCENT" | "INDEX"); reset(); }}>
          <option value="MOM_PERCENT">% thay đổi so với tháng trước</option>
          <option value="INDEX">Chỉ số CPI (máy chủ tự tính % thay đổi)</option>
        </select>
      </label>
      <label className="is-wide">CPI theo tháng
        <textarea rows={4} spellCheck={false} value={cpi} onChange={e => { setCpi(e.target.value); reset(); }} placeholder={"month,cpi\n2024-01,0.31\n2024-02,0.27"} aria-label="CSV CPI theo tháng" />
      </label>
      <label>Hoặc chọn tệp CPI<input type="file" accept=".csv,.txt,text/csv" onChange={e => { readFile(e.target.files?.[0], v => { setCpi(v); reset(); }); }} /></label>
      <label>Cho phép quan sát cuối tháng sớm hơn cuối tháng tối đa (ngày)
        <input inputMode="numeric" value={gap} onChange={e => { setGap(e.target.value); reset(); }} aria-invalid={!gapOk} />
      </label>
    </fieldset>
    <div className="planning-actions">
      <Button variant="secondary" disabled={disabled || busy || !prices.trim() || !cpi.trim() || !gapOk} onClick={() => void convert()}>{busy ? "Đang quy đổi…" : "Quy đổi & xem trước"}</Button>
      {result?.status === "VALID" && <Button disabled={disabled || applied} onClick={() => { onApply(applyDailyResult(doc, result)); setApplied(true); }}>Đưa vào bản nháp</Button>}
    </div>
    {!gapOk && <p role="alert">Số ngày phải là số nguyên từ 0 đến 15.</p>}
    {error && <p role="alert">{error}</p>}
    {applied && <p role="status">Đã thay kỳ và số liệu tháng trong biểu mẫu. Bấm "Lưu bản nháp" để lưu; tài liệu chưa được công bố.</p>}
    {result && <div className="market-daily__result">
      <p role="status"><strong>{result.status === "VALID" ? "Quy đổi hợp lệ" : "Chưa thể dùng: còn lỗi dữ liệu"}</strong> · {result.assets.join(", ") || "—"} · {result.observationCount} quan sát · {result.period ? `${result.period.from} → ${result.period.to} (${result.preview.length} tháng)` : "chưa xác định kỳ"}</p>
      {removed.length > 0 && result.status === "VALID" && <p className="market-form__hint">Các lớp không có trong CSV sẽ bị bỏ khỏi tài liệu: {removed.join(", ")}.</p>}
      {result.issues.length > 0 && <div role="alert" className="market-daily__issues"><strong>{result.issues.length} lỗi cần sửa trong CSV</strong>
        <ul>{result.issues.map((i, n) => <li key={n}><code>{i.code}</code>{i.line ? ` · dòng ${i.line}` : ""}: {i.message}</li>)}</ul></div>}
      {result.warnings.length > 0 && <ul className="market-daily__warnings">{result.warnings.map((w, n) => <li key={n}>{w.message}</li>)}</ul>}
      {result.preview.length > 0 && <div className="market-form__table-wrap"><table className="market-form__table" aria-label="Xem trước lợi suất tháng đã quy đổi">
        <thead><tr><th scope="col">Tháng</th>{result.assets.map(a => <th key={a} scope="col">{a} (%)</th>)}<th scope="col">CPI (%)</th></tr></thead>
        <tbody>{result.preview.slice(-MAX_PREVIEW).reverse().map(r => <tr key={r.month}><th scope="row">{r.month}</th>
          {result.assets.map(a => { const v = r.returns[a]; return <td key={a} className={v === null ? "is-missing" : ""} title={r.monthEndDates[a] ? `Giá cuối tháng ngày ${r.monthEndDates[a]}` : "Không có giá cuối tháng"}>{v === null ? "thiếu" : decimalToPercent(v)}</td>; })}
          <td className={r.cpi === null ? "is-missing" : ""}>{r.cpi === null ? "thiếu" : decimalToPercent(r.cpi)}</td></tr>)}</tbody>
      </table></div>}
      {result.preview.length > MAX_PREVIEW && <p className="market-form__hint">Hiển thị {MAX_PREVIEW} tháng gần nhất; toàn bộ {result.preview.length} tháng vẫn được đưa vào bản nháp.</p>}
    </div>}
  </section>;
}
