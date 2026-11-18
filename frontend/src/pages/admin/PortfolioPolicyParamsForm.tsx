import { Button, Checkbox } from "../../components/ui";

// Structured editor for the schema-v2 policy parameters the allocation page needs:
// template weights (glide-path points), lossStress and customization bounds.
// It edits the same JSON document the page saves as a DRAFT; publishing is a
// separate, confirmed step on the page. All checks are exact (scaled integers).

type Doc = Record<string, any>;
type T = (vi: string, en: string) => string;
export type PolicyFormIssue = { path: string; message: string };

const CODE = /^[A-Z][A-Z0-9_]{0,39}$/;
const WEIGHT = /^(0|[1-9]\d?|100)(\.\d{1,8})?$/;
const SHOCK = /^-?(0|[1-9]\d{0,2})(\.\d{1,10})?$/;
const SCALE = 10n ** 10n;
/** Exact decimal → scaled bigint (10 decimals); null if not a plain decimal. */
export function units(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^-?\d+(\.\d{1,10})?$/.test(value)) return null;
  const negative = value.startsWith("-"), [whole, fraction = ""] = value.replace("-", "").split(".");
  const n = BigInt(whole) * SCALE + BigInt(fraction.padEnd(10, "0"));
  return negative ? -n : n;
}
const HUNDRED = 100n * SCALE;
const fmt = (n: bigint) => { const neg = n < 0n, a = neg ? -n : n, w = a / SCALE, f = (a % SCALE).toString().padStart(10, "0").replace(/0+$/, ""); return `${neg ? "-" : ""}${w}${f ? "." + f : ""}`; };

/** Asset classes the published templates actually use (any glide point). */
export function templateAssets(doc: Doc): string[] {
  const set = new Set<string>();
  for (const t of doc.templates ?? []) for (const p of t.glidePath?.points ?? []) for (const a of p.allocations ?? []) if (a.assetClass) set.add(a.assetClass);
  return [...set].sort();
}

