import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as allocationRisk from "../modules/allocation-risk/service";
import { HoldingsRepository } from "../modules/holdings/repository";
import { HoldingsMonitoringService } from "../modules/holdings/service";
import { PlansService } from "../modules/plans/service";
import { RecommendationService } from "../modules/recommendation/service";
import { riskContext } from "./allocation-risk-fixtures";

const userId="00000000-0000-4000-8000-000000000001";
const planId="00000000-0000-4000-8000-000000000002";
const versionId="00000000-0000-4000-8000-000000000003";
const policyId="00000000-0000-4000-8000-000000000004";
const month="2026-01", asOfDate=`${month}-01`;
const command={planId,versionId,newContribution:"100"};
type Operation="rebalance"|"drift"|"rebalanceOrders";

afterEach(()=>vi.restoreAllMocks());

function setup(options:{category?:"GOVERNMENT_BOND"|"OPEN_BOND_FUND"|"UNKNOWN";safeCode?:string;floor?:boolean;collision?:boolean;beforeRetirement?:boolean;legacy?:boolean;allSafe?:boolean}={}) {
  const safeCode=options.safeCode??"GOV_BOND", context=riskContext(1);
  context.projection.modelVersion=options.legacy?"retirement-monthly-v3":"retirement-monthly-v5";
  if(options.beforeRetirement)context.projection.retirementMonth="2027-01";
  context.targets=[[{assetClass:"EQUITY",weightPercent:"47"},{assetClass:safeCode,weightPercent:"53"},
    ...(options.collision?[{assetClass:"BALANCED",weightPercent:"0"}]:[])]];
  if(options.allSafe)context.targets=[[{assetClass:safeCode,weightPercent:"100"}]];
  if(safeCode==="CASH")context.targets=[[{assetClass:"EQUITY",weightPercent:"47"},{assetClass:"BOND",weightPercent:"43"},{assetClass:"CASH",weightPercent:"10"}]];
  if(options.floor!==false)context.spendingFloor={safeAssets:[safeCode],minSafeFraction:safeCode==="CASH"?"0.1":"0.53"};
  vi.spyOn(allocationRisk,"contextOf").mockReturnValue(context);
  const template={id:"FLOOR",glidePath:{spendingFloorYears:options.floor===false?undefined:1,
    points:[{yearsToAnchor:0,allocations:context.targets[0]}]},rebalance:{turnoverCostPercent:"0"}};
  const saved={plan:{stale:false,currentVersionId:versionId},version:{profileRevision:1,
    preview:{calculation:{assessment:{selectedTemplateId:"FLOOR"}},replayInput:context.projection,selection:{}}},
    capture:{policy:{id:policyId,data:{schemaVersion:2,templates:[template],allocationRisk:{rebalanceBandPoints:"5"}}}}};
  vi.spyOn(PlansService.prototype,"readVersion").mockResolvedValue(saved as never);
  const riskRebalance=vi.spyOn(allocationRisk.AllocationRiskService.prototype,"rebalance").mockResolvedValue({status:"WITHIN_BAND"} as never);
  const catalog=[
    {productId:"fund",data:{category:"OPEN_BOND_FUND",assetClass:"BOND",code:"FUND",nav:"1",lotSize:1,status:"ACTIVE"},product:{name:"Bond fund",isDistributionPermitted:true},stale:false},
    {productId:"government",data:{category:"GOVERNMENT_BOND",assetClass:"BOND",code:"GOV",nav:"1",lotSize:1,status:"ACTIVE"},product:{name:"Government bond",isDistributionPermitted:true},stale:false},
    {productId:"equity",data:{category:"EQUITY_ETF",assetClass:"EQUITY",code:"EQ",nav:"1",lotSize:1,status:"ACTIVE"},product:{name:"Equity",isDistributionPermitted:true},stale:false},
  ];
  vi.spyOn(RecommendationService.prototype,"catalog").mockResolvedValue(catalog as never);
  const category=options.category??"GOVERNMENT_BOND";
  const holdings=[
    ...(!options.allSafe?[{id:"eq",revision:1,userId,productId:"equity",productCode:"EQ",productName:"Equity",assetClass:"EQUITY" as const,quantity:"500",costBasis:"1",currentPrice:"1",currency:"VND",maturedAmount:"0",lockedUntil:null}]:[]),
    {id:"bond",revision:1,userId,productId:category==="UNKNOWN"?"missing":category==="OPEN_BOND_FUND"?"fund":"government",productCode:"B",productName:"Bond",assetClass:"BOND" as const,quantity:options.allSafe?"1000":"500",costBasis:"1",currentPrice:"1",currency:"VND",maturedAmount:"0",lockedUntil:null},
  ];
  const valuation={status:"READY",products:[],holdings,summary:new HoldingsMonitoringService().calculateHoldingsValuation(holdings,asOfDate),recordedDividends:"0",notes:[],informationalOnly:true};
  const db={financialProfile:{findUnique:async()=>({revision:1})}} as unknown as PrismaClient;
  const repository=new HoldingsRepository(db);
  vi.spyOn(repository,"read").mockResolvedValue(valuation as never);
  return {repository,riskRebalance};
}

