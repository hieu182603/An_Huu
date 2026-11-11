import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router";
import FinancialProfileHub from "./FinancialProfileHub";
import FinancialCashflowPage from "./FinancialCashflowPage";
import FinancialAssetsPage from "./FinancialAssetsPage";
import FinancialInsurancePage from "./FinancialInsurancePage";
import FinancialFamilyPage from "./FinancialFamilyPage";
import FinancialConstraintsPage from "./FinancialConstraintsPage";
import "./financial-profile.css";

export default function FinancialProfilePage() {
  const [searchParams] = useSearchParams(), section = searchParams.get("section");
  useEffect(() => {
    if (section === "debts") return;
    window.scrollTo({ top: 0, behavior: "instant" });
    const heading = document.querySelector<HTMLElement>("#main-content h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [section]);
  switch (section) {
    case "debts": return <Navigate to="/user/debts" replace />;
    case "cashflow": return <FinancialCashflowPage />;
    case "assets": return <FinancialAssetsPage />;
    case "insurance": return <FinancialInsurancePage />;
    case "family": return <FinancialFamilyPage />;
    case "constraints": return <FinancialConstraintsPage />;
    default: return <FinancialProfileHub />;
  }
}
