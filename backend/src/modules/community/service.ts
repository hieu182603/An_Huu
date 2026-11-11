import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../common/http";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { AppError } from "../../common/errors";
import { publicProductWhere, productSelect } from "../catalog/service";
import { SocketService } from "../../services/socketService";
export const PRODUCT_CONSULT = "Tư vấn sản phẩm";
export const listQuery = paginationSchema(["createdAt", "updatedAt"]).extend({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(), category: z.string().trim().max(80).optional(), search: z.string().trim().max(120).optional() });
export const CONSULT_CHANNELS = { PHONE: "Điện thoại tư vấn", EMAIL: "Email tài liệu", BRANCH: "Chi nhánh" } as const;
// message stays optional so a request can be sent with only a channel; consent, when sent, must be an explicit true.
export const consultInput = z.object({
  message: z.string().trim().max(2000).default(""),
  phone: z.string().trim().regex(/^[0-9+().\s-]{8,20}$/).optional(),
  channel: z.enum(["PHONE", "EMAIL", "BRANCH"]).default("PHONE"),
  consent: z.literal(true).optional(),
  expectedProductRevision: z.number().int().min(0).optional(),
}).strict();
export const notificationQuery = paginationSchema(["createdAt"]).extend({ search: z.string().trim().max(120).optional(), unread: z.enum(["true", "false"]).optional(), kind: z.enum(["support", "security"]).optional() });
const ACTIVE_TICKET = ["OPEN", "IN_PROGRESS"];
export const ticketInput = z.object({ subject: z.string().trim().min(3).max(200), category: z.enum(["Tài khoản", "Sử dụng website", "Nội dung", "Khác"]), message: z.string().trim().min(3).max(5000) }).strict();
export const replyInput = z.object({ message: z.string().trim().min(1).max(5000) }).strict();
export const ticketStatusInput = z.object({ expectedRevision: z.number().int().min(0), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]) }).strict();
const missing = () => new AppError(404, "NOT_FOUND", "Không tìm thấy yêu cầu.");
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Yêu cầu đã thay đổi. Vui lòng tải lại.");
const ticketSelect = { id: true, userId: true, subject: true, category: true, status: true, revision: true, createdAt: true, updatedAt: true } as const;
const notify = async (tx: Prisma.TransactionClient, userId: string, title: string, message: string, path: string) => {
  const notif = await tx.notification.create({ data: { userId, title, message, path } });
  SocketService.notifyUser(userId, "notification:new", notif);
  return notif;
};
export class CommunityService {
  constructor(private db: PrismaClient) {}
  async tickets(userId: string | null, query: z.infer<typeof listQuery>) {
    const where = { ...(userId ? { userId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.category ? { category: query.category } : {}), ...(query.search ? { OR: ["subject", "category"].map(field => ({ [field]: { contains: query.search, mode: "insensitive" as const } })) } : {}) };
    const [items, total] = await Promise.all([this.db.supportTicket.findMany({ where, select: ticketSelect, orderBy: [{ [query.sortBy]: query.order }, { id: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }), this.db.supportTicket.count({ where })]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async ticket(userId: string | null, id: string) {
    const ticket = await this.db.supportTicket.findFirst({ where: { id, ...(userId ? { userId } : {}) }, select: ticketSelect });
    if (!ticket) throw missing();
    const messages = await this.db.supportMessage.findMany({ where: { ticketId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
      select: { id: true, body: true, createdAt: true, author: { select: { fullName: true, role: true } } } });
    return { ...ticket, messages: messages.reverse() };
  }
  async createTicket(userId: string, input: z.infer<typeof ticketInput>) {
    return transaction(this.db, async tx => {
      const ticket = await tx.supportTicket.create({ data: { userId, subject: input.subject, category: input.category }, select: ticketSelect });
      await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: userId, body: input.message } });
      await audit(tx, userId, "SUPPORT_CREATED", "SUPPORT", ticket.id);
      return ticket;
    });
  }
  /** Product consultations reuse the ticket thread, status and notification flow. */
  async consultProduct(userId: string, productId: string, input: z.input<typeof consultInput>) {
    const { message, phone, channel, consent, expectedProductRevision } = consultInput.parse(input);
    return transaction(this.db, async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const product = await tx.partnerProduct.findFirst({ where: { id: productId, ...publicProductWhere },
      select: { name: true, category: true, expectedReturn: true, riskLevel: true, annualFee: true, conditions:true, disclosure:true, revision: true, partner: { select: { name: true } } } });
    if (!product) throw new AppError(404, "NOT_FOUND", "Sản phẩm không còn được phân phối.");
    if (expectedProductRevision !== undefined && product.revision !== expectedProductRevision) throw conflict();
    // The terms the user saw are frozen into the request; later catalog edits do not rewrite it.
    const snapshot = { name: product.name, partner: product.partner.name, category: product.category, expectedReturn: product.expectedReturn,
      riskLevel: product.riskLevel, annualFee: product.annualFee ?? null, conditions:product.conditions, disclosure:product.disclosure, revision: product.revision };
    const subject = `Tư vấn: ${product.name} (${product.partner.name})`.slice(0, 200);
    const body = [`Sản phẩm: ${product.name}`, `Đối tác: ${product.partner.name}`, `Hình thức liên hệ: ${CONSULT_CHANNELS[channel]}`,
      ...(phone ? [`Số điện thoại liên hệ: ${phone}`] : []),
      `Thông tin sản phẩm lúc gửi: ${product.category} · lợi suất tham khảo ${product.expectedReturn} · rủi ro ${product.riskLevel}${product.annualFee ? ` · phí ${product.annualFee}` : ""}`,
      `Điều kiện: ${product.conditions}`, `Thông tin công bố: ${product.disclosure}`,
    ].join("\n") + (message ? `\n\n${message}` : "");
      if (await tx.supportTicket.findFirst({ where: { userId, productId, status: { in: ACTIVE_TICKET } }, select: { id: true } }))
        throw new AppError(409, "CONSULT_ALREADY_OPEN", "Bạn đã có yêu cầu tư vấn đang xử lý cho sản phẩm này.");
      const ticket = await tx.supportTicket.create({ data: { userId, subject, category: PRODUCT_CONSULT, productId }, select: ticketSelect });
      await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: userId, body } });
      await audit(tx, userId, "PRODUCT_CONSULT_REQUESTED", "PRODUCT", productId, { ticketId: ticket.id, channel, consent: consent ?? null, snapshot });
      return ticket;
    });
  }
  /** The requester may withdraw an unfinished request; resolved or closed requests stay as they are. */
  async cancelTicket(userId: string, id: string) {
    return transaction(this.db, async tx => {
      const ticket = await tx.supportTicket.findFirst({ where: { id, userId }, select: { status: true } });
      if (!ticket) throw missing();
      if (!ACTIVE_TICKET.includes(ticket.status)) throw new AppError(409, "TICKET_NOT_CANCELLABLE", "Yêu cầu đã hoàn tất hoặc đã đóng.");
      const changed = await tx.supportTicket.updateMany({ where: { id, userId, status: ticket.status }, data: { status: "CLOSED", revision: { increment: 1 } } });
      if (!changed.count) throw conflict();
      await audit(tx, userId, "SUPPORT_CANCELLED", "SUPPORT", id, { from: ticket.status });
      return { cancelled: true };
    });
  }
  async savedProducts(userId: string) {
    const rows = await this.db.savedProduct.findMany({ where: { userId, product: publicProductWhere }, orderBy: [{ createdAt: "desc" }, { productId: "asc" }], take: 200, select: { createdAt: true, product: { select: productSelect } } });
    return rows.map(r => ({ ...r.product, savedAt: r.createdAt }));
  }
  async saveProduct(userId: string, productId: string, saved: boolean) {
    return transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      if (!saved) { await tx.savedProduct.deleteMany({ where: { userId, productId } }); return { saved: false }; }
      if (!(await tx.partnerProduct.findFirst({ where: { id: productId, ...publicProductWhere }, select: { id: true } })))
        throw new AppError(404, "NOT_FOUND", "Sản phẩm không còn được phân phối.");
      if (await tx.savedProduct.findUnique({ where: { userId_productId: { userId, productId } }, select: { userId: true } })) return { saved: true };
      if ((await tx.savedProduct.count({ where: { userId } })) >= 200) throw new AppError(409, "SAVED_LIMIT", "Bạn đã lưu tối đa 200 sản phẩm.");
      await tx.savedProduct.upsert({ where: { userId_productId: { userId, productId } }, create: { userId, productId }, update: {} });
      return { saved: true };
    });
  }
  async reply(actor: string, admin: boolean, id: string, message: string) {
    return transaction(this.db, async tx => {
      const ticket = await tx.supportTicket.findFirst({ where: { id, ...(!admin ? { userId: actor } : {}) } });
      if (!ticket) throw missing();
      if (ticket.status === "CLOSED") throw new AppError(409, "TICKET_CLOSED", "Yêu cầu đã đóng. Hãy tạo yêu cầu mới nếu cần hỗ trợ tiếp.");
      const result = await tx.supportMessage.create({ data: { ticketId: id, authorId: actor, body: message } });
      await tx.supportTicket.update({ where: { id }, data: { updatedAt: new Date(), revision: { increment: 1 }, ...(!admin && ticket.status === "RESOLVED" ? { status: "OPEN" } : {}) } });
      if (admin) await notify(tx, ticket.userId, "Có phản hồi hỗ trợ", "Yêu cầu hỗ trợ của bạn đã có phản hồi mới.", "/user/support?ticket=" + id);
      await audit(tx, actor, "SUPPORT_REPLIED", "SUPPORT", id);
      return { id: result.id };
    });
  }
  async ticketStatus(actor: string, id: string, input: z.infer<typeof ticketStatusInput>) {
    return transaction(this.db, async tx => {
      const ticket = await tx.supportTicket.findUnique({ where: { id } }); if (!ticket) throw missing();
      const changed = await tx.supportTicket.updateMany({ where: { id, revision: input.expectedRevision }, data: { status: input.status, revision: { increment: 1 } } });
      if (!changed.count) throw conflict();
      await audit(tx, actor, "SUPPORT_STATUS", "SUPPORT", id, { from: ticket.status, to: input.status });
      await notify(tx, ticket.userId, "Yêu cầu hỗ trợ đã cập nhật", "Xem trạng thái và phản hồi mới nhất của yêu cầu.", "/user/support?ticket=" + id);
      return { updated: true };
    });
  }
  async notifications(userId: string, page: number, limit: number, filters: Pick<z.infer<typeof notificationQuery>, "search" | "unread" | "kind"> = {}) {
    const where = { userId, ...(filters.unread === "true" ? { readAt: null } : {}), ...(filters.kind ? { path: { startsWith: filters.kind === "support" ? "/user/support" : "/user/account" } } : {}), ...(filters.search ? { OR: ["title", "message"].map(field => ({ [field]: { contains: filters.search, mode: "insensitive" as const } })) } : {}) };
    const [items, total, unread] = await Promise.all([this.db.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit, select: { id: true, title: true, message: true, path: true, readAt: true, createdAt: true } }), this.db.notification.count({ where }), this.db.notification.count({ where: { userId, readAt: null } })]);
    return { items, total, unread, page, limit };
  }
  async readNotification(userId: string, id?: string) {
    if (id && !(await this.db.notification.findFirst({ where: { id, userId }, select: { id: true } }))) throw missing();
    await this.db.notification.updateMany({ where: { userId, ...(id ? { id } : {}), readAt: null }, data: { readAt: new Date() } });
    SocketService.notifyUser(userId, id ? "notification:read" : "notification:read_all", { id, readAt: new Date().toISOString() });
    return { updated: true };
  }
}

