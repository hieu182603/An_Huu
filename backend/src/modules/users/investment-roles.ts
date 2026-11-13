import { Prisma, InvestmentRole, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { AppError } from "../../common/errors";
import { requireInvestmentRole } from "../recommendation/service";

/** Roles that may grant/revoke investment roles. Kept to one role so the "last manager" rule is unambiguous. */
export const ROLE_MANAGERS: InvestmentRole[] = ["SYSTEM_ADMIN"];
export const investmentRoleChange = z.object({
  role: z.nativeEnum(InvestmentRole),
  reason: z.string().trim().min(3).max(500),
}).strict();
const grantSelect = { role: true, grantedBy: true, createdAt: true } as const;
const adminSelect = { id: true, fullName: true, email: true, status: true, investmentRoles: { select: grantSelect, orderBy: { role: "asc" } } } as const;
type AdminRow = Prisma.UserGetPayload<{ select: typeof adminSelect }>;
const view = (u: AdminRow) => ({ userId: u.id, fullName: u.fullName, email: u.email, status: u.status,
  roles: [...u.investmentRoles].sort((a, b) => a.role.localeCompare(b.role)) });
const notFound = () => new AppError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");

/**
 * Investment roles are a sub-permission layer on ADMIN accounts only (table investment_role_grants).
 * Caller must be an ACTIVE ADMIN holding SYSTEM_ADMIN; checks run inside the serializable transaction,
 * so two managers revoking each other at once cannot leave the system without one.
 */
export class InvestmentRolesService {
  constructor(private db: PrismaClient) {}
  async list(actorId: string) {
    await requireInvestmentRole(this.db, actorId, ROLE_MANAGERS);
    const admins = await this.db.user.findMany({ where: { role: "ADMIN" }, select: adminSelect, orderBy: [{ email: "asc" }], take: 200 });
    return { items: admins.map(view), assignableRoles: Object.values(InvestmentRole) };
  }
  async detail(actorId: string, userId: string) {
    await requireInvestmentRole(this.db, actorId, ROLE_MANAGERS);
    return view(await this.target(this.db, userId));
  }
  async grant(actorId: string, userId: string, raw: z.infer<typeof investmentRoleChange>) {
    const input = investmentRoleChange.parse(raw);
    return transaction(this.db, async tx => {
      await requireInvestmentRole(tx, actorId, ROLE_MANAGERS);
      const target = await this.target(tx, userId);
      // Granting twice is a no-op (no second audit row); the response says nothing changed.
      if (target.investmentRoles.some(g => g.role === input.role)) return { ...view(target), changed: false };
      await tx.investmentRoleGrant.create({ data: { userId, role: input.role, grantedBy: actorId } });
      await audit(tx, actorId, "INVESTMENT_ROLE_GRANTED", "USER", userId, { role: input.role, reason: input.reason });
      return { ...view(await this.target(tx, userId)), changed: true };
    });
  }
  async revoke(actorId: string, userId: string, raw: z.infer<typeof investmentRoleChange>) {
    const input = investmentRoleChange.parse(raw);
    return transaction(this.db, async tx => {
      await requireInvestmentRole(tx, actorId, ROLE_MANAGERS);
      const target = await this.target(tx, userId);
      if (!target.investmentRoles.some(g => g.role === input.role))
        throw new AppError(404, "ROLE_NOT_GRANTED", "Tài khoản này chưa có vai trò đó nên không thể thu hồi.");
      if (ROLE_MANAGERS.includes(input.role)) {
        const remaining = await tx.investmentRoleGrant.count({ where: { role: { in: ROLE_MANAGERS }, userId: { not: userId },
          user: { role: "ADMIN", status: "ACTIVE" } } });
        if (!remaining) throw new AppError(409, "LAST_ROLE_MANAGER", "Không thể thu hồi: đây là tài khoản quản trị vai trò (SYSTEM_ADMIN) đang hoạt động cuối cùng. Hãy cấp SYSTEM_ADMIN cho người khác trước.");
      }
      await tx.investmentRoleGrant.delete({ where: { userId_role: { userId, role: input.role } } });
      await audit(tx, actorId, "INVESTMENT_ROLE_REVOKED", "USER", userId, { role: input.role, reason: input.reason });
      return { ...view(await this.target(tx, userId)), changed: true };
    });
  }
  private async target(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { ...adminSelect, role: true } });
    if (!user) throw notFound();
    if (user.role !== "ADMIN") throw new AppError(422, "INVESTMENT_ROLE_ADMIN_ONLY", "Chỉ tài khoản quản trị (ADMIN) mới nhận vai trò đầu tư.");
    return user;
  }
}
