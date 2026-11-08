import "./user-readability.css";
import "./user-demo-theme.css";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import logoMark from "../assets/logo-mark.webp";
import { Avatar, Badge, BrandLogo, Drawer, Icon, IconButton, Tooltip, useNotification, type IconName } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { UserAccountModal, type AccountModalTab } from "../components/UserAccountModal";
import AppLoader from "../components/AppLoader";
import PageTransition from "../components/PageTransition";
import { routeIntent } from "../services/routePreload";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { NotificationDropdown } from "../components/NotificationDropdown";
import { useI18n } from "../i18n";
import FinancialProfileGate from "../components/FinancialProfileGate";
import { ExplainModeProvider } from "../components/explanations/ExplainMode";

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
  const [explainMode, setExplainMode] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const userNavItems: UserNavItem[] = [
    { path: "/user/dashboard", label: t("nav.dashboard"), icon: "home" },
    { path: "/user/profile", label: language === "en" ? "Your finances" : "Tài chính của bạn", icon: "wallet" },
    { path: "/user/goal", label: t("nav.goal"), icon: "target" },
    { path: "/user/plan", label: t("nav.plan"), icon: "compass" },
    { path: "/user/risk-portfolio", label: t("nav.risk_portfolio"), icon: "shield" },
    { path: "/user/assistant", label: t("nav.assistant"), icon: "sparkles", badge: "AI" },
    { path: "/user/explore", label: language === "en" ? "Financial products" : "Sản phẩm tài chính", icon: "briefcase" },
    { path: "/user/knowledge", label: language === "en" ? "Financial knowledge" : "Kiến thức tài chính", icon: "file-text" },
  ];

  // Sidebar groups mirror the demo: planning tasks, discovery, then help.
  const navGroups: { label: string; items: UserNavItem[] }[] = [
    { label: language === "en" ? "Your plan" : "Kế hoạch của bạn", items: userNavItems.slice(0, 5) },
    { label: language === "en" ? "Explore" : "Khám phá", items: userNavItems.filter(item => item.path === "/user/explore" || item.path === "/user/knowledge") },
    { label: language === "en" ? "Help" : "Hỗ trợ", items: [
      ...userNavItems.filter(item => item.path === "/user/assistant"),
    ] },
  ];
  const currentNavLabel = [...userNavItems,
    { path: "/user/support", label: language === "en" ? "Support" : "Hỗ trợ", icon: "life-buoy" as IconName },
    { path: "/user/notifications", label: language === "en" ? "Notifications" : "Thông báo", icon: "bell" as IconName },
    { path: "/user/debts", label: language === "en" ? "Your finances" : "Tài chính của bạn", icon: "wallet" as IconName },
  ].find(item => location.pathname.startsWith(item.path))?.label;
  const settingsTab = location.pathname === "/user/account" && /[?&]tab=(settings|reports)\b/.test(location.search);
  const locationLabel = settingsTab ? (language === "en" ? "Account settings" : "Cài đặt tài khoản") : currentNavLabel;

  const drawerNavItems: UserNavItem[] = [
    ...userNavItems,
    { path: "/user/support", label: language === "en" ? "Support" : "Hỗ trợ", icon: "life-buoy" },
    { path: "/user/notifications", label: language === "en" ? "Notifications" : "Thông báo", icon: "bell" },
  ];

  // Unread count and polling live in the shared notification store used by
  // NotificationDropdown (services/socket.ts); no second poll here.

  const openAccountModal = (tab: AccountModalTab) => {
    setAccountModalTab(tab);
    setAccountModalOpen(true);
  };

  useEffect(() => { setMobileMenuOpen(false); setExplainMode(false); }, [location.pathname]);

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
          <Link
            to="/user/dashboard"
            className={`sidebar-brand-lockup ${collapsed ? "is-compact" : ""}`}
            aria-label={language === "en" ? "An Huu Dashboard" : "Trang tổng quan An Hưu"}
          >
            <div className="sidebar-brand-badge">
              <img src={logoMark} alt="An Hưu" className="sidebar-brand-emblem" />
            </div>
            {!collapsed && (
              <div className="sidebar-brand-info">
                <span className="sidebar-brand-title">An Hưu</span>
                <span className="sidebar-brand-subtitle">{language === "en" ? "Peaceful Planning" : "Kế hoạch an yên"}</span>
              </div>
            )}
          </Link>
          <button
            type="button"
            className="sidebar-collapse-toggle"
            aria-label={collapsed ? (language === "en" ? "Expand sidebar" : "Mở rộng thanh menu") : (language === "en" ? "Collapse sidebar" : "Thu gọn thanh menu")}
            title={collapsed ? (language === "en" ? "Expand sidebar" : "Mở rộng thanh menu") : (language === "en" ? "Collapse sidebar" : "Thu gọn thanh menu")}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name={collapsed ? "panel-right" : "panel-left"} />
          </button>
        </div>

        <nav>
          {navGroups.map(group => (
            <div className="sidebar-group" key={group.label}>
              {!collapsed && <div className="sidebar-label">{group.label}</div>}
              {group.items.map((item) => {
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
                      <span className="sidebar-ai-badge">
                        <span>{item.badge}</span>
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {!collapsed && (
          <Link to="/user/account" className="sidebar-profile-progress" aria-label={language === "en" ? "View and complete financial profile" : "Xem và hoàn thiện hồ sơ tài chính"}>
            <div className="sidebar-profile-heading">
              <Icon name="users" />
              <span>{language === "en" ? "Financial profile" : "Hồ sơ tài chính"}</span>
            </div>
            <div className="sidebar-profile-status"><span>{language === "en" ? "Completed" : "Đã hoàn thiện"}</span><strong>{completenessPercentage}%</strong></div>
            <div className="progress-track" role="progressbar" aria-label={t("nav.profile_progress")} aria-valuenow={completenessPercentage} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ "--progress": `${completenessPercentage}%` } as React.CSSProperties} />
            </div>
            <span className="sidebar-profile-action"><Icon name="edit" size="small" /><span>{language === "en" ? "Edit profile" : "Chỉnh sửa hồ sơ"}</span><Icon name="chevron-right" size="small" /></span>
          </Link>
        )}

        {collapsed && <Link to="/user/account" className="sidebar-profile-compact" aria-label={language === "en" ? "View and complete financial profile" : "Xem và hoàn thiện hồ sơ tài chính"} title={language === "en" ? "Financial profile" : "Hồ sơ tài chính"}><Icon name="users" /><span>{completenessPercentage}%</span></Link>}
      </aside>

      {/* Main Workspace */}
      <div className="dashboard-workspace">
        <header className="user-topbar">
          <div className="user-mobile-brand">
            <button
              className="icon-button"
              type="button"
              aria-label={language === "en" ? "Open menu" : "Mở menu tài khoản"}
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
                onChange={(e) => { setSearchQuery(e.target.value); setSearchFeedback(""); }}
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
              className={`topbar-ai-pill ${explainMode ? "is-active" : ""}`}
              onClick={() => setExplainMode(value => !value)}
              aria-pressed={explainMode}
              aria-label={t("topbar.ai_assistant")}
              title={explainMode ? (language === "en" ? "Turn off explain mode" : "Tắt chế độ giải thích") : (language === "en" ? "Turn on explain mode" : "Bật chế độ giải thích")}
            >
              <Icon name="sparkles" className="topbar-ai-icon-desktop" />
              <Icon name="info" className="topbar-ai-icon-mobile" />
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
          <ExplainModeProvider key={user?.id} enabled={explainMode} onDisable={() => setExplainMode(false)}>
          {locationLabel && location.pathname !== "/user/assistant" && (
            <nav className="location-bar" aria-label={language === "en" ? "You are here" : "Vị trí hiện tại"}>
              <Link to="/user/dashboard">{language === "en" ? "Your space" : "Không gian của bạn"}</Link>
              <Icon name="chevron-right" size="small" />
              <strong aria-current="page">{locationLabel}</strong>
            </nav>
          )}
          {explainMode && <div className="explain-mode-banner" role="status"><span>{language === "en" ? "Tap a phrase or figure to see an explanation · Esc to exit" : "Chạm vào cụm từ hoặc con số để xem giải thích · Esc để thoát"}</span><Link to="/user/assistant">{language === "en" ? "Open AI chat" : "Mở trò chuyện AI"}</Link></div>}
          <FinancialProfileGate>
            <Suspense fallback={<AppLoader variant="inline" label={t("common.loading")} />}>
              <PageTransition key={location.pathname}>
                <Outlet />
              </PageTransition>
            </Suspense>
          </FinancialProfileGate>
          </ExplainModeProvider>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="user-mobile-nav" aria-label={language === "en" ? "Mobile navigation" : "Menu di động"}>
        <NavLink to="/user/dashboard" {...routeIntent("/user/dashboard")} className={location.pathname === "/user/dashboard" ? "is-active" : ""} aria-current={location.pathname === "/user/dashboard" ? "page" : undefined}>
          <Icon name="home" />
          <span>{language === "en" ? "Overview" : "Tổng quan"}</span>
        </NavLink>
        <NavLink to="/user/goal" {...routeIntent("/user/goal")} className={location.pathname === "/user/goal" ? "is-active" : ""} aria-current={location.pathname === "/user/goal" ? "page" : undefined}>
          <Icon name="target" />
          <span>{language === "en" ? "Goals" : "Mục tiêu"}</span>
        </NavLink>
        <NavLink to="/user/plan" {...routeIntent("/user/plan")} className={location.pathname === "/user/plan" ? "is-active" : ""} aria-current={location.pathname === "/user/plan" ? "page" : undefined}>
          <Icon name="compass" />
          <span>{language === "en" ? "Plan" : "Kế hoạch"}</span>
        </NavLink>
        <NavLink to="/user/assistant" {...routeIntent("/user/assistant")} className={location.pathname === "/user/assistant" ? "is-active" : ""} aria-current={location.pathname === "/user/assistant" ? "page" : undefined}>
          <Icon name="sparkles" />
          <span>{language === "en" ? "Assistant" : "Trợ lý"}</span>
        </NavLink>
        <button
          type="button"
          className={`user-mobile-nav-btn ${accountModalOpen ? "is-active" : ""}`}
          onClick={() => openAccountModal("profile")}
          aria-label={language === "en" ? "Profile" : "Hồ sơ"}
        >
          <Icon name="users" />
          <span>{language === "en" ? "Profile" : "Hồ sơ"}</span>
        </button>
      </nav>
      <Drawer open={mobileMenuOpen} title={language === "en" ? "Menu" : "Menu"} onClose={() => setMobileMenuOpen(false)}>
        {mobileMenuOpen && (
          <div style={{ padding: "12px 16px" }}>
            <form className="drawer-search-form" role="search" onSubmit={(e) => { submitSearch(e); setMobileMenuOpen(false); }}>
              <div className="topbar-search-box" style={{ width: "100%" }}>
                <Icon name="search" size="small" className="topbar-search-icon" />
                <input
                  type="search"
                  className="topbar-search-input"
                  placeholder={t("topbar.search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchFeedback(""); }}
                  aria-label={t("common.search")}
                  style={{ fontSize: "16px", minHeight: "44px" }}
                />
              </div>
            </form>
          </div>
        )}
        <div style={{ padding: "12px 16px" }}>
          <LanguageSwitcher variant="select" />
        </div>
        <nav className="mobile-navigation" aria-label={language === "en" ? "All user features" : "Tất cả chức năng User"}>
          {drawerNavItems.map(item => <NavLink key={item.path} to={item.path} {...routeIntent(item.path)} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => isActive ? "is-active" : ""}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}
        </nav>
      </Drawer>

      {/* Wide Horizontal User Account & Settings Modal */}
      <UserAccountModal
        key={user?.id}
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
