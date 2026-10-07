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
  const customerName = (input.name && input.name.trim()) ? input.name : "bạn";
  const values: Record<string, string> = {
    PREVIEW_TEXT: reset ? "Mở liên kết để đặt lại mật khẩu tài khoản An Hưu." : "Mã xác minh tài khoản An Hưu của bạn đã sẵn sàng.",
    EYEBROW: reset ? "KHÔI PHỤC TÀI KHOẢN" : "XÁC MINH EMAIL",
    HEADING_HTML: reset ? 'Thiết lập mật khẩu mới<br /><span style="color:#49c1aa;">An Hưu</span>' : 'Xác thực tài khoản<br /><span style="color:#49c1aa;">An Hưu</span>',
    CUSTOMER_NAME: customerName,
    INTRO_TEXT: reset ? "Vui lòng nhấn nút bên dưới để thiết lập mật khẩu mới cho tài khoản của bạn." : "Vui lòng nhập mã OTP bên dưới để hoàn tất xác thực tài khoản của bạn.",
    CODE_LABEL: reset ? "LIÊN KẾT ĐẶT LẠI MẬT KHẨU" : "MÃ OTP CỦA BẠN",
    EXPIRY_LABEL: reset ? "LIÊN KẾT CÓ HIỆU LỰC TRONG" : "MÃ NÀY CÓ HIỆU LỰC TRONG",
    OTP_EXPIRE_MINUTES: String(remainingMinutes),
    SECURITY_NOTICE: reset ? "Không chia sẻ liên kết này. Nếu nút không mở được, hãy dùng liên kết trong phần văn bản của email." : "Không chia sẻ mã này. Mã chỉ được sử dụng một lần và hết hạn theo thời gian ghi trên email.",
    YEAR: String(new Date().getFullYear()),
    SUBJECT: subject,
  };
  const digits = (input.code || "").split("").map(d =>
    `<td align="center" valign="middle" class="digit-cell" style="width:58px;height:72px;background:#eaf7fd;background-image:linear-gradient(#eaf7fd,#e6f4fb);border-radius:14px;font-size:42px;font-weight:800;color:#06295a;text-align:center;line-height:72px;">${escapeHtml(d)}</td>`
  ).join("");
  const action = reset
    ? `<div style="text-align:center;margin:24px 0 20px;">
        <a href="${link}" style="display:inline-block;padding:15px 36px;border-radius:14px;background:#0d4c92;background-image:linear-gradient(135deg,#0d4c92,#1c80c0);color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;letter-spacing:0.5px;box-shadow:0 8px 20px rgba(28,128,192,0.25);">${cta}</a>
      </div>`
    : `<table align="center" cellpadding="0" cellspacing="6" border="0" class="digits-table" style="margin:18px auto 20px auto;">
        <tr>${digits}</tr>
      </table>`;
  const html = template.html.replace(/\{\{\{([A-Z_]+)\}\}\}/g, (_match, key: string) => {
    if (key === "ACTION_HTML") return action;
    if (key === "HEADING_HTML") return values.HEADING_HTML;
    if (!(key in values)) throw new Error("UNKNOWN_MAIL_TEMPLATE_FIELD");
    return escapeHtml(values[key]);
  });
  const deadline = input.expiresAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const text = `Xin chào ${customerName},\n\n${reset ? "Mở liên kết để đặt lại mật khẩu:" : `Mã xác minh tài khoản của bạn: ${input.code}\nMở trang xác minh:`}\n${url.href}\n\nHết hạn lúc ${deadline} (giờ Việt Nam). Không chia sẻ ${reset ? "liên kết" : "mã"} này.\nNếu bạn không yêu cầu, hãy bỏ qua email này.\nAn Hưu`;
  return { subject, html, text };
}
