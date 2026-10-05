import type { ReactNode } from "react";
import { Link } from "react-router";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { Alert, Button, Card } from "./ui";
import { useI18n } from "../i18n";

export default function FinancialProfileGate({ children, onboarding = false }: { children: ReactNode; onboarding?: boolean }) {
  const { loading, loadError, hasProfile, reloadProfile } = useFinancialProfile();
  const { language } = useI18n();
  const isEn = language === "en";

  if (loading) {
    return (
      <Card>
        <p role="status">{isEn ? "Loading your financial profile..." : "Đang tải hồ sơ của bạn..."}</p>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Alert
        tone="danger"
        title={isEn ? "Failed to load financial profile" : "Chưa tải được hồ sơ"}
        action={<Button onClick={reloadProfile}>{isEn ? "Retry" : "Thử lại"}</Button>}
      >
        {loadError}
      </Alert>
    );
  }

  if (!hasProfile && !onboarding) {
    return (
      <Card className="empty-state">
        <h1>{isEn ? "Start Your Financial Profile" : "Bắt đầu hồ sơ tài chính của bạn"}</h1>
        <p>
          {isEn
            ? "You do not have a profile yet. Provide your financial baseline to view your net worth, income, and expense breakdown."
            : "Bạn chưa có hồ sơ. Hãy khai báo thông tin để xem tổng quan thu nhập, chi tiêu và tài sản."}
        </p>
        <Link className="button button-primary" to="/onboarding">
          {isEn ? "Complete Profile" : "Khai báo hồ sơ"}
        </Link>
      </Card>
    );
  }

  return <>{children}</>;
}
