import type { ProfileV2 } from "./financialProfile";
import type { RetirementPreviewInput } from "./retirement";
import { reviseSelection } from "./planSelection";

export function selectionForCurrentProfile(baseline: RetirementPreviewInput, draft: Partial<RetirementPreviewInput> | null, profile: ProfileV2, revision: number) {
  const next = reviseSelection(baseline, draft ?? {}, revision);
  const whatIf = { ...next.whatIf };
  const actualMonth = profile.personal.desiredRetirementMonth;
  // A profile update must not keep an old retirement date pinned by the goal screen.
  // Explicit simulation dates in a draft still take precedence.
  if ((!draft?.whatIf?.retirementMonth && baseline.expectedProfileRevision !== revision)
    || (actualMonth.status === "KNOWN" && whatIf.retirementMonth === actualMonth.value)) delete whatIf.retirementMonth;
  if (!whatIf.retirementMonth && !whatIf.assetValues?.length) delete next.whatIf;
  else next.whatIf = whatIf;
  return next;
}
