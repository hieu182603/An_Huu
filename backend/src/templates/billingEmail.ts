import { escapeHtml } from "./authEmail";

/** Plain, calm Vietnamese billing emails. Receipts say "Biên nhận" — these are not tax invoices. */
export type BillingEmail =
  | { kind: "issued" | "reminder"; name: string; period: string; amountVnd: number; dueDate: Date; link: string }
  | { kind: "receipt"; name: string; period: string; amountVnd: number; receivedAt: Date; reference: string | null; remainingVnd: number; link: string };

const money = (value: number) => value.toLocaleString("vi-VN") + "đ";
const day = (date: Date) => date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const month = (period: string) => `${period.slice(5)}/${period.slice(0, 4)}`;

export function renderBillingEmail(input: BillingEmail) {
  const url = new URL(input.link);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("INVALID_MAIL_LINK");
  const name = input.name.trim() || "bạn", when = month(input.period);
  let subject: string, lines: string[], cta: string;
  if (input.kind === "receipt") {
    subject = `Biên nhận thanh toán phí dịch vụ An Hưu tháng ${when}`;
    lines = [
      `An Hưu đã nhận ${money(input.amountVnd)} cho phí dịch vụ tháng ${when} vào ${input.receivedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} (giờ Việt Nam).`,
      ...(input.reference ? [`Mã tham chiếu giao dịch: ${input.reference}.`] : []),
      input.remainingVnd > 0 ? `Kỳ phí này còn ${money(input.remainingVnd)}. Bạn có thể thanh toán phần còn lại trong mục Phí dịch vụ.` : "Kỳ phí tháng này đã được thanh toán đủ.",
      "Đây là biên nhận thanh toán dịch vụ, không phải chứng từ thuế.",
      "Cảm ơn bạn đã đồng hành cùng An Hưu.",
    ];
    cta = "Xem biên nhận";
  } else {
    const reminder = input.kind === "reminder";
    subject = reminder ? `Nhắc nhẹ: phí dịch vụ An Hưu tháng ${when}` : `Phí dịch vụ An Hưu tháng ${when}`;
    lines = [
      reminder ? `Phí dịch vụ tháng ${when} (${money(input.amountVnd)}) sắp đến hạn thanh toán vào ngày ${day(input.dueDate)}.`
        : `Kỳ phí dịch vụ tháng ${when} của bạn là ${money(input.amountVnd)}, hạn thanh toán ngày ${day(input.dueDate)}.`,
      "Bạn có thể thanh toán bằng mã VietQR trong mục Phí dịch vụ của tài khoản.",
      "Nếu bạn đã thanh toán, vui lòng bỏ qua email này.",
    ];
    cta = "Mở mục Phí dịch vụ";
  }
  const text = [`Xin chào ${name},`, "", ...lines, "", `${cta}: ${url.href}`, "", "An Hưu"].join("\n");
  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#102a43;">
<div style="max-width:560px;margin:0 auto;padding:24px;"><div style="background:#ffffff;border-radius:14px;padding:28px;">
<h1 style="font-size:20px;margin:0 0 16px;color:#0d4c92;">${escapeHtml(subject)}</h1>
<p style="margin:0 0 12px;">Xin chào ${escapeHtml(name)},</p>
${lines.map(line => `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(line)}</p>`).join("\n")}
<p style="margin:20px 0;"><a href="${escapeHtml(url.href)}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#0d4c92;color:#ffffff;text-decoration:none;font-weight:bold;">${escapeHtml(cta)}</a></p>
<p style="margin:0;color:#52667a;font-size:13px;">An Hưu</p></div></div></body></html>`;
  return { subject, text, html };
}
