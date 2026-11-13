import { Prisma } from "@prisma/client";
import type { ProductMasterData } from "./types";
import { filterEligibleProducts, type EligibilityContext } from "./eligibility";
const D=Prisma.Decimal.clone({precision:48});
type Allocation={assetClass:string;weightPercent:string;amountVnd:string|null};
const aliases:Record<string,string>={GOV_BOND:"BOND",STOCK:"EQUITY"};
/** Comparison packages only. No recommendation approval, orders or holdings writes. */
export function buildAllocationPackages(allocations:Allocation[],catalog:ProductMasterData[],context:Omit<EligibilityContext,"availableCapitalVnd"|"targetAssetClass">){
 const lines=allocations.filter(r=>new D(r.weightPercent).gt(0)).map(row=>{
  const mapped=aliases[row.assetClass]??row.assetClass;
  const pool=catalog.filter(p=>p.assetClass===mapped);
  const available=row.amountVnd;
  const fits=available===null?[]:filterEligibleProducts(pool,{...context,targetAssetClass:mapped,availableCapitalVnd:available}).eligible
    .filter(p=>new D(p.nav).mul(p.lotSize).lte(available));
  const a=[...fits].sort((x,y)=>new D(x.annualExpenseRatioPercent).cmp(y.annualExpenseRatioPercent)||x.liquidityDays-y.liquidityDays||x.id.localeCompare(y.id))[0]??null;
  const b=[...fits].filter(p=>p.id!==a?.id).sort((x,y)=>x.liquidityDays-y.liquidityDays||new D(x.annualExpenseRatioPercent).cmp(y.annualExpenseRatioPercent)||x.id.localeCompare(y.id))[0]??a;
  const view=(p:ProductMasterData|null)=>p?{id:p.id,name:p.name,partnerId:p.partnerId,partnerName:p.partnerName,category:p.category,
    annualFeePercent:p.annualExpenseRatioPercent,liquidityDays:p.liquidityDays,minimumAmount:p.minimumInvestmentVnd}:null;
  return {...row,a:view(a),b:view(b),status:available===null?"CAPITAL_REQUIRED":!pool.length?"NO_PRODUCT":!fits.length?"NO_ELIGIBLE_PRODUCT":"AVAILABLE"};
 });
 const summary=(key:"a"|"b")=>{
  const picks=lines.flatMap(row=>row[key]&&row.amountVnd!==null?[{row,p:row[key]!}]:[]);
  return {ids:[...new Set(picks.map(x=>x.p.id))],annualFeeVnd:picks.reduce((s,x)=>s.plus(new D(x.row.amountVnd!).mul(x.p.annualFeePercent).div(100)),new D(0)).toFixed(),
    coveredPercent:picks.reduce((s,x)=>s.plus(x.row.weightPercent),new D(0)).toFixed(),providers:new Set(picks.map(x=>x.p.partnerId)).size};
 };
 return {status:lines.some(row=>row.a)?"AVAILABLE":"UNCONFIGURED",informationalOnly:true,persisted:false,lines,A:summary("a"),B:summary("b"),same:lines.every(r=>r.a?.id===r.b?.id)};
}
