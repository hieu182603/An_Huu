import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import ResponsiveDialog from "../components/ResponsiveDialog";
import { Badge, BrandLogo, Button, Checkbox, GoogleIcon, Icon, Input, useNotification } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { resumeDestination } from "../services/navigation";
import { apiRequest, forgetSession, validPassword } from "../services/api";
import { isGoogleAuthConfigured, triggerGoogleSignIn } from "../services/googleAuth";
import { trackLoginEvent, trackSignUpEvent } from "../services/googleAnalytics";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Yêu cầu chưa thành công. Vui lòng thử lại.";
};

function AuthStory({
  title,
  highlight,
  sub,
  badge,
  description,
  quote,
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
  const displayTitle = title || "An tâm tài chính, thảnh thơi tuổi vàng.";
  const displayHighlight = highlight || "8,5 TỶ ĐỒNG";
  const displaySub = sub || "Mục tiêu tuổi 60";
  const displayBadge = badge || "Tự chủ tương lai";

  return (
    <aside className="auth-story-panel" aria-label="Giới thiệu An Hưu">
      <div className="auth-story-top">
        <Link to="/" className="auth-story-brand-link" aria-label="Về trang chủ An Hưu">
          <BrandLogo inverted />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span className="auth-story-badge">
            <Icon name="sparkles" size="small" />
            <span>{displayBadge}</span>
          </span>
        </div>
      </div>

      <div className="auth-story-center">
        <h2 className="auth-minimal-headline">{displayTitle}</h2>
        {description && <p style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "14px", margin: "8px 0 16px" }}>{description}</p>}
        {quote && <blockquote style={{ color: "rgba(255, 255, 255, 0.7)", fontStyle: "italic", fontSize: "13px", margin: "8px 0 16px" }}>"{quote}"</blockquote>}

        {/* Minimalist Floating Wealth Widget */}
        <div className="auth-minimal-card">
          <div className="auth-minimal-card-header">
            <strong className="auth-minimal-val">{displayHighlight}</strong>
            <span className="auth-minimal-sub">{displaySub}</span>
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
            <span>Lập kế hoạch chủ động</span>
          </span>
          <span className="auth-minimal-pill">
            <Icon name="check" size="small" />
            <span>Quản lý dữ liệu cá nhân</span>
          </span>
        </div>
      </div>

      <div className="auth-story-bottom">
        <span className="auth-minimal-footer">© 2026 An Hưu. Nền tảng hưu trí độc lập</span>
      </div>
    </aside>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithGoogle, initializing } = useAuth();
  const { notify } = useNotification();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleAuth = async () => {
    setError("");
    if (!isGoogleAuthConfigured()) {
      const msg = "Đăng nhập Google chưa sẵn sàng. Bạn có thể tiếp tục bằng email và mật khẩu.";
      setError(msg);
      notify.warning("Chưa cấu hình Google OAuth", msg);
      return;
    }

    try {
      await triggerGoogleSignIn(
        async (_payload, credential) => {
          const u = await loginWithGoogle(credential);
          trackLoginEvent("google");
          notify.success("Đăng nhập Google thành công", `Chào mừng bạn trở lại, ${u.name}!`);
          navigate(resumeDestination(location.state?.from, u.role), { replace: true });
        },
        (err) => {
          console.error("Google Auth Error:", err);
          setError(getErrorMessage(err));
        }
      );
    } catch (err: unknown) {
      console.error(err);
      setError("Không thể khởi động Google Sign-In. Vui lòng kiểm tra cấu hình mạng hoặc Google Cloud Console.");
    }
  };

  const performLogin = async (loginEmail: string, loginPass: string) => {
    const cleanEmail = (loginEmail || "").trim();
    const cleanPassword = loginPass || "";
    if (!cleanEmail || !cleanPassword) {
      const msg = "Vui lòng điền đầy đủ email và mật khẩu.";
      setError(msg);
      notify.error("Thông tin chưa đầy đủ", msg);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const loggedUser = await login(cleanEmail, cleanPassword, remember);
      const targetDestination = resumeDestination(
        location.state?.from,
        loggedUser.role,
        (location.state as { isNewUser?: boolean } | null)?.isNewUser ? "/onboarding" : undefined
      );
      navigate(targetDestination, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
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
        sub="Ví dụ minh họa ở tuổi 60"
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
                    placeholder="yourname@email.com"
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
                label="Ghi nhớ đăng nhập"
                onChange={setRemember}
              />
              <Link to="/forgot-password" className="auth-forgot-link">
                Quên mật khẩu?
              </Link>
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
              disabled={loading || initializing}
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
              disabled={loading || initializing}
              onClick={handleGoogleAuth}
            >
              <GoogleIcon />
              <span>Đăng nhập nhanh với Google</span>
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <span style={{ color: "#7B8F9D", fontSize: "13px" }}>Chưa có tài khoản? </span>
              <Link to="/register" state={{ from: location.state?.from }} className="auth-switch-link">
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
  const location = useLocation();
  const { login, loginWithGoogle, initializing } = useAuth();
  const { notify } = useNotification();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP Modal State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [registeredPassword, setRegisteredPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpError, setOtpError] = useState("");
  const [otpSuccessNotice, setOtpSuccessNotice] = useState("");

  useEffect(() => {
    if (!otpCooldown) return;
    const timer = window.setTimeout(() => setOtpCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [otpCooldown]);

  const handleGoogleAuth = async () => {
    setError("");
    if (!isGoogleAuthConfigured()) {
      const msg = "Đăng nhập Google chưa sẵn sàng. Bạn có thể tiếp tục bằng email và mật khẩu.";
      setError(msg);
      notify.warning("Chưa cấu hình Google OAuth", msg);
      return;
    }

    try {
      await triggerGoogleSignIn(
        async (_payload, credential) => {
          const u = await loginWithGoogle(credential);
          trackSignUpEvent("google");
          notify.success("Đăng ký thành công với Google", `Chào mừng bạn gia nhập An Hưu, ${u.name}!`);
          navigate(resumeDestination(location.state?.from, u.role, "/onboarding"), { replace: true });
        },
        (err) => {
          console.error("Google Auth Error:", err);
          setError(getErrorMessage(err));
        }
      );
    } catch (err: unknown) {
      console.error(err);
      setError("Không thể khởi động Google Sign-In. Vui lòng kiểm tra cấu hình mạng hoặc Google Cloud Console.");
    }
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (!cleanName || !cleanEmail || !cleanPassword) {
      const msg = "Vui lòng điền đầy đủ họ tên, email và mật khẩu.";
      setError(msg);
      notify.error("Thông tin chưa đầy đủ", msg);
      return;
    }
    if (!validPassword(cleanPassword)) {
      const msg = "Mật khẩu cần ít nhất 12 ký tự và tối đa 72 byte UTF-8.";
      setError(msg);
      notify.warning("Mật khẩu chưa đủ an toàn", msg);
      return;
    }
    if (!agree) {
      const msg = "Vui lòng đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.";
      setError(msg);
      notify.warning("Điều khoản dịch vụ", msg);
      return;
    }
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/[ ()-]/g, "");
      if (cleanPhone && !/^(?:0|\+84)[35789]\d{8}$/.test(cleanPhone)) {
        setError("Vui lòng nhập số điện thoại di động Việt Nam hợp lệ.");
        return;
      }
      await apiRequest("/auth/register", { fullName: cleanName, email: cleanEmail, password: cleanPassword, ...(cleanPhone ? { phone: cleanPhone } : {}) });
      trackSignUpEvent("email");
      setRegisteredEmail(cleanEmail);
      setRegisteredPassword(cleanPassword);
      setOtpCode("");
      setOtpError("");
      setOtpSuccessNotice("Mã xác thực gồm 6 chữ số đã được gửi tới email của bạn.");
      setOtpCooldown(60);
      setShowOtpModal(true);
      notify.success("Đăng ký thành công", "Vui lòng nhập mã OTP để kích hoạt tài khoản.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResending || otpCooldown > 0 || otpLoading) return;
    setOtpResending(true);
    setOtpError("");
    setOtpSuccessNotice("");
    try {
      await apiRequest("/auth/resend-verification", { email: registeredEmail });
      setOtpCooldown(60);
      setOtpSuccessNotice("Mã mới đã được gửi qua email. Hãy kiểm tra hộp thư của bạn.");
      notify.success("Đã gửi mã xác minh", "Vui lòng kiểm tra hộp thư đến hoặc mục thư rác (Spam).");
    } catch (err) {
      setOtpError(getErrorMessage(err));
    } finally {
      setOtpResending(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    const cleanOtp = otpCode.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      const msg = "Mã OTP phải gồm đúng 6 chữ số.";
      setOtpError(msg);
      notify.error("Mã OTP không hợp lệ", msg);
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      await apiRequest("/auth/verify-email", { email: registeredEmail, otp: cleanOtp });
      notify.success("Xác thực hoàn tất", "Tài khoản của bạn đã được kích hoạt thành công!");
      try {
        const loggedUser = await login(registeredEmail, registeredPassword, true);
        navigate(resumeDestination(location.state?.from, loggedUser.role, "/onboarding"), { replace: true });
      } catch {
        navigate("/login", {
          replace: true,
          state: {
            from: location.state?.from || "/onboarding",
            isNewUser: true,
            email: registeredEmail,
          },
        });
      }
    } catch (err) {
      setOtpError(getErrorMessage(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const passwordStrength =
    password.length === 0 ? 0 : password.length >= 12 && /[0-9]/.test(password) && /[a-zA-Z]/.test(password) ? 3 : password.length >= 6 ? 2 : 1;

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
                      placeholder="yourname@email.com"
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
                  <span style={{
                    fontSize: "11.5px",
                    fontWeight: 600,
                    color: passwordStrength === 3
                      ? "var(--color-success, #10B981)"
                      : passwordStrength === 2
                      ? "var(--color-warning, #D97706)"
                      : passwordStrength === 1
                      ? "var(--color-danger, #EF4444)"
                      : "transparent",
                  }}>
                    {passwordStrength === 3
                      ? "Mạnh"
                      : passwordStrength === 2
                      ? "Trung bình"
                      : passwordStrength === 1
                      ? "Yếu (tối thiểu 12 ký tự)"
                      : ""}
                  </span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input has-eye"
                    placeholder="Tạo mật khẩu an toàn (tối thiểu 12 ký tự)"
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
                  <div className="auth-strength-meter" aria-label="Độ mạnh mật khẩu">
                    <div className={`strength-bar is-weak ${passwordStrength >= 1 ? "is-filled" : ""}`} />
                    <div className={`strength-bar is-medium ${passwordStrength >= 2 ? "is-filled" : ""}`} />
                    <div className={`strength-bar is-strong ${passwordStrength >= 3 ? "is-filled" : ""}`} />
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
              disabled={loading || initializing}
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span>Đang khởi tạo hồ sơ...</span>
                </>
              ) : (
                <>
                  <span>Tạo tài khoản</span>
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
              disabled={loading || initializing}
              onClick={handleGoogleAuth}
            >
              <GoogleIcon />
              <span>Đăng ký bằng tài khoản Google</span>
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <span style={{ color: "#7B8F9D", fontSize: "13px" }}>Đã có tài khoản? </span>
              <Link to="/login" state={{ from: location.state?.from }} className="auth-switch-link">
                Đăng nhập ngay <Icon name="arrow-right" size="small" />
              </Link>
            </div>
          </form>
        </div>

        {showOtpModal && (
          <ResponsiveDialog
            open={showOtpModal}
            title="Xác minh email"
            onClose={() => setShowOtpModal(false)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <Badge tone="info">BƯỚC CUỐI CÙNG</Badge>
                </div>
                <h3 style={{ margin: "0 0 6px", fontSize: "20px", color: "var(--color-primary-700)", fontWeight: 700 }}>
                  Xác minh email
                </h3>
                <p style={{ margin: 0, fontSize: "14px", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                  Nhập mã OTP gồm 6 chữ số được gửi tới hộp thư của bạn.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--color-bg)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  gap: "12px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                    Email cần xác minh
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-primary-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {registeredEmail}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-secondary-600)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "underline",
                    flexShrink: 0,
                    padding: "4px 0",
                  }}
                >
                  Đổi email khác? Quay lại
                </button>
              </div>

              <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="auth-field-item">
                  <label className="auth-field-label" htmlFor="register-otp-input">
                    <span>Mã OTP 6 số</span>
                  </label>
                  <div className="auth-input-wrapper">
                    <input
                      id="register-otp-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                      placeholder="682490"
                      value={otpCode}
                      onChange={(e) => {
                        setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setOtpError("");
                      }}
                      style={{
                        fontSize: "26px",
                        fontWeight: 700,
                        letterSpacing: "8px",
                        textAlign: "center",
                        height: "54px",
                        fontFamily: "monospace, sans-serif",
                      }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={otpResending || otpLoading || otpCooldown > 0}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontSize: "13px",
                      fontWeight: 600,
                      color: otpCooldown > 0 ? "var(--color-text-muted)" : "var(--color-secondary-600)",
                      cursor: otpCooldown > 0 ? "default" : "pointer",
                    }}
                  >
                    {otpResending
                      ? "Đang gửi lại mã..."
                      : otpCooldown > 0
                      ? `Gửi lại sau ${otpCooldown} giây`
                      : "Chưa nhận được mã? Gửi lại OTP"}
                  </button>
                </div>

                {otpSuccessNotice && (
                  <p
                    role="status"
                    style={{
                      color: "var(--color-success, #007A3D)",
                      fontSize: "12px",
                      margin: 0,
                      fontWeight: 500,
                    }}
                  >
                    {otpSuccessNotice}
                  </p>
                )}

                {otpError && (
                  <div className="auth-error-banner" role="alert" style={{ margin: 0 }}>
                    <Icon name="alert" size="small" />
                    <span>{otpError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="auth-btn-primary"
                  disabled={otpLoading || otpCode.trim().length !== 6}
                  style={{ height: "48px", marginTop: "4px" }}
                >
                  {otpLoading ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      <span>Đang xác nhận mã...</span>
                    </>
                  ) : (
                    <>
                      <span>Xác nhận email & Đăng nhập</span>
                      <Icon name="arrow-right" size="small" />
                    </>
                  )}
                </button>

                <div
                  className="auth-security"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    marginTop: "4px",
                  }}
                >
                  <Icon name="info" size="small" />
                  <span>Mã xác thực có hiệu lực trong vòng 15 phút kể từ lúc gửi.</span>
                </div>
              </form>
            </div>
          </ResponsiveDialog>
        )}
      </main>
    </div>
  );
}

export function ForgotPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const msg = "Vui lòng nhập một địa chỉ email hợp lệ.";
      setError(msg);
      notify.error("Email không hợp lệ", msg);
      return;
    }
    setLoading(true);
    try {
      await apiRequest("/auth/forgot-password", { email: cleanEmail });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Khôi phục quyền truy cập tài khoản"
        description="Đừng lo lắng, chúng tôi sẽ hỗ trợ bạn lấy lại mật khẩu an toàn thông qua email xác thực đã đăng ký."
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-form-wrap">
          {!sent ? (
            <>
              <div className="auth-heading">
                <span>QUÊN MẬT KHẨU</span>
                <h1>Đặt lại mật khẩu</h1>
                <p>Nhập email tài khoản An Hưu của bạn. Nếu tài khoản phù hợp, chúng tôi sẽ gửi đường dẫn đặt lại mật khẩu.</p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit}>
                <Input
                  label="Email đã đăng ký"
                  type="email"
                  placeholder="yourname@email.com"
                  value={email}
                  onChange={(value) => { setEmail(value); setError(""); }}
                  autoComplete="email"
                />

                {error && (
                  <div className="auth-error-banner" role="alert">
                    <Icon name="alert" size="small" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  loading={loading}
                >
                  Gửi mã xác nhận đặt lại
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
              <Badge tone="success">ĐÃ TIẾP NHẬN YÊU CẦU</Badge>
              <h1>Kiểm tra hòm thư của bạn</h1>
              <p>
                Nếu tài khoản phù hợp, hướng dẫn đặt lại mật khẩu sẽ được gửi tới {email}. Vui lòng kiểm tra cả thư mục Spam nếu không thấy trong hộp thư chính.
              </p>
              <Button variant="primary" size="large" onClick={() => navigate("/login")}>
                Quay lại đăng nhập <Icon name="arrow-right" />
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
  const { notify } = useNotification();

  const [code] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  useEffect(() => { window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); }, []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[a-zA-Z0-9_-]{43}$/.test(code)) {
      setError("Liên kết đặt lại mật khẩu không hợp lệ. Hãy yêu cầu một email mới.");
      return;
    }
    if (!validPassword(newPassword)) {
      const msg = "Mật khẩu mới cần ít nhất 12 ký tự và tối đa 72 byte UTF-8.";
      setError(msg);
      notify.warning("Mật khẩu quá ngắn", msg);
      return;
    }
    if (newPassword !== confirmPassword) {
      const msg = "Mật khẩu xác nhận không khớp.";
      setError(msg);
      notify.error("Mật khẩu không khớp", msg);
      return;
    }
    setLoading(true);
    try {
      await apiRequest("/auth/reset-password", { token: code, password: newPassword });
      forgetSession();
      setSuccess(true);
      notify.success("Đổi mật khẩu thành công", "Bạn có thể đăng nhập bằng mật khẩu mới.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
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
                <p>Đặt mật khẩu mới bằng liên kết bạn nhận được qua email.</p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit}>
                {!code && (
                  <p role="alert">
                    Hãy mở liên kết trong email hoặc <Link to="/forgot-password">yêu cầu liên kết mới</Link>.
                  </p>
                )}

                <label className="form-field" htmlFor="reset-new-password">
                  <span className="field-label">Mật khẩu mới (tối thiểu 12 ký tự)</span>
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
                  <p role="alert" style={{ color: "var(--color-danger)", fontSize: "12px", margin: 0 }}>
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  loading={loading}
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
  const { notify } = useNotification();
  const location = useLocation();

  const [email, setEmail] = useState(() => (location.state as { email?: string } | null)?.email
    || new URLSearchParams(window.location.hash.slice(1)).get("email") || "");
  useEffect(() => { if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); }, []);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setResendSuccess(false);
    if (!/^\d{6}$/.test(code.trim())) {
      const msg = "Mã OTP phải gồm đúng 6 chữ số.";
      setResendNotice(msg);
      notify.error("Mã OTP không hợp lệ", msg);
      return;
    }
    setLoading(true);
    setResendNotice("");
    try {
      await apiRequest("/auth/verify-email", { email: email.trim(), otp: code.trim() });
      notify.success(
        "Xác thực hoàn tất",
        "Tài khoản đã được kích hoạt. Vui lòng đăng nhập."
      );
      navigate("/login", {
        replace: true,
        state: {
          from: (location.state as { from?: string } | null)?.from || "/onboarding",
          isNewUser: (location.state as { isNewUser?: boolean } | null)?.isNewUser ?? true,
        },
      });
    } catch (err) {
      setResendNotice(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending || cooldown || loading) return;
    setResendSuccess(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setResendNotice("Vui lòng nhập email hợp lệ để nhận mã xác minh.");
      return;
    }
    setResending(true);
    setResendNotice("");
    try {
      await apiRequest("/auth/resend-verification", { email: email.trim() });
      setResendSuccess(true);
      setCooldown(60);
      setResendNotice(
        "Nếu tài khoản phù hợp, mã mới sẽ được gửi qua email. Hãy chờ ít nhất 60 giây trước khi yêu cầu lại."
      );
    } catch (err) {
      setResendNotice(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthStory
        title="Xác thực danh tính tài khoản"
        description="Nhập mã 6 chữ số được gửi đến email của bạn để kích hoạt tài khoản."
        quote="Xác minh email giúp bảo vệ quyền truy cập vào tài khoản của bạn."
      />

      <main className="auth-form-panel" id="main-content">
        <div className="auth-topbar">
          <Link to="/" className="site-brand" aria-label="Trang chủ An Hưu">
            <BrandLogo />
          </Link>
          <div className="auth-topbar-action">
            <span>Đổi email khác?</span>
            <Link to="/register" state={{ from: location.state?.from }} className="auth-switch-link">Quay lại</Link>
          </div>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span>BƯỚC CUỐI CÙNG</span>
            <h1>Xác minh email</h1>
            <p>Nhập mã OTP gồm 6 chữ số được gửi tới hộp thư của bạn.</p>
          </div>

          <form className="auth-form" onSubmit={handleVerify}>
            <Input
              label="Email cần xác minh"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
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
                disabled={resending || loading || cooldown > 0}
              >
                {resending
                  ? "Đang gửi lại mã..."
                  : cooldown > 0
                  ? `Gửi lại sau ${cooldown} giây`
                  : "Chưa nhận được mã? Gửi lại OTP"}
              </button>
            </div>

            {resendNotice && (
              <p
                role={resendSuccess ? "status" : "alert"}
                style={{
                  color: resendSuccess ? "var(--color-primary-700)" : "var(--color-danger)",
                  fontSize: "12px",
                  margin: 0,
                }}
              >
                {resendNotice}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="large"
              loading={loading}
            >
              Xác nhận email & Đăng nhập <Icon name="arrow-right" />
            </Button>

            <div className="auth-security">
              <Icon name="info" size="small" />
              <span>Mã xác thực có hiệu lực trong vòng 15 phút kể từ lúc gửi.</span>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
