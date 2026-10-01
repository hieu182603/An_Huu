import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, BrandLogo, Button, Checkbox, GoogleIcon, Icon, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";

function AuthStory({ title, description, quote }: { title: string; description: string; quote: string }) {
  return (
    <aside className="auth-story-panel" aria-label="Giới thiệu An Hưu">
      <Link to="/" className="site-brand is-light" aria-label="Trang chủ An Hưu">
        <BrandLogo inverted />
      </Link>

      <div className="auth-story-content">
        <Badge tone="soft">ĐỒNG HÀNH DÀI HẠN</Badge>
        <h2>{title}</h2>
        <p>{description}</p>

        <div className="auth-mini-plan">
          <div>
            <span>Tiến độ mô phỏng mẫu</span>
            <strong>Tuổi 60 · 8.5 tỷ đ</strong>
          </div>
          <div className="progress-track" role="progressbar" aria-valuenow={65} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ "--progress": "65%" } as React.CSSProperties} />
          </div>
          <div className="mini-milestones">
            <span className="is-complete">30t</span>
            <span className="is-complete">40t</span>
            <span className="is-complete">50t</span>
            <span>60t</span>
          </div>
        </div>
      </div>

      <blockquote>
        "{quote}"
      </blockquote>
    </aside>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
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
    const loggedUser = await login(cleanEmail, cleanPassword);
    setLoading(false);
    if (loggedUser) {
      if (loggedUser.role === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/user/dashboard");
      }
    } else {
      setError("Email hoặc mật khẩu không đúng.");
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
        title="Quản lý kế hoạch hưu trí của riêng bạn"
        description="Đăng nhập để theo dõi tiến độ tích lũy, cập nhật tài sản và trò chuyện cùng Trợ lý AI bất cứ lúc nào."
        quote="Sự an tâm về tài chính trong tương lai bắt đầu từ những quyết định sáng suốt và kiên định hôm nay."
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span>CHÀO MỪNG TRỞ LẠI</span>
            <h1>Đăng nhập An Hưu</h1>
            <p>Nhập email và mật khẩu để truy cập không gian tài chính của bạn.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <Input
              label="Địa chỉ Email"
              type="email"
              placeholder="tenban@email.com"
              value={email}
              onChange={(val) => { setEmail(val); setError(""); }}
              autoComplete="email"
            />

            <div>
              <label className="form-field" htmlFor="login-password">
                <span className="field-label">Mật khẩu</span>
                <span className="input-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                <Checkbox
                  checked={remember}
                  label="Ghi nhớ đăng nhập"
                  onChange={setRemember}
                />
                <Link to="/forgot-password" className="auth-text-action">
                  Quên mật khẩu?
                </Link>
              </div>
            </div>

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
              Đăng nhập vào tài khoản
            </Button>

            <div className="auth-divider">hoặc tiếp tục với</div>

            <button
              type="button"
              className="social-button"
              onClick={async () => {
                await performLogin("user@demo.com", "demo123");
              }}
            >
              <GoogleIcon />
              <span>Đăng nhập với Google</span>
            </button>

            <div className="auth-switch-prompt">
              <span>Chưa có tài khoản?</span>{" "}
              <Link to="/register" className="auth-switch-link">
                Đăng ký ngay
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
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      setError("Vui lòng điền các thông tin bắt buộc.");
      return;
    }
    if (!agree) {
      setError("Vui lòng đồng ý với điều khoản sử dụng.");
      return;
    }
    setLoading(true);
    setError("");
    setTimeout(() => {
      setLoading(false);
      navigate("/verify");
    }, 600);
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Bắt đầu hành trình chuẩn bị cho tương lai"
        description="Tạo tài khoản miễn phí trong 1 phút để lưu trữ hồ sơ tài chính, mô phỏng mục tiêu và nhận kế hoạch cá nhân hóa."
        quote="Biết mình cần bao nhiêu tiền cho tuổi già là bước đầu tiên để không bao giờ phải lo lắng về nó nữa."
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span>TẠO HỒ SƠ MIỄN PHÍ</span>
            <h1>Đăng ký tài khoản</h1>
            <p>Khởi đầu kế hoạch tài chính độc lập và vững chắc cho tuổi hưu.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <Input
              label="Họ và tên"
              placeholder="Nguyễn Minh An"
              value={fullName}
              onChange={setFullName}
              autoComplete="name"
            />

            <Input
              label="Địa chỉ Email"
              type="email"
              placeholder="minhan@example.com"
              value={email}
              onChange={(val) => { setEmail(val); setError(""); }}
              autoComplete="email"
            />

            <Input
              label="Số điện thoại (tùy chọn)"
              type="text"
              placeholder="0912 345 678"
              value={phone}
              onChange={setPhone}
              inputMode="numeric"
            />

            <label className="form-field" htmlFor="register-password">
              <span className="field-label">Mật khẩu (tối thiểu 8 ký tự)</span>
              <span className="input-wrap">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Tạo mật khẩu an toàn"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
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

            <Checkbox
              checked={agree}
              label="Tôi đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của An Hưu"
              onChange={setAgree}
            />

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
              Tạo tài khoản & Nhận mã OTP <Icon name="arrow-right" />
            </Button>

            <div className="auth-divider">hoặc đăng ký nhanh bằng</div>

            <button
              type="button"
              className="social-button"
              onClick={() => {
                setLoading(true);
                setTimeout(() => {
                  setLoading(false);
                  navigate("/verify");
                }, 500);
              }}
            >
              <GoogleIcon />
              <span>Đăng ký bằng tài khoản Google</span>
            </button>

            <div className="auth-switch-prompt">
              <span>Đã có tài khoản?</span>{" "}
              <Link to="/login" className="auth-switch-link">
                Đăng nhập ngay
              </Link>
            </div>
          </form>
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 600);
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Khôi phục quyền truy cập tài khoản"
        description="Đừng lo lắng, chúng tôi sẽ hỗ trợ bạn lấy lại mật khẩu an toàn thông qua email xác thực đã đăng ký."
        quote="Mọi dữ liệu tài chính của bạn vẫn được mã hóa và lưu trữ an toàn."
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
                  onChange={setEmail}
                  autoComplete="email"
                />

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
  const [code, setCode] = useState("849201");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setLoading(true);
    setError("");
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 600);
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
  const [code, setCode] = useState("682490");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // Navigate to Onboarding (Phase 3)
      navigate("/onboarding");
    }, 600);
  };

  const handleResend = () => {
    setResending(true);
    setTimeout(() => {
      setResending(false);
      setResendNotice("Mã xác thực mới đã được gửi tới email của bạn.");
    }, 800);
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Xác thực danh tính tài khoản"
        description="Để đảm bảo chỉ duy nhất bạn có quyền xem và chỉnh sửa dữ liệu tài chính, chúng tôi đã gửi mã xác thực 6 chữ số tới email của bạn."
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
              <p style={{ color: "var(--color-success)", fontSize: "12px", margin: 0 }}>
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
