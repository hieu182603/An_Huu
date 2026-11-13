import { Outlet } from "react-router";
import { FinancialProfileProvider } from "./FinancialProfileContext";
import { RetirementPlanProvider } from "./RetirementPlanContext";

// Account state for the signed-in user area (/onboarding and /user/*). Loaded
// as its own chunk so public and admin pages do not download the profile and
// plan code.
export default function AccountProviders() {
  return (
    <FinancialProfileProvider>
      <RetirementPlanProvider>
        <Outlet />
      </RetirementPlanProvider>
    </FinancialProfileProvider>
  );
}
