import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Badge, BrandLogo, Drawer, Icon, IconButton, SearchField, Tooltip, type IconName } from "../components/ui";
import { useAuth } from "../context/AuthContext";

export type UserNavItem = {
  path: string;
  label: string;
  icon: IconName;
  badge?: string;
};

export const userNavItems: UserNavItem[] = [
  { path: "/user/dashboard", label: "Tổng quan", icon: "home" },
  { path: "/user/goal", label: "Mục tiêu nghỉ hưu", icon: "target" },
  { path: "/user/plan", label: "Kế hoạch chi tiết", icon: "compass" },
  { path: "/user/simulation", label: "Mô phỏng & Theo dõi", icon: "chart" },
  { path: "/user/assistant", label: "Trợ lý AI", icon: "sparkles", badge: "AI" },
  { path: "/user/explore", label: "Kiến thức & Giải pháp", icon: "briefcase" },
  { path: "/user/account", label: "Hồ sơ tài chính", icon: "settings" },
];

export default function UserLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  useEffect(() => setMobileMenuOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className={`user-dashboard-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Sidebar */}
      <aside className={`user-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Menu tài khoản">
        <div className="user-sidebar-brand">
          <Link to="/user/dashboard" className={`dashboard-brand ${collapsed ? "is-compact" : ""}`} aria-label="Trang tổng quan An Hưu">
            <BrandLogo compact={collapsed} />
          </Link>
          <IconButton
            icon={collapsed ? "panel-left" : "chevron-left"}
            label={collapsed ? "Mở rộng thanh menu" : "Thu gọn thanh menu"}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>

        <nav>
          {!collapsed && <div className="sidebar-label">ĐIỀU HƯỚNG CHÍNH</div>}
          {userNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
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
              <span>Độ hoàn thiện hồ sơ</span>
              <strong>90%</strong>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={90} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ "--progress": "90%" } as React.CSSProperties} />
            </div>
            <small>Đã xác thực email & liên kết dữ liệu BHXH mẫu.</small>
          </div>
        )}

      </aside>

      {/* Main Workspace */}
      <div className="dashboard-workspace">
        <header className="user-topbar">
          <div className="user-mobile-brand">
            <button className="icon-button" type="button" aria-label="Mở menu tài khoản" aria-expanded={mobileMenuOpen} aria-haspopup="dialog" onClick={() => setMobileMenuOpen(true)}><Icon name="grid" /></button>
            <Link to="/user/dashboard" aria-label="An Hưu — Tổng quan"><BrandLogo compact /></Link>
          </div>
          <SearchField
            label="Tìm kiếm nhanh"
            placeholder="Tìm tính năng, kịch bản, bài viết..."
            hideLabel
          />

          <div className="user-topbar-actions">
            <Tooltip content="Hỗ trợ & giải đáp">
              <IconButton icon="life-buoy" label="Trợ giúp" onClick={() => navigate("/user/assistant")} />
            </Tooltip>
            <Tooltip content="Thông báo mới (1)">
              <IconButton icon="bell" label="Thông báo" badge />
            </Tooltip>
            <Avatar
              initials={user?.initials || "NA"}
              name={user?.name || "Nguyễn Minh An"}
              detail={user?.detail || "Gói Chuẩn bị Tương lai"}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <main className="dashboard-main" id="main-content">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="user-mobile-nav" aria-label="Menu di động">
        <NavLink to="/user/dashboard" className={location.pathname === "/user/dashboard" ? "is-active" : ""}>
          <Icon name="home" />
          <span>Tổng quan</span>
        </NavLink>
        <NavLink to="/user/goal" className={location.pathname === "/user/goal" ? "is-active" : ""}>
          <Icon name="target" />
          <span>Mục tiêu</span>
        </NavLink>
        <NavLink to="/user/plan" className={location.pathname === "/user/plan" ? "is-active" : ""}>
          <Icon name="compass" />
          <span>Kế hoạch</span>
        </NavLink>
        <NavLink to="/user/assistant" className={location.pathname === "/user/assistant" ? "is-active" : ""}>
          <Icon name="sparkles" />
          <span>Trợ lý AI</span>
        </NavLink>
        <NavLink to="/user/account" className={location.pathname === "/user/account" ? "is-active" : ""}>
          <Icon name="settings" />
          <span>Hồ sơ</span>
        </NavLink>
      </nav>
      <Drawer open={mobileMenuOpen} title="Menu tài khoản" onClose={() => setMobileMenuOpen(false)}>
        <nav className="mobile-navigation" aria-label="Tất cả chức năng User">
          {userNavItems.map(item => <NavLink key={item.path} to={item.path} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => isActive ? "is-active" : ""}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}
        </nav>
      </Drawer>
    </div>
  );
}
