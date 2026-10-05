import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../common/http";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { AppError } from "../../common/errors";
export const userListSchema = paginationSchema(["createdAt", "fullName", "email"]).extend({
  search: z.string().trim().max(120).default(""), status: z.enum(["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"]).optional(),
});
export const userStatusSchema = z.object({ expectedRevision: z.number().int().min(0), action: z.enum(["suspend", "restore"]), reason: z.string().trim().min(3).max(500) }).strict();
const userSelect = { id: true, fullName: true, email: true, phone: true, city: true, avatarUrl: true, role: true, status: true, revision: true, emailVerifiedAt: true, createdAt: true, lastActiveAt: true } as const;
export class UsersService {
  constructor(private db: PrismaClient, private disconnect: (id: string) => void = () => {}) {}
  async list(query: z.infer<typeof userListSchema>) {
    const where: Prisma.UserWhereInput = { role: "USER", ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: ["fullName", "email", "phone"].map(key => ({ [key]: { contains: query.search, mode: "insensitive" } })) } : {}) };
    const [items, total] = await Promise.all([
      this.db.user.findMany({ where, select: userSelect, orderBy: [{ [query.sortBy]: query.order }, { id: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.db.user.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async detail(id: string) {
    const user = await this.db.user.findFirst({ where: { id, role: "USER" }, select: userSelect });
    if (!user) throw new AppError(404, "NOT_FOUND", "Không tìm thấy người dùng.");
    const history = await this.db.auditLog.findMany({ where: { targetType: "USER", targetId: id }, orderBy: { createdAt: "desc" }, take: 30,
      select: { id: true, action: true, performerName: true, details: true, createdAt: true } });
    return { user, history };
  }
  async status(actorId: string, id: string, input: z.infer<typeof userStatusSchema>) {
    if (actorId === id) throw new AppError(403, "FORBIDDEN", "Không thể thay đổi trạng thái của chính mình.");
    const user = await transaction(this.db, async tx => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target || target.role !== "USER") throw new AppError(404, "NOT_FOUND", "Không tìm thấy người dùng.");
      const status = input.action === "suspend" ? "SUSPENDED" : target.emailVerifiedAt ? "ACTIVE" : "PENDING_VERIFICATION";
      const result = await tx.user.updateMany({ where: { id, role: "USER", revision: input.expectedRevision }, data: { status, revision: { increment: 1 }, securityVersion: { increment: 1 } } });
      if (!result.count) throw new AppError(409, "REVISION_CONFLICT", "Trạng thái đã thay đổi. Vui lòng tải lại.");
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, actorId, "ADMIN_USER_STATUS", "USER", id, { from: target.status, to: status, reason: input.reason });
      return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    });
    this.disconnect(id); return user;
  }
}
