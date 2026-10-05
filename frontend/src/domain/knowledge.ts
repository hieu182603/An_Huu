export type KnowledgeArticle = {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  categoryId: string;
};

export const knowledgeArticles: KnowledgeArticle[] = [
  {
    id: "builtin:withdrawal",
    title: "Quy tắc 4% và Chiến lược rút tiền an toàn cho người về hưu tại Việt Nam",
    summary: "Quy tắc 4% và chiến lược rút tiền khi nghỉ hưu.",
    content: "Quy tắc 4% là điểm tham khảo cho tỷ lệ rút tiền ban đầu. Kế hoạch thực tế cần điều chỉnh theo lạm phát, tuổi thọ, lợi suất và nguồn lương hưu của từng người.",
    category: "Lối sống hưu trí", categoryId: "lifestyle",
  },
  {
    id: "builtin:bhxh",
    title: "Hướng dẫn tính mức hưởng lương hưu theo Luật BHXH mới",
    summary: "Chi tiết cách tính tỷ lệ lương hưu tối đa 75%, điều kiện số năm đóng tối thiểu và hệ số trượt giá hàng năm.",
    content: "Mức hưởng thực tế phụ thuộc số năm đóng, mức bình quân tiền lương và quy định áp dụng tại thời điểm giải quyết. Bộ tính An Hưu chỉ cung cấp ước tính demo.",
    category: "Bảo hiểm xã hội", categoryId: "bhxh",
  },
  {
    id: "builtin:dca",
    title: "Đầu tư định kỳ DCA vào quỹ chỉ số: Chiến lược nhàn hạ hiệu quả",
    summary: "Tại sao phương pháp trích lập tự động mỗi tháng vào quỹ chỉ số giúp nhà đầu tư cá nhân vượt trội trong 20 năm dài hạn.",
    content: "Đầu tư định kỳ giúp duy trì kỷ luật và giảm phụ thuộc vào thời điểm mua. Lợi nhuận không được đảm bảo và danh mục cần phù hợp khả năng chịu rủi ro.",
    category: "Đầu tư tích lũy", categoryId: "invest",
  },
  {
    id: "builtin:health",
    title: "Xây dựng lá chắn y tế tuổi già: Khi nào nên mua bảo hiểm sức khỏe?",
    summary: "Phân biệt bảo hiểm y tế nhà nước và các gói thẻ nội trú tư nhân để tối ưu chi phí mà vẫn được chăm sóc y tế chuẩn mực.",
    content: "Hãy so sánh phạm vi chi trả, loại trừ, thời gian chờ, giới hạn tuổi và khả năng tái tục. Không nên chỉ dựa vào phí bảo hiểm ban đầu.",
    category: "Sức khỏe & Bảo hiểm", categoryId: "health",
  },
];

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
}

export function matchesSearch(query: string, text: string): boolean {
  const normalized = normalizeSearch(text);
  return normalizeSearch(query).split(/\s+/).every(word => normalized.includes(word));
}

// These are the categories already used by the demo content editor.
const categoryIds: Record<string, string> = {
  "Bảo hiểm xã hội": "bhxh", "Đầu tư tích lũy": "invest",
  "Kế hoạch hưu trí": "lifestyle", "Lối sống hưu trí": "lifestyle",
  "Sức khỏe & Bảo hiểm": "health", "Bảo hiểm y tế & Sức khỏe": "health",
};

export function parsePublishedArticles(raw: string | null): KnowledgeArticle[] {
  const items: unknown = JSON.parse(raw || "[]");
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items.flatMap(item => {
    if (!item || typeof item !== "object" || item.status !== "Đã xuất bản" ||
      typeof item.id !== "string" || !item.id || typeof item.title !== "string" ||
      typeof item.summary !== "string" || typeof item.category !== "string" || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{
      id: `published:${item.id}`, title: item.title, summary: item.summary,
      content: typeof item.content === "string" && item.content.trim() ? item.content : item.summary,
      category: item.category, categoryId: categoryIds[item.category] || "other",
    }];
  });
}

export const glossaryTerms = [
  { term: "Lãi kép", aliases: "compound interest lai suat kep", definition: "Tiền lãi được cộng vào vốn, để các kỳ tiếp theo tính lãi trên cả vốn ban đầu và phần lãi đã tích lũy." },
  { term: "Lạm phát", aliases: "inflation", definition: "Sự tăng lên của mặt bằng giá hàng hóa và dịch vụ theo thời gian, làm giảm sức mua của cùng một số tiền." },
  { term: "Chỉ số giá tiêu dùng (CPI)", aliases: "consumer price index truot gia", definition: "Chỉ số phản ánh mức thay đổi giá của một rổ hàng hóa và dịch vụ tiêu dùng đại diện qua thời gian." },
  { term: "Lợi suất danh nghĩa", aliases: "nominal return", definition: "Mức sinh lời được thể hiện trước khi điều chỉnh tác động của lạm phát." },
  { term: "Lợi suất thực", aliases: "real return", definition: "Mức sinh lời sau khi điều chỉnh tác động của lạm phát, phản ánh sự thay đổi về sức mua." },
  { term: "Tài sản ròng", aliases: "net worth", definition: "Chênh lệch giữa tổng giá trị tài sản sở hữu và tổng các khoản nợ tại cùng một thời điểm." },
  { term: "Dòng tiền", aliases: "cash flow", definition: "Các khoản tiền thực tế đi vào và đi ra trong một khoảng thời gian xác định." },
  { term: "Thanh khoản", aliases: "liquidity", definition: "Khả năng chuyển một tài sản thành tiền nhanh chóng mà không phải giảm đáng kể giá trị của tài sản đó." },
  { term: "Đầu tư định kỳ (DCA)", aliases: "dollar cost averaging", definition: "Cách đầu tư một khoản tiền theo lịch đều đặn. Số lượng tài sản mua được thay đổi theo mức giá tại từng lần mua." },
  { term: "Phân bổ tài sản", aliases: "asset allocation", definition: "Việc chia tổng tài sản đầu tư thành các nhóm như tiền gửi, trái phiếu và cổ phiếu." },
  { term: "Quỹ mở", aliases: "open end fund", definition: "Quỹ đầu tư tập hợp vốn của nhiều nhà đầu tư, cho phép mua và bán lại chứng chỉ quỹ theo điều kiện của quỹ." },
  { term: "Tỷ lệ thay thế thu nhập", aliases: "replacement ratio", definition: "Tỷ lệ giữa thu nhập sau khi nghỉ hưu và thu nhập trước khi nghỉ hưu, khi so sánh trên cùng một kỳ." },
];
