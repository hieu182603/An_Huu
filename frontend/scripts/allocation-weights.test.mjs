import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source=readFileSync(new URL("../src/utils/allocationWeights.ts",import.meta.url),"utf8").replace('import { Decimal as D } from "./decimal";',readFileSync(new URL("../src/utils/decimal.ts",import.meta.url),"utf8").replace("export class Decimal","class Decimal")+'\nconst D=Decimal;');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
const {adjustAllocation,initialAllocationWeights}=await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const policy={bounds:[{assetClass:"BOND",minPercent:"10",maxPercent:"100"},{assetClass:"EQUITY",minPercent:"0",maxPercent:"70"},{assetClass:"GOLD",minPercent:"5",maxPercent:"30"}]};
test("balances exact percentages across repeated bounded edits and zero shares",()=>{
 let weights=[{assetClass:"BOND",weightPercent:"95"},{assetClass:"EQUITY",weightPercent:"0"},{assetClass:"GOLD",weightPercent:"5"}];
 for(const [code,value] of [["EQUITY","99"],["GOLD","30"],["BOND","100"],["EQUITY","33.33333333"],["GOLD","12.12345678"]]){
  weights=adjustAllocation(weights,policy,code,value);
  const units=v=>BigInt(v.replace(".","").padEnd(v.includes(".")?v.split(".")[0].length+8:v.length+8,"0"));
  assert.equal(weights.reduce((s,r)=>s+units(r.weightPercent),0n),10000000000n);
  for(const row of weights){const bound=policy.bounds.find(b=>b.assetClass===row.assetClass);assert.ok(Number(row.weightPercent)>=Number(bound.minPercent));assert.ok(Number(row.weightPercent)<=Number(bound.maxPercent));}
 }
});
test("invalid numeric text leaves the verified edit state unchanged",()=>{
 const rows=[{assetClass:"BOND",weightPercent:"100"}];
 for(const value of ["","-1","NaN","1e2","1.123456789"])assert.equal(adjustAllocation(rows,policy,"BOND",value),rows);
});
test("initial published precision is bounded and balanced to eight decimal places",()=>{
 const rows=initialAllocationWeights([{assetClass:"BOND",weightPercent:"33.33333333333333333333333"},{assetClass:"EQUITY",weightPercent:"33.33333333333333333333333"},{assetClass:"GOLD",weightPercent:"33.33333333333333333333334"}],policy);
 assert.equal(rows.reduce((sum,row)=>sum+BigInt(Math.round(Number(row.weightPercent)*1e8)),0n),10000000000n);
 for(const row of rows){assert.match(row.weightPercent,/^\d+(\.\d{1,8})?$/);const bound=policy.bounds.find(b=>b.assetClass===row.assetClass);assert.ok(Number(row.weightPercent)>=Number(bound.minPercent)&&Number(row.weightPercent)<=Number(bound.maxPercent));}
});
