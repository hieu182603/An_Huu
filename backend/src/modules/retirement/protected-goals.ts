import {Prisma} from "@prisma/client";
import {addMonths} from "../../common/calendar";
import {normalizedAnnualReturn} from "../assumptions/series";
import type {AssumptionDocument} from "../assumptions/schema";
import type {ProfileV2} from "../profiles/schema-v2";
import type {CapitalSeparation} from "../capital/separation";
import type {Protection} from "./protected-capital";
const D=Prisma.Decimal.clone({precision:48});
/** Goal inflation and reserved deposit accrual use the same effective annual
 * convention and CASH horizon as canonical capital separation. Long-term goals
 * are obligations without an opening reserve. No missing price is inferred. */
export function protectedGoals(profile:ProfileV2,capital:CapitalSeparation,assumptions:AssumptionDocument,endMonth:string){
 const issues:Array<{path:string;code:string}>=[],goals:Protection["goals"]=[];
 const entries=profile.goals?.status==="KNOWN"?profile.goals.entries:[];
 const first=profile.valuationDate.slice(0,7);
 for(const entry of entries){
  const separated=capital.goals.find(g=>g.id===entry.id),path=`goals.${entry.id}`;
  if(!separated||entry.amountToday.status!=="KNOWN"||entry.priority.status!=="KNOWN"||entry.dueMonth.status!=="KNOWN"||entry.inflation?.status==="UNKNOWN"){
   issues.push({path,code:"CLASSIFIED_GOAL_CASHFLOWS_REQUIRED"});continue;
  }
  if(entry.dueMonth.value>endMonth){issues.push({path,code:"GOAL_HORIZON_OR_AMOUNT_REQUIRED"});continue;}
  const reserved=separated.treatment==="RESERVED",months=separated.monthsUntilDue;
  const horizons=assumptions.assetClasses.filter(a=>a.code==="CASH").flatMap(a=>a.horizons).filter(h=>h.minMonths<=months&&months<=h.maxMonths);
  if(reserved&&months>0&&horizons.length!==1){issues.push({path,code:"DEPOSIT_HORIZON_NOT_COVERED"});continue;}
  let price=new D(1),valid=true;
  const factors:string[]=[];
  for(let i=0;i<months;){
   const month=addMonths(first,i),year=Number(month.slice(0,4)),count=Math.min(months-i,13-Number(month.slice(5,7)));
   const cpis=assumptions.inflation.filter(r=>r.year===year),cpi=cpis[0];
   if(!cpi||cpis.length!==1){issues.push({path,code:"GOAL_ASSUMPTIONS_NOT_COVERED"});valid=false;break;}
   const inflation=entry.inflation?.status==="KNOWN"?entry.inflation.value:cpi.percent;
   price=price.mul(new D(inflation).div(100).plus(1).pow(new D(count).div(12)));
   if(reserved){
    const returns=assumptions.returns.filter(r=>r.year===year&&r.assetClass==="CASH"&&r.horizonId===horizons[0].id);
    const net=returns.length===1?normalizedAnnualReturn(returns[0],cpi.percent):null;
    if(net===null||net.lte(-1)){issues.push({path,code:"DEPOSIT_NET_RETURN_REQUIRED"});valid=false;break;}
    factors.push(...Array.from({length:count},()=>net.plus(1).pow(new D(1).div(12)).toFixed()));
   }
   i+=count;
  }
  if(valid)goals.push({id:entry.id,month:entry.dueMonth.value,amount:separated.futureAmount??new D(entry.amountToday.value).mul(price).toFixed(),
   openingReserve:reserved?separated.presentValue!:"0",essential:entry.priority.value==="ESSENTIAL",
   ...(reserved&&months>0?{depositAssetClass:"CASH",depositFactors:factors}:{})});
 }
 return {goals,issues};
}
