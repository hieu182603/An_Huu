import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button, useNotification } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { AccountSecurityPanel } from "../components/AccountApiPanels";
import { getNotificationSettings, updateNotificationSettings } from "../services/notifications";
import "./account-settings.css";
import "./remaining-user-sync.css";
import ResponsiveDialog from "../components/ResponsiveDialog";
import {authenticatedRequest, updateSessionUser, type ApiUser} from "../services/api";
import type {NotificationSettings} from "../services/notifications";

export default function AccountPage() {
  const { language } = useI18n();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const isSettingsTab = ["settings", "reports", "security"].includes(new URLSearchParams(location.search).get("tab") ?? "");

  const [displayName, setDisplayName] = useState(user?.name || "");
  const [city, setCity] = useState("");
  const [account,setAccount]=useState<ApiUser|null>(null);
  const [accountError,setAccountError]=useState("");
  const [prefs,setPrefs]=useState<NotificationSettings|null>(null);
  const [prefsError,setPrefsError]=useState("");
  const [accountAttempt,setAccountAttempt]=useState(0);
  const [prefsAttempt,setPrefsAttempt]=useState(0);
  const [emailDigest,setEmailDigest]=useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [reminder, setReminder] = useState(true);
  const [news, setNews] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");



  useEffect(() => {
    let active=true;setAccountError("");setAccount(null);
    authenticatedRequest<ApiUser>("/me",undefined,"GET",undefined,{skipCache:true}).then(row=>{if(active){setAccount(row);setDisplayName(row.fullName);setCity(row.city??"");}}).catch(e=>{if(active)setAccountError(e.message);});
    return()=>{active=false;};
  }, [accountAttempt, user?.id]);

  useEffect(() => {
    let active=true;setPrefsError("");setPrefs(null);
    getNotificationSettings().then(row=>{if(active){setPrefs(row);setReminder(row.goalAlerts);setNews(row.partnerUpdates);setEmailDigest(row.emailDigest);}}).catch(e=>{if(active)setPrefsError(e.message);});
    return()=>{active=false;};
  }, [prefsAttempt, user?.id]);

  const handleSavePersonalProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!account||savingProfile)return;
    setAccountError("");setSavingProfile(true);
    try {
      const row=await authenticatedRequest<ApiUser>("/me",{expectedRevision:account.revision,changes:{fullName:displayName.trim(),city:city.trim()||null}},"PATCH");
      setAccount(row);setDisplayName(row.fullName);setCity(row.city??"");updateSessionUser(row);
      notify.success(
        language === "en" ? "Profile updated" : "Đã cập nhật hồ sơ",
        language === "en" ? "Your basic profile information has been saved." : "Thông tin hồ sơ cơ bản đã được lưu."
      );
    } catch(e) {setAccountError(e instanceof Error?e.message:"Không thể lưu hồ sơ.");} finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if(!prefs||savingPrefs)return;
    setPrefsError("");setSavingPrefs(true);
    try {
      const saved=await updateNotificationSettings({
        expectedRevision: prefs.revision,
        emailDigest,
        goalAlerts: reminder,
        partnerUpdates: news,
      });
      setPrefs(saved);
      notify.success(
        language === "en" ? "Preferences saved" : "Đã lưu tùy chọn",
        language === "en" ? "Notification settings updated." : "Đã cập nhật tùy chọn thông báo thành công."
      );
    } catch(e) {setPrefsError(e instanceof Error?e.message:"Không thể lưu tùy chọn.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);setLogoutError("");
    try {
      await logout();
      navigate("/");
    } catch(e) {
      setLogoutError(e instanceof Error?e.message:language==="en"?"Could not log out":"Chưa đăng xuất được");
    } finally {setLoggingOut(false);}
  };

  const userEmail = user?.email || "—";

  if (!isSettingsTab) {
    return (
      <div className="account-page-wrapper account-personal-page">
        <div className="account-page-head">
          <h1>{language === "en" ? "Personal info" : "Thông tin cá nhân"}</h1>
          <p>{language === "en" ? "Update your basic profile information." : "Cập nhật thông tin hồ sơ cơ bản của bạn."}</p>
        </div>

        <section className="account-card account-card-full">
          <header className="card-header">
            <h2>{language === "en" ? "Basic profile" : "Hồ sơ cơ bản"}</h2>
          </header>
          {accountError&&<div role="alert">{accountError}<button type="button" onClick={()=>setAccountAttempt(n=>n+1)}>{language==="en"?"Reload profile":"Tải lại hồ sơ"}</button></div>}
          {!account&&!accountError&&<p role="status">{language==="en"?"Loading profile…":"Đang tải hồ sơ…"}</p>}
          <form onSubmit={handleSavePersonalProfile}><fieldset disabled={!account||savingProfile} style={{border:0,padding:0,margin:0,minWidth:0}}>
            <div className="account-personal-fields" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px", marginBottom: "18px" }}>
              <div className="field">
                <label htmlFor="account-display-name" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                  {language === "en" ? "Display name" : "Tên hiển thị"}
                </label>
                <input
                  type="text"
                  className="input"
                  id="account-display-name" required maxLength={120} value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  style={{ width: "100%", height: "42px", padding: "0 14px", border: "1px solid #cddfee", borderRadius: "10px", fontSize: "14px", color: "#052659" }}
                />
              </div>

              <div className="field">
                <label htmlFor="account-city" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#052659", marginBottom: "6px" }}>
                  {language === "en" ? "Province / city (optional)" : "Tỉnh / thành phố (không bắt buộc điền)"}
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder={language === "en" ? "e.g., Ho Chi Minh City" : "Ví dụ: TP. Hồ Chí Minh"}
                  id="account-city" maxLength={120} value={city}
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

            <div className="account-personal-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px" }}>
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
          </fieldset></form>
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
          <p style={{ fontSize: "13px", color: "var(--muted, #64748B)", margin: "0 0 20px" }}>{language === "en" ? "An Huu Member Account" : "Tài khoản hội viên An Hưu"}</p>
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
          {prefsError&&<div role="alert">{prefsError}<button type="button" onClick={()=>setPrefsAttempt(n=>n+1)}>{language==="en"?"Reload options":"Tải lại tùy chọn"}</button></div>}
          {!prefs&&!prefsError&&<p role="status">{language==="en"?"Loading options…":"Đang tải tùy chọn…"}</p>}
          <form onSubmit={handleSavePreferences}><fieldset disabled={!prefs||savingPrefs} style={{border:0,padding:0,margin:0,minWidth:0}}>
            <label className="check" style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", color: "var(--text, #10385b)", marginBottom: "14px" }}>
              <input type="checkbox" checked={emailDigest} onChange={e=>setEmailDigest(e.target.checked)} style={{ accentColor: "var(--primary, #334DAF)", width: "18px", height: "18px", flexShrink: 0 }} />
              <span>{language==="en"?"Email digest preference":"Tùy chọn email tổng hợp"}</span>
            </label>
            <label className="check" style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", color: "var(--text, #10385b)" }}>
              <input
                type="checkbox"
                name="reminder"
                checked={reminder}
                onChange={e => setReminder(e.target.checked)}
                style={{ accentColor: "var(--primary, #334DAF)", width: "18px", height: "18px" }}
              />
              <span>{language === "en" ? "Remind monthly contribution updates" : "Nhắc cập nhật khoản góp mỗi tháng"}<small style={{ display: "block", color: "#64748b", fontSize: "12px" }}>{language === "en" ? "In-app notification from the 25th each month when you have a main plan and have not recorded the month yet. No email." : "Thông báo trong ứng dụng từ ngày 25 hằng tháng khi bạn có kế hoạch chính và chưa ghi nhận tháng đó. Không gửi email."}</small></span>
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
              {language === "en" ? "Preferences are saved to your account. Unavailable channels do not send notifications." : "Lưu lựa chọn theo tài khoản. Kênh nào chưa khả dụng sẽ chưa gửi thông báo."}
            </p>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                className="account-btn account-btn-ghost"
                onClick={() => { if(prefs){setReminder(prefs.goalAlerts);setNews(prefs.partnerUpdates);setEmailDigest(prefs.emailDigest);} }}
                style={{ background: "transparent", border: 0, color: "var(--navy, #052659)", cursor: "pointer", fontSize: "14px" }}
              >
                {language === "en" ? "Cancel" : "Hủy"}
              </button>
              <button type="submit" className="account-btn account-btn-primary" disabled={savingPrefs}>
                {savingPrefs ? (language === "en" ? "Saving…" : "Đang lưu…") : (language === "en" ? "Save options" : "Lưu tùy chọn")}
              </button>
            </div>
          </fieldset></form>
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
            <button type="button" className="account-btn account-btn-secondary" onClick={()=>{setLogoutError("");setLogoutOpen(true);}}>
              {language === "en" ? "Log out" : "Đăng xuất"}
            </button>
          </div>
        </section>
      </div>

      <ResponsiveDialog className="user-workspace-dialog" open={logoutOpen} title={language === "en" ? "Sign out of An Huu?" : "Đăng xuất khỏi An Hưu?"} initialFocusSelector=".logout-cancel" onClose={()=>{if(!loggingOut)setLogoutOpen(false);}}>
        <p>{language === "en" ? "Your saved information and plans stay in your account. You can sign in again to continue." : "Thông tin và kế hoạch đã lưu vẫn ở trong tài khoản. Bạn có thể đăng nhập lại để tiếp tục."}</p>
        {logoutError&&<p role="alert">{logoutError}</p>}
        <div className="saved-actions"><Button className="logout-cancel" variant="secondary" disabled={loggingOut} onClick={()=>setLogoutOpen(false)}>{language==="en"?"Stay signed in":"Ở lại"}</Button><Button disabled={loggingOut} onClick={()=>void handleLogout()}>{loggingOut?(language==="en"?"Signing out…":"Đang đăng xuất…"):(language==="en"?"Sign out":"Đăng xuất")}</Button></div>
      </ResponsiveDialog>

      {/* Modals for Change Email and Change Password */}
      <ResponsiveDialog className="user-workspace-dialog" open={emailModalOpen} title={language === "en" ? "Change Email" : "Đổi email"} onClose={() => setEmailModalOpen(false)}>
        <p>{language==="en"?"Sign-in email changes require ownership verification with support. No email address has been changed.":"Đổi email đăng nhập cần xác minh chủ tài khoản qua Hỗ trợ. Email của bạn chưa được thay đổi."}</p><p>{userEmail}</p><Link className="account-btn account-btn-primary" to={"/user/support?category="+encodeURIComponent("Tài khoản")+"&subject="+encodeURIComponent("Yêu cầu thay đổi email đăng nhập")}>{language==="en"?"Create support request":"Tạo yêu cầu hỗ trợ"}</Link>
        <div style={{ marginTop: "16px", textAlign: "right" }}>
          <Button variant="secondary" onClick={() => setEmailModalOpen(false)}>{language === "en" ? "Close" : "Đóng"}</Button>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog className="user-workspace-dialog" open={passwordModalOpen} title={language === "en" ? "Change Password" : "Đổi mật khẩu"} onClose={() => setPasswordModalOpen(false)}>
        <AccountSecurityPanel />
        <div style={{ marginTop: "16px", textAlign: "right" }}>
          <Button variant="secondary" onClick={() => setPasswordModalOpen(false)}>{language === "en" ? "Close" : "Đóng"}</Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
