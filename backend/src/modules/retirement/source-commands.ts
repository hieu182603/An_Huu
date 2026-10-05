import { AppError } from "../../common/errors";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { digest } from "../../common/digest";
import { flowSourceCommandSchema, type FlowSourceCommand } from "../plans/source-schema";
import { assertSourceRegistry, composeSourceMonths, sealSourceRegistry, sealSourceRevision, type SourceRegistry, type SourceCell } from "./sources";
const fail = (code: string, status = 422): never => { throw new AppError(status, code, "Cần rà soát thao tác và nguồn dòng tiền."); };

export function applyFlowSourceCommand(registry: SourceRegistry, commandValue: FlowSourceCommand, cutoff: string, knownOn: string) {
  const command = flowSourceCommandSchema.parse(commandValue);
  assertSourceRegistry(registry); monthSchema.parse(cutoff); dateSchema.parse(knownOn);
  if (knownOn < registry.knowledgeAsOf || command.effectiveFromMonth <= cutoff || command.effectiveFromMonth < registry.startMonth ||
    command.effectiveToMonth > registry.endMonth || command.effectiveFromMonth > command.effectiveToMonth) fail("SOURCE_COMMAND_PERIOD_INVALID");
  const previous = registry.revisions.filter(r => r.sourceId === command.sourceId).at(-1);
  if (command.operation === "CREATE" ? !!previous || command.expectedSourceRevision !== 0 || !command.sourceId.startsWith("plan:")
    : !previous || previous.operation === "END" || previous.revision !== command.expectedSourceRevision) fail("SOURCE_REVISION_CONFLICT", 409);
  if (previous && !["INCOME", "EXPENSE", "PENSION"].includes(previous.kind)) fail("SOURCE_REQUIRES_SPECIALIZED_COMMAND");
  const metric = command.operation === "END" ? null : command.metric;
  const kind = metric === null ? previous!.kind : metric === "income" ? "INCOME" : metric === "pension" ? "PENSION" : "EXPENSE";
  if (previous && previous.kind !== kind) fail("SOURCE_METRIC_MISMATCH");
  if (command.operation !== "END" && command.frequency === "ONCE" && command.effectiveFromMonth !== command.effectiveToMonth) fail("ONE_OFF_SOURCE_REQUIRES_SINGLE_MONTH");
  const affectedMetrics = new Set([...(metric ? [metric] : []), ...(previous?.schedule.map(c => c.metric) ?? [])]);
  // REVISE/END also removes the prior schedule after the new interval; it does
  // not resume automatically. Check overrides over that entire affected tail.
  const active = composeSourceMonths(registry, command.effectiveFromMonth, previous ? registry.endMonth : command.effectiveToMonth).attribution;
  if (active.some(c => affectedMetrics.has(c.metric) && registry.revisions.some(r => r.sourceHash === c.sourceHash && r.kind === "AGGREGATE")))
    fail("SOURCE_AGGREGATE_OVERLAP");
  if (metric === "pension" && active.some(c => c.metric === "pension" && c.month <= command.effectiveToMonth && c.sourceId !== command.sourceId)) fail("PENSION_SOURCE_OVERLAP");
  const schedule: SourceCell[] = [];
  if (command.operation !== "END") for (let month = command.effectiveFromMonth; month <= command.effectiveToMonth; month = addMonths(month, 1))
    schedule.push({ month, metric: command.metric, amount: command.amount });
  const revision = sealSourceRevision({ sourceId: command.sourceId, revision: (previous?.revision ?? 0) + 1, previousHash: previous?.sourceHash ?? null,
    scope: "PLAN_VERSION", origin: previous?.origin ?? "PLAN_CREATED", kind, effectiveFromMonth: command.effectiveFromMonth, effectiveToMonth: command.effectiveToMonth,
    knownOn, evidenceHash: digest(command), commandId: command.commandId, confirmation: command.operation === "END" ? "USER_CONFIRMED" : command.confirmation,
    operation: command.operation, schedule });
  return sealSourceRegistry({ ...registry, knowledgeAsOf: knownOn, revisions: [...registry.revisions, revision] });
}
