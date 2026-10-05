import { z } from "zod";
import { AppError } from "../../common/errors";
import { assessOrdinaryBenefit, BENEFIT_ENGINE } from "./benefit-assessment";
import { assessOrdinaryBenefitV2, BENEFIT_ENGINE_V2 } from "./benefit-assessment-v2";
import { type LegalRuleDocument, pensionEstimateInputSchema } from "./insurance-schema";
import { assessStateBenefit, STATE_BENEFIT_ENGINE, STATE_BRANCH } from "./state-assessment";
import { ORDINARY_BRANCH } from "./benefit-assessment";
export const benefitEngineSchema = z.enum([BENEFIT_ENGINE, BENEFIT_ENGINE_V2, STATE_BENEFIT_ENGINE]);
export const benefitBranch = (engine: string) => engine === STATE_BENEFIT_ENGINE ? STATE_BRANCH : ORDINARY_BRANCH;
export function assessBenefit(history: unknown, input: z.infer<typeof pensionEstimateInputSchema>, rules: LegalRuleDocument, assessedOn: string) {
  if (rules.engineCode === BENEFIT_ENGINE) return assessOrdinaryBenefit(history, input, rules, assessedOn);
  if (rules.engineCode === BENEFIT_ENGINE_V2) return assessOrdinaryBenefitV2(history, input, rules, assessedOn);
  if (rules.engineCode === STATE_BENEFIT_ENGINE) return assessStateBenefit(history, input, rules, assessedOn);
  throw new AppError(422, "BENEFIT_ENGINE_NOT_SUPPORTED", "Phiên bản bộ tính BHXH chưa được hỗ trợ.");
}
