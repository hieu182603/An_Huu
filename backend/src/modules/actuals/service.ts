import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type ActualMonth } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { monthSchema, addMonths } from "../../common/calendar";
import { PlansService } from "../plans/service";
import { projectRetirement, RetirementDecimal as D, type ProjectionInput } from "../retirement/engine";
import { actualWriteSchema, actualPayloadSchema, actualRangeSchema, actualForecastSchema } from "./schema";
import { reconcile } from "./reconcile";
import { reforecastPreviewSchema } from "./schema";
import { assertActualSource, type ReforecastLineage } from "./lineage";
import { digest } from "../../common/digest";
import { RETIREMENT_MODEL, retirementPreviewSchema } from "../retirement/schema";
import type { RetirementResult } from "../retirement/service";
import { profileV2Schema } from "../profiles/schema-v2";
import { updateSourceRows } from "./source-changes";
import { updateFutureRows } from "./future";
import { projectSources, SOURCE_MODEL } from "../retirement/engine-v4";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Sổ tháng đã thay đổi. Hãy tải lại.");
const missing = () => new AppError(404, "NOT_FOUND", "Chưa có số liệu tháng này.");
const view = (row: ActualMonth) => { const data = actualPayloadSchema.parse(row.payload); return { id: row.id, period: row.period,
  revision: row.revision, updatedAt: row.updatedAt.toISOString(), valueKind: "ACTUAL", data, ...reconcile(data) }; };
