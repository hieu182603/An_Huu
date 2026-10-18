import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useI18n } from "../../i18n";
import { authenticatedRequest, ApiError } from "../../services/api";
import { explainRetirementPlan, getAiPrivacy } from "../../services/ai";
import type { RetirementPreviewInput } from "../../services/retirement";
import { formatVNDCurrency } from "../../services/retirement";
import { positionExplainPopup } from "./position";
import { matchGlossaryTerm } from "./glossaryMatch";
import { mergeExplanationTerms, type GlossaryTerm } from "./catalog";
import { createExplanationCache, explanationRequestKey } from "./requestCache";
import { Icon } from "../ui";
import ResponsiveDialog from "../ResponsiveDialog";
import "./explanations.css";

export type ExplainSource = { kind: "PLAN_VERSION"; planId: string; versionId: string } | { kind: "PREVIEW"; input: RetirementPreviewInput };
type MetricData = { metricKey: string; label: { vi: string; en: string }; value: string; unit: string; formula: { vi: string; en: string; symbolic?: string }; steps: Array<{ label: { vi: string; en: string }; value: string; unit: string; source: string }>; assumptions: { version: number; sources: Array<{ title: string; publisher: string; url: string; release: string }> }; notes: string[]; limitations: string[] };
type ExplainRequest = { term?: string; metric?: string; source?: ExplainSource; value?: string; children?: ReactNode; className?: string };
type OpenItem = { id: number; request: ExplainRequest; target: HTMLElement; x: number; y: number; data?: MetricData; error?: string; loading?: boolean; monthly?: MetricData; monthlyLoading?: boolean; aiAnswer?: string; aiCitations?: Array<{ title: string; url: string | null }>; aiStatus?: string; aiLoading?: boolean; aiRequested?: boolean; selectedText?: string };
type ContextValue = { enabled: boolean; open: (request: ExplainRequest, target: HTMLElement, x: number, y: number) => void; dismissTarget: (target: HTMLElement | null) => void };
const ExplainContext = createContext<ContextValue>({ enabled: false, open: () => {}, dismissTarget: () => {} });
const locale = (item: { vi: string; en: string }, lang: string) => lang === "en" ? item.en : item.vi;
// Short selections are explained automatically; longer passages keep an explicit
// button so a stray paragraph selection is not sent to the AI provider.
const AUTO_EXPLAIN_MAX_CHARS = 300;
const SELECTION_SETTLE_MS = 300;
const decimalEqual = (a: string, b: string) => { const norm = (s: string) => { const [whole, fraction = ""] = s.split("."); return `${whole.replace(/^(-?)0+(?=\d)/, "$1")}.${fraction.replace(/0+$/, "")}`.replace(/\.$/, ""); }; return norm(a) === norm(b); };
export { positionExplainPopup } from "./position";
export function ExplainModeProvider({ children, enabled, onDisable }: { children: ReactNode; enabled: boolean; onDisable: () => void }) {
  const { language } = useI18n();
  const [opened, setOpened] = useState<OpenItem | null>(null);
  const [glossary, setGlossary] = useState<{ version: string; terms: GlossaryTerm[] } | null>(null);
  const [glossaryFailed, setGlossaryFailed] = useState(false);
  const requestSequence = useRef(0);
  const metricCache = useMemo(() => createExplanationCache<MetricData>(), []);
  const glossaryCache = useMemo(() => createExplanationCache<{ version: string; terms: GlossaryTerm[] }>(1, 15 * 60_000), []);
  const [glossaryRetry, setGlossaryRetry] = useState(0);
  const terms = useMemo(() => mergeExplanationTerms(glossary?.terms ?? []), [glossary]);
  const panel = useRef<HTMLDivElement>(null);
  const scrollAtOpen = useRef({ x: 0, y: 0 });
  const monthlyTrigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const open = useCallback((request: ExplainRequest, target: HTMLElement, x: number, y: number) => {
    scrollAtOpen.current = { x: window.scrollX, y: window.scrollY };
    setOpened({ id: ++requestSequence.current, request, target, x, y, loading: Boolean(request.metric) });
  }, []);
  const close = useCallback(() => { setOpened(current => { current?.target.focus({ preventScroll: true }); return null; }); }, []);
  const dismissTarget = useCallback((target: HTMLElement | null) => setOpened(current => current?.target === target ? null : current), []);
  useEffect(() => {
    if (!enabled) { setOpened(null); return; }
    let active = true;
    setGlossaryFailed(false);
    glossaryCache.get("glossary", () => authenticatedRequest<{ version: string; terms: GlossaryTerm[] }>("/me/explanations/glossary"))
      .then(data => { if (active) setGlossary(data); })
      .catch(() => { if (active) setGlossaryFailed(true); });
    return () => { active = false; };
  }, [enabled, glossaryRetry, glossaryCache]);
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    // Wait until a double/triple click has finished so one selection sends one request.
    const select = () => { window.clearTimeout(timer); timer = window.setTimeout(() => {
      const selection = window.getSelection(), selectedText = selection?.toString().trim().replace(/\s+/g, " ");
      if (!selection || !selectedText || selectedText.length < 2 || selectedText.length > 2000 || !selection.rangeCount) return;
      const node = selection.anchorNode, target = node instanceof Element ? node : node?.parentElement;
      if (!target || target.closest(".explain-backdropless") || target.closest(".explain-target")) return;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      scrollAtOpen.current = { x: window.scrollX, y: window.scrollY };
      setOpened(current => current?.selectedText === selectedText && current.target === target ? current
        : { id: ++requestSequence.current, request: {}, target: target as HTMLElement, x: rect.right, y: rect.bottom, selectedText });
    }, SELECTION_SETTLE_MS); };
    document.addEventListener("pointerup", select);
    return () => { window.clearTimeout(timer); document.removeEventListener("pointerup", select); };
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const esc = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || opened?.monthly) return;
      if (opened) close(); else onDisable();
    };
    const dismiss = (event: Event) => {
      if (!opened || opened.monthly) return;
      if (event.target instanceof Element && event.target.closest(".explain-backdropless")) return;
      // A click can deliver the preceding scroll-into-view event after opening.
      // Dismiss only if the page has actually moved since this popup opened.
      if (event.type === "scroll" && event.target === document && window.scrollX === scrollAtOpen.current.x && window.scrollY === scrollAtOpen.current.y) return;
      close();
    };
    window.addEventListener("keydown", esc);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [enabled, opened, close, onDisable]);
  useEffect(() => {
    if (!opened || opened.monthly) return;
    const handler = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !opened.target.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [opened, close]);
  useLayoutEffect(() => {
    if (!opened || !panel.current) return;
    const element = panel.current;
    const reposition = () => {
      const rect = element.getBoundingClientRect();
      setPosition(positionExplainPopup({ x: opened.x, y: opened.y }, rect, { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }));
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(element);
    return () => observer.disconnect();
  }, [opened]);
  useEffect(() => {
    if (opened) panel.current?.focus({ preventScroll: true });
  }, [opened?.target, opened?.selectedText]);
  const readMetric = useCallback((item: OpenItem, detail: "SUMMARY" | "MONTHLY") => {
    const body = { metricKey: item.request.metric, source: item.request.source, detail };
    const key = explanationRequestKey({ ...body, value: item.request.value, language });
    return metricCache.get(key, () => authenticatedRequest<MetricData>("/me/explanations/metric", body)).then(data => {
      if (item.request.value !== undefined && !decimalEqual(data.value, item.request.value)) {
        metricCache.delete(key);
        throw new ApiError(409, "EXPLANATION_VALUE_CHANGED", language === "en" ? "The figure has changed. Please reload." : "Số liệu đã thay đổi, hãy tải lại");
      }
      return data;
    });
  }, [metricCache, language]);
  useEffect(() => {
    if (!opened?.request.metric || !opened.request.source) return;
    const item = opened;
    let live = true;
    const timer = window.setTimeout(() => {
      readMetric(item, "SUMMARY").then(data => {
        if (live) setOpened(current => current?.id === item.id ? { ...current, data, loading: false, error: undefined } : current);
      }).catch((err: unknown) => {
        if (live) setOpened(current => current?.id === item.id ? { ...current, loading: false, error: explainError(err, language) } : current);
      });
    }, 100);
    return () => { live = false; clearTimeout(timer); };
  }, [opened?.id, readMetric, language]);
  const askAi = useCallback(async (item: OpenItem) => {
    const phrase = item.selectedText || item.request.term || "";
    // Only patch the popup this request belongs to; a newer selection may have replaced it.
    const same = (current: OpenItem | null): current is OpenItem => Boolean(current && current.id === item.id);
    const update = (patch: Partial<OpenItem>) => setOpened(current => same(current) ? { ...current, ...patch } : current);
    update({ aiRequested: true, aiLoading: true, aiStatus: undefined, error: undefined });
    try { const privacy = await getAiPrivacy(); if (!privacy.processing || privacy.reconsentRequired || (privacy.acceptedPolicyVersion && privacy.acceptedPolicyVersion !== privacy.policyVersion)) { update({ aiLoading: false, aiStatus: language === "en" ? "To get an AI explanation, open the Assistant page and accept AI processing first." : "Để AI giải thích, hãy mở trang Trợ lý AI và đồng ý xử lý trước." }); return; } const result = await explainRetirementPlan({ question: `${language === "en" ? "Explain the phrase" : "Giải thích cụm từ"}: ${phrase}` }); update({ aiLoading: false, aiAnswer: result.answer, aiCitations: result.citations.map(citation => ({ title: citation.title, url: citation.url })), aiStatus: result.status === "AI_ASSISTED" ? (result.knowledgeStatus === "NO_APPROVED_MATCH" ? (language === "en" ? "No approved reference was found." : "Chưa tìm thấy tài liệu phù hợp đã duyệt.") : "") : result.status === "PROVIDER_UNAVAILABLE" ? (language === "en" ? "The AI provider is unavailable; this is a fallback answer." : "Nhà cung cấp AI đang gián đoạn; đây là câu trả lời dự phòng.") : (language === "en" ? "External AI is not configured; this is a fallback answer." : "Dịch vụ AI ngoài chưa được cấu hình; đây là câu trả lời dự phòng.") });
    } catch (err) { update({ aiLoading: false, error: explainError(err, language), aiStatus: err instanceof ApiError && err.code === "AI_CONSENT_REQUIRED" ? (language === "en" ? "Open the Assistant page to review AI consent." : "Hãy mở trang Trợ lý AI để xem và cập nhật đồng ý xử lý.") : undefined }); }
  }, [language]);
  // Curated content always wins. An explicit term key is never an AI prompt;
  // only unmatched user-selected text can enter the consent-gated AI fallback.
  useEffect(() => {
    if (!opened || opened.aiRequested || opened.request.metric || opened.request.term) return;
    if (!opened.selectedText) return;
    const match = matchGlossaryTerm(opened.selectedText, terms);
    if (match) {
      setOpened(current => current?.id === opened.id ? { ...current, request: { ...current.request, term: match.key } } : current);
      return;
    }
    if (!glossary || glossaryFailed) return;
    if (opened.selectedText.length <= AUTO_EXPLAIN_MAX_CHARS) void askAi(opened);
  }, [opened, terms, glossary, glossaryFailed, askAi]);
  const value = useMemo(() => ({ enabled, open, dismissTarget }), [enabled, open, dismissTarget]);
  const glossaryTerm = terms.find(term => term.key === opened?.request.term);
  const title = opened?.request.metric
    ? (opened.data ? locale(opened.data.label, language) : (language === "en" ? "Figure explanation" : "Giải thích số liệu"))
    : glossaryTerm ? locale(glossaryTerm.label, language)
    : opened?.selectedText ? `“${opened.selectedText.length > 80 ? `${opened.selectedText.slice(0, 80)}…` : opened.selectedText}”`
    : (language === "en" ? "Term explanation" : "Giải thích thuật ngữ");
  const loadMonthly = async () => {
    if (!opened) return;
    const item = opened;
    setOpened({ ...item, monthlyLoading: true });
    try {
      const monthly = await readMetric(item, "MONTHLY");
      setOpened(cur => cur?.id === item.id ? { ...cur, monthly, monthlyLoading: false } : cur);
    } catch (err) {
      setOpened(cur => cur?.id === item.id ? { ...cur, error: explainError(err, language), monthlyLoading: false } : cur);
    }
  };
  return <ExplainContext.Provider value={value}>
    {children}
    {opened && createPortal(<div className="explain-backdropless">
      <div ref={panel} role="dialog" tabIndex={-1} aria-labelledby="explain-title" inert={Boolean(opened.monthly)} className="explain-popup" style={{ left: position.left, top: position.top }}>
        <header className="explain-header">
          <span className="explain-emblem" aria-hidden="true"><Icon name={opened.request.metric ? "chart" : glossaryTerm ? "file-text" : "sparkles"} /></span>
          <div className="explain-heading">
            <span className="explain-kind">{opened.request.metric ? (language === "en" ? "Understand this figure" : "Hiểu con số của bạn") : (glossaryTerm || opened.request.term) ? (language === "en" ? "An Hưu glossary" : "Thuật ngữ An Hưu") : (language === "en" ? "AI explanation – for reference" : "AI giải thích – tham khảo")}</span>
            <h2 id="explain-title">{title}</h2>
          </div>
          <button className="explain-close" type="button" onClick={close} aria-label={language === "en" ? "Close explanation" : "Đóng giải thích"}><Icon name="x" /></button>
        </header>
        <div className="explain-body" key={`${opened.request.metric ?? opened.request.term ?? opened.selectedText}`}>
          {opened.request.metric ? <MetricPopup item={opened} language={language} /> : <>
            {!glossaryTerm && !glossary && !glossaryFailed && <LoadingState>{language === "en" ? "Looking up the explanation…" : "Đang tìm giải thích…"}</LoadingState>}
            {glossaryTerm && <p className="explain-definition">{locale(glossaryTerm.definition, language)}</p>}
            {!glossaryTerm && !opened.aiRequested && glossaryFailed && <div className="explain-notice" role="status"><p>{language === "en" ? "The glossary could not be loaded. Try again to see the prepared explanation." : "Chưa tải được bảng thuật ngữ. Hãy thử lại để xem nội dung viết sẵn."}</p><button className="explain-action" type="button" onClick={() => setGlossaryRetry(value => value + 1)}>{language === "en" ? "Reload glossary" : "Tải lại thuật ngữ"}</button></div>}
            {opened.request.term && !glossaryTerm && glossary && !glossaryFailed && <p className="explain-notice" role="status">{language === "en" ? "A prepared explanation is not yet available for this label." : "Nhãn này chưa có nội dung giải thích viết sẵn."}</p>}
            {opened.selectedText && !opened.request.term && !glossaryTerm && !opened.aiRequested && (opened.selectedText.length > AUTO_EXPLAIN_MAX_CHARS || glossaryFailed) && <>
              <p className="explain-selection">{opened.selectedText}</p>
              <button className="explain-action" type="button" onClick={() => void askAi(opened)}>{language === "en" ? "Ask AI to explain this passage" : "Nhờ AI giải thích đoạn này"}<Icon name="arrow-right" /></button>
            </>}
            {opened.aiLoading && <LoadingState>{language === "en" ? "AI is preparing an explanation…" : "AI đang giải thích…"}</LoadingState>}
            {opened.aiStatus && <p className="explain-notice" role="status">{opened.aiStatus}</p>}
            {opened.aiAnswer && <>
              <div className="explain-answer">{opened.aiAnswer.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
              {!!opened.aiCitations?.length && <details className="explain-details"><summary>{language === "en" ? "Reference sources" : "Nguồn tham khảo"}<Icon name="chevron-down" /></summary><ul className="explain-sources">{opened.aiCitations.map((citation, index) => <li key={index}>{citation.url ? <a href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a> : citation.title}</li>)}</ul></details>}
            </>}
            {opened.error && <><p className="explain-error" role="alert">{opened.error}</p>{opened.aiRequested && !opened.aiLoading && <button className="explain-action" type="button" onClick={() => void askAi(opened)}>{language === "en" ? "Try again" : "Thử lại"}</button>}</>}
          </>}
        </div>
        <footer className="explain-footer">
          {opened.request.metric ? opened.data && !opened.error && <button ref={monthlyTrigger} className="explain-action" type="button" onClick={() => void loadMonthly()} disabled={opened.monthlyLoading}>{opened.monthlyLoading ? (language === "en" ? "Loading months…" : "Đang tải từng tháng…") : (language === "en" ? "View monthly details" : "Xem chi tiết từng tháng")}<Icon name="arrow-right" /></button>
            : <Link className="explain-action" to="/user/assistant" onClick={close}><Icon name="message" />{language === "en" ? "Ask the AI Assistant" : "Hỏi thêm Trợ lý AI"}<Icon name="arrow-right" /></Link>}
          <span className="explain-dismiss-hint"><kbd>Esc</kbd> {language === "en" ? "to close" : "để đóng"}</span>
        </footer>
      </div>
      {opened.monthly && <MonthlyDialog data={opened.monthly} language={language} onClose={() => {
        setOpened(current => current ? { ...current, monthly: undefined } : current);
        requestAnimationFrame(() => monthlyTrigger.current?.focus({ preventScroll: true }));
      }} />}
    </div>, document.body)}
  </ExplainContext.Provider>;
}
function explainError(error: unknown, language: string) { if (error instanceof ApiError) { if (error.code === "METRIC_NOT_AVAILABLE") return language === "en" ? "No explanation is available for this figure." : "Chưa có giải thích cho số liệu này"; if (error.status === 429) return language === "en" ? "Too many requests. Please wait and try again." : "Bạn thao tác hơi nhanh. Vui lòng chờ rồi thử lại."; if (error.code === "AI_CONSENT_REQUIRED") return language === "en" ? "Please review AI consent on the Assistant page." : "Hãy xem và cập nhật đồng ý xử lý AI trong trang Trợ lý AI."; if (error.code === "AI_PRIVACY_CHANGED") return language === "en" ? "AI privacy settings changed. Reload them on the Assistant page." : "Tùy chọn AI đã thay đổi. Hãy tải lại trong trang Trợ lý AI."; return error.message; } return language === "en" ? "Could not load the explanation. Please try again." : "Chưa tải được giải thích. Vui lòng thử lại."; }
function formatValue(value: string, unit: string, lang: string) { if (unit === "VND") return formatVNDCurrency(value); if (unit === "PERCENT") return `${value}%`; if (unit === "FACTOR") return `${value}×`; if (unit === "MONTHS") return `${value} ${lang === "en" ? "months" : "tháng"}`; if (unit === "TIMING") return value === "END_OF_MONTH" ? (lang === "en" ? "End of month" : "Cuối tháng") : value === "START_OF_MONTH" ? (lang === "en" ? "Start of month" : "Đầu tháng") : value; return value; }
function LoadingState({ children }: { children: ReactNode }) {
  return <div className="explain-loading" role="status"><span className="explain-spinner" aria-hidden="true" /><span>{children}</span></div>;
}

function MetricPopup({ item, language }: { item: OpenItem; language: string }) {
  const metric = item.data;
  return <>
    {item.loading && <LoadingState>{language === "en" ? "Loading the calculation…" : "Đang tải cách tính…"}</LoadingState>}
    {item.error && <p className="explain-error" role="alert">{item.error}</p>}
    {metric && !item.error && <>
      <div className="explain-result"><span>{language === "en" ? "Calculated result" : "Kết quả tính toán"}</span><strong className="explain-value">{formatValue(metric.value, metric.unit, language)}</strong></div>
      <section className="explain-section"><h3>{language === "en" ? "How it is calculated" : "Con số này được tính thế nào?"}</h3><p>{locale(metric.formula, language)}</p>{metric.formula.symbolic && <code className="explain-formula">{metric.formula.symbolic}</code>}</section>
      <table className="explain-table"><thead><tr><th scope="col">{language === "en" ? "Calculation inputs" : "Thành phần tính toán"}</th><th scope="col">{language === "en" ? "Value" : "Giá trị"}</th></tr></thead><tbody>{metric.steps.map((step, index) => <tr key={`${index}-${step.source}`}><td>{locale(step.label, language)}</td><td>{formatValue(step.value, step.unit, language)}</td></tr>)}</tbody></table>
      {!!metric.notes.length && <div className="explain-notes">{metric.notes.map((note, i) => <p key={i}>{note}</p>)}</div>}
      {!!metric.limitations.length && <div className="explain-notice"><strong>{language === "en" ? "Keep in mind" : "Lưu ý khi đọc kết quả"}</strong>{metric.limitations.map((note, i) => <p key={i}>{note}</p>)}</div>}
      <details className="explain-details"><summary>{language === "en" ? "Assumptions & data sources" : "Giả định và nguồn dữ liệu"}<Icon name="chevron-down" /></summary>
        <p>{language === "en" ? "Assumption set" : "Phiên bản giả định"}: {metric.assumptions.version}</p>
        {!!metric.assumptions.sources.length && <ul className="explain-sources">{metric.assumptions.sources.map((source, i) => <li key={i}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.publisher} · {source.release}</span></li>)}</ul>}
        <dl className="explain-data-sources">{metric.steps.map((step, i) => <div key={i}><dt>{locale(step.label, language)}</dt><dd>{step.source}</dd></div>)}</dl>
      </details>
    </>}
  </>;
}

function MonthlyDialog({ data, language, onClose }: { data: MetricData; language: string; onClose: () => void }) {
  return <ResponsiveDialog open title={language === "en" ? "Monthly calculation details" : "Chi tiết phép tính theo tháng"} onClose={onClose} usePortal={false} className="explain-monthly-dialog">
    <p className="explain-monthly-caption">{locale(data.label, language)} · {data.steps.length} {language === "en" ? "calculation steps" : "bước tính"}</p>
    <div className="explain-monthly" tabIndex={0} role="region" aria-label={language === "en" ? "Monthly calculation table" : "Bảng phép tính theo tháng"}>
      <table className="explain-table"><thead><tr><th scope="col">{language === "en" ? "Step" : "Bước"}</th><th scope="col">{language === "en" ? "Value" : "Giá trị"}</th><th scope="col">{language === "en" ? "Source" : "Nguồn"}</th></tr></thead><tbody>{data.steps.map((step, index) => <tr key={`${index}-${step.source}`}><td>{locale(step.label, language)}</td><td>{formatValue(step.value, step.unit, language)}</td><td><code>{step.source}</code></td></tr>)}</tbody></table>
    </div>
  </ResponsiveDialog>;
}
export function Explain(props: ExplainRequest) { const context = useContext(ExplainContext); const ref = useRef<HTMLSpanElement>(null);
  const identity = explanationRequestKey({ metric: props.metric, source: props.source, value: props.value, term: props.term });
  useEffect(() => {
    const target = ref.current;
    return () => context.dismissTarget(target);
  }, [identity, context.enabled, context.dismissTarget]);
  if (!context.enabled) return <>{props.children}</>; return <span ref={ref} className={`explain-target ${props.className || ""}`} tabIndex={props.metric || props.term ? 0 : undefined} role={props.metric || props.term ? "button" : undefined} onClick={event => { if (!props.metric && !props.term) return; context.open(props, event.currentTarget, event.clientX || event.currentTarget.getBoundingClientRect().left, event.clientY || event.currentTarget.getBoundingClientRect().bottom); }} onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && (props.metric || props.term)) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); context.open(props, event.currentTarget, rect.left, rect.bottom); } }}>{props.children}</span>; }
