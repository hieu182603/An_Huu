import { AccountProfilePanel, AccountSecurityPanel } from "../components/AccountApiPanels";
import FinancialProfileGate from "../components/FinancialProfileGate";
import FinancialProfilePanel from "../components/FinancialProfilePanel";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge, Button, Card, Icon, Switch, useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { inputFromProfile, projectBalanceAtAge } from "../domain/retirementCalculator";
import { downloadCsv } from "../utils/downloads";
import { getNotificationSettings, updateNotificationSettings, type NotificationSettings } from "../services/notifications";
import { exportPlanVersionCsv } from "../services/plans";
import { useI18n } from "../i18n";

type AccountTab = "profile" | "settings" | "reports";

export default function AccountPage() {
  const { language } = useI18n();
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const { notify } = useNotification();
  const { profile } = useFinancialProfile();
  const { activePlan } = useRetirementPlan();

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [emailDigest, setEmailDigest] = useState(() => localStorage.getItem("an_huu_pref_digest") !== "false");
  const [goalAlerts, setGoalAlerts] = useState(() => localStorage.getItem("an_huu_pref_goals") !== "false");
  const [partnerUpdates, setPartnerUpdates] = useState(() => localStorage.getItem("an_huu_pref_policy") === "true");
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  useEffect(() => {
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
  }, []);

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

  return (
    <div className="phase-eight-page">
      {/* Header */}
      <div className="phase-page-header phase-eight-header">
        <div>
          <span className="section-eyebrow">{language === "en" ? "ACCOUNT MANAGEMENT" : "QUẢN TRỊ TÀI KHOẢN"}</span>
          <h1>{language === "en" ? "Personal Profile & Account Settings" : "Hồ sơ cá nhân & cài đặt tài khoản"}</h1>
          <p>
            {language === "en"
              ? "Manage identity details, configure security credentials, notification preferences, and export your retirement roadmap."
              : "Quản lý thông tin định danh, tùy chỉnh cấu hình bảo mật, tùy chọn thông báo và xuất kế hoạch hưu trí."}
          </p>
        </div>

        <div className="phase-eight-switcher">
          <Link to="/user/explore"><button type="button">{language === "en" ? "Explore" : "Khám phá"}</button></Link>
          <button type="button" className="is-active">{language === "en" ? "Account" : "Tài khoản"}</button>
        </div>
      </div>

      <div className="account-layout">
        {/* Navigation Sidebar */}
        <nav className="account-nav" aria-label={language === "en" ? "Account navigation" : "Menu tài khoản"}>
          <button
            type="button"
            className={activeTab === "profile" ? "is-active" : ""}
            onClick={() => setActiveTab("profile")}
          >
            <Icon name="users" />
            <span>{language === "en" ? "Financial Profile" : "Hồ sơ tài chính"}</span>
            <Icon name="chevron-right" size="small" />
          </button>

          <Link to="/user/debts" style={{ textDecoration: "none" }}>
            <button type="button">
              <Icon name="wallet" />
              <span>{language === "en" ? "Loans & Debts" : "Khoản vay & Trả nợ"}</span>
              <Icon name="chevron-right" size="small" />
            </button>
          </Link>

          <Link to="/user/risk-portfolio" style={{ textDecoration: "none" }}>
            <button type="button">
              <Icon name="shield" />
              <span>{language === "en" ? "Risk Assessment & Portfolio" : "Khảo sát rủi ro & Danh mục"}</span>
              <Icon name="chevron-right" size="small" />
            </button>
          </Link>

          <button
            type="button"
            className={activeTab === "settings" ? "is-active" : ""}
            onClick={() => setActiveTab("settings")}
          >
            <Icon name="settings" />
            <span>{language === "en" ? "Settings" : "Cài đặt"}</span>
            <Icon name="chevron-right" size="small" />
          </button>

          <button
            type="button"
            className={activeTab === "reports" ? "is-active" : ""}
            onClick={() => setActiveTab("reports")}
          >
            <Icon name="download" />
            <span>{language === "en" ? "Export Retirement Plan" : "Xuất kế hoạch hưu trí"}</span>
            <Icon name="chevron-right" size="small" />
          </button>
        </nav>

        {/* Content Panel */}
        <div className="account-content">
          {activeTab === "profile" && <><AccountProfilePanel /><FinancialProfileGate><FinancialProfilePanel /></FinancialProfileGate></>}

          {/* TAB 2: SETTINGS (Security + Notifications) */}
          {activeTab === "settings" && (
            <div style={{ display: "grid", gap: "24px" }}>
              <AccountSecurityPanel />

              <Card className="account-card">
                <header>
                  <div>
                    <h2>{language === "en" ? "Notification Preferences" : "Tùy chọn nhận thông báo"}</h2>
                    <p>{language === "en" ? "Choose which newsletters, reports, and financial alerts you want to receive." : "Chọn các bản tin, báo cáo và cảnh báo tài chính bạn muốn nhận từ An Hưu."}</p>
                  </div>
                </header>

                <div className="account-setting-row preference-row">
                  <div>
                    <strong>{language === "en" ? "Monthly Progress Summary (Email Digest)" : "Bản tổng hợp tiến độ hàng tháng (Email Digest)"}</strong>
                    <small>{language === "en" ? "Receive a monthly summary of your accumulation status and balance on the 1st of each month." : "Gửi báo cáo tóm tắt tình hình tích lũy và cập nhật số dư vào ngày 01 đầu tháng."}</small>
                  </div>
                  <Switch
                    checked={emailDigest}
                    label={emailDigest ? (language === "en" ? "On" : "Bật") : (language === "en" ? "Off" : "Tắt")}
                    onChange={val => handleToggle("emailDigest", val)}
                  />
                </div>

                <div className="account-setting-row preference-row">
                  <div>
                    <strong>{language === "en" ? "Goal Deviation & Milestone Alerts" : "Cảnh báo chệch mục tiêu & Cột mốc quan trọng"}</strong>
                    <small>{language === "en" ? "Timely alerts when actual spending deviates from your planned retirement budget." : "Nhắc nhở kịp thời khi mức chi tiêu thực tế vượt quá ngân sách kế hoạch."}</small>
                  </div>
                  <Switch
                    checked={goalAlerts}
                    label={goalAlerts ? (language === "en" ? "On" : "Bật") : (language === "en" ? "Off" : "Tắt")}
                    onChange={val => handleToggle("goalAlerts", val)}
                  />
                </div>

                <div className="account-setting-row preference-row">
                  <div>
                    <strong>{language === "en" ? "Social Insurance Law & Pension Policy Updates" : "Thông tin cập nhật luật BHXH & Sản phẩm hưu trí"}</strong>
                    <small>{language === "en" ? "Get notified when state pension regulations change or new market reports publish." : "Nhận thông báo khi có thay đổi chính sách lương hưu hoặc báo cáo thị trường mới."}</small>
                  </div>
                  <Switch
                    checked={partnerUpdates}
                    label={partnerUpdates ? (language === "en" ? "On" : "Bật") : (language === "en" ? "Off" : "Tắt")}
                    onChange={val => handleToggle("partnerUpdates", val)}
                  />
                </div>

                <div className="account-save-row">
                  <span>
                    <Icon name="info" size="small" />{" "}
                    {language === "en" ? "Notification preferences are synced with your account." : "Cài đặt thông báo được đồng bộ với tài khoản của bạn."}
                  </span>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 3: REPORTS / EXPORT */}
          {activeTab === "reports" && (
            <div style={{ display: "grid", gap: "16px" }}>
              <Card className="report-card">
                <div>
                  <span className="report-icon"><Icon name="file-text" size="large" /></span>
                  <div>
                    <h2>{language === "en" ? "Retirement Plan Report (PDF)" : "Báo cáo Kế hoạch Hưu trí"}</h2>
                    <p>{language === "en" ? "Open the browser print dialog to print your plan or save it as a PDF." : "Mở hộp thoại in của trình duyệt để in báo cáo hiện tại hoặc chọn “Lưu dưới dạng PDF”."}</p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => window.print()}
                >
                  <Icon name="download" /> {language === "en" ? "Print or Save PDF" : "In hoặc lưu PDF"}
                </Button>
              </Card>

              <Card className="report-card">
                <div>
                  <span className="report-icon" style={{ background: "rgba(var(--color-secondary-rgb), .15)" }}>
                    <Icon name="chart" size="large" />
                  </span>
                  <div>
                    <h2>{language === "en" ? "Retirement Cash Flow Projection Table (CSV)" : "Bảng dự phóng Dòng tiền Hưu trí (CSV)"}</h2>
                    <p>{language === "en" ? "Annual numbers based on your declared profile and life expectancy, exportable to Excel." : "File số liệu từng năm theo tuổi hiện tại và tuổi thọ trong hồ sơ, có thể mở bằng Excel hoặc ứng dụng bảng tính."}</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleExportCsv}
                  loading={isExportingCsv}
                >
                  <Icon name="download" /> {language === "en" ? "Export CSV File" : "Xuất tệp CSV"}
                </Button>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
