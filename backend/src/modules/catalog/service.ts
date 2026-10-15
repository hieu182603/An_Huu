import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { audit } from "../../common/audit";
import { transaction } from "../../common/transaction";
import { catalogQuery, partnerInput, productInput, notificationSettingsInput } from "./schema";
const missing = () => new AppError(404, "NOT_FOUND", "Không tìm thấy đối tác hoặc sản phẩm.");
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại trước khi lưu.");
const partnerSelect = { id: true, name: true, type: true, logoUrl: true, website: true, isHighlight: true, isVisible: true, revision: true, updatedAt: true } as const;
const productSelect = { id: true, partnerId: true, name: true, category: true, expectedReturn: true, riskLevel: true, description: true, annualFee: true, conditions: true, disclosure: true, imageUrl: true, isVisible: true, revision: true, updatedAt: true, partner: { select: partnerSelect } } as const;
export class CatalogService {
  constructor(private db: PrismaClient) {}
  async partners(query: z.infer<typeof catalogQuery>, admin = false, id?: string) {
    const where = { ...(!admin ? { isVisible: true } : {}), ...(id ? { id } : {}), ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}) };
    const select = { ...partnerSelect, ...(admin ? { contactEmail: true } : {}) };
    const [items, total] = await Promise.all([this.db.partner.findMany({ where, select, orderBy: [{ [query.sortBy]: query.order }, { id: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }), this.db.partner.count({ where })]);
    if (id && !items.length) throw missing();
    return { items, total, page: query.page, limit: query.limit };
  }
  async products(query: z.infer<typeof catalogQuery>, admin = false, id?: string) {
    const where: Prisma.PartnerProductWhereInput = { ...(!admin ? { isVisible: true, partner: { isVisible: true }, annualFee: { not: null }, conditions: { not: null }, disclosure: { not: null } } : {}),
      ...(id ? { id } : {}), ...(query.partnerId ? { partnerId: query.partnerId } : {}), ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}) };
    const [items, total] = await Promise.all([this.db.partnerProduct.findMany({ where, select: productSelect, orderBy: [{ [query.sortBy]: query.order }, { id: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }), this.db.partnerProduct.count({ where })]);
    if (id && !items.length) throw missing();
    return { items, total, page: query.page, limit: query.limit };
  }
  async writePartner(actor: string, raw: z.infer<typeof partnerInput>, id?: string, revision?: number) {
    const data = partnerInput.parse(raw);
    return transaction(this.db, async tx => {
      if (id) {
        if (!await tx.partner.findUnique({ where: { id } })) throw missing();
        if ((await tx.partner.updateMany({ where: { id, revision: revision ?? -1 }, data: { ...data, revision: { increment: 1 } } })).count !== 1) throw conflict();
      }
      const row = id ? await tx.partner.findUniqueOrThrow({ where: { id } }) : await tx.partner.create({ data });
      await audit(tx, actor, id ? "PARTNER_UPDATED" : "PARTNER_CREATED", "PARTNER", row.id, { revision: row.revision, isVisible: row.isVisible });
      return row;
    });
  }
  async writeProduct(actor: string, raw: z.infer<typeof productInput>, id?: string, revision?: number) {
    const data = productInput.parse(raw);
    return transaction(this.db, async tx => {
      const partner = await tx.partner.findUnique({ where: { id: data.partnerId } });
      if (!partner) throw missing();
      if (data.isVisible && !partner.isVisible) throw new AppError(422, "PARTNER_NOT_VISIBLE", "Hãy duyệt hiển thị đối tác trước khi hiển thị sản phẩm.");
      if (id) {
        if (!await tx.partnerProduct.findUnique({ where: { id } })) throw missing();
        if ((await tx.partnerProduct.updateMany({ where: { id, revision: revision ?? -1 }, data: { ...data, revision: { increment: 1 } } })).count !== 1) throw conflict();
      }
      const row = id ? await tx.partnerProduct.findUniqueOrThrow({ where: { id } }) : await tx.partnerProduct.create({ data });
      await audit(tx, actor, id ? "PRODUCT_UPDATED" : "PRODUCT_CREATED", "PRODUCT", row.id, { revision: row.revision, isVisible: row.isVisible });
      return row;
    });
  }
  private settingsView(row: { revision: number; emailDigest: boolean; goalAlerts: boolean; partnerUpdates: boolean } | null) {
    return { revision: row?.revision ?? 0, emailDigest: row?.emailDigest ?? false, goalAlerts: row?.goalAlerts ?? false, partnerUpdates: row?.partnerUpdates ?? false,
      deliveryAvailable: { emailDigest: false, goalAlerts: false, partnerUpdates: false }, securityAndSupportRequired: true };
  }
  async settings(userId: string) { return this.settingsView(await this.db.notificationPreference.findUnique({ where: { userId } })); }
  async saveSettings(userId: string, raw: z.infer<typeof notificationSettingsInput>) {
    const { expectedRevision, ...data } = notificationSettingsInput.parse(raw);
    try {
      return await transaction(this.db, async tx => {
        const row = await tx.notificationPreference.findUnique({ where: { userId } });
        if ((row?.revision ?? 0) !== expectedRevision) throw conflict();
        if (row) {
          if (!(await tx.notificationPreference.updateMany({ where: { userId, revision: expectedRevision }, data: { ...data, revision: { increment: 1 } } })).count) throw conflict();
        } else await tx.notificationPreference.create({ data: { userId, ...data } });
        await audit(tx, userId, "NOTIFICATION_PREFERENCES_UPDATED", "USER", userId, { revision: expectedRevision + 1 });
        return this.settingsView(await tx.notificationPreference.findUniqueOrThrow({ where: { userId } }));
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict();
      throw error;
    }
  }
}
