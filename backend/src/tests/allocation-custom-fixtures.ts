import { allocationFixture } from "./allocation-workspace-fixtures";
import { MarketDataService } from "../modules/allocation-risk/market-service";
import { marketFixture } from "./allocation-risk-fixtures";
import { RetirementService } from "../modules/retirement/service";
import { PlansService } from "../modules/plans/service";
import { digest } from "../common/digest";
export async function customFixture(options:{ui?:boolean;noMarket?:boolean}={}) {
  const f=await allocationFixture();
  if(f.policy.data.schemaVersion!==2)throw new Error("Custom fixture requires glide policy");
  const policy=await f.portfolios.create("test-admin",{...f.policy.data,schemaVersion:2,
    customization:{evidence:"Synthetic test-only custom policy",path:"FOLLOW_TEMPLATE_SHIFTS",capitalBasis:"PROTECTED_CAPITAL_V1",
      bounds:[{assetClass:"BOND",minPercent:"0",maxPercent:"100"},{assetClass:"STOCK",minPercent:"0",maxPercent:"80"}]},
    allocationRisk:{evidence:"Synthetic simulation policy",blockMonths:12,cvarAlpha:"0.95",essentialThreshold:"0.9",allGoalsThreshold:"0.8",equityShiftPoints:"10"}});
  await f.portfolios.approve("test-admin",policy.id,{expectedRevision:1,confirm:true,reviewNote:"Synthetic custom allocation review"});
  await f.portfolios.publish("test-admin",policy.id,{expectedRevision:2,confirm:true});
  const data=marketFixture();
  data.assets=data.assets.filter(a=>["EQUITY","GOV_BOND"].includes(a.assetClass)).map(a=>({...a,assetClass:a.assetClass==="EQUITY"?"STOCK":"BOND"}));
  data.rows=data.rows.map(r=>({...r,returns:{STOCK:r.returns.EQUITY,BOND:r.returns.GOV_BOND}}));
  const markets=new MarketDataService(f.db),market=await markets.create("test-admin",data);
  await markets.approve("test-admin",market.id,{expectedRevision:1,confirm:true,reviewNote:"Synthetic market review"});
  if(!options.noMarket)await markets.publish("test-admin",market.id,{expectedRevision:2,confirm:true});
  let revision=2;
  if(options.ui){
    await f.profiles.saveRetirementGoal("test-user",{expectedRevision:2,birthMonth:"1990-04",retirementMonth:"2027-01",goal:{endMonth:"2027-12",monthlyExpenseToday:"10000000",lifestylePriority:null}});
    await f.profiles.patchProfile("test-user",3,{schemaVersion:2,pension:{status:"NOT_APPLICABLE",reason:"Synthetic no pension"},personal:{pensionStartMonth:{status:"NOT_APPLICABLE",reason:"Synthetic no pension"}}});
    revision=4;
    for(const [i,product] of f.products.entries()){
      const document={code:`TEST-${i}`,assetClass:"BOND",category:"OPEN_BOND_FUND",nav:"1000",annualExpenseRatioPercent:i?"1":"0.5",liquidityDays:i?1:5,lotSize:1,minimumInvestmentVnd:"1000",riskScore:1,isDistributionPermitted:true,status:"ACTIVE",sourceKind:"TEST_FIXTURE",sourceReference:"Synthetic fixture only",currency:"VND",priceAsOf:"2026-10-01",validUntil:"2099-12-31",distributionEvidence:"Synthetic test distribution"};
      await f.db.investmentProductData.create({data:{productId:product.id,revision:1,document,documentHash:digest(document)}});
    }
  }
  return {...f,policy,command:{...f.command,expectedProfileRevision:revision,policyVersionId:policy.id,templateId:"CAUTIOUS"},market,
    services:{...f.services,retirement:new RetirementService(f.db),plans:new PlansService(f.db)}};
}
