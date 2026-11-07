import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ApiError } from "../../services/api";
import {
  approveAdminPortfolioPolicy, createAdminPortfolioPolicy, fetchAdminPortfolioPolicies, fetchAdminPortfolioPolicyDetail,
  publishAdminPortfolioPolicy, updateAdminPortfolioPolicy, validateAdminPortfolioPolicy,
  type PortfolioPolicyDetail, type PortfolioPolicyDocument, type PortfolioPolicyListResponse,
} from "../../services/portfolios";
import { Button, Checkbox, Input } from "../../components/ui";
import { useI18n } from "../../i18n";
import "../../components/retirement/planning-analysis.css";
import "./admin-portfolio-policies.css";

// Admin editor for portfolio policies (schemaVersion 2): structured fields for the
// allocation-risk parameters that are still CHỜ DUYỆT, plus the full JSON document.
// Draft → validate → approve → publish, mirroring the market data page.

type Doc = Record<string, any>;
type FieldDef = { key: string; label: string; hint: string; kind?: "int" | "decimal" };
type StressDef = { kind: string; label: string; fields: FieldDef[] };

const RISK_FIELDS: FieldDef[] = [
  { key: "equityShiftPoints", label: "Bước dịch cổ phiếu (điểm %)", hint: "Ứng viên = danh mục nền và ± bước này. Để trống thì chọn phương án trả REVIEW_REQUIRED." },
  { key: "essentialThreshold", label: "Ngưỡng p thiết yếu (0–1)", hint: "Ví dụ 0.90 = 90% kịch bản đủ chi thiết yếu." },
  { key: "cvarAlpha", label: "CVaR alpha (0–1)", hint: "Ví dụ 0.95." },
  { key: "blockMonths", label: "Độ dài khối bootstrap (tháng, 12–36)", hint: "Số nguyên.", kind: "int" },
  { key: "rebalanceBandPoints", label: "Dải tái cân bằng (điểm %)", hint: "Ví dụ 5." },
];

const offset: FieldDef = { key: "offsetMonths", label: "Lệch so với tháng nghỉ hưu (tháng)", hint: "Âm = trước khi nghỉ hưu.", kind: "int" };
const duration: FieldDef = { key: "durationMonths", label: "Kéo dài (tháng)", hint: "", kind: "int" };
const asset: FieldDef = { key: "assetClass", label: "Nhóm tài sản", hint: "Mã nhóm, ví dụ EQUITY." };
const STRESSES: StressDef[] = [
  { kind: "HIGH_INFLATION", label: "1. Lạm phát cao kéo dài", fields: [offset, duration, { key: "annualDeltaPoints", label: "Lạm phát tăng thêm (điểm %/năm)", hint: "" }] },
  { kind: "EQUITY_CRASH", label: "2. Cổ phiếu sụp quanh ngày nghỉ hưu", fields: [offset, asset, { key: "shockPercent", label: "Mức giảm (%)", hint: "Số âm, ví dụ -35." }] },
  { kind: "RATE_RISE", label: "3. Lãi suất tăng", fields: [offset, asset, { key: "durationYears", label: "Duration (năm)", hint: "" }, { key: "yieldRisePoints", label: "Lợi suất tăng (điểm %)", hint: "" }] },
  { kind: "CREDIT", label: "4. Khủng hoảng tín dụng", fields: [offset, asset, { key: "defaultPercent", label: "Tỷ lệ vỡ nợ (%)", hint: "" }, { key: "recoveryPercent", label: "Tỷ lệ thu hồi (%)", hint: "" }] },
  { kind: "GOLD", label: "5. Vàng giảm và dãn spread", fields: [offset, asset, { key: "shockPercent", label: "Giá giảm (%)", hint: "Số âm." }, { key: "spreadPoints", label: "Spread (điểm %)", hint: "" }] },
  { kind: "PROPERTY_ILLIQUIDITY", label: "6. Bất động sản đóng băng", fields: [offset, duration, { key: "delayMonths", label: "Chậm bán (tháng)", hint: "", kind: "int" }, { key: "haircutPercent", label: "Giảm giá bán (%)", hint: "" }] },
  { kind: "INCOME_LOSS", label: "7. Mất thu nhập", fields: [offset, duration, { key: "lostPercent", label: "Thu nhập mất (%)", hint: "" }] },
];

const text = (v: unknown) => v === undefined || v === null ? "" : String(v);
const toValue = (raw: string, kind?: "int" | "decimal") => raw.trim() === "" ? undefined : kind === "int" ? Number(raw) : raw.trim();

