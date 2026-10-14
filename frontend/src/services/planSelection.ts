import type { RetirementPreviewInput } from "./retirement";

// Keep every saved choice unless the user explicitly changes it.
export function reviseSelection(
  baseline: RetirementPreviewInput,
  changes: Partial<RetirementPreviewInput>,
  profileRevision: number,
): RetirementPreviewInput {
  return {
    ...baseline,
    ...changes,
    expectedProfileRevision: profileRevision,
    whatIf: changes.whatIf ? { ...baseline.whatIf, ...changes.whatIf } : baseline.whatIf,
  };
}
