import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
const AdminLayout = lazy(() => import("./AdminApp"));
const AuditLog = lazy(() => import("./pages/admin/AdminOperationsPage").then(module => ({ default: module.AdminAuditPage })));
const AdminOperationsPage = lazy(() => import("./pages/admin/AdminOperationsPage"));
const GeneralSettings = lazy(() => import("./AdminApp").then(module => ({ default: module.GeneralSettings })));
const IntegrationSettings = lazy(() => import("./AdminApp").then(module => ({ default: module.IntegrationSettings })));
const NotificationSettings = lazy(() => import("./AdminApp").then(module => ({ default: module.NotificationSettings })));
const PrivacySettings = lazy(() => import("./AdminApp").then(module => ({ default: module.PrivacySettings })));
const ReportsPage = lazy(() => import("./pages/admin/AdminOverviewApi").then(module => ({ default: module.AdminReportsPage })));
const SettingsPage = lazy(() => import("./AdminApp").then(module => ({ default: module.SettingsPage })));
const SupportPage = lazy(() => import("./pages/SupportPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
import AppLoader from "./components/AppLoader";
import FinancialProfileGate from "./components/FinancialProfileGate";
import NotFoundView from "./components/NotFoundView";
import { I18nProvider } from "./i18n";
import LandingPage from "./pages/LandingPage";
import { ArticlePage, AssistantPage, HowItWorksPage, KnowledgePage, SimulationPage } from './marketing/MarketingPages';
import { applyPageSeo } from './marketing/seo';
import { initGoogleAnalytics, trackPageView } from "./services/googleAnalytics";
const ForgotPage = lazy(() => import("./pages/AuthPages").then(module => ({ default: module.ForgotPage })));
const LoginPage = lazy(() => import("./pages/AuthPages").then(module => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import("./pages/AuthPages").then(module => ({ default: module.RegisterPage })));
const ResetPage = lazy(() => import("./pages/AuthPages").then(module => ({ default: module.ResetPage })));
const VerifyPage = lazy(() => import("./pages/AuthPages").then(module => ({ default: module.VerifyPage })));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const UserLayout = lazy(() => import("./pages/UserLayout"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const RetirementGoalPage = lazy(() => import("./pages/RetirementGoalPage"));
const RetirementPlanPage = lazy(() => import("./pages/RetirementPlanPage"));
const SimulationTrackingPage = lazy(() => import("./pages/SimulationTrackingPage"));
const AIAssistantPage = lazy(() => import("./pages/AIAssistantPage"));
const DebtAnalysisPage = lazy(() => import("./pages/DebtAnalysisPage"));
const RiskPortfolioPage = lazy(() => import("./pages/RiskPortfolioPage"));
const ExplorePage = lazy(() => import("./pages/ExplorePage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminOverviewApi").then(module => ({ default: module.AdminDashboardPage })));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersApi").then(module => ({ default: module.AdminUsersPage })));
const AdminUserDetailPage = lazy(() => import("./pages/admin/AdminUsersApi").then(module => ({ default: module.AdminUserDetailPage })));
const AdminContentPage = lazy(() => import("./pages/admin/AdminContentApi"));
const AdminPartnersPage = lazy(() => import("./pages/admin/AdminBusinessPages").then(module => ({ default: module.AdminPartnersPage })));
const AdminAIManagementPage = lazy(() => import("./pages/admin/AdminAIConfigPages").then(module => ({ default: module.AdminAIManagementPage })));
const AdminFinancialConfigPage = lazy(() => import("./pages/admin/AdminFinancialConfigPage"));
import { useAuth, type UserRole } from "./context/AuthContext";

function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, initializing, restoreError, retrySession } = useAuth();
  const location = useLocation();
  if (initializing) return <AppLoader label="Đang khôi phục phiên đăng nhập…" />;
  if (restoreError && !user) return <AppLoader error={restoreError} onRetry={retrySession} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  if (user.role !== role) return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/user/dashboard"} replace />;
  return children;
}

function RouteEffects() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    initGoogleAnalytics();
  }, []);

  useEffect(() => {
    const legacy: Record<string, string> = { '#quy-trinh': '/cach-hoat-dong', '#mo-phong': '/mo-phong', '#tro-ly-ai': '/tro-ly-ai', '#kien-thuc': '/kien-thuc' };
    if (pathname === '/' && legacy[hash]) navigate(legacy[hash], { replace: true });
  }, [pathname, hash, navigate]);

  useEffect(() => {
    applyPageSeo(pathname);
    // Never put password-reset tokens from URL fragments into analytics.
    trackPageView(pathname + search);
  }, [pathname, search]);
  useEffect(() => {
    // Private layouts focus/scroll only once the new route has finished loading.
    if (pathname.startsWith("/user/") || pathname.startsWith("/admin/")) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    const heading = document.querySelector<HTMLElement>("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function NotFound({ admin = false }: { admin?: boolean }) {
  return admin ? <NotFoundView admin /> : <main id="main-content" className="ah-404-page"><NotFoundView /></main>;
}

export default function App() {
  return (
    <I18nProvider>
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <Suspense fallback={<AppLoader label="Đang tải trang…" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/cach-hoat-dong" element={<HowItWorksPage />} />
        <Route path="/mo-phong" element={<SimulationPage />} />
        <Route path="/tro-ly-ai" element={<AssistantPage />} />
        <Route path="/kien-thuc" element={<KnowledgePage />} />
        <Route path="/kien-thuc/:slug" element={<ArticlePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPage />} />
        <Route path="/reset-password" element={<ResetPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/onboarding" element={<RequireRole role="user"><FinancialProfileGate onboarding><OnboardingPage /></FinancialProfileGate></RequireRole>} />
        
        {/* User Area Routes */}
        <Route path="/user" element={<RequireRole role="user"><UserLayout /></RequireRole>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<FinancialProfileGate><UserDashboard /></FinancialProfileGate>} />
          <Route path="goal" element={<FinancialProfileGate><RetirementGoalPage /></FinancialProfileGate>} />
          <Route path="plan" element={<FinancialProfileGate><RetirementPlanPage /></FinancialProfileGate>} />
          <Route path="simulation" element={<FinancialProfileGate><SimulationTrackingPage /></FinancialProfileGate>} />
          <Route path="debts" element={<FinancialProfileGate><DebtAnalysisPage /></FinancialProfileGate>} />
          <Route path="risk-portfolio" element={<FinancialProfileGate><RiskPortfolioPage /></FinancialProfileGate>} />
          <Route path="assistant" element={<FinancialProfileGate><AIAssistantPage /></FinancialProfileGate>} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="*" element={<NotFoundView />} />
        </Route>
        <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:userId" element={<AdminUserDetailPage />} />
          <Route path="content" element={<AdminContentPage />} />
          <Route path="partners" element={<AdminPartnersPage />} />
          <Route path="ai" element={<AdminAIManagementPage />} />
          <Route path="financial-config" element={<AdminFinancialConfigPage />} />
          <Route path="support" element={<SupportPage admin />} />
          <Route path="operations" element={<AdminOperationsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />}>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<GeneralSettings />} />
            <Route path="integrations" element={<IntegrationSettings />} />
            <Route path="notifications" element={<NotificationSettings />} />
            <Route path="privacy" element={<PrivacySettings />} />
            <Route path="audit-log" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<NotFound admin />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <RouteEffects />
      </Suspense>
    </I18nProvider>
  );
}
