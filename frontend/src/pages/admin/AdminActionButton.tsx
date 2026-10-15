import { Icon, type IconDefinition, type IconName } from "../../components/ui";
import "./admin-management.css";

export default function AdminActionButton({ icon, label, context, onClick, disabled, type = "button", emphasis = false }: {
  icon: IconName | IconDefinition;
  label: string;
  context?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  emphasis?: boolean;
}) {
  return (
    <button type={type} className={`admin-action-button${emphasis ? " is-primary" : ""}`}
      aria-label={context ? `${label}: ${context}` : label} title={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size="small" />
    </button>
  );
}
