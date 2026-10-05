import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Icon, Switch, Button, Badge, Card, useNotification, type IconName } from "./ui";
import { AccountProfilePanel, AccountSecurityPanel } from "./AccountApiPanels";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { inputFromProfile, projectBalanceAtAge } from "../domain/retirementCalculator";
import { downloadCsv } from "../utils/downloads";
import { getNotificationSettings, updateNotificationSettings, type NotificationSettings } from "../services/notifications";
import { exportPlanVersionCsv } from "../services/plans";
import LanguageSwitcher from "./LanguageSwitcher";
import { useI18n } from "../i18n";

export type AccountModalTab = "profile" | "settings" | "export";

export interface UserAccountModalProps {
  open: boolean;
  initialTab?: AccountModalTab;
  onClose: () => void;
  user?: {
    name?: string;
    email?: string;
    avatarUrl?: string;
    initials?: string;
    detail?: string;
  };
}

export function UserAccountModal({
  open,
  initialTab = "profile",
  onClose,
  user,
}: UserAccountModalProps) {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<AccountModalTab>(initialTab);
  const { notify } = useNotification();
  const { profile } = useFinancialProfile();
  const { activePlan } = useRetirementPlan();

  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [emailDigest, setEmailDigest] = useState(() => localStorage.getItem("an_huu_pref_digest") !== "false");
  const [goalAlerts, setGoalAlerts] = useState(() => localStorage.getItem("an_huu_pref_goals") !== "false");
  const [partnerUpdates, setPartnerUpdates] = useState(() => localStorage.getItem("an_huu_pref_policy") === "true");
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    getNotificationSettings()
      .then(settings => {
        if (active) {
          setNotificationSettings(settings);
          setEmailDigest(settings.emailDigest);
          setGoalAlerts(settings.goalAlerts);
          setPartnerUpdates(settings.partnerUpdates);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [open]);

  const handleToggle = async (key: "emailDigest" | "goalAlerts" | "partnerUpdates", val: boolean) => {
    const prev = { emailDigest, goalAlerts, partnerUpdates };
    if (key === "emailDigest") setEmailDigest(val);
    if (key === "goalAlerts") setGoalAlerts(val);
    if (key === "partnerUpdates") setPartnerUpdates(val);
    localStorage.setItem(key === "emailDigest" ? "an_huu_pref_digest" : key === "goalAlerts" ? "an_huu_pref_goals" : "an_huu_pref_policy", String(val));

    if (notificationSettings) {
      try {
        const next = await updateNotificationSettings({
          expectedRevision: notificationSettings.revision,
          emailDigest: key === "emailDigest" ? val : emailDigest,
          goalAlerts: key === "goalAlerts" ? val : goalAlerts,
          partnerUpdates: key === "partnerUpdates" ? val : partnerUpdates,
        });
        setNotificationSettings(next);
        setEmailDigest(next.emailDigest);
        setGoalAlerts(next.goalAlerts);
        setPartnerUpdates(next.partnerUpdates);
      } catch (e) {
        setEmailDigest(prev.emailDigest);
        setGoalAlerts(prev.goalAlerts);
        setPartnerUpdates(prev.partnerUpdates);
        notify.error(
          language === "en" ? "Failed to save settings" : "Lưu cài đặt thất bại",
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  };

  const handleExportCsv = async () => {
    if (activePlan?.id && activePlan?.currentVersionId) {
      setIsExportingCsv(true);
      try {
        await exportPlanVersionCsv(activePlan.id, activePlan.currentVersionId);
        notify.success(
          language === "en" ? "CSV Export Successful" : "Xuất tệp CSV thành công",
          language === "en" ? "Official retirement plan CSV downloaded." : "Bảng kế hoạch hưu trí chính thức đã được tải về máy của bạn."
        );
      } catch (err) {
        notify.error(
          language === "en" ? "Export failed" : "Xuất CSV thất bại",
          err instanceof Error ? err.message : String(err)
        );
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportProjectionCsv();
    }
  };

  useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Trap Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const exportProjectionCsv = () => {
    const input = inputFromProfile(profile);
    const rows: Array<Array<string | number>> = [[language === "en" ? "Age" : "Tuổi", language === "en" ? "Year" : "Năm", language === "en" ? "Projected Balance (VND)" : "Số dư dự phóng (VND)"]];
    for (let age = input.currentAge; age <= input.lifeExpectancy; age += 1) {
      rows.push([age, new Date().getFullYear() + age - input.currentAge, projectBalanceAtAge(input, age)]);
    }
    downloadCsv("an-huu-du-phong-dong-tien.csv", rows);
    notify.success(
      language === "en" ? "CSV Export Successful" : "Xuất tệp CSV thành công",
      language === "en" ? "Retirement cash flow projection table downloaded to your device." : "Bảng dự phóng dòng tiền hưu trí đã được tải về máy của bạn."
    );
  };

  if (!open) return null;

  return createPortal(
    <div
      className="account-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="account-modal-window"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Left Column / Sidebar Nav */}
        <aside className="account-modal-sidebar">
          {/* User Preview */}
          <div className="account-modal-user-card">
            <div className="account-modal-avatar-frame">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name || "User"} />
              ) : (
                <span>{user?.initials || "U"}</span>
              )}
            </div>
            <div className="account-modal-user-info">
              <strong>{user?.name || (language === "en" ? "An Huu User" : "Người dùng An Hưu")}</strong>
              <small>{user?.detail || user?.email || (language === "en" ? "Personal Account" : "Tài khoản cá nhân")}</small>
            </div>
          </div>

          <div className="account-modal-nav-divider" />

          {/* Navigation Items */}
          <nav className="account-modal-nav" aria-label={language === "en" ? "Account options" : "Tùy chọn tài khoản"}>
            <button
              type="button"
              className={`account-modal-tab-btn ${activeTab === "profile" ? "is-active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <span className="tab-btn-icon"><Icon name="users" /></span>
              <span className="tab-btn-title">{t("account.tab_profile")}</span>
            </button>

            <button
              type="button"
              className={`account-modal-tab-btn ${activeTab === "settings" ? "is-active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <span className="tab-btn-icon"><Icon name="settings" /></span>
              <span className="tab-btn-title">{t("topbar.settings")}</span>
            </button>

            <button
              type="button"
              className={`account-modal-tab-btn ${activeTab === "export" ? "is-active" : ""}`}
              onClick={() => setActiveTab("export")}
            >
              <span className="tab-btn-icon"><Icon name="download" /></span>
              <span className="tab-btn-title">{t("topbar.export_plan")}</span>
            </button>
          </nav>
        </aside>

        {/* Right Column / Content Pane */}
        <div className="account-modal-content">
          <header className="account-modal-header">
            <div>
              <h2 id="account-modal-title">
                {activeTab === "profile" && (language === "en" ? "Personal Profile" : "Hồ sơ cá nhân")}
                {activeTab === "settings" && (language === "en" ? "Account Settings" : "Cài đặt tài khoản")}
                {activeTab === "export" && (language === "en" ? "Export Retirement Plan" : "Xuất kế hoạch hưu trí")}
              </h2>
            </div>
            <button
              type="button"
              className="account-modal-close-btn"
              onClick={onClose}
              aria-label={language === "en" ? "Close window" : "Đóng cửa sổ"}
              title={language === "en" ? "Close (Esc)" : "Đóng (Esc)"}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </header>

          <div className="account-modal-body">
            {/* TAB 1: HỒ SƠ */}
            {activeTab === "profile" && (
              <div className="account-tab-pane">
                <AccountProfilePanel />
              </div>
            )}

            {/* TAB 2: CÀI ĐẶT (Đổi mật khẩu & Tùy chọn thông báo) */}
            {activeTab === "settings" && (
              <div className="account-tab-pane" style={{ display: "grid", gap: "24px" }}>
                {/* 1. Security & Password */}
                <AccountSecurityPanel />

                {/* 2. Notification Preferences */}
                <Card className="account-card">
                  <header>
                    <div>
                      <h2>{language === "en" ? "Notification Preferences" : "Tùy chọn nhận thông báo"}</h2>
                      <p>{language === "en" ? "Manage alerts and updates delivered to your account." : "Quản lý các loại thông báo và cập nhật gửi đến tài khoản của bạn."}</p>
                    </div>
                  </header>

                  <div className="account-setting-row preference-row">
                    <div>
                      <strong>{language === "en" ? "Monthly Progress Summary (Email Digest)" : "Bản tổng hợp tiến độ hàng tháng (Email Digest)"}</strong>
                      <small>{language === "en" ? "Receive monthly executive summary on savings progress and balance updates." : "Gửi báo cáo tóm tắt tình hình tích lũy và cập nhật số dư định kỳ hàng tháng."}</small>
                    </div>
                    <Switch
                      checked={emailDigest}
                      label={emailDigest ? (language === "en" ? "On" : "Bật") : (language === "en" ? "Off" : "Tắt")}
                      onChange={val => handleToggle("emailDigest", val)}
                    />
                  </div>

                  <div className="account-setting-row preference-row">
                    <div>
                      <strong>{language === "en" ? "Goal Deviation & Budget Alerts" : "Cảnh báo chệch mục tiêu & Ngân sách"}</strong>
                      <small>{language === "en" ? "Reminders when actual accumulation drifts from the established retirement plan." : "Nhắc nhở khi tiến độ tích lũy thực tế có dấu hiệu chệch khỏi kế hoạch đã lập."}</small>
                    </div>
                    <Switch
                      checked={goalAlerts}
                      label={goalAlerts ? (language === "en" ? "On" : "Bật") : (language === "en" ? "Off" : "Tắt")}
                      onChange={val => handleToggle("goalAlerts", val)}
                    />
                  </div>

                  <div className="account-setting-row preference-row">
                    <div>
                      <strong>{language === "en" ? "Social Insurance Law & Pension Policy Updates" : "Thông tin cập nhật luật BHXH & Hưu trí"}</strong>
                      <small>{language === "en" ? "Stay informed when changes occur to state pension regulations and social security laws." : "Nhận thông báo khi có điều chỉnh về chính sách lương hưu và bảo hiểm xã hội."}</small>
                    </div>
                    <Switch
                      checked={partnerUpdates}
                      label={partnerUpdates ? (language === "en" ? "On" : "Bật") : (language === "en" ? "Off" : "Tắt")}
                      onChange={val => handleToggle("partnerUpdates", val)}
                    />
                  </div>
                </Card>

                {/* 3. Language & Preferences */}
                <Card className="account-card">
                  <header>
                    <div>
                      <h2>{t("account.language_label")}</h2>
                      <p>{t("account.language_desc")}</p>
                    </div>
                  </header>
                  <div style={{ marginTop: "14px", maxWidth: "280px" }}>
                    <LanguageSwitcher variant="select" />
                  </div>
                </Card>
              </div>
            )}

            {/* TAB 3: XUẤT KẾ HOẠCH HƯU TRÍ */}
            {activeTab === "export" && (
              <div className="account-tab-pane" style={{ display: "grid", gap: "18px" }}>
                <Card className="report-card">
                  <div>
                    <span className="report-icon">
                      <Icon name="file-text" size="large" />
                    </span>
                    <div>
                      <h2>{language === "en" ? "Retirement Plan Report (PDF)" : "Báo cáo Kế hoạch Hưu trí (PDF)"}</h2>
                      <p>{language === "en" ? "Print directly or export a PDF of your complete roadmap and retirement scenarios." : "In trực tiếp hoặc xuất file PDF toàn bộ lộ trình và kịch bản hưu trí của bạn."}</p>
                    </div>
                  </div>
                  <Button variant="primary" onClick={() => window.print()}>
                    <Icon name="download" /> {language === "en" ? "Print or Save PDF" : "In hoặc lưu PDF"}
                  </Button>
                </Card>

                <Card className="report-card">
                  <div>
                    <span className="report-icon" style={{ background: "rgba(25, 81, 252, 0.12)" }}>
                      <Icon name="chart" size="large" />
                    </span>
                    <div>
                      <h2>{language === "en" ? "Retirement Cash Flow Projection Table (CSV)" : "Bảng dự phóng Dòng tiền Hưu trí (CSV)"}</h2>
                      <p>{language === "en" ? "Download detailed annual cash flow projection numbers to open in Excel or Google Sheets." : "Tải bảng số liệu dự phóng dòng tiền chi tiết theo từng năm tuổi để mở trong Excel."}</p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={handleExportCsv} loading={isExportingCsv}>
                    <Icon name="download" /> {language === "en" ? "Export CSV File" : "Xuất tệp CSV"}
                  </Button>
                </Card>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
