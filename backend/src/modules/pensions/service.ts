import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { addMonths, monthSchema } from "../../common/calendar";
import { profileV2Schema } from "../profiles/schema-v2";
import { AssumptionsService } from "../assumptions/service";
import { pensionPreviewSchema } from "./schema";
import { pensionAtMonth, type PensionIssue } from "./engine";
import { legalRetirementAge } from "./legal-age";

export class PensionsService {
  constructor(private db: PrismaClient) {}
  async preview(userId: string, command: z.infer<typeof pensionPreviewSchema>) {
    const input = pensionPreviewSchema.parse(command);
    if (!monthSchema.safeParse(addMonths(input.startMonth, input.months - 1)).success)
      throw new AppError(400, "INVALID_HORIZON", "Khoảng mô phỏng vượt lịch được hỗ trợ.");
    const stored = await this.db.financialProfile.findUnique({ where: { userId } });
    if (!stored) throw new AppError(404, "PROFILE_REQUIRED", "Chưa có hồ sơ tài chính.");
    if (stored.revision !== input.expectedProfileRevision) throw new AppError(409, "REVISION_CONFLICT", "Hồ sơ đã thay đổi. Hãy tải lại.");
    if (stored.schemaVersion !== 2) throw new AppError(409, "PROFILE_V2_REQUIRED", "Hãy xác nhận hồ sơ chi tiết phiên bản 2.");
    const parsed = profileV2Schema.safeParse(stored.profileData);
    if (!parsed.success) throw new AppError(409, "PROFILE_DATA_REVIEW_REQUIRED", "Hồ sơ đã lưu cần được rà soát.");
    const data = parsed.data;
    if (input.startMonth < data.valuationDate.slice(0, 7)) throw new AppError(400, "BEFORE_VALUATION", "Khoảng xem trước phải từ tháng định giá.");
    const version = input.assumptionVersionId ? await new AssumptionsService(this.db).get(input.assumptionVersionId, true) : null;
    const issues: PensionIssue[] = [];
    if (!data.pension || data.pension.status === "UNKNOWN") issues.push({ path: "pension", code: "PENSION_NOT_INCLUDED" });
    // Amounts are constant between explicit effective months. Resolve each segment
    // once, so a long preview cannot repeat expensive Decimal CPI powers per row.
    const cache = new Map<string, ReturnType<typeof pensionAtMonth>>();
    const rows = Array.from({ length: input.months }, (_, i) => {
      const month = addMonths(input.startMonth, i);
      const beforeStart = data.personal.pensionStartMonth.status === "KNOWN" && month < data.personal.pensionStartMonth.value;
      const effective = data.pension?.status === "KNOWN" && data.pension.adjustment.kind === "EXPLICIT_SCHEDULE"
        ? data.pension.adjustment.entries.filter(e => e.effectiveMonth <= month).map(e => e.effectiveMonth).sort().at(-1) : undefined;
      const key = beforeStart ? "BEFORE_START" : effective ?? "INITIAL";
      const result = cache.get(key) ?? pensionAtMonth(data, month, version?.data);
      cache.set(key, result);
      issues.push(...result.issues);
      return { month, amount: result.amount };
    });
    const unique = issues.filter((v, i) => issues.findIndex(other => other.code === v.code && other.path === v.path) === i);
    return { status: unique.length ? "INCOMPLETE" : "READY", profileRevision: stored.revision, valuationDate: data.valuationDate,
      currency: "VND", priceBasis: "NOMINAL", estimateBasis: "USER_DECLARED_NOT_VERIFIED", issues: unique, rows,
      assumptionVersionId: version?.id ?? null, assumptionHash: version?.documentHash ?? null,
      declaration: data.pension ?? { status: "UNKNOWN" },
      legalRetirementAge: legalRetirementAge(data.personal, data.valuationDate),
      limitations: ["NOT_A_BENEFIT_ENTITLEMENT", "NO_AUTOMATIC_CPI_INDEXATION", "BENEFIT_ASSESSMENT_NOT_IMPLEMENTED", "AGE_REFERENCE_IS_NOT_PENSION_START"] };
  }
}
