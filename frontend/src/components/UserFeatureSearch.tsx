import { useState } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../i18n";
import ResponsiveDialog from "./ResponsiveDialog";
import { Icon, type IconName } from "./ui";
import "./user-workspace-dialogs.css";

type Feature = { path: string; title: [string, string]; description: [string, string]; icon: IconName; aliases?: string };
const features: Feature[] = [
  { path: "/user/dashboard", title: ["Tổng quan", "Overview"], description: ["Tình hình và việc cần làm tiếp", "Your current position and next step"], icon: "home" },
  { path: "/user/profile", title: ["Tài chính của bạn", "Your finances"], description: ["Bức tranh thu chi, tài sản, nợ, lương hưu và gia đình", "Income, spending, assets, debts, pension and family"], icon: "wallet" },
  { path: "/user/profile?section=cashflow", title: ["Thu nhập và chi tiêu", "Income and expenses"], description: ["Kê khai chi tiết các khoản thu nhập và sinh hoạt hàng tháng", "Review monthly income and living expenses"], icon: "wallet", aliases: "thu chi dong tien cashflow salary luong" },
  { path: "/user/profile?section=assets", title: ["Tài sản & quỹ dự phòng", "Assets and emergency reserve"], description: ["Tài sản hiện có, tỷ lệ sở hữu và phần dành cho nghỉ hưu", "Assets, ownership shares and retirement allocation"], icon: "wallet", aliases: "tiet kiem nha dat vang savings" },
  { path: "/user/profile?section=debts", title: ["Khoản nợ & trả nợ", "Debts and repayments"], description: ["Dư nợ, tiền trả hàng tháng và so sánh cách trả nợ", "Balances, monthly payments and debt strategies"], icon: "wallet", aliases: "vay loan debt" },
  { path: "/user/profile?section=insurance", title: ["Lương hưu BHXH", "Social insurance pension"], description: ["Lịch sử tham gia và ước tính lương hưu", "Contribution history and estimated pension"], icon: "shield", aliases: "bao hiem xa hoi pension" },
  { path: "/user/profile?section=family", title: ["Gia đình & người phụ thuộc", "Family and dependents"], description: ["Thông tin gia đình và trách nhiệm tài chính", "Family details and financial responsibilities"], icon: "users" },
  { path: "/user/profile?section=constraints", title: ["Mục tiêu khác", "Other goals"], description: ["Tiền dành cho việc khác ngoài kế hoạch hưu trí", "Money reserved for goals beyond retirement"], icon: "target" },
  { path: "/user/goal", title: ["Mục tiêu nghỉ hưu", "Retirement goal"], description: ["Thời điểm nghỉ hưu và mức sống mong muốn", "Retirement timing and desired lifestyle"], icon: "target" },
  { path: "/user/plan", title: ["Kế hoạch nghỉ hưu", "Retirement plan"], description: ["Xem kết quả, điều chỉnh và lưu phương án", "Review, adjust and save your plan"], icon: "compass" },
  { path: "/user/risk-portfolio", title: ["Phân bổ tài sản", "Asset allocation"], description: ["Danh mục và khả năng chịu rủi ro", "Portfolio and risk tolerance"], icon: "shield", aliases: "rui ro risk investment dau tu" },
  { path: "/user/simulation", title: ["Cập nhật tình hình", "Track your progress"], description: ["Ghi nhận khoản góp và đối chiếu số dư thực tế", "Record contributions and reconcile actual balances"], icon: "chart", aliases: "theo doi thuc te actual tracking" },
  { path: "/user/simulation?tab=what-if", title: ["Điều chỉnh tương lai", "Future changes"], description: ["Xem tác động khi thu nhập, chi tiêu và tài sản thay đổi", "Explore changes in income, expenses and assets"], icon: "chart", aliases: "mo phong simulation kich ban" },
  { path: "/user/explore", title: ["Sản phẩm tài chính", "Financial products"], description: ["Khám phá và so sánh các giải pháp tài chính", "Explore and compare financial products"], icon: "briefcase", aliases: "marketplace tiet kiem trai phieu" },
  { path: "/user/knowledge", title: ["Kiến thức tài chính", "Financial knowledge"], description: ["Cẩm nang và giải thích thuật ngữ", "Guides and financial terminology"], icon: "file-text", aliases: "thu vien library glossary" },
  { path: "/user/assistant", title: ["Trợ lý AI", "AI assistant"], description: ["Hỏi và hiểu thêm về kế hoạch của bạn", "Ask questions about your plan"], icon: "sparkles", aliases: "tro ly chat bot chatbot hoi dap tu van" },
  { path: "/user/notifications", title: ["Thông báo", "Notifications"], description: ["Thông tin cập nhật và nhắc việc", "Updates and reminders"], icon: "bell" },
  { path: "/user/account", title: ["Thông tin cá nhân", "Personal information"], description: ["Quản lý hồ sơ tài khoản", "Manage your account profile"], icon: "users" },
  { path: "/user/account?tab=settings", title: ["Cài đặt tài khoản", "Account settings"], description: ["Bảo mật và tùy chọn thông báo", "Security and notification preferences"], icon: "settings", aliases: "mat khau email password" },
  { path: "/user/support", title: ["Hỗ trợ", "Support"], description: ["Gửi yêu cầu và theo dõi phản hồi", "Send a request and follow its progress"], icon: "life-buoy" },
];
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();

