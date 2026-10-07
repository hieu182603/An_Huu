import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Checkbox, Icon, Switch, useNotification } from "../../../components/ui";
import { authenticatedRequest } from "../../../services/api";
import { useI18n } from "../../../i18n";
import type { NotificationSettings } from "./types";

export default function NotificationSettingsPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NotificationSettings>({
    emailEnabled: true,
    inAppEnabled: true,
    smsEnabled: false,
    notifyAccount: true,
    notifySupport: true,
    notifyFinancial: true,
    notifySystem: true,
  });

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authenticatedRequest<NotificationSettings>("/admin/settings/notifications", undefined, "GET", undefined, { skipCache: true });
      setForm(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : isEn ? "Failed to load notification settings." : "Không thể tải cấu hình thông báo.";
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
      const updated = await authenticatedRequest<NotificationSettings>("/admin/settings/notifications", form, "PUT");
      setForm(updated);
      notify.success(
        isEn ? "Success" : "Thành công",
        isEn ? "Notification delivery rules updated successfully." : "Cấu hình gửi thông báo đã được lưu thành công."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : isEn ? "Failed to save notification settings." : "Lỗi khi lưu cấu hình thông báo.";
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
          <h1>{isEn ? "Notification Channels" : "Cấu hình thông báo"}</h1>
          <p>
            {isEn
              ? "Enable notification dispatch channels and define automated event routing rules."
              : "Quản lý các kênh gửi tin nhắn (Email, In-app, SMS) và quy tắc kích hoạt thông báo tự động."}
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
        <p style={{ padding: 20 }}>{isEn ? "Loading notification rules..." : "Đang tải cấu hình thông báo..."}</p>
      ) : error ? null : (
        <Card className="system-settings-card">
          <form onSubmit={handleSubmit} className="system-settings-form">
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: "var(--color-primary-700)" }}>
              {isEn ? "1. Delivery Channels" : "1. Các kênh gửi tin"}
            </h3>

            <div className="system-setting-item is-switch-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Transactional Email Dispatch" : "Kênh Email tự động"}</strong>
                <p>{isEn ? "Deliver security OTPs, statement summaries, and customer replies." : "Gửi mã xác thực, tóm tắt kế hoạch và phản hồi hỗ trợ qua email."}</p>
              </div>
              <Switch
                label={isEn ? "Email Channel" : "Kênh Email"}
                checked={form.emailEnabled}
                onChange={(checked) => setForm((prev) => ({ ...prev, emailEnabled: checked }))}
                disabled={saving}
              />
            </div>

            <div className="system-setting-item is-switch-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "In-App Realtime Notifications" : "Thông báo nội bộ (In-app Bell)"}</strong>
                <p>{isEn ? "Push alerts directly to bell icon for logged-in sessions." : "Hiển thị thông báo tức thì trên thanh điều hướng người dùng qua WebSocket."}</p>
              </div>
              <Switch
                label={isEn ? "In-App Channel" : "Kênh In-app"}
                checked={form.inAppEnabled}
                onChange={(checked) => setForm((prev) => ({ ...prev, inAppEnabled: checked }))}
                disabled={saving}
              />
            </div>

            <div className="system-setting-item is-switch-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "SMS Gateway Gateway" : "Kênh tin nhắn SMS Brandname"}</strong>
                <p>{isEn ? "Send high-priority OTP and security warnings to mobile numbers." : "Gửi tin nhắn SMS bảo mật và cảnh báo khẩn cấp tới số điện thoại."}</p>
              </div>
              <Switch
                label={isEn ? "SMS Channel" : "Kênh SMS"}
                checked={form.smsEnabled}
                onChange={(checked) => setForm((prev) => ({ ...prev, smsEnabled: checked }))}
                disabled={saving}
              />
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "24px 0 12px", color: "var(--color-primary-700)" }}>
              {isEn ? "2. Automated Event Categories" : "2. Sự kiện kích hoạt thông báo"}
            </h3>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Security & Account Events" : "Bảo mật & Tài khoản"}</strong>
                <p>{isEn ? "Notify users on logins from new IP, password changes, and email updates." : "Gửi cảnh báo khi phát hiện đăng nhập mới, đổi mật khẩu hoặc cập nhật email."}</p>
              </div>
              <div className="system-setting-item-control">
                <Checkbox
                  label={isEn ? "Enable account event notifications" : "Bật thông báo sự kiện tài khoản"}
                  checked={form.notifyAccount}
                  onChange={(checked) => setForm((prev) => ({ ...prev, notifyAccount: checked }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Support & Customer Inquiries" : "Yêu cầu hỗ trợ khách hàng"}</strong>
                <p>{isEn ? "Notify user when an agent replies to their support ticket." : "Gửi thông báo khi chuyên viên phản hồi thắc mắc hoặc cập nhật phiếu hỗ trợ."}</p>
              </div>
              <div className="system-setting-item-control">
                <Checkbox
                  label={isEn ? "Enable support ticket notifications" : "Bật thông báo xử lý hỗ trợ"}
                  checked={form.notifySupport}
                  onChange={(checked) => setForm((prev) => ({ ...prev, notifySupport: checked }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Financial Assumptions & Plan Reminders" : "Giả định tài chính & Nhắc nhở kế hoạch"}</strong>
                <p>{isEn ? "Alert users when benchmark assumptions change or when target checks are due." : "Gửi thông báo khi chỉ số vĩ mô thay đổi hoặc đến hạn rà soát kế hoạch hưu trí."}</p>
              </div>
              <div className="system-setting-item-control">
                <Checkbox
                  label={isEn ? "Enable financial plan reminders" : "Bật nhắc nhở kế hoạch tài chính"}
                  checked={form.notifyFinancial}
                  onChange={(checked) => setForm((prev) => ({ ...prev, notifyFinancial: checked }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "System Operations & Maintenance" : "Bảo trì & Vận hành"}</strong>
                <p>{isEn ? "Broadcast scheduled downtime and feature updates to users." : "Gửi thông báo trước các đợt bảo trì nâng cấp hoặc công bố tính năng mới."}</p>
              </div>
              <div className="system-setting-item-control">
                <Checkbox
                  label={isEn ? "Enable system broadcast alerts" : "Bật thông báo bảo trì hệ thống"}
                  checked={form.notifySystem}
                  onChange={(checked) => setForm((prev) => ({ ...prev, notifySystem: checked }))}
                  disabled={saving}
                />
              </div>
            </div>

            <footer className="system-setting-footer">
              <span>
                <Icon name="info" size="small" />{" "}
                {isEn
                  ? "Notification settings take effect immediately across all background workers."
                  : "Cấu hình gửi thông báo có hiệu lực tức thì trên toàn bộ tiến trình gửi email."}
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
