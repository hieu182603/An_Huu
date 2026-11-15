import {z} from "zod";
import {monthSchema,dateSchema} from "../../common/calendar";
import {moneySchema} from "../../common/http";
import {Prisma} from "@prisma/client";
import type {ProfileV2} from "./schema-v2";
export const retirementGoalValues=z.object({endMonth:monthSchema,monthlyExpenseToday:moneySchema,monthlyContribution:moneySchema.optional(),lifestylePriority:z.enum(["BALANCED","HEALTH","HOUSING","TRAVEL"]).nullable()}).strict();
export const retirementGoalPatch=z.object({expectedRevision:z.number().int().min(1),birthMonth:monthSchema,birthDate:dateSchema.optional(),retirementMonth:monthSchema,goal:retirementGoalValues}).strict().superRefine((v,ctx)=>{
 if(new Prisma.Decimal(v.goal.monthlyExpenseToday).lte(0))ctx.addIssue({code:"custom",path:["goal","monthlyExpenseToday"],message:"Chi tiêu nghỉ hưu mỗi tháng phải lớn hơn 0."});
 if(v.birthDate&&v.birthDate.slice(0,7)!==v.birthMonth)ctx.addIssue({code:"custom",path:["birthDate"],message:"Ngày sinh phải cùng tháng sinh."});
 if(v.retirementMonth<=v.birthMonth)ctx.addIssue({code:"custom",path:["retirementMonth"],message:"Tháng nghỉ hưu phải sau tháng sinh."});
 if(v.goal.endMonth<v.retirementMonth)ctx.addIssue({code:"custom",path:["goal","endMonth"],message:"Tháng kết thúc phải từ tháng nghỉ hưu trở đi."});
 const months=(Number(v.retirementMonth.slice(0,4))-Number(v.birthMonth.slice(0,4)))*12+Number(v.retirementMonth.slice(5,7))-Number(v.birthMonth.slice(5,7));
 if(months<18*12||months>100*12)ctx.addIssue({code:"custom",path:["retirementMonth"],message:"Mốc nghỉ hưu cần trong khoảng 18 đến 100 tuổi."});
});
export function goalChanges(profile:ProfileV2,input:z.infer<typeof retirementGoalPatch>){
 const personal={...profile.personal,birthMonth:{status:"KNOWN" as const,value:input.birthMonth},desiredRetirementMonth:{status:"KNOWN" as const,value:input.retirementMonth}};
 if(input.birthDate)personal.birthDate=input.birthDate;
 else if(personal.birthDate?.slice(0,7)!==input.birthMonth)delete personal.birthDate;
 return {personal,retirementGoal:{...profile.retirementGoal,...input.goal}};
}
