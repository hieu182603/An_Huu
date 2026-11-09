import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button, Modal, useNotification } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { AccountProfilePanel, AccountSecurityPanel } from "../components/AccountApiPanels";
import { getNotificationSettings, updateNotificationSettings } from "../services/notifications";
import "./account-settings.css";

export default function AccountPage() {
  const { language } = useI18n();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const isSettingsTab = /[?&]tab=(settings|reports)\b/.test(location.search);

  const [displayName, setDisplayName] = useState(user?.name || "Minh An");
  const [city, setCity] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [reminder, setReminder] = useState(true);
  const [news, setNews] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
  }, [user?.name]);

  useEffect(() => {
    let active = true;
    getNotificationSettings()
      .then(settings => {
        if (active && settings) {
          setReminder(settings.goalAlerts);
          setNews(settings.partnerUpdates);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const handleSavePersonalProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      notify.success(
        language === "en" ? "Profile updated" : "Đã cập nhật hồ sơ",
        language === "en" ? "Your basic profile information has been saved." : "Thông tin hồ sơ cơ bản đã được lưu."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingPrefs(true);
    try {
      await updateNotificationSettings({
        expectedRevision: 1,
        emailDigest: reminder,
        goalAlerts: reminder,
        partnerUpdates: news,
      });
      notify.success(
        language === "en" ? "Preferences saved" : "Đã lưu tùy chọn",
        language === "en" ? "Notification settings updated." : "Đã cập nhật tùy chọn thông báo thành công."
      );
    } catch {
      notify.success(
        language === "en" ? "Preferences saved" : "Đã lưu tùy chọn",
        language === "en" ? "Notification settings updated." : "Đã lưu tùy chọn thông báo."
      );
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  const userEmail = user?.email || "minhan@example.com";

  if (!isSettingsTab) {
    return (
      <div className="account-page-wrapper">
        <div className="account-page-head">
          <h1>{language === "en" ? "Personal info" : "Thông tin cá nhân"}</h1>
          <p>{language === "en" ? "Update your basic profile information." : "Cập nhật thông tin hồ sơ cơ bản của bạn."}</p>
        </div>

        <section className="account-card account-card-full">
          <header className="card-header">
            <h2>{language === "en" ? "Basic profile" : "Hồ sơ cơ bản"}</h2>
          </header>
          <form onSubmit={handleSavePersonalProfile}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px", marginBottom: "18px" }}>
              <div className="field">
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                  {language === "en" ? "Display name" : "Tên hiển thị"}
                </label>
                <input
                  type="text"
                  className="input"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  style={{ width: "100%", height: "42px", padding: "0 14px", border: "1px solid #cddfee", borderRadius: "10px", fontSize: "14px", color: "#052659" }}
                />
              </div>

              <div className="field">
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                  {language === "en" ? "Province / city (optional)" : "Tỉnh / thành phố (không bắt buộc điền)"}
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder={language === "en" ? "e.g., Ho Chi Minh City" : "Ví dụ: TP. Hồ Chí Minh"}
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  style={{ width: "100%", height: "42px", padding: "0 14px", border: "1px solid #cddfee", borderRadius: "10px", fontSize: "14px", color: "#052659" }}
                />
              </div>
            </div>

            <div className="notice info" style={{ background: "#f2f7fd", border: "1px solid #d5e4f5", borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: "#1e3a5f", marginBottom: "12px" }}>
              {language === "en" ? (
                <>Marital status and dependents are managed in <strong>Your finances → Family</strong>.</>
              ) : (
                <>Khảo sát hôn nhân và người phụ thuộc được quản lý tại <strong>Tài chính của bạn → Gia đình</strong>.</>
              )}
            </div>

            <div style={{ marginBottom: "16px" }}>
              <Link to="/user/profile?section=family" className="account-btn account-btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                {language === "en" ? "Open family info" : "Mở thông tin gia đình"}
              </Link>
            </div>

            <div className="notice info" style={{ background: "#f2f7fd", border: "1px solid #d5e4f5", borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: "#1e3a5f", marginBottom: "12px" }}>
              {language === "en" ? (
                <>Age and retirement targets are managed in <strong>Retirement goals</strong>.</>
              ) : (
                <>Tuổi và mục tiêu nghỉ hưu được quản lý tại <strong>Mục tiêu nghỉ hưu</strong>.</>
              )}
            </div>

            <div style={{ marginBottom: "24px" }}>
              <Link to="/user/goal" className="account-btn account-btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                {language === "en" ? "Open retirement goals" : "Mở mục tiêu nghỉ hưu"}
              </Link>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px" }}>
              <button
                type="button"
                className="account-btn account-btn-ghost"
                onClick={() => navigate("/user/dashboard")}
                style={{ background: "transparent", border: 0, color: "#052659", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}
              >
                {language === "en" ? "Cancel" : "Hủy"}
              </button>
              <button type="submit" className="account-btn account-btn-primary" disabled={savingProfile}>
                {savingProfile ? (language === "en" ? "Saving…" : "Đang lưu…") : (language === "en" ? "Update profile" : "Cập nhật hồ sơ")}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="account-page-wrapper">
      <div className="account-page-head">
        <h1>{language === "en" ? "Account & settings" : "Tài khoản & cài đặt"}</h1>
        <p>{language === "en" ? "Manage your information, reminders, and account security." : "Thay đổi thông tin, nhắc việc và bảo mật tài khoản."}</p>
      </div>

      <div className="account-grid">
        {/* Card 1: Thông tin đăng nhập */}
        <section className="account-card">
          <header className="card-header">
            <h2>{language === "en" ? "Sign-in information" : "Thông tin đăng nhập"}</h2>
          </header>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--navy, #052659)", margin: "0 0 6px" }}>{userEmail}</p>
          <p style={{ fontSize: "13px", color: "var(--muted, #64748B)", margin: "0 0 20px" }}>{language === "en" ? "An Huu Member Account · Verified" : "Tài khoản hội viên An Hưu · Đã xác thực"}</p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="account-btn account-btn-secondary" onClick={() => setEmailModalOpen(true)}>
              {language === "en" ? "Change email" : "Đổi email"}
            </button>
            <button type="button" className="account-btn account-btn-secondary" onClick={() => setPasswordModalOpen(true)}>
              {language === "en" ? "Change password" : "Đổi mật khẩu"}
            </button>
          </div>
        </section>

        {/* Card 2: Tùy chọn thông báo */}
        <section className="account-card">
          <header className="card-header">
            <h2>{language === "en" ? "Notification options" : "Tùy chọn thông báo"}</h2>
          </header>
          <form onSubmit={handleSavePreferences}>
            <label className="check" style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", color: "var(--text, #10385b)" }}>
              <input
                type="checkbox"
                name="reminder"
                checked={reminder}
                onChange={e => setReminder(e.target.checked)}
                style={{ accentColor: "var(--primary, #334DAF)", width: "18px", height: "18px" }}
              />
              <span>{language === "en" ? "Remind monthly contribution updates" : "Nhắc cập nhật khoản góp mỗi tháng"}</span>
            </label>

            <label className="check" style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", color: "var(--text, #10385b)", marginTop: "14px" }}>
              <input
                type="checkbox"
                name="news"
                checked={news}
                onChange={e => setNews(e.target.checked)}
                style={{ accentColor: "var(--primary, #334DAF)", width: "18px", height: "18px" }}
              />
              <span>{language === "en" ? "Receive content about using An Huu" : "Nhận nội dung về sử dụng An Hưu"}</span>
            </label>

            <p style={{ fontSize: "12px", color: "var(--muted, #64748b)", margin: "16px 0 20px" }}>
              {language === "en" ? "Notification preferences are synchronized with your account." : "Tùy chọn thông báo được đồng bộ với tài khoản của bạn."}
            </p>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                className="account-btn account-btn-ghost"
                onClick={() => { setReminder(true); setNews(false); }}
                style={{ background: "transparent", border: 0, color: "var(--navy, #052659)", cursor: "pointer", fontSize: "14px" }}
              >
                {language === "en" ? "Cancel" : "Hủy"}
              </button>
              <button type="submit" className="account-btn account-btn-primary" disabled={savingPrefs}>
                {savingPrefs ? (language === "en" ? "Saving…" : "Đang lưu…") : (language === "en" ? "Save options" : "Lưu tùy chọn")}
              </button>
            </div>
          </form>
        </section>

        {/* Card 3: Quản lý phiên */}
        <section className="account-card account-card-full">
          <header className="card-header">
            <h2>{language === "en" ? "Session management" : "Quản lý phiên"}</h2>
          </header>
          <p style={{ fontSize: "14px", color: "var(--text, #10385b)", margin: "0 0 6px" }}>
            {language === "en" ? "Current session · This browser" : "Phiên hiện tại · Trình duyệt này"}
          </p>
          <p style={{ fontSize: "12px", color: "var(--muted, #64748b)", margin: "0 0 20px" }}>
            {language === "en" ? "Log out from this device to protect your account." : "Đăng xuất khỏi thiết bị này để bảo mật tài khoản."}
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button type="button" className="account-btn account-btn-secondary" onClick={handleLogout}>
              {language === "en" ? "Log out" : "Đăng xuất"}
            </button>
          </div>
        </section>
      </div>

      {/* Modals for Change Email and Change Password */}
      <Modal open={emailModalOpen} title={language === "en" ? "Change Email" : "Đổi email"} onClose={() => setEmailModalOpen(false)}>
        <AccountProfilePanel />
        <div style={{ marginTop: "16px", textAlign: "right" }}>
          <Button variant="secondary" onClick={() => setEmailModalOpen(false)}>{language === "en" ? "Close" : "Đóng"}</Button>
        </div>
      </Modal>

      <Modal open={passwordModalOpen} title={language === "en" ? "Change Password" : "Đổi mật khẩu"} onClose={() => setPasswordModalOpen(false)}>
        <AccountSecurityPanel />
        <div style={{ marginTop: "16px", textAlign: "right" }}>
          <Button variant="secondary" onClick={() => setPasswordModalOpen(false)}>{language === "en" ? "Close" : "Đóng"}</Button>
        </div>
      </Modal>
    </div>
  );
}
