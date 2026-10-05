import SupportApiPage from "../SupportPage";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { adminNavigation, settingsNavigation } from "../../routes";
import AppLoader from "../../components/AppLoader";
import PageTransition from "../../components/PageTransition";
import { routeIntent } from "../../services/routePreload";
import {
  Alert,
  Avatar,
  Badge,
  BrandLogo,
  Button,
  Card,
  Drawer,
  Icon,
  IconButton,
  Input,
  Modal,
  SearchField,
  Select,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  useNotification,
  type IconName,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";

const ADMIN_SETTINGS_KEY = "anhuu_demo_admin_settings";
const ADMIN_AUDIT_KEY = "anhuu_demo_admin_audit";
type AdminSettings = {
  systemName: string; language: string; timezone: string; supportEmail: string; maintenance: boolean;
  integrations: boolean[]; digest: string; notificationEmail: string; emailEnabled: boolean; inApp: boolean; critical: boolean;
  profileRetention: string; auditRetention: string; analytics: boolean; exportApproval: boolean;
};
const defaultAdminSettings: AdminSettings = {
  systemName: "An Hưu", language: "Tiếng Việt", timezone: "GMT+7 · Việt Nam", supportEmail: "hotro@anhuu.vn", maintenance: false,
  integrations: [false, false, false], digest: "Hàng ngày", notificationEmail: "operations@anhuu.vn", emailEnabled: false, inApp: true, critical: true,
  profileRetention: "5 năm", auditRetention: "3 năm", analytics: true, exportApproval: true,
};
type AuditEntry = { actor: string; action: string; target: string; time: string; result: string; category: string; before?: string; after?: string };

function loadAdminSettings(): AdminSettings {
  try { return { ...defaultAdminSettings, ...JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "{}") }; } catch { return defaultAdminSettings; }
}
function recordAudit(entry: Omit<AuditEntry, "time">) {
  try {
    const previous = JSON.parse(localStorage.getItem(ADMIN_AUDIT_KEY) || "[]") as AuditEntry[];
    localStorage.setItem(ADMIN_AUDIT_KEY, JSON.stringify([{ ...entry, time: new Date().toLocaleString("vi-VN") }, ...previous].slice(0, 100)));
  } catch {}
}
function persistAdminSettings(settings: AdminSettings, target: string) {
  const before = loadAdminSettings();
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
  recordAudit({ actor: "Lê Lan Anh", action: "Cập nhật cấu hình", target, result: "Thành công", category: "Cấu hình", before: JSON.stringify(before), after: JSON.stringify(settings) });
}
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`dashboard-brand ${compact ? "is-compact" : ""}`}>
      <BrandLogo compact={compact} inverted />
    </div>
  );
}

function AdminNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();

  const getNavLabel = (path: string, fallback: string) => {
    switch (path) {
      case "/admin/dashboard": return t("admin_nav.dashboard");
      case "/admin/users": return t("admin_nav.users");
      case "/admin/operations": return t("admin_nav.operations");
      case "/admin/support": return t("admin_nav.support");
      case "/admin/partners": return t("admin_nav.partners");
      case "/admin/financial-config": return t("admin_nav.financial_config");
      case "/admin/content": return t("admin_nav.content");
      case "/admin/ai": return t("admin_nav.ai");
      case "/admin/reports": return t("admin_nav.reports");
      case "/admin/settings": return t("admin_nav.settings");
      default: return fallback;
    }
  };

  return (
    <nav className="admin-nav" aria-label={t("admin_topbar.search_aria")}>
      {!collapsed && <div className="sidebar-label">{t("admin_nav.system_ops")}</div>}
      {adminNavigation.map((item) => {
        const label = getNavLabel(item.path, item.label);
        return (
          <NavLink
            className={({ isActive }) => isActive ? "is-active" : ""}
            key={item.path}
            to={item.path}
            {...routeIntent(item.path)}
            onClick={onNavigate}
            aria-label={label}
            title={label}
          >
            <Icon name={item.icon} />
            {!collapsed && <span>{label}</span>}
            {!collapsed && item.path === "/admin/support" && <small className="admin-nav-badge">3</small>}
          </NavLink>
        );
      })}
    </nav>
  );
}

