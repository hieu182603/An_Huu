import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../common/http";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { AppError } from "../../common/errors";
export const contentQuery = paginationSchema(["updatedAt", "title"]).extend({ search: z.string().trim().max(120).default(""), category: z.string().trim().max(120).optional(), kind: z.enum(["ARTICLE", "FAQ", "GLOSSARY"]).default("ARTICLE"), status: z.enum(["DRAFT", "PUBLISHED"]).optional() });
export const contentInput = z.object({ title: z.string().trim().min(3).max(200), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200), excerpt: z.string().trim().min(1).max(1000), content: z.string().trim().min(1).max(100000), category: z.string().trim().min(1).max(120), authorName: z.string().trim().min(1).max(120), thumbnail: z.string().url().max(2000).refine(v => v.startsWith("https://")).nullable(), kind: z.enum(["ARTICLE", "FAQ", "GLOSSARY"]), status: z.enum(["DRAFT", "PUBLISHED"]) }).strict();
export const contentUpdate = contentInput.extend({ expectedRevision: z.number().int().min(0) });
export const normalized = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
const select = { id: true, title: true, slug: true, excerpt: true, content: true, category: true, authorName: true, thumbnail: true, kind: true, status: true, revision: true, publishedAt: true, updatedAt: true } as const;
const missing = () => new AppError(404, "NOT_FOUND", "Nội dung không tồn tại hoặc chưa được xuất bản.");
export class ContentService {
  constructor(private db: PrismaClient) {}
  async publishedArticle(slug: string) {
    const article = await this.db.article.findFirst({ where: { slug, kind: "ARTICLE", status: "PUBLISHED" }, select });
    if (!article) throw missing();
    return article;
  }
  async list(query: z.infer<typeof contentQuery>, admin = false, savedUserId?: string) {
    const groups: Record<string, string[]> = { bhxh: ["Bảo hiểm xã hội", "Bảo hiểm Xã hội (BHXH)"], invest: ["Đầu tư tích lũy", "Chiến lược đầu tư & Quỹ"], health: ["Sức khỏe & Bảo hiểm", "Bảo hiểm y tế & Sức khỏe"], lifestyle: ["Kế hoạch hưu trí", "Lối sống hưu trí"] };
    const where: Prisma.ArticleWhereInput = { kind: query.kind, ...(!admin ? { status: "PUBLISHED" } : query.status ? { status: query.status } : {}),
      ...(savedUserId ? { savedBy: { some: { userId: savedUserId } } } : {}),
      ...(query.category ? { category: groups[query.category] ? { in: groups[query.category] } : query.category } : {}), ...(query.search ? { AND: normalized(query.search).split(/\s+/).map(word => ({ searchText: { contains: word } })) } : {}) };
    const [items, total] = await Promise.all([this.db.article.findMany({ where, select, orderBy: [{ [query.sortBy]: query.order }, { id: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }), this.db.article.count({ where })]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async write(actor: string, input: z.infer<typeof contentInput>, id?: string, revision?: number) {
    try { return await transaction(this.db, async tx => {
      const current = id ? await tx.article.findUnique({ where: { id } }) : null;
      if (id && !current) throw missing();
      const data = { ...input, searchText: normalized([input.title, input.excerpt, input.content, input.category].join(" ")),
        publishedAt: input.status === "PUBLISHED" ? current?.publishedAt || new Date() : current?.publishedAt || null };
      let result;
      if (id) {
        const changed = await tx.article.updateMany({ where: { id, revision }, data: { ...data, revision: { increment: 1 } } });
        if (!changed.count) throw new AppError(409, "REVISION_CONFLICT", "Bài viết đã thay đổi. Hãy tải lại trước khi lưu.");
        result = await tx.article.findUniqueOrThrow({ where: { id }, select });
      } else result = await tx.article.create({ data, select });
      await audit(tx, actor, id ? "CONTENT_UPDATED" : "CONTENT_CREATED", "ARTICLE", result.id, { status: input.status, kind: input.kind });
      return result;
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new AppError(409, "SLUG_CONFLICT", "Đường dẫn nội dung đã được sử dụng. Hãy chọn đường dẫn khác.");
      throw error;
    }
  }
  async saved(userId: string) {
    return this.db.savedArticle.findMany({ where: { userId, article: { status: "PUBLISHED", kind: "ARTICLE" } }, orderBy: { createdAt: "desc" }, select: { articleId: true } });
  }
  async save(userId: string, articleId: string, enabled: boolean) {
    return transaction(this.db, async tx => {
      if (enabled) {
        const article = await tx.article.findFirst({ where: { id: articleId, status: "PUBLISHED", kind: "ARTICLE" }, select: { id: true } });
        if (!article) throw missing();
        await tx.savedArticle.upsert({ where: { userId_articleId: { userId, articleId } }, create: { userId, articleId }, update: {} });
      } else await tx.savedArticle.deleteMany({ where: { userId, articleId } });
      return { saved: enabled };
    });
  }
}
