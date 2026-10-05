import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors";
import { profileV2Schema } from "../profiles/schema-v2";
import { debtPreviewSchema, type DebtPreviewInput } from "./schema";
import { previewDebts } from "./engine";
import { profileV2Summary } from "../profiles/summary-v2";

export class DebtService {
  constructor(private db: PrismaClient) {}
  async preview(userId: string, command: DebtPreviewInput) {
    const input = debtPreviewSchema.parse(command);
    const profile = await this.db.financialProfile.findUnique({ where: { userId } });
    if (!profile) throw new AppError(404, "PROFILE_REQUIRED", "Chưa có hồ sơ tài chính.");
    if (profile.revision !== input.expectedProfileRevision) throw new AppError(409, "REVISION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại trước khi so sánh.");
    if (profile.schemaVersion !== 2) throw new AppError(409, "PROFILE_V2_REQUIRED", "Hãy xác nhận hồ sơ chi tiết phiên bản 2 trước khi so sánh nợ.");
    const parsed = profileV2Schema.safeParse(profile.profileData);
    if (!parsed.success) throw new AppError(409, "PROFILE_DATA_REVIEW_REQUIRED", "Dữ liệu hồ sơ đã lưu cần được rà soát.");
    const summary = profileV2Summary(parsed.data);
    return { profileRevision: profile.revision, ...previewDebts(parsed.data, input),
      capital: { netWorth: summary.values.netWorth, retirementLiquidAssets: summary.values.retirementLiquidAssets } };
  }
}
