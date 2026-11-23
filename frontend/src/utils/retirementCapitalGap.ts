import type { RetirementPreviewResult } from "../services/retirement";
import { Decimal } from "./decimal";
import { financeAmount } from "./financeHubSummary";

export function retirementCapitalGap(preview: RetirementPreviewResult | null | undefined) {
  const summary = preview?.calculation?.summary;
  const required = financeAmount(summary?.atRetirement.requiredFund);
  // Older plain previews used the declared capital as the opening balance.
  const declared = financeAmount(preview?.capitalSeparation
    ? preview.capitalSeparation.retirementLiquidAssets
    : preview?.reforecast || preview?.selection.allocationFunding === "PROTECTED_CAPITAL_V1"
      ? null
      : summary?.initialRetirementCapital);
  const remaining = required === null || declared === null
    ? null
    : Decimal.max(0, new Decimal(required).minus(declared)).toString();
  return { declared, remaining };
}
