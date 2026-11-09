import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router';
import { Icon } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import MarketingLayout, { FinalCTA } from '../marketing/MarketingLayout';
import { ARTICLES_DATA, type KnowledgeArticle } from '../marketing/knowledgeContent';
import '../marketing/editorial-pages.css';
import './explore-products.css';

// Inline SVG vector icon components adhering to Hallmark Rule 11 & Impeccable standards
function PinIcon({ size = 13, style, className = '' }: { size?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', verticalAlign: '-2px', flexShrink: 0, ...style }}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function ClockIcon({ size = 12, style, className = '' }: { size?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', verticalAlign: '-2px', flexShrink: 0, ...style }}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

interface UserKnowledgeArticle {
  id: string;
  category: "plan" | "pension" | "tracking" | "allocation";
  categoryLabel: string;
  code: string;
  topic: string;
  title: string;
  body: string;
  image: string;
  badgeClass: string;
  badgeText: string;
  strategyTag: string;
  highlights: string[];
  heroLabel: string;
  heroVal: string;
  heroUnit: string;
  subLabel: string;
  subVal: string;
  strip: [string, string][];
  jumpRoute: string;
  jumpLabel: string;
  overview: string;
  specs: [string, string][];
  checklist: string[];
  takeaway: string;
}

const USER_KNOWLEDGE_ARTICLES: UserKnowledgeArticle[] = [
  {
    id: "kt-01",
    category: "plan",
    categoryLabel: "Kế hoạch",
    code: "KT-01 · 3 phút đọc",
    topic: "NGUYÊN LÝ SỨC MUA & LẠM PHÁT",
    title: "Vì sao tiền hôm nay khác tiền tương lai?",
    body: "Lạm phát làm thay đổi sức mua. Cùng một mức sống có thể cần số tiền lớn hơn trong tương lai. Khi so sánh, hãy kiểm tra hai con số đang dùng cùng mốc giá.",
    image: "/assets/product-deposit.jpg",
    badgeClass: "very_low",
    badgeText: "Nền tảng cốt lõi",
    strategyTag: "Quy đổi sức mua",
    highlights: [
      "Nhập chi tiêu theo giá hôm nay để dễ hình dung mức sống thực tế",
      "Mô hình tự động trượt giá 3,5%/năm để tính số tiền danh nghĩa khi nghỉ hưu",
    ],
    heroLabel: "Lạm phát quy chiếu",
    heroVal: "3,5%",
    heroUnit: "/năm",
    subLabel: "Hệ số sau 20 năm",
    subVal: "× 1,99 lần",
    strip: [
      ["Mốc nhập liệu", "Giá hôm nay"],
      ["Báo cáo dòng tiền", "2 chế độ giá"],
      ["Bước áp dụng", "Mục tiêu & Kế hoạch"],
    ],
    jumpRoute: "/user/goal",
    jumpLabel: "Mở Mục tiêu nghỉ hưu →",
    overview:
      "Trong kế hoạch hưu trí kéo dài 20–30 năm, 15 triệu đồng hôm nay không có cùng sức mua với 15 triệu đồng vào năm 2046. Để bạn không phải tự nhẩm tính trượt giá, An Hưu cho phép nhập mức chi mong muốn theo giá hôm nay, sau đó hệ thống tự động nhân hệ số lạm phát qua từng tháng.",
    specs: [
      ["Mức chi gốc (Giá hôm nay)", "15.000.000 ₫ / tháng (100% sức mua hiện tại)"],
      ["Sau 10 năm (Lạm phát 3,5%/năm)", "~ 21.160.000 ₫ / tháng (Hệ số trượt giá ×1,41)"],
      ["Sau 20 năm (Lạm phát 3,5%/năm)", "~ 29.850.000 ₫ / tháng (Hệ số trượt giá ×1,99)"],
      ["Sau 25 năm (Lạm phát 3,5%/năm)", "~ 35.450.000 ₫ / tháng (Hệ số trượt giá ×2,36)"],
      ["Nguyên tắc so sánh", "Chỉ so sánh hai con số khi cùng ở chế độ Giá hôm nay hoặc cùng ở Số tiền danh nghĩa"],
      ["Lương hưu cố định", "Nếu nguồn thu cố định danh nghĩa không tăng theo lạm phát, sức mua thực tế sẽ giảm dần qua các năm"],
    ],
    checklist: [
      "Khai báo mức chi tiêu hưu trí mong muốn theo đúng mặt bằng giá sinh hoạt hôm nay.",
      "Khi xem Bảng dòng tiền tháng, sử dụng bộ chuyển đổi Giá hôm nay / Số tiền danh nghĩa để đối chiếu.",
      "Kiểm tra lợi suất danh mục đầu tư dài hạn có vượt qua mức lạm phát 3,5%–4%/năm hay không.",
    ],
    takeaway:
      "Hiểu đúng sự khác biệt giữa mệnh giá và sức mua giúp bạn không đánh giá thấp số vốn cần chuẩn bị cho 20–30 năm tuổi già.",
  },
  {
    id: "kt-02",
    category: "plan",
    categoryLabel: "Kế hoạch",
    code: "KT-02 · 3 phút đọc",
    topic: "QUẢN TRỊ PHIÊN BẢN & ĐỐI SOÁT",
    title: "Đã lưu và đang áp dụng khác nhau thế nào?",
    body: "Bạn có thể lưu nhiều phương án để xem lại. Chỉ một phiên bản làm mốc theo dõi. Sửa hồ sơ hoặc lưu bản mới chưa tự thay phiên bản đang áp dụng.",
    image: "/assets/knowledge-plan.jpg",
    badgeClass: "low",
    badgeText: "Quản trị phương án",
    strategyTag: "Tách bản nháp & bản chính",
    highlights: [
      "Lưu nhiều kịch bản (nghỉ sớm, tăng mức góp, giảm chi) để đặt cạnh nhau so sánh",
      "Chỉ bản được xác nhận làm Kế hoạch chính mới dùng để đối soát sổ thực tế",
    ],
    heroLabel: "Kế hoạch chính",
    heroVal: "01 bản",
    heroUnit: "duy nhất",
    subLabel: "Phương án lưu thử",
    subVal: "Không giới hạn",
    strip: [
      ["Sửa hồ sơ", "Chưa đổi bản chính"],
      ["So sánh kịch bản", "Trực quan 3 cột"],
      ["Bước áp dụng", "Các bản đã lưu"],
    ],
    jumpRoute: "/user/plan?section=history",
    jumpLabel: "Mở Các bản đã lưu →",
    overview:
      "Khi lập kế hoạch tài chính cá nhân, bạn thường muốn thử nhiều câu hỏi Nếu-Thì (What-If): Nếu nghỉ hưu muộn hơn 3 năm thì sao? Nếu tăng mức góp thêm 2 triệu/tháng thì tỷ lệ đáp ứng tăng bao nhiêu? Cơ chế tách biệt 3 trạng thái của An Hưu bảo vệ kế hoạch chính của bạn khỏi bị ghi đè ngoài ý muốn.",
    specs: [
      ["1. Bản đang xem trước (Draft)", "Thay đổi ngay khi bạn sửa hồ sơ thu chi, tài sản hoặc mục tiêu. Dùng để thử nghiệm nhanh."],
      ["2. Phương án đã lưu (Saved Version)", "Bản chụp (snapshot) tại một thời điểm để lưu vào lịch sử và so sánh song song."],
      ["3. Kế hoạch chính (Active Plan)", "Phiên bản duy nhất được bạn bấm xác nhận Dùng làm kế hoạch chính để làm mốc theo dõi thực tế."],
      ["Tác động khi sửa hồ sơ", "Chỉ làm thay đổi bản xem trước; kế hoạch chính và sổ theo dõi tháng vẫn giữ nguyên mốc cũ."],
      ["Khi nào cần đổi bản chính?", "Khi thu nhập, chi tiêu hoặc mục tiêu sống thay đổi lâu dài và bạn đã kiểm tra kỹ kết quả mới."],
    ],
    checklist: [
      "Thử nghiệm các thay đổi trong phần So sánh phương án trước khi quyết định.",
      "Bấm Lưu phương án để giữ lại các kịch bản khả thi trong phiên làm việc.",
      "Chọn Dùng làm kế hoạch chính cho phương án sát với khả năng ngân sách nhất.",
    ],
    takeaway:
      "Luôn giữ một Kế hoạch chính ổn định làm la bàn đối soát, trong khi thoải mái thử nghiệm các phương án mới ở chế độ xem trước.",
  },
  {
    id: "kt-03",
    category: "pension",
    categoryLabel: "BHXH",
    code: "KT-03 · 4 phút đọc",
    topic: "BHXH & ĐỘ TRỄ DÒNG TIỀN HƯU TRÍ",
    title: "Nghỉ làm và nhận lương hưu",
    body: "Tháng muốn nghỉ làm do bạn chọn. Tháng nhận lương hưu là một mốc khác, cần đối chiếu thông tin quyền lợi. Bản thử không xác nhận điều kiện hưởng.",
    image: "/assets/product-insurance.jpg",
    badgeClass: "moderate",
    badgeText: "Quyền lợi hưu trí",
    strategyTag: "Giai đoạn cầu nối",
    highlights: [
      "Nghỉ làm sớm hơn tuổi hưởng BHXH tạo ra khoảng trống thu nhập cần quỹ tự gánh",
      "Tách riêng tháng bắt đầu nhận lương hưu và cơ sở tính giá để dự phóng chính xác",
    ],
    heroLabel: "Mốc thời gian",
    heroVal: "2 mốc",
    heroUnit: "tách biệt",
    subLabel: "Giai đoạn chờ BHXH",
    subVal: "Quỹ tự chi trả",
    strip: [
      ["Tháng nghỉ làm", "Theo mục tiêu"],
      ["Tháng nhận BHXH", "Theo quyền lợi"],
      ["Bước áp dụng", "Lương hưu & BHXH"],
    ],
    jumpRoute: "/user/profile?section=insurance",
    jumpLabel: "Mở Lương hưu & BHXH →",
    overview:
      "Nhiều người mặc định ngày ngừng làm việc cũng là ngày bắt đầu có lương hưu hàng tháng. Thực tế, trong ví dụ giả định nghỉ làm ở tuổi 55 và bắt đầu nhận lương hưu ở tuổi 60, bạn cần tính nguồn tiền cho 5 năm chờ. Nếu không có nguồn thu khác, phần chi sinh hoạt sẽ do quỹ cá nhân chi trả. Tuổi hưởng thực tế cần xác minh theo hồ sơ riêng.",
    specs: [
      ["Tháng nghỉ hưu mong muốn", "Thời điểm bạn dừng thu nhập từ công việc chính và bắt đầu rút tiền từ quỹ hưu trí."],
      ["Tháng bắt đầu nhận BHXH", "Thời điểm dòng tiền lương hưu thực tế bắt đầu chảy vào ngân sách hàng tháng."],
      ["Giai đoạn cầu nối (Bridge Period)", "Khoảng thời gian đã nghỉ làm nhưng chưa có lương hưu — cần đối chiếu với các nguồn thu và khoản chi thực tế."],
      ["Cơ sở mệnh giá lương hưu", "Có thể khai theo số tiền ước tính hôm nay hoặc số tiền danh nghĩa tại tháng bắt đầu nhận."],
      ["Phạm vi mô phỏng", "Hệ thống tính tác động dòng tiền từ mức bạn tự khai; không thay thế văn bản xác nhận của cơ quan BHXH."],
    ],
    checklist: [
      "Kiểm tra khoảng cách giữa tuổi muốn nghỉ làm và tuổi dự kiến đủ điều kiện nhận lương hưu.",
      "Nếu chưa rõ mức lương hưu, hãy chọn Chưa biết để lập kế hoạch an toàn không phụ thuộc trước.",
      "Khi đã có thông tin ước tính, nhập kèm tháng bắt đầu nhận để giảm đúng phần rút quỹ từ tháng đó.",
    ],
    takeaway:
      "Tách bạch ngày ngừng làm việc và ngày lĩnh lương hưu giúp bạn chuẩn bị đủ nguồn vốn đệm cho những năm nghỉ hưu sớm.",
  },
  {
    id: "kt-04",
    category: "tracking",
    categoryLabel: "Theo dõi",
    code: "KT-04 · 4 phút đọc",
    topic: "KIỂM TOÁN & ĐỐI SOÁT DÒNG TIỀN",
    title: "Số dư quỹ có khớp không?",
    body: "Đầu kỳ cộng tiền góp, lợi tức và lãi/lỗ, trừ tiền rút và phí, cộng điều chỉnh sẽ bằng cuối kỳ. Thu nhập gia đình và tiền chuyển nội bộ không tự tăng quỹ hưu.",
    image: "/assets/knowledge-tracking.jpg",
    badgeClass: "very_low",
    badgeText: "Đối soát thực tế",
    strategyTag: "Phương trình cân bằng quỹ",
    highlights: [
      "Kiểm tra chênh lệch giữa số dư thực tế trên sao kê và số dư tính từ giao dịch",
      "Chỉ tính lại kế hoạch tương lai khi chuỗi các tháng thực tế đã nối tiếp và khớp số dư",
    ],
    heroLabel: "Chuẩn đối soát",
    heroVal: "0 ₫",
    heroUnit: "chênh lệch",
    subLabel: "Chu kỳ ghi nhận",
    subVal: "Từng tháng",
    strip: [
      ["Chuyển nội bộ", "Không cộng trùng"],
      ["Tái dự phóng", "Từ số dư đã chốt"],
      ["Bước áp dụng", "Cập nhật tình hình"],
    ],
    jumpRoute: "/user/simulation",
    jumpLabel: "Mở Cập nhật tình hình →",
    overview:
      "Một kế hoạch tốt cần được kiểm chứng bằng số liệu thực tế. Khi ghi sổ theo dõi từng tháng trong An Hưu, hệ thống áp dụng phương trình cân bằng quỹ nghiêm ngặt để đảm bảo bạn không cộng nhầm thu nhập sinh hoạt chưa nạp vào quỹ hoặc tính trùng các khoản chuyển tiền qua lại giữa các tài khoản.",
    specs: [
      ["Công thức cân bằng chuẩn", "Cuối kỳ = Đầu kỳ + Tiền góp + Lợi tức + Lãi/Lỗ − Tiền rút − Phí ± Điều chỉnh"],
      ["Giao dịch làm tăng quỹ", "Tiền thực nạp mới vào quỹ hưu trí, cổ tức/lãi tiền gửi nhập gốc, chênh lệch tăng NAV."],
      ["Giao dịch làm giảm quỹ", "Rút tiền chi tiêu hưu trí, phí quản lý/giao dịch, chênh lệch giảm giá trị thị trường."],
      ["Giao dịch KHÔNG làm tăng quỹ", "Lương tháng còn nằm ở tài khoản chi tiêu, tiền chuyển từ sổ tiết kiệm hưu trí sang quỹ mở hưu trí."],
      ["Điều kiện tính lại (Reforecast)", "Các tháng đã ghi phải liên tiếp nhau, số dư đầu kỳ tháng sau khớp số dư cuối kỳ tháng trước."],
    ],
    checklist: [
      "Cuối mỗi tháng, nhập số dư đầu kỳ, tổng tiền thực góp/rút và số dư cuối kỳ trên sao kê.",
      "Kiểm tra trạng thái ✓ Đã khớp trước khi bấm Tính lại phần kế hoạch còn lại.",
      "Nếu chỉ thay đổi mức thu nhập hoặc mức góp dự kiến mà không cần ghi sổ chi tiết, hãy dùng nút Cập nhật nhanh.",
    ],
    takeaway:
      "Đối soát minh bạch giúp bạn biết chính xác quỹ hưu trí đang đi nhanh hay chậm hơn kế hoạch mà không bao giờ bị ảo giác tài sản.",
  },
  {
    id: "kt-05",
    category: "allocation",
    categoryLabel: "Phân bổ",
    code: "KT-05 · 5 phút đọc",
    topic: "CẤU TRÚC THÁP TÀI SẢN & RỦI RO",
    title: "Tách lớp vốn bảo vệ trước khi đầu tư tăng trưởng",
    body: "Quỹ dự phòng khẩn cấp và tiền cho mục tiêu ngắn hạn cần được tách riêng khỏi danh mục hưu trí dài hạn để tránh phải bán cắt lỗ tài sản khi thị trường biến động.",
    image: "/assets/product-investment.jpg",
    badgeClass: "moderate",
    badgeText: "Phân bổ đa tầng",
    strategyTag: "Bảo vệ & Tăng trưởng",
    highlights: [
      "Ví dụ dự phòng 3–6 tháng chi phí thiết yếu ở công cụ thanh khoản cao, tách khỏi vốn đầu tư mạo hiểm",
      "Phân bổ tỷ trọng Cổ phiếu / Trái phiếu / Tiết kiệm dựa trên cả thời hạn lẫn sức chịu lỗ bằng tiền",
    ],
    heroLabel: "Ví dụ quỹ dự phòng",
    heroVal: "3–6",
    heroUnit: "tháng chi",
    subLabel: "Kỳ hạn vốn tăng trưởng",
    subVal: "≥ 5 năm",
    strip: [
      ["Lớp 1: Bảo vệ", "Tiết kiệm linh hoạt"],
      ["Lớp 2: Mục tiêu", "Kỳ hạn cố định"],
      ["Lớp 3: Hưu trí", "Quỹ mở & Trái phiếu"],
    ],
    jumpRoute: "/user/risk-portfolio",
    jumpLabel: "Mở Phân bổ tài sản →",
    overview:
      "Sai lầm phổ biến nhất của nhà đầu tư cá nhân là gom toàn bộ tiền tiết kiệm vào một rổ tài sản rủi ro cao. Khi gia đình có việc đột xuất đúng lúc thị trường giảm sâu, họ buộc phải bán tháo khoản đầu tư dài hạn. Phương pháp Phân bổ theo mục tiêu (Goal-Based Allocation) giúp giảm áp lực phải bán tài sản khi cần tiền, nhưng không loại bỏ mọi rủi ro.",
    specs: [
      ["Tầng 1 — Quỹ dự phòng khẩn cấp", "Ví dụ 3–6 tháng chi phí sinh hoạt; cần điều chỉnh theo hồ sơ. Có thể tìm hiểu tiền gửi kỳ hạn ngắn (1–3 tháng), rút linh hoạt."],
      ["Tầng 2 — Vốn mục tiêu gần hạn (≤ 3–5 năm)", "Khoản tiền mua nhà, học phí hoặc việc lớn đã có lịch chi. Ưu tiên tiền gửi kỳ hạn 6–12 tháng hoặc TPCP."],
      ["Tầng 3 — Vốn tích lũy hưu trí dài hạn", "Phần vốn chưa cần dùng trong trên 5–10 năm. Phân bổ vào quỹ mở cổ phiếu, ETF và quỹ trái phiếu để vượt lạm phát."],
      ["Bảo vệ y tế & Sức khỏe", "Kết hợp bảo hiểm sức khỏe/nhân thọ để chuyển giao rủi ro viện phí lớn, giảm phần chi tự trả trong phạm vi quyền lợi và điều khoản hợp đồng."],
    ],
    checklist: [
      "Khai báo rõ số tiền Quỹ dự phòng đang có để hệ thống tách phần vốn này ra khỏi danh mục rủi ro.",
      "Thực hiện bài khảo sát Khả năng chịu rủi ro để xác định ngưỡng sụt giảm tối đa bạn chịu được.",
      "Đối chiếu danh mục gợi ý tại trang Sản phẩm tài chính để chọn công cụ phù hợp cho từng tầng vốn.",
    ],
    takeaway:
      "Khi tầng vốn bảo vệ đã vững chắc, bạn có thêm khoảng đệm để cân nhắc trước biến động; vẫn cần rà soát rủi ro và nhu cầu thực tế.",
  },
  {
    id: "kt-06",
    category: "allocation",
    categoryLabel: "Phân bổ",
    code: "KT-06 · 4 phút đọc",
    topic: "KỶ LUẬT TÍCH LŨY & LÃI KÉP",
    title: "Kỷ luật góp đều đặn và sức mạnh của thời gian",
    body: "Bắt đầu tích lũy sớm và duy trì kỷ luật góp định kỳ hàng tháng quan trọng hơn việc cố gắng dự đoán đỉnh đáy ngắn hạn của thị trường tài chính.",
    image: "/assets/product-bond.jpg",
    badgeClass: "low",
    badgeText: "Chiến lược dài hạn",
    strategyTag: "Tích lũy định kỳ (DCA)",
    highlights: [
      "Bắt đầu sớm tạo thêm thời gian tích lũy; mức góp cần thiết phụ thuộc mục tiêu và giả định",
      "Chọn mức góp nằm trong khả năng ngân sách thực tế để duy trì bền vững nhiều năm",
    ],
    heroLabel: "Chiến lược",
    heroVal: "Định kỳ",
    heroUnit: "hàng tháng",
    subLabel: "Yếu tố quyết định",
    subVal: "Thời gian & Kỷ luật",
    strip: [
      ["Cơ chế sinh lời", "Lãi mẹ đẻ lãi con"],
      ["Giảm rủi ro giá", "Trung bình giá mua"],
      ["Bước áp dụng", "Sản phẩm tài chính"],
    ],
    jumpRoute: "/user/explore",
    jumpLabel: "Mở Sản phẩm tài chính →",
    overview:
      "Lãi kép cần thời gian để phát huy tác dụng mạnh nhất. Tỷ lệ tiền gốc và phần tăng trưởng thay đổi theo mức góp, vốn ban đầu, lợi suất và phí. Không có một mốc năm cố định mà tiền sinh lời chắc chắn vượt tiền góp. Do đó, duy trì một mức góp vừa sức, đều đặn quan trọng hơn việc góp thật cao rồi bỏ dở giữa chừng.",
    specs: [
      ["Bắt đầu từ năm 30 tuổi (30 năm tích lũy)", "Có thời gian tích lũy dài hơn; kết quả phụ thuộc mức góp, lợi suất, phí và biến động thực tế."],
      ["Bắt đầu từ năm 40 tuổi (20 năm tích lũy)", "Thời gian tích lũy ngắn hơn; dùng công cụ kế hoạch để tính mức góp cho cùng mục tiêu và giả định."],
      ["Bắt đầu từ năm 50 tuổi (10 năm tích lũy)", "Cần ưu tiên bảo toàn vốn, tăng tỷ lệ tiết kiệm ròng và xem xét lùi nhẹ tuổi nghỉ hưu."],
      ["Nguyên tắc chọn mức góp", "Luôn đối chiếu Mức muốn góp với Khả năng góp tháng đầu để không làm thiếu hụt ngân sách gia đình."],
    ],
    checklist: [
      "Thiết lập khoản trích tự động hàng tháng ngay sau ngày nhận lương vào tài khoản tích lũy hưu trí.",
      "Sử dụng công cụ Tính thử dòng tiền trong trang Sản phẩm tài chính để xem kết quả tích lũy sau 5, 10, 20 năm.",
      "Định kỳ mỗi năm rà soát và tăng nhẹ mức góp khi thu nhập thực tế tăng lên.",
    ],
    takeaway:
      "Không cần chờ có số vốn lớn mới bắt đầu — sự đều đặn mỗi tháng kết hợp với thời gian chính là một yếu tố cần cân nhắc trong kế hoạch; không bảo đảm kết quả đầu tư.",
  },
];