export function policyFormIssues(doc: Doc, t: T): PolicyFormIssue[] {
  const out: PolicyFormIssue[] = [], add = (path: string, message: string) => out.push({ path, message });
  if (doc.schemaVersion !== 2) return out;
  const used = templateAssets(doc);
  (doc.templates ?? []).forEach((tpl: Doc, i: number) => {
    const points: Doc[] = tpl.glidePath?.points ?? [];
    if (!points.some(p => p.yearsToAnchor === 0)) add(`templates.${i}`, t(`${tpl.id}: cần mốc 0 năm trước nghỉ hưu.`, `${tpl.id}: a 0-year point is required.`));
    const years = points.map(p => p.yearsToAnchor);
    if (new Set(years).size !== years.length) add(`templates.${i}`, t(`${tpl.id}: trùng mốc số năm.`, `${tpl.id}: duplicate year points.`));
    points.forEach((p, j) => {
      const where = `${tpl.id} · ${p.yearsToAnchor} ${t("năm", "years")}`;
      if (!Number.isInteger(p.yearsToAnchor) || p.yearsToAnchor < 0 || p.yearsToAnchor > 100) add(`templates.${i}.points.${j}`, t(`${where}: số năm phải là số nguyên 0–100.`, `${where}: years must be an integer 0–100.`));
      const rows: Doc[] = p.allocations ?? [], codes = rows.map(r => r.assetClass);
      if (!rows.length) add(`templates.${i}.points.${j}`, t(`${where}: cần ít nhất một lớp tài sản.`, `${where}: at least one asset class.`));
      if (new Set(codes).size !== codes.length) add(`templates.${i}.points.${j}`, t(`${where}: trùng lớp tài sản.`, `${where}: duplicate asset class.`));
      if (codes.some(c => !CODE.test(c ?? ""))) add(`templates.${i}.points.${j}`, t(`${where}: mã lớp tài sản không hợp lệ.`, `${where}: invalid asset class code.`));
      if (rows.some(r => !WEIGHT.test(r.weightPercent ?? "") || units(r.weightPercent)! > HUNDRED)) add(`templates.${i}.points.${j}`, t(`${where}: tỷ trọng phải từ 0 đến 100 (tối đa 8 số lẻ).`, `${where}: weights must be 0–100.`));
      else { const sum = rows.reduce((s, r) => s + units(r.weightPercent)!, 0n); if (sum !== HUNDRED) add(`templates.${i}.points.${j}`, t(`${where}: tổng tỷ trọng là ${fmt(sum)}%, phải bằng 100%.`, `${where}: weights sum to ${fmt(sum)}%, must be 100%.`)); }
    });
  });
  const stress = doc.lossStress;
  if (stress) {
    if ((stress.evidence ?? "").trim().length < 3) add("lossStress.evidence", t("Cú sốc thua lỗ: cần căn cứ (≥ 3 ký tự).", "Loss stress: evidence required."));
    const shocks: Doc[] = stress.shocks ?? [], codes = shocks.map(s => s.assetClass);
    if (new Set(codes).size !== codes.length) add("lossStress.shocks", t("Cú sốc thua lỗ: trùng lớp tài sản.", "Loss stress: duplicate asset class."));
    if (shocks.some(s => !SHOCK.test(s.percent ?? "") || units(s.percent)! > 0n || units(s.percent)! < -HUNDRED)) add("lossStress.shocks", t("Cú sốc thua lỗ: mức biến động phải từ -100 đến 0 (%).", "Loss stress: shocks must be between -100 and 0 (%)."));
    for (const c of [...used, stress.equityAssetClass, stress.depositAssetClass].filter(Boolean))
      if (!codes.includes(c)) add("lossStress.shocks", t(`Cú sốc thua lỗ: thiếu mức sốc cho ${c}.`, `Loss stress: missing shock for ${c}.`));
    if (!stress.equityAssetClass || !stress.depositAssetClass) add("lossStress", t("Cú sốc thua lỗ: chọn lớp cổ phiếu và lớp tiền gửi.", "Loss stress: choose equity and deposit classes."));
    const eq = shocks.find(s => s.assetClass === stress.equityAssetClass), dep = shocks.find(s => s.assetClass === stress.depositAssetClass);
    if (eq && dep && units(eq.percent) !== null && units(dep.percent) !== null && !(units(eq.percent)! < units(dep.percent)!))
      add("lossStress", t("Cú sốc thua lỗ: cổ phiếu phải giảm sâu hơn tiền gửi để có thể giảm rủi ro.", "Loss stress: equity must fall more than deposits."));
  }
  const custom = doc.customization;
  if (custom) {
    if (!stress) add("customization", t("Cho phép tự điều chỉnh cần cấu hình cú sốc thua lỗ.", "Customization requires the loss stress."));
    if ((custom.evidence ?? "").trim().length < 5) add("customization.evidence", t("Tự điều chỉnh: cần căn cứ (≥ 5 ký tự).", "Customization: evidence required (≥ 5 characters)."));
    const bounds: Doc[] = custom.bounds ?? [], codes = bounds.map(b => b.assetClass);
    if (!bounds.length) add("customization.bounds", t("Tự điều chỉnh: cần giới hạn cho ít nhất một lớp tài sản.", "Customization: at least one bound."));
    if (new Set(codes).size !== codes.length) add("customization.bounds", t("Tự điều chỉnh: trùng lớp tài sản.", "Customization: duplicate asset class."));
    for (const c of used) if (!codes.includes(c)) add("customization.bounds", t(`Tự điều chỉnh: thiếu giới hạn cho ${c} (danh mục mẫu đang dùng).`, `Customization: missing bound for ${c}.`));
    let min = 0n, max = 0n, numeric = true;
    bounds.forEach(b => {
      const lo = WEIGHT.test(b.minPercent ?? "") ? units(b.minPercent) : null, hi = WEIGHT.test(b.maxPercent ?? "") ? units(b.maxPercent) : null;
      if (lo === null || hi === null || lo > HUNDRED || hi > HUNDRED) { numeric = false; add("customization.bounds", t(`${b.assetClass || "?"}: min/max phải từ 0 đến 100.`, `${b.assetClass || "?"}: min/max must be 0–100.`)); return; }
      if (lo > hi) add("customization.bounds", t(`${b.assetClass}: min phải ≤ max.`, `${b.assetClass}: min must be ≤ max.`));
      min += lo; max += hi;
    });
    if (numeric && bounds.length && (min > HUNDRED || max < HUNDRED)) add("customization.bounds", t(`Tự điều chỉnh: tổng min (${fmt(min)}%) phải ≤ 100% và tổng max (${fmt(max)}%) phải ≥ 100%.`, `Customization: sum of min (${fmt(min)}%) must be ≤ 100% and sum of max (${fmt(max)}%) ≥ 100%.`));
  }
  return out;
}

