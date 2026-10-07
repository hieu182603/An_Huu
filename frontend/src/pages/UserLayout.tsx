import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Badge, BrandLogo, Drawer, Icon, IconButton, Tooltip, useNotification, type IconName } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { authenticatedRequest } from "../services/api";
import { UserAccountModal, type AccountModalTab } from "../components/UserAccountModal";
import AppLoader from "../components/AppLoader";
import PageTransition from "../components/PageTransition";
import { routeIntent } from "../services/routePreload";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { NotificationDropdown } from "../components/NotificationDropdown";
import { useI18n } from "../i18n";
import FinancialProfileGate from "../components/FinancialProfileGate";

export type UserNavItem = {
  path: string;
  label: string;
  icon: IconName;
  badge?: string;
};

export default function UserLayout() {
  const { t, language } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalTab, setAccountModalTab] = useState<AccountModalTab>("profile");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { completenessPercentage } = useFinancialProfile();
  const { notify } = useNotification();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFeedback, setSearchFeedback] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [unread, setUnread] = useState(0);

  const userNavItems: UserNavItem[] = [
    { path: "/user/dashboard", label: t("nav.dashboard"), icon: "home" },
    { path: "/user/goal", label: t("nav.goal"), icon: "target" },
    { path: "/user/plan", label: t("nav.plan"), icon: "compass" },
    { path: "/user/simulation", label: t("nav.simulation"), icon: "chart" },
    { path: "/user/debts", label: t("nav.debts"), icon: "wallet" },
    { path: "/user/risk-portfolio", label: t("nav.risk_portfolio"), icon: "shield" },
    { path: "/user/assistant", label: t("nav.assistant"), icon: "sparkles", badge: "AI" },
    { path: "/user/explore", label: t("nav.explore"), icon: "briefcase" },
  ];

  const drawerNavItems: UserNavItem[] = [
    ...userNavItems,
    { path: "/user/support", label: language === "en" ? "Support" : "Hỗ trợ", icon: "life-buoy" },
    { path: "/user/notifications", label: language === "en" ? "Notifications" : "Thông báo", icon: "bell" },
    { path: "/user/account", label: language === "en" ? "Financial Profile" : "Hồ sơ tài chính", icon: "settings" },
  ];

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!user || document.visibilityState === "hidden") return;
      authenticatedRequest<{ unread: number }>("/me/notifications?limit=1").then(v => { if (active) setUnread(v.unread); }).catch(() => {});
    };
    refresh(); const timer = window.setInterval(refresh, 60000);
    window.addEventListener("anhuu:notifications-updated", refresh); window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("anhuu:notifications-updated", refresh); window.removeEventListener("focus", refresh); };
  }, [user?.id]);

  const openAccountModal = (tab: AccountModalTab) => {
    setAccountModalTab(tab);
    setAccountModalOpen(true);
  };

  useEffect(() => setMobileMenuOpen(false), [location.pathname]);

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
        language === "en" ? "Logout Failed" : "Chưa thể đăng xuất",
        language === "en" ? "Could not connect to server. Please try again." : "Không thể kết nối máy chủ. Vui lòng thử lại."
      );
    }
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    const match = userNavItems.find((item) => item.label.toLowerCase().includes(query));
    if (!query || !match) {
      setSearchFeedback(
        query
          ? (t("common.no_data") || (language === "en" ? "No matching feature found." : "Không tìm thấy tính năng phù hợp."))
          : (language === "en" ? "Please enter search text." : "Hãy nhập nội dung cần tìm.")
      );
      return;
    }
    setSearchFeedback("");
    navigate(match.path);
  };

  return (
    <div className={`user-dashboard-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Sidebar */}
      <aside className={`user-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label={t("nav.main_navigation")}>
        <div className="user-sidebar-brand">
          <Link to="/user/dashboard" className={`dashboard-brand ${collapsed ? "is-compact" : ""}`} aria-label={language === "en" ? "An Huu Dashboard" : "Trang tổng quan An Hưu"}>
            <BrandLogo compact={collapsed} inverted />
          </Link>
          <IconButton
            icon={collapsed ? "panel-right" : "panel-left"}
            label={collapsed ? (language === "en" ? "Expand sidebar" : "Mở rộng thanh menu") : (language === "en" ? "Collapse sidebar" : "Thu gọn thanh menu")}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>

        <nav>
          {!collapsed && <div className="sidebar-label">{t("nav.main_navigation")}</div>}
          {userNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                {...routeIntent(item.path)}
                className={isActive ? "is-active" : ""}
                title={item.label}
                aria-label={item.label}
              >
                <Icon name={item.icon} />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && item.badge && (
                  <span style={{ marginLeft: "auto" }}>
                    <Badge tone="honey">{item.badge}</Badge>
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="sidebar-profile-progress">
            <div>
              <span>{t("nav.profile_progress")}</span>
              <strong>{completenessPercentage}%</strong>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={completenessPercentage} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ "--progress": `${completenessPercentage}%` } as React.CSSProperties} />
            </div>
            <small>{t("nav.demo_disclaimer")}</small>
          </div>
        )}

      </aside>

      {/* Main Workspace */}
      <div className="dashboard-workspace">
        <header className="user-topbar">
          <div className="user-mobile-brand">
            <button
              className="icon-button"
              type="button"
              aria-label={language === "en" ? "Open account menu" : "Mở menu tài khoản"}
              aria-expanded={mobileMenuOpen}
              aria-haspopup="dialog"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Icon name="grid" />
            </button>
            <Link to="/user/dashboard" aria-label={language === "en" ? "An Huu: Overview" : "An Hưu: Tổng quan"}>
              <BrandLogo compact />
            </Link>
          </div>

          <form className="topbar-search-form" role="search" onSubmit={submitSearch}>
            <div className="topbar-search-box">
              <Icon name="search" size="small" className="topbar-search-icon" />
              <input
                ref={searchInputRef}
                type="search"
                className="topbar-search-input"
                placeholder={t("topbar.search_placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t("common.search")}
              />
              <span className="topbar-search-shortcut">
                <kbd>Ctrl</kbd>
                <kbd>K</kbd>
              </span>
            </div>
            <button className="sr-only" type="submit">{t("common.search")}</button>
            {searchFeedback && <span className="topbar-search-feedback" role="status">{searchFeedback}</span>}
          </form>

          <div className="user-topbar-actions">
            <button
              type="button"
              className="topbar-ai-pill"
              onClick={() => navigate("/user/assistant")}
              title={t("topbar.ai_assistant")}
            >
              <Icon name="sparkles" />
              <span>{t("topbar.ai_assistant")}</span>
            </button>
            <LanguageSwitcher />
            <Tooltip content={t("topbar.support")}>
              <button
                type="button"
                className="topbar-action-btn"
                onClick={() => navigate("/user/support")}
                aria-label={t("topbar.support")}
              >
                <Icon name="life-buoy" />
              </button>
            </Tooltip>
            <NotificationDropdown />

            <div className="topbar-divider-line" />

            <Avatar
              initials={user?.initials || "NA"}
              name={user?.name || "An Huu User"}
              detail={user?.role === "admin" ? (language === "en" ? "Administrator" : "Quản trị viên") : (language === "en" ? "An Huu Account" : "Tài khoản An Hưu")}
              avatarUrl={user?.avatarUrl}
              onLogout={handleLogout}
              menuItems={[
                { label: t("topbar.profile"), icon: "users", onClick: () => openAccountModal("profile") },
                { label: t("topbar.settings"), icon: "settings", onClick: () => openAccountModal("settings") },
                { label: t("topbar.export_plan"), icon: "download", onClick: () => openAccountModal("export") },
              ]}
            />
          </div>
        </header>

        <main className={`dashboard-main ${location.pathname === "/user/assistant" ? "dashboard-main-assistant" : ""}`} id="main-content">
          <FinancialProfileGate>
            <Suspense fallback={<AppLoader variant="inline" label={t("common.loading")} />}>
              <PageTransition key={location.pathname}>
                <Outlet />
              </PageTransition>
            </Suspense>
          </FinancialProfileGate>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="user-mobile-nav" aria-label={language === "en" ? "Mobile navigation" : "Menu di động"}>
        <NavLink to="/user/dashboard" {...routeIntent("/user/dashboard")} className={location.pathname === "/user/dashboard" ? "is-active" : ""}>
          <Icon name="home" />
          <span>{t("nav.dashboard")}</span>
        </NavLink>
        <NavLink to="/user/goal" {...routeIntent("/user/goal")} className={location.pathname === "/user/goal" ? "is-active" : ""}>
          <Icon name="target" />
          <span>{t("nav.goal")}</span>
        </NavLink>
        <NavLink to="/user/plan" {...routeIntent("/user/plan")} className={location.pathname === "/user/plan" ? "is-active" : ""}>
          <Icon name="compass" />
          <span>{t("nav.plan")}</span>
        </NavLink>
        <NavLink to="/user/assistant" {...routeIntent("/user/assistant")} className={location.pathname === "/user/assistant" ? "is-active" : ""}>
          <Icon name="sparkles" />
          <span>{t("nav.assistant")}</span>
        </NavLink>
        <button
          type="button"
          className={`user-mobile-nav-btn ${accountModalOpen ? "is-active" : ""}`}
          onClick={() => openAccountModal("profile")}
          style={{ background: "transparent", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", color: "inherit", cursor: "pointer", font: "inherit" }}
        >
          <Icon name="users" />
          <span>{t("topbar.profile")}</span>
        </button>
      </nav>
      <Drawer open={mobileMenuOpen} title={t("topbar.profile")} onClose={() => setMobileMenuOpen(false)}>
        <div style={{ padding: "12px 16px" }}>
          <LanguageSwitcher variant="select" />
        </div>
        <nav className="mobile-navigation" aria-label={language === "en" ? "All user features" : "Tất cả chức năng User"}>
          {drawerNavItems.map(item => <NavLink key={item.path} to={item.path} {...routeIntent(item.path)} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => isActive ? "is-active" : ""}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}
        </nav>
      </Drawer>

      {/* Wide Horizontal User Account & Settings Modal */}
      <UserAccountModal
        open={accountModalOpen}
        initialTab={accountModalTab}
        onClose={() => setAccountModalOpen(false)}
        user={user ? {
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          initials: user.initials,
          detail: user?.role === "admin" ? (language === "en" ? "Administrator" : "Quản trị viên") : (language === "en" ? "An Huu Account" : "Tài khoản An Hưu"),
        } : undefined}
      />
    </div>
  );
}
