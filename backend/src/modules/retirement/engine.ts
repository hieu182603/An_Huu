import { AppError } from "../../common/errors";
import { RETIREMENT_MODEL_V3, RETIREMENT_MODEL_V5 } from "./schema";
import { projectRetirement as projectV2, type ProjectionInput as LegacyInput } from "./engine-v2";
import { projectRetirementV3 } from "./engine-v3";
import { projectRetirementV5 } from "./engine-v5";
import type { ProjectionInput } from "./engine-core";

export { RetirementDecimal } from "./engine-core";
export type { MonthlyInput, ProjectionInput } from "./engine-core";

/** Dispatcher. Unmarked historical payloads belong to the frozen v2 engine, "retirement-monthly-v3"
 * to the frozen v3 kernel (withdrawal at end of month) and "retirement-monthly-v5" to the
 * start-of-month-withdrawal kernel. Never reinterpret the conventions of a saved model. */
export function projectRetirement(input: ProjectionInput): ReturnType<typeof projectRetirementV3> | ReturnType<typeof projectV2> {
  if (input.modelVersion === undefined) return projectV2(input as LegacyInput);
  if (input.modelVersion === RETIREMENT_MODEL_V3) return projectRetirementV3(input);
  // v5 rows/summary are a superset of v3 (extra row fields at the end); callers keep the v3 shape.
  if (input.modelVersion === RETIREMENT_MODEL_V5) return projectRetirementV5(input) as unknown as ReturnType<typeof projectRetirementV3>;
  throw new AppError(422, "SNAPSHOT_MODEL_UNSUPPORTED", "Mô hình không được hỗ trợ.");
}
