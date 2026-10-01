import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, BrandLogo, Button, Checkbox, GoogleIcon, Icon, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";

function AuthStory({
  title = "An tâm tài chính, thảnh thơi tuổi vàng.",
  highlight = "8,5 TỶ ĐỒNG",
  sub = "Mục tiêu tuổi 60",
  badge = "Tự chủ tương lai",
}: {
  title?: string;
  description?: string;
  quote?: string;
  bgImage?: string;
  badge?: string;
  features?: string[];
  highlight?: string;
  sub?: string;
}) {
  return (
    <aside className="auth-story-panel" aria-label="Giới thiệu An Hưu">
      <div className="auth-story-top">
        <Link to="/" className="auth-story-brand-link" aria-label="Về trang chủ An Hưu">
          <BrandLogo inverted />
        </Link>
        <span className="auth-story-badge">
          <Icon name="sparkles" size="small" />
          <span>{badge}</span>
        </span>
      </div>

      <div className="auth-story-center">
        <h2 className="auth-minimal-headline">{title}</h2>

        {/* Minimalist Floating Wealth Widget */}
        <div className="auth-minimal-card">
          <div className="auth-minimal-card-header">
            <strong className="auth-minimal-val">{highlight}</strong>
            <span className="auth-minimal-sub">{sub}</span>
          </div>

          <div className="auth-curve-container">
            <svg viewBox="0 0 320 110" className="auth-growth-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="growthGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="65%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#5eead4" />
                </linearGradient>
                <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.0" />
                </linearGradient>
                <filter id="curveGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path
                d="M 10 95 C 90 92, 160 84, 230 48 C 270 28, 292 16, 308 10 L 308 105 L 10 105 Z"
                fill="url(#areaGrad)"
              />
              <path
                d="M 10 95 C 90 92, 160 84, 230 48 C 270 28, 292 16, 308 10"
                fill="none"
                stroke="url(#growthGrad)"
                strokeWidth="3.5"
                strokeLinecap="round"
                filter="url(#curveGlow)"
              />
              <circle cx="308" cy="10" r="5" fill="#5eead4" filter="url(#curveGlow)" />
              <circle cx="308" cy="10" r="9" fill="none" stroke="#2dd4bf" strokeWidth="1.5" opacity="0.6" />
            </svg>

            <div className="auth-curve-labels">
              <span>30t</span>
              <span>40t</span>
              <span>50t</span>
              <span>60t (An yên)</span>
            </div>
          </div>
        </div>

        {/* 3 Clean Minimalist Badges */}
        <div className="auth-minimal-badges">
          <span className="auth-minimal-pill">
            <Icon name="check" size="small" />
            <span>Độc lập 100%</span>
          </span>
          <span className="auth-minimal-pill">
            <Icon name="check" size="small" />
            <span>Miễn phí trọn đời</span>
          </span>
          <span className="auth-minimal-pill">
            <Icon name="check" size="small" />
            <span>Bảo mật AES-256</span>
          </span>
        </div>
      </div>

      <div className="auth-story-bottom">
        <span className="auth-minimal-footer">© 2026 An Hưu — Nền tảng hưu trí độc lập</span>
      </div>
    </aside>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const performLogin = async (loginEmail: string, loginPass: string) => {
    const cleanEmail = (loginEmail || "").trim();
    const cleanPassword = (loginPass || "").trim();
    if (!cleanEmail || !cleanPassword) {
      setError("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }
    setLoading(true);
    setError("");
    const loggedUser = await login(cleanEmail, cleanPassword, remember);
    setLoading(false);
    if (loggedUser) {
      if (loggedUser.role === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/user/dashboard");
      }
    } else {
      setError("Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.");
    }
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    await performLogin(email, password);
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Tự chủ tài chính, an nhiên mỗi ngày."
        highlight="8,5 TỶ ĐỒNG"
        sub="Mục tiêu tích lũy tuổi 60"
        badge="Đồng hành dài hạn"
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span className="auth-badge-tag">
              <Icon name="sparkles" size="small" /> CHÀO MỪNG TRỞ LẠI
            </span>
            <h1>Đăng nhập An Hưu</h1>
            <p>Nhập email và mật khẩu để truy cập không gian tài chính cá nhân của bạn.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-input-group">
              <div className="auth-field-item">
                <label className="auth-field-label" htmlFor="login-email">
                  <span>Địa chỉ Email</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="login-email"
                    type="email"
                    className="auth-input"
                    placeholder="tenban@email.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="auth-field-item">
                <label className="auth-field-label" htmlFor="login-password">
                  <span>Mật khẩu</span>
                  <Link to="/forgot-password" className="auth-forgot-link">
                    Quên mật khẩu?
                  </Link>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input has-eye"
                    placeholder="Nhập mật khẩu của bạn"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} size="small" />
                  </button>
                </div>
              </div>
            </div>

            <div className="auth-options-row">
              <Checkbox
                checked={remember}
                label="Ghi nhớ đăng nhập trên thiết bị này"
                onChange={setRemember}
              />
            </div>

            {error && (
              <div className="auth-error-banner" role="alert">
                <Icon name="alert" size="small" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="auth-btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <>
                  <span>Đăng nhập vào tài khoản</span>
                  <Icon name="arrow-right" size="small" />
                </>
              )}
            </button>

            <div className="auth-divider">
              <span>hoặc tiếp tục với</span>
            </div>

            <button
              type="button"
              className="auth-btn-google"
              onClick={() => setError("Đăng nhập Google chưa được cấu hình trong bản demo. Hãy dùng tài khoản demo được cung cấp.")}
            >
              <GoogleIcon />
              <span>Đăng nhập nhanh với Google</span>
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <span style={{ color: "#7B8F9D", fontSize: "13px" }}>Chưa có tài khoản? </span>
              <Link to="/register" className="auth-switch-link">
                Đăng ký ngay <Icon name="arrow-right" size="small" />
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e?: FormEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      setError("Vui lòng điền đầy đủ họ tên, email và mật khẩu.");
      return;
    }
    if (cleanPassword.length < 8) {
      setError("Mật khẩu phải có độ dài tối thiểu 8 ký tự.");
      return;
    }
    if (!agree) {
      setError("Vui lòng đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.");
      return;
    }
    setError("Dịch vụ đăng ký và gửi OTP chưa được cấu hình. Bản demo không tạo hoặc lưu tài khoản mới.");
  };

  const passwordStrength =
    password.length === 0 ? 0 : password.length >= 8 && /[0-9]/.test(password) && /[a-zA-Z]/.test(password) ? 3 : password.length >= 6 ? 2 : 1;

  return (
    <div className="auth-page">
      <AuthStory
        title="An tâm tài chính, thảnh thơi tuổi vàng."
        highlight="8,5 TỶ ĐỒNG"
        sub="Mô phỏng tích lũy tuổi 60"
        badge="Tự chủ tương lai"
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span className="auth-badge-tag">
              <Icon name="sparkles" size="small" /> TẠO HỒ SƠ MIỄN PHÍ
            </span>
            <h1>Đăng ký tài khoản An Hưu</h1>
            <p>Khởi đầu kế hoạch tài chính độc lập, vững chắc cho tuổi hưu an nhàn.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-input-group">
              <div className="auth-field-item">
                <label className="auth-field-label" htmlFor="register-name">
                  <span>Họ và tên</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="register-name"
                    type="text"
                    className="auth-input"
                    placeholder="Ví dụ: Nguyễn Minh An"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setError(""); }}
                    autoComplete="name"
                    required
                  />
                </div>
              </div>

              <div className="name-fields">
                <div className="auth-field-item">
                  <label className="auth-field-label" htmlFor="register-email">
                    <span>Địa chỉ Email</span>
                  </label>
                  <div className="auth-input-wrapper">
                    <input
                      id="register-email"
                      type="email"
                      className="auth-input"
                      placeholder="tenban@email.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(""); }}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="auth-field-item">
                  <label className="auth-field-label" htmlFor="register-phone">
                    <span>Số điện thoại <small style={{ color: "#7B8F9D", fontWeight: 400 }}>(tùy chọn)</small></span>
                  </label>
                  <div className="auth-input-wrapper">
                    <input
                      id="register-phone"
                      type="tel"
                      className="auth-input"
                      placeholder="0912 345 678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              <div className="auth-field-item">
                <label className="auth-field-label" htmlFor="register-password">
                  <span>Mật khẩu</span>
                  <span style={{ fontSize: "11px", color: passwordStrength === 3 ? "#34A853" : passwordStrength === 2 ? "#D9A85E" : "#7B8F9D" }}>
                    {passwordStrength === 3 ? "Mạnh" : passwordStrength === 2 ? "Trung bình" : passwordStrength === 1 ? "Yếu (tối thiểu 8 ký tự)" : ""}
                  </span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input has-eye"
                    placeholder="Tạo mật khẩu an toàn (tối thiểu 8 ký tự)"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} size="small" />
                  </button>
                </div>

                {password && (
                  <div className="auth-strength-meter">
                    <div className={`strength-bar ${passwordStrength >= 1 ? "is-filled" : ""}`} />
                    <div className={`strength-bar ${passwordStrength >= 2 ? "is-filled" : ""}`} />
                    <div className={`strength-bar ${passwordStrength >= 3 ? "is-filled" : ""}`} />
                  </div>
                )}
              </div>
            </div>

            <div className="auth-options-row">
              <Checkbox
                checked={agree}
                label="Tôi đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của An Hưu"
                onChange={setAgree}
              />
            </div>

            {error && (
              <div className="auth-error-banner" role="alert">
                <Icon name="alert" size="small" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="auth-btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span>Đang khởi tạo hồ sơ...</span>
                </>
              ) : (
                <>
                  <span>Tạo tài khoản & Nhận mã OTP</span>
                  <Icon name="arrow-right" size="small" />
                </>
              )}
            </button>

            <div className="auth-divider">
              <span>hoặc đăng ký nhanh bằng</span>
            </div>

            <button
              type="button"
              className="auth-btn-google"
              onClick={() => setError("Đăng ký Google chưa được cấu hình trong bản demo.")}
            >
              <GoogleIcon />
              <span>Đăng ký bằng tài khoản Google</span>
            </button>
          </form>

          <footer className="auth-panel-footer">
            <Icon name="circle-check" size="small" />
            <span>Miễn phí 100% · Không yêu cầu thẻ tín dụng hay ràng buộc tài chính</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export function ForgotPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Vui lòng nhập một địa chỉ email hợp lệ.");
      return;
    }
    setError("Dịch vụ gửi email đặt lại mật khẩu chưa được cấu hình trong bản demo.");
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Khôi phục quyền truy cập tài khoản"
        description="Đừng lo lắng, chúng tôi sẽ hỗ trợ bạn lấy lại mật khẩu an toàn thông qua email xác thực đã đăng ký."
        quote="Bản demo chưa kết nối dịch vụ tài khoản hoặc gửi email."
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-form-wrap">
          {!sent ? (
            <>
              <div className="auth-heading">
                <span>QUÊN MẬT KHẨU</span>
                <h1>Đặt lại mật khẩu</h1>
                <p>Nhập email tài khoản An Hưu của bạn. Chúng tôi sẽ gửi đường dẫn và mã xác thực đặt lại mật khẩu.</p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit}>
                <Input
                  label="Email đã đăng ký"
                  type="email"
                  placeholder="tenban@email.com"
                  value={email}
                  onChange={(value) => { setEmail(value); setError(""); }}
                  autoComplete="email"
                />

                {error && <div className="auth-error-banner" role="alert"><Icon name="alert" size="small" /><span>{error}</span></div>}

                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  loading={loading}
                  onClick={handleSubmit}
                >
                  Gửi mã xác nhận qua Email
                </Button>

                <div style={{ textAlign: "center", marginTop: "16px" }}>
                  <Link to="/login" className="auth-text-action">
                    <Icon name="arrow-left" size="small" /> Quay lại trang đăng nhập
                  </Link>
                </div>
              </form>
            </>
          ) : (
            <div className="auth-success">
              <span><Icon name="circle-check" size="large" /></span>
              <Badge tone="success">ĐÃ GỬI EMAIL</Badge>
              <h1>Kiểm tra hòm thư của bạn</h1>
              <p>
                Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu tới <strong>{email}</strong>. Vui lòng kiểm tra cả thư mục Spam nếu không thấy trong hộp thư chính.
              </p>
              <Button variant="primary" size="large" onClick={() => navigate("/reset-password")}>
                Nhập mã đặt lại mật khẩu <Icon name="arrow-right" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function ResetPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Mã xác thực phải gồm đúng 6 chữ số.");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setError("Dịch vụ đặt lại mật khẩu chưa được cấu hình trong bản demo.");
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Bảo mật tài khoản luôn là ưu tiên cao nhất"
        description="Hãy chọn một mật khẩu mạnh kết hợp chữ, số và ký tự đặc biệt để bảo vệ không gian kế hoạch tài chính của bạn."
        quote="An tâm bắt đầu từ sự cẩn trọng trong từng lớp bảo vệ thông tin."
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-topbar">
          <Link to="/" className="site-brand" aria-label="Trang chủ An Hưu">
            <BrandLogo />
          </Link>
          <div className="auth-topbar-action">
            <Link to="/login" className="auth-switch-link">Đăng nhập</Link>
          </div>
        </div>

        <div className="auth-form-wrap">
          {!success ? (
            <>
              <div className="auth-heading">
                <span>BẢO MẬT TÀI KHOẢN</span>
                <h1>Thiết lập mật khẩu mới</h1>
                <p>Nhập mã xác thực đã nhận qua email và mật khẩu mới của bạn.</p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit}>
                <Input
                  label="Mã xác thực 6 số"
                  placeholder="849201"
                  value={code}
                  onChange={setCode}
                  inputMode="numeric"
                />

                <label className="form-field" htmlFor="reset-new-password">
                  <span className="field-label">Mật khẩu mới (tối thiểu 8 ký tự)</span>
                  <span className="input-wrap">
                    <input
                      id="reset-new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Nhập mật khẩu mới"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: "12px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-text-muted)",
                        padding: "0",
                        display: "flex",
                        alignItems: "center",
                      }}
                      aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    >
                      <Icon name={showPassword ? "eye-off" : "eye"} size="small" />
                    </button>
                  </span>
                </label>

                <label className="form-field" htmlFor="reset-confirm-password">
                  <span className="field-label">Xác nhận mật khẩu mới</span>
                  <span className="input-wrap">
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Nhập lại mật khẩu mới"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: "absolute",
                        right: "12px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-text-muted)",
                        padding: "0",
                        display: "flex",
                        alignItems: "center",
                      }}
                      aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    >
                      <Icon name={showConfirmPassword ? "eye-off" : "eye"} size="small" />
                    </button>
                  </span>
                </label>

                {error && (
                  <p style={{ color: "var(--color-danger)", fontSize: "12px", margin: 0 }}>
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  loading={loading}
                  onClick={handleSubmit}
                >
                  Cập nhật mật khẩu & Đăng nhập
                </Button>
              </form>
            </>
          ) : (
            <div className="auth-success">
              <span><Icon name="circle-check" size="large" /></span>
              <Badge tone="success">ĐỔI MẬT KHẨU THÀNH CÔNG</Badge>
              <h1>Mật khẩu đã được cập nhật</h1>
              <p>Bạn có thể sử dụng mật khẩu mới này để đăng nhập vào An Hưu trên tất cả các thiết bị.</p>
              <Button variant="primary" size="large" onClick={() => navigate("/login")}>
                Đăng nhập ngay <Icon name="arrow-right" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function VerifyPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setResendNotice("Mã OTP phải gồm đúng 6 chữ số.");
      return;
    }
    setResendNotice("Dịch vụ xác minh OTP chưa được cấu hình trong bản demo.");
  };

  const handleResend = () => {
    setResendNotice("Dịch vụ gửi OTP chưa được cấu hình trong bản demo.");
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Xác thực danh tính tài khoản"
        description="Nhập mã 6 chữ số khi dịch vụ xác thực email đã được cấu hình. Bản demo hiện chưa gửi OTP."
        quote="Bảo mật hai lớp giúp bảo vệ hành trình hưu trí dài hạn của bạn trước mọi rủi ro số."
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-topbar">
          <Link to="/" className="site-brand" aria-label="Trang chủ An Hưu">
            <BrandLogo />
          </Link>
          <div className="auth-topbar-action">
            <span>Đổi email khác?</span>
            <Link to="/register" className="auth-switch-link">Quay lại</Link>
          </div>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span>BƯỚC CUỐI CÙNG</span>
            <h1>Xác minh email</h1>
            <p>Nhập mã OTP gồm 6 chữ số được gửi tới hộp thư của bạn.</p>
          </div>

          <form className="auth-form" onSubmit={handleVerify}>
            <div className="verification-field">
              <Input
                label="Mã OTP 6 số"
                placeholder="682490"
                value={code}
                onChange={setCode}
                inputMode="numeric"
              />
              <button
                type="button"
                className="auth-text-action"
                onClick={handleResend}
                disabled={resending}
              >
                {resending ? "Đang gửi lại mã..." : "Chưa nhận được mã? Gửi lại OTP"}
              </button>
            </div>

            {resendNotice && (
              <p role="alert" style={{ color: "var(--color-danger)", fontSize: "12px", margin: 0 }}>
                {resendNotice}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="large"
              loading={loading}
              onClick={handleVerify}
            >
              Xác nhận & Bắt đầu lập kế hoạch <Icon name="arrow-right" />
            </Button>

            <div className="auth-security">
              <Icon name="info" size="small" />
              <span>Mã xác thực có hiệu lực trong vòng 10 phút kể từ lúc gửi.</span>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
