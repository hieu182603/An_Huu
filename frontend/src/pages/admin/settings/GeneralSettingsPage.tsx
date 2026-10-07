import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Icon, Input, Select, Switch, useNotification } from "../../../components/ui";
import { authenticatedRequest } from "../../../services/api";
import { useI18n } from "../../../i18n";
import type { GeneralSettings } from "./types";

export default function GeneralSettingsPage() {
  const { language, setLanguage } = useI18n();
  const isEn = language === "en";
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<GeneralSettings>({
    systemName: "An Hưu",
    defaultLanguage: "Tiếng Việt",
    operatingTimezone: "GMT+7 (Việt Nam)",
    supportEmail: "hotro@anhuu.vn",
    maintenanceMode: false,
  });

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authenticatedRequest<GeneralSettings>("/admin/settings/general", undefined, "GET", undefined, { skipCache: true });
      setForm(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : isEn ? "Failed to load settings." : "Không thể tải cài đặt.";
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
    setSaving(true);
    try {
      const updated = await authenticatedRequest<GeneralSettings>("/admin/settings/general", form, "PUT");
      setForm(updated);
      if (updated.defaultLanguage === "English" || updated.defaultLanguage === "en") {
        setLanguage("en");
      } else if (updated.defaultLanguage === "Tiếng Việt" || updated.defaultLanguage === "vi") {
        setLanguage("vi");
      }
      notify.success(
        isEn ? "Success" : "Thành công",
        isEn ? "General system settings updated successfully." : "Cài đặt chung hệ thống đã được lưu thành công."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : isEn ? "Failed to save settings." : "Lỗi khi lưu cài đặt.";
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
          <h1>{isEn ? "General Settings" : "Cài đặt chung"}</h1>
          <p>
            {isEn
              ? "System identifiers, default locale, operational timezone, and maintenance controls."
              : "Cấu hình định danh hệ thống, ngôn ngữ mặc định, múi giờ vận hành và bảo trì."}
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
        <p style={{ padding: 20 }}>{isEn ? "Loading general settings..." : "Đang tải cấu hình..."}</p>
      ) : (
        <Card className="system-settings-card">
          <form onSubmit={handleSubmit} className="system-settings-form">
            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Platform Name" : "Tên hệ thống"}</strong>
                <p>{isEn ? "Displayed across public portals and emails." : "Tên định danh hiển thị trên giao diện và email."}</p>
              </div>
              <div className="system-setting-item-control">
                <Input
                  label={isEn ? "System Name" : "Tên hệ thống"}
                  hideLabel
                  value={form.systemName}
                  onChange={(val) => setForm((prev) => ({ ...prev, systemName: val }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Default Language" : "Ngôn ngữ mặc định"}</strong>
                <p>{isEn ? "Initial language applied for guests and new registrations." : "Ngôn ngữ thiết lập ban đầu cho người dùng mới."}</p>
              </div>
              <div className="system-setting-item-control">
                <Select
                  label={isEn ? "Default Language" : "Ngôn ngữ mặc định"}
                  options={["Tiếng Việt", "English"]}
                  value={form.defaultLanguage === "en" || form.defaultLanguage === "English" ? "English" : "Tiếng Việt"}
                  onChange={(val) => setForm((prev) => ({ ...prev, defaultLanguage: val as GeneralSettings["defaultLanguage"] }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Operating Timezone" : "Múi giờ vận hành"}</strong>
                <p>{isEn ? "Used for financial calculations and audit timestamps." : "Múi giờ quy chuẩn cho các giao dịch và tính toán tài chính."}</p>
              </div>
              <div className="system-setting-item-control">
                <Select
                  label={isEn ? "Operating Timezone" : "Múi giờ vận hành"}
                  options={["GMT+7 (Việt Nam)", "GMT+8 (Singapore/Hong Kong)", "GMT+0 (UTC)"]}
                  value={form.operatingTimezone}
                  onChange={(val) => setForm((prev) => ({ ...prev, operatingTimezone: val }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Support Contact Email" : "Email hỗ trợ tiếp nhận"}</strong>
                <p>{isEn ? "Primary inbox receiving inquiry escalations and feedback." : "Hòm thư nhận thông báo liên hệ và khiếu nại khách hàng."}</p>
              </div>
              <div className="system-setting-item-control">
                <Input
                  type="email"
                  label={isEn ? "Support Email" : "Email hỗ trợ"}
                  hideLabel
                  value={form.supportEmail}
                  onChange={(val) => setForm((prev) => ({ ...prev, supportEmail: val }))}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="system-setting-item is-switch-item">
              <div className="system-setting-item-meta">
                <strong>{isEn ? "Maintenance Mode" : "Chế độ bảo trì hệ thống"}</strong>
                <p>
                  {isEn
                    ? "When enabled, user portal is paused for maintenance. Admin consoles remain accessible."
                    : "Khi kích hoạt, giao diện người dùng tạm khóa để bảo trì, chỉ Admin có quyền truy cập."}
                </p>
              </div>
              <Switch
                label={isEn ? "Maintenance Mode" : "Chế độ bảo trì"}
                checked={form.maintenanceMode}
                onChange={(checked) => setForm((prev) => ({ ...prev, maintenanceMode: checked }))}
                disabled={saving}
              />
            </div>

            {form.maintenanceMode && (
              <Alert tone="warning" title={isEn ? "Maintenance Mode Enabled" : "Cảnh báo chế độ bảo trì"}>
                {isEn
                  ? "Maintenance mode is enabled. Changes are logged to the platform audit trail."
                  : "Hệ thống đang ở chế độ bảo trì. Mọi thay đổi trạng thái sẽ được ghi vào nhật ký hệ thống."}
              </Alert>
            )}

            <footer className="system-setting-footer">
              <span>
                <Icon name="info" size="small" />{" "}
                {isEn
                  ? "All changes are recorded in the system audit log."
                  : "Mọi thay đổi cấu hình được lưu vào nhật ký kiểm toán hệ thống."}
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