export default function PortfolioPolicyParamsForm({ doc, onChange, disabled, t }: { doc: Doc; onChange: (next: Doc) => void; disabled: boolean; t: T }) {
  const update = (mutate: (d: Doc) => void) => { const next = structuredClone(doc); mutate(next); onChange(next); };
  const used = templateAssets(doc);
  const known = [...new Set([...used, ...(doc.lossStress?.shocks ?? []).map((s: Doc) => s.assetClass), ...(doc.customization?.bounds ?? []).map((b: Doc) => b.assetClass)])].filter(Boolean).sort();
  const issues = policyFormIssues(doc, t);
  const stress = doc.lossStress, custom = doc.customization;
  const upper = (v: string) => v.toUpperCase().replace(/\s/g, "");

  return <>
    <datalist id="policy-asset-codes">{known.map(c => <option key={c} value={c} />)}</datalist>

    <fieldset className="admin-policy-form" disabled={disabled} data-testid="policy-templates-form">
      <legend>{t("Tỷ trọng danh mục mẫu", "Template weights")}</legend>
      <p className="admin-policy-hint">{t("Mỗi danh mục mẫu có các mốc theo số năm còn lại tới tháng nghỉ hưu; giữa các mốc nội suy tuyến tính. Tổng tỷ trọng mỗi mốc phải đúng 100%.", "Each template has points by whole years to retirement; weights interpolate linearly between points. Each point must sum to 100%.")}</p>
      {(doc.templates ?? []).map((tpl: Doc, i: number) => <div key={i} className="admin-policy-stress is-on">
        <strong>{tpl.id} · {tpl.label}</strong>
        {(tpl.glidePath?.points ?? []).map((p: Doc, j: number) => {
          const sum = (p.allocations ?? []).reduce((s: bigint, r: Doc) => s + (units(r.weightPercent) ?? 0n), 0n);
          return <div key={j} className="admin-policy-point">
            <div className="admin-policy-inline">
              <label>{t("Số năm trước nghỉ hưu", "Years to retirement")}
                <input inputMode="numeric" value={String(p.yearsToAnchor ?? "")} onChange={e => update(d => { const v = e.target.value.trim(); d.templates[i].glidePath.points[j].yearsToAnchor = v === "" ? "" : Number(v); })} />
              </label>
              <span className={`admin-policy-sum${sum === HUNDRED ? "" : " is-bad"}`} role="status">{t("Tổng", "Total")}: {fmt(sum)}%</span>
              {tpl.glidePath.points.length > 1 && <Button variant="ghost" size="small" onClick={() => update(d => { d.templates[i].glidePath.points.splice(j, 1); })}>{t("Xóa mốc", "Remove point")}</Button>}
            </div>
            <table className="admin-policy-table"><thead><tr><th scope="col">{t("Lớp tài sản", "Asset class")}</th><th scope="col">{t("Tỷ trọng (%)", "Weight (%)")}</th><th /></tr></thead>
              <tbody>{(p.allocations ?? []).map((r: Doc, k: number) => <tr key={k}>
                <td><input list="policy-asset-codes" aria-label={`${tpl.id} ${p.yearsToAnchor} ${t("lớp tài sản", "asset class")} ${k + 1}`} value={r.assetClass ?? ""} onChange={e => update(d => { d.templates[i].glidePath.points[j].allocations[k].assetClass = upper(e.target.value); })} /></td>
                <td><input inputMode="decimal" aria-label={`${tpl.id} ${p.yearsToAnchor} ${r.assetClass} %`} value={r.weightPercent ?? ""} onChange={e => update(d => { d.templates[i].glidePath.points[j].allocations[k].weightPercent = e.target.value.trim(); })} /></td>
                <td>{p.allocations.length > 1 && <Button variant="ghost" size="small" onClick={() => update(d => { d.templates[i].glidePath.points[j].allocations.splice(k, 1); })}>{t("Xóa", "Remove")}</Button>}</td>
              </tr>)}</tbody></table>
            <Button variant="secondary" size="small" onClick={() => update(d => { d.templates[i].glidePath.points[j].allocations.push({ assetClass: "", weightPercent: "0" }); })}>{t("Thêm lớp tài sản", "Add asset class")}</Button>
          </div>;
        })}
        <Button variant="secondary" size="small" onClick={() => update(d => { const pts = d.templates[i].glidePath.points; const last = pts[pts.length - 1]; pts.push({ yearsToAnchor: Math.max(0, ...pts.map((x: Doc) => Number(x.yearsToAnchor) || 0)) + 5, allocations: structuredClone(last?.allocations ?? []) }); })}>{t("Thêm mốc năm", "Add year point")}</Button>
      </div>)}
      {!(doc.templates ?? []).length && <p className="admin-policy-hint">{t("Tài liệu chưa có danh mục mẫu; thêm trong JSON nâng cao.", "No templates yet; add them in the advanced JSON.")}</p>}
    </fieldset>

    <fieldset className="admin-policy-form" disabled={disabled} data-testid="policy-loss-stress-form">
      <legend>{t("Cú sốc thua lỗ để kiểm tra mức chịu lỗ", "Loss stress for the loss-tolerance check")}</legend>
      <Checkbox checked={Boolean(stress)} label={t("Cấu hình cú sốc thua lỗ", "Configure the loss stress")} onChange={on => update(d => {
        if (on) d.lossStress = { evidence: "", equityAssetClass: used.find(c => /EQUITY/.test(c)) ?? "", depositAssetClass: used.find(c => /CASH|DEPOSIT/.test(c)) ?? "", shocks: used.map(assetClass => ({ assetClass, percent: "" })) };
        else delete d.lossStress;
      })} />
      {stress && <>
        <label>{t("Căn cứ", "Evidence")}<textarea rows={2} value={stress.evidence ?? ""} onChange={e => update(d => { d.lossStress.evidence = e.target.value; })} /></label>
        <div className="admin-policy-grid">
          <label>{t("Lớp cổ phiếu (giảm khi hạ rủi ro)", "Equity class (reduced)")}<input list="policy-asset-codes" value={stress.equityAssetClass ?? ""} onChange={e => update(d => { d.lossStress.equityAssetClass = upper(e.target.value); })} /></label>
          <label>{t("Lớp tiền gửi (nhận phần chuyển sang)", "Deposit class (receives the shift)")}<input list="policy-asset-codes" value={stress.depositAssetClass ?? ""} onChange={e => update(d => { d.lossStress.depositAssetClass = upper(e.target.value); })} /></label>
        </div>
        <table className="admin-policy-table"><thead><tr><th scope="col">{t("Lớp tài sản", "Asset class")}</th><th scope="col">{t("Biến động trong cú sốc (%)", "Stress return (%)")}</th><th /></tr></thead>
          <tbody>{(stress.shocks ?? []).map((s: Doc, k: number) => <tr key={k}>
            <td><input list="policy-asset-codes" aria-label={`${t("Cú sốc", "Shock")} ${k + 1}`} value={s.assetClass ?? ""} onChange={e => update(d => { d.lossStress.shocks[k].assetClass = upper(e.target.value); })} /></td>
            <td><input inputMode="decimal" aria-label={`${t("Cú sốc", "Shock")} ${s.assetClass} %`} placeholder="-35" value={s.percent ?? ""} onChange={e => update(d => { d.lossStress.shocks[k].percent = e.target.value.trim(); })} /></td>
            <td>{stress.shocks.length > 1 && <Button variant="ghost" size="small" onClick={() => update(d => { d.lossStress.shocks.splice(k, 1); })}>{t("Xóa", "Remove")}</Button>}</td>
          </tr>)}</tbody></table>
        <div className="admin-policy-inline">
          <Button variant="secondary" size="small" onClick={() => update(d => { d.lossStress.shocks.push({ assetClass: "", percent: "" }); })}>{t("Thêm dòng", "Add row")}</Button>
          <Button variant="secondary" size="small" onClick={() => update(d => { const have = new Set(d.lossStress.shocks.map((s: Doc) => s.assetClass)); for (const c of used) if (!have.has(c)) d.lossStress.shocks.push({ assetClass: c, percent: "" }); })}>{t("Thêm các lớp danh mục mẫu đang dùng", "Add classes used by templates")}</Button>
        </div>
        <small className="admin-policy-hint">{t("Số âm hoặc 0, ví dụ -35 nghĩa là giảm 35%. Không có giá trị mặc định.", "Zero or negative, e.g. -35 means a 35% fall. No defaults.")}</small>
      </>}
    </fieldset>

    <fieldset className="admin-policy-form" disabled={disabled} data-testid="policy-customization-form">
      <legend>{t("Cho phép khách tự điều chỉnh tỷ trọng", "Allow customer weight customization")}</legend>
      <Checkbox checked={Boolean(custom)} label={t("Bật tự điều chỉnh (customization)", "Enable customization")} onChange={on => update(d => {
        if (on) d.customization = { evidence: "", path: "FOLLOW_TEMPLATE_SHIFTS", capitalBasis: "PROTECTED_CAPITAL_V1", bounds: used.map(assetClass => ({ assetClass, minPercent: "", maxPercent: "" })) };
        else delete d.customization;
      })} />
      {custom && <>
        <label>{t("Căn cứ", "Evidence")}<textarea rows={2} value={custom.evidence ?? ""} onChange={e => update(d => { d.customization.evidence = e.target.value; })} /></label>
        <p className="admin-policy-hint">{t("Lộ trình: FOLLOW_TEMPLATE_SHIFTS (tỷ trọng tự chọn dịch theo danh mục mẫu). Cơ sở vốn: PROTECTED_CAPITAL_V1. Hai giá trị này cố định theo phiên bản tính toán.", "Path: FOLLOW_TEMPLATE_SHIFTS. Capital basis: PROTECTED_CAPITAL_V1. Both are fixed by the engine version.")}</p>
        <table className="admin-policy-table"><thead><tr><th scope="col">{t("Lớp tài sản", "Asset class")}</th><th scope="col">{t("Tối thiểu (%)", "Min (%)")}</th><th scope="col">{t("Tối đa (%)", "Max (%)")}</th><th /></tr></thead>
          <tbody>{(custom.bounds ?? []).map((b: Doc, k: number) => <tr key={k}>
            <td><input list="policy-asset-codes" aria-label={`${t("Giới hạn", "Bound")} ${k + 1}`} value={b.assetClass ?? ""} onChange={e => update(d => { d.customization.bounds[k].assetClass = upper(e.target.value); })} /></td>
            <td><input inputMode="decimal" aria-label={`${b.assetClass} min %`} value={b.minPercent ?? ""} onChange={e => update(d => { d.customization.bounds[k].minPercent = e.target.value.trim(); })} /></td>
            <td><input inputMode="decimal" aria-label={`${b.assetClass} max %`} value={b.maxPercent ?? ""} onChange={e => update(d => { d.customization.bounds[k].maxPercent = e.target.value.trim(); })} /></td>
            <td>{custom.bounds.length > 1 && <Button variant="ghost" size="small" onClick={() => update(d => { d.customization.bounds.splice(k, 1); })}>{t("Xóa", "Remove")}</Button>}</td>
          </tr>)}</tbody></table>
        <div className="admin-policy-inline">
          <Button variant="secondary" size="small" onClick={() => update(d => { d.customization.bounds.push({ assetClass: "", minPercent: "", maxPercent: "" }); })}>{t("Thêm dòng", "Add row")}</Button>
          <Button variant="secondary" size="small" onClick={() => update(d => { const have = new Set(d.customization.bounds.map((b: Doc) => b.assetClass)); for (const c of used) if (!have.has(c)) d.customization.bounds.push({ assetClass: c, minPercent: "", maxPercent: "" }); })}>{t("Thêm các lớp danh mục mẫu đang dùng", "Add classes used by templates")}</Button>
        </div>
      </>}
    </fieldset>

    {issues.length > 0 && <div role="alert" className="admin-policy-issues" data-testid="policy-form-issues">
      <strong>{t(`Chưa thể lưu nháp: ${issues.length} điểm cần sửa`, `Cannot save the draft: ${issues.length} issues`)}</strong>
      <ul>{issues.slice(0, 30).map((i, n) => <li key={n}>{i.message}</li>)}</ul>
    </div>}
  </>;
}
