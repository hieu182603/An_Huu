import { useEffect, useState } from "react";
import { previewMonthlyRetirement, translateIssueCode, type RetirementPreviewInput, type RetirementPreviewResult } from "../../services/retirement";
import { useI18n } from "../../i18n";
import { Button, Card } from "../ui";
import "./guided-scenarios.css";

export function GuidedScenarios({ input, retirementMonth }: { input: RetirementPreviewInput | null; retirementMonth?: string }) {
  const { language } = useI18n();
  const en = language === "en";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; results: Array<RetirementPreviewResult | "error" | null> }>({ key: "", results: [] });
  const anchor = input?.whatIf?.retirementMonth ?? retirementMonth;
  const validMonth = (month?: string): month is string => !!month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const delayed = validMonth(anchor) ? `${Number(anchor.slice(0, 4)) + 5}-${anchor.slice(5, 7)}` : null;
  const canDelay = !!(delayed && input && validMonth(input.endMonth) && delayed <= input.endMonth);
  // Decimal string arithmetic preserves cents even for amounts above JS safe integers.
  const lowerExpense = input && /^\d+(?:\.\d{1,2})?$/.test(input.monthlyExpenseToday) ? (() => {
    const [whole, fraction = ""] = input.monthlyExpenseToday.split(".");
    const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * 85n;
    const rounded = (cents + 50n) / 100n;
    return `${rounded / 100n}.${String(rounded % 100n).padStart(2, "0")}`;
  })() : null;
  const commands = input ? [input, canDelay ? { ...input, whatIf: { ...input.whatIf, retirementMonth: delayed! } } : null, lowerExpense !== null ? { ...input, monthlyExpenseToday: lowerExpense } : null] : [null, null, null];
  const key = JSON.stringify(commands);
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, results: [] });
    const timer = window.setTimeout(() => {
      const currentCommands: Array<RetirementPreviewInput | null> = JSON.parse(key);
      currentCommands.forEach((command, index) => {
        if (!command) return;
        previewMonthlyRetirement(command, controller.signal).then(result => {
          if (!controller.signal.aborted) setState(previous => { const results = [...previous.results]; results[index] = result; return { key, results }; });
        }).catch(() => {
          if (!controller.signal.aborted) setState(previous => { const results = [...previous.results]; results[index] = "error"; return { key, results }; });
        });
      });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, attempt]);
  const titles = en ? ["Keep your declared plan", "Retire 5 years later", "Spend 15% less"] : ["Giữ kế hoạch đã khai", "Nghỉ muộn hơn 5 năm", "Chi ít hơn 15%"];
  const money = (value: string | null | undefined) => value != null && value.trim() !== "" && Number.isFinite(Number(value)) ? new Intl.NumberFormat(en ? "en-US" : "vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value)) : (en ? "Undetermined" : "Chưa xác định");
  return <section className="guided-scenarios" aria-labelledby="guided-scenarios-title">
    <h2 id="guided-scenarios-title">{en ? "Compare three ways forward" : "So sánh ba hướng đi"}</h2>
    <p>{en ? "Preview only. These cards do not save a version or change the plan in use. All other inputs remain the same." : "Chỉ xem trước. Các thẻ không lưu phiên bản hay thay đổi kế hoạch đang dùng. Các đầu vào khác được giữ nguyên."}</p>
    <div className="guided-scenarios-grid">{titles.map((title, index) => {
      const result = state.key === key ? state.results[index] : null;
      const summary = result && result !== "error" && result.status === "READY" ? result.calculation?.summary : null;
      return <Card key={index} className="guided-scenario" ><h3>{title}</h3>
        {!commands[index] ? <p>{index === 1 && input ? (en ? "This option needs a retirement date and cannot exceed the plan end month." : "Cần có tháng nghỉ hưu và mốc nghỉ muộn không được vượt tháng kết thúc kế hoạch.") : (en ? "Complete the plan inputs to preview." : "Bổ sung đầu vào kế hoạch để xem trước.")}</p>
          : !result ? <p role="status">{en ? "Calculating…" : "Đang tính…"}</p>
          : result === "error" ? <div role="alert"><p>{en ? "Could not calculate this option." : "Chưa tính được phương án này."}</p><Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{en ? "Retry" : "Thử lại"}</Button></div>
          : summary ? <><p>{en ? "Retirement month" : "Tháng nghỉ hưu"}: {summary.retirementMonth}</p><dl>
            <div><dt>{en ? "Required fund" : "Quỹ cần"}</dt><dd>{money(summary.atRetirement.requiredFund)}</dd></div>
            <div><dt>{en ? "Projected fund" : "Quỹ dự kiến"}</dt><dd>{money(summary.atRetirement.projectedFund)}</dd></div>
            <div><dt>{en ? "Required monthly contribution" : "Khoản góp cần mỗi tháng"}</dt><dd>{money(summary.requiredConstantMonthlyContribution)}</dd></div>
          </dl></> : <div role="status"><p>{en ? "Not enough data to calculate." : "Chưa đủ dữ liệu để tính."}</p><ul>{result.issues.map((issue, i) => <li key={i}>{translateIssueCode(issue.code, language)}</li>)}</ul></div>}
      </Card>;
    })}</div>
  </section>;
}
