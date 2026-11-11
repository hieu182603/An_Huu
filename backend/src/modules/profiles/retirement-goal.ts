import {z} from "zod";
import {monthSchema} from "../../common/calendar";
import {moneySchema} from "../../common/http";
import type {ProfileV2} from "./schema-v2";
export const retirementGoalValues=z.object({endMonth:monthSchema,monthlyExpenseToday:moneySchema,lifestylePriority:z.enum(["BALANCED","HEALTH","HOUSING","TRAVEL"]).nullable()}).strict();
export const retirementGoalPatch=z.object({expectedRevision:z.number().int().min(1),birthMonth:monthSchema,retirementMonth:monthSchema,goal:retirementGoalValues}).strict().superRefine((v,ctx)=>{
 if(v.retirementMonth<=v.birthMonth)ctx.addIssue({code:"custom",path:["retirementMonth"],message:"Tháng nghỉ hưu phải sau tháng sinh."});
 if(v.goal.endMonth<v.retirementMonth)ctx.addIssue({code:"custom",path:["goal","endMonth"],message:"Tháng kết thúc phải từ tháng nghỉ hưu trở đi."});
 const months=(Number(v.retirementMonth.slice(0,4))-Number(v.birthMonth.slice(0,4)))*12+Number(v.retirementMonth.slice(5,7))-Number(v.birthMonth.slice(5,7));
 if(months<18*12||months>100*12)ctx.addIssue({code:"custom",path:["retirementMonth"],message:"Mốc nghỉ hưu cần trong khoảng 18 đến 100 tuổi."});
});
export function goalChanges(profile:ProfileV2,input:z.infer<typeof retirementGoalPatch>){
 return {personal:{...profile.personal,birthMonth:{status:"KNOWN" as const,value:input.birthMonth},desiredRetirementMonth:{status:"KNOWN" as const,value:input.retirementMonth}},retirementGoal:input.goal};
}
