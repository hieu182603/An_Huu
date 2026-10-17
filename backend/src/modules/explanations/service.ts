import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors";
import { PlansService } from "../plans/service";
import { RetirementService } from "../retirement/service";
import { explainMetric } from "./registry";
import { metricExplanationSchema, type MetricExplanationRequest, type MetricExplanationSource } from "./schema";

export class ExplanationsService {
  constructor(private db: PrismaClient) {}
  private async load(userId: string, source: MetricExplanationSource) {
    if (source.kind === "PLAN_VERSION") {
      const saved = await new PlansService(this.db).readVersion(this.db, userId, source.planId, source.versionId);
      return { preview: saved.version.preview, capture: saved.capture };
    }
    const retirement = new RetirementService(this.db);
    const capture = await retirement.capture(this.db, userId, source.input);
    return { preview: retirement.previewForExplanation(capture, source.input), capture };
  }
  async metric(userId: string, command: MetricExplanationRequest) {
    const { metricKey, source, detail } = metricExplanationSchema.parse(command);
    const { preview, capture } = await this.load(userId, source);
    const explanation = explainMetric(metricKey, preview, capture, detail);
    if (!explanation) throw new AppError(422, "METRIC_NOT_AVAILABLE", "Chỉ số không có trong nguồn dữ liệu này. Hãy chọn đúng bản xem trước hoặc phiên bản kế hoạch.");
    return explanation;
  }
}
