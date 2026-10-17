import { useEffect, useState } from "react";
import { Link } from "react-router";
import { previewMonthlyRetirement, translateIssueCode, type RetirementPreviewInput, type RetirementPreviewResult } from "../../services/retirement";
import { useI18n } from "../../i18n";
import { Button, Card, Icon } from "../ui";
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
  const descriptions = en
    ? ["Keep your current choices.", "Move your retirement date five years later.", "Reduce your selected retirement spending by 15%."]
    : ["Giữ nguyên các lựa chọn hiện tại.", "Dời thời điểm nghỉ hưu thêm 5 năm.", "Giảm 15% mức chi tiêu hưu trí đã chọn."];
  const results = state.key === key ? state.results : [];
  // Several missing answers can translate to the same instruction. Show it once,
  // and keep scenario-specific blockers with the option they belong to.
  const messages = titles.map((_, index) => {
    const result = results[index];
    return result && result !== "error" && !(result.status === "READY" && result.calculation?.summary)
      ? [...new Set(result.issues.map(issue => translateIssueCode(issue.code, language)))] : [];
  });
  const available = commands.flatMap((command, index) => command ? [index] : []);
  const sharedMessages = available.length > 1
    ? messages[available[0]].filter(message => available.every(index => messages[index].includes(message))) : [];
  const surveyMessages = ["ANSWER_REQUIRED", "UNKNOWN_CHOICE", "DUPLICATE_ANSWER", "UNKNOWN_QUESTION", "TEMPLATE_NOT_ELIGIBLE", "PORTFOLIO_CHOICE_REQUIRED"].map(code => translateIssueCode(code, language));
  const policyMessages = ["POLICY_NOT_COVERED", "PUBLISHED_INFLATION_REQUIRED", "INFLATION_YEAR_MISSING", "PROJECTION_NOT_COVERED", "ASSET_HORIZON_NOT_COVERED", "RISK_BAND_NOT_COVERED"].map(code => translateIssueCode(code, language));
  const planMessages = ["START_OF_MONTH_FUNDING_CONFIRMATION_REQUIRED", "FUNDING_OUTSIDE_ACCUMULATION", "CONTRIBUTION_OUTSIDE_ACCUMULATION", "CONTRIBUTION_OUTSIDE_RETIREMENT"].map(code => translateIssueCode(code, language));
  const profileMessages = ["RETIREMENT_MONTH_REQUIRED", "RETIREMENT_CAPITAL_INCOMPLETE", "DEBT_SCHEDULE_REQUIRED", "FULL_LIABILITY_CONFIRMATION_REQUIRED", "HOUSING_AMOUNT_SCOPE_REQUIRED", "HOUSING_AMOUNT_INCOMPLETE", "INVALID_RETIREMENT_INCOME_REFERENCE", "LOAN_CONTRACT_REQUIRED"].map(code => translateIssueCode(code, language));
  const needsSurvey = sharedMessages.some(message => surveyMessages.includes(message));
  const needsSupport = sharedMessages.some(message => policyMessages.includes(message) || (!surveyMessages.includes(message) && !planMessages.includes(message) && !profileMessages.includes(message)));
  const needsPlan = sharedMessages.some(message => planMessages.includes(message));
  const needsProfile = sharedMessages.some(message => profileMessages.includes(message));
  const money = (value: string | null | undefined) => value != null && value.trim() !== "" && Number.isFinite(Number(value)) ? new Intl.NumberFormat(en ? "en-US" : "vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value)) : (en ? "Undetermined" : "Chưa xác định");
  return <section className="guided-scenarios" aria-labelledby="guided-scenarios-title">
    <h2 id="guided-scenarios-title">{en ? "Compare three ways forward" : "So sánh ba hướng đi"}</h2>
    <p>{en ? "Preview only. These cards do not save a version or change the plan in use. All other inputs remain the same." : "Chỉ xem trước. Các thẻ không lưu phiên bản hay thay đổi kế hoạch đang dùng. Các đầu vào khác được giữ nguyên."}</p>
    {sharedMessages.length > 0 && (
      <div className="guided-scenarios-notice" role="status">
        <Icon name="info" />
        <div>
          <strong>{en ? "Complete these items to compare your options" : "Hoàn tất thông tin để so sánh các hướng đi"}</strong>
          <ul>{sharedMessages.map(message => <li key={message}>{message}</li>)}</ul>
          <div className="guided-scenarios-actions">
            {needsSurvey && <Link className="button button-primary button-small" to="/user/risk-portfolio">{en ? "Complete investment survey" : "Hoàn tất khảo sát đầu tư"}<Icon name="arrow-right" size="small" /></Link>}
            {needsPlan && <a className="button button-secondary button-small" href="#plan-settings">{en ? "Review plan settings" : "Kiểm tra thiết lập kế hoạch"}</a>}
            {needsProfile && <Link className="button button-secondary button-small" to="/user/account?tab=profile">{en ? "Review financial profile" : "Kiểm tra hồ sơ tài chính"}</Link>}
            {needsSupport && <Link className="button button-secondary button-small" to="/user/support">{en ? "Contact support" : "Liên hệ hỗ trợ"}</Link>}
          </div>
        </div>
      </div>
    )}
    <div className="guided-scenarios-grid">{titles.map((title, index) => {
      const result = results[index];
      const summary = result && result !== "error" && result.status === "READY" ? result.calculation?.summary : null;
      const ownMessages = messages[index].filter(message => !sharedMessages.includes(message));
      return <Card key={index} className="guided-scenario">
        <div className="guided-scenario-heading"><span className="guided-scenario-icon"><Icon name={index === 0 ? "file-text" : index === 1 ? "compass" : "wallet"} /></span><span className="guided-scenario-kind">{index === 0 ? (en ? "CURRENT CHOICES" : "LỰA CHỌN HIỆN TẠI") : (en ? "ALTERNATIVE" : "PHƯƠNG ÁN THAM KHẢO")}</span></div>
        <h3>{title}</h3>
        <p className="guided-scenario-description">{descriptions[index]}</p>
        {!commands[index] ? <p>{index === 1 && input ? (en ? "This option needs a retirement date and cannot exceed the plan end month." : "Cần có tháng nghỉ hưu và mốc nghỉ muộn không được vượt tháng kết thúc kế hoạch.") : (en ? "Complete the plan inputs to preview." : "Bổ sung đầu vào kế hoạch để xem trước.")}</p>
          : !result ? <p role="status">{en ? "Calculating…" : "Đang tính…"}</p>
          : result === "error" ? <div role="alert"><p>{en ? "Could not calculate this option." : "Chưa tính được phương án này."}</p><Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{en ? "Retry" : "Thử lại"}</Button></div>
          : summary ? <><p>{en ? "Retirement month" : "Tháng nghỉ hưu"}: {summary.retirementMonth}</p><dl>
            <div><dt>{en ? "Required fund" : "Quỹ cần"}</dt><dd>{money(summary.atRetirement.requiredFund)}</dd></div>
            <div><dt>{en ? "Projected fund" : "Quỹ dự kiến"}</dt><dd>{money(summary.atRetirement.projectedFund)}</dd></div>
            <div><dt>{en ? "Required monthly contribution" : "Khoản góp cần mỗi tháng"}</dt><dd>{money(summary.requiredConstantMonthlyContribution)}</dd></div>
          </dl></> : <div className="guided-scenario-incomplete" role={sharedMessages.length ? undefined : "status"}>
            <span><Icon name="info" size="small" />{en ? "Not enough data to calculate." : "Chưa đủ dữ liệu để tính."}</span>
            {ownMessages.length > 0 && <ul>{ownMessages.map(message => <li key={message}>{message}</li>)}</ul>}
            {sharedMessages.length > 0 && <p>{en ? "See the items to complete above." : "Xem các mục cần hoàn tất ở trên."}</p>}
          </div>}
      </Card>;
    })}</div>
  </section>;
}
