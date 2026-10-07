import { digest } from "../../common/digest";
import { RetirementDecimal as D } from "../retirement/engine";
import { legalRuleDocumentSchema, type LegalRuleDocument } from "./insurance-schema";
import { ordinaryBenefitStrategy } from "./benefit-validation";
import { ordinaryBenefitStrategyV2 } from "./benefit-validation-v2";
import { stateBenefitStrategy } from "./state-validation";
import { voluntaryBenefitStrategy, voluntaryStateBenefitStrategy } from "./voluntary-validation";
import { voluntaryTopUpStrategy } from "./voluntary-top-up-validation";
import { voluntaryPrepaidStrategy } from "./voluntary-prepaid-validation";

export type LegalFixtureResult = { id: string; passed: boolean; expectedHash: string; actualHash: string };
export type LegalStrategy = { engineCode: string; branch: string; strategyCode: string; fixtureSuiteHash: string;
  validate: (document: LegalRuleDocument) => { issues: Array<{ path: string; code: string }>; cases: LegalFixtureResult[] } };
// Each server strategy carries independent statutory fixtures. Other branches
// remain unregistered until their own source/coverage checks are implemented.
export const legalStrategies: readonly LegalStrategy[] = [ordinaryBenefitStrategy, ordinaryBenefitStrategyV2, stateBenefitStrategy, voluntaryBenefitStrategy, voluntaryStateBenefitStrategy, voluntaryTopUpStrategy, voluntaryPrepaidStrategy];
export function validateLegalDocument(value: LegalRuleDocument, strategies: readonly LegalStrategy[] = legalStrategies) {
  const document = legalRuleDocumentSchema.parse(value), issues: Array<{ path: string; code: string }> = [];
  const citations = new Set<string>(), branches = new Set<string>();
  document.citations.forEach((c, i) => {
    if (citations.has(c.id)) issues.push({ path: `citations.${i}`, code: "DUPLICATE_CITATION" });
    citations.add(c.id);
    if (c.effectiveTo && c.effectiveFrom >= c.effectiveTo) issues.push({ path: `citations.${i}`, code: "INVALID_EFFECTIVE_PERIOD" });
  });
  document.tables.forEach((t, i) => {
    const path = `tables.${i}`, amount = new D(t.value);
    if (!citations.has(t.citationId)) issues.push({ path, code: "TABLE_CITATION_MISSING" });
    if (t.effectiveTo && t.effectiveFrom >= t.effectiveTo) issues.push({ path, code: "INVALID_EFFECTIVE_PERIOD" });
    if (amount.lt(0) || (["AGE_MONTHS", "WAGE_FACTOR", "INCOME_FACTOR", "REFERENCE_AMOUNT"].includes(t.kind) && amount.lte(0)) ||
      (t.kind === "AGE_MONTHS" && !amount.isInteger())) issues.push({ path, code: "INVALID_TABLE_VALUE" });
    if (document.tables.slice(0, i).some(o => o.kind === t.kind && o.key === t.key &&
      (!o.effectiveTo || t.effectiveFrom < o.effectiveTo) && (!t.effectiveTo || o.effectiveFrom < t.effectiveTo))) issues.push({ path, code: "TABLE_EFFECTIVE_OVERLAP" });
  });
  const coverage = document.coverage.map((c, i) => {
    const path = `coverage.${i}`;
    if (branches.has(c.branch)) issues.push({ path, code: "DUPLICATE_COVERAGE_BRANCH" });
    branches.add(c.branch);
    if (new Set(c.citationIds).size !== c.citationIds.length || c.citationIds.some(id => !citations.has(id))) issues.push({ path, code: "COVERAGE_CITATION_INVALID" });
    if (new Set(c.requiredTableKeys).size !== c.requiredTableKeys.length || c.requiredTableKeys.some(key => !document.tables.some(t => `${t.kind}:${t.key}` === key)))
      issues.push({ path, code: "REQUIRED_TABLE_MISSING" });
    const strategy = strategies.find(s => s.engineCode === document.engineCode && s.branch === c.branch && s.strategyCode === c.strategyCode);
    if (!strategy) { issues.push({ path, code: "STRATEGY_NOT_IMPLEMENTED" }); return { branch: c.branch, supported: false, fixtureSuiteHash: null, cases: [] }; }
    const result = strategy.validate(document);
    issues.push(...result.issues);
    if (!result.cases.length || result.cases.some(test => !test.passed || test.expectedHash !== test.actualHash)) issues.push({ path, code: "LEGAL_FIXTURES_FAILED" });
    return { branch: c.branch, supported: result.issues.length === 0 && result.cases.length > 0 && result.cases.every(t => t.passed && t.expectedHash === t.actualHash),
      fixtureSuiteHash: strategy.fixtureSuiteHash, cases: result.cases };
  });
  const report = { valid: issues.length === 0, documentHash: digest(document), engineCode: document.engineCode, issues, coverage };
  return { ...report, validationHash: digest(report) };
}
