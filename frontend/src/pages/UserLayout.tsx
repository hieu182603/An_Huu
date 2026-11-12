import "./user-readability.css";
import "./user-demo-theme.css";
import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, BrandLogo, Drawer, Icon, Tooltip, type IconName } from "../components/ui";
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
import UserFeatureSearch from "../components/UserFeatureSearch";
import UserLanguageMenu from "../components/UserLanguageMenu";
import UserProfileProgressDialog from "../components/UserProfileProgressDialog";
import ResponsiveDialog from "../components/ResponsiveDialog";
import { userProfileProgress } from "../utils/userProfileProgress";
import { useRetirementPlan } from "../context/RetirementPlanContext";

export type UserNavItem = {
  path: string;
  label: string;
  icon: IconName;
  badge?: string;
};

export default function UserLayout() {
  const { t, language } = useI18n();
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(min-width: 768px) and (max-width: 1024px)").matches);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalTab, setAccountModalTab] = useState<AccountModalTab>("profile");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { profile, v2Profile, hasProfile } = useFinancialProfile();
  const { currentVersion } = useRetirementPlan();
  const progressItems = userProfileProgress(profile, v2Profile, hasProfile, Boolean(currentVersion?.preview.status === "READY" && currentVersion.preview.selection?.answers?.length));
  const completedGroups = progressItems.filter(item => item.done).length;
  const completenessPercentage = completedGroups * 20;
  const [searchOpen, setSearchOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [explainMode, setExplainMode] = useState(false);

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
  const settingsTab = location.pathname === "/user/account" && ["settings", "reports", "security"].includes(new URLSearchParams(location.search).get("tab") ?? "");
  const profileTab = location.pathname === "/user/account" && !settingsTab;
  const simulationWhatIf = location.pathname.startsWith("/user/simulation") && /[?&]tab=what-if\b/.test(location.search);
  const simulationActuals = location.pathname.startsWith("/user/simulation") && !simulationWhatIf;
  const cashflowTab = location.pathname === "/user/profile" && new URLSearchParams(location.search).get("section") === "cashflow";
  const constraintsTab = location.pathname === "/user/profile" && new URLSearchParams(location.search).get("section") === "constraints";
  const activeNavPath = constraintsTab ? "/user/goal" : location.pathname === "/user/debts" ? "/user/profile" : location.pathname;
  const isNavActive = (path: string) => activeNavPath === path;
  const assetsTab = location.pathname === "/user/profile" && new URLSearchParams(location.search).get("section") === "assets";
  const locationLabel = location.pathname === "/user/debts"
    ? (language === "en" ? "Debts & repayment capacity" : "Khoản nợ & khả năng trả")
    : location.pathname === "/user/profile" && new URLSearchParams(location.search).get("section") === "insurance"
    ? (language === "en" ? "Social insurance pension" : "Lương hưu BHXH")
    : location.pathname === "/user/profile" && new URLSearchParams(location.search).get("section") === "family"
    ? (language === "en" ? "Family & dependents" : "Gia đình & người phụ thuộc")
    : location.pathname === "/user/profile" && new URLSearchParams(location.search).get("section") === "constraints"
    ? (language === "en" ? "Other goals" : "Mục tiêu khác")
    : assetsTab
    ? (language === "en" ? "Assets & emergency reserve" : "Tài sản & quỹ dự phòng")
    : cashflowTab
    ? (language === "en" ? "Income & expenses" : "Thu nhập & chi tiêu")
    : settingsTab
    ? (language === "en" ? "Account settings" : "Cài đặt tài khoản")
    : profileTab
    ? (language === "en" ? "Personal info" : "Thông tin cá nhân")
    : simulationWhatIf
    ? (language === "en" ? "Future changes" : "Thay đổi tương lai")
    : simulationActuals
    ? (language === "en" ? "Track & Check-in" : "Cập nhật tình hình")
    : currentNavLabel;

  const drawerGroups = [
    { ...navGroups[0], items: [...navGroups[0].items,
      { path: "/user/simulation", label: language === "en" ? "Track your progress" : "Cập nhật tình hình", icon: "chart" as IconName },
      { path: "/user/simulation?tab=what-if", label: language === "en" ? "Future changes" : "Điều chỉnh tương lai", icon: "chart" as IconName },
    ] },
    navGroups[1], navGroups[2],
    { label: language === "en" ? "Help & account" : "Trợ giúp & tài khoản", items: [
      { path: "/user/support", label: language === "en" ? "Support" : "Hỗ trợ", icon: "life-buoy" as IconName },
      { path: "/user/notifications", label: language === "en" ? "Notifications" : "Thông báo", icon: "bell" as IconName },
      { path: "/user/account", label: language === "en" ? "Personal information" : "Thông tin cá nhân", icon: "users" as IconName },
      { path: "/user/account?tab=settings", label: language === "en" ? "Account settings" : "Cài đặt tài khoản", icon: "settings" as IconName },
    ] },
  ];
  const isDrawerActive = (path: string) => path.startsWith("/user/account")
    ? path.includes("?") ? settingsTab : profileTab
    : path.startsWith("/user/simulation") ? path.includes("?") ? simulationWhatIf : simulationActuals
    : isNavActive(path);

  // Unread count and polling live in the shared notification store used by
  // NotificationDropdown (services/socket.ts); no second poll here.

  const openAccountModal = (tab: AccountModalTab) => {
    setAccountModalTab(tab);
    setAccountModalOpen(true);
  };

  useEffect(() => { setMobileMenuOpen(false); setExplainMode(false); }, [location.pathname]);

  useEffect(() => {
    const tablet = window.matchMedia("(min-width: 768px) and (max-width: 1024px)");
    const update = () => setCollapsed(tablet.matches);
    tablet.addEventListener("change", update);
    return () => tablet.removeEventListener("change", update);
  }, []);

  // The same feature search is available on desktop, mobile and keyboard.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (document.querySelector('[role="dialog"]:not(.user-feature-search)')) return;
        e.preventDefault();
        setMobileMenuOpen(false);
        setSearchOpen(value => !value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true); setLogoutError("");
    try { await logout(); setLogoutOpen(false); navigate("/login"); }
    catch {
      setLogoutError(language === "en" ? "Could not connect to server. Please retry." : "Không thể kết nối máy chủ. Vui lòng thử lại.");
    }
    finally { setLoggingOut(false); }
  };

  const closeLogout = () => {
    if (loggingOut) return;
    setLogoutOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".user-topbar .avatar-button")?.focus());
  };

  return (
    <div className={`user-dashboard-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Sidebar */}
      {/* Sidebar shares the admin sidebar classes (admin-sidebar / admin-nav) so both areas look the same. */}
      <aside className={`user-sidebar admin-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label={t("nav.main_navigation")}>
        <div className="admin-sidebar-brand">
          <Link
            to="/user/dashboard"
            className={`dashboard-brand ${collapsed ? "is-compact" : ""}`}
            aria-label={language === "en" ? "An Huu — Overview" : "An Hưu — Tổng quan"}
          >
            <div className={`dashboard-brand ${collapsed ? "is-compact" : ""}`}>
              <BrandLogo compact={collapsed} inverted />
            </div>
          </Link>
          <button
            type="button"
            className="admin-sidebar-toggle-btn"
            aria-label={collapsed ? (language === "en" ? "Expand navigation" : "Mở rộng thanh điều hướng") : (language === "en" ? "Collapse navigation" : "Thu gọn thanh điều hướng")}
            title={collapsed ? (language === "en" ? "Expand navigation" : "Mở rộng thanh điều hướng") : (language === "en" ? "Collapse navigation" : "Thu gọn thanh điều hướng")}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name={collapsed ? "panel-right" : "panel-left"} size="small" />
          </button>
        </div>

        <nav className="admin-nav">
          {navGroups.map(group => (
            <div className="sidebar-group" key={group.label}>
              {!collapsed && <div className="sidebar-label">{group.label}</div>}
              {group.items.map((item) => {
                const isActive = isNavActive(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    {...routeIntent(item.path)}
                    className={isActive ? "is-active" : ""}
                    aria-current={isActive ? "page" : false}
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
          <div className="sidebar-bottom">
            <button type="button" className="profile-progress" aria-label={language === "en" ? "Profile completeness progress" : "Tiến độ hoàn thiện hồ sơ"} aria-haspopup="dialog" onClick={() => setProgressOpen(true)}>
              <span className="profile-progress-title">
                <Icon name="users" />
                <strong>{language === "en" ? "Profile completion" : "Hoàn thiện hồ sơ"}</strong>
                <b>{completedGroups}/5</b>
              </span>
              <span className="profile-progress-track" aria-hidden="true">
                <i style={{ width: `${completenessPercentage}%` }} />
              </span>
              <small>{completedGroups === 5 ? (language === "en" ? "5 initial information groups ready" : "Đã có 5 nhóm thông tin ban đầu") : progressItems.filter(item => !item.done).map(item => item.title[language === "en" ? 1 : 0]).join(", ")}</small>
            </button>
          </div>
        )}

        {collapsed && (
          <button type="button" className="sidebar-profile-compact" aria-label={language === "en" ? "Profile completion" : "Hoàn thiện hồ sơ"} title={language === "en" ? "Financial profile" : "Hồ sơ tài chính"} aria-haspopup="dialog" onClick={() => setProgressOpen(true)}>
            <Icon name="users" />
            <span>{completenessPercentage}%</span>
          </button>
        )}
      </aside>

      {/* Main Workspace */}
      <div className="dashboard-workspace">
        <header className="user-topbar admin-topbar">
          <div className="user-mobile-brand admin-mobile-brand">
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
            <Link to="/user/dashboard" className="dashboard-brand is-compact" aria-label={language === "en" ? "An Huu: Overview" : "An Hưu: Tổng quan"}>
              <BrandLogo compact inverted />
            </Link>
          </div>

          <button type="button" className="topbar-search-form topbar-search-box topbar-search-trigger" onClick={() => setSearchOpen(true)} aria-label={language === "en" ? "Find a feature" : "Tìm chức năng"} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">
              <Icon name="search" size="small" className="topbar-search-icon" />
              <span className="topbar-search-label">{t("topbar.search_placeholder")}</span>
              <span className="topbar-search-shortcut">
                <kbd>Ctrl</kbd>
                <kbd>K</kbd>
              </span>
          </button>

          <div className="user-topbar-actions">
            <button
              type="button"
              className="topbar-ai-pill"
              onClick={() => navigate("/user/assistant")}
              aria-label={t("topbar.ai_assistant")}
              title={language === "en" ? "Open AI assistant" : "Mở trợ lý AI"}
            >
              <Icon name="sparkles" />
              <span>{language === "en" ? "Assistant" : "Trợ lý"}</span>
              <small>AI</small>
            </button>
            <UserLanguageMenu />
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
              onLogout={() => { setLogoutError(""); setLogoutOpen(true); }}
              menuItems={[
                { label: t("topbar.profile"), icon: "users", onClick: () => openAccountModal("profile") },
                { label: t("topbar.settings"), icon: "settings", onClick: () => openAccountModal("settings") },
                { label: language === "en" ? "Explain figures" : "Giải thích số liệu", icon: "info", onClick: () => setExplainMode(value => !value) },
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
        <NavLink to="/user/goal" {...routeIntent("/user/goal")} className={isNavActive("/user/goal") ? "is-active" : ""} aria-current={isNavActive("/user/goal") ? "page" : false}>
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
          onClick={() => navigate("/user/account")}
          aria-label={language === "en" ? "Profile" : "Hồ sơ"}
        >
          <Icon name="users" />
          <span>{language === "en" ? "Profile" : "Hồ sơ"}</span>
        </button>
      </nav>
      <Drawer open={mobileMenuOpen} title={language === "en" ? "All features" : "Tất cả chức năng"} onClose={() => setMobileMenuOpen(false)}>
        {mobileMenuOpen && (
          <div style={{ padding: "12px 16px" }}>
            <button type="button" className="drawer-feature-search" onClick={() => { setMobileMenuOpen(false); setSearchOpen(true); }} aria-haspopup="dialog">
                <Icon name="search" size="small" className="topbar-search-icon" />
                <span>{language === "en" ? "Find a feature" : "Tìm chức năng"}</span>
            </button>
          </div>
        )}
        <div style={{ padding: "12px 16px" }}>
          <LanguageSwitcher variant="select" />
        </div>
        <nav className="mobile-navigation admin-nav" aria-label={language === "en" ? "All user features" : "Tất cả chức năng User"}>
          {drawerGroups.map(group => <section className="user-drawer-group" key={group.label}><h3>{group.label}</h3>{group.items.map(item => <NavLink key={item.path} to={item.path} {...routeIntent(item.path)} onClick={() => setMobileMenuOpen(false)} className={isDrawerActive(item.path) ? "is-active" : ""} aria-current={isDrawerActive(item.path) ? "page" : false}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</section>)}
        </nav>
        <button type="button" className="drawer-profile-progress" onClick={() => { setMobileMenuOpen(false); setProgressOpen(true); }}>{language === "en" ? "Profile completion" : "Hoàn thiện hồ sơ"} · {completedGroups}/5</button>
      </Drawer>

      {searchOpen && <UserFeatureSearch onClose={() => setSearchOpen(false)} />}
      {progressOpen && <UserProfileProgressDialog items={progressItems} onClose={() => setProgressOpen(false)} />}
      {logoutOpen && <ResponsiveDialog open title={language === "en" ? "Sign out of An Huu?" : "Đăng xuất khỏi An Hưu?"} onClose={closeLogout} className="user-workspace-dialog dashboard-detail-dialog" initialFocusSelector=".logout-cancel">
        <p>{language === "en" ? "Your saved information and plans stay in your account. You can sign in again to continue." : "Thông tin và kế hoạch đã lưu vẫn ở trong tài khoản. Bạn có thể đăng nhập lại để tiếp tục."}</p>
        {logoutError && <p role="alert">{logoutError}</p>}
        <div className="dashboard-dialog-actions"><button type="button" className="overview-button secondary logout-cancel" disabled={loggingOut} onClick={closeLogout}>{language === "en" ? "Stay signed in" : "Ở lại"}</button><button type="button" className="overview-button" disabled={loggingOut} onClick={() => void handleLogout()}>{loggingOut ? (language === "en" ? "Signing out…" : "Đang đăng xuất…") : (language === "en" ? "Sign out" : "Đăng xuất")}</button></div>
      </ResponsiveDialog>}

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
