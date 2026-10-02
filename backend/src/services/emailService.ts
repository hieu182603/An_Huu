import { resend } from "../config/resend";

export class EmailService {
  private static fromAddress = process.env.EMAIL_FROM || "An Hưu <onboarding@resend.dev>";

  static async sendVerificationOtp(to: string, otp: string): Promise<boolean> {
    try {
      const { data, error } = await resend.emails.send({
        from: this.fromAddress,
        to: [to],
        subject: "Mã xác thực tài khoản An Hưu",
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #0f4c3a; padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">AN HƯU</h1>
              <p style="color: #a7f3d0; margin: 6px 0 0; font-size: 13px;">Nền Tảng Lập Kế Hoạch Hưu Trí & Tài Chính Dài Hạn</p>
            </div>
            <div style="padding: 32px 24px;">
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">Chào bạn,</p>
              <p style="color: #334155; font-size: 15px; line-height: 1.6;">Dưới đây là mã bảo mật dùng để xác thực tài khoản của bạn trên hệ thống An Hưu:</p>
              
              <div style="background-color: #f0fdf4; border: 1px dashed #0f4c3a; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
                <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f4c3a;">${otp}</span>
              </div>
              
              <p style="color: #64748b; font-size: 13px; line-height: 1.5;">Mã xác thực này có hiệu lực trong vòng <strong>15 phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ thông tin tài chính cá nhân của bạn.</p>
            </div>
            <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">Email tự động từ hệ thống An Hưu · Không phản hồi email này.</p>
            </div>
          </div>
        `,
      });

      if (error) {
        console.error("Resend API trả về lỗi:", error);
        return false;
      }

      console.log(` Đã gửi email xác thực qua Resend (ID: ${data?.id})`);
      return true;
    } catch (error) {
      console.error("Lỗi ngoại lệ khi gửi email qua Resend:", error);
      return false;
    }
  }

  static async sendConsultationConfirmation(to: string, userName: string, topic: string, time: string): Promise<boolean> {
    try {
      const { data, error } = await resend.emails.send({
        from: this.fromAddress,
        to: [to],
        subject: "Xác nhận yêu cầu tư vấn hưu trí — An Hưu",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0f4c3a;">Xin chào ${userName},</h2>
            <p>Yêu cầu tư vấn của bạn đã được ghi nhận thành công trên hệ thống An Hưu.</p>
            <p><strong>Chủ đề:</strong> ${topic}</p>
            <p><strong>Thời gian mong muốn:</strong> ${time}</p>
            <p style="color: #475569;">Chuyên viên cố vấn của An Hưu sẽ liên hệ lại với bạn qua số điện thoại/email trong vòng 24 giờ làm việc.</p>
          </div>
        `,
      });

      if (error) {
        console.error("Resend API trả về lỗi khi gửi xác nhận tư vấn:", error);
        return false;
      }

      console.log(` Đã gửi email xác nhận tư vấn qua Resend (ID: ${data?.id})`);
      return true;
    } catch (error) {
      console.error("Lỗi ngoại lệ khi gửi email tư vấn qua Resend:", error);
      return false;
    }
  }
}
