import { authenticatedRequest } from "./api";
import type { PortfolioAnswerItem, PortfolioPreviewResult } from "./portfolios";
import type { CapitalSeparation, LossConstraint } from "./planningAnalysis";
import type { CustomAllocation, CustomizationPolicy } from "./portfolios";
export type WorkspaceInput={customAllocation?:CustomAllocation;expectedProfileRevision:number;policyVersionId:string;answers:PortfolioAnswerItem[];liquidityNeedMonths:number;templateId?:string;endMonth?:string;retirementMonth?:string};
export type AllocationWorkspaceResult={customAllocation?:CustomAllocation|null;customization?:CustomizationPolicy|null;returnBreakdown?:ReturnBreakdown|null;profileRevision:number;valuationDate:string;policyVersionId:string;assumptionVersionId:string;capital:CapitalSeparation;portfolio:PortfolioPreviewResult|null;loss:LossConstraint;allocations:Array<{assetClass:string;weightPercent:string;amountVnd:string|null}>;assetLabels:Record<string,string>;issues:Array<{path:string;code:string}>;informationalOnly:true};
// Same input, same result: revisiting Allocation reuses it instead of recomputing (~1.5 s).
export const previewAllocation=(input:WorkspaceInput,signal?:AbortSignal)=>authenticatedRequest<AllocationWorkspaceResult>("/me/portfolio-policies/workspace/preview",input,"POST",undefined,{signal,cacheReadOnlyPost:true});
export const saveAllocationTolerance=(input:{expectedRevision:number;policyVersionId:string;reaction:"SELL"|"HOLD"|"BUY_MORE";limit:{kind:"PERCENT"|"AMOUNT";value:string}})=>authenticatedRequest("/me/financial-profile/loss-tolerance",input,"PATCH");

export type ReturnBreakdown={basis:string;rows:Array<{assetClass:string;weightPercent:string;monthlyRate:string;monthlyContribution:string}>;monthly:string;nominalAnnualPercent:string;effectiveAnnualPercent:string;pathAnnualPercent:string;months:number;includesModeledTurnoverCosts:boolean};
export type AllocationPackageProduct={id:string;name:string;partnerId:string;partnerName:string;category:string;annualFeePercent:string;liquidityDays:number;minimumAmount:string};
export type AllocationPackagesResult={status:string;lines:Array<{assetClass:string;weightPercent:string;amountVnd:string|null;status:string;a:AllocationPackageProduct|null;b:AllocationPackageProduct|null}>;A:{ids:string[];annualFeeVnd:string;coveredPercent:string;providers:number};B:{ids:string[];annualFeeVnd:string;coveredPercent:string;providers:number};same:boolean;informationalOnly:true;persisted:false};
export const allocationPackages=(input:WorkspaceInput,signal?:AbortSignal)=>authenticatedRequest<AllocationPackagesResult>("/me/portfolio-policies/workspace/packages",input,"POST",undefined,{signal});
