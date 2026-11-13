import type { ReactNode } from "react";
import ResponsiveDialog from "./ResponsiveDialog";
import { useI18n } from "../i18n";
import "./user-workspace-dialogs.css";
import "./money-explanation-dialog.css";

export type MoneyExplanation = {
  title: string;
  label: string;
  value: string;
  compactValue?: string;
  subtitle: string;
  description: string;
  parameters?: string[];
  steps: Array<{ label: string; description?: string; value: string }>;
  result: string;
  note?: string;
  formula?: { expression: string; description: string };
  warning?: boolean;
};

export default function MoneyExplanationDialog({ data, onClose, action }: {
  data: MoneyExplanation; onClose: () => void; action?: ReactNode;
}) {
  const en = useI18n().language === "en";
  return <ResponsiveDialog open title={data.title} onClose={onClose} className="user-workspace-dialog money-explanation-dialog">
    <div className="money-explanation-layout">
      <div className="money-explanation-summary">
        <div className={`money-explanation-kpi${data.warning ? " is-short" : ""}`}>
          <span>{data.label}</span><strong>{data.compactValue ?? data.value}</strong><small>{data.compactValue ? `= ${data.value} · ` : ""}{data.subtitle}</small>
        </div>
        <section className="money-explanation-meaning">
          <h3>{en ? "What does this amount mean?" : "Con số này là gì?"}</h3>
          <p>{data.description}</p>
          {data.parameters?.length ? <ul>{data.parameters.map(item => <li key={item}>{item}</li>)}</ul> : null}
        </section>
      </div>
      <section className="money-explanation-calculation">
        <h3>{en ? "Your numbers in the calculation" : "Lắp số của bạn vào phép tính"}</h3>
        <ol>{data.steps.map((step, index) => <li key={`${index}-${step.label}`}>
          <div><strong>{index + 1}. {step.label}</strong>{step.description && <span>{step.description}</span>}</div>
          <strong className="money-explanation-amount">{step.value}</strong>
        </li>)}</ol>
        <div className="money-explanation-result"><span>{en ? "Displayed result:" : "Kết quả hiển thị:"}</span><strong>{data.result}</strong></div>
        {data.formula && <section className="money-explanation-formula"><h3>{en ? "Calculation method" : "Cách tính"}</h3><strong>{data.formula.expression}</strong><p>{data.formula.description}</p></section>}
        {data.note && <p className="money-explanation-note">{data.note}</p>}
      </section>
    </div>
    <footer className="money-explanation-actions"><button type="button" className="overview-button secondary" onClick={onClose}>{en ? "Got it" : "Đã hiểu"}</button>{action}</footer>
  </ResponsiveDialog>;
}