function AdminSidebar({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: () => void }) {
  const { t } = useI18n();
  return (
    <aside className={`admin-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label={t("admin_nav.admin_console")}>
      <div className="admin-sidebar-brand">
        <Link
          to="/admin/dashboard"
          className={`dashboard-brand ${collapsed ? "is-compact" : ""}`}
          aria-label={t("admin_topbar.brand_aria")}
        >
          <Brand compact={collapsed} />
        </Link>
        <button
          type="button"
          className="icon-button admin-sidebar-toggle-btn"
          onClick={onCollapse}
          aria-label={collapsed ? t("admin_topbar.expand_menu") : t("admin_topbar.collapse_menu")}
          title={collapsed ? t("admin_topbar.expand_menu") : t("admin_topbar.collapse_menu")}
        >
          <Icon name={collapsed ? "panel-right" : "panel-left"} size="small" />
        </button>
      </div>
      <AdminNav collapsed={collapsed} />
    </aside>
  );
}

function AdminHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <header className="admin-page-header"><div><span>ADMIN AREA</span><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}

export { AdminReportsPage as ReportsPage } from "./AdminOverviewApi";
export function SupportPage() { return <SupportApiPage admin />; }

function SettingNav() {
  const { t } = useI18n();
  const getSettingLabel = (path: string, fallback: string) => {
    switch (path) {
      case "/admin/settings/general": return t("admin_nav.settings_general");
      case "/admin/settings/integrations": return t("admin_nav.settings_integrations");
      case "/admin/settings/notifications": return t("admin_nav.settings_notifications");
      case "/admin/settings/privacy": return t("admin_nav.settings_privacy");
      case "/admin/settings/audit-log": return t("admin_nav.settings_audit");
      default: return fallback;
    }
  };

  return (
    <nav className="settings-section-nav" aria-label={t("admin_nav.settings")}>
      {settingsNavigation.map(({ label: fallback, icon, path }) => {
        const label = getSettingLabel(path, fallback);
        return (
          <NavLink
            className={({ isActive }) => (isActive ? "is-active" : "")}
            key={path}
            to={path}
          >
            <span className="settings-nav-icon"><Icon name={icon} /></span>
            <span className="settings-nav-label">{label}</span>
            <Icon name="chevron-right" size="small" />
          </NavLink>
        );
      })}
    </nav>
  );
}

function SettingsCard({
  title,
  description,
  saved,
  onSave,
  children,
}: {
  title: string;
  description: string;
  saved: boolean | null;
  onSave: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const { notify } = useNotification();
  const handleSave = () => {
    onSave();
    notify.success(t("admin_topbar.settings_saved"), t("admin_topbar.settings_saved_desc", { title }));
  };
  return (
    <Card className="system-setting-card">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {saved === true && <Badge tone="success">{t("admin_topbar.saved_badge")}</Badge>}
        {saved === false && <Badge tone="warning">{t("admin_topbar.unsaved_badge")}</Badge>}
      </header>
      <div className="system-setting-body">{children}</div>
      <footer>
        <span>
          <Icon name="info" size="small" /> {t("admin_topbar.audit_note")}
        </span>
        <Button variant="primary" onClick={handleSave}>
          {t("admin_topbar.save_changes")}
        </Button>
      </footer>
    </Card>
  );
}

export function GeneralSettings() {
  const { language, setLanguage } = useI18n();
  const isEn = language === "en";
  const [saved, setSaved] = useState<boolean | null>(null);
  const [settings, setSettings] = useState(loadAdminSettings);
  const change = (updates: Partial<AdminSettings>) => {
    setSettings((value) => ({ ...value, ...updates }));
    setSaved(false);
  };
  return (
    <SettingsCard
      title={isEn ? "General Settings" : "Cài đặt chung"}
      description={
        isEn
          ? "Brand identity display information and general operational behavior of the system."
          : "Thông tin hiển thị nhận diện thương hiệu và hành vi vận hành chung của hệ thống."
      }
      saved={saved}
      onSave={() => {
        persistAdminSettings(settings, isEn ? "General Settings" : "Cài đặt chung");
        setSaved(true);
      }}
    >
      <div className="settings-form-grid">
        <Input
          label={isEn ? "System Name" : "Tên hệ thống"}
          value={settings.systemName}
          onChange={(value) => change({ systemName: value })}
        />
        <Select
          label={isEn ? "Default Language" : "Ngôn ngữ mặc định"}
          options={["Tiếng Việt", "English"]}
          value={language === "en" ? "English" : "Tiếng Việt"}
          onChange={(value) => {
            const nextLang = value === "English" ? "en" : "vi";
            setLanguage(nextLang);
            change({ language: value });
          }}
        />
        <Select
          label={isEn ? "Operating Timezone" : "Múi giờ vận hành"}
          options={isEn ? ["GMT+7 (Vietnam)", "GMT+8", "GMT+9"] : ["GMT+7 (Việt Nam)", "GMT+8", "GMT+9"]}
          value={settings.timezone}
          onChange={(value) => change({ timezone: value })}
        />
        <Input
          label={isEn ? "Member Support Email" : "Email hỗ trợ hội viên"}
          value={settings.supportEmail}
          onChange={(value) => change({ supportEmail: value })}
          type="email"
        />
      </div>

      <div className="setting-toggle-row">
        <div>
          <strong>{isEn ? "System Maintenance Mode" : "Chế độ bảo trì hệ thống"}</strong>
          <small>
            {isEn
              ? "Temporarily suspend new member sessions and display scheduled maintenance notice."
              : "Tạm dừng tiếp nhận phiên truy cập mới từ hội viên và hiển thị thông báo bảo trì theo lịch."}
          </small>
        </div>
        <Switch
          checked={settings.maintenance}
          label={settings.maintenance ? (isEn ? "Enabled" : "Đang bật") : (isEn ? "Disabled" : "Đang tắt")}
          onChange={(value) => change({ maintenance: value })}
        />
      </div>

      {settings.maintenance && (
        <Alert tone="warning" title={isEn ? "Maintenance Mode Active" : "Chế độ bảo trì đang kích hoạt"}>
          {isEn
            ? "The system is temporarily unavailable for regular members. Only administrators can perform actions."
            : "Hệ thống đang tạm ngưng truy cập của người dùng thông thường. Chỉ tài khoản Quản trị viên mới có thể thao tác."}
        </Alert>
      )}
    </SettingsCard>
  );
}

export function IntegrationSettings() {
  const { language } = useI18n();
  const isEn = language === "en";
  const [saved, setSaved] = useState<boolean | null>(null);
  const [settings, setSettings] = useState(loadAdminSettings);
  const items = isEn
    ? [
        ["Transactional Email Service (SMTP / Resend)", "Send verification emails, OTP, and periodic reports to members."],
        ["Secure Document Storage (S3 / Cloud Storage)", "Store exported report files and encrypted financial documents."],
        ["Financial Partners & Social Insurance Sync", "Update retirement product catalog data and fund interest rates."],
      ]
    : [
        ["Dịch vụ Email giao dịch (SMTP / Resend)", "Gửi email xác thực, OTP và báo cáo định kỳ cho hội viên."],
        ["Kho lưu trữ tài liệu bảo mật (S3 / Cloud Storage)", "Lưu trữ các tệp xuất báo cáo và chứng từ tài chính mã hóa."],
        ["Đồng bộ đối tác tài chính & BHXH", "Cập nhật dữ liệu danh mục sản phẩm hưu trí và lãi suất quỹ."],
      ];

  return (
    <SettingsCard
      title={isEn ? "Service Integrations" : "Tích hợp dịch vụ"}
      description={
        isEn
          ? "Manage external API connections, mail service, and data synchronization."
          : "Quản lý cổng kết nối API bên ngoài, dịch vụ gửi thư và đồng bộ dữ liệu."
      }
      saved={saved}
      onSave={() => {
        persistAdminSettings(settings, isEn ? "Integrations" : "Tích hợp");
        setSaved(true);
      }}
    >
      <div className="integration-list">
        {items.map(([name, detail], index) => {
          const isEnabled = settings.integrations[index];
          return (
            <div key={name}>
              <span className="integration-icon">
                <Icon name={index === 0 ? "message" : index === 1 ? "file-text" : "briefcase"} />
              </span>
              <div>
                <strong>{name}</strong>
                <small>{detail}</small>
              </div>
              <Badge tone={isEnabled ? "success" : "neutral"}>
                {isEnabled ? (isEn ? "Connected" : "Đang kết nối") : (isEn ? "Inactive" : "Chưa kích hoạt")}
              </Badge>
              <Switch
                checked={isEnabled}
                label={isEnabled ? (isEn ? "Enabled" : "Đang bật") : (isEn ? "Disabled" : "Đang tắt")}
                onChange={(value) => {
                  setSettings((current) => ({
                    ...current,
                    integrations: current.integrations.map((item, itemIndex) =>
                      itemIndex === index ? value : item
                    ),
                  }));
                  setSaved(false);
                }}
              />
            </div>
          );
        })}
      </div>
    </SettingsCard>
  );
}

export function NotificationSettings() {
  const { language } = useI18n();
  const isEn = language === "en";
  const [saved, setSaved] = useState<boolean | null>(null);
  const [settings, setSettings] = useState(loadAdminSettings);
  const change = (updates: Partial<AdminSettings>) => {
    setSettings((value) => ({ ...value, ...updates }));
    setSaved(false);
  };

  return (
    <SettingsCard
      title={isEn ? "System Notifications" : "Thông báo hệ thống"}
      description={
        isEn
          ? "Configure default communication channels, security alerts, and operational digests."
          : "Cấu hình kênh truyền thông mặc định, cảnh báo bảo mật và tổng hợp vận hành."
      }
      saved={saved}
      onSave={() => {
        persistAdminSettings(settings, isEn ? "Notifications" : "Thông báo");
        setSaved(true);
      }}
    >
      <div className="settings-form-grid">
        <Input
          label={isEn ? "Technical alert notification email" : "Email tiếp nhận cảnh báo kỹ thuật"}
          value={settings.notificationEmail}
          onChange={(value) => change({ notificationEmail: value })}
          type="email"
        />
        <Select
          label={isEn ? "Digest report frequency" : "Tần suất báo cáo tổng hợp"}
          options={
            isEn
              ? ["Daily (08:00 AM)", "Weekly (Monday)", "Do not send digest"]
              : ["Hàng ngày (08:00 AM)", "Hàng tuần (Thứ Hai)", "Không gửi tổng hợp"]
          }
          value={settings.digest}
          onChange={(value) => change({ digest: value })}
        />
      </div>

      <div className="setting-toggle-list">
        <div>
          <span>
            <strong>{isEn ? "Transactional Email & Account Verification" : "Email giao dịch & Xác thực tài khoản"}</strong>
            <small>
              {isEn
                ? "Send notifications when users register, recover password, or change email."
                : "Gửi thông báo khi người dùng đăng ký, khôi phục mật khẩu hoặc đổi email."}
            </small>
          </span>
          <Switch
            checked={settings.emailEnabled}
            label={settings.emailEnabled ? (isEn ? "Enabled" : "Đang bật") : (isEn ? "Disabled" : "Đang tắt")}
            onChange={(value) => change({ emailEnabled: value })}
          />
        </div>
        <div>
          <span>
            <strong>{isEn ? "In-app Push Notifications" : "Thông báo đẩy trong ứng dụng (In-app Push)"}</strong>
            <small>
              {isEn
                ? "Display notification bell directly in the An Huu user interface."
                : "Hiển thị chuông thông báo trực tiếp trên giao diện người dùng An Hưu."}
            </small>
          </span>
          <Switch
            checked={settings.inApp}
            label={settings.inApp ? (isEn ? "Enabled" : "Đang bật") : (isEn ? "Disabled" : "Đang tắt")}
            onChange={(value) => change({ inApp: value })}
          />
        </div>
        <div>
          <span>
            <strong>{isEn ? "Operational Alerts & Critical Security" : "Cảnh báo vận hành & Bảo mật khẩn cấp"}</strong>
            <small>
              {isEn
                ? "Trigger immediate alerts upon unusual login detection or system errors."
                : "Kích hoạt thông báo tức thời khi phát hiện đăng nhập bất thường hoặc lỗi hệ thống."}
            </small>
          </span>
          <Switch
            checked={settings.critical}
            label={settings.critical ? (isEn ? "Enabled" : "Đang bật") : (isEn ? "Disabled" : "Đang tắt")}
            onChange={(value) => change({ critical: value })}
          />
        </div>
      </div>
    </SettingsCard>
  );
}

export function PrivacySettings() {
  const { language } = useI18n();
  const isEn = language === "en";
  const [saved, setSaved] = useState<boolean | null>(null);
  const [settings, setSettings] = useState(loadAdminSettings);
  const change = (updates: Partial<AdminSettings>) => {
    setSettings((value) => ({ ...value, ...updates }));
    setSaved(false);
  };

  return (
    <SettingsCard
      title={isEn ? "Privacy & Data Security" : "Quyền riêng tư & Bảo mật dữ liệu"}
      description={
        isEn
          ? "Manage retention policy for member records and control data exports."
          : "Quản lý chính sách thời gian lưu trữ dữ liệu hội viên và kiểm soát xuất dữ liệu."
      }
      saved={saved}
      onSave={() => {
        persistAdminSettings(settings, isEn ? "Privacy" : "Quyền riêng tư");
        setSaved(true);
      }}
    >
      <div className="settings-form-grid">
        <Select
          label={isEn ? "Closed record retention duration" : "Thời gian lưu trữ hồ sơ đã đóng"}
          options={isEn ? ["3 years", "5 years", "7 years", "10 years"] : ["3 năm", "5 năm", "7 năm", "10 năm"]}
          value={settings.profileRetention}
          onChange={(value) => change({ profileRetention: value })}
        />
        <Select
          label={isEn ? "Audit log retention duration" : "Thời gian lưu trữ nhật ký kiểm toán"}
          options={isEn ? ["1 year", "3 years", "5 years", "Permanent"] : ["1 năm", "3 năm", "5 năm", "Vĩnh viễn"]}
          value={settings.auditRetention}
          onChange={(value) => change({ auditRetention: value })}
        />
      </div>

      <div className="setting-toggle-list">
        <div>
          <span>
            <strong>{isEn ? "Anonymous Data Analytics (Telemetry)" : "Phân tích dữ liệu ẩn danh (Telemetry)"}</strong>
            <small>
              {isEn
                ? "Use de-identified behavioral telemetry to optimize retirement calculation algorithms."
                : "Sử dụng dữ liệu hành vi đã khử định danh để tối ưu thuật toán tính toán hưu trí."}
            </small>
          </span>
          <Switch
            checked={settings.analytics}
            label={settings.analytics ? (isEn ? "Enabled" : "Đang bật") : (isEn ? "Disabled" : "Đang tắt")}
            onChange={(value) => change({ analytics: value })}
          />
        </div>
        <div>
          <span>
            <strong>{isEn ? "Two-Factor Approval for User Data Export" : "Xác thực hai lớp khi xuất dữ liệu người dùng"}</strong>
            <small>
              {isEn
                ? "Require a second administrator approval or OTP before downloading records."
                : "Yêu cầu quản trị viên thứ hai ký duyệt hoặc mã OTP trước khi tải xuống danh sách."}
            </small>
          </span>
          <Switch
            checked={settings.exportApproval}
            label={settings.exportApproval ? (isEn ? "Mandatory" : "Bắt buộc") : (isEn ? "Optional" : "Không bắt buộc")}
            onChange={(value) => change({ exportApproval: value })}
          />
        </div>
      </div>
    </SettingsCard>
  );
}

export { AdminAuditPage as AuditLog } from "./AdminOperationsPage";

export function SettingsPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  return (
    <div className="admin-page settings-page">
      <AdminHeader
        title={isEn ? "System Settings" : "Cấu hình hệ thống"}
        description={
          isEn
            ? "Manage operation settings, service integration, and data privacy."
            : "Quản lý từng nhóm thiết lập vận hành, tích hợp cổng dịch vụ và quyền riêng tư dữ liệu."
        }
      />
      <div className="settings-layout">
        <SettingNav />
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function AdminTopbar({ onMenu }: { onMenu: () => void }) {
  const { t, language } = useI18n();
  const { notify } = useNotification();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFeedback, setSearchFeedback] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global shortcut: Ctrl+K or Cmd+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    try { await logout(); navigate("/login"); }
    catch {
      notify.error(
        language === "en" ? "Cannot Log Out" : "Chưa thể đăng xuất",
        language === "en" ? "Cannot connect to server. Please try again." : "Không thể kết nối máy chủ. Vui lòng thử lại."
      );
    }
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim().toLocaleLowerCase();
    const match = [...adminNavigation, ...settingsNavigation].find((item) =>
      item.label.toLocaleLowerCase().includes(query)
    );
    if (!query || !match) {
      setSearchFeedback(query ? t("admin_topbar.search_not_found") : t("admin_topbar.search_empty"));
      return;
    }
    setSearchFeedback("");
    navigate(match.path);
  };

  return (
    <header className="admin-topbar">
      <div className="admin-mobile-brand">
        <IconButton icon="grid" label={t("admin_topbar.open_menu")} onClick={onMenu} />
        <Brand compact />
      </div>

      <form className="topbar-search-form" role="search" onSubmit={submitSearch}>
        <div className="topbar-search-box">
          <Icon name="search" size="small" className="topbar-search-icon" />
          <input
            ref={searchInputRef}
            type="search"
            className="topbar-search-input"
            placeholder={t("admin_topbar.search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t("admin_topbar.search_aria")}
          />
          <span className="topbar-search-shortcut">
            <kbd>Ctrl</kbd>
            <kbd>K</kbd>
          </span>
        </div>
        <button className="sr-only" type="submit">{t("common.search")}</button>
        {searchFeedback && <span className="topbar-search-feedback" role="status">{searchFeedback}</span>}
      </form>

      <div className="admin-topbar-actions">
        <LanguageSwitcher variant="topbar" />

        <Tooltip content={t("admin_topbar.urgent_tickets")}>
          <Link to="/admin/support" className="topbar-action-btn" aria-label={t("admin_topbar.urgent_tickets")}>
            <Icon name="alert" />
            <span className="topbar-badge-dot" />
          </Link>
        </Tooltip>

        <Tooltip content={t("admin_topbar.templates")}>
          <Link to="/admin/support?tab=templates" className="topbar-action-btn" aria-label={t("admin_topbar.templates")}>
            <Icon name="bell" />
          </Link>
        </Tooltip>

        <div className="topbar-divider-line" />

        <Avatar
          initials={user?.initials || "LA"}
          name={user?.name || "Lê Lan Anh"}
          detail={user?.detail || (language === "en" ? "Administrator" : "Quản trị viên")}
          avatarUrl={user?.avatarUrl}
          onLogout={handleLogout}
          menuItems={[
            { label: t("admin_nav.settings"), icon: "settings", onClick: () => navigate("/admin/settings") },
            { label: t("admin_nav.settings_audit"), icon: "file-text", onClick: () => navigate("/admin/settings/audit-log") },
            { label: t("admin_nav.settings_privacy"), icon: "info", onClick: () => navigate("/admin/settings/privacy") },
          ]}
        />
      </div>
    </header>
  );
}

export default function AdminLayout() {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMobileMenu(false), [pathname]);
  return (
    <div className={`admin-app-shell ${collapsed ? "admin-is-collapsed" : ""}`}>
      <AdminSidebar collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} />
      <div className="admin-workspace">
        <AdminTopbar onMenu={() => setMobileMenu(true)} />
        <main className="admin-main" id="main-content">
          <Suspense fallback={<AppLoader variant="inline" label={t("admin_topbar.loading_content")} />}>
            <PageTransition key={pathname}>
              <Outlet />
            </PageTransition>
          </Suspense>
        </main>
      </div>
      <Drawer open={mobileMenu} title={t("admin_nav.admin_console")} onClose={() => setMobileMenu(false)}>
        <AdminNav onNavigate={() => setMobileMenu(false)} />
      </Drawer>
    </div>
  );
}
