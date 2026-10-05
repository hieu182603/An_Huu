export type ContentItem = { id: string; title: string; slug: string; excerpt: string; content: string; category: string; authorName: string; thumbnail: string | null; kind: "ARTICLE" | "FAQ" | "GLOSSARY"; status: "DRAFT" | "PUBLISHED"; revision: number; publishedAt: string | null; updatedAt: string };
export type ContentPage = { items: ContentItem[]; total: number; page: number; limit: number };
export const contentKinds = { ARTICLE: "Bài viết", FAQ: "Câu hỏi thường gặp", GLOSSARY: "Thuật ngữ" };
