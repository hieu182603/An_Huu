// Human-readable labels for audit-log action codes (overview + reports).
const ACTION_TITLES: Record<string, [string, string]> = {
  KNOWLEDGE_CREATED: ["Thêm nguồn tri thức AI", "Knowledge source added"], KNOWLEDGE_EDITED: ["Sửa nguồn tri thức AI", "Knowledge source edited"],
  KNOWLEDGE_INDEXED: ["Lập chỉ mục nguồn tri thức", "Knowledge source indexed"], KNOWLEDGE_APPROVED: ["Phê duyệt nguồn tri thức", "Knowledge source approved"],
  KNOWLEDGE_WITHDRAWN: ["Thu hồi duyệt nguồn tri thức", "Knowledge approval withdrawn"],
  LEGAL_RULE_DRAFT_CREATED: ["Tạo bản nháp luật BHXH", "Legal rule draft created"], LEGAL_RULE_DRAFT_CHANGED: ["Cập nhật luật BHXH", "Legal rule updated"],
  ASSUMPTIONS_DRAFT_CREATED: ["Tạo bản nháp giả định", "Assumption draft created"], ASSUMPTIONS_DRAFT_UPDATED: ["Sửa bản nháp giả định", "Assumption draft updated"],
  ASSUMPTIONS_APPROVED: ["Phê duyệt giả định tài chính", "Assumptions approved"], ASSUMPTIONS_PUBLISHED: ["Ban hành giả định tài chính", "Assumptions published"],
  ASSUMPTIONS_IMPACT_REVIEWED: ["Rà soát tác động giả định", "Assumption impact reviewed"],
  PORTFOLIO_DRAFT_CREATED: ["Tạo bản nháp danh mục", "Portfolio draft created"], PORTFOLIO_DRAFT_UPDATED: ["Sửa bản nháp danh mục", "Portfolio draft updated"],
  PORTFOLIO_APPROVED: ["Phê duyệt danh mục đầu tư", "Portfolio approved"], PORTFOLIO_PUBLISHED: ["Ban hành danh mục đầu tư", "Portfolio published"],
  SUPPORT_STATUS: ["Đổi trạng thái ticket", "Ticket status changed"], SETTINGS_UPDATED: ["Cập nhật cấu hình hệ thống", "System settings updated"],
  AUTH_CHANGE_PASSWORD: ["Đổi mật khẩu", "Password changed"], AUTH_RESET_PASSWORD: ["Đặt lại mật khẩu", "Password reset"],
  AUTH_LOGOUT: ["Đăng xuất", "Logged out"], AUTH_LOGOUT_ALL: ["Đăng xuất mọi thiết bị", "Logged out everywhere"],
  AUTH_REFRESH_REUSE: ["Phát hiện dùng lại phiên (nghi vấn)", "Session token reuse detected"],
  AI_PRIVACY_UPDATED: ["Cập nhật quyền riêng tư AI", "AI privacy updated"], AI_HISTORY_DELETED: ["Xóa lịch sử trợ lý AI", "AI history deleted"],
  PRODUCT_CREATED: ["Thêm gói sản phẩm", "Product added"], PRODUCT_UPDATED: ["Cập nhật gói sản phẩm", "Product updated"],
  PARTNER_CREATED: ["Thêm đối tác", "Partner added"], PARTNER_UPDATED: ["Cập nhật đối tác", "Partner updated"],
  PRODUCT_CONSULT_REQUESTED: ["Yêu cầu tư vấn sản phẩm", "Product consultation requested"],
  PLAN_CALCULATED: ["Tính kế hoạch hưu trí", "Retirement plan calculated"], GOAL_UPDATED: ["Cập nhật mục tiêu hưu trí", "Retirement goal updated"],
};
export function getActionLabel(action: string, isEn: boolean): { title: string; icon: "users" | "settings" | "file-text" | "life-buoy" | "shield" } {
  switch (action) {
    case "AUTH_LOGIN":
    case "AUTH_LOGIN_GOOGLE":
      return { title: isEn ? "User Logged In" : "Đăng nhập hệ thống", icon: "users" };
    case "AUTH_REGISTER":
    case "AUTH_REGISTER_GOOGLE":
      return { title: isEn ? "New Account Registered" : "Đăng ký tài khoản mới", icon: "users" };
    case "AUTH_VERIFY_EMAIL":
      return { title: isEn ? "Email Verified" : "Xác minh email thành công", icon: "shield" };
    case "ACCOUNT_UPDATED":
    case "ACCOUNT_AVATAR_UPDATED":
      return { title: isEn ? "Account Profile Updated" : "Cập nhật hồ sơ tài khoản", icon: "settings" };
    case "PROFILE_UPDATED":
    case "ONBOARDING_COMPLETED":
      return { title: isEn ? "Financial Profile Updated" : "Cập nhật hồ sơ tài chính", icon: "settings" };
    case "CONTENT_CREATED":
    case "CONTENT_UPDATED":
      return { title: isEn ? "Article Published / Edited" : "Xuất bản bài viết kiến thức", icon: "file-text" };
    case "SUPPORT_CREATED":
    case "SUPPORT_REPLIED":
      return { title: isEn ? "Support Ticket Activity" : "Xử lý yêu cầu hỗ trợ", icon: "life-buoy" };
    case "ADMIN_USER_STATUS":
      return { title: isEn ? "User Status Changed" : "Điều chỉnh trạng thái tài khoản", icon: "shield" };
    default: {
      const label = ACTION_TITLES[action];
      return { title: label ? label[isEn ? 1 : 0] : action, icon: "shield" };
    }
  }
}
