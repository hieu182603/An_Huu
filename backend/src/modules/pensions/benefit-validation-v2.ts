import { addMonths } from "../../common/calendar";
import { digest } from "../../common/digest";
import { ordinaryBenefitStrategy } from "./benefit-validation";
import { BENEFIT_ENGINE, ORDINARY_BRANCH, ORDINARY_STRATEGY } from "./benefit-assessment";
import { BENEFIT_ENGINE_V2, ORDINARY_CITATIONS_V2, ORDINARY_STRATEGY_V2, retirementLumpSum } from "./benefit-assessment-v2";
import type { LegalStrategy } from "./legal-validation";

const grants = [
  { id: "BH-GRANT-ZERO", before: 420, after: 0, expected: "0" },
  { id: "BH-GRANT-BEFORE-1", before: 421, after: 0, expected: "2500000" },
  { id: "BH-GRANT-BEFORE-7", before: 427, after: 0, expected: "5000000" },
  { id: "BH-GRANT-AFTER-1", before: 420, after: 1, expected: "10000000" },
  { id: "BH-GRANT-AFTER-7", before: 420, after: 7, expected: "20000000" },
  { id: "BH-GRANT-SPLIT", before: 432, after: 12, expected: "25000000" },
  { id: "BH-GRANT-THRESHOLD-AFTER-AGE", before: 408, after: 24, expected: "20000000" },
];
export const ordinaryBenefitStrategyV2: LegalStrategy = {
  engineCode: BENEFIT_ENGINE_V2, branch: ORDINARY_BRANCH, strategyCode: ORDINARY_STRATEGY_V2,
  fixtureSuiteHash: digest({ version: "BH1-GRANT-2", base: ordinaryBenefitStrategy.fixtureSuiteHash, grants }),
  validate(document) {
    const base = ordinaryBenefitStrategy.validate({ ...document, engineCode: BENEFIT_ENGINE,
      coverage: document.coverage.map(c => c.branch === ORDINARY_BRANCH ? { ...c, strategyCode: ORDINARY_STRATEGY } : c) });
    const branch = document.coverage.find(c => c.branch === ORDINARY_BRANCH);
    for (const id of ORDINARY_CITATIONS_V2) if (!branch?.citationIds.includes(id) || !document.citations.some(c => c.id === id))
      base.issues.push({ path: "citations", code: "STATUTORY_CITATION_REQUIRED:" + id });
    for (const g of grants) {
      const months = Array.from({ length: g.before + g.after }, (_, i) => addMonths("2026-06", i - g.before + 1));
      const actual = retirementLumpSum("MALE", months, "2026-06", "10000000").total;
      base.cases.push({ id: g.id, passed: actual === g.expected, expectedHash: digest(g.expected), actualHash: digest(actual) });
    }
    return base;
  },
};