// User Area View (standardized to match demo source of truth in journey.js)
function UserKnowledgeView() {
  const { language } = useI18n();
  const isEn = language === 'en';

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [savedArticleIds, setSavedArticleIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('anhuu_saved_articles');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const toggleSave = (id: string) => {
    setSavedArticleIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try {
        localStorage.setItem('anhuu_saved_articles', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const filterChips = useMemo(() => {
    const list = [
      { id: 'all', label: isEn ? 'All topics' : 'Tất cả' },
      { id: 'plan', label: isEn ? 'Plan' : 'Kế hoạch' },
      { id: 'pension', label: isEn ? 'Social Insurance' : 'BHXH' },
      { id: 'tracking', label: isEn ? 'Tracking' : 'Theo dõi' },
      { id: 'allocation', label: isEn ? 'Allocation' : 'Phân bổ' },
    ];
    if (savedArticleIds.length > 0) {
      list.push({ id: 'saved', label: isEn ? `Saved (${savedArticleIds.length})` : `Đã lưu (${savedArticleIds.length})` });
    }
    return list;
  }, [savedArticleIds.length, isEn]);

  const visibleArticles = useMemo(() => {
    return USER_KNOWLEDGE_ARTICLES.filter(a => {
      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'saved') return savedArticleIds.includes(a.id);
      return a.category === selectedCategory;
    });
  }, [selectedCategory, savedArticleIds]);

  const activeArticle = useMemo(() => {
    if (!activeArticleId) return null;
    return USER_KNOWLEDGE_ARTICLES.find(a => a.id === activeArticleId) || null;
  }, [activeArticleId]);

  if (activeArticle) {
    const isSaved = savedArticleIds.includes(activeArticle.id);
    const related = USER_KNOWLEDGE_ARTICLES.filter(a => a.id !== activeArticle.id);
    const readTime = activeArticle.code.split('·')[1]?.trim() || '3 phút đọc';

    return (
      <div className="products-page knowledge-page">
        <div className="knowledge-shell editorial-reader" style={{ padding: '0 0 40px' }}>
          <nav className="editorial-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px', background: '#fff', border: '1px solid #d5e3f0', borderRadius: '14px', padding: '12px 18px' }}>
            <button type="button" className="btn secondary small" onClick={() => setActiveArticleId(null)}>
              {isEn ? '← Back to articles list' : '← Quay lại danh sách bài viết'}
            </button>
            <div className="editorial-topbar-meta" style={{ fontSize: '13px', color: '#52657c' }}>
              <span>{isEn ? 'Topic:' : 'Chuyên mục:'} <strong style={{ color: '#052659' }}>{activeArticle.categoryLabel}</strong></span>
              <span> • </span>
              <span>{isEn ? 'Code:' : 'Mã:'} <strong style={{ color: '#052659' }}>{activeArticle.code}</strong></span>
            </div>
            <button type="button" className="btn ghost small" style={{ color: isSaved ? '#F59E0B' : 'inherit' }} onClick={() => toggleSave(activeArticle.id)}>
              {isSaved ? '★ Đã lưu bài viết' : '☆ Lưu bài viết'}
            </button>
          </nav>

          <div className="editorial-newspaper-grid">
            <article className="card editorial-article-main" style={{ background: '#fff', border: '1px solid #d5e3f0', borderRadius: '16px', padding: '28px' }}>
              <header className="editorial-header">
                <div className="editorial-kicker" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span className="badge-cat-pill" style={{ background: '#E8F2FE', color: '#052659', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>{activeArticle.categoryLabel}</span>
                  <span className="badge-risk" style={{ background: '#ecfdf5', color: '#065f46', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>● {activeArticle.badgeText}</span>
                  <span className="badge-strategy">{activeArticle.strategyTag}</span>
                </div>
                <h1 className="editorial-headline" style={{ fontSize: '26px', color: '#052659', margin: '0 0 12px', lineHeight: 1.3 }}>{activeArticle.title}</h1>
                <p className="editorial-sapo" style={{ fontSize: '16px', color: '#1e293b', fontWeight: 600, lineHeight: 1.6, margin: '0 0 16px' }}>{activeArticle.body}</p>
                <div className="editorial-byline" style={{ fontSize: '12.5px', color: '#64748b', borderTop: '1px solid #edf2f7', borderBottom: '1px solid #edf2f7', padding: '10px 0', marginBottom: '20px' }}>
                  <strong>Ban biên tập Hoạch định Tài chính An Hưu</strong> • <ClockIcon size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />{readTime} • Công cụ liên quan: <strong>{activeArticle.strip[2][1]}</strong>
                </div>
              </header>

              <figure className="editorial-hero-figure" style={{ margin: '0 0 24px', border: '1px solid #e2ecf7', borderRadius: '12px', overflow: 'hidden', background: '#f8fbff' }}>
                <img src={activeArticle.image} alt={activeArticle.title} style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', display: 'block' }} />
                <figcaption style={{ fontSize: '12px', color: '#64748B', padding: '10px 14px', fontStyle: 'italic' }}>
                  Chuyên đề {activeArticle.categoryLabel}: {activeArticle.title} — Áp dụng thực tế trong lập kế hoạch hưu trí cá nhân.
                </figcaption>
              </figure>

              <div className="editorial-content-body">
                <h2 style={{ fontSize: '19px', color: '#052659', margin: '0 0 12px' }}>1. Bản chất vấn đề & Ý nghĩa thực tiễn</h2>
                <p style={{ fontSize: '14.5px', color: '#1e293b', lineHeight: 1.7, margin: '0 0 16px' }}>{activeArticle.overview}</p>
                <blockquote className="editorial-quote" style={{ margin: '18px 0 24px', padding: '16px 20px', background: '#f4f8fd', borderLeft: '4px solid #16428b', borderRadius: '0 12px 12px 0' }}>
                  <strong style={{ display: 'block', color: '#052659', marginBottom: '6px', fontSize: '14px' }}>💡 Nguyên tắc cốt lõi cần nhớ:</strong>
                  <p style={{ margin: 0, color: '#1e293b', fontSize: '14px', lineHeight: 1.6 }}>{activeArticle.takeaway}</p>
                </blockquote>

                <h2 style={{ fontSize: '19px', color: '#052659', margin: '24px 0 10px' }}>2. Bảng phân tích & Ví dụ đối chiếu chi tiết</h2>
                <p style={{ fontSize: '14.5px', color: '#1e293b', lineHeight: 1.6, margin: '0 0 14px' }}>
                  Bảng dưới đây tổng hợp các mốc quy chiếu và tình huống cụ thể để bạn dễ dàng đối chiếu với hồ sơ tài chính cá nhân:
                </p>
                <div className="table-scroll" style={{ marginBottom: '24px' }}>
                  <table className="detail-specs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', border: '1px solid #e2ecf7', borderRadius: '10px', overflow: 'hidden' }}>
                    <tbody>
                      {activeArticle.specs.map(([k, v], idx) => (
                        <tr key={k} style={{ borderBottom: '1px solid #edf2f7', background: idx % 2 === 0 ? '#f8fbff' : '#fff' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#052659', width: '38%' }}>{k}</td>
                          <td style={{ padding: '12px 14px', color: '#334155' }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2 style={{ fontSize: '19px', color: '#052659', margin: '24px 0 12px' }}>3. Hướng dẫn 3 bước áp dụng ngay vào kế hoạch</h2>
                <ul className="knowledge-checklist" style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gap: '10px' }}>
                  {activeArticle.checklist.map((item, idx) => (
                    <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#f8fbff', border: '1px solid #e2ecf7', borderRadius: '10px', fontSize: '14px', color: '#1e293b' }}>
                      <span style={{ width: '24px', height: '24px', borderRadius: '99px', background: '#052659', color: '#fff', fontSize: '12px', fontWeight: 700, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
                        {idx + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <footer className="editorial-article-footer" style={{ background: '#f8fbff', border: '1px solid #e2ecf7', borderRadius: '12px', padding: '18px 20px', marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <strong style={{ display: 'block', color: '#052659', fontSize: '15px' }}>Áp dụng kiến thức này vào hồ sơ của bạn</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#52657c' }}>Mở trực tiếp công cụ tương ứng trong An Hưu để kiểm tra và điều chỉnh số liệu.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn secondary" onClick={() => setActiveArticleId(null)}>← Xem bài khác</button>
                  <Link to={activeArticle.jumpRoute} className="btn" style={{ textDecoration: 'none' }}>{activeArticle.jumpLabel}</Link>
                </div>
              </footer>
            </article>

            <aside className="editorial-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <section className="card editorial-summary-box" style={{ background: '#fff', border: '1px solid #d5e3f0', borderRadius: '16px', padding: '20px' }}>
                <span className="eyebrow" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#52657c' }}>TÓM TẮT TRỌNG TÂM</span>
                <h3 style={{ margin: '6px 0 14px', fontSize: '16px', color: '#052659' }}>Chỉ số & Quy tắc nhanh</h3>
                <div style={{ background: '#f4f8fd', border: '1px solid #d5e3f0', padding: '14px', borderRadius: '12px', marginBottom: '14px' }}>
                  <div style={{ paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid #dce8f5' }}>
                    <span style={{ fontSize: '11.5px', color: '#52657c', display: 'block' }}>{activeArticle.heroLabel}</span>
                    <strong style={{ fontSize: '22px', color: '#052659', display: 'block', marginTop: '2px' }}>{activeArticle.heroVal} {activeArticle.heroUnit}</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: '#52657c', display: 'block' }}>{activeArticle.subLabel}</span>
                      <strong style={{ color: '#052659' }}>{activeArticle.subVal}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#52657c', display: 'block' }}>{activeArticle.strip[0][0]}</span>
                      <strong style={{ color: '#052659' }}>{activeArticle.strip[0][1]}</strong>
                    </div>
                  </div>
                </div>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeArticle.highlights.map(h => (
                    <li key={h} style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: '#10B981', fontWeight: 700 }}>✓</span>
                      <span style={{ color: '#334155' }}>{h}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card editorial-related-box" style={{ background: '#fff', border: '1px solid #d5e3f0', borderRadius: '16px', padding: '20px' }}>
                <span className="eyebrow" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#52657c' }}>ĐỌC TIẾP CHUYÊN ĐỀ</span>
                <h3 style={{ margin: '6px 0 14px', fontSize: '16px', color: '#052659' }}>Bài viết khác cùng cẩm nang</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {related.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { setActiveArticleId(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      style={{ display: 'flex', gap: '10px', textAlign: 'left', background: '#f8fbff', border: '1px solid #e2ecf7', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer' }}
                    >
                      <img src={a.image} alt={a.title} style={{ width: '58px', height: '44px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                      <div>
                        <span style={{ fontSize: '11px', color: '#52657c', display: 'block' }}>{a.categoryLabel} · {a.code.split('·')[1]?.trim() || '3 phút đọc'}</span>
                        <strong style={{ fontSize: '12.5px', color: '#052659', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.title}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="card editorial-market-box" style={{ background: '#fff', border: '1px solid #d5e3f0', borderRadius: '16px', padding: '20px', color: '#052659' }}>
                <span className="eyebrow" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#52657c' }}>GIẢI PHÁP TÀI CHÍNH</span>
                <h3 style={{ margin: '6px 0 8px', fontSize: '16px', color: '#052659' }}>Khám phá sản phẩm mẫu</h3>
                <p style={{ fontSize: '12.5px', color: '#52657c', margin: '0 0 14px', lineHeight: 1.5 }}>Tìm hiểu tiền gửi, quỹ mở, trái phiếu và bảo hiểm ghép nối với kế hoạch hưu trí.</p>
                <Link to="/user/explore" className="btn secondary" style={{ width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                  Mở Sản phẩm tài chính →
                </Link>
              </section>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="products-page knowledge-page">
      <header className="products-head">
        <div>
          <h1>{isEn ? 'Knowledge & solutions' : 'Kiến thức và giải pháp'}</h1>
          <p>{isEn ? 'Read what you need right at your current step. Click any article to read in full detail.' : 'Đọc điều cần biết ngay tại bước bạn đang làm. Bấm vào từng bài viết để đọc chi tiết như một trang chuyên đề.'}</p>
        </div>
      </header>

      {/* Category filter chips toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', margin: '16px 0', background: '#fff', border: '1px solid #d5e3f0', borderRadius: '14px', padding: '10px 16px' }}>
        <div className="explore-category-chips" style={{ margin: 0 }}>
          {filterChips.map(c => (
            <button
              key={c.id}
              type="button"
              className={`explore-category-chip ${selectedCategory === c.id ? 'is-active' : ''}`}
              aria-pressed={selectedCategory === c.id}
              onClick={() => setSelectedCategory(c.id)}
            >
              <span>{c.label}</span>
            </button>
          ))}
        </div>
        <span style={{ fontSize: '13px', color: '#52657c' }}>
          {isEn
            ? <>Showing <strong>{visibleArticles.length}</strong> topics · <strong>{savedArticleIds.length}</strong> saved</>
            : <>Hiển thị <strong>{visibleArticles.length}</strong> chuyên đề · Đã lưu <strong>{savedArticleIds.length}</strong> bài</>}
        </span>
      </div>

      {/* Knowledge Cards Grid */}
      <div className="products-grid knowledge-grid">
        {visibleArticles.map(a => {
          const isSaved = savedArticleIds.includes(a.id);
          const readTime = a.code.split('·')[1]?.trim() || '3 phút đọc';
          return (
            <article className="product-card knowledge-card-compact" key={a.id}>
              <div className="product-card-top">
                <div className="product-card-media knowledge-media-clickable" onClick={() => setActiveArticleId(a.id)}>
                  <img src={a.image} alt={a.title} className="product-card-img" loading="lazy" width="360" height="140" />
                  <span className="product-card-category-tag" style={{ position: 'absolute', top: '10px', left: '10px', padding: '3px 9px', borderRadius: '99px', background: 'rgba(5, 38, 89, 0.78)', color: '#fff', fontSize: '11px', fontWeight: 600 }}>
                    {a.categoryLabel}
                  </span>
                  <span className="product-card-code-tag" style={{ position: 'absolute', top: '10px', right: '10px', padding: '3px 9px', borderRadius: '99px', background: 'rgba(5, 38, 89, 0.78)', color: '#fff', fontSize: '11px', fontWeight: 600 }}>
                    ⏱ {readTime}
                  </span>
                </div>
                <div className="product-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', margin: '8px 0' }}>
                  <div className="product-partner-info">
                    <span className="product-partner-name" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#617387' }}>
                      {a.topic}
                    </span>
                    <h3 className="product-title" style={{ margin: '4px 0' }}>
                      <button type="button" className="knowledge-title-btn" onClick={() => setActiveArticleId(a.id)}>
                        {a.title}
                      </button>
                    </h3>
                  </div>
                  <button
                    type="button"
                    className={`card-star-btn ${isSaved ? 'is-saved' : ''}`}
                    onClick={() => toggleSave(a.id)}
                    aria-label={isSaved ? 'Đã lưu' : 'Lưu bài'}
                    title={isSaved ? 'Đã lưu' : 'Lưu bài'}
                  >
                    {isSaved ? '★' : '☆'}
                  </button>
                </div>
                <p className="product-desc knowledge-compact-desc">{a.body}</p>
                <div className="knowledge-key-pill">
                  <span>📌 {a.heroLabel}: <strong>{a.heroVal} {a.heroUnit}</strong></span>
                  <span>•</span>
                  <span>{a.strategyTag}</span>
                </div>
              </div>
              <div className="product-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #edf2f7', paddingTop: '12px', marginTop: 'auto' }}>
                <button type="button" className="btn ghost small" style={{ fontSize: '12px', padding: '4px 8px', color: isSaved ? '#F59E0B' : 'inherit' }} onClick={() => toggleSave(a.id)}>
                  {isSaved ? '★ Đã lưu' : '☆ Lưu bài'}
                </button>
                <button type="button" className="btn small" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => setActiveArticleId(a.id)}>
                  {isEn ? 'Read article →' : 'Đọc bài viết →'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* CTA Banner at bottom linking to Marketplace */}
      <section className="card knowledge-cta-banner">
        <div className="knowledge-cta-body">
          <span className="eyebrow">{isEn ? 'PLAN IMPLEMENTATION SOLUTIONS' : 'GIẢI PHÁP THỰC THI KẾ HOẠCH'}</span>
          <h2>{isEn ? 'Explore Financial Products' : 'Tìm hiểu sản phẩm tài chính'}</h2>
          <p>
            {isEn
              ? 'Discover deposits, mutual funds, bonds, and insurance complete with cashflow tools, comparison features, and plan matching.'
              : 'Khám phá đầy đủ tiền gửi, quỹ mở, trái phiếu và bảo hiểm kèm công cụ tính dòng tiền, so sánh và ghép nối với kế hoạch hưu trí.'}
          </p>
          <div className="knowledge-cta-pills">
            <span className="knowledge-cta-pill">✓ {isEn ? 'Term Deposits' : 'Tiền gửi có kỳ hạn'}</span>
            <span className="knowledge-cta-pill">✓ {isEn ? 'Open Funds & ETFs' : 'Quỹ mở & ETF tăng trưởng'}</span>
            <span className="knowledge-cta-pill">✓ {isEn ? 'Fixed Income Bonds' : 'Trái phiếu thu nhập cố định'}</span>
            <span className="knowledge-cta-pill">✓ {isEn ? 'Health & Life Insurance' : 'Bảo hiểm bảo vệ sức khỏe'}</span>
          </div>
        </div>
        <div className="knowledge-cta-action">
          <Link to="/user/explore" className="btn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span>{isEn ? 'Open Financial Products →' : 'Mở Sản phẩm tài chính →'}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

// Public Marketing Editorial Knowledge View (matching sites/an-huu-trai-nghiem/dist/kien-thuc.html)
function PublicKnowledgeView() {
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const [hashArticleId, setHashArticleId] = useState(() => (typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''));

  useEffect(() => {
    const handleHashChange = () => {
      setHashArticleId(window.location.hash.replace(/^#/, ''));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const activeArticle: KnowledgeArticle | null = useMemo(() => {
    if (!hashArticleId) return null;
    return ARTICLES_DATA.find(a => a.id === hashArticleId) || null;
  }, [hashArticleId]);

  const openArticle = (id: string) => {
    window.location.hash = id;
    setHashArticleId(id);
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  const closeArticle = () => {
    window.history.pushState('', document.title, window.location.pathname);
    setHashArticleId('');
    window.scrollTo({ top: 400, behavior: 'smooth' });
  };

  const shareArticle = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const relatedArticles = useMemo(() => {
    if (!activeArticle) return [];
    return ARTICLES_DATA.filter(a => a.id !== activeArticle.id);
  }, [activeArticle]);

  return (
    <MarketingLayout>
      <div className="mk-knowledge-page">
        {/* Hero Section */}
        <section className="ed-hero ed-hero-kb">
          <div className="mk-container ed-hero-grid">
            <div className="ed-hero-copy">
              <nav className="mk-breadcrumb ed-breadcrumb" aria-label="Đường dẫn trang">
                <Link to="/">Trang chủ</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">Kiến thức hưu trí</span>
              </nav>
              <h1>Kiến thức hưu trí, <em>viết cho người bận rộn.</em></h1>
              <p className="ed-lead">
                Hiểu rõ số liệu. Tự tin bước vào tuổi già. Trang bị kiến thức tài chính hưu trí thực tế, công thức lương hưu BHXH và nguyên lý tích lũy bền vững.
              </p>
              <div className="ed-actions">
                <button
                  type="button"
                  className="mk-button"
                  onClick={() => openArticle(ARTICLES_DATA[0].id)}
                >
                  <span>Bắt đầu đọc</span>
                  <Icon name="chevron-down" />
                </button>
                <Link to="/mo-phong" className="ed-link-btn">
                  Thử tính kế hoạch của tôi →
                </Link>
              </div>
            </div>

            <div
              className="ed-feature-card"
              role="button"
              tabIndex={0}
              onClick={() => openArticle(ARTICLES_DATA[0].id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openArticle(ARTICLES_DATA[0].id); }}
            >
              <img
                src={ARTICLES_DATA[0].image}
                alt="Tuổi già thảnh thơi bên người thân"
                width="720"
                height="480"
                fetchPriority="high"
              />
              <span className="ed-feature-body">
                <span className="ed-tag">Chuyên đề trọng tâm</span>
                <strong>{ARTICLES_DATA[0].title}</strong>
                <span className="ed-meta">5 phút đọc · Tỷ lệ rút an toàn 4% - 4,5%</span>
              </span>
            </div>
          </div>
        </section>

        {/* Reference Metrics Strip */}
        <section className="ed-metrics" aria-label="Các con số tham chiếu">
          <div className="mk-container ed-metrics-grid">
            <div><strong>3,5%</strong><span>lạm phát quy chiếu mỗi năm</span></div>
            <div><strong>4% đến 4,5%</strong><span>tỷ lệ rút vốn tham khảo mỗi năm</span></div>
            <div><strong>45% đến 75%</strong><span>tỷ lệ hưởng lương hưu BHXH</span></div>
            <div><strong>25 đến 30 năm</strong><span>thời gian sống hưu cần chuẩn bị</span></div>
          </div>
        </section>

        {/* VIEW 1: CATALOG CARD GRID VIEW */}
        {!activeArticle && (
          <section id="ed-catalog-view" className="ed-catalog-section">
            <div className="mk-container">
              <div className="ed-catalog-header">
                <span className="ed-eyebrow">THƯ VIỆN CHUYÊN ĐỀ HƯU TRÍ</span>
                <h2>Tất cả bài viết hướng dẫn thực tế</h2>
                <p className="ed-catalog-desc">
                  Trang bị hiểu biết chuẩn xác về mục tiêu vốn, công thức lương hưu BHXH, cách phòng hộ lạm phát và thiết lập tháp tài sản an toàn.
                </p>
              </div>

              <div className="ed-cards-grid">
                {ARTICLES_DATA.map(article => (
                  <article key={article.id} id={article.id} className="ed-card">
                    <div className="ed-card-media" onClick={() => openArticle(article.id)}>
                      <img src={article.image} alt={article.title} loading="lazy" width="380" height="220" />
                      <span className="ed-card-cat-badge">{article.category}</span>
                      <span className="ed-card-time-badge"><ClockIcon size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />{article.readTime}</span>
                    </div>
                    <div className="ed-card-body">
                      <span className="ed-card-kicker">{article.categoryTag}</span>
                      <h3 className="ed-card-title">
                        <button type="button" className="ed-card-title-btn" onClick={() => openArticle(article.id)}>
                          {article.title}
                        </button>
                      </h3>
                      <p className="ed-card-excerpt">{article.sapo}</p>
                      <div className="ed-card-pill">
                        <PinIcon size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                        <span>{article.pillText.replace(/^[\u{1F4CC}\s]+/u, '')}</span>
                      </div>
                    </div>
                    <div className="ed-card-footer">
                      <button type="button" className="ed-card-action" onClick={() => openArticle(article.id)}>
                        <span>Đọc bài phân tích</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* VIEW 2: INTERACTIVE ARTICLE READER */}
        {activeArticle && (
          <section id="ed-reader-view" className="ed-reader-section">
            <div className="mk-container">
              <div className="knowledge-shell editorial-reader" id="ed-active-reader-shell">
                {/* Top Navigation Bar */}
                <nav className="editorial-topbar" aria-label="Điều hướng bài viết">
                  <button type="button" className="btn secondary small ed-btn-back" onClick={closeArticle}>
                    <Icon name="arrow-left" />
                    <span>Quay lại danh sách bài viết</span>
                  </button>
                  <div className="editorial-topbar-meta">
                    <span>Chuyên mục: <strong>{activeArticle.category}</strong></span>
                    <span>•</span>
                    <span><ClockIcon size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} /><strong>{activeArticle.readTime}</strong></span>
                    <span>•</span>
                    <span>Mã: <strong>{activeArticle.code}</strong></span>
                  </div>
                  <button type="button" className="btn ghost small" onClick={shareArticle}>
                    <span>{copied ? '✓ Đã sao chép liên kết!' : '☆ Chia sẻ bài viết'}</span>
                  </button>
                </nav>

                {/* 2-Column Newspaper Layout */}
                <div className="editorial-newspaper-grid">
                  {/* Left: Main Article Content */}
                  <article className="card editorial-article-main">
                    <header className="editorial-header">
                      <div className="editorial-kicker">
                        <span className="badge-cat-pill">{activeArticle.category}</span>
                        <span className={`badge-risk ${activeArticle.badgeClass}`}>● {activeArticle.badgeText}</span>
                        <span className="badge-strategy">{activeArticle.strategyTag}</span>
                      </div>
                      <h2 className="editorial-headline">{activeArticle.title}</h2>
                      <p className="editorial-sapo">{activeArticle.sapo}</p>
                      <div className="editorial-byline">
                        <span><strong>Ban biên tập Hoạch định Tài chính An Hưu</strong></span>
                        <span>•</span>
                        <span><ClockIcon size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />{activeArticle.readTime}</span>
                        <span>•</span>
                        <span>Kiểm định phương pháp độc lập</span>
                      </div>
                    </header>

                    <figure className="editorial-hero-figure">
                      <img
                        src={activeArticle.image}
                        alt={activeArticle.title}
                        className="editorial-hero-img"
                        loading="lazy"
                        width="860"
                        height="420"
                      />
                      <figcaption>{activeArticle.caption}</figcaption>
                    </figure>

                    <div
                      className="editorial-content-body"
                      dangerouslySetInnerHTML={{ __html: activeArticle.sectionsHtml }}
                    />

                    <footer className="editorial-article-footer">
                      <div>
                        <strong>Áp dụng kiến thức này vào kế hoạch của bạn</strong>
                        <p>Mở công cụ mô phỏng để tính toán ngay với mức chi tiêu và tuổi hưu mong muốn của cá nhân bạn.</p>
                      </div>
                      <div className="editorial-footer-btns">
                        <button type="button" className="btn secondary ed-footer-back-btn" onClick={closeArticle}>
                          <Icon name="arrow-left" />
                          <span>Xem bài khác</span>
                        </button>
                        <Link to="/mo-phong" className="mk-button mk-small">
                          <span>Thử tính kế hoạch</span>
                          <Icon name="arrow-right" />
                        </Link>
                      </div>
                    </footer>
                  </article>

                  {/* Right: Editorial Sticky Sidebar */}
                  <aside className="editorial-sidebar">
                    {/* Box 1: Quick Stats Summary */}
                    <section className="card editorial-summary-box">
                      <span className="eyebrow">TÓM TẮT TRỌNG TÂM</span>
                      <h3>Chỉ số & Quy tắc nhanh</h3>
                      <div className="modal-stat-card" style={{ margin: '12px 0 16px' }}>
                        <div className="stat-main">
                          <span className="stat-label">{activeArticle.heroLabel}</span>
                          <strong className="stat-value">
                            {activeArticle.heroVal} <small style={{ fontSize: '0.65em', fontWeight: 600, color: '#64748b' }}>{activeArticle.heroUnit}</small>
                          </strong>
                        </div>
                        <div className="stat-sub-row">
                          <div>
                            <span>{activeArticle.subLabel}</span>
                            <strong>{activeArticle.subVal}</strong>
                          </div>
                          <div>
                            <span>Ghi chú</span>
                            <strong>{activeArticle.statNote}</strong>
                          </div>
                        </div>
                      </div>
                      <ul className="product-card-highlights" style={{ margin: 0, listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }}>
                        {activeArticle.highlights.map(h => (
                          <li key={h} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.86rem', lineHeight: 1.45, color: '#334155' }}>
                            <span className="chk" style={{ color: '#007763', fontWeight: 700 }}>✓</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    {/* Box 2: Read Next / Related Articles */}
                    <section className="card editorial-related-box">
                      <span className="eyebrow">ĐỌC TIẾP CHUYÊN ĐỀ</span>
                      <h3>Bài viết khác cùng cẩm nang</h3>
                      <div className="editorial-related-list">
                        {relatedArticles.map(rel => (
                          <button
                            key={rel.id}
                            type="button"
                            className="editorial-related-item"
                            onClick={() => openArticle(rel.id)}
                            aria-label={`Đọc bài: ${rel.title}`}
                          >
                            <img src={rel.image} alt="" loading="lazy" width="58" height="46" />
                            <div className="editorial-related-info">
                              <span className="related-cat">{rel.category}</span>
                              <strong className="related-title">{rel.title}</strong>
                              <span className="related-time"><ClockIcon size={11} style={{ marginRight: 4, verticalAlign: "-2px" }} />{rel.readTime}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* Box 3: Simulator Tool Jump */}
                    <section className="card editorial-market-box">
                      <span className="eyebrow">CÔNG CỤ LIÊN QUAN</span>
                      <h3>Thử tính kế hoạch của bạn</h3>
                      <p className="small muted" style={{ margin: '6px 0 14px', lineHeight: 1.55 }}>
                        Đưa số liệu thu nhập, mức chi tiêu và tuổi hưu mong muốn vào công cụ mô phỏng thực tế.
                      </p>
                      <Link to="/mo-phong" className="mk-button mk-small" style={{ width: '100%', justifyContent: 'center' }}>
                        <span>Mở công cụ mô phỏng</span>
                        <Icon name="arrow-right" />
                      </Link>
                    </section>
                  </aside>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </MarketingLayout>
  );
}

export default function KnowledgePage() {
  const location = useLocation();
  const isUserArea = location.pathname.startsWith('/user/');

  if (isUserArea) {
    return <UserKnowledgeView />;
  }

  return <PublicKnowledgeView />;
}
