import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
import { monthSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
import { profileV2Schema } from "../profiles/schema-v2";
import type { ProfileService } from "../profiles/service";
import type { PortfoliosService } from "./service";
import type { AssumptionsService } from "../assumptions/service";
import { separateCapital } from "../capital/separation";
import { assessLossConstraint } from "../capital/loss-constraint";
const D = Prisma.Decimal.clone({ precision:48 });
export const allocationWorkspaceInput = z.object({
  expectedProfileRevision:z.number().int().min(1), policyVersionId:z.string().uuid(),
  answers:z.array(z.object({questionId:z.string().min(1).max(100),choiceId:z.string().min(1).max(100)}).strict()).max(30),
  liquidityNeedMonths:z.number().int().min(0).max(1200), templateId:z.string().min(1).max(100).optional(),
  endMonth:monthSchema.optional(), retirementMonth:monthSchema.optional(),
}).strict();
const percent = z.string().regex(/^(0|[1-9]\d?|100)(\.\d{1,8})?$/).refine(v=>{try{return new D(v).lte(100);}catch{return false;}});
export const allocationRiskPatch = z.object({expectedRevision:z.number().int().min(1),policyVersionId:z.string().uuid(),
  reaction:z.enum(["SELL","HOLD","BUY_MORE"]),limit:z.discriminatedUnion("kind",[
    z.object({kind:z.literal("PERCENT"),value:percent}).strict(),z.object({kind:z.literal("AMOUNT"),value:moneySchema}).strict(),
  ]),
}).strict();
async function basis(profiles:ProfileService, portfolios:PortfoliosService, assumptions:AssumptionsService, userId:string, revision:number, policyId:string) {
  const record=await profiles.getProfile(userId);
  if(!record) throw new AppError(404,"NOT_FOUND","Chưa có hồ sơ tài chính.");
  if(record.revision!==revision) throw new AppError(409,"REVISION_CONFLICT","Hồ sơ đã thay đổi. Hãy tải lại trước khi tính hoặc lưu.");
  if(record.schemaVersion!==2) throw new AppError(409,"PROFILE_V2_REQUIRED","Hãy rà soát hồ sơ chi tiết trước khi phân bổ.");
  const profile=profileV2Schema.parse(record.data), policy=await portfolios.get(policyId,true);
  const dependency=await assumptions.get(policy.data.assumptionVersionId,true);
  if(policy.approval?.assumptionHash!==dependency.documentHash) throw new AppError(409,"POLICY_REVIEW_REQUIRED","Bộ giả định cần được rà soát.");
  return {record,profile,policy,capital:separateCapital(profile,dependency.data),dependency};
}
export async function allocationWorkspace(profiles:ProfileService, portfolios:PortfoliosService, assumptions:AssumptionsService,userId:string,raw:unknown) {
  const input=allocationWorkspaceInput.parse(raw), b=await basis(profiles,portfolios,assumptions,userId,input.expectedProfileRevision,input.policyVersionId);
  const start=b.profile.valuationDate.slice(0,7), retirementMonth=input.retirementMonth??(b.profile.personal.desiredRetirementMonth?.status==="KNOWN"?b.profile.personal.desiredRetirementMonth.value:undefined);
  const index=(m:string)=>Number(m.slice(0,4))*12+Number(m.slice(5,7));
  const months=input.endMonth?index(input.endMonth)-index(start)+1:0;
  if(input.endMonth && (months<1||months>1200)) throw new AppError(400,"INVALID_HORIZON","Tháng kết thúc phải từ tháng định giá đến tối đa 100 năm.");
  const portfolio=months?await portfolios.preview({policyVersionId:input.policyVersionId,startMonth:start,retirementMonth,horizonMonths:months,
    answers:input.answers,liquidityNeedMonths:input.liquidityNeedMonths,...(input.templateId?{templateId:input.templateId}:{})}):null;
  const holdings=portfolio?.status==="READY"?portfolio.scenarios.find(s=>s.kind==="BASE")?.rows[0]?.holdings??[]:[];
  const loss=assessLossConstraint(b.capital,b.profile,b.policy.data,holdings);
  const growth=b.capital.growthCapital, canAmount=growth!==null&&new D(growth).gte(0);
  let assigned=new D(0);
  const allocations=holdings.map((row,i)=>{
    const amount=canAmount?(i===holdings.length-1?new D(growth!).minus(assigned):new D(growth!).mul(row.startWeightPercent).div(100).toDecimalPlaces(2,Prisma.Decimal.ROUND_DOWN)):null;
    if(amount) assigned=assigned.plus(amount);
    return {assetClass:row.assetClass,weightPercent:row.startWeightPercent,amountVnd:amount?.toFixed()??null};
  });
  return {profileRevision:b.record.revision,valuationDate:b.profile.valuationDate,policyVersionId:b.policy.id,assumptionVersionId:b.dependency.id,
    capital:b.capital,portfolio,loss,allocations,assetLabels:Object.fromEntries(b.dependency.data.assetClasses.map(a=>[a.code,a.label])),
    issues:months?[]:[{path:"endMonth",code:"PLAN_END_MONTH_REQUIRED"}],informationalOnly:true as const};
}
export async function saveAllocationRisk(profiles:ProfileService,portfolios:PortfoliosService,assumptions:AssumptionsService,userId:string,raw:unknown) {
  const input=allocationRiskPatch.parse(raw), b=await basis(profiles,portfolios,assumptions,userId,input.expectedRevision,input.policyVersionId);
  const growth=b.capital.growthCapital;
  if(b.capital.status!=="READY"||growth===null||new D(growth).lte(0)) throw new AppError(422,"GROWTH_CAPITAL_REQUIRED","Cần xác định phần vốn dài hạn lớn hơn 0 trước khi xác nhận giới hạn chịu lỗ.");
  const amount=input.limit.kind==="PERCENT"?new D(growth).mul(input.limit.value).div(100).toDecimalPlaces(2,Prisma.Decimal.ROUND_DOWN):new D(input.limit.value);
  if(amount.gt(growth)) throw new AppError(422,"LOSS_EXCEEDS_GROWTH","Mức chịu lỗ không được vượt phần vốn dài hạn.");
  const ratio=input.limit.kind==="PERCENT"?input.limit.value:amount.div(growth).mul(100).toDecimalPlaces(8,Prisma.Decimal.ROUND_DOWN).toFixed();
  return profiles.patchProfile(userId,input.expectedRevision,{schemaVersion:2,lossTolerance:{reaction:{status:"KNOWN",value:input.reaction},
    percent:{status:"KNOWN",value:ratio},amountVnd:{status:"KNOWN",value:amount.toFixed()}}});
}
