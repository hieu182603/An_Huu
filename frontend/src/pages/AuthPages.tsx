import { useEffect, useRef, useState, Fragment, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import ResponsiveDialog from "../components/ResponsiveDialog";
import { Badge, BrandLogo, Button, Checkbox, GoogleIcon, Icon, Input, useNotification } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { resumeDestination } from "../services/navigation";
import { ApiError, apiRequest, forgetSession, validPassword } from "../services/api";
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
  const [pendingVerification, setPendingVerification] = useState<{ email: string; password: string; sentAt: number } | null>(null);

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
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        // Issue a fresh code (the backend ignores requests within 60s of the last one).
        await apiRequest("/auth/resend-verification", { email: cleanEmail }).catch(() => undefined);
        setPendingVerification({ email: cleanEmail, password: cleanPassword, sentAt: Date.now() });
      } else setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = async () => {
    if (!pendingVerification) return;
    const loggedUser = await login(pendingVerification.email, pendingVerification.password, remember);
    navigate(resumeDestination(location.state?.from, loggedUser.role, "/onboarding"), { replace: true });
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
        {pendingVerification && (
          <EmailOtpDialog
            email={pendingVerification.email}
            sentAt={pendingVerification.sentAt}
            intro="Tài khoản chưa xác minh email. Mã mới đã được gửi tới hộp thư của bạn."
            onClose={() => setPendingVerification(null)}
            onVerified={handleVerified}
          />
        )}
      </main>
    </div>
  );
}

