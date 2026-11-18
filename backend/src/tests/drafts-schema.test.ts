// Read-only check of the allocation drafts in backend/data/drafts: parses the files with the
// production schemas in memory. Never writes files, never touches a database, publishes nothing.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { portfolioDocumentV2Schema } from "../modules/portfolios/schema";
import { customizationPolicySchema } from "../modules/portfolios/custom";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import { marketDocumentSchema } from "../modules/allocation-risk/market-schema";
import { validatePortfolioPolicy, glideTargets } from "../modules/portfolios/engine";
import { assumptionDocumentSchema } from "../modules/assumptions/schema";

const root = join(__dirname, "..", "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const draft = read("data/drafts/policy-params-draft.json");
const codes: string[] = draft._meta.assetClasses;

describe("policy-params-draft.json", () => {
  it("each block passes its production schema", () => {
    expect(() => riskPolicySchema.parse(draft.allocationRisk)).not.toThrow();
    expect(() => customizationPolicySchema.parse(draft.customization)).not.toThrow();
    expect(() => portfolioDocumentV2Schema.shape.lossStress.parse(draft.lossStress)).not.toThrow();
    expect(() => portfolioDocumentV2Schema.shape.templates.parse(draft.templates)).not.toThrow();
  });

  it("every glide point sums to 100, uses all asset classes and stays inside customization bounds", () => {
    const bounds = new Map<string, { minPercent: string; maxPercent: string }>(draft.customization.bounds.map((b: any) => [b.assetClass, b]));
    expect([...bounds.keys()].sort()).toEqual([...codes].sort());
    expect(draft.lossStress.shocks.map((s: any) => s.assetClass).sort()).toEqual([...codes].sort());
    for (const t of draft.templates) {
      expect(t.glidePath.points.some((p: any) => p.yearsToAnchor === 0)).toBe(true);
      for (const p of t.glidePath.points) {
        expect(p.allocations.reduce((s: number, a: any) => s + Number(a.weightPercent), 0)).toBe(100);
        expect(p.allocations.map((a: any) => a.assetClass).sort()).toEqual([...codes].sort());
      }
      // Interpolated years too, since customization checks every month's target.
      const template = portfolioDocumentV2Schema.shape.templates.parse([t])[0];
      for (let years = 0; years <= 40; years++) for (const [code, w] of glideTargets(template, years, codes)) {
        const b = bounds.get(code)!, pct = Number(w.mul(100));
        expect(pct).toBeGreaterThanOrEqual(Number(b.minPercent));
        expect(pct).toBeLessThanOrEqual(Number(b.maxPercent));
      }
    }
  });

  it("merged into the v4 policy draft in memory, the whole policy validates against assumptions v3", () => {
    const v4 = read("seed-data/allocation-2026-10/draft-policy-v4.json");
    const assumptions = assumptionDocumentSchema.parse(read("seed-data/allocation-2026-10/draft-assumptions-v3.json"));
    const base = v4.rules.find((r: any) => r.templateId === "TPL_BASE_GLIDE");
    const rules = [
      ...v4.rules.filter((r: any) => r.templateId !== "TPL_BASE_GLIDE"),
      { ...base, riskBandIds: draft._meta.ruleMapping.TPL_BASE_GLIDE },
      { ...base, id: "RULE_GROWTH_GLIDE", templateId: "TPL_GROWTH_GLIDE", riskBandIds: draft._meta.ruleMapping.TPL_GROWTH_GLIDE,
        explanation: "Bản nháp: tiến một bậc thời hạn so với danh mục nền, cổ phiếu tối đa 60%." },
    ];
    const merged = portfolioDocumentV2Schema.parse({ ...v4, templates: draft.templates, rules,
      lossStress: draft.lossStress, allocationRisk: draft.allocationRisk, customization: draft.customization });
    const result = validatePortfolioPolicy(merged, assumptions);
    expect(result.issues).toEqual([]);
  });
});

const marketPath = "data/drafts/market-data-draft.json";
describe.skipIf(!existsSync(join(root, marketPath)))("market-data-draft.json", () => {
  it("passes marketDocumentSchema and covers every policy asset class", () => {
    const market = marketDocumentSchema.parse(read(marketPath));
    expect(market.assets.map(a => a.assetClass).sort()).toEqual([...codes].sort());
  });
});