export default function AdminPortfolioPoliciesPage() {
  const { language } = useI18n();
  const t = (vi: string, en: string) => language === "en" ? en : vi;
  const [page, setPage] = useState(1);
  const [list, setList] = useState<PortfolioPolicyListResponse | null>(null);
  const [detail, setDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [json, setJson] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(""); const [conflict, setConflict] = useState(false); const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState<{ status: string; issues: any[] } | null>(null);
  const [note, setNote] = useState(""); const [confirm, setConfirm] = useState(false);

  useEffect(() => { let active = true; setList(null); fetchAdminPortfolioPolicies(page, 20).then(v => { if (active) setList(v); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [page]);

  const parsed: Doc | null = (() => { try { const v = JSON.parse(json); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; } })();
  const edit = creating || detail?.status === "DRAFT";
  const dirty = !!detail && json !== JSON.stringify(detail.data, null, 2);
  const risk: Doc = parsed?.allocationRisk ?? {};

  const accept = (v: PortfolioPolicyDetail) => { setDetail(v); setJson(JSON.stringify(v.data, null, 2)); setCreating(false); setConflict(false); setValidation(null); setConfirm(false); setNote(""); };
  const run = async (fn: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) {
    setError(e instanceof Error ? e.message : t("Không thể thực hiện thao tác.", "Could not complete this action.")); if (e instanceof ApiError && e.status === 409) { setConflict(true); setConfirm(false); }
  } finally { lock.current = false; setBusy(false); } };
  const refresh = async () => setList(await fetchAdminPortfolioPolicies(page, 20));
  const open = (id: string) => run(async () => accept(await fetchAdminPortfolioPolicyDetail(id)));

  // Structured fields write straight into the JSON so both views stay in sync.
  const patchRisk = (mutate: (r: Doc) => void) => {
    if (!parsed) return;
    const next = structuredClone(parsed); next.allocationRisk = next.allocationRisk ?? { evidence: "CHỜ DUYỆT" };
    mutate(next.allocationRisk);
    setJson(JSON.stringify(next, null, 2)); setValidation(null); setConfirm(false);
  };
  const setRiskField = (f: FieldDef, raw: string) => patchRisk(r => { const v = toValue(raw, f.kind); if (v === undefined) delete r[f.key]; else r[f.key] = v; });
  const toggleStress = (kind: string, on: boolean) => patchRisk(r => {
    r.stresses = r.stresses ?? {};
    if (on) r.stresses[kind] = r.stresses[kind] ?? {}; else delete r.stresses[kind];
  });
  const setStressField = (kind: string, f: FieldDef, raw: string) => patchRisk(r => {
    r.stresses = r.stresses ?? {}; const s = r.stresses[kind] = r.stresses[kind] ?? {};
    const v = toValue(raw, f.kind); if (v === undefined) delete s[f.key]; else s[f.key] = v;
  });
  const longevity: number[] = risk.stresses?.LONGEVITY?.extraYears ?? [];
  const setLongevity = (years: number, on: boolean) => patchRisk(r => {
    r.stresses = r.stresses ?? {};
    const set = new Set<number>(r.stresses.LONGEVITY?.extraYears ?? []); if (on) set.add(years); else set.delete(years);
    if (set.size) r.stresses.LONGEVITY = { ...(r.stresses.LONGEVITY ?? {}), extraYears: [...set].sort((a, b) => a - b) }; else delete r.stresses.LONGEVITY;
  });
  const v2 = parsed?.schemaVersion === 2;

  return <main className="planning-analysis admin-policy-page" data-testid="admin-portfolio-policies">
    <Link to="/admin/financial-config">{t("← Cấu hình tài chính", "← Financial configuration")}</Link>
    <h1>{t("Chính sách phân bổ danh mục", "Portfolio allocation policies")}</h1>
    <p>{t("Nháp → duyệt → công bố. Bản đã duyệt hoặc công bố không sửa được; tạo bản nháp mới để chỉnh. Tham số ghi CHỜ DUYỆT cần người có thẩm quyền xác nhận trước khi công bố.",
      "Draft → approved → published. Approved or published versions are immutable; create a new draft to change them. Parameters marked CHỜ DUYỆT need sign-off before publishing.")}</p>
    {error && <div role="alert"><strong>{t("Chưa hoàn tất thao tác", "Action not completed")}</strong><p>{error}</p>{conflict && <p>{t("Phiên bản đã thay đổi. Nội dung đang sửa vẫn giữ trên màn hình; tải lại để đối chiếu, không ghi đè tự động.", "The revision changed. Your edits stay on screen; reload to compare, nothing is overwritten automatically.")}</p>}</div>}
    {notice && <p role="status">{notice}</p>}

    <div className="planning-actions">
      <Button disabled={busy} onClick={() => { setCreating(true); setDetail(null); setJson(""); setValidation(null); setError(""); setConflict(false); setConfirm(false); }}>{t("Nhập tài liệu JSON mới", "Import a new JSON document")}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void run(refresh)}>{t("Tải lại danh sách", "Refresh list")}</Button>
    </div>
    {!list ? <p role="status">{t("Đang tải danh sách…", "Loading policies…")}</p> : <>
      {list.items.length === 0 && <p>{t("Chưa có chính sách nào.", "No policies yet.")}</p>}
      <ul className="admin-policy-list">{list.items.map(item => <li key={item.id}>
        <Button variant={detail?.id === item.id ? "primary" : "secondary"} disabled={busy} onClick={() => void open(item.id)}>
          v{item.version} · {item.title} · {item.status === "DRAFT" ? t("Nháp", "Draft") : item.status === "APPROVED" ? t("Đã duyệt", "Approved") : t("Đã công bố", "Published")}
        </Button>
      </li>)}</ul>
      <div className="planning-actions"><Button variant="secondary" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>{t("Trang trước", "Previous")}</Button><span>{t("Trang", "Page")} {page}</span><Button variant="secondary" disabled={page * 20 >= list.total || busy} onClick={() => setPage(page + 1)}>{t("Trang sau", "Next")}</Button></div>
    </>}

    {(creating || detail) && <section>
      <h2>{creating ? t("Bản nháp mới", "New draft") : `v${detail!.version} · ${detail!.data.title}`}</h2>
      {detail && <p>{t("Phiên bản chỉnh sửa", "Revision")}: {detail.revision} · hash: <code>{detail.documentHash}</code> · {t("Hiệu lực", "Effective")}: {detail.effectiveAt ?? t("Chưa công bố", "Not published")}</p>}
      {!edit && <p>{t("Bản này không sửa được. Bấm \"Tạo nháp mới từ bản này\" để chỉnh tham số.", "This version is read-only. Use \"Create a new draft from this version\" to change parameters.")}</p>}

      {parsed && !v2 && <p role="alert">{t("Biểu mẫu tham số chỉ áp dụng cho tài liệu schemaVersion 2. Hãy sửa trực tiếp JSON bên dưới.", "The parameter form only supports schemaVersion 2 documents. Edit the JSON below.")}</p>}
      {parsed && v2 && <fieldset className="admin-policy-form" disabled={!edit || busy || conflict}>
        <legend>{t("Tham số phân bổ và rủi ro", "Allocation and risk parameters")}</legend>
        <label className="admin-policy-wide">{t("Căn cứ / ghi chú duyệt", "Evidence / review note")}
          <textarea value={text(risk.evidence)} onChange={e => patchRisk(r => { r.evidence = e.target.value; })} rows={3} />
        </label>
        <div className="admin-policy-grid">{RISK_FIELDS.map(f => <label key={f.key}>{f.label}
          <input value={text(risk[f.key])} inputMode={f.kind === "int" ? "numeric" : "decimal"} onChange={e => setRiskField(f, e.target.value)} />
          {f.hint && <small>{f.hint}</small>}
        </label>)}</div>

        <h3>{t("Kịch bản sốc (mục 9.1)", "Stress scenarios (section 9.1)")}</h3>
        <p className="admin-policy-hint">{t("Bỏ chọn = không cấu hình, kịch bản sẽ báo REVIEW_REQUIRED. Ô trống sẽ bị máy chủ từ chối khi kiểm tra.", "Unchecked = not configured and reports REVIEW_REQUIRED. Empty fields are rejected on validation.")}</p>
        {STRESSES.map(s => { const cfg = risk.stresses?.[s.kind]; const on = cfg !== undefined; return <div key={s.kind} className={`admin-policy-stress${on ? " is-on" : ""}`}>
          <Checkbox checked={on} label={s.label} onChange={v => toggleStress(s.kind, v)} />
          {on && <div className="admin-policy-grid">{s.fields.map(f => <label key={f.key}>{f.label}
            <input value={text(cfg[f.key])} inputMode={f.kind === "int" ? "numeric" : "text"} onChange={e => setStressField(s.kind, f, e.target.value)} />
            {f.hint && <small>{f.hint}</small>}
          </label>)}</div>}
        </div>; })}
        <div className={`admin-policy-stress${longevity.length ? " is-on" : ""}`}>
          <strong>{t("8. Sống lâu hơn kế hoạch", "8. Longer life than planned")}</strong>
          <div className="admin-policy-inline">
            <Checkbox checked={longevity.includes(5)} label={t("+5 năm", "+5 years")} onChange={v => setLongevity(5, v)} />
            <Checkbox checked={longevity.includes(10)} label={t("+10 năm", "+10 years")} onChange={v => setLongevity(10, v)} />
          </div>
        </div>
      </fieldset>}

      <details className="admin-policy-json" open={!v2}>
        <summary>{t("Toàn bộ tài liệu JSON", "Full JSON document")}</summary>
        <textarea aria-label={t("Nội dung JSON của chính sách", "Policy JSON")} value={json} readOnly={!edit || busy || conflict} spellCheck={false} onChange={e => { setJson(e.target.value); setValidation(null); setConfirm(false); }} />
      </details>
      {json && !parsed && <p role="alert">{t("JSON chưa hợp lệ. Kiểm tra dấu ngoặc và dấu phẩy; chưa có dữ liệu được gửi.", "Invalid JSON. Check brackets and commas; nothing has been sent.")}</p>}

      <div className="planning-actions">
        {edit && <Button disabled={busy || conflict || !parsed || (!creating && !dirty)} onClick={() => void run(async () => {
          if (!parsed) return;
          const v = creating ? await createAdminPortfolioPolicy(parsed as PortfolioPolicyDocument) : await updateAdminPortfolioPolicy(detail!.id, detail!.revision, parsed as PortfolioPolicyDocument);
          accept(v); await refresh(); setNotice(t("Đã lưu bản nháp trên máy chủ.", "Draft saved on the server."));
        })}>{t("Lưu bản nháp", "Save draft")}</Button>}
        {detail && <>
          <Button variant="secondary" disabled={busy} onClick={() => void open(detail.id)}>{t("Tải lại để đối chiếu", "Reload for comparison")}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setCreating(true); setDetail(null); setValidation(null); setConfirm(false); setConflict(false); }}>{t("Tạo nháp mới từ bản này", "Create a new draft from this version")}</Button>
          <Button variant="secondary" disabled={busy || dirty || conflict} onClick={() => void run(async () => { setValidation(await validateAdminPortfolioPolicy(detail.id)); })}>{t("Kiểm tra bản đã lưu", "Validate saved version")}</Button>
        </>}
      </div>
      {validation && <div role="status"><h3>{validation.status === "VALID" ? t("Chính sách hợp lệ", "Policy is valid") : t("Chính sách chưa đủ điều kiện", "Policy is incomplete")}</h3>
        {validation.issues.length > 0 && <>
          <p>{t(`${validation.issues.length} lỗi, gom theo mã:`, `${validation.issues.length} issues, grouped by code:`)}</p>
          <ul>{Object.entries(validation.issues.reduce<Record<string, number>>((acc, i) => { const code = typeof i === "string" ? i : (i.code ?? i.message ?? "UNKNOWN"); acc[code] = (acc[code] ?? 0) + 1; return acc; }, {}))
            .sort((a, b) => b[1] - a[1]).map(([code, count]) => <li key={code}><code>{code}</code> × {count}</li>)}</ul>
          <details><summary>{t("Xem 20 dòng đầu", "Show the first 20")}</summary>
            <ul>{validation.issues.slice(0, 20).map((i, n) => <li key={n}>{typeof i === "string" ? i : <><code>{i.path ?? "—"}</code>: {i.message ?? i.code ?? JSON.stringify(i)}</>}</li>)}</ul>
          </details>
        </>}</div>}

      {detail?.status === "DRAFT" && <div className="admin-policy-approve">
        <Input label={t("Ghi chú phê duyệt", "Approval note")} value={note} onChange={setNote} disabled={busy || conflict} />
        <Checkbox checked={confirm} onChange={setConfirm} label={t("Tôi đã rà soát tham số, nguồn căn cứ và đã có xác nhận cho các mục CHỜ DUYỆT.", "I reviewed the parameters and evidence, and the CHỜ DUYỆT items have been signed off.")} />
        <Button disabled={busy || conflict || dirty || validation?.status !== "VALID" || note.trim().length < 3 || !confirm} onClick={() => void run(async () => { accept(await approveAdminPortfolioPolicy(detail.id, detail.revision, note.trim())); await refresh(); setNotice(t("Đã duyệt; chưa công bố.", "Approved; not yet published.")); })}>{t("Phê duyệt", "Approve")}</Button>
      </div>}
      {detail?.status === "APPROVED" && <div className="admin-policy-approve">
        <Checkbox checked={confirm} onChange={setConfirm} label={t("Xác nhận công bố đúng bản này; người dùng sẽ dùng chính sách này từ ngày hiệu lực.", "Confirm publishing this version; users will use it from its effective date.")} />
        <Button disabled={busy || conflict || !confirm} onClick={() => void run(async () => { accept(await publishAdminPortfolioPolicy(detail.id, detail.revision)); await refresh(); setNotice(t("Đã công bố chính sách.", "Policy published.")); })}>{t("Công bố", "Publish")}</Button>
      </div>}
    </section>}
  </main>;
}
