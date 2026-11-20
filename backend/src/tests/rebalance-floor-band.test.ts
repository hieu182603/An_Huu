import { describe, expect, it } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { spendingFloorConstraint } from "../modules/portfolios/engine";
import { proposeRebalance, rebalanceInputSchema } from "../modules/allocation-risk/rebalance";
const input = (month="2027-01", contribution="0") => rebalanceInputSchema.parse({
  policyVersionId:"00000000-0000-4000-8000-000000000001",templateId:"TEST",month,retirementMonth:"2027-01",
  holdings:[{assetClass:"CASH",value:"500",maturedAmount:"0"},{assetClass:"EQUITY",value:"500",maturedAmount:"0"}],newContribution:contribution,
});
const targets=[{assetClass:"CASH",weightPercent:"53"},{assetClass:"EQUITY",weightPercent:"47"}];
const floor={safeAssets:["CASH"],minSafeFraction:"0.53"};
describe("safe spending floor versus tolerance band",()=>{
  it("retains explicit safety metadata even for a template containing only safe policy assets",()=>{
    expect(spendingFloorConstraint(new Map([["GOV_BOND",new D(1)]]),{essentialSpendingPV:"530",growthCapital:"1000",safeAssets:["GOV_BOND"]}))
      .toEqual({safeAssets:["GOV_BOND"],minSafeFraction:"0.53"});
  });
  it("forces a three-point shortfall from retirement while preserving no-floor and pre-retirement behavior",()=>{
    expect(proposeRebalance(input(),targets,"5","0").status).toBe("WITHIN_BAND");
    expect(proposeRebalance(input("2026-12"),targets,"5","0",undefined,floor).status).toBe("WITHIN_BAND");
    expect(proposeRebalance(input("2026-12"),[{assetClass:"CASH",weightPercent:"50"},{assetClass:"EQUITY",weightPercent:"50"}],"5","0",undefined,floor).status).toBe("WITHIN_BAND");
    const result=proposeRebalance(input(),targets,"5","0",undefined,floor);
    expect(result).toMatchObject({status:"PROPOSED",trigger:"SPENDING_FLOOR_BREACHED",cost:"0",netValue:"1000"});
    if(result.status!=="PROPOSED")throw Error("Expected floor proposal");
    expect(result.trades).toContainEqual({assetClass:"CASH",oldValue:"500",maturedAmount:"0",cashAllocated:"0",buy:"30",sell:"0",newValue:"530"});
    expect(result.trades).toContainEqual({assetClass:"EQUITY",oldValue:"500",maturedAmount:"0",cashAllocated:"0",buy:"0",sell:"30",newValue:"470"});
  });
  it("uses free cash to satisfy the minimum without unnecessary trading",()=>{
    const result=proposeRebalance(input("2027-01","100"),targets,"5","0.2",undefined,floor);
    expect(result).toMatchObject({status:"PROPOSED",trigger:"BELOW_BAND",cost:"0",netValue:"1100"});
    if(result.status!=="PROPOSED")throw Error("Expected cash proposal");
    expect(result.trades.every(t=>t.buy==="0"&&t.sell==="0")).toBe(true);
    expect(Number(result.newWeights.find(t=>t.assetClass==="CASH")!.weightPercent)).toBeGreaterThanOrEqual(53);
  });
});
