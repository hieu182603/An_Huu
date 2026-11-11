import{retirementPreviewSchema}from"../modules/retirement/schema";
import {allocationFixture} from "./allocation-workspace-fixtures";
import{RetirementService}from"../modules/retirement/service";
import{PlansService}from"../modules/plans/service";
import{ActualsService}from"../modules/actuals/service";
import{AiService}from"../modules/ai/service";
import{randomUUID}from"node:crypto";
export async function remainingFixture(options:{savedPlan?:boolean;notifications?:number;empty?:boolean}={}){
 const f=await allocationFixture(),retirement=new RetirementService(f.db),plans=new PlansService(f.db);
 await f.profiles.saveRetirementGoal("test-user",{expectedRevision:2,birthMonth:"1990-04",retirementMonth:"2027-01",goal:{endMonth:"2028-12",monthlyExpenseToday:"10000000",lifestylePriority:null}});
 await f.profiles.patchProfile("test-user",3,{schemaVersion:2,pension:{status:"NOT_APPLICABLE",reason:"Synthetic fixture: no pension"},personal:{pensionStartMonth:{status:"NOT_APPLICABLE",reason:"Synthetic fixture: no pension"}}});
 const input=retirementPreviewSchema.parse({expectedProfileRevision:4,policyVersionId:f.policy.id,answers:f.command.answers,liquidityNeedMonths:12,endMonth:"2028-12",monthlyExpenseToday:"10000000",monthlyContribution:"1000000",monthlyReserve:"0",scenario:"BASE" as const,contributionTiming:"END_OF_MONTH" as const,surplusPolicy:"EXPLICIT_DEPOSITS_ONLY" as const,terminalBalance:"0",retirementIncomeIds:[],retirementAdditionalExpenseIds:[],debtStress:[],housing:[]});
 const preview=await retirement.preview("test-user",input);
 if(preview.status!=="READY")throw new Error("Remaining fixture preview not READY: "+JSON.stringify(preview.issues));
 let planId:string|undefined,versionId:string|undefined;
 if(options.savedPlan){
  const created=await plans.createVersion("test-user",null,{expectedRevision:0,expectedInputHash:preview.inputHash,preview:input},randomUUID());
  planId=created.planId;versionId=created.saved.id;
  await plans.apply("test-user",planId,{versionId,expectedRevision:created.revision,expectedProfileRevision:4,confirm:true},randomUUID());
 }
 for(let i=0;i<(options.notifications??35);i++)await f.db.notification.create({data:{userId:"test-user",title:`Thông báo kiểm thử ${i+1}`,message:i%2?"Phản hồi hỗ trợ đã sẵn sàng":"Kiểm tra bảo mật tài khoản",path:i%2?"/user/support":"/user/account?tab=security",readAt:i%3===0?new Date():null}});
 await f.db.notification.create({data:{userId:"other-user",title:"Private other user notification",message:"Hidden",path:"/user/support",readAt:null}});
 return {...f,planId,versionId,input,preview,retirement,plans,services:{...f.services,retirement,plans,actuals:new ActualsService(f.db),ai:new AiService(f.db)}};
}
