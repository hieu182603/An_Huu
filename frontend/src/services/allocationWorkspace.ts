import { authenticatedRequest } from "./api";
import type { PortfolioAnswerItem, PortfolioPreviewResult } from "./portfolios";
import type { CapitalSeparation, LossConstraint } from "./planningAnalysis";
export type WorkspaceInput={expectedProfileRevision:number;policyVersionId:string;answers:PortfolioAnswerItem[];liquidityNeedMonths:number;templateId?:string;endMonth?:string;retirementMonth?:string};
export type AllocationWorkspaceResult={profileRevision:number;valuationDate:string;policyVersionId:string;assumptionVersionId:string;capital:CapitalSeparation;portfolio:PortfolioPreviewResult|null;loss:LossConstraint;allocations:Array<{assetClass:string;weightPercent:string;amountVnd:string|null}>;assetLabels:Record<string,string>;issues:Array<{path:string;code:string}>;informationalOnly:true};
export const previewAllocation=(input:WorkspaceInput,signal?:AbortSignal)=>authenticatedRequest<AllocationWorkspaceResult>("/me/portfolio-policies/workspace/preview",input,"POST",undefined,{signal});
export const saveAllocationTolerance=(input:{expectedRevision:number;policyVersionId:string;reaction:"SELL"|"HOLD"|"BUY_MORE";limit:{kind:"PERCENT"|"AMOUNT";value:string}})=>authenticatedRequest("/me/financial-profile/loss-tolerance",input,"PATCH");