// Vietnam calendar; do not use the host's local timezone to close a month.
const currentMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
export class ActualsService {
  constructor(private db: PrismaClient) {}
  async write(userId: string, period: string, command: z.infer<typeof actualWriteSchema>, key: string) {
    monthSchema.parse(period); z.string().uuid().parse(key);
    const input = actualWriteSchema.parse(command);
    if (period > currentMonth()) throw new AppError(422, "FUTURE_ACTUAL_MONTH", "Không ghi thực tế cho tháng tương lai.");
    if (input.data.entries.some(e => e.date.slice(0, 7) !== period)) throw new AppError(422, "ENTRY_MONTH_MISMATCH", "Ngày giao dịch phải thuộc tháng đang ghi.");
    const scope = "retirement.actuals.write", requestHash = createHash("sha256").update(JSON.stringify({ period, input })).digest("hex");
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await transaction(this.db, async tx => {
        const previous = await tx.idempotencyRecord.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
        if (previous) {
          if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "Khóa đã được dùng cho yêu cầu khác.");
          return previous.response as unknown as ReturnType<typeof view>;
        }
        const old = await tx.actualMonth.findFirst({ where: { userId, period } });
        if ((old?.revision ?? 0) !== input.expectedRevision) throw conflict();
        const revision = input.expectedRevision + 1, payload = json(input.data);
        const row = old ?? await tx.actualMonth.create({ data: { userId, period, revision, payload } });
        if (old) {
          const changed = await tx.actualMonth.updateMany({ where: { id: old.id, userId, revision: input.expectedRevision }, data: { revision, payload } });
          if (changed.count !== 1) throw conflict();
        }
        for (const entry of input.data.entries) {
          const identity = await tx.actualEventIdentity.findFirst({ where: { userId, eventId: entry.eventId } });
          if (identity && identity.monthId !== row.id) throw new AppError(409, "EVENT_ALREADY_RECORDED", "Mã giao dịch đã được ghi ở tháng khác.");
          if (!identity) await tx.actualEventIdentity.create({ data: { userId, eventId: entry.eventId, monthId: row.id } });
        }
        await tx.actualMonthRevision.create({ data: { monthId: row.id, revision, payload } });
        await audit(tx, userId, "ACTUAL_MONTH_RECORDED", "ACTUAL_MONTH", row.id, { period, revision });
        const result = view((await tx.actualMonth.findFirst({ where: { id: row.id } }))!);
        await tx.idempotencyRecord.create({ data: { userId, scope, key, requestHash, response: json(result) } });
        return result;
      }); } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        if (attempt === 2) throw conflict();
      }
    }
    throw conflict();
  }
  async list(userId: string, query: z.infer<typeof actualRangeSchema>) {
    const q = actualRangeSchema.parse(query);
    return { valueKind: "ACTUAL", items: (await this.db.actualMonth.findMany({ where: { userId, period: { gte: q.from, lte: q.to } }, orderBy: { period: "asc" } })).map(view) };
  }
  async get(userId: string, period: string) {
    monthSchema.parse(period);
    return transaction(this.db, async tx => {
      const row = await tx.actualMonth.findFirst({ where: { userId, period } }); if (!row) throw missing();
      return { ...view(row), history: (await tx.actualMonthRevision.findMany({ where: { monthId: row.id }, orderBy: { revision: "desc" } }))
        .map(r => ({ revision: r.revision, createdAt: r.createdAt.toISOString(), data: actualPayloadSchema.parse(r.payload) })) };
    });
  }
  async forecast(userId: string, command: z.infer<typeof actualForecastSchema>, client?: Prisma.TransactionClient) {
    const input = actualForecastSchema.parse(command);
    const read = async (tx: Prisma.TransactionClient) => {
      const { plan, version } = await new PlansService(this.db).readVersion(tx, userId, input.planId, input.versionId);
      await assertActualSource(tx, userId, version.preview.reforecast);
      const replay = version.preview.replayInput!;
      const start = replay.valuationDate.slice(0, 7), end = replay.rows.at(-1)!.month;
      if (input.throughMonth < start || input.throughMonth > end) throw new AppError(422, "ACTUAL_PERIOD_OUTSIDE_VERSION", "Tháng đối soát nằm ngoài phiên bản.");
      const actuals = (await tx.actualMonth.findMany({ where: { userId, period: { gte: start, lte: input.throughMonth } }, orderBy: { period: "asc" } })).map(view);
      const issues: Array<{ month: string; code: string }> = [];
      if (input.throughMonth >= currentMonth()) issues.push({ month: input.throughMonth, code: "MONTH_NOT_CLOSED" });
      let previous: typeof actuals[number] | undefined;
      for (let month = start; month <= input.throughMonth; month = addMonths(month, 1)) {
        const actual = actuals.find(a => a.period === month);
        if (!actual) { issues.push({ month, code: "MISSING_MONTH" }); previous = undefined; continue; }
        if (actual.reconciliation !== "MATCHED") issues.push({ month, code: "UNRECONCILED_MONTH" });
        if (previous && !new D(actual.data.openingBalance).eq(previous.data.closingBalance)) issues.push({ month, code: "OPENING_BALANCE_MISMATCH" });
        previous = actual;
      }
      const last = actuals.find(a => a.period === input.throughMonth), nextMonth = addMonths(input.throughMonth, 1);
      if (version.preview.reforecast && actuals[0] && !new D(actuals[0].data.openingBalance).eq(replay.initialCapital))
        issues.push({ month: start, code: "OPENING_BALANCE_MISMATCH" });
      const remaining = replay.rows.filter(r => r.month > input.throughMonth);
      const anchored = { ...replay,
        valuationDate: nextMonth + "-01", retirementMonth: replay.retirementMonth < nextMonth ? nextMonth : replay.retirementMonth,
        initialCapital: last?.data.closingBalance ?? "0", rows: remaining };
      const calculation = !issues.length && remaining.length ? anchored.modelVersion === SOURCE_MODEL ? projectSources(anchored) : projectRetirement(anchored) : null;
      return { status: issues.length ? "BLOCKED" : remaining.length ? "READY" : "HORIZON_COMPLETE", valueKind: "REFORECAST",
        planId: plan.id, versionId: version.id, snapshotHash: version.snapshotHash, baselineVersionId: plan.baselineVersionId,
        throughMonth: input.throughMonth, originalRetirementMonth: version.preview.reforecast?.originalRetirementMonth ?? replay.retirementMonth,
        actuals, issues, calculation, anchor: last ? { period: last.period, revision: last.revision, closingBalance: last.data.closingBalance } : null,
        comparison: actuals.map(a => { const row = version.preview.calculation!.rows.find(r => r.month === a.period)!;
          return { month: a.period, actualRevision: a.revision, actualClosingBalance: a.data.closingBalance, forecastClosingBalance: row.closingBalance,
            closingBalanceDelta: new D(a.data.closingBalance).minus(row.closingBalance).toFixed(),
            actualContribution: a.actualContribution, forecastContribution: row.contribution }; }),
        limitations: ["ORIGINAL_VERSION_FUTURE_CASHFLOWS_AND_RATES_RETAINED", "ACTUAL_ONE_OFFS_NOT_REPEATED", "NO_AUTOMATIC_SURPLUS_DEPOSIT", "CONSOLIDATED_FUND_SCOPE_MUST_MATCH_VERSION", "REFORECAST_NOT_SAVED_OR_APPLIED"],
      };
    };
    return client ? read(client) : transaction(this.db, read);
  }
  async previewUpdate(userId: string, command: z.infer<typeof reforecastPreviewSchema>, client?: Prisma.TransactionClient) {
    const input = reforecastPreviewSchema.parse(command);
    const read = async (tx: Prisma.TransactionClient) => {
      const { version, capture } = await new PlansService(this.db).readVersion(tx, userId, input.planId, input.versionId);
      if (version.preview.modelVersion === SOURCE_MODEL)
        throw new AppError(422, "SOURCE_VERSION_USE_SOURCE_COMMANDS", "Dùng luồng cập nhật nguồn v4 để giữ lịch và căn cứ từng nguồn.");
      const profile = await tx.financialProfile.findUnique({ where: { userId } });
      if (!profile || profile.revision !== input.expectedProfileRevision || profile.revision !== version.profileRevision)
        throw new AppError(409, "PROFILE_CHANGED_RECREATE_VERSION", "Hồ sơ đã đổi. Hãy tạo phiên bản nguồn phù hợp trước khi cập nhật từ thực tế.");
      if (digest(profileV2Schema.parse(profile.profileData)) !== digest(capture.profile))
        throw new AppError(409, "PROFILE_CHANGED_RECREATE_VERSION", "Nội dung hồ sơ khác phiên bản nguồn.");
      const forecast = await this.forecast(userId, { planId: input.planId, versionId: input.versionId, throughMonth: input.throughMonth }, tx);
      if (forecast.status !== "READY" || !forecast.calculation || !forecast.anchor)
        return { status: forecast.status, issues: forecast.issues, inputHash: null, candidate: null, beforeChanges: null, saved: false, applied: false };
      const nextMonth = addMonths(input.throughMonth, 1), original = version.preview, replay = original.replayInput!;
      if ([...input.futureChanges, ...(input.sourceChanges ?? [])].some(change => [...(original.futureChanges ?? []), ...(original.sourceChanges ?? [])].some(previous => previous.id === change.id)))
        throw new AppError(422, "FUTURE_CHANGE_ID_REUSED", "Mỗi lần điều chỉnh cần mã mới để giữ lịch sử nguồn.");
      const remaining = replay.rows.filter(r => r.month > input.throughMonth);
      const selection = retirementPreviewSchema.parse(original.selection);
      const sourceChanges = input.sourceChanges ?? [];
      const revisedSources = updateSourceRows(remaining, sourceChanges, original.sourceChanges ?? [], capture.profile, selection,
        forecast.actuals, [...(original.futureChanges ?? []), ...input.futureChanges]);
      const rows = updateFutureRows(revisedSources, input.futureChanges, selection, forecast.originalRetirementMonth, sourceChanges.length > 0);
      const replayInput: ProjectionInput = { ...replay, modelVersion: RETIREMENT_MODEL,
        valuationDate: nextMonth + "-01", retirementMonth: forecast.originalRetirementMonth < nextMonth ? nextMonth : forecast.originalRetirementMonth,
        initialCapital: forecast.anchor.closingBalance, rows };
      // Historical research timing is never promoted into a production command.
      if (replayInput.contributionTiming === "START_OF_MONTH_RESEARCH")
        throw new AppError(422, "RESEARCH_MODEL_NOT_APPLICABLE", "Không tạo kế hoạch sản phẩm từ nhánh nghiên cứu.");
      const lineage: ReforecastLineage = { kind: "ACTUAL_REFORECAST", sourceVersionId: version.id, sourceSnapshotHash: version.snapshotHash,
        originalValuationDate: original.reforecast?.originalValuationDate ?? original.valuationDate,
        originalRetirementMonth: forecast.originalRetirementMonth, throughMonth: input.throughMonth,
        actualRevisions: [...(original.reforecast?.actualRevisions ?? []), ...forecast.actuals.map(a => ({ period: a.period, revision: a.revision, closingBalance: a.data.closingBalance }))] };
      const inputHash = digest({ input, selection, sourceHash: version.snapshotHash, lineage, replayInput });
      const candidate: RetirementResult = { ...original, status: "READY", issues: [], modelVersion: RETIREMENT_MODEL,
        valuationDate: replayInput.valuationDate, inputHash, replayInput, reforecast: lineage, selection,
        futureChanges: [...(original.futureChanges ?? []), ...input.futureChanges],
        sourceChanges: [...(original.sourceChanges ?? []), ...sourceChanges],
        calculation: { ...original.calculation!, ...projectRetirement(replayInput),
          marketRows: original.calculation!.marketRows.filter(r => r.month >= nextMonth),
          limitations: [...original.calculation!.limitations.filter(s => !["Q13_START_TIMING_RESEARCH_ONLY", "Q15_NO_AUTOMATIC_SURPLUS_DEPOSIT", "DEBT_PENSION_CAPITAL_EVENTS_REQUIRE_SEPARATE_SOURCE_REVIEW"].includes(s)),
            "EXPLICIT_DEPOSITS_ONLY", "ACTUAL_REFORECAST_SOURCE_REVISIONS_PINNED", "FUTURE_CHANGES_REPLACE_NAMED_MONTHLY_TOTALS",
            "SOURCE_CHANGES_REQUIRE_CONFIRMED_DOCUMENT_AND_ACTUAL_REFERENCE", "PROFILE_NET_WORTH_AND_GOAL_SELECTION_RETAIN_ORIGINAL_BASIS"] } };
      return { status: "READY", issues: [], inputHash, candidate,
        beforeChanges: projectRetirement({ ...replayInput, rows: remaining }), saved: false, applied: false };
    };
    return client ? read(client) : transaction(this.db, read);
  }
}
