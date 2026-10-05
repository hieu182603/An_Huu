import template from "./auth-email.json";

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

type AuthEmail = { kind: "verification" | "reset"; name: string; expiresAt: Date; code?: string; link: string };
export function renderAuthEmail(input: AuthEmail) {
  const reset = input.kind === "reset";
  const url = new URL(input.link);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("INVALID_MAIL_LINK");
  if (!reset && !/^\d{6}$/.test(input.code || "")) throw new Error("INVALID_MAIL_PAYLOAD");
  const link = escapeHtml(url.href);
  const remainingMinutes = Math.max(1, Math.ceil((input.expiresAt.getTime() - Date.now()) / 60000));
  const subject = reset ? "Đặt lại mật khẩu An Hưu" : "Mã xác thực tài khoản An Hưu";
  const cta = reset ? "Đặt lại mật khẩu" : "Mở trang xác minh";
  const values: Record<string, string> = {
    PREVIEW_TEXT: reset ? "Mở liên kết để đặt lại mật khẩu tài khoản An Hưu." : "Mã xác minh tài khoản An Hưu của bạn đã sẵn sàng.",
    EYEBROW: reset ? "KHÔI PHỤC TÀI KHOẢN" : "XÁC MINH EMAIL",
    HEADING: reset ? "Thiết lập mật khẩu mới" : "Xác thực tài khoản An Hưu",
    CUSTOMER_NAME: input.name,
    INTRO_TEXT: reset ? "hãy nhấn nút bên dưới để thiết lập mật khẩu mới cho tài khoản của bạn." : "vui lòng nhập mã OTP bên dưới để hoàn tất xác thực tài khoản.",
    SECURITY_LABEL: "Bảo mật tài khoản An Hưu",
    CODE_LABEL: reset ? "Liên kết bảo mật của bạn" : "Mã OTP của bạn",
    OTP_EXPIRE_MINUTES: String(remainingMinutes),
    SECURITY_NOTICE: reset ? "Không chia sẻ liên kết này. Nếu nút không mở được, hãy dùng liên kết trong phần văn bản của email." : "Không chia sẻ mã này. Mã chỉ được sử dụng một lần và hết hạn theo thời gian ghi trên email.",
    YEAR: String(new Date().getFullYear()),
  };
  // ACTION_HTML is trusted markup constructed here; all account values and URLs
  // are escaped even though the supplied design uses triple-brace placeholders.
  const action = `${reset ? "" : `<p style="margin:0;padding:0">${escapeHtml(input.code!)}</p>`}
    <a href="${link}" style="display:inline-block;margin-top:${reset ? "0" : "20px"};padding:14px 22px;border-radius:12px;background:#86D8C7;color:#0D2E59;font-family:Arial,sans-serif;font-size:16px;line-height:24px;font-weight:700;letter-spacing:0;text-decoration:none">${cta}</a>`;
  const html = template.html.replace(/\{\{\{([A-Z_]+)\}\}\}/g, (_match, key: string) => {
    if (key === "ACTION_HTML") return action;
    if (!(key in values)) throw new Error("UNKNOWN_MAIL_TEMPLATE_FIELD");
    return escapeHtml(values[key]);
  });
  const deadline = input.expiresAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const text = `Xin chào ${input.name},\n\n${reset ? "Mở liên kết để đặt lại mật khẩu:" : `Mã xác minh tài khoản của bạn: ${input.code}\nMở trang xác minh:`}\n${url.href}\n\nHết hạn lúc ${deadline} (giờ Việt Nam). Không chia sẻ ${reset ? "liên kết" : "mã"} này.\nNếu bạn không yêu cầu, hãy bỏ qua email này.\nAn Hưu`;
  return { subject, html, text };
}
