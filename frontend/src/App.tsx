import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
const AdminLayout = lazy(() => import("./AdminApp"));
const AuditLog = lazy(() => import("./AdminApp").then(module => ({ default: module.AuditLog })));
const GeneralSettings = lazy(() => import("./AdminApp").then(module => ({ default: module.GeneralSettings })));
const IntegrationSettings = lazy(() => import("./AdminApp").then(module => ({ default: module.IntegrationSettings })));
const NotificationSettings = lazy(() => import("./AdminApp").then(module => ({ default: module.NotificationSettings })));
const PrivacySettings = lazy(() => import("./AdminApp").then(module => ({ default: module.PrivacySettings })));
const ReportsPage = lazy(() => import("./AdminApp").then(module => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import("./AdminApp").then(module => ({ default: module.SettingsPage })));
const SupportPage = lazy(() => import("./AdminApp").then(module => ({ default: module.SupportPage })));
import { Badge, Card, Icon } from "./components/ui";
import LandingPage from "./pages/LandingPage";
import { ArticlePage, AssistantPage, HowItWorksPage, KnowledgePage, SimulationPage } from './marketing/MarketingPages';
import { applyPageSeo } from './marketing/seo';
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
const ExplorePage = lazy(() => import("./pages/ExplorePage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminCorePages").then(module => ({ default: module.AdminDashboardPage })));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminCorePages").then(module => ({ default: module.AdminUsersPage })));
const AdminUserDetailPage = lazy(() => import("./pages/admin/AdminCorePages").then(module => ({ default: module.AdminUserDetailPage })));
const AdminConsultationsPage = lazy(() => import("./pages/admin/AdminBusinessPages").then(module => ({ default: module.AdminConsultationsPage })));
const AdminContentPage = lazy(() => import("./pages/admin/AdminBusinessPages").then(module => ({ default: module.AdminContentPage })));
const AdminPartnersPage = lazy(() => import("./pages/admin/AdminBusinessPages").then(module => ({ default: module.AdminPartnersPage })));
const AdminAIManagementPage = lazy(() => import("./pages/admin/AdminAIConfigPages").then(module => ({ default: module.AdminAIManagementPage })));
const AdminFinancialConfigPage = lazy(() => import("./pages/admin/AdminAIConfigPages").then(module => ({ default: module.AdminFinancialConfigPage })));
import { useAuth, type UserRole } from "./context/AuthContext";

function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/user/dashboard"} replace />;
  return children;
}

function RouteEffects() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const legacy: Record<string, string> = { '#quy-trinh': '/cach-hoat-dong', '#mo-phong': '/mo-phong', '#tro-ly-ai': '/tro-ly-ai', '#kien-thuc': '/kien-thuc' };
    if (pathname === '/' && legacy[hash]) navigate(legacy[hash], { replace: true });
  }, [pathname, hash, navigate]);
  useEffect(() => {
    applyPageSeo(pathname);
  }, [pathname, search]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const heading = document.querySelector<HTMLElement>("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function NotFound({ admin = false }: { admin?: boolean }) {
  const content = (
    <Card className="demo-area-card">
      <Badge tone="neutral">404</Badge>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại trên hệ thống.</p>
      <Link className="button button-primary button-medium" to={admin ? "/admin" : "/"}>
        {admin ? "Về khu vực Admin" : "Quay lại trang chủ"}
      </Link>
    </Card>
  );
  return admin ? content : <main className="demo-page" id="main-content">{content}</main>;
}

export default function App() {
  return <>
    <a className="skip-link" href="#main-content">Đến nội dung chính</a>
    <Suspense fallback={<main id="main-content" className="demo-page" aria-busy="true"><p role="status">Đang tải trang…</p></main>}>
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
      <Route path="/onboarding" element={<RequireRole role="user"><OnboardingPage /></RequireRole>} />
      
      {/* User Area Routes */}
      <Route path="/user" element={<RequireRole role="user"><UserLayout /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<UserDashboard />} />
        <Route path="goal" element={<RetirementGoalPage />} />
        <Route path="plan" element={<RetirementPlanPage />} />
        <Route path="simulation" element={<SimulationTrackingPage />} />
        <Route path="assistant" element={<AIAssistantPage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="users/:userId" element={<AdminUserDetailPage />} />
        <Route path="consultations" element={<AdminConsultationsPage />} />
        <Route path="content" element={<AdminContentPage />} />
        <Route path="partners" element={<AdminPartnersPage />} />
        <Route path="ai" element={<AdminAIManagementPage />} />
        <Route path="financial-config" element={<AdminFinancialConfigPage />} />
        <Route path="support" element={<SupportPage />} />
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
  </>;
}
