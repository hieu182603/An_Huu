import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Alert, Badge, Button, Card, Icon, Input, useNotification } from "./ui";
import { authenticatedRequest, forgetSession, updateSessionUser, validPassword, type ApiUser } from "../services/api";
import { useI18n } from "../i18n";

const message = (error: unknown, language: "vi" | "en") => {
  if (error instanceof Error) return error.message;
  return language === "en" ? "Request could not be processed. Please try again." : "Không thể thực hiện yêu cầu. Vui lòng thử lại.";
};

export function AccountProfilePanel() {
  const { language } = useI18n();
  const { notify } = useNotification();
  const [account, setAccount] = useState<ApiUser | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", city: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = !!account && (form.fullName !== account.fullName || form.phone !== (account.phone || "") || form.city !== (account.city || ""));

  const accept = (next: ApiUser) => {
    setAccount(next);
    setForm({ fullName: next.fullName, phone: next.phone || "", city: next.city || "" });
    updateSessionUser(next);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      accept(await authenticatedRequest<ApiUser>("/me"));
    } catch (e) {
      setError(message(e, language));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    if (dirty) window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!account || saving) return;
    if (!form.fullName.trim()) {
      return setError(language === "en" ? "Please enter your full name." : "Vui lòng nhập họ tên.");
    }
    const phone = form.phone.replace(/[ ()-]/g, "");
    if (phone && !/^(?:0|\+84)[35789]\d{8}$/.test(phone)) {
      return setError(language === "en" ? "Please enter a valid Vietnamese phone number." : "Vui lòng nhập số điện thoại di động Việt Nam hợp lệ.");
    }
    setSaving(true);
    setError("");
    try {
      accept(await authenticatedRequest<ApiUser>("/me", {
        expectedRevision: account.revision,
        changes: { fullName: form.fullName.trim(), phone: phone || null, city: form.city.trim() || null },
      }, "PATCH"));
      notify.success(
        language === "en" ? "Account Details Saved" : "Đã lưu thông tin tài khoản",
        language === "en" ? "New details applied across your active session." : "Thông tin mới sẽ được áp dụng cho toàn bộ phiên đăng nhập của bạn."
      );
    } catch (e) {
      setError(message(e, language));
    } finally {
      setSaving(false);
    }
  };

  const avatar = async (file: File | null) => {
    if (!account || saving) return;
    if (dirty) {
      return setError(language === "en" ? "Please save personal information before changing photo." : "Hãy lưu thông tin cá nhân trước khi đổi ảnh.");
    }
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      return setError(language === "en" ? "Please choose a JPEG, PNG or WebP image under 5 MB." : "Vui lòng chọn ảnh định dạng JPEG, PNG hoặc WebP, dung lượng tối đa 5 MB.");
    }
    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      if (file) {
        body.append("file", file);
        body.append("expectedRevision", String(account.revision));
      }
      accept(await authenticatedRequest<ApiUser>(
        "/me/avatar",
        file ? body : { expectedRevision: account.revision },
        file ? "POST" : "DELETE"
      ));
      notify.success(
        file
          ? (language === "en" ? "Avatar Updated" : "Đã cập nhật ảnh đại diện")
          : (language === "en" ? "Avatar Removed" : "Đã gỡ ảnh đại diện")
      );
    } catch (e) {
      setError(message(e, language));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="account-card">
      <header>
        <div>
          <h2>{language === "en" ? "Personal Information" : "Thông tin cá nhân"}</h2>
          <p>{language === "en" ? "Manage display name, avatar, and contact details." : "Quản lý tên hiển thị, hình đại diện và thông tin liên hệ."}</p>
        </div>
        {account && (
          <Badge tone={account.emailVerifiedAt ? "success" : "warning"}>
            {account.emailVerifiedAt
              ? (language === "en" ? "Email Verified" : "Email đã xác minh")
              : (language === "en" ? "Email Unverified" : "Email chưa xác minh")}
          </Badge>
        )}
      </header>

      {error && (
        <Alert tone="danger" title={language === "en" ? "Could not complete" : "Chưa thể hoàn tất"}>
          {error}
          <Button variant="ghost" onClick={() => { if (!dirty || window.confirm(language === "en" ? "Reloading will discard unsaved changes. Continue?" : "Tải lại sẽ bỏ các thay đổi chưa lưu. Tiếp tục?")) void load(); }}>
            {language === "en" ? "Reload" : "Tải lại"}
          </Button>
        </Alert>
      )}

      {loading ? (
        <p role="status" style={{ padding: "20px 0", color: "#64748b" }}>
          {language === "en" ? "Loading account details..." : "Đang tải thông tin tài khoản…"}
        </p>
      ) : account && (
        <>
          {/* Avatar Row */}
          <div className="profile-avatar-row">
            <div className="profile-avatar-frame">
              {account.avatarUrl ? (
                <img src={account.avatarUrl} alt={account.fullName} className="profile-avatar-img" />
              ) : (
                <span className="profile-avatar-initial">{(account.fullName || "U").slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="profile-avatar-meta">
              <strong>{language === "en" ? "Profile Photo" : "Ảnh đại diện"}</strong>
              <small>{language === "en" ? "Supports JPG, PNG or WebP (Max 5 MB)" : "Hỗ trợ định dạng JPG, PNG hoặc WebP (Tối đa 5 MB)"}</small>
              <div className="profile-avatar-actions">
                <label className="profile-upload-btn">
                  <Icon name="upload" size="small" />
                  <span>
                    {account.avatarUrl
                      ? (language === "en" ? "Change Photo" : "Đổi ảnh khác")
                      : (language === "en" ? "Upload Photo" : "Tải ảnh lên")}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={saving || dirty}
                    style={{ display: "none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void avatar(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {account.avatarUrl && (
                  <button
                    type="button"
                    className="profile-remove-btn"
                    disabled={saving || dirty}
                    onClick={() => void avatar(null)}
                  >
                    {language === "en" ? "Remove Photo" : "Gỡ ảnh"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={save}>
            <fieldset disabled={saving} className="account-api-fields">
              <div className="account-form-grid">
                <Input
                  label={language === "en" ? "Full Name" : "Họ và tên"}
                  value={form.fullName}
                  onChange={fullName => setForm({ ...form, fullName })}
                  autoComplete="name"
                  placeholder={language === "en" ? "Enter your full name" : "Nhập họ và tên"}
                />
                <Input
                  label={language === "en" ? "Account Email" : "Email tài khoản"}
                  value={account.email}
                  disabled
                  helper={language === "en" ? "Email used for authentication and security." : "Email dùng để đăng nhập và bảo mật tài khoản."}
                />
                <Input
                  label={language === "en" ? "Phone Number" : "Số điện thoại"}
                  value={form.phone}
                  onChange={phone => setForm({ ...form, phone })}
                  autoComplete="tel"
                  placeholder={language === "en" ? "e.g. 0912345678" : "Ví dụ: 0912345678"}
                />
                <Input
                  label={language === "en" ? "Province / City" : "Tỉnh / thành phố"}
                  value={form.city}
                  onChange={city => setForm({ ...form, city })}
                  autoComplete="address-level1"
                  placeholder={language === "en" ? "e.g. Ho Chi Minh City" : "Ví dụ: TP. Hồ Chí Minh"}
                />
              </div>

              <div className="account-save-row">
                <span role="status" className="save-status-text">
                  {dirty
                    ? (language === "en" ? "Unsaved changes." : "Có thay đổi chưa lưu.")
                    : (language === "en" ? "All information synced." : "Thông tin đã được đồng bộ.")}
                </span>
                <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
                  {language === "en" ? "Save Personal Info" : "Lưu thông tin cá nhân"}
                </Button>
              </div>
            </fieldset>
          </form>
        </>
      )}
    </Card>
  );
}

export function AccountSecurityPanel() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const finish = (title: string) => {
    forgetSession();
    notify.success(
      title,
      language === "en" ? "Please sign in again to continue." : "Vui lòng đăng nhập lại để tiếp tục."
    );
    navigate("/login", { replace: true });
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!currentPassword) {
      return setError(language === "en" ? "Please enter your current password." : "Vui lòng nhập mật khẩu hiện tại.");
    }
    if (!validPassword(password)) {
      return setError(language === "en" ? "New password requires at least 12 characters and max 72 bytes." : "Mật khẩu mới cần ít nhất 12 ký tự và tối đa 72 byte UTF-8.");
    }
    if (password !== confirmPassword) {
      return setError(language === "en" ? "Password confirmation does not match." : "Mật khẩu xác nhận không khớp.");
    }
    if (password === currentPassword) {
      return setError(language === "en" ? "New password must be different from current password." : "Mật khẩu mới phải khác mật khẩu hiện tại.");
    }
    setBusy(true);
    try {
      await authenticatedRequest("/auth/change-password", { currentPassword, password });
      finish(language === "en" ? "Password Changed Successfully" : "Đã đổi mật khẩu thành công");
    } catch (e) {
      setError(message(e, language));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="account-card">
      <header className="account-card-header">
        <div>
          <h2>{language === "en" ? "Change Password" : "Đổi mật khẩu"}</h2>
          <p>
            {language === "en"
              ? "New password requires at least 12 characters. After changing password, all other active sessions will be logged out."
              : "Mật khẩu mới cần tối thiểu 12 ký tự. Sau khi đổi mật khẩu thành công, các phiên đăng nhập khác sẽ được đăng xuất."}
          </p>
        </div>
      </header>

      {error && <Alert tone="danger" title={language === "en" ? "Could not execute" : "Không thể thực hiện"}>{error}</Alert>}

      <form onSubmit={changePassword} className="security-form">
        <fieldset disabled={busy} className="account-api-fields">
          {/* Current password field */}
          <div className="security-field-single">
            <Input
              label={language === "en" ? "Current Password" : "Mật khẩu hiện tại"}
              type="password"
              placeholder={language === "en" ? "Enter current password" : "Nhập mật khẩu đang sử dụng"}
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
          </div>

          {/* New password & confirm password side by side */}
          <div className="security-fields-grid">
            <Input
              label={language === "en" ? "New Password" : "Mật khẩu mới"}
              helper={language === "en" ? "Minimum 12 characters" : "Tối thiểu 12 ký tự"}
              type="password"
              placeholder={language === "en" ? "Enter new password" : "Nhập mật khẩu mới"}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <Input
              label={language === "en" ? "Confirm New Password" : "Xác nhận mật khẩu mới"}
              helper={language === "en" ? "Re-enter new password" : "Nhập lại mật khẩu mới"}
              type="password"
              placeholder={language === "en" ? "Confirm new password" : "Xác nhận lại mật khẩu"}
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
          </div>

          <div className="account-save-row">
            <Link to="/forgot-password" className="forgot-password-inline-link">
              {language === "en" ? "Forgot password?" : "Quên mật khẩu?"}
            </Link>
            <Button type="submit" variant="primary" loading={busy}>
              {language === "en" ? "Change Password" : "Đổi mật khẩu"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
