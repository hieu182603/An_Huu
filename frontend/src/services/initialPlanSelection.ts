import type { ProfileV2 } from "./financialProfile";
import type { RetirementPreviewInput } from "./retirement";
/** The explicit first preview used by both Plan and Allocation. Zero is a trial
 * contribution, never an inferred saving capacity or a saved user commitment. */
export function initialPlanSelection(profile:ProfileV2,revision:number,policyVersionId:string,endMonth:string,monthlyExpenseToday:string,answers:RetirementPreviewInput["answers"]):RetirementPreviewInput{
 return {expectedProfileRevision:revision,policyVersionId,answers,liquidityNeedMonths:6,endMonth,monthlyExpenseToday,
  monthlyContribution:"0",monthlyReserve:"0",terminalBalance:"0",scenario:"BASE",contributionTiming:"END_OF_MONTH",surplusPolicy:"EXPLICIT_DEPOSITS_ONLY",
  retirementIncomeIds:profile.income.status==="KNOWN"?profile.income.entries.filter(i=>i.source==="PENSION").map(i=>i.id):[],
  retirementAdditionalExpenseIds:[],debtStress:[],housing:profile.assets.status==="KNOWN"?profile.assets.entries.filter(a=>a.housingPlan?.status==="CONFIRMED").map(a=>({assetId:a.id,
   amountScope:a.ownershipShare.status==="KNOWN"&&a.ownershipShare.value==="1"?"WHOLE_ASSET" as const:"OWNERS_SHARE" as const})):[]};
}
