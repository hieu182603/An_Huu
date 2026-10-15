import { portfolioAssetLabel } from "../utils/portfolioGlidePath";

const roles: Record<string, [string, string]> = {
  CASH: ["Giữ chủ động và chuẩn bị cho khoản sắp cần; vẫn có rủi ro giảm sức mua.", "Keep money available for upcoming needs; purchasing power can still fall."],
  GOV_BOND: ["Gắn kỳ hạn với nhu cầu tiền; giá có thể thay đổi khi bán trước hạn.", "Match maturities to cash needs; prices can change when sold before maturity."],
  BOND: ["Hỗ trợ dòng thu theo kỳ hạn; cần xét rủi ro lãi suất và khả năng trả nợ của bên phát hành.", "Support scheduled income; consider interest-rate and issuer credit risk."],
  EQUITY: ["Hướng tới tăng trưởng dài hạn; giá có thể biến động mạnh trong ngắn hạn.", "Seek long-term growth; prices can fluctuate sharply over shorter periods."],
  GOLD: ["Đa dạng hóa danh mục; giá biến động và không tạo dòng thu định kỳ.", "Diversify the portfolio; prices fluctuate and do not generate regular income."],
  BALANCED: ["Kết hợp nhiều nhóm tài sản; vai trò phụ thuộc cơ cấu và chính sách của quỹ.", "Combine asset classes; the role depends on the fund's allocation and policy."],
  REAL_ESTATE: ["Có thể tạo tiền thuê hoặc nguồn tiền khi bán; cần tính thời gian và khả năng bán tài sản.", "May provide rental income or sale proceeds; account for the time and ability to sell."],
};

export function AssetRoles({ codes, language, labels }: { codes: string[]; language: "vi" | "en"; labels: Record<string, string> }) {
  const en = language === "en";
  return <section className="asset-roles" aria-label={en ? "Asset class roles" : "Vai trò từng nhóm tài sản"}>
    <h3>{en ? "What each asset class does" : "Vai trò từng nhóm tài sản"}</h3>
    <dl>{[...new Set(codes)].map(code => <div key={code} style={{ marginBottom: "var(--space-3)" }}><dt><strong>{portfolioAssetLabel(code, language, labels)}</strong></dt><dd style={{ margin: "var(--space-1) 0" }}>{roles[code === "STOCK" ? "EQUITY" : code]?.[en ? 1 : 0] ?? (en ? "Review the published asset description and liquidity before allocating." : "Cần xem mô tả và khả năng chuyển thành tiền của nhóm tài sản trước khi phân bổ.")}</dd></div>)}</dl>
    <p>{en ? "Asset-class information only; no specific product is ranked or recommended for your profile." : "Thông tin về nhóm tài sản; không xếp hạng hay khuyến nghị sản phẩm cụ thể theo hồ sơ của bạn."}</p>
  </section>;
}
