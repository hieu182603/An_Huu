import type { CustomizationPolicy, TemplateAllocation } from "../services/portfolios";
import { Decimal as D } from "./decimal";

// Redistribute in integer 1e-8 percentage points, so display edits always sum
// to exactly 100 while respecting each published lower and upper bound.
export function adjustAllocation(weights: TemplateAllocation[], policy: CustomizationPolicy, code: string, value: string): TemplateAllocation[] {
  if (!/^(\d+)(\.\d{0,8})?$/.test(value)) return weights;
  const scale = 100000000, units = (v: string) => BigInt(new D(v).mul(scale).toString().split(".")[0]);
  const rows = policy.bounds.map(b => {const min=units(b.minPercent),max=units(b.maxPercent),value=units(weights.find(w=>w.assetClass===b.assetClass)?.weightPercent??"0");return {assetClass:b.assetClass,min,max,value:value<min?min:value>max?max:value};});
  const edited = rows.find(r => r.assetClass === code);
  if (!edited) return weights;
  const others = rows.filter(r => r !== edited), total = BigInt(100 * scale);
  const lower = total - others.reduce((s,r)=>s+r.max,0n), upper = total - others.reduce((s,r)=>s+r.min,0n);
  const min = edited.min > lower ? edited.min : lower, max = edited.max < upper ? edited.max : upper;
  const desired = units(value); edited.value = desired < min ? min : desired > max ? max : desired;
  let delta = total - rows.reduce((s,r)=>s+r.value,0n);
  while (delta !== 0n) {
    const eligible = others.filter(r=>delta>0n?r.value<r.max:r.value>r.min);
    if (!eligible.length) return weights;
    const positive=delta>0n, magnitude=positive?delta:-delta;
    const denominator=eligible.reduce((s,r)=>s+r.value,0n);
    let moved=0n;
    for (const row of eligible) {
      const share=denominator>0n?magnitude*row.value/denominator:magnitude/BigInt(eligible.length);
      const capacity=positive?row.max-row.value:row.value-row.min;
      const step=(share>0n?share:1n)<capacity?(share>0n?share:1n):capacity;
      const remaining=magnitude-moved, amount=step<remaining?step:remaining;
      row.value+=positive?amount:-amount; moved+=amount;
    }
    delta+=positive?-moved:moved;
  }
  return rows.map(r=>({assetClass:r.assetClass,weightPercent:new D(`${r.value/BigInt(scale)}.${(r.value%BigInt(scale)).toString().padStart(8,"0")}`).toString()}));
}
export function initialAllocationWeights(weights:TemplateAllocation[],policy:CustomizationPolicy):TemplateAllocation[]{
 const first=policy.bounds[0];if(!first)return [];
 const value=new D(weights.find(r=>r.assetClass===first.assetClass)?.weightPercent??"0").toString();
 const [integer,fraction]=value.split(".");
 return adjustAllocation(weights,policy,first.assetClass,fraction?`${integer}.${fraction.slice(0,8)}`:integer);
}
