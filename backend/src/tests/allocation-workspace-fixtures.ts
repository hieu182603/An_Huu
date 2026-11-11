import { discoveryFixture } from "./discovery-fixtures";
import { portfolioAssumptionsFixture, glidePortfolioFixture } from "./portfolio-fixtures";
import { fixtureAsset, fixtureProfile,known,empty } from "./profile-v2-fixtures";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService } from "../modules/portfolios/service";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { publishedPolicies } from "../modules/portfolios/service";
export async function allocationFixture(options:{multiple?:boolean;emptyPolicy?:boolean;unknownCapital?:boolean;zero?:boolean;negative?:boolean}={}) {
  const f=await discoveryFixture({products:3,articles:2}), assumptions=new AssumptionsService(f.db), portfolios=new PortfoliosService(f.db);
  const profile=fixtureProfile({incomeStability:known("STABLE"),goals:empty(),debts:empty(),
    assets:options.unknownCapital?{status:"UNKNOWN"}: {status:"KNOWN",entries:[fixtureAsset({value:known(options.zero?"0":options.negative?"100":"1000000000")})]},
    lossTolerance:{percent:known("30"),amountVnd:known("300000000"),reaction:known("HOLD")}});
  profile.personal.desiredRetirementMonth=known("2027-01");
  await f.profiles.patchProfile("test-user",1,{...profile});
  const a=await assumptions.create("test-admin",portfolioAssumptionsFixture());
  const impact=await assumptions.previewImpact("test-admin",a.id,{expectedRevision:1});
  await assumptions.approve("test-admin",a.id,{expectedRevision:1,impactToken:impact.impactToken,reviewNote:"Synthetic allocation review"});
  await assumptions.publish("test-admin",a.id,{expectedRevision:2,confirm:true});
  const policyData=glidePortfolioFixture(a.id);
  if(options.multiple){
    policyData.rules.forEach(rule=>{rule.dimensions.LOSS_TOLERANCE={min:0,max:10};});
    policyData.templates.find(t=>t.id==="GROWTH")!.glidePath.points.find(point=>point.yearsToAnchor===0)!.allocations=[{assetClass:"BOND",weightPercent:"70"},{assetClass:"STOCK",weightPercent:"30"}];
  }
  const p=await portfolios.create("test-admin",{...policyData,lossStress:{equityAssetClass:"STOCK",depositAssetClass:"BOND",shocks:[{assetClass:"STOCK",percent:"-20"},{assetClass:"BOND",percent:"-2"}],evidence:"Synthetic stress, no production publication"}});
  await portfolios.approve("test-admin",p.id,{expectedRevision:1,confirm:true,reviewNote:"Synthetic allocation review"});
  if(!options.emptyPolicy)await portfolios.publish("test-admin",p.id,{expectedRevision:2,confirm:true});
  publishedPolicies.clear();
  const command={expectedProfileRevision:2,policyVersionId:p.id,answers:p.data.questions.map(q=>({questionId:q.id,choiceId:"LOW"})),liquidityNeedMonths:12,endMonth:"2027-12"};
  return {...f,assumptions,portfolios,policy:p,command,services:{...f.services,assumptions,portfolios,allocationRisk:new AllocationRiskService(f.db)}};
}
