import { useState } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Icon, IconButton, Input, Select, Switch } from "../components/ui";

type AccountTab = "profile" | "security" | "notifications" | "reports" | "privacy";

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const [savedNotice, setSavedNotice] = useState(false);

  // Profile form states
  const [name, setName] = useState("Nguyễn Minh An");
  const [email, setEmail] = useState("minhan@example.com");
  const [phone, setPhone] = useState("0912 345 678");
  const [city, setCity] = useState("TP. Hồ Chí Minh");
  const [salary, setSalary] = useState("35.000.000");

  // Security states
  const [twoFactor, setTwoFactor] = useState(true);

  // Notification states
  const [emailDigest, setEmailDigest] = useState(true);
  const [goalAlerts, setGoalAlerts] = useState(true);
  const [partnerUpdates, setPartnerUpdates] = useState(false);

  const handleSave = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
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
              Các thông tin thay đổi đã được đồng bộ vào hệ thống tính toán hưu trí của bạn.
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
                  value={name}
                  onChange={setName}
                />

                <Input
                  label="Email tài khoản"
                  value={email}
                  onChange={setEmail}
                  type="email"
                />

                <Input
                  label="Số điện thoại"
                  value={phone}
                  onChange={setPhone}
                />

                <Select
                  label="Nơi sinh sống dự kiến khi hưu"
                  options={["TP. Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Khu vực khác"]}
                  value={city}
                  onChange={setCity}
                />

                <Input
                  label="Thu nhập chính sau thuế hàng tháng"
                  value={salary}
                  onChange={setSalary}
                  suffix="VNĐ"
                />

                <Input
                  label="Số năm tham gia BHXH hiện tại"
                  defaultValue="9 năm"
                  suffix="năm"
                  helper="Cập nhật lại khi hoàn thành thêm các năm đóng bảo hiểm mới."
                />
              </div>

              <div className="account-save-row">
                <span>
                  <Icon name="info" size="small" />
                  Mọi thay đổi thu nhập sẽ cập nhật lại dòng tiền thặng dư tự động.
                </span>
                <Button variant="primary" onClick={handleSave}>
                  Lưu thay đổi hồ sơ <Icon name="check" size="small" />
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
                  onChange={(val) => { setTwoFactor(val); handleSave(); }}
                />
              </div>

              <div className="account-form-grid" style={{ paddingTop: "24px" }}>
                <Input
                  label="Mật khẩu hiện tại"
                  type="password"
                  placeholder="Nhập mật khẩu hiện tại"
                />
                <div />
                <Input
                  label="Mật khẩu mới (tối thiểu 8 ký tự)"
                  type="password"
                  placeholder="Tạo mật khẩu mới"
                />
                <Input
                  label="Xác nhận mật khẩu mới"
                  type="password"
                  placeholder="Nhập lại mật khẩu mới"
                />
              </div>

              <div className="account-save-row">
                <span>
                  <Icon name="circle-check" size="small" />
                  Lần đổi mật khẩu gần nhất: 12/06/2025.
                </span>
                <Button variant="primary" onClick={handleSave}>
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
              </header>

              <div className="account-setting-row preference-row">
                <div>
                  <strong>Bản tổng hợp tiến độ hàng tháng (Email Digest)</strong>
                  <small>Gửi báo cáo tóm tắt tình hình tích lũy và cập nhật số dư vào ngày 01 đầu tháng.</small>
                </div>
                <Switch
                  checked={emailDigest}
                  label={emailDigest ? "Bật" : "Tắt"}
                  onChange={(val) => { setEmailDigest(val); handleSave(); }}
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
                  onChange={(val) => { setGoalAlerts(val); handleSave(); }}
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
                  onChange={(val) => { setPartnerUpdates(val); handleSave(); }}
                />
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
                    <h2>Báo cáo Kế hoạch Hưu trí Toàn diện (PDF)</h2>
                    <p>Bản báo cáo chi tiết 12 trang bao gồm phân tích quỹ, biểu đồ dự phóng, bảng dòng tiền và khuyến nghị chuyên gia.</p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => alert("Đang xuất bản PDF chuẩn in ấn cho tài khoản của bạn...")}
                >
                  <Icon name="download" /> Tải về bản PDF (v2.4)
                </Button>
              </Card>

              <Card className="report-card">
                <div>
                  <span className="report-icon" style={{ background: "rgba(var(--color-secondary-rgb), .15)" }}>
                    <Icon name="chart" size="large" />
                  </span>
                  <div>
                    <h2>Bảng dự phóng Dòng tiền Hưu trí Excel / CSV</h2>
                    <p>File số liệu thô từng năm từ tuổi 32 đến tuổi 82, dùng cho người muốn tự phân tích sâu trên máy tính.</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => alert("Đang tải tệp Excel dữ liệu kế hoạch...")}
                >
                  <Icon name="download" /> Xuất tệp Excel (.xlsx)
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
                  An Hưu hoạt động theo nguyên tắc Zero-Knowledge Encryption cho dữ liệu nhạy cảm. Chúng tôi không bao giờ bán thông tin cho các bên môi giới bảo hiểm hay bất động sản bên ngoài.
                </p>
              </div>

              <div className="account-setting-row">
                <div>
                  <strong>Tải về toàn bộ dữ liệu cá nhân (Data Export)</strong>
                  <small>Xuất toàn bộ lịch sử khai báo, kịch bản mô phỏng và nhật ký trò chuyện AI dưới định dạng JSON.</small>
                </div>
                <Button variant="secondary" size="small" onClick={() => alert("Đang chuẩn bị gói dữ liệu cá nhân...")}>
                  <Icon name="download" size="small" /> Tải về dữ liệu
                </Button>
              </div>

              <div className="account-setting-row" style={{ borderBottom: 0 }}>
                <div>
                  <strong style={{ color: "var(--color-danger)" }}>Xóa vĩnh viễn tài khoản & Toàn bộ dữ liệu</strong>
                  <small>Hành động này sẽ xóa sạch tài khoản, hồ sơ và kế hoạch hưu trí. Không thể khôi phục sau khi xóa.</small>
                </div>
                <Button variant="danger" size="small" onClick={() => confirm("Bạn có chắc chắn muốn yêu cầu xóa tài khoản?") && alert("Yêu cầu đã được ghi nhận.")}>
                  Xóa tài khoản vĩnh viễn
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
