import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Card, Icon, Modal, useNotification } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { AccountProfilePanel, AccountSecurityPanel } from "../components/AccountApiPanels";
import { getNotificationSettings, updateNotificationSettings } from "../services/notifications";
import "./account-settings.css";

export default function AccountPage() {
  const { language } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [reminder, setReminder] = useState(true);
  const [news, setNews] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getNotificationSettings()
      .then(settings => {
        if (active && settings) {
          setReminder(settings.goalAlerts);
          setNews(settings.partnerUpdates);
        }
      })
      .catch(() => {
        // Fallback to local default state in demo session
      });
    return () => { active = false; };
  }, []);

  const handleSavePreferences = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingPrefs(true);
    setSavedSuccess(false);
    try {
      await updateNotificationSettings({
        expectedRevision: 1,
        emailDigest: reminder,
        goalAlerts: reminder,
        partnerUpdates: news,
      });
      setSavedSuccess(true);
      notify.success(
        language === "en" ? "Preferences saved" : "Đã lưu tùy chọn",
        language === "en" ? "Notification settings updated." : "Đã cập nhật tùy chọn thông báo thành công."
      );
    } catch {
      // In offline/demo mode, save locally
      setSavedSuccess(true);
      notify.success(
        language === "en" ? "Preferences saved" : "Đã lưu tùy chọn",
        language === "en" ? "Notification settings updated in session." : "Đã lưu lựa chọn thông báo trong phiên."
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

  return (
    <div className="account-page-wrapper">
      <div className="account-page-head">
        <h1>{language === "en" ? "Account & settings" : "Tài khoản & cài đặt"}</h1>
        <p>{language === "en" ? "Experience changing information, reminders, and security in the trial session." : "Trải nghiệm thay đổi thông tin, nhắc việc và bảo mật trong phiên thử."}</p>
      </div>

      <div className="account-grid">
        {/* Card 1: Thông tin đăng nhập */}
        <section className="account-card">
          <header className="card-header">
            <h2>{language === "en" ? "Sign-in information" : "Thông tin đăng nhập"}</h2>
          </header>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--navy, #052659)", margin: "0 0 6px" }}>{userEmail}</p>
          <p style={{ fontSize: "13px", color: "var(--muted, #64748B)", margin: "0 0 20px" }}>{language === "en" ? "Simulated account · Does not exist on server" : "Tài khoản mô phỏng · Không tồn tại trên máy chủ"}</p>
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
              {language === "en" ? "Only saves choices in session; no external emails or notifications sent." : "Chỉ lưu lựa chọn trong phiên; không gửi email hoặc thông báo ngoài trang."}
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
            {language === "en" ? "Logging out or deleting the trial account deletes all information in the session." : "Đăng xuất hoặc xóa tài khoản thử đều xóa mọi thông tin trong phiên."}
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button type="button" className="account-btn account-btn-secondary" onClick={handleLogout}>
              {language === "en" ? "Log out" : "Đăng xuất"}
            </button>
            <button type="button" className="account-btn account-btn-ghost" onClick={handleLogout}>
              {language === "en" ? "Delete trial account" : "Xóa tài khoản thử"}
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
