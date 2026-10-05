import { AppError } from "../../common/errors";
import { projectRetirement, type ProjectionInput } from "./engine";
import { projectSources, SOURCE_MODEL, SOURCE_SNAPSHOT_FORMAT, type SourceProjectionInput } from "./engine-v4";

export type ReplayInput = ProjectionInput | SourceProjectionInput;
export function replayProjection(format: string, model: string, input: ReplayInput) {
  if (format === SOURCE_SNAPSHOT_FORMAT && model === SOURCE_MODEL && input.modelVersion === SOURCE_MODEL) return projectSources(input);
  if (format === "retirement-plan-snapshot-v1" &&
    ((model === "retirement-monthly-v2" && input.modelVersion === undefined) || (model === "retirement-monthly-v3" && input.modelVersion === "retirement-monthly-v3")))
    return projectRetirement(input as ProjectionInput);
  throw new AppError(409, "SNAPSHOT_MODEL_UNSUPPORTED", "Định dạng và mô hình phiên bản không tương thích.");
}
