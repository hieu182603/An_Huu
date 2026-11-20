import { authenticatedRequest, getAccessToken } from "./api";
import { shareInFlight } from "../utils/inFlight";
import type { PortfolioAnswerItem, PortfolioPreviewResult } from "./portfolios";
import type { CapitalSeparation, LossConstraint } from "./planningAnalysis";
import type { CustomAllocation, CustomizationPolicy } from "./portfolios";
export type LossLimitInput = { kind: "PERCENT" | "AMOUNT"; value: string } | { kind: "BOTH"; percent: string; amountVnd: string };
export type ObligationRow = { kind: string; id: string; label: string; priorityRank: number; firstMonth: string | null; lastMonth: string | null; totalNominal: string | null; presentValue?: string | null; deferrable: boolean };
export type LiquidityReconciliationItem = { horizonKey: "y1" | "y3" | "y5"; horizonMonths: number; amount: string; matchedGoalId: string | null; suggestions: Array<{ goalId: string; label: string; dueMonth: string; amountToday: string }> };
export type WorkspaceInput={customAllocation?:CustomAllocation;expectedProfileRevision:number;policyVersionId:string;answers:PortfolioAnswerItem[];liquidityNeedMonths:number;templateId?:string;endMonth?:string;retirementMonth?:string};
export type AllocationWorkspaceResult={obligations?:ObligationRow[];liquidityReconciliation?:LiquidityReconciliationItem[];customAllocation?:CustomAllocation|null;customization?:CustomizationPolicy|null;returnBreakdown?:ReturnBreakdown|null;profileRevision:number;valuationDate:string;policyVersionId:string;assumptionVersionId:string;capital:CapitalSeparation;portfolio:PortfolioPreviewResult|null;loss:LossConstraint;allocations:Array<{assetClass:string;weightPercent:string;amountVnd:string|null}>;assetLabels:Record<string,string>;issues:Array<{path:string;code:string}>;informationalOnly:true};
// Share concurrent checks as well as completed previews. Keep accounts isolated.
export const previewAllocation=(input:WorkspaceInput,signal?:AbortSignal)=>shareInFlight(
  `allocation:${getAccessToken()??"anonymous"}:${JSON.stringify(input)}`,signal,
  shared=>authenticatedRequest<AllocationWorkspaceResult>("/me/portfolio-policies/workspace/preview",input,"POST",undefined,{signal:shared,cacheReadOnlyPost:true})
);
export const saveAllocationTolerance=(input:{expectedRevision:number;policyVersionId:string;reaction:"SELL"|"HOLD"|"BUY_MORE";limit:LossLimitInput})=>authenticatedRequest("/me/financial-profile/loss-tolerance",input,"PATCH");

export type ReturnBreakdown={basis:string;rows:Array<{assetClass:string;weightPercent:string;monthlyRate:string;monthlyContribution:string}>;monthly:string;nominalAnnualPercent:string;effectiveAnnualPercent:string;pathAnnualPercent:string;months:number;includesModeledTurnoverCosts:boolean};
export type AllocationPackageProduct={id:string;name:string;partnerId:string;partnerName:string;category:string;annualFeePercent:string;liquidityDays:number;minimumAmount:string};
export type AllocationPackagesResult={status:string;lines:Array<{assetClass:string;weightPercent:string;amountVnd:string|null;minimumNeededVnd?:string|null;status:string;a:AllocationPackageProduct|null;b:AllocationPackageProduct|null}>;A:{ids:string[];annualFeeVnd:string;coveredPercent:string;providers:number};B:{ids:string[];annualFeeVnd:string;coveredPercent:string;providers:number};same:boolean;informationalOnly:true;persisted:false};
export const allocationPackages=(input:WorkspaceInput,signal?:AbortSignal)=>authenticatedRequest<AllocationPackagesResult>("/me/portfolio-policies/workspace/packages",input,"POST",undefined,{signal});

export type AllocationConfirmation={profileRevision:number;confirmed:boolean};
/** Server memory of "the 3 steps are done": valid until the financial profile changes. */
export const getAllocationConfirmation=()=>authenticatedRequest<AllocationConfirmation>("/me/portfolio-policies/workspace/confirmation",undefined,"GET",undefined,{skipCache:true});
export const confirmAllocation=(expectedRevision:number)=>authenticatedRequest<AllocationConfirmation>("/me/portfolio-policies/workspace/confirmation",{expectedRevision},"PUT");
