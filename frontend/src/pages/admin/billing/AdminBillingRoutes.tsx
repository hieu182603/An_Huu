import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import AppLoader from "../../../components/AppLoader";
import { useBillingAvailability } from "../../../services/adminBilling";
import { BillingDisabledState, ErrorAlert } from "./billingShared";

const Overview = lazy(() => import("./AdminBillingOverviewPage"));
const Statements = lazy(() => import("./AdminBillingStatementsPage"));
const Transactions = lazy(() => import("./AdminBillingTransactionsPage"));
const Alerts = lazy(() => import("./AdminBillingAlertsPage"));
const Schedules = lazy(() => import("./AdminBillingSchedulesPage"));
const Overrides = lazy(() => import("./AdminBillingOverridesPage"));

/** Mounted at /admin/billing/* — loads the admin's billing grants once, then renders the sub pages. */
export default function AdminBillingRoutes() {
  const { availability, reload } = useBillingAvailability();
  if (availability.status === "loading") return <AppLoader variant="inline" label="Đang tải quyền thanh toán…" />;
  if (availability.status === "disabled") return <BillingDisabledState />;
  if (availability.status === "error") {
    return <div className="admin-page ab-page"><ErrorAlert message={availability.message} onRetry={reload} /></div>;
  }
  return (
    <Suspense fallback={<AppLoader variant="inline" label="Đang tải trang thanh toán…" />}>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="statements" element={<Statements />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="fee-schedules" element={<Schedules />} />
        <Route path="overrides" element={<Overrides />} />
        <Route path="*" element={<Navigate to="/admin/billing" replace />} />
      </Routes>
    </Suspense>
  );
}