export default function UserFeatureSearch({ onClose }: { onClose: () => void }) {
  const { language } = useI18n();
  const en = language === "en", lang = en ? 1 : 0;
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const results = words.length ? features.filter(feature => {
    const haystack = normalize([...feature.title, ...feature.description, feature.aliases ?? ""].join(" "));
    return words.every(word => haystack.includes(word));
  }) : features.slice(0, 6);
  const select = (path: string) => { onClose(); navigate(path); };
  return <ResponsiveDialog open title={en ? "What would you like to find?" : "Bạn muốn tìm gì?"} onClose={onClose} className="user-workspace-dialog user-feature-search" initialFocusSelector="input[type=search]" fallbackFocusSelector=".topbar-search-trigger">
    <form onSubmit={event => { event.preventDefault(); if (words.length && results[0]) select(results[0].path); }}>
      <label className="sr-only" htmlFor="user-feature-query">{en ? "Find a feature" : "Tìm chức năng"}</label>
      <div className="feature-search-box"><Icon name="search" /><input id="user-feature-query" type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} aria-controls="user-feature-results" placeholder={en ? "Enter a feature name, without money amounts…" : "Nhập tên chức năng, không cần số tiền…"} onKeyDown={event => {
        if (event.key === "ArrowDown" && results.length) { event.preventDefault(); document.querySelector<HTMLButtonElement>("#user-feature-results button")?.focus(); }
      }} /></div>
    </form>
    <p className="feature-search-status" role="status">{words.length ? (en ? `${results.length} matching features` : `${results.length} chức năng phù hợp`) : (en ? "Quick access" : "Truy cập nhanh")}</p>
    <div id="user-feature-results" className="feature-search-results">
      {results.map(feature => <button type="button" key={feature.path} onClick={() => select(feature.path)} className="feature-search-result"><Icon name={feature.icon} /><span><strong>{feature.title[lang]}</strong><small>{feature.description[lang]}</small></span><Icon name="arrow-right" /></button>)}
      {!results.length && <div className="feature-search-empty"><strong>{en ? "No matching feature found" : "Không tìm thấy chức năng phù hợp"}</strong><p>{en ? "Try a shorter phrase such as pension, income or assistant." : "Thử từ ngắn hơn như BHXH, thu chi hoặc trợ lý."}</p></div>}
    </div>
  </ResponsiveDialog>;
}
