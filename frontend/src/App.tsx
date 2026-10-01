import { useEffect, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import AdminLayout, {
  AuditLog, GeneralSettings, IntegrationSettings, NotificationSettings,
  PrivacySettings, ReportsPage, SettingsPage, SupportPage,
} from "./AdminApp";
import { Badge, Card, Icon } from "./components/ui";
import LandingPage from "./pages/LandingPage";
import { ForgotPage, LoginPage, RegisterPage, ResetPage, VerifyPage } from "./pages/AuthPages";
import OnboardingPage from "./pages/OnboardingPage";
import UserLayout from "./pages/UserLayout";
import UserDashboard from "./pages/UserDashboard";
import RetirementGoalPage from "./pages/RetirementGoalPage";
import RetirementPlanPage from "./pages/RetirementPlanPage";
import SimulationTrackingPage from "./pages/SimulationTrackingPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import ExplorePage from "./pages/ExplorePage";
import AccountPage from "./pages/AccountPage";
import { AdminDashboardPage, AdminUsersPage, AdminUserDetailPage } from "./pages/admin/AdminCorePages";
import { AdminConsultationsPage, AdminContentPage, AdminPartnersPage } from "./pages/admin/AdminBusinessPages";
import { AdminAIManagementPage, AdminFinancialConfigPage } from "./pages/admin/AdminAIConfigPages";
import { useAuth, type UserRole } from "./context/AuthContext";

function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/user/dashboard"} replace />;
  return children;
}

function RouteEffects() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const heading = document.querySelector("h1");
    const section = document.querySelector(".settings-content h2");
    document.title = `${section?.textContent ?? heading?.textContent ?? "Demo"} | An Hưu`;
  }, [pathname, search]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const heading = document.querySelector<HTMLElement>("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function DemoHome() {
  return (
    <main className="demo-page" id="main-content">
      <header className="demo-heading">
        <Badge tone="soft">AN HƯU · DEMO</Badge>
        <h1>An tâm chuẩn bị cho tương lai</h1>
        <p>Chọn khu vực để khám phá nền tảng lập kế hoạch nghỉ hưu.</p>
      </header>
      <div className="demo-area-grid">
        <Card className="demo-area-card">
          <Icon name="settings" size="large" />
          <h2>Quản trị viên (Admin)</h2>
          <p>Bảng điều khiển vận hành, quản lý người dùng, tư vấn, nội dung, đối tác, AI & cấu hình tài chính.</p>
          <Badge tone="success">10 màn hình hoàn thiện</Badge>
          <Link className="button button-primary button-medium" to="/admin/dashboard">Mở bảng điều khiển Admin <Icon name="arrow-right" /></Link>
        </Card>
        <Card className="demo-area-card">
          <Icon name="users" size="large" />
          <h2>Khách hàng (User)</h2>
          <p>Hồ sơ tài chính, mục tiêu, kế hoạch chi tiết, mô phỏng và trợ lý AI.</p>
          <Badge tone="success">10 màn hình hoàn thiện</Badge>
          <Link className="button button-primary button-medium" to="/user/dashboard">Mở ứng dụng User <Icon name="arrow-right" /></Link>
        </Card>
      </div>
      <p className="demo-note">Bản trình diễn sử dụng dữ liệu minh họa. Các thao tác chưa kết nối dịch vụ thực tế.</p>
    </main>
  );
}

function UserUnavailable() {
  return (
    <main className="demo-page" id="main-content">
      <Card className="demo-area-card">
        <Badge tone="success">Khu vực khách hàng</Badge>
        <h1>Giao diện User đã sẵn sàng</h1>
        <p>Toàn bộ 10 màn hình khu vực khách hàng đã được hoàn thiện và tích hợp đầy đủ.</p>
        <Link className="button button-primary button-medium" to="/user/dashboard">Mở Dashboard User</Link>
        <Link className="demo-home-link" to="/">Quay lại trang chủ</Link>
      </Card>
    </main>
  );
}

function NotFound({ admin = false }: { admin?: boolean }) {
  const content = <Card className="demo-area-card">
    <Badge tone="neutral">404</Badge>
    <h1>Không tìm thấy trang</h1>
    <p>Đường dẫn này không có trong bản demo hiện tại.</p>
    <Link className="button button-primary button-medium" to={admin ? "/admin" : "/"}>{admin ? "Về khu vực Admin" : "Chọn khu vực demo"}</Link>
  </Card>;
  return admin ? content : <main className="demo-page" id="main-content">{content}</main>;
}

export default function App() {
  return <>
    <a className="skip-link" href="#main-content">Đến nội dung chính</a>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo" element={<DemoHome />} />
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
  </>;
}