function OtpSixDigitInput({
  value,
  onChange,
  hasError,
  autoFocus = true,
}: {
  value: string;
  onChange: (val: string) => void;
  hasError?: boolean;
  autoFocus?: boolean;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleInputChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, "");
    if (!rawVal) {
      const nextDigits = [...digits];
      nextDigits[index] = "";
      onChange(nextDigits.join(""));
      return;
    }

    if (rawVal.length > 1) {
      const pasted = rawVal.slice(0, 6);
      onChange(pasted);
      const nextFocus = Math.min(pasted.length, 5);
      inputsRef.current[nextFocus]?.focus();
      return;
    }

    const nextDigits = [...digits];
    nextDigits[index] = rawVal[rawVal.length - 1];
    const newCombined = nextDigits.join("");
    onChange(newCombined);

    if (index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const targetIndex = Math.min(pasted.length, 5);
      inputsRef.current[targetIndex]?.focus();
    }
  };

  return (
    <div className="otp-boxes-container">
      {/* Hidden input strictly for automation test locator and accessibility */}
      <input
        id="register-otp-input"
        aria-label="Mã OTP 6 số"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={(e) => {
          const clean = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(clean);
        }}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          border: 0,
        }}
        tabIndex={-1}
      />
      {digits.map((digit, idx) => (
        <Fragment key={idx}>
          {idx === 3 && <span className="otp-box-divider" aria-hidden="true" />}
          <input
            ref={(el) => { inputsRef.current[idx] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus={autoFocus && idx === 0}
            className={`otp-digit-slot ${digit ? "is-filled" : ""} ${hasError ? "has-error" : ""}`}
            value={digit}
            onChange={(e) => handleInputChange(idx, e)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            aria-label={`Số thứ ${idx + 1}`}
          />
        </Fragment>
      ))}
    </div>
  );
}

// Mirrors backend AuthService.issueVerification: EMAIL_VERIFICATION codes expire
// after 3 minutes and a new code can be requested 60 seconds after the last one.
const OTP_LIFETIME_SECONDS = 180;
const OTP_RESEND_AFTER_SECONDS = 60;
const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function EmailOtpDialog({ email, sentAt: initialSentAt, onClose, onVerified, intro }: {
  email: string;
  sentAt: number;
  onClose: () => void;
  onVerified: () => Promise<void>;
  intro?: string;
}) {
  const { notify } = useNotification();
  const [sentAt, setSentAt] = useState(initialSentAt);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(intro ?? "Mã gồm 6 chữ số đã được gửi tới email của bạn.");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - sentAt) / 1000));
  const remaining = Math.max(0, OTP_LIFETIME_SECONDS - elapsed);
  const expired = remaining === 0;
  const canResend = elapsed >= OTP_RESEND_AFTER_SECONDS;

  const resend = async () => {
    if (resending || loading || !canResend) return;
    setResending(true);
    setError("");
    try {
      await apiRequest("/auth/resend-verification", { email });
      setSentAt(Date.now());
      setNow(Date.now());
      setCode("");
      setNotice("Đã gửi mã mới. Mã cũ không còn dùng được.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Mã OTP phải gồm đúng 6 chữ số.");
      return;
    }
    if (expired) {
      setError("Mã đã hết hạn. Hãy gửi mã mới.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest("/auth/verify-email", { email, otp: code });
      notify.success("Xác thực hoàn tất", "Tài khoản của bạn đã được kích hoạt.");
      await onVerified();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveDialog open title="Xác minh email" onClose={onClose} className="otp-dialog-modal" hideHeader usePortal={false}>
      <div className="otp-card-header">
        <button type="button" className="otp-close-btn" aria-label="Đóng" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <div className="otp-badge-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h2 className="otp-title">Xác minh email</h2>
        <p className="otp-subtitle">Nhập mã 6 chữ số đã gửi tới</p>
        <p className="otp-email-value" data-testid="otp-email">{email}</p>
      </div>

      <form onSubmit={verify} noValidate>
        <OtpSixDigitInput value={code} onChange={(next) => { setCode(next); setError(""); }} hasError={Boolean(error)} autoFocus />

        <div className="otp-action-row">
          <span className={`otp-timer${expired ? " is-expired" : remaining <= 30 ? " is-ending" : ""}`} role="timer">
            {expired ? "Mã đã hết hạn" : <>Mã hết hạn sau <strong>{formatClock(remaining)}</strong></>}
          </span>
          {canResend && (
            <button type="button" className="otp-resend-btn" onClick={resend} disabled={resending || loading}>
              {resending ? "Đang gửi..." : "Gửi lại mã"}
            </button>
          )}
        </div>

        {error ? (
          <div className="otp-alert otp-alert-error" role="alert">
            <Icon name="alert" size="small" />
            <span>{error}</span>
          </div>
        ) : notice ? (
          <div className="otp-alert otp-alert-success" role="status">
            <Icon name="circle-check" size="small" />
            <span>{notice}</span>
          </div>
        ) : null}

        <button type="submit" className="otp-submit-btn" disabled={loading || expired || code.length !== 6}>
          {loading ? (
            <><span className="spinner" aria-hidden="true" /><span>Đang kích hoạt tài khoản...</span></>
          ) : (
            <><span>Xác nhận email & Đăng nhập</span><Icon name="arrow-right" size="small" /></>
          )}
        </button>

        <p className="otp-security-note">
          Không thấy email? Kiểm tra mục Thư rác. Nhập sai email thì đóng hộp này và sửa ngay trong form.
        </p>
      </form>
    </ResponsiveDialog>
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

  const registerSubmitRef = useRef<HTMLButtonElement>(null);
  const [pendingVerification, setPendingVerification] = useState<{ email: string; password: string; sentAt: number } | null>(null);

  const closeOtpModal = () => {
    setPendingVerification(null);
    // Wrong email? The user edits the registration form and submits again.
    requestAnimationFrame(() => document.getElementById("register-email")?.focus());
  };

  const handleVerified = async () => {
    if (!pendingVerification) return;
    try {
      const loggedUser = await login(pendingVerification.email, pendingVerification.password, true);
      navigate(resumeDestination(location.state?.from, loggedUser.role, "/onboarding"), { replace: true });
    } catch {
      navigate("/login", { replace: true, state: { from: location.state?.from || "/onboarding", isNewUser: true, email: pendingVerification.email } });
    }
  };

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
      setPendingVerification({ email: cleanEmail, password: cleanPassword, sentAt: Date.now() });
      notify.success("Đăng ký thành công", "Vui lòng nhập mã OTP để kích hoạt tài khoản.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
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
              ref={registerSubmitRef}
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

        {pendingVerification && (
          <EmailOtpDialog
            email={pendingVerification.email}
            sentAt={pendingVerification.sentAt}
            onClose={closeOtpModal}
            onVerified={handleVerified}
          />
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
