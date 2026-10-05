import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../common/http";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { AppError } from "../../common/errors";
export const listQuery = paginationSchema(["createdAt", "updatedAt"]).extend({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional() });
export const ticketInput = z.object({ subject: z.string().trim().min(3).max(200), category: z.enum(["Tài khoản", "Sử dụng website", "Nội dung", "Khác"]), message: z.string().trim().min(3).max(5000) }).strict();
export const replyInput = z.object({ message: z.string().trim().min(1).max(5000) }).strict();
export const ticketStatusInput = z.object({ expectedRevision: z.number().int().min(0), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]) }).strict();
const missing = () => new AppError(404, "NOT_FOUND", "Không tìm thấy yêu cầu.");
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Yêu cầu đã thay đổi. Vui lòng tải lại.");
const ticketSelect = { id: true, userId: true, subject: true, category: true, status: true, revision: true, createdAt: true, updatedAt: true } as const;
const notify = (tx: Prisma.TransactionClient, userId: string, title: string, message: string, path: string) => tx.notification.create({ data: { userId, title, message, path } });
export class CommunityService {
  constructor(private db: PrismaClient) {}
  async tickets(userId: string | null, query: z.infer<typeof listQuery>) {
    const where = { ...(userId ? { userId } : {}), ...(query.status ? { status: query.status } : {}) };
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
  async notifications(userId: string, page: number, limit: number) {
    const [items, total, unread] = await Promise.all([this.db.notification.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit, select: { id: true, title: true, message: true, path: true, readAt: true, createdAt: true } }), this.db.notification.count({ where: { userId } }), this.db.notification.count({ where: { userId, readAt: null } })]);
    return { items, total, unread, page, limit };
  }
  async readNotification(userId: string, id?: string) {
    if (id && !(await this.db.notification.findFirst({ where: { id, userId }, select: { id: true } }))) throw missing();
    await this.db.notification.updateMany({ where: { userId, ...(id ? { id } : {}), readAt: null }, data: { readAt: new Date() } });
    return { updated: true };
  }
}
