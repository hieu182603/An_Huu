import type { RetirementPreviewInput } from "./retirement";

// Keep every saved choice unless the user explicitly changes it.
export function reviseSelection(
  baseline: RetirementPreviewInput,
  changes: Partial<RetirementPreviewInput>,
  profileRevision: number,
): RetirementPreviewInput {
  const result: RetirementPreviewInput = {
    ...baseline,
    ...changes,
    expectedProfileRevision: profileRevision,
  };

  const candidateWhatIf = "whatIf" in changes
    ? (changes.whatIf ? { ...baseline.whatIf, ...changes.whatIf } : undefined)
    : (baseline.whatIf ? { ...baseline.whatIf } : undefined);

  if (candidateWhatIf) {
    const cleaned: NonNullable<RetirementPreviewInput["whatIf"]> = {};
    if (candidateWhatIf.retirementMonth && candidateWhatIf.retirementMonth.trim() !== "") {
      cleaned.retirementMonth = candidateWhatIf.retirementMonth;
    }
    if (Array.isArray(candidateWhatIf.assetValues) && candidateWhatIf.assetValues.length > 0) {
      cleaned.assetValues = candidateWhatIf.assetValues;
    }
    if (Object.keys(cleaned).length > 0) {
      result.whatIf = cleaned;
    } else {
      delete result.whatIf;
    }
  } else {
    delete result.whatIf;
  }

  return result;
}