describe("spending floor product safety",()=>{
  it.each<Operation>(["rebalance","drift","rebalanceOrders"])("rejects bond funds and unknown bond data before %s can count them as safe",async operation=>{
    for(const category of ["OPEN_BOND_FUND","UNKNOWN"] as const){
      const f=setup({category});
      await expect(f.repository[operation](userId,command,asOfDate)).rejects.toMatchObject({code:"SPENDING_FLOOR_GOVERNMENT_BOND_DATA_REQUIRED"});
      expect(f.riskRebalance).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it.each<Operation>(["rebalance","drift","rebalanceOrders"])("allows verified government bonds for %s and keeps product buys in that category",async operation=>{
    const f=setup();
    const result=await f.repository[operation](userId,command,asOfDate);
    if(operation==="rebalanceOrders") {
      expect(result).toMatchObject({orders:expect.arrayContaining([expect.objectContaining({productId:"government",action:"BUY"})])});
      expect((result as {orders:Array<{productId:string}>}).orders.some(o=>o.productId==="fund")).toBe(false);
    }
    if(operation==="rebalance")expect(f.riskRebalance).toHaveBeenCalledOnce();
  });

  it("also rejects a bond fund when the configured deposit alias itself is BOND",async()=>{
    const f=setup({category:"OPEN_BOND_FUND",safeCode:"BOND"});
    await expect(f.repository.drift(userId,command,asOfDate)).rejects.toMatchObject({code:"SPENDING_FLOOR_GOVERNMENT_BOND_DATA_REQUIRED"});
  });

  it("rejects policy mappings that merge risky BALANCED with safe government bonds",async()=>{
    const f=setup({collision:true});
    await expect(f.repository.rebalance(userId,command,asOfDate)).rejects.toMatchObject({code:"SPENDING_FLOOR_PRODUCT_MAPPING_REQUIRED"});
  });

  it("protects an all-safe template while allowing its verified government bond cash purchase",async()=>{
    const unsafe=setup({allSafe:true,category:"OPEN_BOND_FUND"});
    await expect(unsafe.repository.rebalanceOrders(userId,command,asOfDate)).rejects.toMatchObject({code:"SPENDING_FLOOR_GOVERNMENT_BOND_DATA_REQUIRED"});
    vi.restoreAllMocks();
    const safe=setup({allSafe:true});
    const result=await safe.repository.rebalanceOrders(userId,command,asOfDate);
    expect(result.orders).toContainEqual(expect.objectContaining({productId:"government",action:"BUY",units:100}));
  });

  it("does not classify ordinary bond funds as safe when only CASH belongs to the floor",async()=>{
    const f=setup({category:"OPEN_BOND_FUND",safeCode:"CASH"});
    await expect(f.repository.drift(userId,command,asOfDate)).resolves.toMatchObject({persisted:false});
  });

  it.each([{floor:false},{beforeRetirement:true},{legacy:true}])("preserves bond fund behavior when the floor is inactive: %j",async options=>{
    const f=setup({category:"OPEN_BOND_FUND",...options});
    await expect(f.repository.drift(userId,command,asOfDate)).resolves.toMatchObject({persisted:false});
    const orders=await f.repository.rebalanceOrders(userId,command,asOfDate);
    expect(orders.orders).toContainEqual(expect.objectContaining({productId:"fund",action:"BUY"}));
  });
});
