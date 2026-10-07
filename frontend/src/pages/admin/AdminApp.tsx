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
import { NotificationDropdown } from "../../components/NotificationDropdown";
import { authenticatedRequest } from "../../services/api";
import { useRealtimeNotifications } from "../../services/socket";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`dashboard-brand ${compact ? "is-compact" : ""}`}>
      <BrandLogo compact={compact} inverted />
    </div>
  );
}

function AdminNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});

  const getNavLabel = (path: string, fallback: string) => {
    switch (path) {
      case "/admin/dashboard": return t("admin_nav.dashboard");
      case "/admin/users": return t("admin_nav.users");
      case "/admin/support": return t("admin_nav.support");
      case "/admin/partners": return t("admin_nav.partners");
      case "/admin/financial-config": return t("admin_nav.financial_config");
      case "/admin/legal-rules": return t("admin_nav.legal_rules");
      case "/admin/content": return t("admin_nav.content");
      case "/admin/ai": return t("admin_nav.ai");
      case "/admin/reports": return t("admin_nav.reports");
      case "/admin/settings": return t("admin_nav.settings");
      case "/admin/settings/general": return t("admin_nav.settings_general");
      case "/admin/settings/security": return t("admin_nav.settings_security");
      case "/admin/settings/notifications": return t("admin_nav.settings_notifications");
      case "/admin/settings/logs": return t("admin_nav.settings_logs");
      default: return fallback;
    }
  };

  return (
    <nav className="admin-nav" aria-label={t("admin_topbar.search_aria")}>
      {!collapsed && <div className="sidebar-label">{t("admin_nav.system_ops")}</div>}
      {adminNavigation.map((item) => {
        const label = getNavLabel(item.path, item.label);
        const hasChildren = Boolean(item.children && item.children.length > 0);
        const isParentActive = hasChildren
          ? pathname.startsWith(item.path)
          : pathname === item.path;

        if (hasChildren && item.children) {
          const isExpanded = manualExpanded[item.path] ?? isParentActive;

          return (
            <div className="admin-nav-group" key={item.path}>
              <NavLink
                to={item.children[0]?.path || item.path}
                className={() =>
                  `admin-nav-parent-btn ${isParentActive ? "is-parent-active" : ""}`
                }
                onClick={(e) => {
                  if (collapsed) {
                    onNavigate?.();
                    return;
                  }
                  if (isParentActive) {
                    e.preventDefault();
                    setManualExpanded((prev) => ({ ...prev, [item.path]: !isExpanded }));
                  } else {
                    setManualExpanded((prev) => ({ ...prev, [item.path]: true }));
                    onNavigate?.();
                  }
                }}
                aria-expanded={isExpanded}
                aria-label={label}
                title={label}
              >
                <Icon name={item.icon} />
                {!collapsed && <span>{label}</span>}
                {!collapsed && (
                  <span
                    className={`admin-nav-chevron ${isExpanded ? "is-expanded" : ""}`}
                    aria-hidden="true"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setManualExpanded((prev) => ({ ...prev, [item.path]: !isExpanded }));
                    }}
                  >
                    <Icon name="chevron-down" size="small" />
                  </span>
                )}
              </NavLink>

              {!collapsed && (
                <div
                  className={`admin-nav-submenu ${isExpanded ? "is-open" : "is-closed"}`}
                  role="group"
                  aria-label={label}
                >
                  {item.children.map((child) => {
                    const childLabel = getNavLabel(child.path, child.label);
                    return (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={({ isActive }) =>
                          `admin-nav-subitem ${isActive ? "is-active" : ""}`
                        }
                        onClick={onNavigate}
                        aria-label={childLabel}
                        title={childLabel}
                      >
                        <span>{childLabel}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        return (
          <NavLink
            className={({ isActive }) => (isActive ? "is-active" : "")}
            key={item.path}
            to={item.path}
            {...routeIntent(item.path)}
            onClick={onNavigate}
            aria-label={label}
            title={label}
          >
            <Icon name={item.icon} />
            {!collapsed && <span>{label}</span>}
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

export function SettingsPage() {
  return (
    <div className="admin-page settings-page-full">
      <Outlet />
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
  const [openTicketsCount, setOpenTicketsCount] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const fetchOpenTickets = async () => {
      try {
        const res = await authenticatedRequest<{ total: number }>("/admin/support?status=OPEN&limit=1");
        if (active && typeof res?.total === "number") {
          setOpenTicketsCount(res.total);
        }
      } catch {
        // Silent fallback for non-admin or offline
      }
    };
    fetchOpenTickets();
    const interval = setInterval(fetchOpenTickets, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname]);

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
    const flattenedNav = adminNavigation.flatMap((item) =>
      item.children ? [item, ...item.children] : [item]
    );
    const match = flattenedNav.find((item) =>
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

        <Tooltip
          content={
            openTicketsCount === null
              ? t("admin_topbar.urgent_tickets")
              : openTicketsCount > 0
              ? `${openTicketsCount} ${t("admin_topbar.urgent_tickets")}`
              : t("admin_topbar.no_urgent_tickets")
          }
        >
          <Link
            to="/admin/support"
            className="topbar-action-btn"
            aria-label={
              openTicketsCount && openTicketsCount > 0
                ? `${openTicketsCount} ${t("admin_topbar.urgent_tickets")}`
                : t("admin_topbar.urgent_tickets")
            }
          >
            <Icon name="alert" />
            {openTicketsCount !== null && openTicketsCount > 0 ? (
              <span className="topbar-badge-count">{openTicketsCount > 99 ? "99+" : openTicketsCount}</span>
            ) : null}
          </Link>
        </Tooltip>

        <NotificationDropdown isAdmin={true} />

        <div className="topbar-divider-line" />

        <Avatar
          initials={user?.initials || (language === "en" ? "AD" : "QT")}
          name={user?.name || (language === "en" ? "Administrator" : "Quản trị viên")}
          detail={user?.detail || (language === "en" ? "Administrator" : "Quản trị viên")}
          avatarUrl={user?.avatarUrl}
          onLogout={handleLogout}
          menuItems={[
            { label: t("admin_nav.settings"), icon: "settings", onClick: () => navigate("/admin/settings/general") },
            { label: t("admin_nav.settings_logs"), icon: "file-text", onClick: () => navigate("/admin/settings/logs") },
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
