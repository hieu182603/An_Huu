import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Checkbox, Icon, Input, Switch, useNotification } from "../../../components/ui";
import { authenticatedRequest } from "../../../services/api";
import { useI18n } from "../../../i18n";
import type { SecuritySettings } from "./types";

export default function SecuritySettingsPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<SecuritySettings>({
    sessionTimeoutMinutes: 60,
    maxLoginAttempts: 5,
    accountLockMinutes: 15,
    passwordMinLength: 8,
    passwordRequireUppercase: true,
    passwordRequireLowercase: true,
    passwordRequireNumber: true,
    passwordRequireSpecial: true,
    admin2faRequired: true,
  });

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authenticatedRequest<SecuritySettings>("/admin/settings/security", undefined, "GET", undefined, { skipCache: true });
      setForm(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : isEn ? "Failed to load security settings." : "Không thể tải cấu hình bảo mật.";
      setError(msg);
      notify.error(isEn ? "Error" : "Lỗi", msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || error || saving) return;
    setSaving(true);
    try {
      const updated = await authenticatedRequest<SecuritySettings>("/admin/settings/security", form, "PUT");
      setForm(updated);
      notify.success(
        isEn ? "Success" : "Thành công",
        isEn ? "Security policies updated and applied successfully." : "Chính sách bảo mật đã được cập nhật thành công."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : isEn ? "Failed to save security settings." : "Lỗi khi lưu chính sách bảo mật.";
      notify.error(isEn ? "Save Failed" : "Lưu thất bại", msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-section">
      <header className="admin-page-header">
        <div>
          <span>ADMIN AREA</span>
          <h1>{isEn ? "Security & Access Control" : "Bảo mật & Truy cập"}</h1>
          <p>
            {isEn
              ? "Session timeouts, rate limiting thresholds, password complexity rules, and MFA enforcement."
              : "Thời hạn phiên đăng nhập, ngưỡng khóa tài khoản, độ phức tạp mật khẩu và xác thực 2 lớp (2FA)."}
          </p>
        </div>
      </header>

      {error && (
        <Alert tone="danger" title={isEn ? "Error" : "Lỗi tải cấu hình"}>
          {error}
          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" onClick={fetchSettings}>
              {isEn ? "Retry" : "Thử lại"}
            </Button>
          </div>
        </Alert>
      )}

      {loading ? (
        <p style={{ padding: 20 }}>{isEn ? "Loading security settings..." : "Đang tải cấu hình bảo mật..."}</p>
      ) : error ? null : (
        <Card className="system-settings-card">
          <form onSubmit={handleSubmit} className="system-settings-form">
            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Session Timeout (Minutes)" : "Thời gian hết hạn phiên (Phút)"}</strong>
                <p>{isEn ? "Inactive duration before authentication token is automatically revoked." : "Thời gian không hoạt động trước khi tài khoản tự động đăng xuất."}</p>
              </div>
              <div className="system-setting-item-control">
                <Input
                  type="number"
                  label={isEn ? "Session Timeout" : "Thời gian hết hạn phiên"}
                  hideLabel
                  value={String(form.sessionTimeoutMinutes)}
                  onChange={(val) => setForm((prev) => ({ ...prev, sessionTimeoutMinutes: parseInt(val, 10) || 15 }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Max Failed Login Attempts" : "Số lần đăng nhập sai tối đa"}</strong>
                <p>{isEn ? "Threshold of consecutive failed passwords before temporary account freeze." : "Số lần nhập sai mật khẩu liên tiếp trước khi khóa tài khoản tạm thời."}</p>
              </div>
              <div className="system-setting-item-control">
                <Input
                  type="number"
                  label={isEn ? "Max Login Attempts" : "Số lần sai tối đa"}
                  hideLabel
                  value={String(form.maxLoginAttempts)}
                  onChange={(val) => setForm((prev) => ({ ...prev, maxLoginAttempts: parseInt(val, 10) || 3 }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Account Lockout Duration (Minutes)" : "Thời gian khóa tài khoản (Phút)"}</strong>
                <p>{isEn ? "Cooldown interval after exceeding maximum password failures." : "Thời gian tài khoản bị tạm khóa sau khi vượt ngưỡng đăng nhập sai."}</p>
              </div>
              <div className="system-setting-item-control">
                <Input
                  type="number"
                  label={isEn ? "Lock Duration" : "Thời gian khóa"}
                  hideLabel
                  value={String(form.accountLockMinutes)}
                  onChange={(val) => setForm((prev) => ({ ...prev, accountLockMinutes: parseInt(val, 10) || 5 }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Minimum Password Length" : "Độ dài mật khẩu tối thiểu"}</strong>
                <p>{isEn ? "Enforced minimum character count on password creation and reset." : "Số lượng ký tự tối thiểu khi người dùng đặt hoặc đổi mật khẩu."}</p>
              </div>
              <div className="system-setting-item-control">
                <Input
                  type="number"
                  label={isEn ? "Min Password Length" : "Độ dài tối thiểu"}
                  hideLabel
                  value={String(form.passwordMinLength)}
                  onChange={(val) => setForm((prev) => ({ ...prev, passwordMinLength: parseInt(val, 10) || 8 }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Password Complexity Requirements" : "Yêu cầu độ phức tạp mật khẩu"}</strong>
                <p>{isEn ? "Mandatory character sets required for secure credentials." : "Các điều kiện bắt buộc đối với mật khẩu người dùng."}</p>
              </div>
              <div className="system-setting-item-control">
                <div style={{ display: "grid", gap: 8 }}>
                  <Checkbox
                    label={isEn ? "Require uppercase character (A-Z)" : "Bắt buộc có chữ hoa (A-Z)"}
                    checked={form.passwordRequireUppercase}
                    onChange={(checked) => setForm((prev) => ({ ...prev, passwordRequireUppercase: checked }))}
                    disabled={saving}
                  />
                  <Checkbox
                    label={isEn ? "Require lowercase character (a-z)" : "Bắt buộc có chữ thường (a-z)"}
                    checked={form.passwordRequireLowercase}
                    onChange={(checked) => setForm((prev) => ({ ...prev, passwordRequireLowercase: checked }))}
                    disabled={saving}
                  />
                  <Checkbox
                    label={isEn ? "Require numerical digit (0-9)" : "Bắt buộc có chữ số (0-9)"}
                    checked={form.passwordRequireNumber}
                    onChange={(checked) => setForm((prev) => ({ ...prev, passwordRequireNumber: checked }))}
                    disabled={saving}
                  />
                  <Checkbox
                    label={isEn ? "Require special character (!@#$%^&*)" : "Bắt buộc có ký tự đặc biệt (!@#$%^&*)"}
                    checked={form.passwordRequireSpecial}
                    onChange={(checked) => setForm((prev) => ({ ...prev, passwordRequireSpecial: checked }))}
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            <div className="system-setting-item is-switch-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Mandatory 2FA for Administrators" : "Bắt buộc 2FA cho Quản trị viên"}</strong>
                <p>{isEn ? "Strictly enforce multi-factor authentication for all ADMIN role accounts." : "Yêu cầu xác thực 2 lớp (2FA/OTP) đối với mọi tài khoản Quản trị viên."}</p>
              </div>
              <Switch
                label={isEn ? "Admin 2FA" : "2FA Quản trị"}
                checked={form.admin2faRequired}
                onChange={(checked) => setForm((prev) => ({ ...prev, admin2faRequired: checked }))}
                disabled={saving}
              />
            </div>

            <footer className="system-setting-footer">
              <span>
                <Icon name="info" size="small" />{" "}
                {isEn
                  ? "Security modifications are audited and applied across active sessions."
                  : "Mọi thay đổi bảo mật được ghi nhận vào nhật ký và áp dụng trực tiếp vào hệ thống."}
              </span>
              <Button type="submit" variant="primary" loading={saving} disabled={saving}>
                {saving ? (isEn ? "Saving..." : "Đang lưu...") : (isEn ? "Save Changes" : "Lưu thay đổi")}
              </Button>
            </footer>
          </form>
        </Card>
      )}
    </div>
  );
}
