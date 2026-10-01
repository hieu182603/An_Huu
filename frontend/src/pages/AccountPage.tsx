import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Icon, IconButton, Input, Select, Switch } from "../components/ui";
import { useFinancialProfile, DEMO_STORAGE_DISCLAIMER } from "../context/FinancialProfileContext";
import { calculateRetirement, inputFromProfile, projectBalanceAtAge } from "../domain/retirementCalculator";
import { downloadCsv, downloadJson } from "../utils/downloads";

type AccountTab = "profile" | "security" | "notifications" | "reports" | "privacy";

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");

  const {
    profile,
    saveStatus,
    saveError,
    lastSavedAt,
    updateProfile,
    updateProfileLocal,
    updatePersonalInfo,
    resetToSampleData,
  } = useFinancialProfile();

  // State local cho mật khẩu (không lưu vào localStorage theo yêu cầu).
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  // Switches cho tab notifications — đồng bộ với profile khi người dùng bật/tắt
  const [twoFactor, setTwoFactor] = useState(true);
  const [emailDigest, setEmailDigest] = useState(true);
  const [goalAlerts, setGoalAlerts] = useState(true);
  const [partnerUpdates, setPartnerUpdates] = useState(false);

  // Theo dõi trạng thái lưu để hiển thị thông báo.
  useEffect(() => {
    if (saveStatus === "saved" && activeTab === "profile") {
      setSavedNotice(true);
      const t = setTimeout(() => setSavedNotice(false), 3000);
      return () => clearTimeout(t);
    }
  }, [saveStatus, activeTab]);
  const [savedNotice, setSavedNotice] = useState(false);
  const [dirtyNotice, setDirtyNotice] = useState(false);
  const [privacyFeedback, setPrivacyFeedback] = useState<string | null>(null);

  const exportProjectionCsv = () => {
    const input = inputFromProfile(profile);
    const rows: Array<Array<string | number>> = [["Tuổi", "Năm", "Số dư dự phóng (VND)"]];
    for (let age = input.currentAge; age <= input.lifeExpectancy; age += 1) {
      rows.push([age, new Date().getFullYear() + age - input.currentAge, projectBalanceAtAge(input, age)]);
    }
    downloadCsv("an-huu-du-phong-dong-tien.csv", rows);
  };

  // Báo "có thay đổi chưa lưu" khi người dùng chỉnh sửa nhưng chưa bấm lưu.
  useEffect(() => {
    if (saveStatus === "dirty") {
      setDirtyNotice(true);
      setSavedNotice(false);
    } else {
      setDirtyNotice(false);
    }
  }, [saveStatus]);

  // Lưu thay đổi hồ sơ (profile, name, email, phone, city, primaryIncome).
  const handleSave = async () => {
    await updateProfile({
      personal: profile.personal,
      income: profile.income,
      socialSecurity: profile.socialSecurity,
    });
  };

  // Đổi mật khẩu: kiểm tra dữ liệu thật, không báo thành công nếu thiếu/không hợp lệ.
  const handleChangePassword = async () => {
    setPasswordFeedback(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordFeedback({ tone: "danger", message: "Vui lòng nhập đầy đủ mật khẩu hiện tại, mật khẩu mới và xác nhận." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordFeedback({ tone: "danger", message: "Mật khẩu mới phải có ít nhất 8 ký tự." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ tone: "danger", message: "Mật khẩu mới và xác nhận không trùng khớp." });
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordFeedback({ tone: "danger", message: "Mật khẩu mới phải khác mật khẩu hiện tại." });
      return;
    }
    // Trong demo: chỉ ghi nhận ý định, không lưu mật khẩu vào localStorage.
    setPasswordFeedback({
      tone: "success",
      message: "Yêu cầu đổi mật khẩu đã được ghi nhận. Tính năng đổi mật khẩu thực sẽ được kích hoạt khi dịch vụ xác thực sẵn sàng.",
    });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="phase-eight-page">
      {/* Header */}
      <div className="phase-page-header phase-eight-header">
        <div>
          <span className="section-eyebrow">QUẢN TRỊ TÀI KHOẢN (U10)</span>
          <h1>Hồ sơ tài chính & cài đặt tài khoản</h1>
          <p>
            Quản lý thông tin định danh, tùy chỉnh cấu hình bảo mật, xuất kế hoạch hưu trí và kiểm soát quyền riêng tư.
          </p>
        </div>

        <div className="phase-eight-switcher">
          <Link to="/user/explore"><button type="button">Khám phá</button></Link>
          <button type="button" className="is-active">Tài khoản</button>
        </div>
      </div>

      <div className="account-layout">
        {/* Navigation Sidebar */}
        <nav className="account-nav" aria-label="Menu tài khoản">
          <button
            type="button"
            className={activeTab === "profile" ? "is-active" : ""}
            onClick={() => setActiveTab("profile")}
          >
            <Icon name="users" />
            <span>Thông tin cá nhân</span>
            <Icon name="chevron-right" size="small" />
          </button>

          <button
            type="button"
            className={activeTab === "security" ? "is-active" : ""}
            onClick={() => setActiveTab("security")}
          >
            <Icon name="settings" />
            <span>Bảo mật & Mật khẩu</span>
            <Icon name="chevron-right" size="small" />
          </button>

          <button
            type="button"
            className={activeTab === "notifications" ? "is-active" : ""}
            onClick={() => setActiveTab("notifications")}
          >
            <Icon name="bell" />
            <span>Tùy chọn thông báo</span>
            <Icon name="chevron-right" size="small" />
          </button>

          <button
            type="button"
            className={activeTab === "reports" ? "is-active" : ""}
            onClick={() => setActiveTab("reports")}
          >
            <Icon name="download" />
            <span>Xuất kế hoạch hưu trí</span>
            <Icon name="chevron-right" size="small" />
          </button>

          <button
            type="button"
            className={activeTab === "privacy" ? "is-active" : ""}
            onClick={() => setActiveTab("privacy")}
          >
            <Icon name="info" />
            <span>Quyền riêng tư & Dữ liệu</span>
            <Icon name="chevron-right" size="small" />
          </button>
        </nav>

        {/* Content Panel */}
        <div className="account-content">
          {savedNotice && (
            <Alert tone="success" title="Cập nhật thành công">
              Hồ sơ của bạn đã được lưu vào bộ nhớ cục bộ{lastSavedAt ? ` lúc ${lastSavedAt}` : ""}.
            </Alert>
          )}

          {dirtyNotice && (
            <Alert tone="info" title="Có thay đổi chưa được lưu">
              Bạn đã chỉnh sửa nhưng chưa bấm "Lưu thay đổi hồ sơ".
            </Alert>
          )}

          {saveError && (
            <Alert tone="danger" title="Lỗi lưu hồ sơ">
              {saveError}
            </Alert>
          )}

          {/* TAB 1: PROFILE */}
          {activeTab === "profile" && (
            <Card className="account-card">
              <header>
                <div>
                  <h2>Thông tin cá nhân & Cơ sở tài chính</h2>
                  <p>Các dữ liệu này là căn cứ đầu vào cho mô hình tính toán hưu trí.</p>
                </div>
                <Badge tone="success">Đã xác minh</Badge>
              </header>

              <div className="account-form-grid">
                <Input
                  label="Họ và tên"
                  value={profile.personal.name}
                  onChange={(v) => updateProfileLocal({ personal: { ...profile.personal, name: v } })}
                />

                <Input
                  label="Email tài khoản"
                  value={profile.personal.email}
                  onChange={(v) => updateProfileLocal({ personal: { ...profile.personal, email: v } })}
                  type="email"
                />

                <Input
                  label="Số điện thoại"
                  value={profile.personal.phone}
                  onChange={(v) => updateProfileLocal({ personal: { ...profile.personal, phone: v } })}
                />

                <Select
                  label="Nơi sinh sống dự kiến khi hưu"
                  options={["TP. Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Khu vực khác"]}
                  value={profile.personal.city}
                  onChange={(v) => updateProfileLocal({ personal: { ...profile.personal, city: v } })}
                />

                <Input
                  label="Thu nhập chính sau thuế hàng tháng"
                  value={profile.income.primaryIncome.toLocaleString("vi-VN")}
                  onChange={(v) => updateProfileLocal({ income: { ...profile.income, primaryIncome: Number(v.replace(/\D/g, "")) || 0 } })}
                  suffix="VNĐ"
                />

                <Input
                  label="Số năm tham gia BHXH hiện tại"
                  value={String(profile.socialSecurity.socialInsuranceYears)}
                  onChange={(v) => updateProfileLocal({ socialSecurity: { ...profile.socialSecurity, socialInsuranceYears: Number(v) || 0 } })}
                  suffix="năm"
                  helper="Cập nhật lại khi hoàn thành thêm các năm đóng bảo hiểm mới."
                />
              </div>

              <div className="account-save-row">
                <span>
                  <Icon name="info" size="small" />
                  Mọi thay đổi thu nhập sẽ cập nhật lại dòng tiền thặng dư tự động.
                </span>
                <Button variant="primary" onClick={handleSave} loading={saveStatus === "saving"}>
                  Lưu thay đổi hồ sơ <Icon name="check" size="small" />
                </Button>
              </div>

              <div className="account-reset-row">
                <small>
                  <Icon name="info" size="small" /> {DEMO_STORAGE_DISCLAIMER}
                </small>
                <Button variant="ghost" size="small" onClick={() => {
                  if (confirm("Khôi phục lại bộ dữ liệu mẫu ban đầu? Hồ sơ bạn đang chỉnh sẽ bị thay thế.")) {
                    resetToSampleData();
                  }
                }}>
                  Khôi phục dữ liệu mẫu
                </Button>
              </div>
            </Card>
          )}

          {/* TAB 2: SECURITY */}
          {activeTab === "security" && (
            <Card className="account-card">
              <header>
                <div>
                  <h2>Bảo mật & Đăng nhập</h2>
                  <p>Quản lý mật khẩu và xác thực đa yếu tố để bảo vệ dữ liệu tài sản.</p>
                </div>
                <Badge tone="soft">AN TOÀN CAO</Badge>
              </header>

              <div className="account-setting-row preference-row">
                <div>
                  <strong>Xác thực hai lớp (2FA qua Email / OTP)</strong>
                  <small>Yêu cầu mã 6 chữ số gửi qua email mỗi khi đăng nhập trên thiết bị lạ.</small>
                </div>
                <Switch
                  checked={twoFactor}
                  label={twoFactor ? "Đang bật" : "Đang tắt"}
                  onChange={setTwoFactor}
                />
              </div>

              {passwordFeedback && (
                <Alert tone={passwordFeedback.tone} title={passwordFeedback.tone === "success" ? "Đã ghi nhận" : "Không thể đổi mật khẩu"}>
                  {passwordFeedback.message}
                </Alert>
              )}

              <div className="account-form-grid" style={{ paddingTop: "24px" }}>
                <Input
                  label="Mật khẩu hiện tại"
                  type="password"
                  placeholder="Nhập mật khẩu hiện tại"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />
                <div />
                <Input
                  label="Mật khẩu mới (tối thiểu 8 ký tự)"
                  type="password"
                  placeholder="Tạo mật khẩu mới"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
                <Input
                  label="Xác nhận mật khẩu mới"
                  type="password"
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />
              </div>

              <div className="account-save-row">
                <span>
                  <Icon name="info" size="small" />
                  Mật khẩu chỉ được ghi nhận ý định; không lưu vào bộ nhớ trình duyệt.
                </span>
                <Button variant="primary" onClick={handleChangePassword}>
                  Đổi mật khẩu <Icon name="check" size="small" />
                </Button>
              </div>
            </Card>
          )}

          {/* TAB 3: NOTIFICATIONS */}
          {activeTab === "notifications" && (
            <Card className="account-card">
              <header>
                <div>
                  <h2>Tùy chọn nhận thông báo</h2>
                  <p>Chọn các bản tin và cảnh báo tài chính bạn muốn nhận từ An Hưu.</p>
                </div>
                <Badge tone="soft">LƯU CỤC BỘ</Badge>
              </header>

              <div className="account-setting-row preference-row">
                <div>
                  <strong>Bản tổng hợp tiến độ hàng tháng (Email Digest)</strong>
                  <small>Gửi báo cáo tóm tắt tình hình tích lũy và cập nhật số dư vào ngày 01 đầu tháng.</small>
                </div>
                <Switch
                  checked={emailDigest}
                  label={emailDigest ? "Bật" : "Tắt"}
                  onChange={setEmailDigest}
                />
              </div>

              <div className="account-setting-row preference-row">
                <div>
                  <strong>Cảnh báo chệch mục tiêu & Cột mốc quan trọng</strong>
                  <small>Nhắc nhở kịp thời khi mức chi tiêu thực tế vượt quá ngân sách kế hoạch.</small>
                </div>
                <Switch
                  checked={goalAlerts}
                  label={goalAlerts ? "Bật" : "Tắt"}
                  onChange={setGoalAlerts}
                />
              </div>

              <div className="account-setting-row preference-row">
                <div>
                  <strong>Thông tin cập nhật luật BHXH & Sản phẩm hưu trí</strong>
                  <small>Nhận thông báo khi có thay đổi chính sách lương hưu hoặc báo cáo thị trường mới.</small>
                </div>
                <Switch
                  checked={partnerUpdates}
                  label={partnerUpdates ? "Bật" : "Tắt"}
                  onChange={setPartnerUpdates}
                />
              </div>

              <div className="account-save-row">
                <span>
                  <Icon name="info" size="small" />
                  Cài đặt thông báo trong bản demo chỉ lưu trên thiết bị hiện tại. Tính năng gửi email cần dịch vụ backend.
                </span>
              </div>
            </Card>
          )}

          {/* TAB 4: REPORTS */}
          {activeTab === "reports" && (
            <div style={{ display: "grid", gap: "16px" }}>
              <Card className="report-card">
                <div>
                  <span className="report-icon"><Icon name="file-text" size="large" /></span>
                  <div>
                    <h2>Báo cáo Kế hoạch Hưu trí</h2>
                    <p>Mở hộp thoại in của trình duyệt để in báo cáo hiện tại hoặc chọn “Lưu dưới dạng PDF”.</p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => window.print()}
                >
                  <Icon name="download" /> In hoặc lưu PDF
                </Button>
              </Card>

              <Card className="report-card">
                <div>
                  <span className="report-icon" style={{ background: "rgba(var(--color-secondary-rgb), .15)" }}>
                    <Icon name="chart" size="large" />
                  </span>
                  <div>
                    <h2>Bảng dự phóng Dòng tiền Hưu trí (CSV)</h2>
                    <p>File số liệu từng năm theo tuổi hiện tại và tuổi thọ trong hồ sơ, có thể mở bằng Excel hoặc ứng dụng bảng tính.</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={exportProjectionCsv}
                >
                  <Icon name="download" /> Xuất tệp CSV
                </Button>
              </Card>
            </div>
          )}

          {/* TAB 5: PRIVACY */}
          {activeTab === "privacy" && (
            <Card className="account-card">
              <header>
                <div>
                  <h2>Quyền riêng tư & Làm chủ dữ liệu</h2>
                  <p>Cam kết dữ liệu của An Hưu: bạn là người sở hữu duy nhất mọi thông tin tài chính.</p>
                </div>
                <Badge tone="soft">QUYỀN LÀM CHỦ</Badge>
              </header>

              <div className="privacy-notice">
                <Icon name="info" />
                <p>
                  Bản demo lưu hồ sơ trong trình duyệt trên thiết bị này. Chưa có máy chủ tài khoản, mã hóa đầu cuối hoặc quy trình xóa dữ liệu từ xa.
                </p>
              </div>

              <div className="account-setting-row">
                <div>
                  <strong>Tải về toàn bộ dữ liệu cá nhân (Data Export)</strong>
                  <small>Xuất toàn bộ lịch sử khai báo, kịch bản mô phỏng và nhật ký trò chuyện AI dưới định dạng JSON.</small>
                </div>
                <Button variant="secondary" size="small" onClick={() => downloadJson("an-huu-du-lieu-ca-nhan.json", { exportedAt: new Date().toISOString(), profile, calculation: calculateRetirement(inputFromProfile(profile)) })}>
                  <Icon name="download" size="small" /> Tải về dữ liệu
                </Button>
              </div>

              <div className="account-setting-row" style={{ borderBottom: 0 }}>
                <div>
                  <strong style={{ color: "var(--color-danger)" }}>Xóa vĩnh viễn tài khoản & Toàn bộ dữ liệu</strong>
                  <small>Hành động này sẽ xóa sạch tài khoản, hồ sơ và kế hoạch hưu trí. Không thể khôi phục sau khi xóa.</small>
                </div>
                <Button variant="danger" size="small" onClick={() => setPrivacyFeedback("Chưa thể xóa tài khoản vì bản demo chưa có dịch vụ tài khoản phía máy chủ. Bạn có thể dùng chức năng đặt lại dữ liệu mẫu trong phần hồ sơ.")}>
                  Xóa tài khoản vĩnh viễn
                </Button>
              </div>
              {privacyFeedback && <Alert tone="warning" title="Chức năng chưa được cấu hình">{privacyFeedback}</Alert>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
